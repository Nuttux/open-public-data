"""(city_run/block/tile_content.py, 07/10 OPEN-GROUND) per-tile content of the render passes, for the content-based prompt keys
(prep_b8, CITY != sf) and the 'invent' detector (autoreroll, CITY != sf).
Class pass (hq_city CLASS_PASS, 3-bit code r*4+g*2+b): 0 ground (lawn / park / beach / terrain), 1 water, 2 roof, 3 tree, 4 landmark,
5 street, 6 wall, 7 other.  Mask pass: green = buildings, red = landmarks, blue = water, black = the rest.
  measure(code, mask=None, rgb=None) -> dict(bld, open, ground, tree, water, sand, grass) as fractions of the tile
    bld   = mask green (buildings) or, without a mask, class roof + wall
    open  = ground + tree + water (class)
    sand  = ground px whose render colour is pale beige (sand / dry beach); grass = ground px clearly green
  python3 tile_content.py <work dir> [scale]   all P.txt tiles of a block from x<scale> copies (<scratch>/class4.npy ...)"""
import os
os.environ.setdefault('OPENCV_IO_MAX_IMAGE_PIXELS', str(2 ** 31))
import numpy as np

def codeof(c): c = c > 128; return (c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]).astype(np.uint8)
def bmask(m): m = m > 128; return m[..., 1] & ~m[..., 0] & ~m[..., 2]
def sandy(rgb):
    a = rgb.astype(np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r - b >= 18) & (g - b >= 8) & (r >= g - 4) & (r + g + b >= 390)
def seaish(rgb): a = rgb.astype(np.int16); return (a[..., 2] - a[..., 0] >= 40) & (a[..., 2] - a[..., 1] >= 12) & (a[..., 2] >= 120)
def greenish(rgb): a = rgb.astype(np.int16); return (a[..., 1] > a[..., 0] + 6) & (a[..., 1] > a[..., 2] + 2)

def measure(code, mask=None, rgb=None):
    n = code.size; gr = code == 0
    d = dict(bld=float((bmask(mask) if mask is not None else np.isin(code, (2, 6))).sum()) / n,
             open=float(np.isin(code, (0, 1, 3)).sum()) / n, ground=float(gr.sum()) / n,
             tree=float((code == 3).sum()) / n, water=float((code == 1).sum()) / n)
    if rgb is not None:
        d.update(sand=float((gr & sandy(rgb)).sum()) / n, grass=float((gr & greenish(rgb)).sum()) / n)
        # (step2 07/10) Vancouver's class pass leaves the near-shore sea of English Bay as code 7 'other' (27-39 % of 72960_35200 / 72960_34560):
        # sea-coloured code-7 px (not a building) count as water and open, so those tiles get van_shore
        s7 = float(((code == 7) & seaish(rgb) & ~(bmask(mask) if mask is not None else False)).sum()) / n
        d['water'] += s7; d['open'] += s7
    return d

def water_key(d, lim=None):
    """(r2 05/11) the water-safe key for a window (or an L8 anchor crop) whose class pass is mostly water, or None. present_v1:
    the area map gave 'East Vancouver houses' to open False Creek windows (water 63-76 %, a few buildings, so open_key's
    building cap kept the area key) and to the L8 anchors over them; the L8 painted a suburb, hills and a horizon over the
    water and the L9 windows, held to the L8, kept it through every re-roll. Water >= lim: few buildings -> the shore key
    (beach or hard edge, shore_key), buildings -> van_water_bld (the buildings key that names the water)."""
    if d['water'] < (WATER_MAJ if lim is None else lim): return None
    return shore_key(d) if d['bld'] <= BLD_MAX else 'van_water_bld'

def shore_key(d):
    """(r2) van_shore named 'a sandy beach with driftwood logs' for all land on a shore tile: every seawall and rip-rap edge
    got an invented beach. A beach only where the render ground is sandy (the scene's shore type decides that: seawall
    shores render rock and paving), else the hard-edge shore key."""
    return 'van_shore' if d.get('sand', 0) >= SAND_MIN else 'van_shore_wall'

def open_key(d):
    """content key for a mostly-open tile, or None (keep the area key). Tuned on kits (07/10, CITY_TODAY_LOG OPEN-GROUND): open tiles
    (Jericho / Locarno / Spanish Banks) bld 0.000-0.080, house tiles (6_13, 11_15, 8_13 east) bld >= 0.10."""
    if d['bld'] > BLD_MAX or d['open'] < OPEN_MIN: return None
    if d['water'] >= WATER_SHORE: return shore_key(d)   # (step2 07/10) a lot of render sea: the water-safe key (open keys name no water;
    #   the AI painted Tudor streets / a horizon over the sea of kits 8_13 and 6_13's shore row on houses_w / meadow)
    if d.get('sand', 0) >= SAND_MIN: return 'van_beach'
    if d['tree'] >= TREE_WOODS: return 'van_woods'
    # (r2 05/11) a gravel works yard south of False Creek (render ground grey, grass 0.12-0.13 of the window) got van_meadow and
    # was painted as a lawn field: meadow only where the render ground is mostly green, else the bare-yard key
    if d.get('grass', 1.0) < GRASS_MEADOW * max(d.get('ground', 0.0), 1e-6): return 'van_yard'
    return 'van_meadow'
BLD_MAX, OPEN_MIN, SAND_MIN, TREE_WOODS = 0.08, 0.60, 0.06, 0.55
WATER_SHORE = 0.25
GRASS_MEADOW = 0.35   # (r2) green share of the render ground for the meadow key
WATER_MAJ, WATER_L8 = 0.40, 0.30   # (r2) water share for the water rule: a window / an L8 anchor crop (2048 L9 px)
KEEP_AREA = ('van_park', 'van_forest')   # woods area keys (building-free since 07/10) stay; with buildings > BLD_MAX -> <key>_bld (prep_b8)

def block_content(blk, tiles, ox, oy, s=4, size=1024, off=0):
    """{(gx, gy): measure} for 1024-px tiles of a block dir (R.class.png / R.mask.png / R.jpg), read at 1/s (cv2 reduced decode)"""
    import cv2
    rd = cv2.IMREAD_REDUCED_COLOR_4 if s == 4 else cv2.IMREAD_REDUCED_COLOR_2 if s == 2 else cv2.IMREAD_COLOR
    C = codeof(cv2.imread(f'{blk}/R.class.png', rd)[..., ::-1])
    M = cv2.imread(f'{blk}/R.mask.png', rd)[..., ::-1] if os.path.exists(f'{blk}/R.mask.png') else None
    R = cv2.imread(f'{blk}/R.jpg', rd)[..., ::-1]; n = size // s; out = {}
    for gx, gy in tiles:
        x, y = max(0, (gx - off - ox) // s), max(0, (gy - off - oy) // s)   # size/off: an L8 anchor's crop (X-512, 2048 px), clipped
        out[(gx, gy)] = measure(C[y:y + n, x:x + n], None if M is None else M[y:y + n, x:x + n], R[y:y + n, x:x + n])
    return out

if __name__ == '__main__':
    import sys, os, json
    wd = sys.argv[1]; s = int(sys.argv[2]) if len(sys.argv) > 2 else 4; sp = os.environ['SCR']
    meta = json.load(open(f'{wd}/blk/meta.json')); ox, oy = meta['ox'], meta['oy']
    C = codeof(np.load(f'{sp}/class{s}.npy', mmap_mode='r')); M = np.load(f'{sp}/mask{s}.npy', mmap_mode='r'); R = np.load(f'{sp}/R{s}.npy', mmap_mode='r')
    out = {}
    for l in open(f'{wd}/ai/P.txt'):
        if not l.startswith('C9:'): continue
        gx, gy = map(int, l.split()[0][3:].split(',')); k = l.split()[3]
        x, y, n = (gx - ox) // s, (gy - oy) // s, 1024 // s
        d = measure(C[y:y + n, x:x + n], M[y:y + n, x:x + n], R[y:y + n, x:x + n]); d['key'] = k
        d['crop'] = f'{(gx + 512) // 5120}_{(gy + 512) // 3072}'; d['new'] = open_key(d); out[f'{gx}_{gy}'] = d
    json.dump(out, open(f'{sp}/content_{os.path.basename(wd.rstrip("/"))}.json', 'w'), indent=0)
    print(len(out), 'tiles')
