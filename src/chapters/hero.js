import { tag, title, esc, entrance, fitTitle } from './common.js';
import { card } from './stop.js';
import { bus } from '../core/state.js';
import { sessionLine } from '../exercises/session.js';

export default {
  id: 'hero',
  html: (c) => `
    ${tag(c)}
    <div class="hero-col">
      ${title(c.title, 'h1')}
      <p class="cap">${esc(c.caption)}</p>
    </div>
    <p class="hint" data-in>${esc(c.hint)}</p>
    <ul class="cards hero-cards" data-in>${(c.cards || []).map(card).join('')}</ul>
    <div class="cue" data-in><span>SCROLL</span><i></i></div>`,
  mount(el, { director, audio, content }) {
    el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { audio.unlock(); director.enter(b.dataset.open); }));
    // the session card says how far today's session is
    const line = el.querySelector('[data-open="session"] .card-txt span');
    const paint = () => {
      if (!line) return;
      const s = sessionLine();
      line.textContent = s === 'done' ? content.hero.sessionDone : s ? `${content.hero.sessionGoing} · ${s}` : content.hero.cards[0].line;
    };
    paint();
    bus.on('ex:closed', paint);
  },
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.6 : 0.3)); },
  timeline: (el) => entrance(el),
};
