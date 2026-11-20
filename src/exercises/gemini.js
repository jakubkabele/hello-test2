// Talking to /api/song (which talks to Gemini), and getting files ready on the phone first.
//
// The server piece only accepts ~4.5 MB per request, so everything is made small here:
//  • pictures → shrunk to 1600 px, saved as JPEG
//  • PDF → sent as it is (up to 3 MB)
//  • audio (mp3 …) → decoded, mixed to mono, resampled to 12 kHz, first 2 minutes, as WAV
//    (12 kHz keeps everything up to 6 kHz — plenty to hear chords; Gemini listens at 16 kHz anyway)
//  • video (mp4 …) → up to 16 still frames spread over the video + its sound (as above)
// Plain words: a phone video is far too big to send, but a few pictures from it plus its sound,
// squeezed small, carry what's needed to read the chords.

const URL_API = '/api/song/';
const BUDGET = 4.1 * 1024 * 1024;          // bytes of base64 we allow in one request
const AUDIO_RATE = 12000, AUDIO_SEC = 120;

let statusCache = null;
export function status(force = false) {
  if (statusCache && !force) return statusCache;
  statusCache = fetch(`${URL_API}?status`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { key: 'unavailable' }))
    .catch(() => ({ key: 'unavailable' }));
  return statusCache;
}

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const blobB64 = async (blob) => b64(await blob.arrayBuffer());
const canvasJpeg = (c, q) => new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', q));

async function shrinkImage(file, max = 1600, q = 0.82) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return { mime: 'image/jpeg', data: await blobB64(await canvasJpeg(c, q)) };
}

// decode any audio (or a video's sound) → mono 12 kHz samples, first 2 minutes
async function decodeSmall(arrayBuf) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  let decoded;
  try { decoded = await ctx.decodeAudioData(arrayBuf.slice(0)); } finally { ctx.close && ctx.close(); }
  const sec = Math.min(AUDIO_SEC, decoded.duration);
  const off = new OfflineAudioContext(1, Math.ceil(sec * AUDIO_RATE), AUDIO_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start(0);
  const samples = (await off.startRendering()).getChannelData(0);
  return { samples, seconds: Math.round(sec), full: Math.round(decoded.duration) };
}
// mono samples → 16-bit WAV (as base64), only the first `sec` seconds
function wavB64(all, sec) {
  const out = all.subarray(0, Math.min(all.length, Math.round(sec * AUDIO_RATE)));
  // normalise so quiet recordings are still clear
  let peak = 0.0001; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = Math.min(8, 0.9 / peak);
  const wav = new DataView(new ArrayBuffer(44 + out.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); wav.setUint32(4, 36 + out.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
  wav.setUint32(24, AUDIO_RATE, true); wav.setUint32(28, AUDIO_RATE * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
  w(36, 'data'); wav.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i] * g)) * 0x7fff, true);
  return b64(wav.buffer);
}

// still frames spread over a video
async function videoFrames(file, count = 16, max = 768) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((ok, fail) => { v.onloadedmetadata = ok; v.onerror = () => fail(new Error('video')); });
    const dur = v.duration || 0;
    const n = Math.max(1, Math.min(count, Math.ceil(dur / 4)));
    const k = Math.min(1, max / Math.max(v.videoWidth || max, v.videoHeight || max));
    const c = document.createElement('canvas');
    c.width = Math.round((v.videoWidth || max) * k); c.height = Math.round((v.videoHeight || max) * k);
    const g = c.getContext('2d');
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = dur * ((i + 0.5) / n);
      await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; setTimeout(ok, 2500); });
      g.drawImage(v, 0, 0, c.width, c.height);
      frames.push({ mime: 'image/jpeg', data: await blobB64(await canvasJpeg(c, 0.7)) });
    }
    return { frames, duration: dur };
  } finally { URL.revokeObjectURL(url); }
}

// files the person picked → parts for the request. onStep(text) reports progress.
export async function prepare(files, onStep = () => {}) {
  const parts = [], notes = [];
  for (const f of files) {
    const type = f.type || '';
    const name = f.name || 'file';
    if (type.startsWith('image/')) {
      onStep(`${name}: making it smaller`);
      parts.push(await shrinkImage(f));
    } else if (type === 'application/pdf') {
      if (f.size > 3 * 1024 * 1024) throw new Error(`${name} is over 3 MB — screenshot the chord pages instead`);
      parts.push({ mime: 'application/pdf', data: await blobB64(f) });
    } else if (type.startsWith('audio/')) {
      onStep(`${name}: making the sound small`);
      const a = await decodeSmall(await f.arrayBuffer());
      parts.push({ mime: 'audio/wav', samples: a.samples, sec: a.seconds, full: a.full, name });
    } else if (type.startsWith('video/')) {
      onStep(`${name}: taking pictures`);
      const v = await videoFrames(f);
      parts.push(...v.frames.map((x) => ({ ...x, frame: true })));
      if (f.size < 250 * 1024 * 1024) {
        onStep(`${name}: taking the sound`);
        try {
          const a = await decodeSmall(await f.arrayBuffer());
          parts.push({ mime: 'audio/wav', samples: a.samples, sec: a.seconds, full: a.full, name });
        } catch { notes.push(`${name}: no sound could be read — pictures only`); }
      } else notes.push(`${name}: too big for its sound — pictures only`);
    } else {
      throw new Error(`${name}: this kind of file can’t be read`);
    }
  }
  // Fit into one request: first fewer video pictures (down to 6 per video), then shorter sound
  // (the longest recording is cut by a fifth at a time, never below 20 s).
  const audioB64 = (sec) => Math.ceil(((44 + sec * AUDIO_RATE * 2) * 4) / 3);
  const sizeOf = () => parts.reduce((a, p) => a + (p.samples ? audioB64(p.sec) : p.data.length), 0);
  let size = sizeOf(), cut = false, fewer = false;
  while (size > BUDGET) {
    const frames = parts.map((p, k) => (p.frame ? k : -1)).filter((k) => k >= 0);
    const longest = parts.filter((p) => p.samples).sort((a, b) => b.sec - a.sec)[0];
    if (frames.length > 6) { parts.splice(frames[Math.floor(frames.length / 2)], 1); fewer = true; }
    else if (longest && longest.sec > 20) { longest.sec = Math.max(20, Math.floor(longest.sec * 0.8)); cut = true; }
    else throw new Error('Too much at once — try fewer or smaller files');
    size = sizeOf();
  }
  if (fewer) notes.push('fewer video pictures sent to fit');
  parts.forEach((p) => {
    if (!p.samples) return;
    p.data = wavB64(p.samples, p.sec);
    if (p.full > p.sec) notes.push(`${p.name}: first ${p.sec} s of sound sent${cut ? ' (to fit)' : ''}`);
  });
  return { parts: parts.map(({ mime, data }) => ({ mime, data })), notes, bytes: Math.round(size * 0.75) };
}

export async function ask(payload) {
  const r = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!j) return { error: r.status === 404 ? 'unavailable' : 'failed', detail: `status ${r.status}` };
  return j;
}
