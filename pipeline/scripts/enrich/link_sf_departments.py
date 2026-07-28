#!/usr/bin/env python3
"""Generate evidence-backed archive linkage for each SF department.

The department twin of link_sf_places.py. Same machinery — collection tiers,
SF context, hit density, materiality, per-pool caps — pointed at
pipeline/cache/ia_sf/departments/ instead of .../places/.

WHY DEPARTMENT GRAIN
Government publications are authored by AGENCIES, so a department is the native
grain of the collections we hold. At place grain Democracy's Library contributed
25 usable documents against 376 SFPL ones; at department grain the raw split is
206 dl / 225 sfpl. The money spine is stronger too: only ~17% of places get any
contract hit and a place-level budget is impossible from this source, whereas
every department has budget, payroll, headcount and contracts.

WHY THE RELEVANCE RULE IS DIFFERENT HERE
At place grain the alias is a proper noun ("Coit Tower"), so mere presence is
already weak evidence of aboutness. At department grain the alias is a GENERIC
GOVERNMENT ROLE NAME — every California city has a "City Planning Commission"
and a "Department of Public Health" — and it appears in two systematically
irrelevant ways that a place alias does not:

  1. Wrong jurisdiction. "Department of Public Health" matched five Los Angeles
     County health reports; "City Planning Commission" matched the Hollywood,
     Chatsworth-Porter Ranch and West Los Angeles plans and Oakland's historic
     preservation element. The place-grain RIVAL_CITY list does not cover
     Stanislaus, Glenn, Petaluma, Modoc, Tulare, Chino or Winters, all of which
     are in this corpus, so it is widened here into RIVAL_JURISDICTION.

  2. Enumeration. A citywide agenda, salary ordinance, property valuation,
     charter draft or legislative index names EVERY department. It matches all
     of them equally and is therefore evidence about none of them. This is the
     failure the department caches show most visibly: board-of-supervisors
     returns bare "Minutes" and "Official meeting notice", the latter authored
     by the Museum and Historical Society Advisory Committee.

The signal that resolves both, and that simply does not exist at place grain, is
AUTHORSHIP. Every item carries a `creator` naming the body that wrote it. A
department is legitimately on a document in exactly two ways:

  authored_by   — the department (or its commission / board / bureau) wrote it.
                  "Annual report" by "San Francisco (Calif.). Fire Dept";
                  "Minutes of the Fire Commission" by the Fire Commission.
  subject_title — the department is named in the TITLE, i.e. the document is
                  about it. "Management audit of the Recreation and Park
                  Department"; "Performance and efficiency review : Department
                  of Public Health". This is how oversight documents — Budget
                  Analyst, Controller's City Services Auditor, Grand Jury — earn
                  their place without being authored by the department.

Neither one → the department is a passing mention in somebody else's paper, and
the item is dropped. That single gate is what the precision of this shelf rests
on; the score below only ranks what survives it.

MEASURED, 2026-07-28, before any threshold was chosen
Two hand-checked samples of 20, drawn deterministically (md5 of code+identifier)
so they can be redrawn and re-argued rather than taken on trust.

  Precision of what is KEPT — 20/20 (100%). Sample drawn from the 106 admitted
  documents. Criterion: the document is authored by, or substantially about,
  this department. Wilson 95% CI lower bound 83.9% — a 20-sample cannot
  distinguish 100% from ~85%, and the headline number should not be quoted
  without that bound.

  Correctness of what is DROPPED — 17/20 (85%). Sample drawn from the 159
  dropped candidates. The three wrong drops, all recall losses rather than
  precision failures: the SFPUC-co-authored "Citywide travel behavior survey",
  the SFPUC's own "Peninsula Watershed management plan" (blank creator, no alias
  in title), and the Board's "Parks and Recreation Committee" meeting minutes.
  Extrapolated, roughly 15% of the 159 drops — about two dozen documents — are
  losses of this kind.

REJECTED EXPERIMENT — cover-page authorship
The two SFPUC misses above share a shape: the department names itself in the
document's own front matter while the catalogue creator field is blank. A
"department pattern appears in an OCR window that also carries front-matter
markers" signal was implemented and measured against the drop set. It admitted
73 documents to recover about five: Civil Service Commission minutes onto Fire
and Public Health, Los Angeles County's "Key indicators of health" onto Public
Health, the Treasure Island and Yerba Buena EIRs onto four departments each,
Pasadena's West Gateway specific plan onto War Memorial. The front-matter
vocabulary ("department of", "commission", "by the") is simply too close to the
vocabulary of any municipal document to separate an authorship statement from a
consultation list. Not adopted. Anyone who retries this must draw a FRESH
evaluation sample — the two samples above have now been inspected and are spent
as ground truth.

KNOWN COST OF THAT CHOICE, stated rather than hidden:
  - Documents genuinely about a department but titled generically and authored
    by a consultant are lost. "Final report on the Joint Fare Prepayment
    Demonstration Design Project" (creator blank) is a real Muni document and
    does not survive.
  - "general plan" and "housing element" are treated as citywide enumerations,
    which costs City Planning its own flagship product. Precision-first is the
    brief; this is the price and it is the largest single one.
  - The upstream caches are themselves capped at 30 items per department
    (15 sfpl + 15 dl) against totals in the thousands (board-of-supervisors
    alone reports 9,457 SFPL matches), so nothing here is a census of what the
    Archive holds — it is a shelf built from a shallow slice. Public Works ends
    at ONE admitted document for exactly this reason: its 30-item slice is
    almost entirely Board of Permit Appeals minutes, Board of Supervisors
    motions and the citywide real-property register, with a single
    DPW-authored item ("Advertisement for bids"). That is a cache-depth problem
    to fix in sync_ia_sf.py, not a relevance-rule problem to loosen here.

Output: pipeline/cache/ia_sf/linkage_departments/<dept_code>.json
Usage:  python pipeline/scripts/enrich/link_sf_departments.py [--audit]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sync"))
from ia_collections import tier as collection_tier  # noqa: E402

CACHE = ROOT / "pipeline" / "cache" / "ia_sf"
SF = ROOT / "website" / "public" / "data" / "us" / "sf"
OUT_DIR = CACHE / "linkage_departments"

ARCHIVE_CAP = 14
# Per pool, never flat — a flat cap re-creates the starvation bug the place
# pipeline hit, where grounded SFPL items ate the whole budget before a single
# Democracy's Library candidate was considered.
ARCHIVE_CAP_PER_POOL = 8
MAX_BUDGET_YEAR = 2025  # latest closed year with a department breakdown

# ── the department registry ──────────────────────────────────────────────────
# archive cache slug → the SF budget department it belongs to, plus the two
# patterns the relevance gate turns on.
#
#   authority — matched against `creator`: the department and the bodies that
#               speak for it (its commission, board of trustees, bureau). Written
#               against the creator strings actually present in the cache.
#   subject   — matched against `title`: the department named as the document's
#               subject, including the short forms a title actually uses
#               ("Muni", "SFPD") which the cache's single formal alias misses.
#
# Two archive slugs map onto PUC: Hetch Hetchy Water & Power is an SFPUC
# enterprise with no budget code of its own. redevelopment-agency maps to CII —
# the Office of Community Investment & Infrastructure is the Redevelopment
# Agency's statutory successor, and the fiche should say so rather than imply
# the Agency still exists.
DEPARTMENTS: dict[str, dict] = {
    "board-of-supervisors": {
        "code": "BOS",
        "authority": r"board of supervisors",
        "subject": r"board of supervisors",
    },
    "city-planning": {
        "code": "CPC",
        "authority": r"city planning|planning dep|planning commission",
        "subject": r"city planning|planning department|planning commission",
    },
    "controller": {
        "code": "CON",
        "authority": r"office of the controller|controller'?s office|city services auditor",
        "subject": r"office of the controller|controller'?s office|city services auditor",
    },
    "fire-department": {
        "code": "FIR",
        "authority": r"fire dep|fire dept|fire commission",
        "subject": r"fire department|fire dept|fire commission|\bsffd\b",
    },
    "hetch-hetchy": {
        "code": "PUC",
        "authority": r"hetch hetchy",
        "subject": r"hetch hetchy",
    },
    "municipal-railway": {
        "code": "MTA",
        "authority": r"municipal railway|municipal transportation agency",
        "subject": r"municipal railway|municipal transportation agency|\bmuni\b",
    },
    "police-department": {
        "code": "POL",
        "authority": r"police dep|police dept|police commission",
        "subject": r"police department|police dept|police commission|\bsfpd\b",
    },
    "port": {
        "code": "PRT",
        "authority": r"port of san francisco|port commission|harbor commissioners",
        "subject": r"port of san francisco|port commission|harbor commissioners",
    },
    "public-health": {
        "code": "DPH",
        "authority": r"public health|health commission",
        "subject": r"public health|health commission|\bdph\b",
    },
    "public-library": {
        "code": "LIB",
        "authority": r"san francisco public library",
        "subject": r"public library|\bsfpl\b",
    },
    "public-utilities-commission": {
        "code": "PUC",
        "authority": r"public utilities commission|water department",
        "subject": r"public utilities commission|\bpuc\b|water department",
    },
    "public-works": {
        "code": "DPW",
        "authority": r"public works",
        "subject": r"public works|\bdpw\b",
    },
    "recreation-and-park": {
        "code": "REC",
        "authority": r"recreation and park",
        "subject": r"recreation and park",
    },
    "redevelopment-agency": {
        "code": "CII",
        "authority": r"redevelopment agency",
        "subject": r"redevelopment agency",
    },
    "war-memorial": {
        "code": "WAR",
        "authority": r"war memorial|performing arts center",
        "subject": r"war memorial",
    },
}

# ── relevance ────────────────────────────────────────────────────────────────
SF_CONTEXT = re.compile(r"san\s+francisco|\bccsf\b|\bcity\s+and\s+county\b", re.I)

# Wider than the place pipeline's RIVAL_CITY because a department alias is a
# generic role name, so it collides with every jurisdiction in the collection
# rather than only with same-named landmarks. Every entry below was observed
# producing a false positive in the 2026-07-27 department corpus.
RIVAL_JURISDICTION = re.compile(
    r"\b(sacramento|redding|eureka|reedley|fresno|stockton|modesto|bakersfield|"
    r"san\s+jose|oakland|berkeley|brisbane|daly\s+city|san\s+mateo|santa\s+clara|"
    r"los\s+angeles|san\s+diego|mountain\s+view|new\s+york|petaluma|chino|winters|"
    r"redondo\s+beach|south\s+pasadena|pasadena|tulare|modoc|glenn\s+county|"
    r"stanislaus|solano|san\s+joaquin|ventura|alameda|san\s+bernardino|"
    r"santa\s+maria|santa\s+barbara|hollywood|chatsworth|porter\s+ranch|"
    r"san\s+fernando|bunker\s+hill|mountain\s+house|long\s+beach|anaheim|"
    r"riverside|contra\s+costa|\bmarin\b|sonoma|\bnapa\b|monterey|placer|"
    r"\byolo\b|\bbutte\b|shasta|\bkern\b)\b", re.I)

# Documents that enumerate every department. They match all fifteen equally and
# are therefore evidence about none of them. Extends the place-grain list with
# the enumerations that only surface at department grain: the legislative index,
# the real-property register (which the place list only caught in its
# "Valuation of…" form), the charter drafts and their summaries, the citywide
# annual compendium, and the strategies that survey every agency in turn.
#
# "budget analyst" is deliberately NOT here, unlike the place-grain list: at
# department grain a Budget Analyst report about a department is exactly the kind
# of accountability document this shelf exists to surface.
CITYWIDE_SERIAL = re.compile(
    r"valuation of real property|real property owned by|annual salary ordinance|"
    r"proposed charter|charter of the city|summary of the san francisco city|"
    r"municipal reports|legislation introduced|housing element|general plan|"
    r"municipal code|climate action strategy|"
    r"comprehensive housing affordability strategy|"
    r"official opinions of", re.I)
# NOT here, though an earlier draft had them: "citywide travel behavior survey"
# and "multi-hazard functional plan". Neither enumerates departments — the first
# is a joint study co-authored by City Planning, the SFPUC and the County
# Transportation Authority, the second is an Office of Emergency Services plan.
# Both are correctly dropped by the authorship gate below; labelling them
# enumerations recorded a false reason, which is worse than no reason.

# ── materiality (identical to link_sf_places.py — deliberately shared logic) ──
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
    r"economic impact|impact analysis|analysis of the|redevelopment|"
    r"annual report|financial (report|statements)|performance", re.I)
LOW_GENRE = re.compile(
    r"^\s*\[?(agenda|agendas|minutes|calendar|notice of meeting|official meeting notice|"
    r"agendas and minutes|minutes and agendas|calendar of events|notice|bulletin|"
    r"weekly bulletin|newsletter|motion|ordinance|opinion|summary of the regular meeting)"
    r"[\s/,:-]*(and calendar)?\s*$", re.I)


def ia_materiality(it: dict) -> dict:
    """Does this document carry decision-relevant substance for a reader?

    Genre read off the title carries most of the weight; the vocabulary signals
    only break ties, because a 700-char OCR window scores at random in the middle
    of the ranking while a title is stable. `annual report` and `financial
    statements` are added to HIGH_GENRE relative to the place-grain version: at
    department grain a department's own annual report is the single most
    valuable thing on the shelf, whereas at place grain it was somebody else's.
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


def ia_relevance(it: dict, dept: dict) -> dict:
    """Is this document the department's own paper, or about the department?

    Returns every component so the gate below and a human auditor read the same
    numbers. `authored_by` and `subject_title` are the gate; the rest ranks.
    """
    ex = " ".join(it.get("ocr_excerpts") or [])
    hits = len(it.get("ocr_excerpts") or [])
    chars = max(it.get("ocr_chars") or 0, 1)
    title = it.get("title") or ""
    creator = it.get("creator") or ""

    authored_by = bool(dept["authority_re"].search(creator))
    subject_title = bool(dept["subject_re"].search(title))
    sf_context = bool(SF_CONTEXT.search(ex)) or bool(SF_CONTEXT.search(creator))
    # Title or creator, not body text: a Los Angeles plan cites San Francisco
    # constantly, so a body-text test would clear it. Who wrote it and what it is
    # called are the only jurisdiction-stable fields we have.
    rival = bool(RIVAL_JURISDICTION.search(f"{title} {creator}"))
    citywide = bool(CITYWIDE_SERIAL.search(title))
    density = hits / chars * 100_000

    score = (
        (5.0 if authored_by else 0.0)
        + (4.0 if subject_title else 0.0)
        + (2.0 if sf_context else 0.0)
        + min(hits, 6) * 0.5
        + min(density, 4.0)
    )
    return {"score": round(score, 2), "authored_by": authored_by,
            "subject_title": subject_title, "sf_context": sf_context,
            "rival_jurisdiction": rival, "citywide_serial": citywide,
            "hits": hits, "density": round(density, 2)}


def gate(it: dict, rel: dict, tier: str) -> str | None:
    """Return the reason this item is NOT admissible, or None if it is.

    Kept as a reason string rather than a boolean so --audit can show exactly
    which rule fired on every dropped item; a silent filter cannot be argued
    with.
    """
    if tier == "DENIED":
        return "collection not admissible"
    if rel["citywide_serial"]:
        return "citywide enumeration (names every department)"
    if rel["rival_jurisdiction"]:
        return "other jurisdiction in title/creator"
    if not (rel["authored_by"] or rel["subject_title"]):
        return "passing mention (not authored by, not about, this department)"
    if tier == "GATED" and not rel["sf_context"]:
        return "multi-jurisdiction collection, no SF context"
    return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


def dept_budget_index() -> dict[str, dict]:
    b = load_json(SF / f"budget_breakdown_{MAX_BUDGET_YEAR}.json")
    out = {}
    if b:
        for d in b["departments"]["spending"]:
            out[d["code"]] = {"code": d["code"],
                              "name": d.get("display_name") or d.get("label"),
                              "total_usd": d["total_usd"],
                              "fiscal_year": MAX_BUDGET_YEAR}
    return out


def dept_payroll_index() -> dict[str, dict]:
    p = load_json(SF / "payroll_by_dept_year.json")
    out = {}
    if p:
        for d in p.get("departments", []):
            series = d.get("series") or []
            if not series:
                continue
            latest = max(series, key=lambda s: s["fiscal_year"])
            out[d["department_code"]] = {
                "code": d["department_code"], "name": d.get("department"),
                "total_compensation_usd": latest["total_compensation_usd"],
                "n_employees": latest["n_employees"],
                "fiscal_year": latest["fiscal_year"]}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", action="store_true",
                    help="print every candidate with its keep/drop reason")
    args = ap.parse_args()

    for d in DEPARTMENTS.values():
        d["authority_re"] = re.compile(d["authority"], re.I)
        d["subject_re"] = re.compile(d["subject"], re.I)

    budgets = dept_budget_index()
    payroll = dept_payroll_index()
    contracts = load_json(SF / "contracts_active.json")
    con_rows = contracts["rows"] if contracts else []

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # code → accumulated candidates (PUC receives two archive shelves)
    by_code: dict[str, dict] = {}
    n_seen = n_kept = 0
    drop_reasons: dict[str, int] = {}

    for slug, dept in DEPARTMENTS.items():
        ia = load_json(CACHE / "departments" / f"{slug}.json")
        if not ia:
            print(f"  ! no cache for {slug}", file=sys.stderr)
            continue
        code = dept["code"]
        acc = by_code.setdefault(code, {"code": code, "archive_slugs": [],
                                        "aliases": [], "docs": {}})
        acc["archive_slugs"].append(slug)
        acc["aliases"].extend(ia.get("aliases") or [])

        if args.audit:
            print(f"\n{'='*100}\n{slug}  →  {code}")

        for it in ia.get("items", []):
            # Grounding is the document's own OCR around the alias
            # (fetch_ia_ocr.py), not the 280-char FTS fragment. No OCR window,
            # no evidence — the snippet era kept these on a bare keyword match.
            if it.get("ocr_status") != "ok" or not it.get("ocr_excerpts"):
                continue
            n_seen += 1
            tier = collection_tier(it.get("collection"))
            rel = ia_relevance(it, dept)
            mat = ia_materiality(it)
            reason = gate(it, rel, tier)
            if args.audit:
                mark = "KEEP" if reason is None else "drop"
                print(f"  {mark} [{it['pool']:4}] r={rel['score']:5.1f} m={mat['score']:5.1f} "
                      f"a={int(rel['authored_by'])} s={int(rel['subject_title'])} "
                      f"| {(it.get('title') or '')[:72]}")
                print(f"        creator={(it.get('creator') or '(none)')[:80]}")
                if reason:
                    print(f"        ↳ {reason}")
            if reason:
                drop_reasons[reason] = drop_reasons.get(reason, 0) + 1
                continue
            n_kept += 1
            alias = it.get("matched_alias") or (ia.get("aliases") or [""])[0]
            acc["docs"][it["identifier"]] = {
                "identifier": it["identifier"],
                "title": it["title"],
                "creator": it.get("creator"),
                "year": it.get("year"),
                "pool": it["pool"],
                "collection": it.get("collection"),
                "matched_alias": alias,
                "ocr_excerpts": it["ocr_excerpts"],
                "ocr_chars": it.get("ocr_chars"),
                "relevance": rel,
                "materiality": mat,
                "url": it["url"],
                # Opens the scan with the matched phrase highlighted, so a reader
                # lands on the page the claim came from rather than page 1 of a
                # 1,000-page volume.
                "deep_link": f"https://archive.org/details/{it['identifier']}?q="
                             + alias.replace(" ", "+"),
            }

    summary = []
    for code, acc in by_code.items():
        docs = list(acc["docs"].values())
        # Rank on both axes: aboutness alone re-promotes the eloquent document
        # that decides nothing; materiality alone promotes any budget book that
        # happens to name the department.
        docs.sort(key=lambda d: -(d["relevance"]["score"] + d["materiality"]["score"]))
        kept_by_pool: dict[str, int] = {}
        ranked = []
        for d in docs:
            p = d["pool"]
            if kept_by_pool.get(p, 0) >= ARCHIVE_CAP_PER_POOL:
                continue
            kept_by_pool[p] = kept_by_pool.get(p, 0) + 1
            ranked.append(d)
        ranked = ranked[:ARCHIVE_CAP]

        n_contracts = sum(1 for r in con_rows if r.get("department_code") == code)
        rec = {
            "generated_at": now_iso(),
            "department_code": code,
            "dept_slug": code.lower(),
            "archive_slugs": acc["archive_slugs"],
            "aliases": sorted(set(acc["aliases"])),
            "archive_docs": ranked,
            "n_archive": len(ranked),
            "n_candidates_considered": len(docs),
            "pools": {p: sum(1 for d in ranked if d["pool"] == p)
                      for p in sorted({d["pool"] for d in ranked})},
            # Department figures, carried only so the summary below can rank and
            # so the export knows the fiche has a money spine to sit the shelf
            # beside. They are NOT the documents' figures and must never be
            # rendered as belonging to one.
            "dept_money_context": {
                "note": "Department-level figures. Not attributable to any "
                        "document, programme or place on this shelf.",
                "budget_line": budgets.get(code),
                "payroll_line": payroll.get(code),
                "n_active_contracts": n_contracts,
            },
        }
        (OUT_DIR / f"{code.lower()}.json").write_text(
            json.dumps(rec, indent=1, ensure_ascii=False))
        summary.append((code, len(ranked), rec["pools"], len(docs), n_contracts))

    print(f"\n{'dept':6} kept/cand  pools                       contracts")
    for code, nk, pools, ncand, ncon in sorted(summary, key=lambda s: -s[1]):
        flag = "OK " if nk >= 3 else "..."
        print(f"  {flag}{code:5} {nk:3}/{ncand:<3}   {str(pools):28} {ncon:5}")
    print(f"\n{n_kept}/{n_seen} OCR-grounded candidates admitted "
          f"({n_kept / max(n_seen, 1) * 100:.0f}%).")
    print("drops by rule:")
    for r, n in sorted(drop_reasons.items(), key=lambda x: -x[1]):
        print(f"  {n:4}  {r}")
    n_pub = sum(1 for _, nk, _, _, _ in summary if nk >= 3)
    print(f"\n{n_pub}/{len(summary)} departments clear archive≥3.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
