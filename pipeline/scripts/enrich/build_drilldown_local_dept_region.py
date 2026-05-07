#!/usr/bin/env python3
"""
Build the `departement` and `region` sub-blocks of the S1313 local bucket.

Sources (unifiées avec le bloc communal) :
    pipeline/seeds/seed_ofgl_local_dept_l2.csv     (table F3 du Rapport OFGL 2025)
    pipeline/seeds/seed_ofgl_local_dept_l3_*.csv   (un seed par groupe)
    pipeline/seeds/seed_ofgl_local_region_l2.csv   (table F4 du Rapport OFGL 2025)
    pipeline/seeds/seed_ofgl_local_region_l3_*.csv

Nomenclature commune 9 groupes / 34 agrégats — même structure que la commune.
Output (in-memory, consumed by build_drilldown_local.py).
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEEDS_DIR = ROOT / "pipeline" / "seeds"

_KEY_OK = re.compile(r"^[a-z0-9_]+$")


def _read_seed(name: str) -> list[dict]:
    with open(SEEDS_DIR / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _slug(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _level3_from_seed_optional(seed_name: str) -> list[dict] | None:
    path = SEEDS_DIR / seed_name
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return None
    total_share = sum(float(r["share"]) for r in rows if r.get("share"))
    if total_share <= 0:
        return None
    out: list[dict] = []
    for r in rows:
        key = _slug(r["key"])
        if not _KEY_OK.match(key):
            raise ValueError(f"Bad key {key!r} in {seed_name}")
        share = float(r["share"]) / total_share
        out.append({
            "key": key,
            "label_fr": r["label_fr"],
            "label_en": r["label_en"] or r["label_fr"],
            "share_of_parent": round(share, 6),
            "source": r["source"],
            "source_url": r["source_url"],
        })
    out.sort(key=lambda x: x["share_of_parent"], reverse=True)
    return out


def _build_level2_with_l3(scope: str, l2_seed: str) -> list[dict]:
    rows = _read_seed(l2_seed)
    if not rows:
        raise ValueError(f"{l2_seed} is empty")

    total_share = sum(float(r["share"]) for r in rows if r.get("share"))
    if total_share <= 0:
        raise ValueError(f"Sum of shares in {l2_seed} is zero.")

    level2: list[dict] = []
    for r in rows:
        key = _slug(r["key"])
        if not _KEY_OK.match(key):
            raise ValueError(f"Bad key {key!r} in {l2_seed}")
        share = float(r["share"]) / total_share
        entry = {
            "key": key,
            "label_fr": r["label_fr"],
            "label_en": r["label_en"] or r["label_fr"],
            "share_of_parent": round(share, 6),
            "source": r["source"],
            "source_url": r["source_url"],
        }
        l3 = _level3_from_seed_optional(f"seed_ofgl_local_{scope}_l3_{key}.csv")
        if l3:
            entry["level3"] = l3
        level2.append(entry)

    level2.sort(key=lambda x: x["share_of_parent"], reverse=True)
    return level2


def build_local_dept_region() -> dict:
    """Return the {departement, region} sub-buckets to graft onto local."""
    dept_level2 = _build_level2_with_l3("dept", "seed_ofgl_local_dept_l2.csv")
    region_level2 = _build_level2_with_l3("region", "seed_ofgl_local_region_l2.csv")

    return {
        "departement": {
            "label_fr": "Niveau départemental",
            "label_en": "Departmental level",
            "perimeter_fr": (
                "Comptes des départements 2024 (table F3 du Rapport OFGL 2025) — "
                "nomenclature commune. Hors Paris, Métropole de Lyon, Guyane, "
                "Martinique, Corse (collectivités à statut particulier ou hybrides)."
            ),
            "perimeter_en": (
                "Department accounts 2024 (Rapport OFGL 2025, table F3) — "
                "common nomenclature. Excludes Paris, Lyon Metropolis, "
                "Guyane, Martinique, Corsica (special-status collectivities)."
            ),
            "level2": dept_level2,
            "notes_fr": (
                "level2 = 9 groupes OFGL (services généraux, sécurité, "
                "enseignement, etc.) ; level3 = agrégats publiés sous chaque "
                "groupe dans la même table. Ratios = part du total dépenses "
                "fonctionnement (hors charges fi.) + investissement (hors remb.)."
            ),
        },
        "region": {
            "label_fr": "Niveau régional",
            "label_en": "Regional level",
            "perimeter_fr": (
                "Comptes des régions et CTU 2024 (table F4 du Rapport OFGL 2025) — "
                "nomenclature commune. Inclut métropole + outre-mer ; hors Mayotte."
            ),
            "perimeter_en": (
                "Region & CTU accounts 2024 (Rapport OFGL 2025, table F4) — "
                "common nomenclature. Includes metropolitan France + overseas; "
                "excludes Mayotte."
            ),
            "level2": region_level2,
            "notes_fr": (
                "Mêmes 9 groupes / agrégats que le bloc communal et les "
                "départements (annexe 2F du Rapport OFGL)."
            ),
        },
    }


def main() -> int:
    bundle = build_local_dept_region()
    n_dept = len(bundle["departement"]["level2"])
    n_reg = len(bundle["region"]["level2"])
    sum_dept = sum(x["share_of_parent"] for x in bundle["departement"]["level2"])
    sum_reg = sum(x["share_of_parent"] for x in bundle["region"]["level2"])
    n_dept_l3 = sum(len(x.get("level3") or []) for x in bundle["departement"]["level2"])
    n_reg_l3 = sum(len(x.get("level3") or []) for x in bundle["region"]["level2"])
    print(
        f"[local_dept_region] dept: l2={n_dept} sum={sum_dept:.4f} l3_total={n_dept_l3}  "
        f"·  region: l2={n_reg} sum={sum_reg:.4f} l3_total={n_reg_l3}"
    )
    if "-v" in sys.argv:
        json.dump(bundle, sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
