"""Narration with Kokoro (kokoro-onnx) on the GPU server, one sentence at a time so each subtitle line knows its time.
  python tts.py narration.json out_dir [voice] [models_dir]
Writes out_dir/k<scene>.wav (sentences joined with short pauses) and out_dir/timings.json:
  [[{"text": sentence, "start": s, "end": s}, ...] per scene].
A "{+3}" after a sentence holds 3 more seconds of silence there (for a moment the picture should carry alone)."""
import json, os, re, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

src, out = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
models = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.makedirs(out, exist_ok=True)
k = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))

# how words are said; the subtitles keep the written form
SAY = [("3D", "three D"), ("Muse Glimmer", "Muse Glimmer"), ("NT$", "N T dollars"),
       ("Sapiens2", "Sapiens two"), ("SAM 2.1", "Sam two point one")]
GAP = {".": 0.34, "!": 0.34, "?": 0.34, ":": 0.24, ";": 0.24}

scenes = json.load(open(src, encoding="utf8"))
timings = []
for i, line in enumerate(scenes, 1):
    parts = [p.strip() for p in re.findall(r"(?:[^.!?:;{}]|\.(?=\d))+[.!?:;]?(?:\s*\{\+[\d.]+\})?", line) if p.strip()]
    audio, t, rows, sr = [], 0.0, [], 24000
    for p in parts:
        hold = re.search(r"\s*\{\+([\d.]+)\}$", p)
        if hold:
            p = p[:hold.start()].strip()
        spoken = p
        for a, b in SAY:
            spoken = spoken.replace(a, b)
        samples, sr = k.create(spoken, voice=voice, speed=1.0, lang="en-us")
        # trim the model's leading and trailing silence so the subtitle lines up with the words
        nz = np.nonzero(np.abs(samples) > 0.01)[0]
        if len(nz):
            samples = samples[max(0, nz[0] - int(.03 * sr)): nz[-1] + int(.06 * sr)]
        d = len(samples) / sr
        rows.append({"text": p, "start": round(t, 3), "end": round(t + d, 3)})
        gap = GAP.get(p[-1], 0.18) + (float(hold.group(1)) if hold else 0)
        audio += [samples, np.zeros(int(gap * sr), dtype=samples.dtype)]
        t += d + gap
    sf.write(os.path.join(out, f"k{i}.wav"), np.concatenate(audio), sr)
    timings.append(rows)
    print(f"scene {i}: {t:.1f} s, {len(parts)} sentences")
json.dump(timings, open(os.path.join(out, "timings.json"), "w"), indent=1)
