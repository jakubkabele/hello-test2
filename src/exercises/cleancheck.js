// EX-02 CLEAN CHORD CHECK — runs inside the 3D world, on the fretboard.
//
//   Strum:            strum the whole chord; it names the chord and says what to fix
//                     (muted / wrong-fret / extra strings).
//   String by string: pluck each string low → high; each gets ✓ / ! / ✕.
//   Auto:  it works out which chord you played.   Pick:  you choose the chord.
//
// How it hears (plain words): the practice app's chord engine (public/practice/chords.js)
// splits ~0.7 s of sound into its frequencies, finds which notes add up to it, and fits
// those notes to 31 known chord shapes. A sound only counts if it has clear notes (a clap
// is "flat" noise), keeps ringing (a knock dies at once), and — for strums — fits a chord.
//
// In the world: the chord's dots sit on the 3D neck, the strings you play shake, and each
// string turns amber (rings clean) or red (problem). In string mode an amber ring marks the
// string + fret to pluck next.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { createPicker } from './picker.js';
import { loadEngine, openMic, profile, addLog, loadPrefs, savePrefs, neckFrets, STRING_LABEL, stringName } from './ear.js';

const PREFS = 'practice.cleancheck.settings';     // shared with the old screen
const MAX_FLATNESS = 0.02;   // noisier than this = not a chord (clap, knock)
const MIN_FIT = 0.3;         // how well the sound must fit a chord shape
const MIN_RING = 0.08;       // still ringing at the end (vs. its start)
const MIN_LEVEL = 0.004;     // quieter than this isn't a strum/pluck
const AFTER_MS = 20000;      // 20 s without playing = paused (same as Pause.AFTER_MS)

export function createCleanCheck({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-cc';
  el.dataset.ex = 'cleancheck';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read cc-read">
      <b class="cc-name">—</b>
      <span class="cc-big"></span><span class="cc-sub"></span>
    </div>
    <div class="ex-panel">
      <ol class="cc-strings" aria-label="Strings">${STRING_LABEL.map((n, i) => `<li><button type="button" data-s="${i}"><b>${n}</b><i></i></button></li>`).join('')}</ol>
      <ul class="cc-fix"></ul>
      <button type="button" class="ex-alt cc-spot" hidden></button>
      <div class="ex-opts">
        <div class="seg" role="group" aria-label="How to check">
          <button type="button" data-mode="strum">${esc(words.strum)}</button><button type="button" data-mode="string">${esc(words.string)}</button>
        </div>
        <button type="button" class="pick cc-pick"><span>${esc(words.chord)}</span><b>${esc(words.auto)}</b></button>
      </div>
    </div>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const nameEl = $('.cc-name'), bigEl = $('.cc-big'), subEl = $('.cc-sub'), fixEl = $('.cc-fix');
  const go = $('.ex-go'), spotBtn = $('.cc-spot'), pickSel = $('.cc-pick');
  const cells = [...el.querySelectorAll('.cc-strings button')];
  const modeBtns = [...el.querySelectorAll('[data-mode]')];

  let E = null;                // the practice app's engine (Chords, …), loaded on first open
  const settings = loadPrefs(PREFS, { mode: 'strum', pick: 'auto', chord: 'Em' });
  const P = () => profile().chord;

  // ── state (same as the old screen) ──
  let open = false;
  let shape = null, marks = [], problems = [], message = '', sub = '';
  let running = false, phase = 'idle', identifying = false, mic = null, raf = 0;
  let captureEnd = 0, captureKind = '', before = null, peak = 0;
  let baseRms = 0, baseBright = 0, ignoreUntil = 0;
  let lastFrame = 0, lastEvent = 0, activeMs = 0, startedAt = 0, idle = false;
  let settleUntil = 0, settleLevel = 0, lastHeard = null;
  let spot = null, spotOffer = [];
  let status = [], heardNote = [];
  let pendingString = null, strumStats = {};
  let shownShape = '';

  const shapeByName = (n) => E.Chords.LIBRARY.find((c) => c.name === n) || E.Chords.LIBRARY[0];
  const pickedShape = () => shapeByName(settings.chord);

  // ── options ──
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (settings.mode === b.dataset.mode) return;
    settings.mode = b.dataset.mode; savePrefs(PREFS, settings); restartFresh();
  }));
  // the chord picker sheet: Auto, then every shape we know with a tiny fingering diagram
  const picker = createPicker(el);
  pickSel.addEventListener('click', async () => {
    if (!E) return;
    const item = (c) => ({ value: c.name, label: c.name, shape: c });
    const v = await picker.open({
      title: words.chord, jp: '和音', value: settings.pick === 'manual' ? settings.chord : 'auto',
      groups: [
        { items: [{ value: 'auto', label: words.auto, sub: words.autoSub, accent: true }], wide: true },
        { label: words.openChords, items: E.Chords.LIBRARY.filter((c) => !c.isBarre).map(item) },
        { label: words.barreChords, items: E.Chords.LIBRARY.filter((c) => c.isBarre).map(item) },
      ],
    });
    if (v === null) return;
    if (v === 'auto') settings.pick = 'auto';
    else { settings.pick = 'manual'; settings.chord = v; }
    savePrefs(PREFS, settings); restartFresh();
  });

  function restartFresh() {
    const was = running;
    stop(); resetView(); render();
    if (was) start();
  }
  function resetView() {
    shape = settings.pick === 'manual' ? pickedShape() : null;
    marks = []; problems = []; message = ''; sub = '';
    identifying = false; spot = null; spotOffer = [];
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

  // ── start / stop ──
  go.addEventListener('click', () => (running ? stop() : start()));
  $('.ex-exit').addEventListener('click', () => director.exit());
  // string mode, after a check: tap a string to redo just that one
  cells.forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.s;
    if (running || settings.mode !== 'string' || phase !== 'done' || !shape || shape.frets[i] < 0) return;
    status[i] = null; marks[i] = '';
    start();
  }));

  async function start() {
    if (!E) return;
    try { mic = await openMic(32768); } catch { message = words.denied; sub = ''; render(); return; }
    if (!open) { mic.close(); mic = null; return; }
    audio.duck(true);
    running = true; settleUntil = 0; lastHeard = null;
    const redo = settings.mode === 'string' && phase === 'done' && status.some((s) => s === null);
    if (!redo) {
      message = ''; sub = '';
      if (settings.mode === 'string') {
        if (settings.pick === 'auto') { savePendingString(); shape = null; identifying = true; marks = []; problems = []; }
        else { shape = pickedShape(); resetStrings(); }
      }
    }
    phase = 'listen';
    baseRms = 0; baseBright = 0;
    lastFrame = performance.now();
    ignoreUntil = lastFrame + 400;     // ignore the mic switching on
    lastEvent = 0; startedAt = lastFrame; idle = false;
    render();
    loop();
  }
  function stop() {
    if (mic) { mic.close(); mic = null; }
    if (running) audio.duck(false);
    if (spot) { spot = null; settleUntil = 0; }
    spotOffer = [];
    running = false;
    cancelAnimationFrame(raf);
    if (phase === 'listen' || phase === 'capture') phase = 'idle';
    savePendingString();
    saveStrumStats();
    render();
  }

  // ── main loop ──
  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250);
    lastFrame = now;
    if (lastEvent && now - lastEvent < 10000) activeMs += dt;
    const nowIdle = phase === 'listen' && now - Math.max(lastEvent, startedAt) > AFTER_MS;
    if (nowIdle !== idle) { idle = nowIdle; render(); }

    const buf = mic.read();
    const recent = buf.length - 1024;      // newest ~20 ms
    const r = E.Sound.rms(buf, recent);
    const br = E.Sound.brightness(buf, recent);

    if (phase === 'listen' && settleUntil) {
      // let the strum fade, or plucks would drown in it
      if (r < settleLevel || now > settleUntil) {
        settleUntil = 0;
        if (spot) lastEvent = now;
        baseRms = r; baseBright = br;
        render();
      }
    } else if (phase === 'listen') {
      const hit = now > ignoreUntil && ((br > baseBright * 2.2 && br > MIN_LEVEL * 0.3) || (r > baseRms * 1.8 && r > MIN_LEVEL));
      if (hit) {
        phase = 'capture';
        captureKind = (settings.mode === 'strum' && !spot) || identifying ? 'strum' : 'pluck';
        before = captureKind === 'pluck' ? buf.slice() : null;
        // wait until the whole 0.7 s window holds sound from AFTER the hit
        captureEnd = now + (buf.length / mic.sampleRate) * 1000 + 60;
        peak = r;
        render();
      } else {
        baseRms = baseRms * 0.9 + r * 0.1;
        baseBright = baseBright * 0.9 + br * 0.1;
        // string mode: nothing new for a while → remaining strings were muted
        if ((settings.mode === 'string' || spot) && !identifying && lastEvent && now - lastEvent > P().giveUp &&
            (spot || status.some((s) => s === 'ok' || s === 'wrong'))) {
          status = status.map((s) => (s === null ? 'muted' : s));
          if (spot) finishSpot();
          else { finishStrings(); return; }
        }
      }
    } else if (phase === 'capture') {
      if (now - captureEnd < -500) peak = Math.max(peak, r);
      if (now >= captureEnd) {
        const ringing = r >= peak * MIN_RING;
        const after = buf.slice();
        if (captureKind === 'strum') onStrum(after, ringing);
        else onPluck(before, after);
        if (!running) return;
        phase = 'listen';
        baseRms = r; baseBright = br;
        ignoreUntil = now + 150;
        render();
      }
    }
    raf = requestAnimationFrame(loop);
  }

  // ── strum ──
  function onStrum(buf, ringing) {
    const h = E.Chords.hear(buf, mic.sampleRate);
    const ranked = E.Chords.recognize(h);
    let best = ranked[0];
    // Auto: keep last time's chord unless the new one fits clearly better (no Em ↔ E7 flicker)
    if (lastHeard && best.shape.chord !== lastHeard.chord) {
      const prev = ranked.find((x) => x.shape === lastHeard);
      if (prev && best.score - prev.score < P().stick) best = prev;
    }
    if (!ringing || h.flatness > MAX_FLATNESS || best.score < MIN_FIT) { sub = words.unclear; return; }
    lastEvent = performance.now();
    lastHeard = best.shape;
    shake(best.shape);
    if (identifying) {
      shape = best.shape; identifying = false;
      resetStrings();
      settleUntil = performance.now() + 4000; settleLevel = peak * 0.12;
      return;
    }

    const expected = settings.pick === 'manual' ? pickedShape() : best.shape;
    shape = expected;
    const result = E.Chords.check(h, expected, P());
    marks = result.strings.map((st) => {
      if (st.status === 'skip') return 'skip';
      if (st.status === 'ok' || st.status === 'unsure') return st.doubled ? 'ok-faint' : 'ok';
      if (st.status === 'muted') return 'muted';
      if (st.status === 'extra') return 'extra';
      return 'warn';
    });
    problems = result.problems;

    const soundedLike = best.shape.chord !== expected.chord ? best.shape.name : null;
    if (soundedLike && settings.pick === 'manual') {
      message = `${words.soundedLike} ${soundedLike}`;
      problems = [words.compare];
      marks = [];
      result.problems = [`played ${soundedLike}`];
      result.clean = false;
    } else if (result.clean) message = words.clean;
    else message = result.problems.length === 1 ? words.oneFix : `${result.problems.length} ${words.fixes}`;
    sub = marks.includes('ok-faint') ? words.faint : '';
    bus.emit('flash', result.clean ? 0.35 : 0.15);

    const st = (strumStats[expected.name] = strumStats[expected.name] || { strums: 0, clean: 0, issues: {} });
    st.strums++;
    if (result.clean) st.clean++;
    result.problems.forEach((p) => { const k = p.split(' — ')[0]; st.issues[k] = (st.issues[k] || 0) + 1; });

    // strings a strum can't verify → quick pluck check (automatic at Precise / Maximum)
    spotOffer = soundedLike && settings.pick === 'manual' ? [] : marks.map((m, i) => (m === 'ok-faint' ? i : -1)).filter((i) => i >= 0);
    if (spotOffer.length && P().spot) startSpot(result.clean);
  }

  // ── hidden-string spot check ──
  function startSpot(wasClean) {
    if (!running || !shape || !spotOffer.length) return;
    spot = { name: shape.name, wasClean, marks: marks.slice(), problems: problems.slice() };
    status = shape.frets.map((f, i) => (spotOffer.includes(i) ? null : 'skip'));
    heardNote = shape.frets.map(() => 0);
    spotOffer = [];
    settleUntil = performance.now() + 4000; settleLevel = peak * 0.12;
    lastEvent = 0;
    render();
  }
  spotBtn.addEventListener('click', () => startSpot(!problems.length && !!strumStats[shape && shape.name]));

  function finishSpot() {
    const added = [];
    status.forEach((s, i) => {
      if (s === 'skip') return;
      if (s === 'ok') marks[i] = 'ok';
      if (s === 'muted') { marks[i] = 'muted'; added.push(`${stringName(i)} string muted — a finger may be touching it`); }
      if (s === 'wrong') {
        marks[i] = 'warn';
        added.push(`${stringName(i)} string: heard ${E.Chords.noteName(heardNote[i])}, should be ${E.Chords.noteName(shape.midi[i])} — check fret ${shape.frets[i]}`);
      }
    });
    marks = spot.marks.map((m, i) => (status[i] === 'skip' ? m : marks[i]));
    problems = spot.problems.concat(added);
    message = problems.length ? (problems.length === 1 ? words.oneFix : `${problems.length} ${words.fixes}`) : words.allChecked;
    sub = words.again;
    const st = strumStats[spot.name];
    if (st) {
      if (added.length && spot.wasClean) st.clean--;
      added.forEach((p) => { const k = p.split(' — ')[0]; st.issues[k] = (st.issues[k] || 0) + 1; });
    }
    spot = null; status = []; settleUntil = 0;
    render();
  }

  // ── string by string ──
  function onPluck(bef, after) {
    const todo = status.map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);
    if (!todo.length) return;
    const current = todo[0];
    const want = shape.midi[current];
    // candidates: notes still to play + a fret either side of the current string, and its octave
    const cand = new Set(todo.map((s) => shape.midi[s]));
    [-2, -1, 1, 2, 12].forEach((d) => cand.add(want + d));
    const diff = E.Chords.newSound(bef, after, mic.sampleRate);
    const heard = E.Chords.whichNote(diff, [...cand]);
    if (heard.note < 0 || heard.focus < P().focus || diff.share < 0.05) return;   // knock / thud / noise

    let matched = -1;
    if (heard.note === want || heard.note === want + 12) matched = current;
    else matched = todo.find((s) => shape.midi[s] === heard.note);
    if (matched !== undefined && matched >= 0) {
      todo.forEach((s) => { if (s < matched) status[s] = 'muted'; });
      status[matched] = 'ok';
      shakeString(matched);
    } else if (Math.abs(heard.note - want) <= 2) {
      status[current] = 'wrong'; heardNote[current] = heard.note;
      shakeString(current);
    } else return;
    lastEvent = performance.now();
    if (spot) marks = spot.marks.map((m, i) => (status[i] === 'ok' ? 'ok' : status[i] === 'muted' ? 'muted' : status[i] === 'wrong' ? 'warn' : m));
    else updateStringMarks();
    if (status.every((s) => s !== null)) { if (spot) finishSpot(); else finishStrings(); }
  }
  function updateStringMarks() {
    marks = status.map((s) => (s === 'skip' ? 'skip' : s === 'ok' ? 'ok' : s === 'wrong' ? 'warn' : s === 'muted' ? 'muted' : ''));
    problems = [];
    status.forEach((s, i) => {
      if (s === 'muted') problems.push(`${stringName(i)} string muted — a finger may be touching it`);
      if (s === 'wrong') problems.push(`${stringName(i)} string: heard ${E.Chords.noteName(heardNote[i])}, should be ${E.Chords.noteName(shape.midi[i])} — check fret ${shape.frets[i]}`);
    });
  }
  function finishStrings() {
    if (mic) { mic.close(); mic = null; }
    audio.duck(false);
    running = false;
    cancelAnimationFrame(raf);
    phase = 'done';
    updateStringMarks();
    const played = status.filter((s) => s !== 'skip').length;
    const clean = status.filter((s) => s === 'ok').length;
    const summary = [`${clean}/${played} clean`, ...problems.map((p) => p.split(' — ')[0])].join(', ');
    message = `${clean} / ${played} ${words.cleanOf}`;
    sub = words.redo;
    bus.emit('flash', clean === played ? 0.4 : 0.15);
    pendingString = {
      exercise: 'clean-check', title: 'Clean check', chords: [shape.name],
      score: { mode: 'string', clean, total: played, strings: status.map((s, i) => ({ string: STRING_LABEL[i], result: s })) },
      summary: `${shape.name} (string by string): ${summary}`,
      activeSec: Math.max(1, Math.round(activeMs / 1000)),
    };
    activeMs = 0;
    render();
  }

  // ── log: string results are saved when you move on (a redo updates instead of adding) ──
  function savePendingString() { if (pendingString) addLog(pendingString); pendingString = null; }
  function saveStrumStats() {
    const names = Object.keys(strumStats);
    if (!names.length) return;
    const parts = names.map((n) => {
      const st = strumStats[n];
      const top = Object.entries(st.issues).sort((a, b) => b[1] - a[1])[0];
      return `${n} ${st.clean}/${st.strums} clean` + (top ? ` (${top[0]} ×${top[1]})` : '');
    });
    addLog({
      exercise: 'clean-check', title: 'Clean check', chords: names,
      score: { mode: 'strum', perChord: strumStats },
      summary: `strum: ${parts.join(', ')}`,
      activeSec: Math.max(1, Math.round(activeMs / 1000)),
    });
    strumStats = {}; activeMs = 0;
  }

  // ── the 3D guitar copies what it heard ──
  function shake(sh) {
    const g = getStage()?.guitar;
    if (g) sh.frets.forEach((f, i) => { if (f >= 0) g.pluck(i, 0.9, f); });
  }
  function shakeString(i) {
    const g = getStage()?.guitar;
    if (g && shape) g.pluck(i, 1, Math.max(0, shape.frets[i]));
  }

  // ── drawing ──
  function render() {
    if (!E) return;
    modeBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.mode === settings.mode));
    pickSel.querySelector('b').textContent = settings.pick === 'manual' ? settings.chord : words.auto;
    const name = shape ? shape.name : settings.pick === 'manual' ? pickedShape().name : '';
    nameEl.textContent = name || '—';
    nameEl.classList.toggle('is-long', name.length > 3);
    el.classList.toggle('is-blank', !name);

    let big = message, small = sub;
    if (!big) {
      if (!running) big = settings.mode === 'strum' ? words.idleStrum : words.idleString;
      else big = identifying ? words.strumOnce : settings.mode === 'strum' ? words.listening : '';
    }
    const plucking = running && !identifying && shape && (settings.mode === 'string' || spot);
    const hiddenNames = () => status.map((s, i) => (s === null ? stringName(i) : null)).filter(Boolean).join(', ');
    let todo = -1;
    if (plucking && spot && settleUntil) { big = words.spotTitle; small = `${words.palm} ${hiddenNames()}.`; }
    else if (plucking && settleUntil) { big = `${words.got} ${shape.name}`; small = words.palmAll; }
    else if (plucking) {
      todo = status.findIndex((s) => s === null);
      if (todo >= 0) {
        big = `${words.pluck} ${stringName(todo)}`;
        const f = shape.frets[todo];
        small = (f === 0 ? 'open' : `fret ${f} · ${E.Chords.noteName(shape.midi[todo])}`) +
          (lastEvent ? ` · ${Math.round(P().giveUp / 1000)} s quiet = muted` : '');
      }
    }
    if (phase === 'capture' && running) small = words.hearing;
    const paused = running && idle && phase === 'listen' && !settleUntil;
    if (paused) { big = words.paused; small = words.pausedSub; }
    bigEl.textContent = big;
    subEl.textContent = small;
    const bad = problems.length > 0 || marks.some((m) => m === 'warn' || m === 'muted' || m === 'extra');
    const good = !bad && !plucking && marks.some((m) => m.startsWith('ok'));
    el.dataset.s = paused ? 'paused' : bad && message ? 'off' : good && message ? 'ok' : '';

    fixEl.innerHTML = problems.slice(0, 3).map((p) => `<li>${esc(p)}</li>`).join('');
    cells.forEach((b, i) => {
      const m = marks[i] || '';
      b.dataset.m = m;
      b.classList.toggle('is-cur', i === todo);
      b.querySelector('i').textContent = m === 'skip' ? '–' : m.startsWith('ok') ? '✓' : m === 'warn' || m === 'extra' ? '!' : m === 'muted' ? '✕' : '';
    });
    spotBtn.hidden = !(running && !spot && spotOffer.length && !P().spot);
    if (!spotBtn.hidden) spotBtn.textContent = `${words.spotBtn} · ${spotOffer.map(stringName).join(', ')}`;
    go.textContent = running ? words.stop : phase === 'done' ? words.again2 : words.start;
    el.classList.toggle('is-listening', running);

    // the 3D neck: chord dots, string colours, where to pluck next
    const g = getStage()?.guitar;
    if (!g || !open) return;
    const sh = shape || (settings.pick === 'manual' ? pickedShape() : null);
    const key = sh ? sh.name : '';
    if (key !== shownShape) { shownShape = key; g.setChord(neckFrets(sh)); }
    for (let i = 0; i < 6; i++) {
      const m = marks[i] || '';
      g.setTint(i, m.startsWith('ok') ? 'ok' : m === 'warn' || m === 'muted' || m === 'extra' ? 'bad' : m === 'skip' ? 'dim' : null);
    }
    if (todo >= 0 && !settleUntil) g.setLive(todo, Math.max(0, shape.frets[todo])); else g.setLive(null);
  }

  function clear3D() {
    const g = getStage()?.guitar;
    if (!g) return;
    for (let i = 0; i < 6; i++) g.setTint(i, null);
    g.setLive(null);
    shownShape = '';
  }

  bus.on('ex:enter', (n) => {
    if (n !== 'cleancheck') return;
    open = true;
    el.classList.add('is-open');
    bigEl.textContent = words.loading; subEl.textContent = '';
    loadEngine().then((eng) => {
      E = eng;
      if (!open) return;
      if (!running && phase !== 'done' && !message) resetView();
      shownShape = '__';
      render();
    }).catch(() => { bigEl.textContent = words.failed; });
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'cleancheck') return;
    stop(); open = false; picker.close();
    el.classList.remove('is-open');
    clear3D();
    bus.emit('chord', [0, 2, 2, 0, 0, 0]);      // the stop's Em comes back
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop(); });
  window.addEventListener('pagehide', () => { if (running) stop(); });
  return { el };
}
