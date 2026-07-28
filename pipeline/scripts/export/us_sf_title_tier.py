#!/usr/bin/env python3
"""How much signal does an SF contract title actually carry?

The register has NO descriptive field: `scope_of_work` is capped at 50 chars
and is ≈ a truncated copy of the title (measured — docs/us/block-studies/
3-contracts.md §5). So a plain-English explanation has to be *generated* from
title + type + department + purchasing authority + prime + amounts.

Generating is only honest where the input carries something to work from.
This module splits the register into three tiers so the generator and the
exporter agree on that line:

  1  rich    — the title has ≥2 real words ("CMGC Sep Biosolid Digester",
               "1334 Potrero Infrastructure - Project Agreement"). Generating
               a clear title and a short explanation genuinely adds meaning.
  2  terse   — administrative shorthand with some signal ("Phmcy Scndry
               Dist.", "AIR50351 Owl Bus Service"). Decodable from the title
               plus the structured columns.
  3  none    — the title carries no subject at all: blank, a bare vendor name
               ("PG&E"), a single letter ("H", 772 contracts), a pure code
               ("693JJ3185002"). The title must NOT be decoded — but the other
               columns still support one honest sentence ("a grant from the
               Mayor's Office to the Eviction Defense Collaborative"), which is
               a plain-English restatement of the register, not a guess. Tier 3
               is generated from the columns only.

Measured over the 31,860-contract register (2026-07-28):
    tier 1  22,793 (71.5%)  $72.2B agreed
    tier 2   7,621 (23.9%)  $20.6B
    tier 3   1,446 ( 4.5%)   $0.2B

Every tier is generated; the tier decides how much the *title* may be leaned
on. 1 and 2 differ only in reported signal, so the 1/2 boundary is cosmetic.
The 2/3 boundary is the load-bearing one — it tells the model whether the
title is safe to decode — and it errs toward tier 2 on purpose, because the
model is the second gate (see `title_tier`).

Self-test: python3 us_sf_title_tier.py --test
"""

from __future__ import annotations

import re
import sys

# Register-idiom tokens that look like words but carry no subject matter —
# fiscal-year and program-code noise that would otherwise inflate tier 1.
NOISE_TOKENS = {
    "FY", "GOS", "GA", "AM", "NO", "RES", "INC", "LLC", "CORP", "THE", "AND",
    "FOR", "CONT", "AMND", "AMEND", "REV", "PROJ",
}

# y counts: SYSTEM, CITY, ONLY are words, and no register shorthand gains from it.
_VOWELS = set("aeiouyAEIOUY")

TIER_RICH = 1
TIER_TERSE = 2
TIER_NONE = 3


def _is_real_word(token: str) -> bool:
    """A token that reads as English, not consonant-stripped shorthand.

    3 letters need one vowel (owl, bus, air, gas); 4+ need two, which is what
    rejects the register's idiom — SCNDRY, PHMCY, CNST, BLDRS, RCRTN.
    """
    if token.upper() in NOISE_TOKENS:
        return False
    vowels = sum(1 for ch in token if ch in _VOWELS)
    if len(token) == 3:
        return vowels >= 1
    return len(token) >= 4 and vowels >= 2


def title_tier(title: str | None) -> int:
    """TIER_RICH / TIER_TERSE / TIER_NONE for a register title.

    Deliberately a cheap pre-filter, not a perfect classifier. Tier 3 is
    reserved for titles with no alphabetic token long enough to mean anything
    ("", "H", "86", "PG&E"); the model is told to describe those from the
    other columns and never to decode the title. Borderline shorthand lands
    in tier 2, where the model is the second gate: it must leave out anything
    it cannot read off the input rather than invent an expansion. Two gates,
    so neither has to be perfect.
    """
    text = (title or "").strip()
    if not text:
        return TIER_NONE
    tokens = [t for t in re.findall(r"[A-Za-z]+", text) if len(t) >= 3]
    if not tokens:
        return TIER_NONE
    if sum(1 for t in tokens if _is_real_word(t)) >= 2:
        return TIER_RICH
    return TIER_TERSE


def may_decode_title(title: str | None) -> bool:
    """Is the title safe to interpret, or must the text come from columns only?"""
    return title_tier(title) != TIER_NONE


def _test() -> int:
    cases = [
        # tier 1 — two or more real words
        ("CMGC Sep Biosolid Digester", TIER_RICH),
        ("1334 Potrero Infrastructure - Project Agreement", TIER_RICH),
        ("Contracts, Pharmaceuticals", TIER_RICH),
        ("ADMRE-5M Development Project", TIER_RICH),
        ("Gene Friend Rcrtn Ctr Rbd", TIER_RICH),
        # tier 2 — shorthand with a foothold
        ("Phmcy Scndry Dist.", TIER_TERSE),
        ("AIR50351 Owl Bus Service", TIER_RICH),
        ("MH&SA res & OP", TIER_TERSE),
        ("Cpsf-Schedul Coordin Ser", TIER_RICH),
        ("10071.76-DBT3West", TIER_TERSE),
        # tier 3 — no readable subject in the title
        ("", TIER_NONE),
        (None, TIER_NONE),
        ("H", TIER_NONE),
        ("86", TIER_NONE),
        ("PG&E", TIER_NONE),
        # PUC/CLP survive as tokens — tier 2, and the model omits what it
        # cannot decode rather than inventing an expansion.
        ("PUC_CLP_2018 RA", TIER_TERSE),
        ("HHP_CLP_RA4082-FY24", TIER_TERSE),
    ]
    failures = 0
    for title, expected in cases:
        got = title_tier(title)
        flag = "ok " if got == expected else "FAIL"
        if got != expected:
            failures += 1
        print(f"  {flag} tier={got} (want {expected})  {title!r}")
    print(f"\n{len(cases) - failures}/{len(cases)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(_test())
    print(__doc__)
