// EX-06 PLAY THE RIFF — a song's riff or solo, note by note, at your own pace.
//
// The neck lies flat (like Find the note) and an amber ring shows where the next note is.
// How it listens (plain words): the microphone picture of the sound is compared with itself shifted
// a little later (YIN — the same detector as the tuner); where the two line up is one wave-length →
// the pitch → the note. When that note is the one the tab asks for, and it stays steady for a few
// moments, it counts and the ring jumps on. A repeated note (the same note twice) only counts again
// after a new pick attack: the sound has to dip and rise again, so one long note can't count twice.
// The mic hears the note, not the string: the same note played on another string also counts.
// No metronome — your time through the riff is measured from the first note to the last.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import * as halt from './halt.js';
import { loadEngine, openMic, profile, addLog, readLog } from './ear.js';
import { openMidi, tuningOf } from './chordbook.js';
import { tabHtml, tabLabels } from './songs.js';

const MIN_RMS = 0.006;
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SLABEL = ['low E', 'A', 'D', 'G', 'B', 'high e'];
const LISTEN_STEP = 0.42;          // seconds per note when the app plays the riff to you

export function createRiff({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-rf';
  el.dataset.ex = 'riff';
  el.dataset.view = 'setup';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read rf-read">
      <b class="rf-big"></b>
      <span class="rf-side"><span class="rf-where"></span><span class="rf-heard"></span></span>
    </div>
    <div class="ex-panel">
      <div class="rf-tab"></div>
      <p class="rf-info"></p>
      <div class="dr-row rf-btns">
        <button type="button" class="tog rf-listen">♪ ${esc(words.listen)}</button>
        <button type="button" class="tog rf-tune" hidden>${esc(words.tuneFirst)}</button>
      </div>
    </div>
    <button type="button" class="ex-go">${esc(words.start)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const big = $('.rf-big'), where = $('.rf-where'), heard = $('.rf-heard'), tabEl = $('.rf-tab'), info = $('.rf-info'), go = $('.ex-go');
  const g3 = () => getStage()?.guitar;
  const P = () => profile().findNote;

  let E = null, open = false, view = 'setup';
  let song = null, si = -1, notes = [], tuning = 'standard', capo = 0, want = [];
  let running = false, paused = false, mic = null, raf = 0, wake = null;
  let idx = 0, times = [], wrong = 0, lastWrong = -1, streakNote = -1, streak = 0, streakStart = 0;
  let needAttack = false, minRms = 1, acceptRms = 0, lastSoundAt = 0, activeMs = 0, lastFrame = 0;
  let listenTimers = [], backToRiff = false, labels = null, sname = SLABEL;

  // ── load a riff (from Songs) ──
  bus.on('riff:load', ({ song: s, si: i }) => {
    song = s; si = i;
    const sec = s.sections[i];
    notes = sec.notes.slice(); tuning = s.tuning || 'standard'; capo = s.capo || 0;
    const om = openMidi(tuning);
    want = notes.map((n) => om[n.s] + capo + n.f);     // the note (midi) each tab position gives
    labels = tabLabels(tuning);
    // string names in this tuning: low D, A, D … high e
    sname = om.map((m, s) => `${s === 0 ? 'low ' : s === 5 ? 'high ' : ''}${NAMES[m % 12]}`);
    view = 'setup';
  });

  const riffName = () => (song ? `${song.title} · ${song.sections[si].name}` : '');
  const key = () => (song ? `${song.id}:${si}` : '');
  function lastResult() {
    const l = readLog().filter((e) => e.exercise === 'riff' && e.score && e.score.key === key() && !e.score.partial);
    return l.length ? { last: l[l.length - 1], best: Math.min(...l.map((e) => e.score.sec)) } : null;
  }

  function setView(v) { view = v; el.dataset.view = v; render(); }
  function render() {
    if (!song) { big.textContent = '—'; where.textContent = words.noRiff; return; }
    const t = tuningOf(tuning);
    $('.rf-tune').hidden = tuning === 'standard' || running;
    $('.rf-listen').hidden = running;
    if (view === 'setup') {
      big.textContent = song.sections[si].name;
      big.classList.add('is-name');
      where.textContent = song.title;
      const r = lastResult();
      heard.textContent = r ? `${words.best} ${r.best.toFixed(1)} s` : words.firstTime;
      heard.dataset.s = '';
      tabEl.innerHTML = tabHtml(notes, { labels });
      info.textContent = [`${notes.length} ${words.notesWord}`, tuning !== 'standard' ? `${t.name} (${t.notes})` : '', capo ? `${words.capo} ${capo}` : '', words.howTo].filter(Boolean).join(' · ');
      go.textContent = words.start;
      show(0);
      return;
    }
    if (view === 'run') {
      big.classList.remove('is-name');
      if (paused) { big.textContent = words.paused; where.textContent = words.pausedSub; return; }
      const n = notes[idx];
      big.textContent = `${n.f}`;
      where.textContent = `${sname[n.s]} ${words.stringWord} · ${NAMES[want[idx] % 12]} · ${idx + 1}/${notes.length}`;
      // the tab around the current note
      const from = Math.max(0, Math.min(idx - 3, notes.length - 16));
      tabEl.innerHTML = tabHtml(notes.slice(from, from + 16), { labels }).replace(new RegExp(`data-ni="${idx - from}"`), `data-ni="${idx - from}" data-cur="1"`);
      tabEl.querySelectorAll('[data-cur]').forEach((c) => c.classList.add('is-cur'));
      info.textContent = `${wrong} ${words.wrongWord}`;
      go.textContent = words.stop;
      return;
    }
  }
  // the ring on the neck: where to play note i
  function show(i) {
    const g = g3(); if (!g || !notes[i]) return;
    g.setLive(notes[i].s, notes[i].f + capo);
  }

  // ── listen first: the app plays the riff slowly ──
  function stopListening() { listenTimers.forEach(clearTimeout); listenTimers = []; $('.rf-listen').classList.remove('is-on'); }
  $('.rf-listen').addEventListener('click', () => {
    if (listenTimers.length) { stopListening(); return; }
    audio.unlock();
    $('.rf-listen').classList.add('is-on');
    notes.forEach((n, i) => {
      listenTimers.push(setTimeout(() => {
        audio.pluck(want[i], { vel: 0.75, bright: 0.6 });
        const g = g3(); if (g) { g.setLive(n.s, n.f + capo); g.pluck(n.s, 0.9, n.f + capo); }
        tabEl.querySelectorAll('.tab-c').forEach((c) => c.classList.toggle('is-cur', c.dataset.ni === String(i)));
      }, i * LISTEN_STEP * 1000));
    });
    listenTimers.push(setTimeout(() => { stopListening(); show(0); }, notes.length * LISTEN_STEP * 1000 + 300));
  });
  // tune to the song's tuning first, then come back here
  $('.rf-tune').addEventListener('click', () => {
    stopListening();
    bus.emit('tuner:tuning', tuning);
    backToRiff = true;
    director.swap('tuner');
  });
  bus.on('ex:closed', (n) => { if (n === 'tuner' && backToRiff) { backToRiff = false; setTimeout(() => director.enter('riff'), 40); } });

  // ── run ──
  go.addEventListener('click', () => {
    if (!song || !E) return;
    if (view === 'run') { finish(true); return; }
    start();
  });
  async function start() {
    stopListening();
    try { mic = await openMic(4096); } catch { heard.textContent = words.denied; heard.dataset.s = 'off'; return; }
    if (!open) { mic.close(); mic = null; return; }
    audio.duck(true);
    wake = E.Pause.playDetector();
    running = true; paused = false;
    idx = 0; times = []; wrong = 0; lastWrong = -1; streak = 0; streakNote = -1;
    needAttack = false; activeMs = 0;
    lastFrame = lastSoundAt = performance.now();
    heard.textContent = ''; heard.dataset.s = '';
    setView('run'); show(0);
    loop();
  }
  function closeMic() { if (mic) { mic.close(); mic = null; audio.duck(false); } }

  function loop() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(now - lastFrame, 250); lastFrame = now;
    const buf = mic.read();
    if (paused) {
      if (wake.feed(buf, now)) resume();
      raf = requestAnimationFrame(loop); return;
    }
    const recent = buf.subarray(buf.length - 2048);
    const r = E.Sound.rms(recent);
    if (r >= MIN_RMS) lastSoundAt = now;
    if (times.length && now - lastSoundAt < 10000) activeMs += dt;
    if (now - lastSoundAt > E.Pause.AFTER_MS) { pause(); raf = requestAnimationFrame(loop); return; }
    hear(recent, r, now);
    raf = requestAnimationFrame(loop);
  }

  function hear(buf, r, now) {
    // the same note again needs a new attack: the sound dips, then rises
    if (needAttack) {
      minRms = Math.min(minRms, r);
      if (minRms < acceptRms * 0.7 && r > Math.max(minRms * 1.6, MIN_RMS * 1.5)) needAttack = false;
      else return;
    }
    const f = r >= MIN_RMS ? E.Sound.yin(buf, mic.sampleRate, 0.15) : null;
    if (!f) { streak = 0; streakNote = -1; return; }
    const m = 69 + 12 * Math.log2(f / 440);
    const n = Math.round(m);
    if (Math.abs(m - n) * 100 > P().cents) { streak = 0; streakNote = -1; return; }
    if (n === streakNote) streak++; else { streakNote = n; streak = 1; streakStart = now; }
    if (streak !== P().hold) return;
    const target = want[idx];
    // an octave off counts too: low notes often read an octave high through a phone mic
    if (n === target || Math.abs(n - target) === 12) { accept(streakStart, r); return; }
    const prev = idx > 0 ? want[idx - 1] : -1;
    if (n !== prev && n !== lastWrong) {          // the last note still ringing doesn't count as wrong
      lastWrong = n; wrong++;
      heard.textContent = `${words.heard} ${NAMES[((n % 12) + 12) % 12]} — ${words.lookingFor} ${NAMES[target % 12]}`;
      heard.dataset.s = 'off';
      info.textContent = `${wrong} ${words.wrongWord}`;
    }
  }
  function accept(t, r) {
    times.push(t);
    const g = g3(); const n = notes[idx];
    if (g) g.pluck(n.s, 1, n.f + capo);
    heard.textContent = '✓'; heard.dataset.s = 'ok';
    lastWrong = -1; streak = 0; streakNote = -1;
    idx++;
    if (idx >= notes.length) { finish(false); return; }
    needAttack = want[idx] === want[idx - 1];
    minRms = 1; acceptRms = r;
    show(idx);
    render();
  }

  function pause() {
    paused = true; wake.reset();
    render();
    halt.show('riff', {
      title: words.paused, text: words.pausedText,
      buttons: [{ label: words.resume, primary: true, onClick: resume }, { label: words.stop, onClick: () => finish(true) }],
    });
  }
  function resume() {
    if (!paused) return;
    paused = false; lastSoundAt = performance.now();
    halt.hide('riff');
    render();
  }

  function finish(partial) {
    running = false; paused = false;
    cancelAnimationFrame(raf);
    closeMic();
    halt.hide('riff');
    if (times.length < 2 || (partial && idx < notes.length)) {
      setView('setup');
      if (times.length >= 2) { heard.textContent = `${words.stoppedAt} ${idx}/${notes.length}`; heard.dataset.s = ''; }
      return;
    }
    const sec = (times[times.length - 1] - times[0]) / 1000;
    // the slowest step from one note to the next
    let slow = 0;
    for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > times[slow + 1] - times[slow]) slow = i - 1;
    const gap = (times[slow + 1] - times[slow]) / 1000;
    const prev = lastResult();
    const a = notes[slow], b = notes[slow + 1];
    addLog({
      exercise: 'riff', title: 'Riff', chords: [],
      score: { sec: Number(sec.toFixed(2)), notes: notes.length, wrong, key: key(), songId: song.id, song: song.title, riff: song.sections[si].name, tuning,
        slowest: { at: slow + 1, sec: Number(gap.toFixed(2)) } },
      summary: `${riffName()}: ${sec.toFixed(1)} s, ${wrong} wrong${prev ? ` (best ${prev.best.toFixed(1)} s)` : ''}`,
      activeSec: Math.max(1, Math.round(activeMs / 1000)),
    });
    view = 'summary'; el.dataset.view = 'summary';
    $('.rf-tune').hidden = tuning === 'standard'; $('.rf-listen').hidden = false;
    big.classList.remove('is-name');
    big.textContent = `${sec.toFixed(1)}s`;
    where.textContent = riffName();
    heard.dataset.s = prev && sec < prev.best ? 'ok' : '';
    heard.textContent = prev ? (sec < prev.best ? `${words.newBest} (${prev.best.toFixed(1)} s)` : `${words.best} ${prev.best.toFixed(1)} s`) : words.baseline;
    tabEl.innerHTML = tabHtml(notes, { labels });
    info.textContent = [`${wrong} ${words.wrongWord}`, `${words.slowest}: ${sname[a.s]} ${a.f} → ${sname[b.s]} ${b.f} (${gap.toFixed(1)} s)`].join(' · ');
    go.textContent = words.again;
    bus.emit('flash', 0.5);
  }

  $('.ex-exit').addEventListener('click', () => director.exit());
  bus.on('ex:enter', (n) => {
    if (n !== 'riff') return;
    open = true;
    el.classList.add('is-open');
    setView('setup');
    loadEngine().then((eng) => { E = eng; }).catch(() => { heard.textContent = words.failed; });
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'riff') return;
    stopListening();
    if (running) finish(true);
    open = false;
    el.classList.remove('is-open');
    const g = g3(); if (g) g.setLive(null);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) pause(); });
  return { el };
}
