"""era_auto check.py: the automatic ANACHRONISM CHECK of one key painting of an AREA (env ERA_AREA), then the automatic re-paint.
   python3 check.py <Y> [key.png] [--fix] [--out prefix]
A pixel is suspect when the key still shows TODAY's painting there (|key - today| <= 6) but the year's own data says something else stood:
  lm      a different landmark model (or none) covers the pixel in the year's prisms than today's       (the Hyatt over the 1925 PG&E-Matson)
  struct  a lost / new structure (era.STRUCTURES, era_lost, today's ramps) is visible in either year     (the Embarcadero Freeway deck)
  late    today's building (gid) does not stand in the year (prisms), yet its pixels are today's painting
  cars    today's car pixels shown where the year's render has no car                                   (today's fleet in the past)
  trees   today's tree pixels shown where the year's render has no tree                                 (palms planted later)
  rails   today's rail lines (sourced opening years) that did not run in the year, still today's painting
  ghost   thin dark lines on water (a lost pier's ghost, a class seam)
  invent  (inside the mask) a small saturated blob the year's render does not have (an AI-invented car / sign)
Clusters >= MINPX px are listed (bbox, px, reason). --fix: every flagged cluster where the year's raw AI painting differs from today (its tile
was painted) takes the raw painting (feathered); the rest is written as tiles to repaint (AI) in check_<Y>.json 'repaint_tiles'.
Exit 0 = clean, 1 = flags."""
import sys, os, json, argparse, numpy as np, cv2, scipy.ndimage as nd
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import keys as K
import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser(); ap.add_argument('year', type=int); ap.add_argument('key', nargs='?'); ap.add_argument('--fix', action='store_true'); ap.add_argument('--out')
ap.add_argument('--minpx', type=int, default=int(os.environ.get('MINPX', 400)))
a = ap.parse_args(); Y = a.year; RUN = K.RUN
kp = a.key or f'{RUN}/paint/key_{Y}.png'
KY = np.asarray(Image.open(kp).convert('RGB')).astype(np.int16); T = np.asarray(Image.open(f'{RUN}/paint/key_2026.png').convert('RGB')).astype(np.int16)
today = np.abs(KY - T).max(-1) <= 6
_a = K.rd(f'{K.V8}/blk', 'R.class.png', K.QC); c8 = K.code_a(_a); car8 = K.car_a(_a); g8 = K.gid_a(K.rd(f'{K.V8}/blk', 'R.gid.png', K.QC))
B = K.blkdir(Y); _a = K.rd(B, 'R.class.png', K.QC); cy = K.code_a(_a); cary = K.car_a(_a); gy = K.gid_a(K.rd(B, 'R.gid.png', K.QC)); del _a
SG = K.stage(Y); F = {}
# EVIDENCE that the year looks different here: its own AI painting (raw) or its render differs from today's. Where both agree with today,
# showing today's painting is right even if the prism rasters (coarser than the landmark models) say another model covers the pixel.
_rp = f'{RUN}/paint/raw_{Y}.png'
_rawd = (np.abs(np.asarray(Image.open(_rp).convert('RGB')).astype(np.int16) - T).max(-1) > 12) if os.path.exists(_rp) else np.zeros(today.shape, bool)
_ga = cv2.GaussianBlur(K.rd(f'{K.V8}/blk', 'R.jpg', K.QC, 'L').astype(np.float32), (0, 0), 2)
_gb = cv2.GaussianBlur(K.rd(B, 'R.jpg', K.QC, 'L').astype(np.float32), (0, 0), 2)
EVID = K.dk(_rawd | (np.abs(np.log((_gb + 8) / (_ga + 8))) > 0.25), 5); del _ga, _gb, _rawd
today_e = today & EVID
F['lm'] = today_e & (c8 == 4) & (SG['LMY'] != SG['LM26'])
FWs = SG['FWK'] | SG['FWN']; F['struct'] = today_e & FWs
rawp = f'{RUN}/paint/raw_{Y}.png' if not os.environ.get('RAW') else os.environ['RAW']
if os.path.exists(rawp):   # the structure as the year's own AI painting shows it: the key must agree there (local mean |d| over 15 px)
    R_ = np.asarray(Image.open(rawp).convert('RGB')).astype(np.float32); d_ = cv2.blur(np.abs(KY.astype(np.float32) - R_).mean(-1), (15, 15))
    F['struct'] |= FWs & (d_ > 22) & ~K.dk(K.invented_veg(Y, R_), 15); del R_   # K4 removed the AI's invented trees there: not a structure error
standing = np.array(sorted({b['gid'] for b in K.prisms(Y) if b['kind'] == 'record' and b.get('gid')}), np.int64)
F['late'] = today_e & K.bld(c8) & (g8 > 0) & ~np.isin(g8, standing) & ~((cy == c8) & (gy == g8))
F['cars'] = today & car8 & ~K.dk(cary, 5)
if Y >= EC.DECK_CARS_FROM: F['cars'] &= ~np.load(f'{RUN}/parts_{Y}.npz')['DECK']   # K1 keeps the parked cars of an unchanged deck lot from 1950
F['trees'] = today_e & (c8 == 3) & (cy != 3) & ~K.bld(cy)
RG, _ = K.rails_gone(Y); F['rails'] = today & RG & ~K.bld(cy) & (c8 != 3)          # today's rail lines that did not run in the year
g = cv2.cvtColor(np.clip(KY, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32); med = cv2.medianBlur(g.astype(np.uint8), 51).astype(np.float32)
wat = (cy == 1) & (c8 == 1); s_ = nd.binary_opening(wat & (g < med - 10), np.ones((2, 2)))
lab, n = nd.label(s_); ok = np.zeros(n + 1, bool)
for i, sl in enumerate(nd.find_objects(lab), 1):
    hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start; ok[i] = max(hh, ww) >= 120 and (lab[sl] == i).sum() < 0.25 * hh * ww
F['ghost'] = ok[lab] & ~today          # a streak the key brought in (where the key is today's painting, it is today's thing)
# invent: inside the mask, a compact saturated blob (chroma > 60, 3x the local chroma) on ground / street where the render shows no car / object
mk = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[K.sl8] > 0
hsv = cv2.cvtColor(np.clip(KY, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32); chroma = hsv[..., 1] * hsv[..., 2] / 255.0
loc = cv2.blur(chroma, (61, 61)); sat = mk & (chroma > 60) & (chroma > 3 * loc) & ((cy == 0) | (cy == 5)) & ~K.dk(cary, 7)
lab, n = nd.label(K.dk(sat, 3)); ok = np.zeros(n + 1, bool)
for i, sl in enumerate(nd.find_objects(lab), 1):
    hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start; ok[i] = 12 <= max(hh, ww) <= 90
F['invent'] = ok[lab] & sat
F['veg'] = K.invented_veg(Y, KY)                      # vegetation the AI invented (K4 should have removed it)
rep = dict(year=Y, key=kp, clusters=[], px={}); flag = np.zeros(today.shape, np.uint8); CL = np.zeros(today.shape, bool)
for i, (k, m) in enumerate(F.items(), 1):
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0 if k != 'invent' else m; rep['px'][k] = int(m.sum())
    lab, n = nd.label(cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)))
    mp = (a.minpx if k != 'invent' else 60)
    for j, sl in enumerate(nd.find_objects(lab), 1):
        px = int((m[sl] & (lab[sl] == j)).sum())
        if px >= mp:
            rep['clusters'].append(dict(reason=k, px=px, bbox=[sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])); z = (lab[sl] == j) & m[sl]; flag[sl][z] = i
            if k not in ('veg', 'invent'): CL[sl] |= (lab[sl] == j)      # the AI painting itself is the source of these: never re-painted from it
rep['clusters'].sort(key=lambda c: -c['px']); rep['n_flags'] = len(rep['clusters'])
out = a.out or f'{RUN}/checks/check_{Y}'; os.makedirs(os.path.dirname(out), exist_ok=True)
if a.fix and rep['n_flags']:
    raw = np.asarray(Image.open(f'{RUN}/paint/raw_{Y}.png').convert('RGB')).astype(np.int16)
    painted = K.dk(np.abs(raw - T).max(-1) > 6, 25)               # the year's tiles exist there (raw differs from today somewhere near)
    fixm = K.dk(CL, 15) & painted; f = K.feather(fixm, 3)
    KY2 = np.round(KY * (1 - f) + raw * f).astype(np.uint8); Image.fromarray(KY2).save(kp, compress_level=1)
    left = CL & ~painted; ys, xs = np.nonzero(left); tl = sorted({(int((x + K.QC[0]) // 640 * 640), int((y + K.QC[1]) // 640 * 640)) for y, x in zip(ys[::50], xs[::50])})
    rep['fixed_px'] = int(fixm.sum()); rep['repaint_tiles'] = tl; print('FIX', Y, 'raw painting on', rep['fixed_px'], 'px; tiles to repaint (AI)', len(tl))
json.dump(rep, open(out + '.json', 'w'), indent=1); Image.fromarray(flag).save(out + '_flags.png')
sm = cv2.resize(np.clip(KY, 0, 255).astype(np.uint8), (KY.shape[1] // 8, KY.shape[0] // 8), interpolation=cv2.INTER_AREA)
col = np.array([[0, 0, 0], [255, 0, 255], [255, 140, 0], [255, 0, 0], [0, 255, 255], [0, 255, 0], [255, 255, 255], [255, 255, 0], [0, 0, 255], [128, 255, 128]], np.uint8)
fs = cv2.resize(flag, (sm.shape[1], sm.shape[0]), interpolation=cv2.INTER_NEAREST); fs = cv2.dilate(fs, np.ones((3, 3), np.uint8))
sm[fs > 0] = (0.3 * sm[fs > 0] + 0.7 * col[fs[fs > 0]]).astype(np.uint8)
Image.fromarray(sm).save(out + '_sheet.jpg', quality=85)
print('CHECK', Y, os.path.basename(kp), 'flags', rep['n_flags'], rep['px'], [(c['reason'], c['px'], c['bbox']) for c in rep['clusters'][:8]])
sys.exit(1 if rep['n_flags'] else 0)
