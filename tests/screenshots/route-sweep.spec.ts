/**
 * Sweep candidate routes to triage the styling-polish backlog.
 * Generates desktop+mobile screenshots per route so I can identify
 * the worst offenders before touching code.
 */
import { test } from '@playwright/test';
import path from 'node:path';

const ROUTES: Array<{ name: string; url: string }> = [
  { name: 'dashboard-home', url: '/dashboard' },
  { name: 'dashboard-discover', url: '/dashboard/discover' },
  { name: 'dashboard-history', url: '/dashboard/history' },
  { name: 'dashboard-discovery-analytics', url: '/dashboard/discovery-analytics' },
  { name: 'dashboard-library-growth', url: '/dashboard/library-growth' },
  { name: 'dashboard-mood-timeline', url: '/dashboard/mood-timeline' },
  { name: 'dashboard-generate', url: '/dashboard/generate' },
  { name: 'music-identity', url: '/music-identity' },
  { name: 'library-search', url: '/library/search' },
  { name: 'library-artists', url: '/library/artists' },
  { name: 'playlists', url: '/playlists' },
  { name: 'settings-general', url: '/settings/general' },
  { name: 'settings-recommendations', url: '/settings/recommendations' },
  { name: 'dj', url: '/dj' },
];

for (const { name, url } of ROUTES) {
  test(name, async ({ page }, testInfo) => {
    const prefix = testInfo.project.name === 'mobile' ? 'route-mobile' : 'route-desktop';
    await page.goto(url);
    // Don't wait too long on routes that may have animations / streaming data.
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join('tests', 'screenshots', 'out', `${prefix}-${name}.png`),
      fullPage: true,
    });
  });
}
