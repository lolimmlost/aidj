import { test } from '@playwright/test';
import path from 'node:path';

test.use({
  storageState: { cookies: [], origins: [] },
  baseURL: 'https://msl.appahouse.com',
  viewport: { width: 1440, height: 900 },
});

test('msl.appahouse.com home — style reference', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'ref-msl-home.png'),
    fullPage: true,
  });
});
