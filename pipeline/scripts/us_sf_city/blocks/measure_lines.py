"""What the reader actually gets, counted off the published shards.

    python3 blocks/measure_lines.py [--samples N]

Reads every row this build writes — the 256 block shards and the 1,515 street
files — and answers four questions about the LINE, which is the only prose a
reader meets in the block drawer:

  where did it come from   the Board's own printed heading, or a sentence
  is it a clean sentence   opens upper-case, closes on a full stop, no ellipsis
                           at the front, no OCR wreckage in the first words
  does it say anything     a heading that is pure Board boilerplate says nothing
  is the money its own     a figure printed on a row it cannot be tied to
"""
import collections, glob, json, os, re, sys

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import OUT  # noqa: F401

LEAD_ELLIPSIS = re.compile(r"^\s*[….]")
TERMINAL = (".", "!", "…", "\"")
ORDINAL = re.compile(r"\d+(?:st|nd|rd|th)\b", re.I)
GARBLE = re.compile(r"[\\|{}~^_<>\[\]!*#@=+]|[A-Za-z]\d|\d[A-Za-z]")


def unclean(t):
    """Why this line is not a clean sentence, or None."""
    if not t:
        return None                       # no line at all is a separate answer
    if LEAD_ELLIPSIS.match(t):
        return "leading ellipsis"
    if not re.match(r"^[A-Z0-9$\"]", t):
        return "lower-case start"
    if not t.rstrip().endswith(TERMINAL):
        return "no terminal stop"
    if GARBLE.search(ORDINAL.sub("", t[:36])):
        return "OCR wreckage in the opening"
    return None


def rows():
    for f in sorted(glob.glob(os.path.join(OUT, "block-[0-9][0-9].json"))):
        for bn, rec in json.load(open(f)).items():
            for r in rec.get("d", []):
                yield "block", r
    for f in sorted(glob.glob(os.path.join(OUT, "street", "*.json"))):
        for r in json.load(open(f)):
            yield "street", r


def main():
    n = collections.Counter()
    why = collections.Counter()
    samples = collections.defaultdict(list)
    cap = int(sys.argv[sys.argv.index("--samples") + 1]) if "--samples" in sys.argv else 0
    for kind, r in rows():
        t = r.get("t") or ""
        n["rows"] += 1
        n["rows_" + kind] += 1
        g = r.get("g")
        n["heading" if g == "h" else "heading + entry" if g == "p" else "sentence"] += 1
        if not t:
            n["no line"] += 1
        u = unclean(t)
        if u:
            n["unclean"] += 1
            why[u] += 1
            if cap and len(samples[u]) < cap:
                samples[u].append(t)
        if r.get("a"):
            n["with money"] += 1
            if cap and len(samples["money"]) < cap:
                samples["money"].append(f'${r["a"]:,} — {t}')
    N = n["rows"]
    print(f"{N:,} rows  ({n['rows_block']:,} on a block, {n['rows_street']:,} on a street)\n")
    for k in ("heading", "heading + entry", "sentence", "no line", "unclean",
              "with money"):
        print(f"  {k:<12} {n[k]:>7,}  {100*n[k]/N:>5.1f}%")
    print("\n  why a line is not a clean sentence")
    for k, v in why.most_common():
        print(f"    {k:<28} {v:>7,}  {100*v/N:>5.1f}%")
    for k, ss in samples.items():
        print(f"\n  — {k} —")
        for x in ss:
            print("    ", x[:150])


if __name__ == "__main__":
    main()
