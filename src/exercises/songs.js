// SYS-02 SONGS — on the amp.
//
// Your songs, saved on this device (practice.songs.v1): title, artist, and the chords in order,
// split into sections (Verse, Chorus …). Added by hand for now; "from my own sources" and
// "from the internet" (read by Gemini) come later.
//
// A chord can be anything you type. If the app knows its shape (core, extra or taught) it is
// heard and checked like any other; if not, you can teach it on a fret grid once — or leave it
// "not checked": in Chord changes any strum then moves you on.
//
// From a song: "Play the changes" opens Chord changes with all its chords in order (Loop);
// "Hardest change" drills the slowest pair — measured from your rounds, or a guess at first.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { createPicker, miniDiagram } from './picker.js';
import { loadEngine, readLog } from './ear.js';
import { shapeFor, allShapes, MORE_GROUPS, teach, findBarre, parseName, NOTE_NAMES, TUNINGS, tuningOf, openMidi } from './chordbook.js';
import * as gemini from './gemini.js';

const KEY = 'practice.songs.v1';
const SECTION_NAMES = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Solo', 'Riff', 'Outro'];
// sections written as tab (single notes: string + fret) instead of chords
const TAB_NAMES = ['Riff', 'Intro riff', 'Solo', 'Lick', 'Outro riff'];
export const isTab = (sec) => Array.isArray(sec && sec.notes);
export const songTabs = (song) => (song.sections || []).map((s, i) => [s, i]).filter(([s]) => isTab(s) && s.notes.length);
const TAB_LINES = ['e', 'B', 'G', 'D', 'A', 'E'];      // top line = high e, like printed tab

// A small tab: blocks of up to 16 notes, 6 lines, the fret number on its string.
// labels = the 6 line names top → bottom (high e … low E), e.g. for Drop D: e B G D A D
export function tabLabels(tuning) {
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = openMidi(tuning || 'standard');
  return [5, 4, 3, 2, 1, 0].map((s) => (s === 5 ? NOTE[m[s] % 12].toLowerCase() : NOTE[m[s] % 12]));
}
export function tabHtml(notes, { si = -1, editable = false, cur = -1, labels = TAB_LINES } = {}) {
  if (!notes.length) return '';
  const blocks = [];
  for (let i = 0; i < notes.length; i += 16) blocks.push(notes.slice(i, i + 16).map((n, k) => [n, i + k]));
  return blocks.map((b) => `
    <div class="tab">
      <span class="tab-c tab-lab">${labels.map((l) => `<i>${l}</i>`).join('')}</span>
      ${b.map(([n, ni]) => {
        const cells = TAB_LINES.map((_, row) => `<i>${5 - row === n.s ? `<b>${n.f}</b>` : ''}</i>`).join('');
        return editable ? `<button type="button" class="tab-c${ni === cur ? ' is-cur' : ''}" data-note="${si}:${ni}">${cells}</button>`
          : `<span class="tab-c${ni === cur ? ' is-cur' : ''}" data-ni="${ni}">${cells}</span>`;
      }).join('')}
    </div>`).join('');
}
// Kuba's goal list (blueprint v2) — names only; the chords are yours to add
const STARTER = [
  ['Strangers', 'Proderics'], ['Waiting', 'Leverfall'], ['Stolen Dance', 'Milky Chance'], ['After Dark', 'Mr.Kitty'],
  ['Jane!', 'The Long Faces'], ['505', 'Arctic Monkeys'], ['Babydoll', 'Dominic Fike'],
  ['That Band', 'Kessoku Band · Bocchi the Rock!'], ['Seisyun Complex', 'Kessoku Band · Bocchi the Rock!'],
  ['Rockn’ Roll, Morning Light Falls on You', 'Kessoku Band · Bocchi the Rock!'],
  ['Guitar, Loneliness and Blue Planet', 'Kessoku Band · Bocchi the Rock!'],
  ['The Unknowing', 'Jfarrari'], ['Waiting Room', 'Overgrown'], ['Money (intro riff)', 'The Drums'],
];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── store ──
export function loadSongs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      const seeded = STARTER.map(([title, artist], i) => ({ id: `s${i}-${newId()}`, title, artist, sections: [], created: new Date().toISOString() }));
      saveSongs(seeded);
      return seeded;
    }
    const l = JSON.parse(raw);
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}
export function saveSongs(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ } }
export const songChords = (song) => (song.sections || []).flatMap((s) => s.chords || []);

// results per song from the log: best changes/min, rounds, avg seconds per pair
export function songStats(id) {
  const l = readLog().filter((e) => e.exercise === 'chord-changes' && e.score && e.score.songId === id && !e.score.partial);
  const pairs = {};
  l.forEach((e) => Object.entries(e.score.pairs || {}).forEach(([k, v]) => { (pairs[k] = pairs[k] || []).push(v); }));
  return {
    rounds: l.length,
    best: l.length ? Math.max(...l.map((e) => e.score.changesPerMin || 0)) : null,
    pairs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, v.length)])),
  };
}

// The hardest change in a song: the slowest pair you've played; before any rounds, a guess —
// a change into or out of a barre chord (or one the app can't check), else the first change.
export function hardestPair(E, song) {
  const seq = songChords(song);
  const st = songStats(song.id);
  const measured = Object.entries(st.pairs).sort((a, b) => b[1] - a[1])[0];
  if (measured) return { pair: measured[0].split(' ↔ '), sec: measured[1], measured: true };
  const pairs = [];
  for (let i = 0; i + 1 < seq.length; i++) if (seq[i] !== seq[i + 1]) pairs.push([seq[i], seq[i + 1]]);
  if (!pairs.length) return null;
  const hard = (n) => { const sh = E ? shapeFor(E, n) : null; return !sh ? 2 : sh.isBarre ? 3 : 0; };
  pairs.sort((a, b) => (hard(b[0]) + hard(b[1])) - (hard(a[0]) + hard(a[1])));
  return { pair: pairs[0], measured: false };
}

export function createSongs({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-sg';
  el.dataset.ex = 'songs';
  el.dataset.view = 'list';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read sg-read"></div>
    <div class="sg-box"><div class="sg-body" data-lenis-prevent></div></div>
    <div class="sg-row2"></div>
    <button type="button" class="ex-go"></button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const read = $('.sg-read'), body = $('.sg-body'), row2 = $('.sg-row2'), go = $('.ex-go');
  const picker = createPicker(el);
  let E = null, open = false, view = 'list', current = null, draft = null;

  const known = (n) => (E ? !!shapeFor(E, n) : true);
  const g3 = () => getStage()?.guitar;
  function setView(v) { view = v; el.dataset.view = v; body.scrollTop = 0; render(); }
  const songById = (id) => loadSongs().find((x) => x.id === id);

  // ── drawing ──
  function render() {
    if (view === 'list') renderList();
    else if (view === 'song') renderSong();
    else renderEdit();
  }
  function renderList() {
    const songs = loadSongs();
    read.innerHTML = `<span class="lg-k">${esc(words.yours)}</span><b class="lg-big">${songs.length}</b><span class="lg-unit">${esc(words.songsWord)}</span>`;
    body.innerHTML = songs.length ? songs.map((x) => {
      const n = songChords(x).length, st = songStats(x.id), t = songTabs(x).length;
      const sub = [x.artist || words.own, n ? `${n} ${words.chordsWord}` : t ? '' : words.noChords, t ? `${t} ${t === 1 ? words.riffWord : words.riffsWord}` : '', st.best !== null ? `${words.best} ${st.best}/min` : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="sg-item${n || t ? '' : ' is-empty'}" data-id="${esc(x.id)}"><span><b>${esc(x.title)}</b><span>${esc(sub)}</span></span><i>▸</i></button>`;
    }).join('') : `<p class="lg-empty">${esc(words.empty)}</p>`;
    row2.innerHTML = '';
    go.textContent = `+ ${words.add}`;
    g3()?.setChord(null);
  }
  function chipsHtml(chords, editable = false, si = 0) {
    return chords.map((c, ci) => {
      const k = known(c);
      const unsure = editable && draft && draft.unsure && draft.unsure.includes(c);
      return `<button type="button" class="sg-chip${k ? '' : ' is-unknown'}${unsure ? ' is-unsure' : ''}" ${editable ? `data-chip="${si}:${ci}"` : `data-show="${esc(c)}"`}>${esc(c)}${k ? '' : '<sup>?</sup>'}</button>`;
    }).join('');
  }
  function renderSong() {
    const x = songById(current);
    if (!x) { setView('list'); return; }
    const seq = songChords(x), st = songStats(x.id);
    const tun = x.tuning && x.tuning !== 'standard' ? tuningOf(x.tuning).name : '';
    read.innerHTML = `<button type="button" class="sg-back">‹ ${esc(words.songs)}</button><b class="sg-title">${esc(x.title)}</b><span class="lg-unit">${esc(x.artist || words.own)}${tun ? ` · ${esc(tun)}` : ''}${x.capo ? ` · ${esc(words.capo)} ${x.capo}` : ''}</span>`;
    const unknown = [...new Set(seq.filter((c) => !known(c)))];
    const tabs = songTabs(x);
    body.innerHTML = (x.sections || []).filter((s) => (isTab(s) ? s.notes.length : s.chords.length)).map((s) => (isTab(s)
      ? `<div class="sg-sec"><p class="sg-secname">${esc(s.name)} · ${esc(words.tabWord)}</p>${tabHtml(s.notes, { labels: tabLabels(x.tuning) })}</div>`
      : `<div class="sg-sec"><p class="sg-secname">${esc(s.name)}</p><div class="sg-chips">${chipsHtml(s.chords)}</div></div>`)).join('') ||
      `<p class="lg-empty">${esc(words.noChordsYet)}</p>`;
    if (unknown.length) body.innerHTML += `<p class="sg-note">${esc(words.unknownNote)} ${unknown.map(esc).join(', ')}</p>`;
    if (st.rounds) body.innerHTML += `<p class="sg-note">${esc(words.best)} ${st.best}/min · ${st.rounds} ${esc(st.rounds === 1 ? words.round : words.rounds)}</p>`;
    const hp = seq.length >= 2 ? hardestPair(E, x) : null;
    row2.innerHTML = `
      ${hp ? `<button type="button" class="pick sg-hard"><span>${esc(hp.measured ? words.hardest : words.hardestGuess)}</span><b>${esc(hp.pair.join(' ↔ '))}${hp.sec ? ` · ${hp.sec.toFixed(1)} s` : ''}</b></button>` : ''}
      ${tabs.length && seq.length >= 2 ? `<button type="button" class="pick sg-riff"><span>${esc(tabs.length > 1 ? `${tabs.length} ${words.riffsWord}` : tabs[0][0].name)}</span><b>${esc(words.playShort)} ▸</b></button>` : ''}
      <button type="button" class="pick sg-edit"><span>${esc(words.song)}</span><b>${esc(words.edit)}</b></button>`;
    row2.dataset.n = row2.querySelectorAll('button').length;
    go.textContent = seq.length >= 2 ? `${words.play} ▸` : tabs.length ? `${words.playRiff} ▸` : `${words.addChords} ▸`;
    if (seq.length) showChord(seq[0]);
  }
  function renderEdit() {
    const d = draft;
    read.innerHTML = `<button type="button" class="sg-back">‹ ${esc(words.cancel)}</button><b class="sg-title">${esc(d.title || words.newSong)}</b>`;
    const review = d.from ? `
      <div class="sg-review">
        <b>${esc(words.reviewTitle)}</b>
        <span>${esc(words.reviewText)}</span>
        ${d.unsure && d.unsure.length ? `<span>${esc(words.unsureLine)} ${d.unsure.map(esc).join(', ')}</span>` : ''}
        ${d.notes ? `<span>“${esc(d.notes)}”</span>` : ''}
        ${d.prepNotes && d.prepNotes.length ? `<span>${d.prepNotes.map(esc).join(' · ')}</span>` : ''}
        ${d.sources && d.sources.length ? `<span>${esc(words.sourcesLine)} ${d.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title || 'link')}</a>`).join(', ')}</span>` : ''}
      </div>` : '';
    body.innerHTML = `${review}
      <label class="sg-field"><span>${esc(words.titleLabel)}</span><input type="text" class="sg-in-title" maxlength="60" value="${esc(d.title)}" placeholder="${esc(words.titlePh)}"></label>
      <label class="sg-field"><span>${esc(words.artistLabel)}</span><input type="text" class="sg-in-artist" maxlength="60" value="${esc(d.artist || '')}" placeholder="${esc(words.artistPh)}"></label>
      <div class="sg-2">
        <div class="sg-field"><span>${esc(words.tuning)}</span><button type="button" class="pick sg-tuning"><span>${esc(tuningOf(d.tuning).notes)}</span><b>${esc(tuningOf(d.tuning).name)}</b></button></div>
        <div class="sg-field"><span>${esc(words.capo)}</span><div class="step sg-capo"><button type="button" data-capo="-1" aria-label="Capo down">−</button><b>${d.capo ? d.capo : esc(words.noCapo)}</b><button type="button" data-capo="1" aria-label="Capo up">+</button></div></div>
      </div>
      ${d.sections.map((s, si) => `
        <div class="sg-sec is-edit${isTab(s) ? ' is-tab' : ''}">
          <div class="sg-sechead"><button type="button" class="sg-secname-btn" data-sec="${si}">${esc(s.name)}${isTab(s) ? ` · ${esc(words.tabWord)}` : ''} ▾</button><i></i><button type="button" class="sg-secdel" data-secdel="${si}" aria-label="Delete section">✕</button></div>
          ${isTab(s)
            ? `${tabHtml(s.notes, { si, editable: true, labels: tabLabels(d.tuning) })}<button type="button" class="sg-chip sg-addchord sg-addnotes" data-addnotes="${si}">+ ${esc(words.notesBtn)}</button>`
            : `<div class="sg-chips">${chipsHtml(s.chords, true, si)}<button type="button" class="sg-chip sg-addchord" data-add="${si}">+ ${esc(words.chord)}</button></div>`}
        </div>`).join('')}
      <button type="button" class="sg-addsec">+ ${esc(words.section)}</button>
      ${d.id ? `<button type="button" class="sg-delete">${esc(words.deleteSong)}</button>` : ''}`;
    row2.innerHTML = '';
    go.textContent = words.save;
  }
  let shownChord = '';
  function showChord(name) {
    const g = g3(); if (!g || !E) return;
    const sh = shapeFor(E, name);
    if (shownChord === name) return;
    shownChord = name;
    const f = sh ? sh.frets.map((x) => (x < 0 ? 'x' : x)) : null;
    if (f && sh.barre) f.barre = sh.barre;
    g.setChord(f);
    if (f) for (let i = 0; i < 6; i++) if (f[i] !== 'x') g.pluck(i, 0.5, f[i]);
  }

  // ── list / song actions ──
  body.addEventListener('click', async (e) => {
    const item = e.target.closest('.sg-item');
    if (item) { current = item.dataset.id; audio.blip('tick'); setView('song'); return; }
    const show = e.target.closest('[data-show]');
    if (show) { shownChord = ''; showChord(show.dataset.show); if (!known(show.dataset.show)) teachFor(show.dataset.show).then(() => render()); return; }
    if (view !== 'edit') return;
    syncFields();
    const cp = e.target.closest('[data-capo]');
    if (cp) { draft.capo = Math.max(0, Math.min(12, (draft.capo || 0) + +cp.dataset.capo)); renderEdit(); return; }
    if (e.target.closest('.sg-tuning')) {
      const v = await picker.list({ title: words.tuning, value: draft.tuning || 'standard', tabs: [{ id: 't', label: words.tuning, note: words.tuningNote, rows: TUNINGS.map((t) => ({ value: t.id, label: t.name, sub: t.notes })) }] });
      if (v) { draft.tuning = v; renderEdit(); }
      return;
    }
    const an = e.target.closest('[data-addnotes]');
    if (an) { await notesFor(+an.dataset.addnotes); renderEdit(); return; }
    const nt = e.target.closest('[data-note]');
    if (nt) { const [si, ni] = nt.dataset.note.split(':').map(Number); await noteMenu(si, ni); return; }
    const add = e.target.closest('[data-add]');
    if (add) { await addChord(+add.dataset.add); return; }
    const chip = e.target.closest('[data-chip]');
    if (chip) { const [si, ci] = chip.dataset.chip.split(':').map(Number); await chipMenu(si, ci); return; }
    const sec = e.target.closest('[data-sec]');
    if (sec) { await renameSection(+sec.dataset.sec); return; }
    const del = e.target.closest('[data-secdel]');
    if (del) { draft.sections.splice(+del.dataset.secdel, 1); renderEdit(); return; }
    if (e.target.closest('.sg-addsec')) { await addSection(); return; }
    if (e.target.closest('.sg-delete')) {
      const v = await picker.list({ title: words.deleteSong, value: '', tabs: [{ id: 'd', label: draft.title, note: words.deleteSure, rows: [{ value: 'yes', label: words.deleteYes, accent: true }, { value: 'no', label: words.keep }] }] });
      if (v === 'yes') { saveSongs(loadSongs().filter((x) => x.id !== draft.id)); draft = null; current = null; setView('list'); }
    }
  });
  body.addEventListener('input', (e) => { if (e.target.classList.contains('sg-in-title')) el.querySelector('.sg-title').textContent = e.target.value || words.newSong; });
  read.addEventListener('click', (e) => {
    if (!e.target.closest('.sg-back')) return;
    if (view === 'edit') { draft = null; setView(current ? 'song' : 'list'); } else setView('list');
  });
  row2.addEventListener('click', (e) => {
    const x = songById(current);
    if (!x) return;
    if (e.target.closest('.sg-edit')) { startEdit(x); return; }
    if (e.target.closest('.sg-hard')) {
      const hp = hardestPair(E, x);
      if (hp) practise({ pool: hp.pair, order: 'loop', song: null, capo: x.capo || 0, tuning: x.tuning || 'standard' });
    }
    if (e.target.closest('.sg-riff')) playRiff(x);
  });
  go.addEventListener('click', async () => {
    audio.unlock();
    if (view === 'list') {
      const st = await gemini.status();
      const g = st.key === 'found' && st.works !== false ? words.gemini : st.key === 'missing' ? words.needsKey : st.works === false ? words.keyRefused : words.offline;
      const v = await picker.list({
        title: words.add, value: '',
        tabs: [{ id: 'how', label: words.how, rows: [
          { value: 'manual', label: words.manual, sub: words.manualSub, accent: true },
          { value: 'own', label: words.own2, sub: g },
          { value: 'web', label: words.web, sub: g },
        ] }],
      });
      if (v === 'manual') startEdit(null);
      else if (v === 'own') await fromOwn();
      else if (v === 'web') await fromWeb();
      return;
    }
    if (view === 'song') {
      const x = songById(current);
      if (!x) return;
      if (songChords(x).length < 2) { if (songTabs(x).length) playRiff(x); else startEdit(x); return; }
      practise({ pool: songChords(x), order: 'loop', song: { id: x.id, title: x.title }, capo: x.capo || 0, tuning: x.tuning || 'standard' });
      return;
    }
    // save
    syncFields();
    if (!draft.title.trim()) { el.querySelector('.sg-in-title').focus(); return; }
    draft.sections = draft.sections.filter((s) => (isTab(s) ? s.notes.length : s.chords.length) || draft.sections.length === 1);
    if (draft.from) draft.source = draft.from === 'web' ? 'gemini-web' : 'gemini-own';
    ['from', 'unsure', 'notes', 'sources', 'prepNotes'].forEach((k) => delete draft[k]);
    const list = loadSongs();
    if (draft.id) { const i = list.findIndex((x) => x.id === draft.id); if (i >= 0) list[i] = { ...list[i], ...draft, updated: new Date().toISOString() }; }
    else { draft.id = newId(); draft.created = new Date().toISOString(); list.unshift(draft); }
    saveSongs(list);
    current = draft.id; draft = null;
    audio.blip('on'); bus.emit('flash', 0.3);
    setView('song');
  });

  // ── Gemini: from my own sources / from the internet ──
  const ERR = () => ({ nokey: words.errNoKey, key: words.errKey, limit: words.errLimit, unreadable: words.errUnreadable, busy: words.errBusy, unavailable: words.errOffline, bad: words.errBad, failed: words.errFailed });
  // a waiting line with seconds counting, inside the open sheet
  let waitText = '';
  function waiting(text) {
    const t0 = performance.now();
    waitText = text;
    const box = picker.body.querySelector('.gm-wait');
    if (!box) return () => {};
    box.hidden = false;
    const tick = () => { box.querySelector('span').textContent = `${waitText} · ${Math.round((performance.now() - t0) / 1000)} s`; };
    tick();
    const iv = setInterval(tick, 500);
    picker.body.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
    return () => { clearInterval(iv); box.hidden = true; picker.body.querySelectorAll('button, input').forEach((b) => { b.disabled = false; }); };
  }
  const showErr = (msg) => { const e = picker.body.querySelector('.gm-err'); if (e) { e.textContent = msg; e.hidden = !msg; } };
  const errText = (res) => `${ERR()[res.error] || words.errFailed}${res.detail ? ` (${res.detail})` : ''}`;

  async function fromOwn() {
    let files = [], note = '';
    const draw = () => `
      <p class="pk-note">${esc(words.ownHow)}</p>
      <label class="gm-pick"><input type="file" multiple accept="image/*,application/pdf,audio/*,video/*" class="gm-file"><span>+ ${esc(words.pickFiles)}</span></label>
      <div class="gm-files">${files.map((f, i) => `<div class="gm-f"><span>${esc(f.name)}</span><i>${(f.size / 1048576).toFixed(1)} MB</i><button type="button" data-rm="${i}" aria-label="Remove">✕</button></div>`).join('')}</div>
      <label class="sg-field"><span>${esc(words.noteLabel)}</span><input type="text" class="gm-note" maxlength="200" placeholder="${esc(words.notePh)}"></label>
      <p class="gm-err" hidden></p>
      <p class="gm-wait" hidden><i></i><span></span></p>
      <div class="pk-multi"><button type="button" class="gm-cancel">${esc(words.cancel)}</button><button type="button" class="gm-go" ${files.length ? '' : 'disabled'}>${esc(words.readIt)}</button></div>`;
    const done = picker.sheet(words.own2, draw());
    const redraw = () => { note = picker.body.querySelector('.gm-note')?.value || note; picker.body.innerHTML = draw(); picker.body.querySelector('.gm-note').value = note; };
    const onChange = (e) => { if (e.target.classList.contains('gm-file')) { files = files.concat([...e.target.files]).slice(0, 12); redraw(); } };
    const onClick = async (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { files.splice(+rm.dataset.rm, 1); redraw(); return; }
      if (e.target.closest('.gm-cancel')) { picker.done(null); return; }
      if (!e.target.closest('.gm-go') || !files.length) return;
      note = picker.body.querySelector('.gm-note').value;
      showErr('');
      let prep;
      let stop = waiting(words.preparing);
      try {
        prep = await gemini.prepare(files, (t) => { waitText = t; });
      } catch (err) { stop(); showErr(String(err.message || err)); return; }
      stop();
      stop = waiting(words.reading);
      const res = await gemini.ask({ mode: 'own', parts: prep.parts, note }).catch(() => ({ error: 'failed' }));
      stop();
      if (res.error) { showErr(errText(res)); return; }
      picker.done({ ...res, prepNotes: prep.notes });
    };
    picker.body.addEventListener('change', onChange);
    picker.body.addEventListener('click', onClick);
    const res = await done;
    picker.body.removeEventListener('change', onChange);
    picker.body.removeEventListener('click', onClick);
    if (res && res.song) review(res, 'own');
  }

  async function fromWeb() {
    const done = picker.sheet(words.web, `
      <p class="pk-note">${esc(words.webHow)}</p>
      <label class="sg-field"><span>${esc(words.titleLabel)}</span><input type="text" class="gm-title" maxlength="100" placeholder="${esc(words.titlePh)}"></label>
      <label class="sg-field"><span>${esc(words.artistLabel)}</span><input type="text" class="gm-artist" maxlength="100" placeholder="${esc(words.bandPh)}"></label>
      <label class="sg-field"><span>${esc(words.linkLabel)}</span><input type="url" class="gm-link" maxlength="300" placeholder="${esc(words.linkPh)}"></label>
      <p class="gm-err" hidden></p>
      <p class="gm-wait" hidden><i></i><span></span></p>
      <div class="pk-multi"><button type="button" class="gm-cancel">${esc(words.cancel)}</button><button type="button" class="gm-go">${esc(words.findIt)}</button></div>`);
    const onClick = async (e) => {
      if (e.target.closest('.gm-cancel')) { picker.done(null); return; }
      if (!e.target.closest('.gm-go')) return;
      const q = (c) => picker.body.querySelector(c).value.trim();
      const title = q('.gm-title'), artist = q('.gm-artist'), link = q('.gm-link');
      if (!title) { picker.body.querySelector('.gm-title').focus(); return; }
      if (link && !/^https?:\/\//i.test(link)) { showErr(words.errLink); return; }
      showErr('');
      const stop = waiting(words.searching);
      const res = await gemini.ask({ mode: 'web', title, artist, link }).catch(() => ({ error: 'failed' }));
      stop();
      if (res.error) { showErr(errText(res)); return; }
      picker.done(res);
    };
    picker.body.addEventListener('click', onClick);
    const res = await done;
    picker.body.removeEventListener('click', onClick);
    if (res && res.song) review(res, 'web');
  }

  // Gemini's answer → a draft in the normal editor; nothing is saved until you press Save
  function review(res, from) {
    const s = res.song;
    current = null;
    draft = {
      id: null, title: s.title, artist: s.artist, capo: s.capo || 0, tuning: s.tuning || 'standard',
      sections: s.sections.map((x) => (Array.isArray(x.notes) ? { name: x.name, notes: x.notes.map((n) => ({ s: n.s, f: n.f })) } : { name: x.name, chords: x.chords.slice() })),
      from, unsure: s.unsure || [], notes: s.notes || '', sources: res.sources || [], prepNotes: res.prepNotes || [],
    };
    audio.blip('on'); bus.emit('flash', 0.35);
    setView('edit');
  }

  // open Chord changes with these chords
  function practise(cfg) {
    bus.emit('changes:load', cfg);
    director.swap('changes');
  }

  // ── editing ──
  function startEdit(x) {
    draft = x ? JSON.parse(JSON.stringify(x)) : { id: null, title: '', artist: '', sections: [{ name: 'Verse', chords: [] }] };
    if (!draft.sections || !draft.sections.length) draft.sections = [{ name: 'Verse', chords: [] }];
    setView('edit');
  }
  function syncFields() {
    if (!draft) return;
    const t = el.querySelector('.sg-in-title'), a = el.querySelector('.sg-in-artist');
    if (t) draft.title = t.value.trim();
    if (a) draft.artist = a.value.trim();
  }
  async function addChord(si) {
    const all = allShapes(E);
    const v = await picker.chords({
      title: `${words.addTo} ${draft.sections[si].name}`, library: E.Chords.LIBRARY,
      more: [...MORE_GROUPS.map(([label, f]) => ({ label, shapes: all.more.filter(f) })), { label: words.taught, shapes: all.taught }],
      other: { label: words.other, placeholder: words.otherPh, add: words.addBtn, note: words.otherNote },
    });
    if (!v) return;
    const name = v.trim();
    draft.sections[si].chords.push(name);
    renderEdit();
    showChord(name);
    if (!known(name)) { await teachFor(name); renderEdit(); }
  }
  async function chipMenu(si, ci) {
    const name = draft.sections[si].chords[ci];
    showChord(name);
    const k = known(name), sh = E && shapeFor(E, name);
    const rows = [
      { value: 'teach', label: k ? words.changeFingering : words.teachIt, sub: k ? (sh.taught ? words.taughtByYou : '') : words.notChecked, accent: !k },
      ci > 0 ? { value: 'left', label: `← ${words.moveLeft}` } : null,
      ci < draft.sections[si].chords.length - 1 ? { value: 'right', label: `${words.moveRight} →` } : null,
      { value: 'dup', label: words.repeat },
      { value: 'remove', label: words.remove },
    ].filter(Boolean);
    const v = await picker.list({ title: name, value: '', tabs: [{ id: 'c', label: name, rows }] });
    const ch = draft.sections[si].chords;
    if (v === 'remove') ch.splice(ci, 1);
    if (v === 'dup') ch.splice(ci + 1, 0, name);
    if (v === 'left') [ch[ci - 1], ch[ci]] = [ch[ci], ch[ci - 1]];
    if (v === 'right') [ch[ci + 1], ch[ci]] = [ch[ci], ch[ci + 1]];
    if (v === 'teach') await teachFor(name);
    renderEdit();
  }
  async function renameSection(si) {
    const names = isTab(draft.sections[si]) ? TAB_NAMES : SECTION_NAMES;
    const v = await picker.list({
      title: words.section, value: draft.sections[si].name,
      tabs: [{ id: 's', label: words.section, rows: names.map((n) => ({ value: n, label: n })) }],
    });
    if (v) { draft.sections[si].name = v; renderEdit(); }
  }
  async function addSection() {
    const used = draft.sections.map((s) => s.name);
    const v = await picker.list({
      title: `+ ${words.section}`, value: '',
      tabs: [
        { id: 's', label: words.chordSections, rows: SECTION_NAMES.filter((n) => n !== 'Riff' && n !== 'Solo').map((n) => ({ value: n, label: n, sub: used.includes(n) ? words.again : words.chordsWord })) },
        { id: 't', label: words.tabSections, note: words.tabNote, rows: TAB_NAMES.map((n) => ({ value: `tab:${n}`, label: n, sub: words.tabWord })) },
      ],
    });
    if (v && v.startsWith('tab:')) {
      draft.sections.push({ name: v.slice(4), notes: [] });
      renderEdit();
      await notesFor(draft.sections.length - 1);
      renderEdit();
      body.scrollTop = body.scrollHeight;
      return;
    }
    if (v) {
      // a repeated section starts with the chords it had the first time
      const prev = [...draft.sections].reverse().find((s) => s.name === v);
      draft.sections.push({ name: v, chords: prev ? prev.chords.slice() : [] });
      renderEdit();
      body.scrollTop = body.scrollHeight;
    }
  }

  // ── riffs: type notes in on a fret grid (each tap = the next note) ──
  async function notesFor(si) {
    const sec = draft.sections[si];
    const open = openMidi(draft.tuning || 'standard');
    let base = Math.max(1, Math.min(...sec.notes.filter((n) => n.f > 0).map((n) => n.f).concat([1])));
    const NAMES = tabLabels(draft.tuning).slice().reverse();
    const draw = () => `
      <p class="pk-note">${esc(words.notesHow)}</p>
      <div class="tg-tab">${tabHtml(sec.notes.slice(-16), { labels: tabLabels(draft.tuning) })}</div>
      <div class="tg">
        <div class="tg-grid">
          <span></span>${NAMES.map((n) => `<b>${n}</b>`).join('')}
          ${[0, base, base + 1, base + 2, base + 3, base + 4].map((r) => `<span class="tg-f">${r}</span>${NAMES.map((_, st) => `<button type="button" class="tg-c${r === 0 ? ' is-open' : ''}" data-nt="${st}:${r}" aria-label="${NAMES[st]} ${r}"></button>`).join('')}`).join('')}
        </div>
        <div class="tg-side">
          <button type="button" class="tg-base" data-base="-1" ${base <= 1 ? 'disabled' : ''}>▲</button>
          <span>${esc(words.fret)} ${base}</span>
          <button type="button" class="tg-base" data-base="1" ${base >= 20 ? 'disabled' : ''}>▼</button>
          <span class="tg-count">${sec.notes.length} ${esc(words.notesWord)}</span>
        </div>
      </div>
      <div class="pk-multi"><button type="button" class="tg-undo" ${sec.notes.length ? '' : 'disabled'}>⌫ ${esc(words.undo)}</button><button type="button" class="tg-save">${esc(words.done)}</button></div>`;
    const done = picker.sheet(`${sec.name} · ${words.tabWord}`, draw());
    const onClick = (e) => {
      const c = e.target.closest('[data-nt]');
      if (c) {
        const [st, f] = c.dataset.nt.split(':').map(Number);
        if (sec.notes.length >= 128) return;
        sec.notes.push({ s: st, f });
        audio.unlock(); audio.pluck(open[st] + f + (draft.capo || 0), { vel: 0.7 });
        const g = g3(); if (g) g.pluck(st, 0.8, f);
        picker.body.innerHTML = draw();
        return;
      }
      const b = e.target.closest('[data-base]');
      if (b) { base = Math.max(1, Math.min(20, base + +b.dataset.base)); picker.body.innerHTML = draw(); return; }
      if (e.target.closest('.tg-undo')) { sec.notes.pop(); picker.body.innerHTML = draw(); return; }
      if (e.target.closest('.tg-save')) picker.done(true);
    };
    picker.body.addEventListener('click', onClick);
    await done;
    picker.body.removeEventListener('click', onClick);
  }
  async function noteMenu(si, ni) {
    const notes = draft.sections[si].notes, n = notes[ni];
    const open = openMidi(draft.tuning || 'standard');
    audio.unlock(); audio.pluck(open[n.s] + n.f + (draft.capo || 0), { vel: 0.7 });
    const v = await picker.list({ title: `${TAB_LINES[5 - n.s]} · ${n.f}`, value: '', tabs: [{ id: 'n', label: 'note', rows: [
      ni > 0 ? { value: 'left', label: `← ${words.moveLeft}` } : null,
      ni < notes.length - 1 ? { value: 'right', label: `${words.moveRight} →` } : null,
      { value: 'dup', label: words.repeat },
      { value: 'remove', label: words.remove },
    ].filter(Boolean) }] });
    if (v === 'remove') notes.splice(ni, 1);
    if (v === 'dup') notes.splice(ni + 1, 0, { ...n });
    if (v === 'left') [notes[ni - 1], notes[ni]] = [notes[ni], notes[ni - 1]];
    if (v === 'right') [notes[ni + 1], notes[ni]] = [notes[ni], notes[ni + 1]];
    renderEdit();
  }
  // open the riff player (pick one if the song has several)
  async function playRiff(x) {
    const tabs = songTabs(x);
    let si = tabs.length ? tabs[0][1] : -1;
    if (tabs.length > 1) {
      const v = await picker.list({ title: words.playRiff, value: '', tabs: [{ id: 'r', label: words.riffsWord, rows: tabs.map(([s, i]) => ({ value: String(i), label: s.name, sub: `${s.notes.length} ${words.notesWord}` })) }] });
      if (v === null) return;
      si = +v;
    }
    if (si < 0) return;
    bus.emit('riff:load', { song: x, si });
    director.swap('riff');
  }

  // ── teach a chord: tap the fret on each string ──
  // In plain words: you say which fret each string is pressed at (or ✕ = not played). From that
  // the app knows the exact note every string should give — the same thing it knows for its own
  // chords — so it can hear and check this one too.
  async function teachFor(name) {
    const old = E && shapeFor(E, name);
    const p = parseName(name);
    let frets = old ? old.frets.slice() : [-1, -1, -1, -1, -1, -1];
    let base = Math.max(1, Math.min(...frets.filter((f) => f > 0).concat([1])));
    const NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
    const OPEN = [40, 45, 50, 55, 59, 64];
    const draw = () => {
      const shape = { frets, barre: findBarre(frets) };
      const notes = frets.map((f, i) => (f < 0 ? '·' : NOTE_NAMES[(OPEN[i] + f) % 12]));
      const rows = ['x', 0, base, base + 1, base + 2, base + 3, base + 4];
      return `
        <p class="pk-note">${esc(words.teachHow)}${p ? '' : ` ${esc(words.teachNoName)}`}</p>
        <div class="tg">
          <div class="tg-grid">
            <span></span>${NAMES.map((n) => `<b>${n}</b>`).join('')}
            ${rows.map((r) => `<span class="tg-f">${r === 'x' ? '✕' : r}</span>${NAMES.map((_, s) => {
              const on = r === 'x' ? frets[s] < 0 : frets[s] === r;
              return `<button type="button" class="tg-c${on ? ' is-on' : ''}${r === 0 ? ' is-open' : ''}" data-tg="${s}:${r}" aria-label="${NAMES[s]} ${r}"></button>`;
            }).join('')}`).join('')}
          </div>
          <div class="tg-side">
            <button type="button" class="tg-base" data-base="-1" ${base <= 1 ? 'disabled' : ''}>▲</button>
            <span>${esc(words.fret)} ${base}</span>
            <button type="button" class="tg-base" data-base="1" ${base >= 15 ? 'disabled' : ''}>▼</button>
            <div class="tg-prev">${miniDiagram({ frets, barre: shape.barre })}</div>
          </div>
        </div>
        <p class="tg-notes">${notes.map((n) => `<span>${n}</span>`).join('')}</p>
        <div class="pk-multi"><button type="button" class="tg-later">${esc(old ? words.cancel : words.later)}</button><button type="button" class="tg-save" ${frets.filter((f) => f >= 0).length >= 2 ? '' : 'disabled'}>${esc(words.saveChord)}</button></div>`;
    };
    const done = picker.sheet(`${words.teach} ${name}`, draw());
    const onClick = (e) => {
      const c = e.target.closest('[data-tg]');
      if (c) {
        const [s, r] = c.dataset.tg.split(':');
        frets[+s] = r === 'x' ? -1 : +r;
        const g = g3(); if (g && frets[+s] >= 0) g.pluck(+s, 0.7, frets[+s]);
        picker.body.innerHTML = draw();
        return;
      }
      const b = e.target.closest('[data-base]');
      if (b) { base = Math.max(1, Math.min(15, base + +b.dataset.base)); picker.body.innerHTML = draw(); return; }
      if (e.target.closest('.tg-later')) { picker.done(null); return; }
      if (e.target.closest('.tg-save') && frets.filter((f) => f >= 0).length >= 2) picker.done(frets.slice());
    };
    picker.body.addEventListener('click', onClick);
    const res = await done;
    picker.body.removeEventListener('click', onClick);
    if (res) {
      teach(name, res);
      shownChord = '';
      showChord(name);
      audio.blip('on');
    }
    return res;
  }

  $('.ex-exit').addEventListener('click', () => director.exit());
  bus.on('ex:enter', (n) => {
    if (n !== 'songs') return;
    open = true; shownChord = '';
    el.classList.add('is-open');
    if (view === 'edit' && !draft) view = 'list';
    setView(current && view !== 'list' ? view : 'list');
    loadEngine().then((eng) => { E = eng; if (open) render(); }).catch(() => {});
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'songs') return;
    open = false; picker.close();
    el.classList.remove('is-open');
    g3()?.setChord(null);
  });
  // opened from elsewhere on a given song
  bus.on('songs:show', (id) => { current = id; view = 'song'; });
  return { el };
}
