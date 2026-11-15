# Guitar practice app (repo: hello-test2)

## Purpose
A phone-first guitar practice partner that listens to me play: tuner, chord
checks, chord change drills, and (later) a guided daily session built from my log.
Started as a pipeline test (Claude Code → GitHub → Vercel → phone); now the real project.

- Live: https://hello-test2-inky.vercel.app
- Blueprints: `docs/blueprint-v1.md` (tuner, done) and `docs/blueprint-v2.md` (practice sessions, in progress)
- Session history + next step: `SESSIONS.md` — read its last section first.

## About me
- Kuba. New to code; I work from my phone only right now.
- Keep replies short. After you build something, explain in 2–3 plain sentences what the code does.
- Explain each new piece of audio logic in plain words.
- I test on a real guitar + phone and report back; treat my reports as the ground truth.

## Tech
- One static site, no framework, no build step. Plain HTML/CSS/JS, scripts loaded in order in `index.html`.
- Data stays on the device (localStorage). No accounts, no server.
- Look: dark, minimal, near-black `#0E0E0E`, off-white text, soft green accent (= good / in tune),
  muted amber (slightly off) and soft red (wrong). English. Phone portrait, one-handed.
- Audio must start from a tap (phones block it otherwise).

### Files
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
- Work branch `claude/hello-test2-repo-9g3mvq`; push to both it and `main`.

## Testing (no real guitar in the cloud)
- Synthetic guitar audio (Karplus-Strong plucks/strums, optional phone-mic high-pass) generated with Python/numpy.
- Engine tests in Node (`require('./chords.js')`); end-to-end in Playwright Chromium with
  `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`.
- Scripts live in the session scratchpad (not committed); recreate as needed.

## Build order (blueprint v2)
1. ✅ Home + navigation + log storage
2. ✅ Clean chord check (+ strum mode, auto chord, sensitivity, spot check)
3. ✅ Chord change drill
4. ✅ Auto-pause / break handling
5. ✅ Find the note + Rhythm
6. ⏭ Today's session (adaptive rules) + Markdown export
