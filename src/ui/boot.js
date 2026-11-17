// Start-up sequence: a quick system check, then the screen dissolves into the site.
// Lasts about 2.6 s. Tap, click or press any key to skip.

import { S } from '../core/state.js';
import { esc } from '../chapters/common.js';

export function runBoot({ el, lines, onGesture }) {
  return new Promise((resolve) => {
    const list = el.querySelector('.boot-lines');
    const bar = el.querySelector('.boot-bar i');
    list.innerHTML = lines.map(([k, v]) => `<li><span class="k">${esc(k)}</span><i></i><span class="v">${esc(v)}</span></li>`).join('');
    const rows = [...list.children];
    const cores = [...el.querySelectorAll('.core')];
    const timers = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      el.classList.add('is-out');
      setTimeout(() => { el.remove(); }, 650);
      resolve();
    };
    function skip(ev) {
      if (ev.type === 'keydown' && (ev.metaKey || ev.ctrlKey || ev.altKey)) return;
      onGesture && onGesture();
      finish();
    }
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);

    el.classList.add('is-run');
    if (S.reduced) {
      rows.forEach((r) => r.classList.add('is-on'));
      cores.forEach((c) => c.classList.add('is-ok'));
      bar.style.transform = 'scaleX(1)';
      el.classList.add('is-go');
      timers.push(setTimeout(finish, 900));
      return;
    }
    const gap = 300;
    rows.forEach((r, n) => timers.push(setTimeout(() => {
      r.classList.add('is-on');
      bar.style.transform = `scaleX(${(n + 1) / rows.length})`;
    }, 140 + n * gap)));
    const end = 140 + rows.length * gap;
    // the three cores "deliberate", then approve one after another
    cores.forEach((c, n) => timers.push(setTimeout(() => c.classList.add('is-ok'), 520 + n * 330)));
    timers.push(setTimeout(() => el.classList.add('is-go'), end + 80));
    timers.push(setTimeout(finish, Math.min(end + 700, 2700)));
  });
}
