// Assemble the Meta demo video: the recorded scenes (build/*.webm and build/marks.json), cut to the Kokoro narration
// (build/kokoro/k*.wav and timings.json). The model's waits are sped up, and the video says so on screen.
//   node assemble.mjs        -> Serve_Meta_demo.mp4 and Serve_Meta_demo_no_voice.mp4
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const B = path.join(HERE, "build"), K = path.join(B, "kokoro");
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const dur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
const FONT = "C\\:/Windows/Fonts/segoeuib.ttf";
const NARR = JSON.parse(fs.readFileSync(path.join(HERE, "narration.json"), "utf8"));
const TIMES = JSON.parse(fs.readFileSync(path.join(K, "timings.json"), "utf8"));
const MARKS = JSON.parse(fs.readFileSync(path.join(B, "marks.json"), "utf8"));
const NLEN = TIMES.map((rows) => rows.at(-1).end);
const LEAD = 0.5; // a breath before each scene's narration
const enc = ["-an", "-c:v", "libx264", "-crf", "17", "-preset", "fast"];
const esc = (t) => t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");

// The screencasts write every frame at least once at 30 fps, so their timeline runs slow (about 1.27x). Make
// constant-rate copies at real speed, so the wall-clock marks from record.mjs line up.
const SRC = {};
for (const name of Object.keys(MARKS)) {
  const webm = path.join(B, name + ".webm"), raw = path.join(B, name + "_raw.mp4"), mp4 = path.join(B, name + ".mp4");
  if (!fs.existsSync(mp4) || fs.statSync(mp4).mtimeMs < fs.statSync(webm).mtimeMs) {
    ff(["-i", webm, "-vf", "fps=30,scale=1920:1080,format=yuv420p", ...enc, raw]);
    const k = dur(raw) / MARKS[name].end;
    ff(["-i", raw, "-vf", `setpts=PTS/${k.toFixed(5)},fps=30,format=yuv420p`, ...enc, mp4]);
    console.log(`${name}: ${dur(raw).toFixed(1)} s recorded for ${MARKS[name].end} s, played at ${k.toFixed(3)}x`);
  }
  SRC[name] = { file: mp4, d: dur(mp4), m: MARKS[name] };
}
const m = (name, k) => SRC[name].m[k];
// when sentence s of scene i is spoken, from the start of the scene
const say = (i, s) => LEAD + TIMES[i][s].start;

// a piece: source [a, b] played into d seconds; faster when it has to be (with an on-screen note), held when short
let n = 0;
const out = () => path.join(B, `p${String(n++).padStart(3, "0")}.mp4`);
function piece(name, a, b, d, note) {
  const o = out(), span = Math.max(0.1, b - a), f = span / d;
  const vf = [];
  if (f > 1.05) vf.push(`setpts=PTS/${f.toFixed(4)}`);
  vf.push("tpad=stop_mode=clone:stop_duration=30");
  if (f > 1.6 && note) vf.push(`drawtext=fontfile='${FONT}':text='${esc(`${note} · ${f.toFixed(0)}× speed`)}':x=w-text_w-48:y=40:fontsize=30:fontcolor=0x0a7f44:box=1:boxcolor=0xffffff@0.92:boxborderw=16`);
  vf.push("format=yuv420p");
  ff(["-ss", a.toFixed(3), "-t", (span + 0.2).toFixed(3), "-i", SRC[name].file, "-t", d.toFixed(3), "-vf", vf.join(","), ...enc, o]);
  return o;
}

// scene lengths: the narration plus a breath
const LEN = NLEN.map((x, i) => +(LEAD + x + (i === NLEN.length - 1 ? 1.6 : 0.9)).toFixed(2));
LEN[1] += 1.5; // the booked game stays a moment
LEN[2] += 1.0; // the report
LEN[4] += 4.0; // the Messenger conversation carries itself
LEN[6] += 2.0; // the two agents' agreement stays on screen
const S = [];
// 1 · impact: the number, the pain, what Serve does
S.push([["impact", 0.2, 0.2 + LEN[0], LEN[0]]]);
// 2 · the Autopilot: the click, Muse Glimmer's first tools (sped up), the agents negotiating (sped up), then the yes
{
  const a = (k) => m("autopilot", k), c1 = say(1, 1), c3 = say(1, 3), c5 = say(1, 5), L = LEN[1];
  S.push([
    ["autopilot", 0.3, a("run") + 0.6, c1],
    ["autopilot", a("run") + 0.6, a("partners") + 1.0, c3 - c1, "Muse Glimmer planning the week"],
    ["autopilot", a("partners") + 1.0, a("ask"), c5 - c3, "The agents negotiating on Muse Glimmer"],
    ["autopilot", a("ask"), a("end"), L - c5],
  ]);
}
// 3 · the body log: typed, filed on the body, the health export read, what changes, the trail and the report
{
  const b = (k) => m("body", k), c1 = say(2, 1), c3 = say(2, 3), c4 = say(2, 4), c5 = say(2, 5), L = LEN[2];
  S.push([
    ["body", 0.3, b("sent"), c1, "Typing"],
    ["body", b("sent"), b("filed") + 0.5, 2.4, "Muse Glimmer reading it"],
    ["body", b("filed") + 0.5, b("import"), c3 - c1 - 2.4],
    ["body", b("import"), b("imported") + 0.6, c4 - c3, "Reading the export on your server"],
    ["body", b("imported") + 0.6, b("trail"), c5 - c4],
    ["body", b("trail"), b("write") + 0.5, (L - c5) * 0.45, "Drawing the map"],
    ["body", b("write") + 0.5, b("end"), (L - c5) * 0.55, "Muse Glimmer writing the report"],
  ]);
}
// 4 · courts near you: the search and the judging (sped up), then a court and its reasons
{
  const c = (k) => m("courts", k), c2 = say(3, 2), L = LEN[3];
  S.push([
    ["courts", 0.3, c("find") + 0.5, c2],
    ["courts", c("find") + 0.5, c("found") + 0.3, (L - c2) * 0.35, "Searching and judging on Muse Glimmer"],
    ["courts", c("found") + 0.3, c("end"), (L - c2) * 0.65],
  ]);
}
// 5 · the agent in Messenger
S.push([["pocket", 0.2, Math.min(m("pocket", "end"), 0.2 + LEN[4]), LEN[4]]]);
// 6 · the highlight reel: asked, drawn (sped up), the smash replayed in slow motion at real speed, a cut to the finished
//     reel and its caption, then one tap to Instagram or Facebook
{
  const c1 = say(5, 1), c2 = say(5, 2), c3 = say(5, 3), c4 = say(5, 4), h = (k) => m("highlight", k);
  S.push([
    ["highlight", 0.3, h("cutting") + 0.8, c1],
    ["highlight", h("cutting") + 0.8, h("replay"), c2 - c1, "Drawing the reel"],
    ["highlight", h("replay"), h("replayed") + 0.6, c3 - c2],
    ["highlight", h("ready") - 0.4, h("caption"), 1.6], // a cut past the other four rallies to the finished reel
    ["highlight", h("caption"), h("share"), c4 - c3 - 1.6],
    ["highlight", h("share"), h("end"), LEN[5] - c4],
  ]);
}
// 7 · the club: the leaderboard; your best match (sped up); the two agents agreeing (sped up), then the agreed thread
{
  const c1 = say(6, 1), c2 = say(6, 2), L = LEN[6], h = (k) => m("club", k);
  S.push([
    ["club", h("ranks"), h("challenges"), c1],
    ["club", h("challenges"), h("talk"), c2 - c1, "Your agent scoring the club on Muse Glimmer"],
    ["club", h("talk"), h("agreed"), (L - c2) * 0.45, "The two agents agreeing a time on Muse Glimmer"],
    ["club", h("agreed"), h("end"), (L - c2) * 0.55],
  ]);
}
// 8 · Meta AI: what it is built on
{
  const c2 = say(7, 2);
  S.push([["meta", 0.2, m("meta", "vision"), c2], ["meta", m("meta", "vision"), m("meta", "end"), LEN[7] - c2]]);
}
// 9 · technical: the architecture, the checks, the measured numbers
{
  const c1 = say(8, 1);
  S.push([["tech", 0.2, m("tech", "nums"), c1], ["tech", m("tech", "nums"), m("tech", "end"), LEN[8] - c1]]);
}
// 10 · end card
S.push([["end", 0.2, 0.2 + LEN[9], LEN[9]]]);

fs.readdirSync(B).filter((f) => /^p\d+\.mp4$|^scene\d/.test(f)).forEach((f) => fs.rmSync(path.join(B, f)));
const scenes = [], starts = [];
let t = 0;
S.forEach((pieces, k) => {
  const made = pieces.map(([name, a, b, d, note]) => piece(name, a, b, d, note));
  const list = path.join(B, `scene${k + 1}.txt`), raw = path.join(B, `scene${k + 1}_raw.mp4`), sc = path.join(B, `scene${k + 1}.mp4`);
  fs.writeFileSync(list, made.map((x) => `file '${x.replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", raw]);
  const d = dur(raw);
  ff(["-i", raw, "-vf", `fade=t=in:st=0:d=${k ? 0.3 : 0.2}:color=white,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3:color=white`, ...enc, sc]);
  starts.push(t); t += d; scenes.push(sc);
  console.log(`scene ${k + 1}: ${d.toFixed(1)} s (starts ${starts[k].toFixed(1)}), narration ${NLEN[k].toFixed(1)} s`);
});
const all = path.join(B, "scenes.txt"), silent = path.join(B, "video.mp4");
fs.writeFileSync(all, scenes.map((x) => `file '${x.replace(/\\/g, "/")}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", all, "-c", "copy", silent]);

// audio: the narration, each scene's line placed at its scene
const ins = [], mix = [];
NARR.forEach((_, i) => { ins.push("-i", path.join(K, `k${i + 1}.wav`)); const ms = Math.round((starts[i] + LEAD) * 1000); mix.push(`[${i}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`); });
const voice = path.join(B, "audio.wav");
ff([...ins, "-filter_complex", `${mix.join(";")};${NARR.map((_, i) => `[a${i}]`).join("")}amix=inputs=${NARR.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[vo];[vo]apad=whole_dur=${t.toFixed(2)}[a]`,
  "-ar", "48000", "-map", "[a]", voice]);

// subtitles: one line at a time, timed from each spoken sentence
const MAXC = 60;
const lines = (s) => {
  const o = [];
  for (const w of s.split(/(?<=,)\s+/)) { const last = o.at(-1); if (last && (last + " " + w).length <= MAXC) o[o.length - 1] = last + " " + w; else o.push(w); }
  return o.flatMap((x) => { if (x.length <= MAXC + 10) return [x]; const ws = x.split(" "), h = Math.ceil(ws.length / 2); return [ws.slice(0, h).join(" "), ws.slice(h).join(" ")]; });
};
const ts = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
let ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Sub,Segoe UI Semibold,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H330B0B0C,0,0,0,0,100,100,0,0,3,14,0,2,200,200,44,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
TIMES.forEach((rows, i) => rows.forEach((r, j) => {
  const t0 = starts[i] + LEAD + r.start, t1 = starts[i] + LEAD + (rows[j + 1] ? Math.min(r.end + 0.25, rows[j + 1].start) : r.end + 0.4);
  const ls = lines(r.text), chars = ls.reduce((s, l) => s + l.length, 0);
  let x = t0;
  ls.forEach((l, q) => { const e = q === ls.length - 1 ? t1 : x + (r.end - r.start) * l.length / chars; ass += `Dialogue: 0,${ts(x)},${ts(e)},Sub,,0,0,0,,${l}\n`; x = e; });
}));
fs.writeFileSync(path.join(B, "subs.ass"), ass);
fs.writeFileSync(path.join(B, "timeline.json"), JSON.stringify({ starts, lens: LEN, pieces: S }, null, 1));

const OUT = path.join(HERE, "Serve_Meta_demo.mp4"), OUT2 = path.join(HERE, "Serve_Meta_demo_no_voice.mp4");
process.chdir(B);
ff(["-i", silent, "-i", voice, "-vf", "subtitles=subs.ass", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT]);
ff(["-i", silent, "-c:v", "copy", "-movflags", "+faststart", OUT2]);
console.log("wrote", OUT, dur(OUT).toFixed(1), "s");
