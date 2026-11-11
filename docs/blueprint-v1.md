# Blueprint v1 — Guitar app (working name: TBD)

> The most basic version. One screen, one job: **a tuner that hears me play.**
> Everything else comes in later versions.

## Scope of v1
- ✅ Note detector / tuner
- ❌ Not in v1: chord checker, chord library, practice log, AI feedback, accounts

## Target
- **Device:** phone, portrait, works one-handed
- **Language:** English
- **Name:** placeholder ("Tuner" in the header) — real name decided later

## Look
- **Dark, minimal.** Near-black background (#0E0E0E-ish), off-white text.
- **Accent: soft green** — also means "in tune".
- Off-pitch states: muted amber (slightly off) → soft red (far off). No harsh colors.
- Lots of empty space, one clean sans-serif font, no clutter, no decorations.
- Smooth, subtle needle motion (no jitter).

## Screen layout
```
┌─────────────────────────┐
│ Tuner                   │  ← small header
│                         │
│                         │
│           A             │  ← huge note letter (color = in tune state)
│         110 Hz          │  ← small frequency readout
│                         │
│   ♭  ─────┃─────  ♯     │  ← needle/bar, center = in tune
│         -3 cents        │
│                         │
│  [Auto] E A D G B E     │  ← mode row: Auto (default) or lock a string
│                         │
│     [ Start listening ] │  ← mic permission starts here
└─────────────────────────┘
```

## Behavior
1. **Start:** tap "Start listening" → browser asks for mic permission → tuner runs.
   (Audio must start from a tap — phones block it otherwise.)
2. **Auto mode (default):** play any string → detects closest note (E2 A2 D3 G3 B3 E4), shows note, Hz, cents off.
3. **Manual mode:** tap a string (e.g. "D") → tuner locks to that target, needle shows distance from it.
4. **Feedback, all three combined:**
   - Note letter
   - Needle (flat ← center → sharp), range ±50 cents
   - Color: green = within ±5 cents, amber = ±5–20, red = beyond ±20
5. **Silence:** when nothing is playing, fade to a dim "—" instead of flickering random notes.
6. **Standard tuning only** (E A D G B E) for v1.

## Tech
- One static site: `index.html` + `style.css` + `app.js` (no framework, no build step)
- Web Audio API + pitch detection (autocorrelation or YIN — pick the more stable one for guitar and explain why)
- Smoothing so the needle doesn't jump
- No data saved in v1
- Deployed on Vercel, code on GitHub

## Done when (my tests)
- [ ] Opens on my phone from the Vercel link
- [ ] Mic permission works on first tap
- [ ] Open A string shows **A**, ~110 Hz
- [ ] Turning a tuning peg moves the needle smoothly the right way
- [ ] Green appears when in tune
- [ ] Manual mode locks to the chosen string
- [ ] Silence shows "—", no random flicker
- [ ] Looks clean — nothing I'd want to fix visually

## Next versions (ideas, not now)
- v2: chord checker
- v3: practice log + progress
- v4: smart exercises from weak spots
- later: AI tutor feedback
