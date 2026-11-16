// Touch / mouse on the stage. One finger can mean four things, decided where it lands:
//
//   on the strings        → play (tap = pluck, swipe across = strum)
//   on the focus window   → drag the window (touch)
//   anywhere else         → drag sideways to rotate the guitar
//   press and hold still  → pull everything into focus
//
// Up/down swipes are left to the browser, so scrolling always works.

import { S, bus, clamp } from './state.js';
import { audio } from '../audio/engine.js';
import { OPEN_MIDI, stringX } from '../three/guitar-math.js';

export function createInput({ canvas, frame, focus, getStage }) {
  let g = null;                 // the gesture in progress
  let holdTimer = null;
  let chord = null;             // frets of the chord selected in "Chord bank" (or null)
  let spin = 0;                 // rotation speed after you let go (deg/s)
  let lastTouch = -99;
  let hoverPrev = null;
  const lastPluck = [0, 0, 0, 0, 0, 0];

  bus.on('chord', (frets) => { chord = frets; });

  function play(string, fret, vel, along) {
    const now = performance.now();
    if (now - lastPluck[string] < 45) return;
    lastPluck[string] = now;
    const midi = OPEN_MIDI[string] + fret;
    audio.pluck(midi, { vel, bright: along, pan: (string - 2.5) / 2.5 });
    const stage = getStage();
    if (stage) stage.guitar.pluck(string, clamp(vel * 1.1, 0.3, 1.2), fret);
    bus.emit('pluck', { string, fret, midi, vel });
  }

  // which fret sounds when string k is played at hit h
  function fretFor(k, h, tapped) {
    if (tapped && h.fret > 0) return h.fret;
    if (chord) return chord[k] === 'x' ? null : chord[k];
    return h.fret > 0 && tapped ? h.fret : 0;
  }

  // did the pointer cross any strings between two samples?
  function cross(prev, cur, vel) {
    if (!prev || !cur) return;
    for (let k = 0; k < 6; k++) {
      const a = prev.x - stringX(k, prev.y);
      const b = cur.x - stringX(k, cur.y);
      if (a === 0 || a * b < 0) {
        const fret = chord ? (chord[k] === 'x' ? null : chord[k]) : 0;
        if (fret !== null) play(k, fret, vel, cur.along);
      }
    }
  }

  function down(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (g) return;
    audio.unlock();
    bus.emit('gesture');
    const stage = getStage();
    const touch = ev.pointerType !== 'mouse';
    if (touch) lastTouch = performance.now();
    const x = ev.clientX, y = ev.clientY;
    g = { id: ev.pointerId, x0: x, y0: y, x, y, t: performance.now(), type: 'rotate', moved: false, touch, hit: null, target: ev.currentTarget };

    const hit = stage ? stage.hitStrings(x, y, touch ? 0.1 : 0.045) : null;
    if (hit) {
      g.type = 'strum'; g.hit = hit;
      const fret = fretFor(hit.string, hit, true);
      if (fret !== null) play(hit.string, fret, 0.85, hit.along);
    } else if (touch && focus.inside(x, y, 6) && focus.canGrab()) {
      g.type = 'window';
      focus.grab(x, y);
    }
    try { g.target.setPointerCapture(ev.pointerId); } catch { /* fine */ }
    if (g.type !== 'strum') {
      holdTimer = setTimeout(() => {
        if (!g || g.moved) return;
        g.pulled = true; focus.setPull(true); bus.emit('pull', true);
        // holding on the window also "arms" it: now it can be dragged in any direction
        if (g.type === 'window') { g.armed = true; frame.classList.add('is-armed'); }
      }, touch ? 260 : 170);
    }
    spin = 0;
  }

  function move(ev) {
    const x = ev.clientX, y = ev.clientY;
    const stage = getStage();
    if (!g) {
      // a mouse just passing by: the window follows it, and brushing the strings plays them
      if (ev.pointerType === 'mouse' && performance.now() - lastTouch > 800) {
        focus.cursor(x, y);
        const h = stage ? stage.hitStrings(x, y, 0.35) : null;
        if (h && hoverPrev && audio.ready) cross(hoverPrev, h, clamp(Math.abs(ev.movementX || 4) / 30, 0.25, 0.7));
        hoverPrev = h;
        S.over = h && h.dist < 0.06 ? 'string' : null;
      }
      return;
    }
    if (ev.pointerId !== g.id) return;
    const dx = x - g.x, dy = y - g.y;
    g.x = x; g.y = y;
    if (!g.moved && Math.hypot(x - g.x0, y - g.y0) > 9) {
      g.moved = true;
      if (!g.pulled) clearTimeout(holdTimer);
    }
    if (!g.touch) focus.cursor(x, y);
    if (g.type === 'strum') {
      const h = stage ? stage.hitStrings(x, y, 0.5) : null;
      cross(g.hit, h, clamp(Math.hypot(dx, dy) / 26, 0.4, 1));
      if (h) g.hit = h;
    } else if (g.type === 'window') {
      if (g.pulled && g.moved) { g.pulled = false; focus.setPull(false); bus.emit('pull', false); }
      focus.drag(x, y);
    } else if (g.moved) {
      const dt = Math.max(1, performance.now() - g.t);
      g.t = performance.now();
      S.yaw += dx * 0.38;
      S.pitch = clamp(S.pitch + dy * (g.touch ? 0.1 : 0.22), -38, 38);
      spin = clamp((dx * 0.38) / dt * 1000, -220, 220);
      bus.emit('rotate');
    }
  }

  function up(ev) {
    if (!g || ev.pointerId !== g.id) return;
    clearTimeout(holdTimer);
    if (g.type === 'window') { focus.release(getStage()); frame.classList.remove('is-armed'); }
    if (g.pulled) { focus.setPull(false); bus.emit('pull', false); }
    if (g.type !== 'rotate' || !g.moved || performance.now() - g.t > 90) spin = 0;
    try { g.target.releasePointerCapture(ev.pointerId); } catch { /* fine */ }
    idle = 0;
    g = null;
  }

  [canvas, frame].forEach((el) => {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // an armed window (held first) may be dragged up/down too — stop the page from scrolling then
  frame.addEventListener('touchmove', (e) => { if (g && g.armed && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerleave', () => focus.cursorOut());
  document.documentElement.addEventListener('mouseleave', () => focus.cursorOut());

  // after you let go: keep spinning a moment, then settle back to the shot's own angle
  let idle = 0;
  function update(dt) {
    if (g && g.type === 'rotate') { idle = 0; return; }
    if (Math.abs(spin) > 1) {
      S.yaw += spin * dt;
      spin *= Math.exp(-dt * 4.5);
      idle = 0;
      return;
    }
    idle += dt;
    if (idle > 2.2 || S.transit > 0.05) {
      const rest = Math.round(S.yaw / 360) * 360;
      const k = 1 - Math.exp(-dt * (S.transit > 0.05 ? 4 : 1.4));
      S.yaw += (rest - S.yaw) * k;
      S.pitch += (0 - S.pitch) * k;
    }
  }

  return { update, play, get chord() { return chord; } };
}
