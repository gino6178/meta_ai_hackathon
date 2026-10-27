// Verifier, sentence by sentence: every number in a coach reply must appear in a fact cited in the SAME sentence
// (written [F4] or (F4)). The only exceptions are numbers the player wrote or that are in their memory, and small
// counts up to 10 (sets, reps, days). A number that exists somewhere else on the facts sheet is not enough:
// "25% of your rallies (F3)" fails when 25 is not part of F3.
const NUM = /\d+(?:[.,]\d+)?/g;
const CITE = /[[(]([FE])(\d+)[\])]/g;
const nums = (s) => (s.match(NUM) || []).map((n) => +n.replace(",", "."));

export function check(reply, sheet, extraText = "", evidence = []) {
  const extra = new Set(nums(extraText));
  // facts [F#] and research findings [E#]: a number may only come from the item cited in its sentence
  const byId = Object.fromEntries([...sheet.facts.map((f) => [f.id, new Set(nums(f.text))]), ...evidence.map((e) => [e.id, new Set(nums(e.claim))])]);
  // sentence ends: ". " in English (so 3.69 stays one number), or 。！？ in Chinese, which needs no space
  const sentences = reply.split(/(?<=[.!?])\s+|(?<=[。！？])/);
  const bad = [];
  let count = 0;
  for (const s of sentences) {
    const cited = [...s.matchAll(CITE)].map((m) => `${m[1]}${m[2]}`);
    const allowed = new Set(cited.flatMap((id) => [...(byId[id] || [])]));
    const found = nums(s.replace(CITE, ""));
    count += found.length;
    // a training prescription may only use small counts: a match figure must not turn into "24 reps"
    const drill = /this week|drill|practi[cs]e|session|reps?\b|sets?\b|練習|訓練|本週|這週|本周|每組|每天/i.test(s);
    for (const n of found) {
      const small = Number.isInteger(n) && n >= 0 && n <= 10;
      const matchFigure = sheet.numbers.has(n) && !allowed.has(n);
      if (drill && !small && !extra.has(n)) {
        // in a prescription, ordinary training values (30 s, 20 cm, 45 min) are fine; a match figure is not
        if (matchFigure || n > 60) bad.push(`${n} (match figure used as a training dose)`);
      } else if (!allowed.has(n) && !extra.has(n) && !small) bad.push(`${n}${cited.length ? ` (not in ${cited.join(", ")})` : " (no fact cited)"}`);
    }
  }
  return { ok: bad.length === 0, numbers: count, bad };
}
