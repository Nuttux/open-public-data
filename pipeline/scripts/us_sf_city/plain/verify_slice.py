# -*- coding: utf-8 -*-
"""CHECK A RETURNED SLICE BEFORE IT ENTERS THE STORE.

    python3 pipeline/scripts/us_sf_city/plain/verify_slice.py out-001.jsonl [...]
    python3 pipeline/scripts/us_sf_city/plain/verify_slice.py --all

── THE THREE THINGS THAT GO WRONG, AND ONLY ONE OF THEM IS THE GATE ────────
`gate.check` answers two questions: does the line name something the record
does not (invented), and does it assert a proposal as a fact (overstates).
Both are about ONE line against ONE record, and both assume the pairing is
right.

The pairing is the third failure and it is the dangerous one. A writer that
loses its place writes line N about record N+1 while copying id N from the
input, so every id lines up, every line is fluent, every name is real — and
the corpus is off by one for the rest of the slice. That happened once, and
what found it was not the gate: it was VOCABULARY OVERLAP between the line
and its own record, read as RUNS.

── WHY RUNS AND NOT A RATE ─────────────────────────────────────────────────
Scattered low-overlap lines are normal and mostly false alarms:

  · the glossary REDUCES overlap by design — "Conditional Use Authorization"
    becomes "special permission", so a correct translation shares no words
    with the phrase it translates
  · the scans are damaged — a line saying "Kentucky" over a record that says
    "Keutucky" shares nothing, and the line is right

A writer that has lost its place, by contrast, misses CONSECUTIVELY. So the
signal is the longest run of adjacent misses, not the count of them. A
negative control on the first run: shifting a known-good slice by one record
produced 48 runs; shifting it by zero produced none.

Fuzzy matching (`_near1`) covers the scan damage — one edit away counts as a
hit — so the runs that remain are the real thing.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, "/tmp")
sys.path.insert(0, str(HERE))

import harness as H  # noqa: E402
from gate import check  # noqa: E402

assert pathlib.Path(H.__file__).parent == HERE, f"wrong harness: {H.__file__}"

WORK = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos/work")
GLOSS = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/seeds/"
                     "sf_bos_plain_english.json")

# ── THE ONE LINE THAT IS SUPPOSED TO SHARE NO WORDS WITH ITS RECORD ───────
# When a page carries only a verdict and a roll call — "Motion be TABLED. The
# motion carried by the following vote: Ayes: 11 — Fewer, Haney, …" — the
# honest line says so, and it shares no vocabulary with the record BECAUSE
# the record has none. The pairing test read three of those in a row as a
# writer losing its place. They are exempt: a line that claims no subject
# cannot be mispaired with a record, since it says nothing about one.
NO_SUBJECT = re.compile(r"\bno subject\b|\bsubject (?:is )?not (?:named|stated|given)\b",
                        re.I)

STOP = set("""a an the of to for and in on at by with from is are be been was were
that this those these it its his her their our your as or nor but so than then
have has had will would shall should may might can could must do does did not no
one two three all any each every some such other another same own only very more
most much many few first second new city county san francisco board supervisors
resolution ordinance motion file page printed number series hereby said which who
whom whose what when where""".split())


def words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9$][a-z0-9'$.,-]*", s.lower())
            if len(w.strip(".,'-$")) > 2 and w.strip(".,'-$") not in STOP}


def _near1(w: str, pool: set[str]) -> bool:
    """w, or anything one edit from it — the scans are damaged."""
    if w in pool:
        return True
    for p in pool:
        if abs(len(p) - len(w)) > 1 or not p:
            continue
        if len(p) == len(w):
            if sum(1 for a, b in zip(p, w) if a != b) <= 1:
                return True
        else:
            lo, hi = (w, p) if len(w) < len(p) else (p, w)
            i = 0
            for c in hi:
                if i < len(lo) and lo[i] == c:
                    i += 1
            if i == len(lo):
                return True
    return False


def gloss_terms() -> list[tuple[set[str], set[str]]]:
    """(jargon words, plain words) — a correct translation of one shares no
    vocabulary with the other, so both sides count as overlap."""
    if not GLOSS.exists():
        return []
    j = json.loads(GLOSS.read_text())
    out = []
    for era in (j.values() if isinstance(j, dict) else []):
        if not isinstance(era, dict):
            continue
        for k, v in era.items():
            if isinstance(v, str):
                out.append((words(k), words(v)))
    return out


def verify(path: pathlib.Path, recs: dict, gloss: list) -> dict:
    slice_path = WORK / path.name.replace("out-", "slice-")
    inp = [json.loads(l) for l in slice_path.open()] if slice_path.exists() else []
    out = [json.loads(l) for l in path.open()]
    r: dict = {"file": path.name, "n_in": len(inp), "n_out": len(out)}
    r["ids_aligned"] = [x["id"] for x in inp] == [x["id"] for x in out] if inp else None
    r["unknown_ids"] = sum(1 for x in out if x["id"] not in recs)
    r["dupes"] = len(out) - len({x["id"] for x in out})
    r["blank"] = sum(1 for x in out if not x["line"].strip())

    inv = ovr = dmg = 0
    wc = collections.Counter()
    miss: list[int] = []
    examples: list[tuple] = []
    for i, x in enumerate(out):
        rec = recs.get(x["id"])
        line = x["line"]
        wc[len(line.split())] += 1
        if not rec:
            continue
        c = check(line, rec["t"])
        if c["invented"]:
            inv += 1
            if len(examples) < 4:
                examples.append(("invented", c["invented"], line, rec["t"][:110]))
        if c["overstates"]:
            ovr += 1
            if len(examples) < 4:
                examples.append(("overstates", c["overstates"], line, rec["t"][:110]))
        if c["damaged"]:
            dmg += 1
        # ── the pairing test ────────────────────────────────────────────
        if NO_SUBJECT.search(line):
            continue
        lw, rw = words(line), words(rec["t"])
        hit = sum(1 for w in lw if _near1(w, rw))
        if not hit and lw:
            for jw, pw in gloss:                      # a glossed line counts
                if (lw & pw) and (jw & rw):
                    hit = 1
                    break
        if lw and hit == 0:
            miss.append(i)

    runs, cur = [], []
    for i in miss:
        if cur and i == cur[-1] + 1:
            cur.append(i)
        else:
            if len(cur) >= 3:
                runs.append((cur[0], len(cur)))
            cur = [i]
    if len(cur) >= 3:
        runs.append((cur[0], len(cur)))

    r.update(invented=inv, overstates=ovr, damaged=dmg,
             off_band=sum(v for k, v in wc.items() if k < 6 or k > 11),
             wc_range=(min(wc), max(wc)) if wc else (0, 0),
             board_openers=sum(1 for x in out
                               if x["line"].strip().lower().startswith("board ")),
             n_miss=len(miss), runs=runs, examples=examples)
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    paths = ([WORK / f for f in args.files] if args.files
             else sorted(WORK.glob("out-*.jsonl")))
    recs = {x["id"]: x for x in H.load_records()}
    gloss = gloss_terms()

    ok, bad = [], []
    for p in paths:
        if not p.exists():
            print(f"{p.name}: missing")
            continue
        r = verify(p, recs, gloss)
        fail = (r["n_in"] != r["n_out"] or r["ids_aligned"] is False or r["dupes"]
                or r["blank"] or r["unknown_ids"] or r["invented"] or r["overstates"]
                or r["runs"])
        flag = "FAIL" if fail else "ok  "
        print(f"{flag} {r['file']}  {r['n_out']:4}/{r['n_in']:<4} "
              f"inv {r['invented']:3} ovr {r['overstates']:3} dmg {r['damaged']:3} "
              f"words {r['wc_range'][0]}-{r['wc_range'][1]} (off {r['off_band']}) "
              f"unpaired {r['n_miss']:3} runs {len(r['runs'])}")
        if r["runs"]:
            print(f"      RUNS at {r['runs'][:6]} — a writer that lost its place "
                  f"misses consecutively")
        for e in r["examples"]:
            print(f"      ! {e[0]} {e[1]} | {e[2]}")
        (bad if fail else ok).append(r["file"])

    print(f"\n{len(ok)} clean, {len(bad)} to look at" + (f": {bad}" if bad else ""))


if __name__ == "__main__":
    main()
