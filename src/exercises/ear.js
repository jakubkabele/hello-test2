// The "ear" shared by the in-world exercises.
//
// The hearing engine is NOT copied: the practice app's own files (public/practice/audio.js,
// chords.js, timing.js, pause.js) are loaded as they are, once, the first time an exercise
// needs them. So a fix there fixes both places.
//
// Also here: the microphone (on the site's own audio clock, so a metronome click and the
// mic share one timeline), the listening-sensitivity numbers, and writing to the practice log.

import { audio } from '../audio/engine.js';
import { clamp } from '../core/state.js';

const FILES = ['audio.js', 'chords.js', 'timing.js', 'pause.js'];
let engine = null;

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = ok; s.onerror = () => fail(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

// → { Sound, Chords, Timing, Pause } (the practice app's objects)
export function loadEngine() {
  if (!engine) {
    engine = FILES.reduce((p, f) => p.then(() => loadScript(`/practice/${f}`)), Promise.resolve())
      // they are declared with `const` in plain scripts: reachable by name, not as window.X
      // eslint-disable-next-line no-new-func
      .then(() => new Function('return { Sound, Chords, Timing, Pause };')())
      .catch((e) => { engine = null; throw e; });
  }
  return engine;
}

// ── microphone ──
// size = how much recent sound we keep (32768 samples ≈ 0.7 s).
export async function openMic(size = 32768) {
  audio.unlock();
  const ctx = audio.context;
  if (!ctx || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
  const stream = await navigator.mediaDevices.getUserMedia({
    // phone "voice" processing distorts music — off
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = size;
  src.connect(analyser);            // listen only — never sent to the speakers
  const buffer = new Float32Array(size);
  return {
    ctx, analyser, buffer, sampleRate: ctx.sampleRate,
    read() { analyser.getFloatTimeDomainData(buffer); return buffer; },
    close() { stream.getTracks().forEach((t) => t.stop()); try { src.disconnect(); } catch { /* gone */ } },
  };
}

// ── metronome click ──
// A short bright tick (filtered noise). Goes straight to the speakers, past the site's
// mute switch and the "duck" that silences the site while an exercise listens.
let clickBuf = null;
export function playClick(ctx, time, accent, list) {
  if (!clickBuf || clickBuf.sampleRate !== ctx.sampleRate) {
    const len = Math.round(ctx.sampleRate * 0.025);
    clickBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = clickBuf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) { const n = Math.random() * 2 - 1; d[i] = (n - prev) * Math.exp(-i / (len / 5)); prev = n; }
  }
  const src = ctx.createBufferSource();
  src.buffer = clickBuf;
  const g = ctx.createGain();
  g.gain.value = accent ? 0.9 : 0.4;
  src.connect(g).connect(ctx.destination);
  src.start(time);
  if (list) { list.push(src); src.onended = () => { const i = list.indexOf(src); if (i >= 0) list.splice(i, 1); }; }
  return src;
}

// ── listening sensitivity (1 = forgiving … 5 = exact) ──
// Same numbers as public/practice/settings.js (chord, drill, findNote, rhythm blocks) — keep them in step.
const LEVELS = [
  { name: 'Relaxed',    chord: { ring: 0.2, extra: 0.5, stick: 0.3, focus: 0.25, giveUp: 8000, spot: false },
    drill: { mistakes: 1, quiet: 99, margin: 0, rank: 0.15, timing: 250 }, findNote: { cents: 50, hold: 3 }, rhythm: { timing: 90 } },
  { name: 'Easy-going', chord: { ring: 0.27, extra: 0.4, stick: 0.18, focus: 0.3, giveUp: 6500, spot: false },
    drill: { mistakes: 1, quiet: 2, margin: 0.03, rank: 0.12, timing: 200 }, findNote: { cents: 45, hold: 3 }, rhythm: { timing: 75 } },
  { name: 'Balanced',   chord: { ring: 0.35, extra: 0.3, stick: 0.08, focus: 0.35, giveUp: 5000, spot: false },
    drill: { mistakes: 0, quiet: 99, margin: 0.05, rank: 0.1, timing: 150 }, findNote: { cents: 40, hold: 4 }, rhythm: { timing: 60 } },
  { name: 'Precise',    chord: { ring: 0.45, extra: 0.25, stick: 0.03, focus: 0.4, giveUp: 4500, spot: true },
    drill: { mistakes: 0, quiet: 0, margin: 0.08, rank: 0.07, timing: 120 }, findNote: { cents: 30, hold: 5 }, rhythm: { timing: 45 } },
  { name: 'Maximum',    chord: { ring: 0.55, extra: 0.2, stick: 0, focus: 0.45, giveUp: 4000, spot: true },
    drill: { mistakes: 0, quiet: 0, margin: 0.1, rank: 0.05, timing: 100 }, findNote: { cents: 25, hold: 6 }, rhythm: { timing: 35 } },
];
export function level() {
  try { return clamp(Number(JSON.parse(localStorage.getItem('practice.settings.v1') || '{}').sensitivity) || 3, 1, 5); } catch { return 3; }
}
export const profile = () => LEVELS[level() - 1];

// ── practice log (same list as the old screens: practice.log.v1) ──
const LOG = 'practice.log.v1';
export function readLog() {
  try { const l = JSON.parse(localStorage.getItem(LOG) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
export function addLog(entry) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const full = {
    id: now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    ts: now.toISOString(),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    exercise: '', title: '', chords: [], score: null, summary: '', activeSec: 0,
    ...entry,
  };
  const list = readLog();
  list.push(full);
  try { localStorage.setItem(LOG, JSON.stringify(list)); } catch { return null; }
  return full;
}

// small saved settings per exercise
export function loadPrefs(key, defaults) {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...defaults }; }
}
export function savePrefs(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* blocked */ } }

// chord shape → what the 3D neck draws (frets, 'x' = don't play)
export const neckFrets = (shape) => (shape ? shape.frets.map((f) => (f < 0 ? 'x' : f)) : null);
export const STRING_LABEL = ['E', 'A', 'D', 'G', 'B', 'e'];
export const stringName = (i) => (i === 5 ? 'high e' : STRING_LABEL[i]);
