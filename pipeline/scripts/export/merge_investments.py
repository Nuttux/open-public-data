#!/usr/bin/env python3
"""
Script de fusion des investissements localisés.

Ce script fusionne deux sources de données pour les investissements:
1. PDF "Investissements Localisés" (source principale - projets détaillés avec adresses)
2. BigQuery OpenData (complément - gros projets iconiques manquants)

MÉTHODOLOGIE DE FUSION:
-----------------------
Le PDF IL contient ~90% des projets localisés avec des descriptions détaillées
incluant souvent des adresses précises. Cependant, il manque certains gros projets
iconiques (Philharmonie, Théâtre de la Ville, etc.) qui sont dans BigQuery.

RÈGLE D'AJOUT DEPUIS BIGQUERY:
- A un arrondissement OU est un lieu iconique connu
- ET montant > 500k€ (projets significatifs)
- ET n'est PAS une subvention générique "logement social"
- ET n'est PAS déjà présent dans le PDF

LIEUX ICONIQUES (ajoutés même si catégorisés différemment):
- Philharmonie de Paris
- Théâtre de la Ville
- Opéra (Bastille, Garnier)
- Tour Eiffel
- Notre-Dame
- Hôtel de Ville

Usage:
    python merge_investments.py --year 2022
    python merge_investments.py --all

Output:
    website/public/data/map/investissements_complet_{year}.json
"""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"

# Seuil minimum pour ajouter un projet depuis BigQuery
MIN_AMOUNT_BQ = 500_000  # 500k€

# Lieux iconiques parisiens (toujours inclus même si nom contient "SUB")
LIEUX_ICONIQUES = [
    'philharmonie',
    'theatre de la ville',
    'opera bastille',
    'opera garnier',
    'tour eiffel',
    'notre-dame',
    'notre dame',
    'hotel de ville',
    'palais de tokyo',
    'petit palais',
    'grand palais',
]

# Patterns à exclure (subventions génériques non localisables)
EXCLUSION_PATTERNS = [
    r'sub.*logement\s*soci',      # SUB EQUIPEMENT LOGEMENT SOCIAL
    r'subvention.*logement',       # SUBVENTION AU TITRE DU LOGEMENT
]


# =============================================================================
# Fonctions utilitaires
# =============================================================================

def is_iconic_location(name: str) -> bool:
    """Vérifie si le nom contient un lieu iconique parisien."""
    name_lower = name.lower()
    return any(lieu in name_lower for lieu in LIEUX_ICONIQUES)


def is_excluded(name: str) -> bool:
    """Vérifie si le projet doit être exclu (subvention générique)."""
    name_lower = name.lower()
    # Ne pas exclure les lieux iconiques même s'ils contiennent "SUB"
    if is_iconic_location(name):
        return False
    return any(re.search(pattern, name_lower) for pattern in EXCLUSION_PATTERNS)


def should_add_from_bq(name: str, arrondissement: Optional[int], montant: float) -> tuple[bool, str]:
    """
    Détermine si un projet BigQuery doit être ajouté.
    
    Returns:
        tuple: (should_add, reason)
    """
    # Vérifier le montant minimum
    if montant < MIN_AMOUNT_BQ:
        return False, "MONTANT_TROP_FAIBLE"
    
    # Exclure les subventions génériques
    if is_excluded(name):
        return False, "SUBVENTION_GENERIQUE"
    
    # Inclure si lieu iconique
    if is_iconic_location(name):
        return True, "LIEU_ICONIQUE"
    
    # Inclure si a un arrondissement
    if arrondissement:
        return True, "AVEC_ARRONDISSEMENT"
    
    # Exclure le reste (citywide sans localisation)
    return False, "CITYWIDE_GENERIQUE"


def normalize_name(name: str) -> str:
    """Normalise un nom pour la comparaison."""
    # Minuscules, supprime accents et caractères spéciaux
    name = name.lower()
    name = re.sub(r'[éèêë]', 'e', name)
    name = re.sub(r'[àâä]', 'a', name)
    name = re.sub(r'[ùûü]', 'u', name)
    name = re.sub(r'[îï]', 'i', name)
    name = re.sub(r'[ôö]', 'o', name)
    name = re.sub(r'[çc]', 'c', name)
    name = re.sub(r'[^a-z0-9\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def is_similar_project(pdf_name: str, bq_name: str) -> bool:
    """
    Vérifie si deux projets sont similaires (déjà présent dans PDF).
    
    Utilise une correspondance par mots-clés significatifs.
    """
    pdf_normalized = normalize_name(pdf_name)
    bq_normalized = normalize_name(bq_name)
    
    # Extraire les mots significatifs (>3 caractères)
    bq_keywords = [w for w in bq_normalized.split() if len(w) > 3][:3]
    
    if not bq_keywords:
        return False
    
    # Tous les mots-clés doivent être présents
    return all(kw in pdf_normalized for kw in bq_keywords)


# =============================================================================
# Fusion
# =============================================================================

def load_pdf_data(year: int) -> Optional[dict]:
    """Charge les données PDF pour une année."""
    # Essayer d'abord investissements_localises, sinon investissements
    for pattern in [f'investissements_localises_{year}.json', f'investissements_{year}.json']:
        path = DATA_DIR / pattern
        if path.exists():
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
            return {
                'source': 'PDF' if 'localises' in pattern else 'BQ_ONLY',
                'path': str(path),
                'data': data.get('data', []),
                'stats': data.get('stats', {}),
            }
    return None


def load_bq_data(year: int) -> Optional[dict]:
    """Charge les données BigQuery pour une année."""
    path = DATA_DIR / f'investissements_{year}.json'
    if path.exists():
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        return {
            'source': 'BQ',
            'path': str(path),
            'data': data.get('data', []),
        }
    return None


def merge_year(year: int, dry_run: bool = False) -> dict:
    """
    Fusionne les données PDF et BigQuery pour une année.
    
    Returns:
        dict avec les statistiques et les données fusionnées
    """
    print(f"\n{'='*60}")
    print(f"📊 Fusion {year}")
    print(f"{'='*60}")
    
    # Charger les données
    pdf_result = load_pdf_data(year)
    bq_result = load_bq_data(year)
    
    if not pdf_result:
        print(f"  ⚠️ Pas de données PDF pour {year}")
        return {'year': year, 'status': 'NO_PDF_DATA'}
    
    pdf_data = pdf_result['data']
    pdf_source = pdf_result['source']
    
    print(f"  📄 PDF ({pdf_source}): {len(pdf_data)} projets")
    
    # Si pas de BQ, retourner juste le PDF
    if not bq_result or pdf_source == 'BQ_ONLY':
        print(f"  ℹ️ Pas de données BQ à fusionner")
        merged_data = pdf_data
        added_from_bq = []
    else:
        bq_data = bq_result['data']
        print(f"  🔷 BQ: {len(bq_data)} lignes")
        
        # Agréger BQ par nom (dédupliquer)
        bq_aggregated = {}
        for p in bq_data:
            name = p.get('apTexte', '')
            if name not in bq_aggregated:
                bq_aggregated[name] = {
                    'montant': 0,
                    'arrondissement': p.get('arrondissement'),
                    'missionTexte': p.get('missionTexte'),
                    'thematique': p.get('thematique'),
                }
            bq_aggregated[name]['montant'] += p['montant']
        
        print(f"  🔷 BQ unique: {len(bq_aggregated)} projets")
        
        # Identifier les projets BQ à ajouter
        added_from_bq = []
        skipped = {'MONTANT_TROP_FAIBLE': 0, 'SUBVENTION_GENERIQUE': 0, 
                   'CITYWIDE_GENERIQUE': 0, 'DEJA_DANS_PDF': 0}
        
        for name, bq_info in bq_aggregated.items():
            # Vérifier si déjà dans PDF
            already_in_pdf = any(
                is_similar_project(p.get('nom_projet', ''), name)
                for p in pdf_data
            )
            
            if already_in_pdf:
                skipped['DEJA_DANS_PDF'] += 1
                continue
            
            # Vérifier si doit être ajouté
            should_add, reason = should_add_from_bq(
                name, 
                bq_info['arrondissement'], 
                bq_info['montant']
            )
            
            if should_add:
                added_from_bq.append({
                    'nom_projet': name,
                    'montant': bq_info['montant'],
                    'arrondissement': bq_info['arrondissement'] or 0,
                    'source': 'BigQuery',
                    'reason': reason,
                    'thematique': bq_info.get('thematique', ''),
                    'type_ap': 'grands_projets',
                    'confidence': 0.9,
                })
            else:
                skipped[reason] = skipped.get(reason, 0) + 1
        
        # Fusionner
        merged_data = pdf_data.copy()
        for p in merged_data:
            p['source'] = 'PDF'
        merged_data.extend(added_from_bq)
        
        print(f"\n  ✅ Ajoutés depuis BQ: {len(added_from_bq)} projets")
        for reason, count in skipped.items():
            if count > 0:
                print(f"  ❌ Ignorés ({reason}): {count}")
    
    # Calculer les totaux
    pdf_total = sum(p['montant'] for p in pdf_data)
    merged_total = sum(p['montant'] for p in merged_data)
    added_total = sum(p['montant'] for p in added_from_bq) if added_from_bq else 0
    
    print(f"\n  📊 Résumé:")
    print(f"     PDF original: {len(pdf_data)} projets, {pdf_total/1e6:.2f} M€")
    print(f"     Ajoutés BQ:   {len(added_from_bq)} projets, {added_total/1e6:.2f} M€")
    print(f"     TOTAL:        {len(merged_data)} projets, {merged_total/1e6:.2f} M€")
    
    # Afficher les projets ajoutés
    if added_from_bq:
        print(f"\n  📋 Projets ajoutés depuis BQ:")
        added_sorted = sorted(added_from_bq, key=lambda x: -x['montant'])
        for p in added_sorted[:10]:
            arr = p['arrondissement'] if p['arrondissement'] else '?'
            print(f"     {p['montant']/1e6:6.2f} M€ | Arr {arr:>2} | {p['nom_projet'][:40]}")
    
    # Sauvegarder si pas dry_run
    if not dry_run:
        output_path = DATA_DIR / f'investissements_complet_{year}.json'
        output_data = {
            'year': year,
            'source': 'Fusion PDF + BigQuery',
            'methodology': 'PDF Investissements Localisés + Gros projets BQ (>500k€, localisables)',
            'generated_at': datetime.now().isoformat(),
            'stats': {
                'pdf_projets': len(pdf_data),
                'pdf_total': pdf_total,
                'bq_added': len(added_from_bq),
                'bq_added_total': added_total,
                'total_projets': len(merged_data),
                'total_montant': merged_total,
            },
            'data': merged_data,
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n  ✓ Sauvegardé: {output_path}")
    
    return {
        'year': year,
        'status': 'OK',
        'pdf_projets': len(pdf_data),
        'pdf_total': pdf_total,
        'bq_added': len(added_from_bq),
        'bq_added_total': added_total,
        'total_projets': len(merged_data),
        'total_montant': merged_total,
        'added_projects': added_from_bq,
    }


def update_index(years: list[int]):
    """Met à jour l'index des investissements complets."""
    index_path = DATA_DIR / 'investissements_complet_index.json'
    
    year_stats = {}
    for year in years:
        data_path = DATA_DIR / f'investissements_complet_{year}.json'
        if data_path.exists():
            with open(data_path, encoding='utf-8') as f:
                data = json.load(f)
            year_stats[year] = data.get('stats', {})
    
    index = {
        'availableYears': sorted(years, reverse=True),
        'source': 'Fusion PDF Investissements Localisés + BigQuery',
        'lastUpdate': datetime.now().isoformat(),
        'yearStats': year_stats,
    }
    
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Index mis à jour: {index_path}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Fusion des investissements PDF + BigQuery",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--year', type=int,
        help="Année spécifique à traiter"
    )
    parser.add_argument(
        '--all', action='store_true',
        help="Traiter toutes les années disponibles"
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help="Afficher sans sauvegarder"
    )
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("🔀 Fusion Investissements PDF + BigQuery")
    print("="*60)
    
    # Déterminer les années à traiter
    if args.year:
        years = [args.year]
    elif args.all:
        # Trouver toutes les années avec des données PDF
        years = []
        for f in DATA_DIR.glob('investissements_localises_*.json'):
            match = re.search(r'(\d{4})', f.name)
            if match:
                years.append(int(match.group(1)))
        # Ajouter aussi les années avec seulement BQ
        for f in DATA_DIR.glob('investissements_*.json'):
            if 'localises' not in f.name and 'complet' not in f.name and 'index' not in f.name:
                match = re.search(r'(\d{4})', f.name)
                if match:
                    year = int(match.group(1))
                    if year not in years:
                        years.append(year)
        years = sorted(years)
    else:
        print("❌ Spécifiez --year YYYY ou --all")
        return
    
    print(f"Années à traiter: {years}")
    
    # Fusionner chaque année
    results = []
    for year in years:
        result = merge_year(year, dry_run=args.dry_run)
        results.append(result)
    
    # Mettre à jour l'index
    if not args.dry_run:
        successful_years = [r['year'] for r in results if r.get('status') == 'OK']
        if successful_years:
            update_index(successful_years)
    
    # Résumé final
    print("\n" + "="*60)
    print("📊 RÉSUMÉ FINAL")
    print("="*60)
    
    total_projets = sum(r.get('total_projets', 0) for r in results if r.get('status') == 'OK')
    total_montant = sum(r.get('total_montant', 0) for r in results if r.get('status') == 'OK')
    total_added = sum(r.get('bq_added', 0) for r in results if r.get('status') == 'OK')
    
    print(f"  Années traitées: {len([r for r in results if r.get('status') == 'OK'])}")
    print(f"  Total projets:   {total_projets}")
    print(f"  Total montant:   {total_montant/1e6:.2f} M€")
    print(f"  Ajoutés de BQ:   {total_added}")
    
    if not args.dry_run:
        print("\n✅ Fusion terminée!")
        print("\nProchaine étape: Géolocaliser les projets")
        print("  python scripts/geocode_investments.py --all")


if __name__ == "__main__":
    main()
