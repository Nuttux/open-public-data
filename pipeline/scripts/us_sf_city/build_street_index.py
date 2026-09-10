"""Which streets actually have a record, and how many.

    website/public/data/us/sf/city/blocks/street/_index.json

WHY THIS EXISTS. A block lists the streets around it and offers each one as a
way in. 1,772 street keys are referenced by blocks; only 1,440 of them have a
file. The other **332 (19%)** were offered anyway, and clicking one fetched a
404, got an empty list back and drew a street with nothing on it and no
explanation — a dead end dressed as a link.

Nothing clickable may be a dead end, so the panel reads this index first: a
street with records is a link with its count on it, and a street without is
printed as plain text. The count also removes the placeholder the chooser was
showing ("the whole street") before the street's own file had been fetched.

About 25 KB, one fetch for the session.

Run:
    python3 pipeline/scripts/us_sf_city/build_street_index.py
"""
from __future__ import annotations

import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLOCKS = os.path.join(ROOT, "website/public/data/us/sf/city/blocks")
STREET = os.path.join(BLOCKS, "street")
# NOT inside `street/` — `shipped-figures.test.ts` walks that folder and
# expects every file in it to be a list of records.
OUT = os.path.join(BLOCKS, "street-index.json")


def file_name(key: str) -> str:
    """the same mapping `loadStreetRecord` uses in the browser"""
    return re.sub(r"[^A-Za-z0-9]+", "_", key)


def main() -> int:
    on_disk = {
        os.path.basename(f)[:-5]: f
        for f in glob.glob(os.path.join(STREET, "*.json"))
        if not os.path.basename(f).startswith("_")
    }

    referenced = set()
    # the block that holds the most of its own record among those fronting
    # the street — where a link to the street opens the map (`b` below)
    best: dict[str, tuple[int, str]] = {}
    for fn in sorted(glob.glob(os.path.join(BLOCKS, "block-*.json"))):
        for bid, rec in json.load(open(fn)).items():
            if isinstance(rec, dict):
                referenced.update(rec.get("s") or [])
                n_own = len(rec.get("d") or [])
                for k in rec.get("s") or []:
                    f = file_name(k)
                    if f not in best or n_own > best[f][0]:
                        best[f] = (n_own, bid)

    counts: dict[str, int] = {}
    for name, path in on_disk.items():
        try:
            rows = json.load(open(path))
        except Exception:
            continue
        if isinstance(rows, list) and rows:
            counts[name] = len(rows)

    hit = sum(1 for k in referenced if file_name(k) in counts)
    payload = {
        "generated_by": "pipeline/scripts/us_sf_city/build_street_index.py",
        "n_files": len(counts),
        "n_referenced_by_blocks": len(referenced),
        "n_referenced_with_records": hit,
        "WHY": "A street key absent from `n` has no record of its own. The panel "
               "prints it as text rather than offering a link that opens an empty "
               "page. 19% of the streets blocks name were in that state.",
        "n": dict(sorted(counts.items())),
        # file name → the block a street page opens the map on
        "b": {f: best[f][1] for f in sorted(counts) if f in best},
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))

    kb = os.path.getsize(OUT) / 1024
    print(f"{len(referenced):,} street keys referenced by blocks")
    print(f"{len(counts):,} streets have records")
    print(f"{hit:,} of the referenced ones do "
          f"({hit * 100 / max(len(referenced), 1):.0f}%) — "
          f"{len(referenced) - hit:,} would have been dead links")
    print(f"{OUT}  {kb:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
