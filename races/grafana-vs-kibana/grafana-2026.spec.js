// 📊 Grafana 11.4.0  — February 2026
// Login and load the eCommerce dashboard.
// Requires: docker compose up -d && bash docker/init.sh

const BASE_URL = 'http://localhost:3002';
const DASHBOARD_URL = `${BASE_URL}/d/race-ecommerce`;

// Login
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector('input[name="user"]', { timeout: 30000 });
await page.fill('input[name="user"]', 'admin');
await page.fill('input[name="password"]', 'admin');
await page.click('button[type="submit"]');

// Let the login redirect settle, then navigate directly to the dashboard
// (bypasses any "change password" prompt that appears on first login)
await page.waitForTimeout(2000);
await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

// ── Race: measure full dashboard load (until all ES queries complete) ──────
await page.raceRecordingStart();
await page.raceStart('Dashboard Load');

await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle', timeout: 60000 });

page.raceEnd('Dashboard Load');
page.raceMessage('Grafana 11.4 (Feb 2026)');
await page.raceRecordingEnd();
