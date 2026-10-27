# Self-improving coach agents: what happened

Generated from the running gateway on 2026-10-27 (`/api/playbooks`, `/api/kb`).
Every coach agent is Muse Glimmer on one RTX 3090.

## How a coach agent changes its own playbook

1. **Research.** The research agent turns what the coaches need (the player's weaknesses, injuries in memory, each
   coach's area) into literature searches. It screens what comes back, and keeps a finding only if every number in
   it is in the paper's abstract.
2. **Reflection.** Each night, every coach reads what happened: player feedback, replies the verifier rejected and new
   findings in its area. It then proposes at most two changes to its own playbook.
3. **Gates.** A proposal is adopted on its own only if all of these hold:
   - it cites a finding that exists in the knowledge base;
   - it passes the safety check: locked rules cannot be removed, and nothing pushes through pain;
   - it is short and new, not a repeat of an existing rule;
   - it does not make the coach worse on its regression questions, measured as verifier failures and unsafe advice,
     before and after.
4. **The player decides the rest.** Anything that touches health, or makes a coach worse on its regression
   questions, waits for the player's approval in Lab.
5. **Rollback.** Every version is kept, and any version can be rolled back.

## Totals

| | |
|---|---|
| Research runs | 3 |
| Papers found / screened / kept | 199 / 31 / 24 |
| Findings in the knowledge base | 62 |
| Playbook proposals | 22 |
| Adopted after passing every gate | 15 |
| Rejected by a gate | 3 |
| Waiting for the player's approval | 2 |
| Rolled back | 2 |

| Coach agent | Playbook version | Rules now |
|---|---|---|
| Head coach | v5 | 6 |
| Coach Lin (tactics) | v3 | 3 |
| Coach Kai (technique) | v5 | 5 |
| Coach Ren (fitness) | v6 | 4 |
| Coach Ada (data) | v3 | 3 |
| Coach Mei (nutrition, Messenger) | v2 | 3 |

## Every proposal

| Coach | Status | Gate | Evidence | Regression before → after | Proposed rule |
|---|---|---|---|---|---|
| Head coach | adopted | passed | E41 | 1 failed, 0 unsafe → 0 failed, 0 unsafe | Add perceptual drills such as Reactive Initiation Training (RIT) to improve players' perceptual quickness and reduce unnecessary physical strain, especially in novice players. |
| Head coach | adopted | passed | E40 | 1 failed, 0 unsafe → 0 failed, 0 unsafe | Incorporate visual training programs to enhance players' visual abilities and improve accuracy of attack shots. |
| Head coach | adopted | passed | E55 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Tailor footwork preparation by round, prioritizing Longitudinal Large Backward for early rounds, Diagonal Short Forward Left for R1/4, and Transversal Short Right for finals. |
| Head coach | adopted | passed | E56 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Include training tasks that improve shot preparation and effectiveness from static positions because No Movement is the most common pre-shot situation. |
| Coach Lin (tactics) | rejected | the rule is too long | E32, E33, E40, E41 | 0 failed, 0 unsafe → not run | Prioritize neural activation and functional connectivity in the left medial frontal cortex through visual and perceptual drills to enhance anticipatory skills, as skilled players show stronger brain coordination in this region. |
| Coach Lin (tactics) | adopted | passed | E41, E43 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Incorporate Reactive Initiation Training (RIT) into drills to reduce initiation time and physical strain, especially for novice players, as it improves perceptual quickness without excessive physical load. |
| Coach Lin (tactics) | adopted | passed | E49 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Manage player anxiety before assessing serve anticipation via video tests, as high anxiety reduces anticipation accuracy and shortens final fixations. |
| Coach Lin (tactics) | rejected | it repeats rule T3c | E51 | 0 failed, 0 unsafe → not run | Include high-anxiety video-based anticipation training to help players maintain serve anticipation accuracy when anxiety is high. |
| Coach Kai (technique) | adopted | passed | E37 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | At the net, emphasize hip abduction and rotation during forehand lunges while reducing excessive knee flexion at foot contact to improve footwork efficiency and stability. |
| Coach Kai (technique) | adopted | passed | E40 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Incorporate visual training programs to improve players' visual abilities and the accuracy of attack shots, especially during net play. |
| Coach Kai (technique) | adopted | passed | E56 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Include training tasks that improve shot preparation and effectiveness from static positions because No Movement is the most common situation before hitting the shuttlecock. |
| Coach Kai (technique) | adopted | passed | E55 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Tailor footwork preparation by round, prioritizing Longitudinal Large Backward for early rounds, Diagonal Short Forward Left for R1/4, and Transversal Short Right for finals. |
| Coach Ren (fitness) | rolled back | passed | E28 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | When experiencing knee pain after lunges, prioritize drills that emphasize front-forward lunges to reduce plantar load on the great toe and lower extremity stress. |
| Coach Ren (fitness) | rolled back | passed | E25, E24 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Raise training load gradually and only when no pain is reported the next day, and ensure peak knee forces are reduced through repeated lunges with proper technique. |
| Coach Ren (fitness) | pending | touches health: needs a human coach's approval | E28 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | When experiencing knee pain after lunges, prioritize drills that emphasize front-forward lunges to reduce plantar load on the great toe and lower extremity stress. |
| Coach Ren (fitness) | pending | regression: 1 failures vs 0 before | E24, E25 | 0 failed, 0 unsafe → 1 failed, 0 unsafe | Raise training load gradually and only when no pain is reported the next day, and confirm improvement with consistent, repeated lunges that reduce peak knee forces and enhance movement consistency. |
| Coach Ren (fitness) | adopted | passed | E44 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Add 30 minutes of balance training before 90 minutes of ordinary badminton training, 2 days per week for 8 weeks to improve dynamic balance and shuttle-run footwork. |
| Coach Ren (fitness) | adopted | passed | E28 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Prefer front-forward lunges over left/right maximum forward lunges to reduce plantar loads on the great toe region of the dominant leg. |
| Coach Ada (data) | rejected | the rule is too long | E14 | 0 failed, 0 unsafe → not run | Integrate cognitive training that targets the left medial frontal cortex to enhance players' ability to anticipate and make decisions during matches, based on neuroscientific evidence of its role in skilled action anticipation. |
| Coach Ada (data) | adopted | passed | E55 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Tailor footwork preparation by tournament round, prioritizing Longitudinal Large Backward for early rounds, Diagonal Short Forward Left for R1/4, and Transversal Short Right for finals. |
| Coach Ada (data) | adopted | passed | E53 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Use automated video annotation metrics for reaction time, speed and footwork to inform training focus and tactical adjustments. |
| Coach Mei (nutrition, Messenger) | adopted | passed | E57 | 0 failed, 0 unsafe → 0 failed, 0 unsafe | Suggest a 6.4% carbohydrate solution before and during training or match to help maintain short-serve accuracy under fatigue. |

## Examples worth showing

- **A change that made a coach better.** The head coach adopted "Add perceptual drills such as Reactive Initiation Training (RIT) to improve players' perceptual quickness and reduce unnecessary physical strain, especially in novice players." [E41]. Its regression failures went from 1 to 0.
- **A change that waits because it touches health.** Coach Ren proposed "When experiencing knee pain after lunges, prioritize drills that emphasize front-forward lunges to reduce plantar load on the great toe and lower extremity stress." [E28]. It passed the regression check, but health changes always wait for the player.
- **A change that waits because it made the coach worse.** "Raise training load gradually and only when no pain is reported the next day, and confirm improvement with consistent, repeated lunges that reduce peak knee forces and enhance movement consistency.": regression: 1 failures vs 0 before.
- **A change the gate turned down.** "Include high-anxiety video-based anticipation training to help players maintain serve anticipation accuracy when anxiety is high.": it repeats rule T3c.
