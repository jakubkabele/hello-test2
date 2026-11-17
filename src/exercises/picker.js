// The in-world picker: a sheet that slides up over the exercise (instead of the phone's
// own grey dropdown). One per exercise. open() resolves with the chosen value, or null.
//
//   picker.open({ title, jp, value, groups: [{ label, wide, items: [{ value, label, sub, shape }] }] })
//   wide  = two big rows per line (pairs) instead of a grid of chord cells
//   shape = a chord shape → a tiny fingering diagram under its name

import { esc } from '../chapters/common.js';

// tiny chord box: 6 strings, frets 1–5, dots; × / ○ above the nut
export function miniDiagram(shape) {
  if (!shape) return '';
  const X = (i) => 4 + i * 6.4, NUT = 7, F = 5.4;
  const top = shape.barre ? Math.max(1, shape.barre.fret) : 1;
  const base = Math.max(...shape.frets) > 5 ? top : 1;      // keep high shapes in view
  const Y = (f) => NUT + (f - base + 0.5) * F;
  let s = `<svg class="mini" viewBox="0 0 40 36" aria-hidden="true">`;
  for (let f = 0; f <= 5; f++) s += `<line x1="${X(0)}" x2="${X(5)}" y1="${NUT + f * F}" y2="${NUT + f * F}" class="${f === 0 && base === 1 ? 'nut' : 'fr'}"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${X(i)}" x2="${X(i)}" y1="${NUT}" y2="${NUT + 5 * F}" class="st"/>`;
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
      <header class="pk-head"><span class="pk-title"><b></b><i></i></span><button type="button" class="pk-x" aria-label="Close">✕ <span>CLOSE</span></button></header>
      <i class="pk-rule"></i>
      <div class="pk-body" data-lenis-prevent></div>
    </div>`;
  host.appendChild(el);
  const body = el.querySelector('.pk-body');
  let done = null;

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
  }
  el.querySelector('.pk-x').addEventListener('click', () => close(null));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) close(b.dataset.v);
  });

  function open({ title, jp = '', value = '', groups }) {
    if (done) close(null);
    el.querySelector('.pk-title b').textContent = title;
    el.querySelector('.pk-title i').textContent = jp;
    body.innerHTML = groups.map((g) => `
      ${g.label ? `<h3 class="pk-group">${esc(g.label)}</h3>` : ''}
      <div class="pk-grid${g.wide ? ' is-wide' : ''}">
        ${g.items.map((it) => `
          <button type="button" class="pk-item${String(it.value) === String(value) ? ' is-cur' : ''}${it.accent ? ' is-accent' : ''}" data-v="${esc(it.value)}">
            <b>${esc(it.label)}</b>${it.shape ? miniDiagram(it.shape) : ''}${it.sub ? `<span>${esc(it.sub)}</span>` : ''}
          </button>`).join('')}
      </div>`).join('');
    el.classList.add('is-open');
    document.documentElement.classList.add('is-picking');
    document.addEventListener('keydown', onKey, true);
    // bring the current choice into view
    requestAnimationFrame(() => {
      const cur = body.querySelector('.is-cur');
      body.scrollTop = cur ? Math.max(0, cur.offsetTop - body.clientHeight / 3) : 0;
    });
    return new Promise((res) => { done = res; });
  }

  return { open, close: () => close(null), get isOpen() { return !!done; } };
}
