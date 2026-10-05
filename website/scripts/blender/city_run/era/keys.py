"""era_auto keys.py: the key-year paintings of an AREA, automatically (no per-place fixes). Generalises qh2/qh.py + the quarter's hand fixes
(step2d_keys.py, freeway_fix.py, lm_fix_1959) into RULES that read only the data (prisms, structures, class/gid passes) of the area.
   env ERA_AREA=<area.json> (QC core, RA render area, grid = the ctx mosaic grid of today's block render, V8 today's block, RUN iteration dir, WQ engine root)
   python3 keys.py mosaic <Y>          RUN/blk_<Y>, RUN/ctx_<Y> (+ R_pt.jpg pretone) from RUN/render/<tag><Y>{b,p}_<i>_<j>...
   python3 keys.py mask <Y>            RUN/mask_<Y>.png (ctx grid) + mask_<Y>.json (px per rule); needs WQ/seg/<Y>_2026/work/stageA.npz (prep)
   python3 keys.py ai <Y,Y> <dir> <out> one AI window dir (tiles touching the masks; v8 keys, v7 seeds) - as qh.py
   python3 keys.py post <Y>            quilt + finish of the year (city/run post_sb), key = today * (1 - m) + year * m -> RUN/paint/key_<Y>.png, raw_<Y>.png
   python3 keys.py rules <Y>           the automatic key repairs (water under future things, ghost streaks, cars on decks) -> key_<Y>.png (in place, backup key_<Y>_post.png)
   python3 keys.py today               RUN/paint/key_2026.png = today's final painting of the core
RULES (each logged with its px count in mask_<Y>.json / rules_<Y>.json):
  M1 same building = same gid AND same record height + footprint in both years (prisms)                                  [qh v2]
  M2 landmark models (gid 0) are the same only where the SAME landmark model covers the pixel in both years' prisms         [was lm_fix_1959: Hyatt over the 1925 PG&E-Matson]
  M3 lost / new STRUCTURES (era.STRUCTURES viaducts, era_lost halls, today's ramps) visible in either year = changed      [was freeway_fix: the class pass labels a deck 'street']
  M4 cars follow the year: today's cars out, the year's own period cars in (both car zones repainted)                    [was CARS_IN + LOTS_KEEP]
  M5 a waterfront deck today (object/landmark class over the year's plain ground near water) is unchanged (the era render lacks the deck model) [DECK_SAME]
  M6 trees: a tree of today absent in the year (or the reverse) is repainted                                               [TREES_IN]
  M6s the shadows of today's trees the year lacks (within 60 px, where the year's render is brighter) are repainted          [new, i3]
  K7 shadows of today's trees the year lacks that only today's AI painting has: the year's own painting there             [new, i3]
  M11 holes in the mask under 30k px (enclosed unmasked islands) are filled                                                [new, i3]
  M7 a lot whose cars change is repainted as a whole (the lot surface follows its cars)                                    [new]
  M9 today's rail lines that did not run in the year (sourced opening years, overlay k8 RAIL_YEAR_FIX) are repainted  [new: the F line / MMX on the Embarcadero]
  M10 before 2009: green bike paint of today's streets (it exists only in today's AI painting) is the year's own         [new]
  M8 years before 1950 (the period's pavement differs: era.pavement): every street pixel is the year's own                [was key_1959C 'era streets']
  K5 1950-1971: today's lane paint removed from today's asphalt (filled from the asphalt around it)                         [i3: M8's AI streets had creases]
  K1 cars on an unchanged deck (M5): kept from 1950 (the era's kerbs >= 40 % full), inpainted from the deck's paving before   [was step2d DECK]
  K2 water in the year where today has a thing on the water (future piers, moored boats): clean water copied along the water [was step2d water_fill]
  K4 vegetation the AI invented where the year's render has no tree and is not green: filled from the surrounding ground     [new, 1959]
  K3 thin dark streaks on water (a lost pier's ghost / a class seam): filled the same way                                  [was step2d streak]
  K4R (K4_REPAIR=1, k25) invented vegetation REPAIRED (k4r.py): any year K4's blobs, in the ash years also every green blob inside the 1906
      burned district (burnmask.py); whole crowns only; small ones from the year's render in the painting's colour, big ones listed for a
      RE-PAINT of their tile (RUN/k4p_<Y>.json -> keys.py k4p_jobs / k4p_merge)                                                  [new, k25]
  FIRE_TILES (FIRE_TILES=1, k25) the 1906-07 fire wording only on tiles that hold burned district: '_fire' (all burned), '_fireedge'
      (part burned: 'ruins only where the render shows them'), none outside (the AI painted ash by the Ferry Building)              [new, k25]
"""
import sys, os, json, glob, shutil, subprocess, pickle, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
Image.MAX_IMAGE_PIXELS = None
A = json.load(open(os.environ['ERA_AREA'])); RUN = A['RUN']; W_ = '/Users/daniel/code/qipu-render-work'; B52 = f'{W_}/combo/block52'
V8 = A['V8']; V7 = A['V7']; QC = A['QC']; RA = A['RA']; G = A['grid']; BOX, BOY, PAD = G['BOX'], G['BOY'], G['PAD']
WQ = A['WQ'].rstrip('/') + '/'; PREP = f'{W_}/era_anim/auto/prep'
sys.path.insert(0, '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/e85'); import e85 as E5
FILES = [('R.jpg', 'RGB'), ('R.class.png', 'RGB'), ('R.mask.png', 'RGB'), ('R.gid.png', 'RGB'), ('R.part.png', 'L')]
QY = QC[1] - RA[1]; QW, QH = QC[2] - QC[0], QC[3] - QC[1]
sl8 = np.s_[QC[1] - BOY:QC[3] - BOY, QC[0] - BOX:QC[2] - BOX]            # the core on the ctx grid
bld = lambda c: (c == 6) | (c == 2) | (c == 4)
dk = lambda m, r: cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))) > 0
feather = lambda m, r=4: np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), r), 0, 1)[..., None]
def log(*a): print(*a, flush=True)

# reads of a mosaic dir (meta.json: its origin ox, oy) cropped to a global box: an area can read its slice of a whole block's mosaic (b8 sub-areas)
def _box(d, R): m = json.load(open(f'{d}/meta.json')); return (R[0] - m['ox'], R[1] - m['oy'], R[2] - m['ox'], R[3] - m['oy'])
def rd(d, fn, R=None, mode='RGB'): R = R or RA; return np.asarray(Image.open(f'{d}/{fn}').crop(_box(d, R)).convert(mode))
def code_a(a): c = a > 128; return (c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]).astype(np.uint8)
def gid_a(a): a = a.astype(np.int32); return (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
def car_a(a): return (a[..., 0] > 200) & (a[..., 1] > 150) & (a[..., 1] < 220) & (a[..., 2] < 60)
def blkdir(Y): return f'{V8}/blk' if int(Y) == 2026 else f'{RUN}/blk_{Y}'

def crops():
    """the z9 5120 x 3072 frames covering RA and the part of each that is inside RA (x0, x1, y0, y1 fractions, y from the frame's bottom)"""
    FW, FH = 5120, 3072; out = []
    for i in range(RA[0] // FW, -(-RA[2] // FW)):
        for j in range(RA[1] // FH, -(-RA[3] // FH)):
            x0 = max(0, (RA[0] - i * FW) / FW); x1 = min(1, (RA[2] - i * FW) / FW); ya = max(0, (RA[1] - j * FH) / FH); yb = min(1, (RA[3] - j * FH) / FH)
            out.append((i, j, (x0, x1, 1 - yb, 1 - ya)))
    return out

def mosaic(Y):
    Y = int(Y); B = f'{RUN}/blk_{Y}'; C = f'{RUN}/ctx_{Y}'; os.makedirs(B, exist_ok=True); os.makedirs(C, exist_ok=True)
    w, h = RA[2] - RA[0], RA[3] - RA[1]; RD = os.environ.get('RDIR', f'{RUN}/render'); RP = os.environ.get('RPFX', A['tag'])
    for fn, mode in FILES:
        a = np.zeros((h, w) + ((3,) if mode == 'RGB' else ()), np.uint8); got = np.zeros((h, w), bool)
        for i, j, (x0, x1, y0, y1) in crops():
            px = round(i * 5120 + x0 * 5120) - RA[0]; py = round(j * 3072 + (1 - y1) * 3072) - RA[1]
            f = f'{RD}/{RP}{Y}b_{i}_{j}_z9_{i}_{j}.jpg' if fn == 'R.jpg' else f'{RD}/{RP}{Y}p_{i}_{j}_z9_{i}_{j}{fn[1:]}'
            c = np.asarray(Image.open(f).convert(mode)); c = c[:h - py, :w - px]
            a[py:py + c.shape[0], px:px + c.shape[1]] = c; got[py:py + c.shape[0], px:px + c.shape[1]] = True
        assert got.all(), (Y, fn, (~got).sum())
        (Image.fromarray(a).save(f'{B}/{fn}', quality=96) if fn.endswith('jpg') else Image.fromarray(a).save(f'{B}/{fn}'))
        big = np.array(Image.open(f'{V8}/blk/{fn}').convert(mode)); big[RA[1] - BOY:RA[3] - BOY, RA[0] - BOX:RA[2] - BOX] = a
        (Image.fromarray(big).save(f'{C}/{fn}', quality=96) if fn.endswith('jpg') else Image.fromarray(big).save(f'{C}/{fn}')); del big
    json.dump(dict(ox=RA[0], oy=RA[1], pad_top=0), open(f'{B}/meta.json', 'w'))
    json.dump(dict(ox=BOX, oy=BOY, block=[BOX, BOY + PAD, BOX + G['W'], BOY + G['H']], pad_top=PAD), open(f'{C}/meta.json', 'w'))
    subprocess.run(['python3', f'{W_}/ai/look_regain/pretone_block.py', f'y{Y}', f'{C}/R_pt.jpg'], env=dict(os.environ, CAMO='0', ROOFN='1', PT_DIR=C), check=True)
    log('MOSAIC', Y, B, C)

def prisms(Y): return pickle.load(open(f'{WQ}years/{Y}/prisms.pkl', 'rb'))['prisms']

def same_gids(Y, BASE=2026):
    sig = lambda b: (round(b['h'], 1), tuple(np.round(np.array(b['ring'], float).ravel(), 1)))
    T = {b['gid']: sig(b) for b in prisms(BASE) if b['kind'] == 'record'}
    return {b['gid'] for b in prisms(Y) if b['kind'] == 'record' and T.get(b['gid']) == sig(b)}

def stage(Y):
    """the engine's own per-pixel rasters of the segment (Y, today) on the core: prism ids (landmarks jointly), structures (FWK = standing in Y,
    gone today; FWN = standing today, not in Y)"""
    S = np.load(f'{WQ}seg/{Y}_2026/work/stageA.npz'); D = pickle.load(open(f'{WQ}seg/{Y}_2026/in/prisms_w.pkl', 'rb'))['prisms']
    lmn = lambda P, M: np.array([(b.get('lm') or '') if b['kind'] == 'lm' else '' for b in P] + [''])[np.where(M >= 0, M, len(P))]
    return dict(LMY=lmn(D['1985'], S['M85']), LM26=lmn(D['2026'], S['M26']), FWK=S['FWK'] >= 0, FWN=S['FWN'] >= 0)

def rails_gone(Y, width_m=7.0):
    """M9: rail lines in only one of the two (today's lines the year lacks, the year's lost lines), sourced years of the area overlay, as a core px band"""
    sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions'); import stage as S_
    S_.SNAP = EC.SNAP_ROOT + A.get('snap', EC.SNAP); sys.path.insert(0, S_.SNAP)
    sys.path.insert(0, os.environ.get('ERA_K', A.get('overlay') or EC.RAIL_OVERLAY))
    import importlib; EA = importlib.import_module('era'); import terrain_hq as T_
    mom = 1906 + 147 / 365.0 if Y == EC.FIRE_CHECKPOINT else Y + 0.5
    key = lambda r: (round(r[0]), round(r[1]), round(r[2]), round(r[3]))
    R0 = EA.rails(mom); R1 = EA.rails(2026.5); then = {key(r) for r in R0}; nowk = {key(r) for r in R1}
    now = [r for r in R1 if key(r) not in then] + [r for r in R0 if key(r) not in nowk]   # today's lines the year lacks + the year's lost lines (the Belt Railroad)
    M = np.zeros((QH, QW), np.uint8)
    for x0, y0, x1, y1, _k in now:
        xs = np.array([x0, x1], float); ys = np.array([y0, y1], float); z = T_.true_ground(xs, ys)
        X, Yc = S_.w2c(xs, ys, z); px = 2 * (X + S_.OX) - QC[0]; py = 2 * (Yc + S_.OY) - QC[1]
        X2, Y2 = S_.w2c(xs + width_m, ys, z); w = max(3, int(round(abs(2 * (X2[0] - X[0])))))
        if (px < -50).all() or (px > QW + 50).all() or (py < -50).all() or (py > QH + 50).all(): continue
        cv2.line(M, (int(px[0]), int(py[0])), (int(px[1]), int(py[1])), 1, w)
    return M > 0, len(now)

def mask(Y):
    Y = int(Y); B = f'{RUN}/blk_{Y}'; st = {}
    sl = np.s_[RA[1] - BOY:RA[3] - BOY, RA[0] - BOX:RA[2] - BOX]; VB = f'{V8}/blk'
    A8 = rd(VB, 'R.jpg', mode='L').astype(np.float32); Bm = rd(B, 'R.jpg', mode='L').astype(np.float32)
    lr = np.log((cv2.GaussianBlur(Bm, (0, 0), 2) + 8) / (cv2.GaussianBlur(A8, (0, 0), 2) + 8)); del A8, Bm
    a_ = rd(VB, 'R.class.png'); c8 = code_a(a_); car8 = car_a(a_); a_ = rd(B, 'R.class.png'); c5 = code_a(a_); car5 = car_a(a_); del a_; carz = dk(car8 | car5, 9)
    g8 = gid_a(rd(VB, 'R.gid.png')); g5 = gid_a(rd(B, 'R.gid.png'))
    U = np.array(sorted(same_gids(Y)), np.int64)
    # M2: landmark-to-landmark is the same only under the same landmark model (the engine's prism rasters, core rows; context rows: class only)
    SG = stage(Y); lm_same = np.zeros(c8.shape, bool); lm_same[:QY] = True; lm_same[QY:] = SG['LMY'] == SG['LM26']   # both unnamed (a pier shed model in both years) = same; named: same model only
    lmll = (g8 == 0) & (c8 == 4) & (c5 == 4); st['M2_landmark_swaps'] = int((lmll & ~lm_same)[QY:].sum())
    same = bld(c8) & bld(c5) & (g8 == g5) & (((g8 > 0) & np.isin(g8, U)) | (lmll & lm_same))
    Dg = (bld(c8) | bld(c5)) & ~same & ~carz; Dg &= ~((c8 == 3) | (c5 == 3))
    Dc = (c8 != c5) & ~carz & ~same
    flat = lambda c: (c == 0) | (c == 1) | (c == 5) | (c == 7)
    Dc &= ~(((c8 == 3) & flat(c5)) | ((c5 == 3) & flat(c8))); Dc &= ~(((c8 == 7) & (c5 == 1)) | ((c8 == 1) & (c5 == 7)))
    Dc &= ~(((c8 == 3) & bld(c5) & (g5 > 0) & np.isin(g5, U)) | ((c5 == 3) & bld(c8) & (g8 > 0) & np.isin(g8, U)))
    op = lambda m, r: cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r))) > 0
    # M6 trees
    tr = ((c8 == 3) & (c5 != 3) & ~bld(c5)) | ((c5 == 3) & (c8 != 3) & ~bld(c8)); Dc |= tr; st['M6_trees'] = int(tr[QY:].sum())
    # M6s the shadows of today's trees the year does not have (ghost palm shadows on the Embarcadero, i3): flat ground / street within 80 px of such
    # a tree where the year's render is brighter than today's (lr > 0.18: the shadow is gone there)
    tgone = (c8 == 3) & (c5 != 3) & ~bld(c5); flatb = ((c8 == 0) | (c8 == 5) | (c8 == 7)) & ((c5 == 0) | (c5 == 5) | (c5 == 7))
    tsh = dk(tgone, 121) & flatb & (lr > 0.18); tsh = op(tsh, 3); Dc |= tsh; st['M6s_tree_shadows'] = int(tsh[QY:].sum())   # (i3) NOT repainted (era streets carry
    # the render's creases): K6 lifts them instead by the render brightness ratio; saved as TSH + TSHG (gain)
    TSHG = np.exp(np.clip(cv2.GaussianBlur(lr.astype(np.float32), (0, 0), 3), 0, 1.2)).astype(np.float16)
    # M5 waterfront decks
    wat8 = c8 == 1; near = dk(wat8, 401); DECK = near & ((c8 == 4) | (c8 == 7) | ((c8 == 6) & (g8 == 0))) & (c5 == 0); Dg &= ~DECK; Dc &= ~DECK; st['M5_deck_same'] = int(DECK[QY:].sum())   # (i1) landmark-model surfaces read as facade with gid 0 (the Pier 1-3 deck)
    Gm = op(Dg | Dc, 5); lab, n = nd.label(Gm); sz = nd.sum(Gm, lab, np.arange(1, n + 1)); keep = np.zeros(n + 1, bool); keep[1:] = sz >= 60; Gm = keep[lab]
    # M3 structures (either year), their own pixels + a 60 px corridor of ground beside them (their shadow, the roadway under the deck)
    FW = np.zeros(c8.shape, bool); FW[QY:] = SG['FWK'] | SG['FWN']; st['M3_structures'] = int(FW.sum())
    FWc = dk(FW, 121) & ~bld(c8) & ~bld(c5) & ~((c8 == 1) & (c5 == 1)); st['M3_corridor'] = int((FWc & ~FW).sum())
    Gm |= dk(FW, 7) | FWc
    # M4 cars both ways; K1 cars on an unchanged deck are NOT repainted (inpainted after post)
    carchg = (car8 & ~car5) | (car5 & ~car8); cz = dk(carchg, 7) & ~DECK; Gm |= cz; st['M4_cars'] = int(cz[QY:].sum())
    # M7 a lot whose cars change: the lot's ground (non-street, non-building ground connected to the car zone within 25 px) follows them
    ground = ((c8 == 0) | (c8 == 7)) & ((c5 == 0) | (c5 == 7)) & ~DECK
    lotz = dk(carchg & ~dk(c5 == 5, 15), 51) & ground; st['M7_lots'] = int((lotz & ~Gm)[QY:].sum()); Gm |= lotz
    # M10 green bike paint (SFMTA green bike lanes / boxes, from 2009 on; CONVENTION on the year, verify): only in today's AI painting of the streets
    if Y < EC.BIKE_GREEN_FROM and os.path.exists(f'{RUN}/paint/key_2026.png'):
        T_ = np.asarray(Image.open(f'{RUN}/paint/key_2026.png').convert('RGB')).astype(np.int16)
        grn = (T_[..., 1] - np.maximum(T_[..., 0], T_[..., 2]) > 18) & (T_[..., 1] > 70); del T_
        gz = np.zeros(c8.shape, bool); gz[QY:] = grn & ((c8[QY:] == 5) | (c8[QY:] == 0)) & (c5[QY:] != 3); gz = dk(op(gz, 3), 9)
        st['M10_green_paint'] = int((gz & ~Gm).sum()); Gm |= gz
    # M8 before the 1970s' lane paint (era.py 'marks: drawn from the 1970s on') the year's streets are its own (no today's markings / surface)
    if Y < EC.OLD_PAVEMENT_BEFORE: stz = (c5 == 5) & (c8 == 5); st['M8_streets'] = int((stz & ~Gm)[QY:].sum()); Gm |= stz   # (i3) only where the period's pavement differs (era.pavement: basalt / dirt / early concrete to 1950); 1950-71: K5
    # M9 rails: today's lines that did not run in the year (sourced opening years), on the year's streets / ground
    RG, nrg = rails_gone(Y); rg = np.zeros(c8.shape, bool); rg[QY:] = RG & ~bld(c5[QY:]); st['M9_rails'] = int((rg & ~Gm).sum()); st['M9_segments'] = nrg; Gm |= rg
    Ls = (np.abs(lr) > 0.5) & ~carz & ~(same & (np.abs(lr) < 0.9))
    Gd = dk(Gm, 5); lab, n = nd.label(Ls | Gd); hit = np.zeros(n + 1, bool); hit[np.unique(lab[Gd])] = True; hit[0] = False
    Dl = op(hit[lab] & Ls & ~Gm, 3); del lab
    M = cv2.morphologyEx((Gm | Dl).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    M = cv2.dilate(M, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    # M11 holes in the mask (unmasked islands under 30k px enclosed by it: today's palm shadows between repainted crowns, i3) are part of the change
    hole = nd.binary_fill_holes(M > 0) & ~(M > 0); hl, hn = nd.label(hole)
    if hn:
        hs = nd.sum(hole, hl, np.arange(1, hn + 1)); hk = np.zeros(hn + 1, bool); hk[1:] = hs < 30000; hole = hk[hl]; M[hole] = 1; st['M11_holes'] = int(hole[QY:].sum())
    M[:QY] = 0
    Mf = np.maximum(np.clip(cv2.GaussianBlur((M > 0).astype(np.float32), (0, 0), 5.0), 0, 1), cv2.erode(M, np.ones((3, 3), np.uint8)).astype(np.float32)); Mf[:QY] = 0
    full = np.zeros((G['H'], G['W']), np.uint8); full[sl] = np.round(Mf * 255); Image.fromarray(full).save(f'{RUN}/mask_{Y}.png')
    q = np.s_[QY:, :]
    np.savez_compressed(f'{RUN}/parts_{Y}.npz', TSH=tsh[q], TSHG=np.where(tsh, TSHG, 1)[q].astype(np.float16), G=Gm[q], Dg=Dg[q], Dl=Dl[q], M=(M > 0)[q], same=same[q], DECK=DECK[q], FW=FW[q], car8=car8[q], car5=car5[q], Mf=np.round(Mf[q] * 255).astype(np.uint8))
    st.update(year=Y, geom=float(Gm[q].mean()), shadow=float(Dl[q].mean()), mask=float((M > 0)[q].mean()))
    json.dump(st, open(f'{RUN}/mask_{Y}.json', 'w')); log('MASK', st)

def full(Y):
    """a WHOLE-year key: the mask is the whole core (the key is the year's own painting; nothing of today's painting is kept)"""
    Y = int(Y); M = np.zeros((G['H'], G['W']), np.uint8); M[sl8] = 255; Image.fromarray(M).save(f'{RUN}/mask_{Y}.png')
    json.dump(dict(year=Y, mode='whole'), open(f'{RUN}/mask_{Y}.json', 'w')); log('FULL MASK', Y)

def _fire_sfx(Y, sel):
    """(k25 FIRE_TILES) per tile: '_fire' when >= 98 % of its core part lies in the burned district (burnmask.burn_core), '_fireedge' from 2 %,
    '' below (CONVENTION on the thresholds). A tile outside the core counts as unburned."""
    import burnmask; B = burnmask.burn_core(); out = {}
    for k in sel:
        gx, gy = map(int, k.split('_')); a = B[max(0, gy - QC[1]):max(0, gy + 1024 - QC[1]), max(0, gx - QC[0]):max(0, gx + 1024 - QC[0])]
        f = float(a.mean()) if a.size else 0.0
        out[k] = '_fire' if f >= 0.98 else ('_fireedge' if f >= 0.02 else '')
    log('FIRE_TILES', Y, {s_: sum(1 for v in out.values() if v == s_) for s_ in ('_fire', '_fireedge', '')}); return out

def ai(years, d, out):
    years = [int(y) for y in years.split(',')]; os.makedirs(d, exist_ok=True)
    P7 = {l.split()[0][3:].replace(',', '_'): l.split() for l in open(f'{V7}/ai/P.txt') if l.startswith('C9:')}
    sel8 = set(json.load(open(f'{V8}/changed.json'))['selected']) if os.path.exists(f'{V8}/changed.json') else set(); water = set(json.load(open(f'{V7}/ai/water_tiles.json')))   # b8: its P.txt keys are final
    key = lambda k: 'v5_dry' if k in sel8 else P7[k][3]
    L = []; LA = ['#MOSAIC all'] + [f'C9:{k.replace("_", ",")} x - {key(k)} {P7[k][4]}' for k in P7]; n = {}
    for Y in years:
        Mk = np.asarray(Image.open(f'{RUN}/mask_{Y}.png')) > 0; w = f'y{Y}'; sel = []
        for k in P7:
            gx, gy = map(int, k.split('_'))
            if k not in water and Mk[max(0, gy - BOY + 50):gy - BOY + 974, max(0, gx - BOX + 50):gx - BOX + 974].any(): sel.append(k)
        if os.environ.get('ALL') == '1':           # a WHOLE-year painting: every land tile whose centre 512 px lie inside the area core
            sel = [k for k in P7 if k not in water and int(k.split('_')[0]) < QC[2] and int(k.split('_')[0]) + 1024 > QC[0] and int(k.split('_')[1]) < QC[3] and int(k.split('_')[1]) + 1024 > QC[1]]   # (i7) EVERY tile overlapping the core: centre-inside left today's tiles (the Pyramid) along the edges
        if os.environ.get('MISSING') == '1':      # a re-run: only the tiles not painted yet (salvaged / pulled ones in tiles_new)
            have = {os.path.basename(f)[:-4] for f in glob.glob(f'{RUN}/tiles_new/y{Y}/*.jpg')}; n0 = len(sel); sel = [k for k in sel if k not in have]; log('MISSING', Y, n0, '->', len(sel))
        if os.environ.get('K4P') == '1':          # (k25 K4P) a re-paint: only the tiles k4p_<Y>.json lists
            gb = json.load(open(f'{RUN}/k4p_{Y}.json'))['gboxes']
            sel = [k for k in P7 if k not in water and any(int(k.split('_')[0]) < x1 and int(k.split('_')[0]) + 1024 > x0 and int(k.split('_')[1]) < y1
                                                           and int(k.split('_')[1]) + 1024 > y0 for x0, y0, x1, y1 in gb)]; log('K4P', Y, len(sel), 'tiles')
        if os.environ.get('SPLIT'):             # SPLIT=i/n: every n-th tile from i (a year on several cards)
            i_, n_ = map(int, os.environ['SPLIT'].split('/')); sel = sel[i_::n_]
        sfx = _fire_sfx(Y, sel) if (os.environ.get('FIRE_TILES', '1') == '1' and Y in EC.FIRE_YEARS) else {}
        sd = (lambda v: str((int(v) * 7 + 1) % 2147483647)) if os.environ.get('K4P') == '1' else (lambda v: v)      # K4P: a new seed
        L += [f'#MOSAIC {w}'] + [f'C9:{k.replace("_", ",")} out/{w}/{k}.jpg - {key(k)}{sfx.get(k, "")} {sd(P7[k][4])}' for k in sel]; n[Y] = len(sel)
        if not os.path.exists(f'{d}/R_{w}.jpg'): os.link(f'{RUN}/ctx_{Y}/R_pt.jpg', f'{d}/R_{w}.jpg')
        json.dump(dict(ox=BOX, oy=BOY), open(f'{d}/R_{w}.json', 'w'))
        if not os.path.exists(f'{d}/C_{w}.png'): os.link(f'{RUN}/ctx_{Y}/R.class.png', f'{d}/C_{w}.png')
    if os.environ.get('FIRE_TILES', '1') == '1' and min(years) in EC.FIRE_YEARS or os.environ.get('K4P') == '1':   # (k25) the L8 seed table follows:
        sfa = _fire_sfx(min(years), list(P7)) if (os.environ.get('FIRE_TILES', '1') == '1' and min(years) in EC.FIRE_YEARS) else {}   # its fire wording,
        sda = (lambda v: str((int(v) * 7 + 1) % 2147483647)) if os.environ.get('K4P') == '1' else (lambda v: v)       # its new seeds (K4P)
        LA = ['#MOSAIC all'] + [f'C9:{k.replace("_", ",")} x - {key(k)}{sfa.get(k, "")} {sda(P7[k][4])}' for k in P7]
    open(f'{d}/P.txt', 'w').write('\n'.join(L) + '\n'); open(f'{d}/PALL.txt', 'w').write('\n'.join(LA) + '\n')
    json.dump(dict(jobs='P.txt', seedjobs='PALL.txt', nf9=1, nfkey='nfC', out=out), open(f'{d}/SL8.json', 'w'))
    QH2 = '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh2'
    shutil.copy(f'{V7}/ai/run_pyv.py', d); shutil.copy(f'{QH2}/sl8v_qh.py', f'{d}/sl8v.py'); shutil.copy(f'{B52}/lr_run9_b8.py', f'{d}/lr_run9.py')
    # (i7) ERA PROMPTS: the tile prompts say 'every street is dry grey asphalt with road markings'; before lane paint (era.py marks: 1970s) the AI
    # drew today's lane and stall markings onto 1938 / 1959 streets. Years before 1970 get the same prompts with the markings replaced.
    if min(years) < EC.MARKS_FROM:
        src = open(f'{d}/lr_run9.py').read(); anc = "GUIDE = ("
        add = ("for _k in list(P):\n    P[_k + '_nomarks'] = P[_k].replace('with road markings', 'with no road markings, no lane lines and no painted parking stalls (before the 1970s)')\n")
        if '_nomarks' not in src: src = src.replace(anc, add + anc, 1); open(f'{d}/lr_run9.py', 'w').write(src)
        for fn in ('P.txt', 'PALL.txt'):
            L_ = open(f'{d}/{fn}').read().split('\n'); out_ = []
            for l in L_:
                t = l.split()
                if l.startswith('C9:') and len(t) >= 5 and '_nomarks' not in t[3]:
                    f_ = next((x for x in ('_fireedge', '_fire') if t[3].endswith(x)), ''); t[3] = t[3][:len(t[3]) - len(f_)] + '_nomarks' + f_; l = ' '.join(t)
                out_.append(l)
            open(f'{d}/{fn}', 'w').write('\n'.join(out_))
        log('AI prompts without road markings (years < 1970)')
        # (03/10 era_auto) ERA PROMPTS 2: the base prompts say 'dark asphalt streets with cars' and the AI painted cars, asphalt, street trees and
        # lawns onto 1905 / 1906 (i13: two cars and a row of trees on the ashes of 1906). Before 1930 the street wording is the period's, and the
        # fire year (1906-1907) says what stood in the burned district. Applied to the _nomarks prompts this window uses. ERA_PROMPTS=0: off.
        Y0 = min(years)
        # (03/10 era_auto, checks agent BUG 1) the era wording used to sit inside 'Y0 < 1930': 1938 / 1959 windows (i16, wa4) got today's prompt
        # word for word (and STREET_PERIOD's 1920-69 branch never ran). Now every window before 1970 gets its era clause; 1970+ unchanged.
        if Y0 < EC.ERA_CLAUSE_BEFORE and os.environ.get('ERA_PROMPTS', '1') == '1':
            if Y0 >= EC.PERIOD_PROMPTS_BEFORE: rp = [('dark asphalt streets with cars', 'dark asphalt streets with cars of the %ds' % (Y0 // 10 * 10))]
            elif Y0 < EC.EARLY_PROMPTS_BEFORE: rp = [('dark asphalt streets with cars', 'dark cobblestone and packed-earth streets with only a few horse-drawn wagons and no automobiles'),
                                ('asphalt', 'cobblestone')]
            else: rp = [('dark asphalt streets with cars', 'dark cobblestone and early-paved streets with a few early automobiles and horse-drawn wagons')]
            ex = ' It is ' + EC.CITY_NAME + ' in %d: no modern cars, no traffic lights, no modern street furniture, no lawns or trees that the render does not show.' % Y0
            if Y0 >= EC.PERIOD_PROMPTS_BEFORE:   # (1930-69 ERA CLAUSE, main 03/10) period cars of the decade, no today's street kit, modest street trees only where rendered
                ex = (' It is ' + EC.CITY_NAME + ' in %d: only cars of the %ds (no modern cars or SUVs), no bike lanes, no modern street furniture,'
                      ' no solar panels, no smart signage; modest street trees only where the render shows them.' % (Y0, Y0 // 10 * 10))
            FIRE_EX = (' These are the weeks after the 1906 earthquake and fire: inside the burned district only grey ash, rubble, '
                       'blackened brick shells and standing chimneys remain; no trees, no lawns, no vehicles there.')
            ROOFLESS = (' The flat grey ash ground and the low rubble heaps round the chimneys are not roofs: paint no roof, house, tree or lawn there.'
                        # (k25 rev 6, ASH_LOTS) ruins only where buildings stood: the render keeps an open yard's paving in 1906 as in 1905
                        ' Chimneys, ruins and rubble heaps appear only where the render shows them; an open paved yard or street the render shows stays paved.')
            EDGE_EX = (' The 1906 fire burned only part of this view: grey ash, rubble, roofless brick shells and standing chimneys only where the render'
                       ' shows them; every building, roof, street and yard the render shows intact stays intact, with no ash on it.')
            fire_tiles = os.environ.get('FIRE_TILES', '1') == '1'
            if Y0 in EC.FIRE_YEARS and not fire_tiles: ex += FIRE_EX
            src = open(f'{d}/lr_run9.py').read(); anc = "GUIDE = ("
            if '_ERA_RP' not in src:
                code = '_ERA_RP = %r\n_ERA_EX = %r\nfor _k in list(P):\n    if _k.endswith(\'_nomarks\'):\n        for _a, _b in _ERA_RP: P[_k] = P[_k].replace(_a, _b)\n        P[_k] = P[_k] + _ERA_EX\n' % (rp, ex)
                # (03/10 era_auto) RULE NOTREE (Daniel's blind side-by-side i17b, 1915, 5 of 5 for B): before 1930 the base wording says no trees;
                # bare streets and yards unless the render shows a tree (the AI had painted ~6 % green where the render had 0.2 % trees). NOTREE=0: off.
                if os.environ.get('NOTREE', '1') == '1' and Y0 < EC.NOTREE_BEFORE:
                    code += ("for _k in [k_ for k_ in P if k_.endswith('_nomarks')]:\n    P[_k] = (P[_k].replace('roofs, walls, streets and trees.', 'roofs, walls and streets.')"
                             ".replace(', height and tree exactly', ' and height exactly')\n        .replace(', no lawns or trees that the render does not show.', "
                             "'. The streets have no trees: sidewalks, lots and yards stay bare paving or packed earth exactly as in the render; a tree appears only where the render shows one.'))\n")
                # (k25 rev 3) RULE STREET_PERIOD: the ERA_RP / _nomarks replacements match NOTHING in the v5_dry prompts the era windows use (they
                # name no street surface: 'dark asphalt streets with cars' and 'with road markings' are LIGHT_* / DRY wording), so the AI painted
                # today's asphalt with a yellow centre line and white edge lines on the 1906 streets (i17a cmp_114260_35868). The period's street
                # surface is now SAID, appended to every era prompt: before 1920 basalt blocks / cobbles with the tracks where the render has them
                # (SOURCED in outline: Sonoma basalt blocks on the car-line streets from the 1880s, era.pavement); 1920-1969 no painted lines
                # (era.py marks from the 1970s). STREET_PERIOD=0: off.
                if os.environ.get('STREET_PERIOD', '1') == '1' and Y0 < EC.ERA_CLAUSE_BEFORE:
                    sw = (' Every street is paved with dark grey basalt blocks or cobblestones, with the streetcar and cable-car tracks exactly where the'
                          ' render shows them; there is no asphalt and there are no painted lines or road markings anywhere.') if Y0 < EC.COBBLE_BEFORE else \
                         (' Simple period road markings only (painted centre lines, lane lines, crosswalks); no bike lanes, no green or red coloured'
                          ' lanes, no modern symbols.')   # (main 03/10 18:00) painted centre / lane lines and crosswalks were standard on SF streets from the 1920s-30s
                    code += "for _k in [k_ for k_ in P if k_.endswith('_nomarks')]:\n    P[_k] = P[_k] + %r\n" % sw
                if Y0 in EC.FIRE_YEARS and fire_tiles:    # (k25 FIRE_TILES) the fire wording per tile
                    code += ("for _k in [k_ for k_ in P if k_.endswith('_nomarks')]:\n    P[_k + '_fire'] = P[_k] + %r\n    P[_k + '_fireedge'] = P[_k] + %r\n"
                             % (FIRE_EX + ROOFLESS, EDGE_EX + ROOFLESS))
                src = src.replace(anc, code + anc, 1); open(f'{d}/lr_run9.py', 'w').write(src)
            log('AI era prompts', Y0, rp[0][1][:40], '+ fire' if Y0 in EC.FIRE_YEARS else '')
    log('AI', d, n, 'tiles total', sum(n.values()))

def today_core():
    F = f'{V8}/city/sb/{A["SB"]}/final'; Q8 = A['Q8']; BH = A['BAND']
    bands = sorted(int(f.split('_')[-1][:-4]) for f in glob.glob(f'{F}/f_*.png')); out = np.zeros((QH, QW, 3), np.uint8)
    for y0 in bands:
        a0, a1 = max(QC[1] - Q8[1], y0), min(QC[3] - Q8[1], y0 + BH)
        if a0 >= a1: continue
        a = Image.open(f'{F}/f_{y0}.png').crop((QC[0] - Q8[0], a0 - y0, QC[2] - Q8[0], a1 - y0)); out[a0 - (QC[1] - Q8[1]):a1 - (QC[1] - Q8[1])] = np.asarray(a.convert('RGB'))
    return out

def today():
    os.makedirs(f'{RUN}/paint', exist_ok=True); k = today_core(); Image.fromarray(k).save(f'{RUN}/paint/key_2026.png', compress_level=1); log('TODAY', k.shape)

def post(Y):
    Y = int(Y); R = f'{RUN}/city_{Y}'; sid = f'q{Y}'; os.makedirs(f'{R}/tiles', exist_ok=True); os.makedirs(f'{R}/sb/{sid}', exist_ok=True)
    w, h = Image.open(f'{RUN}/ctx_{Y}/R.jpg').size
    json.dump([[f'{RUN}/ctx_{Y}/R', BOX, BOY, w, h]], open(f'{R}/pieces.json', 'w'))
    for f in glob.glob(f'{V8}/city/tiles/*.jpg'):
        t = f'{R}/tiles/{os.path.basename(f)}'
        if not os.path.exists(t): os.link(f, t)
    new = glob.glob(f'{RUN}/tiles_new/y{Y}/*.jpg')
    for f in new:
        t = f'{R}/tiles/{os.path.basename(f)}'
        if os.path.exists(t): os.remove(t)
        shutil.copy(f, t)
    if os.path.isdir(f'{V8}/city/colour') and not os.path.isdir(f'{R}/colour'): shutil.copytree(f'{V8}/city/colour', f'{R}/colour')
    g = json.load(open(f'{V8}/city/sb/{A["SB"]}/geom.json'))
    xs = [x for x in g['xs'] if x + 1024 > QC[0] and x < QC[2]]; ys = [y for y in g['ys'] if y + 1024 > QC[1] and y < QC[3]]
    json.dump(dict(Q=QC, xs=xs, ys=ys, kinds=g['kinds']), open(f'{R}/sb/{sid}/geom.json', 'w'))
    log('POST', Y, 'new tiles', len(new))
    subprocess.run(f'cd {EC.POST_SB_DIR} && CITY_ROOT={R} FIN_BH=1024 python3 post_sb.py {sid} quilt,finish | grep -v "^compose band\\|^colour band" | tail -4', shell=True, check=True)
    fin = np.concatenate([np.asarray(Image.open(f'{R}/sb/{sid}/final/f_{y0}.png').convert('RGB')) for y0 in range(0, QH, 1024)], 0)[:QH]
    base = np.asarray(Image.open(f'{RUN}/paint/key_2026.png').convert('RGB'))
    m = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[sl8].astype(np.float32)[..., None] / 255
    key = np.where(m > 0, np.round(base * (1 - m) + fin * m), base).astype(np.uint8)
    Image.fromarray(fin).save(f'{RUN}/paint/raw_{Y}.png', compress_level=1); Image.fromarray(key).save(f'{RUN}/paint/key_{Y}.png', compress_level=1)
    shutil.copy(f'{RUN}/paint/key_{Y}.png', f'{RUN}/paint/key_{Y}_post.png')
    log('KEY', Y, 'changed px', int((np.abs(key.astype(np.int16) - base).max(-1) > 0).sum()))
    # (k25 rev 3) K4R is part of the post of the ash years (1906-1908): every crown on the ash is caught (small ones repaired, the rest
    # listed in k4p_<Y>.json for the K4P re-paint round the run's chain does on a card). K4_REPAIR=0: off.
    if EC.ASH_FROM <= Y <= EC.ASH_UNTIL and os.environ.get('K4_REPAIR', '1') == '1': k4r(Y)

def compose(Y):
    """re-apply the current mask to the year's AI painting (raw_<Y>, already quilted) without a new quilt: key_<Y>_post.png"""
    Y = int(Y); base = np.asarray(Image.open(f'{RUN}/paint/key_2026.png').convert('RGB')); fin = np.asarray(Image.open(f'{RUN}/paint/raw_{Y}.png').convert('RGB'))
    m = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[sl8].astype(np.float32)[..., None] / 255
    key = np.where(m > 0, np.round(base * (1 - m) + fin * m), base).astype(np.uint8)
    Image.fromarray(key).save(f'{RUN}/paint/key_{Y}_post.png', compress_level=1); shutil.copy(f'{RUN}/paint/key_{Y}_post.png', f'{RUN}/paint/key_{Y}.png'); log('COMPOSE', Y)

def _water_fill(img, M, wat_ok):
    """fill M from clean water along 8 directions at 420..1680 px (the nearest clean source first)"""
    out = img.copy(); ys, xs = np.nonzero(M); done = np.zeros(len(ys), bool); Hh, Ww = M.shape
    for r in (420, 840, 1260, 1680):
        for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r), (r, r), (-r, r), (r, -r), (-r, -r)):
            xs2 = np.clip(xs + dx, 0, Ww - 1); ys2 = np.clip(ys + dy, 0, Hh - 1); ok = ~done & wat_ok[ys2, xs2] & ~M[ys2, xs2]
            out[ys[ok], xs[ok]] = img[ys2[ok], xs2[ok]]; done |= ok
    return out, int((~done).sum())

def invented_veg(Y, key):
    """K4 / check 'veg': masked px where the key looks like vegetation (green, textured) but the year's render (pretone) is not green there and its
    class pass says no tree; blobs >= 150 px"""
    mk = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[sl8] > 128
    Rp = rd(f'{RUN}/ctx_{Y}', 'R_pt.jpg', QC).astype(np.int16); cY = code_a(rd(blkdir(Y), 'R.class.png', QC))
    k = np.clip(key, 0, 255).astype(np.int16)
    gk = (k[..., 1] - np.maximum(k[..., 0], k[..., 2]) > 6) & (k[..., 1] > 50)
    gr = cv2.blur(((Rp[..., 1] - np.maximum(Rp[..., 0], Rp[..., 2])) > 3).astype(np.float32), (25, 25)) > 0.15
    tr = dk(cY == 3, 15)
    V = mk & gk & ~gr & ~tr & ((cY == 0) | (cY == 5) | (cY == 7))
    V = cv2.morphologyEx(V.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0; lab, n = nd.label(V)
    if n:
        sz = nd.sum(V, lab, np.arange(1, n + 1)); keep = np.zeros(n + 1, bool); keep[1:] = sz >= 150; V = keep[lab]
    return V

def _tone_match(key, out, M, ok):
    """a copied fill keeps its texture but takes the local tone of the water around it: the low-frequency difference key - out, measured on a
    ring of clean water around M, spread over M (normalized convolution, sigma 60)"""
    ring = (dk(M, 61) & ~M & ok).astype(np.float32); d = (key - out) * ring[..., None]
    corr = cv2.GaussianBlur(d, (0, 0), 60) / np.maximum(cv2.GaussianBlur(ring, (0, 0), 60), 1e-3)[..., None]
    return np.where(M[..., None], out + corr, out)

def rules(Y):
    Y = int(Y); P = np.load(f'{RUN}/parts_{Y}.npz'); st = {}
    key = np.asarray(Image.open(f'{RUN}/paint/key_{Y}_post.png').convert('RGB')).astype(np.float32)
    c8 = code_a(rd(f'{V8}/blk', 'R.class.png', QC)); cY = code_a(rd(blkdir(Y), 'R.class.png', QC))
    # K1 today's cars on an unchanged deck: the deck paving continued under them (normalized convolution)
    # (i1) a dense deck lot inpainted is a dark smear: where the year's kerbs hold cars (era.TABLE cars >= 0.40, from 1950) the unchanged
    # deck lot keeps its parked cars (a pier-deck parking lot; CONVENTION), only earlier years get the empty deck
    cz = dk(P['car8'] & P['DECK'], 7) & ~P['car5']; ok = (P['DECK'] & ~cz).astype(np.float32)
    if Y >= EC.DECK_CARS_FROM: cz[:] = False
    if cz.any():
        num = cv2.GaussianBlur(key * ok[..., None], (0, 0), 22); den = cv2.GaussianBlur(ok, (0, 0), 22)[..., None]
        fill = num / np.maximum(den, 1e-3); f = feather(cz, 2); key = key * (1 - f) + fill * f
    st['K1_deck_cars'] = int(cz.sum())
    # K2 things on today's water the year did not have (future piers, moored boats): the year's render says water, today's does not
    wat_both = (c8 == 1) & (cY == 1); fut = dk((c8 != 1) & (cY == 1) & dk(c8 == 1, 61), 9) & ~bld(cY)
    if fut.any():
        out, miss = _water_fill(key, fut, wat_both); out = _tone_match(key, out, fut, wat_both); f = feather(fut, 3); key = key * (1 - f) + out * f; st['K2_unfilled'] = miss
    st['K2_future_on_water'] = int(fut.sum())
    # K3 dark thin streaks on water (a lost pier's ghost, a class seam)
    g = cv2.cvtColor(np.clip(key, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32); med = cv2.medianBlur(np.clip(g, 0, 255).astype(np.uint8), 51).astype(np.float32)
    s = nd.binary_opening(wat_both & (g < med - 10), np.ones((2, 2))); lab, n = nd.label(s); ok_ = np.zeros(n + 1, bool)
    for i, sl_ in enumerate(nd.find_objects(lab), 1):
        hh, ww = sl_[0].stop - sl_[0].start, sl_[1].stop - sl_[1].start; ok_[i] = max(hh, ww) >= 120 and (lab[sl_] == i).sum() < 0.25 * hh * ww
    S_ = dk(ok_[lab], 9)
    if S_.any():
        out, _ = _water_fill(key, S_, wat_both); out = _tone_match(key, out, S_, wat_both); f = feather(S_, 3); key = key * (1 - f) + out * f
    st['K3_streaks'] = int(S_.sum())
    # K5 1950-1971: asphalt as today, but no lane paint yet (era.py 'marks: from the 1970s'): today's paint on today's streets (bright or yellow thin
    # marks on the street class, outside the mask) is filled from the asphalt around it
    if EC.K5_FROM <= Y < EC.K5_UNTIL:
        mk5 = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[sl8] < 128
        kk = np.clip(key, 0, 255).astype(np.uint8); g = cv2.cvtColor(kk, cv2.COLOR_RGB2GRAY).astype(np.int16); med = cv2.medianBlur(cv2.cvtColor(kk, cv2.COLOR_RGB2GRAY), 31).astype(np.int16)
        hsv = cv2.cvtColor(kk, cv2.COLOR_RGB2HSV); yel = (hsv[..., 0] > 12) & (hsv[..., 0] < 35) & (hsv[..., 1] > 90)
        paint = (c8 == 5) & mk5 & ((g > med + 28) | (yel & (g > med + 5)))
        paint = paint & ~(cv2.morphologyEx(paint.astype(np.uint8), cv2.MORPH_OPEN, np.ones((15, 15), np.uint8)) > 0)   # thin marks, not bright slabs
        P5 = dk(paint, 5) & (c8 == 5)
        if P5.any():
            okp = ((c8 == 5) & ~dk(paint, 9)).astype(np.float32); num = cv2.GaussianBlur(key * okp[..., None], (0, 0), 5); den = cv2.GaussianBlur(okp, (0, 0), 5)[..., None]
            f = feather(P5, 1.5); key = key * (1 - f) + (num / np.maximum(den, 1e-3)) * f
        st['K5_lane_paint'] = int(P5.sum())
    # K7 shadows of today's trees the year lacks that only today's AI painting has (the renders agree there, i3 palms): near such a tree, flat
    # ground where today's painting is darker than the year's own AI painting (raw) takes the year's painting
    if os.path.exists(f'{RUN}/paint/raw_{Y}.png'):
        raw = np.asarray(Image.open(f'{RUN}/paint/raw_{Y}.png').convert('RGB')).astype(np.float32); T0 = np.asarray(Image.open(f'{RUN}/paint/key_2026.png').convert('RGB')).astype(np.float32)
        lum = lambda a: a @ np.array([0.3, 0.59, 0.11], np.float32)
        tg = (c8 == 3) & (cY != 3); flat7 = ((c8 == 0) | (c8 == 5) | (c8 == 7)) & ((cY == 0) | (cY == 5) | (cY == 7))
        painted = cv2.blur((np.abs(raw - T0).max(-1) > 6).astype(np.float32), (41, 41)) > 0.2      # the year's tiles exist here
        S7 = dk(tg, 121) & flat7 & painted & (cv2.GaussianBlur(lum(raw) - lum(T0), (0, 0), 2) > 15); S7 = dk(S7, 5) & flat7
        if S7.any(): f = feather(S7, 2); key = key * (1 - f) + raw * f
        st['K7_tree_shadows_painting'] = int(S7.sum()); del raw, T0
    # K4 vegetation the AI invented: inside the mask, green texture where the year's render is neither tree class nor green (a dark strip under
    # the freeway became a row of trees, 1959): filled from the surrounding ground of the key that is not green (normalized convolution)
    V = invented_veg(Y, key); st['K4_invented_veg'] = int(V.sum())   # (i3) detection only: the blur fill left smears (gap list: re-paint / render fix)
    if os.environ.get('K4_REPAIR') == '1':                              # (k25) RULE K4R: repaired (k4r.py), big crowns listed for a re-paint
        import k4r, burnmask
        mk4 = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[sl8] > 128
        key, s4 = k4r.repair(key, rd(f'{RUN}/ctx_{Y}', 'R_pt.jpg', QC), cY, mk4, burnmask.burn_core() if k4r.ash_year(Y) else None, V, dk, feather)
        boxes = s4.pop('K4P_boxes'); st.update(s4)
        gboxes = [[x0 + QC[0], y0 + QC[1], x1 + QC[0], y1 + QC[1]] for x0, y0, x1, y1 in boxes]      # global L9 px; ai(K4P=1) picks the tiles
        json.dump(dict(boxes=boxes, gboxes=gboxes), open(f'{RUN}/k4p_{Y}.json', 'w'))
    if False and V.any():
        kk = np.clip(key, 0, 255); gall = (kk[..., 1] - np.maximum(kk[..., 0], kk[..., 2]) > 4); okg = (~dk(V, 9) & ~gall).astype(np.float32); num = cv2.GaussianBlur(key * okg[..., None], (0, 0), 16); den = cv2.GaussianBlur(okg, (0, 0), 16)[..., None]
        f = feather(V, 2); key = key * (1 - f) + (num / np.maximum(den, 1e-3)) * f
    Image.fromarray(np.round(np.clip(key, 0, 255)).astype(np.uint8)).save(f'{RUN}/paint/key_{Y}.png', compress_level=1)
    json.dump(st, open(f'{RUN}/rules_{Y}.json', 'w')); log('RULES', Y, st)

def k4r(Y):
    """(k25) RULE K4R as its own step (the era chain runs post -> hybrid, without rules): key_<Y>.png repaired in place (backup
    key_<Y>_prek4r.png), the big crowns listed in k4p_<Y>.json (tiles to re-paint), stats in k4r_<Y>.json"""
    import k4r as K4, burnmask
    Y = int(Y); f = f'{RUN}/paint/key_{Y}.png'; shutil.copy(f, f'{RUN}/paint/key_{Y}_prek4r.png')
    key = np.asarray(Image.open(f).convert('RGB')).astype(np.float32); cY = code_a(rd(blkdir(Y), 'R.class.png', QC))
    V = invented_veg(Y, key); mk = np.asarray(Image.open(f'{RUN}/mask_{Y}.png'))[sl8] > 128
    key, st = K4.repair(key, rd(f'{RUN}/ctx_{Y}', 'R_pt.jpg', QC), cY, mk, burnmask.burn_core() if K4.ash_year(Y) else None, V, dk, feather)
    boxes = st.pop('K4P_boxes')
    gboxes = [[x0 + QC[0], y0 + QC[1], x1 + QC[0], y1 + QC[1]] for x0, y0, x1, y1 in boxes]      # global L9 px; ai(K4P=1) picks the tiles
    json.dump(dict(boxes=boxes, gboxes=gboxes), open(f'{RUN}/k4p_{Y}.json', 'w'))
    Image.fromarray(np.round(np.clip(key, 0, 255)).astype(np.uint8)).save(f, compress_level=1)
    json.dump(st, open(f'{RUN}/k4r_{Y}.json', 'w')); log('K4R', Y, st)

def k4p_merge(Y):
    """(k25 K4P) after a re-paint of the k4p_<Y>.json tiles (their new tiles in tiles_new/y<Y>, the old ones kept in tiles_k4p_old/y<Y>):
    keys.py post <Y> was re-run -> key_<Y>_post.png (= key_<Y>.png); the re-painted pixels are taken ONLY inside the listed crowns' boxes (+40 px, feathered
    16 px) over the key from before (key_<Y>_prek4p.png), then rules <Y> runs again (a crown painted again is listed again: the loop ends
    when k4p_<Y>.json lists no tile, or after 2 rounds: CONVENTION)"""
    Y = int(Y); old = np.asarray(Image.open(f'{RUN}/paint/key_{Y}_prek4p.png').convert('RGB')).astype(np.float32)
    new = np.asarray(Image.open(f'{RUN}/paint/key_{Y}_post.png').convert('RGB')).astype(np.float32)
    M = np.zeros(old.shape[:2], bool)
    for x0, y0, x1, y1 in json.load(open(f'{RUN}/k4p_{Y}.json'))['boxes']: M[max(0, y0 - 96):y1 + 96, max(0, x0 - 96):x1 + 96] = True   # (rev 3) 96 px: a crown's cut top (i17a)
    f = feather(M, 16); out = old * (1 - f) + new * f
    o_ = Image.fromarray(np.round(out).astype(np.uint8)); o_.save(f'{RUN}/paint/key_{Y}_post.png', compress_level=1); o_.save(f'{RUN}/paint/key_{Y}.png', compress_level=1)
    log('K4P_MERGE', Y, int(M.sum()))

if __name__ == '__main__': globals()[sys.argv[1]](*sys.argv[2:])
