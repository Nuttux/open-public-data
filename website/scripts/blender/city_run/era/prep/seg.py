# seg.py (qhprep): assemble one segment (Ya, Yb) of key years for the engine: seg/<Ya>_<Yb>/in: prisms_w.pkl (slot '1985' = Ya,
# '2026' = Yb), Cc_1985 / Cc_2026, O.json, years.json, seg.json (moments); work/E/R_1985.npy / R_2026.npy (symlinks to years/<Y>/R.npy)
# usage: python3 seg.py <Ya> <Yb>
import sys, os, json, pickle, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as CM
a, b = int(sys.argv[1]), int(sys.argv[2]); S = CM.WQ + f'seg/{a}_{b}/'
for d in ('in', 'work/E', 'in_half'): os.makedirs(S + d, exist_ok=True)
A = pickle.load(open(CM.YD + f'{a}/prisms.pkl', 'rb')); B = pickle.load(open(CM.YD + f'{b}/prisms.pkl', 'rb'))
pickle.dump(dict(prisms={'1985': A['prisms'], '2026': B['prisms']}, wbox=B['wbox'], canvas=B['canvas'], years=(a, b)), open(S + 'in/prisms_w.pkl', 'wb'))
for sl, Y in (('1985', a), ('2026', b)):
    shutil.copyfile(CM.YD + f'{Y}/Cc.npy', S + f'in/Cc_{sl}.npy')
    l = S + f'work/E/R_{sl}.npy'
    if os.path.lexists(l): os.remove(l)
    os.symlink(CM.YD + f'{Y}/R.npy', l)
json.dump(dict(ox=CM.O[0], oy=CM.O[1], W=CM.W, H=CM.H, note='L9 global x,y of the qh core top-left'), open(S + 'in/O.json', 'w'))
json.dump([a, b], open(S + 'in/years.json', 'w'))
json.dump(dict(Ya=a, Yb=b, Y0=CM.moment(a), Y1=CM.moment(b), fire=CM.FIRE), open(S + 'in/seg.json', 'w'))
print('segment', a, b, 'moments %.3f -> %.3f' % (CM.moment(a), CM.moment(b)), S)
