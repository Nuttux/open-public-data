"""prep_wh.py: warehouse jobs for the sc block (FIX5 defect 3). One job per flat-roof candidate (wh/cand.json): mask = render roof class (green) of that building, base = painted tile + render pasted in the mask
(so the colour lock follows the render's flat grey roof). Output lmk/jobs/wh_NN/{base.png,mask.png,job.json}."""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None
from lib import tiles
H = os.path.dirname(os.path.abspath(__file__)); B = '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/work_ct_sc/blk'; OX, OY = 75264, 53760
cand = [c for c in json.load(open(f'{H}/wh/cand.json')) if c['area'] >= int(os.environ.get('MINA', '150000'))]
cand.sort(key=lambda c: (c['y0'], c['x0']))
P8 = ("Turn this into a crisp, sharp real aerial photograph at clear midday in Vancouver, British Columbia. The pale grey 3D models are flat-roofed light industrial warehouses: flat grey membrane roofs with low parapets, "
      "rooftop air-handling units, vents and skylights, loading docks and concrete tilt-up walls. No pitched roofs, no ridges, no hips, no shingles. Strict edit: keep the exact outline, size, height and position of every building, keep every street, tree, car and the ground exactly where they are, same framing and camera. Do not add any new building or object, and do not write any text.")
P9 = ("Turn image 1, a soft aerial photograph, into a crisp, sharp, highly detailed real aerial photograph with exactly the geometry of image 2, a 3D render of the same place: every building stands exactly there. "
      "The pale grey buildings are flat-roofed light industrial warehouses: flat grey membrane roofs with low parapets, rooftop units, vents and skylights, loading docks and concrete tilt-up walls; no pitched roofs, no ridges, no hips, no shingles. Keep every street, tree, car and the ground exactly as in image 2. Do not add any new building or object, and do not write any text.")
names = []
CLS = np.asarray(Image.open(f'{B}/R.class.png')); RJ = np.asarray(Image.open(f'{B}/R.jpg')); print('loaded', flush=True)
for n, c in enumerate(cand):
    cx, cy = (c['x0'] + c['x1']) // 2, (c['y0'] + c['y1']) // 2; sz = max(2048, (max(c['x1'] - c['x0'], c['y1'] - c['y0']) + 700) // 64 * 64)
    box = [cx - sz // 2, cy - sz // 2, cx - sz // 2 + sz, cy - sz // 2 + sz]
    cl = CLS[box[1] - OY:box[3] - OY, box[0] - OX:box[2] - OX]
    roof = (cl[..., 1] > 200) & (cl[..., 0] < 80) & (cl[..., 2] < 80); roof = nd.binary_closing(roof, iterations=4); lab, k = nd.label(roof)
    sub = np.zeros_like(roof); sub[c['y0'] - box[1]:c['y1'] - box[1], c['x0'] - box[0]:c['x1'] - box[0]] = True
    ids = np.unique(lab[sub & roof]); ids = ids[ids > 0]
    # keep the roof components whose area mostly lies in the candidate bbox (the building itself + its attached roof pieces)
    m = np.zeros_like(roof)
    for i in ids:
        mm = lab == i
        if (mm & sub).sum() > 0.6 * mm.sum(): m |= mm
    m = nd.binary_fill_holes(m)
    if m.sum() < 50000: continue
    base = tiles(*box); ren = RJ[box[1] - OY:box[3] - OY, box[0] - OX:box[2] - OX]
    a = np.asarray(base).copy(); pm = nd.binary_dilation(m, iterations=3); a[pm] = ren[pm]
    nm = f'wh_{n:02d}'; d = f'{H}/jobs/{nm}'; os.makedirs(d, exist_ok=True)
    Image.fromarray(a).save(f'{d}/base.png'); Image.fromarray((m * 255).astype(np.uint8)).save(f'{d}/mask.png')
    json.dump(dict(name=nm, canvas=box, subject='flat-roofed light industrial warehouses', seed=11, p8=P8, p9=P9, lockbase=True, pad=4, rim=3, order=3), open(f'{d}/job.json', 'w'))
    names.append(nm); print(nm, box, int(m.sum()), flush=True)
json.dump(names, open(f'{H}/wh/jobs.json', 'w'))
