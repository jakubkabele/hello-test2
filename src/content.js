// ─────────────────────────────────────────────────────────────────────────────
//  ALL THE WORDS ON THE SITE LIVE HERE.  Edit this file, push, done.
//
//  • "title" arrays = the huge stacked words (one array item per line).
//  • "jp" = the small Japanese subtext (decorative).
//  • cards: what you can open from that stop.
//       open: 'tuner'   → opens the exercise inside the 3D world
//       href: '…'       → temporary bridge to the old screens (until rebuilt here)
//       soon: true      → shown as "coming soon", not tappable
// ─────────────────────────────────────────────────────────────────────────────

export const content = {
  site: {
    pageTitle: 'ORPHEUS 琴 — a guitar that listens',
    name: 'ORPHEUS',
    mark: '琴',                    // the emblem (koto / lyre)
    kana: 'オルフェウス',
    practiceUrl: '/practice/',
  },

  // Start-up screen (the whole thing lasts under 3 seconds)
  boot: [
    ['POWER', 'OK'],
    ['STRINGS', '6 / 6'],
    ['MICROPHONE', 'STANDBY'],
    ['LISTENING CORE', 'ARMED'],
  ],

  hero: {
    no: '00', name: 'Orpheus', jp: 'オルフェウス',
    title: ['IT', 'HEARS', 'YOU.'],
    caption: 'A practice partner that listens to your guitar and tells you the truth. Scroll to choose what to work on.',
    hint: 'Drag = rotate · Tap strings = play · Hold = focus',
  },

  tuner: {
    no: '01', name: 'Tuner', jp: '調弦',
    title: ['TUNE', 'UP.'],
    caption: 'Play a string. Turn the peg until it locks.',
    cards: [
      { code: 'EX-01', name: 'Tuner', line: 'Six strings, one at a time', open: 'tuner' },
    ],
  },

  chords: {
    no: '02', name: 'Chords', jp: '和音',
    title: ['LEFT', 'HAND.'],
    caption: 'Every string of every chord, checked.',
    cards: [
      { code: 'EX-02', name: 'Clean chord check', line: 'Does every string ring?', open: 'cleancheck' },
      { code: 'EX-03', name: 'Chord changes', line: 'Play it, it moves on — how fast, how clean', open: 'changes' },
    ],
  },

  body: {
    no: '03', name: 'Time & pitch', jp: '律動',
    title: ['RIGHT', 'HAND.'],
    caption: 'Strum on the beat. Find any note.',
    cards: [
      { code: 'EX-04', name: 'Keep time', line: 'Hold the beat when the click stops', open: 'keeptime' },
      { code: 'EX-05', name: 'Find the note', line: 'Name it, find it, play it', open: 'findnote' },
    ],
  },

  amp: {
    no: '04', name: 'Amplifier', jp: '増幅器',
    title: ['THE', 'AMP.'],
    caption: 'How strict Orpheus listens.',
    cards: [
      { code: 'SYS-01', name: 'Sensitivity', line: 'Forgiving ↔ exact', open: 'sensitivity' },
      { code: 'SYS-02', name: 'Songs', line: 'Play along', soon: true },
    ],
  },

  pedal: {
    no: '05', name: 'Recorder', jp: '記録',
    title: ['THE', 'LOG.'],
    caption: 'Everything you practise, kept on this device.',
    cards: [
      { code: 'REC-01', name: 'Practice log', line: 'Day by day · progress', open: 'log' },
    ],
  },

  stage: {
    no: '06', name: 'Next on stage', jp: '予告',
    title: ['COMING', 'SOON.'],
    caption: '',
    cards: [
      { code: 'SOON', name: 'Today’s session', line: 'A guided set, built from your log', soon: true },
      { code: 'SOON', name: 'Log export', line: 'Copy your week for a coach', soon: true },
    ],
  },

  // Words used inside the exercises
  ex: {
    // the red full-screen alert = the pause screen of every listening exercise
    halt: { code: 'SYS-HALT', jp: '休止', jpLong: '一時停止', paused: 'Paused', mic: 'Mic still listening — play to carry on' },
    sensitivity: {
      no: 'SYS-01', name: 'Sensitivity', jp: '感度',
      low: 'Forgiving', high: 'Exact', recommended: 'Recommended', done: 'Done',
      levels: [
        { name: 'Relaxed', text: 'Lets small slips go. Wide “in tune” zone.', fit: 'For warming up and just playing.' },
        { name: 'Easy-going', text: 'Only points out clear mistakes: a dead string, a wrong fret.', fit: 'For learning a new chord without being nagged.' },
        { name: 'Balanced', text: 'Catches real mistakes, smooths out small wobbles.', fit: 'For everyday practice.' },
        { name: 'Precise', text: 'Notices quiet strings and small slips. Asks you to pluck the strings a strum can’t prove.', fit: 'For polishing chords you know — quiet room.' },
        { name: 'Maximum', text: 'Calls a string clean only when it rings clearly. Checks every string.', fit: '⚠ So picky it can flag things that sounded fine.' },
      ],
    },
    log: {
      no: 'REC-01', name: 'Practice log', jp: '記録',
      total: 'Played on this device', minutes: 'minutes active', done: 'Done',
      entries: 'rounds', daysPlayed: 'days', dayStreak: 'day in a row', daysStreak: 'days in a row',
      days: 'Day by day', progress: 'Progress', today: 'Today', yesterday: 'Yesterday',
      empty: 'Nothing recorded yet. Play any exercise — it lands here.',
      noProgress: 'Play Chord changes, Find the note or Keep time a few times to see progress.',
      round: 'round', rounds: 'rounds', from: 'from', best: 'best',
    },
    tuner: {
      no: 'EX-01', name: 'Tuner', jp: '調弦',
      start: 'Start listening', stop: 'Stop',
      idle: 'Tap start, then play one string.',
      listening: 'Play a string.',
      flat: 'Too low — tighten', sharp: 'Too high — loosen', ok: 'In tune',
      denied: 'Microphone not available.',
      done: 'All six in tune.',
    },
    cleancheck: {
      no: 'EX-02', name: 'Clean check', jp: '和音確認',
      start: 'Start listening', stop: 'Stop', again2: 'Check again',
      strum: 'Strum', string: 'String by string', chord: 'Chord', auto: 'Auto', autoSub: 'it hears which chord you play',
      loading: 'Waking the ear…', failed: 'Could not load the listening engine — check the connection.',
      denied: 'Microphone not available.',
      idleStrum: 'Tap start, strum a chord.', idleString: 'Tap start, then pluck each string, low to high.',
      listening: 'Listening — strum.', strumOnce: 'Strum the chord once…', hearing: 'Hearing…',
      unclear: 'No clear chord — strum again.',
      clean: 'Clean ✓', oneFix: '1 thing to fix', fixes: 'things to fix', allChecked: 'Clean ✓ every string checked',
      soundedLike: 'Sounded like', compare: 'Compare your fingers with the dots on the neck.',
      faint: 'Faint ✓ = hidden in the strum, can’t be proven.',
      spotTitle: 'Quick check', palm: 'Palm-mute, then pluck', palmAll: 'Palm-mute, then pluck each string.',
      got: 'Got it —', pluck: 'Pluck', spotBtn: 'Check hidden strings',
      cleanOf: 'clean', redo: 'Tap a string to redo it.', again: 'Strum again any time.',
      paused: 'Paused', pausedSub: 'Play when you’re back — the clock is stopped.',
      pausedText: 'Nothing heard for 20 s — the clock is stopped.', resume: 'Resume',
    },
    changes: {
      no: 'EX-03', name: 'Chord changes', jp: '持替',
      start: 'Start', pause: 'Pause', resume: 'Resume', again: 'Again', setup: 'Change settings',
      chords: 'Chords', presets: 'Presets', presetsBtn: 'Pairs · progressions', order: 'Order', loop: 'Loop', random: 'Random',
      fromSong: 'From a song', lastTime: 'Last', newOne: 'New', clean: 'clean',
      denied: 'Microphone not available.', failed: 'Could not load the listening engine.',
      playFirst: 'Play', go: 'Go — the minute is running', welcomeBack: 'Welcome back —', heard: 'Heard', waitingFor: 'waiting for',
      then: 'then', randomNext: 'next: random', changesWord: 'changes',
      paused: 'Paused', pausedText: 'Nothing heard for 20 s — the clock is stopped.', endSave: 'End & save', stop: 'Stop',
      pausedByYou: 'The clock is stopped.', pausedAway: 'You left the screen — the clock is stopped.',
      perMin: 'changes / min', partial: 'Partial round', upFrom: 'Up from', baseline: 'First round with these chords — your baseline.',
      cleanChanges: 'changes clean', avgChange: 'Average change', slowest: 'Slowest', wrongChords: 'times another chord was heard',
    },
    keeptime: {
      no: 'EX-04', name: 'Keep time', jp: '律動',
      start: 'Start', stop: 'Stop', again: 'Again', setup: 'Change tempo',
      how: 'Listen · play along · then keep it going alone. Down-strums on every beat.',
      s1: 'clicks — listen', s2: 'clicks — strum along', s3: 'alone — keep going',
      lastTime: 'Last', newOne: 'New at this tempo', denied: 'Microphone not available.', failed: 'Could not load the listening engine.',
      pListen: 'Listen', pAlong: 'Strum along', pAlone: 'Alone',
      subListen: 'just listen…', subAlong: 'strum on every click', go: 'GO', keepGoing: 'the click is gone — keep going',
      steady: '✓ steady', early: 'early', late: 'late', onTempo: 'on tempo', rushing: 'rushing', dragging: 'dragging',
      tooFew: 'Not enough strums heard in the quiet part — try again, a bit louder.',
      steadyUnit: '% steady', strums: 'strums', upFrom: 'Up from', baseline: 'First round at this tempo — your baseline.',
      evenness: 'Evenness', verySteady: 'very steady', trySlower: 'try a slower tempo', tempo: 'Tempo',
      rushed: 'you sped up', dragged: 'you slowed down', held: 'held it', startedAt: 'You started alone at', click: 'click',
      missedBeats: 'beats with no strum', missedOne: '1 beat with no strum', solid: 'Solid — try',
    },
    findnote: {
      no: 'EX-05', name: 'Find the note', jp: '音探',
      start: 'Start', stop: 'Stop', again: 'Go again', skip: 'Skip this note',
      notes: 'Notes', natural: 'Natural', all: 'All 12', string: 'String', any: 'Any',
      idle: 'A note appears — find it, play it, fast.', anywhere: 'anywhere on the neck', onThe: 'on the', stringWord: 'string',
      thats: 'That’s', paused: 'Paused', pausedSub: 'Play anything to carry on.',
      pausedText: 'Nothing heard for 20 s — the clock is stopped.', resume: 'Resume',
      denied: 'Microphone not available.', failed: 'Could not load the listening engine.',
      nothing: 'Nothing found this time.', average: 'average', stoppedEarly: 'stopped early',
      faster: 'Faster than last time', lastTime: 'Last time', baseline: 'First round in this mode — your baseline.',
      slowest: 'Slowest', fastest: 'Fastest', wrongNotes: 'wrong notes on the way', skipped: 'skipped',
    },
  },
};

// Names shown beside the focus window when it locks onto something.
export const PARTS = {
  headstock: { en: 'HEADSTOCK', jp: 'ヘッド' },
  frets: { en: 'FRETBOARD', jp: '指板' },
  chordbox: { en: 'FRETS 0–5', jp: '指板' },
  fretmap: { en: 'FRETS 0–12', jp: '音位置' },
  strum: { en: 'STRUM ZONE', jp: '弦' },
  neck: { en: 'NECK', jp: 'ネック' },
  pickups: { en: 'PICKUPS', jp: 'ピックアップ' },
  bridge: { en: 'BRIDGE', jp: 'ブリッジ' },
  body: { en: 'BODY', jp: 'ボディ' },
  controls: { en: 'CONTROLS', jp: '操作部' },
  amp: { en: 'AMPLIFIER', jp: '増幅器' },
  pedal: { en: 'RECORDER', jp: '記録' },
  amppanel: { en: 'SENSITIVITY', jp: '感度' },
  center: { en: 'ORPHEUS', jp: '琴' },
  peg: { en: 'PEG', jp: '糸巻' },
};
