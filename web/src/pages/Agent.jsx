import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon.jsx";
import Mark from "../components/Mark.jsx";
import TaskCard from "../components/TaskCard.jsx";
import { tactics } from "../coaches/analysis.js";
import { habits } from "../club/habits.js";
import { loadMatches } from "../match/analytics.js";
import { answer } from "../voice/intents.js";
import { memory } from "../memory.js";
import { useTasks, startPlay, startQuests, startNight, startAsk, quickAnswer, intentOf, playerOf, dismiss } from "../tasks.js";
import { readGame, isoWeek } from "../club/game.js";
import { useReducedMotion } from "../hooks.js";
import { go } from "../App.jsx";
import "./agent.css";

// The agent home, the way Muse is laid out: say what you want, and every job the agent takes on shows up as a card
// with its steps, running in the background and checking back when it needs you. Above it, stories from the club.
const IDEAS = [
  "Challenge Kenji to a singles match this week",
  "Doubles on Thursday evening with Hana",
  "Spar with someone who plays like my next opponent",
  "Get this week's quests",
  "Make my highlight reel for Instagram",
  "Plan my week on Autopilot",
  "Find my best match this week",
  "Find me a random match this weekend",
  "My right knee is sore after jumping",
  "Basketball courts near me tonight",
];
const initials = (n) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const first = (n) => n.split(" ")[0];
const hello = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

function Story({ items, at, onClose, onMove }) {
  const still = useReducedMotion(), it = items[at], box = useRef(null);
  useEffect(() => {
    box.current?.focus();
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onMove(1); if (e.key === "ArrowLeft") onMove(-1); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [at]);
  useEffect(() => { if (still) return; const id = setTimeout(() => onMove(1), 6000); return () => clearTimeout(id); }, [at, still]);
  if (!it) return null;
  return (
    <div className="story-scrim" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="story dark-scope" role="dialog" aria-modal="true" aria-label={`${it.name}'s story`} onClick={(e) => e.stopPropagation()} style={{ "--cc": it.color }}>
        <div className="story-bars" aria-hidden="true">{items.map((x, k) => <i key={x.id} className={k < at ? "done" : k === at ? (still ? "done" : "now") : ""} />)}</div>
        <header>
          <span className="mav story-mav" aria-hidden="true">{initials(it.name)}</span>
          <span><b>{it.name}</b><span className="tiny">{it.sub}</span></span>
          <button className="icon-btn sm" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
        </header>
        <p className="story-text">{it.text}</p>
        <div className="story-actions">{it.actions}</div>
        <button className="story-nav prev" aria-label="Previous story" onClick={() => onMove(-1)} />
        <button className="story-nav next" aria-label="Next story" onClick={() => onMove(1)} />
      </div>
    </div>
  );
}

export default function Agent({ data }) {
  const tasks = useTasks();
  const [text, setText] = useState("");
  const [m, setM] = useState(null);
  const [club, setClub] = useState(null);
  const [story, setStory] = useState(null);
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.getItem("shuttlecoach.stories.v1")) || []; } catch { return []; } });
  const field = useRef(null);
  useEffect(() => { loadMatches().then((d) => setM(d.matches[0])); fetch("/data/club.json").then((r) => r.json()).then(setClub).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem("shuttlecoach.stories.v1", JSON.stringify(seen)); } catch { /* ignore */ } }, [seen]);
  const you = useMemo(() => (data ? playerOf(data) : null), [data]);

  function ask(said) {
    const q = (said ?? text).trim();
    if (!q || !you) return;
    setText("");
    const kind = intentOf(q);
    if (kind === "play") return go(`play?task=${startPlay(q, you)}`);
    if (kind === "quests") return startQuests(memory.all().map((x) => x.text));
    if (kind === "highlight") return go("match?tab=reel&auto=1");
    if (kind === "autopilot") return go("autopilot?run=1");
    if (kind === "body") return go(`body?say=${encodeURIComponent(q)}`);
    if (kind === "courts") return go(`courts?sport=${(q.match(/basketball|badminton|tennis|soccer|football|volleyball|pickleball|table tennis/i) || ["basketball"])[0].toLowerCase().replace("football", "soccer")}`);
    if (kind === "best") return go(`club?tab=challenges&best=1${/doubles|partner/i.test(q) ? "&fmt=doubles" : ""}`);
    if (kind === "random") return go(`club?tab=challenges&spin=1${/doubles/i.test(q) ? "&fmt=doubles" : ""}${/weekend/i.test(q) ? "&when=weekend" : /weekday|evening/i.test(q) ? "&when=weekday" : ""}`);
    if (kind === "ranks") return go("club?tab=ranks");
    if (kind === "night") {
      const t = tactics(data.outcomes, "A"), net = t.errReasons.find(([k]) => k === "net")?.[1] ?? 0;
      return startNight({ name: "You", weak: you.weak, net: [net, net], limit: you.limit, sessions: 0 });
    }
    // a question: the match answers straight away when it can, and your agent answers on Muse Glimmer when it cannot
    const a = m && answer(q, { m, data });
    if (a?.go && !a.go.startsWith("play") && !a.go.startsWith("live")) return quickAnswer(q, a);
    startAsk(q);
  }

  const needs = tasks.filter((t) => t.state === "needs"), running = tasks.filter((t) => t.state === "running"), done = tasks.filter((t) => ["done", "failed"].includes(t.state)).slice(0, 6);
  const game = tasks.find((t) => t.kind === "play" && t.booking && t.booking.state !== "cancelled");
  const g = readGame(), wk = isoWeek(), q = g.quests?.week === wk ? g.quests.data : null;
  const logged = q ? q.quests.filter((x) => (g.progress?.[`${wk}:${x.id}`] || 0) >= x.target).length : 0;
  // challenges members sent you, not answered yet (Club, Challenges tab)
  const asked = (club?.incoming || []).filter((c) => !g.arena?.answered?.[c.id]).map((c) => ({ ...c, m: club.members.find((x) => x.id === c.from) })).filter((c) => c.m);

  // stories: members who posted in the club
  const stories = !club ? [] : [
    ...club.feed.slice(0, 4).map((f) => { const mm = club.members.find((x) => x.id === f.who); return mm && { id: f.id, name: mm.name, sub: `${f.ago} · ${club.name}`, color: "var(--agent)", text: f.text,
      actions: <><button className="btn primary sm" onClick={() => { setStory(null); go(`play?task=${startPlay(`Doubles this week with ${first(mm.name)}`, you)}`); }}>Play with {first(mm.name)}</button><a className="btn ghost sm" href="#/club">See the club</a></> }; }).filter(Boolean),
  ];
  const open = (k) => { setStory(k); setSeen((s) => [...new Set([...s, stories[k].id])]); };
  const move = (d) => { const k = story + d; if (k < 0 || k >= stories.length) return setStory(null); open(k); };

  return (
    <div className="page agent">
      <div className="agent-grid">
        <div className="agent-main">
          {stories.length > 0 && (
            <ul className="stories" aria-label="Stories">
              {stories.map((s, k) => (
                <li key={s.id}>
                  <button className={`story-ring ${seen.includes(s.id) ? "seen" : ""}`} style={{ "--cc": s.color }} onClick={() => open(k)} aria-label={`${s.name}'s story`}>
                    <span className="mav" style={{ width: 58, height: 58, fontSize: 16 }} aria-hidden="true">{initials(s.name)}</span>
                  </button>
                  <span>{first(s.name)}</span>
                </li>
              ))}
            </ul>
          )}

          <section className="composer" aria-labelledby="ask-h">
            <div className="composer-head"><span className="agent-face" aria-hidden="true"><Mark size={22} /></span>
              <div><h1 id="ask-h" className="h1">{hello()}. What do you want to do?</h1>
                <p className="muted">Line up your week, book a game, tell it what hurts, find a court or ask about your game. Your agent hands each job to the right agent and shows every step.</p></div></div>
            <form className="composer-box" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <label htmlFor="agent-q" className="sr-only">Tell your agent</label>
              <textarea id="agent-q" ref={field} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Challenge Kenji to a singles match this week"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
              <button className="send" aria-label="Send to your agent" disabled={!text.trim() || !you}><Icon name="up" size={20} /></button>
            </form>
            <div className="ideas" aria-label="Ideas">{IDEAS.map((x) => <button key={x} type="button" className="chip" onClick={() => ask(x)}>{x}</button>)}</div>
          </section>

          {club && (() => {
            const h = habits(club.you.history || []).slice(0, 2), goal = { perWeek: 2, ...(g.autopilot?.goal || {}) };
            const ap = tasks.find((x) => x.kind === "autopilot");
            return (
              <section className="ap-card" aria-label="Autopilot">
                <span className="agent-dot" aria-hidden="true"><Mark size={16} /></span>
                <div><b>Autopilot</b><span className="tiny muted">{goal.perWeek} game{goal.perWeek > 1 ? "s" : ""} a week · you usually play {h.map((x) => `${x.day} ${x.start}`).join(" and ")}{ap?.state === "done" && ap.summary ? ` · last run: ${ap.summary}` : ""}</span></div>
                <a className={`btn sm ${ap?.state === "running" ? "ghost" : "primary"}`} href={ap?.state === "running" ? "#/autopilot" : "#/autopilot?run=1"}>{ap?.state === "running" ? "Watch it work" : "Run my week"}</a>
              </section>
            );
          })()}

          {(needs.length > 0 || asked.length > 0) && (
            <section className="task-sec" aria-labelledby="needs-h">
              <h2 id="needs-h" className="sec-label">Needs you</h2>
              {needs.map((t) => <TaskCard key={t.id} t={t} />)}
              {asked.length > 0 && (
                <article className="task needs" aria-label="Challenges for you">
                  <span className="task-av" aria-hidden="true"><Icon name="club" size={22} /></span>
                  <div className="task-body">
                    <header><b>{club.name}</b><span className="task-state needs">Needs you</span></header>
                    <p className="task-said plain">{asked.map((c) => first(c.m.name)).join(" and ")} challenged you</p>
                    <p className="task-sum">{first(asked[0].m.name)}: “{asked[0].note}”</p>
                    <a className="btn sm primary" href="#/club?tab=challenges">Answer<Icon name="next" size={16} /></a>
                  </div>
                </article>
              )}
            </section>
          )}
          {running.length > 0 && <section className="task-sec" aria-labelledby="run-h"><h2 id="run-h" className="sec-label">Working on it</h2>{running.map((t) => <TaskCard key={t.id} t={t} steps={4} />)}</section>}
          {done.length > 0 && (
            <section className="task-sec" aria-labelledby="done-h">
              <h2 id="done-h" className="sec-label">Done<button className="link" onClick={() => done.forEach((t) => dismiss(t.id))}>Clear</button></h2>
              {done.map((t) => <TaskCard key={t.id} t={t} steps={2} />)}
            </section>
          )}
          {!tasks.length && (
            <div className="agent-empty">
              <span className="agent-face lg" aria-hidden="true"><Mark size={30} /></span>
              <p><b>Nothing running yet.</b> Pick an idea above. The agent works in the background, shows each step it takes, and checks back when it needs you.</p>
            </div>
          )}
        </div>

        <aside className="agent-side" aria-label="Your week">
          <section className="panel side-card">
            <h2 className="panel-h">Up next</h2>
            {game ? (
              <a className="next-game" href={`#/${game.href}`}>
                <span className="big">{game.booking.option.day} {game.booking.option.start}</span>
                <span>{game.booking.option.format} · {game.booking.option.venue.name}, court {game.booking.option.court}</span>
                <span className="mavs">{game.booking.invites.filter((i) => i.status !== "out").map((i) => <span key={i.id} className="mav" aria-hidden="true">{initials(i.name)}</span>)}</span>
                <span className={`task-state ${game.booking.state === "confirmed" ? "done" : "running"}`}>{game.booking.state === "confirmed" ? "Game on" : "Waiting for answers"}</span>
              </a>
            ) : <><p className="muted small">No game booked.</p><a className="btn primary sm" href="#/play">Find a game</a></>}
          </section>
          <section className="panel side-card">
            <h2 className="panel-h">This week</h2>
            <dl className="mini-stats">
              <div><dt>Quests done</dt><dd>{q ? `${logged} / ${q.quests.length}` : "none yet"}</dd></div>
              <div><dt>Boss</dt><dd>{q ? q.boss.name : data?.names.B ?? ""}</dd></div>
            </dl>
            <a className="btn ghost sm" href="#/goals">Open goals</a>
          </section>
          <p className="tiny muted side-foot"><span className="agent-dot" aria-hidden="true" />Muse Glimmer on your own server. Your videos, your body log and your memory never leave it.</p>
        </aside>
      </div>
      {story != null && <Story items={stories} at={story} onClose={() => setStory(null)} onMove={move} />}
    </div>
  );
}
