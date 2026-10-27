"""Shrink people.py's output for the web app: outlines to whole pixels, keypoints to one decimal, scores to two.
  python pack.py <highlight_people.json> <web/public/data/highlight_people.json>"""
import json, os, sys

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))


def person(p):
    if not p:
        return 0
    return {"m": [round(v) for v in p["m"]] if p["m"] else None, "k": [[round(x, 1), round(y, 1), round(s, 2)] for x, y, s in p["k"]]}


for c in d.values():
    c["frames"] = [[person(p) for p in f] if f else 0 for f in c["frames"]]
json.dump(d, open(out, "w"), separators=(",", ":"))
print(f"{len(d)} clips: {os.path.getsize(src) / 1e6:.1f} MB -> {os.path.getsize(out) / 1e6:.1f} MB")
