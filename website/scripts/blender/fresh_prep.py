"""THE CITY OF TODAY (FRESH=1 in city_data): what DataSF's footprints (a 2010
3D model refined in 2017) miss since 2022, from the city's own permits.

  in:  qipu-render-work/decisions/permits_completed_since_2022.csv (DBI + Planning
       permits: new construction and demolitions completed 2022-01-01 or later),
       decisions/permits_active.csv (major projects under construction now),
       fresh/parcels.json (DataSF parcels acdm-wktn by blocklot: fresh_parcels.py),
       newbuildings/osm/b_*.json, p_*.json (OpenStreetMap buildings and parts,
       ODbL, (c) OpenStreetMap contributors: the footprint of what stands now)
  out: qipu-render-work/fresh/fresh_records.json
         records     the new buildings, in city_data's schema (src='fresh'),
                     year = the permit's completion year (an era before it
                     does not show them); rings on DataSF's frame
         supersedes  [{gid, until, by, kind}]: the DataSF records (and the
                     OSM-added 'newb' records) a new building stands on; they
                     stand until `until` (the lot's demolition, or the new
                     building's permit issue: when the old one came down)
         demolished  [{gid, until, permit, status}]: finished demolitions
                     whose drawn building is gone (lot empty, or a project
                     under way on it); `until` = the demolition's completion
       qipu-render-work/construction/active_sites.json: per active project,
         the site polygon, target storeys, status and the drawn records on it
         (a later visual step: hoardings, cranes)

Footprint of a new building: the OSM outline at the permit's point (or on its
parcel); none, and a major project: the parcel itself (footprint_src
'parcel'). Height: the OSM height (or tallest part) when it agrees with the
permit's storeys within 35%, else the storeys (residential 4.3 m ground floor +
3.05 m, office 5 m + 4 m, + 1 m parapet). Roof: flat on every building of 4
storeys or more (places.roof), else the generator's own rule.
"""
import csv, json, math, os, re, sys, zlib, collections, datetime
import numpy as np
import shapely, shapely.affinity
from shapely.geometry import Polygon, Point, LineString, shape
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ['NEWB'] = '0'; os.environ.pop('ERA', None)
import city_data
from newb_prep import proj, rings_of, load, pieces, ring_of, num, year_of, TY, USE, SKIP_TYPES

W = '/Users/daniel/code/qipu-render-work'
D = f'{W}/decisions'
OUT = f'{W}/fresh/fresh_records.json'
OUT_A = f'{W}/construction/active_sites.json'


def fyear(s):
    """'2022-04-01' -> 2022.25 (fractional year)"""
    if not s: return None
    d = datetime.date.fromisoformat(s[:10])
    return round(d.year + (d.timetuple().tm_yday - 1) / 365.25, 3)


def gid_fresh(key, k=0):
    return 800000000 + (zlib.crc32(f"fresh:{key}#{k}".encode()) % 90000000)


def fnum(v):
    try: return float(v)
    except (TypeError, ValueError): return None


def use_of(desc, units, st, osm_ty):
    d = desc.lower()
    if 'hotel' in d: return 'HOTEL'
    if re.search(r'\boffice|\blab\b|laborator|r&d', d) and not re.search(r'dwelling|residential|units?\b', d): return 'OFFICE'
    if re.search(r'school|library|church|clinic|hospital|fire station|police|museum|community', d) and not units: return 'INSTITUTION'
    if re.search(r'garage|carport|shed\b', d) and not re.search(r'dwelling|residential|unit', d): return 'GARAGE'
    if units or re.search(r'dwelling|residential|apartment|condo|family|housing|\badu\b|\bunits?\b', d):
        u = units or (1 if 'single family' in d else 2)
        if (st or 0) >= 4 or u >= 10: return 'APARTMENT'
        return 'HOUSE' if u <= 1 else 'FLATS'
    if re.search(r'retail|commercial|restaurant|store', d): return 'RETAIL'
    if re.search(r'warehouse|industrial|pdr\b', d): return 'INDUSTRIAL'
    return osm_ty or 'UNCLASSED'


def h_of_storeys(st, ty):
    if st <= 3: return 3.0 * st + 1.5
    if ty in ('OFFICE', 'INSTITUTION'): return 5.0 + 4.0 * (st - 1) + 1.0
    return 4.3 + 3.05 * (st - 1) + 1.0


PARTIAL = re.compile(r'partial|portion|interior|facade|façade|rear addition|\bdeck\b|stair|porch|retaining wall|fence|'
                     r'sign\b|canopy|tank|kitchen|bathroom|non-structural|soft story|garage door|shed|windows?\b', re.I)


def main():
    # ── DataSF records (the published chunks, NEWB=0) and the OSM-added ones
    B = city_data.buildings(-9000, -9000, 9000, 9000)
    DB = [b for b in B if len(b['ring']) >= 3]
    DP = [(lambda q: q if q.is_valid else q.buffer(0))(Polygon(b['ring'])) for b in DB]
    DA = [q.area for q in DP]; DT = shapely.STRtree(DP)
    print('datasf', len(DB), flush=True)
    nbj = json.load(open(f'{W}/newbuildings/osm_records.json'))
    NB = nbj['records'] + nbj.get('lm_records', [])
    NBP = [Polygon(r['ring']).buffer(0) for r in NB]; NBT = shapely.STRtree(NBP)
    NB_REPL = {int(x['gid']): x for x in nbj['replaces'] + nbj.get('lm_replaces', [])}
    PAINT = sorted(b['paint'] for b in DB if (b['year'] or 0) >= 2005)
    # landmarks: their footprints are not ours to touch
    sk = json.load(open(f'{W}/landmarks/skip_gids.json'))
    LMG = set(sk.get('gids', []))
    for d_ in ('by_landmark', 'all_by_landmark'):
        for v in (sk.get(d_) or {}).values(): LMG.update(int(g) for g in v)
    LMG |= city_data.hero_gids()
    os.environ['LM_ALL'] = '1'
    import landmarks_hq
    LMR = []
    for l in landmarks_hq._registry():
        for r in l.regions:
            if r.ring is not None: LMR.append((l.key, Polygon(r.ring).buffer(0)))
    for k, v in json.load(open(f'{W}/landmarks/footprints.json')).items():
        for r in v.get('outer', []):
            if len(r) >= 3: LMR.append((k, Polygon(r).buffer(0)))
    def landmark_of(g):
        for k, P in LMR:
            if P.intersects(g) and P.intersection(g).area > 0.3 * g.area: return k
        return None
    # the survey offset OSM -> DataSF (newb_prep's matched pairs)
    MX = np.load(f'{W}/newbuildings/matches.npy'); MT = shapely.STRtree([Point(m[0], m[1]) for m in MX])
    def offset_at(x, y):
        k = MT.query(Point(x, y).buffer(150.0))
        if len(k) < 5: return 0.0, 0.0
        d = np.median(MX[k, 2:4], axis=0); return round(float(d[0]), 2), round(float(d[1]), 2)
    # streets (front walls)
    RD = []
    for el in json.load(open(f'{W}/life/roads_osm.json'))['elements']:
        hw = el.get('tags', {}).get('highway', '')
        if hw.startswith('motorway') or hw.startswith('trunk') or not el.get('geometry'): continue
        pts = [proj(p['lon'], p['lat']) for p in el['geometry']]
        if len(pts) >= 2: RD.append(LineString(pts))
    RT = shapely.STRtree(RD)

    # ── permits and parcels
    C = list(csv.DictReader(open(f'{D}/permits_completed_since_2022.csv')))
    A = list(csv.DictReader(open(f'{D}/permits_active.csv')))
    PAR = json.load(open(f'{W}/fresh/parcels.json'))
    def parcel(bl):
        gs = [shape(r['shape']) for r in PAR.get(bl, []) if r.get('shape')]
        if not gs: return None
        g = unary_union(gs)
        g = shapely.ops.transform(lambda x, y, z=None: proj(np.asarray(x), np.asarray(y)), g)
        return g if g.is_valid else g.buffer(0)
    pts = [proj(float(r['lon']), float(r['lat'])) for r in C + A if r['lat']]
    # ── OSM outlines near any permit (raw WGS84 frame)
    near = shapely.STRtree([Point(p) for p in pts])
    osm = []
    for pre in ('b', 'p'):
        for key, el in load(pre).items():
            bd = el.get('bounds')
            if bd:
                c = proj((bd['minlon'] + bd['maxlon']) / 2, (bd['minlat'] + bd['maxlat']) / 2)
                if not len(near.query(Point(c).buffer(250.0))): continue
            t = el['tags']; bt = t.get('building', t.get('building:part', 'yes'))
            if pre == 'b' and (bt in SKIP_TYPES and bt != 'construction'): continue
            if t.get('location') in ('underground',) or t.get('layer', '0').startswith('-'): continue
            g = rings_of(el)
            if g is None or g.is_empty or g.area < 12.0: continue
            osm.append(dict(key=f"{el['type'][0]}{el['id']}", part=pre == 'p', g=g, t=t, bt=bt))
    OB = [o for o in osm if not o['part']]; OPt = [o for o in osm if o['part']]
    OBT = shapely.STRtree([o['g'] for o in OB]); OPT = shapely.STRtree([o['g'] for o in OPt]) if OPt else None
    print('osm near permits', len(OB), 'parts', len(OPt), flush=True)
    stamp = sorted({json.load(open(f))['osm3s']['timestamp_osm_base'] for f in
                    __import__('glob').glob(f'{W}/newbuildings/osm/b_*.json')})

    def iou(a, b):
        i = a.intersection(b).area; return i / (a.area + b.area - i) if i > 0 else 0.0

    def datasf_on(g, frac=0.35):
        """DataSF records (index) a footprint g (DataSF frame) covers >= frac of"""
        out = []
        for j in DT.query(g):
            a = DP[j].intersection(g).area
            if a > 0 and (a >= frac * DA[j] or a >= 0.5 * g.area): out.append((int(j), a))
        return out

    def osm_h(o):
        t = o['t']; h = num(t.get('height')); lv = num(t.get('building:levels'))
        if h and h > 0 and not (lv and h / lv > 7.0): return h, lv, 'osm height'
        ph = [num(q['t'].get('height')) for q in (OPt[j] for j in (OPT.query(o['g']) if OPT is not None else []))
              if q['g'].intersection(o['g']).area > 0.8 * q['g'].area]
        ph = [x for x in ph if x]
        if ph: return max(ph), lv, 'osm parts'
        return None, lv, None

    # ── 1. NEW BUILDINGS
    recs = []; supers = {}; log = collections.Counter(); per = []
    seen_osm = {}; redated = set()
    demol_by_bl = collections.defaultdict(list)
    for r in C:
        if r['category'] == 'demolition' and r['completed_date']: demol_by_bl[r['blocklot']].append(fyear(r['completed_date']))
    for r in C:
        if r['category'] != 'new construction': continue
        info = dict(permit=r['permit_number'], addr=r['name_or_address'], blocklot=r['blocklot'], major=r['major'])
        per.append(info)
        if not r['lat']: info['result'] = 'no coordinates'; log['nc no coordinates'] += 1; continue
        px, py = proj(float(r['lon']), float(r['lat'])); P = Point(px, py)
        st = fnum(r['proposed_stories']); units = fnum(r['proposed_units']) or 0
        st = int(st) if st else None
        big = r['major'] == 'Y' and ((st or 0) >= 4 or units >= 10 or (fnum(r['cost_usd']) or 0) >= 1.5e7)
        par = parcel(r['blocklot'])
        # the outlines: the one at the point, else on the parcel
        cand = [OB[j] for j in OBT.query(P.buffer(15.0))]
        at = [o for o in cand if o['g'].contains(P)]
        onp = [o for o in (OB[j] for j in OBT.query(par)) if o['g'].intersection(par).area >= 0.6 * o['g'].area] if par is not None and par.area < 40000 else []
        def newness(o):   # how little of it DataSF already has (an outline DataSF lacks is new)
            dx, dy = offset_at(o['g'].centroid.x, o['g'].centroid.y); gd = shapely.affinity.translate(o['g'], dx, dy)
            return 1.0 - max([iou(gd, DP[j]) for j in DT.query(gd)] or [0.0])
        yr = fyear(r['completed_date'])
        def fits(o):
            """an outline that can be this permit's building: its OSM storeys agree
            (30%) and OSM does not date it years before the permit's completion"""
            lv = num(o['t'].get('building:levels')); y0, _ = year_of(o['t'])
            if y0 and y0 < yr - 3: return False
            return not (st and lv and abs(lv / st - 1) > 0.3)
        allc = list({o['key']: o for o in at + onp}.values())
        NW = {o['key']: newness(o) for o in allc}
        sel = []
        if big:
            # every outline on the lot that DataSF lacks and that fits (a project's
            # several wings); none: the one at the point, if it fits
            sel = [o for o in allc if o['g'].area >= 60 and NW[o['key']] > 0.5 and fits(o)]
            if not sel: sel = [o for o in at if fits(o)][:1]
        else:
            new_ = [o for o in allc if NW[o['key']] > 0.5 and fits(o)]
            if new_: sel = [min(new_, key=lambda o: o['g'].distance(P))]
            elif at: sel = [o for o in at if fits(o)][:1]
            elif cand:
                o = min(cand, key=lambda o: o['g'].distance(P))
                if o['g'].distance(P) < 6.0 and fits(o): sel = [o]
        fsrc = 'osm'
        if not sel:
            if big and par is not None and 80 < par.area < 12000:
                sel = [dict(key=f"parcel:{r['blocklot']}", part=False, g=par.buffer(-0.5), t={}, bt='parcel')]; fsrc = 'parcel'
            else:
                info['result'] = 'no footprint (OSM or parcel)'; log['nc unresolved: no footprint'] += 1; continue
        yr = fyear(r['completed_date'])
        # the old building came down with the lot's demolition, else at the permit's issue
        dem = [y for y in demol_by_bl.get(r['blocklot'], []) if y <= yr]
        until = min(dem) if dem else (fyear(r['issued_date']) or yr)
        made = []
        for k, o in enumerate(sel):
            if o['key'] in seen_osm:           # two permits on one outline: once
                made.append(seen_osm[o['key']]); continue
            g = o['g']; c = g.representative_point()
            dx, dy = offset_at(c.x, c.y); gd = shapely.affinity.translate(g, dx, dy)
            lm = landmark_of(gd)
            on = datasf_on(gd)
            if lm or any(DB[j]['gid'] in LMG for j, a in on):
                info.setdefault('landmark', []).append(lm or 'lm gid'); log['nc on a landmark site (left to it)'] += 1; continue
            hosm, lv, hs = osm_h(o)
            ty0 = TY.get(o['bt'])
            st_ = st if (st and (len(sel) == 1 or not lv)) else (int(lv) if lv else st)
            ty = use_of(r['description'], units, st_, ty0)
            hp = h_of_storeys(st_, ty) if st_ else None
            if hosm and (hp is None or abs(hosm / hp - 1) < 0.35): h, h_src = hosm, hs
            elif hp: h, h_src = hp, 'permit storeys' if st_ == st else 'osm levels'
            elif hosm: h, h_src = hosm, hs
            else:
                h, h_src = (h_of_storeys(2, ty), 'default 2 storeys')
            # DataSF already has it (its 2017 refinement caught the new building)
            best = max(on, key=lambda ja: ja[1], default=None)
            if best is not None and iou(gd, DP[best[0]]) > 0.8 and 0.75 <= DB[best[0]]['h'] / h <= 1.35:
                info.setdefault('already', []).append(DB[best[0]]['gid']); log['nc already in DataSF'] += 1
                seen_osm[o['key']] = None; continue
            nb_on = [int(i) for i in NBT.query(gd) if NBP[i].intersection(gd).area >= 0.35 * NBP[i].area]
            # NEWB already draws this very outline (its parts, its measured
            # height): keep its records and only date them (the 2019 convention
            # becomes the permit's completion year)
            same = [i for i in nb_on if NB[i].get('osm') == o['key']]
            if same and 0.7 <= max(NB[i]['h'] for i in same) / h <= 1.45:
                for i in same:
                    rec = dict(NB[i], year=int(yr), src='fresh', redated=True, from_year=yr, permit=r['permit_number'],
                               addr=r['name_or_address'], completed=r['completed_date'], footprint_src='osm (newb record)')
                    if rec['st'] >= 4: rec['places'] = {'roof': 'flat'}
                    recs.append(rec); made.append(rec['gid']); redated.add(int(rec['gid']))
                seen_osm[o['key']] = rec['gid']
                for x in NB_REPL.values():
                    if x['by'] == o['key']:
                        supers[int(x['gid'])] = dict(gid=int(x['gid']), until=until, by=r['permit_number'], kind='datasf', h_old=x['h'])
                log['nc newb record dated'] += 1
                continue
            for pc_i, pc in enumerate(pieces(gd)):
                ring = ring_of(pc)
                if not ring: continue
                gid = gid_fresh(o['key'], pc_i)
                cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
                stc = st_ or max(1, round(h / 3.3))
                rec = dict(gid=gid, ring=ring, cx=round(cx, 2), cy=round(cy, 2), h=round(h, 2), year=int(yr),
                           use=USE.get(ty, 'mixed or not stated'), st=int(stc), ty=ty, shop=bool(re.search(r'retail|commercial|ground floor', r['description'], re.I)) and stc >= 3,
                           roles=None, paint=PAINT[(gid * 2654435761) % len(PAINT)] if PAINT else 16,
                           src='fresh', osm=o['key'] if fsrc == 'osm' else None, footprint_src=fsrc, h_src=h_src,
                           permit=r['permit_number'], addr=r['name_or_address'], completed=r['completed_date'], from_year=yr,
                           name=o['t'].get('name'), shift=[dx, dy])
                if stc >= 4 or (abs(pc.area) > 600 and stc >= 3): rec['places'] = {'roof': 'flat'}
                recs.append(rec); made.append(gid)
            seen_osm[o['key']] = gid
            for j, a in on:
                g_ = DB[j]['gid']
                if g_ not in supers or supers[g_]['until'] > until:
                    supers[g_] = dict(gid=g_, until=until, by=r['permit_number'], kind='datasf', h_old=DB[j]['h'])
            for i in nb_on:
                g_ = int(NB[i]['gid'])
                supers.setdefault(g_, dict(gid=g_, until=until, by=r['permit_number'], kind='newb', h_old=NB[i]['h']))
        made = [m for m in made if m]
        if made:
            info['result'] = 'replaced' if any(s['by'] == r['permit_number'] for s in supers.values()) else 'added'
            info['gids'] = made; info['footprint_src'] = fsrc
            log[f"nc {info['result']} ({fsrc})"] += 1
        elif 'already' in info: info['result'] = 'already in DataSF'
        elif 'landmark' in info: info['result'] = 'landmark site'
        else: info['result'] = 'duplicate outline of another permit'; log['nc duplicate outline'] += 1
    print('new', len(recs), 'records', dict(log), flush=True)

    # ── 3. ACTIVE CONSTRUCTION: the site and what is drawn on it (grouped by lot)
    act = collections.OrderedDict()
    for r in A:
        k = r['blocklot'] or r['permit_number']
        act.setdefault(k, []).append(r)
    sites = []
    act_pts = []
    for k, rows in act.items():
        rows.sort(key=lambda r: -(fnum(r['proposed_stories']) or 0))
        r = rows[0]
        if not r['lat']: continue
        px, py = proj(float(r['lon']), float(r['lat'])); P = Point(px, py); act_pts.append((P, k))
        par = parcel(r['blocklot'])
        con = [OB[j] for j in OBT.query(P.buffer(10.0)) if OB[j]['bt'] == 'construction' or 'construction' in OB[j]['t']]
        con = [o for o in con if o['g'].distance(P) < 10.0]
        if con: g = unary_union([o['g'] for o in con]); ssrc = 'osm building=construction'
        elif par is not None and par.area < 60000: g = par; ssrc = 'parcel'
        else: g = P.buffer(15.0, quad_segs=2); ssrc = 'point (30 m square)'
        dx, dy = offset_at(px, py); gd = shapely.affinity.translate(g, dx, dy)
        polys = [q for q in (gd.geoms if hasattr(gd, 'geoms') else [gd]) if isinstance(q, Polygon)]
        on = [DB[j]['gid'] for j in DT.query(gd) if DP[j].intersection(gd).area >= 0.5 * DA[j]]
        sts = [fnum(x['proposed_stories']) for x in rows if fnum(x['proposed_stories'])]
        sites.append(dict(id=k, name=r['name_or_address'], blocklot=r['blocklot'], lat=float(r['lat']), lon=float(r['lon']),
                          site=[ring_of(q) for q in polys if ring_of(q)], site_src=ssrc, shift=[dx, dy],
                          target_storeys=int(max(sts)) if sts else None,
                          proposed_units=max([fnum(x['proposed_units']) or 0 for x in rows]) or None,
                          status=r['pipeline_status'] or r['dbi_status'], tier=r['tier'],
                          dates=dict(filed=r['filed_date'], issued=r['issued_date'], construction=r['first_construction_document_date'],
                                     last_activity=r['last_permit_activity_date']),
                          permits=[x['permit_number'] for x in rows], drawn_gids_on_site=on,
                          landmark_gids_on_site=[g_ for g_ in on if g_ in LMG], desc=r['description'][:200]))
    AT_ = shapely.STRtree([p for p, _ in act_pts]) if act_pts else None
    act_bl = {s['blocklot'] for s in sites}

    # ── 2. DEMOLITIONS
    dem = {}; dlog = collections.Counter(); fresh_bl = {p['blocklot'] for p in per if p.get('gids')}
    for r in C:
        if r['category'] != 'demolition' or not r['lat']: continue
        info = dict(permit=r['permit_number'], addr=r['name_or_address'], blocklot=r['blocklot'])
        if PARTIAL.search(r['description']) and not re.search(r'demolish (an? |the )?(existing )?(entire|whole|one|two|three|\d)', r['description'], re.I):
            dlog['demolition partial or accessory (kept)'] += 1; continue
        px, py = proj(float(r['lon']), float(r['lat'])); dx, dy = offset_at(px, py)
        Pd = Point(px + dx, py + dy)
        par = parcel(r['blocklot']); pard = shapely.affinity.translate(par, dx, dy) if par is not None else None
        on = [j for j in DT.query(Pd) if DP[j].contains(Pd)]
        if pard is not None and pard.area < 20000:
            onp = [j for j in DT.query(pard) if DP[j].intersection(pard).area >= 0.5 * DA[j]]
        else: onp = []
        cands = list(dict.fromkeys(on + onp))
        if not cands: dlog['demolition: nothing drawn on the lot'] += 1; continue
        ex_st = fnum(r['existing_stories'])
        garage = re.search(r'garage|carport|shed|accessory', r['description'], re.I) and not re.search(r'dwelling|residen|house|building', r['description'], re.I)
        if garage: j = min(cands, key=lambda j: DA[j])
        elif on and DA[on[0]] >= 25: j = on[0]
        else: j = max(cands, key=lambda j: DA[j])
        # a whole-lot clearance (a project's site): every main building on the lot
        pick = [j]
        if re.search(r'all (existing )?(buildings|structures)|(\d+|two|three|four) (buildings|structures)', r['description'], re.I):
            pick = [j_ for j_ in cands if DA[j_] >= 25]
        until = fyear(r['completed_date'])
        # lot now: a new building on it, a project under way, or empty
        if r['blocklot'] in fresh_bl: status = 'new building on the lot'
        elif r['blocklot'] in act_bl or (AT_ is not None and any(Pd.distance(act_pts[i][0]) < 25 for i in AT_.query(Pd.buffer(25)))): status = 'under construction'
        else: status = 'empty (demolition completed, no new building yet)'
        for j_ in pick:
            g_ = DB[j_]['gid']
            if g_ in LMG: dlog['demolition on a landmark footprint (left to it)'] += 1; continue
            if g_ in supers:
                dlog['demolition: already superseded by a new building'] += 1
                supers[g_]['until'] = min(supers[g_]['until'], until); continue
            if g_ in dem: continue
            dem[g_] = dict(gid=g_, until=until, permit=r['permit_number'], addr=r['name_or_address'], status=status,
                           h_old=DB[j_]['h'], st_old=DB[j_]['st'], existing_stories=ex_st)
            dlog['demolition removed: ' + status] += 1
    print('demolitions', dict(dlog), flush=True)

    # ── roles of the new records (party / front / back), against what stands today
    gone = (set(supers) | set(dem)) - redated
    keep = [q for q, b in zip(DP, DB) if b['gid'] not in gone] + [p for p, r_ in zip(NBP, NB) if int(r_['gid']) not in gone]
    NP = [Polygon(r['ring']) for r in recs]
    ALLP = keep + NP; AT = shapely.STRtree(ALLP); nD = len(keep)
    for ri, r_ in enumerate(recs):
        if r_.get('redated'): continue
        ring = r_['ring']; n = len(ring); roles = []
        for i in range(n):
            (ax, ay), (bx, by) = ring[i], ring[(i + 1) % n]
            L_ = math.hypot(bx - ax, by - ay) or 1e-9
            tx, ty_ = (bx - ax) / L_, (by - ay) / L_
            mx, my = (ax + bx) / 2, (ay + by) / 2
            nx, ny = ty_, -tx
            if NP[ri].contains(Point(mx + nx * 0.3, my + ny * 0.3)): nx, ny = -nx, -ny
            pp = Point(mx + nx * 0.8, my + ny * 0.8)
            if any(ALLP[j].contains(pp) for j in AT.query(pp) if j != nD + ri): roles.append(2); continue
            probe = LineString([(mx - r_['shift'][0] + nx * 1.0, my - r_['shift'][1] + ny * 1.0),
                                (mx - r_['shift'][0] + nx * 25.0, my - r_['shift'][1] + ny * 25.0)])
            roles.append(1 if any(RD[j].intersects(probe) for j in RT.query(probe)) else 0)
        r_['roles'] = roles
    gs = collections.Counter(r_['gid'] for r_ in recs); assert max(gs.values()) == 1, 'gid collision'
    recs.sort(key=lambda r_: r_['gid'])

    nc = [p for p in per]
    meta = dict(built=datetime.datetime.now().isoformat(timespec='seconds'),
                sources=dict(permits='SF DBI building permits + SF Planning Development Pipeline (decisions/README.md), completed 2022-01-01 or later',
                             footprints='OpenStreetMap buildings (ODbL, (c) OpenStreetMap contributors), Overpass extract of ' + ', '.join(stamp),
                             parcels='DataSF Parcels - Active and Retired (acdm-wktn)', datasf='DataSF building footprints (2010 model, refined 2017), via the published chunks'),
                attribution='Building footprints (c) OpenStreetMap contributors, ODbL 1.0; permits and parcels: City and County of San Francisco (DataSF)',
                era_rule="record shown when ERA >= year (completion year); a superseded/demolished gid is hidden when ERA >= until",
                counts=dict(new_construction_permits=len(nc), new_log=dict(log), demolition_log=dict(dlog),
                            records=len(recs), superseded=len(supers), superseded_datasf=sum(1 for s in supers.values() if s['kind'] == 'datasf'),
                            superseded_newb=sum(1 for s in supers.values() if s['kind'] == 'newb'), newb_redated=len(redated), demolished=len(dem), active_sites=len(sites)))
    json.dump(dict(meta=meta, records=recs, supersedes=sorted(supers.values(), key=lambda s: s['gid']),
                   demolished=sorted(dem.values(), key=lambda s: s['gid']), newb_redated=sorted(redated), permits=per), open(OUT, 'w'))
    json.dump(dict(meta=dict(built=meta['built'], sources=meta['sources'], attribution=meta['attribution'],
                             note='one entry per lot (several permits merged); site rings on DataSF frame (shift applied), from OSM building=construction, else the DataSF parcel, else a 30 m square at the point. drawn_gids_on_site: the records drawn today on the site (>= 50% inside). Not drawn yet (no cranes): a later visual step.'),
                   sites=sites), open(OUT_A, 'w'))
    print('wrote', OUT, len(recs), 'records;', len(supers), 'superseded;', len(dem), 'demolished;', OUT_A, len(sites), 'sites', flush=True)


if __name__ == '__main__':
    main()
