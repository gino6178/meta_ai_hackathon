// Coach evaluation on Muse Glimmer: a fixed set of player questions (English and Traditional Chinese) sent through the
// gateway, as the web app sends them. Records latency, verifier result, retries and fallbacks, and writes a markdown
// report for the submission.
//   node test/glimmer_eval.mjs [gateway=http://127.0.0.1:8790] [out=../submission/glimmer_eval.md]
import fs from "node:fs";

const GW = process.argv[2] || "http://127.0.0.1:8790";
const OUT = process.argv[3] || "../submission/glimmer_eval.md";
const Q = [
  ["tactics", "Where do I lose most points?"],
  ["tactics", "Which zone should I cover earlier, and how?"],
  ["tactics", "How does my opponent win points against me?"],
  ["technique", "How many net errors did I make?"],
  ["technique", "Which stroke should I fix first?"],
  ["technique", "Why do I keep losing points at the net?"],
  ["fitness", "My right knee is sore. What should I train this week?"],
  ["fitness", "Am I getting tired late in the match?"],
  ["fitness", "Which muscles does my game load most?"],
  ["analyst", "What are my opponent's habits?"],
  ["analyst", "Which patterns lose me rallies?"],
  ["analyst", "How often am I stretched to reach the shuttle?"],
  ["head", "What should I focus on this week?"],
  ["head", "Sum up my match in three sentences."],
  ["technique", "我網前失誤有幾次？"],
  ["head", "我這週該練什麼？"],
  ["tactics", "對手最常把球打到哪裡？"],
  ["fitness", "我的膝蓋有點痛，這週可以練跳躍嗎？"],
];

const post = (path, body) => fetch(GW + path, { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:5191" }, body: JSON.stringify(body) }).then((r) => r.json());
const status = await fetch(GW + "/api/status").then((r) => r.json());
console.log("model:", status.llm?.model, status.llm?.ready ? "ready" : status.llm?.error);

// warm-up: the first request loads the model onto the GPU
await post("/api/chat", { coach: "head", message: "Hello", history: [] }).catch(() => {});

const rows = [];
for (const [coach, q] of Q) {
  const t0 = Date.now();
  let r;
  try { r = await post("/api/chat", { coach, message: q, history: [] }); } catch (e) { r = { error: String(e) }; }
  const secs = (Date.now() - t0) / 1000;
  const v = r.verified || {};
  const text = (r.text || "").trim();
  // an empty reply has nothing to verify, so it counts as a failure, not a pass
  const row = {
    coach, q, secs, ok: !!v.ok && text.length > 0, empty: !text, numbers: v.numbers ?? 0, tries: r.tries ?? 0, fallback: !!(v.rejected || v.offline), cites: (r.cites || []).length,
    tps: r.timing?.tokens_per_s ?? null, text: (r.text || r.error || "").replace(/\s+/g, " ").trim(),
  };
  rows.push(row);
  console.log(`${row.ok ? "✓" : "✗"} ${secs.toFixed(1).padStart(5)} s  tries ${row.tries}  ${row.fallback ? "FALLBACK" : "model"}  ${coach.padEnd(9)} ${q}`);
}

const n = rows.length, pct = (k) => Math.round((100 * rows.filter(k).length) / n);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const lat = rows.map((r) => r.secs), tps = rows.map((r) => r.tps).filter(Boolean);
const md = `# Muse Glimmer coach evaluation

Run on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC against the coach gateway, with the same requests the web app sends.
Model: \`${status.llm?.model}\` on ${status.llm?.device ?? "GPU"} (Meta open weights, served by Ollama). ${n} player questions, ${Q.filter(([, q]) => /[一-鿿]/.test(q)).length} of them in Traditional Chinese, across all five coaches.

| Measure | Result |
|---|---|
| Replies shown with every number verified (empty replies count as failures) | ${pct((r) => r.ok)}% |
| Numbers checked by the verifier | ${rows.reduce((a, r) => a + r.numbers, 0)} in ${n} replies |
| Empty replies | ${rows.filter((r) => r.empty).length} |
| Answered by the model (not replaced by the raw fact) | ${pct((r) => !r.fallback)}% |
| Answered on the first try | ${pct((r) => r.tries === 1)}% |
| Replies that cite at least one fact | ${pct((r) => r.cites > 0)}% |
| Median reply time | ${med(lat).toFixed(1)} s (slowest ${Math.max(...lat).toFixed(1)} s) |
| Median generation speed | ${tps.length ? med(tps).toFixed(0) + " tokens/s" : "n/a"} |

How to read it: a reply is only shown if every number in it appears in the fact it cites in the same sentence. A reply
that fails is sent back to Glimmer once with the failing numbers, then replaced by the raw fact.

## Replies

| Coach | Question | Time | Numbers | Result | Reply |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.coach} | ${r.q} | ${r.secs.toFixed(1)} s | ${r.numbers} | ${r.ok ? "✓ verified" : r.empty ? "✗ empty" : "✗"}${r.fallback ? ", raw fact" : r.tries > 1 ? ", rewritten" : ""} | ${r.text.replace(/\|/g, "/").slice(0, 400)} |`).join("\n")}
`;
fs.writeFileSync(OUT, md);
console.log("wrote", OUT);
