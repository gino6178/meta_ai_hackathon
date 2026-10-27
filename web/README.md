# ShuttleCoach

A private badminton coaching staff. One phone video goes in. Out come the shuttle's 3D flight, shot speeds, heat zones,
coaching advice and a training plan. The coaches are **Muse Glimmer**, Meta's open-weights model, running on a GPU
you own, so match footage and player memory never leave your hardware.

Meta Global AI Developer Hackathon 2026 · theme: Build for Your World

This repository holds the **web app**. The coach gateway is in `../agent`, and the server start script is in `../server`.

## Meta models

| Model | Where it runs | What it does here |
|---|---|---|
| Muse Glimmer (open weights, 30B, Q4) | Our GPU server, Ollama on one RTX 3090 | All five coaches: free chat on every coach page, the Messenger coaches, and memory extraction |
| Muse Spark (Meta Model API) | Optional, set `LLM_URL` / `MODEL_API_KEY` | Drop-in for the coaches when a cloud model is acceptable |
| SAM 3.1 (open weights) | Planned, same GPU server | Player segmentation and tracking for uploaded videos, automatic court calibration, highlight cutouts, blurring bystanders before sharing |

Every number a coach states is checked against the match facts sheet before it is shown. A reply that cites a figure
not in the cited fact is rewritten, or replaced by the raw fact.

## What the app does

| Page | Content |
|---|---|
| Overview | Landing page with a live 3D replay of a reconstructed rally |
| Analyze | Drop in a match video. The browser opens it locally; nothing is uploaded. Court calibration opens once a file is chosen |
| Coaches | Four coaches, each with the visual it owns. Tactics flashes the zones that cost points. Technique replays and grades every flight in 3D. Fitness pulses the muscles to train on a 3D anatomy model. Data profiles habits and patterns. Every coach page has a chat on Muse Glimmer, and "Remember this" saves a message to player memory |
| Round table | The four coaches and a head coach debate the match. Conflicts follow a fixed rule: health limits from memory first, then points at stake, one owner per goal. The result is four measurable goals and a 7-day plan, printable and sent to players in Messenger |
| Match | What decided the match, score flow, points won and lost, shot sequences, rallies with frame annotation, an auto-cut highlight reel exported as video in the browser, footwork reads, a fatigue and injury-risk watch list, and comparison across matches. Rally 3D and the scouting report are sub-pages |
| Live | A full-screen courtside view. The score is on the video, the between-point brief sits under it with a countdown, and coach alerts appear when a pattern shows up |
| Messages | The coaches in Facebook Messenger, with what they learned from each player |
| Memory | Player memory: goals, injuries, routines and past sessions, grouped by kind and stored on the device |
| Voice coach | Tap "Ask" and speak. Whisper tiny transcribes in the browser, and the right view opens |

Layouts are built for a laptop (coach), a tablet (courtside) and a phone (player). Every feature works at each size.

## Prototype status

- An uploaded video is opened and previewed locally, but the analysis shows a precomputed sample match. SAM 3.1 player
  tracking is the step that makes new videos analysable.
- Coach briefings on the coach pages are templated from the match facts. The chat and the Messenger coaches are live on Muse Glimmer.
- Shuttle speeds are estimates from the reconstructed 3D track.
- The body view is a coaching heuristic, not a medical or physiotherapy assessment.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5191. The coach gateway address is set in `.env.local` (`VITE_AGENT_URL`, port 8790 on the GPU server).

## Not included

These are not published here, so some pages stay on "Loading" until they are added locally:

| Path | Content |
|---|---|
| `public/data/` | Sample match data and shot-level annotations |
| `public/media/` | Sample rally clips (broadcast footage, not ours to publish) |
| `public/body/body.json`, `body.bin` | 3D muscles and skeleton extracted from BodyParts3D 4.0 |
| `public/models/Xenova/whisper-tiny.en/` | Whisper tiny for the voice coach, from https://huggingface.co/Xenova/whisper-tiny.en |

## Built with

React, Three.js and Vite. 2D tracking backbone: [TrackNetV5](https://github.com/gino6178/TrackNetV5).

## Credits

- Coach portraits in `public/coaches/` are AI-generated images of fictional people; they are not real coaches.
- 3D anatomy (not included in this repository): BodyParts3D 4.0, © The Database Center for Life Science, licensed under
  CC BY 4.0, adapted via [Human Atlas](https://github.com/ashemag/human-atlas) (MIT).
- Fonts: Michroma, Manrope and IBM Plex Mono via Google Fonts.
