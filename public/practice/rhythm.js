// Rhythm — strum a pattern with the metronome; the app checks every strum's timing.
//
// How it works (in plain words):
// • A bar of 4 beats is split into 8 slots: 1 & 2 & 3 & 4 &. A pattern says
//   which slots get a strum (↓ on the beats, ↑ on the "and"s).
// • The app hears each strum and when it started (timing.js), minus your
//   phone's delay (calibration from the change drill). Each strum is matched to
//   the nearest slot: a pattern slot → on time / early / late (by how many ms);
//   a slot that should be empty → "extra". Pattern slots with no strum → missed.
// • It can't tell a down-strum from an up-strum — only when you strummed.
// • Score = % of the pattern's strums on time. Breaks: 20 s silence pauses.

const Rhythm = (() => {
  const SCREEN = 'rhythm';
  const KEY = 'practice.rhythm.settings';
  const ROUND_SEC = 60;
  const COUNT_IN = 4;
  const SHOW_RANGE = 0.2;           // timing line shows ±200 ms
  const PATTERNS = [
    { id: 'halves',   name: 'Half notes', slots: 'D---D---', hint: '↓ on beats 1 and 3 — slow and steady.' },
    { id: 'quarters', name: 'Quarters',   slots: 'D-D-D-D-', hint: '↓ on every beat.' },
    { id: 'eighths',  name: 'Eighths',    slots: 'DUDUDUDU', hint: '↓ on the beat, ↑ on every “and”.' },
    { id: 'pop',      name: 'Pop',        slots: 'D-DU-UDU', hint: '↓ ↓↑ ↑↓↑ — the classic pop / folk pattern.' },
  ];
  const COUNT = ['1', '&', '2', '&', '3', '&', '4', '&'];
  const P = () => Settings.profile().rhythm;

  // ---------- Elements ----------
  const root = document.querySelector(`[data-screen="${SCREEN}"]`);
  const $ = (s) => root.querySelector(s);
  const setupEl = $('.rh-setup'), runEl = $('.rh-run'), sumEl = $('.rh-summary'), errorEl = $('.error');

  // ---------- Settings / setup ----------
  const cfg = (() => {
    const d = { pattern: 'quarters', bpm: 70 };
    try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return d; }
  })();
  const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
  const patternOf = (id) => PATTERNS.find((p) => p.id === id) || PATTERNS[1];
  const arrows = (slots) => slots.split('').map((c) => (c === 'D' ? '↓' : c === 'U' ? '↑' : '·')).join(' ');

  PATTERNS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'rh-pattern';
    b.dataset.id = p.id;
    b.innerHTML = '<span class="rh-pname"></span><span class="rh-parrows"></span><span class="rh-phint"></span>';
    b.querySelector('.rh-pname').textContent = p.name;
    b.querySelector('.rh-parrows').textContent = arrows(p.slots);
    b.querySelector('.rh-phint').textContent = p.hint;
    b.addEventListener('click', () => { cfg.pattern = p.id; saveCfg(); renderSetup(); });
    $('.rh-patterns').appendChild(b);
  });
  $('.rh-minus').addEventListener('click', () => { cfg.bpm = Math.max(40, cfg.bpm - 5); saveCfg(); renderSetup(); });
  $('.rh-plus').addEventListener('click', () => { cfg.bpm = Math.min(140, cfg.bpm + 5); saveCfg(); renderSetup(); });
  $('.rh-recal').addEventListener('click', () => {
    try { sessionStorage.setItem('drill.calibrate', '#/exercise/rhythm'); } catch {}
    location.hash = '#/exercise/change-drill';
  });

  function renderSetup() {
    root.querySelectorAll('.rh-pattern').forEach((b) => b.classList.toggle('active', b.dataset.id === cfg.pattern));
    $('.rh-bpm').textContent = cfg.bpm;
    const off = Timing.offset();
    $('.rh-cal-info').textContent = off === null ? 'Timing not calibrated — early/late may be off.' : `Timing calibrated · phone delay ${Math.round(off * 1000)} ms`;
    $('.rh-recal').textContent = off === null ? 'Calibrate (15 s)' : 'Redo';
  }

  function view(name) {
    setupEl.hidden = name !== 'setup';
    runEl.hidden = name !== 'run';
    sumEl.hidden = name !== 'summary';
  }

  // ---------- Run ----------
  let running = false, paused = false, rafId = 0, mic = null, ctx = null;
  let pat = null, bpm = 70, beatDur = 1, slotDur = 0.5, barLen = 4, nBars = 15;
  let baseBar = 0, firstBeat = 0, roundStart = 0, nextBeat = 0, totalBeats = 0;
  let delay = 0, lastPlayedAt = 0, lastPlayedBar = -1;
  let hits = [];        // every pattern strum: { bar, slot, t, status: null|'ok'|'early'|'late'|'missed', err }
  let extras = [];      // { bar }
  let strums = null, clickBuf = null, clicks = [];
  const wake = Pause.playDetector();

  $('.rh-start').addEventListener('click', () => newRound());
  $('.rh-again').addEventListener('click', () => newRound());
  $('.rh-back').addEventListener('click', () => { view('setup'); renderSetup(); });
  $('.rh-stop').addEventListener('click', () => stop());

  async function newRound() {
    errorEl.hidden = true;
    try {
      mic = await Sound.openMic(32768);
    } catch {
      errorEl.textContent = 'Microphone not available. Please allow mic access and try again.';
      errorEl.hidden = false;
      view('setup');
      return;
    }
    ctx = Sound.context();
    if (!clickBuf) clickBuf = makeClick();
    pat = patternOf(cfg.pattern);
    bpm = cfg.bpm;
    beatDur = 60 / bpm;
    slotDur = beatDur / 2;
    barLen = beatDur * 4;
    nBars = Math.max(2, Math.round(ROUND_SEC / barLen));
    hits = [];
    extras = [];
    for (let b = 0; b < nBars; b++) {
      for (let s = 0; s < 8; s++) if (pat.slots[s] !== '-') hits.push({ bar: b, slot: s, t: 0, status: null, err: null });
    }
    lastPlayedBar = -1;
    delay = Timing.offset() ?? Timing.estimate(ctx);
    view('run');
    $('.rh-howto').textContent = `${pat.name}: ${arrows(pat.slots)} · on time = within ±${P().timing} ms`;
    drawSlots();
    begin();
  }

  // (Re)start the clock: count-in, then continue from the bar after the last one played.
  function begin() {
    baseBar = lastPlayedBar + 1;
    firstBeat = ctx.currentTime + 0.4;
    roundStart = firstBeat + COUNT_IN * beatDur;
    nextBeat = 0;
    totalBeats = COUNT_IN + (nBars - baseBar) * 4;
    hits.forEach((h) => { if (h.bar >= baseBar) { h.status = null; h.err = null; } h.t = barStart(h.bar) + h.slot * slotDur; });
    extras = extras.filter((e) => e.bar < baseBar);
    strums = Timing.strumDetector(mic.sampleRate);
    lastPlayedAt = roundStart;
    running = true;
    paused = false;
    runEl.classList.remove('is-paused');
    $('.rh-status').textContent = '';
    showMark(null);
    renderCounts();
    cancelAnimationFrame(rafId);
    loop();
  }

  const barStart = (b) => roundStart + (b - baseBar) * barLen;

  function loop() {
    if (!running) return;
    const now = ctx.currentTime;
    mic.analyser.getFloatTimeDomainData(mic.buffer);

    if (paused) {
      if (wake.feed(mic.buffer, performance.now())) begin();
      else rafId = requestAnimationFrame(loop);
      return;
    }

    while (nextBeat < totalBeats && firstBeat + nextBeat * beatDur < now + 0.2) {
      const inRound = nextBeat - COUNT_IN;
      playClick(firstBeat + nextBeat * beatDur, nextBeat === 0 || (inRound >= 0 && inRound % 4 === 0));
      nextBeat++;
    }

    const t = strums.feed(mic.buffer, now);
    if (t !== null) onStrum(t, now);

    // Pattern strums whose moment has clearly passed without a strum → missed.
    hits.forEach((h) => {
      if (!h.status && h.bar >= baseBar && now > h.t + delay + slotDur / 2 + 0.3) { h.status = 'missed'; renderCounts(); }
    });

    if (now - lastPlayedAt > Pause.AFTER_SEC) { pause(); return; }
    render(now);
    if (now > barStart(nBars) + delay + 0.6) { finish(false); return; }
    rafId = requestAnimationFrame(loop);
  }

  function onStrum(t, now) {
    lastPlayedAt = now;
    const played = t - delay;
    const g = Math.round((played - roundStart) / slotDur);
    if (g < 0) return;                                   // during the count-in
    const bar = baseBar + Math.floor(g / 8), slot = g % 8;
    if (bar >= nBars) return;
    const err = played - (barStart(bar) + slot * slotDur);
    lastPlayedBar = Math.max(lastPlayedBar, bar);
    const h = hits.find((x) => x.bar === bar && x.slot === slot);
    const ms = Math.round(Math.abs(err) * 1000);
    const st = $('.rh-status');
    if (h && !h.status) {
      const tol = P().timing / 1000;
      h.status = Math.abs(err) <= tol ? 'ok' : err < 0 ? 'early' : 'late';
      h.err = err;
      const arrow = pat.slots[slot] === 'U' ? '↑' : '↓';
      st.textContent = h.status === 'ok' ? `${arrow} on time${ms >= 15 ? ` (${ms} ms ${err < 0 ? 'early' : 'late'})` : ''}` : `${arrow} ${h.status} — ${ms} ms`;
      st.className = 'dr-status rh-status ' + (h.status === 'ok' ? 'ok' : 'meh');
      showMark(h);
    } else {
      extras.push({ bar });
      st.textContent = `extra strum on “${COUNT[slot]}” — not in the pattern`;
      st.className = 'dr-status rh-status bad';
    }
    renderCounts();
  }

  // 20 s of silence: stop the clock and metronome; bars after the last one you played start over.
  function pause() {
    paused = true;
    clicks.forEach((c) => { try { c.stop(); } catch {} });
    clicks = [];
    hits.forEach((h) => { if (h.bar > lastPlayedBar) { h.status = null; h.err = null; } });
    extras = extras.filter((e) => e.bar <= lastPlayedBar);
    wake.reset();
    runEl.classList.add('is-paused');
    $('.rh-big').textContent = 'Paused';
    $('.rh-status').textContent = `Nothing heard for ${Pause.AFTER_SEC} s — strum to carry on (count-in first).`;
    $('.rh-status').className = 'dr-status rh-status';
    renderCounts();
    rafId = requestAnimationFrame(loop);
  }

  // Stop button / leaving the screen: save what was played.
  function stop() {
    if (!running) return;
    if (!paused) lastPlayedBar = Math.min(lastPlayedBar, Math.floor((ctx.currentTime - delay - roundStart) / barLen) + baseBar - 1);
    finish(true);
  }

  // ---------- Drawing ----------
  function render(now) {
    const v = now - (ctx.outputLatency || ctx.baseLatency || 0);
    const big = $('.rh-big');
    const left = Math.max(0, barStart(nBars) - Math.max(v, roundStart));
    const secs = Math.ceil(left);
    $('.rh-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const slotEls = $('.rh-slots').children;
    if (v < roundStart) {
      const n = Math.ceil((roundStart - v) / beatDur);
      big.textContent = v < firstBeat ? '' : String(Math.min(COUNT_IN, n));
      big.classList.remove('hit');
      [...slotEls].forEach((el) => el.classList.remove('now', 'flash'));
      return;
    }
    const g = Math.floor((v - roundStart) / slotDur);
    const bar = baseBar + Math.floor(g / 8), slot = g % 8;
    const inSlot = (v - roundStart) / slotDur - g;
    big.textContent = COUNT[slot];
    const isHit = pat.slots[slot] !== '-';
    big.classList.toggle('hit', isHit && inSlot < 0.5);
    [...slotEls].forEach((el, i) => {
      el.classList.toggle('now', i === slot);
      el.classList.toggle('flash', i === slot && isHit && inSlot < 0.5);
      // colour = how this bar's strum on that slot went
      const h = hits.find((x) => x.bar === bar && x.slot === i);
      el.dataset.st = h && h.status ? h.status : '';
    });
  }

  function drawSlots() {
    const el = $('.rh-slots');
    el.innerHTML = '';
    pat.slots.split('').forEach((c, i) => {
      const s = document.createElement('div');
      s.className = 'rh-slot' + (c === '-' ? ' rest' : '');
      s.innerHTML = `<span class="rh-arrow">${c === 'D' ? '↓' : c === 'U' ? '↑' : '·'}</span><span class="rh-cnt">${COUNT[i]}</span>`;
      el.appendChild(s);
    });
  }

  function tally(upToBar = Infinity) {
    const hs = hits.filter((h) => h.bar <= upToBar && h.status);
    const c = (s) => hs.filter((h) => h.status === s).length;
    return { judged: hs.length, ok: c('ok'), early: c('early'), late: c('late'), missed: c('missed'), extra: extras.filter((e) => e.bar <= upToBar).length };
  }

  function renderCounts() {
    const t = tally();
    $('.rh-counts').innerHTML =
      `<span class="ok">${t.ok} on time</span><span class="meh">${t.early} early</span><span class="meh">${t.late} late</span>` +
      `<span class="bad">${t.missed} missed</span><span class="bad">${t.extra} extra</span>`;
    $('.rh-count').textContent = t.judged ? `${Math.round((t.ok / t.judged) * 100)}%` : '';
  }

  function showMark(h) {
    const tol = P().timing / 1000;
    const zone = $('.dr-tl-zone'), dot = $('.dr-tl-dot');
    zone.style.left = `${50 - (tol / SHOW_RANGE) * 50}%`;
    zone.style.width = `${(tol / SHOW_RANGE) * 100}%`;
    if (!h) { dot.hidden = true; return; }
    dot.hidden = false;
    dot.style.left = `${50 + Math.max(-1, Math.min(1, h.err / SHOW_RANGE)) * 50}%`;
    dot.className = 'dr-tl-dot ' + (h.status === 'ok' ? 'ok' : 'meh');
  }

  // ---------- Result ----------
  function finish(partial) {
    running = false;
    paused = false;
    cancelAnimationFrame(rafId);
    clicks.forEach((c) => { try { c.stop(); } catch {} });
    clicks = [];
    Sound.closeMic();
    runEl.classList.remove('is-paused');

    const upTo = partial ? lastPlayedBar : nBars - 1;
    if (partial) hits.forEach((h) => { if (h.bar <= upTo && !h.status) h.status = 'missed'; });
    const t = tally(upTo);
    const bars = upTo + 1;
    if (bars < 2 || !t.judged) { view('setup'); renderSetup(); return; }

    const pct = Math.round((t.ok / t.judged) * 100);
    const errs = hits.filter((h) => h.bar <= upTo && h.err !== null).map((h) => h.err).sort((a, b) => a - b);
    const med = errs.length ? errs[Math.floor(errs.length / 2)] : 0;
    const spread = errs.length ? errs.map((e) => Math.abs(e - med)).sort((a, b) => a - b)[Math.floor(errs.length / 2)] : 0;
    const timingMs = Math.round(med * 1000), spreadMs = Math.round(spread * 1000);
    const activeSec = Math.round(bars * barLen);
    const prev = lastResult();

    Store.add({
      exercise: SCREEN,
      title: 'Rhythm',
      score: {
        onTimePct: pct, strums: t.judged, onTime: t.ok, early: t.early, late: t.late, missed: t.missed, extra: t.extra,
        timingMs, spreadMs, bpm, pattern: pat.id, ...(partial ? { partial: true } : {}),
      },
      summary: `${pat.name} @ ${bpm} BPM: ${pct}% on time (avg ${timingMs > 0 ? '+' : ''}${timingMs} ms)${prev ? ` (prev ${prev.score.onTimePct}%)` : ''}${partial ? ' · partial' : ''}`,
      activeSec,
    });

    view('summary');
    $('.rh-sum-big').textContent = `${pct}%`;
    $('.rh-sum-name').textContent = `${pat.name} · ${arrows(pat.slots)} · ${bpm} BPM`;
    $('.rh-sum-compare').textContent = partial ? `Partial round (${activeSec} s played).`
      : prev ? (pct > prev.score.onTimePct ? `Up from ${prev.score.onTimePct}% last time 🎉` : `Last time: ${prev.score.onTimePct}%`)
      : 'First round of this pattern at this tempo — your baseline.';
    const lines = [`${t.ok} of ${t.judged} strums on time (±${P().timing} ms)`];
    lines.push(Math.abs(timingMs) <= 15 ? `Timing: right on the click on average (${timingMs > 0 ? '+' : ''}${timingMs} ms)`
      : `Timing: you tend to be ${Math.abs(timingMs)} ms ${timingMs > 0 ? 'behind' : 'ahead of'} the click`);
    lines.push(`Steadiness: your strums vary by about ±${spreadMs} ms${spreadMs <= 25 ? ' — very steady' : spreadMs <= 50 ? '' : ' — try a slower tempo'}`);
    if (t.early || t.late) lines.push(`${t.early} early · ${t.late} late`);
    if (t.missed) lines.push(`${t.missed} missed`);
    if (t.extra) lines.push(`${t.extra} extra strum${t.extra > 1 ? 's' : ''} (not in the pattern)`);
    if (!partial && pct >= 90) lines.push(`Solid — try ${Math.min(140, bpm + 5)} BPM next.`);
    const ul = $('.rh-sum-details');
    ul.innerHTML = '';
    lines.forEach((x) => { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
  }

  function lastResult() {
    const list = Store.all().filter((e) => e.exercise === SCREEN && e.score && !e.score.partial && e.score.pattern === pat.id && e.score.bpm === bpm);
    return list[list.length - 1] || null;
  }

  // ---------- Metronome click (same sound as the drill) ----------
  function makeClick() {
    const len = Math.round(ctx.sampleRate * 0.025);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) { const n = Math.random() * 2 - 1; d[i] = (n - prev) * Math.exp(-i / (len / 5)); prev = n; }
    return b;
  }
  function playClick(time, accent) {
    const src = ctx.createBufferSource();
    src.buffer = clickBuf;
    const g = ctx.createGain();
    g.gain.value = accent ? 0.9 : 0.4;
    src.connect(g).connect(ctx.destination);
    src.start(time);
    src.onended = () => { clicks = clicks.filter((c) => c !== src); };
    clicks.push(src);
  }

  // ---------- Screen ----------
  function show() {
    if (!running) { if (sumEl.hidden) view('setup'); renderSetup(); }
  }

  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  view('setup');
  renderSetup();

  return { screen: SCREEN, stop, show };
})();
