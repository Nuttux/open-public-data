#!/usr/bin/env python3
"""Resolve WHO each keyed San Francisco payee is.

The problem this closes. A Paris supplier fiche opens with what the company
does — activity label, NAF code, legal form, head office, headcount — and all
of it is free: DECP carries a SIREN, so SIRENE answers. San Francisco's
voucher file carries NO vendor identifier of any kind, only a display string
("BLUE SHIELD OF CALIF"), so the payee fiche had nothing to say about the
payee at all. This builds the missing layer.

Cascade per payee, in order, first hit wins:

  1. IRS exempt-organization registry, via the ProPublica Nonprofit Explorer
     API (public, no key). Returns legal name, EIN, NTEE activity code and
     city — the closest US analogue to a SIRENE record, and a citable fact
     rather than a description. Matched on the normalized name CORE with an
     explicit confidence, never a fuzzy "closest hit".
  2. LLM grounded web search (Claude + web_search), for the payees no
     registry covers — for-profit suppliers, joint ventures, banks. Same
     pattern as enrich_beneficiaire_grounded_llm.py: the model must return
     its sources, and anything it cannot support comes back null.
  3. Nothing. The fiche then shows only what the City's own data says, which
     is the honest outcome and never a placeholder sentence.

Output is a CACHE, not a patch: export_us_sf_payees.py reads it and folds
`identity` into each fiche as it writes them. That direction matters — the
fiches are REBUILT from BigQuery on every export, so anything applied to them
afterwards is destroyed by the next run (the lesson from the SF place glosses,
which an export silently wiped).

Usage:
    python pipeline/scripts/enrich/enrich_sf_payee_identity.py            # registry only
    ANTHROPIC_API_KEY=... python .../enrich_sf_payee_identity.py --llm    # + grounded pass
    python .../enrich_sf_payee_identity.py --limit 20 --verbose
    python .../enrich_sf_payee_identity.py --refresh                      # ignore cache
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[3]
PAYEES = ROOT / "website" / "public" / "data" / "us" / "sf" / "payees"
CACHE = ROOT / "pipeline" / "cache" / "enrichment" / "sf_payee_identity.json"

PROPUBLICA_SEARCH = "https://projects.propublica.org/nonprofits/api/v2/search.json"
PROPUBLICA_ORG = "https://projects.propublica.org/nonprofits/api/v2/organizations/{ein}.json"
PROPUBLICA_PAGE = "https://projects.propublica.org/nonprofits/organizations/{ein}"
REQ_TIMEOUT = 30
# The API is a courtesy of a newsroom, not a paid service — one request a
# second, single threaded, and the cache means a re-run costs nothing.
RATE_SLEEP = 1.0

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5")
CLAUDE_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_WEB_SEARCH_MAX_USES = 3
MAX_RETRIES = 5
RETRY_WAIT_429 = 60

# NTEE major groups — the IRS/NCCS taxonomy's first character. Published
# classification, not our editorial labels.
NTEE_MAJOR = {
    "A": "Arts, culture and humanities",
    "B": "Education",
    "C": "Environment",
    "D": "Animal-related",
    "E": "Health care",
    "F": "Mental health and crisis intervention",
    "G": "Voluntary health associations and medical disciplines",
    "H": "Medical research",
    "I": "Crime and legal-related",
    "J": "Employment",
    "K": "Food, agriculture and nutrition",
    "L": "Housing and shelter",
    "M": "Public safety, disaster preparedness and relief",
    "N": "Recreation and sports",
    "O": "Youth development",
    "P": "Human services",
    "Q": "International and foreign affairs",
    "R": "Civil rights, social action and advocacy",
    "S": "Community improvement and capacity building",
    "T": "Philanthropy, voluntarism and grantmaking",
    "U": "Science and technology",
    "V": "Social science",
    "W": "Public and societal benefit",
    "X": "Religion-related",
    "Y": "Mutual and membership benefit",
    "Z": "Unknown",
}

LEGAL_SUFFIX = {
    "INC", "INCORPORATED", "LLC", "L L C", "CORP", "CORPORATION", "CO",
    "COMPANY", "LP", "L P", "LLP", "LTD", "NA", "N A", "PC", "PLLC",
    "THE", "OF", "AND",
}

# Payee kinds that must never be sent to either step: `person` is a natural
# person (the personnes-physiques doctrine — never researched, never featured),
# and the fiscal-agent / pass-through buckets are conduits whose identity the
# bucket note already states more accurately than a web search would.
SKIP_KINDS = {"person", "fiscal_agent_debt_service", "payroll_passthrough"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# The Controller's vendor strings are truncated to fit a fixed-width field:
# "Episcopal Community Svcs of S F Inc", "Blue Shield of Calif", "State of
# Calif Dept of Health Care Svcs". Left unexpanded these never match a
# registry's spelled-out legal name, so real organizations were being missed
# on typography alone. Expansion applies to BOTH the search query and the
# match core.
ABBREV = {
    "SVCS": "SERVICES", "SVC": "SERVICE", "SERVS": "SERVICES",
    "CALIF": "CALIFORNIA", "CA": "CALIFORNIA",
    "SF": "SAN FRANCISCO", "SFO": "SAN FRANCISCO",
    "CTR": "CENTER", "CTRS": "CENTERS",
    "DEPT": "DEPARTMENT", "DIV": "DIVISION",
    "ASSN": "ASSOCIATION", "ASSOC": "ASSOCIATION",
    "MGT": "MANAGEMENT", "MGMT": "MANAGEMENT",
    "CNST": "CONSTRUCTION", "CONSTR": "CONSTRUCTION", "CONSTRS": "CONSTRUCTORS",
    "BLDRS": "BUILDERS", "BLDG": "BUILDING",
    "TREAS": "TREASURER", "HLTH": "HEALTH", "MED": "MEDICAL",
    "INTL": "INTERNATIONAL", "NATL": "NATIONAL",
    "DEV": "DEVELOPMENT", "HSG": "HOUSING",
    "ORG": "ORGANIZATION", "COMM": "COMMUNITY", "CBO": "COMMUNITY",
    "UNIV": "UNIVERSITY", "SCH": "SCHOOL", "DIST": "DISTRICT",
    "AMER": "AMERICAN", "NO": "NORTHERN", "SO": "SOUTHERN",
}


def expand_abbrev(name: str) -> str:
    """Spell out the Controller's fixed-width abbreviations."""
    up = re.sub(r"[’'`]", "", name.upper())
    # "S F" is two tokens in the source, one concept in the registry.
    up = re.sub(r"\bS\s+F\b", "SAN FRANCISCO", up)
    out = [ABBREV.get(tok, tok) for tok in re.split(r"\s+", up) if tok]
    return " ".join(out)


def core(name: str) -> str:
    """
    Same normalization as build_sf_payee_identity.core(), minus the ordering.

    Apostrophes are DELETED, not turned into spaces: "Children's Council"
    would otherwise normalize to "CHILDREN S COUNCIL" while the registry's
    "Childrens Council" gives "CHILDRENS COUNCIL", and a real organization
    would silently fail to match over a typographic detail.
    """
    up = expand_abbrev(name).replace("&", " AND ")
    up = re.sub(r"[^A-Z0-9 ]", " ", up)
    toks = [t for t in up.split() if t not in LEGAL_SUFFIX]
    return " ".join(toks)


# Tokens that make an otherwise-containing name a DIFFERENT legal entity. A
# college and its fundraising foundation are two organizations with two EINs;
# describing the college as its foundation is exactly the confident-and-wrong
# outcome this cascade exists to avoid. Found live: "City College of San
# Francisco" matching "Foundation of City College of San Francisco".
ENTITY_SHIFTING = {
    "FOUNDATION", "FOUNDATIONS", "FUND", "FUNDS", "TRUST", "ENDOWMENT",
    "AUXILIARY", "FRIENDS", "ALUMNI", "PAC", "ACTION", "INSTITUTE",
    "SOCIETY", "GUILD", "CLUB", "CHAPTER", "COUNCILS",
}


def token_overlap(a: str, b: str) -> float:
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ── Step 1: IRS registry via ProPublica ──────────────────────────────────────

def propublica_match(name: str, verbose: bool = False) -> dict | None:
    """
    Best IRS exempt-organization match for a payee name, or None.

    Deliberately conservative: the name CORE must match exactly, or one core
    must contain the other with strong token overlap. A "closest hit" is worse
    than no hit — the fiche would confidently describe the wrong charity.
    """
    try:
        r = requests.get(
            PROPUBLICA_SEARCH,
            params={"q": expand_abbrev(name).title(), "state[id]": "CA"},
            timeout=REQ_TIMEOUT,
        )
        # The API answers 404 for "nothing matched" — that is a no-match, not
        # a failure, and most SF payees (construction firms, banks, state
        # agencies) are correctly absent from a nonprofit registry.
        if r.status_code == 404:
            return None
        r.raise_for_status()
        orgs = r.json().get("organizations", [])
    except Exception as e:  # network / rate limit / schema drift
        if verbose:
            print(f"    propublica error for {name!r}: {e}")
        return None

    want = core(name)

    # Ambiguity check BEFORE scoring. Several distinct organizations in CA
    # file under the same name — "Catholic Charities" is one per diocese, and
    # an exact name match picked San Bernardino for a payee that is the
    # Archdiocese of San Francisco's agency. When more than one candidate has
    # the same core, only a San Francisco address can break the tie; nothing
    # else in the registry response can.
    exact = [o for o in orgs if core(o.get("name") or "") == want]
    if len(exact) > 1:
        sf_exact = [o for o in exact if (o.get("city") or "").strip().lower() == "san francisco"]
        if len(sf_exact) != 1:
            if verbose:
                print(f"    ambiguous: {len(exact)} CA organizations named like {name!r}")
            return None
        orgs = sf_exact

    best: tuple[float, dict] | None = None
    for o in orgs:
        got = core(o.get("name") or "")
        if not got:
            continue
        overlap = token_overlap(want, got)
        extra = set(got.split()) ^ set(want.split())
        if extra & ENTITY_SHIFTING:
            continue  # a foundation / fund / trust OF the payee is not the payee
        if got == want:
            conf = 0.92
        elif (want in got or got in want) and overlap >= 0.6:
            conf = 0.78
        elif overlap >= 0.85:
            conf = 0.72
        else:
            continue
        in_sf = (o.get("city") or "").strip().lower() == "san francisco"
        # A SHORT name is not an identifier. "Catholic Charities" matches one
        # organization per diocese and the registry returned San Bernardino's
        # for a payee that is the Archdiocese of San Francisco's agency —
        # exactly, so no ambiguity check catches it. Two tokens or fewer must
        # therefore be corroborated by a San Francisco address. This also
        # rejects some correct out-of-city matches (Felton Institute files
        # from Alameda); that trade is deliberate — a missing identity is a
        # blank, a wrong one is a false statement about a named organization.
        if len(want.split()) <= 2 and not in_sf:
            continue
        # An INEXACT match must be corroborated by a San Francisco address.
        # Without this the containment tier confidently returns namesakes:
        # measured on the live registry, "San Mateo County" matched "NAMI San
        # Mateo County" and "Meals on Wheels" matched "Meals on Wheels West"
        # (Santa Monica). A wrong identity is worse than none.
        if conf < 0.9 and not in_sf:
            continue
        if in_sf:
            conf += 0.05
        conf = min(conf, 0.97)
        if best is None or conf > best[0]:
            best = (conf, o)

    if best is None:
        return None
    conf, o = best
    ein = str(o.get("ein") or "").strip()
    ntee = (o.get("ntee_code") or "").strip() or None
    ntee_label = NTEE_MAJOR.get(ntee[0].upper()) if ntee else None
    legal_name = (o.get("name") or "").strip()
    city = (o.get("city") or "").strip() or None
    state = (o.get("state") or "CA").strip() or None

    where = ", ".join(x for x in (city, state) if x)
    if ntee_label:
        desc = (
            f"{legal_name} is an IRS-recognized tax-exempt organization"
            f"{f' in {where}' if where else ''}, classified under "
            f"{ntee_label.lower()}."
        )
    else:
        desc = (
            f"{legal_name} is an IRS-recognized tax-exempt organization"
            f"{f' in {where}' if where else ''}. Its IRS activity code is not "
            f"recorded in the registry."
        )

    return {
        "description": desc,
        "method": "irs_bmf",
        "confidence": round(conf, 2),
        "legal_name": legal_name,
        "ein": ein or None,
        "ntee_code": ntee,
        "ntee_label": ntee_label,
        "city": city,
        "state": state,
        "source_label": "IRS exempt-organization registry (ProPublica Nonprofit Explorer)",
        "source_url": PROPUBLICA_PAGE.format(ein=ein) if ein else None,
        "checked_at": now_iso(),
    }


# ── Step 2: grounded LLM ─────────────────────────────────────────────────────

PROMPT = """You identify organizations that receive payments from the City and County of San Francisco.

Payee, exactly as the SF Controller records it: "{name}"
The City's own data says it was paid ${total} between {first} and {last}, mostly by: {depts}.
The City books those payments under: {cats}.

Search the web and answer ONLY about the organization that actually received this money.

Return STRICT JSON, no prose, no markdown:
{{
  "description": "ONE sentence, max 30 words, plain English: what this organization is and what it does. Neutral and factual. No marketing language, no adjectives of praise or blame.",
  "legal_name": "full legal name, or null",
  "city": "headquarters city, or null",
  "state": "two-letter state, or null",
  "confidence": 0.0-1.0
}}

Rules:
- If you cannot identify the organization with confidence, return "description": null and "confidence": 0. A null is a correct answer; a guess is not.
- Describe ONLY what your sources support. Do not infer what they do from the payment categories above — those are context to disambiguate WHICH organization, not evidence about its activity.
- Never describe an individual person. If the payee looks like a natural person, return null.
"""


def claude_identify(payee: dict, verbose: bool = False) -> dict | None:
    """Grounded one-liner for payees the registry does not cover."""
    if not ANTHROPIC_API_KEY:
        return None

    profile = payee.get("profile") or {}
    depts = ", ".join(d["department"] for d in (profile.get("departments") or [])[:3]) or "unknown"
    cats = ", ".join(c["label"] for c in (profile.get("categories") or [])[:3]) or "unknown"
    prompt = PROMPT.format(
        name=payee["name"],
        total=f"{payee.get('total_paid_usd', 0):,.0f}",
        first=payee.get("first_year"),
        last=payee.get("last_year"),
        depts=depts,
        cats=cats,
    )

    body = {
        "model": CLAUDE_MODEL,
        "max_tokens": 900,
        "messages": [{"role": "user", "content": prompt}],
        "tools": [{
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": CLAUDE_WEB_SEARCH_MAX_USES,
        }],
    }
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    for attempt in range(MAX_RETRIES):
        try:
            r = requests.post(CLAUDE_URL, headers=headers, json=body, timeout=120)
            if r.status_code == 429:
                time.sleep(RETRY_WAIT_429 * (attempt + 1))
                continue
            r.raise_for_status()
            data = r.json()
            break
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                if verbose:
                    print(f"    claude error for {payee['name']!r}: {e}")
                return None
            time.sleep(5 * (attempt + 1))
    else:
        return None

    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    sources: list[dict] = []
    for block in data.get("content", []):
        if block.get("type") == "web_search_tool_result":
            for res in block.get("content", []) or []:
                if isinstance(res, dict) and res.get("url"):
                    sources.append({"title": res.get("title"), "url": res["url"]})

    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None

    desc = (parsed.get("description") or "").strip()
    conf = float(parsed.get("confidence") or 0)
    # An unsourced description is an assertion, not a finding — the whole
    # point of the grounded pass is that the reader can check it.
    if not desc or conf <= 0 or not sources:
        return None

    return {
        "description": desc,
        "method": "grounded_llm",
        "confidence": round(min(conf, 0.9), 2),
        "legal_name": (parsed.get("legal_name") or "").strip() or None,
        "ein": None,
        "ntee_code": None,
        "ntee_label": None,
        "city": (parsed.get("city") or "").strip() or None,
        "state": (parsed.get("state") or "").strip() or None,
        "source_label": f"web search, {CLAUDE_MODEL}",
        "source_url": sources[0]["url"] if sources else None,
        "sources": sources[:4],
        "checked_at": now_iso(),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="stop after N payees needing work")
    ap.add_argument("--llm", action="store_true", help="run the grounded pass for registry misses")
    ap.add_argument("--refresh", action="store_true", help="ignore the cache and re-resolve")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    index_path = PAYEES / "index.json"
    if not index_path.exists():
        print(f"✗ {index_path} absent — run export_us_sf_payees.py first")
        return 1
    index = json.loads(index_path.read_text())["payees"]

    CACHE.parent.mkdir(parents=True, exist_ok=True)
    cache: dict[str, Any] = json.loads(CACHE.read_text()) if CACHE.exists() and not args.refresh else {}
    entries: dict[str, Any] = cache.get("payees", {})

    if args.llm and not ANTHROPIC_API_KEY:
        print("⚠ --llm requested but ANTHROPIC_API_KEY is unset — registry step only")

    n_registry = n_llm = n_none = n_cached = n_skipped = 0
    todo = 0

    for entry in index:
        slug = entry["slug"]
        if entry.get("kind") in SKIP_KINDS:
            n_skipped += 1
            continue
        if slug in entries and not args.refresh:
            n_cached += 1
            continue
        if args.limit and todo >= args.limit:
            break
        todo += 1

        fiche_path = PAYEES / f"{slug}.json"
        if not fiche_path.exists():
            continue
        payee = json.loads(fiche_path.read_text())

        found = propublica_match(payee["name"], verbose=args.verbose)
        time.sleep(RATE_SLEEP)
        if found:
            n_registry += 1
        elif args.llm and ANTHROPIC_API_KEY:
            found = claude_identify(payee, verbose=args.verbose)
            if found:
                n_llm += 1

        if found:
            entries[slug] = found
            if args.verbose:
                print(f"  ✓ {slug} [{found['method']} {found['confidence']}] {found['description'][:90]}")
        else:
            # Recorded so a re-run does not re-pay for a known miss; the fiche
            # simply renders without an identity block.
            entries[slug] = {"description": None, "method": None, "confidence": 0.0,
                             "checked_at": now_iso()}
            n_none += 1
            if args.verbose:
                print(f"  · {slug} — not identified")

        CACHE.write_text(json.dumps({
            "generated_at": now_iso(),
            "source_pipeline": "payees/index.json → enrich_sf_payee_identity.py",
            "method_note": (
                "irs_bmf = matched to an IRS-recognized exempt organization via "
                "the ProPublica Nonprofit Explorer API (registry fact, cited to "
                "the EIN). grounded_llm = web-searched one-liner for payees no "
                "registry covers, kept only when the model returned sources. "
                "Natural persons, fiscal agents and payroll pass-throughs are "
                "never sent to either step."
            ),
            "payees": entries,
        }, indent=1, ensure_ascii=False))

    print(f"✓ identity cache → {CACHE}")
    print(f"  registry {n_registry} · grounded {n_llm} · not identified {n_none} "
          f"· cached {n_cached} · skipped by kind {n_skipped}")
    if not args.llm:
        print("  (run again with --llm and ANTHROPIC_API_KEY to cover the registry misses)")
    print("  → re-run export_us_sf_payees.py to fold these into the fiches")
    return 0


if __name__ == "__main__":
    sys.exit(main())
