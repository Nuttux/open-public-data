# prep.py (b52eprep; part 1 of heroprep build.py, everything that does NOT need the paintings): masks (GONE/NEW/ADD/CH), owners, id/height maps,
# crowns, structures (gone AND new, e.g. the Embarcadero Freeway spans) rasterised jointly with the buildings, shadow-need rasters,
# the light ratio L (pre-guard), rmask, non-building regions NB (pre-seam), spill guard -> work/stageA.npz + in/state.npz (PROVISIONAL:
# painting-independent keys only, enough for events.py; build.py overwrites it) + in/structures.json + work/same.pkl
# usage: python3 prep.py
# 34560..40704, 7168 x 6144); structures (gone AND new) rasterised jointly with the buildings; complete landmark crowns
import pickle, numpy as np, scipy.ndimage as nd, cv2
from PIL import Image
from raster2 import *
HR = None; import common as CM; E = CM.E; IN = CM.IN; WK = CM.WK; O = CM.O; W, H = CM.W, CM.H   # qh segment (SEG env)
import json, structures as SS
D = pickle.load(open(IN + 'prisms_w.pkl', 'rb')); P85, P26 = D['prisms']['1985'], D['prisms']['2026']
sig = CM.sig
k85 = {b['key']: b for b in P85}; k26 = {b['key']: b for b in P26}
same = {k for k in k85 if k in k26 and sig(k85[k]) == sig(k26[k])}
# a building still rising at the start year that stands (same ring) at the end year CONTINUES: not demolished, only built on
cont = {k for k in k85 if k in k26 and k not in same and k85[k].get('rise') is not None and sig(k85[k])[1] == sig(k26[k])[1]}
print('segment', CM.YA, CM.YB, 'same', len(same), 'continuing (rising at the start)', len(cont))
c85 = np.load(IN + 'Cc_1985.npy'); c26 = np.load(IN + 'Cc_2026.npy')
STG, STN = SS.lists(CM.moment(CM.YA), None if CM.YB == 2026 else CM.moment(CM.YB), D['wbox'])
CHG, OWG = SS.chunk_prisms(STG); CHN, OWN = SS.chunk_prisms(STN)
def idm(P, C, CHK, OWK):
    lm = np.array([b['kind'] == 'lm' for b in P]); ix_n = np.nonzero(~lm)[0]; ix_l = np.nonzero(lm)[0]
    Mn, Zn = id_map_z([P[i] for i in ix_n] + CHK, O, W, H); Ml, Zl = id_map_z([P[i] for i in ix_l], O, W, H)
    nb = len(ix_n); K = np.where(Mn >= nb, OWK[np.clip(Mn - nb, 0, len(OWK) - 1)], -1); ZK = np.where(K >= 0, Zn, 0)
    ZG = np.zeros(Mn.shape, np.float32); cz = np.array([c['zg'] for c in CHK] + [0.0], np.float32); ZG[K >= 0] = cz[(Mn - nb)[K >= 0]]
    Mn = np.where(Mn >= nb, -1, Mn); Zn = np.where(K >= 0, 0, Zn)
    Mn = np.where(Mn >= 0, ix_n[np.maximum(Mn, 0)], -1); Ml = np.where(Ml >= 0, ix_l[np.maximum(Ml, 0)], -1)
    use_l = (Ml >= 0) & ((C == 4) | (Mn < 0))            # a landmark model where the render says landmark (or nothing else stands)
    K = np.where(use_l, -1, K); return np.where(use_l, Ml, Mn), np.where(use_l, Zl, Zn), K.astype(np.int16), np.where(use_l, 0, ZK).astype(np.float32), ZG
M85, Z85, FWK, FWZg, ZG85 = idm(P85, c85, CHG, OWG); M26, Z26, FWN, FWNZ, ZG26 = idm(P26, c26, CHN, OWN)
FWs = SS.s_param(STG, FWK, FWZg, ZG85, O); FWNs = SS.s_param(STN, FWN, FWNZ, ZG26, O)
STRV = (FWK >= 0) | (FWN >= 0)     # structure px (visible in their year): never building-mask px
for nm_, L_ in (('gone', STG), ('new', STN)):
    for i_, st_ in enumerate(L_): print('structure', nm_, i_, st_['key'], int(((FWK if nm_ == 'gone' else FWN) == i_).sum()), 'px')
ch85 = np.array([b['key'] not in same and b['key'] not in cont for b in P85] + [False]); ch26 = np.array([b['key'] not in same for b in P26] + [False])
GONE = ch85[M85]; NEW = ch26[M26]
kk85 = np.array([b['key'] for b in P85] + ['']); kk26 = np.array([b['key'] for b in P26] + [''])
SAMEB = (kk85[M85] == kk26[M26]) & (M85 >= 0); GB = (M85 < 0) & (M26 < 0)
# class changes the IDs miss (landmark crowns, models): building classes involved, not the same building by ID, near a change
bl = lambda c: np.isin(c, (2, 4, 6))
cchg = (c85 != c26) & (bl(c85) | bl(c26)) & ~SAMEB & ~(GONE | NEW)
lab, n = nd.label(cchg); near = nd.binary_dilation(GONE | NEW, iterations=10)
keep = np.zeros(n + 1, bool); keep[np.unique(lab[near & (lab > 0)])] = True; keep[0] = False
ADD = keep[lab]; UNEX = cchg & ~ADD
print('NEW %.4f GONE %.4f ADD %.4f unexplained class-change %.4f (px %d)' % (NEW.mean(), GONE.mean(), ADD.mean(), UNEX.mean(), UNEX.sum()))
# CROWNS (hero): EVERY pixel of a changed landmark above its prism's top outline, any class: per column of the prism's top span
# (+-8 px), from the topmost pixel (up to 60 m above the top for towers > 100 m, else 15 m) where that year's render shows the model
# (landmark class) or the two renders differ (any class; unblurred max |dRGB| > 20), running on from the top edge with gaps <= 12 px, solid down to the prism's top edge (lattice
# gaps included); Z there = the prism height + the rise above the outline
Ra = np.load(E + 'R_1985.npy'); Rb = np.load(E + 'R_2026.npy')
rdiff = np.abs(Ra.astype(np.int16) - Rb.astype(np.int16)).max(-1) > 20; del Ra, Rb
rdiff = nd.binary_opening(rdiff, iterations=1) | (nd.uniform_filter(rdiff.astype(np.float32), 5) > 0.5)
# search height above the prism top (m): the model's crown/spire beyond the prism's roof h (SOURCED heights: Salesforce 326 m vs roof
# 296 m; 181 Fremont spire 245 m vs roof 210 m; Millennium Tower 197 m vs prism 184 m) + 4 m; other towers 10 m; low landmark
# prisms (the Transit Center's parts: its model stands ~25 m over them) 25 m. A wider box grabs the new towers' shadow changes.
CROWN_UP = {'L900011063': 34, 'L900010917': 39, 'g137649': 17}
CROWN = np.zeros((H, W), bool); CRK = []
for P, C_, M_, Z_, yr in ((P26, c26, M26, Z26, 'n'), (P85, c85, M85, Z85, 'g')):
    for k, b in enumerate(P):
        if b['kind'] != 'lm' or b['key'] in same: continue
        Mb, _ = id_map_z([b], O, W, H); cols = np.nonzero((Mb >= 0).any(0))[0]
        if not len(cols): continue
        ytop = np.full(W, -1); ytop[cols] = (Mb[:, cols] >= 0).argmax(0)
        x0, x1 = max(0, cols.min() - 8), min(W, cols.max() + 9); up = CROWN_UP.get(b['key'], 10 if b['h'] > 100 else 25) * PXZ
        ev = (C_ == 4) | rdiff; cr = np.zeros((H, W), bool)
        for x in range(x0, x1):
            yt = ytop[np.clip(x, cols.min(), cols.max())] if ytop[x] < 0 else ytop[x]
            if yt < 0: continue
            y0 = int(max(0, yt - up)); col = ev[y0:yt, x][::-1]; r = np.nonzero(col)[0]   # upward from the top edge
            if not len(r): continue
            gaps = np.diff(np.r_[-1, r]); cut = np.nonzero(gaps > 12)[0]                    # evidence must run on from the edge (gaps <= 12 px)
            r = r[:cut[0]] if len(cut) else r
            if len(r): cr[yt - 1 - r.max():yt + 1, x] = True
        cr = nd.binary_closing(cr, iterations=3); cr = nd.binary_opening(cr, iterations=2)
        oth = (M_ >= 0) & (M_ != k); chg_ = np.array([bb['key'] not in same for bb in P] + [False])[M_]
        cr &= ~STRV & ~(oth & chg_) & ~(oth & (Z_ > 0) & ~(C_ == 4) & ~rdiff)   # never another changed prism's px
        if cr.sum() < 100: continue
        ys_, xs_ = np.nonzero(cr); yt_ = ytop[np.clip(xs_, cols.min(), cols.max())]
        CROWN |= cr; CRK.append((b['key'], yr, int(cr.sum()), int((yt_ - ys_).max() / PXZ)))
        if yr == 'n': NEW |= cr; M26[cr] = k; Z26[ys_, xs_] = b['h'] + np.maximum(yt_ - ys_, 0) / PXZ
        else: GONE |= cr; M85[cr] = k; Z85[ys_, xs_] = b['h'] + np.maximum(yt_ - ys_, 0) / PXZ
for c_ in CRK: print('crown', c_)
print('crown px', CROWN.sum())
GONE &= ~STRV; NEW &= ~STRV; ADD &= ~STRV; CH = GONE | NEW | ADD
# render-evidence growth (caller follow-up 1): class-change components touching the masks + structure change within 12 px
from geo import grow
ADD2, Gev = grow(CH, c85, c26, 12)
ADD2 &= ~STRV; ADD = ADD | ADD2; CH = CH | ADD2; print('render-evidence growth px', int(ADD2.sum()))
# owner of each changed pixel: the changed prism visible there (1985 gone first, else 2026 new), ADD -> nearest
own = np.full((H, W), -1, np.int32)                      # code: +k -> P26[k] (new), -(k+2) -> P85[k] (gone)
own[NEW] = M26[NEW]; own[GONE] = -(M85[GONE] + 2)
if ADD.any():
    idx = nd.distance_transform_edt(~(GONE | NEW), return_distances=False, return_indices=True)
    own[ADD] = own[idx[0][ADD], idx[1][ADD]]
# shadow sweeps of the changed prisms (need height per pixel), prisms that can reach the core
chp = [('n', k, b) for k, b in enumerate(P26) if b['key'] not in same] + [('g', k, b) for k, b in enumerate(P85) if b['key'] not in same and b['key'] not in cont]
SN = np.full((H, W), np.inf, np.float32); SO = np.full((H, W), -1, np.int32); SH = np.zeros((H, W), np.float32)   # need, owner(code), owner h
for t, k, b in chp:
    nd_ = shadow_need(b, O, W, H)
    if not np.isfinite(nd_).any(): continue
    code = k if t == 'n' else -(k + 2); frac = nd_ / b['h']
    better = np.isfinite(nd_) & (b['h'] > SH)            # the tallest changed caster owns the pixel
    SN[better] = nd_[better]; SO[better] = code; SH[better] = b['h']
SW = np.isfinite(SN); print('shadow sweep frac %.3f casters %d' % (SW.mean(), len(np.unique(SO[SW]))))
# the ratio: linear luminance, pre-blur 1 px, log2 ratio smoothed at 2 px, soft dead band, clamp
def lin(x): x = x.astype(np.float32) / 255.; return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def srgb(x): x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055) * 255
W3 = np.array([.2126, .7152, .0722], np.float32)
l85 = nd.gaussian_filter(lin(np.load(E + 'R_1985.npy')) @ W3, 1); l26 = nd.gaussian_filter(lin(np.load(E + 'R_2026.npy')) @ W3, 1)
L = nd.gaussian_filter(np.log2((l85 + 2e-3) / (l26 + 2e-3)), 2)
static = (SAMEB | GB) & (c85 == c26) & ~CH
# the 1985 render's landmark models carry a material tint (pink, brighter): a per-class bias measured where no changed
# object can shade (outside every sweep), removed before the ratio is used (it is not a light change)
for c_ in range(8):
    ref = static & (c85 == c_) & ~SW
    if ref.sum() > 20000:
        b_ = float(np.median(L[ref])); print('class', c_, 'log2 bias outside sweeps %.3f' % b_, int(ref.sum()))
        if abs(b_) > 0.05: L[static & (c85 == c_)] -= b_
L = np.clip(L, -2.5, 2.5) * np.clip((np.abs(L) - 0.06) / 0.12, 0, 1)
# NON-BUILDING changes (round 3): freeways, ramps, plazas, parks, trees - render evidence for any class (geo.any_change)
# + the lost structures of era.STRUCTURES standing in 1985 (the Embarcadero Freeway) as prisms
from geo import any_change
NB, EVany = any_change(CH, c85, c26)
# the structures (union, as w3's FW/FWs/FWZ/FWH): gone first, else new; FWK / FWN / FWNs / FWNZ per list (structures.json)
FW = STRV.copy(); FWs = np.where(FWK >= 0, FWs, np.where(FWN >= 0, FWNs, -1)).astype(np.float32)
FWZ = np.where(FWK >= 0, FWZg, np.where(FWN >= 0, FWNZ, 0)).astype(np.float32); FWH = float(max([s_['h'] for s_ in STG + STN] + [0.0]))
json.dump([dict(i=i, key=s_['key'], kind=s_['kind'], gone=bool(s_['gone']), y0=float(s_['y0']), y1=float(s_['y1']), dem=list(s_['dem']) if s_['dem'] else None,
                h=round(float(s_['h']), 2), path_len_m=round(float(s_['path_len_m']), 1), px=int(((FWK if s_['gone'] else FWN) == i).sum()))
           for L_ in (STG, STN) for i, s_ in enumerate(L_)], open(IN + 'structures.json', 'w'), indent=1)
FWm = nd.binary_dilation(FW, iterations=4)
NB = (NB | FWm) & ~CH   # (CH has no structure px)
# shadows of the changed ground objects (2026 trees' shadows next to trees that are not there in 1985): light-change pixels on
# ground classes connected to NB within 80 px join it (else 2026 tree shadows would stay in 1985 without their trees)
_a = nd.gaussian_filter(np.load(E + 'R_1985.npy').astype(np.float32).mean(-1), 2) + 3; _b = nd.gaussian_filter(np.load(E + 'R_2026.npy').astype(np.float32).mean(-1), 2) + 3
_lc = (np.abs(np.log2(_a / _b)) > 0.25) & np.isin(c85, (0, 3, 5, 7)) & np.isin(c26, (0, 3, 5, 7)) & ~CH
_lc = nd.binary_opening(_lc, iterations=2) & nd.binary_dilation(NB, iterations=150)
_l, _n = nd.label(_lc | NB); keep_ = np.unique(_l[NB]); keep_ = keep_[keep_ > 0]
_add = np.isin(_l, keep_) & _lc & ~NB; print('ground shadow px joined to NB', int(_add.sum()))
NB = nd.binary_closing(NB | _add, iterations=6) & ~CH
_hl = nd.binary_fill_holes(NB | CH) & ~(NB | CH); _lh, _nh = nd.label(_hl)
if _nh: _hs = nd.sum(_hl, _lh, range(1, _nh + 1)); NB |= np.isin(_lh, 1 + np.nonzero(_hs < 30000)[0])
print('non-building change px %d (%.3f of window)' % (NB.sum(), NB.mean()))
pasteCH = nd.gaussian_filter(nd.binary_dilation(CH, iterations=1).astype(np.float32), 1.5)
pasteNB = nd.gaussian_filter(nd.binary_dilation(NB, iterations=4).astype(np.float32), 5.0) * (1 - pasteCH)
paste = np.clip(pasteCH + pasteNB, 0, 1)
rmask = nd.gaussian_filter((SW & static & ~NB).astype(np.float32), 2.0) * (1 - np.clip(paste * 2, 0, 1))
# guards (found in the follow-up check: a white burn on the street): (a) the 1985 render's red light spill from the Sanborn
# stand-in materials is not a light change (non-landmark px whose R/G rose > 1.3x -> no lift); (b) where the 2026 AI did not
# paint the render's shadow (already bright) a lift would blow out -> positive L fades out above linear lum 0.35-0.6;
# (c) clamp to [-2, 1.3] log2
Ra_ = nd.gaussian_filter(np.load(E + 'R_1985.npy').astype(np.float32), (3, 3, 0)) + 2; Rb_ = nd.gaussian_filter(np.load(E + 'R_2026.npy').astype(np.float32), (3, 3, 0)) + 2
spill = ((Ra_[..., 0] / Ra_[..., 1]) / (Rb_[..., 0] / Rb_[..., 1]) > 1.3) & (c85 != 4); del Ra_, Rb_
pickle.dump(dict(same=same, cont=cont), open(WK + 'same.pkl', 'wb')); pickle.dump(dict(same=same, cont=cont), open(IN + 'same.pkl', 'wb'))
KEYS = dict(GONE=GONE, NEW=NEW, ADD=ADD, CH=CH, own=own, M85=M85, M26=M26, Z85=Z85, Z26=Z26, SN=SN, SO=SO, SW=SW, rmask=rmask, L=L, static=static, UNEX=UNEX, CROWN=CROWN, Gev=Gev, NB=NB, FW=FW, FWs=FWs, FWZ=FWZ, FWH=FWH, FWK=FWK, FWN=FWN, FWNs=FWNs, FWNZ=FWNZ, pasteCH=pasteCH, spill=spill)
np.savez(WK + 'stageA.npz', **KEYS)
np.savez_compressed(IN + 'state.npz', PROVISIONAL=np.array(1), **{k_: KEYS[k_] for k_ in ('GONE', 'NEW', 'ADD', 'CH', 'own', 'M85', 'M26', 'Z85', 'Z26', 'SN', 'SO', 'SW', 'static', 'CROWN', 'FW', 'FWs', 'FWZ', 'FWH', 'FWK', 'FWN', 'FWNs', 'FWNZ')})
print('prep done: work/stageA.npz, in/state.npz (provisional), in/structures.json')
