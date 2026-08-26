"""Is every block this index attaches a decision to actually ON a street the decision names?

The join runs through DataSF's parcel address ranges: a parcel says it is on GEARY and
in block 0695, so block 0695 fronts Geary. That is a table lookup, and a table lookup
can be wrong in ways that are invisible until you put it on a map — a block whose
parcels carry a street name it does not touch will silently relocate a decision.

So this checks the join against GEOMETRY, which is an independent source: the street
centrelines (3psu-pn9h) and the dissolved block outlines (acdm-wktn) never pass through
the address table. For every block-decision link, the distance from the block's outline
to the nearest centreline of a street the decision NAMES is measured. A block that
fronts a street is within a roadway half-width of it — call it 40 m to be generous
about wide blocks and simplified outlines. Anything past ~120 m is not on that street.
"""
import collections, json, math, os, sys
import numpy as np

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import ANIM, GEO, MIN, CACHE, JOINED  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util
_s = importlib.util.spec_from_file_location(
    "gz", os.path.join(MIN, "gazetteer.py"))
gz = importlib.util.module_from_spec(_s); _s.loader.exec_module(gz)

LON0, LAT0, MPD = -122.4380, 37.7600, 111320.0
COSL = math.cos(math.radians(LAT0))


def main():
    # street name -> array of centreline vertices in metres
    pts = collections.defaultdict(list)
    for r in json.load(open(os.path.join(GEO, "streets.json"))):
        g = r.get("line")
        if not g or g.get("type") != "LineString":
            continue
        k = gz.norm(r.get("street") or "")
        if not k: continue
        for c in g["coordinates"]:
            pts[k].append(((c[0] - LON0) * MPD * COSL, (c[1] - LAT0) * MPD))
    SP = {k: np.array(v) for k, v in pts.items() if v}
    print(f"{len(SP):,} streets with centreline geometry", flush=True)

    blocks = json.load(open(os.path.join(GEO, "blocks.json")))
    BR = {b["b"]: np.array(b["ring"]) for b in blocks}
    NH = {b["b"]: b.get("nh") for b in blocks}

    J = json.load(open(JOINED))
    dec = J["dec"]; own = J["own"]; st_of = J["street_of"]

    def dist(bn, skey):
        P = SP.get(skey)
        if P is None: return None
        R = BR.get(bn)
        if R is None: return None
        d = np.sqrt(((P[None, :, 0] - R[:, None, 0]) ** 2 +
                     (P[None, :, 1] - R[:, None, 1]) ** 2).min())
        return float(d)

    # tier 4 (`stated` — the Journal printing its own assessor block) was added to
    # the index after this check was written and crashed it with a KeyError. It is
    # reported alongside the rest: a stated block is still a block the decision's
    # streets should run past.
    tiers = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    stats = collections.defaultdict(list)
    worst = []
    nolink = collections.Counter()
    for grp, table in (("block", own), ("street", st_of)):
        for bn, ids in table.items():
            for did in ids:
                d0 = dec[str(did)]
                best = None
                for m in d0["r"]:
                    v = dist(bn, m["s"])
                    if v is not None and (best is None or v < best[0]):
                        best = (v, m["s"])
                if best is None:
                    nolink[tiers[d0["p"]]] += 1
                    continue
                stats[tiers[d0["p"]]].append(best[0])
                if best[0] > 200:
                    worst.append((round(best[0]), tiers[d0["p"]], bn, NH.get(bn),
                                  best[1], d0["y"], d0["t"][:110]))

    print("\ndistance from block outline to the nearest centreline of a street the "
          "decision NAMES")
    print(f"{'tier':<9}{'links':>9}{'p50':>7}{'p90':>7}{'p99':>8}"
          f"{'<=40m':>8}{'<=120m':>9}{'>200m':>8}")
    for t in ("stated", "addr", "segment", "corner", "street"):
        a = np.array(stats[t])
        if not len(a): continue
        print(f"{t:<9}{len(a):>9,}{np.percentile(a,50):>7.0f}{np.percentile(a,90):>7.0f}"
              f"{np.percentile(a,99):>8.0f}"
              f"{100*(a<=40).mean():>7.1f}%{100*(a<=120).mean():>8.1f}%"
              f"{100*(a>200).mean():>7.2f}%")
    print("no geometry for any named street:", dict(nolink))
    worst.sort(reverse=True)
    print(f"\n{len(worst):,} links further than 200 m — worst 12:")
    for w in worst[:12]:
        print(f"  {w[0]:>5}m {w[1]:<8} blk {w[2]} {str(w[3])[:18]:<18} via {w[4]:<14} "
              f"{w[5]}  {w[6]}")
    json.dump({"pct": {t: {"n": len(stats[t]),
                           "p50": float(np.percentile(stats[t], 50)),
                           "p90": float(np.percentile(stats[t], 90)),
                           "le40": float((np.array(stats[t]) <= 40).mean()),
                           "le120": float((np.array(stats[t]) <= 120).mean())}
                       for t in stats if stats[t]},
               "worst": worst[:200]},
              open(os.path.join(CACHE, "verify_geo.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
