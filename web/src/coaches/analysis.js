// Deterministic analyses behind the four coach agents. The agents only explain these numbers.
import { COURT } from "../data.js";

const NET_H = 1.524;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const count = (arr, key) => {
  const m = {}; arr.forEach((a) => { const k = key(a); if (k != null) m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

// ---- zones -----------------------------------------------------------------------------------------------
// Rows by distance from the net; columns named from the receiving player's view (right-handed): on the near half
// the backhand is image-left, on the far half (player faces the camera) it is image-right.
const ROWS = { front: [0, 2.2], mid: [2.2, 4.6], rear: [4.6, 6.7] };
const COLS = { left: [0, 2.2], middle: [2.2, 3.9], right: [3.9, 6.1] };
export function zoneOf([x, y], half) {
  const d = Math.abs(y - COURT.NET);
  const row = d < 2.2 ? "front" : d < 4.6 ? "mid" : "rear";
  const side = x < 2.2 ? "left" : x > 3.9 ? "right" : "middle";
  const col = side === "middle" ? "middle" : (half === "near") === (side === "left") ? "backhand" : "forehand";
  return `${row} ${col}`;
}
export function zoneRect(name, half) {
  const [row, col] = name.split(" ");
  const [d0, d1] = ROWS[row];
  const side = col === "middle" ? "middle" : (half === "near") === (col === "backhand") ? "left" : "right";
  const [x0, x1] = COLS[side];
  const y0 = half === "near" ? COURT.NET + d0 : COURT.NET - d1, y1 = half === "near" ? COURT.NET + d1 : COURT.NET - d0;
  return { x0, x1, y0, y1 };
}
export const topZones = (pts, half, k = 3) => count(pts, (p) => (p.xy || p.land || p.pos ? zoneOf(p.xy || p.land || p.pos, half) : null)).slice(0, k);

// ---- tactics (badminton coach) ------------------------------------------------------------------------------
export function tactics(outcomes, me = "A") {
  const op = me === "A" ? "B" : "A";
  const mine = outcomes[me], theirs = outcomes[op];
  const weak = topZones(mine.beaten, "near", 3);
  const beatenBy = count(mine.beaten, (p) => p.type).slice(0, 3);
  const theirTargets = topZones(theirs.attacks, "far", 2); // where the opponent attacks (from the opponent's side = my half)
  const myWinZones = topZones(mine.winners, "far", 2);
  const errReasons = count(mine.errors, (e) => e.reason);
  return { weak, beatenBy, theirTargets, myWinZones, errReasons, conceded: mine.beaten.length, won: mine.winners.length, errors: mine.errors.length, oppErrors: theirs.errors.length };
}

// ---- technique (shot quality) ---------------------------------------------------------------------------------
function netClearance(rally, s) {
  for (let i = s.f0 + 1; i <= s.f1; i++) {
    const a = rally.frames[i - 1]?.xyz, b = rally.frames[i]?.xyz;
    if (!a || !b) continue;
    if ((a[1] - COURT.NET) * (b[1] - COURT.NET) <= 0) {
      const u = (COURT.NET - a[1]) / (b[1] - a[1] || 1e-6);
      return a[2] + u * (b[2] - a[2]) - NET_H;
    }
  }
  return null;
}

// Heuristic targets per stroke (coaching rules of thumb for elite singles, documented in the UI).
const RULES = {
  Smash: (m) => [m.v0 >= 180 ? 2 : m.v0 >= 140 ? 1 : 0, m.contactH >= 2.6 ? 2 : m.contactH >= 2.3 ? 1 : 0, m.descent >= 12 ? 2 : m.descent >= 6 ? 1 : 0],
  Clear: (m) => [m.depth <= 1.0 ? 2 : m.depth <= 2.0 ? 1 : 0, m.apex >= 4.2 ? 2 : m.apex >= 3.6 ? 1 : 0],
  Lift: (m) => [m.depth <= 1.2 ? 2 : m.depth <= 2.2 ? 1 : 0, m.apex >= 3.5 ? 2 : m.apex >= 3.0 ? 1 : 0],
  "Net shot": (m) => [m.clear != null && m.clear <= 0.25 ? 2 : m.clear != null && m.clear <= 0.5 ? 1 : 0, m.fromNet <= 1.5 ? 2 : m.fromNet <= 2.2 ? 1 : 0],
  Drop: (m) => [m.fromNet <= 2.0 ? 2 : m.fromNet <= 3.0 ? 1 : 0, m.clear != null && m.clear <= 0.6 ? 2 : 1],
  Drive: (m) => [m.clear != null && m.clear <= 0.5 ? 2 : 1, m.flight <= 0.9 ? 2 : m.flight <= 1.2 ? 1 : 0],
  "Short serve": (m) => [m.clear != null && m.clear <= 0.25 ? 2 : m.clear != null && m.clear <= 0.45 ? 1 : 0],
};
const NOTE = {
  Smash: (m) => `${Math.round(m.v0)} km/h off a ${m.contactH.toFixed(2)} m contact, descending ${m.descent.toFixed(0)}°`,
  Clear: (m) => `apex ${m.apex.toFixed(2)} m, taken ${m.depth.toFixed(1)} m from the baseline`,
  Lift: (m) => `apex ${m.apex.toFixed(2)} m, taken ${m.depth.toFixed(1)} m from the baseline`,
  "Net shot": (m) => `${m.clear != null ? `${(m.clear * 100).toFixed(0)} cm over the tape` : "net crossing not tracked"}, ${m.fromNet.toFixed(1)} m from the net`,
  Drop: (m) => `lands ${m.fromNet.toFixed(1)} m from the net${m.clear != null ? `, ${(m.clear * 100).toFixed(0)} cm over the tape` : ""}`,
  Drive: (m) => `${m.clear != null ? `${(m.clear * 100).toFixed(0)} cm over the tape` : "flat"}, ${m.flight.toFixed(2)} s in the air`,
  "Short serve": (m) => `${m.clear != null ? `${(m.clear * 100).toFixed(0)} cm over the tape` : "net crossing not tracked"}`,
};

export function shotQuality(rally) {
  return rally.strokes.map((s) => {
    const p0 = s.contact, p1 = s.end;
    const towardFar = p1[1] < p0[1];
    const depth = towardFar ? p1[1] : COURT.L - p1[1];
    const horiz = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const m = { v0: s.v0, apex: s.apex, contactH: p0[2], flight: s.flight, depth, fromNet: Math.abs(p1[1] - COURT.NET),
      clear: netClearance(rally, s), descent: Math.atan2(p0[2] - p1[2], horiz || 1) * 180 / Math.PI };
    const rule = RULES[s.type];
    const pts = rule ? rule(m) : null;
    const score = pts ? pts.reduce((a, b) => a + b, 0) / (pts.length * 2) : null;
    const grade = score == null ? "–" : score >= .8 ? "A" : score >= .5 ? "B" : "C";
    return { s, m, grade, score, note: NOTE[s.type] ? NOTE[s.type](m) : `${Math.round(s.v0)} km/h, apex ${s.apex} m` };
  });
}

// ---- habits (data analyst) -----------------------------------------------------------------------------------
export function habits(outcomes, who) {
  const shots = outcomes[who].shots;
  const n = shots.length;
  const mix = count(shots, (s) => s.type).slice(0, 6).map(([t, c]) => ({ t, c, p: pct(c, n) }));
  const attacks = outcomes[who].attacks;
  const attackMix = count(attacks, (a) => a.type).slice(0, 4).map(([t, c]) => ({ t, c, p: pct(c, attacks.length) }));
  const afterLift = shots.filter((s) => s.prev === "Lift" || s.prev === "Defensive lift" || s.prev === "Clear");
  const replyToLift = count(afterLift, (s) => s.type).slice(0, 3).map(([t, c]) => ({ t, p: pct(c, afterLift.length) }));
  const afterNet = shots.filter((s) => s.prev === "Net shot");
  const replyToNet = count(afterNet, (s) => s.type).slice(0, 3).map(([t, c]) => ({ t, p: pct(c, afterNet.length) }));
  const serves = shots.filter((s) => /serve/.test(s.type));
  const short = serves.filter((s) => s.type === "Short serve").length;
  const landZones = topZones(shots.filter((s) => s.land).map((s) => ({ xy: s.land })), "far", 3);
  const posZones = topZones(shots.filter((s) => s.pos).map((s) => ({ xy: s.pos })), "near", 3);
  const winners = outcomes[who].winners;
  return { n, mix, attackMix, attacks: attacks.length, replyToLift, liftN: afterLift.length, replyToNet, netN: afterNet.length,
    serves: serves.length, shortServe: pct(short, serves.length), landZones, posZones,
    winnerTypes: count(winners, (w) => w.type).slice(0, 3), errors: outcomes[who].errors.length };
}
