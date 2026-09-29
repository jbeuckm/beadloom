import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import {
  applyPresetPalette,
  browserItem,
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
  await applyPresetPalette(page, 'Toho Essentials');

  let s = await snapshot(page);
  expect(s.paletteName).toBe('Toho Essentials');
  expect(s.paletteSize).toBe(14);
  await expect(page.locator('.swatch-row')).toHaveCount(14);

  const toho = await paletteColors(page);
  expect(toho[0].code).toMatch(/^11-0-/); // real Toho colour numbers came through
  expect(toho.map((c) => c.name)).toContain('Opaque Jet');

  // === Build on it: add two colours, edit the active one ==============
  const addBtn = page.locator('.palette footer').getByRole('button', { name: '+ Color' });
  for (let i = 0; i < 2; i++) {
    await addBtn.click();
    await page.locator('.modal').getByRole('button', { name: 'Add colour', exact: true }).click();
  }
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
  // the save field is pre-filled with the palette name; it saves into the
  // folder being viewed (the top level here)
  await page.locator('.modal .fb-side-item', { hasText: 'Palettes' }).click();
  await expect(page.locator('#fb-save-name')).toHaveValue('My Toho Set');
  await page.locator('.fb-savebar').getByRole('button', { name: 'Save' }).click();
  await expect(browserItem(page, 'My Toho Set')).toBeVisible();
  await expect(browserItem(page, 'My Toho Set').locator('.fb-col.size')).toHaveText('16 colours');
  expect((await snapshot(page)).paletteSlotPath).toBe('My Toho Set');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();

  // === Switch to a different palette, then load the saved one back ====
  await applyPresetPalette(page, 'Rainbow 10');
  s = await snapshot(page);
  expect(s.paletteName).toBe('Rainbow 10');
  expect(s.paletteSize).toBe(10);

  await openPaletteLibrary(page);
  await page.locator('.modal .fb-side-item', { hasText: 'Palettes' }).click();
  await browserItem(page, 'My Toho Set').click();
  await browserItem(page, 'My Toho Set').click(); // double-click applies
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

  // === Trash the saved palette, then empty the Trash =================
  await openPaletteLibrary(page);
  await browserItem(page, 'My Toho Set').click();
  await page.locator('.modal').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(browserItem(page, 'My Toho Set')).toHaveCount(0);
  expect((await snapshot(page)).paletteSlotPath).toBeNull();
  await page.locator('.modal .fb-side-item', { hasText: 'Trash' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Empty Trash' }).click();
  await expect(page.locator('.modal .fb-empty')).toHaveText('The Trash is empty.');
});

test('exported palette is a valid beadloom-palette file', async ({ page }) => {
  await applyPresetPalette(page, 'Toho Essentials');

  await openPaletteLibrary(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.modal').getByRole('button', { name: 'Export file…' }).click(),
  ]);
  const json = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));

  expect(json.format).toBe('beadloom-palette');
  expect(json.version).toBe(1);
  expect(json.palette.name).toBe('Toho Essentials');
  expect(Array.isArray(json.palette.colors)).toBe(true);
  expect(json.palette.colors.length).toBe(14);
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

test('build a palette colour by colour from the maker libraries', async ({ page }) => {
  await applyPresetPalette(page, 'Toho Essentials'); // a 14-colour starter
  const picker = page.locator('.modal', { hasText: 'Add Colour' });
  const openLibraryTab = async () => {
    await page.locator('.palette footer').getByRole('button', { name: '+ Color' }).click();
    await picker.getByRole('tab', { name: 'From Library' }).click();
  };
  const tile = (text: string) => picker.locator('.clp-tile', { hasText: text });

  // --- pick one Delica by code, then two greens, add all three at once ---
  await openLibraryTab();
  await picker.locator('.fb-side-item', { hasText: 'Delica 11/0' }).click();
  await picker.getByLabel('Search colours').fill('DB-0723');
  await expect(picker.locator('.clp-tile')).toHaveCount(1);
  await tile('DB-0723').click();
  await picker.getByLabel('Search colours').fill('');
  await picker.getByRole('button', { name: 'Greens' }).click();
  await expect(tile('DB-0724')).toBeVisible();
  await tile('DB-0724').click();
  await tile('DB-0733').click();
  await expect(picker.locator('.clp-picked-chip')).toHaveCount(3);
  await picker.getByRole('button', { name: 'Remove Opaque Chartreuse' }).click(); // unpick
  await tile('DB-2358').click();
  await picker.getByRole('button', { name: 'Add 3 colours' }).click();
  await expect(picker).toHaveCount(0);

  let s = await snapshot(page);
  expect(s.paletteSize).toBe(17);
  expect(s.activeColor).toBe(14); // the first added colour
  let colors = await paletteColors(page);
  expect(colors.slice(14)).toMatchObject([
    { name: 'Opaque Red', code: 'DB-0723', hex: '#C4122C' },
    { name: 'Opaque Green', code: 'DB-0724' },
    { name: 'Duracoat Opaque Evergreen', code: 'DB-2358' },
  ]);

  // --- colours already in the palette are marked; yarn works the same;
  //     the dialog reopens on the tab used last ---
  await page.locator('.palette footer').getByRole('button', { name: '+ Color' }).click();
  await expect(picker.getByRole('tab', { name: 'From Library' })).toHaveAttribute('aria-selected', 'true');
  await expect(picker.locator('.fb-side-item.here')).toContainText('Delica 11/0'); // remembered
  await expect(tile('DB-0723')).toHaveClass(/have/);
  await expect(tile('DB-0723')).toContainText('in palette');
  await picker.locator('.fb-side-item', { hasText: 'Shetland & Highland' }).click();
  await picker.getByLabel('Search colours').fill('water lily');
  await tile('Water Lily').click();
  await picker.getByRole('button', { name: 'Add 1 colour' }).click();
  colors = await paletteColors(page);
  expect(colors[17]).toMatchObject({ name: 'Water Lily', code: '062' });

  // --- Edit can take its colour from a library ---
  await page
    .locator('.palette footer')
    .getByRole('button', { name: 'Edit the selected colour' })
    .click();
  const editor = page.locator('.modal', { hasText: 'Edit Colour' });
  await expect(editor.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'true');
  await editor.getByRole('tab', { name: 'From Library' }).click();
  await editor.locator('.fb-side-item', { hasText: 'All lines' }).click();
  await editor.getByLabel('Search colours').fill('11-0-45A');
  await editor.locator('.clp-tile', { hasText: '11-0-45A' }).click();
  // back on Custom with the library colour filled in, to review before saving
  await expect(editor.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor.locator('input[type="text"]').first()).toHaveValue('Opaque Cherry');
  await expect(editor.locator('input[type="text"]').nth(2)).toHaveValue('11-0-45A');
  await editor.getByRole('button', { name: 'Save' }).click();
  colors = await paletteColors(page);
  expect(colors[17]).toMatchObject({ name: 'Opaque Cherry', code: '11-0-45A', hex: '#DD2727' });

  // --- Presets offer starter sets, not whole lines ---
  await openPaletteLibrary(page);
  await page.locator('.modal .fb-side-item', { hasText: 'Presets' }).click();
  await browserItem(page, 'Miyuki').click();
  await browserItem(page, 'Miyuki').click();
  await expect(page.locator('.modal .fb-main .fb-item')).toHaveCount(2);
  await expect(browserItem(page, 'Miyuki Delica Essentials')).toBeVisible();
  await expect(browserItem(page, 'Miyuki Round Essentials')).toBeVisible();
});

test('Harrisville wool: measured colours with a heather texture that averages true', async ({
  page,
}) => {
  // add Hemlock from the library
  await page.locator('.palette footer').getByRole('button', { name: '+ Color' }).click();
  const dialog = page.locator('.modal', { hasText: 'Add Colour' });
  await dialog.getByRole('tab', { name: 'From Library' }).click();
  await dialog.locator('.fb-side-item', { hasText: 'Shetland & Highland' }).click();
  await dialog.getByLabel('Search colours').fill('hemlock');
  await dialog.locator('.clp-tile', { hasText: 'Hemlock' }).click();
  await dialog.getByRole('button', { name: 'Add 1 colour' }).click();

  const hemlock = () =>
    page.evaluate(() => window.__beadloom.getState().design.palette.colors.find((c: any) => c.name === 'Hemlock'));
  let c = await hemlock();
  // a deep olive green, not near-black: green leads, and it's clearly lit
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b + 25);
  expect(g).toBeGreaterThan(70);
  expect(c.code).toBe('008');
  expect(c.heather.length).toBeGreaterThan(1);
  expect(c.heather.reduce((a: number, [, w]: [string, number]) => a + w, 0)).toBeCloseTo(1, 2);

  // the swatch shows the texture
  await expect(page.locator('.swatch-row').last().locator('.swatch')).toHaveCSS('background-image', /^url\("data:image\/png/);

  // paint a block and read the canvas back: textured (not flat), averaging to the colour
  const idx = (await snapshot(page)).paletteSize - 1;
  await page.evaluate((i) => {
    const st = window.__beadloom.getState();
    const pts: Array<[number, number]> = [];
    for (let r2 = 0; r2 < 8; r2++) for (let c2 = 0; c2 < 12; c2++) pts.push([c2, r2]);
    st.paintCells(pts, i);
    st.setView({ zoom: 2, panX: 10, panY: 10 });
  }, idx);
  const stats = await page.evaluate(() => {
    const cv = document.querySelector('.canvas-wrap canvas') as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const dpr = cv.width / cv.clientWidth;
    const sc = 26 * 2;
    // the interior of cell (4,3), clear of grid lines
    const x = Math.round((10 + 4 * sc + 6) * dpr), y = Math.round((10 + 3 * sc * 0.8 + 6) * dpr);
    const w = Math.round((sc - 12) * dpr), h = Math.round((sc * 0.8 - 12) * dpr);
    const d = ctx.getImageData(x, y, w, h).data;
    const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const m = [0, 0, 0]; let n = 0; const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) { for (let k = 0; k < 3; k++) m[k] += lin(d[i + k]); seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); n++; }
    const gam = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    return { mean: m.map((v) => gam(v / n)), distinct: seen.size };
  });
  expect(stats.distinct).toBeGreaterThan(30); // fibres, not a flat fill
  stats.mean.forEach((v, k) => expect(Math.abs(v - [r, g, b][k])).toBeLessThan(14)); // reads as Hemlock

  // the heather survives saving a palette and a design
  const saved = await page.evaluate(() => JSON.parse(window.__beadloom.getState().exportJSON()));
  expect(saved.palette.colors.find((x: any) => x.name === 'Hemlock').heather.length).toBe(c.heather.length);
  await page.evaluate((j) => window.__beadloom.getState().loadDesignText(j), JSON.stringify(saved));
  expect((await hemlock()).heather).toEqual(c.heather);

  // recolouring by hand drops the texture (it would no longer match)
  await page.locator('.swatch-meta').last().click();
  const editor = page.locator('.modal', { hasText: 'Edit Colour' });
  await editor.locator('input[type="color"]').fill('#336699');
  await editor.getByRole('button', { name: 'Save' }).click();
  c = await hemlock();
  expect(c.hex).toBe('#336699');
  expect(c.heather).toBeUndefined();
});
