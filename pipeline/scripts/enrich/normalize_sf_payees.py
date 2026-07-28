#!/usr/bin/env python3
"""Normalize San Francisco's top payees and emit per-payee JSON.

SF vendor names are unkeyed strings — the same company appears under several
spellings ("BANK OF NEW YORK MELLON" / "BNY MELLON"), joint-venture strings,
and predecessors ("TUTOR-SALIBA" before "TUTOR PERINI"). Paris never had this
problem (SIRET keys everything). This builds a conservative normalized layer
over the top ~200 payees by lifetime dollars:

  - deterministic merge: identical name-core after upper-casing, punctuation
    removal and trailing legal-suffix stripping (INC / LLC / CO …). Exact core
    match only — never a fuzzy/substring merge (that would fold distinct
    entities), so the long tail stays unkeyed.
  - a small CURATED alias table for the JV / predecessor cases the recon
    verified, each merge stamped with its reason as evidence.

Every merge records the variant strings and their dollar totals as evidence.
Attaches, per payee: lifetime + per-year paid (from payees_search.json), the
bucket/kind and top departments (from top_payees.json), and the active
contracts it holds (join on contracts_active.json prime, same core match) —
the raw material for the A2 payee fiches and D paper-trail chips.

Output: website/public/data/us/sf/payees/index.json + payees/<slug>.json

Usage: python pipeline/scripts/enrich/normalize_sf_payees.py [--top 200]
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SF = ROOT / "website" / "public" / "data" / "us" / "sf"
OUT = SF / "payees"
# Pipeline intermediate written by export_us_sf.py (mart_us_sf_payee_profile):
# per-RAW-vendor department / category / recent-year rollups. Optional — if it
# is absent the fiches still build, just without the "what they're paid for"
# sections, so a checkout without a BigQuery run is not blocked.
PROFILES = ROOT / "pipeline" / "cache" / "us_sf" / "payee_profiles.json"
# Who each payee IS (IRS registry / grounded web search), written by
# enrich_sf_payee_identity.py. Read HERE rather than patched onto the fiches
# afterwards: these files are rebuilt from scratch on every run, so anything
# applied after the fact is destroyed by the next one.
IDENTITY = ROOT / "pipeline" / "cache" / "enrichment" / "sf_payee_identity.json"

LEGAL_SUFFIX = {
    "INC", "INCORPORATED", "LLC", "L L C", "CORP", "CORPORATION", "CO",
    "COMPANY", "LP", "L P", "LLP", "LTD", "NA", "N A", "PC", "PLLC",
}

# Curated canonical merges the recon verified — matched on the EXACT
# name-core (after normalize()), never a loose substring: a substring rule
# folded "SOUTHLAND INDUSTRIES" (a distinct firm) and separate bonding
# co-payees into Tutor Perini, which is precisely the guess-merge to avoid.
# Only the precise predecessor / JV / spelling strings are listed here; every
# merge stamps its reason as evidence.
CURATED_CORE: dict[str, tuple[str, str, str]] = {
    "TUTOR PERINI": ("Tutor Perini", "TUTOR PERINI", "Tutor Perini Corporation"),
    "TUTOR SALIBA": ("Tutor Perini", "TUTOR PERINI", "Predecessor firm Tutor-Saliba, renamed Tutor Perini (2008)"),
    "SOUTHLAND TUTOR PERINI JV": ("Tutor Perini", "TUTOR PERINI", "Southland / Tutor Perini joint venture (e.g. Central Subway)"),
    "BNY MELLON": ("Bank of New York Mellon", "BANK OF NEW YORK MELLON", "BNY Mellon spelling variant"),
    "BANK OF NEW YORK MELLON": ("Bank of New York Mellon", "BANK OF NEW YORK MELLON", "Bank of New York Mellon"),
    "BANK OF NEW YORK": ("Bank of New York Mellon", "BANK OF NEW YORK MELLON", "Bank of New York (pre-Mellon merger) spelling"),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def merge_profiles(variant_names: list[str], profiles: dict[str, dict]) -> dict | None:
    """
    Fold the per-RAW-vendor rollups of every spelling variant into one.

    A normalized payee is several Controller strings ("BANK OF NEW YORK" /
    "BNY MELLON"); their rollups must be summed cell by cell or the fiche
    would show one spelling's departments and drop the other's money.

    Keys: department_code for departments, sub-object code for categories —
    never the display label, which the FY2018 migration re-cased.

    n_departments / n_categories are a FLOOR when more than one variant is
    merged: each variant reports its own distinct count and the union cannot
    be recovered from the truncated top-8 lists. The flag travels with the
    number so the fiche can say "at least N" rather than assert a total it
    does not have.
    """
    present = [profiles[v] for v in variant_names if v in profiles]
    if not present:
        return None

    depts: dict[str, dict] = {}
    cats: dict[str, dict] = {}
    for p in present:
        for d in p.get("departments") or []:
            key = d["department_code"] or d["department"]
            cell = depts.setdefault(
                key, {"department": d["department"], "department_code": d["department_code"], "usd": 0.0, "n_vouchers": 0}
            )
            cell["usd"] += d["usd"] or 0.0
            cell["n_vouchers"] += d["n_vouchers"] or 0
        for c in p.get("categories") or []:
            cell = cats.setdefault(
                c["code"], {"code": c["code"], "label": c["label"], "spend_class": c["spend_class"], "usd": 0.0, "n_vouchers": 0}
            )
            cell["usd"] += c["usd"] or 0.0
            cell["n_vouchers"] += c["n_vouchers"] or 0

    # Recent lines: the latest closed FY any variant reached, merging only the
    # variants that actually reported that year (an older variant's last year
    # is a different year and must not be blended into it).
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
        # Voucher count is summed, not maxed: a voucher belongs to exactly one
        # spelling, so the variants partition it (unlike the distinct-entity
        # counts below, which overlap and can only be a floor).
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=200)
    args = ap.parse_args()

    search = json.loads((SF / "payees_search.json").read_text())
    top_payees = json.loads((SF / "top_payees.json").read_text())
    contracts = json.loads((SF / "contracts_active.json").read_text())
    profiles_doc = json.loads(PROFILES.read_text()) if PROFILES.exists() else {}
    profiles: dict[str, dict] = profiles_doc.get("profiles", {})
    if not profiles:
        print(f"⚠ {PROFILES.name} absent — fiches built without the "
              f"'what they're paid for' sections (run export_us_sf.py first)")
    identities: dict[str, dict] = (
        json.loads(IDENTITY.read_text()).get("payees", {}) if IDENTITY.exists() else {}
    )

    # bucket + dept lookup by RAW vendor string (from the classified top-100s)
    vinfo: dict[str, dict] = {}
    for yd in top_payees["years"].values():
        for p in yd.get("payees", []):
            v = p["vendor"]
            if v not in vinfo:
                vinfo[v] = {
                    "bucket": p.get("bucket"),
                    "dept": p.get("top_department"),
                    "np": p.get("is_non_profit"),
                }
            elif p.get("bucket") and vinfo[v]["bucket"] in (None, "other"):
                vinfo[v]["bucket"] = p.get("bucket")

    # contracts grouped by prime core
    con_by_core: dict[str, list] = {}
    for r in contracts["rows"]:
        con_by_core.setdefault(core(r["prime"]), []).append(r)

    # ── merge payees ──
    groups: dict[str, dict] = {}
    for row in search["data"]:
        name = row["name"]
        if name.upper().startswith("SINGLE PAYMENT"):
            continue  # aggregation line, not a payee
        base = core(name)
        canon = CURATED_CORE.get(base)
        if canon:
            display, ckey, reason = canon
            merge_reason = reason
        else:
            ckey = base
            display, merge_reason = None, None
        if len(ckey) < 4:
            continue
        g = groups.setdefault(ckey, {
            "core": ckey, "display": display, "total": 0.0,
            "byYear": {}, "variants": [], "merges": [],
        })
        if display and not g["display"]:
            g["display"] = display
        g["total"] += row.get("totalAmount", 0) or 0
        for y, amt in (row.get("byYear") or {}).items():
            g["byYear"][y] = g["byYear"].get(y, 0) + amt
        g["variants"].append({"name": name, "total": round(row.get("totalAmount", 0) or 0, 2)})
        if merge_reason:
            g["merges"].append({"variant": name, "reason": merge_reason})

    ranked = sorted(groups.values(), key=lambda g: -g["total"])[: args.top]

    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for g in ranked:
        # pick display + representative raw variant (largest)
        g["variants"].sort(key=lambda v: -v["total"])
        top_variant = g["variants"][0]["name"]
        display = g["display"] or title_case(top_variant)
        slug = slugify(display)

        # kind + departments from the classified info of any variant
        bucket, depts, np = None, [], False
        for v in g["variants"]:
            info = vinfo.get(v["name"])
            if not info:
                continue
            if info["bucket"] and (bucket in (None, "other")):
                bucket = info["bucket"]
            if info["dept"] and info["dept"] not in depts:
                depts.append(info["dept"])
            np = np or bool(info["np"])
        kind = bucket or ("nonprofit" if np else "other")

        # active contracts held (join by prime core over all variant cores)
        cores = {core(v["name"]) for v in g["variants"]} | {g["core"]}
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

        # What the City pays them FOR — departments/categories/last closed
        # year, summed across every spelling merged into this payee.
        profile = merge_profiles([v["name"] for v in g["variants"]], profiles)

        years = sorted(int(y) for y in g["byYear"])
        fiche = {
            "generated_at": now_iso(),
            "source_pipeline": "payees_search.json + top_payees.json + contracts_active.json → normalize_sf_payees.py",
            "as_of": search.get("as_of"),
            "unit": "USD",
            "slug": slug,
            "name": display,
            "kind": kind,
            "is_non_profit": np,
            "total_paid_usd": round(g["total"], 2),
            "n_years": len(years),
            "first_year": years[0] if years else None,
            "last_year": years[-1] if years else None,
            "by_year": {y: round(v, 2) for y, v in sorted(g["byYear"].items())},
            # Kept for the row chips that still read it; the fiche itself now
            # renders `profile.departments`, which carries the dollars.
            "top_departments": depts[:4],
            "profile": profile,
            # A recorded miss is stored as {description: None} so re-runs skip
            # it; only a real answer travels to the fiche.
            "identity": (
                identities.get(slug) if (identities.get(slug) or {}).get("description") else None
            ),
            "contracts_held": held[:40],
            "n_contracts_held": len(held),
            "variants": g["variants"],
            "n_variants": len(g["variants"]),
            "merges": g["merges"],
            "source": search.get("source"),
        }
        (OUT / f"{slug}.json").write_text(json.dumps(fiche, indent=1, ensure_ascii=False))
        index.append({
            "slug": slug, "name": display, "kind": kind,
            "total_paid_usd": round(g["total"], 2),
            "n_variants": len(g["variants"]),
            "n_contracts_held": len(held),
            "last_year": years[-1] if years else None,
        })

    index_doc = {
        "generated_at": now_iso(),
        "source_pipeline": "payees_search.json + top_payees.json + contracts_active.json → normalize_sf_payees.py",
        "as_of": search.get("as_of"),
        "unit": "USD",
        "count": len(index),
        "note": (
            "Top payees by lifetime dollars paid, name-normalized (exact core "
            "match + curated JV/predecessor merges). Payees outside this set "
            "stay unkeyed and must render as plain text, never as links."
        ),
        "payees": index,
    }
    (OUT / "index.json").write_text(json.dumps(index_doc, indent=1, ensure_ascii=False))

    # Raw-vendor-string → normalized slug, so the who-gets-paid rows and the
    # contracts-page vendor chips can resolve a payment/contract's raw name to
    # a keyed fiche (and fall back to plain text when absent).
    vendor_map: dict[str, str] = {}
    for g in ranked:
        g["variants"].sort(key=lambda v: -v["total"])
        display = g["display"] or title_case(g["variants"][0]["name"])
        s = slugify(display)
        for v in g["variants"]:
            vendor_map[v["name"]] = s
    (OUT / "_vendor_slug_map.json").write_text(json.dumps(vendor_map, indent=1, ensure_ascii=False))

    n_multi = sum(1 for g in ranked if len(g["variants"]) > 1)
    print(f"✓ {len(index)} payees → {OUT}")
    print(f"  {n_multi} had >1 variant merged; curated merges applied where matched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
