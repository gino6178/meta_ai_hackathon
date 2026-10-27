// The facts sheet: every number a coach agent is allowed to say, computed by the same analytics the web app uses.
// The language model only phrases these; the verifier rejects any figure that is not on this sheet.
import fs from "node:fs";
import path from "node:path";
import { pointStats, footwork, load, patterns, ownError, ownWinner } from "../../web/src/match/analytics.js";
import { zoneOf } from "../../web/src/coaches/analysis.js";

const DATA = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../../web/public/data");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const flip = (xy) => (xy[1] < 6.7 ? [6.1 - xy[0], 13.4 - xy[1]] : xy);

let cache = null;
export function factSheet(p = "A") {
  if (cache?.p === p) return cache;
  const m = read("matches.json").matches[0], pose = fs.existsSync(path.join(DATA, "pose.json")) ? read("pose.json") : null;
  const opp = p === "A" ? "B" : "A", name = m.names[p], oname = m.names[opp];
  const ps = pointStats(m, p), fw = footwork(m, p), ld = load(m, p), pt = patterns(m, p);
  const won = m.rallies.filter((r) => r.winner === p).length, lost = m.rallies.length - won;
  const errs = Object.fromEntries(ps.errorReasons), errAll = ps.errorReasons.reduce((a, [, n]) => a + n, 0);
  const beaten = m.rallies.filter((r) => ownWinner(r, opp)).map((r) => r.shots[r.shots.length - 1].land).filter(Boolean).map((l) => zoneOf(flip(l), "near"));
  const zones = Object.entries(beaten.reduce((a, z) => ({ ...a, [z]: (a[z] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const sets = [1, 2, 3].map((s) => m.rallies.filter((r) => r.set === s).pop()).filter(Boolean).map((r) => `${r.score[0]}-${r.score[1]}`);
  const g = (s) => m.rallies.filter((r) => r.set === s);
  const netBySet = [1, 2, 3].map((s) => g(s).filter((r) => ownError(r, p) && r.reason === "net").length);
  const hard = fw.byType[0];
  const knee = pose?.events.filter((e) => e.side === (p === "A" ? "near" : "far")) ?? [];
  const deep = knee.filter((e) => e.flex >= 90);

  // one number per fact where possible, each labelled by what it counts: a small model then cannot attach the
  // total of one fact to the label of another
  const zone = zones[0], right = knee.filter((e) => e.leg === "right").length;
  const F = [
    ["match", `${name} vs ${oname}, ${m.event}; game scores ${sets.join(", ")}`],
    ["points", `${name} won ${won} points and lost ${lost}, out of ${m.rallies.length}`],
    ["errors", `${name}'s own errors in total: ${errAll}`],
    ["errtypes", `${name}'s own errors by type: ${ps.errorReasons.map(([k, n]) => `${k} = ${n}`).join(", ")}`],
    ["net", `${name}'s net errors in the whole match: ${errs.net ?? 0}`],
    ["netgame", `${name}'s net errors by game: game 1 = ${netBySet[0]}, game 2 = ${netBySet[1]}, game 3 = ${netBySet[2]}`],
    ["beaten", `Winners ${oname} hit against ${name}, in total: ${beaten.length}`],
    ["zone", `Zone where most of ${oname}'s winners landed: ${name}'s ${zone?.[0]}, with ${zone?.[1]} winners`],
    ["read", `Hardest ${oname} shot for ${name} to reach: the ${hard.t.toLowerCase()}, needing ${hard.v.toFixed(2)} m/s`],
    ["readpct", `Share of ${oname}'s ${hard.t.toLowerCase()}s where ${name} was stretched (over 3.5 m/s): ${hard.stretched}%`],
    ["stretch", `Share of all shots ${name} needed more than 3.5 m/s to reach: ${fw.stretched}%`],
    ["load", ld.flags[0] ? ld.flags[0].t : `Load per rally stayed within 15% of the opening third`],
    ["lunges", `Front-court lunges per rally: game 1 = ${ld.bySet[0] ? (ld.bySet[0].lunges / ld.bySet[0].n).toFixed(1) : "-"}, game 3 = ${ld.bySet[2] ? (ld.bySet[2].lunges / ld.bySet[2].n).toFixed(1) : "-"}`],
    ["pattern", pt.worst[0] ? `${name} wins only ${pt.worst[0].w}% of rallies that contain ${pt.worst[0].k}` : "No losing pattern stands out"],
    ...(knee.length ? [
      ["kneedeep", `Knee bends past 90 degrees in the replayed rally: ${deep.length}, the deepest ${Math.max(...knee.map((e) => Math.round(e.flex)))} degrees (bends past 90 degrees load the knee most)`],
      ["kneeright", `Loading knee bends on the right leg in the replayed rally: ${right} of ${knee.length}`],
    ] : []),
  ].map(([id, text], i) => ({ id: `F${i + 1}`, key: id, text }));
  const numbers = new Set(F.flatMap((f) => (f.text.match(/\d+(?:\.\d+)?/g) || []).map(Number)));
  cache = { p, name, oname, event: m.event, facts: F, numbers };
  return cache;
}

export const factsText = (sheet) => sheet.facts.map((f) => `[${f.id}] ${f.text}`).join("\n");
