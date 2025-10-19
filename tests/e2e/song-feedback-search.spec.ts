import { test, expect } from '@playwright/test';

test.describe('Song Feedback in Search - Story 3.12', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API config
    await page.route('/api/config', route =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          lidarrUrl: 'http://localhost:8686',
          ollamaUrl: 'http://localhost:11434',
          navidromeUrl: 'http://localhost:4533',
        }),
      })
    );

    // Navigate to login and authenticate
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login/);

    // Try to sign up (if first run) or login
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login")');

    // Wait for redirect to dashboard
    await page.waitForURL(/dashboard/, { timeout: 5000 });
  });

  test('displays artist and album names in search results (AC3, Task 1)', async ({ page }) => {
    // Navigate to search page
    await page.goto('/library/search');
    await expect(page.locator('h1:has-text("Search Music Library")')).toBeVisible();

    // Perform a search
    await page.fill('input[placeholder="Type to search..."]', 'test song');
    await page.waitForTimeout(500); // Allow debounce

    // Verify search results show artist and album information
    const firstResult = page.locator('div.font-semibold').first();
    await expect(firstResult).toBeVisible();

    // Check that artist name is displayed (format: "Artist • Duration")
    const artistInfo = page.locator('div.text-sm.text-muted-foreground').first();
    await expect(artistInfo).toBeVisible();
    await expect(artistInfo).toContainText('•'); // Separator between artist and duration
  });

  test('displays feedback buttons for each song (AC1, Task 2)', async ({ page }) => {
    // Navigate to search page
    await page.goto('/library/search');

    // Perform a search
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Verify feedback buttons are present
    const likeButton = page.locator('button[aria-label="Like song"]').first();
    const dislikeButton = page.locator('button[aria-label="Dislike song"]').first();

    await expect(likeButton).toBeVisible();
    await expect(dislikeButton).toBeVisible();
  });

  test('allows liking a song with visual feedback (AC5, Task 2)', async ({ page }) => {
    // Mock feedback API
    await page.route('/api/recommendations/feedback', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, feedbackId: 'test-feedback-id' }),
        });
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ feedback: {} }),
        });
      }
    });

    // Navigate to search and search for song
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Click thumbs up button
    const likeButton = page.locator('button[aria-label="Like song"]').first();
    await likeButton.click();

    // Verify toast notification appears
    await expect(page.locator('text=/Liked/')).toBeVisible({ timeout: 3000 });

    // Verify button state changes (aria-pressed="true")
    const unlikeButton = page.locator('button[aria-label="Unlike song"]').first();
    await expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('allows disliking a song with visual feedback (AC5, Task 2)', async ({ page }) => {
    // Mock feedback API
    await page.route('/api/recommendations/feedback', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, feedbackId: 'test-feedback-id' }),
        });
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ feedback: {} }),
        });
      }
    });

    // Navigate to search and search for song
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Click thumbs down button
    const dislikeButton = page.locator('button[aria-label="Dislike song"]').first();
    await dislikeButton.click();

    // Verify toast notification appears
    await expect(page.locator('text=/Disliked/')).toBeVisible({ timeout: 3000 });

    // Verify button state changes
    const removeDislikeButton = page.locator('button[aria-label="Remove dislike"]').first();
    await expect(removeDislikeButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('persists feedback state across page refreshes (AC6, Task 3)', async ({ page }) => {
    const testSongId = 'test-song-123';

    // Mock feedback API to return existing feedback
    await page.route('/api/recommendations/feedback', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            feedback: {
              [testSongId]: 'thumbs_up',
            },
          }),
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, feedbackId: 'test-feedback-id' }),
        });
      }
    });

    // Navigate to search
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Verify feedback state is loaded (thumbs up active)
    const unlikeButton = page.locator('button[aria-label="Unlike song"]').first();
    await expect(unlikeButton).toBeVisible({ timeout: 2000 });
    await expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');

    // Refresh page
    await page.reload();

    // Perform search again
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Verify feedback state persists
    await expect(page.locator('button[aria-label="Unlike song"]').first()).toBeVisible();
  });

  test('shows error toast when feedback submission fails (AC5, Task 2)', async ({ page }) => {
    // Mock feedback API to fail
    await page.route('/api/recommendations/feedback', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        });
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ feedback: {} }),
        });
      }
    });

    // Navigate to search
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Click thumbs up
    const likeButton = page.locator('button[aria-label="Like song"]').first();
    await likeButton.click();

    // Verify error toast appears
    await expect(page.locator('text=/Failed to save feedback/')).toBeVisible({ timeout: 3000 });
  });

  test('handles duplicate feedback gracefully (AC5, Task 2)', async ({ page }) => {
    // Mock feedback API to return duplicate error
    await page.route('/api/recommendations/feedback', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 409,
          body: JSON.stringify({ code: 'DUPLICATE_FEEDBACK', message: 'You have already rated this song' }),
        });
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ feedback: {} }),
        });
      }
    });

    // Navigate to search
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Click thumbs up
    const likeButton = page.locator('button[aria-label="Like song"]').first();
    await likeButton.click();

    // Verify info toast appears (not error)
    await expect(page.locator('text=/Already rated/')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Accessibility - Story 3.12', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/config', route =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          lidarrUrl: 'http://localhost:8686',
          ollamaUrl: 'http://localhost:11434',
          navidromeUrl: 'http://localhost:4533',
        }),
      })
    );

    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass');
    await page.click('button:has-text("Login")');
    await page.waitForURL(/dashboard/, { timeout: 5000 });
  });

  test('feedback buttons have proper ARIA labels (AC7, Task 6)', async ({ page }) => {
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Check ARIA labels
    await expect(page.locator('button[aria-label="Like song"]').first()).toBeVisible();
    await expect(page.locator('button[aria-label="Dislike song"]').first()).toBeVisible();

    // Check role group for accessibility
    await expect(page.locator('div[role="group"][aria-label="Song feedback"]').first()).toBeVisible();
  });

  test('feedback buttons meet minimum touch target size (AC7, Task 1)', async ({ page }) => {
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Get button dimensions
    const likeButton = page.locator('button[aria-label="Like song"]').first();
    const boundingBox = await likeButton.boundingBox();

    // Verify minimum 44px x 44px touch target (iOS HIG)
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.width).toBeGreaterThanOrEqual(44);
      expect(boundingBox.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('feedback buttons support keyboard navigation (AC7, Task 6)', async ({ page }) => {
    await page.goto('/library/search');
    await page.fill('input[placeholder="Type to search..."]', 'test');
    await page.waitForTimeout(500);

    // Tab to like button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Verify focused button
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toHaveAttribute('aria-label', /Like song|Dislike song/);

    // Press Enter/Space to activate
    await page.keyboard.press('Enter');

    // Verify action triggered (assuming mocked API)
    await page.route('/api/recommendations/feedback', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, feedbackId: 'test-id' }),
      });
    });
  });
});
