# ORPHEUS 琴 — a guitar that listens (repo: hello-test2)

## Purpose
**ORPHEUS** is a guitar practice product (no personal info anywhere — it should be sellable).
One immersive 3D world: you scroll along a guitar rig and each stop holds exercises, which open
*inside* that world. The 3D guitar silently copies what the mic hears.

- Scroll stops: 00 hero (Today's session) · 01 Tuner (headstock) · 02 Chords (fretboard) · 03 Keep time + Find the note (body)
  · 04 Amp (sensitivity, songs) · 05 Recorder pedal (log + export) · 06 Sandbox (coming soon: compose, synth, backing tracks).
- **Being rebuilt into the new style, one step at a time** (see `SESSIONS.md`). Until an exercise is
  rebuilt, its card links to the old plain screens at `/practice/` (the original app, untouched).
- Emblem 琴 (koto/lyre), kana オルフェウス. Keep small text to a minimum — Kuba finds it cluttered.
  Captions stay folded until the big title is tapped. Boot = three "cores" (耳 手 律) that deliberate, then approve.
- **Status:** redesign done (rebuild steps 1–4). Everything opens in-world: Tuner, Clean check, Chord changes, Keep time,
  Find the note, Sensitivity (amp knobs), Practice log (pedal); every listening pause = the red full-screen alert. No card
  links to the old screens any more. Not on `main` yet — Kuba decides when it goes live. New features are built in this style.
- **Features (2026-11-20):** Songs (manual entry; sections; any chord name; teach unknown chords on a fret grid),
  bigger chord memory (+88 shapes), barre line on the neck, Today's session (20/45/60 min, from the log), log export (Markdown).
- **Later:** add a song "from my own sources" (screenshots/PDF/mp3/mp4) and "from the internet" (song + band + link) —
  planned with **Gemini** (takes video, audio, YouTube links); needs a Google AI Studio key in Vercel + a small `/api` function.
  Sandbox on the stage (composer, synth, backing tracks).
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
| `src/content.js` | **All the words** (name, stops, cards, exercise texts). A card has `open` (in-world exercise), `href` (link out, none used now) or `soon`. |
| `src/config/shots.js` | The scroll storyboard: per "shot" where the focus window rests, which part is pinned there, size/rotation; plus `ex:` shots = camera while an exercise is open |
| `index.html` | Page shell + start-up screen markup |
| `src/main.js` | Entry: builds chapters from content, starts boot, lazy-loads the 3D stage, runs the frame loop |
| `src/core/state.js` | `S` = shared live state (scroll position, focus window rect, sound level…) + tiny event `bus` |
| `src/core/director.js` | Scroll → current shot/chapter (Lenis + ScrollTrigger); scrubs each chapter's entrance timeline; `enter(name)` / `exit()` an exercise (locks scroll, glides camera) |
| `src/core/focus.js` | **Focus window** controller: home / cursor follow / touch drag / gyro tilt / drift / snap to guitar parts / hold-to-focus; moves the HTML frame |
| `src/core/input.js` | Touch + mouse on the stage: strings (tap/strum), drag window, rotate, hold |
| `src/core/layout.js` | Viewport sizes + `homeRect(shot)` |
| `src/three/stage.js` | Renderer, camera, lights, per-frame guitar pose, quality tiers (low/mid/high, auto step-down) |
| `src/three/guitar.js` | Procedural guitar + amp + recorder pedal + stage podium; vibrating strings, chord dots (`setChord`, `'x'` = don't play), string tint (`setTint(i, 'ok'|'bad'|'dim'|null)`), live ring (`setLive`), turnable pegs (`setPeg`), anchors (`amp`, `pedal`, `chordbox` = nut→5th fret, `fretmap` = nut→12th, `strum` = pick zone, `peg0–5`…). `.glb` swap notes at the top |
| `src/three/guitar-math.js` | Fret / string positions (no Three.js, used by input too) |
| `src/three/backdrop.js` | Background shader (colour field, hex grid, range rings, pluck ripple) + dust |
| `src/three/post.js` | Blur chain + final pass: sharp inside the window, blurred outside; grain, colour fringing, scanlines, vignette |
| `src/audio/engine.js` | Web Audio: Karplus–Strong plucks, ambient hum, UI blips, mute (key `site.muted`), `duck()` = silent while an exercise listens, overdrive |
| `src/audio/livelink.js` | Mic → YIN pitch → `bus` event `live` (hz, level…). Exercises start/stop it |
| `src/chapters/*.js` | `hero.js`, `stop.js` (one generic scroll stop: title + cards), `common.js` = shared title/tag/entrance |
| `src/exercises/*.js` | Exercises that run in the 3D world. `tuner.js` (mic → nearest open string → cents; peg turns, string shakes), `cleancheck.js` (EX-02: strum / string-by-string × auto / pick; chord dots on the neck, strings tinted amber = clean / red = problem, amber ring = string to pluck), `changes.js` (EX-03 **Chord changes**: no metronome — pool of 2+ chords, loop or random, moves on the moment it hears the target chord; per-string problems collected for the summary; changes/min, avg time per change, % clean, slowest change), `keeptime.js` (EX-04 **Keep time**: 4 clicks listen, 8 strum along, then 30 s alone; strums judged only against each other — evenness vs the line through neighbouring strums, start vs end tempo = rushing / dragging; double hits merged, ~2-beat gaps = missed beat), `findnote.js` (EX-05: neck lying flat frets 0–12; amber ring where the found note was played; chosen string bright, others dimmed) |
| `src/exercises/sensitivity.js` | SYS-01 on the amp's control panel (`amppanel` anchor): 5 knob buttons = levels 1–5, saved to `practice.settings.v1`; the 3D amp knobs turn with it (`guitar.setAmpLevel(n)`, also set on load) |
| `src/exercises/log.js` | REC-01 on the recorder pedal (+ **Copy for coach**: `toMarkdown(list, 'today'|'week'|'all')` → phone share sheet or clipboard, `shareText()`): total active minutes, rounds / days / days-in-a-row, tabs **Day by day** (old Log screen) and **Progress** (one line per repeated thing — chord set, find-note mode, keep-time tempo — last, best, sparkline; partial rounds skipped). Reels spin faster while open (`guitar.setReels`) |
| `src/exercises/halt.js` | The red full-screen **alert** = the pause screen of every listening exercise: `halt.show(owner, { title, text, after, buttons })`, `halt.hide(owner)`, `isShown(owner)`. Hides the HUD; closes on `ex:leave`. Mic keeps listening; the exercise closes it when playing resumes |
| `src/exercises/chordbook.js` | Every chord the site knows: CORE (engine's 31, the only ones in blind recognition) + MORE (88 extra: power, 6, add9, 9, dim, aug, m7♭5, slash, more barre) + TAUGHT (yours, `practice.chords.taught`). `shapeFor(E, name)` (flats/sharps/any spelling), `rank(E, h, extraShapes)`, `findBarre(frets)`, `teach(name, frets)` |
| `src/exercises/songs.js` | SYS-02 on the amp: song list (`practice.songs.v1`, seeded with Kuba's goal songs, names only), song page (sections + chord chips, unknown = dashed "?"), editor (title, artist, sections, chords from the chart / More / typed), fret-grid **teach** sheet. "Play the changes" → Chord changes with the song in order; "Hardest change" = slowest measured pair or a guess. Add-song options 2–3 show "soon · Gemini" |
| `src/exercises/session.js` | SET-00 Today's session (hero card, camera on the stage podium): length 20/45/60 → `buildPlan()` from the log (weakest chord, slowest pair, next level at 30/min, keep-time +5 after 90 %, least-played song). Steps open the exercise set up (`changes:load`, `cleancheck:load`, `keeptime:load` + `director.swap`), count results via the `logged` event, come back on `ex:closed`. Saved per day in `practice.session.v1`. Done → copy today for a coach |
| `src/exercises/picker.js` | In-world picker (never the browser's own `<select>`): a bottom sheet. `chords({ title, value, library, auto })` = chord chart (rows = root C…B, columns = maj · m · 7 · m7 · maj7 · sus2 · sus4, barre underlined, current chord's diagram at the bottom); `list({ title, value, tabs })` = tabs + slim one-line rows. Resolve with the value or null; hides the HUD while open |
| `src/exercises/ear.js` | Shared by exercises: **loads the practice app's own engine files** (`/practice/audio.js`, `chords.js`, `timing.js`, `pause.js` → `Sound`, `Chords`, `Timing`, `Pause`) — no copies; mic on the site's audio clock (`openMic`), metronome `playClick`, sensitivity numbers (`profile()`, mirror of `settings.js` chord / drill / findNote / rhythm blocks — keep in step), `addLog` |
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
  timing calibration `practice.timing.v1`, clean-check / drill / rhythm / find-note settings, unfinished drill round `practice.drill.unfinished`.
- New in-world exercise = `src/exercises/<name>.js` + an `ex:` shot in `shots.js` + `open: '<name>'` on its card + words in `content.ex`;
  set `el.dataset.ex = '<name>'` so it gets `--wx/--wy/--ww/--wh` of its window. Layout: `.ex-read` (big readout beside the window) + `.ex-panel` (controls above `.ex-go`).
- Events: `logged` (every new log entry, from `ear.addLog` and the tuner), `changes:load` / `cleancheck:load` / `keeptime:load` (hand settings to an exercise),
  `director.swap(name)` = leave one exercise and open another.
- Chords: always look shapes up with `chordbook.shapeFor` (never `Chords.LIBRARY.find`), so extra and taught chords work; a chord with no shape is "not checked" (any strum moves on in Chord changes).
- Pauses: 20 s without playing → `halt.show('<exercise>', …)` (Resume + Stop / End & save); playing again → `halt.hide('<exercise>')`.
- Timing against a metronome is unreliable on phones (delay drifts 50–150 ms, Bluetooth adds 150–300 ms; Kuba's real test: "always early or late").
  Prefer exercises that don't need it: judge the chord itself (Chord changes) or strums against each other (Keep time).
  The metronome drill and Rhythm were removed from the site (still in the old `/practice/` app), and with them the timing calibration.
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
- The site overhaul: step 1 on branch `ccr-67fdb530-98eink`, steps 2–3 + Chord changes + Keep time on `ccr-f69829fe-b41sza`,
  step 4 (finished redesign) on `ccr-7376e667-ykiay9` (contains all earlier). Preview only — it goes to `main` when Kuba says so.

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
