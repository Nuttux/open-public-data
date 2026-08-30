"""The theme tag, checked against the tree it was published into.

Read-only. Writes nothing.

FOUR QUESTIONS, and the fourth is the one that matters.

  1. IS THE MASK IN RANGE. A bit nobody defined is a theme nobody can name, and
     the mask is positional, so an out-of-range bit is a silently mislabelled
     row rather than an error.

  2. DOES themes.json AGREE WITH THE SHARDS. The manifest's per-theme counts are
     what the UI will print beside each filter. They are recounted here from the
     shards themselves, so a stale manifest cannot claim a number the map does
     not draw.

  3. DOES theme-marks.json AGREE WITH THE SHARDS. The marks file is the same
     tag published a second time in the shape the GPU consumes. Two copies of
     one fact is a thing that can drift, so the multiset of (block, year, mask)
     is compared both ways — not just the totals, which would pass while the
     rows were wrong.

  4. WHAT WOULD A BROWSER REGEX HAVE FOUND. This re-measures the reason the tag
     is in the pipeline at all: the same pattern, run against the published line
     `t` instead of the source item, on the rows that are already here. It
     reports survival per theme. If that number is ever near 100%, the argument
     for tagging at build time has expired and this file should say so; while it
     is 17% for homelessness, a client-side filter is not a shortcut, it is a
     different dataset.

    python3 verify_themes.py [--tree <dir>]     default: the published website tree
"""
import argparse
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import themes as TH  # noqa: E402

REPO = TH.REPO
PUBLISHED = os.path.join(REPO, "website", "public", "data", "us", "sf", "city", "blocks")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tree", default=PUBLISHED,
                    help="the block tree to check (default: the published one)")
    a = ap.parse_args()
    T = a.tree
    seed = TH.load()
    defs = seed["themes"]
    nbits = len(defs)
    label = {t["bit"]: t["label"] for t in defs}

    man_p = os.path.join(T, "themes.json")
    mk_p = os.path.join(T, "theme-marks.json")
    for p in (man_p, mk_p):
        if not os.path.exists(p):
            sys.exit(f"REFUSED: {p} is not there. Run build_index.py first.")
    man = json.load(open(man_p))
    marks = json.load(open(mk_p))
    idx = json.load(open(os.path.join(T, "block-index.json")))
    pos = {b: i for i, b in enumerate(idx["b"])}

    # ---- walk the shards ------------------------------------------------
    n_rows = n_tagged = 0
    per_theme = collections.Counter()
    per_theme_blocks = collections.defaultdict(set)
    st_theme = collections.Counter()
    survives = collections.Counter()      # would a regex over `t` have found it
    shard_marks = collections.Counter()   # (block index, year, mask)
    bad_bits = []
    SH = idx["meta"]["shards"]
    for s in range(SH):
        p = os.path.join(T, f"block-{s:02d}.json")
        if not os.path.exists(p):
            sys.exit(f"REFUSED: shard {p} missing.")
        for bn, ent in json.load(open(p)).items():
            for d in ent.get("d", []):
                n_rows += 1
                m = d.get("m") or 0
                if not m:
                    continue
                if m >> nbits:
                    bad_bits.append((bn, m))
                    continue
                n_tagged += 1
                shard_marks[(pos[bn], d["y"], m)] += 1
                for bit in TH.bits_set(m):
                    per_theme[bit] += 1
                    per_theme_blocks[bit].add(bn)
                    # question 4, on the row the reader actually gets
                    if defs[bit]["_rx"].search(d.get("t") or ""):
                        survives[bit] += 1

    # the street-tier half, which the marks file deliberately does not carry
    st_dir = os.path.join(T, "street")
    seen_street = set()
    if os.path.isdir(st_dir):
        for f in os.listdir(st_dir):
            if not f.endswith(".json"):
                continue
            for d in json.load(open(os.path.join(st_dir, f))):
                m = d.get("m") or 0
                if not m or m >> nbits:
                    continue
                k = (d["u"], d["y"], m)
                if k in seen_street:
                    continue
                seen_street.add(k)
                for bit in TH.bits_set(m):
                    st_theme[bit] += 1

    fails = []
    if bad_bits:
        fails.append(f"{len(bad_bits):,} row(s) carry a bit above {nbits-1}, "
                     f"e.g. block {bad_bits[0][0]} mask {bad_bits[0][1]}")

    # ---- 2. the manifest against the shards -----------------------------
    for t in man["t"]:
        bit = t["bit"]
        if t["n"] != per_theme[bit]:
            fails.append(f'themes.json says {t["label"]} = {t["n"]:,}; the shards '
                         f'hold {per_theme[bit]:,}')
        if t["n_blocks"] != len(per_theme_blocks[bit]):
            fails.append(f'themes.json says {t["label"]} touches {t["n_blocks"]:,} '
                         f'blocks; the shards hold {len(per_theme_blocks[bit]):,}')

    # ---- 3. the marks against the shards --------------------------------
    #
    # The merged file carries every source, and only the Board's half is
    # answerable by the shards — a place has no assessor block and no row in a
    # block shard. So the comparison is made per source, against the source
    # that owns the rows, and the others are counted rather than silently
    # folded in. Folding them in is what the first version of this did, and it
    # reported 16,547 marks with no shard row as one failure.
    cols = ("s", "b", "r", "x", "y", "yr", "m")
    missing = [c for c in cols if c not in marks]
    if missing:
        fails.append(f"theme-marks.json is missing column(s) {missing}")
    else:
        n_mk = len(marks["s"])
        odd = [c for c in cols if len(marks[c]) != n_mk]
        if odd:
            fails.append(f"theme-marks.json columns {odd} are not length {n_mk}")
        by_src = collections.Counter(marks["s"])
        for src in marks.get("sources", []):
            if by_src[src["i"]] != src["n"]:
                fails.append(f'source {src["id"]} declares {src["n"]:,} marks; '
                             f'the columns hold {by_src[src["i"]]:,}')
        board = [i for i, s in enumerate(marks["s"])
                 if (marks.get("sources") or [{}])[s].get("open") == "block"]
        mk = collections.Counter(
            (marks["b"][i], marks["yr"][i], marks["m"][i]) for i in board)
        if mk != shard_marks:
            only_mk = sum((mk - shard_marks).values())
            only_sh = sum((shard_marks - mk).values())
            fails.append(f"the block-addressed marks and the shards disagree: "
                         f"{only_mk:,} mark(s) with no shard row, {only_sh:,} "
                         f"shard row(s) with no mark")
        # AND `r` HAS TO RESOLVE. A mark whose row index is off does not fail
        # any count — it opens the wrong decision, which is the one error a
        # reader would take as fact. Checked on a spread sample rather than all
        # 16,468, because it costs one shard fetch per block.
        rows_by_block: dict[int, list] = {}
        step = max(1, len(board) // 400)
        want = collections.defaultdict(list)
        for i in board[::step]:
            want[marks["b"][i] % SH].append(i)
        bad_r = 0
        for s, idxs in want.items():
            sh = json.load(open(os.path.join(T, f"block-{s:02d}.json")))
            for i in idxs:
                bn = idx["b"][marks["b"][i]]
                d = (sh.get(bn) or {}).get("d") or []
                r = marks["r"][i]
                if not (0 <= r < len(d)) or (d[r].get("m") or 0) != marks["m"][i]:
                    bad_r += 1
        if bad_r:
            fails.append(f"{bad_r:,} of {len(board[::step]):,} sampled marks have "
                         f"an `r` that does not resolve to a row with that mask — "
                         f"clicking them opens the wrong decision")
        else:
            rows_by_block = {}  # nothing to keep; the check is the point
            del rows_by_block

    # ---- report ----------------------------------------------------------
    print(f"tree: {T}")
    print(f"{n_rows:,} block-precision rows, {n_tagged:,} carry a theme "
          f"({100*n_tagged/max(1,n_rows):.1f}%)")
    for src in marks.get("sources", []):
        n_s = sum(1 for s in marks["s"] if s == src["i"])
        print(f"  {src['id']:<22} {n_s:>7,} marks   open={src['open']}")
    print(f"{len(marks['s']):,} marks in total\n")
    # `in street files` is NOT the same number themes.json reports as
    # n_street_only. The manifest counts every street-tier decision that exists;
    # this counts the rows that survived the 120-per-street cap and were
    # actually written. The published file is the smaller of the two and this is
    # the column that says so.
    print(f"  {'theme':<26} {'kind':<5} {'on map':>8} {'blocks':>7} {'in street files':>16} "
          f"{'browser regex would find':>26}")
    for t in defs:
        bit = t["bit"]
        n = per_theme[bit]
        pct = 100 * survives[bit] / n if n else 0
        print(f"  {t['label']:<26} {t['kind']:<5} {n:>8,} "
              f"{len(per_theme_blocks[bit]):>7,} {st_theme[bit]:>16,} "
              f"{survives[bit]:>15,}  {pct:>5.0f}%")
    tot_s = sum(survives.values()); tot_n = sum(per_theme.values())
    print(f"  {'':<26} {'':<5} {'':>8} {'':>7} {'':>16} {tot_s:>15,}  "
          f"{100*tot_s/max(1,tot_n):>5.0f}%")
    print(f"\n  The last column is what a client-side filter over the published "
          f"line would\n  have drawn. It is the reason the tag is computed in the "
          f"pipeline.")

    if fails:
        print("\nFAILED")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("\nOK — mask in range, manifest agrees with the shards, marks agree with "
          "the shards.")


if __name__ == "__main__":
    main()
