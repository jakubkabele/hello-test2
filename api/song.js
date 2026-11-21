// /api/song — the small server piece between the app and Google Gemini.
//
// Why it exists: the Gemini key must stay secret. Anything inside the website can be read by
// anyone, so the key lives only here (Vercel → Settings → Environment Variables → GEMINI_API_KEY).
// This function stores nothing: it passes your material to Gemini and the chords back.
//
//   GET  /api/song/?status            → { key: 'found' | 'missing', works: true | false | null, model }
//                                        (asks Google whether the key is accepted; never shows the key)
//   POST /api/song/  { mode: 'own', parts: [{ mime, data(base64), name }], note }
//                    { mode: 'web', title, artist, link, note }
//                                      → { song: { title, artist, capo, bpm, key, sections, unsure, notes }, sources, model }
//                                      or { error: 'nokey' | 'key' | 'limit' | 'unreadable' | 'bad' | 'busy' | 'failed', detail }
//
// Gemini is asked for chords only — never lyrics — and the answer is checked and trimmed here
// before it reaches the phone. Model: GEMINI_MODEL if set, else the current Flash model.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean);
const MAX_BYTES = 4.3 * 1024 * 1024;           // Vercel accepts ~4.5 MB per request
const MIMES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|audio\/(wav|x-wav|mpeg|mp3|mp4|aac|ogg|webm|flac)|video\/(mp4|webm|quicktime))$/;
const ALLOWED_HOSTS = /(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    artist: { type: 'STRING' },
    capo: { type: 'INTEGER' },
    bpm: { type: 'INTEGER' },
    key: { type: 'STRING' },
    sections: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, chords: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['name', 'chords'] },
    },
    unsure: { type: 'ARRAY', items: { type: 'STRING' } },
    notes: { type: 'STRING' },
  },
  required: ['title', 'sections'],
};

const RULES = `You turn guitar song material into a chord chart for a practice app.
Answer with JSON only, in this shape:
{"title": string, "artist": string, "capo": integer (0 if none), "bpm": integer or 0 if unknown, "key": string or "",
 "sections": [{"name": "Intro|Verse|Pre-chorus|Chorus|Bridge|Solo|Riff|Outro", "chords": ["Am", "F", ...]}],
 "unsure": [chord names you are not sure about], "notes": one or two short sentences}
Rules:
- Chord symbols ONLY. Never include lyrics or any words from the lyrics.
- Standard chord names: C, Am, F#m7, Bb, Ebmaj7, Cadd9, Dsus4, G/B, E5, Bdim, Bm7b5.
- Chords in playing order. Each section once per time it is played (Verse, Chorus, Verse, Chorus …), at most 24 sections.
  Within a section list each chord change once (do not repeat a chord for every bar unless it really changes back).
- If a capo is used, give the chord SHAPES as played with the capo, and the capo fret in "capo".
- If you cannot find or hear the song's chords, return "sections": [] and say why in "notes". Never invent a song.`;

// ── helpers ──
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const CHORD = /^[A-G][#b♯♭]?[a-zA-Z0-9#b♭♯+°ø()\-]{0,9}(\/[A-G][#b♯♭]?)?$/;

// keep only what the app needs, in safe sizes
export function cleanSong(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const sections = (Array.isArray(s.sections) ? s.sections : []).slice(0, 24).map((x) => ({
    name: clip(x && x.name, 20) || 'Verse',
    chords: (Array.isArray(x && x.chords) ? x.chords : []).map((c) => clip(c, 12).replace(/♯/g, '#').replace(/♭/g, 'b')).filter((c) => CHORD.test(c)).slice(0, 48),
  })).filter((x) => x.chords.length);
  const n = (v, lo, hi) => { const k = Math.round(Number(v)); return Number.isFinite(k) && k >= lo && k <= hi ? k : 0; };
  return {
    title: clip(s.title, 80), artist: clip(s.artist, 80), capo: n(s.capo, 0, 12), bpm: n(s.bpm, 30, 260), key: clip(s.key, 12),
    sections,
    unsure: (Array.isArray(s.unsure) ? s.unsure : []).map((c) => clip(c, 12)).filter((c) => CHORD.test(c)).slice(0, 24),
    notes: clip(s.notes, 300),
  };
}

// the JSON inside a reply (Gemini sometimes wraps it in ``` fences when search is on)
export function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* look for the outermost object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* give up */ } }
  return null;
}

const isYouTube = (u) => /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/i.test(u);

async function callGemini(key, body) {
  let last = null;
  for (const model of MODELS) {
    const r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (r.status === 404) { last = { status: 404, model }; continue; }       // model name retired → try the next
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data, model };
  }
  return last || { status: 404, data: {}, model: MODELS[MODELS.length - 1] };
}

// ── the handler ──
// The key's name in Vercel: GEMINI_API_KEY (GOOGLE_API_KEY also works — Google's own tools use it).
const keyFromEnv = () => (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
// For the status page when the key isn't found: names (never values) of settings that look like a key,
// so a typo in the name is easy to spot, and which Vercel environment this is (production / preview).
const lookalikes = () => Object.keys(process.env).filter((n) => /GEMINI|GOOGLE|API_?KEY/i.test(n) && !/^VERCEL|^NOW_/i.test(n)).slice(0, 10);

export default async function handler(req, res) {
  const key = keyFromEnv();

  if (req.method === 'GET') {
    if (!('status' in (req.query || {}))) return send(res, 404, { error: 'bad' });
    const env = process.env.VERCEL_ENV || 'unknown';
    if (!key) return send(res, 200, { key: 'missing', works: null, env, lookingFor: 'GEMINI_API_KEY', similarNames: lookalikes() });
    // ask Google whether it accepts the key (lists models; costs nothing)
    try {
      const r = await fetch(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': key } });
      return send(res, 200, { key: 'found', works: r.ok, code: r.status, env, model: MODELS[0] });
    } catch {
      return send(res, 200, { key: 'found', works: null, env, model: MODELS[0] });
    }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'bad' });

  // only our own site may use it (stops casual use of the free quota by others)
  const origin = req.headers.origin || req.headers.referer || '';
  let host = '';
  try { host = new URL(origin).hostname; } catch { host = ''; }
  if (origin && !ALLOWED_HOSTS.test(host) && host !== (req.headers.host || '').split(':')[0]) return send(res, 403, { error: 'bad', detail: 'origin' });

  if (!key) return send(res, 200, { error: 'nokey' });
  const b = req.body && typeof req.body === 'object' ? req.body : parseJson(req.body);
  if (!b) return send(res, 400, { error: 'bad' });

  const parts = [];
  let body;
  if (b.mode === 'own') {
    const files = Array.isArray(b.parts) ? b.parts.slice(0, 40) : [];
    if (!files.length) return send(res, 400, { error: 'bad', detail: 'no files' });
    let bytes = 0;
    for (const f of files) {
      const mime = String(f && f.mime || '').toLowerCase();
      const data = String(f && f.data || '');
      if (!MIMES.test(mime) || !/^[A-Za-z0-9+/=]+$/.test(data)) return send(res, 400, { error: 'bad', detail: `file type ${mime}` });
      bytes += data.length * 0.75;
      parts.push({ inline_data: { mime_type: mime, data } });
    }
    if (bytes > MAX_BYTES) return send(res, 413, { error: 'bad', detail: 'too big' });
    const note = clip(b.note, 300);
    parts.unshift({ text: `${RULES}\n\nThe material: ${files.length} file(s) — screenshots/photos/PDF of a chord sheet, and/or audio of the song, and/or still frames from a video of it (in time order). Read chord sheets exactly; for audio, listen for the chords.${note ? `\nThe player adds: "${note}"` : ''}` });
    body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } };
  } else if (b.mode === 'web') {
    const title = clip(b.title, 100), artist = clip(b.artist, 100), link = clip(b.link, 300), note = clip(b.note, 300);
    if (!title) return send(res, 400, { error: 'bad', detail: 'no title' });
    if (link && !/^https?:\/\//i.test(link)) return send(res, 400, { error: 'bad', detail: 'link' });
    if (link && isYouTube(link)) parts.push({ file_data: { file_uri: link } });
    parts.push({ text: `${RULES}\n\nFind the guitar chords of the song "${title}"${artist ? ` by ${artist}` : ''}. Use Google Search to look at chord sites and pick the version most guitarists play.${link ? (isYouTube(link) ? '\nThe attached YouTube video is this song (or a lesson for it) — use it too.' : `\nThis page is about the song: ${link}`) : ''}${note ? `\nThe player adds: "${note}"` : ''}\nRemember: JSON only, chords only, no lyrics.` });
    const tools = [{ google_search: {} }];
    if (link && !isYouTube(link)) tools.push({ url_context: {} });
    body = { contents: [{ role: 'user', parts }], tools, generationConfig: { temperature: 0.2 } };
  } else {
    return send(res, 400, { error: 'bad' });
  }

  let out;
  try { out = await callGemini(key, body); } catch (e) { return send(res, 502, { error: 'failed', detail: 'network' }); }
  const { status, data, model } = out;
  if (status === 429) return send(res, 200, { error: 'limit' });
  if (status === 400 && /API key/i.test(JSON.stringify(data))) return send(res, 200, { error: 'key' });
  if (status === 401 || status === 403) return send(res, 200, { error: 'key' });
  if (status === 503) return send(res, 200, { error: 'busy' });
  if (status !== 200) return send(res, 200, { error: 'failed', detail: clip(data && data.error && data.error.message, 200) || `status ${status}` });

  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map((p) => p.text || '').join('') : '';
  const song = cleanSong(parseJson(text));
  const sources = ((cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [])
    .map((c) => c.web).filter(Boolean).slice(0, 6).map((w) => ({ title: clip(w.title, 80), url: clip(w.uri, 500) }));
  if (!song.sections.length) return send(res, 200, { error: 'unreadable', detail: song.notes, sources });
  return send(res, 200, { song, sources, model });
}
