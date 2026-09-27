import { test, expect } from '@playwright/test';
import {
  cellValue,
  dragCells,
  pickTool,
  snapshot,
  waitForReady,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
});

const panel = (page: import('@playwright/test').Page) =>
  page.locator('.layer-panel');
const rows = (page: import('@playwright/test').Page) =>
  page.locator('.layer-panel .layer-row');

test('layers: create, paint, hide, reorder, rename, delete', async ({ page }) => {
  // one raster layer to start
  let s = await snapshot(page);
  expect(s.layers).toHaveLength(1);
  expect(s.layers[0].kind).toBe('raster');
  expect(s.activeLayer).toBe(s.layers[0].id);

  // open the panel from the tool rail
  await pickTool(page, 'Layers');
  await expect(panel(page)).toBeVisible();

  // add a layer -> it becomes active and sits on top
  await panel(page).getByRole('button', { name: 'Add layer' }).click();
  s = await snapshot(page);
  expect(s.layers).toHaveLength(2);
  expect(s.activeLayer).toBe(s.layers[1].id); // top of the array

  // paint on the new (top) layer with colour 1
  await page.locator('.swatch').nth(1).click();
  await pickTool(page, 'Pen');
  await dragCells(page, [4, 4], [8, 4]);
  s = await snapshot(page);
  expect(s.beads).toBe(5);
  // the bottom layer has no pixels; all 5 are on the active layer
  const layer2 = s.layers[1].id;
  const beadsByLayer = await page.evaluate((topId) => {
    const st = (window as any).__beadloom.getState();
    const count = (l: any) =>
      l.kind === 'raster'
        ? l.data.flat().filter((v: number) => v >= 0).length
        : 0;
    return {
      bottom: count(st.design.layers[0]),
      top: count(st.design.layers.find((l: any) => l.id === topId)),
    };
  }, layer2);
  expect(beadsByLayer).toEqual({ bottom: 0, top: 5 });

  // the painted layer shows a dominant-colour swatch; the empty one keeps its icon
  await expect(rows(page).first().locator('.layer-swatch')).toBeVisible();
  await expect(rows(page).last().locator('.layer-swatch')).toHaveCount(0);

  // hide the top layer -> composite drops to 0
  await rows(page).first().locator('.eye').click();
  s = await snapshot(page);
  expect(s.beads).toBe(0);
  expect(s.layers[1].visible).toBe(false);
  await rows(page).first().locator('.eye').click(); // show again
  expect((await snapshot(page)).beads).toBe(5);

  // paint the bottom layer a different colour over the SAME cells
  await page.locator('.layer-panel .layer-row').last().click(); // select bottom
  expect((await snapshot(page)).activeLayer).toBe(
    (await snapshot(page)).layers[0].id,
  );
  await page.locator('.swatch').nth(2).click();
  await dragCells(page, [4, 4], [8, 4]);
  // top layer (colour 1) still wins where they overlap
  expect(await page.evaluate(() => (window as any).__beadloomComposite()[4][4])).toBe(
    1,
  );

  // move the bottom layer up one -> now colour 2 wins
  await page.locator('.layer-panel .layer-row').last().click();
  const bottomId = (await snapshot(page)).layers[0].id;
  await page.evaluate((id) => (window as any).__beadloom.getState().moveLayer(id, 1), bottomId);
  expect(await page.evaluate(() => (window as any).__beadloomComposite()[4][4])).toBe(
    2,
  );

  // rename via double-click
  await rows(page).first().locator('.layer-name').dblclick();
  await page.locator('.layer-name-input').fill('Sky');
  await page.locator('.layer-name-input').press('Enter');
  s = await snapshot(page);
  expect(s.layers.some((l) => l.name === 'Sky')).toBe(true);

  // delete a raster layer; the last one can't be deleted
  await rows(page).first().getByRole('button', { name: 'Delete layer' }).click();
  s = await snapshot(page);
  expect(s.layers).toHaveLength(1);
  await expect(rows(page).first().getByRole('button', { name: 'Delete layer' })).toBeDisabled();
});

test('layers: duplicate a layer and merge one into the layer below', async ({
  page,
}) => {
  // Layer 1: a 3-cell run of colour 3
  await pickTool(page, 'Pen');
  await page.locator('.swatch').nth(3).click();
  await dragCells(page, [2, 2], [4, 2]);

  await pickTool(page, 'Layers');
  await panel(page).getByRole('button', { name: 'Add layer' }).click();
  // Layer 2: colour 5 over (2,2) and out at (10,2)
  await page.locator('.swatch').nth(5).click();
  await pickTool(page, 'Pen');
  await dragCells(page, [2, 2], [2, 2]);
  await dragCells(page, [10, 2], [10, 2]);
  let s = await snapshot(page);
  expect(s.rasterBeads).toBe(5); // 3 + 2
  expect(await cellValue(page, 2, 2)).toBe(5); // top layer wins

  // duplicate the active layer (Layer 2) — the Layers panel is still open
  await panel(page).getByRole('button', { name: 'Duplicate' }).click();
  s = await snapshot(page);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(3);
  expect(s.layers[2].name).toBe('Layer 2 copy');
  expect(s.activeLayer).toBe(s.layers[2].id); // the copy is active
  expect(s.rasterBeads).toBe(7); // 3 + 2 + 2
  expect(s.beads).toBe(4); // composite unchanged (copy is identical)

  // merge the copy down into Layer 2
  await panel(page).getByRole('button', { name: 'Merge ↓' }).click();
  s = await snapshot(page);
  expect(s.layers.filter((l) => l.kind === 'raster').length).toBe(2);
  expect(s.rasterBeads).toBe(5);

  // select Layer 2, merge it into Layer 1
  await rows(page).first().click();
  await panel(page).getByRole('button', { name: 'Merge ↓' }).click();
  s = await snapshot(page);
  expect(s.layers.length).toBe(1);
  expect(s.layers[0].name).toBe('Layer 1');
  expect(s.rasterBeads).toBe(4);
  expect(await cellValue(page, 2, 2)).toBe(5);
  expect(await cellValue(page, 3, 2)).toBe(3);
  expect(await cellValue(page, 10, 2)).toBe(5);

  // Merge ↓ is disabled for the only/bottom layer
  await expect(panel(page).getByRole('button', { name: 'Merge ↓' })).toBeDisabled();

  await page.keyboard.press('ControlOrMeta+z'); // undo last merge
  expect((await snapshot(page)).layers.length).toBe(2);
});

test('selecting a layer deselects objects on other layers', async ({ page }) => {
  // drop a Selburose (its own layer, selected) then a raster layer
  await pickTool(page, 'Selburose');
  await page.locator('.right-dock').getByRole('button', { name: 'Done' }).click();
  let s = await snapshot(page);
  expect(s.selectedSelburoseId).not.toBeNull();

  await pickTool(page, 'Layers');
  // click the bottom (raster) row → the Selburose selection is cleared
  await page.locator('.layer-panel .layer-row').last().click();
  s = await snapshot(page);
  expect(s.selectedSelburoseId).toBeNull();
  expect(s.activeLayer).toBe(s.layers[0].id);
});

test('locked layers: no selecting, painting, deleting or moving their contents', async ({
  page,
}) => {
  const notice = page.locator('.notice');
  const row = (name: string) => rows(page).filter({ hasText: name });
  const beads = async () => (await snapshot(page)).rasterBeads;
  const openLayers = async () => {
    if (!(await panel(page).isVisible())) await pickTool(page, 'Layers');
  };

  // a bead on Layer 1, a second layer with its own bead
  await pickTool(page, 'Pen');
  await dragCells(page, [3, 3], [3, 3]);
  await openLayers();
  await panel(page).getByRole('button', { name: 'Add layer' }).click();
  await pickTool(page, 'Pen');
  await dragCells(page, [5, 5], [5, 5]);
  let s = await snapshot(page);
  const [l1, l2] = s.layers;
  expect(s.activeLayer).toBe(l2.id);
  expect(await beads()).toBe(2);

  // lock Layer 2: painting moves to the nearest unlocked layer
  await openLayers();
  await row('Layer 2').getByRole('button', { name: 'Lock layer' }).click();
  s = await snapshot(page);
  expect(s.layers.find((l) => l.id === l2.id)!.locked).toBe(true);
  expect(s.activeLayer).toBe(l1.id);
  await expect(row('Layer 2').getByRole('button', { name: 'Delete layer' })).toBeDisabled();

  // it can't be picked from the panel
  await row('Layer 2').click();
  await expect(notice).toHaveText('“Layer 2” is locked');
  expect((await snapshot(page)).activeLayer).toBe(l1.id);

  // lock Layer 1 too: painting and filling are refused, nothing changes
  await row('Layer 1').getByRole('button', { name: 'Lock layer' }).click();
  await pickTool(page, 'Pen');
  await dragCells(page, [8, 8], [12, 8]);
  await expect(notice).toHaveText('“Layer 1” is locked');
  await pickTool(page, 'Fill');
  await dragCells(page, [20, 10], [20, 10]);
  expect(await beads()).toBe(2);
  expect(await cellValue(page, 8, 8)).toBe(-1);

  // a locked shape can't be selected on the canvas
  await pickTool(page, 'Box+');
  await dragCells(page, [15, 3], [17, 5]);
  s = await snapshot(page);
  const box = s.layers[s.layers.length - 1];
  expect(s.selectedShapeId).toBe(box.id);
  await openLayers();
  await row(box.name).getByRole('button', { name: 'Lock layer' }).click();
  expect((await snapshot(page)).selectedShapeId).toBeNull(); // locking lets go of it
  await pickTool(page, 'Select');
  await dragCells(page, [16, 4], [20, 8]); // try to drag it
  s = await snapshot(page);
  expect(s.selectedShapeId).toBeNull();
  expect(s.shapes[0]).toMatchObject({ x0: 15, y0: 3, x1: 17, y1: 5 });

  // the lock is saved with the design, and unlocking restores editing
  const saved = await page.evaluate(() => JSON.parse(window.__beadloom.getState().exportJSON()));
  expect(saved.layers.map((l: { locked?: boolean }) => !!l.locked)).toEqual([true, true, true]);
  await openLayers();
  await row('Layer 1').getByRole('button', { name: 'Unlock layer' }).click();
  await pickTool(page, 'Pen');
  await dragCells(page, [8, 8], [8, 8]);
  expect(await cellValue(page, 8, 8)).toBe(0);
});
