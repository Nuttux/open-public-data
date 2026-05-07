#!/usr/bin/env python3
"""
Export seed_communes_cibles.csv → website/src/data/cities.json

This is the single source of truth for the cities registry consumed by
the frontend (lib/cities.ts). A row in the CSV ⇔ one entry in the JSON.

Run it whenever seed_communes_cibles.csv is updated:
    python pipeline/scripts/export/export_cities.py
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
SEED_FILE = ROOT / "pipeline" / "seeds" / "seed_communes_cibles.csv"
OUT_FILE = ROOT / "website" / "src" / "data" / "cities.json"


def main() -> int:
    if not SEED_FILE.exists():
        print(f"Seed file not found: {SEED_FILE}", file=sys.stderr)
        return 1

    cities = []
    with open(SEED_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cities.append({
                "slug": row["slug"],
                "code_insee": row["code_insee"],
                "nom": row["nom"],
                "siren": row["siren"],
                "population": int(row["population"]),
                "dep_name": row["dep_name"],
                "reg_name": row["reg_name"],
                "lat": float(row["lat"]),
                "lng": float(row["lng"]),
            })

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": "pipeline/seeds/seed_communes_cibles.csv",
        "source_data": "OFGL — ofgl-base-communes (latest available year)",
        "source_url": "https://data.ofgl.fr/explore/dataset/ofgl-base-communes/",
        "cities": cities,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"  ✓ Wrote {len(cities)} cities → {OUT_FILE.relative_to(ROOT)}")
    for c in cities:
        print(f"    {c['slug']:14} {c['code_insee']:6} pop={c['population']:>9}  {c['reg_name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
