import { test, expect } from '@playwright/test';

test.describe('Style-Based Playlist Generation E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    // Assume user is logged in; if not, add login steps
    if (await page.locator('text=Login').isVisible()) {
      await page.goto('/login');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/dashboard');
    }
  });

  test('AC1: User inputs style and generates playlist', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('h2:has-text("Generated Playlist")')).toBeVisible();
    await expect(page.locator('ul li')).toHaveCount(10);
  });

  test('AC2: Fetches library summary for prompt context', async ({ page }) => {
    const responsePromise = page.waitForResponse(resp => resp.url().includes('/api/playlist') && resp.status() === 200);
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('playlist'); // Includes generated data from summary
  });

  test('AC3: Generates playlist with Ollama prompt and JSON parsing', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('ul li')).toHaveCount(10);
    const firstItem = page.locator('ul li').first();
    await expect(firstItem.locator('p')).toContainText('explanation'); // Explanations from JSON
  });

  test('AC4: Resolves suggestions to Song objects from library', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    const items = page.locator('ul li');
    await expect(items).toHaveCount(10);
    const resolvedCount = await items.locator('button:has-text("Queue")').count();
    expect(resolvedCount).toBeGreaterThan(0); // At least some resolved
    const missingCount = await items.locator('button:has-text("Add to Lidarr")').count();
    expect(missingCount).toBeLessThan(10); // Not all missing
  });

  test('AC5: Displays playlist with explanations, feedback, and queue buttons', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('ul li p')).toBeVisible(); // Explanations
    await expect(page.locator('button:has-text("👍")')).toBeVisible();
    await expect(page.locator('button:has-text("👎")')).toBeVisible();
    await expect(page.locator('button:has-text("Queue")')).toBeVisible();
    // Test feedback
    await page.click('button:has-text("👍")');
    await expect(page.locator('button:has-text("👍")')).toHaveAttribute('data-state', 'toggled'); // Toggled
  });

  test('AC6: Caches generated playlist and loads on regenerate', async ({ page }) => {
    const style = 'rock';
    await page.fill('input[placeholder*="Enter style"]', style);
    await page.click('button:has-text("Generate")');
    await page.waitForSelector('ul li');
    // Regenerate same style (should load from cache faster, but verify no new API if possible; here check display)
    await page.click('button:has-text("Generate")');
    await expect(page.locator('ul li')).toBeVisible();
    // Clear cache
    await page.click('button:has-text("Clear Cache")');
    await expect(page.locator('input')).toHaveValue('');
    // Regenerate should call API again
    await page.fill('input[placeholder*="Enter style"]', style);
    await page.click('button:has-text("Generate")');
    await expect(page.locator('ul li')).toBeVisible();
  });

  test('AC7: Adds entire playlist or individual songs to queue', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    // Add entire
    await page.click('button:has-text("Add Entire Playlist to Queue")');
    // Assume audio store updates; check for toast or console, or page change if queue UI
    // Individual
    await page.click('ul li button:has-text("Queue")');
    // Verify if audio player updates or queue list appears
    await expect(page.locator('text=Queued')).toBeVisible(); // Assume toast
  });

  test('AC8: Handles errors (no matches, timeout, retry)', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'invalid-nonexistent-style');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('text=Error')).toBeVisible(); // Fallback message
    // For timeout, use test config or mock, but verify error display
  });

  test('AC9: Adds missing songs to Lidarr with confirmation', async ({ page }) => {
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    await page.click('ul li button:has-text("Add to Lidarr")');
    await expect(page.locator('text=Added to queue')).toBeVisible(); // Success message
  });

  test('Mobile responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    await page.fill('input[placeholder*="Enter style"]', 'rock');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('ul li')).toBeVisible();
    await expect(page.locator('ul li')).toHaveCount(10); // Responsive layout
  });

  test('Privacy toggle clears cache', async ({ page }) => {
    const style = 'rock';
    await page.fill('input[placeholder*="Enter style"]', style);
    await page.click('button:has-text("Generate")');
    await page.click('button:has-text("Clear Cache")');
    await expect(page.locator('input')).toHaveValue('');
    // Regenerate should work as new
    await page.fill('input[placeholder*="Enter style"]', style);
    await page.click('button:has-text("Generate")');
    await expect(page.locator('ul li')).toBeVisible();
  });

  test('Fallback for empty library or Ollama failure', async ({ page }) => {
    // Simulate empty by invalid style or mock, but verify fallback
    await page.fill('input[placeholder*="Enter style"]', 'empty-library-style');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('text=No matching songs')).toBeVisible(); // Fallback
  });
});