// 🔍 Kibana Discover — 8.8.2  (2023)
// Login, navigate to Discover, wait for all network traffic to finish.
// Requires: docker compose up -d && bash docker/init.sh

const BASE_URL = 'http://localhost:5622';

// Login
await page.goto(`${BASE_URL}/login`);
await page.waitForSelector('[data-test-subj="loginUsername"]', { timeout: 30000 });
await page.fill('[data-test-subj="loginUsername"]', 'elastic');
await page.fill('[data-test-subj="loginPassword"]', 'changeme');
await page.click('[data-test-subj="loginSubmit"]');
await page.waitForTimeout(3000);

// Pre-navigate to Discover so the app is warmed up before measuring
await page.goto(`${BASE_URL}/app/discover`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[data-test-subj="discoverMainContent"]', { timeout: 60000 });

// ── Race: measure Discover reload until network idle ──────────────────────
await page.raceRecordingStart();
await page.raceStart('Discover Load');

await page.goto(`${BASE_URL}/app/discover`, { waitUntil: 'networkidle', timeout: 60000 });

page.raceEnd('Discover Load');
page.raceMessage('Kibana 8.8.2 — 2023');
await page.raceRecordingEnd();
