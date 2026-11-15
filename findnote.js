// Find the note — the app names a note, you find it on the fretboard and play it.
//
// How it listens (in plain words):
// • Every frame it takes the newest ~0.09 s of sound and finds its pitch with
//   YIN (the same method as the tuner): how often the wave repeats itself.
// • The pitch is turned into the nearest note. When the same note holds steady
//   for a few frames (and is close enough to in tune), that's "the note you played".
// • Any octave counts — a G is a G whether it's on the low E string or the high e.
//   "On the A string" is up to you: one pitch can come from several strings.
// • Time = from when the note appears until the right note starts to sound.
// • Breaks: 20 s with no sound pauses; play anything to carry on with a fresh note.

const FindNote = (() => {
  const SCREEN = 'find-note';
  const KEY = 'practice.findnote.settings';
  const ROUND = 10;                  // notes per round
  const MIN_RMS = 0.006;             // quieter than this = silence
  const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const STRINGS = [
    { name: 'E', label: 'low E', midi: 40 }, { name: 'A', label: 'A', midi: 45 },
    { name: 'D', label: 'D', midi: 50 }, { name: 'G', label: 'G', midi: 55 },
    { name: 'B', label: 'B', midi: 59 }, { name: 'e', label: 'high e', midi: 64 },
  ];
  const P = () => Settings.profile().findNote;

  // ---------- Elements ----------
  const root = document.querySelector(`[data-screen="${SCREEN}"]`);
  const $ = (s) => root.querySelector(s);
  const noteBtns = root.querySelectorAll('[data-fn-notes]');
  const chipsEl = $('.fn-strings');
  const noteEl = $('.fn-note'), whereEl = $('.fn-where'), heardEl = $('.fn-heard');
  const progEl = $('.fn-progress'), resultsEl = $('.fn-results');
  const startBtn = $('.fn-start'), skipBtn = $('.fn-skip'), errorEl = $('.error');

  // ---------- Settings ----------
  const cfg = (() => {
    const d = { notes: 'natural', string: -1 };
    try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return d; }
  })();
  const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };

  noteBtns.forEach((b) => b.addEventListener('click', () => { cfg.notes = b.dataset.fnNotes; saveCfg(); restart(); }));
  [{ name: 'Any string', i: -1 }, ...STRINGS.map((s, i) => ({ name: s.name === 'e' ? 'high e' : s.name === 'E' ? 'low E' : s.name, i }))].forEach((s) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = s.name;
    b.dataset.i = s.i;
    b.addEventListener('click', () => { cfg.string = s.i; saveCfg(); restart(); });
    chipsEl.appendChild(b);
  });

  // ---------- State ----------
  let running = false, paused = false, rafId = 0, mic = null;
  let target = null;          // { pc, fret? }
  let shownAt = 0;            // when the current note appeared (ms)
  let holdUntil = 0;          // showing ✓ — ignore sound until then
  let streakNote = -1, streak = 0, streakStart = 0;
  let lastCorrectPc = -1, lastWrongNote = -1;
  let lastSoundAt = 0;
  let results = [];           // { pc, sec } or { pc, skipped: true }
  let wrongCount = 0;
  let activeMs = 0, lastFrame = 0;
  const wake = Pause.playDetector();

  startBtn.addEventListener('click', () => (running ? stop() : start()));
  skipBtn.addEventListener('click', () => { if (running && !paused) { results.push({ pc: target.pc, skipped: true }); next(); } });

  function restart() {
    const was = running;
    stop();
    render();
    if (was) start();
  }

  async function start() {
    errorEl.hidden = true;
    noteEl.classList.remove('fn-done');
    try {
      mic = await Sound.openMic(4096);
    } catch {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      return;
    }
    running = true;
    paused = false;
    results = [];
    wrongCount = 0;
    activeMs = 0;
    lastCorrectPc = -1;
    target = null;
    resultsEl.innerHTML = '';
    lastFrame = lastSoundAt = performance.now();
    next();
    loop();
  }

  // Leaving the screen or tapping Stop: save what was done (as a partial round).
  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    Sound.closeMic();
    if (results.length) finish(true);
    else render();
  }

  function next() {
    if (results.length >= ROUND) { running = false; cancelAnimationFrame(rafId); Sound.closeMic(); finish(false); return; }
    const pool = cfg.notes === 'all' ? [...Array(12).keys()] : NATURAL;
    let pc;
    do { pc = pool[Math.floor(Math.random() * pool.length)]; } while (target && pc === target.pc && pool.length > 1);
    target = { pc };
    shownAt = performance.now();
    holdUntil = 0;
    streak = 0;
    lastWrongNote = -1;
    heardEl.textContent = '';
    heardEl.className = 'fn-heard';
    render();
  }

  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250);
    lastFrame = now;
    const buf = mic.buffer;
    mic.analyser.getFloatTimeDomainData(buf);

    if (paused) {
      if (wake.feed(buf, now)) { paused = false; lastSoundAt = now; next(); }
      rafId = requestAnimationFrame(loop);
      return;
    }

    const loud = Sound.rms(buf) >= MIN_RMS;
    if (loud) lastSoundAt = now;
    if (now - lastSoundAt < 10000) activeMs += dt;
    if (now - lastSoundAt > Pause.AFTER_MS) {
      paused = true;
      wake.reset();
      render();
      rafId = requestAnimationFrame(loop);
      return;
    }

    if (now >= holdUntil) {
      if (holdUntil) { holdUntil = 0; next(); }
      else listen(buf, loud, now);
    }
    rafId = requestAnimationFrame(loop);
  }

  // One frame of listening: is a steady note sounding? Which one?
  function listen(buf, loud, now) {
    const f = loud ? Sound.yin(buf, mic.sampleRate, 0.15) : null;
    if (!f) { streak = 0; streakNote = -1; return; }
    const m = 69 + 12 * Math.log2(f / 440);
    const n = Math.round(m);
    if (Math.abs(m - n) * 100 > P().cents) { streak = 0; streakNote = -1; return; }
    if (n === streakNote) streak++;
    else { streakNote = n; streak = 1; streakStart = now; }
    if (streak !== P().hold) return;

    const pc = ((n % 12) + 12) % 12;
    if (pc === target.pc) {
      const sec = Math.max(0, (streakStart - shownAt) / 1000);
      results.push({ pc, sec });
      lastCorrectPc = pc;
      heardEl.textContent = `✓ ${NAMES[pc]} · ${sec.toFixed(1)} s`;
      heardEl.className = 'fn-heard ok';
      holdUntil = now + 700;
      renderProgress();
    } else if (pc !== lastCorrectPc && n !== lastWrongNote) {
      // (the note you found last time may still be ringing — that doesn't count)
      lastWrongNote = n;
      wrongCount++;
      heardEl.textContent = `That’s ${NAMES[pc]} — looking for ${NAMES[target.pc]}`;
      heardEl.className = 'fn-heard meh';
    }
  }

  // ---------- Result ----------
  function finish(partial) {
    const found = results.filter((r) => !r.skipped);
    const skipped = results.length - found.length;
    const avg = found.length ? found.reduce((s, r) => s + r.sec, 0) / found.length : null;
    const where = cfg.string < 0 ? 'any string' : `${STRINGS[cfg.string].label} string`;
    const set = cfg.notes === 'all' ? 'all 12 notes' : 'natural notes';
    const prev = lastResult();
    if (found.length) {
      const avgText = avg.toFixed(1);
      const prevText = prev ? ` (prev ${prev.score.avgSec})` : '';
      Store.add({
        exercise: SCREEN,
        title: 'Find the note',
        score: {
          avgSec: Number(avgText), found: found.length, notes: results.length, skipped, wrong: wrongCount,
          mode: modeKey(), times: results.map((r) => (r.skipped ? null : Number(r.sec.toFixed(2)))),
          ...(partial ? { partial: true } : {}),
        },
        summary: `avg ${avgText} s${prevText} · ${found.length}/${results.length} · ${where}, ${set}${partial ? ' · partial' : ''}`,
        activeSec: Math.max(1, Math.round(activeMs / 1000)),
      });
    }
    // Show it
    target = null;
    noteEl.textContent = avg === null ? '—' : `${avg.toFixed(1)} s`;
    noteEl.className = 'fn-note fn-done';
    whereEl.textContent = avg === null ? 'Nothing found this time.' : `average · ${found.length} of ${results.length} found${partial ? ' (stopped early)' : ''}`;
    heardEl.className = 'fn-heard';
    heardEl.textContent = prev && avg !== null
      ? (avg < prev.score.avgSec ? `Faster than last time (${prev.score.avgSec} s) 🎉` : `Last time: ${prev.score.avgSec} s`)
      : avg !== null ? 'First round in this mode — this is your baseline.' : '';
    resultsEl.innerHTML = '';
    const lines = [];
    const sorted = found.slice().sort((a, b) => b.sec - a.sec);
    if (sorted.length >= 3) lines.push(`Slowest: ${sorted.slice(0, 2).map((r) => `${NAMES[r.pc]} (${r.sec.toFixed(1)} s)`).join(', ')}`);
    if (sorted.length) lines.push(`Fastest: ${NAMES[sorted[sorted.length - 1].pc]} (${sorted[sorted.length - 1].sec.toFixed(1)} s)`);
    if (wrongCount) lines.push(`${wrongCount} wrong note${wrongCount > 1 ? 's' : ''} on the way`);
    if (skipped) lines.push(`${skipped} skipped`);
    lines.forEach((t) => { const li = document.createElement('li'); li.textContent = t; resultsEl.appendChild(li); });
    renderControls();
  }

  const modeKey = () => `${cfg.notes}|${cfg.string}`;
  function lastResult() {
    const list = Store.all().filter((e) => e.exercise === SCREEN && e.score && !e.score.partial && e.score.mode === modeKey());
    return list[list.length - 1] || null;
  }

  // ---------- Drawing ----------
  function render() {
    renderControls();
    if (!running) {
      if (!noteEl.classList.contains('fn-done')) {
        noteEl.textContent = '—';
        noteEl.className = 'fn-note dim';
        whereEl.textContent = 'Tap Start. A note appears — find it and play it, as fast as you can.';
        heardEl.textContent = '';
        progEl.textContent = '';
      }
      return;
    }
    noteEl.className = 'fn-note';
    if (paused) {
      noteEl.textContent = 'Paused';
      noteEl.className = 'fn-note fn-paused';
      whereEl.textContent = `Nothing heard for ${Pause.AFTER_SEC} s. Play anything to carry on.`;
      heardEl.textContent = '';
      return;
    }
    noteEl.textContent = NAMES[target.pc];
    whereEl.textContent = cfg.string < 0 ? 'anywhere on the fretboard' : `on the ${STRINGS[cfg.string].label} string`;
    renderProgress();
  }

  function renderProgress() {
    progEl.innerHTML = '';
    for (let i = 0; i < ROUND; i++) {
      const d = document.createElement('i');
      const r = results[i];
      d.className = r ? (r.skipped ? 'bad' : 'ok') : i === results.length ? 'now' : '';
      progEl.appendChild(d);
    }
  }

  function renderControls() {
    noteBtns.forEach((b) => b.classList.toggle('active', b.dataset.fnNotes === cfg.notes));
    chipsEl.querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', Number(b.dataset.i) === cfg.string));
    startBtn.textContent = running ? 'Stop' : noteEl.classList.contains('fn-done') ? 'Go again' : 'Start';
    startBtn.classList.toggle('listening', running);
    skipBtn.hidden = !running || paused;
  }

  // ---------- Screen ----------
  function show() {
    if (!running) { noteEl.classList.remove('fn-done'); render(); }
  }

  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  render();

  return { screen: SCREEN, stop, show };
})();
