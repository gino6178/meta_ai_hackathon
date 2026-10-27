import { useEffect, useRef, useState } from "react";
import Landing from "./pages/Landing.jsx";
import Agent from "./pages/Agent.jsx";
import Upload from "./pages/Upload.jsx";
import Processing from "./pages/Processing.jsx";
import Report from "./pages/Report.jsx";
import Memory from "./pages/Memory.jsx";
import Match from "./pages/Match.jsx";
import Scout from "./pages/Scout.jsx";
import Live from "./pages/Live.jsx";
import Messages from "./pages/Messages.jsx";
import Club from "./pages/Club.jsx";
import Play from "./pages/Play.jsx";
import You from "./pages/You.jsx";
import Autopilot from "./pages/Autopilot.jsx";
import Body from "./pages/Body.jsx";
import Courts from "./pages/Courts.jsx";
import { memory } from "./memory.js";
import VoiceCoach from "./voice/VoiceCoach.jsx";
import { loadSample } from "./data.js";
import { useTasks, plain } from "./tasks.js";
import Icon from "./components/Icon.jsx";
import Mark from "./components/Mark.jsx";

const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "home");
const base = (p) => p.split("/")[0];

export function go(path) { location.hash = "/" + path; window.scrollTo(0, 0); }

// Five tabs, the way a social app has them: the agent, the club, play, goals and you. Messenger is the inbox.
const TABS = [
  { k: "home", label: "Agent", icon: "spark", on: ["home", "autopilot"] },
  { k: "club", label: "Club", icon: "coaches", on: ["club"] },
  { k: "play", label: "Play", icon: "book", on: ["play", "courts"] },
  { k: "goals", label: "Goals", icon: "goals", on: ["goals"] },
  { k: "you", label: "You", icon: "you", on: ["you", "body", "match", "report", "scout", "memory", "analyze", "processing"] },
];
const INBOX = { k: "messages", label: "Messenger", icon: "send", on: ["messages"] };
const MORE = [
  { k: "autopilot", label: "Autopilot", note: "Your agent keeps you playing", icon: "spark" },
  { k: "body", label: "Body log", note: "Tell your agent what hurts; your health app", icon: "heart" },
  { k: "courts", label: "Courts near you", note: "Any sport, judged from reviews and weather", icon: "pin" },
  { k: "live", label: "Live court side", note: "Briefings between points", icon: "live" },
  { k: "analyze", label: "Analyze a video", note: "Add a match from this device", icon: "plus" },
  { k: "memory", label: "Your memory", note: "What your agent remembers", icon: "memory" },
  { k: "messages", label: "Serve in Messenger", note: "Your agent, in your chats", icon: "chat" },
  { k: "about", label: "About Serve", note: "How it works, privacy", icon: "info" },
];
const href = (k) => `#/${k === "home" ? "" : k}`;
const THEME = "shuttlecoach.theme";

// a menu that closes on Escape, on a click outside it and on navigation
function useMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const key = (e) => e.key === "Escape" && setOpen(false);
    const click = (e) => !box.current?.contains(e.target) && setOpen(false);
    const nav = () => setOpen(false);
    addEventListener("keydown", key); addEventListener("pointerdown", click); addEventListener("hashchange", nav);
    return () => { removeEventListener("keydown", key); removeEventListener("pointerdown", click); removeEventListener("hashchange", nav); };
  }, [open]);
  return [open, setOpen, box];
}

function useTheme() {
  const [t, setT] = useState(() => { try { return localStorage.getItem(THEME) || "system"; } catch { return "system"; } });
  useEffect(() => {
    const el = document.documentElement;
    if (t === "system") delete el.dataset.theme; else el.dataset.theme = t;
    try { if (t === "system") localStorage.removeItem(THEME); else localStorage.setItem(THEME, t); } catch { /* ignore */ }
  }, [t]);
  return [t, setT];
}

function Shell({ page, data }) {
  const cur = (it) => (it.on ?? [it.k]).includes(base(page)) ? "page" : undefined;
  const [more, setMore, moreBox] = useMenu();
  const [theme, setTheme] = useTheme();
  const tasks = useTasks();
  const needs = tasks.filter((t) => t.state === "needs").length, busy = tasks.some((t) => t.state === "running");
  const badge = (it) => it.k === "home" && (needs ? <em className="nav-count" aria-label={`${needs} need you`}>{needs}</em> : busy ? <i className="nav-busy" aria-label="working" /> : null);
  return (
    <>
      <header className="side">
        <a className="brand" href="#/" aria-label="Serve, your agent">
          <Mark /><span>serve</span>
        </a>
        <nav className="side-nav" aria-label="Main">
          {[...TABS, INBOX].map((it) => (
            <a key={it.k} href={href(it.k)} aria-current={cur(it)} title={it.label} className={it === INBOX ? "inbox" : ""}>
              <Icon name={it.icon} size={24} /><span className="lbl">{it.label}</span>{badge(it)}
            </a>
          ))}
        </nav>
        <div className="side-tools">
          <a className="btn primary side-new" href="#/analyze" title="Analyze a video"><Icon name="plus" size={18} /><span className="lbl">Analyze video</span></a>
          <VoiceCoach data={data} />
          <a className="icon-btn side-inbox" href="#/messages" aria-label="Messenger" aria-current={cur(INBOX)}><Icon name="send" size={20} /></a>
          <div className="side-more" ref={moreBox}>
            <button className="side-more-btn" aria-expanded={more} aria-haspopup="true" aria-label="More" onClick={() => setMore(!more)}>
              <Icon name="menu" size={22} /><span className="lbl">More</span>
            </button>
            {more && (
              <div className="more-pop" role="menu">
                {MORE.map((it) => (
                  <a key={it.k} role="menuitem" href={href(it.k)} aria-current={cur(it)}><Icon name={it.icon} /><span><b>{it.label}</b><em>{it.note}</em></span></a>
                ))}
                <div className="more-theme" role="group" aria-label="Theme">
                  <span><Icon name="sun" size={18} />Theme</span>
                  <div className="seg sm" role="radiogroup" aria-label="Theme">
                    {[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => <button key={k} role="radio" aria-checked={theme === k} onClick={() => setTheme(k)}>{l}</button>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="side-status" title="Every agent runs on Muse Glimmer on a GPU you own; your videos, body log and memory never leave it"><i aria-hidden="true" /><span className="lbl">Muse Glimmer · your server</span></p>
      </header>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((it) => <a key={it.k} href={href(it.k)} aria-current={cur(it)}><span className="tab-ic"><Icon name={it.icon} size={24} />{badge(it)}</span><span>{it.label}</span></a>)}
      </nav>
    </>
  );
}

// Muse-style check-back: when a job finishes while the player is elsewhere, say so, with a way to open it
function CheckBack() {
  const tasks = useTasks();
  const seen = useRef(null), [note, setNote] = useState(null);
  useEffect(() => {
    if (!seen.current) { seen.current = Object.fromEntries(tasks.map((t) => [t.id, t.state])); return; }
    for (const t of tasks) {
      const was = seen.current[t.id];
      // the agent home lists every job, so it needs no check-back; neither does the page the job belongs to
      if (was && was !== t.state && t.state !== "running" && route() !== "home" && !location.hash.includes(t.id) && base(route()) !== base(t.href || "")) setNote(t);
      seen.current[t.id] = t.state;
    }
  }, [tasks]);
  useEffect(() => { if (!note) return; const id = setTimeout(() => setNote(null), 7000); return () => clearTimeout(id); }, [note]);
  if (!note) return null;
  return (
    <div className="toast checkback" role="status">
      <span className="agent-dot" aria-hidden="true" />
      <span><b>{note.state === "needs" ? "Needs you" : note.state === "failed" ? "Couldn't finish" : "Done"}</b> {plain(note.summary || note.error || note.title)}</span>
      {note.href && <a className="btn sm primary" href={`#/${note.href}`} onClick={() => setNote(null)}>Open</a>}
      <button className="icon-btn sm" aria-label="Dismiss" onClick={() => setNote(null)}><Icon name="close" size={16} /></button>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(route());
  const [video, setVideo] = useState(null); // { url, name, size, duration, width, height }
  const [data, setData] = useState(null);

  useEffect(() => {
    const on = () => setPage(route());
    addEventListener("hashchange", on);
    loadSample().then(setData);
    return () => removeEventListener("hashchange", on);
  }, []);

  // Live is a broadcast view of its own: no app chrome, its own exit
  const bare = page === "live";
  return (
    <>
      {!bare && <Shell page={page} data={data} />}
      <main className={bare ? "bare" : ""}>
        {(page === "home" || ["coaches", "coach", "roundtable", "lab"].includes(base(page))) && <Agent data={data} />}
        {page === "about" && <Landing data={data} />}
        {page === "analyze" && <Upload onVideo={(v) => { setVideo(v); go("processing"); }} />}
        {page === "processing" && <Processing video={video} onDone={() => {
          // remember this analysis so later sessions can refer back to it
          const ins = data?.insights, oc = data?.outcomes?.A;
          if (ins && oc) memory.saveSession(data.event, `Match analysed (${data.event}): most-targeted zone ${ins.topZone.key.replace("-", " ")}, ${oc.winners.length} winners vs ${oc.beaten.length} conceded, ${oc.errors.length} own errors.`);
          go("match");
        }} />}
        {page === "report" && <Report data={data} video={video} />}
        {page === "memory" && <Memory />}
        {base(page) === "match" && <Match />}
        {page === "scout" && <Scout />}
        {page === "live" && <Live data={data} />}
        {page === "messages" && <Messages />}
        {page === "club" && <Club data={data} view="feed" />}
        {page === "goals" && <Club data={data} view="goals" />}
        {page === "play" && <Play data={data} />}
        {page === "you" && <You data={data} />}
        {page === "autopilot" && <Autopilot data={data} />}
        {page === "body" && <Body />}
        {page === "courts" && <Courts />}
      </main>
      {!bare && <CheckBack />}
    </>
  );
}

// Rally 3D and the scouting report belong to the match: one strip of sub-pages on all three.
export function MatchNav({ page }) {
  return (
    <nav className="subnav noprint" aria-label="Match views">
      {[["match", "Analysis"], ["report", "Rally 3D"], ["scout", "Scouting report"]].map(([k, l]) => (
        <a key={k} href={`#/${k}`} aria-current={page === k ? "page" : undefined}>{l}</a>
      ))}
    </nav>
  );
}
