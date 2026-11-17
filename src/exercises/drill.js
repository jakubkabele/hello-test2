// EX-03 CHORD CHANGE DRILL — runs inside the 3D world, on the fretboard.
//
// A metronome ticks; every 2 or 4 beats the chord switches (A → B → A …) for one minute.
// Beat lights "3 · 2 · 1 · ●" count down to the strum; the 3D neck already shows the dots
// of the chord to land next, and the focus window pulses on every beat.
//
// How a change is judged (plain words — same rules as the old screen):
// 1. We hear each strum and WHEN it started (timing.js), minus your phone's delay
//    (calibration). Each strum belongs to the nearest change beat.
// 2. Up to ~0.7 s of its sound goes to the chord engine: is it really the new chord —
//    the best (or nearly best) of all 31 shapes — and are its strings fine?
// 3. Right chord + strings fine + within ± the sensitivity's ms of the beat = clean.
//    Right chord off the beat = early / late (with ms). Muted / wrong string = messy.
//    Not the chord = wrong chord. No strum = missed.
// Score = clean changes per minute. Tempo goes up 5 BPM at ≥ 90 % clean, down below 60 %.
//
// Breaks: 20 s of silence pauses the round (metronome + clock stop; the silent changes are
// thrown away). Play again or tap Resume → 4-beat count-in, carry on. Leaving or locking
// the phone keeps the round (practice.drill.unfinished — shared with the old screen).

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { createPicker } from './picker.js';
import { loadEngine, openMic, playClick, profile, addLog, readLog, loadPrefs, savePrefs, neckFrets } from './ear.js';

const PREFS = 'practice.drill.settings';          // shared with the old screen
const UNFINISHED = 'practice.drill.unfinished';
const ROUND_SEC = 60;
const COUNT_IN = 4;
const STALE_MS = 3 * 3600 * 1000;   // an unfinished round older than this is saved as partial
const END_GRACE = 8;                // silent this long when the round ends → pause instead of finishing
const SHOW_RANGE = 0.4;             // timing line shows ±400 ms
const CAL_BPM = 70, CAL_CLICKS = 8;

const GROUPS = [
  ['Warm-up', [['C', 'G'], ['G', 'D'], ['Am', 'Em'], ['C', 'Am'], ['D', 'A'], ['Em', 'G'], ['A', 'E'], ['Am', 'Dm'], ['E', 'Am'], ['D', 'Em']]],
  ['Open → barre', [['C', 'F'], ['Am', 'F'], ['D', 'Bm'], ['G', 'Bm'], ['Em', 'Bm'], ['A', 'F#m'], ['Dm', 'F'], ['E', 'F#m']]],
  ['Barre → barre', [['F', 'Bm'], ['F', 'G barre'], ['Bm', 'F#m'], ['F', 'Gm'], ['Bm', 'B'], ['G barre', 'Bm'], ['Cm', 'F']]],
];
const GROUP_IDS = ['warmup', 'barre1', 'barre2'];

export function createDrill({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-dr';
  el.dataset.ex = 'drill';
  el.dataset.view = 'setup';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>

    <div class="dr-v dr-setup">
      <div class="ex-read"><b class="dr-pairbig"></b><span class="dr-last"></span></div>
      <div class="ex-panel">
        <button type="button" class="pick dr-pair"><span>${esc(words.pair)}</span><b></b></button>
        <div class="dr-custom" hidden>
          <button type="button" class="pick dr-from"><span>${esc(words.from)}</span><b></b></button>
          <button type="button" class="pick dr-to"><span>${esc(words.to)}</span><b></b></button>
        </div>
        <div class="dr-row">
          <div class="step"><button type="button" class="dr-minus" aria-label="Slower">−</button><b><span class="dr-bpm">60</span><small>BPM</small></b><button type="button" class="dr-plus" aria-label="Faster">+</button></div>
          <div class="seg seg-beats" role="group" aria-label="${esc(words.every)}"><span class="seg-l">${esc(words.every)}</span><button type="button" data-beats="2">2</button><button type="button" data-beats="4">4</button></div>
        </div>
        <div class="dr-row dr-togs">
          <button type="button" class="tog dr-click" aria-pressed="true">${esc(words.click)}</button>
          <button type="button" class="tog dr-auto" aria-pressed="true">${esc(words.autoTempo)}</button>
          <button type="button" class="tog dr-recal"></button>
        </div>
      </div>
    </div>

    <div class="dr-v dr-run">
      <div class="ex-read">
        <span class="dr-meta"><b class="dr-time">1:00</b><span class="dr-count"></span></span>
        <b class="dr-chord">·</b><span class="dr-next"></span>
      </div>
      <div class="ex-panel">
        <div class="dr-lights" aria-hidden="true"></div>
        <div class="dr-bar" aria-hidden="true"><i></i></div>
        <p class="dr-status"></p>
        <div class="dr-tl" aria-hidden="true"><i class="dr-tl-zone"></i><i class="dr-tl-mid"></i><i class="dr-tl-dot" hidden></i><span>${esc(words.early)}</span><span>${esc(words.late)}</span></div>
        <div class="dr-history" aria-hidden="true"></div>
      </div>
      <div class="dr-paused">
        <i class="alert-stripes"></i>
        <div class="dr-p-in">
          <b class="dr-p-big">${esc(words.paused)}</b>
          <p class="dr-p-text"></p>
          <p class="dr-p-prog"></p>
          <div class="dr-p-btns"><button type="button" class="dr-end">${esc(words.endSave)}</button><button type="button" class="dr-discard">${esc(words.discard)}</button></div>
        </div>
        <i class="alert-stripes"></i>
      </div>
    </div>

    <div class="dr-v dr-sum">
      <div class="ex-read"><b class="dr-big">0</b><span class="dr-unit">${esc(words.perMin)}</span></div>
      <div class="ex-panel">
        <p class="dr-sum-pair"></p>
        <p class="dr-compare"></p>
        <ul class="dr-details"></ul>
        <p class="dr-nextbpm"></p>
      </div>
    </div>

    <div class="dr-v dr-cal">
      <div class="ex-read"><b class="dr-cal-beat">${esc(words.calTitle)}</b></div>
      <div class="ex-panel">
        <div class="dr-lights dr-cal-lights" aria-hidden="true"></div>
        <p class="dr-cal-status"></p>
      </div>
    </div>

    <button type="button" class="ex-alt dr-alt" hidden></button>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const go = $('.ex-go'), alt = $('.dr-alt');
  const pairSel = $('.dr-pair'), fromSel = $('.dr-from'), toSel = $('.dr-to');
  const beatBtns = [...el.querySelectorAll('[data-beats]')];

  let E = null;
  const cfg = loadPrefs(PREFS, { group: 'barre1', pair: ['Am', 'F'], custom: ['C', 'F'], bpm: 60, beats: 4, auto: true, click: true });
  const shapeOf = (n) => E.Chords.LIBRARY.find((c) => c.name === n);
  const pairKey = (p) => p.slice().sort().join('|');
  const currentPair = () => (cfg.group === 'custom' ? cfg.custom : cfg.pair);
  const save = () => savePrefs(PREFS, cfg);
  const g3 = () => getStage()?.guitar;

  let open = false;
  let view = 'setup';
  function setView(v) {
    view = v; el.dataset.view = v;
    alt.hidden = true;
    if (v === 'setup') { go.textContent = startLabel(); go.disabled = currentPair()[0] === currentPair()[1]; }
    if (v === 'summary') { go.textContent = words.again; go.disabled = false; alt.hidden = false; alt.textContent = words.setup; }
  }

  // ── setup ──
  // picker sheets: the pair list (with your last score per pair), and single chords for your own pair
  const picker = createPicker(el);
  const pairValue = () => (cfg.group === 'custom' ? 'custom' : `${cfg.group}:${cfg.pair.join('|')}`);
  pairSel.addEventListener('click', async () => {
    if (!E) return;
    const v = await picker.list({
      title: words.pair, value: pairValue(),
      tabs: [
        ...GROUPS.map(([label, pairs], gi) => ({
          id: GROUP_IDS[gi], label, note: words.groupNotes[gi],
          rows: pairs.map((p) => {
            const last = lastResult(p);
            return { value: `${GROUP_IDS[gi]}:${p.join('|')}`, label: `${p[0]} ↔ ${p[1]}`, sub: last ? `${last.score.changesPerMin}/min` : words.newPair };
          }),
        })),
        { id: 'custom', label: words.ownLabel, rows: [{ value: 'custom', label: `${cfg.custom[0]} ↔ ${cfg.custom[1]}`, sub: words.change, accent: true }] },
      ],
    });
    if (v === null) return;
    if (v === 'custom') {
      // pick both chords, one after the other
      const a = await pickChord(words.from, cfg.custom[0]);
      if (a === null) return;
      const b = await pickChord(words.to, cfg.custom[1]);
      if (b === null) return;
      cfg.group = 'custom'; cfg.custom = [a, b];
    } else { const [gid, p] = v.split(':'); cfg.group = gid; cfg.pair = p.split('|'); }
    save(); renderSetup();
  });
  function pickChord(title, value) {
    return picker.chords({ title, value, library: E.Chords.LIBRARY });
  }
  fromSel.addEventListener('click', async () => { const v = await pickChord(words.from, cfg.custom[0]); if (v !== null) { cfg.custom[0] = v; save(); renderSetup(); } });
  toSel.addEventListener('click', async () => { const v = await pickChord(words.to, cfg.custom[1]); if (v !== null) { cfg.custom[1] = v; save(); renderSetup(); } });
  beatBtns.forEach((b) => b.addEventListener('click', () => { cfg.beats = +b.dataset.beats; save(); renderSetup(); }));
  $('.dr-minus').addEventListener('click', () => { cfg.bpm = Math.max(40, cfg.bpm - 5); save(); renderSetup(); });
  $('.dr-plus').addEventListener('click', () => { cfg.bpm = Math.min(160, cfg.bpm + 5); save(); renderSetup(); });
  $('.dr-click').addEventListener('click', () => { cfg.click = !cfg.click; save(); renderSetup(); });
  $('.dr-auto').addEventListener('click', () => { cfg.auto = !cfg.auto; save(); renderSetup(); });
  $('.dr-recal').addEventListener('click', () => openCalibration(false));

  const startLabel = () => {
    const p = currentPair();
    return p[0] === p[1] ? words.twoDifferent : `${words.start} · 1 min`;
  };
  function renderSetup() {
    if (!E) return;
    const p = currentPair();
    if (cfg.group !== 'custom' && !GROUP_IDS.includes(cfg.group)) { cfg.group = 'barre1'; cfg.pair = ['Am', 'F']; }
    pairSel.querySelector('b').textContent = cfg.group === 'custom' ? words.customPair : `${p[0]} ↔ ${p[1]}`;
    $('.dr-custom').hidden = cfg.group !== 'custom';
    fromSel.querySelector('b').textContent = cfg.custom[0];
    toSel.querySelector('b').textContent = cfg.custom[1];
    $('.dr-pairbig').innerHTML = `<span>${esc(p[0])}</span><span><i>↔</i>${esc(p[1])}</span>`;
    const last = lastResult(p), best = bestResult(p);
    $('.dr-last').textContent = last ? `${words.lastTime} ${last.score.changesPerMin}/min${best ? ` · ${words.best} ${best}` : ''}` : words.newPair;
    $('.dr-bpm').textContent = cfg.bpm;
    beatBtns.forEach((b) => b.classList.toggle('is-on', +b.dataset.beats === cfg.beats));
    $('.dr-click').setAttribute('aria-pressed', cfg.click);
    $('.dr-auto').setAttribute('aria-pressed', cfg.auto);
    const off = E.Timing.offset();
    $('.dr-recal').textContent = off === null ? words.calibrate : `${words.delay} ${Math.round(off * 1000)} ms`;
    $('.dr-recal').classList.toggle('is-warn', off === null);
    if (view === 'setup') { go.textContent = startLabel(); go.disabled = p[0] === p[1]; }
    if (open && view === 'setup') showChord(shapeOf(p[0]));
  }

  function results(pair) {
    const key = pairKey(pair);
    return readLog().filter((e) => e.exercise === 'change-drill' && e.score && !e.score.partial && pairKey(e.chords || []) === key);
  }
  const lastResult = (pair) => { const l = results(pair); return l[l.length - 1] || null; };
  const bestResult = (pair) => results(pair).reduce((m, e) => Math.max(m, e.score.changesPerMin), 0);

  // ── the run ──
  let round = null, running = false, paused = '';   // paused: '' | 'auto' (play to resume) | 'away' (tap)
  let mic = null, ctx = null, raf = 0, shapes = [];
  let beatDur = 1, segLen = 4, baseSeg = 0, roundStart = 0, firstBeat = 0, totalBeats = 0, nextBeat = 0;
  let jobs = [], lastPlayedAt = 0, delay = 0, winW = 32768;
  const clicks = [];
  let detector = null, strums = null, calSkipped = false, lastSeg = -2, lastBeatLit = -1;

  go.addEventListener('click', () => {
    if (!E) return;
    if (view === 'setup') { if (E.Timing.offset() === null && !calSkipped) openCalibration(true); else newRound(); }
    else if (view === 'run') { if (paused) resume(); else pause('away'); }
    else if (view === 'summary') newRound();
    else if (view === 'cal') {
      // after a calibration that came from "Start", the big button starts the round
      if (el.dataset.then === 'go') { el.dataset.then = ''; newRound(); } else startCalibration();
    }
  });
  alt.addEventListener('click', () => {
    if (view === 'summary') { setView('setup'); renderSetup(); }
    else if (view === 'cal') {
      if (calRun) stopCalibration();
      if (calReturn) goBackTo(calReturn);
      else if (el.dataset.then === '1') { calSkipped = true; newRound(); } else { setView('setup'); renderSetup(); }
    }
  });

  // Another exercise (Rhythm) can borrow the calibration: glide here, calibrate, glide back.
  let calReturn = '';
  function goBackTo(name) {
    calReturn = '';
    const off = bus.on('ex:closed', () => { off(); director.enter(name); });
    director.exit();
  }
  bus.on('calibrate', (from) => {
    const off = bus.on('ex:closed', () => { off(); calReturn = from; director.enter('drill'); });
    director.exit();
  });
  $('.dr-end').addEventListener('click', () => { if (!finishRound(true)) { setView('setup'); renderSetup(); } });
  $('.dr-discard').addEventListener('click', () => { clearRound(); setView('setup'); renderSetup(); });
  $('.ex-exit').addEventListener('click', () => director.exit());

  function newRound() {
    const p = currentPair().slice();
    if (!shapeOf(p[0]) || !shapeOf(p[1]) || p[0] === p[1]) return;
    const nSeg = Math.max(2, Math.round(ROUND_SEC / ((60 / cfg.bpm) * cfg.beats)));
    round = { pair: p, bpm: cfg.bpm, beats: cfg.beats, nSeg, lastPlayedSeg: -1, results: Array.from({ length: nSeg }, emptySeg) };
    resume();
  }
  const emptySeg = () => ({ cands: [], fallback: null, final: null });

  async function micOrFail() {
    try { mic = await openMic(32768); ctx = mic.ctx; audio.duck(true); return true; } catch {
      mic = null;
      setView('setup'); renderSetup();
      $('.dr-last').textContent = words.denied;
      return false;
    }
  }
  function closeMic() { if (mic) { mic.close(); mic = null; audio.duck(false); } }

  // start (or continue) from the first segment not yet played
  async function resume() {
    if (!round) return;
    shapes = round.pair.map(shapeOf);
    if (!mic || paused !== 'auto') { closeMic(); if (!(await micOrFail())) return; }
    if (!open) { closeMic(); return; }
    delay = E.Timing.offset() ?? E.Timing.estimate(ctx);
    strums = E.Timing.strumDetector(mic.sampleRate);
    detector = detector || E.Pause.playDetector();

    beatDur = 60 / round.bpm;
    segLen = beatDur * round.beats;
    baseSeg = round.lastPlayedSeg + 1;
    firstBeat = ctx.currentTime + 0.4;
    roundStart = firstBeat + COUNT_IN * beatDur;
    totalBeats = COUNT_IN + (round.nSeg - baseSeg) * round.beats;
    nextBeat = 0;
    lastPlayedAt = roundStart;
    for (let k = baseSeg; k < round.nSeg; k++) round.results[k] = emptySeg();
    const sr = mic.sampleRate;
    winW = [32768, 16384, 8192].find((w) => w / sr <= segLen - 0.15) || 8192;
    jobs = [];
    for (let k = baseSeg; k < round.nSeg; k++) jobs.push({ kind: 'wrap', seg: k, at: segStart(k) + delay + segLen / 2 + winW / sr + 0.15 });
    sortJobs();

    running = true; paused = ''; lastSeg = -2; lastBeatLit = -1;
    setView('run');
    go.textContent = words.pause;
    renderPaused();
    drawHistory();
    showTimingMark(null);
    setStatus('', '');
    cancelAnimationFrame(raf);
    loop();
  }
  const segStart = (k) => roundStart + (k - baseSeg) * segLen;
  const sortJobs = () => jobs.sort((a, b) => a.at - b.at);

  function pause(kind) {
    if (!round) return;
    if (running) {
      running = false;
      jobs = [];
      clicks.slice().forEach((c) => { try { c.stop(); } catch { /* done */ } });
      clicks.length = 0;
      const k = round.lastPlayedSeg;
      if (k >= 0 && !round.results[k].final) finalize(k);
      for (let j = k + 1; j < round.nSeg; j++) round.results[j] = emptySeg();
    }
    if (kind === 'away' || paused === 'away') { cancelAnimationFrame(raf); closeMic(); }
    paused = kind;
    el.classList.remove('is-strum');
    if (detector) detector.reset();
    persist();
    setView('run');
    go.textContent = words.resume;
    renderPaused();
    drawHistory();
    if (kind === 'auto') raf = requestAnimationFrame(loop);
  }
  function stopAll() {
    if (calRun) stopCalibration();
    if (running || paused) pause('away');
  }

  function loop() {
    if (paused === 'auto') {
      if (detector.feed(mic.read(), performance.now())) { resume(); return; }
      raf = requestAnimationFrame(loop);
      return;
    }
    if (!running) return;
    const now = ctx.currentTime;
    // metronome: clicks are scheduled a little ahead so they're exactly on time
    while (nextBeat < totalBeats && firstBeat + nextBeat * beatDur < now + 0.2) {
      const inRound = nextBeat - COUNT_IN;
      const accent = nextBeat === 0 || (inRound >= 0 && inRound % round.beats === 0);
      if (cfg.click) playClick(ctx, firstBeat + nextBeat * beatDur, accent, clicks);
      nextBeat++;
    }
    const buf = mic.read();
    const t = strums.feed(buf, now);
    if (t !== null) onStrum(t, now);

    while (jobs.length && jobs[0].at <= now) {
      const job = jobs.shift();
      const k = job.seg;
      const prev = k > 0 ? shapes[(k + 1) % 2] : null;
      if (job.kind === 'strum') {
        const b = mic.buffer.subarray(mic.buffer.length - job.W);
        let c = judge(b, shapes[k % 2], prev);
        // not it? maybe the old chord was still ringing underneath — judge only the new sound
        if ((c.v === 'prev' || c.v === 'wrong') && job.before && E.Sound.rms(job.before) > E.Sound.rms(b) * 0.3) {
          const n = judge(b, shapes[k % 2], prev, job.before);
          if (n.v === 'ok' || n.v === 'messy') c = n;
        }
        c.err = job.err;
        round.results[k].cands.push(c);
        if (c.played) round.lastPlayedSeg = Math.max(round.lastPlayedSeg, k);
      } else {
        // wrap-up: no strum caught? check whether the chord is ringing anyway
        if (!round.results[k].cands.length) {
          const f = judge(mic.buffer.subarray(mic.buffer.length - winW), shapes[k % 2], prev);
          round.results[k].fallback = f;
          if (f.v === 'ok' || f.v === 'messy') { round.lastPlayedSeg = Math.max(round.lastPlayedSeg, k); lastPlayedAt = now; }
        }
        finalize(k);
      }
    }
    if (now - lastPlayedAt > E.Pause.AFTER_SEC) { pause('auto'); return; }
    renderRun(now);
    if (!jobs.length && now > segStart(round.nSeg) - 0.1) {
      if (round.lastPlayedSeg < round.nSeg - 1 && now - lastPlayedAt > END_GRACE) { pause('auto'); return; }
      finishRound(false);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function onStrum(t, now) {
    lastPlayedAt = now;
    const played = t - delay;                     // when you played it, on the clock of the clicks you hear
    const k = baseSeg + Math.round((played - roundStart) / segLen);
    if (k < baseSeg || k >= round.nSeg || round.results[k].final) return;
    const err = played - segStart(k);
    const buf = mic.buffer, sr = mic.sampleRate;
    const onsetIdx = buf.length - Math.round((now - t) * sr);
    const Wb = onsetIdx >= 16384 ? 16384 : 8192;
    const before = onsetIdx >= Wb ? buf.slice(onsetIdx - Wb, onsetIdx) : null;
    jobs.push({ kind: 'strum', seg: k, err, W: winW, before, at: t + 0.05 + winW / sr });
    sortJobs();
    // the 3D strings shake with your strum
    const g = g3(), sh = shapes[k % 2];
    if (g && sh) sh.frets.forEach((f, i) => { if (f >= 0) g.pluck(i, 0.9, f); });
  }

  function judge(buf, target, prev, before = null) {
    const P = profile();
    if (E.Sound.rms(buf) < 0.003) return { v: 'silent' };
    const h = before ? E.Chords.hearNew(before, buf, mic.sampleRate) : E.Chords.hear(buf, mic.sampleRate);
    if (h.flatness > 0.05) return { v: 'noise' };
    const fT = E.Chords.fit(h, target);
    const fP = prev ? E.Chords.fit(h, prev) : -9;
    const top = E.Chords.recognize(h)[0];
    const played = Math.max(fT, fP) >= 0.15 || top.score >= 0.25;
    const isIt = top.shape === target || top.shape.chord === target.chord || fT >= top.score - P.drill.rank;
    if (!isIt || fT < 0.25 || fT <= fP + P.drill.margin) {
      const still = prev && (fP >= fT || top.shape === prev || top.shape.chord === prev.chord);
      return { v: still ? 'prev' : 'wrong', heard: top.score >= 0.25 ? top.shape.name : '', played };
    }
    const c = E.Chords.check(h, target, P.chord);
    if (before) {
      const wrongFret = c.strings.find((s) => s.status === 'wrong');
      return wrongFret && P.drill.mistakes < 1 ? { v: 'messy', detail: c.problems[0].split(' — ')[0], played: true } : { v: 'ok', played: true };
    }
    const mistakes = c.strings.filter((s) => ['muted', 'wrong', 'extra'].includes(s.status)).length;
    const quiet = c.strings.filter((s) => s.status === 'weak').length;
    if (mistakes <= P.drill.mistakes && quiet <= P.drill.quiet) return { v: 'ok', played: true };
    return { v: 'messy', detail: c.problems[0].split(' — ')[0], played: true };
  }

  function finalize(k) {
    const r = round.results[k];
    const tol = profile().drill.timing / 1000;
    const near = (l) => l.slice().sort((a, b) => Math.abs(a.err) - Math.abs(b.err))[0];
    const right = near(r.cands.filter((c) => c.v === 'ok' || c.v === 'messy'));
    const other = near(r.cands.filter((c) => c.v === 'prev' || c.v === 'wrong'));
    let f;
    if (right && right.v === 'messy') f = { v: 'messy', detail: right.detail, err: right.err };
    else if (right) f = { v: Math.abs(right.err) <= tol ? 'clean' : right.err < 0 ? 'early' : 'late', err: right.err };
    else if (other) f = { v: 'wrong', detail: other.v === 'prev' ? 'prev' : other.heard };
    else if (r.fallback && (r.fallback.v === 'ok' || r.fallback.v === 'messy')) f = { v: 'unheard' };
    else f = { v: 'missed' };
    r.final = f;
    persist();
    if (k === 0) return;                           // the first chord isn't a change
    drawHistory();
    const to = round.pair[k % 2], from = round.pair[(k + 1) % 2];
    const ms = (e) => `${Math.round(Math.abs(e) * 1000)} ms`;
    setStatus(
      f.v === 'clean' ? `✓ ${from} → ${to} · ${Math.abs(f.err) < 0.03 ? 'on the beat' : `${ms(f.err)} ${f.err < 0 ? 'early' : 'late'}`}` :
      f.v === 'early' ? `Early — ${to} came ${ms(f.err)} before the beat` :
      f.v === 'late' ? `Late — ${to} came ${ms(f.err)} after the beat` :
      f.v === 'messy' ? `Messy — ${to}: ${f.detail}` :
      f.v === 'wrong' ? (f.detail === 'prev' ? `Wrong chord — still ${from}` : f.detail ? `Wrong chord — sounded like ${f.detail}` : `Wrong chord — that wasn’t ${to}`) :
      f.v === 'unheard' ? `${to} is ringing, but I missed the strum` : 'Missed — no strum heard',
      cls(f.v));
    showTimingMark(f.err === undefined ? null : f);
    if (f.v === 'clean') bus.emit('flash', 0.3);
  }
  const cls = (v) => (v === 'clean' ? 'ok' : v === 'missed' || v === 'wrong' ? 'bad' : 'meh');
  const cleanCount = () => round.results.slice(1).filter((r) => r.final && r.final.v === 'clean').length;
  const playedSegs = () => round.lastPlayedSeg + 1;
  function setStatus(t, c) { const s = $('.dr-status'); s.textContent = t; s.className = `dr-status ${c}`; }

  // ── keeping an unfinished round ──
  function persist() {
    if (!round) return;
    round.savedAt = Date.now();
    try { localStorage.setItem(UNFINISHED, JSON.stringify(round)); } catch { /* full */ }
  }
  function clearRound() {
    closeMic();
    running = false; paused = ''; round = null; jobs = [];
    cancelAnimationFrame(raf);
    try { localStorage.removeItem(UNFINISHED); } catch { /* blocked */ }
  }
  function restore() {
    try {
      const r = JSON.parse(localStorage.getItem(UNFINISHED) || 'null');
      if (!r || !r.pair || !shapeOf(r.pair[0]) || !shapeOf(r.pair[1]) || !Array.isArray(r.results)) return;
      r.results = r.results.map((x) => ({ ...emptySeg(), ...x }));
      round = r;
      segLen = (60 / r.bpm) * r.beats;
      shapes = r.pair.map(shapeOf);
      paused = 'away';
      if (Date.now() - (r.savedAt || 0) > STALE_MS) { finishRound(true, true); round = null; paused = ''; }
    } catch { /* broken data */ }
  }

  // ── the beat guide (shifted by the phone's output delay so it matches the click you hear) ──
  function renderRun(now) {
    const pair = round.pair;
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const pos = (v - roundStart) / beatDur;
    const inCountIn = pos < 0;
    const seg = inCountIn ? -1 : Math.min(round.nSeg - 1, baseSeg + Math.floor(pos / round.beats));
    showTime(Math.max(0, segStart(round.nSeg) - Math.max(v, roundStart)));
    if (seg !== lastSeg) {
      if (lastSeg === -1 && seg >= 0) setStatus('', '');
      lastSeg = seg;
    }
    let lit, next, onStrumBeat = false, frac;
    if (v < firstBeat) { lit = null; next = pair[baseSeg % 2]; frac = 0; }
    else if (inCountIn) { lit = Math.ceil(-pos); next = pair[baseSeg % 2]; frac = (v - firstBeat) / (COUNT_IN * beatDur); }
    else {
      const inSeg = pos - Math.floor(pos / round.beats) * round.beats;
      const b = Math.floor(inSeg);
      onStrumBeat = b === 0 && inSeg < 0.6;
      next = onStrumBeat ? pair[seg % 2] : pair[(seg + 1) % 2];
      lit = b === 0 ? (onStrumBeat ? 'strum' : null) : round.beats - b;
      frac = inSeg / round.beats;
    }
    drawLights($('.dr-run .dr-lights'), inCountIn || v < firstBeat ? COUNT_IN : round.beats - 1, lit, next);
    $('.dr-bar i').style.transform = `scaleX(${Math.min(1, frac)})`;
    // big chord = the one to land on the next STRUM — same as the green dot and the dots on the 3D neck
    const holding = inCountIn || v < firstBeat ? '' : pair[seg % 2];
    const nowEl = $('.dr-chord');
    if (nowEl.textContent !== next) { nowEl.textContent = next; nowEl.classList.toggle('is-long', next.length > 3); }
    $('.dr-next').textContent = holding && holding !== next ? `${words.now} ${holding}` : inCountIn || v < firstBeat ? words.first : '';
    el.classList.toggle('is-strum', onStrumBeat);
    showChord(shapeOf(next));
    // the window pulses on every beat, harder on the strum
    const beatNo = Math.floor((v - firstBeat) / beatDur);
    if (v >= firstBeat && beatNo !== lastBeatLit) { lastBeatLit = beatNo; bus.emit('flash', onStrumBeat ? 0.3 : 0.1); }
    if (inCountIn) setStatus(baseSeg === 0 ? `${words.getReady} ${pair[baseSeg % 2]}` : `${words.welcomeBack} ${pair[baseSeg % 2]}`, '');
  }

  function showTimingMark(f) {
    const tol = profile().drill.timing / 1000;
    const zone = $('.dr-tl-zone'), dot = $('.dr-tl-dot');
    zone.style.left = `${50 - (tol / SHOW_RANGE) * 50}%`;
    zone.style.width = `${(tol / SHOW_RANGE) * 100}%`;
    if (!f) { dot.hidden = true; return; }
    const x = Math.max(-1, Math.min(1, f.err / SHOW_RANGE));
    dot.hidden = false;
    dot.style.left = `${50 + x * 50}%`;
    dot.className = `dr-tl-dot ${Math.abs(f.err) <= tol ? 'ok' : 'meh'}`;
  }

  // lights n … 1, then the big dot (labelled with the chord to strum). active = number | 'strum' | null
  function drawLights(box, n, active, label = 'STRUM') {
    if (box.dataset.n !== String(n) || box.dataset.label !== label) {
      box.dataset.n = String(n); box.dataset.label = label; box.dataset.active = '';
      let h = '';
      for (let i = n; i >= 1; i--) h += `<i data-n="${i}">${i}</i>`;
      box.innerHTML = `${h}<b class="${label.length > 3 ? 'long' : ''}"></b>`;
      box.querySelector('b').textContent = label;
    }
    const key = String(active);
    if (box.dataset.active === key) return;
    box.dataset.active = key;
    box.querySelectorAll('i').forEach((x) => x.classList.toggle('on', x.dataset.n === key));
    box.querySelector('b').classList.toggle('on', active === 'strum');
  }
  function showTime(left) {
    const s = Math.ceil(left);
    $('.dr-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function drawHistory() {
    if (!round) return;
    const h = $('.dr-history');
    if (h.children.length !== round.nSeg - 1) h.innerHTML = '<i></i>'.repeat(round.nSeg - 1);
    for (let k = 1; k < round.nSeg; k++) { const f = round.results[k].final; h.children[k - 1].className = f ? cls(f.v) : ''; }
    $('.dr-count').textContent = `${cleanCount()} ${words.clean}`;
  }
  function renderPaused() {
    el.classList.toggle('is-paused', !!paused);
    if (!paused || !round) return;
    showTime((round.nSeg - playedSegs()) * segLen);
    $('.dr-p-text').textContent = paused === 'auto' ? words.pausedAuto : words.pausedAway;
    $('.dr-p-prog').textContent = `${round.pair[0]} ↔ ${round.pair[1]} · ${round.bpm} BPM · ${Math.round(playedSegs() * segLen)} s · ${cleanCount()} ${words.clean}`;
    $('.dr-end').hidden = playedSegs() < 2;
    const idx = playedSegs() % 2;
    $('.dr-chord').textContent = round.pair[idx];
    $('.dr-chord').classList.toggle('is-long', round.pair[idx].length > 3);
    $('.dr-next').textContent = words.first;
    if (shapes[idx]) showChord(shapes[idx]);
  }

  // ── calibration: strum once on each of 8 clicks; the typical gap = your phone's delay ──
  let calRun = null;
  function openCalibration(thenDrill) {
    setView('cal');
    el.dataset.then = thenDrill ? '1' : '';
    const cur = E.Timing.offset();
    $('.dr-cal-beat').textContent = words.calTitle;
    $('.dr-cal-beat').classList.remove('is-strum');
    drawLights($('.dr-cal-lights'), COUNT_IN, null);
    calStatus(cur === null ? words.calIntro : `${words.calNow} ${Math.round(cur * 1000)} ms. ${words.calIntro}`, '');
    go.textContent = words.calGo; go.disabled = false;
    alt.hidden = false; alt.textContent = thenDrill ? words.calSkip : words.back;
  }
  const calStatus = (t, c) => { const s = $('.dr-cal-status'); s.textContent = t; s.className = `dr-cal-status ${c}`; };
  async function startCalibration() {
    if (calRun) return;
    closeMic();
    if (!(await micOrFail())) return;
    if (!open) { closeMic(); return; }
    setView('cal');
    alt.hidden = false; alt.textContent = el.dataset.then === '1' ? words.calSkip : words.back;
    const bd = 60 / CAL_BPM;
    calRun = { firstBeat: ctx.currentTime + 0.4, beatDur: bd, hits: [], det: E.Timing.strumDetector(mic.sampleRate), lastBeat: -1 };
    for (let i = 0; i < COUNT_IN + CAL_CLICKS; i++) playClick(ctx, calRun.firstBeat + i * bd, i === 0 || i >= COUNT_IN, clicks);
    go.textContent = words.listeningDots; go.disabled = true;
    calStatus(words.calListen, '');
    calLoop();
  }
  function calLoop() {
    if (!calRun) return;
    const now = ctx.currentTime, c = calRun;
    const t = c.det.feed(mic.read(), now);
    if (t !== null) {
      const i = Math.round((t - c.firstBeat) / c.beatDur);
      const gap = t - (c.firstBeat + i * c.beatDur);
      if (i >= COUNT_IN && i < COUNT_IN + CAL_CLICKS && gap > -0.15 && gap < 0.6) c.hits.push(gap);
      else if (i - 1 >= COUNT_IN && i - 1 < COUNT_IN + CAL_CLICKS && gap + c.beatDur < 0.6) c.hits.push(gap + c.beatDur);
      const g = g3(); if (g) for (let s = 0; s < 6; s++) g.pluck(s, 0.8, 0);
    }
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const pos = (v - c.firstBeat) / c.beatDur;
    const b = Math.floor(pos);
    const beatEl = $('.dr-cal-beat');
    beatEl.textContent = pos < 0 ? words.calTitle : b < COUNT_IN ? String(COUNT_IN - b) : b < COUNT_IN + CAL_CLICKS ? 'STRUM' : '·';
    beatEl.classList.toggle('is-strum', b >= COUNT_IN && pos - b < 0.45);
    const lit = pos < 0 || b >= COUNT_IN + CAL_CLICKS ? null : b < COUNT_IN ? COUNT_IN - b : pos - b < 0.6 ? 'strum' : null;
    drawLights($('.dr-cal-lights'), b < COUNT_IN ? COUNT_IN : 0, lit);
    if (pos >= 0 && b !== c.lastBeat) { c.lastBeat = b; bus.emit('flash', b >= COUNT_IN ? 0.3 : 0.1); }
    if (b >= COUNT_IN) calStatus(`${words.calHeard} ${c.hits.length} / ${CAL_CLICKS}`, '');
    if (now > c.firstBeat + (COUNT_IN + CAL_CLICKS) * c.beatDur + 0.6) { endCalibration(); return; }
    raf = requestAnimationFrame(calLoop);
  }
  function endCalibration() {
    const hits = calRun.hits.slice().sort((a, b) => a - b);
    stopCalibration();
    go.disabled = false; go.textContent = words.tryAgain;
    $('.dr-cal-beat').textContent = words.calTitle;
    if (hits.length < 5) { calStatus(`${words.calFew1} ${hits.length} / 8. ${words.calFew2}`, 'bad'); return; }
    const med = hits[Math.floor(hits.length / 2)];
    const spread = hits.map((h) => Math.abs(h - med)).sort((a, b) => a - b)[Math.floor(hits.length / 2)];
    if (spread > 0.06) { calStatus(words.calUneven, 'bad'); return; }
    E.Timing.save(med);
    calStatus(`${words.calDone} ${Math.round(med * 1000)} ms. ${words.calSaved}`, 'ok');
    bus.emit('flash', 0.4);
    if (el.dataset.then === '1') { go.textContent = `${words.start} · 1 min`; alt.hidden = true; el.dataset.then = 'go'; }
    else alt.textContent = words.back;
  }
  function stopCalibration() {
    calRun = null;
    cancelAnimationFrame(raf);
    clicks.slice().forEach((c) => { try { c.stop(); } catch { /* done */ } });
    clicks.length = 0;
    closeMic();
  }

  // ── round result ──
  // partial = ended early: only what was played counts; no tempo change, not "last time" / best
  function finishRound(partial, quiet = false) {
    const r = round;
    const n = partial ? playedSegs() : r.nSeg;
    clearRound();
    el.classList.remove('is-paused');
    if (n < 2) return false;
    const pair = r.pair;
    const segSec = (60 / r.bpm) * r.beats;
    const changes = n - 1;
    const finals = r.results.slice(1, n).map((x) => x.final || { v: 'missed' });
    const count = (v) => finals.filter((f) => f.v === v).length;
    const clean = count('clean'), early = count('early'), late = count('late');
    const wrong = count('wrong'), missed = count('missed') + count('unheard');
    const messy = finals.filter((f) => f.v === 'messy');
    const perMin = Math.round(clean / ((n * segSec) / 60));
    const accuracy = changes ? clean / changes : 0;
    const activeSec = Math.round(n * segSec);
    const errs = finals.filter((f) => typeof f.err === 'number').map((f) => f.err).sort((a, b) => a - b);
    const timingMs = errs.length ? Math.round(errs[Math.floor(errs.length / 2)] * 1000) : null;
    const prev = lastResult(pair), best = bestResult(pair);
    const issues = {};
    messy.forEach((f) => { issues[f.detail] = (issues[f.detail] || 0) + 1; });
    let nextBpm = r.bpm;
    if (cfg.auto && !partial) {
      if (accuracy >= 0.9) nextBpm = Math.min(160, r.bpm + 5);
      else if (accuracy < 0.6) nextBpm = Math.max(40, r.bpm - 5);
      cfg.bpm = nextBpm; save();
    }
    const arrow = `${pair[0]} → ${pair[1]}`;
    addLog({
      exercise: 'change-drill', title: 'Change drill', chords: pair.slice(),
      score: {
        changesPerMin: perMin, clean, changes, early, late, wrong, missed, messy: messy.length,
        bpm: r.bpm, beatsPerChord: r.beats, accuracy: Math.round(accuracy * 100), issues, timingMs,
        ...(partial ? { partial: true } : {}),
      },
      summary: `${arrow}: ${perMin} changes/min${prev ? ` (prev ${prev.score.changesPerMin})` : ''} @ ${r.bpm} BPM${partial ? ` · partial, ${activeSec} s` : ''}`,
      activeSec,
    });
    if (quiet) return true;

    setView('summary');
    $('.dr-big').textContent = perMin;
    $('.dr-sum-pair').textContent = `${arrow} · ${r.bpm} BPM · every ${r.beats} beats`;
    let compare = prev
      ? perMin > prev.score.changesPerMin ? `Up from ${prev.score.changesPerMin} last time`
        : perMin === prev.score.changesPerMin ? `Same as last time` : `Last time: ${prev.score.changesPerMin}`
      : 'First round on this pair — your baseline.';
    if (prev && perMin > best && best > 0) compare += ' · new best';
    if (partial) compare = `Partial round (${activeSec} s) — saved, not used for tempo or best.`;
    $('.dr-compare').textContent = compare;
    const lines = [`${clean} of ${changes} changes clean`];
    if (timingMs !== null) lines.push(Math.abs(timingMs) <= 40 ? `Timing: on the beat on average (${timingMs > 0 ? '+' : ''}${timingMs} ms)` : `Timing: you tend to strum ${Math.abs(timingMs)} ms ${timingMs > 0 ? 'late' : 'early'}`);
    if (early) lines.push(`${early} early`);
    if (late) lines.push(`${late} late`);
    if (messy.length) { const top = Object.entries(issues).sort((a, b) => b[1] - a[1])[0]; lines.push(`${messy.length} messy — mostly ${top[0]} (×${top[1]})`); }
    if (wrong) lines.push(`${wrong} wrong chord`);
    if (missed) lines.push(`${missed} missed`);
    $('.dr-details').innerHTML = lines.map((t) => `<li>${esc(t)}</li>`).join('');
    $('.dr-nextbpm').textContent = !cfg.auto || partial ? '' :
      nextBpm > r.bpm ? `Consistent — next round ${nextBpm} BPM` :
      nextBpm < r.bpm ? `Next round a bit slower: ${nextBpm} BPM` : `Next round stays at ${nextBpm} BPM · 90 % clean speeds it up`;
    bus.emit('flash', 0.5);
    return true;
  }

  // ── 3D ──
  let shownChord = '';
  function showChord(sh) {
    const g = g3();
    if (!g || !open) return;
    const key = sh ? sh.name : '';
    if (key === shownChord) return;
    shownChord = key;
    g.setChord(neckFrets(sh));
  }

  bus.on('ex:enter', (n) => {
    if (n !== 'drill') return;
    open = true;
    el.classList.add('is-open');
    shownChord = '';
    loadEngine().then((eng) => {
      const first = !E;
      E = eng;
      if (first) restore();
      if (!open) return;
      if (calReturn) { openCalibration(false); alt.textContent = words.back; return; }
      if (round && paused) { setView('run'); go.textContent = words.resume; renderPaused(); drawHistory(); return; }
      if (view !== 'summary') setView('setup');
      renderSetup();
    }).catch(() => { $('.dr-last').textContent = words.failed; });
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'drill') return;
    calReturn = '';
    stopAll();
    picker.close();
    open = false;
    el.classList.remove('is-open');
    shownChord = '';
    bus.emit('chord', [0, 2, 2, 0, 0, 0]);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', stopAll);

  return { el, hasPaused: () => !!(round && paused) };
}
