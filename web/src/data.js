// Sample data loading and every number the report and the agents quote. Nothing here calls a model:
// the agents in this prototype read these deterministic results, which is also how the real system is designed.

export const COURT = { W: 6.1, L: 13.4, NET: 6.7, SHORT: 1.98, LONG_D: 0.76, SINGLE: 0.46 };

let cache;
export function loadSample() {
  if (!cache) cache = fetch("/data/sample.json").then((r) => r.json()).then(derive);
  return cache;
}

// Zones from the near player's point of view (they face the far baseline; a right-hander's backhand is image-left).
export function zoneOf([x, y]) {
  const d = Math.abs(y - COURT.NET);
  const row = d < 2.2 ? "front" : d < 4.6 ? "mid" : "rear";
  const col = x < 2.2 ? "backhand" : x > 3.9 ? "forehand" : "center";
  return { row, col, key: `${row}-${col}` };
}
export const zoneName = (k) => k.replace("-", " ").replace("center", "middle");

export function speedColor(kmh) {
  const stops = [[0, "#3fd0c9"], [50, "#9be37a"], [100, "#f2d46b"], [150, "#f5a25d"], [200, "#ef5f5c"]];
  for (let i = stops.length - 1; i >= 0; i--) if (kmh >= stops[i][0]) return stops[i][1];
  return stops[0][1];
}

function derive(d) {
  const { rally, match } = d;
  // per-frame speed (km/h) from the 3D track, light 3-frame smoothing
  const raw = rally.frames.map((f, i) => {
    const p = rally.frames[i - 1];
    if (!f.xyz || !p || !p.xyz || f.s !== p.s) return null;
    return Math.hypot(f.xyz[0] - p.xyz[0], f.xyz[1] - p.xyz[1], f.xyz[2] - p.xyz[2]) * rally.fps * 3.6;
  });
  rally.speed = raw.map((v, i) => {
    const w = [raw[i - 1], v, raw[i + 1]].filter((t) => t != null);
    return v == null ? null : w.reduce((a, b) => a + b, 0) / w.length;
  });
  rally.duration = rally.n / rally.fps;
  rally.strokes.forEach((s) => (s.zone = zoneOf(s.end)));

  match.strokes.forEach((s, i) => { s.id = i + 1; s.zone = zoneOf(s.land); });
  d.insights = insights(match);
  return d;
}

function count(arr, key) {
  const m = {};
  arr.forEach((a) => (m[key(a)] = (m[key(a)] || 0) + 1));
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function insights(match) {
  const S = match.strokes;
  const onNear = (s) => s.land[1] > COURT.NET;
  const oppSmash = S.filter((s) => s.side === "far" && /Smash/.test(s.type) && onNear(s));
  const smashZones = count(oppSmash, (s) => s.zone.key);
  const top = smashZones[0];

  // near player's lifts and clears that land in front of the doubles long-service line (0.76 m inside the
  // baseline), and whether the opponent's next shot was a smash
  const lifts = S.filter((s) => s.side === "near" && /Lift|Clear/.test(s.type));
  const isShort = (s) => Math.abs(s.land[1] - COURT.NET) < COURT.L / 2 - COURT.LONG_D;
  const smashedNext = (s) => { const n = S[s.id]; return n && n.side === "far" && /Smash/.test(n.type); };
  const short = lifts.filter(isShort), deep = lifts.filter((s) => !isShort(s));
  const punished = short.filter(smashedNext), deepPunished = deep.filter(smashedNext);

  const oppAttack = S.filter((s) => s.side === "far" && onNear(s));
  const nearHits = S.filter((s) => s.side === "near");
  const base = [avg(nearHits.map((s) => s.hit[0])), avg(nearHits.map((s) => s.hit[1]))];

  return {
    oppSmash, smashZones, topZone: top && { key: top[0], n: top[1], share: top[1] / oppSmash.length },
    lifts, short, punished, deep, deepPunished, oppAttack, base,
  };
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// ---- Sparring simulator -------------------------------------------------------------------------------
// The opponent's shots are resampled from the match's own landing points and flight times (style weights shift
// the mix). The player starts at a base, reacts after 0.25 s, moves at 4.2 m/s and reaches 0.9 m with the racket.
// A shot is lost when the landing point cannot be reached in its flight time. Simplified model, seeded RNG.

export const STYLES = {
  attacker: { label: "Attacker", w: (s) => (/Smash/.test(s.type) ? 3 : /Drop|Drive/.test(s.type) ? 1.5 : 1) },
  netcontrol: { label: "Net controller", w: (s) => (s.zone.row === "front" ? 3 : 1) },
  retriever: { label: "Retriever", w: (s) => (/Clear|Lift/.test(s.type) ? 3 : 1) },
};

function rng(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

export function simulate(shots, styleKey, base, n = 2000, seed = 7) {
  const style = STYLES[styleKey];
  const w = shots.map(style.w);
  const tot = w.reduce((a, b) => a + b, 0);
  const R = rng(seed);
  const cdf = []; let acc = 0; w.forEach((v) => cdf.push((acc += v) / tot));
  let lost = 0; const misses = [];
  for (let k = 0; k < n; k++) {
    const u = R(); let i = cdf.findIndex((c) => c >= u); if (i < 0) i = shots.length - 1;
    const s = shots[i];
    const jx = (R() - .5) * .5, jy = (R() - .5) * .5;
    const x = Math.min(COURT.W - .2, Math.max(.2, s.land[0] + jx)), y = Math.min(COURT.L - .2, Math.max(COURT.NET + .3, s.land[1] + jy));
    const need = Math.max(0, Math.hypot(x - base[0], y - base[1]) - 0.9);
    const can = 4.2 * Math.max(0, (s.flight || .8) - 0.25);
    if (need > can) { lost++; if (misses.length < 400) misses.push([x, y]); }
  }
  return { rate: lost / n, misses };
}

export function bestBase(shots, styleKey) {
  let best = null;
  for (let x = 2.0; x <= 4.1; x += .15) for (let y = 8.6; y <= 11.8; y += .15) {
    const r = simulate(shots, styleKey, [x, y], 600, 11).rate;
    if (!best || r < best.rate) best = { base: [x, y], rate: r };
  }
  return best;
}
