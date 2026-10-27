import { useEffect, useRef, useState } from "react";

// Drawing layer for a paused video frame: arrows, lines, circles, freehand and text. Saved per clip on this device;
// "Save image" exports the frame with the drawing as a PNG.
const TOOLS = [["arrow", "Arrow"], ["line", "Line"], ["circle", "Circle"], ["free", "Pen"], ["text", "Text"]];
const COLORS = ["#F2E6C9", "#FF6B5A", "#6FB6FF", "#5FD39A", "#F2D46B"];
const key = (clip) => `shuttlecoach.notes.${clip}`;
const load = (clip) => { try { return JSON.parse(localStorage.getItem(key(clip)) || "[]"); } catch { return []; } };
const save = (clip, s) => { try { localStorage.setItem(key(clip), JSON.stringify(s)); } catch { /* storage unavailable */ } };

function draw(ctx, s, w, h) {
  ctx.strokeStyle = ctx.fillStyle = s.c; ctx.lineWidth = Math.max(2, w / 300); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const P = (p) => [p[0] * w, p[1] * h];
  if (s.tool === "free") { ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.stroke(); return; }
  if (s.tool === "text") { ctx.font = `bold ${Math.round(w / 40)}px system-ui, sans-serif`; ctx.fillText(s.text, ...P(s.a)); return; }
  const [ax, ay] = P(s.a), [bx, by] = P(s.b);
  if (s.tool === "circle") { ctx.beginPath(); ctx.ellipse((ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2, 0, 0, Math.PI * 2); ctx.stroke(); return; }
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  if (s.tool === "arrow") {
    const a = Math.atan2(by - ay, bx - ax), L = w / 45;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - L * Math.cos(a - .45), by - L * Math.sin(a - .45));
    ctx.lineTo(bx - L * Math.cos(a + .45), by - L * Math.sin(a + .45)); ctx.closePath(); ctx.fill();
  }
}

export default function Annotator({ clip, videoRef, onClose }) {
  const cvs = useRef(null);
  const [tool, setTool] = useState("arrow");
  const [color, setColor] = useState(COLORS[1]);
  const [shapes, setShapes] = useState(() => load(clip));
  const drag = useRef(null);

  useEffect(() => { setShapes(load(clip)); }, [clip]);
  useEffect(() => { videoRef.current?.video?.pause(); }, []);
  useEffect(() => {
    const c = cvs.current; if (!c) return;
    c.width = c.clientWidth * 2; c.height = c.clientHeight * 2;
    const ctx = c.getContext("2d"); ctx.clearRect(0, 0, c.width, c.height);
    [...shapes, drag.current].filter(Boolean).forEach((s) => draw(ctx, s, c.width, c.height));
    save(clip, shapes);
  });
  const pos = (e) => { const r = cvs.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };

  const down = (e) => {
    const p = pos(e);
    if (tool === "text") { const t = prompt("Text"); if (t) setShapes((s) => [...s, { tool, c: color, a: p, text: t }]); return; }
    drag.current = tool === "free" ? { tool, c: color, pts: [p] } : { tool, c: color, a: p, b: p };
    setShapes((s) => [...s]);
  };
  const move = (e) => {
    if (!drag.current) return;
    const p = pos(e);
    if (drag.current.tool === "free") drag.current.pts.push(p); else drag.current.b = p;
    setShapes((s) => [...s]);
  };
  const up = () => { if (drag.current) { const d = drag.current; drag.current = null; setShapes((s) => [...s, d]); } };

  const exportPng = () => {
    const v = videoRef.current.video, c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d"); ctx.drawImage(v, 0, 0);
    shapes.forEach((s) => draw(ctx, s, c.width, c.height));
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `annotated_${clip.replace(".mp4", "")}_${v.currentTime.toFixed(1)}s.png`; a.click();
  };

  return (
    <>
      <canvas ref={cvs} className="annot-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Drawing layer" />
      <div className="annot-bar">
        {TOOLS.map(([k, l]) => <button key={k} className={tool === k ? "on" : ""} onClick={() => setTool(k)}>{l}</button>)}
        <span className="annot-sep" />
        {COLORS.map((c) => <button key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColor(c)} />)}
        <span className="annot-sep" />
        <button onClick={() => setShapes((s) => s.slice(0, -1))}>Undo</button>
        <button onClick={() => setShapes([])}>Clear</button>
        <button onClick={exportPng}>Save image</button>
        <button className="primary" onClick={onClose}>Done</button>
      </div>
    </>
  );
}
