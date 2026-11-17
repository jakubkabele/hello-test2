// Shared building blocks for the chapter screens.

import gsap from 'gsap';
import { S } from '../core/state.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Title card in the corner: chapter number, serif name, small Japanese subtext.
export const tag = (c) => `
  <header class="tag">
    <span class="tag-no">${esc(c.no)}</span>
    <span class="tag-txt"><b class="tag-name">${esc(c.name)}</b><span class="tag-jp">${esc(c.jp)}</span></span>
    <i class="tag-rule"></i>
  </header>`;

// The huge stacked words.
export const title = (lines, tagName = 'h2') => `
  <${tagName} class="title" role="button" tabindex="0" aria-expanded="false" aria-label="${esc(lines.join(' '))}">
    ${lines.map((l) => `<span class="ln" aria-hidden="true"><span>${esc(l)}</span></span>`).join('')}
  </${tagName}>`;

export const warn = (text, jp = '注意') => `
  <div class="warn" data-in><i class="warn-stripes"></i><span class="warn-txt"><b>CAUTION ${jp}</b>${esc(text)}</span></div>`;

// Size a title so its widest line exactly fills the space it is given.
export function fitTitle(el, maxHeightPx = Infinity) {
  if (!el) return;
  const avail = el.clientWidth || el.parentElement.clientWidth;
  if (!avail) return;
  // measure in the title's resting state, whatever the entrance animation is doing right now
  const keep = el.style.letterSpacing;
  el.style.letterSpacing = '-0.012em';
  el.style.fontSize = '100px';
  let widest = 1;
  el.querySelectorAll('.ln > span').forEach((s) => {
    s.style.display = 'inline-block';
    widest = Math.max(widest, s.getBoundingClientRect().width);
    s.style.display = '';
  });
  el.style.letterSpacing = keep;
  const lines = el.querySelectorAll('.ln').length;
  let size = (100 * avail * 0.985) / widest;
  const lh = 0.86;
  if (lines * size * lh > maxHeightPx) size = maxHeightPx / (lines * lh);
  el.style.fontSize = `${Math.floor(size)}px`;
}

// Entrance animation shared by every chapter. Played forwards to enter, backwards to leave —
// the director scrubs it with the scroll.
export function entrance(el, extra) {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  const lines = el.querySelectorAll('.title .ln > span');
  tl.fromTo(el.querySelectorAll('.tag > *'), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.06 }, 0);
  if (S.reduced) {
    tl.fromTo(lines, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0);
  } else {
    tl.fromTo(lines, { yPercent: 108 }, { yPercent: 0, duration: 0.7, stagger: 0.09 }, 0.04);
    tl.fromTo(el.querySelector('.title'), { filter: 'blur(10px)', letterSpacing: '0.04em' }, { filter: 'blur(0px)', letterSpacing: '-0.012em', duration: 0.8, ease: 'power2.out' }, 0);
  }
  tl.fromTo(el.querySelectorAll('[data-in]'), { opacity: 0, y: S.reduced ? 0 : 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 }, 0.3);
  if (extra) extra(tl);
  return tl;
}
