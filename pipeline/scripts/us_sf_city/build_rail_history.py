#!/usr/bin/env python3
"""THE NETWORK THAT WAS TORN UP, DRAWN FROM THE WORDS THAT AUTHORISED IT.

`build_rail.py` draws today's ten lines and dates each from the record. It
cannot draw what no longer exists, because its geometry is DataSF's CURRENT
route file. San Francisco's system peaked around 1920 at roughly four times
what survived, so the century scrub shows a network that only ever grows.

── AND THE MISSING GEOMETRY IS ALREADY IN THE CITY ──────────────────────────
The tracks were lifted; the STREETS THEY RAN ON ARE STILL THERE. And the Board
described every line it authorised as a sequence of streets, in words:

    "a line from the southwesterly portal of the Twin Peaks tunnel over Ulloa
     street, Fifteenth avenue and Taraval street to Twentieth avenue"
                                    -- Ordinance 4527, approved 25 Sept 1917

So a route is a LOOKUP, not a drawing. Take the street names out of the
ordinance, ask the centreline file for each one, stitch them in the order the
ordinance gives, and the line is on the map at its own date. Nothing is traced
off a scan, nothing is borrowed, and the citation is the ordinance itself.

── WHY NOT A HISTORICAL MAP ─────────────────────────────────────────────────
Checked before writing this. OpenStreetMap holds 74 former-railway ways in the
SF box and every one is freight -- the State Belt Railroad, Harriet Street --
with not one carrying a date. The best digitisation that exists,
`sfstreetcars.co`, publishes no licence, no repository and no data endpoint,
and covers two snapshots (1940, 1960) rather than a century. The Library of
Congress and USGS both refuse scripted access. A scan would in any case have to
be georeferenced and traced, which produces geometry we AUTHOR; this produces
geometry the city already publishes, selected by words the city already wrote.

── WHAT THIS CANNOT DO, STATED UP FRONT ─────────────────────────────────────
* A street that was renamed or destroyed cannot be looked up. The miss rate is
  printed, never hidden, and a route that loses a street is reported rather
  than quietly shortened.
* An ordinance gives endpoints ("to Twentieth avenue") and this takes the WHOLE
  named street unless the endpoint resolves. Overreach is measured below.
* The private companies -- the Market Street Railway and the United Railroads,
  which owned most of the mileage -- appear in FRANCHISE ordinances, not in the
  construction contracts this first pass reads.

  python3 build_rail_history.py --check      # resolve the seeded routes only
  python3 build_rail_history.py              # and write the layer's file
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
CACHE = ROOT / "pipeline/scripts/us_sf_city/cache_streets"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"
OUT = ROOT / "website/public/data/us/sf/city/base/rail-history.json"
SEED = ROOT / "pipeline/seeds/sf_rail_routes.json"

CENTRELINES = "https://data.sfgov.org/resource/3psu-pn9h.geojson"

# the ordinances spell numbers; the centreline file abbreviates them
ONES = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
    "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11,
    "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
    "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
}
TENS = {
    "twentieth": 20, "thirtieth": 30, "fortieth": 40, "fiftieth": 50,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
}


def ordinal(word: str) -> str | None:
    """`Forty-fifth` -> `45TH`, as the centreline file spells an avenue.

    Written as a parser rather than the hand-listed table it replaces, which
    had `thirty-third` and `forty-eighth` in it and not `forty-fifth` — so a
    route quoting the Board's own words silently lost a street, and a lost
    street looks exactly like a street that no longer exists.
    """
    w = word.strip().lower().replace("\u2014", "-")
    if w in ONES:
        n = ONES[w]
    elif w in TENS and w.endswith("ieth"):
        n = TENS[w]
    elif "-" in w:
        a, b = w.split("-", 1)
        if a not in TENS or b not in ONES:
            return None
        n = TENS[a] + ONES[b]
    else:
        return None
    suf = "TH"
    if n % 100 not in (11, 12, 13):
        suf = {1: "ST", 2: "ND", 3: "RD"}.get(n % 10, "TH")
    return f"{n}{suf}"



def norm(name: str) -> str:
    """An ordinance's street name as the centreline file spells it.

    The file keys on a BASE name -- `TARAVAL`, not `TARAVAL ST` -- and querying
    the full `streetname` returns zero rows, which looks exactly like a street
    that does not exist. That mistake is worth a line of code and a comment.
    """
    s = name.strip().lower()
    s = re.sub(r"\b(street|avenue|av|ave|boulevard|blvd|road|way|drive|dr)\b", " ", s)
    s = re.sub(r"[^a-z0-9\- ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    o = ordinal(s)
    return o if o else s.upper()


def candidates(name: str) -> list[str]:
    """Every spelling the centreline file might key this street under.

    It ZERO-PADS a single-digit numbered street -- `01ST`, `06TH`, `03RD` --
    while an ordinal parser naturally produces `1ST`. Asking only the unpadded
    form lost Sixth, Eighth, First and Third, and a street that is not found
    is reported as unresolved, which reads exactly like a street that no longer
    exists. Both are tried, plus the raw word for the streets that ARE spelled
    out.
    """
    k = norm(name)
    out = [k]
    if len(k) == 3 and k[0].isdigit():
        out.append("0" + k)
    raw = re.sub(r"[^A-Za-z0-9\- ]", " ", name).strip().upper()
    raw = re.sub(r"\s+", " ", raw)
    if raw and raw not in out:
        out.append(raw)
    return out


def load_streets() -> dict[str, list[list[tuple[float, float]]]]:
    """Every centreline in the city, in world metres, keyed by base name."""
    CACHE.mkdir(parents=True, exist_ok=True)
    blob = CACHE / "centrelines.geojson"
    if not blob.exists() or blob.stat().st_size < 10_000:
        parts, offset = [], 0
        while True:
            q = f"{CENTRELINES}?$limit=5000&$offset={offset}"
            req = urllib.request.Request(q, headers={"User-Agent": "qipu-rail/1"})
            with urllib.request.urlopen(req, timeout=300) as r:
                page = json.loads(r.read()).get("features", [])
            if not page:
                break
            parts.extend(page)
            offset += 5000
            print(f"  fetched {len(parts):,} centrelines", end="\r", flush=True)
        blob.write_text(json.dumps({"features": parts}))
        print(f"  fetched {len(parts):,} centrelines, cached")
    feats = json.loads(blob.read_text())["features"]

    P = json.loads(MANIFEST.read_text())["proj"]
    mx = P["mpd"] * P["cosl"]
    out: dict[str, list[list[tuple[float, float]]]] = {}
    for ft in feats:
        base = (ft["properties"].get("street") or "").strip().upper()
        if not base:
            continue
        g = ft.get("geometry") or {}
        coords = g.get("coordinates") or []
        parts_ = coords if g.get("type") == "MultiLineString" else [coords]
        for part in parts_:
            line = [((lon - P["lon0"]) * mx, (lat - P["lat0"]) * P["mpd"])
                    for lon, lat in part]
            if len(line) > 1:
                out.setdefault(base, []).append(line)
    return out


def length_m(lines: list[list[tuple[float, float]]]) -> float:
    return sum(
        math.dist(a, b) for line in lines for a, b in zip(line, line[1:])
    )


def merge(lines: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """One street's scattered centreline pieces, joined where they touch.

    The file publishes a street as a block-by-block collection, so measuring
    "how far along Taraval" needs the pieces in order first. Endpoints that
    coincide within a metre are the same node.
    """
    pool = [list(ln) for ln in lines]
    out: list[list[tuple[float, float]]] = []
    while pool:
        cur = pool.pop()
        joined = True
        while joined:
            joined = False
            for i, other in enumerate(pool):
                for a_end, o_end in ((0, 0), (0, -1), (-1, 0), (-1, -1)):
                    if math.dist(cur[a_end], other[o_end]) < 1.0:
                        seg = other if o_end == 0 else other[::-1]
                        cur = (cur[::-1] if a_end == 0 else cur) + seg[1:]
                        pool.pop(i)
                        joined = True
                        break
                if joined:
                    break
        out.append(cur)
    return out


def arc(poly: list[tuple[float, float]]) -> list[float]:
    d = [0.0]
    for a, b in zip(poly, poly[1:]):
        d.append(d[-1] + math.dist(a, b))
    return d


def nearest_t(poly: list[tuple[float, float]], pt: tuple[float, float]) -> tuple[float, float]:
    """(distance along `poly` of the closest vertex, how close it got)."""
    d = arc(poly)
    best, bt = float("inf"), 0.0
    for i, v in enumerate(poly):
        dd = math.dist(v, pt)
        if dd < best:
            best, bt = dd, d[i]
    return bt, best


def meet(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Where two streets cross: distance along a, along b, and how near."""
    best = (0.0, 0.0, float("inf"))
    da, db = arc(a), arc(b)
    for i, va in enumerate(a):
        for j, vb in enumerate(b):
            dd = math.dist(va, vb)
            if dd < best[2]:
                best = (da[i], db[j], dd)
    return best


def clip(poly: list[tuple[float, float]], t0: float, t1: float) -> list[tuple[float, float]]:
    if t1 < t0:
        t0, t1 = t1, t0
    d = arc(poly)
    return [v for v, dv in zip(poly, d) if t0 - 1e-6 <= dv <= t1 + 1e-6]


def pick_by_terminus(group: list, term: list) -> int | None:
    """WHICH RUN OF A STREET THE ORDINANCE MEANT.

    A street with no junction to another street in its route -- a one-street
    abandonment like *"Brannan street, from First street to Second street"* --
    had no way to choose between its merged runs and took the LONGEST. Brannan
    is twenty-four pieces and its longest run is not the block the ordinance
    names, so the terminus came back "not found (553 m)" and the segment was
    drawn on the wrong stretch of the right street.

    The termini are the answer: take the run they are nearest to.
    """
    if not group:
        return None
    sides = [t for t in term if t]
    if not sides:
        return 0
    # SCORED BY THE WORST END, NOT THE NEAREST. A stretch "from X to Y" has to
    # reach BOTH, and a run touching only X satisfies a nearest-end score.
    best, bi = float("inf"), 0
    for i, poly in enumerate(group):
        worst = max(min(meet(poly, q)[2] for q in side) for side in sides)
        if worst < best:
            best, bi = worst, i
    return bi


def runs_between(group: list, term: list, tol: float = 60.0) -> list[int]:
    """EVERY run of one street that the described stretch touches.

    Brannan merges into three runs and NO SINGLE ONE reaches both Third and
    Eighth: run 0 touches Third and stops 553 m short of Eighth, run 1 touches
    Eighth and is 831 m from Third. The centrelines simply do not join there.
    Picking one run drew half the stretch and reported the other terminus as
    "not found", which reads like a bad street name and is nothing of the kind.

    So a stretch may span several runs. Each run that reaches EITHER named
    terminus is kept; the rest of the street is not.
    """
    sides = [t for t in term if t]
    if not sides:
        return [0] if group else []
    keep = []
    for i, poly in enumerate(group):
        if any(min(meet(poly, q)[2] for q in side) <= tol for side in sides):
            keep.append(i)
    return keep or [pick_by_terminus(group, term) or 0]


def chain(seq: list[list[list[tuple[float, float]]]], names: list[str],
          ends: list[list[list[tuple[float, float]]]] | None = None) -> tuple[list, list[str]]:
    """A ROUTE IS A CONNECTED PATH, NOT A UNION OF WHOLE STREETS.

    Taking every metre of every named street put the Taraval extension on all
    of Fifteenth Avenue, which runs the width of the city -- 17.1 km for a line
    the ordinance describes in about four. So each street is cut where it meets
    the one before and the one after it, which is exactly what "over Ulloa
    street, Fifteenth avenue and Taraval street" describes.

    EVERY PIECE IS TESTED, not the longest one. A street arrives as a bag of
    block-long centrelines that `merge` joins into a few runs, and the run that
    happens to be longest is not necessarily the run the next street crosses --
    testing only that one reported Ulloa and Fifteenth Avenue as 2.6 km apart
    when they intersect.
    """
    JOIN_TOL = 60.0
    pieces = [sorted(merge(lines), key=lambda q: -arc(q)[-1]) for lines in seq]
    # the ordinance's own termini -- "from Market street and Van Ness avenue TO
    # Sixteenth and Church streets" -- as geometry to cut the ends against.
    # Without them a one-street route has no junction at all and resolves to
    # nothing, and a route's last street runs to the edge of the city.
    term = [None, None]
    if ends:
        for k in (0, 1):
            if ends[k]:
                merged = sorted(merge(ends[k]), key=lambda q: -arc(q)[-1])
                term[k] = merged
    warn: list[str] = []
    # for each consecutive pair, the closest approach over ALL piece pairs
    links: list[tuple[int, int, float, float, float] | None] = []
    for i in range(len(pieces) - 1):
        best = None
        for ia, pa in enumerate(pieces[i]):
            for ib, pb in enumerate(pieces[i + 1]):
                ta, tb, gap = meet(pa, pb)
                if best is None or gap < best[4]:
                    best = (ia, ib, ta, tb, gap)
        if best is None or best[4] > JOIN_TOL:
            warn.append(f"{names[i]}~{names[i+1]} do not meet"
                        + (f" ({best[4]:.0f} m)" if best else ""))
            links.append(None)
        else:
            links.append(best)

    out: list[list[tuple[float, float]]] = []
    for i, group in enumerate(pieces):
        prev_link = links[i - 1] if i > 0 else None
        next_link = links[i] if i < len(links) else None
        idx_prev = prev_link[1] if prev_link else None
        idx_next = next_link[0] if next_link else None
        idx = idx_next if idx_next is not None else idx_prev
        if idx is None and group:
            # a one-street stretch may span several runs — see `runs_between`
            picks = runs_between(group, term)
            for pi in picks:
                poly_i = group[pi]
                tot_i = arc(poly_i)[-1]
                lo_i, hi_i = 0.0, tot_i
                for k, side in ((0, term[0]), (1, term[1])):
                    if not side:
                        continue
                    b = min((meet(poly_i, q) for q in side), key=lambda m: m[2])
                    if b[2] > 60.0:
                        continue
                    # cut at the terminus, keeping the half that runs toward
                    # the other end of the described stretch
                    if b[0] > tot_i / 2:
                        hi_i = min(hi_i, b[0])
                    else:
                        lo_i = max(lo_i, b[0])
                piece_i = clip(poly_i, lo_i, hi_i)
                if len(piece_i) > 1:
                    out.append(piece_i)
            if len(picks) > 1:
                warn.append(f"{names[i]} spans {len(picks)} runs of the street")
            continue
        if idx is None:
            continue
        if idx_prev is not None and idx_next is not None and idx_prev != idx_next:
            warn.append(f"{names[i]} is not one run between its junctions")
            idx = idx_next
        poly = group[idx]
        total = arc(poly)[-1]
        t_prev = prev_link[3] if (prev_link and prev_link[1] == idx) else None
        t_next = next_link[2] if (next_link and next_link[0] == idx) else None
        lo = 0.0 if t_prev is None else t_prev
        hi = total if t_next is None else t_next
        # an END of the route keeps a bounded run past its only junction: the
        # ordinance names a terminus ("to Twentieth avenue") that this pass
        # does not resolve, so the alternative is the whole street.
        # a named terminus cuts the end; otherwise a bounded run, because the
        # alternative is the whole street across the city
        if t_prev is None and i == 0 and term[0]:
            best = min((meet(poly, q) for q in term[0]), key=lambda m: m[2])
            if best[2] <= JOIN_TOL:
                t_prev = best[0]
            else:
                warn.append(f"terminus for {names[i]} not found ({best[2]:.0f} m)")
        if t_next is None and i == len(pieces) - 1 and term[1]:
            best = min((meet(poly, q) for q in term[1]), key=lambda m: m[2])
            if best[2] <= JOIN_TOL:
                t_next = best[0]
            else:
                warn.append(f"terminus for {names[i]} not found ({best[2]:.0f} m)")
        lo = 0.0 if t_prev is None else t_prev
        hi = total if t_next is None else t_next
        if t_prev is None and t_next is not None:
            lo = max(0.0, t_next - 1600.0)
        if t_next is None and t_prev is not None:
            hi = min(total, t_prev + 1600.0)
        piece = clip(poly, lo, hi)
        if len(piece) > 1:
            out.append(piece)
    return out, warn


def resolve(route: dict, streets: dict) -> dict:
    """A route's street list -> the geometry the city publishes for it."""
    got, missed = [], []
    for name in route["streets"]:
        hit = next(((k, streets[k]) for k in candidates(name) if k in streets), None)
        if hit:
            got.append({"street": name, "key": hit[0], "lines": hit[1]})
        else:
            missed.append(name)
    def look(nm: str) -> list:
        if not nm:
            return []
        for k in candidates(nm):
            if k in streets:
                return streets[k]
        return []
    ends = [look(route.get("from") or ""), look(route.get("to") or "")]
    path, warn = chain([g["lines"] for g in got], [g["street"] for g in got], ends)
    km = length_m(path) / 1000
    return {"resolved": got, "missed": missed, "km": km, "path": path, "warn": warn}


def crosscheck(routes: list[dict], tol: float = 45.0) -> None:
    """DOES A ROUTE READ OFF 1917 LAND ON THE TRACK THAT IS STILL THERE?

    The strongest check available needs no scan at all. Where a line SURVIVES,
    the route resolved from the ordinance must lie on top of the geometry
    DataSF publishes today: the J still runs on Church Street, the L still runs
    Ulloa-Taraval. So every vertex is scored against `base/rail.json`, and a
    route that reads correctly comes out mostly covered.

    A LOW SCORE IS NOT AUTOMATICALLY WRONG. A line that was cut back, or a
    stretch abandoned, SHOULD miss -- that is the network this exists to
    recover. The number is a flag to go and look at, not a verdict, and it is
    printed for every route rather than only the comfortable ones.
    """
    rail = json.loads((ROOT / "website/public/data/us/sf/city/base/rail.json").read_text())
    pts = []
    for x0, y0, x1, y1, _kind, _yr in rail["segs"]:
        pts.append((x0, y0))
        pts.append((x1, y1))
    # a coarse grid so the scoring is not quadratic over 1,900 points a vertex
    cell = 60.0
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for x, y in pts:
        grid.setdefault((int(x // cell), int(y // cell)), []).append((x, y))
    def near(x: float, y: float) -> float:
        gx, gy = int(x // cell), int(y // cell)
        best = float("inf")
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for px, py in grid.get((gx + dx, gy + dy), ()):
                    best = min(best, math.hypot(px - x, py - y))
        return best
    print(f"\n{'route':40s} {'on today track':>15s}   verdict")
    for r in routes:
        vs = [v for ln in r["path"] for v in ln]
        if not vs:
            print(f"{r['name'][:40]:40s} {'no geometry':>15s}")
            continue
        hit = sum(1 for x, y in vs if near(x, y) <= tol)
        pct = 100 * hit / len(vs)
        verdict = ("lands on the surviving line" if pct >= 70 else
                   "partly on it -- LOOK" if pct >= 25 else
                   "off the modern network (abandoned, or wrong)")
        print(f"{r['name'][:40]:40s} {pct:14.1f}%   {verdict}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="resolve and report, write nothing")
    ap.add_argument("--crosscheck", action="store_true",
                    help="score each resolved route against today's track")
    a = ap.parse_args()

    streets = load_streets()
    print(f"{len(streets):,} distinct street names carry geometry")

    seed = json.loads(SEED.read_text())
    routes = seed["routes"]
    total_km = 0.0
    misses = 0
    resolved_routes = []
    print(f"\n{'route':34s} {'year':>5s} {'streets':>8s} {'km':>7s}  missing")
    for r in routes:
        res = resolve(r, streets)
        total_km += res["km"]
        misses += len(res["missed"])
        resolved_routes.append({**r, **res})
        miss = ", ".join(res["missed"] + res["warn"]) if (res["missed"] or res["warn"]) else "-"
        print(f"{r['name'][:34]:34s} {r['year']:5d} "
              f"{len(res['resolved']):3d}/{len(r['streets']):<4d} "
              f"{res['km']:7.2f}  {miss}")
    print(f"\n{total_km:.1f} km over {len(routes)} routes, {misses} street(s) unresolved")

    if a.crosscheck:
        crosscheck(resolved_routes)
    if a.check or a.crosscheck:
        return

    P = json.loads(MANIFEST.read_text())["proj"]
    payload = {
        "note": "the historic network, resolved from the Board's own route "
                "descriptions onto DataSF street centrelines. Geometry is "
                "TODAY'S streets; the SELECTION and the DATE are the record's.",
        "proj": {"lon0": P["lon0"], "lat0": P["lat0"]},
        "routes": [
            {
                "name": r["name"], "year": r["year"], "kind": r["kind"],
                "ended": r.get("ended"),
                "ended_source": r.get("ended_source"),
                "ended_quote": r.get("ended_quote"),
                "source": r["source"], "quote": r["quote"],
                "missed": r["missed"],
                "lines": [[[round(x, 1), round(y, 1)] for x, y in ln]
                          for ln in r["path"]],
            }
            for r in resolved_routes
        ],
    }
    OUT.write_text(json.dumps(payload) + "\n")
    print(f"wrote {OUT} {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
