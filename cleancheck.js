// Clean chord check — pluck a chord string by string (low E → high e)
// and get each string marked clean / buzzing or wrong / muted.
//
// How it hears each string:
// 1. Wait for a pluck: a sudden jump in loudness or in "brightness"
//    (the sharp click of a pick or finger hitting a string).
// 2. For ~0.65 s after the pluck, check every frame: is the note this string
//    SHOULD make present in the sound? (Sound.presenceOf — it asks "does the
//    sound repeat at exactly this note's period?", so strings that are still
//    ringing from earlier don't confuse it.)
// 3. Note present most of the time → clean. Present only part of the time →
//    buzzing / dying fast. Not present but another clear note → wrong note.
//    Nothing clear at all → muted.

const CleanCheck = (() => {
  const SCREEN = 'clean-check';
  const NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

  // frets: low E → high e, -1 = don't play this string
  const CHORDS = [
    { name: 'C',  frets: [-1, 3, 2, 0, 1, 0] },
    { name: 'D',  frets: [-1, -1, 0, 2, 3, 2] },
    { name: 'E',  frets: [0, 2, 2, 1, 0, 0] },
    { name: 'G',  frets: [3, 2, 0, 0, 0, 3] },
    { name: 'A',  frets: [-1, 0, 2, 2, 2, 0] },
    { name: 'Am', frets: [-1, 0, 2, 2, 1, 0] },
    { name: 'Em', frets: [0, 2, 2, 0, 0, 0] },
    { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1] },
    { name: 'F',  frets: [1, 3, 3, 2, 1, 1],   barre: { fret: 1, from: 0, to: 5 }, isBarre: true },
    { name: 'Bm', frets: [-1, 2, 4, 4, 3, 2],  barre: { fret: 2, from: 1, to: 5 }, isBarre: true },
    { name: 'B',  frets: [-1, 2, 4, 4, 4, 2],  barre: { fret: 2, from: 1, to: 5 }, isBarre: true },
    { name: 'F#m', frets: [2, 4, 4, 2, 2, 2],  barre: { fret: 2, from: 0, to: 5 }, isBarre: true },
    { name: 'Cm', frets: [-1, 3, 5, 5, 4, 3],  barre: { fret: 3, from: 1, to: 5 }, isBarre: true },
    { name: 'G barre', frets: [3, 5, 5, 4, 3, 3], barre: { fret: 3, from: 0, to: 5 }, isBarre: true },
  ];

  const WINDOW_MS = 650;        // how long we listen after each pluck
  const SKIP_MS = 60;           // ignore the very first moment (pick noise)
  const PRESENT = 0.25;         // presence value that counts as "note is there"
  const CLEAN_FRAC = 0.5;       // note there ≥ 50% of the time → clean
  const BUZZ_FRAC = 0.15;       // note there 15–50% → buzzing / dies fast
  const WRONG_FRAC = 0.3;       // another note there ≥ 30% → wrong note
  const MIN_RMS = 0.006;        // quieter than this can't be a pluck
  const MIN_BRIGHT = 0.0015;

  // ---------- Elements ----------
  const root = document.querySelector(`[data-screen="${SCREEN}"]`);
  const chipsEl = root.querySelector('.chips');
  const nameEl = root.querySelector('.cc-name');
  const svg = root.querySelector('.cc-diagram');
  const promptEl = root.querySelector('.cc-prompt');
  const subEl = root.querySelector('.cc-sub');
  const btn = root.querySelector('.cc-start');
  const errorEl = root.querySelector('.error');

  // ---------- State ----------
  let chord = CHORDS.find((c) => c.name === 'F');
  let status = [];      // per string: null (to do) | 'clean' | 'warn' | 'muted' | 'skip'
  let detail = [];      // per string: text like "buzzing" / "wrong note (heard F#)"
  let heard = [];       // per string: the pitch it actually made (may still be ringing)
  let current = -1;     // string we're waiting for
  let phase = 'idle';   // idle | wait | listen | done
  let running = false;
  let rafId = 0;
  let mic = null;
  let frames = [];
  let listenStart = 0;
  let ignoreUntil = 0;
  let baseRms = 0;
  let baseBright = 0;
  let lastFrame = 0;
  let lastPluck = 0;
  let activeMs = 0;
  let pending = null;   // result waiting to be saved to the log

  // ---------- Chord picker ----------
  CHORDS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'chip' + (c.isBarre ? ' chip-barre' : '');
    b.textContent = c.name;
    b.addEventListener('click', () => selectChord(c));
    chipsEl.appendChild(b);
  });

  function selectChord(c) {
    if (c === chord && phase !== 'done') return;
    stop();
    chord = c;
    reset();
    render();
  }

  // ---------- Start / stop ----------
  btn.addEventListener('click', () => {
    if (running) {
      stop();
      reset();
      render();
    } else {
      if (phase === 'done') reset();
      start();
    }
  });

  // Tap a string's mark (after a check) to redo just that string.
  svg.addEventListener('click', (e) => {
    if (running || phase !== 'done') return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 240;
    const i = Math.round((x - 30) / 36);
    if (i < 0 || i > 5 || chord.frets[i] < 0) return;
    status[i] = null;
    detail[i] = '';
    current = i;
    start();
  });

  async function start() {
    errorEl.hidden = true;
    try {
      mic = await Sound.openMic();
    } catch {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      return;
    }
    running = true;
    if (current < 0) current = nextString();
    phase = 'wait';
    frames = [];
    baseRms = 0;
    baseBright = 0;
    lastFrame = performance.now();
    lastPluck = 0;
    ignoreUntil = lastFrame + 400; // ignore the mic switching on
    render();
    loop();
  }

  function stop() {
    if (running) Sound.closeMic();
    running = false;
    cancelAnimationFrame(rafId);
    if (phase === 'wait' || phase === 'listen') phase = 'idle';
    savePending();
    render();
  }

  function reset() {
    savePending();
    status = chord.frets.map((f) => (f < 0 ? 'skip' : null));
    detail = chord.frets.map(() => '');
    heard = chord.frets.map(() => 0);
    current = nextString();
    phase = 'idle';
    activeMs = 0;
  }

  function nextString() {
    return status.findIndex((s) => s === null);
  }

  // ---------- Main loop ----------
  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250);
    lastFrame = now;
    if (lastPluck && now - lastPluck < 8000) activeMs += dt;

    const buf = mic.buffer;
    mic.analyser.getFloatTimeDomainData(buf);

    // Only the newest ~20 ms decide if a pluck just happened.
    const recent = buf.length - 1024;
    const r = Sound.rms(buf, recent);
    const br = Sound.brightness(buf, recent);

    if (phase === 'wait') {
      const pluck =
        now > ignoreUntil &&
        ((br > baseBright * 2.2 && br > MIN_BRIGHT) || (r > baseRms * 1.6 && r > MIN_RMS));
      if (pluck) {
        phase = 'listen';
        listenStart = now;
        lastPluck = now;
        frames = [];
        render();
      } else {
        baseRms = baseRms * 0.9 + r * 0.1;
        baseBright = baseBright * 0.9 + br * 0.1;
      }
    } else if (phase === 'listen') {
      const t = now - listenStart;
      if (t > SKIP_MS) {
        const d = Sound.yinCurve(buf, mic.sampleRate);
        frames.push({
          presence: Sound.presenceOf(d, mic.sampleRate, expectedFreq(current)),
          pitch: Sound.yinPick(d, mic.sampleRate, 0.2),
        });
      }
      if (t >= WINDOW_MS) {
        judge(current);
        current = nextString();
        if (current < 0) {
          finish();
          return;
        }
        phase = 'wait';
        // Treat the strings still ringing as the new "quiet" level.
        baseRms = r;
        baseBright = br;
        ignoreUntil = now + 150;
        render();
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  function expectedFreq(i) {
    return Sound.OPEN_STRINGS[i] * Math.pow(2, chord.frets[i] / 12);
  }

  // ---------- Judging one string ----------
  function judge(i) {
    const n = frames.length || 1;
    const present = frames.filter((f) => f.presence < PRESENT).length / n;

    heard[i] = expectedFreq(i);

    if (present >= CLEAN_FRAC) {
      status[i] = 'clean';
      detail[i] = '';
      return;
    }
    if (present >= BUZZ_FRAC) {
      status[i] = 'warn';
      detail[i] = 'buzzing';
      return;
    }

    // Is some OTHER clear note there? Ignore what the earlier strings
    // actually played — those are just still ringing.
    const earlier = heard.filter((f, s) => f && s !== i);
    const others = frames
      .map((f) => f.pitch)
      .filter((p) => p && !earlier.some((e) => Math.abs(Sound.centsBetween(p, e)) < 50));
    if (others.length / n >= WRONG_FRAC) {
      others.sort((a, b) => a - b);
      heard[i] = others[Math.floor(others.length / 2)];
      status[i] = 'warn';
      detail[i] = `wrong note (heard ${Sound.noteName(heard[i])})`;
      return;
    }

    status[i] = 'muted';
    detail[i] = 'muted';
  }

  // ---------- Result ----------
  function finish() {
    running = false;
    cancelAnimationFrame(rafId);
    Sound.closeMic();
    phase = 'done';
    current = -1;

    const played = status.filter((s) => s !== 'skip').length;
    const clean = status.filter((s) => s === 'clean').length;
    const summary = resultText();

    pending = {
      exercise: 'clean-check',
      title: 'Clean check',
      chords: [chord.name],
      score: {
        clean,
        total: played,
        strings: status.map((s, i) => ({ string: NAMES[i], result: s, detail: detail[i] })),
      },
      summary: `${chord.name}: ${summary}`,
      activeSec: Math.max(1, Math.round(activeMs / 1000)),
    };
    render();
  }

  function resultText() {
    const played = status.filter((s) => s !== 'skip').length;
    const clean = status.filter((s) => s === 'clean').length;
    const problems = status
      .map((s, i) => (s === 'warn' || s === 'muted' ? `${NAMES[i]} string ${detail[i]}` : null))
      .filter(Boolean);
    return [`${clean}/${played} clean`, ...problems].join(', ');
  }

  // Results are saved when you leave, pick another chord, or check again —
  // so redoing a string updates the result instead of adding a new one.
  function savePending() {
    if (pending) Store.add(pending);
    pending = null;
  }

  // ---------- Drawing ----------
  function render() {
    nameEl.textContent = chord.name;
    chipsEl.querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.textContent === chord.name));
    scrollChipIntoView();

    if (phase === 'done') {
      promptEl.textContent = `${chord.name} — ${resultText()}`;
      subEl.textContent = 'Tap a string to redo it.';
      btn.textContent = 'Check again';
    } else if (phase === 'wait') {
      const f = chord.frets[current];
      promptEl.textContent = `Pluck the ${NAMES[current]} string`;
      subEl.textContent = f === 0 ? 'open' : `fret ${f} · ${Sound.noteName(expectedFreq(current))}`;
      btn.textContent = 'Stop';
    } else if (phase === 'listen') {
      promptEl.textContent = 'Listening…';
      subEl.textContent = 'let it ring';
      btn.textContent = 'Stop';
    } else {
      promptEl.textContent = 'Form the chord, tap Start, then pluck each string slowly — low to high.';
      subEl.textContent = '';
      btn.textContent = 'Start';
    }
    btn.classList.toggle('listening', running);
    drawDiagram();
  }

  // Keep the selected chord visible in the scrolling chip row.
  function scrollChipIntoView() {
    const active = chipsEl.querySelector('.chip.active');
    if (!active || !chipsEl.clientWidth) return;
    const left = active.offsetLeft - chipsEl.offsetLeft;
    if (left < chipsEl.scrollLeft || left + active.offsetWidth > chipsEl.scrollLeft + chipsEl.clientWidth) {
      chipsEl.scrollLeft = left - (chipsEl.clientWidth - active.offsetWidth) / 2;
    }
  }

  function drawDiagram() {
    const X = (i) => 30 + i * 36;
    const NUT = 46, FRET = 40, FRETS = 5;
    const Y = (f) => NUT + (f - 0.5) * FRET;
    const parts = [];

    // frets + nut
    for (let f = 0; f <= FRETS; f++) {
      const y = NUT + f * FRET;
      parts.push(`<line x1="${X(0)}" x2="${X(5)}" y1="${y}" y2="${y}" class="${f === 0 ? 'nut' : 'fret'}"/>`);
    }
    // strings
    for (let i = 0; i < 6; i++) {
      const cls = i === current && running ? 'string current' : 'string';
      parts.push(`<line x1="${X(i)}" x2="${X(i)}" y1="${NUT}" y2="${NUT + FRETS * FRET}" class="${cls}"/>`);
    }
    // barre
    if (chord.barre) {
      const { fret, from, to } = chord.barre;
      parts.push(`<rect x="${X(from) - 12}" y="${Y(fret) - 12}" width="${X(to) - X(from) + 24}" height="24" rx="12" class="dot"/>`);
    }
    // finger dots + open / muted marks
    chord.frets.forEach((f, i) => {
      if (f < 0) parts.push(`<text x="${X(i)}" y="${NUT - 14}" class="mark">×</text>`);
      else if (f === 0) parts.push(`<circle cx="${X(i)}" cy="${NUT - 19}" r="6" class="open"/>`);
      else if (!(chord.barre && chord.barre.fret === f && i >= chord.barre.from && i <= chord.barre.to)) {
        parts.push(`<circle cx="${X(i)}" cy="${Y(f)}" r="12" class="dot"/>`);
      }
    });
    // string names + result marks
    const base = NUT + FRETS * FRET;
    for (let i = 0; i < 6; i++) {
      const isCur = i === current && running;
      parts.push(`<text x="${X(i)}" y="${base + 26}" class="label${isCur ? ' current' : ''}">${NAMES[i]}</text>`);
      parts.push(statusMark(i, X(i), base + 56, isCur));
    }
    svg.innerHTML = parts.join('');
  }

  function statusMark(i, x, y, isCur) {
    const s = status[i];
    if (s === 'skip') return `<text x="${x}" y="${y + 6}" class="st st-skip">–</text>`;
    if (s === 'clean') return `<text x="${x}" y="${y + 7}" class="st st-clean">✓</text>`;
    if (s === 'warn') return `<text x="${x}" y="${y + 7}" class="st st-warn">!</text>`;
    if (s === 'muted') return `<text x="${x}" y="${y + 7}" class="st st-muted">✕</text>`;
    if (isCur) return `<circle cx="${x}" cy="${y}" r="9" class="st-current${phase === 'listen' ? ' hearing' : ''}"/>`;
    return `<circle cx="${x}" cy="${y}" r="3" class="st-todo"/>`;
  }

  window.addEventListener('pagehide', stop);

  reset();
  render();

  // Called when the screen opens (it was hidden, so sizes weren't known yet).
  function show() {
    scrollChipIntoView();
  }

  return { screen: SCREEN, stop, show };
})();
