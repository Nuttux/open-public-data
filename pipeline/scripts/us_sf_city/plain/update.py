#!/usr/bin/env python3
"""BRING THE CORPUS FORWARD WITHOUT DISTURBING WHAT IS ALREADY SCORED.

    python3 update.py --check            what the Board has published since the corpus ends
    python3 update.py --fetch            download those minute PDFs into the cache
    python3 update.py --stamp            re-record items_merged.sha256 after an append

── WHAT IS SAFE HERE, MEASURED RATHER THAN ASSUMED ─────────────────────────
The standing worry was that ids are positions in `items_merged.jsonl`, so
rebuilding or reordering it would silently repoint every written line at the
wrong record. That is not what happens. `harness.load_records` builds an id as

    f"{o['v']}|{o['i']}"

from fields the record CARRIES. Shuffling the whole file and re-deriving the id
set returns the identical 124,284 ids, and all 99,278 store ids resolve against
it. So order is not load-bearing and appending is safe.

What IS load-bearing is that `v` and `i` keep meaning the same thing. A rebuild
that renumbered `i` within an existing volume would repoint that volume's lines
while every id still looked valid — which is why the checksum in harness exists
and why this script refuses to touch an existing volume.

── WHAT THE SOURCE ACTUALLY LOOKS LIKE, PROBED 2026-09-02 ──────────────────
The Clerk posts minutes about TWELVE WEEKS after the meeting. Measured, not
assumed: `bag041426_minutes.pdf` covers the 14 April meeting and its
last-modified header reads 8 July 2026. So a corpus that ends in mid-April is
not behind — it is as current as the Board has published.

After that the trail goes cold and I could not explain it from outside:

    sfbos.org           lists nothing newer than the 14 April minutes and a
                        21 April agenda
    Legistar events     returns a server-side configuration error
                        ("'Agenda Draft Status' ... is not setup in settings")
    Legistar matters    returns nothing newer than 2020, mostly 2018

Three readings fit — a publication pause, a change of URL shape, or their site
being partly broken — and no remote probe separates them. That is why the check
below reports "nothing answered" instead of "you are up to date". Do not let a
silent probe be read as a current corpus.

── WHY THIS ONLY GOES AS FAR AS FETCHING ───────────────────────────────────
Turning a PDF into records is `sweep_sfbos_all.py`, which walks 390 cached PDFs
through the extractor and has a byte-for-byte parity gate against the published
map. Re-running it is that script's job, not this one's; duplicating its walk is
exactly the drift its own docstring was written to prevent. This script finds
what is missing, fetches it, and hands over.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos")
ITEMS = DATA / "items_merged.jsonl"
STAMP = DATA / "items_merged.sha256"
CACHE = HERE.parent / "cache_sfbos" / "minutes"
BASE = "https://sfbos.org/sites/default/files"
UA = "Mozilla/5.0 (compatible; qipu-open-data/1.0)"


def corpus_end() -> tuple[str, int]:
    """The last real meeting date, and how many records carry an unusable one."""
    last, bad, n = "", 0, 0
    for line in ITEMS.open():
        n += 1
        d = json.loads(line)
        s = (d.get("dt") or "")[:10]
        # the OCR yields years like 3909; anything outside the Board's own
        # lifetime is a scanning artefact, not a date
        if len(s) == 10 and s[:4].isdigit() and 1850 <= int(s[:4]) <= dt.date.today().year:
            last = max(last, s)
        else:
            bad += 1
    return last, bad, n


def tuesdays(after: str, until: dt.date) -> list[dt.date]:
    d = dt.date.fromisoformat(after) + dt.timedelta(days=1)
    d += dt.timedelta(days=(1 - d.weekday()) % 7)      # next Tuesday
    out = []
    while d <= until:
        out.append(d)
        d += dt.timedelta(days=7)
    return out


def _answers(url: str) -> bool:
    try:
        r = subprocess.run(
            ["curl", "-sIL", "-o", "/dev/null", "-w", "%{http_code} %{content_type}",
             "-A", UA, "--max-time", "20", url],
            capture_output=True, text=True, timeout=40)
    except subprocess.TimeoutExpired:
        return False
    code, _, ctype = r.stdout.strip().partition(" ")
    return code == "200" and "pdf" in ctype.lower()


def probe(day: dt.date) -> tuple[str, str | None]:
    """Three outcomes, never two.

    A missing minutes PDF means one of three different things, and collapsing
    them would make the corpus look current when it is not:

        "minutes"   published, and we can take it
        "pending"   the Board met (its agenda is up) and has not posted minutes
        "silent"    neither answers — no meeting that day, OR the file naming
                    changed. This probe cannot tell those apart and must not
                    pretend to.
    """
    m = f"{BASE}/bag{day:%m%d%y}_minutes.pdf"
    if _answers(m):
        return "minutes", m
    return ("pending", None) if _answers(f"{BASE}/bag{day:%m%d%y}_agenda.pdf") else ("silent", None)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--stamp", action="store_true")
    ap.add_argument("--weeks", type=int, default=0,
                    help="probe only this many weeks past the corpus end")
    a = ap.parse_args()

    if a.stamp:
        h = hashlib.sha256(); n = 0
        with ITEMS.open("rb") as fh:
            for c in iter(lambda: fh.read(1 << 20), b""):
                h.update(c); n += c.count(b"\n")
        STAMP.write_text(f"{h.hexdigest()}\n{n}\n")
        print(f"stamped {n:,} lines  {h.hexdigest()}")
        return

    last, bad, n = corpus_end()
    today = dt.date.today()
    print(f"corpus        {n:,} records, ends {last}")
    print(f"              {bad:,} carry a date the scan mangled and are dated by volume instead")
    behind = (today - dt.date.fromisoformat(last)).days
    print(f"behind by     {behind} days")

    if not (a.check or a.fetch):
        return

    days = tuesdays(last, today)
    if a.weeks:
        days = days[:a.weeks]
    print(f"\nprobing {len(days)} Tuesdays for published minutes...")
    found, pending, silent = [], [], []
    for d in days:
        kind, u = probe(d)
        if kind == "minutes":
            found.append((d, u)); print(f"  {d}  minutes published")
        elif kind == "pending":
            pending.append(d); print(f"  {d}  met, minutes not yet posted")
        else:
            silent.append(d)
    if pending:
        print(f"\n{len(pending)} meetings held with minutes still unposted — nothing to fetch yet.")
    if silent:
        print(f"\n{len(silent)} Tuesdays answered nothing at all"
              f" ({silent[0]} to {silent[-1]}).")
        print("  That is EITHER no meeting OR a change in the Board's file naming,")
        print("  and this probe cannot tell them apart. Before concluding the corpus")
        print("  is current, open one of those dates on sfbos.org by hand.")
    if not found:
        return

    print(f"\n{len(found)} meetings the corpus does not have.")
    if not a.fetch:
        print("(--fetch to download them into the cache)")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    got = 0
    for d, u in found:
        f = CACHE / f"bag{d:%m%d%y}_minutes.pdf"
        if f.exists():
            continue
        subprocess.run(["curl", "-sL", "-o", str(f), "-A", UA, "--max-time", "120", u],
                       check=False)
        if f.exists() and f.stat().st_size > 1000:
            got += 1
        else:
            f.unlink(missing_ok=True)
    print(f"fetched {got} into {CACHE}")
    print("\nNext: sweep them with sweep_sfbos_all.py, which owns the extraction and")
    print("its parity gate. Then --stamp, then prep.py to queue the new records.")


main()
