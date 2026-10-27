import { useMemo, useState } from "react";
import { zoneName } from "../data.js";
import Body3D from "./Body3D.jsx";

// Front / back body diagram. Each muscle region is scored from the match findings: a finding has a severity
// (0-1, from the match numbers) and a weight for every region it loads. Coaching heuristic, not a physio exam.

export const REGIONS = {
  deltoid: { view: "front", name: "Shoulders (deltoids)", muscles: ["Anterior deltoid", "Lateral deltoid"] },
  pecs: { view: "front", name: "Chest", muscles: ["Pectoralis major"] },
  biceps: { view: "front", name: "Upper arm (front)", muscles: ["Biceps brachii", "Brachialis"] },
  forearm: { view: "front", name: "Forearm and wrist", muscles: ["Wrist flexors", "Pronator teres", "Grip"] },
  abs: { view: "front", name: "Core (front)", muscles: ["Rectus abdominis", "Transversus abdominis"] },
  obliques: { view: "front", name: "Obliques", muscles: ["External oblique", "Internal oblique"] },
  hipflex: { view: "front", name: "Hip flexors and adductors", muscles: ["Iliopsoas", "Adductor longus", "Adductor magnus"] },
  quads: { view: "front", name: "Quadriceps", muscles: ["Rectus femoris", "Vastus lateralis", "Vastus medialis"] },
  shin: { view: "front", name: "Shins and ankles", muscles: ["Tibialis anterior", "Peroneals"] },
  traps: { view: "back", name: "Upper back", muscles: ["Trapezius", "Rhomboids"] },
  cuff: { view: "back", name: "Rotator cuff", muscles: ["Infraspinatus", "Teres minor", "Supraspinatus"] },
  lats: { view: "back", name: "Lats", muscles: ["Latissimus dorsi"] },
  triceps: { view: "back", name: "Triceps", muscles: ["Triceps brachii"] },
  lowback: { view: "back", name: "Lower back", muscles: ["Erector spinae", "Quadratus lumborum"] },
  glutes: { view: "back", name: "Glutes", muscles: ["Gluteus maximus", "Gluteus medius"] },
  hams: { view: "back", name: "Hamstrings", muscles: ["Biceps femoris", "Semitendinosus"] },
  calves: { view: "back", name: "Calves and Achilles", muscles: ["Gastrocnemius", "Soleus"] },
};

export const DRILLS = {
  deltoid: ["Overhead dumbbell press, 3 × 10", "Band Y-raises, 3 × 15"],
  pecs: ["Push-ups with a 2 s lowering, 3 × 12"],
  biceps: ["Hammer curls, 3 × 12"],
  forearm: ["Wrist curls and reverse curls, 3 × 15", "Racket-head flicks with a cover on, 3 × 30 s", "Towel-wring grip holds, 3 × 30 s"],
  abs: ["Dead bugs, 3 × 10 per side", "Front plank, 3 × 40 s"],
  obliques: ["Cable or band woodchops, 3 × 10 per side", "Side plank with reach-through, 3 × 8"],
  hipflex: ["Deep lunge hold with rotation, 3 × 30 s per side", "Copenhagen plank (short lever), 3 × 20 s"],
  quads: ["Forward lunge to a net-height target, 3 × 8 per side", "Split squat jumps, 3 × 6 per side"],
  shin: ["Tibialis raises against a wall, 3 × 20", "Single-leg balance on a cushion, 3 × 30 s"],
  traps: ["Face pulls, 3 × 15", "Prone T-raises, 3 × 12"],
  cuff: ["Band external rotation at 90°, 3 × 15", "Sleeper stretch, 2 × 30 s"],
  lats: ["Pull-ups or lat pulldown, 3 × 8", "Medicine-ball overhead slams, 3 × 8"],
  triceps: ["Overhead triceps extension, 3 × 12", "Band overhead throwing pattern, 3 × 10"],
  lowback: ["Back extensions, 3 × 12", "Bird dogs, 3 × 10 per side"],
  glutes: ["Single-leg hip thrust, 3 × 10 per side", "Lateral band walks, 3 × 12 steps"],
  hams: ["Romanian deadlift, 3 × 8", "Nordic curl negatives, 3 × 5"],
  calves: ["Single-leg calf raises, 3 × 15", "Pogo hops, 3 × 20 s", "Split-step reaction drill, 6 × 20 s"],
};

export function findings(ins, rally) {
  const top = ins.topZone;
  const shortShare = ins.short.length / ins.lifts.length;
  const punish = ins.punished.length / Math.max(1, ins.short.length), deep = ins.deepPunished.length / Math.max(1, ins.deep.length);
  const clear = rally.strokes.find((s) => s.type === "Clear"), smash = rally.strokes.find((s) => s.type === "Smash");
  return [
    {
      id: "defence", title: `Smash defence to your ${zoneName(top.key)}`,
      fact: `${top.n} of ${ins.oppSmash.length} smashes into your half (${Math.round(top.share * 100)}%) went there`,
      sev: Math.min(1, top.share * 1.3),
      w: { calves: [1, "s"], quads: [.9, "s"], glutes: [.8, "s"], obliques: [.7, "s"], forearm: [.55, "s"], shin: [.5, "s"], cuff: [.35, "s"] },
    },
    {
      id: "lift", title: "Lift depth from the front court",
      fact: `${Math.round(shortShare * 100)}% of your lifts and clears landed short; a smash followed ${Math.round(punish * 100)}% of those vs ${Math.round(deep * 100)}% after deep ones`,
      sev: Math.min(1, shortShare + (punish - deep) * 2.5),
      w: { forearm: [1, "s"], deltoid: [.65, "s"], quads: [.6, "s"], hipflex: [.75, "m"], abs: [.45, "s"], biceps: [.3, "s"] },
    },
    {
      id: "power", title: "Overhead power from the rear court",
      fact: clear && smash ? `your clear left the racket at ${Math.round(clear.v0)} km/h; the opponent's smash at ${Math.round(smash.v0)} km/h` : "rear-court clears and smashes",
      sev: clear && smash ? Math.min(1, Math.max(.2, (smash.v0 - clear.v0) / 120)) : .4,
      w: { lats: [.85, "s"], cuff: [.8, "m"], triceps: [.65, "s"], obliques: [.6, "s"], traps: [.45, "m"], lowback: [.5, "s"], hams: [.5, "s"], pecs: [.35, "s"] },
    },
  ];
}

export function score(fs) {
  const out = {};
  Object.keys(REGIONS).forEach((k) => {
    const parts = fs.filter((f) => f.w[k]).map((f) => ({ f, v: f.w[k][0] * f.sev, kind: f.w[k][1] })).sort((a, b) => b.v - a.v);
    const v = parts.length ? Math.min(1, parts[0].v + parts.slice(1).reduce((a, p) => a + p.v * .25, 0)) : 0;
    out[k] = { v, parts, kind: parts[0]?.kind ?? "s", level: v >= .55 ? "high" : v >= .32 ? "medium" : "low" };
  });
  return out;
}

const fill = (s) => {
  if (s.level === "low") return { fill: "#2a3a42", opacity: .9 };
  const c = s.kind === "m" ? "111,182,255" : "255,107,90";
  return { fill: `rgb(${c})`, opacity: .35 + .6 * s.v };
};

// ---- drawing: one half of the body (viewer's left), mirrored for the other side --------------------------
// left half of the outline, mirrored for the right half
const HALF = "M100 48 L92 48 Q91 60 88 64 Q72 66 62 72 Q49 79 49 97 L46 140 Q43 151 41 166 L39 204 " +
  "Q37 214 41 224 Q48 231 54 222 Q57 212 56 204 L59 170 Q61 152 65 140 L66 112 Q68 122 68 132 Q65 160 70 186 " +
  "Q67 200 70 214 L72 300 Q71 312 74 322 Q69 350 75 380 L73 392 Q84 399 96 392 L94 380 Q97 350 94 322 " +
  "Q96 310 96 300 L98 220 Q99 212 100 208 Z";

function Silhouette() {
  return (
    <g className="bm-sil">
      <ellipse cx="100" cy="29" rx="16" ry="19" />
      <path d={HALF} />
      <path d={HALF} transform="translate(200 0) scale(-1 1)" />
    </g>
  );
}

const SHAPES = {
  front: {
    deltoid: <path d="M62 73 Q50 80 50 98 Q56 104 64 96 Q69 84 62 73Z" />,
    pecs: <path d="M68 78 Q84 71 98 76 L98 104 Q84 110 70 100 Q65 90 68 78Z" />,
    biceps: <path d="M52 103 Q47 120 51 138 Q57 141 61 133 Q66 117 62 103 Q57 98 52 103Z" />,
    forearm: <path d="M46 150 Q41 172 43 200 Q49 205 54 198 Q58 176 60 154 Q54 144 46 150Z" />,
    obliques: <path d="M70 106 Q80 112 86 118 L86 168 Q76 173 72 160 Q67 132 70 106Z" />,
    hipflex: <path d="M76 184 Q90 192 98 206 L98 238 Q88 223 79 204Z" />,
    quads: <path d="M72 212 Q69 252 76 298 Q86 305 92 296 Q99 256 94 226 Q84 205 72 212Z" />,
    shin: <path d="M76 326 Q72 352 78 378 Q84 381 88 376 Q92 350 90 326 Q82 319 76 326Z" />,
  },
  frontCenter: {
    abs: <path d="M88 108 Q100 104 112 108 L113 168 Q100 180 87 168 Z" />,
  },
  back: {
    cuff: <ellipse cx="78" cy="91" rx="10" ry="8" />,
    triceps: <path d="M51 100 Q46 120 50 140 Q56 143 60 134 Q65 116 60 100 Q55 96 51 100Z" />,
    lats: <path d="M68 100 Q84 108 96 116 L94 158 Q80 151 70 133Z" />,
    forearm: <path d="M46 150 Q41 172 43 200 Q49 205 54 198 Q58 176 60 154 Q54 144 46 150Z" />,
    glutes: <path d="M71 190 Q86 182 99 196 L99 221 Q84 228 71 214Z" />,
    hams: <path d="M74 228 Q70 262 76 296 Q86 303 92 294 Q98 262 94 230 Q84 221 74 228Z" />,
    calves: <path d="M76 322 Q69 341 76 364 Q84 368 90 361 Q95 338 90 322 Q82 315 76 322Z" />,
  },
  backCenter: {
    traps: <path d="M80 62 Q100 54 120 62 L114 96 Q100 104 86 96 Z" />,
    lowback: <path d="M89 132 Q100 128 111 132 L112 178 Q100 184 88 178 Z" />,
  },
};

// faint anatomical detail lines so the figure reads as a body, not a set of blobs
const DETAIL = {
  front: "M100 108 L100 176 M89 124 L111 124 M89 140 L111 140 M89 156 L111 156 M84 256 Q86 280 84 296",
  back: "M100 60 L100 186 M86 100 Q92 112 100 116 M114 100 Q108 112 100 116",
};

function View({ view, scores, sel, onSel }) {
  const sides = view === "front" ? SHAPES.front : SHAPES.back;
  const center = view === "front" ? SHAPES.frontCenter : SHAPES.backCenter;
  const region = (k, el, key) => {
    const id = k === "forearm" && view === "back" ? "forearm" : k;
    const st = scores[id];
    return (
      <g key={key} className={`bm-r ${sel === id ? "on" : ""}`} {...fill(st)} onClick={() => onSel(id)}
        role="button" tabIndex={0} aria-label={`${REGIONS[id].name}: ${st.level} priority`}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSel(id)}>{el}</g>
    );
  };
  return (
    <svg viewBox="0 0 200 404" className="bm-svg" role="group" aria-label={`${view} view`}>
      <Silhouette />
      {Object.entries(sides).map(([k, el]) => region(k, el, k + "L"))}
      <g transform="translate(200 0) scale(-1 1)">{Object.entries(sides).map(([k, el]) => region(k, el, k + "R"))}</g>
      {Object.entries(center).map(([k, el]) => region(k, el, k))}
      <path d={DETAIL[view]} className="bm-detail" />
      <text x="100" y="402" textAnchor="middle" className="bm-cap">{view === "front" ? "FRONT" : "BACK"}</text>
    </svg>
  );
}

export default function BodyMap({ ins, rally }) {
  const fs = useMemo(() => findings(ins, rally), [ins, rally]);
  const scores = useMemo(() => score(fs), [fs]);
  const ranked = Object.keys(REGIONS).sort((a, b) => scores[b].v - scores[a].v);
  const [sel, setSel] = useState(ranked[0]);
  const [mode, setMode] = useState("3d");
  const [view, setView] = useState("front");
  const s = scores[sel], r = REGIONS[sel];
  return (
    <div className="bodymap">
      <div className="bm-figs">
        <div className="bm-tools">
          <div className="seg" role="radiogroup" aria-label="Body view">
            {[["3d", "3D muscles"], ["2d", "Diagram"]].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
          {mode === "3d" && (
            <div className="seg" role="radiogroup" aria-label="Camera">
              {[["front", "Front"], ["back", "Back"], ["side", "Side"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={view === k} onClick={() => setView(k)}>{l}</button>
              ))}
            </div>
          )}
        </div>
        {mode === "3d" ? (
          <Body3D scores={scores} sel={sel} onSel={setSel} view={view} />
        ) : (
          <div className="bm-2d">
            <View view="front" scores={scores} sel={sel} onSel={setSel} />
            <View view="back" scores={scores} sel={sel} onSel={setSel} />
          </div>
        )}
        <div className="bm-legend tiny">
          <span><i className="lg-s" /> strengthen</span><span><i className="lg-m" /> mobility and control</span><span><i className="lg-0" /> no change needed</span>
        </div>
      </div>
      <aside className="bm-side">
        <div className="panel">
          <span className={`prio ${s.level}`}>{s.level} priority</span>
          <h3 className="bm-name">{r.name}</h3>
          <p className="muted small">{r.muscles.join(" · ")}</p>
          {s.parts.length ? (
            <>
              <h4 className="panel-h">Why</h4>
              <ul className="why">
                {s.parts.map((p) => (
                  <li key={p.f.id}><b>{p.f.title}</b><span>{p.f.fact}.</span>
                    <em>{p.kind === "m" ? "Mobility and control" : "Strength"} · load {Math.round(p.v * 100)}</em></li>
                ))}
              </ul>
              <h4 className="panel-h">Drills</h4>
              <ul className="drills">{DRILLS[sel].map((d) => <li key={d}>{d}</li>)}</ul>
            </>
          ) : <p className="muted small">None of this match's findings load this area.</p>}
        </div>
        <ol className="rank">
          {ranked.slice(0, 6).map((k, i) => (
            <li key={k}><button className={sel === k ? "on" : ""} onClick={() => setSel(k)}>
              <span className="mono">{i + 1}</span>{REGIONS[k].name}<i className={`prio-dot ${scores[k].level} ${scores[k].kind}`} /></button></li>
          ))}
        </ol>
        <p className="tiny muted">Coaching heuristic that links on-court findings to the muscle groups they load. It is not a medical or physiotherapy assessment.</p>
        <p className="tiny muted">3D anatomy: BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0, adapted via Human Atlas (MIT). The source has no rectus abdominis or latissimus dorsi meshes, so core and lats are shown on neighbouring muscles.</p>
      </aside>
    </div>
  );
}
