import { speedColor } from "../data.js";
import { useWidth } from "../hooks.js";

// Shuttle speed along the rally (km/h, from the 3D track). Clicking a launch peak seeks the video.
// Drawn at the element's real width, so the labels stay at their CSS size on any screen.
export default function SpeedChart({ rally, frame, onSeek }) {
  const [box, W] = useWidth(760);
  const H = 180, pad = { l: 40, r: 12, t: 20, b: 26 };
  const max = 220;
  const x = (i) => pad.l + (i / (rally.n - 1)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const segs = [];
  let cur = [];
  rally.speed.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur); cur = []; return; }
    cur.push([i, v]);
  });
  if (cur.length) segs.push(cur);
  const dense = W < 520; // on narrow screens label every other peak
  return (
    <div ref={box}>
      <svg className="speed-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Shuttle speed over the rally">
        {[0, 50, 100, 150, 200].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 8} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="axis">km/h · shuttle speed along the rally</text>
        {segs.map((sg, k) => (
          <g key={k}>
            {sg.slice(1).map(([i, v], j) => (
              <line key={i} x1={x(sg[j][0])} y1={y(sg[j][1])} x2={x(i)} y2={y(v)} stroke={speedColor(v)} strokeWidth="2.2" strokeLinecap="round" />
            ))}
          </g>
        ))}
        {rally.strokes.map((s, k) => (
          <g key={s.i} className="peak" onClick={() => onSeek?.(s.f0)} role="button" aria-label={`Shot ${s.i + 1}, ${Math.round(s.v0)} km/h`}>
            <circle cx={x(s.f0 + 1)} cy={y(s.v0)} r="5" fill={s.hitter === "near" ? "var(--near)" : "var(--far)"} />
            {(!dense || k % 2 === 0) && <text x={x(s.f0 + 1)} y={y(s.v0) - 9} textAnchor="middle" className="val">{Math.round(s.v0)}</text>}
          </g>
        ))}
        <line x1={x(frame)} x2={x(frame)} y1={pad.t} y2={H - pad.b} className="cursor" />
      </svg>
    </div>
  );
}
