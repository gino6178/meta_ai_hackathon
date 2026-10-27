import Court3D from "../components/Court3D.jsx";
import { go } from "../App.jsx";
import { COACHES } from "../coaches/personas.js";
import Avatar from "../coaches/Avatar.jsx";
import { useReducedMotion } from "../hooks.js";

const STEPS = [
  ["01", "Record", "Any fixed camera behind the court. A phone on a tripod is enough."],
  ["02", "Reconstruct", "The shuttle's flight in metric 3D, every hit, both players' positions."],
  ["03", "Measure", "Launch speed, apex, landing zone and stroke type for every shot."],
  ["04", "Coach", "Four coach agents explain the numbers, then meet at a round table to agree your week."],
];

export default function Landing({ data }) {
  const rally = data?.rally;
  const top = rally ? Math.max(...rally.strokes.map((s) => s.v0)) : 200;
  const apex = rally ? Math.max(...rally.strokes.map((s) => s.apex)) : 4.65;
  const still = useReducedMotion();
  return (
    <div className="landing">
      <section className="hero">
        <Court3D rally={rally} loop={!still} frame={rally ? rally.n - 1 : 0} autoRotate={!still} variant="hero" className="hero-court" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow">Private badminton intelligence</p>
          <h1 className="display">Shuttle<br />Coach</h1>
          <p className="lead">One camera in. A coaching staff out. Every frame, every 3D flight and every word of advice is computed on hardware you own.</p>
          <div className="cta-row">
            <button className="btn primary" onClick={() => go("analyze")}>Analyze a match</button>
            <button className="btn ghost" onClick={() => go("coaches")}>Meet the coaches</button>
          </div>
        </div>
        <dl className="hud hud-right" aria-label="Sample rally telemetry">
          <div><dt>Peak launch</dt><dd>{Math.round(top)} <small>km/h</small></dd></div>
          <div><dt>Highest apex</dt><dd>{apex.toFixed(2)} <small>m</small></dd></div>
          <div><dt>Shots</dt><dd>{rally?.strokes.length ?? 9}</dd></div>
          <div><dt>Network</dt><dd className="ok">none</dd></div>
        </dl>
        <p className="hud hud-left">Live 3D reconstruction · sample rally · {data?.event ?? ""}</p>
      </section>

      <section className="band">
        <header className="sec-head"><h2>From a phone video to a training plan</h2></header>
        <ol className="steps">
          {STEPS.map(([n, h, b]) => (
            <li key={n}><span className="mono step-n">{n}</span><h3>{h}</h3><p>{b}</p></li>
          ))}
        </ol>
      </section>

      <section className="band">
        <header className="sec-head"><h2>Four coaches and a round table, running locally</h2>
          <p className="muted">Every coach is Muse Glimmer, Meta's open-weights model, on a GPU you own. Your match data and your memory never leave it.</p></header>
        <div className="staff-row">
          {COACHES.map((c) => (
            <button key={c.id} className="staff-card" style={{ "--cc": c.color }} onClick={() => go(`coach/${c.id}`)}>
              <Avatar coach={c} size={72} />
              <span className="tag">{c.kicker}</span>
              <h3>{c.name}</h3>
              <p>{c.blurb}</p>
            </button>
          ))}
          <button className="staff-card rt" onClick={() => go("roundtable")}>
            <span className="rt-faces">{COACHES.map((c) => <Avatar key={c.id} coach={c} size={40} />)}</span>
            <span className="tag">Round table</span>
            <h3>Agree the week</h3>
            <p>All four debate the match against your memory and agree four goals and a 7-day schedule.</p>
          </button>
        </div>
      </section>

      <section className="band split play-band">
        <header className="sec-head"><h2>Want to play? Say it, and the agent books it.</h2>
          <p className="muted">Booking a court and lining up a time with friends is why most games never happen. Tell ShuttleCoach "doubles on Thursday evening" or "someone who plays like my next opponent". Muse Glimmer reads it; the agent finds a free court and club members who are free and fit your game, writes the invites, and follows up until the game is on. Nothing is booked until you say yes.</p>
          <div className="cta-row"><button className="btn primary" onClick={() => go("play")}>Find a game</button><button className="btn ghost" onClick={() => go("club")}>See the club</button></div></header>
        <ol className="steps play-steps">
          {[["Say it", "Doubles on Thursday evening, with Hana."], ["Court and people", "A free court, and members who are free, at your level, who attack the zone you need to defend."], ["You confirm", "Court held, invites sent; if someone can't make it, the next best player is asked."], ["Game on", "Calendar, the group chat, a warm-up from Coach Ren, and XP in the club league."]].map(([h, b], i) => (
            <li key={h}><span className="mono step-n">{String(i + 1).padStart(2, "0")}</span><h3>{h}</h3><p>{b}</p></li>
          ))}
        </ol>
      </section>

      <section className="band split">
        <header className="sec-head"><h2>Advice is tested before it is given</h2>
          <p className="muted">Opponent styles are learned from professional rallies. Move your base, replay thousands of rallies, keep the change only if fewer points are lost.</p>
          <button className="btn ghost" onClick={() => go("report")}>Try it on the sample match</button></header>
        <div className="privacy">
          <h3>Private by design</h3>
          <ul>
            <li><b>Offline.</b> No account, no cloud API. Unplug the network and it still works.</li>
            <li><b>Your video stays here.</b> Files are opened by the browser; nothing is uploaded.</li>
            <li><b>Share insights, not footage.</b> Reports contain numbers and drawings only.</li>
          </ul>
        </div>
      </section>

      <footer className="foot">
        <span>ShuttleCoach · Meta Global AI Developer Hackathon 2026 · coaches run on Muse Glimmer, Meta's open-weights model, on your own GPU</span>
        <span className="muted">Prototype: coach briefings are generated from the precomputed match data; coach chat runs live on Muse Glimmer.</span>
      </footer>
    </div>
  );
}
