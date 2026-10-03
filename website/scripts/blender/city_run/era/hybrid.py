"""era_auto hybrid.py <Y> <out dir> [margin px]: HYBRID continuity key = today's painting where the place is unchanged AND safe, the year's own whole
painting (raw_<Y>) everywhere else. env ERA_AREA.
  changed  = the engine's planned changes Y -> today (stageA GONE / NEW / CH / ADD / CROWN / FWK / FWN of seg <Y>_2026) + class changes of the two renders
             + cars of either render + trees that differ, dilated by MARGIN (default 25 px)
  unsafe   = TODAY-ONLY structure: today's painting has edges the year's own painting lacks (edge(today) - edge(raw) > 14, as leftover.py), dilated 9
  key = today * w + raw * (1 - w), w = feathered (unchanged & ~unsafe)  -> <out dir>/key_<Y>.png (+ raw_<Y>.png copy for the film engine)
Prints the share of the core that keeps today's painting.
(03/10) WATER_SHADOW (on by default): water darker in the later key than in the year's painting (a shadow of something not yet built) is not copied.
(03/10 k22) RED_LANE (year-gated, Y < 2013, on by default): today's red transit-lane paint is never copied into an earlier year.
(03/10 k22) env HYB_K22=1 (opt-in; the quarter's runs keep the earlier behaviour): WHOLE_OBJECT_KEY (a building bad in either year's raster is
bad in both) and SURFACE (a re-done ground surface flagged by its today-only marks is the year's own as a whole)."""
import sys, os, json, shutil, numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import keys as K
import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
Image.MAX_IMAGE_PIXELS = None
Y = int(sys.argv[1]); OUT = sys.argv[2]; MG = int(sys.argv[3]) if len(sys.argv) > 3 else 25; os.makedirs(OUT, exist_ok=True)
YB = int(os.environ.get('NEXT', 2026))   # CHAIN: the reference is the NEXT later key (OUT/key_<NEXT>.png), the changes those of segment (Y, NEXT)
raw = np.asarray(Image.open(f'{K.RUN}/paint/raw_{Y}.png').convert('RGB')).astype(np.float32); T = np.asarray(Image.open(f'{OUT}/key_{YB}.png' if YB != 2026 else f'{K.RUN}/paint/key_2026.png').convert('RGB')).astype(np.float32)
S = np.load(f'{K.WQ}seg/{Y}_{YB}/work/stageA.npz')
own = S['GONE'] | S['NEW'] | S['CH'] | S['ADD'] | S['CROWN'] | (S['FWK'] >= 0) | (S['FWN'] >= 0)
a_ = K.rd(K.blkdir(YB), 'R.class.png', K.QC); c8 = K.code_a(a_); car8 = K.car_a(a_); a_ = K.rd(K.blkdir(Y), 'R.class.png', K.QC); cY = K.code_a(a_); carY = K.car_a(a_); del a_
changed = own | (c8 != cY) | car8 | carY | K.dk((c8 == 3) != (cY == 3), 41) | (S['SO'] != -1)   # (i7) + shadows cast by changed buildings (engine SO) and by trees that differ (black shapes copied onto lots)
# (i7) prisms in only one of the two years (by key, the engine's occlusion-aware rasters): hero meshes (the Transamerica Pyramid) carry no gid in
# the passes, so class / gid tests missed them and the hybrid copied today's Pyramid into 1959
import pickle
PW = pickle.load(open(f'{K.WQ}seg/{Y}_{YB}/in/prisms_w.pkl', 'rb'))['prisms']; PA, PB = PW['1985'], PW['2026']
ka, kb = {b['key'] for b in PA}, {b['key'] for b in PB}
gone_i = np.array([b['key'] not in kb for b in PA] + [False]); new_i = np.array([b['key'] not in ka for b in PB] + [False])
MA, MB = S['M85'], S['M26']; pr = gone_i[np.where(MA >= 0, MA, len(PA))] | new_i[np.where(MB >= 0, MB, len(PB))]
changed = changed | pr
changed0 = own | pr   # STRUCTURAL changes only (events, prisms in one year): cars / trees / class flicker at a building's base do not count
changed = K.dk(changed, 2 * MG + 1)
def edges(g):
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3); return cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), 3)
lum = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
unsafe = K.dk((edges(lum(T)) - edges(lum(raw)) > 14) & (edges(lum(T)) > 24), 9)
if os.environ.get('UNSAFE_GROUND', '1') == '1': unsafe &= ~(K.bld(cY) & K.bld(c8))   # today-only things (palm shadows, cars, pier outlines) lie on ground / street / water; an unchanged building is safe
K22 = os.environ.get('HYB_K22', '0') == '1'
if K22:
    # (03/10 k22) RULE SURFACE (wa1 2006 c03, a playground's grass field became today's artificial turf): the unsafe test flags only the
    # turf's line markings (thin edges), so today's turf was copied round them and the year's grass showed through as bands in the shape of
    # the lines. On ground (both years' class), a region whose colour differs from the year's own painting at a coarse scale (Lab chroma,
    # blur 8 px, > 16) and that holds today-only marks (>= 300 unsafe px and >= 3 % of it) is a surface re-done since: unsafe as a whole.
    _lab = lambda a: cv2.GaussianBlur(cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32), (0, 0), 8)
    _LT, _LR = _lab(T), _lab(raw); _dc = np.hypot(_LT[..., 1] - _LR[..., 1], _LT[..., 2] - _LR[..., 2]); del _LT, _LR
    _g = (cY == 0) & (c8 == 0)
    _S = cv2.morphologyEx((_g & (_dc > 16)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    _n, _lb = cv2.connectedComponents(_S, connectivity=8)
    _cu = np.bincount(_lb.ravel(), weights=(unsafe & _g).ravel(), minlength=_n); _tt = np.bincount(_lb.ravel(), minlength=_n)
    _sel = (_cu >= 300) & (_cu >= 0.03 * _tt); _sel[0] = False
    _surf = K.dk(_sel[_lb], 5) & ~K.dk(K.bld(cY) | K.bld(c8), 3)
    print('K22 SURFACE re-done ground surfaces', int(_sel.sum()), 'px', int((_surf & ~unsafe).sum()))
    unsafe = unsafe | _surf
keep = ~changed & ~unsafe
if (Y < EC.MARKS_FROM) != (YB < EC.MARKS_FROM): keep &= ~((cY == 5) | (c8 == 5))   # (i9) never copy streets across the lane-paint boundary (era.py marks: 1970s): 1959 copied 1970's painted lanes
keep = cv2.morphologyEx(keep.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0     # no speckle of today's painting
# (i7) WHOLE OBJECTS ONLY (Daniel: a roof half orange half grey): a building (prism id in either year's raster, building class) is copied entirely
# or not at all: not copied when its OWN pixels changed (> 1 %, before the margin) or are > 3 % unsafe; else copied whole (margins of neighbours ignored)
bld_px = K.bld(cY) | K.bld(c8)
_wo = []
for M_, n_ in ((MA, len(PA)), (MB, len(PB))):
    ids = np.where((M_ >= 0) & bld_px, M_, n_); tot = np.bincount(ids.ravel(), minlength=n_ + 1).astype(np.float64)
    chg = np.bincount(ids.ravel(), weights=changed0.ravel(), minlength=n_ + 1); uns = np.bincount(ids.ravel(), weights=unsafe.ravel(), minlength=n_ + 1)
    bad = (chg > 0.01 * tot) | (uns > 0.03 * tot); good = ~bad & (tot > 0); bad[n_] = False; good[n_] = False
    if not K22: keep = np.where(bad[ids], False, np.where(good[ids], True, keep))
    else: _wo.append((ids, bad, good))
if K22:
    # (03/10 k22) RULE WHOLE_OBJECT_KEY (wa1 2006 c01: a thin white line, the parapet of today's octagonal tower, across the 2006 facade
    # behind it): the year-B pass ran after the year-A pass and its 'good' overrode A's 'bad', pixel by pixel. A building (prism key) bad in
    # either raster is bad in both, and a pixel is copied only when no raster calls its building bad.
    _bk = {P_[i]['key'] for (ids, bad, good), P_ in zip(_wo, (PA, PB)) for i in np.nonzero(bad[:len(P_)])[0].tolist()}
    _bad = np.zeros(keep.shape, bool); _good = np.zeros(keep.shape, bool)
    for (ids, bad, good), P_ in zip(_wo, (PA, PB)):
        kb = np.array([b['key'] in _bk for b in P_] + [False]); bad = bad | kb; good = good & ~kb
        _bad |= bad[ids]; _good |= good[ids]
    # ... and the override never reaches a pixel that shows ANOTHER building in the other render (the gid passes differ there, building
    # class in either; dilated 13 px for the painting's own drift): wa1 g149809 is the same record in both years (no engine event, so no
    # structural change), drawn as a low slab in the 2006 render and as today's octagonal tower in 2026; the tower's top edge lay on the
    # building behind (g149773, 'good') and was copied as a white line. There the margin of the class change decides, as for any pixel.
    _gY = K.gid_a(K.rd(K.blkdir(Y), 'R.gid.png', K.QC)); _g8 = K.gid_a(K.rd(K.blkdir(YB), 'R.gid.png', K.QC))
    _gb = K.dk((_gY != _g8) & bld_px, 13); del _gY, _g8
    _good &= ~_gb
    print('K22 WHOLE_OBJECT_KEY: px no longer copied', int((np.where(_good, True, keep) & (_bad | _gb)).sum()))
    keep = np.where(_bad, False, np.where(_good, True, keep))
# (03/10 k22) RULE RED_LANE: SF's red transit-only lanes were painted from 2013 (SFMTA red transit lanes, Muni Forward; CONVENTION 2013 for
# all): before RED_LANE_YEAR, today's red-hued street pixels (hue <= 8 or >= 172 of 180, sat > 70, val > 60, on the street class of either
# year; opened 3 px, dilated 9) are never copied (wa1 2006 c01: red lane patches in 2006). RED_LANE=0 = before.
if Y < int(os.environ.get('RED_LANE_YEAR', EC.RED_LANE_BEFORE)) and os.environ.get('RED_LANE', '1') == '1':
    _hsv = cv2.cvtColor(np.clip(T, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    _red = ((_hsv[..., 0] <= 8) | (_hsv[..., 0] >= 172)) & (_hsv[..., 1] > 70) & (_hsv[..., 2] > 60) & ((c8 == 5) | (cY == 5)); del _hsv
    _red = K.dk(cv2.morphologyEx(_red.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0, 9)
    print('RED_LANE px not copied', int((keep & _red).sum())); keep &= ~_red
# (03/10 era_auto) RULE WATER_SHADOW: water in both years, but the later key clearly darker than the year's own painting = a shadow cast on the
# water by a pier / shed / ship that does not stand yet (the shadow-owner rule covers buildings only; i13 1906 drew 1915's Pier 17 as a dark
# ghost on open water): take the year's painting there. Blurred luminance (sigma 4), darker by > WATER_SHADOW_D (6; 12 left a broad shadow patch), dilated 9. WATER_SHADOW=0 = before.
if os.environ.get('WATER_SHADOW', '1') == '1':
    _wat = (cY == 1) & (c8 == 1)
    _dl = cv2.GaussianBlur(lum(raw).astype(np.float32), (0, 0), 4) - cv2.GaussianBlur(lum(T).astype(np.float32), (0, 0), 4)
    _ws = K.dk(_wat & (_dl > float(os.environ.get('WATER_SHADOW_D', '6'))), 9) & _wat
    print('WATER_SHADOW px not copied', int((keep & _ws).sum())); keep &= ~_ws; del _dl
# (03/10 era_auto) RULE FIRE_GROUND (on by default): the 1906 fire changed the GROUND of the whole burned district (ash, rubble; then the
# rebuilt city), not only its buildings, so streets / lots / yards there are "unchanged" for the structure tests but look different. Sweep i15
# 1905 vs 1906 (c01, c02): the hybrid copied 1906 ash patches into 1905's streets and yards (grey and white smears). Ground states: before the fire
# (<= 1905), the ash years (1906-1908; CONVENTION, the burned district was cleared and mostly rebuilt by 1909-1915), rebuilt (>= 1909). When the
# year and the NEXT key are in different states, nothing inside the burned district (DataSF ff3a-iqhv rings, burnmask.py = era.burned) is copied.
def _fire_state(y): return 0 if y <= EC.FIRE_STATE[0] else (1 if y <= EC.FIRE_STATE[1] else 2)
if os.environ.get('FIRE_GROUND', '1') == '1' and _fire_state(Y) != _fire_state(YB):
    # ... and outside it no GROUND is copied either: the ash-year painting is made with the fire prompt (keys.py ERA PROMPTS 2), and the AI lays
    # ash and rubble on unburned ground too (i15 1905 c02, by the Ferry Building); only unchanged buildings (in both renders) are copied.
    import burnmask; _bm = burnmask.burn_core() | ~(K.bld(cY) & K.bld(c8))
    print('FIRE_GROUND burned-district + ground px not copied', int((keep & _bm).sum())); keep &= ~_bm; del _bm
st_whole = float(keep.mean())
w = np.clip(cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 3), 0, 1) * keep                        # feather inward only
key = T * w[..., None] + raw * (1 - w[..., None])
# (i7) a street-blotch fill was tried and REJECTED: it smeared real tree shadows (02/10)
# (i9) K9 NO LANE PAINT BEFORE THE 1970s (era.py marks): the AI paints lane lines / crosswalks / stall stripes whatever the prompt says. On the
# year's street pixels, thin bright or yellow marks (top-hat: brighter than the 15 px opening, thin) are filled from the asphalt around them.
if Y < EC.MARKS_FROM:
    kk = np.clip(key, 0, 255).astype(np.uint8); g = cv2.cvtColor(kk, cv2.COLOR_RGB2GRAY)
    th = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))).astype(np.int16)
    hsv = cv2.cvtColor(kk, cv2.COLOR_RGB2HSV); yel = (hsv[..., 0] > 10) & (hsv[..., 0] < 38) & (hsv[..., 1] > 70)
    street = ((cY == 5) | (cY == 0) | (cY == 7)) & ~K.dk(K.bld(cY) | (cY == 3) | carY | (cY == 1), 7) & ~K.dk(lum(key) < 50, 5)   # paved / flat ground, away from trees, buildings, cars, water, deep shade
    marks = street & ((th > 22) | (yel & (th > 6)))
    marks = marks & ~(cv2.morphologyEx(marks.astype(np.uint8), cv2.MORPH_OPEN, np.ones((17, 17), np.uint8)) > 0)   # marks up to ~16 px thick (zebra bars), not slabs
    marks = K.dk(cv2.morphologyEx(marks.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0, 5) & street
    okm = (street & ~K.dk(marks, 5)).astype(np.float32); num = cv2.GaussianBlur(key * okm[..., None], (0, 0), 14); den = cv2.GaussianBlur(okm, (0, 0), 14)[..., None]
    fm = np.clip(cv2.GaussianBlur(marks.astype(np.float32), (0, 0), 1.2), 0, 1)[..., None] * (den > 0.12); key = key * (1 - fm) + (num / np.maximum(den, 0.12)) * fm   # only where clean asphalt surrounds the mark
    print('K9 lane paint removed px', int(marks.sum()))
Image.fromarray(np.round(key).astype(np.uint8)).save(f'{OUT}/key_{Y}.png', compress_level=1); shutil.copy(f'{OUT}/key_{Y}.png', f'{OUT}/raw_{Y}.png')
print('HYBRID', Y, 'today kept %.3f' % keep.mean(), 'prism-only-one-year %.3f' % pr.mean(), 'changed %.3f' % changed.mean(), 'unsafe %.3f' % (unsafe & ~changed).mean(), '->', OUT)
