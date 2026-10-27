import { useEffect, useState } from "react";
import Court3D from "../components/Court3D.jsx";
import Architecture from "../components/Architecture.jsx";
import Icon from "../components/Icon.jsx";
import { go } from "../App.jsx";
import { useReducedMotion } from "../hooks.js";
import "./about.css";

// About Serve, in the order the judges score it: the impact (the pain and what Serve does about it), the Meta AI it is
// built on (each model and product, and its job), and the technical build (the architecture, the checks, the numbers).
const PAINS = [
  ["Playing takes organizing", "A time that suits four people, a free court, somewhere everyone can reach. The group chat goes quiet and nobody plays.", "Your agent lines up the week and agrees every game with the other players' agents. You only say yes.", "autopilot"],
  ["Nobody pushes you", "One missed week becomes a month. Apps count steps; none of them books your next game.", "It learns when you usually play and who you play best with, nudges you before your usual time and runs your week every Monday.", "home"],
  ["Life gets in the way", "A sore knee, a heavy week, rain on an outdoor court: the plan doesn't change, so you skip it.", "Tell it what hurts and share your health app: it plans doubles, shorter games or one game fewer, and checks the courts, the reviews and the weather.", "body"],
  ["Playing is better together", "The best part of a game is the people, and showing it off afterwards.", "A club with a leaderboard, challenges and your best match; a highlight reel of you, in any ball sport, ready for Instagram.", "club"],
];
const META = [
  ["Muse Glimmer", "Open weights · Ollama on our own RTX 3090 · 4 requests at once", ["The Autopilot's tool loop (native tool calling)", "Every agent-to-agent message; every member's agent answers in parallel", "Reading what hurts into the body log (a tool call)", "Judging courts from map tags, reviews and the forecast", "The body report, captions, place names in English"]],
  ["Sapiens2", "Pose · Hugging Face · GPU 0", ["Reads every player's pose on every frame of your video", "Finds the moment: your fastest swing, the top of your jump, your kick"]],
  ["SAM 2.1", "Segmentation · Hugging Face · GPU 0", ["Cuts each player out of the frame for the reel's spotlight"]],
  ["DETR", "Detection · Hugging Face · GPU 0", ["Finds the people in your own video, so the reel follows you"]],
  ["Messenger Platform", "Meta for Developers", ["Your agent in your chats: it plans the week, you approve with a tap", "Check-ins two days after something hurts; share a health export to the chat"]],
  ["Instagram and Facebook", "Sharing", ["Your reel, with a caption Muse Glimmer wrote and code checked against the rallies"]],
];
const BEYOND = [
  ["An agent, not a chatbot", "Muse Glimmer picks the next tool, code runs it and hands back the facts, until the week is planned. A step budget, and rules finish the plan if the model stalls."],
  ["Many agents at once", "Your agent negotiates with three players' agents for a doubles game; they answer together, on four parallel slots of one GPU."],
  ["Checked before you see it", "Every number must be in the data it came from, a quoted review must be in that review, and every time, court and trip is computed by code."],
  ["On hardware you own", "Open weights on our own GPUs: your video, your body log and your health data stay on your server."],
];

export default function Landing({ data }) {
  const rally = data?.rally;
  const still = useReducedMotion();
  const [ev, setEv] = useState(null);
  useEffect(() => { fetch("/data/agent_eval.json").then((r) => (r.ok ? r.json() : null)).then(setEv).catch(() => {}); }, []);
  return (
    <div className="landing about">
      <section className="hero">
        <Court3D rally={rally} loop={!still} frame={rally ? rally.n - 1 : 0} autoRotate={!still} variant="hero" className="hero-court" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">Play more. Manage less.</p>
          <h1 className="display">Serve</h1>
          <p className="lead">The sports club app with an agent that gets you playing. It lines up your games with the people you play best with, agrees them with their agents, plans around your body and finds a court in any sport. You just say yes.</p>
          <div className="cta-row">
            <button className="btn primary" onClick={() => go("autopilot")}>Watch it plan a week</button>
            <button className="btn ghost" onClick={() => go("")}>Talk to your agent</button>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="ab-impact">
        <header className="sec-head">
          <h2 id="ab-impact"><span className="ab-rub">Impact</span>Playing takes organizing, so people stop</h2>
          <p className="muted">31% of adults worldwide did not get enough physical activity in 2022 (World Health Organization, 2024). Most people who stop playing a sport don't stop liking it; they stop organizing it. Serve takes the organizing off them, and keeps pushing.</p>
        </header>
        <ol className="ab-pains">
          {PAINS.map(([h, pain, fix, to]) => (
            <li key={h}>
              <h3>{h}</h3>
              <p className="ab-pain">{pain}</p>
              <p className="ab-fix"><Icon name="spark" size={16} /><span>{fix}</span></p>
              <a className="btn sm ghost" href={`#/${to === "home" ? "" : to}`}>See it</a>
            </li>
          ))}
        </ol>
        <p className="ab-who">For anyone who plays a ball sport for fun, and the clubs and friends they play with: badminton, tennis, pickleball, table tennis, basketball, volleyball, soccer.</p>
      </section>

      <section className="band" aria-labelledby="ab-meta">
        <header className="sec-head">
          <h2 id="ab-meta"><span className="ab-rub">Meta AI</span>What it is built on</h2>
          <p className="muted">Every agent in Serve runs on Muse Glimmer, Meta's open-weights model, on our own GPU. Meta's vision models read your video. Messenger, Instagram and Facebook are where it meets your friends.</p>
        </header>
        <div className="ab-meta">
          {META.map(([name, where, jobs]) => (
            <article key={name} className="ab-model">
              <h3>{name}</h3>
              <p className="tiny muted">{where}</p>
              <ul>{jobs.map((j) => <li key={j}>{j}</li>)}</ul>
            </article>
          ))}
        </div>
        <ul className="ab-beyond">
          {BEYOND.map(([h, b]) => <li key={h}><b>{h}</b><span>{b}</span></li>)}
        </ul>
      </section>

      <section className="band" aria-labelledby="ab-tech">
        <header className="sec-head">
          <h2 id="ab-tech"><span className="ab-rub">Technical</span>How it works</h2>
          <p className="muted">One gateway on your GPU server runs the agents; Muse Glimmer and the vision models run on its two GPUs; everything the models say passes code checks first.</p>
        </header>
        <figure className="ab-arch">
          <Architecture />
          <figcaption className="tiny muted">The app and Messenger stream every agent step as it happens. Arrows show what calls what.</figcaption>
        </figure>
        {ev && (
          <dl className="ab-nums" aria-label="Measured on our server">
            <div><dt>Autopilot weeks planned</dt><dd>{ev.ok} of {ev.runs}</dd><span className="tiny muted">reached the goal, every agent agreeing</span></div>
            <div><dt>Time for a week</dt><dd>{Math.round(ev.seconds)} s</dd><span className="tiny muted">on average, end to end</span></div>
            <div><dt>Muse Glimmer calls</dt><dd>{Math.round(ev.modelCalls)}</dd><span className="tiny muted">a week, up to {ev.peak} at once</span></div>
            <div><dt>Tool calls</dt><dd>{Math.round(ev.toolCalls)}</dd><span className="tiny muted">a week, every one run and checked by code</span></div>
          </dl>
        )}
        <ul className="ab-beyond tech">
          <li><b>Agents</b><span>Autopilot tool loop with 8 tools; agent-to-agent engine with parallel member agents, checked counter-offers and a memory of what each agent accepts; body log with load, limits and check-ins; courts judged from three sources.</span></li>
          <li><b>Vision</b><span>DETR, Sapiens2 and SAM 2.1, batched in bf16 on one GPU; sport-aware moments: a racket's fastest swing, a jump's peak, a kick.</span></li>
          <li><b>Data</b><span>Apple Health, Google Fit, GPX, TCX and CSV read on your server and deleted; workouts linked to booked games; OpenStreetMap, Open-Meteo, and Google Places when keyed.</span></li>
          <li><b>Safety</b><span>Nothing is booked without your yes. The body log records; it never diagnoses, and it says when to see a physio.</span></li>
        </ul>
      </section>

      <footer className="foot">
        <span>Serve · Meta Global AI Developer Hackathon 2026 · every agent runs on Muse Glimmer, Meta's open-weights model, on our own GPU</span>
        <span className="muted">Demo club, venues and players are sample data; courts and parks are real places from OpenStreetMap.</span>
      </footer>
    </div>
  );
}
