import { useEffect, useMemo, useRef, useState } from "react";
import { loadMatches, ownError, ownWinner } from "../match/analytics.js";
import { zoneOf } from "../coaches/analysis.js";
import RallyClip from "../match/RallyClip.jsx";
import CourtMap from "../components/CourtMap.jsx";
import { COACHES } from "../coaches/personas.js";
import Avatar from "../coaches/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import VoiceCoach from "../voice/VoiceCoach.jsx";

// Live mode: the recorded rallies are streamed one after another as if from the court camera. Shots, score,
// heat map and coach alerts update as each shot and rally happens. (Prototype: replay of a recorded match.)
// It is a broadcast view of its own, built to be read from a tablet courtside in about 20 seconds: no app
// navigation, the score on the video, and the between-point brief large and directly under it.
const coach = (id) => COACHES.find((c) => c.id === id);
const ME = "A";

function alertsFor(m, done) {
  const r = done[done.length - 1], out = [];
  const last = (k) => done.slice(-k);
  const name = m.names;
  if (last(3).length === 3 && last(3).every((x) => x.winner !== ME))
    out.push({ c: "tactics", t: `Three points in a row to ${name.B}. Slow it down: lift deep to the backhand corner and reset.` });
  const beaten = done.filter((x) => ownWinner(x, "B")).slice(-4).map((x) => x.shots[x.shots.length - 1].land).filter(Boolean)
    .map((xy) => zoneOf(xy[1] < 6.7 ? [6.1 - xy[0], 13.4 - xy[1]] : xy, "near"));
  const z = beaten[beaten.length - 1];
  if (ownWinner(r, "B") && beaten.filter((x) => x === z).length >= 2) out.push({ c: "tactics", t: `${name.B} has now hit ${beaten.filter((x) => x === z).length} of the last ${beaten.length} winners into your ${z}. Cover it earlier.` });
  if (r.shots.length >= 15) out.push({ c: "fitness", t: `${r.shots.length}-shot rally. Take your full time between points and breathe out slowly.` });
  const errs = last(4).filter((x) => ownError(x, ME));
  if (ownError(r, ME) && errs.length >= 2) out.push({ c: "technique", t: `${errs.length} own errors in the last 4 rallies (${errs.map((x) => x.reason).join(", ")}). Add margin: aim higher over the tape and further inside the lines.` });
  if (Math.max(...r.score) >= 19) {
    const serves = done.flatMap((x) => x.shots.filter((s) => s.p === "B" && /serve/.test(s.type)));
    const short = serves.filter((s) => s.type === "Short serve").length;
    out.push({ c: "analyst", t: `Closing stage. ${name.B} serves short ${Math.round(100 * short / Math.max(1, serves.length))}% of the time; be ready at the front.` });
  }
  return out;
}

// Between-point brief: what the coaches would tell the player in the ~20 s before the next serve (longer at the
// 11-point interval and between games). Computed from the rallies so far, on the device, in milliseconds.
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export function brief(m, done) {
  const t0 = performance.now(), r = done[done.length - 1], names = m.names, opp = "B", out = [];
  const prev = done.length > 1 ? done[done.length - 2] : null;
  const kind = prev && prev.set !== r.set ? "game" : Math.max(...r.score) === 11 && (!prev || prev.set !== r.set || Math.max(...prev.score) < 11) ? "interval" : "point";
  out.push({ c: r.winner === ME ? "analyst" : "tactics", t: r.winner === ME
    ? `Won ${r.score[0]}–${r.score[1]}: ${r.reason === "winner" ? `${r.lastType.toLowerCase()} winner` : `${names[opp].split(" ")[0]} ${r.reason}`} after ${r.shots.length} shots.`
    : `Lost ${r.score[0]}–${r.score[1]}: ${r.reason === "winner" ? `${names[opp].split(" ")[0]}'s ${r.lastType.toLowerCase()} winner` : `own ${r.reason} error`} after ${r.shots.length} shots.` });
  const serves = done.flatMap((x) => x.shots.slice(0, 1).filter((s) => s.p === opp && /serve/i.test(s.type)));
  if (r.winner === opp && serves.length >= 3) {
    const short = serves.filter((s) => /short/i.test(s.type)).length;
    out.push({ c: "analyst", t: `${names[opp].split(" ")[0]} serves: short ${pct(short, serves.length)}% so far. Stand ${short / serves.length > .6 ? "tight to the front service line" : "a half step back"}.` });
  }
  if (r.winner === ME) {
    // our serve next: which serve has won more rallies so far
    const mine = done.filter((x) => x.shots[0]?.p === ME && /serve/i.test(x.shots[0].type));
    const by = (re) => { const g = mine.filter((x) => re.test(x.shots[0].type)); return [g.filter((x) => x.winner === ME).length, g.length]; };
    const [sw, sn] = by(/short/i), [lw, ln] = by(/long|high/i);
    if (sn + ln >= 3) out.push({ c: "analyst", t: `Your serve: short won ${sw} of ${sn}${ln ? `, long ${lw} of ${ln}` : ""}. ${!ln || sw / Math.max(1, sn) >= lw / ln ? "Stay short" : "Mix in a long serve"}.` });
  }
  const attacks = done.flatMap((x) => x.shots.filter((s) => s.p === opp && s.land && /smash|drive|rush|drop/i.test(s.type)))
    .map((s) => zoneOf(s.land[1] < 6.7 ? [6.1 - s.land[0], 13.4 - s.land[1]] : s.land, "near"));
  const hot = Object.entries(attacks.reduce((a, z) => ({ ...a, [z]: (a[z] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
  const beaten = done.slice(-8).filter((x) => ownWinner(x, opp)).map((x) => x.shots[x.shots.length - 1].land).filter(Boolean)
    .map((xy) => zoneOf(xy[1] < 6.7 ? [6.1 - xy[0], 13.4 - xy[1]] : xy, "near"));
  const top = Object.entries(beaten.reduce((a, z) => ({ ...a, [z]: (a[z] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) out.push({ c: "tactics", t: `${top[1]} of their last ${beaten.length} winners went to your ${top[0]}: start one step closer to it.` });
  else if (hot && attacks.length >= 5) out.push({ c: "tactics", t: `Their attacks land most in your ${hot[0]} (${pct(hot[1], attacks.length)}% of ${attacks.length}): lean that way after you lift.` });
  const errs = done.slice(-4).filter((x) => ownError(x, ME));
  if (errs.length >= 2) out.push({ c: "technique", t: `${errs.length} own errors in the last 4 rallies (${errs.map((x) => x.reason).join(", ")}): play the next shot with more margin.` });
  if (r.shots.length >= 15) out.push({ c: "fitness", t: `${r.shots.length}-shot rally: use the full break, breathe out slowly before the serve.` });
  if (kind !== "point") {
    const g = done.filter((x) => x.set === (kind === "game" ? prev.set : r.set));
    const w = g.filter((x) => ownWinner(x, ME)).length, e = g.filter((x) => ownError(x, ME)).length;
    out.push({ c: "analyst", t: `${kind === "game" ? `Game ${prev.set} done` : "Interval at 11"}: ${w} winners, ${e} own errors, ${g.filter((x) => x.winner === ME).length} of ${g.length} points.` });
  }
  return { kind, lines: out.slice(0, kind === "point" ? 3 : 5), ms: performance.now() - t0, at: `G${r.set} ${r.score[0]}–${r.score[1]}` };
}

export default function Live({ data }) {
  const [d, setD] = useState(null);
  const [i, setI] = useState(0);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState(1);
  const [feed, setFeed] = useState([]);
  const [pause, setPause] = useState(null); // between-point brief while the next rally waits
  const [left, setLeft] = useState(0);
  const [info, setInfo] = useState(false);
  const clip = useRef(null);
  useEffect(() => { loadMatches().then(setD); window.scrollTo(0, 0); }, []);
  useEffect(() => { const v = clip.current?.video; if (v) { v.playbackRate = rate; running ? v.play().catch(() => {}) : v.pause(); } }, [rate, running, i]);
  const m = d?.matches[0];
  // during the break the rally that just ended already counts on the scoreboard
  const done = useMemo(() => (m ? m.rallies.slice(0, i + (pause ? 1 : 0)) : []), [m, i, pause]);
  // count down the break; a paused stream also pauses the countdown
  useEffect(() => {
    if (!pause) return;
    if (left <= 0) { setPause(null); setI((x) => x + 1); return; }
    const id = setTimeout(() => running && setLeft((x) => x - 1), 1000 / rate);
    return () => clearTimeout(id);
  }, [pause, left, running, rate]);

  if (!m) return <div className="live-page"><div className="live-bar"><a className="btn ghost sm exit" href="#/match"><Icon name="back" size={16} />Exit live</a><span className="live-title">Connecting to the court camera…</span></div></div>;
  const r = m.rallies[i];
  const games = { A: 0, B: 0 };
  [1, 2, 3].forEach((s) => { const rs = done.filter((x) => x.set === s); const last = rs[rs.length - 1]; if (last && s < r.set) games[last.score[0] > last.score[1] ? "A" : "B"]++; });
  const prevInSet = done.filter((x) => x.set === r.set);
  const score = prevInSet.length ? prevInSet[prevInSet.length - 1].score : [0, 0];
  const stat = (p) => ({ w: done.filter((x) => ownWinner(x, p)).length, e: done.filter((x) => ownError(x, p)).length });
  const lands = done.flatMap((x) => x.shots.filter((s) => s.land && s.p === "B").map((s) => s.land));

  const next = () => {
    const now = [...done, r];
    const al = alertsFor(m, now).map((a) => ({ ...a, id: `${r.i}-${a.c}`, at: `G${r.set} ${r.score[0]}–${r.score[1]}` }));
    if (al.length) setFeed((f) => [...al, ...f].slice(0, 8));
    if (i + 1 >= m.rallies.length) return setRunning(false);
    // the real break is ~20 s (60 s at 11 points); the replay compresses it
    const b = brief(m, now), secs = b.kind === "point" ? 6 : 10;
    window.__liveBrief = b;
    setPause({ ...b, secs }); setLeft(secs);
  };
  const skip = () => { setLeft(0); };
  const R = 27, C = 2 * Math.PI * R;

  return (
    <div className="live-page">
      <header className="live-bar">
        <a className="btn ghost sm exit" href="#/match"><Icon name="back" size={16} />Exit live</a>
        <span className="live-badge"><i aria-hidden="true" /> LIVE</span>
        <h1 className="live-title">{m.names.A} <span className="vs">vs</span> {m.names.B}</h1>
        <div className="live-ctl">
          <button className="btn ghost sm" onClick={() => setRunning(!running)} aria-label={running ? "Pause" : "Resume"}><Icon name={running ? "pause" : "play"} size={16} /><span className="lbl">{running ? "Pause" : "Resume"}</span></button>
          <div className="seg" role="radiogroup" aria-label="Replay speed">
            {[1, 2].map((x) => <button key={x} role="radio" aria-checked={rate === x} onClick={() => setRate(x)}>{x}×</button>)}
          </div>
          <select value={i} onChange={(e) => { setFeed([]); setPause(null); setI(+e.target.value); }} aria-label="Jump to rally">
            {m.rallies.map((x) => <option key={x.i} value={x.i}>Game {x.set} · rally {x.rally}</option>)}
          </select>
          <VoiceCoach data={data} />
        </div>
        <button className="icon-btn live-info-btn" aria-label="Stream details" aria-expanded={info} onClick={() => setInfo(!info)}><Icon name="info" /></button>
      </header>
      <div className="live-grid">
        <div className="live-main">
          <RallyClip ref={clip} rally={r} names={m.names} onEnded={next} minimap={false} live>
            <div className="score-ov" aria-label={`Score: ${m.names.A} ${score[0]}, ${m.names.B} ${score[1]}; games ${games.A}–${games.B}`}>
              {["A", "B"].map((p) => (
                <div key={p} className={`score-row ${p === "A" ? "me" : ""}`}>
                  <span>{m.names[p]}</span>
                  <span className="pips" title={`Games won: ${games[p]}`}>{[0, 1].map((k) => <i key={k} className={k < games[p] ? "won" : ""} />)}</span>
                  <strong>{score[p === "A" ? 0 : 1]}</strong>
                </div>
              ))}
              <span className="score-meta">Game {r.set} · rally {i + 1} of {m.rallies.length} · dots: games won</span>
            </div>
          </RallyClip>
          {pause ? (
            <section className={`live-brief ${pause.kind}`} role="status" aria-live="polite">
              <header>
                <div>
                  <b>{pause.kind === "point" ? "Between points" : pause.kind === "interval" ? "11-point interval" : "Between games"} · {pause.at}</b>
                  <span className="tiny">Brief ready in {pause.ms < 1 ? "<1" : pause.ms.toFixed(1)} ms, computed on this device</span>
                </div>
                <div className="countdown" role="timer" aria-label={`Next serve in ${left} seconds`}>
                  <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="track" cx="32" cy="32" r={R} /><circle className="arc" cx="32" cy="32" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - left / pause.secs)} /></svg>
                  <b>{left}</b>
                </div>
              </header>
              {pause.lines.map((l, k) => (
                <div key={k} className="brief-line" style={{ "--cc": coach(l.c).color }}>
                  <Avatar coach={coach(l.c)} size={44} /><p><small>{coach(l.c).name}</small>{l.t}</p>
                </div>
              ))}
              <footer><span className="tiny">Ask out loud: “what should I do next point?”</span><button className="btn primary lg" onClick={skip}>Next serve →</button></footer>
            </section>
          ) : (
            <div className="live-wait"><p className="dots" aria-hidden="true"><i /><i /><i /></p>{running ? "Rally in play. The coaches' brief appears here when it ends." : "Stream paused."}</div>
          )}
          {info && (
            <div className="live-info">
              <p className="live-hud mono"><span>court cam 1080p30</span><span>tracker real-time</span><span>shot → stats &lt; 0.3 s</span><span className="ok">network: none</span></p>
              <p className="tiny muted">Prototype: recorded rallies streamed as if live, with the between-point break compressed. Next, the same view runs from the court camera, and Muse Glimmer turns each brief into one spoken sentence.</p>
            </div>
          )}
        </div>
        <aside className="live-side">
          <section className="live-feed" aria-live="polite" aria-relevant="additions">
            <h2>Coach alerts</h2>
            {!feed.length && <p className="tiny muted">Coaches speak up when a pattern appears.</p>}
            {feed.map((a) => (
              <div key={a.id} className="alert" style={{ "--cc": coach(a.c).color }}>
                <Avatar coach={coach(a.c)} size={40} />
                <div><b>{coach(a.c).name} · <span className="mono">{a.at}</span></b><p>{a.t}</p></div>
              </div>
            ))}
          </section>
          <div className="live-stats">
            {["A", "B"].map((p) => { const s = stat(p); return <div key={p}><span>{m.names[p].split(" ")[0]}</span><b className="mono">{s.w}</b><em>winners</em><b className="mono">{s.e}</b><em>errors</em></div>; })}
          </div>
          <div className="live-map">
            <h2>Opponent's landings so far</h2>
            <CourtMap half="full" points={lands.map((xy) => ({ xy, c: "var(--far)", r: 3, o: .6 }))} label="Opponent landings" />
          </div>
        </aside>
      </div>
    </div>
  );
}
