import { useEffect, useMemo, useState } from "react";
import { COACHES } from "../coaches/personas.js";
import Avatar from "../coaches/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import TaskCard from "../components/TaskCard.jsx";
import { tactics } from "../coaches/analysis.js";
import { memory } from "../memory.js";
import { readGame, saveGame, isoWeek, today } from "../club/game.js";
import { postToClub } from "../club/share.js";
import { useTasks, startQuests, startNight, startPlay, playerOf } from "../tasks.js";
import { ratings, records } from "../club/arena.js";
import { Rankings, Challenges, Standing } from "./Arena.jsx";
import { go } from "../App.jsx";
import "./club.css";
import "./agent.css";

// The club, in two places. Club has three tabs: the feed (what members and their coaches post, open games to join, a
// challenge to take up) beside the top of the table, club night and the practice partners; the leaderboard; and the
// challenges (random match, challenges for you, results that move the club rating; see Arena.jsx). Goals is training
// as a game: each coach gives a
// weekly quest (Muse Glimmer, numbers verified), the next opponent is the boss, and XP, streaks and badges follow.
// The game state lives in this browser; the club only sees what the player shares.
const coachOf = (id) => COACHES.find((c) => c.id === id);
// a quest's area, shown as an icon and a name
const AREA_IC = { tactics: "goals", technique: "match", fitness: "heart", analyst: "table" };
const AREA_NAME = { tactics: "Tactics", technique: "Technique", fitness: "Fitness", analyst: "Your data" };
const initials = (name) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const first = (name) => name.split(" ")[0];
const hurt = (texts) => texts.some((t) => /knee|ankle|膝|腳踝/i.test(t) && /sore|pain|hurt|injur|avoid jump|痛|痠|傷/i.test(t));
const share = (text) => ({ wa: `https://wa.me/?text=${encodeURIComponent(text)}`, threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}` });

function Member({ m, size = 36 }) {
  return <span className={`mav ${m.id === "you" ? "you" : ""}`} style={{ width: size, height: size }} aria-hidden="true">{m.id === "you" ? "You" : initials(m.name)}</span>;
}
function ShareLinks({ text }) {
  const l = share(text);
  return (
    <span className="share-links">
      <a className="chip" href={l.wa} target="_blank" rel="noopener noreferrer"><Icon name="share" size={14} />WhatsApp</a>
      <a className="chip" href={l.threads} target="_blank" rel="noopener noreferrer"><Icon name="share" size={14} />Threads</a>
    </span>
  );
}

export default function Club({ data, view = "feed" }) {
  const tasks = useTasks();
  const [club, setClub] = useState(null);
  const [g, setG] = useState(() => ({ shares: { goals: true, progress: true, highlights: false, limits: true }, progress: {}, activity: [], cheers: {}, mine: [], joined: {}, ...readGame() }));
  const tabOf = () => new URLSearchParams(location.hash.split("?")[1] || "").get("tab") || "feed";
  const [tab, setTab] = useState(tabOf);
  const [hash, setHash] = useState(location.hash); // a new ask (#/club?tab=challenges&spin=1&fmt=doubles) starts the draw again
  useEffect(() => { const on = () => { setTab(tabOf()); setHash(location.hash); }; addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  const [all, setAll] = useState({ feed: false });
  const [post, setPost] = useState("");
  const [err, setErr] = useState({});
  useEffect(() => { fetch("/data/club.json").then((r) => r.json()).then(setClub).catch(() => setErr((e) => ({ ...e, club: "The club data could not be loaded." }))); }, []);
  useEffect(() => saveGame(g), [g]);
  // an agent task (quests, club night, a booked game) or a share elsewhere changed the game: take it in
  useEffect(() => { const on = () => setG((s) => ({ ...s, ...readGame() })); addEventListener("shuttlecoach:game", on); return () => removeEventListener("shuttlecoach:game", on); }, []);
  const wk = isoWeek();
  const mem = memory.all().map((m) => m.text);
  const limited = hurt(mem);
  const you = useMemo(() => (data ? playerOf(data) : null), [data]);

  // you: from the analysed match and your memory
  const me = useMemo(() => {
    if (!data) return null;
    const t = tactics(data.outcomes, "A");
    const net = t.errReasons.find(([k]) => k === "net")?.[1] ?? 0;
    return { id: "you", name: "You", level: "B", weak: t.weak[0][0], weakN: t.weak[0][1], conceded: t.conceded, net };
  }, [data]);

  const q = g.quests?.week === wk ? g.quests.data : null;
  const night = g.night?.week === wk ? g.night.data : null; // this week's club night plan, kept with the game
  const qTask = tasks.find((t) => t.kind === "quests" && t.state === "running");
  const nTask = tasks.find((t) => t.kind === "night" && t.state === "running");
  const prog = (id) => g.progress[`${wk}:${id}`] || 0;
  const earned = (x) => { const n = Math.min(x.target, prog(x.id)); return 15 * n + (n >= x.target ? 20 : 0); };
  const rest = g.activity.filter((a) => a.week === wk && a.kind === "rest").length;
  const games = g.activity.filter((a) => a.week === wk && a.kind === "game").length; // games booked through Play
  const weekXp = (q ? q.quests.reduce((a, x) => a + earned(x), 0) : 0) + 10 * rest + 30 * games;
  const totalXp = (g.banked || 0) + weekXp;
  const levels = club?.levels ?? [0, 100, 250, 450, 700, 1000, 1400];
  const level = levels.filter((t) => totalXp >= t).length, next = levels[level], prev = levels[level - 1] ?? 0;
  const days = [...new Set(g.activity.map((a) => a.date))].sort().reverse();
  let streak = 0;
  for (let d = new Date(); days.includes(d.toISOString().slice(0, 10)); d.setDate(d.getDate() - 1)) streak++;
  const done = (x) => prog(x.id) >= x.target;
  const damage = q ? q.quests.reduce((a, x) => a + earned(x), 0) : 0;
  const hp = q ? Math.max(0, q.boss.hp - damage) : 0;
  const res = g.arena?.results || [];
  const rivals = Object.values(res.flatMap((x) => x.vs).reduce((a, id) => ({ ...a, [id]: (a[id] || 0) + 1 }), {}));
  const myBadges = [q?.quests.some(done) && "first-quest", streak >= 5 && "streak-5", q && hp === 0 && "boss-slayer", limited && rest > 0 && "iron-knee",
    res.some((x) => x.won) && "first-win", res.some((x) => x.won && x.gap >= 100) && "giant-killer", rivals.some((n) => n >= 3) && "rival"].filter(Boolean);

  const log = (x) => setG((s) => {
    const k = `${wk}:${x.id}`, n = (s.progress[k] || 0) + 1, finished = n === x.target;
    return { ...s, progress: { ...s.progress, [k]: n }, activity: [...s.activity, { date: today(), week: wk, kind: "quest", id: x.id }],
      mine: finished ? [{ id: `q-${k}`, who: "you", kind: "quest", text: `Finished the quest “${x.title}”.`, at: Date.now() }, ...s.mine] : s.mine };
  });
  const logRest = () => setG((s) => ({ ...s, activity: [...s.activity, { date: today(), week: wk, kind: "rest" }] }));
  const planNight = () => startNight({ name: "You", weak: me.weak, net: [me.net, me.net], limit: g.shares.limits && limited ? "no jump landings" : null, sessions: days.length });

  if (!club || !me) return <div className="page"><p className="muted">{err.club || "Opening the club…"}</p></div>;
  const members = [{ ...me, xp: weekXp, badges: myBadges, net: g.shares.progress ? [me.net, null] : null, limit: limited ? "no jump landings" : null, shares: { ...g.shares } }, ...club.members];
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const lvl = (xp) => levels.filter((t) => xp >= t).length;
  const drop = (m) => (m.net && m.net[1] != null ? (m.net[0] - m.net[1]) / m.net[0] : null);
  // the club rating: the demo table plus every result you report (club/arena.js)
  const r = ratings(club, res), rec = records(club, res);
  const table = [...members].sort((a, b) => r[b.id] - r[a.id]), myRank = table.findIndex((m) => m.id === "you") + 1;
  const challenge = (m) => go(`play?task=${startPlay(`Challenge ${first(m.name)} to a singles match this week`, you)}`);
  const standing = <Standing me={members[0]} r={r} rec={rec} rank={myRank} of={table.length} ahead={table[myRank - 2]} />;
  const feeders = club.members.filter((m) => m.strength?.zone === me.weak);
  const feed = [...g.mine.map((f) => ({ ...f, ago: f.at ? agoOf(f.at) : "today" })), ...club.feed];
  const cheer = (id) => setG((s) => ({ ...s, cheers: { ...s.cheers, [id]: !s.cheers[id] } }));
  const toggle = (k) => setG((s) => ({ ...s, shares: { ...s.shares, [k]: !s.shares[k] } }));
  const join = (f) => { setG((s) => ({ ...s, joined: { ...s.joined, [f.id]: true } })); postToClub({ kind: "game", text: `Joined ${first(byId[f.who].name)}'s game: ${f.open.day} ${f.open.start} at ${f.open.venue}.` }); };
  const send = (e) => { e.preventDefault(); const t = post.trim(); if (!t) return; postToClub({ kind: "note", text: t }); setPost(""); };

  const readout = (
    <dl className="readout club-me" aria-label="Your progress">
      <div><dt>Level</dt><dd>{level}</dd><span className="xpbar" aria-hidden="true"><i style={{ transform: `scaleX(${next ? (totalXp - prev) / (next - prev) : 1})` }} /></span><small>{next ? `${next - totalXp} XP to level ${level + 1}` : "top level"}</small></div>
      <div><dt>XP this week</dt><dd>{weekXp}</dd><small>{totalXp} in total</small></div>
      <div><dt>Streak</dt><dd>{streak} {streak === 1 ? "day" : "days"}</dd><small>recovery days count{games ? ` · ${games} game${games > 1 ? "s" : ""} booked` : ""}</small></div>
      <div><dt>Badges</dt><dd>{myBadges.length}</dd><small>{myBadges.map((b) => club.badges[b]?.name).join(", ") || "finish a quest for your first"}</small></div>
    </dl>
  );

  if (view === "goals") return (
    <div className="page club goals">
      <header className="report-head">
        <div>
          <h1 className="h1">Goals</h1>
          <p className="muted">Your agent turns your match into quests. Your next opponent is the boss.</p>
        </div>
        <div className="cta-row">
          <a className="btn ghost" href="#/autopilot"><Icon name="spark" size={18} />Plan my week</a>
        </div>
      </header>
      {readout}
      <div className="club-top">
        <section className="panel quests" aria-labelledby="q-h">
          <header className="club-h"><h2 id="q-h" className="panel-h">This week's quests</h2>
            {q && <span className="tiny muted">{q.source === "model" ? "Written by Muse Glimmer from your match and memory · every number checked" : "Some quests use the rule-based set"}{q.limited ? " · knee-friendly: no jumps" : ""}</span>}</header>
          {qTask && <TaskCard t={qTask} steps={6} />}
          {!q && !qTask && (
            <div className="club-empty">
              <p>Your agent turns your match into four quests, one per area (tactics, technique, fitness, your data), each countering your next opponent. Muse Glimmer writes them and code checks every number; about half a minute.</p>
              <button className="btn primary" onClick={() => startQuests(mem)}>Get this week's quests</button>
            </div>
          )}
          {q && (
            <ul className="quest-list">
              {q.quests.map((x) => {
                const c = coachOf(x.coach), n = prog(x.id), fin = n >= x.target;
                return (
                  <li key={x.id} className={`quest ${fin ? "done" : ""}`} style={{ "--cc": c.color }}>
                    <span className="quest-ic" aria-hidden="true"><Icon name={AREA_IC[x.coach] || "goals"} size={22} /></span>
                    <div className="quest-body">
                      <b>{x.title}</b>
                      <p>{x.task}</p>
                      <span className="tiny muted">{AREA_NAME[x.coach] || "Quest"} · {x.why}</span>
                      <div className="quest-row">
                        <span className="pips" aria-label={`${Math.min(n, x.target)} of ${x.target} ${x.unit} logged`}>{Array.from({ length: x.target }, (_, k) => <i key={k} className={k < n ? "on" : ""} />)}</span>
                        <span className="tiny">{Math.min(n, x.target)} / {x.target} {x.unit} · {x.xp} XP</span>
                        {fin ? <span className="quest-cheer">✓ {x.cheer}</span> : <button className="btn ghost sm" onClick={() => log(x)}>+ Log {x.unit === "sets" ? "a set" : "a session"}</button>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {q && (
            <div className="quest-foot">
              <button className="btn ghost sm" onClick={logRest}>Log a recovery day (+10 XP)</button>
              <button className="link" onClick={() => startQuests(mem)} disabled={!!qTask}>New quests</button>
              <span className="tiny muted">Rest days count toward your streak. The coaches never reward training through pain.</span>
            </div>
          )}
        </section>

        <section className="panel boss" aria-labelledby="b-h">
          <header className="club-h"><h2 id="b-h" className="panel-h">Boss: your next opponent</h2></header>
          {q ? (
            <>
              <div className="boss-head">
                <span className="mav boss-av" aria-hidden="true">{initials(q.boss.name)}</span>
                <div><b>{q.boss.name}</b><span className="tiny muted">{hp === 0 ? "Defeated in training. Now beat him on court." : `${hp} of ${q.boss.hp} HP left`}</span></div>
              </div>
              <span className="hpbar" role="meter" aria-valuemin={0} aria-valuemax={q.boss.hp} aria-valuenow={hp} aria-label="Boss health"><i style={{ transform: `scaleX(${hp / q.boss.hp})` }} /></span>
              <ul className="boss-moves">
                {q.boss.moves.map((mv) => {
                  const x = q.quests.find((y) => y.counters === mv.id), fin = x && done(x);
                  return <li key={mv.id} className={fin ? "countered" : ""}><b>{fin ? "✓ " : ""}{mv.name}</b><span className="tiny muted">{mv.text} [{mv.fact}]</span>{x && <span className="tiny">Countered by {x.coachName}: {x.title}</span>}</li>;
                })}
              </ul>
              <a className="btn ghost sm" href={`#/play?q=${encodeURIComponent(`Spar with someone who plays like ${q.boss.name}`)}`}>Spar with someone who plays like {q.boss.name.split(" ")[0]}</a>
              <p className="tiny muted">Every quest you log takes health off the boss. Your next recorded match re-measures these patterns for real.</p>
            </>
          ) : <p className="muted small">Get this week's quests to meet the boss. Each of their moves is a pattern that cost you points in your last match.</p>}
        </section>
      </div>
    </div>
  );

  return (
    <div className="page club feedview">
      <header className="report-head">
        <div>
          <span className="tag">{members.length} members · demo club</span>
          <h1 className="h1">{club.name}</h1>
          <p className="muted">Challenge anyone, climb the club table, and get credit for effort and improvement too. {club.note}</p>
        </div>
        <div className="cta-row">
          <a className="btn primary" href="#/play"><Icon name="book" size={18} />Find a game</a>
          <button className="btn ghost" onClick={planNight} disabled={!!nTask}><Icon name="table" size={18} />Plan club night</button>
        </div>
      </header>

      <nav className="club-tabs" aria-label="Club">
        {[["feed", "Feed"], ["ranks", "Leaderboard"], ["challenges", "Challenges"]].map(([k, l]) => <a key={k} href={k === "feed" ? "#/club" : `#/club?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{l}</a>)}
      </nav>
      {tab === "ranks" && <>{standing}<Rankings club={club} members={members} r={r} rec={rec} drop={drop} levelOf={(m) => lvl(m.id === "you" ? totalXp : m.xp)} onChallenge={challenge} /></>}
      {tab === "challenges" && <>{standing}<Challenges key={hash} club={club} members={members} r={r} rec={rec} g={g} you={you} me={members[0]} /></>}
      {tab === "feed" && <div className="club-grid">
        <div className="club-feed">
          <form className="post-box" onSubmit={send}>
            <span className="mav you" aria-hidden="true">You</span>
            <label htmlFor="post" className="sr-only">Share with the club</label>
            <input id="post" value={post} onChange={(e) => setPost(e.target.value)} placeholder="Share something with the club" />
            <button className="btn primary sm" disabled={!post.trim()}>Post</button>
          </form>
          <ul className="feed threads">
            {(all.feed ? feed : feed.slice(0, 6)).map((f) => {
              const m = byId[f.who], c = f.coach && coachOf(f.coach), on = !!g.cheers[f.id], joined = !!g.joined?.[f.id];
              return (
                <li key={f.id} className={f.open ? "open-game" : ""}>
                  <div className="th-av">{m && <Member m={m} size={40} />}{f.reply && <i className="th-line" aria-hidden="true" />}</div>
                  <div className="th-body">
                    <p className="feed-who"><b>{m?.name ?? "Member"}</b><span className="tiny muted">{f.ago}</span></p>
                    <p className="th-text">{f.text}</p>
                    {f.open && (
                      <div className="open-card">
                        <Icon name="book" size={18} />
                        <span><b>{f.open.challenge ? "Open to a challenge" : `${f.open.spots} spot left`}</b><span className="tiny muted">{f.open.day} {f.open.start} · {f.open.venue}</span></span>
                        {f.open.challenge && f.who === "you" ? <span className="task-state">On the board</span>
                          : f.open.challenge
                          ? <button className="btn primary sm" onClick={() => go(`play?task=${startPlay(`Challenge ${first(m.name)} to a singles match this weekend`, you)}`)}>Challenge {first(m.name)}</button>
                          : joined ? <span className="task-state done">You're in</span> : <button className="btn primary sm" onClick={() => join(f)}>Join</button>}
                      </div>
                    )}
                    {f.reply && c && <p className="feed-reply" style={{ "--cc": c.color }}><Avatar coach={c} size={24} /> <span><b>{c.name}</b> {f.reply}</span></p>}
                    <span className="feed-meta">
                      <button className={`chip react ${on ? "on" : ""}`} aria-pressed={on} aria-label={`Cheer, ${(f.cheers || 0) + (on ? 1 : 0)}`} onClick={() => cheer(f.id)}><Icon name="heart" size={16} />{(f.cheers || 0) + (on ? 1 : 0)}</button>
                      <ShareLinks text={`${m?.name ?? "A member"} at ${club.name}: ${f.text} (Serve)`} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {feed.length > 6 && <button className="link" onClick={() => setAll((a) => ({ ...a, feed: !a.feed }))}>{all.feed ? "Show fewer" : `Show ${feed.length - 6} more`}</button>}
        </div>

        <aside className="club-side">
          <section className="panel" aria-labelledby="l-h">
            <header className="club-h"><h2 id="l-h" className="panel-h">Top of the table</h2><a className="link" href="#/club?tab=ranks">Leaderboard</a></header>
            <ol className="league-list">
              {table.filter((m, i) => i < 5 || m.id === "you").map((m) => (
                <li key={m.id} className={m.id === "you" ? "me" : ""}>
                  <span className="mono rk">{table.indexOf(m) + 1}</span><Member m={m} size={32} />
                  <span className="lg-who"><b>{m.id === "you" ? "You" : m.name}</b><span className="tiny muted">{rec[m.id].w}–{rec[m.id].l} · level {lvl(m.id === "you" ? totalXp : m.xp)}</span></span>
                  <span className="lg-num"><b className="mono">{r[m.id]}</b><small>rating</small></span>
                </li>
              ))}
            </ol>
            <a className="btn primary sm" href="#/club?tab=challenges&spin=1"><Icon name="spark" size={16} />Draw a random match</a>
          </section>

          <section className="panel" aria-labelledby="n-h">
            <header className="club-h">
              <h2 id="n-h" className="panel-h">Club night · {club.night.day} {club.night.start}</h2>
              {night && <ShareLinks text={`${club.name}, ${club.night.day} ${club.night.start}: ${night.plan.title}. ${night.plan.blocks.map((b) => `${b.minutes} min ${b.groups.map((x) => x.drill).join(" / ")}`).join("; ")}. Planned with Serve.`} />}
            </header>
            <p className="tiny muted">{club.night.courts} courts · {club.night.minutes} min · {members.length} players</p>
            {nTask && <TaskCard t={nTask} steps={3} />}
            {!night && !nTask && <><p className="muted small">Your agent plans one session for everyone: players who lose points in the same zone train together, the members whose attack lands there feed them, and shared health limits are respected.</p><button className="btn ghost sm" onClick={planNight}>Plan club night</button></>}
            {night && (
              <>
                <p className="tiny muted">{night.source === "model" ? `Every group written by Muse Glimmer, ${night.written} of ${night.total} checked` : night.source === "mixed" ? `Muse Glimmer wrote ${night.written} of ${night.total} groups; the rest use the rule-based text` : "Rule-based plan: the model's text did not pass the checks"} · groups set by code so every player is busy in every block{night.timing ? ` · ${night.timing.seconds} s` : ""}</p>
                <ol className="night">
                  {night.plan.blocks.map((b, i) => {
                    const start = night.plan.blocks.slice(0, i).reduce((a, x) => a + x.minutes, 0), [h, mi] = club.night.start.split(":").map(Number);
                    const t = (mm) => { const x = h * 60 + mi + mm; return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`; };
                    return (
                      <li key={i} className="night-block">
                        <span className="night-time mono">{t(start)}<br /><small>{b.minutes} min</small></span>
                        <div className="night-groups">
                          {b.groups.map((x, k) => (
                            <div key={k} className={`night-group ${x.court === "all" ? "all" : ""} ${x.who.includes("you") ? "mine" : ""}`}>
                              <span className="tiny muted">{x.court === "all" ? "All courts" : `Court ${x.court}`}</span>
                              <b>{x.drill}</b>
                              <span className="tiny muted">{x.why}</span>
                              <span className="night-who">{x.who.map((id) => <span key={id} className={`chip-mini ${id === "you" ? "you" : ""}`}>{id === "you" ? "You" : first(byId[id]?.name ?? id)}</span>)}</span>
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="p-h">
            <h2 id="p-h" className="panel-h">Practice partners for you</h2>
            <p className="muted small">You lose most points in the {me.weak} ({me.weakN} of {me.conceded} winners conceded). Train against the shot that beats you:</p>
            <ul className="partners">
              {feeders.map((m) => (
                <li key={m.id}><Member m={m} /><span><b>{m.name}</b><span className="tiny muted">{m.strength.shot} to the {m.strength.zone} · level {m.level}</span></span>
                  <button className="btn ghost sm" onClick={() => go(`play?task=${startPlay(`Practice with ${first(m.name)} this week`, you)}`)}>Play</button></li>
              ))}
              {!feeders.length && <li className="muted">Nobody in the club attacks that zone yet.</li>}
            </ul>
          </section>

          <section className="panel" aria-labelledby="s-h">
            <h2 id="s-h" className="panel-h">What the club sees</h2>
            <ul className="privacy-list">
              {[["goals", "Your goals and quests"], ["progress", "Your progress numbers"], ["highlights", "Your highlight reels"], ["limits", "Health limits, as “avoids jumps” only"]].map(([k, l]) => (
                <li key={k}><label><input type="checkbox" checked={!!g.shares[k]} onChange={() => toggle(k)} />{l}</label></li>
              ))}
            </ul>
            <p className="tiny muted">Never shared: match footage, your chats with your agent, your memory, where you live or what an injury is. {limited && !g.shares.limits ? "With health limits off, the club night plan will not know to keep you off jumps." : ""}</p>
          </section>
        </aside>
      </div>}
    </div>
  );
}
function agoOf(t) { const s = (Date.now() - t) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`; }
