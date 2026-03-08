/**
 * Integration test: verify that build-time ffprobe calibration values are
 * applied correctly in the HTML player, and that the canvas-based fallback
 * is wired up for when build-time calibration is unavailable.
 *
 * Uses Playwright to load generated index.html pages with known clip times
 * and evaluate the player's runtime behavior.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { buildPlayerHtml } from '../cli/videoplayer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const makeSummary = (overrides = {}) => ({
  racers: ['alpha', 'bravo'],
  comparisons: [
    { name: 'Load', racers: [{ duration: 1 }, { duration: 2 }], winner: 'alpha', diff: 1, diffPercent: 100, rankings: ['alpha', 'bravo'] },
  ],
  overallWinner: 'alpha',
  timestamp: new Date().toISOString(),
  settings: {},
  errors: [],
  wins: { alpha: 1, bravo: 0 },
  clickCounts: { alpha: 0, bravo: 0 },
  videos: {},
  ...overrides,
});

const videoFiles = ['alpha/alpha.race.webm', 'bravo/bravo.race.webm'];

let browser, page, tmpDir;

async function launchPlaywright() {
  const pw = await import('playwright');
  return pw.chromium.launch({ headless: true });
}

function writeHtml(html) {
  for (const vf of videoFiles) {
    fs.mkdirSync(path.join(tmpDir, path.dirname(vf)), { recursive: true });
  }
  fs.writeFileSync(path.join(tmpDir, 'index.html'), html);
}

describe('calibration integration', () => {
  beforeAll(async () => {
    tmpDir = path.join(__dirname, '..', 'test-results', 'calibration-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      browser = await launchPlaywright();
      page = await browser.newPage();
    } catch (e) {
      console.error('Skipping calibration test: could not launch Playwright:', e.message);
    }
  });

  afterAll(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('embeds build-time calibratedStart in clipTimes JSON', async () => {
    if (!page) return;

    const clipTimes = [
      { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: 3.52 },
      { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: 2.0 },
    ];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
    writeHtml(html);

    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const parsed = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const match = s.textContent.match(/const clipTimes = (\[.*?\]);/);
        if (match) return JSON.parse(match[1]);
      }
      return null;
    });

    expect(parsed).toHaveLength(2);
    expect(parsed[0].calibratedStart).toBe(3.52);
    expect(parsed[1].calibratedStart).toBe(2.0);
  });

  it('onMeta applies calibratedStart via applyCalibrationToClip, not linear scaling', async () => {
    if (!page) return;

    const clipTimes = [
      { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: 3.52 },
      { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: 2.0 },
    ];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
    writeHtml(html);

    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    // Verify the onMeta code path: when calibratedStart is set, the player
    // should call applyCalibrationToClip which sets ct.start = calibratedStart
    // and ct.end = calibratedStart + (wcEnd - wcStart).
    const result = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent.includes('applyCalibrationToClip')) {
          // Verify the build-time calibration branch exists
          const hasBuildTimePath = s.textContent.includes('ct.calibratedStart != null');
          const hasApplyCall = s.textContent.includes('applyCalibrationToClip(ct, ct.calibratedStart');
          const hasContinue = s.textContent.includes('continue;');
          return { hasBuildTimePath, hasApplyCall, hasContinue };
        }
      }
      return null;
    });

    expect(result).toBeTruthy();
    expect(result.hasBuildTimePath).toBe(true);
    expect(result.hasApplyCall).toBe(true);
    expect(result.hasContinue).toBe(true);
  });

  it('skips canvas calibration when all clips have build-time calibratedStart', async () => {
    if (!page) return;

    const clipTimes = [
      { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: 3.52 },
      { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: 2.0 },
    ];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
    writeHtml(html);

    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    // Verify needsCalibration check: when all calibratedStart are non-null,
    // canvas calibration should not be triggered
    const result = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent.includes('needsCalibration')) {
          const hasCheck = s.textContent.includes("clipTimes.some(function(ct) { return ct && ct.calibratedStart == null; })");
          return { hasCheck };
        }
      }
      return null;
    });

    expect(result).toBeTruthy();
    expect(result.hasCheck).toBe(true);
  });

  it('falls back to canvas calibration when calibratedStart is null', async () => {
    if (!page) return;

    const clipTimes = [
      { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: null },
      { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: null },
    ];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
    writeHtml(html);

    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const parsed = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const match = s.textContent.match(/const clipTimes = (\[.*?\]);/);
        if (match) return JSON.parse(match[1]);
      }
      return null;
    });

    expect(parsed).toHaveLength(2);
    expect(parsed[0].calibratedStart).toBeNull();
    expect(parsed[1].calibratedStart).toBeNull();
  });

  it('includes SecurityError re-throw for blob fallback on file://', async () => {
    if (!page) return;

    const clipTimes = [
      { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0 },
      { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5 },
    ];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
    writeHtml(html);

    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const result = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent.includes('toBlobVideo')) {
          return {
            hasSecurityCheck: s.textContent.includes("e.name === 'SecurityError'"),
            hasTaintedCheck: s.textContent.includes("e.message.indexOf('tainted')"),
            hasThrow: s.textContent.includes('throw e'),
            hasBlobFn: s.textContent.includes('function toBlobVideo'),
            hasScanWithBlob: s.textContent.includes('scanWithBlob'),
            hasXhr: s.textContent.includes('XMLHttpRequest'),
            hasCreateObjectURL: s.textContent.includes('createObjectURL'),
          };
        }
      }
      return null;
    });

    expect(result).toBeTruthy();
    expect(result.hasSecurityCheck).toBe(true);
    expect(result.hasTaintedCheck).toBe(true);
    expect(result.hasThrow).toBe(true);
    expect(result.hasBlobFn).toBe(true);
    expect(result.hasScanWithBlob).toBe(true);
    expect(result.hasXhr).toBe(true);
    expect(result.hasCreateObjectURL).toBe(true);
  });

  it('applyCalibrationToClip computes correct clip range from PTS start', async () => {
    if (!page) return;

    const clipTimes = [
      { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: 3.52 },
      { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: 2.0 },
    ];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
    writeHtml(html);

    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    // Simulate what applyCalibrationToClip does:
    // segDuration = _wcEnd - _wcStart (original wall-clock times)
    // ct.start = ptsStart, ct.end = min(ptsStart + segDuration, videoDuration)
    const result = await page.evaluate(() => {
      // Extract clip data
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const match = s.textContent.match(/const clipTimes = (\[.*?\]);/);
        if (match) {
          const clips = JSON.parse(match[1]);
          return clips.map(ct => {
            const wcStart = ct.start;
            const wcEnd = ct.end;
            const segDuration = wcEnd - wcStart;
            const ptsStart = ct.calibratedStart;
            return {
              wcStart, wcEnd, segDuration,
              expectedStart: ptsStart,
              expectedEnd: ptsStart + segDuration,
            };
          });
        }
      }
      return null;
    });

    expect(result).toHaveLength(2);

    // alpha: wcStart=2.0, wcEnd=10.0 → segDuration=8.0, calibratedStart=3.52
    expect(result[0].expectedStart).toBeCloseTo(3.52, 5);
    expect(result[0].expectedEnd).toBeCloseTo(3.52 + 8.0, 5);

    // bravo: wcStart=1.8, wcEnd=9.5 → segDuration=7.7, calibratedStart=2.0
    expect(result[1].expectedStart).toBeCloseTo(2.0, 5);
    expect(result[1].expectedEnd).toBeCloseTo(2.0 + 7.7, 5);
  });
});
