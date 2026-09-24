"""python3 veg_prep.py — the vegetation agent's data, out of Blender (numpy,
scipy, PIL; < 1 GB). Reads the sources saved in qipu-render-work/veg/ and
writes what veg_hq.py reads there:

  veg.npz          street trees (DataSF Street Tree List tkzw-k3nq, fetched
                   24/09 from data.sf.gov, PDDL): x, y (engine metres), archetype,
                   DBH (in); OSM natural=tree hints (x, y, archetype); the zone
                   raster (4 m, uint8) and its origin
  veg_zones.json   the archetype names, the zone table (name, species mix,
                   stand size, source) and the city-wide street mix

Sources in veg_src/ (fetch commands in veg/README.md): street_trees.csv, osm_veg.json
(woods, forests, trees, parks), osm_rel.json (relations with geometry),
osm_coast.json (the Pacific coastline), engine_reg.npy (the engine's own
register points, to measure the join).
"""
import csv, json, math, os, re, collections
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

VEG = '/Users/daniel/code/qipu-render-work/veg'          # outputs, read by veg_hq (frozen by mksnap.sh)
SRC = '/Users/daniel/code/qipu-render-work/veg_src'      # the fetched sources (README.md)
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753     # roofs_prep.py's engine projection
def ll2e(lon, lat): return (lon - LON0) * MPD * COSL, (lat - LAT0) * MPD

ARCH = ['unknown', 'none', 'plane', 'round', 'pohu', 'euc', 'column', 'cherry', 'plum', 'olive', 'ornamental',
        'pine', 'cypress', 'redwood', 'jacaranda', 'date_palm', 'fan_palm', 'queen_palm', 'small_palm']
AI = {a: i for i, a in enumerate(ARCH)}

# ── species -> archetype (genus first, then the species/cultivar exceptions) ─
G = {
 'plane': 'platanus patanus liquidambar ulmus fraxinus liriodendron celtis koelreuteria pistacia pistachia robinia zelkova tilia '
          'aesculus betula gleditsia morus juglans alnus catalpa chitalpa parrotia nyssa styphnolobium sophora fagus salix ailanthus '
          'paulownia sapium melia cedrela diospyros carpinus acer quercus populus tipuana ceiba albizia erythrina firmiana corylus ziziphus',
 'round': 'lophostemon pittosporum tristaniopsis tristania magnolia michelia michaelia ficus maytenus ligustrum laurus myoporum melaleuca '
          'arbutus lagunaria acacia schinus ceratonia geijera cupaniopsis eriobotrya syzygium agonis lyonothamnus hymenosporum rhamnus '
          'umbellularia grevillea brachychiton cinnamomum persea elaeocarpus heteromeles quillaja afrocarpus azara ilex fremontodendron '
          'cussonia banksia myrica xylosma lithocarpus corynocarpus griselinia meryta psidium schefflera acca chiranthodendron',
 'pohu': 'metrosideros',
 'euc': 'eucalyptus corymbia angophora angohpora',
 'column': 'ginkgo gingko taxus thuja juniperus calocedrus chamaecyparis cupressocyparis podocarpus',
 'cherry': 'prunus malus crataegus crateagus cercis lagerstroemia cornus chionanthus styrax syringa punica citrus fortunella',
 'olive': 'olea',
 'ornamental': 'callistemon leptospermum photinia rhaphiolepis ceanothus cotoneaster hakea pyracantha nerium tibochina brugmansia '
               'abutilon escallonia viburnum sambucus arctostaphylos leucodendron leucadendron garrya tecoma radermachera cassia solanum '
               'shrub landscape bambusa musa dicksonia aloe beaucarnea cycas dodonaea cotinus',
 'pine': 'pinus casuarina casurina',
 'cypress': 'cupressus',
 'redwood': 'sequoia sequoiadendron metasequoia cedrus picea abies pseudotsuga araucaria cryptomeria taxodium',
 'jacaranda': 'jacaranda',
 'date_palm': 'phoenix jubaea',
 'fan_palm': 'washingtonia brahea livistona',
 'queen_palm': 'syagrus arecastrum archontophoenix howea rhopalostylis dypsis caryota palm',
 'small_palm': 'chamaerops trachycarpus cordyline yucca dracaena butia',
 'none': 'planting stump potential paved basin(s)',
}
GENUS = {g: a for a, gs in G.items() for g in gs.split()}
SPECIAL = [   # (regex on the scientific name, archetype): cultivars and species that break their genus' rule
    (r'corymbia ficifolia', 'pohu'),                       # red flowering gum: a dense dark dome with red flowers, not a blue gum
    (r'prunus cerasifera|prunus blireiana|prunus x blireiana|purpurea|atropurpure', 'plum'),   # purple-leaf plums, hopseed
    (r'pyrus calleryana', 'column'),                        # ornamental pear: upright oval
    (r'pyrus kawakamii', 'round'),                          # evergreen pear: spreading, evergreen
    (r'pyrus', 'cherry'),
    (r'cupressus sempervirens', 'column'),                  # Italian cypress
    (r'populus nigra', 'column'),                           # Lombardy poplar
    (r'fastigiat|columnar|italica', 'column'),
    (r'acer palmatum', 'ornamental'),
    (r'quercus (agrifolia|ilex|suber|virginiana|wislizeni|chrysolepis)', 'round'),   # the evergreen oaks
    (r'podocarpus gracilior|afrocarpus', 'round'),          # fern pine: a broad oval evergreen
    (r'eriobotrya deflexa', 'ornamental'),                  # bronze loquat: small
    (r'magnolia grandiflora .little gem', 'ornamental'),
    (r'tristaniopsis laurina .elegant', 'ornamental'),
    (r'arbutus .marina', 'round'),
    (r'melaleuca linariifolia|melaleuca viminalis', 'ornamental'),
    (r'dodonaea', 'plum'),
]
def arch_of(sp):
    s = sp.split('::')[0].strip().lower()
    if not s or s.startswith('tree') or s.startswith('other') or s.startswith('ornamental') or s.startswith('new'): return 'unknown'
    for rx, a in SPECIAL:
        if re.search(rx, s): return a
    g = s.split()[0]
    if g in GENUS: return GENUS[g]
    for k, a in GENUS.items():              # "Ulmus spp", "Palm" … and typos caught by prefix
        if g.startswith(k[:5]) and len(k) >= 5: return a
    return 'unknown'


def street():
    R = list(csv.DictReader(open(f'{SRC}/street_trees.csv')))
    X, Y, A, D = [], [], [], []; miss = collections.Counter()
    for r in R:
        if not r['latitude'] or not r['longitude']: continue
        x, y = ll2e(float(r['longitude']), float(r['latitude']))
        a = arch_of(r['species'])
        if a == 'unknown': miss[r['species']] += 1
        X.append(x); Y.append(y); A.append(AI[a])
        try: D.append(float(r['mapdbh']) if r['mapdbh'] else 0.0)
        except ValueError: D.append(0.0)
    X, Y, A, D = map(np.array, (X, Y, A, D))
    D[(D < 0.5) | (D > 120)] = 0.0
    c = collections.Counter(ARCH[a] for a in A)
    print('street trees', len(X), dict(c.most_common()))
    print('  unmapped (unknown):', sum(miss.values()), miss.most_common(12))
    return X.astype(np.float32), Y.astype(np.float32), A.astype(np.uint8), D.astype(np.float32), c


def join_stats(X, Y):
    """how many of the engine's register points find a listed tree within 2.3 m"""
    p = os.path.join(SRC, 'engine_reg.npy')
    if not os.path.exists(p): return
    E = np.load(p)[:, :2].astype(np.float64)
    E = np.unique(np.round(E / 2.5), axis=0) * 2.5 if False else E
    k = np.unique(np.round(E / 2.5), axis=0).shape[0]
    t = cKDTree(np.c_[X, Y]); d, _ = t.query(E, k=1)
    print(f'join: engine register {len(E)} rows ({k} places); nearest listed tree: '
          f'<=1 m {np.mean(d <= 1):.3f}  <=2.3 m {np.mean(d <= 2.3):.3f}  <=4 m {np.mean(d <= 4):.3f}  median {np.median(d):.2f} m')


# ── OSM geometry ─────────────────────────────────────────────────────────────
def _rings_way(e): return [[ll2e(p['lon'], p['lat']) for p in e['geometry']]]
def _rings_rel(e):
    """outer members joined end to end into closed rings"""
    segs = [[ll2e(p['lon'], p['lat']) for p in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
    rings = []
    while segs:
        r = segs.pop(0)
        grew = True
        while grew and (abs(r[0][0] - r[-1][0]) + abs(r[0][1] - r[-1][1]) > 0.5):
            grew = False
            for i, s in enumerate(segs):
                if abs(s[0][0] - r[-1][0]) + abs(s[0][1] - r[-1][1]) < 0.5: r = r + s[1:]; segs.pop(i); grew = True; break
                if abs(s[-1][0] - r[-1][0]) + abs(s[-1][1] - r[-1][1]) < 0.5: r = r + s[::-1][1:]; segs.pop(i); grew = True; break
        rings.append(r)
    return rings

def load_osm():
    els = json.load(open(f'{SRC}/osm_veg.json'))['elements']
    rel = {e['id']: e for e in json.load(open(f'{SRC}/osm_rel.json'))['elements']}
    ways, rels, nodes = {}, {}, []
    for e in els:
        if e['type'] == 'way' and 'geometry' in e: ways[e['id']] = e
        elif e['type'] == 'relation' and e['id'] in rel: rels[e['id']] = rel[e['id']]
        elif e['type'] == 'node': nodes.append(e)
    for i, e in rel.items(): rels.setdefault(i, e)
    return ways, rels, nodes


# ── zones: where the measured canopy is which species ───────────────────────
# mix: archetype -> share of the trees. stand: the size (m) of the single-species
# blocks the forests were planted in (a Voronoi of that size: one species per
# stand, 25 % of trees drawn from the whole mix). Sources in README.md.
URBAN = dict(round=0.42, plane=0.12, pine=0.09, cypress=0.07, euc=0.06, cherry=0.06, plum=0.04, ornamental=0.05, olive=0.03,
             column=0.03, redwood=0.02, small_palm=0.01)
Z = [  # name, mix, stand m
 ('urban', URBAN, 0),
 ('coast_band', dict(cypress=0.34, pine=0.22, round=0.28, euc=0.06, ornamental=0.06, small_palm=0.04), 0),
 ('park', dict(round=0.30, pine=0.17, cypress=0.17, euc=0.14, plane=0.14, redwood=0.04, date_palm=0.02, ornamental=0.02), 35),
 ('golf', dict(cypress=0.45, pine=0.35, euc=0.15, round=0.05), 45),
 ('presidio', dict(euc=0.42, cypress=0.34, pine=0.15, round=0.05, redwood=0.04), 70),
 ('ggp_west', dict(cypress=0.40, pine=0.28, euc=0.17, round=0.15), 55),
 ('ggp_mid', dict(pine=0.22, cypress=0.22, euc=0.24, round=0.20, plane=0.06, redwood=0.06), 50),
 ('ggp_east', dict(euc=0.20, cypress=0.18, pine=0.12, round=0.28, plane=0.16, redwood=0.06), 40),
 ('panhandle', dict(euc=0.35, cypress=0.20, pine=0.10, plane=0.20, round=0.15), 40),
 ('sutro', dict(euc=0.88, round=0.06, pine=0.03, cypress=0.03), 80),
 ('davidson', dict(euc=0.85, pine=0.08, cypress=0.07), 70),
 ('mclaren', dict(euc=0.50, pine=0.25, cypress=0.20, round=0.05), 60),
 ('landsend', dict(cypress=0.60, pine=0.25, euc=0.10, round=0.05), 50),
 ('fort_funston', dict(cypress=0.75, euc=0.15, pine=0.10), 50),
 ('stern_pine', dict(euc=0.50, pine=0.20, cypress=0.15, redwood=0.10, round=0.05), 50),
 ('glen_canyon', dict(euc=0.70, round=0.20, pine=0.05, cypress=0.05), 50),
 ('lake_merced', dict(cypress=0.45, pine=0.35, euc=0.15, round=0.05), 50),
 ('hill_park', dict(euc=0.45, cypress=0.20, pine=0.25, round=0.10), 45),
 ('pioneer', dict(pine=0.80, cypress=0.15, euc=0.05), 40),
 ('square', dict(cypress=0.40, pine=0.35, round=0.15, euc=0.10), 35),
 ('wood_any', dict(euc=0.60, pine=0.15, cypress=0.15, round=0.10), 50),   # an unnamed wood outside the named places: a hill grove
 ('redwood_grove', dict(redwood=1.0), 30),
 ('garden', dict(round=0.55, plane=0.15, ornamental=0.15, redwood=0.05, small_palm=0.05, queen_palm=0.05), 25),
]
ZI = {z[0]: i for i, z in enumerate(Z)}
BY_NAME = [   # (zone, OSM name regex) — the named places
 ('presidio', r'^Presidio of San Francisco$'), ('sutro', r'^Mount Sutro Open Space Reserve$'), ('davidson', r'^Mount Davidson Park$'),
 ('mclaren', r'^John McLaren Park$'), ('landsend', r'^(Lands End|Lincoln Park|Lincoln Park Golf Course|Sutro Heights Park)$'),
 ('fort_funston', r'^Fort Funston$'), ('stern_pine', r'^(Sigmund Stern Recreation Grove|Pine Lake Park)$'),
 ('glen_canyon', r'^Glen Canyon Park$'), ('lake_merced', r'^Lake Merced Park$'),
 ('hill_park', r'^(Buena Vista Park|Corona Heights Park|Bernal Heights Park|Twin Peaks|Grandview Open Space|Bayview Park|Mountain Lake Park)$'),
 ('pioneer', r'^Pioneer Park$'), ('square', r'^(Alamo Square|Lafayette Park|Alta Plaza Park)$'),
 ('panhandle', r'^Panhandle$'),
]
RES = 4.0; X0, Y0, X1, Y1 = -8000.0, -7200.0, 8000.0, 9200.0


def zones(ways, rels):
    W_, H_ = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
    im = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(im)
    def paint(rings, z):
        for r in rings:
            if len(r) >= 3: dr.polygon([((x - X0) / RES, (Y1 - y) / RES) for x, y in r], fill=ZI[z])
    # 1. the coastal band: land within 700 m of the Pacific shore (west of -4500 m)
    co = json.load(open(f'{SRC}/osm_coast.json'))['elements']
    C = np.array([ll2e(p['lon'], p['lat']) for e in co for p in e['geometry']])
    C = C[C[:, 0] < -4500]
    dense = []
    for e in co:
        g = [ll2e(p['lon'], p['lat']) for p in e['geometry']]
        for (xa, ya), (xb, yb) in zip(g, g[1:]):
            n = max(1, int(math.hypot(xb - xa, yb - ya) / 10))
            dense += [(xa + (xb - xa) * t / n, ya + (yb - ya) * t / n) for t in range(n)]
    D = np.array(dense); D = D[D[:, 0] < -4300]
    xs = X0 + (np.arange(W_) + 0.5) * RES; ys = Y1 - (np.arange(H_) + 0.5) * RES
    sub = (xs < -3000)
    gx, gy = np.meshgrid(xs[sub], ys)
    dist, _ = cKDTree(D).query(np.c_[gx.ravel(), gy.ravel()], k=1)
    band = (dist.reshape(gx.shape) < 700) & (gy > -6300) & (gy < 2600)
    A = np.array(im); A[:, :sub.sum()][band] = ZI['coast_band']; im = Image.fromarray(A); dr = ImageDraw.Draw(im)
    # 2. every park, then golf courses, then the named places, then the woods' own leaf types
    for e in ways.values():
        t = e.get('tags', {})
        if t.get('leisure') == 'park': paint(_rings_way(e), 'park')
    for e in rels.values():
        if e.get('tags', {}).get('leisure') == 'park': paint(_rings_rel(e), 'park')
    for e in list(ways.values()) + list(rels.values()):
        t = e.get('tags', {})
        if t.get('leisure') == 'golf_course': paint(_rings_way(e) if e['type'] == 'way' else _rings_rel(e), 'golf')
    named = collections.Counter()
    for e in list(ways.values()) + list(rels.values()):
        t = e.get('tags', {})
        if (t.get('natural') == 'wood' or t.get('landuse') == 'forest') and not t.get('leaf_type') and not t.get('name'):
            paint(_rings_way(e) if e['type'] == 'way' else _rings_rel(e), 'wood_any'); named['wood_any'] += 1
    for z, rx in BY_NAME:
        for e in list(ways.values()) + list(rels.values()):
            nm = e.get('tags', {}).get('name', '')
            if re.search(rx, nm):
                paint(_rings_way(e) if e['type'] == 'way' else _rings_rel(e), z); named[z] += 1
    # Golden Gate Park, in three: the ocean end (windbreaks), the middle, the east end
    for e in ways.values():
        if e.get('tags', {}).get('name') == 'Golden Gate Park':
            r = _rings_way(e)[0]
            for z, xa, xb in (('ggp_east', -2600, 99999), ('ggp_mid', -4700, -2600), ('ggp_west', -99999, -4700)):
                clip = Image.new('L', im.size, 0); ImageDraw.Draw(clip).polygon([((x - X0) / RES, (Y1 - y) / RES) for x, y in r], fill=1)
                M = np.array(clip).astype(bool)
                cols = (xs >= xa) & (xs < xb)
                A = np.array(im); A[M & cols[None, :]] = ZI[z]; im = Image.fromarray(A)
            named['ggpark'] += 1
    dr = ImageDraw.Draw(im)
    A = np.array(im)
    for e in list(ways.values()) + list(rels.values()):
        t = e.get('tags', {})
        if not (t.get('natural') == 'wood' or t.get('landuse') == 'forest'): continue
        nm = t.get('name', '')
        rings = _rings_way(e) if e['type'] == 'way' else _rings_rel(e)
        if 'Redwood' in nm: paint(rings, 'redwood_grove'); named['redwood'] += 1
        elif nm in ('Tea Tree Grove', 'Meso American Cloud Forest'): paint(rings, 'garden'); named['garden'] += 1
        elif t.get('leaf_type') in ('needleleaved', 'broadleaved'):
            # a wood OSM tags by leaf type: its own zone, the mix of the place
            # it stands in kept to that leaf type (conifers: pine, cypress, redwood)
            clip = Image.new('L', im.size, 0)
            for r in rings:
                if len(r) >= 3: ImageDraw.Draw(clip).polygon([((x - X0) / RES, (Y1 - y) / RES) for x, y in r], fill=1)
            Mk = np.array(clip).astype(bool)
            if not Mk.any(): continue
            A = np.array(im); par = int(np.bincount(A[Mk]).argmax()); pm = Z[par][1]
            con = t['leaf_type'] == 'needleleaved'
            keep = {a: w for a, w in pm.items() if (a in ('pine', 'cypress', 'redwood')) == con}
            if sum(keep.values()) < 0.05: keep = dict(pine=0.5, cypress=0.5) if con else dict(round=0.6, plane=0.25, euc=0.15)
            tot = sum(keep.values()); keep = {a: round(w / tot, 3) for a, w in keep.items()}
            Z.append((f"wood_{'needle' if con else 'broad'}_{e['id']}_in_{Z[par][0]}", keep, 40)); ZI[Z[-1][0]] = len(Z) - 1
            A[Mk] = len(Z) - 1; im = Image.fromarray(A); dr = ImageDraw.Draw(im)
            named['leaf_typed'] += 1
    print('zones painted', dict(named))
    A = np.array(im)
    print('zone cells', {Z[i][0]: int(n) for i, n in enumerate(np.bincount(A.ravel(), minlength=len(Z))) if n})
    return A


def hints(nodes):
    X, Y, A = [], [], []
    for e in nodes:
        t = e.get('tags', {})
        if t.get('natural') != 'tree': continue
        sp = (t.get('species') or t.get('genus') or t.get('taxon') or '')
        a = arch_of(sp) if sp else 'unknown'
        if a == 'unknown':
            lt = t.get('leaf_type')
            a = {'palm': 'date_palm', 'needleleaved': 'conifer', 'broadleaved': 'broad'}.get(lt)
            if a is None: continue
        X.append(ll2e(e['lon'], e['lat'])[0]); Y.append(ll2e(e['lon'], e['lat'])[1]); A.append(a)
    print('OSM tree hints', len(A), collections.Counter(A).most_common())
    return X, Y, A


if __name__ == '__main__':
    X, Y, A, D, cnt = street()
    join_stats(X, Y)
    ways, rels, nodes = load_osm()
    ZA = zones(ways, rels)
    hx, hy, ha = hints(nodes)
    HN = ARCH + ['conifer', 'broad']
    mix_street = {a: n for a, n in cnt.items() if a not in ('unknown', 'none')}
    tot = sum(mix_street.values()); mix_street = {a: round(n / tot, 4) for a, n in mix_street.items()}
    np.savez_compressed(f'{VEG}/veg.npz', st_x=X, st_y=Y, st_arch=A, st_dbh=D,
                        h_x=np.array(hx, np.float32), h_y=np.array(hy, np.float32), h_arch=np.array([HN.index(a) for a in ha], np.uint8),
                        zone=ZA, zone_origin=np.array([X0, Y1, RES]))
    json.dump(dict(arch=ARCH, hint_arch=HN, street_mix=mix_street,
                   zones=[dict(name=n, mix=m, stand=s) for n, m, s in Z]), open(f'{VEG}/veg_zones.json', 'w'), indent=1)
    Image.fromarray((ZA * (255 // max(1, len(Z)))).astype(np.uint8)).resize((ZA.shape[1] // 4, ZA.shape[0] // 4)).save('/Users/daniel/code/qipu-render-work/veg_work/zones_preview.png')
    print('wrote veg.npz, veg_zones.json, zones_preview.png')
