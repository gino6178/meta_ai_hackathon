// The 24-hour coach in the player's pocket: the conversation with the coaching staff, whichever messaging app carries
// it (messenger.js is the transport). The local model files what the player says (food at home, sessions and exams,
// what they trained) and the right coach answers through the grounded, verified agent; the plan, reminders before
// each session and the evening check-in are pushed. A transport gives send(id, text, { feedback, tag }) and,
// optionally, typing(id).
import * as store from "./store.js";
import { reply, learn, COACHES } from "./coach.js";
import { factSheet } from "./facts.js";
import * as evolve from "./evolve.js";
import * as life from "./life.js";

export const HELP = `I'm your Serve staff, here 24 hours a day: Coach Lin (tactics), Coach Kai (technique), Coach Ren (fitness), Coach Ada (data), Coach Mei (nutrition) and the Head Coach.
Just write to us: what you bought ("eggs, tofu, rice"), your schedule ("club training Wed 19:00-21:00", "exam Friday"), what you trained ("45 min footwork, knee fine"), or any question. We file it and plan around it.
/week calendar and training log · /today today's plan · /meal what to eat next · /pantry your kitchen · /log a session · /plan the round-table plan · /summary match summary · /coach lin|kai|ren|ada|mei|head · /forget delete everything we stored about you`;

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

export function createPocket({ name: app, send, typing = async () => {} }) {
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
    if (text.startsWith("/help")) return send(id, HELP);
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
      await send(id, `In your calendar:\n${evs.map((e) => `• ${life.evText(e)}`).join("\n")}${sessions.length ? "\nI'll message you an hour before, with what to eat." : ""}\nSee the week with /week.`);
      if (evs.some((e) => ["match", "exam", "travel"].includes(e.kind))) await answer(id, `I just added this to my calendar: ${evs.map(life.evText).join("; ")}. How should my training this week change around it? Two sentences.`, "head", text, false);
      return learnFrom(id, text);
    }
    if (r.intent === "log") {
      const l = life.addLog(id, r.log, body);
      await send(id, `Logged for ${l.date}: ${l.what}${l.minutes ? `, ${l.minutes} min` : ""}${l.pain ? ` · pain: ${l.pain}` : ""}.`);
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

  return { handle, answerFor, feedback, send };
}
