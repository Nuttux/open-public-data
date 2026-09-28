#!/usr/bin/env python3
"""pipeline/bt_build.py - builds THE BUILDING TABLE (single source of truth, BAR 28/09 19:10 (1)) from today's scattered sources.
Schema: pipeline/BT_SCHEMA.md (+ bt_schema.json). Reader: pipeline/bt_read.py. Output: SQLite on the SD card (default
/Volumes/DANI-SD-DRIVE2/pipeline/bt/sf_bt.sqlite).

  python3 bt_build.py [--areas pilot,mission] [--out DB]

Sources (every value keeps value + confidence + source + date):
  datasf    city bundle .qc (city_data.buildings with NEWB=0 FRESH=0 PLACES_OV=0): footprint (integer m), h (LiDAR hgt_mediancm + sub-metre
            residual), year (assessor year_property_built), use, storeys, facade type, shop, roles, roof paint (Esri aerial)
  osm       newb_records.json (OSM buildings DataSF lacks + the DataSF records they replace, from their year), incl. landmark sites (lm)
  fresh     qipu-render-work/fresh/fresh_records.json (DBI permits since 2022: new buildings, supersedes, demolitions)
  places    qipu-render-work/places/overrides.json (hand-sourced per-building corrections, today only; 'why' kept)
  faithful  faithful/out/fa_table_v3.json (North Beach) + faithful/areas/<a>/out/fa_table_v3.json (Mission), + provenance.json:
            facade / trim / roof / reference colours, material, style, storeys read, garage, bays, shape flags; arcs (DataSF curves + LiDAR)
  lidar     bk_massing.json (roof massing parts measured by the LiDAR: assets_buildings/tools/lidar_parts.py)
  landmark  heroes.json 'b' + landmarks/skip_gids.json (footprints a hand-built landmark replaces, from its year)
  era_fix   era.RECORD_YEAR_FIX (year corrections for era renders)
"""
import os, sys, json, time, sqlite3, hashlib, argparse, math, glob
BL = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, BL)
RW = '/Users/daniel/code/qipu-render-work'; CITY = '/Users/daniel/code/opd-render/website/public/data/us/sf/city'
DEF_DB = '/Volumes/DANI-SD-DRIVE2/pipeline/bt/sf_bt.sqlite'
BUILDER = 'bt_build-1'


def pilot_box(i0=16, i1=27, j0=8, j1=15, pad=150):
    """world metre box of the AI pilot's L9 frames f_z9_i_j (ai/pilot/renders) = rc_common.frame_world(PZ=9) union, + pad (oblique view)"""
    CA = math.cos(math.radians(30)); SA = 0.42; KX = math.sqrt(2) * CA; KY = math.sqrt(2) * SA
    cx, cy = 241.427019126574, 707.0567508859249; scale = 2 ** (round(math.log2(0.06898352692062097) * 24) / 24)
    f = 2 ** (9 - 3); SZ = scale * f; PCW, PCH = round(2560 * f), round(1536 * f); FW, FH = 5120, 3072
    x0 = (cx + (i0 * FW / 2 - PCW / 4) / SZ) / KX; x1 = (cx + ((i1 + 1) * FW / 2 - PCW / 4) / SZ) / KX
    y1 = (cy - (j0 * FH / 2 - PCH / 4) / SZ) / KY; y0 = (cy - ((j1 + 1) * FH / 2 - PCH / 4) / SZ) / KY
    return (round(x0 - pad), round(y0 - pad), round(x1 + pad), round(y1 + pad))


AREAS = {'city': (-20000, -20000, 20000, 20000), 'pilot': pilot_box(), 'mission': (1232, -312, 1584, 45), 'northbeach': (2130, 4008, 3168, 5143)}
FAITHFUL = {'northbeach': f'{RW}/faithful/out', 'mission': f'{RW}/faithful/areas/mission/out'}

SOURCES = {   # src -> (publisher, dataset, what, licence, retrieved)
    'datasf_fp': ('DataSF', 'ynuv-fyni', 'building footprints (integer world m in the city bundle)', 'PDDL (DataSF open data)', '2026-08'),
    'datasf_lidar': ('DataSF', 'ynuv-fyni', 'hgt_mediancm, median LiDAR return over the footprint (+ sub-metre residual)', 'PDDL', '2026-08'),
    'assessor': ('DataSF', 'wv5m-vpq2', 'assessor roll: year_property_built, use, number_of_stories, property_class_code', 'PDDL', '2026-08'),
    'esri_aerial': ('Esri World Imagery', 'z18 tiles', 'median roof colour inside the footprint, 32-entry palette', 'Esri terms (derived value)', '2026-08-23'),
    'osm': ('OpenStreetMap', 'Overpass extracts 2026-06..09', 'buildings DataSF lacks (newb_prep.py) + fields inferred from neighbours', 'ODbL', '2026-09-24'),
    'fresh': ('SF DBI + SF Planning', 'permits / Development Pipeline', 'buildings completed since 2022, supersedes, demolitions (fresh_prep.py)', 'PDDL + ODbL (OSM outline)', '2026-09-25'),
    'places': ('qipu places agent', 'places/overrides.json', 'hand-sourced per-building corrections (why = the source)', 'mixed, see why', '2026-09'),
    'faithful_photo': ('Mapillary / KartaView street photos', 'faithful v2/v3', 'colours measured on street photos, reader votes', 'CC BY-SA (Mapillary)', '2026-09-28'),
    'faithful_vlm': ('qipu faithful agent', 'VLM reader on street photos', 'typology / storeys / bays / shape read on photos', 'derived', '2026-09-28'),
    'faithful_roof': ('SF Planning ortho 8 cm / NAIP', 'roof_ngs / rn_sf8', 'roof colour measured from above', 'public domain / SF terms', '2026-09-28'),
    'datasf_curves': ('DataSF + USGS LiDAR', 'curved footprint edges + LiDAR bulge', 'arcs of rounded bays / turrets / corners (v3/shape_fp.py, shape_lidar.py)', 'PDDL / public domain', '2026-09-28'),
    'lidar_parts': ('USGS', 'CA_SanFrancisco_1_B23', 'roof massing parts (lidar_parts.py)', 'public domain', '2026-09'),
    'landmark': ('qipu landmarks', 'heroes.json + landmarks/skip_gids.json', 'footprint replaced by a hand-built landmark model', 'derived', '2026-09'),
    'era_fix': ('qipu eras', 'era.RECORD_YEAR_FIX', 'record years that cannot be right, corrected for era renders', 'sourced in era.py', '2026-09'),
    'convention': ('qipu', '-', 'a convention (no source)', '-', '-'),
}
# confidence by source kind (0..1; BT_SCHEMA.md): measured > registry > photo-read > inferred > convention
CONF = dict(datasf_fp=0.9, datasf_lidar=0.9, assessor=0.75, esri_aerial=0.7, osm=0.6, osm_neighbours=0.3, fresh=0.85, places=0.95,
            faithful_photo=0.7, faithful_name=0.45, faithful_vlm=0.55, faithful_roof=0.8, datasf_curves=0.85, lidar_parts=0.8, landmark=0.95,
            era_fix=0.8, convention=0.1)


def palette():
    return json.load(open(f'{CITY}/manifest.json'))['buildings']['palette']


def schema(c):
    c.executescript("""
    create table meta(k text primary key, v text);
    create table sources(src text primary key, publisher text, dataset text, what text, licence text, retrieved text);
    create table buildings(bid integer primary key, origin text, area text, cx real, cy real, minx real, miny real, maxx real, maxy real,
      ring text, roles text, raw text, ord real, year_built real, year_built_src text, year_demolished real, year_demolished_src text, demolished_by text, rev text);
    create table attrs(bid integer, attr text, value text, conf real, src text, date text, note text, primary key(bid, attr, src));
    create table geoms(bid integer, kind text, idx integer, geom text, conf real, src text, date text);
    create index attrs_attr on attrs(attr); create index geoms_bid on geoms(bid);
    create index b_cx on buildings(cx, cy); create index b_ord on buildings(ord);""")
    try: c.execute('create virtual table bt_rt using rtree(id, minx, maxx, miny, maxy)'); return True
    except sqlite3.OperationalError: return False


def main(o):
    t0 = time.time(); areas = {a: AREAS[a] for a in o.areas.split(',')}
    inarea = lambda x, y: next((a for a, (x0, y0, x1, y1) in areas.items() if x0 <= x <= x1 and y0 <= y <= y1), None)
    tmp = o.out + '.tmp'
    if os.path.exists(tmp): os.remove(tmp)
    os.makedirs(os.path.dirname(o.out), exist_ok=True)
    c = sqlite3.connect(tmp); rt = schema(c); PAL = palette()
    for k, v in SOURCES.items(): c.execute('insert into sources values(?,?,?,?,?,?)', (k, *v))
    B = {}; A = []; G = []   # bid -> building row dict; attr rows; geom rows
    def attr(bid, a, v, src, date=None, conf=None, note=None):
        if v is None: return
        A.append((bid, a, json.dumps(v), CONF.get(src, 0.5) if conf is None else conf, src, date or SOURCES.get(src, ('',) * 5)[4], note))
    def add_building(r, origin, area, ord_):
        ring = [(float(x), float(y)) for x, y in r['ring']]; xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        B[r['gid']] = dict(bid=r['gid'], origin=origin, area=area, cx=r['cx'], cy=r['cy'], minx=min(xs), miny=min(ys), maxx=max(xs), maxy=max(ys),
                           ring=ring, roles=r.get('roles'), raw={k: v for k, v in r.items() if k not in ('ring', 'roles')}, ord=ord_,
                           year_built=None, year_built_src=None, year_demolished=None, year_demolished_src=None, demolished_by=None)
    # 1. DataSF (the city bundle), raw: no OSM / fresh / places merged
    os.environ.update(NEWB='0', FRESH='0', PLACES_OV='0', SOUTH='0'); os.environ.pop('ERA', None)
    import city_data
    ORD = {r['gid']: i for i, r in enumerate(city_data.buildings(-20000, -20000, 20000, 20000))}   # city_data's own order (cells, index): records() keeps it
    for a, box in areas.items():
        for r in city_data.buildings(*box):
            if r['gid'] in B: continue
            add_building(r, 'datasf', a, ORD[r['gid']]); g = r['gid']
            attr(g, 'footprint', 'ring', 'datasf_fp', note='integer world m (bundle quantisation)')
            attr(g, 'h', round(r['h'], 3), 'datasf_lidar'); attr(g, 'st', r['st'], 'assessor'); attr(g, 'use', r['use'], 'assessor')
            attr(g, 'ty', r['ty'], 'assessor'); attr(g, 'shop', r['shop'], 'assessor')
            attr(g, 'roof_col_aerial', PAL[r['paint']] if 0 <= r['paint'] < len(PAL) else None, 'esri_aerial', note=f"palette index {r['paint']}")
            attr(g, 'paint', r['paint'], 'esri_aerial')
            if r['year'] is not None: attr(g, 'year_built', r['year'], 'assessor')
    # 2. OSM (newb): records + landmark-site records; replaces -> demolished years of DataSF records
    nbp = next(p for p in (f'{BL}/newb_records.json', f'{RW}/newbuildings/osm_records.json') if os.path.exists(p))
    NB = json.load(open(nbp)); nbd = time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(nbp)))
    for i, r in enumerate(NB['records'] + NB.get('lm_records', [])):
        a = inarea(r['cx'], r['cy'])
        if not a or r['gid'] in B: continue
        add_building(r, 'osm', a, 1e7 + i); g = r['gid']
        attr(g, 'footprint', 'ring', 'osm', nbd); attr(g, 'osm_id', r.get('osm'), 'osm', nbd)
        for k, sk in (('h', 'h_src'), ('year_built', 'year_src'), ('ty', 'ty_src')):
            v = r.get('year' if k == 'year_built' else k)
            attr(g, k, v, 'osm_neighbours' if r.get(sk) == 'neighbours' else 'osm', nbd, note=r.get(sk))
        attr(g, 'st', r.get('st'), 'osm_neighbours' if r.get('h_src') == 'neighbours' else 'osm', nbd); attr(g, 'use', r.get('use'), 'osm', nbd)
        attr(g, 'shop', r.get('shop'), 'osm', nbd); attr(g, 'paint', r.get('paint'), 'osm_neighbours', nbd); attr(g, 'name', r.get('name'), 'osm', nbd)
        if r.get('lm'): attr(g, 'landmark_site', r['lm'], 'osm', nbd, note='gives way when the landmark is modelled')
    for x in NB.get('replaces', []) + NB.get('lm_replaces', []):
        b = B.get(int(x['gid']))
        if b and (b['year_demolished'] is None or x['year'] < b['year_demolished']):
            b.update(year_demolished=x['year'], year_demolished_src='osm', demolished_by=f"osm {x.get('by')}" + (f" (landmark {x['lm']})" if x.get('lm') else ''))
            attr(b['bid'], 'year_demolished', x['year'], 'osm', nbd, note=f"replaced by OSM {x.get('by')}" + (f" landmark {x['lm']}" if x.get('lm') else ''))
            if x.get('lm'): attr(b['bid'], 'replaced_for_landmark', x['lm'], 'osm', nbd)
    # 2b. beyond the county line (SOUTH, ground_prep.py south_records: generic OSM buildings of Daly City / Colma / Brisbane)
    sp = city_data.SOUTH_FILE; spd = time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(sp)))
    for i, r in enumerate(json.load(open(sp))['records']):
        a = inarea(r['cx'], r['cy'])
        if not a or r['gid'] in B: continue
        add_building(r, 'south', a, 2e7 + i); g = r['gid']
        attr(g, 'footprint', 'ring', 'osm', spd); attr(g, 'h', r.get('h'), 'osm_neighbours', spd); attr(g, 'year_built', r.get('year'), 'osm_neighbours', spd)
    # 3. fresh (permits since 2022)
    fp = f'{RW}/fresh/fresh_records.json'; FR = json.load(open(fp)); frd = FR['meta'].get('built', '')[:10]
    for i, r in enumerate(FR['records']):
        a = inarea(r['cx'], r['cy'])
        if not a or (r['gid'] in B and B[r['gid']]['origin'] != 'osm'): continue
        add_building(r, 'fresh', a, 3e7 + i); g = r['gid']   # an OSM-added record that is a permit's building (newb_redated): the fresh record wins, OSM attrs stay candidates
        attr(g, 'footprint', 'ring', 'fresh', frd, note=r.get('footprint_src')); attr(g, 'h', r.get('h'), 'fresh', frd, note=r.get('h_src'))
        attr(g, 'st', r.get('st'), 'fresh', frd); attr(g, 'use', r.get('use'), 'fresh', frd); attr(g, 'ty', r.get('ty'), 'fresh', frd)
        attr(g, 'year_built', r.get('year'), 'fresh', frd, note=f"permit {r.get('permit')}"); attr(g, 'permit', r.get('permit'), 'fresh', frd)
        attr(g, 'address', r.get('addr'), 'fresh', frd); attr(g, 'osm_id', r.get('osm'), 'fresh', frd); attr(g, 'paint', r.get('paint'), 'fresh', frd)
    for x in FR['supersedes'] + FR['demolished']:
        b = B.get(int(x['gid']))
        if not b: continue
        note = f"superseded by permit {x['by']}" if 'by' in x else f"demolished, permit {x.get('permit')} ({x.get('status', '')})"
        b.update(year_demolished=x['until'], year_demolished_src='fresh', demolished_by=note)
        attr(b['bid'], 'year_demolished', x['until'], 'fresh', frd, note=note)
    for g in FR.get('newb_redated', []):
        if g in B: attr(g, 'fresh_redated', True, 'fresh', frd, note='an OSM-added record that is a permit building: dated by the permit')
    # 4. places overrides (today only)
    OV = json.load(open(f'{RW}/places/overrides.json')); ovd = time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(f'{RW}/places/overrides.json')))
    for i, r in enumerate(OV.get('add', [])):
        a = inarea(r['cx'], r['cy'])
        if a and r['gid'] not in B:
            add_building(r, 'places_add', a, 4e7 + i); attr(r['gid'], 'footprint', 'ring', 'places', ovd, note=r.get('why'))
            for k in ('h', 'st', 'ty', 'use'): attr(r['gid'], k, r.get(k), 'places', ovd, note=r.get('why'))
            attr(r['gid'], 'year_built', r.get('year'), 'places', ovd, note=r.get('why'))
    for gs, o_ in OV.get('gids', {}).items():
        g = int(gs)
        if g not in B: continue
        why = o_.get('why')
        for k, v in o_.items():
            if k in ('why',): continue
            if k == 'ring': G.append((g, 'footprint_places', 0, json.dumps({'ring': v, 'roles': o_.get('roles')}), CONF['places'], 'places', ovd)); continue
            if k == 'roles': continue
            attr(g, {'year': 'year_built'}.get(k, k if k in ('h', 'st', 'ty', 'use', 'shop', 'skip') else 'ov_' + k), v, 'places', ovd, note=why)
    # 5. faithful tables (+ provenance -> confidence)
    for fa, d in FAITHFUL.items():
        T = json.load(open(f'{d}/fa_table_v3.json')); PV = json.load(open(f'{d}/provenance.json')) if os.path.exists(f'{d}/provenance.json') else {}
        fd = time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(f'{d}/fa_table_v3.json')))
        for gs, e in T.items():
            g = int(gs)
            if g not in B: continue
            src = ' '.join(PV.get(gs, {}).get('src', []))
            col_src = 'faithful_photo' if 'colour:photo' in src or 'measured' in src else ('faithful_name' if 'colour' in src else 'faithful_photo')
            attr(g, 'facade_col', e.get('facade_col'), col_src, fd, note=src[:200] or None); attr(g, 'trim_col', e.get('trim_col'), col_src, fd)
            attr(g, 'ref_col', e.get('ref_col'), 'faithful_photo', fd, note='raw photo measure (pass check reference)')
            attr(g, 'roof_col', e.get('roof_col'), 'faithful_roof', fd)
            attr(g, 'mat', e.get('mat'), 'faithful_vlm', fd); attr(g, 'style', e.get('style'), 'faithful_vlm', fd)
            attr(g, 'st', e.get('st'), 'faithful_vlm', fd, note='storeys read on street photos'); attr(g, 'garage', e.get('garage'), 'faithful_vlm', fd)
            attr(g, 'bays', e.get('bays'), 'faithful_vlm', fd); attr(g, 'bay_kind', e.get('bay_kind'), 'faithful_vlm', fd)
            if e.get('shape'): attr(g, 'shape', e['shape'], 'faithful_vlm', fd)
            if e.get('fw'): G.append((g, 'front_walls', 0, json.dumps(e['fw']), CONF['faithful_photo'], 'faithful_photo', fd))
            for i, arc in enumerate(e.get('arcs') or []): G.append((g, 'arc', i, json.dumps(arc), CONF['datasf_curves'], 'datasf_curves', fd))
            photos = PV.get(gs, {}).get('photos')
            if photos: attr(g, 'photos', photos[:12], 'faithful_photo', fd, note='Mapillary (m…) / panorama (p…) ids')
    # 6. LiDAR massing parts, landmarks, era year fixes
    MS = json.load(open(f'{BL}/bk_massing.json'))
    for gs, e in MS.items():
        g = int(gs)
        if g in B:
            for i, p in enumerate(e.get('parts', [])): G.append((g, 'massing_part', i, json.dumps(p), CONF['lidar_parts'], 'lidar_parts', '2026-09'))
    H = json.load(open(f'{CITY}/base/heroes.json'))['heroes']
    for h in H:
        if isinstance(h.get('b'), (int, float)) and int(h['b']) in B: attr(int(h['b']), 'landmark', h['k'], 'landmark', note=f"hero, year {h.get('y')}")
    SK = json.load(open(f'{RW}/landmarks/skip_gids.json'))
    for lm, gids in SK.get('all_by_landmark', SK.get('by_landmark', {})).items():
        for g in gids:
            if g in B: attr(g, 'landmark_skip', lm, 'landmark', note=f"replaced by the {lm} model from {SK.get('all_built', SK.get('built', {})).get(lm)}")
    import era
    for g, y in era.RECORD_YEAR_FIX.items():
        if g in B: attr(g, 'year_built', y, 'era_fix', note='era renders only (9999 = never stood)')
    # 7. core year columns (chosen with the 'best' profile) + rev hash
    import bt_read
    byb = {}
    for r in A: byb.setdefault(r[0], []).append(r)
    for g, b in B.items():
        rows = byb.get(g, [])
        yb = bt_read.choose([dict(value=json.loads(r[2]), conf=r[3], src=r[4]) for r in rows if r[1] == 'year_built'], 'year_built')
        if yb: b['year_built'], b['year_built_src'] = yb['value'], yb['src']
    Gb = {}
    for x in G: Gb.setdefault(x[0], []).append(x[1:5])
    # ground elevation at the centroid (DataSF DEM 6d73-6c4f, lm_dem): the oblique map projects z, so tile look-ups need it
    import lm_dem, numpy as np
    ids = list(B); z = lm_dem.sample_arr([B[g]['cx'] for g in ids], [B[g]['cy'] for g in ids])
    SOURCES_DEM = 'dem'
    c.execute('insert into sources values(?,?,?,?,?,?)', ('dem', 'DataSF', '6d73-6c4f', 'elevation (3DEP-derived), lm_dem 2 m', 'PDDL', '2026-08'))
    for g, v in zip(ids, z):
        if np.isfinite(v): A.append((g, 'z0', json.dumps(round(float(v), 2)), 0.85, 'dem', '2026-08', 'ground elevation at the centroid (m)'))
    byb = {}
    for r in A: byb.setdefault(r[0], []).append(r)
    for g, b in B.items():
        b['rev'] = hashlib.sha1(json.dumps([b['ring'], sorted((r[1], r[2], r[4]) for r in byb.get(g, [])), b['year_demolished'],
                                            sorted(Gb.get(g, []))], sort_keys=True, default=str).encode()).hexdigest()[:16]
    c.executemany('insert into buildings values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                  [(b['bid'], b['origin'], b['area'], b['cx'], b['cy'], b['minx'], b['miny'], b['maxx'], b['maxy'], json.dumps(b['ring']), json.dumps(b['roles']),
                    json.dumps(b['raw']), b['ord'], b['year_built'], b['year_built_src'], b['year_demolished'], b['year_demolished_src'], b['demolished_by'], b['rev']) for b in B.values()])
    c.executemany('insert or replace into attrs values(?,?,?,?,?,?,?)', A)
    c.executemany('insert into geoms values(?,?,?,?,?,?,?)', G)
    if rt: c.executemany('insert into bt_rt values(?,?,?,?,?)', [(b['bid'], b['minx'], b['maxx'], b['miny'], b['maxy']) for b in B.values()])
    ins = {os.path.basename(p): hashlib.sha1(open(p, 'rb').read()).hexdigest()[:12] for p in
           [nbp, fp, f'{RW}/places/overrides.json', f'{BL}/bk_massing.json', f'{CITY}/base/heroes.json', f'{RW}/landmarks/skip_gids.json']
           + [f'{d}/fa_table_v3.json' for d in FAITHFUL.values()]}
    for k, v in dict(builder=BUILDER, built=time.strftime('%Y-%m-%d %H:%M'), areas=json.dumps(areas), inputs=json.dumps(ins),
                     city_bundle=CITY, n_buildings=str(len(B)), n_attrs=str(len(A)), n_geoms=str(len(G)), schema='BT_SCHEMA.md v1').items():
        c.execute('insert into meta values(?,?)', (k, v))
    c.commit(); c.close(); os.replace(tmp, o.out)
    from collections import Counter
    print(f'{o.out}: {len(B)} buildings {dict(Counter(b["origin"] for b in B.values()))}, {len(A)} attrs, {len(G)} geoms, '
          f'{os.path.getsize(o.out) / 1e6:.1f} MB, {time.time() - t0:.0f} s; areas {areas}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--areas', default='city'); ap.add_argument('--out', default=DEF_DB)
    main(ap.parse_args())
