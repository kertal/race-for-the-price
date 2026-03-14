// 📊 Kibana 8.15.3  — August 2024
// Login, open the eCommerce dashboard, then measure a fresh reload.
// Requires: docker compose up -d && bash docker/init.sh

const BASE_URL = 'http://localhost:5601';

// Login
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 30000 });
await page.fill('[data-test-subj="loginUsername"]', 'elastic');
await page.fill('[data-test-subj="loginPassword"]', 'changeme');
await page.click('[data-test-subj="loginSubmit"]');
await page.waitForTimeout(3000);

// Navigate to dashboard list and open the eCommerce dashboard (pre-race warm-up)
await page.goto(`${BASE_URL}/app/dashboards`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('text=[eCommerce] Revenue Dashboard', { timeout: 60000 });
await page.click('text=[eCommerce] Revenue Dashboard');
await page.waitForSelector('[data-test-subj="globalLoadingIndicator"]', { state: 'hidden', timeout: 60000 });

// ── Race: reload the dashboard page fresh and measure time to fully render ─
// (networkidle unusable — Kibana has persistent background polling)
await page.raceRecordingStart();
await page.raceStart('Dashboard Load');

await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[data-test-subj="globalLoadingIndicator"]', { state: 'hidden', timeout: 60000 });
await page.waitForFunction(
  () => document.querySelectorAll('[data-test-subj="embeddablePanel--loading"]').length === 0,
  { timeout: 60000 }
);

page.raceEnd('Dashboard Load');
page.raceMessage('Kibana 8.15 (Aug 2024)');
await page.raceRecordingEnd();
