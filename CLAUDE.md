# ORPHEUS 琴 — a guitar that listens (repo: hello-test2)

## Purpose
**ORPHEUS** is a guitar practice product (no personal info anywhere — it should be sellable).
One immersive 3D world: you scroll along a guitar rig and each stop holds exercises, which open
*inside* that world. The 3D guitar silently copies what the mic hears.

- Scroll stops: 00 hero · 01 Tuner (headstock) · 02 Chords (fretboard) · 03 Rhythm + Find the note (body)
  · 04 Amp (sensitivity, songs) · 05 Recorder pedal (log) · 06 Stage (coming soon).
- **Being rebuilt into the new style, one step at a time** (see `SESSIONS.md`). Until an exercise is
  rebuilt, its card links to the old plain screens at `/practice/` (the original app, untouched).
- Emblem 琴 (koto/lyre), kana オルフェウス. Keep small text to a minimum — Kuba finds it cluttered.
  Captions stay folded until the big title is tapped. Boot = three "cores" (耳 手 律) that deliberate, then approve.
- **Status:** rebuild steps 1–2 of 4 done (scroll menu, amp/pedal/stage, Tuner, Clean check + Change drill in-world). Next: step 3, Rhythm + Find the note in-world (body).
- Live: https://hello-test2-inky.vercel.app
- Blueprints (exercise behaviour): `docs/blueprint-v1.md`, `docs/blueprint-v2.md`
- Session history + next step: `SESSIONS.md` — read its last section first.

## About me
- Kuba. New to code; I work from my phone only right now.
- Keep replies short. After you build something, explain in 2–3 plain sentences what the code does.
- Explain each new piece of audio logic in plain words.
- I test on a real guitar + phone and report back; treat my reports as the ground truth.

## The site (`/`)

### Tech
- **Vite** build (`npm run dev` / `npm run build` → `dist/`). Plain JS modules, no framework.
- **Three.js** (3D guitar + blur shader), **GSAP ScrollTrigger + Lenis** (scroll story).
  The 3D code is one lazy chunk (`src/three/*`), loaded after the start-up screen is painted.
- Look: retro-futuristic command centre. Near-black `#0B0C14`, indigo `#1E2140`, slate `#4A5A8C`,
  violet `#7A6BA8`, paper white `#E9E7F2`, **one** accent: faded amber `#C9A25A` (focus lock, "good / in tune / clean", warnings).
  Inside exercises only: `--alarm #C2564B` for a wrong string / missed change.
  Type: Anton (huge stacked titles), Shippori Mincho 800 (serif labels + Japanese), IBM Plex Mono (readouts).
- Phone portrait first. Audio starts from the first tap. Respects `prefers-reduced-motion`.

### Where things are
| File | What it does |
|---|---|
| `src/content.js` | **All the words** (name, stops, cards, exercise texts). A card has `open` (in-world exercise), `href` (old screen bridge) or `soon`. |
| `src/config/shots.js` | The scroll storyboard: per "shot" where the focus window rests, which part is pinned there, size/rotation; plus `ex:` shots = camera while an exercise is open |
| `index.html` | Page shell + start-up screen markup |
| `src/main.js` | Entry: builds chapters from content, starts boot, lazy-loads the 3D stage, runs the frame loop |
| `src/core/state.js` | `S` = shared live state (scroll position, focus window rect, sound level…) + tiny event `bus` |
| `src/core/director.js` | Scroll → current shot/chapter (Lenis + ScrollTrigger); scrubs each chapter's entrance timeline; `enter(name)` / `exit()` an exercise (locks scroll, glides camera) |
| `src/core/focus.js` | **Focus window** controller: home / cursor follow / touch drag / gyro tilt / drift / snap to guitar parts / hold-to-focus; moves the HTML frame |
| `src/core/input.js` | Touch + mouse on the stage: strings (tap/strum), drag window, rotate, hold |
| `src/core/layout.js` | Viewport sizes + `homeRect(shot)` |
| `src/three/stage.js` | Renderer, camera, lights, per-frame guitar pose, quality tiers (low/mid/high, auto step-down) |
| `src/three/guitar.js` | Procedural guitar + amp + recorder pedal + stage podium; vibrating strings, chord dots (`setChord`, `'x'` = don't play), string tint (`setTint(i, 'ok'|'bad'|'dim'|null)`), live ring (`setLive`), turnable pegs (`setPeg`), anchors (`amp`, `pedal`, `chordbox` = nut→5th fret, `peg0–5`…). `.glb` swap notes at the top |
| `src/three/guitar-math.js` | Fret / string positions (no Three.js, used by input too) |
| `src/three/backdrop.js` | Background shader (colour field, hex grid, range rings, pluck ripple) + dust |
| `src/three/post.js` | Blur chain + final pass: sharp inside the window, blurred outside; grain, colour fringing, scanlines, vignette |
| `src/audio/engine.js` | Web Audio: Karplus–Strong plucks, ambient hum, UI blips, mute (key `site.muted`), `duck()` = silent while an exercise listens, overdrive |
| `src/audio/livelink.js` | Mic → YIN pitch → `bus` event `live` (hz, level…). Exercises start/stop it |
| `src/chapters/*.js` | `hero.js`, `stop.js` (one generic scroll stop: title + cards), `common.js` = shared title/tag/entrance |
| `src/exercises/*.js` | Exercises that run in the 3D world. `tuner.js` (mic → nearest open string → cents; peg turns, string shakes), `cleancheck.js` (EX-02: strum / string-by-string × auto / pick; chord dots on the neck, strings tinted amber = clean / red = problem, amber ring = string to pluck), `drill.js` (EX-03: setup / run / pause band / summary / calibration views; neck shows the chord to land next, window pulses on each beat) |
| `src/exercises/picker.js` | In-world picker sheet (never the browser's own `<select>`): `createPicker(host).open({ title, jp, value, groups })` → chosen value or null; chord cells get a tiny fingering diagram (`miniDiagram(shape)`); hides the HUD while open |
| `src/exercises/ear.js` | Shared by exercises: **loads the practice app's own engine files** (`/practice/audio.js`, `chords.js`, `timing.js`, `pause.js` → `Sound`, `Chords`, `Timing`, `Pause`) — no copies; mic on the site's audio clock (`openMic`), metronome `playClick`, sensitivity numbers (`profile()`, mirror of `settings.js` chord + drill blocks — keep in step), `addLog` |
| `src/ui/*.js` | `hud` (index, readouts, toggles), `boot`, `cursor`, `keys`, `eggs` (3 hidden things, listed at the top of the file) |
| `src/styles/*.css` | `base` (tokens, focus frame, boot, grain), `hud`, `chapters` (phone first, desktop at the bottom) |
| `public/clips/` | Put practice videos here, then reference them in `content.js` |

### Conventions
- The focus window is one rectangle (`S.win`, whole CSS px) used by both the shader and the HTML frame — never position them separately.
- Layout drives the 3D: a shot says where the window rests; the guitar is moved so the named part sits under it.
- Chapters are fixed layers; `#track` only provides scroll length. No nested scrolling.
- Vertical swipes must always scroll. Sideways drag = rotate / move window; hold = focus.
- While an exercise listens the site makes no sound (`audio.duck(true)`); the guitar only mirrors.
- Exercises share data with the old screens: log `practice.log.v1`, sensitivity `practice.settings.v1` (`sensitivity` 1–5),
  timing calibration `practice.timing.v1`, clean-check / drill settings, unfinished drill round `practice.drill.unfinished`.
- New in-world exercise = `src/exercises/<name>.js` + an `ex:` shot in `shots.js` + `open: '<name>'` on its card + words in `content.ex`;
  set `el.dataset.ex = '<name>'` so it gets `--wx/--wy/--ww/--wh` of its window. Layout: `.ex-read` (big readout beside the window) + `.ex-panel` (controls above `.ex-go`).
- Quality: `?q=low|mid|high` pins the render tier; `?debug` exposes `window.__site`.
- Real phone heights are short (≈680–800 px with the address bar): check `@media (max-height: 760px)` when adding content.

## The old screens (`/practice/`) — reference + temporary bridge

### Tech
- Static files in `public/practice/` — no framework, **no build step** (Vite copies the folder as-is).
  Plain HTML/CSS/JS, scripts loaded in order in `public/practice/index.html`.
- Data stays on the device (localStorage). No accounts, no server. Same origin as the site, so the
  site's log chapter can show a "LOCAL DATA" readout from `practice.log.v1`.
- Look: dark, minimal, near-black `#0E0E0E`, off-white text, soft green accent (= good / in tune),
  muted amber (slightly off) and soft red (wrong). English. Phone portrait, one-handed.
- Audio must start from a tap (phones block it otherwise).

### Files (all in `public/practice/`)
| File | What it does |
|---|---|
| `index.html` | All screens (sections with `data-screen`), script order |
| `app.js` | Hash router (`#/`, `#/tuner`, `#/log`, `#/settings`, `#/exercise/...`), Home + Log screens; stops listeners when leaving a screen |
| `store.js` | Exercise log in localStorage (`practice.log.v1`), grouped by day |
| `settings.js` | Settings screen + listening **sensitivity 1–5** profiles (`Settings.profile()`), key `practice.settings.v1` |
| `audio.js` | `Sound`: mic open/close (`openMic(size)`), audio clock, YIN pitch detection, rms |
| `pause.js` | `Pause`: shared break logic — 20 s without playing = paused (`AFTER_MS`), `playDetector()` hears you start again (loud + rings ≥150 ms) |
| `timing.js` | `Timing`: strum-start detector (`strumDetector()` → exact onset time, rejects clicks/knocks by ring check) + phone-delay calibration (`offset()`, key `practice.timing.v1`); calibration UI lives in the drill (`sessionStorage drill.calibrate = '<return hash>'` opens it from elsewhere) |
| `tuner.js` | Tuner (v1), reads `Settings.profile().tuner` |
| `chords.js` | `Chords`: chord-hearing engine — FFT → semitone bands → note decomposition (note + harmonics model) → chord recognition by fitting 31 known shapes → per-string check; single-pluck matching (`newSound`/`whichNote`) |
| `cleancheck.js` | Clean chord check: Strum / String-by-string × Auto / Pick chord, hidden-string spot check |
| `drill.js` | Chord change drill: pairs, metronome, beat guide (bar + 3·2·1·STRUM), 1-minute rounds, clean changes/min; per strum: timing vs beat (calibrated) + must be the best-matching chord of all shapes → clean / early / late / messy / wrong / missed; calibration screen; auto-pause + resume, unfinished round kept in `practice.drill.unfinished`, partial rounds logged with `score.partial` |
| `findnote.js` | Find the note: random note (natural / all 12, any string or one string), YIN pitch → steady note → reaction time; 10-note rounds; any octave counts |
| `rhythm.js` | Rhythm: 4 patterns on an 8-slot bar (1 & 2 & …), metronome, each strum (Timing, calibrated) matched to nearest slot → on time / early / late / extra, unplayed → missed; 1-min rounds; % on time, avg offset, steadiness |
| `style.css` | All styles |

### Conventions
- Every listening exercise reads its thresholds from `Settings.profile()` (add a block per new exercise to all 5 levels; level 3 = default behavior).
- Every finished exercise writes one entry via `Store.add({ exercise, title, chords, score, summary, activeSec })`.
- Breaks: every listening exercise treats 20 s without playing (`Pause.AFTER_MS`) as a break — clock stops, the screen says "Paused". Fixed, not per sensitivity.
- Drill timing: visuals are shifted by `ctx.outputLatency` so STRUM matches the heard click; strum times are corrected by the calibrated delay. Per-level `drill.timing` (± ms) and `drill.rank` (how close to the best shape).
- Known limit: in a strum, a string an octave above a lower string (e.g. D string in Em) can't be verified — handled by the hidden-string spot check, don't try to "fix" it in the strum analysis.

## Deploy
- Vercel project `hello-test2` (team `jakubkabele1`), linked to GitHub; **every push to `main` deploys** to production.
  Vercel runs `npm run build` and serves `dist/` (see `vercel.json`); other branches get preview links.
- Work branch `claude/hello-test2-repo-9g3mvq`; push to both it and `main`.
- The site overhaul: step 1 on branch `ccr-67fdb530-98eink`, step 2 continues on `ccr-f69829fe-b41sza` (contains step 1). Preview only — it goes to `main` when Kuba says so.

## Testing (no real guitar in the cloud)
- Practice app: synthetic guitar audio (Karplus-Strong plucks/strums, optional phone-mic high-pass) generated with Python/numpy.
  Engine tests in Node (`require('./public/practice/chords.js')`); end-to-end in Playwright Chromium with
  `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`.
- Site: `npm run build && npx vite preview`, then Playwright Chromium with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (software WebGL). Screenshot every shot at
  360×680, 412×800, 390×844 and 1440×900; real touch gestures via CDP `Input.dispatchTouchEvent`.
- In-world exercises: replace `navigator.mediaDevices.getUserMedia` (init script) with a `MediaStreamDestination` on `__site.audio.context` and
  play synthetic strums into it; hook `AudioBufferSourceNode.prototype.start` to learn the metronome click times → strums land exactly on / off the beat.
- Scripts live in the session scratchpad (not committed); recreate as needed.

## Build order (practice app, blueprint v2)
1. ✅ Home + navigation + log storage
2. ✅ Clean chord check (+ strum mode, auto chord, sensitivity, spot check)
3. ✅ Chord change drill
4. ✅ Auto-pause / break handling
5. ✅ Find the note + Rhythm
6. ⏭ Today's session (adaptive rules) + Markdown export
