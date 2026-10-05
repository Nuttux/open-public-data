"""colour_sheet.jpg: per type, 3 reference photos (Commons, open licences) + its palette strips (width = weight; photo
samples outlined white, CONVENTION entries plain)."""
import json, os
from PIL import Image, ImageDraw
P = json.load(open('palettes.json')); S = json.load(open('samples.json'))
TY = [t for t in P if not t.startswith('_')]; ROLES = ['walls', 'trim', 'base', 'roof', 'roof_flat', 'glass']
RH, PW, PH, X0 = 132, 132, 99, 150 + 3 * 136
im = Image.new('RGB', (X0 + 640, 30 + RH * len(TY)), 'white'); d = ImageDraw.Draw(im)
d.text((6, 8), 'Vancouver building colours per type - left: open reference photos (Wikimedia Commons, sources.json); right: palettes.json (display sRGB, exposure-corrected; width = weight; white outline = photo sample)', fill='black')
for r, t in enumerate(TY):
    y = 30 + r * RH; d.line([0, y - 2, im.width, y - 2], fill=(200, 200, 200))
    d.text((6, y + 4), t.replace('_', ' '), fill='black'); d.text((6, y + 20), f"{P[t]['_n_photo']} photo samples", fill=(90, 90, 90))
    phs = []
    for s in S:
        if s['type'] == t and s['photo'] not in phs: phs.append(s['photo'])
    for i, ph in enumerate(phs[:3]):
        p = Image.open(f'photos/{ph}.jpg').convert('RGB'); p.thumbnail((PW, PH)); im.paste(p, (150 + i * 136, y + 4))
    yy = y + 4
    for role in ROLES:
        L = P[t].get(role)
        if not L: continue
        d.text((X0 + 4, yy + 3), role, fill='black'); tot = sum(e[3] for e in L); x = X0 + 64
        for e in L:
            w = max(3, int(560 * e[3] / tot)); c = tuple(int(255 * v) for v in e[:3])
            d.rectangle([x, yy, x + w - 1, yy + 17], fill=c, outline=(255, 255, 255) if e[3] == 1.0 else None); x += w
        yy += 21
im.save(os.path.expanduser('~/Downloads/qipu-renders/vancouver/assets/colour_sheet.jpg'), quality=88); print(im.size)
