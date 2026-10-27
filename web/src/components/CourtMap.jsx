import { useId } from "react";
import { COURT } from "../data.js";

// Top view of the court, far baseline at the top. Points are [x, y] in court metres.
// half: "full" | "near" | "far". heat: [{ x0, y0, x1, y1, a }] cells drawn in `heatColor`.
// blink: [{ x0, y0, x1, y1, c, label }] zones that flash so a coach can point at them
// The heat cells are blurred into a smooth density and clipped to the court floor.
export default function CourtMap({ points = [], misses = [], bases = [], heat = null, heatColor = "var(--bad)", half = "full", label, onPick, blink = null }) {
  const S = 36, M = 22;
  const uid = useId().replace(/:/g, "");
  const y0 = half === "near" ? COURT.NET - .4 : -0.5;
  const y1 = half === "far" ? COURT.NET + .4 : COURT.L + .5;
  const W = COURT.W * S + 2 * M, H = (y1 - y0) * S + 2 * M;
  const X = (x) => M + x * S, Y = (y) => M + (y - y0) * S;
  const cx = (x) => Math.max(-M / S + .1, Math.min(COURT.W + M / S - .1, x)), cy = (y) => Math.max(y0 - M / S + .1, Math.min(y1 + M / S - .1, y));
  const line = (x1, ya, x2, yb, k) => <line key={k} x1={X(x1)} y1={Y(ya)} x2={X(x2)} y2={Y(yb)} />;
  const { W: w, L: LL, NET, SHORT, LONG_D, SINGLE } = COURT;
  const top = Math.max(0, y0), bot = Math.min(LL, y1);
  const ys = [0, LL, LONG_D, LL - LONG_D, NET - SHORT, NET + SHORT].filter((v) => v >= top && v <= bot);
  return (
    <svg className={`court-map ${onPick ? "pickable" : ""}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
      onClick={onPick && ((e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
        onPick([(px - M) / S, (py - M) / S + y0]);
      })}>
      <rect x={X(0)} y={Y(top)} width={w * S} height={(bot - top) * S} className="cm-floor" />
      {heat && (
        <>
          <defs>
            <filter id={`hb${uid}`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7" /></filter>
            <clipPath id={`hc${uid}`}><rect x={X(0)} y={Y(top)} width={w * S} height={(bot - top) * S} /></clipPath>
          </defs>
          <g clipPath={`url(#hc${uid})`}>
            <g filter={`url(#hb${uid})`}>
              {heat.map((c, i) => (
                <rect key={i} x={X(c.x0)} y={Y(c.y0)} width={(c.x1 - c.x0) * S + .5} height={(c.y1 - c.y0) * S + .5} fill={heatColor} opacity={Math.min(1, c.a * 1.15)} />
              ))}
            </g>
          </g>
        </>
      )}
      <g className="cm-lines">
        {[0, w, SINGLE, w - SINGLE].map((x, i) => line(x, top, x, bot, "v" + i))}
        {ys.map((y, i) => line(0, y, w, y, "h" + i))}
        {top < NET - SHORT && line(w / 2, top, w / 2, NET - SHORT, "c1")}
        {bot > NET + SHORT && line(w / 2, NET + SHORT, w / 2, bot, "c2")}
      </g>
      <line x1={X(-.15)} x2={X(w + .15)} y1={Y(NET)} y2={Y(NET)} className="cm-net" />
      {blink && blink.map((z, i) => (
        <g key={"z" + i} className="cm-blink" style={{ animationDelay: `${i * .35}s` }}>
          <rect x={X(z.x0)} y={Y(z.y0)} width={(z.x1 - z.x0) * S} height={(z.y1 - z.y0) * S} rx="6" fill={z.c} fillOpacity=".28" stroke={z.c} strokeWidth="3" />
          {z.label && <text x={X((z.x0 + z.x1) / 2)} y={Y((z.y0 + z.y1) / 2)} textAnchor="middle" dominantBaseline="middle" className="cm-zone-label">{z.label}</text>}
        </g>
      ))}
      {misses.map((p, i) => <circle key={"m" + i} cx={X(p[0])} cy={Y(p[1])} r="2.6" className="cm-miss" />)}
      {points.map((p, i) => p.ring
        ? <circle key={"p" + i} cx={X(cx(p.xy[0]))} cy={Y(cy(p.xy[1]))} r={p.r ?? 5} fill="none" stroke={p.c} strokeWidth="2" opacity={p.o ?? 1} />
        : <circle key={"p" + i} cx={X(cx(p.xy[0]))} cy={Y(cy(p.xy[1]))} r={p.r ?? 3.2} fill={p.c ?? "var(--accent)"} opacity={p.o ?? .7} />)}
      {bases.map((b, i) => (
        <g key={"b" + i} transform={`translate(${X(b.xy[0])},${Y(b.xy[1])})`}>
          <circle r="11" fill="none" stroke={b.c} strokeWidth="2.5" />
          <circle r="3" fill={b.c} />
          <text y={i === 0 ? -16 : 25} textAnchor="middle" className="cm-label" fill={b.c}>{b.label}</text>
        </g>
      ))}
    </svg>
  );
}

// Gaussian kernel density on a 0.25 m grid over one half; alpha scaled to the peak cell.
export function heatGrid(pts, half, sigma = .55, cell = .25, maxA = .85) {
  const ya = half === "far" ? 0 : COURT.NET, yb = half === "far" ? COURT.NET : COURT.L;
  const cells = [];
  let peak = 0;
  for (let x = 0; x < COURT.W - 1e-6; x += cell) for (let y = ya; y < yb - 1e-6; y += cell) {
    const mx = x + cell / 2, my = y + cell / 2;
    let v = 0;
    pts.forEach(([px, py]) => { const d2 = (px - mx) ** 2 + (py - my) ** 2; v += Math.exp(-d2 / (2 * sigma * sigma)); });
    peak = Math.max(peak, v);
    cells.push({ x0: x, y0: y, x1: x + cell, y1: y + cell, v });
  }
  return cells.filter((c) => c.v > peak * .08).map((c) => ({ ...c, a: maxA * (c.v / peak) ** 1.2 }));
}
