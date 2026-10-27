import Icon from "./Icon.jsx";
import { dismiss, plain } from "../tasks.js";
import Mark from "./Mark.jsx";

// One job the agent did or is doing: what was asked, where it stands, and the trail of steps behind it.
const JOB = { play: "Play", quests: "Quests", night: "Club night", ask: "Your agent", lookup: "Your match", match: "Best match", talk: "Agent to agent", autopilot: "Autopilot" };
export function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 45 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}
function action(t) {
  if (t.state === "failed") return null;
  if (t.kind === "play") return t.booking ? (t.booking.state === "confirmed" ? "See the game" : "Follow the answers") : t.state === "needs" ? `Review ${t.result?.options?.length ?? ""} options` : t.state === "running" ? "Watch" : "Open";
  if (t.kind === "talk") return t.state === "needs" ? "Book it" : "See the talk";
  if (t.kind === "autopilot") return t.state === "needs" ? "Review the plan" : t.state === "running" ? "Watch" : "See the run";
  return { quests: "Open goals", night: "Open the plan", ask: "Continue the chat", lookup: "Show me", match: "See the matches" }[t.kind] || "Open";
}

export default function TaskCard({ t, steps = 3 }) {
  const last = t.steps.at(-1), more = Math.max(0, t.steps.length - steps);
  const said = ["play", "ask", "lookup"].includes(t.kind);
  return (
    <article className={`task ${t.state}`} aria-label={`${JOB[t.kind] || "Task"}: ${t.title}`}>
      <span className={`task-av ${t.state}`} aria-hidden="true"><Mark size={22} /></span>
      <div className="task-body">
        <header>
          <b>{JOB[t.kind] || "Agent"}</b>
          <span className={`task-state ${t.state}`}>{t.state === "running" ? "Working" : t.state === "needs" ? "Needs you" : t.state === "failed" ? "Couldn't finish" : "Done"}</span>
          <span className="tiny muted">{ago(t.finished || t.started)}</span>
          <button className="icon-btn sm task-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="close" size={14} /></button>
        </header>
        {said ? <p className="task-said">“{t.title}”</p> : <p className="task-said plain">{t.title}</p>}
        {t.state === "running"
          ? <p className="task-now" role="status"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{t.working || (last ? `${last.step}…` : "Starting…")}</p>
          : <p className={`task-sum ${t.state}`}>{t.state === "failed" ? t.error : plain(t.summary)}</p>}
        {t.steps.length > 0 && (
          <ol className="task-steps" aria-label="Steps">
            {more > 0 && <li className="more">+{more} earlier step{more > 1 ? "s" : ""}</li>}
            {t.steps.slice(-steps).map((s, k) => <li key={k} title={s.detail}><Icon name="check" size={14} />{s.step}</li>)}
          </ol>
        )}
        {action(t) && t.href && <a className={`btn sm ${t.state === "needs" ? "primary" : "ghost"}`} href={`#/${t.href}`}>{action(t)}<Icon name="next" size={16} /></a>}
      </div>
    </article>
  );
}
