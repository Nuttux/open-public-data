"""The `.qc` container — a WRITER and a READER, owned by us_sf_reach.

The format is documented in pipeline/scripts/us_sf_city/_chunk.py and
website/src/lib/city/DATA.md §1, and it is exactly:

    0   4  magic 'QCT1'
    4   4  u32 headerLen
    8   4  u32 payloadLen
    12  4  u32 crc32(payload)      CRC-32/IEEE, zlib.crc32
    16  H  header JSON, UTF-8
        .. zero pad to a multiple of 8
        P  payload

This is a second implementation of it, not an import, on purpose: the reach
layer must not be able to change the bytes the city chunks are made of. The
round-trip proof in build_reach_geom.py reads what this wrote back with BOTH
this reader and `us_sf_city._chunk.read_chunk` — the shipped decoder — so
"compatible" is demonstrated rather than assumed.

Field payload offsets are aligned to the field's own element size, so the
browser can take a zero-copy typed-array view. Deterministic: field order is
insertion order, JSON separators are fixed, nothing reads the clock.
"""
from __future__ import annotations

import json
import struct
import zlib

import numpy as np

MAGIC = b"QCT1"
DTYPES = {
    "u8": ("<u1", 1), "i8": ("<i1", 1),
    "u16": ("<u2", 2), "i16": ("<i2", 2),
    "u32": ("<u4", 4), "i32": ("<i4", 4),
    "f32": ("<f4", 4),
}


def _align(n: int, a: int) -> int:
    return (n + a - 1) // a * a


class QCWriter:
    def __init__(self, key: str, kind: str, meta: dict | None = None):
        self.key = key
        self.kind = kind
        self.meta = meta or {}
        self._fields: list[dict] = []
        self._blobs: list[bytes] = []
        self._end = 0

    def add(self, name: str, dtype: str, data) -> "QCWriter":
        if dtype not in DTYPES:
            raise ValueError(f"unknown dtype {dtype!r}")
        code, esz = DTYPES[dtype]
        arr = np.asarray(data, dtype=np.dtype(code)).reshape(-1)
        # A silent wrap here would ship a coordinate on the wrong continent, so
        # the range is checked against the dtype rather than trusted.
        if arr.size:
            src = np.asarray(data).reshape(-1)
            if np.issubdtype(np.asarray(src).dtype, np.number) and dtype != "f32":
                info = np.iinfo(np.dtype(code))
                lo, hi = float(np.min(src)), float(np.max(src))
                if lo < info.min or hi > info.max:
                    raise ValueError(
                        f"{name}: {lo}..{hi} does not fit {dtype} "
                        f"({info.min}..{info.max})")
        off = _align(self._end, esz)
        if off > self._end:
            self._blobs.append(b"\0" * (off - self._end))
        blob = arr.tobytes()
        self._blobs.append(blob)
        self._fields.append({"n": name, "t": dtype, "o": off, "c": int(arr.size)})
        self._end = off + len(blob)
        return self

    @property
    def payload_bytes(self) -> int:
        return self._end

    def fields(self) -> list[dict]:
        return list(self._fields)

    def serialise(self) -> bytes:
        payload = b"".join(self._blobs)
        assert len(payload) == self._end
        head = {"k": self.key, "kind": self.kind, "fields": self._fields}
        if self.meta:
            head["meta"] = self.meta
        header = json.dumps(head, separators=(",", ":"), ensure_ascii=False,
                            sort_keys=False).encode("utf-8")
        pre = MAGIC + struct.pack("<III", len(header), len(payload),
                                  zlib.crc32(payload) & 0xFFFFFFFF)
        body = pre + header
        body += b"\0" * (_align(len(body), 8) - len(body))
        return body + payload


def read_qc(blob: bytes) -> tuple[dict, dict]:
    """-> (header, {field: np.ndarray}). Verifies magic, length and CRC."""
    if blob[:4] != MAGIC:
        raise ValueError(f"not a qc chunk: magic {blob[:4]!r}")
    hlen, plen, crc = struct.unpack("<III", blob[4:16])
    header = json.loads(blob[16:16 + hlen].decode("utf-8"))
    base = _align(16 + hlen, 8)
    payload = blob[base:base + plen]
    if len(payload) != plen:
        raise ValueError(f"truncated: {len(payload)} of {plen} payload bytes")
    got = zlib.crc32(payload) & 0xFFFFFFFF
    if got != crc:
        raise ValueError(f"crc mismatch: {got:08x} != {crc:08x}")
    out = {}
    for f in header["fields"]:
        code, _ = DTYPES[f["t"]]
        out[f["n"]] = np.frombuffer(payload, dtype=np.dtype(code),
                                    count=f["c"], offset=f["o"])
    return header, out
