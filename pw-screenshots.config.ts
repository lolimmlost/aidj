import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  retries: 0,
  timeout: 120000,
  use: { baseURL: 'https://aidj.appahouse.com' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } }],
});
