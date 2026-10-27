import { useMemo, useState } from "react";
import { COACHES } from "../coaches/personas.js";
import Avatar from "../coaches/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import Brand from "../components/Brand.jsx";
import { tips } from "../coaches/tips.js";
import { useLearning } from "../coaches/learning.js";

// The coaching staff as an inbox: one thread per coach, the round table as the group chat, and Facebook Messenger
// for the 24-hour coach in the player's pocket. A thread shows as new until it is opened.
const SEEN = "shuttlecoach.inbox.v1";
export default function Coaches({ data, video }) {
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.getItem(SEEN)) || []; } catch { return []; } });
  const tip = useMemo(() => (data ? tips(data) : null), [data]);
  const learn = useLearning();
  const open = (id) => { const s = [...new Set([...seen, id])]; setSeen(s); try { localStorage.setItem(SEEN, JSON.stringify(s)); } catch { /* ignore */ } };
  return (
    <div className="page coaches inbox">
      {video && <div className="notice" role="note"><b>Demo mode.</b> “{video.name}” stayed on this device. The coaches below analyse the precomputed sample match.</div>}
      <header className="report-head">
        <div>
          <h1 className="h1">Coaches</h1>
          <p className="muted">Four coach agents and a head coach agent, on Muse Glimmer on your own server. Each one reads the match, remembers what you tell it and checks in on Messenger.</p>
        </div>
      </header>
      <a className="learning" href="#/lab">
        <span className="thread-ic" aria-hidden="true"><Icon name="verify" size={24} /></span>
        <span className="thread-body">
          <b>Your coaches keep learning</b>
          <span className="tiny muted">{learn ? `${learn.learned} rules learned${learn.papers != null ? ` from ${learn.papers} papers` : ""}, each one checked before it is used. ${learn.waiting.length ? `${learn.waiting.length} wait for your approval.` : "Nothing waits for you."}` : "A research agent reads sports science, and each coach proposes changes to its own playbook."}</span>
        </span>
        {learn?.waiting.length > 0 && <span className="task-state needs">{learn.waiting.length} need you</span>}
      </a>
      <ul className="thread-list">
        <li>
          <a className={`thread ${seen.includes("roundtable") ? "" : "new"}`} href="#/roundtable" onClick={() => open("roundtable")}>
            <span className="rt-faces">{COACHES.map((c) => <Avatar key={c.id} coach={c} size={30} />)}</span>
            <span className="thread-body"><b>Round table</b><span className="tiny muted">The whole staff debates your match and agrees four goals and a 7-day plan.</span></span>
            <span className="thread-meta"><span className="tiny muted">group</span>{!seen.includes("roundtable") && <i className="unread" aria-label="new" />}</span>
          </a>
        </li>
        {COACHES.map((c) => (
          <li key={c.id}>
            <a className={`thread ${seen.includes(c.id) ? "" : "new"}`} href={`#/coach/${c.id}`} onClick={() => open(c.id)} style={{ "--cc": c.color }}>
              <Avatar coach={c} size={56} />
              <span className="thread-body"><b>{c.name}</b><span className="thread-role">{c.role}</span><span className="tiny muted thread-prev">{tip?.[c.id] ?? c.blurb}</span></span>
              <span className="thread-meta"><span className="tiny muted">today</span>{!seen.includes(c.id) && <i className="unread" aria-label="new" />}</span>
            </a>
          </li>
        ))}
        <li>
          <a className="thread" href="#/messages">
            <span className="thread-ic messenger" aria-hidden="true"><Brand name="messenger" size={26} /></span>
            <span className="thread-body"><b>Your 24-hour coach in Messenger</b><span className="tiny muted">Your week's plan, a nudge before every session with what to eat, and a check-in after.</span></span>
            <span className="thread-meta" />
          </a>
        </li>
      </ul>
      <div className="coach-links">
        <a className="btn ghost" href="#/match">Open the match analysis</a>
        <a className="btn ghost" href="#/memory">Player memory</a>
      </div>
    </div>
  );
}
