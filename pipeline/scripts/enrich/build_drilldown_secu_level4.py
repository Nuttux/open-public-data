#!/usr/bin/env python3
"""
Build optional level4 entries for the `secu` bucket of the daily-bread
drilldown — currently scoped to CNAM Maladie sub-objectifs ONDAM.

Sources :
    pipeline/seeds/seed_cnam_l4_medecine_ville.csv
        Décomposition AM-financée des « Soins ambulatoires + biens médicaux »
        (DREES, Comptes de la santé édition 2025, postes p21*/p22*/p31*/p32*
        — financeur Sécurité sociale, exercice 2024). Sert de proxy structurel
        pour le sous-objectif ONDAM « Soins de ville » (médecine de ville +
        soins ambulatoires).

Périmètre intentionnellement restreint :
    Seul le level3 « cnam_maladie_medecine_ville_soins_ambulatoires » reçoit
    un level4 dans cette première itération. Les autres sous-objectifs CNAM
    (hôpital, médico-social, IJ, FIR/AME) restent sans level4 — sources
    publiques structurées non-disponibles à ce grain :
        - Hôpital : DREES CNS ne décompose pas le secteur public par activité
          (MCO/SSR/Psy/USLD) ; seul le privé est décomposé. PLFSS Annexe 5
          (PDF) contient le détail mais pas de scraping fragile (cf. brief
          Phase 2 : précision > profondeur).
        - Médico-social : split EHPAD vs handicap nécessite source CNSA
          dédiée — TODO.
        - IJ : split IJ-maladie vs IJ-maternité nécessite source CNAM
          dédiée — TODO.
        - FIR/AME/prévention : déjà résiduel, peu de valeur à descendre.

Output :
    Pas de fichier dédié — la fonction `build_secu_level4_overlay()` retourne
    un dict { (level2_key, level3_key): [level4 entries] } qui est mergé par
    `build_drilldown.py` dans le bucket secu après le build du level3 par
    `build_drilldown_secu.py`.
"""

from __future__ import annotations

import csv
import json
import re
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


def _level4_from_seed(seed_name: str, key_prefix: str) -> list[dict]:
    """Read a level4 seed (key, label_fr, label_en, share, source, source_url,
    ...) and return level4 entries. Renormalises shares to sum to 1.0.

    Keys are prefixed with `key_prefix` to keep them globally unique within
    the bucket — matches the convention of `build_drilldown_secu._level3_from_seed`.
    """
    rows = _read_seed(seed_name)
    if not rows:
        return []

    total_share = sum(float(r["share"]) for r in rows if r.get("share"))
    if total_share <= 0:
        return []

    out: list[dict] = []
    for r in rows:
        raw_key = r["key"].strip()
        key = _slug(f"{key_prefix}_{raw_key}")
        if not _KEY_OK.match(key):
            raise ValueError(f"Bad key {key!r} from seed {seed_name}")
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


# Mapping of (level2_key, level3_key) → (level4 seed file, key_prefix).
# Périmètre actuel = uniquement médecine de ville (sous-objectif ONDAM le
# plus économiquement structurant : ~107 Md€ / 280 Md€ ONDAM en 2024).
LEVEL4_DEFS: list[tuple[str, str, str, str]] = [
    (
        "cnam_maladie",
        "cnam_maladie_medecine_ville_soins_ambulatoires",
        "seed_cnam_l4_medecine_ville.csv",
        "cnam_maladie_medecine_ville_soins_ambulatoires",
    ),
]


def build_secu_level4_overlay() -> dict[tuple[str, str], list[dict]]:
    """Return { (level2_key, level3_key): [level4 entries] }.

    Empty dict if no seed is present — the daily-bread bucket simply omits
    the level4 graft on those nodes.
    """
    overlay: dict[tuple[str, str], list[dict]] = {}
    for level2_key, level3_key, seed_name, key_prefix in LEVEL4_DEFS:
        path = SEEDS_DIR / seed_name
        if not path.exists():
            continue
        l4 = _level4_from_seed(seed_name, key_prefix=key_prefix)
        if l4:
            overlay[(level2_key, level3_key)] = l4
    return overlay


def main() -> int:
    """Standalone debug entrypoint."""
    import sys as _sys
    overlay = build_secu_level4_overlay()
    n_groups = len(overlay)
    n_total = sum(len(v) for v in overlay.values())
    print(f"[secu-l4] groups={n_groups} entries_total={n_total}")
    for (l2, l3), entries in overlay.items():
        share_sum = sum(e["share_of_parent"] for e in entries)
        print(f"  {l2}/{l3}: {len(entries)} entries (sum_share={share_sum:.4f})")
    if "-v" in _sys.argv:
        json.dump(
            {f"{l2}/{l3}": entries for (l2, l3), entries in overlay.items()},
            _sys.stdout,
            ensure_ascii=False,
            indent=2,
        )
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
