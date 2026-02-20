// 🏀 LeBron James - The King
// Four-time NBA Champion. Unstoppable force.
// Race: Dribble 3 times at the bottom (800px bounce), then scroll to the top.

await page.goto('https://en.wikipedia.org/wiki/LeBron_James', { waitUntil: 'load' });

// Inject Web Audio API sound functions into the page
await page.evaluate(() => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  window.__raceAudio = audioCtx;

  // Dribble sound — percussive thump like a basketball hitting the floor
  window.__playDribble = () => {
    const ctx = window.__raceAudio;
    const now = ctx.currentTime;
    // Oscillator: quick pitch drop 150Hz → 40Hz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    // Gain envelope: sharp attack, fast decay
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    // Low-pass filter for a rounder thump
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  };

  // Crowd roar — excited crowd noise when ball hits the net
  window.__playCrowd = () => {
    const ctx = window.__raceAudio;
    const now = ctx.currentTime;
    const duration = 2.5;
    // White noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    // Bandpass filter to shape noise into crowd-like frequencies
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, now);
    bp.Q.setValueAtTime(0.8, now);
    // Second filter for warmth
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2500, now);
    // Gain envelope: quick swell up, hold, then fade
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.3);
    gain.gain.setValueAtTime(0.5, now + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    noise.connect(bp);
    bp.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  };
});

// Scroll to a fixed absolute position (same for both racers so dribbles stay in sync)
const fixedStart = 10000;
await page.evaluate((y) => window.scrollTo(0, y), fixedStart);

await page.raceRecordingStart();
await page.waitForTimeout(1500);
await page.raceStart('Dribble Race');

// Basketball physics dribble — identical timing for both racers to stay in sync
for (let i = 0; i < 3; i++) {
  page.raceMessage(`🏀 Dribble ${i + 1}`);
  const downDist = 800;
  const downSteps = 25;
  for (let s = 0; s < downSteps; s++) {
    const t = (s + 1) / downSteps;
    const stepPx = Math.round((downDist * (2 * t)) / downSteps);
    await page.mouse.wheel(0, Math.max(stepPx, 2));
    await page.waitForTimeout(Math.round(35 - 22 * t));
  }

  // Ball hits the floor — play dribble sound
  await page.evaluate(() => window.__playDribble());
  await page.waitForTimeout(60);

  const upDist = 800;
  const upSteps = 25;
  for (let s = 0; s < upSteps; s++) {
    const t = (s + 1) / upSteps;
    const stepPx = Math.round((upDist * (2 * (1 - t))) / upSteps);
    await page.mouse.wheel(0, -Math.max(stepPx, 2));
    await page.waitForTimeout(Math.round(13 + 22 * t));
  }

  await page.waitForTimeout(140);
}

page.raceMessage('🏀 Going for the score!');
// Scroll to top — LeBron powers up with a strong smooth scroll
const scrollSteps = 40;
const totalScroll = await page.evaluate(() => window.scrollY);
for (let s = 0; s < scrollSteps; s++) {
  const t = (s + 1) / scrollSteps;
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const targetY = Math.round(totalScroll * (1 - ease));
  await page.evaluate((y) => window.scrollTo(0, y), targetY);
  await page.waitForTimeout(18);
}
await page.evaluate(() => window.scrollTo(0, 0));

page.raceEnd('Dribble Race');
// Ball hits the net — play crowd roar
page.raceMessage('🏀 King James has arrived.');
await page.evaluate(() => window.__playCrowd());
await page.waitForTimeout(2500);
await page.raceRecordingEnd();
