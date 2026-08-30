"""Pull EPT nodes overlapping a small bbox from the USGS 3DEP SF survey."""
import json, sys, io, math, os
import urllib.request
import numpy as np
from pyproj import Transformer

BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/CA_SanFrancisco_1_B23"
HERE = os.path.dirname(os.path.abspath(__file__))
EPT = json.load(open(os.path.join(HERE, "ept.json")))
BOUNDS = EPT["bounds"]
T = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)

def get(url, binary=True):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read() if binary else r.read().decode()

def node_bounds(d, x, y, z):
    x0, y0, z0, x1, y1, z1 = BOUNDS
    n = 2 ** d
    sx, sy, sz = (x1-x0)/n, (y1-y0)/n, (z1-z0)/n
    return (x0+x*sx, y0+y*sy, z0+z*sz, x0+(x+1)*sx, y0+(y+1)*sy, z0+(z+1)*sz)

def overlaps(nb, bb):
    return not (nb[3] <= bb[0] or nb[0] >= bb[2] or nb[4] <= bb[1] or nb[1] >= bb[3])

_hier_cache = {}
def hierarchy(key):
    if key not in _hier_cache:
        _hier_cache[key] = json.loads(get(f"{BASE}/ept-hierarchy/{key}.json", False))
    return _hier_cache[key]

def walk(bb, maxdepth):
    """every node overlapping bb, down to maxdepth, following paged hierarchy"""
    out, stack = [], [("0-0-0-0", hierarchy("0-0-0-0"))]
    while stack:
        root, h = stack.pop()
        for key, cnt in h.items():
            d, x, y, z = map(int, key.split("-"))
            if d > maxdepth: continue
            if not overlaps(node_bounds(d, x, y, z), bb): continue
            if cnt == -1:                      # a paged sub-hierarchy
                stack.append((key, hierarchy(key)))
            elif cnt > 0:
                out.append((key, cnt, d))
    return sorted(set(out), key=lambda t: t[2])

def survey(lon, lat, half_m):
    """how many nodes/points each depth adds, without downloading anything"""
    cx, cy = T.transform(lon, lat)
    k = 1.0 / math.cos(math.radians(lat)); h = half_m * k
    bb = (cx-h, cy-h, cx+h, cy+h)
    nodes = walk(bb, 20)
    by = {}
    for key, cnt, d in nodes:
        a, b = by.get(d, (0, 0)); by[d] = (a+1, b+cnt)
    cum = 0
    for d in sorted(by):
        n, pts = by[d]; cum += pts
        print(f"   depth {d:>2}: {n:>4} nodes  {pts:>12,} pts   cumulative {cum:>13,}")
    return bb


def pull(lon, lat, half_m, maxdepth, name):
    cx, cy = T.transform(lon, lat)
    # web mercator metres are stretched by 1/cos(lat); widen so the ground
    # square really is 2*half_m across
    k = 1.0 / math.cos(math.radians(lat))
    h = half_m * k
    bb = (cx-h, cy-h, cx+h, cy+h)
    nodes = walk(bb, maxdepth)
    print(f"\n=== {name}  ({lon}, {lat})  {2*half_m:.0f} m square ===")
    print(f"{len(nodes)} nodes, {sum(n[1] for n in nodes):,} points advertised")
    import laspy
    from concurrent.futures import ThreadPoolExecutor
    def one(t):
        key = t[0]
        for attempt in range(3):
            try:
                las = laspy.read(io.BytesIO(get(f"{BASE}/ept-data/{key}.laz")))
                return (np.asarray(las.x), np.asarray(las.y), np.asarray(las.z),
                        np.asarray(las.classification), np.asarray(las.intensity),
                        np.asarray(las.return_number), np.asarray(las.number_of_returns))
            except Exception as e:
                if attempt == 2:
                    print("  miss", key, str(e)[:60]); return None
    XS, YS, ZS, CL, IN, RN, NR = [], [], [], [], [], [], []
    done = 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        for res in ex.map(one, nodes):
            done += 1
            if done % 25 == 0: print(f"  {done}/{len(nodes)} nodes", flush=True)
            if res is None: continue
            XS.append(res[0]); YS.append(res[1]); ZS.append(res[2])
            CL.append(res[3]); IN.append(res[4]); RN.append(res[5]); NR.append(res[6])
    X = np.concatenate(XS); Y = np.concatenate(YS); Z = np.concatenate(ZS)
    C = np.concatenate(CL); I = np.concatenate(IN)
    R = np.concatenate(RN); N = np.concatenate(NR)
    m = (X >= bb[0]) & (X < bb[2]) & (Y >= bb[1]) & (Y < bb[3])
    X, Y, Z, C, I, R, N = X[m], Y[m], Z[m], C[m], I[m], R[m], N[m]
    np.savez_compressed(os.path.join(HERE, f"{name}.npz"), x=X, y=Y, z=Z, c=C, i=I, r=R, n=N,
                        bbox=np.array(bb), lonlat=np.array([lon, lat]))
    area = (2*half_m)**2
    print(f"kept {len(X):,} points in the square -> {len(X)/area:.1f} pts/m2 (all classes)")
    u, ct = np.unique(C, return_counts=True)
    NAMES = {1:"unclassified",2:"ground",3:"low veg",4:"med veg",5:"high veg",6:"BUILDING",
             7:"noise",9:"water",17:"bridge",18:"high noise"}
    for cc, n_ in sorted(zip(u, ct), key=lambda t:-t[1]):
        print(f"   class {cc:>2} {NAMES.get(int(cc),'?'):<14} {n_:>10,}  {100*n_/len(C):5.1f}%")
    return X, Y, Z, C

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "survey":
        print("=== downtown ==="); survey(-122.4005, 37.7915, 200)
        print("=== sunset ==="); survey(-122.4880, 37.7530, 200)
        sys.exit(0)
    md = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    hm = float(sys.argv[2]) if len(sys.argv) > 2 else 100.0
    tag = sys.argv[3] if len(sys.argv) > 3 else ""
    pull(-122.4005, 37.7915, hm, md, "downtown"+tag)
    pull(-122.4880, 37.7530, hm, md, "sunset"+tag)
