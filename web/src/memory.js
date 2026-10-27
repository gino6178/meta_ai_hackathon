// Player memory: a small on-device retrieval store (the prototype's stand-in for the planned local vector DB).
// Entries are kept in this browser's localStorage; nothing is sent anywhere. Retrieval is TF-IDF cosine over
// word tokens (Latin) and character bigrams (CJK), so notes can be written in English or Chinese.

const KEY = "shuttlecoach.memory.v1";
const SEED = [
  { kind: "goal", text: "Goal for this season: win more rallies from rear-court defence and stop conceding smashes." },
  { kind: "body", text: "Right knee was sore after Sunday's session. Avoid jump training this week." },
  { kind: "routine", text: "Trains three times a week, about 90 minutes each, plus one gym session." },
  { kind: "preference", text: "Prefers short drills with clear targets; English or Chinese notes are fine." },
];

const now = () => new Date().toISOString();
let listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked or corrupt: fall through to the seed */ }
  return SEED.map((m, i) => ({ id: "seed" + i, ...m, at: now(), source: "demo" }));
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: keep in memory only */ }
  cache = list;
  listeners.forEach((f) => f(list));
}
let cache = read();

export const memory = {
  all: () => cache,
  add(text, kind = "note", source = "user") {
    const t = text.trim();
    if (!t) return;
    write([{ id: Math.random().toString(36).slice(2), kind, text: t, at: now(), source }, ...cache]);
  },
  remove(id) { write(cache.filter((m) => m.id !== id)); },
  // undo a remove: put the entry back where it was
  restore(entry, at = 0) { if (!cache.some((m) => m.id === entry.id)) write([...cache.slice(0, at), entry, ...cache.slice(at)]); },
  reset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } write(read()); },
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
  // keep one automatic summary per analysed match
  saveSession(id, text) {
    if (cache.some((m) => m.session === id)) return;
    write([{ id: "s" + id, session: id, kind: "session", text, at: now(), source: "auto" }, ...cache]);
  },
};

// ---- retrieval ----
function tokens(s) {
  const out = [];
  const lower = s.toLowerCase();
  (lower.match(/[a-z0-9]+/g) || []).forEach((w) => w.length > 2 && out.push(w.replace(/(ing|ed|es|s)$/, "")));
  const cjk = lower.match(/[\u4e00-\u9fff]+/g) || [];
  cjk.forEach((run) => { for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2)); if (run.length === 1) out.push(run); });
  return out;
}

export function retrieve(query, k = 3, list = cache) {
  const docs = list.map((m) => tokens(m.text + " " + m.kind));
  const df = {};
  docs.forEach((d) => new Set(d).forEach((w) => (df[w] = (df[w] || 0) + 1)));
  const N = docs.length || 1;
  const vec = (toks) => {
    const tf = {}; toks.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
    const v = {}; Object.entries(tf).forEach(([w, c]) => (v[w] = c * Math.log(1 + N / (df[w] || 1))));
    return v;
  };
  const q = vec(tokens(query));
  const qn = Math.hypot(...Object.values(q)) || 1;
  return list.map((m, i) => {
    const v = vec(docs[i]); const vn = Math.hypot(...Object.values(v)) || 1;
    let dot = 0; Object.entries(q).forEach(([w, x]) => (dot += x * (v[w] || 0)));
    return { m, score: dot / (qn * vn) };
  }).filter((r) => r.score > 0.04).sort((a, b) => b.score - a.score).slice(0, k);
}

export const mentions = (hits, re) => hits.some((h) => re.test(h.m.text));
