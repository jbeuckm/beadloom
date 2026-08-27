import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import {
  openPaletteLibrary,
  paletteColors,
  snapshot,
  waitForReady,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
});

test('build, save, load and delete a palette from the Toho library', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // accept the delete confirm()

  // === Apply a Toho preset =============================================
  await openPaletteLibrary(page);
  await page
    .locator('.modal .slot', { hasText: 'Toho Essentials' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));

  let s = await snapshot(page);
  expect(s.paletteName).toBe('Toho Essentials');
  expect(s.paletteSize).toBe(14);
  await expect(page.locator('.swatch-row')).toHaveCount(14);

  const toho = await paletteColors(page);
  expect(toho[0].code).toMatch(/^11-0-/); // real Toho colour numbers came through
  expect(toho.map((c) => c.name)).toContain('Jet Black');

  // === Build on it: add two colours, edit the active one ==============
  const addBtn = page.locator('.palette footer').getByRole('button', { name: '+ Color' });
  await addBtn.click();
  await addBtn.click();
  await expect(page.locator('.swatch-row')).toHaveCount(16);
  expect((await snapshot(page)).activeColor).toBe(15);

  await page
    .locator('.palette footer')
    .getByRole('button', { name: 'Edit the selected colour' })
    .click();
  const editor = page.locator('.modal', { hasText: 'Edit Colour' });
  await editor.locator('input[type="text"]').first().fill('Custom Teal');
  await editor.locator('input[type="color"]').fill('#0d9488');
  await editor.locator('input[type="text"]').nth(2).fill('X-1'); // bead code
  await editor.getByRole('button', { name: 'Save' }).click();

  const built = await paletteColors(page);
  expect(built[15]).toMatchObject({
    name: 'Custom Teal',
    hex: '#0D9488',
    code: 'X-1',
  });

  // === Name it and save it to the browser ============================
  await page.locator('.pname').fill('My Toho Set');
  expect((await snapshot(page)).paletteName).toBe('My Toho Set');

  await openPaletteLibrary(page);
  // the save field is pre-filled with the palette name
  await page.locator('.save-row').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal .slot', { hasText: 'My Toho Set' })).toBeVisible();
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();

  // === Switch to a different palette, then load the saved one back ====
  await openPaletteLibrary(page);
  await page
    .locator('.modal .slot', { hasText: 'Rainbow 10' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
  s = await snapshot(page);
  expect(s.paletteName).toBe('Rainbow 10');
  expect(s.paletteSize).toBe(10);

  await openPaletteLibrary(page);
  await page
    .locator('.modal .slot', { hasText: 'My Toho Set' })
    .getByRole('button', { name: 'Load' })
    .click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));

  s = await snapshot(page);
  expect(s.paletteName).toBe('My Toho Set');
  expect(s.paletteSize).toBe(16);
  const loaded = await paletteColors(page);
  expect(loaded[15]).toMatchObject({
    name: 'Custom Teal',
    hex: '#0D9488',
    code: 'X-1',
  });
  expect(loaded[0].name).toBe('Opaque White'); // Toho base survived the round-trip
  await expect(page.locator('.swatch-row')).toHaveCount(16);

  // === Delete the saved palette ====================================
  await openPaletteLibrary(page);
  await page
    .locator('.modal .slot', { hasText: 'My Toho Set' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('.modal .slot', { hasText: 'My Toho Set' })).toHaveCount(0);
});

test('exported palette is a valid beadloom-palette file', async ({ page }) => {
  await openPaletteLibrary(page);
  await page
    .locator('.modal .slot', { hasText: 'Toho Round 11/0' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));

  await openPaletteLibrary(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.modal').getByRole('button', { name: 'Export file…' }).click(),
  ]);
  const json = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));

  expect(json.format).toBe('beadloom-palette');
  expect(json.version).toBe(1);
  expect(json.palette.name).toBe('Toho Round 11/0');
  expect(Array.isArray(json.palette.colors)).toBe(true);
  expect(json.palette.colors.length).toBeGreaterThan(20);
  expect(json.palette.colors[0]).toMatchObject({
    hex: expect.stringMatching(/^#[0-9A-F]{6}$/),
    code: expect.stringMatching(/^11-0-/),
  });

  // ...and it re-imports through the same (still-open) dialog
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.modal').getByRole('button', { name: 'Import file…' }).click(),
  ]);
  await chooser.setFiles(await download.path());
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
  expect((await snapshot(page)).paletteSize).toBe(json.palette.colors.length);
});
