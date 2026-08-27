import { test, expect } from '@playwright/test';
import {
  cellValue,
  dragCells,
  openFileMenu,
  pickTool,
  snapshot,
  tapCell,
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

  await openFileMenu(page, /Game of Life/);
  const modal = page.locator('.modal', { hasText: 'Game of Life' });
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
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));

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
test('Selburose: parametric star stamps into the grid', async ({ page }) => {
  await page.locator('.swatch').nth(3).click();
  expect((await snapshot(page)).activeColor).toBe(3);

  await openFileMenu(page, /Selburose/);
  const modal = page.locator('.modal', { hasText: 'Selburose' });

  // preview renders a polygon
  await expect(modal.locator('.selburose-preview polygon')).toHaveAttribute(
    'points',
    /\d/,
  );

  // centre it deterministically
  const nums = modal.locator('input[type="number"]');
  await nums.first().fill('50'); // Centre X
  await nums.nth(1).fill('12'); // Centre Y

  const before = (await snapshot(page)).beads;
  await modal.getByRole('button', { name: 'Insert' }).click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));

  const after = await snapshot(page);
  expect(after.beads).toBeGreaterThan(20);
  expect(after.coloursUsed).toBe(1);
  expect(await cellValue(page, 50, 12)).toBe(3); // star centre filled
  expect(await cellValue(page, 3, 3)).toBe(-1); // far corner untouched

  await page.keyboard.press('ControlOrMeta+z');
  expect((await snapshot(page)).beads).toBe(before);
});

// ---------------------------------------------------------------------------
test('Reference image: place, move, and trace onto the palette', async ({ page }) => {
  await openFileMenu(page, /Reference Image/);
  const panel = page.locator('.ref-panel');
  await expect(panel).toBeVisible();

  await panel.locator('input[type="file"]').setInputFiles('tests/fixtures/trace-quad.png');

  // image registered + Image tool auto-selected
  await expect.poll(async () => (await snapshot(page)).reference !== null).toBe(true);
  let s = await snapshot(page);
  expect(s.tool).toBe('reference');
  expect(s.reference).toMatchObject({ w: 4, h: 4, visible: true });

  // wait for pixels to decode, then trace
  await expect
    .poll(() => page.evaluate(() => (window as { __beadloomRef?: { ready(): boolean } }).__beadloomRef?.ready()))
    .toBe(true);

  await panel.getByRole('button', { name: 'Trace → palette' }).click();

  s = await snapshot(page);
  expect(s.beads).toBeGreaterThan(200); // the covered band is filled
  expect(s.beads).toBeLessThan(s.columns * s.rows); // but not the whole grid

  // the four image quadrants map to different palette colours
  const tl = await cellValue(page, 44, 6);
  const tr = await cellValue(page, 56, 6);
  const bl = await cellValue(page, 44, 18);
  const br = await cellValue(page, 56, 18);
  for (const v of [tl, tr, bl, br]) expect(v).toBeGreaterThanOrEqual(0);
  expect(new Set([tl, tr, bl, br]).size).toBeGreaterThanOrEqual(3);
  expect(tl).not.toBe(tr);

  // dragging with the Image tool moves the picture
  const beforeX = (await snapshot(page)).reference!.x;
  await pickTool(page, 'Image');
  await dragCells(page, [50, 12], [62, 12]);
  expect((await snapshot(page)).reference!.x).toBeGreaterThan(beforeX + 3);

  // remove clears it
  await panel.getByRole('button', { name: 'Remove' }).click();
  expect((await snapshot(page)).reference).toBeNull();
});
