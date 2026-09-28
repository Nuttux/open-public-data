"""pipeline/sheet.py - the suite's ONE summary sheet for Daniel: a short table (old | new | better/worse) on top, then the 3 windows
old | new, then the 10 golden crops old | new (no numbers on the images)."""
import os, time, json
from PIL import Image, ImageDraw, ImageFont
SHEETS = os.path.expanduser('~/Downloads/qipu-renders/live_ai/pipeline'); SUITE = '/Volumes/DANI-SD-DRIVE2/pipeline/suite'
G10 = ['r16', 'r18', 'r05', 'o01', 'o04', 'o06', 'o13', 'b03', 'r11', 'j02']


def font(s):
    for f in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/SFNS.ttf'):
        try: return ImageFont.truetype(f, s)
        except Exception: pass
    return ImageFont.load_default()


# (label, group, key, better: -1 lower is better / +1 higher / 0 info, noise tolerance). Tolerances = the noise floor measured by the
# dry run 28/09 (base recipe FP8=3 on a 5090 vs production bf16 on A40s = the same recipe): disagree -0.3 %, sharpness -3 / -4 %,
# golden flags 4 -> 6, colour held -2.9 points. A difference inside the tolerance reads 'same'.
ROWS = [('patchiness (overlap disagreement, windows)', 'win', 'disagree', -1, ('rel', 0.05)), ('detector flags, windows', 'win', 'flags', -1, ('abs', 3)),
        ('land invented on water, windows (px)', 'win', 'land_on_water', -1, ('abs', 2000)), ('sharpness, windows', 'win', 'sharp', 1, ('rel', 0.06)),
        ('building colour held, windows (%)', 'win', 'col_pass', 1, ('abs', 5)), ('facade lightness shift, windows', 'win', 'col_dL', 0, None),
        ('detector flags, 10 golden crops', 'golden', 'flags', -1, ('abs', 3)), ('golden crops with a flag', 'golden', 'crops_flagged', -1, ('abs', 1)),
        ('land invented on water, golden (px)', 'golden', 'land_on_water', -1, ('abs', 2000)), ('sharpness, golden', 'golden', 'sharp', 1, ('rel', 0.06)),
        ('building colour held, golden (%)', 'golden', 'col_pass', 1, ('abs', 5))]


def verdict(o, n, b, tol):
    if o is None or n is None or b == 0: return ''
    t = tol[1] * max(abs(o), 1e-6) if tol[0] == 'rel' else tol[1]
    if abs(n - o) <= t: return 'same'
    return 'better' if (n - o) * b > 0 else 'WORSE'


def make(name, ref, spec, info, new, old, gdir, rg, wdir, rw, rp):
    os.makedirs(SHEETS, exist_ok=True); W = 2400; F1, F2, F3 = font(40), font(26), font(22)
    rows = [(l, old['_agg'].get(g, {}).get(k), new['_agg'].get(g, {}).get(k), verdict(old['_agg'].get(g, {}).get(k), new['_agg'].get(g, {}).get(k), b, t))
            for l, g, k, b, t in ROWS if g in new['_agg']]
    wins = [k for k in ('w1', 'w2', 'w3') if wdir and os.path.exists(f'{wdir}/{name}_{k}.png')]
    gids = [c for c in G10 if gdir and os.path.exists(f'{gdir}/{c}.png') and os.path.exists(f'{rg}/{c}.png')]
    PW = 580; gw = 228
    H = 150 + 40 * (len(rows) + 1) + 40 + (len(wins) and (PW + 60) * ((len(wins) + 1) // 2)) + 60 + (gw + 40) * ((len(gids) + 4) // 5) + 40
    S = Image.new('RGB', (W, H), (250, 250, 247)); d = ImageDraw.Draw(S)
    d.text((30, 24), f'Test suite: {name}  vs  {ref}', font=F1, fill=(20, 20, 20))
    d.text((30, 80), f"{time.strftime('%d/%m %H:%M')} | recipe {spec['_h_recipe']} FP8={spec.get('fp8')} | card {info.get('gpu') or 'none (all tiles cached)'} | "
                     f"tiles run {info['tiles_run']}, reused {info['tiles_reused']} | ~${info.get('usd', 0)}", font=F3, fill=(90, 90, 90))
    y = 150; cols = (30, 760, 960, 1160)
    for x, t in zip(cols, ('measure', 'old', 'new', '')): d.text((x, y), t, font=F2, fill=(60, 60, 60))
    for l, o, n, v in rows:
        y += 40; d.text((cols[0], y), l, font=F3, fill=(30, 30, 30)); d.text((cols[1], y), '-' if o is None else str(o), font=F3, fill=(30, 30, 30))
        d.text((cols[2], y), '-' if n is None else str(n), font=F3, fill=(30, 30, 30))
        d.text((cols[3], y), v, font=F3, fill={'better': (20, 130, 40), 'WORSE': (190, 30, 30)}.get(v, (110, 110, 110)))
    y += 70
    for i, k in enumerate(wins):
        x0 = 30 + (i % 2) * (2 * PW + 60); yy = y + (i // 2) * (PW + 60)
        d.text((x0, yy - 32), f'window {k}: old | new', font=F3, fill=(60, 60, 60))
        for j, p in enumerate((f'{rw}/{rp}_{k}.png', f'{wdir}/{name}_{k}.png')):
            if os.path.exists(p): S.paste(Image.open(p).convert('RGB').resize((PW, PW), Image.LANCZOS), (x0 + j * (PW + 8), yy))
    y += (len(wins) and (PW + 60) * ((len(wins) + 1) // 2)) + 40
    d.text((30, y - 30), 'golden crops: old | new (native crops, downscaled)', font=F3, fill=(60, 60, 60))
    for i, c in enumerate(gids):
        x0 = 30 + (i % 5) * (2 * gw + 20); yy = y + 10 + (i // 5) * (gw + 40)
        for j, p in enumerate((f'{rg}/{c}.png', f'{gdir}/{c}.png')): S.paste(Image.open(p).convert('RGB').resize((gw, gw), Image.LANCZOS), (x0 + j * (gw + 4), yy))
        d.text((x0, yy + gw + 2), c, font=F3, fill=(90, 90, 90))
    out = f"{SHEETS}/suite_{name}_{time.strftime('%m%d_%H%M')}.jpg"; S.save(out, quality=88)
    S.save(f'{SUITE}/runs/{name}/sheet.jpg', quality=88)
    return out
