# -*- coding: utf-8 -*-
"""MAKE THE STORE SURVIVE THE LOSS OF THE FILE ITS IDS POINT INTO.

    python3 pipeline/scripts/us_sf_city/plain/fingerprint.py            # write
    python3 pipeline/scripts/us_sf_city/plain/fingerprint.py --check     # verify

── THE PROBLEM THIS EXISTS FOR ─────────────────────────────────────────────
A row in `plain_lines.jsonl` is `{"id": "<volume>|<index>", "line": …}` and
that index is a POSITION in `/tmp/items_merged.jsonl` — 134 MB, built once,
by hand, from a script that was never committed.

So the corpus has two failure modes and they are not the same:

  the file is DELETED    — every line survives, but nothing can say which
                           record it describes
  the file is REBUILT    — worse. If the rebuild orders records even slightly
                           differently, every id still resolves, silently, to
                           the WRONG record. 91,000 fluent sentences, each
                           attached to a neighbour.

The second is the dangerous one because nothing fails. A checksum catches it
only if you thought to take one first.

── WHAT IS RECORDED ────────────────────────────────────────────────────────
`plain_lines_anchors.jsonl` holds, per written row, the id and a short hash of
the record's own opening words. That is enough to do two different things:

  VERIFY   — after any rebuild, re-hash and compare. A single mismatch means
             the indexing moved and the ids can no longer be trusted.
  REPAIR   — match on the anchor instead of the index, and the store re-attaches
             itself to a rebuilt file that is ordered differently.

The anchor is taken from the record's first 160 characters with whitespace
collapsed — not the whole text, because the OCR of a long record can differ
between passes at the tail while its opening stays stable.

`manifest.json` holds the whole-file checksum and counts, so an identical
rebuild can be proven identical in one step rather than 91,000.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, "/tmp")
sys.path.insert(0, str(HERE))

import harness as H  # noqa: E402

assert pathlib.Path(H.__file__).parent == HERE, f"wrong harness: {H.__file__}"

DATA = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos")
ANCHORS = DATA / "plain_lines_anchors.jsonl"
MANIFEST = DATA / "items_manifest.json"
ITEMS = pathlib.Path(H.ITEMS)


def anchor(text: str) -> str:
    s = re.sub(r"\s+", " ", (text or "")).strip()[:160]
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]


def file_sha256(p: pathlib.Path) -> tuple[str, int, int]:
    h = hashlib.sha256()
    n = 0
    size = 0
    with p.open("rb") as fh:
        while True:
            b = fh.read(1 << 20)
            if not b:
                break
            size += len(b)
            n += b.count(b"\n")
            h.update(b)
    return h.hexdigest(), n, size


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not ITEMS.exists():
        sys.exit(f"{ITEMS} is gone — this is exactly the case the anchors are "
                 f"for, but they can only be USED against a rebuilt file, not "
                 f"against nothing. Rebuild it, then run --check.")

    recs = {r["id"]: r for r in H.load_records()}
    store = [json.loads(l) for l in (DATA / "plain_lines.jsonl").open()]

    if args.check:
        if not ANCHORS.exists():
            sys.exit(f"no {ANCHORS.name} to check against")
        want = {json.loads(l)["id"]: json.loads(l)["a"] for l in ANCHORS.open()}
        moved = missing = 0
        for row in store:
            rec = recs.get(row["id"])
            if rec is None:
                missing += 1
                continue
            if want.get(row["id"]) and anchor(rec["t"]) != want[row["id"]]:
                moved += 1
        sha, lines, size = file_sha256(ITEMS)
        man = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
        print(f"items file   {sha[:16]}…  {lines:,} lines  {size/1e6:.1f} MB")
        print(f"  recorded   {man.get('sha256','(none)')[:16]}…  "
              f"{man.get('lines',0):,} lines")
        print(f"  identical  {sha == man.get('sha256')}")
        print(f"\nwritten rows {len(store):,}")
        print(f"  id resolves to a record   {len(store)-missing:,}")
        print(f"  id resolves to a DIFFERENT record  {moved:,}")
        if moved:
            print("\n  the indexing moved. Do not rebuild exports from this "
                  "file — re-attach the store on the anchor first.")
        sys.exit(1 if (moved or missing) else 0)

    with ANCHORS.open("w") as fh:
        n = 0
        for row in store:
            rec = recs.get(row["id"])
            if rec is None:
                continue
            fh.write(json.dumps({"id": row["id"], "a": anchor(rec["t"])}) + "\n")
            n += 1
    sha, lines, size = file_sha256(ITEMS)
    MANIFEST.write_text(json.dumps({
        "note": "the file the store's ids index into. Its ids are positions, "
                "so a rebuild that orders records differently repoints every "
                "written line at the wrong record without failing.",
        "path": str(ITEMS),
        "sha256": sha, "lines": lines, "bytes": size,
        "anchors": n, "store_rows": len(store),
        "anchor_rule": "sha1 of the record's first 160 chars, whitespace "
                       "collapsed, truncated to 12 hex",
    }, indent=1) + "\n")
    print(f"{n:,} anchors written for {len(store):,} store rows")
    print(f"items file {sha[:16]}…  {lines:,} lines  {size/1e6:.1f} MB")


if __name__ == "__main__":
    main()
