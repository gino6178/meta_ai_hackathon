import { useEffect, useState } from "react";
import { loadMatches, profile, patterns, footwork, sideOf } from "../match/analytics.js";
import CourtMap, { heatGrid } from "../components/CourtMap.jsx";
import { zoneRect } from "../coaches/analysis.js";
import { MatchNav } from "../App.jsx";

// One-page scouting report on an opponent across every analysed match; "Save as PDF" uses the browser's print dialog.
export default function Scout() {
  const [d, setD] = useState(null);
  const [name, setName] = useState("WANG Po Wei");
  useEffect(() => { loadMatches().then(setD); }, []);
  if (!d) return <div className="page"><p className="muted">Loading…</p></div>;
  const players = [...new Set(d.matches.flatMap((m) => Object.values(m.names)))];
  const ms = d.matches.filter((m) => sideOf(m, name)).map((m) => {
    const p = sideOf(m, name);
    return { m, p, pr: profile(m, p), pt: patterns(m, p), fw: footwork(m, p), opp: m.names[p === "A" ? "B" : "A"] };
  });
  const land = ms.flatMap((x) => x.pr.land.map((l) => l.xy)), beaten = ms.flatMap((x) => x.pr.beaten.map((l) => l.xy));
  const sum = (f) => ms.reduce((a, x) => a + f(x), 0);
  const won = sum((x) => x.pr.won), lost = sum((x) => x.pr.lost);
  const mixAll = {};
  ms.forEach((x) => x.pr.mix.forEach((r) => (mixAll[r.t] = (mixAll[r.t] || 0) + r.p / ms.length)));
  const mix = Object.entries(mixAll).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const weak = ms[0].pr.weak[0], target = ms[0].pr.targets[0];
  const bestPat = ms.flatMap((x) => x.pt.best).sort((a, b) => b.w - a.w)[0];
  const worstPat = ms.flatMap((x) => x.pt.worst).sort((a, b) => a.w - b.w)[0];
  const stretch = ms[0].fw.byType[0];

  return (
    <div className="page scout">
      <MatchNav page="scout" />
      <header className="report-head noprint">
        <div>
          <span className="tag">Scouting report</span>
          <h1 className="h1">Know the opponent before you play</h1>
          <p className="muted">Pick a player. The one-page report is built from every labelled shot they hit, and prints as a PDF.</p>
        </div>
        <div className="cta-row">
          <div className="seg" role="radiogroup" aria-label="Player">
            {players.map((n) => <button key={n} role="radio" aria-checked={name === n} onClick={() => setName(n)}>{n}</button>)}
          </div>
          <a className="btn ghost" href={`#/play?q=${encodeURIComponent(`Sparring with someone who plays like ${name}`)}`}>Find a sparring partner like {name.split(" ")[0]}</a>
          <button className="btn primary" onClick={() => window.print()}>Save as PDF</button>
        </div>
      </header>
      <article className="sheet">
        <header>
          <span className="tag">ShuttleCoach · scouting report</span>
          <h2 className="sheet-title">{name}</h2>
          <p className="muted">{ms.map((x) => `${x.m.event} vs ${x.opp}`).join(" · ")} · {sum((x) => x.pr.shots)} shots analysed on-device</p>
        </header>
        <div className="sheet-kpis">
          <div><b>{Math.round(100 * won / (won + lost))}%</b><span>points won</span></div>
          <div><b>{sum((x) => x.pr.winners)}</b><span>winners</span></div>
          <div><b>{sum((x) => x.pr.errors)}</b><span>own errors</span></div>
          <div><b>{Math.round(sum((x) => x.pr.attackShare) / ms.length)}%</b><span>attacking shots</span></div>
          <div><b>{(sum((x) => x.pr.avgRally) / ms.length).toFixed(1)}</b><span>shots per rally</span></div>
        </div>
        <div className="sheet-grid">
          <section className="plan-first">
            <h2>Game plan against {name.split(" ")[0]}</h2>
            <ol className="plan">
              <li>Attack the <b>{weak?.[0] ?? "rear court"}</b>: that is where their defence breaks most.</li>
              <li>Expect most replies into the <b>{target?.[0]}</b>; start your recovery toward it.</li>
              {worstPat && <li>Draw them into <b>{worstPat.k}</b>; they win only {worstPat.w}% of those rallies.</li>}
              {stretch && <li>Use the <b>{stretch.t.toLowerCase()}</b> to move them: it needs {stretch.v.toFixed(1)} m/s to cover.</li>}
              <li>{ms[0].pr.serveShort}% short serves: stand ready for the short serve and attack the net.</li>
            </ol>
          </section>
          <section>
            <h2>Where the shots go</h2>
            <CourtMap half="far" heat={heatGrid(land, "far", .55)} heatColor="var(--heat-attack)" label="Landing heat"
              blink={target ? [{ ...zoneRect(target[0], "far"), c: "var(--sp3)", label: "1" }] : null} />
            <p>Favourite target: <b>{target?.[0]}</b>, read from the receiver's side.</p>
          </section>
          <section>
            <h2>Where they get beaten</h2>
            <CourtMap half="near" heat={heatGrid(beaten, "near", .6)} heatColor="var(--heat-defence)" label="Points lost to winners"
              blink={weak ? [{ ...zoneRect(weak[0], "near"), c: "var(--heat-defence)", label: "!" }] : null} />
            <p>Weakest zone: <b>{weak?.[0] ?? "–"}</b> ({weak?.[1] ?? 0} winners conceded there).</p>
          </section>
          <section>
            <h2>Shot mix</h2>
            <ul className="bars">{mix.map(([t, p]) => <li key={t}><span>{t}</span><i style={{ width: `${Math.min(100, (p / mix[0][1]) * 100)}%` }} /><b className="mono">{Math.round(p)}%</b><em /></li>)}</ul>
            <h2>Patterns</h2>
            <p>Best for them: <b>{bestPat?.k}</b> ({bestPat?.w}% rallies won).<br />Worst for them: <b>{worstPat?.k}</b> ({worstPat?.w}%).</p>
          </section>
        </div>
        <footer className="tiny muted">Generated on this device from shot-level match data. Zones: front / mid / rear × forehand / middle / backhand for a right-handed receiver.</footer>
      </article>
    </div>
  );
}
