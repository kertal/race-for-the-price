// 📊 Grafana 11.4.0  — February 2026
// Login and load the eCommerce dashboard.
// Requires: docker compose up -d && bash docker/init.sh

const BASE_URL = 'http://localhost:3002';

// Login
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector('input[name="user"]', { timeout: 30000 });
await page.fill('input[name="user"]', 'admin');
await page.fill('input[name="password"]', 'admin');
await page.click('button[type="submit"]');
await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 30000 });

// Dismiss any survey / update popups
try {
  const dismiss = page.locator('button:has-text("No thanks"), button:has-text("Maybe later"), button[aria-label="Close"]');
  if (await dismiss.first().isVisible({ timeout: 3000 })) {
    await dismiss.first().click();
  }
} catch { /* no popup */ }

// Navigate directly to the provisioned dashboard (uid: race-ecommerce)
await page.raceRecordingStart();
await page.raceStart('Dashboard Load');

await page.goto(`${BASE_URL}/d/race-ecommerce/ecommerce-race-test`);

// Wait for all panel headers to appear
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="data-testid Panel header"], .panel-title').length >= 6,
  { timeout: 60000 }
);
// Wait for loading bars to clear
await page.waitForFunction(
  () => document.querySelectorAll('[aria-label="Panel loading bar"]').length === 0,
  { timeout: 60000 }
);

page.raceEnd('Dashboard Load');
page.raceMessage('Grafana 11.4 (Feb 2026)');
await page.raceRecordingEnd();
