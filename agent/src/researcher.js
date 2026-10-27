// Research agent: turns what the coaches need to know into literature searches, screens what comes back, and adds
// grounded findings to the knowledge base. Needs come from the facts sheet (the player's weaknesses), the players'
// memories (injuries, goals) and each coach's area. A finding is kept only if every number in it is in the abstract.
import { chat } from "./llm.js";
import { searchAll } from "./scholar.js";
import * as kb from "./kb.js";
import * as store from "./store.js";
import { factSheet } from "./facts.js";

const AREAS = ["tactics", "technique", "fitness", "analyst", "nutrition"];
const BASE = [
  "badminton lunge knee joint loading",
  "badminton net shot technique accuracy training",
  "badminton anticipation perceptual training reaction",
  "racket sport fatigue match performance decline",
  "badminton smash defence footwork training",
  "patellar tendinopathy load management athletes",
  "carbohydrate protein timing recovery racket sport athletes",
];
const json = (t, fallback) => { try { return JSON.parse((t.match(/[[{][\s\S]*[\]}]/) || [""])[0]); } catch { return fallback; } };
const nums = (s) => (String(s).match(/\d+(?:\.\d+)?/g) || []).map(Number);
// small models sometimes return several arrays or loose lines: take every quoted string instead
const strings = (t) => { const j = json(t, null); return Array.isArray(j) ? j.filter((x) => typeof x === "string") : [...t.matchAll(/"([^"\n]{6,120})"/g)].map((m) => m[1]); };
const KEYS = { fitness: /knee|tendon|tendin|injur|fatigue|load|strength|muscle|lunge|landing|pain|recovery/i, tactics: /anticipat|tactic|decision|position|perceptual|opponent|strateg/i,
  technique: /technique|stroke|smash|net shot|serve|grip|kinematic|racket|shuttle speed|accuracy/i, analyst: /notational|statistic|match analysis|performance indicator|data|pattern/i,
  nutrition: /nutrition|diet|carbohydrate|protein intake|hydration|meal|glycogen|caffeine/i };
const infer = (text) => Object.keys(KEYS).filter((a) => KEYS[a].test(text));
kb.backfillAreas(infer);

// what to look for: the player's weak points and reported problems, turned into scholarly queries
export async function needs(extra = []) {
  const s = factSheet("A");
  const mem = store.players().flatMap((p) => p.memories.map((m) => m.text)).slice(-12);
  try {
    const r = await chat([
      { role: "system", content: "You plan literature searches for a badminton coaching staff. Turn the player's problems into the scientific topics a sports scientist would search: English, 3 to 7 words, no numbers, no player names. Good examples: \"badminton lunge knee joint loading\", \"perceptual training anticipation racket sports\", \"patellar tendinopathy return to sport\". Return one JSON array of strings only." },
      { role: "user", content: `Match facts:\n${s.facts.map((f) => f.text).join("\n")}\n\nWhat players told the coaches:\n${mem.join("\n") || "(nothing)"}\n\nExtra topics: ${extra.join("; ") || "none"}\n\nWrite 6 queries.` },
    ], { maxTokens: 200, temperature: 0.3 });
    const q = strings(r.text).filter((x) => x.length > 8 && !/\d/.test(x)).slice(0, 6);
    const all = [...new Set([...extra, ...q])].slice(0, 8);
    return all.length >= 3 ? all : [...new Set([...all, ...BASE])].slice(0, 8);
  } catch { return [...extra, ...BASE].slice(0, 8); }
}

async function screen(p) {
  const r = await chat([
    { role: "system", content: `You screen papers for a badminton coaching staff (areas: tactics, technique, fitness and injury, match data). Is this paper useful evidence for coaching badminton players? Racket sports and general sports science on the same topic count. Return JSON only: {"useful": true|false, "areas": [subset of ${JSON.stringify(AREAS)}], "why": "one short reason"}.` },
    { role: "user", content: `Title: ${p.title}\nAbstract: ${p.abstract.slice(0, 1800)}` },
  ], { maxTokens: 120, temperature: 0 });
  const v = json(r.text, { useful: false });
  return { ...v, areas: (v.areas || []).filter((a) => AREAS.includes(a)) };
}

async function extract(p, areas) {
  const r = await chat([
    { role: "system", content: `Extract at most 3 findings a coach could act on from this abstract. Use only what the abstract states; copy numbers exactly. Return a JSON array only: [{"claim": "what the study found, one sentence", "practice": "what a coach could do with it, one sentence", "studyType": "RCT|cohort|cross-sectional|review|case|biomechanics|other", "population": "who was studied", "confidence": "high|medium|low", "areas": ${JSON.stringify(areas)}}]` },
    { role: "user", content: `Title: ${p.title} (${p.year})\nAbstract: ${p.abstract.slice(0, 2500)}` },
  ], { maxTokens: 500, temperature: 0 });
  const abstractNums = new Set(nums(p.abstract));
  // grounding: a finding whose numbers are not in the abstract is dropped, not trusted
  return json(r.text, []).filter((f) => f?.claim && nums(f.claim).every((n) => abstractNums.has(n) || (Number.isInteger(n) && n <= 10)))
    .map((f) => {
      const a = (f.areas || []).filter((x) => AREAS.includes(x));
      return { ...f, areas: a.length ? a : areas.length ? areas : infer(`${p.title} ${f.claim} ${f.practice ?? ""}`) };
    });
}

export async function run({ topics = [], maxPapers = 8 } = {}) {
  const t0 = Date.now(), log = { at: t0, queries: [], found: 0, screened: 0, kept: 0, findings: [], errors: [], skipped: 0 };
  log.queries = await needs(topics);
  const candidates = [];
  for (const q of log.queries) {
    const { papers, errors } = await searchAll(q);
    log.errors.push(...errors.map((e) => `${q}: ${e}`));
    for (const p of papers) {
      if (kb.hasPaper(p.key) || candidates.some((c) => c.key === p.key)) { log.skipped++; continue; }
      candidates.push({ ...p, query: q });
    }
  }
  log.found = candidates.length;
  // most-cited first, a few per query so one topic cannot fill the run
  const perQuery = {};
  const ordered = candidates.sort((a, b) => (b.cited || 0) - (a.cited || 0)).filter((p) => (perQuery[p.query] = (perQuery[p.query] || 0) + 1) <= 3);
  for (const p of ordered) {
    if (log.kept >= maxPapers) break;
    log.screened++;
    const sc = await screen(p).catch(() => ({ useful: false }));
    if (!sc.useful) continue;
    const found = await extract(p, sc.areas || []).catch(() => []);
    if (!found.length) continue;
    kb.addPaper({ key: p.key, title: p.title, authors: p.authors, year: p.year, venue: p.venue, doi: p.doi, url: p.url, cited: p.cited, source: p.source, query: p.query, why: sc.why, abstract: p.abstract });
    const added = await kb.addFindings(p.key, found);
    log.kept++; log.findings.push(...added.map((f) => f.id));
  }
  log.seconds = Math.round((Date.now() - t0) / 1000);
  kb.logRun(log);
  return log;
}
