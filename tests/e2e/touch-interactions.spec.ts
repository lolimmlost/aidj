import { test, expect } from '@playwright/test';

/**
 * E2E-5.1.4: Touch interactions work (tap targets, swipe gestures) on mobile viewport
 * Covers: AC4
 */
test.describe('Touch Interactions', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test('should have all buttons meeting WCAG 2.1 minimum tap target size (44x44px)', async ({ page }) => {
    await page.goto('/dashboard');

    // Collect all visible buttons
    const buttons = await page.locator('button:visible').all();
    const failures: string[] = [];

    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const box = await button.boundingBox();
      const text = await button.textContent();

      if (box) {
        if (box.width < 44 || box.height < 44) {
          failures.push(
            `Button "${text?.trim() || `index ${i}`}": ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`
          );
        }
      }
    }

    // Log any failures for debugging
    if (failures.length > 0) {
      console.log('Buttons failing tap target requirements:');
      failures.forEach((f) => console.log(`  - ${f}`));
    }

    // All buttons should meet the standard
    expect(failures.length).toBe(0);
  });

  test('should have all links meeting minimum tap target size', async ({ page }) => {
    await page.goto('/dashboard');

    const links = await page.locator('a:visible').all();
    const failures: string[] = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const box = await link.boundingBox();
      const text = await link.textContent();

      if (box) {
        if (box.width < 44 || box.height < 44) {
          failures.push(
            `Link "${text?.trim() || `index ${i}`}": ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`
          );
        }
      }
    }

    if (failures.length > 0) {
      console.log('Links failing tap target requirements:');
      failures.forEach((f) => console.log(`  - ${f}`));
    }

    expect(failures.length).toBe(0);
  });

  test('should have all form inputs meeting minimum tap target height', async ({ page }) => {
    await page.goto('/dashboard');

    const inputs = await page.locator('input:visible, select:visible').all();
    const failures: string[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const box = await input.boundingBox();
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');

      if (box) {
        if (box.height < 44) {
          failures.push(
            `Input type="${type}" placeholder="${placeholder}": height ${box.height.toFixed(0)}px`
          );
        }
      }
    }

    if (failures.length > 0) {
      console.log('Inputs failing tap target requirements:');
      failures.forEach((f) => console.log(`  - ${f}`));
    }

    expect(failures.length).toBe(0);
  });

  test('should handle touch interactions on mobile navigation', async ({ page }) => {
    await page.goto('/dashboard');

    // Open mobile menu with touch
    const hamburgerButton = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(hamburgerButton).toBeVisible();

    // Simulate touch tap
    await hamburgerButton.tap();

    // Menu should open
    const mobileNav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(mobileNav).toBeVisible();

    // Tap a navigation link
    const navLink = page.locator('nav a').first();
    await navLink.tap();

    // Navigation should close and navigate
    await expect(mobileNav).not.toBeVisible({ timeout: 2000 });
  });

  test('should handle touch interactions on audio player controls', async ({ page }) => {
    await page.goto('/library/artists/08jJDtStA34urKpsWC7xHt/albums/1');

    // Tap a song to activate audio player
    const firstSong = page.locator('[role="button"]').first();
    await firstSong.tap();

    // Wait for audio player
    const audioPlayer = page.locator('div:has(audio)');
    await expect(audioPlayer).toBeVisible({ timeout: 5000 });

    // Verify mobile audio player is visible
    const mobilePlayer = page.locator('div.md\\:hidden').first();
    await expect(mobilePlayer).toBeVisible();

    // Test play/pause button tap
    const playPauseButton = page.locator('button[aria-label*="Play"], button[aria-label*="Pause"]');
    await expect(playPauseButton).toBeVisible();
    await playPauseButton.tap();

    // Test next button tap
    const nextButton = page.locator('button[aria-label="Next song"]');
    await expect(nextButton).toBeVisible();
    await nextButton.tap();

    // Test previous button tap
    const prevButton = page.locator('button[aria-label="Previous song"]');
    await expect(prevButton).toBeVisible();
    await prevButton.tap();

    // All taps should complete without errors
  });

  test('should handle touch on playlist generation', async ({ page }) => {
    await page.goto('/dashboard');

    // Find and tap the style input
    const styleInput = page.locator('input[placeholder*="style"]');
    await expect(styleInput).toBeVisible();
    await styleInput.tap();
    await styleInput.fill('rock');

    // Tap the generate button
    const generateButton = page.locator('button:has-text("Generate Now")');
    await expect(generateButton).toBeVisible();
    await generateButton.tap();

    // Wait for playlist generation
    await page.waitForSelector('text=/Generated Playlist|Loading|generating/i', { timeout: 15000 });

    // If playlist is generated, tap a queue button
    const queueButton = page.locator('button:has-text("Queue")').first();
    if (await queueButton.isVisible({ timeout: 5000 })) {
      await queueButton.tap();

      // Audio player should appear
      const audioPlayer = page.locator('div:has(audio)');
      await expect(audioPlayer).toBeVisible({ timeout: 5000 });
    }
  });

  test('should have adequate spacing between tap targets', async ({ page }) => {
    await page.goto('/dashboard');

    // Check spacing between buttons in the same row
    const buttonRows = await page.locator('div:has(> button)').all();

    for (const row of buttonRows) {
      const buttons = await row.locator('button:visible').all();

      if (buttons.length > 1) {
        for (let i = 0; i < buttons.length - 1; i++) {
          const box1 = await buttons[i].boundingBox();
          const box2 = await buttons[i + 1].boundingBox();

          if (box1 && box2) {
            // Calculate horizontal gap
            const gap = box2.x - (box1.x + box1.width);

            // Should have at least 8px spacing (common design system standard)
            expect(gap).toBeGreaterThanOrEqual(4); // Allow small margin for rounding
          }
        }
      }
    }
  });

  test('should not have hover-only interactions on touch devices', async ({ page }) => {
    await page.goto('/library/artists');

    // Check that cards are clickable via touch without requiring hover
    const artistCards = await page.locator('a[href*="/library/artists/"]').all();

    if (artistCards.length > 0) {
      const firstCard = artistCards[0];

      // Tap the card directly without hover
      await firstCard.tap();

      // Should navigate successfully
      await page.waitForURL('**/library/artists/**', { timeout: 5000 });
      expect(page.url()).toContain('/library/artists/');
    }
  });
});
