// Keyboard shortcuts (desktop).

import { S } from '../core/state.js';

export function createKeys({ director, audio, focus, hud, input }) {
  const STRING_KEYS = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5 };
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;   // typing a song name
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k !== 'Tab' && k !== 'Enter') audio.unlock();
    if (k >= '1' && k <= '7') { director.goTo(+k - 1); audio.blip('nav'); return; }
    if (k in STRING_KEYS) {
      if (e.repeat) return;
      const i = STRING_KEYS[k];
      const chord = input.chord;
      const fret = chord ? chord[i] : 0;
      if (fret !== 'x') input.play(i, fret, 0.8, 0.6);
      return;
    }
    switch (k) {
      case 'ArrowDown': case 'j': case ' ': case 'PageDown': e.preventDefault(); director.step(1); break;
      case 'ArrowUp': case 'k': case 'PageUp': e.preventDefault(); director.step(-1); break;
      case 'Home': e.preventDefault(); director.goTo(0); break;
      case 'End': e.preventDefault(); director.goTo(99); break;
      case 'm': audio.setMuted(!S.muted); audio.blip(S.muted ? 'off' : 'on'); hud.paintSound(); break;
      case 'x': if (!e.repeat) focus.setPull(true); break;
      case '?': case '/': hud.toggleHelp(); break;
      case 'Escape': hud.toggleHelp(false); director.exit(); break;
      default:
    }
  });
  window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'x') focus.setPull(false); });
}
