import { useEffect, useRef, useState } from "react";
import { zoneName } from "../data.js";

const AG = {
  coach: { name: "Head Coach", c: "a0" },
  stats: { name: "Stats Analyst", c: "a1" },
  pos: { name: "Positioning", c: "a2" },
  plan: { name: "Training Planner", c: "a3" },
  verify: { name: "Evidence Verifier", c: "a4" },
};
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

// Builds each agent turn from the computed match facts. In the full system a local LLM writes these turns
// through tool calls; here the same facts are templated so the prototype runs without a model.
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function script(q, ctx) {
  const { ins, rally, sim, players } = ctx;
  const me = players.near, opp = players.far;
  const top = ins.topZone;
  const shortShare = pct(ins.short.length, ins.lifts.length);
  const punish = pct(ins.punished.length, ins.short.length), punishDeep = pct(ins.deepPunished.length, ins.deep.length);
  const smashI = rally.strokes.findIndex((s) => s.type === "Smash");
  const smash = rally.strokes[smashI], before = rally.strokes[smashI - 1];
  const ids = (arr, k = 6) => arr.slice(0, k).map((s) => ({ label: `#${s.id}`, ids: [s.id] }));
  const dx = sim.best.base[0] - ins.base[0], dy = sim.best.base[1] - ins.base[1];
  const parts = [];
  if (Math.abs(dy) >= .1) parts.push(`${Math.abs(dy).toFixed(1)} m ${dy > 0 ? "deeper" : "closer to the net"}`);
  if (Math.abs(dx) >= .1) parts.push(`${Math.abs(dx).toFixed(1)} m toward your ${dx < 0 ? "backhand" : "forehand"}`);
  const dir = parts.join(" and ") || "where you already stand";
  const where = (b) => {
    const off = b[0] - 3.05;
    return `${Math.abs(off) < .1 ? "on the centre line" : `${Math.abs(off).toFixed(1)} m to the ${off < 0 ? "backhand" : "forehand"} side of the centre line`}, ${(b[1] - 6.7).toFixed(1)} m behind the net`;
  };
  const gain = sim.cur - sim.best.rate, holds = sim.check.cur - sim.check.best >= .02;

  if (q === 0) return [
    ["coach", `Two parts: where ${opp} attacks you, and what sets those attacks up. Stats Analyst first.`],
    ["stats", `${cap(opp)} smashed into your half ${ins.oppSmash.length} times in this match. ${top.n} of them (${pct(top.n, ins.oppSmash.length)}%) landed in your ${zoneName(top.key)}, the most-targeted zone.`,
      ids(ins.oppSmash.filter((s) => s.zone.key === top.key))],
    ["stats", `Of your ${ins.lifts.length} lifts and clears, ${ins.short.length} (${shortShare}%) landed in front of the back service line. ${cap(opp)} smashed the very next shot after ${punish}% of those, against ${punishDeep}% after your deep ones.`,
      ids(ins.punished)],
    ["pos", `Pattern: a short lift gives ${opp} time to step in and hit down. You can see it in this rally: shot ${before.i + 1} (your ${before.type.toLowerCase()}, apex ${before.apex} m) is answered by a ${Math.round(smash.v0)} km/h smash at shot ${smash.i + 1}.`,
      [{ label: `Watch shot ${smash.i + 1}`, frame: before.f0 }]],
    ["verify", `Re-ran 3 queries on the match database. Smashes into your half: ${ins.oppSmash.length} ✓. In the ${zoneName(top.key)}: ${top.n} ✓. Short lifts followed by a smash: ${ins.punished.length} of ${ins.short.length} ✓. All claims cite strokes; approved.`],
  ];
  if (q === 1) return [
    ["coach", `Positioning, test a better base against an attacking opponent in the sparring simulator before recommending anything.`],
    ["pos", `Your average contact point is ${where(ins.base)}. From there the simulator loses ${pct(sim.cur, 1)}% of ${opp}'s attacking shots (attacker style, 2,000 rallies).`],
    gain >= .02
      ? ["pos", `Best base found on a 15 cm grid: ${dir}. Simulated losses drop to ${pct(sim.best.rate, 1)}%.`, [{ label: "Open the simulator", anchor: "sparring" }]]
      : ["pos", `The best base on a 15 cm grid is ${dir}, and it only changes losses from ${pct(sim.cur, 1)}% to ${pct(sim.best.rate, 1)}%. Your base is already sound; the gain has to come from reacting earlier to the ${zoneName(top.key)}.`, [{ label: "Open the simulator", anchor: "sparring" }]],
    ["verify", holds
      ? `Repeated with a new random seed: ${pct(sim.check.cur, 1)}% → ${pct(sim.check.best, 1)}%. The improvement holds; approved. Simplified movement model (0.25 s reaction, 4.2 m/s).`
      : `Repeated with a new random seed: ${pct(sim.check.cur, 1)}% vs ${pct(sim.check.best, 1)}%. No meaningful gain from moving the base, so I approve "keep the current base" and reject any repositioning advice. Simplified movement model (0.25 s reaction, 4.2 m/s).`],
  ];
  return [
    ["coach", `Training Planner, build the week around the two findings the Verifier approved.`],
    ["plan", `Mon · Rear-court lift depth. Lift from the net to the back tramlines, 6 × 10 lifts. Target: fewer than ${Math.max(10, shortShare - 15)}% short (now ${shortShare}%).`],
    ["plan", `Wed · Defence to the ${zoneName(top.key)}. 2-vs-1 smash defence aimed at that zone, 4 × 3 min, recover to the new base after every block.`],
    ["plan", holds
      ? `Fri · Base footwork. Shadow footwork from the new base (${dir}), 6 × 45 s, recovery under 1.2 s.`
      : `Fri · First-step reaction. Split-step drills from your current base with a coach feeding to the ${zoneName(top.key)}, 6 × 45 s, first step under 0.3 s.`],
    ["plan", `Sat · Practice match. Record it; ShuttleCoach re-measures short lifts and smashes conceded in the ${zoneName(top.key)}.`],
    ["verify", `Each session maps to an approved finding and has a measurable target. Approved.`],
  ];
}

const QUESTIONS = ["Where is my opponent hurting me?", "Where should I stand to defend?", "Plan my training for next week"];

export default function Agents({ ctx, onEvidence }) {
  const [q, setQ] = useState(null);
  const [shown, setShown] = useState(0);
  const msgs = q == null ? [] : script(q, ctx);
  const box = useRef(null);

  useEffect(() => {
    if (q == null || shown >= msgs.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : 1100);
    return () => clearTimeout(id);
  }, [q, shown]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [shown]);

  const ask = (i) => { setQ(i); setShown(0); };
  const busy = q != null && shown < msgs.length;
  return (
    <div className="agents">
      <div className="ask-row">
        {QUESTIONS.map((t, i) => (
          <button key={t} className={`chip ${q === i ? "on" : ""}`} onClick={() => ask(i)} disabled={busy}>{t}</button>
        ))}
      </div>
      <div className="chat" ref={box} aria-live="polite">
        {q == null && <p className="muted chat-empty">Ask a question. Five agents will work on it, and every claim will cite the strokes it comes from.</p>}
        {q != null && <div className="msg user"><p>{QUESTIONS[q]}</p></div>}
        {msgs.slice(0, shown).map(([a, text, ev], i) => (
          <div key={q + "-" + i} className={`msg ${AG[a].c}`}>
            <span className="who"><i className={`agent-dot ${AG[a].c}`} />{AG[a].name}</span>
            <p>{text}</p>
            {ev && <div className="ev">{ev.map((e) => <button key={e.label} className="ev-chip" onClick={() => onEvidence?.(e)}>{e.label}</button>)}</div>}
          </div>
        ))}
        {busy && <div className="msg typing"><span className="who"><i className={`agent-dot ${AG[msgs[shown][0]].c}`} />{AG[msgs[shown][0]].name}</span><p className="dots"><i /><i /><i /></p></div>}
      </div>
      <p className="tiny muted">Prototype: answers are templated from the computed match facts; the local LLM is not connected yet.</p>
    </div>
  );
}
