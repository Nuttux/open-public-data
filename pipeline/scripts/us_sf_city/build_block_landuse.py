"""What was PROPOSED, permitted and built on a block — the record after the scans.

THIS IS NOT THE BOARD DECIDING. `block-records` answers *what the Board decided
here*, out of 142 scanned volumes of the Journal of Proceedings, and it stops in
1999 because the scanned series stops there. This file answers a DIFFERENT
question with a different subject:

    the city's own Planning Department record of what was PROPOSED on this
    block, what it decided about it, and how many homes it added or removed.

The subject is the applicant and the Planning Department, never the Board of
Supervisors, and nothing this file emits may be rendered under a heading that
says the Board decided anything. `subject` is carried inside the payload so the
renderer cannot lose it.

WHY THIS DATASET. The Board's own modern legislation lives in Legistar, and
Legistar carries NO location — placing it needs the Journal's address-extraction
pass, which does work on it (measured: 16.8% of matters place, 11.6% at block
precision; see LANDUSE.md §4) but reaches only 2000-2018, because the public API
genuinely ends at matter 181177 on 2018-12-11. This dataset is already keyed on
the assessor block, needs no extraction and no geocoding, and runs to the month
it was fetched.

    SOURCE  data.sfgov.org / qvu5-m3a2 "Planning Department Records - Projects"
            54,478 rows, 1974-05-21 .. today, one row per planning project

OUTPUT, and the tiers are the ones `block-records` already established:

    website/public/data/us/sf/city/blocks/block-landuse.json      T0, once
        columnar, one entry per assessor block that carries anything: how many
        projects, the year span, the count per decade, and the net homes.
        Plus `coverage` and `decades`, which are the honesty surface.

    website/public/data/us/sf/city/blocks/landuse/landuse-NN.json T1, per click
        the projects themselves — date, address, decision, the department's own
        description, and a link that resolves to the record.

Two stages, and the build never reaches the network:

    python3 pipeline/scripts/us_sf_city/build_block_landuse.py --fetch
    python3 pipeline/scripts/us_sf_city/build_block_landuse.py --build

── THE RULES THIS FILE KEEPS ─────────────────────────────────────────────────

1. **A row without a block is not placed.** 5,390 of the 54,478 rows carry no
   `block` at all, and a further handful carry one the map does not publish.
   None of them are guessed onto a neighbour. They are counted in `coverage`
   and dropped, and the count is shipped so the panel can say so.

2. **Post-1999 only.** `FROM_YEAR = 2000`. The pre-2000 tail exists and is not
   shipped, for two reasons: before 1981 the department has 38-56 rows a year,
   which is a records-system boundary rather than a quiet city; and 1981-1990
   carries a placeholder date — 2,335 rows fall on 01-01, against ~190 for any
   other calendar day, and every one of them is in that decade. Post-1999 the
   placeholder is ONE row in 40,605. The shipped range is the clean one, and
   the range the scanned Journal does not already answer.

3. **A decade is only as covered as its dates.** `decades` carries, per decade,
   the row count AND the first and last date actually present, AND `partial`.
   The current decade is partial by construction — it runs to the fetch date,
   not to 2029 — and a renderer that draws it as a full decade is drawing a
   collapse in the record that is really the calendar. This is the same failure
   the rail's own post-1999 caption was written to prevent, and it is why the
   flag ships inside the data rather than being recomputed in the panel.

4. **The description is the department's, verbatim, snipped.** Never composed,
   never summarised, never characterised. `SNIP` cuts on a word boundary and
   the cut is marked.

5. **Nothing is ranked by importance.** The rows in a shard are in date order,
   newest first, and that is the whole rule. A "top project" would be an
   editorial judgement this file has no standing to make.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "cache_facts"
REPO = HERE.parent.parent.parent
OUT = REPO / "website" / "public" / "data" / "us" / "sf" / "city" / "blocks"
IDS = (REPO / "website" / "public" / "data" / "us" / "sf" / "city"
       / "base" / "blocks-id.json")

DATASET = "qvu5-m3a2"
DATASET_NAME = "Planning Department Records - Projects"
LANDING = f"https://data.sfgov.org/d/{DATASET}"
SOCRATA = "https://data.sfgov.org/resource/{ds}.json?"
UA = {"User-Agent": "qipu-sf-city/1.0 (open data pipeline)"}

FROM_YEAR = 2000          # see rule 2
SNIP = 240                # characters of the department's description kept
SHARDS = 256              # T1 shard count; shard = blockIndex % SHARDS
TOP = 12                  # projects materialised per block in the click payload

# The columns that answer the question. `record_type` is not among them: every
# one of the 54,478 rows reads PRJ, so it discriminates nothing.
COLS = [
    "record_id", "project_name", "description", "project_address",
    "block", "lot", "open_date", "close_date", "record_status",
    "project_decision", "number_of_units_net", "building_permits",
]


# ---------------------------------------------------------------- fetch
def _get(url: str, timeout: int = 240) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 3:
                raise
            print(f"    retry {attempt + 1} after {e}")
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def _write(name: str, blob: bytes, url: str, rows: int | None, what: str) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / name).write_bytes(blob)
    (CACHE / f"{name}.meta.json").write_text(json.dumps({
        "url": url,
        "what": what,
        "bytes": len(blob),
        "rows": rows,
        "sha256": hashlib.sha256(blob).hexdigest(),
        "retrieved_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=1))
    print(f"    {name}  {len(blob):,} bytes  {rows if rows is not None else '?'} rows")


def _soql(ds: str, params: dict[str, str]) -> str:
    return SOCRATA.format(ds=ds) + urllib.parse.urlencode(
        {("$" + k): v for k, v in params.items()})


def _page(ds: str, params: dict[str, str], page: int = 20000) -> list[dict]:
    rows: list[dict] = []
    while True:
        p = dict(params, limit=str(page), offset=str(len(rows)))
        got = json.loads(_get(_soql(ds, p)))
        rows.extend(got)
        print(f"      … {len(rows):,}")
        if len(got) < page:
            return rows


def fetch(refresh: bool) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    name = "planning_projects.json"
    if not refresh and (CACHE / name).exists():
        print(f"  {name} present — --refresh to re-fetch")
        return

    # The WHOLE series is cached, pre-1999 tail included, so the artefact's own
    # range is a decision this build makes and can be re-decided without going
    # back to the network. `$order` on record_id makes the fetch deterministic:
    # Socrata does not promise an order, and an unordered paged read can repeat
    # or skip a row across page boundaries.
    print(f"  {DATASET} {DATASET_NAME}")
    params = {"select": ",".join(COLS), "order": "record_id"}
    rows = _page(DATASET, params)
    blob = json.dumps(rows, separators=(",", ":")).encode()
    _write(name, blob, _soql(DATASET, dict(params, limit="20000", offset="0")),
           len(rows),
           f"{DATASET} {DATASET_NAME}, one row per planning project, all years")


# ---------------------------------------------------------------- build
_WS = re.compile(r"\s+")


def _clean(s: str | None) -> str:
    return _WS.sub(" ", (s or "")).strip()


def _snip(s: str) -> str:
    """SNIP characters, cut on a word boundary, and the cut is marked."""
    s = _clean(s)
    if len(s) <= SNIP:
        return s
    cut = s[:SNIP]
    sp = cut.rfind(" ")
    if sp > SNIP * 0.6:
        cut = cut[:sp]
    return cut.rstrip(" ,;:.") + "…"


def _year(d: str | None) -> int:
    return int(d[:4]) if d and len(d) >= 4 and d[:4].isdigit() else 0


def _units(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def build() -> None:
    src = CACHE / "planning_projects.json"
    if not src.exists():
        sys.exit("no cache — run with --fetch first")
    meta = json.loads((CACHE / "planning_projects.json.meta.json").read_text())
    rows = json.loads(src.read_text())
    print(f"  {len(rows):,} source rows")

    published = set(json.loads(IDS.read_text())["id"])
    print(f"  {len(published):,} assessor blocks published by the map")

    # ---- the funnel, counted at every step ------------------------------
    c = Counter()
    c["src"] = len(rows)
    keep: list[dict] = []
    unpublished: Counter = Counter()
    for r in rows:
        y = _year(r.get("open_date"))
        if not y:
            c["no_date"] += 1
            continue
        if y < FROM_YEAR:
            c["before_2000"] += 1
            continue
        c["post1999"] += 1
        b = (r.get("block") or "").strip().upper()
        if not b:
            c["post1999_no_block"] += 1
            continue
        c["post1999_with_block"] += 1
        if b not in published:
            c["block_not_on_map"] += 1
            unpublished[b] += 1
            continue
        r["_b"], r["_y"] = b, y
        keep.append(r)
    c["placed"] = len(keep)

    print(f"  funnel: {c['src']:,} source"
          f" → {c['post1999']:,} post-{FROM_YEAR - 1}"
          f" → {c['post1999_with_block']:,} carry a block"
          f" → {c['placed']:,} placed on a block the map publishes")
    # WHY THESE ARE NOT RESCUED, measured rather than assumed. A planning row
    # may name a PARENT block the assessor has since split: the record writes
    # "4327" where the map publishes only "4327A". Resolving a parent to its
    # unique published child would be defensible — it is the same leading-4
    # digits + optional letter shape the facilities join already uses — and it
    # is NOT done, because the measurement says it is not worth an inference
    # rule: of the rows dropped here, only a handful resolve to a unique child,
    # a couple are ambiguous between two children, and most name a block id
    # that is simply malformed ("0000", "024", three digits where the assessor
    # uses four). Guessing would buy ~0.03% of rows and cost the rule that a
    # row without a block the map publishes is not placed.
    kids: dict[str, list[str]] = defaultdict(list)
    for pb in published:
        if len(pb) > 4:
            kids[pb[:4]].append(pb)
    drop = {"unique_child": 0, "ambiguous_children": 0, "no_such_block": 0}
    for bid, n in unpublished.items():
        k = kids.get(bid, [])
        if len(k) == 1:
            drop["unique_child"] += n
        elif k:
            drop["ambiguous_children"] += n
        else:
            drop["no_such_block"] += n
    if unpublished:
        print(f"  {len(unpublished)} block ids the map does not publish, "
              f"{sum(unpublished.values())} rows — NOT placed: {drop}")

    # ---- per-block rollup ------------------------------------------------
    by: dict[str, list[dict]] = defaultdict(list)
    for r in keep:
        by[r["_b"]].append(r)

    blocks = sorted(by)
    idx = {b: i for i, b in enumerate(blocks)}

    dec_lo = (FROM_YEAR // 10) * 10
    dec_hi = (max(r["_y"] for r in keep) // 10) * 10
    dec_list = list(range(dec_lo, dec_hi + 10, 10))

    b_arr, n_arr, y0_arr, y1_arr, un_arr, dec_arr = [], [], [], [], [], []
    for b in blocks:
        rs = by[b]
        ys = [r["_y"] for r in rs]
        per = [0] * len(dec_list)
        for y in ys:
            per[(y // 10 * 10 - dec_lo) // 10] += 1
        b_arr.append(b)
        n_arr.append(len(rs))
        y0_arr.append(min(ys))
        y1_arr.append(max(ys))
        # net homes, rounded — the roll publishes fractional units on some rows
        un_arr.append(round(sum(_units(r.get("number_of_units_net")) for r in rs)))
        dec_arr.append(per)

    # ---- decade honesty --------------------------------------------------
    # first/last DATE actually present, and whether the decade is complete.
    # `partial` is true for a decade the data does not cover end to end, which
    # is always the current one and is checked rather than assumed.
    dates_by_dec: dict[int, list[str]] = defaultdict(list)
    for r in keep:
        dates_by_dec[r["_y"] // 10 * 10].append(r["open_date"][:10])
    decades = {}
    for d in dec_list:
        ds = sorted(dates_by_dec.get(d, []))
        if not ds:
            decades[str(d)] = {"n": 0, "partial": True, "first": None, "last": None}
            continue
        full_last = f"{d + 9}-12-31"
        decades[str(d)] = {
            "n": len(ds),
            "first": ds[0],
            "last": ds[-1],
            # a decade whose last row predates its own end is not covered to
            # its end. For the current decade that is the calendar; the flag
            # says only that the decade is not whole, never why.
            "partial": ds[-1] < full_last,
            # the last date this decade actually covers — always the data's
            # own, never the fetch date. `partial` says whether that reaches
            # the decade's end; `through` says where it actually got to.
            "through": ds[-1],
        }

    n_pub = len(published)
    t0 = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generated_by": "pipeline/scripts/us_sf_city/build_block_landuse.py",
        # the label discipline, carried in the payload so it cannot be lost
        "subject": "planning",
        "what": ("The city's own Planning Department record of what was "
                 "proposed on this block, and what the department decided "
                 "about it. NOT the Board of Supervisors deciding."),
        "authority": "San Francisco Planning Department",
        "from_year": FROM_YEAR,
        "data_through": max(r["open_date"][:10] for r in keep),
        "shards": SHARDS,
        "top": TOP,
        "units": {
            "n": "planning projects opened on this block since 2000",
            "y0": "earliest open_date year on the block",
            "y1": "latest open_date year on the block",
            "un": ("number_of_units_net summed over the block's projects and "
                   "rounded — homes the applications propose to ADD or REMOVE, "
                   "as applied for. Not a count of homes built."),
            "d": "projects per decade, aligned to `decade_start`",
        },
        "decade_start": dec_list,
        "decades": decades,
        "coverage": {
            "src_rows": c["src"],
            "rows_before_2000": c["before_2000"],
            "rows_no_date": c["no_date"],
            "rows_post1999": c["post1999"],
            "rows_post1999_no_block": c["post1999_no_block"],
            "rows_post1999_block_not_on_map": c["block_not_on_map"],
            # why those rows were dropped, so the choice is inspectable and
            # nobody "repairs" it by guessing a neighbouring block
            "block_not_on_map_because": drop,
            "rows_placed": c["placed"],
            "pct_post1999_placed": round(100 * c["placed"] / max(1, c["post1999"]), 1),
            "blocks_with_any": len(blocks),
            "blocks_published": n_pub,
            "pct_blocks_with_any": round(100 * len(blocks) / max(1, n_pub), 1),
        },
        "sources": [{
            "id": DATASET,
            "name": DATASET_NAME,
            "landing": LANDING,
            "url": meta.get("url"),
            "retrieved_utc": meta.get("retrieved_utc"),
            "sha256": meta.get("sha256"),
            "rows": meta.get("rows"),
        }],
        "not_measured": [
            "Whether a proposed project was BUILT. This file carries what was "
            "applied for and what the department decided, never completion.",
            "Projects the department records without a block (see coverage). "
            "They are dropped, never attributed to a neighbouring block.",
            "Anything the Board of Supervisors decided after 1999. That record "
            "is in Legistar, carries no location, and is not in this file.",
        ],
        "b": b_arr, "n": n_arr, "y0": y0_arr, "y1": y1_arr,
        "un": un_arr, "d": dec_arr,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "block-landuse.json"
    p.write_text(json.dumps(t0, separators=(",", ":")))
    print(f"  block-landuse.json  {p.stat().st_size:,} bytes  "
          f"{len(blocks):,} blocks")

    # ---- T1 shards -------------------------------------------------------
    # shard = blockIndex % SHARDS, blockIndex being the position in `b` above —
    # character for character the rule `block-records.ts` already implements for
    # the record's own shards, so the panel's loader needs no new arithmetic.
    sh: dict[int, dict[str, list]] = defaultdict(dict)
    n_rows_shipped = 0
    for b in blocks:
        rs = sorted(by[b], key=lambda r: (r.get("open_date") or ""), reverse=True)
        out = []
        for r in rs[:TOP]:
            out.append({
                "y": r["_y"],
                "dt": (r.get("open_date") or "")[:10],
                "id": _clean(r.get("record_id")),
                "a": _clean(r.get("project_address")),
                "t": _snip(r.get("description")) or _clean(r.get("project_name")),
                "st": _clean(r.get("record_status")),
                "dc": _clean(r.get("project_decision")),
                "u": round(_units(r.get("number_of_units_net"))),
            })
        n_rows_shipped += len(out)
        sh[idx[b] % SHARDS][b] = out

    sd = OUT / "landuse"
    sd.mkdir(parents=True, exist_ok=True)
    for old in sd.glob("landuse-*.json"):
        old.unlink()
    sizes = []
    for k, v in sh.items():
        f = sd / f"landuse-{k:02d}.json"
        f.write_text(json.dumps(v, separators=(",", ":")))
        sizes.append(f.stat().st_size)
    print(f"  landuse/landuse-NN.json  {len(sh)} shards, "
          f"{n_rows_shipped:,} projects, "
          f"median {sorted(sizes)[len(sizes) // 2]:,} bytes, "
          f"max {max(sizes):,} bytes")

    # ---- self-check ------------------------------------------------------
    assert sum(n_arr) == c["placed"], "per-block counts do not sum to placed"
    assert sum(sum(x) for x in dec_arr) == c["placed"], "decade counts do not sum"
    assert sum(d["n"] for d in decades.values()) == c["placed"], "decades do not sum"
    assert all(b in published for b in b_arr), "a block escaped the published set"
    print(f"  checks pass: {c['placed']:,} placed projects reconcile across "
          f"per-block, per-decade and the funnel")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--refresh", action="store_true",
                    help="with --fetch, re-fetch even if cached")
    a = ap.parse_args()
    if not (a.fetch or a.build):
        ap.error("one of --fetch / --build")
    if a.fetch:
        print("fetch")
        fetch(a.refresh)
    if a.build:
        print("build")
        build()


if __name__ == "__main__":
    main()
