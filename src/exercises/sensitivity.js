// SYS-01 SENSITIVITY — on the amp's control panel.
//
// One setting for everything that listens: 1 = forgiving … 5 = exact. The five knobs on the
// 3D amp are the five levels: every knob up to your level is turned up, the rest are down.
// Saved where the old Settings screen keeps it (practice.settings.v1 → sensitivity), so both
// places and every exercise read the same number at once.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { level } from './ear.js';

const KEY = 'practice.settings.v1';

function save(n) {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    d.sensitivity = n;
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* storage blocked */ }
}

export function createSensitivity({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-sn';
  el.dataset.ex = 'sensitivity';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read sn-read">
      <span class="sn-scale"><span>${esc(words.low)}</span><i></i><span>${esc(words.high)}</span></span>
      <b class="sn-name"></b>
      <span class="sn-tag"></span>
    </div>
    <div class="ex-panel">
      <div class="sn-knobs" role="radiogroup" aria-label="${esc(words.name)}">
        ${words.levels.map((l, i) => `
          <button type="button" role="radio" data-l="${i + 1}" aria-label="${i + 1} · ${esc(l.name)}">
            <i class="sn-dial"><i></i></i><b>${i + 1}</b>
          </button>`).join('')}
      </div>
      <p class="sn-text"></p>
      <p class="sn-fit"></p>
    </div>
    <button type="button" class="ex-go">${esc(words.done)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const knobs = [...el.querySelectorAll('.sn-knobs button')];

  function render(n) {
    const l = words.levels[n - 1];
    $('.sn-name').textContent = l.name;
    $('.sn-tag').textContent = n === 3 ? words.recommended : '';
    $('.sn-text').textContent = l.text;
    const fit = $('.sn-fit');
    fit.textContent = l.fit;
    fit.classList.toggle('is-warn', n === 5);
    knobs.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i + 1 === n));
      b.classList.toggle('is-on', i + 1 === n);
      b.classList.toggle('is-up', i + 1 <= n);
    });
    el.style.setProperty('--lvl', n);
    const st = getStage(); if (st) st.guitar.setAmpLevel(n);
  }

  knobs.forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.l;
    if (n === level()) return;
    save(n);
    audio.unlock(); audio.blip('tick');
    bus.emit('flash', 0.2);
    render(n);
    bus.emit('sensitivity', n);
  }));
  $('.ex-go').addEventListener('click', () => director.exit());
  $('.ex-exit').addEventListener('click', () => director.exit());

  bus.on('ex:enter', (n) => { if (n === 'sensitivity') { render(level()); el.classList.add('is-open'); } });
  bus.on('ex:leave', (n) => { if (n === 'sensitivity') el.classList.remove('is-open'); });
  // the old screen (another tab) may change it too
  window.addEventListener('storage', (e) => { if (e.key === KEY) { const st = getStage(); if (st) st.guitar.setAmpLevel(level()); } });
  return { el };
}
