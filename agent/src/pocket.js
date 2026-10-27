// The 24-hour coach in the player's pocket: the conversation with the coaching staff, whichever messaging app carries
// it (messenger.js is the transport). The local model files what the player says (food at home, sessions and exams,
// what they trained) and the right coach answers through the grounded, verified agent; the plan, reminders before
// each session and the evening check-in are pushed. A transport gives send(id, text, { feedback, tag }) and,
// optionally, typing(id).
import * as store from "./store.js";
import { readClub } from "./club.js";
import { reply, learn, COACHES } from "./coach.js";
import { factSheet } from "./facts.js";
import * as evolve from "./evolve.js";
import * as life from "./life.js";
import * as bodylog from "./body.js";
import * as health from "./health.js";
import * as places from "./places.js";
import { helpers } from "./play.js";

export const HELP = `I'm your Serve agent, here 24 hours a day. I line up games at the times you usually play, with the people you play best with, and agree them with their agents; you just say yes. Send /autopilot to have me plan this week now.
Just write to me: your schedule ("club training Wed 19:00-21:00"), how a game went ("played two hours with Leo"), or what hurts ("my right knee is sore after jumping"). I keep the record and plan your games around it. Share your health app's export (Apple Health, Google Fit) or a GPX, TCX or CSV file here and I'll file your workouts.
/autopilot plan my week · /courts basketball near Da'an Park: free courts nearby, judged from their reviews · /body your body log · /report your body report · /week calendar · /log a session · /coach lin|kai|ren|ada|head your coaches · /forget delete everything I stored about you`;

export function planText(plan, today = null) {
  if (!plan) return "No plan yet. Your coaches will send one after the next round table.";
  const days = today ? plan.days.filter((d) => d.d === today) : plan.days;
  const lines = days.map((d) => `${d.d}: ${d.blocks.length ? d.blocks.map(([who, min, t]) => `${t} (${min} min, ${COACHES[who]?.name ?? who})`).join("; ") : "rest"}`);
  return `${today ? "Today's training" : `Training plan · ${plan.event ?? ""}`}\n${plan.goals?.length && !today ? "Goals:\n" + plan.goals.map((g) => `• ${g}`).join("\n") + "\n\n" : ""}${lines.join("\n")}`;
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function todayText(p, now = new Date()) {
  const ev = life.today(p, now);
  return `${planText(p.plan, DAYS[now.getDay()])}${ev.length ? `\n\nIn your calendar today:\n${ev.map((e) => `• ${life.evText(e)}`).join("\n")}` : ""}`;
}

// the body log, the player's games and their health-app workouts, organized (body.js)
export const organizeFor = (p, now = new Date()) => bodylog.organize({ log: p.body?.log || [], workouts: p.body?.workouts || [], days: p.body?.days || [], games: p.games || [], now });
export function bodyText(p) {
  const org = organizeFor(p);
  if (!org.parts.length) return "Your body log is empty. Tell me when something hurts (\"my right knee is sore after jumping\") and I'll keep the record and plan your games around it.";
  const TREND = { new: "new", better: "getting better", worse: "getting worse", same: "about the same" };
  return `Your body log:\n${org.parts.slice(0, 8).map((x) => `• ${x.name[0].toUpperCase() + x.name.slice(1)}: ${x.latest.kind === "fine" ? "fine" : `${x.latest.kind} ${x.latest.level}/5`} (${x.entries.length} entr${x.entries.length > 1 ? "ies" : "y"}, ${TREND[x.trend]})`).join("\n")}${org.actions.length ? `\n\nWhat I'm doing about it:\n${org.actions.map((a) => `• ${a.text}`).join("\n")}` : ""}\n\nThis records what you tell me; it is not a diagnosis.`;
}
export async function reportText(p) {
  const org = organizeFor(p), s = await bodylog.summary(org);
  const w4 = org.weeks.slice(-4), mins = w4.reduce((a, w) => a + w.minutes, 0), n = w4.reduce((a, w) => a + w.sessions, 0);
  const sports = Object.entries(w4.reduce((a, w) => { for (const [k, v] of Object.entries(w.sports)) a[k] = (a[k] || 0) + v; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const d = org.days.slice(-28), avg = (k) => { const v = d.map((x) => x[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
  return `Body report, last 4 weeks\n${s.text}\n\n${n} sessions, ${mins} minutes${sports.length ? `: ${sports.map(([k, v]) => `${k} ${v} min`).join(", ")}` : ""}.${org.load.acwr != null ? `\nLoad this week: ${org.load.acwr} times your usual week.` : ""}${avg("restingHr") ? `\nResting heart rate: ${avg("restingHr")} bpm on average.` : ""}${avg("sleepH") ? `\nSleep: ${avg("sleepH")} h a night.` : ""}${avg("steps") ? `\nSteps: ${Math.round(avg("steps"))} a day.` : ""}\n\n${bodyText(p)}`;
}

export function createPocket({ name: app, send, typing = async () => {}, onAutopilot = null }) {
  const welcome = (name) => {
    const s = factSheet("A");
    return `Hi ${name}, you're linked to ${s.name}'s coaching staff for ${s.event}.\n\nOnly these text messages pass through ${app}; match video and analysis stay on the coaching station.\n\n${HELP}`;
  };

  async function handle(id, name, raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    if (text.startsWith("/start")) { store.link(id, name); return send(id, welcome(name)); }
    // the first message links the chat: no command needed
    if (!store.get(id)) { store.link(id, name); await send(id, welcome(name)); if (/^(hi|hello|hey|get started|你好)\b/i.test(text)) return; }
    const p = store.get(id);
    if (text.startsWith("/forget")) { store.forget(id); return send(id, "Done: your memories, messages, plan, kitchen list, calendar and training log are deleted from the station. Send /start to begin again."); }
    if (text.startsWith("/plan")) return send(id, planText(p.plan));
    // the Autopilot, asked for in so many words: it plans the week and comes back with games to approve
    if (text.startsWith("/autopilot") || /\b(line up|find me|get me|book me)\b.{0,20}\b(games?|matches)\b|\bplan my week\b/i.test(text)) {
      if (/\b(off|stop)\b/i.test(text)) { store.setPref(id, "autopilot", false); return send(id, "Autopilot is off. I won't line up games until you send /autopilot again."); }
      store.setPref(id, "autopilot", true);
      await send(id, "On it. I'm checking your week, finding the people you play best with at your usual times, and agreeing the games with their agents. I'll come back with them to approve.");
      onAutopilot?.(id).catch((e) => send(id, `I couldn't finish the plan (${e.message}).`));
      return;
    }
    if (text.startsWith("/help")) return send(id, HELP);
    if (text.startsWith("/body")) return send(id, bodyText(store.get(id)));
    if (text.startsWith("/report")) return send(id, await reportText(store.get(id)));
    if (text.startsWith("/courts")) return courts(id, text.replace(/^\/courts\S*\s*/, ""));
    // what hurts (and nothing about a finished session): filed in the body log, and the games planned around it
    if (bodylog.about(text) && !/\b(played|trained|ran|did|session|game|match|minutes?|min|hours?)\b/i.test(text) && !text.startsWith("/")) return bodyLog(id, text);
    if (text.startsWith("/week") || text.startsWith("/schedule")) return send(id, life.weekText(p, p.plan));
    if (text.startsWith("/today")) return send(id, todayText(p));
    if (text.startsWith("/pantry")) {
      const arg = text.replace(/^\/pantry\S*\s*/, "").trim();
      if (/^clear$/i.test(arg)) life.clearPantry(id);
      else if (arg) {
        const parts = arg.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean);
        life.removePantry(id, parts.filter((x) => x.startsWith("-")).map((x) => x.slice(1)));
        life.addPantry(id, parts.filter((x) => !x.startsWith("-")));
      }
      return send(id, life.pantryText(store.get(id)));
    }
    if (text.startsWith("/coach")) {
      const want = { lin: "tactics", kai: "technique", ren: "fitness", ada: "analyst", mei: "nutrition", head: "head" }[text.split(/\s+/)[1]?.toLowerCase()];
      if (!want) return send(id, "Use /coach lin, kai, ren, ada, mei or head.");
      store.setPref(id, "coach", want); return send(id, `${COACHES[want].name} will take your questions from now on.`);
    }
    await typing(id).catch(() => {});
    if (text.startsWith("/meal")) return answer(id, "What should I eat next, given my next session and the food I have at home?", "nutrition", text);
    if (text.startsWith("/summary")) return answer(id, "Give me a short summary of my last match and the one thing to work on.", null, text);

    // free text (or /log): the local model files it as food, a calendar entry, a finished session, or a question
    const body = text.replace(/^\/log\S*\s*/, "");
    const r = await life.read(body).catch(() => ({ intent: "chat", items: [], events: [], log: {} }));
    if (text.startsWith("/log")) r.intent = "log";
    if (r.intent === "pantry" && r.items.length) {
      const added = life.addPantry(id, r.items);
      await send(id, `Added to your kitchen: ${added.join(", ") || "(already there)"}. Send /meal any time and Coach Mei plans around it.`);
      return learnFrom(id, text);
    }
    if (r.intent === "event" && r.events.length) {
      const evs = life.addEvents(id, r.events);
      const sessions = evs.filter((e) => ["training", "match"].includes(e.kind) && e.start);
      await send(id, `In your calendar:\n${evs.map((e) => `• ${life.evText(e)}`).join("\n")}${sessions.length ? "\nI'll message you an hour before." : ""}\nSee the week with /week.`);
      if (evs.some((e) => ["match", "exam", "travel"].includes(e.kind))) await answer(id, `I just added this to my calendar: ${evs.map(life.evText).join("; ")}. How should my training this week change around it? Two sentences.`, "head", text, false);
      return learnFrom(id, text);
    }
    if (r.intent === "log") {
      const l = life.addLog(id, r.log, body);
      await send(id, `Logged for ${l.date}: ${l.what}${l.minutes ? `, ${l.minutes} min` : ""}${l.pain ? ` · pain: ${l.pain}` : ""}.`);
      // a booked game that ran past its booking: the players clicked, so the Autopilot pairs them up again
      // the game is the one on that day, or the booked one with the partners the player names ("with Leo")
      const names = Object.fromEntries(readClub().members.map((m) => [m.id, m.name.split(" ")[0].toLowerCase()]));
      const said = body.toLowerCase(), near = (e) => Math.abs(new Date(e.date) - new Date(l.date)) <= 7 * 864e5;
      const g = (store.get(id).events || []).find((e) => e.date === l.date && e.with?.length) || (store.get(id).events || []).find((e) => e.with?.length && near(e) && e.with.some((w) => names[w] && said.includes(names[w])));
      if (g && l.minutes) {
        store.update(id, (q) => { q.games.push({ date: g.date, start: g.start, sport: "badminton", format: g.with.length > 1 ? "doubles" : "singles", with: g.with, booked: g.booked, played: l.minutes }); q.games = q.games.slice(-60); });
        const over = l.minutes - g.booked;
        if (over >= 15) await send(id, `You played ${over} minutes past the booking. Good sign: I'll put this group first the next time I line up games.`);
      }
      // "knee felt fine": the body log hears it too
      if (bodylog.about(text)) { const b = await bodylog.read(text); if (b.entries.length) { store.update(id, (q) => { q.body.log.push(...b.entries); }); await send(id, bodylog.said(b.entries, organizeFor(store.get(id)))); } }
      await answer(id, `I just finished this session: ${body}. Give me one short reaction and what to do next.`, l.pain ? "fitness" : null, text, false);
      return learnFrom(id, text);
    }
    return answer(id, text, null, text);
  }

  // a coach reply, with its sources and 👍 / 👎; then learn anything durable the player said
  async function answer(id, ask, coach, original, learnAfter = true, extra = {}) {
    store.addTurn(id, "user", ask);
    const r = await reply({ text: ask, playerId: id, coach });
    store.addTurn(id, "assistant", r.text, { coach: r.coach, verified: r.verified.ok, cites: r.cites, evidence: r.evidence });
    const turn = store.get(id).history.length - 1;
    const sources = r.evidence?.length ? `\n\nSources: ${r.evidence.map((e) => `${e.id} ${e.cite}`).join("; ")}` : "";
    // 👍 / 👎 under every reply: the coaches learn from it at the next reflection run
    await send(id, `${r.coachName}: ${r.text}${sources}`, { feedback: turn, ...extra });
    if (learnAfter) await learnFrom(id, original);
    return r;
  }
  async function learnFrom(id, text) {
    if (text.startsWith("/")) return;
    const learned = await learn(id, text);
    if (learned.length) await send(id, `(Noted for your coaches: ${learned.join("; ")}. Send /forget to delete.)`);
  }
  // a reply the gateway starts itself (a reminder before a session): the same agent, no learning from it
  const answerFor = (id, ask, coach, extra) => answer(id, ask, coach, "/", false, extra);

  function feedback(id, turnIndex, value) {
    const p = store.get(id), turn = p?.history[turnIndex];
    if (!turn) return false;
    const ask = [...p.history.slice(0, turnIndex)].reverse().find((h) => h.role === "user");
    evolve.feedback({ coach: turn.coach, question: ask?.content, reply: turn.content, value, source: app.toLowerCase() });
    return true;
  }

  // ---- the body log, the health app and courts nearby ----
  async function bodyLog(id, text) {
    await typing(id).catch(() => {});
    const b = await bodylog.read(text);
    if (!b.entries.length) return answer(id, text, null, text);
    store.update(id, (q) => { q.body.log.push(...b.entries); q.body.log = q.body.log.slice(-300); });
    await send(id, bodylog.said(b.entries, organizeFor(store.get(id))));
  }
  // the answer to "How is your right knee today?": fine now, the same, or worse
  async function bodyAnswer(id, payload) {
    const m = /^bd:([\w:]+):(fine|same|worse)$/.exec(payload), p = store.get(id);
    if (!m || !p) return;
    const last = [...p.body.log].reverse().find((e) => bodylog.keyOf(e) === m[1]);
    if (!last) return send(id, "I have nothing logged for that any more.");
    const e = { ...last, id: `b${Date.now().toString(36)}`, at: new Date().toISOString(), kind: m[2] === "fine" ? "fine" : last.kind, level: m[2] === "fine" ? 0 : Math.min(5, last.level + (m[2] === "worse" ? 1 : 0)), trigger: null, note: `answered the check-in: ${m[2]}` };
    store.update(id, (q) => { q.body.log.push(e); });
    await send(id, bodylog.said([e], organizeFor(store.get(id))));
  }
  // a file shared to the chat: a health app's export, or one workout
  async function file(id, url, name) {
    await send(id, "Got your file. Reading it on your own server (it is deleted once read)…");
    let r;
    try { r = await health.fromUrl(url, name); } catch (e) { return send(id, `I couldn't read that file (${e.message}). I read Apple Health's export.zip, a Google Fit Takeout zip, and GPX, TCX or CSV files.`); }
    if (!r.workouts.length && !r.days.length) return send(id, "I found no workouts or daily numbers in that file.");
    store.update(id, (q) => {
      const key = (w) => `${w.date} ${w.start} ${w.sport}`, have = new Set(q.body.workouts.map(key));
      q.body.workouts.push(...r.workouts.filter((w) => !have.has(key(w))).map((w) => ({ ...w, route: w.route?.slice(0, 80) || null })));
      q.body.workouts = q.body.workouts.slice(-400);
      const days = Object.fromEntries(q.body.days.map((d) => [d.date, d])); r.days.forEach((d) => { days[d.date] = { ...days[d.date], ...d }; }); q.body.days = Object.values(days).sort((a, b) => a.date.localeCompare(b.date)).slice(-180);
    });
    const org = organizeFor(store.get(id));
    const learned = org.actions.filter((a) => a.kind === "learned" || a.kind === "load");
    // the watch's minutes for a booked game teach the Autopilot who you click with
    for (const l of org.linked) store.update(id, (q) => { const g = q.games.find((x) => x.date === l.date && x.start === l.start); if (g) g.played = l.minutes; });
    await send(id, `Read your ${r.source} file: ${r.counts.workouts} workout${r.counts.workouts === 1 ? "" : "s"}${r.counts.routes ? ` (${r.counts.routes} with a GPS route)` : ""} and ${r.counts.days} day${r.counts.days === 1 ? "" : "s"} of steps, heart rate and sleep.${org.load.acwr != null && !learned.some((a) => a.kind === "load") ? ` This week's load is ${org.load.acwr} times your usual week.` : ""}${learned.length ? "\n" + learned.map((a) => a.text).join("\n") : ""}\nSend /report for your body report.`);
  }
  async function courts(id, arg) {
    const sport = (arg.match(/\b(badminton|tennis|pickleball|table tennis|basketball|volleyball|soccer|football)\b/i) || [, "basketball"])[1].toLowerCase();
    const nearQ = (arg.match(/\bnear\s+(.+)$/i) || [])[1];
    await send(id, `Looking for ${sport} courts${nearQ ? ` near ${nearQ}` : " near you"}: the map, their reviews and tonight's forecast…`);
    try {
      const geo = helpers.readVenues().map?.geo;
      const here = nearQ ? await places.where(nearQ) : geo ? { ...places.toGeo(geo, readClub().you.area), name: "your area" } : null;
      if (!here) return send(id, "Tell me where: /courts basketball near Da'an Park");
      const r = await places.search({ lat: here.lat, lon: here.lon, sport, start: "19:00", limit: 5 });
      const top = r.places.slice(0, 4);
      if (!top.length) return send(id, `No ${sport} courts found within 2.5 km of ${here.name}.`);
      await send(id, `${sport[0].toUpperCase() + sport.slice(1)} near ${here.name}, tonight at 19:00${r.weather ? ` (rain ${r.weather.rain}%)` : ""}:\n${top.map((p) => `${{ good: "✅", maybe: "🤔", no: "❌" }[p.verdict]} ${p.name}, ${p.dist} m ${p.dir}: ${p.reasons.slice(0, 2).map((x) => x.text).join(" ")}${p.url ? `\n   ${p.url}` : ""}`).join("\n")}${r.reviews ? "\nReviews from Google Maps." : ""}`);
    } catch (e) { await send(id, `I couldn't search right now (${e.message}).`); }
  }

  return { handle, answerFor, feedback, send, bodyAnswer, file };
}
