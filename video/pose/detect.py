"""Detect both players in every rally clip, for the highlight reels: YOLO11 pose on the GPU server, 17 joints per
player per frame. Each detected person is placed on the court through the match's homography (feet -> court
metres); the best one on each half is kept, as "near" and "far".
  python detect.py <clips_dir> <homography as 9 comma-separated numbers, court -> pixels> <out.json> [only.json]
only.json (optional): a dict keyed by clip name, to run on those clips alone (candidates.py writes one).
The far player is small in a broadcast frame, so the clip is run at 1280 px (POSE_IMGSZ): at YOLO's default 640 the
far player was found in about a third of the frames.
Output: { clip: { "fps", "w", "h", "frames": [[near, far], ...] } }, each player {"k": 17 x [x, y, confidence],
"b": [x0, y0, x1, y1, confidence]} or 0."""
import json, os, sys
import cv2
import numpy as np
from ultralytics import YOLO

clips, Hs, out = sys.argv[1], sys.argv[2], sys.argv[3]
H = np.array([float(x) for x in Hs.split(",")]).reshape(3, 3)
Hinv = np.linalg.inv(H)
model = YOLO(os.environ.get("POSE_MODEL", os.path.expanduser("~/paper3/models/yolo11m-pose.pt")))
dev = os.environ.get("POSE_DEVICE", "0")
size = int(os.environ.get("POSE_IMGSZ", "1280"))


def court(px, py):
    v = Hinv @ np.array([px, py, 1.0])
    return v[0] / v[2], v[1] / v[2]


res = {}
only = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
names = sorted(f for f in os.listdir(clips) if f.endswith(".mp4") and (only is None or f in only))
for k, name in enumerate(names):
    cap = cv2.VideoCapture(os.path.join(clips, name))
    fps, w, h = cap.get(cv2.CAP_PROP_FPS) or 30, int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sx, sy = 854 / w, 480 / h  # the homography is in 854 x 480 pixels
    frames, batch = [], []

    def flush():
        for r in model.predict(batch, device=dev, half=True, verbose=False, conf=0.25, imgsz=size):
            best = {"near": (0, 0), "far": (0, 0)}
            if r.keypoints is not None and len(r.keypoints):
                kp, conf, box = r.keypoints.data.cpu().numpy(), r.boxes.conf.cpu().numpy(), r.boxes.xyxy.cpu().numpy()
                for p, c, b in zip(kp, conf, box):
                    ank = [p[i] for i in (15, 16) if p[i][2] > 0.3]
                    fx, fy = (np.mean([a[0] for a in ank]), np.mean([a[1] for a in ank])) if ank else (np.mean(p[:, 0]), np.max(p[:, 1]))
                    cx, cy = court(fx * sx, fy * sy)
                    if not (-1.2 < cx < 7.3 and -1.8 < cy < 15.2):
                        continue  # line judges, coaches, the crowd
                    side = "near" if cy > 6.7 else "far"
                    if c > best[side][0]:
                        best[side] = (c, {"k": [[round(float(x) * sx, 1), round(float(y) * sy, 1), round(float(q), 2)] for x, y, q in p],
                                         "b": [round(float(b[0]) * sx, 1), round(float(b[1]) * sy, 1), round(float(b[2]) * sx, 1), round(float(b[3]) * sy, 1), round(float(c), 2)]})
            frames.append([best["near"][1] or 0, best["far"][1] or 0])
        batch.clear()

    while True:
        ok, img = cap.read()
        if not ok:
            break
        batch.append(img)
        if len(batch) == 32:
            flush()
    if batch:
        flush()
    cap.release()
    both = sum(1 for f in frames if f[0] and f[1])
    res[name] = {"fps": round(fps, 3), "w": 854, "h": 480, "frames": frames}
    print(f"{k + 1}/{len(names)} {name}: {len(frames)} frames, both players in {100 * both // max(1, len(frames))}%", flush=True)
json.dump(res, open(out, "w"), separators=(",", ":"))
print("wrote", out)
