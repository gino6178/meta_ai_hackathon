// Evaluation of the Autopilot on the GPU server: the same agent loop the app uses, over several weeks that differ in
// goal, sport, health limit and what is already booked. For each run: did it reach the goal (games agreed by every
// agent, then asked for approval), how long it took, how many model and tool calls, how many ran at once, what the
// tools refused, how often it re-planned, and how many counter-offers were checked (and how many did not fit).
//   node test/autopilot_eval.mjs [out.json]
import fs from "node:fs";

process.env.A2A_FILE ||= "data/eval-a2a.json";
process.env.AUTOPILOT_FILE ||= "data/eval-autopilot.json";
fs.rmSync(process.env.A2A_FILE, { force: true });
const { run } = await import("../src/autopilot.js");
const health = await import("../src/health.js");
const OUT = process.argv[2] || "data/autopilot_eval.json";
// the demo player's body log and the sample health export (read the way an upload is)
const club = JSON.parse(fs.readFileSync("../web/public/data/club.json", "utf8"));
const tmp = `/tmp/eval-health-${Date.now()}.zip`; fs.copyFileSync("../web/public/data/sample/serve_sample_health_export.zip", tmp);
const hx = await health.read(tmp, { name: "sample.zip", days: 400 }); fs.rmSync(tmp, { force: true });
const knee = { log: [...club.you.body, { id: "e", at: new Date().toISOString(), part: "knee", side: "right", kind: "pain", level: 3, trigger: "worse after jumping" }], workouts: hx.workouts.map(({ route, ...w }) => w), days: hx.days };
const thu = (() => { const d = new Date(); do d.setDate(d.getDate() + 1); while (d.getDay() !== 4); return d.toISOString().slice(0, 10); })();
const SCENARIOS = [
  { name: "Two games a week", goal: { perWeek: 2 } },
  { name: "Two games, sore knee (doubles first)", goal: { perWeek: 2 }, you: { limit: "no jump landings" } },
  { name: "Three games a week", goal: { perWeek: 3 } },
  { name: "Thursday already booked", goal: { perWeek: 2 }, upcoming: [{ date: thu, start: "19:00", with: ["leo"] }] },
  { name: "Tennis, one game", goal: { perWeek: 1, sport: "tennis" } },
  { name: "Two games, Kenji just played long", goal: { perWeek: 2 }, history: [{ date: thu, start: "19:00", sport: "badminton", format: "singles", with: ["kenji"], booked: 90, played: 135 }] },
  // the body log and the watch: a sore knee, a week at twice the usual load (the goal drops by one, doubles, 90 minutes)
  { name: "Sore knee and a heavy week (body log + health app)", goal: { perWeek: 2 }, body: knee, need: 1 },
  // no free club court is cheap for basketball: the agent looks for a public court nearby
  { name: "Basketball, two on two (public courts)", goal: { perWeek: 1, sport: "basketball" } },
];
const rows = [];
for (const s of SCENARIOS) {
  const msgs = [], steps = [];
  const t0 = Date.now();
  let r, err = null;
  try {
    r = await run({ you: { weak: "rear forehand", ...(s.you || {}) }, goal: s.goal, upcoming: s.upcoming || [], history: s.history || [], body: s.body || null, onStep: (e) => (e.type === "a2a" ? msgs : steps).push(e) });
  } catch (e) { err = String(e.message || e); }
  const need = s.need ?? Math.max(0, (s.goal.perWeek || 2) - (s.upcoming?.length || 0));
  const counters = msgs.filter((m) => m.intent === "counter");
  const row = {
    scenario: s.name, needed: need, agreed: r?.agreed.length ?? 0, success: !!r && r.agreed.length >= need && (need === 0 || !!r.approval),
    seconds: r?.report.seconds ?? +((Date.now() - t0) / 1000).toFixed(1), modelCalls: r?.report.modelCalls ?? null, toolCalls: r?.report.toolCalls ?? null, parallelPeak: r?.report.parallelPeak ?? null,
    refused: r?.report.refused ?? null, failedNegotiations: steps.filter((x) => x.tool === "negotiate" && /no deal/.test(x.detail || "")).length, counters: counters.length, countersThatDidNotFit: counters.filter((m) => m.checked === false).length,
    agentMessages: msgs.length, rulesTookOver: r?.report.rules ?? null, tools: [...new Set(steps.filter((x) => x.tool && !["goal", "report", "memory", "verify", "a2a"].includes(x.tool)).map((x) => x.tool))], games: (r?.agreed || []).map((o) => `${o.sport} ${o.format} ${o.day} ${o.start} with ${o.partners.map((p) => p.name.split(" ")[0]).join(", ")}`), summary: r?.summary, error: err,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
}
const ok = rows.filter((x) => x.success).length, mean = (k) => +(rows.reduce((a, x) => a + (x[k] || 0), 0) / rows.length).toFixed(1);
console.log(`\n${ok} of ${rows.length} reached the goal · mean ${mean("seconds")} s · ${mean("modelCalls")} model calls · ${mean("toolCalls")} tool calls · peak ${Math.max(...rows.map((x) => x.parallelPeak || 0))} at once`);
// the numbers the About page shows (web/public/data/agent_eval.json)
fs.writeFileSync(OUT.replace(/\.json$/, "_summary.json"), JSON.stringify({ at: new Date().toISOString(), runs: rows.length, ok, seconds: mean("seconds"), modelCalls: mean("modelCalls"), toolCalls: mean("toolCalls"), peak: Math.max(...rows.map((x) => x.parallelPeak || 0)), refused: rows.reduce((a, x) => a + (x.refused || 0), 0), rules: rows.filter((x) => x.rulesTookOver).length }, null, 1));
