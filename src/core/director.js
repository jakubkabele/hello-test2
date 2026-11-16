// The director turns "how far have you scrolled" into "which shot are we in".
// Lenis smooths the wheel, GSAP ScrollTrigger reports the scroll position,
// and each chapter's entrance animation is a GSAP timeline scrubbed by it.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { S, bus, clamp, smooth, damp } from './state.js';
import { SHOTS, CHAPTERS, HOLD, SHOT_SCREENS } from '../config/shots.js';

gsap.registerPlugin(ScrollTrigger);

export function createDirector({ track, layers, timelines }) {
  let segPx = 1;
  let target = 0;        // un-smoothed position in shots
  let lenis = null;
  let lastChapter = -1;

  // first / last shot index of every chapter
  const range = CHAPTERS.map((ch) => {
    const idx = SHOTS.map((s, n) => (s.ch === ch ? n : -1)).filter((n) => n >= 0);
    return [idx[0], idx[idx.length - 1]];
  });
  const chapterOf = (shot) => CHAPTERS.indexOf(SHOTS[shot].ch);

  function measure() {
    segPx = Math.round(S.vh * SHOT_SCREENS);
    track.style.height = `${Math.round(segPx * (SHOTS.length - 1 + HOLD)) + S.ch}px`;
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
    onUpdate: (self) => { target = clamp(self.scroll() / segPx, 0, SHOTS.length - 1 + HOLD); },
  });

  function update(dt) {
    // a little inertia on top of the scroll, so touch scrolling glides too
    S.P = S.reduced ? target : damp(S.P, target, 7, dt);
    if (Math.abs(S.P - target) < 0.0004) S.P = target;

    const i = Math.min(Math.floor(S.P), SHOTS.length - 1);
    const f = S.P - i;
    const j = Math.min(i + 1, SHOTS.length - 1);
    const e = j === i ? 0 : smooth((f - HOLD) / (1 - HOLD));
    S.i = i; S.j = j; S.e = e;
    S.hold = clamp(f / HOLD);

    const ci = chapterOf(i);
    const cj = chapterOf(j);
    const change = ci !== cj;
    S.transit = change ? Math.sin(Math.PI * e) : 0;
    S.chapter = change && e > 0.5 ? cj : ci;

    CHAPTERS.forEach((ch, c) => {
      let vis = 0;
      if (c === ci && c === cj) vis = 1;
      else if (c === ci) vis = 1 - smooth(e / 0.5);
      else if (c === cj) vis = smooth((e - 0.5) / 0.5);
      vis *= S.intro;
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

  function goTo(c, instant) {
    c = clamp(c, 0, CHAPTERS.length - 1);
    const y = range[c][0] * segPx;
    if (lenis && !instant) lenis.scrollTo(y, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y, behavior: S.reduced || instant ? 'auto' : 'smooth' });
  }
  const step = (d) => {
    // move one shot at a time
    const now = Math.round(target);
    const next = clamp(now + d, 0, SHOTS.length - 1);
    const y = next * segPx;
    if (lenis) lenis.scrollTo(y, { duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y, behavior: S.reduced ? 'auto' : 'smooth' });
  };

  return { measure, update, goTo, step, range, lock(v) { if (lenis) (v ? lenis.stop() : lenis.start()); } };
}
