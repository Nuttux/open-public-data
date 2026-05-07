#!/usr/bin/env python3
"""
Fetch OFGL M52 sub-fonctions (niveau hiérarchique 2) for départements,
agrégat "Dépenses totales hors remb", consolidated across all DEPT.

Source:
    https://data.ofgl.fr/explore/dataset/ofgl-base-departements-fonctionnelle/
    (DGCL/OFGL — Comptes des départements, nomenclature M52 fonctionnelle)

Output:
    pipeline/cache/ofgl_subfonctions/dept_<year>.json
        Raw cache, all sub-fonctions sommées sur tous les départements.
    pipeline/seeds/seed_ofgl_dept_l3_<parent_key>.csv
        One CSV per parent level2 of the local-dept drilldown
        (action_sociale_rsa_dependance_enfance, colleges_education, …).
        Consumed by build_drilldown_local_dept_region.py to graft `level3`
        onto each dept level2 entry of daily_bread_drilldown.json.

The mapping between parent level2 keys and OFGL niveau-2 fonction codes
mirrors the editorial grouping committed in
seed_ofgl_departements_fonctionnelle.csv. Plan-de-relance residuals
(<<1%) are skipped.

Usage:
    python pipeline/scripts/sync/fetch_ofgl_dept_subfonctions.py
    python pipeline/scripts/sync/fetch_ofgl_dept_subfonctions.py --year 2023
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ofgl_subfonctions"
SEEDS = ROOT / "pipeline" / "seeds"

DATASET = "ofgl-base-departements-fonctionnelle"
EXPLORE_URL = (
    f"https://data.ofgl.fr/explore/dataset/{DATASET}/"
)
API = f"https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/{DATASET}/records"

# Editorial mapping: parent level2 key in the dept drilldown → list of
# M52 niveau-2 fonction codes that belong under it. Aligned with the
# parent shares committed in seed_ofgl_departements_fonctionnelle.csv.
# Plan-de-relance residuals (05/65/75/83/96) excluded — < 0.01 % each.
PARENT_TO_FONCTIONS: dict[str, list[str]] = {
    "action_sociale_rsa_dependance_enfance": [
        "40", "41", "42", "48",  # Prévention médico-sociale (4x)
        "50", "51", "52", "53", "54", "55", "56", "58",  # Action sociale (5x)
    ],
    "colleges_education": [
        "20", "21", "22", "23", "24", "28",  # Enseignement (2x)
    ],
    "routes_transport_voirie_dep": [
        "60", "61", "62", "63", "64", "68",  # Réseaux et infra (6x)
        "80", "81", "82", "88",  # Transports (8x)
    ],
    "administration_autres": [
        "01", "02", "04",  # Services généraux (0x)
        "70", "71", "72", "73", "74",  # Aménagement / logement / environnement (7x)
        "90", "91", "92", "93", "94", "95",  # Action économique (9x)
    ],
    "securite_civile_sdis_pompiers": [
        "10", "11", "12", "18",  # Sécurité (1x)
    ],
    "culture_sport_jeunesse": [
        "30", "31", "32", "33",  # Culture, vie sociale, jeunesse, sports (3x)
    ],
}

# Translations for sub-fonction labels — OFGL only ships French labels.
# Mapping by fonction code; missing codes fall back to French label.
LABELS_EN: dict[str, str] = {
    "01": "Non-allocable operations",
    "02": "General administration",
    "04": "Decentralised cooperation, European & international action",
    "10": "Common services (security)",
    "11": "Police, security, justice",
    "12": "Fire & rescue (SDIS)",
    "18": "Other protection of persons & property",
    "20": "Common services (education)",
    "21": "Primary education",
    "22": "Lower-secondary (collèges)",
    "23": "Higher education",
    "24": "Vocational training & apprenticeship",
    "28": "Other peri-school services",
    "30": "Common services (culture/sport/youth)",
    "31": "Culture",
    "32": "Sports",
    "33": "Youth (socio-educational) & leisure",
    "40": "Common services (medico-social prevention)",
    "41": "Maternal & child health (PMI)",
    "42": "Health prevention & education",
    "48": "Other medico-social actions",
    "50": "Common services (social action)",
    "51": "Family & childcare (ASE)",
    "52": "Disability (PCH)",
    "53": "Elderly (non-APA)",
    "54": "Minimum income (RMI legacy)",
    "55": "Dependency (APA)",
    "56": "Active solidarity income (RSA)",
    "58": "Other social interventions",
    "60": "Common services (networks)",
    "61": "Water & sanitation",
    "62": "Departmental roads",
    "63": "Rail & airport infrastructure",
    "64": "River, maritime & port infrastructure",
    "68": "Other networks",
    "70": "Common services (planning/environment)",
    "71": "Urban planning & development",
    "72": "Housing",
    "73": "Environment",
    "74": "Rural development",
    "80": "Common services (transport)",
    "81": "School transport",
    "82": "Public passenger transport",
    "88": "Other transport",
    "90": "Common services (economic action)",
    "91": "Economic development structures",
    "92": "Agriculture & fisheries",
    "93": "Industry, trade & crafts",
    "94": "Tourism development",
    "95": "Maintenance of non-departmental public services",
}

_KEY_OK = re.compile(r"^[a-z0-9_]+$")


def _slug(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def fetch_niveau2(year: int) -> list[dict]:
    """Hit OFGL niveau 2 aggregated by fonction, summed across all DEPT."""
    where = (
        f"date_format(exer,'yyyy')='{year}'"
        f' AND agregat="Dépenses totales hors remb"'
        f" AND niveau_hierarchique=2"
        f' AND nomen="M52"'
        f' AND categ="DEPT"'
    )
    params = {
        "where": where,
        "select": "fonction, nom_fonction, sum(montant) as montant",
        "group_by": "fonction,nom_fonction",
        "order_by": "fonction",
        "limit": 100,
    }
    r = requests.get(API, params=params, timeout=60)
    r.raise_for_status()
    return r.json().get("results", [])


def collapse_label_variants(rows: list[dict]) -> dict[str, dict]:
    """Some fonction codes ship with multiple labels (M52 nomenclature
    revisions). We pick the longest non-empty label and sum montants.
    """
    by_code: dict[str, dict] = {}
    for r in rows:
        code = (r.get("fonction") or "").strip()
        if not code:
            continue
        label = (r.get("nom_fonction") or "").strip()
        montant = float(r.get("montant") or 0)
        cur = by_code.get(code)
        if cur is None:
            by_code[code] = {"fonction": code, "label_fr": label, "montant": montant}
        else:
            cur["montant"] += montant
            if len(label) > len(cur["label_fr"]):
                cur["label_fr"] = label
    return by_code


# Below this share-of-parent threshold, drop a sub-fonction as noise.
# 0.5 % is the smallest share that still renders as a non-zero "1 %" pill
# in the drilldown UI; everything below would render as "0 %" and just
# clutter the list without conveying signal.
NOISE_SHARE_THRESHOLD = 0.005


def write_seed_for_parent(
    parent_key: str,
    fonction_codes: list[str],
    by_code: dict[str, dict],
    year: int,
) -> tuple[Path, int, float]:
    """Write seed_ofgl_dept_l3_<parent>.csv. Returns (path, n_rows, sum_share).

    Shares are share-of-parent (within the parent level2), summed-to-1 after
    pruning of <0.3 % noise. "Services communs" rows (back-office residuals
    that share the same OFGL label across multiple top-level fonctions) are
    merged into a single "Services communs (pilotage)" entry per parent.
    """
    rows = []
    total = 0.0
    sc_rows: list[dict] = []
    for code in fonction_codes:
        e = by_code.get(code)
        if not e:
            continue
        if e["montant"] <= 0:
            continue
        if e["label_fr"].strip().lower() == "services communs":
            sc_rows.append(e)
        else:
            rows.append(e)
        total += e["montant"]

    if total <= 0:
        raise RuntimeError(
            f"Parent {parent_key}: no non-zero montants among "
            f"{fonction_codes} — cannot normalise shares."
        )

    if sc_rows:
        merged_fonctions = "+".join(r["fonction"] for r in sc_rows)
        rows.append({
            "fonction": "sc",
            "label_fr": "Services communs (pilotage)",
            "montant": sum(r["montant"] for r in sc_rows),
            "_merged_from": merged_fonctions,
        })

    # Drop noise (<0.3 % of parent) and renormalise.
    rows = [r for r in rows if r["montant"] / total >= NOISE_SHARE_THRESHOLD]
    kept_total = sum(r["montant"] for r in rows)
    if kept_total <= 0:
        raise RuntimeError(f"Parent {parent_key}: pruning removed everything.")

    rows.sort(key=lambda x: x["montant"], reverse=True)

    out_path = SEEDS / f"seed_ofgl_dept_l3_{parent_key}.csv"
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "key", "label_fr", "label_en", "share",
            "source", "source_url", "date_reference", "notes",
        ])
        sum_share = 0.0
        for e in rows:
            code = e["fonction"]
            label_fr = e["label_fr"]
            label_en = LABELS_EN.get(code, label_fr)
            share = e["montant"] / kept_total
            sum_share += share
            if code == "sc":
                key = "services_communs_pilotage"
                merged = e.get("_merged_from", "")
                notes = (
                    f"M52 fonctions {merged} · niveau hiérarchique 2 · "
                    f"agrégat 'Dépenses totales hors remb' · sommé sur tous "
                    f"les départements (exer {year}). Fusionné car back-office "
                    "non-différencié au niveau utilisateur."
                )
                label_en = "Common services (back-office)"
            else:
                key = _slug(f"f{code}_{label_fr}")[:60]
                notes = (
                    f"M52 fonction {code} · niveau hiérarchique 2 · "
                    f"agrégat 'Dépenses totales hors remb' · sommé sur tous "
                    f"les départements (exer {year})."
                )
            if not _KEY_OK.match(key):
                raise ValueError(f"Bad key {key!r} for fonction {code}")
            w.writerow([
                key,
                label_fr,
                label_en,
                f"{share:.6f}",
                "DGCL/OFGL — Comptes des départements (M52 fonctionnelle)",
                EXPLORE_URL,
                f"{year}-12-31",
                notes,
            ])
    return out_path, len(rows), sum_share


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--year", type=int, default=2023)
    args = p.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    SEEDS.mkdir(parents=True, exist_ok=True)

    print(f"[ofgl] fetching M52 niveau-2 sub-fonctions for {args.year}…")
    rows = fetch_niveau2(args.year)
    print(f"[ofgl] {len(rows)} (fonction,label) rows received.")

    cache_path = CACHE / f"dept_{args.year}.json"
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"year": args.year, "results": rows}, f, ensure_ascii=False, indent=2)
    print(f"[ofgl] raw cache → {cache_path.relative_to(ROOT)}")

    by_code = collapse_label_variants(rows)
    print(f"[ofgl] {len(by_code)} unique fonction codes after label-variant collapse.")

    for parent_key, fonctions in PARENT_TO_FONCTIONS.items():
        out, n, total = write_seed_for_parent(parent_key, fonctions, by_code, args.year)
        print(f"  · {parent_key:42s} n={n:2d} sum_share={total:.4f} → {out.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
