"""Reading the published block layer back — the format's own reader.

WHAT IS TRUE OF A CITY HERE. The block layer publishes one index file and a set
of shard files, each shard a `{unit id: rows}` map, and each row a decision as a
reader sees it. That layout is the map's transport contract (see
`blocks/INTEGRATION.md`: one file at first paint, one per click, lazy
thereafter). It is defined by the format, not by whose city is inside it, so
every tool that wants to compare two builds needs exactly this reader — and
before this module there were two hand-written copies of it, in
`verify_block_regression.py` and `enumerate_block_moves.py`, held in agreement by
a COMMENT saying they were the same shape.

That comment is the reason this file exists. Two copies of an identity function
that must agree, and nothing checking that they do, is a bug waiting for someone
to add a field to one of them.

WHAT IS NOT HERE. How a row's citation becomes a URL — that is one publisher's
CMS and belongs beside the publisher. What a unit id means. What the cut year is
between one era of the record and the next. All of those are the caller's.
"""
from __future__ import annotations

import json
import pathlib


def load_blocks(dirp: pathlib.Path) -> dict[str, list]:
    """{unit id: [row, ...]} across every shard in a published build.

    Tolerates both shard shapes the layer has had: a bare list of rows, and a
    dict whose `d` key holds them.
    """
    per: dict[str, list] = {}
    for p in sorted(pathlib.Path(dirp).glob("block-*.json")):
        if p.name == "block-index.json":
            continue
        for b, v in json.loads(p.read_text()).items():
            per[b] = v["d"] if isinstance(v, dict) else v
    return per


def load_index(dirp: pathlib.Path) -> dict:
    return json.loads((pathlib.Path(dirp) / "block-index.json").read_text())


def row_key(r: dict) -> tuple:
    """Everything a reader can see about one decision.

    THE IDENTITY OF A ROW IS WHAT IS ON THE SCREEN, and that is the whole design
    of this function. Not an internal id, not a hash of the source record — the
    year, the date, the kind, the precision tier, the flags, the money, the
    citation, the text and the gloss. Two rows are the same row when a reader
    could not tell them apart.

    Anything added to what the layer publishes belongs here too, or a comparison
    will call two visibly different rows identical.
    """
    return (r.get("y"), r.get("d"), r.get("k"), r.get("p"), r.get("f"),
            r.get("a"), r.get("u"), r.get("t"), r.get("g"))


def compare_before(baseline: dict[str, list], current: dict[str, list],
                   cut: int) -> tuple[list[tuple], int, int]:
    """Which units' PRE-`cut` rows changed, element for element and in order.

    Returns (changed, n_baseline_rows, n_current_rows) where each `changed`
    entry is (unit, n_before, n_now, lost, gained).

    WHY THE COMPARISON IS A SUBSET AND NOT A FILE DIFF, and it is the point of
    the whole harness: when new material is merged the files MUST change — that
    is what merging is for. What must not change is the part of the record the
    new material has nothing to do with. A whole-file diff cannot express that
    and so gets ignored; this can, and fails.

    `cut` HAS NO DEFAULT HERE ON PURPOSE. An era boundary is a fact about one
    record series — where its bound volumes stop and its born-digital minutes
    begin, or where a publisher changed system — and a default would be one
    city's number quietly inherited by the next.
    """
    changed: list[tuple] = []
    n_base = n_cur = 0
    for b, rows in baseline.items():
        old = [row_key(r) for r in rows if (r.get("y") or 0) < cut]
        n_base += len(old)
        now = [row_key(r) for r in current.get(b, []) if (r.get("y") or 0) < cut]
        n_cur += len(now)
        if old != now:
            so, sn = set(old), set(now)
            changed.append((b, len(old), len(now), sorted(so - sn), sorted(sn - so)))
    return changed, n_base, n_cur
