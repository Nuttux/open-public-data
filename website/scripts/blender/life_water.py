"""Where the boats are, at about 5 pm on a weekday in late September (life_hq.py
builds them). Pure Python: every placement is a function of the whole bay, not
of the region built, so every frame of the pyramid agrees where a boat lies.

A vessel is a dict: k (proto key), b (builder in life_boats), a (its
arguments), x, y, yaw (radians, from +x, counter-clockwise; the bow's
direction), kn (speed in knots, 0 = still), L, B, wk (wake strength) and
trail (the water it came through, [(x, y), ...] from the stern back).

THE FERRIES ride their OpenStreetMap routes (route=ferry, ODbL, (c)
OpenStreetMap contributors), a boat per route at a plausible point of the
evening peak (FERRY_PLAN): the Golden Gate Ferry boats to Larkspur and
Sausalito, San Francisco Bay Ferry's to Vallejo, Richmond, Oakland, Alameda
and Harbor Bay, the Alcatraz boats from Pier 33, Blue & Gold from Pier 41, the
Treasure Island ferry; some at their slips (bow in, no wake).
THE MARINAS: a boat alongside the fingers of every dock (landmarks/piers.json,
the landmarks agent's OSM docks), 85 % of the berths taken on a weekday.
SAILBOATS on the Cityfront, off the Marina and Aquatic Park and off South
Beach, on every point of sail to a westerly (late-September sea breeze, from
265 degrees), heeled and trimmed for it.
SHIPS: a container ship bound for the Bay Bridge's west span (the Oakland
channel), with a tug; a car carrier at anchor off Hunters Point; a tug and a
sand barge off the Islais Creek aggregate piers. Kayaks and paddleboards in
McCovey Cove and Aquatic Park, a rowing gig. All of this is a convention (a
plausible moment), never a record of one.
"""
import json, math, os, random
import numpy as np

KN = 0.514444
WIND_FROM = math.radians(265.0)            # compass bearing the wind blows from

# ── the water ────────────────────────────────────────────────────────────────
class Sea:
    """the render's sea mask (life_prep.sea_4m.npy): metres to the shore, 0 on
    land; outside the mask's sheet the render's 'ocean' plane (z -0.5)"""
    Z_SHEET, Z_OCEAN = 0.12, -0.5

    def __init__(self, S, path):
        self.ox, self.oy, self.res, self.nx, self.ny = S['ox'], S['oy'], S['res'], S['nx'], S['ny']
        self.D = np.load(path)

    def dist(self, x, y):
        """metres to the shore (0 = land, 255 = far); -1 outside the sheet"""
        j = int((x - self.ox) / self.res); i = int((y - self.oy) / self.res)
        if 0 <= i < self.ny and 0 <= j < self.nx: return int(self.D[i, j])
        return -1

    def water(self, x, y, clear=0.0):
        d = self.dist(x, y)
        return d < 0 or d > clear

    def z(self, x, y):
        d = self.dist(x, y)
        return self.Z_OCEAN if d < 0 else self.Z_SHEET


def resample(pts, step=2.0):
    P = np.asarray(pts, float)
    seg = np.hypot(*np.diff(P, axis=0).T); keep = np.concatenate([[True], seg > 1e-3]); P = P[keep]
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    n = max(2, int(math.ceil(s[-1] / step)) + 1); S = np.linspace(0, s[-1], n)
    return np.interp(S, s, P[:, 0]), np.interp(S, s, P[:, 1]), S


def _at(R, s):
    X, Y, S = R
    s = float(np.clip(s, 0, S[-1]))
    x, y = float(np.interp(s, S, X)), float(np.interp(s, S, Y))
    a, b = max(0.0, s - 4), min(S[-1], s + 4)
    tx, ty = np.interp(b, S, X) - np.interp(a, S, X), np.interp(b, S, Y) - np.interp(a, S, Y)
    return x, y, math.atan2(ty, tx)


def _back(R, s, direction, length, step=6.0):
    """the path behind a boat at s moving `direction` (+1: +s): from s back"""
    X, Y, S = R
    out = []
    for k in range(int(length / step) + 1):
        q = s - direction * k * step
        if q < 0 or q > S[-1]: break
        out.append((float(np.interp(q, S, X)), float(np.interp(q, S, Y))))
    return out


def _straight_back(x, y, yaw, length, step=6.0):
    return [(x - math.cos(yaw) * k * step, y - math.sin(yaw) * k * step) for k in range(int(length / step) + 1)]


# ── ferries ──────────────────────────────────────────────────────────────────
# builder args per vessel class: (builder, kwargs, L, B, knots)
VESSEL = {
    'weta': ('ferry_cat', dict(op='weta', L=42.0, B=10.6), 42.0, 10.6, 28.0),
    'weta_big': ('ferry_cat', dict(op='weta', L=45.0, B=11.0), 45.0, 11.0, 30.0),
    'ggf_cat': ('ferry_cat', dict(op='ggf', L=41.0, B=11.0), 41.0, 11.0, 25.0),
    'ggf_mono': ('ferry_mono', dict(op='ggf', L=50.0, B=10.8), 50.0, 10.8, 17.0),
    'bg': ('small_ferry', dict(op='bg', L=34.0, B=9.4), 34.0, 9.4, 18.0),
    'alc': ('small_ferry', dict(op='alc', L=30.0, B=9.0), 30.0, 9.0, 13.0),
    'ti': ('small_ferry', dict(op='ti', L=24.0, B=8.0), 24.0, 8.0, 18.0),
    'rw': ('small_ferry', dict(op='rw', L=36.0, B=10.0), 36.0, 10.0, 12.0),
}
# (OSM way, which end is San Francisco's, [(metres from that end, 'out' | 'in' | 'dock' | 'dock_far', class)])
FERRY_PLAN = [
    (31772645, 'end', [(0, 'dock', 'ggf_mono'), (3900, 'in', 'ggf_cat')]),          # Larkspur
    (98771919, 'end', [(2400, 'out', 'ggf_mono')]),                                 # Sausalito (Golden Gate Ferry)
    (98759331, 'end', [(5600, 'out', 'ggf_cat')]),                                  # Tiburon
    (177121377, 'end', [(1500, 'out', 'weta_big')]),                                # Vallejo
    (661726811, 'start', [(6400, 'in', 'weta')]),                                   # Richmond
    (662437191, 'start', [(2700, 'out', 'weta')]),                                  # Alameda Main Street
    (662437195, 'start', [(0, 'dock', 'weta')]),                                    # Oakland (loading)
    (662437193, 'start', [(4200, 'in', 'weta')]),                                   # Harbor Bay
    (960868684, 'end', [(0, 'dock', 'weta')]),                                      # Alameda Seaplane (loading)
    (1036802523, 'start', [(1500, 'out', 'ti')]),                                   # Treasure Island
    (27989500, 'start', [(0, 'dock', 'alc'), (1300, 'in', 'alc'), (0, 'dock_far', 'alc')]),   # Alcatraz
    (24354980, 'end', [(2100, 'out', 'bg')]),                                       # Blue & Gold, Pier 41 - Sausalito
    (662437189, 'end', [(0, 'dock', 'weta')]),                                      # Pier 41 (the short hop)
    (98752555, 'end', [(3200, 'in', 'ggf_cat')]),                                   # Angel Island (Golden Gate Ferry)
    (24354980, 'end', [(4600, 'in', 'bg')]),                                        # Blue & Gold back from Sausalito
    (662437189, 'start', [(1700, 'out', 'weta')]),                                  # the Ferry Building - Pier 41 hop, under way
]
# the Red & White Fleet's Golden Gate Bay Cruise from Pier 43 1/2: out along the
# Cityfront, under the bridge, back by Alcatraz (a loop of waypoints, engine m;
# no OSM route); one boat outbound, one coming home
RW_LOOP = [(2010, 5500), (1750, 5900), (900, 6150), (0, 6250), (-1800, 6450), (-3300, 6650), (-3500, 6950),
           (-2600, 7150), (-800, 7250), (600, 7200), (1300, 6900), (1900, 6300), (2010, 5560)]
RW_AT = [(2600, 'rw'), (9300, 'rw')]


def ferries(D, sea, placed):
    by = {f['id']: f for f in D['ferries']}
    out = []
    R = resample(RW_LOOP, 2.0)
    for s_, cls in RW_AT:
        b, a, L, B, kn = VESSEL[cls]
        x, y, yaw = _at(R, s_)
        if not all(math.hypot(x - px, y - py) > r + L / 2 + 40 for px, py, r in placed): continue
        out.append(dict(k=f'{b}|{cls}', b=b, a=a, x=x, y=y, yaw=yaw, kn=kn, L=L, B=B, wk=0.9,
                        trail=_back(R, s_ - L / 2, 1, 16.0 * kn + 60), cls='ferry'))
        placed.append((x, y, L / 2 + 30))
    for wid, sf_end, plan in FERRY_PLAN:
        f = by.get(wid)
        if f is None: continue
        pts = f['pts'] if sf_end == 'start' else f['pts'][::-1]      # s runs from San Francisco out
        R = resample(pts, 2.0); Lr = R[2][-1]
        for dist, mode, cls in plan:
            b, a, L, B, kn = VESSEL[cls]
            if mode in ('dock', 'dock_far'):
                s = L / 2 + 4.0 if mode == 'dock' else Lr - L / 2 - 4.0
                x, y, yaw = _at(R, s)
                if mode == 'dock': yaw += math.pi              # bow in, toward the slip
                out.append(dict(k=f'{b}|{cls}', b=b, a=a, x=x, y=y, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='ferry'))
                placed.append((x, y, L / 2 + 10))
                continue
            direction = 1 if mode == 'out' else -1
            s = min(dist, Lr - L)
            for tries in range(6):
                x, y, yaw = _at(R, s)
                if all(math.hypot(x - px, y - py) > r + L / 2 + 40 for px, py, r in placed) and sea.water(x, y, 20): break
                s += 180.0 * direction
            if direction < 0: yaw += math.pi
            trail_len = 16.0 * kn + 60
            stern = s - direction * L / 2
            out.append(dict(k=f'{b}|{cls}', b=b, a=a, x=x, y=y, yaw=yaw, kn=kn, L=L, B=B, wk=1.0,
                            trail=_back(R, stern, direction, trail_len), cls='ferry'))
            placed.append((x, y, L / 2 + 30))
    return out


# ── marinas: a boat alongside the fingers ────────────────────────────────────
REJ = {'land': 0, 'dock': 0, 'boat': 0}
PIERS_JSON = '/Users/daniel/code/qipu-render-work/landmarks/piers.json'
# boxes (x0, y0, x1, y1) whose docks hold the commercial fishing fleet:
# Hyde Street Harbor and the Fish Alley basins behind Pier 45
FISHING = [(1780, 5380, 1960, 5500)]
FISHING_MARINAS = ('Hyde Street Harbor',)


def _seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy
    t = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L2))
    return math.hypot(px - ax - t * vx, py - ay - t * vy)


def _inside(x, y, r):
    ins = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: ins = not ins
    return ins


def berths(sea, placed, marinas=()):
    """boats in the marinas' slips: only docks inside an OSM marina (leisure=
    marina: the Marina's two harbours, Pier 39, Hyde Street Harbor, South
    Beach, Treasure Island, Travis Marina...) or the Wharf's fishing basins —
    the fingers and gangways between the Embarcadero's piers hold no fleet"""
    if not os.path.exists(PIERS_JSON): return []
    rings = []
    for m in marinas:
        if 'Lake' in m['name']: continue
        r = m['ring']; xs = [p[0] for p in r]; ys = [p[1] for p in r]
        rings.append((min(xs) - 15, min(ys) - 15, max(xs) + 15, max(ys) + 15, r, m['name'] in FISHING_MARINAS))
    def in_marina(x, y):
        """None outside the marinas, else True for a fishing harbour"""
        if any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in FISHING): return True
        for x0, y0, x1, y1, r, fish in rings:
            if x0 <= x <= x1 and y0 <= y <= y1 and (_inside(x, y, r) or min(_seg_dist(x, y, *r[i], *r[i + 1]) for i in range(len(r) - 1)) < 15): return fish
        return None
    P = json.load(open(PIERS_JSON))['piers']
    segs = []                                   # (ax, ay, bx, by, half width)
    for p in P:
        pts = p.get('line') or p.get('ring')
        if not pts: continue
        if p.get('ring'): pts = list(pts) + [pts[0]]
        hw = (p.get('width') or 3.0) / 2 if p.get('line') else 0.0
        if p.get('line') and len(pts) <= 3 and math.hypot(pts[-1][0] - pts[0][0], pts[-1][1] - pts[0][1]) <= 40.0: hw = min(hw, 0.5)   # a finger
        elif p.get('line'): hw = min(hw, 1.5)                                                                                      # a walkway
        for a, b in zip(pts, pts[1:]): segs.append((a[0], a[1], b[0], b[1], hw, p['id']))
    grid = {}
    for k, s in enumerate(segs):
        for gx in range(int(min(s[0], s[2]) // 20) - 1, int(max(s[0], s[2]) // 20) + 2):
            for gy in range(int(min(s[1], s[3]) // 20) - 1, int(max(s[1], s[3]) // 20) + 2):
                grid.setdefault((gx, gy), []).append(k)
    def near_dock(x, y, clear):
        for k in grid.get((int(x // 20), int(y // 20)), ()):
            ax, ay, bx, by, hw, _ = segs[k]
            if _seg_dist(x, y, ax, ay, bx, by) < hw + clear: return True
        return False
    boats = []; bgrid = {}
    def overlaps(fp):
        for x, y in fp:
            for a in (-1, 0, 1):
                for b in (-1, 0, 1):
                    for q in bgrid.get((int(x // 10) + a, int(y // 10) + b), ()):
                        if math.hypot(x - q[0], y - q[1]) < q[2]: return True
        return False
    # the fingers: two-point docks 5-26 m long, one end on another dock (the
    # walkway), the other free. A boat lies in each slip, between two fingers.
    fingers = []
    for p in P:
        pts = p.get('line')
        if not pts or len(pts) not in (2, 3) or p['kind'] not in ('line', 'float_line'): continue
        (ax, ay), (bx, by) = pts[0], pts[-1]; Lf = math.hypot(bx - ax, by - ay)
        if not 5.0 <= Lf <= 40.0: continue
        if len(pts) == 3 and _seg_dist(pts[1][0], pts[1][1], ax, ay, bx, by) > 0.6: continue       # not straight
        def on_other(x, y, me=p['id']):
            for k in grid.get((int(x // 20), int(y // 20)), ()):
                s_ = segs[k]
                if s_[5] == me: continue
                if _seg_dist(x, y, s_[0], s_[1], s_[2], s_[3]) < s_[4] + 1.5: return True
            return False
        ea, eb = on_other(ax, ay), on_other(bx, by)
        if ea and eb: continue                           # a link between two walkways
        if not ea and not eb:
            # a finger across its walkway, both sides in one line: split where it crosses
            t_ = next((t for t in (0.5, 0.4, 0.6, 0.3, 0.7) if on_other(ax + (bx - ax) * t, ay + (by - ay) * t)), None)
            if t_ is None: continue
            mx, my = ax + (bx - ax) * t_, ay + (by - ay) * t_
            for ex, ey in ((ax, ay), (bx, by)):
                l_ = math.hypot(ex - mx, ey - my)
                if l_ >= 4.0: fingers.append((f"{p['id']}{int(ex == ax)}", mx, my, (ex - mx) / l_, (ey - my) / l_, l_))
            continue
        if Lf > 45.0: continue
        if eb: ax, ay, bx, by = bx, by, ax, ay           # a = the walkway end
        fingers.append((p['id'], ax, ay, (bx - ax) / Lf, (by - ay) / Lf, Lf))
    fgrid = {}
    for i, f in enumerate(fingers): fgrid.setdefault((int(f[1] // 15), int(f[2] // 15)), []).append(i)
    # a real finger float is about a metre wide (the drawn docks may be wider: the
    # clearance to a dock is taken from the finger's axis, not its drawn width)
    FW = 0.5
    out = []; REJ['fingers'] = len(fingers)
    for fid, ax, ay, ux, uy, Lf in fingers:
        fish = in_marina(ax, ay)
        if fish is None: continue
        nx, ny = -uy, ux
        # the neighbouring fingers, parallel, on each side: the slip between
        gaps = {-1: None, 1: None}
        for gx in (-1, 0, 1):
            for gy in (-1, 0, 1):
                for j in fgrid.get((int(ax // 15) + gx, int(ay // 15) + gy), ()):
                    g = fingers[j]
                    if g[0] == fid or g[3] * ux + g[4] * uy < 0.9: continue
                    lat = (g[1] - ax) * nx + (g[2] - ay) * ny; lon = (g[1] - ax) * ux + (g[2] - ay) * uy
                    if abs(lon) > 4.0 or not 2.5 < abs(lat) < 12.0: continue
                    sd = 1 if lat > 0 else -1
                    if gaps[sd] is None or abs(lat) < gaps[sd]: gaps[sd] = abs(lat)
        rr = random.Random(int(fid) * 7 + 3)                # a split finger's id carries its side
        if Lf > 26.0:
            # a long finger (the West Harbor's angled ones): boats side-tied along it, in a row
            for side in (-1, 1):
                t = 2.5
                while True:
                    L = rr.uniform(8.5, 13.5); B = L * 0.33
                    if t + L > Lf: break
                    if rr.random() < 0.85:
                        off = FW + 0.35 + B / 2
                        cx, cy = ax + ux * (t + L / 2) + nx * side * off, ay + uy * (t + L / 2) + ny * side * off
                        yaw = math.atan2(uy, ux) + (math.pi if rr.random() < 0.5 else 0.0)
                        fp = [(cx + ux * q * L / 2 + nx * v * B / 2, cy + uy * q * L / 2 + ny * v * B / 2) for q in (-0.95, -0.5, 0, 0.5, 0.95) for v in (-0.9, 0, 0.9)]
                        if all(sea.water(x, y) for x, y in fp) and not any(near_dock(x, y, 0.2) for x, y in fp) and not overlaps(fp):
                            for x, y in fp[::3]: bgrid.setdefault((int(x // 10), int(y // 10)), []).append((x, y, B * 0.85))
                            seed = rr.randrange(1 << 30)
                            if rr.random() < 0.72:
                                out.append(dict(k=f'sail|m|{round(L)}|{seed % 31}', b='sailboat', a=dict(L=round(L), seed=seed % 31), x=cx, y=cy, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='moored'))
                            else:
                                out.append(dict(k=f'motor|{round(L)}|{seed % 17}', b='motorboat', a=dict(L=round(L), seed=seed % 17), x=cx, y=cy, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='moored'))
                    t += L + rr.uniform(1.0, 2.5)
            continue
        for side in (-1, 1):
            if rr.random() > 0.85: continue
            gap = gaps[side]
            room = (gap - 2 * FW - 0.5) if gap else 5.0            # the slip's width for a beam
            L = float(np.clip(Lf * rr.uniform(0.9, 1.25), 7.0, 17.0))
            if fish: kind = 'fishing'; L = float(np.clip(L, 10.0, 17.0)); B = L * 0.31
            else:
                kind = 'sail' if rr.random() < 0.72 else 'motor'; B = L * (0.33 if kind == 'sail' else 0.34)
            if B > room:
                B = room; L = B / 0.33
                if L < 6.5: continue
            off = gap / 2 if gap else FW + 0.3 + B / 2
            cx, cy = ax + ux * (L / 2 + 2.0) + nx * side * off, ay + uy * (L / 2 + 2.0) + ny * side * off
            yaw = math.atan2(uy, ux) + (math.pi if rr.random() < 0.8 else 0.0)     # most bow in
            fp = [(cx + ux * t * L / 2 + nx * v * B / 2, cy + uy * t * L / 2 + ny * v * B / 2) for t in (-0.95, -0.5, 0, 0.5, 0.95) for v in (-0.9, 0, 0.9)]
            if any(not sea.water(x, y) for x, y in fp): REJ['land'] += 1; continue
            if any(near_dock(x, y, 0.2) for x, y in fp): REJ['dock'] += 1; continue
            if overlaps(fp): REJ['boat'] += 1; continue
            for x, y in fp[::3]: bgrid.setdefault((int(x // 10), int(y // 10)), []).append((x, y, B * 0.85))
            seed = rr.randrange(1 << 30)
            if kind == 'fishing':
                out.append(dict(k=f'fishing|{seed % 23}', b='fishing', a=dict(L=round(L, 1), B=round(B, 1), seed=seed % 23,
                                col=rr.choice(('#e8e6e0', '#e8e6e0', '#2a4a6a', '#3a5a3a', '#8a2a24')), trim=rr.choice(('#2a4a7a', '#8a2a24', '#2a5a3a'))),
                                x=cx, y=cy, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='moored'))
            elif kind == 'sail':
                out.append(dict(k=f'sail|m|{round(L)}|{seed % 31}', b='sailboat', a=dict(L=round(L), seed=seed % 31), x=cx, y=cy, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='moored'))
            else:
                out.append(dict(k=f'motor|{round(L)}|{seed % 17}', b='motorboat', a=dict(L=round(L), seed=seed % 17), x=cx, y=cy, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='moored'))
    # the fishing harbours: boats side-tied along the walkways, some rafted
    for p in P:
        pts = p.get('line')
        if not pts or p['kind'] not in ('line', 'float_line') or len(pts) < 2: continue
        Lp = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
        if Lp < 15.0 or not in_marina(*pts[len(pts) // 2]): continue
        rr = random.Random(int(p['id']) * 11 + 5)
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            Ls = math.hypot(bx - ax, by - ay)
            if Ls < 10.0: continue
            ux, uy = (bx - ax) / Ls, (by - ay) / Ls; nx, ny = -uy, ux
            for side in (-1, 1):
                t = rr.uniform(1.0, 4.0)
                while t < Ls - 6.0:
                    L = rr.uniform(11.0, 17.0); B = L * 0.31
                    if t + L > Ls: break
                    if rr.random() < 0.8:
                        off = 1.5 + 0.4 + B / 2
                        cx, cy = ax + ux * (t + L / 2) + nx * side * off, ay + uy * (t + L / 2) + ny * side * off
                        yaw = math.atan2(uy, ux) + (math.pi if rr.random() < 0.5 else 0.0)
                        fp = [(cx + ux * q * L / 2 + nx * v * B / 2, cy + uy * q * L / 2 + ny * v * B / 2) for q in (-0.95, -0.5, 0, 0.5, 0.95) for v in (-0.9, 0, 0.9)]
                        if all(sea.water(x, y) for x, y in fp) and not any(near_dock(x, y, 0.2) for x, y in fp) and not overlaps(fp):
                            for x, y in fp[::3]: bgrid.setdefault((int(x // 10), int(y // 10)), []).append((x, y, B * 0.85))
                            sd_ = rr.randrange(23)
                            out.append(dict(k=f'fishing|{sd_}', b='fishing', a=dict(L=round(L, 1), B=round(B, 1), seed=sd_,
                                            col=rr.choice(('#e8e6e0', '#e8e6e0', '#2a4a6a', '#3a5a3a', '#8a2a24')), trim=rr.choice(('#2a4a7a', '#8a2a24', '#2a5a3a'))),
                                            x=cx, y=cy, yaw=yaw, kn=0.0, L=L, B=B, wk=0.0, trail=[], cls='moored'))
                    t += L + rr.uniform(1.0, 3.0)
    return out


# ── sailing ──────────────────────────────────────────────────────────────────
# (x0, y0, x1, y1, boats): the Cityfront and off the Marina / Crissy Field, the
# water off Aquatic Park and Pier 39, off South Beach, Clipper Cove
SAIL_ZONES = [(-2600, 5250, 900, 6900, 20), (900, 5500, 3300, 6900, 14), (3300, 4400, 5200, 6000, 7), (4300, 1500, 5900, 3300, 5),
              (5300, 5400, 6300, 6300, 2)]


def _sail_trim(bearing, rr):
    """(boom, jib, spinnaker, heel, knots) for a boat heading `bearing`
    (radians, compass) to the westerly; None in the no-go zone. Angles are in
    the boat's frame, + = to port: the sails and the heel go to leeward"""
    rel = (WIND_FROM - bearing + math.pi) % (2 * math.pi) - math.pi    # > 0: the wind comes over the starboard side
    a = abs(rel)
    if a < math.radians(40): return None
    sgn = 1.0 if rel > 0 else -1.0                                        # leeward: port if the wind is on the starboard side
    if a < math.radians(60): boom, jib, heel, kn, sp = 0.12, 0.10, 0.36, 6.0, False
    elif a < math.radians(110): boom, jib, heel, kn, sp = 0.55, 0.35, 0.24, 7.0, False
    elif a < math.radians(150): boom, jib, heel, kn, sp = 0.95, 0.70, 0.12, 6.5, rr.random() < 0.35
    else: boom, jib, heel, kn, sp = 1.35, -1.1, 0.05, 5.5, rr.random() < 0.5
    return sgn * boom, sgn * jib, sp, sgn * heel, kn


def sailing(sea, placed, trails):
    out = []
    for zi, (x0, y0, x1, y1, n) in enumerate(SAIL_ZONES):
        rr = random.Random(9000 + zi); got = 0; tries = 0
        while got < n and tries < 400:
            tries += 1
            x, y = rr.uniform(x0, x1), rr.uniform(y0, y1)
            d = sea.dist(x, y)
            if 0 <= d < 90: continue
            if any(math.hypot(x - px, y - py) < r + 45 for px, py, r in placed): continue
            if any(math.hypot(x - tx, y - ty) < 30 for tr in trails for tx, ty in tr[::2]): continue
            bearing = rr.uniform(0, 2 * math.pi); t = _sail_trim(bearing, rr)
            if t is None: continue
            boom, jib, sp, heel, kn = t
            L = rr.choice((8.5, 9.5, 10.5, 11.5, 12.5, 14.0))
            yaw = math.pi / 2 - bearing
            seed = rr.randrange(1 << 20)
            a = dict(L=L, seed=seed % 31, sails=(round(boom, 2), round(jib, 2), sp), heel=round(heel, 3))
            out.append(dict(k=f'sail|{L}|{seed}', b='sailboat', a=a, x=x, y=y, yaw=yaw, kn=kn, L=L, B=L * 0.33, wk=0.35,
                            trail=_straight_back(x - math.cos(yaw) * L / 2, y - math.sin(yaw) * L / 2, yaw, 45.0, 3.0), cls='sail'))
            placed.append((x, y, L)); got += 1
    return out


# ── ships, tugs, a barge ─────────────────────────────────────────────────────
def ships(sea, placed):
    out = []
    def add(b, a, x, y, bearing, kn, L, B, wk, k, trail=None, cls='ship'):
        yaw = math.pi / 2 - math.radians(bearing)
        if trail is None and kn > 0: trail = _straight_back(x - math.cos(yaw) * L / 2, y - math.sin(yaw) * L / 2, yaw, 14.0 * kn + 80, 8.0)
        out.append(dict(k=k, b=b, a=a, x=x, y=y, yaw=yaw, kn=kn, L=L, B=B, wk=wk, trail=trail or [], cls=cls))
        placed.append((x, y, L / 2 + 20))
    # a container ship coming down from Alcatraz to the Bay Bridge's west span
    # (the Delta-Echo span by Yerba Buena Island, the Oakland channel), a tug on its quarter
    cx, cy, cb = 4950.0, 5650.0, 152.0
    add('container_ship', dict(L=300.0, B=48.0, seed=4), cx, cy, cb, 9.0, 300.0, 48.0, 0.8, 'container|4')
    yw = math.pi / 2 - math.radians(cb)
    tx, ty = cx - math.cos(yw) * 110 + math.cos(yw + math.pi / 2) * 42, cy - math.sin(yw) * 110 + math.sin(yw + math.pi / 2) * 42
    add('tug', dict(col='#1e1f22', trim='#b0302a'), tx, ty, cb - 4, 9.0, 30.0, 11.0, 0.6, 'tug|a')
    # a car carrier at anchor off Hunters Point, swung to the westerly
    add('car_carrier', dict(col='#e6e4de', band='#1d3a6b'), 7350.0, -2750.0, 262.0, 0.0, 200.0, 32.0, 0.0, 'carcarrier|a')
    # a bulk carrier at anchor further out
    add('bulk_carrier', dict(), 7600.0, -4700.0, 255.0, 0.0, 190.0, 32.0, 0.0, 'bulk|a')
    # a tug running back up the Cityfront
    add('tug', dict(col='#2a3a5a', trim='#e8e6e0', house='#e8e6e0'), 3300.0, 5200.0, 300.0, 10.0, 30.0, 11.0, 0.6, 'tug|b')
    # a tug pushing a sand barge toward the Islais Creek aggregate piers
    add('barge', dict(L=70.0, B=18.0), 6250.0, -700.0, 230.0, 6.0, 70.0, 18.0, 0.5, 'barge|a')
    yb = math.pi / 2 - math.radians(230.0)
    add('tug', dict(col='#1e1f22', trim='#d8a02a'), 6250.0 - math.cos(yb) * 50, -700.0 - math.sin(yb) * 50, 230.0, 6.0, 24.0, 9.0, 0.0, 'tug|c', trail=[])
    # fishing boats coming in to the Wharf
    add('fishing', dict(L=15.0, B=4.6, seed=5, col='#e8e6e0', trim='#2a4a7a'), 2250.0, 6150.0, 185.0, 8.0, 15.0, 4.6, 0.45, 'fishing|mv5', cls='fishing')
    add('fishing', dict(L=13.0, B=4.2, seed=9, col='#3a5a3a', trim='#e8e6e0'), 600.0, 6450.0, 120.0, 8.0, 13.0, 4.2, 0.45, 'fishing|mv9', cls='fishing')
    return [v for v in out if sea.water(v['x'], v['y'], 5)]


# ── small craft ──────────────────────────────────────────────────────────────
# (cx, cy, radius, n, kinds)
PADDLE = [(4440.0, 1960.0, 90.0, 6, ('kayak', 'kayak', 'sup')), (1330.0, 5300.0, 120.0, 5, ('kayak', 'sup', 'gig'))]


def paddlers(sea, placed):
    out = []
    for zi, (cx, cy, rad, n, kinds) in enumerate(PADDLE):
        rr = random.Random(700 + zi); got = 0
        for _ in range(300):
            if got >= n: break
            a, r = rr.uniform(0, 2 * math.pi), rad * math.sqrt(rr.random())
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            if not sea.water(x, y, 10): continue
            if any(math.hypot(x - px, y - py) < pr + 8 for px, py, pr in placed): continue
            kind = rr.choice(kinds); seed = rr.randrange(1000); yaw = rr.uniform(0, 2 * math.pi)
            if kind == 'gig':
                v = dict(k='gig', b='rowing_gig', a=dict(seed=0), L=8.0, B=1.3)
            else:
                v = dict(k=f'{kind}|{seed % 9}', b='kayak', a=dict(seed=seed % 9, sup=kind == 'sup'), L=4.5 if kind == 'kayak' else 3.3, B=0.7)
            v.update(x=x, y=y, yaw=yaw, kn=2.0, wk=0.18, trail=_straight_back(x - math.cos(yaw) * v['L'] / 2, y - math.sin(yaw) * v['L'] / 2, yaw, 10.0, 1.0), cls='paddle')
            out.append(v); placed.append((x, y, v['L'])); got += 1
    return out


# kiteboarders and windsurfers off Crissy Field in the afternoon westerly
KITE_ZONE = (-2500.0, 5350.0, -1300.0, 6000.0, 5, 2)


def kites(sea, placed):
    x0, y0, x1, y1, nk, nw = KITE_ZONE
    rr = random.Random(4242); out = []; got = 0
    for _ in range(400):
        if got >= nk + nw: break
        x, y = rr.uniform(x0, x1), rr.uniform(y0, y1)
        d = sea.dist(x, y)
        if 0 <= d < 60: continue
        if any(math.hypot(x - px, y - py) < pr + 40 for px, py, pr in placed): continue
        # reaching across the westerly, north or south, the kite downwind (east-north-east)
        bearing = rr.choice((10.0, 170.0, 190.0, 350.0)) + rr.uniform(-15, 15)
        if got < nk:
            yaw = math.pi / 2 - (WIND_FROM + math.pi)          # the kite's frame: +x downwind
            sd = rr.randrange(7)
            v = dict(k=f'kite|{sd}', b='kiteboard', a=dict(seed=sd), L=2.0, B=0.5, kn=18.0, wk=0.3, cls='kite')
            hy = math.pi / 2 - math.radians(bearing)
            v['trail'] = _straight_back(x, y, hy, 25.0, 1.5)
        else:
            yaw = math.pi / 2 - math.radians(bearing); sd = rr.randrange(5)
            v = dict(k=f'wind|{sd}', b='windsurfer', a=dict(seed=sd), L=2.6, B=0.7, kn=14.0, wk=0.3, cls='kite',
                     trail=_straight_back(x - math.cos(yaw) * 1.3, y - math.sin(yaw) * 1.3, yaw, 25.0, 1.5))
        v.update(x=x, y=y, yaw=yaw)
        out.append(v); placed.append((x, y, 25.0)); got += 1
    return out


def _docks_drawn():
    """the berths only where the docks are drawn: the landmarks agent's
    water_hq.piers (key 'piers', in landmarks_hq.WATER_ENABLED, or LM_KEYS /
    LM_ALL for its tests); without them ~1,000 boats float in grids on open
    water. LIFE_BERTHS=1 / 0 forces it either way."""
    f = os.environ.get('LIFE_BERTHS')
    if f in ('0', '1'): return f == '1'
    if os.environ.get('LANDMARKS', '1') != '1': return False
    try:
        import landmarks_hq as LH
        return os.environ.get('LM_ALL') == '1' or 'piers' in (set(LH.WATER_ENABLED) | LH._extra())
    except Exception:
        return False


def plan(D, sea):
    """every vessel on the bay"""
    placed = []
    V = ships(sea, placed)
    V += ferries(D, sea, placed)
    if _docks_drawn(): V += berths(sea, placed, D.get('marinas', ()))
    trails = [v['trail'] for v in V if v['trail']]
    V += sailing(sea, placed, trails)
    V += paddlers(sea, placed)
    if os.environ.get('LIFE_KITES', '0') == '1': V += kites(sea, placed)      # under test
    return V
