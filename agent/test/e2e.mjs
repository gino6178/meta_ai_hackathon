// End-to-end test of your agent in Facebook Messenger: a fake Graph API on this machine, the real gateway pointed at
// it, and a scripted player who messages the Page through the signed webhook. Checks linking, the calendar, the
// Autopilot (it lines up the week with the other players' agents and asks with buttons; a tap books), the reminder
// before the game, the check-in after it (a game that ran past its booking is learned), the body log, a health export
// shared to the chat, the body check-in with buttons, /report, a grounded answer (verifier), feedback and /forget.
//   node test/e2e.mjs [transcript.json]
// With a transcript path, the whole conversation is saved (for the demo video).
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";

const [OUT] = process.argv.slice(2);
const GRAPH_PORT = +(process.env.GRAPH_PORT || 18796), GW_PORT = +(process.env.GW_PORT || 18789), PSID = "4242", SECRET = "test-secret", sent = [], log = [];
const t0 = Date.now(), at = () => +((Date.now() - t0) / 1000).toFixed(1);
const SAMPLE = "../web/public/data/sample/serve_sample_health_export.zip";
const graph = http.createServer((req, res) => {
  // a file the player shared to the chat (Messenger hands the gateway a URL to fetch it from)
  if (req.method === "GET" && req.url.startsWith("/files/")) { res.writeHead(200, { "content-type": "application/zip" }); return res.end(fs.readFileSync(SAMPLE)); }
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const body = b ? JSON.parse(b) : {};
    res.writeHead(200, { "content-type": "application/json" });
    if (body.message?.text) {
      sent.push(body.message.text);
      log.push({ from: "agent", text: body.message.text, at: at(), buttons: body.message.quick_replies?.map((q) => q.title), payloads: body.message.quick_replies?.map((q) => q.payload), tag: body.tag });
    }
    res.end(JSON.stringify({ recipient_id: body.recipient?.id, message_id: `m${sent.length}` }));
  });
}).listen(GRAPH_PORT);

for (const f of ["players", "bookings", "autopilot", "a2a"]) fs.rmSync(`data/test-${f}.json`, { force: true });
const gw = spawn(process.execPath, ["src/server.js"], { env: { ...process.env, PORT: String(GW_PORT), MESSENGER_PAGE_TOKEN: "TEST", MESSENGER_APP_SECRET: SECRET, MESSENGER_VERIFY_TOKEN: "verify-me",
  MESSENGER_PAGE_NAME: "Serve (test Page)", MESSENGER_API: `http://127.0.0.1:${GRAPH_PORT}/v21.0`, STORE_FILE: "data/test-players.json", BOOKINGS_FILE: "data/test-bookings.json", AUTOPILOT_FILE: "data/test-autopilot.json", A2A_FILE: "data/test-a2a.json", MESSENGER_FILE_RX: `^http://127\\.0\\.0\\.1:${GRAPH_PORT}/files/` }, stdio: ["ignore", "pipe", "pipe"] });
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
// a message whose answer comes in parts (a log, then the booking it ran past, then the body log): wait for the part that matters
async function sayUntil(text, rx, timeout = 180000) {
  const before = sent.length, got = await say(text, timeout);
  for (const s = Date.now(); !sent.slice(before).some((t) => rx.test(t)) && Date.now() - s < timeout;) await wait(300);
  await wait(1500);
  const all = sent.slice(before);
  if (all.length > got.length) console.log(all.slice(got.length).map((g) => "< " + g).join("\n"));
  return all;
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

  const wed = new Date(); do wed.setDate(wed.getDate() + 1); while (wed.getDay() !== 3);
  const wedYmd = `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, "0")}-${String(wed.getDate()).padStart(2, "0")}`;
  await say("I have club training on Wednesday from 19:00 to 21:00");
  let me = (await api("/api/players"))[0];
  expect(me.events.some((e) => e.date === wedYmd && e.start === "19:00" && e.kind === "training"), `training is filed on Wednesday ${wedYmd} at 19:00`);
  // the Autopilot: asked in plain words, it lines up the week with the other players' agents and asks with buttons
  log.push({ from: "system", text: "Monday", at: at() });
  let before = sent.length;
  await say("Line up my games this week");
  expect(sent.slice(before).some((t) => /^On it/.test(t)), "the agent takes the job straight away");
  const s0 = Date.now();
  while (!log.some((x) => x.payloads?.some((p) => p?.startsWith("ap:"))) && Date.now() - s0 < 600000) await wait(1000);
  const ask = [...log].reverse().find((x) => x.payloads?.some((p) => p?.startsWith("ap:")));
  console.log(`\n< ${ask?.text}\n  [${ask?.buttons?.join("] [")}]  (${((Date.now() - s0) / 1000).toFixed(0)} s)`);
  expect(!!ask && /agent already said yes/.test(ask.text), "the plan comes back with every agent's yes and buttons to approve");
  before = sent.length;
  log.push({ from: "player", text: ask?.buttons?.[0] || "Book", at: at(), tap: true });
  await hook({ message: { mid: "ap1", text: ask?.buttons?.[0] || "Book", quick_reply: { payload: ask?.payloads?.[0] } } });
  const s1 = Date.now(); while (sent.length === before && Date.now() - s1 < 30000) await wait(200); await wait(500);
  console.log("< " + sent.slice(before).join("\n< "));
  expect(sent.slice(before).some((t) => t.startsWith("Booked")), "a tap on the button books the games");
  me = (await api("/api/players"))[0];
  const games = me.events.filter((e) => e.kind === "match" && e.with?.length);
  expect(games.length >= 1, "the booked games are in the player's calendar, with who they are with");

  before = sent.length;
  log.push({ from: "system", text: "An hour before the game", at: at() });
  await api("/api/remind", { kind: "presession" }); await wait(500);
  const pre = sent.slice(before);
  expect(pre.some((t) => t.startsWith("Coming up")), "an hour-before reminder is sent");
  before = sent.length;
  log.push({ from: "system", text: "After the game", at: at() });
  await api("/api/remind", { kind: "checkin" }); await wait(500);
  expect(sent.slice(before).some((t) => /How did today's session go/.test(t)), "the check-in after the game is sent");
  const mates = games[0]?.with?.map((w) => ({ leo: "Leo", hana: "Hana", tomas: "Tomás", kenji: "Kenji", noor: "Noor", yuki: "Yuki", ines: "Ines", priya: "Priya", ravi: "Ravi", aisha: "Aisha", sam: "Sam" })[w] || w) || ["Leo"];
  const told = await sayUntil(`Played two hours with ${mates.slice(0, 3).join(", ")}, way past the booking, knee felt fine`, /Logged: knee/);
  me = (await api("/api/players"))[0];
  expect(me.logs.some((l) => l.minutes >= 110), "the game is logged with how long it ran");
  expect(told.some((t) => /past the booking/.test(t)) && me.games.length >= 1, "a game that ran past its booking is learned: the group comes first next time");

  // the body log: what hurts is filed, and the games are planned around it
  const hurt = await sayUntil("My right knee is sore after jumping, about 3 out of 5", /Logged: right knee/);
  expect(hurt.some((t) => /Logged: right knee/.test(t)), "what hurts is filed in the body log (part, side, level)");
  expect(hurt.some((t) => /doubles first/.test(t)), "the agent changes the plan: doubles first, no jump sports");
  // a health app's export, shared to the chat
  before = sent.length;
  log.push({ from: "player", text: "📎 serve_sample_health_export.zip", file: true, at: at() });
  await hook({ message: { mid: `f${Date.now()}`, attachments: [{ type: "file", payload: { url: `http://127.0.0.1:${GRAPH_PORT}/files/serve_sample_health_export.zip` } }] } });
  for (let s = Date.now(); !sent.slice(before).some((t) => /^Read your|couldn't read/.test(t)) && Date.now() - s < 120000;) await wait(300);
  console.log("\n> (shared the sample export)\n" + sent.slice(before).map((g) => "< " + g).join("\n"));
  expect(sent.slice(before).some((t) => /Read your Apple Health file: 23 workouts/.test(t)), "a health export shared to the chat is read: 23 workouts");
  me = (await api("/api/players"))[0];
  expect(me.body?.workouts?.length === 23 && me.body.log.some((e) => e.part === "knee"), "the workouts and the body log are on the player's record");
  // two days later: the check-in, with buttons; a tap is filed
  before = sent.length;
  log.push({ from: "system", text: "Two days later", at: at() });
  await api("/api/body/followups?all=1", {}); await wait(800);
  const checkin = log.filter((x) => x.from === "agent").slice(-1)[0];
  expect(/How is your right knee today\?/.test(checkin?.text || "") && checkin.payloads?.includes("bd:knee:right:same"), "the check-in asks about the right knee, with buttons");
  before = sent.length;
  log.push({ from: "player", text: "About the same", at: at(), tap: true });
  await hook({ message: { mid: "q2", text: "About the same", quick_replies: undefined, quick_reply: { payload: "bd:knee:right:same" } } }); await wait(1500);
  expect(sent.slice(before).some((t) => /Logged: right knee/.test(t)), "the answer is filed");
  const rep = await sayUntil("/report", /Body report/);
  expect(rep.some((t) => /Body report/.test(t)), "/report sends the body report");
  const net = await say("How many net errors did I make in the match?");
  expect(net.some((t) => /14/.test(t)), "the answer uses the real figure (14 net errors)");

  before = sent.length;
  me = (await api("/api/players"))[0];
  await hook({ message: { mid: "q1", text: "👍 Helpful", quick_reply: { payload: `fb:${me.history.length - 1}:1` } } }); await wait(1500);
  expect(sent.slice(before).some((t) => /^Thanks, noted/.test(t)), "a 👍 is taken as feedback on the answer, not a new question");
  const all = (await api("/api/players"))[0].history.filter((h) => h.role === "assistant");
  console.log("  replies verified:", all.filter((h) => h.verified).length, "of", all.length);
  expect(all.every((h) => h.verified), "every answer passed the number verifier");
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(log, null, 1));
  expect((await say("/forget"))[0].includes("deleted"), "/forget deletes the player");
  expect((await api("/api/players")).length === 0, "nothing is left after /forget");
} catch (e) { fails.push(String(e.message)); console.log("ERROR", e); }
gw.kill(); graph.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
process.exit(fails.length ? 1 : 0);
