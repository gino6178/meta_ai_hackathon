# Serve: submission text

The long description for the submission form, in the order the judges score it: impact, Meta AI tooling, technical
depth, and the demo.

## Name

Serve

## One line

**Play more. Manage less.** A sports club app with an agent that gets you playing, in any ball sport.

## Track and theme

Indie Developer · Build for Your World

## Impact: the problem

31% of adults worldwide did not get enough physical activity in 2022 (World Health Organization, 2024). Most people
who stop playing a sport don't stop liking it. They stop organizing it:

- **Playing takes organizing.** A time that suits four people, a free court, somewhere everyone can reach. The group
  chat goes quiet and nobody plays.
- **Nobody pushes you.** One missed week becomes a month. Fitness apps count steps; none of them books the next game.
- **Life gets in the way.** A sore knee, a heavy week, rain on an outdoor court: the plan doesn't bend, so it's skipped.
- **Playing is better together**, and the best part is the people and showing it off afterwards.

Serve takes the organizing off the player and keeps pushing. It is for anyone who plays a ball sport for fun
(badminton, tennis, pickleball, table tennis, basketball, volleyball, soccer) and the clubs and friends they play with.

## What it does

**Autopilot.** "Line up my games this week." Muse Glimmer runs the week as a tool-using agent. It checks the week and
the body log, picks the times the player usually plays (habits learned from eight weeks of games), ranks the people
they play best with (games that ran past their booking mean the two clicked), and negotiates with those players'
agents, all three at once for doubles. A counter-offer is checked by code against every calendar and the court
timetable; when agents disagree, the agent moves to the time most of them asked for. It asks once, in the app or
with buttons in Messenger, and books on a tap. On Monday mornings it runs by itself for players who switched it on.

**Body log and health app.** "My right knee is sore after jumping, 3 out of 5." Muse Glimmer files it with one tool
call (part, side, level, what set it off) and it appears on a 3D body, on the side that hurts. The player can share
their health app's export (Apple Health, Google Fit, or a GPX, TCX or CSV file from any app), read on their own
server and deleted. Workouts are linked to booked games, so a game the watch says ran 132 minutes teaches the
Autopilot who the player clicks with. Code then works out the load (minutes × effort, this week against the last four)
and what to do: doubles first and no jump sports while a knee is sore, shorter games for a sore back, one game fewer
in a week over 1.5 times the usual, a check-in two days later, and a note that it is worth seeing a physio when the
same part keeps coming back. The page shows the activity trail (weeks by sport, every session, GPS routes) and a body
report whose summary Muse Glimmer writes with every number checked. It records and plans; it never diagnoses.

**Courts near you, any sport.** "Basketball courts near me tonight." Public courts, sports centres and parks come from
OpenStreetMap, with their Google Maps rating and reviews (when the server has a key), and the forecast for that hour
from Open-Meteo. Muse Glimmer judges each place, four at once: hoops or nets, lights for an evening game, a roof if
rain is likely, crowds, something broken or locked. Every reason cites the map, a review or the weather, and a quoted
review must be in that review word for word. The Autopilot uses it to put a basketball game on a free public court.

**Highlights.** Film a game on a phone, in any ball sport. On the player's own server, DETR finds them, Sapiens2 reads
their pose and SAM 2.1 cuts them out; the reel finds the moment (a racket's fastest swing, the top of a jump, a kick)
and replays it in slow motion with the player lit up. Muse Glimmer writes the caption, checked against the rallies,
and the share sheet sends it to Instagram or Facebook.

**The club.** A feed, a leaderboard (Elo) that every reported challenge moves, challenges, a random match drawn fairly
from members who are free, and the best match: fair by rating, free when the player is, good for their weak zone, and
agreed agent to agent.

**In Messenger.** The same agent in the player's chats: plan the week, approve with a tap, a reminder an hour before,
a check-in after, what hurts, a health export shared into the chat, courts near a place, the body report.

## Meta AI tooling

| Meta model or product | Where it runs | What it does in Serve |
|---|---|---|
| **Muse Glimmer** (open weights) | Our GPU server: Ollama on one RTX 3090, 4 requests in parallel | Every agent: the Autopilot's tool loop (native tool calling); every agent-to-agent message, with each member's agent answering in parallel; reading what hurts into the body log; judging courts from map tags, reviews and the forecast; place names in English; the body report; highlight captions; play requests; answers about your game, every number checked |
| **Sapiens2** (pose, 0.4B) | Our GPU server, Hugging Face Transformers | Every player's pose on every highlight frame; the reel's moment |
| **SAM 2.1** (Hiera-L) | Our GPU server, Hugging Face Transformers | Each player's outline, for the spotlight and the drawn view |
| **DETR** (ResNet-50) | Our GPU server, Hugging Face Transformers | Finds the player in their own video |
| **Messenger Platform** | Signed webhook, Send API, quick replies | The agent in the player's chats |
| **Instagram, Facebook** | The share sheet | The reel and its caption |

How it goes beyond a basic integration:

- **An agent, not a chatbot.** Muse Glimmer picks each tool; code runs it with checked arguments and hands back the
  facts; a refused call comes back as a fact and the model re-plans. A step budget, and rules finish the plan if the
  model stalls; the trail shows which steps the model decided.
- **Many agents at once.** For doubles, three members' agents answer at the same time on four parallel slots of one GPU.
- **Checked before anyone sees it.** Every number in model text must be in its facts; a quoted review must be in that
  review; the days and times in a summary must be an agreed game's; no he or she, no diagnosis. A draft that fails is
  redrafted, then replaced by rules.
- **Open weights on our own hardware.** Video, body log and health data never go to a cloud model.

## Technical depth

![Architecture](architecture.png)

- One Node.js gateway on the GPU server runs every agent and streams each step to the app as NDJSON, so the player
  watches the agent work. Muse Glimmer runs on GPU 1; DETR, Sapiens2 and SAM 2.1 on GPU 0 (batched, bf16, about 0.3 s
  a frame).
- Health exports are read by a standard-library Python reader (Apple Health's XML streamed line by line, workout routes
  from the zip, Google Fit's TCX and daily CSV, any GPX, TCX or CSV) without extracting anything to disk.
- Places come from the Overpass API with retries across mirrors and a 30-day cache; route maps are drawn in the app
  from OpenStreetMap roads, rivers and parks, so they carry no labels in any language.
- **Measured on our server:** 8 of 8 weeks reached the goal; on average a week took 154 s, 16.6 Muse Glimmer calls and 8.1 tool calls, with up to 4 model calls at once. 3 tool calls were refused by code and re-planned around; rules finished the plan in 1 of 8 weeks (`submission/agent_eval.md`).
- A Messenger end-to-end test drives the real gateway against a fake Graph API: linking, the plan, the Autopilot with
  buttons, a tap that books, the reminder and check-in, a game that ran long, what hurts, a health export shared to the
  chat, the body check-in with buttons, the report, feedback and `/forget`.

## Demo data

The club, its members, venues, prices and free times are made up and labelled as a demo. The demo town sits on Taipei,
so courts and parks near the members are real places from OpenStreetMap. The sample health export is made up and
labelled as a sample; its runs follow a real riverside bikeway.

## What's next

- Muse Spark and SAM 3.1 through the Meta Model API (tracking in any uploaded video, blurring bystanders before
  sharing), and Muse Image share cards.
- Real venue booking adapters, and a phone shortcut that sends health data to the agent every day.

## Team

Indie Developer track, one member.

## Links

- Code: https://github.com/gino6178/meta_ai_hackathon
