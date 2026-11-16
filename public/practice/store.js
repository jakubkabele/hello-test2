// Log storage — every finished exercise is saved on this device (localStorage).
//
// One entry looks like:
// {
//   id: "lq2x8k-3f9a",          unique id
//   ts: "2026-11-12T18:04:00Z", when it was saved
//   date: "2026-11-12",         local calendar day (used for grouping)
//   exercise: "tuner",          tuner | clean-check | change-drill | find-note | rhythm
//   title: "Tuner",             human name
//   chords: [],                 chords involved, e.g. ["Am", "F"]
//   score: null,                exercise-specific numbers, e.g. { changesPerMin: 14 }
//   summary: "Tuned up",        one line shown in the log
//   activeSec: 95               seconds of actual playing (breaks not counted)
// }

const Store = (() => {
  const KEY = 'practice.log.v1';

  function all() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function add(entry) {
    const now = new Date();
    const full = {
      id: now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      ts: now.toISOString(),
      date: localDate(now),
      exercise: '',
      title: '',
      chords: [],
      score: null,
      summary: '',
      activeSec: 0,
      ...entry,
    };
    const list = all();
    list.push(full);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      return null; // storage full or blocked
    }
    return full;
  }

  // Entries grouped by day, newest day first.
  function byDay() {
    const days = new Map();
    all()
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .forEach((e) => {
        if (!days.has(e.date)) days.set(e.date, []);
        days.get(e.date).push(e);
      });
    return [...days].map(([date, entries]) => ({
      date,
      entries,
      activeSec: entries.reduce((s, e) => s + (e.activeSec || 0), 0),
    }));
  }

  function localDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  return { all, add, byDay };
})();
