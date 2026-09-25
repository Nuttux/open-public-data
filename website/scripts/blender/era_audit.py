"""era_audit.py [x0,y0,x1,y1]: every dated object of the eras (era.py, era_lost.py) with the moment it appears and goes,
and the source of each; FLAGS any appearance or removal that falls exactly on a map edition's boundary or survey year, or
on a cut-off year, without a dated event (a change the data's windows made, not the city). Exit 1 when anything is flagged.
Run with plain python3 (no Blender). Optional box (world metres) to list only what stands in it."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import era as EA, era_lost as EL
BOX = [float(v) for v in sys.argv[1].split(',')] if len(sys.argv) > 1 else None
inb = lambda x, y: BOX is None or (BOX[0] <= x <= BOX[2] and BOX[1] <= y <= BOX[3])
# CUT: a window's edge or a cut-off year (a change the code's windows made: never acceptable without a dated event);
# SURVEY: an edition's own survey year (the rule's fallback when nothing dates it: listed, to be dated)
SURVEY = set()
for n, sv, a, b in EA.TOPO24: SURVEY |= {float(sv), float(sv) + 0.99}
CUT = ({1906.0, 1925.0, 1930.0, 1986.0} | {float(a) for _, _, a, _ in EA.TOPO24} | {float(b + 1) for _, _, _, b in EA.TOPO24}) - SURVEY
rows, bad = [], 0
def row(kind, name, y0, y1, src0, src1, dated0, dated1):
    global bad
    f = []
    for w, y, d in (('appears', y0, dated0), ('goes', y1, dated1)):
        if d or y is None: continue
        if float(y) in CUT: f.append(f'CUT-OFF: {w} at {y:g}, a window edge with no dated event')
        elif float(y) in SURVEY: f.append(f'undated: {w} at {y:g}, its edition\'s own survey year')
    bad += any(t.startswith('CUT') for t in f); rows.append((kind, name, y0, y1, src0, src1, '; '.join(f)))
for name, e0, e1, y0, y1, s1, dated, (cx, cy), dated0 in EA.pier_identities():
    if not inb(cx, cy): continue
    row('lost pier', name or f'pier at ({cx:.0f}, {cy:.0f})', y0, y1, f'first drawn on {e0}', s1, dated0, dated)
for st in EA.STRUCTURES:
    if BOX and not any(inb(x, y) for x, y in st['path']): continue
    row('structure', st['k'], st['y0'], st['y1'], 'era.py SOURCED', 'era.py SOURCED' + (f", demolition {st['dem'][0]:g}-{st['dem'][1]:g}" if st.get('dem') else ''), True, True)
for e in EL.LOST:
    c = e['form'].get('c', (0, 0))
    if not inb(*c): continue
    row('lost building', e['key'], e['y0'], e['y1'], 'era_lost.py SOURCED', 'era_lost.py SOURCED', True, True)
for k, st in EA.LANDMARK_SITES.items():
    row('landmark site', k, st['build'][0], st['build'][1], 'era.py LANDMARK_SITES', 'completion', True, True)
for k, y in EA.DATED_PIERS.items(): row("today's pier", k, y, None, 'era.DATED_PIERS', '', True, True)
w = max(len(r[1]) for r in rows) if rows else 10
for r in rows:
    print(f"{r[0]:14s} {r[1]:{w}s} {r[2] if r[2] is not None else '':>8} -> {r[3] if r[3] is not None else 'today':>8}  end: {r[5][:70]}" + (f'   FLAG: {r[6]}' if r[6] else ''))
print(f'{len(rows)} objects: {bad} on a cut-off (fix), {sum(1 for r in rows if "undated" in r[6])} at an edition\'s own date (to be dated)')
sys.exit(1 if bad else 0)
