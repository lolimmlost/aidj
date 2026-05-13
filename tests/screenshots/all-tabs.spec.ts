/**
 * Sweep all analytics tabs in both desktop and mobile viewports.
 * Output filenames are prefixed with the project name so headless desktop
 * and mobile shots land in distinct files.
 */
import { test, type Page } from '@playwright/test';
import path from 'node:path';

const TABS = ['Overview', 'Listening', 'Quality', 'Activity', 'Discovery'] as const;

async function snapTab(page: Page, tab: typeof TABS[number], outPrefix: string) {
  // The analytics page nests an inner tablist (Overview/Listening/Quality/...)
  // inside an outer page-level tablist (Overview/Discovery/Mood Timeline).
  // The inner one is the only tablist that contains "Listening", so we use
  // that as the disambiguating anchor.
  const inner = page.locator('[role="tablist"]').filter({ has: page.getByRole('tab', { name: 'Listening', exact: true }) });
  await inner.getByRole('tab', { name: tab, exact: true }).click();
  // Best-effort wait for any data fetch to settle.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  // Recharts default animation is 1500ms; wait long enough to clear it.
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', `${outPrefix}-${tab.toLowerCase()}.png`),
    fullPage: true,
  });
}

test('Analytics — all tabs', async ({ page }, testInfo) => {
  const prefix = testInfo.project.name === 'mobile' ? 'mobile' : 'desktop';
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  for (const tab of TABS) {
    await snapTab(page, tab, prefix);
  }
});
