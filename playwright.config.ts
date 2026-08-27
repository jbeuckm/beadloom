import { defineConfig, devices } from '@playwright/test';

// iPad Pro 11" logical viewport, landscape — this is an iPad-first app.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5847',
    viewport: { width: 1194, height: 834 },
    deviceScaleFactor: 2,
    hasTouch: true,
    trace: 'on-first-retry',
    // `SLOWMO=350 npx playwright test … --headed` to watch a run in slow motion.
    launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
  },
  projects: [
    {
      name: 'ipad-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1194, height: 834 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5847',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
