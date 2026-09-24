"""THE CITY'S TREES BY SPECIES (the vegetation agent). hq_city.py's tree
instancer asks this module which proto (kind) and how wide a crown each tree
gets; everything else there (open_foot, the HMAX caps, the era gates, the
place-hashed draws) stays hq_city's.

  Kinds(bpy, load_collection, log, box)   builds the protos: veg_protos' kit
      (eucalyptus, Monterey cypress and pine, the broadleaf street kinds,
      palms) plus the Poly Haven trees kept for what they are (jacaranda,
      firs for the redwoods, the small tree for ornamentals); exposes
      protos / widths / heights / tall / hmax in hq_city's shapes
  .street(ox, oy, x, y, park, crown, on_street, roofed) -> (kind, crown, x, y)
      a register tree: its species from the DataSF Street Tree List (nearest
      listed tree within 2.3 m of the engine's point ox, oy), its crown from
      its DBH, its trunk moved out of the carriageway (the list's median
      trees excepted); None = stump, empty planting site, or no open ground
  .mass(x, y, crown, on_street, roofed) -> (kind, crown, x, y)
      a measured canopy mass: its species from the zone it stands in
      (veg_zones.json: the Presidio, Golden Gate Park, Sutro, … each with its
      published mix, planted in single-species stands) and the OSM tree
      nodes near it; in the forests, its species' stand height

Every draw is by place (hp, the same hash as hq_city's), so two frames that
both build a tree give it the same species. Data: veg.npz, veg_zones.json in
qipu-render-work/veg (veg_prep.py). Sources: veg/README.md.
"""
import os, json, math
import numpy as np

VEG = '/Users/daniel/code/qipu-render-work/veg'

def hp(x, y, salt):
    h = (int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 0x5bd1e995 & 0xffffffff
    return ((h ^ (h >> 15)) & 0xffffff) / float(0x1000000)

# archetype -> protos (veg_protos kit names; 'ph:<asset>' = every tree of a Poly Haven asset)
PROTO_OF = {
    'plane': ['plane_a', 'plane_b'], 'round': ['round_a', 'round_b'], 'pohu': ['pohu'],
    'euc': ['euc_a', 'euc_b', 'euc_c'], 'column': ['column'], 'cherry': ['cherry'], 'plum': ['plum'], 'olive': ['olive'],
    'ornamental': ['ph:tree_small_02', 'cherry', 'round_b'], 'pine': ['pine_a', 'pine_b'], 'cypress': ['cyp_a', 'cyp_b'],
    'redwood': ['ph:fir_tree_01'], 'jacaranda': ['ph:jacaranda_tree'],
    'date_palm': ['phoenix'], 'fan_palm': ['washy'], 'queen_palm': ['queen'], 'small_palm': ['fanpalm'],
}
# the Poly Haven protos' (TALL, HMAX), as hq_city had them for street and park trees
PH_SIZE = {'tree_small_02': (1.4, 9.0), 'jacaranda_tree': (1.4, 15.0), 'fir_tree_01': (2.6, 30.0)}
PALMS = ('date_palm', 'fan_palm', 'queen_palm', 'small_palm')
# A FOREST IS TALL. A canopy mass's crown is 3x its fine-band disc (hq_city),
# which sizes a backyard tree well but left Sutro's blue gums 12 m tall and
# its forest a savanna (24/09): in the forest zones a tree takes its species'
# stand height (m, drawn by place) and its crown follows the proto's proportions
# (crowns then interlock, as a closed canopy does). HMAX still caps it.
FOREST_H = {'euc': (22.0, 32.0), 'cypress': (14.0, 21.0), 'pine': (16.0, 23.0), 'redwood': (20.0, 28.0),
            'round': (9.0, 14.0), 'plane': (10.0, 15.0)}
OPEN_ZONES = ('urban', 'coast_band', 'park', 'garden', 'square')
SITE_MEDIAN = 2
CONIFERS = ('pine', 'cypress', 'redwood')
# crown width (m) from the listed DBH (in): a + b·DBH, at most c. Street trees
# in SF: DBH median 7 in (a young 3 in tree ~3 m across, a 24 in plane ~12 m)
CROWN_DBH = {'plane': (2.0, 0.42, 18), 'round': (2.0, 0.36, 15), 'pohu': (2.2, 0.40, 14), 'euc': (2.0, 0.30, 16),
             'column': (1.2, 0.14, 6), 'cherry': (1.8, 0.30, 8), 'plum': (1.8, 0.30, 8), 'olive': (1.8, 0.30, 8),
             'ornamental': (1.6, 0.28, 7), 'pine': (2.0, 0.34, 16), 'cypress': (2.5, 0.42, 20), 'redwood': (1.5, 0.22, 10),
             'jacaranda': (2.0, 0.40, 12)}


def _draw(mix, u):
    """an archetype from a {name: share} mix, u in [0, 1)"""
    ks = sorted(mix); tot = sum(mix[k] for k in ks); acc = 0.0
    for k in ks:
        acc += mix[k] / tot
        if u < acc: return k
    return ks[-1]


class Kinds:
    def __init__(self, bpy, load_collection, log=print, box=None):
        import veg_protos as VP
        self.protos, self.widths, self.heights, self.tall, self.hmax, self.names = [], [], [], [], [], []
        idx = {}
        K = VP.kit(); faces = {}
        for nm in sorted({p for ps in PROTO_OF.values() for p in ps}):
            if nm.startswith('ph:'):
                t_, h_ = PH_SIZE[nm[3:]]
                for i, (c, w, h) in enumerate(load_collection(nm[3:])):
                    idx.setdefault(nm, []).append(self._add(f'{nm}{i}', c, w, h, t_, h_))
            else:
                b, ramp, t_, h_ = K[nm]
                c, w, h, nf = VP.to_blender(bpy, f'veg_{nm}', b(), ramp); faces[nm] = nf
                idx.setdefault(nm, []).append(self._add(nm, c, w, h, t_, h_))
        self.kinds_of = {a: [k for p in ps for k in idx[p]] for a, ps in PROTO_OF.items()}
        self.arch_of_kind = {}
        for a, ks in self.kinds_of.items():
            for k in ks: self.arch_of_kind.setdefault(k, a)
        log('veg protos (name w h faces):', [(n, round(w, 1), round(h, 1), faces.get(n)) for n, w, h in zip(self.names, self.widths, self.heights)])
        # the data
        D = np.load(os.path.join(VEG, 'veg.npz')); J = json.load(open(os.path.join(VEG, 'veg_zones.json')))
        self.ARCH = J['arch']; self.HARCH = J['hint_arch']; self.street_mix = J['street_mix']
        self.zones = J['zones']; self.Z = D['zone']; self.zo = D['zone_origin']
        from mathutils.kdtree import KDTree
        def tree_of(X, Y, pad=80):
            sel = np.ones(len(X), bool) if box is None else (X > box[0] - pad) & (X < box[2] + pad) & (Y > box[1] - pad) & (Y < box[3] + pad)
            ii = np.nonzero(sel)[0]
            if not len(ii): return None, 0
            kd = KDTree(len(ii))
            for i in ii: kd.insert((float(X[i]), float(Y[i]), 0.0), int(i))
            kd.balance(); return kd, len(ii)
        self.st_arch, self.st_dbh = D['st_arch'], D['st_dbh']
        self.st_site = D['st_site'] if 'st_site' in D.files else np.zeros(len(self.st_arch), np.uint8)
        self.kst, nst = tree_of(D['st_x'], D['st_y'])
        self.h_arch = D['h_arch']; self.khi, nh = tree_of(D['h_x'], D['h_y'])
        self.drop_none = os.environ.get('VEG_DROP_NONE', '1') == '1'
        self.stats = {}
        log('veg data: listed street trees', nst, 'OSM tree hints', nh, 'zones', len(self.zones))

    def _add(self, name, coll, w, h, tall, hmax):
        # (the instancer picks by name order: hq_city.instancer wraps each proto in index order)
        self.protos.append(coll); self.widths.append(w); self.heights.append(h)
        self.tall.append(tall); self.hmax.append(hmax); self.names.append(name)
        return len(self.protos) - 1

    def _count(self, k):
        self.stats[k] = self.stats.get(k, 0) + 1

    def _kind(self, arch, x, y):
        ks = self.kinds_of[arch]
        return ks[int(hp(x, y, 2) * len(ks)) % len(ks)]

    def _palm_crown(self, kind, x, y):
        return self.widths[kind] * (0.85 + 0.3 * hp(x, y, 36))

    def zone(self, x, y):
        x0, y1, res = self.zo
        c, r = int((x - x0) / res), int((y1 - y) / res)
        if 0 <= r < self.Z.shape[0] and 0 <= c < self.Z.shape[1]: return int(self.Z[r, c])
        return 0

    def _stand(self, x, y, S):
        """u of the stand (a Voronoi cell of size S, its seed by place) x, y is in"""
        i, j = math.floor(x / S), math.floor(y / S); best = None; bd = 1e18
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                ci, cj = i + di, j + dj
                sx, sy = (ci + hp(ci, cj, 41)) * S, (cj + hp(ci, cj, 42)) * S
                dd = (sx - x) ** 2 + (sy - y) ** 2
                if dd < bd: bd = dd; best = (ci, cj)
        return hp(best[0], best[1], 43)

    def mass_arch(self, x, y):
        z = self.zones[self.zone(x, y)]; mix = dict(z['mix'])
        co, idx, dist = self.khi.find((x, y, 0.0)) if self.khi is not None else (None, None, None)
        if idx is not None and dist <= 4.0:
            h = self.HARCH[int(self.h_arch[idx])]
            if h in self.kinds_of: return h, z['name']
            keep = {a: w for a, w in mix.items() if (a in CONIFERS) == (h == 'conifer') and a not in PALMS}
            mix = keep or (dict(pine=0.5, cypress=0.5) if h == 'conifer' else dict(round=0.6, plane=0.25, euc=0.15))
        S = z['stand']
        if S and hp(x, y, 33) < 0.75: return _draw(mix, self._stand(x, y, S)), z['name']
        return _draw(mix, hp(x, y, 34)), z['name']

    def _off_street(self, x, y, on_street, roofed, reach=4.0):
        """NO TRUNK IN THE CARRIAGEWAY. The listed trees stand at the curb, the
        engine's street polygons are a metre or two wide of it: palms stood in
        Mission St's red bus lane (life agent, 24/09). The point itself if it is
        off the street mesh, else the nearest point within reach that is on
        neither street nor roof (rings of 0.5 m, from due east: by place)"""
        if not on_street(x, y): return x, y
        d = 0.5
        while d <= reach + 1e-6:
            n = max(8, int(2 * math.pi * d / 0.5))
            for i in range(n):
                t = 2 * math.pi * i / n; nx, ny = x + d * math.cos(t), y + d * math.sin(t)
                if not on_street(nx, ny) and not (roofed is not None and roofed(nx, ny)): return nx, ny
            d += 0.5
        return None

    def mass(self, x, y, crown, on_street=None, roofed=None):
        r = self.mass4(x, y, crown, on_street, roofed)
        return r if (r is None or on_street is not None) else r[:2]   # legacy callers: (kind, crown)

    def mass4(self, x, y, crown, on_street=None, roofed=None):
        """(kind, crown, x, y) for a canopy mass"""
        if os.environ.get('VEG_NOMASS') == '1': return None      # diagnostics: the scene without the canopy masses
        a, zn = self.mass_arch(x, y); k = self._kind(a, x, y)
        self._count(('mass', zn, a))
        if on_street is not None:
            # a mass over a paved median or a boulevard's planting stays put
            # when there is no open ground within reach (Sunset Blvd's pines)
            p = self._off_street(x, y, on_street, roofed)
            if p is None: self._count(('street', 'mass_in_road_kept'))
            elif p != (x, y): self._count(('street', 'mass_off_road')); x, y = p
        if a in PALMS: return k, self._palm_crown(k, x, y), x, y
        if a in FOREST_H and zn not in OPEN_ZONES:
            lo, hi = FOREST_H[a]; ht = lo + (hi - lo) * hp(x, y, 37)
            crown = max(crown, ht * self.widths[k] / max(0.5, self.heights[k]))
        dg = os.environ.get('VEG_DIAG')
        if dg:      # diagnostics: what the masses in a world rectangle are (zone, species, crown m)
            b_ = [float(v) for v in dg.split(',')]
            if b_[0] <= x <= b_[2] and b_[1] <= y <= b_[3]: self._count(('diag', zn, a, self.names[k], int(crown // 4) * 4))
        return k, crown, x, y

    def street(self, ox, oy, x, y, park, crown, on_street=None, roofed=None):
        r = self.street4(ox, oy, x, y, park, crown, on_street, roofed)
        return r if (r is None or on_street is not None) else r[:2]   # legacy callers: (kind, crown)

    def street4(self, ox, oy, x, y, park, crown, on_street=None, roofed=None):
        """(kind, crown, x, y) for a register tree; None = no tree there"""
        co, idx, dist = self.kst.find((ox, oy, 0.0)) if self.kst is not None else (None, None, None)
        dbh = 0.0; site = 0
        if idx is not None and dist <= 2.3:
            a = self.ARCH[int(self.st_arch[idx])]; dbh = float(self.st_dbh[idx]); site = int(self.st_site[idx])
            if a == 'none':
                self._count(('street', 'none'))
                if self.drop_none: return None
                a = 'unknown'
            if a == 'unknown': a = _draw(self.street_mix, hp(x, y, 35))
            self._count(('street', 'listed'))
        elif park:
            self._count(('street', 'park'))
            return self.mass4(x, y, crown, on_street, roofed)
        else:
            a = _draw(self.street_mix, hp(x, y, 35)); self._count(('street', 'unlisted'))
        k = self._kind(a, x, y); self._count(('arch', a))
        if on_street is not None and site != SITE_MEDIAN:       # the list's median trees stay on their median
            p = self._off_street(x, y, on_street, roofed)
            if p is None:
                self._count(('street', 'in_road_dropped')); return None
            if p != (x, y): self._count(('street', 'off_road')); x, y = p
        if a in PALMS: return k, self._palm_crown(k, x, y), x, y
        if dbh > 0 and a in CROWN_DBH:
            p_ = CROWN_DBH[a]; crown = max(2.5, min(p_[2], p_[0] + p_[1] * dbh))
        return k, crown, x, y

    def report(self, log=print):
        s = self.stats
        log('veg street:', {k[1]: v for k, v in s.items() if k[0] == 'street'},
            'arch:', {k[1]: v for k, v in sorted(s.items(), key=lambda kv: -kv[1]) if k[0] == 'arch'})
        agg = {}
        for k, v in s.items():
            if k[0] == 'mass': agg.setdefault(k[1], {})[k[2]] = v
        dg = {k[1:]: v for k, v in s.items() if k[0] == 'diag'}
        if dg: log('veg diag:', dict(sorted(dg.items(), key=lambda kv: -kv[1])[:40]))
        log('veg masses by zone:', {z: dict(sorted(m.items(), key=lambda kv: -kv[1])) for z, m in agg.items()})
