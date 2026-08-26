#!/usr/bin/env python3
"""
Build seed_us_sf_payee_identity.csv — raw SF vendor string → normalized payee.

SF vendor names are unkeyed strings: the same company appears under several
spellings ("BANK OF NEW YORK MELLON" / "BNY MELLON"), joint-venture strings and
predecessors ("TUTOR-SALIBA" before "TUTOR PERINI"). This script resolves an
identity for every vendor of mart_us_sf_payees_search (the union of each FY's
top-1,000 payees):

  1. core(name)  — uppercase, punctuation → space, leading "THE" and trailing
                   legal suffixes (INC, LLC, CORP…) dropped; exact core match
                   merges spelling variants;
  2. CURATED_CORE — the handful of reviewed JV / predecessor / rename merges.

It writes ONLY the seed (pipeline/seeds/countries/us/seed_us_sf_payee_identity.csv).
The seed is joined row-level in core_us_sf_vouchers (payee_slug / payee_name),
rolled up in mart_us_sf_payees and published by export_us_sf_payees.py — this
script never touches website/public/data/. Re-run it after a voucher sync so
new vendor strings get an identity; slugs are stable for unchanged names.

Usage:
    python pipeline/scripts/enrich/build_sf_payee_identity.py
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

from google.cloud import bigquery

ROOT = Path(__file__).resolve().parents[3]
PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = "dbt_us_marts"
SEED = ROOT / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_payee_identity.csv"

LEGAL_SUFFIX = {
    "INC", "INCORPORATED", "LLC", "L L C", "CORP", "CORPORATION", "CO",
    "COMPANY", "LP", "L P", "LLP", "LTD", "NA", "N A", "PC", "PLLC",
}

# core key → (display name, canonical core key, merge reason). Reviewed by hand.
CURATED_CORE: dict[str, tuple[str, str, str]] = {
    "TUTOR PERINI": ("Tutor Perini", "TUTOR PERINI", "Tutor Perini Corporation"),
    "TUTOR SALIBA": ("Tutor Perini", "TUTOR PERINI", "Predecessor firm Tutor-Saliba, renamed Tutor Perini (2008)"),
    "SOUTHLAND TUTOR PERINI JV": ("Tutor Perini", "TUTOR PERINI", "Southland / Tutor Perini joint venture (e.g. Central Subway)"),
    "BNY MELLON": ("Bank of New York Mellon", "BANK OF NEW YORK MELLON", "BNY Mellon spelling variant"),
    "BANK OF NEW YORK MELLON": ("Bank of New York Mellon", "BANK OF NEW YORK MELLON", "Bank of New York Mellon"),
    "BANK OF NEW YORK": ("Bank of New York Mellon", "BANK OF NEW YORK MELLON", "Bank of New York (pre-Mellon merger) spelling"),
}


def core(name: str) -> str:
    up = " " + re.sub(r"[^A-Z0-9 ]", " ", name.upper().replace("&", " AND ")) + " "
    toks = up.split()
    if toks and toks[0] == "THE":
        toks = toks[1:]
    while toks and toks[-1] in LEGAL_SUFFIX:
        toks = toks[:-1]
    return " ".join(toks)


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:70]


def title_case(name: str) -> str:
    """Human display from an ALL-CAPS vendor string, keeping short initialisms."""
    small = {"of", "and", "the", "for", "at", "in", "to", "de", "a"}
    keep = {"SF", "USA", "US", "LLC", "JV", "PUC", "MTA", "YMCA", "UCSF", "CPMC", "DBA"}
    out = []
    for w in name.split():
        if w in keep:
            out.append(w)
        elif w.lower() in small and out:
            out.append(w.lower())
        else:
            out.append(w.capitalize())
    return " ".join(out) if out else name.title()


def main() -> int:
    client = bigquery.Client(project=PROJECT_ID)
    rows = [dict(r) for r in client.query(f"""
        SELECT vendor, total_usd
        FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_us_sf_payees_search`
        ORDER BY total_usd DESC, vendor
    """).result()]

    groups: dict[str, dict] = {}
    for r in rows:
        name = r["vendor"]
        if name.upper().startswith("SINGLE PAYMENT"):
            continue  # aggregation line, not a payee
        base = core(name)
        canon = CURATED_CORE.get(base)
        if canon:
            display, ckey, reason = canon
        else:
            display, ckey, reason = None, base, None
        if len(ckey) < 4:
            continue
        g = groups.setdefault(ckey, {"display": display, "variants": []})
        if display and not g["display"]:
            g["display"] = display
        g["variants"].append((name, float(r["total_usd"] or 0), reason))

    out = []
    for ckey, g in groups.items():
        g["variants"].sort(key=lambda v: (-v[1], v[0]))
        display = g["display"] or title_case(g["variants"][0][0])
        slug = slugify(display)
        for name, total, reason in g["variants"]:
            out.append({
                "vendor": name,
                "payee_slug": slug,
                "payee_name": display,
                "core_key": ckey,
                "merge_reason": reason or "",
                "is_curated": "true" if reason else "false",
            })
    out.sort(key=lambda r: (r["payee_slug"], r["vendor"]))
    with SEED.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader(); w.writerows(out)
    n_multi = sum(1 for g in groups.values() if len(g["variants"]) > 1)
    print(f"✓ {len(out)} vendor strings → {len(groups)} payees ({n_multi} with >1 variant) → {SEED.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
