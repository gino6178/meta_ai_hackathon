import { useEffect, useRef, useState } from "react";

// Court calibration: an automatic first guess of the four outer corners (white lines next to green court), corrected by
// dragging, solved to a homography (court metres -> image pixels). The court model is drawn back onto the frame so
// the fit can be judged, and a top-down view is rectified from the frame. Everything runs on this device.
const CW = 6.1, CL = 13.4;
const MODEL = [[0, 0], [CW, 0], [CW, CL], [0, CL]]; // far-left, far-right, near-right, near-left
const LINES = [
  [[0, 0], [CW, 0]], [[0, CL], [CW, CL]], [[0, 0], [0, CL]], [[CW, 0], [CW, CL]], // outer boundary
  [[.46, 0], [.46, CL]], [[CW - .46, 0], [CW - .46, CL]], // singles sidelines
  [[0, .76], [CW, .76]], [[0, CL - .76], [CW, CL - .76]], // doubles long service lines
  [[0, 4.72], [CW, 4.72]], [[0, 8.68], [CW, 8.68]], // short service lines
  [[CW / 2, 0], [CW / 2, 4.72]], [[CW / 2, 8.68], [CW / 2, CL]], // centre lines
];

// 4-point DLT: solve for H (h33 = 1) so that H * [X, Y, 1] ~ [u, v, 1]
function homography(src, dst) {
  const A = [], b = [];
  src.forEach(([X, Y], i) => {
    const [u, v] = dst[i];
    A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u);
    A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v);
  });
  for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return [...b.map((x, i) => x / A[i][i]), 1];
}
const apply = (H, [X, Y]) => { const w = H[6] * X + H[7] * Y + H[8]; return [(H[0] * X + H[1] * Y + H[2]) / w, (H[3] * X + H[4] * Y + H[5]) / w]; };

// first guess: extreme points of white pixels that touch green court, along the two diagonals
function autoCorners(img, w, h) {
  const d = img.data, white = (i) => d[i] > 175 && d[i + 1] > 175 && d[i + 2] > 175 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 45;
  const green = (i) => d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 10;
  // the court is the band of rows that are mostly green; banners and scoreboards with a little green are outside it
  const rows = [];
  for (let y = 0; y < h; y++) {
    // longest run of court-coloured pixels in the row, bridging short gaps (lines, players)
    let run = null, start = -1, gap = 0;
    for (let x = 0; x <= w; x++) {
      const g = x < w && green((y * w + x) * 4);
      if (g) { if (start < 0) start = x; gap = 0; }
      else if (start >= 0 && ++gap > 12) {
        const end = x - gap; if (!run || end - start > run[1] - run[0]) run = [start, end];
        start = -1; gap = 0;
      }
    }
    if (start >= 0) { const end = w - 1 - gap; if (!run || end - start > run[1] - run[0]) run = [start, end]; }
    rows.push(run && (run[1] - run[0]) / w > .22 ? run : null);
  }
  const best = { tl: [1e9], tr: [-1e9], br: [-1e9], bl: [1e9] };
  for (let y = 3; y < h - 3; y += 1) for (let x = 3; x < w - 3; x += 1) {
    const i = (y * w + x) * 4, row = rows[y] || rows[y - 3] || rows[y + 3];
    if (!row || x < row[0] - 4 || x > row[1] + 4 || !white(i)) continue;
    if (![[-3, 0], [3, 0], [0, -3], [0, 3]].some(([dx, dy]) => green(((y + dy) * w + x + dx) * 4))) continue;
    if (x + y < best.tl[0]) best.tl = [x + y, x, y];
    if (x - y > best.tr[0]) best.tr = [x - y, x, y];
    if (x + y > best.br[0]) best.br = [x + y, x, y];
    if (x - y < best.bl[0]) best.bl = [x - y, x, y];
  }
  if (best.tl.length < 3 || best.br.length < 3) return null;
  return [best.tl, best.tr, best.br, best.bl].map(([, x, y]) => [x / w, y / h]);
}

export default function CourtCalib({ src, onChange }) {
  const vid = useRef(null), frame = useRef(null), top = useRef(null), box = useRef(null);
  const [pts, setPts] = useState([[.32, .25], [.68, .25], [.85, .9], [.15, .9]]);
  const [size, setSize] = useState({ w: 16, h: 9 });
  const [status, setStatus] = useState("Loading a frame…");
  const drag = useRef(-1);

  const grab = () => {
    const v = vid.current; if (!v?.videoWidth) return;
    const c = frame.current; c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setSize({ w: v.videoWidth, h: v.videoHeight });
    return c;
  };
  const auto = () => {
    const c = grab(); if (!c) return;
    const s = 480 / c.width, t = document.createElement("canvas"); t.width = 480; t.height = Math.round(c.height * s);
    const ctx = t.getContext("2d"); ctx.drawImage(c, 0, 0, t.width, t.height);
    const g = autoCorners(ctx.getImageData(0, 0, t.width, t.height), t.width, t.height);
    if (g) { setPts(g); setStatus("Auto-detected the court corners. Drag any corner to correct it."); }
    else setStatus("No court lines found automatically. Drag the four corners onto the outer court lines.");
  };
  useEffect(() => { const v = vid.current; const on = () => { v.currentTime = Math.min(1, v.duration / 2); }; v.addEventListener("loadedmetadata", on); v.addEventListener("seeked", auto, { once: true }); return () => v.removeEventListener("loadedmetadata", on); }, [src]);

  const H = homography(MODEL, pts.map(([x, y]) => [x * size.w, y * size.h]));
  useEffect(() => {
    onChange?.({ corners: pts, H });
    const c = frame.current, out = top.current; if (!c?.width || !out) return; // rectified top view
    const W = 122, Hh = 268, src = c.getContext("2d").getImageData(0, 0, c.width, c.height), dst = out.getContext("2d").createImageData(W, Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const [u, v] = apply(H, [(x / W) * CW, (y / Hh) * CL]), ui = Math.round(u), vi = Math.round(v), o = (y * W + x) * 4;
      if (ui < 0 || vi < 0 || ui >= c.width || vi >= c.height) { dst.data[o + 3] = 255; continue; }
      const i = (vi * c.width + ui) * 4; dst.data[o] = src.data[i]; dst.data[o + 1] = src.data[i + 1]; dst.data[o + 2] = src.data[i + 2]; dst.data[o + 3] = 255;
    }
    out.getContext("2d").putImageData(dst, 0, 0);
  }, [pts, size]);

  const move = (e) => {
    if (drag.current < 0) return;
    const r = box.current.getBoundingClientRect();
    const p = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    setPts((q) => q.map((x, i) => (i === drag.current ? p : x)));
  };
  const proj = (xy) => { const [u, v] = apply(H, xy); return [u / size.w * 100, v / size.h * 100]; };

  return (
    <div className="calib">
      <div className="calib-stage" ref={box} onPointerMove={move} onPointerUp={() => { drag.current = -1; }} onPointerLeave={() => { drag.current = -1; }}>
        <video ref={vid} src={src} muted playsInline preload="auto" crossOrigin="anonymous" />
        <canvas ref={frame} hidden />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Court model projected onto the frame">
          {LINES.map(([a, b], i) => { const [x1, y1] = proj(a), [x2, y2] = proj(b); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="calib-line" vectorEffect="non-scaling-stroke" />; })}
        </svg>
        {pts.map(([x, y], i) => (
          <button key={i} className="calib-pt" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-label={["Far-left corner", "Far-right corner", "Near-right corner", "Near-left corner"][i]}
            onPointerDown={(e) => { e.preventDefault(); drag.current = i; }}>{i + 1}</button>
        ))}
      </div>
      <div className="calib-side">
        <canvas ref={top} width={122} height={268} className="calib-top" aria-label="Rectified top-down court" />
        <p className="tiny muted">{status}</p>
        <button className="btn ghost sm" onClick={auto}>Auto-detect again</button>
      </div>
    </div>
  );
}
