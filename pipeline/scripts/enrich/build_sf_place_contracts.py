#!/usr/bin/env python3
"""Build the place↔contract crosswalk seed (Block 6C, docs/us/block-studies/6-lieux.md).

Phrase-matches prime-contract titles (core_us_sf_contracts) to seed places by
alias (sf_place_match) — the same evidence-gated matcher the facility/bond
crosswalks use, with the SFGH/ZSFG acronym prefix handled. One reviewed row per
(place, contract). Feeds two things:

  - contract rows in mart_us_sf_place_capital (amount_measure 'contract_paid')
  - the PAYEE CHAIN: mart_us_sf_place_payees joins these contract_nos to
    vouchers to reconstruct who was paid for work at the place.

Precision guard: alias must be ≥6 chars or an all-caps acronym; matched on
contract_title only (scope_of_work is noisier). Bare neighborhood aliases are
excluded upstream in the seed. Contract `paid` and bond `expended` are the same
money in different ledgers — the capital mart never sums across them.

Output: seed_us_sf_place_contracts.csv (reviewed, then dbt seed).

Usage: python pipeline/scripts/enrich/build_sf_place_contracts.py
"""

from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path

from sf_place_match import load_places, match_place

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_place_contracts.csv"
CORE = "open-data-france-484717.dbt_us_analytics.core_us_sf_contracts"

# Departments that build/lease FOR other departments — a contract under one of
# these can legitimately name any place. Used to gate WEAK aliases (bare
# neighborhood/street names like "Glen Park", "Laguna Honda") which otherwise
# match the library / BART / afterschool contract that merely shares the name.
BUILDER_DEPTS = {"DPW", "GEN", "ADM", "GSA"}


def alias_is_strong(alias: str, place: dict) -> bool:
    """A strong alias is self-disambiguating: an all-caps acronym, a ≥3-word
    phrase, or the place's own full name. Weak aliases (short neighborhood
    names) must be corroborated by the contract's department."""
    if alias.isupper() and alias.isalpha():
        return True
    if len(alias.split()) >= 3:
        return True
    return alias.lower() == place["name"].lower()


def bq_json(query: str) -> list[dict]:
    out = subprocess.run(
        ["bq", "query", "--use_legacy_sql=false", "--format=json", "--max_rows=40000", query],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main() -> int:
    places = load_places()
    contracts = bq_json(f"""
        SELECT contract_no,
               ANY_VALUE(contract_title)   AS contract_title,
               ANY_VALUE(department_code)  AS department_code,
               ANY_VALUE(prime_contractor) AS prime_contractor,
               MAX(agreed_amt)             AS agreed_amt,
               MAX(pmt_amt)                AS paid_amt
        FROM `{CORE}`
        WHERE is_prime_contractor_row AND contract_title IS NOT NULL
        GROUP BY contract_no
    """)

    rows = []
    dropped_weak = 0
    for c in contracts:
        m = match_place(c["contract_title"], places)
        if not m:
            continue
        pl, ev = m
        # Weak-alias guard: a bare neighborhood/street alias must be corroborated
        # by the contract's department (the place's own dept, or a builder dept
        # that works for everyone). Strong aliases (acronyms/full names) pass.
        if not alias_is_strong(ev, pl):
            dept = c.get("department_code") or ""
            if dept != pl["owning_dept_code"] and dept not in BUILDER_DEPTS:
                dropped_weak += 1
                continue
        rows.append({
            "place_slug": pl["slug"],
            "contract_no": c["contract_no"],
            "contract_title": c["contract_title"],
            "department_code": c.get("department_code") or "",
            "prime_contractor": c.get("prime_contractor") or "",
            "agreed_usd": c.get("agreed_amt") or "",
            "paid_usd": c.get("paid_amt") or "",
            "match_evidence": ev,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cols = ["place_slug", "contract_no", "contract_title", "department_code",
            "prime_contractor", "agreed_usd", "paid_usd", "match_evidence"]
    with OUT.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["place_slug"], -(float(r["paid_usd"] or 0)))))

    n_places = len({r["place_slug"] for r in rows})
    print(f"Wrote {len(rows)} contract rows for {n_places} places "
          f"(dropped {dropped_weak} weak-alias/dept-mismatch) → {OUT.name}")
    from collections import Counter
    cc = Counter(r["place_slug"] for r in rows)
    print("  most contracts:", cc.most_common(6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
