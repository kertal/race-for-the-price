/**
 * Integration test: verify that build-time calibration values are
 * applied correctly in the HTML player, and that the canvas-based fallback
 * is wired up only when neither build-time nor trace calibration is available.
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

const calibratedClipTimes = [
  { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: 3.52 },
  { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: 2.0 },
];

const traceCalibratedClipTimes = [
  { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: null, traceCalibration: { recordingStartTs: 2_000_000, firstFrameTs: 1_900_000 } },
  { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: null, traceCalibration: { recordingStartTs: 3_000_000, firstFrameTs: 2_800_000 } },
];

const uncalibratedClipTimes = [
  { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0, calibratedStart: null },
  { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5, calibratedStart: null },
];

const baseClipTimes = [
  { start: 2.0, end: 10.0, recordingOffset: 0.01, wallClockDuration: 12.0 },
  { start: 1.8, end: 9.5, recordingOffset: 0.02, wallClockDuration: 11.5 },
];

let browser, page, tmpDir;

async function launchPlaywright() {
  const pw = await import('playwright');
  return pw.chromium.launch({ headless: true });
}

function buildAndWrite(clipTimes) {
  for (const vf of videoFiles) {
    fs.mkdirSync(path.join(tmpDir, path.dirname(vf)), { recursive: true });
  }
  const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });
  fs.writeFileSync(path.join(tmpDir, 'index.html'), html);
  return html;
}

function extractFromScripts(fn) {
  return page.evaluate(fn);
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

    buildAndWrite(calibratedClipTimes);
    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const parsed = await extractFromScripts(() => {
      for (const s of document.querySelectorAll('script')) {
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

    buildAndWrite(calibratedClipTimes);
    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const result = await extractFromScripts(() => {
      for (const s of document.querySelectorAll('script')) {
        if (s.textContent.includes('applyCalibrationToClip')) {
          return {
            hasBuildTimePath: s.textContent.includes('ct.calibratedStart != null'),
            hasApplyCall: s.textContent.includes('applyCalibrationToClip(ct, ct.calibratedStart'),
            hasContinue: s.textContent.includes('continue;'),
          };
        }
      }
      return null;
    });

    expect(result).toBeTruthy();
    expect(result.hasBuildTimePath).toBe(true);
    expect(result.hasApplyCall).toBe(true);
    expect(result.hasContinue).toBe(true);
  });

  it('skips canvas calibration when clips are build-time or trace calibrated', async () => {
    if (!page) return;

    buildAndWrite(traceCalibratedClipTimes);
    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const result = await extractFromScripts(() => {
      const clipTimesMatch = [...document.querySelectorAll('script')]
        .map(s => s.textContent.match(/const clipTimes = (\[.*?\]);/))
        .find(Boolean);
      const parsedClipTimes = clipTimesMatch ? JSON.parse(clipTimesMatch[1]) : null;
      const hasTraceCalibration = ct => !!(ct && ct.traceCalibration && Number.isFinite(ct.traceCalibration.recordingStartTs));
      const needsCalibration = parsedClipTimes
        ? parsedClipTimes.some(ct => ct && ct.calibratedStart == null && !hasTraceCalibration(ct))
        : null;

      for (const s of document.querySelectorAll('script')) {
        if (s.textContent.includes('needsCalibration')) {
          return {
            hasCheck: s.textContent.includes("clipTimes.some(ct => ct && ct.calibratedStart == null && !hasTraceCalibration(ct))"),
            hasTraceFixtures: Array.isArray(parsedClipTimes) && parsedClipTimes.every(ct => !!ct.traceCalibration),
            needsCalibration,
          };
        }
      }
      return null;
    });

    expect(result).toBeTruthy();
    expect(result.hasCheck).toBe(true);
    expect(result.hasTraceFixtures).toBe(true);
    expect(result.needsCalibration).toBe(false);
  });

  it('falls back to canvas calibration when calibratedStart is null', async () => {
    if (!page) return;

    buildAndWrite(uncalibratedClipTimes);
    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const parsed = await extractFromScripts(() => {
      for (const s of document.querySelectorAll('script')) {
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

    buildAndWrite(baseClipTimes);
    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const result = await extractFromScripts(() => {
      for (const s of document.querySelectorAll('script')) {
        if (s.textContent.includes('toBlobVideo')) {
          return {
            hasSecurityCheck: s.textContent.includes("e.name === 'SecurityError'"),
            hasTaintedCheck: s.textContent.includes("e.message.indexOf('tainted')"),
            hasThrow: s.textContent.includes('throw e'),
            hasBlobFn: s.textContent.includes('async function toBlobVideo'),
            hasFetchFallback: s.textContent.includes('fetch('),
            hasBlobUrl: s.textContent.includes('_blobUrl'),
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
    expect(result.hasFetchFallback).toBe(true);
    expect(result.hasBlobUrl).toBe(true);
    expect(result.hasCreateObjectURL).toBe(true);
  });

  it('applyCalibrationToClip computes correct clip range from PTS start', async () => {
    if (!page) return;

    buildAndWrite(calibratedClipTimes);
    await page.goto(`file://${path.join(tmpDir, 'index.html')}`);

    const result = await extractFromScripts(() => {
      for (const s of document.querySelectorAll('script')) {
        const match = s.textContent.match(/const clipTimes = (\[.*?\]);/);
        if (match) {
          return JSON.parse(match[1]).map(ct => {
            const segDuration = ct.end - ct.start;
            return {
              wcStart: ct.start, wcEnd: ct.end, segDuration,
              expectedStart: ct.calibratedStart,
              expectedEnd: ct.calibratedStart + segDuration,
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
