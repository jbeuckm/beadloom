import { test, expect } from '@playwright/test';
import {
  cellPoint,
  cellValue,
  dragCells,
  pickTool,
  refHandles,
  snapshot,
  tapCell,
  toolButton,
  waitForReady,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
});

// ---------------------------------------------------------------------------
test('Cellular automata: runs inside a selection, else on a fresh layer', async ({
  page,
}) => {
  await pickTool(page, 'Pen');
  await dragCells(page, [5, 5], [7, 5]); // horizontal 3-cell blinker in colour 0
  expect((await snapshot(page)).beads).toBe(3);
  const rasterLayers0 = (await snapshot(page)).layers.filter(
    (l) => l.kind === 'raster',
  ).length;

  // --- with a selection, the sim evolves those cells in place -------------
  await page.evaluate(() =>
    (window as any).__beadloom
      .getState()
      .setSelection({ c0: 4, r0: 4, c1: 8, r1: 6 }),
  );
  await pickTool(page, 'Cells');
  const modal = page.locator('.right-dock', { hasText: 'Cellular Automata' });
  await expect(modal).toBeVisible();
  await modal.getByRole('combobox').first().selectOption('conway');
  await modal.getByRole('button', { name: 'Step' }).click();

  // horizontal -> vertical, confined to the selection, no new layer
  expect(await cellValue(page, 6, 5)).toBe(0); // centre survives
  expect(await cellValue(page, 6, 4)).toBe(0); // born above
  expect(await cellValue(page, 6, 6)).toBe(0); // born below
  expect(await cellValue(page, 5, 5)).toBe(-1); // ends died
  expect(await cellValue(page, 7, 5)).toBe(-1);
  let s = await snapshot(page);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(rasterLayers0);
  expect(s.beads).toBe(3);

  await modal.getByRole('button', { name: 'Step' }).click();
  // vertical -> horizontal again
  expect(await cellValue(page, 5, 5)).toBe(0);
  expect(await cellValue(page, 6, 4)).toBe(-1);

  // --- no selection: seeding starts a fresh full-grid layer --------------
  await page.evaluate(() =>
    (window as any).__beadloom.getState().setSelection(null),
  );
  await modal.getByRole('button', { name: 'Seed grid' }).click();
  s = await snapshot(page);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(
    rasterLayers0 + 1,
  );
  expect(s.beads).toBeGreaterThan(50);
  // the seeded layer is the new active one; the blinker layer sits beneath it
  const rasters = s.layers.filter((l) => l.kind === 'raster');
  expect(rasters[rasters.length - 1].id).toBe(s.activeLayer);
  expect(rasters[0].id).not.toBe(s.activeLayer);

  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(modal).toBeHidden();

  // undo the seed -> the fresh layer's fill reverts, blinker layer intact
  await page.keyboard.press('ControlOrMeta+z');
  s = await snapshot(page);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(rasterLayers0);
  expect(await cellValue(page, 5, 5)).toBe(0);
  expect(await cellValue(page, 6, 5)).toBe(0);
  expect(await cellValue(page, 7, 5)).toBe(0);
  expect(await cellValue(page, 6, 4)).toBe(-1);
});

// ---------------------------------------------------------------------------
test('Cellular automata: rule catalogue + a 1-D Wolfram tapestry', async ({
  page,
}) => {
  await pickTool(page, 'Cells');
  const modal = page.locator('.right-dock', { hasText: 'Cellular Automata' });
  await expect(modal).toBeVisible();
  const ruleSelect = modal.getByRole('combobox').first();

  // defaults to Wolfram's Rule 30, with an explanation + a Wolfram-class tag
  await expect(ruleSelect).toHaveValue('w30');
  await expect(modal.locator('.rule-blurb')).toContainText(
    'random-number generator',
  );
  await expect(modal.locator('.rule-class')).toHaveText('Class 3');
  await expect(
    modal.getByRole('button', { name: 'Seed top row' }),
  ).toBeVisible();

  // seed the single top-row cell, then paint several generations downward
  await modal.getByRole('button', { name: 'Seed top row' }).click();
  expect((await snapshot(page)).beads).toBe(1);
  for (let i = 0; i < 8; i++)
    await modal.getByRole('button', { name: 'Step' }).click();
  const s = await snapshot(page);
  expect(s.beads).toBeGreaterThan(8); // a spreading triangle of noise
  expect(await cellValue(page, 50, 0)).toBeGreaterThanOrEqual(0); // seed row kept
  expect(await cellValue(page, 50, 4)).toBeGreaterThanOrEqual(0); // rows filled in

  // switching to a 2-D rule swaps the controls and the explanation
  await ruleSelect.selectOption('seeds');
  await expect(modal.locator('.rule-blurb')).toContainText('detonates');
  await expect(modal.getByRole('button', { name: 'Seed grid' })).toBeVisible();

  // the custom escape hatch still exposes a raw B/S field
  await ruleSelect.selectOption('custom');
  await expect(modal.locator('input[aria-invalid]')).toHaveValue('B3/S23');

  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(modal).toBeHidden();
});

// ---------------------------------------------------------------------------
test('Selburose: engaging the tool drops a live, re-editable star', async ({
  page,
}) => {
  await page.locator('.swatch').nth(3).click();
  expect((await snapshot(page)).activeColor).toBe(3);
  const before = await snapshot(page);
  const rasterLayers0 = before.layers.filter((l) => l.kind === 'raster').length;

  // engaging the tool immediately places a star + opens the docked panel
  await pickTool(page, 'Selburose');
  const editor = page.locator('.right-dock', { hasText: 'Selburose' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Place' })).toHaveCount(0);

  let s = await snapshot(page);
  expect(s.rightPanel).toBe('selburose');
  expect(s.selburoses.length).toBe(1);
  expect(s.layers.filter((l) => l.kind === 'selburose').length).toBe(1);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(rasterLayers0);
  expect(s.rasterBeads).toBe(before.rasterBeads); // no pixels written
  expect(s.beads).toBeGreaterThan(0); // but it shows in the composite
  expect(s.selectedSelburoseId).toBe(s.selburoses[0].id);
  expect(s.editingSelburose).toBe(s.selburoses[0].id);
  expect(s.tool).toBe('select'); // ready to drag it
  expect(s.selburoses[0].colorIndex).toBe(3);

  const id = s.selburoses[0].id;

  // Alignment radios flip cell <-> border and re-snap the object
  await editor.locator('.selburose-align').getByLabel('Edge').check();
  s = await snapshot(page);
  expect(s.selburoses[0].center).toBe('border');
  expect(s.selburoses[0].cx % 1).toBeCloseTo(0);
  await editor.locator('.selburose-align').getByLabel('Center').check();
  const rot = editor
    .locator('.field', { hasText: 'Rotation' })
    .locator('input[type=range]');
  await rot.fill('30');
  expect((await snapshot(page)).selburoses[0].rotationDeg).toBe(30);

  // holding Shift snaps the rotation slider to 15° increments
  await page.keyboard.down('Shift');
  await rot.fill('37');
  await page.keyboard.up('Shift');
  expect((await snapshot(page)).selburoses[0].rotationDeg).toBe(30);
  await rot.fill('30'); // leave it where the rest of the test expects

  await editor.getByRole('button', { name: 'Done' }).click();
  await expect(editor).toBeHidden();
  expect((await snapshot(page)).selburoses[0].rotationDeg).toBe(30);

  // still selected: palette + transform buttons act on the star
  expect((await snapshot(page)).selectedSelburoseId).toBe(id);
  await page.locator('.swatch').nth(5).click();
  expect((await snapshot(page)).selburoses[0].colorIndex).toBe(5);
  await toolButton(page, 'Flip H').click();
  expect((await snapshot(page)).selburoses[0].rotationDeg).toBe(-30);

  // reopen via double-tap on the star, then flatten it to real pixels
  const p = await cellPoint(page, Math.round(s.selburoses[0].cx), Math.round(s.selburoses[0].cy));
  await page.mouse.dblclick(p.x, p.y);
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Flatten to beads' }).click();
  await expect(page.locator('.right-dock')).toBeHidden();
  s = await snapshot(page);
  expect(s.selburoses.length).toBe(0);
  expect(s.layers.filter((l) => l.kind === 'selburose').length).toBe(0);
  expect(s.rasterBeads).toBeGreaterThan(20);
  expect(s.coloursUsed).toBe(1);
  expect(await cellValue(page, 1, 1)).toBe(-1); // a far corner is untouched

  // undo the flatten -> back to a live star, no raster pixels
  await page.keyboard.press('ControlOrMeta+z');
  s = await snapshot(page);
  expect(s.selburoses.length).toBe(1);
  expect(s.rasterBeads).toBe(before.rasterBeads);
});

// ---------------------------------------------------------------------------
test('Selburose: copy / cut / paste and arrow-nudge the selected star', async ({
  page,
}) => {
  await page.locator('.swatch').nth(2).click();
  await pickTool(page, 'Selburose');
  let s = await snapshot(page);
  const a = { ...s.selburoses[0] };
  const id0 = a.id;

  // copy + paste -> a second star layer, offset, and now the selected one
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  s = await snapshot(page);
  expect(s.selburoses.length).toBe(2);
  expect(s.layers.filter((l) => l.kind === 'selburose').length).toBe(2);
  const b = s.selburoses.find((x) => x.id !== id0)!;
  expect(s.selectedSelburoseId).toBe(b.id);
  expect(b.colorIndex).toBe(a.colorIndex);
  expect(b.cx).toBeCloseTo(a.cx + 2, 5);
  expect(b.cy).toBeCloseTo(a.cy + 2, 5);
  expect(s.rasterBeads).toBe(0); // still overlay objects only

  // arrow keys nudge the selected (pasted) star, one grid unit each
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  s = await snapshot(page);
  const b2 = s.selburoses.find((x) => x.id === b.id)!;
  expect(b2.cx).toBeCloseTo(b.cx + 2, 5);
  expect(b2.cy).toBeCloseTo(b.cy + 1, 5);
  // Shift = a bigger step; the first star stays put
  await page.keyboard.press('Shift+ArrowLeft');
  s = await snapshot(page);
  expect(s.selburoses.find((x) => x.id === b.id)!.cx).toBeCloseTo(b2.cx - 10, 5);
  expect(s.selburoses.find((x) => x.id === id0)!.cx).toBeCloseTo(a.cx, 5);

  // cut removes the selected star but keeps it on the clipboard
  await page.keyboard.press('ControlOrMeta+x');
  s = await snapshot(page);
  expect(s.selburoses.length).toBe(1);
  expect(s.selburoses[0].id).toBe(id0);
  expect(s.selectedSelburoseId).toBeNull();

  // paste it back, then undo that paste
  await page.keyboard.press('ControlOrMeta+v');
  expect((await snapshot(page)).selburoses.length).toBe(2);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await snapshot(page)).selburoses.length).toBe(1);
});

// ---------------------------------------------------------------------------
test('Shapes: line / box become live layers with thickness, then flatten', async ({
  page,
}) => {
  await page.locator('.swatch').nth(3).click();
  const rasters0 = (await snapshot(page)).layers.filter(
    (l) => l.kind === 'raster',
  ).length;

  // --- draw a line -> its own vector layer, nothing baked into raster ----
  await pickTool(page, 'Line');
  await dragCells(page, [5, 5], [15, 5]);
  let s = await snapshot(page);
  expect(s.shapes.length).toBe(1);
  expect(s.shapes[0]).toMatchObject({
    kind: 'line',
    x0: 5,
    y0: 5,
    x1: 15,
    y1: 5,
    thickness: 1,
    colorIndex: 3,
  });
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(rasters0);
  expect(s.rasterBeads).toBe(0);
  expect(s.beads).toBe(11); // it composites live
  expect(s.rightPanel).toBe('shape');
  expect(s.selectedShapeId).toBe(s.shapes[0].id);

  // --- thicken it from the toolbar -> more beads, still a vector ---------
  const weight = page.getByRole('slider', { name: 'Line thickness' });
  await expect(weight).toHaveValue('1');
  await weight.fill('3');
  await weight.blur(); // as releasing a drag does
  s = await snapshot(page);
  expect(s.shapes[0].thickness).toBe(3);
  expect(s.beads).toBeGreaterThan(20);
  expect(s.rasterBeads).toBe(0);

  // --- nudge + flip act on the selected shape --------------------------
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  s = await snapshot(page);
  expect(s.shapes[0].y0).toBe(6);
  expect(s.shapes[0].x0).toBe(6);

  // --- a filled box on its own layer too ------------------------------
  await pickTool(page, 'Box+');
  await page.locator('.swatch').nth(6).click();
  await dragCells(page, [20, 10], [26, 16]);
  s = await snapshot(page);
  expect(s.shapes.length).toBe(2);
  const box = s.shapes.find((x) => x.kind === 'box')!;
  expect(box).toMatchObject({ fill: true, colorIndex: 6 });
  expect(s.selectedShapeId).toBe(box.id); // the line got deselected

  // --- flatten the box: merges into the raster, shape layer gone ------
  await page
    .locator('.right-dock')
    .getByRole('button', { name: 'Flatten to beads' })
    .click();
  s = await snapshot(page);
  expect(s.shapes.length).toBe(1); // just the line left
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(rasters0);
  expect(s.rasterBeads).toBe(49); // 7x7 box baked in
  expect(await cellValue(page, 23, 13)).toBe(6);

  // undo the flatten -> box is a live shape again
  await page.keyboard.press('ControlOrMeta+z');
  s = await snapshot(page);
  expect(s.shapes.length).toBe(2);
  expect(s.rasterBeads).toBe(0);
});

// ---------------------------------------------------------------------------
test('Poly tool: click points, edit vertices, close and flatten', async ({
  page,
}) => {
  await page.locator('.swatch').nth(4).click();
  await pickTool(page, 'Poly');

  // click out a triangle
  await tapCell(page, 10, 6);
  await tapCell(page, 20, 6);
  await tapCell(page, 15, 16);
  let s = await snapshot(page);
  expect(s.shapes.length).toBe(1);
  expect(s.shapes[0]).toMatchObject({ kind: 'poly', closed: false, colorIndex: 4 });
  expect(s.shapes[0].points).toEqual([
    [10, 6],
    [20, 6],
    [15, 16],
  ]);
  expect(s.rasterBeads).toBe(0);
  expect(s.beads).toBeGreaterThan(20); // the open polyline composites

  // click near the first point -> closes the path and hands over to Select
  await tapCell(page, 10, 6);
  s = await snapshot(page);
  expect(s.shapes[0].closed).toBe(true);
  expect(s.tool).toBe('select');
  const openBeads = s.beads;

  // fill the closed poly from the panel -> a lot more beads
  await page.locator('.right-dock').getByLabel('Filled').check();
  expect((await snapshot(page)).beads).toBeGreaterThan(openBeads + 30);
  await page.locator('.right-dock').getByLabel('Outline').check();

  // drag the apex vertex down with the Select tool
  const apex = await cellPoint(page, 15, 16);
  await page.mouse.move(apex.x, apex.y);
  await page.mouse.down();
  const to = await cellPoint(page, 15, 22);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  s = await snapshot(page);
  expect(s.shapes[0].points[2]).toEqual([15, 22]);
  expect(s.rasterBeads).toBe(0);

  // arrow keys nudge the whole poly
  await page.keyboard.press('ArrowRight');
  s = await snapshot(page);
  expect(s.shapes[0].points[0]).toEqual([11, 6]);

  // flatten -> merges into the raster, poly layer gone
  await page
    .locator('.right-dock')
    .getByRole('button', { name: 'Flatten to beads' })
    .click();
  s = await snapshot(page);
  expect(s.shapes.length).toBe(0);
  expect(s.rasterBeads).toBeGreaterThan(20);
});

// ---------------------------------------------------------------------------
test('Image layer: on-canvas transform, palette extract, then flatten', async ({
  page,
}) => {
  await pickTool(page, 'Image');
  const panel = page.locator('.ref-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Choose image');
  await panel.locator('input[type="file"]').setInputFiles('tests/fixtures/trace-quad.png');

  // an image LAYER appears, the Image tool is active, no beads are touched
  await expect.poll(async () => (await snapshot(page)).imageLayers.length).toBe(1);
  let s = await snapshot(page);
  expect(s.tool).toBe('reference');
  expect(s.imageLayers[0]).toMatchObject({ w: 4, h: 4, visible: true, coveredOnly: true });
  expect(s.editingImage).toBe(s.imageLayers[0].id);
  expect(s.rasterBeads).toBe(0); // nothing painted into a drawing layer
  // wait for the bitmap to decode so the handles have a real footprint
  await page.waitForTimeout(150);

  // the image keeps its palette-matched trace live in the composite, on its
  // own layer, without baking anything into a raster layer
  await expect.poll(async () => (await snapshot(page)).beads).toBeGreaterThan(0);
  expect((await snapshot(page)).rasterBeads).toBe(0);

  // --- rotate via the rotation handle (beads still untouched) ---
  let h = await refHandles(page);
  const beforeRot = (await snapshot(page)).imageLayers[0].rotationDeg;
  await page.mouse.move(h.rot.x, h.rot.y);
  await page.mouse.down();
  await page.mouse.move(h.rot.x - 90, h.rot.y + 60, { steps: 10 });
  await page.mouse.up();
  expect(
    Math.abs((await snapshot(page)).imageLayers[0].rotationDeg - beforeRot),
  ).toBeGreaterThan(3);
  expect((await snapshot(page)).rasterBeads).toBe(0);

  // --- drag the image body ---
  h = await refHandles(page);
  const beforeX = (await snapshot(page)).imageLayers[0].x;
  await page.mouse.move(h.centre.x, h.centre.y);
  await page.mouse.down();
  await page.mouse.move(h.centre.x - 70, h.centre.y, { steps: 8 });
  await page.mouse.up();
  s = await snapshot(page);
  expect(s.imageLayers[0].x).toBeLessThan(beforeX - 2);
  expect(s.rasterBeads).toBe(0); // still nothing baked in

  // reset (also zeroes the rotation, so screen axes align with image axes)
  await panel.getByRole('button', { name: 'Fit & reset' }).click();

  // --- scale, default: each axis is free. Pull the top-left corner in along
  //     X only -> scaleX shrinks a lot, scaleY barely moves. ---
  h = await refHandles(page);
  let img = (await snapshot(page)).imageLayers[0];
  await page.mouse.move(h.corners[0].x, h.corners[0].y);
  await page.mouse.down();
  await page.mouse.move(
    h.corners[0].x + (h.centre.x - h.corners[0].x) * 0.6,
    h.corners[0].y,
    { steps: 10 },
  );
  await page.mouse.up();
  let after = (await snapshot(page)).imageLayers[0];
  expect(after.scaleX).toBeLessThan(img.scaleX * 0.8);
  expect(Math.abs(after.scaleY - img.scaleY)).toBeLessThan(img.scaleY * 0.15);
  expect((await snapshot(page)).rasterBeads).toBe(0);

  // --- scale with Shift: aspect ratio locks, both axes scale together ---
  h = await refHandles(page);
  img = (await snapshot(page)).imageLayers[0];
  const aspect0 = img.scaleX / img.scaleY;
  await page.keyboard.down('Shift');
  await page.mouse.move(h.corners[2].x, h.corners[2].y); // bottom-right
  await page.mouse.down();
  await page.mouse.move(
    h.corners[2].x + (h.centre.x - h.corners[2].x) * 0.4,
    h.corners[2].y + (h.centre.y - h.corners[2].y) * 0.4,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.keyboard.up('Shift');
  after = (await snapshot(page)).imageLayers[0];
  expect(after.scaleX).toBeLessThan(img.scaleX * 0.95);
  expect(after.scaleX / after.scaleY).toBeCloseTo(aspect0, 1);

  // put the image back near centre so the flatten covers plenty of cells
  await panel.getByRole('button', { name: 'Fit & reset' }).click();

  // adjust controls change the layer without touching beads
  await panel
    .locator('.field', { hasText: 'Contrast' })
    .locator('input[type=range]')
    .fill('40');
  s = await snapshot(page);
  expect(s.imageLayers[0].contrast).toBeCloseTo(0.4);
  expect(s.rasterBeads).toBe(0);
  expect(s.imageLayers[0].equalize).toBe(0);
  await panel
    .locator('.field', { hasText: 'Equalize' })
    .locator('input[type=range]')
    .fill('75');
  s = await snapshot(page);
  expect(s.imageLayers[0].equalize).toBeCloseTo(0.75);
  expect(s.rasterBeads).toBe(0);

  // --- palette from image: the "Colours" count is stored on the layer so the
  //     canvas preview tracks it; add proposed colours, then replace ---
  await panel.getByLabel('Colours from this image').check();
  await panel.locator('.ref-num input').fill('6');
  expect((await snapshot(page)).imageLayers[0].paletteColors).toBe(6);
  const sizeBefore = (await snapshot(page)).paletteSize;
  await panel.getByRole('button', { name: 'Add colours' }).click();
  const added = (await snapshot(page)).paletteSize - sizeBefore;
  expect(added).toBeGreaterThanOrEqual(3);
  expect(added).toBeLessThanOrEqual(6);
  await panel.getByRole('button', { name: 'Replace palette' }).click();
  s = await snapshot(page);
  expect(s.paletteName).toBe('From image');
  expect(s.paletteSize).toBeGreaterThanOrEqual(3);
  expect(s.paletteSize).toBeLessThanOrEqual(6);

  // switching to "Use the current palette" still bakes nothing into raster
  await panel.getByLabel('Use the current palette').check();
  expect((await snapshot(page)).imageLayers[0].paletteMode).toBe('current');
  expect((await snapshot(page)).rasterBeads).toBe(0);
  await panel.getByLabel('Colours from this image').check();

  // --- flatten: the image layer becomes a raster layer of traced beads ---
  await panel.getByRole('button', { name: 'Flatten to beads' }).click();
  s = await snapshot(page);
  expect(s.imageLayers.length).toBe(0);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBeGreaterThanOrEqual(2);
  expect(s.beads).toBeGreaterThan(200);
  const tl = await cellValue(page, 44, 6);
  const tr = await cellValue(page, 56, 6);
  expect(tl).toBeGreaterThanOrEqual(0);
  expect(tl).not.toBe(tr); // quadrants map to different palette colours
});
