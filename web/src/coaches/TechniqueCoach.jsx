import { useMemo, useState } from "react";
import Court3D from "../components/Court3D.jsx";
import { speedColor } from "../data.js";
import { shotQuality } from "./analysis.js";
import { mentions } from "../memory.js";
import Briefing, { useTyping } from "./Briefing.jsx";

const ADVICE = {
  Smash: { A: "Steep and fast. Keep taking it this early.", B: "Make contact higher and further in front to steepen it.", C: "Too flat or too slow: contact is late and low. Get behind the shuttle first." },
  Clear: { A: "Deep and high; it buys you recovery time.", B: "A touch more height or depth would push the opponent further back.", C: "Short clear: it invites the smash. Finish the swing up and through." },
  Lift: { A: "Deep and high enough to recover.", B: "Lift a little deeper to the back tramlines.", C: "Short lift: the attack comes straight back. Open the racket face and push through." },
  "Net shot": { A: "Tight to the tape. Good pressure.", B: "Slightly high over the net; soften the grip.", C: "Too high: it can be rushed. Meet the shuttle earlier, closer to the tape." },
  Drop: { A: "Lands short and tight.", B: "Land it nearer the service line.", C: "Floats too deep; slice it and keep it falling." },
  Drive: { A: "Flat and quick.", B: "Keep it flatter over the tape.", C: "Too high and slow for a drive." },
  "Short serve": { A: "Low over the tape.", B: "Slightly high; keep the swing shorter.", C: "High serve: easy to attack." },
};

export default function TechniqueCoach({ coach, data, hits, runKey, onReplay }) {
  const rally = data.rally;
  const q = useMemo(() => shotQuality(rally), [rally]);
  const mine = q.filter((x) => x.s.hitter === "near");
  const smashFocus = mentions(hits, /smash/i);

  const messages = useMemo(() => {
    const msgs = [{ text: `I replayed this rally in 3D and graded your ${mine.length} shots (blue). Each flight loops on the court while I talk about it.`, act: { i: mine[0].s.i } }];
    mine.forEach((x) => msgs.push({
      title: `Shot ${x.s.i + 1} · ${x.s.type} · grade ${x.grade}`,
      text: `${x.note}. ${ADVICE[x.s.type]?.[x.grade] ?? ""}`,
      act: { i: x.s.i },
    }));
    const best = [...mine].filter((x) => x.score != null).sort((a, b) => b.score - a.score);
    const opSmash = q.find((x) => x.s.type === "Smash" && x.s.hitter === "far");
    msgs.push({
      title: "Ball quality summary",
      text: `Strongest: ${best[0].s.type.toLowerCase()} (${best[0].grade}). To work on: ${best[best.length - 1].s.type.toLowerCase()} (${best[best.length - 1].grade}).` +
        (opSmash ? ` For reference, the opponent's smash in this rally left the racket at ${Math.round(opSmash.s.v0)} km/h.` : "") +
        (smashFocus ? " You asked me to watch your smash, so it is first on next session's list." : ""),
      act: { i: best[best.length - 1].s.i },
    });
    return msgs;
  }, [q, smashFocus]);

  const [shown] = useTyping(messages, runKey);
  const act = messages[Math.max(0, shown - 1)].act;
  const [manual, setManual] = useState(null);
  const cur = q[manual ?? act.i];

  return (
    <div className="coach-body">
      <Briefing coach={coach} messages={messages} shown={shown} memoryHits={hits} onReplay={() => { setManual(null); onReplay(); }} />
      <div className="coach-visual">
        <div className="tech-court">
          <Court3D rally={rally} loop range={[cur.s.f0, cur.s.f1]} interactive />
          <div className="tech-badge">
            <span className={`grade g${cur.grade}`}>{cur.grade}</span>
            <div><b>Shot {cur.s.i + 1} · {cur.s.type}</b><span className="tiny muted">{cur.s.hitter === "near" ? "you" : "opponent"}</span></div>
          </div>
        </div>
        <dl className="tech-metrics">
          <div><dt>Launch</dt><dd className="mono" style={{ color: speedColor(cur.s.v0) }}>{Math.round(cur.s.v0)}<small> km/h</small></dd></div>
          <div><dt>Apex</dt><dd className="mono">{cur.m.apex.toFixed(2)}<small> m</small></dd></div>
          <div><dt>Contact</dt><dd className="mono">{cur.m.contactH.toFixed(2)}<small> m</small></dd></div>
          <div><dt>Over the net</dt><dd className="mono">{cur.m.clear != null ? (cur.m.clear * 100).toFixed(0) : "–"}<small> cm</small></dd></div>
          <div><dt>From baseline</dt><dd className="mono">{cur.m.depth.toFixed(1)}<small> m</small></dd></div>
          <div><dt>Flight</dt><dd className="mono">{cur.s.flight}<small> s</small></dd></div>
        </dl>
        <ol className="tech-list">
          {q.map((x) => (
            <li key={x.s.i}>
              <button className={`stroke ${x.s.hitter} ${x.s.i === cur.s.i ? "on" : ""}`} onClick={() => setManual(x.s.i)}>
                <span className="who">{x.s.hitter === "near" ? "You" : "Opp"} · #{x.s.i + 1}</span><b>{x.s.type}</b><span className={`grade-sm g${x.grade}`}>{x.grade}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="tiny muted">Grades use coaching rules of thumb per stroke (speed, apex, net clearance, depth) applied to the reconstructed 3D flight; the shot ends where the next player intercepts it.</p>
      </div>
    </div>
  );
}
