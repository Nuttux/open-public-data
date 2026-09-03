#!/usr/bin/env python3
"""
bundle_city_chunks.py — 713 FILES INTO EIGHT.

── WHY ──────────────────────────────────────────────────────────────────────
The GL map fetches the city a TIER at a time and never a chunk at a time:
`CityGLMap` calls `loadBase()` and then `loadTier()` for bldg, face, roof,
canopy, strt and tree, and nothing in the app calls `setView`, which is the
only caller that ever wanted a single cell. So 713 separate HTTP requests buy
nothing, and they cost a great deal.

MEASURED on a production build over a shaped 50 Mbps link with 40 ms of
latency — the boot took 13.4 s, of which only 4.5 s was bytes. The other
8.4 s was request overhead: 719 requests, 231 of them under 8 KB, up to 671
in flight at once. On a phone, where the connection is worse and the socket
pool smaller, the same boot took over 30 s.

A tier is always wanted whole, so a tier should be one file.

── WHAT THIS WRITES ─────────────────────────────────────────────────────────
`bundle/<tier>.qcb` is the tier's chunks concatenated in MANIFEST ORDER, with
nothing between them: a `.qc` is self-describing (magic, header length,
payload length, CRC) and carries its own key, so a concatenation needs no
container of its own and the reader slices it with the offsets recorded here.

Each chunk entry gains `off`, its byte offset in its tier's bundle. The
manifest gains `bundles`, one entry a tier, so a reader can tell a city that
has been bundled from one that has not and take the per-chunk path otherwise.

    tier      files      raw MB   gzip MB
    roof        136       4.74      2.78
    bldg        138       3.49      1.86
    strt        128       2.90      1.35
    face        139       1.99      0.51
    water1       26       1.48      0.23
    base         16       1.37      0.69
    tree        129       1.31      0.51
    canopy        1       0.29      0.14
    TOTAL       713      17.57      8.06

── AND THE PER-CHUNK FILES STAY ─────────────────────────────────────────────
By default the `.qc` files are left where they are, and `lib/city/data.ts`
falls back to them if a bundle will not load. 17.6 MB of duplication buys a
rollout that cannot take the map down, which is worth it exactly once. Pass
`--prune` to remove them after the bundles have been proved in production.

Re-runnable: reads the `.qc` files, never the previous bundles, so running it
twice gives the same answer. Run it after `encode_city_chunks.py`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CITY = ROOT / "website" / "public" / "data" / "us" / "sf" / "city"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--city", type=Path, default=CITY, help="the city's data directory")
    ap.add_argument("--prune", action="store_true",
                    help="delete the per-chunk .qc files once the bundles are written")
    a = ap.parse_args()

    mpath = a.city / "manifest.json"
    manifest = json.loads(mpath.read_text())
    chunks = manifest["chunks"]

    # tier -> the chunks in it, in manifest order. The order is the contract:
    # `off` is only meaningful against the bundle this same order produced.
    tiers: dict[str, list[dict]] = {}
    for c in chunks:
        tiers.setdefault(c["tier"], []).append(c)

    out = a.city / "bundle"
    out.mkdir(exist_ok=True)
    bundles: dict[str, dict] = {}
    total_files = 0
    total_bytes = 0

    for tier, cs in tiers.items():
        blob = bytearray()
        for c in cs:
            qc = a.city / f"{c['k']}.qc"
            if not qc.exists():
                print(f"  ! missing {qc.relative_to(a.city)}", file=sys.stderr)
                return 1
            data = qc.read_bytes()
            # `b` is the manifest's own byte count; a mismatch means the
            # manifest and the files have drifted and the offsets would lie.
            if "b" in c and c["b"] != len(data):
                print(f"  ! {c['k']}: manifest says {c['b']} bytes, file has {len(data)}",
                      file=sys.stderr)
                return 1
            c["off"] = len(blob)
            blob += data
        path = out / f"{tier}.qcb"
        path.write_bytes(blob)
        # `v` is the bundle's own content, so a reader can put it on the URL
        # and the CDN can hold the file for a year: a rebuild that changes a
        # byte changes the URL, one that changes nothing keeps the cache.
        bundles[tier] = {"file": f"bundle/{tier}.qcb", "bytes": len(blob), "n": len(cs),
                         "v": hashlib.sha1(blob).hexdigest()[:10]}
        total_files += len(cs)
        total_bytes += len(blob)
        print(f"  {tier:<8} {len(cs):>4} chunks  {len(blob)/1048576:>7.2f} MB  -> {path.name}")

    manifest["bundles"] = bundles
    mpath.write_text(json.dumps(manifest, separators=(",", ":")))
    print(f"\n  {total_files} chunks -> {len(bundles)} bundles, {total_bytes/1048576:.2f} MB")

    if a.prune:
        n = 0
        for c in chunks:
            qc = a.city / f"{c['k']}.qc"
            if qc.exists():
                qc.unlink()
                n += 1
        print(f"  pruned {n} per-chunk .qc files")
    else:
        print("  per-chunk .qc files kept (pass --prune once the bundles are proved)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
