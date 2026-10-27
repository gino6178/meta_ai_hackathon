// End-to-end test of the coaches in Facebook Messenger: a fake Graph API on this machine, the real gateway pointed at
// it, and a scripted player who messages the Page through the signed webhook. Checks linking, grounded replies
// (verifier), learning a memory, the round-table plan, the kitchen, the calendar, reminders and /forget.
//   node test/e2e.mjs [transcript.json] [plan.json]
// With a transcript path, the whole conversation is saved (for the demo video); with a plan, that plan is pushed.
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";

const [OUT, PLAN] = process.argv.slice(2);
const GRAPH_PORT = +(process.env.GRAPH_PORT || 18796), GW_PORT = +(process.env.GW_PORT || 18789), PSID = "4242", SECRET = "test-secret", sent = [], log = [];
const t0 = Date.now(), at = () => +((Date.now() - t0) / 1000).toFixed(1);
const graph = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const body = b ? JSON.parse(b) : {};
    res.writeHead(200, { "content-type": "application/json" });
    if (body.message?.text) {
      sent.push(body.message.text);
      log.push({ from: "coach", text: body.message.text, at: at(), buttons: body.message.quick_replies?.map((q) => q.title), tag: body.tag });
    }
    res.end(JSON.stringify({ recipient_id: body.recipient?.id, message_id: `m${sent.length}` }));
  });
}).listen(GRAPH_PORT);

fs.rmSync("data/test-players.json", { force: true });
const gw = spawn(process.execPath, ["src/server.js"], { env: { ...process.env, PORT: String(GW_PORT), MESSENGER_PAGE_TOKEN: "TEST", MESSENGER_APP_SECRET: SECRET, MESSENGER_VERIFY_TOKEN: "verify-me",
  MESSENGER_PAGE_NAME: "Serve (test Page)", MESSENGER_API: `http://127.0.0.1:${GRAPH_PORT}/v21.0`, STORE_FILE: "data/test-players.json" }, stdio: ["ignore", "pipe", "pipe"] });
gw.stdout.on("data", (d) => process.stdout.write("  [gateway] " + d));
gw.stderr.on("data", (d) => process.stdout.write("  [gateway!] " + d));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// a message from the player, as Messenger delivers it: a signed webhook call
async function hook(event) {
  const body = JSON.stringify({ object: "page", entry: [{ id: "page", time: Date.now(), messaging: [{ sender: { id: PSID }, recipient: { id: "page" }, timestamp: Date.now(), ...event }] }] });
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  return fetch(`http://127.0.0.1:${GW_PORT}/webhook/messenger`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
}
async function say(text, timeout = 240000) {
  const before = sent.length;
  log.push({ from: "player", text, at: at() });
  await hook({ message: { mid: `p${Date.now()}`, text } });
  const s = Date.now();
  while (sent.length === before) { if (Date.now() - s > timeout) throw new Error("no reply to " + text); await wait(200); }
  await wait(text.startsWith("/") ? 300 : 6000); // allow a follow-up (learned memory) message
  const got = sent.slice(before);
  console.log(`\n> ${text}  (${((Date.now() - s) / 1000).toFixed(1)} s)\n` + got.map((g) => "< " + g).join("\n"));
  return got;
}
const api = (p, body) => fetch(`http://127.0.0.1:${GW_PORT}${p}`, body ? { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:5191" }, body: JSON.stringify(body) } : {}).then((r) => r.json());
const fails = [];
const expect = (cond, what) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${what}`); if (!cond) fails.push(what); };

try {
  await wait(1500);
  const st = await api("/api/status");
  console.log("status:", JSON.stringify(st.messenger));
  expect(st.messenger?.enabled, "the gateway has a Messenger Page");
  const v = await fetch(`http://127.0.0.1:${GW_PORT}/webhook/messenger?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123`).then((r) => r.text());
  expect(v === "123", "the webhook passes Meta's verification");
  const bad = await fetch(`http://127.0.0.1:${GW_PORT}/webhook/messenger`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" }, body: "{}" });
  expect(bad.status === 403, "an unsigned webhook call is refused");

  expect((await say("Hi"))[0].includes("linked"), "the first message links the chat");
  const plan = PLAN ? JSON.parse(fs.readFileSync(PLAN, "utf8")) : { event: "Thailand Masters 2025", goals: ["Cut net errors to 8 or fewer"], days: [{ d: "Mon", blocks: [["technique", 25, "Net kill and net lift with a 30 cm margin"]] }, { d: "Tue", blocks: [] }] };
  log.push({ from: "system", text: "The round table agreed the week", at: at() });
  const n = await api("/api/notify", { plan });
  await wait(500);
  expect(n.sent?.length === 1 && sent[sent.length - 1].includes("round table"), "the round-table plan is pushed to the player");

  const wed = new Date(); do wed.setDate(wed.getDate() + 1); while (wed.getDay() !== 3);
  const wedYmd = `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, "0")}-${String(wed.getDate()).padStart(2, "0")}`;
  await say("I have club training on Wednesday from 19:00 to 21:00");
  let me = (await api("/api/players"))[0];
  expect(me.events.some((e) => e.date === wedYmd && e.start === "19:00" && e.kind === "training"), `training is filed on Wednesday ${wedYmd} at 19:00`);
  await say("I bought chicken breast, rice and broccoli today");
  me = (await api("/api/players"))[0];
  expect(me.pantry.some((x) => /chicken/.test(x.item)), "food named in chat goes to the kitchen list");

  let before = sent.length;
  log.push({ from: "system", text: "An hour before training", at: at() });
  await api("/api/remind", { kind: "presession" }); await wait(500);
  const pre = sent.slice(before);
  expect(pre.some((t) => t.startsWith("Coming up")) && pre.some((t) => /Coach Mei/.test(t)), "an hour-before reminder comes with what to eat");
  expect(pre.some((t) => /chicken|rice|broccoli/i.test(t)), "the meal uses the food at home");
  before = sent.length;
  log.push({ from: "system", text: "That evening", at: at() });
  await api("/api/remind", { kind: "checkin" }); await wait(500);
  expect(sent.slice(before).some((t) => /How did today's session go/.test(t)), "the evening check-in is sent");
  await say("Did 45 minutes of footwork and net drills, knee felt fine");
  me = (await api("/api/players"))[0];
  expect(me.logs.some((l) => l.minutes === 45), "the session is logged with its 45 minutes");
  const net = await say("How many net errors did I make in the match?");
  expect(net.some((t) => /14/.test(t)), "the answer uses the real figure (14 net errors)");

  before = log.length;
  await hook({ message: { mid: "q1", text: "👍 Helpful", quick_reply: { payload: `fb:${me.history.length - 1}:1` } } }); await wait(800);
  expect(sent.at(-1).includes("noted"), "a 👍 is taken as feedback for the coaches, not a new question");
  const all = (await api("/api/players"))[0].history.filter((h) => h.role === "assistant");
  console.log("  replies verified:", all.filter((h) => h.verified).length, "of", all.length);
  expect(all.every((h) => h.verified), "every reply, including meals, passed the number verifier");
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(log, null, 1));
  expect((await say("/forget"))[0].includes("deleted"), "/forget deletes the player");
  expect((await api("/api/players")).length === 0, "nothing is left after /forget");
} catch (e) { fails.push(String(e.message)); console.log("ERROR", e); }
gw.kill(); graph.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
