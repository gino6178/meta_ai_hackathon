"""Both players, read properly, for the highlight reels: Sapiens2 (Meta) reads each player's pose and SAM 2.1 (Meta)
cuts them out of the frame. YOLO (detect.py) finds the players; these two read them. Runs on the GPU server.
Every second frame of each highlight clip, and every frame around the shot the replay is built on (the player's
last smash), where the reel goes into slow motion.
  python people.py <clips_dir> <cand_pose.json> <candidates.json> <out.json> [probe_dir]
probe_dir: draw the first few frames there instead, to check the keypoints and outlines by eye.
Output: { clip: { "fps", "w", "h", "slow": [first, last frame], "frames": [[near, far] or 0, ...] } }; a player is
  {"m": outline polygon [x, y, x, y, ...] in 854 x 480 px, "k": 24 x [x, y, score]} or 0. Keypoints are in COCO-17
  order, then left and right big toe, left and right heel, neck, left and right index fingertip."""
import json, os, sys
import cv2
import numpy as np
import torch
from transformers import Sam2Model, Sam2Processor, Sapiens2ForPoseEstimation, Sapiens2ImageProcessor

clips, pose_f, cand_f, out = sys.argv[1:5]
probe = sys.argv[5] if len(sys.argv) > 5 else None
dev = "cuda"
# Sapiens2 predicts 308 keypoints (body, feet, hands, face); the reel uses these
PICK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 62, 41, 9, 10, 11, 12, 13, 14, 15, 18, 17, 20, 69, 46, 25]
SLOW = (2.0, 1.2)  # seconds before and after the replay's shot, at every frame

pose = json.load(open(pose_f))
cand = json.load(open(cand_f))
sp = Sapiens2ImageProcessor.from_pretrained("facebook/sapiens2-pose-0.4b")
sm = Sapiens2ForPoseEstimation.from_pretrained("facebook/sapiens2-pose-0.4b", torch_dtype=torch.bfloat16).to(dev).eval()
qp = Sam2Processor.from_pretrained("facebook/sam2.1-hiera-large")
qm = Sam2Model.from_pretrained("facebook/sam2.1-hiera-large", torch_dtype=torch.bfloat16).to(dev).eval()


def boxes_for(frames):
    """the YOLO box of each player on every frame; a frame it missed takes the box between its neighbours"""
    n, res = len(frames), [[None, None] for _ in frames]
    for side in (0, 1):
        have = [i for i, f in enumerate(frames) if f[side]]
        for i in range(n):
            if frames[i][side]:
                res[i][side] = frames[i][side]["b"][:4]
                continue
            a = max((j for j in have if j < i), default=None)
            b = min((j for j in have if j > i), default=None)
            if a is not None and b is not None and b - a <= 20:
                u = (i - a) / (b - a)
                res[i][side] = [p + (q - p) * u for p, q in zip(frames[a][side]["b"][:4], frames[b][side]["b"][:4])]
    return res


def outline(mask):
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < 30:
        return None
    c = cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2)
    return [round(float(v), 1) for p in c for v in p]


@torch.inference_mode()
def read(imgs, bxs):
    """Sapiens2 pose and a SAM 2.1 outline for each player box, on a batch of frames"""
    keep = [i for i, bx in enumerate(bxs) if any(bx)]
    res = [[0, 0] for _ in bxs]
    if not keep:
        return res
    rgb = [cv2.cvtColor(imgs[i], cv2.COLOR_BGR2RGB) for i in keep]
    have = [[b for b in bxs[i] if b] for i in keep]
    xywh = [[[b[0], b[1], b[2] - b[0], b[3] - b[1]] for b in hv] for hv in have]
    x = sp(images=[torch.from_numpy(im).permute(2, 0, 1).to(dev) for im in rgb], boxes=xywh, return_tensors="pt", device=dev)
    o = sm(pixel_values=x["pixel_values"].to(dev, torch.bfloat16))
    o.heatmaps = o.heatmaps.float()
    kp = sp.post_process_pose_estimation(o, boxes=xywh)
    masks = [None] * len(keep)
    for cnt in set(map(len, have)):  # SAM takes a batch only when every frame has the same number of boxes
        idx = [n for n, hv in enumerate(have) if len(hv) == cnt]
        q = qp(images=[rgb[n] for n in idx], input_boxes=[[list(map(float, b)) for b in have[n]] for n in idx], return_tensors="pt").to(dev)
        q["pixel_values"] = q["pixel_values"].to(torch.bfloat16)
        mo = qm(**q, multimask_output=False)
        for n, mk in zip(idx, qp.post_process_masks(mo.pred_masks.float().cpu(), q["original_sizes"])):
            masks[n] = mk
    for n, i in enumerate(keep):
        j = 0
        for side, b in enumerate(bxs[i]):
            if not b:
                continue
            k = kp[n][j]["keypoints"].cpu().numpy()[PICK]
            sc = kp[n][j]["scores"].float().cpu().numpy()[PICK]
            res[i][side] = {"m": outline(masks[n][j, 0].numpy()), "k": [[round(float(a), 1), round(float(c), 1), round(float(d), 2)] for (a, c), d in zip(k, sc)]}
            j += 1
    return res


BONES = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (15, 17), (16, 18), (15, 19), (16, 20), (9, 22), (10, 23), (0, 21)]


def draw(img, ppl, path):
    v = img.copy()
    for p in ppl:
        if not p:
            continue
        if p["m"]:
            cv2.polylines(v, [np.array(p["m"]).reshape(-1, 2).astype(np.int32)], True, (255, 0, 255), 1)
        k = p["k"]
        for a, b in BONES:
            if k[a][2] > .3 and k[b][2] > .3:
                cv2.line(v, (int(k[a][0]), int(k[a][1])), (int(k[b][0]), int(k[b][1])), (0, 255, 255), 1)
        for i, (x, y, s) in enumerate(k):
            if s > .3:
                cv2.circle(v, (int(x), int(y)), 2, (0, 0, 255) if i in (9, 10) else (0, 255, 0), -1)
    cv2.imwrite(path, cv2.resize(v, None, fx=2, fy=2))


res = {}
for n, (name, c) in enumerate(cand.items()):
    P = pose[name]
    fps, frames = P["fps"], P["frames"]
    bx = boxes_for(frames)
    a, b = int((c["t"] - SLOW[0]) * fps), int((c["t"] + SLOW[1]) * fps)
    cap = cv2.VideoCapture(os.path.join(clips, name))
    got, i, batch = [], 0, []

    def flush():
        for (j, _), ppl in zip(batch, read([im for _, im in batch], [bx[j] if j < len(bx) else [None, None] for j, _ in batch])):
            got[j] = ppl
            if probe:
                draw(_, ppl, os.path.join(probe, f"{c['rally']}_{j}.jpg"))
        batch.clear()

    while True:
        ok, img = cap.read()
        if not ok:
            break
        if img.shape[1] != 854:
            img = cv2.resize(img, (854, 480))
        got.append(0)
        want = i in (int(c["t"] * fps) - 6, int(c["t"] * fps)) if probe else (i % 2 == 0 or a <= i <= b)
        if want:
            batch.append((i, img))
            if len(batch) == 8:
                flush()
        i += 1
    if batch:
        flush()
    cap.release()
    if probe:
        if n >= 1:
            break
        continue
    res[name] = {"fps": fps, "w": 854, "h": 480, "slow": [max(0, a), min(i - 1, b)], "frames": got}
    json.dump(res, open(out, "w"), separators=(",", ":"))  # after every clip, so a stopped run keeps what it did
    print(f"{n + 1}/{len(cand)} {name}: {i} frames, slow {a}-{b}", flush=True)
if not probe:
    print("wrote", out)
