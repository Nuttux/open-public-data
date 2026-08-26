"""THE RECORD STATING ITS OWN BLOCK — what the Clerk actually prints, counted.

`build_index.STATED` was written for the Journal's wording, "Assessor's Block
2622". The Clerk of the Board writes something else, and the difference is four
separate things at once:

    Assessor’s Parcel Block No. 3568, Lot No. 003
            ^ curly       ^ the word Parcel     ^ a lot number after it
              apostrophe    between the two

so a regex reading `Assessor'?s?\\s+Block` matches none of it. §23.8 measured the
consequence: the `stated` tier — which outranks every inferred tier because it is
the city answering for itself — carried exactly ONE modern row.

THIS SCRIPT DOES NOT MATCH FIRST AND COUNT AFTERWARDS. It enumerates the printed
forms present in the corpus, with counts and an example of each, and only then
resolves them; and it counts what it REFUSES as carefully as what it takes,
because every refusal below is a form that a one-line regex would have taken.

    python3 measure_stated_blocks.py --inventory        the printed forms
    python3 measure_stated_blocks.py --resolve          forms -> blocks that exist
    python3 measure_stated_blocks.py --disagree         stated vs the tier it placed on
    python3 measure_stated_blocks.py --effect  <corpus> the same corpus placed twice
    python3 measure_stated_blocks.py --accuracy <corpus> --accuracy-new <corpus>
                                                        what it does to the score
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
ANIM = REPO / "scratchpad" / "sf-city-anim"
BLK = ANIM / "blocks"
ALL = HERE / "cache_sfbos" / "items_all.jsonl"
PLACED = HERE / "cache_sfbos" / "items.jsonl"
BLOCKS = ANIM / "geo" / "cache" / "blocks.json"


def _bi():
    import importlib.util
    sys.path.insert(0, str(BLK))
    sp = importlib.util.spec_from_file_location("bi", str(BLK / "build_index.py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


# ---------------------------------------------------------------- the forms
# EVERY ONE OF THESE IS A STRING THE CORPUS PRINTS. Nothing here is anticipated.
#
#   the qualifier      Assessor’s / Assessor's / Assessor s / Assessors / Assessor
#                      then optionally  Parcel , and then Block
#                      "Assessor’s Parcel Block (Block) No." occurs 3 times
#   the number word    No. / No / No: / Nos. / Number / Numbers / nothing
#   a parenthesis      "Block No. (AB) 2719C"                        6 times
#   the number         4 digits  1,582 · 4+letter  71 · 3 digits 22 · 2 digits 6
#                      the letter suffix is A/B/C, sometimes hyphenated
#   more than one      "Nos. 6332 and 6331"      ·  "Nos. 2780, 2783, 2784, …"
#   a range            "Nos. 41 through 43"                          2 items
#
# AND THE THINGS THAT LOOK THE SAME AND ARE NOT:
#
#   Community Development BLOCK GRANT            35   no number follows it
#   "the 900 block of Mason Street"              62   a stretch of street
#   "Mission Bay South Redevelopment Plan Block 13"   a PLAN block
#   "(Parkmerced Planning Block Nos. 20, 21S)"        a PLAN block, printed in
#                                                     the same sentence as the
#                                                     assessor blocks it renames
#
# The last three are excluded by construction rather than by a stop-list: the
# match must begin at the word Assessor. `Block Grant` is excluded because a
# number has to follow the word Block.
HEAD = re.compile(r"Assessor(?:[’'`]s|\s+s|s)?\s*(?:Parcel\s+)?"
                  r"Block\s*(?:\(Block\)\s*)?"
                  r"(?:Nos?\b[.:]?|Numbers?\b[.:]?)?\s*,?\s*(?:\(AB\)\s*)?", re.I)
# a block number as the Assessor prints it, and NOT the first digits of an OCR
# smudge: "Assessor's BlocK 3S13" must not be read as block 0003, so the token
# has to end at something that is neither a digit nor a letter.
NUM = re.compile(r"(\d{1,4})-?([A-Z]{1,2})?(?![0-9A-Za-z])")
SEP = re.compile(r"^\s*(?:,|;|and|&)\s*", re.I)
RANGE = re.compile(r"^\s*(?:through|thru|to)\s+\d", re.I)
# "generally bounded by Assessor's Parcel Block No. 0079 to the north" — a block
# named as the BOUNDARY of the site is not the site.
NEIGH_TAIL = re.compile(r"\s*(?:to|on|at)\s+the\s+(?:north|south|east|west)", re.I)
# and the same sentence saying "bounded by" at all disqualifies every block in
# it: "the summary street vacation of a portion of 25th Street, which is
# generally bounded by Assessor's Parcel Block No. 4241 ... to the north, Seawall
# Lot 355 (portions of ... No. 4298 ..., No. 4299 ..., and No. 4300 ...) to the
# south" names four blocks and the decision is on none of them — it is on the
# strip of street between them. Taking the ones whose own tail happens not to
# read "to the north" and leaving the one that does would be worse than taking
# none: it would move the item from the street it is on to a block beside it.
NEIGH_PRE = re.compile(r"bounded\s+by", re.I)
SENT = re.compile(r"[.;]\s")


def _sentence_start(s: str, i: int) -> int:
    j = 0
    for m in SENT.finditer(s, 0, i):
        j = m.end()
    return j


WS = re.compile(r"\s+")


def norm(tok: str) -> str:
    d = re.match(r"(\d+)-?([A-Z]*)", tok)
    return d.group(1).zfill(4) + d.group(2)


def claims(t: str, counters=None):
    """Every block the text states for ITSELF, plus why each refusal happened."""
    c = counters if counters is not None else {}

    def bump(k, n=1):
        c[k] = c.get(k, 0) + n

    s = re.sub(r"\s+", " ", t)
    out = []
    for m in HEAD.finditer(s):
        bump("qualifier printed")
        n = NUM.match(s, m.end())
        if not n:
            bump("no number after the word Block (Block Grant, 'and Lot Nos. listed herein')")
            continue
        p, nums, rng = n.end(), [n.group(0)], False
        if re.match(r"-\d", s[p:]):
            # "4285B-001" is a block and its lot; "096-0090-005-11" is another
            # county's APN. An SF assessor block is four digits.
            if not re.match(r"^\d{4}-?[A-Z]{0,2}$", n.group(0)):
                bump("an APN from another county (Sunol, Alameda watershed)")
                continue
            bump("block-and-lot printed with a hyphen")
        else:
            while True:
                if RANGE.match(s[p:]):
                    rng = True
                    break
                sp = SEP.match(s[p:])
                if not sp:
                    break
                n2 = NUM.match(s, p + sp.end())
                if not n2 or re.match(r"-\d", s[n2.end():]):
                    break
                nums.append(n2.group(0))
                p = n2.end()
        if rng:
            bump("a RANGE of blocks, not resolved")
            continue
        if NEIGH_TAIL.match(s[p:p + 24]) or \
                NEIGH_PRE.search(s[_sentence_start(s, m.start()):m.start()]):
            bump("a block named as the BOUNDARY of the site, not the site")
            continue
        if len(nums) > 1:
            bump(f"a list of {len(nums)} blocks")
        bump("claim kept")
        for x in nums:
            b = norm(x)
            if b not in out:
                out.append(b)
    return out


# ---------------------------------------------------------------- inventory
def do_inventory() -> None:
    rows = [json.loads(l) for l in open(ALL)]
    print(f"  {len(rows):,} items in the Board's own PDFs\n")
    heads, nums, tails, c = collections.Counter(), collections.Counter(), collections.Counter(), {}
    ex: dict = {}
    nrow = 0
    for r in rows:
        s = re.sub(r"\s+", " ", r["t"])
        hit = False
        for m in HEAD.finditer(s):
            hit = True
            k = re.sub(r"\d", "N", m.group(0).strip())
            heads[k] += 1
            ex.setdefault(k, s[max(0, m.start() - 40):m.end() + 40])
            n = NUM.match(s, m.end())
            if n:
                d = re.match(r"\d+", n.group(0)).group(0)
                nums[f"{len(d)} digits" + (" + letter" if not n.group(0)[-1].isdigit() else "")] += 1
                tails[" ".join(re.sub(r"\d+", "N", s[n.end():n.end() + 26]).split()[:3])] += 1
        if hit:
            nrow += 1
    print(f"  THE QUALIFIER, as printed        ({sum(heads.values()):,} occurrences "
          f"in {nrow:,} items)")
    for k, v in heads.most_common(30):
        print(f"    {v:>6,}  {k}")
    print(f"\n  THE NUMBER, as printed")
    for k, v in nums.most_common():
        print(f"    {v:>6,}  {k}")
    print(f"\n  WHAT FOLLOWS IT")
    for k, v in tails.most_common(16):
        print(f"    {v:>6,}  {k}")
    # THE LOOK-ALIKES, counted so the reader can see they were looked for. Every
    # one of these prints the word Block beside a number and none of them is an
    # assessor block. They are excluded by construction — the match has to begin
    # at the word Assessor — and not by a stop-list.
    LOOKALIKE = [
        ("Community Development BLOCK GRANT", re.compile(r"\bBlock\s+Grants?\b", re.I)),
        ("\"the 900 block of Mason Street\" — a stretch of street",
         re.compile(r"\b\d{2,4}\s+blocks?\s+of\b", re.I)),
        ("a REDEVELOPMENT PLAN block (Mission Bay)",
         re.compile(r"Redevelopment\s+(?:Plan\s+)?Block", re.I)),
        ("a PLANNING block (Parkmerced)", re.compile(r"Planning\s+Block", re.I)),
        ("the Assessor's BLOCK BOOKS, a citation not a location",
         re.compile(r"Block\s+Books?\b", re.I)),
        ("mid-block / fire blocks / block face", re.compile(r"\b(?:mid-block|fire blocks)\b", re.I)),
    ]
    print(f"\n  THE LOOK-ALIKES, and none of them is matched")
    for name, rx in LOOKALIKE:
        n = sum(len(rx.findall(re.sub(r"\s+", " ", r["t"]))) for r in rows)
        bad = 0
        for r in rows:
            s2 = re.sub(r"\s+", " ", r["t"])
            for m in rx.finditer(s2):
                for h in HEAD.finditer(s2):
                    if h.start() <= m.start() < h.end():
                        bad += 1
        print(f"    {n:>6,}  {name}" + (f"   MATCHED {bad}" if bad else ""))

    ctr: dict = {}
    kept = 0
    for r in rows:
        if claims(r["t"], ctr):
            kept += 1
    print(f"\n  WHAT THE MATCHER DOES WITH THEM")
    for k, v in sorted(ctr.items(), key=lambda x: -x[1]):
        print(f"    {v:>6,}  {k}")
    print(f"\n  items with at least one kept claim   {kept:,}")


# ---------------------------------------------------------------- resolve
def do_resolve() -> None:
    rows = [json.loads(l) for l in open(ALL)]
    bset = {b["b"] for b in json.load(open(BLOCKS))}
    per, unknown, known = {}, collections.Counter(), collections.Counter()
    for i, r in enumerate(rows):
        cs = claims(r["t"])
        if not cs:
            continue
        per[i] = cs
        for b in cs:
            (known if b in bset else unknown)[b] += 1
    print(f"  items stating their own block            {len(per):,}")
    print(f"  distinct block numbers stated            {len(known) + len(unknown):,}")
    print(f"  ...that EXIST in the published layer     {len(known):,}")
    print(f"  ...that the layer has never heard of     {len(unknown):,}")
    print(f"     {dict(unknown)}")
    # THE TWO COPIES ARE PROVED EQUAL. This file carries a second implementation
    # of the matcher because it has to count what it refuses and why, and
    # build_index's copy has no reason to. Two hand-kept copies of a walk is the
    # exact failure §23 removed, so they are compared over the whole corpus on
    # every run rather than trusted.
    bi = _bi()
    drift = 0
    for i, r in enumerate(rows):
        mine = [b for b in claims(r["t"]) if b in bset]
        theirs = bi.stated_blocks(r["t"], bset, wide=True)
        if mine != theirs:
            drift += 1
            if drift == 1:
                print(f"  FIRST DRIFT {r['v']} i={r['i']}: {mine} vs {theirs}")
    if drift:
        sys.exit(f"REFUSED: {drift} rows read differently here and in build_index")
    print(f"  this file's matcher == build_index.stated_blocks(wide=True) on all "
          f"{len(rows):,} rows\n")

    ok = {i: [b for b in cs if b in bset] for i, cs in per.items()}
    ok = {i: v for i, v in ok.items() if v}
    print(f"\n  items with >=1 stated block that exists  {len(ok):,}")
    print(f"  ...naming <= 4 blocks (locate()'s gate)   "
          f"{sum(1 for v in ok.values() if len(v) <= 4):,}")
    pl = collections.Counter(rows[i]["pl"] for i in ok)
    print(f"\n  do those items reach the map at all? (pl)")
    for k, v in pl.most_common():
        print(f"    {v:>6,}  {k}"
              + ("   <- IN the map corpus" if k == "placed"
                 else "   <- filtered out at the door: no street resolves"))
    df = collections.Counter(rows[i]["pk"] for i in ok)
    print(f"\n  by chunk form: {dict(df)}")
    kd = collections.Counter(rows[i]["k"] for i in ok)
    print(f"  by kind:       {dict(kd)}")
    # how many DISTINCT decisions, not printings
    fn = collections.Counter(rows[i].get("hf") or "" for i in ok)
    print(f"  distinct legislative files under them:   {len([k for k in fn if k]):,}")


# ---------------------------------------------------------------- disagree
def do_disagree(k: int, corpus: str = "") -> None:
    """Where the record states a block and the index inferred a different one.

    Run it on the corpus AS PUBLISHED, not on the corpus this change produces:
    the question is how good the inference has been on the map people are
    reading, and the answer is the mark the record gives it.
    """
    bi = _bi()
    idx = bi.street_index()
    blocks = json.load(open(BLOCKS))
    idx = bi.geometry_guard(idx, blocks)
    idx = {kk: v for kk, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    bi.ITEMS = corpus or str(PLACED)
    items, _p, _n = bi.load_items()
    # THE JOIN HAS TO BE BLIND TO THE ANSWER. `locate()` now reads the Clerk's
    # stated block itself, so asking it where an item lands and then comparing
    # that with the stated block would compare the answer with itself. The
    # Clerk's reading is switched off for the length of this join, exactly as
    # `measure_accuracy.py` switches the whole shortcut off for its second pass.
    wide_on = bi.stated_blocks
    bi.stated_blocks = lambda t, bm, wide=False: wide_on(t, bm, False)
    placed, _u, tier_n = bi.locate(items, idx, bmeta, bpos, order)
    bi.stated_blocks = wide_on
    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    print(f"  corpus {bi.ITEMS}")
    print(f"  {len(items):,} map-corpus rows, tiers "
          f"{ {TN[a]: b for a, b in sorted(tier_n.items(), reverse=True)} }")
    agree = collections.Counter()
    dis = []
    for did, tier, hits, _f in placed:
        r = items[did]
        sb = [b for b in claims(r["t"]) if b in bmeta]
        if not sb or len(sb) > 4:
            continue
        want, got = set(sb), set(hits)
        d = min((math.dist(bpos[h], bpos[w]) for h in got if h in bpos
                 for w in want if w in bpos), default=float("inf"))
        if want & got:
            agree[(TN[tier], "the stated block is among them")] += 1
        else:
            agree[(TN[tier], "DISAGREE")] += 1
            dis.append((did, TN[tier], sorted(want), sorted(got), d, r))
    n = sum(agree.values())
    print(f"\n  rows that state a block AND place today: {n:,}")
    for (t, w), v in sorted(agree.items()):
        print(f"    {v:>6,}  {t:<8} {w}")
    nd = len(dis)
    print(f"\n  DISAGREEMENT RATE  {nd:,}/{n:,} = {100.0*nd/max(1,n):.1f}%")
    if dis:
        ds = sorted(x[4] for x in dis if x[4] < float("inf"))
        print(f"  distance stated->inferred, metres: median {ds[len(ds)//2]:.0f}  "
              f"p10 {ds[len(ds)//10]:.0f}  p90 {ds[9*len(ds)//10]:.0f}  max {ds[-1]:.0f}")
        by = collections.Counter(x[1] for x in dis)
        print(f"  by the tier it placed on: {dict(by)}")
    dis.sort(key=lambda x: -x[4])
    print(f"\n  {min(k, nd)} read by hand, worst distance first:")
    for did, t, want, got, d, r in dis[:k]:
        stem = r["v"].split(":", 1)[1]
        print(f"\n  [{t}] states {want}  placed {got[:6]}  {d:.0f} m")
        print(f"      https://sfbos.org/sites/default/files/{stem}_minutes.pdf#page={r['page']}")
        print(f"      {re.sub(WS, ' ', r['t'])[:300]}")


# ---------------------------------------------------------------- effect
def do_effect(base: str) -> None:
    """The same corpus placed twice: with the Clerk's form read, and without.

    ONE VARIABLE. The corpus does not change between the two runs — only whether
    `stated_blocks` is allowed to read the Clerk's wording — so every difference
    below is that reading and nothing else.
    """
    bi = _bi()
    idx = bi.street_index()
    blocks = json.load(open(BLOCKS))
    idx = bi.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    wide_on = bi.stated_blocks

    def run(wide):
        bi.stated_blocks = (wide_on if wide
                            else (lambda t, bm, wide=False: wide_on(t, bm, False)))
        bi.ITEMS = base
        items, _p, _n = bi.load_items()
        placed, unpl, tier_n = bi.locate(items, idx, bmeta, bpos, order)
        per = {(items[d]["v"], items[d]["i"]): (t, frozenset(h))
               for d, t, h, _f in placed}
        return items, per, unpl, tier_n

    oi, O, ou, ot = run(False)
    ni, N, nu, nt = run(True)
    bi.stated_blocks = wide_on
    print(f"  corpus {base}  {len(oi):,} rows")
    print(f"  tiers, Clerk's form NOT read: "
          f"{ {TN[k]: v for k, v in sorted(ot.items(), reverse=True)} }")
    print(f"  tiers, Clerk's form read:     "
          f"{ {TN[k]: v for k, v in sorted(nt.items(), reverse=True)} }")
    Ob = {k: v for k, v in O.items() if v[0] >= 1}
    Nb = {k: v for k, v in N.items() if v[0] >= 1}
    same = sum(1 for k in Ob if k in Nb and Ob[k][1] == Nb[k][1])
    moved = [k for k in Ob if k in Nb and Ob[k][1] != Nb[k][1]]
    lost = [k for k in Ob if k not in Nb]
    new = [k for k in Nb if k not in Ob]
    print(f"\n  BLOCK-PRECISION PLACEMENTS  {len(Ob):,} -> {len(Nb):,}")
    print(f"    unchanged block set  {same:>7,}")
    print(f"    CHANGES block        {len(moved):>7,}")
    print(f"    LOSES placement      {len(lost):>7,}")
    print(f"    NEW placement        {len(new):>7,}")
    was = collections.Counter(TN[O[k][0]] for k in moved)
    print(f"    the tier they were on before: {dict(was)}")
    # WHAT KIND OF CHANGE. "changes block" is not the same question as "the
    # record and the index disagreed": most of these are the stated block
    # NARROWING a set the inference had already got right.
    kind = collections.Counter()
    for k in moved:
        a, b = O[k][1], N[k][1]
        kind["narrowed to a subset of what was inferred" if b < a else
             "widened to include what was inferred" if a < b else
             "overlaps, neither contains the other" if a & b else
             "DISJOINT — the record and the index disagree"] += 1
    for kk, v in kind.most_common():
        print(f"      {v:>6,}  {kk}")


# ---------------------------------------------------------------- accuracy
# WHAT THIS DOES TO THE PUBLISHED ACCURACY FIGURE, and the answer is not "it
# improved". `blocks/measure_accuracy.py` scores the index against the decisions
# that print their own block: it joins them a SECOND time with the stated
# sentence hidden, and asks how far the blind join landed from the answer. So
# the stated block is the ANSWER KEY, never an input to the thing being scored.
#
# Reading the Clerk's form therefore does not make the index score better. It
# ENLARGES THE ANSWER KEY — a modern half that the key could not see before
# joins it — and a score over a different population is a different measurement.
# The three runs below separate that from any real change in placement.
def do_accuracy(base: str, newcorpus: str = "") -> None:
    NEWCORPUS = newcorpus or str(PLACED)
    bi = _bi()
    idx = bi.street_index()
    blocks = json.load(open(BLOCKS))
    idx = bi.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    FACE, NEAR = 120.0, 250.0
    wide_on = bi.stated_blocks

    def score(path, truth_wide):
        # build_index.load_items() ITSELF, not a copy of it: it is what attaches
        # the Journal's prefaces.json and the Clerk's `hp`, and a measurement
        # that skipped either would be scoring a corpus the index never builds.
        # Whether the header is given is decided by the CORPUS — the published
        # stream carries no `hp` at all — so there is no flag to get wrong.
        bi.ITEMS = path
        items, _npre, _nnew = bi.load_items()
        truth = {}
        for did, r in enumerate(items):
            # the answer key grows only where the CLERK writes, which is the
            # same per-row rule locate() applies
            sb = wide_on(r["t"], bmeta,
                         wide=truth_wide and r["v"].startswith("sfbos:"))
            if sb and len(sb) <= 4:
                truth[did] = set(sb)
        # the blind join is the SAME code the shipped index runs with the
        # shortcut off, exactly as measure_accuracy.py runs it
        bi.stated_blocks = lambda t, bm, wide=False: wide_on(t, bm, False)
        blind, _u, _t = bi.locate(items, idx, bmeta, bpos, order, use_stated=False)
        bi.stated_blocks = wide_on
        n = ex = fa = ne = 0
        by = collections.defaultdict(collections.Counter)
        for did, tier, hits, _f in blind:
            if did not in truth or tier < 1:
                continue
            want, got = truth[did], set(hits)
            hit = bool(want & got)
            d = min((math.dist(bpos[h], bpos[w]) for h in got if h in bpos
                     for w in want if w in bpos), default=float("inf"))
            n += 1
            ex += hit
            fa += hit or d <= FACE
            ne += hit or d <= NEAR
            by[TN[tier]]["n"] += 1
            by[TN[tier]]["exact"] += hit
        return n, ex, fa, ne, by, len(truth)

    for label, path, tw in [
            ("as published — the Journal's wording only", base, False),
            ("the answer key gains the Clerk's wording", base, True),
            ("…and the header is given to the item below", NEWCORPUS, True)]:
        n, ex, fa, ne, by, nt = score(path, tw)
        print(f"\n  {label}")
        print(f"      items whose text states a block   {nt:,}")
        print(f"      of those, blind-placed at block precision and scored  {n:,}")
        if n:
            print(f"      exact {100.0*ex/n:5.1f}%   within one block face "
                  f"{100.0*fa/n:5.1f}%   within 250 m {100.0*ne/n:5.1f}%")
            print("      by tier: " + "  ".join(
                f"{k} {v['n']:,}/{100.0*v['exact']/v['n']:.0f}%" for k, v in sorted(by.items())))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inventory", action="store_true")
    ap.add_argument("--resolve", action="store_true")
    ap.add_argument("--disagree", nargs="?", const="", default=None,
                    metavar="CORPUS",
                    help="stated vs the tier it placed on, over CORPUS "
                         "(default cache_sfbos/items.jsonl)")
    ap.add_argument("--accuracy", metavar="CORPUS",
                    help="what this does to measure_accuracy.py's figure")
    ap.add_argument("--accuracy-new", metavar="CORPUS", default="",
                    help="the corpus for step 3 (default cache_sfbos/items.jsonl)")
    ap.add_argument("--effect", metavar="CORPUS",
                    help="place this corpus twice, with and without the Clerk's form")
    ap.add_argument("-k", type=int, default=12)
    a = ap.parse_args()
    if a.inventory:
        do_inventory()
    if a.resolve:
        do_resolve()
    if a.disagree is not None:
        do_disagree(a.k, a.disagree)
    if a.effect:
        do_effect(a.effect)
    if a.accuracy:
        do_accuracy(a.accuracy, a.accuracy_new)
    if not (a.inventory or a.resolve or a.disagree is not None or a.effect
            or a.accuracy):
        ap.error("one of --inventory / --resolve / --disagree / --effect / --accuracy")


if __name__ == "__main__":
    main()
