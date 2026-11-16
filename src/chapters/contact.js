import { tag, title, esc, entrance, fitTitle } from './common.js';

export default {
  id: 'contact',
  html: (c, site) => `
    ${tag(c)}
    <div class="contact-col">
      ${title(c.title)}
      <p class="cap" data-in>${esc(c.caption)}</p>
    </div>
    <ul class="links" data-in>
      ${c.links.map((l, n) => `
        <li><a class="link" href="${esc(l.href)}" ${/^https?:/.test(l.href) ? 'target="_blank" rel="noopener"' : ''}>
          <span class="link-no">CH-${String(n + 1).padStart(2, '0')}</span>
          <span class="link-label">${esc(l.label)}</span>
          <span class="link-value">${esc(l.value)}</span>
          <i>↗</i>
        </a></li>`).join('')}
    </ul>
    <a class="practice" href="${esc(site.practiceUrl)}" data-in>
      <i class="practice-stripes"></i>
      <span class="practice-txt"><b>${esc(c.practice)}</b><span>${esc(c.practiceNote)}</span></span>
      <span class="practice-go">▸</span>
    </a>
    <p class="sign" data-in><span>${esc(c.sign)}</span><b>${esc(c.signJp)}</b></p>`,
  mount() {},
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.36 : 0.17)); },
  timeline: (el) => entrance(el),
};
