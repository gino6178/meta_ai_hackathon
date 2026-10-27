import { useMemo } from "react";
import CourtMap, { heatGrid } from "../components/CourtMap.jsx";
import { tactics, zoneRect } from "./analysis.js";
import Briefing, { useTyping } from "./Briefing.jsx";

export default function TacticsCoach({ coach, data, hits, runKey, onReplay }) {
  const me = "A", names = data.names, opp = names.B;
  const o = data.outcomes[me];
  const t = useMemo(() => tactics(data.outcomes, me), [data]);
  const defHeat = useMemo(() => heatGrid(o.beaten.map((p) => p.xy), "near", .6), [o]);
  const attHeat = useMemo(() => heatGrid(o.winners.map((p) => p.xy), "far", .6), [o]);
  const goal = hits.find((h) => h.m.kind === "goal") || hits[0];
  const points = o.winners.length + data.outcomes.B.errors.length + data.outcomes.B.winners.length + o.errors.length;
  const zoneBlink = (zs, half, c) => zs.map(([z, n]) => ({ ...zoneRect(z, half), c, label: `${n}` }));

  const messages = useMemo(() => [
    { text: `I went through all ${points} points of your match against ${opp}. You won it, but mostly on ${opp}'s errors: ${t.oppErrors} against your ${t.errors}. Your own winners: ${t.won}; winners you conceded: ${t.conceded}.`, act: {} },
    { title: "Your biggest leak", text: `${t.weak[0][1]} of the ${t.conceded} winners you conceded landed in your ${t.weak[0][0]}. It is flashing on the defence map.`, act: { def: [t.weak[0]] } },
    { title: "Next two", text: `Then your ${t.weak[1][0]} (${t.weak[1][1]}) and ${t.weak[2][0]} (${t.weak[2][1]}). You were beaten mainly by ${t.beatenBy.map(([k, n]) => `${k.toLowerCase()} (${n})`).join(", ")}.`, act: { def: t.weak } },
    { title: `Where you hurt ${opp}`, text: `Your winners land in ${opp}'s ${t.myWinZones.map(([z, n]) => `${z} (${n})`).join(" and ")}. Keep finishing there.`, act: { att: t.myWinZones } },
    ...(goal ? [{ title: "Against your goal", text: `Your memory says: “${goal.m.text}” I have ordered the game plan below around it.`, act: { def: t.weak.slice(0, 2) } }] : []),
    { title: "Game plan", text: `1) Recover half a step toward your forehand after every clear, the ${t.weak[0][0]} is the gap. 2) Lift deep to the backhand rear corner to take the pace off the rushes. 3) When you get a short reply, attack the ${t.myWinZones[0][0]}.`, act: { def: [t.weak[0]], att: [t.myWinZones[0]] } },
  ], [t, goal]);

  const [shown] = useTyping(messages, runKey);
  const act = messages[Math.max(0, shown - 1)].act;

  return (
    <div className="coach-body">
      <Briefing coach={coach} messages={messages} shown={shown} memoryHits={hits} onReplay={onReplay} />
      <div className="coach-visual two-maps">
        <div className="panel">
          <span className="tag def">Defence failure zones</span>
          <h3>Where {opp} beat you</h3>
          <CourtMap half="near" heat={defHeat} heatColor="var(--heat-defence)" points={o.beaten.map((p) => ({ xy: p.xy, c: "#ffd0c9", r: 3.2, o: .85 }))}
            blink={act.def ? zoneBlink(act.def, "near", "var(--heat-defence)") : null} label="Points lost to the opponent's winners" />
        </div>
        <div className="panel">
          <span className="tag">Attack heat zones</span>
          <h3>Where your winners land</h3>
          <CourtMap half="far" heat={attHeat} heatColor="var(--heat-attack)" points={o.winners.map((p) => ({ xy: p.xy, c: "var(--accent)", ring: true, r: 6 }))}
            blink={act.att ? zoneBlink(act.att, "far", "var(--sp3)") : null} label="Your winners on the opponent's half" />
        </div>
      </div>
    </div>
  );
}
