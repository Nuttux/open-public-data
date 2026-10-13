"""prep.py <job>...: lmk/jobs/<job>/{base.png (painted tile crop, render pasted inside the mask), mask.png (L, 255 = landmark), job.json}.
Masks: code-4 comps of the render class map inside given boxes (closed), or a polygon in L9 px (POLY)."""
import sys, json, os
from lib import *
from scipy import ndimage as nd
from PIL import ImageDraw
H = os.environ.get('LMK_HOME', '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk')   # patches / jobs / out live on the SSD, not in git; J = json.load(open(f'{H}/jobs.json'))

def class_c4(box):
    x0, y0, x1, y1 = box
    a = np.asarray(blk('R.class.png', x0, y0, x1, y1))
    return (a[..., 0] > 128) & (a[..., 1] <= 128) & (a[..., 2] <= 128), (a[..., 2] > 128) & (a[..., 0] <= 128) & (a[..., 1] <= 128)

def build(name):
    j = J[name]; cx0, cy0, cx1, cy1 = j['canvas']; W, Hh = cx1 - cx0, cy1 - cy0
    m = np.zeros((Hh, W), bool)
    for b in j.get('c4', []):
        c4, _ = class_c4((cx0, cy0, cx1, cy1)); sub = np.zeros_like(c4); sub[b[1] - cy0:b[3] - cy0, b[0] - cx0:b[2] - cx0] = True
        m |= nd.binary_closing(c4 & sub, iterations=4)
    for poly in j.get('poly', []):
        im = Image.new('L', (W, Hh), 0); ImageDraw.Draw(im).polygon([(x - cx0, y - cy0) for x, y in poly], fill=255); m |= np.asarray(im) > 0
    for poly in j.get('cut', []):
        im = Image.new('L', (W, Hh), 0); ImageDraw.Draw(im).polygon([(x - cx0, y - cy0) for x, y in poly], fill=255); m &= ~(np.asarray(im) > 0)
    m = nd.binary_fill_holes(m)
    if j.get('up'):   # AI-invented cones/peaks standing above the render footprint (Canada Place): grow the mask upward by up px for x >= xmin
        up, xmin = j['up']; g = m.copy()
        for s_ in range(8, up + 1, 8): g[:-s_] |= m[s_:]
        g[:, :max(0, xmin - cx0)] = m[:, :max(0, xmin - cx0)]; E = g & ~m; m = g
        base0 = np.asarray(tiles(cx0, cy0, cx1, cy1)).copy(); ys_, xs_ = np.nonzero(E); sy = np.clip(ys_ - 300, 0, None); base0[ys_, xs_] = base0[sy, xs_]; wclone = base0   # clean sea over the painted pyramids
    if j.get('skirt'):   # the dock/rock under a deck edge: dilate, keep non-water render px (glass fronts painted under Canada Place's deck)
        _, wat = class_c4((cx0, cy0, cx1, cy1)); sk = nd.binary_dilation(m, iterations=j['skirt']) & ~wat; m = (sk & ~m) if j.get('only_skirt') else (m | sk)
    if j.get('xmin'): m[:, :max(0, j['xmin'] - cx0)] = False
    base = tiles(cx0, cy0, cx1, cy1); ren = blk('R.jpg', cx0, cy0, cx1, cy1)
    if j.get('up'): base = Image.fromarray(wclone)
    if j.get('paste', True):
        pm = nd.binary_dilation(m, iterations=3); a = np.asarray(base).copy()
        if j.get('up'): pm &= ~E   # (the cleaned sea stays)
        a[pm] = np.asarray(ren)[pm]; base = Image.fromarray(a)
    if j.get('fill'): a = np.asarray(base).copy(); a[m] = j['fill']; base = Image.fromarray(a)
    d = f'{H}/jobs/{name}'; os.makedirs(d, exist_ok=True); base.save(f'{d}/base.png'); Image.fromarray((m * 255).astype(np.uint8)).save(f'{d}/mask.png')
    json.dump(dict(name=name, canvas=j['canvas'], subject=j['subject'], seed=j.get('seed', 11), **{k: j[k] for k in ('k8', 's9', 'r9', 'p8', 'p9', 'lock', 'mode9', 'k9') if k in j}), open(f'{d}/job.json', 'w'))
    print(name, W, Hh, int(m.sum()))
if __name__ == '__main__':
    for n in (sys.argv[1:] or J): build(n)
