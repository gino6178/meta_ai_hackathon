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
const { planText, todayText } = await import("./pocket.js");
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

async function remind(force = false) {
  const now = new Date(), day = now.toISOString().slice(0, 10), out = [];
  for (const p of store.players()) {
    if (!p.plan || (!force && (now.getHours() !== (p.prefs.reminderHour ?? 7) || p.prefs.lastReminder === day))) continue;
    try { await msn.pocket.send(p.id, todayText(p, now), msn.REMINDER); store.markReminded(p.id, day); out.push(p.id); } catch (e) { out.push(`${p.id}: ${e.message}`); }
  }
  return out;
}
// the 24-hour coach: a message an hour before each session (with what to eat from the pantry), and an evening
// check-in on training days that have nothing logged yet. force=true (tests, the web button) ignores the clock.
async function lifeTick({ kind = "all", force = false } = {}) {
  const now = new Date(), day = life.ymd(now), out = [];
  for (const p of store.players()) {
    try {
      if (kind === "all" || kind === "presession") {
        const soon = p.events.filter((e) => ["training", "match"].includes(e.kind) && e.start && !e.reminded && (force ? life.at(e) > now : life.at(e) - now > 0 && life.at(e) - now <= 75 * 60000));
        for (const e of soon.slice(0, 1)) {
          store.update(p.id, (q) => { const x = q.events.find((y) => y.id === e.id); if (x) x.reminded = true; });
          await msn.pocket.send(p.id, `Coming up: ${life.evText(e)}.${p.plan ? `\n${planText(p.plan, DAYS[life.at(e).getDay()]).split("\n").slice(1).join("\n")}` : ""}`, msn.REMINDER);
          await msn.pocket.answerFor(p.id, `My ${e.kind} (${e.title}) starts at ${e.start}. What should I eat before it from the food I have, and when?`, "nutrition", msn.REMINDER);
          out.push(`${p.id}: presession ${e.id}`);
        }
      }
      if (kind === "all" || kind === "checkin") {
        const trainedToday = life.today(p, now).some((e) => ["training", "match"].includes(e.kind)) || p.plan?.days?.find((d) => d.d === DAYS[now.getDay()])?.blocks?.length;
        const logged = p.logs.some((l) => l.date === day);
        if (force || (now.getHours() === (p.prefs.checkinHour ?? 21) && p.prefs.lastCheckin !== day && trainedToday && !logged)) {
          await msn.pocket.send(p.id, "How did today's session go? Tell me what you did, roughly how long, and any pain or soreness. I'll log it and your coaches will adjust tomorrow.", msn.REMINDER);
          store.markReminded(p.id, day, "lastCheckin"); out.push(`${p.id}: checkin`);
        }
      }
    } catch (e) { out.push(`${p.id}: ${e.message}`); }
  }
  return out;
}
// nightly: the research agent reads new papers, then the coaches reflect and evolve their playbooks
const busy = { research: false, evolve: false }, done = {};
async function nightly() {
  const now = new Date(), day = now.toISOString().slice(0, 10);
  if (now.getHours() === +(process.env.RESEARCH_HOUR ?? 3) && done.research !== day && !busy.research) {
    done.research = day; busy.research = true; await researcher.run().catch(() => {}); busy.research = false;
  }
  if (now.getHours() === +(process.env.EVOLVE_HOUR ?? 4) && done.evolve !== day && !busy.evolve) {
    done.evolve = day; busy.evolve = true; await evolve.run().catch(() => {}); busy.evolve = false;
  }
}
setInterval(() => { remind().catch(() => {}); lifeTick().catch(() => {}); nightly().catch(() => {}); }, 60000);

http.createServer(async (req, res) => {
  const o = req.headers.origin, u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return json(res, 204, {}, o);
  // Facebook Messenger: GET once to verify the webhook, then a signed POST for every message
  if (u.pathname === "/webhook/messenger") {
    if (req.method === "GET") { const c = msn.verify(u); res.writeHead(c ? 200 : 403, { "content-type": "text/plain" }); return res.end(c ?? "forbidden"); }
    const raw = await rawOf(req);
    if (!msn.signed(raw, req.headers["x-hub-signature-256"])) { res.writeHead(403); return res.end(); }
    res.writeHead(200); res.end("EVENT_RECEIVED"); // answer at once; Messenger retries slow webhooks
    let body = {}; try { body = JSON.parse(raw); } catch { return; }
    return msn.receive(body).catch((e) => { msn.state.error = String(e.message || e); });
  }
  try {
    if (u.pathname === "/api/status") {
      const s = factSheet("A");
      const pbs = evolve.playbooks();
      return json(res, 200, { llm: await health(), kb: kb.stats(), busy, feedback: evolve.feedbackStats(),
        playbooks: Object.fromEntries(Object.entries(pbs).map(([c, p]) => [c, { version: p.version, rules: p.rules.length, pending: p.proposals.filter((x) => x.status === "pending").length }])), messenger: { enabled: msn.state.enabled, page: msn.state.page, error: msn.state.error, lastEvent: msn.state.lastEvent }, reel: reel.ready(),
        players: store.players().length, athlete: s.name, facts: s.facts.length }, o);
    }
    if (u.pathname === "/api/players") return json(res, 200, store.players().map(({ id, name, memories, history, plan, prefs, pantry, events, logs }) => ({ id, name, memories, history: history.slice(-20), plan, prefs, pantry, events, logs })), o);
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
    // best match: your agent ranks the members for a game (body: { you, ratings, played, format })
    if (u.pathname === "/api/match/best" && req.method === "POST") { const b = await bodyOf(req); return stream(res, o, (send) => match.best({ ...b, onStep: send })); }
    // agent to agent: your agent and the member's agent agree a time and a court (body: { with, format, you })
    if (u.pathname === "/api/match/talk" && req.method === "POST") { const b = await bodyOf(req); return stream(res, o, (send) => match.talk({ ...b, onStep: send })); }
    // your own video -> a highlight reel (the raw video is the body): you found, read and cut out, your smash found
    if (u.pathname === "/api/reel" && req.method === "POST") {
      if (!reel.ready()) return json(res, 503, { error: "Making reels from your own video is not set up on this server (REEL_PYTHON, REEL_SCRIPT)." }, o);
      return stream(res, o, (send) => reel.make(req, send));
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
    if (u.pathname === "/api/notify" && req.method === "POST") {
      const b = await bodyOf(req), targets = b.to ? [store.get(String(b.to))].filter(Boolean) : store.players(), sent = [];
      for (const p of targets) {
        if (b.plan) store.setPlan(p.id, b.plan);
        await msn.pocket.send(p.id, b.text || `Your coaches met at the round table and agreed this week.\n\n${planText(b.plan)}\n\nReply here any time; we adapt the plan to how you feel.`);
        sent.push(p.id);
      }
      return json(res, 200, { sent }, o);
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
