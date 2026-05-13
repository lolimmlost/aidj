/**
 * Manual screenshot harness for PR 3 (source-breakdown pie chart).
 * Not run in CI — invoked ad-hoc via `npx playwright test tests/screenshots/...`.
 *
 * Auth: reuses `tests/.auth/juan.json` saved via `playwright open --save-storage`.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'https://aidj.appahouse.com';
const OUT_DIR = path.join('tests', 'screenshots', 'out');

test.use({
  storageState: 'tests/.auth/juan.json',
  baseURL: BASE,
  viewport: { width: 1440, height: 900 },
});

test('Analytics → Listening tab — full page', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle');

  // Click the Listening tab.
  await page.getByRole('tab', { name: /listening/i }).click();
  // Wait for chart to render (recharts paints async after data arrives).
  await page.waitForResponse((r) => r.url().includes('/api/listening-history/by-source') && r.ok());
  await page.waitForTimeout(500); // recharts animation settle

  await page.screenshot({
    path: path.join(OUT_DIR, '01-listening-full.png'),
    fullPage: true,
  });
});

test('Source breakdown card — zoomed', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: /listening/i }).click();
  await page.waitForResponse((r) => r.url().includes('/api/listening-history/by-source') && r.ok());
  await page.waitForTimeout(500);

  const card = page.locator('text=Plays by Source').locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
  await expect(card).toBeVisible();
  await card.screenshot({ path: path.join(OUT_DIR, '02-source-card.png') });
});

test('Analytics → Overview tab — for regression diff', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(OUT_DIR, '03-overview.png'),
    fullPage: true,
  });
});
