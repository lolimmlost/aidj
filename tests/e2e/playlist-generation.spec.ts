import { test, expect } from '@playwright/test';

test.describe('Playlist Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/config', route => route.fulfill({
      status: 200,
      body: JSON.stringify({
        lidarrUrl: 'http://localhost:8686',
        ollamaUrl: 'http://localhost:11434',
        navidromeUrl: 'http://localhost:4533',
      }),
    }));

    await page.goto('/login');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpass');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('generates playlist from style input and displays with feedback/queue', async ({ page }) => {
    // Enter style and generate
    await page.fill('input[placeholder*="style"]', 'rock');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('text=Generated Playlist for "rock"')).toBeVisible();

    // Check display
    await expect(page.locator('ul li')).toHaveCount(10);
    await expect(page.locator('li p.text-muted-foreground')).toBeVisible(); // Explanations

    // Feedback
    await page.click('button:has-text("👍")');
    await page.click('button:has-text("👎")');
    await expect(page.locator('button[ variant="default" ]')).toBeVisible(); // Active feedback

    // Add individual to queue (assume resolved)
    await page.click('button:has-text("Queue")');
    await expect(page.locator('audio')).toBeVisible(); // Assume player updates

    // Add entire
    await page.click('button:has-text("Add Entire Playlist to Queue")');
    await expect(page.locator('audio')).toBeVisible();

    // Clear cache
    await page.click('button:has-text("Clear Cache")');
    await expect(page.locator('input[placeholder*="style"]')).toHaveValue('');
  });

  test('handles missing song with Lidarr stub', async ({ page }) => {
    await page.fill('input[placeholder*="style"]', 'rare genre');
    await page.click('button:has-text("Generate")');
    await page.waitForSelector('button:has-text("Add to Lidarr")');
    await page.click('button:has-text("Add to Lidarr")');
    await expect(page.locator('text=Queued')).toContainText('for download via Lidarr');
  });

  test('handles error scenarios', async ({ page }) => {
    // Mock error (e.g., no Ollama)
    await page.route('/api/playlist', route => route.fulfill({ status: 500, body: JSON.stringify({ error: 'Ollama timeout' }) }));
    await page.fill('input[placeholder*="style"]', 'test');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('text=Error')).toBeVisible();

    // No matches fallback
    await page.route('/api/playlist', route => route.fulfill({ status: 200, body: JSON.stringify({ data: { playlist: [{ song: 'Unknown', explanation: 'test', songId: null, url: null, missing: true }] } }) }));
    await page.click('button:has-text("Generate")');
    await expect(page.locator('text=Not in library')).toBeVisible();
  });
});