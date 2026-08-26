#!/usr/bin/env python3
"""
Export mart_us_sf_payees → website/public/data/us/sf/payees/{index.json, <slug>.json, _vendor_slug_map.json}

The normalized SF payees (top 200 by lifetime dollars). Identity (which raw
vendor strings are one payee) is a seed built by
scripts/enrich/build_sf_payee_identity.py, joined row-level in
core_us_sf_vouchers and rolled up in mart_us_sf_payees — every dollar on a
fiche comes from that mart. This script only assembles the fiche with the
side inputs the page also shows:

  - pipeline/cache/us_sf/payee_profiles.json      (export_us_sf.py, from
    mart_us_sf_payee_profile): "what the City pays them for", merged across
    the payee's spelling variants;
  - website/public/data/us/sf/contracts_active.json (export_us_sf_contracts.py):
    active contracts held, matched on the prime's core name;
  - pipeline/cache/enrichment/sf_payee_identity.json (enrich_sf_payee_identity.py):
    the grounded one-line description per payee, when one was found.

Replaces normalize_sf_payees.py (which grouped the exported JSON in Python
and wrote straight to public/data — layering rule E5).

Usage:
    python pipeline/scripts/export/export_us_sf_payees.py
    python pipeline/scripts/export/export_us_sf_payees.py --marts-dataset dbt_us_dev_local_marts --out /tmp/payees
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

ROOT = Path(__file__).resolve().parents[3]
PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = "dbt_us_marts"
SF = ROOT / "website" / "public" / "data" / "us" / "sf"
OUT = SF / "payees"
PROFILES = ROOT / "pipeline" / "cache" / "us_sf" / "payee_profiles.json"
IDENTITY = ROOT / "pipeline" / "cache" / "enrichment" / "sf_payee_identity.json"
CONTRACTS = SF / "contracts_active.json"
SOURCE_PIPELINE = (
    "raw.us_sf_vouchers → stg → core_us_sf_vouchers (+ seed_us_sf_payee_identity) "
    "→ mart_us_sf_payees → export_us_sf_payees.py"
)

LEGAL_SUFFIX = {
    "INC", "INCORPORATED", "LLC", "L L C", "CORP", "CORPORATION", "CO",
    "COMPANY", "LP", "L P", "LLP", "LTD", "NA", "N A", "PC", "PLLC",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def core(name: str) -> str:
    """Same normalization as build_sf_payee_identity.py — used only to match
    a contract's prime string to a payee's spelling variants."""
    up = " " + re.sub(r"[^A-Z0-9 ]", " ", name.upper().replace("&", " AND ")) + " "
    toks = up.split()
    if toks and toks[0] == "THE":
        toks = toks[1:]
    while toks and toks[-1] in LEGAL_SUFFIX:
        toks = toks[:-1]
    return " ".join(toks)


def merge_profiles(variant_names: list[str], profiles: dict[str, dict]) -> dict | None:
    """Fold the per-raw-vendor rollups of every spelling variant into one
    (summed cell by cell, keyed on codes). n_departments / n_categories are a
    FLOOR when more than one variant is merged — the flag travels with it."""
    present = [profiles[v] for v in variant_names if v in profiles]
    if not present:
        return None
    depts: dict[str, dict] = {}
    cats: dict[str, dict] = {}
    for p in present:
        for d in p.get("departments") or []:
            key = d["department_code"] or d["department"]
            cell = depts.setdefault(key, {"department": d["department"], "department_code": d["department_code"], "usd": 0.0, "n_vouchers": 0})
            cell["usd"] += d["usd"] or 0.0
            cell["n_vouchers"] += d["n_vouchers"] or 0
        for c in p.get("categories") or []:
            cell = cats.setdefault(c["code"], {"code": c["code"], "label": c["label"], "spend_class": c["spend_class"], "usd": 0.0, "n_vouchers": 0})
            cell["usd"] += c["usd"] or 0.0
            cell["n_vouchers"] += c["n_vouchers"] or 0
    recent_fys = [p["recent_fy"] for p in present if p.get("recent_fy") is not None]
    recent_fy = max(recent_fys) if recent_fys else None
    recent_lines: dict[tuple, dict] = {}
    recent_total = 0.0
    n_recent_lines = 0
    if recent_fy is not None:
        for p in present:
            if p.get("recent_fy") != recent_fy:
                continue
            recent_total += p.get("recent_total_usd") or 0.0
            n_recent_lines += p.get("n_recent_lines") or 0
            for l in p.get("recent_lines") or []:
                key = (l["department_code"], l["label"])
                cell = recent_lines.setdefault(key, {**l, "usd": 0.0, "n_vouchers": 0})
                cell["usd"] += l["usd"] or 0.0
                cell["n_vouchers"] += l["n_vouchers"] or 0
    multi = len(present) > 1
    rank = lambda rows: sorted(rows, key=lambda r: -(r["usd"] or 0.0))
    return {
        "n_vouchers": sum((p.get("n_vouchers") or 0) for p in present),
        "departments": [{**d, "usd": round(d["usd"], 2)} for d in rank(depts.values())],
        "n_departments": max((p.get("n_departments") or 0) for p in present),
        "categories": [{**c, "usd": round(c["usd"], 2)} for c in rank(cats.values())],
        "n_categories": max((p.get("n_categories") or 0) for p in present),
        "counts_are_floor": multi,
        "recent_fy": recent_fy,
        "recent_total_usd": round(recent_total, 2),
        "n_recent_lines": n_recent_lines,
        "recent_lines": [{**l, "usd": round(l["usd"], 2)} for l in rank(recent_lines.values())],
    }


def _ts(v) -> str | None:
    return v.isoformat() if hasattr(v, "isoformat") else (str(v) if v is not None else None)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--marts-dataset", default=MARTS_DATASET)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    client = bigquery.Client(project=PROJECT_ID)
    payees = [dict(r) for r in client.query(f"""
        SELECT * FROM `{PROJECT_ID}.{args.marts_dataset}.mart_us_sf_payees`
        ORDER BY rank_all_time
    """).result()]
    if not payees:
        raise RuntimeError("mart_us_sf_payees is empty")
    ref = payees[0]
    as_of = _ts(ref["source_rows_updated_at"])
    source = {
        "name": ref["source_name"], "dataset_id": ref["source_dataset_id"],
        "source_url": ref["source_url"], "attribution": ref["source_attribution"], "rows_updated_at": as_of,
    }

    profiles_doc = json.loads(PROFILES.read_text()) if PROFILES.exists() else {}
    profiles: dict[str, dict] = profiles_doc.get("profiles", {})
    if not profiles:
        print(f"⚠ {PROFILES.name} absent — fiches built without the 'what they're paid for' sections (run export_us_sf.py first)")
    identities: dict[str, dict] = json.loads(IDENTITY.read_text()).get("payees", {}) if IDENTITY.exists() else {}
    contracts = json.loads(CONTRACTS.read_text()) if CONTRACTS.exists() else {"rows": []}
    con_by_core: dict[str, list] = {}
    for r in contracts["rows"]:
        con_by_core.setdefault(core(r["prime"]), []).append(r)

    args.out.mkdir(parents=True, exist_ok=True)
    index = []
    vendor_map: dict[str, str] = {}
    for p in payees:
        slug = p["slug"]
        variants = [{"name": v["name"], "total": round(float(v["total"]), 2)} for v in p["variants"]]
        merges = [{"variant": v["name"], "reason": v["merge_reason"]} for v in p["variants"] if v.get("merge_reason")]
        cores = {core(v["name"]) for v in variants}
        held = []
        for ck in cores:
            for r in con_by_core.get(ck, []):
                held.append({
                    "contract_no": r["contract_no"],
                    "title": r.get("title_plain") or r.get("title"),
                    "department": r.get("department"),
                    "department_code": r.get("department_code"),
                    "agreed_usd": r.get("agreed_usd"),
                    "paid_usd": r.get("paid_usd"),
                    "sole_source": r.get("sole_source"),
                })
        held.sort(key=lambda c: -(c.get("paid_usd") or 0))
        profile = merge_profiles([v["name"] for v in variants], profiles)
        by_year = {str(int(y["fiscal_year"])): round(float(y["usd"]), 2) for y in (p["by_year"] or [])}
        fiche = {
            "generated_at": now_iso(),
            "source_pipeline": SOURCE_PIPELINE,
            "as_of": as_of,
            "unit": "USD",
            "slug": slug,
            "name": p["name"],
            "kind": p["kind"],
            "is_non_profit": bool(p["is_non_profit"]),
            "total_paid_usd": round(float(p["total_paid_usd"]), 2),
            "n_years": int(p["n_years"]),
            "first_year": int(p["first_year"]) if p["first_year"] is not None else None,
            "last_year": int(p["last_year"]) if p["last_year"] is not None else None,
            "by_year": by_year,
            # top paying departments by dollars (names only, for the row chips)
            "top_departments": [d["department"] for d in (p["top_departments"] or [])][:4],
            "profile": profile,
            "identity": identities.get(slug) if (identities.get(slug) or {}).get("description") else None,
            "contracts_held": held[:40],
            "n_contracts_held": len(held),
            "variants": variants,
            "n_variants": int(p["n_variants"]),
            "merges": merges,
            "source": source,
        }
        (args.out / f"{slug}.json").write_text(json.dumps(fiche, indent=1, ensure_ascii=False))
        index.append({
            "slug": slug, "name": p["name"], "kind": p["kind"],
            "total_paid_usd": round(float(p["total_paid_usd"]), 2),
            "n_variants": int(p["n_variants"]),
            "n_contracts_held": len(held),
            "last_year": int(p["last_year"]) if p["last_year"] is not None else None,
        })
        for v in variants:
            vendor_map[v["name"]] = slug

    index_doc = {
        "generated_at": now_iso(),
        "source_pipeline": SOURCE_PIPELINE,
        "as_of": as_of,
        "unit": "USD",
        "count": len(index),
        "note": (
            "Top payees by lifetime dollars paid, name-normalized (exact core "
            "match + curated JV/predecessor merges). Payees outside this set "
            "stay unkeyed and must render as plain text, never as links."
        ),
        "payees": index,
    }
    (args.out / "index.json").write_text(json.dumps(index_doc, indent=1, ensure_ascii=False))
    (args.out / "_vendor_slug_map.json").write_text(json.dumps(vendor_map, indent=1, ensure_ascii=False))
    n_multi = sum(1 for p in payees if int(p["n_variants"]) > 1)
    print(f"✓ {len(index)} payees → {args.out}  ({n_multi} with >1 variant merged)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
