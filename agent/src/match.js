// Best match, and your agent talking to theirs.
// best(): your agent ranks every member for a game this week. Code scores what has to be exact: a fair game by club
//   rating (a win chance near 50%), a shared free time, the trip to the venue in the middle, training value (their
//   attack lands where you lose points, or they play like your next opponent), format and health limits, and history.
//   Muse Glimmer explains the top pick, and every number it uses must come from the scores.
// talk(): your agent proposes a game to the other member's agent. Each side's message is written by Muse Glimmer: yours
//   from your calendar and the courts, theirs from what that member shares with their agent (free times, preferences,
//   limits). Every time a side proposes is checked by code against both calendars and the venues' free courts; a
//   proposal that does not fit is answered with the facts, never booked. When both agents agree, the result is an
//   option the player can book, and the other member's agent has already said yes.
// The demo club's members and their agents are made up (web/public/data/club.json).
import { chat } from "./llm.js";
import { readClub } from "./club.js";
import { demoVenues, opponentStyle, styleMatch, helpers } from "./play.js";

const { windows, travelMin, kmBetween, ymd, hm, toMin, dateOf, readVenues, DAYS } = helpers;
const first = (n) => n.split(" ")[0];
const expect = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (date, start) => { const d = dateOf(date); return `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${start}`; };

// the times two people are both free in the next week, at least 90 minutes, earliest first
function shared(a, b, now = new Date()) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const wa = windows(a).filter((w) => w.day === d.getDay()), wb = windows(b).filter((w) => w.day === d.getDay());
    for (const x of wa) for (const y of wb) {
      const f = Math.max(x.from, y.from, i === 0 ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 60) / 30) * 30 : 0), t = Math.min(x.to, y.to);
      if (t - f >= 90) out.push({ date: ymd(d), day: DAYS[d.getDay()], from: f, to: t });
    }
  }
  return out;
}
// for one time: the venue with a free court where the longer of the two trips is shortest
function court(slot, start, minutes, people, venues) {
  const date = dateOf(slot.date), out = [];
  for (const v of venues.venues) {
    const courts = demoVenues.freeCourts(v, date, start, minutes);
    if (!courts.length) continue;
    const travel = people.filter((p) => p.area).map((p) => ({ id: p.id, name: p.name, min: travelMin(p.area, v), km: +kmBetween(p.area, v).toFixed(1) }));
    out.push({ v, court: courts[0], courtsFree: courts.length, travel, longest: Math.max(0, ...travel.map((t) => t.min)) });
  }
  return out.sort((a, b) => a.longest - b.longest)[0] || null;
}
// an option in the shape Play books (play.book)
function option(slot, start, minutes, c, m, format, agreed) {
  const total = Math.round((c.v.price * minutes) / 60), players = format === "doubles" ? 4 : 2;
  return {
    id: `${c.v.id}-${slot.date}-${hm(start)}`, date: slot.date, day: slot.day, start: hm(start), end: hm(start + minutes), minutes,
    venue: { id: c.v.id, name: c.v.name, area: c.v.area, km: c.travel.find((t) => t.id === "you")?.km ?? null, x: c.v.x, y: c.v.y }, court: c.court, courtsFree: c.courtsFree,
    travel: c.travel, longest: c.longest, format, players, price: c.v.price, total, each: Math.round(total / players),
    partners: [{ id: m.id, name: m.name, level: m.level, why: ["your agents agreed the time"] }], spare: [], asked: [m.id], agreed: agreed ? [m.id] : [],
  };
}

// ---- best match -------------------------------------------------------------------------------------------------
export async function best({ you = {}, ratings = {}, played = {}, format = "singles", onStep } = {}) {
  const tell = (s) => onStep?.({ type: "step", ...s }), work = (step) => onStep?.({ type: "working", step });
  const club = readClub(), venues = readVenues(), me = { id: "you", name: "You", area: club.you.area, free: club.you.free };
  const r = (id) => ratings[id] ?? (id === "you" ? club.you.rating : club.members.find((m) => m.id === id)?.rating ?? 1500);
  const opp = opponentStyle(), weak = you.weak || "rear forehand", limit = you.limit || null;
  tell({ step: "Read your profile", tool: "profile", detail: `club rating ${r("you")}, you lose most points in the ${weak}${limit ? `, health limit: ${limit}` : ""}` });
  work(`Scoring ${club.members.length} members`);
  const rows = [];
  for (const m of club.members) {
    const plays = m.prefers === "any" || m.prefers === format;
    const times = shared(club.you.free, m.free);
    if (!times.length) { rows.push({ m, out: "no shared free time this week" }); continue; }
    const t0 = times[0], c = court(t0, t0.from, 90, [me, m], venues);
    const p = expect(r("you"), r(m.id)), fair = 1 - Math.abs(0.5 - p) * 2;
    const st = styleMatch(m.mix, opp), train = m.strength?.zone === weak;
    const n = played[m.id] || 0;
    const parts = [
      { k: "fair", w: 3 * fair, text: `win chance ${Math.round(p * 100)}%` },
      { k: "time", w: Math.min(1, times.length / 3), text: `both free ${t0.day} ${hm(t0.from)}–${hm(t0.to)}${times.length > 1 ? ` and ${times.length - 1} more` : ""}` },
      { k: "trip", w: c ? -0.04 * c.longest : -1, text: c ? `${c.v.name}: you ${c.travel.find((x) => x.id === "you")?.min} min, ${first(m.name)} ${c.travel.find((x) => x.id === m.id)?.min} min` : "no free court then" },
      train && { k: "train", w: 1.5, text: `their ${m.strength.shot} lands in your ${weak}` },
      format === "singles" && { k: "style", w: 2 * (st.sim - 0.5), text: `${Math.round(st.sim * 100)}% like ${first(opp.name)}, your next opponent` },
      { k: "format", w: plays ? 0.5 : -2, text: plays ? `likes ${format}` : `prefers ${m.prefers}` },
      limit && m.limit && { k: "health", w: 0.3, text: `also plays with a limit (${m.limit})` },
      { k: "history", w: n ? (n >= 3 ? -0.3 : 0.2) : 0.3, text: n ? `you have played ${n} time${n > 1 ? "s" : ""}` : "a new opponent for you" },
    ].filter(Boolean);
    const score = parts.reduce((a, x) => a + x.w, 0);
    rows.push({ m, score, parts, slot: t0, chance: Math.round(p * 100) });
  }
  const ranked = rows.filter((x) => x.score != null).sort((a, b) => b.score - a.score);
  const max = ranked[0]?.score ?? 1, min = ranked.at(-1)?.score ?? 0;
  const top = ranked.slice(0, 3).map((x) => ({ id: x.m.id, name: x.m.name, level: x.m.level, rating: r(x.m.id), chance: x.chance,
    fit: Math.round(60 + 40 * ((x.score - min) / Math.max(0.01, max - min))), parts: x.parts.sort((a, b) => b.w - a.w).map(({ k, text, w }) => ({ k, text, good: w > 0 })) }));
  tell({ step: "Scored every member", tool: "score", detail: `${ranked.length} of ${club.members.length} share a free time with you; scored on a fair game by rating, the trip, training value, format, health and history` });
  if (!top.length) return { top, why: "Nobody shares a free time with you this week.", by: "rules" };
  // Muse Glimmer says why, in two sentences, with only the numbers in the scores
  work("Muse Glimmer is explaining the pick");
  const t = top[0], facts = t.parts.map((p) => p.text);
  const allowed = new Set(facts.join(" ").match(/\d+(?:[.:]\d+)?/g) || []);
  let why = `${first(t.name)}: ${facts.slice(0, 3).join(", ")}.`, by = "rules";
  const pct = facts.flatMap((f) => f.match(/\d+%/g) || []);
  try {
    const res = await chat([{ role: "system", content: `You are a badminton player's agent. Tell the player why ${first(t.name)} is their best match this week, in at most two short, natural sentences and 40 words, from the three strongest of these facts (keep each number exactly as given):
${facts.map((f) => `- ${f}`).join("\n")}
Speak to the player as "you"; call the other player "${first(t.name)}", never "he" or "she". Keep every % sign. Do not combine two facts into a new claim. English only. Plain text.` }, { role: "user", content: "Why?" }], { maxTokens: 160, temperature: 0.3 });
    const text = res.text.trim().replace(/^"|"$/g, "");
    const good = text && okNums(text.replace(/%/g, ""), allowed) && !PRONOUN.test(text) && pct.every((p) => !text.includes(p.slice(0, -1)) || text.includes(p)) && text.split(/\s+/).length <= 55;
    if (good) { why = text; by = "model"; }
  } catch { /* the rule-based sentence */ }
  tell({ step: by === "model" ? "Muse Glimmer explained the pick" : "Explained the pick", tool: "verify", detail: by === "model" ? "every number in it checked against the scores" : "checked template text" });
  return { top, why, by, format };
}

// ---- agent to agent ---------------------------------------------------------------------------------------------
const parse = (t) => { try { return JSON.parse((String(t).match(/\{[\s\S]*\}/) || ["null"])[0]); } catch { return null; } };
// like every reply in the app, an agent's message may only use numbers that are in the checked offer
const nums = (t) => String(t).match(/\d+(?:[.:]\d+)?/g) || [];
const allowedIn = (...texts) => new Set(texts.flatMap((t) => nums(t)));
const okNums = (t, allowed) => nums(t).every((n) => allowed.has(n));
const PRONOUN = /\b(he|she|him|his|her|hers)\b/i;
export async function talk({ with: id, format = "singles", you = {}, onStep } = {}) {
  const say = (m) => onStep?.({ type: "a2a", ...m }), tell = (s) => onStep?.({ type: "step", ...s }), work = (step) => onStep?.({ type: "working", step });
  const club = readClub(), venues = readVenues(), m = club.members.find((x) => x.id === id);
  if (!m) throw new Error("unknown member");
  const me = { id: "you", name: "You", area: club.you.area, free: club.you.free }, them = first(m.name);
  const times = shared(club.you.free, m.free);
  tell({ step: `Opened a channel to ${them}'s agent`, tool: "a2a", detail: `agent to agent: each side shares only free times, format and limits; ${times.length} shared time${times.length === 1 ? "" : "s"} this week` });
  if (!times.length) throw new Error(`You and ${them} have no free time in common this week.`);
  const fits = (date, start) => { const s = times.find((x) => x.date === date && x.from <= start && start + 90 <= x.to); return s && court(s, start, 90, [me, m], venues) ? s : null; };
  const offer = (s, start) => { const c = court(s, start, 90, [me, m], venues); return c && { slot: s, start, c, text: `${when(s.date, hm(start))}–${hm(start + 90)} at ${c.v.name}, court ${c.court} (trips: you ${c.travel.find((x) => x.id === "you")?.min} min, ${them} ${c.travel.find((x) => x.id === m.id)?.min} min)` }; };
  const choices = times.map((s) => offer(s, s.from)).filter(Boolean);
  if (!choices.length) throw new Error(`No court is free when you and ${them} are both free this week.`);
  const allowed = allowedIn(...choices.map((x) => x.text), ...m.free, you.limit || "");
  const log = [];
  const brief = `${m.name}'s agent. ${m.name} plays ${m.prefers === "any" ? "singles or doubles" : m.prefers}, level ${m.level}, club rating ${m.rating}. Free: ${m.free.join(", ")}.${m.limit ? ` Health limit: ${m.limit}.` : ""} ${m.agent || ""}`;
  // your agent opens with the earliest time that suits you both, at the venue in the middle
  let cur = choices[0];
  work("Your agent is writing the proposal on Muse Glimmer");
  const open = await write(`You are the player's own scheduling agent in a badminton club app, writing to ${them}'s agent (another AI agent). Propose ${format}: ${cur.text}. Also possible: ${choices.slice(1, 3).map((x) => x.text).join("; ") || "nothing else this week"}.${you.limit ? ` Your player has a health limit: "${you.limit}".` : ""} One or two short sentences, polite and to the point, addressed to ${them}'s agent (not to ${them}), as one agent to another. Call people by first name, never "he" or "she". Use the times exactly as written. English only.`, `Proposing ${format} ${cur.text}.`, allowed);
  log.push({ from: "you", intent: "propose", when: cur.text, text: open });
  say({ from: "you", to: m.id, intent: "propose", when: cur.text, text: open });
  // their agent answers, and every time it names is checked; at most three rounds
  for (let round = 0; round < 3; round++) {
    work(`${them}'s agent is answering`);
    const sys = `You are ${brief}
You negotiate a badminton game for ${them} with another player's agent. You may accept a time, or counter with one time that suits ${them} better, or decline.
The other agent's options this week (all fit both calendars): ${choices.map((x) => `${x.slot.date} ${hm(x.start)} = ${x.text}`).join(" | ")}.
Return JSON only: {"intent": "accept" | "counter" | "decline", "date": "YYYY-MM-DD", "start": "HH:MM", "text": string}
- "text": one or two short sentences, as one agent to another, about ${them}'s wishes. Call ${them} by name, never "he" or "she". English only.
- For "counter", date and start must be one of the options above, or another time inside ${them}'s free times.`;
    const msgs = [{ role: "system", content: sys }, ...log.map((x) => ({ role: x.from === "you" ? "user" : "assistant", content: x.from === "you" ? x.text : JSON.stringify({ intent: x.intent, text: x.text }) }))];
    let j = null;
    try { j = parse((await chat(msgs, { maxTokens: 260, temperature: 0.5 })).text); } catch { /* their agent did not answer */ }
    if (!j || !["accept", "counter", "decline"].includes(j.intent)) j = { intent: "accept", text: `${them} can do ${cur.text}.`, by: "rules" };
    if (j.intent === "counter" && j.date === cur.slot.date && toMin(j.start || "00:00") === cur.start) j.intent = "accept";
    if (!okNums(j.text, allowedIn(...choices.map((x) => x.text), ...m.free, j.date || "", j.start || "")) || PRONOUN.test(j.text)) j.text = j.intent === "accept" ? `${them} can do it.` : j.intent === "counter" ? `${them} would rather play at another time.` : `${them} can't this week.`;
    if (j.intent === "decline") { log.push({ from: m.id, intent: "decline", text: j.text }); say({ from: m.id, to: "you", intent: "decline", text: j.text }); return { agreed: null, log, reason: j.text }; }
    if (j.intent === "counter") {
      const s = fits(j.date, toMin(j.start || "00:00"));
      const o = s && offer(s, toMin(j.start));
      if (!o) {
        log.push({ from: m.id, intent: "counter", when: `${j.date} ${j.start}`, text: j.text, checked: false });
        say({ from: m.id, to: "you", intent: "counter", when: `${j.date} ${j.start}`, text: j.text, checked: false });
        const facts = `That time does not fit: it is outside your player's free times or no court is free then. Still possible: ${choices.slice(0, 3).map((x) => x.text).join("; ")}.`;
        log.push({ from: "you", intent: "propose", when: cur.text, text: facts }); say({ from: "you", to: m.id, intent: "propose", when: cur.text, text: facts, checked: true });
        continue;
      }
      cur = o;
      log.push({ from: m.id, intent: "counter", when: cur.text, text: j.text, checked: true });
      say({ from: m.id, to: "you", intent: "counter", when: cur.text, text: j.text, checked: true });
      work("Your agent is checking the new time");
      const yes = await write(`You are the player's own scheduling agent writing to ${them}'s agent. Their counter-offer, ${cur.text}, fits your player's calendar and a court is free. Accept it in one short sentence, as one agent to another. Use the time exactly as written. English only.`, `Agreed: ${cur.text}.`, allowedIn(cur.text));
      log.push({ from: "you", intent: "accept", when: cur.text, text: yes }); say({ from: "you", to: m.id, intent: "accept", when: cur.text, text: yes, checked: true });
      break;
    }
    log.push({ from: m.id, intent: "accept", when: cur.text, text: j.text }); say({ from: m.id, to: "you", intent: "accept", when: cur.text, text: j.text, checked: true });
    break;
  }
  const agreed = option(cur.slot, cur.start, 90, cur.c, m, format, true);
  tell({ step: "Both agents agreed", tool: "verify", detail: `${cur.text}; checked against both calendars and the court's timetable` });
  return { agreed, log, with: { id: m.id, name: m.name } };
}
async function write(sys, fallback, allowed) {
  try {
    const r = await chat([{ role: "system", content: sys }, { role: "user", content: "Write it." }], { maxTokens: 200, temperature: 0.5 });
    const t = r.text.trim().replace(/^"|"$/g, "");
    return t && (!allowed || okNums(t, allowed)) && !PRONOUN.test(t) ? t : fallback;
  } catch { return fallback; }
}
