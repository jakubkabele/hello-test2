// The 3D stage: renderer, camera, lights, the guitar, and the per-frame choreography
// (where the guitar sits and how it is turned for the current scroll position).
// This whole file is loaded lazily, after the first paint.

import * as THREE from 'three';
import { S, bus, clamp, lerp, damp } from '../core/state.js';
import { SHOTS } from '../config/shots.js';
import { homeRect } from '../core/layout.js';
import { loadGuitar, G } from './guitar.js';
import { createBackdrop } from './backdrop.js';
import { createPost } from './post.js';

// Quality levels. The stage starts on one and steps down by itself if the phone struggles.
const TIERS = {
  low: { dpr: 1, msaa: 0, ca: false, dust: 50 },
  mid: { dpr: 1.5, msaa: 2, ca: true, dust: 130 },
  high: { dpr: 2, msaa: 4, ca: true, dust: 300 },
};
const ORDER = ['low', 'mid', 'high'];

const forced = new URLSearchParams(location.search).get('q');   // ?q=low|mid|high pins the quality

function pickTier() {
  if (TIERS[forced]) return forced;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (S.coarse) return cores <= 4 || mem <= 3 ? 'low' : 'mid';
  return cores <= 4 ? 'mid' : 'high';
}

const DEG = Math.PI / 180;
const FOV = 30;
const DIST = 20;

export async function createStage({ canvas, modelUrl = null }) {
  THREE.ColorManagement.enabled = false;   // colours go to the screen exactly as written
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x0b0c14, 1);
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 80);
  camera.position.set(0, 0, DIST);

  // Light in the palette: cool white key, violet rim from behind, indigo fill.
  scene.add(new THREE.HemisphereLight(0x9aa6dc, 0x14122b, 1.05));
  const key = new THREE.DirectionalLight(0xe9e7f2, 1.9);
  key.position.set(-5, 7, 9);
  const rim = new THREE.DirectionalLight(0x8a78c8, 2.4);
  rim.position.set(7, 2, -6);
  const fill = new THREE.DirectionalLight(0x4a5a8c, 0.9);
  fill.position.set(4, -6, 5);
  scene.add(key, rim, fill);

  let tier = pickTier();
  S.tier = tier;

  const backdrop = createBackdrop(TIERS.high.dust);
  scene.add(backdrop.plane, backdrop.dust);

  const guitar = await loadGuitar({ modelUrl });
  scene.add(guitar.root);

  const post = createPost(renderer);

  // ── sizing ──
  let px = 1;           // device px per CSS px actually used
  let halfH = 1, halfW = 1;
  function resize() {
    const t = TIERS[tier];
    const w = S.vw, h = S.ch;
    px = Math.min(window.devicePixelRatio || 1, t.dpr, 2);
    renderer.setPixelRatio(px);
    renderer.setSize(w, h, false);
    const bw = Math.floor(w * px), bh = Math.floor(h * px);
    post.setSize(bw, bh, { msaa: t.msaa, ca: t.ca });
    post.uniforms.uPx.value = px;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = DIST * Math.tan((FOV * DEG) / 2);
    halfW = halfH * camera.aspect;
    backdrop.uniforms.uRes.value.set(w, h);
    backdrop.uniforms.uPx.value = px;
    backdrop.setCount(t.dust);
  }
  resize();

  // ── pose: where the guitar is for shot n ──
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const qA = new THREE.Quaternion();
  const qB = new THREE.Quaternion();
  const qU = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const v = new THREE.Vector3();
  let sway = 0;

  function shotQuat(n, spinK, out) {
    const r = SHOTS[n].rot;
    eul.set(r[0] * DEG, (r[1] + (SHOTS[n].spin || 0) * spinK) * DEG, r[2] * DEG, 'YXZ');
    return out.setFromEuler(eul);
  }

  // the screen point the anchored part is pinned to: the window centre, unless the shot says "at"
  function pin(n, r) {
    const at = SHOTS[n].at && (SHOTS[n].at[S.layout] || SHOTS[n].at.m);
    return at ? [at[0] * S.vw, at[1] * S.vh] : [r.x + r.w / 2, r.y + r.h / 2];
  }

  function pose(dt) {
    const { i, j, e } = S;
    const a = SHOTS[i], b = SHOTS[j];
    const fitA = a.fit[S.layout] || a.fit.m, fitB = b.fit[S.layout] || b.fit.m;
    const ra = homeRect(i), rb = homeRect(j);

    // exploded view first (anchors move with the parts)
    guitar.setExplode(lerp(a.explode || 0, b.explode || 0, e));

    // rotation: shot → shot, plus the user's drag, a slow idle sway and tilt parallax
    shotQuat(i, S.hold, qA);
    shotQuat(j, 0, qB);
    qA.slerp(qB, e);
    if (!S.reduced) sway += dt;
    const yaw = S.yaw + Math.sin(sway * 0.42) * 3.2 + S.tiltX * 7;
    const pitch = S.pitch + Math.sin(sway * 0.31) * 1.4 + S.tiltY * 4;
    eul.set(pitch * DEG, yaw * DEG, 0, 'YXZ');
    qU.setFromEuler(eul);
    guitar.root.quaternion.copy(qU).multiply(qA);

    // size
    const fit = lerp(fitA, fitB, e);
    const s = (fit * (S.vh / S.ch) * 2 * halfH) / G.LENGTH;
    guitar.root.scale.setScalar(s);

    // pin the anchored part to the centre of the window's home
    const pa = pin(i, ra), pb = pin(j, rb);
    const cx = lerp(pa[0], pb[0], e);
    const cy = lerp(pa[1], pb[1], e);
    const tx = (cx / S.vw * 2 - 1) * halfW;
    const ty = (1 - cy / S.ch * 2) * halfH;
    guitar.anchorAt(a.anchor, tmpA);
    guitar.anchorAt(b.anchor, tmpB);
    v.copy(tmpA).lerp(tmpB, e).multiplyScalar(s).applyQuaternion(guitar.root.quaternion);
    guitar.root.position.set(tx - v.x, ty - v.y, -v.z);
    guitar.root.updateMatrixWorld(true);

    const energy = guitar.update(dt, S.reduced);

    // backdrop
    const bu = backdrop.uniforms;
    bu.uTime.value = S.reduced ? 0 : S.time;
    bu.uScroll.value = S.P;
    bu.uAnchor.value.set(cx, cy);
    bu.uRipple.value += dt;
    bu.uLevel.value = S.level;
    bu.uChapter.value = S.P;
    if (!S.reduced) backdrop.dust.rotation.y = S.time * 0.012 + S.P * 0.25;
    backdrop.dust.position.y = S.P * 0.6;

    dim = lerp(a.dim || 0, b.dim || 0, e);
    return energy;
  }
  let dim = 0;

  // screen position (CSS px) of a named part
  function project(name, out = { x: 0, y: 0 }) {
    guitar.anchorAt(name, v).applyMatrix4(guitar.root.matrixWorld).project(camera);
    out.x = (v.x * 0.5 + 0.5) * S.vw;
    out.y = (1 - (v.y * 0.5 + 0.5)) * S.ch;
    out.behind = v.z > 1;
    return out;
  }

  // ── pointer → strings ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitStrings(x, y, margin) {
    ndc.set((x / S.vw) * 2 - 1, 1 - (y / S.ch) * 2);
    raycaster.setFromCamera(ndc, camera);
    return guitar.hit(raycaster.ray, margin);
  }

  bus.on('pluck', () => { backdrop.uniforms.uRipple.value = 0; });

  // ── draw ──
  let flash = 0;
  bus.on('flash', (k = 1) => { flash = k; });
  function render(dt) {
    const u = post.uniforms;
    const w = S.win;
    // CSS px (y down) → device px (y up)
    const bh = Math.floor(S.ch * px);
    u.uWin.value.set(w.x * px, bh - (w.y + w.h) * px, (w.x + w.w) * px, bh - w.y * px);
    u.uWinFocus.value = w.focus;
    const blur = clamp(1 - S.pull);
    u.uBlur.value = blur;
    u.uTime.value = S.reduced ? 1 : S.time;
    u.uDim.value = dim * (1 - S.pull * 0.6);
    u.uPulse.value = damp(u.uPulse.value, clamp(S.level * 2.2) + (S.overdrive ? 0.8 : 0), 14, dt);
    u.uGrain.value = S.overdrive ? 0.2 : 0.115;
    u.uCA.value = (S.overdrive ? 0.03 : 0.011) + S.transit * 0.012;
    flash = Math.max(0, flash - dt * 2.2);
    u.uFlash.value = flash * flash * 0.5;
    post.render(scene, camera, blur > 0.002);
  }

  // ── watch the frame rate; step quality down if it stays low ──
  let acc = 0, frames = 0, slow = 0;
  function monitor(dt) {
    acc += dt; frames++;
    if (acc < 1.5) return;
    const fps = frames / acc;
    S.fps = fps;
    acc = 0; frames = 0;
    if (fps < 34 && document.visibilityState === 'visible') slow++; else slow = Math.max(0, slow - 1);
    if (slow >= 2 && !TIERS[forced]) {
      slow = 0;
      const k = ORDER.indexOf(tier);
      if (k > 0) { tier = ORDER[k - 1]; S.tier = tier; resize(); bus.emit('tier', tier); }
    }
  }

  // text drawn into textures needs the web fonts to be ready
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('150px "Anton"', '01'),
      document.fonts.load('500 19px "IBM Plex Mono"', 'A'),
      document.fonts.load('800 15px "Shippori Mincho"', 'ヘッド糸巻指板ピックアップブリッジ操作部ボディ弦楽器零壱／'),
    ]).then(() => guitar.redrawText()).catch(() => {});
  }

  S.hasGL = true;
  return { guitar, pose, render, resize, project, hitStrings, monitor, renderer };
}
