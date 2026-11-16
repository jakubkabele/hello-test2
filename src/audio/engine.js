// Sound engine (Web Audio). Nothing here runs until the first tap — phones forbid it.
//
// Plucks use the Karplus–Strong trick: start with a short burst of noise, then play it
// back in a loop that is exactly one wave-length long, softening it a little every lap.
// The loop length sets the pitch; the softening makes it ring out like a real string.

import { S, bus, clamp } from '../core/state.js';

let ctx = null;
let master = null;      // everything → here → speakers (the mute switch)
let pluckBus = null;
let drive = null;       // overdrive stage (easter egg)
let driveMix = null;
let cleanMix = null;
let analyser = null;
let wave = null;
let humGain = null;
let humFilter = null;
const cache = new Map();
const KEY = 'site.muted';

try { S.muted = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function synthPluck(midi, bright) {
  const sr = ctx.sampleRate;
  const freq = midiToHz(midi);
  const dur = clamp(3.4 - (midi - 40) * 0.035, 1.6, 3.4);
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const S_ = 0.5 - bright * 0.22;                       // loop softness (0.5 = dullest)
  const period = sr / freq;
  const D = period - S_;                                 // delay the loop must add
  const N = Math.floor(D - 0.1);
  const frac = D - N;
  const C = (1 - frac) / (1 + frac);                     // all-pass: fine-tunes the pitch
  const t60 = clamp(4.2 - (midi - 40) * 0.06, 1.4, 4.2); // seconds to fade
  const rho = Math.pow(10, (-3 * period) / (sr * t60));

  // the "pick": noise, lightly smoothed, with a notch that depends on where you pluck
  const exc = new Float32Array(N + 1);
  let lp = 0;
  const cut = 0.25 + bright * 0.6;
  for (let i = 0; i <= N; i++) { lp += cut * ((Math.random() * 2 - 1) - lp); exc[i] = lp; }
  const pos = Math.max(2, Math.floor(N * (0.28 - bright * 0.18)));
  for (let i = N; i >= pos; i--) exc[i] -= exc[i - pos] * 0.7;

  let xPrev = 0, apPrev = 0, vPrev = 0;
  for (let i = 0; i < n; i++) {
    const x = i >= N ? out[i - N] : 0;
    const v = (1 - S_) * x + S_ * xPrev;                 // soften
    xPrev = x;
    const ap = C * v + vPrev - C * apPrev;               // fine tune
    vPrev = v; apPrev = ap;
    out[i] = (i <= N ? exc[i] : 0) + rho * ap;
  }
  // fade the tail so it never clicks
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;

  const buf = ctx.createBuffer(1, n, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

function shaper(amount) {
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  return c;
}

function buildHum() {
  // an amplifier left on in an empty room: two low tones a hair apart + filtered hiss
  humGain = ctx.createGain(); humGain.gain.value = 0;
  humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 420;
  humFilter.connect(humGain); humGain.connect(master);
  [[55, 0.5], [110.4, 0.34], [164.6, 0.12], [220.9, 0.06]].forEach(([f, g]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(humFilter); o.start();
  });
  const len = ctx.sampleRate * 2;
  const nb = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = nb.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.2; }
  const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
  const ng = ctx.createGain(); ng.gain.value = 0.5;
  noise.connect(ng); ng.connect(humFilter); noise.start();
  // a slow swell so it breathes
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = ctx.createGain(); lg.gain.value = 90;
  lfo.connect(lg); lg.connect(humFilter.frequency); lfo.start();
  humGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5);
}

export const audio = {
  get ready() { return !!ctx; },
  get context() { return ctx; },

  // call from a tap / key press
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = S.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.5;
    wave = new Uint8Array(analyser.fftSize);
    master.connect(comp); comp.connect(ctx.destination);

    // plucks: a "pickup" tone filter, then clean or overdriven
    pluckBus = ctx.createGain(); pluckBus.gain.value = 0.9;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 4200; tone.Q.value = 0.9;
    cleanMix = ctx.createGain(); cleanMix.gain.value = 1;
    driveMix = ctx.createGain(); driveMix.gain.value = 0;
    drive = ctx.createWaveShaper(); drive.curve = shaper(14); drive.oversample = '2x';
    const pre = ctx.createGain(); pre.gain.value = 5;
    const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 2600;
    const post = ctx.createGain(); post.gain.value = 0.32;
    pluckBus.connect(tone);
    tone.connect(cleanMix); cleanMix.connect(master);
    tone.connect(pre); pre.connect(drive); drive.connect(cab); cab.connect(post); post.connect(driveMix); driveMix.connect(master);
    // the analyser listens to plucks only (so the visuals follow what you play, not the hum)
    cleanMix.connect(analyser); driveMix.connect(analyser);

    buildHum();
    if (ctx.state === 'suspended') ctx.resume();
    bus.emit('audio:on');
    // warm the six open strings so the first pluck is instant
    setTimeout(() => { [40, 45, 50, 55, 59, 64].forEach((m) => this.buffer(m, 0.5)); }, 60);
  },

  buffer(midi, bright) {
    const b = bright > 0.66 ? 2 : bright > 0.33 ? 1 : 0;
    const key = midi * 3 + b;
    if (!cache.has(key)) cache.set(key, synthPluck(midi, [0.15, 0.5, 0.85][b]));
    return cache.get(key);
  },

  // midi = note number, vel 0–1, bright 0–1 (pluck near the bridge = brighter), pan -1…1
  pluck(midi, { vel = 0.8, bright = 0.5, pan = 0, delay = 0 } = {}) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(midi, bright);
    const g = ctx.createGain();
    g.gain.value = 0.55 * clamp(vel, 0.05, 1.2);
    src.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1) * 0.5;
      g.connect(p); p.connect(pluckBus);
    } else g.connect(pluckBus);
    src.start(ctx.currentTime + delay);
  },

  // short interface sounds
  blip(kind = 'tick') {
    if (!ctx || S.muted) return;
    const t = ctx.currentTime;
    const spec = {
      tick: [1480, 0.035, 0.03, 'sine'],
      nav: [990, 0.09, 0.045, 'triangle'],
      lock: [1760, 0.07, 0.035, 'sine'],
      on: [660, 0.16, 0.05, 'triangle'],
      off: [330, 0.16, 0.05, 'triangle'],
      warn: [220, 0.3, 0.06, 'square'],
    }[kind] || [1200, 0.04, 0.03, 'sine'];
    const o = ctx.createOscillator(); o.type = spec[3]; o.frequency.setValueAtTime(spec[0], t);
    if (kind === 'nav') o.frequency.exponentialRampToValueAtTime(spec[0] * 1.5, t + spec[1]);
    if (kind === 'lock') { o.frequency.setValueAtTime(spec[0] * 0.75, t); o.frequency.setValueAtTime(spec[0], t + 0.03); }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(spec[2], t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec[1]);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + spec[1] + 0.02);
  },

  setMuted(m) {
    S.muted = !!m;
    try { localStorage.setItem(KEY, S.muted ? '1' : '0'); } catch { /* ignore */ }
    if (master) master.gain.setTargetAtTime(S.muted ? 0 : 1, ctx.currentTime, 0.04);
    bus.emit('mute', S.muted);
  },

  setOverdrive(on) {
    S.overdrive = !!on;
    if (!ctx) return;
    cleanMix.gain.setTargetAtTime(on ? 0.15 : 1, ctx.currentTime, 0.05);
    driveMix.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
  },

  // the hum opens up a little as you travel deeper into the site
  setDepth(k) {
    if (humFilter) humFilter.frequency.setTargetAtTime(380 + k * 420, ctx.currentTime, 0.6);
  },

  // called every frame: how loud are the plucks right now (0–1) + the raw wave for the scope
  measure() {
    if (!analyser) { S.level = 0; return null; }
    analyser.getByteTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i += 2) { const v = (wave[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / (wave.length / 2));
    S.level = Math.max(clamp(rms * 3.2), S.level * 0.9);
    return wave;
  },
};

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else ctx.resume();
});
