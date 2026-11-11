// Chord hearing engine — figures out which notes are sounding at once,
// names the chord, and checks a chord shape string by string.
//
// In plain words:
// 1. SPECTRUM: split ~0.7 s of sound into its frequencies (a "Fourier
//    transform"), then add them up per piano key (semitone), E2 → E7.
// 2. NOTES: every guitar note is a stack of frequencies (the note plus its
//    "harmonics" at 2×, 3×, 4× …). We look for the smallest set of notes whose
//    stacks add up to what we heard. This tells apart "low E ringing" from
//    "an E an octave higher" even though they share frequencies.
// 3. CHORD: compare the notes with every chord shape we know (exact notes,
//    exact octaves); the best fit wins, and the lowest note helps decide.
// 4. CHECK: for a chord shape we know, each string should produce one exact
//    note. Loud enough → ok, faint → weak, missing → muted, a neighbouring
//    note instead → wrong fret.
// 5. SINGLE PLUCKS: subtract what was ringing before the pluck, then ask
//    which of the expected notes the new sound is (string-by-string mode).

const Chords = (() => {
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
  const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

  // Chord shapes we can draw and check. frets: low E → high e, -1 = don't play.
  const C_ = 0, D_ = 2, E_ = 4, F_ = 5, Fs = 6, G_ = 7, A_ = 9, B_ = 11;
  const LIBRARY = [
    { name: 'C',     root: C_, q: '',     frets: [-1, 3, 2, 0, 1, 0] },
    { name: 'C7',    root: C_, q: '7',    frets: [-1, 3, 2, 3, 1, 0] },
    { name: 'Cmaj7', root: C_, q: 'maj7', frets: [-1, 3, 2, 0, 0, 0] },
    { name: 'D',     root: D_, q: '',     frets: [-1, -1, 0, 2, 3, 2] },
    { name: 'D7',    root: D_, q: '7',    frets: [-1, -1, 0, 2, 1, 2] },
    { name: 'Dm',    root: D_, q: 'm',    frets: [-1, -1, 0, 2, 3, 1] },
    { name: 'Dm7',   root: D_, q: 'm7',   frets: [-1, -1, 0, 2, 1, 1] },
    { name: 'Dsus2', root: D_, q: 'sus2', frets: [-1, -1, 0, 2, 3, 0] },
    { name: 'Dsus4', root: D_, q: 'sus4', frets: [-1, -1, 0, 2, 3, 3] },
    { name: 'E',     root: E_, q: '',     frets: [0, 2, 2, 1, 0, 0] },
    { name: 'E7',    root: E_, q: '7',    frets: [0, 2, 0, 1, 0, 0] },
    { name: 'Em',    root: E_, q: 'm',    frets: [0, 2, 2, 0, 0, 0] },
    { name: 'Em7',   root: E_, q: 'm7',   frets: [0, 2, 0, 0, 0, 0] },
    { name: 'Esus4', root: E_, q: 'sus4', frets: [0, 2, 2, 2, 0, 0] },
    { name: 'F',     root: F_, q: '',     frets: [1, 3, 3, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
    { name: 'Fmaj7', root: F_, q: 'maj7', frets: [-1, -1, 3, 2, 1, 0] },
    { name: 'F#m',   root: Fs, q: 'm',    frets: [2, 4, 4, 2, 2, 2], barre: { fret: 2, from: 0, to: 5 } },
    { name: 'G',     root: G_, q: '',     frets: [3, 2, 0, 0, 0, 3] },
    { name: 'G7',    root: G_, q: '7',    frets: [3, 2, 0, 0, 0, 1] },
    { name: 'G barre', root: G_, q: '',   frets: [3, 5, 5, 4, 3, 3], barre: { fret: 3, from: 0, to: 5 } },
    { name: 'Gm',    root: G_, q: 'm',    frets: [3, 5, 5, 3, 3, 3], barre: { fret: 3, from: 0, to: 5 } },
    { name: 'A',     root: A_, q: '',     frets: [-1, 0, 2, 2, 2, 0] },
    { name: 'A7',    root: A_, q: '7',    frets: [-1, 0, 2, 0, 2, 0] },
    { name: 'Am',    root: A_, q: 'm',    frets: [-1, 0, 2, 2, 1, 0] },
    { name: 'Am7',   root: A_, q: 'm7',   frets: [-1, 0, 2, 0, 1, 0] },
    { name: 'Asus2', root: A_, q: 'sus2', frets: [-1, 0, 2, 2, 0, 0] },
    { name: 'Asus4', root: A_, q: 'sus4', frets: [-1, 0, 2, 2, 3, 0] },
    { name: 'B',     root: B_, q: '',     frets: [-1, 2, 4, 4, 4, 2], barre: { fret: 2, from: 1, to: 5 } },
    { name: 'B7',    root: B_, q: '7',    frets: [-1, 2, 1, 2, 0, 2] },
    { name: 'Bm',    root: B_, q: 'm',    frets: [-1, 2, 4, 4, 3, 2], barre: { fret: 2, from: 1, to: 5 } },
    { name: 'Cm',    root: C_, q: 'm',    frets: [-1, 3, 5, 5, 4, 3], barre: { fret: 3, from: 1, to: 5 } },
  ];
  LIBRARY.forEach((v) => {
    v.isBarre = !!v.barre;
    v.chord = NOTE[v.root] + v.q;                       // "G barre" → "G"
    v.midi = v.frets.map((f, s) => (f < 0 ? -1 : OPEN_MIDI[s] + f));
  });

  // ---------- Spectrum ----------
  const BAND_LO = 38, BAND_HI = 100;  // semitone bands D2 … E7
  const NB = BAND_HI - BAND_LO + 1;
  const NOTE_LO = 40, NOTE_HI = 76;   // notes a chord can contain: E2 … E5
  const NN = NOTE_HI - NOTE_LO + 1;

  let fftN = 0, re, im, cosT, sinT, rev, win;

  function setupFFT(N) {
    fftN = N;
    re = new Float64Array(N);
    im = new Float64Array(N);
    cosT = new Float64Array(N / 2);
    sinT = new Float64Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
      cosT[i] = Math.cos((2 * Math.PI * i) / N);
      sinT[i] = -Math.sin((2 * Math.PI * i) / N);
    }
    rev = new Uint32Array(N);
    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
      rev[i] = r;
    }
    win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  }

  function fft() {
    const N = fftN;
    for (let i = 0; i < N; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cosT[k] - im[b] * sinT[k];
          const ti = re[b] * sinT[k] + im[b] * cosT[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  // Sound → energy per semitone band.
  function spectrum(buf, sampleRate) {
    const N = buf.length;
    if (N !== fftN) setupFFT(N);
    for (let i = 0; i < N; i++) { re[i] = buf[i] * win[i]; im[i] = 0; }
    fft();
    const power = new Float64Array(NB);
    const kLo = Math.ceil((70 * N) / sampleRate);
    const kHi = Math.floor((2700 * N) / sampleRate);
    let logSum = 0, sum = 0;
    for (let k = kLo; k <= kHi; k++) {
      const f = (k * sampleRate) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      const b = Math.round(69 + 12 * Math.log2(f / 440)) - BAND_LO;
      if (b >= 0 && b < NB) power[b] += p;
      logSum += Math.log(p + 1e-20);
      sum += p;
    }
    const count = kHi - kLo + 1;
    // Spectral flatness: geometric mean / average. Noise ≈ 0.5, notes ≈ 0.01.
    power.flatness = sum > 0 ? Math.exp(logSum / count) / (sum / count) : 1;
    return power;
  }

  // Squash loud vs quiet so quiet high strings still count.
  function compress(power) {
    const v = new Float64Array(power.length);
    for (let i = 0; i < power.length; i++) v[i] = Math.pow(Math.max(power[i], 0), 0.25);
    return v;
  }

  // ---------- Notes (which notes add up to this sound?) ----------
  const W = [];       // W[band][note]: how much a note shows up in each band
  const WtW = [];
  (function buildTemplates() {
    for (let b = 0; b < NB; b++) W.push(new Float64Array(NN));
    for (let j = 0; j < NN; j++) {
      const n = NOTE_LO + j;
      for (let h = 1; h <= 16; h++) {
        // Harmonics above the 6th fall between piano keys: share them out.
        const pos = n + 12 * Math.log2(h) - BAND_LO;
        const lo = Math.floor(pos), frac = pos - lo;
        if (lo >= NB) break;
        const a = Math.pow(h, -1.1);
        W[lo][j] += a * (1 - frac);
        if (lo + 1 < NB) W[lo + 1][j] += a * frac;
      }
      let norm = 0;
      for (let b = 0; b < NB; b++) norm += W[b][j] * W[b][j];
      norm = Math.sqrt(norm);
      for (let b = 0; b < NB; b++) W[b][j] /= norm;
    }
    for (let j = 0; j < NN; j++) {
      WtW.push(new Float64Array(NN));
      for (let k = 0; k < NN; k++) {
        let s = 0;
        for (let b = 0; b < NB; b++) s += W[b][j] * W[b][k];
        WtW[j][k] = s;
      }
    }
  })();

  // Returns note strengths, index = MIDI note number (0 for notes we don't track),
  // scaled so the strongest note = 1.
  function notes(v, iterations = 200) {
    const num = new Float64Array(NN);
    let maxNum = 0;
    for (let j = 0; j < NN; j++) {
      let s = 0;
      for (let b = 0; b < NB; b++) s += W[b][j] * v[b];
      num[j] = s;
      if (s > maxNum) maxNum = s;
    }
    const out = new Float64Array(128);
    if (maxNum <= 0) return out;
    const lambda = 0.1 * maxNum; // push towards "fewer notes"
    const h = new Float64Array(NN).fill(maxNum / NN);
    for (let it = 0; it < iterations; it++) {
      for (let j = 0; j < NN; j++) {
        let den = lambda;
        const row = WtW[j];
        for (let k = 0; k < NN; k++) den += row[k] * h[k];
        h[j] *= num[j] / den;
      }
    }
    let max = 0;
    for (let j = 0; j < NN; j++) if (h[j] > max) max = h[j];
    if (max > 0) for (let j = 0; j < NN; j++) out[NOTE_LO + j] = h[j] / max;
    return out;
  }

  // Returns note strengths; .flatness says how noise-like the sound is
  // (near 0 = clear notes with sharp peaks; higher = flat noise like a clap).
  function hear(buf, sampleRate) {
    const power = spectrum(buf, sampleRate);
    const h = notes(compress(power));
    h.flatness = power.flatness;
    return h;
  }

  // ---------- Single plucks (string by string) ----------
  // What sound is NEW after a pluck? (After minus before: strings that were
  // already ringing cancel out, only the fresh string is left.)
  function newSound(before, after, sampleRate) {
    const a = spectrum(before, sampleRate);
    const b = spectrum(after, sampleRate);
    const diff = new Float64Array(NB);
    let total = 0, totalAfter = 0;
    for (let i = 0; i < NB; i++) {
      diff[i] = Math.max(b[i] - a[i], 0);
      total += diff[i];
      totalAfter += b[i];
    }
    diff.share = totalAfter > 0 ? total / totalAfter : 0; // how much of the sound is new
    return diff;
  }

  // Which of these candidate notes is the new sound? A note counts only if its
  // own frequency is really there (stops octave mix-ups) and its harmonics hold
  // most of the new energy (stops knocks and noise). Returns { note, focus }.
  function whichNote(diff, candidates) {
    let total = 0, max = 0;
    for (let i = 0; i < NB; i++) { total += diff[i]; if (diff[i] > max) max = diff[i]; }
    if (total <= 0) return { note: -1, focus: 0 };
    const scored = [];
    candidates.forEach((n) => {
      const fund = n - BAND_LO;
      if (fund < 0 || fund >= NB || diff[fund] < 0.03 * max) return;
      const bands = new Set();
      for (let k = 1; k <= 8; k++) bands.add(Math.round(n + 12 * Math.log2(k)) - BAND_LO);
      let on = 0;
      bands.forEach((b) => { if (b < NB) on += diff[b]; });
      scored.push({ note: n, focus: on / total });
    });
    if (!scored.length) return { note: -1, focus: 0 };
    scored.sort((a, b) => b.focus - a.focus);
    // A higher octave's harmonics are a subset of the lower note's, so they
    // score alike: if the lower octave is really there and nearly as good, it's that.
    const best = scored[0];
    const lower = scored
      .filter((c) => c.note < best.note && (best.note - c.note) % 12 === 0 && c.focus >= 0.85 * best.focus)
      .sort((a, b) => a.note - b.note)[0];
    return lower || best;
  }

  // ---------- Chord name ----------
  // Compare what we heard with the exact notes of every chord shape we know
  // (which string gives which note, in which octave). Best fit wins.
  function lowestNote(h) {
    for (let n = NOTE_LO; n <= NOTE_HI; n++) if (h[n] >= 0.3) return n;
    return -1;
  }

  function fit(h, shape) {
    const exp = shape.midi.filter((m) => m >= 0);
    let gain = 0;
    exp.forEach((m) => (gain += Math.min(h[m] / 0.3, 1)));
    let extra = 0, total = 0;
    for (let n = NOTE_LO; n <= NOTE_HI; n++) {
      if (h[n] < 0.15) continue;
      total += h[n];
      if (exp.includes(n)) continue;
      if (exp.some((m) => n > m && (n - m) % 12 === 0 && h[m] >= OK)) continue; // just harmonics
      extra += h[n];
    }
    let score = gain / exp.length - extra / (total || 1);
    if (lowestNote(h) === Math.min(...exp)) score += 0.15; // the bass note usually names the chord
    return score;
  }

  // All known shapes ranked, best first: [{ shape, score }]
  function recognize(h) {
    return LIBRARY.map((shape) => ({ shape, score: fit(h, shape) })).sort((a, b) => b.score - a.score);
  }

  // ---------- Checking a shape ----------
  const OK = 0.1;     // minimum strength that counts as "this note is there"
  // Defaults (= sensitivity level 3); the app passes the current level's values.
  const RING_DEFAULT = 0.35;  // a string must reach 35% of the chord's typical string
  const EXTRA_DEFAULT = 0.3;  // a note this strong that shouldn't be there → problem

  // Returns { strings: [{ status, heard }], clean, problems: [text] }
  // status: 'ok' | 'weak' | 'wrong' | 'muted' | 'unsure' | 'skip' | 'extra' (unplayed string ringing)
  function check(h, shape, opts = {}) {
    const RING = opts.ring ?? RING_DEFAULT;
    const EXTRA = opts.extra ?? EXTRA_DEFAULT;
    const expected = shape.midi.filter((m) => m >= 0);
    // Judge each string against how loud this chord's strings typically are.
    const levels = expected.map((m) => h[m]).sort((a, b) => a - b);
    const typical = levels[Math.floor(levels.length / 2)] || 1;
    const ringing = Math.max(OK, RING * typical);
    const isDoubled = (m) => expected.some((low) => m > low && (m - low) % 12 === 0);
    const strings = shape.midi.map((m, s) => {
      if (m < 0) {
        const open = OPEN_MIDI[s];
        return { status: !expected.includes(open) && h[open] >= EXTRA ? 'extra' : 'skip', heard: open };
      }
      const a = h[m];
      if (a >= ringing) return { status: 'ok', heard: m, doubled: isDoubled(m) };
      // Same note as a lower string, an octave up: its sound hides inside
      // that string's harmonics, so a strum can't prove it's missing.
      if (expected.some((low) => m > low && (m - low) % 12 === 0 && h[low] >= OK)) {
        return { status: 'unsure', heard: m, doubled: true };
      }
      return { status: a >= ringing * 0.6 ? 'weak' : 'muted', heard: m };
    });

    // Strong notes that aren't part of the shape: probably a finger on the wrong fret.
    const extras = [];
    for (let n = NOTE_LO; n <= NOTE_HI; n++) {
      if (h[n] < EXTRA || expected.includes(n)) continue;
      if (strings.some((st) => st.status === 'extra' && st.heard === n)) continue;
      // An octave of a strong expected note is usually just its harmonics.
      if (expected.some((m) => (n - m) % 12 === 0 && h[m] >= OK)) continue;
      extras.push(n);
    }
    extras.forEach((n) => {
      let best = -1, bestDist = 3;
      shape.midi.forEach((m, s) => {
        if (m < 0 || strings[s].status === 'ok' || strings[s].status === 'skip') return;
        const d = Math.abs(n - m);
        if (d < bestDist) { bestDist = d; best = s; }
      });
      if (best >= 0) strings[best] = { status: 'wrong', heard: n };
    });

    const problems = [];
    strings.forEach((st, s) => {
      const name = STRING_NAMES[s] === 'e' ? 'high e' : STRING_NAMES[s];
      if (st.status === 'muted') problems.push(`${name} string muted — a finger may be touching it`);
      if (st.status === 'weak') problems.push(`${name} string quiet — press a bit firmer`);
      if (st.status === 'wrong') problems.push(`${name} string: heard ${NOTE[st.heard % 12]}, should be ${NOTE[shape.midi[s] % 12]} — check fret ${shape.frets[s]}`);
      if (st.status === 'extra') problems.push(`Don't play the ${name} string`);
    });

    const clean = strings.every((st) => st.status === 'ok' || st.status === 'skip' || st.status === 'unsure');
    const played = strings.filter((st) => st.status !== 'skip' && st.status !== 'extra').length;
    const okCount = strings.filter((st) => st.status === 'ok').length;
    return { strings, clean, problems, okCount, played, badness: problems.length };
  }

  // Shapes in our library for a chord name, best-matching first.
  function noteName(midi) {
    return NOTE[((midi % 12) + 12) % 12];
  }

  return {
    LIBRARY, STRING_NAMES, OPEN_MIDI,
    hear, newSound, whichNote, recognize, check, noteName,
  };
})();

if (typeof module !== 'undefined') module.exports = Chords;
