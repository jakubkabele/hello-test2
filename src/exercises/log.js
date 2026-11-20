// REC-01 PRACTICE LOG — on the recorder pedal.
//
// Reads the same list every exercise writes to (practice.log.v1, on this device only).
// Two views: DAYS = everything you played, day by day (newest first) with active time;
// PROGRESS = one line per thing you repeat (a chord set, a find-the-note mode, a tempo),
// its last score, your best, and a tiny graph of the last rounds.
// While it is open the pedal's tape reels spin faster.

import { bus } from '../core/state.js';
import { esc } from '../chapters/common.js';
import { readLog } from './ear.js';
import { createPicker } from './picker.js';

const dur = (sec) => (sec < 60 ? `${Math.round(sec)} s` : `${Math.round(sec / 60)} min`);

function dayLabel(iso, w) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return w.today;
  if (date.toDateString() === yest.toDateString()) return w.yesterday;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function byDay(list) {
  const days = {};
  list.forEach((e) => { (days[e.date] = days[e.date] || []).push(e); });
  return Object.keys(days).sort().reverse().map((date) => ({
    date,
    entries: days[date].sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    activeSec: days[date].reduce((s, e) => s + (e.activeSec || 0), 0),
  }));
}

// days in a row with practice, ending today (or yesterday — today isn't over yet)
function streak(list) {
  const have = new Set(list.map((e) => e.date));
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d = new Date();
  if (!have.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (have.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// What counts as "the same thing again", and which number to follow.
// up = true → bigger is better.
const SNAME = ['low E', 'A', 'D', 'G', 'B', 'high e'];
function noteMode(m) {   // 'natural|-1' → 'natural notes · any string'
  const [notes, str] = String(m || '').split('|');
  const n = notes === 'all' ? 'all 12' : 'natural';
  return +str >= 0 && SNAME[+str] ? `${n} · ${SNAME[+str]} string` : `${n} · any string`;
}
const TRACKS = {
  'chord-changes': { group: (e) => (e.chords || []).slice().sort().join(' · '), label: (e) => (e.chords || []).join(' · '), value: (e) => e.score.changesPerMin, unit: '/min', up: true },
  'change-drill': { group: (e) => `${(e.chords || []).join(' → ')} (old drill)`, value: (e) => e.score.changesPerMin ?? e.score.perMin, unit: '/min', up: true },
  'find-note': { group: (e) => `Find the note · ${noteMode(e.score.mode)}`, value: (e) => e.score.avgSec, unit: ' s', up: false },
  'keep-time': { group: (e) => `Keep time @ ${e.score.bpm}`, value: (e) => e.score.steadyPct, unit: '%', up: true },
};

function progress(list) {
  const groups = {};
  list.forEach((e) => {
    const t = TRACKS[e.exercise];
    if (!t || !e.score || e.score.partial) return;
    const v = Number(t.value(e));
    if (!Number.isFinite(v)) return;
    const k = `${e.exercise}|${t.group(e)}`;
    const g = (groups[k] = groups[k] || { name: '', t, pts: [], lastTs: '' });
    g.pts.push({ ts: e.ts, v });
    if (String(e.ts) >= g.lastTs) { g.lastTs = String(e.ts); g.name = (t.label || t.group)(e); }   // named like the latest round
  });
  return Object.values(groups).map((g) => {
    g.pts.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    return g;
  }).sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
}

// a tiny line graph of the last rounds; the best point is amber
function spark(pts, up) {
  const p = pts.slice(-12);
  if (p.length < 2) return '<svg class="lg-spark" viewBox="0 0 80 24" aria-hidden="true"><circle cx="40" cy="12" r="2.2"/></svg>';
  const vs = p.map((x) => x.v);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const xy = p.map((x, i) => [(i / (p.length - 1)) * 76 + 2, up ? 21 - ((x.v - lo) / span) * 18 : 3 + ((x.v - lo) / span) * 18]);
  const last = xy[xy.length - 1];
  return `<svg class="lg-spark" viewBox="0 0 80 24" aria-hidden="true"><polyline points="${xy.map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' ')}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.2"/></svg>`;
}
// ── export: the log as Markdown, to paste into a chat with a coach (or Claude) ──
// One heading per day with its active minutes, one line per round, then a short progress part.
export function toMarkdown(list, range, w) {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const from = range === 'today' ? key(today) : range === 'week' ? key(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)) : '0000';
  const pick = list.filter((e) => e.date >= from);
  const days = byDay(pick).reverse();   // oldest first reads better in a message
  const lines = [`# ${w.mdTitle}${range === 'today' ? ` — ${key(today)}` : ''}`, ''];
  if (!days.length) lines.push(w.mdEmpty);
  days.forEach((d) => {
    lines.push(`## ${d.date} — ${Math.round(d.activeSec / 60)} min active`);
    d.entries.slice().reverse().forEach((e) => {
      const t = e.title || e.exercise;
      const sum = String(e.summary || '').trim();
      lines.push(`- ${sum && sum.toLowerCase().startsWith(t.toLowerCase()) ? sum : sum ? `${t}: ${sum}` : t}`);
    });
    lines.push('');
  });
  const prog = progress(pick).filter((g) => g.pts.length > 1);
  if (prog.length) {
    lines.push(`## ${w.mdProgress}`);
    prog.forEach((g) => {
      const vs = g.pts.map((p) => p.v);
      const best = g.t.up ? Math.max(...vs) : Math.min(...vs);
      lines.push(`- ${g.name}: ${fmt(vs[0], g.t.unit)} → ${fmt(vs[vs.length - 1], g.t.unit)} (${w.best} ${fmt(best, g.t.unit)}, ${g.pts.length} ${w.rounds})`);
    });
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

// share sheet on phones; else copy; else a hidden text box + copy
export async function shareText(text, title) {
  if (navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
    try { await navigator.share({ title, text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { /* not allowed */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok ? 'copied' : 'failed';
}

const fmt = (v, unit) => `${unit === ' s' ? v.toFixed(1) : Math.round(v)}${unit}`;

export function createLog({ root, words, audio, getStage, director }) {
  const el = document.createElement('section');
  el.className = 'ex ex-lg';
  el.dataset.ex = 'log';
  el.innerHTML = `
    <header class="tag"><span class="tag-no">${esc(words.no)}</span><span class="tag-txt"><b class="tag-name">${esc(words.name)}</b><span class="tag-jp">${esc(words.jp)}</span></span></header>
    <button type="button" class="ex-exit" aria-label="Back to menu">✕ <span>EXIT</span></button>
    <div class="ex-read lg-read">
      <span class="lg-k">${esc(words.total)}</span>
      <b class="lg-big">0</b>
      <span class="lg-unit">${esc(words.minutes)}</span>
    </div>
    <div class="lg-stats"></div>
    <div class="lg-box">
      <div class="pk-tabs lg-tabs" role="tablist">
        <button type="button" role="tab" data-t="days" class="is-on">${esc(words.days)}</button>
        <button type="button" role="tab" data-t="progress">${esc(words.progress)}</button>
      </div>
      <div class="lg-body" data-lenis-prevent></div>
    </div>
    <button type="button" class="ex-go">${esc(words.exportBtn)}</button>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const body = $('.lg-body');
  const tabs = [...el.querySelectorAll('.lg-tabs button')];
  const picker = createPicker(el);
  let tab = 'days';

  function render() {
    const list = readLog().filter((e) => e && e.date);
    const total = list.reduce((s, e) => s + (e.activeSec || 0), 0);
    const days = byDay(list);
    $('.lg-big').textContent = String(Math.round(total / 60));
    const st = streak(list);
    $('.lg-stats').innerHTML = [
      [list.length, words.entries],
      [days.length, words.daysPlayed],
      [st, st === 1 ? words.dayStreak : words.daysStreak],
    ].map(([n, l]) => `<span><b>${n}</b>${esc(l)}</span>`).join('');
    tabs.forEach((b) => { const on = b.dataset.t === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });

    if (!list.length) { body.innerHTML = `<p class="lg-empty">${esc(words.empty)}</p>`; return; }
    if (tab === 'days') {
      body.innerHTML = days.map((d) => `
        <div class="lg-day">
          <div class="lg-dhead"><b>${esc(dayLabel(d.date, words))}</b><i></i><span>${esc(dur(d.activeSec))}</span></div>
          ${d.entries.map((e) => `
            <div class="lg-row">
              <span class="lg-name"><b>${esc(e.title || e.exercise)}</b>${e.summary ? `<span>${esc(e.summary)}</span>` : ''}</span>
              <span class="lg-time">${esc(dur(e.activeSec || 0))}</span>
            </div>`).join('')}
        </div>`).join('');
    } else {
      const groups = progress(list);
      if (!groups.length) { body.innerHTML = `<p class="lg-empty">${esc(words.noProgress)}</p>`; return; }
      body.innerHTML = groups.map((g) => {
        const vs = g.pts.map((p) => p.v);
        const last = vs[vs.length - 1];
        const best = g.t.up ? Math.max(...vs) : Math.min(...vs);
        const first = vs[0];
        const better = g.t.up ? last > first : last < first;
        return `
          <div class="lg-prog">
            <span class="lg-pname"><b>${esc(g.name)}</b><span>${g.pts.length} ${esc(g.pts.length === 1 ? words.round : words.rounds)}${g.pts.length > 1 ? ` · ${esc(words.from)} ${fmt(first, g.t.unit)}${better ? ' ↗' : ''}` : ''}</span></span>
            ${spark(g.pts, g.t.up)}
            <span class="lg-pval"><b class="${last === best ? 'is-best' : ''}">${fmt(last, g.t.unit)}</b><span>${esc(words.best)} ${fmt(best, g.t.unit)}</span></span>
          </div>`;
      }).join('');
    }
  }

  tabs.forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; body.scrollTop = 0; render(); }));
  // Copy for coach: pick how much, then the phone's share sheet (or copy)
  const go = $('.ex-go');
  go.addEventListener('click', async () => {
    const list = readLog().filter((e) => e && e.date);
    if (!list.length) return;
    const v = await picker.list({
      title: words.export, value: '',
      tabs: [{ id: 'r', label: words.export, note: words.exportNote, rows: [
        { value: 'today', label: words.today, accent: true }, { value: 'week', label: words.week }, { value: 'all', label: words.all },
      ] }],
    });
    if (!v) return;
    if (audio) audio.unlock();
    const res = await shareText(toMarkdown(list, v, words), words.mdTitle);
    const say = { shared: words.shared, copied: words.copied, failed: words.copyFailed }[res];
    if (say) { go.textContent = say; bus.emit('flash', 0.25); setTimeout(() => { go.textContent = words.exportBtn; }, 2200); }
  });
  bus.on('log:export', () => { if (el.classList.contains('is-open')) go.click(); });
  $('.ex-exit').addEventListener('click', () => director.exit());

  bus.on('ex:enter', (n) => {
    if (n !== 'log') return;
    tab = 'days'; render(); body.scrollTop = 0;
    el.classList.add('is-open');
    const st = getStage(); if (st) st.guitar.setReels(3.2);
  });
  bus.on('ex:leave', (n) => {
    if (n !== 'log') return;
    picker.close();
    el.classList.remove('is-open');
    const st = getStage(); if (st) st.guitar.setReels(0.6);
  });
  return { el };
}
