// The FOCUS WINDOW controller.
// Decides where the sharp rectangle is each frame, and keeps the thin HUD frame
// (a normal HTML element) glued to exactly the same rectangle the shader uses.
//
//  • rests on the guitar part for the current shot ("home")
//  • desktop: follows the cursor with a little lag, goes home when the cursor rests
//  • touch: grab it and drag; on release it snaps to the nearest guitar part
//  • otherwise it sways with phone tilt (gyroscope), or drifts slowly by itself
//  • hold anywhere → the whole picture pulls into focus

import { S, bus, clamp, lerp, damp, pad } from './state.js';
import { SHOTS } from '../config/shots.js';
import { homeRect } from './layout.js';
import { PARTS } from '../content.js';

const SNAP_PARTS = ['headstock', 'frets', 'pickups', 'bridge', 'controls'];

export function createFocus({ frame }) {
  const $ = (sel) => frame.querySelector(sel);
  const el = { state: $('.fw-state'), tgt: $('.fw-tgt'), xy: $('.fw-xy'), dim: $('.fw-dim'), blur: $('.fw-blur') };

  const cur = { cx: 0, cy: 0, w: 0, h: 0 };
  let ready = false;
  let grab = null;                 // { ox, oy } while a finger drags the window
  let held = null;                 // { x, y, until } where it was dropped
  let snap = null;                 // { name, until, P } part it snapped to
  const cursor = { x: 0, y: 0, t: -99, on: false };
  const gyro = { on: false, g: 0, b: 0, bg: null, bb: null, x: 0, y: 0 };
  let pulling = false;
  let textClock = 0;
  let lastState = '';
  let pullHeld = 0;

  // ── phone tilt ──
  function onTilt(ev) {
    if (ev.gamma === null || ev.beta === null) return;
    gyro.on = true;
    gyro.g = ev.gamma; gyro.b = ev.beta;
    if (gyro.bg === null) { gyro.bg = ev.gamma; gyro.bb = ev.beta; }
  }
  function enableTilt() {
    if (S.reduced || typeof DeviceOrientationEvent === 'undefined') return;
    const start = () => window.addEventListener('deviceorientation', onTilt, { passive: true });
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iPhones ask the user first; must be called from a tap
      DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') start(); }).catch(() => {});
    } else start();
  }

  const P = { x: 0, y: 0 };

  function update(dt, stage) {
    const a = homeRect(S.i), b = homeRect(S.j), e = S.e;
    const shot = S.e > 0.5 ? SHOTS[S.j] : SHOTS[S.i];
    const home = {
      cx: lerp(a.x + a.w / 2, b.x + b.w / 2, e),
      cy: lerp(a.y + a.h / 2, b.y + b.h / 2, e),
      w: lerp(a.w, b.w, e),
      h: lerp(a.h, b.h, e),
    };
    if (!ready) { Object.assign(cur, home); ready = true; }

    // tilt → -1…1, measured against how the phone is usually held
    if (gyro.on) {
      gyro.bg = damp(gyro.bg, gyro.g, 0.25, dt);
      gyro.bb = damp(gyro.bb, gyro.b, 0.25, dt);
      gyro.x = damp(gyro.x, clamp((gyro.g - gyro.bg) / 22, -1, 1), 6, dt);
      gyro.y = damp(gyro.y, clamp((gyro.b - gyro.bb) / 22, -1, 1), 6, dt);
      S.tiltX = gyro.x; S.tiltY = gyro.y;
    } else if (S.hover && cursor.on) {
      S.tiltX = damp(S.tiltX, (cursor.x / S.vw - 0.5) * 0.9, 3, dt);
      S.tiltY = damp(S.tiltY, (cursor.y / S.vh - 0.5) * 0.9, 3, dt);
    }

    const now = S.time;
    const moving = S.transit > 0.04 || S.open < 0.999;
    const fixed = !!shot.fixed;
    if (snap && (now > snap.until || (!snap.sticky && Math.abs(S.P - snap.P) > 0.06) || fixed)) snap = null;
    if (held && (now > held.until || Math.abs(S.P - held.P) > 0.06 || fixed)) held = null;
    if (moving) { snap = null; held = null; }

    let tx = home.cx, ty = home.cy, rate = 5.5, state = 'LOCK', target = shot.anchor;
    if (moving) {
      state = 'SEEK';
    } else if (grab) {
      tx = grab.x + grab.ox; ty = grab.y + grab.oy; rate = 22; state = 'MANUAL'; target = null;
    } else if (snap && stage) {
      stage.project(snap.name, P);
      // only follow a part that is actually on screen
      if (P.x > 20 && P.x < S.vw - 20 && P.y > 60 && P.y < S.vh - 60) { tx = P.x; ty = P.y; rate = 9; target = snap.name; }
    } else if (held) {
      tx = held.x; ty = held.y; state = 'MANUAL'; target = null;
    } else if (!fixed && S.hover && cursor.on && now - cursor.t < 3.5) {
      tx = cursor.x; ty = cursor.y; rate = 9; state = 'MANUAL'; target = null;
    } else if (!fixed && !S.reduced) {
      if (gyro.on) { tx += gyro.x * S.vw * 0.1; ty += gyro.y * S.vh * 0.07; }
      else { tx += Math.sin(now * 0.37) * S.vw * 0.03; ty += Math.sin(now * 0.29 + 1.3) * S.vh * 0.02; }
    }

    const open = S.open;
    const tw = home.w * (0.02 + 0.98 * open) * (grab ? 1.05 : 1);
    const th = home.h * (0.02 + 0.98 * open) * (grab ? 1.05 : 1);
    // keep it on screen
    tx = clamp(tx, tw / 2 + 4, S.vw - tw / 2 - 4);
    ty = clamp(ty, th / 2 + 4, S.vh - th / 2 - 4);

    const px = cur.cx, py = cur.cy;
    if (S.reduced && !grab) { cur.cx = tx; cur.cy = ty; cur.w = tw; cur.h = th; }
    else {
      cur.cx = damp(cur.cx, tx, rate, dt); cur.cy = damp(cur.cy, ty, rate, dt);
      cur.w = damp(cur.w, tw, 7, dt); cur.h = damp(cur.h, th, 7, dt);
    }
    const speed = Math.hypot(cur.cx - px, cur.cy - py) / Math.max(dt, 1e-4);
    const dist = Math.hypot(cur.cx - tx, cur.cy - ty);
    if (state === 'LOCK' && dist > 10) state = 'SEEK';

    // whole pixels, so the HTML frame and the shader cut agree exactly
    const w = Math.round(cur.w), h = Math.round(cur.h);
    const x = Math.round(cur.cx - w / 2), y = Math.round(cur.cy - h / 2);
    const win = S.win;
    win.x = x; win.y = y; win.w = w; win.h = h;
    win.mode = state; win.target = target;
    // the inside goes soft while the window travels, and during chapter changes
    win.focus = clamp((1 - S.transit * 0.92) * (1 - clamp(speed / 2600) * 0.55) * clamp(open * 1.4));

    // pull focus
    S.pull = damp(S.pull, pulling ? 1 : 0, pulling ? 7 : 4.5, dt);
    if (S.pull < 0.001) S.pull = 0;
    if (pulling && S.pull > 0.95) { pullHeld += dt; if (pullHeld > 6) { pullHeld = -999; bus.emit('egg:stare'); } }
    else if (!pulling) pullHeld = 0;

    // ── HTML frame ──
    frame.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.opacity = clamp(open * 3);
    if (state !== lastState) {
      lastState = state;
      frame.dataset.state = state;
      el.state.textContent = state === 'LOCK' ? 'LOCK 固定' : state === 'SEEK' ? 'SEEK 探索' : 'MANUAL 手動';
      if (state === 'LOCK') bus.emit('lock');
    }
    frame.classList.toggle('is-fixed', fixed);
    frame.classList.toggle('is-wide', !!shot.wide);
    textClock += dt;
    if (textClock > 0.11) {
      textClock = 0;
      const part = target && PARTS[target];
      el.tgt.textContent = part ? `TGT ${part.en} ${part.jp}` : 'TGT — FREE 自由';
      el.xy.textContent = `X${pad((cur.cx / S.vw) * 1000, 3)} Y${pad((cur.cy / S.vh) * 1000, 3)}`;
      el.dim.textContent = `${w}×${h}`;
      el.blur.textContent = `DEFOCUS ${pad((1 - S.pull) * 100, 3)}%`;
    }
  }

  return {
    update,
    enableTilt,
    inside(x, y, slop = 0) {
      const w = S.win;
      return x >= w.x - slop && x <= w.x + w.w + slop && y >= w.y - slop && y <= w.y + w.h + slop;
    },
    canGrab() { return !(SHOTS[S.i].fixed) && S.transit < 0.04; },
    grab(x, y) { grab = { x, y, ox: cur.cx - x, oy: cur.cy - y }; snap = null; held = null; },
    drag(x, y) { if (grab) { grab.x = x; grab.y = y; } },
    release(stage) {
      if (!grab) return;
      const cx = grab.x + grab.ox, cy = grab.y + grab.oy;
      grab = null;
      // snap to the nearest guitar part, if one is close
      let best = null, bd = Math.max(cur.w, cur.h) * 0.6;
      if (stage) {
        SNAP_PARTS.forEach((name) => {
          const p = stage.project(name, {});
          if (p.x < 20 || p.x > S.vw - 20 || p.y < 60 || p.y > S.vh - 60) return;   // not on screen
          const d = Math.hypot(p.x - cx, p.y - cy);
          if (d < bd) { bd = d; best = name; }
        });
      }
      if (best) { snap = { name: best, until: S.time + 7, P: S.P }; bus.emit('snap', best); }
      else held = { x: cx, y: cy, until: S.time + 3, P: S.P };
    },
    // send the window to a named part and keep it there while this chapter is on screen
    snapTo(name) { snap = { name, until: S.time + 12, P: S.P, sticky: true }; held = null; bus.emit('snap', name); },
    cursor(x, y) { cursor.x = x; cursor.y = y; cursor.t = S.time; cursor.on = true; },
    cursorOut() { cursor.on = false; },
    setPull(v) { pulling = !!v; },
    get grabbing() { return !!grab; },
  };
}
