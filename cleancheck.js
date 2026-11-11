// Clean chord check — two ways to check a chord, and two ways to choose it.
//
//   Strum:            strum the whole chord; it names the chord and lists
//                     what to fix (muted / wrong-fret / extra strings).
//   String by string: pluck each string low → high; each gets ✓ / ! / ✕.
//
//   Auto:  it works out which chord you played.
//   Pick:  you choose the chord and it checks against that.
//
// Background noise: a sound only counts if it has clear notes (not flat
// like a clap), keeps ringing (a knock dies at once), and — for strums —
// actually fits a chord shape. Everything else is ignored.

const CleanCheck = (() => {
  const SCREEN = 'clean-check';
  const NAMES = Chords.STRING_NAMES;
  const SETTINGS_KEY = 'practice.cleancheck.settings';

  const MAX_FLATNESS = 0.02;   // noisier than this = not a chord (clap, knock)
  const MIN_FIT = 0.3;         // how well the sound must fit a chord shape
  const MIN_RING = 0.08;       // still ringing at the end (vs. its start)
  const MIN_LEVEL = 0.004;     // quieter than this isn't a strum/pluck
  // From Settings (sensitivity level): ring / extra = how strict a string is
  // judged, stick = how hard it is to change the chord name in Auto, focus =
  // how clear a single pluck must be, giveUp = ms before remaining strings = muted.
  const P = () => Settings.profile().chord;

  // ---------- Elements ----------
  const root = document.querySelector(`[data-screen="${SCREEN}"]`);
  const modeBtns = root.querySelectorAll('[data-cc-mode]');
  const pickBtns = root.querySelectorAll('[data-cc-pick]');
  const chipsEl = root.querySelector('.chips');
  const nameEl = root.querySelector('.cc-name');
  const svg = root.querySelector('.cc-diagram');
  const promptEl = root.querySelector('.cc-prompt');
  const subEl = root.querySelector('.cc-sub');
  const listEl = root.querySelector('.cc-problems');
  const noteEl = root.querySelector('.cc-note');
  const btn = root.querySelector('.cc-start');
  const spotBtn = root.querySelector('.cc-spot');
  const errorEl = root.querySelector('.error');

  // ---------- State ----------
  const settings = loadSettings();
  let shape = null;        // chord shape being checked (or last recognized)
  let marks = [];          // per string: '' | 'ok' | 'ok-faint' | 'warn' | 'muted' | 'extra' | 'skip'
  let problems = [];       // text lines
  let showFaintNote = false;
  let message = '';        // big line
  let sub = '';            // small line under it

  let running = false;
  let phase = 'idle';      // idle | listen | capture | done
  let identifying = false; // string mode + auto: first strum names the chord
  let mic = null;
  let rafId = 0;
  let captureEnd = 0, captureKind = '', before = null, peak = 0;
  let baseRms = 0, baseBright = 0, ignoreUntil = 0;
  let lastFrame = 0, lastEvent = 0, activeMs = 0;
  let settleUntil = 0, settleLevel = 0; // wait for a strum to fade before plucks
  let lastHeard = null;    // chord shape recognized last time (for stickiness)

  // Hidden-string spot check (strum mode): strings that play the same note as a
  // lower string, an octave up, hide inside a strum — so we ask for a quick pluck.
  let spot = null;         // { name, wasClean } while the spot check runs
  let spotOffer = [];      // string indexes a strum couldn't verify

  // string-by-string progress
  let status = [];         // per string: null (to do) | 'ok' | 'wrong' | 'muted' | 'skip'
  let heardNote = [];

  // log
  let pendingString = null;  // last string-by-string result, saved when you move on
  let strumStats = {};       // chord name → { strums, clean, issues: {text: count} }

  // ---------- Settings ----------
  function loadSettings() {
    try {
      return { mode: 'strum', pick: 'auto', chord: 'Em', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
      return { mode: 'strum', pick: 'auto', chord: 'Em' };
    }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (settings.mode === b.dataset.ccMode) return;
    settings.mode = b.dataset.ccMode;
    saveSettings();
    restartFresh();
  }));
  pickBtns.forEach((b) => b.addEventListener('click', () => {
    if (settings.pick === b.dataset.ccPick) return;
    settings.pick = b.dataset.ccPick;
    saveSettings();
    restartFresh();
  }));

  // ---------- Chord picker ----------
  Chords.LIBRARY.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'chip' + (c.isBarre ? ' chip-barre' : '');
    b.textContent = c.name;
    b.addEventListener('click', () => {
      settings.chord = c.name;
      saveSettings();
      restartFresh();
    });
    chipsEl.appendChild(b);
  });

  function pickedShape() {
    return Chords.LIBRARY.find((c) => c.name === settings.chord) || Chords.LIBRARY[0];
  }

  // Settings changed: stop, save what we have, show a clean screen.
  function restartFresh() {
    const wasRunning = running;
    stop();
    resetView();
    render();
    if (wasRunning) start();
  }

  function resetView() {
    shape = settings.pick === 'manual' ? pickedShape() : null;
    marks = [];
    problems = [];
    showFaintNote = false;
    message = '';
    sub = '';
    identifying = false;
    spot = null;
    spotOffer = [];
    if (settings.mode === 'string' && shape) resetStrings();
    phase = 'idle';
  }

  function resetStrings() {
    savePendingString();
    status = shape.frets.map((f) => (f < 0 ? 'skip' : null));
    heardNote = shape.frets.map(() => 0);
    marks = status.map((s) => (s === 'skip' ? 'skip' : ''));
    problems = [];
  }

  // ---------- Start / stop ----------
  btn.addEventListener('click', () => (running ? stop() : start()));

  // String mode: after a check, tap a string to redo just that one.
  svg.addEventListener('click', (e) => {
    if (running || settings.mode !== 'string' || phase !== 'done' || !shape) return;
    const box = svg.getBoundingClientRect();
    const i = Math.round((((e.clientX - box.left) / box.width) * 240 - 30) / 36);
    if (i < 0 || i > 5 || shape.frets[i] < 0) return;
    status[i] = null;
    marks[i] = '';
    start();
  });

  async function start() {
    errorEl.hidden = true;
    try {
      mic = await Sound.openMic(32768);
    } catch {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      return;
    }
    running = true;
    settleUntil = 0;
    lastHeard = null;

    const redo = settings.mode === 'string' && phase === 'done' && status.some((s) => s === null);
    if (!redo) {
      message = '';
      sub = '';
      if (settings.mode === 'string') {
        if (settings.pick === 'auto') {
          savePendingString();
          shape = null;            // auto: strum once first to name the chord
          identifying = true;
          marks = [];
          problems = [];
        } else {
          shape = pickedShape();
          resetStrings();
        }
      }
    }
    phase = 'listen';
    baseRms = 0;
    baseBright = 0;
    lastFrame = performance.now();
    ignoreUntil = lastFrame + 400; // ignore the mic switching on
    lastEvent = 0;
    render();
    loop();
  }

  function stop() {
    if (running) Sound.closeMic();
    if (spot) { spot = null; settleUntil = 0; }
    spotOffer = [];
    running = false;
    cancelAnimationFrame(rafId);
    if (phase === 'listen' || phase === 'capture') phase = 'idle';
    savePendingString();
    saveStrumStats();
    render();
  }

  // ---------- Main loop ----------
  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250);
    lastFrame = now;
    if (lastEvent && now - lastEvent < 10000) activeMs += dt;

    const buf = mic.buffer;
    mic.analyser.getFloatTimeDomainData(buf);
    const recent = buf.length - 1024; // newest ~20 ms
    const r = Sound.rms(buf, recent);
    const br = Sound.brightness(buf, recent);

    if (phase === 'listen' && settleUntil) {
      // Let the identifying strum fade, or plucks would drown in it.
      if (r < settleLevel || now > settleUntil) {
        settleUntil = 0;
        if (spot) lastEvent = now; // "no sound for a while = muted" counts from here
        baseRms = r;
        baseBright = br;
        render();
      }
    } else if (phase === 'listen') {
      const hit =
        now > ignoreUntil &&
        ((br > baseBright * 2.2 && br > MIN_LEVEL * 0.3) || (r > baseRms * 1.8 && r > MIN_LEVEL));
      if (hit) {
        phase = 'capture';
        captureKind = (settings.mode === 'strum' && !spot) || identifying ? 'strum' : 'pluck';
        before = captureKind === 'pluck' ? buf.slice() : null; // what was ringing before
        // Wait until the whole 0.7 s window is filled with sound AFTER the hit.
        captureEnd = now + (buf.length / mic.sampleRate) * 1000 + 60;
        peak = r;
        render();
      } else {
        baseRms = baseRms * 0.9 + r * 0.1;
        baseBright = baseBright * 0.9 + br * 0.1;
        // String mode: nothing new for a while → remaining strings were muted.
        if ((settings.mode === 'string' || spot) && !identifying && lastEvent && now - lastEvent > P().giveUp &&
            (spot || status.some((s) => s === 'ok' || s === 'wrong'))) {
          status = status.map((s) => (s === null ? 'muted' : s));
          if (spot) finishSpot();
          else { finishStrings(); return; }
        }
      }
    } else if (phase === 'capture') {
      if (now - captureEnd < -500) peak = Math.max(peak, r); // loudest moment early on
      if (now >= captureEnd) {
        const ringing = r >= peak * MIN_RING;
        const after = buf.slice();
        if (captureKind === 'strum') onStrum(after, ringing);
        else onPluck(before, after);
        if (!running) return; // finished
        phase = 'listen';
        baseRms = r;
        baseBright = br;
        ignoreUntil = now + 150;
        render();
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  // ---------- Strum ----------
  function onStrum(buf, ringing) {
    const h = Chords.hear(buf, mic.sampleRate);
    const ranked = Chords.recognize(h);
    let best = ranked[0];
    // Stickiness: in Auto, keep the chord we heard last time unless the new
    // one fits clearly better (stops Em flickering to E7 for a moment).
    if (lastHeard && best.shape.chord !== lastHeard.chord) {
      const prev = ranked.find((r) => r.shape === lastHeard);
      if (prev && best.score - prev.score < P().stick) best = prev;
    }

    if (!ringing || h.flatness > MAX_FLATNESS || best.score < MIN_FIT) {
      sub = 'Didn’t catch a clear chord — strum again.';
      return; // background noise or a messy strum: ignore
    }
    lastEvent = performance.now();

    lastHeard = best.shape;
    if (identifying) {
      shape = best.shape;
      identifying = false;
      resetStrings();
      settleUntil = performance.now() + 4000;
      settleLevel = peak * 0.12;
      return;
    }

    const expected = settings.pick === 'manual' ? pickedShape() : best.shape;
    shape = expected;
    const result = Chords.check(h, expected, P());

    marks = result.strings.map((st) => {
      if (st.status === 'skip') return 'skip';
      if (st.status === 'ok' || st.status === 'unsure') return st.doubled ? 'ok-faint' : 'ok';
      if (st.status === 'muted') return 'muted';
      if (st.status === 'extra') return 'extra';
      return 'warn';
    });
    showFaintNote = marks.includes('ok-faint');
    problems = result.problems;

    const soundedLike = best.shape.chord !== expected.chord ? best.shape.name : null;
    if (soundedLike && settings.pick === 'manual') {
      message = `Sounded like ${soundedLike}, not ${expected.name}`;
      problems = ['Compare your fingers with the diagram above'];
      marks = [];
      showFaintNote = false;
      result.problems = [`played ${soundedLike}`];
      result.clean = false;
    } else if (result.clean) {
      message = `${expected.name} ✓ clean`;
    } else {
      message = `${expected.name} — ${result.problems.length === 1 ? '1 thing' : `${result.problems.length} things`} to fix`;
    }
    sub = '';

    // stats for the log
    const st = (strumStats[expected.name] = strumStats[expected.name] || { strums: 0, clean: 0, issues: {} });
    st.strums++;
    if (result.clean) st.clean++;
    result.problems.forEach((p) => {
      const short = p.split(' — ')[0];
      st.issues[short] = (st.issues[short] || 0) + 1;
    });

    // Strings the strum couldn't verify → spot check (automatic at Precise/Maximum).
    spotOffer = soundedLike && settings.pick === 'manual' ? [] : marks.map((m, i) => (m === 'ok-faint' ? i : -1)).filter((i) => i >= 0);
    if (spotOffer.length && P().spot) startSpot(result.clean);
  }

  // ---------- Hidden-string spot check ----------
  function startSpot(wasClean) {
    if (!running || !shape || !spotOffer.length) return;
    spot = { name: shape.name, wasClean, marks: marks.slice(), problems: problems.slice() };
    status = shape.frets.map((f, i) => (spotOffer.includes(i) ? null : 'skip'));
    heardNote = shape.frets.map(() => 0);
    spotOffer = [];
    // Wait for the strum to be palm-muted, or plucks would drown in it.
    settleUntil = performance.now() + 4000;
    settleLevel = peak * 0.12;
    lastEvent = 0;
    render();
  }

  spotBtn.addEventListener('click', () => {
    const st = strumStats[shape && shape.name];
    startSpot(!problems.length && !!st);
  });

  function finishSpot() {
    const added = [];
    status.forEach((s, i) => {
      if (s === 'skip') return;
      const name = NAMES[i] === 'e' ? 'high e' : NAMES[i];
      if (s === 'ok') marks[i] = 'ok';
      if (s === 'muted') {
        marks[i] = 'muted';
        added.push(`${name} string muted — a finger may be touching it`);
      }
      if (s === 'wrong') {
        marks[i] = 'warn';
        added.push(`${name} string: heard ${Chords.noteName(heardNote[i])}, should be ${Chords.noteName(shape.midi[i])} — check fret ${shape.frets[i]}`);
      }
    });
    marks = spot.marks.map((m, i) => (status[i] === 'skip' ? m : marks[i]));
    problems = spot.problems.concat(added);
    showFaintNote = marks.includes('ok-faint');
    message = problems.length
      ? `${shape.name} — ${problems.length === 1 ? '1 thing' : `${problems.length} things`} to fix`
      : `${shape.name} ✓ clean — every string checked`;
    sub = 'Strum again any time.';

    const st = strumStats[spot.name];
    if (st) {
      if (added.length && spot.wasClean) st.clean--;
      added.forEach((p) => {
        const short = p.split(' — ')[0];
        st.issues[short] = (st.issues[short] || 0) + 1;
      });
    }
    spot = null;
    status = [];
    settleUntil = 0;
    render();
  }

  // ---------- String by string ----------
  function onPluck(before, after) {
    const todo = status.map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);
    if (!todo.length) return;
    const current = todo[0];
    const want = shape.midi[current];

    // Candidates: the notes still to play, plus a fret either side of the
    // current string (finger on the wrong fret) and its octave.
    const candidates = new Set(todo.map((s) => shape.midi[s]));
    [-2, -1, 1, 2, 12].forEach((d) => candidates.add(want + d));
    const diff = Chords.newSound(before, after, mic.sampleRate);
    const heard = Chords.whichNote(diff, [...candidates]);
    if (heard.note < 0 || heard.focus < P().focus || diff.share < 0.05) return; // knock / thud / noise

    let matched = -1;
    if (heard.note === want || heard.note === want + 12) matched = current;
    else matched = todo.find((s) => shape.midi[s] === heard.note);

    if (matched !== undefined && matched >= 0) {
      // Strings before it that never rang were muted.
      todo.forEach((s) => { if (s < matched) status[s] = 'muted'; });
      status[matched] = 'ok';
    } else if (Math.abs(heard.note - want) <= 2) {
      status[current] = 'wrong';          // close, but not the right note
      heardNote[current] = heard.note;
    } else {
      return;
    }
    lastEvent = performance.now();
    if (spot) {
      // Keep the strum's marks; just update the strings being spot-checked.
      marks = spot.marks.map((m, i) =>
        status[i] === 'ok' ? 'ok' : status[i] === 'muted' ? 'muted' : status[i] === 'wrong' ? 'warn' : m);
    } else {
      updateStringMarks();
    }
    if (status.every((s) => s !== null)) {
      if (spot) finishSpot();
      else finishStrings();
    }
  }

  function updateStringMarks() {
    marks = status.map((s) => (s === 'skip' ? 'skip' : s === 'ok' ? 'ok' : s === 'wrong' ? 'warn' : s === 'muted' ? 'muted' : ''));
    problems = [];
    status.forEach((s, i) => {
      const name = NAMES[i] === 'e' ? 'high e' : NAMES[i];
      if (s === 'muted') problems.push(`${name} string muted — a finger may be touching it`);
      if (s === 'wrong') problems.push(`${name} string: heard ${Chords.noteName(heardNote[i])}, should be ${Chords.noteName(shape.midi[i])} — check fret ${shape.frets[i]}`);
    });
  }

  function finishStrings() {
    Sound.closeMic();
    running = false;
    cancelAnimationFrame(rafId);
    phase = 'done';
    updateStringMarks();

    const played = status.filter((s) => s !== 'skip').length;
    const clean = status.filter((s) => s === 'ok').length;
    const shortProblems = problems.map((p) => p.split(' — ')[0]);
    const summary = [`${clean}/${played} clean`, ...shortProblems].join(', ');
    message = `${shape.name} — ${clean}/${played} clean`;
    sub = problems.length ? 'Tap a string to redo it.' : 'All strings ring clean. Tap a string to redo it.';
    pendingString = {
      exercise: 'clean-check',
      title: 'Clean check',
      chords: [shape.name],
      score: { mode: 'string', clean, total: played, strings: status.map((s, i) => ({ string: NAMES[i], result: s })) },
      summary: `${shape.name} (string by string): ${summary}`,
      activeSec: Math.max(1, Math.round(activeMs / 1000)),
    };
    activeMs = 0;
    render();
  }

  // ---------- Log ----------
  // String results are saved when you move on, so redoing a string updates
  // the result instead of adding a second one.
  function savePendingString() {
    if (pendingString) Store.add(pendingString);
    pendingString = null;
  }

  function saveStrumStats() {
    const names = Object.keys(strumStats);
    if (!names.length) return;
    const parts = names.map((n) => {
      const st = strumStats[n];
      const top = Object.entries(st.issues).sort((a, b) => b[1] - a[1])[0];
      return `${n} ${st.clean}/${st.strums} clean` + (top ? ` (${top[0]} ×${top[1]})` : '');
    });
    Store.add({
      exercise: 'clean-check',
      title: 'Clean check',
      chords: names,
      score: { mode: 'strum', perChord: strumStats },
      summary: `strum: ${parts.join(', ')}`,
      activeSec: Math.max(1, Math.round(activeMs / 1000)),
    });
    strumStats = {};
    activeMs = 0;
  }

  // ---------- Drawing ----------
  function render() {
    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.ccMode === settings.mode));
    pickBtns.forEach((b) => b.classList.toggle('active', b.dataset.ccPick === settings.pick));
    chipsEl.hidden = settings.pick !== 'manual';
    chipsEl.querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.textContent === settings.chord));
    scrollChipIntoView();

    nameEl.textContent = shape ? shape.name : '—';
    nameEl.classList.toggle('dim', !shape);

    // Big line + small line
    let big = message;
    let small = sub;
    if (!big) {
      if (!running) {
        big = settings.mode === 'strum'
          ? (settings.pick === 'auto' ? 'Tap Start, then strum any chord.' : `Tap Start, then strum ${pickedShape().name}.`)
          : (settings.pick === 'auto' ? 'Tap Start, strum the chord once, then pluck each string.' : `Tap Start, then pluck each string of ${pickedShape().name}, low to high.`);
      } else {
        big = identifying ? 'Strum the chord once…' : settings.mode === 'strum' ? 'Listening — strum a chord.' : '';
      }
    }
    const plucking = running && !identifying && shape && (settings.mode === 'string' || spot);
    const hiddenNames = () => status.map((s, i) => (s === null ? (NAMES[i] === 'e' ? 'high e' : NAMES[i]) : null)).filter(Boolean).join(', ');
    if (plucking && spot && settleUntil) {
      big = 'Quick check: hidden strings';
      small = `Mute with your palm, then pluck ${hiddenNames()} — one at a time.`;
    } else if (plucking && settleUntil) {
      big = `Got it: ${shape.name}`;
      small = 'Mute the strings with your palm, then pluck each one.';
    } else if (plucking) {
      const todo = status.findIndex((s) => s === null);
      if (todo >= 0) {
        big = `Pluck the ${NAMES[todo] === 'e' ? 'high e' : NAMES[todo]} string`;
        const f = shape.frets[todo];
        small = (spot ? 'Quick check · ' : '') +
          (f === 0 ? 'open' : `fret ${f} · ${Chords.noteName(shape.midi[todo])}`) +
          (lastEvent ? ` — no sound for ${Math.round(P().giveUp / 1000)} s = muted` : '');
      }
    }
    if (phase === 'capture' && running) small = 'Listening…';
    promptEl.textContent = big;
    subEl.textContent = small;

    listEl.innerHTML = '';
    problems.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      listEl.appendChild(li);
    });
    noteEl.hidden = !(showFaintNote && settings.mode === 'strum') || !!spot;
    spotBtn.hidden = !(running && !spot && spotOffer.length && !P().spot);
    if (!spotBtn.hidden) {
      spotBtn.textContent = `Check hidden strings (${spotOffer.map((i) => (NAMES[i] === 'e' ? 'high e' : NAMES[i])).join(', ')})`;
    }

    btn.textContent = running ? 'Stop' : phase === 'done' ? 'Check again' : 'Start';
    btn.classList.toggle('listening', running);
    drawDiagram();
  }

  function scrollChipIntoView() {
    const active = chipsEl.querySelector('.chip.active');
    if (!active || !chipsEl.clientWidth) return;
    const left = active.offsetLeft;
    if (left < chipsEl.scrollLeft || left + active.offsetWidth > chipsEl.scrollLeft + chipsEl.clientWidth) {
      chipsEl.scrollLeft = left - (chipsEl.clientWidth - active.offsetWidth) / 2;
    }
  }

  function drawDiagram() {
    const X = (i) => 30 + i * 36;
    const NUT = 46, FRET = 40, FRETS = 5;
    const Y = (f) => NUT + (f - 0.5) * FRET;
    const parts = [];
    const todo = running && (settings.mode === 'string' || (spot && !settleUntil)) && !identifying && shape ? status.findIndex((s) => s === null) : -1;

    for (let f = 0; f <= FRETS; f++) {
      const y = NUT + f * FRET;
      parts.push(`<line x1="${X(0)}" x2="${X(5)}" y1="${y}" y2="${y}" class="${f === 0 ? 'nut' : 'fret'}"/>`);
    }
    for (let i = 0; i < 6; i++) {
      parts.push(`<line x1="${X(i)}" x2="${X(i)}" y1="${NUT}" y2="${NUT + FRETS * FRET}" class="string${i === todo ? ' current' : ''}"/>`);
    }
    if (shape) {
      if (shape.barre) {
        const { fret, from, to } = shape.barre;
        parts.push(`<rect x="${X(from) - 12}" y="${Y(fret) - 12}" width="${X(to) - X(from) + 24}" height="24" rx="12" class="dot"/>`);
      }
      shape.frets.forEach((f, i) => {
        if (f < 0) parts.push(`<text x="${X(i)}" y="${NUT - 14}" class="mark">×</text>`);
        else if (f === 0) parts.push(`<circle cx="${X(i)}" cy="${NUT - 19}" r="6" class="open"/>`);
        else if (!(shape.barre && shape.barre.fret === f && i >= shape.barre.from && i <= shape.barre.to)) {
          parts.push(`<circle cx="${X(i)}" cy="${Y(f)}" r="12" class="dot"/>`);
        }
      });
    }
    const base = NUT + FRETS * FRET;
    for (let i = 0; i < 6; i++) {
      parts.push(`<text x="${X(i)}" y="${base + 26}" class="label${i === todo ? ' current' : ''}">${NAMES[i]}</text>`);
      parts.push(markSvg(marks[i] || '', X(i), base + 56, i === todo));
    }
    svg.innerHTML = parts.join('');
  }

  function markSvg(m, x, y, isCur) {
    if (m === 'skip') return `<text x="${x}" y="${y + 6}" class="st st-skip">–</text>`;
    if (m === 'ok') return `<text x="${x}" y="${y + 7}" class="st st-clean">✓</text>`;
    if (m === 'ok-faint') return `<text x="${x}" y="${y + 7}" class="st st-clean faint">✓</text>`;
    if (m === 'warn') return `<text x="${x}" y="${y + 7}" class="st st-warn">!</text>`;
    if (m === 'muted') return `<text x="${x}" y="${y + 7}" class="st st-muted">✕</text>`;
    if (m === 'extra') return `<text x="${x}" y="${y + 7}" class="st st-muted">!</text>`;
    if (isCur) return `<circle cx="${x}" cy="${y}" r="9" class="st-current${phase === 'capture' ? ' hearing' : ''}"/>`;
    return `<circle cx="${x}" cy="${y}" r="3" class="st-todo"/>`;
  }

  // Called when the screen opens.
  function show() {
    if (!running && phase !== 'done' && !message) resetView();
    render();
  }

  window.addEventListener('pagehide', stop);

  resetView();
  render();

  return { screen: SCREEN, stop, show };
})();
