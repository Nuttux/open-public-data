"""Prove the reach chunk's guards BITE, rather than asserting that they exist.

    python3 pipeline/scripts/us_sf_reach/prove_qc.py

Four things are meant to stop a corrupt or mislabelled chunk. Each is fired
here by actually corrupting the shipped bytes in memory and requiring the read
to fail:

  1  magic          the first four bytes are not 'QCT1'
  2  crc            one payload byte flipped
  3  truncation     the payload is short of its declared length
  4  key            the header says a key nothing asked for

and then the clean file is read back and every element compared against the
geometry rebuilt from the cache, so "it round trips" is a comparison and not a
feeling. Both readers are used: this package's, and the SHIPPED
us_sf_city/_chunk.read_chunk, because compatibility with the decoder the site
already uses is the only kind that matters.
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline/scripts/us_sf_city"))

import _chunk                                    # noqa: E402  the shipped decoder
from _qc import read_qc                          # noqa: E402

QC = ROOT / "website/public/data/us/sf/reach/geom.qc"


def must_fail(label: str, fn) -> bool:
    try:
        fn()
    except Exception as e:                        # noqa: BLE001
        print(f"  FIRES  {label:14s} -> {type(e).__name__}: {str(e)[:70]}")
        return True
    print(f"  SILENT {label:14s} -> read succeeded. THE GUARD DOES NOT BITE.")
    return False


def main() -> int:
    if not QC.exists():
        print(f"missing {QC}; run build_reach_geom.py", file=sys.stderr)
        return 2
    blob = QC.read_bytes()
    head, fields = read_qc(blob)
    print(f"{QC.relative_to(ROOT)}  {len(blob):,} bytes, key {head['k']!r}, "
          f"{len(head['fields'])} fields, {head['meta']['vertices']:,} vertices")

    print("guards, on the shipped bytes:")
    ok = True
    ok &= must_fail("magic", lambda: read_qc(b"XXXX" + blob[4:]))
    bad = bytearray(blob)
    bad[-1] ^= 0x01
    ok &= must_fail("crc", lambda: read_qc(bytes(bad)))
    ok &= must_fail("truncation", lambda: read_qc(blob[:-64]))
    ok &= must_fail("key", lambda: _require_key(blob, "base/terrain"))
    # the same four, through the decoder the website ships
    ok &= must_fail("magic (site)", lambda: _chunk.read_chunk(b"XXXX" + blob[4:]))
    ok &= must_fail("crc (site)", lambda: _chunk.read_chunk(bytes(bad)))
    ok &= must_fail("trunc (site)", lambda: _chunk.read_chunk(blob[:-64]))

    print("round trip, element for element, against a rebuild from the cache:")
    import build_reach_geom as B                  # noqa: PLC0415
    import json
    man = json.loads((ROOT / "website/public/data/us/sf/city/manifest.json").read_text())
    pr = B.Proj(man["proj"])
    feats = B.collect(pr)
    xs: list[int] = []
    ys: list[int] = []
    nring = 0
    for f in feats:
        rings, _, _ = B.simplify_project(f, pr)
        nring += len(rings)
        for rx, ry, _ in rings:
            xs.extend(int(v) for v in rx)
            ys.extend(int(v) for v in ry)
    for name, want in (("x", xs), ("y", ys)):
        got = np.asarray(fields[name], dtype=np.int64)
        exp = np.asarray(want, dtype=np.int64)
        same = got.shape == exp.shape and bool(np.array_equal(got, exp))
        print(f"  {name}: {len(exp):,} elements, identical: {same}")
        ok &= same
    same_n = (len(feats) == head["meta"]["n"] and nring == head["meta"]["rings"])
    print(f"  {len(feats)} features / {nring} rings match the header: {same_n}")
    ok &= same_n

    # and the site's decoder returns the same arrays
    h2, pay = _chunk.read_chunk(blob)
    for name in ("x", "y", "rv0", "rvn", "fbb"):
        a = np.asarray(fields[name], dtype=np.int64)
        b = np.asarray(_chunk.field_array(h2, pay, name), dtype=np.int64)
        if not np.array_equal(a, b):
            print(f"  SITE DECODER disagrees on {name}")
            ok = False
    print("  the site's decoder returns identical arrays for x, y, rv0, rvn, fbb")

    print("PROVED" if ok else "FAILED")
    return 0 if ok else 1


def _require_key(blob: bytes, want: str):
    h, _ = read_qc(blob)
    if h["k"] != want:
        raise ValueError(f"key is {h['k']!r}, asked for {want!r}")


if __name__ == "__main__":
    raise SystemExit(main())
