"""MOVED. The `.qc` container is `pipeline/scripts/citymap/chunk.py`.

It went there because it is true of a city rather than of San Francisco: zero
city tokens, no dataset id, no path, and its behaviour is a function of the
bytes handed to it. It had been sitting in a directory called `us_sf_city`,
which is how `us_sf_reach/_qc.py` came to exist — a SECOND reader of the same
format, written because the first one lived under another city's name, with
`us_sf_reach/prove_qc.py` standing between them to prove they agree. That is the
cost of a shared module filed under one city, and it is the concrete reason this
package now exists.

THIS FILE IS A REDIRECT AND NOTHING ELSE. It exists for one importer:
`build_hood_facts.py`, which is owned by another change in flight and must not
be edited from here.

    DELETE THIS FILE when `build_hood_facts.py` imports `citymap.chunk`
    directly. Nothing else in the repository reads this path.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from citymap.chunk import (  # noqa: E402,F401
    DTYPES, MAGIC, ChunkWriter, field_array, read_chunk,
)
