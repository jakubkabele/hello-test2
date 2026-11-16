import { tag, title, esc, entrance, fitTitle } from './common.js';
import { bus } from '../core/state.js';

// Reads the practice app's own log on this device (if there is one) for a live readout.
function localLog() {
  try {
    const list = JSON.parse(localStorage.getItem('practice.log.v1') || '[]');
    if (!Array.isArray(list) || !list.length) return null;
    const secs = list.reduce((s, e) => s + (e.activeSec || 0), 0);
    const days = new Set(list.map((e) => e.date)).size;
    const last = list.map((e) => e.date).sort().pop();
    return { n: list.length, days, mins: Math.round(secs / 60), last };
  } catch { return null; }
}

export default {
  id: 'log',
  html: (c) => `
    ${tag(c)}
    <div class="log-col">
      ${title(c.title)}
      <p class="cap" data-in>${esc(c.caption)}</p>
    </div>
    <ol class="log-list" data-in>
      ${c.entries.map((e, n) => `
        <li class="log-item" data-n="${n}">
          <button type="button" class="log-row" aria-expanded="false">
            <span class="log-code">${esc(e.code)}</span>
            <span class="log-title">${esc(e.title)}</span>
            <span class="log-date">${esc(e.date)}</span>
          </button>
          <div class="log-body"><p>${esc(e.note)}</p></div>
        </li>`).join('')}
    </ol>
    <div class="log-local" data-in hidden></div>`,
  mount(el, { content }) {
    const items = [...el.querySelectorAll('.log-item')];
    let active = -1;
    let manual = null;
    const set = (n) => {
      if (n === active) return;
      active = n;
      items.forEach((it, k) => {
        it.classList.toggle('is-on', k === n);
        it.querySelector('.log-row').setAttribute('aria-expanded', k === n);
      });
      bus.emit('ui', 'tick');
    };
    items.forEach((it, n) => it.querySelector('.log-row').addEventListener('click', () => { manual = n; set(n); }));
    // scrolling through the chapter steps through the entries
    let lastStep = -1;
    bus.on('progress:log', (u) => {
      const step = Math.min(items.length - 1, Math.floor(u * items.length));
      if (step !== lastStep) { lastStep = step; manual = null; }
      if (manual === null) set(step);
    });
    set(0);

    const local = localLog();
    if (local) {
      const box = el.querySelector('.log-local');
      box.hidden = false;
      box.innerHTML = `<b>LOCAL DATA 実測</b> ${local.n} SESSIONS · ${local.mins} MIN · LAST ${esc(String(local.last).slice(5))}`;
    }
    void content;
  },
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.5 : 0.3)); },
  timeline: (el) => entrance(el),
};
