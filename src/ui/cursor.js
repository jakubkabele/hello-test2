// Custom cursor (desktop only): a small cross-hair with a ring that trails behind it.

import { S, damp } from '../core/state.js';

export function createCursor(el) {
  if (!S.hover) { el.remove(); return { update() {} }; }
  document.documentElement.classList.add('has-cursor');
  const ring = el.querySelector('i');
  const dot = el.querySelector('b');
  let x = -100, y = -100, rx = -100, ry = -100, seen = false, mode = '';
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!seen) { seen = true; rx = x; ry = y; el.classList.add('is-on'); }
    const t = e.target;
    const m = t.closest && t.closest('a, button') ? 'link' : S.over === 'string' ? 'string' : t.id === 'stage' || t.id === 'fw' ? 'stage' : '';
    if (m !== mode) { mode = m; el.dataset.mode = m; }
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') el.classList.add('is-down'); });
  window.addEventListener('pointerup', () => el.classList.remove('is-down'));
  document.documentElement.addEventListener('mouseleave', () => el.classList.remove('is-on'));
  document.documentElement.addEventListener('mouseenter', () => seen && el.classList.add('is-on'));
  return {
    update(dt) {
      if (!seen) return;
      rx = S.reduced ? x : damp(rx, x, 14, dt); ry = S.reduced ? y : damp(ry, y, 14, dt);
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    },
  };
}
