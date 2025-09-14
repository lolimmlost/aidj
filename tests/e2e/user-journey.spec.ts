import { test, expect } from '@playwright/test';

test.describe('E2E User Journey: Config → Library → Play', () => {
  test('should complete full user journey successfully', async ({ page }) => {
    // 1. Navigate to login page
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login/);

    // 2. Login with test credentials (assuming test user exists)
    // Note: In real E2E, you'd use a test user or mock auth
    await page.fill('input[placeholder*="username"], input[type="email"]', 'testuser');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login"), button:has-text("Sign In")');

    // Wait for successful login and dashboard redirect
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('h1:text("Dashboard"), text=Dashboard')).toBeVisible();

    // 3. Navigate to configuration
    await page.click('text=Config, text=Settings, a[href*="/config"]');
    await expect(page).toHaveURL(/config/);
    await expect(page.locator('h1:text("Configuration"), text=Configuration')).toBeVisible();

    // 4. Fill in Navidrome configuration (using mock values for test)
    await page.fill('input[placeholder*="Navidrome URL"], input[label*="Navidrome URL"]', 'http://localhost:4533');
    await page.fill('input[placeholder*="Navidrome Username"], input[label*="Username"]', 'testuser');
    await page.fill('input[placeholder*="Navidrome Password"], input[label*="Password"]', 'testpass');
    
    // Test connection (mock success)
    await page.click('button:has-text("Test Connection"), button:has-text("Test")');
    await page.waitForSelector('text=Connection successful, text=Connected, text=Success', { timeout: 10000 });
    
    // Save configuration
    await page.click('button:has-text("Save"), button:has-text("Save Config")');
    await page.waitForSelector('text=Configuration saved, text=Saved, text=Success');

    // 5. Navigate to library
    await page.click('text=Library, a[href*="/library"]');
    await page.click('text=Artists, a[href*="/artists"]');
    await expect(page).toHaveURL(/library\/artists/);
    await expect(page.locator('h1:text("Artists"), text=Artists')).toBeVisible();

    // 6. Load and verify artists list
    await page.waitForSelector('[data-testid="mock-link"], .artist-card, [role="button"]:has-text("Artist")');
    const artistCount = await page.locator('[data-testid="mock-link"], .artist-card, [role="button"]:has-text("Artist")').count();
    expect(artistCount).toBeGreaterThan(0);

    // 7. Click first artist to view albums
    await page.click('[data-testid="mock-link"]:first-child, .artist-card:first-child, [role="button"]:has-text("Artist"):first-child');
    await expect(page).toHaveURL(/library\/artists\/[^/]+/);
    await expect(page.locator('h1:text("Albums"), text=Albums')).toBeVisible();

    // 8. Click first album to view tracks
    await page.waitForSelector('[data-testid="mock-link"], .album-card, [role="button"]:has-text("Album")');
    await page.click('[data-testid="mock-link"]:first-child, .album-card:first-child, [role="button"]:has-text("Album"):first-child');
    await expect(page).toHaveURL(/library\/artists\/[^/]+\/albums\/[^/]+/);
    await expect(page.locator('h1:text("Tracks"), text=Songs, text=Tracklist')).toBeVisible();

    // 9. Click first song to start playback
    await page.waitForSelector('[data-testid="mock-link"], .song-item, [role="button"]:has-text("Song")');
    await page.click('[data-testid="mock-link"]:first-child, .song-item:first-child, [role="button"]:has-text("Song"):first-child');
    
    // 10. Verify audio player appears and song starts playing
    await page.waitForSelector('[data-testid="audio-player"], .audio-player, [role="region"]:has-text("Player")', { timeout: 5000 });
    
    // Verify player controls are visible
    await expect(page.locator('button[aria-label="Play"], button:has-text("▶"), .play-button')).toBeVisible();
    await expect(page.locator('button[aria-label="Pause"], button:has-text("⏸"), .pause-button')).toBeVisible();
    
    // Verify current song information is displayed
    await expect(page.locator('.current-song-title, .now-playing-title, [data-testid="current-song"]')).toBeVisible();
    
    // Verify progress bar is present
    await expect(page.locator('.progress-bar, [role="slider"], .seek-bar')).toBeVisible();
    
    console.log('✅ E2E User Journey completed successfully');
  });

  test('should handle authentication flow correctly', async ({ page }) => {
    // Test unauthenticated access to protected routes
    await page.goto('/library/artists');
    await expect(page).toHaveURL(/login/);
    await expect(page.locator('text=Login, text=Sign In')).toBeVisible();

    // Test successful login redirect
    await page.fill('input[placeholder*="username"], input[type="email"]', 'testuser');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login"), button:has-text("Sign In")');
    
    await expect(page).toHaveURL(/dashboard/);
  });

  test('should handle configuration validation', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder*="username"], input[type="email"]', 'testuser');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login")');
    
    await page.click('text=Config');
    
    // Test invalid URL
    await page.fill('input[placeholder*="Navidrome URL"]', 'invalid-url');
    await page.click('button:has-text("Test Connection")');
    await expect(page.locator('text=Invalid URL, text=Error')).toBeVisible();
    
    // Test valid URL
    await page.fill('input[placeholder*="Navidrome URL"]', 'http://localhost:4533');
    await page.click('button:has-text("Test Connection")');
    await expect(page.locator('text=Success, text=Connected')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate library hierarchy correctly', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder*="username"]', 'testuser');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login")');
    
    // Dashboard → Library → Artists
    await page.click('text=Library');
    await expect(page).toHaveURL(/library/);
    await page.click('text=Artists');
    await expect(page).toHaveURL(/library\/artists/);
    
    // Artists → First Artist Albums
    await page.click('text=Artist:first-child');
    await expect(page).toHaveURL(/library\/artists\/[^/]+/);
    
    // Artist Albums → First Album Tracks
    await page.click('text=Album:first-child');
    await expect(page).toHaveURL(/library\/artists\/[^/]+\/albums\/[^/]+/);
    
    // Back navigation
    await page.click('text=Back, button:has-text("←")');
    await expect(page).toHaveURL(/library\/artists\/[^/]+/);
  });

  test('should handle audio playback controls', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder*="username"]', 'testuser');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login")');
    
    // Navigate to library and play a song
    await page.click('text=Library');
    await page.click('text=Artists');
    await page.click('text=Artist:first-child');
    await page.click('text=Album:first-child');
    await page.click('text=Song:first-child');
    
    // Verify player controls work
    const playButton = page.locator('button[aria-label="Play"], .play-button');
    const pauseButton = page.locator('button[aria-label="Pause"], .pause-button');
    
    // Initially should show play button
    await expect(playButton).toBeVisible();
    
    // Click play
    await playButton.click();
    
    // Should show pause button after playing
    await expect(pauseButton).toBeVisible();
    
    // Click pause
    await pauseButton.click();
    
    // Should show play button again
    await expect(playButton).toBeVisible();
  });
});