"""Contact sheet of a video: one frame every N seconds, with its time, for review.
  python sheet.py video.mp4 out.png [every_seconds] [columns]"""
import subprocess, sys, os, tempfile
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
every = float(sys.argv[3]) if len(sys.argv) > 3 else 5
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 5
d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).decode().strip())
tmp = tempfile.mkdtemp()
times = [t * every for t in range(int(d // every) + 1)]
tiles = []
for t in times:
    f = os.path.join(tmp, f"{t:07.2f}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=480:-1", f], check=True)
    if os.path.exists(f):
        im = Image.open(f).convert("RGB")
        ImageDraw.Draw(im).rectangle((0, 0, 70, 24), fill=(0, 0, 0))
        ImageDraw.Draw(im).text((6, 5), f"{t:.0f}s", fill=(255, 255, 255))
        tiles.append(im)
w, h = tiles[0].size
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 6), rows * (h + 6)), "white")
for k, im in enumerate(tiles):
    sheet.paste(im, ((k % cols) * (w + 6), (k // cols) * (h + 6)))
sheet.save(out)
print(out, len(tiles), "frames", f"{d:.1f}s")
