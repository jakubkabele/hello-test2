// The HUD: callsign, sound + LIVE LINK switches, the section index down the right edge,
// and the strip of readouts along the bottom that change as you scroll and play.

import { S, bus, clamp, lerp, pad } from '../core/state.js';
import { SHOTS, CHAPTERS } from '../config/shots.js';
import { esc } from '../chapters/common.js';

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function createHud({ root, content, audio, director, liveLink }) {
  const names = CHAPTERS.map((id) => content[id]);
  root.innerHTML = `
    <div class="hud-top">
      <button type="button" class="hud-id" id="callsign" aria-label="${esc(content.site.callsign)}">
        <b>${esc(content.site.callsign)}</b>
        <span>${esc(content.site.unit)}<em>${esc(content.site.unitJp)}</em></span>
      </button>
      <div class="hud-btns">
        <button type="button" class="hbtn" id="btn-live" aria-pressed="false" title="Listen to a real guitar (L)"><i class="dot"></i><span>LINK</span></button>
        <button type="button" class="hbtn" id="btn-snd" aria-pressed="false" title="Sound on / off (M)">
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M1 4h3l4-3v10L4 8H1z" fill="currentColor"/><path class="w1" d="M10.5 3.5c1.3 1.3 1.3 3.700 0 5" fill="none" stroke="currentColor"/><path class="w2" d="M12.5 1.5c2.400 2.400 2.400 6.600 0 9" fill="none" stroke="currentColor"/><path class="x" d="M10.500 3.500l4.500 5M15 3.500l-4.500 5" fill="none" stroke="currentColor"/></svg>
          <span id="snd-txt">SND</span>
        </button>
      </div>
    </div>

    <nav class="hud-index" aria-label="Sections">
      ${names.map((c, n) => `<button type="button" data-c="${n}" aria-label="${esc(c.name)}"><span>${esc(c.no)}</span><i></i><em>${esc(c.name)}</em></button>`).join('')}
      <a href="${esc(content.site.practiceUrl)}" aria-label="Practice app"><span>PR</span><i></i><em>Practice mode</em></a>
    </nav>

    <div class="hud-live" id="live" hidden>
      <span class="live-h">LIVE LINK <em>同期</em></span>
      <b class="live-note">—</b>
      <span class="live-hz">LISTENING…</span>
      <div class="live-bar"><i></i></div>
    </div>

    <div class="hud-bot">
      <div class="ro"><label>SCN</label><b id="ro-scn">01/06</b></div>
      <div class="ro"><label>PRG</label><b id="ro-prg">000%</b></div>
      <div class="ro ro-wide"><label>ROT</label><b id="ro-rot">Y+000 X+00</b></div>
      <div class="ro"><label>NOTE</label><b id="ro-note">——</b></div>
      <div class="ro ro-scope"><label>SIG</label><canvas id="scope" width="120" height="36"></canvas></div>
      <div class="ro ro-desk"><label>GPU</label><b id="ro-gpu">--</b></div>
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
          <div><dt>1 – 6</dt><dd>jump to section</dd></div>
          <div><dt>↓ ↑ / J K / Space</dt><dd>next / previous</dd></div>
          <div><dt>A S D F G H</dt><dd>pluck strings</dd></div>
          <div><dt>Hold X</dt><dd>pull into focus</dd></div>
          <div><dt>M</dt><dd>sound on / off</dd></div>
          <div><dt>L</dt><dd>live link (microphone)</dd></div>
          <div><dt>?</dt><dd>this panel</dd></div>
        </dl>
      </div>
    </div>`;

  const $ = (id) => root.querySelector(id);
  const el = {
    scn: $('#ro-scn'), prg: $('#ro-prg'), rot: $('#ro-rot'), note: $('#ro-note'), gpu: $('#ro-gpu'),
    snd: $('#btn-snd'), sndTxt: $('#snd-txt'), live: $('#btn-live'), livePanel: $('#live'),
    toast: $('#toast'), alert: $('#alert'), help: $('#help'), scope: $('#scope'),
  };
  const idx = [...root.querySelectorAll('.hud-index button')];

  // ── sound switch ──
  function paintSound() {
    const on = audio.ready && !S.muted;
    el.snd.setAttribute('aria-pressed', on);
    el.snd.dataset.s = !audio.ready ? (S.muted ? 'off' : 'idle') : S.muted ? 'off' : 'on';
    el.sndTxt.textContent = !audio.ready ? (S.muted ? 'SND OFF' : 'SND TAP') : S.muted ? 'SND OFF' : 'SND ON';
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

  // ── live link ──
  async function toggleLive() {
    if (S.live) { liveLink.stop(); return; }
    try {
      toast('MIC LINK — ALLOW THE MICROPHONE');
      await liveLink.start();
      toast('LIVE LINK ON — PLAY A STRING ON YOUR GUITAR', 4);
    } catch {
      toast('MIC UNAVAILABLE 接続不可', 3);
    }
  }
  el.live.addEventListener('click', toggleLive);
  bus.on('live:state', (on) => {
    el.live.setAttribute('aria-pressed', on);
    el.livePanel.hidden = !on;
    root.classList.toggle('is-live', on);
  });
  const liveNote = el.livePanel.querySelector('.live-note');
  const liveHz = el.livePanel.querySelector('.live-hz');
  const liveBar = el.livePanel.querySelector('.live-bar i');
  bus.on('live', (d) => {
    if (!d || !d.name) { el.livePanel.dataset.s = 'idle'; if (!d) { liveHz.textContent = 'LISTENING…'; } return; }
    liveNote.textContent = d.name;
    liveHz.textContent = `${d.hz.toFixed(1)} HZ · ${d.cents > 0 ? '+' : d.cents < 0 ? '−' : '±'}${pad(d.cents)}¢` + (d.string !== null ? ` · STR ${6 - d.string} FRET ${d.fret}` : '');
    liveBar.style.transform = `translateX(${clamp(d.cents, -50, 50)}%)`;
    el.livePanel.dataset.s = Math.abs(d.cents) <= 7 ? 'tune' : 'off';
  });

  // ── index ──
  idx.forEach((b) => b.addEventListener('click', () => { audio.unlock(); audio.blip('nav'); director.goTo(+b.dataset.c); }));
  bus.on('chapter', (c) => {
    idx.forEach((b, n) => { b.classList.toggle('is-on', n === c); if (n === c) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    el.scn.textContent = `${pad(c + 1)}/${pad(CHAPTERS.length)}`;
    audio.setDepth(c / (CHAPTERS.length - 1));
    if (audio.ready) audio.blip('nav');
  });

  bus.on('pluck', (p) => { el.note.textContent = `${noteName(p.midi)}·${p.fret ? `F${pad(p.fret)}` : 'OPEN'}`; el.note.classList.remove('hit'); void el.note.offsetWidth; el.note.classList.add('hit'); });
  bus.on('lock', () => { if (S.open >= 1 && S.transit < 0.05) audio.blip('lock'); });
  bus.on('snap', () => audio.blip('lock'));
  bus.on('ui', (k) => audio.blip(k));
  bus.on('tier', (t) => toast(`RENDER QUALITY → ${t.toUpperCase()}`, 2.5));

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

  // ── per-frame readouts ──
  const sc = el.scope.getContext('2d');
  let clock = 0;
  function update(dt, wave) {
    clock += dt;
    if (clock > 0.09) {
      clock = 0;
      const total = SHOTS.length - 1;
      el.prg.textContent = `${pad(clamp(S.P / total) * 100, 3)}%`;
      const a = SHOTS[S.i], b = SHOTS[S.j];
      const yaw = lerp(a.rot[1] + (a.spin || 0) * S.hold, b.rot[1], S.e) + S.yaw;
      const pitch = lerp(a.rot[0], b.rot[0], S.e) + S.pitch;
      const wrap = ((yaw % 360) + 540) % 360 - 180;
      el.rot.textContent = `Y${wrap < 0 ? '−' : '+'}${pad(wrap, 3)} X${pitch < 0 ? '−' : '+'}${pad(pitch)}`;
      el.gpu.textContent = S.hasGL ? `${S.tier.toUpperCase()} ${pad(S.fps)}` : 'OFF';
    }
    // oscilloscope
    const w = el.scope.width, h = el.scope.height;
    sc.clearRect(0, 0, w, h);
    sc.strokeStyle = 'rgba(233,231,242,0.25)';
    sc.lineWidth = 1;
    sc.beginPath(); sc.moveTo(0, h / 2 + 0.5); sc.lineTo(w, h / 2 + 0.5); sc.stroke();
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
  }

  return { update, toast, alert, toggleHelp, toggleLive, paintSound, callsign: $('#callsign') };
}
