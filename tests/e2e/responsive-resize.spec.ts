import { test, expect } from '@playwright/test';

/**
 * E2E-5.1.3: User resizes browser from desktop to mobile, layout adapts without breaking
 * Covers: AC1
 */
test.describe('Responsive Resize Flow', () => {
  test('should adapt layout smoothly when resizing from desktop to mobile', async ({ page }) => {
    // Start with desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/dashboard');

    // Verify desktop layout
    let hamburgerButton = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(hamburgerButton).not.toBeVisible(); // Hidden on desktop

    // Verify no horizontal scroll on desktop
    let bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    let bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1);

    // Resize to tablet (md breakpoint: 768px)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500); // Allow for CSS transitions

    // Hamburger should still be hidden at exactly 768px (md: breakpoint)
    hamburgerButton = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(hamburgerButton).not.toBeVisible();

    // Verify no horizontal scroll on tablet
    bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1);

    // Resize to mobile (< 768px)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Hamburger should be visible on mobile
    hamburgerButton = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(hamburgerButton).toBeVisible();

    // Verify no horizontal scroll on mobile
    bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1);

    // Test mobile navigation works after resize
    await hamburgerButton.click();
    const mobileNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(mobileNav).toBeVisible();

    // Verify content is still accessible and not broken
    const mainContent = page.locator('.container').first();
    await expect(mainContent).toBeVisible();
  });

  test('should handle rapid viewport changes without breaking', async ({ page }) => {
    await page.goto('/library/artists');

    const viewports = [
      { width: 320, height: 568 },  // iPhone SE
      { width: 768, height: 1024 }, // iPad
      { width: 1920, height: 1080 }, // Desktop
      { width: 375, height: 812 },  // iPhone X
      { width: 1024, height: 768 },  // Tablet landscape
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);

      // Verify page doesn't break
      const body = page.locator('body');
      await expect(body).toBeVisible();

      // Verify no horizontal scroll
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const clientWidth = await page.evaluate(() => document.body.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Verify main content is visible
      const container = page.locator('.container').first();
      await expect(container).toBeVisible();
    }
  });

  test('should maintain audio player functionality across viewport changes', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/library/artists/08jJDtStA34urKpsWC7xHt/albums/1');

    // Click a song to activate audio player
    const firstSong = page.locator('[role="button"]').first();
    await firstSong.click();

    // Wait for audio player
    let audioPlayer = page.locator('div:has(audio)');
    await expect(audioPlayer).toBeVisible({ timeout: 5000 });

    // Verify desktop audio player layout
    let desktopLayout = page.locator('div.hidden.md\\:flex');
    await expect(desktopLayout).toBeVisible();

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Audio player should still be visible
    audioPlayer = page.locator('div:has(audio)');
    await expect(audioPlayer).toBeVisible();

    // Verify mobile layout is now visible
    const mobileLayout = page.locator('div.md\\:hidden').first();
    await expect(mobileLayout).toBeVisible();

    // Desktop layout should be hidden
    desktopLayout = page.locator('div.hidden.md\\:flex');
    await expect(desktopLayout).not.toBeVisible();

    // Verify playback controls still work
    const playPauseButton = page.locator('button[aria-label*="Play"], button[aria-label*="Pause"]');
    await expect(playPauseButton).toBeVisible();
    await playPauseButton.click(); // Should not throw error

    // Resize back to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    // Audio player should adapt back to desktop layout
    desktopLayout = page.locator('div.hidden.md\\:flex');
    await expect(desktopLayout).toBeVisible();
  });
});
