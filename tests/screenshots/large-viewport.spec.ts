/**
 * Snap key routes at large/extra-large viewports (1080p + 4K) to triage
 * "stranded content in whitespace" issues on big monitors.
 */
import { test } from '@playwright/test';
import path from 'node:path';

const ROUTES: Array<{ name: string; url: string }> = [
  { name: 'analytics-overview', url: '/dashboard/analytics' },
  { name: 'analytics-listening', url: '/dashboard/analytics' }, // tab clicked below
  { name: 'discover', url: '/dashboard/discover' },
  { name: 'history', url: '/dashboard/history' },
  { name: 'discovery-analytics', url: '/dashboard/analytics?tab=discovery' },
  { name: 'mood-timeline', url: '/dashboard/analytics?tab=mood-timeline' },
  { name: 'library-artists', url: '/library/artists' },
  { name: 'library-search', url: '/library/search' },
  { name: 'playlists', url: '/playlists' },
  { name: 'music-identity', url: '/music-identity' },
  { name: 'library-growth', url: '/dashboard/library-growth' },
];

for (const { name, url } of ROUTES) {
  test(name, async ({ page }, testInfo) => {
    const prefix = testInfo.project.name; // fullhd or 4k
    await page.goto(url);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // For the listening sub-tab, click it after the page loads.
    if (name === 'analytics-listening') {
      const inner = page.locator('[role="tablist"]').filter({ has: page.getByRole('tab', { name: 'Listening', exact: true }) });
      await inner.getByRole('tab', { name: 'Listening', exact: true }).click();
      await page.waitForResponse((r) => r.url().includes('/api/listening-history/by-source') && r.ok()).catch(() => undefined);
    }
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: path.join('tests', 'screenshots', 'out', `${prefix}-${name}.png`),
      fullPage: true,
    });
  });
}
