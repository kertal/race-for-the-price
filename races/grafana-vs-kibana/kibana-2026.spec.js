// 📊 Kibana 8.17.6  — February 2026
// Login and open the [eCommerce] Revenue Dashboard.
// Requires: docker compose up -d && bash docker/init.sh

const BASE_URL = 'http://localhost:5602';

// Login
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 30000 });
await page.fill('[data-test-subj="loginUsername"]', 'elastic');
await page.fill('[data-test-subj="loginPassword"]', 'changeme');
await page.click('[data-test-subj="loginSubmit"]');
await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 30000 });

// Dismiss "What's new" flyout or welcome modal if present
try {
  const closeBtn = page.locator('[data-test-subj="euiFlyoutCloseButton"], [data-test-subj="closeModalButton"]');
  if (await closeBtn.first().isVisible({ timeout: 3000 })) {
    await closeBtn.first().click();
  }
} catch { /* no modal */ }

// Navigate to dashboard list
await page.goto(`${BASE_URL}/app/dashboards`);
await page.waitForSelector('text=[eCommerce] Revenue Dashboard', { timeout: 60000 });

// Start race — measure dashboard open + render time
await page.raceRecordingStart();
await page.raceStart('Open eCommerce Dashboard');

await page.click('text=[eCommerce] Revenue Dashboard');

// Wait for at least 3 panel headings to appear
await page.waitForFunction(
  () => document.querySelectorAll('[data-test-subj="embeddablePanelHeading"], .embPanel__title').length >= 3,
  { timeout: 60000 }
);
// Wait for global loading indicator to clear
await page.waitForSelector('[data-test-subj="globalLoadingIndicator"]', { state: 'hidden', timeout: 60000 });

page.raceEnd('Open eCommerce Dashboard');
page.raceMessage('Kibana 8.17 (Feb 2026)');
await page.raceRecordingEnd();
