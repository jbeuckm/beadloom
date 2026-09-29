import { defineConfig, devices } from '@playwright/test';

// iPad Pro 11" logical viewport, landscape — this is an iPad-first app.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5848',
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
  // Its own port, so a running `npm run dev` (which reads .env, and so talks
  // to the real Neon) is never reused; blank Neon settings keep the app
  // local-only unless a test turns on the in-memory fake cloud.
  webServer: {
    command: 'npx vite --port 5848 --strictPort',
    env: { VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_API_URL: '' },
    url: 'http://localhost:5848',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
