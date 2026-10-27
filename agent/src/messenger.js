// Facebook Messenger: the coaching staff in the player's Messenger, through a Facebook Page on the Messenger Platform.
// Messenger calls the gateway's webhook (/webhook/messenger) with each message, signed with the app secret; replies
// go out through the Send API. The conversation itself is pocket.js. Set in .env:
//   MESSENGER_PAGE_TOKEN   the Page access token
//   MESSENGER_APP_SECRET   the Meta app's secret, to check each webhook call's signature
//   MESSENGER_VERIFY_TOKEN any string, entered again when the webhook is set up in the app dashboard
//   MESSENGER_PAGE_NAME    shown in the app (optional)
// The webhook must be reachable over HTTPS from Meta (a tunnel to port 8790 is enough).
import crypto from "node:crypto";
import { createPocket } from "./pocket.js";

const TOKEN = process.env.MESSENGER_PAGE_TOKEN, SECRET = process.env.MESSENGER_APP_SECRET, VERIFY = process.env.MESSENGER_VERIFY_TOKEN;
const API = (process.env.MESSENGER_API || "https://graph.facebook.com/v21.0").replace(/\/$/, "");
// files shared to the chat are downloaded only from Facebook's own file servers (MESSENGER_FILE_RX overrides, for tests)
const FILES = new RegExp(process.env.MESSENGER_FILE_RX || "^https://[\\w.-]+\\.(fbcdn\\.net|fbsbx\\.com|facebook\\.com)/");
export const state = { enabled: !!TOKEN, page: process.env.MESSENGER_PAGE_NAME || null, error: TOKEN ? null : "MESSENGER_PAGE_TOKEN not set", lastEvent: null };

async function graph(body) {
  if (!TOKEN) throw new Error("Messenger is not set up (no MESSENGER_PAGE_TOKEN)");
  const r = await fetch(`${API}/me/messages?access_token=${encodeURIComponent(TOKEN)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Send API: ${j.error?.message ?? r.status}`);
  return j;
}
// Messenger caps a message at 2000 characters: longer replies go out in parts, split between paragraphs
function parts(text, max = 1900) {
  const out = [];
  let cur = "";
  for (const para of String(text).split("\n\n")) {
    const add = cur ? `${cur}\n\n${para}` : para;
    if (add.length <= max) { cur = add; continue; }
    if (cur) out.push(cur);
    cur = para;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}
async function send(id, text, { feedback, tag, buttons } = {}) {
  const chunks = parts(text);
  for (let k = 0; k < chunks.length; k++) {
    const message = { text: chunks[k] };
    if (k === chunks.length - 1 && feedback != null) message.quick_replies = [
      { content_type: "text", title: "👍 Helpful", payload: `fb:${feedback}:1` },
      { content_type: "text", title: "👎 Not helpful", payload: `fb:${feedback}:-1` },
    ];
    // an agent's question with its answers as buttons (the Autopilot asking before it books)
    if (k === chunks.length - 1 && buttons?.length) message.quick_replies = buttons.map((b) => ({ content_type: "text", title: b.title.slice(0, 20), payload: b.payload }));
    // a reply to the player is a RESPONSE; a reminder about a session the player put in their calendar goes out with
    // the event-update tag, which Messenger allows after the 24-hour window
    await graph({ recipient: { id }, messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE", ...(tag ? { tag } : {}), message });
  }
}
const typing = (id) => graph({ recipient: { id }, sender_action: "typing_on" });

// answers to an agent's buttons that the gateway handles itself (payload "ap:<run>:<choice>", the Autopilot), and the
// Autopilot itself when a player asks for it here (the gateway fills these in)
export const hooks = { payload: null, autopilot: null };
export const pocket = createPocket({ name: "Messenger", send, typing, onAutopilot: (id) => (hooks.autopilot ? hooks.autopilot(id) : Promise.resolve()) });
export const direct = send;
export const REMINDER = { tag: "CONFIRMED_EVENT_UPDATE" };

// GET: Meta checks the webhook once, when it is set up
export function verify(u) {
  const ok = u.searchParams.get("hub.mode") === "subscribe" && VERIFY && u.searchParams.get("hub.verify_token") === VERIFY;
  return ok ? u.searchParams.get("hub.challenge") : null;
}
// POST: every call is signed with the app secret over the raw body
export function signed(raw, header) {
  if (!SECRET || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(crypto.createHmac("sha256", SECRET).update(raw).digest("hex")), got = Buffer.from(header.slice(7));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
export async function receive(body) {
  if (body.object !== "page") return;
  state.lastEvent = Date.now();
  for (const entry of body.entry || []) for (const ev of entry.messaging || []) {
    const id = String(ev.sender?.id || "");
    if (!id) continue;
    try {
      const fb = /^fb:(\d+):(-?1)$/.exec(ev.message?.quick_reply?.payload || "");
      if (fb) { pocket.feedback(id, +fb[1], +fb[2]); await send(id, +fb[2] > 0 ? "Thanks, noted for your coaches." : "Thanks, your coaches will review this."); continue; }
      const qp = ev.message?.quick_reply?.payload || ev.postback?.payload || "";
      if ((qp.startsWith("ap:") || qp.startsWith("wx:")) && hooks.payload) { await hooks.payload(id, qp); continue; }
      if (qp.startsWith("bd:")) { await pocket.bodyAnswer(id, qp); continue; }
      // a file shared to the chat (a health app's export, a GPX): only from Facebook's own file servers
      const att = (ev.message?.attachments || []).find((a) => a.type === "file" && FILES.test(a.payload?.url || ""));
      if (att && !ev.message.is_echo) { await pocket.file(id, att.payload.url, decodeURIComponent(new URL(att.payload.url).pathname.split("/").pop() || "export")); continue; }
      if (ev.postback?.payload === "GET_STARTED") { await pocket.handle(id, "there", "/start"); continue; }
      if (ev.message?.text && !ev.message.is_echo) await pocket.handle(id, "there", ev.message.text);
      state.error = null;
    } catch (e) { state.error = String(e.message || e); }
  }
}
