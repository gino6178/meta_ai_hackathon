// The caption for a highlight reel on Instagram or Facebook, written by Muse Glimmer from the rallies in the reel.
// Like every reply, it is checked: a number in the caption must come from the rallies, or the caption is written
// again, then replaced by the template.
import { chat } from "./llm.js";

const nums = (t) => String(t).match(/\d+(?:[.:]\d+)?/g) || [];
function allowed(picks) {
  const set = new Set([String(picks.length)]);
  for (const k of [1, 2, 3, 4, 5]) set.add(String(k));
  for (const p of picks) {
    [p.set, p.shots, ...(p.score || [])].forEach((x) => x != null && set.add(String(x)));
    for (const w of p.why || []) nums(w).forEach((x) => set.add(x));
    if (p.score?.length === 2) set.add(`${p.score[0]}–${p.score[1]}`);
  }
  return set;
}
const ok = (text, set) => nums(text.replace(/(\d+)[–-](\d+)/g, "$1 $2")).every((n) => set.has(n));
const template = ({ player, event, picks }) => ({
  text: `${player}: my top ${picks.length} from ${event}. ${picks.map((p) => (p.why || [])[0]).filter(Boolean).join(" · ")}.\n\n#badminton #rally #ShuttleCoach`,
  by: "rules",
});

export async function caption({ player = "Me", event = "", picks = [] } = {}) {
  if (!picks.length) return template({ player, event, picks });
  const list = picks.map((p, i) => `${i + 1}. ${(p.why || []).join(", ")} (game ${p.set}, ${p.shots} shots${p.last ? `, ended with a ${String(p.last).toLowerCase()}` : ""})`).join("\n");
  const sys = `You write the caption for a badminton player's highlight reel on Instagram and Facebook.
Player: ${player}. Event: ${event}.
The rallies in the reel, in order:
${list}
Return JSON only: {"caption": string, "hashtags": [3 to 5 words without #]}
- "caption": one or two short sentences in the player's voice ("my"), upbeat and specific about the rallies. At most one emoji.
- Only these numbers may appear: ${[...allowed(picks)].join(", ")}. Do not say who won the match.
- English only.`;
  const msgs = [{ role: "system", content: sys }, { role: "user", content: "Write it." }];
  const set = allowed(picks);
  try {
    for (let tries = 0; tries < 2; tries++) {
      const r = await chat(msgs, { maxTokens: 220, temperature: tries ? 0.2 : 0.7 });
      const j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ["null"])[0] || "null");
      const text = typeof j?.caption === "string" ? j.caption.trim() : "";
      const tags = (Array.isArray(j?.hashtags) ? j.hashtags : []).map((x) => String(x).replace(/[^\p{L}\p{N}_]/gu, "")).filter(Boolean).slice(0, 5);
      if (text && ok(text, set)) return { text: `${text}\n\n${[...new Set([...tags, "ShuttleCoach"])].map((x) => `#${x}`).join(" ")}`, by: "model", timing: r.timing };
      msgs.push({ role: "assistant", content: r.text }, { role: "user", content: `Use only the allowed numbers (${[...set].join(", ")}) and return the JSON again.` });
    }
  } catch { /* the model is unavailable: the template below */ }
  return template({ player, event, picks });
}
