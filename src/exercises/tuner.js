// EX-01 TUNER — runs inside the 3D world.
//
// How it listens (plain words): the microphone picture of the sound is compared with a copy
// of itself shifted a little later (YIN, the same detector as before). The shift where the
// two line up is one wave-length → the pitch. We then ask "which open string is that closest
// to?" and measure how far off it is in cents (hundredths of a semitone).
// The matching peg on the 3D headstock turns with that error and the string shakes — silently.

import { S, bus, clamp } from '../core/state.js';
import { esc } from '../chapters/common.js';

const OPEN_HZ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
const NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];
// "in tune" window per sensitivity level 1–5 (same numbers as the old tuner)
const IN_TUNE = [8, 6, 5, 4, 3];

function level() {
  try { return clamp(Number(JSON.parse(localStorage.getItem('practice.settings.v1') || '{}').sensitivity) || 3, 1, 5); } catch { return 3; }
}
function saveLog(names, secs) {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const list = JSON.parse(localStorage.getItem('practice.log.v1') || '[]');
    const entry = {
      id: now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      ts: now.toISOString(),
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      exercise: 'tuner', title: 'Tuner', chords: [],
      score: { inTune: names.length },
      summary: names.length ? `Tuned ${names.length} of 6 strings` : 'Tuned up',
      activeSec: Math.round(secs),
    };
    list.push(entry);
    localStorage.setItem('practice.log.v1', JSON.stringify(list));
    bus.emit('logged', entry);
  } catch { /* storage blocked */ }
}

export function createTuner({ root, words, liveLink, audio, focus, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-tuner';
  el.dataset.ex = 'tuner';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="tn-read">
      <b class="tn-note">·</b>
      <span class="tn-side"><span class="tn-cents">&nbsp;</span><span class="tn-msg">${esc(words.idle)}</span></span>
    </div>
    <div class="tn-meter" aria-hidden="true"><i class="tn-zone"></i><i class="tn-needle"></i></div>
    <div class="tn-strings" role="group" aria-label="String">
      <button type="button" data-s="-1" class="is-on">AUTO</button>
      ${NAMES.map((n, i) => `<button type="button" data-s="${i}"><b>${n}</b><i></i></button>`).join('')}
    </div>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const note = $('.tn-note'), cents = $('.tn-cents'), msg = $('.tn-msg'), needle = $('.tn-needle'), zone = $('.tn-zone'), go = $('.ex-go');
  const sbtns = [...el.querySelectorAll('.tn-strings button')];

  let open = false, listening = false, pick = -1, cur = -1;
  let shown = 0;                 // smoothed cents on the needle
  let goodFor = 0, lastHeard = 0, active = 0, lastTick = 0;
  const tuned = new Set();
  const hist = [];

  const setMsg = (t, s = '') => { msg.textContent = t; el.dataset.s = s; };
  function target(i) {
    if (i === cur) return;
    cur = i;
    sbtns.forEach((b) => b.classList.toggle('is-cur', +b.dataset.s === i));
    if (i >= 0 && open) focus.snapTo(`peg${i}`);
  }

  function hear(d) {
    if (!open || !listening) return;
    const now = performance.now();
    const dt = Math.min(0.2, (now - lastTick) / 1000); lastTick = now;
    const stage = getStage();
    if (!d || !d.hz) {
      if (now - lastHeard > 900) { el.classList.remove('is-heard'); goodFor = 0; hist.length = 0; }
      return;
    }
    // nearest open string (or the one you picked)
    let i = pick;
    if (i < 0) { let bd = 1e9; OPEN_HZ.forEach((f, k) => { const c = Math.abs(1200 * Math.log2(d.hz / f)); if (c < bd) { bd = c; i = k; } }); }
    let c = 1200 * Math.log2(d.hz / OPEN_HZ[i]);
    if (Math.abs(c) > 400 && pick < 0) return;       // not a guitar string — ignore
    // steady it: middle value of the last few readings
    hist.push(c); if (hist.length > 5) hist.shift();
    c = [...hist].sort((a, b) => a - b)[Math.floor(hist.length / 2)];
    lastHeard = now; active += dt;
    el.classList.add('is-heard');
    target(i);
    shown += (clamp(c, -50, 50) - shown) * 0.35;
    const tol = IN_TUNE[level() - 1];
    const ok = Math.abs(c) <= tol;
    note.textContent = NAMES[i];
    cents.textContent = `${c > 0 ? '+' : c < 0 ? '−' : '±'}${String(Math.min(99, Math.abs(Math.round(c)))).padStart(2, '0')}¢`;
    needle.style.transform = `translateX(${shown * 2}%)`;
    zone.style.width = `${tol * 2}%`;
    setMsg(ok ? words.ok : c < 0 ? words.flat : words.sharp, ok ? 'ok' : 'off');
    // the 3D guitar copies you: string shakes, peg turns with the error
    if (stage) {
      stage.guitar.sustain(i, clamp(d.level * 9, 0.35, 1), 0);
      stage.guitar.setPeg(i, clamp(c, -60, 60) * 0.045);
    }
    S.level = Math.max(S.level, clamp(d.level * 5));
    goodFor = ok ? goodFor + dt : 0;
    if (goodFor > 0.7 && !tuned.has(i)) {
      tuned.add(i);
      sbtns[i + 1].classList.add('is-done');
      bus.emit('flash', 0.35);
      if (tuned.size === 6) setMsg(words.done, 'ok');
    }
  }
  bus.on('live', hear);

  async function start() {
    try {
      setMsg(words.listening);
      await liveLink.start();
      audio.duck(true);                 // the site's own sounds stay silent while it listens
      listening = true; lastTick = performance.now();
      go.textContent = words.stop; el.classList.add('is-listening');
    } catch { setMsg(words.denied, 'off'); }
  }
  function stop() {
    if (!listening) return;
    listening = false;
    liveLink.stop(); audio.duck(false);
    go.textContent = words.start; el.classList.remove('is-listening', 'is-heard');
    const stage = getStage();
    if (stage) for (let i = 0; i < 6; i++) stage.guitar.setPeg(i, 0);
    if (active >= 4) saveLog([...tuned], active);
    active = 0;
  }

  go.addEventListener('click', () => (listening ? stop() : start()));
  $('.ex-exit').addEventListener('click', () => director.exit());
  sbtns.forEach((b) => b.addEventListener('click', () => {
    pick = +b.dataset.s; hist.length = 0;
    sbtns.forEach((x) => x.classList.toggle('is-on', x === b));
    if (pick >= 0) { target(pick); note.textContent = NAMES[pick]; }
  }));

  bus.on('ex:enter', (n) => {
    if (n !== 'tuner') return;
    open = true; cur = -1; tuned.clear(); hist.length = 0;
    sbtns.forEach((b) => b.classList.remove('is-done', 'is-cur'));
    note.textContent = '·'; cents.innerHTML = '&nbsp;'; needle.style.transform = ''; setMsg(words.idle);
    el.classList.add('is-open');
  });
  bus.on('ex:leave', (n) => { if (n === 'tuner') { stop(); open = false; el.classList.remove('is-open'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return { el };
}
