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

## 2026-11-17 (cont.) — ORPHEUS rebuild step 3: Rhythm + Find the note in-world

### What we built
- **EX-04 Rhythm** opens on the strings where the pick hits them (guitar turned sideways). Setup: big pattern name + arrows, 4 pattern buttons (Half notes, Quarters, Eighths, Pop), tempo − / +, calibration. Run: big count 1 & 2 & … (amber on a strum slot), 8 slot cells that flash on strum slots and get a line underneath (amber on time, white early/late, red missed), status, early/late line, counts, % on time. Every strum you play shakes the 3D strings; the window pulses on the beat. Pause band after 20 s silence (strum to resume, End & save). Same judging as the old screen (engine loaded from `/practice/`).
- **EX-05 Find the note** opens on the neck lying flat (headstock left, frets 0–12). Big note name; when you find it an amber ring sits on the neck where you most likely played it (on your chosen string, else the lowest fret). Choosing one string dims the other five. Natural / All 12, string row, Skip, 10-note rounds, summary (average, slowest / fastest).
- Rhythm's "Calibrate" borrows the drill's calibration: the camera glides to the fretboard, you calibrate, Back glides you back to Rhythm.

### Tests (cloud, synthetic guitar into the site's audio clock)
- Rhythm, Pop @ 70 with 120 ms simulated delay: 108 / 108 on time (+20 ms); 90 ms late → 0 % on time, measured +100 ms.
- Find the note, all 12: 10 / 10 found, a planted wrong note shown ("That's G♯"), logged.
- Calibration hand-off Rhythm → drill calibration → back to Rhythm works. Screens at 390×844, 360×680, 1440×900.

### Open
- Not tested on a real phone/guitar: is the sideways strum zone a nice view, is the flat neck readable on a phone, up-strum detection.

## 2026-11-17 (cont.) — Kuba's real-guitar test: rhythm-based judging doesn't work → Chord changes

### Kuba's report
- App "looks great"; Find the note "amazing — teaches theory I didn't know". Tuner / clean check fine.
- **Everything timed against a click fails on a real phone:** change drill and Rhythm say early / late almost at random, sometimes miss a strum, sometimes hear one twice.
- Why (explained to him): the phone's own delay drifts between runs, Bluetooth headphones add more, quiet up-strums over a ringing chord are hard to pin to a few ms. Pro apps fight this too.

### Decided
- **Merge clean + fast changes into one exercise, "Chord changes"** (his idea): pool of 2+ chords (later: from a saved song, in order), Loop or Random, no metronome. It moves on the moment it hears the target chord; string problems never stop you, they go to the summary. 1-minute rounds, score = changes/min.
- Rhythm → try **"Keep time"** next: click for 2 bars, then silence; judge only how even your strums are and whether you drift (strums compared with each other, so phone delay cancels out). If it still feels wrong, drop rhythm.
- Bluetooth headphones won't help (they add delay); not needed for either.

### Built: EX-03 Chord changes (`src/exercises/changes.js`)
- Setup: chosen chords big; **Chords** = chord chart in multi-select (tap in order, numbers show it, Done); **Presets** = tabs Warm-up / Open → barre / Barre → barre / Progressions (G D Em C, C G Am F …); Order Loop / Random; "From a song" placeholder (soon).
- Run: big chord to play, "then F", the pool with the current one lit, 3D neck shows its dots; strings turn amber / red to show how the last chord rang. Clock starts when the first chord lands; 20 s silence = paused band.
- Hearing: strum detector → ~0.35 s after the strum → "is this the chord I'm waiting for?" (best or near-best of 31 shapes, clearly better than the last chord). If an older chord is still ringing, only what's new since the strum is judged (stops a fading chord from counting — found in testing). Backup check every 0.3 s for strums the detector missed, only on what's new since the last chord landed.
- Summary: changes/min, % clean, average change time, slowest change, top problems per chord ("Am: E string shouldn't ring ×2"), wrong chords heard. Log `chord-changes`.
- Engine tweak (`public/practice/chords.js`, also helps the clean check): an unplayed open string **below the chord's lowest note** (low E under Am) counts as "don't play" at half the usual loudness — it can't be an overtone. No false flags on clean Em / Am / F / C / G.
- Tests (synthetic): Am → F → C loop lands in order; wrong chord shown ("Heard G7 — waiting for C"); "Am + low E" moves on and is flagged in the summary.

### Open
- Real-guitar test of Chord changes: similar chords (C / Am, G / Em) with sloppy strums; speed of moving on.
- The old metronome drill is hidden (card gone) but its code stays for the timing calibration until Rhythm is reworked.

## Same day — Keep time replaces Rhythm; pairs count either way
- Kuba: Chord changes "is good", but Em → Am and Am → Em must count as the same pair. Now results, presets' "last" score and the slowest-change line use the set of chords, in any order; each round also logs avg seconds per pair (`score.pairs`, either direction) — ready for Today's session.
- **EX-04 Keep time** (`src/exercises/keeptime.js`) replaces Rhythm: 4 clicks (listen) → 8 clicks (strum along) → click stops, 30 s alone, down-strums on every beat. Strums compared only with each other: where each one should have landed by the strums around it (evenness, ±ms; score = % within the sensitivity's Rhythm tolerance) and tempo at the start vs end of the quiet part (rushing / dragging). Two hits within a third of a beat = one strum; a ~2-beat gap = one missed beat. Live: your tempo, "on tempo / rushing +4", a bar per strum (amber = even).
- Removed from the site: Rhythm, the metronome change drill and its calibration (no longer needed). The old `/practice/` app still has them.
- Tests (synthetic): steady with ±10 ms jitter, a double hit and a skipped beat → 100 %, ±5 ms, 70 → 70, "1 beat with no strum"; speeding up ~8 % → "71 → 77 BPM, you sped up".
- Note: the % only measures evenness; drifting shows as its own line. If Kuba wants drift to lower the score, change it in `finish()`.

## 2026-11-20 — ORPHEUS rebuild step 4: the redesign is finished

### Kuba
- Chord changes works well on the guitar. Keep time stays as it is for now (drifting doesn't lower the %).
- Finish the redesign so new features are built straight in the new style; go-live decided afterwards.

### What we built
- **Red full-screen alert = the pause screen** (`src/exercises/halt.js`), shared by Chord changes, Clean check and Find the note.
  After 20 s of silence the whole screen washes red: moving hazard stripes top and bottom, a huge PAUSED, how long it's been
  (T+00:22), "Mic still listening — play to carry on", buttons **Resume** and **Stop** (Chord changes: **End & save** once a change counted).
  Playing again closes it on its own. Pausing by hand / leaving the screen shows it with its own line. The striped band is gone.
- **SYS-01 Sensitivity on the amp** (`sensitivity.js`): camera glides to the amp's row of knobs; five knob buttons = levels 1–5
  (name, one-line description, who it's for). The 3D amp knobs turn: every knob up to your level is turned up. They show the saved
  level on the scroll stop too. Same saved setting as before (old screens and every exercise read it).
- **REC-01 Practice log on the pedal** (`log.js`): camera on the recorder pedal, tape reels spin faster. Big "minutes active",
  rounds / days / days in a row, tabs **Day by day** (like the old Log) and **Progress** (each chord set, find-the-note mode and
  keep-time tempo: last score, best, a small graph of the last 12 rounds, "from 14/min ↗").
- No card links to the old `/practice/` screens any more. Stage: "Fast changes" card removed (it became Chord changes), "Log export" added as coming soon.

### Tests (cloud, software WebGL)
- Silent fake mic: Chord changes, Clean check, Find the note → alert after 20 s; Resume closes it; silent again → back after 20 s; Stop / End closes it. No console errors.
- Sensitivity 3 → 5 → 3 saved to `practice.settings.v1`; 3D knobs follow. Log with a seeded week: day list and progress lines right.
- Screens at 390×844, 360×680, 1440×900.

### Open
- Not tested on the real phone: red alert feel, amp close-up readability, log scrolling with a thumb.
- Barre chords still show as single dots on the neck.

## 2026-11-20 (cont.) — features in the new style: songs, chord memory, today's session, export

### Kuba
- Liked the finished redesign. Wanted everything "coming soon" finished. Songs: add **manually only** for now;
  "from my own sources" (screenshots, mp3, mp4) and "from the internet" (song + band + link) later, with **Gemini**
  (it takes video/audio/YouTube directly; free tier key) instead of Claude. Session: pick the length before starting.
  Barre chords: a line across the fretboard. Stage becomes a **Sandbox** later (composer, synth, backing tracks).

### What we built
- **Chord memory** (`chordbook.js`): +88 chords (power, 6, add9, 9, dim, aug, m7♭5, slash, B♭/C#m/Fm/F# … barre) and
  **teach a chord**: tap the fret on each string once → the app hears and checks it like its own. Untaught chords stay
  "not checked" (any strum moves on). Extra chords only take part when an exercise asks for them, so blind recognition
  of everyday chords is unchanged. Flats/sharps and spellings (Bb = A#, Amin = Am) all work.
- **Barre line**: the 3D neck draws a bar across the strings for barre chords (F, Bm, B, F#m, G barre …).
- **Songs** (amp, SYS-02): your list (seeded with the goal songs, names only), song page with sections and chord chips,
  editor (title, artist, sections Verse/Chorus/…, chords from the chart, "More chords", or typed), Play the changes
  (Chord changes in song order, repeats allowed, results kept per song), Hardest change. Add-song menu shows the two
  Gemini options as "soon". Chord changes: "From a song" button works; long songs show a moving window of the sequence.
- **Today's session** (first screen card → stage podium): pick 20 / 45 / 60 min → setlist from the log (tune; clean
  check of the weakest chord; slowest change ×3–4; next level once a change hits 30/min, else second-slowest; Find the
  note; Keep time +5 BPM after 90 %; least-played song or a progression). Each step opens set up, results come back as
  one line, Skip / Again / End, kept for the day. Done → copy today for a coach.
- **Log export** (pedal): "Copy for coach" → Today / Last 7 days / Everything → Markdown → share sheet or clipboard.
- **Sandbox** stop replaces "Coming soon".

### Tests (cloud)
- Chord shapes: all 88 contain exactly the right notes (theory check); 10 new chords strummed (synthetic) → each
  recognised as itself; a plain C is not accepted as Cadd9.
- Songs flow in the browser: add manually, chart chord, "More" chord, typed unknown → teach grid → saved, unknown left
  unchecked; Play → Chord changes opens with the song. Session: plan from a seeded week, steps open set up (F clean
  check, Am ↔ F changes), results counted, back to setlist, end, export. Export Markdown checked. 390×844, 360×680,
  1440×900, no console errors.

### Open
- Real guitar: new chords through the phone mic; taught chords; Chord changes with a song that has unchecked chords.
- Session time estimates (≈4 min per 1-minute round incl. rest) — adjust after Kuba's first real sessions.

**Went live:** Kuba approved the preview → fast-forwarded `main` to `ccr-7376e667-ykiay9` (2026-11-20). The old app stays at `/practice/`.

## 2026-11-20 (cont.) — Gemini: adding songs from your own sources and from the internet

### How it works
- `api/song.js` (Vercel function) holds the Gemini key (`GEMINI_API_KEY`, set by Kuba in Vercel) and talks to Gemini;
  the app never sees the key. `/api/song/?status` says whether the key is there and accepted (never shows it).
- **From my own sources:** screenshots / photos / PDF / mp3 / mp4. The phone shrinks everything first (one request
  may be ≤ ~4.5 MB): pictures → 1600 px JPEG, sound → mono 12 kHz, ≤ 2 min, video → up to 16 still frames + its sound;
  if it's still too big, fewer frames, then shorter sound (it says so). Gemini reads chord sheets / listens / looks.
- **From the internet:** title + band (+ YouTube or web link). Gemini searches chord sites with Google Search, watches a
  YouTube link itself, reads a web link. The sites it used are shown.
- Either way: chords only (no lyrics), JSON, cleaned on the server; the result opens as a **draft in the editor**
  (amber box: unsure chords, Gemini's note, what was cut to fit, sources) — nothing is saved until Save.
- **Capo** field on songs (Gemini fills it if the sheet uses one); Chord changes then listens for the notes that
  actually sound (G shape with capo 2 = A).

### Tests (cloud — Google can't be reached from here, so Gemini was faked)
- Server: 18 checks (status with/without/bad key, key never returned, files inline + JSON schema, lyric line dropped,
  wrong type / too big refused, fenced JSON, sources, YouTube + search, url_context for other links, bad link, 429,
  "couldn't find", retired model → next, other websites refused).
- Browser: screenshot + 150 s audio + 40 s video → 3.6 MB request (frames 16 → 6, audio cut to 76 s, noted), review,
  save; internet path with YouTube link → review with capo 2 → save. Capo hearing: G/C/D shapes with capo recognised.
- Not done here: a real call to Gemini — Kuba checks `/api/song/?status` and tries a song on the phone.

## Next step
1. Kuba tries songs (add a real one), today's session and the export on the phone → fixes.
2. Kuba: open `/api/song/?status` on the preview, then add a real song both Gemini ways → fixes → go live.
3. Sandbox (composer, synth, backing tracks).
