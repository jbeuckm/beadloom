import { test, expect, type Page } from '@playwright/test';
import { browserItem, openFileMenu, pickTool, snapshot, tapCell, waitForReady } from './helpers';

// The in-memory fake cloud (lib/cloud/fake.ts) stands in for Neon: same
// interface, no network, and it persists in localStorage so a reload plays
// "another device". Tests reach it through window.__beadloomCloudFake.

const useFakeCloud = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('beadloom.cloudFake', '1'));

const cloudDump = (page: Page) =>
  page.evaluate(() => (window as any).__beadloomCloudFake.dump() as {
    items: Array<{ id: string; path: string; collection: string; doc: any; modified: string; deleted_at: string | null }>;
    folders: Array<{ collection: string; path: string }>;
  });
const setOffline = (page: Page, v: boolean) =>
  page.evaluate((x) => (window as any).__beadloomCloudFake.setOffline(x), v);
const cloudState = async (page: Page) => (await snapshot(page)).cloud;

async function signUp(page: Page, email: string, password: string) {
  await page.getByRole('button', { name: 'Account' }).click();
  const m = page.locator('.modal');
  await m.getByRole('button', { name: 'Create account' }).click();
  await m.locator('input[type="text"]').fill('Tester');
  await m.locator('input[type="email"]').fill(email);
  await m.locator('input[type="password"]').fill(password);
  await m.getByRole('button', { name: 'Create account' }).click();
  await expect(m).toContainText(email);
  await expect.poll(async () => (await cloudState(page)).status).toBe('synced');
}

async function saveAs(page: Page, name: string) {
  await openFileMenu(page, /Save As/);
  const m = page.locator('.modal');
  await m.locator('#fb-save-name').fill(name);
  await m.getByRole('button', { name: 'Save', exact: true }).click();
}

test('without cloud config the app is local-only: no account button', async ({ page }) => {
  await page.goto('/');
  await waitForReady(page);
  expect((await cloudState(page)).available).toBe(false);
  await expect(page.getByRole('button', { name: 'Account' })).toHaveCount(0);
});

test('sign up, save, rename: every change reaches the cloud; another device pulls it', async ({
  page,
}) => {
  await useFakeCloud(page);
  await page.goto('/');
  await waitForReady(page);
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Sign in/);
  await signUp(page, 'ann@example.com', 'correct-horse');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Synced/);

  // a save syncs on its own
  await pickTool(page, 'Pen');
  await tapCell(page, 2, 2);
  await saveAs(page, 'Cloud One');
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

  // "another device": same account, empty local library
  await page.evaluate(() => {
    for (const k of ['beadloom.designs', 'beadloom.folders', 'beadloom.cloud.ids', 'beadloom.cloud.outbox', 'beadloom.cloud.state'])
      localStorage.removeItem(k);
  });
  await page.reload();
  await waitForReady(page);
  await expect.poll(async () => (await cloudState(page)).status).toBe('synced');
  await expect.poll(() =>
    page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.designs'] || '{}'))),
  ).toEqual(['Cloud Two']);
  expect(await page.evaluate(() => JSON.parse(localStorage['beadloom.folders'] || '[]'))).toEqual(['Gifts']);
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
  await page.getByRole('button', { name: 'Account' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(JSON.parse(localStorage['beadloom.designs'])['Cloud Two']).meta.name),
  ).toBe('Cloud Two (edited elsewhere)');
});

test('offline: saves queue, the status says so, and they sync when back', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/');
  await waitForReady(page);
  await signUp(page, 'bo@example.com', 'correct-horse');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();

  await setOffline(page, true);
  await saveAs(page, 'Offline One');
  await expect.poll(async () => (await cloudState(page)).status).toBe('offline');
  expect((await cloudState(page)).pending).toBe(1);
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Offline · 1 waiting/);
  expect((await cloudDump(page)).items).toHaveLength(0); // nothing got through
  expect(await page.evaluate(() => 'Offline One' in JSON.parse(localStorage['beadloom.designs']))).toBe(true); // but it's saved locally

  await setOffline(page, false);
  await page.getByRole('button', { name: 'Account' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(async () => (await cloudState(page)).status).toBe('synced');
  expect((await cloudDump(page)).items.map((i) => i.path)).toEqual(['Offline One']);
  await expect(page.locator('.modal')).toContainText('Everything is synced');
});

test('designs saved before signing in can be uploaded to the new account', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/');
  await waitForReady(page);
  await saveAs(page, 'Local One'); // signed out: stays on this device
  expect((await cloudState(page)).user).toBeNull();

  await signUp(page, 'cy@example.com', 'correct-horse');
  const m = page.locator('.modal');
  await expect(m.locator('.acct-offer')).toContainText("1 saved design or palette on this device isn't in your account yet");
  expect((await cloudDump(page)).items).toHaveLength(0);
  await m.getByRole('button', { name: 'Upload to my account' }).click();
  await expect.poll(async () => (await cloudDump(page)).items.map((i) => i.path)).toEqual(['Local One']);
  await expect(m.locator('.acct-offer')).toHaveCount(0);
});

test('forgot password: the emailed link opens the reset form; the new password works', async ({
  page,
}) => {
  await useFakeCloud(page);
  await page.goto('/');
  await waitForReady(page);
  await signUp(page, 'dee@example.com', 'first-password');
  await page.locator('.modal').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Sign in/);

  await page.getByRole('button', { name: 'Account' }).click();
  const m = page.locator('.modal');
  await m.getByRole('button', { name: 'Forgot password?' }).click();
  await m.locator('input[type="email"]').fill('dee@example.com');
  await m.getByRole('button', { name: 'Send reset link' }).click();
  await expect(m).toContainText('a reset link is on its way');
  const token = await page.evaluate(() => (window as any).__beadloomCloudFake.lastResetToken('dee@example.com'));
  expect(token).toBeTruthy();

  // the link in the email lands back in the app with the token (a fresh load)
  await page.evaluate((t) => {
    location.hash = `auth=reset?token=${t}`;
  }, token);
  await page.reload();
  await waitForReady(page);
  await expect(page.locator('.modal')).toContainText('Choose a new password');
  await page.locator('.modal input[type="password"]').fill('second-password');
  await page.locator('.modal').getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('.notice')).toHaveText(/Password changed/);
  expect(await page.evaluate(() => location.hash)).toBe('');

  await page.locator('.modal input[type="email"]').fill('dee@example.com');
  await page.locator('.modal input[type="password"]').fill('second-password');
  await page.locator('.modal').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.modal')).toContainText('dee@example.com');
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
  await page.goto('/');
  await waitForReady(page);
  await page.evaluate(() => (window as any).__beadloomCloudFake.setSchemaVersion(0));
  await page.getByRole('button', { name: 'Account' }).click();
  const m = page.locator('.modal');
  await m.getByRole('button', { name: 'Create account' }).click();
  await m.locator('input[type="text"]').fill('Tester');
  await m.locator('input[type="email"]').fill('eve@example.com');
  await m.locator('input[type="password"]').fill('correct-horse');
  await m.getByRole('button', { name: 'Create account' }).click();
  await expect.poll(async () => (await cloudState(page)).status).toBe('error');
  await expect(m.locator('.acct-status')).toContainText(`schema 0, needs ${required}`);
  await expect(m.locator('.acct-status')).toContainText('npm run db:migrate');
  await m.getByRole('button', { name: 'Done' }).click();
  await saveAs(page, 'Held Back');
  expect((await cloudDump(page)).items).toHaveLength(0); // nothing pushed to an old schema
  expect((await cloudState(page)).pending).toBe(1); // but the change waits
});
