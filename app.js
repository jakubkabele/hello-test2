// App shell — screen navigation (hash routes) and the Home / Log screens.
//
// Routes:
//   #/                  Home
//   #/tuner             Tuner
//   #/log               Log
//   #/settings          Settings (listening sensitivity)
//   #/songs             Songs           (coming later)
//   #/today             Today's session (coming later)
//   #/exercise/clean-check  Clean chord check
//   #/exercise/change-drill Chord change drill
//   #/exercise/<id>     Other exercises (coming later, one per build step)

const ROUTES = {
  '':                        { screen: 'home',  title: 'Home' },
  'tuner':                   { screen: 'tuner', title: 'Tuner' },
  'log':                     { screen: 'log',   title: 'Log' },
  'settings':                { screen: 'settings', title: 'Settings' },
  'songs':                   { screen: 'soon',  title: 'Songs',              soon: 'Add your songs and their chords here — coming in a later step.' },
  'today':                   { screen: 'soon',  title: "Today's session",    soon: 'A guided session built from your log — coming in step 6.' },
  'exercise/clean-check':    { screen: 'clean-check', title: 'Clean chord check' },
  'exercise/change-drill':   { screen: 'change-drill', title: 'Chord change drill' },
  'exercise/find-note':      { screen: 'soon',  title: 'Find the note',      soon: 'Find a note anywhere on the fretboard — coming in step 5.' },
  'exercise/rhythm':         { screen: 'soon',  title: 'Rhythm',             soon: 'Strum with the metronome and check your timing — coming in step 5.' },
};

const screens = document.querySelectorAll('.screen');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
let depth = 0; // how many screens deep we navigated inside the app

function currentPath() {
  return location.hash.replace(/^#\/?/, '');
}

function render() {
  const path = currentPath();
  const route = ROUTES[path] || ROUTES[''];

  // Leaving a screen that listens always turns the mic off.
  if (route.screen !== 'tuner') Tuner.stop();
  if (route.screen !== CleanCheck.screen) CleanCheck.stop();
  if (route.screen !== Drill.screen) Drill.stop();

  screens.forEach((s) => (s.hidden = s.dataset.screen !== route.screen));
  titleEl.textContent = route.title;
  backBtn.hidden = route.screen === 'home';
  document.getElementById('gear').hidden = route.screen === 'settings';
  document.title = route.screen === 'home' ? 'Practice' : route.title;

  if (route.screen === 'home') renderHome();
  if (route.screen === 'log') renderLog();
  if (route.screen === 'settings') Settings.render();
  if (route.screen === CleanCheck.screen) CleanCheck.show();
  if (route.screen === Drill.screen) Drill.show();
  if (route.screen === 'soon') document.getElementById('soon-text').textContent = route.soon;

  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  depth = currentPath() === '' ? 0 : depth + 1;
  render();
});

backBtn.addEventListener('click', () => {
  // Use real "back" when we came from inside the app, so the phone's
  // back gesture and this button behave the same way.
  if (depth > 0) history.back();
  else location.hash = '#/';
});

// ---------- Home ----------
function renderHome() {
  const n = Store.all().length;
  document.getElementById('log-count').textContent = n ? String(n) : '';
}

// ---------- Log ----------
function renderLog() {
  const days = Store.byDay();
  const list = document.getElementById('log-list');
  document.getElementById('log-empty').hidden = days.length > 0;

  list.innerHTML = '';
  days.forEach((day) => {
    const block = document.createElement('div');
    block.className = 'day';

    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML = `<span>${formatDate(day.date)}</span><span>${formatDuration(day.activeSec)} active</span>`;
    block.appendChild(head);

    day.entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'entry';
      const name = document.createElement('span');
      name.className = 'entry-name';
      name.textContent = e.summary ? `${e.title} — ${e.summary}` : e.title;
      const time = document.createElement('span');
      time.className = 'entry-time';
      time.textContent = formatDuration(e.activeSec);
      row.append(name, time);
      block.appendChild(row);
    });

    list.appendChild(block);
  });
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(sec) {
  if (sec < 60) return `${Math.round(sec)} s`;
  return `${Math.round(sec / 60)} min`;
}

render();
