// 🤖 ChatGPT - OpenAI's conversational AI
// Race: Ask "What is the meaning of life?" and wait for response

await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

await page.raceRecordingStart();
await page.waitForTimeout(1500);

await page.raceStart('Search: meaning of life');
page.raceMessage('🤖 Asking ChatGPT...');

// Type the prompt into the ChatGPT input (contenteditable div)
const input = page.locator('#prompt-textarea, [contenteditable="true"]').first();
await input.waitFor({ state: 'visible', timeout: 15000 });
await input.click();
await page.keyboard.type('What is the meaning of life?');
await page.keyboard.press('Enter');

// Wait for a response to appear
await page.locator('[data-message-author-role="assistant"]').first().waitFor({ state: 'visible', timeout: 30000 });
page.raceMessage('🤖 Response received!');
// Wait a bit for content to stream in
await page.waitForTimeout(3000);

page.raceEnd('Search: meaning of life');
await page.waitForTimeout(1500);

await page.raceRecordingEnd();
