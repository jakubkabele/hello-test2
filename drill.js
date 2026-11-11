// Chord change drill — switch between two chords on the beat for one minute.
//
// How a change is judged (in plain words):
// • A metronome ticks; every N beats the chord switches (A → B → A …).
// • Right after each switch beat, the app takes ~0.7 s of sound and asks the
//   chord engine: does this sound fit the NEW chord better than the OLD one?
//   - yes, and the strings are fine        → ✓ clean change
//   - yes, but e.g. a string is muted       → messy
//   - not yet, but later in the same bar    → late
//   - no (old chord still ringing / silence) → missed
// • Score = clean changes per minute. Tempo goes up when you're consistent.

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
  const setupEl = $('.dr-setup'), runEl = $('.dr-run'), sumEl = $('.dr-summary');
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
  }

  function lastResult(pair) {
    const key = pairKey(pair);
    const list = Store.all().filter((e) => e.exercise === 'change-drill' && e.score && pairKey(e.chords) === key);
    return list[list.length - 1] || null;
  }

  function bestResult(pair) {
    const key = pairKey(pair);
    return Store.all()
      .filter((e) => e.exercise === 'change-drill' && e.score && pairKey(e.chords) === key)
      .reduce((m, e) => Math.max(m, e.score.changesPerMin), 0);
  }

  // ---------- Run ----------
  let running = false;
  let mic = null, ctx = null, rafId = 0;
  let pair = [], shapes = [];
  let beatDur = 1, segLen = 4, nSeg = 15, roundStart = 0, firstBeat = 0, totalBeats = 0;
  let nextBeat = 0;             // index of the next click to schedule
  let jobs = [];                // pending sound checks
  let results = [];             // per segment: { early, late, final }
  let clickBuf = null;

  $('.dr-start').addEventListener('click', start);
  $('.dr-stop').addEventListener('click', () => { stop(); show(); });
  $('.dr-again').addEventListener('click', start);
  $('.dr-back').addEventListener('click', () => { view('setup'); renderSetup(); });

  function view(name) {
    setupEl.hidden = name !== 'setup';
    runEl.hidden = name !== 'run';
    sumEl.hidden = name !== 'summary';
  }

  async function start() {
    errorEl.hidden = true;
    pair = currentPair().slice();
    shapes = pair.map(shapeOf);
    if (!shapes[0] || !shapes[1] || pair[0] === pair[1]) return;
    try {
      mic = await Sound.openMic(32768);
    } catch {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      return;
    }
    ctx = Sound.context();
    if (!clickBuf) clickBuf = makeClick();

    beatDur = 60 / cfg.bpm;
    segLen = beatDur * cfg.beats;
    nSeg = Math.max(2, Math.round(ROUND_SEC / segLen));
    firstBeat = ctx.currentTime + 0.4;
    roundStart = firstBeat + COUNT_IN * beatDur;
    totalBeats = COUNT_IN + nSeg * cfg.beats;
    nextBeat = 0;
    results = Array.from({ length: nSeg }, () => ({ early: null, late: null, final: null }));

    // Plan the sound checks: one right after each switch, one late in the bar.
    jobs = [];
    const sr = mic.sampleRate;
    for (let k = 0; k < nSeg; k++) {
      const s = roundStart + k * segLen;
      const room = segLen - 0.17;
      const W = [32768, 16384, 8192].find((w) => w / sr <= room) || 8192;
      jobs.push({ seg: k, kind: 'early', at: s + 0.12 + W / sr, W });
      if (segLen >= 1.8) jobs.push({ seg: k, kind: 'late', at: s + segLen - 0.08, W: 32768 });
    }
    jobs.sort((a, b) => a.at - b.at);

    running = true;
    lastSeg = -2;
    $('.dr-count').textContent = '0 clean';
    view('run');
    drawRunChords(0);
    $('.dr-history').innerHTML = '';
    for (let k = 1; k < nSeg; k++) $('.dr-history').insertAdjacentHTML('beforeend', '<i></i>');
    loop();
  }

  function stop() {
    if (running) Sound.closeMic();
    running = false;
    cancelAnimationFrame(rafId);
  }

  function loop() {
    if (!running) return;
    const now = ctx.currentTime;

    // Metronome: schedule clicks a little ahead so they're perfectly on time.
    while (nextBeat < totalBeats && firstBeat + nextBeat * beatDur < now + 0.2) {
      const inRound = nextBeat - COUNT_IN;
      const accent = nextBeat === 0 || (inRound >= 0 && inRound % cfg.beats === 0);
      if (cfg.click) playClick(firstBeat + nextBeat * beatDur, accent);
      nextBeat++;
    }

    // Sound checks that are due.
    while (jobs.length && jobs[0].at <= now) {
      const job = jobs.shift();
      mic.analyser.getFloatTimeDomainData(mic.buffer);
      const buf = mic.buffer.subarray(mic.buffer.length - job.W);
      const k = job.seg;
      const verdict = judge(buf, shapes[k % 2], k > 0 ? shapes[(k + 1) % 2] : null);
      results[k][job.kind] = verdict;
      const done = job.kind === 'late' || segLen < 1.8;
      if (done) finalize(k);
    }

    renderRun(now);

    if (now > roundStart + nSeg * segLen + 0.2 && !jobs.length) {
      finishRound();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  // Does this sound fit the target chord (better than the previous one)?
  function judge(buf, target, prev) {
    const P = Settings.profile();
    if (Sound.rms(buf) < 0.003) return { v: 'silent' };
    const h = Chords.hear(buf, mic.sampleRate);
    if (h.flatness > 0.05) return { v: 'noise' };
    const fT = Chords.fit(h, target);
    const fP = prev ? Chords.fit(h, prev) : -9;
    if (fT < 0.25 || fT <= fP + P.drill.margin) return { v: fP > fT ? 'prev' : 'unclear' };
    const c = Chords.check(h, target, P.chord);
    const mistakes = c.strings.filter((s) => ['muted', 'wrong', 'extra'].includes(s.status)).length;
    const quiet = c.strings.filter((s) => s.status === 'weak').length;
    if (mistakes <= P.drill.mistakes && quiet <= P.drill.quiet) return { v: 'ok' };
    return { v: 'messy', detail: c.problems[0].split(' — ')[0] };
  }

  function finalize(k) {
    const r = results[k];
    const e = r.early || { v: 'silent' };
    const l = r.late;
    let final;
    if (e.v === 'ok') final = { v: 'clean' };
    else if (l && l.v === 'ok') final = { v: 'late' };
    else if (e.v === 'messy') final = { v: 'messy', detail: e.detail };
    else if (l && l.v === 'messy') final = { v: 'late' };
    else final = { v: 'missed', detail: e.v === 'prev' ? 'prev' : e.v === 'silent' ? 'silent' : 'unclear' };
    r.final = final;

    if (k === 0) return; // the first chord isn't a change
    const dot = $('.dr-history').children[k - 1];
    if (dot) dot.className = final.v === 'clean' ? 'ok' : final.v === 'missed' ? 'bad' : 'meh';
    const to = pair[k % 2], from = pair[(k + 1) % 2];
    $('.dr-status').textContent =
      'Last change: ' + (
      final.v === 'clean' ? `✓ ${from} → ${to} clean` :
      final.v === 'late' ? `late — ${to} came after the beat` :
      final.v === 'messy' ? `messy — ${to}: ${final.detail}` :
      final.detail === 'prev' ? `missed — still on ${from}` :
      final.detail === 'silent' ? 'missed — no strum heard' : `missed — couldn’t hear ${to}`);
    $('.dr-status').className = 'dr-status ' + (final.v === 'clean' ? 'ok' : final.v === 'missed' ? 'bad' : 'meh');
    $('.dr-count').textContent = `${cleanCount()} clean`;
  }

  const cleanCount = () => results.slice(1).filter((r) => r.final && r.final.v === 'clean').length;

  // ---------- Run view ----------
  let lastSeg = -2;
  function renderRun(now) {
    const inCountIn = now < roundStart;
    const seg = inCountIn ? -1 : Math.min(nSeg - 1, Math.floor((now - roundStart) / segLen));
    const left = Math.max(0, roundStart + nSeg * segLen - Math.max(now, roundStart));
    const secs = Math.ceil(left);
    $('.dr-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    if (seg !== lastSeg) {
      lastSeg = seg;
      drawRunChords(Math.max(0, seg) % 2);
    }

    // beat dots
    const beatInSeg = inCountIn
      ? Math.floor((now - firstBeat) / beatDur)
      : Math.floor(((now - roundStart) % segLen) / beatDur);
    const n = inCountIn ? COUNT_IN : cfg.beats;
    const dots = $('.dr-beatdots');
    if (dots.children.length !== n) dots.innerHTML = '<i></i>'.repeat(n);
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i <= beatInSeg && now >= firstBeat));

    if (inCountIn) {
      const count = COUNT_IN - Math.max(0, Math.floor((now - firstBeat) / beatDur));
      $('.dr-status').textContent = `Get ready — ${pair[0]} first · ${Math.min(COUNT_IN, count)}`;
      $('.dr-status').className = 'dr-status';
    }
  }

  function drawRunChords(currentIdx) {
    [0, 1].forEach((i) => {
      const box = $(i === 0 ? '.dr-a' : '.dr-b');
      box.classList.toggle('current', i === currentIdx);
      box.querySelector('.dr-name').textContent = pair[i];
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
  }

  // ---------- Round result ----------
  function finishRound() {
    stop();
    const changes = nSeg - 1;
    const finals = results.slice(1).map((r) => r.final || { v: 'missed' });
    const clean = finals.filter((f) => f.v === 'clean').length;
    const late = finals.filter((f) => f.v === 'late').length;
    const missed = finals.filter((f) => f.v === 'missed').length;
    const messy = finals.filter((f) => f.v === 'messy');
    const minutes = (nSeg * segLen) / 60;
    const perMin = Math.round(clean / minutes);
    const accuracy = changes ? clean / changes : 0;

    const prev = lastResult(pair);
    const best = bestResult(pair);
    const issues = {};
    messy.forEach((f) => (issues[f.detail] = (issues[f.detail] || 0) + 1));

    // Tempo: up when consistent, down when it fell apart.
    const playedBpm = cfg.bpm;
    let nextBpm = playedBpm;
    if (cfg.auto) {
      if (accuracy >= 0.9) nextBpm = Math.min(160, playedBpm + 5);
      else if (accuracy < 0.6) nextBpm = Math.max(40, playedBpm - 5);
      cfg.bpm = nextBpm;
      save();
    }

    const arrow = `${pair[0]} → ${pair[1]}`;
    const prevText = prev ? ` (prev ${prev.score.changesPerMin})` : '';
    Store.add({
      exercise: 'change-drill',
      title: 'Change drill',
      chords: pair.slice(),
      score: {
        changesPerMin: perMin, clean, changes, late, missed, messy: messy.length,
        bpm: playedBpm, beatsPerChord: cfg.beats, accuracy: Math.round(accuracy * 100), issues,
      },
      summary: `${arrow}: ${perMin} changes/min${prevText} @ ${playedBpm} BPM`,
      activeSec: Math.round(nSeg * segLen),
    });

    // Show it
    view('summary');
    $('.dr-big').textContent = perMin;
    $('.dr-pairname').textContent = `${arrow} · ${playedBpm} BPM · every ${cfg.beats} beat${cfg.beats > 1 ? 's' : ''}`;
    let compare = prev
      ? perMin > prev.score.changesPerMin ? `Up from ${prev.score.changesPerMin} last time 🎉`
        : perMin === prev.score.changesPerMin ? `Same as last time (${perMin})`
        : `Last time: ${prev.score.changesPerMin}`
      : 'First round on this pair — this is your baseline.';
    if (prev && perMin > best && best > 0) compare += ' · new best!';
    $('.dr-compare').textContent = compare;

    const details = $('.dr-details');
    details.innerHTML = '';
    const lines = [`${clean} of ${changes} changes clean`];
    if (late) lines.push(`${late} late — the chord landed after the beat`);
    if (messy.length) {
      const top = Object.entries(issues).sort((a, b) => b[1] - a[1])[0];
      lines.push(`${messy.length} messy — most often: ${top[0]} (×${top[1]})`);
    }
    if (missed) lines.push(`${missed} missed`);
    lines.forEach((t) => { const li = document.createElement('li'); li.textContent = t; details.appendChild(li); });

    $('.dr-next').textContent = !cfg.auto ? '' :
      nextBpm > playedBpm ? `Consistent! Next round: ${nextBpm} BPM (+5)` :
      nextBpm < playedBpm ? `Next round a bit slower: ${nextBpm} BPM` :
      `Next round stays at ${nextBpm} BPM — get to 90% clean to speed up.`;
  }

  // ---------- Screen ----------
  function show() {
    if (!running) {
      if (sumEl.hidden) view('setup');
      renderSetup();
    }
  }

  window.addEventListener('pagehide', stop);
  view('setup');
  renderSetup();

  return { screen: SCREEN, stop, show };
})();
