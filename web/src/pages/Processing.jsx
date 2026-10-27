import { useEffect, useRef, useState } from "react";

// Prototype: the stages are timed playback, not live inference. The report then shows the precomputed sample.
const STAGES = [
  ["Decode video", "frames → 512×288 tensors", 900],
  ["Track the shuttle (2D)", "TrackNetV5 · 5-frame window", 1500],
  ["Reconstruct the 3D flight", "monocular scene reconstruction (in-house)", 2500],
  ["Detect hits & strokes", "HitNet · stroke classifier", 900],
  ["Locate players", "pose → floor homography", 900],
  ["Build the match database", "per-shot speed, apex, landing, zone", 700],
  ["Brief the coaching agents", "4 coaches + head coach · evidence index", 800],
];

export default function Processing({ video, onDone }) {
  const [k, setK] = useState(0);
  const [p, setP] = useState(0);
  const [log, setLog] = useState([]);
  const canvas = useRef(null);
  const vid = useRef(null);
  const total = STAGES.reduce((a, s) => a + s[2], 0);

  useEffect(() => {
    let raf, start = performance.now();
    const tick = (t) => {
      const el = t - start;
      let acc = 0, i = 0;
      while (i < STAGES.length && el > acc + STAGES[i][2]) acc += STAGES[i++][2];
      setK(i); setP(Math.min(1, el / total));
      if (i >= STAGES.length) { setTimeout(onDone, 500); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (k === 0) return;
    const [h] = STAGES[k - 1];
    setLog((l) => [...l, `${new Date().toLocaleTimeString("en-GB")}  ✓ ${h}`].slice(-6));
  }, [k]);

  // scan-line effect over the user's own frames (or the sample clip)
  useEffect(() => {
    const v = vid.current, c = canvas.current;
    if (!v || !c) return;
    const ctx = c.getContext("2d");
    let raf;
    const draw = () => {
      if (v.readyState >= 2) {
        c.width = c.clientWidth; c.height = c.clientHeight;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const y = ((performance.now() / 1400) % 1) * c.height;
        const g = ctx.createLinearGradient(0, y - 60, 0, y);
        g.addColorStop(0, "rgba(242,230,201,0)"); g.addColorStop(1, "rgba(242,230,201,.35)");
        ctx.fillStyle = g; ctx.fillRect(0, y - 60, c.width, 60);
        ctx.fillStyle = "rgba(242,230,201,.9)"; ctx.fillRect(0, y, c.width, 1.5);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const src = video?.url ?? "/media/sample_rally.mp4";
  return (
    <div className="page processing">
      <header className="sec-head">
        <span className="tag">On-device analysis</span>
        <h1 className="h1">{video ? video.name : "Sample match"}</h1>
        <p className="muted">Running locally · network not used</p>
      </header>
      <div className="proc-grid">
        <div className="proc-view">
          <video ref={vid} src={src} muted autoPlay loop playsInline className="sr-video" />
          <canvas ref={canvas} className="proc-canvas" aria-hidden="true" />
          <div className="proc-bar"><i style={{ "--p": p }} /></div>
          <span className="proc-pct mono">{Math.round(p * 100)}%</span>
        </div>
        <ol className="stages">
          {STAGES.map(([h, d], i) => (
            <li key={h} className={i < k ? "done" : i === k ? "run" : ""}>
              <span className="st-dot" aria-hidden="true" />
              <div><b>{h}</b><span className="mono">{d}</span></div>
            </li>
          ))}
        </ol>
      </div>
      <pre className="log mono" aria-live="polite">{log.join("\n")}</pre>
    </div>
  );
}
