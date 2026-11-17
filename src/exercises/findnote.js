// EX-05 FIND THE NOTE — runs inside the 3D world: the neck lies flat across the screen
// (headstock left, frets 0–12), like a map of the fretboard.
//
// A note name appears; find it anywhere (or on the string you chose) and play it.
// How it listens (plain words): every frame the newest ~0.09 s of sound goes through YIN —
// the same pitch finder as the tuner — and is rounded to the nearest note. When the same
// note holds steady for a few frames (and is in tune enough, by sensitivity), that's the
// note you played. Any octave counts. Time = from the note appearing to it sounding.
// On the 3D neck an amber ring marks where you most likely played it (lowest fret, or on
// your chosen string). 10 notes a round; 20 s of silence pauses.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { loadEngine, openMic, profile, addLog, readLog, loadPrefs, savePrefs } from './ear.js';

const PREFS = 'practice.findnote.settings';       // shared with the old screen
const ROUND = 10;
const MIN_RMS = 0.006;
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const OPEN = [40, 45, 50, 55, 59, 64];
const SNAME = ['low E', 'A', 'D', 'G', 'B', 'high e'];
const SLABEL = ['E', 'A', 'D', 'G', 'B', 'e'];

export function createFindNote({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-fn';
  el.dataset.ex = 'findnote';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read fn-read">
      <b class="fn-note">—</b>
      <span class="fn-side"><span class="fn-where"></span><span class="fn-heard"></span></span>
    </div>
    <div class="ex-panel">
      <div class="fn-prog" aria-hidden="true"></div>
      <ul class="fn-res"></ul>
      <div class="seg fn-notes" role="group" aria-label="${esc(words.notes)}"><span class="seg-l">${esc(words.notes)}</span><button type="button" data-n="natural">${esc(words.natural)}</button><button type="button" data-n="all">${esc(words.all)}</button></div>
      <div class="fn-strings" role="group" aria-label="${esc(words.string)}">
        <button type="button" data-s="-1">${esc(words.any)}</button>${SLABEL.map((n, i) => `<button type="button" data-s="${i}"><b>${n}</b></button>`).join('')}
      </div>
    </div>
    <button type="button" class="ex-alt fn-skip" hidden>${esc(words.skip)}</button>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const noteEl = $('.fn-note'), whereEl = $('.fn-where'), heardEl = $('.fn-heard'), progEl = $('.fn-prog'), resEl = $('.fn-res');
  const go = $('.ex-go'), skip = $('.fn-skip');
  const noteBtns = [...el.querySelectorAll('[data-n]')], strBtns = [...el.querySelectorAll('.fn-strings button')];

  let E = null, open = false;
  const cfg = loadPrefs(PREFS, { notes: 'natural', string: -1 });
  const P = () => profile().findNote;

  let running = false, paused = false, raf = 0, mic = null, wake = null;
  let target = null, shownAt = 0, holdUntil = 0;
  let streakNote = -1, streak = 0, streakStart = 0, lastCorrectPc = -1, lastWrongNote = -1;
  let lastSoundAt = 0, results = [], wrongCount = 0, activeMs = 0, lastFrame = 0, done = false;

  noteBtns.forEach((b) => b.addEventListener('click', () => { cfg.notes = b.dataset.n; savePrefs(PREFS, cfg); restart(); }));
  strBtns.forEach((b) => b.addEventListener('click', () => { cfg.string = +b.dataset.s; savePrefs(PREFS, cfg); restart(); }));
  go.addEventListener('click', () => (running ? stop() : start()));
  skip.addEventListener('click', () => { if (running && !paused && target) { results.push({ pc: target.pc, skipped: true }); next(); } });
  $('.ex-exit').addEventListener('click', () => director.exit());

  function restart() { const was = running; stop(); done = false; render(); if (was) start(); }

  async function start() {
    if (!E) return;
    try { mic = await openMic(4096); } catch { whereEl.textContent = words.denied; return; }
    if (!open) { mic.close(); mic = null; return; }
    audio.duck(true);
    wake = E.Pause.playDetector();
    running = true; paused = false; done = false;
    results = []; wrongCount = 0; activeMs = 0; lastCorrectPc = -1; target = null;
    resEl.innerHTML = '';
    lastFrame = lastSoundAt = performance.now();
    next();
    loop();
  }
  function closeMic() { if (mic) { mic.close(); mic = null; audio.duck(false); } }
  // Stop / leaving: what was done is saved as a partial round
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    closeMic();
    if (results.length) finish(true); else render();
  }

  function next() {
    if (results.length >= ROUND) { running = false; cancelAnimationFrame(raf); closeMic(); finish(false); return; }
    const pool = cfg.notes === 'all' ? [...Array(12).keys()] : NATURAL;
    let pc;
    do { pc = pool[Math.floor(Math.random() * pool.length)]; } while (target && pc === target.pc && pool.length > 1);
    target = { pc };
    shownAt = performance.now();
    holdUntil = 0; streak = 0; lastWrongNote = -1;
    setHeard('', '');
    const g = g3(); if (g) g.setLive(null);
    render();
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250);
    lastFrame = now;
    const buf = mic.read();
    if (paused) {
      if (wake.feed(buf, now)) { paused = false; lastSoundAt = now; next(); }
      raf = requestAnimationFrame(loop);
      return;
    }
    const loud = E.Sound.rms(buf) >= MIN_RMS;
    if (loud) lastSoundAt = now;
    if (now - lastSoundAt < 10000) activeMs += dt;
    if (now - lastSoundAt > E.Pause.AFTER_MS) { paused = true; wake.reset(); render(); raf = requestAnimationFrame(loop); return; }
    if (now >= holdUntil) {
      if (holdUntil) { holdUntil = 0; next(); } else listen(buf, loud, now);
    }
    raf = requestAnimationFrame(loop);
  }

  // where on the neck that note most likely was: on your string, else the lowest fret
  function place(midi) {
    if (cfg.string >= 0) { const f = midi - OPEN[cfg.string]; return f >= 0 && f <= 22 ? { s: cfg.string, f } : null; }
    let best = null;
    for (let s = 5; s >= 0; s--) { const f = midi - OPEN[s]; if (f >= 0 && f <= 22 && (!best || f < best.f)) best = { s, f }; }
    return best;
  }

  function listen(buf, loud, now) {
    const f = loud ? E.Sound.yin(buf, mic.sampleRate, 0.15) : null;
    if (!f) { streak = 0; streakNote = -1; return; }
    const m = 69 + 12 * Math.log2(f / 440);
    const n = Math.round(m);
    if (Math.abs(m - n) * 100 > P().cents) { streak = 0; streakNote = -1; return; }
    if (n === streakNote) streak++; else { streakNote = n; streak = 1; streakStart = now; }
    if (streak !== P().hold) return;
    const pc = ((n % 12) + 12) % 12;
    const g = g3(), at = place(n);
    if (pc === target.pc) {
      const sec = Math.max(0, (streakStart - shownAt) / 1000);
      results.push({ pc, sec });
      lastCorrectPc = pc;
      setHeard(`✓ ${sec.toFixed(1)} s`, 'ok');
      el.dataset.s = 'ok';
      holdUntil = now + 700;
      if (g && at) { g.setLive(at.s, at.f); g.pluck(at.s, 1, at.f); }
      bus.emit('flash', 0.35);
      renderProgress();
    } else if (pc !== lastCorrectPc && n !== lastWrongNote) {
      // (the note found last time may still be ringing — that doesn't count)
      lastWrongNote = n;
      wrongCount++;
      setHeard(`${words.thats} ${NAMES[pc]}`, 'off');
      if (g && at) g.pluck(at.s, 0.7, at.f);
    }
  }
  function setHeard(t, s) { heardEl.textContent = t; heardEl.dataset.s = s; }

  // ── result ──
  const modeKey = () => `${cfg.notes}|${cfg.string}`;
  function lastResult() {
    const l = readLog().filter((e) => e.exercise === 'find-note' && e.score && !e.score.partial && e.score.mode === modeKey());
    return l[l.length - 1] || null;
  }
  function finish(partial) {
    const found = results.filter((r) => !r.skipped);
    const skipped = results.length - found.length;
    const avg = found.length ? found.reduce((s, r) => s + r.sec, 0) / found.length : null;
    const where = cfg.string < 0 ? 'any string' : `${SNAME[cfg.string]} string`;
    const set = cfg.notes === 'all' ? 'all 12 notes' : 'natural notes';
    const prev = lastResult();
    if (found.length) {
      const a = avg.toFixed(1);
      addLog({
        exercise: 'find-note', title: 'Find the note',
        score: {
          avgSec: Number(a), found: found.length, notes: results.length, skipped, wrong: wrongCount, mode: modeKey(),
          times: results.map((r) => (r.skipped ? null : Number(r.sec.toFixed(2)))), ...(partial ? { partial: true } : {}),
        },
        summary: `avg ${a} s${prev ? ` (prev ${prev.score.avgSec})` : ''} · ${found.length}/${results.length} · ${where}, ${set}${partial ? ' · partial' : ''}`,
        activeSec: Math.max(1, Math.round(activeMs / 1000)),
      });
    }
    done = true; target = null;
    noteEl.textContent = avg === null ? '—' : `${avg.toFixed(1)}s`;
    el.dataset.s = avg === null ? '' : 'ok';
    whereEl.textContent = avg === null ? words.nothing : `${words.average} · ${found.length} / ${results.length}${partial ? ` · ${words.stoppedEarly}` : ''}`;
    setHeard(prev && avg !== null ? (avg < prev.score.avgSec ? `${words.faster} (${prev.score.avgSec} s)` : `${words.lastTime} ${prev.score.avgSec} s`)
      : avg !== null ? words.baseline : '', '');
    const lines = [];
    const sorted = found.slice().sort((a, b) => b.sec - a.sec);
    if (sorted.length >= 3) lines.push(`${words.slowest}: ${sorted.slice(0, 2).map((r) => `${NAMES[r.pc]} ${r.sec.toFixed(1)} s`).join(' · ')}`);
    if (sorted.length) lines.push(`${words.fastest}: ${NAMES[sorted[sorted.length - 1].pc]} ${sorted[sorted.length - 1].sec.toFixed(1)} s`);
    if (wrongCount) lines.push(`${wrongCount} ${words.wrongNotes}`);
    if (skipped) lines.push(`${skipped} ${words.skipped}`);
    resEl.innerHTML = lines.map((t) => `<li>${esc(t)}</li>`).join('');
    renderControls();
    if (avg !== null) bus.emit('flash', 0.5);
  }

  // ── drawing ──
  const g3 = () => getStage()?.guitar;
  function render() {
    renderControls();
    paint3D();
    el.classList.remove('is-blank');
    if (!running) {
      if (!done) {
        noteEl.textContent = '—'; el.dataset.s = ''; el.classList.add('is-blank');
        whereEl.textContent = words.idle; setHeard('', ''); progEl.innerHTML = ''; resEl.innerHTML = '';
      }
      return;
    }
    resEl.innerHTML = '';
    if (paused) { noteEl.textContent = words.paused; el.dataset.s = 'paused'; whereEl.textContent = words.pausedSub; setHeard('', ''); return; }
    el.dataset.s = '';
    noteEl.textContent = NAMES[target.pc];
    whereEl.textContent = cfg.string < 0 ? words.anywhere : `${words.onThe} ${SNAME[cfg.string]} ${words.stringWord}`;
    renderProgress();
  }
  function renderProgress() {
    let h = '';
    for (let i = 0; i < ROUND; i++) { const r = results[i]; h += `<i class="${r ? (r.skipped ? 'bad' : 'ok') : i === results.length ? 'now' : ''}"></i>`; }
    progEl.innerHTML = h;
  }
  function renderControls() {
    noteBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.n === cfg.notes));
    strBtns.forEach((b) => b.classList.toggle('is-on', +b.dataset.s === cfg.string));
    go.textContent = running ? words.stop : done ? words.again : words.start;
    el.classList.toggle('is-listening', running);
    el.classList.toggle('is-done', done && !running);
    skip.hidden = !running || paused;
  }
  // the chosen string stays bright, the others dim
  function paint3D() {
    const g = g3();
    if (!g || !open) return;
    for (let i = 0; i < 6; i++) g.setTint(i, cfg.string >= 0 && i !== cfg.string ? 'dim' : null);
  }

  bus.on('ex:enter', (n) => {
    if (n !== 'findnote') return;
    open = true; done = false;
    el.classList.add('is-open');
    const g = g3(); if (g) g.setChord(null);
    loadEngine().then((eng) => { E = eng; if (open) render(); }).catch(() => { whereEl.textContent = words.failed; });
    render();
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'findnote') return;
    stop(); open = false;
    el.classList.remove('is-open');
    const g = g3();
    if (g) { for (let i = 0; i < 6; i++) g.setTint(i, null); g.setLive(null); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  return { el };
}
