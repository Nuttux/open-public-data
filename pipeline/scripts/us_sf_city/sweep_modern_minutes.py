"""Sweep the RENAMED half of the Board's series into the existing block pipeline.

The Journal sweep (`scratchpad/sf-city-anim/sweep/`) enumerated archive.org with
`title:"Journal of proceedings"` and therefore stopped in 1999. The series does
not stop; it is retitled. This sweeps the retitled volumes THROUGH THE SAME
CODE — `sweep/extract_items.py::sweep_one`, unmodified — so the rows it emits are
the same shape, from the same walk, and merge as a concatenation.

WHAT IS IN SCOPE, AND THE ONE THING THAT IS DELIBERATELY NOT
------------------------------------------------------------
Only volumes whose coverage **reaches 1999 or later**.

The enumeration also finds 64 volumes titled "Minutes" covering **1974-1998** —
years the bound Journal volumes ALREADY cover and which are already in the index.
Those are not swept. They are very probably the same meetings in a different
binding, and ingesting them would add a second copy of decisions the map already
shows, which would change pre-1999 blocks. Changing pre-1999 blocks is the one
outcome this whole exercise must not produce. They are listed in the report as a
separate question, not silently dropped and not silently merged.

TWO PARITY GATES, both must pass before anything merges
--------------------------------------------------------
1. `sweep/verify_parity.py` — the sweeper reproduces already-swept volumes
   byte-for-byte. Run it FIRST; this script refuses to write if it has not been.
2. This script rebuilds `sweep/out/items.jsonl` from every per-volume shard and
   asserts the rows of the 87 previously-swept volumes are **element for element
   identical** to what that file already held.

Usage:
    python3 sweep_modern_minutes.py --plan       what would be swept
    python3 sweep_modern_minutes.py --sweep      sweep (idempotent, skips done)
    python3 sweep_modern_minutes.py --assemble   rebuild out/items.jsonl + gate 2
"""
from __future__ import annotations

import argparse
import collections
import gzip
import importlib.util
import json
import os
import pathlib
import re
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
ANIM = REPO / "scratchpad" / "sf-city-anim"
SWEEP = ANIM / "sweep"
OUTD = SWEEP / "out" / "items"
STREAM = SWEEP / "out" / "items.jsonl"
SEED = REPO / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_bos_minutes.tsv"
# both OCR caches are searched: the Journal sweep filled sweep/cache/ia, the
# modern fetch filled geo/cache/ia
IA_DIRS = [ANIM / "geo" / "cache" / "ia", SWEEP / "cache" / "ia"]

FROM_YEAR = 1999


def _load(path: pathlib.Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def seed_rows() -> list[dict]:
    out = []
    for ln in open(SEED):
        if ln.startswith("#") or ln.startswith("year_from"):
            continue
        p = ln.rstrip("\n").split("\t")
        if len(p) >= 5:
            out.append({"y0": int(p[0]), "y1": int(p[1]), "id": p[2],
                        "volume": p[3], "title": p[4]})
    return out


def already() -> tuple[set[str], set[str]]:
    man = json.load(open(SWEEP / "manifest.json"))
    known = {r["id"] for r in man}
    inidx = {json.loads(l)["v"] for l in open(ANIM / "blocks" / "cache" / "items.jsonl")}
    return known, inidx


def ocr_dir(ident: str) -> pathlib.Path | None:
    for d in IA_DIRS:
        if (d / f"{ident}_hocr_searchtext.txt.gz").exists():
            return d
    return None


def plan() -> tuple[list[dict], list[dict], list[dict]]:
    rows = seed_rows()
    known, inidx = already()
    new = [r for r in rows if r["id"] not in known and r["id"] not in inidx]
    modern = [r for r in new if r["y1"] >= FROM_YEAR]
    overlap = [r for r in new if r["y1"] < FROM_YEAR]
    nocr = [r for r in modern if ocr_dir(r["id"]) is None]
    return modern, overlap, nocr


def do_plan() -> None:
    modern, overlap, nocr = plan()
    print(f"  seed volumes                     {len(seed_rows())}")
    print(f"  IN SCOPE (coverage reaches {FROM_YEAR}+) {len(modern)}")
    print(f"  NOT swept: 'Minutes' volumes covering 1974-1998, years the Journal")
    print(f"             volumes already carry                 {len(overlap)}")
    print(f"  missing OCR                                       {len(nocr)}")
    for r in nocr:
        print(f"      {r['id']}")
    done = sum(1 for r in modern if (OUTD / f"{r['id']}.meta.json").exists())
    print(f"  already swept in a previous run                   {done}")
    byy: collections.Counter = collections.Counter()
    for r in modern:
        for y in range(max(r["y0"], FROM_YEAR), r["y1"] + 1):
            byy[y] += 1
    print("\n  in-scope volumes per coverage year:")
    for y in sorted(byy):
        print(f"    {y}  {'#' * min(byy[y], 30)} {byy[y]}")


def do_sweep(force: bool) -> None:
    if not (SWEEP / "out" / "PARITY_OK").exists():
        print("  gate 1: running sweep/verify_parity.py")
        import subprocess
        r = subprocess.run([sys.executable, str(SWEEP / "verify_parity.py")],
                           capture_output=True, text=True, cwd=str(SWEEP))
        print("    " + r.stdout.strip().replace("\n", "\n    "))
        if "PARITY OK" not in r.stdout:
            sys.exit("REFUSED: parity gate 1 did not pass")
        (SWEEP / "out" / "PARITY_OK").write_text(
            f"verify_parity.py passed {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n")

    ei = _load(SWEEP / "extract_items.py", "ei")
    gaz = ei.gz.build()
    keys = list(gaz)
    print(f"  gazetteer: {len(gaz)} real SF streets")
    modern, _, _ = plan()
    OUTD.mkdir(parents=True, exist_ok=True)
    fails: dict[str, dict] = {}
    n_ok = n_skip = 0
    for k, r in enumerate(sorted(modern, key=lambda x: x["id"]), 1):
        ident, year = r["id"], max(r["y0"], FROM_YEAR)
        mp = OUTD / f"{ident}.meta.json"
        if mp.exists() and not force:
            n_skip += 1
            continue
        d = ocr_dir(ident)
        if d is None:
            fails[ident] = {"year": year, "why": "no cached OCR"}
            continue
        ei.IA = str(d)          # the sweeper reads whichever cache holds it
        t0 = time.time()
        got, err = ei.sweep_one(ident, year, gaz, keys)
        if err:
            fails[ident] = {"year": year, "why": err}
            print(f"  [{k:>3}/{len(modern)}] {year} {ident:<44} FAIL {err}", flush=True)
            continue
        rows, meta = got
        with open(OUTD / f"{ident}.jsonl", "w") as f:
            for row in rows:
                f.write(json.dumps(row) + "\n")
        json.dump(meta, open(mp, "w"), indent=1)
        n_ok += 1
        print(f"  [{k:>3}/{len(modern)}] {year} {ident:<44} {meta['pages']:>5} pp "
              f"{meta['rows']:>6} items {meta['located']:>6} located "
              f"{time.time() - t0:.0f}s", flush=True)
    print(f"\n  swept {n_ok}, skipped {n_skip}, failed {len(fails)}")
    if fails:
        json.dump(fails, open(SWEEP / "out" / "modern_fails.json", "w"), indent=1)
        for i, v in list(fails.items())[:10]:
            print(f"    FAIL {i}  {v['why']}")


# ---------------------------------------------------------------- gate 3
# TWO THINGS THE CATALOGUE DOES NOT TELL YOU, both found by reading the scans.
#
# 1. A COMMITTEE IS NOT THE BOARD. 28 of the swept volumes are Finance, Rules,
#    Budget, Audit or Public Health committee minutes. The catalogue titles them
#    plainly "Minutes", so the title filter in build_minutes_manifest.py cannot
#    see them — the body is named INSIDE the document, on the cover page, and
#    nowhere else. A committee's minutes are one committee's business, not the
#    Board's session, and the Journal half of this corpus contains none of them.
#    Merging them would silently change what "the Board decided here" means.
#    869 items of 33,411.
#
# 2. A CATALOGUE YEAR CAN BE TWENTY-THREE YEARS WRONG. meetingminutesd2015sanf_0
#    is catalogued 2015 and is the MENTAL HEALTH ADVISORY BOARD meeting of
#    16 December 1992. Caught by comparing the volume's assigned year against the
#    meeting dates its OWN items carry — the document contradicting its record.
#
# Both are checked against the scan, both are written to modern_excluded.json
# with the evidence, and neither is a hand-maintained list.
BODY_RX = re.compile(r"MEETING MINUTES\s+(.{0,52})", re.I)
CTTEE_RX = re.compile(r"\b([A-Z][A-Za-z,&' ]{3,44}?)\s+Committee\b")
OTHER_RX = re.compile(r"Advisory Board|Commission\b")


def _head(ident: str, n: int = 6000) -> str:
    for d in IA_DIRS:
        q = d / f"{ident}_hocr_searchtext.txt.gz"
        if q.exists():
            return re.sub(r"\s+", " ", gzip.open(q, "rt", errors="replace").read(n))
    return ""


def classify() -> dict[str, dict]:
    """Per swept modern volume: the body its own cover names, and whether its
    items' meeting dates agree with its catalogued year."""
    out: dict[str, dict] = {}
    for p in sorted(OUTD.glob("*.jsonl")):
        ident = p.stem
        if ident.startswith("journal"):
            continue
        meta = json.loads((OUTD / f"{ident}.meta.json").read_text())
        yrs: collections.Counter = collections.Counter()
        n = 0
        for ln in open(p):
            d = json.loads(ln)
            n += 1
            if d.get("dt"):
                yrs[int(d["dt"][:4])] += 1
        ctx = (BODY_RX.search(_head(ident)) or [None, ""])[1] if BODY_RX.search(_head(ident)) else ""
        body, why = "board", None
        mm = CTTEE_RX.search(ctx)
        if mm:
            body, why = "committee", f"cover names '{mm.group(1).strip()} Committee'"
        elif OTHER_RX.search(ctx):
            body, why = "other", f"cover names '{ctx[:40].strip()}'"
        mode = yrs.most_common(1)[0][0] if yrs else None
        if mode is not None and abs(mode - meta["year"]) > 1:
            body = "miscatalogued"
            why = (f"catalogued {meta['year']}, its own items' meeting dates say "
                   f"{mode} ({yrs[mode]} of {sum(yrs.values())} dated)")
        out[ident] = {"body": body, "why": why, "items": n,
                      "year": meta["year"], "date_mode": mode}
    return out


def do_assemble() -> None:
    """Rebuild out/items.jsonl from every shard, and PROVE the old rows are intact."""
    before: dict[str, list[str]] = collections.defaultdict(list)
    if STREAM.exists():
        for ln in open(STREAM):
            before[json.loads(ln)["v"]].append(ln.rstrip("\n"))
    print(f"  existing stream: {sum(len(v) for v in before.values()):,} rows / "
          f"{len(before)} volumes")

    cls = classify()
    excl = {k: v for k, v in cls.items() if v["body"] != "board"}
    (SWEEP / "out" / "modern_excluded.json").write_text(json.dumps(excl, indent=1))
    by = collections.Counter(v["body"] for v in cls.values())
    print(f"  GATE 3 bodies, read from each scan's own cover: {dict(by)}")
    print(f"    excluded {len(excl)} volumes / "
          f"{sum(v['items'] for v in excl.values()):,} items — see out/modern_excluded.json")

    shards = sorted(OUTD.glob("*.jsonl"))
    after: dict[str, list[str]] = {}
    for p in shards:
        if p.stem in excl:
            continue
        after[p.stem] = [l.rstrip("\n") for l in open(p) if l.strip()]

    # ---- GATE 2: element for element on every volume the stream already had
    # A volume may leave the stream ONLY because gate 3 declared it non-Board.
    # Any other disappearance, and any change to a volume that stays, is a
    # regression and stops the build.
    moved = []
    for v, rows in before.items():
        now = after.get(v)
        if now is None:
            if v in excl:
                continue          # declared exclusion, with its evidence on disk
            moved.append((v, "volume disappeared from the shards"))
        elif now != rows:
            d = sum(1 for a, b in zip(rows, now) if a != b)
            moved.append((v, f"{len(rows)} -> {len(now)} rows, {d} differ"))
    if moved:
        for v, why in moved[:20]:
            print(f"    CHANGED {v}: {why}")
        sys.exit(f"REFUSED: {len(moved)} previously-swept volumes changed. "
                 f"Nothing written.")
    kept_before = [v for v in before if v not in excl]
    print(f"  GATE 2 PASS: all {len(kept_before)} previously-swept volumes that "
          f"remain in scope are element-for-element identical "
          f"({len(before) - len(kept_before)} left by declared exclusion)")

    with open(STREAM, "w") as f:
        for v in sorted(after):
            for ln in after[v]:
                f.write(ln + "\n")
    tot = sum(len(v) for v in after.values())
    print(f"  wrote {STREAM.relative_to(REPO)}  {tot:,} rows / {len(after)} volumes "
          f"(+{tot - sum(len(v) for v in before.values()):,} rows, "
          f"+{len(after) - len(before)} volumes)")


# ---------------------------------------------------------------- leafmap
# blocks/fetch_leafmap.py reads ANIM/vols.txt and OVERWRITES blocks/cache/leafmap.json
# with only the volumes listed there. vols.txt holds 59; the cache holds 186. Running
# it as-is would silently drop the page links of 127 volumes. This does the same
# scandata walk and MERGES, refusing to change any volume already mapped.
PAGE_RX = re.compile(r'<page leafNum="(\d+)">(.*?)</page>', re.S)


def do_leafmap() -> None:
    import subprocess
    sd = ANIM / "blocks" / "cache" / "scandata"
    sd.mkdir(parents=True, exist_ok=True)
    lm_path = ANIM / "blocks" / "cache" / "leafmap.json"
    lm = json.loads(lm_path.read_text())
    print(f"  existing leafmap: {len(lm)} volumes")
    cls = classify()
    want = [k for k, v in cls.items() if v["body"] == "board" and k not in lm]
    print(f"  need scandata for {len(want)} newly-swept Board volumes")
    added = nosd = 0
    for k, ident in enumerate(sorted(want), 1):
        pi_gz = None
        for d in IA_DIRS:
            q = d / f"{ident}_hocr_pageindex.json.gz"
            if q.exists():
                pi_gz = q
                break
        if pi_gz is None:
            continue
        f = sd / f"{ident}.xml"
        if not (f.exists() and f.stat().st_size > 20000):
            for url in (f"https://archive.org/download/{ident}/{ident}_scandata.xml",
                        f"https://archive.org/download/{ident}/scandata.zip/scandata.xml"):
                subprocess.run(["curl", "-sL", "--max-time", "300", "-o", str(f), url],
                               check=False)
                if f.exists() and f.stat().st_size > 20000 and b"<book" in f.read_bytes()[:400]:
                    break
        if not (f.exists() and f.stat().st_size > 20000):
            nosd += 1
            continue
        pages = PAGE_RX.findall(f.read_text(encoding="utf-8", errors="replace"))
        if not pages:
            nosd += 1
            continue
        m, run = [], 0
        for _, body in pages:
            if "addToAccessFormats>true<" in body:
                m.append(run); run += 1
            else:
                m.append(None)
        try:
            pi = json.load(gzip.open(pi_gz, "rt"))
        except Exception:
            nosd += 1
            continue
        if len(pi) != len(m):
            # the two indices must describe the same book or the mapping is a guess
            print(f"    LEN MISMATCH {ident}: hocr {len(pi)} scandata {len(m)} — skipped")
            nosd += 1
            continue
        lm[ident] = m
        added += 1
        if k % 25 == 0:
            print(f"    … {k}/{len(want)}", flush=True)
    # nothing already mapped may change
    old = json.loads((ANIM / "blocks" / "cache" / "leafmap.json").read_text())
    for v in old:
        assert lm[v] == old[v], f"leafmap for {v} changed"
    lm_path.write_text(json.dumps(lm))
    print(f"  leafmap: +{added} volumes -> {len(lm)} total; {nosd} without usable scandata")


# ---------------------------------------------------------------- gate 5
# ONE SCAN PER MEETING. The Internet Archive holds the 1999-2016 minutes several
# times over: the same physical volume scanned twice under two identifiers, the
# Clerk's DRAFT beside the final, and annual volumes overlapping the quarterly
# ones they were bound from. Measured: 54.6% of that era's meeting dates are
# carried by more than one volume and 83.4% of its rows sit on such a date, one
# meeting appearing in SEVEN. Collapse near-duplicates within a meeting and the
# era shrinks by 48.3%, at which point it agrees with the Journal on decisions
# per meeting (13.5 against 14.9).
#
# Shipping seven scans of one meeting as seven decisions would be wrong even if
# nothing downstream broke, so it is fixed HERE, at the source, and not left to
# the index's near-duplicate pass to absorb one block at a time at ranking time.
#
# THE UNIT IS THE MEETING, AND ONLY THE MEETING. Two decisions taken on two
# different dates are two decisions however alike they read, and nothing below
# ever compares them: every comparison is keyed on one exact meeting date. This
# collapses re-scans of one session; it does not collapse a subject.
#
# SCOPE: THE MODERN ERA ONLY. The Journal has the same problem at 2.3% of dates,
# and fixing it there would change pre-1999 blocks — the one outcome this whole
# exercise exists to prevent. The Journal's own overlap is left alone and is
# recorded in MINUTES.md as a separate, later question.
#
# THE RULE, IN ORDER, AND IT REPORTS WHAT IT CHOSE:
#   1. a FINAL beats a DRAFT                (title carries "Draft")
#   2. the FULLER READING of that meeting   (more items dated to it — a volume
#      holding three items for a date it barely touches is date carry-forward
#      leaking across a page boundary, not the binding that holds the session)
#   3. the BETTER OCR on that meeting       (higher share of street mentions the
#      gazetteer recognises)
#   4. tie-break by identifier — used ONLY when the two readings are
#      EQUIVALENT (same item count, >=0.9 of their item texts shared). When two
#      readings differ materially and nothing above separates them, the date is
#      NOT quietly resolved: it is counted, printed, and if there are more than
#      UNDECIDED_MAX of them the merge refuses to run.
UNDECIDED_MAX = 25


def _shingles(t: str, n: int = 5) -> set[str]:
    w = re.sub(r"[^a-z0-9 ]", "", t.lower()).split()
    return {" ".join(w[i:i + n]) for i in range(max(0, len(w) - n + 1))}


def _match_rate(a: list, b: list) -> float:
    """Share of a's items that have a near-twin in b, by word shingle."""
    sb = [x for x in (_shingles(r["t"]) for r in b) if len(x) >= 4]
    hit = tot = 0
    for r in a:
        sa = _shingles(r["t"])
        if len(sa) < 4:
            continue
        tot += 1
        if any(len(sa & o) / max(1, min(len(sa), len(o))) > 0.55 for o in sb):
            hit += 1
    return hit / tot if tot else 0.0


def _equivalent(a: list, b: list) -> bool:
    """Are these two readings of the SAME meeting, allowing for OCR?

    An exact test is the wrong one and was measured to be: two scans of one
    session agree on only 0.74-0.89 of their items by exact text, because they
    are two OCR passes over the same ink. Compared as word shingles — the test
    build_index already uses to collapse a reprint — the same three pairs match
    at 1.00, 1.00, 1.00. So equivalence is: nearly every item on one side has a
    near-twin on the other. Calibrated on 2000-01-31, 2000-05-15 and 2001-01-02.
    """
    if not a or not b:
        return False
    if abs(len(a) - len(b)) > max(1, 0.1 * max(len(a), len(b))):
        return False
    return _match_rate(a, b) >= 0.95


def choose_scans(verbose: bool = False):
    """-> ({(volume, date) kept}, {volumes that won nothing}, report)"""
    cls = classify()
    cov = {}
    titles = {}
    for ln in open(SEED):
        if ln.startswith("#") or ln.startswith("year_from"):
            continue
        q = ln.rstrip("\n").split("\t")
        if len(q) >= 5:
            cov[q[2]] = (int(q[0]), int(q[1]))
            titles[q[2]] = q[4]
    have = {json.loads(l)["v"] for l in open(ANIM / "blocks" / "cache" / "items.jsonl")}
    vols = [k for k, v in cls.items() if v["body"] == "board" and k not in have]

    by_date: dict[str, dict[str, list]] = collections.defaultdict(dict)
    undated: dict[str, list] = {}
    for ident in sorted(vols):
        y0 = cov.get(ident, (FROM_YEAR, FROM_YEAR))[0]
        rows = [json.loads(l) for l in open(OUTD / f"{ident}.jsonl")]
        und = []
        for r in rows:
            dt = r.get("dt")
            if dt:
                if int(str(dt)[:4]) < FROM_YEAR:
                    continue                      # gate 4 owns this
                by_date[str(dt)].setdefault(ident, []).append(r)
            elif y0 >= FROM_YEAR:
                und.append(r)
        undated[ident] = und

    keep: set[tuple] = set()
    undecided: list = []
    why = collections.Counter()
    picks = []
    for dt in sorted(by_date):
        cand = by_date[dt]
        if len(cand) == 1:
            only = next(iter(cand))
            keep.add((only, dt))
            why["only one volume carries this meeting"] += 1
            continue
        def rank(i):
            rows = cand[i]
            res = sum(1 for r in rows if r.get("r"))
            return (0 if "Draft" in titles.get(i, "") else 1,   # 1. final > draft
                    len(rows),                                   # 2. fuller reading
                    res / max(1, len(rows)))                     # 3. better OCR
        best = max(cand, key=lambda i: (rank(i), i))
        tied = [i for i in cand if rank(i) == rank(best)]
        if len(tied) > 1:
            # equivalent readings may be resolved by identifier; materially
            # different ones may not be
            equiv = all(_equivalent(cand[tied[0]], cand[i]) for i in tied[1:])
            if equiv:
                best = min(tied)
                why["equivalent re-scans, resolved by identifier"] += 1
            else:
                undecided.append((dt, sorted(tied),
                                  [len(cand[i]) for i in sorted(tied)],
                                  round(_match_rate(cand[tied[0]], cand[tied[1]]), 2)))
                best = min(tied)
                why["UNDECIDED — materially different readings"] += 1
        else:
            top = rank(best)
            second = max((rank(i) for i in cand if i != best), default=None)
            if second and top[0] != second[0]:
                why["final chosen over draft"] += 1
            elif second and top[1] != second[1]:
                why["fuller reading of the meeting"] += 1
            else:
                why["better OCR on the meeting"] += 1
        keep.add((best, dt))
        if len(cand) > 1 and len(picks) < 12:
            picks.append((dt, best, {i: len(cand[i]) for i in cand}))

    winners = {v for v, _ in keep}
    losers = [v for v in vols if v not in winners]
    if verbose:
        n_dates = len(by_date)
        multi = sum(1 for d in by_date if len(by_date[d]) > 1)
        print(f"  {len(vols)} modern Board volumes, {n_dates:,} meeting dates")
        print(f"  dates carried by more than one volume: {multi:,} "
              f"({100 * multi / max(1, n_dates):.1f}%)")
        print("  why each meeting's scan was chosen:")
        for k, n in why.most_common():
            print(f"    {n:>5}  {k}")
        print(f"  volumes that won no meeting at all: {len(losers)}")
        print("\n  worked examples:")
        for dt, best, all_ in picks:
            others = ", ".join(f"{i}({n})" for i, n in sorted(all_.items()) if i != best)
            print(f"    {dt}  KEEP {best} ({all_[best]} items)")
            print(f"              drop {others}")
        if undecided:
            print(f"\n  *** {len(undecided)} UNDECIDED meetings — readings differ and "
                  f"no criterion separates them ***")
            print("    (match rate = share of one reading's items that have a "
                  "near-twin in the other; 1.00 would be a clean re-scan)")
            for dt, ids, ns, mr in undecided[:24]:
                print(f"    {dt}  match {mr:.2f}  {list(zip(ids, ns))}")
    if len(undecided) > UNDECIDED_MAX:
        sys.exit(f"REFUSED: {len(undecided)} meetings could not be decided "
                 f"(limit {UNDECIDED_MAX}). Nothing merged.")
    return keep, set(losers), undated, winners


# ---------------------------------------------------------------- merge
def do_merge() -> None:
    bc = ANIM / "blocks" / "cache" / "items.jsonl"
    old_keys, old_n = set(), 0
    for ln in open(bc):
        d = json.loads(ln)
        old_keys.add((d["v"], d["i"]))
        old_n += 1
    have = {v for v, _ in old_keys}
    cls = classify()
    add = [k for k, v in cls.items() if v["body"] == "board" and k not in have]
    print(f"  index has {old_n:,} rows / {len(have)} volumes")
    print(f"  adding {len(add)} modern Board volumes")
    # THE JOURNAL IS AUTHORITATIVE FOR ITS OWN YEARS.
    #
    # Several "Minutes" volumes are bound 1998-99 and so carry 1998 meetings the
    # Journal volumes ALREADY carry. Merging both copies does not add a decision;
    # it adds a second reading of the same decision, and build_index's
    # near-duplicate pass then has to choose between them. Measured: it chose the
    # new reading and dropped the Journal's on 45 blocks in 1998 alone — the old
    # map quietly losing rows to pay for the new one.
    #
    # So a row from a modern volume is refused when its own meeting date falls in
    # a year the Journal covers. Dated rows are judged on their date; an UNDATED
    # row is judged on its volume's coverage, and refused when that volume reaches
    # back before 1999, because there is then no evidence it belongs to the new
    # half. 245 dated rows and the undated rows of the straddling volumes.
    cov = {}
    for ln in open(SEED):
        if ln.startswith("#") or ln.startswith("year_from"):
            continue
        q = ln.rstrip("\n").split("\t")
        if len(q) >= 3:
            cov[q[2]] = (int(q[0]), int(q[1]))
    # GATE 5 — one scan per meeting. See choose_scans().
    keep_pairs, losers, _und, winners = choose_scans(verbose=False)
    print(f"  gate 5: {len(keep_pairs):,} (volume, meeting) pairs kept; "
          f"{len(losers)} volumes won no meeting and contribute nothing")

    rows, keys = [], set()
    refused = collections.Counter()
    for ident in sorted(add):
        y0 = cov.get(ident, (FROM_YEAR, FROM_YEAR))[0]
        for ln in open(OUTD / f"{ident}.jsonl"):
            d = json.loads(ln)
            dt = d.get("dt")
            if dt:
                yy = int(str(dt)[:4])
                if yy < FROM_YEAR:
                    refused[f"dated {yy}, a year the Journal covers"] += 1
                    continue
                if (ident, str(dt)) not in keep_pairs:
                    refused["another scan of this same meeting was kept"] += 1
                    continue
            elif y0 < FROM_YEAR:
                refused["undated, from a volume that straddles 1998/99"] += 1
                continue
            elif ident not in winners:
                # an undated row cannot be assigned to a meeting, so it rides on
                # its volume: kept only if that volume is the chosen scan for at
                # least one meeting, dropped when the volume is redundant whole
                refused["undated, from a volume no meeting chose"] += 1
                continue
            k = (d["v"], d["i"])
            if k in old_keys or k in keys:
                sys.exit(f"REFUSED: key collision {k}")
            keys.add(k)
            rows.append(ln.rstrip("\n"))
    print(f"  key collisions: 0   new rows {len(rows):,}")
    if refused:
        print(f"  refused {sum(refused.values()):,} rows so the Journal keeps its own years:")
        for k2, n2 in refused.most_common():
            print(f"      {n2:>5}  {k2}")
    with open(bc, "a") as f:
        for ln in rows:
            f.write(ln + "\n")
    n = sum(1 for _ in open(bc))
    print(f"  items.jsonl -> {n:,} rows (+{n - old_n:,})")
    assert n == old_n + len(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--assemble", action="store_true")
    ap.add_argument("--leafmap", action="store_true")
    ap.add_argument("--merge", action="store_true")
    ap.add_argument("--scans", action="store_true",
                    help="report which scan wins each meeting, merge nothing")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if not (a.plan or a.sweep or a.assemble or a.leafmap or a.merge or a.scans):
        ap.error("one of --plan / --sweep / --assemble / --leafmap / --merge / --scans")
    if a.plan:
        do_plan()
    if a.sweep:
        do_sweep(a.force)
    if a.assemble:
        do_assemble()
    if a.leafmap:
        do_leafmap()
    if a.scans:
        choose_scans(verbose=True)
    if a.merge:
        do_merge()


if __name__ == "__main__":
    main()
