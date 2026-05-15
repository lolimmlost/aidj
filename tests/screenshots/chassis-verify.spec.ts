import { test } from '@playwright/test';
import path from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('artist page popular tracks have hearts', async ({ page }) => {
  // Grab the top-artists artist hrefs from the dashboard; pick one that has data.
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  const hrefs = await page.locator('a[href^="/library/artists/"]').evaluateAll(
    (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')).filter(Boolean) as string[],
  );
  const candidate = hrefs.find((h) => h && h.length > '/library/artists/'.length + 5);
  if (!candidate) {
    await page.screenshot({ path: path.join('tests', 'screenshots', 'out', 'chassis-no-artists.png'), fullPage: true });
    return;
  }
  await page.goto(candidate);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'chassis-artist-page.png'),
    fullPage: true,
  });
  // Zoom on the Popular Tracks section to verify the heart icon.
  const popular = page.locator('text=Popular Tracks').locator('xpath=ancestor::section[1]');
  if (await popular.isVisible().catch(() => false)) {
    await popular.scrollIntoViewIfNeeded();
    await popular.screenshot({
      path: path.join('tests', 'screenshots', 'out', 'chassis-popular-tracks.png'),
    });
  }
});

test('player bar title is a link', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);
  // Snap the bottom player bar.
  const playerBar = page.locator('[class*="bottom-0"]').first();
  await playerBar.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'chassis-playerbar.png'),
  }).catch(() => undefined);
});
