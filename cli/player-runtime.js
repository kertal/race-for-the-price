/* eslint-env browser */
/**
 * player-runtime.js — Browser-side video player logic.
 *
 * This file is read at build time by videoplayer.js and injected into the
 * generated HTML via {{placeholder}} replacement. It runs in the browser,
 * NOT in Node.js. The {{…}} tokens are replaced with JSON-serialized config
 * before the HTML is written to disk.
 */

// --- Config injected at build time ---
{{videoVars}}
const raceVideos = {{videoArray}};
const raceVideoPaths = {{raceVideoPaths}};
const fullVideoPaths = {{fullVideoPaths}};
const clipTimes = {{clipTimesJson}};
const racerNames = {{racerNamesJson}};
const racerColors = {{racerColorsJson}};
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
let activeClip = null;
const STEP = 0.1;
let loadedSrcSet = 'race';
let pendingSeek = null;
let canvasCalibrationStarted = false;

// --- Canvas calibration cache (localStorage) ---
const CALIBRATION_CACHE_KEY = 'raceCalibration:' + raceVideoPaths.join('|');

function loadCalibrationCache() {
  try {
    const raw = localStorage.getItem(CALIBRATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCalibrationCache() {
  if (!clipTimes) return;
  try {
    const entries = clipTimes.map(ct => {
      if (!ct || ct.calibratedStart == null) return null;
      return { calibratedStart: ct.calibratedStart, calibratedEnd: ct.calibratedEnd };
    });
    localStorage.setItem(CALIBRATION_CACHE_KEY, JSON.stringify(entries));
  } catch {}
}

// --- Canvas-based PTS calibration ---
const CUE_DETECT_SIZE = 4;
const FRAME_DT = 0.04;

function seekVideoTo(video, time) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 0.001) { resolve(); return; }
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('seek timeout'));
    }, 2000);
    function onSeeked() { clearTimeout(timer); resolve(); }
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = time;
  });
}

function isGreenCue(data) {
  let greenPx = 0;
  const total = data.length / 4;
  for (let j = 0; j < data.length; j += 4) {
    if (data[j] < 100 && data[j + 1] > 150 && data[j + 2] < 100) greenPx++;
  }
  return greenPx > total * 0.4;
}

async function toBlobVideo(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error('fetch status ' + response.status);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const tmp = document.createElement('video');
  tmp.muted = true;
  tmp.preload = 'auto';
  tmp.src = blobUrl;
  tmp._blobUrl = blobUrl;
  await new Promise((resolve, reject) => {
    tmp.addEventListener('loadedmetadata', resolve, { once: true });
    tmp.addEventListener('error', () => reject(new Error('blob video load failed')));
    tmp.load();
  });
  return tmp;
}

async function detectGreenCuePts(video, scanTo) {
  const canvas = document.createElement('canvas');
  canvas.width = CUE_DETECT_SIZE;
  canvas.height = CUE_DETECT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const endT = Math.min(video.duration || 0, scanTo || video.duration || 0);
  const srcOffset = 0;

  async function checkFrame(t) {
    await seekVideoTo(video, t);
    ctx.drawImage(video, srcOffset, srcOffset, CUE_DETECT_SIZE, CUE_DETECT_SIZE, 0, 0, CUE_DETECT_SIZE, CUE_DETECT_SIZE);
    return isGreenCue(ctx.getImageData(0, 0, CUE_DETECT_SIZE, CUE_DETECT_SIZE).data);
  }

  const coarseStep = FRAME_DT * 2;

  try {
    let coarseHit = null;
    for (let t = 0; t <= endT; t += coarseStep) {
      if (await checkFrame(t)) { coarseHit = t; break; }
    }
    if (coarseHit === null) return null;

    const fineStart = Math.max(0, coarseHit - coarseStep);
    let firstGreen = coarseHit;
    for (let ft = fineStart; ft < coarseHit; ft += FRAME_DT) {
      if (await checkFrame(ft)) { firstGreen = ft; break; }
    }
    return Math.max(0, firstGreen - FRAME_DT);
  } catch (e) {
    if (e.name === 'SecurityError' || (e.message && e.message.indexOf('tainted') !== -1)) throw e;
    console.warn('Canvas cue detection failed:', e.message);
    return null;
  }
}

function applyCalibrationToClip(ct, ptsStart, videoDuration) {
  const segDuration = ct._wcEnd - ct._wcStart;
  ct.calibratedStart = ptsStart;
  ct.calibratedEnd = ptsStart + segDuration;
  ct._ptsScale = null;
  ct.start = ptsStart;
  ct.end = Math.min(ptsStart + segDuration, videoDuration);
  ct._converted = true;
}

function restoreFromCache() {
  const cached = loadCalibrationCache();
  if (!cached || !clipTimes) return false;
  let applied = false;
  for (let i = 0; i < clipTimes.length; i++) {
    const ct = clipTimes[i];
    const entry = cached[i];
    const v = raceVideos[i];
    if (!ct || !entry || !v || !v.duration || ct._wcStart == null || ct.calibratedStart != null) continue;
    if (entry.calibratedStart != null) {
      applyCalibrationToClip(ct, entry.calibratedStart, v.duration);
      applied = true;
    }
  }
  return applied;
}

async function calibrateFromCanvas() {
  if (!clipTimes) return false;
  let anyCalibrated = false;

  for (let idx = 0; idx < raceVideos.length; idx++) {
    const v = raceVideos[idx];
    const ct = clipTimes[idx];
    if (!v || !ct || ct._wcStart == null || ct.calibratedStart != null) continue;

    const scanTo = v.duration * 0.6;
    let ptsStart = null;

    try {
      ptsStart = await detectGreenCuePts(v, scanTo);
    } catch {
      try {
        const blobVid = await toBlobVideo(v.src);
        ptsStart = await detectGreenCuePts(blobVid, scanTo);
        URL.revokeObjectURL(blobVid._blobUrl);
      } catch (e) {
        console.warn('Canvas calibration failed for video ' + idx + ':', e.message);
        continue;
      }
    }

    if (ptsStart !== null) {
      applyCalibrationToClip(ct, ptsStart, v.duration);
      anyCalibrated = true;
    }
  }

  if (anyCalibrated) saveCalibrationCache();
  return anyCalibrated;
}

// --- Formatting helpers ---

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return m + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}

function getTime(t) {
  return t.toFixed(1) + 's';
}

// --- Clip helpers ---

function clipOffset() {
  return activeClip ? activeClip.start : 0;
}

function clipDuration() {
  return activeClip ? (activeClip.end - activeClip.start) : duration;
}

function updateTimeDisplay() {
  const d = clipDuration();
  const t = d > 0 ? (scrubber.value / 1000) * d : 0;
  timeDisplay.textContent = fmt(Math.max(0, t)) + ' / ' + fmt(d);
  frameDisplay.textContent = getTime(Math.max(0, t));
}

function isValidClipEntry(c) {
  return c != null && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start <= c.end;
}

function seekAll(t) {
  const adj = getAdjustedClipTimes();
  const ct = adj || clipTimes;
  videos.forEach((v, i) => {
    if (!v) return;
    let target = t;
    if (activeClip && ct && isValidClipEntry(ct[i])) {
      const elapsed = t - activeClip.start;
      target = ct[i].start + elapsed;
      target = Math.max(ct[i].start, Math.min(ct[i].end, target));
    }
    v.currentTime = Math.min(target, v.duration || target);
  });
  updateFramePositions();
}

// --- Metadata & calibration ---

function onMeta() {
  duration = Math.max(...videos.filter(v => v).map(v => v.duration || 0));
  if (clipTimes) {
    for (let i = 0; i < clipTimes.length; i++) {
      if (!isValidClipEntry(clipTimes[i]) || !videos[i] || !videos[i].duration) continue;
      const ct = clipTimes[i];
      if (ct._converted) continue;
      if (ct._wcStart == null) { ct._wcStart = ct.start; ct._wcEnd = ct.end; }
      if (ct.calibratedStart != null) {
        applyCalibrationToClip(ct, ct.calibratedStart, videos[i].duration);
        continue;
      }
      const wcd = ct.wallClockDuration;
      const offset = ct.recordingOffset || 0;
      if (wcd > 0) {
        const scale = videos[i].duration / wcd;
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

  if (pendingSeek && videos.every(v => !v || v.readyState >= 1)) {
    const fn = pendingSeek;
    pendingSeek = null;
    fn();
  }

  if (!canvasCalibrationStarted && clipTimes &&
      raceVideos.every(v => !v || v.readyState >= 1)) {
    const needsCalibration = clipTimes.some(ct => ct && ct.calibratedStart == null);
    if (needsCalibration) {
      canvasCalibrationStarted = true;
      const applyCalibrationResult = () => {
        activeClip = resolveAdjustedClip();
        updateTimeDisplay();
        updateDebugStats();
        if (activeClip) { seekAll(activeClip.start); scrubber.value = 0; }
      };
      if (restoreFromCache()) {
        applyCalibrationResult();
      } else {
        calibrateFromCanvas().then(any => { if (any) applyCalibrationResult(); });
      }
    }
  }
}

// --- Playback event handlers ---

function onTimeUpdate() {
  const adj = getAdjustedClipTimes();
  const ct = adj || clipTimes;
  let elapsed = 0;
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (!v) continue;
    const vidClip = activeClip && ct && isValidClipEntry(ct[i]) ? ct[i] : null;
    if (vidClip && v.currentTime > vidClip.end) {
      v.currentTime = vidClip.end;
      v.pause();
    }
    const clamped = vidClip ? Math.min(v.currentTime, vidClip.end) : v.currentTime;
    const e = vidClip ? (clamped - vidClip.start) : (clamped - clipOffset());
    if (e > elapsed) elapsed = e;
  }
  if (activeClip && elapsed >= clipDuration()) {
    videos.forEach(v => v?.pause());
    seekAll(activeClip.end);
    playing = false;
    playBtn.textContent = '\u25B6';
    scrubber.value = 1000;
    updateTimeDisplay();
    return;
  }
  if (duration > 0) {
    const d = clipDuration();
    scrubber.value = d > 0 ? (Math.max(0, elapsed) / d) * 1000 : 0;
    updateTimeDisplay();
    updateFramePositions();
  }
}

function onEnded() {
  if (videos.every(vi => !vi || vi.paused || vi.ended)) {
    playing = false;
    playBtn.textContent = '\u25B6';
  }
}

// --- Listener management ---

function detachVideoListeners() {
  raceVideos.forEach(v => {
    if (v) {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('ended', onEnded);
    }
  });
  if (mergedVideo) {
    mergedVideo.removeEventListener('loadedmetadata', onMeta);
    mergedVideo.removeEventListener('timeupdate', onTimeUpdate);
    mergedVideo.removeEventListener('ended', onEnded);
  }
}

function attachVideoListeners() {
  videos.forEach(v => {
    if (v) {
      v.addEventListener('loadedmetadata', onMeta);
      v.addEventListener('timeupdate', onTimeUpdate);
      v.addEventListener('ended', onEnded);
    }
  });
}

attachVideoListeners();

// --- Mode switching ---

const modeRace = document.getElementById('modeRace');
const modeFull = document.getElementById('modeFull');
const modeMerged = document.getElementById('modeMerged');
const modeDebug = document.getElementById('modeDebug');
const debugPanel = document.getElementById('debugPanel');

function setActiveMode(btn) {
  [modeRace, modeFull, modeMerged, modeDebug].forEach(b => b?.classList.remove('active'));
  btn?.classList.add('active');
}

function resolveClip() {
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

function switchMode(targetSrcSet, targetVideos, modeBtn, opts) {
  pendingSeek = null;
  if (playing) { videos.forEach(v => v?.pause()); playing = false; playBtn.textContent = '\u25B6'; }
  detachVideoListeners();
  const srcChanged = loadedSrcSet !== targetSrcSet;
  if (srcChanged && opts.loadSrc) opts.loadSrc();
  if (targetSrcSet) loadedSrcSet = targetSrcSet;
  videos = targetVideos;
  primary = videos[0];
  attachVideoListeners();
  if (opts.onActivate) opts.onActivate();
  setActiveMode(modeBtn);
  if (srcChanged) {
    duration = 0;
    pendingSeek = opts.doSeek;
  } else {
    onMeta();
    opts.doSeek();
  }
}

function switchToRace() {
  switchMode('race', raceVideos, modeRace, {
    loadSrc() { raceVideos.forEach((v, i) => { v.src = raceVideoPaths[i]; }); },
    onActivate() {
      playerContainer.style.display = 'flex';
      if (mergedContainer) mergedContainer.style.display = 'none';
      if (debugPanel) debugPanel.style.display = 'none';
    },
    doSeek() {
      activeClip = resolveAdjustedClip();
      seekAll(activeClip ? activeClip.start : 0);
      scrubber.value = 0;
      updateTimeDisplay();
    }
  });
}

function switchToFull() {
  if (!fullVideoPaths && !clipTimes) return;
  const needsSrcSwitch = fullVideoPaths && loadedSrcSet !== 'full';
  switchMode(needsSrcSwitch ? 'full' : loadedSrcSet, raceVideos, modeFull, {
    loadSrc: needsSrcSwitch ? () => { raceVideos.forEach((v, i) => { v.src = fullVideoPaths[i]; }); } : null,
    onActivate() {
      playerContainer.style.display = 'flex';
      if (mergedContainer) mergedContainer.style.display = 'none';
      if (debugPanel) debugPanel.style.display = 'none';
    },
    doSeek() {
      activeClip = null;
      seekAll(0);
      scrubber.value = 0;
      updateTimeDisplay();
    }
  });
}

function switchToMerged() {
  if (!mergedVideo) return;
  switchMode(null, [mergedVideo], modeMerged, {
    onActivate() {
      playerContainer.style.display = 'none';
      mergedContainer.style.display = 'block';
      if (debugPanel) debugPanel.style.display = 'none';
      activeClip = null;
      duration = mergedVideo.duration || 0;
    },
    doSeek() {
      seekAll(0);
      scrubber.value = 0;
      updateTimeDisplay();
    }
  });
}

function switchToDebug() {
  switchMode('race', raceVideos, modeDebug, {
    loadSrc() { raceVideos.forEach((v, i) => { v.src = raceVideoPaths[i]; }); },
    onActivate() {
      playerContainer.style.display = 'flex';
      if (mergedContainer) mergedContainer.style.display = 'none';
      if (debugPanel) debugPanel.style.display = 'block';
    },
    doSeek() {
      activeClip = resolveAdjustedClip();
      updateDebugDisplay();
      updateDebugStats();
      updateFramePositions();
      seekAll(activeClip ? activeClip.start : 0);
      scrubber.value = 0;
      updateTimeDisplay();
    }
  });
}

// --- Debug panel: video stats ---

function clearRowKeepName(row) {
  const nameSpan = row.querySelector('.racer-name');
  const saved = nameSpan ? nameSpan.cloneNode(true) : null;
  row.textContent = '';
  if (saved) row.appendChild(saved);
}

function appendSpan(parent, text) {
  const s = document.createElement('span');
  s.textContent = text;
  parent.appendChild(s);
}

function updateDebugStats() {
  const statsEl = document.getElementById('debugStats');
  if (!statsEl || statsEl.offsetParent === null) return;
  const adjusted = getAdjustedClipTimes();
  for (let i = 0; i < raceVideos.length; i++) {
    const row = document.getElementById('debugStatsRow' + i);
    if (!row) continue;
    const v = raceVideos[i];
    if (!v || !v.duration) continue;
    const dur = v.duration.toFixed(2) + 's';
    const res = v.videoWidth + 'x' + v.videoHeight;
    let framesText = '\u2014';
    let droppedText = '\u2014';
    if (typeof v.getVideoPlaybackQuality === 'function') {
      const q = v.getVideoPlaybackQuality();
      framesText = String(q.totalVideoFrames);
      droppedText = String(q.droppedVideoFrames);
    }
    let clipDur = '';
    const activeCt = adjusted ? adjusted[i] : (clipTimes ? clipTimes[i] : null);
    if (activeCt) {
      clipDur = ' (clip: ' + (activeCt.end - activeCt.start).toFixed(2) + 's)';
    }
    clearRowKeepName(row);
    appendSpan(row, 'duration: ' + dur + clipDur);
    appendSpan(row, 'frames: ' + framesText + ' dropped: ' + droppedText);
    appendSpan(row, 'resolution: ' + res);
  }
  // TIMING EVENTS
  for (let i = 0; i < raceVideos.length; i++) {
    const eventsEl = document.getElementById('debugTimingEvents' + i);
    if (!eventsEl) continue;
    const v = raceVideos[i];
    const ct = clipTimes ? clipTimes[i] : null;
    if (!ct || !v || !v.duration) {
      eventsEl.replaceChildren();
      const noData = document.createElement('span');
      noData.style.color = '#777';
      noData.textContent = 'No timing data';
      eventsEl.appendChild(noData);
      continue;
    }
    const offset = ct.recordingOffset || 0;
    const wcd = ct.wallClockDuration || 0;
    const scale = ct._ptsScale || (wcd > 0 ? v.duration / wcd : 0);
    const wcStart = ct._wcStart != null ? ct._wcStart : ct.start;
    const wcEnd = ct._wcEnd != null ? ct._wcEnd : ct.end;
    let toPts;
    if (ct.calibratedStart != null) {
      const wcDur = wcEnd - wcStart;
      const ptsDur = ct.end - ct.start;
      toPts = (wc) => {
        if (wcDur <= 0) return wc;
        return ct.start + (wc - wcStart) / wcDur * ptsDur;
      };
    } else {
      toPts = (wc) => scale > 0 ? (wc + offset) * scale : wc;
    }
    const fmtS = (val) => val != null && isFinite(val) ? val.toFixed(3) + 's' : '\u2014';
    const toFrame = (pts) => pts != null && isFinite(pts) ? Math.round(pts / 0.04) : null;
    const fmtF = (pts) => { const f = toFrame(pts); return f != null ? '#' + f : '\u2014'; };
    const events = [];
    events.push({ label: 'Context created', wc: -offset, ptsVal: 0 });
    events.push({ label: 'recordingStartTime (t=0)', wc: 0, ptsVal: toPts(0) });
    events.push({ label: 'raceRecordingStart()', wc: wcStart, ptsVal: ct.start });
    const measurements = ct.measurements || [];
    for (let m = 0; m < measurements.length; m++) {
      const meas = measurements[m];
      if (meas.startTime != null) events.push({ label: 'raceStart("' + (meas.name || '') + '")', wc: meas.startTime, ptsVal: toPts(meas.startTime) });
      if (meas.endTime != null) events.push({ label: 'raceEnd("' + (meas.name || '') + '")', wc: meas.endTime, ptsVal: toPts(meas.endTime) });
    }
    events.push({ label: 'raceRecordingEnd()', wc: wcEnd, ptsVal: ct.end });
    events.push({ label: 'Pre-close', wc: wcd > 0 ? wcd - offset : null, ptsVal: v.duration });
    const scaleInfo = ct.calibratedStart != null
      ? 'calibrated'
      : (scale > 0 ? scale.toFixed(4) : '\u2014');
    events.push({ label: 'Video time scale', wc: scaleInfo, ptsVal: 'vid/wc', frame: '\u2014', bold: true });

    function buildTimingRow(ev, bold) {
      const div = document.createElement('div');
      div.className = 'debug-timing-event';
      const cols = [
        ev.label,
        typeof ev.wc === 'string' ? ev.wc : fmtS(ev.wc),
        typeof ev.ptsVal === 'string' ? ev.ptsVal : fmtS(ev.ptsVal),
        ev.frame != null ? ev.frame : fmtF(ev.ptsVal),
      ];
      const classes = ['debug-timing-label', 'debug-timing-val', 'debug-timing-val', 'debug-timing-val'];
      for (let c = 0; c < cols.length; c++) {
        const span = document.createElement('span');
        span.className = classes[c];
        if (bold || ev.bold) {
          const b = document.createElement('b');
          b.textContent = cols[c];
          span.appendChild(b);
        } else {
          span.textContent = cols[c];
        }
        div.appendChild(span);
      }
      return div;
    }

    eventsEl.replaceChildren();
    eventsEl.appendChild(buildTimingRow({ label: 'Event', wc: 'Wall-clock', ptsVal: 'Video time', frame: 'Frame' }, true));
    for (const ev of events) {
      eventsEl.appendChild(buildTimingRow(ev, false));
    }
  }
}

// --- Debug panel: frame positions ---

function updateFramePositions() {
  const adj = getAdjustedClipTimes();
  const ct = adj || clipTimes;
  for (let i = 0; i < raceVideos.length; i++) {
    const row = document.getElementById('debugFrameRow' + i);
    if (!row) continue;
    const v = raceVideos[i];
    if (!v || !v.duration) continue;
    let totalFrames = 0;
    if (typeof v.getVideoPlaybackQuality === 'function') {
      totalFrames = v.getVideoPlaybackQuality().totalVideoFrames;
    }
    clearRowKeepName(row);
    if (totalFrames <= 0) { appendSpan(row, '\u2014'); continue; }
    const fullFrame = Math.round(v.currentTime / v.duration * totalFrames);
    const clip = ct ? ct[i] : null;
    if (clip && isValidClipEntry(clip)) {
      const clipStartFrame = Math.round(clip.start / v.duration * totalFrames);
      const clipEndFrame = Math.round(clip.end / v.duration * totalFrames);
      const clipFrame = fullFrame - clipStartFrame;
      const clipTotal = clipEndFrame - clipStartFrame;
      appendSpan(row, 'clip: ' + clipFrame + ' / ' + clipTotal);
      appendSpan(row, 'full: ' + fullFrame + ' / ' + totalFrames);
      appendSpan(row, 'range: ' + clipStartFrame + '\u2013' + clipEndFrame);
    } else {
      appendSpan(row, 'full: ' + fullFrame + ' / ' + totalFrames);
    }
  }
}

// --- Debug mode: per-racer clip start calibration ---

const FRAME_STEP = 0.04;
const debugOffsets = raceVideos.map(() => 0);

function getAdjustedClipTimes() {
  if (!clipTimes) return null;
  return clipTimes.map((ct, i) => {
    if (!ct) return null;
    return { start: ct.start + debugOffsets[i], end: ct.end };
  });
}

function resolveAdjustedClip() {
  const adj = getAdjustedClipTimes();
  if (!adj) return resolveClip();
  let minStart = Infinity, maxDuration = 0, found = false;
  for (let i = 0; i < adj.length; i++) {
    if (isValidClipEntry(adj[i])) {
      minStart = Math.min(minStart, adj[i].start);
      maxDuration = Math.max(maxDuration, adj[i].end - adj[i].start);
      found = true;
    }
  }
  return found ? { start: minStart, end: minStart + maxDuration } : null;
}

function updateDebugDisplay() {
  const adj = getAdjustedClipTimes();
  for (let i = 0; i < raceVideos.length; i++) {
    const el = document.getElementById('debugStart' + i);
    if (!el) continue;
    const frames = Math.round(debugOffsets[i] / FRAME_STEP);
    const sign = frames >= 0 ? '+' : '';
    const startVal = adj && adj[i] ? adj[i].start.toFixed(3) : '0.000';
    el.textContent = 'start: ' + startVal + 's (' + sign + frames + 'f)';
  }
}

function adjustDebugOffset(idx, frameDelta) {
  if (!clipTimes || !clipTimes[idx]) return;
  let newOffset = debugOffsets[idx] + frameDelta * FRAME_STEP;
  const newStart = clipTimes[idx].start + newOffset;
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

// --- Debug panel event delegation ---

if (debugPanel) {
  debugPanel.addEventListener('click', (e) => {
    const btn = e.target.closest('.debug-frame-btn');
    if (btn) {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const delta = parseInt(btn.getAttribute('data-delta'), 10);
      adjustDebugOffset(idx, delta);
      return;
    }
    if (e.target.id === 'debugCopyJson') {
      const adj = getAdjustedClipTimes();
      const timingData = raceVideos.map((v, i) => {
        const ct = clipTimes ? clipTimes[i] : null;
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
      const out = { clipTimes: adj, offsets: debugOffsets.slice(), timingData };
      navigator.clipboard.writeText(JSON.stringify(out, null, 2));
      return;
    }
    if (e.target.id === 'debugResetAll') {
      for (let i = 0; i < debugOffsets.length; i++) debugOffsets[i] = 0;
      updateDebugDisplay();
      updateDebugStats();
      activeClip = resolveAdjustedClip();
      seekAll(activeClip ? activeClip.start : 0);
      scrubber.value = 0;
      updateTimeDisplay();
    }
  });
}

// --- Mode button bindings ---

if (modeRace) modeRace.addEventListener('click', switchToRace);
if (modeFull) modeFull.addEventListener('click', switchToFull);
if (modeMerged) modeMerged.addEventListener('click', switchToMerged);
if (modeDebug) modeDebug.addEventListener('click', switchToDebug);
if (mergedVideo) mergedVideo.addEventListener('loadedmetadata', () => {
  if (videos.indexOf(mergedVideo) !== -1) {
    duration = mergedVideo.duration;
    updateTimeDisplay();
  }
});

// --- Playback controls ---

playBtn.addEventListener('click', () => {
  if (playing) {
    videos.forEach(v => v?.pause());
    playBtn.textContent = '\u25B6';
  } else {
    if (activeClip && Number(scrubber.value) >= 999) {
      seekAll(activeClip.start);
      scrubber.value = 0;
    }
    videos.forEach(v => v?.play());
    playBtn.textContent = '\u23F8';
  }
  playing = !playing;
});

scrubber.addEventListener('input', () => {
  const d = clipDuration();
  const t = (scrubber.value / 1000) * d + clipOffset();
  seekAll(t);
  updateTimeDisplay();
});

speedSelect.addEventListener('change', () => {
  const rate = parseFloat(speedSelect.value);
  videos.forEach(v => { if (v) v.playbackRate = rate; });
});

function stepFrame(delta) {
  if (playing) { videos.forEach(v => v?.pause()); playing = false; playBtn.textContent = '\u25B6'; }
  const minT = clipOffset();
  const maxT = activeClip ? activeClip.end : duration;
  const d = clipDuration();
  const cur = d > 0 ? minT + (scrubber.value / 1000) * d : (primary.currentTime || 0);
  const t = Math.max(minT, Math.min(maxT, cur + delta));
  seekAll(t);
  const newElapsed = t - minT;
  scrubber.value = d > 0 ? (newElapsed / d) * 1000 : 0;
  updateTimeDisplay();
}

document.getElementById('prevFrame').addEventListener('click', () => stepFrame(-STEP));
document.getElementById('nextFrame').addEventListener('click', () => stepFrame(STEP));

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-STEP); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(STEP); }
  else if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
});

// --- Initial clip seek ---

if (clipTimes) {
  activeClip = resolveAdjustedClip();
  if (activeClip) {
    const initSeek = () => {
      seekAll(activeClip.start);
      updateTimeDisplay();
    };
    if (primary.readyState >= 1) initSeek();
    else primary.addEventListener('loadedmetadata', initSeek);
  }
}

// --- Export: client-side side-by-side video stitching ---

const exportBtn = document.getElementById('exportBtn');

function getExportLayout(count) {
  const LABEL_H = 30;
  const targetW = count <= 3 ? 640 : 480;
  const sample = raceVideos.find(v => v && v.videoWidth);
  const aspect = sample ? sample.videoHeight / sample.videoWidth : 9/16;
  const cellH = Math.round(targetW * aspect);
  const slotH = cellH + LABEL_H;
  let cols, rows;
  const positions = [];
  if (count <= 3) {
    cols = count; rows = 1;
    for (let i = 0; i < count; i++) positions.push({ x: i * targetW, y: 0 });
  } else if (count === 4) {
    cols = 2; rows = 2;
    for (let i = 0; i < 4; i++) positions.push({ x: (i % 2) * targetW, y: Math.floor(i / 2) * slotH });
  } else {
    cols = 3; rows = 2;
    for (let i = 0; i < 3; i++) positions.push({ x: i * targetW, y: 0 });
    const bottomOffset = Math.floor(targetW / 2);
    for (let i = 0; i < count - 3; i++) positions.push({ x: bottomOffset + i * targetW, y: slotH });
  }
  const canvasW = (count >= 5 ? 3 : cols) * targetW;
  const canvasH = rows * slotH;
  return { canvasW, canvasH, targetW, cellH, labelH: LABEL_H, positions };
}

function drawExportFrame(ctx, layout) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, layout.canvasW, layout.canvasH);
  for (let i = 0; i < raceVideos.length; i++) {
    const v = raceVideos[i];
    if (!v) continue;
    const pos = layout.positions[i];
    ctx.fillStyle = racerColors[i] || '#e8e0d0';
    ctx.font = 'bold 16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(racerNames[i] || '', pos.x + layout.targetW / 2, pos.y + layout.labelH - 8);
    try { ctx.drawImage(v, pos.x, pos.y + layout.labelH, layout.targetW, layout.cellH); } catch {}
  }
}

async function startExport() {
  if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    alert('Export requires a browser that supports Canvas.captureStream and MediaRecorder (Chrome, Firefox, or Edge).');
    return;
  }
  if (playing) { videos.forEach(v => v?.pause()); playing = false; playBtn.textContent = '\u25B6'; }

  const layout = getExportLayout(raceVideos.length);

  const tmpl = document.getElementById('tmpl-export-overlay');
  const overlay = tmpl.content.cloneNode(true).firstElementChild;
  const canvas = overlay.querySelector('.export-canvas');
  canvas.width = layout.canvasW;
  canvas.height = layout.canvasH;
  document.body.appendChild(overlay);

  const ctx = canvas.getContext('2d');
  const progressFill = overlay.querySelector('.export-progress-fill');
  const statusEl = overlay.querySelector('.export-status');
  const actionsEl = overlay.querySelector('.export-actions');

  const startTime = activeClip ? activeClip.start : 0;
  const endTime = activeClip ? activeClip.end : duration;
  const totalDur = endTime - startTime;

  const adj = getAdjustedClipTimes();
  const ct = adj || clipTimes;
  const perVideoEnd = raceVideos.map((v, i) => {
    if (!v) return endTime;
    return (activeClip && ct && ct[i]) ? ct[i].end : endTime;
  });

  const seekPromises = raceVideos.map((v, i) => {
    if (!v) return Promise.resolve();
    return new Promise((resolve) => {
      let target = startTime;
      if (activeClip && ct && ct[i]) {
        const elapsed = startTime - activeClip.start;
        target = ct[i].start + elapsed;
        target = Math.max(ct[i].start, Math.min(ct[i].end, target));
      }
      v.currentTime = Math.min(target, v.duration || target);
      v.onseeked = () => { v.onseeked = null; resolve(); };
    });
  });

  let cancelled = false;
  let recorder = null;
  let rafId = null;

  overlay.querySelector('.export-cancel').addEventListener('click', () => {
    cancelled = true;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (rafId) cancelAnimationFrame(rafId);
    raceVideos.forEach(v => v?.pause());
    overlay.remove();
  });

  await Promise.all(seekPromises);
  if (cancelled) return;
  statusEl.textContent = 'Recording...';

  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    if (cancelled) return;
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    statusEl.textContent = 'Export complete!';
    progressFill.style.width = '100%';
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'race-side-by-side.webm';
    downloadLink.textContent = 'Download';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => { URL.revokeObjectURL(url); overlay.remove(); });
    actionsEl.replaceChildren(downloadLink, closeBtn);
  };

  recorder.start();
  const exportRate = parseFloat(speedSelect.value) || 1;
  raceVideos.forEach(v => { if (v) { v.playbackRate = exportRate; v.play(); } });
  const speedLabel = exportRate !== 1 ? ' (' + exportRate + 'x)' : '';

  function tick() {
    if (cancelled) return;
    drawExportFrame(ctx, layout);
    const cur = Math.max(...raceVideos.map(v => v?.currentTime || 0));
    const progress = totalDur > 0 ? Math.min(1, (cur - startTime) / totalDur) : 0;
    progressFill.style.width = (progress * 100).toFixed(1) + '%';
    statusEl.textContent = 'Recording' + speedLabel + '... ' + Math.round(progress * 100) + '%';
    const allDone = raceVideos.every((v, i) => !v || v.currentTime >= perVideoEnd[i] || v.ended);
    if (allDone) {
      raceVideos.forEach(v => v?.pause());
      if (recorder.state !== 'inactive') recorder.stop();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

if (exportBtn) {
  if (raceVideos.length < 2) exportBtn.style.display = 'none';
  exportBtn.addEventListener('click', startExport);
}
