// Knowledge base for the coaches (RAG): papers found by the research agent and the findings extracted from them,
// each finding embedded on the server's GPU (Ollama, qwen3-embedding) and searched by cosine similarity.
// Small enough to live in one JSON file; every finding keeps its citation so a coach can quote it as [E#].
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve(process.env.KB_FILE || "data/kb.json");
const EMBED_URL = (process.env.EMBED_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const EMBED_MODEL = process.env.EMBED_MODEL || "qwen3-embedding:0.6b";
let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { papers: {}, findings: [], runs: [] };
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); };

export async function embed(texts) {
  const r = await fetch(`${EMBED_URL}/api/embed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: EMBED_MODEL, input: texts }) });
  if (!r.ok) throw new Error(`embed ${r.status}`);
  return (await r.json()).embeddings;
}
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / Math.sqrt(na * nb); };

export const hasPaper = (key) => !!db.papers[key];
export const paper = (key) => db.papers[key];
export const stats = () => ({ papers: Object.keys(db.papers).length, findings: db.findings.length, runs: db.runs.length, lastRun: db.runs[db.runs.length - 1] ?? null });
export const listFindings = () => db.findings.map(({ vec, ...f }) => ({ ...f, paper: db.papers[f.paper] }));
export const runs = () => db.runs.slice(-20).reverse();

export function addPaper(p) { db.papers[p.key] = { ...p, addedAt: Date.now() }; save(); }

export async function addFindings(paperKey, items) {
  if (!items.length) return [];
  const vecs = await embed(items.map((f) => `${f.claim} ${f.practice ?? ""}`));
  const added = items.map((f, i) => ({ id: `E${db.findings.length + i + 1}`, paper: paperKey, ...f, vec: vecs[i], at: Date.now() }));
  db.findings.push(...added); save();
  return added;
}

// findings stored before areas were inferred get them once, from the paper title and the finding text
export function backfillAreas(infer) {
  let n = 0;
  for (const f of db.findings) if (!f.areas?.length) { const p = db.papers[f.paper]; f.areas = infer(`${p?.title ?? ""} ${f.claim} ${f.practice ?? ""}`); n += f.areas.length > 0; }
  if (n) save();
  return n;
}
export function logRun(run) { db.runs.push(run); db.runs = db.runs.slice(-100); save(); }

// top-k findings for a question, optionally preferring a coach's area
export async function search(query, { k = 4, area = null, min = 0.35 } = {}) {
  if (!db.findings.length) return [];
  const [q] = await embed([query]);
  return db.findings.map((f) => ({ f, s: cos(q, f.vec) + (area && f.areas?.includes(area) ? 0.05 : 0) }))
    .filter((x) => x.s >= min).sort((a, b) => b.s - a.s).slice(0, k)
    .map(({ f, s }) => { const { vec, ...rest } = f; return { ...rest, score: +s.toFixed(3), paper: db.papers[f.paper] }; });
}

// the citation line a coach prints next to [E#]
export const cite = (p) => `${(p.authors?.[0] || "").split(" ").pop() || "Unknown"}${p.authors?.length > 1 ? " et al." : ""} ${p.year ?? ""}${p.venue ? `, ${p.venue}` : ""}`.trim();
