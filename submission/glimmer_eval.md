# Muse Glimmer coach evaluation

Run on 2026-10-26 16:53 UTC against the coach gateway, with the same requests the web app sends.
Model: `muse-glimmer` on RTX 3090 (CUDA) (Meta open weights, served by Ollama). 18 player questions, 4 of them in Traditional Chinese, across all five coaches.

| Measure | Result |
|---|---|
| Replies shown with every number verified (empty replies count as failures) | 100% |
| Numbers checked by the verifier | 115 in 18 replies |
| Empty replies | 0 |
| Answered by the model (not replaced by the raw fact) | 100% |
| Answered on the first try | 83% |
| Replies that cite at least one fact | 100% |
| Median reply time | 22.0 s (slowest 61.2 s) |
| Median generation speed | 28 tokens/s |

How to read it: a reply is only shown if every number in it appears in the fact it cites in the same sentence. A reply
that fails is sent back to Glimmer once with the failing numbers, then replaced by the raw fact.

## Replies

| Coach | Question | Time | Numbers | Result | Reply |
|---|---|---|---|---|---|
| tactics | Where do I lose most points? | 20.2 s | 3 | ✓ verified | Most of Wang’s winners came to your rear forehand, with 7 winners [F8] landing there. That zone is costing you points, so defend it first before adding new attacking patterns. This week do 3 sets of 5 reactive rear-forehand defensive clears using RIT cues to improve reach and initiation without extra load. |
| tactics | Which zone should I cover earlier, and how? | 14.0 s | 3 | ✓ verified | Most of Wang’s winners landed in your rear forehand with 7 winners [F8], so that zone is costing you first and needs defending before adding new attacks. Cover it earlier by improving anticipation and initiation rather than just chasing. This week do 3 x 5 min Reactive Initiation Training with a partner feeding random deep forehand lifts, start your split as soon as racket preparation changes to t |
| tactics | How does my opponent win points against me? | 17.3 s | 4 | ✓ verified | Wang hit 24 winners against you [F7] and most landed to your rear forehand with 7 winners [F8]. That zone is costing you points, so defend it first before adding new attacking patterns. This week do 3x5 min rear-forehand defensive RIT shadow with random feed cues to cut initiation time and protect that area. |
| technique | How many net errors did I make? | 16.2 s | 4 | ✓ verified | You made 14 net errors in the whole match [F5], which is more than half of your 27 own errors [F3]. That margin over the tape is costing you rallies, especially at net. This week do 3 sets of 10 net feeds focusing on hip abduction and rotation in the lunge with a soft lift over the tape before speed or deception. |
| technique | Which stroke should I fix first? | 19.6 s | 5 | ✓ verified | Your net errors are 14 [F5] out of 27 own errors [F3], and you only win 25% of Net-Net-Net rallies [F14]. That margin over the tape is costing you points, not speed. This week do 3 sets of 5 slow net taps focusing on clearing the tape first with hip abduction and rotation, reducing deep knee flexion at contact. |
| technique | Why do I keep losing points at the net? | 53.0 s | 11 | ✓ verified, rewritten | Your net errors are 14 [F4] out of 27 total errors [F3], with 6 in game1 [F6], 4 in game2 [F6] and 4 in game3 [F6], so margin over tape is leaking points. You only win 25% of rallies that contain Net shot → Net shot → Net shot [F14], so control beats speed at the net. Do 3×10 forehand net lunges focusing on hip abduction/rotation with less deep knee bend, keeping shuttle just over tape before dece |
| fitness | My right knee is sore. What should I train this week? | 26.9 s | 7 | ✓ verified | Your right knee is sore and the replay shows loading knee bends on the right leg in the replayed rally: 5 of 6 [F16] with one knee bend past 90 degrees, deepest 108 degrees [F15]. That deep loading matters for pain, so no jumps and no knee bends past 90 degrees this week. Do low-load isometric quad sets 3x30 sec daily and keep front-court work light, only adding load if you have no pain the next d |
| fitness | Am I getting tired late in the match? | 20.5 s | 8 | ✓ verified | Yes, load per rally is 18% higher in the last third of the match than in the first [F12], and front-court lunges per rally rise from 0.2 in game 1 to 0.8 in game 3 [F13]. That late-match load can reduce anticipation accuracy under high physiological load [E29]. This week do 2 sets of 5 slow shadow footwork reps with 90 sec rest before your next session. |
| fitness | Which muscles does my game load most? | 26.0 s | 11 | ✓ verified | Your match shows more front-court work late, with front-court lunges per rally rising from 0.2 in game 1 to 0.8 in game 3 [F13] and load per rally 18% higher in the last third than in the first [F12]. The replayed rally also loads the right leg for knee bends 5 of 6 [F16] with one bend past 90 degrees to 108 degrees [F15], pointing to repeated lower-leg demand late in play. This week do 2 sets of  |
| analyst | What are my opponent's habits? | 20.9 s | 8 | ✓ verified | Your opponent targets your rear forehand, with 7 winners landing there [F8], and his blocks stretch you 64% of the time [F10] needing 3.69 m/s [F9] to reach. That pattern helped him edge you 51-50 out of 101 points [F2] and shows you’re reacting late to his block. For next match you need earlier read of his block so you can cover the rear forehand before he attacks. Do 3 min of block-read shadow f |
| analyst | Which patterns lose me rallies? | 20.4 s | 3 | ✓ verified | Your net exchanges are leaking points: you win only 25% of rallies that contain Net shot → Net shot → Net shot [F14]. That means opponents are controlling the front and you’re getting stuck in a low-percentage battle. For next match work on exiting the net faster instead of staying in the same pattern. Try 5 minutes of net shuttle reset with a partner, 3 reps per side, focusing on first net kill a |
| analyst | How often am I stretched to reach the shuttle? | 45.5 s | 3 | ✓ verified, rewritten | You get stretched on 64% of Wang's blocks [F10] but only 13% of all shots need more than 3.5 m/s to reach [F11]. That means blocks are your specific stretch trigger, so next match you’ll need earlier anticipation on those exchanges. Try reactive initiation training to improve overall on-court agility [E42]. |
| head | What should I focus on this week? | 26.5 s | 7 | ✓ verified | Your net errors cost you 14 points [F5] out of 27 own errors [F3], and you won only 25% of Net shot → Net shot → Net shot rallies [F14]. That’s points leaking at the front when load is already 18% higher late [F12]. Do 3×3 min net shuttle control with soft hands focusing on lift height, then 5 min Reactive Initiation Training for perceptual quickness to reduce unnecessary lunges. |
| head | Sum up my match in three sentences. | 28.8 s | 16 | ✓ verified | You beat WANG Po Wei Thailand Masters 2025 R32 20-15, 9-21, 21-15 [F1] with 50 points won and 51 lost out of 101 [F2]. Own errors cost you 27 [F3] with 14 net errors [F5], and WANG hit 24 winners [F7] with 7 landing to your rear forehand [F8]. This week do 5 min Reactive Initiation Training before footwork and add visual training for attack accuracy [E40]. |
| technique | 我網前失誤有幾次？ | 22.0 s | 6 | ✓ verified | 你整場網前失誤 14 次 [F5]，其中第一局 6 次 [F6]、第二、三局各 4 次 [F6]，佔你 27 次自失 [F3] 的大半。網前餘量不足會直接送分，也讓你連續網前壓制成功率下降。先練餘量控制：每次訓練前做 3 組、每組 5 次的輕柔網前推撥，只求過網有餘量不求速度。 |
| head | 我這週該練什麼？ | 33.2 s | 4 | ✓ verified | 你這場自己失誤27分 [F3]、其中網前失誤14次 [F4]，對手在你後場反手打進7個winner [F8]，失分集中在前場穩定與後場防守。 為減少膝負荷並提升反應，本週做3分鐘Reactive Initiation Training搭配step-in lunge，step-in lunge可降低驅動時的水平反作用力 [E5]。 訓練安排在非比賽日，先做熱身再執行，結束後用家裡食物補充蛋白質。 |
| tactics | 對手最常把球打到哪裡？ | 18.0 s | 5 | ✓ verified | 對手最常以致勝球攻擊你的後場正手，共 7 球 [F8]，總致勝球 24 球 [F7]。這區失分多會讓你被迫後退失位，先穩住防守再談進攻。 本週做後場正手防守＋反應啟動訓練：每次 5 球連續防守後做 3 秒 RIT 反應啟動，3 組。 |
| fitness | 我的膝蓋有點痛，這週可以練跳躍嗎？ | 61.2 s | 7 | ✓ verified, rewritten | 膝蓋痛這週不要跳躍，也避免膝蓋彎過90度。 回放那球你有膝蓋彎過90度 1 次 [F15]，最深 108 度 [F15]，右腳承受 5 of 6 次負載 [F16]，這會讓膝蓋負擔更高。 先做低負荷等長訓練如靠牆靜蹲，膝蓋不超過90度，隔天無痛再維持。 |

## Known limits

- The verifier checks numbers, not words. In one reply (我這週該練什麼？) the count of 7 winners is right, but the zone
  is called the rear backhand where the fact says rear forehand. A second check that compares zone and stroke names
  against the cited fact is the next step.
- Glimmer runs with low thinking. With thinking switched off it still reasons in a hidden channel and can use up its
  budget before replying, so the gateway asks for low thinking and keeps a separate token budget for the reply.
- Replies take about 15–30 s on one RTX 3090 (about 28 tokens/s), and longer when the verifier sends a reply back for
  a rewrite. The first request after a restart also loads the 17 GB model, which takes a few minutes.

Reproduce: `node agent/test/glimmer_eval.mjs http://127.0.0.1:8790 submission/glimmer_eval.md` on the GPU server.
