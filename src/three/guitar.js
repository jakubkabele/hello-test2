// The guitar: built from simple shapes (no model file).
//
// TO SWAP IN A REAL MODEL LATER
//   1. Put  guitar.glb  in /public/models/
//   2. (stage.js passes modelUrl on to loadGuitar below)
//   3. In main.js set  modelUrl: '/models/guitar.glb'
//   The model must stand upright (neck pointing up, front facing the camera). It is scaled
//   to the same length, and the playable strings, chord dots and focus-window anchors are
//   drawn on top of it. For the strings to sit exactly on the model, add two empties named
//   anchor_nut and anchor_saddle (middle of the nut / of the bridge saddles). Optional:
//   anchor_headstock, anchor_frets, anchor_pickups, anchor_bridge, anchor_body move the
//   focus targets; nodes named part_body, part_neck, part_pickups … join the exploded view.

import * as THREE from 'three';
import { G, fretY, stringX, NUT_X, SADDLE_X, OPEN_MIDI } from './guitar-math.js';

export { G, fretY, stringX, OPEN_MIDI };

export const PALETTE = {
  void: 0x0b0c14,
  indigo: 0x1e2140,
  slate: 0x4a5a8c,
  violet: 0x7a6ba8,
  paper: 0xe9e7f2,
  amber: 0xc9a25a,
};

const DEFAULT_ANCHORS = {
  headstock: [-0.02, 5.85, 0.15],
  frets: [0, 4.2, 0.3],
  chordbox: [0, 4.12, 0.3],     // nut → 5th fret: where chord shapes live
  fretmap: [0, 3.22, 0.3],      // nut → 12th fret: the note map
  strum: [0, 0.2, 0.34],        // where the pick hits the strings (neck end of the body)
  neck: [0, 2.5, 0.3],
  pickups: [0, -0.62, 0.3],
  bridge: [0, -1.62, 0.32],
  body: [0, -1.3, 0.25],
  controls: [1.0, -2.25, 0.3],
  center: [0, G.CENTER_Y, 0],
  amp: [6.4, -1.15, 0.5],
  pedal: [-3.9, -2.2, 0.4],
};

// How far each part travels in the exploded view (x, y, z)
const EXPLODE = {
  body: [0, -0.15, -0.9],
  guard: [0, -0.1, 0.35],
  pickups: [0, 0, 1.15],
  bridge: [0, -0.25, 1.0],
  controls: [0.25, -0.2, 1.4],
  neck: [0, 0.55, 0.15],
  head: [0, 0.95, 0.15],
  strings: [0, 0.2, 2.0],
};

const mat = (color, rough = 0.5, metal = 0.05) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function splineShape(points, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'catmullrom', tension);
  return new THREE.Shape(curve.getPoints(160).map((p) => new THREE.Vector2(p.x, p.y)));
}
function polyShape(points) {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}
function outline(mesh, color = PALETTE.paper, opacity = 0.28, angle = 28) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, angle),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  mesh.add(edges);
  return edges;
}

// ── Small text labels that live in the 3D scene: only readable inside the focus window ──
function makeLabel(lines, { width = 256, height = 64, scale = 1.1, align = 'left' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const draw = () => {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, width, height);
    c.textBaseline = 'top';
    c.textAlign = align;
    const x = align === 'left' ? 2 : width - 2;
    c.fillStyle = 'rgba(233,231,242,0.95)';
    c.font = '500 19px "IBM Plex Mono", monospace';
    c.fillText(lines[0], x, 4);
    c.fillStyle = 'rgba(233,231,242,0.62)';
    c.font = '800 15px "Shippori Mincho", serif';
    if (lines[1]) c.fillText(lines[1], x, 28);
    c.font = '400 12px "IBM Plex Mono", monospace';
    if (lines[2]) c.fillText(lines[2], x, 48);
    tex.needsUpdate = true;
  };
  draw();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }));
  sprite.center.set(align === 'left' ? 0 : 1, 0.5);
  sprite.scale.set(scale, (scale * height) / width, 1);
  sprite.userData.redraw = draw;
  return sprite;
}
function leader(from, to, opacity = 0.4) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: PALETTE.paper, transparent: true, opacity }));
}

// ── The printed "01" badge on the body ──
function makeDecal() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const draw = () => {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = 'rgba(233,231,242,0.9)';
    c.textBaseline = 'alphabetic';
    c.font = '800 150px "Shippori Mincho", serif';
    c.fillText('琴', 2, 160);
    c.fillRect(8, 184, 150, 3);
    c.font = '500 17px "IBM Plex Mono", monospace';
    c.fillText('ORPHEUS', 8, 210);
    c.font = '800 18px "Shippori Mincho", serif';
    c.fillText('オルフェウス', 8, 238);
    // hazard strip
    c.save();
    c.beginPath(); c.rect(170, 60, 22, 178); c.clip();
    c.strokeStyle = 'rgba(201,162,90,0.95)'; c.lineWidth = 9;
    for (let y = 40; y < 280; y += 22) { c.beginPath(); c.moveTo(160, y + 26); c.lineTo(202, y); c.stroke(); }
    c.restore();
    tex.needsUpdate = true;
  };
  draw();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.15),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  mesh.userData.redraw = draw;
  return mesh;
}

// ── One vibrating string ──
const STRING_VERT = /* glsl */ `
  uniform vec3 uP0; uniform vec3 uP1;
  uniform float uAmp; uniform float uPhase; uniform float uFretV;
  varying float vEnv;
  void main() {
    float v = position.y + 0.5;                // 0 = nut, 1 = bridge
    vec3 base = mix(uP0, uP1, v);
    float vv = clamp((v - uFretV) / max(1.0 - uFretV, 0.001), 0.0, 1.0);
    float env = sin(3.14159265 * vv);
    vec3 p = base + vec3(position.x, 0.0, position.z);
    p.x += env * uAmp * sin(uPhase);
    p.z += env * uAmp * 0.4 * cos(uPhase * 1.31);
    vEnv = env;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const STRING_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uHot; uniform float uGlow;
  varying float vEnv;
  void main() {
    vec3 c = mix(uColor, uHot, clamp(uGlow * (0.35 + 0.65 * vEnv), 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
  }`;

function buildStrings(group, nutPts, saddlePts) {
  const radii = [0.021, 0.018, 0.015, 0.012, 0.01, 0.009];
  const list = [];
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.CylinderGeometry(radii[i], radii[i], 1, 5, 40, true);
    const material = new THREE.ShaderMaterial({
      vertexShader: STRING_VERT,
      fragmentShader: STRING_FRAG,
      uniforms: {
        uP0: { value: nutPts[i].clone() },
        uP1: { value: saddlePts[i].clone() },
        uAmp: { value: 0 }, uPhase: { value: 0 }, uFretV: { value: 0 }, uGlow: { value: 0 },
        uColor: { value: new THREE.Color(i < 3 ? 0xb9b6cf : 0xd9d7e8) },
        uHot: { value: new THREE.Color(0xffffff) },
      },
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    group.add(mesh);
    list.push({ mesh, u: material.uniforms, amp: 0, glow: 0, phase: Math.random() * 6, speed: 34 + i * 7, decay: 1.6 + i * 0.25 });
  }
  return list;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildProcedural() {
  const model = new THREE.Group();
  const parts = {};
  const part = (name) => { const g = new THREE.Group(); g.name = `part_${name}`; parts[name] = g; model.add(g); return g; };
  const redraws = [];

  const M = {
    body: mat(0x343a78, 0.42, 0.12),
    bodyEdge: mat(0x1a1c3c, 0.6, 0.05),
    guard: mat(0x0d0e1a, 0.35, 0.2),
    neck: mat(0xb4aecd, 0.62, 0.0),
    board: mat(0x17152b, 0.7, 0.0),
    fret: mat(0xd8d6e8, 0.3, 0.4),
    metal: mat(0xbdbbd2, 0.32, 0.45),
    dark: mat(0x11121f, 0.5, 0.2),
    knob: mat(0xe9e7f2, 0.4, 0.05),
    violet: mat(0x7a6ba8, 0.5, 0.1),
    amber: new THREE.MeshBasicMaterial({ color: PALETTE.amber }),
    inlay: new THREE.MeshBasicMaterial({ color: 0x9d94c4 }),
  };

  // ── Body: an original offset double-cut outline ──
  const body = part('body');
  const bodyShape = splineShape([
    [-0.36, 0.86], [-0.6, 1.18], [-0.98, 1.66], [-1.34, 1.46], [-1.56, 0.84], [-1.38, 0.04],
    [-1.5, -0.78], [-1.8, -1.76], [-1.58, -2.86], [-0.78, -3.42], [0.36, -3.4], [1.26, -2.94],
    [1.68, -1.94], [1.42, -0.94], [1.22, -0.2], [1.38, 0.44], [1.16, 1.06], [0.8, 1.1], [0.5, 0.7], [0.36, 0.44],
  ]);
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 4, curveSegments: 24 });
  bodyGeo.translate(0, 0, -0.3);                       // front face ends up at z = 0.13 + bevel → 0.2
  const bodyMesh = new THREE.Mesh(bodyGeo, M.body);
  body.add(bodyMesh);
  // a darker belly stripe + accent pinstripe across the body (painted panels)
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 4.4), new THREE.MeshBasicMaterial({ color: 0x23274f }));
  stripe.position.set(-0.98, -1.2, 0.206); stripe.rotation.z = -0.1;
  body.add(stripe);
  const pin = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 4.3), M.amber);
  pin.position.set(-0.84, -1.2, 0.207); pin.rotation.z = -0.1;
  body.add(pin);
  const decal = makeDecal();
  decal.position.set(-0.98, -2.2, 0.21); decal.rotation.z = -0.1; decal.scale.setScalar(0.92);
  body.add(decal); redraws.push(decal.userData.redraw);
  // back plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.02), M.dark);
  plate.position.set(0, -0.9, -0.375);
  body.add(plate); outline(plate, PALETTE.paper, 0.2);
  // output jack
  const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 12), M.metal);
  jack.position.set(1.52, -2.55, -0.05); jack.rotation.z = Math.PI / 2 - 0.5;
  body.add(jack);

  // ── Pickguard: an angular plate ──
  const guard = part('guard');
  const guardGeo = new THREE.ExtrudeGeometry(polyShape([
    [-0.5, 0.42], [0.62, 0.3], [1.02, -0.1], [1.12, -1.0], [1.46, -1.9], [1.34, -2.72], [0.86, -3.0],
    [0.5, -2.66], [0.56, -2.0], [-0.44, -2.0], [-0.72, -1.7], [-0.72, 0.2],
  ]), { depth: 0.022, bevelEnabled: false });
  guardGeo.translate(0, 0, 0.2);
  const guardMesh = new THREE.Mesh(guardGeo, M.guard);
  guard.add(guardMesh); outline(guardMesh, PALETTE.paper, 0.4);
  [[-0.6, 0.1], [0.92, -0.2], [1.3, -2.6], [-0.6, -1.7], [0.62, -2.6]].forEach(([x, y]) => {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), M.metal);
    s.position.set(x, y, 0.224); guard.add(s);
  });

  // ── Pickups ──
  const pickups = part('pickups');
  const pickup = (y, tilt) => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.5, 0.05), M.knob);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 0.09), M.dark);
    cover.position.z = 0.03;
    g.add(ring, cover); outline(cover, PALETTE.paper, 0.35);
    for (let i = 0; i < 6; i++) {
      for (const dy of [-0.09, 0.09]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), M.metal);
        pole.rotation.x = Math.PI / 2;
        pole.position.set(stringX(i, y), dy, 0.08);
        g.add(pole);
      }
    }
    g.position.set(0, y, 0.24); g.rotation.z = tilt;
    return g;
  };
  pickups.add(pickup(-0.18, 0), pickup(-1.06, 0.07));

  // ── Bridge ──
  const bridge = part('bridge');
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.52, 0.06), M.metal);
  base.position.set(0, G.BRIDGE_Y - 0.1, 0.25);
  bridge.add(base); outline(base, 0xffffff, 0.3);
  for (let i = 0; i < 6; i++) {
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.2, 0.07), M.fret);
    saddle.position.set(SADDLE_X(i), G.BRIDGE_Y - 0.06 + (i % 2) * 0.03, 0.3);
    bridge.add(saddle);
    const ferrule = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), M.dark);
    ferrule.position.set(SADDLE_X(i), G.BRIDGE_Y - 0.28, 0.282);
    bridge.add(ferrule);
  }

  // ── Controls: two knobs + pickup switch ──
  const controls = part('controls');
  const knob = (x, y) => {
    const g = new THREE.Group();
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 20), M.knob);
    k.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), M.dark);
    cap.position.z = 0.071;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.1), M.amber);
    tick.position.set(0, 0.06, 0.073);
    g.add(k, cap, tick);
    g.position.set(x, y, 0.29); g.rotation.z = -0.6;
    return g;
  };
  controls.add(knob(0.86, -1.72), knob(1.12, -2.34));
  const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 8), M.metal);
  sw.rotation.x = Math.PI / 2 - 0.35; sw.position.set(0.5, -2.36, 0.3);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.knob);
  tip.position.set(0.5, -2.325, 0.4);
  controls.add(sw, tip);

  // ── Neck + fretboard ──
  const neck = part('neck');
  const HEEL_Y = 0.12;
  const wAt = (y) => { const t = (G.NUT_Y - y) / (G.NUT_Y - HEEL_Y); return 0.225 + t * 0.085; }; // half width
  const neckGeo = new THREE.ExtrudeGeometry(polyShape([
    [-wAt(HEEL_Y), HEEL_Y], [wAt(HEEL_Y), HEEL_Y], [wAt(G.NUT_Y), G.NUT_Y], [-wAt(G.NUT_Y), G.NUT_Y],
  ]), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
  neckGeo.translate(0, 0, 0.0);
  neck.add(new THREE.Mesh(neckGeo, M.neck));
  const boardGeo = new THREE.ExtrudeGeometry(polyShape([
    [-wAt(HEEL_Y) - 0.035, HEEL_Y], [wAt(HEEL_Y) + 0.035, HEEL_Y], [wAt(G.NUT_Y) + 0.035, G.NUT_Y], [-wAt(G.NUT_Y) - 0.035, G.NUT_Y],
  ]), { depth: 0.045, bevelEnabled: false });
  boardGeo.translate(0, 0, 0.25);
  const board = new THREE.Mesh(boardGeo, M.board);
  neck.add(board); outline(board, PALETTE.paper, 0.22);
  // frets
  const fretGeo = new THREE.BoxGeometry(1, 0.022, 0.016);
  const frets = new THREE.InstancedMesh(fretGeo, M.fret, G.FRETS);
  const m4 = new THREE.Matrix4();
  for (let n = 1; n <= G.FRETS; n++) {
    const y = fretY(n);
    m4.makeScale((wAt(y) + 0.035) * 2, 1, 1).setPosition(0, y, 0.301);
    frets.setMatrixAt(n - 1, m4);
  }
  neck.add(frets);
  // inlays
  [3, 5, 7, 9, 12, 15, 17, 19, 21].forEach((n) => {
    const y = (fretY(n) + fretY(n - 1)) / 2;
    const xs = n === 12 ? [-0.12, 0.12] : [0];
    xs.forEach((x) => {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(n > 12 ? 0.03 : 0.04, 12), M.inlay);
      dot.position.set(x, y, 0.2965); neck.add(dot);
    });
  });
  const nut = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.07), M.knob);
  nut.position.set(0, G.NUT_Y + 0.02, 0.29);
  neck.add(nut);
  // neck plate on the back of the body joint
  const heel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.02), M.metal);
  heel.position.set(0, 0.5, -0.375);
  neck.add(heel);

  // ── Headstock: an angular blade ──
  const head = part('head');
  const headGeo = new THREE.ExtrudeGeometry(polyShape([
    [-0.225, G.NUT_Y - 0.02], [-0.25, 5.02], [-0.44, 5.16], [-0.1, 6.62], [0.1, 6.85], [0.3, 6.7],
    [0.37, 6.28], [0.25, 5.3], [0.225, G.NUT_Y - 0.02],
  ]), { depth: 0.13, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  headGeo.translate(0, 0, 0.06);
  const headMesh = new THREE.Mesh(headGeo, M.body);
  head.add(headMesh); outline(headMesh, PALETTE.paper, 0.3);
  const posts = [];
  const pegs = [];
  for (let i = 0; i < 6; i++) {
    const px = -0.2 + i * 0.07;
    const py = 5.3 + i * 0.225;
    posts.push(new THREE.Vector3(px, py, 0.3));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.13, 10), M.metal);
    post.rotation.x = Math.PI / 2; post.position.set(px, py, 0.27);
    const washer = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), M.fret);
    washer.position.set(px, py, 0.222);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.08), M.metal);
    housing.position.set(px - 0.02, py, -0.01);
    // the peg (shaft + button) is its own group so the tuner can turn it
    const peg = new THREE.Group();
    peg.position.set(px - 0.24, py + 0.045, -0.01);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), M.metal);
    shaft.rotation.z = Math.PI / 2;
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), M.knob);
    button.scale.set(0.75, 1, 0.42); button.position.set(-0.18, 0, 0);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.08), M.amber);
    mark.position.set(-0.18, 0, 0);
    peg.add(shaft, button, mark);
    pegs.push(peg);
    head.add(post, washer, housing, peg);
  }
  const headMark = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.5), M.amber);
  headMark.position.set(0.2, 6.1, 0.222); headMark.rotation.z = -0.1;
  head.add(headMark);

  // ── Strings ──
  const strings = part('strings');
  const nutPts = [], saddlePts = [];
  for (let i = 0; i < 6; i++) {
    nutPts.push(new THREE.Vector3(NUT_X(i), G.NUT_Y + 0.02, 0.33));
    saddlePts.push(new THREE.Vector3(SADDLE_X(i), G.BRIDGE_Y, G.STRING_Z + 0.01));
    // the dead length from the nut to the tuning post
    const a = nutPts[i], b = posts[i];
    const len = a.distanceTo(b);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 4), new THREE.MeshBasicMaterial({ color: 0xb9b6cf }));
    tail.position.copy(a).add(b).multiplyScalar(0.5);
    tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    strings.add(tail);
  }

  // ── In-scene labels ──
  const labels = [];
  const addLabel = (parent, lines, at, to, opts) => {
    const l = makeLabel(lines, opts);
    l.position.set(...to);
    parent.add(l, leader(at, [to[0] + (opts?.align === 'right' ? 0.04 : -0.04), to[1], to[2]]));
    labels.push(l); redraws.push(l.userData.redraw);
  };
  addLabel(head, ['HS-01  TUNERS ×6', 'ヘッド／糸巻', 'RATIO 18:1'], [0.3, 6.3, 0.22], [0.75, 6.5, 0.3]);
  addLabel(pickups, ['PU-A  NECK', 'ピックアップ', '7.9 kΩ'], [-0.5, -0.18, 0.3], [-1.0, 0.36, 0.5], { align: 'right' });
  addLabel(bridge, ['BR-03  SADDLES', 'ブリッジ', 'ACTION 1.8 MM'], [-0.5, -1.7, 0.3], [-1.1, -1.5, 0.5], { align: 'right' });

  // ── Amplifier (songs + settings live here) ──
  const amp = part('amp');
  amp.position.set(6.4, -1.15, -0.7);
  amp.rotation.y = -0.18;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.6, 2.2), mat(0x15172e, 0.7, 0.05));
  amp.add(cab); outline(cab, PALETTE.paper, 0.35);
  // speaker cloth: a dotted grid drawn once into a texture
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const g2 = gc.getContext('2d');
  g2.fillStyle = '#23274f'; g2.fillRect(0, 0, 256, 256);
  g2.fillStyle = '#4a5a8c';
  for (let y = 0; y < 256; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 256; x += 8) g2.fillRect(x, y, 3, 3);
  g2.strokeStyle = 'rgba(233,231,242,0.5)'; g2.lineWidth = 3;
  g2.beginPath(); g2.arc(128, 128, 88, 0, 7); g2.stroke();
  g2.beginPath(); g2.arc(128, 128, 30, 0, 7); g2.stroke();
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc) }));
  grille.position.set(0, -0.5, 1.105); amp.add(grille);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 0.06), M.metal);
  panel.position.set(0, 1.65, 1.12); amp.add(panel); outline(panel, 0xffffff, 0.3);
  const ampKnobs = [];
  for (let i = 0; i < 5; i++) {
    const k = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 18), M.dark);
    cyl.rotation.x = Math.PI / 2;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.17), M.amber);
    tick.position.set(0, 0.1, 0.102);
    k.add(cyl, tick);
    k.position.set(-1.5 + i * 0.62, 1.65, 1.25);
    k.rotation.z = 0.9 - i * 0.45;
    amp.add(k); ampKnobs.push(k);
  }
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), M.amber);
  lamp.position.set(1.85, 1.65, 1.152); amp.add(lamp);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), M.dark);
  handle.position.set(0, 2.42, 0); amp.add(handle);
  [[-2.5, -2.3], [2.5, -2.3], [-2.5, 2.3], [2.5, 2.3]].forEach(([x, y]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 2.26), M.metal);
    c.position.set(x * 0.985, y * 0.985, 0); amp.add(c);
  });

  // ── Recorder pedal (the practice log lives here) ──
  const pedal = part('pedal');
  pedal.position.set(-3.9, -2.2, 0.1);
  pedal.rotation.set(-0.25, 0.2, 0.06);
  const pbody = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.5), mat(0x5a4f8c, 0.5, 0.15));
  pedal.add(pbody); outline(pbody, PALETTE.paper, 0.45);
  const reels = [];
  [-0.4, 0.4].forEach((x) => {
    const reel = new THREE.Group();
    reel.add(new THREE.Mesh(new THREE.RingGeometry(0.1, 0.3, 20), M.dark));
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.56), M.knob); sp.rotation.z = (k * Math.PI) / 3; sp.position.z = 0.002; reel.add(sp); }
    reel.position.set(x, 0.55, 0.256); pedal.add(reel); reels.push(reel);
  });
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.22, 18), M.metal);
  foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.65, 0.34); pedal.add(foot);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), M.amber);
  led.position.set(0, -0.15, 0.256); pedal.add(led);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.05), M.knob);
  strip.position.set(0, 0.05, 0.256); pedal.add(strip);

  // ── Stage: podium + spotlights (only raised for the "coming soon" stop) ──
  const stage = part('stage');
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.5, 6), mat(0x15172e, 0.6, 0.1));
  podium.position.set(0, G.BOTTOM_Y - 0.3, 0); stage.add(podium); outline(podium, PALETTE.paper, 0.5, 1);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.025, 4, 6), M.amber);
  rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.set(0, G.BOTTOM_Y - 0.04, 0); stage.add(rim);
  const beams = [];
  [[-3.6, 0.5, 0x8a78c8], [3.6, -0.5, 0x4a5a8c], [0, 0, 0xe9e7f2]].forEach(([x, tilt, color], k) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(k === 2 ? 2.2 : 1.7, 14, 20, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    cone.position.set(x * 0.5, G.BOTTOM_Y + 7, k === 2 ? -1.5 : 0);
    cone.rotation.z = tilt * 0.5;
    stage.add(cone); beams.push(cone);
  });
  stage.visible = false;

  return { model, parts, nutPts, saddlePts, labels, redraws, anchors: DEFAULT_ANCHORS, pegs, ampKnobs, reels, beams };
}

// A real model, wrapped so it behaves like the procedural one.
async function buildFromGLB(url) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const src = gltf.scene;
  // scale + move so it matches the procedural guitar: neck up, same length
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  const k = G.LENGTH / Math.max(size.y, 1e-6);
  const model = new THREE.Group();
  src.scale.setScalar(k);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  src.position.set(-c.x, G.CENTER_Y - c.y, -c.z);
  model.add(src);
  model.updateMatrixWorld(true);

  const anchors = { ...DEFAULT_ANCHORS };
  const parts = {};
  let nut = null, saddle = null;
  src.traverse((o) => {
    if (o.name.startsWith('anchor_')) {
      const p = o.getWorldPosition(new THREE.Vector3());
      const key = o.name.slice(7);
      if (key === 'nut') nut = p; else if (key === 'saddle') saddle = p; else anchors[key] = [p.x, p.y, p.z];
    }
    if (o.name.startsWith('part_')) parts[o.name.slice(5)] = o;
  });
  // strings sit where the model says the nut and saddle are (or at the default spots)
  const ny = nut ? nut.y : G.NUT_Y, by = saddle ? saddle.y : G.BRIDGE_Y;
  const nz = nut ? nut.z : 0.33, bz = saddle ? saddle.z : G.STRING_Z + 0.01;
  G.NUT_Y = ny; G.BRIDGE_Y = by; G.SCALE = ny - by; G.STRING_Z = (nz + bz) / 2;
  const nutPts = [], saddlePts = [];
  for (let i = 0; i < 6; i++) {
    nutPts.push(new THREE.Vector3(NUT_X(i), ny, nz));
    saddlePts.push(new THREE.Vector3(SADDLE_X(i), by, bz));
  }
  const stringsGroup = new THREE.Group();
  model.add(stringsGroup);
  parts.strings = stringsGroup;
  return { model, parts, nutPts, saddlePts, labels: [], redraws: [], anchors, pegs: [], ampKnobs: [], reels: [], beams: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
export async function loadGuitar({ modelUrl = null } = {}) {
  let built;
  try {
    built = modelUrl ? await buildFromGLB(modelUrl) : buildProcedural();
  } catch (err) {
    console.warn('Model failed to load — using the built-in guitar.', err);
    built = buildProcedural();
  }
  const { model, parts, nutPts, saddlePts, labels, redraws } = built;

  // root is what the stage moves around; the model is centred inside it
  const root = new THREE.Group();
  model.position.y = -G.CENTER_Y;
  root.add(model);
  const anchors = {};
  Object.entries(built.anchors).forEach(([k, v]) => { anchors[k] = new THREE.Vector3(v[0], v[1] - G.CENTER_Y, v[2]); });

  const stringGroup = parts.strings;
  const strings = buildStrings(stringGroup, nutPts, saddlePts);

  // ── Chord dots / markers on the neck ──
  const marks = new THREE.Group();
  stringGroup.add(marks);
  const dotGeo = new THREE.CircleGeometry(0.029, 20);
  const ringGeo = new THREE.RingGeometry(0.02, 0.03, 20);
  const dotMat = new THREE.MeshBasicMaterial({ color: PALETTE.paper });
  const mutedMat = new THREE.MeshBasicMaterial({ color: 0x8f8bb0 });
  const chordMarks = [];
  for (let i = 0; i < 6; i++) {
    const dot = new THREE.Group();
    dot.add(new THREE.Mesh(dotGeo, dotMat));
    const open = new THREE.Mesh(ringGeo, dotMat);
    const muted = new THREE.Group();
    const bar = new THREE.PlaneGeometry(0.07, 0.014);
    const b1 = new THREE.Mesh(bar, mutedMat); b1.rotation.z = Math.PI / 4;
    const b2 = new THREE.Mesh(bar, mutedMat); b2.rotation.z = -Math.PI / 4;
    muted.add(b1, b2);
    [dot, open, muted].forEach((o) => { o.visible = false; marks.add(o); });
    chordMarks.push({ dot, open, muted, k: 0 });
  }
  const liveMark = new THREE.Mesh(new THREE.RingGeometry(0.046, 0.06, 24), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  liveMark.visible = false;
  marks.add(liveMark);

  const noteY = (fret) => (fret <= 0 ? G.NUT_Y + 0.12 : (fretY(fret) + fretY(fret - 1)) / 2);
  const markZ = G.STRING_Z + 0.03;
  let chordPop = 0;

  function setChord(frets) {
    chordPop = 1;
    chordMarks.forEach((m, i) => {
      const f = frets ? frets[i] : null;
      m.dot.visible = m.open.visible = m.muted.visible = false;
      if (f === null || f === undefined) return;
      const which = f === 'x' ? m.muted : f === 0 ? m.open : m.dot;
      const fr = f === 'x' ? 0 : f;
      which.visible = true;
      which.position.set(stringX(i, noteY(fr)), noteY(fr), markZ);
    });
  }
  // colour a string to show a result (ok / problem); null = its normal colour
  const baseCol = strings.map((s) => s.u.uColor.value.clone());
  const TINT = { ok: new THREE.Color(PALETTE.amber), bad: new THREE.Color(0xc2564b), dim: new THREE.Color(0x4a4f72) };
  function setTint(i, kind) {
    const s = strings[i];
    if (!s) return;
    s.u.uColor.value.copy(TINT[kind] || baseCol[i]);
  }
  function setLive(i, fret) {
    if (i === null || i === undefined) { liveMark.visible = false; return; }
    liveMark.visible = true;
    liveMark.position.set(stringX(i, noteY(fret)), noteY(fret), markZ + 0.004);
  }

  // ── String interaction ──
  // Where a ray (in world space) crosses the plane of the strings → string + fret under it.
  const inv = new THREE.Matrix4();
  const ro = new THREE.Vector3();
  const rd = new THREE.Vector3();
  function locate(ray) {
    inv.copy(stringGroup.matrixWorld).invert();
    ro.copy(ray.origin).applyMatrix4(inv);
    rd.copy(ray.direction).transformDirection(inv);
    if (Math.abs(rd.z) < 1e-5) return null;
    const t = (G.STRING_Z - ro.z) / rd.z;
    if (t < 0) return null;
    const x = ro.x + rd.x * t;
    const y = ro.y + rd.y * t;
    return { x, y, facing: rd.z < 0 };
  }
  function hit(ray, margin = 0.07) {
    const p = locate(ray);
    if (!p || !p.facing) return null;
    if (p.y < G.BRIDGE_Y - 0.02 || p.y > G.NUT_Y + 0.3) return null;
    const left = stringX(0, p.y) - margin;
    const right = stringX(5, p.y) + margin;
    if (p.x < left || p.x > right) return null;
    let best = 0, bd = 1e9;
    for (let i = 0; i < 6; i++) { const d = Math.abs(p.x - stringX(i, p.y)); if (d < bd) { bd = d; best = i; } }
    let fret = 0;
    if (p.y < G.NUT_Y) {
      for (let n = 1; n <= G.FRETS; n++) { if (p.y <= fretY(n - 1) && p.y > fretY(n)) { fret = n; break; } }
    }
    // 0 = near the nut (mellow) … 1 = near the bridge (bright)
    const along = (G.NUT_Y - p.y) / (G.NUT_Y - G.BRIDGE_Y);
    return { string: best, dist: bd, fret, x: p.x, y: p.y, along };
  }
  function pluck(i, amp = 1, fret = 0) {
    const s = strings[i];
    if (!s) return;
    s.amp = Math.min(1.4, Math.max(s.amp, amp));
    s.glow = 1;
    const fy = fret > 0 ? fretY(fret) : G.NUT_Y;
    s.u.uFretV.value = (G.NUT_Y - fy) / (G.NUT_Y - G.BRIDGE_Y);
  }
  // keep a string moving (used by LIVE LINK while a real note rings)
  function sustain(i, amp, fret = 0) {
    const s = strings[i];
    if (!s) return;
    s.amp = Math.max(s.amp, amp); s.glow = Math.max(s.glow, 0.7);
    const fy = fret > 0 ? fretY(fret) : G.NUT_Y;
    s.u.uFretV.value = (G.NUT_Y - fy) / (G.NUT_Y - G.BRIDGE_Y);
  }

  let explode = 0;
  const base = {};
  Object.entries(parts).forEach(([name, g]) => { base[name] = g.position.clone(); });
  function setExplode(k) {
    if (Math.abs(k - explode) < 1e-4) return;
    explode = k;
    const e = k * k * (3 - 2 * k);
    Object.entries(parts).forEach(([name, g]) => {
      const v = EXPLODE[name];
      if (!v) return;
      g.position.set(base[name].x + v[0] * e, base[name].y + v[1] * e, base[name].z + v[2] * e);
    });
    labels.forEach((l) => { l.material.opacity = 0.55 + 0.45 * e; });
  }

  function update(dt, calm) {
    let energy = 0;
    strings.forEach((s) => {
      s.phase += dt * s.speed;
      s.amp *= Math.exp(-dt * s.decay);
      s.glow *= Math.exp(-dt * 3.2);
      if (s.amp < 0.002) s.amp = 0;
      s.u.uAmp.value = (calm ? 0.25 : 1) * s.amp * 0.05;
      s.u.uPhase.value = s.phase;
      s.u.uGlow.value = s.glow;
      energy += s.amp;
    });
    if (chordPop > 0) {
      chordPop = Math.max(0, chordPop - dt * 4);
      const k = 1 + chordPop * 0.9;
      chordMarks.forEach((m) => { m.dot.scale.setScalar(k); m.open.scale.setScalar(k); });
    }
    if (liveMark.visible) liveMark.rotation.z += dt * 2;
    pegs.forEach((pg, i) => { pg.rotation.x += (pegTarget[i] - pg.rotation.x) * Math.min(1, dt * 8); });
    if (!calm) built.reels.forEach((r, i) => { r.rotation.z += dt * (i ? -0.6 : 0.6); });
    return energy;
  }

  const redrawText = () => redraws.forEach((fn) => fn());

  // tuning pegs: turn one to an angle (radians); each also gets a focus anchor "peg0"…"peg5"
  const pegs = built.pegs;
  const pegTarget = pegs.map(() => 0);
  pegs.forEach((pg, i) => { anchors[`peg${i}`] = new THREE.Vector3(pg.position.x - 0.1, pg.position.y - G.CENTER_Y, 0.1); });
  function setPeg(i, angle) { if (pegs[i]) pegTarget[i] = angle; }

  // podium + spotlights
  let stageK = 0;
  function setStage(k) {
    if (!parts.stage || Math.abs(k - stageK) < 1e-3) return;
    stageK = k;
    parts.stage.visible = k > 0.01;
    parts.stage.scale.set(1, 1, 1);
    parts.stage.position.y = -(1 - k) * 2.5;
    built.beams.forEach((b) => { b.material.opacity = 0.13 * k; });
  }

  // Where a named part is right now (root space) — follows the exploded view.
  const PART_OF = { peg0: 'head', peg1: 'head', peg2: 'head', peg3: 'head', peg4: 'head', peg5: 'head', headstock: 'head', frets: 'neck', neck: 'neck', pickups: 'pickups', bridge: 'bridge', body: 'body', controls: 'controls' };
  function anchorAt(name, out) {
    out.copy(anchors[name] || anchors.center);
    const v = EXPLODE[PART_OF[name]];
    if (v && explode > 0 && parts[PART_OF[name]]) {
      const e = explode * explode * (3 - 2 * explode);
      out.x += v[0] * e; out.y += v[1] * e; out.z += v[2] * e;
    }
    return out;
  }

  return { root, model, parts, anchors, anchorAt, setPeg, setStage, ampKnobs: built.ampKnobs, strings, hit, pluck, sustain, setChord, setLive, setTint, setExplode, update, redrawText };
}
