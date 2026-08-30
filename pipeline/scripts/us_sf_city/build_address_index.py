"""Any address in San Francisco → the block the fiche opens for it.

    website/public/data/us/sf/city/blocks/address-index.json

WHY THIS EXISTS, AND WHAT IT REPLACED. The search index holds 1,052 doors — the
ones the Board of Supervisors printed a house number for. San Francisco has on
the order of two hundred thousand addresses, so the ordinary outcome of a
reader typing where they live was a miss, and the best answer available was
*"here is the street it stands on"*.

That was not the best answer available. It was the best answer available
WITHOUT LOOKING, and the thing to look at was already cached:
`cache_facts/parcel_points.json` is 227,668 rows of the assessor's active
parcels, pulled from `acdm-wktn` with a `$select` that took the centroid and
dropped the address columns beside it. The same dataset publishes

    from_address_num · to_address_num · street_name · street_type · block_num

which is an address-to-block join with no geocoding in it at all: no
coordinates, no nearest-neighbour, no guessing. The assessor already says which
block a house number is on, and `block_num` is the very id this map draws.

MEASURED on the shipped files: **18,169 of 18,173 block-street faces (100.0 %)
land on a block this map draws**, covering 211,602 addressed parcels over 5,291
blocks. Four parcel blocks are not on the map and 113 map blocks carry no
addressed parcel — piers, park land and the like, which is what you would
expect and not a join failure.

WHAT IS SHIPPED IS THE FACES, NOT THE ADDRESSES. One row per (street, block)
with the low and high house number on it — 18,173 rows rather than 211,602 —
because a range answers the question and the individual parcels do not need to
be in the browser. `1234 Guerrero St` is the face whose street is Guerrero and
whose range contains 1234.

THIS DOES NOT CLAIM THE RECORD SAYS ANYTHING ABOUT THE ADDRESS. It says which
block the address is on. Whether the Board ever decided anything there is a
different question and the fiche answers it — often with a century of
decisions, sometimes with none.

Run:
    python3 pipeline/scripts/us_sf_city/build_address_index.py [--refresh]
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLOCKS = os.path.join(ROOT, "website/public/data/us/sf/city/blocks")
CACHE = os.path.join(HERE, "cache_facts")
OUT = os.path.join(BLOCKS, "address-index.json")
CACHED = os.path.join(CACHE, "parcel_faces.json")

SOCRATA = "https://data.sfgov.org/resource/{ds}.json?"
UA = {"User-Agent": "qipu-pipeline/1.0 (open data)"}
DS = "acdm-wktn"

# the same shape the search index prints, so `Guerrero St` in one file and
# `Guerrero St` in the other are the same four characters
SUFFIX = {
    "ST": "St", "AVE": "Ave", "BLVD": "Blvd", "RD": "Rd", "DR": "Dr",
    "WAY": "Way", "PL": "Pl", "CT": "Ct", "TER": "Ter", "ALY": "Aly",
    "LN": "Ln", "HWY": "Hwy", "CIR": "Cir", "PARK": "Park", "PLZ": "Plz",
    "WALK": "Walk", "STPS": "Stps", "ROW": "Row", "PATH": "Path",
    "LOOP": "Loop", "EXPY": "Expy", "BLVD N": "Blvd N", "BLVD S": "Blvd S",
}


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


def _soql(params: dict[str, str]) -> str:
    return SOCRATA.format(ds=DS) + urllib.parse.urlencode(
        {("$" + k): v for k, v in params.items()}
    )


def street_label(name: str, typ: str) -> str:
    """`GUERRERO` + `ST` → `Guerrero St`; `19TH` + `ST` → `19th St`."""
    words = []
    for w in (name or "").split():
        low = w.lower()
        if re.match(r"^\d+(st|nd|rd|th)$", low):
            words.append(low)
        else:
            words.append(
                re.sub(r"(^|[\s'-])([a-z])",
                       lambda m: m.group(1) + m.group(2).upper(), low)
            )
    lab = " ".join(words)
    suf = SUFFIX.get((typ or "").upper().strip())
    return f"{lab} {suf}" if suf else lab


def fetch(refresh: bool) -> list[dict]:
    if not refresh and os.path.exists(CACHED):
        return json.load(open(CACHED))
    os.makedirs(CACHE, exist_ok=True)
    print("  the assessor's parcels, folded to one row per street and block")
    url = _soql({
        "select": "block_num,street_name,street_type,"
                  "min(from_address_num) AS lo,max(to_address_num) AS hi",
        "where": "active=true AND from_address_num IS NOT NULL",
        "group": "block_num,street_name,street_type",
        "limit": "50000",
    })
    blob = _get(url)
    rows = json.loads(blob)
    open(CACHED, "wb").write(blob)
    open(CACHED + ".meta.json", "w").write(json.dumps({
        "url": url,
        "what": f"{DS} active parcels, one row per (block, street) with the "
                "house-number range on that face",
        "bytes": len(blob),
        "rows": len(rows),
        "sha256": hashlib.sha256(blob).hexdigest(),
        "retrieved_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=1))
    return rows


def main() -> int:
    rows = fetch("--refresh" in sys.argv)
    on_map = set(json.load(open(os.path.join(BLOCKS, "block-index.json")))["b"])

    # street label → id, and the faces under it
    streets: dict[str, int] = {}
    faces: list[tuple[int, int, int, str]] = []
    no_block = 0
    no_name = 0
    no_range = 0
    for r in rows:
        b = r.get("block_num")
        if not b or b not in on_map:
            no_block += 1
            continue
        lab = street_label(r.get("street_name") or "", r.get("street_type") or "")
        # `UNKNOWN` is the assessor's own value, not a parse failure of ours:
        # 701 faces carry it and there is nothing to search them by.
        if not lab or lab.lower().startswith("unknown"):
            no_name += 1
            continue
        try:
            lo = int(r["lo"])
            hi = int(r["hi"])
        except (KeyError, TypeError, ValueError):
            no_range += 1
            continue
        if lo > hi:
            lo, hi = hi, lo
        sid = streets.setdefault(lab, len(streets))
        faces.append((sid, lo, hi, b))

    # sorted by street then by low number, so a lookup is a slice and a scan
    faces.sort(key=lambda f: (f[0], f[1], f[2]))
    order = sorted(streets.items(), key=lambda kv: kv[1])

    payload = {
        "generated_by": "pipeline/scripts/us_sf_city/build_address_index.py",
        "WHAT_A_FACE_IS": "One row per street per assessor block, carrying the "
                          "lowest and highest house number the assessor "
                          "publishes on it. An address is on the face whose "
                          "street matches and whose range contains its number.",
        "NOT_A_CLAIM_ABOUT_THE_RECORD": "This says which block an address is "
                                        "on. It does not say the Board of "
                                        "Supervisors ever decided anything "
                                        "there; the fiche answers that.",
        "COLUMNS_JOIN_BY_POSITION": "`s`, `lo`, `hi` and `b` are parallel. "
                                    "`streets` is the label per street id, and "
                                    "the faces are sorted by (s, lo).",
        "n_faces": len(faces),
        "n_streets": len(streets),
        "streets": [k for k, _ in order],
        "s": [f[0] for f in faces],
        "lo": [f[1] for f in faces],
        "hi": [f[2] for f in faces],
        "b": [f[3] for f in faces],
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
        f.write("\n")

    kb = os.path.getsize(OUT) / 1024
    print(f"{len(rows):>7}  faces published by the assessor")
    print(f"{no_name:>7}  dropped — the assessor's street is UNKNOWN")
    print(f"{no_block:>7}  dropped — the block is not one this map draws")
    print(f"{no_range:>7}  dropped — no usable house-number range")
    print(f"{len(faces):>7}  faces kept over {len(streets)} streets · {kb:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
