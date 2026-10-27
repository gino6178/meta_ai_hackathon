import { useEffect, useState } from "react";
import { agentPlay, agentQuests, agentClubPlan, agentChat, agentBook, agentBooking, agentCancel } from "./agent.js";
import { coachById } from "./coaches/personas.js";
import { tactics } from "./coaches/analysis.js";
import { memory } from "./memory.js";
import { patchGame, isoWeek } from "./club/game.js";
import { postToClub } from "./club/share.js";
import { prefersReducedMotion } from "./hooks.js";

// The agent's jobs. Everything the agent does for the player is a task: what was asked, the trail of steps as each one
// finishes (streamed from the gateway), and where it stands: running, needs you (a choice to make), done or failed.
// Tasks live in this browser and keep going while the player moves around the app; a booking that is waiting for
// answers is followed again after a reload.
const KEY = "shuttlecoach.tasks.v1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const first = (n) => n.split(" ")[0];
const subs = new Set();
let list = (() => {
  try {
    return (JSON.parse(localStorage.getItem(KEY)) || []).map((t) =>
      t.state === "running" && !t.booking ? { ...t, state: "failed", working: null, error: "Stopped when the page was closed. Ask again." } : t);
  } catch { return []; }
})();
function set(next) {
  list = next.slice(0, 30);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: this visit only */ }
  subs.forEach((f) => f(list));
}
// coach replies cite facts like [F12]; the cards and notices show the sentence without the tags
export const plain = (t) => String(t ?? "").replace(/\s*\[(?:F|E)\d+(?:,\s*(?:F|E)?\d+)*\]/g, "");
export function update(id, patch) { set(list.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t))); }
export const taskById = (id) => list.find((t) => t.id === id) || null;
export const dismiss = (id) => set(list.filter((t) => t.id !== id));
export function useTasks() {
  const [l, setL] = useState(list);
  useEffect(() => { subs.add(setL); setL(list); return () => subs.delete(setL); }, []);
  return l;
}

// what every job needs to know about the player: the zone they lose most points in, their level, and a health limit
// from what they told the coaches
const hurtIn = (texts) => texts.some((t) => /knee|ankle|膝|腳踝/i.test(t) && /sore|pain|hurt|injur|avoid jump|痛|痠|傷/i.test(t));
export function playerOf(data) {
  const t = tactics(data.outcomes, "A");
  return { weak: t.weak[0][0], level: "B", limit: hurtIn(memory.all().map((m) => m.text)) ? "no jump landings" : null };
}

// which job a sentence is: a highlight reel, play (court, people, challenge), quests, club night, the round table, or
// a coach question
export function intentOf(text) {
  if (/highlight|reel|instagram|facebook post|post (it|my|on)|精華|剪片/i.test(text)) return "highlight";
  if (/want to play|book|court|find a game|game (on|this|next)|play (on|this|next|tomorrow|tonight|with)|doubles|singles|spar|challenge|rematch|約|打球|訂場|找人|單打|雙打|單挑|陪練|對打/i.test(text)) return "play";
  if (/quest|gamif|任務/i.test(text)) return "quests";
  if (/club night|團練|社團練習/i.test(text)) return "night";
  if (/round ?table|plan my (training )?week|training plan|週計畫|訓練計畫/i.test(text)) return "roundtable";
  return "ask";
}
export const coachFor = (text) =>
  /warm|knee|ankle|gym|strength|fitness|tired|load|injur|stretch|recover|熱身|膝|體能|恢復/i.test(text) ? "fitness"
  : /smash|grip|stroke|technique|racket|clear|drop|net shot|serve|技術|殺球|發球/i.test(text) ? "technique"
  : /data|stats|habit|pattern|scout|數據|習慣/i.test(text) ? "analyst" : "tactics";

function create(kind, fields) {
  const id = `${kind}-${Date.now().toString(36)}`;
  set([{ id, kind, state: "running", steps: [], working: null, started: Date.now(), ...fields(id) }, ...list]);
  return id;
}
// The gateway sends steps the moment they finish, and the code steps come in a burst; they are shown one at a time
// so the trail can be followed (no pause when the player asked for less motion).
function trail(id) {
  let q = Promise.resolve();
  return {
    on: (e) => { q = q.then(async () => {
      if (e.type === "working") { update(id, { working: e.step }); if (!prefersReducedMotion()) await wait(300); return; }
      update(id, (t) => ({ steps: [...t.steps, { ...e, at: Date.now() }], working: null }));
      if (!prefersReducedMotion()) await wait(480);
    }); },
    settled: () => q,
  };
}
async function run(id, job, finish) {
  const tr = trail(id);
  try {
    const r = await job(tr.on);
    await tr.settled();
    update(id, { ...finish(r), working: null, finished: Date.now() });
  } catch (e) {
    await tr.settled();
    update(id, { state: "failed", working: null, error: `The agent could not be reached (${e.message}).`, finished: Date.now() });
  }
}

// ---- play: court, people, calendars, the venue in the middle; then the booking and the answers --------------------
export function startPlay(text, you) {
  const id = create("play", (id) => ({ title: text, href: `play?task=${id}` }));
  run(id, (on) => agentPlay(text, you, on), (r) => ({
    result: r, state: r.options.length ? "needs" : "done",
    summary: r.options.length ? `${r.options.length} options. Best: ${r.options[0].day} ${r.options[0].start} at ${r.options[0].venue.name}` : r.message,
  }));
  return id;
}
const bookingLine = (b) => b.state === "confirmed" ? `Game on: ${b.option.day} ${b.option.start}, ${b.option.venue.name}` : b.state === "cancelled" ? "Cancelled"
  : b.state === "short" ? "Not enough players yet" : `Waiting for answers: ${b.yes ?? 0} of ${b.need} in`;
export async function bookFor(id, option, you) {
  const t = taskById(id);
  const b = await agentBook(option, t?.result?.options?.[0]?.id === option.id ? t.result.invites : {}, you);
  if (b.error) throw new Error(b.error);
  update(id, { booking: b, chosen: option.id, state: "running", working: "Waiting for answers", summary: bookingLine(b) });
  follow(id);
}
// the same game at another time: release the court, then book and invite again
export async function rebookFor(id, option, you) {
  const t = taskById(id);
  if (t?.booking && t.booking.state !== "cancelled") await agentCancel(t.booking.id);
  await bookFor(id, option, you);
}
export async function cancelFor(id) {
  const t = taskById(id);
  const b = await agentCancel(t.booking.id);
  update(id, { booking: b, state: "done", working: null, summary: bookingLine(b) });
}
const following = new Set();
function follow(id) {
  if (following.has(id)) return;
  following.add(id);
  const tick = async () => {
    const t = taskById(id);
    if (!t?.booking) return following.delete(id);
    try {
      const b = await agentBooking(t.booking.id);
      if (b.error) { update(id, { state: "failed", working: null, error: b.error }); return following.delete(id); }
      const over = ["confirmed", "cancelled", "short"].includes(b.state);
      update(id, { booking: b, state: over ? (b.state === "short" ? "needs" : "done") : "running", working: over ? null : bookingLine(b), summary: bookingLine(b) });
      if (b.state === "confirmed") credit(b);
      if (over) return following.delete(id);
      setTimeout(tick, 1500);
    } catch { setTimeout(tick, 4000); }
  };
  tick();
}
list.filter((t) => t.booking && t.booking.state === "waiting").forEach((t) => follow(t.id));

// a confirmed game counts in the club game: +30 XP and a post in the club feed, once per booking
function credit(b) {
  let fresh = false;
  patchGame((s) => {
    if ((s.activity || []).some((a) => a.id === b.id)) return s;
    fresh = true;
    return { ...s, activity: [...(s.activity || []), { date: new Date().toISOString().slice(0, 10), week: isoWeek(), kind: "game", id: b.id }] };
  });
  if (!fresh) return;
  const names = b.invites.filter((i) => i.status === "in").map((i) => first(i.name));
  postToClub({ kind: "game", coach: "tactics", text: `Booked ${b.option.format} on ${b.option.day} ${b.option.start} at ${b.option.venue.name} with ${names.join(", ")}.`, reply: "Good game plan: use it to test this week's quest." });
}

// ---- the club: this week's quests, and club night -----------------------------------------------------------------
export function startQuests(notes) {
  const id = create("quests", () => ({ title: "This week's quests", href: "goals" }));
  run(id, (on) => agentQuests(notes, on), (r) => {
    patchGame((s) => ({ ...s, quests: { week: isoWeek(), data: r } }));
    return { state: "done", result: { boss: r.boss.name, n: r.quests.length, source: r.source }, summary: `${r.quests.length} quests. The boss is ${r.boss.name}` };
  });
  return id;
}
export function startNight(you) {
  const id = create("night", () => ({ title: "Plan club night", href: "club" }));
  run(id, (on) => agentClubPlan(you, on), (r) => {
    patchGame((s) => ({ ...s, night: { week: isoWeek(), data: r } }));
    return { state: "done", summary: r.plan?.title || "Club night is planned" };
  });
  return id;
}

// ---- a question for one coach, on Muse Glimmer, numbers checked --------------------------------------------------
export function startAsk(text, coach = coachFor(text)) {
  const c = coachById(coach);
  const id = create("ask", () => ({ title: text, coach, href: `coach/${coach}` }));
  run(id, async (on) => {
    on({ type: "step", step: `Handed it to ${c.name}`, tool: "route", detail: `${c.role}: the coach agent for this question` });
    on({ type: "working", step: `${c.name} is answering on Muse Glimmer` });
    const r = await agentChat(coach, text, []);
    on({ type: "step", step: "Recalled your notes", tool: "memory", detail: r.evidence?.length ? `${r.evidence.length} note${r.evidence.length > 1 ? "s" : ""} from your memory and the knowledge base` : "nothing in your memory was needed" });
    on({ type: "step", step: `${c.name} answered`, tool: "answer", detail: r.timing ? `Muse Glimmer, ${r.timing.seconds} s` : "Muse Glimmer", seconds: r.timing?.seconds });
    on({ type: "step", step: "Checked every number", tool: "verify", detail: r.verified?.offline ? "the model was unavailable, so the coach used the checked summary" : r.verified?.rejected ? "a draft failed the check, so the coach used the checked summary" : `${r.verified?.numbers ?? 0} numbers, each matched to a fact from your match${r.tries > 1 ? ` (rewritten once)` : ""}` });
    return r;
  }, (r) => ({ state: "done", result: { text: r.text, coach }, summary: r.text }));
  return id;
}
// an answer the match data gives straight away, without a model
export function quickAnswer(text, a) {
  const id = create("lookup", () => ({ title: text, href: a.go }));
  update(id, { state: "done", steps: [{ step: "Looked it up in your match", tool: "lookup", detail: "counted from the shot labels; no model needed", at: Date.now() }], result: { text: a.say }, summary: a.say, finished: Date.now() });
  return id;
}
