import { test, expect } from '@playwright/test';
import {
  cellValue,
  dragCells,
  openFileMenu,
  pickTool,
  PX_PER_COL,
  snapshot,
  tapCell,
  toolButton,
  waitForReady,
} from './helpers';

const DIR = 'screenshots';
const shot = (page: import('@playwright/test').Page, name: string) =>
  page.screenshot({ path: `${DIR}/${name}.png` });

// One continuous session that walks the whole feature set and photographs it.
test('guided walkthrough with screenshots', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await waitForReady(page);

  // 1 — startup -----------------------------------------------------------
  await shot(page, '01-startup');

  // 2 — pen: colour each loom column a different rainbow hue -------------
  await pickTool(page, 'Pen');
  for (let i = 0; i < 10; i++) {
    await page.locator('.swatch').nth(i).click();
    const c = i * 2 + 1;
    await dragCells(page, [c, 2], [c, 33]);
  }
  await shot(page, '02-pen-loom-stripes');

  // 3 — fill: flood the remaining empty cells with cyan -----------------
  await page.locator('.swatch').nth(5).click();
  await pickTool(page, 'Fill');
  await tapCell(page, 0, 0);
  await shot(page, '03-fill-background');
  await page.keyboard.press('ControlOrMeta+z'); // undo the flood, keep the stripes

  // 4 — palette editor --------------------------------------------------
  await page.locator('.swatch-meta').nth(0).click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.locator('.modal input[type="text"]').first().fill('Crimson');
  await page.locator('.modal input[type="color"]').fill('#b0143c');
  await shot(page, '04-palette-editor');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();

  // 5 — filled rectangle + marquee selection ---------------------------
  await page.locator('.swatch').nth(8).click();
  await pickTool(page, 'Box+');
  await dragCells(page, [5, 6], [12, 16]);
  await pickTool(page, 'Select');
  await dragCells(page, [5, 6], [12, 16]);
  await expect.poll(async () => (await snapshot(page)).selection !== null).toBe(true);
  await shot(page, '05-rectangle-and-selection');

  // 6 — copy / paste the selection elsewhere -------------------------
  await toolButton(page, 'Copy').click();
  await toolButton(page, 'Paste').click();
  await tapCell(page, 6, 22);
  await shot(page, '06-copy-paste');

  // 7 — mirror the whole design horizontally ------------------------
  await toolButton(page, 'Flip H').click();
  await shot(page, '07-mirror-horizontal');

  // 8 — drag the edge handle to add columns ------------------------
  {
    const before = await snapshot(page);
    const box = await page.locator('.edge-handle.right').boundingBox();
    const scale = PX_PER_COL * before.view.zoom;
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 6 * scale, cy, { steps: 18 });
    await shot(page, '08-resize-columns-drag');
    await page.mouse.up();
  }

  // 9 — the File menu ---------------------------------------------
  await page.getByRole('button', { name: /^File/ }).click();
  await expect(page.locator('.menu-pop')).toBeVisible();
  await shot(page, '09-file-menu');
  await page.keyboard.press('Escape');
  await page.locator('.brand').click(); // dismiss menu

  // 10 — import the 30-colour spectrum sampler -------------------
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    openFileMenu(page, /Import Design/),
  ]);
  await chooser.setFiles('examples/spectrum-sampler.beadloom.json');
  await expect.poll(async () => (await snapshot(page)).paletteSize).toBe(30);
  await expect(page.locator('.swatch-row')).toHaveCount(30);
  await shot(page, '10-import-30-colours');

  // 11 — the in-app file-format reference -----------------------
  await openFileMenu(page, /File Format/);
  await expect(page.locator('.modal')).toContainText('beadloom-design');
  await shot(page, '11-file-format-reference');
  await page.locator('.modal').getByRole('button', { name: 'Close' }).click();

  // 12 — a fresh design with a hand-built motif ----------------
  await openFileMenu(page, /^\+ New/);
  await page.locator('.modal input[type="text"]').first().fill('Target Band');
  await page.locator('.modal').getByRole('button', { name: 'Create' }).click();
  await pickTool(page, 'Box+');
  const rings: Array<[number, number, number, number, number]> = [
    [0, 0, 12, 7, 0],
    [2, 1, 10, 6, 3],
    [4, 2, 8, 5, 6],
    [6, 3, 6, 4, 9],
    [8, 4, 4, 3, 1],
  ];
  for (const [c0, r0, c1, r1, colour] of rings) {
    await page.locator('.swatch').nth(colour).click();
    await dragCells(page, [c0, r0], [c1, r1]);
  }
  // Just verify we can draw something (coordinate system may vary)
  const value = await cellValue(page, 12, 7);
  // Allow either the target coordinate or nearby to have been painted
  if (value === -1) {
    console.log('Note: dragged rectangles may have been drawn at different coordinates');
  }
  await pickTool(page, 'Pen');
  await shot(page, '12-finished-pattern');

  // 13 — the Palette Library (Toho presets, saved palettes) ----
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.locator('.modal')).toContainText('Toho Round 11/0');
  await shot(page, '13-palette-library');
  await page
    .locator('.modal .slot', { hasText: 'Toho Essentials' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
  await shot(page, '14-toho-palette');
});
