import { test, expect } from '@playwright/test';
import {
  cellPoint,
  cellValue,
  dragCells,
  pickTool,
  refHandles,
  snapshot,
  toolButton,
  waitForReady,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
});

// ---------------------------------------------------------------------------
test('Game of Life: a blinker oscillates and can be undone', async ({ page }) => {
  await pickTool(page, 'Pen');
  await dragCells(page, [5, 5], [7, 5]); // horizontal 3-cell blinker in colour 0
  expect((await snapshot(page)).beads).toBe(3);

  await pickTool(page, 'Life');
  const modal = page.locator('.right-dock', { hasText: 'Game of Life' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Step' }).click();

  // horizontal -> vertical
  expect(await cellValue(page, 6, 5)).toBe(0); // centre survives
  expect(await cellValue(page, 6, 4)).toBe(0); // born (neighbour vote = 0)
  expect(await cellValue(page, 6, 6)).toBeGreaterThanOrEqual(0);
  expect(await cellValue(page, 5, 5)).toBe(-1); // ends died
  expect(await cellValue(page, 7, 5)).toBe(-1);

  await modal.getByRole('button', { name: 'Step' }).click();
  // vertical -> horizontal again
  expect(await cellValue(page, 5, 5)).toBeGreaterThanOrEqual(0);
  expect(await cellValue(page, 6, 4)).toBe(-1);

  // seed a random field
  await modal.getByRole('button', { name: 'Seed grid' }).click();
  expect((await snapshot(page)).beads).toBeGreaterThan(50);

  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(modal).toBeHidden();

  // one undo per Step + one for Seed; unwind them all back to the drawn blinker
  const undos = (await snapshot(page)).undo;
  expect(undos).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < undos - 1; i++) await page.keyboard.press('ControlOrMeta+z');
  // back to the original blinker (the pen stroke itself is the last undo left)
  expect(await cellValue(page, 5, 5)).toBe(0);
  expect(await cellValue(page, 6, 5)).toBe(0);
  expect(await cellValue(page, 7, 5)).toBe(0);
  expect(await cellValue(page, 6, 4)).toBe(-1);
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
  await editor
    .locator('.field', { hasText: 'Rotation' })
    .locator('input[type=range]')
    .fill('30');
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
  expect(s.beads).toBe(0);
  // wait for the bitmap to decode so the handles have a real footprint
  await page.waitForTimeout(150);

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
  expect((await snapshot(page)).beads).toBe(0);

  // --- scale down via the top-left corner handle ---
  h = await refHandles(page);
  const beforeScale = (await snapshot(page)).imageLayers[0].scale;
  const c0 = h.corners[0];
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(
    c0.x + (h.centre.x - c0.x) * 0.4,
    c0.y + (h.centre.y - c0.y) * 0.4,
    { steps: 8 },
  );
  await page.mouse.up();
  expect((await snapshot(page)).imageLayers[0].scale).toBeLessThan(beforeScale * 0.9);

  // --- drag the image body ---
  h = await refHandles(page);
  const beforeX = (await snapshot(page)).imageLayers[0].x;
  await page.mouse.move(h.centre.x, h.centre.y);
  await page.mouse.down();
  await page.mouse.move(h.centre.x - 70, h.centre.y, { steps: 8 });
  await page.mouse.up();
  s = await snapshot(page);
  expect(s.imageLayers[0].x).toBeLessThan(beforeX - 2);
  expect(s.beads).toBe(0); // still nothing baked in

  // put the image back near centre so the flatten covers plenty of cells
  await panel.getByRole('button', { name: 'Fit & reset' }).click();

  // --- extract a palette from the image ---
  await panel.locator('.ref-num input').fill('6');
  await panel.getByRole('button', { name: 'Replace palette' }).click();
  s = await snapshot(page);
  expect(s.paletteName).toBe('From image');
  expect(s.paletteSize).toBe(6);

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
