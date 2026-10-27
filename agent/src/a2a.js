// Agent to agent: your agent agrees a game with one or more members' agents. One engine for a one-to-one challenge and
// for a doubles four, where it talks to three agents at once (the model server runs four requests in parallel).
//   1. Code finds the times everyone is free and a venue in the middle with a free court for each (the only times any
//      agent may propose). It orders them by what it has learned about each member's agent: times they turned down
//      before go last, times they proposed go first.
//   2. Your agent proposes (Muse Glimmer writes it, from the checked offer only).
//   3. Every member's agent answers at the same time (Muse Glimmer, from what that member shares with it): accept,
//      counter with one time, or decline. A counter is checked by code against everyone's calendar and the court
//      timetable; one that does not fit is answered with the facts.
//   4. When agents disagree, your agent moves to the time most of them asked for, and asks again (three rounds at most).
// What each member's agent accepts and turns down is remembered (data/a2a_memory.json), so the next proposal lands
// sooner. Every message is written by the model; every time, court and trip in it comes from code.
import fs from "node:fs";
import path from "node:path";
import { chat } from "./llm.js";
import { demoVenues, helpers } from "./play.js";

const { windows, travelMin, kmBetween, ymd, hm, toMin, dateOf, DAYS } = helpers;
const FILE = path.resolve(process.env.A2A_FILE || "data/a2a_memory.json");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const first = (n) => n.split(" ")[0];
export const when = (date, start) => { const d = dateOf(date); return `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${start}`; };
const nums = (t) => String(t).match(/\d+(?:[.:]\d+)?/g) || [];
export const allowedIn = (...texts) => new Set(texts.flatMap((t) => nums(t)));
export const okNums = (t, allowed) => nums(t).every((n) => allowed.has(n));
export const PRONOUN = /\b(he|she|him|his|her|hers)\b/i;
const parse = (t) => { try { return JSON.parse((String(t).match(/\{[\s\S]*\}/) || ["null"])[0]); } catch { return null; } };

let memory = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
const saveMemory = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(memory)); };
const slotKey = (date, start) => `${DAYS[dateOf(date).getDay()]} ${(typeof start === "number" ? hm(start) : String(start)).slice(0, 2)}:00`;
function learn(id, date, start, kind) {
  const m = (memory[id] ||= { yes: {}, no: {}, asked: {} }), k = slotKey(date, start);
  m[kind][k] = (m[kind][k] || 0) + 1;
  saveMemory();
}
// what your agent has learned about a member's agent, in words (shown in the trail)
export function learned(id) {
  const m = memory[id]; if (!m) return null;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { yes: top(m.yes).concat(top(m.asked)).slice(0, 2), no: top(m.no).slice(0, 2) };
}
export const forgetMemory = () => { memory = {}; saveMemory(); };

// the times everyone is free in the next week, at least `minutes` long, earliest first
export function shared(people, minutes = 90, now = new Date()) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    let spans = [[0, 24 * 60]];
    for (const p of people) {
      const w = windows(p.free).filter((x) => x.day === d.getDay()).map((x) => [x.from, x.to]);
      spans = spans.flatMap(([a, b]) => w.map(([c, e]) => [Math.max(a, c), Math.min(b, e)])).filter(([a, b]) => b - a >= minutes);
    }
    const soonest = i === 0 ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 60) / 30) * 30 : 0;
    for (const [a, b] of spans) { const f = Math.max(a, soonest); if (b - f >= minutes) out.push({ date: ymd(d), day: DAYS[d.getDay()], from: f, to: b }); }
  }
  return out;
}
// a venue's offer for one sport (the demo venues list theirs under `sports`; badminton is the default)
const forSport = (v, sport) => (v.sports ? (v.sports[sport] ? { ...v, courts: v.sports[sport].courts, price: v.sports[sport].price } : null) : sport === "badminton" ? v : null);
// for one time: the venue with a free court where the longest trip is shortest
export function court(slot, start, minutes, people, venues, sport = "badminton") {
  const date = dateOf(slot.date), out = [];
  for (const v0 of venues.venues) {
    const v = forSport(v0, sport);
    if (!v) continue;
    const courts = demoVenues.freeCourts(v, date, start, minutes);
    if (!courts.length) continue;
    const travel = people.filter((p) => p.area).map((p) => ({ id: p.id, name: p.name, min: travelMin(p.area, v), km: +kmBetween(p.area, v).toFixed(1) }));
    out.push({ v, court: courts[0], courtsFree: courts.length, travel, longest: Math.max(0, ...travel.map((t) => t.min)) });
  }
  return out.sort((a, b) => a.longest - b.longest)[0] || null;
}
// an option in the shape Play books (play.book)
export function option(slot, start, minutes, c, members, format, sport, agreed) {
  const total = Math.round((c.v.price * minutes) / 60), players = members.length + 1;
  return {
    id: `${c.v.id}-${slot.date}-${hm(start)}`, date: slot.date, day: slot.day, start: hm(start), end: hm(start + minutes), minutes, sport,
    venue: { id: c.v.id, name: c.v.name, area: c.v.area, km: c.travel.find((t) => t.id === "you")?.km ?? null, x: c.v.x, y: c.v.y }, court: c.court, courtsFree: c.courtsFree,
    travel: c.travel, longest: c.longest, format, players, price: c.v.price, total, each: Math.round(total / players),
    partners: members.map((m) => ({ id: m.id, name: m.name, level: m.level, why: ["your agents agreed the time"] })), spare: [], asked: members.map((m) => m.id), agreed: agreed ? members.map((m) => m.id) : [],
  };
}

async function write(sys, fallback, allowed) {
  try {
    const r = await chat([{ role: "system", content: sys }, { role: "user", content: "Write it." }], { maxTokens: 200, temperature: 0.5 });
    const t = r.text.trim().replace(/^"|"$/g, "");
    return t && (!allowed || okNums(t, allowed)) && !PRONOUN.test(t) ? t : fallback;
  } catch { return fallback; }
}

// one member's agent answering a proposal: Muse Glimmer, from what the member shares; its time is checked by the caller
async function answer(m, cur, choices, log, format, sport) {
  const them = first(m.name);
  const sys = `You are ${m.name}'s agent. ${m.name} plays ${m.prefers === "any" ? "singles or doubles" : m.prefers}, level ${m.level}. Free: ${m.free.join(", ")}.${m.limit ? ` Health limit: ${m.limit}.` : ""} ${m.agent || ""}
You are agreeing a ${sport} ${format} game for ${them} with another player's agent. Accept the proposed time, or counter with one time that suits ${them} better, or decline.
Times that fit everyone's calendar this week: ${choices.map((x) => `${x.slot.date} ${hm(x.start)} = ${x.text}`).join(" | ")}.
Return JSON only: {"intent": "accept" | "counter" | "decline", "date": "YYYY-MM-DD", "start": "HH:MM", "text": string}
- "text": one or two short sentences, as one agent to another, about ${them}'s wishes. Call ${them} by name, never "he" or "she". English only.
- Say only what is written above about ${them}; ${m.limit ? "" : `${them} has no health limit, so do not mention one; `}a limit the other player has is theirs, not ${them}'s.
- For "counter", date and start must be one of the times above, or another time inside ${them}'s free times.`;
  const msgs = [{ role: "system", content: sys }, ...log.map((x) => ({ role: x.from === "you" ? "user" : "assistant", content: x.from === "you" ? x.text : JSON.stringify({ intent: x.intent, text: x.text }) }))];
  let j = null;
  try { j = parse((await chat(msgs, { maxTokens: 260, temperature: 0.5 })).text); } catch { /* their agent did not answer */ }
  if (!j || !["accept", "counter", "decline"].includes(j.intent)) j = { intent: "accept", text: `${them} can do ${cur.text}.` };
  if (j.intent === "counter" && j.date === cur.slot.date && toMin(j.start || "00:00") === cur.start) j.intent = "accept";
  if (!okNums(j.text, allowedIn(...choices.map((x) => x.text), ...m.free, j.date || "", j.start || "")) || PRONOUN.test(j.text))
    j.text = j.intent === "accept" ? `${them} can do it.` : j.intent === "counter" ? `${them} would rather play at another time.` : `${them} can't this week.`;
  return j;
}

// negotiate one game with the given members' agents. say() hears every message, tell() every step.
export async function negotiate({ me, members, venues, format = "singles", sport = "badminton", minutes = 90, prefer = null, exclude = [], limit = null, say = () => {}, tell = () => {}, work = () => {}, now = new Date() }) {
  const names = members.map((m) => first(m.name)), people = [me, ...members];
  const times = shared(people, minutes, now);
  const offer = (s, start) => {
    const c = court(s, start, minutes, people, venues, sport);
    return c && { slot: s, start, c, text: `${when(s.date, hm(start))}–${hm(start + minutes)} at ${c.v.name}, court ${c.court} (trips: ${c.travel.map((t) => `${t.id === "you" ? "you" : first(t.name)} ${t.min} min`).join(", ")})` };
  };
  // each shared window offers its start and, if it is long, a second start an hour later
  // days that already have a game (exclude) are left out
  const choices = times.filter((s) => !exclude.includes(s.date)).flatMap((s) => [s.from, ...(s.to - s.from >= minutes + 60 ? [s.from + 60] : [])].map((st) => offer(s, st))).filter(Boolean);
  if (!choices.length) return { agreed: null, reason: times.length ? "no court is free when everyone is" : `${names.join(" and ")} and you have no free time in common this week`, rounds: 0, log: [] };
  // what we know about these agents goes first: their past yeses up, their past noes down
  const score = (x) => members.reduce((s, m) => { const mm = memory[m.id], k = slotKey(x.slot.date, x.start); return s + (mm ? 2 * ((mm.yes[k] || 0) + (mm.asked[k] || 0)) - 3 * (mm.no[k] || 0) : 0); }, 0);
  const ordered = choices.map((x, i) => ({ x, s: score(x) - i * 0.01 + (prefer && x.slot.day === prefer.day ? 20 - Math.abs(x.start - toMin(prefer.start)) / 30 : 0) })).sort((a, b) => b.s - a.s).map((y) => y.x);
  const known = members.map((m) => [m, learned(m.id)]).filter(([, l]) => l && (l.no.length || l.yes.length));
  if (known.length) tell({ step: "Used what it learned about their agents", tool: "memory", detail: known.map(([m, l]) => `${first(m.name)}: ${l.yes.length ? `says yes to ${l.yes.join(", ")}` : ""}${l.yes.length && l.no.length ? "; " : ""}${l.no.length ? `turned down ${l.no.join(", ")}` : ""}`).join(" · ") });
  let cur = ordered[0], wanted = new Set(); // members whose own counter is the time now on the table
  const logs = Object.fromEntries(members.map((m) => [m.id, []])), all = [];
  const allowed = allowedIn(...choices.map((x) => x.text), limit || "");
  work("Your agent is writing the proposal on Muse Glimmer");
  let mine = await write(`You are the player's own scheduling agent in a ${sport} club app, writing to ${names.length > 1 ? `the agents of ${names.join(", ")}` : `${names[0]}'s agent`} (other AI agents). Propose ${sport} ${format}: ${cur.text}.${ordered.length > 1 ? ` Also possible: ${ordered.slice(1, 3).map((x) => when(x.slot.date, hm(x.start))).join(", ")}.` : ""}${limit ? ` Your player has a health limit: "${limit}".` : ""} At most two short sentences and 45 words, polite and to the point, addressed to the agents (not to the players), as one agent to another. Call people by first name, never "he" or "she". Use the times exactly as written. English only.`, `Proposing ${sport} ${format} ${cur.text}.`, allowed);
  for (let round = 1; round <= 3; round++) {
    const m0 = { from: "you", to: members.map((m) => m.id), intent: "propose", when: cur.text, text: mine, round };
    all.push(m0); say(m0); members.forEach((m) => logs[m.id].push(m0));
    work(members.length > 1 ? `${names.join(", ")}'s agents are answering at the same time` : `${names[0]}'s agent is answering`);
    const t0 = Date.now();
    // an agent that asked for this very time is not asked again: its yes is already on record
    const replies = await Promise.all(members.map((m) => (wanted.has(m.id) ? { intent: "accept", text: `${first(m.name)} asked for this time.`, auto: true } : answer(m, cur, choices, logs[m.id], format, sport))));
    const secs = (Date.now() - t0) / 1000;
    const counters = [];
    replies.forEach((j, k) => {
      const m = members[k];
      let msg;
      if (j.intent === "counter") {
        // a counter must fit everyone's calendar and a court, and not fall on a day that already has a game
        const s = !exclude.includes(j.date) && times.find((x) => x.date === j.date && x.from <= toMin(j.start || "00:00") && toMin(j.start || "00:00") + minutes <= x.to);
        const o = s && offer(s, toMin(j.start));
        msg = { from: m.id, to: "you", intent: "counter", when: o ? o.text : `${j.date} ${j.start}`, text: j.text, checked: !!o, round };
        if (o) counters.push(o);
        learn(m.id, cur.slot.date, cur.start, "no");
        if (o) learn(m.id, o.slot.date, o.start, "asked");
      } else {
        msg = { from: m.id, to: "you", intent: j.intent, when: j.intent === "accept" ? cur.text : undefined, text: j.text, checked: j.intent === "accept" ? true : undefined, round };
        learn(m.id, cur.slot.date, cur.start, j.intent === "accept" ? "yes" : "no");
      }
      all.push(msg); say(msg); logs[m.id].push(msg);
    });
    if (members.length > 1) tell({ step: `Round ${round}: heard from ${members.length} agents in ${secs.toFixed(0)} s`, tool: "a2a", detail: `${replies.filter((j) => j.intent === "accept").length} agreed, ${counters.length} countered, ${replies.filter((j) => j.intent === "decline").length} declined; answered in parallel` });
    const declined = replies.map((j, k) => j.intent === "decline" && members[k]).filter(Boolean);
    if (declined.length) return { agreed: null, reason: `${declined.map((m) => first(m.name)).join(" and ")} declined`, declined: declined.map((m) => m.id), rounds: round, log: all };
    if (replies.every((j) => j.intent === "accept")) {
      const agreed = option(cur.slot, cur.start, minutes, cur.c, members, format, sport, true);
      tell({ step: members.length > 1 ? `All ${members.length + 1} agents agreed` : "Both agents agreed", tool: "verify", detail: `${cur.text}; checked against everyone's calendar and the court's timetable` });
      return { agreed, rounds: round, log: all, text: cur.text };
    }
    // the time most counters asked for (the earliest on a tie); if no counter fits, the next time nobody turned down
    const tally = new Map();
    counters.forEach((o) => { const k = `${o.slot.date} ${o.start}`; tally.set(k, { o, n: (tally.get(k)?.n || 0) + 1 }); });
    const next = [...tally.values()].sort((a, b) => b.n - a.n || a.o.slot.date.localeCompare(b.o.slot.date) || a.o.start - b.o.start)[0]?.o
      || ordered.find((x) => x !== cur && !all.some((y) => y.intent === "propose" && y.when === x.text));
    if (!next) break;
    cur = next;
    wanted = new Set(members.filter((m, k) => replies[k].intent === "counter" && counters.some((o) => o === cur) && all.some((y) => y.from === m.id && y.round === round && y.when === cur.text)).map((m) => m.id));
    // one-to-one: their counter fits, so your agent simply agrees
    if (members.length === 1 && wanted.size === 1) {
      work("Your agent is checking the new time");
      const yes = await write(`You are the player's own scheduling agent writing to ${names[0]}'s agent. Their counter-offer, ${cur.text}, fits your player's calendar and a court is free. Accept it in one short sentence, as one agent to another. Use the time exactly as written. English only.`, `Agreed: ${cur.text}.`, allowedIn(cur.text));
      const m1 = { from: "you", to: [members[0].id], intent: "accept", when: cur.text, text: yes, checked: true, round };
      all.push(m1); say(m1);
      const agreed = option(cur.slot, cur.start, minutes, cur.c, members, format, sport, true);
      tell({ step: "Both agents agreed", tool: "verify", detail: `${cur.text}; checked against both calendars and the court's timetable` });
      return { agreed, rounds: round, log: all, text: cur.text };
    }
    work("Your agent is checking the new time");
    mine = await write(`You are the player's own scheduling agent writing to ${names.length > 1 ? `the agents of ${names.join(", ")}` : `${names[0]}'s agent`}. ${counters.length ? `Moving the game to ${cur.text}, the time asked for, which fits everyone's calendar and has a free court.` : `The last time did not fit. Proposing ${cur.text} instead, which fits everyone's calendar.`} One short sentence, as one agent to another. Use the time exactly as written. English only.`, `${counters.length ? "Moving to" : "How about"} ${cur.text}?`, allowedIn(cur.text));
  }
  return { agreed: null, reason: "the agents did not settle on a time in three rounds", rounds: 3, log: all };
}
