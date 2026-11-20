// EX-04 KEEP TIME — can you hold a steady beat on your own?
//
// The click plays 4 beats (just listen), then 8 more (strum along on every beat), then it goes
// quiet and you keep strumming on every beat for 30 seconds. No judging against the click:
//
// How it hears (plain words):
// • The strum detector (timing.js) notes WHEN each strum starts. Two "strums" closer than a third
//   of a beat are one strum heard twice — merged. A gap of about two beats = one missed strum.
// • Your strums are compared only with EACH OTHER: from the strums just around it we work out
//   where each strum "should" have landed if you were perfectly even; how far it was off = your
//   steadiness. The phone's delay is the same for every strum, so it cancels out completely.
// • Your tempo at the start of the quiet part vs. the end shows whether you rush or drag.
// Score = % of strums within ± the sensitivity's ms of your own even beat.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { loadEngine, openMic, playClick, profile, addLog, readLog, loadPrefs, savePrefs } from './ear.js';

const PREFS = 'practice.keeptime.settings';
const LISTEN = 4, ALONG = 8, ALONE_SEC = 30;

export function createKeepTime({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-kt';
  el.dataset.ex = 'keeptime';
  el.dataset.view = 'setup';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>

    <div class="kt-v kt-setup">
      <div class="ex-read"><b class="kt-bpmbig"></b><span class="kt-how">${esc(words.how)}</span><span class="kt-last"></span></div>
      <div class="ex-panel">
        <div class="kt-steps" aria-hidden="true"><span><b>4</b>${esc(words.s1)}</span><span><b>8</b>${esc(words.s2)}</span><span><b>30 s</b>${esc(words.s3)}</span></div>
        <div class="step"><button type="button" class="kt-minus" aria-label="Slower">−</button><b><span class="kt-bpm">70</span><small>BPM</small></b><button type="button" class="kt-plus" aria-label="Faster">+</button></div>
      </div>
    </div>

    <div class="kt-v kt-run">
      <div class="ex-read">
        <span class="dr-meta"><b class="kt-phase"></b><span class="kt-left"></span></span>
        <b class="kt-big"></b><span class="kt-sub"></span>
      </div>
      <div class="ex-panel">
        <div class="kt-dots" aria-hidden="true"></div>
        <p class="dr-status kt-status"></p>
      </div>
    </div>

    <div class="kt-v kt-sum">
      <div class="ex-read"><b class="dr-big kt-score">0</b><span class="dr-unit">${esc(words.steadyUnit)}</span></div>
      <div class="ex-panel">
        <p class="dr-sum-pair kt-sum-name"></p>
        <p class="dr-compare kt-compare"></p>
        <ul class="dr-details kt-details"></ul>
      </div>
    </div>

    <button type="button" class="ex-alt dr-alt kt-alt" hidden>${esc(words.setup)}</button>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const go = $('.ex-go'), alt = $('.kt-alt');

  let E = null, open = false, view = 'setup';
  const cfg = loadPrefs(PREFS, { bpm: 70 });
  const tolMs = () => profile().rhythm.timing;
  const g3 = () => getStage()?.guitar;

  function setView(v) {
    view = v; el.dataset.view = v;
    alt.hidden = v !== 'summary';
    go.textContent = v === 'setup' ? words.start : v === 'summary' ? words.again : words.stop;
  }

  // ── setup ──
  $('.kt-minus').addEventListener('click', () => { cfg.bpm = Math.max(40, cfg.bpm - 5); savePrefs(PREFS, cfg); renderSetup(); });
  $('.kt-plus').addEventListener('click', () => { cfg.bpm = Math.min(160, cfg.bpm + 5); savePrefs(PREFS, cfg); renderSetup(); });
  // Today's session hands over a tempo
  bus.on('keeptime:load', ({ bpm }) => { if (bpm) { cfg.bpm = bpm; savePrefs(PREFS, cfg); renderSetup(); } });
  function renderSetup() {
    $('.kt-bpm').textContent = cfg.bpm;
    $('.kt-bpmbig').innerHTML = `${cfg.bpm}<small>BPM</small>`;
    const last = lastResult(cfg.bpm);
    $('.kt-last').textContent = last ? `${words.lastTime} ${last.score.steadyPct}% · ±${last.score.spreadMs} ms` : words.newOne;
  }
  function lastResult(bpm) {
    const l = readLog().filter((e) => e.exercise === 'keep-time' && e.score && e.score.bpm === bpm);
    return l[l.length - 1] || null;
  }

  // ── the round ──
  let running = false, raf = 0, mic = null, ctx = null, strums = null;
  let T = 0.857, firstBeat = 0, aloneAt = 0, endAt = 0, onsets = [], lastShown = -1;
  const clicks = [];

  go.addEventListener('click', () => {
    if (!E) return;
    if (view === 'run') stop(); else start();
  });
  alt.addEventListener('click', () => { setView('setup'); renderSetup(); });
  $('.ex-exit').addEventListener('click', () => director.exit());

  async function start() {
    try { mic = await openMic(32768); } catch { $('.kt-last').textContent = words.denied; return; }
    if (!open) { mic.close(); mic = null; return; }
    ctx = mic.ctx;
    audio.duck(true);
    strums = E.Timing.strumDetector(mic.sampleRate);
    T = 60 / cfg.bpm;
    firstBeat = ctx.currentTime + 0.5;
    for (let i = 0; i < LISTEN + ALONG; i++) playClick(ctx, firstBeat + i * T, i % 4 === 0, clicks);
    aloneAt = firstBeat + (LISTEN + ALONG) * T;
    endAt = aloneAt + ALONE_SEC;
    onsets = []; lastShown = -1;
    running = true;
    setView('run');
    $('.kt-dots').innerHTML = '';
    setStatus('', '');
    loop();
  }
  function stopClicks() { clicks.slice().forEach((c) => { try { c.stop(); } catch { /* done */ } }); clicks.length = 0; }
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    stopClicks();
    if (mic) { mic.close(); mic = null; audio.duck(false); }
    setView('setup'); renderSetup();
  }

  function loop() {
    if (!running) return;
    const now = ctx.currentTime;
    const t = strums.feed(mic.read(), now);
    if (t !== null && t > firstBeat + (LISTEN - 0.5) * T) onStrum(t);
    render(now);
    if (now >= endAt + 0.4) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }

  function onStrum(t) {
    const last = onsets[onsets.length - 1];
    if (last !== undefined && t - last < T * 0.35) return;          // the same strum heard twice
    onsets.push(t);
    const g = g3(); if (g) for (let s = 0; s < 6; s++) g.pluck(s, 0.85, 0);
    if (t < aloneAt) { bus.emit('flash', 0.12); return; }
    // live: where should this strum have landed, judging by your last few?
    const recent = beatsOf(onsets.filter((x) => x >= aloneAt - T * 4));
    if (recent.length < 4) { addDot(null); bus.emit('flash', 0.12); return; }
    const k = recent.length - 1;
    const prevPts = recent.slice(Math.max(0, k - 5), k);
    const fit = line(prevPts);
    const dev = (t - (fit.a + fit.b * recent[k].beat)) * 1000;
    const ok = Math.abs(dev) <= tolMs();
    addDot(ok);
    bus.emit('flash', ok ? 0.2 : 0.08);
    const bpmNow = 60 / fit.b;
    $('.kt-big').textContent = Math.round(bpmNow);
    const diff = Math.round(bpmNow - cfg.bpm);
    setStatus(ok ? `${words.steady}${Math.abs(dev) >= 15 ? ` · ${Math.round(Math.abs(dev))} ms ${dev < 0 ? words.early : words.late}` : ''}`
      : `${Math.round(Math.abs(dev))} ms ${dev < 0 ? words.early : words.late}`, ok ? 'ok' : 'meh');
    $('.kt-sub').textContent = Math.abs(diff) <= 2 ? `${words.onTempo} (${cfg.bpm})` : diff > 0 ? `${words.rushing} +${diff}` : `${words.dragging} ${diff}`;
  }

  // strum times → { beat, t } with beat numbers: a gap of ~2 beats = one missed strum
  function beatsOf(list) {
    const out = [];
    let b = 0;
    list.forEach((t, i) => {
      if (i) b += Math.max(1, Math.round((t - list[i - 1]) / T));
      out.push({ beat: b, t });
    });
    return out;
  }
  // straight line t = a + b·beat through some points (least squares)
  function line(pts) {
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.beat, 0) / n, my = pts.reduce((s, p) => s + p.t, 0) / n;
    let sxy = 0, sxx = 0;
    pts.forEach((p) => { sxy += (p.beat - mx) * (p.t - my); sxx += (p.beat - mx) ** 2; });
    const b = sxx ? sxy / sxx : T;
    return { a: my - b * mx, b };
  }

  function render(now) {
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const beat = Math.floor((v - firstBeat) / T);
    const phase = v < firstBeat ? 'listen' : beat < LISTEN ? 'listen' : v < aloneAt ? 'along' : 'alone';
    el.dataset.phase = phase;
    $('.kt-phase').textContent = phase === 'listen' ? words.pListen : phase === 'along' ? words.pAlong : words.pAlone;
    if (phase === 'alone') {
      const left = Math.max(0, Math.ceil(endAt - v));
      $('.kt-left').textContent = `0:${String(left).padStart(2, '0')}`;
      if (!$('.kt-big').textContent || onsets.filter((x) => x >= aloneAt).length < 4) { $('.kt-big').textContent = words.go; $('.kt-sub').textContent = words.keepGoing; }
    } else {
      $('.kt-left').textContent = '';
      const n = phase === 'listen' ? Math.max(1, LISTEN - Math.max(0, beat)) : LISTEN + ALONG - beat;
      if (beat !== lastShown) {
        lastShown = beat;
        if (v >= firstBeat) bus.emit('flash', 0.1);
        $('.kt-big').textContent = String(Math.max(1, n));
        $('.kt-sub').textContent = phase === 'listen' ? words.subListen : words.subAlong;
      }
    }
  }
  function addDot(ok) {
    const d = $('.kt-dots');
    const i = document.createElement('i');
    i.className = ok === null ? '' : ok ? 'ok' : 'meh';
    d.appendChild(i);
    while (d.children.length > 40) d.firstChild.remove();
  }
  function setStatus(t, c) { const s = $('.kt-status'); s.textContent = t; s.className = `dr-status kt-status ${c}`; }

  // ── result ──
  function finish() {
    running = false;
    cancelAnimationFrame(raf);
    stopClicks();
    if (mic) { mic.close(); mic = null; audio.duck(false); }
    const alone = onsets.filter((t) => t >= aloneAt - T * 0.3);
    const pts = beatsOf(alone);
    if (pts.length < 8) { setView('setup'); renderSetup(); $('.kt-last').textContent = words.tooFew; return; }
    const tol = tolMs();
    // steadiness: each strum vs. the even line through its neighbours (4 each side)
    const devs = pts.map((p, i) => {
      const nb = pts.slice(Math.max(0, i - 4), i + 5).filter((q) => q !== p);
      const f = line(nb);
      return (p.t - (f.a + f.b * p.beat)) * 1000;
    });
    const abs = devs.map(Math.abs).sort((a, b) => a - b);
    const spreadMs = Math.round(abs[Math.floor(abs.length / 2)]);
    const steadyPct = Math.round((devs.filter((d) => Math.abs(d) <= tol).length / devs.length) * 100);
    const tempoOf = (list) => (list.length >= 3 ? 60 / line(list).b : null);
    const startBpm = Math.round(tempoOf(pts.slice(0, 8)));
    const endBpm = Math.round(tempoOf(pts.slice(-8)));
    const drift = endBpm - startBpm;
    const missed = pts[pts.length - 1].beat + 1 - pts.length;
    const prev = lastResult(cfg.bpm);
    const driftTxt = drift >= 3 ? words.rushed : drift <= -3 ? words.dragged : words.held;
    addLog({
      exercise: 'keep-time', title: 'Keep time',
      score: { bpm: cfg.bpm, steadyPct, spreadMs, startBpm, endBpm, drift, strums: pts.length, missed },
      summary: `Keep time @ ${cfg.bpm}: ${steadyPct}% steady (±${spreadMs} ms), ${startBpm}→${endBpm} BPM${prev ? ` (prev ${prev.score.steadyPct}%)` : ''}`,
      activeSec: Math.round((LISTEN + ALONG) * T + ALONE_SEC),
    });
    setView('summary');
    $('.kt-score').textContent = `${steadyPct}%`;
    $('.kt-sum-name').textContent = `${cfg.bpm} BPM · ${pts.length} ${words.strums}`;
    $('.kt-compare').textContent = prev ? (steadyPct > prev.score.steadyPct ? `${words.upFrom} ${prev.score.steadyPct}%` : `${words.lastTime} ${prev.score.steadyPct}%`) : words.baseline;
    const lines = [
      `${words.evenness}: ±${spreadMs} ms${spreadMs <= 20 ? ` — ${words.verySteady}` : spreadMs > 50 ? ` — ${words.trySlower}` : ''}`,
      `${words.tempo}: ${startBpm} → ${endBpm} BPM · ${driftTxt}`,
      `${words.startedAt} ${startBpm} BPM (${words.click} ${cfg.bpm})`,
    ];
    if (missed > 0) lines.push(missed === 1 ? words.missedOne : `${missed} ${words.missedBeats}`);
    if (steadyPct >= 90 && Math.abs(drift) < 3) lines.push(`${words.solid} ${Math.min(160, cfg.bpm + 5)} BPM`);
    $('.kt-details').innerHTML = lines.map((x) => `<li>${esc(x)}</li>`).join('');
    bus.emit('flash', 0.5);
  }

  bus.on('ex:enter', (n) => {
    if (n !== 'keeptime') return;
    open = true;
    el.classList.add('is-open');
    const g = g3(); if (g) g.setChord(null);
    if (view === 'run') setView('setup');
    renderSetup();
    loadEngine().then((eng) => { E = eng; }).catch(() => { $('.kt-last').textContent = words.failed; });
  });
  bus.on('ex:leave', (n) => { if (n !== 'keeptime') return; stop(); open = false; el.classList.remove('is-open'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  return { el };
}
