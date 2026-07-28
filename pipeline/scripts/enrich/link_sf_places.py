#!/usr/bin/env python3
"""Generate evidence-backed linkage candidates for each SF place.

Stage (i) of the place linkage — cheap candidate generation. For every seed
place it assembles, each item carrying the exact evidence that justifies it:

  - archive_docs : Internet Archive items whose full text matched a place
    alias (from the sync_ia_sf.py cache), carrying the OCR passages around the
    alias (fetch_ia_ocr.py) as the grounding for the fiche's summary — not a
    280-char match fragment. Kept only when the OCR yielded real context, so
    incidental keyword hits (a document that merely names the 39-Coit bus line)
    drop out. Pool-labelled (sfpl / dl) so the source line can honour the
    doctrine (SFPL scans are NOT "Democracy's Library").
  - dept_shelf   : the owning department's own archive items (annual reports,
    minutes) from the department cache.
  - contracts    : active contracts whose title names a place alias — evidence
    is the contract title itself. Each hit also carries `team` (prime +
    subcontractors with attached $), lifted straight from the contract's own
    fiche (export_us_sf_contracts.py) rather than re-derived — this is the
    payee linkage, and it only ever exists as a child of a validated contract
    match, never as its own place↔vendor index (there is no field that ties a
    vendor to a place independent of a contract/voucher naming that place).
  - budget_line  : the owning department's latest-year budget total (structural
    link: the place is operated by department D, whose budget is $X).
  - payroll_line : the owning department's latest-year payroll total + headcount
    (same structural link as budget_line — department D employs N people,
    total compensation $X). Both are DEPARTMENT figures, never the place's
    own — see the source comment in export_sf_places.py's fiche assembly.

No geo-radius is ever asserted — the money data has no geography column. What
genuinely belongs (operator relationships, grants to on-site nonprofits) is
decided in Block C when the fiche is written and gated; this step only
proposes, always with the quote attached. Output feeds export_sf_places.py.

Linkage-matrix note (2026-07-21 audit): contracts/vouchers/payees only ever
fire for large or distinctively-named places — 11/63 seeded places clear the
archive≥3 bar today, and dataset-wide only ~17% of places get any contract
hit at all (small facilities like branch libraries are covered by citywide
blanket contracts that never name the branch). Budget/payroll have NO field
finer than department_code — program codes are generic (Admin/Capital/
Maintenance/Operating), so there is no path to a place-level budget or
payroll figure, ever, for this source. Aliases must stay qualified ("Chinatown
Branch Library", not bare "Chinatown") — several place names double as SF
neighborhood names and a bare alias pulls in unrelated department programs
at ~0% precision.

Output: pipeline/cache/ia_sf/linkage/<slug>.json

Usage: python pipeline/scripts/enrich/link_sf_places.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sync"))
from ia_collections import tier as collection_tier  # noqa: E402
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
CACHE = ROOT / "pipeline" / "cache" / "ia_sf"
SF = ROOT / "website" / "public" / "data" / "us" / "sf"

# owning_dept_code → the department archive-cache slug used by sync_ia_sf.py
DEPT_ARCHIVE_SLUG = {
    "REC": "recreation-and-park",
    "PUC": "public-utilities-commission",
    "LIB": "public-library",
    "DPH": "public-health",
    "FIR": "fire-department",
    "POL": "police-department",
    "PRT": "port",
    "MTA": "municipal-railway",
    "DPW": "public-works",
    "WAR": "war-memorial",
    "ADM": "city-planning",  # nearest print-era shelf; City Administrator has no serial
    "AAM": None,
    "FAM": None,
}

def _norm(s: str) -> str:
    """Lowercase, punctuation → space. Same normalisation as sf_place_match."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


ARCHIVE_CAP = 14
# Applied per pool, not over the flat sfpl-then-dl list. A flat cap re-creates
# the TOP_K starvation bug one layer down: ~10 grounded SFPL items would eat the
# budget before the Democracy's Library candidates were considered.
ARCHIVE_CAP_PER_POOL = 8
MAX_BUDGET_YEAR = 2025  # latest closed with dept breakdown
FICHE_DIR = SF / "contracts" / "fiche"

# ── relevance of an archive match ────────────────────────────────────────────
# An alias appearing in a document's OCR proves the string is present, not that
# the document is ABOUT the place. The Democracy's Library pool is statewide
# planning literature, so generic aliases collide constantly across cities:
# "Washington Square" hit a Sacramento housing element and a New York University
# zoology paper, "Station 1" hit the City of Redding general plan, "fire
# department training" hit Reedley. Measured on the 2026-07-27 backfill, 58% of
# grounded dl matches never named San Francisco anywhere near the hit.
SF_CONTEXT = re.compile(r"san\s+francisco|\bccsf\b|\bcity\s+and\s+county\b", re.I)
# Cities whose own planning documents sit in the same collection; naming one of
# these near the hit while never naming SF is positive evidence of a collision.
RIVAL_CITY = re.compile(
    r"\b(sacramento|redding|eureka|reedley|fresno|stockton|modesto|bakersfield|"
    r"san\s+jose|oakland|berkeley|brisbane|daly\s+city|san\s+mateo|"
    r"los\s+angeles|san\s+diego|mountain\s+view|new\s+york)\b", re.I)
# A citywide register enumerates every property/unit the city owns, so it matches
# every place equally and is evidence about none of them. Before this filter the
# annual "Valuation of real property" series alone was 46 of 165 published dl
# rows — the same book, on nearly every fiche, ranked in by sheer length.
CITYWIDE_SERIAL = re.compile(
    r"valuation of real property|annual salary ordinance|proposed charter|"
    r"housing element|general plan|municipal code|budget analyst", re.I)

# ── materiality ──────────────────────────────────────────────────────────────
# Relevance asks "is this document about this place". Materiality asks the
# question a reader actually has: "does this help me understand or challenge a
# decision". They are independent — a lovingly detailed architectural history
# scores high on the first and low on the second.
MONEY = re.compile(r"\$[\s]?[\d,]{3,}|\b\d[\d,]{5,}\b|\bappropriat|\bexpenditure|"
                   r"\bbond\b|\bcost\b|\bbudget", re.I)
DECISION = re.compile(r"\bresolution\b|\bordinance\b|\bshall\b|\bapproved\b|"
                      r"\benacted\b|\badopted\b|\bappropriation\b|\bcontract\b", re.I)
# Documents that exist BECAUSE something went wrong are the highest-signal civic
# records there are: someone was compelled to write them down.
ACCOUNTABILITY = re.compile(r"grand jury|\baudit\b|investigation|deficienc|"
                            r"\bappraisal\b|violation|noncompliance|whistleblow", re.I)
CONTESTATION = re.compile(r"\bobjection|\bappeal\b|\btestimony\b|comments and responses|"
                          r"public hearing|\bprotest\b|\bpetition\b", re.I)
# Genre, read off the title. Hand-scoring 30 documents (2026-07-27) showed the
# vocabulary signals above are reliable at the top of the ranking and noisy in
# the middle: an item titled "Notice of meeting and calendar" scored 5.0 on
# incidental words in its agenda text, while "childhood lead prevention program:
# data evaluation" scored 0.0. A title is stable where a 700-char OCR window is
# not, so genre carries most of the weight and vocabulary only breaks ties.
HIGH_GENRE = re.compile(
    r"\baudit\b|grand jury|investigation|environmental impact|development program|"
    r"master plan|feasibility|\bbond\b|evaluation|report to the board|"
    r"management (audit|review)|appraisal|strategic plan|needs analysis|"
    r"economic impact|impact analysis|analysis of the|redevelopment", re.I)
# Contentless serial titles. The document behind one may be substantive, but the
# title tells a reader nothing, so it should never outrank a named report — and
# it is precisely these that the vocabulary signals scored at random.
LOW_GENRE = re.compile(
    r"^\s*(agenda|minutes|calendar|notice of meeting|agendas and minutes|"
    r"minutes and agendas|calendar of events|notice|bulletin|newsletter)"
    r"[\s/,:-]*(and calendar)?\s*$", re.I)


def ia_materiality(it: dict) -> dict:
    """Does this document carry decision-relevant substance for a reader?

    Scored from the OCR windows we already cache plus the title — no LLM, no
    extra fetch. The components are kept alongside the score so a shelf can
    explain itself ("cited for: money figures, public objections") instead of
    presenting an unexplained ranking.
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


def ia_relevance(it: dict, aliases: list[str]) -> dict:
    """Score how much a matched item is *about* the place, not how long it is.

    Returns the component signals alongside the score so the export layer can
    rank on them and a human can audit why a document ranked where it did.

      sf_context  — SF named inside a hit window. The single strongest filter:
                    it is what separates our Washington Square from Sacramento's.
      hits        — merged alias windows: how often the place actually comes up.
      density     — hits per 100k chars of OCR. A place named 20 times in a
                    40-page report is the subject; named once in a 600-page
                    general plan it is a passing mention. Character volume, the
                    signal this replaces, ranked those two the other way round.
      title_hit   — the alias is in the document's title: near-decisive.
    """
    ex = " ".join(it.get("ocr_excerpts") or [])
    hits = len(it.get("ocr_excerpts") or [])
    chars = max(it.get("ocr_chars") or 0, 1)
    title = it.get("title") or ""
    sf_context = bool(SF_CONTEXT.search(ex))
    # A rival city in the TITLE is decisive regardless of body text: "Estuary
    # policy plan, Oakland" and "The Berkeley camps" both name San Francisco in
    # passing, and both cleared the body-text gate while being about elsewhere.
    rival = bool(RIVAL_CITY.search(title)) or (bool(RIVAL_CITY.search(ex)) and not sf_context)
    citywide = bool(CITYWIDE_SERIAL.search(title))
    title_hit = any(a.lower() in title.lower() for a in aliases if len(a) >= 6)
    density = hits / chars * 100_000
    # Substance floor, in two strengths. The strict form — title names the place,
    # or it recurs both repeatedly AND densely for the document's length — is for
    # multi-jurisdiction collections, where a passing mention is usually a
    # different city's namesake. Applying it to San Francisco's own municipal
    # paper was too blunt: it cut the SFPL pool 498→281 and pushed 17 places
    # below the archive≥3 publication bar, discarding real records because a
    # place is named twice in a Municipal Report rather than three times.
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
            "citywide_serial": citywide, "substantive": substantive,
            "substantive_direct": substantive_direct,
            "hits": hits, "density": round(density, 2), "title_hit": title_hit}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


def dept_budget_index() -> dict[str, dict]:
    b = load_json(SF / f"budget_breakdown_{MAX_BUDGET_YEAR}.json")
    out = {}
    if b:
        for d in b["departments"]["spending"]:
            out[d["code"]] = {
                "code": d["code"],
                "name": d.get("display_name") or d.get("label"),
                "total_usd": d["total_usd"],
                "fiscal_year": MAX_BUDGET_YEAR,
            }
    return out


def dept_payroll_index() -> dict[str, dict]:
    """Latest-year department payroll totals — same structural link as
    dept_budget_index (department_code only, no place-level field exists in
    the comp dataset). Sourced from the already mart-derived, small-cell-safe
    export_us_sf_payroll.py output — never queried raw."""
    p = load_json(SF / "payroll_by_dept_year.json")
    out = {}
    if p:
        for d in p.get("departments", []):
            series = d.get("series") or []
            if not series:
                continue
            latest = max(series, key=lambda s: s["fiscal_year"])
            out[d["department_code"]] = {
                "code": d["department_code"],
                "name": d.get("department"),
                "total_compensation_usd": latest["total_compensation_usd"],
                "n_employees": latest["n_employees"],
                "fiscal_year": latest["fiscal_year"],
            }
    return out


def contract_team(contract_no: str):
    """Prime + subcontractors for a matched contract, lifted from its own
    fiche (export_us_sf_contracts.py) — the payee linkage. None when the
    contract has no fiche (only active ∪ sole-source ∪ top-500 by agreed get
    one); that's a coverage gap, not a false negative to paper over."""
    fiche = load_json(FICHE_DIR / f"{contract_no}.json")
    return fiche.get("team") if fiche else None


def main() -> int:
    seed = json.loads(SEED.read_text())
    depts = dept_budget_index()
    payroll = dept_payroll_index()
    contracts = load_json(SF / "contracts_active.json")
    con_rows = contracts["rows"] if contracts else []

    out_dir = CACHE / "linkage"
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = []
    for pl in seed["places"]:
        slug = pl["slug"]
        aliases = pl["aliases"]
        # An alias must be ≥6 chars to guard against generic short words
        # colliding with unrelated text (see module docstring — bare place
        # names that double as SF neighborhoods, e.g. "Chinatown", pull in
        # ~0%-precision noise). A pure-uppercase acronym of ≥4 chars (SFGH,
        # ZSFG) is exempt: hand-checked at ~100% precision (2026-07-21 audit,
        # 20/20 sample) because an all-caps 4-letter token essentially never
        # appears inside ordinary English contract/scope text.
        alias_ok = [a for a in aliases if len(a) >= 6 or (len(a) >= 4 and a.isupper() and a.isalpha())]
        # Word-boundary, not substring. A bare `alias in haystack` matched
        # "Pier 96" inside "co|pier 96|104X_PUC WSTD Copier" and attached four
        # Xerox photocopier leases to a cargo terminal; "Pier 45" and "Pier 27"
        # have the same collision waiting in any title containing "copier 45…".
        # Punctuation is normalised to spaces first so "96104X_PUC" cannot
        # weld a number onto the token before it. All-caps acronyms keep the
        # trailing edge open, as sf_place_match does — the city writes ZSFG's
        # contracts "…@ ZSFGH", and a closing \b would drop all seven of them.
        alias_rx = [(a, re.compile(rf"\b{re.escape(_norm(a))}" +
                                   ("" if (a.isupper() and a.isalpha()) else r"\b")))
                    for a in alias_ok]

        # ── archive docs from the place's IA cache ──
        # Grounding is the document's own OCR text around the alias
        # (fetch_ia_ocr.py), not the 280-char FTS fragment. A candidate is kept
        # only if that OCR yielded real context (ocr_status == "ok"): items
        # whose OCR is missing/empty, or whose alias appears only incidentally
        # so no window was extracted, are not evidence and are dropped here —
        # the snippet era kept them all on a bare keyword match.
        archive = []
        ia = load_json(CACHE / "places" / f"{slug}.json")
        if ia:
            for it in ia.get("items", []):
                if it.get("ocr_status") != "ok" or not it.get("ocr_excerpts"):
                    continue
                tier = collection_tier(it.get("collection"))
                if tier == "DENIED":
                    continue
                rel = ia_relevance(it, aliases)
                mat = ia_materiality(it)
                # DIRECT collections are San Francisco municipal paper by
                # construction, so membership carries the geography and only the
                # substance floor applies. GATED collections are multi-
                # jurisdiction, so an item must additionally prove SF context in
                # its own text — that is what separates our Washington Square
                # from Sacramento's.
                floor = rel["substantive_direct"] if tier == "DIRECT" else rel["substantive"]
                if not floor or rel["citywide_serial"]:
                    continue
                if tier == "GATED" and not (rel["sf_context"] and not rel["rival_city"]):
                    continue
                archive.append({
                    "identifier": it["identifier"],
                    "title": it["title"],
                    "creator": it.get("creator"),
                    "year": it.get("year"),
                    "pool": it["pool"],
                    "matched_alias": it.get("matched_alias"),
                    "ocr_excerpts": it["ocr_excerpts"],
                    "collection": it.get("collection"),
                    "relevance": rel,
                    "materiality": mat,
                    "url": it["url"],
                    "deep_link": f"https://archive.org/details/{it['identifier']}?q="
                                 + it.get("matched_alias", aliases[0]).replace(" ", "+"),
                })
            kept_by_pool: dict[str, int] = {}
            ranked = []
            # Both axes, not one: aboutness alone re-promotes the eloquent
            # document that decides nothing, materiality alone promotes any
            # budget book that happens to name the place.
            for d in sorted(archive, key=lambda d: -(d["relevance"]["score"]
                                                     + d["materiality"]["score"])):
                p = d["pool"]
                if kept_by_pool.get(p, 0) >= ARCHIVE_CAP_PER_POOL:
                    continue
                kept_by_pool[p] = kept_by_pool.get(p, 0) + 1
                ranked.append(d)
            archive = ranked[:ARCHIVE_CAP]

        # ── department archive shelf ──
        dept_shelf = []
        dslug = DEPT_ARCHIVE_SLUG.get(pl["owning_dept_code"])
        if dslug:
            dia = load_json(CACHE / "departments" / f"{dslug}.json")
            if dia:
                for it in dia.get("items", [])[:6]:
                    if it.get("snippet"):
                        dept_shelf.append({
                            "identifier": it["identifier"], "title": it["title"],
                            "year": it.get("year"), "pool": it["pool"],
                            "url": it["url"],
                        })

        # ── contracts naming a place alias in the title ──
        con_hits = []
        for r in con_rows:
            hay = _norm(f"{r.get('title','')} {r.get('title_plain','')}")
            hit_alias = next((a for a, rx in alias_rx if rx.search(hay)), None)
            if hit_alias:
                con_hits.append({
                    "contract_no": r["contract_no"],
                    "title": r.get("title_plain") or r.get("title"),
                    "prime": r.get("prime"),
                    "department_code": r.get("department_code"),
                    "agreed_usd": r.get("agreed_usd"),
                    "paid_usd": r.get("paid_usd"),
                    "evidence": r.get("title"),
                    "team": contract_team(r["contract_no"]),
                })
        con_hits.sort(key=lambda c: -(c.get("paid_usd") or 0))

        # ── owning department budget line ──
        budget_line = depts.get(pl["owning_dept_code"])

        # ── owning department payroll line (dept-level only — see module
        # docstring; never implied to be this place's own staff) ──
        payroll_line = payroll.get(pl["owning_dept_code"])

        n_money = (1 if budget_line else 0) + len(con_hits)
        rec = {
            "generated_at": now_iso(),
            "slug": slug,
            "name": pl["name"],
            "family": pl["family"],
            "owning_dept": pl["owning_dept"],
            "owning_dept_code": pl["owning_dept_code"],
            "aliases": aliases,
            "archive_docs": archive,
            "n_archive": len(archive),
            "dept_shelf": dept_shelf,
            "contracts": con_hits,
            "budget_line": budget_line,
            "payroll_line": payroll_line,
            "n_money_links": n_money,
        }
        (out_dir / f"{slug}.json").write_text(json.dumps(rec, indent=1, ensure_ascii=False))
        summary.append((slug, len(archive), len(con_hits), 1 if budget_line else 0))

    # print a triage-friendly summary
    print(f"{'place':38} arch con bud")
    for slug, na, nc, nb in sorted(summary, key=lambda s: -s[1]):
        flag = "OK " if (na >= 3 and (nc + nb) >= 1) else "..."
        print(f"  {flag}{slug:35} {na:3} {nc:3} {nb:3}")
    n_gateable = sum(1 for _, na, nc, nb in summary if na >= 3 and (nc + nb) >= 1)
    print(f"\n{n_gateable}/{len(summary)} places clear the archive≥3 + money≥1 bar "
          f"(before photo licensing, decided in Block C).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
