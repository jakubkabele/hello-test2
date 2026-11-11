// App settings (saved on this device) + the Settings screen.
//
// Listening sensitivity: one level for everything that listens (tuner,
// chord check, future exercises). Each level is a set of numbers the
// exercises read live — change it mid-exercise and it applies at once.

const Settings = (() => {
  const KEY = 'practice.settings.v1';
  const DEFAULT_LEVEL = 3;

  // Level 1 = most forgiving … 5 = most exact. Level 3 = how the app behaved before.
  const LEVELS = [
    {
      level: 1,
      name: 'Relaxed',
      text: 'Like a cheap clip-on tuner. The needle moves slowly and steadily, "in tune" is a wide zone, and the chord check lets small slips go and doesn’t change its mind easily.',
      fit: 'Good for just playing and warming up — not for learning chords in detail.',
      tuner: { inTune: 8, near: 25, history: 11, ease: 0.07, onset: 5, release: 40 },
      // chord: ring/extra = how strictly strings are judged, stick = how sticky the
      // chord name is, focus = how clear a pluck must be, giveUp = ms of silence
      // before a string counts as muted, spot = auto-check hidden strings after a strum
      // drill: mistakes (wrong fret / muted / extra string) and quiet strings still
      // counted as a clean change; margin = how clearly the new chord must beat the old one
      chord: { ring: 0.2, extra: 0.5, stick: 0.3, focus: 0.25, giveUp: 8000, spot: false },
      drill: { mistakes: 99, quiet: 99, margin: 0 },
    },
    {
      level: 2,
      name: 'Easy-going',
      text: 'A friend who only points out clear mistakes: a dead string, a wrong fret, a badly out-of-tune string. Borderline sounds pass.',
      fit: 'Good when you’re learning a new chord and don’t want to be nagged.',
      tuner: { inTune: 6, near: 22, history: 7, ease: 0.11, onset: 4, release: 28 },
      chord: { ring: 0.27, extra: 0.4, stick: 0.18, focus: 0.3, giveUp: 6500, spot: false },
      drill: { mistakes: 1, quiet: 99, margin: 0.03 },
    },
    {
      level: 3,
      name: 'Balanced',
      text: 'Like a good pedal tuner. Catches real mistakes without nagging; small wobbles are smoothed out.',
      fit: 'Recommended for everyday practice.',
      tuner: { inTune: 5, near: 20, history: 5, ease: 0.18, onset: 3, release: 18 },
      chord: { ring: 0.35, extra: 0.3, stick: 0.08, focus: 0.35, giveUp: 5000, spot: false },
      drill: { mistakes: 0, quiet: 99, margin: 0.05 },
    },
    {
      level: 4,
      name: 'Precise',
      text: 'Like a teacher sitting next to you. Notices quieter strings, small fret slips and small tuning drift. After a strum it asks you to pluck the strings a strum can’t check, so every string gets verified.',
      fit: 'Good for polishing chords you already know — best in a quiet room.',
      tuner: { inTune: 4, near: 15, history: 4, ease: 0.26, onset: 2, release: 14 },
      chord: { ring: 0.45, extra: 0.25, stick: 0.03, focus: 0.4, giveUp: 4500, spot: true },
      drill: { mistakes: 0, quiet: 0, margin: 0.08 },
    },
    {
      level: 5,
      name: 'Maximum',
      text: 'As exact as it gets: reacts to every tiny change, only calls a string clean when it rings clearly, and verifies every string after a strum.',
      fit: '⚠ Because it’s so picky it can mark things wrong that sounded fine — especially with background noise or a phone far from the guitar.',
      tuner: { inTune: 3, near: 12, history: 3, ease: 0.35, onset: 2, release: 10 },
      chord: { ring: 0.55, extra: 0.2, stick: 0, focus: 0.45, giveUp: 4000, spot: true },
      drill: { mistakes: 0, quiet: 0, margin: 0.1 },
    },
  ];

  let data = load();

  function load() {
    try {
      return { sensitivity: DEFAULT_LEVEL, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return { sensitivity: DEFAULT_LEVEL };
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }

  function sensitivity() {
    const n = Number(data.sensitivity);
    return n >= 1 && n <= LEVELS.length ? n : DEFAULT_LEVEL;
  }

  // The numbers for the current level, e.g. Settings.profile().tuner.inTune
  function profile() {
    return LEVELS[sensitivity() - 1];
  }

  // ---------- Settings screen ----------
  const listEl = document.getElementById('sens-list');

  function render() {
    const current = sensitivity();
    listEl.innerHTML = '';
    LEVELS.forEach((l) => {
      const b = document.createElement('button');
      b.className = 'sens' + (l.level === current ? ' active' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', l.level === current ? 'true' : 'false');
      b.innerHTML = `
        <span class="sens-head">
          <span class="sens-dots">${dots(l.level)}</span>
          <span class="sens-name"></span>
          ${l.level === DEFAULT_LEVEL ? '<span class="sens-tag">Recommended</span>' : ''}
        </span>
        <span class="sens-text"></span>
        <span class="sens-fit${l.level === LEVELS.length ? ' warn' : ''}"></span>`;
      b.querySelector('.sens-name').textContent = `${l.level} · ${l.name}`;
      b.querySelector('.sens-text').textContent = l.text;
      b.querySelector('.sens-fit').textContent = l.fit;
      b.addEventListener('click', () => {
        data.sensitivity = l.level;
        save();
        render();
      });
      listEl.appendChild(b);
    });
  }

  // Five little bars, filled up to the level — a quick visual of "how picky".
  function dots(level) {
    let s = '';
    for (let i = 1; i <= LEVELS.length; i++) s += `<i class="${i <= level ? 'on' : ''}"></i>`;
    return s;
  }

  return { LEVELS, sensitivity, profile, render };
})();
