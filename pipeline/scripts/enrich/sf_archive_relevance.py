#!/usr/bin/env python3
"""Shared relevance/materiality scoring for SF Internet Archive matches.

The full-text endpoint matches STRINGS. An alias appearing in a document's OCR
proves the string is present, never that the document is *about* the entity.
Everything here exists to close that gap, and it is deliberately the same code
for every entity kind so a filter proved on one corpus carries to the next.

Extracted from link_sf_places.py (2026-07-27 backfill), which measured the
signals below on the place corpus. Two changes were made on extraction, both
driven by the department corpus:

  1. Jurisdiction detection is generalised. The place script carried a hand-
     listed RIVAL_CITY regex. That works when the alias is a proper noun
     ("Washington Square"), because collisions come from a handful of famous
     namesakes. It fails for generic organ names — "Department of Public Works",
     "Board of Supervisors", "Public Utilities Commission" — which every
     California jurisdiction also has. The dl pool answered that query with
     Fresno, Stanislaus, Glenn, Modoc, Redondo Beach and Santa Clara, none of
     which the hand list names. Enumerating California's 482 cities is whack-a-
     mole; reading the jurisdiction out of the title is not.
  2. `hits` is measured on the merged OCR windows, which is what the callers
     already had, but is now documented as an undercount (see ia_relevance).

link_sf_places.py intentionally still carries its own copy. Re-pointing it here
would re-rank published place fiches, and re-running that export destroys the
hand-written glosses (apply_sf_place_summaries.py). Converging the two is a
deliberate follow-up, not a side effect of this work.
"""

from __future__ import annotations

import re

# ── geography ────────────────────────────────────────────────────────────────
SF_CONTEXT = re.compile(r"san\s+francisco|\bccsf\b|\bcity\s+and\s+county\b", re.I)

# Bare city names, no jurisdiction keyword attached: "Estuary policy plan,
# Oakland", "The Berkeley camps", "Mountain House New Town general plan". These
# cannot be read structurally, so they stay a list.
RIVAL_CITY = re.compile(
    r"\b(sacramento|redding|eureka|reedley|fresno|stockton|modesto|bakersfield|"
    r"san\s+jose|oakland|berkeley|brisbane|daly\s+city|san\s+mateo|santa\s+clara|"
    r"redondo\s+beach|mountain\s+house|los\s+angeles|san\s+diego|mountain\s+view|"
    r"new\s+york)\b", re.I)

# Structural jurisdiction read: "<City|County|Town> of X" and "X County".
_JURIS_OF = re.compile(
    r"(?:city\s+and\s+county|city|county|town|village)\s+of\s+"
    r"([a-z][a-z.'\-]*(?:\s+[a-z][a-z.'\-]*){0,2})", re.I)
_JURIS_BARE = re.compile(r"\b([a-z][a-z.'\-]*(?:\s+[a-z][a-z.'\-]*)?)\s+count(?:y|ies)\b", re.I)
# Fragments the bare pattern captures off the SF form itself ("City and County
# of San Francisco") or off filler, and which name no jurisdiction.
_JURIS_NOISE = {"city and", "and", "the", "of", "a", "in", "for", "this", "each", "all",
                "other", "bay area", "the city and", "city", "county"}
# The multi-token capture is greedy so it can trail into the title's subject
# ("City of Redondo Beach general plan" → "redondo beach general"). The boolean
# is unaffected, but the name is written into the linkage JSON as the reason a
# document was rejected, so it should read as a place.
_JURIS_TRAIL = {"general", "source", "annual", "draft", "final", "proposed", "comprehensive",
                "for", "the", "of", "and", "a", "an", "in", "plan", "report", "budget"}


def other_jurisdictions(title: str) -> list[str]:
    """Jurisdictions named in a title that are not San Francisco.

    A document titled "Fresno County general plan" is about Fresno however many
    times it says the words "public works". This is the single most productive
    filter on generic aliases: on the 15-department corpus it is what separates
    San Francisco's Department of Public Works from Modoc County's.
    """
    found: list[str] = []
    for rx in (_JURIS_OF, _JURIS_BARE):
        for m in rx.finditer(title or ""):
            name = re.sub(r"\s+", " ", m.group(1).strip().lower())
            name = re.sub(r"^(?:the|a)\s+", "", name)
            toks = name.split()
            while toks and toks[-1] in _JURIS_TRAIL:
                toks.pop()
            name = " ".join(toks)
            if not name or name in _JURIS_NOISE:
                continue
            if "san francisco" in name or name in {"sf", "s.f."}:
                continue
            found.append(name)
    return found


# A citywide register enumerates every property/unit/salary the city has, so it
# matches every entity equally and is evidence about none of them.
CITYWIDE_SERIAL = re.compile(
    r"valuation of real property|annual salary ordinance|proposed charter|"
    r"housing element|general plan|municipal code|budget analyst", re.I)

# ── materiality ──────────────────────────────────────────────────────────────
MONEY = re.compile(r"\$[\s]?[\d,]{3,}|\b\d[\d,]{5,}\b|\bappropriat|\bexpenditure|"
                   r"\bbond\b|\bcost\b|\bbudget", re.I)
DECISION = re.compile(r"\bresolution\b|\bordinance\b|\bshall\b|\bapproved\b|"
                      r"\benacted\b|\badopted\b|\bappropriation\b|\bcontract\b", re.I)
ACCOUNTABILITY = re.compile(r"grand jury|\baudit\b|investigation|deficienc|"
                            r"\bappraisal\b|violation|noncompliance|whistleblow", re.I)
CONTESTATION = re.compile(r"\bobjection|\bappeal\b|\btestimony\b|comments and responses|"
                          r"public hearing|\bprotest\b|\bpetition\b", re.I)
HIGH_GENRE = re.compile(
    r"\baudit\b|grand jury|investigation|environmental impact|development program|"
    r"master plan|feasibility|\bbond\b|evaluation|report to the board|"
    r"management (audit|review)|appraisal|strategic plan|needs analysis|"
    r"economic impact|impact analysis|analysis of the|redevelopment", re.I)
LOW_GENRE = re.compile(
    r"^\s*(agenda|minutes|calendar|notice of meeting|agendas and minutes|"
    r"minutes and agendas|calendar of events|notice|bulletin|newsletter|motion|"
    r"ordinance|resolution|opinion|official meeting notice)"
    r"[\s/,:-]*(and calendar)?\s*$", re.I)


def ia_materiality(it: dict) -> dict:
    """Does this document carry decision-relevant substance for a reader?

    Scored from the cached OCR windows plus the title — no LLM, no extra fetch.
    Components are kept alongside the score so a shelf can explain itself
    ("cited for: money figures, public objections") rather than presenting an
    unexplained ranking.
    """
    ex = " ".join(it.get("ocr_excerpts") or [])
    title = it.get("title") or ""
    hay = f"{title} {ex}"
    money = bool(MONEY.search(hay))
    decision = bool(DECISION.search(hay))
    account = bool(ACCOUNTABILITY.search(hay))
    contest = bool(CONTESTATION.search(hay))
    high = bool(HIGH_GENRE.search(title))
    low = bool(LOW_GENRE.search(title))
    score = (
        (4.0 if high else 0.0)
        - (3.0 if low else 0.0)
        + (1.5 * account) + (1.0 * money) + (0.75 * decision) + (0.75 * contest)
    )
    return {"score": round(score, 2), "money": money, "decision": decision,
            "accountability": account, "contestation": contest,
            "named_genre": high, "generic_serial": low}


def ia_relevance(it: dict, aliases: list[str], min_title_alias: int = 6) -> dict:
    """Score how much a matched item is *about* the entity, not how long it is.

      sf_context  — SF named inside a hit window. The strongest single filter.
      hits        — merged alias windows. An UNDERCOUNT: fetch_ia_ocr.py merges
                    nearby occurrences into one window, so a document naming the
                    entity 40 times on one page yields one hit. It is a floor on
                    recurrence, which is the property the threshold wants.
      density     — hits per 100k chars of OCR. Named repeatedly in a 40-page
                    report = the subject; once in a 600-page plan = a mention.
      title_hit   — the alias is in the title: near-decisive.
      rival_city  — another jurisdiction named in the title (structural read or
                    hand list), or in the body while SF is never named.
    """
    ex = " ".join(it.get("ocr_excerpts") or [])
    hits = len(it.get("ocr_excerpts") or [])
    chars = max(it.get("ocr_chars") or 0, 1)
    title = it.get("title") or ""
    sf_context = bool(SF_CONTEXT.search(ex))
    others = other_jurisdictions(title)
    rival = (
        bool(RIVAL_CITY.search(title))
        or bool(others)
        or (bool(RIVAL_CITY.search(ex)) and not sf_context)
    )
    citywide = bool(CITYWIDE_SERIAL.search(title))
    title_hit = any(a.lower() in title.lower() for a in aliases if len(a) >= min_title_alias)
    density = hits / chars * 100_000
    substantive = title_hit or (hits >= 3 and density >= 1.0)
    substantive_direct = title_hit or hits >= 2
    score = (
        (3.0 if sf_context else 0.0)
        + (4.0 if title_hit else 0.0)
        + min(hits, 6) * 0.5
        + min(density, 4.0)
        - (2.0 if rival else 0.0)
    )
    return {"score": round(score, 2), "sf_context": sf_context, "rival_city": rival,
            "other_jurisdictions": others, "citywide_serial": citywide,
            "substantive": substantive, "substantive_direct": substantive_direct,
            "hits": hits, "density": round(density, 2), "title_hit": title_hit}


def cap_per_pool(docs: list[dict], per_pool: int, total: int) -> list[dict]:
    """Rank by relevance+materiality, then cap PER POOL before the global cap.

    A flat cap re-creates the starvation bug: the larger pool (sfpl for places
    and payees, either for departments) eats the whole budget before the other
    pool's candidates are considered, and one source silently disappears from
    every fiche.
    """
    kept: dict[str, int] = {}
    ranked = []
    for d in sorted(docs, key=lambda d: -(d["relevance"]["score"] + d["materiality"]["score"])):
        p = d.get("pool", "?")
        if kept.get(p, 0) >= per_pool:
            continue
        kept[p] = kept.get(p, 0) + 1
        ranked.append(d)
    return ranked[:total]
