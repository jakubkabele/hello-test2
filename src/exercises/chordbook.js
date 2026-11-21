// The chord book: every chord the site can draw and hear.
//
//  • CORE  = the practice engine's own 31 shapes (Chords.LIBRARY). Only these take part when a
//            chord is recognised "blind" (Clean check on Auto, "heard G7" messages).
//  • MORE  = common chords the engine didn't have: power chords, 6, add9, 9, dim, aug, m7♭5,
//            slash chords (G/B) and more barre chords (B♭, C#m, Fm …).
//  • TAUGHT = chords you entered yourself on the fret grid (saved on this device).
//
// A chord from MORE or TAUGHT is heard exactly like a core chord (its notes, string by string),
// but only while an exercise is asking for it — so adding chords never makes the blind
// recognition of the everyday chords worse.
//
// Names: flats and sharps both work (B♭ = Bb = A#). A song keeps your spelling.

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const TAUGHT_KEY = 'practice.chords.taught';

// [name, frets low E → high e (-1 = don't play)]
const MORE_DEFS = [
  // power chords
  ['E5', [0, 2, 2, -1, -1, -1]], ['F5', [1, 3, 3, -1, -1, -1]], ['G5', [3, 5, 5, -1, -1, -1]],
  ['A5', [-1, 0, 2, 2, -1, -1]], ['B5', [-1, 2, 4, 4, -1, -1]], ['C5', [-1, 3, 5, 5, -1, -1]], ['D5', [-1, -1, 0, 2, 3, -1]],
  // more barre / sharp-flat chords
  ['A#', [-1, 1, 3, 3, 3, 1]], ['A#m', [-1, 1, 3, 3, 2, 1]], ['C#', [-1, 4, 6, 6, 6, 4]], ['C#m', [-1, 4, 6, 6, 5, 4]],
  ['D#', [-1, 6, 8, 8, 8, 6]], ['D#m', [-1, 6, 8, 8, 7, 6]], ['Fm', [1, 3, 3, 1, 1, 1]], ['F#', [2, 4, 4, 3, 2, 2]],
  ['G#', [4, 6, 6, 5, 4, 4]], ['G#m', [4, 6, 6, 4, 4, 4]], ['Bm7', [-1, 2, 4, 2, 3, 2]], ['F#7', [2, 4, 2, 3, 2, 2]],
  ['F#m7', [2, 4, 2, 2, 2, 2]], ['Cm7', [-1, 3, 5, 3, 4, 3]], ['Gm7', [3, 5, 3, 3, 3, 3]], ['Fm7', [1, 3, 1, 1, 1, 1]],
  ['A#maj7', [-1, 1, 3, 2, 3, 1]], ['C#m7', [-1, 4, 6, 4, 5, 4]], ['G#7', [4, 6, 4, 5, 4, 4]],
  // maj7 / 7 / sus that the chart was missing
  ['Dmaj7', [-1, -1, 0, 2, 2, 2]], ['Gmaj7', [3, 2, 0, 0, 0, 2]], ['Amaj7', [-1, 0, 2, 1, 2, 0]], ['Emaj7', [0, 2, 1, 1, 0, 0]],
  ['F7', [1, 3, 1, 2, 1, 1]], ['Csus2', [-1, 3, 0, 0, 1, 3]], ['Csus4', [-1, 3, 3, 0, 1, 1]], ['Gsus4', [3, 3, 0, 0, 1, 3]],
  ['Esus2', [0, 2, 4, 4, 0, 0]], ['Gsus2', [3, 0, 0, 0, 3, 3]],
  // 6, add9, 9
  ['C6', [-1, 3, 2, 2, 1, 0]], ['D6', [-1, -1, 0, 2, 0, 2]], ['E6', [0, 2, 2, 1, 2, 0]], ['G6', [3, 2, 0, 0, 0, 0]], ['A6', [-1, 0, 2, 2, 2, 2]],
  ['Am6', [-1, 0, 2, 2, 1, 2]], ['Em6', [0, 2, 2, 0, 2, 0]], ['Dm6', [-1, -1, 0, 2, 0, 1]],
  ['Cadd9', [-1, 3, 2, 0, 3, 0]], ['Gadd9', [3, 0, 0, 2, 0, 3]], ['Dadd9', [-1, 5, 4, 2, 3, 0]], ['Eadd9', [0, 2, 2, 1, 0, 2]], ['Aadd9', [-1, 0, 2, 4, 2, 0]],
  ['Fadd9', [-1, -1, 3, 2, 1, 3]], ['Emadd9', [0, 2, 4, 0, 0, 0]], ['Amadd9', [-1, 0, 2, 4, 1, 0]],
  ['C9', [-1, 3, 2, 3, 3, 3]], ['D9', [-1, 5, 4, 5, 5, 5]], ['E9', [0, 2, 0, 1, 0, 2]], ['A9', [-1, 0, 2, 4, 2, 3]], ['G9', [3, -1, 0, 2, 0, 1]],
  // dim, aug, m7♭5
  ['Bdim', [-1, 2, 3, 4, 3, -1]], ['C#dim', [-1, 4, 5, 6, 5, -1]], ['Ddim', [-1, -1, 0, 1, 3, 1]], ['Edim', [0, 1, 2, 0, -1, -1]], ['F#dim', [2, 3, 4, 2, -1, -1]], ['G#dim', [4, 5, 6, 4, -1, -1]],
  ['Caug', [-1, 3, 2, 1, 1, 0]], ['Eaug', [0, 3, 2, 1, 1, 0]], ['Gaug', [3, 2, 1, 0, 0, 3]], ['Aaug', [-1, 0, 3, 2, 2, 1]],
  ['Bm7b5', [-1, 2, 3, 2, 3, -1]], ['Em7b5', [0, 1, 2, 0, 3, 0]], ['F#m7b5', [2, -1, 2, 2, 1, -1]], ['Am7b5', [-1, 0, 1, 0, 1, -1]], ['Dm7b5', [-1, -1, 0, 1, 1, 1]],
  // slash chords
  ['G/B', [-1, 2, 0, 0, 0, 3]], ['C/G', [3, 3, 2, 0, 1, 0]], ['C/E', [0, 3, 2, 0, 1, 0]], ['C/B', [-1, 2, 2, 0, 1, 0]], ['D/F#', [2, -1, 0, 2, 3, 2]],
  ['D/A', [-1, 0, 0, 2, 3, 2]], ['D/C', [-1, 3, 0, 2, 3, 2]], ['Am/G', [3, 0, 2, 2, 1, 0]], ['Am/E', [0, 0, 2, 2, 1, 0]], ['Am/F#', [2, 0, 2, 2, 1, 0]],
  ['F/C', [-1, 3, 3, 2, 1, 1]], ['F/A', [-1, 0, 3, 2, 1, 1]], ['A/C#', [-1, 4, 2, 2, 2, 0]], ['G/F#', [2, 2, 0, 0, 0, 3]], ['Em/D', [-1, -1, 0, 0, 0, 0]], ['E/G#', [4, 2, 2, 1, 0, 0]],
];

// "Bbmaj7" → { root: 10, q: 'maj7', bass: null }; "D/F#" → bass 6. null if it isn't a chord name.
export function parseName(raw) {
  const s = String(raw || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/\s+/g, '');
  const m = s.match(/^([A-Ga-g])([#b]?)([^/]*)(?:\/([A-Ga-g])([#b]?))?$/);
  if (!m) return null;
  const pc = (l, acc) => {
    let n = l.toUpperCase() + (acc || '');
    n = FLAT[n] || n;
    return NOTE.indexOf(n);
  };
  const root = pc(m[1], m[2]);
  if (root < 0) return null;
  return { root, q: m[3] || '', bass: m[4] ? pc(m[4], m[5]) : null };
}
// one spelling for lookups: flats → sharps, "min" → "m", "maj" kept, "-" → "m"
export function canonical(raw) {
  const p = parseName(raw);
  if (!p) return String(raw || '').trim();
  let q = p.q.replace(/^(min|mi|-)(?!aj)/, 'm').replace(/^M7$/, 'maj7').replace(/^Δ7?$/, 'maj7').replace(/^major$/, '').replace(/^maj$/, '');
  return NOTE[p.root] + q + (p.bass !== null ? `/${NOTE[p.bass]}` : '');
}

// a shape object in the engine's own form
function makeShape(name, frets, extra = {}) {
  const p = parseName(name) || { root: 0, q: '' };
  const fr = frets.map((f) => (f === null || f === undefined ? -1 : f));
  const sh = {
    name, root: p.root, q: p.q, frets: fr, chord: canonical(name),
    midi: fr.map((f, s) => (f < 0 ? -1 : OPEN_MIDI[s] + f)),
    barre: findBarre(fr), ...extra,
  };
  sh.isBarre = !!sh.barre;
  return sh;
}

// A barre = the lowest fretted fret, held on 3+ strings, with no open string in between.
export function findBarre(frets) {
  const fretted = frets.filter((f) => f > 0);
  if (fretted.length < 4) return null;
  const low = Math.min(...fretted);
  const on = frets.map((f, i) => (f === low ? i : -1)).filter((i) => i >= 0);
  if (on.length < 2) return null;
  const from = on[0], to = on[on.length - 1];
  for (let i = from; i <= to; i++) if (frets[i] === 0 || frets[i] < 0) return null;
  // the index finger lies flat from the lowest played string up to the high e
  const firstPlayed = frets.findIndex((f) => f >= 0);
  if (from !== firstPlayed || to !== 5) return null;
  return { fret: low, from, to };
}

const MORE = MORE_DEFS.map(([n, f]) => makeShape(n, f, { more: true }));

export function loadTaught() {
  try {
    const l = JSON.parse(localStorage.getItem(TAUGHT_KEY) || '[]');
    return Array.isArray(l) ? l.filter((c) => c && c.name && Array.isArray(c.frets)).map((c) => makeShape(c.name, c.frets, { taught: true })) : [];
  } catch { return []; }
}
export function teach(name, frets) {
  let l = [];
  try { l = JSON.parse(localStorage.getItem(TAUGHT_KEY) || '[]'); } catch { l = []; }
  if (!Array.isArray(l)) l = [];
  const key = canonical(name);
  l = l.filter((c) => canonical(c.name) !== key);
  l.push({ name: name.trim(), frets });
  try { localStorage.setItem(TAUGHT_KEY, JSON.stringify(l)); } catch { /* storage blocked */ }
}
export function forget(name) {
  let l = [];
  try { l = JSON.parse(localStorage.getItem(TAUGHT_KEY) || '[]'); } catch { l = []; }
  const key = canonical(name);
  try { localStorage.setItem(TAUGHT_KEY, JSON.stringify((l || []).filter((c) => canonical(c.name) !== key))); } catch { /* blocked */ }
}

// Find the shape for a chord name. Taught chords win (you said how you play it), then the
// engine's own, then MORE. Exact name first ("G barre"), then the same chord spelled any way.
export function shapeFor(E, raw) {
  if (!raw) return null;
  const core = E ? E.Chords.LIBRARY : [];
  const taught = loadTaught();
  const exact = [...taught, ...core, ...MORE].find((c) => c.name === raw);
  if (exact) return exact;
  const key = canonical(raw);
  return taught.find((c) => c.chord === key) || core.find((c) => c.chord === key && !/barre/.test(c.name)) || core.find((c) => c.chord === key) || MORE.find((c) => c.chord === key) || null;
}
export const knows = (E, raw) => !!shapeFor(E, raw);

// Every shape, for the picker: { core, more, taught }
export function allShapes(E) {
  return { core: E ? E.Chords.LIBRARY : [], more: MORE, taught: loadTaught() };
}

// Rank every core shape, plus the extra ones this exercise is asking for, against what was heard.
export function rank(E, h, extra = []) {
  const list = [...E.Chords.LIBRARY, ...extra.filter((s) => s && !E.Chords.LIBRARY.includes(s))];
  return list.map((shape) => ({ shape, score: E.Chords.fit(h, shape) })).sort((a, b) => b.score - a.score);
}

// ── tunings ──
// offsets = how many semitones each string (low E → high e) is tuned away from standard.
export const TUNINGS = [
  { id: 'standard', name: 'Standard', notes: 'E A D G B E', offsets: [0, 0, 0, 0, 0, 0] },
  { id: 'halfDown', name: 'Half step down', notes: 'E♭ A♭ D♭ G♭ B♭ E♭', offsets: [-1, -1, -1, -1, -1, -1] },
  { id: 'wholeDown', name: 'D standard', notes: 'D G C F A D', offsets: [-2, -2, -2, -2, -2, -2] },
  { id: 'dropD', name: 'Drop D', notes: 'D A D G B E', offsets: [-2, 0, 0, 0, 0, 0] },
  { id: 'dropCs', name: 'Drop C♯', notes: 'C♯ G♯ C♯ F♯ A♯ D♯', offsets: [-3, -1, -1, -1, -1, -1] },
  { id: 'dropC', name: 'Drop C', notes: 'C G C F A D', offsets: [-4, -2, -2, -2, -2, -2] },
  { id: 'cStandard', name: 'C standard', notes: 'C F A♯ D♯ G C', offsets: [-4, -4, -4, -4, -4, -4] },
  { id: 'dropB', name: 'Drop B', notes: 'B F♯ B E G♯ C♯', offsets: [-5, -3, -3, -3, -3, -3] },
  { id: 'openG', name: 'Open G', notes: 'D G D G B D', offsets: [-2, -2, 0, 0, 0, -2] },
  { id: 'openD', name: 'Open D', notes: 'D A D F♯ A D', offsets: [-2, 0, 0, -1, -2, -2] },
  { id: 'dadgad', name: 'DADGAD', notes: 'D A D G A D', offsets: [-2, 0, 0, 0, -2, -2] },
];
export const tuningOf = (id) => TUNINGS.find((t) => t.id === id) || TUNINGS[0];
// the note (midi) each open string gives in a tuning
export const openMidi = (id) => tuningOf(id).offsets.map((o, s) => OPEN_MIDI[s] + o);

// A capo on fret n and/or another tuning: the same shape gives other notes. The shape's name and
// frets stay what you play ("G" with capo 2); the notes it should give (what gets heard) move.
// For the 3D neck the frets shift up by the capo.
export function withSetup(shape, { capo = 0, tuning = 'standard' } = {}) {
  const off = tuningOf(tuning).offsets;
  if (!shape || (!capo && off.every((o) => !o))) return shape;
  const frets = shape.frets.map((f) => (f < 0 ? -1 : f + capo));
  const sh = { ...makeShape(shape.name, frets), name: shape.name, capo, tuning, taught: shape.taught, more: shape.more };
  sh.midi = frets.map((f, s) => (f < 0 ? -1 : OPEN_MIDI[s] + off[s] + f));
  return sh;
}
export const withCapo = (shape, capo) => withSetup(shape, { capo });

// what the 3D neck draws: frets ('x' = don't play) + the barre, if any
export function neck(shape) {
  if (!shape) return null;
  const f = shape.frets.map((x) => (x < 0 ? 'x' : x));
  if (shape.barre) f.barre = shape.barre;
  return f;
}

// groups for the "More chords" part of the picker
export const MORE_GROUPS = [
  ['Power', (s) => s.q === '5'],
  ['Sharps · flats · barre', (s) => /^[A-G]#/.test(s.name) && !/[/]/.test(s.name) && !/dim|aug|add|6|9|b5/.test(s.q) || ['Fm', 'Bm7', 'Cm7', 'Gm7', 'Fm7', 'F7'].includes(s.name)],
  ['maj7 · sus', (s) => /^(maj7|sus2|sus4)$/.test(s.q) && !/^[A-G]#/.test(s.name)],
  ['6 · add9 · 9', (s) => /(6|add9|9)$/.test(s.q) && !/[/]/.test(s.name)],
  ['dim · aug · m7♭5', (s) => /(dim|aug|m7b5)$/.test(s.q)],
  ['Slash', (s) => /\//.test(s.name)],
];
export const NOTE_NAMES = NOTE;
