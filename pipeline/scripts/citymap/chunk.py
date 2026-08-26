"""The `.qc` chunk container. See website/src/lib/city/DATA.md §1.

    0   4  magic 'QCT1'
    4   4  u32 headerLen
    8   4  u32 payloadLen
    12  4  u32 crc32(payload)      CRC-32/IEEE, zlib.crc32
    16  H  header JSON, UTF-8
        .. zero pad to a multiple of 8
        P  payload

Everything about this file is deterministic: field order is the order fields are
added, the JSON separators are fixed, and nothing here reads the clock or the
filesystem. The same input bytes give the same output bytes, which is the whole
point of the encoder being re-runnable.
"""
from __future__ import annotations

import json
import struct
import zlib

MAGIC = b"QCT1"

# dtype -> (numpy code, bytes per element). No f64: nothing in this record needs
# it (heights are quantised to 1 m, ring coordinates to 1.0 or 0.25 m, the
# bathymetry to a sqrt quantiser whose worst error is 0.452 m), and shipping
# f64 would be claiming a precision the sources do not have.
DTYPES = {
    "u8": ("<u1", 1), "i8": ("<i1", 1),
    "u16": ("<u2", 2), "i16": ("<i2", 2),
    "u32": ("<u4", 4), "i32": ("<i4", 4),
    "f32": ("<f4", 4),
}


def _align(n: int, a: int) -> int:
    return (n + a - 1) // a * a


class ChunkWriter:
    """Accumulate named typed-array fields, then serialise.

    Field payload offsets are aligned to the field's own element size so the
    client can take a zero-copy typed-array view over the ArrayBuffer. The
    payload itself starts on an 8-byte boundary, so an offset that is a multiple
    of 4 in the payload is a multiple of 4 in the buffer too.
    """

    def __init__(self, key: str, kind: str):
        self.key = key
        self.kind = kind
        self._fields: list[dict] = []
        self._blobs: list[bytes] = []
        self._end = 0

    def add(self, name: str, dtype: str, data) -> "ChunkWriter":
        import numpy as np

        if dtype not in DTYPES:
            raise ValueError(f"unknown dtype {dtype!r}")
        code, esz = DTYPES[dtype]
        arr = np.asarray(data, dtype=np.dtype(code))
        if arr.ndim != 1:
            arr = arr.reshape(-1)
        off = _align(self._end, esz)
        if off > self._end:
            self._blobs.append(b"\0" * (off - self._end))
        blob = arr.tobytes()
        self._blobs.append(blob)
        self._fields.append({"n": name, "t": dtype, "o": off, "c": int(arr.size)})
        self._end = off + len(blob)
        return self

    def add_bytes(self, name: str, dtype: str, blob: bytes, count: int) -> "ChunkWriter":
        """Add a field whose bytes are already laid out (bitsets, packed nibbles)."""
        if dtype not in DTYPES:
            raise ValueError(f"unknown dtype {dtype!r}")
        _, esz = DTYPES[dtype]
        if len(blob) != count * esz:
            raise ValueError(f"{name}: {len(blob)} bytes for {count} x {dtype}")
        off = _align(self._end, esz)
        if off > self._end:
            self._blobs.append(b"\0" * (off - self._end))
        self._blobs.append(blob)
        self._fields.append({"n": name, "t": dtype, "o": off, "c": int(count)})
        self._end = off + len(blob)
        return self

    @property
    def payload_bytes(self) -> int:
        return self._end

    def serialise(self) -> bytes:
        payload = b"".join(self._blobs)
        assert len(payload) == self._end
        header = json.dumps(
            {"k": self.key, "kind": self.kind, "fields": self._fields},
            separators=(",", ":"), ensure_ascii=False, sort_keys=False,
        ).encode("utf-8")
        pre = MAGIC + struct.pack("<III", len(header), len(payload), zlib.crc32(payload) & 0xFFFFFFFF)
        body = pre + header
        body += b"\0" * (_align(len(body), 8) - len(body))
        return body + payload

    def fields(self) -> list[dict]:
        return list(self._fields)


def read_chunk(blob: bytes) -> tuple[dict, memoryview]:
    """The decoder, server side — used by the round-trip proof, not by the site."""
    if blob[:4] != MAGIC:
        raise ValueError(f"not a chunk: magic {blob[:4]!r}")
    hlen, plen, crc = struct.unpack("<III", blob[4:16])
    header = json.loads(blob[16:16 + hlen].decode("utf-8"))
    base = _align(16 + hlen, 8)
    payload = blob[base:base + plen]
    if len(payload) != plen:
        raise ValueError(f"truncated: {len(payload)} of {plen} payload bytes")
    got = zlib.crc32(payload) & 0xFFFFFFFF
    if got != crc:
        raise ValueError(f"crc mismatch: {got:08x} != {crc:08x}")
    return header, memoryview(payload)


def field_array(header: dict, payload: memoryview, name: str):
    import numpy as np

    for f in header["fields"]:
        if f["n"] == name:
            code, esz = DTYPES[f["t"]]
            return np.frombuffer(payload, dtype=np.dtype(code), count=f["c"], offset=f["o"])
    raise KeyError(name)
