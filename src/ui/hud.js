// The HUD: emblem + name, the sound switch, the index down the right edge,
// and a thin strip along the bottom (where you are, last note, signal scope).

import { S, bus, clamp, pad } from '../core/state.js';
import { CHAPTERS } from '../config/shots.js';
import { esc } from '../chapters/common.js';

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function createHud({ root, content, audio, director }) {
  const names = CHAPTERS.map((id) => content[id]);
  root.innerHTML = `
    <div class="hud-top">
      <button type="button" class="hud-id" id="callsign" aria-label="${esc(content.site.name)}">
        <i class="hud-mark">${esc(content.site.mark)}</i><b>${esc(content.site.name)}</b>
      </button>
      <div class="hud-btns">
        <button type="button" class="hbtn" id="btn-snd" aria-pressed="false" title="Sound on / off (M)">
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M1 4h3l4-3v10L4 8H1z" fill="currentColor"/><path class="w1" d="M10.5 3.5c1.3 1.3 1.3 3.7 0 5" fill="none" stroke="currentColor"/><path class="w2" d="M12.5 1.5c2.4 2.4 2.4 6.6 0 9" fill="none" stroke="currentColor"/><path class="x" d="M10.5 3.5l4.5 5M15 3.5l-4.5 5" fill="none" stroke="currentColor"/></svg>
          <span id="snd-txt">SND</span>
        </button>
      </div>
    </div>

    <nav class="hud-index" aria-label="Sections">
      ${names.map((c, n) => `<button type="button" data-c="${n}" aria-label="${esc(c.name)}"><span>${esc(c.no)}</span><i></i><em>${esc(c.name)}</em></button>`).join('')}
    </nav>

    <div class="hud-bot">
      <div class="ro"><b id="ro-scn">00</b><label id="ro-name"></label></div>
      <div class="ro ro-note"><b id="ro-note"></b></div>
      <div class="ro ro-scope"><canvas id="scope" width="120" height="36"></canvas></div>
    </div>

    <div class="hud-toast" id="toast" role="status"></div>

    <div class="alert" id="alert" hidden>
      <i class="alert-stripes"></i>
      <div class="alert-in"><span class="alert-jp"></span><b class="alert-big"></b><span class="alert-sub"></span></div>
      <i class="alert-stripes"></i>
    </div>

    <div class="help" id="help" hidden>
      <div class="help-in">
        <b>KEYS 操作</b>
        <dl>
          <div><dt>1 – 7</dt><dd>jump to a stop</dd></div>
          <div><dt>↓ ↑ / J K / Space</dt><dd>next / previous</dd></div>
          <div><dt>A S D F G H</dt><dd>pluck strings</dd></div>
          <div><dt>Hold X</dt><dd>pull into focus</dd></div>
          <div><dt>M</dt><dd>sound on / off</dd></div>
          <div><dt>Esc</dt><dd>leave an exercise</dd></div>
        </dl>
      </div>
    </div>`;

  const $ = (id) => root.querySelector(id);
  const el = {
    scn: $('#ro-scn'), name: $('#ro-name'), note: $('#ro-note'),
    snd: $('#btn-snd'), sndTxt: $('#snd-txt'),
    toast: $('#toast'), alert: $('#alert'), help: $('#help'), scope: $('#scope'),
  };
  const idx = [...root.querySelectorAll('.hud-index button')];

  // ── sound switch ──
  function paintSound() {
    const on = audio.ready && !S.muted;
    el.snd.setAttribute('aria-pressed', on);
    el.snd.dataset.s = !audio.ready ? (S.muted ? 'off' : 'idle') : S.muted ? 'off' : 'on';
    el.sndTxt.textContent = !audio.ready ? (S.muted ? 'OFF' : 'TAP') : S.muted ? 'OFF' : 'ON';
  }
  el.snd.addEventListener('click', () => {
    if (!audio.ready) { audio.unlock(); if (S.muted) audio.setMuted(false); }
    else audio.setMuted(!S.muted);
    audio.blip(S.muted ? 'off' : 'on');
    paintSound();
  });
  bus.on('audio:on', paintSound);
  bus.on('mute', paintSound);
  paintSound();

  // ── index ──
  idx.forEach((b) => b.addEventListener('click', () => { audio.unlock(); audio.blip('nav'); director.goTo(+b.dataset.c); }));
  bus.on('chapter', (c) => {
    idx.forEach((b, n) => { b.classList.toggle('is-on', n === c); if (n === c) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    el.scn.textContent = names[c].no;
    el.name.textContent = names[c].name;
    audio.setDepth(c / (CHAPTERS.length - 1));
    if (audio.ready) audio.blip('nav');
  });

  bus.on('pluck', (p) => { el.note.textContent = noteName(p.midi); el.note.classList.remove('hit'); void el.note.offsetWidth; el.note.classList.add('hit'); });
  bus.on('lock', () => { if (S.open >= 1 && S.transit < 0.05) audio.blip('lock'); });
  bus.on('snap', () => audio.blip('lock'));
  bus.on('ui', (k) => audio.blip(k));

  // ── toast + alert ──
  let toastTimer = null;
  function toast(msg, secs = 3) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), secs * 1000);
  }
  let alertTimer = null;
  function alert({ jp, big, sub, secs = 3.4 }) {
    el.alert.querySelector('.alert-jp').textContent = jp;
    el.alert.querySelector('.alert-big').textContent = big;
    el.alert.querySelector('.alert-sub').textContent = sub;
    el.alert.hidden = false;
    el.alert.classList.remove('is-on'); void el.alert.offsetWidth; el.alert.classList.add('is-on');
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { el.alert.classList.remove('is-on'); setTimeout(() => { el.alert.hidden = true; }, 350); }, secs * 1000);
  }
  function toggleHelp(force) {
    const show = force !== undefined ? force : el.help.hidden;
    el.help.hidden = !show;
  }
  el.help.addEventListener('click', () => toggleHelp(false));

  // ── oscilloscope ──
  const sc = el.scope.getContext('2d');
  function update(dt, wave) {
    const w = el.scope.width, h = el.scope.height;
    sc.clearRect(0, 0, w, h);
    sc.strokeStyle = S.overdrive ? '#C9A25A' : '#E9E7F2';
    sc.lineWidth = 1.5;
    sc.beginPath();
    if (wave && S.level > 0.004) {
      const step = Math.floor(wave.length / 60);
      for (let i = 0; i < 60; i++) {
        const v = (wave[i * step] - 128) / 128;
        const y = h / 2 - clamp(v * 2.4, -1, 1) * (h / 2 - 2);
        if (i === 0) sc.moveTo(0, y); else sc.lineTo((i / 59) * w, y);
      }
    } else { sc.moveTo(0, h / 2); sc.lineTo(w, h / 2); }
    sc.stroke();
    void dt; void pad;
  }

  return { update, toast, alert, toggleHelp, paintSound, callsign: $('#callsign') };
}
