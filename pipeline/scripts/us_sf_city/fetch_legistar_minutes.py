#!/usr/bin/env python3
"""The Board's record after April 2026, which is no longer on sfbos.org.

WHAT HAPPENED, AND HOW IT WAS FOUND
------------------------------------
`fetch_sfbos_minutes.py` builds every meeting's URL as

    https://sfbos.org/sites/default/files/bag<MMDDYY>_minutes.pdf

and that pattern stops working in April 2026. Probed on 2026-09-10: the
minutes of 14 April are there, the agenda of 21 April is the last file of any
kind, and every Tuesday after it 404s — while the Board's own pages, now on
sf.gov, list meetings through this week. The record did not stop; the host
moved. (This is the same class of error MINUTES.md §1 records for the archive
series, where a boundary in a FINDING AID was read as a boundary in the world.
Writing it here for the same reason.)

The Board's meetings and their documents are in Legistar, which is what sf.gov
renders from:

    https://sfgov.legistar.com/Calendar.aspx?Mode=This%20Year   the year's rows
    https://sfgov.legistar.com/View.ashx?M=M&ID=<id>&GUID=<guid> one PDF

The Legistar WebAPI would be the better door and its `events` endpoint is
misconfigured on this instance ("'Agenda Draft Status' … is not setup in
settings", HTTP 400, measured 2026-09-10), so the calendar page is read
instead. `bodies` and `matters` answer fine, in case that is ever fixed.

WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
--------------------------------------------------
It lists the FULL BOARD's meetings (committees are a different series and are
not swept), downloads each one's minutes, and runs them through
`_sfbos_sweep.sweep_meeting` — the same walk, unmodified, that produced every
row already in the index — so what comes out merges as a concatenation rather
than as a second opinion. Each row cites Legistar rather than the dead
sfbos.org path.

It stops at `items_legistar.jsonl`. Placing those items on blocks, scoring
them and rebuilding the shards is the block pipeline's job and is not done
here: this file's whole responsibility is to end the gap between what the City
publishes and what we have read.

    python3 fetch_legistar_minutes.py --list            what is published
    python3 fetch_legistar_minutes.py --fetch           download the minutes
    python3 fetch_legistar_minutes.py --extract         walk them into rows
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
CACHE = HERE / "cache_sfbos"
PDFS = CACHE / "pdf"
CAL = CACHE / "legistar.json"
HOST = "https://sfgov.legistar.com"
UA = "Mozilla/5.0 (compatible; QipuBot/1.0; +https://qipu.org)"
# The full Board only. Its committees publish their own minutes and are a
# different series; sweeping them would put the same decision on the map twice.
BODY = re.compile(r">\s*(Board of Supervisors)\s*<")
ROW = re.compile(r'<tr[^>]*class="rg(?:Alt)?Row.*?</tr>', re.S)
DATE = re.compile(r"(\d{1,2})/(\d{1,2})/(20\d\d)")
MIN = re.compile(r"View\.ashx\?M=M&amp;ID=(\d+)&amp;GUID=([A-F0-9-]+)")


def _get(url: str, out: pathlib.Path | None = None) -> bytes:
    cmd = ["curl", "-sL", "-A", UA, "--max-time", "90"]
    if out:
        cmd += ["-o", str(out)]
    r = subprocess.run(cmd + [url], capture_output=True)
    return r.stdout


def scan(year: str = "This%20Year") -> dict:
    """Every full-Board meeting the calendar lists, with its minutes link."""
    html = _get(f"{HOST}/Calendar.aspx?Mode={year}").decode("utf8", "replace")
    cal: dict[str, dict] = {}
    for m in ROW.finditer(html):
        row = m.group(0)
        if not BODY.search(row):
            continue
        d = DATE.search(row)
        if not d:
            continue
        day = f"{d.group(3)}-{int(d.group(1)):02d}-{int(d.group(2)):02d}"
        link = MIN.search(row)
        cal[day] = {
            "stem": "leg" + dt.date.fromisoformat(day).strftime("%m%d%y"),
            "minutes": bool(link),
            "url": f"{HOST}/{link.group(0).replace('&amp;', '&')}" if link else None,
        }
    return dict(sorted(cal.items()))


def do_list(since: str) -> dict:
    cal = scan()
    CACHE.mkdir(parents=True, exist_ok=True)
    CAL.write_text(json.dumps(cal, indent=1))
    new = {k: v for k, v in cal.items() if k > since}
    print(f"  {len(cal)} full-Board meetings on the calendar, "
          f"{sum(1 for v in cal.values() if v['minutes'])} with minutes")
    print(f"  after {since}: {len(new)} meetings, "
          f"{sum(1 for v in new.values() if v['minutes'])} with minutes")
    for k, v in new.items():
        print(f"    {k}  {'minutes' if v['minutes'] else 'NO MINUTES YET'}")
    return new


def do_fetch(since: str) -> None:
    cal = json.loads(CAL.read_text()) if CAL.exists() else scan()
    PDFS.mkdir(parents=True, exist_ok=True)
    todo = [(k, v) for k, v in sorted(cal.items()) if v["minutes"] and k > since]
    ok = cached = fail = 0
    for day, v in todo:
        f = PDFS / f"{v['stem']}_minutes.pdf"
        if f.exists() and f.stat().st_size > 5000:
            cached += 1
            continue
        _get(v["url"], f)
        if not f.exists() or f.stat().st_size < 5000 or f.read_bytes()[:4] != b"%PDF":
            f.unlink(missing_ok=True)
            print(f"    FAIL {day}")
            fail += 1
        else:
            ok += 1
    print(f"  fetched {ok}, cached {cached}, failed {fail} → {PDFS.relative_to(REPO)}")


def do_extract(since: str) -> None:
    sys.path.insert(0, str(HERE))
    import _sfbos_sweep as S

    gaz = S.gz.build()
    keys = list(gaz)
    cal = json.loads(CAL.read_text())
    out = CACHE / "items_legistar.jsonl"
    n_pdf = n_item = n_loc = 0
    with open(out, "w") as w:
        for day, v in sorted(cal.items()):
            if not v["minutes"] or day <= since:
                continue
            f = PDFS / f"{v['stem']}_minutes.pdf"
            if not f.exists():
                continue
            n_pdf += 1
            rows = S.sweep_meeting(v["stem"], day, f, gaz, keys,
                                   url=v["url"], src="legistar")
            n_item += len(rows)
            for d in S.map_stream(rows):
                n_loc += 1
                w.write(json.dumps(d) + "\n")
    print(f"  {n_pdf} meetings read · {n_item:,} items split · "
          f"{n_loc:,} carry a street the map can place "
          f"({100 * n_loc / max(1, n_item):.1f}%)")
    print(f"  → {out.relative_to(REPO)}")


def do_extract_all(since: str) -> None:
    """EVERY item, placement as an ATTRIBUTE — the same projection
    `sweep_sfbos_all.py` writes, because a record without a street is not a
    lesser record: it is where the citywide acts live, and it is what the
    year panel and the published row-level table are built from."""
    sys.path.insert(0, str(HERE))
    import _sfbos_sweep as S

    gaz = S.gz.build()
    keys = list(gaz)
    cal = json.loads(CAL.read_text())
    out = CACHE / "items_all_legistar.jsonl"
    n_pdf = n = 0
    with open(out, "w") as w:
        for day, v in sorted(cal.items()):
            if not v["minutes"] or day <= since:
                continue
            f = PDFS / f"{v['stem']}_minutes.pdf"
            if not f.exists():
                continue
            n_pdf += 1
            for r in S.sweep_meeting(v["stem"], day, f, gaz, keys,
                                     url=v["url"], src="legistar"):
                w.write(json.dumps(r) + "\n")
                n += 1
    print(f"  {n_pdf} meetings · {n:,} items, placed or not → {out.relative_to(REPO)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--since", default="2026-04-14",
                    help="the last day already in the index (exclusive)")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--extract", action="store_true")
    ap.add_argument("--extract-all", action="store_true",
                    help="every item, not only those naming a street")
    a = ap.parse_args()
    if a.list or not (a.fetch or a.extract):
        do_list(a.since)
    if a.fetch:
        do_fetch(a.since)
    if a.extract:
        do_extract(a.since)
    if getattr(a, "extract_all", False):
        do_extract_all(a.since)


if __name__ == "__main__":
    main()
