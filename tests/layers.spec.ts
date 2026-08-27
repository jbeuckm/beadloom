import { test, expect } from '@playwright/test';
import { dragCells, pickTool, snapshot, waitForReady } from './helpers';

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
  await rows(page).first().locator('.btn.danger').click();
  s = await snapshot(page);
  expect(s.layers).toHaveLength(1);
  await expect(rows(page).first().locator('.btn.danger')).toBeDisabled();
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
