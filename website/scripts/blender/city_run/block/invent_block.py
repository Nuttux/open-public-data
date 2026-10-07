"""invent_block.py (OPEN-GROUND step2 07/10): the 'invent' detector (invent_det.py) over every AI tile of a block, at half res (s=2:
kits 93 flags vs 105 at full res, same tiles' ranking). Tiles = ai_all/P.txt (the whole list), AI = <tiles dir>/<gx>_<gy>.jpg (default
city/tiles = the registry after autoreroll), render / class = blk/R.jpg, blk/R.class.png.
  python3 invent_block.py <block dir> [tiles dir] [out json]  -> prints 'INVENT <n flagged> / <n tiles>' and the flagged list; json
  {tile: score}. Exit 0 always (the caller gates on the count)."""
import os, sys, json
os.environ.setdefault('OPENCV_IO_MAX_IMAGE_PIXELS', str(4 * 10 ** 9))
import numpy as np, cv2
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, H)
import invent_det as I, tile_content as TC

def main(V, TD=None, out=None):
    TD = TD or f'{V}/city/tiles'; out = out or f'{V}/logs/invent_block.json'
    m = json.load(open(f'{V}/blk/meta.json')); OX, OY = m['ox'], m['oy']
    P = f'{V}/ai_all/P.txt' if os.path.exists(f'{V}/ai_all/P.txt') else f'{V}/ai/P.txt'
    T = [l.split()[0][3:].replace(',', '_') for l in open(P) if l.startswith('C9:')]
    R = cv2.imread(f'{V}/blk/R.jpg', cv2.IMREAD_REDUCED_COLOR_2)[..., ::-1]
    C = TC.codeof(cv2.imread(f'{V}/blk/R.class.png', cv2.IMREAD_COLOR)[::2, ::2, ::-1])
    sc = {}
    for t in T:
        f = f'{TD}/{t}.jpg'
        if not os.path.exists(f): continue
        gx, gy = map(int, t.split('_')); x, y = (gx - OX) // 2, (gy - OY) // 2
        o = cv2.imread(f, cv2.IMREAD_REDUCED_COLOR_2)[..., ::-1]; r = R[y:y + 512, x:x + 512]; c = C[y:y + 512, x:x + 512]
        if o.shape[:2] != r.shape[:2]: continue
        sc[t] = int(I.invent(o, r, c, s=2)[0])
    fl = sorted((t for t, v in sc.items() if v >= I.TH_INVENT), key=lambda t: -sc[t])
    json.dump(dict(scores=sc, flagged=fl, th=I.TH_INVENT), open(out, 'w'))
    print('INVENT', len(fl), '/', len(sc), ' '.join(f'{t}:{sc[t]}' for t in fl[:30]), flush=True)

if __name__ == '__main__':
    main(sys.argv[1], *(sys.argv[2:4]))
