import { test, expect, type Page } from '@playwright/test';
import { browserItem, openFileMenu, openPaletteLibrary, pickTool, snapshot, tapCell, waitForReady } from './helpers';

// The in-memory fake cloud (lib/cloud/fake.ts) stands in for Neon: same
// interface, no network, and it persists in localStorage so a reload plays
// "another device". Tests reach it through window.__beadloomCloudFake.

const useFakeCloud = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem('beadloom.cloudFake', '1');
    // past the home page's local-vs-account choice (tests/sharing.spec.ts covers it)
    if (!localStorage.getItem('beadloom.homeMode')) localStorage.setItem('beadloom.homeMode', 'account');
  });

const cloudDump = (page: Page) =>
  page.evaluate(() => (window as any).__beadloomCloudFake.dump() as {
    items: Array<{ id: string; path: string; collection: string; doc: any; modified: string; deleted_at: string | null }>;
    folders: Array<{ collection: string; path: string }>;
  });
const setOffline = (page: Page, v: boolean) =>
  page.evaluate((x) => (window as any).__beadloomCloudFake.setOffline(x), v);
const cloudState = async (page: Page) => (await snapshot(page)).cloud;

/** Create an account on the sign-in page (from the designer's Account button,
 *  which comes back to the designer), then open the Account dialog. */
async function createAccount(page: Page, email: string, password: string) {
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page).toHaveURL(/#\/signin\?next=/);
  const card = page.locator('.signin-card');
  await card.getByRole('button', { name: 'Create account' }).click();
  await card.locator('input[type="text"]').fill('Tester');
  await card.locator('input[type="email"]').fill(email);
  await card.locator('.pw-field input').fill(password);
  await card.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/design$/); // back where they were
  await page.getByRole('button', { name: 'Account' }).click();
}
async function signUp(page: Page, email: string, password: string) {
  await createAccount(page, email, password);
  await expect(page.locator('.modal')).toContainText(email);
  await expect.poll(async () => (await cloudState(page)).status).toBe('synced');
}

async function saveAs(page: Page, name: string) {
  await openFileMenu(page, /Save As/);
  const m = page.locator('.modal');
  await m.locator('#fb-save-name').fill(name);
  await m.getByRole('button', { name: 'Save', exact: true }).click();
}

test('without cloud config the app is local-only: no account button', async ({ page }) => {
  await page.goto('/#/design');
  await waitForReady(page);
  expect((await cloudState(page)).available).toBe(false);
  await expect(page.getByRole('button', { name: 'Account' })).toHaveCount(0);
});

test('sign up, save to Cloud Storage, rename: every change reaches the cloud; another device pulls it', async ({
  page,
}) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Sign in/);
  await signUp(page, 'ann@example.com', 'correct-horse');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();
  // the button says who's signed in; its cloud says how Cloud Storage is doing
  const account = page.getByRole('button', { name: 'Account' });
  await expect(account).toHaveText('Tester');
  await expect(account).toHaveAttribute('title', 'ann@example.com — Cloud Storage is up to date');

  // signed in, Save As opens in Cloud Storage; a save there syncs on its own
  await pickTool(page, 'Pen');
  await tapCell(page, 2, 2);
  await saveAs(page, 'Cloud One');
  expect((await snapshot(page)).slotPath).toBe('Cloud Storage/Cloud One');
  await expect.poll(async () => (await cloudDump(page)).items.map((i) => i.path)).toEqual(['Cloud One']);
  let dump = await cloudDump(page);
  expect(dump.items[0].collection).toBe('design');
  expect(dump.items[0].doc.meta.name).toBe('Cloud One');
  const id = dump.items[0].id;

  // a rename moves the same row (same id), it doesn't make a new one
  await openFileMenu(page, /⊟ Open/);
  const modal = page.locator('.modal');
  await browserItem(page, 'Cloud One').click();
  await modal.getByRole('button', { name: 'Rename', exact: true }).click();
  await modal.getByLabel('Rename').fill('Cloud Two');
  await modal.getByLabel('Rename').press('Enter');
  await expect.poll(async () => (await cloudDump(page)).items.map((i) => [i.id, i.path])).toEqual([[id, 'Cloud Two']]);
  // a new folder syncs too
  await modal.getByRole('button', { name: 'New folder' }).click();
  await modal.getByLabel('Rename').fill('Gifts');
  await modal.getByLabel('Rename').press('Enter');
  await expect.poll(async () =>
    (await cloudDump(page)).folders.map((f) => ({ collection: f.collection, path: f.path })),
  ).toEqual([{ collection: 'design', path: 'Gifts' }]);
  await modal.getByRole('button', { name: 'Cancel' }).click();

  // "another device": same account, nothing cached yet
  await page.evaluate(() => {
    for (const k of ['beadloom.cloud.designs', 'beadloom.cloud.folders', 'beadloom.cloud.itemIds', 'beadloom.cloud.queue', 'beadloom.cloud.sync'])
      localStorage.removeItem(k);
  });
  await page.reload();
  await waitForReady(page);
  await expect.poll(async () => (await cloudState(page)).status).toBe('synced');
  await expect.poll(() =>
    page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.cloud.designs'] || '{}'))),
  ).toEqual(['Cloud Two']);
  expect(await page.evaluate(() => JSON.parse(localStorage['beadloom.cloud.folders'] || '[]'))).toEqual(['Gifts']);
  await openFileMenu(page, /⊟ Open/);
  await expect(browserItem(page, 'Cloud Two')).toBeVisible();
  await expect(browserItem(page, 'Gifts')).toBeVisible();

  // the newer version wins: an edit made elsewhere lands here on the next sync
  dump = await cloudDump(page);
  const row = dump.items[0];
  const later = new Date(Date.now() + 60_000).toISOString();
  await page.evaluate(
    ([r, when]) =>
      (window as any).__beadloomCloudFake.seedItem({
        ...r,
        owner_id: (window as any).__beadloomCloudFake.dump().items[0].owner_id,
        modified: when,
        doc: { ...r.doc, meta: { ...r.doc.meta, name: 'Cloud Two (edited elsewhere)', modified: when } },
      }),
    [row, later] as const,
  );
  await modal.getByRole('button', { name: 'Cancel' }).click();
  // opening Open brings Cloud Storage up to date: no button to press
  await openFileMenu(page, /⊟ Open/);
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(JSON.parse(localStorage['beadloom.cloud.designs'])['Cloud Two']).meta.name),
  ).toBe('Cloud Two (edited elsewhere)');
  await modal.getByRole('button', { name: 'Cancel' }).click();
  // and with nothing wrong, the Account dialog offers no manual sync
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.locator('.modal').getByRole('button', { name: 'Try again' })).toHaveCount(0);
});

test('offline: saves queue, the status says so, and they sync when back', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'bo@example.com', 'correct-horse');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();

  await setOffline(page, true);
  await saveAs(page, 'Offline One');
  await expect.poll(async () => (await cloudState(page)).status).toBe('offline');
  expect((await cloudState(page)).pending).toBe(1);
  const account = page.getByRole('button', { name: 'Account' });
  await expect(account.locator('.account-pending')).toHaveText('1');
  await expect(account).toHaveAttribute(
    'title',
    "bo@example.com — Offline — 1 Cloud Storage change will upload when you're back online",
  );
  await openFileMenu(page, /⊟ Open/);
  await expect(page.locator('.modal .fb-side-item', { hasText: 'Cloud Storage' }).locator('.cloud-status')).toHaveAttribute(
    'aria-label',
    "Offline — 1 Cloud Storage change will upload when you're back online",
  );
  await page.locator('.modal').getByRole('button', { name: 'Cancel' }).click();
  expect((await cloudDump(page)).items).toHaveLength(0); // nothing got through
  expect(await page.evaluate(() => 'Offline One' in JSON.parse(localStorage['beadloom.cloud.designs']))).toBe(true); // but it's saved on the device

  await setOffline(page, false);
  await page.getByRole('button', { name: 'Account' }).click(); // stuck: a way to push now
  await page.locator('.modal').getByRole('button', { name: 'Try again' }).click();
  await expect.poll(async () => (await cloudState(page)).status).toBe('synced');
  expect((await cloudDump(page)).items.map((i) => i.path)).toEqual(['Offline One']);
  await expect(page.locator('.modal')).toContainText('Cloud Storage is up to date');
  await expect(page.locator('.modal').getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Account' }).locator('.account-pending')).toHaveCount(0);
});

test('Local Storage never syncs; moving a design into Cloud Storage uploads it, and back takes it off', async ({
  page,
}) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await saveAs(page, 'Local One'); // signed out: Local Storage is all there is
  expect((await snapshot(page)).slotPath).toBe('Local Storage/Local One');
  await openFileMenu(page, /⊟ Open/);
  const m = page.locator('.modal');
  await expect(m.locator('.fb-side-item', { hasText: 'Local Storage' })).toBeVisible();
  await expect(m.locator('.fb-side-item', { hasText: 'Cloud Storage' })).toHaveCount(0);
  await m.getByRole('button', { name: 'Cancel' }).click();

  await signUp(page, 'cy@example.com', 'correct-horse');
  await m.getByRole('button', { name: 'Done' }).click();
  expect((await cloudDump(page)).items).toHaveLength(0); // signing in uploads nothing

  // Local → Cloud Storage: uploaded, and gone from Local Storage
  await openFileMenu(page, /⊟ Open/);
  await expect(m.locator('.fb-side-item', { hasText: 'Cloud Storage' })).toBeVisible();
  await browserItem(page, 'Local One').click();
  await m.getByLabel('Move to folder').selectOption({ label: 'Cloud Storage' });
  await expect.poll(async () => (await cloudDump(page)).items.map((i) => [i.path, i.deleted_at])).toEqual([
    ['Local One', null],
  ]);
  expect((await snapshot(page)).slotPath).toBe('Cloud Storage/Local One'); // the open design follows it
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.designs'] || '{}')))).toEqual([]);

  // and back: off the account (soft-deleted, so other devices drop it too)
  await m.locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await browserItem(page, 'Local One').click();
  await m.getByLabel('Move to folder').selectOption({ label: 'Local Storage' });
  await expect.poll(async () => (await cloudDump(page)).items[0].deleted_at).not.toBeNull();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.designs'] || '{}')))).toEqual([
    'Local One',
  ]);
});

test('forgot password: the emailed link opens the reset form; the new password works', async ({
  page,
}) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'dee@example.com', 'first-password');
  await page.locator('.modal').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Sign in/);

  await page.getByRole('button', { name: 'Account' }).click(); // the sign-in page
  const card = page.locator('.signin-card');
  await card.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(card.locator('h2')).toHaveText('Reset password');
  await card.locator('input[type="email"]').fill('dee@example.com');
  await card.getByRole('button', { name: 'Send reset link' }).click();
  await expect(card).toContainText('a reset link is on its way');
  const token = await page.evaluate(() => (window as any).__beadloomCloudFake.lastResetToken('dee@example.com'));
  expect(token).toBeTruthy();

  // the link in the email (first sent before pages had addresses, so the old
  // form) lands on the sign-in page with the token (a fresh load)
  await page.evaluate((t) => {
    location.hash = `auth=reset?token=${t}`;
  }, token);
  await page.reload();
  await expect(page).toHaveURL(/#\/signin\?/);
  await expect(card.locator('h2')).toHaveText('Choose a new password');
  await card.locator('.pw-field input').fill('second-password');
  await card.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('.notice')).toHaveText(/Password changed/);
  expect(await page.evaluate(() => location.hash)).toBe('#/signin'); // the token's gone from the address

  await card.locator('input[type="email"]').fill('dee@example.com');
  await card.locator('.pw-field input').fill('second-password');
  await card.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/#\/home$/); // signed in: on to their home
  expect((await cloudState(page)).user).toBe('dee@example.com');
});

test('an out-of-date database blocks sync with a plain message; the app tracks the newest migration', async ({
  page,
}) => {
  // the app's required version is the newest file in db/migrations
  const fs = await import('node:fs');
  const newest = Math.max(
    ...fs.readdirSync('db/migrations').filter((f) => /^\d{4}_.+\.sql$/.test(f)).map((f) => Number(f.slice(0, 4))),
  );
  const required = Number(/REQUIRED_SCHEMA_VERSION = (\d+)/.exec(fs.readFileSync('src/lib/cloud/schema.ts', 'utf8'))![1]);
  expect(required).toBe(newest);

  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await page.evaluate(() => (window as any).__beadloomCloudFake.setSchemaVersion(0));
  await createAccount(page, 'eve@example.com', 'correct-horse');
  const m = page.locator('.modal');
  await expect.poll(async () => (await cloudState(page)).status).toBe('error');
  await expect(m.locator('.acct-status')).toContainText(`schema 0, needs ${required}`);
  await expect(m.locator('.acct-status')).toContainText('npm run db:migrate');
  await m.getByRole('button', { name: 'Done' }).click();
  await saveAs(page, 'Held Back');
  expect((await cloudDump(page)).items).toHaveLength(0); // nothing pushed to an old schema
  expect((await cloudState(page)).pending).toBe(1); // but the change waits
});

test('palettes have Local and Cloud Storage too; only Cloud Storage syncs', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'pal@example.com', 'correct-horse');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();

  await openPaletteLibrary(page);
  const m = page.locator('.modal');
  await expect(m.locator('.fb-side-item', { hasText: 'Local Storage' })).toBeVisible();
  await expect(m.locator('.fb-side-item.here')).toContainText('Cloud Storage'); // signed in: the default
  await m.locator('#fb-save-name').fill('Synced Set');
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await cloudDump(page)).items.map((i) => [i.collection, i.path])).toEqual([
    ['palette', 'Synced Set'],
  ]);

  await m.locator('.fb-side-item', { hasText: 'Local Storage' }).click();
  await m.locator('#fb-save-name').fill('Kept Here');
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(browserItem(page, 'Kept Here')).toBeVisible();
  expect((await cloudDump(page)).items.map((i) => i.path)).toEqual(['Synced Set']);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.palettes'] || '{}')))).toEqual([
    'Kept Here',
  ]);
});

test('the eye button shows and hides the password, typed or filled in', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await page.getByRole('button', { name: 'Account' }).click(); // signed out: the sign-in page
  const m = page.locator('.signin-card');
  const field = m.locator('.pw-field input');
  await field.fill('saved-by-the-browser'); // as a password manager would
  await expect(field).toHaveAttribute('type', 'password');
  await m.getByRole('button', { name: 'Show password' }).click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(field).toHaveValue('saved-by-the-browser');
  await m.getByRole('button', { name: 'Hide password' }).click();
  await expect(field).toHaveAttribute('type', 'password');
});
