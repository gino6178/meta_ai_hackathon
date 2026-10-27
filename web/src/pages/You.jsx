import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import { loadMatches } from "../match/analytics.js";
import { memory } from "../memory.js";
import { readGame } from "../club/game.js";
import { useTasks } from "../tasks.js";

// You: the profile. Your matches and everything measured from them, your games, what the coaches remember.
export default function You({ data }) {
  const tasks = useTasks();
  const [m, setM] = useState(null);
  useEffect(() => { loadMatches().then((d) => setM(d.matches[0])); }, []);
  const g = readGame();
  const games = (g.activity || []).filter((a) => a.kind === "game").length;
  const sets = m ? [1, 2, 3].map((s) => m.rallies.filter((r) => r.set === s).pop()).filter(Boolean).map((r) => `${r.score[0]}–${r.score[1]}`) : [];
  const notes = memory.all().length;
  const booked = tasks.filter((t) => t.kind === "play" && t.booking && t.booking.state !== "cancelled");
  const VIEWS = [
    ["match", "Analysis", "Points, patterns, footwork and fatigue", "match"],
    ["report", "Rally 3D", "The shuttle's flight, every hit, in metric 3D", "spark"],
    ["scout", "Scouting report", "Your next opponent's habits", "goals"],
    ["match?tab=reel", "Highlights", "Your top rallies as a vertical video", "play"],
    ["live", "Live court side", "Briefings between points", "live"],
  ];
  return (
    <div className="page you">
      <header className="you-head">
        <span className="mav you you-av" aria-hidden="true">You</span>
        <div>
          <h1 className="h1">You</h1>
          <p className="muted">Level B · Riverside Badminton Club</p>
          <dl className="you-stats">
            <div><dd>1</dd><dt>match</dt></div>
            <div><dd>{games}</dd><dt>{games === 1 ? "game booked" : "games booked"}</dt></div>
            <div><dd>{notes}</dd><dt>{notes === 1 ? "note to the coaches" : "notes to the coaches"}</dt></div>
          </dl>
        </div>
        <a className="btn primary" href="#/analyze"><Icon name="plus" size={18} />Analyze a video</a>
      </header>

      <section aria-labelledby="m-h" className="you-sec">
        <h2 id="m-h" className="sec-label">Your matches</h2>
        <article className="panel match-card">
          <header>
            <span className="tag">{data?.event ?? ""}</span>
            <b className="match-names">{data?.players.near ?? ""} <span className="vs">vs</span> {data?.players.far ?? ""}</b>
            {sets.length > 0 && <span className="muted small">{sets.join(" · ")}</span>}
          </header>
          <ul className="view-grid">
            {VIEWS.map(([k, l, note, ic]) => <li key={k}><a href={`#/${k}`}><Icon name={ic} size={22} /><span><b>{l}</b><span className="tiny muted">{note}</span></span></a></li>)}
          </ul>
        </article>
      </section>

      {booked.length > 0 && (
        <section aria-labelledby="g-h" className="you-sec">
          <h2 id="g-h" className="sec-label">Your games</h2>
          <ul className="you-games">
            {booked.slice(0, 4).map((t) => { const o = t.booking.option; return (
              <li key={t.id}><a href={`#/${t.href}`}><b>{o.day} {o.start} · {o.format}</b><span className="tiny muted">{o.venue.name}, court {o.court} · {t.booking.state === "confirmed" ? "game on" : t.booking.state}</span></a></li>
            ); })}
          </ul>
        </section>
      )}

      <section aria-labelledby="o-h" className="you-sec">
        <h2 id="o-h" className="sec-label">Your data</h2>
        <ul className="view-grid plain">
          <li><a href="#/body"><Icon name="heart" size={22} /><span><b>Body log</b><span className="tiny muted">What hurts, your health app, your trail and report</span></span></a></li>
          <li><a href="#/memory"><Icon name="memory" size={22} /><span><b>Player memory</b><span className="tiny muted">What the coaches remember, and what to forget</span></span></a></li>
          <li><a href="#/lab"><Icon name="verify" size={22} /><span><b>Lab</b><span className="tiny muted">How the coaches improve, with your approval</span></span></a></li>
          <li><a href="#/about"><Icon name="info" size={22} /><span><b>About Serve</b><span className="tiny muted">How it works and what stays private</span></span></a></li>
        </ul>
      </section>
    </div>
  );
}
