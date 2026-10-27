import { useMemo, useState } from "react";
import { coachById, COACHES } from "../coaches/personas.js";
import Avatar from "../coaches/Avatar.jsx";
import FitnessCoach from "../coaches/FitnessCoach.jsx";
import TacticsCoach from "../coaches/TacticsCoach.jsx";
import TechniqueCoach from "../coaches/TechniqueCoach.jsx";
import AnalystCoach from "../coaches/AnalystCoach.jsx";
import { retrieve } from "../memory.js";
import { go } from "../App.jsx";
import CoachChat from "../coaches/CoachChat.jsx";

const VIEWS = { fitness: FitnessCoach, tactics: TacticsCoach, technique: TechniqueCoach, analyst: AnalystCoach };

export default function Coach({ id, data }) {
  const coach = coachById(id) || COACHES[0];
  const [run, setRun] = useState(0);
  const hits = useMemo(() => retrieve(coach.query, 2), [coach, run]);
  if (!data) return <div className="page"><p className="muted">Loading the analysis…</p></div>;
  const View = VIEWS[coach.id];

  return (
    <div className="page coach-page" style={{ "--cc": coach.color }}>
      <header className="coach-head">
        <Avatar coach={coach} size={88} talking />
        <div>
          <span className="tag">{coach.kicker} · runs on this device</span>
          <h1 className="h1">{coach.name}</h1>
          <p className="muted">{coach.role}</p>
        </div>
        <nav className="coach-switch" aria-label="Other coaches">
          <span className="tiny muted">Switch coach</span>
          {COACHES.filter((c) => c.id !== coach.id).map((c) => (
            <button key={c.id} onClick={() => go(`coach/${c.id}`)} title={`${c.name} · ${c.role}`} aria-label={`Open ${c.name}, ${c.role}`}><Avatar coach={c} size={44} /></button>
          ))}
          <button className="btn ghost sm" onClick={() => go("roundtable")}>Round table</button>
        </nav>
      </header>
      <View key={coach.id} coach={coach} data={data} hits={hits} runKey={coach.id + run} onReplay={() => setRun((r) => r + 1)} />
      <CoachChat key={"chat-" + coach.id} coach={coach} onRemember={() => setRun((r) => r + 1)} />
    </div>
  );
}
