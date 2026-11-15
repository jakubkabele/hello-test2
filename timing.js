// Timing — hears WHEN you strum, and knows your phone's delay (calibration).
//
// In plain words:
// • Strum start: every frame we look at the newest ~20 ms of sound. A strum
//   starts with a sudden jump in loudness or in "brightness" (the sharp pick
//   attack). We then find the exact moment of the jump inside the recent sound
//   (to a few ms). Then we check it's a real strum: ~70 ms later a strum's
//   fresh strings are still bright (or at 150 ms still ringing louder than
//   before); a metronome click or a knock has already died away — ignored.
// • Phone delay: the phone plays the click a little after the app schedules it,
//   and hears the guitar a little after you play. Calibration measures the total
//   (you strum along with 8 clicks, we take the typical gap) and saves it, so
//   "on the beat" means on the click you actually hear.

const Timing = (() => {
  const KEY = 'practice.timing.v1';
  const MIN_LEVEL = 0.004;     // quieter than this isn't a strum
  const BRIGHT_SEC = 0.07;     // check the pick attack's brightness this long after the start
  const RING_SEC = 0.15;       // …or that it still rings louder this long after
  const BLOCK = 128;           // samples per step when pinpointing the start

  // Saved phone delay in seconds, or null if never calibrated.
  function offset() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return d && typeof d.offsetMs === 'number' ? d.offsetMs / 1000 : null;
    } catch { return null; }
  }
  function save(sec) {
    try { localStorage.setItem(KEY, JSON.stringify({ offsetMs: Math.round(sec * 1000), at: new Date().toISOString() })); } catch {}
  }
  // Rough guess when not calibrated: what the browser says about output delay + typical mic delay.
  function estimate(ctx) {
    return (ctx.outputLatency || ctx.baseLatency || 0) + 0.06;
  }

  // Feed the mic buffer every frame with the audio-clock time; returns the time
  // a strum started (once it's confirmed as ringing), otherwise null.
  // opts.rise = how much louder than before a strum must leave the sound (lower for fast strumming).
  function strumDetector(sampleRate, opts = {}) {
    const rise = opts.rise || 1.4;
    let baseRms = 0, baseBright = 0, pend = null, quietUntil = 0, prevR = 0, prevBr = 0;
    return {
      reset() { baseRms = 0; baseBright = 0; pend = null; quietUntil = 0; prevR = 0; prevBr = 0; },
      feed(buf, now) {
        const N = buf.length;
        const recent = N - 1024;
        const r = Sound.rms(buf, recent), br = Sound.brightness(buf, recent);
        let out = null;
        if (pend) {
          pend.peak = Math.max(pend.peak, r);
          const age = now - pend.t;
          // A strum's bright pick attack is still there ~70 ms later (fresh strings);
          // a click's is gone after ~30 ms. Works even for a soft up-strum over a loud ring.
          const bright = age >= BRIGHT_SEC && br >= pend.beforeBr * 2 && r > MIN_LEVEL * 0.7;
          // Backup at 150 ms: still ringing, and clearly louder than before it started.
          const rings = age >= RING_SEC && r >= pend.peak * 0.3 && r >= pend.before * rise && r > MIN_LEVEL * 0.7;
          if (bright || rings || age >= RING_SEC) {
            if (bright || rings) out = pend.t;
            pend = null;
            quietUntil = now + 0.05;
            baseRms = r;               // the new ringing level is the new "before"
            baseBright = br;
          }
        } else if (now > quietUntil && baseRms) {
          const hit = (br > baseBright * 2.2 && br > MIN_LEVEL * 0.3) || (r > baseRms * 1.8 && r > MIN_LEVEL);
          if (hit) {
            // Pinpoint the start: first block (in the last ~40 ms) clearly above the level before.
            const from = Math.max(1, N - 2048);
            const lim = Math.max(baseRms * 1.5, MIN_LEVEL * 0.5);
            let at = recent;
            for (let i = from; i + BLOCK <= N; i += BLOCK) {
              let s = 0;
              for (let j = i; j < i + BLOCK; j++) s += buf[j] * buf[j];
              if (Math.sqrt(s / BLOCK) > lim) { at = i; break; }
            }
            // "before" = the quieter of the running level and the frame just before the strum
            pend = { t: now - (N - at) / sampleRate, peak: r, before: Math.min(baseRms, prevR || baseRms), beforeBr: Math.min(baseBright, prevBr || baseBright) };
          }
        }
        if (!pend) {
          // Running "room" level: follows a fading strum quickly, a rising sound slowly.
          baseRms = !baseRms ? r : r < baseRms ? baseRms * 0.6 + r * 0.4 : baseRms * 0.9 + r * 0.1;
          baseBright = !baseBright ? br : br < baseBright ? baseBright * 0.6 + br * 0.4 : baseBright * 0.9 + br * 0.1;
        }
        prevR = r;
        prevBr = br;
        return out;
      },
    };
  }

  return { offset, save, estimate, strumDetector };
})();
