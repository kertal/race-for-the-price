// 🌟 Gemini - Google's conversational AI
// Race: Ask "What is the meaning of life?" and measure time to first response token
//
// NOTE: Selectors target internal DOM structure and may break when Gemini updates.
// This example demonstrates the race framework, not a production-stable test.

import { RACE_NAME, TEST_PROMPT } from './constants.js';

// Timing constants (ms)
const PAGE_LOAD_BUFFER = 2000;      // Wait for JS hydration after domcontentloaded
const PRE_RACE_BUFFER = 1500;       // Visual buffer before timed section starts
const POST_RACE_BUFFER = 1500;      // Visual buffer after timed section ends
const RESPONSE_STREAM_TIME = 3000;  // Allow response to stream for visual effect
const CONSENT_WAIT = 1000;          // Wait after dismissing consent dialog

await page.goto('https://gemini.google.com', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(PAGE_LOAD_BUFFER);

// Dismiss cookie consent dialog if present (GDPR regions)
const consentButton = page.getByRole('button', { name: /accept all/i });
if (await consentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  await consentButton.click();
  await page.waitForTimeout(CONSENT_WAIT);
}

await page.raceRecordingStart();
await page.waitForTimeout(PRE_RACE_BUFFER);

await page.raceStart(RACE_NAME);
page.raceMessage('🌟 Asking Gemini...');

// Type the prompt into the input (textarea or contenteditable, varies by version)
const input = page.locator('[contenteditable="true"]').or(page.locator('textarea')).first();
await input.waitFor({ state: 'visible', timeout: 15000 });
await input.click();
await input.fill(TEST_PROMPT);
await page.keyboard.press('Enter');

// Wait for model response element to appear (first token rendered)
// Using specific Gemini response container classes
await page.locator('.model-response-text, .response-container, .message-content').first().waitFor({ state: 'visible', timeout: 30000 });

page.raceEnd(RACE_NAME);
page.raceMessage('🌟 First token received!');

// Let response stream for visual effect in recording
await page.waitForTimeout(RESPONSE_STREAM_TIME);
await page.waitForTimeout(POST_RACE_BUFFER);

await page.raceRecordingEnd();
