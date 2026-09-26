"""frame_sample.py <video> <n> <seed> <out.jpg> [cw ch]: a RANDOM sample (seeded, not hand-picked) of n frames of a film, one
random native-resolution crop (cw x ch) per frame, each shown with the same crop 3 frames earlier (a pop or a flicker shows as a
difference between the pair), labelled with frame, time and crop origin. For the random-sample grading of transitions."""
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
vp, n, seed, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
cw, ch = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (480, 270)
cap = cv2.VideoCapture(vp); N = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = cap.get(cv2.CAP_PROP_FPS)
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
rng = np.random.default_rng(seed); fr = np.sort(rng.choice(np.arange(3, N), n, replace=False))
F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14); cells = []
for f in fr:
    x0, y0 = int(rng.integers(0, W - cw)), int(rng.integers(0, H - ch)); pair = []
    for d in (-3, 0):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(f) + d); ok, a = cap.read(); pair.append(a[y0:y0 + ch, x0:x0 + cw, ::-1])
    c = Image.fromarray(np.concatenate([pair[0], np.full((ch, 4, 3), 255, np.uint8), pair[1]], 1)); dr = ImageDraw.Draw(c)
    dr.rectangle((0, 0, 260, 17), fill=(0, 0, 0)); dr.text((3, 1), f'#{len(cells) + 1} f{f - 3}|f{f} t{f / fps:.2f} x{x0} y{y0}', font=F, fill=(255, 255, 0))
    cells.append(c)
cols = 2; rows = (len(cells) + cols - 1) // cols; cwid = cells[0].width; S = Image.new('RGB', (cols * (cwid + 8), rows * (ch + 8)), 'white')
for k, c in enumerate(cells): S.paste(c, ((k % cols) * (cwid + 8), (k // cols) * (ch + 8)))
S.save(out, quality=90); print(out, S.size, 'frames', fr.tolist())
