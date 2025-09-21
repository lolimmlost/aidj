import { test, expect } from '@playwright/test';

test.describe('Test Infrastructure Baseline', () => {
  test('no import errors in browser', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors.length).toBe(0);
  });

  test('basic navigation works', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveTitle(/AIDJ/);
  });
});