"""bridge_dates.py (V-ERAS 05/10): the dates of today's bridge decks (landmarks/bridges.json, bridges_city.py) for the era scenes.
In:  landmarks/bridges.json (172 decks, all y0 0 = undated), eras/c1/osm_bridge_tags.json (Overpass 'out tags' of their OSM ways, ODbL,
     05/10: no way carries start_date), eras/c1/wd_bridges.json (Wikidata wbgetentities of the bridges' wikidata ids, CC0).
Out: eras/bridge_dates.json {k: {y0, y1, kind, src}} + 'default'; era.py (_other_city, era_py.bridges + era_py.bridge_dates from
     assets/eras.env.json) gives each deck its y0, so a past year draws only the decks standing then.
Rules: SOURCED = the bridge's Wikidata opening date (P1619; inception P571 when P1619 has no month), matched by the way's own wikidata tag, its name
or its bridge:name; CONVENTION = a named approach / ramp / causeway takes its bridge's year; every other deck (no date anywhere):
y0 2025.0 = drawn today only (CONVENTION, conservative: an era never draws a deck nobody dated).
Not drawn: the bridges these replaced (2nd Granville 1909-1954, 1st Cambie 1912-1985, 1st Second Narrows 1925-1960...): no geometry."""
import json, re, os
W = '/Users/daniel/code/qipu-render-work/cities/vancouver'
B = json.load(open(f'{W}/landmarks/bridges.json'))
TAGS = {e['id']: e.get('tags', {}) for e in json.load(open(f'{W}/eras/c1/osm_bridge_tags.json'))['elements']}
WD = json.load(open(f'{W}/eras/c1/wd_bridges.json'))['entities']


def wd_date(q):
    c = WD[q]['claims']; t = None
    for p in ('P1619', 'P571'):   # the opening date; inception when the opening date has no month (Oak Street: P1619 '1957-00-00')
        if c.get(p): t = c[p][0]['mainsnak']['datavalue']['value']['time']
        if t and t[6:8] != '00': break
    y, m, d = (int(v) for v in re.match(r'\+(\d{4})-(\d{2})-(\d{2})', t).groups())
    return round(y + (max(m, 1) - 1) / 12 + (max(d, 1) - 1) / 365, 3), f"Wikidata {q} '{WD[q]['labels']['en']['value']}' {p} {t[1:11]}"


NAME_WD = {'Burrard Street Bridge': 'Q919808', 'Lions Gate Bridge': 'Q124352', 'Granville Bridge': 'Q1543294', 'Oak Street Bridge': 'Q2008430',
           'Ironworkers Memorial Second Narrows Crossing': 'Q1477359', 'Arthur Laing Bridge': 'Q710283', 'Cambie Street Bridge': 'Q278084',
           'North Arm Bridge Bikeway': 'Q7053967'}
# CONVENTION: approaches named after their bridge's street take the bridge's year
TIE = {'Stanley Park Causeway': 'Q124352', 'Cambie Street Ramp': 'Q278084', 'Knight Street': 'Q6422284', 'Granville Street': 'Q1543294',
       'Howe Street': 'Q1543294', 'Grant McConachie Way': 'Q710283'}
out = {}
for b in B:
    wid = int(re.search(r'OSM way (\d+)', b['src']).group(1)); t = TAGS.get(wid, {})
    nm = t.get('name') or (re.search(r'\([^,;]*, ([^;]*);', b['src']) or [None, None])[1]
    q = t.get('wikidata') or t.get('bridge:wikidata') or NAME_WD.get(t.get('bridge:name')) or NAME_WD.get(nm)
    if q in WD:
        y0, s = wd_date(q); out[b['k']] = dict(y0=y0, y1=9999.0, kind='SOURCED', name=nm, src=f'OSM way {wid} ({nm}); opened: {s}')
    elif TIE.get(nm) in WD:
        y0, s = wd_date(TIE[nm]); out[b['k']] = dict(y0=y0, y1=9999.0, kind='CONVENTION', name=nm,
                                                      src=f'OSM way {wid} ({nm}): approach / ramp of the bridge, its year: {s}')
    else:
        out[b['k']] = dict(y0=2025.0, y1=9999.0, kind='CONVENTION', name=nm, src=f'OSM way {wid} ({nm or t.get("highway")}): no date in OSM or Wikidata: today only')
json.dump(dict(note=__doc__.split('\n')[0], default=dict(y0=2025.0, y1=9999.0, kind='CONVENTION', src='a deck not listed here: today only'),
               decks=out), open(f'{W}/eras/bridge_dates.json', 'w'), indent=0)
from collections import Counter
print(len(out), 'decks;', Counter((v['name'] if v['y0'] < 2025 else 'today only', v['y0'], v['kind']) for v in out.values()).most_common())
