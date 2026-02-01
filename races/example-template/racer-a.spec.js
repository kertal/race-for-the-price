// Racer A — Load a page, click a button, wait for results
//
// This is a template you can customize. Replace the URL, selectors,
// and step names with your own.

// 1. Navigate to the page
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

// 2. Start video recording and the race timer
await page.raceRecordingStart();
await page.waitForTimeout(500);
await page.raceStart('Load, Click & Wait');

// 3. Click a button (change the selector to match your page)
await page.locator('button#submit').click();

// 4. Wait for the result to appear (change the selector to match your page)
await page.locator('.results').waitFor({ state: 'visible' });

// 5. Stop the race timer and video recording
page.raceEnd('Load, Click & Wait');
await page.waitForTimeout(500);
await page.raceRecordingEnd();
