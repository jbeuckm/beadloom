#!/usr/bin/env node
// A demo user for the live app: signs up (or in), picks a username, imports
// the Commodore 64 palette, draws the designs in art.mjs pixel by pixel with
// the app's own tools, files them in Cloud Storage, publishes some to the
// gallery, sets a profile picture, writes a journal post, and likes, rates
// and comments — all by driving the real UI, as a person would.
//
//   npm run dev                       (in another terminal: the app on :5847, on Neon)
//   node scripts/demo/demo-user.mjs   [--headed] [--shots <dir>]
//
// A rehearsal against the in-memory fake cloud instead (nothing reaches Neon):
//   DEMO_URL=http://localhost:5848 node scripts/demo/demo-user.mjs --fake
// with the app served there with Neon switched off, e.g.
//   VITE_NEON_AUTH_URL= VITE_NEON_DATA_API_URL= npx vite --port 5848
//
// The account is DEMO_EMAIL / DEMO_PASSWORD from .env; a password is made and
// written there the first time. Run it again and it signs in instead.

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { C64, DESIGNS } from './art.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = resolve(root, '.env');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const shots = arg('--shots');
const BASE = process.env.DEMO_URL || 'http://localhost:5847';
const FAKE = process.argv.includes('--fake');
// --publish-only: the account and designs exist (an earlier run); just share and post
const PUBLISH_ONLY = process.argv.includes('--publish-only');

// ---- the account --------------------------------------------------------------
const env = {};
if (existsSync(envFile))
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
const EMAIL = env.DEMO_EMAIL || 'kf0vcl+chromattice-demo@gmail.com';
let PASSWORD = env.DEMO_PASSWORD;
if (!PASSWORD) {
  PASSWORD = randomBytes(15).toString('base64url');
  const add = `\n# The demo user (scripts/demo/demo-user.mjs)\nDEMO_EMAIL=${EMAIL}\nDEMO_PASSWORD=${PASSWORD}\n`;
  writeFileSync(envFile, (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '') + add);
}
const USERNAME = 'pixel_dojo';
const FOLDER = 'C64 Homage';
const PUBLISH = ['Dojo at Dusk', 'Flying Kick', 'Paper Lanterns'];

const step = (s) => console.log(`· ${s}`);

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2 });
if (FAKE) await context.addInitScript(() => localStorage.setItem('beadloom.cloudFake', '1'));
const page = await context.newPage();
page.on('dialog', (d) => d.accept()); // "discard unsaved changes?" and the like: yes
const modal = () => page.locator('.modal').last();
const shot = async (name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });

// ---- the app's state and grid, for aiming taps ---------------------------------
const state = () =>
  page.evaluate(() => {
    const s = window.__beadloom.getState();
    return {
      view: s.view,
      aspect: s.design.loom.cellAspect,
      palette: s.design.palette.colors.map((c) => c.name),
      user: s.cloudUser?.email ?? null,
      username: s.cloudUsername,
      sync: s.cloudInfo.status,
    };
  });
const composite = () => page.evaluate(() => window.__beadloomComposite());
async function aim() {
  const box = await page.locator('.canvas-wrap canvas').boundingBox();
  const { view, aspect } = await state();
  const w = 26 * view.zoom; // PX_PER_COL
  return (c, r) => ({ x: box.x + view.panX + (c + 0.5) * w, y: box.y + view.panY + (r + 0.5) * w * aspect });
}
async function tap(at, c, r) {
  const p = at(c, r);
  await page.mouse.click(p.x, p.y);
}
async function drag(at, a, b) {
  const pa = at(...a);
  const pb = at(...b);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 8 });
  await page.mouse.up();
}
const tool = (label) => page.locator(`.toolrail [aria-label="${label}"]`).click();
const colour = (i) => page.locator(`.swatch-list [aria-label="Use ${C64[i][0]}"]`).click();
async function menu(item) {
  await page.getByRole('button', { name: /^File/ }).click();
  await page.locator('.menu-item').filter({ hasText: item }).first().click();
}
async function readyCanvas() {
  await page.locator('.canvas-wrap canvas').waitFor();
  await page.waitForFunction(() => {
    const s = window.__beadloom?.getState();
    return !!s && s.viewport.w > 0 && (s.view.panX !== 0 || s.view.panY !== 0);
  });
  await page.waitForTimeout(250); // the fit settles
}

/** A file action under the browser's More menu. */
async function moreAction(name) {
  await modal().getByRole('button', { name: 'More actions' }).click();
  await modal().locator('.menu-pop .menu-item', { hasText: name }).click();
}

/** In an open file browser: Cloud Storage, then into the demo's folder. */
async function enterFolder(fb) {
  await fb.locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await fb
    .locator('.fb-main .fb-item')
    .filter({ has: page.locator('.fb-name', { hasText: new RegExp(`^${FOLDER}$`) }) })
    .dblclick();
  await fb.locator('.fb-path').filter({ hasText: FOLDER }).waitFor();
}

// ---- sign up, or in -------------------------------------------------------------
step(`opening ${BASE}`);
await page.goto(`${BASE}/#/`);
await page.waitForFunction(() => window.__beadloom?.getState().cloudReady);
const onFake = await page.evaluate(() => !!window.__beadloomCloudFake);
if (!(await page.evaluate(() => window.__beadloom.getState().cloudAvailable)) || onFake !== FAKE)
  throw new Error(
    FAKE ? 'That app is not on the fake cloud' : 'That app is not connected to Neon (fake cloud, or no accounts): run `npm run dev` with .env',
  );
if (!(await state()).user) {
  await page.goto(`${BASE}/#/signin?next=/home`);
  const card = page.locator('.signin-card');
  await card.locator('input[type="email"]').fill(EMAIL);
  await card.locator('.pw-field input').fill(PASSWORD);
  await card.getByRole('button', { name: 'Sign in', exact: true }).click();
  const outcome = await Promise.race([
    page.waitForURL(/#\/home$/).then(() => 'in'),
    card.locator('.acct-error').waitFor().then(() => 'no'),
  ]);
  if (outcome === 'no') {
    step(`creating the account ${EMAIL}`);
    await card.getByRole('button', { name: 'Create account' }).click();
    await card.locator('input[type="text"]').fill('Pixel Dojo');
    await card.locator('input[type="email"]').fill(EMAIL);
    await card.locator('.pw-field input').fill(PASSWORD);
    await card.getByRole('button', { name: 'Create account' }).click();
    const made = await Promise.race([
      page.waitForURL(/#\/home$/, { timeout: 20000 }).then(() => 'ok'),
      card.locator('.acct-error').waitFor({ timeout: 20000 }).then(async () => await card.locator('.acct-error').innerText()),
    ]);
    if (made !== 'ok') throw new Error(`Sign-up failed: ${made}`);
  } else step(`signed in as ${EMAIL}`);
}
await shot('01-home-new');

// the username
await page.getByRole('button', { name: /^Signed in as/ }).click();
// the profile loads: either the username, or the prompt to choose one
const hasName = await Promise.race([
  modal().locator('.acct-username').waitFor().then(() => true),
  modal().getByLabel('Choose a username').waitFor().then(() => false),
]);
if (!hasName) {
  step(`choosing the username @${USERNAME}`);
  await modal().getByLabel('Choose a username').fill(USERNAME);
  await modal().getByRole('button', { name: 'Save', exact: true }).click();
  await modal().getByText(`@${USERNAME}`).waitFor();
}
await modal().getByRole('button', { name: 'Done' }).click();

// ---- the designer: the C64 palette ------------------------------------------------
await page.getByRole('button', { name: /^Designer/ }).click();
await readyCanvas();
if (!PUBLISH_ONLY) {
  step('importing the Commodore 64 palette');
  const dir = mkdtempSync(join(tmpdir(), 'c64-'));
  const paletteFile = join(dir, 'commodore-64.palette.json');
  writeFileSync(
    paletteFile,
    JSON.stringify({
      format: 'beadloom-palette',
      version: 1,
      palette: { id: 'c64', name: 'Commodore 64', kind: 'Computer colours', colors: C64.map(([name, hex], i) => ({ id: `c${i}`, name, hex })) },
    }),
  );
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await modal().getByRole('button', { name: 'Import file…' }).click();
  await (await chooser).setFiles(paletteFile);
  await page.waitForFunction(() => window.__beadloom.getState().design.palette.name === 'Commodore 64');
  // keep it in the Palette Library, in Cloud Storage
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await modal().locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await modal().locator('#fb-save-name').fill('Commodore 64');
  await modal().getByRole('button', { name: 'Save', exact: true }).click();
  await modal().locator('.fb-footer').getByRole('button', { name: 'Done' }).click();

  // ---- the designs, pixel by pixel ---------------------------------------------------
  let folderMade = false;
  for (const d of DESIGNS) {
    step(`drawing “${d.name}”`);
    await menu('New…');
    const m = modal();
    await m.locator('input[type="text"]').fill(d.name);
    await m.locator('input[type="number"]').nth(0).fill(String(d.cols));
    await m.locator('input[type="number"]').nth(1).fill(String(d.rows));
    await m.getByRole('radio', { name: 'Square' }).check();
    await m.getByRole('button', { name: 'Create' }).click();
    await readyCanvas();
    if ((await state()).palette[0] !== 'Black') throw new Error('The C64 palette did not carry over');
    const at = await aim();

    // the background, in one pour of the Fill bucket
    await colour(d.bg);
    await tool('Fill');
    await tap(at, 0, 0);

    // whole rows of one colour (the dusk sky, the raster bars): the Box+ tool
    const rows = d.g.map((row) => (row.every((v) => v === row[0] && v >= 0) ? row[0] : null));
    if (rows.filter((v) => v !== null).length > 6) {
      await tool('Box+');
      for (let y = 0; y < d.rows; y++)
        if (rows[y] !== null && rows[y] !== d.bg) {
          await colour(rows[y]);
          await drag(at, [0, y], [d.cols - 1, y]);
          await page.keyboard.press('Escape'); // let go of that box, so the next drag starts a new one
        }
    }
    // straight runs down a column (the floorboards' seams): the Line tool
    if (d.name === 'Flying Kick') {
      await tool('Line');
      await colour(0);
      for (const x of [3, 10, 17, 24, 31]) {
        await drag(at, [x, 28], [x, 31]);
        await page.keyboard.press('Escape');
      }
    }

    // everything else, one pixel at a time with the Pen, a colour at a time
    const now = await composite();
    const todo = new Map();
    d.g.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v >= 0 && now[y][x] !== v) todo.set(v, [...(todo.get(v) ?? []), [x, y]]);
      }),
    );
    await tool('Pen');
    for (const [c, cells] of todo) {
      await colour(c);
      for (const [x, y] of cells) await tap(at, x, y);
    }
    // …and a slip, undone
    await colour(1);
    await tap(at, 0, d.rows - 1);
    await page.locator('.toolrail [aria-label="Undo"]').click();

    // check it against the drawing
    const done = await composite();
    const wrong = d.g.flatMap((row, y) => row.flatMap((v, x) => (v >= 0 && done[y][x] !== v ? [`(${x},${y}) ${v}≠${done[y][x]}`] : [])));
    if (wrong.length) throw new Error(`“${d.name}”: ${wrong.length} cells came out wrong: ${wrong.slice(0, 12).join(' ')}`);

    // file it in Cloud Storage, in its folder
    await menu('Save As…');
    const sm = modal();
    await sm.locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
    if (!folderMade) {
      const existing = sm.locator('.fb-main .fb-item', { hasText: FOLDER });
      if (!(await existing.count())) {
        await sm.getByRole('button', { name: 'New folder' }).click();
        await sm.getByLabel('Rename').fill(FOLDER);
        await sm.getByLabel('Rename').press('Enter');
      }
      folderMade = true;
    }
    await enterFolder(sm);
    await sm.locator('#fb-save-name').fill(d.name);
    await sm.getByRole('button', { name: 'Save', exact: true }).click();
    await shot(`02-design-${d.name.replace(/\W+/g, '-').toLowerCase()}`);
  }

}

// wait for Cloud Storage to catch up
await page.waitForFunction(() => {
  const i = window.__beadloom.getState().cloudInfo;
  return i.status === 'synced' && i.pending === 0;
}, null, { timeout: 60000 });

// ---- publish, profile picture ------------------------------------------------------
async function openDesign(name) {
  await menu('Open…');
  await enterFolder(modal());
  await modal()
    .locator('.fb-main .fb-item')
    .filter({ has: page.locator('.fb-name', { hasText: new RegExp(`^${name}$`) }) })
    .click();
}
for (const name of PUBLISH) {
  step(`publishing “${name}” to the gallery`);
  await openDesign(name);
  await moreAction('Share…');
  const share = modal();
  await share.getByRole('checkbox', { name: /Anyone/ }).check();
  await share.getByRole('button', { name: 'Save' }).click();
  await page.locator('.notice').filter({ hasText: 'Sharing updated' }).waitFor();
  await modal().locator('.fb-footer').getByRole('button', { name: 'Cancel' }).click();
}
step('profile picture: “Flying Kick”');
await openDesign('Flying Kick');
await moreAction('Use as profile picture');
await page.locator('.notice').filter({ hasText: 'profile picture' }).waitFor();
await modal().locator('.fb-footer').getByRole('button', { name: 'Cancel' }).click();

// ---- a journal post --------------------------------------------------------------
step('writing a journal post');
await page.goto(`${BASE}/#/journal`);
await page.getByRole('button', { name: 'Write a post' }).click();
const pe = modal();
await pe.getByLabel('Title').fill('An evening at the 8-bit dojo');
await pe.getByLabel('Post').fill(
  [
    '# Sixteen colours, one question',
    'The Commodore 64 gave you **sixteen colours** and a grid, and every pixel had to earn its place. These are my own scenes in that spirit — nothing copied, everything placed one cell at a time.',
    '',
    '## What went into them',
    '- a sky in raster bars, drawn with *Box+* one row at a time',
    '- a pagoda with its eaves turned up, and a moon rising behind it',
    '- a flying kick against a setting sun',
    '- two paper lanterns on a starry night',
    '',
    'Try the loading screen trick yourself: stack single-row boxes in random colours and put a black box in the middle.',
  ].join('\n'),
);
for (const name of PUBLISH) await pe.locator('.post-pick', { hasText: name }).locator('input').check();
await pe.getByRole('radio', { name: 'Anyone' }).click();
await pe.getByRole('button', { name: 'Post' }).click();
await page.locator('.notice').filter({ hasText: 'Posted' }).waitFor();
await shot('03-post');
await pe.getByRole('button', { name: 'Close' }).click().catch(() => {});

// ---- like, rate, comment -----------------------------------------------------------
step('liking, rating and commenting in the gallery');
await page.goto(`${BASE}/#/gallery`);
for (const [name, stars, comment] of [
  ['Dojo at Dusk', 5, 'Three roofs, each one step wider than the last — and the eaves flick up at the ends.'],
  ['Paper Lanterns', 4, null],
]) {
  await page.locator('.gallery-card', { hasText: name }).click();
  const g = modal();
  const like = g.getByRole('button', { name: 'Like' });
  if (await like.count()) await like.click();
  await g.getByRole('radio', { name: `${stars} stars` }).click();
  if (comment) {
    await g.getByLabel('Write a comment').fill(comment);
    await g.getByRole('button', { name: 'Post' }).click();
    await g.locator('.comment-list li').first().waitFor();
  }
  await page.waitForTimeout(500); // the reaction saves in the background
  await g.getByRole('button', { name: 'Close' }).click();
}
await shot('04-gallery');
await page.goto(`${BASE}/#/home`);
await page.locator('.continue-card').waitFor();
await page.waitForTimeout(800);
await shot('05-home');

step('done');
await browser.close();
