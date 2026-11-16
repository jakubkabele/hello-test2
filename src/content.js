// ─────────────────────────────────────────────────────────────────────────────
//  ALL THE WORDS ON THE SITE LIVE HERE.
//  Edit this file, push, done. Nothing else needs to change.
//
//  • Text in "title" arrays = the huge stacked words (one array item per line).
//  • "jp" = the small Japanese subtext. Purely decorative — delete or change freely.
//  • Anything marked  ← EDIT  is placeholder I made up for you.
// ─────────────────────────────────────────────────────────────────────────────

export const content = {
  site: {
    pageTitle: 'KUBA — STRING UNIT 01',
    callsign: 'KUBA',                 // top-left of the screen
    unit: 'STRING UNIT 01',
    unitJp: '弦楽器操縦者',            // "string instrument operator"
    practiceUrl: '/practice/',        // your practice app (tuner, drills)
  },

  // The start-up screen (keep it short: the whole thing lasts under 3 seconds)
  boot: [
    ['POWER', 'OK'],
    ['STRINGS', '6 / 6'],
    ['TUNING', 'E A D G B E'],
    ['OPERATOR', 'BEGINNER'],
    ['FOCUS SYSTEM', 'ARMED'],
    ['AMPLIFIER', 'WARM'],
  ],

  hero: {
    no: '01',
    name: 'System online',
    jp: '起動',
    title: ['STILL', 'LEARN', 'ING.'],
    caption:
      'Six strings, ten fingers, no talent detected yet. The flight recorder of a beginner on electric guitar.',
    meta: [
      ['OPERATOR', 'KUBA'],
      ['CLASS', 'BEGINNER'],
      ['INSTRUMENT', 'ELECTRIC / 6 STR'],
      ['SINCE', '2026'],                       // ← EDIT
    ],
    warning: 'Operator is a beginner. Expect wrong notes.',
    hint: 'Drag = rotate · Tap strings = play · Hold = focus',
  },

  log: {
    no: '02',
    name: 'Practice log',
    jp: '練習記録',
    title: ['DAY', 'BY', 'DAY.'],
    caption: 'Newest first. Every entry is a small win or an honest failure.',
    // ← EDIT: your journey. Add as many as you like (newest on top).
    entries: [
      { date: '2026.11', code: 'LOG-006', title: 'First clean chord change', note: 'Em → Am without looking at my hand. Twelve changes a minute. It felt like flying.' },
      { date: '2026.11', code: 'LOG-005', title: 'Built my own practice partner', note: 'A tuner and chord drills that listen to me play. Now the phone tells me when I am wrong.' },
      { date: '2026.10', code: 'LOG-004', title: 'Fingertips stopped hurting', note: 'Calluses online. Twenty minutes a day turned out to be enough.' },
      { date: '2026.10', code: 'LOG-003', title: 'Three chords', note: 'Em, Am, C. Slow, buzzy, but recognisable. Somebody asked what song it was.' },
      { date: '2026.09', code: 'LOG-002', title: 'Learned to tune', note: 'E A D G B E. Took forty minutes the first time. Takes one now.' },
      { date: '2026.09', code: 'LOG-001', title: 'First contact', note: 'Bought the guitar. Could not play anything. Played it anyway.' },
    ],
  },

  learning: {
    no: '03',
    name: 'Now learning',
    jp: '学習中',
    title: ['CHORD', 'BANK.'],
    caption: 'Tap a chord — it lights up on the neck and plays. Tap it again to clear. Swipe across the strings to strum.',
    // frets: one number per string, thick E string first. 0 = open, x = not played.
    // status: 'solid' | 'shaky' | 'next'
    chords: [
      { name: 'Em', frets: [0, 2, 2, 0, 0, 0], status: 'solid' },
      { name: 'Am', frets: ['x', 0, 2, 2, 1, 0], status: 'solid' },
      { name: 'C',  frets: ['x', 3, 2, 0, 1, 0], status: 'shaky' },
      { name: 'G',  frets: [3, 2, 0, 0, 0, 3], status: 'shaky' },
      { name: 'D',  frets: ['x', 'x', 0, 2, 3, 2], status: 'shaky' },
      { name: 'F',  frets: [1, 3, 3, 2, 1, 1], status: 'next' },
    ],
    // ← EDIT: what you are working on. value = 0–100.
    skills: [
      { name: 'Chord changes', value: 45 },
      { name: 'Rhythm / strumming', value: 35 },
      { name: 'Notes on the neck', value: 20 },
      { name: 'Barre chords', value: 5 },
    ],
    // ← EDIT
    songs: ['Song one — verse only', 'Song two — the riff', 'Song three — someday'],
    warning: 'F chord ahead. Barre required.',
  },

  clips: {
    no: '04',
    name: 'Practice clips',
    jp: '映像記録',
    title: ['PROOF', 'OF', 'NOISE.'],
    caption: 'Unedited evidence. Mistakes included on purpose.',
    // ← EDIT: put a video in /public/clips/ and write its path in "src",
    //   e.g. src: '/clips/first-riff.mp4'. Or put a YouTube / Instagram address in "link".
    items: [
      { code: 'REC-003', title: 'First riff, 60 bpm', date: '2026.11', src: '', link: '' },
      { code: 'REC-002', title: 'Em → Am changes', date: '2026.10', src: '', link: '' },
      { code: 'REC-001', title: 'Day one. It is bad.', date: '2026.09', src: '', link: '' },
    ],
    empty: 'NO SIGNAL — add a clip in content.js',
  },

  gear: {
    no: '05',
    name: 'The rig',
    jp: '機材',
    title: ['THE', 'RIG.'],
    caption: 'Everything between my fingers and the noise.',
    // ← EDIT: your real gear. "part" = where the focus window flies when you tap the item:
    //   headstock | frets | pickups | bridge | controls | body
    items: [
      { code: 'EQ-01', name: 'The guitar', part: 'body', spec: ['Electric · 6 strings · 22 frets', 'Model: write yours here'] },
      { code: 'EQ-02', name: 'Amplifier', part: 'controls', spec: ['Small practice amp', 'Volume: lower than I would like'] },
      { code: 'EQ-03', name: 'Strings', part: 'bridge', spec: ['10–46 gauge', 'Changed: not often enough'] },
      { code: 'EQ-04', name: 'Picks', part: 'pickups', spec: ['0.73 mm', 'Lost: several'] },
      { code: 'EQ-05', name: 'Phone', part: 'bridge', spec: ['Tuner + practice partner', 'Listens better than I play'] },
    ],
  },

  contact: {
    no: '06',
    name: 'Open channel',
    jp: '通信',
    title: ['SIGNAL', 'OUT.'],
    caption: 'Everything is in focus now. Say hi, send a song I should learn, or tell me my thumb is in the wrong place.',
    // ← EDIT: your real links
    links: [
      { label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' },
      { label: 'Instagram', value: '@yourhandle', href: 'https://instagram.com/' },
      { label: 'YouTube', value: 'your channel', href: 'https://youtube.com/' },
    ],
    practice: 'Enter practice mode',
    practiceNote: 'Tuner, chord checks and drills that listen to you play.',
    sign: 'End of transmission',
    signJp: '通信終了',
  },
};

// Names shown beside the focus window when it locks onto a part of the guitar.
export const PARTS = {
  headstock: { en: 'HEADSTOCK', jp: 'ヘッド' },
  frets: { en: 'FRETBOARD', jp: '指板' },
  neck: { en: 'NECK', jp: 'ネック' },
  pickups: { en: 'PICKUPS', jp: 'ピックアップ' },
  bridge: { en: 'BRIDGE', jp: 'ブリッジ' },
  body: { en: 'BODY', jp: 'ボディ' },
  controls: { en: 'CONTROLS', jp: '操作部' },
  center: { en: 'FULL UNIT', jp: '全体' },
};
