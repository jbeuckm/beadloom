import { test, expect, type Page } from '@playwright/test';
import { browserItem, fileAction, openFileMenu, waitForReady } from './helpers';

// Staff roles, reports and moderation, against the in-memory fake cloud. The
// fake's setRole stands in for `npm run set-role`, which makes the first admin.

const useFakeCloud = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem('beadloom.cloudFake', '1');
    if (!localStorage.getItem('beadloom.homeMode')) localStorage.setItem('beadloom.homeMode', 'account');
  });
const fake = (page: Page) => page.evaluate(() => (window as any).__beadloomCloudFake.dump() as any);
const setRole = (page: Page, email: string, role: string) =>
  page.evaluate(([e, r]) => (window as any).__beadloomCloudFake.setRole(e, r), [email, role] as const);
const modal = (page: Page) => page.locator('.modal').last();
/** Answer the next prompt (a reason) with `text`. */
const answer = (page: Page, text: string) => page.once('dialog', (d) => d.accept(text));

async function auth(page: Page, email: string, create: string | null) {
  await page.goto('/#/signin?next=/design');
  const card = page.locator('.signin-card');
  if (create) await card.getByRole('button', { name: 'Create account' }).click();
  if (create) await card.locator('input[type="text"]').fill(create);
  await card.locator('input[type="email"]').fill(email);
  await card.locator('.pw-field input').fill('correct-horse');
  await card.getByRole('button', { name: create ? 'Create account' : 'Sign in', exact: true }).click();
}
async function signUp(page: Page, email: string, username: string) {
  await auth(page, email, username);
  await expect(page).toHaveURL(/#\/design$/);
  await waitForReady(page);
  await page.getByRole('button', { name: 'Account' }).click();
  await modal(page).getByLabel('Choose a username').fill(username);
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal(page)).toContainText(`@${username}`);
  await modal(page).getByRole('button', { name: 'Done' }).click();
}
async function signIn(page: Page, email: string) {
  await auth(page, email, null);
  await expect(page).toHaveURL(/#\/design$/);
  await waitForReady(page);
}
async function signOut(page: Page) {
  await page.goto('/#/design');
  await page.getByRole('button', { name: 'Account' }).click();
  await modal(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Sign in/);
}
async function publish(page: Page, name: string) {
  await openFileMenu(page, /Save As/);
  await modal(page).locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await modal(page).locator('#fb-save-name').fill(name);
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, name).click();
  await fileAction(modal(page), 'Share…');
  await modal(page).getByRole('checkbox', { name: /Anyone/ }).check();
  await modal(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toHaveText(/Sharing updated/);
  await modal(page).locator('.fb-footer').getByRole('button', { name: 'Cancel' }).click();
}
const adminTab = (page: Page, tab: string) =>
  page.locator('.admin-tabs').getByRole('tab', { name: tab }).click();

test('report, review, hide: a reported design leaves the gallery; its owner sees why', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'ann@example.com', 'ann');
  await publish(page, 'Mesa');
  await signOut(page);

  // bob reports the design and leaves a rude comment on it
  await signUp(page, 'bob@example.com', 'bob');
  await page.goto('/#/gallery');
  await page.locator('.gallery-card', { hasText: 'Mesa' }).click();
  await modal(page).getByLabel('Write a comment').fill('this is rubbish');
  await modal(page).getByRole('button', { name: 'Post' }).click();
  await expect(modal(page).locator('.comment-list li')).toHaveCount(1);
  answer(page, 'Copied from somewhere else');
  await modal(page).getByRole('button', { name: 'Report' }).click();
  await expect(page.locator('.notice')).toHaveText('Thanks — a moderator will take a look');
  await modal(page).getByRole('button', { name: 'Close' }).click();
  await signOut(page);

  // ann reports the comment (no Report on her own design, though)
  await signIn(page, 'ann@example.com');
  await page.goto('/#/gallery');
  await page.locator('.gallery-card', { hasText: 'Mesa' }).click();
  await expect(modal(page).getByRole('button', { name: 'Report', exact: true })).toHaveCount(0);
  answer(page, 'Rude');
  await modal(page).getByRole('button', { name: 'Report comment' }).click();
  await expect(page.locator('.notice')).toHaveText('Thanks — a moderator will take a look');
  await modal(page).getByRole('button', { name: 'Close' }).click();
  await signOut(page);

  // carol, a moderator, works the queue
  await signUp(page, 'carol@example.com', 'carol');
  await setRole(page, 'carol@example.com', 'moderator');
  await page.goto('/#/home');
  await page.locator('.page-tabs').getByRole('button', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/#\/admin$/);
  const rows = page.locator('.admin-row');
  await expect(rows).toHaveCount(2);
  const design = rows.filter({ hasText: 'Design: Mesa' });
  await expect(design).toContainText('Copied from somewhere else');
  await expect(design).toContainText('@ann');
  answer(page, 'Not the author’s own work');
  await design.getByRole('button', { name: 'Hide' }).click();
  await expect(page.locator('.notice')).toHaveText('Hidden');
  const comment = rows.filter({ hasText: 'Comment' });
  await expect(comment).toContainText('this is rubbish');
  answer(page, 'Rude');
  await comment.getByRole('button', { name: 'Delete comment' }).click();
  await expect(page.locator('.admin-list')).toHaveCount(0);
  await expect(page.locator('.admin')).toContainText('No open reports');
  await adminTab(page, 'Gallery');
  await expect(page.locator('.admin-row', { hasText: 'Mesa' })).toContainText('hidden: Not the author’s own work');
  await adminTab(page, 'Log');
  await expect(page.locator('.admin-log tbody tr')).toHaveCount(2);
  await expect(page.locator('.admin-log')).toContainText('hide design');
  await expect(page.locator('.admin-log')).toContainText('delete comment');
  const server = await fake(page);
  expect(server.comments).toEqual([]);
  expect(server.reports.every((r: any) => r.resolved)).toBe(true);
  await signOut(page);

  // gone from the gallery, for everyone but ann, who's told why
  await page.goto('/#/gallery');
  await expect(page.locator('.gallery-card', { hasText: 'Mesa' })).toHaveCount(0);
  await signIn(page, 'ann@example.com');
  await openFileMenu(page, /⊟ Open/);
  await modal(page).locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await browserItem(page, 'Mesa').click();
  await fileAction(modal(page), 'Share…');
  await expect(modal(page)).toContainText('A moderator hid this design from everyone but you. Reason: Not the author’s own work');
});

test('people: moderators suspend; admins set roles and ban; the page is staff-only', async ({ page }) => {
  await useFakeCloud(page);
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'bob@example.com', 'bob');
  await page.goto('/#/admin'); // not staff
  await expect(page.locator('.full-page')).toContainText('This page is for moderators and admins');
  await expect(page.locator('.page-tabs').getByRole('button', { name: 'Admin' })).toHaveCount(0);
  await signOut(page);
  await signUp(page, 'carol@example.com', 'carol');
  await signOut(page);

  await signUp(page, 'dan@example.com', 'dan');
  await setRole(page, 'dan@example.com', 'admin');
  await page.goto('/#/home');
  await page.locator('.page-tabs').getByRole('button', { name: 'Admin' }).click();
  await adminTab(page, 'People');
  const person = (email: string) => page.locator('.admin-row', { hasText: email });
  await expect(person('dan@example.com').getByRole('button', { name: 'Ban' })).toHaveCount(0); // not yourself
  answer(page, 'Spamming friend requests');
  await person('bob@example.com').getByRole('button', { name: 'Suspend' }).click();
  await expect(person('bob@example.com')).toContainText('Suspended: Spamming friend requests');
  await person('carol@example.com').getByLabel('Role of carol@example.com').selectOption('moderator');
  await expect(person('carol@example.com')).toContainText('moderator');
  await signOut(page);

  // bob, suspended: told why, and can't publish
  await signIn(page, 'bob@example.com');
  await page.goto('/#/home');
  await expect(page.locator('.home-callout.suspended')).toContainText('Spamming friend requests');
  await page.getByRole('button', { name: /^Designer/ }).click();
  await openFileMenu(page, /Save As/);
  await modal(page).locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await modal(page).locator('#fb-save-name').fill('Nope');
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, 'Nope').click();
  await fileAction(modal(page), 'Share…');
  await modal(page).getByRole('checkbox', { name: /Anyone/ }).check();
  await modal(page).getByRole('button', { name: 'Save' }).click();
  await expect(modal(page).locator('.acct-error')).toContainText('suspended');
  await modal(page).getByRole('button', { name: 'Cancel' }).click();
  await modal(page).locator('.fb-footer').getByRole('button', { name: 'Cancel' }).click();
  await signOut(page);

  // carol, now a moderator, can suspend but not ban or change roles
  await signIn(page, 'carol@example.com');
  await page.goto('/#/admin');
  await adminTab(page, 'People');
  await expect(person('bob@example.com').getByRole('button', { name: 'Unsuspend' })).toBeVisible();
  await expect(page.locator('.admin-row select')).toHaveCount(0);
  await expect(page.locator('.admin-row').getByRole('button', { name: 'Ban' })).toHaveCount(0);
  await signOut(page);

  // dan bans bob: no signing in
  await signIn(page, 'dan@example.com');
  await page.goto('/#/admin');
  await adminTab(page, 'People');
  answer(page, 'Kept at it');
  await person('bob@example.com').getByRole('button', { name: 'Ban' }).click();
  await expect(person('bob@example.com')).toContainText('Banned');
  await adminTab(page, 'Log');
  await expect(page.locator('.admin-log')).toContainText('ban user');
  await expect(page.locator('.admin-log')).toContainText('role:moderator user');
  await signOut(page);
  await auth(page, 'bob@example.com', null);
  await expect(page.locator('.signin-card .acct-error')).toHaveText('This account has been banned');
});
