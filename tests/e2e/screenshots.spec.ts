import { test, chromium } from '@playwright/test';

const BASE = 'https://aidj.appahouse.com';

async function login(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(2000);
  const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="user" i]');
  const passwordInput = await page.$('input[type="password"]');
  if (emailInput && passwordInput) {
    await emailInput.fill('juan@appahouse.com');
    await passwordInput.fill('GoldSoul40');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForTimeout(4000);
  }
}

const pages = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'discover', path: '/dashboard/discover' },
  { name: 'history', path: '/dashboard/history' },
  { name: 'analytics', path: '/dashboard/analytics' },
  { name: 'library-growth', path: '/dashboard/library-growth' },
  { name: 'playlists', path: '/playlists' },
  { name: 'downloads', path: '/downloads' },
  { name: 'settings', path: '/settings' },
  { name: 'dj', path: '/dj' },
  { name: 'library-artists', path: '/library/artists' },
];

test('screenshot all pages', async () => {
  const browser = await chromium.launch();

  // Desktop
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await desktop.newPage();
  dPage.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });
  await login(dPage);

  for (const p of pages) {
    await dPage.goto(`${BASE}${p.path}`);
    await dPage.waitForTimeout(3000);
    await dPage.screenshot({ path: `/tmp/aidj-${p.name}-desktop.png`, fullPage: true });
    console.log(`✓ ${p.name} desktop`);
  }

  // Mobile
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mPage = await mobile.newPage();
  mPage.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });
  await login(mPage);

  for (const p of pages) {
    await mPage.goto(`${BASE}${p.path}`);
    await mPage.waitForTimeout(3000);
    await mPage.screenshot({ path: `/tmp/aidj-${p.name}-mobile.png`, fullPage: true });
    console.log(`✓ ${p.name} mobile`);
  }

  await browser.close();
});
