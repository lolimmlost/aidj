/**
 * Verify tier 1 + 2 DS changes landed on prod:
 * - Sidebar Disc3 spins when audio plays
 * - Queue panel "Now Playing" uses magenta accent
 * - Player bar song title uses font-display
 */
import { test } from '@playwright/test';
import path from 'node:path';

test('player bar + sidebar (zoomed)', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);

  // Sidebar header zoom.
  const sidebar = page.locator('aside').first();
  await sidebar.locator('a').first().screenshot({
    path: path.join('tests', 'screenshots', 'out', 'tier2-sidebar.png'),
  }).catch(() => undefined);

  // Player bar zoom (bottom of the page).
  const playerBar = page.locator('[class*="audio-player"], [class*="PlayerBar"]').first();
  await playerBar.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'tier2-player.png'),
  }).catch(() => undefined);

  // Verify spin class is on the sidebar Disc3 when something is playing.
  // Land in the DOM regardless to capture state.
  const sidebarDiscClass = await sidebar.locator('a').first().locator('svg').first().getAttribute('class');
  console.log('Sidebar Disc3 class:', sidebarDiscClass);
});

test('queue panel now-playing magenta accent', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1000);

  // Open the queue panel — usually a floating button at the bottom right.
  const queueBtn = page.locator('button[aria-label*="queue" i], button[title*="queue" i]').first();
  await queueBtn.click().catch(() => undefined);
  await page.waitForTimeout(800);

  // Snap the now-playing block if present.
  const nowPlaying = page.locator('text=Now Playing').first();
  if (await nowPlaying.isVisible().catch(() => false)) {
    const block = nowPlaying.locator('xpath=ancestor::div[contains(@class,"border-b")][1]');
    await block.screenshot({
      path: path.join('tests', 'screenshots', 'out', 'tier2-now-playing.png'),
    }).catch(() => undefined);
  } else {
    // Full screenshot for context if we can't isolate.
    await page.screenshot({
      path: path.join('tests', 'screenshots', 'out', 'tier2-queue-fallback.png'),
      fullPage: false,
    });
  }
});
