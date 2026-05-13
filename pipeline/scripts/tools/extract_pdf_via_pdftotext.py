#!/usr/bin/env python3
"""
Extraction des projets depuis les PDFs 'Investissements Localisés' du
Compte Administratif Ville de Paris — alternative à extract_pdf_investments.py
qui ne nécessite NI clé API Gemini NI clé API Anthropic.

Pipeline :
  1. Télécharge les PDFs listés dans extract_pdf_investments.PDF_SOURCES
     (ou pour une année spécifique via --year)
  2. Convertit chaque PDF en .txt avec `pdftotext -layout`
     (nécessite poppler installé : `brew install poppler`)
  3. Parse le .txt avec parse_il_pdf_text.parse_pdf_text() — regex pure
  4. Écrit le résultat à website/public/data/map/investissements_localises_{y}.json

Reproductible, idempotent, déterministe. Précision ~85-95% des projets
identifiés (vs ~98% pour le mode Gemini, qui voit aussi les images).

Usage:
    # Extraire toutes les années configurées
    python pipeline/scripts/tools/extract_pdf_via_pdftotext.py

    # Une seule année
    python pipeline/scripts/tools/extract_pdf_via_pdftotext.py --year 2021

    # Dry-run : afficher les compteurs sans écrire
    python pipeline/scripts/tools/extract_pdf_via_pdftotext.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).parent))

from extract_pdf_investments import PDF_SOURCES  # noqa: E402
from parse_il_pdf_text import parse_pdf_text  # noqa: E402

CACHE_DIR = ROOT / "pipeline" / "cache" / "pdf_invest_session"
OUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "map"


def run(year: int, source: dict, dry_run: bool = False) -> dict:
    """Télécharge, convertit, parse et écrit pour 1 année."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = CACHE_DIR / f"il_{year}.pdf"
    txt_path = CACHE_DIR / f"il_{year}.txt"
    out_path = OUT_DIR / f"investissements_localises_{year}.json"

    # 1. Télécharger si pas déjà en cache
    if not pdf_path.exists():
        print(f"  [{year}] Téléchargement {source['url']}")
        urlretrieve(source["url"], pdf_path)
    else:
        print(f"  [{year}] PDF en cache : {pdf_path.name}")

    # 2. Convertir en texte si pas déjà fait
    if not txt_path.exists() or txt_path.stat().st_mtime < pdf_path.stat().st_mtime:
        if shutil.which("pdftotext") is None:
            raise RuntimeError(
                "pdftotext absent — installer poppler avec `brew install poppler`."
            )
        print(f"  [{year}] pdftotext -layout")
        subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), str(txt_path)],
            check=True,
        )

    # 3. Parser
    text = txt_path.read_text(encoding="utf-8")
    raw = parse_pdf_text(text)
    print(f"  [{year}] {len(raw)} projets parsés depuis le texte")

    # 4. Format final + écriture
    from datetime import date
    today = date.today().isoformat()
    out_data = []
    arr_counters: dict[int, int] = {}
    for p in raw:
        arr = p["arrondissement"]
        idx = arr_counters.get(arr, 0)
        arr_counters[arr] = idx + 1
        out_data.append({
            "id": f"{year}_{arr:02d}_il_{idx:03d}",
            "annee": year,
            "arrondissement": arr,
            "chapitre_code": "",
            "chapitre_libelle": p["chapitre_libelle"],
            "nom_projet": p["nom_projet"],
            "montant": p["montant"],
            "type_ap": p["type_ap"],
            "confidence": 0.7,
            "source_page": None,
            "source_pdf": source["url"],
            "date_extraction": today,
        })

    out_obj = {
        "year": year,
        "source": "Compte Administratif - Annexe Investissements Localisés (pdftotext + parser)",
        "extraction_date": today,
        "stats": {
            "n_projets": len(out_data),
            "total_montant": sum(p["montant"] for p in out_data),
            "n_arrondissements": len(arr_counters),
        },
        "data": out_data,
    }

    if not dry_run:
        out_path.write_text(json.dumps(out_obj, ensure_ascii=False), encoding="utf-8")
        print(f"  [{year}] → {out_path.relative_to(ROOT)}")
    else:
        print(f"  [{year}] (dry-run, pas d'écriture)")

    return {
        "year": year,
        "n_projets": len(out_data),
        "total_montant": out_obj["stats"]["total_montant"],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--year", type=int, help="Une seule année à traiter (default: toutes celles configurées)")
    ap.add_argument("--dry-run", action="store_true", help="Ne pas écrire le JSON final")
    args = ap.parse_args()

    if args.year:
        if args.year not in PDF_SOURCES:
            raise SystemExit(f"Année {args.year} non configurée dans PDF_SOURCES")
        targets = {args.year: PDF_SOURCES[args.year]}
    else:
        targets = PDF_SOURCES

    summary = []
    for year in sorted(targets):
        try:
            res = run(year, targets[year], dry_run=args.dry_run)
            summary.append(res)
        except Exception as e:
            print(f"  [{year}] ÉCHEC : {e}")

    print("\nRécap :")
    for r in summary:
        print(f"  {r['year']} : {r['n_projets']:>4} projets, {r['total_montant']/1e6:>6.1f} M€")


if __name__ == "__main__":
    main()
