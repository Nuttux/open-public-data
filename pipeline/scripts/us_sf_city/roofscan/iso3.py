"""Does filling the ground actually change the picture? Four panels."""
import os, json, math
import numpy as np
from PIL import Image
from iso import fields, CELL
from iso2 import render, PAL_TIGHT, PAL_WIDE

HERE = os.path.dirname(os.path.abspath(__file__))

def with_ground(A, ID, area, src_bb, next_id):
    """paint the extracted ground objects into the height field"""
    G = json.load(open(os.path.join(HERE, "ground.json")))[area]
    ny, nx = A.shape
    jj, ii = np.mgrid[0:ny, 0:nx]
    CX = src_bb[0] + (ii+0.5)*CELL; CY = src_bb[1] + (jj+0.5)*CELL
    A2, ID2 = A.copy(), ID.copy()
    k = next_id
    for o in G:
        hw, hd = o["w"]/2, o["d"]/2
        m = (CX>=o["mx"]-hw)&(CX<=o["mx"]+hw)&(CY>=o["my"]-hd)&(CY<=o["my"]+hd)
        if not m.any(): continue
        if o["kind"] == "canopy":
            # a crown, not a box: fall off from the centre
            r = np.hypot((CX-o["mx"])/max(hw,0.3), (CY-o["my"])/max(hd,0.3))
            z = o["top"] * np.clip(1.15 - 0.85*r*r, 0, 1)
            sel = m & (z > 0.3)
            np.maximum.at(A2, np.where(sel), z[sel])
            ID2[sel] = k
        else:
            np.maximum.at(A2, np.where(m), np.float32(o["top"]))
            ID2[m] = k
        k += 1
    return A2, ID2

if __name__ == "__main__":
    from extract import AreaSource
    for area, zp in (("sunset", 4.2), ("downtown", 1.0)):
        B, A, ID = fields(area)
        n = min(B.shape); B, A, ID = B[:n,:n], A[:n,:n], ID[:n,:n]
        src = AreaSource(area, CELL)
        AG, IDG = with_ground(A, ID, area, src.bb, int(ID.max())+1)
        panels = [
            render(B,  ID,  zpx=zp, pal=PAL_TIGHT, lights=False),   # today
            render(A,  ID,  zpx=zp, pal=PAL_WIDE,  lights=True),    # + roofs, lit
            render(AG, IDG, zpx=zp, pal=PAL_WIDE,  lights=True),    # + ground
        ]
        h = max(p.height for p in panels); w = sum(p.width for p in panels)+24
        out = Image.new("RGB", (w, h), (28,31,36))
        x = 0
        for p in panels:
            out.paste(p, (x, h-p.height)); x += p.width+12
        out.save(os.path.join(HERE, f"{area}_ground.png"))
        print(f"{area}: wrote {area}_ground.png {out.size}")
