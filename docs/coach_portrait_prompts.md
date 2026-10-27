# Coach portrait prompts

Generate one image per prompt in ChatGPT, Gemini or Midjourney. Use the same chat for all five so the style stays consistent.
Save each as a square JPG or PNG (at least 768 × 768) in `web/public/coaches/` with exactly these names:

| File | Coach |
|---|---|
| `fitness.jpg` | Coach Ren · fitness |
| `tactics.jpg` | Coach Lin · tactics |
| `technique.jpg` | Coach Kai · technique |
| `analyst.jpg` | Coach Ada · data |
| `head.jpg` | Head Coach |

The site picks them up automatically (no code change). Any missing file falls back to the drawn avatar.

## Shared style (paste this first)

> I need five photorealistic portraits of fictional badminton coaches for a sports-analysis app. Same style for all five: head and shoulders, centred, looking at the camera, square 1:1. Dark indoor badminton hall in the background, softly out of focus, with green court tones and a warm rim light. Natural skin texture, 85 mm lens, shallow depth of field, editorial sports photography. No text, logos or watermarks. These are not real people.

## 1 · fitness.jpg (Coach Ren, fitness)

> Portrait 1: an East Asian man in his early 30s, athletic build, short buzz-cut black hair, confident half smile. Coral-orange sleeveless training top, a cream headband, a stopwatch on a cord around his neck.

## 2 · tactics.jpg (Coach Lin, tactics)

> Portrait 2: a Taiwanese woman in her late 30s, chin-length black bob, calm and focused expression. Dark green team polo with a raised collar, a silver whistle on a cord, holding a small tactics clipboard at chest height.

## 3 · technique.jpg (Coach Kai, technique)

> Portrait 3: a South-East Asian man in his late 20s, swept-back dark hair, friendly expression. Light-blue sports shirt; a badminton racket rests on his shoulder.

## 4 · analyst.jpg (Coach Ada, data)

> Portrait 4: a woman in her early 30s with long dark hair tied back and thin black glasses, slight smile. Charcoal zip-up track jacket over a mint-green top, holding a tablet that shows a glowing court heat map.

## 5 · head.jpg (Head Coach)

> Portrait 5: a Taiwanese man in his late 50s, short silver-grey hair, thin glasses, warm but authoritative expression. Dark navy team jacket over a deep green polo, arms crossed.

## If a result is off

- Too glossy: add "matte natural skin, no airbrushing".
- Style drifts between portraits: "match the lighting and background of portrait 1 exactly".
- Cropped badly: "head and shoulders only, eyes one third from the top, face centred".
