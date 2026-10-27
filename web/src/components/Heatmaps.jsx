import { useMemo, useState } from "react";
import CourtMap, { heatGrid } from "./CourtMap.jsx";
import { COURT } from "../data.js";

// Zone names from the receiving player's own view (both assumed right-handed): on the near half the
// backhand side is image-left; on the far half the receiver faces the camera, so their backhand is image-right.
function zone([x, y], half) {
  const d = Math.abs(y - COURT.NET);
  const row = d < 2.2 ? "front" : d < 4.6 ? "mid" : "rear";
  const left = x < 2.2, right = x > 3.9;
  const col = !left && !right ? "middle" : (half === "near" ? left : right) ? "backhand" : "forehand";
  return `${row} ${col}`;
}

function top(arr, half, k = 3) {
  const m = {};
  arr.forEach((p) => { const z = zone(p.xy, half); m[z] = (m[z] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k);
}

const byType = (arr) => {
  const m = {}; arr.forEach((p) => (m[p.type] = (m[p.type] || 0) + 1));
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3);
};

export default function Heatmaps({ outcomes, names }) {
  const [who, setWho] = useState("A");
  const o = outcomes[who], opp = names[who === "A" ? "B" : "A"];
  const att = useMemo(() => heatGrid(o.attacks.map((p) => p.xy), "far"), [o]);
  const def = useMemo(() => heatGrid(o.beaten.map((p) => p.xy), "near", .6), [o]);
  const attWin = o.attacks.filter((p) => p.res === "winner").length;
  const attErr = o.attacks.filter((p) => p.res === "error").length;
  const tw = top(o.winners, "far"), tb = top(o.beaten, "near"), ta = top(o.attacks, "far");
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  return (
    <div className="heat">
      <div className="heat-bar">
        <div className="seg" role="radiogroup" aria-label="Player">
          {Object.entries(names).map(([k, n]) => (
            <button key={k} role="radio" aria-checked={who === k} onClick={() => setWho(k)}>{n}</button>
          ))}
        </div>
        <p className="muted small">Every shot of the match, from the label table and the court homography. Both maps are drawn from {names[who]}'s side of the net.</p>
      </div>
      <div className="heat-grid">
        <article className="panel">
          <header className="heat-h">
            <span className="tag">Attack heat zones</span>
            <h3>Where {names[who]}'s attacks land</h3>
          </header>
          <CourtMap half="far" heat={att} heatColor="#f2a33a" label="Attack landing density on the opponent's half"
            points={[
              ...o.errors.map((p) => ({ xy: p.xy, c: "var(--ink-3)", r: 2.6, o: .55 })),
              ...o.winners.map((p) => ({ xy: p.xy, c: "var(--accent)", ring: true, r: 6 })),
            ]} />
          <dl className="heat-kpi">
            <div><dt>Attacking shots</dt><dd className="mono">{o.attacks.length}</dd></div>
            <div><dt>Outright winners</dt><dd className="mono">{o.winners.length}</dd></div>
            <div><dt>Attack ends in error</dt><dd className="mono">{attErr}</dd></div>
          </dl>
          <ul className="heat-notes">
            <li><b>Hottest target:</b> {opp}'s {ta[0]?.[0]} ({ta[0]?.[1]} of {o.attacks.length} attacks)</li>
            <li><b>Winners landed in:</b> {tw.map(([z, n]) => `${z} (${n})`).join(", ") || "none"}</li>
            <li><b>Kill rate:</b> {pct(attWin, o.attacks.length)}% of attacks ended the rally as a winner</li>
          </ul>
          <p className="tiny muted"><i className="lg-heat a" /> attack density <i className="lg-ring" /> winner <i className="lg-dot" /> own error (out or net)</p>
        </article>

        <article className="panel">
          <header className="heat-h">
            <span className="tag def">Defence failure zones</span>
            <h3>Where {opp} beat {names[who]}</h3>
          </header>
          <CourtMap half="near" heat={def} heatColor="#ff5f56" label="Density of points lost to the opponent's winners"
            points={o.beaten.map((p) => ({ xy: p.xy, c: "#ffd0c9", r: 3.4, o: .9 }))} />
          <dl className="heat-kpi">
            <div><dt>Points lost to winners</dt><dd className="mono bad">{o.beaten.length}</dd></div>
            <div><dt>Own errors</dt><dd className="mono">{o.errors.length}</dd></div>
            <div><dt>Winners hit</dt><dd className="mono">{o.winners.length}</dd></div>
          </dl>
          <ul className="heat-notes">
            <li><b>Weakest zone:</b> {tb[0] ? `${tb[0][0]} (${tb[0][1]} of ${o.beaten.length})` : "none"}{tb[1] ? `, then ${tb[1][0]} (${tb[1][1]})` : ""}</li>
            <li><b>Beaten by:</b> {byType(o.beaten).map(([t, n]) => `${t.toLowerCase()} (${n})`).join(", ")}</li>
            <li><b>Balance:</b> {o.winners.length} winners hit vs {o.beaten.length} conceded</li>
          </ul>
          <p className="tiny muted"><i className="lg-heat d" /> where points were lost <i className="lg-dot l" /> landing of the opponent's winner</p>
        </article>
      </div>
    </div>
  );
}
