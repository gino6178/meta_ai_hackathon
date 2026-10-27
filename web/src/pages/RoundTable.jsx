import { useEffect, useMemo, useRef, useState } from "react";
import { COACHES } from "../coaches/personas.js";
import Avatar from "../coaches/Avatar.jsx";
import { tactics, shotQuality, zoneOf } from "../coaches/analysis.js";
import { REGIONS, findings, score } from "../components/BodyMap.jsx";
import { loadMatches, pointStats, footwork, fatigue, patterns } from "../match/analytics.js";
import { memory, retrieve } from "../memory.js";
import RallyClip from "../match/RallyClip.jsx";
import { agentNotify } from "../agent.js";
import { prefersReducedMotion, scrollBehavior } from "../hooks.js";
import Icon from "../components/Icon.jsx";
import { shareLinks, postToClub } from "../club/share.js";

// Round table: the four coach agents and the head coach discuss the match, resolve conflicts against the player's
// memory, and agree a training plan with a weekly schedule. Every number comes from the analyses; the dialogue is
// templated in this prototype (Muse Glimmer or Muse Spark drives it next).
const HEAD = { id: "head", name: "Head Coach", role: "Chair", kicker: "Chair", color: "#C3CACD",
  look: { skin: "#E9BE9A", hair: "#C9CED8", hairStyle: "swept", shirt: "#1F4A3D", prop: "glasses" } };
const C = Object.fromEntries([...COACHES, HEAD].map((c) => [c.id, c]));
const f2 = (v) => v.toFixed(2);

// Evidence: a rally reference with game, score, shot number and the time in its video clip.
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const ref = (r, k = r.shots.length - 1) => ({ r, t: r.shots[k]?.t ?? 0, label: `G${r.set} ${r.score[0]}–${r.score[1]} · shot ${k + 1} · ${clock(r.shots[k]?.t ?? 0)}` });
// Verifier: every figure an agent says is recomputed by a second, independent pass over the raw shot labels.
const verify = (checks) => checks.map(([label, said, again]) => ({ label, said, again, ok: Math.abs(said - again) <= Math.max(0.011, Math.abs(said) * 0.005) }));
const flip = (xy) => (xy[1] < 6.7 ? [6.1 - xy[0], 13.4 - xy[1]] : xy);

function buildMeeting(data, m) {
  const t = tactics(data.outcomes, "A");
  const q = shotQuality(data.rally).filter((x) => x.s.hitter === "near" && x.score != null).sort((a, b) => a.score - b.score);
  const sc = score(findings(data.insights, data.rally));
  const muscles = Object.keys(REGIONS).sort((a, b) => sc[b].v - sc[a].v).slice(0, 3);
  const ps = pointStats(m, "A"), fw = footwork(m, "A"), fa = fatigue(m, "A"), pt = patterns(m, "A");
  const net = ps.errorReasons.find(([k]) => k === "net")?.[1] ?? 0;
  const errAll = ps.errorReasons.reduce((a, [, n]) => a + n, 0);
  const longNet = m.rallies.filter((r) => r.winner !== "A" && r.reason === "net" && r.lastBy === "A" && r.shots.length >= 10).length;
  const hard = fw.byType[0];
  const mem = { joint: retrieve("knee ankle injury sore jump", 1)[0], routine: retrieve("trains week minutes gym routine", 1)[0], goal: retrieve("goal season", 1)[0] };
  const knee = mem.joint && /knee|ankle/i.test(mem.joint.m.text);
  const declining = fa.rec.late > fa.rec.early * 1.05 || fa.err.late > fa.err.early * 1.15;
  const opp = data.names.B;

  // second pass over the raw labels, for the verifier and the evidence chips
  const beatenR = m.rallies.filter((r) => r.winner === "B" && r.reason === "winner" && r.lastBy === "B");
  const weakR = beatenR.filter((r) => { const l = r.shots[r.shots.length - 1].land; return l && zoneOf(flip(l), "near") === t.weak[0][0]; });
  const netR = m.rallies.filter((r) => r.winner === "B" && r.reason === "net");
  const errR = m.rallies.filter((r) => r.winner === "B" && r.reason !== "winner");
  const hardReads = [];
  m.rallies.forEach((r) => r.shots.forEach((x, i) => {
    const y = r.shots[i + 1];
    if (x.p === "B" && x.type === hard.t && x.opp && y && y.p === "A" && y.pos && y.t - x.t > 0.15) hardReads.push({ r, i: i + 1, v: Math.hypot(y.pos[0] - x.opp[0], y.pos[1] - x.opp[1]) / (y.t - x.t) });
  }));
  const hardV = hardReads.reduce((a, x) => a + x.v, 0) / Math.max(1, hardReads.length);
  const hardStretch = Math.round((100 * hardReads.filter((x) => x.v > 3.5).length) / Math.max(1, hardReads.length));
  const longNetR = netR.filter((r) => r.shots.length >= 10);

  const memEv = (x) => (x ? [{ mem: x.m.text, label: `Memory · ${x.m.kind}` }] : []);
  const talk = [
    ["head", `Round table on ${data.event}. One priority each, backed by the numbers, then we agree the week.${mem.goal ? ` The player's stated goal: “${mem.goal.m.text}”` : ""}`, { ev: memEv(mem.goal) }],
    ["tactics", `My priority is defence in the ${t.weak[0][0]}: ${t.weak[0][1]} of the ${t.conceded} winners ${opp} hit landed there. I want two defence blocks this week, feeding smashes and rushes into that corner.`,
      { ev: weakR.map((r) => ref(r)), checks: verify([[`winners into the ${t.weak[0][0]}`, t.weak[0][1], weakR.length], ["winners conceded", t.conceded, beatenR.length]]) }],
    ["technique", `Mine is margin over the net: ${net} of the ${errAll} own errors went into the net. In the replayed rally the weakest stroke was the ${q[0].s.type.toLowerCase()} (grade ${q[0].grade}: ${q[0].note}).`,
      { ev: netR.map((r) => ref(r)), checks: verify([["net errors", net, netR.length], ["own errors", errAll, errR.length]]) }],
    ["fitness", `Legs and first step: ${muscles.map((r) => REGIONS[r].name.toLowerCase()).join(", ")} carry the most load.${knee ? ` But memory says “${mem.joint.m.text}”, so no jump landings this week.` : ""}`, { ev: memEv(mem.joint) }],
    ["analyst", `Footwork data backs Lin: against the ${hard.t.toLowerCase()} ${data.names.A} needs ${f2(hard.v)} m/s and is stretched ${hard.stretched}% of the time. ${declining ? "Recovery gets worse late in the match, so fitness matters." : "Recovery does not get worse late in the match, so this is about reading, not fatigue."}`,
      { ev: hardReads.filter((x) => x.v > 3.5).map((x) => ref(x.r, x.i)), checks: verify([[`m/s against the ${hard.t.toLowerCase()}`, +f2(hard.v), +f2(hardV)], ["% stretched", hard.stretched, hardStretch]]) }],
    ...(knee ? [["fitness", `Lin, smash-defence blocks usually mean split-step jumps. With that knee I'd cap them at 70% pace from a lower base, no jumping.`, { ev: memEv(mem.joint), conflict: ["fitness", "tactics"] }],
      ["tactics", `Agreed. Half-court defence, fed at 70%, low base, and we judge it by recovery to base rather than intensity.`, { resolve: true }]] : []),
    ["technique", `Data, are the net errors a late-rally problem?`, {}],
    ["analyst", `Partly: ${longNet} of the ${net} net errors came in rallies of 10 or more shots. Worst three-shot pattern: ${pt.worst[0]?.k} (${pt.worst[0]?.w}% won).`,
      { ev: longNetR.map((r) => ref(r)), checks: verify([["net errors in 10+ shot rallies", longNet, longNetR.length], ["net errors", net, netR.length]]) }],
    ["head", `Ruling. Health limits from memory are hard constraints; inside them I rank every request by the points it cost us in this match. ${knee ? "Lin's blocks stay at 70% with no jumps; Ren's plyometrics wait until the knee settles." : "No request breaks a health limit, so all four stand."} Four goals, one owner each. Building the week now.`, { resolve: true, ruling: true }],
  ];

  // the head coach's arbitration: memory constraints first, then points at stake in this match
  const lostTo = (fn) => m.rallies.filter((r) => r.winner !== "A" && fn(r)).length;
  const ruling = [
    { owner: "tactics", ask: `Smash-defence blocks into the ${t.weak[0][0]}`, stake: t.weak[0][1], unit: "winners conceded there",
      check: knee ? "Clashes with memory: knee sore, no split-step jumps" : "No conflict", verdict: knee ? "Kept, modified: 70% pace, low base" : "Kept", tone: knee ? "mod" : "ok" },
    { owner: "technique", ask: "Net-margin work on net shots and lifts", stake: net, unit: "own net errors", check: "No conflict", verdict: "Kept", tone: "ok" },
    { owner: "analyst", ask: `Read-and-react against the ${hard.t.toLowerCase()}`, stake: lostTo((r) => r.lastBy === "B" && r.lastType === hard.t), unit: `points ended by a ${hard.t.toLowerCase()}`,
      check: "No conflict", verdict: "Kept", tone: "ok" },
    { owner: "fitness", ask: knee ? "Plyometric jump training" : `Leg power: ${REGIONS[muscles[0]].name.toLowerCase()}`, stake: lostTo((r) => r.shots.length >= 15), unit: "points lost in 15+ shot rallies",
      check: knee ? "Blocked by memory: knee sore" : "No conflict", verdict: knee ? "Deferred: isometric strength instead" : "Kept", tone: knee ? "off" : "ok" },
  ].sort((a, b) => b.stake - a.stake);

  const goals = [
    { owner: "tactics", text: `Concede no more than ${Math.max(2, Math.round(t.weak[0][1] / 2))} winners in the ${t.weak[0][0]}`, now: `${t.weak[0][1]} now` },
    { owner: "technique", text: `Cut net errors to ${Math.max(4, Math.round(net * 0.6))} or fewer`, now: `${net} now` },
    { owner: "analyst", text: `Shots needing more than 3.5 m/s under ${Math.max(5, fw.stretched - 4)}%`, now: `${fw.stretched}% now` },
    { owner: "fitness", text: knee ? "Train legs without jump landings until the knee settles" : `Strengthen ${REGIONS[muscles[0]].name.toLowerCase()} twice this week`, now: knee ? "knee sore" : "baseline" },
  ];

  const days = [
    { d: "Mon", kind: "court", min: 90, blocks: [["tactics", 30, `Half-court defence into the ${t.weak[0][0]}${knee ? ", 70% pace, low base" : ""}`], ["technique", 25, "Net kill and net lift with a 30 cm margin target"], ["analyst", 20, `Read-and-react: coach feeds ${hard.t.toLowerCase()}s, first step on contact`], ["fitness", 15, "Cool-down, calf and quad mobility"]] },
    { d: "Tue", kind: "gym", min: 45, blocks: [["fitness", 45, knee ? "Tempo split squats, isometric calf holds, hip thrusts, wrist work" : "Split squat jumps, calf raises, hip thrusts, wrist work"]] },
    { d: "Wed", kind: "rest", min: 20, blocks: [["fitness", 20, "Mobility and easy bike"]] },
    { d: "Thu", kind: "court", min: 90, blocks: [["analyst", 25, `Pattern drill: break ${pt.worst[0]?.k ?? "the losing pattern"}`], ["tactics", 30, "Lift deep to the backhand corner, recover to base"], ["technique", 25, "Smash and clear from a high contact"], ["fitness", 10, "Cool-down"]] },
    { d: "Fri", kind: "rest", min: 0, blocks: [] },
    { d: "Sat", kind: "match", min: 60, blocks: [["analyst", 60, "Practice match, recorded: ShuttleCoach re-measures the four goals"]] },
    { d: "Sun", kind: "rest", min: 20, blocks: [["fitness", 20, "Recovery walk and stretching"]] },
  ];
  return { talk, goals, days, mem, ruling };
}

const SEATS = ["tactics", "technique", "fitness", "analyst", "head"];
const seatXY = (id) => { const a = -Math.PI / 2 + (SEATS.indexOf(id) * 2 * Math.PI) / SEATS.length; return [50 + 41 * Math.cos(a), 50 + 41 * Math.sin(a)]; };

function Evidence({ meta, onPeek }) {
  const [all, setAll] = useState(false);
  if (!meta?.ev?.length && !meta?.checks?.length) return null;
  const ok = meta.checks?.every((c) => c.ok);
  const ev = meta.ev ?? [], shown = all ? ev : ev.slice(0, 4);
  return (
    <div className="rt-ev">
      {meta.checks?.length > 0 && (
        <span className={`rt-verify ${ok ? "ok" : "bad"}`} title={meta.checks.map((c) => `${c.label}: said ${c.said}, recomputed ${c.again}`).join("\n")}>
          {ok ? "✓" : "⚠"} {meta.checks.length} figure{meta.checks.length > 1 ? "s" : ""} re-computed{ok ? "" : ": mismatch"}
        </span>
      )}
      {shown.map((e, k) => e.mem
        ? <span key={k} className="rt-chip mem" title={e.mem}>{e.label}</span>
        : <button key={k} className="rt-chip" onClick={() => onPeek(e)} title="Play this moment">{"▶"} {e.label}</button>)}
      {ev.length > 4 && <button className="rt-chip more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `+${ev.length - 4} more`}</button>}
    </div>
  );
}

function Peek({ e, names, onClose }) {
  const clip = useRef(null), box = useRef(null);
  useEffect(() => {
    const v = clip.current?.video; if (!v) return;
    const go = () => { v.currentTime = Math.max(0, e.t - 2); v.play().catch(() => {}); };
    v.readyState >= 1 ? go() : v.addEventListener("loadedmetadata", go, { once: true });
  }, [e]);
  // a modal: focus moves in, Tab stays inside, Escape closes, focus returns to the chip that opened it
  useEffect(() => {
    const back = document.activeElement;
    box.current?.querySelector("button")?.focus();
    const key = (k) => {
      if (k.key === "Escape") onClose();
      if (k.key !== "Tab") return;
      const f = [...box.current.querySelectorAll("button, video, [tabindex]:not([tabindex='-1'])")];
      if (!f.length) return;
      if (k.shiftKey && document.activeElement === f[0]) { k.preventDefault(); f[f.length - 1].focus(); }
      else if (!k.shiftKey && document.activeElement === f[f.length - 1]) { k.preventDefault(); f[0].focus(); }
    };
    addEventListener("keydown", key);
    return () => { removeEventListener("keydown", key); back?.focus?.(); };
  }, []);
  return (
    <div className="rt-peek" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={`Evidence clip, ${e.label}`} onClick={(x) => x.stopPropagation()}>
        <header><b>Evidence · {e.label}</b><button className="btn ghost sm" onClick={onClose}>Close</button></header>
        <RallyClip ref={clip} rally={e.r} names={names} autoPlay minimap />
      </div>
    </div>
  );
}

export default function RoundTable({ data }) {
  const [m, setM] = useState(null);
  const [peek, setPeek] = useState(null);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion()); // with reduced motion the transcript appears at once
  const [saved, setSaved] = useState(false);
  const [sent, setSent] = useState("");
  const [posted, setPosted] = useState(false);
  const box = useRef(null);
  useEffect(() => { loadMatches().then((d) => setM(d.matches[0])); }, []);
  const meet = useMemo(() => (data && m ? buildMeeting(data, m) : null), [data, m]);
  useEffect(() => { if (meet && !playing && !shown && prefersReducedMotion()) setShown(meet.talk.length); }, [meet]);
  useEffect(() => {
    if (!meet || !playing || shown >= meet.talk.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), shown ? 1900 : 700);
    return () => clearTimeout(id);
  }, [meet, shown, playing]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: scrollBehavior() }); }, [shown]);
  if (!meet) return <div className="page"><p className="muted">Gathering the coaches…</p></div>;
  const speaking = meet.talk[Math.max(0, shown - 1)]?.[0];
  const done = shown >= meet.talk.length;
  const seats = SEATS;
  // conflict state: the latest conflict raised and whether a later message resolved it
  const said = meet.talk.slice(0, shown);
  const ci = said.map((x) => x[2]?.conflict).lastIndexOf(said.map((x) => x[2]?.conflict).filter(Boolean).pop());
  const conflict = ci >= 0 ? said[ci][2].conflict : null;
  const resolved = conflict && said.slice(ci + 1).some((x) => x[2]?.resolve);
  const state = done ? ["Plan agreed", "four goals, seven days", "good"]
    : conflict && !resolved ? ["Conflict", "knee vs smash defence", "bad"]
    : conflict ? ["Resolved", "health comes first", "good"] : ["Round table", playing ? "in session" : "paused", ""];
  const restart = () => { setShown(0); setSaved(false); setPlaying(true); };

  return (
    <div className="page roundtable">
      <header className="report-head noprint">
        <div>
          <span className="tag">Round table · the whole coaching staff</span>
          <h1 className="h1">Agree the plan together</h1>
          <p className="muted">The four coaches and the head coach debate the match, check it against your memory, and agree a training plan and a weekly schedule.</p>
        </div>
        <div className="cta-row">
          <button className="btn primary" disabled={!done} onClick={() => window.print()}>Save plan as PDF</button>
        </div>
      </header>

      <div className="rt-grid noprint">
        <div className="rt-table">
          {conflict && !done && (() => {
            const [a, b] = conflict.map(seatXY);
            return (
              <svg className={`rt-conflict ${resolved ? "resolved" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} vectorEffect="non-scaling-stroke" />
              </svg>
            );
          })()}
          <svg viewBox="0 0 400 400" className="rt-svg" aria-hidden="true">
            <ellipse cx="200" cy="200" rx="120" ry="120" fill="#0A1014" stroke="#2A343A" strokeWidth="2" />
            <ellipse cx="200" cy="200" rx="84" ry="84" fill="none" stroke="#1F6B54" strokeWidth="2" strokeDasharray="4 6" />
            <text x="200" y="196" textAnchor="middle" className={`rt-center ${state[2]}`}>{state[0]}</text>
            <text x="200" y="220" textAnchor="middle" className="rt-center sub">{state[1]}</text>
          </svg>
          {seats.map((id) => {
            const [x, y] = seatXY(id);
            return (
              <div key={id} className={`rt-seat ${speaking === id && !done ? "speaking" : ""}`} style={{ left: `${x}%`, top: `${y}%`, "--cc": C[id].color }}>
                <Avatar coach={C[id]} size={72} talking={speaking === id && !done} />
                <b>{C[id].name}</b><span>{C[id].kicker}</span>
              </div>
            );
          })}
        </div>
        <div className="rt-side">
          <div className="rt-strip" aria-hidden="true">
            {seats.map((id) => (
              <div key={id} className={speaking === id && !done ? "speaking" : ""} style={{ "--cc": C[id].color }}>
                <Avatar coach={C[id]} size={48} /><span>{C[id].name.replace("Coach ", "")}</span>
              </div>
            ))}
          </div>
          <div className="rt-ctl">
            {!done && <button className="btn ghost sm" onClick={() => setPlaying(!playing)}><Icon name={playing ? "pause" : "play"} size={16} />{playing ? "Pause" : shown ? "Resume" : "Play meeting"}</button>}
            {!done && <button className="btn ghost sm" onClick={() => setShown(meet.talk.length)}>Skip to the plan</button>}
            {done && <button className="btn ghost sm" onClick={restart}>Replay meeting</button>}
            <span className={`tiny rt-status ${state[2]}`} role="status">{state[0]}: {state[1]} · {Math.min(shown, meet.talk.length)} of {meet.talk.length}</span>
          </div>
          <div className="rt-chat" ref={box} aria-live="polite" aria-relevant="additions">
            {meet.talk.slice(0, shown).map(([id, text, meta], k) => (
              <div key={k} className={`rt-msg ${meta?.conflict ? "conflict" : ""} ${meta?.resolve ? "resolve" : ""}`} style={{ "--cc": C[id].color }}>
                <Avatar coach={C[id]} size={34} />
                <div>
                  <b>{C[id].name}{meta?.conflict && <em className="rt-tag bad">{"⚡"} challenges {C[meta.conflict[1]].name}</em>}{meta?.resolve && <em className="rt-tag ok">{"✓"} {meta.ruling ? "ruling" : "resolved"}</em>}</b>
                  <p>{text}</p>
                  <Evidence meta={meta} onPeek={setPeek} />
                </div>
              </div>
            ))}
            {!done && playing && <div className="rt-msg typing" aria-hidden="true" style={{ "--cc": C[meet.talk[shown][0]].color }}><Avatar coach={C[meet.talk[shown][0]]} size={34} /><p className="dots"><i /><i /><i /></p></div>}
          </div>
        </div>
      </div>

      {peek && <Peek e={peek} names={m.names} onClose={() => setPeek(null)} />}
      {done && (
        <section className="panel ruling">
          <h2 className="panel-h">How the head coach resolved the conflicts</h2>
          <p><b>Health limits from your memory come first</b>; no drill may break them. Inside them, requests are <b>ranked by the points that weakness cost</b> in this match, and every kept request becomes one goal with one owner that the next recorded match re-measures.</p>
          <div className="tscroll">
            <table className="ptable stack">
              <thead><tr><th>Request</th><th>Coach</th><th className="r">Points at stake</th><th>Memory check</th><th>Ruling</th></tr></thead>
              <tbody>
                {meet.ruling.map((r) => (
                  <tr key={r.owner}>
                    <td>{r.ask}</td>
                    <td data-label="Coach" style={{ color: C[r.owner].color }}>{C[r.owner].name}</td>
                    <td className="r stake" data-label="At stake"><b>{r.stake}</b> <span className="tiny muted">{r.unit}</span></td>
                    <td data-label="Memory" className={r.check === "No conflict" ? "muted" : "bad"}>{r.check}</td>
                    <td><span className={`verdict ${r.tone}`}>{r.verdict}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {done && (
        <article className="sheet plan-sheet">
          <header>
            <span className="tag">Training plan · agreed by the round table</span>
            <h2 className="plan-h">Next 7 days · {data.names.A}</h2>
            {meet.mem.joint && <p className="muted">Adapted to memory: “{meet.mem.joint.m.text}”{meet.mem.routine ? ` · “${meet.mem.routine.m.text}”` : ""}</p>}
          </header>
          <div className="goal-grid">
            {meet.goals.map((g) => (
              <div key={g.owner} style={{ "--cc": C[g.owner].color }}>
                <Avatar coach={C[g.owner]} size={36} />
                <div><b>{g.text}</b><span>{C[g.owner].name} · {g.now}</span></div>
              </div>
            ))}
          </div>
          <div className="week" style={{ gridTemplateColumns: meet.days.map((d) => (d.blocks.length ? "minmax(0, 1.3fr)" : "minmax(0, .55fr)")).join(" ") }}>
            {meet.days.map((d) => (
              <div key={d.d} className={`day ${d.kind}`}>
                <header><b>{d.d}</b><span>{d.kind === "rest" && !d.min ? "Rest" : `${d.kind[0].toUpperCase() + d.kind.slice(1)} · ${d.min} min`}</span></header>
                {d.blocks.map(([who, min, text], k) => (
                  <div key={k} className="blk" style={{ "--cc": C[who].color }}>
                    <span className="mono">{min}′</span><p>{text}</p><em>{C[who].name}</em>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="plan-foot noprint">
            <button className="btn ghost" disabled={saved} onClick={() => { memory.add(`Round-table plan (${data.event}): ${meet.goals.map((g) => g.text).join("; ")}.`, "goal", "round table"); setSaved(true); }}>
              {saved ? "Saved to memory" : "Save goals to memory"}
            </button>
            <button className="btn primary" disabled={!!sent && !sent.startsWith("!")} onClick={() => agentNotify({ event: data.event, goals: meet.goals.map((g) => g.text), days: meet.days })
              .then((r) => setSent(r.sent.length ? `Sent to ${r.sent.length} player(s) on Messenger` : "!No player linked yet: message the club's Page on Messenger first"))
              .catch((e) => setSent("!Agent gateway not reachable: " + e.message))}>{sent && !sent.startsWith("!") ? sent : "Send to Messenger"}</button>
            {sent.startsWith("!") && <span className="tiny bad" role="alert">{sent.slice(1)}</span>}
            <button className="btn ghost" disabled={posted} onClick={() => setPosted(postToClub({ kind: "plan", coach: "fitness", text: `Shared this week's round-table goals: ${meet.goals.map((g) => g.text.toLowerCase()).join("; ")}.`, reply: "Good luck this week. The club will see your goals, not your health details." }))}>
              {posted ? "Shared with the club" : "Share with the club"}</button>
            <a className="chip" href={shareLinks(`My week from the ShuttleCoach round table: ${meet.goals.map((g) => g.text).join("; ")}.`).whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className="chip" href={shareLinks(`My week from the ShuttleCoach round table: ${meet.goals.map((g) => g.text).join("; ")}.`).threads} target="_blank" rel="noopener noreferrer">Threads</a>
            <span className="tiny muted">Saved goals are retrieved by every coach next session, and the next recorded match is scored against them. Players get the week in Messenger, then a nudge before every session.</span>
          </div>
        </article>
      )}
    </div>
  );
}
