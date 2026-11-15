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

## Next step
**v2 step 6 — Today's session (adaptive rules) + Markdown export** (blueprint v2). Also queued: drill "Fast changes" mode (see TODO above).
