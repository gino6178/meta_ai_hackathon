// Scholarly search clients: OpenAlex (main: open abstracts, no key), arXiv, and Semantic Scholar (best effort; it
// rate-limits without an API key). Only the topic query is sent out, never player data. Results are normalised to
// { key, title, authors, year, venue, doi, url, abstract, source, cited } and de-duplicated by DOI or title.
const UA = { "user-agent": "ShuttleCoach-research-agent/0.1 (badminton coaching research prototype)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const keyOf = (p) => (p.doi ? `doi:${p.doi.toLowerCase()}` : `t:${norm(p.title).slice(0, 120)}`);

function openAlexAbstract(inv) {
  if (!inv) return "";
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const i of pos) words[i] = w;
  return words.filter(Boolean).join(" ");
}

export async function openalex(query, n = 8) {
  const u = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${n}&filter=has_abstract:true&sort=relevance_score:desc`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`OpenAlex ${r.status}`);
  return (await r.json()).results.map((w) => ({
    title: w.title, year: w.publication_year, venue: w.primary_location?.source?.display_name ?? null,
    authors: (w.authorships || []).slice(0, 6).map((a) => a.author?.display_name).filter(Boolean),
    doi: w.doi ? w.doi.replace("https://doi.org/", "") : null, url: w.doi || w.id, abstract: openAlexAbstract(w.abstract_inverted_index),
    cited: w.cited_by_count ?? 0, source: "OpenAlex",
  }));
}

export async function arxiv(query, n = 4) {
  const u = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${query}`)}&max_results=${n}&sortBy=relevance`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`arXiv ${r.status}`);
  const xml = await r.text(), tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]?.replace(/\s+/g, " ").trim();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: tag(e, "title"), year: +(tag(e, "published") || "").slice(0, 4) || null, venue: "arXiv",
    authors: [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]).slice(0, 6), doi: null,
    url: tag(e, "id"), abstract: tag(e, "summary"), cited: 0, source: "arXiv",
  }));
}

export async function semanticScholar(query, n = 6) {
  const u = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${n}&fields=title,year,venue,authors,externalIds,abstract,citationCount,url`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(u, { headers: { ...UA, ...(process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : {}) }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`Semantic Scholar ${r.status}`);
    return ((await r.json()).data || []).filter((p) => p.abstract).map((p) => ({
      title: p.title, year: p.year, venue: p.venue || null, authors: (p.authors || []).slice(0, 6).map((a) => a.name),
      doi: p.externalIds?.DOI ?? null, url: p.url, abstract: p.abstract, cited: p.citationCount ?? 0, source: "Semantic Scholar",
    }));
  }
  return []; // still rate-limited: skip this source for now
}

// all sources, merged; a failing source never stops the others
export async function searchAll(query) {
  const res = await Promise.allSettled([openalex(query), arxiv(query), semanticScholar(query)]);
  const seen = new Map(), errors = [];
  res.forEach((r, i) => {
    if (r.status === "rejected") { errors.push(`${["OpenAlex", "arXiv", "Semantic Scholar"][i]}: ${r.reason.message}`); return; }
    for (const p of r.value) if (p.title && p.abstract && p.abstract.length > 200) { const k = keyOf(p); if (!seen.has(k)) seen.set(k, { ...p, key: k }); }
  });
  return { papers: [...seen.values()], errors };
}
