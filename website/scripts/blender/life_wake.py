"""The wakes of the moving boats, as decals 3 cm over the sea (life_hq.py).

A wake is what makes a boat read at 37 cm a pixel: from the air a ferry is a
white fleck, its wake a line hundreds of metres long. Two parts:
  the TRAIL: the water the hull and the propellers (or waterjets) churned,
    along the path the boat came by (a ferry's curved route), as wide as the
    boat at the stern and spreading to ~3 beams, white at the stern (the
    boil), then lighter, greener water fading out;
  the two ARMS of the bow wave, from the bow, diverging at the Kelvin angle
    (19.5 degrees each side; less for a fast boat, whose wake is narrower),
    thin crests of foam fading faster than the trail.
The shading (foam where the strength beats a noise, churned water under it,
the sea through where it fades) is life_hq.wake_mat, from attributes on the
decal: wu along, wv across, wk strength, wt part. Decals are clipped to the
water (the render's sea mask) and sit on the sheet (z 0.12) or the open
'ocean' plane beyond it (z -0.5).
"""
import math
import numpy as np

LIFT = 0.03


def _strip(P, w0, w1, sea, parts, wk, wt, length=None):
    """a strip along the polyline P [(x, y), ...] (from the boat back), half
    width from w0 to w1; appends (V, F, attrs) to parts"""
    P = np.asarray(P, float)
    if len(P) < 2: return
    seg = np.hypot(*np.diff(P, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    Ltot = length or s[-1]
    T = np.gradient(P, axis=0); T /= (np.hypot(T[:, 0], T[:, 1])[:, None] + 1e-9)
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    u = np.clip(s / max(Ltot, 1e-3), 0, 1)
    w = w0 + (w1 - w0) * u ** 0.6
    n = len(P)
    L = P + N * w[:, None]; R = P - N * w[:, None]
    ok = np.array([sea.water(x, y) for x, y in P]) & np.array([sea.water(x, y) for x, y in L]) & np.array([sea.water(x, y) for x, y in R])
    z = np.array([sea.z(x, y) + LIFT for x, y in P])
    V = np.concatenate([np.c_[L, z], np.c_[P, z], np.c_[R, z]])
    i = np.arange(n - 1)
    keep = ok[:-1] & ok[1:]
    i = i[keep]
    if not len(i): return
    F = np.concatenate([np.stack([i, i + 1, n + i + 1, n + i], 1), np.stack([n + i, n + i + 1, 2 * n + i + 1, 2 * n + i], 1)])
    A = dict(wu=np.concatenate([u, u, u]), wv=np.concatenate([np.full(n, 1.0), np.zeros(n), np.full(n, -1.0)]),
             wk=np.full(3 * n, wk), wt=np.full(3 * n, wt))
    parts.append((V, F, A))


def build(bpy, coll, vessels, sea, inb, mat, mesh_attrs):
    parts = []; nw = 0
    for v in vessels:
        if v['kn'] <= 0 or v['wk'] <= 0 or not v['trail']: continue
        tr = v['trail']
        if not any(inb(x, y, 60.0) for x, y in tr[::2] + [(v['x'], v['y'])]): continue
        L, B, kn, wk = v['L'], v['B'], v['kn'], v['wk']
        # the trail: densify to ~3 m, as long as the vessel's trail
        P = np.asarray(tr, float)
        seg = np.hypot(*np.diff(P, axis=0).T); s = np.concatenate([[0.0], np.cumsum(seg)])
        m = max(2, int(s[-1] / 3.0) + 1); S = np.linspace(0, s[-1], m)
        P = np.c_[np.interp(S, s, P[:, 0]), np.interp(S, s, P[:, 1])]
        _strip(P, B * 0.45, B * (1.4 if kn > 15 else 1.9), sea, parts, wk, 0.0)
        # the bow-wave arms, straight from the bow (Kelvin 19.5 deg, a fast boat less)
        ang = math.radians(19.5 if kn < 14 else 19.5 - min(8.0, (kn - 14) * 0.6))
        la = min(s[-1] * 0.55, 18.0 * kn + 20)
        bx, by = v['x'] + math.cos(v['yaw']) * L / 2, v['y'] + math.sin(v['yaw']) * L / 2
        for sd in (-1, 1):
            a = v['yaw'] + math.pi + sd * ang
            k_ = max(2, int(la / 3.0) + 1)
            Q = [(bx + math.cos(a) * la * j / (k_ - 1), by + math.sin(a) * la * j / (k_ - 1)) for j in range(k_)]
            _strip(Q, max(0.4, B * 0.08), max(1.2, B * 0.35), sea, parts, wk * 0.8, 1.0)
        nw += 1
    if not parts: return 0
    V = []; F = []; A = {k: [] for k in ('wu', 'wv', 'wk', 'wt')}; off = 0
    for v_, f_, a_ in parts:
        V.append(v_); F.append(f_ + off); off += len(v_)
        for k in A: A[k].append(a_[k])
    mesh_attrs(bpy, 'life.wakes', np.concatenate(V), np.concatenate(F), {k: np.concatenate(a) for k, a in A.items()}, mat, coll)
    return nw
