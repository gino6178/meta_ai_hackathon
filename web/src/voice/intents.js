import { pointStats, footwork, load, ownError, ownWinner } from "../match/analytics.js";
import { tactics } from "../coaches/analysis.js";

// Turns a transcribed question into an answer from the match database plus the view that shows it.
// Rules, not a language model: every number comes from the same analytics the pages use.
const NUM = { one: 1, two: 2, three: 3, first: 1, second: 2, third: 3, "1": 1, "2": 2, "3": 3 };

function who(text, m) {
  const t = text.toLowerCase();
  const last = (n) => n.split(" ")[0].toLowerCase();
  if (t.includes(last(m.names.B)) || /\b(opponent|they|their|them)\b/.test(t)) return "B";
  return "A"; // "my", "I", the coached player by default
}

function game(text) {
  const g = text.toLowerCase().match(/\b(?:game|set)\s+(one|two|three|first|second|third|[123])\b|\b(first|second|third)\s+(?:game|set)\b/);
  return g ? NUM[g[1] || g[2]] : null;
}

const sub = (m, g) => (g ? { ...m, rallies: m.rallies.filter((r) => r.set === g) } : m);

export const EXAMPLES = ["How many net errors did I make in game three?", "Where is my opponent beating me?", "Show my highlights",
  "Am I getting tired?", "What was the fastest smash?", "Plan my training week", "I want to play doubles on Thursday evening"];

export function answer(raw, { m, data }) {
  const text = raw.toLowerCase().replace(/[.,!?]/g, " ");
  const p = who(text, m), g = game(text), mm = sub(m, g), name = m.names[p], where = g ? ` in game ${g}` : "";
  const has = (re) => re.test(text);

  // "I want to play", "book a court", "約球": the Play agent takes it from here
  if (has(/want to play|book a court|find a game|play (on|this|next|tomorrow|tonight)|sparring|約球|打球|訂場|找人打/)) return { say: "Opening Play: I'll find a court and people to play with.", go: `play?q=${encodeURIComponent(raw)}` };
  if (has(/next point|what should i do|between points|right now|next rally/)) {
    const b = typeof window !== "undefined" && window.__liveBrief; // set by live mode after every rally
    return b ? { say: b.lines.map((l) => l.t).join(" "), go: null } : { say: "Start live mode and I will brief you between points.", go: "live" };
  }
  if (has(/\bnet\b/) && has(/error|mistake|fault|miss/)) {
    const net = mm.rallies.filter((r) => ownError(r, p) && r.reason === "net").length;
    const lost = mm.rallies.filter((r) => r.winner !== p).length;
    return { say: `${name} hit ${net} net errors${where}, out of ${lost} points lost.`, go: "match?tab=points" };
  }
  if (has(/error|mistake/)) {
    const ps = pointStats(mm, p);
    const list = ps.errorReasons.map(([k, n]) => `${n} ${k}`).join(", ");
    return { say: `${name}'s own errors${where}: ${list || "none"}.`, go: "match?tab=points" };
  }
  if (has(/score|who won|result/)) {
    const sets = [1, 2, 3].map((s) => m.rallies.filter((r) => r.set === s).pop()).filter(Boolean);
    return { say: `${m.names.A} against ${m.names.B}: ${sets.map((r) => `${r.score[0]}–${r.score[1]}`).join(", ")}.`, go: "match?tab=flow" };
  }
  if (has(/highlight|best (rallies|points|shots)|reel|top five/)) return { say: `Opening the top five rallies for ${name}. You can export them as a vertical video.`, go: "match?tab=reel" };
  if (has(/tired|fatigue|injur|knee|ankle|load/)) {
    const ld = load(m, p);
    return { say: ld.flags[0]?.t ?? `No load warning: ${name}'s load per rally stayed close to the opening level.`, go: "match?tab=fatigue" };
  }
  if (has(/footwork|reach|stretch|slow|late/)) {
    const fw = footwork(mm, p);
    return { say: `${name} needed more than 3.5 metres per second on ${fw.stretched}% of shots${where}; the hardest to reach was the ${fw.byType[0]?.t.toLowerCase()}.`, go: "match?tab=footwork" };
  }
  if (has(/smash|fastest|speed/)) {
    const s = [...data.rally.strokes].sort((a, b) => b.v0 - a.v0)[0];
    return { say: `The fastest shot in the replayed rally was a ${s.type.toLowerCase()} at ${Math.round(s.v0)} kilometres per hour, from the 3D track.`, go: "report" };
  }
  if (has(/heat ?map|beat|beating|losing|defen[cs]e|weak/)) {
    const t = tactics(data.outcomes, "A");
    return { say: `${m.names.B}'s winners land most in your ${t.weak[0][0]}: ${t.weak[0][1]} of ${t.conceded}. It is on the heat map.`, go: "match" };
  }
  if (has(/plan|schedule|week|line up/)) return { say: "Starting the Autopilot: it lines up your week with the people you play best with.", go: "autopilot?run=1" };
  if (has(/muscle|body|hurt|sore|pain/)) return { say: "Opening your body log: tell me what hurts.", go: "body" };
  if (has(/habit|pattern|scout|opponent/)) return { say: `Opening the scouting report on ${m.names.B}.`, go: "scout" };
  if (has(/\blive\b|court ?side/)) return { say: "Switching to live mode.", go: "live" };
  if (has(/memory|remember/)) return { say: "Opening your player memory.", go: "memory" };
  return { say: `I heard “${raw}”. Try: ${EXAMPLES.slice(0, 3).join(" · ")}`, go: null };
}

export { ownWinner };
