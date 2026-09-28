import { defineConfig } from '@playwright/test';

// Runs against a started stack (pnpm dev). Read-only scenarios; never writes submissions.
// Local: E2E_CHANNEL=chrome uses the installed Chrome instead of downloading a browser.
export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../output/appraisal/e2e-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8208',
    channel: process.env.E2E_CHANNEL || undefined,
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
    trace: 'retain-on-failure',
  },
});
