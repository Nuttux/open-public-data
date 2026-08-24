"""Minimal READ-ONLY reader for the `.qc` chunk container.

Format is documented in pipeline/scripts/us_sf_city/_chunk.py and
website/src/lib/city/DATA.md §1. This file only reads. It exists so the reach
investigation can measure the shipped bytes without importing — and therefore
without any risk of changing — the encoder that owns them.

    0   4  magic 'QCT1'
    4   4  u32 headerLen
    8   4  u32 payloadLen
    12  4  u32 crc32(payload)      CRC-32/IEEE, zlib.crc32
    16  H  header JSON, UTF-8, zero-padded to a multiple of 8
        P  payload

Each header field carries `n` (name), `t` (dtype), `o` (byte offset into the
payload) and `c` (element count).
"""
from __future__ import annotations

import json
import pathlib
import struct
import zlib

import numpy as np

MAGIC = b"QCT1"
DTYPES = {
    "u8": "<u1", "i8": "<i1", "u16": "<u2", "i16": "<i2",
    "u32": "<u4", "i32": "<i4", "f32": "<f4",
}


def read_qc(path):
    """-> (header dict, {field name: np.ndarray}). Verifies the payload CRC."""
    raw = pathlib.Path(path).read_bytes()
    if raw[:4] != MAGIC:
        raise ValueError(f"{path}: not a qc chunk (magic {raw[:4]!r})")
    hlen, plen, crc = struct.unpack_from("<III", raw, 4)
    head = json.loads(raw[16:16 + hlen].decode("utf-8"))
    poff = (16 + hlen + 7) // 8 * 8
    payload = raw[poff:poff + plen]
    if zlib.crc32(payload) != crc:
        raise ValueError(f"{path}: payload CRC mismatch")
    fields = {
        f["n"]: np.frombuffer(payload, dtype=DTYPES[f["t"]], count=f["c"], offset=f["o"])
        for f in head["fields"]
    }
    return head, fields


def unpack_bits(a, n):
    """One bit a cell, MSB first within each byte (numpy packbits)."""
    return np.unpackbits(np.asarray(a, dtype=np.uint8))[:n].astype(bool)
