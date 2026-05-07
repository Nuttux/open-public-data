#!/usr/bin/env python3
"""
Merge des subventions extraites du PDF (B8.1.1 du CA) dans le fichier
website/public/data/subventions/beneficiaires_YYYY.json existant.

Stratégie :
- Le fichier OpenData (générée par fetch_subventions_opendata.py) est la
  source principale pour 2018-2019 et 2022-2024 (complète).
- Pour 2020 et 2021, l'OpenData est partiel (~25 % du volume) → on COMPLÈTE
  avec les bénéficiaires PDF qui manquent dans l'OpenData.
- Les bénéficiaires présents dans les DEUX (matching par nom normalisé) :
  on garde l'entrée OpenData mais on ÉCRASE le montant_total avec celui du
  PDF (qui est plus complet : les associations recevant à la fois fonctionn-
  ement et investissement n'ont qu'une ligne consolidée dans le PDF).
- Les nouveaux bénéficiaires (présents dans PDF, absents OpenData) sont
  ajoutés tels quels.

Usage :
    python pipeline/scripts/tools/merge_subv_pdf_into_opendata.py --year 2020 \\
        --pdf /tmp/subv_2020_pdf.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SUBV_DIR = ROOT / "pipeline" / "cache" / "subventions_pre_enrichment"


def normalize_name(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--pdf", type=str, required=True, help="JSON produit par parse_subv_pdf_text.py")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    od_path = SUBV_DIR / f"beneficiaires_{args.year}.json"
    treemap_path = SUBV_DIR / f"treemap_{args.year}.json"

    if not od_path.exists():
        print(f"❌ {od_path.name} introuvable — lance d'abord fetch_subventions_opendata.py")
        sys.exit(1)
    if not pdf_path.exists():
        print(f"❌ {pdf_path} introuvable")
        sys.exit(1)

    od = json.load(open(od_path, encoding="utf-8"))
    pdf = json.load(open(pdf_path, encoding="utf-8"))

    od_data = od.get("data", [])
    pdf_data = pdf.get("data", [])

    # Index OpenData par nom normalisé
    od_by_key: dict[str, dict] = {
        normalize_name(r.get("beneficiaire") or r.get("name") or ""): r for r in od_data
    }

    print(f"  OpenData {args.year} : {len(od_data)} bénéficiaires, "
          f"{sum(r.get('montant_total', 0) for r in od_data)/1e6:.1f} M€")
    print(f"  PDF B8.1.1 : {len(pdf_data)} bénéficiaires, "
          f"{sum(r['montant_total'] for r in pdf_data)/1e6:.1f} M€")

    overwritten = 0
    added = 0
    pp_aggregated = {"montant_total": 0.0, "count": 0}  # Personnes physiques RGPD
    for p in pdf_data:
        # Anonymisation RGPD : les personnes physiques ne sont jamais
        # exposées individuellement (aides individuelles, bourses, etc.).
        # On les agrège en une seule ligne "Personnes physiques (RGPD)"
        # pour préserver le total sans révéler les identités.
        if p.get("nature_juridique") == "Personnes physiques":
            pp_aggregated["montant_total"] += p["montant_total"]
            pp_aggregated["count"] += 1
            continue

        key = p["name_normalized"]
        if key in od_by_key:
            # Écrase le montant avec celui du PDF (plus complet)
            existing = od_by_key[key]
            existing["montant_total"] = p["montant_total"]
            if not existing.get("nature_juridique") and p.get("nature_juridique"):
                existing["nature_juridique"] = p["nature_juridique"]
            if not existing.get("categorie") and p.get("categorie"):
                existing["categorie"] = p["categorie"]
            existing["source_pdf_complete"] = True
            overwritten += 1
        else:
            # Nouveau bénéficiaire absent de l'OpenData → ajouté
            new_row = {
                "beneficiaire": p["name"],
                "categorie": p.get("categorie") or "—",
                "nature_juridique": p.get("nature_juridique") or "—",
                "montant_total": p["montant_total"],
                "nb_subventions": p.get("nb_subventions", 1),
                "source": "pdf_ca_b811",
                "source_pdf": pdf.get("source_pdf"),
            }
            od_data.append(new_row)
            added += 1

    # Ajoute la ligne agrégée des personnes physiques (RGPD)
    if pp_aggregated["count"] > 0:
        od_data.append({
            "beneficiaire": f"Personnes physiques anonymisées RGPD ({pp_aggregated['count']:,} aides individuelles)".replace(",", " "),
            "categorie": "Personnes de droit privé",
            "nature_juridique": "Personnes physiques",
            "montant_total": pp_aggregated["montant_total"],
            "nb_subventions": pp_aggregated["count"],
            "source": "pdf_ca_b811_rgpd_aggregated",
            "source_pdf": pdf.get("source_pdf"),
        })
        print(f"  ℹ Agrégation RGPD : {pp_aggregated['count']} personnes physiques "
              f"= {pp_aggregated['montant_total']/1e6:.1f} M€ (1 ligne)")

    # Recompute totals
    total_montant = sum(r.get("montant_total", 0) for r in od_data)
    total_nb = sum(r.get("nb_subventions", 1) for r in od_data)

    od["data"] = od_data
    od["nb_beneficiaires"] = len(od_data)
    od["montant_total"] = total_montant
    od["nb_subventions"] = total_nb
    od["enriched_from_pdf"] = {
        "source": pdf.get("source_pdf"),
        "section": pdf.get("source_section"),
        "merged_at": datetime.now(timezone.utc).isoformat(),
        "overwritten": overwritten,
        "added": added,
    }

    od_path.write_text(json.dumps(od, ensure_ascii=False), encoding="utf-8")
    print(f"  ✓ {od_path.name} : +{added} nouveaux, {overwritten} montants mis à jour")
    print(f"  → Total après merge : {len(od_data)} bénéficiaires, {total_montant/1e6:.1f} M€")

    # Update treemap to reflect new totals (par catégorie/nature)
    if treemap_path.exists():
        from collections import defaultdict
        cat_totals = defaultdict(lambda: {"montant": 0, "count": 0})
        for r in od_data:
            cat = r.get("nature_juridique") or r.get("categorie") or "—"
            cat_totals[cat]["montant"] += r.get("montant_total", 0)
            cat_totals[cat]["count"] += 1
        treemap = json.load(open(treemap_path, encoding="utf-8"))
        treemap["data"] = [
            {"theme": k, "montant_total": v["montant"], "nb_subventions": v["count"]}
            for k, v in sorted(cat_totals.items(), key=lambda x: -x[1]["montant"])
        ]
        treemap["nb_themes"] = len(cat_totals)
        treemap_path.write_text(json.dumps(treemap, ensure_ascii=False), encoding="utf-8")
        print(f"  ✓ {treemap_path.name} : {len(cat_totals)} thèmes")


if __name__ == "__main__":
    main()
