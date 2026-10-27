import { useEffect, useMemo, useRef, useState } from "react";
import { shareLinks, postToClub, clubShares } from "../club/share.js";
import { agentCaption, agentReel } from "../agent.js";
import Brand from "../components/Brand.jsx";
import Icon from "../components/Icon.jsx";

// Auto highlight reel: picks a player's best rallies from the labels, then renders them with broadcast-style camera
// work on a canvas: a follow-cam that tracks the shuttle between hitter and receiver (court positions projected into
// the clip with the match homography), an instant slow-motion replay of the final shot with a punch-in on its landing
// spot, and a winner freeze-frame. The reel is recorded in the browser (MP4 where supported) and can be shared.
// Without footage (the default for sharing, and the only way when a clip is missing), the same reel is drawn from the
// tracking data: the court, both players and the shuttle's flight with its height, so a rally can go on Instagram or
// Facebook without a frame of video of anyone. Muse Glimmer writes the caption; every number in it is checked.
// The replay is built on the player's smash. For the clips the reel can pick, Meta's Sapiens2 (pose) and SAM 2.1
// (outline) have read both players on the GPU server (video/pose/people.py): the drawn reel then shows the match as the
// broadcast camera saw it, players as their outlines with their skeletons, and the footage reel lights up the smasher.
const COL = { A: "#6FB6FF", B: "#FF8A6B" };
// split: with footage, the real rally goes on top and Serve's view of it (Sapiens2 skeletons, SAM 2.1 outlines)
// under it in the vertical format, or as an inset in the wide one: what you post is you, and the reel shows how
const FORMATS = {
  vertical: { kind: "vertical", W: 720, H: 1280, label: "9:16 vertical", note: "Reels, TikTok, Shorts", vid: { x: 0, y: 170, w: 720, h: 720 }, zoom: 1.05,
    split: { vid: { x: 0, y: 170, w: 720, h: 540 }, ai: { x: 0, y: 722, w: 720, h: 390 } } },
  wide: { kind: "wide", W: 1280, H: 720, label: "16:9 wide", note: "YouTube, club screens", vid: { x: 0, y: 0, w: 1280, h: 720 }, zoom: 1.3,
    split: { ai: { x: 1280 - 424, y: 720 - 290, w: 400, h: 225 } } },
};
const SRC = { w: 854, h: 480 };
const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase());

// average flight speed of a shot (km/h): hitter position to landing spot, over the time until the next contact
export function shotSpeed(r, i) {
  const s = r.shots[i], n = r.shots[i + 1];
  if (!s?.pos || !s.land || !n) return null;
  const dt = n.t - s.t, d = Math.hypot(s.land[0] - s.pos[0], s.land[1] - s.pos[1]);
  return dt > 0.2 ? (d / dt) * 3.6 : null;
}

export function pickHighlights(m, p, k = 5) {
  return m.rallies.filter((r) => r.winner === p && r.clip).map((r) => {
    const n = r.shots.length, clutch = Math.max(...r.score) >= 18, finish = r.reason === "winner" && r.lastBy === p;
    const smash = finish && /smash/i.test(r.lastType);
    const why = [n >= 12 && `${n}-shot rally`, finish && `${r.lastType.toLowerCase()} winner`, clutch && `at ${r.score[0]}–${r.score[1]}`].filter(Boolean);
    return { r, score: (finish ? 3 : 0) + (smash ? 1.5 : 0) + n / 6 + (clutch ? 2 : 0), why: why.length ? why : [`won at ${r.score[0]}–${r.score[1]}`] };
  }).sort((a, b) => b.score - a.score).slice(0, k).sort((a, b) => a.r.i - b.r.i);
}

// the shot the replay is built on: the winner's last smash in the rally, or else the rally's last shot
export function focusOf(r) {
  const k = r.shots.findLastIndex((s) => s.p === r.winner && /smash/i.test(s.type));
  return k >= 0 ? k : r.shots.length - 1;
}

// both players on every frame of the clips the reel can pick: Sapiens2 keypoints and a SAM 2.1 outline, in clip pixels
// (gitignored: it is derived from the broadcast footage). Without it the reel falls back to the top-down drawing.
let peopleCache;
const loadPeople = () => (peopleCache ||= fetch("/data/highlight_people.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));
// a frame's players [near, far]; outside the slow-motion window only every second frame was read
const peopleAt = (pp, t) => { if (!pp) return null; const i = Math.round(t * pp.fps), f = pp.frames; return f[i] || f[i - 1] || f[i + 1] || null; };
// which end each player is at in this rally: 0 near the camera, 1 far
function sidesOf(r) {
  const at = (pl) => { const s = r.shots.find((x) => x.p === pl && x.pos); return s ? (s.pos[1] > 6.7 ? 0 : 1) : null; };
  const a = at("A") ?? (at("B") == null ? 0 : 1 - at("B"));
  return { A: a, B: 1 - a };
}
const seen = (q) => q && q[2] > .3;
const centre = (p) => { const q = p.k.filter(seen); return q.length ? [q.reduce((s, x) => s + x[0], 0) / q.length, q.reduce((s, x) => s + x[1], 0) / q.length] : null; };
// keypoints are COCO-17, then big toes, heels, neck, index fingertips
const BONES = [[5, 7], [7, 9], [6, 8], [8, 10], [5, 6], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 17], [16, 18], [15, 19], [16, 20], [9, 22], [10, 23], [0, 21], [21, 5], [21, 6]];

const project = (M, [x, y]) => { const w = M[6] * x + M[7] * y + M[8]; return [(M[0] * x + M[1] * y + M[2]) / w, (M[3] * x + M[4] * y + M[5]) / w]; };
// clip pixels per metre across the court at a court point
const across = (M, q) => { const a = project(M, [q[0] - .5, q[1]]), b = project(M, [q[0] + .5, q[1]]); return Math.hypot(b[0] - a[0], b[1] - a[1]); };
// where the racket head is: past the higher wrist, along the forearm, about 0.55 m (in clip pixels)
function racket(pp, side, t, M, at) {
  const f = peopleAt(pp, t), p = f && f[side];
  if (!p) return null;
  const w = [9, 10].filter((i) => seen(p.k[i])).sort((a, b) => p.k[a][1] - p.k[b][1])[0];
  if (w == null) return null;
  const W = p.k[w], E = p.k[w - 2], reach = .55 * (at ? across(M, at) : 40);
  if (!seen(E)) return [W[0], W[1]];
  const d = Math.hypot(W[0] - E[0], W[1] - E[1]) || 1;
  return [W[0] + ((W[0] - E[0]) / d) * reach, W[1] + ((W[1] - E[1]) / d) * reach];
}
// how high a shot climbs above the straight line between the rackets (metres)
const PEAK = (type) => (/clear|lift|long serve|high serve/i.test(type) ? 4 : /smash|drive|kill|rush|push/i.test(type) ? .3 : 1.1);
// the shuttle in clip pixels at time t: from the hitter's racket to the next player's racket (or to the floor on the
// last shot), with its floor shadow
function shuttleAt(r, t, M, pp, sides) {
  const k = r.shots.findLastIndex((x) => x.t <= t);
  if (k < 0 || !M) return null;
  const s = r.shots[k], n = r.shots[k + 1], to = s.land || n?.pos;
  if (!s.pos || !to) return null;
  const dur = n ? Math.max(.25, n.t - s.t) : .9, u = Math.min(1, Math.max(0, (t - s.t) / dur));
  const g0 = project(M, s.pos), g1 = project(M, to), raise = (g, q, h) => [g[0], g[1] - h * .9 * across(M, q)];
  const a = racket(pp, sides[s.p], s.t, M, s.pos) || raise(g0, s.pos, 2.4);
  const b = n ? racket(pp, sides[n.p], n.t, M, n.pos) || raise(project(M, n.pos), n.pos, 1.6) : g1;
  const mid = lerp(s.pos, to, .5), bulge = 4 * u * (1 - u) * PEAK(s.type) * .9 * across(M, mid);
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - bulge], g: lerp(g0, g1, u), u, s, last: !n };
}
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const mean = (pts) => { const q = pts.filter(Boolean); return q.length ? [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length] : null; };

// where the camera wants to look at time t: the shuttle's ground point, weighted with both players
function target(r, t) {
  const k = r.shots.findLastIndex((s) => s.t <= t);
  if (k < 0) return [3.05, 6.7];
  const s = r.shots[k], n = r.shots[k + 1], u = n ? Math.min(1, (t - s.t) / Math.max(.2, n.t - s.t)) : Math.min(1, (t - s.t) / .8);
  const shuttle = s.pos && (s.land || n?.pos) ? lerp(s.pos, s.land || n.pos, u) : s.land || s.pos;
  return mean([shuttle, shuttle, s.pos, s.opp]) || [3.05, 6.7];
}

const LINES = [[0.46, 0, 0.46, 13.4], [5.64, 0, 5.64, 13.4], [3.05, 0, 3.05, 4.72], [3.05, 8.68, 3.05, 13.4], [0, 4.72, 6.1, 4.72], [0, 8.68, 6.1, 8.68], [0, 0.76, 6.1, 0.76], [0, 12.64, 6.1, 12.64]];
function court(ctx, x, y, w, h) {
  ctx.fillStyle = "#16362B"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#DCE6E0"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  const X = (m) => x + (m / 6.1) * w, Y = (m) => y + (m / 13.4) * h;
  ctx.lineWidth = 1.2;
  LINES.forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(X(a), Y(b)); ctx.lineTo(X(c), Y(d)); ctx.stroke(); });
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, Y(6.7)); ctx.lineTo(x + w + 6, Y(6.7)); ctx.stroke();
  return { X, Y };
}

function pill(ctx, x, y, text, dot) {
  ctx.font = "700 26px Segoe UI, sans-serif"; const w = ctx.measureText(text).width + (dot ? 56 : 32);
  ctx.fillStyle = "#04070AE0"; ctx.beginPath(); ctx.roundRect(x, y, w, 50, 14); ctx.fill();
  if (dot) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(x + 24, y + 25, 8, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#EEF1F2"; ctx.fillText(text, x + (dot ? 42 : 16), y + 34);
}

function drawMap(ctx, r, shown, x, y, w, h) {
  const { X, Y } = court(ctx, x, y, w, h);
  shown.forEach((s, i) => {
    if (!s.pos || !s.land) return;
    const last = i === shown.length - 1, x0 = X(s.pos[0]), y0 = Y(s.pos[1]), x1 = X(s.land[0]), y1 = Y(s.land[1]);
    ctx.globalAlpha = last ? 1 : .3; ctx.strokeStyle = COL[s.p]; ctx.lineWidth = last ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) * .18, (y0 + y1) / 2, x1, y1); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  shown.filter((s) => s.land).forEach((s, i, a) => { ctx.globalAlpha = i === a.length - 1 ? 1 : .55; ctx.fillStyle = COL[s.p]; ctx.beginPath(); ctx.arc(X(s.land[0]), Y(s.land[1]), i === a.length - 1 ? 7 : 4, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
}

// the rally drawn from the tracking data, in the video's place: court, players, the shuttle in flight with its height
// (a shadow on the floor and the shuttle above it), earlier shots as faint arcs; the replay pushes in on the landing
const HIGH = /clear|lift|serve/i, LOW = /smash|drive|push|rush|kill/i;
function scene(ctx, vid, r, t, cam, phase) {
  ctx.save();
  ctx.beginPath(); ctx.rect(vid.x, vid.y, vid.w, vid.h); ctx.clip();
  const bg = ctx.createRadialGradient(vid.x + vid.w / 2, vid.y + vid.h * .45, 40, vid.x + vid.w / 2, vid.y + vid.h / 2, vid.w * .75);
  bg.addColorStop(0, "#123026"); bg.addColorStop(1, "#05100c"); ctx.fillStyle = bg; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
  const ch = vid.h * .84, cw = (ch * 6.1) / 13.4, cx = vid.x + (vid.w - cw) / 2, cy = vid.y + (vid.h - ch) / 2;
  const X = (m) => cx + (m / 6.1) * cw, Y = (m) => cy + (m / 13.4) * ch;
  const k = r.shots.findLastIndex((x) => x.t <= t), s = r.shots[k], n = r.shots[k + 1], last = r.shots[r.shots.length - 1];
  if (phase !== "live" && last) {
    const f = last.land || last.pos, z = Math.min(1.9, Math.max(1, cam.z / 1.05) * .8);
    if (f) { ctx.translate(X(f[0]), Y(f[1])); ctx.scale(z, z); ctx.translate(-X(f[0]), -Y(f[1])); }
  }
  court(ctx, cx, cy, cw, ch);
  const arc = (a, b, u = 1) => {
    const [x0, y0, x1, y1] = [X(a[0]), Y(a[1]), X(b[0]), Y(b[1])], qx = (x0 + x1) / 2 + (y1 - y0) * .18, qy = (y0 + y1) / 2;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i <= 24 * u; i++) { const v = i / 24, w = 1 - v; ctx.lineTo(w * w * x0 + 2 * w * v * qx + v * v * x1, w * w * y0 + 2 * w * v * qy + v * v * y1); }
    ctx.stroke();
  };
  for (let i = 0; i < k; i++) { const a = r.shots[i]; if (!a.pos || !a.land) continue; ctx.globalAlpha = .28; ctx.strokeStyle = COL[a.p]; ctx.lineWidth = 2; arc(a.pos, a.land); }
  ctx.globalAlpha = 1;
  if (s?.pos) {
    const end = s.land || n?.pos || s.pos, dur = n ? Math.max(.25, n.t - s.t) : .9, u = Math.min(1, Math.max(0, (t - s.t) / dur));
    ctx.strokeStyle = COL[s.p]; ctx.lineWidth = 3.5; arc(s.pos, end, u);
    const [x0, y0, x1, y1] = [X(s.pos[0]), Y(s.pos[1]), X(end[0]), Y(end[1])], qx = (x0 + x1) / 2 + (y1 - y0) * .18, qy = (y0 + y1) / 2, w = 1 - u;
    const gx = w * w * x0 + 2 * w * u * qx + u * u * x1, gy = w * w * y0 + 2 * w * u * qy + u * u * y1;
    const lift = Math.sin(Math.PI * u) * ch * (HIGH.test(s.type) ? .2 : LOW.test(s.type) ? .05 : .11);
    ctx.fillStyle = "#00000066"; ctx.beginPath(); ctx.ellipse(gx, gy, 9, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - lift); ctx.stroke();
    const glow = ctx.createRadialGradient(gx, gy - lift, 0, gx, gy - lift, 22); glow.addColorStop(0, "#ffffffcc"); glow.addColorStop(1, "#ffffff00");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gx, gy - lift, 22, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(gx, gy - lift, 7, 0, 7); ctx.fill();
    if (u >= 1 && s.land) { ctx.strokeStyle = COL[s.p]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(s.land[0]), Y(s.land[1]), 14, 0, 7); ctx.stroke(); }
    // the hitter where they struck it, the receiver where they were
    const who = [[s.pos, s.p], [s.opp || n?.pos, s.p === "A" ? "B" : "A"]];
    for (const [q, pl] of who) if (q) { ctx.fillStyle = COL[pl]; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 15, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  ctx.restore();
  tag(ctx, vid, "Drawn from the tracking data · no footage");
}

// the drawn picture's note: top left in the vertical format, bottom right in the wide one (clear of the titles)
function tag(ctx, vid, text) {
  ctx.fillStyle = "#ffffffa8"; ctx.font = `600 ${Math.min(17, Math.round(vid.w / 26))}px Segoe UI, sans-serif`;
  if (vid.y) ctx.fillText(text, vid.x + Math.min(24, vid.w / 30), vid.y + Math.min(32, vid.h / 9));
  else { ctx.textAlign = "right"; ctx.fillText(text, vid.x + vid.w - 24, vid.y + vid.h - 44); ctx.textAlign = "left"; }
}

// the camera's crop of the clip (clip pixels) for a view and zoom, and the map from clip pixels onto the canvas
function cropOf(vid, cam, src = SRC) {
  const ar = vid.w / vid.h, ch = Math.min(src.h, src.w / ar) / cam.z, cw = ch * ar;
  const sx = Math.max(0, Math.min(src.w - cw, cam.x - cw / 2)), sy = Math.max(0, Math.min(src.h - ch, cam.y - ch / 2)), k = vid.w / cw;
  return { sx, sy, cw, ch, k, P: ([x, y]) => [vid.x + (x - sx) * k, vid.y + (y - sy) * k] };
}
const outlinePath = (ctx, m, P) => { ctx.beginPath(); for (let i = 0; i < m.length; i += 2) { const [x, y] = P([m[i], m[i + 1]]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
function skeleton(ctx, p, P, lw, color = "#ffffffd9") {
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  for (const [a, b] of BONES) if (seen(p.k[a]) && seen(p.k[b])) { const [x0, y0] = P(p.k[a]), [x1, y1] = P(p.k[b]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  ctx.fillStyle = color;
  p.k.forEach((q, i) => { if (!seen(q) || (i > 0 && i < 5)) return; const [x, y] = P(q); ctx.beginPath(); ctx.arc(x, y, lw * (i === 9 || i === 10 ? 1.7 : 1.1), 0, 7); ctx.fill(); });
}

// the rally as the broadcast camera saw it, without its pixels: the court through the match homography, both players
// as their SAM 2.1 outlines with their Sapiens2 skeletons, the shuttle from racket to racket. The follow-cam and the
// replay's push-in crop it exactly as they crop the footage.
function persp(ctx, vid, r, t, crop, M, h, phase, note = "Drawn from Sapiens2 pose + SAM 2.1 outlines · no footage") {
  const { k, P } = crop, C = (q) => P(project(M, q)), up = (q, m) => { const [x, y] = C(q); return [x, y - m * .9 * across(M, q) * k]; };
  ctx.save(); ctx.beginPath(); ctx.rect(vid.x, vid.y, vid.w, vid.h); ctx.clip();
  const bg = ctx.createLinearGradient(0, vid.y, 0, vid.y + vid.h); bg.addColorStop(0, "#030607"); bg.addColorStop(1, "#0A1A14");
  ctx.fillStyle = bg; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
  const poly = (pts, fill) => { ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = C(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  poly([[-2.6, -3.2], [8.7, -3.2], [8.7, 16.6], [-2.6, 16.6]], "#0D221A");
  poly([[0, 0], [6.1, 0], [6.1, 13.4], [0, 13.4]], "#17392D");
  const seg = (a, b) => { const [x0, y0] = C(a), [x1, y1] = C(b); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  ctx.strokeStyle = "#DCE6E0B8"; ctx.lineWidth = Math.max(1, .9 * k);
  [[0, 0, 6.1, 0], [6.1, 0, 6.1, 13.4], [6.1, 13.4, 0, 13.4], [0, 13.4, 0, 0], ...LINES].forEach(([a, b, c, d]) => seg([a, b], [c, d]));
  const f = peopleAt(h.pp, t), lit = phase !== "live";
  const fig = (side) => {
    const p = f?.[side];
    if (!p) return;
    const pl = h.sides.A === side ? "A" : "B", on = lit && side === h.fside, lw = Math.max(1, k * (side ? .7 : 1.1));
    const feet = [15, 16, 19, 20].map((i) => p.k[i]).filter(seen);
    if (feet.length) {
      const [x, y] = P([feet.reduce((s, q) => s + q[0], 0) / feet.length, Math.max(...feet.map((q) => q[1]))]);
      ctx.fillStyle = "#00000080"; ctx.beginPath(); ctx.ellipse(x, y, 16 * lw, 4.5 * lw, 0, 0, 7); ctx.fill();
    }
    ctx.save(); ctx.globalAlpha = lit && !on ? .45 : 1;
    if (p.m) {
      outlinePath(ctx, p.m, P);
      if (on) { ctx.shadowColor = COL[pl]; ctx.shadowBlur = 30; }
      ctx.fillStyle = COL[pl] + (on ? "F2" : "CC"); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = on ? "#ffffff" : COL[pl]; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      skeleton(ctx, p, P, lw, on && phase === "impact" ? "#ffffff" : "#04070A88");
    } else skeleton(ctx, p, P, lw * 3.5, COL[pl]);
    ctx.restore();
  };
  fig(1);
  // the net between the two ends: a translucent band 1.55 m tall between the posts, the white tape on top
  const n0 = C([0, 6.7]), n1 = C([6.1, 6.7]), t0 = up([0, 6.7], 1.55), t1 = up([6.1, 6.7], 1.55);
  ctx.fillStyle = "#ffffff14"; ctx.beginPath(); ctx.moveTo(...n0); ctx.lineTo(...n1); ctx.lineTo(...t1); ctx.lineTo(...t0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#C9D3CF"; ctx.lineWidth = Math.max(1, 1.2 * k); ctx.beginPath(); ctx.moveTo(...n0); ctx.lineTo(...t0); ctx.moveTo(...n1); ctx.lineTo(...t1); ctx.stroke();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, 1.6 * k); ctx.beginPath(); ctx.moveTo(...t0); ctx.lineTo(...t1); ctx.stroke();
  fig(0);
  const sh = shuttleAt(r, t, M, h.pp, h.sides);
  if (sh) {
    const [gx, gy] = P(sh.g), [x, y] = P(sh.p);
    ctx.fillStyle = "#00000070"; ctx.beginPath(); ctx.ellipse(gx, gy, 5 * k, 1.8 * k, 0, 0, 7); ctx.fill();
    // a short trail behind it, then the shuttle with a glow
    const trail = [[x, y]];
    for (let j = 1; j <= 6; j++) { const q = shuttleAt(r, t - j * .03, M, h.pp, h.sides); if (!q || q.s !== sh.s) break; trail.push(P(q.p)); }
    ctx.strokeStyle = "#ffffff"; ctx.lineCap = "round";
    for (let j = 1; j < trail.length; j++) { ctx.globalAlpha = .5 * (1 - j / trail.length); ctx.lineWidth = 2.4 * k * (1 - j / (trail.length + 1)); ctx.beginPath(); ctx.moveTo(...trail[j - 1]); ctx.lineTo(...trail[j]); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 9 * k); glow.addColorStop(0, "#ffffffcc"); glow.addColorStop(1, "#ffffff00");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 9 * k, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 2.4 * k, 0, 7); ctx.fill();
    if (sh.last && sh.u >= 1 && sh.s.land) { const [lx, ly] = C(sh.s.land); ctx.strokeStyle = COL[sh.s.p]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(lx, ly, 10 * k, 3.6 * k, 0, 0, 7); ctx.stroke(); }
  }
  ctx.restore();
  tag(ctx, vid, note);
}

// the replay's spotlight on the footage: the frame dims except the smasher, whom SAM 2.1 cut out, and a rim of light
let spotCanvas;
function spotlight(ctx, vid, p, P, color, strength) {
  const c = (spotCanvas ||= document.createElement("canvas"));
  if (c.width !== ctx.canvas.width || c.height !== ctx.canvas.height) { c.width = ctx.canvas.width; c.height = ctx.canvas.height; }
  const o = c.getContext("2d");
  o.clearRect(0, 0, c.width, c.height);
  o.fillStyle = `rgba(4,7,10,${.62 * strength})`; o.fillRect(vid.x, vid.y, vid.w, vid.h);
  o.globalCompositeOperation = "destination-out"; o.filter = "blur(8px)";
  outlinePath(o, p.m, P); o.fillStyle = "#000"; o.fill();
  o.filter = "none"; o.globalCompositeOperation = "source-over";
  ctx.drawImage(c, 0, 0);
  ctx.save(); ctx.globalAlpha = strength; ctx.shadowColor = color; ctx.shadowBlur = 22; ctx.strokeStyle = color; ctx.lineWidth = 2.5; outlinePath(ctx, p.m, P); ctx.stroke(); ctx.restore();
}

// one composited frame: camera crop of the clip + overlays for the chosen format
function frame(ctx, F, h, k, total, m, video, t, cam, phase) {
  const r = h.r, names = m.names, shown = r.shots.filter((s) => s.t <= t + 0.05), cur = shown[shown.length - 1], { W, H, vid } = F;
  if (phase === "winner") t = video.currentTime; // the freeze-frame shows the picture where the replay stopped
  ctx.fillStyle = "#04070A"; ctx.fillRect(0, 0, W, H);
  ctx.canvas.dataset.phase = phase; // live, replay, impact or winner: the demo recorder (video/record.mjs) waits on it
  const crop = cropOf(vid, cam), lit = phase === "replay" || phase === "impact", fp = peopleAt(h.pp, t)?.[h.fside];
  if (video.court) h.pp && m.cam ? persp(ctx, vid, r, t, crop, m.cam, h, phase) : scene(ctx, vid, r, t, cam, phase);
  else if (video.videoWidth) {
    const kx = video.videoWidth / SRC.w, ky = video.videoHeight / SRC.h;
    ctx.drawImage(video, crop.sx * kx, crop.sy * ky, crop.cw * kx, crop.ch * ky, vid.x, vid.y, vid.w, vid.h);
    // the replay lights the smasher up: SAM 2.1's outline of them, and on contact Sapiens2's reading of their pose
    if (lit && fp?.m) { ctx.save(); ctx.beginPath(); ctx.rect(vid.x, vid.y, vid.w, vid.h); ctx.clip(); spotlight(ctx, vid, fp, crop.P, COL[h.fs.p], phase === "impact" ? 1 : cam.u ?? 1); ctx.restore(); }
    if (phase === "impact" && fp) skeleton(ctx, fp, crop.P, Math.max(1.5, crop.k * .8));
  }
  const vb = vid.y + vid.h;
  if (lit) {
    // broadcast-replay look: vignette, letterbox bars, a slow-motion badge, and a flash on contact
    const cx = vid.x + vid.w / 2, cy = vid.y + vid.h / 2, g = ctx.createRadialGradient(cx, cy, vid.h * .25, cx, cy, vid.h * .75);
    g.addColorStop(0, "#04070A00"); g.addColorStop(1, "#04070AB0");
    ctx.fillStyle = g; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
    const bar = vid.h * .07;
    ctx.fillStyle = "#000"; ctx.fillRect(vid.x, vid.y, vid.w, bar); ctx.fillRect(vid.x, vid.y + vid.h - bar, vid.w, bar);
    const by = vid.y + bar + (F.kind === "wide" ? 100 : 16), badge = phase === "impact" ? "● CONTACT" : `▶ ${h.fs.type.toUpperCase()} · SLOW-MO`;
    ctx.font = "800 24px Consolas, monospace";
    ctx.fillStyle = "#D6332A"; ctx.beginPath(); ctx.roundRect(vid.x + 24, by, ctx.measureText(badge).width + 28, 46, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(badge, vid.x + 38, by + 31);
    if (h.pp) { ctx.fillStyle = "#ffffffb8"; ctx.font = "600 17px Segoe UI, sans-serif"; ctx.fillText("Players read by Sapiens2 and SAM 2.1", vid.x + 26, by + 72); }
    if (phase === "impact") {
      // a flash, and a ring opening out from the racket at contact
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, .35 - (cam.t || 0) * .9)})`; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
      const hit = h.pp && m.cam && racket(h.pp, h.fside, h.fs.t, m.cam, h.fs.pos), [rx, ry] = hit ? crop.P(hit) : [cx, cy - vid.h * .04];
      ctx.save(); ctx.beginPath(); ctx.rect(vid.x, vid.y, vid.w, vid.h); ctx.clip();
      ctx.strokeStyle = "#F2E6C9"; ctx.lineWidth = 4; ctx.beginPath();
      ctx.arc(rx, ry, hit ? (14 + 50 * (cam.t || 0)) * crop.k : vid.h * (.16 + (cam.t || 0) * .1), 0, 7); ctx.stroke();
      ctx.restore();
    }
  }
  if (phase === "winner") {
    ctx.fillStyle = "#04070A99"; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
    ctx.save(); ctx.translate(vid.x + vid.w / 2, vid.y + vid.h / 2); ctx.rotate(-0.08);
    ctx.strokeStyle = "#F2E6C9"; ctx.lineWidth = 6; ctx.strokeRect(-250, -75, 500, 150);
    ctx.fillStyle = "#F2E6C9"; ctx.textAlign = "center"; ctx.font = "900 60px Bahnschrift, Segoe UI, sans-serif";
    ctx.fillText(r.reason === "winner" ? `${r.lastType.toUpperCase()}!` : "POINT!", 0, 2);
    ctx.font = "700 30px Consolas, monospace"; ctx.fillText(`${names[r.winner].split(" ")[0]} · ${r.score[0]}–${r.score[1]}`, 0, 50);
    ctx.restore();
  }
  if (cur && phase !== "winner") {
    const v = shotSpeed(r, shown.length - 1);
    pill(ctx, vid.x + 24, vb - 78, `${cur.type} · ${names[cur.p].split(" ")[0]}${v ? ` · avg ${Math.round(v)} km/h` : ""}`, COL[cur.p]);
  }
  // the split reel: Serve's view of the same moment, same camera, under the footage (or as an inset)
  if (F.ai && m.cam) {
    const a = F.ai, wide = F.kind === "wide";
    if (wide) { ctx.fillStyle = "#04070A"; ctx.beginPath(); ctx.roundRect(a.x - 5, a.y - 5, a.w + 10, a.h + 10, 12); ctx.fill(); }
    persp(ctx, a, r, t, cropOf(a, cam), m.cam, h, phase, wide ? "How Serve sees it" : "How Serve sees it · Sapiens2 pose + SAM 2.1 outlines");
    if (wide) { ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(a.x, a.y, a.w, a.h, 8); ctx.stroke(); }
  }
  const head = cap(h.why[0] || "");
  if (F.kind === "vertical" && F.ai) {
    ctx.fillStyle = "#F2E6C9"; ctx.font = "600 22px Consolas, monospace"; ctx.fillText("SERVE · TOP " + total, 40, 62);
    ctx.fillStyle = "#8A979E"; ctx.textAlign = "right"; ctx.fillText(`${k + 1} / ${total}`, W - 40, 62); ctx.textAlign = "left";
    ctx.fillStyle = "#EEF1F2"; ctx.font = "700 40px Segoe UI, sans-serif"; ctx.fillText(names[r.winner], 40, 120);
    ctx.fillStyle = "#8A979E"; ctx.font = "400 22px Segoe UI, sans-serif"; ctx.fillText(`vs ${names[r.winner === "A" ? "B" : "A"]} · Game ${r.set} · ${m.event}`, 40, 152);
    const y0 = F.ai.y + F.ai.h + 58;
    ctx.fillStyle = "#F2E6C9"; ctx.font = "800 44px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(head, 40, y0);
    ctx.fillStyle = "#8A979E"; ctx.font = "600 20px Consolas, monospace"; ctx.textAlign = "right";
    ctx.fillText(`SHOT ${shown.length} / ${r.shots.length}`, W - 40, y0); ctx.textAlign = "left";
    r.shots.forEach((s, i) => { ctx.fillStyle = s.t <= t || phase === "winner" ? COL[s.p] : "#1E282E"; ctx.fillRect(40 + i * (640 / r.shots.length), y0 + 22, 640 / r.shots.length - 3, 8); });
    ctx.fillStyle = "#5FD39A"; ctx.font = "500 18px Consolas, monospace"; ctx.fillText("● read on your own GPU · YOLO, Sapiens2, SAM 2.1", 40, H - 30);
  } else if (F.kind === "vertical") {
    ctx.fillStyle = "#F2E6C9"; ctx.font = "600 22px Consolas, monospace"; ctx.fillText("SERVE · TOP " + total, 40, 62);
    ctx.fillStyle = "#8A979E"; ctx.textAlign = "right"; ctx.fillText(`${k + 1} / ${total}`, W - 40, 62); ctx.textAlign = "left";
    ctx.fillStyle = "#EEF1F2"; ctx.font = "700 40px Segoe UI, sans-serif"; ctx.fillText(names[r.winner], 40, 120);
    ctx.fillStyle = "#8A979E"; ctx.font = "400 22px Segoe UI, sans-serif"; ctx.fillText(`vs ${names[r.winner === "A" ? "B" : "A"]} · Game ${r.set} · ${m.event}`, 40, 152);
    const y0 = vb + 70;
    ctx.fillStyle = "#F2E6C9"; ctx.font = "800 54px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(head, 40, y0);
    ctx.fillStyle = "#C3CACD"; ctx.font = "400 28px Segoe UI, sans-serif"; h.why.slice(1).forEach((w, i) => ctx.fillText(w, 40, y0 + 48 + i * 38));
    const top = Math.max(0, ...r.shots.map((_, i) => shotSpeed(r, i) ?? 0));
    ctx.fillStyle = "#8A979E"; ctx.font = "600 22px Consolas, monospace";
    ctx.fillText(`SHOT ${shown.length} / ${r.shots.length}${top ? `   FASTEST AVG ${Math.round(top)} KM/H` : ""}`, 40, y0 + 150);
    r.shots.forEach((s, i) => { ctx.fillStyle = s.t <= t || phase === "winner" ? COL[s.p] : "#1E282E"; ctx.fillRect(40 + i * (420 / r.shots.length), y0 + 168, 420 / r.shots.length - 3, 10); });
    drawMap(ctx, r, shown, W - 160, y0 - 40, 120, 264);
    ctx.fillStyle = "#5FD39A"; ctx.font = "500 18px Consolas, monospace"; ctx.fillText("● analysed on-device · no upload", 40, H - 40);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, 140); g.addColorStop(0, "#04070ACC"); g.addColorStop(1, "#04070A00");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 140);
    ctx.fillStyle = "#F2E6C9"; ctx.font = "600 20px Consolas, monospace"; ctx.fillText(`SERVE · TOP ${total} · ${k + 1}/${total}`, 32, 44);
    ctx.fillStyle = "#EEF1F2"; ctx.font = "800 40px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(`${head} · ${names[r.winner]}`, 32, 92);
    ctx.fillStyle = "#04070AD0"; ctx.beginPath(); ctx.roundRect(W - 132, 24, 108, 220, 10); ctx.fill();
    drawMap(ctx, r, shown, W - 122, 34, 88, 194);
    r.shots.forEach((s, i) => { ctx.fillStyle = s.t <= t || phase === "winner" ? COL[s.p] : "#ffffff22"; ctx.fillRect(32 + i * (500 / r.shots.length), H - 22, 500 / r.shots.length - 3, 8); });
  }
}

function card(ctx, F, h, k, total, names) {
  const { W, H } = F;
  ctx.fillStyle = "#04070A"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#F2E6C9"; ctx.font = "600 24px Consolas, monospace"; ctx.fillText(`HIGHLIGHT ${k + 1} OF ${total}`, 60, H / 2 - 70);
  ctx.fillStyle = "#EEF1F2"; ctx.font = "800 64px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(cap(h.why[0]), 60, H / 2);
  ctx.fillStyle = "#8A979E"; ctx.font = "400 30px Segoe UI, sans-serif"; ctx.fillText(`${names[h.r.winner]} · Game ${h.r.set}`, 60, H / 2 + 54);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// stands in for the video element when the reel is drawn: the same currentTime, playbackRate, play, pause and seek
function clockFor(r) {
  const end = (r.shots[r.shots.length - 1]?.t ?? 0) + 1.2;
  let t = Math.max(0, (r.shots[0]?.t ?? 0) - .4);
  const c = {
    court: true, videoWidth: 0, playbackRate: 1, paused: true, duration: end, onseeked: null,
    get currentTime() { return t; }, set currentTime(x) { t = x; setTimeout(() => c.onseeked?.(), 0); },
    get ended() { return t >= end; },
    play() { c.paused = false; return Promise.resolve(); }, pause() { c.paused = true; },
    tick(dt) { if (!c.paused) t = Math.min(end, t + dt * c.playbackRate); },
  };
  return c;
}
function playUntil(v, until, stopRef, draw) {
  return new Promise((done) => {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      v.tick?.(dt);
      if (stopRef.current || v.ended || (until != null && v.currentTime >= until)) return done();
      draw(dt); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// plays the reel onto the canvas; resolves when done or when stop() is called
async function run(canvas, F, list, m, stopRef, onStep, drawn = false, people = null) {
  const ctx = canvas.getContext("2d"), M = m.cam;
  for (let k = 0; k < list.length && !stopRef.current; k++) {
    onStep(k);
    // the replay is built on the smash (else the last shot); the players read for this clip, if there are any
    const r = list[k].r, last = r.shots[focusOf(r)], sides = sidesOf(r);
    const h = { ...list[k], fs: last, sides, fside: last ? sides[last.p] : 0, pp: people?.[r.clip] || null };
    card(ctx, F, h, k, list.length, m.names);
    let v;
    if (drawn) { v = clockFor(r); await wait(1000); } else {
      v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.src = `/media/rallies/${r.clip}`;
      await Promise.all([new Promise((ok) => { v.oncanplay = ok; v.onerror = ok; }), wait(1000)]);
      if (!v.videoWidth) v = clockFor(r); // no footage for this rally here: draw it instead
    }
    const L = !v.court && h.pp && M ? { ...F, ...F.split } : F;
    const cam = { x: SRC.w / 2, y: SRC.h / 2, z: 1 };
    // camera: eases toward a point in clip pixels; zoom has its own (slower or faster) rate
    const toward = (dt, zGoal, [tx, ty], rate = 2.4, zRate = 1.6) => {
      const a = 1 - Math.exp(-dt * rate);
      cam.x += (tx - cam.x) * a; cam.y += (ty - cam.y) * a; cam.z += (zGoal - cam.z) * (1 - Math.exp(-dt * zRate));
    };
    const px = (court) => (M ? project(M, court) : [SRC.w / 2, SRC.h / 2]);
    // a player's body in the clip: feet projected from the court, raised by about half a body height at that depth
    const body = (court) => {
      const [u, y] = px(court), [a] = px([court[0] - .5, court[1]]), [b] = px([court[0] + .5, court[1]]);
      return [u, y - Math.abs(b - a) * 1.1];
    };
    // the smasher themself when Sapiens2 has read them on that frame, else where the labels put them; reach > 0 aims
    // part of the way up to the racket, so the contact stays in the picture when the camera is in tight
    const smasher = (t, court, reach = 0) => {
      const p = peopleAt(h.pp, t)?.[h.fside], c = p && centre(p);
      if (!c) return body(court);
      const tip = reach && M && racket(h.pp, h.fside, t, M, court);
      return tip ? lerp(c, tip, reach) : c;
    };
    const follow = (dt, zGoal, look, rate) => { const [x, y] = px(look); toward(dt, zGoal, [x, y - 30], rate); };
    // 1 live action with the follow-cam
    await v.play().catch(() => {});
    await playUntil(v, null, stopRef, (dt) => { follow(dt, L.zoom, target(r, v.currentTime)); frame(ctx, L, h, k, list.length, m, v, v.currentTime, cam, "live"); });
    if (stopRef.current) break;
    // 2 instant replay of the smash (or the last shot), built like a broadcast replay:
    //    speed ramps down into slow motion, to a quarter, while the camera pushes in tight on the player who hits it,
    //    the frame holds on contact with a flash, then eases out toward where the shuttle lands
    if (last) {
      const who = last.pos || target(r, last.t), spot = last.land || who;
      const from = Math.max(0, last.t - 1.6);
      v.currentTime = from; await new Promise((ok) => { v.onseeked = ok; });
      v.playbackRate = 0.6; await v.play().catch(() => {});
      await playUntil(v, last.t, stopRef, (dt) => {
        const u = Math.min(1, (v.currentTime - from) / Math.max(.2, last.t - from));
        v.playbackRate = Math.max(.25, .6 - .35 * u); // speed ramp into slow motion
        cam.u = u; // the spotlight comes up as the replay slows
        toward(dt, L.zoom * (1 + 1.2 * u), smasher(v.currentTime, who, .4 * u), 3.2, 2.2);
        frame(ctx, L, h, k, list.length, m, v, v.currentTime, cam, "replay");
      });
      if (stopRef.current) break;
      // hold on contact
      v.pause();
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          cam.t = (performance.now() - t0) / 1000;
          toward(1 / 60, L.zoom * 2.3, smasher(last.t, who, .4), 3.2, 3);
          frame(ctx, L, h, k, list.length, m, v, v.currentTime, cam, "impact");
          cam.t < .8 && !stopRef.current ? requestAnimationFrame(tick) : done();
        };
        tick();
      });
      cam.t = 0;
      v.playbackRate = .3; await v.play().catch(() => {});
      await playUntil(v, Math.min(v.duration - .05, last.t + .9), stopRef, (dt) => {
        const u = Math.min(1, (v.currentTime - last.t) / .9);
        cam.u = 1 - .6 * u;
        toward(dt, L.zoom * (2.2 - .8 * u), lerp(smasher(v.currentTime, who), px(spot), u * .6), 2, 1.4);
        frame(ctx, L, h, k, list.length, m, v, v.currentTime, cam, "replay");
      });
      v.pause();
      cam.u = 1;
    }
    // 3 winner freeze-frame
    frame(ctx, L, h, k, list.length, m, v, 1e9, cam, "winner");
    await wait(stopRef.current ? 0 : 1100);
  }
}

// ---- your own video: the reel of your best moment, in any sport --------------------------------------------------
// The clip you filmed goes to your own GPU server once (video/pose/reel.py): DETR finds you, Sapiens2 reads your
// pose, SAM 2.1 cuts you out, and your fastest overhead swing is the smash. The reel is your footage on top and
// Serve's view of you under it: your outline lit up, your skeleton, and the path of your racket hand.
const ME = "#6FB6FF", THEM = "#FF8A6B";
// the moment the reel is built on, by sport (video/pose/reel.py finds it): a smash, a shot, a jump shot, a spike, a kick
const kindOf = (d) => d.kind || "smash";
export const OWN_SPORTS = [["badminton", "Badminton"], ["tennis", "Tennis"], ["pickleball", "Pickleball"], ["table tennis", "Table tennis"], ["basketball", "Basketball"], ["volleyball", "Volleyball"], ["soccer", "Soccer"]];
const OWN = {
  vertical: { ...FORMATS.vertical, vid: { x: 0, y: 170, w: 720, h: 560 }, ai: { x: 0, y: 742, w: 720, h: 370 } },
  wide: { ...FORMATS.wide, ai: FORMATS.wide.split.ai },
};
const bodyH = (p) => { const k = p.k, f = [15, 16, 19, 20].map((i) => k[i]).filter(seen); return seen(k[0]) && f.length ? Math.max(...f.map((q) => q[1])) - k[0][1] : 0; };
// the racket head: past your higher wrist along the forearm, about a third of your height
function tipOf(p) {
  const w = [9, 10].filter((i) => seen(p.k[i])).sort((a, b) => p.k[a][1] - p.k[b][1])[0];
  if (w == null) return null;
  const W = p.k[w], E = p.k[w - 2], reach = .3 * (bodyH(p) || 120);
  if (!seen(E)) return [W[0], W[1]];
  const d = Math.hypot(W[0] - E[0], W[1] - E[1]) || 1;
  return [W[0] + ((W[0] - E[0]) / d) * reach, W[1] + ((W[1] - E[1]) / d) * reach];
}

function aiOwn(ctx, a, d, t, cam, phase) {
  const { P, k } = cropOf(a, cam, d), f = peopleAt(d, t), lit = phase !== "live";
  ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
  const bg = ctx.createLinearGradient(0, a.y, 0, a.y + a.h); bg.addColorStop(0, "#04080A"); bg.addColorStop(1, "#0C1D17");
  ctx.fillStyle = bg; ctx.fillRect(a.x, a.y, a.w, a.h);
  // your racket hand over the last half second, fading behind it
  const trail = [];
  for (let j = 0; j <= 15; j++) { const g = peopleAt(d, t - j / 30)?.[0], tip = g && tipOf(g); if (tip) trail.push(P(tip)); }
  ctx.lineCap = "round";
  for (let j = 1; j < trail.length; j++) { ctx.globalAlpha = .85 * (1 - j / trail.length); ctx.strokeStyle = "#F2E6C9"; ctx.lineWidth = Math.max(1.5, 3.2 * k * (1 - j / (trail.length + 2))); ctx.beginPath(); ctx.moveTo(...trail[j - 1]); ctx.lineTo(...trail[j]); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (const side of [1, 0]) {
    const p = f?.[side];
    if (!p) continue;
    const me = side === 0, col = me ? ME : THEM, lw = Math.max(1.2, k * (me ? 1.3 : .9));
    const feet = [15, 16, 19, 20].map((i) => p.k[i]).filter(seen);
    if (feet.length) { const [x, y] = P([feet.reduce((s, q) => s + q[0], 0) / feet.length, Math.max(...feet.map((q) => q[1]))]); ctx.fillStyle = "#00000088"; ctx.beginPath(); ctx.ellipse(x, y, 20 * lw, 5 * lw, 0, 0, 7); ctx.fill(); }
    ctx.save(); ctx.globalAlpha = me ? 1 : .45;
    if (p.m) {
      outlinePath(ctx, p.m, P);
      if (me) { ctx.shadowColor = col; ctx.shadowBlur = lit ? 34 : 18; }
      ctx.fillStyle = col + (me ? "F0" : "B0"); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = me ? "#ffffff" : col; ctx.lineWidth = me ? 2 : 1; ctx.stroke();
      skeleton(ctx, p, P, lw, me && phase === "impact" ? "#ffffff" : "#04070A88");
    } else skeleton(ctx, p, P, lw * 3, col);
    ctx.restore();
  }
  ctx.restore();
  tag(ctx, a, F_NOTE(a));
}
const F_NOTE = (a) => (a.w < 500 ? "How Serve sees you" : "How Serve sees you · DETR, Sapiens2, SAM 2.1");

function frameOwn(ctx, F, d, video, t, cam, phase) {
  const { W, H, vid } = F, crop = cropOf(vid, cam, d), f = peopleAt(d, t), me = f?.[0], lit = phase === "replay" || phase === "impact";
  ctx.canvas.dataset.phase = phase;
  ctx.fillStyle = "#04070A"; ctx.fillRect(0, 0, W, H);
  if (video.videoWidth) {
    const kx = video.videoWidth / d.w, ky = video.videoHeight / d.h;
    ctx.drawImage(video, crop.sx * kx, crop.sy * ky, crop.cw * kx, crop.ch * ky, vid.x, vid.y, vid.w, vid.h);
  }
  if (lit && me?.m) { ctx.save(); ctx.beginPath(); ctx.rect(vid.x, vid.y, vid.w, vid.h); ctx.clip(); spotlight(ctx, vid, me, crop.P, ME, phase === "impact" ? 1 : cam.u ?? 1); ctx.restore(); }
  if (phase === "impact" && me) skeleton(ctx, me, crop.P, Math.max(1.5, crop.k * .9));
  if (lit) {
    const bar = vid.h * .07;
    ctx.fillStyle = "#000"; ctx.fillRect(vid.x, vid.y, vid.w, bar); ctx.fillRect(vid.x, vid.y + vid.h - bar, vid.w, bar);
    const by = vid.y + bar + (F.kind === "wide" ? 100 : 16), badge = phase === "impact" ? (kindOf(d) === "kick" ? "● THE KICK" : /jump|spike/.test(kindOf(d)) ? "● TOP OF THE JUMP" : "● CONTACT") : `▶ ${kindOf(d).toUpperCase()} · SLOW-MO`;
    ctx.font = "800 24px Consolas, monospace"; ctx.fillStyle = "#D6332A"; ctx.beginPath(); ctx.roundRect(vid.x + 24, by, ctx.measureText(badge).width + 28, 46, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(badge, vid.x + 38, by + 31);
    if (phase === "impact") {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, .35 - (cam.t || 0) * .9)})`; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
      const tip = me && tipOf(me);
      if (tip) {
        const [x, y] = crop.P(tip);
        ctx.save(); ctx.beginPath(); ctx.rect(vid.x, vid.y, vid.w, vid.h); ctx.clip();
        ctx.strokeStyle = "#F2E6C9"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, (14 + 50 * (cam.t || 0)) * crop.k, 0, 7); ctx.stroke();
        ctx.restore();
      }
    }
  }
  if (phase === "winner") {
    ctx.fillStyle = "#04070A88"; ctx.fillRect(vid.x, vid.y, vid.w, vid.h);
    ctx.save(); ctx.translate(vid.x + vid.w / 2, vid.y + vid.h / 2); ctx.rotate(-0.08);
    ctx.strokeStyle = "#F2E6C9"; ctx.lineWidth = 6; ctx.strokeRect(-230, -70, 460, 140);
    ctx.fillStyle = "#F2E6C9"; ctx.textAlign = "center"; ctx.font = "900 64px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(d.smash != null ? `${kindOf(d).toUpperCase()}!` : "RALLY!", 0, 6);
    ctx.font = "700 26px Consolas, monospace"; ctx.fillText("MY GAME · SERVE", 0, 48);
    ctx.restore();
  }
  if (F.ai) {
    const a = F.ai, wide = F.kind === "wide";
    if (wide) { ctx.fillStyle = "#04070A"; ctx.beginPath(); ctx.roundRect(a.x - 5, a.y - 5, a.w + 10, a.h + 10, 12); ctx.fill(); }
    aiOwn(ctx, a, d, t, cam, phase);
    if (wide) { ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(a.x, a.y, a.w, a.h, 8); ctx.stroke(); }
  }
  const when = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (F.kind === "vertical") {
    ctx.fillStyle = "#F2E6C9"; ctx.font = "600 22px Consolas, monospace"; ctx.fillText(`SERVE · MY ${kindOf(d).toUpperCase()}`, 40, 62);
    ctx.fillStyle = "#EEF1F2"; ctx.font = "700 40px Segoe UI, sans-serif"; ctx.fillText("Me, in slow motion", 40, 120);
    ctx.fillStyle = "#8A979E"; ctx.font = "400 22px Segoe UI, sans-serif"; ctx.fillText(`My own video · ${when}`, 40, 152);
    const y0 = F.ai.y + F.ai.h + 58;
    ctx.fillStyle = "#F2E6C9"; ctx.font = "800 44px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(d.smash != null ? `My ${kindOf(d)}` : "My game", 40, y0);
    ctx.fillStyle = "#8A979E"; ctx.font = "600 20px Consolas, monospace"; ctx.textAlign = "right"; ctx.fillText(phase === "live" ? "REAL SPEED" : "QUARTER SPEED", W - 40, y0); ctx.textAlign = "left";
    ctx.fillStyle = "#5FD39A"; ctx.font = "500 18px Consolas, monospace"; ctx.fillText("● read on my own GPU · DETR, Sapiens2, SAM 2.1", 40, H - 30);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, 140); g.addColorStop(0, "#04070ACC"); g.addColorStop(1, "#04070A00");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 140);
    ctx.fillStyle = "#F2E6C9"; ctx.font = "600 20px Consolas, monospace"; ctx.fillText(`SERVE · MY ${kindOf(d).toUpperCase()}`, 32, 44);
    ctx.fillStyle = "#EEF1F2"; ctx.font = "800 40px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(`Me, in slow motion · ${when}`, 32, 92);
  }
}

function cardOwn(ctx, F, d = {}) {
  const { W, H } = F;
  ctx.fillStyle = "#04070A"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#F2E6C9"; ctx.font = "600 24px Consolas, monospace"; ctx.fillText("MY OWN VIDEO", 60, H / 2 - 70);
  ctx.fillStyle = "#EEF1F2"; ctx.font = "800 64px Bahnschrift, Segoe UI, sans-serif"; ctx.fillText(`My ${kindOf(d)}`, 60, H / 2);
  ctx.fillStyle = "#8A979E"; ctx.font = "400 28px Segoe UI, sans-serif"; ctx.fillText("Read by Sapiens2 and SAM 2.1", 60, H / 2 + 54);
}

async function runOwn(canvas, F, own, stopRef, onStep) {
  const ctx = canvas.getContext("2d"), d = own.data, L = F.kind === "vertical" ? OWN.vertical : OWN.wide;
  onStep(0);
  cardOwn(ctx, L, d);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.src = own.url;
  await Promise.all([new Promise((ok) => { v.oncanplay = ok; v.onerror = ok; }), wait(900)]);
  if (!v.videoWidth || stopRef.current) return;
  const seek = (x) => new Promise((ok) => { v.onseeked = ok; v.currentTime = x; });
  const cam = { x: d.w / 2, y: d.h / 2, z: 1 };
  const toward = (dt, zGoal, [tx, ty], rate = 2.4, zRate = 1.6) => {
    const a = 1 - Math.exp(-dt * rate);
    cam.x += (tx - cam.x) * a; cam.y += (ty - cam.y) * a; cam.z += (zGoal - cam.z) * (1 - Math.exp(-dt * zRate));
  };
  // the camera follows you; in the replay it aims part of the way up to your racket, so the contact stays in view
  const me = (t, reach = 0) => { const p = peopleAt(d, t)?.[0], c = p && centre(p); if (!c) return [cam.x, cam.y]; const tip = reach && tipOf(p); return tip ? lerp(c, tip, reach) : c; };
  const s = d.smash, end = (v.duration || d.n / d.fps) - .05;
  const z = L.zoom * 1.25;
  // 1 the rally around the smash, at real speed
  await seek(s != null ? Math.max(0, s - 3) : 0);
  { const [x, y] = me(v.currentTime); cam.x = x; cam.y = y; cam.z = z; }
  await v.play().catch(() => {});
  await playUntil(v, s != null ? Math.min(end, s + 1.2) : end, stopRef, (dt) => { toward(dt, z, me(v.currentTime)); frameOwn(ctx, L, d, v, v.currentTime, cam, "live"); });
  if (s != null && !stopRef.current) {
    // 2 the replay: into slow motion, pushing in on you; hold on contact; ease out
    const from = Math.max(0, s - 1.4);
    v.pause(); await seek(from);
    v.playbackRate = .6; await v.play().catch(() => {});
    await playUntil(v, s, stopRef, (dt) => {
      const u = Math.min(1, (v.currentTime - from) / Math.max(.2, s - from));
      v.playbackRate = Math.max(.25, .6 - .35 * u); cam.u = u;
      toward(dt, z * (1 + 1.1 * u), me(v.currentTime, .4 * u), 3.2, 2.2);
      frameOwn(ctx, L, d, v, v.currentTime, cam, "replay");
    });
    if (!stopRef.current) {
      v.pause();
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => { cam.t = (performance.now() - t0) / 1000; toward(1 / 60, z * 2.2, me(s, .4), 3.2, 3); frameOwn(ctx, L, d, v, v.currentTime, cam, "impact"); cam.t < .8 && !stopRef.current ? requestAnimationFrame(tick) : done(); };
        tick();
      });
      cam.t = 0; v.playbackRate = .3; await v.play().catch(() => {});
      await playUntil(v, Math.min(end, s + .8), stopRef, (dt) => {
        const u = Math.min(1, (v.currentTime - s) / .8);
        cam.u = 1 - .6 * u; toward(dt, z * (2.1 - .8 * u), me(v.currentTime), 2, 1.4);
        frameOwn(ctx, L, d, v, v.currentTime, cam, "replay");
      });
      v.pause(); cam.u = 1;
    }
  }
  frameOwn(ctx, L, d, v, v.currentTime, cam, "winner");
  await wait(stopRef.current ? 0 : 1400);
}

const TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

export default function Highlights({ m, p }) {
  const all = useMemo(() => pickHighlights(m, p, 8), [m, p]);
  const [off, setOff] = useState(() => new Set());
  const [fmt, setFmt] = useState("vertical");
  // footage: you, as you will post it, with Serve's view of each moment under it | drawn: no footage at all
  const [src, setSrc] = useState(() => { try { return localStorage.getItem("shuttlecoach.reel.src") || "footage"; } catch { return "footage"; } });
  const pickSrc = (k) => { setSrc(k); setFile(null); try { localStorage.setItem("shuttlecoach.reel.src", k); } catch { /* kept for this visit only */ } };
  const [cap2, setCap2] = useState(null); // { text, by } from Muse Glimmer
  // your own video: { file, url, state: reading | ready | failed, steps, working, error, data }
  const [own, setOwn] = useState(null);
  const [ownSport, setOwnSport] = useState("badminton");
  const pick = async (f) => {
    if (!f) return;
    if (own?.url) URL.revokeObjectURL(own.url);
    const o = { file: f, url: URL.createObjectURL(f), state: "reading", steps: [], working: "Sending your video to your own server" };
    setOwn(o); setFile(null); setCap2(null); setMsg("");
    try {
      const data = await agentReel(f, (e) => setOwn((x) => x && x.url === o.url ? (e.type === "step" ? { ...x, steps: [...x.steps, e] } : { ...x, working: e.step }) : x), ownSport);
      setOwn((x) => x && x.url === o.url ? { ...x, state: "ready", working: null, data } : x);
    } catch (e) { setOwn((x) => x && x.url === o.url ? { ...x, state: "failed", working: null, error: e.message } : x); }
  };
  const mine = own?.state === "ready" ? own : null;
  // the reel: the five best rallies still ticked, in match order
  const list = useMemo(() => all.filter((h) => !off.has(h.r.i)).sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.r.i - b.r.i), [all, off]);
  const canvas = useRef(null), stop = useRef(false);
  const [state, setState] = useState("idle"); // idle | preview | recording
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null); // { url, blob, ext }
  const [msg, setMsg] = useState("");
  const F = FORMATS[fmt];
  const kind = mine ? (mine.data.kind || "smash") : "smash", sportTag = mine ? (mine.data.sport || "badminton").replace(/\s+/g, "") : "badminton";
  const rule = mine ? `My ${kind}, slowed right down: Serve found me, read my pose and cut me out of the video. #${sportTag} #${kind.replace(/\s+/g, "")} #ServeApp`
    : `${m.names[p]}: top ${list.length} from ${m.event}. ${list.map((h) => cap(h.why.join(", "))).join(" · ")}. Analysed on-device with Serve. #badminton #ServeApp`;
  const caption = cap2?.text || rule;
  const [writing, setWriting] = useState(false);
  const write = async () => {
    setWriting(true);
    try { setCap2(await agentCaption(mine ? { player: "Me", own: { what: mine.data.smash != null ? `my ${kind} in ${mine.data.sport || "badminton"}, replayed in slow motion` : `a moment from my ${mine.data.sport || "badminton"} game` } } : { player: m.names[p], event: m.event, picks: list.map((h) => ({ why: h.why, set: h.r.set, score: h.r.score, shots: h.r.shots.length, last: h.r.lastType })) })); }
    catch { setCap2(null); setMsg("Muse Glimmer could not be reached; the caption below is the template."); }
    setWriting(false);
  };

  useEffect(() => { setOff(new Set()); setFile(null); }, [p]);
  useEffect(() => () => { stop.current = true; }, []);
  // asked for from the agent (#/match?tab=reel&auto=1): cut the reel and write the caption straight away
  const auto = useRef(false);
  useEffect(() => { if (!auto.current && list.length && /[?&]auto=1/.test(location.hash)) { auto.current = true; go(true); } }, [list]);
  useEffect(() => {
    if (!canvas.current || state !== "idle" || file) return;
    if (mine) cardOwn(canvas.current.getContext("2d"), F, mine.data);
    else if (list.length) card(canvas.current.getContext("2d"), F, list[0], 0, list.length, m.names);
  }, [list, fmt, state, file, m.names, mine]);

  const go = async (record) => {
    stop.current = false; setFile(null); setMsg(""); setState(record ? "recording" : "preview");
    await new Promise((r) => requestAnimationFrame(r)); // let the canvas mount again if a finished video was showing
    let rec, chunks = [], type;
    if (record) {
      type = TYPES.find((x) => MediaRecorder.isTypeSupported(x));
      rec = new MediaRecorder(canvas.current.captureStream(30), { mimeType: type, videoBitsPerSecond: 4e6 }); // ~4 Mbps: sharp at 720p, small enough to share
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(500);
    }
    if (record && !cap2) write();
    if (mine) await runOwn(canvas.current, F, mine, stop, setStep);
    else await run(canvas.current, F, list, m, stop, setStep, src === "drawn", await loadPeople());
    if (rec) {
      await new Promise((ok) => { rec.onstop = ok; rec.stop(); });
      if (!stop.current) {
        const ext = type.startsWith("video/mp4") ? "mp4" : "webm", blob = new Blob(chunks, { type: type.split(";")[0] });
        setFile({ url: URL.createObjectURL(blob), blob, ext });
      }
    }
    setState("idle");
  };

  const name = mine ? `serve_my_${kind.replace(/\s+/g, "_")}_${fmt === "vertical" ? "9x16" : "16x9"}` : `serve_top${list.length}_${m.names[p].split(" ")[0].toLowerCase()}_${fmt === "vertical" ? "9x16" : "16x9"}`;
  const share = async () => {
    const f = new File([file.blob], `${name}.${file.ext}`, { type: file.blob.type });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: "Serve highlights", text: caption }); setMsg("Shared."); } catch { setMsg("Sharing cancelled."); }
    } else setMsg("This browser cannot share files directly: download the video and post it with the caption.");
  };
  // Instagram and Facebook: the phone's share sheet takes the video straight to the app; on a computer the reel is
  // saved and the caption copied, and the site opens for the post
  const shareTo = async (app) => {
    const f = new File([file.blob], `${name}.${file.ext}`, { type: file.blob.type });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: "Serve highlights", text: caption }); setMsg(`Shared. Pick ${app === "instagram" ? "Instagram" : "Facebook"} in the share sheet if it did not open.`); } catch { setMsg("Sharing cancelled."); }
      return;
    }
    const a = document.createElement("a"); a.href = file.url; a.download = `${name}.${file.ext}`; a.click();
    try { await navigator.clipboard.writeText(caption); } catch { /* the caption is in the box below */ }
    window.open(app === "instagram" ? "https://www.instagram.com/" : "https://www.facebook.com/", "_blank", "noopener");
    setMsg(`The reel is saved and the caption copied: post it from ${app === "instagram" ? "Instagram (Create · Reel)" : "Facebook (Reel)"}.`);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(caption); setMsg("Caption copied."); } catch { setMsg("Could not copy; select the caption text instead."); } };

  return (
    <section className={`hl-grid ${fmt}`}>
      <div className="panel">
        <div className={`own-card ${own ? own.state : ""}`}>
          <div className="own-h"><b>{mine ? `Your ${kind}, from your own video` : "Use your own video"}</b>
            {own && state === "idle" && <button className="link" onClick={() => { URL.revokeObjectURL(own.url); setOwn(null); setFile(null); setCap2(null); }}>{mine ? "Back to the match highlights" : "Cancel"}</button>}</div>
          {!own && <p className="tiny muted">Film your game on your phone, in any ball sport. On your own GPU server, Meta's DETR finds you, Sapiens2 reads your pose and SAM 2.1 cuts you out; then the reel replays your best moment (a smash, a swing, a jump shot, a spike, a kick) in slow motion. The video goes nowhere else.</p>}
          {!own && <div className="own-row">
            <label className="tiny">Sport <select value={ownSport} onChange={(e) => setOwnSport(e.target.value)}>{OWN_SPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="btn primary sm own-pick"><input type="file" accept="video/*" onChange={(e) => pick(e.target.files?.[0])} />Choose a video</label>
          </div>}
          {own && (
            <ol className="own-steps">
              {own.steps.map((x, i) => <li key={i}><Icon name="check" size={16} /><span><b>{x.step}</b><em>{x.detail}</em></span></li>)}
              {own.working && <li className="working"><span className="dots" aria-hidden="true"><i /><i /><i /></span><span><b>{own.working}</b></span></li>}
              {own.state === "failed" && <li className="failed"><span><b>Could not make the reel</b><em>{own.error}</em></span></li>}
            </ol>
          )}
          {mine && <p className="tiny muted">{mine.data.smash != null ? `Your ${kind} at ${mine.data.smash.toFixed(1)} s: ${{ smash: "your fastest overhead swing", shot: "your fastest swing", "jump shot": "the top of your jump", spike: "the top of your jump", kick: "your fastest kick" }[kind] || "your best moment"}.` : "No overhead swing found, so the reel shows the rally."} Preview it or create the video, then post it.</p>}
          {own?.state === "failed" && <label className="btn ghost sm own-pick"><input type="file" accept="video/*" onChange={(e) => pick(e.target.files?.[0])} />Try another video</label>}
        </div>
        {!mine && <>
        <h3 className="panel-h">Auto-picked highlights for {m.names[p]}</h3>
        <p className="tiny muted">Scored from the labels: outright winners, rally length, smash finishes and pressure points (18+). Untick a rally to swap in the next best; the reel uses the top five.</p>
        <ol className="hl-list">
          {all.map((h) => {
            const on = !off.has(h.r.i), idx = list.indexOf(h);
            return (
              <li key={h.r.i} className={`${state !== "idle" && idx === step ? "on" : ""} ${on ? "" : "off"} ${on && idx < 0 ? "spare" : ""}`}>
                <label><input type="checkbox" checked={on} disabled={state !== "idle"} onChange={() => setOff((s) => { const n = new Set(s); n.has(h.r.i) ? n.delete(h.r.i) : n.add(h.r.i); return n; })} />
                  <span><b>{cap(h.why[0])}</b><em>{[...h.why.slice(1), `game ${h.r.set}`].join(" · ")}{on && idx < 0 ? " · reserve" : ""}</em></span></label>
              </li>
            );
          })}
        </ol>
        <div className="seg" role="radiogroup" aria-label="Picture">
          {[["footage", "Footage + how it's made"], ["drawn", "Drawn only, no footage"]].map(([k, l]) => <button key={k} role="radio" aria-checked={src === k} disabled={state !== "idle"} onClick={() => pickSrc(k)}>{l}</button>)}
        </div>
        </>}
        <div className="seg" role="radiogroup" aria-label="Format">
          {Object.entries(FORMATS).map(([k, f]) => <button key={k} role="radio" aria-checked={fmt === k} disabled={state !== "idle"} onClick={() => { setFmt(k); setFile(null); }}>{f.label}</button>)}
        </div>
        <p className="tiny muted">Camera: follows the shuttle between hitter and receiver. The replay goes back to the smash, ramps down to quarter speed and pushes in tight on the smasher, holds on contact, then eases out to where it lands and freezes on the winner. {src === "footage" ? "Your footage is the picture, with the smasher in a spotlight; under it, Serve's view of the same moment: Sapiens2 reads each player's pose and SAM 2.1 cuts them out." : "Nothing of the footage is used: the players are drawn as their SAM 2.1 outlines with their Sapiens2 skeletons, at the camera's angle."} {F.note}.</p>
        <div className="hl-actions hl-sticky">
          {state === "idle" ? <>
            <button className="btn ghost" onClick={() => go(false)}>Preview reel</button>
            <button className="btn primary" onClick={() => go(true)}>Create video</button>
          </> : <button className="btn ghost" onClick={() => { stop.current = true; }}>{state === "recording" ? "Cancel" : "Stop"}</button>}
        </div>
        {state === "recording" && <p className="tiny muted">{mine ? `Recording your ${kind}.` : `Recording highlight ${step + 1} of ${list.length}.`} The video is rendered in this browser.</p>}
        {file && (
          <div className="hl-done">
            <b>Your reel is ready · {(file.blob.size / 1e6).toFixed(1)} MB · .{file.ext}</b>
            <div className="hl-actions">
              <button className="btn primary share-ig" onClick={() => shareTo("instagram")}><Brand name="instagram" size={18} color="currentColor" />Instagram</button>
              <button className="btn ghost share-fb" onClick={() => shareTo("facebook")}><Brand name="facebook" size={18} />Facebook</button>
              <button className="btn ghost" onClick={share}>Share…</button>
              <a className="btn ghost" href={file.url} download={`${name}.${file.ext}`}>Download</a>
              <button className="btn ghost" onClick={copy}>Copy caption</button>
              <button className="btn ghost" onClick={() => setMsg(clubShares().highlights
                ? (postToClub(mine ? { kind: "highlight", coach: "technique", text: `Shared my ${kind}, in slow motion.`, reply: "Good extension at contact. Next, watch where your racket hand finishes." } : { kind: "highlight", coach: "analyst", text: `Shared a highlight reel: top ${list.length} from ${m.event}.`, reply: "Great rallies. Watch how the last shot of each one sets up the winner." }) ? "Shared with the club feed." : "Could not save to the club feed.")
                : "Highlights are not shared with your club yet. Turn them on under “What the club sees” on the Club page.")}>Share with the club</button>
              <a className="chip" href={shareLinks(caption).whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <a className="chip" href={shareLinks(caption).threads} target="_blank" rel="noopener noreferrer">Threads</a>
            </div>
            <p className="tiny muted hl-cap-by">{writing ? "Muse Glimmer is writing the caption…" : cap2?.by === "model" ? `Caption written by Muse Glimmer · every number checked${mine ? "" : " against the rallies"}` : "Caption from the template"}{!writing && <> · <button className="link" onClick={write}>Write another</button></>}</p>
            <textarea readOnly value={caption} rows={4} aria-label="Suggested caption" />
            {msg && <p className="tiny muted">{msg}</p>}
            <p className="tiny muted">Sharing only happens when you pick an app; until then the video exists only on this device.</p>
          </div>
        )}
      </div>
      <div className="hl-view">
        {file && <video src={file.url} controls playsInline className="hl-canvas" />}
        <canvas ref={canvas} width={F.W} height={F.H} className="hl-canvas" hidden={!!file} aria-label="Highlight reel preview" />
        <p className="tiny muted hl-how">{mine ? <>On top, you, as you will post it. Under it, how Serve sees you: Meta's <b>DETR</b> finds you, <b>Sapiens2</b> reads your pose and <b>SAM 2.1</b> cuts you out; the light line is your racket hand.</> : src === "footage"
          ? <>On top, your rally as you will post it. Under it, how Serve sees it: YOLO finds the players, <b>Sapiens2</b> reads their pose and <b>SAM 2.1</b> cuts them out.</>
          : <>Drawn from the players' <b>Sapiens2</b> pose and <b>SAM 2.1</b> outlines: not a frame of footage is in the reel.</>}</p>
      </div>
    </section>
  );
}
