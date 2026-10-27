import { tactics } from "./analysis.js";

// One line from each coach, from the analysed match: their story on the agent home and the preview in the inbox.
export function tips(data) {
  const t = tactics(data.outcomes, "A"), opp = data.names.B;
  const fast = data.rally ? Math.round(Math.max(...data.rally.strokes.map((s) => s.v0))) : null;
  const err = t.errReasons[0];
  return {
    tactics: `${opp}'s winners land most in your ${t.weak[0][0]}: ${t.weak[0][1]} of the ${t.conceded} you conceded. This week we defend it.`,
    analyst: err ? `Your most common own error is ${err[0] === "net" ? "the net" : `hitting ${err[0]}`}: ${err[1]} times in the match. Cut that and the points come back.` : "Your errors are spread out. Let's look at the patterns together.",
    technique: fast ? `Your fastest shot in the replayed rally left the racket at ${fast} km/h. Want to see the flight in 3D?` : "Every shot of the rally is graded. Want to see yours?",
    fitness: "Playing this week? Ask me for a warm-up that fits your body.",
  };
}
