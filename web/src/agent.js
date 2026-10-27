// Client for the agent gateway (../agent): coach chat on the local LLM, Messenger status and plan delivery.
// The gateway runs on the coaching station; set VITE_AGENT_URL if it is not on this machine.
export const AGENT_URL = (import.meta.env.VITE_AGENT_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

async function call(path, body) {
  const r = await fetch(AGENT_URL + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `gateway ${r.status}`);
  return r.json();
}
// a long agent job, streamed as NDJSON: onEvent hears each {type: "working" | "step"} as it happens, and the promise
// resolves with the job's result
async function stream(path, body, onEvent) {
  const r = await fetch(AGENT_URL + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, stream: true }) });
  return steps(r, onEvent);
}
// the best match this week, scored by your agent; then your agent and that member's agent agree a time and a court
export const agentBest = (body, onEvent) => stream("/api/match/best", body, onEvent);
export const agentTalk = (body, onEvent) => stream("/api/match/talk", body, onEvent);
// your own video, sent to your own GPU server only: the steps stream back, then both players read on every frame
export async function agentReel(file, onEvent) {
  const r = await fetch(AGENT_URL + "/api/reel", { method: "POST", headers: { "content-type": file.type || "video/mp4" }, body: file });
  return steps(r, onEvent);
}
async function steps(r, onEvent) {
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `gateway ${r.status}`);
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const e = JSON.parse(line);
      if (e.type === "done") return e.result;
      if (e.type === "error") throw new Error(e.error);
      onEvent?.(e);
    }
  }
  throw new Error("the agent stopped before it finished");
}
export const agentStatus = () => call("/api/status");
export const agentPlayers = () => call("/api/players");
export const agentChat = (coach, message, history) => call("/api/chat", { coach, message, history });
export const agentNotify = (plan, text) => call("/api/notify", { plan, text });
export const agentRemind = () => call("/api/remind", {});
// the self-evolving staff: knowledge base from the research agent, playbooks, proposals and feedback
export const agentKb = () => call("/api/kb");
export const agentKbSearch = (q) => call(`/api/kb/search?q=${encodeURIComponent(q)}`);
export const agentResearch = (topics) => call("/api/research/run", { topics, maxPapers: 6 });
export const agentPlaybooks = () => call("/api/playbooks");
export const agentEvolve = () => call("/api/evolve/run", {});
export const agentDecide = (coach, id, approve) => call("/api/evolve/decide", { coach, id, approve });
export const agentRollback = (coach) => call("/api/evolve/rollback", { coach });
export const agentFeedback = (fb) => call("/api/feedback", fb);
// the club: one club night for every member, and this week's quests with the next opponent as the boss
export const agentClubPlan = (you, on) => stream("/api/club/plan", { you }, on);
export const agentQuests = (memory, on) => stream("/api/quests", { memory }, on);
// play: find a game (court, partners, everyone's calendar, the venue in the middle), book it once the player
// confirms, and follow the answers
export const agentPlay = (text, you, on) => stream("/api/play/plan", { text, you }, on);
export const agentBook = (option, invites, you) => call("/api/play/book", { option, invites, you });
export const agentBooking = (id) => call(`/api/play/booking?id=${encodeURIComponent(id)}`);
export const agentCancel = (id) => call("/api/play/cancel", { id });
// a highlight reel's caption for Instagram and Facebook, written by Muse Glimmer and checked against the rallies
export const agentCaption = (reel) => call("/api/highlight/caption", reel);
