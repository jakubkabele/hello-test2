// Tuner (from v1) — guitar tuner. Pitch detection (YIN) lives in audio.js.
// Now a module: Tuner.stop() is called when you leave the screen, and a
// tuning session is saved to the log when you stop listening.

const Tuner = (() => {
  // ---------- Settings ----------
  const STRINGS = [
    { name: 'E', freq: 82.41 },  // E2
    { name: 'A', freq: 110.0 },  // A2
    { name: 'D', freq: 146.83 }, // D3
    { name: 'G', freq: 196.0 },  // G3
    { name: 'B', freq: 246.94 }, // B3
    { name: 'E', freq: 329.63 }, // E4
  ];

  const YIN_THRESHOLD = 0.15;   // lower = stricter about what counts as a clear note
  const MIN_RMS = 0.008;        // below this loudness we treat the input as silence
  const NEEDLE_RANGE = 50;      // needle spans ±50 cents
  // How steady / exact the tuner is comes from Settings (sensitivity level):
  //   inTune / near: cents for green / amber · history: readings averaged
  //   ease: needle speed · onset / release: frames before a note shows / fades
  const P = () => Settings.profile().tuner;
  const MIN_LOG_SEC = 5;        // don't log tuner sessions shorter than this

  // ---------- Elements ----------
  const root = document.querySelector('[data-screen="tuner"]');
  const noteEl = document.getElementById('note');
  const hzEl = document.getElementById('hz');
  const centsEl = document.getElementById('cents');
  const needleEl = document.getElementById('needle');
  const startBtn = document.getElementById('start');
  const errorEl = document.getElementById('error');
  const modeButtons = root.querySelectorAll('.mode');

  // ---------- State ----------
  let analyser = null;
  let buffer = null;
  let sampleRate = 48000;
  let running = false;
  let rafId = 0;

  let lockedString = null;      // null = Auto, otherwise index into STRINGS
  let history = [];
  let goodFrames = 0;
  let badFrames = 999;
  let silent = true;
  let shownCents = 0;           // smoothed needle position
  let targetCents = 0;

  let activeMs = 0;             // time a note was actually heard
  let lastFrame = 0;
  const tunedStrings = new Set();

  // ---------- Mode row ----------
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      lockedString = btn.dataset.mode === 'auto' ? null : Number(btn.dataset.mode);
      history = [];
    });
  });

  // ---------- Start / stop ----------
  startBtn.addEventListener('click', () => {
    if (running) stop();
    else start();
  });

  async function start() {
    errorEl.hidden = true;
    try {
      const mic = await Sound.openMic();
      analyser = mic.analyser;
      buffer = mic.buffer;
      sampleRate = mic.sampleRate;

      running = true;
      activeMs = 0;
      lastFrame = performance.now();
      tunedStrings.clear();
      startBtn.textContent = 'Stop';
      startBtn.classList.add('listening');
      loop();
    } catch (err) {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      stop();
    }
  }

  function stop() {
    const wasRunning = running;
    running = false;
    cancelAnimationFrame(rafId);
    if (wasRunning) Sound.closeMic();
    analyser = null;
    history = [];
    goodFrames = 0;
    badFrames = 999;
    shownCents = 0;
    needleEl.style.transform = '';
    startBtn.textContent = 'Start listening';
    startBtn.classList.remove('listening');
    showSilence();

    if (wasRunning) saveToLog();
  }

  function saveToLog() {
    const sec = activeMs / 1000;
    if (sec < MIN_LOG_SEC) return;
    const names = [...tunedStrings].sort((a, b) => a - b).map((i) => (i === 5 ? 'e' : STRINGS[i].name));
    Store.add({
      exercise: 'tuner',
      title: 'Tuner',
      summary: names.length ? `in tune: ${names.join(' ')}` : 'no string reached in tune',
      score: { inTune: names.length },
      activeSec: Math.round(sec),
    });
  }

  // ---------- Main loop ----------
  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250); // ignore long gaps (tab in background)
    lastFrame = now;

    analyser.getFloatTimeDomainData(buffer);
    const freq = Sound.rms(buffer) >= MIN_RMS ? Sound.yin(buffer, sampleRate, YIN_THRESHOLD) : null;

    if (freq) {
      goodFrames++;
      badFrames = 0;
      history.push(freq);
      while (history.length > P().history) history.shift();
      if (goodFrames >= P().onset) showPitch(median(history));
    } else {
      goodFrames = 0;
      badFrames++;
      if (badFrames >= P().release) {
        history = [];
        showSilence();
      }
    }

    if (!silent) activeMs += dt;

    // Ease the needle toward its target so it glides instead of jumping.
    shownCents += (targetCents - shownCents) * P().ease;
    const pct = (clamp(shownCents, -NEEDLE_RANGE, NEEDLE_RANGE) / NEEDLE_RANGE) * 50;
    needleEl.style.transform = `translateX(${pct * needleEl.parentElement.clientWidth / 100}px)`;

    rafId = requestAnimationFrame(loop);
  }

  // ---------- Display ----------
  function showPitch(freq) {
    const idx = lockedString !== null ? lockedString : nearestString(freq);
    const target = STRINGS[idx];
    const cents = 1200 * Math.log2(freq / target.freq);

    silent = false;
    targetCents = cents;

    noteEl.textContent = target.name;
    noteEl.classList.remove('silent');
    hzEl.textContent = `${freq.toFixed(1)} Hz`;

    const rounded = Math.round(cents);
    centsEl.textContent = `${rounded > 0 ? '+' : ''}${rounded} cents`;

    const abs = Math.abs(cents);
    const { inTune, near } = P();
    if (abs <= inTune) tunedStrings.add(idx);
    root.classList.remove('is-silent', 'in-tune', 'near', 'far');
    root.classList.add(abs <= inTune ? 'in-tune' : abs <= near ? 'near' : 'far');
  }

  function showSilence() {
    if (silent && noteEl.textContent === '—') return;
    silent = true;
    targetCents = 0;
    noteEl.textContent = '—';
    noteEl.classList.add('silent');
    root.classList.remove('in-tune', 'near', 'far');
    root.classList.add('is-silent');
  }

  // ---------- Helpers ----------
  function nearestString(freq) {
    let best = 0;
    let bestDist = Infinity;
    STRINGS.forEach((s, i) => {
      const dist = Math.abs(Math.log2(freq / s.freq));
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best;
  }

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Closing or leaving the page still saves what you did.
  window.addEventListener('pagehide', stop);

  showSilence();

  return { stop };
})();
