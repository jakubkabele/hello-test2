// Tuner (from v1) — guitar tuner using the YIN pitch detection algorithm.
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

  const MIN_FREQ = 60;          // lowest pitch we look for (Hz)
  const MAX_FREQ = 1000;        // highest pitch we look for (Hz)
  const YIN_THRESHOLD = 0.15;   // lower = stricter about what counts as a clear note
  const MIN_RMS = 0.008;        // below this loudness we treat the input as silence
  const IN_TUNE_CENTS = 5;
  const NEAR_CENTS = 20;
  const NEEDLE_RANGE = 50;      // needle spans ±50 cents
  const ONSET_FRAMES = 3;       // clear frames needed before showing a note
  const RELEASE_FRAMES = 18;    // unclear frames before fading to "—" (~0.3 s)
  const HISTORY = 5;            // median filter length
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
  let audioCtx = null;
  let analyser = null;
  let stream = null;
  let buffer = null;
  let yinBuf = null;
  let running = false;
  let rafId = 0;

  let lockedString = null;      // null = Auto, otherwise index into STRINGS
  let history = [];
  let goodFrames = 0;
  let badFrames = RELEASE_FRAMES;
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
      // Audio must be created inside the tap, or phones block it.
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Phone "voice" processing distorts music, so turn it off.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);

      buffer = new Float32Array(analyser.fftSize);
      yinBuf = new Float32Array(Math.ceil(audioCtx.sampleRate / MIN_FREQ) + 2);

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
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    history = [];
    goodFrames = 0;
    badFrames = RELEASE_FRAMES;
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
    const freq = rms(buffer) >= MIN_RMS ? yin(buffer, audioCtx.sampleRate) : null;

    if (freq) {
      goodFrames++;
      badFrames = 0;
      history.push(freq);
      if (history.length > HISTORY) history.shift();
      if (goodFrames >= ONSET_FRAMES) showPitch(median(history));
    } else {
      goodFrames = 0;
      badFrames++;
      if (badFrames >= RELEASE_FRAMES) {
        history = [];
        showSilence();
      }
    }

    if (!silent) activeMs += dt;

    // Ease the needle toward its target so it glides instead of jumping.
    shownCents += (targetCents - shownCents) * 0.18;
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
    if (abs <= IN_TUNE_CENTS) tunedStrings.add(idx);
    root.classList.remove('is-silent', 'in-tune', 'near', 'far');
    root.classList.add(abs <= IN_TUNE_CENTS ? 'in-tune' : abs <= NEAR_CENTS ? 'near' : 'far');
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

  // ---------- Pitch detection (YIN) ----------
  // Finds how many samples it takes for the wave to repeat itself.
  function yin(buf, sampleRate) {
    const tauMin = Math.floor(sampleRate / MAX_FREQ);
    const tauMax = Math.min(Math.ceil(sampleRate / MIN_FREQ), yinBuf.length - 1);
    const W = Math.min(2048, buf.length - tauMax);
    const d = yinBuf;

    // 1. Difference: how different is the wave from itself shifted by tau samples?
    d[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      // 2. Normalize so the threshold works at any volume.
      runningSum += sum;
      d[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
    }

    // 3. Pick the FIRST shift that matches well (avoids octave mistakes).
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < YIN_THRESHOLD) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return null;

    // 4. Refine between samples for sub-sample precision.
    let better = tau;
    if (tau > 1 && tau < tauMax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const denom = a + c - 2 * b;
      if (denom !== 0) better = tau + (a - c) / (2 * denom);
    }

    const freq = sampleRate / better;
    return freq >= MIN_FREQ && freq <= MAX_FREQ ? freq : null;
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

  function rms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
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
