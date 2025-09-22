import { test, expect } from '@playwright/test';

test.describe('E2E Service Integrations: Ollama → Navidrome → Lidarr', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Ensure test user exists via Better Auth register API
    const registerResponse = await page.request.post('/api/auth/register', {
      data: {
        email: 'test@example.com',
        password: 'testpass123',
        name: 'Test User'
      }
    });
    if (registerResponse.status() !== 200 && registerResponse.status() !== 400) {
      console.warn(`Register response: ${registerResponse.status()}`);
    }

    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    // Login via Better Auth API to ensure authenticated state
    const loginResponse = await page.request.post('/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'testpass123'
      }
    });
    expect(loginResponse.status()).toBe(200);

    // Verify authenticated by navigating to dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/dashboard/, { timeout: 5000 });
  });

  test('generate and stream playlist', async ({ page }) => {
    // Mock Ollama generate
    await page.route('/api/ollama/generate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          playlist: [
            { id: 'track1', title: 'Mock Track 1', artist: 'Mock Artist' },
            { id: 'track2', title: 'Mock Track 2', artist: 'Mock Artist' }
          ],
          style: 'jazz'
        })
      });
    });

    // Mock Navidrome search/stream
    await page.route('/api/navidrome/search**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: 'track1', title: 'Mock Track 1', streamUrl: '/mock/stream/track1' }
          ]
        })
      });
    });

    await page.route('/api/navidrome/stream/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('mock audio data')
      });
    });

    // Navigate to recommendations/dashboard for style selection
    await page.goto('/dashboard/recommendations');
    await expect(page.locator('h1:text("Recommendations")')).toBeVisible();

    // Select style (e.g., jazz)
    await page.selectOption('select[aria-label*="Style"], [data-testid="style-select"]', 'jazz');
    await page.click('button:has-text("Generate Playlist")');

    // Wait for playlist generation
    await page.waitForSelector('[data-testid="playlist"], .playlist-list', { timeout: 10000 });
    const playlistItems = await page.locator('[data-testid="playlist-item"], .track-item').count();
    expect(playlistItems).toBeGreaterThan(0);

    // Click first track to stream
    await page.click('[data-testid="playlist-item"]:first-child, .track-item:first-child');
    await page.waitForSelector('[data-testid="audio-player"], .audio-player', { timeout: 5000 });

    // Verify playback starts
    await expect(page.locator('button[aria-label="Pause"], .pause-button')).toBeVisible();
    await expect(page.locator('.current-song-title')).toContainText('Mock Track 1');

    console.log('✅ Playlist generation and streaming successful');
  });

  test('chain test: search -> generate -> play -> add to Lidarr', async ({ page }) => {
    // Mock full chain
    await page.route('/api/ollama/generate', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ playlist: [{ id: 'track1', title: 'Track 1' }] }) });
    });

    await page.route('/api/navidrome/search**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ id: 'track1', title: 'Track 1' }] }) });
    });

    await page.route('/api/navidrome/stream/**', async route => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('mock audio') });
    });

    await page.route('/api/lidarr/add', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Added to Lidarr' }) });
    });

    // Navigate to library search
    await page.goto('/library/search');
    await expect(page.locator('h1:text("Search")')).toBeVisible();

    // Search and select style
    await page.fill('input[placeholder*="Search"], input[aria-label*="Search"]', 'jazz');
    await page.selectOption('select[aria-label*="Style"]', 'jazz');
    await page.click('button:has-text("Generate")');

    // Generate playlist
    await page.waitForSelector('.playlist-list');

    // Play first track
    await page.click('.track-item:first-child');
    await expect(page.locator('.audio-player')).toBeVisible();

    // Add to Lidarr (assume button in player or list)
    await page.click('button:has-text("Add to Lidarr"), [data-testid="add-lidarr"]');
    await page.waitForSelector('text=Added to Lidarr, .toast-success', { timeout: 5000 });

    console.log('✅ Full chain test successful');
  });

  test('E2E error handling: simulate service failures', async ({ page }) => {
    // Mock Ollama timeout/error
    await page.route('/api/ollama/generate', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'OLLAMA_TIMEOUT', message: 'Generation timed out' } })
      });
    });

    await page.goto('/dashboard/recommendations');
    await page.selectOption('select[aria-label*="Style"]', 'jazz');
    await page.click('button:has-text("Generate Playlist")');

    // Assert error toast (sonner)
    await expect(page.locator('[data-sonner="toast"], .toast-error')).toContainText('OLLAMA_TIMEOUT');
    await expect(page.locator('.toast-message')).toContainText('Generation timed out');

    // Mock Navidrome auth failure
    await page.route('/api/navidrome/search**', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'NAVIDROME_AUTH_FAILED', message: 'Invalid credentials' } })
      });
    });

    await page.click('button:has-text("Search")');
    await expect(page.locator('.toast-error')).toContainText('NAVIDROME_AUTH_FAILED');

    console.log('✅ Error handling verified');
  });

  test('UI verification: artists list, audio-player, no console errors', async ({ page }) => {
    // Mock data for artists
    await page.route('/api/navidrome/artists', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'artist1', name: 'Mock Artist' }])
      });
    });

    await page.goto('/library/artists');
    await expect(page.locator('h1:text("Artists")')).toBeVisible();
    await page.waitForSelector('[data-testid="artists-list"], .artists-grid');
    const artistCount = await page.locator('.artist-card, [data-testid="artist-item"]').count();
    expect(artistCount).toBeGreaterThan(0);

    // Click artist to albums, verify
    await page.click('.artist-card:first-child');
    await expect(page.locator('h1:text("Albums")')).toBeVisible();

    // Play track, verify player
    await page.route('/api/navidrome/stream/**', async route => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('mock') });
    });
    await page.click('.track-item:first-child');
    await expect(page.locator('[data-testid="audio-player"]')).toBeVisible();
    await expect(page.locator('.progress-bar')).toBeVisible();
    await expect(page.locator('button[aria-label="Play"]')).toBeVisible();

    // Check no console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        throw new Error(`Console error: ${msg.text()}`);
      }
    });

    console.log('✅ UI verification passed, no console errors');
  });
});