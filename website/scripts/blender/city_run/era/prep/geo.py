# geo.py: geometry-change evidence from the two untoned renders (not light): class change that is not a pure relabel, or
# local structure change (NCC of luminance, sigma 3 windows, gain-invariant so shadows do not count)
import numpy as np, scipy.ndimage as nd
import common as CM; E = CM.E   # b52eprep
def geo(c85, c26):
    a = np.load(E + 'R_1985.npy').astype(np.float32).mean(-1); b = np.load(E + 'R_2026.npy').astype(np.float32).mean(-1)
    g = lambda x: nd.gaussian_filter(x, 3)
    ma, mb = g(a), g(b); va = np.maximum(g(a * a) - ma * ma, 0); vb = np.maximum(g(b * b) - mb * mb, 0); cab = g(a * b) - ma * mb
    ncc = cab / np.sqrt(va * vb + 1e-3)
    tex = (np.sqrt(va) > 6) | (np.sqrt(vb) > 6)
    bl = lambda c: np.isin(c, (2, 4, 6))
    bld = bl(c85) | bl(c26)
    structural = tex & (ncc < 0.35)
    relabel = np.isin(c85, (2, 4, 6)) & np.isin(c26, (2, 4, 6)) & (ncc > 0.6)
    cchg = (c85 != c26) & ~relabel
    G = bld & (cchg | structural)
    G = nd.binary_opening(G, iterations=2)
    return G, ncc
def grow(CH, c85, c26, near_px=12):
    """pixels to add to the changed masks: class-change components (not relabels) that touch the masks grown by near_px,
    plus structure-change pixels within near_px of the masks (window-level reflection changes further out are light, not geometry)"""
    G, ncc = geo(c85, c26)
    a = np.load(E + 'R_1985.npy').astype(np.float32).mean(-1); b = np.load(E + 'R_2026.npy').astype(np.float32).mean(-1)
    relabel = np.isin(c85, (2, 4, 6)) & np.isin(c26, (2, 4, 6)) & (ncc > 0.6)
    cc = G & (c85 != c26) & ~relabel
    near = nd.binary_dilation(CH, iterations=near_px)
    lab, n = nd.label(cc & ~CH); t = np.unique(lab[near & (lab > 0)]); t = t[t > 0]
    A = np.isin(lab, t)
    B = G & near & ~CH
    # whole structure-change components touching the masks when the render changes strongly (a building redrawn on the same
    # record: g142902 white in 1985 / brick in 2026; the new tower's lower facade behind an over-tall neighbour prism);
    # window-level reflection changes stay out (|dRGB| ~ 35-45)
    dR = np.abs(np.load(E + 'R_1985.npy').astype(np.float32) - np.load(E + 'R_2026.npy').astype(np.float32)).mean(-1)
    lg, ng = nd.label(G & ~CH); tg = np.unique(lg[near & (lg > 0)]); tg = tg[tg > 0]
    if len(tg):
        md = nd.mean(dR, lg, tg); A = A | np.isin(lg, tg[md >= 70])
    add = nd.binary_closing(A | B, iterations=4) & ~CH
    # small holes of the grown masks (window-sized gaps where the two renders happen to agree) are closed, or the paste lets
    # the other year show through as dark spots; big enclosed areas stay
    U = add | CH; hl = nd.binary_fill_holes(U) & ~U; lh, nh = nd.label(hl)
    if nh:
        hs = nd.sum(hl, lh, range(1, nh + 1)); add |= np.isin(lh, 1 + np.nonzero(hs < 3000)[0])
    return add, G
def any_change(CH, c85, c26, SW=None):
    """render evidence of change for ANY class (freeways, ramps, plazas, parks, piers, trees): class change that is not a relabel,
    local structure change (NCC), or a colour change a single light gain cannot explain; minus light-only cases (landmark glass
    reflections: landmark class both years with a moderate difference). Grown to regions: open, keep >= 600 px, dilate 6,
    close 8, fill holes < 20000 px. Returns the region outside the building masks and the raw evidence."""
    G, ncc = geo(c85, c26)
    A = np.load(E + 'R_1985.npy').astype(np.float32); B = np.load(E + 'R_2026.npy').astype(np.float32)
    As = nd.gaussian_filter(A, (3, 3, 0)) + 2; Bs = nd.gaussian_filter(B, (3, 3, 0)) + 2
    gain = As.mean(-1, keepdims=True) / Bs.mean(-1, keepdims=True)
    cdiff = np.abs(As - Bs * gain).max(-1)                     # colour change after the best grey gain (a shadow has ~0)
    dR = np.abs(As - Bs).max(-1); del A, B
    relabel = np.isin(c85, (2, 4, 6)) & np.isin(c26, (2, 4, 6)) & (ncc > 0.6)
    tex = nd.gaussian_filter(np.load(E + 'R_2026.npy').astype(np.float32).mean(-1), 0) * 0   # placeholder (kept simple)
    ev = ((c85 != c26) & ~relabel) | ((ncc < 0.35) & G) | (ncc < 0.2) & (dR > 25) | (cdiff > 28)
    # building-vs-building pixels belong to the building masks (+ grow); here only where either year is NOT a building class
    # (ground, water, trees, streets, freeways/structures): landmark glass reflections and the 1985 pink landmark tint drop out
    bl = lambda c: np.isin(c, (2, 4, 6))
    ev &= ~(bl(c85) & bl(c26))
    ev = nd.binary_opening(ev, iterations=2)
    lab, n = nd.label(ev); sz = nd.sum(ev, lab, range(1, n + 1)); ev = np.isin(lab, 1 + np.nonzero(sz >= 600)[0])
    R = nd.binary_closing(nd.binary_dilation(ev, iterations=6), iterations=8)
    hl = nd.binary_fill_holes(R) & ~R; lh, nh = nd.label(hl)
    if nh:
        hs = nd.sum(hl, lh, range(1, nh + 1)); R |= np.isin(lh, 1 + np.nonzero(hs < 20000)[0])
    # large regions (a freeway deck over a street reads as 'the same street' in its flat middle): the convex hull of each group of
    # nearby components (25 px), minus building-in-both-years pixels, when the hull adds < 80 %
    import cv2
    bb = bl(c85) & bl(c26); R &= ~CH
    glab, ng = nd.label(nd.binary_dilation(R, iterations=25))
    for g_ in range(1, ng + 1):
        m = R & (glab == g_); a_ = m.sum()
        if a_ < 20000: continue
        cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        Hm = np.zeros(m.shape, np.uint8); cv2.fillPoly(Hm, [cv2.convexHull(np.concatenate(cs))], 1); Hm = Hm.astype(bool) & ~bb & ~CH
        if Hm.sum() < 1.8 * a_: R |= Hm
    return R & ~CH, ev
