# -*- coding: utf-8 -*-
"""HOW INTERESTING A DECISION IS, AND WHICH PRINTING OF IT TO SHOW.

    python3 pipeline/scripts/us_sf_city/plain/score.py            # write scores
    python3 pipeline/scripts/us_sf_city/plain/score.py --sample    # look first
    python3 pipeline/scripts/us_sf_city/plain/score.py --only-new  # incremental

── WHY A SCORE AT ALL ──────────────────────────────────────────────────────
99,000 decisions is not a list anybody reads. A year panel shows perhaps
twenty, and which twenty decides whether the page is the city's memory or a
filing cabinet. Sorting by date puts the 400th identical garage permit above
the day the Board bought the McDonald's site on Stanyan Street for housing.

── THE SHAPE OF THE SCORE ──────────────────────────────────────────────────
Consequence is the spine, money and rarity are multipliers, and the
procedural floor is a penalty:

    score = consequence × (1 + money) × rarity − penalty

CONSEQUENCE, not money, leads. A $60M bond proposal that died in committee
changed nothing; a $15.5M purchase that completed changed a corner of the
city. The record says which, in its own verbs, and the written line carries
them because the spec required it to.

MONEY IS A BONUS, NEVER A MULTIPLIER BY ZERO. Only 17% of lines name a sum.
Making money a plain multiplier would zero the other 83% — every street
closed, every place named, every eviction stayed. So it ENTERS as `1 + f`.

RARITY IS ABOUT THE SENTENCE'S SHAPE, not its words. "Subdivision map
approved for 265 Dorland Street" and "…for 3520 Balboa Street" are different
records and the same event, 500 times over. Strip the numbers and the proper
nouns and both become "subdivision map approved for" — a template. A template
printed 500 times is routine; one printed twice is not. This is the only part
of the score that depends on the rest of the corpus, and it is why the score
is stored rather than computed at read time.

PENALTY. A line that says the page carries no subject is the floor: it is
honest, it belongs in the record, and it should never outrank an act.

── WHY THE SCORE IS STORED, AND VERSIONED ──────────────────────────────────
The Board keeps meeting. New minutes arrive and must be scored WITHOUT
rescoring the 99,000 already done — otherwise every update is a full rebuild
and nobody runs it.

Three of the four terms are pure functions of one record. The fourth,
rarity, needs template counts over the corpus. So the counts are FROZEN into
`score_templates.json` when a full pass runs, and `--only-new` reads them
instead of recomputing. A new record is scored against the corpus as it
stood, which is right: a template's rarity is a fact about the Board's
history, not about this week.

`SCORER_VERSION` is stored on every row. Change the formula, bump it, and
only rows at an older version are recomputed. Nothing silently drifts.
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
sys.path.insert(0, "/tmp")
sys.path.insert(0, str(HERE))

DATA = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos")
STORE = DATA / "plain_lines.jsonl"
OUT = DATA / "plain_lines_scored.jsonl"
TEMPLATES = DATA / "score_templates.json"

SCORER_VERSION = 2

# ── THE DIALS ──────────────────────────────────────────────────────────────
# Chosen by the user from three weightings shown side by side as ranked lists,
# not in the abstract. Money-led: what the city actually spent, largest first.
#
# The trade was stated and accepted — the head of the ranking is dominated by
# bonds, borrowings and settlements, and reads much the same in every decade.
# The city's texture (a street closed for a school celebration, lambs sold
# from Golden Gate Park) sits far below a $40M borrowing. That is the
# accountability ordering rather than the readable one.
#
# These are the only numbers to change if that judgement changes; bump
# SCORER_VERSION with them and the next run recomputes the stale rows.
W_MONEY = 2.0
W_PLACE = 0.15
W_NOVELTY = 0.2

# ── WHAT THE BOARD'S VERBS MEAN ────────────────────────────────────────────
# Taken from the written lines, not the records: the spec required every line
# to carry the stage, and a line is 6-11 words so the verb is not buried.
DONE = re.compile(
    r"\b(adopted|passed|approved|bought|purchased|granted|allowed|opened|"
    r"closed|named|renamed|dedicated|accepted|paid|settled|vacated|widened|"
    r"transferred|awarded|banned|barred|repealed|carried|sold|leased|"
    r"waived|cancelled|confirmed|sustained|reversed|honoured|honored|wins|"
    r"gives|takes over|ordered)\b", re.I)
PROPOSED = re.compile(
    r"\b(proposed|sought|urged|asked|requested|recommended|sent to committee|"
    r"put off|tabled|continued|referred|introduced|to be|put before|"
    r"put up for|heard and filed|questioned|considered)\b", re.I)
NO_SUBJECT = re.compile(r"\bno subject\b|\bsubject (?:is )?not (?:named|stated|given)\b"
                        r"|\bno business on this page\b", re.I)

MONEY = re.compile(r"\$\s?([\d,]+(?:\.\d+)?)\s?([MK])?\b")
# a named place: a street, a numbered address, a named civic thing
PLACED = re.compile(
    r"\b(street|avenue|boulevard|road|lane|alley|place|terrace|way|drive|"
    r"park|square|plaza|hill|beach|pier|wharf|island|creek|valley|heights|"
    r"school|hospital|library|station|yard|reservoir|tunnel|bridge)\b", re.I)

# ── TEMPLATING: THE SENTENCE WITH ITS PARTICULARS REMOVED ──────────────────
# Numbers, sums, ordinals and capitalised runs are what make one permit
# different from the next. What is left is the ACT, and the act is what
# repeats.
CAPRUN = re.compile(r"\b[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*")
NUM = re.compile(r"[\d,]+(?:\.\d+)?[MK]?")
ORD = re.compile(r"\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|"
                 r"ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|"
                 r"fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|"
                 r"twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|"
                 r"hundred|\w+th|\w+nd|\w+rd|\w+st)\b", re.I)


def template(line: str) -> str:
    s = CAPRUN.sub(" ", " " + line)
    s = NUM.sub(" ", s)
    s = ORD.sub(" ", s)
    s = re.sub(r"[^a-z ]", " ", s.lower())
    words = [w for w in s.split() if len(w) > 2]
    # FOUR WORDS, NOT EIGHT. At eight the template kept enough of the sentence
    # that almost every line was unique — 44,593 templates over 99,278 rows —
    # so rarity read 1.0 nearly everywhere and stopped discriminating. The act
    # is in the first few words; the particulars follow.
    return " ".join(words[:4])


def money_of(line: str) -> float:
    best = 0.0
    for m in MONEY.finditer(line):
        v = float(m.group(1).replace(",", ""))
        if m.group(2) == "M":
            v *= 1e6
        elif m.group(2) == "K":
            v *= 1e3
        best = max(best, v)
    return best


# ── HOW UNUSUAL THE SUBJECT MATTER IS ──────────────────────────────────────
# `rarity` only ever punishes: a template printed 500 times scores 0.35, a
# template printed once scores 1.0 and gets no advantage over the merely
# ordinary. So the head of the ranking was decided by the one term with real
# upside — money — and the top fifteen were fifteen bond issues.
#
# Novelty is the term with upside. It is the average inverse document
# frequency of a line's content words: "gray mare", "airship", "ostrich" are
# rare in a corpus of 99,000 municipal sentences; "street", "approved",
# "lease" are not. It is what makes the Board auctioning a gray mare at the
# Isolation Hospital reachable from the top of a list that a $46M transit
# grant would otherwise own.
IDF: dict = {}


def build_idf(lines) -> None:
    df = collections.Counter()
    for ln in lines:
        bare = re.sub(r"(?<!^)\b[A-Z][\w'’-]*", " ", ln)
        df.update(set(re.findall(r"[a-z][a-z'-]{3,}", bare.lower())))
    n = max(1, len(lines))
    IDF.clear()
    IDF.update({w: math.log(n / c) for w, c in df.items()})


def novelty(line: str) -> float:
    # NAMES ARE NOT SUBJECTS. Every proper noun in a corpus of 99,000 lines is
    # rare — Guaragna, Lerche, Ghirando appear once each — so scoring on raw
    # rarity ranked a routine land purchase above a policy because of whose
    # land it was. Novelty is about what HAPPENED, so the capitalised words are
    # dropped and only ordinary vocabulary counts: balconies, boiler, garden,
    # ostrich, airship.
    bare = re.sub(r"(?<!^)\b[A-Z][\w'’-]*", " ", line)
    ws = [w for w in set(re.findall(r"[a-z][a-z'-]{3,}", bare.lower())) if w in IDF]
    if not ws:
        return 0.0
    # the three rarest words carry it — a whole-sentence average is dragged
    # back to the mean by "street", "approved" and "the city"
    top = sorted((IDF[w] for w in ws), reverse=True)[:3]
    # the divisor is wide on purpose. At /6 a third of the corpus saturated at
    # 1.0 and the top fifteen were a fifteen-way tie with no order inside it.
    return max(0.0, min(1.0, (sum(top) / len(top) - 3.5) / 9.0))


def score_one(line: str, tpl_count: int, corpus_n: int) -> dict:
    """Every term, kept separately so a rank can be explained."""
    if NO_SUBJECT.search(line):
        return {"s": 0.0, "consequence": 0.0, "money": 0.0, "rarity": 0.0,
                "why": "no subject on the page"}

    done, prop = bool(DONE.search(line)), bool(PROPOSED.search(line))
    # a line saying both ("bought … sent to committee") is a proposal: the
    # completed verb belongs to what is being PROPOSED, not to what happened
    consequence = 0.45 if prop else (1.0 if done else 0.7)

    v = money_of(line)
    # MONEY IS WORTH AT MOST HALF AGAIN, and it starts counting above the
    # median sum. At `log10(v)/9` — worth up to double — the top of the corpus
    # was fifteen bond issues in a row and nothing else: no street renamed, no
    # building bought, no policy. That is the ranking the money option would
    # have given, and it is not the one chosen. $10,000 (the median sum named)
    # scores 0; $275M, the largest, scores 0.44.
    money = 0.0 if v <= 0 else max(0.0, min(0.5, (math.log10(v) - 4.0) / 10.0))

    # a template printed once in 99,000 is 1.0; one printed 500 times is ~0.35
    rarity = 1.0 / (1.0 + math.log10(max(1, tpl_count)))

    # WHETHER IT LANDS SOMEWHERE. This map is made of ground, and an act tied
    # to a named street or building is one a reader can stand in front of.
    place = W_PLACE if PLACED.search(line) else 0.0
    nov = novelty(line)

    s = consequence * (1.0 + W_MONEY * money + place + W_NOVELTY * nov) * rarity
    why = ("completed" if consequence == 1.0
           else "proposal" if consequence == 0.45 else "stage unclear")
    if v:
        why += f", ${v:,.0f}"
    if tpl_count > 20:
        why += f", one of {tpl_count:,} like it"
    if place:
        why += ", at a named place"
    if nov > 0.45:
        why += ", unusual subject"
    return {"s": round(s, 4), "consequence": consequence, "place": place,
            "money": round(money, 3), "rarity": round(rarity, 3),
            "novelty": round(nov, 3), "why": why}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--only-new", action="store_true",
                    help="score rows with no score or an older SCORER_VERSION, "
                         "reusing the frozen template counts")
    args = ap.parse_args()

    store = [json.loads(l) for l in STORE.open()]
    build_idf([r["line"] for r in store])

    if args.only_new and TEMPLATES.exists():
        counts = collections.Counter(json.loads(TEMPLATES.read_text())["counts"])
        corpus_n = json.loads(TEMPLATES.read_text())["n"]
        print(f"reusing frozen template counts from {TEMPLATES.name} "
              f"({len(counts):,} templates over {corpus_n:,} rows)")
    else:
        counts = collections.Counter(template(r["line"]) for r in store)
        corpus_n = len(store)
        TEMPLATES.write_text(json.dumps(
            {"note": "template -> how many written lines share it. Frozen so a "
                     "later batch can be scored without rescoring the corpus.",
             "scorer_version": SCORER_VERSION, "n": corpus_n,
             "counts": dict(counts)}) + "\n")
        print(f"froze {len(counts):,} templates over {corpus_n:,} rows")

    scored = []
    for r in store:
        t = template(r["line"])
        sc = score_one(r["line"], counts.get(t, 1), corpus_n)
        scored.append({**r, **sc, "tpl": t, "sv": SCORER_VERSION})

    if args.sample:
        scored.sort(key=lambda r: -r["s"])
        print("\n" + "=" * 72 + "\nTOP 15\n" + "=" * 72)
        for r in scored[:15]:
            print(f"  {r['s']:.2f}  {r['y']}  {r['line']}\n"
                  f"        ({r['why']})")
        mid = len(scored) // 2
        print("\n" + "=" * 72 + "\nMIDDLE 10\n" + "=" * 72)
        for r in scored[mid:mid + 10]:
            print(f"  {r['s']:.2f}  {r['y']}  {r['line']}\n        ({r['why']})")
        print("\n" + "=" * 72 + "\nBOTTOM 8\n" + "=" * 72)
        for r in scored[-8:]:
            print(f"  {r['s']:.2f}  {r['y']}  {r['line']}\n        ({r['why']})")
        return

    with OUT.open("w") as fh:
        for r in scored:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    q = sorted(r["s"] for r in scored)
    print(f"scored {len(scored):,} rows -> {OUT.name}")
    print(f"  median {q[len(q)//2]:.3f}  90th {q[int(len(q)*.9)]:.3f}  max {q[-1]:.3f}")


if __name__ == "__main__":
    main()
