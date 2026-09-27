import { test, expect, type Page } from '@playwright/test';
import {
  browserItem,
  openFileMenu,
  openPaletteLibrary,
  pickTool,
  snapshot,
  tapCell,
  waitForReady,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
});

const savedPaths = (page: Page) =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.designs'] || '{}')).sort());

const item = (page: Page, name: string) =>
  page
    .locator('.modal .fb-main .fb-item')
    .filter({ has: page.locator('.fb-name', { hasText: new RegExp(`^${name}$`) }) });

/** Double-click (or double-tap) an item to open it / enter the folder. */
const openItem = async (page: Page, name: string) => {
  await item(page, name).click();
  await item(page, name).click();
};

test('Save As into a new folder; Open shows the grid type and follows the file', async ({
  page,
}) => {
  await openFileMenu(page, /\+ New/);
  await page.locator('.modal').getByLabel('Square').check();
  await page.locator('.modal').getByRole('button', { name: 'Create' }).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 1, 1);

  // Save As: make a folder, name it in place, go into it, save there
  await openFileMenu(page, /Save As/);
  const modal = page.locator('.modal');
  await modal.getByRole('button', { name: 'New folder' }).click();
  const rename = modal.getByLabel('Rename');
  await expect(rename).toHaveValue('untitled folder');
  await rename.fill('Samplers');
  await rename.press('Enter');
  await openItem(page, 'Samplers');
  await expect(modal.locator('.fb-save-where')).toContainText('Samplers');
  await modal.locator('#fb-save-name').fill('Square One');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await savedPaths(page)).toEqual(['Samplers/Square One']);
  let s = await snapshot(page);
  expect(s.slotPath).toBe('Samplers/Square One');
  expect(s.dirty).toBe(false);

  // Open starts in the design's folder, with it selected and described
  await openFileMenu(page, /⊟ Open/);
  await expect(modal.locator('.fb-path')).toContainText('Samplers');
  const row = item(page, 'Square One');
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(row.locator('.fb-col.type')).toHaveText('Square');
  await expect(row.locator('.fb-col.size')).toHaveText('100×25');

  // a nested folder, then drag the design into it
  await modal.getByRole('button', { name: 'New folder' }).click();
  await modal.getByLabel('Rename').fill('Belts');
  await modal.getByLabel('Rename').press('Enter');
  await item(page, 'Square One').dragTo(item(page, 'Belts'));
  expect(await savedPaths(page)).toEqual(['Samplers/Belts/Square One']);
  expect((await snapshot(page)).slotPath).toBe('Samplers/Belts/Square One');

  // ⌘↑ goes up; renaming the parent folder carries everything inside with it
  await modal.locator('.fb').press('ControlOrMeta+ArrowUp');
  await item(page, 'Samplers').click();
  await modal.getByRole('button', { name: 'Rename', exact: true }).click();
  await modal.getByLabel('Rename').fill('Patterns');
  await modal.getByLabel('Rename').press('Enter');
  expect(await savedPaths(page)).toEqual(['Patterns/Belts/Square One']);
  expect((await snapshot(page)).slotPath).toBe('Patterns/Belts/Square One');

  // the sidebar tree reaches the nested folder
  await modal.getByRole('button', { name: 'Expand Patterns' }).click();
  await modal.locator('.fb-side-item', { hasText: 'Belts' }).click();
  await expect(item(page, 'Square One')).toBeVisible();

  // renaming the open design renames the document too
  await item(page, 'Square One').click();
  await modal.locator('.fb').press('Enter');
  await modal.getByLabel('Rename').fill('Square Two');
  await modal.getByLabel('Rename').press('Enter');
  s = await snapshot(page);
  expect(s.slotPath).toBe('Patterns/Belts/Square Two');
  expect(s.name).toBe('Square Two');

  // double-click opens it
  await openItem(page, 'Square Two');
  await expect(modal).toHaveCount(0);
  expect((await snapshot(page)).beads).toBe(1);
});

test('Trash, Put Back, Empty Trash; duplicate, search, icon view', async ({ page }) => {
  await openFileMenu(page, /Save As/);
  const modal = page.locator('.modal');
  await modal.locator('#fb-save-name').fill('Alpha');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();

  await openFileMenu(page, /⊟ Open/);
  await item(page, 'Alpha').click();
  await modal.getByRole('button', { name: /Duplicate/ }).click();
  await expect(item(page, 'Alpha copy')).toHaveAttribute('aria-selected', 'true');
  expect(await savedPaths(page)).toEqual(['Alpha', 'Alpha copy']);

  // search spans folders
  await modal.getByLabel('Search', { exact: true }).fill('copy');
  await expect(modal.locator('.fb-main .fb-item')).toHaveCount(1);
  await modal.getByLabel('Search', { exact: true }).fill('');

  // trash the open design: the document forgets its file
  await item(page, 'Alpha').click();
  await item(page, 'Alpha').click({ modifiers: ['ControlOrMeta'] }); // toggle off…
  await item(page, 'Alpha').click({ modifiers: ['ControlOrMeta'] }); // …and back on
  await modal.getByRole('button', { name: 'Move to Trash' }).click();
  expect(await savedPaths(page)).toEqual(['.Trash/Alpha', 'Alpha copy']);
  expect((await snapshot(page)).slotPath).toBeNull();
  await expect(modal.locator('.fb-side-item', { hasText: 'Trash' }).locator('.fb-badge')).toHaveText('1');

  // Put Back returns it where it was
  await modal.locator('.fb-side-item', { hasText: 'Trash' }).click();
  await item(page, 'Alpha').click();
  await modal.getByRole('button', { name: /Put Back/ }).click();
  expect(await savedPaths(page)).toEqual(['Alpha', 'Alpha copy']);

  // trash it again, then empty the Trash (confirm)
  await modal.locator('.fb-side-item', { hasText: 'Designs' }).click();
  await item(page, 'Alpha copy').click();
  await modal.locator('.fb').press('ControlOrMeta+Backspace');
  expect(await savedPaths(page)).toEqual(['.Trash/Alpha copy', 'Alpha']);
  await modal.locator('.fb-side-item', { hasText: 'Trash' }).click();
  page.once('dialog', (d) => d.accept());
  await modal.getByRole('button', { name: 'Empty Trash' }).click();
  expect(await savedPaths(page)).toEqual(['Alpha']);
  await expect(modal.locator('.fb-empty')).toHaveText('The Trash is empty.');

  // icon view shows a rendered thumbnail, and the choice sticks
  await modal.locator('.fb-side-item', { hasText: 'Designs' }).click();
  await modal.getByRole('button', { name: 'Icon view' }).click();
  await expect(item(page, 'Alpha').locator('img')).toHaveAttribute('src', /^data:image\/png/);
  await modal.getByRole('button', { name: 'Cancel' }).click();
  await openFileMenu(page, /⊟ Open/);
  await expect(modal.getByRole('button', { name: 'Icon view' })).toHaveAttribute('aria-pressed', 'true');
});

test('palettes share the file system: folders, preset copies, save into a folder', async ({
  page,
}) => {
  const paletteKeys = () =>
    page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.palettes'] || '{}')).sort());
  const modal = page.locator('.modal');

  await openPaletteLibrary(page);
  await expect(modal.locator('.fb-path')).toContainText('Palettes');

  // a folder for bead-brand palettes
  await modal.getByRole('button', { name: 'New folder' }).click();
  await modal.getByLabel('Rename').fill('Toho');
  await modal.getByLabel('Rename').press('Enter');

  // presets are grouped by maker and read-only: no rename / trash, but they
  // copy into a folder
  await modal.locator('.fb-side-item', { hasText: 'Presets' }).click();
  await expect(browserItem(page, 'Toho').locator('.fb-col.type')).toHaveText('Folder');
  await browserItem(page, 'Toho').click();
  await browserItem(page, 'Toho').click();
  await expect(modal.locator('.fb-path')).toContainText('Presets');
  await expect(modal.locator('.fb-path')).toContainText('Toho');
  await browserItem(page, 'Toho Essentials').click();
  await expect(modal.getByRole('button', { name: 'Rename', exact: true })).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Move to Trash' })).toBeDisabled();
  await modal.getByLabel('Copy to folder').selectOption({ label: '\u2003Toho' });
  expect(await paletteKeys()).toEqual(['Toho/Toho Essentials']);

  // saving the current palette goes into the folder being viewed
  await modal.locator('.fb-side-item', { hasText: 'Toho' }).click();
  await browserItem(page, 'Toho Essentials').click();
  await expect(browserItem(page, 'Toho Essentials').locator('.fb-col.type')).toHaveText('Bead colours');
  await page.locator('#fb-save-name').fill('Rainbow Mine');
  await page.locator('.fb-savebar').getByRole('button', { name: 'Save' }).click();
  expect(await paletteKeys()).toEqual(['Toho/Rainbow Mine', 'Toho/Toho Essentials']);
  let s = await snapshot(page);
  expect(s.paletteSlotPath).toBe('Toho/Rainbow Mine');
  expect(s.paletteName).toBe('Rainbow Mine');

  // moving it keeps the current palette pointing at its file
  await browserItem(page, 'Rainbow Mine').click();
  await modal.getByLabel('Move to folder').selectOption({ label: 'Palettes' });
  expect(await paletteKeys()).toEqual(['Rainbow Mine', 'Toho/Toho Essentials']);
  expect((await snapshot(page)).paletteSlotPath).toBe('Rainbow Mine');

  // design and palette libraries are separate
  await modal.getByRole('button', { name: 'Done' }).click();
  await openFileMenu(page, /⊟ Open/);
  await expect(modal.locator('.fb-side-item', { hasText: 'Toho' })).toHaveCount(0);
  await expect(modal.locator('.fb-side-item', { hasText: 'Presets' })).toHaveCount(0);
});
