// Record the demo video's scenes from the running site (npm run dev on :5191, gateway on the GPU server) at
// 1920x1080 in the light theme. Each scene goes to build/<name>.webm, with the moments that matter in
// build/marks.json (seconds from the start of that scene); assemble.mjs cuts, speeds up the model's waits,
// captions and joins them.
//   node record.mjs [scene ...]     scenes: impact autopilot body courts pocket highlight club meta tech end, and the older
//   title play tasks coaches chat round lab (default: the first list)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
// puppeteer-core from this folder's node_modules, or from another project's (PUPPETEER_FROM=that folder)
const require = createRequire(process.env.PUPPETEER_FROM ? path.join(process.env.PUPPETEER_FROM, "package.json") : import.meta.url);
const puppeteer = require("puppeteer-core");

const B = "http://127.0.0.1:5191";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const OUT = path.join(HERE, "build"), SCENES = path.join(HERE, "scenes"), MARKS = path.join(OUT, "marks.json");
fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const DEFAULT = ["impact", "autopilot", "body", "courts", "pocket", "highlight", "club", "meta", "tech", "end"];
const run = (n) => (want.length ? want.includes(n) : DEFAULT.includes(n));
const BODY_SEED = JSON.parse(fs.readFileSync(path.join(OUT, "body_seed.json"), "utf8"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = fs.existsSync(MARKS) ? JSON.parse(fs.readFileSync(MARKS, "utf8")) : {};

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", protocolTimeout: 900000,
  args: ["--lang=en-US", "--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-size=1920,1080", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
// the demo video shows no broadcast footage: the highlight reel is recorded in its drawn-only picture
await page.evaluateOnNewDocument(() => { try { localStorage.setItem("shuttlecoach.reel.src", "drawn"); } catch { /* file:// pages */ } });
// a visible cursor with a click ring: headless screencasts show no pointer
await page.evaluateOnNewDocument(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;left:-50px;top:-50px;width:24px;height:24px;z-index:2147483647;pointer-events:none";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 2l7 19 2.6-8.1L21 10z" fill="#fff" stroke="#0a0a0b" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    // one pixel that changes every frame: the screencast only sends frames when something changes, so a page that
    // sits still would otherwise lose its last state (a booking that just went "Game on") and drift in time
    const tick = document.createElement("i");
    tick.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;background:#fefefe";
    document.documentElement.appendChild(tick);
    let on = false; const flip = () => { on = !on; tick.style.background = on ? "#fdfdfd" : "#fefefe"; requestAnimationFrame(flip); }; requestAnimationFrame(flip);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX - 3 + "px"; c.style.top = e.clientY - 2 + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid #0a7f44;z-index:2147483646;pointer-events:none;transition:all .45s ease-out;opacity:1`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  });
});

let mx = 960, my = 540;
async function move(x, y, ms = 700) {
  const t0 = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms), e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
    if (t >= 1) break;
    await wait(16);
  }
  mx = x; my = y;
}
async function at(sel, text, scroll = true) {
  const h = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find((e) => !t || e.innerText.includes(t)) || null, sel, text ?? null);
  const el = h.asElement();
  if (!el) throw new Error(`not found: ${sel} ${text ?? ""}`);
  if (scroll) { await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 40) e.scrollIntoView({ behavior: "smooth", block: "center" }); }); await wait(700); }
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, el };
}
async function click(sel, text, ms = 700) { const p = await at(sel, text); await move(p.x, p.y, ms); await wait(150); await page.mouse.click(p.x, p.y); return p; }
async function scrollEl(sel, block = "start", ms = 1200) { await page.evaluate((s, b) => document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: b }), sel, block); await wait(ms); }
async function go(hash, settle = 1500) { await page.goto(`${B}/#/${hash}`, { waitUntil: "networkidle2" }); await page.mouse.move(mx, my); await wait(settle); }
async function rec(name, fn) {
  const file = path.join(OUT, name + ".webm");
  const r = await page.screencast({ path: file });
  const t0 = Date.now(), m = {};
  const mark = (k) => { m[k] = +((Date.now() - t0) / 1000).toFixed(2); console.log(`  ${name}.${k} ${m[k]} s`); };
  await fn(mark);
  m.end = +((Date.now() - t0) / 1000).toFixed(2);
  await r.stop();
  marks[name] = m;
  fs.writeFileSync(MARKS, JSON.stringify(marks, null, 1));
  console.log(name, m.end, "s");
}
// camera move: scale the app around a point on screen (a CSS transform on #root keeps text sharp)
async function zoom(x, y, s, ms = 2200) {
  await page.evaluate((x, y, s, ms) => {
    const r = document.getElementById("root");
    r.style.transition = `transform ${ms}ms cubic-bezier(.45,0,.2,1)`; r.style.transformOrigin = `${x}px ${y + scrollY}px`; r.style.transform = s === 1 ? "none" : `scale(${s})`;
  }, x, y, s, ms);
}
// a card that names what is on screen, in the app's own style: white, a hairline, the agent's green dot
async function callout(id, html, x = 80, y = 900) {
  await page.evaluate((id, html, x, y) => {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; el.className = "fx"; document.documentElement.appendChild(el); }
    el.style.cssText = `position:fixed;z-index:2147483640;left:${x}px;top:${y}px;opacity:0;transform:translateY(14px);transition:opacity .45s,transform .45s;background:#fff;border:1px solid rgba(0,0,0,.14);color:#0a0a0b;font:700 30px/1.3 system-ui,'Segoe UI',sans-serif;padding:16px 28px 16px 56px;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.16);max-width:1100px;pointer-events:none`;
    el.innerHTML = `<i style="position:absolute;left:24px;top:50%;width:14px;height:14px;margin-top:-7px;border-radius:50%;background:#0a7f44;box-shadow:0 0 0 5px rgba(10,127,68,.2)"></i>${html}`;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "none"; }));
  }, id, html, x, y);
}
const uncall = (id) => page.evaluate((id) => { const el = document.getElementById(id); if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 500); } }, id);
const resetFx = () => page.evaluate(() => { document.querySelectorAll(".fx").forEach((e) => e.remove()); const r = document.getElementById("root"); if (r) { r.style.transition = "none"; r.style.transform = "none"; } });
const center = (sel, text, fx = .5, fy = .5) => page.evaluate((sel, text, fx, fy) => {
  const e = [...document.querySelectorAll(sel)].find((x) => !text || x.innerText.includes(text)); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy };
}, sel, text ?? null, fx, fy);
const G = "<span style='color:#0a7f44'>", E = "</span>";

// a clean start: no earlier jobs, game state, stories seen or threads read
await go("", 800);
await page.evaluate(() => ["shuttlecoach.tasks.v1", "shuttlecoach.game.v1", "shuttlecoach.stories.v1", "shuttlecoach.inbox.v1", "serve.body"].forEach((k) => localStorage.removeItem(k)));

if (run("title")) { await page.goto("file:///" + path.join(SCENES, "title.html").replace(/\\/g, "/")); await page.mouse.move(-10, -10); await rec("title", () => wait(9000)); }

// the challenge: asked on the agent home, then the Play view fills in step by step, then the booking
if (run("play")) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // a real reload, so no job from an earlier take is left in the page
    await go("", 800);
    await page.evaluate(() => ["shuttlecoach.tasks.v1", "shuttlecoach.game.v1"].forEach((k) => localStorage.removeItem(k)));
    await page.reload({ waitUntil: "networkidle2" }); await wait(1800);
    let ok = true;
    await rec("play", async (mark) => {
      await move(1100, 700, 900);
      await click("#agent-q", null, 900);
      await page.keyboard.type("Challenge Kenji to a singles match this week", { delay: 55 });
      mark("typed"); await wait(500);
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => location.hash.includes("play?task="), { timeout: 15000 });
      mark("play"); await wait(900);
      await scrollEl(".play-job", "start", 1200);
      await move(1500, 520, 1200);
      await page.waitForFunction(() => document.querySelector(".trail-step.read_request"), { timeout: 120000 }); mark("read");
      await page.waitForFunction(() => document.querySelector(".trail-step.open_map"), { timeout: 60000 }); mark("map");
      await page.waitForFunction(() => document.querySelector(".trail-step.calendar"), { timeout: 60000 }); mark("calendar");
      await page.waitForFunction(() => document.querySelector(".trail-step.travel"), { timeout: 60000 }); mark("middle");
      await wait(1600);
      await page.waitForFunction(() => document.querySelector(".options"), { timeout: 240000 }); mark("options");
      await wait(1200);
      await scrollEl(".job-cal", "center", 1400); mark("week"); await wait(2600);
      await scrollEl(".options", "start", 1400); mark("opts"); await wait(1200);
      await click(".option.best .btn.primary", null, 900); mark("confirm"); await wait(2600);
      await click(".play-confirm .btn.primary", null, 900); mark("booked");
      await page.waitForFunction(() => document.querySelector(".booking.confirmed, .booking.short"), { timeout: 60000 });
      ok = await page.evaluate(() => !!document.querySelector(".booking.confirmed"));
      mark("answer");
      await scrollEl(".booking", "center", 1200); await wait(3600);
    });
    console.log("play attempt", attempt, ok ? "confirmed" : "declined, again");
    const r = await page.evaluate(() => { const t = JSON.parse(localStorage.getItem("shuttlecoach.tasks.v1") || "[]").find((x) => x.kind === "play"); return t && { message: t.result?.message, best: t.result?.options?.[0] && { day: t.result.options[0].day, start: t.result.options[0].start, venue: t.result.options[0].venue.name, travel: t.result.options[0].travel }, seconds: t.result?.seconds, steps: t.steps.map((s) => `${s.step}: ${s.detail}`) }; });
    fs.writeFileSync(path.join(OUT, "play_result.json"), JSON.stringify(r, null, 1));
    if (ok) break;
  }
}

// the agent home: two jobs at once, their steps arriving; then the quests are left to finish for the club scene
if (run("tasks")) {
  await go("", 1500);
  await rec("tasks", async (mark) => {
    await click(".ideas .chip", "Get this week's quests", 900); await wait(500);
    await click(".ideas .chip", "How should I warm up before Thursday?", 800); mark("asked");
    await wait(1200);
    const p = await center(".task-sec", "Working on it", .45, .3);
    if (p) await zoom(p.x, p.y, 1.18, 2000);
    await wait(9000); mark("steps");
  });
  await resetFx();
  await page.waitForFunction(() => !document.querySelector(".task.running"), { timeout: 300000 }).catch(() => console.log("tasks still running"));
  await wait(800);
  await rec("tasks_done", async (mark) => { await scrollEl(".task-sec", "start", 1000); const p = await center(".task", "Coach Ren", .4, .4); if (p) await zoom(p.x, p.y, 1.15, 1800); await wait(4200); mark("shown"); });
  await resetFx();
}

// the coach agents: the inbox, Lin's heat zones, Ren working around a sore knee
if (run("coaches")) {
  await go("coaches", 1500);
  await rec("coaches", async (mark) => {
    await move(900, 300, 1200);
    const l = await center(".learning");
    if (l) { await zoom(l.x, l.y, 1.2, 1600); await wait(1800); await zoom(l.x, l.y, 1, 700); await wait(700); }
    mark("inbox");
    await click(".thread", "Coach Lin", 900); mark("lin"); await wait(2200);
    const h = await page.evaluate(() => { const e = [...document.querySelectorAll("h3")].find((x) => x.innerText.includes("beat you")); if (!e) return null; const r = e.parentElement.getBoundingClientRect(); return { x: r.left + r.width * .6, y: r.top + r.height * .6 }; });
    if (h) { await zoom(h.x, h.y, 1.3, 2200); await wait(600); }
    await callout("fx1", `Rear forehand: ${G}7 of 24${E} winners conceded`); await wait(3600);
    await resetFx();
    await go("coach/fitness", 2500); mark("ren");
    const c = await page.evaluate(() => { const r = [...document.querySelectorAll("canvas")].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return r && { x: r.left + r.width / 2, y: r.top + r.height * .42 }; });
    if (c) { await zoom(c.x, c.y, 1.2, 2000); await wait(500); }
    await callout("fx2", `Memory: ${G}right knee sore${E} → no jump drills`); await wait(3800);
  });
  await resetFx();
}

// a question answered by a coach agent on Muse Glimmer, every number checked
if (run("chat")) {
  await go("coach/technique", 1500);
  await at("section.coach-chat");
  await rec("chat", async (mark) => {
    await click("section.coach-chat input[type=text], section.coach-chat input:not([type])", null, 800);
    await page.keyboard.type("Why do I keep losing points at the net?", { delay: 40 });
    await wait(300); await page.keyboard.press("Enter"); mark("asked");
    await page.waitForFunction(() => [...document.querySelectorAll(".coach-chat .chat-msg.assistant")].some((e) => /verified/.test(e.innerText)), { timeout: 120000 });
    mark("answer");
    const meta = await page.evaluate(() => [...document.querySelectorAll(".coach-chat .chat-msg.assistant .chat-meta")].at(-1)?.innerText || "");
    const sec = (meta.match(/([\d.]+) s/) || [])[1];
    fs.writeFileSync(path.join(OUT, "chat_meta.txt"), meta);
    const p = await center(".coach-chat .chat-msg.assistant:last-child");
    if (p) await zoom(p.x, p.y, 1.15, 1500);
    await callout("fx1", `Muse Glimmer${sec ? ` · ${Math.round(+sec)} s` : ""} · ${G}✓ every number verified${E}`, 80, 110); await wait(4200);
  });
  await resetFx();
}

// the round table: the clash, then the head coach's ruling
if (run("round")) {
  await go("roundtable", 500);
  await page.waitForFunction(() => document.querySelector(".rt-msg.conflict"), { timeout: 120000 });
  await wait(700);
  await rec("round", async (mark) => {
    let p = await center(".rt-msg.conflict");
    await zoom(p.x, p.y, 1.3, 2000); await wait(600);
    await callout("fx1", `Conflict: Ren challenges Lin, ${G}right knee sore${E}`); mark("conflict"); await wait(3800);
    await uncall("fx1"); await zoom(p.x, p.y, 1, 800); await wait(800);
    await click("button", "Skip to the plan", 700).catch(() => {}); await wait(1200);
    p = await center(".rt-msg.resolve", "Ruling") || await center(".rt-msg.resolve");
    if (p) { await zoom(p.x, p.y, 1.25, 1700); await wait(400); }
    await callout("fx2", `Head coach: ${G}health first${E}, then the points at stake`); mark("ruling"); await wait(3600);
  });
  await resetFx();
}

// the coaches keep learning: the research behind it, a rule learned from a paper, a health change waiting for you
if (run("lab")) {
  await go("lab", 2500);
  await rec("lab", async (mark) => {
    const k = await center(".readout, dl", null, .25, .5);
    if (k) { await zoom(k.x, k.y, 1.25, 1800); await wait(400); }
    await callout("fx1", `Research agent: ${G}62 findings${E} from 24 papers`); mark("research"); await wait(3400);
    await resetFx();
    await scrollEl(".lab-grid, .lab-pb", "start", 1500); mark("playbooks");
    await move(1100, 520, 1200); await wait(1500);
    const d = await at(".lab-prop.pending", "touches health");
    await zoom(d.x, d.y, 1.25, 1800); await move(d.x - 140, d.y - 20, 900);
    await callout("fx2", `A health change: ${G}waits for you${E}`, 80, 120); mark("pending"); await wait(3600);
    await uncall("fx2"); await zoom(d.x, d.y, 1, 700); await wait(700);
    const a = await at(".lab-prop.ok", null);
    await zoom(a.x, a.y, 1.2, 1500);
    await callout("fx3", `${G}15 of 22${E} changes passed safety and regression checks`, 80, 120); mark("adopted"); await wait(3600);
  });
  await resetFx();
}

// the club: a quest logged against the boss, the leaderboard, then your best match and your agent talking to theirs
if (run("club")) {
  await go("goals", 1800);
  await rec("club", async (mark) => {
    const q = await center(".quests");
    if (q) { await zoom(q.x, q.y * .8, 1.1, 1300); await wait(300); }
    await click(".quest .btn", null, 800); mark("logged"); await wait(900);
    await resetFx();
    const b = await center(".boss");
    if (b) { await zoom(b.x, b.y, 1.2, 1200); await wait(300); }
    await callout("fx1", `Every logged quest takes ${G}health off the boss${E}`); await wait(2200);
    await resetFx();
    await go("club?tab=ranks", 1200); mark("ranks");
    const p = await center(".podium");
    if (p) await zoom(p.x, p.y + 120, 1.12, 1400);
    await callout("fx2", `A club rating that ${G}every challenge moves${E}`, 80, 110); await wait(2600);
    await resetFx();
    await click(".club-tabs a", "Challenges", 800); await wait(900); mark("challenges");
    await click(".best .btn.primary", "Find my best match", 800); mark("best");
    await page.waitForFunction(() => document.querySelector(".best-list"), { timeout: 180000, polling: 200 }); mark("picked");
    await wait(600);
    const top = await center(".best-list li.top");
    if (top) await zoom(top.x, top.y, 1.18, 1300);
    await callout("fx3", `Your best match: ${G}fair by rating${E}, free when you are, good for your weak zone`, 80, 110); await wait(3000);
    await resetFx();
    await click(".best-list li.top .btn", null, 800); mark("talk");
    await page.waitForFunction(() => document.querySelector(".a2a-book") || document.querySelector(".a2a .muted.small"), { timeout: 300000, polling: 200 }); mark("agreed");
    await page.evaluate(() => document.querySelector(".a2a").scrollIntoView({ behavior: "smooth", block: "center" })); await wait(900);
    const th = await center(".a2a");
    if (th) await zoom(th.x, th.y, 1.12, 1300);
    await callout("fx4", `${G}Agent to agent${E}: every time checked against both calendars`, 80, 110); await wait(3200);
    const bk = await at(".a2a-book .btn", null, false).catch(() => null);
    if (bk) { await move(bk.x, bk.y, 800); await wait(900); }
  });
  await resetFx();
}

// the opening: the number, the pain, what Serve does
if (run("impact")) { await page.goto("file:///" + path.join(SCENES, "impact.html").replace(/\\/g, "/")); await page.mouse.move(-10, -10); await rec("impact", () => wait(13500)); }

// the Autopilot: one click, then Muse Glimmer runs the week tool by tool (with the body log and the watch data in
// place), negotiates with the other players' agents, and asks once; a tap books it
if (run("autopilot")) {
  // a hash change keeps the app's state in memory: seed, then reload so the app reads it
  await go("autopilot", 600);
  await page.evaluate((b) => { localStorage.setItem("serve.body", JSON.stringify(b)); localStorage.removeItem("shuttlecoach.tasks.v1"); }, BODY_SEED);
  await page.reload({ waitUntil: "networkidle2" }); await page.mouse.move(mx, my); await wait(1800);
  await rec("autopilot", async (mark) => {
    await callout("fx1", `It learned ${G}when you play${E} and ${G}who you play best with${E}`, 80, 110); await wait(2600); await uncall("fx1");
    await click(".report-head .btn.primary", "Run my week now", 900); mark("run");
    await page.waitForFunction(() => document.querySelector(".ap-steps li.check_body"), { timeout: 240000, polling: 200 }); mark("body");
    await scrollEl(".ap-run", "start", 1200);
    await callout("fx2", `Muse Glimmer ${G}picks each tool${E}; code runs it and checks the result`, 80, 110);
    await page.waitForFunction(() => document.querySelector(".ap-steps li.find_partners"), { timeout: 240000, polling: 200 }); mark("partners");
    await page.waitForFunction(() => document.querySelector(".ap-thread"), { timeout: 240000, polling: 200 }); mark("talk");
    await uncall("fx2");
    await callout("fx3", `Your agent and ${G}three players' agents${E}, answering at once`, 80, 110);
    await page.waitForFunction(() => document.querySelector(".ap-approve"), { timeout: 600000, polling: 300 }); mark("ask");
    await uncall("fx3"); await wait(400);
    await scrollEl(".ap-approve", "center", 1200);
    await page.screenshot({ path: path.join(HERE, "..", "submission", "shots", "autopilot_week.png") }); // the opening card's picture
    const a = await center(".ap-approve");
    if (a) await zoom(a.x, a.y, 1.15, 1300);
    await callout("fx4", `${G}Nothing is booked${E} until you say yes`, 80, 120); await wait(2600);
    await resetFx();
    await click(".ap-approve .btn.primary", null, 900); mark("booked"); await wait(2600);
  });
  await resetFx();
}

// the body log: tell it what hurts, it lands on the body; share the health app, the plan changes; the report
if (run("body")) {
  await go("body", 600);
  await page.evaluate(() => localStorage.removeItem("serve.body"));
  await page.reload({ waitUntil: "networkidle2" }); await page.mouse.move(mx, my); await wait(4500);
  await rec("body", async (mark) => {
    const t = await at(".bd-tell textarea");
    await move(t.x, t.y, 800); await page.mouse.click(t.x, t.y);
    await page.keyboard.type("My right knee still hurts today, about 3 out of 5, worse after jumping", { delay: 28 }); mark("typed");
    await click(".bd-tell form .btn", null, 600); mark("sent");
    await page.waitForFunction(() => document.querySelector(".bd-agent:not(.working)"), { timeout: 180000, polling: 200 }); mark("filed");
    await wait(600);
    const f = await center(".bd-figure", null, .5, .62);
    if (f) await zoom(f.x, f.y, 1.25, 1400);
    await callout("fx1", `Filed on your body by ${G}Muse Glimmer${E}: right knee, 3 of 5`, 80, 120); await wait(3000);
    await resetFx();
    await scrollEl(".bd-health", "start", 1300);
    const [sample] = await page.$$("xpath/.//button[contains(., 'Try the sample export')]");
    const sb = await sample.boundingBox(); await move(sb.x + sb.width / 2, sb.y + sb.height / 2, 800); await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); mark("import");
    await page.waitForFunction(() => !document.querySelector(".bd-steps .working") && document.querySelector(".bd-health .small b"), { timeout: 300000, polling: 200 }); mark("imported");
    await wait(1500);
    await scrollEl(".bd-side", "start", 1300);
    const acts = await center(".bd-acts");
    if (acts) await zoom(acts.x, acts.y, 1.12, 1300);
    await callout("fx2", `Your watch: this week is ${G}2 times your usual load${E}`, 80, 110); mark("acts"); await wait(3400);
    await resetFx();
    await scrollEl(".bd-trail", "start", 1500); mark("trail");
    await page.waitForFunction(() => !document.querySelector(".bd-attr.loading"), { timeout: 240000, polling: 500 }).catch(() => {});
    await wait(2600);
    await scrollEl(".bd-report", "start", 1300);
    const [wr] = await page.$$("xpath/.//button[contains(., 'Write the summary')]");
    if (wr) { const wb = await wr.boundingBox(); await move(wb.x + wb.width / 2, wb.y + wb.height / 2, 800); await page.mouse.click(wb.x + wb.width / 2, wb.y + wb.height / 2); }
    mark("write");
    await page.waitForFunction(() => document.querySelector(".bd-sum"), { timeout: 180000, polling: 200 }); mark("report");
    await callout("fx3", `A report for you or your physio · ${G}every number checked${E}`, 80, 110); await wait(3200);
  });
  await resetFx();
}

// courts near you, any sport: the map, the reviews, the forecast, then every court judged at once
if (run("courts")) {
  await go("courts?sport=basketball", 1500);
  await rec("courts", async (mark) => {
    await click(".ct-ask .btn.primary", "Find courts", 900); mark("find");
    await page.waitForFunction(() => document.querySelector(".ct-list"), { timeout: 600000, polling: 300 }); mark("found");
    await wait(500);
    await scrollEl(".ct-head", "start", 1300);
    const c = await center(".ct-place", null, .5, .5);
    if (c) await zoom(c.x, c.y, 1.25, 1400);
    await callout("fx1", `Each reason cites ${G}the map${E}, ${G}a review${E} or ${G}the forecast${E}, and is checked`, 80, 110); await wait(3600);
  });
  await resetFx();
}

// what it is built on: the About page's Meta AI section, then the architecture and the measured numbers
if (run("meta")) {
  await go("about", 2500);
  await page.evaluate(() => document.getElementById("ab-meta")?.scrollIntoView({ block: "start" })); await page.evaluate(() => scrollBy(0, -120)); await wait(1200);
  await move(1880, 1060, 10);
  await rec("meta", async (mark) => {
    const g = await center(".ab-meta", null, .5, .35);
    if (g) await zoom(g.x, g.y, 1.06, 1500);
    await callout("fx1", `Every agent: ${G}Muse Glimmer${E}, open weights on our own GPU`, 80, 110); mark("glimmer"); await wait(5600);
    await resetFx(); await wait(400);
    const v = await center(".ab-meta", null, .66, .4);
    if (v) await zoom(v.x, v.y, 1.08, 1500);
    await callout("fx2", `${G}DETR, Sapiens2, SAM 2.1${E} read the video · ${G}Messenger, Instagram, Facebook${E}`, 80, 110); mark("vision"); await wait(5200);
    await resetFx();
    await scrollEl(".ab-beyond", "center", 1300); mark("beyond");
    const y = await center(".ab-beyond");
    if (y) await zoom(y.x, y.y, 1.12, 1300);
    await wait(3600);
  });
  await resetFx();
}
if (run("tech")) {
  await go("about", 2500);
  await page.evaluate(() => document.querySelector(".ab-arch")?.scrollIntoView({ block: "start" })); await page.evaluate(() => scrollBy(0, -30)); await wait(1200);
  await move(1880, 1060, 10);
  await rec("tech", async (mark) => {
    await wait(1800); mark("whole");
    const z = await center(".ab-arch svg", null, .47, .32);
    if (z) await zoom(z.x, z.y, 1.22, 1600);
    await callout("fx1", `Agents in one gateway, ${G}four Muse Glimmer calls at once${E}`, 80, 110); mark("agents"); await wait(3400);
    await resetFx(); await wait(300);
    const v = await center(".ab-arch svg", null, .45, .82);
    if (v) await zoom(v.x, v.y, 1.22, 1600);
    await callout("fx2", `${G}Checked by code${E}: numbers, quotes, tool calls`, 80, 120); mark("verify"); await wait(3400);
    await resetFx();
    await scrollEl(".ab-nums", "center", 1300); mark("nums");
    const n = await center(".ab-nums");
    if (n) await zoom(n.x, n.y, 1.15, 1300);
    await wait(3200);
  });
  await resetFx();
}

// the 24-hour coach in Messenger: the end-to-end test's real conversation, on a phone
if (run("pocket")) { await page.goto("file:///" + path.join(SCENES, "pocket.html").replace(/\\/g, "/")); await page.mouse.move(-10, -10); await rec("pocket", () => wait(18000)); }

// the highlight reel: asked on the agent home, drawn from Sapiens2 pose and SAM 2.1 outlines, the smash replayed in slow
// motion, captioned by Muse Glimmer, then shared
if (run("highlight")) {
  await go("", 1500);
  await rec("highlight", async (mark) => {
    await click(".ideas .chip", "highlight reel", 900); mark("asked");
    await page.waitForFunction(() => location.hash.includes("auto=1"), { timeout: 15000 });
    await wait(1200);
    await scrollEl(".hl-grid", "start", 1200); mark("cutting");
    await callout("fx1", `Players read by ${G}Sapiens2${E} and ${G}SAM 2.1${E} · no footage of anyone`, 80, 110);
    // the first rally's smash replay, at real speed and pushed in on the reel
    await page.waitForFunction(() => document.querySelector("canvas.hl-canvas")?.dataset.phase === "replay", { timeout: 180000, polling: 50 }); mark("replay");
    await uncall("fx1");
    const cv = await center("canvas.hl-canvas", null, .5, .41); // the picture, between the reel's titles and its stats
    if (cv) await zoom(cv.x, cv.y, 1.55, 1000);
    await callout("fx2", `The smash, in ${G}slow motion${E}`, 80, 110);
    await page.waitForFunction(() => document.querySelector("canvas.hl-canvas")?.dataset.phase === "winner", { timeout: 60000, polling: 50 }); mark("replayed");
    await wait(900);
    await resetFx();
    await page.waitForFunction(() => document.querySelector(".hl-done"), { timeout: 300000 }); mark("ready");
    await page.waitForFunction(() => !/writing the caption/.test(document.querySelector(".hl-cap-by")?.innerText || "writing the caption"), { timeout: 120000 });
    await scrollEl(".hl-done", "center", 1000); mark("caption");
    const t = await center(".hl-done textarea");
    if (t) await zoom(t.x, t.y, 1.2, 1500);
    await callout("fx2", `Caption by Muse Glimmer · ${G}every number checked${E}`, 80, 110); await wait(3200);
    await resetFx(); mark("share");
    const ig = await at(".share-ig");
    await move(ig.x, ig.y, 900);
    await zoom(ig.x, ig.y, 1.3, 1300);
    await callout("fx3", `One tap to ${G}Instagram${E} or ${G}Facebook${E}`, 80, 110); await wait(3400);
  });
  await resetFx();
}

if (run("end")) { await page.goto("file:///" + path.join(SCENES, "endcard.html").replace(/\\/g, "/")); await page.mouse.move(-10, -10); await rec("end", () => wait(8500)); }

await browser.close();
