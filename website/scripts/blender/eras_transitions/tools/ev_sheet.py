"""ev_sheet.py <video> <out.jpg> f:x0:y0:x1:y1[:label] ... : per event a row of native crops (frames f-6, f-1, f, f+1, f+6)
around the bbox (padded to >= 240x160), each cell labelled with frame and time."""
import sys, cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
vp, out = sys.argv[1], sys.argv[2]; cap = cv2.VideoCapture(vp); fps = cap.get(cv2.CAP_PROP_FPS)
N = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 13)
def frame(i):
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, min(N - 1, i))); ok, f = cap.read(); return f[..., ::-1]
rows = []
for spec in sys.argv[3:]:
    p = spec.split(':'); f, x0, y0, x1, y1 = map(int, p[:5]); lab = p[5] if len(p) > 5 else ''
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2; w, h = max(240, x1 - x0 + 40), max(160, y1 - y0 + 40)
    w, h = min(w, 420), min(h, 280)
    a0, b0 = max(0, min(1280 - w, cx - w // 2)), max(0, min(720 - h, cy - h // 2))
    cells = []
    for d in (-6, -1, 0, 1, 6):
        c = Image.fromarray(np.ascontiguousarray(frame(f + d)[b0:b0 + h, a0:a0 + w])); dr = ImageDraw.Draw(c)
        dr.rectangle((0, 0, 150, 16), fill=(0, 0, 0)); dr.text((3, 1), f'f{f + d} t{(f + d) / fps:.2f} {lab if d == 0 else ""}', font=F, fill=(255, 255, 0))
        cells.append(c)
    row = Image.new('RGB', (sum(c.width for c in cells) + 4 * len(cells), h), 'white'); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
Wd = max(r.width for r in rows); S = Image.new('RGB', (Wd, sum(r.height + 4 for r in rows)), 'white'); y = 0
for r in rows: S.paste(r, (0, y)); y += r.height + 4
S.save(out, quality=88); print(out, S.size)
