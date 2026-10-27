// Probe the model server: are concurrent requests served in parallel, and does the model return native tool calls?
//   node test/llm_probe.mjs [base=http://127.0.0.1:11435] [model=muse-glimmer]
const [BASE = "http://127.0.0.1:11435", MODEL = "muse-glimmer"] = process.argv.slice(2);
const ask = async (content, extra = {}) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: false, think: "low", messages: [{ role: "user", content }], options: { num_predict: 300 }, ...extra }) });
  const j = await r.json();
  return { s: (Date.now() - t0) / 1000, j };
};
const one = await ask("Reply with the single word: ready");
console.log("one call", one.s.toFixed(1), "s");
const t0 = Date.now();
const many = await Promise.all([1, 2, 3].map((k) => ask(`Reply with the number ${k} and nothing else.`)));
console.log("three at once", ((Date.now() - t0) / 1000).toFixed(1), "s; each", many.map((x) => x.s.toFixed(1)).join(", "));
const tools = [{ type: "function", function: { name: "find_slots", description: "Times two players are both free this week", parameters: { type: "object", properties: { member: { type: "string" } }, required: ["member"] } } }];
const tc = await ask("Find when I can play singles with Noor this week. Use a tool.", { tools });
console.log("tool call", tc.s.toFixed(1), "s:", JSON.stringify(tc.j.message?.tool_calls || null), "| text:", (tc.j.message?.content || "").slice(0, 120));
