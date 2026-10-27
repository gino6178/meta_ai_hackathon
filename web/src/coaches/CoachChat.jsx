import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { agentChat, agentStatus, agentFeedback, AGENT_URL } from "../agent.js";
import { memory } from "../memory.js";
import { scrollBehavior } from "../hooks.js";
import "../pages/lab.css";

// Free conversation with one coach agent on Muse Glimmer, Meta's open-weights model, on our own GPU. Every reply is grounded in the
// match facts sheet; the gateway's verifier checks every number before it is shown. "Remember this" also saves the
// message to player memory, which every coach retrieves next time it answers.
export default function CoachChat({ coach, onRemember }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [keep, setKeep] = useState(false);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [waited, setWaited] = useState(0); // seconds since the question was sent; a Glimmer reply takes 15-30 s
  useEffect(() => {
    if (!busy) return;
    setWaited(0); const t0 = Date.now(), id = setInterval(() => setWaited(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const box = useRef(null);
  useEffect(() => { agentStatus().then(setStatus).catch(() => setStatus({ offline: true })); }, []);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: scrollBehavior() }); }, [msgs, busy]);

  const send = async (e) => {
    e.preventDefault();
    const q = text.trim(); if (!q || busy) return;
    if (keep) { memory.add(q, "note"); setSaved(q); setKeep(false); onRemember?.(); } else setSaved("");
    const history = msgs.map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, { role: "user", text: q }]); setText(""); setBusy(true);
    try {
      const r = await agentChat(coach.id, q, history);
      setMsgs((m) => [...m, { role: "assistant", text: r.text, r }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: "assistant", text: `The agent gateway is not reachable (${err.message}).`, err: true }]);
    }
    setBusy(false);
  };
  // 👍 / 👎 feeds the coaches' nightly reflection (see Lab)
  const rate = (k, value) => {
    const m = msgs[k], q = msgs.slice(0, k).reverse().find((x) => x.role === "user");
    setMsgs((all) => all.map((x, i) => (i === k ? { ...x, rated: value } : x)));
    agentFeedback({ coach: m.r.coach, question: q?.text, reply: m.text, value }).catch(() => {});
  };

  const llm = status?.llm;
  return (
    <section className="panel coach-chat" style={{ "--cc": coach.color }}>
      <header>
        <h2 className="panel-h">Talk to {coach.name}</h2>
        <span className={`tiny ${llm?.ready ? "ok" : "muted"}`}>
          {status?.offline ? `Gateway offline · start it in agent/ (${AGENT_URL})` : llm?.ready ? `${llm.model} on ${llm.device} · coaching server` : `Model server ${llm?.error ? "unreachable" : "loading"} · ${llm?.url ?? ""}`}
        </span>
      </header>
      <div className="chat-log" ref={box} aria-live="polite" aria-relevant="additions">
        {!msgs.length && <p className="tiny muted">Ask about your match, or tell {coach.name} how you feel. Answers use only the measured facts; numbers are checked before they are shown.</p>}
        {msgs.map((m, k) => (
          <div key={k} className={`chat-msg ${m.role}`}>
            {m.role === "assistant" && <Avatar coach={coach} size={30} />}
            <div>
              <p>{m.text}</p>
              {m.r && (
                <span className="tiny chat-meta">
                  <b className={m.r.verified.ok ? "ok" : "bad"}>{m.r.verified.ok ? `✓ ${m.r.verified.numbers} figure${m.r.verified.numbers === 1 ? "" : "s"} verified` : "⚠ unverified"}</b>
                  {m.r.cites.length ? ` · cites ${m.r.cites.join(" ")}` : ""}
                  {m.r.timing ? ` · ${m.r.timing.seconds} s, ${m.r.timing.tokens_per_s} tok/s on ${m.r.timing.device}` : ""}
                  {m.r.verified.offline ? " · model offline, raw fact shown" : ""}
                </span>
              )}
              {m.r?.evidence?.length > 0 && (
                <ul className="tiny chat-sources">
                  {m.r.evidence.map((e) => <li key={e.id}>{e.id} · {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.cite}</a> : e.cite}</li>)}
                </ul>
              )}
              {m.r && !m.r.verified.offline && (
                <span className="chat-rate">
                  <button type="button" className="chip" aria-pressed={m.rated === 1} disabled={!!m.rated} onClick={() => rate(k, 1)} aria-label="Helpful">👍</button>
                  <button type="button" className="chip" aria-pressed={m.rated === -1} disabled={!!m.rated} onClick={() => rate(k, -1)} aria-label="Not helpful">👎</button>
                  {m.rated ? <span className="tiny muted">Thanks, noted for the coaches.</span> : null}
                </span>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant" aria-label={`${coach.name} is writing`}>
            <Avatar coach={coach} size={30} />
            <div><p className="dots"><i /><i /><i /></p>
              <span className="tiny chat-meta">{llm?.model ?? "The model"} is reading your match facts and checking every number · {waited} s</span></div>
          </div>
        )}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Why do I keep losing points at the net?" aria-label={`Message ${coach.name}`} />
        <label title="Also save this message to player memory"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Remember this</label>
        <button className="btn primary" disabled={!text.trim() || busy} aria-busy={busy}>Send</button>
      </form>
      <span className="tiny muted">{saved ? <span className="chat-saved">Saved to memory: “{saved}”. </span> : null}Tick “Remember this” for things every coach should know, like an injury or a goal. Memory stays on this device.</span>
    </section>
  );
}
