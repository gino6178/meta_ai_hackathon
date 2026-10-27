// Autopilot: your agent keeps you playing, without being asked.
//   It learns your habits from your games (the days and times you keep coming back to, and how long you play) and who
//   you play best with: a game that runs past its booking says the two of you click, and those partners come first.
//   Against a weekly goal ("play twice a week"), Muse Glimmer runs the week as a tool-using agent: it checks what is
//   booked, picks habitual times that are still open, finds the best partners for each, negotiates with their agents
//   (all three at once for doubles), re-plans when someone declines or a time does not fit, and asks you once, in the
//   app or in Messenger, before anything is booked (or nudges you when nothing works).
//   It also reads your body log and your health app (body.js): while something is sore it plays doubles and skips jump
//   sports, it keeps games short when your back hurts, and in a week over 1.5 times your usual load it plans one game
//   fewer. For basketball, soccer or volleyball, or when the courts are full, it looks for a free public court or a
//   park nearby (places.js: OpenStreetMap, Google Maps reviews, the forecast), judged playable at that hour.
//   Every tool result is computed by code; the model only decides what to do next and says why. It cannot book: the
//   only way to a booking is your yes. A run has a step budget, and if the model stalls, the same plan is finished by
//   rules (and the trail says so).
import fs from "node:fs";
import path from "node:path";
import { chatTools, stats } from "./llm.js";
import { readClub } from "./club.js";
import { helpers, styleMatch, opponentStyle } from "./play.js";
import { negotiate, first, court, learned, okNums, allowedIn, PRONOUN } from "./a2a.js";
import { organize } from "./body.js";
import * as places from "./places.js";

const { windows, travelMin, ymd, hm, toMin, dateOf, readVenues, DAYS } = helpers;
const FILE = path.resolve(process.env.AUTOPILOT_FILE || "data/autopilot.json");
let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { runs: [], pending: {} };
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); };
const expect = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
const LONG_DAY = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

// ---- what it learns ---------------------------------------------------------------------------------------------
// habits: the weekday and start time you keep playing at, over the eight weeks before your latest game
export function habits(history = []) {
  if (!history.length) return [];
  const last = history.map((h) => h.date).sort().at(-1), since = dateOf(last); since.setDate(since.getDate() - 55);
  const recent = history.filter((h) => dateOf(h.date) >= since), weeks = 8, g = {};
  for (const h of recent) {
    const day = DAYS[dateOf(h.date).getDay()], k = `${day} ${h.start}`;
    (g[k] ||= { day, start: h.start, count: 0, played: [], sports: {} }).count++;
    g[k].played.push(h.played || h.booked || 90); g[k].sports[h.sport || "badminton"] = (g[k].sports[h.sport || "badminton"] || 0) + 1;
  }
  return Object.values(g).map((x) => ({ ...x, weeks, share: +(x.count / weeks).toFixed(2), minutes: Math.round(x.played.reduce((a, b) => a + b, 0) / x.played.length), sport: Object.entries(x.sports).sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.count - a.count).map(({ played, sports, ...x }) => x);
}
// chemistry: with whom your games run past the booking (the two of you kept playing), and how often you play
export function chemistry(history = []) {
  const per = {};
  for (const h of history) for (const id of h.with || []) {
    const x = (per[id] ||= { n: 0, ext: [] }); x.n++;
    if (h.booked && h.played) x.ext.push(h.played / h.booked - 1);
  }
  return Object.fromEntries(Object.entries(per).map(([id, x]) => {
    const ext = x.ext.length ? x.ext.reduce((a, b) => a + b, 0) / x.ext.length : 0;
    return [id, { n: x.n, ext: Math.round(ext * 100), score: +(Math.min(1, x.n / 4) * 0.5 + Math.max(0, ext) * 3).toFixed(2) }];
  }));
}

// the dates of the next seven days, with their weekday
const nextDays = (now) => Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); return { date: ymd(d), day: DAYS[d.getDay()] }; });
const freeAt = (free, day, start, minutes) => windows(free).some((w) => DAYS[w.day] === day && w.from <= start && start + minutes <= w.to);

// ---- the tools Muse Glimmer can call ------------------------------------------------------------------------------
const TOOLS = [
  { name: "get_week", description: "This week so far: the goal, games already booked, how many are still needed, your habitual play times and the partners you play best with.", parameters: { type: "object", properties: {} } },
  { name: "check_body", description: "What the player's body log and health app say: anything sore, this week's training load against their usual week, and the limits that follow (format, game length, sports to skip, one game fewer).", parameters: { type: "object", properties: {} } },
  { name: "find_places", description: "Free public courts and parks near the player for the goal sport at one time, each judged playable or not from the map, Google Maps reviews and the forecast. Use for basketball, soccer or volleyball, or when club courts are full or far. Pass a place id to negotiate.", parameters: { type: "object", properties: { day: { type: "string" }, start: { type: "string", description: "HH:MM" }, reason: { type: "string" } }, required: ["day", "start", "reason"] } },
  { name: "find_partners", description: "Rank the club members who are free at one of your times this week, for singles (one opponent) or doubles (three players).", parameters: { type: "object", properties: { day: { type: "string", description: "Mon..Sun" }, start: { type: "string", description: "HH:MM" }, format: { type: "string", enum: ["singles", "doubles"] }, reason: { type: "string", description: "one sentence: why this time" } }, required: ["day", "start", "format", "reason"] } },
  { name: "negotiate", description: "Your agent agrees the game with these members' agents (in parallel). Returns the agreed time, court and trips, or why it failed.", parameters: { type: "object", properties: { members: { type: "array", items: { type: "string" }, description: "member ids: 1 for singles, 3 for doubles" }, day: { type: "string" }, start: { type: "string" }, format: { type: "string", enum: ["singles", "doubles"] }, place: { type: "string", description: "optional: a place id from find_places, for a public court instead of a club venue" }, reason: { type: "string", description: "one sentence: why these people" } }, required: ["members", "day", "start", "format", "reason"] } },
  { name: "request_approval", description: "Ask the player once to approve the games the agents agreed. Nothing is booked without this.", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
  { name: "nudge", description: "Send the player a short reminder when nothing could be agreed.", parameters: { type: "object", properties: { text: { type: "string" }, reason: { type: "string" } }, required: ["text", "reason"] } },
  { name: "finish", description: "End the run with a one-sentence summary for the player.", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
].map((f) => ({ type: "function", function: f }));

export async function run({ you = {}, history = [], goal = {}, ratings = {}, upcoming = [], body = null, messenger = null, notify = null, onStep, now = new Date() } = {}) {
  stats.peak = stats.inflight; // this run's peak of model calls at the same time
  const t0 = Date.now(), s0 = { ...stats };
  const tell = (s) => onStep?.({ type: "step", ...s }), work = (step) => onStep?.({ type: "working", step });
  const club = readClub(), venues = readVenues(), id = `ap-${t0.toString(36)}`;
  const me = { id: "you", name: "You", area: club.you.area, free: club.you.free };
  const g = { perWeek: 2, sport: "badminton", approval: "ask", maxTrip: 30, ...club.you.goal, ...goal };
  const hist = [...(club.you.history || []), ...history].map((h) => ({ ...h }));
  // the body log and the health app: a watch's minutes for a booked game replace the booking; soreness and load set limits
  const org = organize({ log: body?.log || [], workouts: body?.workouts || [], days: body?.days || [], games: hist, now });
  for (const l of org.linked) { const h = hist.find((x) => x.date === l.date && (x.start || null) === (l.start || null)); if (h) h.played = l.minutes; }
  const bp = org.plan, limit = you.limit || bp.limit, minutes = bp.capMinutes || 90, perWeek = Math.max(1, g.perWeek + bp.perWeekDelta);
  const geo = venues.map?.geo, found = {};
  const habit = habits(hist).filter((h) => h.share >= 0.25), chem = chemistry(hist);
  const days = nextDays(now), opp = opponentStyle();
  const r = (mid) => ratings[mid] ?? (mid === "you" ? club.you.rating : club.members.find((m) => m.id === mid)?.rating ?? 1500);
  // games already on your book this week (the app sends its own; Messenger players' come from their calendar)
  const booked = upcoming.filter((b) => days.some((d) => d.date === b.date));
  const agreed = [], tried = [], trail = [];
  const decisions = [];
  let calls = 0, ruleTook = false, finished = null, approval = null;

  const tools = {
    check_body() {
      const sore = org.parts.filter((p) => p.active);
      return { sore: sore.map((p) => `${p.name} ${p.latest.level}/5, ${p.trend === "new" ? "first logged" : p.trend}${p.physio ? ", worth seeing a physio" : ""}`), allClear: !sore.length,
        load: org.load.acwr != null ? { thisWeek: org.load.acute, usualWeek: org.load.chronic, ratio: org.load.acwr } : "no load data yet",
        limits: { format: bp.format || "any", gameMinutes: minutes, skipSports: [...new Set([...bp.avoid, ...bp.pause])], gamesThisWeek: perWeek !== g.perWeek ? `${perWeek} instead of ${g.perWeek}` : g.perWeek },
        agentActions: org.actions.filter((a) => a.kind !== "follow").map((a) => a.text), fromHealthApp: org.linked.length ? org.linked.map((l) => `${l.date} game ran ${l.minutes} min (booked ${l.booked || "?"})`) : undefined };
    },
    async find_places({ day, start = "19:00" }) {
      const d = days.find((x) => x.day === day);
      if (!d) return { error: `${day} is not in the next seven days` };
      if (!geo) return { error: "the club map has no real-world location (venues.json map.geo)" };
      const here = places.toGeo(geo, club.you.area);
      const res = await places.search({ ...here, sport: g.sport, date: d.date, start, limit: 4, radius: 2500, onStep: (e) => e.type === "working" && work(e.step) });
      const ok = res.places.filter((p) => p.verdict !== "no").slice(0, 3);
      ok.forEach((p) => { found[p.id] = p; });
      const club0 = venues.venues.map((v) => v.sports?.[g.sport]).filter(Boolean).sort((a, b) => a.price - b.price)[0];
      decisions.push({ kind: "places", at: `${day} ${start}`, options: ok.map((p) => ({ id: p.id, name: p.name, verdict: p.verdict, why: p.reasons.map((x) => x.text) })) });
      return ok.length ? { day, start, places: ok.map((p) => ({ id: p.id, name: p.name, metersAway: p.dist, verdict: p.verdict, why: p.reasons.slice(0, 2).map((x) => x.text), outdoor: p.outdoor, cost: "free, first come" })), clubCourt: club0 ? `cheapest club court NT$${club0.price} an hour` : `no club venue has ${g.sport}`, reviewsRead: res.reviews }
        : { error: `No public place nearby looks playable for ${g.sport} ${day} ${start}` };
    },
    get_week() {
      const need = Math.max(0, perWeek - booked.length - agreed.length);
      const open = habit.map((h) => { const d = days.find((x) => x.day === h.day); return d && { ...h, date: d.date, taken: booked.some((b) => b.date === d.date) || agreed.some((a) => a.date === d.date) }; }).filter(Boolean);
      const best = Object.entries(chem).sort((a, b) => b[1].score - a[1].score).slice(0, 3).map(([mid, c]) => { const m = club.members.find((x) => x.id === mid); return m && { id: mid, name: m.name, games: c.n, ranLonger: `${c.ext}%` }; }).filter(Boolean);
      // when the usual times run out, the player's other free times this week, on days with no game yet
      const left = open.filter((h) => !h.taken).length, soon = now.getHours() * 60 + now.getMinutes() + 60;
      const other = need > left ? days.filter((d) => !open.some((h) => h.date === d.date) && !booked.some((b) => b.date === d.date) && !agreed.some((a) => a.date === d.date))
        .flatMap((d) => windows(me.free).filter((w) => DAYS[w.day] === d.day && w.to - w.from >= minutes).map((w) => ({ day: d.day, date: d.date, start: hm(Math.max(w.from, d.date === ymd(now) ? Math.ceil(soon / 30) * 30 : w.from)), to: w.to })))
        .filter((x) => toMin(x.start) + minutes <= x.to).slice(0, 4).map(({ to, ...x }) => x) : [];
      return { today: `${DAYS[now.getDay()]} ${ymd(now)}`, goal: `${perWeek} ${g.sport} games this week${perWeek !== g.perWeek ? ` (one fewer than usual: your load is ${org.load.acwr} times your usual week)` : ""}`, gameMinutes: minutes, booked: booked.map((b) => `${DAYS[dateOf(b.date).getDay()]} ${b.start}`), agreed: agreed.map((a) => `${a.day} ${a.start}`), stillNeeded: need,
        habitualTimes: open.map((h) => ({ day: h.day, start: h.start, date: h.date, played: `${h.count} of the last ${h.weeks} weeks`, usualMinutes: h.minutes, alreadyTaken: h.taken })),
        ...(other.length ? { otherFreeTimes: other, otherNote: "your usual times are not enough this week: these are other times you are free" } : {}),
        playsBestWith: best, healthLimit: limit || null, note: limit ? "with a health limit, doubles first; call check_body" : body?.log?.length || body?.workouts?.length ? "call check_body before choosing" : undefined };
    },
    find_partners({ day, start, format = "singles" }) {
      const d = days.find((x) => x.day === day);
      if (!d) return { error: `${day} is not in the next seven days` };
      const st = toMin(start || "19:00");
      if (!freeAt(me.free, day, st, minutes)) return { error: `You are not usually free ${day} ${start}; pick one of your habitual times` };
      if (bp.pause.includes(`${g.sport} ${format}`) || bp.pause.includes(g.sport)) return { error: `${g.sport} ${format} is paused while ${org.parts.find((p) => p.physio)?.name || "a sore part"} settles; try doubles` };
      const free = club.members.filter((m) => (m.sports || ["badminton"]).includes(g.sport) && (m.prefers === "any" || m.prefers === format || g.sport !== "badminton") && freeAt(m.free, day, st, minutes) && !tried.some((t) => t.id === m.id && t.date === d.date));
      const rows = free.map((m) => {
        const p = expect(r("you"), r(m.id)), fair = 1 - Math.abs(0.5 - p) * 2, c = chem[m.id], st2 = styleMatch(m.mix, opp);
        const cv = court({ date: d.date, day }, st, minutes, [me, m], venues, g.sport);
        const why = [`win chance ${Math.round(p * 100)}%`, c && c.ext > 5 ? `your games ran ${c.ext}% over the booking (${c.n} games)` : c ? `played together ${c.n} times` : "a new partner for you", m.strength?.zone === (you.weak || "rear forehand") ? `their ${m.strength.shot} trains your ${you.weak || "rear forehand"}` : null, cv ? `trip ${cv.travel.find((x) => x.id === m.id)?.min} min for ${first(m.name)}` : null].filter(Boolean);
        const score = 3 * fair + (c ? 2 * c.score : 0.2) + (m.strength?.zone === (you.weak || "rear forehand") ? 1 : 0) + 1.2 * (st2.sim - 0.5) - (cv ? 0.03 * cv.longest : 1);
        return { id: m.id, name: m.name, rating: r(m.id), fit: score, why };
      }).sort((a, b) => b.fit - a.fit);
      const top = rows.slice(0, format === "doubles" ? 5 : 3).map((x) => ({ ...x, fit: +x.fit.toFixed(2) }));
      decisions.push({ kind: "partners", at: `${day} ${start}`, format, options: top });
      return top.length ? { day, start, date: d.date, format, candidates: top, ...(bp.format === "doubles" && format === "singles" ? { note: "the body log says doubles first" } : {}) } : { error: `Nobody who plays ${format} is free ${day} ${start}` };
    },
    async negotiate({ members = [], day, start, format = "singles", place = null }) {
      const d = days.find((x) => x.day === day), ms = members.map((mid) => club.members.find((m) => m.id === mid)).filter(Boolean);
      if (!d) return { error: `${day} is not in the next seven days` };
      if (ms.length !== (format === "doubles" ? 3 : 1)) return { error: `${format} needs ${format === "doubles" ? "three members" : "one member"}; got ${ms.length}` };
      if (place && !found[place]) return { error: `${place} is not a place find_places returned` };
      const busy = ms.filter((m) => !freeAt(m.free, day, toMin(start), minutes));
      if (busy.length) return { error: `${busy.map((m) => first(m.name)).join(" and ")} ${busy.length > 1 ? "are" : "is"} not free ${day} ${start}` };
      const game = agreed.length + tried.length;
      // a public court from find_places: one court, free, first come, its place on the club map from its real position
      const pv = place && found[place], at = pv && places.toTown(geo, pv);
      const where = pv ? { ...venues, venues: [{ id: place.replace(/[^\w]+/g, "-"), name: pv.name, area: pv.inPark || "public", x: at.x, y: at.y, courts: 1, price: 0, open: ["06:00", "22:00"], peakBusy: /crowd/i.test(pv.reasons.map((x) => x.text).join(" ")) ? 0.6 : 0.35, offBusy: 0.2, sports: { [g.sport]: { courts: 1, price: 0 } } }] } : venues;
      const res = await negotiate({ me, members: ms, venues: where, format, sport: g.sport, minutes, prefer: { day, start }, exclude: [...booked.map((x) => x.date), ...agreed.map((x) => x.date)], limit, now,
        say: (x) => onStep?.({ type: "a2a", game, ...x }), tell, work });
      // only an agent that said no is passed over for that day; the others are still candidates
      (res.declined?.length ? ms.filter((m) => res.declined.includes(m.id)) : res.agreed ? ms : []).forEach((m) => tried.push({ id: m.id, date: d.date }));
      if (!res.agreed) return { agreed: false, reason: res.reason, rounds: res.rounds, declined: res.declined || [] };
      const o = res.agreed;
      if (o.longest > g.maxTrip) return { agreed: false, reason: `the only court is ${o.longest} min away, over your ${g.maxTrip}-minute limit` };
      if (pv) Object.assign(o.venue, { public: true, url: pv.url || null, verdict: pv.verdict, lat: pv.lat, lon: pv.lon, outdoor: pv.outdoor });
      agreed.push(o);
      decisions.push({ kind: "agreed", at: `${o.day} ${o.start}`, with: ms.map((m) => m.name), venue: o.venue.name, rounds: res.rounds });
      return { agreed: true, when: `${o.day} ${o.date} ${o.start}-${o.end}`, venue: o.venue.name + (pv ? " (public, free)" : ""), court: o.court, trips: o.travel.map((t) => `${t.id === "you" ? "you" : first(t.name)} ${t.min} min`), each: `NT$${o.each}`, rounds: res.rounds };
    },
    request_approval() {
      if (!agreed.length) return { error: "nothing agreed yet to approve" };
      approval = { id, games: agreed.map((o) => o.id), status: "pending", at: Date.now() };
      db.pending[id] = { options: agreed, status: "pending", messenger, at: Date.now() };
      save();
      return { sent: true, where: messenger ? "the app and Messenger" : "the app", games: agreed.length };
    },
    nudge({ text }) { db.pending[`${id}-nudge`] = { nudge: String(text).slice(0, 300), at: Date.now() }; save(); return { sent: true }; },
    finish({ summary }) { finished = String(summary || "").slice(0, 400); return { ok: true }; },
  };
  const label = {
    get_week: () => "Checked your week", check_body: () => "Checked your body log", find_places: (a) => `Looked for public courts ${a.day} ${a.start}`, find_partners: (a) => `Looked for ${a.format} partners ${a.day} ${a.start}`,
    negotiate: (a) => `Negotiated with ${(a.members || []).map((x) => first(club.members.find((m) => m.id === x)?.name || x)).join(", ")}'s agent${(a.members || []).length > 1 ? "s" : ""}`,
    request_approval: () => "Asked you to approve", nudge: () => "Sent you a nudge", finish: () => "Finished",
  };
  const detailOf = (name, res) => res.error ? `refused: ${res.error}` : name === "get_week" ? `${res.stillNeeded} game${res.stillNeeded === 1 ? "" : "s"} still needed; usual times ${res.habitualTimes.filter((h) => !h.alreadyTaken).map((h) => `${h.day} ${h.start} (${h.played})`).join(", ") || "none open"}`
    : name === "check_body" ? (res.allClear ? "nothing sore" : `sore: ${res.sore.join(", ")}`) + (typeof res.load === "object" ? ` · load ${res.load.ratio} times your usual week` : "") + ` · ${res.limits.format === "any" ? "any format" : res.limits.format + " first"}, ${res.limits.gameMinutes}-minute games${res.limits.skipSports.length ? `, no ${res.limits.skipSports.join(", ")}` : ""}`
    : name === "find_places" ? res.places.map((p) => `${p.name} (${p.metersAway} m): ${p.verdict}`).join(" · ")
    : name === "find_partners" ? res.candidates.map((c) => `${first(c.name)}: ${c.why.slice(0, 2).join(", ")}`).join(" · ")
    : name === "negotiate" ? (res.agreed ? `agreed ${res.when} at ${res.venue}, court ${res.court}, in ${res.rounds} round${res.rounds > 1 ? "s" : ""}` : `no deal: ${res.reason}`)
    : name === "request_approval" ? `${res.games} game${res.games > 1 ? "s" : ""}, waiting for your yes in ${res.where}` : name === "nudge" ? "sent" : "";
  // a reason given after a game was agreed must not name a time that is not one of the agreed games'
  const staleTime = (t) => [...String(t || "").matchAll(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\d{1,2}:\d\d)/g)].some((m) => !agreed.some((o) => o.day === m[1] && o.start === m[2].padStart(5, "0")));
  async function call(name, args, by) {
    const f = tools[name];
    if (!f) return { error: `no tool called ${name}` };
    if (["request_approval", "finish", "nudge"].includes(name) && agreed.length && staleTime(args?.reason)) args = { ...args, reason: undefined };
    let res;
    try { res = await f(args || {}); } catch (e) { res = { error: String(e.message || e) }; }
    calls++;
    trail.push({ name, args, res, by });
    if (name !== "finish") tell({ step: label[name](args || {}), tool: name, detail: detailOf(name, res), reason: args?.reason, by, error: !!res.error });
    return res;
  }

  // the agent loop: Muse Glimmer decides the next tool, code runs it and returns the facts
  tell({ step: "Autopilot started", tool: "goal", detail: `goal: ${g.perWeek} ${g.sport} games a week · ${g.approval === "ask" ? "asks before booking" : "books within your limits"} · learned from ${hist.length} games${body?.log?.length ? `, ${body.log.length} body log entries` : ""}${body?.workouts?.length ? `, ${body.workouts.length} health-app workouts` : ""}` });
  const outdoorSport = ["basketball", "soccer", "football", "volleyball"].includes(g.sport);
  const sys = `You are the player's Serve agent, on Autopilot. Goal: get the player ${perWeek} ${g.sport} games this week, at the times they usually play, with the partners they play best with. Today is ${DAYS[now.getDay()]} ${ymd(now)}.
Work only through the tools, one step at a time:
1. get_week and check_body first (both in one turn).
2. For each game still needed: take an open habitual time (most played first), find_partners for it, then negotiate with the best candidates (singles: 1 member id; doubles: 3 member ids).${limit ? ` The player has a limit from their body log (${limit}): doubles first, and follow check_body's limits.` : ""}${outdoorSport ? ` ${g.sport} is often played outdoors: call find_places for that time and pass the best place id (verdict good) to negotiate, unless a club court is clearly better.` : " If negotiate fails because no court is free, try find_places for that time."}
3. If a negotiation fails, try the next candidate or the next habitual time. When the habitual times run out, use get_week's otherFreeTimes. Never repeat a failed negotiation, and never put two games on one day.
4. When games are agreed, request_approval once. If nothing could be agreed, nudge the player instead.
5. Then finish with one sentence for the player.
Use only member ids and times that tools returned. Give a one-sentence "reason" for every choice. Never write he or she; use first names.`;
  const msgs = [{ role: "system", content: sys }, { role: "user", content: "Run my week." }];
  let stalls = 0;
  for (let i = 0; i < 12 && finished == null; i++) {
    work(i === 0 ? "Muse Glimmer is planning the week" : "Muse Glimmer is deciding the next step");
    let out;
    try { out = await chatTools(msgs, TOOLS, { maxTokens: 400, temperature: 0.2 }); } catch (e) { out = { calls: [], text: "", error: e.message }; }
    if (!out.calls.length) { if (++stalls >= 2) break; msgs.push({ role: "user", content: "Call the next tool." }); continue; }
    stalls = 0;
    msgs.push(out.message);
    for (const c of out.calls.slice(0, 3)) {
      const res = await call(c.name, c.args, "model");
      msgs.push({ role: "tool", content: JSON.stringify(res), tool_name: c.name, ...(c.id ? { tool_call_id: c.id } : {}) });
      if (c.name === "request_approval" && !res.error && !finished) { /* the model will finish next */ }
    }
  }
  // the model stalled or ran out of steps: rules finish the same plan, and say so
  if (finished == null) {
    ruleTook = true;
    tell({ step: "Rules finished the plan", tool: "fallback", detail: "Muse Glimmer stopped calling tools; the same steps were completed by code" });
    const wk = tools.get_week();
    if (!trail.some((t) => t.name === "check_body")) await call("check_body", {}, "rules");
    for (const h of [...wk.habitualTimes.filter((x) => !x.alreadyTaken), ...(wk.otherFreeTimes || []).map((x) => ({ ...x, played: "when you are free" }))]) {
      if (agreed.length + booked.length >= perWeek) break;
      const format = limit || outdoorSport ? "doubles" : "singles", fp = await call("find_partners", { day: h.day, start: h.start, format, reason: `you played ${h.day} ${h.start} ${h.played}` }, "rules");
      const pl = outdoorSport && geo && fp.candidates ? await call("find_places", { day: h.day, start: h.start, reason: `${g.sport} is played outdoors` }, "rules") : null;
      for (const c of (fp.candidates || []).slice(0, format === "doubles" ? 1 : 2)) {
        const ids = format === "doubles" ? fp.candidates.slice(0, 3).map((x) => x.id) : [c.id];
        const ng = await call("negotiate", { members: ids, day: h.day, start: h.start, format, place: pl?.places?.find((p) => p.verdict === "good")?.id || pl?.places?.[0]?.id, reason: "best fit" }, "rules");
        if (ng.agreed) break;
      }
    }
    if (!approval) agreed.length ? await call("request_approval", { reason: "games agreed" }, "rules") : await call("nudge", { text: "I couldn't line up a game at your usual times this week. Want me to try other days?", reason: "nothing agreed" }, "rules");
    finished = agreed.length ? `Lined up ${agreed.length} game${agreed.length > 1 ? "s" : ""} for you; they wait for your yes.` : "No game fit your usual times this week; I sent you a nudge.";
  }
  if (agreed.length && !approval) await call("request_approval", { reason: "games agreed" }, "rules");
  // the model's last sentence is checked like everything else: every day and time in it must be an agreed game's,
  // every number must come from the agreed games or the goal; otherwise code says it
  const facts = agreed.map((o) => `${o.day} ${LONG_DAY[o.day]} ${o.date} ${o.start} ${o.end} ${o.minutes} ${o.venue.name} ${o.partners.map((p) => p.name).join(" ")}`).join(" ") + ` ${perWeek} ${g.perWeek} ${minutes}`;
  const said = String(finished || ""), times = [...said.matchAll(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(?:\d{4}-\d\d-\d\d\s+)?(\d{1,2}:\d\d)/g)];
  // nothing is booked before the player's yes, so a summary may not say it is
  if (!said || !okNums(said, allowedIn(facts)) || times.some((m) => !agreed.some((o) => o.day === m[1] && o.start === m[2].padStart(5, "0"))) || PRONOUN.test(said) || /\bbook(ed|ing)\b/i.test(said))
    finished = agreed.length ? `Lined up ${agreed.length} game${agreed.length > 1 ? "s" : ""}: ${agreed.map(describe).join("; ")}. ${agreed.length > 1 ? "They wait" : "It waits"} for your yes.` : "No game fit your usual times this week; I sent you a nudge.";
  const s1 = stats, secs = +((Date.now() - t0) / 1000).toFixed(1);
  const report = { id, seconds: secs, toolCalls: calls, modelCalls: s1.calls - s0.calls, modelSeconds: +(s1.seconds - s0.seconds).toFixed(1), parallelPeak: s1.peak, rules: ruleTook,
    replans: trail.filter((t) => t.name === "negotiate" && !t.res.agreed).length + trail.filter((t) => t.res?.error).length, refused: trail.filter((t) => t.res?.error).length };
  db.runs = [{ id, at: t0, goal: g, agreed: agreed.map((o) => o.id), report }, ...db.runs].slice(0, 50); save();
  if (approval && notify) await notify(id, agreed, finished).catch(() => {});
  tell({ step: "Done", tool: "report", detail: `${secs} s · ${calls} tool calls · ${report.modelCalls} Muse Glimmer calls, up to ${report.parallelPeak} at once${ruleTook ? " · rules finished the plan" : ""}` });
  return { id, summary: finished, agreed, decisions, habits: habit.slice(0, 3), chemistry: chem, approval, report, body: { actions: org.actions, plan: bp, load: org.load }, trail: trail.map(({ name, args, by }) => ({ name, args, by })) };
}

// the player's answer, from the app or from Messenger: book all, book the first, or not this week
export function pending(id) { return db.pending[id] || null; }
export function answer(id, choice) {
  const p = db.pending[id];
  if (!p || p.status !== "pending") return null;
  p.status = choice; p.answeredAt = Date.now(); save();
  return { ...p, options: choice === "all" ? p.options : choice === "first" ? p.options.slice(0, 1) : [] };
}
export const describe = (o) => `${o.sport && o.sport !== "badminton" ? o.sport[0].toUpperCase() + o.sport.slice(1) + " " + (o.format === "doubles" ? "2 on 2" : "1 on 1") : o.format === "doubles" ? "Doubles" : "Singles"} ${LONG_DAY[o.day]} ${o.start} at ${o.venue.name}${o.venue.public ? " (public court, free)" : ""} with ${o.partners.map((p) => first(p.name)).join(", ")}`;
