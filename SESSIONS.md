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

## Next step
**v2 step 4 — Auto-pause / break handling** (blueprint v2, "Breaks"):
1. Shared pause logic in `audio.js` (or a small `pause.js`): "no playing heard for ~20 s" → paused; resumes on the next strum/pluck or a tap.
2. Chord change drill: on pause, stop the round clock and metronome, don't count missed changes during silence, show a calm "Paused — play to resume" screen; resume with a count-in. Only active playing time counts.
3. Clean check and tuner: pause the active-time counter during silence (already partly there), show the same paused state.
4. Leaving the screen or locking the phone keeps the session: save an unfinished drill round's progress so it can be resumed (or logged as partial) instead of discarded.
5. Add the 20 s pause threshold to each sensitivity level only if it helps (probably not — keep it fixed).
6. Test with synthetic audio: a drill round with a 30 s silent gap in the middle must score the same as without it.
