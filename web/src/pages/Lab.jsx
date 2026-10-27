import { useEffect, useState } from "react";
import { agentStatus, agentKb, agentKbSearch, agentResearch, agentPlaybooks, agentEvolve, agentDecide, agentRollback, AGENT_URL } from "../agent.js";
import { COACHES } from "../coaches/personas.js";
import "./lab.css";

// Lab: how the coaching staff improves itself. The research agent reads papers into the knowledge base; each night
// the coaches reflect on player feedback, rejected drafts and new findings, and propose playbook changes that are
// adopted only when they cite a study, pass the safety check and do not regress. Health rules wait for a human.
const STAFF = [{ id: "head", name: "Head Coach", color: "#C3CACD" }, ...COACHES];
const when = (t) => (t ? new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");

function Playbook({ coach, pb, onChange }) {
  const [msg, setMsg] = useState(null);
  const act = (p) => p.then(() => { setMsg(null); onChange(); }).catch((e) => setMsg(e.message));
  const pending = pb.proposals.filter((p) => p.status === "pending");
  const recent = pb.proposals.filter((p) => p.status !== "pending").slice(-4).reverse();
  return (
    <section className="panel lab-pb" style={{ "--cc": coach.color }}>
      <header>
        <h3>{coach.name}</h3>
        <span className="tiny muted">playbook v{pb.version} · {pb.rules.length} rule{pb.rules.length === 1 ? "" : "s"}</span>
        <button className="btn ghost sm" disabled={!pb.history.length} onClick={() => act(agentRollback(coach.id))}>Roll back</button>
      </header>
      <ol className="lab-rules">
        {pb.rules.map((r) => (
          <li key={r.id}>
            <span>{r.text}</span>
            <span className="tiny muted">
              {r.locked ? <b className="lab-lock">locked safety rule</b> : r.source === "evolution" ? `learned in v${r.since}` : "starting rule"}
              {r.evidence?.length ? ` · ${r.evidence.join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ol>
      {pending.length > 0 && <h4>Waiting for your approval</h4>}
      {pending.map((p) => (
        <div key={p.id} className="lab-prop pending">
          <p><b>{p.action === "add" ? "Add" : p.action === "replace" ? `Replace ${p.target}` : `Remove ${p.target}`}:</b> {p.text}</p>
          <p className="tiny muted">{p.gate} · evidence {p.evidence?.join(", ") || "none"}{p.reason ? ` · ${p.reason}` : ""}</p>
          <div className="cta-row">
            <button className="btn primary sm" onClick={() => act(agentDecide(coach.id, p.id, true))}>Approve</button>
            <button className="btn ghost sm" onClick={() => act(agentDecide(coach.id, p.id, false))}>Decline</button>
          </div>
        </div>
      ))}
      {recent.length > 0 && <h4>Recent proposals</h4>}
      {recent.map((p) => (
        <div key={p.id} className={`lab-prop ${p.status.startsWith("adopted") ? "ok" : "no"}`}>
          <p><b>{p.status}</b> · {p.text ?? p.target}</p>
          {p.gate && <p className="tiny muted">{p.gate}</p>}
        </div>
      ))}
      {msg && <p className="tiny bad" role="alert">{msg}</p>}
    </section>
  );
}

export default function Lab() {
  const [st, setSt] = useState(null), [kb, setKb] = useState(null), [pbs, setPbs] = useState(null), [err, setErr] = useState(null);
  const [q, setQ] = useState(""), [hits, setHits] = useState(null), [topics, setTopics] = useState(""), [busy, setBusy] = useState(null), [note, setNote] = useState(null);
  const refresh = () => Promise.all([agentStatus(), agentKb(), agentPlaybooks()]).then(([a, b, c]) => { setSt(a); setKb(b); setPbs(c.playbooks); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, []);

  const research = () => {
    setBusy("research"); setNote("The research agent is searching OpenAlex, arXiv and Semantic Scholar and reading abstracts. This takes about two minutes.");
    agentResearch(topics.split(",").map((t) => t.trim()).filter(Boolean))
      .then((r) => setNote(`Read ${r.screened} of ${r.found} papers found, kept ${r.kept}, added ${r.findings.length} findings in ${r.seconds} s.`))
      .catch((e) => setNote(e.message)).finally(() => { setBusy(null); refresh(); });
  };
  const evolve = () => {
    setBusy("evolve"); setNote("The coaches are reflecting and testing each proposal on their regression questions. This takes a few minutes.");
    agentEvolve().then((r) => {
      const all = Object.values(r.coaches).flatMap((c) => c.proposals);
      const n = (s) => all.filter((p) => p.status === s).length;
      setNote(all.length ? `${all.length} proposals: ${n("adopted")} adopted, ${n("pending")} waiting for approval, ${n("rejected")} rejected by the gates.` : "Nothing new to learn from since the last run.");
    }).catch((e) => setNote(e.message)).finally(() => { setBusy(null); refresh(); });
  };
  const search = (e) => { e.preventDefault(); if (q.trim()) agentKbSearch(q).then(setHits).catch((x) => setNote(x.message)); };
  const findings = hits ?? kb?.findings?.slice().reverse() ?? [];
  const fb = st?.feedback, last = kb?.stats?.lastRun;

  return (
    <div className="page lab">
      <header className="report-head">
        <div>
          <span className="tag">Research agent · self-evolving staff</span>
          <h1 className="h1">How your coaches keep learning</h1>
          <p className="muted">A research agent reads sports-science papers into a local knowledge base. Each night the coaches reflect on player feedback and on drafts the verifier rejected, then propose changes to their playbooks. A change is adopted only if it cites a study, passes the safety check and does not make the coach worse on its test questions. Anything about health waits for a human coach.</p>
        </div>
        <div className="cta-row">
          <button className="btn ghost" disabled={!!busy} onClick={research}>{busy === "research" ? "Researching…" : "Run research now"}</button>
          <button className="btn primary" disabled={!!busy} onClick={evolve}>{busy === "evolve" ? "Reflecting…" : "Run reflection now"}</button>
        </div>
      </header>
      {err && <div className="notice" role="alert"><b>Agent gateway not reachable</b> at {AGENT_URL} ({err}).</div>}
      {note && <p className="small muted" role="status">{note}</p>}

      <dl className="status-strip" aria-label="Status">
        <div><dt>Knowledge base</dt><dd>{kb ? `${kb.stats.papers} papers` : "…"}</dd><dd>{kb ? `${kb.stats.findings} findings, embedded on the station` : ""}</dd></div>
        <div><dt>Last research run</dt><dd>{when(last?.at)}</dd><dd>{last ? `${last.kept} papers kept of ${last.found} found · nightly at 03:00` : "Nightly at 03:00"}</dd></div>
        <div><dt>Player feedback</dt><dd>{fb ? `${fb.up} 👍 · ${fb.down} 👎` : "…"}</dd><dd>{fb ? `${fb.rejections} drafts rejected by the verifier` : ""}</dd></div>
        <div><dt>Reflection</dt><dd>{pbs ? `${Object.values(pbs).reduce((s, p) => s + p.proposals.filter((x) => x.status === "pending").length, 0)} waiting` : "…"}</dd><dd>Nightly at 04:00, after research</dd></div>
      </dl>

      <label className="lab-topics">
        <span className="small">Extra research topics (optional, comma separated)</span>
        <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="e.g. patellar tendinopathy return to sport, shuttle anticipation training" />
      </label>

      <h2 className="panel-h">Playbooks</h2>
      <div className="lab-grid">
        {pbs && STAFF.filter((c) => pbs[c.id]).map((c) => <Playbook key={c.id} coach={c} pb={pbs[c.id]} onChange={refresh} />)}
      </div>

      <h2 className="panel-h">Knowledge base</h2>
      <form className="lab-search" onSubmit={search} role="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the knowledge base, e.g. knee pain after lunges" aria-label="Search findings" />
        <button className="btn ghost sm">Search</button>
        {hits && <button type="button" className="btn ghost sm" onClick={() => { setHits(null); setQ(""); }}>Show all</button>}
      </form>
      <ul className="lab-findings">
        {findings.map((f) => (
          <li key={f.id}>
            <b className="lab-id">{f.id}</b>
            <div>
              <p>{f.claim}</p>
              {f.practice && <p className="small muted">Coaching use: {f.practice}</p>}
              <p className="tiny muted">
                {f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.cite ?? f.title}</a> : f.cite}
                {f.studyType ? ` · ${f.studyType}` : ""}{f.areas?.length ? ` · ${f.areas.join(", ")}` : ""}{f.score ? ` · match ${f.score.toFixed(2)}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
