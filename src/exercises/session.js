// SET-00 TODAY'S SESSION — on the stage podium, opened from the first screen.
//
// Pick how long (20 / 45 / 60 min). The setlist is built from your practice log with plain
// rules (no AI):
//   • Warm-up: tune, then a clean check of the chord that had the most string problems lately.
//   • Main block: Chord changes on your slowest change (seconds per change, from your rounds).
//   • Something new: when that change is fast (30+ changes/min), the next level gets added
//     (warm-up → open → barre → barre → barre); otherwise your second-slowest change.
//   • Find the note, Keep time (+5 BPM after a 90 %+ round), a song from your list.
// Each step opens the exercise already set up. When it logs a result you come back here with
// that one line and what's next. Skip or repeat anything. The setlist is kept for the day, so
// breaks, leaving or closing the app lose nothing.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { loadEngine, readLog } from './ear.js';
import { PRESETS } from './changes.js';
import { loadSongs, songChords } from './songs.js';
import { toMarkdown, shareText } from './log.js';

const KEY = 'practice.session.v1';
const NEW_AT = 30;          // changes/min on a pair before the next level is added
const LENGTHS = [20, 45, 60];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pairKey = (a, b) => [a, b].sort().join(' ↔ ');

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }

// ── reading the log ──
function recent(days = 14) {
  const from = dayKey(new Date(Date.now() - days * 864e5));
  return readLog().filter((e) => e && e.date >= from && e.score);
}
// the chord with the most string problems, per try (clean check + chord changes)
function weakestChord(E) {
  const bad = {}, tries = {};
  const add = (n, b, t) => { bad[n] = (bad[n] || 0) + b; tries[n] = (tries[n] || 0) + t; };
  recent().forEach((e) => {
    if (e.exercise === 'clean-check') {
      if (e.score.mode === 'strum') Object.entries(e.score.perChord || {}).forEach(([n, st]) => add(n, (st.strums || 0) - (st.clean || 0), st.strums || 0));
      else if (e.chords && e.chords[0]) add(e.chords[0], (e.score.total || 0) - (e.score.clean || 0), e.score.total || 0);
    }
    if (e.exercise === 'chord-changes') {
      Object.entries(e.score.issues || {}).forEach(([k, n]) => add(k.split(':')[0], n, 0));
      (e.chords || []).forEach((n) => add(n, 0, Math.max(1, Math.round((e.score.changes || 0) / Math.max(1, (e.chords || []).length)))));
    }
  });
  const core = new Set(E.Chords.LIBRARY.map((c) => c.name));
  const ranked = Object.keys(bad).filter((n) => core.has(n) && tries[n] >= 2 && bad[n] > 0).sort((a, b) => bad[b] / tries[b] - bad[a] / tries[a]);
  const n = ranked[0];
  return n ? { chord: n, why: `${Math.round((bad[n] / tries[n]) * 100)}% of tries had a string problem` } : { chord: 'F', why: 'the barre chord — a good daily check' };
}
// seconds per change, per pair (newest rounds count), and best changes/min per chord set
function pairStats() {
  const sec = {}, best = {};
  recent().filter((e) => e.exercise === 'chord-changes' && !e.score.partial).forEach((e) => {
    Object.entries(e.score.pairs || {}).forEach(([k, v]) => { (sec[k] = sec[k] || []).push(v); });
    if ((e.chords || []).length === 2 && !e.score.songId) {
      const k = pairKey(e.chords[0], e.chords[1]);
      best[k] = Math.max(best[k] || 0, e.score.changesPerMin || 0);
    }
  });
  const avg = Object.fromEntries(Object.entries(sec).map(([k, l]) => { const t = l.slice(-3); return [k, t.reduce((a, b) => a + b, 0) / t.length]; }));
  return { avg, best };
}
const LEVELS = ['warmup', 'barre1', 'barre2'];
const levelOf = (pair) => {
  const k = pairKey(pair[0], pair[1]);
  const i = LEVELS.findIndex((id) => PRESETS.find((p) => p[0] === id)[2].some((p) => p.length === 2 && pairKey(p[0], p[1]) === k));
  return i < 0 ? 1 : i;
};

// ── the plan ──
export function buildPlan(E, minutes) {
  const { avg, best } = pairStats();
  const slow = Object.entries(avg).filter(([k]) => k.split(' ↔ ').length === 2).sort((a, b) => b[1] - a[1]);
  const main = slow[0] ? { pair: slow[0][0].split(' ↔ '), why: `your slowest change lately (${slow[0][1].toFixed(1)} s)` }
    : { pair: ['Am', 'F'], why: 'open → barre: the change that slows songs down' };
  // something new: the next level once the main change is fast, else the second-slowest
  const mainBest = best[pairKey(main.pair[0], main.pair[1])] || 0;
  let extra = null;
  if (mainBest >= NEW_AT) {
    const lv = Math.min(LEVELS.length - 1, levelOf(main.pair) + 1);
    const pool = PRESETS.find((p) => p[0] === LEVELS[lv])[2].filter((p) => p.length === 2);
    const fresh = pool.find((p) => !best[pairKey(p[0], p[1])]) || pool[0];
    extra = { pair: fresh, why: `${main.pair.join(' ↔ ')} is fast now (${mainBest}/min) — next level`, isNew: true };
  } else if (slow[1]) {
    extra = { pair: slow[1][0].split(' ↔ '), why: `second-slowest change (${slow[1][1].toFixed(1)} s)` };
  } else {
    extra = { pair: ['C', 'F'], why: 'another open → barre change' };
  }
  const weak = weakestChord(E);
  const kt = readLog().filter((e) => e.exercise === 'keep-time' && e.score).pop();
  const bpm = kt ? Math.min(160, kt.score.bpm + (kt.score.steadyPct >= 90 ? 5 : 0)) : 60;
  const ktWhy = kt ? (kt.score.steadyPct >= 90 ? `+5: last time ${kt.score.steadyPct}% steady` : `same tempo: last time ${kt.score.steadyPct}%`) : 'a calm start';
  // a song: the one with chords you practised least recently
  const lastPlayed = {};
  readLog().forEach((e) => { if (e.score && e.score.songId) lastPlayed[e.score.songId] = e.ts; });
  const song = loadSongs().filter((x) => songChords(x).length >= 2).sort((a, b) => String(lastPlayed[a.id] || '').localeCompare(String(lastPlayed[b.id] || '')))[0];

  const S = [];
  const add = (kind, title, why, min, rounds = 1, cfg = null) => S.push({ kind, title, why, min, rounds, cfg, done: 0, results: [], skipped: false });
  const changes = (p, why, min, rounds) => add('changes', `Chord changes · ${p.pair.join(' ↔ ')}`, why || p.why, min, rounds, { pool: p.pair, order: 'loop', song: null });
  const songStep = (min, rounds) => {
    if (song) add('changes', `Song · ${song.title}`, 'the song you played least lately', min, rounds, { pool: songChords(song), order: 'loop', song: { id: song.id, title: song.title }, capo: song.capo || 0 });
    else add('changes', 'Progression · G D Em C', 'add songs (on the amp) to practise them here', min, rounds, { pool: ['G', 'D', 'Em', 'C'], order: 'loop', song: null });
  };
  add('tuner', 'Tune up', 'every session starts in tune', minutes >= 45 ? 3 : 2);
  add('cleancheck', `Clean check · ${weak.chord}`, weak.why, minutes >= 60 ? 5 : minutes >= 45 ? 4 : 3, 1, { chord: weak.chord });
  changes(main, null, minutes >= 60 ? 15 : 12, minutes >= 60 ? 4 : 3);
  if (minutes >= 45) {
    changes(extra, null, minutes >= 60 ? 10 : 8, minutes >= 60 ? 3 : 2);
    if (extra.isNew) S[S.length - 1].isNew = true;
    add('findnote', 'Find the note', 'the fretboard map, 10 notes', minutes >= 60 ? 8 : 6, minutes >= 60 ? 2 : 1);
  }
  add('keeptime', `Keep time · ${bpm} BPM`, ktWhy, minutes >= 60 ? 5 : minutes >= 45 ? 4 : 3, 1, { bpm });
  if (minutes >= 45) songStep(minutes >= 60 ? 12 : 8, minutes >= 60 ? 3 : 2);
  return S;
}

export function createSession({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-ss';
  el.dataset.ex = 'session';
  el.dataset.view = 'setup';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read ss-read"></div>
    <div class="ss-len seg" role="radiogroup" aria-label="${esc(words.length)}"><span class="seg-l">${esc(words.length)}</span>${LENGTHS.map((m) => `<button type="button" data-min="${m}">${m} min</button>`).join('')}</div>
    <div class="sg-box ss-box"><div class="sg-body ss-body" data-lenis-prevent></div></div>
    <div class="sg-row2 ss-row2"></div>
    <button type="button" class="ex-go"></button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const read = $('.ss-read'), body = $('.ss-body'), row2 = $('.ss-row2'), go = $('.ex-go');
  let E = null, open = false, minutes = 45, preview = null;
  let sess = null;           // today's saved session
  let away = null;           // the exercise a step opened (we come back when it closes)

  const today = () => { const s = load(); return s && s.date === dayKey() ? s : null; };
  const current = () => (sess ? sess.steps.findIndex((s) => !s.skipped && s.done < s.rounds) : -1);
  const left = () => (sess ? sess.steps.filter((s) => !s.skipped && s.done < s.rounds).reduce((a, s) => a + Math.ceil(s.min * (1 - s.done / s.rounds)), 0) : 0);
  const view = () => (!sess ? 'setup' : sess.ended || current() < 0 ? 'done' : 'run');

  function render() {
    const v = view();
    el.dataset.view = v;
    $('.ss-len').hidden = v !== 'setup';
    el.querySelectorAll('[data-min]').forEach((b) => b.classList.toggle('is-on', +b.dataset.min === minutes));
    if (v === 'setup') {
      if (!E) { body.innerHTML = `<p class="lg-empty">${esc(words.loading)}</p>`; return; }
      preview = buildPlan(E, minutes);
      const total = preview.reduce((a, s) => a + s.min, 0);
      read.innerHTML = `<span class="lg-k">${esc(words.todays)}</span><b class="lg-big">${total}</b><span class="lg-unit">${esc(words.minutes)} · ${preview.length} ${esc(words.steps)}</span>`;
      body.innerHTML = list(preview, -1);
      row2.innerHTML = '';
      go.textContent = `${words.start} ▸`;
      return;
    }
    if (v === 'run') {
      const i = current(), st = sess.steps[i];
      read.innerHTML = `<span class="lg-k">${esc(words.left)}</span><b class="lg-big">${left()}</b><span class="lg-unit">${esc(words.minutes)} · ${esc(words.step)} ${i + 1}/${sess.steps.length}</span>`;
      body.innerHTML = list(sess.steps, i);
      row2.innerHTML = `
        <button type="button" class="pick ss-skip"><span>${esc(words.thisStep)}</span><b>${esc(words.skip)}</b></button>
        <button type="button" class="pick ss-end"><span>${esc(words.session)}</span><b>${esc(words.end)}</b></button>`;
      go.textContent = st.done ? `${words.round} ${st.done + 1}/${st.rounds} ▸` : `${words.go} · ${st.title.split(' · ')[0]} ▸`;
      requestAnimationFrame(() => {
        const cur = body.querySelector('.is-cur');
        if (cur) body.scrollTop += cur.getBoundingClientRect().top - body.getBoundingClientRect().top - 6;
      });
      return;
    }
    // done
    const secs = sessionEntries().reduce((a, e) => a + (e.activeSec || 0), 0);
    read.innerHTML = `<span class="lg-k">${esc(words.finished)}</span><b class="lg-big">${Math.round(secs / 60)}</b><span class="lg-unit">${esc(words.minActive)}</span>`;
    body.innerHTML = list(sess.steps, -1);
    row2.innerHTML = `<button type="button" class="pick ss-new"><span>${esc(words.session)}</span><b>${esc(words.newOne)}</b></button>`;
    go.textContent = words.exportBtn;
  }
  function list(steps, cur) {
    return steps.map((s, i) => {
      const state = s.skipped ? 'skip' : s.done >= s.rounds ? 'done' : i === cur ? 'cur' : '';
      const last = s.results[s.results.length - 1];
      return `
        <div class="ss-step is-${state || 'todo'}${i === cur ? ' is-cur' : ''}" data-i="${i}">
          <span class="ss-n">${state === 'done' ? '✓' : state === 'skip' ? '–' : i + 1}</span>
          <span class="ss-txt"><b>${esc(s.title)}${s.isNew ? ` <em>${esc(words.newTag)}</em>` : ''}</b>
            <span>${esc(last ? last : s.why)}</span>
            ${s.rounds > 1 ? `<span class="ss-rounds">${Array.from({ length: s.rounds }, (_, k) => `<i class="${k < s.done ? 'on' : ''}"></i>`).join('')}</span>` : ''}</span>
          <span class="ss-min">${s.min}′</span>
          ${sess && !sess.ended && state === 'done' ? `<button type="button" class="ss-again" data-again="${i}">${esc(words.again)}</button>` : ''}
        </div>`;
    }).join('');
  }
  function sessionEntries() {
    if (!sess) return [];
    return readLog().filter((e) => e.ts >= sess.startedAt);
  }

  // ── actions ──
  el.querySelectorAll('[data-min]').forEach((b) => b.addEventListener('click', () => { minutes = +b.dataset.min; audio.blip('tick'); render(); }));
  go.addEventListener('click', async () => {
    audio.unlock();
    const v = view();
    if (v === 'setup') {
      sess = { date: dayKey(), minutes, startedAt: new Date().toISOString(), steps: preview || buildPlan(E, minutes), ended: false };
      save(sess); bus.emit('flash', 0.4); audio.blip('on');
      render();
      return;
    }
    if (v === 'run') { launch(current()); return; }
    // done → copy today's log for a coach
    const res = await shareText(toMarkdown(readLog(), 'today', words.md), words.md.mdTitle);
    const say = { shared: words.md.shared, copied: words.md.copied, failed: words.md.copyFailed }[res];
    if (say) { go.textContent = say; setTimeout(render, 2200); }
  });
  row2.addEventListener('click', (e) => {
    if (!sess) return;
    if (e.target.closest('.ss-skip')) { const i = current(); if (i >= 0) { sess.steps[i].skipped = true; save(sess); render(); } }
    if (e.target.closest('.ss-end')) { sess.ended = true; save(sess); render(); }
    if (e.target.closest('.ss-new')) { sess = null; localStorage.removeItem(KEY); render(); }
  });
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-again]');
    if (a && sess) { const s = sess.steps[+a.dataset.again]; s.rounds += 1; save(sess); launch(+a.dataset.again); }
  });

  // open the exercise for a step, set up
  function launch(i) {
    const st = sess && sess.steps[i];
    if (!st) return;
    if (st.kind === 'changes') bus.emit('changes:load', st.cfg);
    if (st.kind === 'cleancheck') bus.emit('cleancheck:load', st.cfg);
    if (st.kind === 'keeptime') bus.emit('keeptime:load', st.cfg);
    away = { kind: st.kind, i };
    director.swap(st.kind);
  }
  // a result was logged while a step's exercise was open → it counts for that step
  const KIND = { tuner: 'tuner', 'clean-check': 'cleancheck', 'chord-changes': 'changes', 'find-note': 'findnote', 'keep-time': 'keeptime' };
  bus.on('logged', (entry) => {
    if (!away || !sess || KIND[entry.exercise] !== away.kind) return;
    const st = sess.steps[away.i];
    if (!st) return;
    st.done += 1;
    st.results.push(entry.summary || entry.title);
    save(sess);
  });
  // the step's exercise closed → back to the setlist
  bus.on('ex:closed', (name) => {
    if (!away || name !== away.kind) return;
    away = null;
    setTimeout(() => director.enter('session'), 40);
  });

  $('.ex-exit').addEventListener('click', () => director.exit());
  bus.on('ex:enter', (n) => {
    if (n !== 'session') return;
    open = true;
    sess = today();
    if (sess) minutes = sess.minutes;
    el.classList.add('is-open');
    render();
    loadEngine().then((eng) => { E = eng; if (open) render(); }).catch(() => { body.innerHTML = `<p class="lg-empty">${esc(words.failed)}</p>`; });
  });
  bus.on('ex:leave', (n) => { if (n === 'session') { open = false; el.classList.remove('is-open'); } });
  return { el };
}

// for the first screen: a one-line state of today's session
export function sessionLine() {
  const s = load();
  if (!s || s.date !== dayKey()) return null;
  const todo = s.steps.filter((x) => !x.skipped && x.done < x.rounds).length;
  return s.ended || !todo ? 'done' : `${s.steps.length - todo}/${s.steps.length}`;
}
