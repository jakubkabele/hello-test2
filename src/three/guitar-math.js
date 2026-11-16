// Guitar measurements and string/fret maths. No 3D library needed here, so the
// touch handling can use it before the heavy 3D code has loaded.
// 1 unit ≈ 10 cm. Neck points up (+Y), front faces +Z.

export const G = {
  NUT_Y: 4.88,
  BRIDGE_Y: -1.6,
  SCALE: 6.48,          // nut → bridge
  TOP_Y: 6.85,
  BOTTOM_Y: -3.45,
  STRING_Z: 0.34,
  FRETS: 22,
};
G.LENGTH = G.TOP_Y - G.BOTTOM_Y;
G.CENTER_Y = (G.TOP_Y + G.BOTTOM_Y) / 2;

// Fret n sits where the string is shortened by a factor of 2^(n/12) — one semitone per fret.
export const fretY = (n) => G.NUT_Y - G.SCALE * (1 - Math.pow(2, -n / 12));
export const NUT_X = (i) => -0.175 + i * 0.07;
export const SADDLE_X = (i) => -0.26 + i * 0.104;
// Strings fan out slightly from nut to bridge.
export const stringX = (i, y) => {
  const t = (G.NUT_Y - y) / (G.NUT_Y - G.BRIDGE_Y);
  return NUT_X(i) + (SADDLE_X(i) - NUT_X(i)) * t;
};
// Open strings, thick E → thin e (MIDI note numbers)
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
