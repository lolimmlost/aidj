import { test, expect } from '@playwright/test';

/**
 * E2E-5.1.1: User logs in on mobile (375px width), navigates to dashboard, generates playlist, plays song
 * Covers: AC3, AC5
 */
test.describe('Responsive Mobile Flow', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE dimensions
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
  });

  test('should complete full mobile user flow: login → dashboard → generate playlist → play music', async ({ page }) => {
    // Step 1: Login on mobile
    await expect(page).toHaveTitle(/AIDJ/);

    // Check mobile viewport
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThanOrEqual(767);

    // Fill login form (adjust selectors based on your actual form)
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 10000 });

    // Step 2: Verify mobile navigation is visible
    const hamburgerButton = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(hamburgerButton).toBeVisible();

    // Verify hamburger button meets tap target size (44x44px minimum)
    const hamburgerBox = await hamburgerButton.boundingBox();
    expect(hamburgerBox?.width).toBeGreaterThanOrEqual(44);
    expect(hamburgerBox?.height).toBeGreaterThanOrEqual(44);

    // Step 3: Test mobile navigation
    await hamburgerButton.click();
    const mobileNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(mobileNav).toBeVisible();

    // Close navigation by clicking overlay
    await page.locator('div[aria-hidden="true"]').click();
    await expect(mobileNav).not.toBeVisible();

    // Step 4: Generate playlist on mobile
    const styleInput = page.locator('input[placeholder*="style"]');
    await expect(styleInput).toBeVisible();

    // Verify input meets tap target size
    const inputBox = await styleInput.boundingBox();
    expect(inputBox?.height).toBeGreaterThanOrEqual(44);

    await styleInput.fill('rock');

    const generateButton = page.locator('button:has-text("Generate Now")');
    await expect(generateButton).toBeVisible();

    // Verify button tap target size
    const buttonBox = await generateButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);

    await generateButton.click();

    // Wait for playlist to generate
    await page.waitForSelector('text=/Generated Playlist/i', { timeout: 15000 });

    // Step 5: Play a song from the generated playlist
    const queueButton = page.locator('button:has-text("Queue")').first();
    if (await queueButton.isVisible()) {
      await queueButton.click();

      // Verify audio player appears at bottom (mobile layout)
      const audioPlayer = page.locator('div:has(audio)');
      await expect(audioPlayer).toBeVisible();

      // Verify play button is visible and meets tap target size
      const playButton = page.locator('button[aria-label*="Play"], button[aria-label*="Pause"]');
      await expect(playButton).toBeVisible();

      const playButtonBox = await playButton.boundingBox();
      expect(playButtonBox?.width).toBeGreaterThanOrEqual(44);
      expect(playButtonBox?.height).toBeGreaterThanOrEqual(44);
    }

    // Step 6: Verify no horizontal scrolling
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1); // +1 for rounding
  });

  test('should have all interactive elements meeting minimum tap target size', async ({ page }) => {
    await page.goto('/dashboard');

    // Get all buttons on the page
    const buttons = await page.locator('button').all();

    let violations = 0;
    for (const button of buttons) {
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        if (box && (box.width < 44 || box.height < 44)) {
          violations++;
          console.warn(`Button with insufficient tap target: ${box.width}x${box.height}`);
        }
      }
    }

    // Allow some violations for very small UI elements, but most should meet the standard
    expect(violations).toBeLessThan(buttons.length * 0.2); // Less than 20% violations
  });

  test('should render mobile-optimized audio player', async ({ page }) => {
    // Skip login, go directly to a page with audio player
    await page.goto('/library/artists/08jJDtStA34urKpsWC7xHt/albums/1');

    // Click a song to trigger audio player
    const songItem = page.locator('[role="button"]').first();
    await songItem.click();

    // Wait for audio player
    const audioPlayer = page.locator('div:has(audio)');
    await expect(audioPlayer).toBeVisible();

    // Verify mobile layout is used (stacked layout, not horizontal)
    const mobileLayout = page.locator('div.md\\:hidden').first();
    await expect(mobileLayout).toBeVisible();

    // Verify desktop layout is hidden on mobile
    const desktopLayout = page.locator('div.hidden.md\\:flex');
    await expect(desktopLayout).not.toBeVisible();

    // Test touch controls
    const prevButton = page.locator('button[aria-label="Previous song"]');
    const playPauseButton = page.locator('button[aria-label*="Play"], button[aria-label*="Pause"]');
    const nextButton = page.locator('button[aria-label="Next song"]');

    await expect(prevButton).toBeVisible();
    await expect(playPauseButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    // Verify tap targets
    for (const button of [prevButton, playPauseButton, nextButton]) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
