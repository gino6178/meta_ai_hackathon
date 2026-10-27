import { useEffect, useState } from "react";
import { agentPlaybooks, agentKb } from "../agent.js";

// How the coach agents are learning: rules adopted into their playbooks, changes waiting for the player's approval,
// and the research behind them. Null until the gateway answers (or if it cannot be reached).
export function useLearning() {
  const [l, setL] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([agentPlaybooks(), agentKb().catch(() => null)]).then(([pb, kb]) => {
      if (!live) return;
      const all = Object.entries(pb.playbooks || {}).flatMap(([coach, p]) => (p.proposals || []).map((x) => ({ ...x, coach })));
      setL({
        learned: all.filter((x) => x.status === "adopted").length,
        waiting: all.filter((x) => x.status === "pending"),
        proposals: all.length,
        papers: kb?.stats?.papers ?? null,
        findings: kb?.stats?.findings ?? null,
      });
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return l;
}
