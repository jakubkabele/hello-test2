// EX-03 CHORD CHANGES — no metronome, no beat: play the chord on screen, and the moment it is
// heard the next one comes up. One minute: how many changes, how fast, how clean.
//
// How it hears (plain words):
// 1. The strum detector (timing.js) notices a strum starting — a jump in loudness / pick
//    brightness that keeps ringing.
// 2. ~0.35 s of the sound right after it goes to the chord engine (chords.js) with ONE question:
//    "is this the chord I'm waiting for?" — it must be the best (or nearly best) fit of all 31
//    shapes and fit clearly better than the chord before. Only then it moves on.
//    If a strum slips past the detector, a slower check of whatever is ringing (every 0.3 s)
//    catches the chord anyway.
// 3. The same sound is checked string by string (muted / wrong fret / a string that shouldn't
//    ring). That never stops you — it's collected for the summary.
// Time per change = from the strum that landed the last chord to the strum that landed this one.
// Any phone delay is the same both times, so it cancels out.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { createPicker } from './picker.js';
import * as halt from './halt.js';
import { loadEngine, openMic, profile, addLog, readLog, loadPrefs, savePrefs, neckFrets, stringName } from './ear.js';

const PREFS = 'practice.changes.settings';
const ROUND_SEC = 60;
const WIN = 16384;            // samples judged after a strum (~0.35 s)
const STEADY_EVERY = 0.3;     // s between "what's ringing?" checks when no strum was caught
const PRESETS = [
  ['warmup', 'Warm-up', [['C', 'G'], ['G', 'D'], ['Am', 'Em'], ['C', 'Am'], ['D', 'A'], ['Em', 'G'], ['A', 'E'], ['Am', 'Dm'], ['E', 'Am'], ['D', 'Em']]],
  ['barre1', 'Open → barre', [['C', 'F'], ['Am', 'F'], ['D', 'Bm'], ['G', 'Bm'], ['Em', 'Bm'], ['A', 'F#m'], ['Dm', 'F'], ['E', 'F#m']]],
  ['barre2', 'Barre → barre', [['F', 'Bm'], ['F', 'G barre'], ['Bm', 'F#m'], ['F', 'Gm'], ['Bm', 'B'], ['G barre', 'Bm'], ['Cm', 'F']]],
  ['prog', 'Progressions', [['G', 'D', 'Em', 'C'], ['C', 'G', 'Am', 'F'], ['Am', 'F', 'C', 'G'], ['Em', 'C', 'G', 'D'], ['D', 'A', 'Bm', 'G'], ['C', 'Am', 'F', 'G']]],
];

export function createChanges({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-ch';
  el.dataset.ex = 'changes';
  el.dataset.view = 'setup';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>

    <div class="ch-v ch-setup">
      <div class="ex-read"><b class="ch-pool"></b><span class="ch-last"></span></div>
      <div class="ex-panel">
        <div class="ex-opts ch-picks">
          <button type="button" class="pick ch-chords"><span>${esc(words.chords)}</span><b></b></button>
          <button type="button" class="pick ch-presets"><span>${esc(words.presets)}</span><b>${esc(words.presetsBtn)}</b></button>
        </div>
        <div class="dr-row">
          <div class="seg ch-order" role="group" aria-label="${esc(words.order)}"><span class="seg-l">${esc(words.order)}</span><button type="button" data-o="loop">${esc(words.loop)}</button><button type="button" data-o="random">${esc(words.random)}</button></div>
          <button type="button" class="tog ch-song" disabled>${esc(words.fromSong)} · SOON</button>
        </div>
      </div>
    </div>

    <div class="ch-v ch-run">
      <div class="ex-read">
        <span class="dr-meta"><b class="ch-time">1:00</b><span class="ch-count"></span></span>
        <b class="ch-target">·</b><span class="ch-next"></span>
      </div>
      <div class="ex-panel">
        <div class="ch-ring" aria-hidden="true"></div>
        <p class="dr-status ch-status"></p>
        <div class="dr-history ch-hist" aria-hidden="true"></div>
      </div>
    </div>

    <div class="ch-v ch-sum">
      <div class="ex-read"><b class="dr-big ch-big">0</b><span class="dr-unit">${esc(words.perMin)}</span></div>
      <div class="ex-panel">
        <p class="dr-sum-pair ch-sum-name"></p>
        <p class="dr-compare ch-compare"></p>
        <ul class="dr-details ch-details"></ul>
      </div>
    </div>

    <button type="button" class="ex-alt dr-alt ch-alt" hidden>${esc(words.setup)}</button>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const go = $('.ex-go'), alt = $('.ch-alt');
  const orderBtns = [...el.querySelectorAll('[data-o]')];
  const picker = createPicker(el);

  let E = null, open = false, view = 'setup';
  const cfg = loadPrefs(PREFS, { pool: ['Am', 'F'], order: 'loop' });
  const shapeOf = (n) => E && E.Chords.LIBRARY.find((c) => c.name === n);
  // the same chords are the same set, in any order: Em ↔ Am = Am ↔ Em (old results keyed 'loop:A|B' still match)
  const setKey = (names) => names.slice().sort().join('|');
  const poolKey = () => setKey(cfg.pool);
  const pairKey = (a, b) => [a, b].sort().join(' ↔ ');
  const g3 = () => getStage()?.guitar;

  function setView(v) {
    view = v; el.dataset.view = v;
    alt.hidden = v !== 'summary';
    go.textContent = v === 'setup' ? `${words.start} · 1 min` : v === 'summary' ? words.again : paused ? words.resume : words.pause;
  }

  // ── setup ──
  $('.ch-chords').addEventListener('click', async () => {
    if (!E) return;
    const v = await picker.chords({ title: words.chords, value: cfg.pool, library: E.Chords.LIBRARY, multi: true });
    if (v) { cfg.pool = v; savePrefs(PREFS, cfg); renderSetup(); }
  });
  $('.ch-presets').addEventListener('click', async () => {
    const match = PRESETS.flatMap(([, , sets]) => sets).find((p) => setKey(p) === poolKey());
    const cur = (match || cfg.pool).join('|');
    const v = await picker.list({
      title: words.presets, value: cur,
      tabs: PRESETS.map(([id, label, sets]) => ({
        id, label,
        rows: sets.map((p) => {
          const last = lastResult(setKey(p));
          return { value: p.join('|'), label: p.join(p.length > 2 ? ' → ' : ' ↔ '), sub: last ? `${last.score.changesPerMin}/min` : words.newOne };
        }),
      })),
    });
    if (v) { cfg.pool = v.split('|'); cfg.order = cfg.pool.length > 2 ? cfg.order : 'loop'; savePrefs(PREFS, cfg); renderSetup(); }
  });
  orderBtns.forEach((b) => b.addEventListener('click', () => { cfg.order = b.dataset.o; savePrefs(PREFS, cfg); renderSetup(); }));

  function renderSetup() {
    if (E) cfg.pool = cfg.pool.filter((n) => shapeOf(n));
    if (cfg.pool.length < 2) cfg.pool = ['Am', 'F'];
    $('.ch-pool').innerHTML = cfg.pool.map((n) => `<span>${esc(n)}</span>`).join(`<i>${cfg.order === 'loop' ? '→' : '·'}</i>`);
    $('.ch-pool').classList.toggle('is-many', cfg.pool.length > 3);
    $('.ch-chords b').textContent = cfg.pool.join(' · ');
    orderBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.o === cfg.order));
    const last = lastResult(poolKey());
    $('.ch-last').textContent = last ? `${words.lastTime} ${last.score.changesPerMin}/min · ${last.score.cleanPct}% ${words.clean}` : words.newOne;
    if (view === 'setup') go.textContent = `${words.start} · 1 min`;
    if (open && view === 'setup') showChord(cfg.pool[0]);
  }
  function lastResult(key) {
    const l = readLog().filter((e) => e.exercise === 'chord-changes' && e.score && !e.score.partial && setKey(String(e.score.key || '').replace(/^\w+:/, '').split('|')) === key);
    return l[l.length - 1] || null;
  }

  // ── the round ──
  let running = false, paused = false, raf = 0, mic = null, ctx = null, strums = null;
  let seq = [], idx = 0, target = '', prevName = '', started = false;
  let clockStart = 0, activeSec = 0, lastTick = 0, lastSoundAt = 0, lastLandAt = 0, nextSteady = 0, holdOff = 0;
  let jobs = [], changes = [], wrongHeard = 0, lastWrong = '', landSnap = null;

  go.addEventListener('click', () => {
    if (!E) return;
    if (view === 'setup' || view === 'summary') start();
    else if (view === 'run') { if (paused) resume(); else pause(0, words.pausedByYou); }
  });
  alt.addEventListener('click', () => { setView('setup'); renderSetup(); });
  $('.ex-exit').addEventListener('click', () => director.exit());

  function nextName(after) {
    if (cfg.order === 'loop') return cfg.pool[(cfg.pool.indexOf(after) + 1) % cfg.pool.length];
    const pool = cfg.pool.filter((n) => n !== after);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function start() {
    try { mic = await openMic(32768); } catch { $('.ch-last').textContent = words.denied; return; }
    if (!open) { mic.close(); mic = null; return; }
    ctx = mic.ctx;
    audio.duck(true);
    strums = E.Timing.strumDetector(mic.sampleRate);
    changes = []; wrongHeard = 0; lastWrong = ''; landSnap = null;
    target = cfg.order === 'loop' ? cfg.pool[0] : cfg.pool[Math.floor(Math.random() * cfg.pool.length)];
    prevName = ''; started = false; activeSec = 0;
    jobs = []; running = true; paused = false;
    lastTick = lastSoundAt = ctx.currentTime; nextSteady = 0; holdOff = 0;
    el.classList.remove('is-paused');
    setView('run');
    setStatus(`${words.playFirst} ${target}`, '');
    drawRing(); drawHist(); showTarget();
    loop();
  }
  function resume() {
    paused = false;
    el.classList.remove('is-paused');
    halt.hide('changes');
    lastTick = lastSoundAt = ctx.currentTime;
    strums.reset(); jobs = [];
    setView('run');
    setStatus(`${words.welcomeBack} ${target}`, '');
    loop();
  }
  function pause(after = 20, text = words.pausedText) {
    paused = true;
    cancelAnimationFrame(raf);
    el.classList.add('is-paused');
    go.textContent = words.resume;
    halt.show('changes', {
      title: words.paused, text, after,
      buttons: [
        { label: words.resume, primary: true, onClick: resume },
        changes.length ? { label: words.endSave, onClick: () => finish(true) } : { label: words.stop, onClick: () => finish(true) },
      ],
    });
    raf = requestAnimationFrame(waitLoop);
  }
  // paused: any playing that keeps ringing carries on
  let wake = null;
  function waitLoop() {
    if (!paused || !mic) return;
    wake = wake || E.Pause.playDetector();
    if (wake.feed(mic.read(), performance.now())) { wake.reset(); resume(); return; }
    raf = requestAnimationFrame(waitLoop);
  }

  function loop() {
    if (!running || paused) return;
    const now = ctx.currentTime;
    const buf = mic.read();
    const r = E.Sound.rms(buf, buf.length - 2048);
    if (r > 0.006) lastSoundAt = now;
    // the minute only runs once you've landed the first chord, and stops in breaks
    if (started) activeSec += Math.min(0.25, now - lastTick);
    lastTick = now;
    showTime();

    const t = strums.feed(buf, now);
    if (t !== null && now > holdOff) {
      const onsetIdx = buf.length - Math.round((now - t) * mic.sampleRate);
      const before = onsetIdx >= 8192 ? buf.slice(onsetIdx - 8192, onsetIdx) : null;
      jobs.push({ t, at: t + 0.04 + WIN / mic.sampleRate, before });
      const g = g3(); if (g) for (let s = 0; s < 6; s++) g.pluck(s, 0.8, 0);
    }
    while (jobs.length && jobs[0].at <= now) {
      const job = jobs.shift();
      if (judgeAndMaybeLand(mic.buffer.subarray(mic.buffer.length - WIN), job.t, job.before)) jobs = [];
    }
    // backup: no strum caught, but something rings → is it the chord?
    if (!jobs.length && now >= nextSteady && r > 0.01 && now > holdOff) {
      nextSteady = now + STEADY_EVERY;
      judgeAndMaybeLand(mic.buffer.subarray(mic.buffer.length - WIN), now - WIN / mic.sampleRate, null, true);
    }

    if (now - lastSoundAt > E.Pause.AFTER_SEC) { pause(); return; }
    if (started && activeSec >= ROUND_SEC) { finish(false); return; }
    raf = requestAnimationFrame(loop);
  }

  // Is this sound the chord we're waiting for? Land it (and move on) if so.
  // If something was still ringing before the strum (the last chord, or one before it), only
  // what's NEW since the strum is judged — so an old chord fading out can never count.
  // The backup check (no strum caught) only looks at what's new since the last chord landed.
  function judgeAndMaybeLand(buf, t, before, steady = false) {
    const P = profile();
    const tgt = shapeOf(target), prev = prevName ? shapeOf(prevName) : null;
    if (E.Sound.rms(buf) < 0.003) return false;
    let ref = before;
    if (steady) {
      if (started && ctx.currentTime - lastLandAt < 0.8) return false;
      ref = landSnap;
    }
    const old = ref && E.Sound.rms(ref) > E.Sound.rms(buf) * 0.3;
    const h = old ? E.Chords.hearNew(ref, buf, mic.sampleRate) : E.Chords.hear(buf, mic.sampleRate);
    if (h.flatness > 0.05) return false;
    const v = verdict(h, tgt, prev, P, steady);
    if (!v.ok) {
      if (!steady && v.heard && v.heard !== prevName && v.heard !== lastWrong) {
        lastWrong = v.heard; wrongHeard++;
        setStatus(`${words.heard} ${v.heard} — ${words.waitingFor} ${target}`, 'bad');
      }
      return false;
    }
    // landed. What was wrong with it? (never stops you — saved for the summary)
    // Over an old ringing sound only a wrong fret or a string that shouldn't be struck can be told.
    const c = E.Chords.check(h, tgt, P.chord);
    const kinds = old ? ['wrong', 'extra'] : ['wrong', 'extra', 'muted', 'weak'];
    const bad = c.strings.map((x, i) => (kinds.includes(x.status) ? i : -1)).filter((i) => i >= 0);
    const say = { wrong: 'wrong note', extra: 'shouldn’t ring', muted: 'muted', weak: 'quiet' };
    const problems = bad.map((i) => `${stringName(i)} string ${say[c.strings[i].status]}`);
    land(t, problems, c.strings.map((x, i) => (bad.includes(i) ? 'bad' : x.status === 'skip' ? null : 'ok')));
    return true;
  }
  function verdict(h, tgt, prev, P, steady) {
    const fT = E.Chords.fit(h, tgt);
    const fP = prev ? E.Chords.fit(h, prev) : -9;
    const top = E.Chords.recognize(h)[0];
    const isIt = top.shape === tgt || top.shape.chord === tgt.chord || fT >= top.score - P.drill.rank;
    // the backup check (no strum) is stricter, so a fading old chord can't count
    const ok = isIt && fT >= (steady ? 0.4 : 0.25) && fT > fP + P.drill.margin;
    return { ok, heard: top.score >= 0.3 ? top.shape.name : '' };
  }

  function land(t, problems, strings) {
    const now = ctx.currentTime;
    if (!started) {
      started = true;
      setStatus(`${words.go}`, 'ok');
    } else {
      const sec = Math.max(0, t - lastLandAt);
      changes.push({ from: prevName, to: target, sec, problems });
      setStatus(problems.length ? `${prevName} → ${target} · ${sec.toFixed(1)} s · ${problems[0]}` : `✓ ${prevName} → ${target} · ${sec.toFixed(1)} s`, problems.length ? 'meh' : 'ok');
      bus.emit('flash', problems.length ? 0.15 : 0.3);
      drawHist();
    }
    lastLandAt = t;
    lastWrong = '';
    prevName = target;
    target = nextName(target);
    holdOff = now + 0.15;                       // the same strum can't count twice
    // the strings show how that chord rang (amber clean / red problem) until the next one lands
    const g = g3();
    if (g) for (let i = 0; i < 6; i++) g.setTint(i, strings ? strings[i] : 'ok');
    landSnap = mic.buffer.slice(mic.buffer.length - WIN);
    showTarget(); drawRing();
  }
  function setStatus(t, c) { const s = $('.ch-status'); s.textContent = t; s.className = `dr-status ch-status ${c}`; }

  function finish(partial) {
    running = false; paused = false;
    cancelAnimationFrame(raf);
    if (mic) { mic.close(); mic = null; audio.duck(false); }
    el.classList.remove('is-paused');
    halt.hide('changes');
    const g = g3(); if (g) for (let i = 0; i < 6; i++) g.setTint(i, null);
    if (!changes.length) { setView('setup'); renderSetup(); return; }
    const mins = Math.max(activeSec, 1) / 60;
    const perMin = Math.round(changes.length / mins);
    const clean = changes.filter((c) => !c.problems.length).length;
    const cleanPct = Math.round((clean / changes.length) * 100);
    const avg = changes.reduce((s, c) => s + c.sec, 0) / changes.length;
    // slowest change (by pair, average)
    const byPair = {};
    changes.forEach((c) => { const k = pairKey(c.from, c.to); (byPair[k] = byPair[k] || []).push(c.sec); });
    const pairAvg = Object.entries(byPair).map(([k, l]) => [k, l.reduce((a, b) => a + b, 0) / l.length]).sort((a, b) => b[1] - a[1]);
    // what went wrong, per chord
    const issues = {};
    changes.forEach((c) => c.problems.forEach((p) => { const k = `${c.to}: ${p}`; issues[k] = (issues[k] || 0) + 1; }));
    const topIssues = Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const key = poolKey();
    const prev = lastResult(key);
    const name = cfg.pool.join(cfg.order === 'loop' ? ' → ' : ' · ');
    addLog({
      exercise: 'chord-changes', title: 'Chord changes', chords: cfg.pool.slice(),
      score: {
        changesPerMin: perMin, changes: changes.length, clean, cleanPct, avgSec: Number(avg.toFixed(2)), order: cfg.order, key,
        slowest: pairAvg[0] ? { pair: pairAvg[0][0], sec: Number(pairAvg[0][1].toFixed(2)) } : null, issues, wrongHeard,
        pairs: Object.fromEntries(pairAvg.map(([k, v]) => [k, Number(v.toFixed(2))])),   // avg seconds per pair, either direction
        ...(partial ? { partial: true } : {}),
      },
      summary: `${name}${cfg.order === 'random' ? ' (random)' : ''}: ${perMin} changes/min, ${cleanPct}% clean, avg ${avg.toFixed(1)} s${prev ? ` (prev ${prev.score.changesPerMin})` : ''}${partial ? ` · partial, ${Math.round(activeSec)} s` : ''}`,
      activeSec: Math.round(activeSec),
    });
    setView('summary');
    $('.ch-big').textContent = perMin;
    $('.ch-sum-name').textContent = `${name} · ${cfg.order === 'loop' ? words.loop : words.random}`;
    $('.ch-compare').textContent = partial ? `${words.partial} (${Math.round(activeSec)} s)`
      : prev ? (perMin > prev.score.changesPerMin ? `${words.upFrom} ${prev.score.changesPerMin}` : `${words.lastTime} ${prev.score.changesPerMin}`) : words.baseline;
    const lines = [`${clean} / ${changes.length} ${words.cleanChanges} (${cleanPct}%)`, `${words.avgChange} ${avg.toFixed(1)} s`];
    if (pairAvg.length > 1) lines.push(`${words.slowest}: ${pairAvg[0][0]} · ${pairAvg[0][1].toFixed(1)} s`);
    topIssues.forEach(([k, n]) => lines.push(`${k} ×${n}`));
    if (wrongHeard) lines.push(`${wrongHeard} ${words.wrongChords}`);
    $('.ch-details').innerHTML = lines.map((x) => `<li>${esc(x)}</li>`).join('');
    bus.emit('flash', 0.5);
  }

  // ── drawing ──
  function showTime() {
    const left = Math.max(0, Math.ceil(ROUND_SEC - activeSec));
    const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const t = $('.ch-time'); if (t.textContent !== txt) t.textContent = txt;
  }
  function showTarget() {
    const tEl = $('.ch-target');
    tEl.textContent = target;
    tEl.classList.toggle('is-long', target.length > 3);
    tEl.classList.remove('is-pop'); void tEl.offsetWidth; tEl.classList.add('is-pop');
    $('.ch-next').textContent = cfg.order === 'loop' ? `${words.then} ${nextName(target)}` : words.randomNext;
    $('.ch-count').textContent = `${changes.length} ${words.changesWord}`;
    showChord(target);
  }
  function drawRing() {
    $('.ch-ring').innerHTML = cfg.pool.map((n) => `<span class="${n === target ? 'is-cur' : ''}">${esc(n)}</span>`).join('');
  }
  function drawHist() {
    $('.ch-hist').innerHTML = changes.map((c) => `<i class="${c.problems.length ? 'meh' : 'ok'}"></i>`).join('');
  }
  let shown = '';
  function showChord(name) {
    const g = g3(), sh = shapeOf(name);
    if (!g || !open || !sh || shown === name) return;
    shown = name;
    g.setChord(neckFrets(sh));
  }

  bus.on('ex:enter', (n) => {
    if (n !== 'changes') return;
    open = true; shown = '';
    el.classList.add('is-open');
    if (view === 'run') setView('setup');
    loadEngine().then((eng) => { E = eng; if (open) renderSetup(); }).catch(() => { $('.ch-last').textContent = words.failed; });
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'changes') return;
    if (running) finish(true);
    open = false; picker.close();
    el.classList.remove('is-open');
    const g = g3(); if (g) for (let i = 0; i < 6; i++) g.setTint(i, null);
    bus.emit('chord', [0, 2, 2, 0, 0, 0]);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) pause(Math.max(0, Math.round(ctx.currentTime - lastSoundAt)), words.pausedAway); });
  window.addEventListener('pagehide', () => { if (running) finish(true); });
  return { el };
}
