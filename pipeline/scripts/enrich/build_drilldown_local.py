#!/usr/bin/env python3
"""
Build the `local` bucket (S1313 — Administrations publiques locales) of
daily_bread_drilldown.json.

Source:
    pipeline/seeds/seed_ofgl_communes_fonctionnelle.csv
        Functional breakdown of municipal block spending (DGCL/OFGL annual
        report — communes M14 fonctionnelle is not exposed as a dataset, so
        the seed carries the published aggregates).

Level 3 is intentionally absent at this stage. The DGFiP balance comptable
crossed nature x fonction can descend further but that's a separate pipeline
job — we document it as a TODO instead of inventing values.

Output:
    website/public/data/national/_drilldown_local.json
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEEDS_DIR = ROOT / "pipeline" / "seeds"

# Local sibling import so this module remains runnable standalone.
sys.path.insert(0, str(Path(__file__).parent))
from build_drilldown_local_dept_region import build_local_dept_region  # noqa: E402

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
    """Read a level3 seed `seed_ofgl_local_<scope>_l3_<groupe>.csv` if it exists.

    Renormalises shares to sum to 1.0. Returns None if absent — caller treats
    that group as level2-only (drawer falls back to "détail indisponible").
    """
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
    """Build a level2 list and graft level3 from per-groupe seeds.

    `scope` = "commune" / "dept" / "region" — used to locate the level3
    seed files `seed_ofgl_local_<scope>_l3_<groupe>.csv`.
    """
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
            raise ValueError(f"Bad key {key!r}")
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


def build_local_bucket() -> dict:
    """Build the S1313 local bucket.

    Sources unifiées : OFGL Rapport 2025 (data 2024) — annexe 2F, tables
    F1 (commune ≥3500 hab), F3 (départements), F4 (régions+CTU). Mêmes
    9 groupes / 34 agrégats sur les 3 échelles.
    """
    commune_l2 = _build_level2_with_l3("commune", "seed_ofgl_local_commune_l2.csv")
    # Departmental + regional sub-buckets — same 9-group nomenclature.
    dept_region = build_local_dept_region()

    notes = (
        "Source unifiée : OFGL Rapport 2025 (data 2024) — annexe 2F, "
        "nomenclature commune 9 groupes M14/M52/M71. F1 = communes ≥3500 hab, "
        "F3 = départements (hors Paris/Mayotte/ML), F4 = régions+CTU. "
        "Ratios = part dans le total dépenses fonctionnement (hors charges fi.) "
        "+ investissement (hors remb.). level3 = sous-agrégats du même tableau."
    )

    return {
        "code": "S1313",
        "label_fr": "Collectivités locales (APUL)",
        "label_en": "Local authorities (APUL)",
        "year": 2024,
        "level2": commune_l2,
        "departement": dept_region["departement"],
        "region": dept_region["region"],
        "notes_fr": notes,
    }


def main() -> int:
    """Standalone debug entrypoint — prints summary + dumps to stdout if -v."""
    import sys as _sys
    bucket = build_local_bucket()
    n2 = len(bucket["level2"])
    sum2 = sum(m["share_of_parent"] for m in bucket["level2"])
    print(f"[local] level2={n2} level3_total=0 sum(level2)={sum2:.4f}")
    if "-v" in _sys.argv:
        json.dump(bucket, _sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
