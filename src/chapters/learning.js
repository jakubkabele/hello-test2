import { tag, title, warn, esc, entrance, fitTitle } from './common.js';
import { bus } from '../core/state.js';

const STATUS = { solid: ['SOLID', '安定'], shaky: ['SHAKY', '不安定'], next: ['NEXT', '次の課題'] };
const OPEN = [40, 45, 50, 55, 59, 64];

export default {
  id: 'learning',
  html: (c) => `
    ${tag(c)}
    <div class="chord-panel" data-in>
      <div class="chord-grid" role="group" aria-label="Chords">
        ${c.chords.map((ch, n) => `<button type="button" class="chord chord--${ch.status}" data-n="${n}" aria-pressed="false"><b>${esc(ch.name)}</b><i></i></button>`).join('')}
      </div>
      <div class="chord-read">
        <span class="chord-big">—</span>
        <span class="chord-meta"><b class="chord-status">—</b><span class="chord-frets">· · · · · ·</span></span>
      </div>
    </div>
    <div class="learn-col">
      ${title(c.title)}
      <p class="cap" data-in>${esc(c.caption)}</p>
    </div>
    <div class="skills" data-in>
      ${c.skills.map((s) => `<div class="skill"><span>${esc(s.name)}</span><b>${String(s.value).padStart(3, '0')}</b><i style="--v:${s.value / 100}"></i></div>`).join('')}
    </div>
    <ul class="songs" data-in>
      <li class="songs-h">QUEUE 課題曲</li>
      ${c.songs.map((s, n) => `<li><b>${String(n + 1).padStart(2, '0')}</b>${esc(s)}</li>`).join('')}
    </ul>
    ${warn(c.warning, '警告')}`,
  mount(el, { content, audio }) {
    const chords = content.learning.chords;
    const btns = [...el.querySelectorAll('.chord')];
    const big = el.querySelector('.chord-big');
    const status = el.querySelector('.chord-status');
    const frets = el.querySelector('.chord-frets');
    let active = -1;
    let live = false;

    const show = (n, strum) => {
      active = n;
      const ch = chords[n];
      btns.forEach((b, k) => { b.classList.toggle('is-on', k === n); b.setAttribute('aria-pressed', k === n); });
      el.classList.toggle('has-chord', !!ch);
      if (!ch) {
        big.textContent = '—'; status.textContent = '—'; frets.textContent = '· · · · · ·';
        bus.emit('chord', null);
        return;
      }
      big.textContent = ch.name;
      status.textContent = `${STATUS[ch.status][0]} ${STATUS[ch.status][1]}`;
      status.dataset.s = ch.status;
      frets.textContent = ch.frets.map((f) => String(f).toUpperCase()).join(' ');
      bus.emit('chord', ch.frets);
      if (strum) {
        // a slow down-strum: thick string first, each a moment after the last
        let k = 0;
        ch.frets.forEach((f, i) => {
          if (f === 'x') return;
          audio.pluck(OPEN[i] + f, { vel: 0.7, bright: 0.55, pan: (i - 2.5) / 2.5, delay: k * 0.045 });
          setTimeout(() => bus.emit('visual-pluck', { string: i, fret: f }), k * 45);
          k++;
        });
      }
    };
    btns.forEach((b, n) => b.addEventListener('click', () => { audio.unlock(); show(n === active ? -1 : n, n !== active); }));

    // the chord dots only exist while this chapter is on screen
    bus.on('chapter', (c) => {
      const here = c === 2;
      if (here && !live) { live = true; if (active < 0) show(0, false); else bus.emit('chord', chords[active].frets); }
      if (!here && live) { live = false; bus.emit('chord', null); }
    });
  },
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.34 : 0.18)); },
  timeline: (el) => entrance(el, (tl) => {
    tl.fromTo(el.querySelectorAll('.skill i'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.06, ease: 'power2.out' }, 0.4);
  }),
};
