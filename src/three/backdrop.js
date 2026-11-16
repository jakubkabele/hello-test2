// Everything behind the guitar: a colour field, a hex grid, range rings and dust.
// It is drawn in the same scene as the guitar, so it goes through the same blur —
// soft glow outside the focus window, crisp technical lines inside it.

import * as THREE from 'three';

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;        // canvas size in CSS px
  uniform float uPx;        // device px per CSS px
  uniform vec2 uAnchor;     // focus target in CSS px (y down)
  uniform float uTime;
  uniform float uScroll;
  uniform float uRipple;    // age of the last pluck ripple (seconds)
  uniform float uLevel;     // sound level 0–1
  uniform float uChapter;

  const vec3 VOID   = vec3(0.043, 0.047, 0.078);
  const vec3 INDIGO = vec3(0.118, 0.129, 0.251);
  const vec3 SLATE  = vec3(0.290, 0.353, 0.549);
  const vec3 VIOLET = vec3(0.478, 0.420, 0.659);
  const vec3 PAPER  = vec3(0.914, 0.906, 0.949);

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec4 hexCoords(vec2 uv) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(uv, uv - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(uv - hc.xy * s, uv - (hc.zw + 0.5) * s);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
  }
  float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }

  float blob(vec2 p, vec2 c, float r) { float d = length(p - c) / r; return exp(-d * d); }

  void main() {
    vec2 p = gl_FragCoord.xy / uPx;
    p.y = uRes.y - p.y;
    vec2 uv = p / uRes;
    float m = min(uRes.x, uRes.y);
    // on wide screens the colour pools behind the guitar and the corners stay dark
    float wide = smoothstep(0.7, 1.5, uRes.x / uRes.y);
    float br = mix(1.0, 0.72, wide);

    // colour field
    vec3 col = mix(INDIGO * mix(0.8, 0.6, wide), VOID, smoothstep(-0.1, 1.05, uv.y + 0.08 * sin(uv.x * 2.4 + uTime * 0.05)));
    float t = uTime * 0.04 + uChapter * 0.9;
    col += SLATE  * 0.78 * blob(p, uAnchor + m * vec2(-0.10 + 0.1 * sin(t), -0.30 + 0.08 * cos(t * 1.3)), m * 0.85 * br);
    col += VIOLET * 0.50 * blob(p, uAnchor + m * vec2(0.45 + 0.12 * cos(t * 0.8), 0.45 + 0.1 * sin(t)), m * 0.7 * br);
    col += SLATE  * 0.30 * blob(p, vec2(uRes.x * 0.5, uRes.y * (1.05 - 0.1 * sin(t))), m * 0.9);
    col *= 1.0 + uLevel * 0.25;

    // hex grid (drifts slower than the scroll = depth)
    float cell = 34.0;
    vec2 hp = (p + vec2(uTime * 2.0, uScroll * 120.0)) / cell;
    vec4 hx = hexCoords(hp);
    float hd = hexDist(hx.xy);
    float line = smoothstep(0.5 - 1.3 / cell, 0.5 - 0.4 / cell, hd);
    float id = hash(hx.zw);
    float fade = 0.35 + 0.65 * smoothstep(0.0, 0.9, uv.y) ;
    col += PAPER * line * 0.075 * fade;
    // a few cells are lit and slowly blink
    float lit = step(0.93, id) * (0.5 + 0.5 * sin(uTime * (0.6 + id) + id * 40.0));
    col += SLATE * lit * 0.16 * (1.0 - line);
    // pluck ripple: a ring of cells lights up and travels outwards
    float rr = length(p - uAnchor);
    float ring = exp(-pow((rr - uRipple * 620.0) / 46.0, 2.0)) * exp(-uRipple * 1.6);
    col += PAPER * ring * (0.10 + 0.25 * line) * step(uRipple, 2.5);

    // range rings around the focus target
    float a = atan(p.y - uAnchor.y, p.x - uAnchor.x);
    for (int k = 0; k < 3; k++) {
      float R = m * (0.34 + 0.2 * float(k));
      float w = 0.7;
      float c = 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, abs(rr - R));
      float dash = step(0.35, fract(a * (6.0 + 5.0 * float(k)) / 6.2832 + uTime * 0.01 * (float(k) - 1.0)));
      col += PAPER * c * dash * 0.10;
    }
    // cross-hair lines through the target
    float vx = 1.0 - smoothstep(0.3, 1.2, abs(p.x - uAnchor.x));
    float vy = 1.0 - smoothstep(0.3, 1.2, abs(p.y - uAnchor.y));
    col += PAPER * (vx + vy) * 0.035;
    // ruler ticks down the left edge
    float tick = step(fract((p.y + uScroll * 300.0) / 12.0), 0.09) * step(p.x, 5.0 + 6.0 * step(fract((p.y + uScroll * 300.0) / 60.0), 0.2));
    col += PAPER * tick * 0.22;

    gl_FragColor = vec4(col, 1.0);
  }`;

export function createBackdrop(count) {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uPx: { value: 1 },
    uAnchor: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uRipple: { value: 99 },
    uLevel: { value: 0 },
    uChapter: { value: 0 },
  };
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
      uniforms,
      depthTest: false,
      depthWrite: false,
    }),
  );
  plane.frustumCulled = false;
  plane.renderOrder = -10;

  // dust
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe9e7f2, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false }));

  return {
    plane, dust, uniforms,
    setCount(n) { geo.setDrawRange(0, Math.min(n, count)); },
  };
}
