// The scroll: the hero, then one stop per part of the rig. Words live in content.js,
// camera positions in config/shots.js.
import hero from './hero.js';
import { makeStop } from './stop.js';

export const chapters = [
  hero,
  makeStop('tuner', { side: true, cap: 0.27 }),
  makeStop('chords', { cap: 0.17 }),
  makeStop('body', { side: true, cap: 0.27 }),
  makeStop('amp', { cap: 0.2 }),
  makeStop('pedal', { side: true, cap: 0.27 }),
  makeStop('stage', { cap: 0.2 }),
];
