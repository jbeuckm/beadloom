import { test, expect, type Page } from '@playwright/test';
import { browserItem, fileAction, fileActionItem, openFileMenu, pickTool, snapshot, tapCell, waitForReady } from './helpers';

// Home page, usernames, friends, sharing and profile pictures, against the
// in-memory fake cloud (lib/cloud/fake.ts). The fake keeps its "server" in
// localStorage, so one page can play several users by signing out and in.

const useFakeCloud = (page: Page, homeMode?: 'local' | 'account') =>
  page.addInitScript((mode) => {
    localStorage.setItem('beadloom.cloudFake', '1');
    if (mode && !localStorage.getItem('beadloom.homeMode')) localStorage.setItem('beadloom.homeMode', mode);
  }, homeMode);

const fake = (page: Page) =>
  page.evaluate(() => (window as any).__beadloomCloudFake.dump() as any);
const modal = (page: Page) => page.locator('.modal').last();
/** Go to the Gallery or Journal page (its address; the header tabs are tested
 *  in the site-map test). */
async function openPage(page: Page, name: 'Gallery' | 'Journal') {
  await page.evaluate((p) => (location.hash = `#/${p}`), name.toLowerCase());
  await expect(page.locator('.page-tabs [aria-current="page"]')).toHaveText(name);
}
async function backToDesigning(page: Page) {
  await page.getByRole('button', { name: /^Designer/ }).click();
  await expect(page.locator('.full-page')).toHaveCount(0);
}

/** From the designer: the Account button (signed out) goes to the sign-in page,
 *  which comes back to the designer; then open the Account dialog. */
async function authOnPage(page: Page, fill: (card: ReturnType<Page['locator']>) => Promise<void>) {
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page).toHaveURL(/#\/signin\?next=/);
  await fill(page.locator('.signin-card'));
  await expect(page).toHaveURL(/#\/design$/);
  await page.getByRole('button', { name: 'Account' }).click();
}
async function signUp(page: Page, email: string, username: string) {
  await authOnPage(page, async (card) => {
    await card.getByRole('button', { name: 'Create account' }).click();
    await card.locator('input[type="text"]').fill(username);
    await card.locator('input[type="email"]').fill(email);
    await card.locator('.pw-field input').fill('correct-horse');
    await card.getByRole('button', { name: 'Create account' }).click();
  });
  const m = modal(page);
  await expect(m).toContainText(email);
  await m.getByLabel('Choose a username').fill(username);
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(m).toContainText(`@${username}`);
}
async function signIn(page: Page, email: string) {
  await authOnPage(page, async (card) => {
    await card.locator('input[type="email"]').fill(email);
    await card.locator('.pw-field input').fill('correct-horse');
    await card.getByRole('button', { name: 'Sign in', exact: true }).click();
  });
  await expect(modal(page)).toContainText(email);
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account' }).click();
  await modal(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Account' })).toHaveText(/Sign in/);
}
async function saveAs(page: Page, name: string) {
  await openFileMenu(page, /Save As/);
  const m = modal(page);
  await m.locator('#fb-save-name').fill(name);
  await m.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).cloud.status).toBe('synced');
}

test('site map: no pages without accounts; the welcome for new visitors, sign in, then their home', async ({
  page,
}) => {
  await page.goto('/');
  await waitForReady(page);
  await expect(page).toHaveURL(/#\/design$/); // no accounts: straight to designing
  await expect(page.locator('.home')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Home' })).toHaveCount(0);
  await expect(page.locator('.topbar .brand')).toHaveText('Chromattice');

  // a new visitor: the welcome
  await useFakeCloud(page);
  await page.goto('/');
  await expect(page).toHaveURL(/#\/welcome$/);
  const welcome = page.locator('.home');
  await expect(welcome).toContainText('On this device only');
  await expect(welcome).toContainText('With an account');
  await page.keyboard.press('e'); // keys don't reach the editor behind it
  expect((await snapshot(page)).tool).not.toBe('eraser');
  await welcome.locator('.explore-card', { hasText: 'Gallery' }).click();
  await expect(page).toHaveURL(/#\/gallery$/);
  await expect(page.locator('.full-page')).toContainText('Nothing published yet');
  await page.locator('.page-tabs').getByRole('button', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/#\/journal$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/gallery$/);
  await page.locator('.page-brand').click(); // the start page: still the welcome
  await expect(page).toHaveURL(/#\/welcome$/);

  // this device only: their home, with a way to sign in
  await page.getByRole('button', { name: 'Use on this device' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('.continue-card')).toContainText('Untitled Pattern');
  await expect(page.locator('.home-modes')).toHaveCount(0); // the choice is the welcome's alone
  await expect(page.locator('.home-callout')).toContainText("You're working on this device only");
  await page.locator('.continue-card').click();
  await expect(page).toHaveURL(/#\/design$/);
  await waitForReady(page);
  // not signed in, the start page is the welcome again, remembering the choice
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/#\/welcome$/);
  await expect(page.locator('.home-mode.current')).toContainText('On this device only');

  // the account card goes to the sign-in page, and signing up lands at home
  await page.getByRole('button', { name: 'Sign in or create an account' }).click();
  await expect(page).toHaveURL(/#\/signin\?next=/);
  const card = page.locator('.signin-card');
  await card.getByRole('button', { name: 'Create account' }).click();
  await card.locator('input[type="text"]').fill('Ann');
  await card.locator('input[type="email"]').fill('ann@example.com');
  await card.locator('.pw-field input').fill('correct-horse');
  await card.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('.page-title')).toHaveText('Welcome back');
  await expect(page.getByRole('button', { name: 'Signed in as ann@example.com' })).toBeVisible();
  // signed in, the start page is home
  await backToDesigning(page);
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/#\/home$/);

  // or, in Settings, straight back to the design
  await backToDesigning(page);
  await openFileMenu(page, /Settings/);
  await modal(page).getByRole('radio', { name: /straight back to my last design/ }).check();
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await page.goto('/');
  await expect(page).toHaveURL(/#\/design$/);
  await expect(page.locator('.home')).toHaveCount(0);
});

test('friends: find by username, request, accept; share with a friend and with anyone', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);

  await signUp(page, 'ann@example.com', 'ann');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);

  // bob finds ann by username and asks
  await signUp(page, 'bob@example.com', 'bob');
  let m = modal(page);
  await m.getByLabel('Add a friend').fill('an');
  await m.locator('.find-people li', { hasText: '@ann' }).getByRole('button', { name: 'Add friend' }).click();
  await expect(m.locator('.friend-list li', { hasText: '@ann' })).toContainText('request sent');
  await m.getByRole('button', { name: 'Done' }).click();
  await signOut(page);

  // ann accepts, saves a design, shares it with bob and with anyone
  await signIn(page, 'ann@example.com');
  m = modal(page);
  await m.locator('.friend-list li', { hasText: '@bob' }).getByRole('button', { name: 'Accept' }).click();
  await expect(m.locator('.friend-list li', { hasText: '@bob' })).toContainText('Remove');
  await m.getByRole('button', { name: 'Done' }).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 3, 3);
  await saveAs(page, 'Starburst');

  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, 'Starburst').click();
  await fileAction(modal(page), 'Share…');
  m = modal(page);
  await expect(m.locator('h2')).toHaveText('Share “Starburst”');
  await m.getByRole('checkbox', { name: /Anyone/ }).check();
  await m.getByRole('checkbox', { name: '@bob' }).check();
  await m.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toHaveText(/Sharing updated/);
  let server = await fake(page);
  const item = server.items.find((i: any) => i.path === 'Starburst');
  expect(item.published).toBe(true);
  expect(server.shares).toEqual([{ item_id: item.id, grantee_id: server.profiles.find((p: any) => p.username === 'bob').user_id }]);

  // her own library doesn't pull anything that isn't hers
  await page.keyboard.press('Escape');
  await signOut(page);

  // signed out, the gallery shows it, without who made it
  await openPage(page, 'Gallery');
  const card = page.locator('.gallery-card', { hasText: 'Starburst' });
  await expect(card).toBeVisible();
  await expect(card.locator('.gallery-by')).toHaveCount(0);
  await backToDesigning(page);

  // bob sees it under Shared with me, grouped by owner, and opens a copy
  await signIn(page, 'bob@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  expect((await snapshot(page)).cloud.status).toBe('synced');
  expect((await fake(page)).items.filter((i: any) => i.owner_id !== item.owner_id)).toHaveLength(0);
  await openFileMenu(page, /⊟ Open/);
  await page.locator('.modal .fb-side-item', { hasText: 'Shared with me' }).click();
  await page.locator('.modal .fb-main .fb-item', { hasText: '@ann' }).dblclick();
  await browserItem(page, 'Starburst').dblclick();
  await expect(page.locator('.modal')).toHaveCount(0);
  expect((await snapshot(page)).name).toBe('Starburst');

  // signed in, the gallery says who made it
  await openPage(page, 'Gallery');
  await expect(page.locator('.gallery-card', { hasText: 'Starburst' }).locator('.gallery-by')).toContainText('@ann');
  await backToDesigning(page);

  // unfriending takes the share back
  await page.getByRole('button', { name: 'Account' }).click();
  page.once('dialog', (d) => d.accept());
  await modal(page).locator('.friend-list li', { hasText: '@ann' }).getByRole('button', { name: 'Remove' }).click();
  await expect(modal(page).locator('.friend-list li', { hasText: '@ann' })).toHaveCount(0);
  server = await fake(page);
  expect(server.shares).toEqual([]);
  expect(server.friendships).toEqual([]);
});

test('a saved design becomes the profile picture, shown to friends', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'cat@example.com', 'cat');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 1, 1);
  await saveAs(page, 'Face');

  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, 'Face').click();
  await fileAction(modal(page), 'Use as profile picture');
  await expect(page.locator('.notice')).toHaveText('“Face” is your profile picture');
  const server = await fake(page);
  expect(server.profiles[0].avatar).toMatch(/^data:image\/png;base64,/);
  expect(server.profiles[0].avatar.length).toBeLessThanOrEqual(60000);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Account' }).click();
  await expect(modal(page).locator('.acct-username img.avatar')).toHaveAttribute('src', /^data:image\/png/);
});

test('Share is for Cloud Storage only; another account never sees the last one’s Cloud Storage', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  await signUp(page, 'dan@example.com', 'dan');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await saveAs(page, 'Dans Cloud');

  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, 'Dans Cloud').click();
  await expect(await fileActionItem(modal(page), 'Share…')).toBeEnabled();
  await modal(page).getByRole('button', { name: 'More actions' }).click();
  await modal(page).getByLabel('Move to folder').selectOption({ label: 'Local Storage' });
  await modal(page).locator('.fb-side-item', { hasText: 'Local Storage' }).click();
  await browserItem(page, 'Dans Cloud').click();
  await expect(await fileActionItem(modal(page), 'Share…')).toBeDisabled();
  await modal(page).getByRole('button', { name: 'More actions' }).click();
  await modal(page).getByLabel('Move to folder').selectOption({ label: 'Cloud Storage' });
  await expect.poll(async () => (await fake(page)).items.filter((i: any) => !i.deleted_at).length).toBe(1);
  await page.keyboard.press('Escape');
  await signOut(page);

  await signUp(page, 'eve@example.com', 'eve');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await snapshot(page)).cloud.status).toBe('synced');
  await openFileMenu(page, /⊟ Open/);
  await modal(page).locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await expect(modal(page).locator('.fb-empty')).toHaveText('This folder is empty.');
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage['beadloom.cloud.designs'] || '{}')))).toEqual([]);
});

/** ann publishes “Mesa” and returns its cloud id; leaves ann signed in. */
async function annPublishes(page: Page) {
  await signUp(page, 'ann@example.com', 'ann');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 4, 4);
  await saveAs(page, 'Mesa');
  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, 'Mesa').click();
  await fileAction(modal(page), 'Share…');
  await modal(page).getByRole('checkbox', { name: /Anyone/ }).check();
  await modal(page).getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');
  return (await fake(page)).items.find((i: any) => i.path === 'Mesa').id as string;
}

test('like, rate and comment on a gallery design; links in comments get preview cards', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  const id = await annPublishes(page);
  await signOut(page);

  await signUp(page, 'bob@example.com', 'bob');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await openPage(page, 'Gallery');
  await expect(page.locator('.page-brand > span')).toHaveText('Chromattice');
  await page.locator('.gallery-card', { hasText: 'Mesa' }).click();
  const m = modal(page);
  await m.getByRole('button', { name: 'Like' }).click();
  await m.getByRole('radio', { name: '4 stars' }).click();
  await expect(m.locator('.reaction-bar')).toContainText('4 from 1 rating');
  await m.getByLabel('Write a comment').fill(`Love it! Compare ${page.url().split('#')[0]}#design=${id} and https://example.com/beads/guide.`);
  await m.getByRole('button', { name: 'Post' }).click();
  await expect(m.locator('.comment-list li')).toHaveCount(1);
  await expect(m.locator('.comment-list')).toContainText('@bob');
  const cards = m.locator('.comment-list .link-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Mesa');
  await expect(cards.nth(0)).toContainText('@ann');
  await expect(cards.nth(1)).toContainText('example.com');
  await expect(cards.nth(1)).toContainText('/beads/guide');
  await expect(cards.nth(1)).toHaveAttribute('target', '_blank');
  const server = await fake(page);
  expect(server.reactions).toMatchObject([{ item_id: id, liked: true, stars: 4 }]);
  await m.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.gallery-card', { hasText: 'Mesa' }).locator('.reaction-summary')).toContainText('1');

  // signed out: the totals, but no liking and no comments
  await backToDesigning(page);
  await signOut(page);
  await openPage(page, 'Gallery');
  await page.locator('.gallery-card', { hasText: 'Mesa' }).click();
  await expect(modal(page).getByRole('button', { name: 'Like' })).toBeDisabled();
  await expect(modal(page).locator('.reaction-bar')).toContainText('sign in to like and rate');
  await expect(modal(page)).toContainText('Sign in to read and write comments');
  await modal(page).getByRole('button', { name: 'Close' }).click();
  await backToDesigning(page);

  // the owner can like and rate her own too, and delete the comment
  await signIn(page, 'ann@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await openPage(page, 'Gallery');
  await page.locator('.gallery-card', { hasText: 'Mesa' }).click();
  await modal(page).getByRole('radio', { name: '5 stars' }).click();
  await expect(modal(page).locator('.reaction-bar')).toContainText('4.5 from 2 ratings');
  await expect.poll(async () => (await fake(page)).reactions.length).toBe(2);
  page.once('dialog', (d) => d.accept());
  await modal(page).getByRole('button', { name: 'Delete comment' }).click();
  await expect(modal(page).locator('.comment-list li')).toHaveCount(0);
});

test('a shared link opens the design in the Gallery', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  const id = await annPublishes(page);
  await signOut(page);
  await page.goto(`/#design=${id}`);
  await expect(page.locator('.home')).toBeVisible();
  await expect(modal(page).locator('h2')).toHaveText('Mesa');
  // signing out left ann's Cloud Storage design open but unsaved: asked first
  page.once('dialog', (d) => d.accept());
  await modal(page).getByRole('button', { name: 'Open a copy' }).click();
  await expect(page.locator('.home')).toHaveCount(0);
  expect((await snapshot(page)).name).toBe('Mesa');
  await expect(page).toHaveURL(/#\/design$/);
});

test('notifications: new activity shows up, and Settings turns kinds off', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  const check = () => page.evaluate(() => (window as any).__beadloomActivity.check() as Promise<Array<{ kind: string; body: string }>>);

  await signUp(page, 'ann@example.com', 'ann'); // the first look is a silent baseline
  await modal(page).getByRole('button', { name: 'Done' }).click();
  expect(await check()).toEqual([]);
  await signOut(page);

  await signUp(page, 'bob@example.com', 'bob');
  await modal(page).getByLabel('Add a friend').fill('ann');
  await modal(page).locator('.find-people li', { hasText: '@ann' }).getByRole('button', { name: 'Add friend' }).click();
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);

  await signIn(page, 'ann@example.com');
  await expect(page.locator('.notice')).toHaveText('Friend request — @bob wants to be friends');
  await modal(page).getByRole('button', { name: 'Notifications…' }).click();
  const settings = modal(page);
  await expect(settings.locator('h2')).toHaveText('Settings');
  await settings.getByRole('checkbox', { name: /Accepted requests/ }).uncheck();
  await settings.getByRole('button', { name: 'Done' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage['beadloom.notify']).kinds.friendAccepted)).toBe(false);

  // bob gets told ann accepted — unless he turned that off
  await page.getByRole('button', { name: 'Account' }).click();
  await modal(page).locator('.friend-list li', { hasText: '@bob' }).getByRole('button', { name: 'Accept' }).click();
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);
  await signIn(page, 'bob@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.notice')).toHaveCount(0);
  expect(await check()).toEqual([]); // nothing new since, and the one there was is off
  await openFileMenu(page, /Settings/);
  await expect(modal(page).getByRole('checkbox', { name: /Accepted requests/ })).not.toBeChecked();
});

/** ann and bob are friends; cat is not; leaves everyone signed out. */
async function annAndBob(page: Page) {
  await signUp(page, 'cat@example.com', 'cat');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);
  await signUp(page, 'ann@example.com', 'ann');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);
  await signUp(page, 'bob@example.com', 'bob');
  await modal(page).getByLabel('Add a friend').fill('ann');
  await modal(page).locator('.find-people li', { hasText: '@ann' }).getByRole('button', { name: 'Add friend' }).click();
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);
  await signIn(page, 'ann@example.com');
  await modal(page).locator('.friend-list li', { hasText: '@bob' }).getByRole('button', { name: 'Accept' }).click();
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await signOut(page);
}
const journal = (page: Page) => page.locator('.journal');

test('journal: write about a design for friends, then for anyone; drafts stay private', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  await annAndBob(page);
  const bobCheck = () =>
    page.evaluate(() => (window as any).__beadloomActivity.check() as Promise<Array<{ kind: string; body: string }>>);
  await signIn(page, 'bob@example.com'); // bob's notification baseline
  await modal(page).getByRole('button', { name: 'Done' }).click();
  expect(await bobCheck()).toEqual([]);
  await signOut(page);

  // ann writes about an unshared, unpublished design, for friends
  await signIn(page, 'ann@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 5, 5);
  await saveAs(page, 'Butte');
  await openFileMenu(page, /⊟ Open/);
  await browserItem(page, 'Butte').click();
  await fileAction(modal(page), 'Write about this…');
  let m = modal(page);
  await expect(m.locator('.post-pick.on')).toContainText('Butte');
  await m.getByLabel('Title').fill('How Butte came together');
  await m.getByLabel('Post').fill('# The idea\nStarted from **one** bead.\n- rows 1–4 *terracotta*\n- then turquoise');
  await m.getByRole('radio', { name: 'Friends' }).click();
  await m.getByRole('button', { name: 'Post' }).click();
  await expect(page.locator('.notice')).toHaveText('Posted');
  await page.keyboard.press('Escape');
  const server = await fake(page);
  expect(server.posts).toHaveLength(1);
  const postId = server.posts[0].id;
  expect(server.items.find((i: any) => i.path === 'Butte').published).toBeFalsy();

  // and a draft
  await openPage(page, 'Journal');
  await journal(page).getByRole('button', { name: 'Write a post' }).click();
  await modal(page).getByLabel('Title').fill('Secret plans');
  await modal(page).getByRole('button', { name: 'Save draft' }).click();
  await page.keyboard.press('Escape');
  await expect(journal(page).locator('.post-card')).toHaveCount(1); // Everyone: not the draft
  await journal(page).getByRole('tab', { name: 'Mine' }).click();
  await expect(journal(page).locator('.post-card')).toHaveCount(2);
  await expect(journal(page).locator('.post-card', { hasText: 'Secret plans' })).toContainText('Draft');
  await backToDesigning(page);
  await signOut(page);

  // bob, a friend: told about it, reads it, and sees the design in it
  await signIn(page, 'bob@example.com'); // signing in checks for news
  await expect(page.locator('.notice')).toHaveText('@ann posted — How Butte came together');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await openPage(page, 'Journal');
  await expect(journal(page).locator('.post-card')).toHaveCount(1);
  await journal(page).locator('.post-card', { hasText: 'How Butte came together' }).click();
  m = modal(page);
  await expect(m.locator('.markup h3')).toHaveText('The idea');
  await expect(m.locator('.markup strong')).toHaveText('one');
  await expect(m.locator('.markup li')).toHaveCount(2);
  await expect(m.locator('.post-designs')).toContainText('Butte');
  await expect(m.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await m.getByRole('button', { name: 'Close' }).click();
  await backToDesigning(page);
  await signOut(page);

  // cat and signed-out visitors don't see a friends post
  await openPage(page, 'Journal');
  await expect(journal(page)).toContainText('No posts yet.');
  await backToDesigning(page);
  await signIn(page, 'cat@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await openPage(page, 'Journal');
  await expect(journal(page)).toContainText('No posts yet.');
  await backToDesigning(page);
  await signOut(page);

  // ann makes it public: now anyone reads it, design included (without who wrote it)
  await signIn(page, 'ann@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await openPage(page, 'Journal');
  await journal(page).locator('.post-card', { hasText: 'How Butte' }).click();
  await modal(page).getByRole('button', { name: 'Edit' }).click();
  await modal(page).getByRole('radio', { name: 'Anyone' }).click();
  await modal(page).getByRole('button', { name: 'Post' }).click();
  await modal(page).getByRole('button', { name: 'Close' }).click();
  await backToDesigning(page);
  await signOut(page);
  await page.goto(`/#post=${postId}`);
  await expect(modal(page).locator('h2')).toHaveText('How Butte came together');
  await expect(modal(page).locator('.post-byline')).not.toContainText('@ann');
  await expect(modal(page).locator('.post-designs')).toContainText('Butte');
});

test('the personal home: designs from both stores, activity to act on, friends’ shares, your journal', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  // signed out, a save goes to Local Storage
  await openFileMenu(page, /Save As/);
  await modal(page).locator('#fb-save-name').fill('Kept Local');
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await signUp(page, 'ann@example.com', 'ann');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await pickTool(page, 'Pen');
  await tapCell(page, 2, 2);
  await openFileMenu(page, /Save As/); // Save As remembers Local Storage: pick Cloud Storage
  await modal(page).locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await modal(page).locator('#fb-save-name').fill('In The Cloud');
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await fake(page)).items.map((i: any) => i.path)).toContain('In The Cloud');
  await signOut(page);

  // bob asks ann to be friends, and will share a design with her once they are
  await signUp(page, 'bob@example.com', 'bob');
  await modal(page).getByLabel('Add a friend').fill('ann');
  await modal(page).locator('.find-people li', { hasText: '@ann' }).getByRole('button', { name: 'Add friend' }).click();
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await saveAs(page, 'Bobs Gift');
  await signOut(page);

  await signIn(page, 'ann@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  const home = page.locator('.personal-home');
  // Continue is whatever's open in the designer: bob's, which was in his Cloud
  // Storage, so for ann it's there but not saved anywhere of hers
  await expect(home.locator('.continue-card')).toContainText('Bobs Gift');
  await expect(home.locator('.continue-card')).toContainText('Not saved yet');
  const tile = (name: string) => home.locator('.design-tile', { hasText: name });
  await expect(tile('In The Cloud').locator('.store-badge')).toHaveText('Cloud');
  await expect(tile('Kept Local').locator('.store-badge')).toHaveText('Local');

  // the request is right there to accept
  const req = home.locator('.activity-item.request', { hasText: '@bob' });
  await req.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.notice')).toHaveText('You and @bob are friends');
  await expect(req).toHaveCount(0);

  // a draft in the journal
  await home.getByRole('button', { name: 'Write a post' }).click();
  await modal(page).getByLabel('Title').fill('Notes to self');
  await modal(page).getByRole('button', { name: 'Save draft' }).click();
  await expect(home.locator('.home-section', { hasText: 'Your journal' })).toContainText('Notes to self');
  await expect(home.locator('.home-section', { hasText: 'Your journal' })).toContainText('Draft');

  // opening a design from Home takes you to it in the designer (after asking
  // about the unsaved one that's open)
  page.once('dialog', (d) => d.accept());
  await tile('Kept Local').click();
  await expect(page).toHaveURL(/#\/design$/);
  expect((await snapshot(page)).slotPath).toBe('Local Storage/Kept Local');
  await signOut(page);

  // bob shares with his new friend, and she sees it from Home
  await signIn(page, 'bob@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await snapshot(page)).cloud.status).toBe('synced'); // his Cloud Storage, back
  await openFileMenu(page, /⊟ Open/);
  await modal(page).locator('.fb-side-item', { hasText: 'Cloud Storage' }).click();
  await browserItem(page, 'Bobs Gift').click();
  await fileAction(modal(page), 'Share…');
  await modal(page).getByRole('checkbox', { name: '@ann' }).check();
  await modal(page).getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');
  await signOut(page);
  await signIn(page, 'ann@example.com');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  const friends = home.locator('.home-section', { hasText: 'From friends' });
  await expect(friends.locator('.friend-strip')).toContainText('@bob');
  await friends.locator('.design-tile', { hasText: 'Bobs Gift' }).click();
  await expect(page).toHaveURL(/#\/gallery\/[0-9a-f-]{36}$/);
  await expect(modal(page).locator('h2')).toHaveText('Bobs Gift');
  // and it's in her activity too
  await modal(page).getByRole('button', { name: 'Close' }).click();
  await page.locator('.page-brand').click();
  await expect(home.locator('.activity-item', { hasText: 'Shared with you' })).toContainText('@bob shared “Bobs Gift”');
});

test('your designs: all of them, by folder, with search, filters and folders that fold', async ({ page }) => {
  await useFakeCloud(page, 'local');
  await page.goto('/#/design');
  await waitForReady(page);
  // five designs in three places, one on a square grid
  await page.evaluate(() => {
    const s = (window as any).__beadloom.getState();
    const save = (name: string, folder: string) => (window as any).__beadloom.getState().saveToSlot(name, folder);
    save('Loose One', 'Local Storage');
    save('Belt Blue', 'Local Storage/Gifts');
    save('Belt Red', 'Local Storage/Gifts');
    save('Rug Draft', 'Local Storage/Rugs');
    s.setCellAspect(1);
    save('Square Tile', 'Local Storage/Rugs');
  });
  await page.goto('/#/home');
  const mine = page.locator('.home-section', { hasText: 'Your designs' });
  await expect(mine.locator('.design-count')).toHaveText('5 designs');
  const folder = (label: string) => mine.locator('.design-folder', { has: page.locator('.design-folder-head', { hasText: label }) });
  await expect(folder('Local Storage › Gifts').locator('.design-tile')).toHaveCount(2);
  await expect(folder('Local Storage › Rugs').locator('.design-tile')).toHaveCount(2);
  await expect(folder('Local Storage › Gifts').locator('.design-folder-head')).toContainText('2');

  // search: flat, each result says where it lives
  await mine.getByLabel('Find a design').fill('belt');
  await expect(mine.locator('.design-folder')).toHaveCount(0);
  await expect(mine.locator('.design-tile')).toHaveCount(2);
  await expect(mine.locator('.design-tile', { hasText: 'Belt Red' })).toContainText('Local Storage › Gifts');
  await expect(mine.locator('.design-count')).toHaveText('2 of 5 designs');
  await mine.getByLabel('Find a design').fill('');

  // the grid-type filter
  await mine.getByLabel('Grid type').selectOption('Square');
  await expect(mine.locator('.design-tile')).toHaveCount(1);
  await expect(mine.locator('.design-tile')).toContainText('Square Tile');
  await mine.getByLabel('Grid type').selectOption('');

  // folding a folder, remembered
  await folder('Local Storage › Gifts').locator('.design-folder-head').click();
  await expect(folder('Local Storage › Gifts').locator('.design-tile')).toHaveCount(0);
  await page.reload();
  await expect(folder('Local Storage › Gifts').locator('.design-folder-head')).toHaveAttribute('aria-expanded', 'false');
  await expect(folder('Local Storage › Rugs').locator('.design-tile')).toHaveCount(2);

  // and a tile opens its design
  await folder('Local Storage › Rugs').locator('.design-tile', { hasText: 'Rug Draft' }).click();
  await expect(page).toHaveURL(/#\/design$/);
  expect((await snapshot(page)).slotPath).toBe('Local Storage/Rugs/Rug Draft');
});

test('the designer connects: a way to every page, where it’s saved, and Share for the open design', async ({ page }) => {
  await useFakeCloud(page, 'account');
  await page.goto('/#/design');
  await waitForReady(page);
  const status = page.locator('.save-status');

  // the Go to menu, beside the mark
  await page.getByRole('button', { name: 'Go to' }).click();
  await page.locator('.menu-pop .menu-item', { hasText: 'Gallery' }).click();
  await expect(page).toHaveURL(/#\/gallery$/);
  await backToDesigning(page);
  await page.getByRole('button', { name: 'Go to' }).click();
  await page.locator('.menu-pop .menu-item', { hasText: 'Journal' }).click();
  await expect(page).toHaveURL(/#\/journal$/);
  await backToDesigning(page);

  // save status: nothing yet → a save → a change → tap to save
  await expect(status).toContainText('Not saved yet');
  await openFileMenu(page, /Save As/);
  await modal(page).locator('#fb-save-name').fill('Stripe');
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status).toContainText('Saved · Local');
  await pickTool(page, 'Pen');
  await tapCell(page, 1, 1);
  await expect(status).toContainText('Unsaved changes');
  await status.click();
  await expect(status).toContainText('Saved · Local');

  // Share, signed out: sign in first (and come back)
  await page.getByRole('button', { name: 'Share this design' }).click();
  await expect(page).toHaveURL(/#\/signin\?next=/);
  await page.goBack();

  // signed in: a local design is moved to Cloud Storage, then shared
  await signUp(page, 'sam@example.com', 'sam');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Share this design' }).click();
  await expect(modal(page)).toContainText('It’s in Local Storage, on this device only.');
  await modal(page).getByRole('button', { name: 'Move to Cloud Storage and share' }).click();
  await expect(modal(page).locator('h2')).toHaveText('Share “Stripe”');
  await expect(modal(page).getByRole('checkbox', { name: /Anyone/ })).toBeVisible();
  expect((await snapshot(page)).slotPath).toBe('Cloud Storage/Stripe');
  await expect(status).toContainText('Saved · Cloud');
  await modal(page).getByRole('button', { name: 'Cancel' }).click();

  // a new, unsaved design is saved there first — beside, not over, one of the same name
  await openFileMenu(page, /New/);
  await modal(page).locator('input[type="text"]').fill('Stripe');
  await modal(page).getByRole('button', { name: 'Create' }).click();
  await waitForReady(page);
  await page.getByRole('button', { name: 'Share this design' }).click();
  await modal(page).getByRole('button', { name: 'Save to Cloud Storage and share' }).click();
  await expect(modal(page).locator('h2')).toHaveText('Share “Stripe 2”');
  await expect.poll(async () => (await fake(page)).items.map((i: any) => i.path).sort()).toEqual(['Stripe', 'Stripe 2']);
});
