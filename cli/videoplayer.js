/**
 * Generates a self-contained HTML file with a retro Grand Prix styled
 * video player for race results. Supports 2-5 racers.
 *
 * The HTML structure and CSS live in player.html (a real HTML template).
 * Section builders live in player-sections.js.
 * The browser-side player runtime lives in player-runtime.js.
 * This module wires everything together via {{placeholder}} replacement.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPlacementOrder } from './summary.js';
import {
  RACER_CSS_COLORS,
  escHtml,
  render,
  setTemplates,
  buildRunNavHtml,
  buildRaceInfoHtml,
  buildMachineInfoHtml,
  buildErrorsHtml,
  buildResultsHtml,
  buildProfileHtml,
  buildFilesHtml,
  buildDebugPanelHtml,
  buildPlayerSectionHtml,
} from './player-sections.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_HTML = fs.readFileSync(path.join(__dirname, 'player.html'), 'utf-8');
const RUNTIME = fs.readFileSync(path.join(__dirname, 'player-runtime.js'), 'utf-8');

// Extract build-time templates (build-*) from HTML and strip them from the main template
function extractBuildTemplates(html) {
  const templates = {};
  const cleaned = html.replace(/<template id="build-([^"]+)">([\s\S]*?)<\/template>\s*/g, (_, id, content) => {
    templates[id] = content.trim();
    return '';
  });
  return { mainTemplate: cleaned, templates };
}

const { mainTemplate: TEMPLATE, templates: BUILD_TEMPLATES } = extractBuildTemplates(RAW_HTML);
setTemplates(BUILD_TEMPLATES);

// ---------------------------------------------------------------------------
// Player Script Builder — reads player-runtime.js and injects config
// ---------------------------------------------------------------------------

function buildPlayerScript(config) {
  return '<script>\n(function() {\n' +
    render(RUNTIME, config) +
    '\n})();\n</script>';
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function buildPlayerHtml(summary, videoFiles, altFormat, altFiles, options = {}) {
  const { fullVideoFiles, mergedVideoFile, traceFiles, runNavigation, medianRunLabel, clipTimes } = options;
  const racers = summary.racers;
  const count = racers.length;

  const maxWidth = count <= 2 ? 680 : count === 3 ? 450 : 340;
  const containerMaxWidth = count <= 2 ? 1400 : count === 3 ? 1400 : 1440;

  const title = count === 2
    ? `Race: ${escHtml(racers[0])} vs ${escHtml(racers[1])}`
    : `Race: ${racers.map(escHtml).join(' vs ')}`;

  const winnerBanner = summary.overallWinner === 'tie'
    ? `<span class="trophy">&#129309;</span> It's a Tie!`
    : summary.overallWinner
      ? `<span class="trophy">&#127942;</span> ${escHtml(summary.overallWinner.toUpperCase())} wins!`
      : '';

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

    const videoIds = placementOrder.map((_, i) => `v${i}`);
    const orderedVideoFiles = placementOrder.map(i => videoFiles[i]);
    const orderedFullVideoFiles = fullVideoFiles ? placementOrder.map(i => fullVideoFiles[i]) : null;
    const orderedClipTimes = clipTimes ? placementOrder.map(i => clipTimes[i] || null) : null;
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
    });
  }

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
