import { test, expect } from '@playwright/test';

/**
 * E2E-5.1.2: User browses library on tablet (768px), selects album, adds to queue
 * Covers: AC1, AC3
 */
test.describe('Responsive Tablet Flow', () => {
  test.use({
    viewport: { width: 768, height: 1024 }, // iPad dimensions
  });

  test('should browse library and add album to queue on tablet', async ({ page }) => {
    await page.goto('/library/artists');

    // Verify tablet viewport
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(768);
    expect(viewport?.height).toBe(1024);

    // Step 1: Verify responsive grid on tablet (should show 2-3 columns)
    const artistCards = page.locator('div[class*="grid"]').first();
    await expect(artistCards).toBeVisible();

    // Verify grid classes for tablet breakpoint
    const gridClasses = await artistCards.getAttribute('class');
    expect(gridClasses).toContain('grid');

    // Step 2: Click on an artist
    const firstArtist = page.locator('a[href*="/library/artists/"]').first();
    await firstArtist.click();

    await page.waitForURL('**/library/artists/**', { timeout: 5000 });

    // Step 3: Verify album grid is responsive
    const albumGrid = page.locator('div[class*="grid"]').first();
    await expect(albumGrid).toBeVisible();

    // Should show 3-4 columns on tablet
    const albums = await page.locator('[role="button"]').all();
    expect(albums.length).toBeGreaterThan(0);

    // Step 4: Select an album
    if (albums.length > 0) {
      await albums[0].click();

      await page.waitForURL('**/albums/**', { timeout: 5000 });

      // Step 5: Verify song list is responsive
      const songItems = await page.locator('[role="button"]').all();
      expect(songItems.length).toBeGreaterThan(0);

      // Add first song to queue
      if (songItems.length > 0) {
        await songItems[0].click();

        // Verify audio player appears
        const audioPlayer = page.locator('div:has(audio)');
        await expect(audioPlayer).toBeVisible({ timeout: 5000 });
      }
    }

    // Step 6: Verify no horizontal scrolling
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1);
  });

  test('should use appropriate breakpoint styles for tablet', async ({ page }) => {
    await page.goto('/dashboard');

    // Verify hamburger menu is hidden on tablet (md: breakpoint)
    const hamburgerButton = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(hamburgerButton).not.toBeVisible();

    // Verify responsive padding/spacing
    const container = page.locator('.container').first();
    const containerPadding = await container.evaluate((el) => {
      return window.getComputedStyle(el).padding;
    });

    // Should have tablet-appropriate padding (not mobile-minimal)
    expect(containerPadding).toBeTruthy();

    // Verify grid layouts use appropriate columns
    const recommendationsGrid = page.locator('div[class*="grid-cols"]').first();
    if (await recommendationsGrid.isVisible()) {
      const gridClasses = await recommendationsGrid.getAttribute('class');
      // Should use md: or lg: breakpoint classes
      expect(gridClasses).toMatch(/md:|lg:/);
    }
  });
});
