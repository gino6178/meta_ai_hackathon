// A coach agent turn: pick the coach, ground it in the facts sheet and the player's memory, generate with the local
// LLM, verify every number, and learn anything durable the player said. If the model is down, answer from facts.
import { chat } from "./llm.js";
import { check } from "./verify.js";
import { factSheet, factsText } from "./facts.js";
import * as store from "./store.js";
import * as kb from "./kb.js";
import * as evolve from "./evolve.js";
import * as life from "./life.js";

export const COACHES = {
  head: { name: "Head Coach", role: "chairs the coaching staff and keeps the weekly plan", keys: [] },
  tactics: { name: "Coach Lin", role: "tactics: where points are won and lost, positioning, game plans", keys: ["tactic", "zone", "where", "position", "defen", "attack", "opponent", "戰術", "防守", "站位"] },
  technique: { name: "Coach Kai", role: "stroke technique: net play, smashes, clears, errors", keys: ["net", "smash", "clear", "drop", "error", "technique", "grip", "殺球", "網前", "技術", "失誤"] },
  fitness: { name: "Coach Ren", role: "strength, conditioning, fatigue and injury risk", keys: ["tired", "fatigue", "knee", "ankle", "sore", "gym", "injur", "lunge", "膝", "累", "痠", "體能", "受傷"] },
  analyst: { name: "Coach Ada", role: "match data, habits and patterns", keys: ["data", "stat", "pattern", "habit", "percent", "數據", "習慣"] },
  // in Messenger only: meals from what the player has at home, timed around their sessions
  nutrition: { name: "Coach Mei", role: "nutrition and recovery: meals from the food the player has at home, timed around training", keys: ["eat", "food", "meal", "breakfast", "lunch", "dinner", "snack", "diet", "protein", "cook", "fridge", "吃", "餐", "食", "營養", "飲食", "冰箱", "煮"] },
};

const AREA = {
  head: null,
  tactics: ["match", "points", "beaten", "zone", "pattern", "read"],
  technique: ["errors", "errtypes", "net", "netgame", "pattern", "stretch"],
  fitness: ["load", "lunges", "kneedeep", "kneeright", "stretch"],
  analyst: ["read", "readpct", "stretch", "pattern", "zone", "points"],
  nutrition: ["load", "lunges", "match"],
};
const scoped = (sheet, coachId) => (AREA[coachId] ? { ...sheet, facts: sheet.facts.filter((f) => AREA[coachId].includes(f.key)) } : sheet);

export function route(text, fallback = "head") {
  const t = text.toLowerCase();
  let best = fallback, score = 0;
  for (const [id, c] of Object.entries(COACHES)) {
    const s = c.keys.filter((k) => t.includes(k)).length;
    if (s > score) { best = id; score = s; }
  }
  return best;
}

function system(coachId, sheet, player, evidence, ruleSet) {
  const c = COACHES[coachId];
  const mem = player?.memories?.length ? player.memories.slice(-12).map((m) => `- ${m.text}`).join("\n") : "- (nothing yet)";
  const plan = player?.plan?.goals?.length ? player.plan.goals.map((g) => `- ${g}`).join("\n") : "- (no plan agreed yet)";
  return `You are ${c.name}, the ${c.role}, on Serve, a badminton coaching staff of AI agents that runs on the player's own hardware.
You are talking with ${sheet.name} after their match.

FACTS you may use (cite them like [F2]); these are the only numbers you may state:
${factsText(scoped(sheet, coachId))}

WHAT YOU REMEMBER ABOUT THE PLAYER:
${mem}

THIS WEEK'S PLAN:
${plan}

${life.context(player)}

YOUR PLAYBOOK (rules your coaching staff has agreed; follow them):
${ruleSet.map((r) => `- ${r.text}`).join("\n") || "- (none)"}

EVIDENCE from sports-science papers (cite like [E14] when it supports your advice; these are other people's studies, never present their numbers as the player's):
${evidence.map((e) => `[${e.id}] ${e.claim} Coaching use: ${e.practice} (${kb.cite(e.paper)})`).join("\n") || "(none found for this question)"}

Rules:
- Use only numbers that appear in FACTS or that the player wrote. Never invent statistics.
- Put the fact id in the same sentence as every number it supports, like "14 net errors [F4]". For drills use small counts only (sets, reps, minutes up to 10).
- Respect what you remember: if they report pain or an injury, adapt the advice and never push through pain.
- Read each fact exactly as written: do not merge numbers from different facts or change what a number counts.
- Never advise deep knee bends or jumping when the player reports knee or ankle pain; lower the load instead.
- Reply in the language the player writes in (if they write Chinese, use Traditional Chinese as used in Taiwan), warm and direct, in 2 to 3 short sentences and under 80 words: what the data shows (with its number and fact id), why it matters for their game, and one concrete drill or action for this week.
- Plan around their calendar: never schedule hard work on a match or exam day or just before one.
- For food, build meals from FOOD THEY HAVE AT HOME and say when to eat them relative to their next session; give portions as palms, fists or cups, never grams or calories. No supplements, no weight-cutting.
- No markdown headings or tables.`;
}

const FALLBACK = (sheet, coachId) => {
  const pick = { tactics: "zone", technique: "net", fitness: "load", analyst: "read", head: "points", nutrition: "load" }[coachId];
  const f = sheet.facts.find((x) => x.key === pick) ?? sheet.facts[1];
  return `Here is the measured fact I can stand behind: ${f.text.replace(/\.$/, "")} [${f.id}].`;
};

// one reply; history is [{role, content}] for the web chat, or taken from the store for a Messenger player
export async function reply({ text, coach, playerId, history = [], rulesOverride = null, record = true }) {
  const player = playerId ? store.get(playerId) : null;
  const sheet = factSheet(player?.athlete || "A");
  const coachId = coach && COACHES[coach] ? coach : route(text, player?.prefs?.coach || "head");
  const past = (player ? player.history.slice(-8) : history.slice(-8)).map((h) => ({ role: h.role, content: h.content }));
  const evidence = await kb.search(text, { k: 3, area: coachId === "head" ? null : coachId }).catch(() => []);
  const ruleSet = rulesOverride ?? evolve.rules(coachId);
  // numbers the player wrote, that are in their memory, or that the agreed playbook states (90 degrees) are allowed
  const extra = `${text} ${(player?.memories || []).map((m) => m.text).join(" ")} ${ruleSet.map((r) => r.text).join(" ")} ${life.context(player)}`;
  const msgs = [{ role: "system", content: system(coachId, sheet, player, evidence, ruleSet) }, ...past, { role: "user", content: text }];

  let out, verdict, timing = null, tries = 0;
  try {
    for (; tries < 2; tries++) {
      const r = await chat(msgs, { temperature: tries ? 0.1 : 0.25 });
      out = r.text; timing = r.timing; verdict = check(out, sheet, extra, evidence);
      if (verdict.ok) break;
      msgs.push({ role: "assistant", content: out }, { role: "user", content: `These numbers are not supported by the fact cited in their sentence: ${verdict.bad.join("; ")}. Rewrite the reply: every number must come from a fact or study cited in the same sentence, like [F4] or [E14].` });
    }
    if (!verdict.ok) {
      const rejected = verdict.bad, draft = out;
      if (record) evolve.rejection({ coach: coachId, question: text, draft, bad: rejected }); // feeds the next reflection run
      out = FALLBACK(sheet, coachId); verdict = { ...check(out, sheet), rejected, draft };
    }
  } catch (e) {
    out = FALLBACK(sheet, coachId); verdict = { ...check(out, sheet), offline: String(e.message || e) };
  }
  const cites = [...new Set(out.match(/\[[FE]\d+\]/g) || [])];
  const used = evidence.filter((e) => cites.includes(`[${e.id}]`)).map((e) => ({ id: e.id, claim: e.claim, cite: kb.cite(e.paper), title: e.paper.title, url: e.paper.url, studyType: e.studyType }));
  return { coach: coachId, coachName: COACHES[coachId].name, text: out, verified: verdict, cites, evidence: used, playbook: { version: evolve.playbooks()[coachId]?.version, rules: ruleSet.length }, tries: tries + 1, timing };
}

// after a turn: ask the model for durable facts about the player (injuries, goals, schedule, preferences)
const BODY = /(knee|ankle|shoulder|back|wrist|elbow|hip|calf|hamstring|膝|腳踝|肩|腰|手腕|小腿)/i, HURT = /(sore|pain|hurt|injur|strain|sprain|tight|痛|痠|傷|拉傷|扭)/i;
export async function learn(playerId, text) {
  // health first: an injury or pain report is stored at once, without waiting for the model
  const quick = text.split(/(?<=[.!?。！？])\s*/).filter((x) => BODY.test(x) && HURT.test(x)).map((x) => x.trim().replace(/[.。]$/, ""));
  const saved = quick.length ? store.remember(playerId, quick.map((x) => `Player said: ${x}`)) : [];
  if (!/\b(i|i'm|im|my|me)\b|我|膝|痠|痛|目標|每週|想要|喜歡/i.test(text)) return saved;
  try {
    const r = await chat([
      { role: "system", content: "Extract durable facts a coach should remember about the player from their message: injuries or pain, goals, training schedule, availability, preferences. Return a JSON array of short English strings, or [] if none. JSON only." },
      { role: "user", content: text },
    ], { maxTokens: 120, temperature: 0 });
    const arr = JSON.parse((r.text.match(/\[[\s\S]*\]/) || ["[]"])[0]);
    return [...saved, ...store.remember(playerId, arr.filter((x) => typeof x === "string").slice(0, 3))];
  } catch { return saved; }
}
