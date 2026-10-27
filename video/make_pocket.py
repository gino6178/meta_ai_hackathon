"""Build scenes/pocket.html, your agent in Messenger, from the end-to-end test's real conversation
(agent/test/e2e.mjs on the GPU server writes the transcript). Fact tags like [F12] are taken out of the bubbles; the
words are the coaches' own.
  python make_pocket.py build/pocket_transcript.json"""
import json, re, sys, html, os

HERE = os.path.dirname(os.path.abspath(__file__))
t = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "build", "pocket_transcript.json"), encoding="utf-8"))
clean = lambda s: re.sub(r"\s*\[(?:F|E)\d+\]", "", s).replace("·", "·").replace(" (training)", "").strip()
coach = [x["text"] for x in t if x["from"] in ("agent", "coach")]
player = [x["text"] for x in t if x["from"] == "player"]
find = lambda pred: next(x for x in coach if pred(x))

# the Autopilot's week, booked with a tap; what hurts, filed; a health export shared to the chat; the check-in after
onit = find(lambda x: x.startswith("On it"))
ask = next(x for x in t if x["from"] in ("agent", "coach") and x.get("buttons") and "Book" in " ".join(x["buttons"]))
booked = find(lambda x: x.startswith("Booked:"))
coming = find(lambda x: x.startswith("Coming up"))
hurt_said = next(x for x in player if "knee is sore" in x)
hurt = find(lambda x: x.startswith("Logged: right knee") and "doubles" in x)
read = find(lambda x: x.startswith("Read your"))
checkin = next(x for x in t if x["from"] in ("agent", "coach") and x["text"].startswith("How is your"))
after = [x for x in coach if x.startswith("Logged: right knee")][-1]
# the first n lines of a message, as bubble HTML
first = lambda s, n=2: "<br>".join([html.escape(l) for l in clean(s).split("\n") if l.strip()][:n])

S = [
    (300, "me", html.escape(next(x for x in player if x.startswith("Line up")))),
    (1000, "bot", html.escape(clean(onit).split(". I'll")[0] + "."), 0),
    (2600, "bot", first(ask["text"], 4), None, ask["buttons"]),
    (4300, "me", html.escape(ask["buttons"][0])),
    (5000, "bot", first(booked, 3)),
    (6300, "me", html.escape(hurt_said)),
    (7100, "bot", first(hurt, 2), 1),
    (8500, "me", "📎 serve_sample_health_export.zip"),
    (9300, "bot", html.escape(clean(read).split("\n")[0]), 2),
    (10800, "day", "Two days later"),
    (11100, "bot", html.escape(checkin["text"]), None, checkin["buttons"]),
    (12400, "me", html.escape(checkin["buttons"][1])),
    (13000, "bot", first(after, 1)),
]

page = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Messenger scene</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1920px; height: 1080px; background: #fff; color: #0a0a0b; font: 400 20px/1.4 system-ui, "Segoe UI", sans-serif; overflow: hidden; }
  .wash { position: absolute; inset: 0; background: radial-gradient(ellipse at 28% 50%, rgba(8, 102, 255, .10), transparent 55%), radial-gradient(ellipse at 80% 40%, rgba(10, 127, 68, .08), transparent 55%); }
  .phone { position: absolute; left: 300px; top: 50px; width: 480px; height: 980px; border-radius: 60px; background: #0a0a0b; padding: 14px; box-shadow: 0 40px 120px rgba(0, 0, 0, .25); }
  .screen { width: 100%; height: 100%; border-radius: 47px; background: #fff; overflow: hidden; display: flex; flex-direction: column; }
  .bar { height: 40px; flex: none; }
  .head { height: 74px; display: flex; align-items: center; gap: 12px; padding: 0 18px; border-bottom: 1px solid #e5e5ea; flex: none; }
  .head .back { color: #0866FF; font-size: 30px; line-height: 1; }
  .ava { width: 44px; height: 44px; border-radius: 50%; background: #f2f2f3; display: grid; place-items: center; }
  .ava svg { width: 26px; height: 26px; fill: none; stroke: #0a0a0b; stroke-width: 5.5; stroke-linecap: round; }
  .ava svg circle { fill: #0a7f44; stroke: none; }
  .head b { display: block; font-size: 18px; } .head span { display: block; font-size: 14px; color: #65656c; }
  .head .ms { margin-left: auto; width: 30px; height: 30px; }
  .log { flex: 1; padding: 12px 14px; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; overflow: hidden; }
  .msg { max-width: 82%; padding: 9px 14px; border-radius: 20px; font-size: 16px; line-height: 1.35; opacity: 0; transform: translateY(12px); transition: opacity .35s, transform .35s; }
  .msg.on { opacity: 1; transform: none; }
  .me { align-self: flex-end; background: #0866FF; color: #fff; border-bottom-right-radius: 6px; }
  .bot { align-self: flex-start; background: #f0f0f2; color: #0a0a0b; border-bottom-left-radius: 6px; }
  .bot b { font-weight: 700; }
  .more { color: #0866FF; font-weight: 600; }
  .typing { align-self: flex-start; background: #f0f0f2; border-radius: 20px; padding: 12px 16px; display: flex; gap: 5px; }
  .typing i { width: 8px; height: 8px; border-radius: 50%; background: #9b9ba3; animation: blink 1s infinite; }
  .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes blink { 50% { opacity: .3; } }
  .qr { align-self: flex-start; display: flex; gap: 6px; opacity: 0; transition: opacity .35s; }
  .qr.on { opacity: 1; }
  .qr span { border: 1.5px solid #0866FF; color: #0866FF; border-radius: 999px; padding: 5px 12px; font-size: 14px; font-weight: 600; background: #fff; }
  .day { align-self: center; font-size: 13px; color: #65656c; padding: 6px 0; opacity: 0; transition: opacity .35s; }
  .day.on { opacity: 1; }
  .input { height: 58px; margin: 0 12px 14px; border-radius: 29px; background: #f0f0f2; color: #9b9ba3; display: flex; align-items: center; padding: 0 22px; font-size: 17px; flex: none; }
  .side { position: absolute; left: 900px; top: 200px; width: 860px; }
  .tag { display: flex; align-items: center; gap: 14px; font: 700 26px/1 system-ui, sans-serif; color: #0866FF; }
  .tag img { width: 44px; height: 44px; }
  h1 { font: 800 76px/1.04 system-ui, sans-serif; letter-spacing: -.04em; margin: 26px 0 48px; }
  .feat { display: flex; gap: 22px; align-items: center; margin-bottom: 22px; padding: 22px 26px; border-radius: 20px; background: #fff; border: 1px solid rgba(0, 0, 0, .1); box-shadow: 0 10px 30px rgba(0, 0, 0, .06); opacity: 0; transform: translateX(40px); transition: opacity .6s, transform .6s, border-color .6s, box-shadow .6s; }
  .feat.seen { opacity: .5; transform: none; }
  .feat.on { opacity: 1; transform: none; border-color: #0a7f44; box-shadow: 0 0 0 4px rgba(10, 127, 68, .14), 0 10px 30px rgba(0, 0, 0, .06); }
  .feat i { flex: none; width: 16px; height: 16px; border-radius: 50%; background: #0a7f44; box-shadow: 0 0 0 6px rgba(10, 127, 68, .18); }
  .feat b { display: block; font: 750 32px/1.2 system-ui, sans-serif; }
  .feat span { font-size: 23px; color: #3b3b40; }
  .note { position: absolute; left: 200px; top: 1040px; width: 680px; text-align: center; font-size: 15px; color: #65656c; }
</style></head>
<body>
<div class="wash"></div>
<div class="phone"><div class="screen">
  <div class="bar"></div>
  <div class="head"><span class="back">‹</span><div class="ava"><svg viewBox="0 0 64 64"><path d="M10 48 C 22 8, 42 8, 54 30" /><circle cx="54" cy="30" r="5" /></svg></div>
    <div><b>Serve</b><span>Your agent · active now</span></div><img class="ms" src="messenger.svg" alt=""></div>
  <div class="log" id="log"></div>
  <div class="input">Aa</div>
</div></div>
<div class="note">Real replies on Muse Glimmer through the Messenger webhook, from its end-to-end test</div>
<div class="side">
  <div class="tag"><img src="messenger.svg" alt="">Facebook Messenger</div>
  <h1>Your agent,<br>in Messenger</h1>
  <div class="feat" id="f0"><i></i><div><b>Your week, one tap</b><span>Agreed with the other players' agents first</span></div></div>
  <div class="feat" id="f1"><i></i><div><b>Tell it what hurts</b><span>Your games are planned around it</span></div></div>
  <div class="feat" id="f2"><i></i><div><b>Share your health app</b><span>Workouts filed, and a check-in two days later</span></div></div>
</div>
<script>
const S = __S__;
const log = document.getElementById("log");
const fit = () => { const used = () => [...log.children].reduce((s, c) => s + c.offsetHeight + 6, 0); while (used() > log.clientHeight - 16 && log.children.length > 1) log.removeChild(log.firstChild); };
const add = (el) => { log.appendChild(el); fit(); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on"))); };
for (const [t, kind, text, f, btns] of S) {
  if (kind === "bot") setTimeout(() => { const ty = document.createElement("div"); ty.className = "typing"; ty.innerHTML = "<i></i><i></i><i></i>"; ty.id = "ty"; add(ty); }, Math.max(0, t - 650));
  setTimeout(() => {
    document.getElementById("ty")?.remove();
    const el = document.createElement("div");
    el.className = kind === "day" ? "day" : `msg ${kind}`;
    el.innerHTML = text;
    add(el);
    if (btns) { const q = document.createElement("div"); q.className = "qr"; q.innerHTML = btns.map((b) => `<span>${b}</span>`).join(""); add(q); }
    if (f != null) document.querySelectorAll(".feat").forEach((x, i) => { x.classList.toggle("on", i === f); if (i <= f) x.classList.add("seen"); });
  }, t);
}
setTimeout(() => document.querySelectorAll(".feat").forEach((x) => x.classList.add("on", "seen")), 13800);
</script>
</body></html>
"""
S_js = json.dumps([[a, b, c] + ([d] if len(r) > 3 else []) + ([e] if len(r) > 4 else []) for r in S for (a, b, c, d, e) in [tuple(list(r) + [None] * (5 - len(r)))]], ensure_ascii=False)
open(os.path.join(HERE, "scenes", "pocket.html"), "w", encoding="utf-8", newline="\n").write(page.replace("__S__", S_js))
print("wrote scenes/pocket.html:", len(S), "items")
