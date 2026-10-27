# Credits and licenses

Serve is our own work, built on the open models, libraries and data below. Everything in this repository was built
during the hackathon, except the work listed under "Made before the hackathon".

## Models

| What | Used for | License |
|---|---|---|
| Muse Glimmer (Meta), open weights | Every agent: the Autopilot, agent to agent, the body log, courts near you, captions, answers about your game | Apache 2.0 |
| Ollama | Serves Muse Glimmer on our GPU server | MIT |
| Whisper tiny (OpenAI), ONNX build | Speech recognition in the browser (voice questions) | MIT |
| Sapiens2 pose 0.4B (Meta), `facebook/sapiens2-pose-0.4b` | Both players' pose on the highlight frames, on our GPU server | Sapiens2 License |
| SAM 2.1 Hiera-L (Meta), `facebook/sam2.1-hiera-large` | Both players' outlines on the highlight frames, on our GPU server | Apache 2.0 |
| DETR ResNet-50 (Meta), `facebook/detr-resnet-50` | Finds the players in a video the player films, on our GPU server | Apache 2.0 |

## Libraries

| What | License |
|---|---|
| React, React DOM | MIT |
| Three.js | MIT |
| transformers.js (`@huggingface/transformers`), with ONNX Runtime Web | Apache 2.0 (ONNX Runtime Web: MIT) |
| Vite, `@vitejs/plugin-react` | MIT |
| Hugging Face Transformers (Python), PyTorch, OpenCV (highlight pose and outlines, on the server) | Apache 2.0, BSD-3-Clause, Apache 2.0 |

## Perception

| What | Used for | License |
|---|---|---|
| TrackNetV5 (our own earlier work) | 2D shuttle tracking while preparing the sample match. Made before the hackathon; the tracking code is not part of this repository. | Ours |
| YOLO11m-pose (Ultralytics) | Finds both players in each highlight frame (the boxes Sapiens2 and SAM 2.1 start from). Run on our server; neither the model nor its code ships here. | AGPL-3.0 |

## Assets and data

- **Anatomy model.** BodyParts3D, © The Database Center for Life Science, CC BY 4.0, adapted for the 3D muscle view.
  The adaptations are listed in `web/public/body/ATTRIBUTION.md`, which ships with the model files.
- **Portraits on the Live page.** AI-generated images of fictional people, made with Gemini (Google). They do not
  show real people.
- **Sample match.** A professional match, used during development to test the analysis.
  - Neither its video nor its shot labels are in this repository or the demo video.
  - Shot labels: provided by the TrackNet project (our own earlier work, made before the hackathon).
- **Club, venues, town map and members.** Made up for the demo, by us. They include the free slots, prices and home
  areas.
- **Icons and the shuttle mark.** Drawn by us.
- **Map data.** Courts, parks, roads and rivers © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
  under the Open Database License, through the Overpass API; place search through Nominatim. Route maps are drawn by
  the app from that data. The sample runs follow a bikeway from it (`video/sample_route.json`).
- **Weather.** Forecasts from [Open-Meteo](https://open-meteo.com), CC BY 4.0.
- **Google Maps.** Ratings (and reviews, where the key's plan includes them) through the Places API, when the server
  has a key: shown with a link to the place on Google Maps, never on another map, and not stored.
- **Sample health export.** Made up by us (`video/sample_health.py`) and labelled as a sample; not a real person's
  record.

## Made before the hackathon

- **TrackNetV5**, our own shuttle tracker, and the shot labels of the sample match that came with it. They were only
  used to prepare the sample match for the analysis pages; neither is in this repository or in the demo video.

## Meta products

Muse, Muse Glimmer, Muse Spark, SAM, Sapiens, DETR, Facebook, Messenger, Instagram, WhatsApp and Threads are Meta's. The
Facebook, Messenger and Instagram marks appear only on share buttons and "built with" notes. Serve is an independent entry to the
Meta Global AI Developer Hackathon 2026 and is not a Meta product.
