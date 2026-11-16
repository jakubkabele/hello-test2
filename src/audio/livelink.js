// LIVE LINK — the site listens to a real guitar through the microphone.
//
// It uses the same pitch detector as the practice app's tuner (YIN): compare the sound
// with a copy of itself shifted a little later. When the shifted copy lines up, the shift
// is one wave-length → that's the note. From the note we work out which string and fret
// it most likely is, shake that string on the 3D guitar and show how in-tune it is.

import { S, bus } from '../core/state.js';
import { audio } from './engine.js';

const MIN_FREQ = 70;
const MAX_FREQ = 1000;
const OPEN = [40, 45, 50, 55, 59, 64];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let stream = null;
let analyser = null;
let buf = null;
let curve = null;
let timer = null;

// ---- YIN (ported from practice/audio.js) ----
function yin(b, sampleRate, threshold = 0.15) {
  const tauMax = Math.ceil(sampleRate / MIN_FREQ);
  if (!curve || curve.length !== tauMax + 2) curve = new Float32Array(tauMax + 2);
  const d = curve;
  const W = Math.min(2048, b.length - tauMax - 1);
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) { const delta = b[i] - b[i + tau]; sum += delta * delta; }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }
  const tauMin = Math.floor(sampleRate / MAX_FREQ);
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
  }
  if (tau === -1) return null;
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = d[tau - 1], bb = d[tau], c = d[tau + 1];
    const denom = a + c - 2 * bb;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  const f = sampleRate / better;
  return f >= MIN_FREQ && f <= MAX_FREQ ? f : null;
}

function rms(b) { let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i]; return Math.sqrt(s / b.length); }

// Note → most likely place on the neck: the lowest fret that can play it.
function place(midi) {
  let best = null;
  for (let i = 5; i >= 0; i--) {
    const fret = midi - OPEN[i];
    if (fret >= 0 && fret <= 22 && (!best || fret < best.fret)) best = { string: i, fret };
  }
  return best;
}

function tick() {
  if (!analyser) return;
  analyser.getFloatTimeDomainData(buf);
  const level = rms(buf);
  if (level < 0.012) { bus.emit('live', null); return; }
  const f = yin(buf, audio.context.sampleRate);
  if (!f) { bus.emit('live', { level }); return; }
  const exact = 69 + 12 * Math.log2(f / 440);
  const midi = Math.round(exact);
  const cents = Math.round((exact - midi) * 100);
  const where = place(midi);
  bus.emit('live', {
    level, hz: f, midi, cents,
    name: NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1),
    string: where ? where.string : null,
    fret: where ? where.fret : null,
  });
}

export const liveLink = {
  async start() {
    audio.unlock();
    if (!audio.context || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = audio.context;
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    buf = new Float32Array(analyser.fftSize);
    src.connect(analyser);           // listen only — never sent to the speakers
    timer = setInterval(tick, 60);
    S.live = true;
    bus.emit('live:state', true);
  },
  stop() {
    clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; analyser = null;
    S.live = false;
    bus.emit('live', null);
    bus.emit('live:state', false);
  },
};
