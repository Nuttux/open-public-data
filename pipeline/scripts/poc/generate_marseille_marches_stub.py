#!/usr/bin/env python3
"""
POC stub: build Marseille `marches-publics` JSON files directly from the
data.gouv.fr SCDL CSV (slug `marseille-marches-publics-1`, year 2020).

Reproduces inline what the BQ pipeline would do (sync → stg → core → mart →
export) to unblock front rendering before the canonical export is wired.

Outputs:
  website/public/data/marseille/marches-publics/index.json
  website/public/data/marseille/marches-publics/marches_2020.json

⚠ POC limit: only year 2020 is covered (Marseille Ville published 2020 only).
DECP national consolidated covers 2021+ but is not used in this stub.
"""

from __future__ import annotations

import csv
import io
import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

OUT_DIR = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "marseille" / "marches-publics"
)
SLUG = "marseille-marches-publics-1"
YEAR = 2020

DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets/{slug}/"


def fetch_csv(slug: str) -> bytes:
    api_url = DATAGOUV_API.format(slug=slug)
    req = Request(api_url, headers={"User-Agent": "qipu-poc/1.0"})
    with urlopen(req, timeout=30) as resp:
        meta = json.load(resp)
    csv_resources = [r for r in meta.get("resources", []) if "csv" in (r.get("format") or "").lower()]
    if not csv_resources:
        raise RuntimeError(f"No CSV resource in {slug}")
    csv_resources.sort(key=lambda r: r.get("last_modified") or "", reverse=True)
    url = csv_resources[0]["url"]
    print(f"  fetching {url}")
    req = Request(url, headers={"User-Agent": "qipu-poc/1.0"})
    with urlopen(req, timeout=120) as resp:
        return resp.read()


def cpv_categorie(cpv: str) -> str:
    """Map CPV code prefix to a coarse category label (universal CPV taxonomy)."""
    if not cpv or cpv == "00000000-0":
        return "Autre"
    p = cpv.replace("-", "")[:2]
    mapping = {
        "03": "Agriculture, sylviculture",
        "09": "Énergie",
        "14": "Matériaux extractifs",
        "15": "Alimentation, boissons",
        "16": "Machines agricoles",
        "18": "Vêtements, chaussures",
        "19": "Cuir, textiles",
        "22": "Imprimerie, édition",
        "24": "Produits chimiques",
        "30": "Équipements informatiques",
        "31": "Équipements électriques",
        "32": "Équipements télécom",
        "33": "Équipements médicaux",
        "34": "Véhicules, transports",
        "35": "Sécurité, défense",
        "37": "Jeux, loisirs, sport",
        "38": "Équipements de mesure",
        "39": "Mobilier, fournitures",
        "41": "Eau",
        "42": "Machines industrielles",
        "43": "Machines BTP",
        "44": "Construction (matériaux)",
        "45": "Travaux de construction",
        "48": "Logiciels",
        "50": "Réparation, maintenance",
        "51": "Installation",
        "55": "Hôtellerie, restauration",
        "60": "Transports",
        "63": "Auxiliaires transport",
        "64": "Postes, télécom",
        "65": "Eau, assainissement",
        "66": "Services financiers",
        "70": "Immobilier",
        "71": "Architecture, ingénierie",
        "72": "Services informatiques",
        "73": "Recherche, développement",
        "75": "Administration publique",
        "76": "Services pétrole/gaz",
        "77": "Agriculture, espaces verts",
        "79": "Conseil, études, juridique",
        "80": "Éducation, formation",
        "85": "Santé, social",
        "90": "Services environnement",
        "92": "Culture, sport, loisirs",
        "98": "Autres services",
    }
    return mapping.get(p, "Autre")


def parse_csv(csv_bytes: bytes) -> list[dict]:
    text = csv_bytes.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for r in reader:
        notif = (r.get("NOTIFICATION_DATE") or "").strip()[:10]
        # Only keep rows from the target year
        if not notif.startswith(str(YEAR)):
            continue
        try:
            montant = float((r.get("MONTANT") or "0").replace(",", ".").replace(" ", ""))
        except ValueError:
            montant = 0.0
        cpv = (r.get("CPV_CODE") or "").strip()
        rows.append({
            "numero_marche": (r.get("MARCHE_ID") or "").strip(),
            "objet": (r.get("MARCHE_OBJET") or "").strip(),
            "nature": (r.get("NATURE_MARCHE") or "").strip(),
            "fournisseur_nom": (r.get("TITULAIRE_DENOMINATION") or "Non précisé").strip(),
            "fournisseur_siret": (r.get("TITULAIRES_ID") or "").strip(),
            "montant_min": 0.0,
            "montant_max": montant,
            "date_notification": notif,
            "duree_jours": int(round(float((r.get("DUREE_MOIS") or "0").replace(",", ".") or 0) * 30.44)) if (r.get("DUREE_MOIS") or "").strip() else 0,
            "categorie_libelle": cpv_categorie(cpv),
            "perimetre_financier": "M57 Ville",
            "is_multiattributaire": False,
            "_source_origin": "marseille",
            # DECP enrichment fields — null because we only have the SCDL Ville file in POC
            "decp_ccag": None,
            "decp_cpv_famille": cpv[:2] if cpv else None,
            "decp_procedure": (r.get("PROCEDURE") or None),
            "decp_montant_notifie": None,
            "decp_duree_mois": None,
            "decp_offres_recues": None,
            "decp_lieu_execution_lisible": (r.get("LIEU_EXEC_NOM") or None),
            "decp_titulaires_count": None,
            "decp_nb_modifications": None,
            "decp_sous_traitance_declaree": None,
            "decp_has_consideration_sociale": None,
            "decp_has_consideration_environnementale": None,
            "ecart_plafond_vs_notifie": None,
            "afficher_deux_montants": False,
        })
    return rows


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"=== Marseille marchés publics (year {YEAR}) ===")
    csv_bytes = fetch_csv(SLUG)
    rows = parse_csv(csv_bytes)
    print(f"  parsed {len(rows)} rows for year {YEAR}")

    enveloppe_max = sum(r["montant_max"] for r in rows)
    nb = len(rows)

    file_data = {
        "year": YEAR,
        "generated_at": "2026-05-07T00:00:00Z",
        "enveloppe_max_totale": enveloppe_max,
        "nb_marches": nb,
        "note": "POC stub Marseille — SCDL Ville 2020 uniquement, sans enrichissement DECP.",
        "data": rows,
    }
    out_marches = OUT_DIR / f"marches_{YEAR}.json"
    with open(out_marches, "w", encoding="utf-8") as f:
        json.dump(file_data, f, ensure_ascii=False, indent=2)
    print(f"  → {out_marches.name}  ({enveloppe_max/1e6:.1f} M€ enveloppe max, {nb} marchés)")

    index = {
        "generated_at": "2026-05-07T00:00:00Z",
        "source": "data.gouv.fr — marseille-marches-publics-1 (SCDL Ville)",
        "note": "POC stub Marseille v1 — 1 année (2020). Phase 2 ajoutera DECP national 2021+.",
        "availableYears": [YEAR],
        "totalsByYear": {
            str(YEAR): {"nb_marches": nb, "enveloppe_max_totale": enveloppe_max},
        },
        "filters": {},
    }
    out_index = OUT_DIR / "index.json"
    with open(out_index, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  → {out_index.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
