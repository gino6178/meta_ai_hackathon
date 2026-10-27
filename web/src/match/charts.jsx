import { useWidth } from "../hooks.js";

// Small SVG charts shared by the match pages. They are drawn at the element's real width, so axis text is
// always 12 px. xLabel names the x axis (ticks at the start, middle and end); a dot can be filled or a ring,
// so a won and a lost rally differ in shape as well as colour.
export function LineChart({ series, n, marks = [], height = 200, yFmt = (v) => v.toFixed(1), yMin, yMax, label, zero, xLabel = "rally", xFmt = (i) => i + 1 }) {
  const [box, W] = useWidth(600);
  const H = height, pad = { l: 46, r: 14, t: 16, b: 30 };
  const vals = series.flatMap((s) => s.values.filter((v) => v != null));
  const lo = yMin ?? Math.min(...vals), hi = yMax ?? Math.max(...vals);
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - ((v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  const xt = [...new Set([0, Math.round((n - 1) / 2), n - 1])];
  return (
    <div className="lchart-box" ref={box}>
      <svg className="lchart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        {ticks.map((v, i) => (
          <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" /><text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{yFmt(v)}</text></g>
        ))}
        {zero != null && <line x1={pad.l} x2={W - pad.r} y1={y(zero)} y2={y(zero)} className="zero" />}
        {xt.map((i, k) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={k === 0 ? "start" : k === xt.length - 1 ? "end" : "middle"} className="axis">{k === 0 ? `${xLabel} ${xFmt(i)}` : xFmt(i)}</text>
        ))}
        {marks.map((m) => (
          <g key={m.i}><line x1={x(m.i)} x2={x(m.i)} y1={pad.t} y2={H - pad.b} className="mark" /><text x={x(m.i) + 4} y={pad.t + 10} className="axis">{m.label}</text></g>
        ))}
        {series.map((s) => {
          let d = "";
          s.values.forEach((v, i) => { if (v == null) return; d += (d ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); });
          return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={s.width || 2.4} strokeLinejoin="round" strokeLinecap="round" opacity={s.opacity ?? 1} />;
        })}
        {series.filter((s) => s.dots).map((s) => s.values.map((v, i) => {
          if (v == null) return null;
          const c = s.dotColor ? s.dotColor(i) : s.color, ring = s.dotRing?.(i);
          return ring
            ? <circle key={s.label + i} cx={x(i)} cy={y(v)} r="3.6" fill="var(--surface)" stroke={c} strokeWidth="2" />
            : <circle key={s.label + i} cx={x(i)} cy={y(v)} r="3.6" fill={c} />;
        }))}
      </svg>
    </div>
  );
}

export function Bars({ rows, max, fmt = (v) => v, color = "var(--court)" }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.v));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.k}><span title={r.k}>{r.k}</span><i style={{ width: `${(r.v / m) * 100}%`, background: r.c || color }} /><b className="mono">{fmt(r.v)}</b>{r.note != null ? <em className="mono">{r.note}</em> : <em />}</li>
      ))}
    </ul>
  );
}

export const Kpi = ({ v, l, tone }) => <div className={`kpi ${tone || ""}`}><b className="mono">{v}</b><span>{l}</span></div>;
