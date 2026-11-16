// The director turns "how far have you scrolled" into "which shot are we in".
// Lenis smooths the wheel, GSAP ScrollTrigger reports the scroll position,
// and each chapter's entrance animation is a GSAP timeline scrubbed by it.
//
// It also runs the trip into an exercise and back: scrolling is frozen, the chapter
// words fade out and the camera glides to that exercise's own shot.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { S, bus, clamp, smooth, damp } from './state.js';
import { SHOTS, SCROLL_SHOTS, CHAPTERS, HOLD, SHOT_SCREENS, exShot } from '../config/shots.js';

gsap.registerPlugin(ScrollTrigger);

const LAST = SCROLL_SHOTS - 1;

export function createDirector({ track, layers, timelines }) {
  let segPx = 1;
  let target = 0;        // un-smoothed position in shots
  let lenis = null;
  let lastChapter = -1;
  const ex = { name: null, shot: -1, from: 0, k: 0 };   // exercise trip

  // first / last shot index of every chapter
  const range = CHAPTERS.map((ch) => {
    const idx = SHOTS.map((s, n) => (s.ch === ch && !s.ex ? n : -1)).filter((n) => n >= 0);
    return [idx[0], idx[idx.length - 1]];
  });
  const chapterOf = (shot) => CHAPTERS.indexOf(SHOTS[shot].ch);

  function measure() {
    segPx = Math.round(S.vh * SHOT_SCREENS);
    track.style.height = `${Math.round(segPx * (LAST + HOLD)) + S.ch}px`;
    ScrollTrigger.refresh();
  }

  if (!S.reduced) {
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.9, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  ScrollTrigger.config({ ignoreMobileResize: true });

  ScrollTrigger.create({
    trigger: track,
    start: 0,
    end: 'max',
    onUpdate: (self) => { if (!ex.name) target = clamp(self.scroll() / segPx, 0, LAST + HOLD); },
  });

  function update(dt) {
    // a little inertia on top of the scroll, so touch scrolling glides too
    S.P = S.reduced ? target : damp(S.P, target, 7, dt);
    if (Math.abs(S.P - target) < 0.0004) S.P = target;

    let i = Math.min(Math.floor(S.P), LAST);
    const f = S.P - i;
    let j = Math.min(i + 1, LAST);
    let e = j === i ? 0 : smooth((f - HOLD) / (1 - HOLD));
    S.hold = clamp(f / HOLD);

    const ci = chapterOf(i);
    const cj = chapterOf(j);
    const change = ci !== cj;
    S.transit = change ? Math.sin(Math.PI * e) : 0;
    S.chapter = change && e > 0.5 ? cj : ci;

    const se = e;   // the scroll's own blend, before an exercise overrides the camera
    // inside (or on the way into / out of) an exercise
    const xk = ex.k;
    if (xk > 0.0005) {
      i = ex.from; j = ex.shot; e = smooth(xk);
      S.transit = Math.sin(Math.PI * e);
    }
    S.i = i; S.j = j; S.e = e;
    S.exK = xk;

    CHAPTERS.forEach((ch, c) => {
      let vis = 0;
      if (c === ci && c === cj) vis = 1;
      else if (c === ci) vis = 1 - smooth(se / 0.5);
      else if (c === cj) vis = smooth((se - 0.5) / 0.5);
      vis *= S.intro * (1 - smooth(xk * 2.2));
      // progress through the chapter's own stretch of scroll (0 → 1)
      const [a, b] = range[c];
      const u = clamp((S.P - a) / (b - a + HOLD));
      const layer = layers[ch];
      if (layer.__vis !== vis) {
        layer.__vis = vis;
        layer.style.visibility = vis > 0.001 ? 'visible' : 'hidden';
        layer.classList.toggle('is-live', vis > 0.6);
        timelines[ch].progress(vis);
      }
      if (vis > 0 && layer.__u !== u) {
        layer.__u = u;
        bus.emit(`progress:${ch}`, u);
      }
    });

    if (S.chapter !== lastChapter) {
      lastChapter = S.chapter;
      bus.emit('chapter', S.chapter);
    }
  }

  const scrollTo = (y, instant) => {
    if (lenis && !instant) lenis.scrollTo(y, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y, behavior: S.reduced || instant ? 'auto' : 'smooth' });
  };
  function goTo(c, instant) {
    if (ex.name) return;
    scrollTo(range[clamp(c, 0, CHAPTERS.length - 1)][0] * segPx, instant);
  }
  const step = (d) => { if (!ex.name) scrollTo(clamp(Math.round(target) + d, 0, LAST) * segPx); };

  // ── exercises ──
  function lockScroll(v) {
    if (lenis) (v ? lenis.stop() : lenis.start());
    document.documentElement.classList.toggle('is-locked', v);
  }
  function enter(name) {
    const shot = exShot(name);
    if (shot < 0 || ex.name) return;
    ex.name = name; ex.shot = shot; ex.from = Math.min(Math.round(S.P), LAST);
    S.exercise = name;
    lockScroll(true);
    document.documentElement.dataset.ex = name;
    bus.emit('ex:enter', name);
    gsap.to(ex, { k: 1, duration: S.reduced ? 0.01 : 1.1, ease: 'power2.inOut', overwrite: true, onComplete: () => bus.emit('ex:ready', name) });
  }
  function exit() {
    if (!ex.name) return;
    const name = ex.name;
    bus.emit('ex:leave', name);
    delete document.documentElement.dataset.ex;
    gsap.to(ex, {
      k: 0, duration: S.reduced ? 0.01 : 0.9, ease: 'power2.inOut', overwrite: true,
      onComplete: () => { ex.name = null; S.exercise = null; lockScroll(false); bus.emit('ex:closed', name); },
    });
  }

  return { measure, update, goTo, step, range, enter, exit, get exercise() { return ex.name; } };
}
