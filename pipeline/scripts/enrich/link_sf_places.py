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
    is the contract title itself.
  - budget_line  : the owning department's latest-year budget total (structural
    link: the place is operated by department D, whose budget is $X).

No geo-radius is ever asserted — the money data has no geography column. What
genuinely belongs (operator relationships, grants to on-site nonprofits) is
decided in Block C when the fiche is written and gated; this step only
proposes, always with the quote attached. Output feeds export_sf_places.py.

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


def main() -> int:
    seed = json.loads(SEED.read_text())
    depts = dept_budget_index()
    contracts = load_json(SF / "contracts_active.json")
    con_rows = contracts["rows"] if contracts else []

    out_dir = CACHE / "linkage"
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = []
    for pl in seed["places"]:
        slug = pl["slug"]
        aliases = pl["aliases"]
        alias_low = [a.lower() for a in aliases]

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
            hit_alias = next((a for a in alias_low if len(a) >= 6 and a in hay), None)
            if hit_alias:
                con_hits.append({
                    "contract_no": r["contract_no"],
                    "title": r.get("title_plain") or r.get("title"),
                    "prime": r.get("prime"),
                    "department_code": r.get("department_code"),
                    "agreed_usd": r.get("agreed_usd"),
                    "paid_usd": r.get("paid_usd"),
                    "evidence": r.get("title"),
                })
        con_hits.sort(key=lambda c: -(c.get("paid_usd") or 0))

        # ── owning department budget line ──
        budget_line = depts.get(pl["owning_dept_code"])

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
