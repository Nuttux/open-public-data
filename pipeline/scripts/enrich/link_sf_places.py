#!/usr/bin/env python3
"""Generate evidence-backed linkage candidates for each SF place.

Stage (i) of the place linkage — cheap candidate generation. For every seed
place it assembles, each item carrying the exact evidence that justifies it:

  - archive_docs : Internet Archive items whose full text matched a place
    alias (from the sync_ia_sf.py cache), with the highlighted OCR snippet as
    the evidence quote. Pool-labelled (sfpl / dl) so the source line can honour
    the doctrine (SFPL scans are NOT "Democracy's Library").
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
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
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

ARCHIVE_CAP = 14
MAX_BUDGET_YEAR = 2025  # latest closed with dept breakdown
FICHE_DIR = SF / "contracts" / "fiche"


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
        alias_low = [a.lower() for a in alias_ok]

        # ── archive docs from the place's IA cache ──
        archive = []
        ia = load_json(CACHE / "places" / f"{slug}.json")
        if ia:
            for it in ia.get("items", []):
                if not it.get("snippet"):
                    continue
                archive.append({
                    "identifier": it["identifier"],
                    "title": it["title"],
                    "creator": it.get("creator"),
                    "year": it.get("year"),
                    "pool": it["pool"],
                    "matched_alias": it.get("matched_alias"),
                    "snippet": it["snippet"],
                    "url": it["url"],
                    "deep_link": f"https://archive.org/details/{it['identifier']}?q="
                                 + it.get("matched_alias", aliases[0]).replace(" ", "+"),
                })
            archive = archive[:ARCHIVE_CAP]

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
            hay = f"{r.get('title','')} {r.get('title_plain','')}".lower()
            hit_alias = next((a for a in alias_low if a in hay), None)
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
