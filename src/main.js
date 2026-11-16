// Entry point. Paints the start-up screen, builds the page from content.js,
// then loads the heavy 3D stage in the background and plugs it in when ready.

import '@fontsource/anton/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/shippori-mincho/latin-800.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/chapters.css';

import gsap from 'gsap';
import { content } from './content.js';
import { S, bus, clamp } from './core/state.js';
import { SHOTS, CHAPTERS } from './config/shots.js';
import { measureViewport, homeRect } from './core/layout.js';
import { createDirector } from './core/director.js';
import { createFocus } from './core/focus.js';
import { createInput } from './core/input.js';
import { audio } from './audio/engine.js';
import { liveLink } from './audio/livelink.js';
import { chapters } from './chapters/index.js';
import { createHud } from './ui/hud.js';
import { runBoot } from './ui/boot.js';
import { createCursor } from './ui/cursor.js';
import { createKeys } from './ui/keys.js';
import { createEggs } from './ui/eggs.js';
import { createTuner } from './exercises/tuner.js';

document.title = content.site.pageTitle;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
document.documentElement.classList.toggle('reduced', S.reduced);

const canvas = document.getElementById('stage');
const frame = document.getElementById('fw');
let stage = null;

measureViewport();

// ── build the chapter screens from content.js ──
const host = document.getElementById('chapters');
const layers = {};
chapters.forEach((ch) => {
  const el = document.createElement('section');
  el.className = `ch ch-${ch.id} ${ch.className || ''}`;
  el.dataset.ch = ch.id;
  el.innerHTML = ch.html(content[ch.id], content.site);
  host.appendChild(el);
  layers[ch.id] = el;
});

// each chapter's CSS knows where its focus window rests (so type can overlap its edge)
function layout() {
  chapters.forEach((ch) => {
    const first = SHOTS.findIndex((s) => s.ch === ch.id);
    const r = homeRect(first);
    const st = layers[ch.id].style;
    st.setProperty('--wx', `${r.x}px`); st.setProperty('--wy', `${r.y}px`);
    st.setProperty('--ww', `${r.w}px`); st.setProperty('--wh', `${r.h}px`);
  });
  chapters.forEach((ch) => ch.fit && ch.fit(layers[ch.id], S.vh, S.layout === 'd'));
}
layout();

const timelines = {};
chapters.forEach((ch) => { timelines[ch.id] = ch.timeline(layers[ch.id]); });

const director = createDirector({ track: document.getElementById('track'), layers, timelines });
const focus = createFocus({ frame });
const input = createInput({ canvas, frame, focus, getStage: () => stage });
const hud = createHud({ root: document.getElementById('hud'), content, audio, director });
const cursor = createCursor(document.getElementById('cursor'));
createKeys({ director, audio, focus, hud, input });
createEggs({ hud, audio });
chapters.forEach((ch) => ch.mount(layers[ch.id], { content, audio, focus, director }));

// exercises that run inside the 3D world
createTuner({ root: host, words: content.ex.tuner, liveLink, audio, focus, getStage: () => stage, director });
director.measure();

// titles are sized to fit — so re-measure whenever a web font finishes arriving
if (document.fonts) {
  let ft = null;
  const refit = () => { clearTimeout(ft); ft = setTimeout(layout, 60); };
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refit);
  if (document.fonts.load) document.fonts.load('100px "Anton"', 'STILL').then(refit).catch(() => {});
  if (document.fonts.ready) document.fonts.ready.then(refit).catch(() => {});
}

// ── film grain over the whole page (a small tile of random specks) ──
(function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    const light = v > 0.5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
    img.data[i + 3] = Math.pow(Math.abs(v - 0.5) * 2, 2.2) * 150;
  }
  g.putImageData(img, 0, 0);
  document.getElementById('grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

// ── wiring between modules ──
bus.on('chord', (frets) => stage && stage.guitar.setChord(frets));
bus.on('visual-pluck', (p) => { if (stage) stage.guitar.pluck(p.string, 0.9, p.fret); bus.emit('pluck', { string: p.string, fret: p.fret, midi: [40, 45, 50, 55, 59, 64][p.string] + p.fret, vel: 0.7 }); });
bus.on('live', (d) => {
  if (!stage || S.exercise) return;   // an open exercise drives the guitar itself
  if (d && d.string !== null && d.string !== undefined) {
    stage.guitar.sustain(d.string, clamp(d.level * 9, 0.35, 1), d.fret);
    stage.guitar.setLive(d.string, d.fret);
    S.level = Math.max(S.level, clamp(d.level * 5));
  } else stage.guitar.setLive(null);
});
// sound may only start from a real tap / key press (browser rule) — any first one will do
['click', 'keydown'].forEach((t) => window.addEventListener(t, () => audio.unlock(), { passive: true }));
bus.on('gesture', () => focus.enableTilt());
let tilted = false;
window.addEventListener('pointerdown', () => { if (!tilted) { tilted = true; focus.enableTilt(); } }, { once: true, capture: true });

// ── the frame loop ──
gsap.ticker.add((time, deltaMs) => {
  const dt = Math.min(0.05, Math.max(0.001, deltaMs / 1000));
  S.time += dt;
  director.update(dt);
  input.update(dt);
  if (stage) stage.pose(dt);
  focus.update(dt, stage);
  const wave = audio.measure();
  if (stage) { stage.render(dt); stage.monitor(dt); }
  hud.update(dt, wave);
  cursor.update(dt);
});

// ── resize: only re-lay-out when the screen really changed (not when a phone hides its address bar) ──
let lastW = S.vw, lastH = S.vh, rz = null;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    measureViewport();
    if (S.vw === lastW && Math.abs(S.vh - lastH) < 4) return;
    lastW = S.vw; lastH = S.vh;
    layout();
    director.measure();
    if (stage) stage.resize();
  }, 140);
});

// ── start-up, then open the window ──
const bootDone = runBoot({
  el: document.getElementById('boot'),
  lines: content.boot,
  onGesture: () => { audio.unlock(); audio.blip('on'); },
});
bootDone.then(() => {
  document.documentElement.classList.add('is-in');
  layout();
  if (S.reduced) { S.intro = 1; S.open = 1; return; }
  gsap.to(S, { intro: 1, duration: 1.3, delay: 0.1, ease: 'power1.out' });   // the first chapter writes itself in
  gsap.to(S, { open: 1, duration: 1.1, delay: 0.1, ease: 'power3.inOut' });
});

// The Japanese glyphs come as ~120 small font slices; the browser only downloads the ones
// actually used. Their (large) stylesheet is loaded after first paint so it never blocks.
setTimeout(() => { import('@fontsource/shippori-mincho/800.css').catch(() => {}); }, 0);

// ── the 3D stage, loaded lazily ──
function startStage() {
  import('./three/stage.js')
    .then((m) => m.createStage({ canvas, modelUrl: null }))   // ← put '/models/guitar.glb' here to use a real model
    .then((st) => {
      stage = st;
      if (input.chord) stage.guitar.setChord(input.chord);
      document.documentElement.classList.add('has-gl');
      if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__site = { S, stage, director, focus, audio, input, bus, layout };
    })
    .catch((err) => {
      console.warn('3D unavailable — showing the flat fallback.', err);
      document.documentElement.classList.add('no-gl');
    });
}
if ('requestIdleCallback' in window) requestIdleCallback(startStage, { timeout: 400 }); else setTimeout(startStage, 60);
