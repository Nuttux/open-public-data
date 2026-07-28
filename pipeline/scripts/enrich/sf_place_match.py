"""Shared place-name matching for the SF lieux crosswalk generators (Block 6).

Phrase-level, word-boundary matching of a free-text money-item name (a bond
project, a contract title, a DPW project) against a seed place's aliases —
never a shared generic token ("Union Square" must not match "St Mary's Square").
Short aliases qualify only as all-caps acronyms (SFGH, ZSFG), matched as a
word-prefix because facilities append a letter ("ZSFGH …"). Same rules the 6A
facility crosswalk and the contract chip use, kept in one place.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_SEED = _ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def alias_ok(a: str) -> bool:
    """Usable alias: ≥5 chars, or a ≥3-char all-caps acronym (SFGH, ZSFG, GGP).

    The floor was ≥6 / ≥4-acronym, which silently discarded the three shortest
    forms the city's own ledgers actually use — "GGP" (every Golden Gate Park
    contract is titled "PW GGP …"), "LHH" and "Kezar" — leaving flagship places
    at zero on the very ledgers that hold their money. Measured against the
    seed, the relaxation admits those three aliases and nothing else. Short
    aliases only enter the seed after a per-entry precision check against the
    ledger they will match (add_sf_verified_aliases.py); this floor is not a
    licence to invent them."""
    return len(a) >= 5 or (len(a) >= 3 and a.isupper() and a.isalpha())


def is_acronym(a: str) -> bool:
    return a.isupper() and a.isalpha() and len(a) < 6


def phrase_match(alias_norm: str, hay_norm: str, acronym: bool) -> bool:
    """Whole-phrase word-boundary match; acronyms match as a word-prefix."""
    if not alias_norm or not hay_norm:
        return False
    if acronym:
        return bool(re.search(rf"\b{re.escape(alias_norm)}", hay_norm))
    if re.search(rf"\b{re.escape(alias_norm)}\b", hay_norm):
        return True
    # the whole alias contains a specific facility/place phrase
    if len(alias_norm) >= 6 and re.search(rf"\b{re.escape(alias_norm)}\b", hay_norm):
        return True
    return False


def load_places() -> list[dict]:
    """Seed places with a precomputed (alias, alias_norm, is_acronym) list."""
    places = json.loads(_SEED.read_text())["places"]
    for p in places:
        aliases = [a for a in [p["name"], *p.get("aliases", [])] if alias_ok(a)]
        p["_alias_norms"] = [(a, norm(a), is_acronym(a)) for a in aliases]
    return places


def match_place(hay: str, places: list[dict]) -> tuple[dict, str] | None:
    """First place whose alias phrase-matches `hay`; returns (place, evidence).
    Deterministic by seed order — a name that matches two places is rare and
    surfaced for review, not silently split."""
    hay_norm = norm(hay)
    for p in places:
        for (alias, an, ac) in p["_alias_norms"]:
            if phrase_match(an, hay_norm, ac):
                return p, alias
    return None
