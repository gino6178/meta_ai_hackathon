import { useEffect, useRef, useState } from "react";
import { go } from "../App.jsx";
import CourtCalib from "../components/CourtCalib.jsx";

const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + " GB" : (b / 1e6).toFixed(1) + " MB");

// Reads the file locally (object URL) to get its duration and resolution. The file is never sent anywhere.
function probe(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.src = url;
    v.onloadedmetadata = () => resolve({ url, name: file.name, size: file.size, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This file could not be opened as a video.")); };
  });
}

export default function Upload({ onVideo }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState(null);
  const [opts, setOpts] = useState({ player: "near", hand: "right", level: "club" });
  const [calib, setCalib] = useState(null);
  const [cal, setCal] = useState(false); // calibration opens by itself once a video is chosen
  useEffect(() => { if (meta) setCal(true); }, [meta]);

  async function take(file) {
    setErr("");
    if (!file) return;
    if (!file.type.startsWith("video/")) return setErr("Please choose a video file (MP4, MOV or WebM).");
    try { setMeta(await probe(file)); } catch (e) { setErr(e.message); }
  }

  return (
    <div className="page upload">
      <header className="report-head">
        <div>
          <span className="tag">New analysis</span>
          <h1 className="h1">Add a match video</h1>
          <p className="muted">Singles, one fixed camera behind a baseline. The file is opened by your browser and never leaves this device.</p>
        </div>
      </header>

      <div className="upload-grid">
        <label
          className={`drop ${drag ? "drag" : ""} ${meta ? "has" : ""}`} tabIndex={meta ? -1 : 0} aria-label={meta ? undefined : "Choose a match video"}
          onKeyDown={(e) => { if (!meta && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}
        >
          <input ref={input} type="file" accept="video/*" onChange={(e) => take(e.target.files[0])} hidden />
          {meta ? (
            <video src={meta.url} muted playsInline controls className="drop-preview" />
          ) : (
            <div className="drop-empty">
              <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 32V10m0 0-8 8m8-8 8 8M8 34v4a2 2 0 0 0 2 2h28a2 2 0 0 0 2-2v-4" /></svg>
              <b>Drop a video here</b>
              <span>or click to choose a file · MP4, MOV, WebM</span>
            </div>
          )}
        </label>

        <aside className="upload-side">
          <section className="panel">
            <h2 className="panel-h">File</h2>
            {meta ? (
              <dl className="kv">
                <div><dt>Name</dt><dd title={meta.name}>{meta.name}</dd></div>
                <div><dt>Length</dt><dd>{Math.floor(meta.duration / 60)}:{String(Math.round(meta.duration % 60)).padStart(2, "0")}</dd></div>
                <div><dt>Resolution</dt><dd>{meta.width} × {meta.height}</dd></div>
                <div><dt>Size</dt><dd>{fmtSize(meta.size)}</dd></div>
                <div><dt>Stored</dt><dd className="ok">this device only</dd></div>
              </dl>
            ) : <p className="muted small">No file yet.</p>}
            {err && <p className="err" role="alert">{err}</p>}
          </section>

          <section className="panel">
            <h2 className="panel-h">Who are we coaching?</h2>
            <div className="seg" role="radiogroup" aria-label="Player">
              {[["near", "Near-side player"], ["far", "Far-side player"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={opts.player === k} onClick={() => setOpts({ ...opts, player: k })}>{l}</button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Handedness">
              {[["right", "Right-handed"], ["left", "Left-handed"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={opts.hand === k} onClick={() => setOpts({ ...opts, hand: k })}>{l}</button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Level">
              {[["club", "Club"], ["school", "School team"], ["elite", "Elite"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={opts.level === k} onClick={() => setOpts({ ...opts, level: k })}>{l}</button>
              ))}
            </div>
          </section>

          <button className="btn primary wide" disabled={!meta} aria-describedby={meta ? undefined : "need-file"} onClick={() => onVideo({ ...meta, ...opts, calib })}>Start on-device analysis</button>
          {!meta && <p id="need-file" className="tiny muted upload-hint">Choose a video first, or try the sample match.</p>}
          <button className="btn ghost wide" onClick={() => { onVideo(null); }}>Use the sample match instead</button>
        </aside>
      </div>

      <details className="disclose calib-panel" open={cal} onToggle={(e) => setCal(e.currentTarget.open)}>
        <summary>Court calibration <span className="muted">{meta ? meta.name : "sample match"} · corners found automatically</span></summary>
        <div className="disclose-body">
          <p className="muted small">Maps every pixel to court metres. Drag a corner if it is off, and check the projected lines and the top-down view.</p>
          {cal && <CourtCalib key={meta ? meta.url : "sample"} src={meta ? meta.url : "/media/sample_rally.mp4"} onChange={setCalib} />}
        </div>
      </details>
    </div>
  );
}
