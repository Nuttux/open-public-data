#!/usr/bin/env python3
"""
Sync OFGL ventilation fonctionnelle des départements (M52/M57).

Dataset OFGL : `ofgl-base-departements-fonctionnelle`
URL : https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-departements-fonctionnelle/

Ce script récupère pour chaque département (≈97 dont Métropole de Lyon, Paris,
Alsace, ROM hors Corse) le total `Dépenses totales hors remb` ventilé par
fonction (niveau hiérarchique 1 — fonction à un chiffre, M57 majoritaire en
2024 + reliquat M52). Les budgets principal et annexes sont sommés. Les
allocations APA/RSA/PCH sont déjà incluses dans le total fonction 4
("Santé et action sociale") au niveau 1.

Mapping vers les 6 buckets utilisés côté daily-bread (i18n stables —
matches `seed_ofgl_departements_fonctionnelle.csv`) :

    M57/M52 fonction (1 chiffre)              → bucket
    ─────────────────────────────────────────────────────────────────────
    0 Services généraux                        → administration_autres
    1 Sécurité                                 → securite_civile_sdis_pompiers
    2 Enseignement, formation pro              → colleges_education
    3 Culture, vie sociale, jeunesse, sports   → culture_sport_jeunesse
    4 Santé et action sociale (incl. APA/RSA)  → action_sociale_rsa_dependance_enfance
    5 Aménagement des territoires et habitat   → administration_autres
    6 Action économique                        → administration_autres
    7 Environnement                            → administration_autres
    8 Transports                               → routes_transport_voirie_dep
    9 Développement économique / réserve       → administration_autres

Output :
    website/public/data/communes-all/dept-fonctionnelle.json

Schema :
    {
      "generated_at": iso str,
      "source": "OFGL ofgl-base-departements-fonctionnelle",
      "source_url": str,
      "year": 2024,
      "n_dep": int,
      "fonctions": [<bucket_key>, ...],   # ordre canonique
      "by_dep_code": {
        "<dep_code>": {
          "nom": str,
          "ptot": int,
          "total_eur_hab": float,
          "fonctions": {
            "<bucket_key>": { "share": float, "eur_hab": float },
            ...
          }
        },
        ...
      },
      "by_dep_name": {
        "<dep_name normalisé>": "<dep_code>"   # alias simples + mappings spéciaux
      }
    }
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "communes-all"
OUTPUT = OUTPUT_DIR / "dept-fonctionnelle.json"

DATASET = "ofgl-base-departements-fonctionnelle"
API_BASE = (
    "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/"
    f"{DATASET}/records"
)
DATASET_URL = f"https://data.ofgl.fr/explore/dataset/{DATASET}/"

YEAR = 2024
PAGE_SIZE = 100  # OFGL hard limit on grouped queries


# Map first character of `fonctionnelle_1` ("0-...", "1-...", ...) to one of the
# 6 buckets used by the daily-bread deep-dive (keys aligned with the existing
# i18n in `db.deepdive.departement.<key>`).
FONCTION_TO_BUCKET = {
    "0": "administration_autres",
    "1": "securite_civile_sdis_pompiers",
    "2": "colleges_education",
    "3": "culture_sport_jeunesse",
    "4": "action_sociale_rsa_dependance_enfance",
    "5": "administration_autres",
    "6": "administration_autres",
    "7": "administration_autres",
    "8": "routes_transport_voirie_dep",
    "9": "administration_autres",
}

# Canonical order (largest first, like the seed) — matters only for the
# `fonctions` list metadata, not the by_dep_code keys (the client re-sorts).
BUCKETS_ORDER = [
    "action_sociale_rsa_dependance_enfance",
    "colleges_education",
    "routes_transport_voirie_dep",
    "administration_autres",
    "securite_civile_sdis_pompiers",
    "culture_sport_jeunesse",
]

# Aliases : nos communes-all/index.json publient un `dep_name` qui ne
# correspond pas toujours au libellé OFGL (Bas-Rhin/Haut-Rhin sont fusionnés
# côté OFGL en "Alsace" / dep_code 67A ; les communes de la Métropole de Lyon
# sont étiquetées "Rhône" dans notre index alors que OFGL distingue ML/691).
# Pour les départements absents du dataset OFGL fonctionnelle (Corse, Martinique,
# Guyane, Guadeloupe pour partie...), aucun mapping → fallback moyenne nationale
# côté client.
DEP_NAME_ALIASES = {
    "Bas-Rhin": "67A",
    "Haut-Rhin": "67A",
    "Alsace": "67A",
}


def _fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "open-public-data/sync-ofgl"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_all_departements_fonctions(year: int) -> list[dict]:
    """Fetch level-1 functional breakdown for all departments, year `year`.

    Aggregates `Dépenses totales hors remb` across budget principal + annexes
    via API GROUP BY. Returns one row per (dep_code, fonctionnelle_1).
    """
    where = (
        f"exer=date'{year}'"
        f" AND niveau_hierarchique=1"
        f' AND agregat="Dépenses totales hors remb"'
    )
    select = (
        "dep_code,dep_name,categ,fonctionnelle_1,"
        "sum(montant) as montant,max(ptot) as ptot"
    )
    group_by = "dep_code,dep_name,categ,fonctionnelle_1"

    rows: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": where,
            "select": select,
            "group_by": group_by,
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        url = API_BASE + "?" + urllib.parse.urlencode(params)
        data = _fetch(url)
        page = data.get("results", [])
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.05)  # be gentle
    return rows


def build_payload(rows: list[dict]) -> dict:
    """Aggregate by dep_code → bucket, return JSON payload."""
    by_dep: dict[str, dict] = {}
    for r in rows:
        dep_code = r.get("dep_code")
        dep_name = r.get("dep_name") or ""
        fonc = r.get("fonctionnelle_1") or ""
        montant = float(r.get("montant") or 0)
        ptot = int(r.get("ptot") or 0)
        if not dep_code or not fonc or ptot <= 0:
            continue

        # Map fonctionnelle_1 first char "X-..." to a bucket
        first = fonc[:1]
        bucket = FONCTION_TO_BUCKET.get(first)
        if bucket is None:
            continue

        entry = by_dep.setdefault(
            dep_code,
            {"nom": dep_name, "ptot": ptot, "by_bucket_eur": {}},
        )
        # Be defensive: keep max ptot, prefer non-empty nom
        if ptot > entry["ptot"]:
            entry["ptot"] = ptot
        if not entry["nom"] and dep_name:
            entry["nom"] = dep_name

        entry["by_bucket_eur"][bucket] = entry["by_bucket_eur"].get(bucket, 0.0) + montant

    by_dep_code: dict[str, dict] = {}
    for dep_code, e in by_dep.items():
        total_eur = sum(e["by_bucket_eur"].values())
        ptot = e["ptot"]
        if total_eur <= 0 or ptot <= 0:
            continue
        fonctions: dict[str, dict] = {}
        for bucket in BUCKETS_ORDER:
            v_eur = e["by_bucket_eur"].get(bucket, 0.0)
            fonctions[bucket] = {
                "share": round(v_eur / total_eur, 4),
                "eur_hab": round(v_eur / ptot, 1),
            }
        by_dep_code[dep_code] = {
            "nom": e["nom"],
            "ptot": ptot,
            "total_eur_hab": round(total_eur / ptot, 1),
            "fonctions": fonctions,
        }

    # Build dep_name → dep_code lookup (literal name as published by OFGL,
    # plus aliases for cases where our communes index uses a different name).
    by_dep_name: dict[str, str] = {}
    for dep_code, e in by_dep_code.items():
        nom = e.get("nom") or ""
        if nom:
            by_dep_name[nom] = dep_code
    by_dep_name.update(DEP_NAME_ALIASES)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": f"OFGL {DATASET}",
        "source_url": DATASET_URL,
        "year": YEAR,
        "n_dep": len(by_dep_code),
        "fonctions": list(BUCKETS_ORDER),
        "scope_note_fr": (
            "Dépenses totales hors remboursement de dette des départements "
            "(M57 majoritaire en 2024, reliquat M52), ventilées par fonction "
            "à un chiffre puis regroupées en 6 buckets éditoriaux. Budgets "
            "principal + annexes consolidés. APA/RSA/PCH inclus dans la "
            "fonction 4 « Santé et action sociale » au niveau 1."
        ),
        "by_dep_code": by_dep_code,
        "by_dep_name": by_dep_name,
    }


def main() -> int:
    print(f"→ OFGL {DATASET} — year={YEAR}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = fetch_all_departements_fonctions(YEAR)
    print(f"  ✓ Fetched {len(rows)} (dep × fonction) rows")

    payload = build_payload(rows)
    n = payload["n_dep"]
    if n == 0:
        print("  ✗ Aucun département agrégé — abort")
        return 1

    # Sanity-checks
    total_md = 0.0
    sum_ptot = 0
    for dep_code, e in payload["by_dep_code"].items():
        total_md += e["total_eur_hab"] * e["ptot"] / 1e9
        sum_ptot += e["ptot"]
    print(f"  ✓ {n} departments aggregated")
    print(f"    Σ pop covered: {sum_ptot/1e6:.1f}M hab")
    print(f"    Σ dépenses totales hors remb: {total_md:.1f} Md€")

    # Spot-check some big ones
    for code in ["13", "75", "92", "69", "691", "67A"]:
        e = payload["by_dep_code"].get(code)
        if not e:
            print(f"    ⚠ {code} missing")
            continue
        soc_share = e["fonctions"]["action_sociale_rsa_dependance_enfance"]["share"]
        soc_eur = e["fonctions"]["action_sociale_rsa_dependance_enfance"]["eur_hab"]
        print(
            f"    {code} {e['nom']:<22} pop={e['ptot']:>9,} "
            f"total={e['total_eur_hab']:>5.0f}€/hab "
            f"soc={soc_share*100:>4.1f}% ({soc_eur:>4.0f}€/hab)"
        )

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"  ✓ Wrote {OUTPUT.name} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
