#!/usr/bin/env python3
"""
Bulk OFGL fetch for ALL ~36 000 French communes → single index JSON.

Source: data.ofgl.fr — ofgl-base-communes-consolidee (CSV export with filter).

Strategy:
    Download 7 essential KPIs for the latest year only (~250k rows total,
    ~70MB CSV). Parse, pivot per commune, output a single ~10MB JSON index
    for the frontend.

Why not per-commune JSONs:
    35 000 files in one folder hits filesystem limits and bloats git.
    A single index file is faster to load and serve.

Why not all years × all KPIs:
    13.6M records would be impractical. The "tail" communes get a slim page
    (latest snapshot). The top 10 keep their full rich pages from the
    per-commune sync (`sync_ofgl_communes.py`).

Output:
    website/public/data/communes-all/index.json
    website/public/data/communes-all/_meta.json
"""

import csv
import io
import json
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OFGL_EXPORT = (
    "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/"
    "ofgl-base-communes-consolidee/exports/csv"
)

ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "communes-all"

# 7 KPIs we ship in the slim index — keys → OFGL labels
KPIS = {
    "depenses_totales": "Dépenses totales hors remb",
    "recettes_totales": "Recettes totales hors emprunts",
    "encours_dette": "Encours de dette",
    "frais_personnel": "Frais de personnel",
    "impots_locaux": "Impôts locaux",
    "capacite_financement": "Capacité ou besoin de financement",
    "epargne_brute": "Epargne brute",
}

LATEST_YEAR = 2024  # Latest full year reliably published in OFGL


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
    out = []
    prev_dash = False
    for ch in s:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


def fetch_kpi_csv(label: str, year: int) -> bytes:
    """Download CSV filtered by single agregat + year."""
    where = f'year(exer)={year} AND agregat="{label}"'
    params = [
        ("where", where),
        ("use_labels", "true"),
        ("delimiter", ";"),
    ]
    url = f"{OFGL_EXPORT}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "FranceOpenData/1.0"})
    with urlopen(req, timeout=180) as resp:
        return resp.read()


def parse_kpi_csv(raw: bytes) -> dict[str, dict]:
    """Index by INSEE code → { montant, eur_hab, nom, dep, reg, pop, siren }."""
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    out = {}
    for row in reader:
        insee = (row.get("Code Insee 2024 Commune") or "").strip()
        if not insee or len(insee) != 5:
            continue
        try:
            montant = float(row.get("Montant") or 0)
        except ValueError:
            montant = 0
        try:
            eur_hab = float(row.get("Montant en € par habitant") or 0)
        except ValueError:
            eur_hab = 0
        try:
            pop = int(float(row.get("Population totale") or 0))
        except ValueError:
            pop = 0
        out[insee] = {
            "montant": int(round(montant)),
            "eur_hab": round(eur_hab, 1),
            "nom": (row.get("Nom 2024 Commune") or "").strip(),
            "dep_name": (row.get("Nom 2024 Département") or "").strip(),
            "reg_name": (row.get("Nom 2024 Région") or "").strip(),
            "pop": pop,
            "siren": (row.get("Code Siren Collectivité") or "").strip(),
        }
    return out


def main() -> int:
    print(f"→ OFGL bulk all-communes sync (year {LATEST_YEAR}, {len(KPIS)} KPIs)")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Pivot: insee → { kpi_key → {montant, eur_hab} } + meta
    by_insee: dict[str, dict] = defaultdict(lambda: {"kpis": {}})

    for kpi_key, label in KPIS.items():
        print(f"  Fetching '{label}' …")
        raw = fetch_kpi_csv(label, LATEST_YEAR)
        per_commune = parse_kpi_csv(raw)
        print(f"    parsed {len(per_commune)} communes")

        for insee, row in per_commune.items():
            entry = by_insee[insee]
            entry["kpis"][kpi_key] = {"montant": row["montant"], "eur_hab": row["eur_hab"]}
            # Set meta from first KPI seen (all should agree)
            if "nom" not in entry:
                entry["nom"] = row["nom"]
                entry["dep_name"] = row["dep_name"]
                entry["reg_name"] = row["reg_name"]
                entry["pop"] = row["pop"]
                entry["siren"] = row["siren"]

    # Compute slug for each commune. For uniqueness, append INSEE if name collision.
    name_to_insees: dict[str, list[str]] = defaultdict(list)
    for insee, entry in by_insee.items():
        if "nom" in entry:
            slug_base = slugify(entry["nom"])
            name_to_insees[slug_base].append(insee)

    final = {}
    for insee, entry in by_insee.items():
        if "nom" not in entry:
            continue
        slug_base = slugify(entry["nom"])
        slug = (
            slug_base
            if len(name_to_insees[slug_base]) == 1
            else f"{slug_base}-{insee}"
        )
        final[insee] = {
            "insee": insee,
            "slug": slug,
            "nom": entry["nom"],
            "dep_name": entry["dep_name"],
            "reg_name": entry["reg_name"],
            "pop": entry["pop"],
            "siren": entry["siren"],
            "kpis": entry["kpis"],
        }

    print(f"\n  ✓ Built index: {len(final)} communes")

    # Build slug → insee map for URL lookups
    slug_to_insee = {entry["slug"]: insee for insee, entry in final.items()}

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OFGL — ofgl-base-communes-consolidee",
        "source_url": "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
        "year": LATEST_YEAR,
        "kpi_keys": list(KPIS.keys()),
        "kpi_labels_fr": dict(KPIS),
        "n_communes": len(final),
        "communes": final,
        "slug_to_insee": slug_to_insee,
    }

    out_file = OUTPUT_DIR / "index.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = out_file.stat().st_size / 1024 / 1024
    print(f"  ✓ Wrote {out_file.name} ({size_mb:.1f} MB)")

    # Lightweight meta-only file for sitemap generation (no KPIs)
    meta = {
        "generated_at": payload["generated_at"],
        "year": LATEST_YEAR,
        "source": payload["source"],
        "n_communes": len(final),
        "communes_meta": [
            {
                "insee": entry["insee"],
                "slug": entry["slug"],
                "nom": entry["nom"],
                "dep_name": entry["dep_name"],
                "reg_name": entry["reg_name"],
                "pop": entry["pop"],
            }
            for entry in sorted(final.values(), key=lambda e: e["nom"])
        ],
    }
    meta_file = OUTPUT_DIR / "_meta.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  ✓ Wrote _meta.json ({meta_file.stat().st_size / 1024 / 1024:.1f} MB)")

    # Sanity-check on Marseille (13055) and Paris (75056)
    for insee in ("75056", "13055", "69123"):
        if insee in final:
            e = final[insee]
            dep = e["kpis"].get("depenses_totales", {})
            dette = e["kpis"].get("encours_dette", {})
            print(
                f"\n  Sanity {e['nom']} ({insee}): "
                f"dépenses {dep.get('montant', 0) / 1e6:.0f} M€ ({dep.get('eur_hab', 0)} €/hab) · "
                f"dette {dette.get('montant', 0) / 1e6:.0f} M€"
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
