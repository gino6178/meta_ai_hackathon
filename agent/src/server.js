// Agent gateway: an HTTP API for the web app (status, coach chat, send plan, players), the coaches on Facebook
// Messenger (webhook /webhook/messenger), and the 24-hour coach's reminders. Configure in .env (see .env.example).
import fs from "node:fs";
import http from "node:http";

for (const f of [".env"]) if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { reply, learn, COACHES } = await import("./coach.js");
const { health } = await import("./llm.js");
const msn = await import("./messenger.js");
const { todayText } = await import("./pocket.js");
const store = await import("./store.js");
const { factSheet } = await import("./facts.js");
const kb = await import("./kb.js");
const researcher = await import("./researcher.js");
const evolve = await import("./evolve.js");
const life = await import("./life.js");
const club = await import("./club.js");
const quests = await import("./quests.js");
const play = await import("./play.js");
const social = await import("./social.js");
const reel = await import("./reel.js");
const match = await import("./match.js");
const autopilot = await import("./autopilot.js");
const { court } = await import("./a2a.js");
const bodylog = await import("./body.js");
const healthImport = await import("./health.js");
const places = await import("./places.js");
const pocketMod = await import("./pocket.js");

const PORT = +(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOW_ORIGINS || "http://127.0.0.1:5190,http://localhost:5190").split(",");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const json = (res, code, body, origin) => {
  res.writeHead(code, { "content-type": "application/json", ...(ORIGINS.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type" } : {}) });
  res.end(JSON.stringify(body));
};
// a long agent job as NDJSON: one line per step while it works, then {type: "done", result}
const stream = async (res, origin, run) => {
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache", ...(ORIGINS.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type" } : {}) });
  const send = (x) => res.write(JSON.stringify(x) + "\n");
  try { send({ type: "done", result: await run(send) }); } catch (e) { send({ type: "error", error: String(e.message || e) }); }
  res.end();
};
const rawOf = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
const bodyOf = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });

// the morning message: today's calendar, for players with something on today
async function remind(force = false) {
  const now = new Date(), day = now.toISOString().slice(0, 10), out = [];
  for (const p of store.players()) {
    if (!life.today(p, now).length || (!force && (now.getHours() !== (p.prefs.reminderHour ?? 7) || p.prefs.lastReminder === day))) continue;
    try { await msn.pocket.send(p.id, todayText(p, now), msn.REMINDER); store.markReminded(p.id, day); out.push(p.id); } catch (e) { out.push(`${p.id}: ${e.message}`); }
  }
  return out;
}
// your agent: a message an hour before each session or game, and an evening
// check-in on training days that have nothing logged yet. force=true (tests, the web button) ignores the clock.
async function lifeTick({ kind = "all", force = false } = {}) {
  const now = new Date(), day = life.ymd(now), out = [];
  for (const p of store.players()) {
    try {
      if (kind === "all" || kind === "presession") {
        const soon = p.events.filter((e) => ["training", "match"].includes(e.kind) && e.start && !e.reminded && (force ? life.at(e) > now : life.at(e) - now > 0 && life.at(e) - now <= 75 * 60000));
        for (const e of soon.slice(0, 1)) {
          store.update(p.id, (q) => { const x = q.events.find((y) => y.id === e.id); if (x) x.reminded = true; });
          await msn.pocket.send(p.id, `Coming up: ${life.evText(e)}.`, msn.REMINDER);
          out.push(`${p.id}: presession ${e.id}`);
        }
      }
      if (kind === "all" || kind === "checkin") {
        const trainedToday = life.today(p, now).some((e) => ["training", "match"].includes(e.kind));
        const logged = p.logs.some((l) => l.date === day);
        if (force || (now.getHours() === (p.prefs.checkinHour ?? 21) && p.prefs.lastCheckin !== day && trainedToday && !logged)) {
          await msn.pocket.send(p.id, "How did today's session go? Tell me what you did, roughly how long, and anything sore. I'll log it and plan your next games around it.", msn.REMINDER);
          store.markReminded(p.id, day, "lastCheckin"); out.push(`${p.id}: checkin`);
        }
      }
    } catch (e) { out.push(`${p.id}: ${e.message}`); }
  }
  return out;
}
// nightly, only with NIGHTLY=1: the research agent reads new papers and the answer rules are reviewed
const busy = { research: false, evolve: false }, done = {};
async function nightly() {
  if (process.env.NIGHTLY !== "1") return;
  const now = new Date(), day = now.toISOString().slice(0, 10);
  if (now.getHours() === +(process.env.RESEARCH_HOUR ?? 3) && done.research !== day && !busy.research) {
    done.research = day; busy.research = true; await researcher.run().catch(() => {}); busy.research = false;
  }
  if (now.getHours() === +(process.env.EVOLVE_HOUR ?? 4) && done.evolve !== day && !busy.evolve) {
    done.evolve = day; busy.evolve = true; await evolve.run().catch(() => {}); busy.evolve = false;
  }
}
// the Autopilot in Messenger: the plan comes back as one message with buttons; a yes books the games
async function autopilotFor(psid) {
  const me = store.get(psid), upcoming = (me?.events || []).filter((e) => e.kind === "match" && e.with?.length).map((e) => ({ date: e.date, start: e.start, with: e.with }));
  const r = await autopilot.run({ messenger: psid, history: me?.games || [], upcoming, body: me?.body, notify: async (id, games, summary) => {
    const one = games.length === 1;
    await msn.direct(psid, `${summary}\n\n${games.map((o) => `• ${autopilot.describe(o)}`).join("\n")}\n\nEveryone's agent already said yes. Book ${one ? "it" : "them"}?`, {
      buttons: one ? [{ title: "Book it", payload: `ap:${id}:all` }, { title: "Not this week", payload: `ap:${id}:none` }]
        : [{ title: "Book both", payload: `ap:${id}:all` }, { title: "Only the first", payload: `ap:${id}:first` }, { title: "Not this week", payload: `ap:${id}:none` }] });
  } });
  if (!r.agreed.length) await msn.direct(psid, r.summary || "No game fit your usual times this week. Want me to try other days?");
  return r;
}
async function bookApproved(id, choice, psid = null) {
  const p = autopilot.answer(id, choice);
  if (!p) return { error: "That plan was already answered." };
  const out = [];
  for (const o of p.options) out.push(await play.book({ option: o, invites: {}, you: {} }));
  // booked games go in the player's calendar, so the hour-before reminder and the evening check-in follow them
  if (psid && store.get(psid)) life.addEvents(psid, p.options.map((o) => ({ date: o.date, start: o.start, end: o.end, title: autopilot.describe(o), kind: "match", with: o.partners.map((x) => x.id), booked: o.minutes, sport: o.sport,
    ...(o.venue.public && o.venue.lat != null ? { place: { lat: o.venue.lat, lon: o.venue.lon, name: o.venue.name, outdoor: o.venue.outdoor !== false } } : {}) })));
  return { bookings: out, options: p.options };
}
msn.hooks.autopilot = autopilotFor;
msn.hooks.payload = async (psid, payload) => {
  if (payload.startsWith("wx:")) return weatherAnswer(psid, payload);
  const m = /^ap:([\w-]+):(all|first|none)$/.exec(payload);
  if (!m) return;
  const r = await bookApproved(m[1], m[2], psid);
  if (r.error) return msn.direct(psid, r.error);
  if (!r.options.length) return msn.direct(psid, "OK, nothing booked this week. I'll look again on Monday.");
  await msn.direct(psid, `Booked:\n${r.options.map((o) => `• ${autopilot.describe(o)}, court ${o.court}`).join("\n")}\nI'll remind you an hour before each game.`);
};
// the Autopilot on its own: on Monday morning, for players who switched it on, if the week is short of the goal
const ran = {};
async function autopilotTick(now = new Date()) {
  if (now.getDay() !== 1 || now.getHours() !== +(process.env.AUTOPILOT_HOUR ?? 8)) return;
  for (const p of store.players()) {
    if (!p.prefs.autopilot || ran[p.id] === life.ymd(now)) continue;
    ran[p.id] = life.ymd(now);
    await autopilotFor(p.id).catch(() => {});
  }
}
// the weather watch: three hours before a game on an outdoor court, the agent checks the forecast for that hour. When
// rain is likely it finds a club venue with a free court at the same time and asks the player, with buttons, whether to
// move the game there (the other players' agents are told when it moves).
const WET = +(process.env.RAIN_MOVE_AT || 60);
async function weatherTick(now = new Date(), force = false) {
  let n = 0;
  for (const p of store.players()) {
    for (const e of (p.events || []).filter((x) => x.place?.outdoor && x.start && !x.weather)) {
      const mins = (new Date(`${e.date}T${e.start}`) - now) / 6e4;
      if (!force && (mins < 150 || mins > 210)) continue;
      const w = await places.forecast(e.place.lat, e.place.lon, e.date, e.start);
      store.update(p.id, (q) => { const x = q.events.find((y) => y.id === e.id); if (x) x.weather = { ...(w || {}), at: Date.now() }; });
      if (!w || w.rain < WET) continue;
      const venues = play.helpers.readVenues(), club0 = club.readClub(), d = new Date(`${e.date}T12:00`);
      const people = [{ id: "you", name: "You", area: club0.you.area }, ...(e.with || []).map((id) => club0.members.find((m) => m.id === id)).filter(Boolean)];
      const c = court({ date: e.date, day: DAYS[d.getDay()] }, play.helpers.toMin(e.start), e.booked || 90, people, venues, e.sport || "basketball");
      const alt = c ? `${c.v.name} has court ${c.court} free at ${e.start} (NT$${Math.round((c.v.price * (e.booked || 90)) / 60 / people.length)} each, ${c.travel.find((t) => t.id === "you")?.min ?? "?"} min for you).` : "No indoor court is free at that time.";
      store.update(p.id, (q) => { const x = q.events.find((y) => y.id === e.id); if (x) x.move = c ? { venue: c.v.id, name: c.v.name, court: c.court } : null; });
      await msn.direct(p.id, `Rain is ${w.rain}% likely at ${e.start} at ${e.place.name}. ${alt}${c ? " Move the game there?" : ""}`, { tag: msn.REMINDER.tag, ...(c ? { buttons: [{ title: "Move it", payload: `wx:${e.id}:move` }, { title: "Keep it", payload: `wx:${e.id}:keep` }] } : {}) }).catch(() => {});
      n++;
    }
  }
  return n;
}
async function weatherAnswer(psid, payload) {
  const m = /^wx:(\w+):(move|keep)$/.exec(payload), p = store.get(psid);
  const e = p?.events.find((x) => x.id === m?.[1]);
  if (!e) return msn.direct(psid, "That game is no longer in your calendar.");
  if (m[2] === "keep" || !e.move) { store.update(psid, (q) => { const x = q.events.find((y) => y.id === e.id); if (x) x.move = null; }); return msn.direct(psid, "OK, the game stays outdoors. Bring a towel."); }
  const to = e.move;
  store.update(psid, (q) => { const x = q.events.find((y) => y.id === e.id); if (x) { x.title = x.title.replace(/ at .+? with /, ` at ${to.name} with `).replace(" (public court, free)", ""); x.place = { ...x.place, outdoor: false, name: to.name }; x.move = null; } });
  const names = (e.with || []).map((id) => club.readClub().members.find((mm) => mm.id === id)?.name.split(" ")[0]).filter(Boolean);
  return msn.direct(psid, `Moved: ${e.start} at ${to.name}, court ${to.court}.${names.length ? ` I've told ${names.join(", ")}'s agent${names.length > 1 ? "s" : ""}.` : ""}`);
}

// the body log's follow-up: two days after something sore was logged, at 10:00, "How is your right knee today?"
async function bodyTick(now = new Date(), force = false, all = false) {
  if (!force && now.getHours() !== +(process.env.BODY_HOUR ?? 10)) return 0;
  let n = 0;
  for (const p of store.players()) {
    if (!msn.state.enabled && !force) continue;
    const asked = p.prefs.bodyAsked || {}, today = life.ymd(now);
    for (const f of pocketMod.organizeFor(p, now).followUps.filter((x) => (x.due || all) && asked[x.key] !== today)) {
      store.update(p.id, (q) => { q.prefs.bodyAsked = { ...(q.prefs.bodyAsked || {}), [f.key]: today }; });
      await msn.direct(p.id, f.text, { tag: msn.REMINDER.tag, buttons: [{ title: "Fine now", payload: `bd:${f.key}:fine` }, { title: "About the same", payload: `bd:${f.key}:same` }, { title: "Worse", payload: `bd:${f.key}:worse` }] }).catch(() => {});
      n++;
    }
  }
  return n;
}
setInterval(() => { remind().catch(() => {}); lifeTick().catch(() => {}); nightly().catch(() => {}); autopilotTick().catch(() => {}); bodyTick().catch(() => {}); weatherTick().catch(() => {}); }, 60000);

// Messenger's webhook: Meta checks it once with a GET, then signs every POST with the app secret
async function webhook(req, res, u) {
  if (req.method === "GET") { const c = msn.verify(u); res.writeHead(c ? 200 : 403, { "content-type": "text/plain" }); return res.end(c ?? "forbidden"); }
  const raw = await rawOf(req);
  if (!msn.signed(raw, req.headers["x-hub-signature-256"])) { res.writeHead(403); return res.end(); }
  res.writeHead(200); res.end("EVENT_RECEIVED"); // answer at once; Messenger retries slow webhooks
  let body = {}; try { body = JSON.parse(raw); } catch { return; }
  return msn.receive(body).catch((e) => { msn.state.error = String(e.message || e); });
}
// WEBHOOK_PORT: a second port, on this machine only, that serves the webhook and nothing else, for the tunnel that
// Meta reaches it through (so the rest of the API is never on the internet)
if (process.env.WEBHOOK_PORT) http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/webhook/messenger") return webhook(req, res, u);
  res.writeHead(404); res.end();
}).listen(+process.env.WEBHOOK_PORT, "127.0.0.1", () => console.log(`Messenger webhook only, on 127.0.0.1:${process.env.WEBHOOK_PORT}`));

http.createServer(async (req, res) => {
  const o = req.headers.origin, u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return json(res, 204, {}, o);
  // Facebook Messenger: GET once to verify the webhook, then a signed POST for every message
  if (u.pathname === "/webhook/messenger") return webhook(req, res, u);
  try {
    if (u.pathname === "/api/status") {
      const s = factSheet("A");
      const pbs = evolve.playbooks();
      return json(res, 200, { llm: await health(), kb: kb.stats(), busy, feedback: evolve.feedbackStats(),
        playbooks: Object.fromEntries(Object.entries(pbs).map(([c, p]) => [c, { version: p.version, rules: p.rules.length, pending: p.proposals.filter((x) => x.status === "pending").length }])), messenger: { enabled: msn.state.enabled, page: msn.state.page, error: msn.state.error, lastEvent: msn.state.lastEvent }, reel: reel.ready(), places: places.ready(), health: true,
        players: store.players().length, athlete: s.name, facts: s.facts.length }, o);
    }
    if (u.pathname === "/api/players") return json(res, 200, store.players().map(({ id, name, memories, history, prefs, events, logs, games, body }) => ({ id, name, memories, history: history.slice(-20), prefs, events, logs, games, body })), o);
    if (u.pathname === "/api/facts") return json(res, 200, factSheet("A").facts, o);
    if (u.pathname === "/api/chat" && req.method === "POST") {
      const b = await bodyOf(req);
      const r = await reply({ text: String(b.message || ""), coach: b.coach, history: b.history || [] });
      return json(res, 200, r, o);
    }
    // club night: the head coach plans one session for every member (body: { you } with what the player chose to share)
    if (u.pathname === "/api/club/plan" && req.method === "POST") {
      const b = await bodyOf(req);
      if (!b.stream) return json(res, 200, await club.planNight({ you: b.you }), o);
      return stream(res, o, async (send) => {
        send({ type: "working", step: "The head coach is writing club night on Muse Glimmer" });
        const r = await club.planNight({ you: b.you });
        send({ type: "step", step: "Set the groups", tool: "schedule", detail: `${r.plan?.blocks?.length ?? 0} blocks; every player busy in every block` });
        send({ type: "step", step: "Wrote and checked every group", tool: "verify", detail: `${r.written ?? 0} of ${r.total ?? 0} groups written by Muse Glimmer passed the checks` });
        return r;
      });
    }
    // play: "I want to play" -> courts, partners and invites; nothing is booked until the player confirms
    if (u.pathname === "/api/play/plan" && req.method === "POST") {
      const b = await bodyOf(req);
      return b.stream ? stream(res, o, (send) => play.plan({ text: b.text, you: b.you, onStep: send })) : json(res, 200, await play.plan({ text: b.text, you: b.you }), o);
    }
    // the Autopilot: your agent plans the week against your goal (body: { you, history, goal, ratings, upcoming })
    if (u.pathname === "/api/autopilot/run" && req.method === "POST") { const b = await bodyOf(req); return stream(res, o, (send) => autopilot.run({ ...b, onStep: send })); }
    // your answer to the Autopilot's plan, from the app (body: { id, choice: all | first | none })
    if (u.pathname === "/api/autopilot/answer" && req.method === "POST") { const b = await bodyOf(req); return json(res, 200, await bookApproved(b.id, b.choice), o); }
    // best match: your agent ranks the members for a game (body: { you, ratings, played, format })
    if (u.pathname === "/api/match/best" && req.method === "POST") { const b = await bodyOf(req); return stream(res, o, (send) => match.best({ ...b, onStep: send })); }
    // agent to agent: your agent and the member's agent agree a time and a court (body: { with, format, you })
    if (u.pathname === "/api/match/talk" && req.method === "POST") { const b = await bodyOf(req); return stream(res, o, (send) => match.talk({ ...b, onStep: send })); }
    // the body log: what the player says hurts -> entries (body: { text, log, games, workouts, days }), organized with the rest
    if (u.pathname === "/api/body/read" && req.method === "POST") {
      const b = await bodyOf(req), r = await bodylog.read(String(b.text || "").slice(0, 600));
      const org = bodylog.organize({ log: [...(b.log || []), ...r.entries], games: b.games || [], workouts: b.workouts || [], days: b.days || [] });
      return json(res, 200, { ...r, org, reply: r.entries.length ? bodylog.said(r.entries, org) : "I couldn't tell which part of your body you mean. Try \"my right knee is sore after jumping\"." }, o);
    }
    // the body report: organized, with Muse Glimmer's summary (checked: every number from the facts)
    if (u.pathname === "/api/body/report" && req.method === "POST") {
      const b = await bodyOf(req), org = bodylog.organize({ log: b.log || [], games: b.games || [], workouts: b.workouts || [], days: b.days || [] });
      return json(res, 200, { org, summary: b.summary === false ? null : await bodylog.summary(org) }, o);
    }
    // a health app's export (the raw file is the body; ?name= its file name, ?tz= minutes east of UTC)
    if (u.pathname === "/api/health/import" && req.method === "POST")
      return stream(res, o, (send) => healthImport.upload(req, send, { name: u.searchParams.get("name") || "export", tz: +(u.searchParams.get("tz") ?? 480), days: +(u.searchParams.get("days") || 120) }));
    // courts and parks near a point, judged playable or not (body: { lat, lon, sport, date, start, radius })
    if (u.pathname === "/api/places" && req.method === "POST") { const b = await bodyOf(req); return stream(res, o, (send) => places.search({ ...b, onStep: send })); }
    if (u.pathname === "/api/places/where") return json(res, 200, await places.where(u.searchParams.get("q") || "").catch((e) => ({ error: e.message })), o);
    // the map under a GPS route: roads, rivers and parks in an area (?s=&w=&n=&e=), drawn by the app
    if (u.pathname === "/api/map/base") { const q = Object.fromEntries(["s", "w", "n", "e"].map((k) => [k, +u.searchParams.get(k)])); return json(res, 200, await places.basemap(q).catch((e) => ({ error: e.message })), o); }
    // a test hook: send the body log's follow-ups now
    // a test hook: check the weather for every outdoor game now
    if (u.pathname === "/api/weather/check" && req.method === "POST") return json(res, 200, { sent: await weatherTick(new Date(), true) }, o);
    if (u.pathname === "/api/body/followups" && req.method === "POST") return json(res, 200, { sent: await bodyTick(new Date(), true, u.searchParams.get("all") === "1") }, o);
    // your own video -> a highlight reel (the raw video is the body): you found, read and cut out, your smash found
    if (u.pathname === "/api/reel" && req.method === "POST") {
      if (!reel.ready()) return json(res, 503, { error: "Making reels from your own video is not set up on this server (REEL_PYTHON, REEL_SCRIPT)." }, o);
      return stream(res, o, (send) => reel.make(req, send, u.searchParams.get("sport") || "badminton"));
    }
    // the caption for a highlight reel on Instagram or Facebook (body: { player, event, picks })
    if (u.pathname === "/api/highlight/caption" && req.method === "POST") { const b = await bodyOf(req); return json(res, 200, await social.caption(b), o); }
    if (u.pathname === "/api/play/book" && req.method === "POST") { const b = await bodyOf(req); return json(res, 200, await play.book(b), o); }
    if (u.pathname === "/api/play/booking") return json(res, 200, play.status(u.searchParams.get("id")), o);
    if (u.pathname === "/api/play/cancel" && req.method === "POST") { const b = await bodyOf(req); return json(res, 200, play.cancel(b.id), o); }
    // this week's quests from the four coaches, with the next opponent as the boss (body: { memory: [texts] })
    if (u.pathname === "/api/quests" && req.method === "POST") {
      const b = await bodyOf(req), memory = (b.memory || []).map(String).slice(0, 12);
      return b.stream ? stream(res, o, (send) => quests.quests({ memory, onStep: send })) : json(res, 200, await quests.quests({ memory }), o);
    }
    const flat = ({ paper, ...f }) => ({ ...f, cite: kb.cite(paper), title: paper.title, url: paper.url, year: paper.year, venue: paper.venue, source: paper.source });
    if (u.pathname === "/api/kb") return json(res, 200, { stats: kb.stats(), findings: kb.listFindings().map(flat), runs: kb.runs() }, o);
    if (u.pathname === "/api/kb/search") return json(res, 200, (await kb.search(u.searchParams.get("q") || "", { k: 6, min: 0.2 })).map(flat), o);
    if (u.pathname === "/api/research/run" && req.method === "POST") {
      if (busy.research) return json(res, 409, { error: "a research run is already going" }, o);
      const b = await bodyOf(req); busy.research = true;
      try { return json(res, 200, await researcher.run({ topics: b.topics || [], maxPapers: b.maxPapers || 6 }), o); } finally { busy.research = false; }
    }
    if (u.pathname === "/api/playbooks") return json(res, 200, { playbooks: evolve.playbooks(), feedback: evolve.feedbackStats() }, o);
    if (u.pathname === "/api/evolve/run" && req.method === "POST") {
      if (busy.evolve) return json(res, 409, { error: "an evolution run is already going" }, o);
      const b = await bodyOf(req); busy.evolve = true;
      try { return json(res, 200, await evolve.run(b.coaches ? { coaches: b.coaches } : {}), o); } finally { busy.evolve = false; }
    }
    if (u.pathname === "/api/evolve/decide" && req.method === "POST") { const b = await bodyOf(req); return json(res, 200, evolve.decide(b.coach, b.id, !!b.approve), o); }
    if (u.pathname === "/api/evolve/rollback" && req.method === "POST") { const b = await bodyOf(req); return json(res, 200, evolve.rollback(b.coach), o); }
    if (u.pathname === "/api/feedback" && req.method === "POST") { const b = await bodyOf(req); evolve.feedback({ ...b, source: "web" }); return json(res, 200, { ok: true }, o); }
    if (u.pathname === "/api/remind" && req.method === "POST") {
      const b = await bodyOf(req);
      return json(res, 200, { sent: b.kind && b.kind !== "morning" ? await lifeTick({ kind: b.kind, force: true }) : await remind(true) }, o);
    }
    return json(res, 404, { error: "not found" }, o);
  } catch (e) { return json(res, 500, { error: String(e.message || e) }, o); }
}).listen(PORT, () => console.log(`agent gateway on http://127.0.0.1:${PORT} · LLM ${process.env.LLM_URL || "http://127.0.0.1:8000/v1"} · Messenger ${msn.state.enabled ? "on" : "off (no page token)"}`));
export { COACHES, learn };
