#!/usr/bin/env python3
"""Decode every chunk and compare it against the source arrays, element for element.

    python3 pipeline/scripts/us_sf_city/verify_city_chunks.py

This project has been bitten twice by data that decoded without complaining and
was wrong: a cache holding HTML error pages under a `.gz` name, and a parcel key
truncated by a fixed seven-character slice. So nothing here checks a count, a
checksum or a byte total and calls it proof. Every element of every field is
compared against the value the mock's own decoder produces from the mock's own
payload, and the building geometry is compared after being replayed through a
Python transcription of gen/part3.html's delta walk — the same walk the browser
runs — not through the encoder's own arithmetic.
"""
from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import numpy as np

from _bldgsrc import read_bldg, replay
from _chunk import field_array, read_chunk
from _grid import NY
from _srcload import MOCK, ROOT, load, unb64

OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "city"

FAIL: list[str] = []
CHECKS = 0
ELEMENTS = 0


def eq(what: str, a, b) -> None:
    global CHECKS, ELEMENTS
    CHECKS += 1
    a = np.asarray(a)
    b = np.asarray(b)
    ELEMENTS += int(a.size)
    if a.shape != b.shape:
        FAIL.append(f"{what}: shape {a.shape} != {b.shape}")
        return
    if not np.array_equal(a, b):
        n = int((a != b).sum())
        i = int(np.argmax(a != b))
        FAIL.append(f"{what}: {n} of {a.size} elements differ, first at {i}: {a[i]} != {b[i]}")


def ok(what: str, cond: bool, detail: str = "") -> None:
    """A named property, asserted. Counts as one comparison over one element:
    the totals below stay a count of things actually compared, not of prose."""
    global CHECKS, ELEMENTS
    CHECKS += 1
    ELEMENTS += 1
    if not cond:
        FAIL.append(f"{what}: FALSE {detail}")


def load_chunk(key: str):
    return read_chunk((OUT / f"{key}.qc").read_bytes())


def nib(packed: np.ndarray, n: int) -> np.ndarray:
    out = np.empty(n, dtype=np.uint8)
    out[0::2] = packed[: out[0::2].size] & 15
    out[1::2] = (packed[: n // 2] >> 4) & 15
    return out


def main() -> int:
    man = json.loads((OUT / "manifest.json").read_text())
    keys = [c["k"] for c in man["chunks"]]
    print(f"{len(keys)} chunks in the manifest")

    # ── 0. every chunk on disk opens, and its CRC holds ──────────────────
    on_disk = sorted(str(p.relative_to(OUT))[:-3] for p in OUT.rglob("*.qc"))
    eq("manifest lists exactly the chunks on disk", np.array(sorted(keys)), np.array(on_disk))
    for k in keys:
        try:
            h, _ = load_chunk(k)
        except Exception as e:                                    # noqa: BLE001
            FAIL.append(f"{k}: {e}")
            continue
        if h["k"] != k:
            FAIL.append(f"{k}: header says {h['k']!r}")
    print(f"  {len(keys)} headers + CRCs verified")

    # ── 1. terrain, coast, blocks, massing ───────────────────────────────
    GEO = load("geo/geo-data.js", "GEO")
    CITY = load("gen/city-data.js", "CITY")
    h, p = load_chunk("base/terrain")
    eq("terrain.dem", field_array(h, p, "dem"),
       np.frombuffer(unb64(GEO["dem"]["data"]), dtype=np.uint8))
    eq("terrain.mask", field_array(h, p, "mask"),
       np.frombuffer(unb64(GEO["dem"]["mask"]), dtype=np.uint8))

    h, p = load_chunk("base/coast")
    for tag, rings in (("coast", CITY["coast"]), ("burn", CITY["burn"])):
        eq(f"coast.{tag}Len", field_array(h, p, f"{tag}Len"),
           np.array([len(r) for r in rings], dtype=np.uint32))
        eq(f"coast.{tag}XY", field_array(h, p, f"{tag}XY"),
           np.array([c for r in rings for c in r], dtype=np.float32).reshape(-1))

    # loaded here and not in section 2: the block tier's colour comes out of this
    # payload too, not only the buildings'.
    PAINT = load("paint/paint-data.js", "PAINT")

    h, p = load_chunk("base/blocks")
    GB = GEO["blocks"]
    for f, dt in (("cnt", np.uint16), ("sc", np.uint8), ("ox", np.float32),
                  ("oy", np.float32), ("vx", np.int16), ("vy", np.int16),
                  ("z", np.uint16), ("a", np.float32), ("hood", np.uint8)):
        eq(f"blocks.{f}", field_array(h, p, f), np.frombuffer(unb64(GB[f]), dtype=dt))
    ids = json.loads((OUT / "base" / "blocks-id.json").read_text())
    eq("blocks-id.json ids", np.array(ids["id"]), np.array(GB["id"]))

    # the roof colour of the block, element for element against paint/blocks.py's own
    # output. The join is positional over 5,404 rings, so it is also checked from both
    # ends: a length that silently agreed with nothing would tone every block wrong.
    bidx = np.frombuffer(unb64(PAINT["bidx"]), dtype=np.uint8)
    eq("blocks.bidx", field_array(h, p, "bidx"), bidx)
    ok("blocks.bidx: PAINT.nb and PAINT.bidx both count GEO.blocks.n blocks",
       PAINT["nb"] == GB["n"] == bidx.size, f"{PAINT['nb']} / {GB['n']} / {bidx.size}")
    nreal = int((bidx != 255).sum())
    nsent = int((bidx == 255).sum())
    ok("blocks.bidx: 5,043 of 5,404 blocks carry a measured roof colour",
       nreal == 5043 and nsent == 361, f"{nreal} measured, {nsent} sentinel")
    ok("blocks.bidx: every measured index addresses the shipped 32-entry palette",
       bool((bidx[bidx != 255] < len(PAINT["pal"])).all()),
       f"max {int(bidx[bidx != 255].max())} against {len(PAINT['pal'])} entries")
    print(f"  blocks: {nreal:,} of {bidx.size:,} carry a measured roof colour "
          f"({100.0 * nreal / bidx.size:.1f} %), {nsent} are the 255 NOBLOCK sentinel")

    LODM = load("lod/lod-data.js", "LODM")
    h, p = load_chunk("base/massing")
    for f, dt in (("off", np.uint32), ("ty", np.uint8), ("tc", np.uint8),
                  ("th", np.uint8), ("solo", np.uint8)):
        eq(f"massing.{f}", field_array(h, p, f), np.frombuffer(unb64(LODM[f]), dtype=dt))
    solo = np.unpackbits(np.frombuffer(unb64(LODM["solo"]), dtype=np.uint8),
                         bitorder="little")[: LODM["n"]].astype(bool)

    # ── 2. buildings: geometry replayed through part3's own walk ─────────
    B = read_bldg()
    n, cnt, off, IX, IY = B["n"], B["cnt"], B["off"], B["IX"], B["IY"]
    ROOFD = load("roofs/roof-data.js", "ROOFD")
    STN = nib(np.frombuffer(unb64(ROOFD["st"]), dtype=np.uint8), n)
    HFN = nib(np.frombuffer(unb64(ROOFD["hf"]), dtype=np.uint8), n)
    pidx = np.frombuffer(unb64(PAINT["idx"]), dtype=np.uint8)
    pflag = np.frombuffer(unb64(PAINT["flag"]), dtype=np.uint8)

    seen = np.zeros(n, dtype=bool)
    nvert = 0
    for k in [c["k"] for c in man["chunks"] if c["kind"] == "bldg"]:
        h, p = load_chunk(k)
        gid = field_array(h, p, "gid").astype(np.int64)
        if seen[gid].any():
            FAIL.append(f"{k}: {int(seen[gid].sum())} buildings appear in more than one chunk")
        seen[gid] = True
        c = field_array(h, p, "cnt")
        eq(f"{k}.cnt", c, cnt[gid])
        # THE POINT OF THIS FILE: the chunk's own delta stream, walked exactly the
        # way gen/part3.html walks it, must give back the same vertices as the
        # source stream walked the same way.
        gx, gy, goff = replay(c, field_array(h, p, "vx"), field_array(h, p, "vy"),
                              field_array(h, p, "xi"), field_array(h, p, "xn"))
        src_v = np.concatenate([np.arange(off[g], off[g] + cnt[g]) for g in gid])
        eq(f"{k}.vertexX", gx, IX[src_v])
        eq(f"{k}.vertexY", gy, IY[src_v])
        nvert += int(gx.size)
        for f, arr in (("h", B["h"]), ("yr", B["yr"]), ("u", B["u"]),
                       ("st", STN), ("hf", HFN),
                       ("paintIdx", pidx), ("paintFlag", pflag)):
            eq(f"{k}.{f}", field_array(h, p, f), arr[gid])
        # the cell claim: a non-solo building's centroid is inside the cell it names
        if k.startswith("bldg/"):
            tx, ty = (int(v) for v in k.split("/")[1].split("_"))
            from _grid import CELL, ORIGIN_X, ORIGIN_Y
            cx, cy = B["cx"][gid], B["cy"][gid]
            inside = ((cx >= ORIGIN_X + tx * CELL) & (cx < ORIGIN_X + (tx + 1) * CELL) &
                      (cy >= ORIGIN_Y + ty * CELL) & (cy < ORIGIN_Y + (ty + 1) * CELL))
            if not inside.all():
                FAIL.append(f"{k}: {int((~inside).sum())} centroids outside the cell")
            if solo[gid].any():
                FAIL.append(f"{k}: holds {int(solo[gid].sum())} solos, which belong to base/solo")
        else:
            if not solo[gid].all():
                FAIL.append(f"{k}: holds {int((~solo[gid]).sum())} non-solos")
    if not seen.all():
        FAIL.append(f"buildings: {int((~seen).sum())} of {n} appear in no chunk")
    eq("buildings: every vertex accounted for", np.array([nvert]), np.array([B["nv"]]))
    print(f"  {n:,} buildings, {nvert:,} vertices replayed through part3's walk")

    # ── 2b. the measured roof colour REACHES the renderer ────────────────
    # Element-for-element equality above proves the bytes are the ones the mock
    # packed. It does not prove the renderer can USE them, and for eleven weeks
    # it could not: `paintFlag` was read as a coverage flag, it is a sample-
    # QUALITY bitfield, and the gate that resulted put the measured colour on
    # 2,686 of 166,166 roofs — 1.6 % — while the source covers 99.9 %. Nothing
    # in this file noticed, because nothing in this file asked what the column
    # MEANS. These do.
    bits = PAINT["flagBits"]
    ok("paint.flagBits names exactly canopy, shadow and nosample",
       set(bits) == {"canopy", "shadow", "nosample"}, str(sorted(bits)))
    ok("paint.flagBits are three distinct single bits",
       sorted(bits.values()) == [1, 2, 4], str(sorted(bits.values())))
    ok("manifest.buildings.paintFlagBits is PAINT.flagBits verbatim — the "
       "renderer resolves the nosample mask from it and must not guess",
       man["buildings"].get("paintFlagBits") == bits,
       str(man["buildings"].get("paintFlagBits")))
    ok("paintFlag carries no bit flagBits does not name",
       int((pflag & ~(bits["canopy"] | bits["shadow"] | bits["nosample"])).sum()) == 0,
       f"max flag {int(pflag.max())}")
    # the three populations the source's own META states, counted here
    for name, want in (("canopy", 1889), ("shadow", 829)):
        got = int(((pflag & bits[name]) != 0).sum())
        ok(f"paintFlag: {want:,} roofs carry the {name} bit, as PAINT.meta.FLAGGED says",
           got == want, f"{got:,}")
    # AND THE ONE THAT MATTERS. `nosample` is the only bit that withholds a
    # measurement; every other footprint has one, and the renderer paints it.
    sampled = int(((pflag & bits["nosample"]) == 0).sum())
    ok("paintIdx is a measurement for 166,042 of 166,166 footprints (99.9 %) — "
       "the figure manifest.sources.paint publishes",
       sampled == 166042 and sampled == man["buildings"]["paintSampled"],
       f"{sampled:,} here, {man['buildings']['paintSampled']:,} in the manifest")
    ok("paintFlag ZERO is the COMMON case — a clean sample, not a missing one. "
       "Whatever reads this column must not treat 0 as absence",
       int((pflag == 0).sum()) == 163480, f"{int((pflag == 0).sum()):,} of {n:,}")
    ok("every sampled paintIdx addresses the shipped 32-entry palette",
       bool((pidx[(pflag & bits["nosample"]) == 0] < len(PAINT["pal"])).all()),
       f"max {int(pidx.max())} against {len(PAINT['pal'])} entries")
    # and the same three statements about the bytes that actually shipped,
    # summed over the chunks rather than over the source arrays
    cf = np.concatenate([field_array(*load_chunk(k), "paintFlag")
                         for k in [c["k"] for c in man["chunks"] if c["kind"] == "bldg"]])
    ok("the SHIPPED chunks carry the same 166,042 sampled footprints",
       int(((cf & bits["nosample"]) == 0).sum()) == 166042 and cf.size == n,
       f"{int(((cf & bits['nosample']) == 0).sum()):,} of {cf.size:,}")
    print(f"  paint: {sampled:,} of {n:,} roofs carry a measured colour "
          f"({100.0 * sampled / n:.1f} %); {int((pflag != 0).sum()):,} carry a "
          f"quality bit, which is NOT the same question")

    # ── 3. facades ───────────────────────────────────────────────────────
    FACD = load("facade/facade-data.js", "FACD")
    fty = np.frombuffer(unb64(FACD["ty"]), dtype=np.uint8)
    st2 = nib(np.frombuffer(unb64(FACD["st2"]), dtype=np.uint8), n)
    shop = np.unpackbits(np.frombuffer(unb64(FACD["shop"]), dtype=np.uint8),
                         bitorder="little")[:n]
    rb = np.unpackbits(np.frombuffer(unb64(FACD["role"]), dtype=np.uint8), bitorder="little")
    role = (rb[0::2] + 2 * rb[1::2])[: B["nv"]].astype(np.uint8)
    fseen = np.zeros(n, dtype=bool)
    for k in [c["k"] for c in man["chunks"] if c["kind"] == "face"]:
        h, p = load_chunk(k)
        gid = field_array(h, p, "gid").astype(np.int64)
        fseen[gid] = True
        eq(f"{k}.ty", field_array(h, p, "ty"), fty[gid])
        eq(f"{k}.st2", field_array(h, p, "st2"), st2[gid])
        eq(f"{k}.shop", field_array(h, p, "shop"), shop[gid])
        vsel = np.concatenate([np.arange(off[g], off[g] + cnt[g]) for g in gid])
        eq(f"{k}.role", field_array(h, p, "role"), role[vsel])
        # the pairing claim the renderer relies on
        bkey = k.replace("face/", "bldg/").replace("base/solo-face", "base/solo")
        hb, pb = load_chunk(bkey)
        eq(f"{k} pairs with {bkey}", field_array(hb, pb, "gid"), field_array(h, p, "gid"))
    if not fseen.all():
        FAIL.append(f"facades: {int((~fseen).sum())} buildings have no facade chunk")

    # ── 4. water: both levels, against the source grid ───────────────────
    WATD = load("detail/water-data.js", "WATD")
    grid = np.frombuffer(unb64(WATD["dep"]), dtype=np.uint8).reshape(WATD["nh"], WATD["nw"])
    h, p = load_chunk("base/water0")
    e = next(c for c in man["chunks"] if c["k"] == "base/water0")
    eq("water0 == every 4th published node",
       field_array(h, p, "dep").reshape(e["h"], e["w"]), grid[::WATD["mul"], ::WATD["mul"]])
    covered = np.zeros_like(grid, dtype=bool)
    for c in [c for c in man["chunks"] if c["kind"] == "water" and c["k"] != "base/water0"]:
        h, p = load_chunk(c["k"])
        sub = field_array(h, p, "dep").reshape(c["h"], c["w"])
        ref = grid[c["gy"]:c["gy"] + c["h"], c["gx"]:c["gx"] + c["w"]]
        eq(f"{c['k']}.dep", sub, ref)
        covered[c["gy"]:c["gy"] + c["h"], c["gx"]:c["gx"] + c["w"]] = True
    dropped = grid[~covered]
    if dropped.any():
        FAIL.append(f"water1: {int((dropped != 0).sum())} non-zero nodes are in no tile")
    print(f"  water: {grid.size:,} nodes, {int((~covered).sum()):,} in all-land tiles "
          f"that were dropped (all zero, checked)")

    # ── 5. streets ───────────────────────────────────────────────────────
    STS = load("street/street-data.js", "STSURF")
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from encode_city_chunks import _decode_rings, _i16, _u16, _u32, _u8
    R = _decode_rings(STS, "rn", "rlen", "rf", "rxy")
    D = _decode_rings(STS, "dn", "dlen", "df", "dxy")
    kbits = np.unpackbits(_u8(STS["dkb"]), bitorder="little")[: D["wx"].size]
    sseen = np.zeros(STS["n"], dtype=bool)
    for c in [c for c in man["chunks"] if c["kind"] == "strt"]:
        h, p = load_chunk(c["k"])
        fid = field_array(h, p, "fid").astype(np.int64)
        sseen[fid] = True
        for f, arr in (("kind", _u8(STS["kind"])), ("cls", _u8(STS["cls"])),
                       ("cnn", _u32(STS["cnn"])), ("w", _u16(STS["w"])),
                       ("fw", _u16(STS["fw"])), ("yr", _u16(STS["yr"])),
                       ("imp", _u16(STS["imp"])), ("krb", _u16(STS["krb"]))):
            eq(f"{c['k']}.{f}", field_array(h, p, f), arr[fid])
        for tag, O in (("rw", R), ("rd", D)):
            rings = np.concatenate([np.arange(O["fo"][i], O["fo"][i + 1]) for i in fid])
            vsel = (np.concatenate([np.arange(O["off"][r], O["off"][r + 1]) for r in rings])
                    if rings.size else np.zeros(0, dtype=np.int64))
            eq(f"{c['k']}.{tag}N", field_array(h, p, f"{tag}N"), O["rn"][fid])
            eq(f"{c['k']}.{tag}Len", field_array(h, p, f"{tag}Len"), O["rl"][rings])
            eq(f"{c['k']}.{tag}X", field_array(h, p, f"{tag}X"),
               O["wx"][vsel].astype(np.float32))
            eq(f"{c['k']}.{tag}Y", field_array(h, p, f"{tag}Y"),
               O["wy"][vsel].astype(np.float32))
            if tag == "rd":
                got = np.unpackbits(field_array(h, p, "rdKerb"), bitorder="little")[: vsel.size]
                eq(f"{c['k']}.rdKerb", got, kbits[vsel])
    if not sseen.all():
        n_un = int((~sseen).sum())
        exp = next(c for c in man["chunks"] if c["k"] == "base/street-misc")
        FAIL.append(f"streets: {n_un} features are in no cell") if n_un != man["streets"]["unplaced"] \
            else print(f"  streets: {n_un} features carry no right-of-way ring and are "
                       f"in no cell (declared in the manifest)")

    # ── 5b. the street CENTRELINES and the names written along them ──────
    # The chunks are compared against the array the MOCK'S OWN DECODER produces
    # from gen/geo-data.js — `ox[i] + vx[k]/10`, part3.html L157-160 — and never
    # against the encoder's copy of it. `cnn` and the name table are checked
    # against a SECOND, independent derivation: time/out/ship-cnn.json, which
    # film/streets_accept.py built without looking at geo-data.js's geometry, and
    # the published rows keyed by that cnn.
    GEO2 = load("gen/geo-data.js", "GEO")
    TIMED = load("time/time-data.js", "TIME")
    GS = GEO2["streets"]
    gn = int(GS["n"])
    gcnt = _u16(GS["cnt"])
    gcls = _u8(GS["cls"])
    gox = np.frombuffer(unb64(GS["ox"]), dtype=np.float32)
    goy = np.frombuffer(unb64(GS["oy"]), dtype=np.float32)
    gvx = _i16(GS["x"]).astype(np.float64)
    gvy = _i16(GS["y"]).astype(np.float64)
    goff = np.zeros(gn + 1, dtype=np.int64)
    np.cumsum(gcnt.astype(np.int64), out=goff[1:])
    gx = np.empty(int(goff[-1]), dtype=np.float32)
    gy = np.empty(int(goff[-1]), dtype=np.float32)
    for i in range(gn):
        a, b = int(goff[i]), int(goff[i + 1])
        gx[a:b] = gox[i] + gvx[a:b] / 10.0
        gy[a:b] = goy[i] + gvy[a:b] / 10.0
    gyr = _u16(TIMED["street"]["yr"])
    gcov = np.unpackbits(_u8(STS["cov"]), bitorder="little")[:gn]
    ok("street-data.js `covn` is one bit per CENTRELINE, not per right of way",
       int(STS["covn"]) == gn, f"covn={STS['covn']} n={gn}")

    ship_cnn = np.array([int(v) for v in json.loads(
        (MOCK / "time" / "out" / "ship-cnn.json").read_text())], dtype=np.uint32)
    eq("ship-cnn.json is one cnn per shipped centreline",
       np.array([ship_cnn.size]), np.array([gn]))
    by_cnn = {}
    for r in json.loads((MOCK / "geo" / "cache" / "streets.json").read_text()):
        by_cnn.setdefault(int(r["cnn"]), (r.get("streetname") or "").strip())
    lbl_names = next(c for c in man["chunks"] if c["k"] == "base/street-labels")["names"]

    lseen = np.zeros(gn, dtype=bool)
    lcov = np.zeros(gn, dtype=np.uint8)
    # `strt/street-unimplied` is the same KIND but not the same INDEX: its `fid`
    # runs over its own 846, not over G.streets' 4,895, because it is a separate
    # array precisely so that it cannot shift the four things keyed on that one.
    # It gets its own block below.
    UNIMPL = "strt/street-unimplied"
    for c in [c for c in man["chunks"]
              if c["kind"] == "strt-line" and c["k"] != UNIMPL]:
        h, p = load_chunk(c["k"])
        fid = field_array(h, p, "fid").astype(np.int64)
        if lseen[fid].any():
            FAIL.append(f"{c['k']}: a centreline is in two chunks")
        lseen[fid] = True
        eq(f"{c['k']}.cls", field_array(h, p, "cls"), gcls[fid])
        eq(f"{c['k']}.len", field_array(h, p, "len"), gcnt[fid])
        eq(f"{c['k']}.yr", field_array(h, p, "yr"), gyr[fid])
        eq(f"{c['k']}.cnn", field_array(h, p, "cnn"), ship_cnn[fid])
        vsel = np.concatenate([np.arange(goff[i], goff[i + 1]) for i in fid])
        eq(f"{c['k']}.x", field_array(h, p, "x"), gx[vsel])
        eq(f"{c['k']}.y", field_array(h, p, "y"), gy[vsel])
        # THE MASK IS ASSERTED EQUAL, NOT ASSUMED EQUAL. `cov` in a line chunk is
        # the citywide mask re-indexed through `fid`, and the re-indexing is the
        # one step that could silently shift a bit.
        cb = np.unpackbits(field_array(h, p, "cov"), bitorder="little")[: fid.size]
        eq(f"{c['k']}.cov == base/street-misc.cov at fid", cb, gcov[fid])
        lcov[fid] = cb
        # and the class gate the chunk exists for
        lo, hi = int(c["clsMin"]), int(c["clsMax"])
        ok(f"{c['k']}: every feature is inside its declared class band {lo}-{hi}",
           bool(((gcls[fid] >= lo) & (gcls[fid] <= hi)).all()))
        # the name, joined through the cnn the OTHER derivation produced
        nm = field_array(h, p, "nm")
        want = np.array([lbl_names.index(by_cnn[int(v)]) if by_cnn.get(int(v)) else 0xFFFF
                         for v in ship_cnn[fid]], dtype=np.uint16)
        eq(f"{c['k']}.nm names the street 3psu-pn9h publishes for that cnn", nm, want)
    ok("every one of the 4,895 centrelines is in exactly one chunk",
       bool(lseen.all()), f"{int((~lseen).sum())} missing")

    # ── the streets no block implies, verified against their OWN array ─────
    _uc = next((c for c in man["chunks"] if c["k"] == UNIMPL), None)
    if _uc is not None:
        U = GEO2["streetsUnimplied"]
        un = int(U["n"])
        h, p = load_chunk(UNIMPL)
        ucnt = _u16(U["cnt"])
        uoff = np.zeros(un + 1, dtype=np.int64)
        np.cumsum(ucnt.astype(np.int64), out=uoff[1:])
        eq("unimplied.fid is its own dense index", field_array(h, p, "fid"),
           np.arange(un, dtype=np.uint32))
        eq("unimplied.cls", field_array(h, p, "cls"), _u8(U["cls"]))
        eq("unimplied.len", field_array(h, p, "len"), ucnt)
        ucnn = np.frombuffer(unb64(U["cnn"]), dtype=np.uint32)
        eq("unimplied.cnn", field_array(h, p, "cnn"), ucnn)
        # the geometry, rebuilt from the shipped origin + deltas the same way
        uox = np.frombuffer(unb64(U["ox"]), dtype=np.float32)
        uoy = np.frombuffer(unb64(U["oy"]), dtype=np.float32)
        uvx = _i16(U["x"]).astype(np.float64)
        uvy = _i16(U["y"]).astype(np.float64)
        ux = np.empty(int(uoff[-1]), dtype=np.float32)
        uy = np.empty(int(uoff[-1]), dtype=np.float32)
        for i in range(un):
            a_, b_ = int(uoff[i]), int(uoff[i + 1])
            ux[a_:b_] = uox[i] + uvx[a_:b_] / 10.0
            uy[a_:b_] = uoy[i] + uvy[a_:b_] / 10.0
        eq("unimplied.x", field_array(h, p, "x"), ux)
        eq("unimplied.y", field_array(h, p, "y"), uy)
        # NONE of these may be in the network keyed on G.streets — that is the
        # whole reason the array is separate, and it is asserted, not assumed.
        ok("unimplied: no cnn of these is also a shipped centreline",
           not (set(int(v) for v in ucnn) & set(int(v) for v in ship_cnn)),
           str(sorted(set(int(v) for v in ucnn) & set(int(v) for v in ship_cnn))[:5]))
        ok("unimplied: every class is one gen_geo2.py DROPS (5, 6 or 7)",
           bool(((field_array(h, p, "cls") >= 5) & (field_array(h, p, "cls") <= 7)).all()),
           str(sorted(set(field_array(h, p, "cls").tolist()))))
        ok("unimplied: cov is zero — there is no right of way polygon for any",
           not int(np.unpackbits(field_array(h, p, "cov"),
                                 bitorder="little")[:un].sum()), "")
        unm = field_array(h, p, "nm")
        uwant = np.array([lbl_names.index(by_cnn[int(v)]) if by_cnn.get(int(v)) else 0xFFFF
                          for v in ucnn], dtype=np.uint16)
        eq("unimplied.nm names the street 3psu-pn9h publishes for that cnn", unm, uwant)
        ok("unimplied: every one carries a published street name",
           not int((unm == 0xFFFF).sum()), f"{int((unm == 0xFFFF).sum())} unnamed")
        uyr = field_array(h, p, "yr")
        ok(f"unimplied: {_uc['undated']} of {un} are undated and drawn in every year",
           int((uyr == 0).sum()) == int(_uc["undated"])
           and int((uyr > 0).sum()) == int(_uc["dated"]),
           f"{int((uyr == 0).sum())} undated / {int((uyr > 0).sum())} dated")
    eq("the two chunks reassemble base/street-misc's mask exactly", lcov, gcov)
    base_line = next(c for c in man["chunks"] if c["k"] == "base/street-lines")
    ok("the wide shot's own classes are in the BASE tier: ST_CLS_MAX[0] = 2",
       base_line["tier"] == "base" and base_line["minZ"] == 0.0
       and int(base_line["clsMax"]) == 2,
       f"tier={base_line['tier']} minZ={base_line['minZ']} clsMax={base_line['clsMax']}")
    print(f"  centrelines: {gn:,} in 2 chunks, {int(gcov.sum()):,} covered, "
          f"{int((gyr > 0).sum()):,} dated, {int(goff[-1]):,} vertices")

    LB = GEO2["labels"]
    ln = len(LB["i"])
    lbyr = _u16(TIMED["label"]["yr"])
    lrank = np.asarray(LB["r"], dtype=np.uint8)
    seen_lbl = 0
    for c in [c for c in man["chunks"] if c["kind"] == "strt-label"]:
        h, p = load_chunk(c["k"])
        lo, hi = int(c["rankMin"]), int(c["rankMax"])
        ids = np.nonzero((lrank >= lo) & (lrank <= hi))[0]
        seen_lbl += ids.size
        eq(f"{c['k']}.rank", field_array(h, p, "rank"), lrank[ids])
        eq(f"{c['k']}.yr", field_array(h, p, "yr"), lbyr[ids])
        eq(f"{c['k']}.len", field_array(h, p, "len"),
           np.asarray(LB["L"], dtype=np.int64)[ids].astype(np.uint16))
        eq(f"{c['k']}.x", field_array(h, p, "x"),
           np.asarray(LB["x"], dtype=np.float32)[ids])
        eq(f"{c['k']}.y", field_array(h, p, "y"),
           np.asarray(LB["y"], dtype=np.float32)[ids])
        # x10000 is LOSSLESS: the source rounds the unit vector to four decimals
        for f_, s_ in (("dx", "dx"), ("dy", "dy")):
            got = field_array(h, p, f_).astype(np.float64) / 10000.0
            eq(f"{c['k']}.{f_} round-trips the published unit vector exactly",
               got, np.asarray(LB[s_], dtype=np.float64)[ids])
        nm = field_array(h, p, "nm")
        eq(f"{c['k']}.nm resolves to the stretch's own published name",
           np.array([lbl_names[int(v)] for v in nm]),
           np.array([LB["t"][LB["i"][int(i)]] for i in ids]))
    eq("every published stretch is in exactly one label chunk",
       np.array([seen_lbl]), np.array([ln]))
    lbl_base = next(c for c in man["chunks"] if c["k"] == "base/street-labels")
    ok("the whole-city and district ranks are in the BASE tier: part3 L7025 "
       "rankMax is 0 then 1",
       lbl_base["tier"] == "base" and lbl_base["minZ"] == 0.0
       and int(lbl_base["rankMax"]) == 1,
       f"tier={lbl_base['tier']} rankMax={lbl_base['rankMax']}")
    ok("the name table holds every name the two label chunks and both line "
       "chunks index, and no name twice",
       len(lbl_names) == len(set(lbl_names)),
       f"{len(lbl_names)} entries, {len(set(lbl_names))} distinct")
    print(f"  street labels: {ln:,} stretches / {len(lbl_names):,} distinct names, "
          f"{int((lbyr > 0).sum()):,} dated")

    # ── 6. trees and canopy ──────────────────────────────────────────────
    WRLD = load("world/world-data.js", "WORLD")
    from encode_city_chunks import _wvarint
    T = WRLD["tree"]
    dk = _wvarint(_u8(T["k"]))
    cn = _wvarint(_u8(T["c"]))
    tkeys = np.cumsum(dk)
    toff = np.zeros(cn.size + 1, dtype=np.int64)
    np.cumsum(cn, out=toff[1:])
    pos, yr = _u8(T["p"]), _u8(T["y"])
    fb = np.unpackbits(_u8(T["f"]), bitorder="little")
    form = (fb[0::2] + 2 * fb[1::2])[: T["n"]].astype(np.uint8)
    big = np.unpackbits(_u8(T["b"]), bitorder="little")[: T["n"]].astype(np.uint8)
    tseen = np.zeros(cn.size, dtype=bool)
    ntree = 0
    for c in [c for c in man["chunks"] if c["kind"] == "tree"]:
        h, p = load_chunk(c["k"])
        ck = field_array(h, p, "cellKey").astype(np.int64)
        idx = np.searchsorted(tkeys, ck)
        eq(f"{c['k']} cell keys resolve", tkeys[idx], ck)
        tseen[idx] = True
        eq(f"{c['k']}.cellCnt", field_array(h, p, "cellCnt"), cn[idx])
        vsel = np.concatenate([np.arange(toff[i], toff[i + 1]) for i in idx])
        for f, arr in (("pos", pos), ("form", form), ("big", big), ("yr", yr)):
            eq(f"{c['k']}.{f}", field_array(h, p, f), arr[vsel])
        ntree += int(vsel.size)
    if not tseen.all():
        FAIL.append(f"trees: {int((~tseen).sum())} source cells are in no chunk")
    eq("trees: every tree accounted for", np.array([ntree]), np.array([T["n"]]))

    K = WRLD["canopy"]
    h, p = load_chunk("base/canopy")
    eq("canopy.cellKey", field_array(h, p, "cellKey"), np.cumsum(_wvarint(_u8(K["k"]))))
    eq("canopy.pos", field_array(h, p, "pos"), _u8(K["p"]))
    eq("canopy.area", field_array(h, p, "area"), _u8(K["a"]))
    h, p = load_chunk("base/canopy-tint")
    eq("canopy-tint.demFrac", field_array(h, p, "demFrac"), _u8(WRLD["dem"]["f"]))

    P_, W_ = WRLD["park"], WRLD["water"]
    h, p = load_chunk("base/parks")
    eq("parks.cls", field_array(h, p, "cls"), _u8(P_["cls"]))
    eq("parks.len", field_array(h, p, "len"), _u16(P_["ln"]))
    eq("parks.xy", field_array(h, p, "xy"),
       np.frombuffer(unb64(P_["xy"]), dtype=np.int32))
    eq("parks.waterLen", field_array(h, p, "waterLen"), _u16(W_["ln"]))
    eq("parks.waterXY", field_array(h, p, "waterXY"),
       np.frombuffer(unb64(W_["xy"]), dtype=np.int32))

    h, p = load_chunk("base/street-misc")
    for f, s in (("islandLen", "iln"), ("islandXY", "ixy"),
                 ("stairLen", "sln"), ("stairXY", "sxy")):
        eq(f"street-misc.{f}", field_array(h, p, f), _u16(STS[s]))
    eq("street-misc.cov", field_array(h, p, "cov"), _u8(STS["cov"]))

    # ── 6b. THE SURROUND, and the hillshade the units bug was measured on ──
    CTX = load("gen/context-data.js", "CTX")
    XW, XH = CTX["w"], CTX["h"]
    h, p = load_chunk("base/surround")
    eq("surround.dem", field_array(h, p, "dem"), _u8(CTX["dem"]))
    eq("surround.land", field_array(h, p, "land"), _u8(CTX["land"]))
    eq("surround.own", field_array(h, p, "own"), _u8(CTX["own"]))
    eq("surround.segs", field_array(h, p, "segs"), _u16(CTX["segs"]))

    man = json.loads((OUT / "manifest.json").read_text())
    X = man["surround"]
    # the cell is the divisor the hillshade needs; derive it again, independently
    LON0, LAT0 = man["proj"]["lon0"], man["proj"]["lat0"]
    KX = man["proj"]["mpd"] * man["proj"]["cosl"]
    lo0, la0, lo1, la1 = CTX["bb"]
    cw = (lo1 - lo0) / XW * KX
    ch = (la1 - la0) / XH * man["proj"]["mpd"]
    ok("surround.cellW", abs(X["cellW"] - cw) < 5e-4, f"{X['cellW']} vs {cw:.4f}")
    ok("surround.cellH", abs(X["cellH"] - ch) < 5e-4, f"{X['cellH']} vs {ch:.4f}")
    ok("surround.cell is 110.01 x 139.15 m",
       abs(cw - 110.01) < 5e-3 and abs(ch - 139.15) < 5e-3, f"{cw:.4f} x {ch:.4f}")

    # rebuild the field from the DECODED bytes, not from the source
    Z = (field_array(h, p, "dem").astype(np.float64) / 255.0
         * CTX["zmax"]).reshape(XH, XW)
    landb = np.unpackbits(field_array(h, p, "land"))[:XW * XH].reshape(XH, XW) > 0
    ownb = np.unpackbits(field_array(h, p, "own"))[:XW * XH].reshape(XH, XW) > 0
    eq("surround.landCells", np.array([int(landb.sum())]), np.array([X["landCells"]]))
    eq("surround.ownCells", np.array([int(ownb.sum())]), np.array([X["ownCells"]]))

    SUN = np.array([0.2435, 0.6346, 0.73])   # terrain.ts SUN
    ZEX = 3.3                                # projection.ts ZEX_BY_STEP[0]

    def lam_fixed():
        """buildSurroundLam with QF.xlam on: per-metre, whole grid, clamped."""
        ip = np.clip(np.arange(XW) + 1, 0, XW - 1); im = np.clip(np.arange(XW) - 1, 0, XW - 1)
        jp = np.clip(np.arange(XH) + 1, 0, XH - 1); jm = np.clip(np.arange(XH) - 1, 0, XH - 1)
        gx = (Z[:, ip] - Z[:, im]) / 2 * (ZEX / cw)
        gy = (Z[jp, :] - Z[jm, :]) / 2 * (ZEX / ch)
        nz = 1 / np.sqrt(gx * gx + gy * gy + 1)
        return np.clip(-gx * nz * SUN[0] - gy * nz * SUN[1] + nz * SUN[2], 0, 1)

    def lam_shipped():
        """what the mock painted: divide by 1.8, interior loop only, zeros left."""
        L = np.zeros((XH, XW))
        gx = (Z[:, 2:] - Z[:, :-2]) / 2 * (ZEX / 1.8)
        gy = (Z[2:, :] - Z[:-2, :]) / 2 * (ZEX / 1.8)
        gx, gy = gx[1:-1, :], gy[:, 1:-1]
        nz = 1 / np.sqrt(gx * gx + gy * gy + 1)
        L[1:-1, 1:-1] = np.clip(-gx * nz * SUN[0] - gy * nz * SUN[1] + nz * SUN[2], 0, 1)
        return L

    interior = np.zeros((XH, XW), bool); interior[1:-1, 1:-1] = True
    il = landb & interior
    ok("surround.interior land cells = 62,496", int(il.sum()) == 62496, str(int(il.sum())))
    ok("surround.land cells = 63,352", int(landb.sum()) == 63352, str(int(landb.sum())))
    # terrain.ts's own table, reproduced off the decoded chunk
    TABLE = {"shipped": (0.000, 0.000, 0.081, 0.730, 0.294),
             "per metre": (0.114, 0.296, 0.717, 0.942, 0.676)}
    for nm, A in (("shipped", lam_shipped()), ("per metre", lam_fixed())):
        v = A[il]
        got = tuple(np.percentile(v, [1, 5, 50, 95])) + (v.mean(),)
        want = TABLE[nm]
        ok(f"surround hillshade [{nm}] matches terrain.ts's measured table",
           all(abs(g - w) < 5e-4 for g, w in zip(got, want)),
           "  ".join(f"{g:.3f}" for g in got))
    zs = int((lam_shipped()[landb] == 0).sum())
    ok("surround: the shipped path clipped 30,651 land cells (48.4 %) to zero",
       zs == 30651 and abs(100 * zs / int(landb.sum()) - 48.4) < 0.05, str(zs))
    border = int((landb & ~interior).sum())
    ok("surround: 856 of those are the border ring the loop skips",
       border == 856, str(border))
    ok("surround: slope over-read 61x across and 77x down",
       abs(cw / 1.8 - 61.1) < 0.1 and abs(ch / 1.8 - 77.3) < 0.1,
       f"{cw / 1.8:.1f}x / {ch / 1.8:.1f}x")
    # every `own` cell is a `land` cell — the paint list cannot invent land
    ok("surround: every `own` cell is a `land` cell", bool((~landb & ownb).sum() == 0),
       str(int((~landb & ownb).sum())))
    sg = field_array(h, p, "segs").reshape(-1, 4)
    ok("surround: every shoreline segment names a node in range",
       bool((sg[:, 0] <= XW).all() and (sg[:, 2] <= XW).all()
            and (sg[:, 1] <= XH).all() and (sg[:, 3] <= XH).all()), "")
    # the bathymetry is this grid refined 4x — the two must share metres
    W_ = man["water"]
    ok("surround: the bathymetry is this grid refined mul=4",
       W_["nw"] == XW * W_["mul"] + 1 and W_["nh"] == XH * W_["mul"] + 1,
       f"{W_['nw']}x{W_['nh']} vs {XW}x{XH} mul {W_['mul']}")
    ok("surround: its world frame is the same as the bathymetry's",
       all(abs(a - b) < 0.15 for a, b in zip(X["world"], W_["world"])),
       f"{X['world']} vs {W_['world']}")

    # ── 6c. THE AUTHORED LANDMARKS ────────────────────────────────────────
    HERO = load("wonder/hero-data.js", "HERO")
    LRD = load("render/render-data.js", "LRD")
    MARKS = load("marks/marks-data.js", "MARKS")
    h, p = load_chunk("base/heroes")
    side = json.loads((OUT / "base" / "heroes.json").read_text())

    # part3.html's own HERO decoder, transcribed — the browser's walk, not the
    # encoder's arithmetic. Every default is resolved exactly as it resolves it.
    src_parts = []
    for H_ in HERO["h"]:
        for q_ in H_["p"]:
            n_ = len(q_["r"]) // 2
            src_parts.append({
                "k": q_["k"], "n": n_,
                "wx": np.float32([q_["r"][2 * t] for t in range(n_)]),
                "wy": np.float32([q_["r"][2 * t + 1] for t in range(n_)]),
                "z0": q_["z0"], "z1": q_["z1"], "m": q_["m"],
                "c": q_["m"] if q_.get("c") is None else q_["c"],
                "ink": int(q_.get("ink") or 0), "min": q_.get("px") or 0,
                "w": q_.get("w") or 0, "pi": q_.get("pi") or 0,
                "mg": q_.get("mg") or 0,
                "dk": 0.75 if q_.get("dk") is None else q_["dk"],
                "nb": int(q_.get("n") or 0),
                "tx": (q_["t"][0] if q_.get("t") else 0),
                "ty": (q_["t"][1] if q_.get("t") else 0),
                "pu": np.float32([q_["p"][2 * t] for t in range(len(q_.get("p") or []) // 2)]),
                "ps": np.float32([q_["p"][2 * t + 1] for t in range(len(q_.get("p") or []) // 2)]),
            })
    # ── THE SHIPPED REGISTER IS A MERGE, AND THIS FILE HAS TO KNOW IT ─────
    # `base/heroes.qc` is written twice: encode_heroes() lays down the mock's
    # ELEVEN, and us_sf_places/emit_heroes.py then merges its own seed on top
    # (replace-or-append, keyed on `k`, through the same ChunkWriter). This
    # verifier compared the whole shipped array against the mock, so it went
    # red — 30 failures — the moment a legitimate twelfth hero shipped. A
    # verifier that goes red for a correct change teaches people to ignore it,
    # which is worse than not having one.
    #
    # The invariant that matters is the one emit_heroes.py asserts about
    # itself: THE MOCK'S ELEVEN MUST SURVIVE THE MERGE UNCHANGED. So every
    # per-field check below runs over the mock's own prefix, and the tail is
    # checked separately against the seed that is supposed to have added it.
    # `cut()` carries each field's UNIT, because they are not the same length:
    # a per-hero field cuts to NH, a per-part field to NP, a ring-vertex array
    # to roff[NP], a profile array to proff[NP]. Cutting a per-vertex array to
    # NP is exactly the mistake this note exists to stop — it was made once,
    # here, and it reported 436 failures instead of 30.
    NH = len(HERO["h"])
    NP = len(src_parts)
    _poff_all = field_array(h, p, "poff")
    _roff_all = field_array(h, p, "roff")
    _proff_all = field_array(h, p, "proff")
    NV = int(_roff_all[NP])
    NPR = int(_proff_all[NP])
    _UNIT = {"hero": NH, "part": NP, "vert": NV, "prof": NPR}

    def cut(name, unit):
        return field_array(h, p, name)[:_UNIT[unit]]

    _shipped_keys = [x["k"] for x in side["heroes"]]
    _seed = pathlib.Path(__file__).resolve().parent.parent / "us_sf_places" / "heroes_extra.json"
    _seed_keys = ([x["k"] for x in json.loads(_seed.read_text())["heroes"]]
                  if _seed.exists() else [])
    ok("hero: the mock's eleven are the first eleven, in order, after the merge",
       _shipped_keys[:NH] == [x["k"] for x in HERO["h"]], f"{_shipped_keys[:NH]}")
    ok("hero: every hero past the mock's own comes from heroes_extra.json",
       set(_shipped_keys[NH:]) <= set(_seed_keys),
       f"extra {_shipped_keys[NH:]} against seed {_seed_keys}")

    poff = _poff_all[:NH + 1]
    roff = _roff_all[:NP + 1]
    proff = _proff_all[:NP + 1]
    eq("hero.bi", cut("bi", "hero"), np.array([x["b"] for x in HERO["h"]]))
    eq("hero.yr", cut("yr", "hero"), np.array([x["y"] for x in HERO["h"]]))
    eq("hero.top", cut("top", "hero"),
       np.array([round(x["ms"]["t"] * 100) for x in HERO["h"]]))
    eq("hero.zr", cut("zr", "hero"),
       np.array([round((x["zr"] if x.get("zr") is not None else x["ms"]["t"]) * 100)
                 for x in HERO["h"]]))
    eq("hero.acc", cut("acc", "hero"),
       np.array([(x["ac"] if x.get("ac") is not None else -1) for x in HERO["h"]]))
    eq("hero.hull", cut("hull", "hero"),
       np.array([1 if x.get("hu") else 0 for x in HERO["h"]]))
    for f_, k_ in (("msA", "a"), ("msH", "h"), ("msR", "r")):
        eq(f"hero.{f_}", cut(f_, "hero"),
           np.array([round(x["ms"][k_] * 100) for x in HERO["h"]]))
    eq("hero.msYr", cut("msYr", "hero"),
       np.array([x["ms"]["yr"] for x in HERO["h"]]))
    eq("hero.msNv", cut("msNv", "hero"),
       np.array([x["ms"]["nv"] for x in HERO["h"]]))
    # the anchor IS part3's UX/UY for that building
    eq("hero.ax", cut("ax", "hero"),
       np.float32([B["cx"][x["b"]] for x in HERO["h"]]))
    eq("hero.ay", cut("ay", "hero"),
       np.float32([B["cy"][x["b"]] for x in HERO["h"]]))
    eq("hero.poff", poff,
       np.cumsum([0] + [len(x["p"]) for x in HERO["h"]]))
    for f_, k_ in (("pk", "k"), ("pm", "m"), ("pink", "ink"), ("pc", "c"), ("pnb", "nb")):
        eq(f"hero.{f_}", cut(f_, "part"), np.array([s[k_] for s in src_parts]))
    for f_, k_ in (("pz0", "z0"), ("pz1", "z1"), ("pmin", "min"), ("pw", "w"),
                   ("pmg", "mg"), ("pdk", "dk"), ("ptx", "tx"), ("pty", "ty")):
        eq(f"hero.{f_}", cut(f_, "part"),
           np.array([round(s[k_] * 100) for s in src_parts]))
    eq("hero.ppi", cut("ppi", "part"),
       np.array([-1 if s["pi"] == 1e9 else round(s["pi"] * 100) for s in src_parts]))
    # geometry, part by part, against the Float32Array the browser builds
    rx = cut("rx", "vert"); ry = cut("ry", "vert")
    pu = cut("pu", "prof"); ps = cut("ps", "prof")
    for j, s in enumerate(src_parts):
        eq(f"hero.part{j}.rx", rx[roff[j]:roff[j + 1]], s["wx"])
        eq(f"hero.part{j}.ry", ry[roff[j]:roff[j + 1]], s["wy"])
        eq(f"hero.part{j}.pu", pu[proff[j]:proff[j + 1]], s["pu"])
        eq(f"hero.part{j}.ps", ps[proff[j]:proff[j + 1]], s["ps"])
    ok("hero: the mock ships 11 heroes, 127 parts, 3,259 ring vertices, 454 profile points",
       NH == 11 and NP == 127 and NV == 3259 and NPR == 454, f"{NH}/{NP}/{NV}/{NPR}")
    ok("hero: the centimetre store is exact — every authored value is a whole cm",
       all(abs(s[k_] * 100 - round(s[k_] * 100)) < 1e-6
           for s in src_parts for k_ in ("z0", "z1", "min", "w", "mg", "dk", "tx", "ty")),
       "")
    ok("hero: -1 is the pitch sentinel and only 1e9 maps to it",
       all((s["pi"] == 1e9) == (v == -1)
           for s, v in zip(src_parts, cut("ppi", "part").tolist())), "")
    # the gate's own ceiling: no part stands above the MEASURED top
    top = cut("top", "hero"); pz1 = cut("pz1", "part")
    over = [(HERO["h"][q]["k"], int(pz1[j]), int(top[q]))
            for q in range(len(HERO["h"]))
            for j in range(poff[q], poff[q + 1]) if pz1[j] > top[q]]
    ok("hero: nothing stands above the MEASURED top (the gate's own ceiling)",
       not over, str(over[:3]))
    ok("hero: the strings sidecar pairs 1-for-1 with the parts, at the MERGED length",
       len(side["parts"]) == int(_poff_all[-1])
       and len(side["heroes"]) == len(_poff_all) - 1,
       f"sidecar {len(side['heroes'])}/{len(side['parts'])} against chunk "
       f"{len(_poff_all) - 1}/{int(_poff_all[-1])}")
    ok("hero: Sutro Tower alone is granted the convex-hull reference",
       [x["k"] for x in HERO["h"] if x.get("hu")] == ["sutro"], "")
    _hull_all = field_array(h, p, "hull")
    ok("hero: no MERGED hero claims the convex-hull reference either",
       not any(int(v) for v in _hull_all[NH:]), f"{[int(v) for v in _hull_all[NH:]]}")

    h, p = load_chunk("base/caps")
    # A CAP GOES WHERE ITS SLOT GOES, so the shipped caps are a subset of
    # render-data.js's 68 — the eight that sat on the nine dropped form slots
    # are dropped with them. Compared over the subset, matched by building
    # index, for the same reason the form fields are.
    _cap_bi = _u32(LRD["cap"]["i"])
    _csel = np.isin(_cap_bi, field_array(h, p, "bi"))
    eq("cap.bi", field_array(h, p, "bi"), _cap_bi[_csel])
    eq("cap.prof", field_array(h, p, "prof"), _u8(LRD["cap"]["p"])[_csel])
    cpo = field_array(h, p, "poff")
    eq("cap.poff", cpo, np.cumsum([0] + [len(x) for x in LRD["prof"]]))
    cpu = field_array(h, p, "pu"); cps = field_array(h, p, "ps")
    for k_, pr in enumerate(LRD["prof"]):
        eq(f"cap.prof{k_}.u", cpu[cpo[k_]:cpo[k_ + 1]], np.float32([a for a, _ in pr]))
        eq(f"cap.prof{k_}.s", cps[cpo[k_]:cpo[k_ + 1]], np.float32([b for _, b in pr]))
    _capdrop = int(man["form"].get("droppedWithStaleStep",
                                   next((c.get("droppedWithStaleStep", 0)
                                         for c in man["chunks"]
                                         if c["k"] == "base/caps"), 0)))
    ok(f"cap: 68 caps minus the {_capdrop} whose form slot a published height "
       "invalidated, every one on a published building index",
       int(field_array(h, p, "bi").size) == 68 - _capdrop
       and bool((field_array(h, p, "bi") < B["n"]).all()),
       f"{int(field_array(h, p, 'bi').size)} shipped, {_capdrop} dropped")
    ok("cap: every profile is monotone in u and non-negative in s",
       all(all(pr[i][0] <= pr[i + 1][0] for i in range(len(pr) - 1))
           and all(s_ >= 0 for _, s_ in pr) for pr in LRD["prof"]), "")
    ok("cap: no cap is given profile 0 (`prism`, the identity)",
       int((field_array(h, p, "prof") == 0).sum()) == 0, "")

    h, p = load_chunk("base/bridge")
    ring = MARKS["ggb"]
    eq("bridge.rx", field_array(h, p, "rx"), np.float32([a for a, _ in ring]))
    eq("bridge.ry", field_array(h, p, "ry"), np.float32([b for _, b in ring]))
    G = LRD["ggb"]; a_, b_ = G["ax"], G["bx"]
    tow = [(a_[0] + (b_[0] - a_[0]) * t["t"], a_[1] + (b_[1] - a_[1]) * t["t"])
           for t in G["towers"]]
    eq("bridge.tx", field_array(h, p, "tx"), np.float32([t[0] for t in tow]))
    eq("bridge.ty", field_array(h, p, "ty"), np.float32([t[1] for t in tow]))
    import math as _m

    def _sd(px, py, A, Bb):
        vx, vy = Bb[0] - A[0], Bb[1] - A[1]
        wx, wy = px - A[0], py - A[1]
        L = vx * vx + vy * vy
        t = 0.0 if L == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L))
        return _m.hypot(px - (A[0] + vx * t), py - (A[1] + vy * t))

    dd = [min(_sd(px, py, ring[k], ring[k + 1]) for k in range(len(ring) - 1))
          for px, py in tow]
    ok("bridge: both published towers fall on the published deck within 31.0 m",
       all(d <= 31.0 for d in dd), " ".join(f"{d:.2f} m" for d in dd))
    ok("bridge: the two towers are 1304.4 m apart, the file's own figure",
       abs(_m.dist(tow[0], tow[1]) - G["dtower"]) < 0.1,
       f"{_m.dist(tow[0], tow[1]):.1f}")
    Gm = man["landmarks"]["bridge"]
    ok("bridge: the drawn year is 1937 — completion, not the 1933 start",
       Gm["year"] == 1937 and Gm["yearLandmark"] == 1933
       and MARKS["ggbYr"] == 1937, f"{Gm['year']}/{Gm['yearLandmark']}")

    # ── 6d. THE SECOND SOLID AND THE THIRD, AND THE RULE THE CAPS OBEY ────
    # `base/caps` shipped 68 building indices, 68 profile indices and the six
    # profiles since P4, and not one of them could be drawn: `lrStep` sweeps a
    # profile around a solid whose top, radius, plan angle and centre come from
    # `window.FORM`, and that file had never been encoded. So the shape shipped
    # and the thing it shapes did not. These compare the chunk element for
    # element against BOTH source files, and then assert the two properties the
    # caps were built under — carved INSIDE the measured solid, and the
    # measured VOLUME conserved — because those are the claims the manifest
    # makes to a reader and neither is checkable from the bytes alone.
    FORM = load("form/form-data.js", "FORM")
    TYPO = load("typo/typo-data.js", "TYPO")
    h, p = load_chunk("base/form")
    # THE SHIPPED SLOTS ARE A SUBSET OF model3.py's, so every field is compared
    # over that subset and not positionally. The encoder drops a slot whose
    # second solid no longer stands on its building, which happens where the
    # register's published height has replaced the LiDAR median the slot was
    # derived from — see FORM_DROPPED in encode_city_chunks.py.
    _mock_bi = np.frombuffer(unb64(FORM["i"]), dtype=np.uint32)
    _fsel = np.isin(_mock_bi, field_array(h, p, "bi"))
    for f_, k_, dt in (("bi", "i", np.uint32), ("top", "t", np.uint16),
                       ("rad", "r", np.uint16), ("ang", "an", np.uint8),
                       ("dx", "dx", np.int16), ("dy", "dy", np.int16)):
        eq(f"form.{f_}", field_array(h, p, f_),
           np.frombuffer(unb64(FORM[k_]), dtype=dt)[_fsel])
    M = TYPO["mast"]
    for f_, k_, dt in (("mbi", "i", np.uint32), ("mtop", "t", np.uint16),
                       ("mrad", "r", np.uint16), ("mang", "an", np.uint8),
                       ("mdx", "dx", np.int16), ("mdy", "dy", np.int16),
                       ("mspire", "spire", np.uint8)):
        eq(f"form.{f_}", field_array(h, p, f_),
           np.frombuffer(unb64(M[k_]), dtype=dt))
    fbi = field_array(h, p, "bi")
    mbi = field_array(h, p, "mbi")
    ftop = field_array(h, p, "top").astype(np.float64) * 0.1
    frad = field_array(h, p, "rad").astype(np.float64) * 0.01
    # model3.py's two gates fire on 488 footprints. The encoder drops the ones
    # whose second solid no longer stands on its building, which happens when
    # the register's published height has replaced the LiDAR median the slot
    # was derived from — see FORM_DROPPED in encode_city_chunks.py. The
    # manifest carries the count, so the arithmetic is checked rather than the
    # constant.
    _fdrop = int(man["form"].get("droppedStaleStep", 0))
    # and every per-field comparison below runs over the slots that SURVIVED,
    # matched to the mock by building index rather than by position — a
    # positional compare against the mock's 488 is what a dropped slot breaks.
    ok("form: the shipped slots are a SUBSET of model3.py's, in its own order",
       int(_fsel.sum()) == fbi.size and bool((_mock_bi[_fsel] == fbi).all()),
       f"{int(_fsel.sum())} vs {fbi.size}")
    ok("form: model3.py's two gates fire on 488, minus the slots a published "
       "height has invalidated",
       fbi.size == 488 - _fdrop and man["form"]["n"] == 488 - _fdrop,
       f"{fbi.size} shipped, {_fdrop} dropped")
    ok("form: 40 third solids, and 10 of them carry the spire bit",
       mbi.size == 40 and int((field_array(h, p, "mspire") != 0).sum()) == 10,
       f"{mbi.size} masts")
    ok("form: every slot addresses a published building",
       int(fbi.max()) < B["n"] and int(mbi.max()) < B["n"],
       f"max {max(int(fbi.max()), int(mbi.max()))} of {B['n']}")
    # NEVER TWO SOLIDS OVER ONE ROOF — the client merges these two streams and
    # the merge must not be the first thing to notice a collision.
    ok("form: no building carries both a step and a mast",
       np.intersect1d(fbi, mbi).size == 0,
       f"{np.intersect1d(fbi, mbi).size} collisions")
    # THE STEP STANDS ABOVE THE PLANE ALREADY DRAWN, and that is the invariant
    # that has to hold for every slot — a step inside the prism is a step the
    # building does not have. It used to be checkable against model3.py's own
    # 6.0 m gate (`top` is hgt_maxcm, the byte is the median rounded to a whole
    # metre, so the drawn margin bottomed out at 5.70 m and roofs.ts records
    # that number). That is no longer true of every slot: where the register's
    # published height_ft has replaced the median, the margin is whatever the
    # two published numbers happen to leave, and on one surviving slot it is
    # 0.10 m. So the 6.0 m gate is asserted where it still applies — the slots
    # whose building is NOT FLAG_PUBHEIGHT — and the bare "stands above" is
    # asserted everywhere.
    hb = B["h"][fbi].astype(np.float64)
    lift = ftop - hb
    ok("form: every second solid stands ABOVE the height byte already drawn",
       float(lift.min()) > 0, f"worst {float(lift.min()):.2f} m")
    _pubh = ((B["u"][fbi].astype(np.int64) >> 5) & 1) == 1
    _lidar = lift[~_pubh]
    ok("form: on a LiDAR-derived height the margin still clears model3.py's "
       "6.0 m gate, worst 5.70 m on the unrounded median",
       float(_lidar.min()) > 5.6,
       f"worst {float(_lidar.min()):.2f} m over {int((~_pubh).sum())} slots")
    ok("form: every slot whose margin is under the gate is one a published "
       "height explains",
       bool((lift[lift <= 5.6] > 0).all()) and bool(_pubh[lift <= 5.6].all()),
       f"{int((lift <= 5.6).sum())} under the gate, "
       f"{int(_pubh[lift <= 5.6].sum())} of them FLAG_PUBHEIGHT")
    ok("form: the mast lifts at least 8.0 m over its own drawn roof, "
       "mast.py's minLift",
       float((field_array(h, p, "mtop").astype(np.float64) * 0.1
              - B["h"][mbi].astype(np.float64)).min()) >= 7.5,
       f"worst {float((field_array(h, p, 'mtop').astype(np.float64) * 0.1 - B['h'][mbi].astype(np.float64)).min()):.2f} m")
    # THE DERIVED AREA IS AN AREA OF THE ROOF IT STANDS ON, not a claim about
    # a bigger building: model3.py caps A2 at the footprint's own area.
    OCT_A = 0.5 * 8 * np.sin(2 * np.pi / 8)
    a2 = OCT_A * frad * frad
    ok("form: 58.06 m2 <= the derived plan area, model3.py's MIN_UPPER_M2 "
       "(25 ft x 25 ft, one San Francisco lot frontage squared)",
       float(a2.min()) >= 58.0, f"smallest {float(a2.min()):.2f} m2")
    ok("form: the mast's plan is the DECLARED 58.06 m2 on every one of the 40 "
       "— it is not measured and it does not vary",
       float(np.ptp(OCT_A * (field_array(h, p, "mrad").astype(np.float64)
                             * 0.01) ** 2)) < 0.02,
       f"spread {float(np.ptp(OCT_A * (field_array(h, p, 'mrad').astype(np.float64) * 0.01) ** 2)):.4f} m2")

    # ── and the two rules render/BLOCK-LR.md's caps were built under ───────
    # 1. CARVED INSIDE. Every u and every s is <= 1: no ring of a cap is wider
    #    than the measured radius and none is higher than the measured top, so
    #    a drawn cap is always SMALLER than what was measured, never larger.
    ch, cp = load_chunk("base/caps")
    cpo = field_array(ch, cp, "poff")
    cpu = field_array(ch, cp, "pu")
    cps = field_array(ch, cp, "ps")
    cbi = field_array(ch, cp, "bi")
    cprof = field_array(ch, cp, "prof")
    ok("caps: every profile point is INSIDE the measured solid — u <= 1 and "
       "s <= 1 over all six profiles, which is what makes a drawn cap honest",
       bool((cpu <= 1.0).all() and (cps <= 1.0).all() and (cpu >= 0).all()
            and (cps >= 0).all()),
       f"max u {float(cpu.max()):.4f} max s {float(cps.max()):.4f}")
    for k_ in range(len(cpo) - 1):
        u_ = cpu[cpo[k_]:cpo[k_ + 1]]
        ok(f"caps: profile {k_} ({man['chunks'] and LRD['profN'][k_]}) is "
           f"monotone in u and spans the whole solid",
           bool((np.diff(u_) >= 0).all()) and float(u_[0]) == 0.0
           and float(u_[-1]) == 1.0,
           f"u {float(u_[0])}..{float(u_[-1])}")
    # 2. THE MEASURED VOLUME IS KEPT, NOT MERELY NOT-EXCEEDED. Block C's
    #    cylinder is not an outline, it is a VOLUME: A2 x (T - L) is exactly
    #    the volume the published mean measures standing above the median
    #    plane. Carving a dome out of it would throw a third of that volume
    #    away and the drawn landmark would UNDER-read the file, so lrStep
    #    rescales the radius by 1/sqrt(int s^2 du). This asserts that the
    #    rescale is well-defined for every profile and recovers the cylinder,
    #    and prints what each profile costs in width.
    vscale = np.ones(len(cpo) - 1)
    print("  caps: volume conserved by the 1/sqrt(int s^2 du) radius rescale")
    for k_ in range(len(cpo) - 1):
        u_ = np.asarray(cpu[cpo[k_]:cpo[k_ + 1]], dtype=np.float64)
        s_ = np.asarray(cps[cpo[k_]:cpo[k_ + 1]], dtype=np.float64)
        # the same conical-frustum quadrature lrStep runs, exactly
        v = float(np.sum(np.diff(u_) * (s_[:-1] ** 2 + s_[:-1] * s_[1:]
                                        + s_[1:] ** 2) / 3.0))
        vs = 1.0 / np.sqrt(v) if v > 0.02 else 1.0
        v2 = v * vs * vs
        n_ = int((cprof == k_).sum())
        ok(f"caps: profile {k_} rescaled by 1/sqrt(int s^2 du) has the volume "
           f"of the measured cylinder",
           abs(v2 - 1.0) < 1e-9, f"{v2:.12f}")
        vscale[k_] = vs
        print(f"    {LRD['profN'][k_]:<10} {n_:3d} caps  int s^2 du "
              f"{v:.4f}  radius x{vs:.4f}")
    # AND THE WIDENING IS NOT A LICENCE. Conserving the volume of a solid that
    # narrows upward means widening its BASE — 9 % on a dome, 60 % on a spire —
    # so the drawn cap is no longer inside the measured cylinder and the file
    # says so ("a domed cap comes out about 9 % wider"). What it must still be
    # inside is the BUILDING: a cap wider than the roof it stands on would be
    # asserting a plan the footprint refuses. MEASURED over all 68, worst 42.3 %
    # of the footprint and median 14.0 %.
    qq = B["q"]
    fpa = {}
    for i_ in set(int(v_) for v_ in cbi):
        o_, n2_ = B["off"][i_], B["off"][i_ + 1] - B["off"][i_]
        xs = B["IX"][o_:o_ + n2_] * qq
        ys = B["IY"][o_:o_ + n2_] * qq
        fpa[i_] = abs(float(np.sum(xs * np.roll(ys, -1) - np.roll(xs, -1) * ys))) / 2
    slotR = {}
    for j_ in range(fbi.size):
        slotR[int(fbi[j_])] = float(frad[j_])
    mrad_ = field_array(h, p, "mrad").astype(np.float64) * 0.01
    for j_ in range(mbi.size):
        slotR[int(mbi[j_])] = float(mrad_[j_])
    worst = max((OCT_A * (slotR[int(cbi[k_])] * vscale[int(cprof[k_])]) ** 2)
                / fpa[int(cbi[k_])] for k_ in range(cbi.size))
    ok("caps: after the volume rescale, not one of the 68 is wider than the "
       "footprint it stands on — worst 42.3 % of its own roof",
       worst <= 0.43, f"worst {worst * 100:.1f} %")
    # AND EVERY CAP HAS A SOLID TO SHAPE — the whole point of this chunk.
    slots = np.concatenate([fbi, mbi])
    ok("caps: all 68 sit on a building base/form gives a slot — a cap with no "
       "solid under it is 68 bytes of shape and nothing shaped, which is the "
       "state this chunk ends",
       bool(np.isin(cbi, slots).all()), f"{int(np.isin(cbi, slots).sum())} of {cbi.size}")
    ok("caps: profile 0 is `prism`, the identity, and no cap uses it",
       LRD["profN"][0] == "prism" and int((cprof == 0).sum()) == 0,
       f"{int((cprof == 0).sum())} caps on prism")
    # the manifest's own figures, against the bytes
    fm = man["form"]
    ok("manifest.form matches the chunk", fm["n"] == fbi.size
       and fm["mast"] == mbi.size and fm["octN"] == 8,
       json.dumps({k: fm[k] for k in ("n", "mast", "octN")}))
    print(f"  form: {fbi.size} second solids + {mbi.size} third, "
          f"{man['chunks'] and [c['b'] for c in man['chunks'] if c['k'] == 'base/form'][0]:,} bytes")

    # ── 7. the guards actually fire ──────────────────────────────────────
    from _chunk import read_chunk as rc
    blob = (OUT / "base/terrain.qc").read_bytes()
    for what, mangled in (("an HTML error page", b"<!DOCTYPE html>\n<html>" + blob[22:]),
                          ("a truncated body", blob[:-1]),
                          ("one flipped byte", blob[:-1] + bytes([blob[-1] ^ 0xFF]))):
        try:
            rc(mangled)
        except ValueError:
            pass
        else:
            FAIL.append(f"guard did not fire on {what}")
    print("  guards fire on an HTML error page, a truncated body and one flipped byte")

    print(f"\n{CHECKS:,} comparisons over {ELEMENTS:,} elements")
    if FAIL:
        print(f"\nFAILURES: {len(FAIL)}")
        for f in FAIL[:40]:
            print("  " + f)
        return 1
    print("FAILURES: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
