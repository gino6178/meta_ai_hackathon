import { useEffect, useState } from "react";
import { agentStatus, agentPlayers, agentRemind, AGENT_URL } from "../agent.js";
import Mark from "../components/Mark.jsx";

// Serve in Messenger: your agent in your chats, through a Facebook Page on the Messenger Platform. The status of the
// model and the Page, the steps to connect a real Page, and each linked player: what the agent learned, their
// calendar and body log, and the conversation itself.
const when = (t) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Messages() {
  const [st, setSt] = useState(null), [ps, setPs] = useState([]), [err, setErr] = useState(null), [msg, setMsg] = useState("");
  const refresh = () => Promise.all([agentStatus(), agentPlayers()]).then(([a, b]) => { setSt(a); setPs(b); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, []);
  const llm = st?.llm, ms = st?.messenger;
  // what is still needed before players can chat, in order
  const steps = [
    { done: !err && !!st, t: <>The gateway runs on your GPU server ({AGENT_URL}).</> },
    { done: !!llm?.ready, t: <>Muse Glimmer is loaded ({llm?.model ?? "muse-glimmer"}).</> },
    { done: !!ms?.enabled, t: <>A Facebook Page and a Meta app with Messenger: the Page token, the app secret and a verify token go in <code>agent/.env</code>; the app's webhook points at <code>https://your-tunnel/webhook/messenger</code>, subscribed to messages and postbacks.</> },
    { done: ps.length > 0, t: <>Send the Page a message. The first message links you; in development mode, only the app's admins and testers can.</> },
  ];

  return (
    <div className="page messages">
      <header className="report-head">
        <div>
          <span className="tag">Serve in Messenger · Muse Glimmer</span>
          <h1 className="h1">Your agent, in your chats</h1>
          <p className="muted">Line up the week and approve it with a tap, a reminder an hour before every game, a check-in after, what hurts, a health export shared into the chat, courts near a place. Every reply is written by Muse Glimmer on your own server and checked before it is sent.</p>
        </div>
        <div className="cta-row">
          <button className="btn ghost" disabled={!ps.length} onClick={() => agentRemind().then((r) => setMsg(`Today's calendar sent to ${r.sent.length} player(s).`)).catch((e) => setMsg(e.message))}>Send today's calendar now</button>
        </div>
      </header>
      {err && <div className="notice" role="alert"><b>Agent gateway not reachable</b> at {AGENT_URL} ({err}).</div>}
      {msg && <p className="tiny muted" role="status">{msg}</p>}

      <dl className="status-strip" aria-label="Status">
        <div><dt>Model</dt><dd><span className={llm?.ready ? "ok" : "bad"}>{llm ? (llm.ready ? "Ready" : "Not ready") : "…"}</span></dd>
          <dd>{llm?.model ?? ""} {llm?.device ? `on ${llm.device}` : ""}{llm?.error ? ` · ${llm.error}` : ""}</dd></div>
        <div><dt>Messenger</dt><dd><span className={ms?.enabled ? "ok" : "bad"}>{ms?.enabled ? ms.page || "Page connected" : "Not set up"}</span></dd>
          <dd>{ms?.enabled ? (ms.lastEvent ? `Last message ${when(ms.lastEvent)}` : "Waiting for the first message") : ms?.error ?? "Needs a Page token."}</dd></div>
        <div><dt>Players linked</dt><dd>{st?.players ?? "–"}</dd><dd>/forget deletes everything stored about a player.</dd></div>
      </dl>

      {!ps.length && (
        <section className="panel">
          <h2 className="panel-h">Connect a Page</h2>
          <p className="muted small">Ticks appear as each step is detected.</p>
          <ol className="setup">{steps.map((x, k) => <li key={k} className={x.done ? "done" : ""}><span>{x.t}</span></li>)}</ol>
        </section>
      )}
      {ps.map((p) => (
        <section key={p.id} className="panel msg-player">
          <header><h3>{p.name}</h3><span className="tiny muted">chat {p.id} · {p.events.length} in the calendar · {p.body?.log?.length || 0} body log entries · {p.body?.workouts?.length || 0} workouts</span></header>
          <div className="msg-grid">
            <div>
              <h4>Learned from your chats</h4>
              {p.memories.length ? <ul className="msg-mem">{p.memories.map((m, k) => <li key={k}>{m.text}<span className="tiny muted"> · {when(m.at)}</span></li>)}</ul> : <p className="tiny muted">Nothing yet.</p>}
              <h4>Coming up</h4>
              {p.events.length ? <ul className="msg-mem">{p.events.slice(0, 6).map((e) => <li key={e.id}>{e.date} {e.start} {e.title}</li>)}</ul> : <p className="tiny muted">Nothing in the calendar.</p>}
            </div>
            <div className="msg-log">
              {p.history.map((h, k) => (
                <div key={k} className={`chat-msg ${h.role}`} style={{ "--cc": "var(--agent)" }}>
                  {h.role === "assistant" ? <span className="chat-agent" aria-hidden="true"><Mark size={18} /></span> : <span />}
                  <div><p>{h.content}</p>{h.role === "assistant" && <span className="tiny chat-meta">{h.verified ? "✓ checked" : "⚠ not checked"} · {when(h.at)}</span>}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
