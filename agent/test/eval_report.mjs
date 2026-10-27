// The Autopilot evaluation as a report: submission/agent_eval.md, and the numbers the About page shows
// (web/public/data/agent_eval.json).  node test/eval_report.mjs data/autopilot_eval.json
import fs from "node:fs";

const src = process.argv[2] || "data/autopilot_eval.json", rows = JSON.parse(fs.readFileSync(src, "utf8"));
// two agreed games on the same day are a failure, whatever the run said (games are "sport format Day HH:MM with ...")
for (const r of rows) {
  const days = r.games.map((g) => (g.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:\d\d/) || [])[1]).filter(Boolean);
  r.clash = days.length !== new Set(days).size;
  if (r.clash) r.success = false;
}
const sum = JSON.parse(fs.readFileSync(src.replace(/\.json$/, "_summary.json"), "utf8"));
sum.ok = rows.filter((r) => r.success).length;
const n = (x) => (x == null ? "–" : x);
const md = `# Autopilot evaluation

The Autopilot (\`agent/src/autopilot.js\`) planning eight different weeks on our server: Muse Glimmer on one RTX 3090
(Ollama, 4 requests in parallel), the members' agents on the same model. Run with \`node test/autopilot_eval.mjs\`,
${sum.at.slice(0, 10)}.

A week reaches the goal when the games still needed were agreed by every agent, no two on the same day, and the player
was asked to approve.

| Week | Goal reached | Games | Time | Muse Glimmer calls | Tool calls | At once | Refused calls | Re-plans | Counters (not fitting) | Rules took over |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.scenario} | ${r.success ? "yes" : "no"} | ${r.agreed} of ${r.needed} | ${Math.round(r.seconds)} s | ${n(r.modelCalls)} | ${n(r.toolCalls)} | ${n(r.parallelPeak)} | ${n(r.refused)} | ${n(r.failedNegotiations)} | ${r.counters} (${r.countersThatDidNotFit}) | ${r.rulesTookOver ? "yes" : "no"} |`).join("\n")}

**${sum.ok} of ${sum.runs} weeks reached the goal.** On average a week took ${Math.round(sum.seconds)} s, ${sum.modelCalls}
Muse Glimmer calls and ${sum.toolCalls} tool calls, with up to ${sum.peak} model calls running at once. ${sum.refused} tool
calls were refused by code (a day outside the week, someone not free) and the model re-planned; rules finished the plan
in ${sum.rules} of ${sum.runs} weeks.

## What the evaluation caught

- Two games on one day. An earlier run agreed Thursday 18:00 singles and Thursday 19:00 doubles in a three-game week:
  a member's counter-offer was checked against everyone's calendar and the courts, but not against days that already
  had a game. Counters are now checked against those days too, and this report fails any week with two games on a day.
- Running out of usual times. With only three habitual times, a three-game week then stopped at two. \`get_week\` now
  offers the player's other free times once the usual ones are used up (the run above).
- A summary that said "Booked". In the basketball week the model's closing sentence said the game was booked, while
  it was waiting for the player's yes. Its days and times were right, so it passed; a summary may no longer say
  booked, and code writes it instead.

## What each week decided

${rows.map((r) => `- **${r.scenario}.** Tools used: ${(r.tools || []).join(", ")}. ${r.games.length ? `Agreed: ${r.games.join("; ")}.` : "Nothing agreed."}${r.summary ? ` Its summary: "${r.summary}"` : ""}${r.error ? ` Error: ${r.error}` : ""}`).join("\n")}
`;
fs.writeFileSync("../submission/agent_eval.md", md);
fs.writeFileSync("../web/public/data/agent_eval.json", JSON.stringify(sum, null, 1));
console.log(md);
