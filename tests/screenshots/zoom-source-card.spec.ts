import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('Zoom on Plays-by-Source card', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle');

  const tabs = page.locator('[role="tablist"]').filter({ has: page.getByRole('tab', { name: 'Listening', exact: true }) });
  await tabs.getByRole('tab', { name: 'Listening', exact: true }).click();
  await page.waitForResponse((r) => r.url().includes('/api/listening-history/by-source') && r.ok());
  await page.waitForTimeout(1500); // give recharts plenty of animation time

  const card = page.locator('text=Plays by Source').locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
  await expect(card).toBeVisible();
  await card.screenshot({ path: path.join('tests', 'screenshots', 'out', 'zoom-source-card.png') });

  // Dump the SVG so we can inspect path data if visuals are off.
  const svg = await card.locator('svg').first().innerHTML();
  console.log('SVG snippet:', svg.slice(0, 2000));
});
