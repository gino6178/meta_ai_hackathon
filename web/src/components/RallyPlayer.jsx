import { useEffect, useRef, useState } from "react";
import { speedColor } from "../data.js";

// Sample clip with layers drawn on top: the tracker's shuttle trail, both players' skeletons (pose), their movement
// (distance, speed now, top speed) and a top-down court map. The same drawing exports an annotated video.
const LAYERS = [["trail", "Shuttle trail"], ["skeleton", "Skeletons"], ["stats", "Movement"], ["map", "Court map"]];
const PCOL = { near: "#6FB6FF", far: "#FF8A6B" };

function drawLayers(ctx, rally, pose, names, i, s, ox, oy, on) {
  const P = (uv) => [ox + uv[0] * s, oy + uv[1] * s];
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const pi = pose ? Math.min(i, pose.frames.length - 1) : i; // the pose track can be a frame shorter than the clip
  if (on.skeleton && pose?.frames[pi]) {
    pose.frames[pi].forEach((lm, k) => {
      if (!lm) return;
      const col = k === 0 ? PCOL.near : PCOL.far;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2.5, 4 * s);
      pose.edges.forEach(([a, b]) => {
        if (lm[a][2] < .4 || lm[b][2] < .4) return;
        const [x1, y1] = P(lm[a]), [x2, y2] = P(lm[b]);
        ctx.globalAlpha = .9; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      });
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 1;
      lm.forEach((p, j) => { if (j && p[2] >= .4) { const [x, y] = P(p); ctx.beginPath(); ctx.arc(x, y, Math.max(2.2, 3.5 * s), 0, 7); ctx.fill(); } });
    });
  }
  if (on.trail) {
    ctx.lineWidth = Math.max(2, 3.5 * s);
    for (let k = Math.max(1, i - 24); k <= i; k++) {
      const a = rally.frames[k - 1], b = rally.frames[k];
      if (!a?.uv || !b?.uv || a.s !== b.s) continue;
      ctx.strokeStyle = speedColor(rally.speed[k] || 0); ctx.globalAlpha = .25 + .75 * (k - i + 24) / 24;
      const [x1, y1] = P(a.uv), [x2, y2] = P(b.uv);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const f = rally.frames[i];
    if (f?.uv) {
      const [x, y] = P(f.uv);
      ctx.strokeStyle = "#f2e6c9"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      const sp = rally.speed[i];
      if (sp != null) { ctx.font = "500 12px Consolas, monospace"; ctx.fillStyle = "#f2e6c9"; ctx.fillText(`${Math.round(sp)} km/h`, x + 14, y - 10); }
    }
  }
  const W = rally.width * s, H = rally.height * s;
  if (on.stats && pose?.move) {
    [["near", names.near], ["far", names.far]].forEach(([side, name], k) => {
      const mv = pose.move[side], v = mv.speed[pi];
      const x = ox + (k ? W - 214 : 14), y = oy + H - 92;
      ctx.globalAlpha = .82; ctx.fillStyle = "#04070A"; ctx.beginPath(); ctx.roundRect(x, y, 200, 78, 10); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = PCOL[side]; ctx.font = "700 13px Segoe UI, sans-serif"; ctx.fillText(name, x + 12, y + 20);
      ctx.fillStyle = "#EEF1F2"; ctx.font = "600 13px Consolas, monospace";
      ctx.fillText(`now  ${v == null ? " –  " : v.toFixed(1)} m/s`, x + 12, y + 40);
      ctx.fillText(`moved ${mv.dist[pi].toFixed(1)} m`, x + 12, y + 58);
      ctx.fillStyle = "#8A979E"; ctx.fillText(`top ${mv.top.toFixed(1)}`, x + 128, y + 40);
    });
  }
  if (on.map && pose?.move) {
    const mw = 64, mh = 140, mx = ox + W - mw - 14, my = oy + 14;
    ctx.globalAlpha = .85; ctx.fillStyle = "#16362B"; ctx.fillRect(mx, my, mw, mh); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#DCE6E0"; ctx.lineWidth = 1; ctx.strokeRect(mx, my, mw, mh);
    const X = (x) => mx + (x / 6.1) * mw, Y = (y) => my + (y / 13.4) * mh;
    ctx.beginPath(); ctx.moveTo(mx - 3, Y(6.7)); ctx.lineTo(mx + mw + 3, Y(6.7)); ctx.lineWidth = 2; ctx.stroke();
    ["near", "far"].forEach((side) => {
      const c = pose.move[side].court; ctx.strokeStyle = PCOL[side]; ctx.lineWidth = 1.2; ctx.globalAlpha = .5; ctx.beginPath();
      for (let k = Math.max(0, pi - 90); k <= pi; k++) if (c[k]) { k === Math.max(0, pi - 90) ? ctx.moveTo(X(c[k][0]), Y(c[k][1])) : ctx.lineTo(X(c[k][0]), Y(c[k][1])); }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (c[pi]) { ctx.fillStyle = PCOL[side]; ctx.beginPath(); ctx.arc(X(c[pi][0]), Y(c[pi][1]), 4, 0, 7); ctx.fill(); }
    });
    const f = rally.frames[i];
    if (f?.xyz) { ctx.fillStyle = "#F2E6C9"; ctx.beginPath(); ctx.arc(X(f.xyz[0]), Y(f.xyz[1]), 2.5, 0, 7); ctx.fill(); }
  }
}

export default function RallyPlayer({ rally, src, onFrame, seekRef, overlay = true, names = { near: "Near player", far: "Far player" } }) {
  const vid = useRef(null);
  const cvs = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [pose, setPose] = useState(null);
  // on a phone the movement boxes and mini-map would cover the players, so they start switched off
  const [on, setOn] = useState(() => { const wide = innerWidth > 640; return { trail: true, skeleton: true, stats: wide, map: wide }; });
  const [exp, setExp] = useState(null); // null | { p } progress | { url }
  const onRef = useRef(on); onRef.current = on;
  const poseRef = useRef(pose); poseRef.current = pose;

  useEffect(() => { fetch("/data/pose.json").then((r) => (r.ok ? r.json() : null)).then(setPose).catch(() => {}); }, []);
  useEffect(() => {
    if (seekRef) seekRef.current = (frame) => { const v = vid.current; if (v) { v.currentTime = frame / rally.fps + 1e-3; v.play(); } };
  }, [rally]);

  useEffect(() => {
    let raf;
    const draw = () => {
      const v = vid.current, c = cvs.current;
      if (v && c && rally) {
        const i = Math.min(rally.n - 1, Math.floor(v.currentTime * rally.fps));
        onFrame?.(i); setT(v.currentTime);
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
        const ctx = c.getContext("2d");
        ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, w, h);
        if (overlay) {
          const s = Math.min(w / rally.width, h / rally.height), ox = (w - rally.width * s) / 2, oy = (h - rally.height * s) / 2;
          drawLayers(ctx, rally, poseRef.current, names, i, s, ox, oy, onRef.current);
        }
      }
    };
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    // seeks and time updates redraw too, so a paused video (or a throttled tab) still shows the right frame
    const v = vid.current;
    ["seeked", "timeupdate", "loadeddata"].forEach((e) => v.addEventListener(e, draw));
    return () => { cancelAnimationFrame(raf); ["seeked", "timeupdate", "loadeddata"].forEach((e) => v.removeEventListener(e, draw)); };
  }, [rally, overlay]);

  // annotated export: video + every active layer at full resolution, recorded in the browser
  const exportClip = async () => {
    const v = document.createElement("video");
    v.src = src; v.muted = true; v.playsInline = true;
    await new Promise((ok) => { v.oncanplay = ok; });
    const c = document.createElement("canvas"); c.width = rally.width; c.height = rally.height;
    const ctx = c.getContext("2d");
    const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((x) => MediaRecorder.isTypeSupported(x));
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(500); setExp({ p: 0 });
    await v.play();
    await new Promise((done) => {
      const tick = () => {
        const i = Math.min(rally.n - 1, Math.floor(v.currentTime * rally.fps));
        ctx.drawImage(v, 0, 0, c.width, c.height);
        drawLayers(ctx, rally, poseRef.current, names, i, 1, 0, 0, onRef.current);
        ctx.fillStyle = "#5FD39A"; ctx.font = "600 16px Consolas, monospace"; ctx.fillText("SHUTTLECOACH · analysed on-device", 18, 28);
        setExp({ p: v.currentTime / v.duration });
        v.ended ? done() : requestAnimationFrame(tick);
      };
      tick();
    });
    await new Promise((ok) => { rec.onstop = ok; rec.stop(); });
    setExp({ url: URL.createObjectURL(new Blob(chunks, { type: "video/webm" })) });
  };

  const toggle = () => { const v = vid.current; v.paused ? v.play() : v.pause(); };
  const dur = rally ? rally.duration : 1;
  return (
    <div className="player">
      <div className="player-stage" onClick={toggle}>
        <video ref={vid} src={src} muted playsInline loop preload="auto"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        <canvas ref={cvs} aria-hidden="true" />
        {!playing && <span className="play-badge" aria-hidden="true">▶</span>}
      </div>
      <div className="player-bar">
        <button className="icon-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
        <input type="range" min="0" max={dur} step="0.01" value={t} aria-label="Seek"
          onChange={(e) => { vid.current.currentTime = +e.target.value; }} />
        <span className="mono small">{t.toFixed(1)} / {dur.toFixed(1)} s</span>
      </div>
      {overlay && (
        <div className="player-layers">
          {LAYERS.map(([k, l]) => (
            <label key={k} className={on[k] ? "on" : ""}><input type="checkbox" checked={on[k]} onChange={() => setOn({ ...on, [k]: !on[k] })} />{l}</label>
          ))}
          <span className="sp" />
          {exp?.url ? <a className="btn primary sm" href={exp.url} download="shuttlecoach_annotated_rally.webm">Download annotated video</a>
            : exp ? <span className="mono small">Exporting {Math.round(exp.p * 100)}%</span>
            : <button className="btn ghost sm" onClick={exportClip}>Export annotated video</button>}
        </div>
      )}
    </div>
  );
}
