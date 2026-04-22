#!/usr/bin/env python3
"""
Script d'extraction des investissements localisés depuis les PDFs de Paris.

Ce script télécharge et extrait les données des annexes "Investissements Localisés"
des Comptes Administratifs de la Ville de Paris, en utilisant Gemini 3 Pro pour
l'extraction structurée.

STRATÉGIE ANTI-HALLUCINATION:
1. Le LLM reçoit le contenu COMPLET de chaque page PDF
2. Il doit extraire UNIQUEMENT ce qu'il voit, jamais inventer
3. Validation croisée: total extrait vs total officiel de la page
4. Score de confiance obligatoire pour chaque extraction
5. Pages non conformes marquées pour revue manuelle

Usage:
    # Extraire tous les PDFs disponibles
    python scripts/extract_pdf_investments.py
    
    # Extraire une année spécifique
    python scripts/extract_pdf_investments.py --year 2024
    
    # Mode validation (vérifie les totaux)
    python scripts/extract_pdf_investments.py --validate

Output:
    - website/public/data/map/investissements_localises_{year}.json
    - paris-public-open-data/seeds/seed_pdf_investissements.csv
"""

import argparse
import csv
import json
import os
import re
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

# =============================================================================
# Configuration
# =============================================================================

# PROJECT_ROOT est la racine du dépôt (paris-budget-dashboard)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"
SEEDS_DIR = PROJECT_ROOT / "pipeline" / "seeds"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# Gemini 3 Flash — PDF multi-page extraction (images 150 DPI + tables).
# Benchmarked by Google as frontier-grade on document understanding while
# keeping Flash-level latency/cost. Override via GEMINI_MODEL env.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")

# PDFs disponibles par année
# Ces URLs pointent vers les annexes "Investissements Localisés" dédiées
PDF_SOURCES = {
    2024: {
        "url": "https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF",
        "description": "Compte Administratif 2024 - Annexe Investissements Localisés",
        "total_attendu_millions": 242.0,
    },
    2023: {
        "url": "https://cdn.paris.fr/paris/2024/07/03/ca-2023-investissements-localises-tJO3.pdf",
        "description": "Compte Administratif 2023 - Annexe Investissements Localisés",
        "total_attendu_millions": None,
    },
    2022: {
        "url": "https://cdn.paris.fr/paris/2023/07/05/09-ca-2022-investissements-localises-3owH.pdf",
        "description": "Compte Administratif 2022 - Annexe Investissements Localisés",
        "total_attendu_millions": None,
    },
    2021: {
        "url": "https://cdn.paris.fr/paris/2022/06/28/c86533a2c6f36bfe643e8dffb782c772.pdf",
        "description": "Compte Administratif 2021 - Annexes (IL inclus)",
        "total_attendu_millions": None,
    },
}

# Arrondissements de Paris
ARRONDISSEMENTS = list(range(1, 21))

# Chapitres fonctionnels M57 pour investissement
CHAPITRES_INVESTISSEMENT = {
    "900": "Services généraux",
    "901": "Sécurité et salubrité publiques",
    "902": "Enseignement - formation",
    "903": "Culture",
    "904": "Sport et jeunesse",
    "905": "Interventions sociales et santé",
    "906": "Famille",
    "907": "Logement",
    "908": "Aménagement et services urbains, environnement",
    "909": "Action économique",
    "910": "Transports",
}


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class ProjetInvestissement:
    """Un projet d'investissement extrait du PDF."""
    id: str  # Identifiant unique généré
    annee: int
    arrondissement: int
    chapitre_code: str
    chapitre_libelle: str
    nom_projet: str
    montant: float
    type_ap: str  # "entretien", "grands_projets", "budget_participatif"
    confidence: float
    source_page: int
    source_pdf: str
    date_extraction: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "annee": self.annee,
            "arrondissement": self.arrondissement,
            "chapitre_code": self.chapitre_code,
            "chapitre_libelle": self.chapitre_libelle,
            "nom_projet": self.nom_projet,
            "montant": self.montant,
            "type_ap": self.type_ap,
            "confidence": self.confidence,
            "source_page": self.source_page,
            "source_pdf": self.source_pdf,
            "date_extraction": self.date_extraction,
        }


@dataclass
class ExtractionResult:
    """Résultat d'extraction d'une page."""
    page_num: int
    arrondissement: Optional[int]
    projets: list[ProjetInvestissement]
    total_page: float
    confidence: float
    raw_text: str
    warnings: list[str] = field(default_factory=list)


# =============================================================================
# PDF Processing
# =============================================================================

def download_pdf(url: str, cache_dir: Path = None) -> Path:
    """
    Télécharge un PDF et retourne le chemin local.
    Utilise un cache pour éviter les téléchargements répétés.
    """
    if cache_dir is None:
        cache_dir = PROJECT_ROOT / ".cache" / "pdfs"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    # Nom de fichier basé sur l'URL
    filename = url.split("/")[-1]
    cache_path = cache_dir / filename
    
    if cache_path.exists():
        print(f"  📁 PDF en cache: {filename}")
        return cache_path
    
    print(f"  ⬇️ Téléchargement: {url}")
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    
    cache_path.write_bytes(response.content)
    return cache_path


def extract_pdf_pages_as_images(pdf_path: Path) -> list[tuple[int, bytes]]:
    """
    Convertit chaque page du PDF en image pour l'envoi au LLM.
    Retourne une liste de (numéro_page, image_bytes).
    
    Utilise pdf2image (poppler) si disponible, sinon PyMuPDF.
    """
    pages = []
    
    try:
        # Méthode 1: pdf2image (meilleure qualité)
        from pdf2image import convert_from_path
        import io
        
        print(f"  🖼️ Conversion PDF → images (pdf2image)...")
        images = convert_from_path(pdf_path, dpi=150, fmt="png")
        
        for i, img in enumerate(images):
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            pages.append((i + 1, buffer.getvalue()))
            
    except ImportError:
        # Méthode 2: PyMuPDF (fitz)
        try:
            import fitz  # PyMuPDF
            
            print(f"  🖼️ Conversion PDF → images (PyMuPDF)...")
            doc = fitz.open(pdf_path)
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                # Render at 150 DPI
                mat = fitz.Matrix(150/72, 150/72)
                pix = page.get_pixmap(matrix=mat)
                pages.append((page_num + 1, pix.tobytes("png")))
                
            doc.close()
            
        except ImportError:
            raise ImportError(
                "Nécessite pdf2image (pip install pdf2image) ou PyMuPDF (pip install pymupdf)"
            )
    
    print(f"  ✓ {len(pages)} pages extraites")
    return pages


def extract_pdf_text(pdf_path: Path) -> list[tuple[int, str]]:
    """
    Extrait le texte de chaque page du PDF.
    Retourne une liste de (numéro_page, texte).
    """
    pages = []
    
    try:
        import fitz  # PyMuPDF
        
        doc = fitz.open(pdf_path)
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            pages.append((page_num + 1, text))
        doc.close()
        
    except ImportError:
        # Fallback: pdfplumber
        try:
            import pdfplumber
            
            with pdfplumber.open(pdf_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    pages.append((i + 1, text))
                    
        except ImportError:
            raise ImportError(
                "Nécessite PyMuPDF (pip install pymupdf) ou pdfplumber (pip install pdfplumber)"
            )
    
    return pages


# =============================================================================
# Regex-based Extraction (Fallback when no LLM quota)
# =============================================================================

def extract_page_with_regex(
    page_num: int,
    page_content: str,
    year: int,
    pdf_source: str,
    forced_arrondissement: Optional[int] = None,
) -> ExtractionResult:
    """
    Extraction basée sur des regex - utilisé comme fallback quand le quota LLM est épuisé.
    
    Cette méthode parse le texte structuré des pages IL qui suivent un format prévisible:
    - Pages récapitulatives: Type AP / Chapitre / MONTANT
    - Pages détails: Direction > Projet > Montant
    """
    projets = []
    warnings = []
    
    # Détecter l'arrondissement (utiliser forced_arrondissement si fourni)
    if forced_arrondissement is not None:
        arrondissement = forced_arrondissement
    else:
        arr_match = re.search(r'(\d{1,2})[eè]me\s+ARRONDISSEMENT', page_content, re.IGNORECASE)
        if arr_match:
            arrondissement = int(arr_match.group(1))
        elif 'CENTRE' in page_content.upper() or 'SECTEUR CENTRE' in page_content.upper():
            arrondissement = 0  # Paris Centre (1-4)
        else:
            arrondissement = None
    
    # Détecter le type de page
    is_summary = 'Présentation par type' in page_content or 'Type AP' in page_content
    is_detail = 'Principales opérations' in page_content
    
    # Pattern pour les montants: 
    # - "1 234 567,89" ou "1234567.89" (avec décimales)
    # - "1 234 567" ou "6 0 629" (sans décimales, espaces variés)
    # On capture les groupes de chiffres séparés par espaces EN FIN DE LIGNE
    amount_pattern = r'(\d[\d\s]+\d)(?:[,\.]\d{2})?(?:\s*€?)?$'
    
    if is_summary and not is_detail:
        # Page récapitulative UNIQUEMENT - extraire le total général comme référence
        # Mais ne pas extraire les lignes individuelles (éviter double comptage)
        total_match = re.search(r'Total\s+g[eé]n[eé]ral\s*\n?\s*' + amount_pattern, page_content, re.IGNORECASE)
        if total_match:
            amount_str = total_match.group(1).replace(' ', '').replace(',', '.')
            try:
                total_page = float(amount_str)
            except ValueError:
                total_page = 0
        else:
            total_page = 0
        
        # On ne crée pas de projets depuis les pages récapitulatives
        # pour éviter le double comptage avec les pages de détails
        warnings.append(f"Page récapitulative ignorée (total={total_page:.0f}€)")
        
        return ExtractionResult(
            page_num=page_num,
            arrondissement=arrondissement,
            projets=[],
            total_page=total_page,
            confidence=0.9,
            raw_text=page_content[:500],
            warnings=warnings,
        )
    
    if is_summary:
        # Page récapitulative - extraire les totaux par chapitre
        # Format multiligne: chapitre sur une ligne, montant sur la suivante
        lines = page_content.split('\n')
        current_type = "autre"
        prev_line = ""
        
        for line in lines:
            line = line.strip()
            
            # Détecter le type d'AP
            if 'Entretien' in line and 'Total' not in line:
                current_type = "entretien"
            elif 'Grands projets' in line and 'Total' not in line:
                current_type = "grands_projets"
            elif 'Budget participatif' in line and 'Total' not in line:
                current_type = "budget_participatif"
            
            # Extraire les montants
            amount_match = re.search(amount_pattern, line)
            if amount_match:
                amount_str = amount_match.group(1).replace(' ', '').replace(',', '.')
                try:
                    amount = float(amount_str)
                    
                    # Le nom est sur la ligne précédente ou avant le montant
                    name = prev_line.strip()
                    before_amount = line[:amount_match.start()].strip()
                    if before_amount and len(before_amount) > 5:
                        name = before_amount
                    
                    # Filtrer les totaux et en-têtes
                    skip_words = ['Total', 'MONTANT', 'Type AP', 'Chapitre']
                    should_skip = any(w.lower() in name.lower() for w in skip_words)
                    
                    if name and len(name) > 5 and amount > 0 and not should_skip:
                        projet = ProjetInvestissement(
                            id=f"{year}_{arrondissement or 0:02d}_{page_num}_{len(projets):03d}",
                            annee=year,
                            arrondissement=arrondissement or 0,
                            chapitre_code="",
                            chapitre_libelle=name,
                            nom_projet=name,
                            montant=amount,
                            type_ap=current_type,
                            confidence=0.8,  # Confiance plus haute pour récapitulatifs
                            source_page=page_num,
                            source_pdf=pdf_source,
                        )
                        projets.append(projet)
                except ValueError:
                    continue
            
            prev_line = line
    
    elif is_detail:
        # Page détails - extraire les projets individuels
        # Format: nom_projet sur une ligne, montant sur la ligne suivante
        lines = page_content.split('\n')
        current_direction = ""
        current_type = "autre"
        prev_line = ""
        
        for i, line in enumerate(lines):
            line = line.strip()
            
            # Détecter la direction
            directions = ['Affaires Scolaires', 'Affaires Culturelles', 'Voirie', 
                         'Jeunesse et Sports', 'Environnement', 'Famille',
                         'Décentralisation']
            for d in directions:
                if d in line and not re.search(amount_pattern, line):
                    current_direction = d
                    break
            
            # Détecter le type d'AP
            if 'Entretien' in line and ('réparations' in line.lower() or 'aménagements' in line.lower()):
                current_type = "entretien"
            elif 'Grands projets' in line:
                current_type = "grands_projets"
            elif 'Budget participatif' in line:
                current_type = "budget_participatif"
            
            # Extraire les montants
            amount_match = re.search(amount_pattern, line)
            if amount_match:
                amount_str = amount_match.group(1).replace(' ', '').replace(',', '.')
                try:
                    amount = float(amount_str)
                    
                    # Le nom du projet est sur la ligne PRÉCÉDENTE
                    name = prev_line.strip()
                    
                    # Ou sur la même ligne (avant le montant)
                    before_amount = line[:amount_match.start()].strip()
                    if before_amount and len(before_amount) > 10:
                        name = before_amount
                    
                    # Nettoyer
                    name = re.sub(r'[\.]{2,}', '', name).strip()
                    name = re.sub(r'\s+', ' ', name)
                    
                    # Filtrer les lignes qui ne sont pas des projets
                    skip_words = ['MONTANT', 'Total', 'Chapitre', 'Type AP', 'Entretien -']
                    should_skip = any(w in name for w in skip_words)
                    
                    if name and len(name) > 10 and amount > 0 and not should_skip:
                        projet = ProjetInvestissement(
                            id=f"{year}_{arrondissement or 0:02d}_{page_num}_{len(projets):03d}",
                            annee=year,
                            arrondissement=arrondissement or 0,
                            chapitre_code="",
                            chapitre_libelle=current_direction,
                            nom_projet=name,
                            montant=amount,
                            type_ap=current_type,
                            confidence=0.7,
                            source_page=page_num,
                            source_pdf=pdf_source,
                        )
                        projets.append(projet)
                except ValueError:
                    continue
            
            prev_line = line
    
    else:
        # Page non reconnue
        warnings.append("Format de page non reconnu pour extraction regex")
    
    # Calculer le total
    total = sum(p.montant for p in projets)
    
    # Vérifier la cohérence
    total_match = re.search(r'Total\s+g[eé]n[eé]ral\s*' + amount_pattern, page_content, re.IGNORECASE)
    if total_match:
        expected_str = total_match.group(1).replace(' ', '').replace(',', '.')
        try:
            expected = float(expected_str)
            if abs(total - expected) > 100:
                warnings.append(f"Écart total: calculé={total:.0f}€, attendu={expected:.0f}€")
        except ValueError:
            pass
    
    return ExtractionResult(
        page_num=page_num,
        arrondissement=arrondissement,
        projets=projets,
        total_page=total,
        confidence=0.6 if projets else 0,
        raw_text=page_content[:500],
        warnings=warnings,
    )


# =============================================================================
# LLM Extraction
# =============================================================================

def identify_il_pages(pages_text: list[tuple[int, str]]) -> list[int]:
    """
    Identifie les pages contenant des Investissements Localisés.
    
    Les pages IL ont généralement:
    - Un titre avec l'arrondissement ("15ème ARRONDISSEMENT")  
    - Des sections par type d'AP (Entretien, Grands projets, Budget participatif)
    - Des directions (Affaires Scolaires, Culture, etc.)
    - Des montants en euros
    """
    il_pages = []
    
    # Patterns pour identifier les pages avec données d'arrondissement
    arr_patterns = [
        r'\d+[eè]me?\s+ARRONDISSEMENT',  # "15ème ARRONDISSEMENT"
        r'MAIRIE\s+DE\s+SECTEUR\s+CENTRE',  # Paris Centre
        r'PARIS\s+CENTRE',  # Paris Centre alt
        r'Principales\s+op[eé]rations',  # Section détails
    ]
    
    # Patterns pour identifier les pages avec données financières
    data_patterns = [
        r'Entretien,?\s*r[eé]parations',  # Type AP
        r'Grands\s+projets',  # Type AP
        r'Budget\s+participatif',  # Type AP
        r'Affaires\s+Scolaires',  # Direction
        r'Affaires\s+Culturelles',  # Direction
        r'Voirie\s+et\s+d[eé]placements',  # Direction
        r'Jeunesse\s+et\s+Sports',  # Direction
        r'Total\s+(g[eé]n[eé]ral|Entretien|Grands)',  # Lignes totaux
    ]
    
    for page_num, text in pages_text:
        # Page trop courte = probablement titre uniquement
        if len(text) < 200:
            continue
            
        # Vérifier si la page contient des patterns d'arrondissement
        has_arr = any(re.search(p, text, re.IGNORECASE) for p in arr_patterns)
        
        # Vérifier si la page contient des patterns de données
        has_data = any(re.search(p, text, re.IGNORECASE) for p in data_patterns)
        
        # Vérifier qu'il y a des montants (formats variés: 
        # - 1 234 567,89 ou 1234567.89 (avec décimales)
        # - 1 234 567 ou 1234567 (sans décimales, PDF 2022)
        # - 6 0 629 (espaces bizarres du PDF)
        has_amounts = bool(
            re.search(r'\d[\d\s]{2,}\d[,\.]\d{2}', text) or  # Avec décimales
            re.search(r'\d{1,3}(?:\s\d{3})+', text) or       # Format français normal
            re.search(r'\d+\s+\d{3}', text)                   # Format avec espaces
        )
        
        if has_data and has_amounts:
            il_pages.append(page_num)
    
    return il_pages


def extract_page_with_llm(
    page_num: int,
    page_content: str,
    year: int,
    pdf_source: str,
) -> ExtractionResult:
    """
    Extrait les données d'investissement d'une page via Gemini 3 Pro.
    
    STRATÉGIE ANTI-HALLUCINATION:
    1. Prompt strict: extraire UNIQUEMENT ce qui est visible
    2. Demander le total de la page pour validation croisée
    3. Score de confiance obligatoire
    4. Warnings si incertitude
    """
    
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY non configurée")
    
    # Import du nouveau SDK Google GenAI
    from google import genai
    
    system_prompt = """Tu es un extracteur de données budgétaires pour la Ville de Paris.

MISSION: Extraire les projets d'investissement d'une page de PDF budgétaire.

RÈGLES STRICTES ANTI-HALLUCINATION:
1. Extrais UNIQUEMENT ce qui est VISIBLE sur la page - JAMAIS inventer
2. Si un texte est coupé ou illisible, mets "..." et baisse la confiance
3. Si tu n'es pas sûr d'un montant, mets confidence < 0.7
4. Le TOTAL que tu calcules DOIT correspondre aux projets extraits
5. Signale toute incohérence dans les warnings

FORMAT DE PAGE TYPIQUE:
- Titre: "XXème ARRONDISSEMENT" ou "PARIS CENTRE"
- Sections par type: "Entretien, réparations et aménagements", "Grands projets", "Budget participatif"
- Sous-sections par chapitre: "Chapitre 902 - Enseignement", "Chapitre 903 - Culture"
- Lignes projet: "Nom du projet ............ 1 234 567 €"

ARRONDISSEMENTS:
- Paris Centre = arrondissements 1, 2, 3, 4 (fusionnés)
- Sinon 5 à 20

TYPES D'AP:
- entretien: "Entretien, réparations et aménagements"
- grands_projets: "Grands projets"
- budget_participatif: "Budget participatif"

Réponds UNIQUEMENT en JSON valide."""

    user_prompt = f"""Extrais les projets d'investissement de cette page du Compte Administratif {year} de Paris:

PAGE {page_num}:
```
{page_content[:15000]}  
```

INSTRUCTIONS:
1. Cette page fait partie de l'annexe "Investissements Localisés" par arrondissement
2. Extrais TOUS les projets avec leur montant
3. Identifie l'arrondissement (1-20) ou "Centre" (1-4 fusionnés)
4. Les montants sont en EUROS (ex: 1 234 567,89 = 1234567.89)

Retourne un JSON avec cette structure EXACTE:
{{
    "arrondissement": <1-20 ou 0 pour Centre, ou null si pas identifiable>,
    "est_page_il": <true si la page contient des projets d'investissement avec montants>,
    "projets": [
        {{
            "type_ap": "entretien|grands_projets|budget_participatif",
            "direction": "<nom de la direction si visible>",
            "nom_projet": "<nom complet du projet>",
            "montant": <nombre en euros, ex: 88485.96>,
            "confidence": <0.0-1.0>
        }}
    ],
    "total_page": <somme de tous les montants extraits>,
    "total_page_indique": <total affiché sur la page si visible, sinon null>,
    "confidence_globale": <0.0-1.0>,
    "warnings": ["liste des problèmes si présents"]
}}

IMPORTANT:
- Si la page contient un tableau récapitulatif (Type AP / Chapitre / MONTANT), extrais les lignes comme projets avec nom_projet = chapitre
- Si la page liste des "Principales opérations", extrais chaque projet individuellement
- Montants TOUJOURS en euros décimaux (pas en milliers)
- est_page_il = true dès qu'il y a au moins un projet avec un montant"""

    try:
        # Nouveau SDK google-genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        # Combiner system prompt et user prompt
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=full_prompt,
            config={"temperature": 0.1, "max_output_tokens": 4000}
        )
        
        # Parser la réponse JSON
        result = parse_llm_json(response.text)
        
        if not result.get("est_page_il", False):
            return ExtractionResult(
                page_num=page_num,
                arrondissement=None,
                projets=[],
                total_page=0,
                confidence=result.get("confidence_globale", 0),
                raw_text=page_content[:1000],
                warnings=["Page non-IL détectée"],
            )
        
        # Construire les objets Projet
        projets = []
        for i, p in enumerate(result.get("projets", [])):
            projet = ProjetInvestissement(
                id=f"{year}_{result.get('arrondissement', 0):02d}_{page_num}_{i:03d}",
                annee=year,
                arrondissement=result.get("arrondissement") or 0,
                chapitre_code=p.get("chapitre_code", ""),
                chapitre_libelle=p.get("chapitre_libelle", ""),
                nom_projet=p.get("nom_projet", ""),
                montant=float(p.get("montant", 0)),
                type_ap=p.get("type_ap", "autre"),
                confidence=float(p.get("confidence", 0.5)),
                source_page=page_num,
                source_pdf=pdf_source,
            )
            projets.append(projet)
        
        # Validation croisée
        total_calcule = sum(p.montant for p in projets)
        total_indique = result.get("total_page_indique")
        
        warnings = result.get("warnings", [])
        
        if total_indique and abs(total_calcule - total_indique) > 100:
            ecart = abs(total_calcule - total_indique)
            warnings.append(f"Écart total: calculé={total_calcule:.0f}€, indiqué={total_indique:.0f}€, diff={ecart:.0f}€")
        
        return ExtractionResult(
            page_num=page_num,
            arrondissement=result.get("arrondissement"),
            projets=projets,
            total_page=total_calcule,
            confidence=result.get("confidence_globale", 0.5),
            raw_text=page_content[:1000],
            warnings=warnings,
        )
        
    except Exception as e:
        return ExtractionResult(
            page_num=page_num,
            arrondissement=None,
            projets=[],
            total_page=0,
            confidence=0,
            raw_text=page_content[:500],
            warnings=[f"Erreur extraction: {str(e)}"],
        )


def parse_llm_json(text: str) -> dict:
    """Parse une réponse JSON du LLM."""
    text = text.strip()
    
    # Gérer les blocs markdown
    if "```" in text:
        match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if match:
            text = match.group(1).strip()
    
    # Trouver le JSON
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        text = text[start:end+1]
    
    return json.loads(text)


# =============================================================================
# Main Extraction Pipeline
# =============================================================================

def extract_year(year: int, validate_only: bool = False, mode: str = "auto") -> dict:
    """
    Extrait les investissements localisés pour une année.
    
    Returns:
        dict avec:
        - year: l'année
        - projets: liste des projets extraits
        - stats: statistiques d'extraction
        - validation: résultat de validation
    """
    if year not in PDF_SOURCES:
        raise ValueError(f"Pas de PDF disponible pour {year}")
    
    source = PDF_SOURCES[year]
    print(f"\n{'='*60}")
    print(f"📄 Extraction {year}: {source['description']}")
    print(f"{'='*60}")
    
    # Télécharger le PDF
    pdf_path = download_pdf(source["url"])
    
    # Extraire le texte
    print(f"  📝 Extraction du texte...")
    pages_text = extract_pdf_text(pdf_path)
    print(f"  ✓ {len(pages_text)} pages")
    
    # Identifier les pages IL
    print(f"  🔍 Identification des pages IL...")
    il_pages = identify_il_pages(pages_text)
    print(f"  ✓ {len(il_pages)} pages IL détectées")
    
    if not il_pages:
        print(f"  ⚠️ Aucune page IL trouvée, extraction de toutes les pages...")
        il_pages = [p[0] for p in pages_text]
    
    # Extraire chaque page IL
    all_projets = []
    all_warnings = []
    stats = {
        "pages_traitees": 0,
        "pages_il": 0,
        "projets_extraits": 0,
        "total_extrait": 0,
        "confidence_moyenne": 0,
    }
    
    # Déterminer si on utilise LLM ou regex
    use_llm = mode == "llm" or (mode == "auto" and GEMINI_API_KEY)
    llm_failed_count = 0
    MAX_LLM_FAILURES = 3  # Basculer en regex après N échecs consécutifs
    
    # État courant de l'arrondissement (détecté sur les pages titres)
    current_arrondissement = None
    
    # D'abord, scanner toutes les pages pour détecter les arrondissements
    # On ne détecte que sur les pages TITRE (courtes, avec arrondissement en gros)
    arr_by_page = {}
    for page_num, page_text in pages_text:
        # Les pages titre sont très courtes (< 100 chars)
        is_title_page = len(page_text.strip()) < 100
        
        # Chercher un arrondissement sur cette page
        arr_match = re.search(r'(\d{1,2})[eè]me\s+ARRONDISSEMENT', page_text, re.IGNORECASE)
        if arr_match:
            arr_by_page[page_num] = int(arr_match.group(1))
        elif is_title_page and ('CENTRE' in page_text.upper() or 'SECTEUR CENTRE' in page_text.upper()):
            arr_by_page[page_num] = 0  # Paris Centre
    
    # Propager l'arrondissement vers les pages suivantes
    for page_num, page_text in pages_text:
        # Mettre à jour l'arrondissement courant si cette page en définit un
        if page_num in arr_by_page:
            current_arrondissement = arr_by_page[page_num]
        
        if page_num not in il_pages:
            continue
        
        print(f"  📄 Page {page_num}...", end=" ")
        
        result = None
        
        # Essayer LLM si disponible
        if use_llm and llm_failed_count < MAX_LLM_FAILURES:
            try:
                result = extract_page_with_llm(
                    page_num=page_num,
                    page_content=page_text,
                    year=year,
                    pdf_source=source["url"],
                )
                llm_failed_count = 0  # Reset on success
            except Exception as e:
                llm_failed_count += 1
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    print(f"⚠️ Quota API épuisé, bascule en mode regex")
                    use_llm = False
                else:
                    print(f"⚠️ Erreur LLM: {e}")
        
        # Fallback regex
        if result is None or not result.projets:
            result = extract_page_with_regex(
                page_num=page_num,
                page_content=page_text,
                year=year,
                pdf_source=source["url"],
                forced_arrondissement=current_arrondissement,
            )
            if not use_llm:
                result.warnings.append("Extraction regex (quota LLM épuisé)")
        
        stats["pages_traitees"] += 1
        
        if result.projets:
            stats["pages_il"] += 1
            stats["projets_extraits"] += len(result.projets)
            stats["total_extrait"] += result.total_page
            
            all_projets.extend(result.projets)
            
            arr_str = f"{result.arrondissement}ème" if result.arrondissement else "?"
            print(f"✓ {arr_str} - {len(result.projets)} projets, {result.total_page/1e6:.2f}M€")
        else:
            print(f"- (non-IL)")
        
        if result.warnings:
            all_warnings.extend([f"Page {page_num}: {w}" for w in result.warnings])
        
        # Rate limiting
        time.sleep(0.5)
    
    # Calculer la confiance moyenne
    if all_projets:
        stats["confidence_moyenne"] = sum(p.confidence for p in all_projets) / len(all_projets)
    
    # Validation
    validation = {
        "total_attendu": source.get("total_attendu_millions"),
        "total_extrait_millions": stats["total_extrait"] / 1e6,
        "ecart_pourcent": None,
        "valide": None,
    }
    
    if validation["total_attendu"]:
        ecart = abs(validation["total_extrait_millions"] - validation["total_attendu"])
        validation["ecart_pourcent"] = (ecart / validation["total_attendu"]) * 100
        validation["valide"] = validation["ecart_pourcent"] < 10  # Tolérance 10%
    
    print(f"\n📊 Résumé {year}:")
    print(f"   - Pages traitées: {stats['pages_traitees']}")
    print(f"   - Pages IL: {stats['pages_il']}")
    print(f"   - Projets extraits: {stats['projets_extraits']}")
    print(f"   - Total extrait: {stats['total_extrait']/1e6:.2f} M€")
    print(f"   - Confiance moyenne: {stats['confidence_moyenne']:.0%}")
    
    if validation["total_attendu"]:
        status = "✅" if validation["valide"] else "⚠️"
        print(f"   {status} Validation: {validation['total_extrait_millions']:.1f}M€ vs {validation['total_attendu']:.1f}M€ attendu ({validation['ecart_pourcent']:.1f}% écart)")
    
    if all_warnings:
        print(f"   ⚠️ {len(all_warnings)} warnings")
    
    return {
        "year": year,
        "projets": [p.to_dict() for p in all_projets],
        "stats": stats,
        "validation": validation,
        "warnings": all_warnings,
    }


def save_results(data: dict, year: int):
    """Sauvegarde les résultats en JSON et CSV."""
    
    # JSON pour le frontend
    json_path = OUTPUT_DIR / f"investissements_localises_{year}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "year": year,
            "source": "PDF Compte Administratif",
            "extraction_date": datetime.now().strftime("%Y-%m-%d"),
            "stats": data["stats"],
            "validation": data["validation"],
            "data": data["projets"],
        }, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Sauvegardé: {json_path}")
    
    # CSV pour dbt seed
    SEEDS_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = SEEDS_DIR / f"seed_pdf_investissements_{year}.csv"
    
    if data["projets"]:
        fieldnames = list(data["projets"][0].keys())
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data["projets"])
        print(f"  ✓ Sauvegardé: {csv_path}")


def update_index(years_extracted: list[int]):
    """Met à jour l'index des investissements localisés."""
    index_path = OUTPUT_DIR / "investissements_localises_index.json"
    
    # Charger les stats de chaque année
    all_stats = {}
    for year in years_extracted:
        json_path = OUTPUT_DIR / f"investissements_localises_{year}.json"
        if json_path.exists():
            with open(json_path) as f:
                data = json.load(f)
            all_stats[year] = {
                "nb_projets": data["stats"]["projets_extraits"],
                "total_millions": data["stats"]["total_extrait"] / 1e6,
                "validation": data["validation"],
            }
    
    index = {
        "availableYears": sorted(years_extracted, reverse=True),
        "source": "Extraction PDF Comptes Administratifs",
        "lastUpdate": datetime.now().strftime("%Y-%m-%d"),
        "yearStats": all_stats,
    }
    
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Index mis à jour: {index_path}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Extraction des investissements localisés depuis les PDFs de Paris",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
    # Extraire avec LLM (meilleure qualité, nécessite quota API)
    python scripts/extract_pdf_investments.py --year 2024
    
    # Extraire avec regex uniquement (pas de quota requis)
    python scripts/extract_pdf_investments.py --year 2024 --mode regex
    
    # Extraire avec fallback auto (LLM si dispo, sinon regex)
    python scripts/extract_pdf_investments.py --year 2024 --mode auto

Prérequis:
    pip install google-genai pymupdf pdfplumber
    export GEMINI_API_KEY='votre_clé'  # Optionnel si mode regex
        """
    )
    parser.add_argument(
        "--year",
        type=int,
        choices=list(PDF_SOURCES.keys()),
        help="Année spécifique à extraire"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Mode validation uniquement"
    )
    parser.add_argument(
        "--mode",
        choices=["llm", "regex", "auto"],
        default="auto",
        help="Mode d'extraction: llm (Gemini), regex (sans API), auto (fallback)"
    )
    parser.add_argument(
        "--pages",
        type=str,
        help="Pages spécifiques à extraire (ex: '1-10,15,20-25')"
    )
    
    args = parser.parse_args()
    
    print("\n" + "=" * 60)
    print("📄 Paris Budget - Extraction PDF Investissements Localisés")
    print(f"   Modèle LLM: {GEMINI_MODEL}")
    print("=" * 60)
    
    if not GEMINI_API_KEY:
        print("\n❌ GEMINI_API_KEY non configurée")
        print("   export GEMINI_API_KEY='votre_clé'")
        return
    
    # Déterminer les années à traiter
    years = [args.year] if args.year else list(PDF_SOURCES.keys())
    
    # Extraire
    years_extracted = []
    for year in years:
        try:
            data = extract_year(year, validate_only=args.validate, mode=args.mode)
            if not args.validate:
                save_results(data, year)
            years_extracted.append(year)
        except Exception as e:
            print(f"\n❌ Erreur pour {year}: {e}")
            import traceback
            traceback.print_exc()
    
    # Mettre à jour l'index
    if years_extracted and not args.validate:
        update_index(years_extracted)
    
    print("\n" + "=" * 60)
    print("✅ Extraction terminée!")
    print("=" * 60)
    
    if not args.validate:
        print("\nProchaines étapes:")
        print("  1. Vérifier les warnings et corriger si nécessaire")
        print("  2. dbt seed  # Charger les CSV dans BigQuery")
        print("  3. dbt run   # Reconstruire les modèles")


if __name__ == "__main__":
    main()
