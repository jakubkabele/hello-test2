// A "stop" on the scroll: one part of the rig, a big title, and the things you can open there.
// All six stops after the hero are made by this one file; their words come from content.js.

import { tag, title, esc, entrance, fitTitle } from './common.js';
import { bus } from '../core/state.js';

const card = (k) => {
  const inner = `
    <span class="card-code">${esc(k.code)}</span>
    <span class="card-txt"><b>${esc(k.name)}</b><span>${esc(k.line)}</span></span>
    <i class="card-go">${k.soon ? 'SOON' : '▸'}</i>`;
  if (k.soon) return `<li><div class="card is-soon">${inner}</div></li>`;
  if (k.open) return `<li><button type="button" class="card" data-open="${esc(k.open)}">${inner}</button></li>`;
  return `<li><a class="card" href="${esc(k.href)}">${inner}</a></li>`;
};

// side = title beside the window (window on the right) · below = title under the window
export const makeStop = (id, { side = false, cap = 0.2 } = {}) => ({
  id,
  html: (c) => `
    ${tag(c)}
    <div class="stop-col">
      ${title(c.title)}
      ${c.caption ? `<p class="cap" data-in>${esc(c.caption)}</p>` : ''}
    </div>
    <ul class="cards" data-in>${c.cards.map(card).join('')}</ul>
    ${id === 'pedal' ? '<div class="log-local" data-in hidden></div>' : ''}`,
  className: side ? 'stop stop--side' : 'stop stop--below',
  mount(el, { director, audio }) {
    el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      audio.unlock();
      director.enter(b.dataset.open);
    }));
    if (id === 'chords') {
      // show a chord on the neck while this stop is on screen (strumming plays it)
      let on = false;
      bus.on('chapter', (c) => {
        const here = c === 2;
        if (here !== on) { on = here; bus.emit('chord', here ? [0, 2, 2, 0, 0, 0] : null); }
      });
    }
    if (id === 'pedal') {
      // a live line read from the practice log on this device
      try {
        const list = JSON.parse(localStorage.getItem('practice.log.v1') || '[]');
        if (Array.isArray(list) && list.length) {
          const mins = Math.round(list.reduce((s, e) => s + (e.activeSec || 0), 0) / 60);
          const last = String(list.map((e) => e.date).sort().pop()).slice(5);
          const box = el.querySelector('.log-local');
          box.hidden = false;
          box.innerHTML = `<b>ON THIS DEVICE</b> ${list.length} SESSIONS · ${mins} MIN · LAST ${esc(last)}`;
        }
      } catch { /* no log yet */ }
    }
  },
  fit(el, vh, wide) { // on short phones the titles under a window shrink so they never reach the cards
    fitTitle(el.querySelector('.title'), vh * (wide ? 0.44 : cap * (!side && vh < 760 ? 0.66 : 1))); },
  timeline: (el) => entrance(el),
});
