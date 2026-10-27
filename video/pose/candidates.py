"""The rallies the highlight reel can pick (the top 8 for each player, scored as in web/src/match/Highlights.jsx), and
for each the shot the replay is built around: the player's last smash in the rally, or else the rally's last shot.
  python candidates.py <matches.json> [out.json]"""
import json, re, sys

m = json.load(open(sys.argv[1], encoding="utf-8"))["matches"][0]


def picks(p, k=8):
    out = []
    for r in m["rallies"]:
        if r["winner"] != p or not r.get("clip"):
            continue
        n, clutch = len(r["shots"]), max(r["score"]) >= 18
        finish = r["reason"] == "winner" and r["lastBy"] == p
        smash = finish and re.search("smash", r["lastType"], re.I)
        out.append((((3 if finish else 0) + (1.5 if smash else 0) + n / 6 + (2 if clutch else 0)), r))
    return [r for _, r in sorted(out, key=lambda x: -x[0])[:k]]


def focus(r, p):
    mine = [i for i, s in enumerate(r["shots"]) if s["p"] == p]
    sm = [i for i in mine if re.search("smash", r["shots"][i]["type"], re.I)]
    return sm[-1] if sm else len(r["shots"]) - 1


res = {}
for p in "AB":
    for r in picks(p):
        i = focus(r, p)
        s = r["shots"][i]
        res[r["clip"]] = {"rally": r["i"], "player": p, "shot": i, "t": s["t"], "type": s["type"], "pos": s.get("pos"),
                          "n": len(r["shots"]), "dur": r["dur"]}
for c, v in res.items():
    print(v["rally"], v["player"], v["shot"], "/", v["n"], v["type"], v["t"], c[-12:])
if len(sys.argv) > 2:
    json.dump(res, open(sys.argv[2], "w"), indent=1)
