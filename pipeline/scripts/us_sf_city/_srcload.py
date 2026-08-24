"""Read the mock's `window.X = {...}` payloads out of scratchpad/sf-city-anim/.

The mock ships every dataset as one JavaScript assignment whose right-hand side
is strict JSON. That is the ONLY thing this module knows how to do: it does not
execute JavaScript, it slices the assignment prefix off and parses the rest.
If a payload ever stops being strict JSON this raises instead of guessing.
"""
from __future__ import annotations

import base64
import json
import pathlib

# The mock lives outside the pipeline tree. Resolved from this file so the
# encoder runs identically from any working directory (determinism rule).
ROOT = pathlib.Path(__file__).resolve().parents[3]
MOCK = ROOT / "scratchpad" / "sf-city-anim"


def load(rel: str, var: str) -> dict:
    """Parse `window.<var>={...};` at <MOCK>/<rel> and return the dict."""
    text = (MOCK / rel).read_text()
    prefix = f"window.{var}="
    if not text.startswith(prefix):
        raise ValueError(f"{rel}: expected {prefix!r}, got {text[:40]!r}")
    body = text[len(prefix):].strip()
    while body.endswith(";"):
        body = body[:-1].rstrip()
    return json.loads(body)


def unb64(s: str) -> bytes:
    """The mock's `unb64()`, server side. Base64 -> the raw bytes it packed.

    In production these bytes are fetched as an ArrayBuffer and this step does
    not happen at all: base64 costs 33 % on the wire and a full parse pass on
    the client. This function exists only to READ the mock.
    """
    return base64.b64decode(s)


def load_json(rel: str) -> object:
    """Read a plain published cache under <MOCK> — NOT a `window.X =` payload.

    `_srcload.load()` covers everything the mock ships to the page. Two columns
    of DataSF 3psu-pn9h never reach the page at all and so are in none of those
    payloads: the centreline's own `cnn` and its `streetname`. gen/gen_geo2.py
    drops both — the mock draws the network without ever naming a line — so the
    only place either exists is `geo/cache/streets.json`, the fetched dataset
    itself (geo/fetch.py). This reads it, and nothing else about it is special:
    it is strict JSON on disk, under the same tree, and the join back onto the
    shipped array is PROVED per feature rather than assumed (see
    `_centrelines()`).
    """
    return json.loads((MOCK / rel).read_text())
