"""Prove an index is a function of its corpus and not of the corpus's order.

WHY THIS IS A SHARED THING AND NOT A ONE-OFF SCRIPT. Any index that collapses
near-duplicates, ranks, caps or shards has somewhere in it a comparison against
"what I have kept so far". The moment one exists, WHICH member of a set survives
depends on what arrived first — and the consequence is not a crash, it is silent
movement: merging new material moves old rows off records they have been attached
to for years. Nobody chooses it and nothing about it is visible in a row count.

"It should be order-independent now" is not a test. This is the test:

    SHUFFLE THE INPUT AND BUILD TWICE. EVERY PUBLISHED BYTE MUST MATCH.

It is a test that can FAIL, which is the only reason it is worth running: pointed
at the pre-redesign builder it does, and it named the exact defect — two rows
that tied on every content field, so a stable sort fell back to arrival order.

── WHAT THIS MODULE KNOWS AND WHAT IT REFUSES TO ─────────────────────────────
It knows: shuffle lines, run a build, hash a tree, compare. It does NOT know
which builder, where its corpus lives, which environment variables it takes or
what a published file is called. **The builder arrives as a callable** —
`build(corpus_path, out_dir)` — so declaring how a city's index is invoked stays
in that city's directory, where the answer actually lives. There is no registry
here and nothing to configure.

THE CANONICAL TREE IS NEVER WRITTEN. Shuffles go to a temporary directory and the
build is pointed at it. An earlier version shuffled the corpus in place and
restored it in a `finally`, and a `finally` that restores 155 MB is a worse
guarantee than never writing to it at all.
"""
from __future__ import annotations

import hashlib
import pathlib
import random
import shutil
import tempfile
from typing import Callable, Iterable, Sequence


def digest(out_dir: pathlib.Path, glob: str = "*.json",
           skip: Sequence[str] = ()) -> dict[str, str]:
    """sha256 per published file, keyed by path relative to `out_dir`.

    `skip` is for files that carry COUNTERS rather than published content — a
    provenance dump, a shard census. They are not what a reader sees and they
    legitimately differ between runs.
    """
    out = {}
    for p in sorted(pathlib.Path(out_dir).rglob(glob)):
        if p.name in skip:
            continue
        out[str(p.relative_to(out_dir))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def verify(build: Callable[[pathlib.Path, pathlib.Path], None],
           corpus: pathlib.Path,
           seeds: Iterable[int] = (101, 202),
           *,
           glob: str = "*.json",
           skip: Sequence[str] = (),
           log=print) -> bool:
    """Shuffle `corpus` once per seed, build each, and compare every hash.

    `corpus` is read only — it is a line-oriented file and the shuffles are
    written elsewhere. Returns True when every build agrees.
    """
    corpus = pathlib.Path(corpus)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="orderindep-"))
    log(f"  corpus {corpus}")
    log(f"  scratch {tmp}   (the canonical corpus and output are never written)")

    rows = corpus.read_text().splitlines()
    log(f"  {len(rows):,} rows")
    digests: list[tuple[int, dict[str, str]]] = []
    ok = True
    try:
        for s in seeds:
            shuffled = rows[:]
            random.Random(s).shuffle(shuffled)
            items = tmp / f"items.{s}{corpus.suffix}"
            out_dir = tmp / f"out.{s}"
            out_dir.mkdir(exist_ok=True)
            items.write_text("\n".join(shuffled) + "\n")
            log(f"  seed {s}: input shuffled, building…")
            build(items, out_dir)
            d = digest(out_dir, glob=glob, skip=skip)
            digests.append((s, d))
            log(f"    {len(d)} published files hashed")

        base_s, base = digests[0]
        for s, d in digests[1:]:
            if set(d) != set(base):
                ok = False
                log(f"  FAIL seed {s}: file SET differs "
                    f"({sorted(set(d) ^ set(base))[:5]})")
                continue
            diff = [k for k in base if base[k] != d[k]]
            if diff:
                ok = False
                log(f"  FAIL seed {s}: {len(diff)} of {len(base)} files differ")
                for k in diff[:10]:
                    log(f"      {k}")
            else:
                log(f"  seed {s} == seed {base_s}: all {len(base)} files identical")
        log("\n  PASS — the index is a function of the corpus, not of its order."
            if ok else "\n  FAIL — the index still depends on input order.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return ok
