import { tag, title, esc, entrance, fitTitle } from './common.js';

export default {
  id: 'hero',
  html: (c) => `
    ${tag(c)}
    <div class="hero-col">
      ${title(c.title, 'h1')}
      <p class="cap">${esc(c.caption)}</p>
    </div>
    <p class="hint" data-in>${esc(c.hint)}</p>
    <div class="cue" data-in><span>SCROLL</span><i></i></div>`,
  mount() {},
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.6 : 0.34)); },
  timeline: (el) => entrance(el),
};
