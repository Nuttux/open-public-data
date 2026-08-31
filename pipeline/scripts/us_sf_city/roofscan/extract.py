"""
ROOF FEATURES PER FOOTPRINT, FROM THE SCAN.

Reads a height-above-ground field and one published footprint ring, and
answers three questions the record cannot:

  shape    is the roof flat or pitched, which way does the ridge run, how steep
  clutter  what is standing on it, and where
  massing  does the building step, and at what heights

Source-agnostic on purpose: `AreaSource` reads one of the full-depth npz
squares, `CitySource` reads the memory-mapped citywide raster. Same interface,
so the extractor is written once and runs on a test square today and on the
whole city when the pull lands.
"""
import os, json, math
import numpy as np
from pyproj import Transformer
from scipy.ndimage import (median_filter, binary_erosion, label,
                           find_objects, uniform_filter)

HERE = os.path.dirname(os.path.abspath(__file__))
#  the working rasters are GIGABYTES and disposable — `city.py` rebuilds them
#  from AWS — so they live outside the repo and their location is a setting.
RASTER = os.environ.get("ROOFSCAN_RASTER", HERE)
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753
_TO = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
_FROM = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)

def world_to_merc(wx, wy):
    lon = wx / (MPD * COSL) + LON0
    lat = wy / MPD + LAT0
    return _TO.transform(lon, lat)

# ── how much of a roof counts as a thing standing on it ────────────────────
CLUTTER_M      = 0.45   # a cell this far over the roof plane is something else
CLUTTER_MIN_M2 = 0.5    # smaller than this is noise, not a box
FLAT_DEG       = 8.0    # under this median slope the roof is flat
MAX_ROOF_DEG   = 60.0   # over this it is not a roof, it is the wall: the cell
                        # at the edge of a footprint straddles roof and
                        # pavement and differentiates to near-vertical.
                        # MEASURED: eight Sunset houses came back at 82-83 deg
                        # and one downtown block at 90 before this existed.
STEP_MIN_M     = 2.0    # two roof levels closer than this are one roof
STEP_MIN_M2    = 25.0   # a step smaller than this is clutter, not massing
ROOF_MIN_M     = 2.0    # below this a cell is ground, not roof: a published
                        # ring is not always tight to the walls, and a
                        # courtyard, a light well or a yard caught inside it
                        # will otherwise win the histogram and put the roof
                        # plane on the pavement. MEASURED: without this, four
                        # of the five largest Sunset footprints came back at
                        # -1.4 to 1.6 m above ground.


class AreaSource:
    """one of the full-depth test squares"""
    def __init__(self, name, cell=0.35):
        d = np.load(os.path.join(HERE, f"{name}.npz"))
        x, y, z, c = d["x"], d["y"], d["z"], d["c"]
        keep = (c != 7) & (c != 18)
        x, y, z, c = x[keep], y[keep], z[keep], c[keep]
        self.bb = tuple(float(v) for v in d["bbox"]); self.cell = cell
        nx = int((self.bb[2]-self.bb[0])/cell)+1; ny = int((self.bb[3]-self.bb[1])/cell)+1
        dsm = np.full((ny, nx), -9e9, np.float32)
        ix = ((x-self.bb[0])/cell).astype(int); iy = ((y-self.bb[1])/cell).astype(int)
        ok = (ix>=0)&(ix<nx)&(iy>=0)&(iy<ny)
        np.maximum.at(dsm, (iy[ok], ix[ok]), z[ok])
        g = c == 2
        gr = np.full((ny, nx), np.inf, np.float32)
        np.minimum.at(gr, (iy[g&ok], ix[g&ok]), z[g&ok])
        gr[np.isinf(gr)] = np.nan
        for _ in range(120):
            if not np.isnan(gr).any(): break
            f = median_filter(np.nan_to_num(gr), size=3)
            cn = median_filter((~np.isnan(gr)).astype(np.float32), size=3)
            fill = np.isnan(gr) & (cn > 0); gr[fill] = f[fill]
        gr = np.nan_to_num(gr, nan=float(np.nanmedian(gr)))
        self.h = np.where(dsm > -8e9, dsm - gr, np.nan)
        self.nx, self.ny = nx, ny

    def covers(self, mx0, my0, mx1, my1):
        return (mx0 >= self.bb[0] and my0 >= self.bb[1]
                and mx1 <= self.bb[2] and my1 <= self.bb[3])

    def patch(self, mx0, my0, mx1, my1):
        """height-above-ground grid for a web-mercator bbox, plus its origin"""
        i0 = int((mx0-self.bb[0])/self.cell); j0 = int((my0-self.bb[1])/self.cell)
        i1 = int(math.ceil((mx1-self.bb[0])/self.cell)); j1 = int(math.ceil((my1-self.bb[1])/self.cell))
        i0, j0 = max(0, i0), max(0, j0); i1, j1 = min(self.nx, i1), min(self.ny, j1)
        if i1 <= i0 or j1 <= j0: return None, None, None
        return (self.h[j0:j1, i0:i1],
                self.bb[0] + i0*self.cell, self.bb[1] + j0*self.cell)


class CitySource:
    """the memory-mapped citywide raster from city.py"""
    def __init__(self):
        m = json.load(open(os.path.join(RASTER, "city_raster.json")))
        self.nx, self.ny, self.cell = m["nx"], m["ny"], m["cell"]
        self.x0, self.y0, self.q, self.datum = m["x0"], m["y0"], m["quant"], m["datum"]
        self.D = np.memmap(os.path.join(RASTER, "city_dsm.u16"), np.uint16, "r", shape=(self.ny, self.nx))
        self.G = np.memmap(os.path.join(RASTER, "city_dtm.u16"), np.uint16, "r", shape=(self.ny, self.nx))

    def covers(self, mx0, my0, mx1, my1):
        if not (mx0 >= self.x0 and my0 >= self.y0
                and mx1 <= self.x0 + self.nx*self.cell
                and my1 <= self.y0 + self.ny*self.cell):
            return False
        #  ...and the raster is built tile by tile over hours, so "inside the
        #  extent" is not "scanned yet". One probe at the centre costs nothing
        #  and skips every footprint in a tile the pull has not reached, which
        #  is what makes a PARTIAL raster usable instead of a whole-city gate.
        i = int(((mx0+mx1)/2 - self.x0)/self.cell)
        j = int(((my0+my1)/2 - self.y0)/self.cell)
        if not (0 <= i < self.nx and 0 <= j < self.ny): return False
        return bool(self.D[j, i] > 0)

    def patch(self, mx0, my0, mx1, my1):
        i0 = int((mx0-self.x0)/self.cell); j0 = int((my0-self.y0)/self.cell)
        i1 = int(math.ceil((mx1-self.x0)/self.cell)); j1 = int(math.ceil((my1-self.y0)/self.cell))
        pad = 6   # ground under a building is filled from around it
        i0, j0 = max(0, i0-pad), max(0, j0-pad)
        i1, j1 = min(self.nx, i1+pad), min(self.ny, j1+pad)
        if i1 <= i0 or j1 <= j0: return None, None, None
        d = self.D[j0:j1, i0:i1].astype(np.float32); g = self.G[j0:j1, i0:i1].astype(np.float32)
        dz = np.where(d > 0, d*self.q + self.datum, np.nan)
        gz = np.where(g > 0, g*self.q + self.datum, np.nan)
        for _ in range(120):
            if not np.isnan(gz).any(): break
            f = median_filter(np.nan_to_num(gz), size=3)
            cn = median_filter((~np.isnan(gz)).astype(np.float32), size=3)
            fill = np.isnan(gz) & (cn > 0); gz[fill] = f[fill]
        if np.isnan(gz).all(): return None, None, None
        gz = np.nan_to_num(gz, nan=float(np.nanmedian(gz)))
        return dz - gz, self.x0 + i0*self.cell, self.y0 + j0*self.cell


def ring_mask(rx, ry, ox, oy, cell, shape):
    """cells whose centre is inside the ring, ring given in world metres"""
    from matplotlib.path import Path as MPath
    ny, nx = shape
    jj, ii = np.mgrid[0:ny, 0:nx]
    cx = ox + (ii + 0.5) * cell; cy = oy + (jj + 0.5) * cell
    lon = np.asarray(cx); lat = np.asarray(cy)
    lo, la = _FROM.transform(lon.ravel(), lat.ravel())
    wx = (lo - LON0) * MPD * COSL; wy = (la - LAT0) * MPD
    inside = MPath(np.c_[rx, ry]).contains_points(np.c_[wx, wy])
    return inside.reshape(ny, nx)


def roof_of(src, ring, min_cells=12):
    """the roof features of one footprint, or None if the scan cannot answer"""
    rx = np.asarray(ring["rx"], float); ry = np.asarray(ring["ry"], float)
    if len(rx) < 3: return None
    mxy = [world_to_merc(x, y) for x, y in
           ((rx.min(), ry.min()), (rx.max(), ry.max()))]
    mx0, my0 = mxy[0]; mx1, my1 = mxy[1]
    # a footprint the raster only half covers is not evidence about its roof
    if not src.covers(mx0, my0, mx1, my1): return None
    H, ox, oy = src.patch(mx0, my0, mx1, my1)
    if H is None: return None
    m = ring_mask(rx, ry, ox, oy, src.cell, H.shape) & np.isfinite(H)
    if m.sum() < min_cells: return None
    # step in off the wall: the edge cell mixes roof, wall and pavement
    me = binary_erosion(m, np.ones((3, 3), bool))
    if me.sum() >= min_cells: m = me
    h = np.where(m, H, np.nan)

    # ── the roof plane: the dominant flat level, found on the histogram ────
    #  ...over the cells that are ROOF. See ROOF_MIN_M.
    vals_all = h[m]
    vals = vals_all[vals_all > ROOF_MIN_M]
    if vals.size < min_cells:
        return None            # nothing standing here the scan can call a roof
    lo, hi = np.percentile(vals, [2, 98])
    if not np.isfinite(lo) or hi - lo < 0.05: base = float(np.median(vals))
    else:
        bins = np.arange(lo, hi + 0.25, 0.25)
        cnt, edges = np.histogram(vals, bins=bins)
        base = float(edges[int(np.argmax(cnt))] + 0.125)
    on = m & (np.abs(h - base) < CLUTTER_M)
    if on.sum() < min_cells: on = m
    roof_h = float(np.median(h[on]))

    # ── slope, over the roof only ─────────────────────────────────────────
    inner = binary_erosion(on, np.ones((3, 3), bool))
    if inner.sum() < min_cells: inner = on
    hf = np.where(np.isfinite(h), h, roof_h)
    if hf.shape[0] < 3 or hf.shape[1] < 3:
        # too few cells across to differentiate: the scan cannot call a pitch
        gx = gy = np.zeros_like(hf); med_slope = 0.0
    else:
        gy, gx = np.gradient(hf, src.cell)
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        med_slope = float(np.median(slope[inner])) if inner.any() else 0.0
    pitched = FLAT_DEG <= med_slope <= MAX_ROOF_DEG
    ridge = None
    if pitched:
        # the structure tensor's dominant axis: gradients on a gable point
        # in opposite directions, so an angle average would cancel them
        a = float(np.sum(gx[inner]*gx[inner])); b = float(np.sum(gx[inner]*gy[inner]))
        c = float(np.sum(gy[inner]*gy[inner]))
        theta = 0.5*math.atan2(2*b, a - c)            # dominant gradient axis
        ridge = (math.degrees(theta) + 90.0) % 180.0  # ridge is across it

    # ── what is standing on it ────────────────────────────────────────────
    cell_a = src.cell * src.cell
    above = m & np.isfinite(h) & (h > base + CLUTTER_M)
    boxes = []
    if above.any():
        lab, n = label(above)
        for li, sl in enumerate(find_objects(lab), start=1):
            if sl is None: continue
            #  the component is THIS label, not whichever label happens to have
            #  most cells in the bounding box. Two roof units close together
            #  share a box, and argmax handed the smaller one the larger one's
            #  extent and height.
            comp = (lab[sl] == li)
            area = float(comp.sum() * cell_a)
            if area < CLUTTER_MIN_M2: continue
            hh = h[sl][comp]
            j0, i0 = sl[0].start, sl[1].start
            boxes.append({
                "w": round(float((sl[1].stop-i0) * src.cell), 2),
                "d": round(float((sl[0].stop-j0) * src.cell), 2),
                "top": round(float(np.percentile(hh, 90)), 2),
                "rise": round(float(np.percentile(hh, 90) - base), 2),
                "area": round(area, 1),
                # centre, in web mercator, so the caller can put it in world
                "mx": round(float(ox + (i0 + (sl[1].stop-i0)/2) * src.cell), 2),
                "my": round(float(oy + (j0 + (sl[0].stop-j0)/2) * src.cell), 2),
            })
        boxes.sort(key=lambda b: -b["area"])

    # ── does the building step, and how wide is each step? ────────────────
    #  A height on its own cannot be drawn. What a stacked prism needs is the
    #  PLAN at each level, and the scan gives that as the area still standing
    #  at or above it — stored as a fraction of the footprint, so the renderer
    #  insets the published ring to match rather than inventing an outline.
    levels = []
    if m.sum() >= 40:
        vv = h[m & np.isfinite(h)]
        vv = vv[vv > ROOF_MIN_M]          # ground inside the ring is not a level
        if vv.size >= 20:
         cnt, edges = np.histogram(vv, bins=np.arange(vv.min(), vv.max()+0.5, 0.5))
         picked = []
         for i in np.argsort(cnt)[::-1]:
            lv = float(edges[i] + 0.25)
            if cnt[i]*cell_a < STEP_MIN_M2: continue
            if any(abs(lv-p) < STEP_MIN_M for p in picked): continue
            picked.append(lv)
            if len(picked) >= 4: break
         picked.sort(reverse=True)
         total = float(m.sum())
         for lv in picked:
            at = float((m & np.isfinite(h) & (h >= lv - 0.75)).sum())
            levels.append({"h": round(lv, 2), "frac": round(at/max(1.0, total), 3)})

    return {
        "gid": int(ring["gid"]),
        "published_h": round(float(ring["h"]), 2),
        "scan_h": round(roof_h, 2),
        "cells": int(m.sum()),
        "area_m2": round(float(m.sum()*cell_a), 1),
        "pitched": bool(pitched),
        "slope_deg": round(med_slope, 1),
        "ridge_deg": None if ridge is None else round(ridge, 1),
        "clutter": boxes[:20],
        "clutter_n": len(boxes),
        "levels": levels,
    }


def run(src, rings, label_=""):
    out, skipped = [], 0
    for r in rings:
        f = roof_of(src, r)
        if f is None: skipped += 1; continue
        out.append(f)
    print(f"  {label_}: {len(out)} buildings extracted, {skipped} skipped (no usable scan)")
    return out


CITY_DIR = os.path.abspath(os.path.join(
    HERE, "..", "..", "..", "..", "website", "public", "data", "us", "sf", "city"))


def city_rings(city_dir=CITY_DIR):
    """every published footprint, in the shape roof_of() wants"""
    from chunks import all_footprints
    return [{"gid": g, "rx": rx, "ry": ry, "h": h, "st": st, "u": u, "yr": yr}
            for g, rx, ry, h, st, u, yr in all_footprints(city_dir)]


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "city":
        # the whole city, off the memory-mapped raster city.py builds
        src = CitySource()
        rings = city_rings()
        print(f"{len(rings):,} published footprints")
        out = run(src, rings, "city")
        json.dump(out, open(os.path.join(HERE, "roofs_city.json"), "w"))
        print("wrote roofs_city.json")
    else:
        # the two full-depth test squares, for checking the extractor itself
        FP = json.load(open(os.path.join(HERE, "footprints.json")))
        res = {}
        for area in ("downtown", "sunset"):
            print(f"=== {area} ===")
            res[area] = run(AreaSource(area), FP[area], area)
        json.dump(res, open(os.path.join(HERE, "roofs.json"), "w"), indent=1)
        print("wrote roofs.json")
