"""Near-duplicate collapse: when one decision is printed twice, keep it once.

WHAT IS TRUE OF A CITY HERE, and it is more than it looks. Any record series
long enough to be worth drawing prints the same decision more than once — a
by-law read at two sittings, a resolution reprinted when it is amended, a scan
OCR'd twice with one letter different. Collapse them and the map shows a
decision; do not, and it shows a block with four identical sewer orders on it.

The mechanism is generic. **Every threshold in it is a measurement of one
corpus** and none of them lives here: they are arguments, and the caller is
expected to keep the measurement that produced each one beside the call.

── THE PROPERTY THAT MAKES THIS WORTH SHARING: ORDER INDEPENDENCE ────────────
A collapse is only honest if the output is a function of the corpus and not of
the order the corpus arrived in. Get that wrong and merging new material
silently moves old material: rows leave records they have been attached to for
years, nobody chose it, and **nothing about it is visible in a row count.**

So neither function below can see arrival order. `collapse_by_key` groups, then
elects the group's representative by a total order on the row's own CONTENT.
`collapse_by_leader` walks in that same content order. The caller supplies the
order and is responsible for it being TOTAL — if two rows can tie on it, Python's
stable sort falls back to arrival order and the property is quietly gone.

── LEADER ELECTION, NOT TRANSITIVE CLUSTERING, AND THE DIFFERENCE IS LARGE ───
The obvious implementation is union-find: A resembles B, B resembles C,
therefore one group. **It over-collapses by chaining** — A and C are plainly
different and one of them is deleted anyway. The rule that does not chain is:
walk in a fixed order and drop a row only when it resembles a row already
ELECTED. A leader is never compared against another leader's followers.

── AND THE WINDOW IS NOT AN OPTIMISATION ─────────────────────────────────────
`window` bounds how many leaders a candidate is tested against, and it would be
easy to read it as a speed trick that could be raised to infinity for a better
answer. It is the opposite. On a coarse enough signature two genuinely different
records resemble each other routinely, so an unbounded comparison deletes real
material. The bound is doing semantic work and the caller's measurement is what
sets it.

NO CITY, NO CORPUS, NO THRESHOLD. This module is handed rows, a way to turn a
row into a set, and numbers. What a row is, what its text says and which corpus
it came from are the caller's business.
"""
from __future__ import annotations

import re
from typing import Callable, Hashable, Iterable, Sequence, TypeVar

Row = TypeVar("Row")


# ── SIGNATURES ───────────────────────────────────────────────────────────────
# Three ways of reducing a piece of text to something two printings of it agree
# on. Which one suits a record is a fact about how that record is printed and
# how it was digitised, so the caller chooses.

def letters_signature(text: str, keep: int) -> str:
    """Letters only, upper-cased, truncated.

    DIGITS ARE DROPPED ON PURPOSE and it is the whole point of this signature.
    A record that prints the same instrument at each reading typically differs
    between printings only in a sequence number, so a signature that keeps
    digits does not collapse the readings at all.
    """
    return re.sub(r"[^A-Za-z]", "", text)[:keep].upper()


def word_shingles(text: str, k: int = 4, min_word_len: int = 3) -> set[str]:
    """The set of k-word runs in `text`, short words dropped.

    Compares what two texts SAY rather than how they open, which is what is
    needed when a segmenter cuts two copies of one item at different points and
    their leading characters therefore differ.
    """
    w = re.sub(r"[^a-z ]", " ", text.lower()).split()
    w = [x for x in w if len(x) > min_word_len - 1]
    return {" ".join(w[i:i + k]) for i in range(max(0, len(w) - (k - 1)))}


def char_grams(s: str, k: int = 4) -> set[str]:
    """The set of k-character runs in `s`.

    For text that has been through OCR, where two printings of one line differ
    by a letter or two ("capacity" against "capaciiy"). A word-level test misses
    that; a character-level one does not.
    """
    return {s[i:i + k] for i in range(max(0, len(s) - (k - 1)))}


def overlap(a: set, b: set) -> float:
    """|a ∩ b| / min(|a|, |b|). Zero when either side is empty.

    NAMED HONESTLY, because it is repeatedly described as a Jaccard index and it
    is not one: Jaccard divides by the size of the UNION. Dividing by the
    smaller side makes a short text that is wholly contained in a longer one
    score 1.0, which is the behaviour wanted here — a truncated reprint IS the
    same record — but it is a different measure and thresholds do not carry
    between the two.
    """
    if not a or not b:
        return 0.0
    return len(a & b) / max(1, min(len(a), len(b)))


# ── THE TWO PASSES ───────────────────────────────────────────────────────────

def collapse_by_key(
    rows: Sequence[Row],
    key_of: Callable[[Row], Hashable],
    order: Callable[[Row], tuple],
) -> tuple[list[Row], int]:
    """Group on an exact key, elect one member of each group, drop the rest.

    Returns (kept, dropped_count). Output is sorted by `order`.

    AN EMPTY KEY GROUPS WITH NOTHING. A row whose signature came out empty has
    told us nothing about itself, and letting those pile into one bucket would
    delete all but one of them on the strength of no evidence at all.
    """
    groups: dict = {}
    for i, z in enumerate(rows):
        k = key_of(z)
        if k == "":
            groups[("", i)] = [z]
        else:
            groups.setdefault(k, []).append(z)
    out, dropped = [], 0
    for g in groups.values():
        g.sort(key=order)
        out.append(g[0])
        dropped += len(g) - 1
    return sorted(out, key=order), dropped


def collapse_by_leader(
    rows: Sequence[Row],
    sets: Sequence[set],
    *,
    threshold: float,
    window: int,
    min_set_size: int = 0,
) -> tuple[list[Row], int]:
    """Walk in the given order; drop a row that resembles an elected leader.

    `rows` and `sets` are parallel and `rows` must ALREADY be in the content
    order the caller wants — this function does not sort, because the order is
    the caller's invariant and hiding it here would make it easy to lose.

    `min_set_size` is a floor below which a row is never dropped: a signature
    too small to be distinctive would match half the corpus. Such a row is kept
    and does not become a leader either, so it cannot suppress anything.

    Returns (kept, dropped_count).
    """
    kept: list[Row] = []
    leaders: list[set | None] = []
    dropped = 0
    for z, g in zip(rows, sets):
        if len(g) >= min_set_size and any(
                overlap(g, o) > threshold for o in leaders[-window:] if o):
            dropped += 1
            continue
        leaders.append(g if len(g) >= min_set_size else None)
        kept.append(z)
    return kept, dropped


def is_near_duplicate(a: set, b: set, threshold: float) -> bool:
    """The pairwise test on its own, for callers measuring the threshold."""
    return overlap(a, b) > threshold


def _selftest() -> int:
    """Enough to catch a transcription error, run with `python3 nearcollapse.py`."""
    ok = True

    def check(label, got, want):
        nonlocal ok
        if got != want:
            ok = False
            print(f"  FAIL {label}: {got!r} != {want!r}")
        else:
            print(f"  ok   {label}")

    check("letters drop digits",
          letters_signature("Ordinance No. 1234 paving Grove", 99), "ORDINANCENOPAVINGGROVE")
    check("shingles keep 3-letter words", word_shingles("the quick brown fox jumps over", 4, 3),
          {"the quick brown fox", "quick brown fox jumps", "brown fox jumps over"})
    check("shingles drop short words", word_shingles("a of the quick brown fox", 4, 3),
          {"the quick brown fox"})
    check("grams", char_grams("abcdef", 4), {"abcd", "bcde", "cdef"})
    check("overlap containment", overlap({1, 2}, {1, 2, 3, 4}), 1.0)
    check("overlap empty", overlap(set(), {1}), 0.0)

    # order independence: same rows, two orders, same output
    rows = [("a", 3), ("b", 1), ("c", 2), ("d", 1)]
    order = lambda z: (z[1], z[0])            # noqa: E731 — total: (n, name)
    k1, d1 = collapse_by_key(rows, lambda z: z[1], order)
    k2, d2 = collapse_by_key(list(reversed(rows)), lambda z: z[1], order)
    check("collapse_by_key is order-independent", (k1, d1), (k2, d2))
    check("collapse_by_key elects by content", k1, [("b", 1), ("c", 2), ("a", 3)])

    empty = [("x", ""), ("y", "")]
    ke, de = collapse_by_key(empty, lambda z: z[1], lambda z: z)
    check("empty key groups with nothing", (len(ke), de), (2, 0))

    # leader election does not chain
    A, B, C = {1, 2, 3, 4}, {3, 4, 5, 6}, {5, 6, 7, 8}
    kept, dr = collapse_by_leader(["A", "B", "C"], [A, B, C],
                                  threshold=0.49, window=40)
    check("no chaining: A keeps, B drops to A, C keeps", (kept, dr), (["A", "C"], 1))

    kept, dr = collapse_by_leader(["A", "B"], [{1}, {1}],
                                  threshold=0.5, window=40, min_set_size=8)
    check("below the floor, nothing is dropped", (kept, dr), (["A", "B"], 0))

    print("\n  PASS" if ok else "\n  FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    import sys
    sys.exit(_selftest())
