import { useMemo, useState } from "react";
import Body3D from "../components/Body3D.jsx";
import { REGIONS, DRILLS, findings, score } from "../components/BodyMap.jsx";
import { mentions } from "../memory.js";
import Briefing, { useTyping } from "./Briefing.jsx";

// Low-impact swaps used when memory reports a knee or ankle problem.
const LOW_IMPACT = {
  "Split squat jumps, 3 × 6 per side": "Tempo split squats (3 s down), 3 × 8 per side",
  "Pogo hops, 3 × 20 s": "Isometric calf holds on a step, 3 × 30 s",
  "Split-step reaction drill, 6 × 20 s": "Reaction lunges without the hop, 6 × 20 s",
};

export default function FitnessCoach({ coach, data, hits, runKey, onReplay }) {
  const ins = data.insights, rally = data.rally;
  const scores = useMemo(() => score(findings(ins, rally)), [ins, rally]);
  const ranked = Object.keys(REGIONS).sort((a, b) => scores[b].v - scores[a].v).filter((k) => scores[k].level !== "low");
  const top = ranked.slice(0, 4);
  const joint = mentions(hits, /knee|ankle/i);
  const jointNote = hits.find((h) => /knee|ankle/i.test(h.m.text));
  const drills = (r) => DRILLS[r].map((d) => (joint && LOW_IMPACT[d]) || d);

  const messages = useMemo(() => {
    const msgs = [{
      text: `Your match loads ${top.length} muscle groups more than the rest: ${top.map((r) => REGIONS[r].name.toLowerCase()).join(", ")}. They are flashing on the model.`,
      act: { pulse: top, sel: top[0], view: "front" },
    }];
    top.slice(0, 3).forEach((r) => {
      const p = scores[r].parts[0];
      msgs.push({
        title: `${REGIONS[r].name} · ${scores[r].level} priority`,
        text: `Why: ${p.f.title.toLowerCase()}; ${p.f.fact}. Train: ${drills(r).slice(0, 2).join("; ")}.`,
        act: { pulse: [r], sel: r, view: REGIONS[r].view },
      });
    });
    if (joint) msgs.push({
      title: "Adjusted for you",
      text: `Your memory says: “${jointNote.m.text}” So this week every jump drill is replaced with a low-impact version (tempo split squats, isometric calf holds).`,
      act: { pulse: ["quads", "calves"], sel: "calves", view: "back" },
    });
    msgs.push({
      title: "This week's gym block",
      text: `Two sessions, 45 minutes: legs and first step (${REGIONS[top[0]].name.toLowerCase()}, ${REGIONS[top[1]]?.name.toLowerCase() ?? "calves"}), then forearm and trunk rotation. Re-test after your next recorded match.`,
      act: { pulse: top, sel: top[0], view: "side" },
    });
    return msgs;
  }, [scores, joint]);

  const [shown] = useTyping(messages, runKey);
  const act = messages[Math.max(0, shown - 1)].act;
  const [manual, setManual] = useState(null);
  const sel = manual ?? act.sel;

  return (
    <div className="coach-body">
      <Briefing coach={coach} messages={messages} shown={shown} memoryHits={hits} onReplay={() => { setManual(null); onReplay(); }} />
      <div className="coach-visual">
        <Body3D scores={scores} sel={sel} onSel={setManual} view={act.view} pulse={manual ? [manual] : act.pulse} height={560} />
        <div className="fit-card panel">
          <span className={`prio ${scores[sel].level}`}>{scores[sel].level} priority</span>
          <h3>{REGIONS[sel].name}</h3>
          <p className="tiny muted">{REGIONS[sel].muscles.join(" · ")}</p>
          <ul className="drills">{drills(sel).map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
