# ShuttleCoach: submission text

Draft text for the Cerebral Valley submission form. Before submitting, check that the "Meta AI tooling" section
matches what is wired in on the day, because the judges will try the demo.

## Name

ShuttleCoach

## One line

A team of Muse Glimmer agents, laid out like a social app. Say you want to play, and your agent finds the time, the
court in the middle and the people. Five coach agents turn your match into quests and a weekly plan. All of it runs on
hardware you own.

## Track and theme

Indie Developer track · Build for Your World

## The problem

- **We get lazy about training.** Booking a court, finding people to play with and planning the week are exactly the
  chores we skip, so the agents do all of them.
- **Games that never happen.** Booking a court and lining up a time with friends is a chore, so club players play
  less than they want to.
- **No analyst.** Elite players have analysts, multi-camera tracking and full-time coaches. Club and school players
  have a phone video and a guess.
- **Footage that cannot go to the cloud.** Match video shows minors, and teams treat their tactics as confidential.

## What it does

### A team of agents on one open model

Every agent here is Muse Glimmer, on one GPU the player owns. Each one has its own tools, its own slice of the facts
and the player's memory, and its numbers are checked before they are shown.

- **Your agent** takes what you say and either does it itself (books a game) or hands it to the right coach agent. It
  asks all four coach agents when you want this week's quests.
- **Four coach agents and a head coach agent**:
  - Tactics, technique, fitness and data each own a slice of the match facts and a visual: heat zones, a 3D replay,
    a 3D muscle model, habit charts.
  - Each one retrieves the player's memory before it answers.
  - Each one messages the player in Facebook Messenger: a reminder before a session, a check-in in the evening.
  - They debate at the round table, and the head coach settles conflicts by a fixed rule.
- **A research agent** turns what the coaches need into literature searches. It keeps a finding only if every number
  in it is in the abstract.
- **Playbooks that improve, with guardrails.** Each coach agent proposes changes to its own playbook. A change is
  adopted only if all of these hold:
  - it cites a finding in the knowledge base;
  - it passes the safety rules;
  - it does not make the coach worse on its regression questions.

  Otherwise the player approves it, and any version can be rolled back.

### Coach agents that improve themselves, with guardrails

The coaching staff gets better on its own, and never in a way that could hurt the player.

1. **Research.** A research agent turns what the coaches need into literature searches: the player's weak zones,
   injuries in memory, and each coach's area. It keeps a finding only if every number in it is in the abstract.
2. **Reflection.** Each night, every coach agent reads player feedback, the replies the verifier rejected and the new
   findings in its area. It then proposes at most two changes to its own playbook.
3. **Gates.** A change is adopted on its own only if all of these hold:
   - it cites a real finding;
   - it passes the safety check (locked rules stay, and nothing pushes through pain);
   - it is not a repeat;
   - the coach does no worse on its regression questions, measured before and after.
4. **The player decides the rest.** A change that touches health, or makes a coach worse on its regression questions,
   waits for the player's approval in Lab. Every version is kept and can be rolled back.

What happened so far, from the running system:
- **Research.** 3 research runs found 199 papers. 31 were screened, 24 kept, and 62 findings went into the knowledge
  base.
- **Proposals.** The coaches made 22 playbook proposals:
  - 15 passed every gate and were adopted;
  - 3 were turned down, for example "it repeats rule T3c";
  - 2 wait for the player: one touches health, one made the coach worse on its test questions;
  - 2 were rolled back.
- **A change that made a coach better.** The head coach learned to add reactive initiation drills [E41], and its
  regression failures went from 1 to 0.

Full table: `submission/evolution_report.md`.

### Laid out like a social app

The app opens on your agent, the way Meta's Muse app does. You say what you want: "challenge Kenji to a singles match
this week", "get this week's quests", "how should I warm up?".

- **Tasks.** Every job is a card with its steps, streamed from the gateway as each one finishes. Jobs keep running
  while you move around the app, and the agent checks back when one needs you.
- **Five tabs.** Agent, Club (a feed), Play, Goals and You. The coaches are the inbox, and the round table is the
  group chat. Stories from the coaches and the club sit at the top of the agent home.
- **Light and dark.** The theme follows the system; video and 3D stay dark in both.

### Play: say you want to play, and the agent books it

1. **Reads the request.** Muse Glimmer turns "doubles on Thursday evening with Hana", "challenge Kenji" or
   "我週六早上想打球" into a structured search.
2. **Opens the map.** It shows the venues and each member's home area (an area, never an address). The map is drawn in
   the app, so it works offline and no map service sees anyone's area.
3. **Lines up everyone's calendar.** It lays everyone's free times side by side and finds the slots where all of them
   are free.
4. **Picks the venue in the middle.** For each venue with a free court, it works out every player's trip and picks the
   one where the longest trip is shortest. For example: Midtown, 17 minutes for you and 12 for Kenji. The routes and
   minutes are drawn on the map.
5. **Chooses partners** when you don't name them. It ranks members who are free on level, format and how far they
   live, and favours someone whose attack lands in the zone you lose most points in.
   - **Sparring.** Ask for "someone who plays like my next opponent" and it ranks members by how closely their shot
     mix matches the opponent's mix from your match. Example: Kenji, a 91% style match.
6. **Writes the invites.** Glimmer writes one invite per player, in your voice, with each player's own trip time. Every
   time and price is checked against the booking.
7. **Books only when you confirm.** It holds the court, sends the invites and follows the answers.
   - If someone can't make it, it invites the next best player.
   - Someone you named is never swapped for someone else. The agent offers the next time that suits you both instead.
8. **Game on.** You get a calendar file, a message for the group chat, a warm-up from Coach Ren and +30 XP in the club
   league.

### A coaching staff from one phone video

- **Reconstructs the rally.** From one fixed camera, it recovers the shuttle's flight in metric 3D, every hit, both
  players' positions, and launch speed, apex and landing for every shot.
- **Four coach agents and a head coach agent.** Each coach explains its findings on the visual it owns:
  - Tactics flashes the zones that cost points.
  - Technique grades every flight in 3D.
  - Fitness pulses the muscles to train on a 3D anatomy model.
  - Data profiles habits and patterns.

  Every coach can be questioned in free chat, in English or Chinese.
- **A round table.** The coaches debate the match against what they remember about the player.
  - Conflicts are settled by a fixed rule: health limits first, then points at stake, then one owner per goal.
  - The result is four measurable goals and a 7-day plan, sent to the player in Messenger.
- **Courtside.** A live view puts the score on the video, with one brief to read in the 20 seconds before the next
  serve.

### A 24-hour coach in your pocket, in Facebook Messenger

- **The week arrives in Messenger.** The round table's goals and 7-day plan are sent as a message.
- **A nudge before every session.** An hour before training, the coach reminds you, with a meal from what is in your
  kitchen.
- **A check-in after.** In the evening it asks how the session went, logs it and adjusts tomorrow.
- **Ask any coach, any time.** Questions go to the right coach agent, and 👍/👎 quick replies feed its nightly
  reflection.
- **Built on the Messenger Platform.** A signed webhook (`X-Hub-Signature-256`), the Send API, quick replies, replies
  split at 2,000 characters, and reminders sent with the confirmed-event-update tag. An end-to-end test drives the
  whole conversation through the webhook against Muse Glimmer: 17 of 17 checks pass.

### Auto highlights for Instagram and Facebook

Ask your agent for a reel ("make my highlight reel for Instagram") and it cuts one by itself.

1. **Picks the rallies.** The top five from the labels: outright winners, rally length, smash finishes and pressure
   points.
2. **Finds the people.** YOLO finds both players in every frame. Meta's **Sapiens2** reads each player's pose (body,
   feet and hands), and **SAM 2.1** cuts each one out of the frame.
3. **Replays the smash in slow motion.** The replay goes back to the player's smash. It ramps down to quarter speed
   while the camera pushes in on the smasher, holds on contact with a flash, then follows the shuttle to the floor.
4. **Needs no footage.** By default the reel is drawn from the data: the broadcast angle through the court
   homography, the players as their SAM 2.1 outlines with their Sapiens2 skeletons, and the shuttle from racket to
   racket. With footage, the replay dims the frame and spotlights the smasher's outline.
5. **Posts it.** Muse Glimmer writes the caption, and every number in it is checked against the rallies. On a phone,
   the share sheet sends the video straight to Instagram or Facebook. On a computer, the reel is saved, the caption
   copied and the site opened.

### The club: training as a game, played together

- **Coach quests.** Each coach gives a weekly quest that counters the next opponent, who is the boss.
  - Every logged quest takes health off the boss.
  - Streaks count recovery days.
  - Badges include "Iron knee", for keeping every health limit.
- **League.** It ranks effort and improvement, never talent.
- **Club night.** The head coach plans one session for all 12 members on 3 courts.
- **Feed.** Members post, coaches reply, and an open game can be joined or a challenge taken up from the feed. Posts
  can be shared to WhatsApp and Threads.
- **Privacy.** The player chooses what the club sees. Footage, chats, memory and where they live are never shared.

## Meta AI tooling

**Muse Glimmer** (open weights, Apache 2.0) is every agent: your agent, the five coach agents and the research agent.
It runs on one RTX 3090 in our own server, served by Ollama.

- **The agent loop.**
  - Glimmer reads the request into a structured intent and writes the words.
  - Code does what has to be exact: courts, calendars, travel times and the booking.
  - A verifier checks every time, price and count in what Glimmer wrote. A draft that fails is replaced by checked
    text.
  - Each step is streamed to the app as it finishes, so the player watches the agent work.
- **Hand-offs.** Your agent sends a question to the coach agent whose area it is, and the trail shows the hand-off.
- **Grounded coach agents.**
  - Each coach answers from a facts sheet computed from the match.
  - A verifier checks every number against the fact it cites. A reply that fails is sent back once, then replaced by
    the raw fact.
  - Measured: 18 of 18 test questions answered by the model with every number verified (115 numbers), 83% on the
    first try. Median reply 22 s on one RTX 3090. Full report: `submission/glimmer_eval.md`.
- **Self-improvement.** Glimmer powers the research agent and each coach agent's nightly reflection. Code gates every
  proposed change: a real citation, the safety rules, no repeats, and no regression on the coach's test questions.
  15 of 22 proposals passed; health changes wait for the player.
- **Quests and club night.** Glimmer writes them as JSON, and code checks targets, health limits and numbers. The app
  shows what the verifier sent back as a step.
- **Memory.** Glimmer extracts injuries, goals and schedule from chat into player memory. A sore knee then changes the
  plan, the quests and the format the agent books.
- **Highlight captions.** Glimmer writes the Instagram/Facebook caption as JSON, and code checks every number in it
  against the picked rallies; a caption that fails is written again once, then replaced by the template.
- **Sapiens2** (Meta, open, 0.4B pose model, through Hugging Face Transformers on our server). It reads both players'
  pose on every highlight frame: the skeletons in the drawn reel, the racket hand the shuttle leaves from, and where
  the replay camera aims.
- **SAM 2.1** (Meta, open, Hiera-L). From each player's box it cuts the player out: the silhouettes in the drawn reel,
  and the spotlight on the smasher in the footage replay.
- **Muse Spark.** The gateway speaks OpenAI-compatible chat completions too, so it switches to Muse Spark on the Meta
  Model API by setting three environment variables.
- **SAM 3.1** *(planned; access requested)*: text-prompted segmentation and tracking of both players, so any uploaded
  video becomes analysable, with automatic court calibration and bystander blurring before sharing.

Meta platforms: **Facebook Messenger** (the 24-hour coach, Messenger Platform), and **Instagram** and **Facebook**
(highlight reels, through the share sheet).

## How it is built

- **Web app.** React 19, Three.js and Vite. It works for a coach on a laptop, courtside on a tablet and a player on a
  phone.
- **Agent gateway.** Node. It streams job steps as NDJSON and talks to Muse Glimmer through Ollama's native chat API.
  The same code runs against any OpenAI-compatible server or the Meta Model API.
- **Perception.**
  - TrackNetV5 (public code) for 2D shuttle tracking.
  - 3D lifting, hit detection and court homography.
  - For the highlights: YOLO11 pose finds the players (at 1280 px, so the far player is found in 92–100% of frames);
    Sapiens2 and SAM 2.1 read them, every second frame and every frame around the smash.
- **Speech.** Whisper tiny runs in the browser, so voice questions never leave the device.
- **Where it runs.** Everything except optional Meta Model API calls runs on the user's own machine and GPU server.

## Who it is for

Club and school players and their coaches, a club's organiser, and parents who film matches on a phone.

## What's next

- **Real venues.** A venue adapter takes the same two calls the demo venues answer. Venues that already take bookings
  on WhatsApp with Meta's Business Agent could be booked agent to agent.
- **Real calendars.** Import from a calendar file, and invites that land in the partners' own agents.
- **SAM 3.1** on every uploaded video, then pose on every rally for joint-load warnings.
- **Spoken briefs.** The live view runs from a courtside camera, with Glimmer speaking each brief.

## Demo data

The club members, venues, free slots and home areas are made up for the demo, and invite answers are simulated. The
sample match is a professional rally used for development only. The demo video uses our own footage.

## Team

[names, one Representative]

## Links

- Demo video: [URL]
- Code: [URL]
