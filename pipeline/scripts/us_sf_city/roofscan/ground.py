"""
WHAT IS STANDING BETWEEN THE BUILDINGS.

The same scan, filtered the other way: everything OUTSIDE a published footprint
and above the ground. Sheds, garden trees, hedges, parked cars — a third of the
frame that the map currently draws as flat olive.

The published street-tree register holds 125,234 trees and the renderer already
draws them well, but it is a STREET tree register: private garden trees are not
in it, and in the Sunset they are most of the greenery.
"""
import os, json, math
import numpy as np
from scipy.ndimage import label, find_objects, binary_dilation, uniform_filter
from matplotlib.path import Path as MPath
from pyproj import Transformer
from extract import AreaSource

HERE = os.path.dirname(os.path.abspath(__file__))
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753
INV = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

MIN_H, MAX_H = 0.7, 22.0      # above the kerb, below a building
MIN_A = 0.9                    # m2 — smaller than this is noise


def objects(area, cell=0.35):
    src = AreaSource(area, cell)
    H = src.h
    ny, nx = H.shape
    bb = src.bb
    jj, ii = np.mgrid[0:ny, 0:nx]
    CX = bb[0] + (ii+0.5)*cell; CY = bb[1] + (jj+0.5)*cell
    lo, la = INV.transform(CX.ravel(), CY.ravel())
    WX = ((lo-LON0)*MPD*COSL).reshape(ny, nx); WY = ((la-LAT0)*MPD).reshape(ny, nx)

    # mask out every published footprint, generously — a wall lean or a
    # half-metre of registration error must not become a "shed"
    FP = json.load(open(os.path.join(HERE, "footprints.json")))[area]
    inb = np.zeros((ny, nx), bool)
    for f in FP:
        rx = np.asarray(f["rx"], float); ry = np.asarray(f["ry"], float)
        sub = (WX>=rx.min()-2)&(WX<=rx.max()+2)&(WY>=ry.min()-2)&(WY<=ry.max()+2)
        if not sub.any(): continue
        idx = np.where(sub)
        ins = MPath(np.c_[rx, ry]).contains_points(np.c_[WX[idx], WY[idx]])
        inb[idx[0][ins], idx[1][ins]] = True
    inb = binary_dilation(inb, np.ones((7, 7), bool))     # ~1.2 m skirt

    cand = np.isfinite(H) & (~inb) & (H > MIN_H) & (H < MAX_H)
    lab, n = label(cand)
    cell_a = cell*cell
    # a canopy is rough on top; a shed, a car and a hedge are not
    rough = np.abs(H - uniform_filter(np.nan_to_num(H), 5))
    out = []
    for li, sl in enumerate(find_objects(lab), start=1):
        if sl is None: continue
        comp = lab[sl] == li
        area_m2 = float(comp.sum()*cell_a)
        if area_m2 < MIN_A: continue
        hh = H[sl][comp]
        top = float(np.percentile(hh, 92))
        w = float((sl[1].stop-sl[1].start)*cell); d = float((sl[0].stop-sl[0].start)*cell)
        elong = max(w, d) / max(0.35, min(w, d))
        rgh = float(np.median(rough[sl][comp]))
        fill = area_m2 / max(0.01, w*d)
        if rgh > 0.32 and top > 2.5:         kind = "canopy"
        elif top < 2.1 and elong > 2.2:      kind = "hedge"
        elif top < 2.3 and 4.0 < area_m2 < 22 and fill > 0.55: kind = "car"
        elif top < 4.5:                      kind = "shed"
        else:                                kind = "canopy"
        out.append({"kind": kind, "w": round(w,2), "d": round(d,2), "top": round(top,2),
                    "area": round(area_m2,1),
                    "mx": round(float(bb[0]+(sl[1].start+(sl[1].stop-sl[1].start)/2)*cell),2),
                    "my": round(float(bb[1]+(sl[0].start+(sl[0].stop-sl[0].start)/2)*cell),2)})
    return src, out


if __name__ == "__main__":
    allo = {}
    for area in ("sunset", "downtown"):
        src, o = objects(area)
        allo[area] = o
        by = {}
        for x in o: by[x["kind"]] = by.get(x["kind"], 0) + 1
        cover = sum(x["area"] for x in o)
        side = (src.bb[2]-src.bb[0])
        print(f"\n=== {area} ===")
        print(f"  {len(o)} objects outside the footprints, covering {cover:.0f} m2")
        for k in sorted(by, key=lambda k:-by[k]):
            ar = np.median([x['area'] for x in o if x['kind']==k])
            hh = np.median([x['top']  for x in o if x['kind']==k])
            print(f"    {k:<8} {by[k]:>5}   median {ar:>5.1f} m2, {hh:>4.1f} m tall")
    json.dump(allo, open(os.path.join(HERE, "ground.json"), "w"))
    print("\nwrote ground.json")
