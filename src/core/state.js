// Shared live state. Every module reads/writes this one object.

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);

export const S = {
  reduced: mq('(prefers-reduced-motion: reduce)'),
  coarse: mq('(pointer: coarse)'),
  hover: mq('(hover: hover) and (pointer: fine)'),

  // viewport (CSS px). vh = stable "small" height, ch = canvas height (largest height)
  vw: 1, vh: 1, ch: 1, layout: 'm',

  // scroll story
  P: 0,                 // smoothed position in shots (0 … shots-1)
  i: 0, j: 0, e: 0,     // blending shot i → j by e
  hold: 0,              // 0–1 progress through the current shot's hold
  transit: 0,           // 0–1 peak in the middle of a chapter change
  chapter: 0,
  exercise: null,       // name of the open exercise (or null)
  exK: 0,               // 0 = scroll menu … 1 = fully inside the exercise

  // focus window (CSS px) + how sharp it is, and the global "pull into focus"
  win: { x: 0, y: 0, w: 0, h: 0, focus: 1, mode: 'SEEK', target: 'pickups' },
  pull: 0,
  open: 0,              // 0–1 window opening after boot
  intro: 0,             // 0 until the start-up screen is gone
  over: null,           // what the mouse is over ('string' | null)

  // guitar
  yaw: 0, pitch: 0,     // user rotation (degrees)
  tiltX: 0, tiltY: 0,   // gyro / pointer parallax (-1 … 1)

  // sound
  level: 0,             // current loudness 0–1
  muted: false,
  overdrive: false,
  live: false,

  time: 0,
  fps: 60,
  tier: 'mid',
  hasGL: false,
};

// Tiny event bus
const listeners = new Map();
export const bus = {
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  },
  emit(type, data) {
    const set = listeners.get(type);
    if (set) set.forEach((fn) => fn(data));
  },
};

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
// frame-rate independent easing toward a target
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const pad = (n, len = 2) => String(Math.abs(Math.round(n))).padStart(len, '0');
