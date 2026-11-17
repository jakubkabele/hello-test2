// EX-04 RHYTHM — runs inside the 3D world, over the strings where the pick hits them.
//
// A bar of 4 beats is split into 8 slots: 1 & 2 & 3 & 4 &. A pattern says which slots get a
// strum (↓ on the beats, ↑ on the "and"s). A metronome ticks for one minute.
// How it hears (plain words, same as before): the strum detector (timing.js) finds the exact
// moment each strum starts — a sudden jump in loudness / pick brightness that keeps ringing —
// minus your phone's delay (calibration). Each strum goes to the nearest slot: a pattern slot
// → on time / early / late (ms); an empty slot → extra. Pattern slots with no strum → missed.
// It can't tell down from up — only when. Score = % on time. 20 s of silence pauses.
// In the world: every strum you play shakes the 3D strings; the window pulses on the beat.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { loadEngine, openMic, playClick, profile, addLog, readLog, loadPrefs, savePrefs } from './ear.js';

const PREFS = 'practice.rhythm.settings';         // shared with the old screen
const ROUND_SEC = 60;
const COUNT_IN = 4;
const SHOW_RANGE = 0.2;
const PATTERNS = [
  { id: 'halves', name: 'Half notes', slots: 'D---D---' },
  { id: 'quarters', name: 'Quarters', slots: 'D-D-D-D-' },
  { id: 'eighths', name: 'Eighths', slots: 'DUDUDUDU' },
  { id: 'pop', name: 'Pop', slots: 'D-DU-UDU' },
];
const COUNT = ['1', '&', '2', '&', '3', '&', '4', '&'];
const arrow = (c) => (c === 'D' ? '↓' : c === 'U' ? '↑' : '·');

export function createRhythm({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-rh';
  el.dataset.ex = 'rhythm';
  el.dataset.view = 'setup';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>

    <div class="rh-v rh-setup">
      <div class="ex-read rh-read"><b class="rh-pname"></b><span class="rh-parrows"></span><span class="rh-last"></span></div>
      <div class="ex-panel">
        <div class="rh-pats">${PATTERNS.map((p) => `<button type="button" data-p="${p.id}"><b>${esc(p.name)}</b><span>${p.slots.split('').map(arrow).join(' ')}</span></button>`).join('')}</div>
        <div class="dr-row">
          <div class="step"><button type="button" class="rh-minus" aria-label="Slower">−</button><b><span class="rh-bpm">70</span><small>BPM</small></b><button type="button" class="rh-plus" aria-label="Faster">+</button></div>
          <button type="button" class="tog rh-recal"></button>
        </div>
      </div>
    </div>

    <div class="rh-v rh-run">
      <div class="ex-read rh-read">
        <span class="dr-meta"><b class="rh-time">1:00</b><span class="rh-pct"></span></span>
        <b class="rh-big"></b>
      </div>
      <div class="ex-panel">
        <div class="rh-slots" aria-hidden="true"></div>
        <p class="dr-status rh-status"></p>
        <div class="dr-tl" aria-hidden="true"><i class="dr-tl-zone"></i><i class="dr-tl-mid"></i><i class="dr-tl-dot" hidden></i><span>${esc(words.early)}</span><span>${esc(words.late)}</span></div>
        <p class="rh-counts"></p>
      </div>
      <div class="dr-paused">
        <i class="alert-stripes"></i>
        <div class="dr-p-in">
          <b class="dr-p-big">${esc(words.paused)}</b>
          <p class="dr-p-text">${esc(words.pausedText)}</p>
          <div class="dr-p-btns"><button type="button" class="rh-end">${esc(words.endSave)}</button></div>
        </div>
        <i class="alert-stripes"></i>
      </div>
    </div>

    <div class="rh-v rh-sum">
      <div class="ex-read"><b class="dr-big rh-sum-big">0</b><span class="dr-unit">${esc(words.onTime)}</span></div>
      <div class="ex-panel">
        <p class="dr-sum-pair rh-sum-name"></p>
        <p class="dr-compare rh-compare"></p>
        <ul class="dr-details rh-details"></ul>
      </div>
    </div>

    <button type="button" class="ex-alt dr-alt rh-alt" hidden></button>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const go = $('.ex-go'), alt = $('.rh-alt');
  const patBtns = [...el.querySelectorAll('[data-p]')];

  let E = null, open = false, view = 'setup';
  const cfg = loadPrefs(PREFS, { pattern: 'quarters', bpm: 70 });
  const patternOf = (id) => PATTERNS.find((p) => p.id === id) || PATTERNS[1];
  const P = () => profile().rhythm;
  const g3 = () => getStage()?.guitar;

  function setView(v) {
    view = v; el.dataset.view = v;
    alt.hidden = v !== 'summary';
    alt.textContent = words.setup;
    go.textContent = v === 'setup' ? `${words.start} · 1 min` : v === 'summary' ? words.again : running && paused ? words.resume : words.stop;
  }

  // ── setup ──
  patBtns.forEach((b) => b.addEventListener('click', () => { cfg.pattern = b.dataset.p; savePrefs(PREFS, cfg); renderSetup(); }));
  $('.rh-minus').addEventListener('click', () => { cfg.bpm = Math.max(40, cfg.bpm - 5); savePrefs(PREFS, cfg); renderSetup(); });
  $('.rh-plus').addEventListener('click', () => { cfg.bpm = Math.min(140, cfg.bpm + 5); savePrefs(PREFS, cfg); renderSetup(); });
  $('.rh-recal').addEventListener('click', () => bus.emit('calibrate', 'rhythm'));
  function renderSetup() {
    const p = patternOf(cfg.pattern);
    patBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.p === p.id));
    $('.rh-pname').textContent = p.name;
    $('.rh-parrows').textContent = p.slots.split('').map(arrow).join(' ');
    $('.rh-bpm').textContent = cfg.bpm;
    const prev = lastResult(p.id, cfg.bpm);
    $('.rh-last').textContent = prev ? `${words.lastTime} ${prev.score.onTimePct}% @ ${cfg.bpm}` : words.newOne;
    const off = E ? E.Timing.offset() : null;
    $('.rh-recal').textContent = off === null ? words.calibrate : `${words.delay} ${Math.round(off * 1000)} ms`;
    $('.rh-recal').classList.toggle('is-warn', off === null);
  }
  function lastResult(id, bpm) {
    const l = readLog().filter((e) => e.exercise === 'rhythm' && e.score && !e.score.partial && e.score.pattern === id && e.score.bpm === bpm);
    return l[l.length - 1] || null;
  }

  // ── run ──
  let running = false, paused = false, raf = 0, mic = null, ctx = null, wake = null, strums = null;
  let pat = null, bpm = 70, beatDur = 1, slotDur = 0.5, barLen = 4, nBars = 15;
  let baseBar = 0, firstBeat = 0, roundStart = 0, nextBeat = 0, totalBeats = 0;
  let delay = 0, lastPlayedAt = 0, lastPlayedBar = -1, lastBeatLit = -1;
  let hits = [], extras = [];
  const clicks = [];

  go.addEventListener('click', () => {
    if (!E) return;
    if (view === 'setup' || view === 'summary') newRound();
    else if (view === 'run') { if (paused) begin(); else stop(); }
  });
  alt.addEventListener('click', () => { setView('setup'); renderSetup(); });
  $('.rh-end').addEventListener('click', () => stop());
  $('.ex-exit').addEventListener('click', () => director.exit());

  async function newRound() {
    try { mic = await openMic(32768); } catch { $('.rh-last').textContent = words.denied; return; }
    if (!open) { mic.close(); mic = null; return; }
    ctx = mic.ctx;
    audio.duck(true);
    wake = E.Pause.playDetector();
    pat = patternOf(cfg.pattern);
    bpm = cfg.bpm; beatDur = 60 / bpm; slotDur = beatDur / 2; barLen = beatDur * 4;
    nBars = Math.max(2, Math.round(ROUND_SEC / barLen));
    hits = []; extras = [];
    for (let b = 0; b < nBars; b++) for (let s = 0; s < 8; s++) if (pat.slots[s] !== '-') hits.push({ bar: b, slot: s, t: 0, status: null, err: null });
    lastPlayedBar = -1;
    delay = E.Timing.offset() ?? E.Timing.estimate(ctx);
    drawSlots();
    begin();
  }
  // (re)start the clock: count-in, then carry on from the bar after the last one played
  function begin() {
    baseBar = lastPlayedBar + 1;
    firstBeat = ctx.currentTime + 0.4;
    roundStart = firstBeat + COUNT_IN * beatDur;
    nextBeat = 0;
    totalBeats = COUNT_IN + (nBars - baseBar) * 4;
    hits.forEach((h) => { if (h.bar >= baseBar) { h.status = null; h.err = null; } h.t = barStart(h.bar) + h.slot * slotDur; });
    extras = extras.filter((e) => e.bar < baseBar);
    strums = E.Timing.strumDetector(mic.sampleRate);
    lastPlayedAt = roundStart; lastBeatLit = -1;
    running = true; paused = false;
    el.classList.remove('is-paused');
    setView('run');
    setStatus('', '');
    showMark(null);
    renderCounts();
    cancelAnimationFrame(raf);
    loop();
  }
  const barStart = (b) => roundStart + (b - baseBar) * barLen;

  function loop() {
    if (!running) return;
    const now = ctx.currentTime;
    const buf = mic.read();
    if (paused) {
      if (wake.feed(buf, performance.now())) begin();
      else raf = requestAnimationFrame(loop);
      return;
    }
    while (nextBeat < totalBeats && firstBeat + nextBeat * beatDur < now + 0.2) {
      const inRound = nextBeat - COUNT_IN;
      playClick(ctx, firstBeat + nextBeat * beatDur, nextBeat === 0 || (inRound >= 0 && inRound % 4 === 0), clicks);
      nextBeat++;
    }
    const t = strums.feed(buf, now);
    if (t !== null) onStrum(t, now);
    hits.forEach((h) => { if (!h.status && h.bar >= baseBar && now > h.t + delay + slotDur / 2 + 0.3) { h.status = 'missed'; renderCounts(); } });
    if (now - lastPlayedAt > E.Pause.AFTER_SEC) { pause(); return; }
    render(now);
    if (now > barStart(nBars) + delay + 0.6) { finish(false); return; }
    raf = requestAnimationFrame(loop);
  }

  function onStrum(t, now) {
    lastPlayedAt = now;
    const g = g3(); if (g) for (let s = 0; s < 6; s++) g.pluck(s, 0.9, 0);
    const played = t - delay;
    const k = Math.round((played - roundStart) / slotDur);
    if (k < 0) return;
    const bar = baseBar + Math.floor(k / 8), slot = k % 8;
    if (bar >= nBars) return;
    const err = played - (barStart(bar) + slot * slotDur);
    lastPlayedBar = Math.max(lastPlayedBar, bar);
    const h = hits.find((x) => x.bar === bar && x.slot === slot);
    const ms = Math.round(Math.abs(err) * 1000);
    if (h && !h.status) {
      h.status = Math.abs(err) <= P().timing / 1000 ? 'ok' : err < 0 ? 'early' : 'late';
      h.err = err;
      const a = arrow(pat.slots[slot]);
      setStatus(h.status === 'ok' ? `${a} ${words.onTimeShort}${ms >= 15 ? ` · ${ms} ms ${err < 0 ? words.early : words.late}` : ''}` : `${a} ${h.status} · ${ms} ms`, h.status === 'ok' ? 'ok' : 'meh');
      showMark(h);
    } else {
      extras.push({ bar });
      setStatus(`${words.extra} “${COUNT[slot]}”`, 'bad');
    }
    renderCounts();
  }
  function setStatus(t, c) { const s = $('.rh-status'); s.textContent = t; s.className = `dr-status rh-status ${c}`; }

  function pause() {
    paused = true;
    clicks.slice().forEach((c) => { try { c.stop(); } catch { /* done */ } });
    clicks.length = 0;
    hits.forEach((h) => { if (h.bar > lastPlayedBar) { h.status = null; h.err = null; } });
    extras = extras.filter((e) => e.bar <= lastPlayedBar);
    wake.reset();
    el.classList.add('is-paused');
    go.textContent = words.resume;
    $('.rh-end').hidden = lastPlayedBar < 1;
    renderCounts();
    raf = requestAnimationFrame(loop);
  }
  // Stop / leaving: save what was played
  function stop() {
    if (!running) return;
    if (!paused) lastPlayedBar = Math.min(lastPlayedBar, Math.floor((ctx.currentTime - delay - roundStart) / barLen) + baseBar - 1);
    finish(true);
  }

  function render(now) {
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const big = $('.rh-big');
    const secs = Math.ceil(Math.max(0, barStart(nBars) - Math.max(v, roundStart)));
    $('.rh-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const slotEls = $('.rh-slots').children;
    const beatNo = Math.floor((v - firstBeat) / beatDur);
    if (v < roundStart) {
      big.textContent = v < firstBeat ? '' : String(Math.min(COUNT_IN, Math.ceil((roundStart - v) / beatDur)));
      el.classList.remove('is-hit');
      [...slotEls].forEach((s) => s.classList.remove('now', 'flash'));
    } else {
      const k = Math.floor((v - roundStart) / slotDur);
      const bar = baseBar + Math.floor(k / 8), slot = k % 8;
      const inSlot = (v - roundStart) / slotDur - k;
      const isHit = pat.slots[slot] !== '-';
      if (big.textContent !== COUNT[slot]) big.textContent = COUNT[slot];
      el.classList.toggle('is-hit', isHit && inSlot < 0.5);
      [...slotEls].forEach((s, i) => {
        s.classList.toggle('now', i === slot);
        s.classList.toggle('flash', i === slot && isHit && inSlot < 0.5);
        const h = hits.find((x) => x.bar === bar && x.slot === i);
        s.dataset.st = h && h.status ? h.status : '';
      });
    }
    if (v >= firstBeat && beatNo !== lastBeatLit) { lastBeatLit = beatNo; bus.emit('flash', (beatNo - COUNT_IN) % 4 === 0 ? 0.22 : 0.1); }
  }
  function drawSlots() {
    $('.rh-slots').innerHTML = pat.slots.split('').map((c, i) => `<div class="rh-slot${c === '-' ? ' rest' : ''}"><b>${arrow(c)}</b><span>${COUNT[i]}</span></div>`).join('');
  }
  function tally(upTo = Infinity) {
    const hs = hits.filter((h) => h.bar <= upTo && h.status);
    const c = (s) => hs.filter((h) => h.status === s).length;
    return { judged: hs.length, ok: c('ok'), early: c('early'), late: c('late'), missed: c('missed'), extra: extras.filter((e) => e.bar <= upTo).length };
  }
  function renderCounts() {
    const t = tally();
    $('.rh-counts').innerHTML = `<span class="ok">${t.ok} ${words.onTimeShort}</span><span>${t.early} ${words.early}</span><span>${t.late} ${words.late}</span><span class="bad">${t.missed} ${words.missed}</span><span class="bad">${t.extra} ${words.extraShort}</span>`;
    $('.rh-pct').textContent = t.judged ? `${Math.round((t.ok / t.judged) * 100)}%` : '';
  }
  function showMark(h) {
    const tol = P().timing / 1000;
    const zone = $('.dr-tl-zone'), dot = $('.dr-tl-dot');
    zone.style.left = `${50 - (tol / SHOW_RANGE) * 50}%`;
    zone.style.width = `${(tol / SHOW_RANGE) * 100}%`;
    if (!h) { dot.hidden = true; return; }
    dot.hidden = false;
    dot.style.left = `${50 + Math.max(-1, Math.min(1, h.err / SHOW_RANGE)) * 50}%`;
    dot.className = `dr-tl-dot ${h.status === 'ok' ? 'ok' : 'meh'}`;
  }

  function finish(partial) {
    running = false; paused = false;
    cancelAnimationFrame(raf);
    clicks.slice().forEach((c) => { try { c.stop(); } catch { /* done */ } });
    clicks.length = 0;
    if (mic) { mic.close(); mic = null; audio.duck(false); }
    el.classList.remove('is-paused', 'is-hit');
    const upTo = partial ? lastPlayedBar : nBars - 1;
    if (partial) hits.forEach((h) => { if (h.bar <= upTo && !h.status) h.status = 'missed'; });
    const t = tally(upTo);
    const bars = upTo + 1;
    if (bars < 2 || !t.judged) { setView('setup'); renderSetup(); return; }
    const pct = Math.round((t.ok / t.judged) * 100);
    const errs = hits.filter((h) => h.bar <= upTo && h.err !== null).map((h) => h.err).sort((a, b) => a - b);
    const med = errs.length ? errs[Math.floor(errs.length / 2)] : 0;
    const spread = errs.length ? errs.map((e) => Math.abs(e - med)).sort((a, b) => a - b)[Math.floor(errs.length / 2)] : 0;
    const timingMs = Math.round(med * 1000), spreadMs = Math.round(spread * 1000);
    const activeSec = Math.round(bars * barLen);
    const prev = lastResult(pat.id, bpm);
    addLog({
      exercise: 'rhythm', title: 'Rhythm',
      score: { onTimePct: pct, strums: t.judged, onTime: t.ok, early: t.early, late: t.late, missed: t.missed, extra: t.extra, timingMs, spreadMs, bpm, pattern: pat.id, ...(partial ? { partial: true } : {}) },
      summary: `${pat.name} @ ${bpm} BPM: ${pct}% on time (avg ${timingMs > 0 ? '+' : ''}${timingMs} ms)${prev ? ` (prev ${prev.score.onTimePct}%)` : ''}${partial ? ' · partial' : ''}`,
      activeSec,
    });
    setView('summary');
    $('.rh-sum-big').textContent = `${pct}%`;
    $('.rh-sum-name').textContent = `${pat.name} · ${bpm} BPM`;
    $('.rh-compare').textContent = partial ? `${words.partial} (${activeSec} s)` : prev ? (pct > prev.score.onTimePct ? `${words.upFrom} ${prev.score.onTimePct}%` : `${words.lastTime} ${prev.score.onTimePct}%`) : words.baseline;
    const lines = [`${t.ok} / ${t.judged} ${words.onTimeShort} (±${P().timing} ms)`];
    lines.push(Math.abs(timingMs) <= 15 ? `Timing: on the click (${timingMs > 0 ? '+' : ''}${timingMs} ms)` : `Timing: ${Math.abs(timingMs)} ms ${timingMs > 0 ? 'behind' : 'ahead of'} the click`);
    lines.push(`Steadiness: ±${spreadMs} ms${spreadMs <= 25 ? ' — very steady' : spreadMs <= 50 ? '' : ' — try slower'}`);
    if (t.missed) lines.push(`${t.missed} ${words.missed}`);
    if (t.extra) lines.push(`${t.extra} ${words.extraShort}`);
    if (!partial && pct >= 90) lines.push(`Solid — try ${Math.min(140, bpm + 5)} BPM next.`);
    $('.rh-details').innerHTML = lines.map((x) => `<li>${esc(x)}</li>`).join('');
    bus.emit('flash', 0.5);
  }

  bus.on('ex:enter', (n) => {
    if (n !== 'rhythm') return;
    open = true;
    el.classList.add('is-open');
    const g = g3(); if (g) g.setChord(null);
    if (view === 'run') setView('setup');
    renderSetup();
    loadEngine().then((eng) => { E = eng; if (open) renderSetup(); }).catch(() => { $('.rh-last').textContent = words.failed; });
  });
  bus.on('ex:leave', (n) => { if (n !== 'rhythm') return; stop(); open = false; el.classList.remove('is-open'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  return { el };
}
