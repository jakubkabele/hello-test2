import { tag, title, esc, entrance, fitTitle } from './common.js';
import { bus } from '../core/state.js';

export default {
  id: 'gear',
  html: (c) => `
    ${tag(c)}
    <div class="gear-col">
      ${title(c.title)}
      <p class="cap" data-in>${esc(c.caption)}</p>
    </div>
    <div class="gear-card" data-in>
      <div class="gear-tabs" role="tablist">
        ${c.items.map((it, n) => `<button type="button" class="gear-tab" role="tab" data-n="${n}">${esc(it.code.replace(/^.*-/, ''))}</button>`).join('')}
      </div>
      <div class="gear-body">
        <span class="gear-code"></span>
        <h3 class="gear-name"></h3>
        <ul class="gear-spec"></ul>
      </div>
    </div>`,
  mount(el, { content, focus }) {
    const items = content.gear.items;
    const tabs = [...el.querySelectorAll('.gear-tab')];
    const code = el.querySelector('.gear-code');
    const name = el.querySelector('.gear-name');
    const spec = el.querySelector('.gear-spec');
    let active = -1, manual = null, lastStep = -1, here = false;
    const set = (n, byTap) => {
      if (n === active) return;
      active = n;
      const it = items[n];
      tabs.forEach((t, k) => { t.classList.toggle('is-on', k === n); t.setAttribute('aria-selected', k === n); });
      code.textContent = `${it.code} / ${String(n + 1).padStart(2, '0')} OF ${String(items.length).padStart(2, '0')}`;
      name.textContent = it.name;
      spec.innerHTML = it.spec.map((s) => `<li>${esc(s)}</li>`).join('');
      el.querySelector('.gear-body').classList.remove('swap');
      void el.offsetWidth;
      el.querySelector('.gear-body').classList.add('swap');
      // tapping an item sends the focus window to that part of the guitar
      if (byTap && here && it.part && focus) focus.snapTo(it.part);
      bus.emit('ui', 'tick');
    };
    tabs.forEach((t, n) => t.addEventListener('click', () => { manual = n; set(n, true); }));
    bus.on('progress:gear', (u) => {
      const step = Math.min(items.length - 1, Math.floor(u * items.length));
      if (step !== lastStep) { lastStep = step; manual = null; }
      if (manual === null) set(step, false);
    });
    bus.on('chapter', (c) => { here = c === 4; });
    set(0, false);
  },
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.42 : 0.2)); },
  timeline: (el) => entrance(el),
};
