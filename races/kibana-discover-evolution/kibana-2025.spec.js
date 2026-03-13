// 🔍 Kibana Discover — 8.17.3  (early 2025)
// Login, navigate to Discover, wait for the page to fully render.
// Requires: docker compose up -d && bash docker/init.sh

const BASE_URL = 'http://localhost:5624';

// Login
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 30000 });
await page.fill('[data-test-subj="loginUsername"]', 'elastic');
await page.fill('[data-test-subj="loginPassword"]', 'changeme');
await page.click('[data-test-subj="loginSubmit"]');
await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 30000 });

// Dismiss any welcome modal or flyout
try {
  const closeBtn = page.locator('[data-test-subj="euiFlyoutCloseButton"], [data-test-subj="closeModalButton"]');
  if (await closeBtn.first().isVisible({ timeout: 3000 })) {
    await closeBtn.first().click();
  }
} catch { /* no modal */ }

// Start race — measure Discover page load time
await page.raceRecordingStart();
await page.raceStart('Discover Load');

await page.goto(`${BASE_URL}/app/discover`);

// Wait for the main Discover content area
await page.waitForSelector('[data-test-subj="discoverMainContent"]', { timeout: 60000 });
// Wait for loading indicator to clear
await page.waitForSelector('[data-test-subj="globalLoadingIndicator"]', { state: 'hidden', timeout: 60000 });
// Wait for the search bar to be interactive
await page.waitForSelector('[data-test-subj="queryInput"]', { timeout: 60000 });

page.raceEnd('Discover Load');
page.raceMessage('Kibana 8.17 — early 2025');
await page.raceRecordingEnd();
