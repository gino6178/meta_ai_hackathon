import { useMemo, useState } from "react";
import CourtMap from "./CourtMap.jsx";
import { STYLES, bestBase, simulate } from "../data.js";

export default function Sparring({ shots, start }) {
  const [style, setStyle] = useState("attacker");
  const [base, setBase] = useState(start);
  const best = useMemo(() => bestBase(shots, style), [shots, style]);
  const cur = useMemo(() => simulate(shots, style, base), [shots, style, base]);
  // the grid search runs on a smaller sample; never show a "best" base that loses more than the current one
  const opt = useMemo(() => {
    const r = simulate(shots, style, best.base);
    return r.rate < cur.rate ? r : { ...cur, same: true };
  }, [shots, style, best, cur]);
  const pct = (v) => (v * 100).toFixed(1);
  return (
    <div className="sparring">
      <div className="sp-map">
        <CourtMap half="near" misses={cur.misses} label="Your half of the court with simulated lost shots"
          bases={[{ xy: best.base, c: "var(--good)", label: "best" }, { xy: base, c: "var(--accent)", label: "you" }]}
          onPick={(p) => setBase([Math.min(5.8, Math.max(.3, p[0])), Math.min(13.1, Math.max(7.0, p[1]))])} />
        <p className="tiny muted">Click the court to move your base. Red dots: shots you could not reach in time.</p>
      </div>
      <div className="sp-side">
        <div className="seg" role="radiogroup" aria-label="Opponent style">
          {Object.entries(STYLES).map(([k, s]) => (
            <button key={k} role="radio" aria-checked={style === k} onClick={() => setStyle(k)}>{s.label}</button>
          ))}
        </div>
        <div className="sp-kpis">
          <div><span>Your base</span><b className="mono">{pct(cur.rate)}%</b><small>attacking shots lost</small></div>
          <div className="good"><span>Best base</span><b className="mono">{pct(opt.rate)}%</b><small>{opt.same ? "your base is already the best found" : "after a 15 cm grid search"}</small></div>
        </div>
        <div className="sp-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${cur.rate})` }} className="you" />
          <i style={{ transform: `scaleX(${opt.rate})` }} className="best" />
        </div>
        <button className="btn ghost" onClick={() => setBase(best.base)}>Move to the best base</button>
        <p className="tiny muted">Opponent shots are resampled from this match's own {shots.length} attacking landings and flight times, weighted by style.
          Movement model: 0.25 s reaction, 4.2 m/s, 0.9 m reach. 2,000 simulated rallies per setting.</p>
      </div>
    </div>
  );
}
