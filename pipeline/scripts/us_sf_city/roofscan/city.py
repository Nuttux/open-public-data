"""
Whole-city height rasters from the 2023 USGS scan, STREAMED.

The raw survey is ~78 GB of points and the disk has ~78 GB free, so points are
never kept: a tile is fetched, reduced into two rasters, and thrown away.

  DSM  the highest return per cell   -> roofs, plant, trees, cars
  DTM  the lowest class-2 return     -> the ground under them

Both uint16 at a 5 cm quantum over a -200 m datum, memory-mapped, so the two
of them are ~5 GB on disk and no worker holds more than one tile.

Depth 9, MEASURED against depth 10 on the same two squares: 114 vs 164 pts/m2
downtown, and the roof plant, the tanks and the pitched roofs are all still
legible at 0.35 m. Depth 8 is 5x cheaper again and loses them, so 9 it is.
"""
import os, sys, io, json, math, time
import urllib.request
import numpy as np
from pyproj import Transformer
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/CA_SanFrancisco_1_B23"
EPT = json.load(open(os.path.join(HERE, "ept.json")))
BOUNDS = EPT["bounds"]
MAXDEPTH = 9
CELL = 0.35                 # metres per raster cell, in WEB MERCATOR metres
QUANT, DATUM = 0.05, -200.0 # 5 cm quantum over a -200 m datum
NODATA = 0

# the city, generously: everything with land in it
CITY_LL = (-122.5170, 37.7020, -122.3540, 37.8350)
T = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
X0, Y0 = T.transform(CITY_LL[0], CITY_LL[1])
X1, Y1 = T.transform(CITY_LL[2], CITY_LL[3])
NX = int(math.ceil((X1 - X0) / CELL)); NY = int(math.ceil((Y1 - Y0) / CELL))
DSM_P = os.path.join(HERE, "city_dsm.u16")
DTM_P = os.path.join(HERE, "city_dtm.u16")
META_P = os.path.join(HERE, "city_raster.json")
TILE = 512                  # raster cells per tile side (~179 m)

def enc(z):
    return np.clip(((z - DATUM) / QUANT).astype(np.int64), 1, 65535).astype(np.uint16)

def get(url, binary=True, tries=4):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return r.read() if binary else r.read().decode()
        except Exception as e:
            last = e; time.sleep(1.5 * (a + 1))
    raise last

def node_bounds(d, x, y, z):
    x0, y0, z0, x1, y1, z1 = BOUNDS; n = 2 ** d
    sx, sy, sz = (x1-x0)/n, (y1-y0)/n, (z1-z0)/n
    return (x0+x*sx, y0+y*sy, x0+(x+1)*sx, y0+(y+1)*sy)

def overlaps(nb, bb):
    return not (nb[2] <= bb[0] or nb[0] >= bb[2] or nb[3] <= bb[1] or nb[1] >= bb[3])

def build_index():
    """walk the whole hierarchy once, cache every node key + its bounds"""
    cache = os.path.join(HERE, f"nodes_d{MAXDEPTH}.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    seen, out, stack = set(), [], ["0-0-0-0"]
    while stack:
        k = stack.pop()
        if k in seen: continue
        seen.add(k)
        h = json.loads(get(f"{BASE}/ept-hierarchy/{k}.json", False))
        for key, cnt in h.items():
            d, x, y, z = map(int, key.split("-"))
            if d > MAXDEPTH: continue
            if cnt == -1: stack.append(key)
            elif cnt > 0: out.append(key)
        print(f"  hierarchy: {len(seen)} pages, {len(out)} nodes", flush=True)
    out = sorted(set(out))
    json.dump(out, open(cache, "w"))
    return out

def do_tile(arg):
    ti, tj, keys = arg
    import laspy
    bx0 = X0 + ti*TILE*CELL; by0 = Y0 + tj*TILE*CELL
    bx1 = min(bx0 + TILE*CELL, X1); by1 = min(by0 + TILE*CELL, Y1)
    bb = (bx0, by0, bx1, by1)
    nx = int(round((bx1-bx0)/CELL)); ny = int(round((by1-by0)/CELL))
    if nx <= 0 or ny <= 0: return (ti, tj, 0)
    dsm = np.zeros((ny, nx), np.float32); dsm[:] = -9e9
    dtm = np.zeros((ny, nx), np.float32); dtm[:] =  9e9
    npts = 0
    for k in keys:
        try:
            las = laspy.read(io.BytesIO(get(f"{BASE}/ept-data/{k}.laz")))
        except Exception:
            continue
        x = np.asarray(las.x); y = np.asarray(las.y); z = np.asarray(las.z)
        c = np.asarray(las.classification)
        m = (x>=bx0)&(x<bx1)&(y>=by0)&(y<by1)&(c!=7)&(c!=18)
        if not m.any(): continue
        x, y, z, c = x[m], y[m], z[m], c[m]
        npts += len(x)
        ix = ((x-bx0)/CELL).astype(np.int32); iy = ((y-by0)/CELL).astype(np.int32)
        np.maximum.at(dsm, (iy, ix), z)
        g = c == 2
        if g.any(): np.minimum.at(dtm, (iy[g], ix[g]), z[g])
    if npts == 0: return (ti, tj, 0)
    D = np.memmap(DSM_P, dtype=np.uint16, mode="r+", shape=(NY, NX))
    G = np.memmap(DTM_P, dtype=np.uint16, mode="r+", shape=(NY, NX))
    ys, xs = slice(tj*TILE, tj*TILE+ny), slice(ti*TILE, ti*TILE+nx)
    ok = dsm > -8e9; 
    if ok.any():
        blk = D[ys, xs].copy(); blk[ok] = enc(dsm[ok]); D[ys, xs] = blk
    okg = dtm < 8e9
    if okg.any():
        blk = G[ys, xs].copy(); blk[okg] = enc(dtm[okg]); G[ys, xs] = blk
    D.flush(); G.flush(); del D, G
    return (ti, tj, npts)

def main():
    print(f"raster {NX} x {NY} cells at {CELL} m  ({NX*NY*2/1e9:.2f} GB per plane)")
    for p in (DSM_P, DTM_P):
        if not os.path.exists(p):
            np.memmap(p, dtype=np.uint16, mode="w+", shape=(NY, NX)).flush()
    json.dump({"nx":NX,"ny":NY,"cell":CELL,"x0":X0,"y0":Y0,"quant":QUANT,
               "datum":DATUM,"crs":"EPSG:3857","maxdepth":MAXDEPTH}, open(META_P,"w"))
    print("indexing hierarchy...", flush=True)
    keys = build_index()
    print(f"{len(keys)} nodes at depth <= {MAXDEPTH}", flush=True)
    nb = {k: node_bounds(*map(int, k.split("-"))) for k in keys}
    tiles = []
    for tj in range(int(math.ceil(NY/TILE))):
        for ti in range(int(math.ceil(NX/TILE))):
            bx0 = X0+ti*TILE*CELL; by0 = Y0+tj*TILE*CELL
            bb = (bx0, by0, min(bx0+TILE*CELL,X1), min(by0+TILE*CELL,Y1))
            ks = [k for k in keys if overlaps(nb[k], bb)]
            if ks: tiles.append((ti, tj, ks))
    print(f"{len(tiles)} tiles to do", flush=True)
    done_p = os.path.join(HERE, "city_done.json")
    done = set(map(tuple, json.load(open(done_p)))) if os.path.exists(done_p) else set()
    todo = [t for t in tiles if (t[0], t[1]) not in done]
    print(f"{len(todo)} remaining", flush=True)
    t0 = time.time(); tot = 0
    with ProcessPoolExecutor(max_workers=10) as ex:
        for n, (ti, tj, npts) in enumerate(ex.map(do_tile, todo), 1):
            done.add((ti, tj)); tot += npts
            if n % 5 == 0 or n == len(todo):
                el = time.time()-t0; rate = n/el
                print(f"  {n}/{len(todo)} tiles  {tot/1e6:.0f}M pts  "
                      f"{rate*60:.1f} tiles/min  eta {(len(todo)-n)/rate/60:.0f} min", flush=True)
                json.dump([list(t) for t in done], open(done_p, "w"))
    json.dump([list(t) for t in done], open(done_p, "w"))
    print(f"DONE {tot/1e6:.0f}M points in {(time.time()-t0)/60:.0f} min")

if __name__ == "__main__":
    main()
