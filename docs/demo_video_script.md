# ShuttleCoach: Meta hackathon demo video script (3:00)

Meta Global AI Developer Hackathon 2026 · Indie Developer track · Build for Your World

Demo is 25% of the score ("a working, impressive demo ... and the quality of the demo video"), and Use of Meta AI
Tooling is another 25%. So the video shows Muse Glimmer working live, not just a mention of it. Narration is in
English, about 140 words per minute.

## Before recording

- Start the GPU server side (`~/shuttlecoach-meta/up.sh` on the server). Check that coach chat answers in a few seconds.
- Clear the agent's earlier jobs (Agent page, Done, Clear), so the home starts empty.
- Run the site with `npm --prefix web run dev` and open http://127.0.0.1:5191. Set the
  browser to 1920×1080 at 100% zoom.
- **Footage rights:** the rules require the submission to be your own work and not infringe anyone's rights. Record
  your own club rally and use it instead of the broadcast sample. Do not show broadcast footage in the video.
- Hide the bookmarks bar and notifications. Record at 30 fps, record the narration separately, and lay it under.
- A Glimmer reply takes about 20–25 s. Keep the wait in the recording, then speed it up or cut it in the edit and
  leave the on-screen counter visible for a second, so it is clear the answer is generated live.

## Shot list and narration

| Time | Screen (what to do) | Narration | On-screen caption |
|---|---|---|---|
| 0:00–0:08 | Agent home. Type "Challenge Kenji to a singles match this week" and press Enter. | Most games never happen because booking a court and lining up a friend is a chore. With ShuttleCoach you just say it. | Say you want to play |
| 0:08–0:20 | The Play view opens. Muse Glimmer reads the request; the map opens with the venues and both home areas; the courts light up; the week appears with the slots you are both free. | Muse Glimmer reads the request. The agent opens the map, checks every court, and lays both calendars side by side. | The map, the courts, both calendars |
| 0:20–0:30 | The routes draw to Midtown with the minutes on them; the trail says "the fairest venue". Press Send the challenge, confirm, and Kenji's answer comes in. | It picks the venue in the middle, 17 minutes for me and 12 for Kenji, writes the challenge, and checks every time and price before anything is booked. | The venue in the middle |
| 0:30–0:38 | Open Rally 3D. Play the rally and orbit the 3D court. Click the smash in the stroke strip. | One ordinary camera goes in. Out comes the shuttle's flight in metric 3D, every hit, and both players' positions. This smash left the racket at about 200 kilometres an hour, estimated from the 3D track. | One camera → 3D flight |
| 0:38–0:55 | Coaches inbox, then Coach Lin. Let the briefing play while the heat zones flash. | Four coach agents each own a slice of the match and a visual. Lin, the tactics coach, flashes the zones that cost points: seven of the 24 winners conceded landed in the rear forehand. | Each coach explains on its own visual |
| 0:55–1:30 | On Coach Ren's page, type "My right knee is sore, what should I train this week?" and tick "Remember this". Wait for the reply. Point at "✓ figures verified" and the timing. | Every coach is Muse Glimmer, Meta's open-weights model, running on one RTX 3090 that I own. It answers from the measured facts only. A verifier checks every number against the fact it cites before the reply is shown, and Ren adapts the plan to the knee. | Muse Glimmer · on my own GPU · every number verified |
| 1:30–2:00 | Round table. Show the conflict between Ren and Lin, then the head coach's ruling, the four goals and the 7-day plan. Click "Send to Messenger". | Then the whole staff meets. Lin wants smash-defence drills; Ren says the knee rules out jumps. The head coach settles it by a fixed rule: health first, then the points at stake. The result is four goals with one owner each, and a week of training that goes straight to the player's phone. | Health first, then points at stake |
| 2:00–2:20 | Goals: ask for the quests and show the agent's steps, including what the verifier sent back; log one and watch the boss lose health. Then the Club feed: Join an open game, and show the club night plan. | Training is a game played with your club. Each coach gives a quest, and your next opponent is the boss. The head coach plans club night for twelve players at once, so nobody waits for a court. | Quests · boss · club league |
| 2:20–2:35 | Lab. Point at Coach Ren's playbook v6: a rule learned from a paper [E28], then the change waiting because it touches health. Press Approve. | The coaches improve themselves. A research agent reads sports science, and every night each coach proposes changes to its own playbook. A change is adopted only if it cites a finding, passes the safety rules and does not make the coach worse on its test questions. Anything about health waits for me. | Coach agents that improve themselves, safely |
| (2:20–2:35, alternative) | *(SAM 3.1, once it ships)* Analyze page: drop in your own video and show the player masks and the court found automatically. | SAM 3.1 finds and tracks both players from a text prompt, and calibrates the court on its own, so your own videos become analysable. | SAM 3.1 · players and court from a text prompt |
| 2:35–2:50 | Live mode on a tablet: the score on the video, the brief under it, the countdown, "Next serve". | Courtside, the live view gives you one brief to read in the 20 seconds before the next serve. | Built for the 20 seconds between points |
| 2:50–3:00 | Back to the agent home, with the game in Up next. | ShuttleCoach: say you want to play, and your agent and your coaching staff do the rest, on hardware you own. | ShuttleCoach · Meta Global AI Developer Hackathon |

Use the Lab segment at 2:20–2:35. If SAM 3.1 ships, take 10 seconds from the round table for it.

## The produced video (2:40)

`video/ShuttleCoach_Meta_demo.mp4` (1080p, about 33 MB), `video/ShuttleCoach_Meta_demo_small.mp4` (720p, for
phones), `video/ShuttleCoach_Meta_demo_no_voice.mp4` (for a voice-over of your own). The mp4 files are not in git;
rebuild them with the steps below.

Scenes, in order: the pain point ("we get lazy about training") with the Meta logo · the challenge to Kenji on the map
· the tasks · the coach agents and a checked answer · the round table · the 24-hour coach in Messenger (the end-to-end
test's real conversation) · the highlight reel (Sapiens2 and SAM 2.1, the smash in slow motion at real speed, the
Glimmer caption, Instagram and Facebook) · the coaches learning in Lab · the club · the end card.

0. **Highlight data.** On the GPU server, in `~/shuttlecoach-meta/pose`: `video/pose/candidates.py`, `detect.py`
   (YOLO, at 1280 px) and `people.py` (Sapiens2 and SAM 2.1). Then `video/pose/pack.py` writes
   `web/public/data/highlight_people.json`. Without it, the reel falls back to the top-down drawing.
1. **Record.** `node video/record.mjs` (it needs `puppeteer-core` and Chrome; set `PUPPETEER_FROM` to use another
   project's copy) records every scene from the running site (port 5191, gateway on the GPU
   server), at 1920×1080, in the light theme. It saves the moments that matter to `video/build/marks.json`, and the
   challenge's real result to `video/build/play_result.json`.
   - If a demo member declines the challenge, the scene is recorded again.
   - The Lab scene only points at the health change; it does not approve or decline it.
2. **Narration.** Edit `video/narration.json` so its numbers match `play_result.json`. A `{+3}` after a sentence
   holds three seconds of silence, for the slow-motion replay.
   - Then run `video/tts.py` on the GPU server with Kokoro (kokoro-onnx, with `kokoro-v1.0.onnx` and
     `voices-v1.0.bin`).
   - Copy `out/*` to `video/build/kokoro/`.
3. **Assemble.** `node video/assemble.mjs`.
   - It cuts each scene to its narration and burns in the subtitles.
   - It speeds up the model's waits, and the video says so on screen (for example "Muse Glimmer writing the
     challenge · 15× speed").

The video shows no broadcast footage. The 3D court, the heat maps, the anatomy model and the highlight reel (players
as their SAM 2.1 outlines with Sapiens2 skeletons) are drawn by the app.

## What the video must not claim

- An uploaded video is analysed live only once SAM 3.1 tracking ships. Until then, say "sample match".
- Speeds are **estimates** from the reconstructed 3D track ("about 200 kilometres an hour").
- The body map is a coaching heuristic, not a medical assessment.
- Coach briefings on the coach pages are templated from the match facts. The free chat is the live model.

## End card (3 s)

ShuttleCoach · [name] · [code URL]
