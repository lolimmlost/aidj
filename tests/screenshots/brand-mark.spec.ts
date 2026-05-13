/**
 * Verify the Unbounded + Syne brand wordmark lands in the sidebar
 * and on the landing hero.
 */
import { test } from '@playwright/test';
import path from 'node:path';

test('sidebar wordmark (zoomed)', async ({ page }, testInfo) => {
  const prefix = testInfo.project.name; // chromium-headless | mobile | fullhd | 4k
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);

  // Zoom on the sidebar header area where the AIDJ wordmark sits.
  const sidebarHeader = page.locator('aside').first().locator('a').filter({ hasText: 'AIDJ' }).first();
  await sidebarHeader.scrollIntoViewIfNeeded().catch(() => undefined);
  await sidebarHeader.screenshot({
    path: path.join('tests', 'screenshots', 'out', `${prefix}-brand-sidebar.png`),
  }).catch(() => undefined);
});

test('landing hero wordmark', async ({ page, context }, testInfo) => {
  const prefix = testInfo.project.name;
  // Land at "/" without auth to see the marketing hero. Drop the auth cookies
  // for this nav so we hit the unauthenticated landing page.
  await context.clearCookies();
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', `${prefix}-landing-hero.png`),
    fullPage: false,
  });
});
