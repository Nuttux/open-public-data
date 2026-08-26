"""The chunk catalogue and the LOD tiering — write a chunk, record what it is.

WHAT IS TRUE OF A CITY HERE, and it is the whole of the published transport
policy: a chunked map is fetched in tiers. One file at first paint, one per
click, everything else lazily and only when the camera is close enough to need
it. Each chunk therefore has to say **which tier it belongs to and the zoom below
which nobody should ask for it**, and the manifest has to roll that up so a
client can size a tier before fetching any of it.

None of that knows what is in the chunks.

── THE LADDER IS GENERIC; EVERY RUNG ON IT IS A MEASUREMENT ─────────────────
This module holds the ladder. It holds no rung. `minZ` arrives as an argument
because the zoom at which a footprint is worth drawing is a fact about one city's
median building at one canvas size — see `citymap/measured.py` for how those
numbers are expected to carry their derivation, and `us_sf_city/derive/` for what
that looks like when it is done.

── THREE INVARIANTS, AND THEY ARE HERE BECAUSE THEY ARE FORMAT RULES ────────
1. **A key's prefix must be declared.** A build clears the directories it owns
   before writing. A chunk written under a prefix that is not cleared survives
   the next run as a stale file the manifest does not name — the worst kind of
   published artefact, because nothing points at it and it still serves.
2. **All chunks of one kind share a field list.** The schema is recorded once
   per KIND, not once per chunk: recording it per chunk made a 732 KB manifest,
   larger than the first paint it exists to make possible. That economy is only
   sound if the kind really is uniform, so it is enforced rather than assumed.
3. **Per-chunk byte layout is not in the manifest at all.** Every chunk carries
   its own header saying where each field starts. The manifest is the catalogue
   and the provenance; the chunk header is the layout.

── PROVENANCE IS PART OF THE CATALOGUE, NOT AN EXTRA ────────────────────────
`prov` is required, not optional. ADR-0012 calls the per-field provenance map
"the healthiest seam in the subsystem": publisher and dataset id for every column
of every chunk kind. Making it a required argument is what keeps it that way — a
field with no stated source cannot be written without someone noticing.
"""
from __future__ import annotations

import gzip
import pathlib
from typing import Sequence


class ChunkCatalogue:
    """Accumulates chunks and their schemas while a build writes them out."""

    def __init__(self, out_dir: pathlib.Path, cleared_prefixes: Sequence[str]):
        self.out = pathlib.Path(out_dir)
        self.cleared = tuple(cleared_prefixes)
        self.chunks: list[dict] = []
        self.kinds: dict[str, dict] = {}

    def emit(self, writer, *, tier: str, minZ: float, extent, prov: dict,
             note: str | None = None, extra: dict | None = None) -> None:
        """Serialise one chunk to disk and record it in the catalogue."""
        blob = writer.serialise()
        if writer.key.split("/")[0] not in self.cleared:
            raise ValueError(
                f"{writer.key}: prefix is not in the cleared set, so the next run "
                f"will not remove it — declare it first")
        path = self.out / f"{writer.key}.qc"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(blob)

        k = self.kinds.setdefault(writer.kind, {
            "fields": [{"n": f["n"], "t": f["t"]} for f in writer.fields()],
            "provenance": prov,
            **({"note": note} if note else {}),
        })
        if [f["n"] for f in k["fields"]] != [f["n"] for f in writer.fields()]:
            raise ValueError(f"{writer.kind}: chunks of one kind must share a field list")

        entry = {
            "k": writer.key,
            "kind": writer.kind,
            "tier": tier,
            "minZ": minZ,
            "b": len(blob),
            # mtime=0 so the same bytes in give the same bytes out. A gzip header
            # carrying the clock would make every re-run differ and there would
            # be no such thing as a control replay.
            "gz": len(gzip.compress(blob, 9, mtime=0)),
            "e": [round(float(v), 1) for v in extent] if extent else None,
        }
        if extra:
            entry.update(extra)
        self.chunks.append(entry)

    def tiers(self) -> dict[str, dict]:
        """Per-tier rollup: how many chunks, how many bytes, and the tier's floor.

        A client reads this to decide what a tier COSTS before fetching any of
        it, which is the only way "lazy beyond the second tier" can be a policy
        rather than a hope.
        """
        out: dict[str, dict] = {}
        for c in self.chunks:
            t = out.setdefault(c["tier"], {"chunks": 0, "bytes": 0, "gzipBytes": 0,
                                           "minZ": c["minZ"]})
            t["chunks"] += 1
            t["bytes"] += c["b"]
            t["gzipBytes"] += c["gz"]
        return out

    def sorted_chunks(self) -> list[dict]:
        """The catalogue in a stable order — by key, never by write order."""
        return sorted(self.chunks, key=lambda c: c["k"])

    def totals(self) -> tuple[int, int]:
        return (sum(c["b"] for c in self.chunks),
                sum(c["gz"] for c in self.chunks))
