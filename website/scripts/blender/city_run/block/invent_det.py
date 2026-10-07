"""(city_run/block/invent_det.py, 07/10 OPEN-GROUND) the 'invent' detector (autoreroll, CITY != sf): an AI tile region that looks like a
roof / building where the render has no building (kits vt: Tudor mansions painted over Jericho / Locarno / Spanish Banks meadows and
beach, city_today/kits_beach_strip.jpg).
  open zone   render class ground (0) or tree (3), farther than BUF L9 px from any render building / landmark / other (class 2, 4, 6, 7)
  roof-like   AI px in the zone: low Lab chroma (< CHMAX: charcoal / grey / brown-grey roofs, pale walls), L in (LMIN, LMAX), not green,
              and far from the render colour (dE > DE), where the render px is chromatic (>= RCH: grass, leaves, sand; a
              repainted grey parking lot is not an invented house). Mown grass gone yellow is chromatic and green leaves are green: neither counts.
  blob        roof-like px (closed, opened) with area >= AMIN L9 px^2 and an inscribed radius >= RMIN L9 px (a row of driftwood logs,
              a path or a gravel strip is thin) and straight edges: >= EDGE of the AI's edge energy in and around it within +-7.5 deg of one direction or its
              normal (an isotropic texture: 3/18 = 0.17; a gabled house: two perpendicular edge families)
  invent = total area (L9 px^2) of such blobs; a tile is flagged at >= TH_INVENT
  invent(o, r, c, s=1) -> (score, blob mask)    o, r: tile RGB (AI, render), c: class codes (tile_content.codeof); s: 1 = L9, 2 = half"""
import numpy as np, cv2
from scipy import ndimage as nd
BUF, DE, CHMAX, LMIN, LMAX, AMIN, RMIN, EDGE, TH_INVENT, RCH = 24, 18.0, 18.0, 35, 185, 4000, 14, 0.30, 12000, 10.0

def _lab(a): return cv2.cvtColor(np.ascontiguousarray(a), cv2.COLOR_RGB2LAB).astype(np.float32)

def invent(o, r, c, s=1, info=None):
    b = s * s; bld = np.isin(c, (2, 4, 6, 7)); z = np.isin(c, (0, 3))
    zone = z & ~nd.binary_dilation(bld, iterations=max(1, BUF // s)) if bld.any() else z
    if zone.sum() * b < AMIN: return 0, np.zeros(c.shape, bool)
    Lo, Lr = _lab(o), _lab(r); de = np.sqrt(((Lo - Lr) ** 2).sum(-1)); ch = np.hypot(Lo[..., 1] - 128, Lo[..., 2] - 128)
    oi = o.astype(np.int16); grn = (oi[..., 1] > oi[..., 0] + 3) & (oi[..., 1] > oi[..., 2] - 6)
    natural = np.hypot(Lr[..., 1] - 128, Lr[..., 2] - 128) >= RCH   # the render shows grass / leaves / sand there, not grey paving
    cand = zone & natural & (de > DE) & ~grn & (ch < CHMAX) & (Lo[..., 0] > LMIN) & (Lo[..., 0] < LMAX)
    k = max(1, 4 // s); cand = nd.binary_opening(nd.binary_closing(cand, iterations=k), iterations=k)
    l, n = nd.label(cand); keep = np.zeros(c.shape, bool); sc = 0
    if not n: return 0, keep
    area = np.bincount(l.ravel())[1:] * b; big = np.where(area >= AMIN)[0]
    if not len(big): return 0, keep
    dt = nd.distance_transform_edt(np.isin(l, big + 1)); rad = nd.maximum(dt, l, big + 1) * s
    g = cv2.GaussianBlur(cv2.cvtColor(o, cv2.COLOR_RGB2GRAY).astype(np.float32), (3, 3), 0)
    gx_, gy_ = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1); mag = np.hypot(gx_, gy_)
    ang = (np.degrees(np.arctan2(gy_, gx_)) % 90.0 / 5).astype(np.int32) % 18   # 5-degree bins of the edge direction mod 90
    for i, rd in zip(big, rad):
        m = nd.binary_dilation(l == i + 1, iterations=max(1, 3 // s)); w = mag[m] * (mag[m] > 20)
        h = np.bincount(ang[m], weights=w, minlength=18); h3 = h + np.roll(h, 1) + np.roll(h, -1)
        coh = float(h3.max() / max(h.sum(), 1e-6))   # share of edge energy within +-7.5 deg of one direction (or its normal): 3/18 = isotropic
        if info is not None: info.append((int(area[i]), round(float(rd), 1), round(coh, 3)))
        if rd >= RMIN and coh >= EDGE: keep |= l == i + 1; sc += int(area[i])
    return sc, keep
