/**
 * Generates a self-contained HTML file with a retro Grand Prix styled
 * video player for race results. Supports 2-5 racers.
 *
 * The HTML structure and CSS live in player.html (a real HTML template).
 * This module builds the dynamic sections and injects them via {{placeholder}}
 * replacement, keeping presentation separate from data logic.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROFILE_METRICS, categoryDescriptions } from './profile-analysis.js';
import { getPlacementOrder, formatPlatform } from './summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'player.html'), 'utf-8');

const RACER_CSS_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#f1c40f', '#9b59b6'];

// ---------------------------------------------------------------------------
// Template renderer — replaces {{key}} placeholders with values
// ---------------------------------------------------------------------------

function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a string for safe embedding in HTML text/attribute contexts. */
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Build sorted bar-chart HTML rows for a single metric. */
function buildMetricRowsHtml(entries, winner, formatDelta) {
  const nonNullVals = entries.filter(e => e.val !== null).map(e => e.val);
  const maxVal = nonNullVals.length > 0 ? Math.max(...nonNullVals) : 0;
  const bestVal = entries[0]?.val;
  let html = '';
  for (const entry of entries) {
    const color = RACER_CSS_COLORS[entry.index % RACER_CSS_COLORS.length];
    const barPct = entry.val !== null && maxVal > 0 ? Math.round((entry.val / maxVal) * 100) : 0;
    let delta = '';
    if (entry.val !== null && bestVal !== null && entry.val !== bestVal) {
      delta = `<span class="profile-delta">(+${formatDelta(entry.val - bestVal)})</span>`;
    }
    html += `
        <div class="profile-row">
          <span class="profile-racer" style="color: ${color}">${escHtml(entry.name)}</span>
          <span class="profile-bar-track">
            <span class="profile-bar-fill" style="width: ${barPct}%; background: ${color}"></span>
          </span>
          <span class="profile-value">${escHtml(entry.formatted)}${delta}</span>
          ${winner === entry.name ? '<span class="profile-medal">&#127942;</span>' : ''}
        </div>`;
  }
  return html;
}

/** Sort racers by value ascending (best first), nulls last. */
function sortByValue(racers, getValue) {
  return racers
    .map((name, i) => ({ name, index: i, ...getValue(i) }))
    .sort((a, b) => {
      if (a.val === null) return 1;
      if (b.val === null) return -1;
      return a.val - b.val;
    });
}

// ---------------------------------------------------------------------------
// Section Builders — each returns an HTML string (or '' if nothing to show)
// ---------------------------------------------------------------------------

function buildRunNavHtml(runNav) {
  if (!runNav) return '';
  const { currentRun, totalRuns, pathPrefix } = runNav;
  let html = `<div class="run-nav">`;
  for (let i = 1; i <= totalRuns; i++) {
    const isCurrent = currentRun === i;
    const cls = isCurrent ? 'run-nav-btn active' : 'run-nav-btn';
    if (isCurrent) {
      html += `<span class="${cls}" aria-current="page">Run ${i}</span>`;
    } else {
      html += `<a class="${cls}" href="${escHtml(pathPrefix)}${i}/index.html">Run ${i}</a>`;
    }
  }
  const isMedianCurrent = currentRun === 'median';
  const medianCls = isMedianCurrent ? 'run-nav-btn active' : 'run-nav-btn';
  if (isMedianCurrent) {
    html += `<span class="${medianCls}" aria-current="page">Median</span>`;
  } else {
    html += `<a class="${medianCls}" href="${escHtml(pathPrefix)}index.html">Median</a>`;
  }
  html += `</div>`;
  return html;
}

function buildRaceInfoHtml(summary) {
  const { racers, settings, timestamp } = summary;
  const rows = [];
  if (timestamp) rows.push(`<tr><td>Date</td><td>${escHtml(new Date(timestamp).toISOString())}</td></tr>`);
  racers.forEach((r, i) => rows.push(`<tr><td>Racer ${i + 1}</td><td>${escHtml(r)}</td></tr>`));
  if (settings) {
    const mode = settings.parallel === false ? 'sequential' : 'parallel';
    rows.push(`<tr><td>Mode</td><td>${mode}</td></tr>`);
    if (settings.network && settings.network !== 'none') rows.push(`<tr><td>Network</td><td>${escHtml(settings.network)}</td></tr>`);
    if (settings.cpuThrottle && settings.cpuThrottle > 1) rows.push(`<tr><td>CPU Throttle</td><td>${settings.cpuThrottle}x</td></tr>`);
    if (settings.format && settings.format !== 'webm') rows.push(`<tr><td>Format</td><td>${escHtml(settings.format)}</td></tr>`);
    if (settings.headless) rows.push(`<tr><td>Headless</td><td>yes</td></tr>`);
    if (settings.runs && settings.runs > 1) rows.push(`<tr><td>Runs</td><td>${settings.runs}</td></tr>`);
  }
  if (rows.length === 0) return '';
  return `<div class="race-info"><table>${rows.join('')}</table></div>`;
}

function buildMachineInfoHtml(machineInfo) {
  if (!machineInfo) return '';
  const rows = [];
  rows.push(`<tr><td>OS</td><td>${escHtml(formatPlatform(machineInfo.platform))} ${escHtml(machineInfo.osRelease)} (${escHtml(machineInfo.arch)})</td></tr>`);
  rows.push(`<tr><td>CPU</td><td>${escHtml(machineInfo.cpuModel)} (${machineInfo.cpuCores} cores)</td></tr>`);
  if (machineInfo.totalMemoryMB) {
    const memGB = (machineInfo.totalMemoryMB / 1024).toFixed(1);
    rows.push(`<tr><td>Memory</td><td>${memGB} GB</td></tr>`);
  }
  if (machineInfo.nodeVersion) {
    rows.push(`<tr><td>Node.js</td><td>${escHtml(machineInfo.nodeVersion)}</td></tr>`);
  }
  return `<div class="machine-info"><table>${rows.join('')}</table></div>`;
}

function buildErrorsHtml(errors) {
  if (!errors || errors.length === 0) return '';
  return `<div class="errors"><ul>${errors.map(e => `<li>${escHtml(e)}</li>`).join('')}</ul></div>`;
}

function buildResultsHtml(comparisons, racers, clickCounts) {
  let html = '';
  for (const comp of comparisons) {
    const sorted = sortByValue(racers, i => {
      const r = comp.racers[i];
      return { val: r ? r.duration : null, formatted: r ? `${r.duration.toFixed(3)}s` : '-' };
    });
    html += `<div class="profile-metric">
        <div class="profile-metric-name">${escHtml(comp.name)}</div>${buildMetricRowsHtml(sorted, comp.winner, v => `${v.toFixed(3)}s`)}</div>\n`;
  }
  if (clickCounts) {
    const total = racers.reduce((sum, r) => sum + (clickCounts[r] || 0), 0);
    if (total > 0) {
      const maxCount = Math.max(...racers.map(r => clickCounts[r] || 0));
      html += `<div class="profile-metric">
        <div class="profile-metric-name">Clicks</div>${racers.map((r, i) => {
        const count = clickCounts[r] || 0;
        const barPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        const color = RACER_CSS_COLORS[i % RACER_CSS_COLORS.length];
        return `
        <div class="profile-row">
          <span class="profile-racer" style="color: ${color}">${escHtml(r)}</span>
          <span class="profile-bar-track">
            <span class="profile-bar-fill" style="width: ${barPct}%; background: ${color}"></span>
          </span>
          <span class="profile-value">${count}</span>
        </div>`;
      }).join('')}</div>\n`;
    }
  }
  return html;
}

function buildProfileHtml(profileComparison, racers) {
  if (!profileComparison) return '';
  const { measured, total } = profileComparison;
  if (measured.comparisons.length === 0 && total.comparisons.length === 0) return '';

  let html = `<div class="section">
  <h2>Performance Profile</h2>
  <p class="profile-note">Lower values are better for all metrics. Hover over metric names for details.</p>\n`;

  const scopes = [
    { title: 'During Measurement (raceStart \u2192 raceEnd)', desc: 'Metrics captured only between raceStart() and raceEnd() calls \u2014 isolates the code being tested.', section: measured, collapsed: false },
    { title: 'Total Session', desc: 'Metrics for the entire browser session from launch to close \u2014 includes page load, setup, and teardown.', section: total, collapsed: true },
  ];
  for (const scope of scopes) {
    if (scope.section.comparisons.length === 0) continue;

    if (scope.collapsed) {
      html += `<details class="profile-collapsible">\n<summary><h3 style="display:inline">${escHtml(scope.title)}</h3></summary>\n`;
    } else {
      html += `<h3>${escHtml(scope.title)}</h3>\n`;
    }
    html += `<p class="profile-scope-desc">${escHtml(scope.desc)}</p>\n`;
    for (const [category, comps] of Object.entries(scope.section.byCategory)) {
      const catLabel = category[0].toUpperCase() + category.slice(1);
      const catDesc = categoryDescriptions[category] || '';
      html += `<h4 ${catDesc ? `title="${escHtml(catDesc)}"` : ''}>${escHtml(catLabel)}</h4>\n`;
      if (catDesc) {
        html += `<p class="profile-category-desc">${escHtml(catDesc)}</p>\n`;
      }
      for (const comp of comps) {
        const sorted = sortByValue(racers, i => ({ val: comp.values[i], formatted: comp.formatted[i] }));
        const metricDef = PROFILE_METRICS[comp.key];
        const formatDelta = metricDef.format;
        const desc = metricDef.description || '';
        html += `<div class="profile-metric">
        <div class="profile-metric-name" ${desc ? `title="${escHtml(desc)}"` : ''}>${escHtml(comp.name)}${desc ? ' <span class="profile-info-icon">&#9432;</span>' : ''}</div>
        ${desc ? `<div class="profile-metric-desc">${escHtml(desc)}</div>` : ''}${buildMetricRowsHtml(sorted, comp.winner, formatDelta)}</div>\n`;
      }
    }
    if (scope.section.overallWinner === 'tie') {
      html += `<div class="profile-winner">&#129309; Tie!</div>`;
    } else if (scope.section.overallWinner) {
      const idx = racers.indexOf(scope.section.overallWinner);
      html += `<div class="profile-winner">&#127942; <span style="color: ${RACER_CSS_COLORS[idx % RACER_CSS_COLORS.length]}">${escHtml(scope.section.overallWinner)}</span> wins!</div>`;
    }
    if (scope.collapsed) {
      html += `</details>\n`;
    }
  }

  html += `</div>`;
  return html;
}

function buildFilesHtml(racers, videoFiles, options) {
  const { fullVideoFiles, mergedVideoFile, traceFiles, altFormat, altFiles, placementOrder } = options;
  const links = [];
  const order = placementOrder || racers.map((_, i) => i);

  order.forEach(i => {
    if (videoFiles[i]) links.push(`<a href="${escHtml(videoFiles[i])}">${escHtml(racers[i])} (race)</a>`);
  });
  if (fullVideoFiles) {
    order.forEach(i => {
      if (fullVideoFiles[i]) links.push(`<a href="${escHtml(fullVideoFiles[i])}">${escHtml(racers[i])} (full)</a>`);
    });
  }
  if (mergedVideoFile) {
    links.push(`<a href="${escHtml(mergedVideoFile)}">side-by-side</a>`);
  }
  if (altFormat && altFiles) {
    order.forEach(i => {
      if (altFiles[i]) links.push(`<a href="${escHtml(altFiles[i])}" download>${escHtml(racers[i])} (.${escHtml(altFormat)})</a>`);
    });
  }
  if (traceFiles) {
    order.forEach(i => {
      if (traceFiles[i]) links.push(`<a href="${escHtml(traceFiles[i])}" title="Open in chrome://tracing or ui.perfetto.dev">${escHtml(racers[i])} (profile)</a>`);
    });
  }

  if (links.length === 0) return '';

  return `<div class="section">
  <h2>Files</h2>
  <div class="file-links">
    ${links.join('\n    ')}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Debug Panel Builder — per-racer clip start calibration controls
// ---------------------------------------------------------------------------

function buildDebugPanelHtml(racers, placementOrder, clipTimes) {
  const orderedClipTimes = placementOrder.map(i => clipTimes[i] || null);
  let rows = '';
  placementOrder.forEach((origIdx, displayIdx) => {
    const color = RACER_CSS_COLORS[origIdx % RACER_CSS_COLORS.length];
    const clip = orderedClipTimes[displayIdx];
    const startVal = clip && Number.isFinite(clip.start) ? clip.start.toFixed(3) : '0.000';
    rows += `
    <div class="debug-row" data-debug-idx="${displayIdx}">
      <span class="racer-name" style="color: ${color}">${escHtml(racers[origIdx])}</span>
      <span class="start-info" id="debugStart${displayIdx}">start: ${startVal}s (+0f)</span>
      <button class="debug-frame-btn" data-idx="${displayIdx}" data-delta="-5">-5f</button>
      <button class="debug-frame-btn" data-idx="${displayIdx}" data-delta="-1">-1f</button>
      <button class="debug-frame-btn" data-idx="${displayIdx}" data-delta="1">+1f</button>
      <button class="debug-frame-btn" data-idx="${displayIdx}" data-delta="5">+5f</button>
    </div>`;
  });

  return `<div class="debug-panel" id="debugPanel">
  <h3>DEBUG: Clip Start Calibration</h3>${rows}
  <div class="debug-stats" id="debugStats">
    <div class="debug-stats-header">VIDEO INFO</div>
${placementOrder.map((origIdx, displayIdx) => {
    const color = RACER_CSS_COLORS[origIdx % RACER_CSS_COLORS.length];
    return `    <div class="debug-stats-row" id="debugStatsRow${displayIdx}">
      <span class="racer-name" style="color: ${color}">${escHtml(racers[origIdx])}</span>
      <span>duration: \u2014</span>
      <span>frames: \u2014 dropped: \u2014</span>
      <span>resolution: \u2014</span>
    </div>`;
  }).join('\n')}
  </div>
  <div class="debug-frames" id="debugFrames">
    <div class="debug-stats-header">FRAME POSITIONS</div>
${placementOrder.map((origIdx, displayIdx) => {
    const color = RACER_CSS_COLORS[origIdx % RACER_CSS_COLORS.length];
    return `    <div class="debug-stats-row" id="debugFrameRow${displayIdx}">
      <span class="racer-name" style="color: ${color}">${escHtml(racers[origIdx])}</span>
      <span>\u2014</span>
    </div>`;
  }).join('\n')}
  </div>
  <div class="debug-timing" id="debugTiming">
    <div class="debug-stats-header">TIMING EVENTS</div>
${placementOrder.map((origIdx, displayIdx) => {
    const color = RACER_CSS_COLORS[origIdx % RACER_CSS_COLORS.length];
    return `    <div class="debug-timing-racer" id="debugTimingRacer${displayIdx}">
      <span class="racer-name" style="color: ${color}">${escHtml(racers[origIdx])}</span>
      <div class="debug-timing-events" id="debugTimingEvents${displayIdx}"></div>
    </div>`;
  }).join('\n')}
  </div>
  <div class="debug-footer">
    <span>1 frame &#8776; 0.040s (assuming 25fps recording)</span>
    <button class="debug-action-btn" id="debugCopyJson">Copy JSON</button>
    <button class="debug-action-btn" id="debugResetAll">Reset All</button>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Player Section Builder — returns player container + controls (or '' if no videos)
// ---------------------------------------------------------------------------

function buildPlayerSectionHtml(videoElements, mergedVideoElement, debugPanelHtml) {
  return `<div class="player-container" id="playerContainer">
${videoElements}
</div>
${mergedVideoElement}
${debugPanelHtml || ''}

<div class="controls">
  <div class="controls-row">
    <button class="frame-btn" id="prevFrame" title="-0.1s (\u2190)">\u25C0\u25C0</button>
    <button class="play-btn" id="playBtn">\u25B6</button>
    <button class="frame-btn" id="nextFrame" title="+0.1s (\u2192)">\u25B6\u25B6</button>
    <input type="range" class="scrubber" id="scrubber" min="0" max="1000" value="0">
  </div>
  <span class="time-display" id="timeDisplay">0:00.000 / 0:00.000</span>
  <span class="frame-display" id="frameDisplay">0.0s</span>
  <select class="speed-select" id="speedSelect">
    <option value="0.25">0.25x</option>
    <option value="0.5">0.5x</option>
    <option value="1" selected>1x</option>
    <option value="2">2x</option>
  </select>
  <button class="export-btn" id="exportBtn" title="Export side-by-side video">Export</button>
</div>`;
}

// ---------------------------------------------------------------------------
// Player Script Builder
// ---------------------------------------------------------------------------

function buildPlayerScript(config) {
  const { videoVars, videoArray, raceVideoPaths, fullVideoPaths, clipTimesJson, racerNamesJson, racerColorsJson, raceDate } = config;
  return `<script>
(function() {
  ${videoVars}
  const raceVideos = ${videoArray};
  const raceVideoPaths = ${raceVideoPaths};
  const fullVideoPaths = ${fullVideoPaths};
  const clipTimes = ${clipTimesJson};
  const racerNames = ${racerNamesJson || '[]'};
  const racerColors = ${racerColorsJson || '[]'};
  const mergedVideo = document.getElementById('mergedVideo');
  const playerContainer = document.getElementById('playerContainer');
  const mergedContainer = document.getElementById('mergedContainer');

  let videos = raceVideos;
  let primary = videos[0];
  const playBtn = document.getElementById('playBtn');
  const scrubber = document.getElementById('scrubber');
  const timeDisplay = document.getElementById('timeDisplay');
  const frameDisplay = document.getElementById('frameDisplay');
  const speedSelect = document.getElementById('speedSelect');

  let playing = false;
  let duration = 0;
  let activeClip = null; // { start, end } when clipping is active
  const STEP = 0.1; // 100ms step — reliable even with dropped frames
  var loadedSrcSet = 'race';
  var pendingSeek = null;
  var canvasCalibrationStarted = false;

  // --- Canvas calibration cache (localStorage) ---
  var CALIBRATION_CACHE_KEY = 'raceCalibration:' + ${raceDate} + ':' + raceVideoPaths.join('|');

  function loadCalibrationCache() {
    try {
      var raw = localStorage.getItem(CALIBRATION_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveCalibrationCache() {
    if (!clipTimes) return;
    try {
      var entries = clipTimes.map(function(ct) {
        if (!ct || ct.calibratedStart == null) return null;
        return { calibratedStart: ct.calibratedStart, calibratedEnd: ct.calibratedEnd };
      });
      localStorage.setItem(CALIBRATION_CACHE_KEY, JSON.stringify(entries));
    } catch (e) {}
  }

  // --- Canvas-based PTS calibration ---
  // Detects the green calibration cue (4px square, top-left corner) by sampling
  // a 4×4 region via the Canvas API. Only used as a fallback when build-time
  // CDP calibration is unavailable.
  var CUE_DETECT_SIZE = 4;
  var FRAME_DT = 0.04;       // 25fps PTS interval

  function seekVideoTo(video, time) {
    return new Promise(function(resolve, reject) {
      if (Math.abs(video.currentTime - time) < 0.001) { resolve(); return; }
      var timer = setTimeout(function() {
        video.removeEventListener('seeked', onSeeked);
        reject(new Error('seek timeout'));
      }, 2000);
      function onSeeked() { clearTimeout(timer); resolve(); }
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = time;
    });
  }

  function isGreenCue(data) {
    var greenPx = 0;
    var total = data.length / 4;
    for (var j = 0; j < data.length; j += 4) {
      if (data[j] < 100 && data[j + 1] > 150 && data[j + 2] < 100) greenPx++;
    }
    return greenPx > total * 0.4;
  }

  // Load video as blob URL to avoid file:// canvas tainting restrictions
  function toBlobVideo(src) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', src);
      xhr.responseType = 'blob';
      xhr.onload = function() {
        if (xhr.status === 0 || xhr.status === 200) {
          var blobUrl = URL.createObjectURL(xhr.response);
          var tmp = document.createElement('video');
          tmp.muted = true;
          tmp.preload = 'auto';
          tmp.src = blobUrl;
          tmp._blobUrl = blobUrl;
          function onReady() {
            tmp.removeEventListener('loadedmetadata', onReady);
            resolve(tmp);
          }
          tmp.addEventListener('loadedmetadata', onReady);
          tmp.addEventListener('error', function() { reject(new Error('blob video load failed')); });
          tmp.load();
        } else {
          reject(new Error('xhr status ' + xhr.status));
        }
      };
      xhr.onerror = function() { reject(new Error('xhr error')); };
      xhr.send();
    });
  }

  function detectGreenCuePts(video, scanTo) {
    var canvas = document.createElement('canvas');
    canvas.width = CUE_DETECT_SIZE;
    canvas.height = CUE_DETECT_SIZE;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var endT = Math.min(video.duration || 0, scanTo || video.duration || 0);
    var srcOffset = 0;

    function checkFrame(t) {
      return seekVideoTo(video, t).then(function() {
        ctx.drawImage(video, srcOffset, srcOffset, CUE_DETECT_SIZE, CUE_DETECT_SIZE, 0, 0, CUE_DETECT_SIZE, CUE_DETECT_SIZE);
        return isGreenCue(ctx.getImageData(0, 0, CUE_DETECT_SIZE, CUE_DETECT_SIZE).data);
      });
    }

    // Coarse step = 0.08s (2 frames). With 80ms cue duration (2 frames),
    // 0.08s steps guarantee at least one hit.
    var coarseStep = FRAME_DT * 2;
    var t = 0;
    function coarseScan() {
      if (t > endT) return Promise.resolve(null);
      return checkFrame(t).then(function(found) {
        if (found) return t;
        t += coarseStep;
        return coarseScan();
      });
    }

    function fineScan(hit) {
      if (hit === null) return Promise.resolve(null);
      var fineStart = Math.max(0, hit - coarseStep);
      var firstGreen = hit;
      var ft = fineStart;
      function fineStep() {
        if (ft >= hit) return Promise.resolve(Math.max(0, firstGreen - FRAME_DT));
        return checkFrame(ft).then(function(found) {
          if (found) { firstGreen = ft; return Promise.resolve(Math.max(0, firstGreen - FRAME_DT)); }
          ft += FRAME_DT;
          return fineStep();
        });
      }
      return fineStep();
    }

    return coarseScan().then(fineScan).catch(function(e) {
      if (e.name === 'SecurityError' || (e.message && e.message.indexOf('tainted') !== -1)) throw e;
      console.warn('Canvas cue detection failed:', e.message);
      return null;
    });
  }

  function applyCalibrationToClip(ct, ptsStart, videoDuration) {
    var segDuration = ct._wcEnd - ct._wcStart;
    ct.calibratedStart = ptsStart;
    ct.calibratedEnd = ptsStart + segDuration;
    ct._ptsScale = null;
    ct.start = ptsStart;
    ct.end = Math.min(ptsStart + segDuration, videoDuration);
    ct._converted = true;
  }

  function restoreFromCache() {
    var cached = loadCalibrationCache();
    if (!cached || !clipTimes) return false;
    var applied = false;
    for (var i = 0; i < clipTimes.length; i++) {
      var ct = clipTimes[i];
      var entry = cached[i];
      var v = raceVideos[i];
      if (!ct || !entry || !v || !v.duration || ct._wcStart == null || ct.calibratedStart != null) continue;
      if (entry.calibratedStart != null) {
        applyCalibrationToClip(ct, entry.calibratedStart, v.duration);
        applied = true;
      }
    }
    return applied;
  }

  function calibrateFromCanvas() {
    if (!clipTimes) return Promise.resolve(false);
    var idx = 0;
    var anyCalibrated = false;

    function next() {
      if (idx >= raceVideos.length) return Promise.resolve(anyCalibrated);
      var currentIdx = idx;
      var v = raceVideos[currentIdx];
      var ct = clipTimes[currentIdx];
      idx++;
      if (!v || !ct || ct._wcStart == null || ct.calibratedStart != null) return next();

      var scanTo = v.duration * 0.6;

      // Use blob URL video for scanning to avoid file:// canvas tainting
      function scanWithBlob() {
        return toBlobVideo(v.src).then(function(blobVid) {
          return detectGreenCuePts(blobVid, scanTo).then(function(ptsStart) {
            URL.revokeObjectURL(blobVid._blobUrl);
            return ptsStart;
          });
        });
      }

      // Try direct canvas first (works over http), fall back to blob (needed for file://)
      return detectGreenCuePts(v, scanTo).then(function(ptsStart) {
        if (ptsStart !== null) {
          applyCalibrationToClip(ct, ptsStart, v.duration);
          anyCalibrated = true;
        }
        return next();
      }).catch(function() {
        return scanWithBlob().then(function(ptsStart) {
          if (ptsStart !== null) {
            applyCalibrationToClip(ct, ptsStart, v.duration);
            anyCalibrated = true;
          }
          return next();
        }).catch(function(e) {
          console.warn('Canvas calibration failed for video ' + currentIdx + ':', e.message);
          return next();
        });
      });
    }

    return next().then(function(any) {
      if (any) saveCalibrationCache();
      return any;
    });
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return m + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
  }

  function getTime(t) {
    return t.toFixed(1) + 's';
  }

  function clipOffset() {
    return activeClip ? activeClip.start : 0;
  }

  function clipDuration() {
    return activeClip ? (activeClip.end - activeClip.start) : duration;
  }

  function updateTimeDisplay() {
    const d = clipDuration();
    // Derive elapsed time from scrubber position — this stays correct whether
    // the update comes from playback (scrubber set by timeupdate) or from
    // seeking (scrubber set directly), even when the primary video is clamped
    // at its own clip end.
    const t = d > 0 ? (scrubber.value / 1000) * d : 0;
    timeDisplay.textContent = fmt(Math.max(0, t)) + ' / ' + fmt(d);
    frameDisplay.textContent = getTime(Math.max(0, t));
  }

  function seekAll(t) {
    var adj = getAdjustedClipTimes();
    var ct = adj || clipTimes;
    videos.forEach((v, i) => {
      if (!v) return;
      let target = t;
      // In clip mode, map elapsed time to each video's own clip range so all
      // racers stay aligned (same elapsed time from their individual race start).
      if (activeClip && ct && isValidClipEntry(ct[i])) {
        var elapsed = t - activeClip.start;
        target = ct[i].start + elapsed;
        target = Math.max(ct[i].start, Math.min(ct[i].end, target));
      }
      v.currentTime = Math.min(target, v.duration || target);
    });
    updateFramePositions();
  }

  function onMeta() {
    duration = Math.max(...videos.filter(v => v).map(v => v.duration || 0));
    // Convert wall-clock clipTimes to PTS space using a linear scale as an
    // immediate approximation.  Canvas-based calibration (or its localStorage
    // cache) will override these values once all metadata has loaded.
    if (clipTimes) {
      for (var i = 0; i < clipTimes.length; i++) {
        if (!isValidClipEntry(clipTimes[i]) || !videos[i] || !videos[i].duration) continue;
        var ct = clipTimes[i];
        if (ct._converted) continue;
        if (ct._wcStart == null) { ct._wcStart = ct.start; ct._wcEnd = ct.end; }
        // Build-time calibration: ffprobe detected the exact cue PTS
        if (ct.calibratedStart != null) {
          applyCalibrationToClip(ct, ct.calibratedStart, videos[i].duration);
          continue;
        }
        var wcd = ct.wallClockDuration;
        var offset = ct.recordingOffset || 0;
        if (wcd > 0) {
          var scale = videos[i].duration / wcd;
          ct._ptsScale = scale;
          ct.start = (ct.start + offset) * scale;
          ct.end = (ct.end + offset) * scale;
          ct._converted = true;
        }
      }
    }
    activeClip = resolveClip();
    updateTimeDisplay();
    updateDebugStats();

    if (pendingSeek && videos.every(function(v) { return !v || v.readyState >= 1; })) {
      var fn = pendingSeek;
      pendingSeek = null;
      fn();
    }

    // Once all videos have metadata, apply cached or canvas-based calibration
    // to get frame-accurate clip positions without ffprobe.
    if (!canvasCalibrationStarted && clipTimes &&
        raceVideos.every(function(v) { return !v || v.readyState >= 1; })) {
      var needsCalibration = clipTimes.some(function(ct) { return ct && ct.calibratedStart == null; });
      if (needsCalibration) {
        canvasCalibrationStarted = true;
        function applyCalibrationResult() {
          activeClip = resolveAdjustedClip();
          updateTimeDisplay();
          updateDebugStats();
          if (activeClip) { seekAll(activeClip.start); scrubber.value = 0; }
        }
        if (restoreFromCache()) {
          applyCalibrationResult();
        } else {
          calibrateFromCanvas().then(function(any) { if (any) applyCalibrationResult(); });
        }
      }
    }
  }

  function onTimeUpdate() {
    var adj = getAdjustedClipTimes();
    var ct = adj || clipTimes;
    // Compute elapsed as the max across all playing videos so the scrubber
    // keeps moving even when the primary (often the winner) finishes first.
    var elapsed = 0;
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      if (!v) continue;
      var vidClip = activeClip && ct && isValidClipEntry(ct[i]) ? ct[i] : null;
      var e = vidClip ? (v.currentTime - vidClip.start) : (v.currentTime - clipOffset());
      if (e > elapsed) elapsed = e;
    }
    // Enforce clip end boundary
    if (activeClip && elapsed >= clipDuration()) {
      videos.forEach(function(v) { v && v.pause(); });
      seekAll(activeClip.end);
      playing = false;
      playBtn.textContent = '\\u25B6';
      scrubber.value = 1000;
      updateTimeDisplay();
      return;
    }
    if (duration > 0) {
      var d = clipDuration();
      scrubber.value = d > 0 ? (Math.max(0, elapsed) / d) * 1000 : 0;
      updateTimeDisplay();
      updateFramePositions();
    }
  }

  function onEnded() {
    if (videos.every(function(vi) { return !vi || vi.paused || vi.ended; })) {
      playing = false;
      playBtn.textContent = '\\u25B6';
    }
  }

  function detachVideoListeners() {
    raceVideos.forEach(function(v) {
      if (v) {
        v.removeEventListener('timeupdate', onTimeUpdate);
        v.removeEventListener('ended', onEnded);
      }
    });
    if (mergedVideo) {
      mergedVideo.removeEventListener('timeupdate', onTimeUpdate);
      mergedVideo.removeEventListener('ended', onEnded);
    }
  }

  function attachVideoListeners() {
    videos.forEach(function(v) {
      if (v) {
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('timeupdate', onTimeUpdate);
        v.addEventListener('ended', onEnded);
      }
    });
  }

  attachVideoListeners();

  const modeRace = document.getElementById('modeRace');
  const modeFull = document.getElementById('modeFull');
  const modeMerged = document.getElementById('modeMerged');
  const modeDebug = document.getElementById('modeDebug');
  const debugPanel = document.getElementById('debugPanel');

  function setActiveMode(btn) {
    [modeRace, modeFull, modeMerged, modeDebug].forEach(b => b && b.classList.remove('active'));
    btn && btn.classList.add('active');
  }

  function isValidClipEntry(c) {
    return c != null && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start <= c.end;
  }

  function resolveClip() {
    // Compute elapsed-time range: start = earliest clip start, duration = longest race segment.
    // This ensures the scrubber represents elapsed race time (0 → maxDuration) and all
    // racers stay aligned when seeking — each video is offset from its own clip start.
    if (!clipTimes) return null;
    let minStart = Infinity, maxDuration = 0, found = false;
    for (let i = 0; i < clipTimes.length; i++) {
      if (isValidClipEntry(clipTimes[i])) {
        minStart = Math.min(minStart, clipTimes[i].start);
        maxDuration = Math.max(maxDuration, clipTimes[i].end - clipTimes[i].start);
        found = true;
      }
    }
    return found ? { start: minStart, end: minStart + maxDuration } : null;
  }

  function switchToRace() {
    pendingSeek = null;
    if (playing) { videos.forEach(v => v && v.pause()); playing = false; playBtn.textContent = '\\u25B6'; }
    detachVideoListeners();
    var srcChanged = loadedSrcSet !== 'race';
    if (srcChanged) {
      raceVideos.forEach((v, i) => v.src = raceVideoPaths[i]);
      loadedSrcSet = 'race';
    }
    videos = raceVideos;
    primary = videos[0];
    attachVideoListeners();
    playerContainer.style.display = 'flex';
    if (mergedContainer) mergedContainer.style.display = 'none';
    if (debugPanel) debugPanel.style.display = 'none';
    setActiveMode(modeRace);

    var doSeek = function() {
      activeClip = resolveAdjustedClip();
      seekAll(activeClip ? activeClip.start : 0);
      scrubber.value = 0;
      updateTimeDisplay();
    };
    if (srcChanged) {
      duration = 0;
      pendingSeek = doSeek;
    } else {
      onMeta();
      doSeek();
    }
  }

  function switchToFull() {
    if (!fullVideoPaths && !clipTimes) return;
    pendingSeek = null;
    if (playing) { videos.forEach(v => v && v.pause()); playing = false; playBtn.textContent = '\\u25B6'; }
    detachVideoListeners();
    var srcChanged = false;
    if (fullVideoPaths && loadedSrcSet !== 'full') {
      raceVideos.forEach((v, i) => v.src = fullVideoPaths[i]);
      loadedSrcSet = 'full';
      srcChanged = true;
    }
    videos = raceVideos;
    primary = videos[0];
    attachVideoListeners();
    playerContainer.style.display = 'flex';
    if (mergedContainer) mergedContainer.style.display = 'none';
    if (debugPanel) debugPanel.style.display = 'none';
    setActiveMode(modeFull);

    var doSeek = function() {
      activeClip = null;
      seekAll(0);
      scrubber.value = 0;
      updateTimeDisplay();
    };
    if (srcChanged) {
      duration = 0;
      pendingSeek = doSeek;
    } else {
      onMeta();
      doSeek();
    }
  }

  function switchToMerged() {
    if (!mergedVideo) return;
    pendingSeek = null;
    if (playing) { videos.forEach(v => v && v.pause()); playing = false; playBtn.textContent = '\\u25B6'; }
    detachVideoListeners();
    videos = [mergedVideo];
    primary = mergedVideo;
    attachVideoListeners();
    playerContainer.style.display = 'none';
    mergedContainer.style.display = 'block';
    if (debugPanel) debugPanel.style.display = 'none';
    setActiveMode(modeMerged);

    activeClip = null;
    duration = mergedVideo.duration || 0;
    onMeta();
    seekAll(0);
    scrubber.value = 0;
    updateTimeDisplay();
  }

  // --- Debug: video stats ---
  function updateDebugStats() {
    var statsEl = document.getElementById('debugStats');
    if (!statsEl || statsEl.offsetParent === null) return;
    var adjusted = getAdjustedClipTimes();
    for (var i = 0; i < raceVideos.length; i++) {
      var row = document.getElementById('debugStatsRow' + i);
      if (!row) continue;
      var v = raceVideos[i];
      if (!v || !v.duration) continue;
      var dur = v.duration.toFixed(2) + 's';
      var res = v.videoWidth + 'x' + v.videoHeight;
      var framesText = '\\u2014';
      var droppedText = '\\u2014';
      if (typeof v.getVideoPlaybackQuality === 'function') {
        var q = v.getVideoPlaybackQuality();
        framesText = String(q.totalVideoFrames);
        droppedText = String(q.droppedVideoFrames);
      }
      var clipDur = '';
      var activeCt = adjusted ? adjusted[i] : (clipTimes ? clipTimes[i] : null);
      if (activeCt) {
        clipDur = ' (clip: ' + (activeCt.end - activeCt.start).toFixed(2) + 's)';
      }
      var nameSpan = row.querySelector('.racer-name');
      var nameHtml = nameSpan ? nameSpan.outerHTML : '';
      row.innerHTML = nameHtml +
        '<span>duration: ' + dur + clipDur + '</span>' +
        '<span>frames: ' + framesText + ' dropped: ' + droppedText + '</span>' +
        '<span>resolution: ' + res + '</span>';
    }
    // TIMING EVENTS
    for (var i = 0; i < raceVideos.length; i++) {
      var eventsEl = document.getElementById('debugTimingEvents' + i);
      if (!eventsEl) continue;
      var v = raceVideos[i];
      var ct = clipTimes ? clipTimes[i] : null;
      if (!ct || !v || !v.duration) { eventsEl.innerHTML = '<span style="color:#777">No timing data</span>'; continue; }
      var offset = ct.recordingOffset || 0;
      var wcd = ct.wallClockDuration || 0;
      var scale = ct._ptsScale || (wcd > 0 ? v.duration / wcd : 0);
      var wcStart = ct._wcStart != null ? ct._wcStart : ct.start;
      var wcEnd = ct._wcEnd != null ? ct._wcEnd : ct.end;
      var toPts;
      if (ct.calibratedStart != null) {
        var wcDur = wcEnd - wcStart;
        var ptsDur = ct.end - ct.start;
        toPts = function(wc) {
          if (wcDur <= 0) return wc;
          return ct.start + (wc - wcStart) / wcDur * ptsDur;
        };
      } else {
        toPts = function(wc) { return scale > 0 ? (wc + offset) * scale : wc; };
      }
      var fmtS = function(val) { return val != null && isFinite(val) ? val.toFixed(3) + 's' : '\\u2014'; };
      var toFrame = function(pts) { return pts != null && isFinite(pts) ? Math.round(pts / 0.04) : null; };
      var fmtF = function(pts) { var f = toFrame(pts); return f != null ? '#' + f : '\\u2014'; };
      var events = [];
      events.push({ label: 'Context created', wc: -offset, ptsVal: 0 });
      events.push({ label: 'recordingStartTime (t=0)', wc: 0, ptsVal: toPts(0) });
      events.push({ label: 'raceRecordingStart()', wc: wcStart, ptsVal: ct.start });
      var measurements = ct.measurements || [];
      for (var m = 0; m < measurements.length; m++) {
        var meas = measurements[m];
        if (meas.startTime != null) events.push({ label: 'raceStart(\"' + (meas.name || '') + '\")', wc: meas.startTime, ptsVal: toPts(meas.startTime) });
        if (meas.endTime != null) events.push({ label: 'raceEnd(\"' + (meas.name || '') + '\")', wc: meas.endTime, ptsVal: toPts(meas.endTime) });
      }
      events.push({ label: 'raceRecordingEnd()', wc: wcEnd, ptsVal: ct.end });
      events.push({ label: 'Pre-close', wc: wcd > 0 ? wcd - offset : null, ptsVal: v.duration });
      var html = '';
      for (var e = 0; e < events.length; e++) {
        var ev = events[e];
        html += '<div class="debug-timing-event"><span class="debug-timing-label">' + ev.label + '</span><span class="debug-timing-val">' + fmtS(ev.wc) + '</span><span class="debug-timing-val">' + fmtS(ev.ptsVal) + '</span><span class="debug-timing-val">' + fmtF(ev.ptsVal) + '</span></div>';
      }
      var scaleInfo = ct.calibratedStart != null
        ? 'calibrated'
        : (scale > 0 ? scale.toFixed(4) : '\\u2014');
      html += '<div class="debug-timing-event"><span class="debug-timing-label"><b>Video time scale</b></span><span class="debug-timing-val">' + scaleInfo + '</span><span class="debug-timing-val">vid/wc</span><span class="debug-timing-val">\\u2014</span></div>';
      eventsEl.innerHTML = '<div class="debug-timing-event"><span class="debug-timing-label"><b>Event</b></span><span class="debug-timing-val"><b>Wall-clock</b></span><span class="debug-timing-val"><b>Video time</b></span><span class="debug-timing-val"><b>Frame</b></span></div>' + html;
    }
  }

  // --- Frame position display in debug panel ---
  function updateFramePositions() {
    var adj = getAdjustedClipTimes();
    var ct = adj || clipTimes;
    for (var i = 0; i < raceVideos.length; i++) {
      var row = document.getElementById('debugFrameRow' + i);
      if (!row) continue;
      var v = raceVideos[i];
      if (!v || !v.duration) continue;
      var totalFrames = 0;
      if (typeof v.getVideoPlaybackQuality === 'function') {
        totalFrames = v.getVideoPlaybackQuality().totalVideoFrames;
      }
      var nameSpan = row.querySelector('.racer-name');
      var nameHtml = nameSpan ? nameSpan.outerHTML : '';
      if (totalFrames <= 0) { row.innerHTML = nameHtml + '<span>\\u2014</span>'; continue; }
      var fullFrame = Math.round(v.currentTime / v.duration * totalFrames);
      var clip = ct ? ct[i] : null;
      if (clip && isValidClipEntry(clip)) {
        var clipStartFrame = Math.round(clip.start / v.duration * totalFrames);
        var clipEndFrame = Math.round(clip.end / v.duration * totalFrames);
        var clipFrame = fullFrame - clipStartFrame;
        var clipTotal = clipEndFrame - clipStartFrame;
        row.innerHTML = nameHtml +
          '<span>clip: ' + clipFrame + ' / ' + clipTotal + '</span>' +
          '<span>full: ' + fullFrame + ' / ' + totalFrames + '</span>' +
          '<span>range: ' + clipStartFrame + '\\u2013' + clipEndFrame + '</span>';
      } else {
        row.innerHTML = nameHtml +
          '<span>full: ' + fullFrame + ' / ' + totalFrames + '</span>';
      }
    }
  }

  // --- Debug mode: per-racer clip start calibration ---
  const FRAME_STEP = 0.04;
  const debugOffsets = raceVideos.map(function() { return 0; });

  function getAdjustedClipTimes() {
    if (!clipTimes) return null;
    return clipTimes.map(function(ct, i) {
      if (!ct) return null;
      return { start: ct.start + debugOffsets[i], end: ct.end };
    });
  }

  function resolveAdjustedClip() {
    var adj = getAdjustedClipTimes();
    if (!adj) return resolveClip();
    var minStart = Infinity, maxDuration = 0, found = false;
    for (var i = 0; i < adj.length; i++) {
      if (isValidClipEntry(adj[i])) {
        minStart = Math.min(minStart, adj[i].start);
        maxDuration = Math.max(maxDuration, adj[i].end - adj[i].start);
        found = true;
      }
    }
    return found ? { start: minStart, end: minStart + maxDuration } : null;
  }

  function updateDebugDisplay() {
    var adj = getAdjustedClipTimes();
    for (var i = 0; i < raceVideos.length; i++) {
      var el = document.getElementById('debugStart' + i);
      if (!el) continue;
      var frames = Math.round(debugOffsets[i] / FRAME_STEP);
      var sign = frames >= 0 ? '+' : '';
      var startVal = adj && adj[i] ? adj[i].start.toFixed(3) : '0.000';
      el.textContent = 'start: ' + startVal + 's (' + sign + frames + 'f)';
    }
  }

  function adjustDebugOffset(idx, frameDelta) {
    if (!clipTimes || !clipTimes[idx]) return;
    var newOffset = debugOffsets[idx] + frameDelta * FRAME_STEP;
    // Guard: don't let adjusted start go below 0 or past clip end
    var newStart = clipTimes[idx].start + newOffset;
    if (newStart < 0) newOffset = -clipTimes[idx].start;
    if (newStart >= clipTimes[idx].end) return;
    debugOffsets[idx] = newOffset;
    updateDebugDisplay();
    updateDebugStats();
    activeClip = resolveAdjustedClip();
    seekAll(activeClip ? activeClip.start : 0);
    scrubber.value = 0;
    updateTimeDisplay();
  }

  function switchToDebug() {
    pendingSeek = null;
    if (playing) { videos.forEach(function(v) { v && v.pause(); }); playing = false; playBtn.textContent = '\\u25B6'; }
    detachVideoListeners();
    var srcChanged = loadedSrcSet !== 'race';
    if (srcChanged) {
      raceVideos.forEach(function(v, i) { v.src = raceVideoPaths[i]; });
      loadedSrcSet = 'race';
    }
    videos = raceVideos;
    primary = videos[0];
    attachVideoListeners();
    playerContainer.style.display = 'flex';
    if (mergedContainer) mergedContainer.style.display = 'none';
    if (debugPanel) debugPanel.style.display = 'block';
    setActiveMode(modeDebug);

    var doSeek = function() {
      activeClip = resolveAdjustedClip();
      updateDebugDisplay();
      updateDebugStats();
      updateFramePositions();
      seekAll(activeClip ? activeClip.start : 0);
      scrubber.value = 0;
      updateTimeDisplay();
    };
    if (srcChanged) {
      duration = 0;
      pendingSeek = doSeek;
    } else {
      onMeta();
      doSeek();
    }
  }

  if (debugPanel) {
    debugPanel.addEventListener('click', function(e) {
      var btn = e.target.closest('.debug-frame-btn');
      if (btn) {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var delta = parseInt(btn.getAttribute('data-delta'), 10);
        adjustDebugOffset(idx, delta);
        return;
      }
      if (e.target.id === 'debugCopyJson') {
        var adj = getAdjustedClipTimes();
        var timingData = raceVideos.map(function(v, i) {
          var ct = clipTimes ? clipTimes[i] : null;
          if (!ct) return null;
          return {
            _wcStart: ct._wcStart != null ? ct._wcStart : null,
            _wcEnd: ct._wcEnd != null ? ct._wcEnd : null,
            _ptsScale: ct._ptsScale || null,
            calibratedStart: ct.calibratedStart != null ? ct.calibratedStart : null,
            calibratedEnd: ct.calibratedEnd != null ? ct.calibratedEnd : null,
            recordingOffset: ct.recordingOffset || 0,
            wallClockDuration: ct.wallClockDuration || 0,
            measurements: ct.measurements || [],
            videoDuration: v ? v.duration : null
          };
        });
        var out = { clipTimes: adj, offsets: debugOffsets.slice(), timingData: timingData };
        navigator.clipboard.writeText(JSON.stringify(out, null, 2));
        return;
      }
      if (e.target.id === 'debugResetAll') {
        for (var i = 0; i < debugOffsets.length; i++) debugOffsets[i] = 0;
        updateDebugDisplay();
        updateDebugStats();
        activeClip = resolveAdjustedClip();
        seekAll(activeClip ? activeClip.start : 0);
        scrubber.value = 0;
        updateTimeDisplay();
      }
    });
  }

  if (modeRace) modeRace.addEventListener('click', switchToRace);
  if (modeFull) modeFull.addEventListener('click', switchToFull);
  if (modeMerged) modeMerged.addEventListener('click', switchToMerged);
  if (modeDebug) modeDebug.addEventListener('click', switchToDebug);
  if (mergedVideo) mergedVideo.addEventListener('loadedmetadata', function() {
    if (videos.includes(mergedVideo)) {
      duration = mergedVideo.duration;
      updateTimeDisplay();
    }
  });

  playBtn.addEventListener('click', function() {
    if (playing) {
      videos.forEach(v => v && v.pause());
      playBtn.textContent = '\\u25B6';
    } else {
      // If at clip end, restart from clip start
      if (activeClip && primary.currentTime >= activeClip.end - STEP) {
        seekAll(activeClip.start);
      }
      videos.forEach(v => v && v.play());
      playBtn.textContent = '\\u23F8';
    }
    playing = !playing;
  });

  scrubber.addEventListener('input', function() {
    const d = clipDuration();
    const t = (scrubber.value / 1000) * d + clipOffset();
    seekAll(t);
    updateTimeDisplay();
  });

  speedSelect.addEventListener('change', function() {
    const rate = parseFloat(speedSelect.value);
    videos.forEach(v => v && (v.playbackRate = rate));
  });

  function stepFrame(delta) {
    if (playing) { videos.forEach(v => v && v.pause()); playing = false; playBtn.textContent = '\\u25B6'; }
    const minT = clipOffset();
    const maxT = activeClip ? activeClip.end : duration;
    // Derive current position from scrubber to maintain elapsed-time alignment
    var d = clipDuration();
    var cur = d > 0 ? minT + (scrubber.value / 1000) * d : (primary.currentTime || 0);
    const t = Math.max(minT, Math.min(maxT, cur + delta));
    seekAll(t);
    var newElapsed = t - minT;
    scrubber.value = d > 0 ? (newElapsed / d) * 1000 : 0;
    updateTimeDisplay();
  }

  document.getElementById('prevFrame').addEventListener('click', function() { stepFrame(-STEP); });
  document.getElementById('nextFrame').addEventListener('click', function() { stepFrame(STEP); });

  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-STEP); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(STEP); }
    else if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  });

  // If clip times are active on initial load, seek to clip start
  if (clipTimes) {
    activeClip = resolveAdjustedClip();
    if (activeClip) {
      var initSeek = function() {
        seekAll(activeClip.start);
        updateTimeDisplay();
      };
      if (primary.readyState >= 1) initSeek();
      else primary.addEventListener('loadedmetadata', initSeek);
    }
  }

  // --- Export: client-side side-by-side video stitching ---
  var exportBtn = document.getElementById('exportBtn');

  // Layout for export canvas. Supports 1–5 racers (max enforced by racer discovery).
  function getExportLayout(count) {
    var LABEL_H = 30;
    var targetW = count <= 3 ? 640 : 480;
    // Use first video's aspect ratio, fallback to 16:9
    var sample = raceVideos.find(function(v) { return v && v.videoWidth; });
    var aspect = sample ? sample.videoHeight / sample.videoWidth : 9/16;
    var cellH = Math.round(targetW * aspect);
    var slotH = cellH + LABEL_H;
    var cols, rows, positions = [];
    if (count <= 3) {
      cols = count; rows = 1;
      for (var i = 0; i < count; i++) positions.push({ x: i * targetW, y: 0 });
    } else if (count === 4) {
      cols = 2; rows = 2;
      for (var i = 0; i < 4; i++) positions.push({ x: (i % 2) * targetW, y: Math.floor(i / 2) * slotH });
    } else {
      // 5 racers: 3 on top, 2 centered on bottom
      cols = 3; rows = 2;
      for (var i = 0; i < 3; i++) positions.push({ x: i * targetW, y: 0 });
      var bottomOffset = Math.floor(targetW / 2);
      for (var i = 0; i < count - 3; i++) positions.push({ x: bottomOffset + i * targetW, y: slotH });
    }
    var canvasW = (count >= 5 ? 3 : cols) * targetW;
    var canvasH = rows * slotH;
    return { canvasW: canvasW, canvasH: canvasH, targetW: targetW, cellH: cellH, labelH: LABEL_H, positions: positions };
  }

  function drawExportFrame(ctx, layout) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
    for (var i = 0; i < raceVideos.length; i++) {
      var v = raceVideos[i];
      if (!v) continue;
      var pos = layout.positions[i];
      // Draw label
      ctx.fillStyle = racerColors[i] || '#e8e0d0';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(racerNames[i] || '', pos.x + layout.targetW / 2, pos.y + layout.labelH - 8);
      // Draw video frame
      try { ctx.drawImage(v, pos.x, pos.y + layout.labelH, layout.targetW, layout.cellH); } catch(e) {}
    }
  }

  function startExport() {
    if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
      alert('Export requires a browser that supports Canvas.captureStream and MediaRecorder (Chrome, Firefox, or Edge).');
      return;
    }
    // Pause current playback
    if (playing) { videos.forEach(function(v) { v && v.pause(); }); playing = false; playBtn.textContent = '\\u25B6'; }

    var layout = getExportLayout(raceVideos.length);

    // Create overlay
    var overlay = document.createElement('div');
    overlay.className = 'export-overlay';
    overlay.innerHTML = '<div class="export-modal">' +
      '<h3>Exporting Side-by-Side</h3>' +
      '<canvas id="exportCanvas" width="' + layout.canvasW + '" height="' + layout.canvasH + '"></canvas>' +
      '<div class="export-progress-bar"><div class="export-progress-fill" id="exportProgressFill"></div></div>' +
      '<div class="export-status" id="exportStatus">Preparing...</div>' +
      '<div class="export-actions"><button id="exportCancel">Cancel</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var canvas = document.getElementById('exportCanvas');
    var ctx = canvas.getContext('2d');
    var progressFill = document.getElementById('exportProgressFill');
    var statusEl = document.getElementById('exportStatus');
    var actionsEl = overlay.querySelector('.export-actions');

    // Determine time range
    var startTime = activeClip ? activeClip.start : 0;
    var endTime = activeClip ? activeClip.end : duration;
    var totalDur = endTime - startTime;

    // Per-video clip end times for accurate completion detection
    var adj = getAdjustedClipTimes();
    var ct = adj || clipTimes;
    var perVideoEnd = raceVideos.map(function(v, i) {
      if (!v) return endTime;
      return (activeClip && ct && ct[i]) ? ct[i].end : endTime;
    });

    // Seek all to start and wait for seeked events
    var seekPromises = raceVideos.map(function(v, i) {
      if (!v) return Promise.resolve();
      return new Promise(function(resolve) {
        var target = startTime;
        if (activeClip && ct && ct[i]) {
          var elapsed = startTime - activeClip.start;
          target = ct[i].start + elapsed;
          target = Math.max(ct[i].start, Math.min(ct[i].end, target));
        }
        v.currentTime = Math.min(target, v.duration || target);
        v.onseeked = function() { v.onseeked = null; resolve(); };
      });
    });

    var cancelled = false;
    var recorder = null;
    var rafId = null;

    document.getElementById('exportCancel').addEventListener('click', function() {
      cancelled = true;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      if (rafId) cancelAnimationFrame(rafId);
      raceVideos.forEach(function(v) { v && v.pause(); });
      overlay.remove();
    });

    Promise.all(seekPromises).then(function() {
      if (cancelled) return;
      statusEl.textContent = 'Recording...';

      var stream = canvas.captureStream(30);
      var mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      recorder = new MediaRecorder(stream, { mimeType: mimeType });
      var chunks = [];
      recorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = function() {
        if (cancelled) return;
        var blob = new Blob(chunks, { type: mimeType });
        var url = URL.createObjectURL(blob);
        statusEl.textContent = 'Export complete!';
        progressFill.style.width = '100%';
        var downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'race-side-by-side.webm';
        downloadLink.textContent = 'Download';
        downloadLink.className = '';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', function() { URL.revokeObjectURL(url); overlay.remove(); });
        actionsEl.innerHTML = '';
        actionsEl.appendChild(downloadLink);
        actionsEl.appendChild(closeBtn);
      };

      recorder.start();
      // Play all videos at user-selected speed
      var exportRate = parseFloat(speedSelect.value) || 1;
      raceVideos.forEach(function(v) { if (v) { v.playbackRate = exportRate; v.play(); } });
      var speedLabel = exportRate !== 1 ? ' (' + exportRate + 'x)' : '';

      function tick() {
        if (cancelled) return;
        drawExportFrame(ctx, layout);
        // Use max currentTime across all videos for progress (not just primary)
        var cur = Math.max.apply(null, raceVideos.map(function(v) { return (v && v.currentTime) || 0; }));
        var progress = totalDur > 0 ? Math.min(1, (cur - startTime) / totalDur) : 0;
        progressFill.style.width = (progress * 100).toFixed(1) + '%';
        statusEl.textContent = 'Recording' + speedLabel + '... ' + Math.round(progress * 100) + '%';
        var allDone = raceVideos.every(function(v, i) { return !v || v.currentTime >= perVideoEnd[i] || v.ended; });
        if (allDone) {
          raceVideos.forEach(function(v) { v && v.pause(); });
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    });
  }

  if (exportBtn) {
    // Hide export button for single video or merged-only mode
    if (raceVideos.length < 2) exportBtn.style.display = 'none';
    exportBtn.addEventListener('click', startExport);
  }
})();
</script>`;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function buildPlayerHtml(summary, videoFiles, altFormat, altFiles, options = {}) {
  const { fullVideoFiles, mergedVideoFile, traceFiles, runNavigation, medianRunLabel, clipTimes } = options;
  const racers = summary.racers;
  const count = racers.length;

  // Layout dimensions
  const maxWidth = count <= 2 ? 680 : count === 3 ? 450 : 340;
  const containerMaxWidth = count <= 2 ? 1400 : count === 3 ? 1400 : 1440;

  // Title
  const title = count === 2
    ? `Race: ${escHtml(racers[0])} vs ${escHtml(racers[1])}`
    : `Race: ${racers.map(escHtml).join(' vs ')}`;

  // Winner banner
  const winnerBanner = summary.overallWinner === 'tie'
    ? `<span class="trophy">&#129309;</span> It's a Tie!`
    : summary.overallWinner
      ? `<span class="trophy">&#127942;</span> ${escHtml(summary.overallWinner.toUpperCase())} wins!`
      : '';

  // Video elements — ordered by placement (winner first)
  const hasVideos = videoFiles && videoFiles.length > 0;
  const placementOrder = getPlacementOrder(summary);

  const hasFullVideos = fullVideoFiles?.length > 0;
  const isValidClip = (c) => c != null && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start <= c.end;
  const hasClipTimes = clipTimes && clipTimes.some(isValidClip);
  const hasMergedVideo = !!mergedVideoFile;

  let playerSection = '';
  let scriptTag = '';

  if (hasVideos) {
    const videoElements = placementOrder.map((origIdx, displayIdx) => {
      const color = RACER_CSS_COLORS[origIdx % RACER_CSS_COLORS.length];
      const racer = racers[origIdx];
      return `  <div class="racer">
    <div class="racer-label" style="color: ${color}">${escHtml(racer)}</div>
    <video id="v${displayIdx}" src="${escHtml(videoFiles[origIdx])}" preload="auto" muted></video>
  </div>`;
    }).join('\n');

    const mergedVideoElement = mergedVideoFile ? `
<div class="merged-container" id="mergedContainer" style="display: none;">
  <video id="mergedVideo" src="${escHtml(mergedVideoFile)}" preload="auto" muted></video>
</div>` : '';

    const debugPanelHtml = hasClipTimes ? buildDebugPanelHtml(racers, placementOrder, clipTimes) : '';
    playerSection = buildPlayerSectionHtml(videoElements, mergedVideoElement, debugPanelHtml);

    // Player script config — use JSON.stringify for safe path embedding
    const videoIds = placementOrder.map((_, i) => `v${i}`);
    const orderedVideoFiles = placementOrder.map(i => videoFiles[i]);
    const orderedFullVideoFiles = fullVideoFiles ? placementOrder.map(i => fullVideoFiles[i]) : null;

    // Order clip times to match placement order
    const orderedClipTimes = clipTimes ? placementOrder.map(i => clipTimes[i] || null) : null;

    // Racer names/colors in placement order for export labels
    const orderedRacerNames = placementOrder.map(i => racers[i]);
    const orderedRacerColors = placementOrder.map(i => RACER_CSS_COLORS[i % RACER_CSS_COLORS.length]);

    scriptTag = buildPlayerScript({
      videoVars: videoIds.map(id => `const ${id} = document.getElementById('${id}');`).join('\n  '),
      videoArray: `[${videoIds.join(', ')}]`,
      raceVideoPaths: JSON.stringify(orderedVideoFiles),
      fullVideoPaths: orderedFullVideoFiles
        ? JSON.stringify(orderedFullVideoFiles)
        : 'null',
      clipTimesJson: orderedClipTimes
        ? JSON.stringify(orderedClipTimes)
        : 'null',
      racerNamesJson: JSON.stringify(orderedRacerNames),
      racerColorsJson: JSON.stringify(orderedRacerColors),
      raceDate: JSON.stringify(summary.timestamp ? new Date(summary.timestamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    });
  }

  // Mode toggle — show Full button when separate full videos exist OR when clip times
  // provide virtual trimming (default mode without --ffmpeg, same file but different playback range)
  const hasToggle = hasFullVideos || hasClipTimes || hasMergedVideo;
  const fullBtn = (hasFullVideos || hasClipTimes) ? '<button class="mode-btn" id="modeFull" title="Full recordings">Full</button>' : '';
  const mergedBtn = hasMergedVideo ? '<button class="mode-btn" id="modeMerged" title="Side-by-side merged video">Merged</button>' : '';
  const debugBtn = hasClipTimes ? '<button class="mode-btn" id="modeDebug" title="Debug clip start calibration">Debug</button>' : '';
  const modeToggle = hasToggle ? `
  <div class="mode-toggle">
    <button class="mode-btn active" id="modeRace" title="Race segments only">Race</button>
    ${fullBtn}
    ${mergedBtn}
    ${debugBtn}
  </div>` : '';

  // Render template with all sections
  return render(TEMPLATE, {
    title,
    layoutCss: `.player-container { max-width: ${containerMaxWidth}px; }\n  .racer { max-width: ${maxWidth}px; }`,
    runNav: buildRunNavHtml(runNavigation),
    winnerBanner,
    videoSourceNote: medianRunLabel ? `<div class="video-source-note">Videos from ${escHtml(medianRunLabel)} (closest to median)</div>` : '',
    raceInfo: buildRaceInfoHtml(summary),
    machineInfo: buildMachineInfoHtml(summary.machineInfo),
    errors: buildErrorsHtml(summary.errors),
    modeToggle,
    playerSection,
    results: buildResultsHtml(summary.comparisons || [], racers, summary.clickCounts),
    profile: buildProfileHtml(summary.profileComparison || null, racers),
    files: buildFilesHtml(racers, videoFiles, {
      fullVideoFiles, mergedVideoFile, traceFiles, altFormat, altFiles, placementOrder,
    }),
    scriptTag,
  });
}
