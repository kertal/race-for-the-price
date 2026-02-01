// Racer B — Load a page, click a button, wait for results
//
// This is the second racer. It can target a different URL, a different
// approach, or the same page with different settings to compare.

// 1. Navigate to the page
await page.goto('https://example.com/v2', { waitUntil: 'domcontentloaded' });

// 2. Start video recording and the race timer
await page.raceRecordingStart();
await page.waitForTimeout(500);
await page.raceStart('Load, Click & Wait');

// 3. Click a button
await page.locator('button#submit').click();

// 4. Wait for the result to appear
await page.locator('.results').waitFor({ state: 'visible' });

// 5. Stop the race timer and video recording
page.raceEnd('Load, Click & Wait');
await page.waitForTimeout(500);
await page.raceRecordingEnd();
