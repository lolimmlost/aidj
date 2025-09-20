import { test, expect } from '@playwright/test';

test.describe('Recommendations Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/config', route => route.fulfill({
      status: 200,
      body: JSON.stringify({
        lidarrUrl: 'http://localhost:8686',
        ollamaUrl: 'http://localhost:11434',
        navidromeUrl: 'http://localhost:4533',
      }),
    }));

    // Login
    await page.goto('/login');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('views recommendations on dashboard (AC1, 3.2-E2E-001)', async ({ page }) => {
    // Check rec section loads
    await expect(page.locator('h2:has-text("AI Recommendations")')).toBeVisible();
    await expect(page.locator('ul li')).toHaveCount(5); // Assume 5 recs
    await expect(page.locator('text=Generated at')).toBeVisible(); // Timestamp (AC6)
    await expect(page.locator('select')).toBeVisible(); // Type selector (AC2)
  });

  test('switches recommendation types (AC2, 3.2-INT-001)', async ({ page }) => {
    // Default similar
    await expect(page.locator('select[value="similar"]')).toBeVisible();

    // Switch to mood
    await page.click('select');
    await page.click('text=Mood-Based');
    await page.waitForSelector('ul li'); // Reloads
    await expect(page.locator('select[value="mood"]')).toBeVisible();
  });

  test('provides feedback on recommendation (AC3, 3.2-E2E-003)', async ({ page }) => {
    await page.click('button:has-text("👍")'); // Thumbs up first rec
    await expect(page.locator('button[variant="default"]:has-text("👍")')).toBeVisible();

    await page.click('button:has-text("👎")'); // Thumbs down
    await expect(page.locator('button[variant="default"]:has-text("👎")')).toBeVisible();

    // Persist: Reload page
    await page.reload();
    await expect(page.locator('button[variant="default"]:has-text("👎")')).toBeVisible(); // Encrypted localStorage
  });

  test('adds recommendation to queue (AC5, 3.2-E2E-004)', async ({ page }) => {
    // Assume match in library
    await page.click('button:has-text("Queue")');
    await expect(page.locator('audio')).toBeVisible(); // Player updates
    await expect(page.locator('text=Now playing')).toContainText('Song1'); // Or similar

    // Missing case: Lidarr
    // Mock no match (route intercept if needed)
    await page.route('/api/navidrome/search', route => route.fulfill({ status: 200, body: JSON.stringify({ data: [] }) }));
    await page.click('button:has-text("Queue")'); // Second rec assume missing
    await expect(page.locator('text=Added to Lidarr')).toBeVisible(); // Alert or message
  });

  test('views detailed recommendation (AC4, 3.2-E2E-002)', async ({ page }) => {
    const songId = await page.locator('li:first-child a').getAttribute('href'); // Get link
    await page.click('li:first-child a'); // Click detail
    await expect(page).toHaveURL(/recommendations\/.+/);
    await expect(page.locator('text=Explanation')).toBeVisible(); // Full explanation
  });

  test('handles error on no recommendations (3.2-ERR-001)', async ({ page }) => {
    await page.route('/api/recommendations', route => route.fulfill({ status: 500, body: JSON.stringify({ error: 'No recs' }) }));
    await page.reload();
    await expect(page.locator('text=Error loading recommendations')).toBeVisible();
  });
});