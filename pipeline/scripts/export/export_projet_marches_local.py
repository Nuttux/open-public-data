#!/usr/bin/env python3
"""
Génère website/public/data/map/projet_marches.json directement depuis
seed_match_projet_marches.csv + les fichiers website/public/data/marches-publics/marches_*.json.

Alternative à export_projet_marches.py qui passe par BQ : n'a besoin
ni de BigQuery ni de dbt. Utile pour itérer rapidement sur le matching.

Usage:
    python pipeline/scripts/export/export_projet_marches_local.py
"""
from __future__ import annotations

import csv
import glob
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_match_projet_marches.csv"
MARCHES_DIR = ROOT / "website" / "public" / "data" / "marches-publics"
OUTPUT = ROOT / "website" / "public" / "data" / "map" / "projet_marches.json"


def load_marches_index() -> dict[str, dict]:
    """Charge tous les marchés indexés par numero_marche, pour enrichir
    chaque match avec les champs DECP (ccag, cpv_famille, lieu, etc.)."""
    by_numero: dict[str, dict] = {}
    for f in sorted(MARCHES_DIR.glob("marches_*.json")):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for r in d.get("data") or d.get("marches") or []:
            num = r.get("numero_marche")
            if not num:
                continue
            by_numero[num] = r
    return by_numero


def main() -> None:
    if not SEED.exists():
        raise SystemExit(f"Seed introuvable : {SEED}")

    print(f"Lecture {SEED.relative_to(ROOT)}…")
    seed_rows: list[dict] = []
    with open(SEED, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("label") == "no_match":
                continue
            seed_rows.append(r)
    print(f"  {len(seed_rows)} matchs (hors no_match)")

    print("Indexation des marchés DECP…")
    marches = load_marches_index()
    print(f"  {len(marches)} marchés indexés")

    by_projet: dict[str, list[dict]] = defaultdict(list)
    enriched = 0
    for r in seed_rows:
        numero = r["numero_marche"]
        m = marches.get(numero, {})
        if m:
            enriched += 1
        rec = {
            "numero_marche": numero,
            "fournisseur_nom": m.get("fournisseur_nom") or r["fournisseur_nom"],
            "fournisseur_siret": m.get("fournisseur_siret") or r["fournisseur_siret"],
            "objet": m.get("objet") or r["marche_objet"],
            "annee": int(r["marche_annee"]) if r["marche_annee"].isdigit() else None,
            "montant_max": float(r["marche_montant"]) if r["marche_montant"] else 0,
            "montant_notifie": float(m.get("decp_montant_notifie")) if m.get("decp_montant_notifie") else None,
            "date_notification": m.get("date_notification"),
            "duree_jours": m.get("duree_jours"),
            "ccag": m.get("decp_ccag"),
            "cpv_famille": m.get("decp_cpv_famille"),
            "lieu_execution": m.get("decp_lieu_execution_lisible"),
            "score": float(r["score"]) if r["score"] else 0,
            "label": r["label"],
        }
        by_projet[r["projet_id"]].append(rec)

    # Trie par score décroissant pour chaque projet
    for projet_id in by_projet:
        by_projet[projet_id].sort(key=lambda x: -x["score"])

    print(f"  {enriched}/{len(seed_rows)} matchs enrichis depuis marches_*.json")
    print(f"  {len(by_projet)} projets distincts ont ≥1 match")

    OUTPUT.write_text(
        json.dumps({
            "generated_at": datetime.now().isoformat(),
            "source": "seed_match_projet_marches + marches-publics/marches_*.json (export local sans BQ)",
            "disclaimer": (
                "Rapprochement automatique projet↔marché par heuristiques "
                "(tokens + score). Peut contenir des erreurs. Seuil >= 0.60."
            ),
            "nb_projets": len(by_projet),
            "nb_matches": sum(len(v) for v in by_projet.values()),
            "projets": dict(by_projet),
        }, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\n→ {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
