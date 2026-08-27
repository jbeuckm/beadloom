// Opens the running app in Chrome under an iPad Pro 11" (landscape) emulation
// profile — touch events, mobile UA, 1194×834 @2x — the app's target device.
//
//   npm run dev            # in one terminal (serves http://localhost:5847)
//   npm run preview:ipad   # in another — opens the emulated window
//
// Override the URL with:  URL=http://localhost:4173 npm run preview:ipad
// Close the Chrome window to end the process.

import { chromium, devices } from '@playwright/test';

const url = process.env.URL || 'http://localhost:5847';
const ipad = devices['iPad Pro 11 landscape'];

async function launch() {
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' });
  } catch {
    console.warn('Google Chrome not found — falling back to bundled Chromium.');
    return chromium.launch({ headless: false });
  }
}

const browser = await launch();
const context = await browser.newContext({ ...ipad });
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
} catch (err) {
  console.error(`Could not reach ${url} — is "npm run dev" running?\n${err.message}`);
}

console.log(
  `iPad Pro 11" (landscape) profile → ${url}\n` +
    `viewport ${ipad.viewport.width}×${ipad.viewport.height} @${ipad.deviceScaleFactor}x, touch on.\n` +
    'Close the Chrome window to stop.',
);

await new Promise((resolve) => browser.on('disconnected', resolve));
process.exit(0);
