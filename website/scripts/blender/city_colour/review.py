import json
from PIL import Image, ImageDraw
S = json.load(open('samples.json')); C = 10; cw, ch = 100, 118
sh = Image.new('RGB', (C * cw, ((len(S) + C - 1) // C) * ch), 'white'); d = ImageDraw.Draw(sh)
for i, s in enumerate(S):
    im = Image.open(f"photos/{s['photo']}.jpg").convert('RGB'); W, H = im.size; x0, y0, x1, y1 = s['box']
    mx, my = max(0.08, (x1 - x0)), max(0.08, (y1 - y0))
    cr = im.crop((int(max(0, x0 - mx) * W), int(max(0, y0 - my) * H), int(min(1, x1 + mx) * W), int(min(1, y1 + my) * H)))
    sx, sy = cr.size; cr = cr.resize((96, 70)); dd = ImageDraw.Draw(cr)
    bx0 = (x0 - max(0, x0 - mx)) * W / sx * 96; by0 = (y0 - max(0, y0 - my)) * H / sy * 70
    dd.rectangle([bx0, by0, bx0 + (x1 - x0) * W / sx * 96, by0 + (y1 - y0) * H / sy * 70], outline=(255, 0, 255), width=2)
    X, Y = (i % C) * cw, (i // C) * ch; sh.paste(cr, (X, Y))
    d.rectangle([X, Y + 71, X + 47, Y + 101], fill=tuple(int(v * 255) for v in s['raw'])); d.rectangle([X + 48, Y + 71, X + 95, Y + 101], fill=tuple(int(v * 255) for v in s['rgb']))
    d.text((X + 1, Y + 103), f"{i} {s['type'][:8]} {s['role'][:4]}", fill='black')
sh.save('sheets/review.jpg', quality=85); print(len(S))
