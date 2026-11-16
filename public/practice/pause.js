// Breaks — shared "are you still playing?" logic for every listening exercise.
//
// In plain words:
// • If the app hears no playing for 20 seconds, the exercise pauses and its
//   clock stops. Walking away never ruins a result.
// • While paused, it listens for you to start again: a sound that jumps above
//   the room noise AND keeps ringing for a moment (a strum or pluck rings,
//   a knock or a tap on the table dies away almost at once).

const Pause = (() => {
  const AFTER_MS = 20000;      // this long without playing → paused (fixed, not per sensitivity)
  const RING_MS = 150;         // a sound must keep going this long to count as playing
  const MIN_RMS = 0.006;       // quieter than this is never "playing"

  // Feed it the mic buffer every frame; returns true once when you start playing.
  function playDetector() {
    let floor = 0;             // room-noise level, follows the quiet moments
    let loudSince = 0;
    let fired = false;
    return {
      reset() { floor = 0; loudSince = 0; fired = false; },
      feed(buf, nowMs) {
        const r = Sound.rms(buf, buf.length - 1024); // newest ~20 ms
        if (!floor) floor = r;
        const loud = r > Math.max(MIN_RMS, floor * 4);
        if (!loud) {
          floor = r < floor ? r : floor + (r - floor) * 0.02;
          loudSince = 0;
          fired = false;
          return false;
        }
        if (!loudSince) loudSince = nowMs;
        if (!fired && nowMs - loudSince >= RING_MS) {
          fired = true;
          return true;
        }
        return false;
      },
    };
  }

  return { AFTER_MS, AFTER_SEC: AFTER_MS / 1000, playDetector };
})();
