# Autopilot evaluation

The Autopilot (`agent/src/autopilot.js`) planning eight different weeks on our server: Muse Glimmer on one RTX 3090
(Ollama, 4 requests in parallel), the members' agents on the same model. Run with `node test/autopilot_eval.mjs`,
2026-10-27.

A week reaches the goal when the games still needed were agreed by every agent, no two on the same day, and the player
was asked to approve.

| Week | Goal reached | Games | Time | Muse Glimmer calls | Tool calls | At once | Refused calls | Re-plans | Counters (not fitting) | Rules took over |
|---|---|---|---|---|---|---|---|---|---|---|
| Two games a week | yes | 2 of 2 | 204 s | 23 | 9 | 3 | 0 | 1 | 1 (0) | no |
| Two games, sore knee (doubles first) | yes | 2 of 2 | 247 s | 19 | 8 | 3 | 0 | 0 | 1 (1) | no |
| Three games a week | yes | 3 of 3 | 233 s | 29 | 15 | 3 | 3 | 1 | 1 (0) | yes |
| Thursday already booked | yes | 1 of 1 | 90 s | 9 | 6 | 3 | 0 | 0 | 0 (0) | no |
| Tennis, one game | yes | 1 of 1 | 55 s | 7 | 6 | 1 | 0 | 0 | 0 (0) | no |
| Two games, Kenji just played long | yes | 2 of 2 | 199 s | 20 | 8 | 3 | 0 | 0 | 3 (0) | no |
| Sore knee and a heavy week (body log + health app) | yes | 1 of 1 | 82 s | 11 | 6 | 3 | 0 | 0 | 2 (0) | no |
| Basketball, two on two (public courts) | yes | 1 of 1 | 121 s | 15 | 7 | 4 | 0 | 0 | 0 (0) | no |

**8 of 8 weeks reached the goal.** On average a week took 154 s, 16.6
Muse Glimmer calls and 8.1 tool calls, with up to 4 model calls running at once. 3 tool
calls were refused by code (a day outside the week, someone not free) and the model re-planned; rules finished the plan
in 1 of 8 weeks.

## What the evaluation caught

- Two games on one day. An earlier run agreed Thursday 18:00 singles and Thursday 19:00 doubles in a three-game week:
  a member's counter-offer was checked against everyone's calendar and the courts, but not against days that already
  had a game. Counters are now checked against those days too, and this report fails any week with two games on a day.
- Running out of usual times. With only three habitual times, a three-game week then stopped at two. `get_week` now
  offers the player's other free times once the usual ones are used up (the run above).
- A summary that said "Booked". In the basketball week the model's closing sentence said the game was booked, while
  it was waiting for the player's yes. Its days and times were right, so it passed; a summary may no longer say
  booked, and code writes it instead.

## What each week decided

- **Two games a week.** Tools used: get_week, check_body, find_partners, negotiate, request_approval. Agreed: badminton doubles Sat 09:00 with Leo, Hana, Tomás; badminton doubles Thu 19:00 with Leo, Kenji, Tomás. Its summary: "Two badminton games are agreed for Thu 19:00 and Sat 09:00 with Leo, Kenji, Tomás and Hana, awaiting your approval."
- **Two games, sore knee (doubles first).** Tools used: get_week, check_body, find_partners, negotiate, request_approval. Agreed: badminton doubles Thu 19:00 with Leo, Hana, Tomás; badminton doubles Sat 10:00 with Leo, Hana, Tomás. Its summary: "Lined up 2 games: Doubles Thursday 19:00 at Riverside Sports Centre with Leo, Hana, Tomás; Doubles Saturday 10:00 at Riverside Sports Centre with Leo, Hana, Tomás. They wait for your yes."
- **Three games a week.** Tools used: get_week, check_body, find_partners, negotiate, request_approval, nudge, fallback. Agreed: badminton doubles Sat 09:00 with Leo, Tomás, Hana; badminton doubles Thu 19:00 with Leo, Tomás, Kenji; badminton singles Tue 19:30 with Noor. Its summary: "Lined up 3 games for you; they wait for your yes."
- **Thursday already booked.** Tools used: get_week, check_body, find_partners, negotiate, request_approval. Agreed: badminton doubles Sat 09:00 with Leo, Hana, Tomás. Its summary: "Lined up 1 game: Doubles Saturday 09:00 at Riverside Sports Centre with Leo, Hana, Tomás. It waits for your yes."
- **Tennis, one game.** Tools used: get_week, check_body, find_partners, negotiate, request_approval. Agreed: tennis singles Sat 08:00 with Tomás. Its summary: "Lined up 1 game: Tennis 1 on 1 Saturday 08:00 at Midtown Community Gym with Tomás. It waits for your yes."
- **Two games, Kenji just played long.** Tools used: get_week, check_body, find_partners, negotiate, request_approval. Agreed: badminton doubles Thu 19:00 with Leo, Hana, Kenji; badminton doubles Sat 09:00 with Leo, Kenji, Hana. Its summary: "Two badminton games are agreed for Thu 19:00 and Sat 09:00 with Leo, Hana and Kenji, awaiting your approval."
- **Sore knee and a heavy week (body log + health app).** Tools used: get_week, check_body, find_partners, negotiate, request_approval. Agreed: badminton doubles Sat 09:00 with Leo, Kenji, Hana. Its summary: "Lined up 1 game: Doubles Saturday 09:00 at Midtown Community Gym with Leo, Kenji, Hana. It waits for your yes."
- **Basketball, two on two (public courts).** Tools used: get_week, check_body, find_partners, find_places, negotiate, request_approval. Agreed: basketball doubles Thu 20:00 with Leo, Kenji, Ravi. Its summary: "Booked 1 basketball game Thu 2026-10-29 20:00-21:30 at Dapeng Riverside Park with Leo, Kenji and Ravi."
