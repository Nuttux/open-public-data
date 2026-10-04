"""C1 dry run (CPU, no Blender): what era.py would put in the va1 scene for each key year -> eras/c1/manifest_<Y>.json + one summary.
CITY=vancouver; mathutils stubbed on scipy (c1/stub). Counts inside the area box: today's records standing (record_years 'from' <= Y,
'until' > Y), records REMOVED as new-since (from > Y), records gone by their demolition date, era.infill stand-ins (a later record on a
lot the photo or the neighbours say was built), lost buildings (eras/lost_buildings.geojson), structures, rail segments, topo sheet."""
import os, sys, json, collections
os.environ['CITY'] = 'vancouver'
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, f'{D}/stub')
import common as c
import era as E
KEYS = [1950, 1967, 1972, 1982]
recs = c.records(0); allr = c.records(300)
E.fix_records(allr, 1950)
summary = {}
for Y in KEYS:
    t = E.when(Y)
    rr = [dict(b) for b in allr]; E.fix_records(rr, Y)
    inbox = [b for b in rr if c.in_box(b['cx'], b['cy'])]
    stand = [b for b in inbox if b['year'] <= t and not (b.get('until') and t >= b['until'])]
    new = [b for b in inbox if b['year'] > t]
    gone = [b for b in inbox if b.get('until') and t >= b['until'] and b['year'] <= t]
    placed = {b['gid'] for b in rr if b['year'] <= t and not (b.get('until') and t >= b['until'])}
    inf = [b for b in E.infill(rr, Y, placed) if c.in_box(b['cx'], b['cy'])]
    lost = [b for b in E.sanborn_records(Y) if c.in_box(b['cx'], b['cy'])]
    st = [s['k'] for s in E.structures(t)]
    ra = E.rails(t)
    srcd = sum(1 for b in stand if str(b.get('from_src', '')).startswith('sourced'))
    m = dict(year=Y, moment=t, topo_sheet=E.topo_sheet(Y), records_standing=len(stand), records_standing_sourced_year=srcd,
             new_since_removed=len(new), gone_by_demolition=len(gone), infill_standins=len(inf), lost_buildings=len(lost),
             lost_by_kind=dict(collections.Counter(b['ty'] for b in lost)), hogans_alley_houses=sum(1 for b in lost if 1969 < b['gone_by'] <= 1970.0),
             structures=st, rail_segments=len(ra), rail_kinds=dict(collections.Counter(r[4] for r in ra)),
             new_since_gids=sorted(b['gid'] for b in new), lost_ids=sorted(b['sanborn'] for b in lost), standin_gids=sorted(b['gid'] for b in inf))
    json.dump(m, open(f'{c.OUT}/manifest_{Y}.json', 'w'))
    summary[Y] = {k: v for k, v in m.items() if not k.endswith('ids') and not k.endswith('gids')}
    print(Y, summary[Y], flush=True)
summary['today'] = dict(records=len(recs))
json.dump(summary, open(f'{c.OUT}/manifest_summary.json', 'w'), indent=1)
