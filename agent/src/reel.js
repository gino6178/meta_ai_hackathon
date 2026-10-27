// Your own video, made into a highlight reel. The app sends the clip to this gateway on your own GPU server;
// video/pose/reel.py finds you (Meta's DETR), reads your pose (Sapiens2), cuts you out (SAM 2.1) and finds your smash,
// and its steps stream back to the app as they finish. The clip and the working files are deleted as soon as the
// result is sent. Set REEL_PYTHON and REEL_SCRIPT (server/start.sh does), and optionally REEL_GPU, REEL_HF_CACHE and
// REEL_MAX_MB (default 300).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const MAX = +(process.env.REEL_MAX_MB || 300) * 1e6;
let busy = false; // one reel at a time: the GPU reads one video at a time
export const ready = () => !!(process.env.REEL_PYTHON && process.env.REEL_SCRIPT && fs.existsSync(process.env.REEL_SCRIPT));

export async function make(req, send, sport = "badminton") {
  if (busy) throw new Error("Another reel is being made on the server. Try again in a minute.");
  busy = true;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-")), src = path.join(dir, "in.mp4"), out = path.join(dir, "out.json");
  try {
    let n = 0;
    await new Promise((ok, bad) => {
      const f = fs.createWriteStream(src);
      req.on("data", (c) => { n += c.length; if (n > MAX) { req.destroy(); bad(new Error(`The video is over ${MAX / 1e6} MB. Trim it to the rally.`)); } });
      req.on("error", bad); f.on("error", bad); f.on("finish", ok);
      req.pipe(f);
    });
    send({ type: "step", step: "Received your video", tool: "upload", detail: `${(n / 1e6).toFixed(1)} MB, on your own server only` });
    send({ type: "working", step: "Finding you in every frame" });
    await new Promise((ok, bad) => {
      const env = { ...process.env, ...(process.env.REEL_GPU ? { CUDA_VISIBLE_DEVICES: process.env.REEL_GPU } : {}), ...(process.env.REEL_HF_CACHE ? { HF_HUB_CACHE: process.env.REEL_HF_CACHE } : {}) };
      const p = spawn(process.env.REEL_PYTHON, [process.env.REEL_SCRIPT, src, out, String(sport || "badminton").replace(/[^a-z ]/gi, "").slice(0, 20) || "badminton"], { env });
      let buf = "", err = "";
      const next = { "Opened your video": "Finding you in every frame", "Found you": "Reading your pose and cutting you out", "Read your pose": "Finding your best moment" };
      p.stdout.on("data", (c) => {
        buf += c;
        for (let i; (i = buf.indexOf("\n")) >= 0;) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          try { const x = JSON.parse(line); send({ type: "step", step: x.step, tool: "vision", detail: x.detail }); if (next[x.step]) send({ type: "working", step: next[x.step] }); } catch { /* not a step line */ }
        }
      });
      p.stderr.on("data", (c) => { err = (err + c).slice(-4000); });
      p.on("error", bad);
      p.on("close", (code) => (code === 0 ? ok() : bad(new Error(`The reel step stopped (exit ${code}). ${err.trim().split("\n").pop() || ""}`))));
    });
    const r = JSON.parse(fs.readFileSync(out, "utf8"));
    if (r.error) throw new Error("Nobody stays in the picture long enough. Film the rally with the whole court in view.");
    return r;
  } finally {
    busy = false;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
