"""Every decision that moves between two block builds, with a link that opens.

`verify_block_regression.py` answers one question — did the PRE-1999 layer move?
— and it must answer NO. This answers the other one: when a change is meant to
move the map, exactly WHICH rows moved, on which blocks, and where can a reader
go to check each one. It is not a gate; it is the list a person reads before
anything publishes.

    python3 enumerate_block_moves.py --baseline <dir> --current <dir> \
        --out moves_header_bleed.tsv

Both directories are `blocks/out/`. The TSV carries one line per row that left a
block and one per row that arrived, with the source URL reconstructed from the
row's own coordinates — `sourceHref()`'s two shapes, and nothing invented:

    c == "b"   sfbos.org/sites/default/files/<stem>_minutes.pdf#page=<n>
    otherwise  archive.org/details/<id>/page/n<leaf>/mode/1up

A row that is only re-ranked inside the same block is NOT a move and is not
listed: the reader-visible facts are the block it is on and the words on it.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

SFBOS = "https://sfbos.org/sites/default/files"
IA = "https://archive.org/details"


def load(dirp: pathlib.Path) -> dict[str, list]:
    per: dict[str, list] = {}
    for p in sorted(dirp.glob("block-*.json")):
        if p.name == "block-index.json":
            continue
        for b, v in json.loads(p.read_text()).items():
            per[b] = v["d"] if isinstance(v, dict) else v
    return per


def key(r: dict) -> tuple:
    """Everything a reader can see about one decision. Same shape as
    verify_block_regression.key(), so the two agree on what 'the same row' is."""
    return (r.get("y"), r.get("d"), r.get("k"), r.get("p"), r.get("f"),
            r.get("a"), r.get("u"), r.get("t"), r.get("g"))


def href(r: dict) -> str:
    u = r.get("u") or ""
    if r.get("c") == "b":
        stem, _, page = u.partition("/")
        return f"{SFBOS}/{stem}_minutes.pdf#page={page}"
    ident, _, leaf = u.rpartition("/")
    return f"{IA}/{ident}/page/n{leaf}/mode/1up" if ident else u


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--current", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--era", type=int, default=1999,
                    help="rows from this year on are the era being changed")
    a = ap.parse_args()

    bp = load(pathlib.Path(a.baseline))
    cp = load(pathlib.Path(a.current))
    print(f"  baseline {len(bp):,} blocks / {sum(len(v) for v in bp.values()):,} rows")
    print(f"  current  {len(cp):,} blocks / {sum(len(v) for v in cp.values()):,} rows")

    lost_blocks = sorted(set(bp) - set(cp))
    gained_blocks = sorted(set(cp) - set(bp))

    rows_out = []
    n_lost = n_new = 0
    blocks_touched = set()
    # a block loses its LAST modern record when it had one before and has none now
    lost_last_modern = []
    gained_first_modern = []
    era_lost_keys: set = set()
    era_new_keys: set = set()
    for b in sorted(set(bp) | set(cp)):
        old = {key(r): r for r in bp.get(b, [])}
        now = {key(r): r for r in cp.get(b, [])}
        gone = [old[k] for k in old if k not in now]
        came = [now[k] for k in now if k not in old]
        if gone or came:
            blocks_touched.add(b)
        for r in gone:
            n_lost += 1
            if (r.get("y") or 0) >= a.era:
                era_lost_keys.add(key(r))
            rows_out.append(("LOST", b, r))
        for r in came:
            n_new += 1
            if (r.get("y") or 0) >= a.era:
                era_new_keys.add(key(r))
            rows_out.append(("NEW", b, r))
        om = sum(1 for r in bp.get(b, []) if (r.get("y") or 0) >= a.era)
        nm = sum(1 for r in cp.get(b, []) if (r.get("y") or 0) >= a.era)
        if om and not nm:
            lost_last_modern.append((b, om))
        if nm and not om:
            gained_first_modern.append((b, nm))

    with open(a.out, "w") as f:
        f.write("direction\tblock\tyear\tdate\tkind\ttier\tcitation\tsource\ttext\n")
        for d, b, r in rows_out:
            f.write(f"{d}\t{b}\t{r.get('y')}\t{r.get('d')}\t{r.get('k')}\t"
                    f"{r.get('p')}\t{r.get('u')}\t{href(r)}\t"
                    f"{(r.get('t') or '')[:300]}\n")

    print(f"\n  blocks whose row list changed              {len(blocks_touched):>7,}")
    print(f"  rows that LEFT a block                     {n_lost:>7,}")
    print(f"  rows that ARRIVED on a block               {n_new:>7,}")
    print(f"  distinct >= {a.era} decisions that left     {len(era_lost_keys):>7,}")
    print(f"  distinct >= {a.era} decisions that arrived  {len(era_new_keys):>7,}")
    print(f"  blocks that lost their entry entirely      {len(lost_blocks):>7,}")
    print(f"  blocks that gained an entry                {len(gained_blocks):>7,}")
    print(f"  blocks that lost their LAST >= {a.era} record{len(lost_last_modern):>7,}")
    print(f"  blocks that gained a FIRST >= {a.era} record{len(gained_first_modern):>7,}")
    print(f"\n  -> {a.out}  ({len(rows_out):,} lines)")
    if lost_last_modern:
        print(f"\n  the blocks that lose their last modern record, and how many they had:")
        for b, n in lost_last_modern[:40]:
            print(f"    block {b}: {n}")
        if len(lost_last_modern) > 40:
            print(f"    … and {len(lost_last_modern) - 40} more, all in the TSV")
    by_year = collections.Counter(r.get("y") for d, _b, r in rows_out if d == "LOST")
    by_year_n = collections.Counter(r.get("y") for d, _b, r in rows_out if d == "NEW")
    print(f"\n  {'year':>6}{'left':>9}{'arrived':>9}")
    for y in sorted(set(by_year) | set(by_year_n), key=lambda x: (x is None, x)):
        print(f"  {str(y):>6}{by_year[y]:>9,}{by_year_n[y]:>9,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
