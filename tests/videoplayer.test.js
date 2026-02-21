import { describe, it, expect } from 'vitest';
import { buildPlayerHtml } from '../cli/videoplayer.js';
import { buildProfileComparison } from '../cli/profile-analysis.js';

const makeSummary = (overrides = {}) => ({
  racers: ['lauda', 'hunt'],
  comparisons: [
    { name: 'Load', racers: [{ duration: 1.0 }, { duration: 2.0 }], winner: 'lauda', diff: 1.0, diffPercent: 100.0, rankings: ['lauda', 'hunt'] },
  ],
  overallWinner: 'lauda',
  timestamp: '2025-01-15T12:00:00.000Z',
  settings: {},
  errors: [],
  wins: { lauda: 1, hunt: 0 },
  clickCounts: { lauda: 0, hunt: 0 },
  videos: {},
  ...overrides,
});

const huntWinsSummary = () => makeSummary({
  overallWinner: 'hunt',
  comparisons: [
    { name: 'Load', racers: [{ duration: 2.0 }, { duration: 1.0 }], winner: 'hunt', rankings: ['hunt', 'lauda'] },
  ],
});

const videoFiles = ['lauda/lauda.race.webm', 'hunt/hunt.race.webm'];
const abVideoFiles = ['a/a.race.webm', 'b/b.race.webm'];
const abSummary = (overrides = {}) => makeSummary({ racers: ['a', 'b'], comparisons: [], ...overrides });

describe('buildPlayerHtml', () => {
  it('returns a complete HTML document', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('embeds racer names and video sources', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('lauda');
    expect(html).toContain('hunt');
    expect(html).toContain('src="lauda/lauda.race.webm"');
    expect(html).toContain('src="hunt/hunt.race.webm"');
  });

  it('includes results with measurement data and deltas', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('1.000s');
    expect(html).toContain('2.000s');
    expect(html).toContain('(+1.000s)');
    expect(html).toContain('profile-bar-fill');
  });

  it('shows winner banner', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('LAUDA wins!');
  });

  it('shows tie banner when tied', () => {
    const html = buildPlayerHtml(makeSummary({ overallWinner: 'tie' }), videoFiles);
    expect(html).toContain("It's a Tie!");
  });

  it('includes playback controls', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('id="playBtn"');
    expect(html).toContain('id="scrubber"');
    expect(html).toContain('id="speedSelect"');
  });

  it('includes frame navigation buttons', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('id="prevFrame"');
    expect(html).toContain('id="nextFrame"');
  });

  it('includes keyboard frame-step logic', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('ArrowLeft');
    expect(html).toContain('ArrowRight');
    expect(html).toContain('stepFrame');
  });

  it('includes files section with video links', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('Files');
    expect(html).toContain('href="lauda/lauda.race.webm"');
    expect(html).toContain('href="hunt/hunt.race.webm"');
    expect(html).toContain('lauda (race)');
    expect(html).toContain('hunt (race)');
  });

  it('includes alt format download links in files section', () => {
    const altFiles = ['lauda/lauda.race.gif', 'hunt/hunt.race.gif'];
    const html = buildPlayerHtml(makeSummary(), videoFiles, 'gif', altFiles);
    expect(html).toContain('Files');
    expect(html).toContain('lauda (.gif)');
    expect(html).toContain('hunt (.gif)');
    expect(html).toContain('href="lauda/lauda.race.gif"');
  });

  it('handles empty comparisons', () => {
    const html = buildPlayerHtml(makeSummary({ comparisons: [] }), videoFiles);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Results');
  });

  it('supports 3 racers', () => {
    const summary = makeSummary({
      racers: ['alpha', 'beta', 'gamma'],
      comparisons: [
        { name: 'Load', racers: [{ duration: 1.0 }, { duration: 1.5 }, { duration: 2.0 }], winner: 'alpha', diff: 1.0, diffPercent: 100.0 },
      ],
      overallWinner: 'alpha',
    });
    const videos = ['alpha/alpha.race.webm', 'beta/beta.race.webm', 'gamma/gamma.race.webm'];
    const html = buildPlayerHtml(summary, videos);
    expect(html).toContain('src="alpha/alpha.race.webm"');
    expect(html).toContain('src="beta/beta.race.webm"');
    expect(html).toContain('src="gamma/gamma.race.webm"');
    expect(html).toContain('>alpha<');
    expect(html).toContain('>beta<');
    expect(html).toContain('>gamma<');
    expect(html).toContain('const raceVideos = [v0, v1, v2]');
  });

  it('supports 4 racers', () => {
    const summary = makeSummary({ racers: ['a', 'b', 'c', 'd'], comparisons: [], overallWinner: null });
    const videos = ['a/a.race.webm', 'b/b.race.webm', 'c/c.race.webm', 'd/d.race.webm'];
    const html = buildPlayerHtml(summary, videos);
    expect(html).toContain('id="v0"');
    expect(html).toContain('id="v1"');
    expect(html).toContain('id="v2"');
    expect(html).toContain('id="v3"');
    expect(html).toContain('const raceVideos = [v0, v1, v2, v3]');
  });

  it('supports 5 racers with download links', () => {
    const summary = makeSummary({ racers: ['r1', 'r2', 'r3', 'r4', 'r5'], comparisons: [], overallWinner: 'r1' });
    const videos = ['r1/r1.webm', 'r2/r2.webm', 'r3/r3.webm', 'r4/r4.webm', 'r5/r5.webm'];
    const altFiles = ['r1/r1.gif', 'r2/r2.gif', 'r3/r3.gif', 'r4/r4.gif', 'r5/r5.gif'];
    const html = buildPlayerHtml(summary, videos, 'gif', altFiles);
    expect(html).toContain('id="v4"');
    expect(html).toContain('r1 (.gif)');
    expect(html).toContain('r5 (.gif)');
    expect(html).toContain('const raceVideos = [v0, v1, v2, v3, v4]');
  });

  it('assigns correct colors to racer labels', () => {
    const summary = makeSummary({ racers: ['red', 'blue', 'green'], comparisons: [], overallWinner: null });
    const videos = ['r/r.webm', 'b/b.webm', 'g/g.webm'];
    const html = buildPlayerHtml(summary, videos);
    expect(html).toContain('style="color: #e74c3c"');
    expect(html).toContain('style="color: #3498db"');
    expect(html).toContain('style="color: #27ae60"');
  });

  it('displays time with milliseconds', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('0:00.000 / 0:00.000');
    expect(html).toContain('id="timeDisplay"');
  });

  it('displays step time', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('0.0s');
    expect(html).toContain('id="frameDisplay"');
    expect(html).toContain('getTime');
  });

  it('shows mode toggle when full videos provided', () => {
    const fullVideos = ['lauda/lauda.full.webm', 'hunt/hunt.full.webm'];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { fullVideoFiles: fullVideos });
    expect(html).toContain('id="modeRace"');
    expect(html).toContain('id="modeFull"');
    expect(html).toContain('class="mode-btn active"');
    expect(html).toContain('switchToFull');
  });

  it('shows merged video button when merged video provided', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { mergedVideoFile: 'lauda-vs-hunt.webm' });
    expect(html).toContain('id="modeMerged"');
    expect(html).toContain('id="mergedVideo"');
    expect(html).toContain('src="lauda-vs-hunt.webm"');
    expect(html).toContain('switchToMerged');
  });

  it('shows all mode buttons when both full and merged provided', () => {
    const fullVideos = ['lauda/lauda.full.webm', 'hunt/hunt.full.webm'];
    const options = { fullVideoFiles: fullVideos, mergedVideoFile: 'merged.webm' };
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, options);
    expect(html).toContain('id="modeRace"');
    expect(html).toContain('id="modeFull"');
    expect(html).toContain('id="modeMerged"');
  });

  it('hides mode toggle when no additional videos', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null);
    expect(html).not.toContain('id="modeFull"');
    expect(html).not.toContain('id="modeMerged"');
  });

  it('includes full video paths in JavaScript', () => {
    const fullVideos = ['lauda/lauda.full.webm', 'hunt/hunt.full.webm'];
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, { fullVideoFiles: fullVideos });
    expect(html).toContain('"lauda/lauda.full.webm"');
    expect(html).toContain('"hunt/hunt.full.webm"');
  });

  it('omits profile section when no profileComparison', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).not.toContain('Performance Profile');
  });

  it('includes profile section when profileComparison provided', () => {
    const metrics1 = { total: { networkTransferSize: 1000, scriptDuration: 100 }, measured: { networkTransferSize: 500 } };
    const metrics2 = { total: { networkTransferSize: 2000, scriptDuration: 200 }, measured: { networkTransferSize: 800 } };
    const profileComparison = buildProfileComparison(['lauda', 'hunt'], [metrics1, metrics2]);
    const html = buildPlayerHtml(makeSummary({ profileComparison }), videoFiles);

    expect(html).toContain('Performance Profile');
    expect(html).toContain('Lower values are better');
    expect(html).toContain('During Measurement');
    expect(html).toContain('Total Session');
  });

  it('shows profile racers sorted by value with deltas', () => {
    const metrics1 = { total: { networkTransferSize: 2000 }, measured: {} };
    const metrics2 = { total: { networkTransferSize: 1000 }, measured: {} };
    const profileComparison = buildProfileComparison(['lauda', 'hunt'], [metrics1, metrics2]);
    const html = buildPlayerHtml(makeSummary({ profileComparison }), videoFiles);

    // Within the profile section (after "Total Session"), hunt (1000) should appear before lauda (2000)
    const profileStart = html.indexOf('Total Session');
    const profileSection = html.slice(profileStart);
    const huntPos = profileSection.indexOf('>hunt<');
    const laudaPos = profileSection.indexOf('>lauda<');
    expect(huntPos).toBeLessThan(laudaPos);

    // lauda should show a delta in the profile section
    expect(profileSection).toContain('(+');
  });

  it('shows profile with 3+ racers', () => {
    const data = [
      { total: { networkTransferSize: 3000 }, measured: {} },
      { total: { networkTransferSize: 1000 }, measured: {} },
      { total: { networkTransferSize: 2000 }, measured: {} },
    ];
    const racers = ['angular', 'htmx', 'react'];
    const profileComparison = buildProfileComparison(racers, data);
    const summary = makeSummary({ racers, comparisons: [], overallWinner: null, profileComparison });
    const videos = ['a/a.webm', 'h/h.webm', 'r/r.webm'];
    const html = buildPlayerHtml(summary, videos);

    expect(html).toContain('angular');
    expect(html).toContain('htmx');
    expect(html).toContain('react');
    expect(html).toContain('profile-bar-fill');
    expect(html).toContain('profile-bar-fill');
  });

  it('shows winner video first when hunt wins', () => {
    const html = buildPlayerHtml(huntWinsSummary(), videoFiles);
    const laudaPos = html.indexOf('src="lauda/lauda.race.webm"');
    const huntPos = html.indexOf('src="hunt/hunt.race.webm"');
    expect(huntPos).toBeLessThan(laudaPos);
  });

  it('shows winner video first with original colors preserved', () => {
    const html = buildPlayerHtml(huntWinsSummary(), videoFiles);
    // hunt (index 1) should appear first but keep its blue color (#3498db)
    const huntLabelMatch = html.match(/color: (#[0-9a-f]+)">hunt/);
    expect(huntLabelMatch[1]).toBe('#3498db');
  });

  it('omits script tag when no videos provided', () => {
    const html = buildPlayerHtml(makeSummary(), [], null, null, {
      runNavigation: { currentRun: 'median', totalRuns: 3, pathPrefix: '' },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('Results');
  });

  it('shows median page with videos and source note', () => {
    const medianVideos = ['2/lauda/lauda.race.webm', '2/hunt/hunt.race.webm'];
    const html = buildPlayerHtml(makeSummary(), medianVideos, null, null, {
      runNavigation: { currentRun: 'median', totalRuns: 3, pathPrefix: '' },
      medianRunLabel: 'Run 2',
    });
    expect(html).toContain('<script>');
    expect(html).toContain('src="2/lauda/lauda.race.webm"');
    expect(html).toContain('Videos from Run 2 (closest to median)');
  });

  it('shows run navigation bar', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, {
      runNavigation: { currentRun: 1, totalRuns: 3, pathPrefix: '../' },
    });
    expect(html).toContain('Run 1');
    expect(html).toContain('Run 2');
    expect(html).toContain('Run 3');
    expect(html).toContain('Median');
    expect(html).toContain('run-nav-btn active');
  });
});

// --- Race Info section ---

describe('buildPlayerHtml race info', () => {
  it('shows racer names in race info', () => {
    const summary = makeSummary({ racers: ['alpha', 'beta'], comparisons: [], timestamp: '2025-06-01T10:00:00.000Z' });
    const html = buildPlayerHtml(summary, abVideoFiles);
    expect(html).toContain('race-info');
    expect(html).toContain('Racer 1');
    expect(html).toContain('alpha');
    expect(html).toContain('Racer 2');
    expect(html).toContain('beta');
  });

  it('shows mode, network, and CPU settings', () => {
    const summary = abSummary({ timestamp: '2025-06-01T10:00:00.000Z', settings: { parallel: false, network: 'slow-3g', cpuThrottle: 4 } });
    const html = buildPlayerHtml(summary, abVideoFiles);
    expect(html).toContain('sequential');
    expect(html).toContain('slow-3g');
    expect(html).toContain('4x');
  });

  it('defaults mode to parallel', () => {
    const html = buildPlayerHtml(abSummary(), abVideoFiles);
    expect(html).toContain('parallel');
  });
});

// --- Errors section ---

describe('buildPlayerHtml errors', () => {
  it('shows errors when present', () => {
    const html = buildPlayerHtml(abSummary({ errors: ['a: timeout', 'b: crash'] }), abVideoFiles);
    expect(html).toContain('errors');
    expect(html).toContain('a: timeout');
    expect(html).toContain('b: crash');
  });

  it('omits errors section when no errors', () => {
    const html = buildPlayerHtml(abSummary(), abVideoFiles);
    // No errors div should be present
    expect(html).not.toContain('class="errors"');
  });
});

// --- Click counts in results ---

describe('buildPlayerHtml click counts', () => {
  it('shows click counts when present', () => {
    const html = buildPlayerHtml(makeSummary({ comparisons: [], clickCounts: { lauda: 5, hunt: 3 } }), videoFiles);
    expect(html).toContain('Clicks');
    expect(html).toContain('>5<');
    expect(html).toContain('>3<');
  });

  it('omits clicks when all zero', () => {
    const html = buildPlayerHtml(makeSummary({ comparisons: [] }), videoFiles);
    expect(html).not.toContain('Clicks');
  });
});

// --- Clip times (default mode, without --ffmpeg) ---

describe('buildPlayerHtml clipTimes', () => {
  const withClips = (clips) => buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes: clips });

  it('shows mode toggle with Full button when clipTimes provided', () => {
    const html = withClips([{ start: 1.5, end: 3.0 }, { start: 1.5, end: 3.0 }]);
    expect(html).toContain('id="modeRace"');
    expect(html).toContain('id="modeFull"');
  });

  it('embeds clipTimes data in player script', () => {
    const html = withClips([{ start: 1.5, end: 3.0 }, { start: 1.2, end: 2.8 }]);
    expect(html).toContain('const clipTimes =');
    expect(html).toContain('"start":');
    expect(html).toContain('"end":');
  });

  it('sets clipTimes to null when not provided', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('const clipTimes = null');
  });

  it('handles clipTimes with null entries', () => {
    const html = withClips([{ start: 1.0, end: 2.0 }, null]);
    expect(html).toContain('id="modeFull"');
    expect(html).toContain('const clipTimes =');
  });

  it('hides Full button when all clipTimes entries are null', () => {
    const html = withClips([null, null]);
    expect(html).not.toContain('id="modeFull"');
  });

  it('includes clip constraint logic in player script', () => {
    const html = withClips([{ start: 1.0, end: 5.0 }, { start: 1.0, end: 5.0 }]);
    expect(html).toContain('activeClip');
    expect(html).toContain('clipOffset');
    expect(html).toContain('clipDuration');
    expect(html).toContain('resolveClip');
  });

  it('orders clipTimes by placement (winner first)', () => {
    const clips = [{ start: 1.0, end: 3.0 }, { start: 0.5, end: 2.5 }];
    const html = buildPlayerHtml(huntWinsSummary(), videoFiles, null, null, { clipTimes: clips });
    // hunt (index 1, clip start 0.5) should be first in the ordered array
    const clipMatch = html.match(/const clipTimes = (\[.*?\]);/);
    expect(clipMatch).toBeTruthy();
    const parsed = JSON.parse(clipMatch[1]);
    expect(parsed[0].start).toBe(0.5); // hunt's clip first (winner)
    expect(parsed[1].start).toBe(1.0); // lauda's clip second
  });

  it('does not show Merged button without mergedVideoFile', () => {
    const html = withClips([{ start: 1.0, end: 3.0 }, { start: 1.0, end: 3.0 }]);
    expect(html).not.toContain('id="modeMerged"');
  });
});

// --- Files section ---

describe('buildPlayerHtml files section', () => {
  it('includes race video links', () => {
    const html = buildPlayerHtml(abSummary(), abVideoFiles);
    expect(html).toContain('Files');
    expect(html).toContain('href="a/a.race.webm"');
    expect(html).toContain('a (race)');
  });

  it('includes full video links', () => {
    const fullVideos = ['a/a.full.webm', 'b/b.full.webm'];
    const html = buildPlayerHtml(abSummary(), abVideoFiles, null, null, { fullVideoFiles: fullVideos });
    expect(html).toContain('href="a/a.full.webm"');
    expect(html).toContain('a (full)');
  });

  it('includes side-by-side link', () => {
    const html = buildPlayerHtml(abSummary(), abVideoFiles, null, null, { mergedVideoFile: 'a-vs-b.webm' });
    expect(html).toContain('href="a-vs-b.webm"');
    expect(html).toContain('side-by-side');
  });

  it('includes profile trace links when provided', () => {
    const traceFiles = ['a/a.trace.json', 'b/b.trace.json'];
    const html = buildPlayerHtml(abSummary(), abVideoFiles, null, null, { traceFiles });
    expect(html).toContain('href="a/a.trace.json"');
    expect(html).toContain('a (profile)');
    expect(html).toContain('chrome://tracing');
  });

  it('omits trace links when not profiling', () => {
    const html = buildPlayerHtml(abSummary(), abVideoFiles);
    expect(html).not.toContain('.trace.json');
  });
});

// --- Debug mode ---

describe('buildPlayerHtml debug mode', () => {
  const clipTimes = [{ start: 1.52, end: 3.0 }, { start: 1.2, end: 2.8 }];
  const debugHtml = () => buildPlayerHtml(makeSummary(), videoFiles, null, null, { clipTimes });

  it('shows Debug button when clipTimes provided', () => {
    const html = debugHtml();
    expect(html).toContain('id="modeDebug"');
    expect(html).toContain('>Debug<');
  });

  it('hides Debug button when no clipTimes', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).not.toContain('id="modeDebug"');
  });

  it('hides Debug button when all clipTimes are null', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles, null, null, {
      clipTimes: [null, null],
    });
    expect(html).not.toContain('id="modeDebug"');
  });

  it('renders debug panel with per-racer rows', () => {
    const html = debugHtml();
    expect(html).toContain('id="debugPanel"');
    expect(html).toContain('DEBUG: Clip Start Calibration');
    expect(html).toContain('data-debug-idx="0"');
    expect(html).toContain('data-debug-idx="1"');
  });

  it('debug panel has frame adjustment buttons', () => {
    const html = debugHtml();
    expect(html).toContain('data-delta="-5"');
    expect(html).toContain('data-delta="-1"');
    expect(html).toContain('data-delta="1"');
    expect(html).toContain('data-delta="5"');
  });

  it('debug panel has Copy JSON and Reset All buttons', () => {
    const html = debugHtml();
    expect(html).toContain('id="debugCopyJson"');
    expect(html).toContain('Copy JSON');
    expect(html).toContain('id="debugResetAll"');
    expect(html).toContain('Reset All');
  });

  it('debug panel shows frame step info', () => {
    expect(debugHtml()).toContain('1 frame = 0.040s (25fps)');
  });

  it('script includes debug functions', () => {
    const html = debugHtml();
    expect(html).toContain('FRAME_STEP');
    expect(html).toContain('switchToDebug');
    expect(html).toContain('adjustDebugOffset');
    expect(html).toContain('debugOffsets');
    expect(html).toContain('getAdjustedClipTimes');
    expect(html).toContain('resolveAdjustedClip');
  });

  it('debug panel contains stats container', () => {
    expect(debugHtml()).toContain('id="debugStats"');
  });

  it('debug stats section has VIDEO INFO header', () => {
    const html = debugHtml();
    expect(html).toContain('VIDEO INFO');
    expect(html).toContain('debug-stats-header');
  });

  it('script includes updateDebugStats function', () => {
    const html = debugHtml();
    expect(html).toContain('updateDebugStats');
    expect(html).toContain('getVideoPlaybackQuality');
  });

  it('debug rows ordered by placement (winner first)', () => {
    const html = buildPlayerHtml(huntWinsSummary(), videoFiles, null, null, { clipTimes });
    const panelStart = html.indexOf('id="debugPanel"');
    const panelSection = html.slice(panelStart);
    const huntPos = panelSection.indexOf('>hunt<');
    const laudaPos = panelSection.indexOf('>lauda<');
    expect(huntPos).toBeLessThan(laudaPos);
  });
});

// --- Export (client-side side-by-side stitching) ---

describe('buildPlayerHtml export', () => {
  it('renders Export button when videos exist', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('id="exportBtn"');
    expect(html).toContain('Export');
  });

  it('script contains startExport function', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('startExport');
  });

  it('script contains MediaRecorder and captureStream', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('MediaRecorder');
    expect(html).toContain('captureStream');
  });

  it('script contains getExportLayout function', () => {
    const html = buildPlayerHtml(makeSummary(), videoFiles);
    expect(html).toContain('getExportLayout');
  });

  it('does not render Export button when no videos', () => {
    const html = buildPlayerHtml(makeSummary(), []);
    expect(html).not.toContain('id="exportBtn"');
  });
});
