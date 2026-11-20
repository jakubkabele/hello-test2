// The in-world picker: a sheet that slides up over the exercise (instead of the phone's
// own grey dropdown). One per exercise. Every open*() resolves with the chosen value, or null.
//
//   picker.chords({ title, value, library, auto })   chord chart: one row per root note,
//                                                    one column per chord type
//   picker.chords({ …, multi: true, value: [names] })  tap several, in order → array (Done)
//   picker.chords({ …, more: [{ label, shapes }], other: true })  + groups of extra chords under
//        the chart, and a field to type any other chord name (resolves with the typed name)
//   picker.list({ title, value, tabs })              tabs on top, slim one-line rows below
//   picker.sheet(title, html)                        any content; resolves with a [data-v] tapped,
//        or picker.done(value) from your own code. picker.body = the content element.
//        tabs: [{ id, label, rows: [{ value, label, sub, accent }] }]

import { esc } from '../chapters/common.js';

const ROOTS = [[0, 'C'], [2, 'D'], [4, 'E'], [5, 'F'], [6, 'F#'], [7, 'G'], [9, 'A'], [11, 'B']];
const TYPES = [['', 'maj'], ['m', 'm'], ['7', '7'], ['m7', 'm7'], ['maj7', 'maj7'], ['sus2', 'sus2'], ['sus4', 'sus4']];

// tiny chord box: 6 strings, frets, dots; × / ○ above the nut (shows the current chord)
export function miniDiagram(shape) {
  if (!shape) return '';
  const X = (i) => 4 + i * 6.4, NUT = 7, F = 5.4;
  const Y = (f) => NUT + (f - 0.5) * F;
  let s = '<svg class="mini" viewBox="0 0 40 36" aria-hidden="true">';
  for (let f = 0; f <= 5; f++) s += `<line x1="${X(0)}" x2="${X(5)}" y1="${NUT + f * F}" y2="${NUT + f * F}" class="${f ? 'fr' : 'nut'}"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${X(i)}" x2="${X(i)}" y1="${NUT}" y2="${NUT + 5 * F}"/>`;
  if (shape.barre) {
    const { fret, from, to } = shape.barre;
    s += `<rect x="${X(from) - 2.2}" y="${Y(fret) - 2.2}" width="${X(to) - X(from) + 4.4}" height="4.4" rx="2.2" class="dt"/>`;
  }
  shape.frets.forEach((f, i) => {
    if (f < 0) s += `<text x="${X(i)}" y="5" class="mk">×</text>`;
    else if (f === 0) s += `<circle cx="${X(i)}" cy="3.4" r="1.6" class="op"/>`;
    else if (!(shape.barre && shape.barre.fret === f && i >= shape.barre.from && i <= shape.barre.to)) s += `<circle cx="${X(i)}" cy="${Y(f)}" r="2.2" class="dt"/>`;
  });
  return `${s}</svg>`;
}

export function createPicker(host) {
  const el = document.createElement('div');
  el.className = 'pk';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="pk-in">
      <header class="pk-head"><b class="pk-title"></b><button type="button" class="pk-x" aria-label="Close">✕ <span>CLOSE</span></button></header>
      <div class="pk-body" data-lenis-prevent></div>
    </div>`;
  host.appendChild(el);
  const body = el.querySelector('.pk-body');
  let done = null;
  let multi = null;             // chosen names, in tap order (multi-select chart)

  function close(v) {
    if (!done) return;
    el.classList.remove('is-open');
    document.documentElement.classList.remove('is-picking');
    const d = done; done = null;
    document.removeEventListener('keydown', onKey, true);
    d(v);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); }
    if (e.key === 'Enter' && e.target.closest && e.target.closest('.pk-other')) { e.preventDefault(); body.querySelector('.pk-other-go').click(); }
  }
  el.querySelector('.pk-x').addEventListener('click', () => close(null));
  body.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { showTab(tab.dataset.tab); return; }
    if (e.target.closest('.pk-clear')) { multi.length = 0; paintMulti(); return; }
    if (e.target.closest('.pk-done')) { if (multi.length >= 2) close(multi.slice()); return; }
    if (e.target.closest('.pk-other-go')) {
      const inp = body.querySelector('.pk-other input');
      const v = inp && inp.value.trim();
      if (v) close(v);
      return;
    }
    const b = e.target.closest('[data-v]');
    if (!b || b.disabled) return;
    if (multi) {
      const i = multi.indexOf(b.dataset.v);
      if (i >= 0) multi.splice(i, 1); else multi.push(b.dataset.v);
      paintMulti();
      return;
    }
    close(b.dataset.v);
  });
  function paintMulti() {
    body.querySelectorAll('.pk-c').forEach((c) => {
      const i = multi.indexOf(c.dataset.v);
      c.classList.toggle('is-cur', i >= 0);
      c.dataset.n = i >= 0 ? i + 1 : '';
    });
    const d = body.querySelector('.pk-done');
    d.disabled = multi.length < 2;
    d.textContent = multi.length < 2 ? 'Pick at least 2' : `Done · ${multi.length}`;
    body.querySelector('.pk-order').textContent = multi.join(' → ') || '—';
  }
  function showTab(id) {
    body.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('is-on', t.dataset.tab === id));
    body.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== id; });
  }

  function show(title, html) {
    if (done) close(null);
    multi = null;
    el.querySelector('.pk-title').textContent = title;
    body.innerHTML = html;
    body.scrollTop = 0;
    el.classList.add('is-open');
    document.documentElement.classList.add('is-picking');
    document.addEventListener('keydown', onKey, true);
    return new Promise((res) => { done = res; });
  }

  // ── chord chart ──
  function chords({ title, value, library, auto = null, multi: many = false, more = [], other = false }) {
    const cur = many ? null : [...library, ...more.flatMap((g) => g.shapes)].find((c) => c.name === value);
    const cell = (shapes) => {
      if (!shapes.length) return '<i class="pk-empty">·</i>';
      return shapes.map((c) => `<button type="button" class="pk-c${c.name === value ? ' is-cur' : ''}${c.isBarre ? ' is-barre' : ''}" data-v="${esc(c.name)}" aria-label="${esc(c.name)}">${esc(c.isBarre && c.name.includes(' ') ? c.chord : c.name)}</button>`).join('');
    };
    const rows = ROOTS.map(([root, label]) => `
      <span class="pk-root">${label}</span>
      ${TYPES.map(([q]) => `<span class="pk-cell">${cell(library.filter((c) => c.root === root && c.q === q).sort((a, b) => a.isBarre - b.isBarre))}</span>`).join('')}`).join('');
    const p = show(title, `
      ${auto ? `<button type="button" class="pk-auto${value === auto.value ? ' is-cur' : ''}" data-v="${esc(auto.value)}"><b>${esc(auto.label)}</b><span>${esc(auto.sub)}</span></button>` : ''}
      <div class="pk-chart">
        <span></span>${TYPES.map(([, t]) => `<span class="pk-type">${t}</span>`).join('')}
        ${rows}
      </div>
      ${more.filter((g) => g.shapes.length).map((g) => `
        <p class="pk-group">${esc(g.label)}</p>
        <div class="pk-chips">${g.shapes.map((c) => `<button type="button" class="pk-c${c.name === value ? ' is-cur' : ''}${c.isBarre ? ' is-barre' : ''}" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>`).join('')}
      ${other ? `<p class="pk-group">${esc(other.label || 'Other chord')}</p>
        <div class="pk-other"><input type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="14" placeholder="${esc(other.placeholder || 'e.g. Bbmaj9')}"><button type="button" class="pk-other-go">${esc(other.add || 'Add')}</button></div>
        ${other.note ? `<p class="pk-note">${esc(other.note)}</p>` : ''}` : ''}
      ${many ? '<p class="pk-order"></p><div class="pk-multi"><button type="button" class="pk-clear">Clear</button><button type="button" class="pk-done"></button></div>' : ''}
      <p class="pk-foot"><span class="pk-key"><i></i> barre</span>${cur ? `<span class="pk-now">${miniDiagram(cur)}<b>${esc(cur.name)}</b></span>` : many ? '<span class="pk-key">tap in the order you want</span>' : ''}</p>`);
    if (many) { multi = (Array.isArray(value) ? value : []).slice(); paintMulti(); }
    return p;
  }

  // ── tabs + slim rows ──
  function list({ title, value, tabs }) {
    const start = (tabs.find((t) => t.rows.some((r) => r.value === value)) || tabs[0]).id;
    const p = show(title, `
      <div class="pk-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" data-tab="${esc(t.id)}">${esc(t.label)}</button>`).join('')}</div>
      ${tabs.map((t) => `
        <div class="pk-pane" data-pane="${esc(t.id)}">
          ${t.note ? `<p class="pk-note">${esc(t.note)}</p>` : ''}
          ${t.rows.map((r) => `<button type="button" class="pk-row${r.value === value ? ' is-cur' : ''}${r.accent ? ' is-accent' : ''}" data-v="${esc(r.value)}"><b>${esc(r.label)}</b><i></i><span>${esc(r.sub || '')}</span></button>`).join('')}
        </div>`).join('')}`);
    showTab(start);
    return p;
  }

  // ── any content ──
  function sheet(title, html) { return show(title, html); }

  return { chords, list, sheet, done: (v) => close(v), close: () => close(null), body, get isOpen() { return !!done; } };
}
