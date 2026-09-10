# -*- coding: utf-8 -*-
"""Score the 2026 Legistar rows the way the corpus is scored.

WHAT PRODUCED THE 2026 ROWS OF THE FROZEN SEEDS. The 15 Legistar meetings of
2026 arrived after the corpus was classified and scored, so they needed the
same two passes the rest of the record already had. This file is that pass,
kept so the seed rows it wrote can be re-derived and argued with rather than
taken on trust.

    input   pipeline/scripts/us_sf_city/cache_sfbos/items_all_legistar.jsonl
    output  pipeline/data/sf_bos/importance.jsonl (the sfbos:leg rows)

The rule that governs it is CLASSIFY-SPEC.md's: no rule is trusted because it
fired. Every family below was checked against the distribution the corpus
already gives records whose written line reads the same way, and thirteen were
wrong on the first pass — the Police Code is not the police department, a
Planning Code amendment is zoning whatever it zones, a behested payment is not
the employees' fundraising drive.
"""

import re

# reach base by subtopic — the band headline, before money and stage
BASE = {
 "appointments": 24, "hearings-appeals": 16, "vote-or-scheduling": 6,
 "lawsuits": 18, "claims-refunds": 20, "commendations": 13,
 "state-and-national": 22, "oversight": 22, "business-districts": 30,
 "elections": 60, "bonds": 36, "assessments": 38, "budget": 40,
 "taxes-revenue": 40, "employee-fundraising": 20,
 "city-leases": 26, "city-buys-land": 48, "subdivisions": 36,
 "landmarks": 21, "zoning": 45, "redevelopment": 40,
 "code-changes": 40, "staff-and-jobs": 40,
 "health": 58, "housing-shelter": 60, "schools": 58, "police": 50,
 "fire": 50, "parks": 48, "libraries": 50, "port": 45,
 "water-supply": 50, "power-utilities": 48, "environment": 45,
 "emergencies": 50, "transit": 55, "liquor": 33, "other-permits": 33,
 "dance-halls-shows": 30, "traffic": 40, "parking": 36,
 "bicycles-walking": 40, "street-works": 38,
}

MONEY = re.compile(r"\$\s?([\d][\d,]*)(?:\.(\d+))?")

def _usd(*texts):
    best = 0
    for t in texts:
        for m in MONEY.finditer(t or ""):
            try: v = int(m.group(1).replace(",", ""))
            except ValueError: continue
            best = max(best, v)
    return best

def _bump(v):
    if v >= 100_000_000: return 18
    if v >= 10_000_000:  return 13
    if v >= 1_000_000:   return 8
    if v >= 100_000:     return 4
    return 0

# words that NAME a stage — the rubric's own list
STAGE = re.compile(r"\b(proposed|proposing|sought|seeks?|urging|urged|requesting|"
                   r"referred|sent to committee|continued|put off|tabled|laid over|"
                   r"intention|intends?|to consider|passed for second reading|"
                   r"first reading|hearing set|hearing called)\b", re.I)
BIG = re.compile(r"\bcitywide\b|\bcharter\b|\ball (?:city|departments)\b|"
                 r"\bevery\b|\bballot\b|\bvoters\b", re.I)
# reach, in the rubric's sense: a rule binding a class, not one address
WIDE = re.compile(r"\bcitywide\b|\bthroughout the city\b|\ball districts\b|"
                  r"\bvarious codes\b|\bevery\b|\bany person\b|\bvoters\b|"
                  r"\bballot\b|\bcharter amendment\b|\binitiative ordinance\b|"
                  r"\ball employees\b|\bparental leave\b|\bminimum wage\b|"
                  r"\ball city departments\b|\bgeneral obligation bonds\b", re.I)

# A rule with no address in it binds the whole city. The rubric's "wide reach,
# small stakes" puts those at the FOOT of the band their reach earns, which is
# why these are 58-72 and not 80: a code cleanup reaches everybody and changes
# little, and a Planning Code amendment reaches everybody and changes a lot.
CITYWIDE_BASE = {"zoning": 72, "code-changes": 60, "staff-and-jobs": 60,
                 "taxes-revenue": 58, "elections": 60, "environment": 58}


def score(subtopic, action, ht, t, line, has_street=False):
    s = BASE.get(subtopic, 33)
    if not has_street and subtopic in CITYWIDE_BASE:
        s = CITYWIDE_BASE[subtopic]
    # a threshold, a ceiling or a debt limit names a sum the city is not
    # spending; the money bump would read it as a $200M decision.
    if not re.search(r"\bthreshold\b|\blimit\b|\bceiling\b|\bcap\b|"
                     r"\bnot to exceed thresholds?\b", (ht or ""), re.I):
        s += _bump(_usd(ht, t))
    # reach picks the band: a rule binding a whole class is not a one-address
    # act. "As-Needed Citywide Contract for Industrial Supplies" is a purchase
    # order, not a rule, so a procurement header takes no reach bonus.
    PROCURE = re.compile(r"\bcontract\b|\bagreement\b|\bsupplies\b|"
                         r"\bas-needed\b|\bpurchase order\b|\blease\b", re.I)
    if WIDE.search((ht or "") + " " + (line or "")) and not PROCURE.search(ht or ""):
        s += 8
    # the rubric's own adjustments
    if action in ("settled", "commended", "voted-or-scheduled"):
        s = min(s, 29)                      # one party's business, or a gesture
    if subtopic in ("commendations",):
        s = min(s, 18)
    # A hearing and a commendation are already priced AT their stage — the
    # anchor is 16 for "a hearing on a named proposal" and the gesture band is
    # what a proclaimed week is. Discounting them again pushed both under 10,
    # into the band the rubric reserves for procedure with no subject.
    if subtopic in ("hearings-appeals", "commendations"):
        return max(1, min(100, s))
    if STAGE.search((line or "") + " " + (ht or "")):
        s = int(round(s * (0.75 if BIG.search(ht or "") else 0.55)))
    return max(1, min(100, s))

BANDS = ((80, 100), (55, 79), (30, 54), (10, 29), (0, 9))


def band_of(s):
    for lo, hi in BANDS:
        if s >= lo:
            return lo, hi
    return 0, 9


def in_band(raw, calibrated):
    """The rubric owns the band; the corpus owns the position inside it.

    Measured on this batch: the corpus pools carry misclassified tails — a 1920
    tax rate sits in `lawsuits/settled` at 80 — so an uncapped quantile map put
    a $2.9M claim settlement at 70, two bands above what the rubric says a
    settlement is. This is the guard, and it is the rubric's own sentence:
    stage is the ONLY thing allowed to move a record between bands.
    """
    lo, hi = band_of(raw)
    return max(lo, min(hi, calibrated))


def calibrate(new, corpus):
    """new: {id: raw}.  corpus: the scores the corpus gave this subtopic.
    Equal raw scores come out equal — an earlier rank-based version spread
    twenty identical fragments from 5 to 78."""
    if not corpus: return dict(new)
    corpus = sorted(corpus)
    # clamp to p5-p95: the lowest new row must not inherit a corpus outlier
    # clamp the FOOT only: the lowest new row must not inherit a corpus
    # outlier, but the batch's biggest act must still be able to reach the
    # top of its subject — capping the head hid the citywide ordinances.
    corpus = corpus[int(0.05 * len(corpus)):] or corpus
    m = len(corpus)
    blocks, seen = {}, 0
    for v in sorted(set(new.values())):
        k = sum(1 for x in new.values() if x == v)
        blocks[v] = corpus[min(m - 1, int((seen + k / 2) * m / len(new)))]
        seen += k
    return {i: blocks[v] for i, v in new.items()}
