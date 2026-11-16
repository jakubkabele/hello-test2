import { tag, title, esc, entrance, fitTitle } from './common.js';
import { bus } from '../core/state.js';

export default {
  id: 'clips',
  html: (c) => `
    ${tag(c)}
    <div class="screen" data-in>
      <video class="screen-video" playsinline preload="none"></video>
      <div class="screen-empty"><b>NO SIGNAL</b><span>${esc(c.empty)}</span></div>
      <button type="button" class="screen-play" aria-label="Play / pause"><i></i></button>
      <span class="screen-label"><b class="screen-code">REC</b><span class="screen-title"></span></span>
      <span class="screen-rec"><i></i>REC</span>
    </div>
    <div class="clips-col">
      ${title(c.title)}
      <p class="cap" data-in>${esc(c.caption)}</p>
    </div>
    <ol class="clip-list" data-in>
      ${c.items.map((it, n) => `
        <li><button type="button" class="clip" data-n="${n}">
          <span class="clip-code">${esc(it.code)}</span>
          <span class="clip-title">${esc(it.title)}</span>
          <span class="clip-date">${esc(it.date)}</span>
          <i class="clip-go">${it.link && !it.src ? '↗' : '▸'}</i>
        </button></li>`).join('')}
    </ol>`,
  mount(el, { content, audio }) {
    const items = content.clips.items;
    const screen = el.querySelector('.screen');
    const video = el.querySelector('.screen-video');
    const btns = [...el.querySelectorAll('.clip')];
    let active = -1;

    const select = (n, play) => {
      const it = items[n];
      if (!it) return;
      if (it.link && !it.src) { if (play) window.open(it.link, '_blank', 'noopener'); }
      active = n;
      btns.forEach((b, k) => b.classList.toggle('is-on', k === n));
      el.querySelector('.screen-code').textContent = it.code;
      el.querySelector('.screen-title').textContent = it.title;
      screen.classList.toggle('has-video', !!it.src);
      if (it.src) {
        if (video.getAttribute('src') !== it.src) video.setAttribute('src', it.src);
        if (play) video.play().catch(() => {});
      } else {
        video.pause(); video.removeAttribute('src');
      }
      bus.emit('ui', 'tick');
    };
    btns.forEach((b, n) => b.addEventListener('click', () => { audio.unlock(); select(n, true); }));
    el.querySelector('.screen-play').addEventListener('click', () => {
      if (!screen.classList.contains('has-video')) return;
      if (video.paused) video.play().catch(() => {}); else video.pause();
    });
    video.addEventListener('play', () => screen.classList.add('is-playing'));
    video.addEventListener('pause', () => screen.classList.remove('is-playing'));
    // stop the tape when you scroll away
    bus.on('chapter', (c) => { if (c !== 3) video.pause(); });
    select(0, false);
    void active;
  },
  fit(el, vh, wide) { fitTitle(el.querySelector('.title'), vh * (wide ? 0.46 : 0.27)); },
  timeline: (el) => entrance(el),
};
