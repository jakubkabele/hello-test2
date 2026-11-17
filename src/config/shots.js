// The scroll storyboard. One "shot" = one resting position you scroll to.
//
//  win    focus-window home, as fractions of the screen: [left, top, width, height]
//         m = phone portrait, d = desktop / landscape.
//  anchor the part pinned to the centre of the window (guitar part, 'amp', 'pedal', 'center')
//  fit    guitar length as a fraction of the screen height (bigger = closer)
//  rot    rotation in degrees [x, y, z]
//  spin   extra turn (degrees) added while you scroll through the shot
//  stage  1 = the podium and spotlights are up
//  at     pin the anchored part to this screen point instead of the window centre
//  fixed  the window can't be dragged here
//  ex     not part of the scroll: the camera position used while that exercise is open

export const CHAPTERS = ['hero', 'tuner', 'chords', 'body', 'amp', 'pedal', 'stage'];

export const SHOTS = [
  {
    ch: 'hero', anchor: 'pickups',
    win: { m: [0.07, 0.3, 0.37, 0.36], d: [0.3, 0.2, 0.15, 0.56] },
    fit: { m: 1.12, d: 1.3 }, rot: [-8, 24, -20], spin: 34,
  },
  {
    ch: 'tuner', anchor: 'headstock',
    win: { m: [0.53, 0.135, 0.36, 0.3], d: [0.42, 0.17, 0.15, 0.52] },
    fit: { m: 2.2, d: 2.5 }, rot: [6, -30, 14], spin: 36,
  },
  {
    ch: 'chords', anchor: 'frets',
    win: { m: [0.09, 0.172, 0.4, 0.33], d: [0.42, 0.16, 0.15, 0.6] },
    fit: { m: 2.3, d: 2.8 }, rot: [-3, 0, 0], spin: 0,
  },
  {
    ch: 'body', anchor: 'pickups',
    win: { m: [0.5, 0.16, 0.38, 0.3], d: [0.42, 0.2, 0.17, 0.5] },
    fit: { m: 1.9, d: 2.1 }, rot: [14, -34, 10], spin: 30,
  },
  {
    ch: 'amp', anchor: 'amp',
    win: { m: [0.1, 0.17, 0.5, 0.3], d: [0.4, 0.2, 0.2, 0.48] },
    fit: { m: 0.8, d: 1.0 }, rot: [4, -24, 0], spin: 18,
  },
  {
    ch: 'pedal', anchor: 'pedal',
    win: { m: [0.5, 0.165, 0.36, 0.3], d: [0.42, 0.22, 0.14, 0.46] },
    fit: { m: 1.5, d: 1.8 }, rot: [10, 26, -4], spin: -20,
  },
  {
    ch: 'stage', anchor: 'center',
    win: { m: [0.31, 0.15, 0.38, 0.32], d: [0.4, 0.14, 0.2, 0.66] },
    fit: { m: 0.36, d: 0.72 }, rot: [0, -30, 0], spin: 200, stage: 1,
  },

  // ── exercise cameras (not scrolled to) ──
  {
    ex: 'tuner', ch: 'tuner', anchor: 'headstock',
    win: { m: [0.3, 0.13, 0.4, 0.33], d: [0.42, 0.14, 0.16, 0.56] },
    fit: { m: 2.3, d: 2.6 }, rot: [4, 158, -6], spin: 0,
  },
  // the first frets, close up: the chord's dots sit where the fingers go
  {
    ex: 'cleancheck', ch: 'chords', anchor: 'chordbox',
    win: { m: [0.45, 0.16, 0.49, 0.35], d: [0.34, 0.15, 0.2, 0.6] },
    fit: { m: 2.35, d: 3.6 }, rot: [-16, 0, 0], spin: 0,
  },
  {
    ex: 'drill', ch: 'chords', anchor: 'chordbox',
    win: { m: [0.45, 0.16, 0.49, 0.35], d: [0.34, 0.15, 0.2, 0.6] },
    fit: { m: 2.35, d: 3.6 }, rot: [-16, 0, 0], spin: 0,
  },
  // the strings where the pick hits them: every strum shakes them
  {
    ex: 'rhythm', ch: 'body', anchor: 'strum',
    win: { m: [0.06, 0.18, 0.88, 0.21], d: [0.22, 0.14, 0.56, 0.36] },
    fit: { m: 2.0, d: 2.4 }, rot: [-18, 0, 90], spin: 0,
  },
  // the neck lying flat, headstock left, frets 0–12: a map of where the notes are
  {
    ex: 'findnote', ch: 'body', anchor: 'fretmap',
    win: { m: [0.03, 0.185, 0.94, 0.15], d: [0.22, 0.15, 0.56, 0.24] },
    fit: { m: 1.34, d: 2.6 }, rot: [0, 0, 90], spin: 0,
  },
  {
    ex: 'changes', ch: 'chords', anchor: 'chordbox',
    win: { m: [0.45, 0.16, 0.49, 0.35], d: [0.34, 0.15, 0.2, 0.6] },
    fit: { m: 2.35, d: 3.6 }, rot: [-16, 0, 0], spin: 0,
  },
];

// How many shots belong to the scroll (the rest are exercise cameras).
export const SCROLL_SHOTS = SHOTS.filter((s) => !s.ex).length;
export const exShot = (name) => SHOTS.findIndex((s) => s.ex === name);

// How long each shot holds still (fraction of its scroll length) before moving on.
export const HOLD = 0.46;
// Scroll length of one shot, in screen heights.
export const SHOT_SCREENS = 1.25;
