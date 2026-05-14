import { test } from '@playwright/test';
import path from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('history page', async ({ page }) => {
  await page.goto('/dashboard/history');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'history-deployed.png'),
    fullPage: true,
  });

  // Zoom on the stat row.
  const statRow = page.locator('text=Total Plays').locator('xpath=ancestor::*[contains(@class,"grid")][1]');
  if (await statRow.isVisible().catch(() => false)) {
    await statRow.screenshot({
      path: path.join('tests', 'screenshots', 'out', 'history-stats.png'),
    });
  }
});
