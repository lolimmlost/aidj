/**
 * Hover over chart elements to trigger tooltips, then snap.
 * Verifies the popover-foreground / item-style fix landed.
 */
import { test } from '@playwright/test';
import path from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('Listening tab donut tooltip', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const tabs = page.locator('[role="tablist"]').filter({ has: page.getByRole('tab', { name: 'Listening', exact: true }) });
  await tabs.getByRole('tab', { name: 'Listening', exact: true }).click();
  await page.waitForResponse((r) => r.url().includes('/api/listening-history/by-source') && r.ok()).catch(() => undefined);
  await page.waitForTimeout(1800);

  // Hover over the largest pie slice. Recharts listens for synthetic React
  // events, so dispatch mouseover via page.evaluate on the actual SVG path.
  await page.evaluate(() => {
    const path = document.querySelector('.recharts-pie-sector path');
    if (!path) return;
    const rect = path.getBoundingClientRect();
    const event = new MouseEvent('mouseover', {
      bubbles: true,
      cancelable: true,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
    });
    path.dispatchEvent(event);
  });
  await page.waitForTimeout(600);
  // Snap the source card region for a close-up.
  const card = page.locator('text=Plays by Source').locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
  await card.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'tooltip-donut.png'),
  }).catch(async () => {
    await page.screenshot({ path: path.join('tests', 'screenshots', 'out', 'tooltip-donut.png') });
  });
});

test('Quality tab bar chart tooltip', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const tabs = page.locator('[role="tablist"]').filter({ has: page.getByRole('tab', { name: 'Listening', exact: true }) });
  await tabs.getByRole('tab', { name: 'Quality', exact: true }).click();
  await page.waitForTimeout(2000);

  const bar = page.locator('.recharts-bar-rectangle').first();
  await bar.hover({ force: true });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'tooltip-bar.png'),
  });
});

test('Activity hour line tooltip', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const tabs = page.locator('[role="tablist"]').filter({ has: page.getByRole('tab', { name: 'Listening', exact: true }) });
  await tabs.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.waitForTimeout(2000);

  // Hover roughly mid-chart on the line.
  const lineChart = page.locator('text=Feedback Events by Hour').locator('xpath=ancestor::*[contains(@class,"rounded")][1]').locator('.recharts-surface').first();
  const box = await lineChart.boundingBox();
  if (box) {
    // Two moves — first enters, second triggers tooltip update.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.waitForTimeout(150);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.waitForTimeout(400);
  }
  await page.screenshot({
    path: path.join('tests', 'screenshots', 'out', 'tooltip-line.png'),
  });
});
