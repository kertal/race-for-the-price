// 🌟 Gemini - Google's conversational AI
// Race: Ask "What is the meaning of life?" and wait for response

await page.goto('https://gemini.google.com', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// Click "Accept all" button if cookie consent dialog appears
const acceptButton = page.getByRole('button', { name: /accept all/i });
if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  await acceptButton.click();
  await page.waitForTimeout(1000);
}

await page.raceRecordingStart();
await page.waitForTimeout(1500);

await page.raceStart('Search: meaning of life');
page.raceMessage('🌟 Asking Gemini...');

// Type the prompt into the Gemini input
const input = page.locator('[contenteditable="true"]').or(page.locator('textarea')).first();
await input.waitFor({ state: 'visible', timeout: 15000 });
await input.click();
await input.fill('What is the meaning of life?');
await page.keyboard.press('Enter');

// Wait for a response to appear
await page.locator('.model-response-text, .response-container, [class*="response"], message-content').first().waitFor({ state: 'visible', timeout: 30000 });
page.raceMessage('🌟 Response received!');
// Wait a bit for content to stream in
await page.waitForTimeout(3000);

page.raceEnd('Search: meaning of life');
await page.waitForTimeout(1500);

await page.raceRecordingEnd();
