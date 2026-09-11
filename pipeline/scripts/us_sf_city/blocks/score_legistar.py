# -*- coding: utf-8 -*-
"""Score the 2026 Legistar rows the way the corpus is scored.

WHAT PRODUCED THE sfbos:leg ROWS OF pipeline/data/sf_bos/importance.jsonl.

A record gets the median score the corpus already gave the MODERN records most
like it: the same header family ("Settlement of Lawsuit", "Accept and Expend
Grant"), the same stage (proposed / passed), a similar sum, and shared words.

    python3 score_legistar.py      # leave-one-out against the corpus's own scores

WHY NOT RULES. The first version of this file scored from a rubric and
calibrated each subject against the whole 1906-2026 corpus. Checked like for
like — same kind of record, same decade — it drifted by up to 30 points in both
directions: Planning Code items 19 low, plain contracts 32 high. A 1920s street
grading is not the yardstick for a 2026 ordinance, and a per-subject quantile
map cannot see that.

MEASURED. Leave-one-out on 2,500 corpus records whose score is known: mean
error 4.67 points, median 0, bias -0.20, 81.7% within 10. On the new rows, like
for like against the corpus (family x stage x order of magnitude of money, 840
rows): mean gap +0.2, mean absolute gap 4.8. The remaining ~18% that land more
than 10 points out are real: a self-insurance surety bond fund takes 74 from a
Reparations Fund it shares a family and a stage with.

FOUR THINGS TRIED, each kept or dropped on that measurement:
  - KEPT: when three or more candidates share real words with the row, only
    those vote. A flat median let records sharing one word ("closed session on
    labor negotiations") outvote three paid-parental-leave rows.
  - KEPT: with fewer than three same-stage neighbours, the other-stage ones
    vote, converted by the corpus's own final/early ratio (median 1.22 across
    3,871 files carrying both stages). One "Reparations Fund established" at 74
    had been setting a surety-bond fund's score by itself.
  - DROPPED: anchoring on the SAME Board file's corpus score, stage-converted.
    Worse (MAE 7.1, bias +2.7) — the corpus is not consistent across the stages
    of one file.
  - DROPPED: capping any single neighbour at a third of the vote. Worse
    (MAE 4.83), though it is the fix the surety-bond fund above would want.

THE STAGE IS READ FROM THE WRITTEN LINE, as it is for the corpus. So the line
must say its stage, which is legistar_stage.py's job: a row the Clerk only sent
to committee reads "sent to committee", and a landmark finally passed reads
"made a city landmark", not "proposed as a landmark".
"""
import collections
import csv
import gzip
import json
import math
import os
import random
import re
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
ITEMS = os.path.join(REPO, "pipeline/scripts/us_sf_city/cache_sfbos/items_all.jsonl")
CORE = os.path.join(REPO, "website/public/data/us/sf/city/records/sf_bos_records.csv.gz")
RATIO = 1.22   # median final/early score across 3,871 corpus files with both stages

EARLY = re.compile(r"\b(proposed|proposes|to be|would|put forward|sought|seeks?|urged|urging|"
                   r"introduced|referred|sent to|sent back|continued|held over|put off|"
                   r"first reading|intention|to consider|asked|recommended|headed for)\b", re.I)
HEAR = re.compile(r"^hearing\b|\bhearing (?:called|set|held)\b", re.I)
MONEY = re.compile(r"\$\s?([\d][\d,]*)")
TOK = re.compile(r"[a-z0-9]+")
STOP = set("the a an of to for and in on at by with from as is be its it this that".split())


def family(h):
    h = re.sub(r"\s*\(.*?\)", "", (h or "").split(" - ")[0]).strip().lower()
    h = re.sub(r"\b(retroactive|mayoral|presidential|proposed|interim)\b", "", h)
    return re.sub(r"\s+", " ", h).strip()[:40]


def stage(line, h):
    if HEAR.search(line or "") or (h or "").lower().startswith("hearing"):
        return "hearing"
    return "early" if EARLY.search(line or "") else "final"


def amount(*ts):
    v = 0
    for t in ts:
        for m in MONEY.finditer(t or ""):
            try:
                v = max(v, int(m.group(1).replace(",", "")))
            except ValueError:
                pass
    return v


def toks(*ts):
    return {w for t in ts for w in TOK.findall((t or "").lower()) if w not in STOP and len(w) > 2}


def describe(rid, h, line, text, subtopic, rtype, score=None):
    """One record as the comparison sees it."""
    return {"id": rid, "fam": family(h), "sub": subtopic, "stage": stage(line, h),
            "amt": amount(h, text), "tok": toks(line, " ".join(h.split(" - ")[1:])),
            "rt": rtype, "line": line, "h": h, "s": score}


def load():
    """(corpus, new): corpus = scored modern decisions; new = the sfbos:leg rows."""
    ht = {}
    for l in open(ITEMS):
        d = json.loads(l)
        ht[f"{d['v']}|{d['i']}"] = d.get("ht") or ""
    corpus, new = [], []
    with gzip.open(CORE, "rt") as fh:
        for r in csv.DictReader(fh):
            if r["id"] not in ht:
                continue
            s = int(r["importance"]) if r["importance"].isdigit() else None
            row = describe(r["id"], ht[r["id"]], r["plain_line"], r["text"],
                           r["subtopic"], r["record_type"], s)
            if r["id"].startswith("sfbos:leg"):
                new.append(row)
            elif s is not None and r["record_type"] == "decision":
                corpus.append(row)
    return corpus, new


def index(corpus):
    by_fam, by_sub = collections.defaultdict(list), collections.defaultdict(list)
    for c in corpus:
        by_fam[c["fam"]].append(c)
        by_sub[c["sub"]].append(c)
    return by_fam, by_sub


def wmedian(pairs):
    pairs = sorted(pairs)
    tot = sum(w for _, w in pairs)
    acc = 0
    for v, w in pairs:
        acc += w
        if acc >= tot / 2:
            return v
    return pairs[-1][0]


def neighbours(row, by_fam, by_sub, skip=None, k=9):
    """The score, and what it was read off: the family, or the subject."""
    pool = [c for c in by_fam.get(row["fam"], []) if c["id"] != skip]
    basis = "family"
    if len(pool) < 12:
        pool = [c for c in by_sub.get(row["sub"], []) if c["id"] != skip]
        basis = "subject"
    if not pool:
        return None, "none"
    la = math.log10(row["amt"] + 1)

    def jac(c):
        return len(row["tok"] & c["tok"]) / (len(row["tok"] | c["tok"]) or 1)

    rel = [c for c in pool if jac(c) >= 0.15]
    if len(rel) >= 3:
        pool = rel

    def sim(c):
        return (2.0 * (c["stage"] == row["stage"]) + 1.0 * (c["sub"] == row["sub"])
                - 0.35 * abs(math.log10(c["amt"] + 1) - la) + 4.0 * jac(c))

    top = sorted(pool, key=sim, reverse=True)[:k]
    lo = min(sim(c) for c in top)
    same = [c for c in top if c["stage"] == row["stage"]]
    if len(same) >= 3 or row["stage"] == "hearing":
        return wmedian([(c["s"], 0.25 + sim(c) - lo) for c in top]), basis

    def conv(c):
        if c["stage"] == "early" and row["stage"] == "final":
            return min(100, round(c["s"] * RATIO))
        if c["stage"] == "final" and row["stage"] == "early":
            return round(c["s"] / RATIO)
        return c["s"]

    return wmedian([(conv(c), 0.25 + sim(c) - lo) for c in top]), basis + "+ratio"


if __name__ == "__main__":
    corpus, new = load()
    by_fam, by_sub = index(corpus)
    fams = {n["fam"] for n in new}
    random.seed(11)
    test = random.sample([c for c in corpus if c["fam"] in fams], 2500)
    err = []
    for c in test:
        p, _ = neighbours(c, by_fam, by_sub, skip=c["id"])
        if p is not None:
            err.append(p - c["s"])
    ae = [abs(e) for e in err]
    print(f"leave-one-out on {len(err)} modern records: MAE {statistics.mean(ae):.2f} · "
          f"median {statistics.median(ae):.0f} · bias {statistics.mean(err):+.2f} · "
          f"within 10 pts {100 * sum(1 for a in ae if a <= 10) / len(ae):.1f}%")
