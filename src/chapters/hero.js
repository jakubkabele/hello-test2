import { tag, title, warn, esc, entrance, fitTitle } from './common.js';

export default {
  id: 'hero',
  html: (c) => `
    ${tag(c)}
    <div class="hero-col">
      ${title(c.title, 'h1')}
      <p class="cap" data-in>${esc(c.caption)}</p>
    </div>
    <dl class="meta" data-in>
      ${c.meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
    ${warn(c.warning)}
    <p class="hint" data-in>${esc(c.hint)}</p>
    <div class="cue" data-in><span>SCROLL</span><i></i><span class="cue-jp">下へ</span></div>`,
  mount() {},
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.6 : 0.34)); },
  timeline: (el) => entrance(el),
};
