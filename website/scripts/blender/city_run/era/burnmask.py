"""era_auto burnmask.py: the 1906 burned district (DataSF ff3a-iqhv rings, the same base/coast.qc burnLen / burnXY that era.burned reads, even-odd)
as a bool raster on the area's core grid (QC, L9 px), projected like the renders (cloud/viewer/realref.js forward, ground z from dem20).
burn_core() -> (H, W) bool, cached in WQ/burn_core.npy. Run as a script to write a check overlay: python3 burnmask.py <render.jpg (core grid)> <out.jpg>"""
import os, sys, json, math, numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
for _p in EC.BURN_SNAPS:
    if os.path.exists(_p + '/qc.py'): sys.path.insert(0, _p); break   # (03/10) a cloud box may carry only one snapshot: the first one that has the qc reader
import qc   # read-only import (the qc reader)
A = json.load(open(os.environ['ERA_AREA'])); QC = A['QC']; WQ = A['WQ']
CITY = EC.BURN_ENGINE; VW = '/Users/daniel/code/qipu-render-work/cloud/viewer'
CA = math.cos(math.pi / 6); SA = 0.42; KX = math.sqrt(2) * CA; KY = math.sqrt(2) * SA; ZT = math.sqrt(2 * (CA * CA - SA * SA))
CX, CY = EC.VIEW_CX, EC.VIEW_CY; SZ = 2 ** (round(math.log2(EC.VIEW_Z) * 24) / 24) * 64; PCW, PCH = 2560 * 64, 1536 * 64
def _dem():
    m = json.load(open(f'{VW}/dem20.json')); z = np.fromfile(f'{VW}/dem20.bin', dtype=np.int16).reshape(m['ny'], m['nx']) / 10.0; return m, z
def burn_core():
    f = f'{WQ}burn_core.npy'
    if os.path.exists(f): return np.load(f)
    _, d = qc.read(f'{CITY}/base/coast.qc'); L = [int(v) for v in d['burnLen']]; XY = np.asarray(d['burnXY'], float).reshape(-1, 2)
    m, Z = _dem(); H, W = QC[3] - QC[1], QC[2] - QC[0]; M = np.zeros((H, W), np.uint8); k = 0
    for n in L:
        r = XY[k:k + n]; k += n
        c = np.clip(((r[:, 0] - m['x0']) / m['step']).astype(int), 0, m['nx'] - 1); rr = np.clip(((r[:, 1] - m['y0']) / m['step']).astype(int), 0, m['ny'] - 1)
        z = np.maximum(0, Z[rr, c])
        gx = 2 * ((r[:, 0] * KX - CX) * SZ + PCW / 4) - QC[0]; gy = 2 * ((CY - (r[:, 1] * KY + z * ZT)) * SZ + PCH / 4) - QC[1]
        R = np.zeros_like(M); cv2.fillPoly(R, [np.round(np.stack([gx, gy], 1)).astype(np.int32)], 1); M ^= R
    M = M.astype(bool); os.makedirs(WQ, exist_ok=True); np.save(f, M); return M
if __name__ == '__main__':
    from PIL import Image; Image.MAX_IMAGE_PIXELS = None
    M = burn_core(); print('BURN core px share %.3f' % M.mean())
    im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).copy()
    cs, _ = cv2.findContours(M.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE); cv2.drawContours(im, cs, -1, (255, 0, 255), 12)
    Image.fromarray(im).resize((im.shape[1] // 8, im.shape[0] // 8)).save(sys.argv[2], quality=85)
