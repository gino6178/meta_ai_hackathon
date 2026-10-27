import { useMemo, useState } from "react";
import CourtMap, { heatGrid } from "../components/CourtMap.jsx";
import { habits, zoneRect } from "./analysis.js";
import Briefing, { useTyping } from "./Briefing.jsx";

export default function AnalystCoach({ coach, data, hits, runKey, onReplay }) {
  const [who, setWho] = useState("B");
  const name = data.names[who];
  const h = useMemo(() => habits(data.outcomes, who), [data, who]);
  const shots = data.outcomes[who].shots;
  const landHeat = useMemo(() => heatGrid(shots.filter((s) => s.land).map((s) => s.land), "far", .55), [shots]);
  const posHeat = useMemo(() => heatGrid(shots.filter((s) => s.pos).map((s) => s.pos), "near", .45), [shots]);
  const scout = hits.find((x) => /opponent|scout/i.test(x.m.text));
  const blinkOf = (zs, half, c) => zs.map(([z, n]) => ({ ...zoneRect(z, half), c, label: `${n}` }));
  const list = (arr) => arr.map((x) => `${x.t.toLowerCase()} ${x.p}%`).join(", ");

  const messages = useMemo(() => [
    { text: `Profile of ${name} from ${h.n} shots in this match.${who === "B" ? " This is your opponent, so read it as a scouting report." : ""}${scout ? ` (Memory: “${scout.m.text}”)` : ""}`, act: {} },
    { title: "Shot mix", text: `Most used: ${list(h.mix.slice(0, 4))}.`, act: { tab: "mix" } },
    { title: "Attacking style", text: `${h.attacks} attacking shots: ${list(h.attackMix)}. Outright winners came from ${h.winnerTypes.map(([t, n]) => `${t.toLowerCase()} (${n})`).join(", ")}.`, act: { tab: "attack" } },
    { title: "Favourite targets", text: `Lands most often in the ${h.landZones.map(([z, n]) => `${z} (${n})`).join(", ")}, read from the receiver's side.`, act: { land: h.landZones } },
    { title: "Where they play from", text: `Takes most shots from the ${h.posZones.map(([z, n]) => `${z} (${n})`).join(", ")} of their own half.`, act: { pos: h.posZones } },
    { title: "Habits under pressure", text: `Facing a lift or clear (${h.liftN} times): ${list(h.replyToLift)}. Facing a net shot (${h.netN}): ${list(h.replyToNet)}.`, act: { tab: "reply" } },
    { title: "Serve", text: `${h.shortServe}% short serves out of ${h.serves}.`, act: { tab: "mix" } },
  ], [h, who, scout]);

  const [shown] = useTyping(messages, runKey + who);
  const act = messages[Math.max(0, shown - 1)].act;
  const tab = act.tab;

  return (
    <div className="coach-body">
      <div>
        <div className="seg" role="radiogroup" aria-label="Player">
          {Object.entries(data.names).map(([k, n]) => (
            <button key={k} role="radio" aria-checked={who === k} onClick={() => setWho(k)}>{n}{k === "A" ? " (you)" : ""}</button>
          ))}
        </div>
        <Briefing coach={coach} messages={messages} shown={shown} memoryHits={hits} onReplay={onReplay} />
      </div>
      <div className="coach-visual">
        <div className="two-maps">
          <div className="panel">
            <span className="tag">Landing heat zones</span>
            <h3>Where {name}'s shots land</h3>
            <CourtMap half="far" heat={landHeat} heatColor="var(--heat-attack)" blink={act.land ? blinkOf(act.land, "far", "var(--sp3)") : null} label="Shot landing density" />
          </div>
          <div className="panel">
            <span className="tag">Court position</span>
            <h3>Where {name} hits from</h3>
            <CourtMap half="near" heat={posHeat} heatColor="var(--near)" blink={act.pos ? blinkOf(act.pos, "near", "var(--near)") : null} label="Hitting position density" />
          </div>
        </div>
        <div className="panel habit-bars">
          {[["mix", "Shot mix", h.mix], ["attack", "Attack types", h.attackMix], ["reply", "Reply to a lift or clear", h.replyToLift]].map(([k, title, rows]) => (
            <div key={k} className={tab === k ? "on" : ""}>
              <h4 className="panel-h">{title}</h4>
              <ul className="bars">
                {rows.map((r) => <li key={r.t}><span>{r.t}</span><i style={{ width: `${r.p}%` }} /><b className="mono">{r.p}%</b></li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
