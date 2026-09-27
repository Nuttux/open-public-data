import sys, pickle, numpy as np
P = pickle.load(open(sys.argv[1], 'rb')); x0, y0, x1, y1 = map(int, sys.argv[2].split(','))
sl = (slice(y0, y1), slice(x0, x1)); n = (y1 - y0) * (x1 - x0)
A, B, AS = (P[k][sl].astype(int) for k in ('A', 'B', 'Astar'))
print('A*==B', (np.abs(AS - B).max(-1) == 0).mean().round(3), 'A*==A', (np.abs(AS - A).max(-1) == 0).mean().round(3))
for k in ('SB', 'SD', 'shd', 'gch', 'both'): print(k, P[k][sl].mean().round(3))
print('SWK', (P['SWK'][sl] > 0).mean().round(3))
ids, c = np.unique(P['MB'][sl], return_counts=True); o = np.argsort(-c)[:5]
for i, cc in zip(ids[o], c[o]):
    b = P['PB'][i] if i >= 0 else None
    print(' MB', i, b and (b['key'], b['kind'], round(b['h'])), round(cc / n, 3), 'static' if b and b['key'] in P['static'] else '')
for ob in P['objs']:
    fx0, fy0, fx1, fy1 = ob['box']
    if fx0 < x1 and fx1 > x0 and fy0 < y1 and fy1 > y0: print(' obj', ob['side'], ob['key'], ob['kind'], round(ob['h']), ob['box'], 'cont' if ob.get('cont') else '')
print('FB', P['FB'][sl].mean().round(3), 'FD', P['FD'][sl].mean().round(3), 'both&feet', (P['both'] & (P['FB'] | P['FD']))[sl].mean().round(3))
for ob in P['objs']:
    fx0, fy0, fx1, fy1 = ob['box']
    if fx0 < x1 and fx1 > x0 and fy0 < y1 and fy1 > y0:
        sp = np.zeros(P['SB'].shape, bool); sp[fy0:fy1, fx0:fx1] = ob['sprite']; ft = np.zeros_like(sp); ft[fy0:fy1, fx0:fx1] = ob['foot']
        print('  ', ob['key'], ob['side'], 'sprite in box', sp[sl].mean().round(3), 'foot in box', ft[sl].mean().round(3), 'h', round(ob['h']), 'zg', ob.get('zg'))
