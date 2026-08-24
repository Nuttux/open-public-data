"""A 90-line reader for the two ESRI files TIGER ships, and nothing more.

There is no shapefile library in this environment (checked: no pyshp, fiona,
geopandas or GDAL), and TIGER/Line AREALM is a file download — TIGERweb's REST
service does not carry the layer, which was verified negative. So the choice was
this reader or no Colma. It reads exactly what is needed and refuses the rest:

  .shp   shape type 5 (Polygon) only, little-endian doubles, XY, no Z/M
  .dbf   dBASE III/5 character and numeric fields, no memo

Both formats are published: ESRI Shapefile Technical Description 98-126.
Anything unexpected raises rather than guessing.
"""
from __future__ import annotations

import struct


def read_dbf(blob: bytes) -> list[dict]:
    ver, _, _, _, nrec, hlen, rlen = struct.unpack_from("<BBBBIHH", blob, 0)
    fields, off = [], 32
    while blob[off] != 0x0D:
        name = blob[off:off + 11].split(b"\0")[0].decode("latin-1")
        ftyp = chr(blob[off + 11])
        flen = blob[off + 16]
        fields.append((name, ftyp, flen))
        off += 32
    rows = []
    for i in range(nrec):
        base = hlen + i * rlen
        if blob[base:base + 1] == b"*":          # deleted
            continue
        p, rec = base + 1, {}
        for name, ftyp, flen in fields:
            raw = blob[p:p + flen].decode("latin-1").strip()
            p += flen
            if ftyp in "NF":
                rec[name] = float(raw) if raw not in ("", "-") else None
            else:
                rec[name] = raw
        rows.append(rec)
    return rows


def read_shp_polygons(blob: bytes) -> list[list[list[tuple[float, float]]]]:
    """-> one entry per record: a list of rings, each a list of (lon, lat)."""
    if struct.unpack_from(">i", blob, 0)[0] != 9994:
        raise ValueError("not a .shp (bad file code)")
    out, off, n = [], 100, len(blob)
    while off < n:
        _num, clen = struct.unpack_from(">ii", blob, off)
        rec = off + 8
        styp = struct.unpack_from("<i", blob, rec)[0]
        if styp == 0:                             # null shape
            out.append([])
        elif styp == 5:
            nparts, npoints = struct.unpack_from("<ii", blob, rec + 36)
            parts = list(struct.unpack_from(f"<{nparts}i", blob, rec + 44))
            pbase = rec + 44 + 4 * nparts
            xy = struct.unpack_from(f"<{2 * npoints}d", blob, pbase)
            rings = []
            for k, start in enumerate(parts):
                end = parts[k + 1] if k + 1 < nparts else npoints
                rings.append([(xy[2 * j], xy[2 * j + 1]) for j in range(start, end)])
            out.append(rings)
        else:
            raise ValueError(f"shape type {styp} not supported by this reader")
        off = rec + clen * 2
    return out


def ring_area_m2(ring, cosl: float) -> float:
    """Signed shoelace on a local equirectangular scaling. Metres squared.

    Good enough to CHECK a published acreage against the geometry that claims
    it — which is all it is used for. Never to replace one."""
    m = 111320.0
    a = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0] * m * cosl, ring[i][1] * m
        x1, y1 = ring[i + 1][0] * m * cosl, ring[i + 1][1] * m
        a += x0 * y1 - x1 * y0
    return a / 2.0
