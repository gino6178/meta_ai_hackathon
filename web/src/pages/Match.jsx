import { useEffect, useRef, useState } from "react";
import { loadMatches, scoreFlow, pointStats, patterns, footwork, fatigue, profile, sideOf, ownError, pct, load, onto } from "../match/analytics.js";
import { LineChart, Bars, Kpi } from "../match/charts.jsx";
import { retrieve } from "../memory.js";
import Highlights from "../match/Highlights.jsx";
import RallyClip from "../match/RallyClip.jsx";
import Annotator from "../match/Annotator.jsx";
import CourtMap, { heatGrid } from "../components/CourtMap.jsx";
import { go, MatchNav } from "../App.jsx";
import Icon from "../components/Icon.jsx";

const TABS = [["flow", "Score flow"], ["points", "Points won & lost"], ["patterns", "Shot sequences"], ["rallies", "Rallies & highlights"], ["reel", "Highlight reel"],
  ["footwork", "Footwork & reads"], ["fatigue", "Fatigue"], ["compare", "Match comparison"]];
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);

export default function Match() {
  const [d, setD] = useState(null);
  const tabOf = () => new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
  const [tab, setTab] = useState(() => tabOf() || "flow");
  // voice commands and links can switch tabs while the page is open
  useEffect(() => {
    const on = () => { const t = tabOf(); if (t) setTab(t); };
    addEventListener("hashchange", on); return () => removeEventListener("hashchange", on);
  }, []);
  const [who, setWho] = useState("A");
  const tabs = useRef(null);
  useEffect(() => { loadMatches().then(setD); }, []);
  if (!d) return <div className="page"><p className="muted">Loading the match…</p></div>;
  const m = d.matches[0];
  // arrow keys move between tabs, as in any tab strip
  const key = (e) => {
    const k = TABS.findIndex(([t]) => t === tab), n = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === "Home" || e.key === "End" || n) {
      e.preventDefault();
      const j = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (k + n + TABS.length) % TABS.length;
      setTab(TABS[j][0]); tabs.current?.children[j]?.focus();
    }
  };
  const perPlayer = ["points", "patterns", "reel", "footwork", "fatigue"].includes(tab);
  const closeMenu = (e) => { e.currentTarget.closest("details").open = false; };
  return (
    <div className="page match">
      <MatchNav page="match" />
      <header className="report-head">
        <div>
          <span className="tag">Match analysis · {m.event}</span>
          <h1 className="h1">{m.names.A} <span className="vs">vs</span> {m.names.B}</h1>
          <p className="muted">{m.rallies.length} labelled rallies, every shot with its type, landing spot and both players' positions. A few rallies are missing from the annotation.</p>
        </div>
        <div className="cta-row">
          <button className="btn primary" onClick={() => go("live")}><Icon name="live" size={18} />Live mode</button>
          <details className="export-menu">
            <summary className="btn ghost"><Icon name="download" size={18} />Export</summary>
            <div className="menu-pop" role="menu">
              <button role="menuitem" onClick={(e) => { exportShots(m, "csv"); closeMenu(e); }}><span><b>Shots as CSV</b><em>For a spreadsheet</em></span></button>
              <button role="menuitem" onClick={(e) => { exportShots(m, "json"); closeMenu(e); }}><span><b>Shots as JSON</b><em>For your own tools</em></span></button>
            </div>
          </details>
        </div>
      </header>
      <Decided m={m} />
      <div className="tabs-wrap">
        <div className="tabs" role="tablist" aria-label="Match analysis" ref={tabs} onKeyDown={key}>
          {TABS.map(([k, l]) => <button key={k} id={"tab-" + k} role="tab" aria-selected={tab === k} aria-controls="match-panel" tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <div id="match-panel" role="tabpanel" aria-labelledby={"tab-" + tab}>
        {perPlayer && (
          <div className="match-tools">
            <div className="seg" role="radiogroup" aria-label="Player">
              {["A", "B"].map((k) => <button key={k} role="radio" aria-checked={who === k} onClick={() => setWho(k)}>{m.names[k]}</button>)}
            </div>
          </div>
        )}
        {tab === "flow" && <Flow m={m} />}
        {tab === "points" && <Points m={m} p={who} />}
        {tab === "patterns" && <Patterns m={m} p={who} />}
        {tab === "rallies" && <Rallies m={m} />}
        {tab === "reel" && <Highlights m={m} p={who} />}
        {tab === "footwork" && <Footwork m={m} p={who} />}
        {tab === "fatigue" && <Fatigue m={m} p={who} />}
        {tab === "compare" && <Compare d={d} />}
      </div>
    </div>
  );
}

// one line on what decided the match, from the same point labels as the tabs below
function Decided({ m }) {
  const { sets } = scoreFlow(m);
  const g = { A: 0, B: 0 };
  Object.values(sets).forEach((rs) => { const l = rs[rs.length - 1]; g[l.score[0] > l.score[1] ? "A" : "B"]++; });
  const s = pointStats(m, "A"), sum = (a) => a.reduce((x, [, n]) => x + n, 0);
  const W = g.A >= g.B ? "A" : "B", L = W === "A" ? "B" : "A", first = (p) => m.names[p].split(" ")[0];
  return (
    <section className="decided" aria-label="What decided this match">
      <b>{m.names[W]} won {g[W]}–{g[L]}</b>
      <p>{first("A")} won {s.won} points and lost {s.lost}. {sum(s.oppErrors)} of those points came from {first("B")}'s errors and {sum(s.winners)} from {first("A")}'s own winners; {first("A")} gave away {sum(s.errorReasons)} with own errors.</p>
    </section>
  );
}

function Flow({ m }) {
  const { sets, runs } = scoreFlow(m);
  return (
    <section className="mgrid">
      {Object.entries(sets).map(([s, rs]) => {
        const last = rs[rs.length - 1];
        return (
          <div key={s} className="panel">
            <h3 className="panel-h">Game {s} · {last.score[0]}–{last.score[1]}</h3>
            <LineChart n={rs.length} label={`Score difference in game ${s}`} zero={0} yFmt={(v) => (v > 0 ? "+" : "") + v.toFixed(0)}
              series={[{ label: "diff", color: "var(--accent)", values: rs.map((r) => r.score[0] - r.score[1]), dots: true, dotColor: (i) => (rs[i].winner === "A" ? "var(--near)" : "var(--far)"), dotRing: (i) => rs[i].winner !== "A" }]} height={200} />
            <p className="chart-key"><span>Above zero: {m.names.A.split(" ")[0]} leads</span><span><i style={{ background: "var(--near)" }} />{m.names.A.split(" ")[0]} won the rally</span><span><i className="ring" style={{ borderColor: "var(--far)" }} />{m.names.B.split(" ")[0]} won it</span></p>
          </div>
        );
      })}
      <div className="panel">
        <h3 className="panel-h">Momentum</h3>
        <div className="kpis-sm">
          <Kpi v={runs.A} l={`longest run · ${m.names.A}`} /><Kpi v={runs.B} l={`longest run · ${m.names.B}`} />
          <Kpi v={`${pointStats(m, "A").clutchWin}%`} l={`${m.names.A} wins at 18+`} /><Kpi v={`${pointStats(m, "B").clutchWin}%`} l={`${m.names.B} wins at 18+`} />
        </div>
      </div>
    </section>
  );
}

function Points({ m, p }) {
  const s = pointStats(m, p), o = p === "A" ? "B" : "A";
  return (
    <section className="mgrid">
      <div className="panel span2">
        <div className="kpis-sm">
          <Kpi v={`${s.won}–${s.lost}`} l="points won–lost" /><Kpi v={s.winners.reduce((a, [, n]) => a + n, 0)} l="winners hit" />
          <Kpi v={s.errorReasons.reduce((a, [, n]) => a + n, 0)} l="own errors" tone="bad" /><Kpi v={s.oppErrors.reduce((a, [, n]) => a + n, 0)} l={`errors by ${m.names[o]}`} />
          <Kpi v={`${s.serveWin}%`} l="won on serve" /><Kpi v={`${s.recvWin}%`} l="won on receive" />
        </div>
      </div>
      <div className="panel"><h3 className="panel-h">How points were won</h3>
        <Bars rows={[...s.winners.map(([k, v]) => ({ k: `${k} winner`, v, c: "var(--good)" })), ...s.oppErrors.map(([k, v]) => ({ k: `opponent ${k}`, v }))]} /></div>
      <div className="panel"><h3 className="panel-h">How points were lost</h3>
        <Bars rows={[...s.oppWinners.map(([k, v]) => ({ k: `${k} by opponent`, v, c: "var(--bad)" })), ...s.errors.slice(0, 6).map(([k, v]) => ({ k, v, c: "var(--bad-2)" }))]} /></div>
      <div className="panel span2"><h3 className="panel-h">Win rate by rally length</h3>
        <Bars rows={s.byLen.map((b) => ({ k: b.b, v: b.w, note: `${b.n} rallies` }))} max={100} fmt={(v) => v + "%"} /></div>
    </section>
  );
}

function Patterns({ m, p }) {
  const t = patterns(m, p);
  const table = (rows, title) => (
    <div className="panel"><h3 className="panel-h">{title}</h3>
      <div className="tscroll"><table className="ptable"><thead><tr><th>Sequence</th><th className="r">Times</th><th className="r">Rally won</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k}><td>{r.k}</td><td className="mono">{r.n}</td><td className={`mono ${r.w >= 60 ? "good" : r.w <= 40 ? "bad" : ""}`}>{r.w}%{r.w >= 60 ? " ▲" : r.w <= 40 ? " ▼" : ""}</td></tr>)}</tbody></table></div></div>
  );
  return (
    <section className="mgrid">
      {table(t.pairs, `${m.names[p]}'s shot → opponent reply (most frequent)`)}
      <div className="stack">
        {table(t.best, "Three-shot patterns that win (4+ times)")}
        {table(t.worst, "Three-shot patterns that lose (4+ times)")}
      </div>
    </section>
  );
}

function Rallies({ m }) {
  const [f, setF] = useState({ set: 0, res: "all", len: "all", end: "all" });
  const [cur, setCur] = useState(0);
  const [queue, setQueue] = useState(null);
  const [annot, setAnnot] = useState(false);
  const clip = useRef(null);
  const rs = m.rallies.filter((r) => (!f.set || r.set === f.set) && (f.res === "all" || (f.res === "won" ? r.winner === "A" : r.winner === "B"))
    && (f.len === "all" || (f.len === "short" ? r.shots.length <= 4 : f.len === "long" ? r.shots.length >= 10 : r.shots.length > 4 && r.shots.length < 10))
    && (f.end === "all" || (f.end === "winner" ? r.reason === "winner" : r.reason !== "winner")));
  const r = m.rallies[cur];
  const next = () => { if (!queue) return; const q = queue.slice(1); setQueue(q.length ? q : null); if (q.length) setCur(q[0]); };
  const seg = (k, opts) => (
    <div className="seg" role="radiogroup" aria-label={k}>{opts.map(([v, l]) => <button key={l} role="radio" aria-checked={f[k] === v} onClick={() => setF({ ...f, [k]: v })}>{l}</button>)}</div>
  );
  return (
    <section className="rallies">
      <div className="rfilters">
        {seg("set", [[0, "All games"], [1, "Game 1"], [2, "Game 2"], [3, "Game 3"]])}
        {seg("res", [["all", "All"], ["won", `${m.names.A.split(" ")[0]} won`], ["lost", `${m.names.A.split(" ")[0]} lost`]])}
        {seg("len", [["all", "Any length"], ["short", "1–4"], ["mid", "5–9"], ["long", "10+"]])}
        {seg("end", [["all", "Any end"], ["winner", "Winners"], ["error", "Errors"]])}
        <button className="btn primary" disabled={!rs.length} onClick={() => { setQueue(rs.map((x) => x.i)); setCur(rs[0].i); }}>▶ Play reel ({rs.length})</button>
      </div>
      <div className="rgrid">
        <div>
          <RallyClip ref={clip} rally={r} names={m.names} onEnded={next} minimap>
            {annot && <Annotator clip={r.clip} videoRef={clip} onClose={() => setAnnot(false)} />}
          </RallyClip>
          <div className="rclip-actions">
            {queue && <span className="tag">Reel · {queue.length} left</span>}
            <button className="btn ghost sm" onClick={() => setAnnot(true)} disabled={annot}>✎ Annotate frame</button>
            <span className="tiny muted">W / L: whether {m.names.A.split(" ")[0]} won the rally.</span>
          </div>
        </div>
        <ol className="rlist">
          {rs.map((x) => (
            <li key={x.i}><button className={`${x.i === cur ? "on" : ""} ${x.winner === "A" ? "w" : "l"}`} aria-current={x.i === cur ? "true" : undefined} onClick={() => { setQueue(null); setCur(x.i); }}
              aria-label={`Game ${x.set}, ${x.score[0]}–${x.score[1]}, ${x.winner === "A" ? "won" : "lost"} by ${m.names.A}, ${x.shots.length} shots`}>
              <span className="wl" aria-hidden="true">{x.winner === "A" ? "W" : "L"}</span>
              <span className="mono">G{x.set} · {x.score[0]}–{x.score[1]}</span>
              <b>{x.shots.length} shots</b>
              <span>{x.reason === "winner" ? `${x.lastType} winner` : `${x.lastType} ${x.reason}`} · {m.names[x.lastBy].split(" ")[0]}</span>
            </button></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Footwork({ m, p }) {
  const fw = footwork(m, p);
  const reads = fw.reads.filter((r) => r.v > 3.5);
  return (
    <section className="mgrid">
      <div className="panel span2">
        <div className="kpis-sm">
          <Kpi v={`${(fw.totalMove / 1000).toFixed(2)} km`} l="covered between own shots" /><Kpi v={`${f2(fw.perShot)} m`} l="moved per shot" />
          <Kpi v={`${f2(fw.recovery)} m`} l="from base when the opponent strikes" /><Kpi v={`${f2(fw.reqSpeed)} m/s`} l="speed needed to reach the shuttle" />
          <Kpi v={`${fw.stretched}%`} l="shots that needed > 3.5 m/s" tone={fw.stretched > 20 ? "bad" : ""} />
        </div>
      </div>
      <div className="panel">
        <h3 className="panel-h">Which opponent shots stretch {m.names[p]}</h3>
        <div className="tscroll"><table className="ptable"><thead><tr><th>Opponent shot</th><th className="r">Time</th><th className="r">Distance</th><th className="r">Needed</th><th className="r">Read 0.4 s earlier</th></tr></thead>
          <tbody>{fw.byType.map((r) => <tr key={r.t}><td>{r.t}</td><td className="mono">{f2(r.dt)} s</td><td className="mono">{f2(r.d)} m</td>
            <td className={`mono ${r.v > 3 ? "bad" : ""}`}>{f2(r.v)} m/s</td><td className="mono good">{f2(r.vEarly)} m/s</td></tr>)}</tbody></table></div>
        <p className="tiny muted">Read and react: time from the opponent's contact to {m.names[p]}'s next contact, distance covered in that time. The last column is a what-if: the speed needed if the shot were read 0.4 s earlier, the head start our intent-detection block aims to give. It is not wired into this build yet.</p>
      </div>
      <div className="panel">
        <h3 className="panel-h">Where the stretched reaches started</h3>
        <CourtMap half="near" label="Positions when the opponent struck, for shots needing more than 3.5 m/s"
          heat={heatGrid(reads.map((r) => r.from), "near", .5)} heatColor="var(--heat-defence)" />
        <p className="tiny muted">Heat: where {m.names[p]} stood at the opponent's contact on the hardest-to-reach shots.</p>
      </div>
      <Positions m={m} p={p} />
    </section>
  );
}
// where a player stands: every position at their own contacts (heat) or each one as a dot (scatter), on their own half
function Positions({ m, p }) {
  const [mode, setMode] = useState("heat");
  const pts = m.rallies.flatMap((r) => r.shots.filter((s) => s.p === p && s.pos).map((s) => onto(s.pos, "near")));
  return (
    <div className="panel span2">
      <h3 className="panel-h">Where {m.names[p]} hits from · {pts.length} contacts</h3>
      <div className="seg" role="radiogroup" aria-label="View">
        {[["heat", "Heat map"], ["scatter", "Scatter"]].map(([k, l]) => <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <div className="pos-map">
        <CourtMap half="near" label={`${m.names[p]} contact positions`} heat={mode === "heat" ? heatGrid(pts, "near", .45) : null} heatColor="var(--near)"
          points={mode === "scatter" ? pts.map((xy) => ({ xy, c: "var(--near)", r: 2.6, o: .5 })) : []} />
      </div>
      <p className="tiny muted">Positions from the labelled court coordinates, shown on {m.names[p]}'s own half with the net at the top.</p>
    </div>
  );
}

// every labelled shot as CSV (spreadsheet) or JSON, saved on this device
function exportShots(m, fmt) {
  const rows = m.rallies.flatMap((r) => r.shots.map((s, k) => ({ game: r.set, rally: r.rally, score: `${r.score[0]}-${r.score[1]}`, shot: k + 1, time_s: s.t,
    player: m.names[s.p], type: s.type, land_x: s.land?.[0] ?? "", land_y: s.land?.[1] ?? "", pos_x: s.pos?.[0] ?? "", pos_y: s.pos?.[1] ?? "",
    opp_x: s.opp?.[0] ?? "", opp_y: s.opp?.[1] ?? "", rally_winner: m.names[r.winner], end: r.reason })));
  const body = fmt === "csv"
    ? [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(","))].join("\n")
    : JSON.stringify({ match: `${m.names.A} vs ${m.names.B}`, event: m.event, units: "metres, full court 6.1 x 13.4, y from the far baseline", shots: rows }, null, 1);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: fmt === "csv" ? "text/csv" : "application/json" }));
  a.download = `serve_shots.${fmt}`; a.click();
}

// knee bend at every hit of the replayed rally, from the pose skeleton (image-plane angles, one camera)
function PoseCheck({ pose, joint }) {
  const ev = pose.events.filter((e) => e.side === "near");
  const deep = ev.filter((e) => e.flex >= 90);
  const right = ev.filter((e) => e.leg === "right").length;
  const sore = joint && (/right knee/i.test(joint.m.text) ? "right" : /left knee/i.test(joint.m.text) ? "left" : null);
  const onSore = sore ? ev.filter((e) => e.leg === sore).length : 0;
  return (
    <div className={`risk ${sore && onSore > ev.length / 2 ? "high" : "watch"}`}>
      <b>Pose check · replayed rally</b>
      <p>Deepest knee bend per hit: {ev.map((e) => `${e.type.toLowerCase()} ${Math.round(e.flex)}° ${e.leg[0].toUpperCase()}`).join(" · ")}.</p>
      <p>{deep.length ? `${deep.length} deep lunge${deep.length > 1 ? "s" : ""} past 90°. ` : ""}{right} of {ev.length} loading bends on the right leg{sore ? `, the ${sore} knee is the sore one in memory` : ""}.
        {sore && onSore > ev.length / 2 ? " Train the lunge with a shorter step and load the other side in the gym." : ""}</p>
    </div>
  );
}

function Fatigue({ m, p }) {
  const fa = fatigue(m, p), ld = load(m, p);
  const [pose, setPose] = useState(null);
  useEffect(() => { fetch("/data/pose.json").then((r) => (r.ok ? r.json() : null)).then(setPose).catch(() => {}); }, []);
  const joint = retrieve("knee ankle injury sore", 1).find((h) => /knee|ankle/i.test(h.m.text));
  const marks = fa.series.map((x, i) => (i && x.set !== fa.series[i - 1].set ? { i, label: `Game ${x.set}` } : null)).filter(Boolean);
  const change = (o, lowerIsBetter = true) => {
    const d = (o.late - o.early) / (o.early || 1) * 100;
    const bad = lowerIsBetter ? d > 5 : d < -5;
    return <span className={bad ? "bad" : Math.abs(d) <= 5 ? "" : "good"}>{d > 0 ? "+" : ""}{d.toFixed(0)}%</span>;
  };
  // the watch list: each knee-loading measure against the player's own baseline, with the same thresholds as Ren's flags
  const g1 = ld.bySet[0], gl = ld.bySet[ld.bySet.length - 1], per = (g, k) => g[k] / g.n;
  const LVL = { high: ["off", "▲ Warning"], watch: ["mod", "● Watch"], ok: ["ok", "✓ OK"] };
  const row = (k, sub, a, b, fmt, warn, watch) => {
    const d = ((b - a) / (a || 1)) * 100, lvl = d > warn ? "high" : d > watch ? "watch" : "ok";
    return { k, sub, a: fmt(a), b: fmt(b), d: `${d > 0 ? "+" : ""}${d.toFixed(0)}%`, lvl };
  };
  const heavy = ld.peak.filter((x) => x.load > ld.early * 2.2);
  const watchList = [
    row("Load per rally", "first vs last third", ld.early, ld.late, f1, 15, 5),
    ...(g1 && gl && gl !== g1 ? [
      row("Front-court lunges per rally", `game 1 vs game ${gl.s}`, per(g1, "lunges"), per(gl, "lunges"), f2, 30, 10),
      row("Sharp cuts per rally", `game 1 vs game ${gl.s}`, per(g1, "cuts"), per(gl, "cuts"), f2, 30, 10),
      row("Metres per rally", `game 1 vs game ${gl.s}`, per(g1, "metres"), per(gl, "metres"), f1, 20, 8),
    ] : []),
    { k: "Very heavy rallies", sub: "over 2.2× the opening load", a: "–", b: String(heavy.length), d: "–", lvl: heavy.length ? "watch" : "ok" },
  ];
  return (
    <section className="mgrid">
      <div className="panel span2">
        <h3 className="panel-h">First third vs last third of the match</h3>
        <div className="kpis-sm">
          <Kpi v={<>{f2(fa.rec.early)} → {f2(fa.rec.late)} m {change(fa.rec)}</>} l="distance from base at opponent contact" />
          <Kpi v={<>{f2(fa.req.early)} → {f2(fa.req.late)} m/s {change(fa.req)}</>} l="speed needed to reach the shuttle" />
          <Kpi v={<>{f2(fa.tempo.early)} → {f2(fa.tempo.late)} s {change(fa.tempo, false)}</>} l="time between shots" />
          <Kpi v={<>{pct(fa.err.early * 100, 100)} → {pct(fa.err.late * 100, 100)}% </>} l="rallies ending in own error" />
        </div>
        <p className="tiny muted">Rolling 10-rally averages below. A tiring player recovers less (distance from base rises), needs more speed and makes more errors; a shorter time between shots means the rally is getting faster.</p>
      </div>
      <div className="panel span2 riskwatch">
        <h3 className="panel-h">Load watch</h3>
        <div className="risk-grid">
          <div>
            <h4>Watch list</h4>
            <div className="tscroll"><table className="ptable watch-list"><thead><tr><th>Measure</th><th className="r">Start</th><th className="r">Late</th><th className="r">Change</th><th>Status</th></tr></thead>
              <tbody>{watchList.map((w) => <tr key={w.k}><td>{w.k}<span className="tiny muted">{w.sub[0].toUpperCase() + w.sub.slice(1)}</span></td><td className="mono">{w.a}</td><td className="mono">{w.b}</td><td className="mono">{w.d}</td><td><span className={`verdict ${LVL[w.lvl][0]}`}>{LVL[w.lvl][1]}</span></td></tr>)}</tbody></table></div>
            <h4>By game</h4>
            <div className="tscroll"><table className="ptable"><thead><tr><th>Game</th><th className="r">Metres per rally</th><th className="r">Lunges per rally</th><th className="r">Sharp cuts per rally</th></tr></thead>
              <tbody>{ld.bySet.map((g) => <tr key={g.s}><td>Game {g.s}</td><td className="mono">{f1(g.metres / g.n)}</td><td className="mono">{f2(g.lunges / g.n)}</td><td className="mono">{f2(g.cuts / g.n)}</td></tr>)}</tbody></table></div>
            <LineChart n={ld.series.length} marks={marks} label="Movement load" series={[{ label: "load", color: "var(--far)", values: ld.roll }]} yFmt={f1} />
            <p className="tiny muted">Load per rally, rolling 10: metres moved + 1.5 per front-court lunge + 1 per sharp change of direction, from court positions at every contact.</p>
          </div>
          <div className="risk-feed">
            {joint && <div className="risk mem"><b>Memory</b><p>“{joint.m.text}” Lunges and cuts are the knee-loading movements, so they are tracked against your own game 1 baseline.</p></div>}
            {ld.flags.map((f, k) => <div key={k} className={`risk ${f.lvl}`}><b>{f.lvl === "high" ? "▲ Warning" : "● Watch"}</b><p>{f.t}</p></div>)}
            {!ld.flags.length && <div className="risk ok"><b>✓ No warning</b><p>Every measure on the watch list stayed close to the player's own opening baseline.</p></div>}
            {pose && p === "A" && <PoseCheck pose={pose} joint={joint} />}
            <p className="tiny muted">Match-wide load is a proxy from positions. Joint angles come from pose on the replayed rally; the next step runs pose on every rally, live.</p>
          </div>
        </div>
      </div>
      <div className="panel"><h3 className="panel-h">Recovery: distance from base (m)</h3>
        <LineChart n={fa.series.length} marks={marks} label="Recovery distance" series={[{ label: "rec", color: "var(--near)", values: fa.rollRec }]} yFmt={f2} /></div>
      <div className="panel"><h3 className="panel-h">Speed needed to reach (m/s)</h3>
        <LineChart n={fa.series.length} marks={marks} label="Required speed" series={[{ label: "req", color: "var(--far)", values: fa.rollReq }]} yFmt={f2} /></div>
      <div className="panel"><h3 className="panel-h">Own-error rate</h3>
        <LineChart n={fa.series.length} marks={marks} label="Error rate" series={[{ label: "err", color: "var(--bad)", values: fa.rollErr.map((v) => v * 100) }]} yFmt={(v) => v.toFixed(0) + "%"} yMin={0} /></div>
      <div className="panel"><h3 className="panel-h">Time between shots (s)</h3>
        <LineChart n={fa.series.length} marks={marks} label="Tempo" series={[{ label: "tempo", color: "var(--accent)", values: fa.rollTempo }]} yFmt={f2} /></div>
      <div className="panel span2"><h3 className="panel-h">By game</h3>
        <div className="tscroll"><table className="ptable"><thead><tr><th>Game</th><th className="r">From base</th><th className="r">Speed needed</th><th className="r">Own errors</th><th className="r">Time between shots</th><th className="r">Shots per rally</th></tr></thead>
          <tbody>{fa.bySet.map((s) => <tr key={s.s}><td>Game {s.s}</td><td className="mono">{f2(s.rec)} m</td><td className="mono">{f2(s.req)} m/s</td><td className="mono">{s.err}%</td><td className="mono">{f2(s.tempo)} s</td><td className="mono">{f1(s.shots)}</td></tr>)}</tbody></table></div></div>
    </section>
  );
}

function Compare({ d }) {
  const name = "WANG Po Wei";
  const cols = d.matches.map((m) => ({ m, p: sideOf(m, name), opp: m.names[sideOf(m, name) === "A" ? "B" : "A"] })).map((c) => ({ ...c, pr: profile(c.m, c.p) }));
  const rows = [["Points won", (x) => `${x.winPct}%`], ["Winners hit", (x) => x.winners], ["Own errors", (x) => x.errors], ["Smash share", (x) => `${x.smashShare}%`],
    ["Attacking shots", (x) => `${x.attackShare}%`], ["Shots per rally", (x) => f1(x.avgRally)], ["Speed needed to reach", (x) => `${f2(x.reqSpeed)} m/s`],
    ["Distance from base", (x) => `${f2(x.recovery)} m`], ["Short serves", (x) => `${x.serveShort}%`], ["Top target", (x) => x.targets[0]?.[0] ?? "–"], ["Weakest zone", (x) => x.weak[0]?.[0] ?? "–"]];
  return (
    <section className="mgrid">
      <div className="panel span2" style={{ maxWidth: 820 }}>
        <h3 className="panel-h">{name} across {cols.length} matches</h3>
        <div className="tscroll"><table className="ptable cmp"><thead><tr><th />{cols.map((c) => <th key={c.m.video}>{c.m.event}<br /><span className="muted">vs {c.opp}</span></th>)}</tr></thead>
          <tbody>{rows.map(([l, fn]) => <tr key={l}><td>{l}</td>{cols.map((c) => <td key={c.m.video} className="mono">{fn(c.pr)}</td>)}</tr>)}</tbody></table></div>
        <p className="tiny muted">Same metrics, computed the same way on both matches. Each analysed match is also saved to the player's memory, so coaches can compare over a season.</p>
      </div>
      {cols.map((c) => (
        <div key={c.m.video} className="panel">
          <h3 className="panel-h">{c.m.event} · where {name}'s shots land</h3>
          <CourtMap half="far" heat={heatGrid(c.pr.land.map((x) => x.xy), "far", .55)} heatColor="var(--heat-attack)" label="Landing heat" />
        </div>
      ))}
    </section>
  );
}
