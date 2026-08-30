"""Every source's marks, concatenated into the one file the map reads.

    python3 pipeline/scripts/us_sf_city/build_theme_marks.py

INPUT   website/public/data/us/sf/city/blocks/theme-marks.<source>.json   (N of them)
OUTPUT  website/public/data/us/sf/city/blocks/theme-marks.json            (1)

WHY THERE IS AN INDIRECTION HERE AT ALL, given there is one source today.

The first version of this had `build_index.py` write the file the renderer
reads. That works exactly as long as the Board's minutes are the only thing
that can put a dot on the map, and it stops working the moment anything else
can — because a second source would either have to be built by the blocks
builder, which knows nothing about it, or overwrite the file the first one
wrote. Both of those are discovered late and fixed expensively.

So each source builds its own file, on its own schedule, from its own corpus,
and this concatenates them. Adding one is: write `theme-marks.<name>.json` in
the shape below, and run this. Nothing here has to be told about it — the glob
finds it, and the checks below decide whether it may be published.

THE SHAPE. Parallel arrays, one entry per mark, no strings on the hot path:

    s   which source (index into `sources`)
    b   assessor block index, or -1 where the source has no block. This is a
        SHORTCUT, not the address — kept because the Board's own half already
        has it and a block lookup is cheaper than a spatial one.
    r   the record, in whatever way that source addresses records:
          open="block"  -> fetch block shard for `b`, take `d[r]`
          open="place"  -> `sources[s].keys[r]` is the slug
    x,y the mark's position in the SHARED METRE FRAME (city manifest `proj`).
        This is the real address and every source must produce it.
    yr  the year, for the time window
    m   the theme bitmask, over `themes.json` t[].bit

WHAT THIS REFUSES TO PUBLISH, and why each one is a real failure mode:

  - a source whose arrays are not all the same length — a silent off-by-one
    would draw every mark after it at the wrong place, with no error
  - a coordinate outside San Francisco's own bounding box — the commonest
    symptom of a source that projected lon/lat wrongly, and it is invisible on
    a map that just pans away from it
  - a theme bit no vocabulary defines — a mark that no filter can ever show
  - `open="place"` with no `keys`, or an `r` outside it — a dot that cannot be
    opened is worse than no dot
"""
from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLOCKS = os.path.join(ROOT, "website/public/data/us/sf/city/blocks")
MANIFEST = os.path.join(ROOT, "website/public/data/us/sf/city/manifest.json")
OUT = os.path.join(BLOCKS, "theme-marks.json")

ARRAYS = ("b", "r", "x", "y", "yr", "m")

# San Francisco in the shared metre frame, with room to spare. The city is
# ~12 km across; anything outside this is a projection mistake, not a place.
X_LO, X_HI = -8000.0, 20000.0
Y_LO, Y_HI = -8000.0, 20000.0


def die(msg: str) -> None:
    sys.exit(f"REFUSED: {msg}")


def main() -> int:
    if not os.path.exists(os.path.join(BLOCKS, "themes.json")):
        die("themes.json is not published; run build_index.py first.")
    vocab = json.load(open(os.path.join(BLOCKS, "themes.json")))
    nbits = len(vocab["t"])
    proj = json.load(open(MANIFEST)).get("proj") or {}

    files = sorted(glob.glob(os.path.join(BLOCKS, "theme-marks.*.json")))
    files = [f for f in files if os.path.basename(f) != "theme-marks.json"]
    if not files:
        die("no theme-marks.<source>.json files found.")

    sources: list[dict] = []
    cols: dict[str, list] = {k: [] for k in ARRAYS}
    cols["s"] = []
    for f in files:
        d = json.load(open(f))
        meta = d.get("meta") or {}
        sid = meta.get("source")
        name = os.path.basename(f)
        if not sid:
            die(f"{name} has no meta.source.")
        if any(s["id"] == sid for s in sources):
            die(f"two files declare source '{sid}'.")
        missing = [k for k in ARRAYS if k not in d]
        if missing:
            die(f"{name} is missing array(s) {missing}.")
        n = len(d["b"])
        bad = [k for k in ARRAYS if len(d[k]) != n]
        if bad:
            die(f"{name}: arrays {bad} are not length {n}. An off-by-one here "
                f"draws every later mark at another mark's place, silently.")
        opn = meta.get("open")
        if opn not in ("block", "place"):
            die(f"{name}: meta.open is {opn!r}, expected 'block' or 'place'.")
        keys = d.get("keys")
        if opn == "place":
            if not keys:
                die(f"{name}: open='place' needs a `keys` list; a dot that "
                    f"cannot be opened is worse than no dot.")
            if any(not (0 <= r < len(keys)) for r in d["r"]):
                die(f"{name}: an `r` falls outside keys[{len(keys)}].")
        for i, (x, y) in enumerate(zip(d["x"], d["y"])):
            if not (X_LO <= x <= X_HI and Y_LO <= y <= Y_HI):
                die(f"{name}: mark {i} at ({x}, {y}) is outside San Francisco. "
                    f"This is what a bad lon/lat projection looks like.")
        for m in d["m"]:
            if m >> nbits:
                die(f"{name}: theme bit above {nbits-1}; no filter could show it.")
        si = len(sources)
        sources.append({"i": si, "id": sid,
                        "label": meta.get("label") or sid,
                        "open": opn, "n": n,
                        "file": name,
                        **({"keys": keys} if keys else {})})
        cols["s"].extend([si] * n)
        for k in ARRAYS:
            cols[k].extend(d[k])
        print(f"  {sid:<24} {n:>7,} marks   open={opn}")

    total = len(cols["s"])
    yrs = [y for y in cols["yr"] if y]
    # PER THEME, ACROSS EVERY SOURCE. `themes.json` counts the Board's half
    # only — it is written by the Board's own builder and cannot see the
    # others — so a chip reading off it says 455 while the map lights 456. The
    # number beside a filter has to be the number that filter produces.
    per_theme: dict[int, int] = {}
    for m in cols["m"]:
        b = 0
        while m:
            if m & 1:
                per_theme[b] = per_theme.get(b, 0) + 1
            m >>= 1
            b += 1
    out = {
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_city/build_theme_marks.py",
            "n_marks": total,
            "n_sources": len(sources),
            "frame": "shared metre frame — city manifest `proj`",
            "proj": {k: proj[k] for k in ("lon0", "lat0", "mpd", "cosl") if k in proj},
            "years": [min(yrs), max(yrs)] if yrs else [0, 0],
            # THE NUMBER THE UI MUST NOT IMPLY AWAY, once per source: a mixed
            # file has no single coverage figure, and one printed over the whole
            # map would be a fiction about every source in it.
            "coverage_is_per_source": True,
            # bit -> marks across every source; the number a chip prints
            "per_theme": {str(b): n for b, n in sorted(per_theme.items())},
        },
        "sources": sources,
        "s": cols["s"], "b": cols["b"], "r": cols["r"],
        "x": cols["x"], "y": cols["y"], "yr": cols["yr"], "m": cols["m"],
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    import gzip
    raw = os.path.getsize(OUT)
    gz = len(gzip.compress(open(OUT, "rb").read(), 9))
    print(f"\n{total:,} marks from {len(sources)} source(s) -> {OUT}")
    print(f"  {raw/1024:,.0f} KB raw / {gz/1024:,.0f} KB gzip")
    if yrs:
        print(f"  years {min(yrs)}–{max(yrs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
