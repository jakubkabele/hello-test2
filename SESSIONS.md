# Sessions

## 2026-11-11 — From "Hello Kuba" to a listening practice app

### What we built
- **Pipeline test:** `index.html` "Hello Kuba" + 440 Hz button → GitHub → Vercel. Connected the repo
  to Vercel (auto-deploy on push to `main`). Live: https://hello-test2-inky.vercel.app
- **v1 Tuner:** YIN pitch detection, Auto / lock-a-string, smoothed needle ±50 cents,
  green / amber / red, silence fades to "—".
- **v2 step 1:** Home screen, hash navigation, back button, exercise log in localStorage, Log screen.
- **v2 step 2: Clean chord check**, rebuilt once after real-guitar feedback:
  - New chord engine (`chords.js`): frequencies → notes (note + harmonics model) → chord name by fitting 31 shapes → per-string check.
  - Strum mode (default) and String-by-string mode; Auto chord or Pick chord.
  - Noise gates: claps/knocks (flat spectrum, no ring) and speech (fits no chord) are ignored.
  - String-by-string: subtracts what was already ringing, matches the pluck to expected notes, credits skipped strings as muted.
  - Hidden-string spot check after a strum (automatic at sensitivity 4–5, button at 1–3).
- **Settings screen** (gear icon): listening sensitivity 1–5 (Relaxed, Easy-going, Balanced*, Precise, Maximum),
  each with a plain-words description; drives tuner zones/smoothing, chord strictness, chord-name stickiness, drill tolerance.
- **v2 step 3: Chord change drill:** preset pairs (warm-up, open→barre, barre→barre) + custom, metronome,
  1-minute rounds, every change judged clean / late / messy / missed, score = clean changes per minute
  vs. last time and best, auto tempo ±5 BPM, logged as "Am → F: 25 changes/min (prev 20) @ 60 BPM".

### What we decided
- Pitch detection: **YIN** (fewer octave mistakes on guitar than plain autocorrelation).
- Strum recognition: match against **known chord shapes** (exact notes + octaves), not 12-note templates — far more reliable in tests (40/46 vs 2/23).
- **False alarms are worse than misses.** Thresholds tuned so clean chords are never flagged at levels 1–3.
- Strings an octave above a lower string can't be proven in a strum (physics). Tried learning a per-guitar balance — rejected (clean vs muted ranges overlap). Solution: **spot check** by plucking those strings.
- **5 sensitivity levels**, one setting for every listening exercise; level 3 = default.
- Drill judges a change **right after the switch beat** (did you land it on time?), with a second look later in the bar for "late".
- Drill tolerance by level: Relaxed = landing the chord counts; Balanced = no wrong-fret/muted/extra strings; Precise/Maximum = spotless.
- Blueprints and project notes now live in the repo (`docs/`, `CLAUDE.md`, `SESSIONS.md`).

### Bugs / open issues
- **Change drill untested on a real guitar and phone.** The metronome click goes out of the phone speaker into the mic — designed to be harmless, unverified. Headphones are safest.
- **No break handling yet:** walking away mid-round counts as missed; leaving the drill screen mid-round discards the round (not logged).
- **Fret buzz isn't detected** as its own problem (shows as clean or muted).
- Hidden-string spot check needs a palm-mute first; if the strum keeps ringing, plucks can be missed.
- Strum mode shows "Didn't catch a clear chord" for background noise — harmless, a bit chatty.
- Log lives only in this browser on this phone (clearing site data erases it). Markdown export comes in step 6.
- Thresholds were tuned on synthetic sounds; expect real-world calibration from Kuba's reports.

## 2026-11-15 — v2 step 4: breaks / auto-pause

### What we built
- `pause.js` (`Pause`): one shared rule — **20 s without playing = paused**; `playDetector()` hears you start again (sound above room noise that keeps ringing ≥150 ms, so knocks don't count).
- **Change drill:** after 20 s of silence the round pauses (metronome + clock stop). The silent changes since you last played are thrown away, not counted as missed. Play any chord (or tap Resume) → 4-beat count-in, continues from the next change. Stop button is now **Pause**; paused screen offers Resume / End round & save / Discard.
- Unfinished round is saved on the phone (`practice.drill.unfinished`): leaving the screen, locking the phone or closing the app pauses it; Home shows "paused" next to the drill. Older than 3 h → saved as a partial round automatically.
- Partial rounds are logged ("… · partial, 35 s"), scored on played time only, and don't change tempo or count as "last time"/best.
- If the round ends while you've been silent ≥ 8 s, it pauses instead of counting the silence.
- Clean check + tuner: show "Paused" after 20 s of silence (their active-time clocks already only count playing).

### Bugs / open issues
- Untested on a real phone: does the speaker click ever count as "playing" and block the pause? (In tests a click + room noise is rejected as noise.)
- Talking near the phone while paused can resume the drill (speech rings like a note). It just pauses again after 20 s.

### Same day — drill accuracy (after Kuba's real-guitar test)
Kuba's report: pause works (manual + auto). Drill said "late" even when on time or early; open strings counted as clean (on Relaxed); unclear when to strum.

Causes found: (1) the app ignored phone audio delay (click plays late, mic hears late) and judged a fixed window after the beat, so on-time strums fell to the "late" check; it never measured *when* you strummed. (2) It only compared new vs old chord, never "is this actually the chord".

Built:
- `timing.js`: strum-start detection (exact onset, ring check rejects clicks/knocks) + **calibration** (strum on 8 clicks → phone delay saved; redo from drill setup or Settings).
- Drill judges each strum: timing vs beat → clean / early / late with ms; chord must be the best (or near-best, per level `rank`) of all 31 shapes → else "wrong chord" (open strings fail at every level). Relaxed now forgives 1 string slip, not a different chord.
- Beat guide: filling bar + big 4·3·2·1·STRUM + beat lights "3 · 2 · 1 · ●" where the big green dot (labelled with the next chord) flashes on the strum beat — same lights on the calibration screen (shifted by output latency to match the heard click). Fixed: the big counter was writing into the hidden calibration screen. Timing line with the on-time zone and where your strum landed, one-line "how it's judged".
- Summary: average timing ("you tend to strum 120 ms late"), early / late / wrong / missed counts.
- Tests (fake guitar, 120 ms mic delay): on time 14/14 clean (−18 ms); 200 ms early → 14 early (≈197 ms); 300 ms late → 14 late (≈318 ms).

### Kuba's feedback after the beat lights
- Drill works; timing "still a little weird" (maybe him) — watch it, ask again after more practice.
- **TODO — drill "Fast changes" mode:** a second drill type: no perfect-change judging, just count how many times you switch between the two chords per minute (no metronome / free tempo). More forgiving on string quality, but it must recognise a chord change *fast* (right after each strum). Score = changes per minute. (The classic "one-minute changes" exercise.)

## 2026-11-15 (cont.) — v2 step 5: Find the note + Rhythm

### What we built
- **Find the note** (`findnote.js`): app shows a note (natural or all 12; any string or one chosen string), you play it; YIN pitch held steady for a few frames (per-level `findNote.cents` / `hold`) → reaction time. Any octave counts. Wrong notes shown ("That's A — looking for G"), previous note still ringing is ignored. 10-note rounds, avg time vs last time in the same mode, slowest/fastest notes. 20 s silence → pause, resumes with a fresh note.
- **Rhythm** (`rhythm.js`): 4 patterns on an 8-slot bar (Half notes, Quarters, Eighths, Pop ↓ ↓↑ ↑↓↑), 40–140 BPM, 1-min rounds. Each strum → nearest slot → on time (per-level `rhythm.timing`, Balanced ±60 ms) / early / late / extra; unplayed slots → missed. Slots light up and flash green on strum slots; counts + timing line live. Summary: % on time, average offset, steadiness (spread). Uses the drill's calibration (button opens it and returns).
- **Strum detector improved** (`timing.js`, also used by the drill): confirms a strum by its pick-attack brightness ~70 ms after the start (soft up-strums over a ringing chord now count), compares with the level just before the strum, and drops a click at once so a strum right after it keeps its own start time.

### Tests (fake guitar, 120 ms mic delay)
- Find the note: 10/10 found any-string and low-E all-12; times = play delay + ~0.13 s; wrong notes caught.
- Rhythm Pop @70: on time 97–100%; 90 ms late → all late (measured +92); 80 ms early → all early (−78); eighths over a quarter pattern → 80 extras flagged.
- Drill still: on time 14/14 clean; 300 ms late → measured +303.

### Open
- Rhythm can't tell down- from up-strums (only timing).
- Untested on the real guitar: up-strum detection, speaker click, Find the note on low strings through the phone mic.

## 2026-11-16 — The site: immersive front door (practice app moved to `/practice/`)

### What we built
- The practice app is **unchanged**, now at `/practice/` (files in `public/practice/`). Same address → the log and calibration on the phone are kept.
- New front door at `/`: a retro-futuristic "command centre" around a **3D guitar built from simple shapes** (Three.js), scroll-driven (GSAP ScrollTrigger + Lenis). Vite build.
- **Focus window** (signature effect): the scene is drawn once, a shader blurs and grains everything outside one rectangle; inside it the same picture stays sharp. An HTML frame (corner marks, readouts) sits on exactly the same rectangle. It rests on a guitar part per scene, follows the cursor (desktop), can be dragged (touch), sways with phone tilt or drifts, snaps to guitar parts, and hold = whole picture pulls into focus. Scene changes dissolve through blur.
- 6 chapters / 8 scroll "shots": 01 hero (STILL LEARNING.) → 02 log (headstock, front + back) → 03 chord bank (fretboard; chord dots on the 3D neck) → 04 clips (16:9 window = video screen) → 05 gear (exploded guitar; pickups → bridge) → 06 contact (window fills the screen: everything sharp).
- **Playable strings**: tap = pluck (fret under the finger counts), swipe across = strum; with a chord selected the strum plays that chord. Sound = Karplus–Strong (noise burst looped at one wavelength, softened each lap). Strings shake, a ripple runs through the hex grid, colour fringing pulses, oscilloscope in the HUD.
- Sound design: quiet amp hum, UI blips; starts on first tap; `SND` toggle (remembered).
- HUD: section index on the right edge (+ `PR` → practice app), live readouts (scene, progress, rotation, last note, signal), keyboard shortcuts on desktop (`?` shows them), custom cursor.
- **Surprise — LIVE LINK** (`LINK` button): the site listens through the mic with the practice app's YIN pitch detector; the matching string shakes on the 3D guitar, a ring marks the fret, the panel shows note / Hz / cents (amber when in tune).
- Log chapter also shows a small "LOCAL DATA" line read from the practice app's real log on that device.
- Boot sequence ≈2.1 s, tap/key to skip. 3 easter eggs (see top of `src/ui/eggs.js`).
- All text in **`src/content.js`**; storyboard numbers in `src/config/shots.js`.
- Performance: 3 quality tiers (pixel ratio ≤ 2, anti-aliasing, dust count, colour fringing), picked by device and stepped down automatically if the frame rate stays low; flat CSS fallback without WebGL; calmer mode for reduced motion (no smooth scroll, no drift, static grain, instant boot).

### Tests (cloud, software WebGL — no real phone)
- Screens checked at 360×680, 412×800, 390×844, 1440×900; no console errors.
- Real touch gestures: swipe up on the window or anywhere → scrolls; sideways on window → window moves; hold-then-drag → window moves any direction; sideways elsewhere → guitar rotates.
- Tap string → pluck; swipe → 5–6 plucks; chord tap → dots + strum; hold → focus 0→1→0; mute persists; index + keys jump; eggs fire.
- LIVE LINK with a fake 110 Hz guitar pluck as the mic → "A2, string 5, fret 0, +3 cents".
- `.glb` path: exported the built-in guitar to .glb and loaded it back through `loadGuitar({ modelUrl })` — loads, scales, strings + chord dots drawn on top (needs `anchor_nut` / `anchor_saddle` empties to line up with a differently proportioned model).
- Practice app at `/practice/`: home, routes and log storage work.

### Open
- **Not tested on a real phone**: frame rate on mid-range Android, gyro tilt feel, sound level of the hum, touch feel of strumming. Kuba to report.
- Content is placeholder: log entries, gear, clips (no videos yet), contact links → edit `src/content.js`.
- Lives on branch `ccr-67fdb530-98eink` (Vercel preview). **Not on `main` yet** — waiting for Kuba's OK.

## 2026-11-16 (cont.) — ORPHEUS 琴: product, not personal site (rebuild step 1)

### Kuba's feedback on the first preview
- Loves: the model, slow reveal by scrolling, playable strings everywhere, the focus box (auto lock / manual / return), boot sequence, grain + blur.
- Wrong direction: no personal info (name, journey) — it should look commercial/sellable. Scrolling should show the **exercises**. Opening practice must not break the immersion. Too much small text.
- Name chosen: **ORPHEUS**, emblem **琴**.

### Plan (4 steps, Kuba tests after each)
1. ✅ New scroll menu + amp + recorder pedal + stage, Tuner in-world.
2. ⏭ Clean chord check + chord change drill in-world (fretboard).
3. Rhythm + Find the note in-world (body).
4. Log (pedal), sensitivity (amp knobs), red full-screen "alert" as the pause screen.

### Built in step 1
- All personal content removed; HUD = 琴 ORPHEUS + sound switch + index + thin bottom strip. Focus frame shows only state + target. LINK button removed (exercises use the mic now).
- Scroll stops: hero "IT HEARS YOU." → Tuner (headstock) → Chords (fretboard, Em shown) → Time & pitch (body) → Amp → Recorder pedal → Stage ("coming soon" podium + spotlights). Cards open an exercise in-world (`open`), bridge to the old screen (`href`) or show SOON.
- New 3D props: amp (5 knobs for the future sensitivity setting), recorder pedal (turning reels), podium + light beams.
- **Tuner in-world**: camera glides to the back of the headstock, scroll locks, site goes silent. Mic → pitch → nearest open string (or the one picked) → cents, steadied by taking the middle of the last 5 readings. Focus window locks onto that string's peg, the peg turns with the error, the string shakes. In tune for 0.7 s (tolerance from the sensitivity level) = string ticked. Writes a log entry like the old tuner.

### Tests (cloud)
- Fake 110 Hz pluck as mic → "A, +3 ¢, In tune", window on PEG 5, string ticked, log "Tuned 1 of 6 strings"; scroll locked while open; exit returns to the stop. No console errors at 390×844 and 360×680.

### Open
- Not tested on a real phone/guitar (tuner feel, peg direction, frame rate with amp + pedal).
- Chords / Rhythm / Find the note / Log / Sensitivity cards still open the old plain screens.
- Still on branch `ccr-67fdb530-98eink` (preview). Not on `main`.

### End-of-day additions (after Kuba's look at step 1: "overall it's great")
- **Small text folded away**: the caption under each big title is hidden until you tap the title (a small amber `+` after the last word shows it can open; `−` when open). Closes again when you scroll to another stop. Code: click handler in `src/main.js`, `.ch.is-open .cap` in `chapters.css`.
- **Boot restyled like a deciding supercomputer** (own design): three cores — 耳 EAR, 手 HAND, 律 TIME — flicker "審議中" (deliberating), then turn solid "承認" (approved) one by one, then all go amber with "ORPHEUS ONLINE". Hazard stripes above and below. Still ≈2.7 s, tap to skip. Markup in `index.html`, timing in `src/ui/boot.js`, styles at the end of `base.css`.
- Known nit: the core kanji use the Japanese font, which loads a moment late — on a slow connection they may appear in the phone's own font for the first instant.

## 2026-11-17 — ORPHEUS rebuild step 2: chords in-world

### What we built
- **EX-02 Clean check** and **EX-03 Change drill** now open inside the 3D world (cards on the Chords stop). The camera glides to a close-up of the first five frets (`chordbox` anchor).
- The hearing engine is **not copied**: `src/exercises/ear.js` loads the practice app's own `audio.js`, `chords.js`, `timing.js`, `pause.js` from `/practice/`. Same rules, same thresholds, same saved data (log, sensitivity, calibration, settings, unfinished round).
- **Clean check:** big chord name beside the window, the chord's dots on the 3D neck, the strings you play shake, and each string turns **amber (clean)** or **red (problem)**; a row of six string cells repeats it with ✓ / ! / ✕. String-by-string: an amber ring sits on the string + fret to pluck next; tap a string cell to redo it. Strum / String-by-string switch + chord picker (Auto or any of 31). Hidden-string spot check button (automatic at Precise / Maximum). Paused after 20 s silence.
- **Change drill:** setup (pair picker with warm-up / open→barre / barre→barre + own pair, tempo − / +, change every 2 / 4, click, auto tempo, calibrate), run (beat lights 3·2·1 + big dot with the chord, bar, status, early/late line, history squares), summary (big changes/min, comparison, details, next tempo), calibration. The **big chord name, the big dot and the dots on the neck all show the chord to land next**; the focus window pulses on every beat. Pause = a striped warning band (Resume / End & save / Discard) — step 4 turns it into the red alert.
- 3D: `setTint()` colours a string. New colour `--alarm` (only inside exercises).

### Tests (cloud, software WebGL, synthetic guitar fed straight into the site's audio clock)
- Clean check strum (Auto): Em, C, F → clean ✓; Em with a dead G string → G string flagged (heard as E, "G string quiet"). String-by-string Em → 6/6 clean. Both logged.
- Drill Am ↔ F @ 60, 120 ms simulated phone delay: on time → 11 clean + the 3 planted wrong chords caught (avg +21 ms); 300 ms late → 14 late (+320); 200 ms early → 14 early (−182).
- Pause: silence → paused band after 20 s; strumming again → count-in "Welcome back"; leaving keeps the round; End & save → partial logged. Calibration: 8 strums at +120 ms → saved 133 ms, then the round starts.
- Screens at 390×844, 360×680, 1440×900; no console errors.

### Same day — Kuba: "I like it", but choosing a chord / pair opened the phone's grey dropdown
- Kuba then: menus "a bit hectic" → compress + give them order. Now: chord picker = **chord chart** (one row per root C D E F F# G A B, one column per type maj · m · 7 · m7 · maj7 · sus2 · sus4; barre chords underlined; fits one screen), pair picker = **tabs by level** (Warm-up · Open → barre · Barre → barre · Own) with slim one-line rows + last score. On phones it's a bottom sheet (thumb reach), the guitar stays visible above.
- First version (replaced): Replaced every dropdown with an **in-world picker sheet** (`src/exercises/picker.js`): slides up full-screen with the amber hazard stripe; chords as a grid of cells (big name + tiny fingering diagram, Open / Barre groups, current one amber); pairs as two-column rows grouped warm-up / open→barre / barre→barre with your last score per pair; "My own pair" asks From, then To. ✕ or Esc closes without changing anything.

### Open
- Not tested on a real phone/guitar: is the fretboard close-up readable, are tinted strings clear enough, metronome loud enough, frame rate during the drill.
- Barre chords show as single dots (no bar drawn on the neck yet).
- Still on branch preview (not `main`).

## Next step
1. Kuba tests step 2 on the phone + guitar (clean check both modes, a drill round, calibration, pause) → fix what he reports.
2. **Rebuild step 3: Rhythm + Find the note in-world** on the body. Same pattern: `src/exercises/<name>.js` using `ear.js` (engine from `/practice/`), an `ex:` shot, `open:` on the card.
3. Then step 4 (log on the pedal, sensitivity on the amp knobs, red full-screen "alert" as the pause screen — the drill's pause band is the placeholder).
4. When Kuba says "go live": merge the redesign branch into `main`.
