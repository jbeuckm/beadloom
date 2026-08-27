import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import {
  cellValue,
  dragCells,
  openFileMenu,
  paletteHexes,
  pickTool,
  PX_PER_COL,
  snapshot,
  tapCell,
  toolButton,
  waitForReady,
} from './helpers';

/**
 * One long end-to-end pass that touches most of BeadLoom Studio's surface and
 * asserts the outcome of every step:
 *
 *   painting (pen / eraser)                    · shapes (line / rect / rectFill)
 *   flood fill + eyedropper                    · marquee select
 *   copy / paste / cut / delete / select-all   · flip H·V + rotate 180 (whole & selection)
 *   palette add / edit / delete + background   · grid resize (steppers, edge handle, dialog)
 *   undo / redo                                · working-row highlight
 *   zoom shortcuts                             · export JSON round-trip
 *   Save-As slot → New → Open round-trip       · autosave survives a reload
 *   grid / numbers / pencil toggles
 */
test('comprehensive: every major feature in a single session', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await waitForReady(page);

  // === 1. Loads with loom defaults ========================================
  {
    const s = await snapshot(page);
    expect(s.columns).toBe(100);
    expect(s.rows).toBe(25);
    expect(s.cellAspect).toBe(0.8);
    expect(s.paletteSize).toBe(10);
    expect(s.beads).toBe(0);
  }

  // === 2. Pen paints the active colour, eraser clears it =================
  await pickTool(page, 'Pen');
  await page.locator('.swatch').nth(3).click();
  expect((await snapshot(page)).activeColor).toBe(3);
  await dragCells(page, [6, 4], [6, 18]); // vertical run down column 6
  expect(await cellValue(page, 6, 4)).toBe(3);
  expect(await cellValue(page, 6, 18)).toBe(3);
  expect((await snapshot(page)).beads).toBeGreaterThanOrEqual(14);

  await pickTool(page, 'Eraser');
  await dragCells(page, [6, 4], [6, 10]);
  expect(await cellValue(page, 6, 6)).toBe(-1);
  expect(await cellValue(page, 6, 18)).toBe(3); // untouched part survives

  // === 3. Start a fresh, smaller design ==================================
  await openFileMenu(page, /^\+ New/);
  await page.locator('.modal input[type="text"]').first().fill('Feature Demo');
  await page.locator('.modal .row2 input[type="number"]').first().fill('60');
  await page.locator('.modal .row2 input[type="number"]').nth(1).fill('40');
  await page.locator('.modal').getByRole('button', { name: 'Create' }).click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
  {
    const s = await snapshot(page);
    expect(s.columns).toBe(60);
    expect(s.rows).toBe(40);
    expect(s.beads).toBe(0);
    expect(s.name).toBe('Feature Demo');
    expect(s.paletteSize).toBe(10); // "keep current palette" is on by default
  }

  // === 4. Shapes: filled rect, outline rect, line ======================
  await pickTool(page, 'Box+'); // filled rectangle
  await page.locator('.swatch').nth(1).click();
  await dragCells(page, [24, 20], [30, 26]); // 7 x 7 solid block
  expect((await snapshot(page)).beads).toBe(49);
  expect(await cellValue(page, 24, 20)).toBe(1);
  expect(await cellValue(page, 27, 23)).toBe(1);
  expect(await cellValue(page, 30, 26)).toBe(1);

  await pickTool(page, 'Box'); // outline rectangle
  await page.locator('.swatch').nth(2).click();
  await dragCells(page, [10, 5], [18, 12]);
  expect(await cellValue(page, 10, 5)).toBe(2); // corner drawn
  expect(await cellValue(page, 18, 12)).toBe(2);
  expect(await cellValue(page, 14, 8)).toBe(-1); // interior stays empty

  await pickTool(page, 'Line');
  await page.locator('.swatch').nth(4).click();
  await dragCells(page, [5, 34], [15, 34]); // horizontal run
  expect(await cellValue(page, 5, 34)).toBe(4);
  expect(await cellValue(page, 10, 34)).toBe(4);
  expect(await cellValue(page, 15, 34)).toBe(4);

  // === 5. Flood fill + eyedropper ======================================
  const beforeFill = (await snapshot(page)).beads;
  await pickTool(page, 'Fill');
  await page.locator('.swatch').nth(6).click();
  await tapCell(page, 0, 0); // floods the connected empty background
  const afterFill = await snapshot(page);
  expect(afterFill.beads).toBeGreaterThan(beforeFill + 1000);
  expect(await cellValue(page, 0, 0)).toBe(6);

  await pickTool(page, 'Pick'); // eyedropper
  await tapCell(page, 10, 34); // sample the line (colour 4)
  expect((await snapshot(page)).activeColor).toBe(4);

  // === 6. Marquee select → copy → paste ================================
  await pickTool(page, 'Select');
  await dragCells(page, [24, 20], [30, 26]); // around the solid block
  {
    const s = await snapshot(page);
    expect(s.selection).toMatchObject({ c0: 24, r0: 20, c1: 30, r1: 26 });
  }
  await expect(page.locator('.statusbar')).toContainText('7×7'); // selection readout

  await page.keyboard.press('ControlOrMeta+c');
  {
    const s = await snapshot(page);
    expect(s.hasClipboard).toBe(true);
    expect(s.clipboard).toEqual({ w: 7, h: 7 });
  }

  await page.keyboard.press('ControlOrMeta+v');
  expect((await snapshot(page)).pasteMode).toBe(true);
  await tapCell(page, 40, 20); // drop the stamp here
  {
    const s = await snapshot(page);
    expect(s.pasteMode).toBe(true); // stays armed for repeat stamping
    expect(s.selection).toMatchObject({ c0: 40, r0: 20, c1: 46, r1: 26 });
  }
  expect(await cellValue(page, 43, 23)).toBe(1); // block duplicated

  await page.keyboard.press('Escape');
  {
    const s = await snapshot(page);
    expect(s.pasteMode).toBe(false);
    expect(s.selection).toBeNull();
  }

  // === 7. Delete + cut a selection ====================================
  await pickTool(page, 'Select');
  await dragCells(page, [24, 20], [30, 26]);
  await page.keyboard.press('Delete');
  expect(await cellValue(page, 27, 23)).toBe(-1); // original block cleared

  await dragCells(page, [40, 20], [46, 26]);
  await page.keyboard.press('ControlOrMeta+x');
  expect(await cellValue(page, 43, 23)).toBe(-1); // pasted copy cut away
  expect((await snapshot(page)).clipboard).toEqual({ w: 7, h: 7 });

  // === 8. Select-all ==================================================
  await page.keyboard.press('ControlOrMeta+a');
  {
    const s = await snapshot(page);
    expect(s.tool).toBe('select');
    expect(s.selection).toEqual({ c0: 0, r0: 0, c1: 59, r1: 39 });
  }
  await page.keyboard.press('Escape');

  // === 9. Transforms on the whole design ============================
  await pickTool(page, 'Pen');
  await page.locator('.swatch').nth(8).click();
  await tapCell(page, 4, 3); // a single asymmetric marker bead
  expect(await cellValue(page, 4, 3)).toBe(8);

  await toolButton(page, 'Flip H').click(); // no selection → whole design
  expect(await cellValue(page, 55, 3)).toBe(8); // 60-1-4
  expect(await cellValue(page, 4, 3)).not.toBe(8);

  await toolButton(page, 'Flip V').click();
  expect(await cellValue(page, 55, 36)).toBe(8); // 40-1-3

  await toolButton(page, 'Rot 180').click();
  expect(await cellValue(page, 4, 3)).toBe(8); // back to the start

  // === 10. Transform limited to a selection =========================
  await page.locator('.swatch').nth(9).click();
  await tapCell(page, 10, 15); // left edge of a 5-wide band
  expect(await cellValue(page, 10, 15)).toBe(9);
  const outsideBefore = await cellValue(page, 20, 15);

  await pickTool(page, 'Select');
  await dragCells(page, [10, 15], [14, 17]);
  await toolButton(page, 'Flip H').click(); // selection present → selection only
  expect(await cellValue(page, 14, 15)).toBe(9); // moved to the far edge of the band
  expect(await cellValue(page, 20, 15)).toBe(outsideBefore); // outside untouched
  await page.keyboard.press('Escape');

  // === 11. Palette: add, edit, delete, background ===================
  await page.locator('.palette footer').getByRole('button', { name: '+ Color' }).click();
  await expect(page.locator('.swatch-row')).toHaveCount(11);
  expect((await snapshot(page)).activeColor).toBe(10); // new colour auto-selected

  await page.locator('.swatch-meta').nth(0).click();
  await page.locator('.modal input[type="text"]').first().fill('Cardinal');
  await page.locator('.modal input[type="color"]').fill('#abcdef');
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  expect((await paletteHexes(page))[0]).toBe('#ABCDEF');

  await page.locator('.swatch-meta').nth(10).click(); // the colour we added
  await page.locator('.modal').getByRole('button', { name: 'Delete colour' }).click();
  await expect(page.locator('.swatch-row')).toHaveCount(10);

  await page.locator('.bg-row input[type="color"]').fill('#ff8800');
  expect((await snapshot(page)).background).toBe('#FF8800');

  // === 12. Grid resize three ways ==================================
  const colInput = page.locator('.dim-group', { hasText: 'Cols' }).locator('input');
  await colInput.fill('50');
  await colInput.blur();
  expect((await snapshot(page)).columns).toBe(50);

  const rowInput = page.locator('.dim-group', { hasText: 'Rows' }).locator('input');
  await rowInput.fill('34');
  await rowInput.blur();
  expect((await snapshot(page)).rows).toBe(34);

  {
    const before = await snapshot(page);
    const box = await page.locator('.edge-handle.right').boundingBox();
    const scale = PX_PER_COL * before.view.zoom;
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 4 * scale, cy, { steps: 16 });
    await page.mouse.up();
    const after = await snapshot(page);
    expect(after.columns).toBeGreaterThan(before.columns + 1);
    expect(after.columns).toBeLessThanOrEqual(before.columns + 6);
  }

  await openFileMenu(page, /Resize Grid/);
  await page.locator('.modal .row2 input[type="number"]').first().fill('50');
  await page.locator('.modal .row2 input[type="number"]').nth(1).fill('30');
  await page.locator('.modal').getByRole('button', { name: 'Apply' }).click();
  {
    const s = await snapshot(page);
    expect(s.columns).toBe(50);
    expect(s.rows).toBe(30);
    expect(await cellValue(page, 4, 3)).toBe(8); // top-left content is anchored
  }

  // === 13. Undo / redo ==========================================
  {
    const u0 = (await snapshot(page)).undo;
    expect(u0).toBeGreaterThan(0);
    await page.keyboard.press('ControlOrMeta+z');
    const mid = await snapshot(page);
    expect(mid.undo).toBe(u0 - 1);
    expect(mid.redo).toBeGreaterThan(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect((await snapshot(page)).undo).toBe(u0);
  }

  // === 14. Working-row highlight (left gutter tap) ==============
  await pickTool(page, 'Pen');
  await page.keyboard.press('0'); // fit, so the gutter sits at a predictable x
  {
    const s = await snapshot(page);
    const box = await page.locator('.canvas-wrap canvas').boundingBox();
    const sc = PX_PER_COL * s.view.zoom;
    const gx = box!.x + Math.max(4, s.view.panX - 8); // just left of column 0
    const gy = box!.y + s.view.panY + (5 + 0.5) * sc * 0.8; // row 5 band
    await page.mouse.click(gx, gy);
    expect((await snapshot(page)).highlightRow).toBe(5);
    await page.mouse.click(gx, gy); // tapping again clears it
    expect((await snapshot(page)).highlightRow).toBeNull();
  }

  // === 15. Zoom shortcuts ======================================
  {
    const z0 = (await snapshot(page)).view.zoom;
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    const zIn = (await snapshot(page)).view.zoom;
    expect(zIn).toBeGreaterThan(z0);
    await page.keyboard.press('[');
    expect((await snapshot(page)).view.zoom).toBeLessThan(zIn);
    await page.keyboard.press('0'); // refit
  }

  // === 16. Export JSON round-trips the live design =============
  const live = await snapshot(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openFileMenu(page, /Export Design/),
  ]);
  const json = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
  expect(json.format).toBe('beadloom-design');
  expect(json.version).toBe(1);
  expect(json.loom).toMatchObject({ stitch: 'loom', columns: 50, rows: 30, cellAspect: 0.8 });
  expect(json.background).toBe('#FF8800');
  expect(json.palette.colors).toHaveLength(live.paletteSize);
  expect(json.cells.data).toHaveLength(30);
  expect(json.cells.data[0]).toHaveLength(50);
  expect(json.cells.data[3][4]).toBe(8);

  // === 17. Save to a slot → New → reopen the slot =============
  await openFileMenu(page, /Save As/);
  await page.locator('.modal input[type="text"]').fill('Feature Demo E2E');
  await page.locator('.modal').getByRole('button', { name: 'Save', exact: true }).click();

  await openFileMenu(page, /^\+ New/);
  await page.locator('.modal').getByRole('button', { name: 'Create' }).click();
  {
    const s = await snapshot(page);
    expect(s.beads).toBe(0);
    expect(s.columns).toBe(100); // back to defaults
  }

  await openFileMenu(page, /⊟ Open/);
  await page
    .locator('.slot', { hasText: 'Feature Demo E2E' })
    .getByRole('button', { name: 'Open' })
    .click();
  {
    const s = await snapshot(page);
    expect(s.columns).toBe(50);
    expect(s.rows).toBe(30);
    expect(s.name).toBe('Feature Demo E2E');
    expect(await cellValue(page, 4, 3)).toBe(8);
  }

  // === 18. Autosave survives a full page reload ==============
  await pickTool(page, 'Pen');
  await page.locator('.swatch').nth(2).click();
  await tapCell(page, 7, 7);
  expect(await cellValue(page, 7, 7)).toBe(2);
  await page.waitForTimeout(900); // let the 600ms-debounced autosave flush

  await page.reload();
  await waitForReady(page);
  {
    const s = await snapshot(page);
    expect(s.columns).toBe(50);
    expect(s.rows).toBe(30);
    expect(s.name).toBe('Feature Demo E2E');
    expect(await cellValue(page, 7, 7)).toBe(2);
    expect(await cellValue(page, 4, 3)).toBe(8);
  }

  // === 19. View toggles flip their state ===================
  for (const label of ['Grid', 'Numbers', 'Pencil'] as const) {
    const btn = toolButton(page, label);
    const wasActive = await btn.evaluate((el) => el.classList.contains('active'));
    await btn.click();
    if (wasActive) await expect(btn).not.toHaveClass(/active/);
    else await expect(btn).toHaveClass(/active/);
  }
  {
    const s = await snapshot(page);
    expect(s.settings.showGrid).toBe(false);
    expect(s.settings.showRowNumbers).toBe(false);
    expect(s.settings.pencilOnly).toBe(true);
  }

  console.log('✓ comprehensive feature pass complete');
});
