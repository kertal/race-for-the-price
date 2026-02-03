// 🤖 ChatGPT - OpenAI's conversational AI
// Race: Ask "What is the meaning of life?" and measure time to first response token
//
// NOTE: Selectors target internal DOM structure and may break when ChatGPT updates.
// This example demonstrates the race framework, not a production-stable test.

// Timing constants (ms)
const PAGE_LOAD_BUFFER = 2000;      // Wait for JS hydration after domcontentloaded
const PRE_RACE_BUFFER = 1500;       // Visual buffer before timed section starts
const POST_RACE_BUFFER = 1500;      // Visual buffer after timed section ends
const RESPONSE_STREAM_TIME = 3000;  // Allow response to stream for visual effect
const CONSENT_WAIT = 1000;          // Wait after dismissing consent dialog

await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(PAGE_LOAD_BUFFER);

// Dismiss cookie consent / terms dialog if present (GDPR regions)
const consentButton = page.getByRole('button', { name: /accept|agree|continue/i }).first();
if (await consentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  await consentButton.click();
  await page.waitForTimeout(CONSENT_WAIT);
}

await page.raceRecordingStart();
await page.waitForTimeout(PRE_RACE_BUFFER);

await page.raceStart('First response token');
page.raceMessage('🤖 Asking ChatGPT...');

// Type the prompt into the input (textarea or contenteditable, varies by version)
const input = page.locator('#prompt-textarea, [contenteditable="true"]').first();
await input.waitFor({ state: 'visible', timeout: 15000 });
await input.click();
await input.fill('What is the meaning of life?');
await page.keyboard.press('Enter');

// Wait for assistant response element to appear (first token rendered)
await page.locator('[data-message-author-role="assistant"]').first().waitFor({ state: 'visible', timeout: 30000 });

page.raceEnd('First response token');
page.raceMessage('🤖 First token received!');

// Let response stream for visual effect in recording
await page.waitForTimeout(RESPONSE_STREAM_TIME);
await page.waitForTimeout(POST_RACE_BUFFER);

await page.raceRecordingEnd();
