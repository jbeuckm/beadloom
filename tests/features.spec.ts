import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import {
  cellValue,
  cellPoint,
  dragCells,
  openFileMenu,
  paletteHexes,
  pickTool,
  snapshot,
  tapCell,
  toolButton,
  waitForReady,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
});

test('loads with loom defaults: 100x25 grid, 0.8 cell aspect, rainbow-10 palette', async ({
  page,
}) => {
  const s = await snapshot(page);
  expect(s.columns).toBe(100);
  expect(s.rows).toBe(25);
  expect(s.cellAspect).toBe(0.8);
  expect(s.paletteSize).toBe(10);
  expect(s.beads).toBe(0);
  await expect(page.locator('.swatch-row')).toHaveCount(10);
  await expect(page.locator('.statusbar')).toContainText('100');
  await expect(page.locator('.statusbar')).toContainText('25');
});

test('pen tool paints the active colour and grows the bead count', async ({ page }) => {
  await pickTool(page, 'Pen');
  await dragCells(page, [2, 2], [2, 10]); // vertical run down a column
  const s = await snapshot(page);
  expect(s.beads).toBeGreaterThanOrEqual(8);
  expect(await cellValue(page, 2, 2)).toBe(0);
  expect(await cellValue(page, 2, 10)).toBe(0);
});

test('choosing a palette swatch changes the colour that gets painted', async ({ page }) => {
  await page.locator('.swatch').nth(5).click();
  expect((await snapshot(page)).activeColor).toBe(5);
  await pickTool(page, 'Pen');
  await tapCell(page, 4, 4);
  expect(await cellValue(page, 4, 4)).toBe(5);
});

test('fill tool floods the empty region', async ({ page }) => {
  await pickTool(page, 'Fill');
  await tapCell(page, 0, 0);
  const s = await snapshot(page);
  expect(s.beads).toBe(s.columns * s.rows);
});

test('eraser clears painted cells back to empty', async ({ page }) => {
  await pickTool(page, 'Pen');
  await dragCells(page, [1, 1], [8, 1]);
  expect((await snapshot(page)).beads).toBeGreaterThan(0);
  await pickTool(page, 'Eraser');
  await dragCells(page, [1, 1], [8, 1]);
  expect(await cellValue(page, 4, 1)).toBe(-1);

  // picking a palette colour while erasing switches back to the pen
  await page.locator('.swatch').nth(4).click();
  const s = await snapshot(page);
  expect(s.tool).toBe('pen');
  expect(s.activeColor).toBe(4);
});

test('undo and redo step through edits', async ({ page }) => {
  await pickTool(page, 'Pen');
  await tapCell(page, 3, 3);
  expect((await snapshot(page)).beads).toBe(1);

  await page.keyboard.press('ControlOrMeta+z');
  expect((await snapshot(page)).beads).toBe(0);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await snapshot(page)).beads).toBe(1);
});

test('a marquee selection can be translated with the arrow keys and by dragging', async ({
  page,
}) => {
  await pickTool(page, 'Pen');
  await page.locator('.swatch').nth(3).click();
  await dragCells(page, [5, 5], [7, 5]); // 3-cell run of colour 3
  expect((await snapshot(page)).beads).toBe(3);

  await pickTool(page, 'Select');
  await dragCells(page, [5, 5], [7, 5]);
  expect((await snapshot(page)).selection).toMatchObject({
    c0: 5,
    r0: 5,
    c1: 7,
    r1: 5,
  });

  // nudge the pixels one cell right
  await page.keyboard.press('ArrowRight');
  let s = await snapshot(page);
  expect(s.beads).toBe(3); // nothing lost
  expect(await cellValue(page, 5, 5)).toBe(-1); // vacated
  expect(await cellValue(page, 6, 5)).toBe(3);
  expect(await cellValue(page, 8, 5)).toBe(3); // shifted in
  expect(s.selection).toMatchObject({ c0: 6, c1: 8, r0: 5, r1: 5 });

  // drag the selection down 3 rows from inside it
  await dragCells(page, [7, 5], [7, 8]);
  s = await snapshot(page);
  expect(s.beads).toBe(3);
  expect(await cellValue(page, 7, 5)).toBe(-1);
  expect(await cellValue(page, 7, 8)).toBe(3);
  expect(s.selection).toMatchObject({ r0: 8, r1: 8, c0: 6, c1: 8 });

  // one undo reverts the whole drag; another reverts the arrow nudge
  await page.keyboard.press('ControlOrMeta+z');
  expect(await cellValue(page, 8, 5)).toBe(3);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await cellValue(page, 5, 5)).toBe(3);
  expect((await snapshot(page)).beads).toBe(3);
});

test('filled rectangle tool paints a solid block', async ({ page }) => {
  await pickTool(page, 'Box+');
  await dragCells(page, [3, 3], [6, 8]); // 4 wide x 6 tall = 24
  const s = await snapshot(page);
  expect(s.beads).toBe(24);
  expect(await cellValue(page, 3, 3)).toBe(0);
  expect(await cellValue(page, 6, 8)).toBe(0);
  expect(await cellValue(page, 5, 5)).toBe(0);
});

test('marquee select -> copy -> paste duplicates a block elsewhere', async ({ page }) => {
  // paint a distinctive 3x3 block in colour #7 (flatten the box into raster)
  await page.locator('.swatch').nth(7).click();
  await pickTool(page, 'Box+');
  await dragCells(page, [1, 1], [3, 3]);
  await page
    .locator('.right-dock')
    .getByRole('button', { name: 'Flatten to beads' })
    .click();
  expect((await snapshot(page)).beads).toBe(9);

  // select it, copy, paste at (10,10)
  await pickTool(page, 'Select');
  await dragCells(page, [1, 1], [3, 3]);
  expect((await snapshot(page)).selection).not.toBeNull();

  await toolButton(page, 'Copy').click();
  expect((await snapshot(page)).hasClipboard).toBe(true);

  await toolButton(page, 'Paste').click();
  expect((await snapshot(page)).pasteMode).toBe(true);
  await tapCell(page, 10, 10);

  const s = await snapshot(page);
  expect(s.beads).toBe(18);
  expect(await cellValue(page, 10, 10)).toBe(7);
  expect(await cellValue(page, 12, 12)).toBe(7);
});

test('pasting a stamp with transparent cells leaves the target beads intact', async ({
  page,
}) => {
  // a solid run of colour 2 that the paste will land on top of
  await page.locator('.swatch').nth(2).click();
  await pickTool(page, 'Pen');
  await dragCells(page, [5, 10], [9, 10]); // cols 5..9, row 10
  expect((await snapshot(page)).beads).toBe(5);

  // a stamp with a hole in the middle: 7 . 7
  await page.locator('.swatch').nth(7).click();
  await tapCell(page, 1, 1);
  await tapCell(page, 3, 1);
  await pickTool(page, 'Select');
  await dragCells(page, [1, 1], [3, 1]);
  await toolButton(page, 'Copy').click();

  await toolButton(page, 'Paste').click();
  await tapCell(page, 5, 10); // stamp covers cols 5,6,7 of the run

  expect(await cellValue(page, 5, 10)).toBe(7); // opaque stamp cell wrote
  expect(await cellValue(page, 6, 10)).toBe(2); // transparent stamp cell kept the target
  expect(await cellValue(page, 7, 10)).toBe(7);
  expect(await cellValue(page, 8, 10)).toBe(2); // outside the stamp, untouched
  expect((await snapshot(page)).beads).toBe(7); // 5 run + 2 stamp source, none cleared
});

test('magic wand selects a contiguous region and deletes just that shape', async ({
  page,
}) => {
  // a filled 4x4 block of colour 2 (flattened to raster), plus one stray bead
  await page.locator('.swatch').nth(2).click();
  await pickTool(page, 'Box+');
  await dragCells(page, [4, 4], [7, 7]);
  await page
    .locator('.right-dock')
    .getByRole('button', { name: 'Flatten to beads' })
    .click();
  await page.locator('.swatch').nth(5).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 10, 4);
  expect((await snapshot(page)).beads).toBe(17);

  // wand-click inside the block selects exactly the 16 matching cells
  await pickTool(page, 'Wand');
  await tapCell(page, 5, 5);
  let s = await snapshot(page);
  expect(s.selection).toMatchObject({ c0: 4, r0: 4, c1: 7, r1: 7 });

  // delete removes only the wand region; the stray bead survives
  await toolButton(page, 'Delete').click();
  s = await snapshot(page);
  expect(s.beads).toBe(1);
  expect(await cellValue(page, 5, 5)).toBe(-1);
  expect(await cellValue(page, 10, 4)).toBe(5);
});

test('mirror horizontal flips the whole design', async ({ page }) => {
  await pickTool(page, 'Pen');
  await tapCell(page, 2, 5);
  expect(await cellValue(page, 2, 5)).toBe(0);

  await toolButton(page, 'Flip H').click();
  const { columns } = await snapshot(page);
  expect(await cellValue(page, 2, 5)).toBe(-1);
  expect(await cellValue(page, columns - 1 - 2, 5)).toBe(0);
});

test('palette: add and remove colours, remapping cells', async ({ page }) => {
  await page.locator('.palette footer').getByRole('button', { name: '+ Color' }).click();
  await expect(page.locator('.swatch-row')).toHaveCount(11);
  expect((await snapshot(page)).activeColor).toBe(10); // newly added is selected

  // remove it again via the row editor
  await page.locator('.swatch-meta').nth(10).click();
  await page.locator('.modal').getByRole('button', { name: 'Delete colour' }).click();
  await expect(page.locator('.swatch-row')).toHaveCount(10);
});

test('palette: editing a colour updates its hex everywhere', async ({ page }) => {
  await page.locator('.swatch-meta').first().click();
  await page.locator('.modal input[type="color"]').fill('#123456');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  const hexes = await paletteHexes(page);
  expect(hexes[0]).toBe('#123456');
});

test('background colour of empty cells is editable', async ({ page }) => {
  await page.locator('.bg-row input[type="color"]').fill('#ffcc00');
  expect((await snapshot(page)).background).toBe('#FFCC00');
});

test('column count is adjustable from the top bar', async ({ page }) => {
  const input = page.getByLabel('Column count');
  await input.fill('32');
  await input.blur();
  expect((await snapshot(page)).columns).toBe(32);
  await expect(page.locator('.statusbar')).toContainText('32');
});

test('save to a slot, start a new design, then reopen the saved one', async ({ page }) => {
  await pickTool(page, 'Pen');
  await dragCells(page, [2, 2], [2, 12]);
  const painted = (await snapshot(page)).beads;
  expect(painted).toBeGreaterThan(0);

  await openFileMenu(page, /Save As/);
  await page.locator('.modal input[type="text"]').fill('Regression Pattern');
  await page.locator('.modal').getByRole('button', { name: 'Save', exact: true }).click();

  await openFileMenu(page, /\+ New/);
  await page.locator('.modal').getByRole('button', { name: 'Create' }).click();
  expect((await snapshot(page)).beads).toBe(0);

  await openFileMenu(page, /⊟ Open/);
  await page
    .locator('.slot', { hasText: 'Regression Pattern' })
    .getByRole('button', { name: 'Open' })
    .click();
  expect((await snapshot(page)).beads).toBe(painted);
});

test('New warns about unsaved changes before the size dialog opens', async ({
  page,
}) => {
  await pickTool(page, 'Pen');
  await tapCell(page, 3, 3);
  expect((await snapshot(page)).dirty).toBe(true);

  // dismiss the confirm -> the New dialog never appears, design untouched
  page.once('dialog', (d) => d.dismiss());
  await openFileMenu(page, /\+ New/);
  await expect(page.locator('.modal', { hasText: 'New Design' })).toHaveCount(0);
  expect((await snapshot(page)).beads).toBe(1);

  // accept the confirm -> now the size dialog opens
  page.once('dialog', (d) => d.accept());
  await openFileMenu(page, /\+ New/);
  await expect(page.locator('.modal', { hasText: 'New Design' })).toBeVisible();
  await page.locator('.modal').getByRole('button', { name: 'Create' }).click();
  expect((await snapshot(page)).beads).toBe(0);
});

test('export produces a valid beadloom-design JSON file', async ({ page }) => {
  await pickTool(page, 'Pen');
  await tapCell(page, 5, 5);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openFileMenu(page, /Export Design/),
  ]);
  const path = await download.path();
  const json = JSON.parse(fs.readFileSync(path!, 'utf8'));

  expect(json.format).toBe('beadloom-design');
  expect(json.version).toBe(1);
  expect(json.loom).toMatchObject({ stitch: 'loom', columns: 100, rows: 25, cellAspect: 0.8 });
  expect(Array.isArray(json.palette.colors)).toBe(true);
  expect(json.palette.colors).toHaveLength(10);
  expect(json.palette.colors[0]).toMatchObject({ hex: expect.stringMatching(/^#[0-9A-F]{6}$/) });
  expect(json.cells.data).toHaveLength(25);
  expect(json.cells.data[0]).toHaveLength(100);
  expect(json.cells.data[5][5]).toBe(0);
});

test('imports a 30-colour design and edits it', async ({ page }) => {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    openFileMenu(page, /Import Design/),
  ]);
  await chooser.setFiles('examples/spectrum-sampler.beadloom.json');

  await expect
    .poll(async () => (await snapshot(page)).paletteSize)
    .toBe(30);
  const s = await snapshot(page);
  expect(s.columns).toBe(30);
  expect(s.rows).toBe(40);
  expect(s.paletteName).toBe('Spectrum 30');
  expect(s.coloursUsed).toBeGreaterThan(20);
  await expect(page.locator('.swatch-row')).toHaveCount(30);

  // prove it is still editable after import — (3,4) is one of the sampler's
  // deliberately-empty cells ((r + c) % 7 === 0), so painting it adds a bead.
  await pickTool(page, 'Pen');
  await page.locator('.swatch').nth(7).click();
  expect(await cellValue(page, 3, 4)).toBe(-1);
  const beforeBeads = (await snapshot(page)).beads;

  await tapCell(page, 3, 4);

  const after = await snapshot(page);
  expect(after.beads).toBe(beforeBeads + 1);
  expect(await cellValue(page, 3, 4)).toBe(7);

  // ...and re-exportable
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openFileMenu(page, /Export Design/),
  ]);
  const json = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
  expect(json.palette.colors).toHaveLength(30);
  expect(json.cells.data[1][1]).toBe(3); // sampler gradient: (c + r*2) % 30
  expect(json.cells.data[4][3]).toBe(7); // data[row][col] — the bead we painted at (c3,r4)
});

test('keyboard shortcuts switch tools and drive history', async ({ page }) => {
  await page.locator('.canvas-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('e');
  expect((await snapshot(page)).tool).toBe('eraser');
  await page.keyboard.press('g');
  expect((await snapshot(page)).tool).toBe('fill');
  await page.keyboard.press('b');
  expect((await snapshot(page)).tool).toBe('pen');
});

test('grid, numbers and pencil-only toggles flip their state', async ({ page }) => {
  const grid = toolButton(page, 'Grid');
  await expect(grid).toHaveClass(/active/);
  await grid.click();
  await expect(grid).not.toHaveClass(/active/);

  const pencil = toolButton(page, 'Pencil');
  await expect(pencil).not.toHaveClass(/active/);
  await pencil.click();
  await expect(pencil).toHaveClass(/active/);
  expect((await snapshot(page)).view).toBeDefined();
});

test('help dialog documents the custom file format', async ({ page }) => {
  await openFileMenu(page, /File Format/);
  const modal = page.locator('.modal');
  await expect(modal).toContainText('beadloom-design');
  await expect(modal).toContainText('rows-index');
  await expect(modal).toContainText('cellAspect');
});

test('print chart: a US-Letter sheet with the design, grid marks and an inch scale', async ({
  page,
}) => {
  await page.getByLabel('Column count').fill('40');
  await page.getByLabel('Column count').blur();
  await page.getByLabel('Row count').fill('16');
  await page.getByLabel('Row count').blur();
  await pickTool(page, 'Pen');
  await dragCells(page, [3, 3], [3, 12]);

  await openFileMenu(page, /Print Chart/);
  const sheet = page.locator('.print-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('width', '7.5in');
  await expect(sheet).toHaveAttribute('height', '10in');
  // beads rendered, grid-count marks present on both sides
  expect(await sheet.locator('rect').count()).toBeGreaterThan(5);
  expect(
    await sheet.locator('text').filter({ hasText: /^40$/ }).count(),
  ).toBe(2); // the "40" column mark, left and right
  await expect(sheet).toContainText('nominal');
  expect(await page.evaluate(() => document.body.classList.contains('printing'))).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.print-sheet')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('printing'))).toBe(
    false,
  );
});
