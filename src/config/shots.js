// The scroll storyboard. One "shot" = one resting position you scroll to.
// A chapter (hero, log, …) can have more than one shot.
//
//  win    focus-window home, as fractions of the screen: [left, top, width, height]
//         m = phone portrait, d = desktop / landscape. aspect = force a width:height ratio.
//  anchor the guitar part pinned to the centre of the window
//  fit    guitar length as a fraction of the screen height (bigger = closer)
//  rot    guitar rotation in degrees [x, y, z]
//  spin   extra turn (degrees) added while you scroll through the shot
//  explode 0 = assembled, 1 = parts pulled apart
//  dim    darken the scene (0–1)
//  at     pin the anchored part to this screen point instead of the window centre
//  fixed  the window can't be dragged here
//  wide   the window fills the screen (labels move inside it)

export const CHAPTERS = ['hero', 'log', 'learning', 'clips', 'gear', 'contact'];

export const SHOTS = [
  {
    ch: 'hero', anchor: 'pickups',
    win: { m: [0.07, 0.3, 0.37, 0.36], d: [0.3, 0.2, 0.15, 0.56] },
    fit: { m: 1.12, d: 1.3 }, rot: [-8, 24, -20], spin: 34,
  },
  {
    ch: 'log', anchor: 'headstock',
    win: { m: [0.53, 0.135, 0.36, 0.3], d: [0.42, 0.17, 0.15, 0.52] },
    fit: { m: 2.2, d: 2.5 }, rot: [6, -30, 14], spin: 36,
  },
  {
    ch: 'log', anchor: 'headstock',
    win: { m: [0.53, 0.135, 0.36, 0.3], d: [0.42, 0.17, 0.15, 0.52] },
    fit: { m: 2.5, d: 2.8 }, rot: [10, 152, -12], spin: 30,
  },
  {
    ch: 'learning', anchor: 'frets',
    win: { m: [0.09, 0.172, 0.42, 0.43], d: [0.33, 0.16, 0.16, 0.6] },
    fit: { m: 2.5, d: 2.8 }, rot: [-3, 0, 0], spin: 0,
  },
  {
    ch: 'clips', anchor: 'body',
    win: { m: [0.06, 0.168, 0.82, 0], d: [0.3, 0.17, 0.4, 0], aspect: 16 / 9 },
    fit: { m: 0.6, d: 0.9 }, rot: [12, 28, -78], spin: 40, dim: 0.5, fixed: true,
  },
  {
    ch: 'gear', anchor: 'pickups',
    win: { m: [0.08, 0.172, 0.44, 0.24], d: [0.3, 0.2, 0.2, 0.4] },
    fit: { m: 1.3, d: 1.5 }, rot: [16, -40, 8], spin: 24, explode: 1,
  },
  {
    ch: 'gear', anchor: 'bridge',
    win: { m: [0.38, 0.19, 0.46, 0.22], d: [0.44, 0.24, 0.2, 0.36] },
    fit: { m: 1.6, d: 1.9 }, rot: [22, 36, -6], spin: 20, explode: 1,
  },
  {
    ch: 'contact', anchor: 'center',
    win: { m: [0.045, 0.158, 0.83, 0.73], d: [0.04, 0.12, 0.9, 0.77] },
    at: { m: [0.6, 0.29], d: [0.52, 0.5] },
    fit: { m: 0.5, d: 0.86 }, rot: [0, -20, -62], spin: 180, fixed: true, wide: true,
  },
];

// How long each shot holds still (fraction of its scroll length) before moving on.
export const HOLD = 0.46;
// Scroll length of one shot, in screen heights.
export const SHOT_SCREENS = 1.25;
