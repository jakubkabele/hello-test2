# Blueprint v2 — Practice sessions

> v1 (tuner) works. v2 turns the app into a practice partner that listens,
> runs exercises, logs everything, and adjusts based on how I did.
> Same look as v1: dark, minimal, soft green accent, phone portrait, English.

## Who it's for (me, right now)
- Can play: open chords, single-note riffs, basic strumming, natural + artificial harmonics.
- Can play F and Bm (barre) but **slowly** — they take too long to form.
- **Main problem:** chord changes too slow to play songs at real speed.
- Never practiced **barre → barre** changes.
- **Goal:** solid technique.
- Sessions are long (**1h+**), with breaks: I walk away to drink, pee, rest between exercises.

## App structure
```
┌─────────────────────────┐
│ Home                    │
│                         │
│  Today's session  ▶     │  ← guided, adapted from my log
│                         │
│  Exercises              │  ← pick any one freely
│   · Clean chord check   │
│   · Chord change drill  │
│   · Find the note       │
│   · Rhythm              │
│   · Tuner               │
│                         │
│  Songs                  │  ← my song chord sets
│  Log                    │  ← history + export
└─────────────────────────┘
```

## Exercises

### 1. Clean chord check — string by string
- App shows a chord diagram (e.g. F).
- I pluck each string slowly, low E → high e.
- App marks each string: ✅ clean / ⚠️ buzzing or wrong note / ✖ muted.
- Result: "F — 5/6 clean, B string muted".

### 2. Chord change drill — strummed
- Two (later more) chords + metronome.
- I strum and switch on the beat; app recognizes the strummed chord.
- Counts **clean changes per minute**; tempo goes up when I'm consistent.
- Progression of difficulty:
  1. open → open (warm-up)
  2. **open → barre** (C → F, D → Bm, Am → F …)
  3. **barre → barre** (F → Bm, F → G barre …) — new for me, start slow
- Note: strum recognition only has to be "good enough" — a tolerant match, not perfect.

### 3. Find the note
- App says a note ("G"), I find and play it anywhere on the fretboard.
- Measures reaction time; later: "play G on the A string".

### 4. Rhythm
- Metronome + a strum pattern; app checks if my strums land on the beat (early / late / on time).

### 5. Tuner
- v1 tuner, reachable anytime. Optional "calmer" smoothing toggle.

## Songs
- I add songs myself: name + the chords **I** enter (no scraped tabs/chords).
- Chord change drills can pull pairs from a song ("drill the changes in this song").
- My song list (goals): Strangers (Proderics), Waiting (Leverfall), Stolen Dance (Milky Chance), After Dark (Mr.Kitty), Jane! (The Long Faces), 505 (Arctic Monkeys), Babydoll (Dominic Fike), Bocchi the Rock! songs (That Band, Seisyun Complex, Rockn' Roll, Morning Light Falls on You, Guitar, Loneliness and Blue Planet), The Unknowing (Jfarrari), Waiting Room (Overgrown), Money intro riff (The Drums). Polyphia = far-future goal.

## Today's session (guided + adaptive)
- Built from my log with simple rules (no AI needed):
  - Warm-up: tuner check + clean chord check of yesterday's weakest chord
  - Main block: the change pair with the lowest changes/min
  - Something new now and then (e.g. first barre → barre pair once open → barre is ~X changes/min)
  - Optional: song practice
- After each exercise: short summary ("Am → F: 14/min, up from 11") and what's next.
- I can skip, repeat, or switch to free mode anytime.

## Breaks (important)
- **Auto-pause:** if it hears nothing for ~20 s, the exercise pauses; timer stops.
- Resume by just playing again (or a tap).
- Stats only count active playing time — walking away never ruins a result.
- Session stays open if I leave the screen; nothing lost.

## Log
- Every exercise saved on the device: date, exercise, chords, score, active time.
- Log screen: simple history + trends (changes/min per pair over time).
- **Export as Markdown** (one tap, copy/share) so I can paste it into Claude for coaching feedback.

```
## 2026-11-12 — 64 min active
- Clean check F: 5/6 (B muted)
- Am → F: 14 changes/min (prev 11)
- Find the note: avg 2.1 s
```

## Tech notes
- Still static site on Vercel, data in localStorage (+ markdown export).
- Chord recognition: chroma / pitch-class analysis of the strum, matched against chord templates.
- String-by-string check: reuse v1 pitch detection per pluck.
- Explain each new piece of audio logic to me in plain words.

## Build order (one per session)
1. Home screen + navigation + log storage
2. Clean chord check
3. Chord change drill (strum recognition — hardest part)
4. Auto-pause / break handling
5. Find the note + Rhythm
6. Today's session (adaptive rules) + markdown export

## Done when
- [ ] I can do a full 1h session with breaks and nothing breaks or gets lost
- [ ] Clean check correctly catches a string I mute on purpose
- [ ] Change drill counts my changes roughly like I'd count them myself
- [ ] Log shows progress over several days
- [ ] Export pastes nicely into Claude

## Later (v3+)
- AI-generated exercises from scratch, targeted at my current struggle (via API, using my log)
- Riff / melody practice for the songs
- Harmonics exercises
