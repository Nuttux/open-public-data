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
# v3 (VEG_V3=1, the deep-zoom kit, veg_protos.kit3): 2-3 sizes per species
# (the one nearest the tree's own size is drawn, see _kind), and the 'round'
# class split into its main species: the listed trees by their own species
# (veg_sub.npz, veg_prep.py sub), the unlisted ones by the list's shares
PROTO_OF3 = dict(PROTO_OF)
PROTO_OF3.update({
    'plane': ['plane_a', 'plane_b', 'plane_y'], 'pohu': ['pohu', 'pohu_b'],
    'euc': ['euc_a', 'euc_b', 'euc_c', 'euc_y'], 'pine': ['pine_a', 'pine_b', 'pine_y'], 'cypress': ['cyp_a', 'cyp_b', 'cyp_y'],
    'ficus': ['ficus_a', 'ficus_b'], 'vbox': ['vbox_a', 'vbox_b'], 'bbox': ['bbox_a', 'bbox_b'], 'oak': ['oak_a', 'oak_b'],
    'date_palm': ['phoenix', 'phoenix_b'], 'fan_palm': ['washy', 'washy_b'],
})
# v4 (assets_trees_glass 27/09): the ornamentals drawn from v4 small broadleaves, not Poly
# Haven's leafless tree_small_02 (the AI pass painted it as dead, broken trees)
if os.environ.get('VEG_V4', '1') == '1' and os.environ.get('VEG_V3', '1') == '1':
    PROTO_OF3['ornamental'] = ['orn_a', 'cherry', 'orn_b', 'round_b']
ROUND_SUB = {'round': 0.33, 'ficus': 0.08, 'vbox': 0.22, 'bbox': 0.25, 'oak': 0.12}     # the unlisted 'round' trees (the list's shares, oaks up)
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
CAN_ZONES = tuple(z for z in os.environ.get('CAN_ZONES', 'urban,coast_band').split(',') if z)      # CANOPY=1: where the measured crowns replace the masses
# (04/10 B2b, Vancouver) a city whose scene has no canopy masses (no 192-vertex Basic tree meshes) plants its woods from the
# measured crowns too: CAN_ZONES=urban,coast_band,park,forest,stanley,garden. LiDAR segments a closed conifer stand into few,
# narrow crowns (~40/ha, 3.9 m median): VEG_FOREST_FILL=n adds about n more trees per crown in the closed zones (not OPEN_ZONES),
# scattered within VEG_FOREST_R m, the stand's own species. Defaults (SF): urban,coast_band, 0 = as before.
VEG_FOREST_FILL = float(os.environ.get('VEG_FOREST_FILL', '0')); VEG_FOREST_R = float(os.environ.get('VEG_FOREST_R', '7'))
# VEG_FOREST_SUB=a:b,...: in the closed zones a crown of archetype a is drawn as b (Vancouver: plane:redwood - the LiDAR's broadleaf
# 'plane' crowns in Stanley Park are its firs, cedars and hemlocks; a London plane is a street tree). Unset (SF): none.
VEG_FOREST_SUB = dict(p.split(':') for p in os.environ.get('VEG_FOREST_SUB', '').split(',') if ':' in p)
SITE_MEDIAN = 2
# (V-VEG 05/10) VEG_KIT=pnw (Vancouver): the Pacific Northwest kit (veg_pnw.py: Douglas-fir, redcedar, hemlock, the
# city's street species by genus + cultivar) and its files (veg_pnw.npz, veg_zones_pnw.json, canopy_pnw.npz, veg_city.py
# pnw); a listed tree drawn at its register height. Unset (SF) = the kit and the files above, unchanged.
VEG_KIT = os.environ.get('VEG_KIT', '')
# [TREE_ROAD, 30/09, block52_v8: round trees on the Embarcadero's lanes] TREE_ROAD=1: hq_city passes a STRICT on-road test (asphalt hit,
# not a laid median; no 1.2 m kerb tolerance), every tree on the road is moved within 2 m off it or dropped, median-coded ones too
TREE_ROAD = os.environ.get('TREE_ROAD', '0') == '1'
_TE = []
def _tree_edge():
    """TREE_EDGE=1: (moves {listed index: (x, y) | None}, kept median indices, median links) of tree_edge.json (TE_FILE)"""
    if os.environ.get('TREE_EDGE', '0') != '1': return None
    if not _TE:
        j = json.load(open(os.environ.get('TE_FILE') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tree_edge.json')))
        _TE.append(({int(k): (tuple(v) if v else None) for k, v in j['moves'].items()}, set(j['keep']), j['medians']))
    return _TE[0]
CONIFERS = ('pine', 'cypress', 'redwood')
# crown width (m) from the listed DBH (in): a + b·DBH, at most c. Street trees
# in SF: DBH median 7 in (a young 3 in tree ~3 m across, a 24 in plane ~12 m)
CROWN_DBH = {'plane': (2.0, 0.42, 18), 'round': (2.0, 0.36, 15), 'pohu': (2.2, 0.40, 14), 'euc': (2.0, 0.30, 16),
             'column': (1.2, 0.14, 6), 'cherry': (1.8, 0.30, 8), 'plum': (1.8, 0.30, 8), 'olive': (1.8, 0.30, 8),
             'ornamental': (1.6, 0.28, 7), 'pine': (2.0, 0.34, 16), 'cypress': (2.5, 0.42, 20), 'redwood': (1.5, 0.22, 10),
             'jacaranda': (2.0, 0.40, 12), 'ficus': (2.2, 0.38, 14), 'vbox': (2.0, 0.34, 12), 'bbox': (2.0, 0.34, 13), 'oak': (2.5, 0.45, 18)}


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
        self.v3 = VP.V3_ON; P_OF = PROTO_OF3 if self.v3 else PROTO_OF
        self.protos, self.widths, self.heights, self.tall, self.hmax, self.names = [], [], [], [], [], []
        idx = {}
        K = VP.kit(); faces = {}
        self.pnw = VEG_KIT == 'pnw'; self.crown_dbh = CROWN_DBH; self.conifers = CONIFERS
        files = ('veg.npz', 'veg_zones.json', 'canopy_trees.npz')
        if self.pnw:
            import veg_pnw as VPN
            K = dict(K); K.update(VPN.kit(VP))
            P_OF = dict(VPN.PROTO_OF); P_OF['pine'] = (PROTO_OF3 if self.v3 else PROTO_OF)['pine']
            self.crown_dbh = dict(CROWN_DBH, **VPN.CROWN_DBH); self.conifers = CONIFERS + VPN.CONIFERS
            files = ('veg_pnw.npz', 'veg_zones_pnw.json', 'canopy_pnw.npz')
        for nm in sorted({p for ps in P_OF.values() for p in ps}):
            if nm.startswith('ph:'):
                t_, h_ = PH_SIZE[nm[3:]]
                for i, (c, w, h) in enumerate(load_collection(nm[3:])):
                    idx.setdefault(nm, []).append(self._add(f'{nm}{i}', c, w, h, t_, h_))
            else:
                b, ramp, t_, h_ = K[nm]
                c, w, h, nf = VP.to_blender(bpy, f'veg_{nm}', b(), ramp); faces[nm] = nf
                idx.setdefault(nm, []).append(self._add(nm, c, w, h, t_, h_))
        self.kinds_of = {a: [k for p in ps for k in idx[p]] for a, ps in P_OF.items()}
        self.arch_of_kind = {}
        for a, ks in self.kinds_of.items():
            for k in ks: self.arch_of_kind.setdefault(k, a)
        if self.pnw:       # the old archetypes (SF's names in older data) drawn as this kit's
            for a, b in VPN.ALIAS.items(): self.kinds_of.setdefault(a, self.kinds_of[b])
        log('veg protos (name w h faces):', [(n, round(w, 1), round(h, 1), faces.get(n)) for n, w, h in zip(self.names, self.widths, self.heights)])
        # the data
        D = np.load(os.path.join(VEG, files[0])); J = json.load(open(os.path.join(VEG, files[1])))
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
        self.st_h = D['st_h'] if (self.pnw and 'st_h' in D.files) else None
        self.kst, nst = tree_of(D['st_x'], D['st_y'])
        sp_ = os.path.join(VEG, 'veg_sub.npz')
        self.st_sub = None
        if self.v3 and os.path.exists(sp_):
            S_ = np.load(sp_); self.st_sub = S_['st_sub']; self.sub_names = [str(v) for v in S_['sub_names']]
        self.h_arch = D['h_arch']; self.khi, nh = tree_of(D['h_x'], D['h_y'])
        self.drop_none = os.environ.get('VEG_DROP_NONE', '1') == '1'
        # THE REAL CANOPY (veg_canopy.py: LiDAR crowns where NAIP sees leaves,
        # off the footprints, not on a listed tree): with CANOPY=1 each crown is
        # planted at its measured height and width in the open zones (CAN_ZONES),
        # where the engine's canopy masses (discs of a coarser measure) are then
        # no longer planted; the woods and parks keep their masses
        cp = os.path.join(VEG, files[2])
        self.canopy_on = os.environ.get('CANOPY', '0') == '1' and os.path.exists(cp)
        if self.canopy_on:
            Q = np.load(cp); cx, cy = Q['x'], Q['y']
            sel = np.ones(len(cx), bool) if box is None else (cx > box[0] - 80) & (cx < box[2] + 80) & (cy > box[1] - 80) & (cy < box[3] + 80)
            self.can = dict(x=cx[sel], y=cy[sel], h=Q['height'][sel], w=Q['crown'][sel], k=Q['kind'][sel]); self.can_names = [str(v) for v in Q['kind_names']]
            log('veg canopy crowns in the region:', int(sel.sum()), 'of', len(cx))
        self.stats = {}
        # [VEG_KIT=pnw] no tree seaward of the OSM coastline (quay_wall QW_SINK puts that strip under the sea)
        self.shore = None
        if self.pnw and os.path.exists(os.path.join(VEG, 'shore_pnw.npz')):
            S_ = np.load(os.path.join(VEG, 'shore_pnw.npz')); self.shore = (S_['sd2'], float(S_['x0']), float(S_['y0']), float(S_['res']))
            self.shore_u = float(S_['unit']) if 'unit' in S_.files else 0.5
        # [VEG_KIT=pnw] the boulevards: Vancouver's street mesh is the whole right of way (kerb, boulevard and sidewalk drawn
        # as asphalt), so half the register's boulevard trees found no open ground within reach and were dropped (Kitsilano
        # 12_14: 1582 of 3329). A listed tree on the street mesh whose point ground_city.py calls lawn, sidewalk or canopy
        # (not carriageway asphalt) stays where the register has it (quay_wall QW_BLVD lays the boulevard's grass there)
        self.gmap = None
        gp_ = os.path.join(VEG, 'ground_pnw.npy')
        if self.pnw and os.path.exists(gp_):
            gm_ = json.load(open(os.path.join(VEG, 'ground_pnw.json')))
            self.gmap = (np.load(gp_, mmap_mode='r'), float(gm_['x0']), float(gm_['y0']), [gm_['classes'].index(n) for n in ('lawn', 'concrete', 'tree', 'scrub')])
        log('veg data: listed street trees', nst, 'OSM tree hints', nh, 'zones', len(self.zones))

    def _add(self, name, coll, w, h, tall, hmax):
        # (the instancer picks by name order: hq_city.instancer wraps each proto in index order)
        self.protos.append(coll); self.widths.append(w); self.heights.append(h)
        self.tall.append(tall); self.hmax.append(hmax); self.names.append(name)
        return len(self.protos) - 1

    def wet(self, x, y):
        """[VEG_KIT=pnw] seaward of the OSM coastline by more than 0.5 m"""
        if self.shore is None: return False
        sd, x0, y0, r_ = self.shore; c, r = int((x - x0) / r_), int((y - y0) / r_)
        return 0 <= r < sd.shape[0] and 0 <= c < sd.shape[1] and int(sd[r, c]) * self.shore_u < -0.5

    def boulevard(self, x, y):
        """[VEG_KIT=pnw] ground_city's class at x, y is lawn, sidewalk or canopy (not the carriageway)"""
        if self.gmap is None: return False
        G, x0, y0, ok = self.gmap; i, j = int(x - x0), int(y - y0)
        return 0 <= j < G.shape[0] and 0 <= i < G.shape[1] and int(G[j, i]) in ok

    def _count(self, k):
        self.stats[k] = self.stats.get(k, 0) + 1

    def _kind(self, arch, x, y, crown=None, h=None):
        ks = self.kinds_of[arch]
        if not self.v3 or len(ks) == 1:
            return ks[int(hp(x, y, 2) * len(ks)) % len(ks)]
        if crown is None and h is None:
            # v3, size unknown: the full-grown proto (a palm's young one only
            # where a height or DBH says so: the Embarcadero's date palms drawn
            # half as stumps otherwise), else by place among the others
            return ks[0] if arch in PALMS else ks[int(hp(x, y, 2) * len(ks)) % len(ks)]
        # v3: the size nearest the tree's own (height if known, else crown
        # width), the next nearest one time in three (by place): a young
        # street tree is drawn from a young proto, not a shrunken old one
        if h is not None: d_ = [abs(math.log(max(0.5, h) / max(0.5, self.heights[k]))) for k in ks]
        else: d_ = [abs(math.log(max(0.5, crown) / max(0.5, self.widths[k]))) for k in ks]
        o_ = sorted(range(len(ks)), key=lambda i: (d_[i], i))
        return ks[o_[1] if hp(x, y, 2) < 0.33 and d_[o_[1]] < d_[o_[0]] + 0.35 else o_[0]]

    def _sub(self, a, x, y, idx=None):
        """v3: the 'round' class as its species (listed: its own; else by share)"""
        if not self.v3 or a != 'round' or self.pnw: return a
        if idx is not None and self.st_sub is not None:
            s_ = self.sub_names[int(self.st_sub[idx])]
            return s_ or 'round'
        return _draw(ROUND_SUB, hp(x, y, 38))

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
            keep = {a: w for a, w in mix.items() if (a in self.conifers) == (h == 'conifer') and a not in PALMS}
            mix = keep or ((dict(v_dfir=0.5, v_cedar=0.5) if h == 'conifer' else dict(v_maple=0.6, v_ash=0.4)) if self.pnw else
                           (dict(pine=0.5, cypress=0.5) if h == 'conifer' else dict(round=0.6, plane=0.25, euc=0.15)))
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
        # the measured crowns (canopy()) stand instead in the city's open
        # zones (yards, streets, block interiors); the woods and parks keep
        # their masses: drawn one proto per LiDAR segment, Sutro's and Corona
        # Heights' closed stands read thin and brown (whole frame 3:4, 24/09)
        if self.canopy_on and self.zones[self.zone(x, y)]['name'] in CAN_ZONES: return None
        r = self.mass4(x, y, crown, on_street, roofed)
        return r if (r is None or on_street is not None) else r[:2]   # legacy callers: (kind, crown)

    def mass4(self, x, y, crown, on_street=None, roofed=None):
        """(kind, crown, x, y) for a canopy mass"""
        if os.environ.get('VEG_NOMASS') == '1': return None      # diagnostics: the scene without the canopy masses
        a, zn = self.mass_arch(x, y); a = self._sub(a, x, y)
        k = self._kind(a, x, y, crown=crown if a not in PALMS else None,
                       h=(sum(FOREST_H[a]) / 2 if (self.v3 and a in FOREST_H and self.zones[self.zone(x, y)]['name'] not in OPEN_ZONES) else None))
        self._count(('mass', zn, a))
        if on_street is not None:
            # a mass over a paved median or a boulevard's planting stays put
            # when there is no open ground within reach (Sunset Blvd's pines)
            p = self._off_street(x, y, on_street, roofed, reach=2.0 if TREE_ROAD else 4.0)
            if p is None and (TREE_ROAD or _tree_edge() is not None): self._count(('street', 'te_mass_in_road_dropped')); return None
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
        if self.shore is not None and self.wet(x, y): self._count(('street', 'wet')); return None
        co, idx, dist = self.kst.find((ox, oy, 0.0)) if self.kst is not None else (None, None, None)
        dbh = 0.0; site = 0; hreg = None
        if idx is not None and dist <= 2.3:
            a = self.ARCH[int(self.st_arch[idx])]; dbh = float(self.st_dbh[idx]); site = int(self.st_site[idx])
            if self.st_h is not None and float(self.st_h[idx]) > 0: hreg = float(self.st_h[idx])
            if a == 'none':
                self._count(('street', 'none'))
                if self.drop_none: return None
                a = 'unknown'
            if a == 'unknown': a = _draw(self.street_mix, hp(x, y, 35))
            a = self._sub(a, x, y, idx)
            self._count(('street', 'listed'))
        elif park:
            self._count(('street', 'park'))
            return self.mass4(x, y, crown, on_street, roofed)
        else:
            a = self._sub(_draw(self.street_mix, hp(x, y, 35)), x, y); self._count(('street', 'unlisted'))
        if self.v3 and dbh > 0 and a in self.crown_dbh:
            p_ = self.crown_dbh[a]; crown = max(2.5, min(p_[2], p_[0] + p_[1] * dbh))
        k = self._kind(a, x, y, crown=crown if a not in PALMS else None,
                       h=(6.0 if (a in PALMS and 0 < dbh < 14) else hreg)); self._count(('arch', a))
        te = _tree_edge(); kept_median = False
        if te is not None and on_street is not None and idx is not None and dist <= 2.3 and (idx in te[1] or idx in te[0]):
            # [TREE_EDGE, street_edge 28/09] tree_edge_prep.py decided: a median tree with a median in the data stays; any other
            # tree in the carriageway goes to the sidewalk on its side, or away
            if idx in te[0]:
                mv = te[0][idx]
                if mv is None: self._count(('street', 'te_dropped')); return None
                self._count(('street', 'te_snapped')); x, y = mv
            else: self._count(('street', 'te_median_kept')); kept_median = True
        elif on_street is not None and (TREE_ROAD or site != SITE_MEDIAN):       # the list's median trees stay on their median (TREE_ROAD: only on a real one)
            if self.gmap is not None and idx is not None and dist <= 2.3 and self.boulevard(x, y):
                p = (x, y)          # [VEG_KIT=pnw] on its boulevard: it stays (not moved 4 m into a front yard)
                if on_street(x, y): self._count(('street', 'boulevard_kept'))
            else: p = self._off_street(x, y, on_street, roofed, reach=2.0 if TREE_ROAD else 4.0)
            if p is None:
                self._count(('street', 'in_road_dropped')); return None
            if p != (x, y): self._count(('street', 'off_road')); x, y = p
        # (the Embarcadero's median = its Canary Island date palms: a kept median PALM stays where the list has it, laid strip or not)
        if TREE_ROAD and on_street is not None and not (kept_median and a in PALMS) and on_street(x, y):
            # [TREE_ROAD, 30/09] after the TREE_EDGE decisions too: a kept 'median' tree with no median laid under it stood on the lanes
            p = self._off_street(x, y, on_street, roofed, reach=2.0)
            if p is None: self._count(('street', 'road_dropped')); return None
            self._count(('street', 'road_moved')); x, y = p
        if a in PALMS: return k, self._palm_crown(k, x, y), x, y
        if dbh > 0 and a in self.crown_dbh:
            p_ = self.crown_dbh[a]; crown = max(2.5, min(p_[2], p_[0] + p_[1] * dbh))
        if hreg is not None:
            # [VEG_KIT=pnw] the register's height class sizes the tree with its DBH crown (height weighs more: the silhouette;
            # a conifer by its height almost alone): the crown handed back gives hq_city.tree_scale that scale
            sh, sw = hreg / max(0.5, self.heights[k]), crown / max(0.5, self.widths[k])
            s_ = sh ** 0.85 * sw ** 0.15 if a in self.conifers else sh ** 0.6 * sw ** 0.4
            crown = s_ * self.widths[k]; self._count(('street', 'reg_height'))
        return k, crown, x, y

    def canopy(self, seen=()):
        """(x, y, kind, scale, rot) per measured crown: the species' proto
        scaled between its measured height and width (height weighs more: the
        silhouette over the roofs), capped at the proto's HMAX; none where the
        register already planted a tree (hq_city's 2.5 m 'seen' cells)"""
        if not self.canopy_on: return
        C = self.can
        for i in range(len(C['x'])):
            x, y = float(C['x'][i]), float(C['y'][i])
            if (round(x / 2.5), round(y / 2.5)) in seen: continue
            if self.zones[self.zone(x, y)]['name'] not in CAN_ZONES: continue
            if self.shore is not None and self.wet(x, y): self._count(('canopy', 'wet')); continue
            a = self.can_names[int(C['k'][i])]
            if a not in self.kinds_of: a = 'round'
            if VEG_FOREST_SUB and a in VEG_FOREST_SUB and VEG_FOREST_SUB[a] in self.kinds_of and self.zones[self.zone(x, y)]['name'] not in OPEN_ZONES: a = VEG_FOREST_SUB[a]
            a = self._sub(a, x, y)
            h, w = float(C['h'][i]), float(C['w'][i]); k = self._kind(a, x, y, h=h)
            sh, sw = h / max(0.5, self.heights[k]), w / max(0.5, self.widths[k])
            s_ = sh if a in PALMS else (sh ** 0.85 * sw ** 0.15 if (self.pnw and a in self.conifers) else sh ** 0.6 * sw ** 0.4)
            s_ = min(s_, 1.1 * self.hmax[k] / max(0.5, self.heights[k]), 1.6 * sh)
            self._count(('canopy', a))
            yield x, y, k, s_, 6.283 * hp(x, y, 5)
            if VEG_FOREST_FILL > 0 and a not in PALMS and self.zones[self.zone(x, y)]['name'] not in OPEN_ZONES:
                nf = int(VEG_FOREST_FILL) + (1 if hp(x, y, 41) < VEG_FOREST_FILL % 1 else 0)
                for m in range(nf):
                    t_, r_ = 6.283 * hp(x, y, 140 + m), VEG_FOREST_R * (0.45 + 0.55 * math.sqrt(hp(x, y, 170 + m)))
                    x2, y2 = x + r_ * math.cos(t_), y + r_ * math.sin(t_)
                    if (round(x2 / 2.5), round(y2 / 2.5)) in seen: continue
                    if self.shore is not None and self.wet(x2, y2): continue
                    self._count(('canopy', a + '+fill'))
                    yield x2, y2, k, s_ * (0.7 + 0.25 * hp(x2, y2, 8)), 6.283 * hp(x2, y2, 5)
            # A STAND, NOT ONE TREE: a segment much wider than the capped proto
            # draws (the watershed keeps a closed gum or cypress stand whole,
            # up to 160 m) is filled with more of its trees, scattered over its
            # disc, so the woods stay closed (17 % of the canopy area, 24/09)
            rw = self.widths[k] * s_
            if a in PALMS or w < 1.4 * rw: continue
            n = min(24, int(round(0.8 * (w / rw) ** 2))) - 1
            R = 0.5 * (w - rw)
            for m in range(n):
                t_, r_ = 6.283 * hp(x, y, 60 + m), R * math.sqrt(hp(x, y, 90 + m))
                x2, y2 = x + r_ * math.cos(t_), y + r_ * math.sin(t_)
                if (round(x2 / 2.5), round(y2 / 2.5)) in seen: continue
                self._count(('canopy', a))
                yield x2, y2, k, s_ * (0.75 + 0.25 * hp(x2, y2, 7)), 6.283 * hp(x2, y2, 5)

    def report(self, log=print):
        s = self.stats
        cn = {k[1]: v for k, v in s.items() if k[0] == 'canopy'}
        if cn: log('veg canopy crowns planted:', sum(cn.values()), dict(sorted(cn.items(), key=lambda kv: -kv[1])))
        log('veg street:', {k[1]: v for k, v in s.items() if k[0] == 'street'},
            'arch:', {k[1]: v for k, v in sorted(s.items(), key=lambda kv: -kv[1]) if k[0] == 'arch'})
        agg = {}
        for k, v in s.items():
            if k[0] == 'mass': agg.setdefault(k[1], {})[k[2]] = v
        dg = {k[1:]: v for k, v in s.items() if k[0] == 'diag'}
        if dg: log('veg diag:', dict(sorted(dg.items(), key=lambda kv: -kv[1])[:40]))
        log('veg masses by zone:', {z: dict(sorted(m.items(), key=lambda kv: -kv[1])) for z, m in agg.items()})
