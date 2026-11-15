// Chord change drill — switch between two chords on the beat for one minute.
//
// In plain words:
// • A metronome ticks; every N beats the chord switches (A → B → A …).
//   A moving bar and a 3 · 2 · 1 · STRUM counter show when to strum.
// • The app hears each strum and when it started, checks that it's really
//   the new chord, and says clean / early / late (by how many ms) / messy /
//   wrong chord / missed. Details in the Run section below.
// • Score = clean changes per minute. Tempo goes up when you're consistent.
// • Breaks: 20 s of silence pauses the round (see Pause / the Run section).

const Drill = (() => {
  const SCREEN = 'change-drill';
  const KEY = 'practice.drill.settings';
  const ROUND_SEC = 60;
  const COUNT_IN = 4;          // beats before the round starts

  const GROUPS = {
    warmup: {
      label: 'Warm-up',
      hint: 'Open → open. Get the hands moving.',
      pairs: [['C', 'G'], ['G', 'D'], ['Am', 'Em'], ['C', 'Am'], ['D', 'A'], ['Em', 'G'], ['A', 'E'], ['Am', 'Dm'], ['E', 'Am'], ['D', 'Em']],
    },
    barre1: {
      label: 'Open → barre',
      hint: 'Your main goal: land the barre on the beat.',
      pairs: [['C', 'F'], ['Am', 'F'], ['D', 'Bm'], ['G', 'Bm'], ['Em', 'Bm'], ['A', 'F#m'], ['Dm', 'F'], ['E', 'F#m']],
    },
    barre2: {
      label: 'Barre → barre',
      hint: 'New for you — start slow (50–60 BPM, change every 4 beats).',
      pairs: [['F', 'Bm'], ['F', 'G barre'], ['Bm', 'F#m'], ['F', 'Gm'], ['Bm', 'B'], ['G barre', 'Bm'], ['Cm', 'F']],
    },
    custom: { label: 'Custom', hint: 'Any two chords.', pairs: [] },
  };

  // ---------- Elements ----------
  const root = document.querySelector(`[data-screen="${SCREEN}"]`);
  const $ = (sel) => root.querySelector(sel);
  const setupEl = $('.dr-setup'), runEl = $('.dr-run'), sumEl = $('.dr-summary'), calEl = $('.dr-cal');
  const groupBtns = root.querySelectorAll('[data-group]');
  const beatBtns = root.querySelectorAll('[data-beats]');
  const errorEl = $('.error');

  // ---------- Settings ----------
  const cfg = load();
  function load() {
    const d = { group: 'barre1', pair: ['Am', 'F'], custom: ['C', 'F'], bpm: 60, beats: 4, auto: true, click: true };
    try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return d; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
  }

  const shapeOf = (name) => Chords.LIBRARY.find((c) => c.name === name);
  const pairKey = (p) => p.slice().sort().join('|');
  const currentPair = () => (cfg.group === 'custom' ? cfg.custom : cfg.pair);

  // ---------- Setup view ----------
  groupBtns.forEach((b) => b.addEventListener('click', () => { cfg.group = b.dataset.group; save(); renderSetup(); }));
  beatBtns.forEach((b) => b.addEventListener('click', () => { cfg.beats = Number(b.dataset.beats); save(); renderSetup(); }));
  $('.dr-minus').addEventListener('click', () => { cfg.bpm = Math.max(40, cfg.bpm - 5); save(); renderSetup(); });
  $('.dr-plus').addEventListener('click', () => { cfg.bpm = Math.min(160, cfg.bpm + 5); save(); renderSetup(); });
  $('.dr-auto').addEventListener('change', (e) => { cfg.auto = e.target.checked; save(); });
  $('.dr-click').addEventListener('change', (e) => { cfg.click = e.target.checked; save(); });

  const fromSel = $('.dr-from'), toSel = $('.dr-to');
  Chords.LIBRARY.forEach((c) => {
    fromSel.add(new Option(c.name, c.name));
    toSel.add(new Option(c.name, c.name));
  });
  fromSel.addEventListener('change', () => { cfg.custom[0] = fromSel.value; save(); renderSetup(); });
  toSel.addEventListener('change', () => { cfg.custom[1] = toSel.value; save(); renderSetup(); });

  function renderSetup() {
    groupBtns.forEach((b) => b.classList.toggle('active', b.dataset.group === cfg.group));
    beatBtns.forEach((b) => b.classList.toggle('active', Number(b.dataset.beats) === cfg.beats));
    $('.dr-bpm').textContent = cfg.bpm;
    $('.dr-auto').checked = cfg.auto;
    $('.dr-click').checked = cfg.click;
    $('.dr-group-hint').textContent = GROUPS[cfg.group].hint;

    const isCustom = cfg.group === 'custom';
    $('.dr-custom').hidden = !isCustom;
    fromSel.value = cfg.custom[0];
    toSel.value = cfg.custom[1];

    const list = $('.dr-pairs');
    list.innerHTML = '';
    list.hidden = isCustom;
    GROUPS[cfg.group].pairs.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'dr-pair' + (pairKey(p) === pairKey(cfg.pair) ? ' active' : '');
      const last = lastResult(p);
      b.innerHTML = `<span></span><span class="dr-pair-score"></span>`;
      b.firstChild.textContent = `${p[0]} ↔ ${p[1]}`;
      b.lastChild.textContent = last ? `last ${last.score.changesPerMin}/min` : 'new';
      b.addEventListener('click', () => { cfg.pair = p; save(); renderSetup(); });
      list.appendChild(b);
    });

    const p = currentPair();
    const same = p[0] === p[1];
    $('.dr-start').disabled = same;
    $('.dr-start').textContent = same ? 'Pick two different chords' : `Start: ${p[0]} ↔ ${p[1]} · 1 minute`;
    const off = Timing.offset();
    $('.dr-cal-info').textContent = off === null ? 'Timing not calibrated yet.' : `Timing calibrated · phone delay ${Math.round(off * 1000)} ms`;
    $('.dr-recal').textContent = off === null ? 'Calibrate (15 s)' : 'Redo';
  }

  function lastResult(pair) {
    const key = pairKey(pair);
    const list = Store.all().filter((e) => e.exercise === 'change-drill' && e.score && !e.score.partial && pairKey(e.chords) === key);
    return list[list.length - 1] || null;
  }

  function bestResult(pair) {
    const key = pairKey(pair);
    return Store.all()
      .filter((e) => e.exercise === 'change-drill' && e.score && !e.score.partial && pairKey(e.chords) === key)
      .reduce((m, e) => Math.max(m, e.score.changesPerMin), 0);
  }



  // ---------- Run ----------
  // A round = nSeg segments of `beats` beats; each segment after the first is one change.
  //
  // How a change is judged (in plain words):
  // 1. We hear each strum and WHEN it started (see timing.js), minus your
  //    phone's delay (calibration). Each strum belongs to the nearest change beat.
  // 2. Right after the strum we take up to ~0.7 s of its sound and ask the chord
  //    engine two things: is it really the new chord — the best match of all
  //    31 shapes, or very close to it (open strings or a different chord fail) —
  //    and are its strings fine?
  // 3. Right chord + strings fine + within ±150 ms of the beat (by sensitivity) = ✓ clean.
  //    Right chord but too early / too late = early / late (with how many ms).
  //    Right chord with a muted / wrong string = messy. Not the chord = wrong chord.
  //    No strum = missed.
  //
  // Breaks: when nothing is heard for 20 s, the round pauses — metronome and
  // clock stop, and the silent changes since you last played are thrown away
  // (not counted as missed). Play again (or tap Resume) → count-in, continue.
  // An unfinished round is kept on the phone (leaving the screen / locking it).
  const UNFINISHED_KEY = 'practice.drill.unfinished';
  const STALE_MS = 3 * 3600 * 1000;   // an unfinished round older than this is saved as partial
  const END_GRACE = 8;                // silent this long when the round ends → pause instead of finishing
  const SHOW_RANGE = 0.4;             // timing marker shows ±400 ms

  let round = null;             // { pair, bpm, beats, nSeg, results, lastPlayedSeg, savedAt }
  let running = false;          // listening + metronome ticking
  let paused = '';              // '' | 'auto' (mic still on, play to resume) | 'away' (tap to resume)
  let mic = null, ctx = null, rafId = 0;
  let shapes = [];
  let beatDur = 1, segLen = 4, baseSeg = 0, roundStart = 0, firstBeat = 0, totalBeats = 0;
  let nextBeat = 0;             // index of the next click to schedule
  let jobs = [];                // pending sound checks, sorted by time
  let lastPlayedAt = 0;         // audio-clock time playing was last heard
  let delay = 0;                // phone delay (s): calibrated or estimated
  let winW = 32768;             // samples of sound judged after a strum
  let clickBuf = null, clicks = [];
  const detector = Pause.playDetector();
  let strums = null;            // Timing.strumDetector

  let calSkipped = false;     // tapped "Skip" once → don't ask again this visit
  $('.dr-start').addEventListener('click', () => (Timing.offset() === null && !calSkipped ? openCalibration(true) : newRound()));
  $('.dr-again').addEventListener('click', () => newRound());
  $('.dr-stop').addEventListener('click', () => pause('away'));
  $('.dr-resume').addEventListener('click', () => resume());
  $('.dr-end').addEventListener('click', () => { if (!finishRound(true)) { view('setup'); renderSetup(); } });
  $('.dr-discard').addEventListener('click', () => { clearRound(); view('setup'); renderSetup(); });
  $('.dr-back').addEventListener('click', () => { view('setup'); renderSetup(); });
  $('.dr-recal').addEventListener('click', () => openCalibration(false));

  function view(name) {
    setupEl.hidden = name !== 'setup';
    runEl.hidden = name !== 'run';
    sumEl.hidden = name !== 'summary';
    calEl.hidden = name !== 'cal';
  }

  function newRound() {
    const p = currentPair().slice();
    if (!shapeOf(p[0]) || !shapeOf(p[1]) || p[0] === p[1]) return;
    const nSeg = Math.max(2, Math.round(ROUND_SEC / ((60 / cfg.bpm) * cfg.beats)));
    round = {
      pair: p, bpm: cfg.bpm, beats: cfg.beats, nSeg, lastPlayedSeg: -1,
      results: Array.from({ length: nSeg }, emptySeg),
    };
    resume();
  }
  const emptySeg = () => ({ cands: [], fallback: null, final: null });

  async function openMicOrFail() {
    try {
      mic = await Sound.openMic(32768);
      ctx = Sound.context();
      if (!clickBuf) clickBuf = makeClick();
      return true;
    } catch {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      view('setup');
      return false;
    }
  }

  // Start (or continue) listening from the first segment not yet played.
  async function resume() {
    errorEl.hidden = true;
    if (!round) return;
    shapes = round.pair.map(shapeOf);
    if (!mic || paused !== 'auto') { if (!(await openMicOrFail())) return; }
    delay = Timing.offset() ?? Timing.estimate(ctx);
    strums = Timing.strumDetector(mic.sampleRate);

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
    // One "wrap-up" per segment, after every strum that could belong to it has been judged.
    jobs = [];
    for (let k = baseSeg; k < round.nSeg; k++) {
      jobs.push({ kind: 'wrap', seg: k, at: segStart(k) + delay + segLen / 2 + winW / sr + 0.15 });
    }
    sortJobs();

    running = true;
    paused = '';
    lastSeg = -2;
    view('run');
    renderPaused();
    drawRunChords(baseSeg % 2);
    drawHistory();
    showTimingMark(null);
    $('.dr-status').textContent = '';
    $('.dr-howto').textContent =
      `Strum once when the big green dot flashes. ✓ = right chord within ±${Settings.profile().drill.timing} ms of it.`;
    cancelAnimationFrame(rafId);
    loop();
  }

  const segStart = (k) => roundStart + (k - baseSeg) * segLen;
  const sortJobs = () => jobs.sort((a, b) => a.at - b.at);

  // Pause the round. 'auto' keeps the mic on and waits for you to play;
  // 'away' (Pause button, left the screen, phone locked) turns the mic off.
  function pause(kind) {
    if (calRun) { stopCalibration(); return; }
    if (!round) return;
    if (running) {
      running = false;
      jobs = [];
      clicks.forEach((c) => { try { c.stop(); } catch {} });
      clicks = [];
      // Finish the last segment you played; the silent ones after it start over.
      const k = round.lastPlayedSeg;
      if (k >= 0 && !round.results[k].final) finalize(k);
      for (let j = k + 1; j < round.nSeg; j++) round.results[j] = emptySeg();
    }
    if (kind === 'away' || paused === 'away') {
      cancelAnimationFrame(rafId);
      if (mic) Sound.closeMic();
      mic = null;
    }
    paused = kind;
    detector.reset();
    persist();
    view('run');
    renderPaused();
    drawHistory();
    if (kind === 'auto') rafId = requestAnimationFrame(loop);
  }

  // Leaving the screen: keep the round, just stop listening.
  function stop() {
    if (calRun) stopCalibration();
    if (running || paused) pause('away');
  }

  function loop() {
    if (paused === 'auto') {
      // Paused: listen for you to start playing again.
      mic.analyser.getFloatTimeDomainData(mic.buffer);
      if (detector.feed(mic.buffer, performance.now())) { resume(); return; }
      rafId = requestAnimationFrame(loop);
      return;
    }
    if (!running) return;
    const now = ctx.currentTime;

    // Metronome: schedule clicks a little ahead so they're perfectly on time.
    while (nextBeat < totalBeats && firstBeat + nextBeat * beatDur < now + 0.2) {
      const inRound = nextBeat - COUNT_IN;
      const accent = nextBeat === 0 || (inRound >= 0 && inRound % round.beats === 0);
      if (cfg.click) playClick(firstBeat + nextBeat * beatDur, accent);
      nextBeat++;
    }

    mic.analyser.getFloatTimeDomainData(mic.buffer);
    const t = strums.feed(mic.buffer, now);
    if (t !== null) onStrum(t, now);

    // Sound checks that are due.
    while (jobs.length && jobs[0].at <= now) {
      const job = jobs.shift();
      if (job.kind === 'strum') {
        const buf = mic.buffer.subarray(mic.buffer.length - job.W);
        const k = job.seg;
        let c = judge(buf, shapes[k % 2], k > 0 ? shapes[(k + 1) % 2] : null);
        // Not it? Maybe the old chord was still ringing underneath — judge only the new sound.
        if ((c.v === 'prev' || c.v === 'wrong') && job.before && Sound.rms(job.before) > Sound.rms(buf) * 0.3) {
          const n = judge(buf, shapes[k % 2], k > 0 ? shapes[(k + 1) % 2] : null, job.before);
          if (n.v === 'ok' || n.v === 'messy') c = n;
        }
        c.err = job.err;
        round.results[k].cands.push(c);
        if (c.played) round.lastPlayedSeg = Math.max(round.lastPlayedSeg, k);
      } else {
        // Wrap-up: no strum caught? Check whether the chord is ringing anyway.
        const k = job.seg;
        if (!round.results[k].cands.length) {
          const buf = mic.buffer.subarray(mic.buffer.length - winW);
          const f = judge(buf, shapes[k % 2], k > 0 ? shapes[(k + 1) % 2] : null);
          round.results[k].fallback = f;
          if (f.v === 'ok' || f.v === 'messy') { round.lastPlayedSeg = Math.max(round.lastPlayedSeg, k); lastPlayedAt = now; }
        }
        finalize(k);
      }
    }

    // Nothing heard for 20 s → pause.
    if (now - lastPlayedAt > Pause.AFTER_SEC) { pause('auto'); return; }

    renderRun(now);

    if (!jobs.length && now > segStart(round.nSeg) - 0.1) {
      // Walked away near the end? Pause instead of counting the silence.
      if (round.lastPlayedSeg < round.nSeg - 1 && now - lastPlayedAt > END_GRACE) { pause('auto'); return; }
      finishRound(false);
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  // A strum started at audio time t: which change is it for, and how far off the beat?
  function onStrum(t, now) {
    lastPlayedAt = now;
    const played = t - delay;  // when you played it, on the clock of the clicks you hear
    const k = baseSeg + Math.round((played - roundStart) / segLen);
    if (k < baseSeg || k >= round.nSeg || round.results[k].final) return; // count-in or already judged
    const err = played - segStart(k);
    // Keep the sound from just before the strum (to subtract what was still ringing).
    const buf = mic.buffer, sr = mic.sampleRate;
    const onsetIdx = buf.length - Math.round((now - t) * sr);
    const Wb = onsetIdx >= 16384 ? 16384 : 8192;
    const before = onsetIdx >= Wb ? buf.slice(onsetIdx - Wb, onsetIdx) : null;
    jobs.push({ kind: 'strum', seg: k, err, W: winW, before, at: t + 0.05 + winW / sr });
    sortJobs();
  }

  // Is this sound the target chord (and not the previous one / something else)?
  // With `before`: judge only what's new since the strum (old chord still ringing);
  // then only a clearly wrong fret counts — shared strings can't be checked that way.
  function judge(buf, target, prev, before = null) {
    const P = Settings.profile();
    if (Sound.rms(buf) < 0.003) return { v: 'silent' };
    const h = before ? Chords.hearNew(before, buf, mic.sampleRate) : Chords.hear(buf, mic.sampleRate);
    if (h.flatness > 0.05) return { v: 'noise' };
    const fT = Chords.fit(h, target);
    const fP = prev ? Chords.fit(h, prev) : -9;
    const top = Chords.recognize(h)[0];
    const played = Math.max(fT, fP) >= 0.15 || top.score >= 0.25;
    // Must be (nearly) the best of all known shapes — open strings or another chord fail here.
    const isIt = top.shape === target || top.shape.chord === target.chord || fT >= top.score - P.drill.rank;
    if (!isIt || fT < 0.25 || fT <= fP + P.drill.margin) {
      const still = prev && (fP >= fT || top.shape === prev || top.shape.chord === prev.chord);
      return { v: still ? 'prev' : 'wrong', heard: top.score >= 0.25 ? top.shape.name : '', played };
    }
    const c = Chords.check(h, target, P.chord);
    if (before) {
      const wrongFret = c.strings.find((s) => s.status === 'wrong');
      return wrongFret && P.drill.mistakes < 1 ? { v: 'messy', detail: c.problems[0].split(' — ')[0], played: true } : { v: 'ok', played: true };
    }
    const mistakes = c.strings.filter((s) => ['muted', 'wrong', 'extra'].includes(s.status)).length;
    const quiet = c.strings.filter((s) => s.status === 'weak').length;
    if (mistakes <= P.drill.mistakes && quiet <= P.drill.quiet) return { v: 'ok', played: true };
    return { v: 'messy', detail: c.problems[0].split(' — ')[0], played: true };
  }

  // Decide one change from all strums heard for it.
  function finalize(k) {
    const r = round.results[k];
    const tol = Settings.profile().drill.timing / 1000;
    const near = (list) => list.slice().sort((a, b) => Math.abs(a.err) - Math.abs(b.err))[0];
    const right = near(r.cands.filter((c) => c.v === 'ok' || c.v === 'messy'));
    const other = near(r.cands.filter((c) => c.v === 'prev' || c.v === 'wrong'));
    let final;
    if (right && right.v === 'messy') final = { v: 'messy', detail: right.detail, err: right.err };
    else if (right) final = { v: Math.abs(right.err) <= tol ? 'clean' : right.err < 0 ? 'early' : 'late', err: right.err };
    else if (other) final = { v: 'wrong', detail: other.v === 'prev' ? 'prev' : other.heard };
    else if (r.fallback && (r.fallback.v === 'ok' || r.fallback.v === 'messy')) final = { v: 'unheard' };
    else final = { v: 'missed' };
    r.final = final;
    persist();

    if (k === 0) return; // the first chord isn't a change
    drawHistory();
    const pair = round.pair;
    const to = pair[k % 2], from = pair[(k + 1) % 2];
    const ms = (e) => `${Math.round(Math.abs(e) * 1000)} ms`;
    $('.dr-status').textContent =
      final.v === 'clean' ? `✓ ${from} → ${to} clean · ${Math.abs(final.err) < 0.03 ? 'right on the beat' : `${ms(final.err)} ${final.err < 0 ? 'early' : 'late'}`}` :
      final.v === 'early' ? `early — ${to} came ${ms(final.err)} before the beat` :
      final.v === 'late' ? `late — ${to} came ${ms(final.err)} after the beat` :
      final.v === 'messy' ? `messy — ${to}: ${final.detail}` :
      final.v === 'wrong' ? (final.detail === 'prev' ? `wrong chord — still ${from}` :
        final.detail ? `wrong chord — sounded like ${final.detail}, not ${to}` : `wrong chord — that wasn’t ${to}`) :
      final.v === 'unheard' ? `${to} is ringing, but I didn’t catch the strum` :
      'missed — no strum heard';
    $('.dr-status').className = 'dr-status ' + statusClass(final.v);
    showTimingMark(final.err === undefined ? null : final);
  }

  const statusClass = (v) => (v === 'clean' ? 'ok' : v === 'missed' || v === 'wrong' ? 'bad' : 'meh');
  const cleanCount = () => round.results.slice(1).filter((r) => r.final && r.final.v === 'clean').length;
  const playedSegs = () => round.lastPlayedSeg + 1;

  // ---------- Keeping an unfinished round ----------
  function persist() {
    if (!round) return;
    round.savedAt = Date.now();
    try { localStorage.setItem(UNFINISHED_KEY, JSON.stringify(round)); } catch {}
  }

  function clearRound() {
    if (mic) Sound.closeMic();
    mic = null;
    running = false;
    paused = '';
    round = null;
    jobs = [];
    cancelAnimationFrame(rafId);
    try { localStorage.removeItem(UNFINISHED_KEY); } catch {}
  }

  function restore() {
    try {
      const r = JSON.parse(localStorage.getItem(UNFINISHED_KEY) || 'null');
      if (!r || !r.pair || !shapeOf(r.pair[0]) || !shapeOf(r.pair[1]) || !Array.isArray(r.results)) return;
      r.results = r.results.map((x) => ({ ...emptySeg(), ...x }));
      round = r;
      segLen = (60 / r.bpm) * r.beats;
      shapes = r.pair.map(shapeOf);
      paused = 'away';
      if (Date.now() - (r.savedAt || 0) > STALE_MS) {
        // Old round: save what was played as a partial result and move on.
        finishRound(true, true);
        round = null;
        paused = '';
      }
    } catch {}
  }

  // ---------- Run view: the beat guide ----------
  // Everything you SEE is shifted by the phone's output delay, so the STRUM
  // flash lines up with the click you HEAR.
  let lastSeg = -2;
  function renderRun(now) {
    const pair = round.pair;
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const pos = (v - roundStart) / beatDur;          // beats since the round (re)started
    const inCountIn = pos < 0;
    const seg = inCountIn ? -1 : Math.min(round.nSeg - 1, baseSeg + Math.floor(pos / round.beats));
    showTime(Math.max(0, segStart(round.nSeg) - Math.max(v, roundStart)));

    if (seg !== lastSeg) {
      if (lastSeg === -1 && seg >= 0 && /^(Get ready|Welcome back)/.test($('.dr-status').textContent)) $('.dr-status').textContent = '';
      lastSeg = seg;
      drawRunChords((seg < 0 ? baseSeg : seg) % 2);
    }

    // Big beat counter: 4 · 3 · 2 · 1 · STRUM
    const beat = $('.dr-run .dr-beat'), fill = $('.dr-bar i');
    let label, strum = false, frac;
    if (v < firstBeat) { label = ''; frac = 0; }
    else if (inCountIn) {
      label = String(Math.ceil(-pos));
      frac = (v - firstBeat) / (COUNT_IN * beatDur);
    } else {
      const inSeg = pos - Math.floor(pos / round.beats) * round.beats;   // 0 … beats
      const b = Math.floor(inSeg);
      strum = b === 0 && inSeg < 0.45;
      label = b === 0 ? (strum ? 'STRUM' : '') : String(round.beats - b);
      frac = inSeg / round.beats;
    }
    if (beat.textContent !== label) beat.textContent = label;
    beat.classList.toggle('strum', strum);
    fill.style.width = `${Math.min(100, frac * 100)}%`;
    // Beat lights: 3 · 2 · 1 · ● — the green dot is the beat to strum on.
    const lights = $('.dr-run .dr-lights');
    if (v < firstBeat) drawLights(lights, COUNT_IN, null, pair[baseSeg % 2]);
    else if (inCountIn) drawLights(lights, COUNT_IN, Math.ceil(-pos), pair[baseSeg % 2]);
    else {
      const inSeg = pos - Math.floor(pos / round.beats) * round.beats;
      const b = Math.floor(inSeg);
      // On the strum beat the dot shows the chord you're landing; after it, the next one.
      const next = b === 0 && inSeg < 0.6 ? pair[seg % 2] : pair[(seg + 1) % 2];
      drawLights(lights, round.beats - 1, b === 0 ? (inSeg < 0.6 ? 'strum' : null) : round.beats - b, next);
    }

    if (inCountIn) {
      const first = pair[baseSeg % 2];
      $('.dr-status').textContent = baseSeg === 0
        ? `Get ready — strum ${first} on STRUM`
        : `Welcome back — ${first} on STRUM`;
      $('.dr-status').className = 'dr-status';
    }
  }

  // Small timeline under the guide: where your strum landed vs. the beat (centre line).
  function showTimingMark(f) {
    const tol = Settings.profile().drill.timing / 1000;
    const zone = $('.dr-tl-zone'), dot = $('.dr-tl-dot');
    zone.style.left = `${50 - (tol / SHOW_RANGE) * 50}%`;
    zone.style.width = `${(tol / SHOW_RANGE) * 100}%`;
    if (!f) { dot.hidden = true; return; }
    const x = Math.max(-1, Math.min(1, f.err / SHOW_RANGE));
    dot.hidden = false;
    dot.style.left = `${50 + x * 50}%`;
    dot.className = 'dr-tl-dot ' + (Math.abs(f.err) <= tol ? 'ok' : 'meh');
  }

  // A row of beat lights: numbered lights counting down (n … 1), then a big green dot.
  // `active` = the number to light, 'strum' to flash the green dot, or null.
  // `label` = text in the green dot (the chord to strum next).
  function drawLights(el, n, active, label = 'STRUM') {
    if (el.dataset.n !== String(n) || el.dataset.label !== label) {
      el.dataset.n = String(n);
      el.dataset.label = label;
      el.dataset.active = '';
      let h = '';
      for (let i = n; i >= 1; i--) h += `<i data-n="${i}">${i}</i>`;
      el.innerHTML = h + `<b class="${label.length > 3 ? 'long' : ''}"></b>`;
      el.querySelector('b').textContent = label;
    }
    const key = String(active);
    if (el.dataset.active === key) return;
    el.dataset.active = key;
    el.querySelectorAll('i').forEach((x) => x.classList.toggle('on', x.dataset.n === key));
    el.querySelector('b').classList.toggle('on', active === 'strum');
  }

  function showTime(left) {
    const secs = Math.ceil(left);
    $('.dr-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }

  function drawHistory() {
    const hist = $('.dr-history');
    if (hist.children.length !== round.nSeg - 1) hist.innerHTML = '<i></i>'.repeat(round.nSeg - 1);
    for (let k = 1; k < round.nSeg; k++) {
      const f = round.results[k].final;
      hist.children[k - 1].className = f ? statusClass(f.v) : '';
    }
    $('.dr-count').textContent = `${cleanCount()} clean`;
  }

  function renderPaused() {
    runEl.classList.toggle('is-paused', !!paused);
    if (!paused) return;
    const played = Math.round(playedSegs() * segLen);
    showTime((round.nSeg - playedSegs()) * segLen);
    $('.dr-pause-text').textContent = paused === 'auto'
      ? `Nothing heard for ${Pause.AFTER_SEC} s. Play a chord to carry on — or tap Resume.`
      : 'Tap Resume when you’re ready.';
    $('.dr-pause-progress').textContent =
      `${round.pair[0]} ↔ ${round.pair[1]} · ${round.bpm} BPM · ${played} s played · ${cleanCount()} clean so far`;
    $('.dr-end').hidden = playedSegs() < 2;
    drawRunChords(playedSegs() % 2);
  }

  // ---------- Timing calibration ----------
  // You strum any chord once on each of 8 clicks; the typical gap between the
  // click and the strum we hear = your phone's delay. Saved, redo any time.
  const CAL_BPM = 70, CAL_CLICKS = 8;
  let calRun = null;           // { firstBeat, beatDur, hits: [], thenDrill }
  $('.dr-cal-go').addEventListener('click', () => startCalibration());
  $('.dr-cal-skip').addEventListener('click', () => {
    const then = calEl.dataset.then === '1';
    if (then) { calSkipped = true; newRound(); } else { view('setup'); renderSetup(); }
  });

  function openCalibration(thenDrill) {
    view('cal');
    calEl.dataset.then = thenDrill ? '1' : '';
    const cur = Timing.offset();
    $('.dr-cal-beat').textContent = '';
    drawLights($('.dr-cal-lights'), COUNT_IN, null);
    $('.dr-cal-status').textContent = cur === null
      ? 'Not calibrated yet.'
      : `Current delay: ${Math.round(cur * 1000)} ms.`;
    $('.dr-cal-status').className = 'dr-cal-status';
    $('.dr-cal-go').textContent = 'Start calibration';
    $('.dr-cal-go').hidden = false;
    $('.dr-cal-skip').textContent = thenDrill ? 'Skip — use a rough guess' : 'Back';
  }

  async function startCalibration() {
    errorEl.hidden = true;
    if (!(await openMicOrFail())) return;
    const bd = 60 / CAL_BPM;
    calRun = { firstBeat: ctx.currentTime + 0.4, beatDur: bd, hits: [], det: Timing.strumDetector(mic.sampleRate) };
    for (let i = 0; i < COUNT_IN + CAL_CLICKS; i++) playClick(calRun.firstBeat + i * bd, i === 0 || i >= COUNT_IN);
    $('.dr-cal-go').hidden = true;
    $('.dr-cal-status').textContent = 'Listen to 4 clicks, then strum once on each of the next 8.';
    calLoop();
  }

  function calLoop() {
    if (!calRun) return;
    const now = ctx.currentTime;
    const c = calRun;
    mic.analyser.getFloatTimeDomainData(mic.buffer);
    const t = c.det.feed(mic.buffer, now);
    if (t !== null) {
      // nearest strum click
      const i = Math.round((t - c.firstBeat) / c.beatDur);
      const gap = t - (c.firstBeat + i * c.beatDur);
      if (i >= COUNT_IN && i < COUNT_IN + CAL_CLICKS && gap > -0.15 && gap < 0.6) c.hits.push(gap);
      // A big delay can push a strum past the halfway point to the next click.
      else if (i - 1 >= COUNT_IN && i - 1 < COUNT_IN + CAL_CLICKS && gap + c.beatDur < 0.6) c.hits.push(gap + c.beatDur);
    }
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const pos = (v - c.firstBeat) / c.beatDur;
    const beatEl = $('.dr-cal-beat');
    const b = Math.floor(pos);
    beatEl.textContent = pos < 0 ? '' : b < COUNT_IN ? String(COUNT_IN - b) : b < COUNT_IN + CAL_CLICKS ? 'STRUM' : '';
    beatEl.classList.toggle('strum', b >= COUNT_IN && pos - b < 0.45);
    // Same lights as the drill: 4 · 3 · 2 · 1, then the green dot on every strum click.
    const lit = pos < 0 || b >= COUNT_IN + CAL_CLICKS ? null : b < COUNT_IN ? COUNT_IN - b : pos - b < 0.6 ? 'strum' : null;
    drawLights($('.dr-cal-lights'), b < COUNT_IN ? COUNT_IN : 0, lit);
    if (b >= COUNT_IN) $('.dr-cal-status').textContent = `Strum on each click · heard ${c.hits.length} of ${CAL_CLICKS}`;

    if (now > c.firstBeat + (COUNT_IN + CAL_CLICKS) * c.beatDur + 0.6) { endCalibration(); return; }
    rafId = requestAnimationFrame(calLoop);
  }

  function endCalibration() {
    const hits = calRun.hits.slice().sort((a, b) => a - b);
    stopCalibration();
    const st = $('.dr-cal-status');
    $('.dr-cal-go').hidden = false;
    $('.dr-cal-go').textContent = 'Try again';
    if (hits.length < 5) {
      st.textContent = `I only heard ${hits.length} of 8 strums. Strum a full chord, a bit louder, once per click.`;
      st.className = 'dr-cal-status bad';
      return;
    }
    const med = hits[Math.floor(hits.length / 2)];
    const spread = hits.map((h) => Math.abs(h - med)).sort((a, b) => a - b)[Math.floor(hits.length / 2)];
    if (spread > 0.06) {
      st.textContent = 'Your strums were too uneven to measure — try again, just follow the click.';
      st.className = 'dr-cal-status bad';
      return;
    }
    Timing.save(med);
    st.textContent = `Done ✓ Your phone’s delay: ${Math.round(med * 1000)} ms. Saved — redo it if you switch to headphones.`;
    st.className = 'dr-cal-status ok';
    if (calEl.dataset.then === '1') {
      $('.dr-cal-go').hidden = true;
      $('.dr-cal-skip').textContent = 'Start the drill';
    } else {
      $('.dr-cal-skip').textContent = 'Back';
    }
    renderSetup();
  }

  function stopCalibration() {
    calRun = null;
    cancelAnimationFrame(rafId);
    clicks.forEach((c) => { try { c.stop(); } catch {} });
    clicks = [];
    if (mic) Sound.closeMic();
    mic = null;
  }

  function drawRunChords(currentIdx) {
    [0, 1].forEach((i) => {
      const box = $(i === 0 ? '.dr-a' : '.dr-b');
      box.classList.toggle('current', i === currentIdx);
      box.querySelector('.dr-name').textContent = round.pair[i];
      box.querySelector('.dr-diag').innerHTML = diagramSvg(shapes[i]);
    });
  }

  function diagramSvg(shape) {
    const X = (i) => 30 + i * 36, NUT = 46, FRET = 40, FRETS = 5;
    const Y = (f) => NUT + (f - 0.5) * FRET;
    const p = [];
    for (let f = 0; f <= FRETS; f++) p.push(`<line x1="${X(0)}" x2="${X(5)}" y1="${NUT + f * FRET}" y2="${NUT + f * FRET}" class="${f ? 'fret' : 'nut'}"/>`);
    for (let i = 0; i < 6; i++) p.push(`<line x1="${X(i)}" x2="${X(i)}" y1="${NUT}" y2="${NUT + FRETS * FRET}" class="string"/>`);
    if (shape.barre) {
      const { fret, from, to } = shape.barre;
      p.push(`<rect x="${X(from) - 12}" y="${Y(fret) - 12}" width="${X(to) - X(from) + 24}" height="24" rx="12" class="dot"/>`);
    }
    shape.frets.forEach((f, i) => {
      if (f < 0) p.push(`<text x="${X(i)}" y="${NUT - 14}" class="mark">×</text>`);
      else if (f === 0) p.push(`<circle cx="${X(i)}" cy="${NUT - 19}" r="6" class="open"/>`);
      else if (!(shape.barre && shape.barre.fret === f && i >= shape.barre.from && i <= shape.barre.to)) {
        p.push(`<circle cx="${X(i)}" cy="${Y(f)}" r="12" class="dot"/>`);
      }
    });
    return p.join('');
  }

  // ---------- Metronome click ----------
  // A short, bright "tick" (filtered noise) — it barely disturbs the listening.
  function makeClick() {
    const len = Math.round(ctx.sampleRate * 0.025);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      d[i] = (n - prev) * Math.exp(-i / (len / 5));
      prev = n;
    }
    return b;
  }

  function playClick(time, accent) {
    const src = ctx.createBufferSource();
    src.buffer = clickBuf;
    const g = ctx.createGain();
    g.gain.value = accent ? 0.9 : 0.4;
    src.connect(g).connect(ctx.destination);
    src.start(time);
    src.onended = () => { clicks = clicks.filter((c) => c !== src); };
    clicks.push(src);
  }



  // ---------- Round result ----------
  // partial = ended early: score only what was played; tempo isn't changed and
  // partial rounds don't count as "last time" / "best".
  // Returns true if a result was saved and shown.
  function finishRound(partial, quiet = false) {
    const r = round;
    const n = partial ? playedSegs() : r.nSeg;
    clearRound();
    if (n < 2) return false;           // not a single change played — nothing to save

    const pair = r.pair;
    const segSec = (60 / r.bpm) * r.beats;
    const changes = n - 1;
    const finals = r.results.slice(1, n).map((x) => x.final || { v: 'missed' });
    const count = (v) => finals.filter((f) => f.v === v).length;
    const clean = count('clean'), early = count('early'), late = count('late');
    const wrong = count('wrong'), missed = count('missed') + count('unheard');
    const messy = finals.filter((f) => f.v === 'messy');
    const minutes = (n * segSec) / 60;
    const perMin = Math.round(clean / minutes);
    const accuracy = changes ? clean / changes : 0;
    const activeSec = Math.round(n * segSec);

    // Typical timing of the strums that hit the right chord (median, in ms; + = late).
    const errs = finals.filter((f) => typeof f.err === 'number').map((f) => f.err).sort((a, b) => a - b);
    const timingMs = errs.length ? Math.round(errs[Math.floor(errs.length / 2)] * 1000) : null;

    const prev = lastResult(pair);
    const best = bestResult(pair);
    const issues = {};
    messy.forEach((f) => (issues[f.detail] = (issues[f.detail] || 0) + 1));

    // Tempo: up when consistent, down when it fell apart (full rounds only).
    const playedBpm = r.bpm;
    let nextBpm = playedBpm;
    if (cfg.auto && !partial) {
      if (accuracy >= 0.9) nextBpm = Math.min(160, playedBpm + 5);
      else if (accuracy < 0.6) nextBpm = Math.max(40, playedBpm - 5);
      cfg.bpm = nextBpm;
      save();
    }

    const arrow = `${pair[0]} → ${pair[1]}`;
    const prevText = prev ? ` (prev ${prev.score.changesPerMin})` : '';
    const partText = partial ? ` · partial, ${activeSec} s` : '';
    Store.add({
      exercise: 'change-drill',
      title: 'Change drill',
      chords: pair.slice(),
      score: {
        changesPerMin: perMin, clean, changes, early, late, wrong, missed, messy: messy.length,
        bpm: playedBpm, beatsPerChord: r.beats, accuracy: Math.round(accuracy * 100), issues, timingMs,
        ...(partial ? { partial: true } : {}),
      },
      summary: `${arrow}: ${perMin} changes/min${prevText} @ ${playedBpm} BPM${partText}`,
      activeSec,
    });
    if (quiet) return true;

    // Show it
    view('summary');
    $('.dr-big').textContent = perMin;
    $('.dr-pairname').textContent = `${arrow} · ${playedBpm} BPM · every ${r.beats} beat${r.beats > 1 ? 's' : ''}`;
    let compare = prev
      ? perMin > prev.score.changesPerMin ? `Up from ${prev.score.changesPerMin} last time 🎉`
        : perMin === prev.score.changesPerMin ? `Same as last time (${perMin})`
        : `Last time: ${prev.score.changesPerMin}`
      : 'First round on this pair — this is your baseline.';
    if (prev && perMin > best && best > 0) compare += ' · new best!';
    if (partial) compare = `Partial round (${activeSec} s played) — saved, but not used for tempo or your best.`;
    $('.dr-compare').textContent = compare;

    const details = $('.dr-details');
    details.innerHTML = '';
    const lines = [`${clean} of ${changes} changes clean`];
    if (timingMs !== null) {
      lines.push(Math.abs(timingMs) <= 40 ? `Timing: right on the beat on average (${timingMs > 0 ? '+' : ''}${timingMs} ms)`
        : `Timing: you tend to strum ${Math.abs(timingMs)} ms ${timingMs > 0 ? 'late' : 'early'}`);
    }
    if (early) lines.push(`${early} early — the chord came before the beat`);
    if (late) lines.push(`${late} late — the chord came after the beat`);
    if (messy.length) {
      const top = Object.entries(issues).sort((a, b) => b[1] - a[1])[0];
      lines.push(`${messy.length} messy — most often: ${top[0]} (×${top[1]})`);
    }
    if (wrong) lines.push(`${wrong} wrong chord`);
    if (missed) lines.push(`${missed} missed — no strum heard`);
    lines.forEach((t) => { const li = document.createElement('li'); li.textContent = t; details.appendChild(li); });

    $('.dr-next').textContent = !cfg.auto || partial ? '' :
      nextBpm > playedBpm ? `Consistent! Next round: ${nextBpm} BPM (+5)` :
      nextBpm < playedBpm ? `Next round a bit slower: ${nextBpm} BPM` :
      `Next round stays at ${nextBpm} BPM — get to 90% clean to speed up.`;
    return true;
  }

  // ---------- Screen ----------
  function show() {
    let wantCal = false;
    try { wantCal = sessionStorage.getItem('drill.calibrate') === '1'; sessionStorage.removeItem('drill.calibrate'); } catch {}
    if (round && paused) { view('run'); renderPaused(); drawHistory(); return; }
    if (wantCal && !running) { openCalibration(false); return; }
    if (!running) {
      if (sumEl.hidden && calEl.hidden) view('setup');
      renderSetup();
    }
  }

  // Phone locked / app switched / page closed: pause and keep the round.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);

  view('setup');
  restore();
  renderSetup();

  return { screen: SCREEN, stop, show, hasPaused: () => !!(round && paused) };
})();
