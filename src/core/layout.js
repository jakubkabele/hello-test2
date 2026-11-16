// Screen measurements + where the focus window "lives" in each shot.

import { S } from './state.js';
import { SHOTS } from '../config/shots.js';

let probe = null;

export function measureViewport() {
  if (!probe) {
    // 100svh = the screen height while the phone's address bar is showing (never jumps)
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  S.vw = document.documentElement.clientWidth || window.innerWidth;
  S.vh = probe.offsetHeight || window.innerHeight;
  const canvas = document.getElementById('stage');
  S.ch = (canvas && canvas.clientHeight) || window.innerHeight;
  S.layout = S.vw / S.vh < 0.85 ? 'm' : 'd';
  document.documentElement.dataset.layout = S.layout;
}

// Home rectangle of the focus window for a shot, in CSS px.
export function homeRect(n) {
  const sh = SHOTS[n];
  const r = sh.win[S.layout] || sh.win.m;
  const w = Math.round(r[2] * S.vw);
  const h = sh.win.aspect ? Math.round(w / sh.win.aspect) : Math.round(r[3] * S.vh);
  return { x: Math.round(r[0] * S.vw), y: Math.round(r[1] * S.vh), w, h };
}
