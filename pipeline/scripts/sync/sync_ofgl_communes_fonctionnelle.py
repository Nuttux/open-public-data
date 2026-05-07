#!/usr/bin/env python3
"""
Sync OFGL ventilation fonctionnelle pour le bloc communal — version simplifiée.

CONSTAT 2026-05 :
    L'API OFGL data.ofgl.fr ne publie PAS le dataset
    `ofgl-base-communes-fonctionnelle` (404). Seul le dataset
    `ofgl-base-departements-fonctionnelle` existe (M52 départements).

    Pour les communes (M14), la ventilation fonctionnelle n'est exposée qu'au
    niveau **agrégé national** dans le rapport annuel OFGL. Pour le calculateur
    Daily Bread on n'a besoin que de la moyenne nationale + (à terme) un
    overlay top-200 communes — donc on s'appuie sur le seed
    `pipeline/seeds/seed_ofgl_communes_fonctionnelle.csv` (valeurs sourcées
    depuis le rapport DGCL/OFGL annuel) plutôt qu'un fetch API impossible.

    Ce script :
      - lit le seed national,
      - écrit `website/public/data/communes-all/fonctionnelle.json`,
      - structure prête à recevoir un éventuel overlay `by_insee_top_200`
        si OFGL publie un jour le dataset communes-fonctionnelle.

Output :
    website/public/data/communes-all/fonctionnelle.json

Schema :
    {
      "national_avg_weighted": {
        "<key>": { "share": float, "eur_hab": float,
                   "label_fr": str, "label_en": str },
        ...
      },
      "by_insee_top_200": {},        # vide pour l'instant — TODO
      "fonctions": [<key>, ...],     # ordre canonique
      "source": str, "source_url": str, "year": int
    }
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEED = ROOT / "pipeline" / "seeds" / "seed_ofgl_communes_fonctionnelle.csv"
OUTPUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "communes-all"
OUTPUT = OUTPUT_DIR / "fonctionnelle.json"


def main() -> int:
    print("→ OFGL communes-fonctionnelle (seed-based, national agg)")
    if not SEED.exists():
        print(f"  ✗ Seed missing: {SEED}")
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    with open(SEED, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    national: dict[str, dict] = {}
    fonctions: list[str] = []
    source = ""
    source_url = ""
    year_ref: int | None = None

    for r in rows:
        key = r["key"]
        share = float(r["share"])
        eur_hab = float(r["eur_hab"])
        national[key] = {
            "share": round(share, 4),
            "eur_hab": round(eur_hab, 1),
            "label_fr": r["label_fr"],
            "label_en": r["label_en"],
        }
        fonctions.append(key)
        source = r["source"]
        source_url = r["source_url"]
        date_ref = r.get("date_reference") or ""
        if date_ref and not year_ref:
            try:
                year_ref = int(date_ref.split("-")[0])
            except ValueError:
                year_ref = None

    # Sanity: shares should sum ~1.0
    sum_shares = sum(v["share"] for v in national.values())
    sum_eur = sum(v["eur_hab"] for v in national.values())
    print(f"  ✓ Loaded {len(national)} fonctions; sum_share={sum_shares:.3f}; "
          f"sum_eur_hab≈{sum_eur:.0f} €/hab (expected ~1500-1700)")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "source_url": source_url,
        "year": year_ref or 2023,
        "scope": "national_avg_weighted_only",
        "scope_note_fr": (
            "Le dataset OFGL ne publie pas la ventilation fonctionnelle au "
            "niveau de chaque commune (seul `departements-fonctionnelle` est "
            "exposé). Les valeurs ici sont les moyennes nationales du bloc "
            "communal (communes + EPCI) issues du rapport annuel OFGL/DGCL. "
            "L'overlay `by_insee_top_200` est laissé vide pour l'instant."
        ),
        "fonctions": fonctions,
        "national_avg_weighted": national,
        "by_insee_top_200": {},
    }

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"  ✓ Wrote {OUTPUT.name} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
