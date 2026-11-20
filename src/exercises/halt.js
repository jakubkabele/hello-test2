// The red full-screen ALERT — the pause screen every listening exercise shares.
//
// When an exercise hears nothing for 20 s it calls halt.show(...). The whole screen washes red,
// hazard stripes run top and bottom, a huge PAUSED sits in the middle. The microphone keeps
// listening: playing again closes it (each exercise decides that), or tap a button.
// Only the exercise that opened it can close it (`owner`), so two exercises never fight.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';

let el = null, owner = null, words = {};

function build() {
  el = document.createElement('div');
  el.className = 'halt';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'halt-big');
  el.innerHTML = `
    <i class="halt-stripes"></i>
    <div class="halt-top"><span class="halt-code"></span><span class="halt-clock"></span></div>
    <div class="halt-in">
      <span class="halt-jp"></span>
      <b class="halt-big" id="halt-big"></b>
      <p class="halt-text"></p>
      <p class="halt-mic"><i></i><span></span></p>
      <div class="halt-btns"></div>
    </div>
    <i class="halt-stripes"></i>`;
  document.body.appendChild(el);
  // leaving the exercise always clears it
  bus.on('ex:leave', () => hide());
}

// opts: { title, text, after (s of silence so far, default 20), mic (false = hide the 'still listening' line),
//         buttons: [{ label, primary, onClick }] }
export function show(who, opts) {
  if (!el) build();
  owner = who;
  const $ = (q) => el.querySelector(q);
  $('.halt-code').textContent = `${opts.code || words.code || 'SYS-HALT'} · ${opts.jp || words.jp || '休止'}`;
  $('.halt-jp').textContent = words.jpLong || '一時停止';
  $('.halt-big').textContent = opts.title || words.paused || 'Paused';
  $('.halt-text').textContent = opts.text || '';
  $('.halt-mic span').textContent = opts.mic === false ? '' : (words.mic || 'Still listening — play to carry on');
  $('.halt-mic').hidden = opts.mic === false;
  const box = $('.halt-btns');
  box.innerHTML = '';
  (opts.buttons || []).forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.primary ? 'is-primary' : '';
    btn.innerHTML = esc(b.label);
    btn.addEventListener('click', () => b.onClick && b.onClick());
    box.appendChild(btn);
  });
  started = performance.now() - (opts.after ?? 20) * 1000;   // counts from the last sound heard
  clearInterval(clock); clock = setInterval(tick, 500); tick();
  document.documentElement.classList.add('is-halted');
  el.classList.add('is-on');
  const first = box.querySelector('.is-primary') || box.querySelector('button');
  if (first) setTimeout(() => { if (owner === who) first.focus({ preventScroll: true }); }, 80);
}

// how long it has been paused, shown top right like a mission clock
let started = 0, clock = 0;
function tick() {
  const s = Math.max(0, Math.floor((performance.now() - started) / 1000));
  el.querySelector('.halt-clock').textContent = `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function hide(who) {
  if (!el || (who && who !== owner)) return;
  owner = null;
  el.classList.remove('is-on');
  document.documentElement.classList.remove('is-halted');
  clearInterval(clock);
}

export const isShown = (who) => !!el && owner === who && el.classList.contains('is-on');
export function setWords(w) { words = w || {}; }
