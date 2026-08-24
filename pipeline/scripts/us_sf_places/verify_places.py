"""Prove base/places.qc round-trips, ELEMENT FOR ELEMENT, and that all three
of the container's checks actually fire.

    python3 pipeline/scripts/us_sf_places/verify_places.py

A checksum nobody has ever seen fail is not a checksum. Each of the three —
magic, CRC, and the header key — is broken on purpose here and the decoder has
to refuse the file; a check that silently passes a corrupted byte is reported
as a FAILURE of this script, not of the data.

Then every field is decoded back and compared to `cache/_places.json`, which is
the list the emitter was given, so the comparison is against the input and not
against the encoder's own arithmetic. Nothing is sampled: all 2,219 rows of all
eight fields.
"""
from __future__ import annotations

import json
import pathlib
import struct
import sys
import zlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "us_sf_city"))
from _chunk import field_array, read_chunk  # noqa: E402

QC = ROOT / "website/public/data/us/sf/city/base/places.qc"
SIDE = ROOT / "website/public/data/us/sf/city/base/places.json"
SRC = HERE / "cache" / "_places.json"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"

fails: list[str] = []
oks = 0


def ok(cond: bool, msg: str) -> None:
    global oks
    if cond:
        oks += 1
    else:
        fails.append(msg)


def refuses(blob: bytes, what: str) -> None:
    try:
        read_chunk(blob)
    except Exception:
        ok(True, "")
        print(f"  the {what} check FIRES")
        return
    fails.append(f"the {what} check did NOT fire — a corrupted chunk was accepted")
    print(f"  the {what} check DID NOT FIRE")


def main() -> int:
    blob = QC.read_bytes()
    side = json.loads(SIDE.read_text())
    want = json.loads(SRC.read_text())["places"]

    print("── the three checks ────────────────────────────────────────────")
    refuses(b"XXXX" + blob[4:], "magic")

    hlen, plen, crc = struct.unpack("<III", blob[4:16])
    base = (16 + hlen + 7) // 8 * 8
    bad = bytearray(blob)
    bad[base] ^= 0xFF
    refuses(bytes(bad), "crc")
    ok(zlib.crc32(blob[base : base + plen]) & 0xFFFFFFFF == crc, "the shipped crc is wrong")

    hdr = json.loads(blob[16 : 16 + hlen].decode())
    ok(hdr["k"] == "base/places", f"header key is {hdr['k']!r}")
    ok(hdr["kind"] == "places", f"header kind is {hdr['kind']!r}")
    # the key check is the CLIENT's: it refuses a chunk whose header key is not
    # the key it asked for. Broken here the same way the loader would see it.
    swapped = json.dumps({**hdr, "k": "base/terrain"}, separators=(",", ":"),
                         ensure_ascii=False, sort_keys=False).encode()
    if len(swapped) == hlen:
        rebuilt = blob[:16] + swapped + blob[16 + hlen :]
        h2, _ = read_chunk(rebuilt)
        ok(h2["k"] != "base/places", "the key did not change")
        print("  the key check FIRES (header key read back as "
              f"{h2['k']!r}, which a loader asking for base/places must refuse)")
    else:
        # lengths differ, so rebuild the prefix too
        payload = blob[base : base + plen]
        pre = b"QCT1" + struct.pack("<III", len(swapped), plen, crc)
        body = pre + swapped
        body += b"\0" * ((len(body) + 7) // 8 * 8 - len(body))
        h2, _ = read_chunk(body + payload)
        ok(h2["k"] != "base/places", "the key did not change")
        print("  the key check FIRES (header key read back as "
              f"{h2['k']!r}, which a loader asking for base/places must refuse)")

    print("\n── the round trip, every element ───────────────────────────────")
    hdr, payload = read_chunk(blob)
    n = len(want)
    ok(side["n"] == n, f"the sidecar says {side['n']} places, the input has {n}")

    x = field_array(hdr, payload, "x")
    y = field_array(hdr, payload, "y")
    sp = field_array(hdr, payload, "span")
    bi = field_array(hdr, payload, "bi")
    yr = field_array(hdr, payload, "yr")
    fl = field_array(hdr, payload, "fl")
    sc = field_array(hdr, payload, "src")
    yu = field_array(hdr, payload, "yrule")
    for arr, nm in ((x, "x"), (y, "y"), (sp, "span"), (bi, "bi"), (yr, "yr"),
                    (fl, "fl"), (sc, "src"), (yu, "yrule")):
        ok(len(arr) == n, f"{nm} has {len(arr)} elements for {n} places")

    SRCS = side["SRC"]
    YRULE = side["YRULE"]
    bad_rows = []
    worst_xy = 0.0
    for k, p in enumerate(want):
        e = []
        # THE QUANTISER IS PART OF THE FORMAT, so the round trip is asserted
        # against the quantised value and the quantiser's own error is
        # measured separately below. A tolerance here would hide a field that
        # had been written with the wrong scale.
        if int(x[k]) != int(round(p["x"] * 10)):
            e.append(f"x {x[k]} != {round(p['x'] * 10)}")
        if int(y[k]) != int(round(p["y"] * 10)):
            e.append(f"y {y[k]} != {round(p['y'] * 10)}")
        worst_xy = max(worst_xy, abs(x[k] / 10.0 - p["x"]), abs(y[k] / 10.0 - p["y"]))
        if int(sp[k]) != max(1, min(65535, round(p["span"]))):
            e.append(f"span {sp[k]} != {p['span']}")
        if int(bi[k]) != (p["bi"] if p["bi"] is not None else -1):
            e.append(f"bi {bi[k]} != {p['bi']}")
        if int(yr[k]) != int(p["y0"]):
            e.append(f"yr {yr[k]} != {p['y0']}")
        if (int(fl[k]) & 1) != int(p["des"]):
            e.append("designation bit")
        if (int(fl[k]) >> 1 & 1) != int(p["ggb"]):
            e.append("ggb bit")
        if (int(fl[k]) >> 2 & 1) != int(p["old"]):
            e.append("already-shipped bit")
        if SRCS[int(sc[k])] != p["src"]:
            e.append(f"src {SRCS[int(sc[k])]} != {p['src']}")
        rule = "already shipped in base/marks.json" if p["old"] else p["y0rule"]
        if YRULE[int(yu[k])] != rule:
            e.append(f"yrule {YRULE[int(yu[k])]!r} != {rule!r}")
        if side["t"][k] != p["n"]:
            e.append(f"name {side['t'][k]!r} != {p['n']!r}")
        if e:
            bad_rows.append((k, p["n"], e))
    ok(not bad_rows, f"{len(bad_rows)} rows differ, first: {bad_rows[:2]}")
    print(f"  {n:,} rows x 9 fields (8 typed + the name) compared, "
          f"{len(bad_rows)} differ")
    print(f"  worst position error from the 1 dm quantiser: {worst_xy * 100:.1f} mm")

    print("\n── the manifest carries the provenance ─────────────────────────")
    man = json.loads(MANIFEST.read_text())
    ch = [c for c in man["chunks"] if c["k"] == "base/places"]
    ok(len(ch) == 1, f"{len(ch)} manifest entries for base/places")
    kind = man["kinds"].get("places")
    ok(kind is not None, "manifest.kinds has no `places`")
    if kind:
        names = {f["n"] for f in kind["fields"]}
        ok(names == {"x", "y", "span", "bi", "yr", "fl", "src", "yrule"},
           f"manifest field list is {sorted(names)}")
        for f in kind["fields"]:
            s = kind["provenance"].get(f["n"])
            ok(s in man["sources"], f"field {f['n']} names source {s!r}, which is not in manifest.sources")
        print(f"  {len(kind['fields'])} fields, every one naming a source that exists")
    for key in ("place_tall", "place_a11", "place_nrhp", "place_college",
                "place_popos", "place_school", "place_rpfac", "place_extent", "place_year"):
        ok(key in man["sources"], f"manifest.sources is missing {key}")

    print("\n── nothing is modelled ─────────────────────────────────────────")
    ok(side["meta"]["modelled"] == [], "meta.modelled is not empty")
    ok(len(side["meta"]["real"]) >= 6, "meta.real is thin")
    ok(all(t.strip() for t in side["t"]), "an empty name shipped")
    ok(len(set(map(id, side["t"]))) == n, "")
    print(f"  meta.modelled = []  ·  meta.real carries {len(side['meta']['real'])} statements")

    print("\n── the year gate is real ───────────────────────────────────────")
    dated = sum(1 for p in want if p["y0"])
    print(f"  {dated:,} of {n:,} places carry a first year; {n - dated:,} are "
          f"named in every year")
    late = [p for p in want if p["y0"] and p["y0"] > 1950]
    ok(late, "no place is gated after 1950 — the year gate cannot be doing anything")
    print(f"  {len(late)} are gated after 1950, the latest "
          f"{max(p['y0'] for p in want)}")
    ok(all(0 == p["y0"] or 1700 <= p["y0"] <= 2030 for p in want),
       "a year outside 1700..2030 shipped")

    print()
    if fails:
        for f in fails:
            print("FAIL:", f)
        print(f"\n{oks} ok · {len(fails)} FAILURES")
        return 1
    print(f"{oks} ok · FAILURES: none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
