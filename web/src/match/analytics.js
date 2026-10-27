// Rally-level analyses for the match-analysis, live and scouting pages. Pure functions over matches.json.
import { zoneOf } from "../coaches/analysis.js";

let cache;
export function loadMatches() {
  if (!cache) cache = fetch("/data/matches.json").then((r) => r.json());
  return cache;
}

const NET = 6.7;
export const other = (p) => (p === "A" ? "B" : "A");
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const count = (arr, key) => {
  const m = {}; arr.forEach((a) => { const k = key(a); if (k != null) m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : null);
const half = (xy) => (xy[1] < NET ? "far" : "near");
const base = (xy) => (xy[1] < NET ? [3.05, NET - 3.2] : [3.05, NET + 3.2]);
// rotate a point onto the given half (180° about the court centre), so maps read from one side
export const onto = (xy, h) => (!xy ? null : half(xy) === h ? xy : [6.1 - xy[0], 13.4 - xy[1]]);
export const lostBy = (r, p) => r.winner !== p;
export const ownError = (r, p) => r.winner !== p && r.reason !== "winner";
export const ownWinner = (r, p) => r.winner === p && r.reason === "winner";

// ---- score flow -----------------------------------------------------------------------------------------
export function scoreFlow(m) {
  const sets = {};
  m.rallies.forEach((r) => (sets[r.set] = sets[r.set] || []).push(r));
  const runs = { A: 0, B: 0 };
  let cur = null, len = 0;
  m.rallies.forEach((r) => {
    if (r.winner === cur) len++; else { cur = r.winner; len = 1; }
    runs[cur] = Math.max(runs[cur], len);
  });
  return { sets, runs };
}

// ---- points won and lost ---------------------------------------------------------------------------------
export function pointStats(m, p) {
  const R = m.rallies, o = other(p);
  const won = R.filter((r) => r.winner === p), lost = R.filter((r) => r.winner === o);
  const bucket = (r) => (r.shots.length <= 4 ? "1–4 shots" : r.shots.length <= 9 ? "5–9 shots" : "10+ shots");
  const byLen = ["1–4 shots", "5–9 shots", "10+ shots"].map((b) => {
    const rs = R.filter((r) => bucket(r) === b); return { b, n: rs.length, w: pct(rs.filter((r) => r.winner === p).length, rs.length) };
  });
  const serve = R.filter((r) => r.server === p), recv = R.filter((r) => r.server === o);
  const clutch = R.filter((r) => Math.max(r.score[0], r.score[1]) >= 18);
  return {
    total: R.length, won: won.length, lost: lost.length,
    winners: count(R.filter((r) => ownWinner(r, p)), (r) => r.lastType),
    oppErrors: count(R.filter((r) => ownError(r, o)), (r) => r.reason),
    errors: count(R.filter((r) => ownError(r, p)), (r) => `${r.lastType} · ${r.reason}`),
    errorReasons: count(R.filter((r) => ownError(r, p)), (r) => r.reason),
    oppWinners: count(R.filter((r) => ownWinner(r, o)), (r) => r.lastType),
    byLen, serveWin: pct(serve.filter((r) => r.winner === p).length, serve.length), recvWin: pct(recv.filter((r) => r.winner === p).length, recv.length),
    clutchWin: pct(clutch.filter((r) => r.winner === p).length, clutch.length), clutchN: clutch.length,
  };
}

// ---- shot sequences -----------------------------------------------------------------------------------------
export function patterns(m, p) {
  const pairs = {}, triples = {};
  m.rallies.forEach((r) => {
    const s = r.shots;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].p !== p) continue;
      const k2 = `${s[i].type} → ${s[i + 1].type}`;
      (pairs[k2] = pairs[k2] || { n: 0, w: 0 }).n++; if (r.winner === p) pairs[k2].w++;
      if (i < s.length - 2) {
        const k3 = `${s[i].type} → ${s[i + 1].type} → ${s[i + 2].type}`;
        (triples[k3] = triples[k3] || { n: 0, w: 0 }).n++; if (r.winner === p) triples[k3].w++;
      }
    }
  });
  const list = (o, min) => Object.entries(o).filter(([, v]) => v.n >= min).map(([k, v]) => ({ k, n: v.n, w: pct(v.w, v.n) })).sort((a, b) => b.n - a.n);
  const tri = list(triples, 4);
  return { pairs: list(pairs, 5).slice(0, 8), best: [...tri].sort((a, b) => b.w - a.w).slice(0, 4), worst: [...tri].sort((a, b) => a.w - b.w).slice(0, 4) };
}

// ---- footwork and reads --------------------------------------------------------------------------------------
// For every opponent contact: where the player stood (opponent_location), where they next hit (their position),
// the distance covered, the time available and the speed that required. Recovery = distance from base at that moment.
export function footwork(m, p) {
  const reads = [], moves = [];
  m.rallies.forEach((r) => {
    const s = r.shots;
    for (let i = 0; i < s.length; i++) {
      const x = s[i];
      if (x.p !== p && x.opp && s[i + 1] && s[i + 1].p === p && s[i + 1].pos) {
        const d = dist(x.opp, s[i + 1].pos), dt = s[i + 1].t - x.t;
        if (dt > 0.15 && d != null) reads.push({ type: x.type, d, dt, v: d / dt, rec: dist(x.opp, base(x.opp)), from: onto(x.opp, "near"), rally: r.i, set: r.set });
      }
      if (x.p === p && x.pos) {
        const prev = s.slice(0, i).reverse().find((y) => y.p === p && y.pos);
        if (prev) moves.push({ d: dist(prev.pos, x.pos), dt: x.t - prev.t, rally: r.i, set: r.set });
      }
    }
  });
  const byType = count(reads, (r) => r.type).slice(0, 7).map(([t]) => {
    const rs = reads.filter((r) => r.type === t);
    const v = mean(rs.map((r) => r.v)), dt = mean(rs.map((r) => r.dt)), d = mean(rs.map((r) => r.d));
    return { t, n: rs.length, v, dt, d, stretched: pct(rs.filter((r) => r.v > 3.5).length, rs.length), vEarly: mean(rs.map((r) => r.d / (r.dt + 0.4))) };
  }).sort((a, b) => b.v - a.v);
  return {
    reads, byType, recovery: mean(reads.map((r) => r.rec)), reqSpeed: mean(reads.map((r) => r.v)),
    stretched: pct(reads.filter((r) => r.v > 3.5).length, reads.length),
    perShot: mean(moves.map((x) => x.d)), totalMove: moves.reduce((a, x) => a + x.d, 0),
  };
}

// ---- fatigue ---------------------------------------------------------------------------------------------------
export function fatigue(m, p) {
  const fw = footwork(m, p);
  const series = m.rallies.map((r) => {
    const ts = r.shots.map((s) => s.t);
    const gaps = ts.slice(1).map((t, i) => t - ts[i]);
    const reads = fw.reads.filter((x) => x.rally === r.i);
    return { i: r.i, set: r.set, shots: r.shots.length, tempo: mean(gaps), req: reads.length ? mean(reads.map((x) => x.v)) : null,
      rec: reads.length ? mean(reads.map((x) => x.rec)) : null, err: ownError(r, p) ? 1 : 0, won: r.winner === p ? 1 : 0 };
  });
  const roll = (key, k = 10) => series.map((_, i) => {
    const w = series.slice(Math.max(0, i - k + 1), i + 1).map((x) => x[key]).filter((v) => v != null);
    return w.length ? mean(w) : null;
  });
  const third = Math.floor(series.length / 3);
  const seg = (a, b, key) => mean(series.slice(a, b).map((x) => x[key]).filter((v) => v != null));
  const cmp = (key) => ({ early: seg(0, third, key), late: seg(series.length - third, series.length, key) });
  const bySet = [1, 2, 3].map((s) => {
    const rs = series.filter((x) => x.set === s);
    return rs.length ? { s, rec: mean(rs.map((x) => x.rec).filter((v) => v != null)), req: mean(rs.map((x) => x.req).filter((v) => v != null)),
      err: pct(rs.reduce((a, x) => a + x.err, 0), rs.length), tempo: mean(rs.map((x) => x.tempo)), shots: mean(rs.map((x) => x.shots)) } : null;
  }).filter(Boolean);
  return { series, rollRec: roll("rec"), rollReq: roll("req"), rollErr: roll("err"), rollTempo: roll("tempo"),
    rec: cmp("rec"), req: cmp("req"), err: cmp("err"), tempo: cmp("tempo"), bySet };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---- movement load and injury-risk watch -------------------------------------------------------------------------
// Proxy from court positions only (where the player stood at every contact). Lunge: arriving within 2 m of the net after
// moving more than 1.8 m. Cut: a change of direction sharper than 120 degrees between two moves of 0.8 m or more.
// Load = metres + 1.5 per lunge + 1 per cut. A later version replaces this with pose: joint angles and landing impact.
export function load(m, p) {
  const series = m.rallies.map((r) => {
    const path = r.shots.map((s) => (s.p === p ? s.pos : s.opp)).filter(Boolean);
    let metres = 0, lunges = 0, cuts = 0;
    for (let i = 1; i < path.length; i++) {
      const d = dist(path[i - 1], path[i]); metres += d;
      if (d > 1.8 && Math.abs(path[i][1] - 6.7) < 2) lunges++;
      if (i > 1) {
        const a = [path[i - 1][0] - path[i - 2][0], path[i - 1][1] - path[i - 2][1]], b = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]];
        const la = Math.hypot(...a), lb = Math.hypot(...b);
        if (la > .8 && lb > .8 && (a[0] * b[0] + a[1] * b[1]) / (la * lb) < -0.5) cuts++;
      }
    }
    return { i: r.i, set: r.set, rally: r.rally, metres, lunges, cuts, load: metres + 1.5 * lunges + cuts, shots: r.shots.length };
  });
  const bySet = [1, 2, 3].map((st) => {
    const rs = series.filter((x) => x.set === st);
    return rs.length ? { s: st, n: rs.length, lunges: rs.reduce((a, x) => a + x.lunges, 0), cuts: rs.reduce((a, x) => a + x.cuts, 0),
      metres: rs.reduce((a, x) => a + x.metres, 0), perRally: mean(rs.map((x) => x.load)) } : null;
  }).filter(Boolean);
  const roll = series.map((_, i) => mean(series.slice(Math.max(0, i - 9), i + 1).map((x) => x.load)));
  const third = Math.floor(series.length / 3);
  const seg = (a, b) => mean(series.slice(a, b).map((x) => x.load));
  const early = seg(0, third), late = seg(series.length - third, series.length);
  const peak = [...series].sort((a, b) => b.load - a.load).slice(0, 3);
  const g1 = bySet[0], gl = bySet[bySet.length - 1];
  const flags = [];
  if (late > early * 1.15) flags.push({ lvl: "high", t: `Load per rally is ${Math.round((late / early - 1) * 100)}% higher in the last third of the match than in the first.` });
  if (gl && g1 && gl !== g1 && gl.lunges / gl.n > (g1.lunges / g1.n) * 1.3)
    flags.push({ lvl: "high", t: `Front-court lunges per rally rose from ${(g1.lunges / g1.n).toFixed(1)} in game 1 to ${(gl.lunges / gl.n).toFixed(1)} in game ${gl.s}: the knee takes most of that load.` });
  peak.filter((x) => x.load > early * 2.2).forEach((x) => flags.push({ lvl: "watch", t: `Game ${x.set}, rally ${x.rally}: ${x.shots} shots, ${x.metres.toFixed(0)} m, ${plural(x.lunges, "lunge")} and ${plural(x.cuts, "sharp cut")} in one point.` }));
  return { series, bySet, roll, early, late, peak, flags };
}

// ---- profile used by comparison and scouting -------------------------------------------------------------
export function profile(m, p) {
  const shots = m.rallies.flatMap((r) => r.shots.filter((s) => s.p === p));
  const attacks = shots.filter((s) => /Smash|Rush|Drop|Drive|Push/.test(s.type));
  const ps = pointStats(m, p), fw = footwork(m, p);
  const land = shots.filter((s) => s.land).map((s) => ({ xy: onto(s.land, "far") }));
  const zones = count(land, (x) => zoneOf(x.xy, "far")).slice(0, 3);
  const beaten = m.rallies.filter((r) => ownWinner(r, other(p))).map((r) => r.shots[r.shots.length - 1]).filter((s) => s.land).map((s) => ({ xy: onto(s.land, "near") }));
  return {
    shots: shots.length, rallies: m.rallies.length, winPct: pct(ps.won, ps.total), won: ps.won, lost: ps.lost,
    winners: ps.winners.reduce((a, [, n]) => a + n, 0), errors: ps.errorReasons.reduce((a, [, n]) => a + n, 0),
    smashShare: pct(shots.filter((s) => /Smash/.test(s.type)).length, shots.length), attackShare: pct(attacks.length, shots.length),
    avgRally: mean(m.rallies.map((r) => r.shots.length)), reqSpeed: fw.reqSpeed, recovery: fw.recovery, stretched: fw.stretched,
    mix: count(shots, (s) => s.type).slice(0, 6).map(([t, n]) => ({ t, p: pct(n, shots.length) })),
    targets: zones, weak: count(beaten, (x) => zoneOf(x.xy, "near")).slice(0, 3), land, beaten,
    serveShort: pct(shots.filter((s) => s.type === "Short serve").length, shots.filter((s) => /serve/.test(s.type)).length),
  };
}

export const sideOf = (m, name) => Object.entries(m.names).find(([, n]) => n === name)?.[0];
