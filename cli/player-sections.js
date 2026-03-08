/**
 * player-sections.js — Build-time HTML section builders for the race player.
 *
 * Each function returns an HTML string (or '' if nothing to show).
 * Used by videoplayer.js to populate {{placeholder}} slots in player.html.
 */

import { PROFILE_METRICS, categoryDescriptions } from './profile-analysis.js';
import { formatPlatform } from './summary.js';

export const RACER_CSS_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#f1c40f', '#9b59b6'];

/** Escape a string for safe embedding in HTML text/attribute contexts. */
export function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Sort racers by value ascending (best first), nulls last. */
export function sortByValue(racers, getValue) {
  return racers
    .map((name, i) => ({ name, index: i, ...getValue(i) }))
    .sort((a, b) => {
      if (a.val === null) return 1;
      if (b.val === null) return -1;
      return a.val - b.val;
    });
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

// ---------------------------------------------------------------------------
// Section Builders
// ---------------------------------------------------------------------------

export function buildRunNavHtml(runNav) {
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

export function buildRaceInfoHtml(summary) {
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

export function buildMachineInfoHtml(machineInfo) {
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

export function buildErrorsHtml(errors) {
  if (!errors || errors.length === 0) return '';
  return `<div class="errors"><ul>${errors.map(e => `<li>${escHtml(e)}</li>`).join('')}</ul></div>`;
}

export function buildResultsHtml(comparisons, racers, clickCounts) {
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

export function buildProfileHtml(profileComparison, racers) {
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

export function buildFilesHtml(racers, videoFiles, options) {
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

export function buildDebugPanelHtml(racers, placementOrder, clipTimes) {
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

export function buildPlayerSectionHtml(videoElements, mergedVideoElement, debugPanelHtml) {
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
