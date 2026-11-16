// Hidden things. (If you're reading this: yes, there are three.)
//
//  1. FORBIDDEN RIFF — play frets 0 3 5 · 0 3 6 5 on the neck (the riff every guitar shop bans).
//  2. OVERDRIVE — tap the callsign five times, or type the old cheat code
//     (↑ ↑ ↓ ↓ ← → ← → B A). Everything gets louder and dirtier. Do it again to turn it off.
//  3. STARE — hold the picture in focus for six seconds.

import { S, bus } from '../core/state.js';

export function createEggs({ hud, audio }) {
  // 1 ─ the riff
  const RIFF = [0, 3, 5, 0, 3, 6, 5];
  let played = [];
  let lastAt = 0;
  bus.on('pluck', (p) => {
    const now = performance.now();
    if (now - lastAt > 2600) played = [];
    lastAt = now;
    played.push(p.fret);
    if (played.length > RIFF.length) played.shift();
    if (played.length === RIFF.length && played.every((f, i) => f === RIFF[i])) {
      played = [];
      audio.blip('warn');
      bus.emit('flash', 1);
      hud.alert({ jp: '警告 — 禁止リフ検出', big: 'FORBIDDEN RIFF', sub: 'Detected. Please step away from the guitar shop.' });
    }
  });

  // 2 ─ overdrive
  function overdrive() {
    const on = !S.overdrive;
    audio.setOverdrive(on);
    document.documentElement.classList.toggle('overdrive', on);
    bus.emit('flash', on ? 1.2 : 0.4);
    audio.blip(on ? 'warn' : 'off');
    if (on) hud.alert({ jp: '過負荷 — 制限解除', big: 'OVERDRIVE', sub: 'Limiter released. Gain at eleven.' });
    else hud.toast('OVERDRIVE OFF — LIMITER RESTORED');
  }
  let taps = [];
  hud.callsign.addEventListener('click', () => {
    audio.unlock();
    const now = performance.now();
    taps = taps.filter((t) => now - t < 1800);
    taps.push(now);
    if (taps.length >= 5) { taps = []; overdrive(); } else audio.blip('tick');
  });
  const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let pos = 0;
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = k === CODE[pos] ? pos + 1 : k === CODE[0] ? 1 : 0;
    if (pos === CODE.length) { pos = 0; overdrive(); }
  }, true);

  // 3 ─ stare
  bus.on('egg:stare', () => {
    hud.toast('FOCUS HELD 6.0 S — LONGER THAN I CAN HOLD A BARRE CHORD', 5);
    audio.blip('lock');
  });
}
