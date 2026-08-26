"""The Clerk's own half of the record: sfbos.org, July 2016 -> today.

The scanned series (archive.org, `build_minutes_manifest.py`) runs 1906 to
April-May 2016. The Clerk publishes every Board meeting as a PDF under a
date-stamped name, and the first one is 2016-07-12. The two abut with a seam of
about six weeks, and together they are the whole record.

    https://sfbos.org/sites/default/files/bag<MMDDYY>_minutes.pdf
    https://sfbos.org/sites/default/files/bag<MMDDYY>_agenda.pdf

WHY BOTH FILES ARE PROBED, AND WHY THAT IS THE POINT
-----------------------------------------------------
An agenda is published when a meeting is CALLED. Minutes are published when it
has been HELD and written up. So probing both, on every weekday, turns a vague
question — "are minutes missing?" — into three separate and answerable ones:

    agenda + minutes   the meeting happened and we have its record
    agenda, NO minutes a meeting was called and its minutes are not published
                       ** this is the real gap, and it is the interesting list **
    neither            no meeting that day

Every weekday is probed, not every Tuesday. The Board's regular meeting is
Tuesday, but specials and continued meetings land on other days, and a Tuesday-
only probe reports those as absent when they were never expected. A sample is
not a count.

Usage:
    python3 fetch_sfbos_minutes.py --audit     probe, write the calendar (network)
    python3 fetch_sfbos_minutes.py --fetch     download the minutes PDFs
    python3 fetch_sfbos_minutes.py --report    the completeness table
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
CACHE = HERE / "cache_sfbos"
PDFS = CACHE / "pdf"
CAL = CACHE / "calendar.json"

BASE = "https://sfbos.org/sites/default/files"
UA = "qipu-sf-city/1.0 (open data pipeline; contact via qipu.org)"
START = dt.date(2016, 6, 1)      # a month before the first known publication
WORKERS = 8


def _head(url: str) -> tuple[int, str]:
    r = subprocess.run(
        ["curl", "-sIL", "-o", "/dev/null", "-w", "%{http_code} %{content_type}",
         "-A", UA, "--max-time", "25", url],
        capture_output=True, text=True).stdout.strip().split(None, 1)
    return (int(r[0]) if r and r[0].isdigit() else 0, r[1] if len(r) > 1 else "")


def _is_pdf(url: str) -> bool:
    code, ctype = _head(url)
    return code == 200 and "pdf" in ctype.lower()


def weekdays(a: dt.date, b: dt.date):
    d = a
    while d <= b:
        if d.weekday() < 5:
            yield d
        d += dt.timedelta(days=1)


def do_audit(refresh: bool) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    cal: dict[str, dict] = {}
    if CAL.exists() and not refresh:
        cal = json.loads(CAL.read_text())
    days = [d for d in weekdays(START, dt.date.today())
            if d.isoformat() not in cal]
    print(f"  probing {len(days)} weekdays "
          f"({len(cal)} already in the calendar)")

    def probe(d: dt.date):
        s = d.strftime("%m%d%y")
        return d.isoformat(), {
            "minutes": _is_pdf(f"{BASE}/bag{s}_minutes.pdf"),
            "agenda": _is_pdf(f"{BASE}/bag{s}_agenda.pdf"),
            "stem": f"bag{s}",
        }

    t0 = time.time()
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for i, (k, v) in enumerate(ex.map(probe, days), 1):
            cal[k] = v
            if i % 200 == 0:
                print(f"    … {i}/{len(days)}  {time.time() - t0:.0f}s", flush=True)
    CAL.write_text(json.dumps(dict(sorted(cal.items())), indent=1))
    print(f"  calendar: {len(cal)} weekdays -> {CAL.relative_to(REPO)}")


def do_report() -> None:
    cal = json.loads(CAL.read_text())
    per: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    gaps = []
    for k, v in sorted(cal.items()):
        y = int(k[:4])
        if v["minutes"] and v["agenda"]:
            per[y]["both"] += 1
        elif v["minutes"]:
            per[y]["minutes_only"] += 1
        elif v["agenda"]:
            per[y]["agenda_no_minutes"] += 1
            gaps.append(k)
        else:
            per[y]["neither"] += 1
    print(f"\n  {'year':>5} {'meetings':>9} {'minutes':>8} {'AGENDA, NO MINUTES':>20}")
    tm = tg = 0
    for y in sorted(per):
        c = per[y]
        meet = c["both"] + c["minutes_only"] + c["agenda_no_minutes"]
        got = c["both"] + c["minutes_only"]
        tm += got
        tg += c["agenda_no_minutes"]
        flag = "  <<<" if c["agenda_no_minutes"] else ""
        print(f"  {y:>5} {meet:>9} {got:>8} {c['agenda_no_minutes']:>20}{flag}")
    print(f"  {'TOTAL':>5} {'':>9} {tm:>8} {tg:>20}")
    if gaps:
        print(f"\n  the {len(gaps)} days with an agenda and no published minutes:")
        for g in gaps:
            print(f"    {g}")
    (CACHE / "gaps.json").write_text(json.dumps(gaps, indent=1))


def do_fetch() -> None:
    cal = json.loads(CAL.read_text())
    PDFS.mkdir(parents=True, exist_ok=True)
    todo = [(k, v["stem"]) for k, v in sorted(cal.items()) if v["minutes"]]
    print(f"  {len(todo)} meetings with published minutes")

    def one(t):
        k, stem = t
        f = PDFS / f"{stem}_minutes.pdf"
        if f.exists() and f.stat().st_size > 5000:
            return k, "cached", f.stat().st_size
        r = subprocess.run(
            ["curl", "-sL", "-o", str(f), "-A", UA, "--max-time", "120",
             f"{BASE}/{stem}_minutes.pdf"], capture_output=True)
        if not f.exists() or f.stat().st_size < 5000 or f.read_bytes()[:4] != b"%PDF":
            f.unlink(missing_ok=True)
            return k, "FAIL", 0
        return k, "ok", f.stat().st_size
    n_ok = n_c = n_f = 0
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for i, (k, st, sz) in enumerate(ex.map(one, todo), 1):
            if st == "ok":
                n_ok += 1
            elif st == "cached":
                n_c += 1
            else:
                n_f += 1
                print(f"    FAIL {k}")
            if i % 100 == 0:
                print(f"    … {i}/{len(todo)}", flush=True)
    print(f"  fetched {n_ok}, cached {n_c}, failed {n_f}")


# ---------------------------------------------------------------- extract
# The rows are the SAME shape blocks/cache/items.jsonl carries, produced by the
# SAME extractor, so this stream merges into that index (§21) carrying its own
# honest citation (`src`, `url`, `page`).
#
# THE WALK ITSELF IS NOT HERE ANY MORE. `_sfbos_sweep.sweep_meeting()` owns it,
# and `sweep_sfbos_all.py` calls the same function, so the map's corpus and the
# full database cannot drift apart the way two hand-kept copies of a page walk
# can. What is left here is the projection: the twelve canonical fields, and
# only the rows that resolved to a street, because that is what the map reads.
#
# Two rules the shared walk applies and this stream inherits, both of them
# corrections to what was published before — see `_sfbos_sweep`'s docstring for
# the measurements:
#   * an item ends where the NEXT file's header begins, so a street printed in
#     that header is no longer read as this item's;
#   * a legislative file the splitter's vocabulary cannot see — a Hearing, most
#     of them — becomes an item delimited by the two headers the Clerk printed
#     around it.
def do_extract() -> None:
    sys.path.insert(0, str(HERE))
    import _sfbos_sweep as S

    gaz = S.gz.build()
    keys = list(gaz)
    print(f"  gazetteer: {len(gaz)} real SF streets")
    cal = json.loads(CAL.read_text())
    out = CACHE / "items.jsonl"
    counters: dict = {}
    n_pdf = n_item = n_loc = 0
    with open(out, "w") as w:
        for day, v in sorted(cal.items()):
            if not v["minutes"]:
                continue
            f = PDFS / f"{v['stem']}_minutes.pdf"
            if not f.exists():
                continue
            n_pdf += 1
            rows = S.sweep_meeting(v["stem"], day, f, gaz, keys, counters=counters)
            n_item += len(rows)
            for r in rows:
                if not r["r"]:
                    continue
                n_loc += 1
                w.write(json.dumps({k: r[k] for k in S.CANON}) + "\n")
    print(f"  {n_pdf} minute PDFs read "
          f"({counters.get('pdf with no text layer', 0)} had no text layer)")
    print(f"  {n_item:,} items split, {n_loc:,} carry a resolvable street "
          f"({100 * n_loc / max(1, n_item):.1f}%)")
    print(f"    of which items recovered from a file header the splitter "
          f"cannot see: {counters.get('items from a file header the splitter cannot see', 0):,}")
    print(f"    chunks trimmed at the next file's header: "
          f"{counters.get('chunk trimmed at the next file\'s header', 0):,}")
    print(f"  -> {out.relative_to(REPO)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--audit", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--extract", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    if not (a.audit or a.fetch or a.report or a.extract):
        ap.error("one of --audit / --fetch / --report / --extract")
    if a.audit:
        do_audit(a.refresh)
    if a.fetch:
        do_fetch()
    if a.report:
        do_report()
    if a.extract:
        do_extract()


if __name__ == "__main__":
    main()
