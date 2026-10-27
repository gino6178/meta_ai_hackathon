"""Your own video, made into a highlight: find you, read you, cut you out, and find your smash. Runs on the GPU
server, called by the agent gateway (agent/src/reel.js) for a video the player uploads from the app.
  python reel.py <in.mp4> <out.json>
Prints one JSON line per step ({"step", "detail"}) for the gateway to stream to the app.
- Meta's DETR finds the people on every second frame. The largest person who stays in the picture is you; the next
  one is the other player.
- Meta's Sapiens2 reads both players' pose and SAM 2.1 cuts each one out, every second frame, and every frame in the
  two and a half seconds around the smash, for the slow motion.
- The smash is your fastest overhead swing: the moment your racket hand, above your head, moves fastest.
Output: {fps, w, h, n, frames: [[you, other] or 0, ...], swings: [{t, speed}], smash: t, hand: m/s or null}
  Pixels are in the video's own frame, scaled to at most 960 px wide. A player is {"m": outline [x, y, ...],
  "k": 24 x [x, y, score]} or 0, keypoints as in people.py (COCO-17, big toes, heels, neck, index fingertips)."""
import json, os, sys
import cv2
import numpy as np
import torch
from huggingface_hub import hf_hub_download
from transformers import (DetrConfig, DetrForObjectDetection, DetrImageProcessor, Sam2Model, Sam2Processor,
                          Sapiens2ForPoseEstimation, Sapiens2ImageProcessor)

src, out = sys.argv[1], sys.argv[2]
dev = "cuda"
PICK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 62, 41, 9, 10, 11, 12, 13, 14, 15, 18, 17, 20, 69, 46, 25]
SLOW = (1.5, 1.0)


def say(step, detail=""):
    print(json.dumps({"step": step, "detail": detail}), flush=True)


# DETR's no-timm weights: its config has dilation null, which Transformers 5 refuses; it means no dilation
cfg = json.load(open(hf_hub_download("facebook/detr-resnet-50", "config.json", revision="no_timm")))
cfg["dilation"] = bool(cfg.get("dilation"))
detr_cfg = DetrConfig(**{k: v for k, v in cfg.items() if not k.startswith("_") and k not in ("architectures", "transformers_version", "model_type")})
dp = DetrImageProcessor.from_pretrained("facebook/detr-resnet-50", revision="no_timm")
dm = DetrForObjectDetection.from_pretrained("facebook/detr-resnet-50", revision="no_timm", config=detr_cfg).to(dev).eval()
sp = Sapiens2ImageProcessor.from_pretrained("facebook/sapiens2-pose-0.4b")
sm = Sapiens2ForPoseEstimation.from_pretrained("facebook/sapiens2-pose-0.4b", torch_dtype=torch.bfloat16).to(dev).eval()
qp = Sam2Processor.from_pretrained("facebook/sam2.1-hiera-large")
qm = Sam2Model.from_pretrained("facebook/sam2.1-hiera-large", torch_dtype=torch.bfloat16).to(dev).eval()

cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
W0, H0 = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
sc = min(1.0, 960 / max(1, W0))
W, H = round(W0 * sc), round(H0 * sc)
N = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
cap.release()
say("Opened your video", f"{N / fps:.1f} s at {fps:.0f} fps, {W0}×{H0}")


def frames(want):
    """the frames whose index is in want, scaled, as RGB"""
    c = cv2.VideoCapture(src)
    i = 0
    while True:
        ok, img = c.read()
        if not ok:
            break
        if i in want:
            if sc < 1:
                img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
            yield i, cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        i += 1
    c.release()


@torch.inference_mode()
def detect(batch):
    x = dp(images=[im for _, im in batch], return_tensors="pt").to(dev)
    o = dm(**x)
    rs = dp.post_process_object_detection(o, threshold=0.8, target_sizes=[(H, W)] * len(batch))
    return [[b.tolist() for s, l, b in zip(r["scores"], r["labels"], r["boxes"]) if dm.config.id2label[l.item()] == "person"] for r in rs]


# 1 everyone, every second frame
boxes = {}
batch = []
for i, im in frames(set(range(0, N, 2))):
    batch.append((i, im))
    if len(batch) == 8:
        for (j, _), b in zip(batch, detect(batch)):
            boxes[j] = b
        batch = []
if batch:
    for (j, _), b in zip(batch, detect(batch)):
        boxes[j] = b


# 2 tracks: a box joins the track whose last box overlaps it most; the largest track that lasts is you
def iou(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-6)


tracks = []
for i in sorted(boxes):
    for b in sorted(boxes[i], key=lambda b: -(b[2] - b[0]) * (b[3] - b[1])):
        if (b[2] - b[0]) * (b[3] - b[1]) < 0.004 * W * H:
            continue
        best = max(tracks, key=lambda t: iou(t["last"], b) if t["end"] >= i - 10 and t["end"] < i else -1, default=None)
        if best and best["end"] < i and best["end"] >= i - 10 and iou(best["last"], b) > 0.25:
            best["boxes"][i] = b; best["last"] = b; best["end"] = i
        else:
            tracks.append({"boxes": {i: b}, "last": b, "end": i})
seen = max(1, len(boxes))
tracks = [t for t in tracks if len(t["boxes"]) >= 0.25 * seen]
tracks.sort(key=lambda t: -sum((b[2] - b[0]) * (b[3] - b[1]) for b in t["boxes"].values()))
if not tracks:
    say("No player found", "Nobody stays in the picture long enough. Film the rally with the whole court in view.")
    json.dump({"error": "no player"}, open(out, "w"))
    sys.exit(0)
players = tracks[:2]
say("Found you", f"Meta's DETR found {len(players)} player{'s' if len(players) > 1 else ''} in {len(boxes)} frames; you are the nearer one")


def box_at(t, i):
    """a track's box on frame i, between its neighbours when DETR missed it"""
    bs = t["boxes"]
    if i in bs:
        return bs[i]
    a = max((j for j in bs if j < i), default=None)
    b = min((j for j in bs if j > i), default=None)
    if a is None or b is None or b - a > 20:
        return None
    u = (i - a) / (b - a)
    return [p + (q - p) * u for p, q in zip(bs[a], bs[b])]


def outline(mask):
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < 30:
        return None
    return [int(v) for p in cv2.approxPolyDP(c, 1.0, True).reshape(-1, 2) for v in p]


@torch.inference_mode()
def read(batch):
    """Sapiens2 pose and a SAM 2.1 outline for each player on a batch of frames"""
    res = [[0] * len(players) for _ in batch]
    have = [[(k, box_at(t, i)) for k, t in enumerate(players)] for i, _ in batch]
    have = [[(k, b) for k, b in h if b] for h in have]
    keep = [n for n, h in enumerate(have) if h]
    if not keep:
        return res
    xywh = [[[b[0], b[1], b[2] - b[0], b[3] - b[1]] for _, b in have[n]] for n in keep]
    x = sp(images=[torch.from_numpy(batch[n][1]).permute(2, 0, 1).to(dev) for n in keep], boxes=xywh, return_tensors="pt", device=dev)
    o = sm(pixel_values=x["pixel_values"].to(dev, torch.bfloat16))
    o.heatmaps = o.heatmaps.float()
    kp = sp.post_process_pose_estimation(o, boxes=xywh)
    masks = {}
    for cnt in set(len(have[n]) for n in keep):
        idx = [n for n in keep if len(have[n]) == cnt]
        q = qp(images=[batch[n][1] for n in idx], input_boxes=[[[float(v) for v in b] for _, b in have[n]] for n in idx], return_tensors="pt").to(dev)
        q["pixel_values"] = q["pixel_values"].to(torch.bfloat16)
        mo = qm(**q, multimask_output=False)
        for n, mk in zip(idx, qp.post_process_masks(mo.pred_masks.float().cpu(), q["original_sizes"])):
            masks[n] = mk
    for j, n in enumerate(keep):
        for m, (k, _) in enumerate(have[n]):
            pts = kp[j][m]["keypoints"].cpu().numpy()[PICK]
            s = kp[j][m]["scores"].float().cpu().numpy()[PICK]
            res[n][k] = {"m": outline(masks[n][m, 0].numpy()), "k": [[round(float(a), 1), round(float(c), 1), round(float(d), 2)] for (a, c), d in zip(pts, s)]}
    return res


got = [0] * N


def read_all(want, label):
    batch = []
    for i, im in frames(want):
        batch.append((i, im))
        if len(batch) == 8:
            for (j, _), r in zip(batch, read(batch)):
                got[j] = r
            batch = []
    if batch:
        for (j, _), r in zip(batch, read(batch)):
            got[j] = r


# 3 pose and outlines, every second frame
read_all(set(range(0, N, 2)), "every second frame")
say("Read your pose", "Sapiens2 read your body, feet and hands; SAM 2.1 cut you out of every frame")


# 4 the smash: the fastest overhead swing of your racket hand, in body heights per second
def swing_speed(step):
    out = []
    idx = [i for i in range(0, N, step) if got[i] and got[i][0]]
    for a, b in zip(idx, idx[1:]):
        p, q = got[a][0]["k"], got[b][0]["k"]
        ok = lambda k, j: k[j][2] > 0.3
        if not (ok(q, 0) and (ok(q, 15) or ok(q, 16))):
            continue
        body = max(1.0, max(q[15][1] if ok(q, 15) else 0, q[16][1] if ok(q, 16) else 0) - q[0][1])
        best = 0.0
        for w in (9, 10):
            if ok(p, w) and ok(q, w) and q[w][1] < q[0][1]:  # the hand above the head
                d = ((q[w][0] - p[w][0]) ** 2 + (q[w][1] - p[w][1]) ** 2) ** 0.5
                best = max(best, d / body / ((b - a) / fps))
        out.append((b, best))
    return out


sp15 = swing_speed(2)
peaks = []
for k, (i, v) in enumerate(sp15):
    if v <= 0 or any(abs(i - j) < fps * 0.8 for j, _ in peaks):
        continue
    if v >= max(x for _, x in sp15[max(0, k - 3): k + 4]):
        peaks.append((i, v))
peaks.sort(key=lambda x: -x[1])
swings = [{"t": round(i / fps, 2), "speed": round(v, 2)} for i, v in peaks[:5]]
if not swings:
    say("No smash found", "No swing with your hand above your head; the reel uses the whole clip")
    smash = None
else:
    smash = peaks[0][0]
    a, b = max(0, int(smash - SLOW[0] * fps)), min(N - 1, int(smash + SLOW[1] * fps))
    read_all(set(range(a, b + 1)) - set(range(0, N, 2)), "the smash at full rate")
    near = [(i, v) for i, v in swing_speed(1) if a <= i <= b]
    if near:
        smash, top = max(near, key=lambda x: x[1])
    say("Found your smash", f"your fastest overhead swing, at {smash / fps:.1f} s; every frame around it read for the slow motion")
# hand speed in m/s, taking you as 1.7 m tall: an estimate from 2D pose, and lower than the racket head's
hand = round(max((v for i, v in swing_speed(1) if smash and abs(i - smash) <= 2), default=0) * 1.7, 1) if smash else None
json.dump({"fps": round(fps, 3), "w": W, "h": H, "n": N, "frames": got, "swings": swings, "smash": round(smash / fps, 3) if smash else None, "hand": hand or None},
          open(out, "w"), separators=(",", ":"))
say("Ready", f"{sum(1 for f in got if f)} frames read")
