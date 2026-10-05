"""k4r.py (era_auto k25) RULE K4R: vegetation the AI invented is REPAIRED, not only detected (keys.py K4 was detection only since i3:
its blur fill left smears). Called from keys.rules when K4_REPAIR=1.

WHAT. A live tree / lawn / bush in the painting needs a reason in the year's render: a tree or lawn there (class pass 'tree', or a green
render). Where the painting is green and the render gives no reason, the painting is wrong:
  K4  (any year)    green texture on ground classes (open ground / street / object) where the render is neither tree class nor green
                    (keys.invented_veg, unchanged)
  K4B (ash years)   inside the 1906 burned district (era.burn_rings, burnpx.py) while its ash lay (era.ash_ground: 18 Apr 1906 - mid 1908)
                    ANY class: nothing lived there. SOURCED: the photographs of May 1906 show no standing foliage inside the burn (Lawrence,
                    'San Francisco in Ruins', 28 May 1906; USGS 1906 photo archive); CONVENTION: 'green' = the K4 colour test.
  + the invented tree's own SHADOW: within 60 px of the blob, ground where the painting is darker than the fill by > 18 (its shadow
    would stay as a dark stain otherwise).
HOW (no smear). The pixels take the year's RENDER (ctx R_pt, the AI's own input, pixel-registered with the painting) carried into the
painting's local colour: fill = render + G(key - render) over clean pixels round the blob (normalized convolution, sigma 24 px), its
fine detail raised to the painting's local contrast (std ratio, clipped 1..2.2). The render holds the real structure (ash, rubble,
chimneys and their shadows, the paving) so the fill is sharp; only its colour comes from the painting. Feather 2 px.
CONVENTION on the numbers (dilation 5 px, shadow 40 px / 18 levels, sigma 24)."""
import numpy as np, cv2
from scipy import ndimage as nd

FIRE = 1906 + 107 / 365.0
import os
K4R_MAX = int(os.environ.get('K4R_MAX', '2500'))


def ash_year(Y):
    m = 1906 + 147 / 365.0 if int(Y) == 1906 else int(Y) + 0.5      # = era.when / common.moment
    return FIRE <= m < 1908.5                                          # = era.ash_ground


def _nconv(img, ok, s):
    num = cv2.GaussianBlur(img * ok[..., None], (0, 0), s); den = cv2.GaussianBlur(ok, (0, 0), s)[..., None]
    return num / np.maximum(den, 1e-3), den[..., 0]


def repair(key, Rp, cY, mk, burn, V0, dk, feather):
    """key float32 HxWx3 (the painting), Rp the year's render (pretone) HxWx3, cY class codes, mk the year's mask (bool), burn the burned
    district (bool or None outside ash years), V0 = keys.invented_veg; -> key, stats"""
    k = np.clip(key, 0, 255); Rf = Rp.astype(np.float32)
    gk = (k[..., 1] - np.maximum(k[..., 0], k[..., 2]) > 6) & (k[..., 1] > 50)
    gr = cv2.blur(((Rf[..., 1] - np.maximum(Rf[..., 0], Rf[..., 2])) > 3).astype(np.float32), (25, 25)) > 0.15
    tr = dk(cY == 3, 15)
    V = V0.copy(); nb = 0
    if burn is not None:
        hsv_s = (Rf.max(-1) - Rf.min(-1)) / np.maximum(Rf.max(-1), 1.0)
        flat = (cY == 0) | (cY == 5) | (cY == 7) | ((cY == 6) & (hsv_s < 0.18))      # ground, or the grey ash heaps (k25 ASH_MOUND, building class)
        VB = mk & gk & burn & ~gr & ~tr & flat
        VB = cv2.morphologyEx(VB.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
        lab, n = nd.label(VB)
        if n:
            sz = nd.sum(VB, lab, np.arange(1, n + 1)); keep = np.zeros(n + 1, bool); keep[1:] = sz >= 60; VB = keep[lab]
        # (k25 rev 3) the whole crown on the ash: any class (a crown over a heap or a wall top is still a crown), seeds of >= 60 px
        VA = mk & gk & burn & ~gr & ~tr
        lab, n = nd.label(VA)
        if n: sz = nd.sum(VA, lab, np.arange(1, n + 1)); keep = np.zeros(n + 1, bool); keep[1:] = sz >= 20; VB |= keep[lab]     # (rev 6) 20 px: small crowns (i19)
        nb = int((VB & ~V).sum()); V |= VB
    # WHOLE OBJECTS ONLY (a crown cut in part is the smear that got the old fill rejected): an object = the whole crown grown from the
    # green seed (below) + 6 px. An object near the render's own tree (41 px) or the water is left whole.
    # the crown: green-hued pixels (any brightness: the shaded leaves fail the K4 test) round the seed, closed, holes filled
    vl = ((k[..., 1] - (k[..., 0] + k[..., 2]) / 2 > 3) | (k @ np.array([0.3, 0.59, 0.11], np.float32) < 45)) & dk(V, 61)
    vl = cv2.morphologyEx(vl.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))) > 0
    lab, n = nd.label(vl)
    if n: hit = np.zeros(n + 1, bool); hit[np.unique(lab[V & vl])] = True; hit[0] = False; vl = nd.binary_fill_holes(hit[lab])
    O = dk(vl | V, 13); lab, n = nd.label(O); near_t = []; BIG = []; OB = np.zeros(O.shape, bool)
    if n:
        bad = np.unique(lab[(dk(cY == 3, 41) | dk(cY == 1, 15)) & O]); keep = np.ones(n + 1, bool); keep[bad] = False; keep[0] = False
        near_t = bad[bad > 0]
        # (K4P) a big crown is not grafted (a large render patch reads as a grainy CG hole in the painting): it is listed for a RE-PAINT
        # of its tile (k4p_<Y>.json; the year's corrected render + the era prompt, a new seed). CONVENTION: K4R_MAX = 2500 px (~4.7 m^2 at L9).
        sz = nd.sum(O, lab, np.arange(n + 1)); big = keep & (sz > K4R_MAX); keep0 = keep.copy()
        PB = np.zeros(n + 1, bool)
        if burn is not None and os.environ.get('K4R_BURN_ANY', '1') == '1':
            # (k25 rev 3) RULE K4R_BURN_ANY: in the ash years EVERY crown inside the burned district is caught, whatever its size (i17a: 3 big
            # crowns on the 1906 ash stayed). Tested on i17a: a graft from the render reads as a bluish CG hole, a patch of the painting's own ash
            # from beside it copied other trees and houses in and cut crowns in part. So: every burn crown goes to the RE-PAINT list (K4P, a
            # new seed, the fire + NOTREE prompt), merged back only inside its box; K4R_PATCH=1 tries the patch instead (off).
            PB[np.unique(lab[O & burn])] = True; PB[0] = False
            if os.environ.get('K4R_PATCH', '0') == '1': big &= ~PB; keep &= ~PB
            else: big |= PB & keep & (sz > K4R_MAX)      # (rev 6) a SMALL crown on the ash is repaired here (K4P may not run: i19)
        keep &= ~big
        BIG.extend(sl for i, sl in enumerate(nd.find_objects(lab), 1) if big[i])
        OB = (PB & keep0)[lab] if (n and os.environ.get('K4R_PATCH', '0') == '1') else np.zeros(O.shape, bool); O = keep[lab]
    st = dict(K4R_veg=int(V0.sum()), K4R_burn_extra=nb, K4R_left_whole=int(len(near_t)), K4P_big=len(BIG), K4P_boxes=[[s_[1].start, s_[0].start, s_[1].stop, s_[0].stop] for s_ in BIG])
    if not O.any() and not OB.any(): st['K4R_px'] = 0; return key, st
    V = V & O; M = O
    lum = lambda a: a @ np.array([0.3, 0.59, 0.11], np.float32)
    out = key.copy(); tot = dict(K4R_px=0, K4R_shadow=0, K4R_lowcover=0)
    work = dk(M, 61); lab_w, nw = nd.label(work); P = 120
    for sl in nd.find_objects(lab_w):                                   # each blob in its own window (the core is 70 Mpx)
        y0, y1 = max(0, sl[0].start - P), min(M.shape[0], sl[0].stop + P); x0, x1 = max(0, sl[1].start - P), min(M.shape[1], sl[1].stop + P)
        w = np.s_[y0:y1, x0:x1]
        kw, Rw, Mw, Vw, trw, gkw, cw = k[w], Rf[w], M[w], V[w], tr[w], gk[w], cY[w]
        bw = burn[w] if burn is not None else np.zeros(Mw.shape, bool)
        hpR = Rw - cv2.GaussianBlur(Rw, (0, 0), 3); hpK = kw - cv2.GaussianBlur(kw, (0, 0), 3)
        def _fill(bad):
            clean = (~dk(bad, 9) & ~gkw & ~trw).astype(np.float32)
            lo, den = _nconv(kw - Rw, clean, 24)                         # the painting's colour over the render, round the blob
            dn = np.maximum(cv2.GaussianBlur(clean, (0, 0), 24), 1e-3)
            sR = cv2.GaussianBlur(lum(hpR) ** 2 * clean, (0, 0), 24) / dn; sK = cv2.GaussianBlur(lum(hpK) ** 2 * clean, (0, 0), 24) / dn
            gain = np.clip(np.sqrt(sK / np.maximum(sR, 1e-2)), 1.0, 2.2)[..., None]    # the render's fine detail at the painting's local contrast
            return Rw + lo + hpR * (gain - 1.0), den
        fill, den = _fill(Mw)
        # the invented tree's shadow: darker painting next to the blob where the fill is not dark; only pieces touching the blob
        near = dk(Vw, 121) & ~Mw & ~trw & ((cw == 0) | (cw == 5) | (cw == 7) | bw)
        S = near & (cv2.GaussianBlur(lum(fill) - lum(kw), (0, 0), 2) > 18)
        lab, n = nd.label(S)
        if n:
            touch = np.zeros(n + 1, bool); touch[np.unique(lab[dk(Mw, 9) & S])] = True; touch[0] = False; S = touch[lab]
        M2 = Mw | dk(S, 3)
        if S.any(): fill, den = _fill(M2)                                # second pass: the painted shadow no longer darkens the colour sample
        f = feather(M2, 2); out[w] = out[w] * (1 - f) + np.clip(fill, 0, 255) * f
        tot['K4R_px'] += int(M2.sum()); tot['K4R_shadow'] += int(S.sum()); tot['K4R_lowcover'] += int((M2 & (den < 0.05)).sum())
    st.update(tot, K4R_blobs=int(nw))
    if OB.any(): out, sp = patch_fill(out, OB, gk, cY, dk, feather); st.update(sp)
    return out, st


def patch_fill(out, OB, gk, cY, dk, feather):
    """(k25 rev 3, K4R_BURN_ANY) each object of OB (a crown on the ash, grown 13 px) + its painted shadow + 6 px takes the painting's own pixels
    from an offset beside it: 8 directions x 3 distances (1.3 / 1.8 / 2.5 x the object's size), the source wholly off every object and off green,
    the best = the least colour difference along the object's ring; feather 3 px. CONVENTION on the numbers."""
    lum = lambda a: a @ np.array([0.3, 0.59, 0.11], np.float32)
    H, W = OB.shape; lab, n = nd.label(OB); bad_all = dk(OB, 9) | gk; done = 0; fails = 0; px = 0
    for i, sl in enumerate(nd.find_objects(lab), 1):
        P = 140; y0, y1 = max(0, sl[0].start - P), min(H, sl[0].stop + P); x0, x1 = max(0, sl[1].start - P), min(W, sl[1].stop + P)
        Mo = lab[y0:y1, x0:x1] == i; kw = out[y0:y1, x0:x1]
        # its painted shadow: clearly darker than the ash's local median, touching the crown, within 120 px
        L_ = lum(np.clip(kw, 0, 255)); med = cv2.medianBlur(np.clip(L_, 0, 255).astype(np.uint8), 61).astype(np.float32)
        S = dk(Mo, 121) & ~Mo & (L_ < med - 25); lb, m = nd.label(S)
        if m: t = np.zeros(m + 1, bool); t[np.unique(lb[dk(Mo, 7) & S])] = True; t[0] = False; S = t[lb]
        # the whole crown in this window: green-hued (any brightness) pixels connected to the object, wherever the burn line or the class
        # pass cuts it (i17a: a crown's top over the unburned pocket stayed)
        kc = np.clip(kw, 0, 255); g2 = (kc[..., 1] - (kc[..., 0] + kc[..., 2]) / 2 > 2) & dk(Mo, 101)
        g2 = cv2.morphologyEx(g2.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0
        lg, mg = nd.label(g2)
        if mg: t = np.zeros(mg + 1, bool); t[np.unique(lg[dk(Mo, 5) & g2])] = True; t[0] = False; Mo = Mo | t[lg]
        M = nd.binary_fill_holes(dk(Mo | S, 13)); ys, xs = np.nonzero(M)
        if not len(ys): continue
        ring = dk(M, 9) & ~M; ry, rx = np.nonzero(ring)
        hgt, wid = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1; best = None
        for f in (1.3, 1.8, 2.5):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
                ox, oy = int(dx * f * wid), int(dy * f * hgt)
                sy, sx = ys + y0 + oy, xs + x0 + ox
                if sy.min() < 0 or sx.min() < 0 or sy.max() >= H or sx.max() >= W: continue
                if bad_all[sy, sx].mean() > 0.01 or (cY[sy, sx] == 1).mean() > 0.01: continue
                qy, qx = ry + y0 + oy, rx + x0 + ox
                if qy.min() < 0 or qx.min() < 0 or qy.max() >= H or qx.max() >= W: continue
                d = float(np.abs(out[qy, qx] - out[ry + y0, rx + x0]).mean())
                if best is None or d < best[0]: best = (d, ox, oy)
            if best is not None and best[0] < 12: break
        if best is None: fails += 1; continue
        _, ox, oy = best
        src = out[y0 + oy:y1 + oy, x0 + ox:x1 + ox] if (y0 + oy >= 0 and x0 + ox >= 0 and y1 + oy <= H and x1 + ox <= W) else None
        if src is None: fails += 1; continue
        f_ = feather(M, 3); out[y0:y1, x0:x1] = kw * (1 - f_) + src * f_; done += 1; px += int(M.sum())
    return out, dict(K4R_patch_objects=done, K4R_patch_failed=fails, K4R_patch_px=px)
