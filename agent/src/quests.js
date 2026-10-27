// Training as a game: each coach gives the player one quest for the week, and the next opponent is the boss. The boss's
// moves are the patterns that cost the player points (computed from the match, not written by the model); every quest
// counters one move, and completing it takes that much off the boss's health. Muse Glimmer writes the quests from the
// coach's own facts and the player's memory. Targets are small counts the player logs (sessions or sets), XP is set
// by code, numbers in "why" are verified, and a health limit in memory rules out jumps.
import { chat } from "./llm.js";
import { check } from "./verify.js";
import { factSheet } from "./facts.js";

const JUMP = /jump|plyo|bound|hop|split[- ]?steps?|跳/i;
const NEGATED = /\b(no|without|avoid(?:ing|s)?|zero|never|skip(?:ping)?)\s+(?:\w+\s+)?(?:jump\w*|plyo\w*|hops?|bound\w*)(?:\s+landings?)?/gi;
const hasJump = (t) => JUMP.test(String(t).replace(NEGATED, "").replace(/不(要)?跳|避免跳/g, ""));
const AREA = { tactics: ["zone", "beaten", "points"], technique: ["net", "netgame", "errtypes", "pattern"], fitness: ["load", "lunges", "kneedeep", "kneeright"], analyst: ["read", "readpct", "stretch", "pattern"] };
const NAMES = { tactics: "Coach Lin", technique: "Coach Kai", fitness: "Coach Ren", analyst: "Coach Ada" };

function boss(sheet) {
  const f = (k) => sheet.facts.find((x) => x.key === k);
  const opp = (f("match").text.match(/ vs (.+?),/) || [])[1] || "your opponent";
  const zone = (f("zone").text.match(/rear forehand|rear backhand|rear middle|mid \w+|front \w+/) || ["rear forehand"])[0];
  return {
    name: opp,
    moves: [
      { id: "smash", name: `Smash to your ${zone}`, fact: f("zone").id, text: f("zone").text },
      { id: "block", name: "The block that stretches you", fact: f("readpct").id, text: f("readpct").text },
      { id: "net", name: "Net battle", fact: f("pattern").id, text: f("pattern").text },
      { id: "late", name: "Late-match pressure", fact: f("load").id, text: f("load").text },
    ],
  };
}
const COUNTER = { tactics: "smash", analyst: "block", technique: "net", fitness: "late" };

// rule-based quests, used when the model's quest does not pass
function ruleQuest(coach, limited) {
  const q = {
    tactics: { title: "Rear-corner wall", task: "Defend 3 sessions of rear-forehand smash feeds, recovering to base after each", target: 3, unit: "sessions" },
    technique: { title: "Net margin master", task: "3 sessions of net shots and net lifts aimed a racket-head over the tape", target: 3, unit: "sessions" },
    fitness: limited
      ? { title: "Knee-friendly engine", task: "2 gym sessions of tempo split squats and isometric calf holds, no jumps", target: 2, unit: "sessions" }
      : { title: "Late-match engine", task: "2 interval sessions: 6 × 30 s court sprints with full rest", target: 2, unit: "sessions" },
    analyst: { title: "Read the block", task: "3 sessions of first-step drills: move on the feeder's racket face, not the shuttle", target: 3, unit: "sessions" },
  }[coach];
  return { ...q, why: "", cheer: "Quest done. Your next recorded match will show whether it worked." };
}

export async function quests({ memory = [], onStep } = {}) {
  const t0 = Date.now(), sheet = factSheet("A"), b = boss(sheet);
  const tell = (s) => onStep?.({ type: "step", ...s }), work = (step) => onStep?.({ type: "working", step });
  const limited = memory.some((m) => /knee|ankle|膝|腳踝/i.test(m) && /sore|pain|hurt|injur|痛|痠|傷/i.test(m));
  const scoped = (c) => sheet.facts.filter((f) => AREA[c].includes(f.key));
  const sys = `You are ShuttleCoach's coaching staff turning this week's training into a game for ${sheet.name}.
Each coach gives ONE quest that counters one move of the next opponent (the boss), ${b.name}.
BOSS MOVES:
${b.moves.map((m) => `- ${m.id}: ${m.name} [${m.fact}] ${m.text}`).join("\n")}

FACTS by coach (cite like [F8]; these are the only match numbers you may state):
${Object.keys(AREA).map((c) => `${NAMES[c]} (${c}), counters "${COUNTER[c]}":\n${scoped(c).map((f) => `[${f.id}] ${f.text}`).join("\n")}`).join("\n")}

WHAT THE PLAYER TOLD THE COACHES:
${memory.length ? memory.map((m) => `- ${m}`).join("\n") : "- (nothing)"}

Return JSON only: {"quests": [{"coach": "tactics"|"technique"|"fitness"|"analyst", "title": string, "task": string, "target": number, "unit": "sessions"|"sets", "why": string, "cheer": string}]}
Rules:
- Exactly one quest per coach. "title" is a fun 2-4 word quest name. "task" is one concrete line (at most 18 words) the player can do and log.
- "target" is how many sessions or sets to log this week: a whole number from 1 to 5. If "task" says a count, it is the same number as "target".
- "why" is one sentence that cites the coach's fact, like "7 of his winners land in your rear forehand [F8]"; any number in it must come from that fact.
- "cheer" is one short line the coach says when the quest is done (no numbers).
- ${limited ? "The player reported knee or ankle pain: no quest may include jumps, jump landings, plyometrics or hops, and the fitness quest must be low-impact." : "Keep the load sensible; no quest should push through pain."}
- English only.`;
  tell({ step: "Read your match", tool: "read_match", detail: `${sheet.facts.length} facts; the boss is ${b.name} with ${b.moves.length} moves` });
  tell({ step: "Recalled what you told the coaches", tool: "memory", detail: memory.length ? `${memory.length} note${memory.length > 1 ? "s" : ""}${limited ? ", including knee or ankle pain: no jumps" : ""}` : "nothing yet" });
  const msgs = [{ role: "system", content: sys }, { role: "user", content: "Give me this week's quests." }];
  let got = null, errs = ["not run"], timing = null, tries = 0;
  const out = {};
  try {
    for (; tries < 2; tries++) {
      work(tries ? "Muse Glimmer is fixing the quests that failed" : "Four coaches are writing quests on Muse Glimmer");
      const r = await chat(msgs, { maxTokens: 900, temperature: tries ? 0.1 : 0.5 });
      timing = r.timing;
      const had = Object.keys(out).length;
      try { got = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ["null"])[0]); } catch { got = null; }
      errs = got?.quests ? [] : ["the reply was not valid JSON"];
      for (const q of got?.quests || []) {
        if (!AREA[q.coach] || out[q.coach]) continue;
        const e = [];
        const target = Math.round(+q.target);
        if (!(target >= 1 && target <= 5)) e.push(`target ${q.target} is not a whole number from 1 to 5`);
        // the count in the task is what the player logs, so it must be the target ("4 sets" with a target of 3 is wrong)
        const said = +((String(q.task).match(/\b(\d+)\s*(?:sessions?|sets?|times?)\b/i) || [])[1] || target);
        if (said !== target) e.push(`the task says ${said} but the target is ${target}`);
        if (limited && hasJump(`${q.title} ${q.task}`)) e.push("has jumps although the player reported knee or ankle pain");
        const v = check(String(q.why || ""), { ...sheet, facts: scoped(q.coach) }, String(target));
        if (!v.ok) e.push(`numbers not in the cited fact: ${v.bad.join("; ")}`);
        if (!q.title || !q.task || !q.why) e.push("missing title, task or why");
        if (e.length) errs.push(`${q.coach}: ${e.join("; ")}`);
        else out[q.coach] = { title: String(q.title), task: String(q.task), target, unit: q.unit === "sets" ? "sets" : "sessions", why: String(q.why), cheer: String(q.cheer || "Quest done."), by: "model" };
      }
      const passed = Object.keys(out).length - had;
      tell({ step: tries ? "Rewrote the quests" : "Wrote the quests", tool: "write_quests", detail: got?.quests ? `${got.quests.length} quests from Muse Glimmer` : "the reply was not valid JSON", seconds: r.timing?.seconds });
      tell({ step: "Checked every number", tool: "verify", detail: errs.length ? `${passed} passed; sent back: ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ""}` : `${passed === 4 ? "all four" : passed} passed: counts, targets and every number in the cited facts` });
      if (Object.keys(out).length === 4) break;
      msgs.push({ role: "assistant", content: r.text }, { role: "user", content: `Fix these and return all four quests again as JSON: ${errs.join("; ") || "a coach is missing"}` });
    }
  } catch (e) { errs = [`model unavailable: ${e.message}`]; }
  const fell = Object.keys(AREA).filter((c) => !out[c]);
  if (fell.length) tell({ step: "Used the checked rule-based quest", tool: "fallback", detail: `for ${fell.map((c) => NAMES[c]).join(", ")}` });
  const list = Object.keys(AREA).map((c) => {
    const q = out[c] || { ...ruleQuest(c, limited), by: "rules" };
    // XP is set by code: 20 for taking the quest on, 15 per logged session or set
    return { id: `${c}-${COUNTER[c]}`, coach: c, coachName: NAMES[c], counters: COUNTER[c], xp: 20 + 15 * q.target, ...q };
  });
  return { boss: { ...b, hp: list.reduce((a, q) => a + q.xp, 0) }, quests: list, limited, source: list.every((q) => q.by === "model") ? "model" : "mixed",
    checks: errs, tries: Math.min(2, tries + 1), timing, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
}
