// The FOCUS WINDOW effect.
//
// 1. The scene is drawn once, sharp, into a texture.
// 2. That texture is shrunk and smeared a few times → a heavily blurred copy (cheap, because
//    each step works on a picture a quarter the size of the last).
// 3. The final pass picks per pixel: inside the window rectangle → the sharp picture,
//    outside → the blurred one. Same picture, same position, so the window lines up exactly.
//    Then film grain, colour fringing, scanlines and a vignette go on top.

import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const DOWN = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap; uniform vec2 uHalf; varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tMap, vUv) * 4.0;
    s += texture2D(tMap, vUv - uHalf);
    s += texture2D(tMap, vUv + uHalf);
    s += texture2D(tMap, vUv + vec2(uHalf.x, -uHalf.y));
    s += texture2D(tMap, vUv - vec2(uHalf.x, -uHalf.y));
    gl_FragColor = s / 8.0;
  }`;

const UP = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap; uniform vec2 uHalf; varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tMap, vUv + vec2(-uHalf.x * 2.0, 0.0));
    s += texture2D(tMap, vUv + vec2(-uHalf.x, uHalf.y)) * 2.0;
    s += texture2D(tMap, vUv + vec2(0.0, uHalf.y * 2.0));
    s += texture2D(tMap, vUv + vec2(uHalf.x, uHalf.y)) * 2.0;
    s += texture2D(tMap, vUv + vec2(uHalf.x * 2.0, 0.0));
    s += texture2D(tMap, vUv + vec2(uHalf.x, -uHalf.y)) * 2.0;
    s += texture2D(tMap, vUv + vec2(0.0, -uHalf.y * 2.0));
    s += texture2D(tMap, vUv + vec2(-uHalf.x, -uHalf.y)) * 2.0;
    gl_FragColor = s / 12.0;
  }`;

const FINAL = /* glsl */ `
  precision highp float;
  uniform sampler2D tSharp; uniform sampler2D tMid; uniform sampler2D tBlur;
  uniform vec2 uRes;          // device px
  uniform float uPx;          // device px per CSS px
  uniform vec4 uWin;          // window: x0, y0, x1, y1 in device px (y up)
  uniform float uWinFocus;    // how sharp the inside is (1 = perfect)
  uniform float uBlur;        // how blurred the outside is (1 = full)
  uniform float uTime; uniform float uGrain; uniform float uCA; uniform float uScan;
  uniform float uDim; uniform float uPulse; uniform float uFlash;
  varying vec2 vUv;

  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  vec3 scene(vec2 uv, float b) {
    vec3 s = texture2D(tSharp, uv).rgb;
    if (b <= 0.001) return s;
    vec3 m = texture2D(tMid, uv).rgb;
    vec3 h = texture2D(tBlur, uv).rgb;
    return b < 0.5 ? mix(s, m, b * 2.0) : mix(m, h, b * 2.0 - 1.0);
  }

  void main() {
    vec2 p = gl_FragCoord.xy;
    vec2 uv = p / uRes;

    // 1 inside the window, 0 outside, crisp edge
    vec2 d = min(p - uWin.xy, uWin.zw - p);
    float inside = clamp(min(d.x, d.y) + 0.5, 0.0, 1.0);
    float b = uBlur * (1.0 - inside * uWinFocus);

    vec2 dir = uv - 0.5;
    float ca = uCA * (0.25 + 0.75 * b + uPulse) * (0.4 + dot(dir, dir) * 2.4);
    vec3 col;
    #ifdef USE_CA
      col.r = scene(uv + dir * ca, b).r;
      col.g = scene(uv, b).g;
      col.b = scene(uv - dir * ca, b).b;
    #else
      col = scene(uv, b);
    #endif

    // the blurred world is a touch darker and flatter than what's in focus
    col = mix(col, col * 0.86 + 0.012, b);
    col *= 1.0 - uDim * (1.0 - inside * 0.35);

    // dirty print: uneven ink
    float mott = vnoise(p / (uPx * 90.0)) * 0.6 + vnoise(p / (uPx * 23.0)) * 0.4;
    col *= 0.94 + 0.12 * mott;

    // vignette
    col *= 1.0 - 0.42 * smoothstep(0.25, 0.95, length(dir * vec2(1.0, uRes.y / max(uRes.x, 1.0) * 0.7)));

    // scanlines (every 3 CSS px)
    float sl = 0.5 + 0.5 * sin(p.y / uPx * 2.0944);
    col *= 1.0 - uScan * sl;

    // film grain, re-rolled 12 times a second
    float tt = floor(uTime * 12.0);
    vec2 gp = floor(p / (uPx * 0.75));
    float g = hash(gp + tt * 17.0) - 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col += g * uGrain * (0.55 + 0.9 * b) * (0.6 + 0.8 * (1.0 - abs(lum * 2.0 - 1.0)));

    col += uFlash * vec3(0.914, 0.906, 0.949);
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createPost(renderer) {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const down = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DOWN, uniforms: { tMap: { value: null }, uHalf: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  const up = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: UP, uniforms: { tMap: { value: null }, uHalf: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  const final = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FINAL,
    defines: {},
    uniforms: {
      tSharp: { value: null }, tMid: { value: null }, tBlur: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 },
      uWin: { value: new THREE.Vector4(0, 0, 0, 0) }, uWinFocus: { value: 1 }, uBlur: { value: 1 },
      uTime: { value: 0 }, uGrain: { value: 0.11 }, uCA: { value: 0.012 }, uScan: { value: 0.07 },
      uDim: { value: 0 }, uPulse: { value: 0 }, uFlash: { value: 0 },
    },
    depthTest: false, depthWrite: false,
  });

  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  let sharp = null;
  let downs = [];
  let ups = [];
  let W = 1, H = 1;

  function dispose() {
    if (sharp) sharp.dispose();
    downs.forEach((t) => t.dispose());
    ups.forEach((t) => t.dispose());
    downs = []; ups = [];
  }

  // w, h in device px. The number of shrink steps follows the screen size so the blur
  // looks equally heavy on a phone and on a big monitor.
  function setSize(w, h, { msaa = 0, ca = true } = {}) {
    dispose();
    W = w; H = h;
    sharp = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true, samples: msaa });
    const levels = Math.max(3, Math.min(6, Math.round(Math.log2(Math.min(w, h) / 44))));
    let lw = w, lh = h;
    for (let i = 0; i < levels; i++) {
      lw = Math.max(2, Math.round(lw / 2)); lh = Math.max(2, Math.round(lh / 2));
      downs.push(new THREE.WebGLRenderTarget(lw, lh, opts));
    }
    // climb back up to quarter size (level index 1)
    for (let i = levels - 2; i >= 1; i--) ups.push(new THREE.WebGLRenderTarget(downs[i].width, downs[i].height, opts));
    final.uniforms.uRes.value.set(w, h);
    final.defines = ca ? { USE_CA: 1 } : {};
    final.needsUpdate = true;
  }

  function pass(material, src, dst, spread = 1) {
    material.uniforms.tMap.value = src.texture;
    material.uniforms.uHalf.value.set((0.5 * spread) / src.width, (0.5 * spread) / src.height);
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(scene, cam);
  }

  function render(mainScene, camera, needBlur) {
    renderer.setRenderTarget(sharp);
    renderer.render(mainScene, camera);

    if (needBlur) {
      let src = sharp;
      for (let i = 0; i < downs.length; i++) { pass(down, src, downs[i]); src = downs[i]; }
      for (let i = 0; i < ups.length; i++) { pass(up, src, ups[i], 1.6); src = ups[i]; }
      final.uniforms.tBlur.value = src.texture;
      final.uniforms.tMid.value = downs[1].texture;
    }
    final.uniforms.tSharp.value = sharp.texture;
    quad.material = final;
    renderer.setRenderTarget(null);
    renderer.render(scene, cam);
  }

  return { setSize, render, uniforms: final.uniforms, dispose };
}
