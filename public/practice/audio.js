// Shared audio tools: microphone access + YIN pitch detection.
// Used by the tuner and the clean chord check (chord hearing is in chords.js).

const Sound = (() => {
  const MIN_FREQ = 60;    // lowest pitch we look for (Hz)
  const MAX_FREQ = 1000;  // highest pitch we look for (Hz)

  // Open strings, low E → high e
  const OPEN_STRINGS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

  let ctx = null;
  let stream = null;
  let curve = null;

  // ---------- Microphone ----------
  // Must be called from a tap (phones block audio otherwise).
  // size = how much recent sound we keep (4096 ≈ 0.09 s, 32768 ≈ 0.7 s).
  async function openMic(size = 4096) {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    closeMic();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Phone "voice" processing distorts music, so turn it off.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = size;
    source.connect(analyser);
    return { analyser, sampleRate: ctx.sampleRate, buffer: new Float32Array(analyser.fftSize) };
  }

  function closeMic() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // ---------- YIN ----------
  // Builds the "how well does the wave match itself shifted by tau samples" curve.
  // Low value at tau = the sound repeats every tau samples (a clear note).
  // A value of 0.2 at a tau roughly means "80% of the sound repeats at this period".
  function yinCurve(buf, sampleRate) {
    const tauMax = Math.ceil(sampleRate / MIN_FREQ);
    if (!curve || curve.length !== tauMax + 2) curve = new Float32Array(tauMax + 2);
    const d = curve;
    const W = Math.min(2048, buf.length - tauMax - 1);

    d[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      // Normalize so the numbers mean the same at any volume.
      runningSum += sum;
      d[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
    }
    return d;
  }

  // Picks the note from the curve: the FIRST shift that matches well
  // (taking the first one avoids octave mistakes on guitar).
  function yinPick(d, sampleRate, threshold = 0.15) {
    const tauMin = Math.floor(sampleRate / MAX_FREQ);
    const tauMax = d.length - 2;
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return null;

    // Refine between samples for sub-sample precision.
    let better = tau;
    if (tau > 1 && tau < tauMax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const denom = a + c - 2 * b;
      if (denom !== 0) better = tau + (a - c) / (2 * denom);
    }
    const freq = sampleRate / better;
    return freq >= MIN_FREQ && freq <= MAX_FREQ ? freq : null;
  }

  function yin(buf, sampleRate, threshold) {
    return yinPick(yinCurve(buf, sampleRate), sampleRate, threshold);
  }

  // ---------- Helpers ----------
  function rms(buf, from = 0) {
    let sum = 0;
    for (let i = from; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / (buf.length - from));
  }

  // Loudness of only the sharp, bright part of the sound (a pick attack).
  function brightness(buf, from = 0) {
    let sum = 0;
    for (let i = Math.max(1, from); i < buf.length; i++) {
      const diff = buf[i] - buf[i - 1];
      sum += diff * diff;
    }
    return Math.sqrt(sum / (buf.length - from));
  }

  // The audio clock (for a sample-accurate metronome). Valid after openMic().
  function context() {
    return ctx;
  }

  return {
    OPEN_STRINGS, openMic, closeMic, context,
    yin, yinCurve, yinPick,
    rms, brightness,
  };
})();
