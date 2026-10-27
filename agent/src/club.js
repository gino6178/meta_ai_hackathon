// Club night: the head coach plans one session for the whole club at once. Members who are weak in the same zone train
// together, a member whose attack lands in someone's weak zone feeds them ("train against the shot that beats you"),
// and health limits shared with the club are hard constraints. Muse Glimmer writes the plan as JSON from a club facts
// sheet; the plan is checked (minutes, members, health limits, every number against its cited fact) and replaced by a
// rule-based plan if it fails twice.
import fs from "node:fs";
import path from "node:path";
import { chat } from "./llm.js";
import { check } from "./verify.js";

const DATA = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../../web/public/data");
export const readClub = () => JSON.parse(fs.readFileSync(path.join(DATA, "club.json"), "utf8"));
const JUMP = /jump|plyo|bound|hop|split[- ]?steps?|跳/i;
// "no jumps", "without jump landings" and the like are what we want, so they are removed before looking for jumps
const NEGATED = /\b(no|without|avoid(?:ing|s)?|zero|never|skip(?:ping)?)\s+(?:\w+\s+)?(?:jump\w*|plyo\w*|hops?|bound\w*)(?:\s+landings?)?/gi;
const hasJump = (t) => JUMP.test(String(t).replace(NEGATED, "").replace(/不(要)?跳|避免跳/g, ""));

// "you" comes from the web app (the analysed match and what the player chose to share); everyone else from club.json
export function roster(club, you) {
  const me = you ? [{ id: "you", name: you.name || "You", level: you.level || "B", hand: "R", weak: you.weak, strength: you.strength || null,
    limit: you.limit || null, net: you.net || null, sessions: you.sessions ?? 0, shares: { goals: true, progress: true, highlights: false, limits: !!you.limit } }] : [];
  return [...me, ...club.members];
}

// practice partners: B's attack lands in A's weak zone, so B feeds A
export function partners(members) {
  const out = [];
  for (const a of members) for (const b of members) {
    if (a.id !== b.id && b.strength?.zone && b.strength.zone === a.weak) out.push({ for: a.id, with: b.id, zone: a.weak, shot: b.strength.shot });
  }
  return out;
}

export function clubSheet(club, members) {
  const n = members.length, night = club.night;
  const byWeak = Object.entries(members.reduce((acc, m) => ({ ...acc, [m.weak]: [...(acc[m.weak] || []), m] }), {})).sort((a, b) => b[1].length - a[1].length);
  const limited = members.filter((m) => m.limit && m.shares?.limits);
  const pairs = partners(members);
  const improved = members.filter((m) => m.net && m.net[1] < m.net[0]);
  const facts = [
    `${n} members are coming to club night: ${night.day} ${night.start}, ${night.courts} courts, ${night.minutes} minutes`,
    ...byWeak.slice(0, 3).map(([z, ms]) => `${ms.length} of ${n} members lose most points in the ${z}: ${ms.map((m) => m.id).join(", ")}`),
    `${limited.length} members have a health limit shared with the club coach: ${limited.map((m) => `${m.id} (${m.limit})`).join(", ") || "none"}`,
    `Partner pairs where one member's attack lands in the other's weak zone: ${pairs.slice(0, 8).map((p) => `${p.with} feeds ${p.for} (${p.shot} to the ${p.zone})`).join("; ") || "none"}`,
    `Net-error challenge: ${improved.length} of ${members.filter((m) => m.net).length} members have fewer net errors than two weeks ago`,
  ].map((text, i) => ({ id: `F${i + 1}`, key: `club${i + 1}`, text }));
  const numbers = new Set(facts.flatMap((f) => (f.text.match(/\d+(?:\.\d+)?/g) || []).map(Number)));
  const w = Math.min(3, byWeak.length);
  const ids = { night: "F1", weak: "F2", limits: `F${2 + w}`, pairs: `F${3 + w}`, challenge: `F${4 + w}` };
  return { name: club.name, facts, numbers, byWeak, limited, pairs, ids };
}

// The schedule is solved by code, so it always holds: every member is in exactly one group in every block, no block
// uses more groups than courts, the night is filled, and groups are built around a shared weak zone with the partners
// who attack it. Glimmer then writes what each group does and why, like a head coach would. (Asked to schedule as well,
// it spent its whole budget reasoning and returned nothing.)
function schedule(club, members, sheet) {
  const all = members.map((m) => m.id), night = club.night, courts = night.courts;
  const [zone, weak] = sheet.byWeak[0], weakIds = weak.map((m) => m.id);
  const feeders = [...new Set(sheet.pairs.filter((p) => weakIds.includes(p.for)).map((p) => p.with))].slice(0, Math.max(1, 6 - weakIds.length));
  const court1 = [...weakIds, ...feeders], others = all.filter((id) => !court1.includes(id));
  const split = (ids, n) => { const k = Math.ceil(ids.length / n); return Array.from({ length: n }, (_, i) => ids.slice(i * k, (i + 1) * k)).filter((g) => g.length); };
  const rest = split(others, courts - 1);
  const g = (court, focus, who, drill, why) => ({ court, focus, who, drill, why });
  return [
    { minutes: 10, groups: [g("all", "warm-up", all, "Warm-up: footwork ladder and shadow movement, no jumps", `${sheet.limited.length} members have a health limit [${sheet.ids.limits}], so the warm-up has no jump landings.`)] },
    { minutes: 25, groups: [
      g("1", `${zone} defence, fed by the partners whose attack lands there`, court1, `${zone} defence: feeders attack the ${zone}, defenders recover to base`, `${weak.length} of ${members.length} members lose most points in the ${zone} [${sheet.ids.weak}], and their partners feed them.`),
      ...rest.map((w, i) => g(String(i + 2), "net margin for the club challenge", w, "Net margin: net shot and net lift over a target above the tape", "The club challenge is fewer net errors, and margin over the tape comes before speed.")),
    ] },
    { minutes: 25, groups: [
      g("1", "net margin for the club challenge", court1, "Net margin: net shot and net lift over a target above the tape", "Same challenge drill for the defence group."),
      ...rest.map((w, i) => g(String(i + 2), "each player is fed into their own weak zone", w, "Feeding to the weak zone: ten feeds each into the zone you lose most points in", "Partners take turns feeding the zone the other loses most points in.")),
    ] },
    { minutes: 25, groups: split(all, courts).map((w, i) => g(String(i + 1), "condition games that start with a lift to the receiver's weak zone", w, "Condition games: every rally starts with a lift to the receiver's weak zone; no jump smashes for members with a limit", "Games put the drills under pressure while the health limits stay on.")) },
    { minutes: night.minutes - 85, groups: [g("all", "cool-down", all, "Cool-down and stretching", "Finish together.")] },
  ];
}

// a group's text is usable only if it keeps the health limits of the people in it and cites its numbers
function checkGroup(text, who, sheet, minutes) {
  const errs = [];
  if (!text?.drill || !text?.why) return ["missing drill or why"];
  if (hasJump(`${text.drill} ${text.why}`)) {
    const hit = who.filter((w) => sheet.limited.some((m) => m.id === w && /jump/i.test(m.limit)));
    if (hit.length) errs.push(`"${text.drill}" has jumps but ${hit.join(", ")} must avoid jump landings`);
  }
  const v = check(String(text.why), sheet, minutes.join(" "));
  if (!v.ok) errs.push(`numbers not in the cited fact: ${v.bad.join("; ")}`);
  return errs;
}

export async function planNight({ you } = {}) {
  const club = readClub(), members = roster(club, you), sheet = clubSheet(club, members), night = club.night;
  const blocks = schedule(club, members, sheet), minutes = blocks.map((b) => b.minutes);
  const slots = blocks.flatMap((b, bi) => b.groups.map((g, gi) => ({ block: bi + 1, group: gi + 1, minutes: b.minutes, court: g.court, focus: g.focus,
    who: g.who.map((id) => { const m = members.find((x) => x.id === id); return `${id} (weak ${m.weak}${m.strength ? `; ${m.strength.shot} to the ${m.strength.zone}` : ""}${m.limit && m.shares?.limits ? `; ${m.limit}` : ""})`; }) })));
  const sys = `You are the Head Coach on Serve, writing tonight's club session for ${club.name}. The groups are already set.
FACTS (cite them like [F2]; these are the only numbers you may state, apart from minutes, reps and courts):
${sheet.facts.map((f) => `[${f.id}] ${f.text}`).join("\n")}

For every group below, write the drill (one concrete line, at most 16 words, a coach could run it) and why (one short sentence).
Members with "no jump landings" never get jumps, jump landings, plyometrics or hops; keep smash counts low for anyone with "limit smash volume".
Any number in "why" must come from the fact it cites in the same sentence, like "5 of 12 members [F2]".
Return JSON only: {"title": string, "groups": [{"block": number, "group": number, "drill": string, "why": string}], "note": string}

GROUPS:
${slots.map((x) => `block ${x.block} group ${x.group} (${x.minutes} min, court ${x.court}), focus: ${x.focus}; players: ${x.who.join(", ")}`).join("\n")}`;
  const msgs = [{ role: "system", content: sys }, { role: "user", content: "Write the club night." }];
  let out = null, errs = ["not run"], timing = null, tries = 0, written = 0;
  try {
    for (; tries < 2; tries++) {
      const r = await chat(msgs, { maxTokens: 1400, temperature: tries ? 0.1 : 0.4 });
      timing = r.timing;
      try { out = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ["null"])[0]); } catch { out = null; }
      errs = out?.groups ? [] : ["the reply was not valid JSON"];
      if (out?.groups) {
        // take the model's text group by group; a group that fails its checks keeps the rule-based text
        written = 0;
        for (const t of out.groups) {
          const b = blocks[t.block - 1], g = b?.groups[t.group - 1];
          if (!g) continue;
          const e = checkGroup(t, g.who, sheet, minutes);
          if (e.length) errs.push(`block ${t.block} group ${t.group}: ${e.join("; ")}`);
          else { g.drill = String(t.drill).trim(); g.why = String(t.why).trim(); g.by = "model"; written++; }
        }
      }
      if (out?.groups && !errs.length) break;
      msgs.push({ role: "assistant", content: r.text }, { role: "user", content: `Fix these and return the full JSON again: ${errs.join("; ")}` });
    }
  } catch (e) { errs = [`model unavailable: ${e.message}`]; }
  const total = blocks.reduce((a, b) => a + b.groups.length, 0);
  const plan = { title: out?.title || `${night.day} club night: ${sheet.byWeak[0][0]} defence and net margin`, blocks, note: out?.note || "" };
  return { club: club.name, night, plan, source: written === total ? "model" : written ? "mixed" : "rules", written, total,
    checks: errs, tries: Math.min(2, tries + 1), facts: sheet.facts.map(({ id, text }) => ({ id, text })), pairs: sheet.pairs, timing };
}
