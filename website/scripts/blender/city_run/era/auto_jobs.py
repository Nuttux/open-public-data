"""auto_jobs.py <area.json> <out_jobs_prefix> <years,comma> [pods]: render jobs for an area's key years from the v8 job template.
Crops: the z9 5120 x 3072 frames covering the area's render box RA (the core + 1024 rows of context above); BORDER = the covered part.
Era kit: ERA=<Y>; KEY_TODAY=1 for Y >= 1970 (unchanged buildings keep today's look); cars ON with the era's own fleet/occupancy
(KERB_OCC and LOT_CARS left to the era tables: 'no anachronism', not 'no cars')."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
A = json.load(open(sys.argv[1])); pre = sys.argv[2]; years = [int(y) for y in sys.argv[3].split(',')]; npods = int(sys.argv[4]) if len(sys.argv) > 4 else 4
L_ = [l.split() for l in open(A['template']).read().split('\n') if l.strip()]
strip = lambda T: [t for t in T[3:] if not t.startswith(('ERA=', 'KERB_OCC=', 'LOT_CARS=', 'KEY_TODAY='))]
TB = strip(next(T for T in L_ if T[0][-6:-5] == 'b' or 'b_' in T[0][:7])); TP = strip(next(T for T in L_ if 'p_' in T[0][:7]))
RA = A['RA']; FW, FH = 5120, 3072; jobs = []
for Y in years:
    for i in range(RA[0] // FW, math.ceil(RA[2] / FW)):
        for j in range(RA[1] // FH, math.ceil(RA[3] / FH)):
            x0 = max(0, (RA[0] - i * FW) / FW); x1 = min(1, (RA[2] - i * FW) / FW); ya = max(0, (RA[1] - j * FH) / FH); yb = min(1, (RA[3] - j * FH) / FH)
            b = f'{x0:.4g},{x1:.4g},{1 - yb:.4g},{1 - ya:.4g}'     # BORDER y counts from the frame's bottom (as the templates: 0,1,0,0.6667 = top rows cut)
            kit = [f'ERA={Y}'] + (['KEY_TODAY=1'] if Y >= EC.KEY_TODAY_FROM or os.environ.get('KT_ALL') == '1' else []) + os.environ.get('EXTRA', '').split()
            for kind in ('b', 'p'):
                jobs.append(f"{A['tag']}{Y}{kind}_{i}_{j} {i}:{j} {b} " + ' '.join((TB if kind == 'b' else TP) + kit))
jb = [j for j in jobs if j.split()[0][-5:-4] == 'b' or 'b_' in j.split()[0][-8:]]; jobs = sorted(jobs, key=lambda j: ('p_' in j.split()[0]))
for k in range(npods): open(f'{pre}_{k}.txt', 'w').write('\n'.join(jobs[k::npods]) + '\n')
print(len(jobs), 'jobs on', npods, 'pods')
