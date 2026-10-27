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
LEN[1] += 2.5; // the game going on, after the narration
LEN[3] += 1.0; // the verified answer stays a moment
LEN[8] += 2.5; // the two agents' agreement stays on screen
const S = [];
// 1 · title card: the pain point
S.push([["title", 0.2, 0.2 + LEN[0], LEN[0]]]);
// 2 · the challenge: typed, read (sped up), the map / calendars / middle, the writing (sped up), then the yes
{
  const p = (k) => m("play", k), L = LEN[1];
  const c1 = say(1, 1), c2 = say(1, 2), c4 = say(1, 4), c5 = say(1, 5), c6 = say(1, 6);
  S.push([
    ["play", 0.3, p("play") + 0.6, c1],
    ["play", p("play") + 0.6, p("read") + 0.2, c2 - c1, "Muse Glimmer reading the request"],
    ["play", p("read") + 0.2, p("middle") + 1.4, c4 - c2],
    ["play", p("middle") + 1.4, p("options") + 0.8, c5 - c4 - 2.2, "Muse Glimmer writing the challenge"],
    ["play", p("week"), p("week") + 2.6, 2.2],
    // the yes: the options, the click, the confirmation with the invite Glimmer wrote
    ["play", p("opts"), p("booked"), c6 - c5],
    // then the court is held and the answer comes in (a demo member), and the game is on
    ["play", p("booked"), p("answer"), (L - c6) * 0.42, "Waiting for Kenji (a demo member)"],
    ["play", p("answer"), p("end"), (L - c6) * 0.58],
  ]);
}
// 3 · the agent home: two jobs at once, then a coach's answer with its checks
{
  const c = say(2, 1);
  S.push([["tasks", 0.3, m("tasks", "steps"), c], ["tasks_done", 0.3, m("tasks_done", "end"), LEN[2] - c]]);
}
// 4 · the coach agents: the inbox, Lin, Ren; then a question answered and checked
{
  const c1 = say(3, 1), c2 = say(3, 2), c3 = say(3, 3);
  S.push([
    ["coaches", 0.2, m("coaches", "inbox"), c1],
    // Lin's heat zones and their card (not the page loading, not the move to Ren's page)
    ["coaches", m("coaches", "lin") + 1.6, m("coaches", "ren") - 3.8, c2 - c1],
    // Ren once the 3D body has loaded
    ["coaches", m("coaches", "ren") + 2.0, m("coaches", "end"), c3 - c2],
    ["chat", 0.3, m("chat", "end"), LEN[3] - c3, "Muse Glimmer answering"],
  ]);
}
// 5 · the round table plans the week
S.push([["round", 0.3, m("round", "end"), LEN[4]]]);
// 6 · the 24-hour coach in Messenger
S.push([["pocket", 0.2, Math.min(m("pocket", "end"), 0.2 + LEN[5]), LEN[5]]]);
// 7 · the highlight reel: asked, drawn (sped up), the smash replayed in slow motion at real speed, a cut to the finished
//     reel and its caption, then one tap to Instagram or Facebook
{
  const c1 = say(6, 1), c2 = say(6, 2), c3 = say(6, 3), c4 = say(6, 4), h = (k) => m("highlight", k);
  S.push([
    ["highlight", 0.3, h("cutting") + 0.8, c1],
    ["highlight", h("cutting") + 0.8, h("replay"), c2 - c1, "Drawing the reel"],
    ["highlight", h("replay"), h("replayed") + 0.6, c3 - c2],
    ["highlight", h("ready") - 0.4, h("caption"), 1.6], // a cut past the other four rallies to the finished reel
    ["highlight", h("caption"), h("share"), c4 - c3 - 1.6],
    ["highlight", h("share"), h("end"), LEN[6] - c4],
  ]);
}
// 8 · the coaches keep learning
{
  const c1 = say(7, 1) + 2.0, c2 = say(7, 2) + 3.0;
  S.push([["lab", 0.2, m("lab", "playbooks"), c1], ["lab", m("lab", "playbooks"), m("lab", "adopted"), c2 - c1], ["lab", m("lab", "adopted"), m("lab", "end"), LEN[7] - c2]]);
}
// 9 · the club: quests, the boss and the leaderboard; your best match (sped up); the two agents agreeing (sped up), then
//     the agreed thread held
{
  const c1 = say(8, 1), c2 = say(8, 3), L = LEN[8], h = (k) => m("club", k);
  S.push([
    ["club", 0.3, h("ranks"), c1 * 0.5],
    ["club", h("ranks"), h("challenges"), c1 * 0.5],
    ["club", h("challenges"), h("talk"), c2 - c1, "Your agent scoring the club on Muse Glimmer"],
    ["club", h("talk"), h("agreed"), (L - c2) * 0.45, "The two agents agreeing a time on Muse Glimmer"],
    ["club", h("agreed"), h("end"), (L - c2) * 0.55],
  ]);
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
