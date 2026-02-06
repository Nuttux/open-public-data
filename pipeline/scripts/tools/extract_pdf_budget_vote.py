#!/usr/bin/env python3
"""
Extract Budget Voté (BP) data from editique BG PDFs using pdfplumber.

Strategy:
  1. Use fitz (PyMuPDF) for fast page scanning to find:
     a) "Présentation croisée" section (ventilated operations: 90x/93x)
     b) "Opérations non ventilées" section (fiscal: 92x/94x)
  2. Use pdfplumber extract_text() and parse with regex for robust data extraction.
     This avoids pdfplumber's extract_tables() which misses data on continuation pages.
  3. Track context (section, chapitre, sens_flux) across page boundaries
     for multi-page tables.

The non-ventilated operations (chapters 940-943, 921-926) contain the bulk of
Paris's recettes (fiscalité directe/indirecte, dotations, emprunts) which are
NOT in the "Présentation croisée" section.

Output: seed CSV compatible with the stg_budget_vote pipeline.

Usage:
    python extract_pdf_budget_vote.py --year 2025
    python extract_pdf_budget_vote.py --all
    python extract_pdf_budget_vote.py --year 2025 --dry-run
"""

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SEEDS_DIR = PROJECT_ROOT / "pipeline" / "seeds"
CACHE_DIR = PROJECT_ROOT / "pipeline" / "scripts" / ".cache" / "pdfs"

# PDF sources: editique BG (Budget Général) - Part 1 only
# Part 1 always contains the "Présentation croisée" section
PDF_SOURCES = {
    2023: {
        "url": "https://cdn.paris.fr/paris/2023/02/15/bp-2023-editique-bg_partie01-QLeA.pdf",
        "description": "BP 2023 - Éditique BG Partie 1",
    },
    2024: {
        "url": "https://cdn.paris.fr/paris/2024/02/21/1-bp-2024-editique-premierepartie-bg-ZFnH.pdf",
        "description": "BP 2024 - Éditique BG Partie 1",
    },
    2025: {
        "url": "https://cdn.paris.fr/paris/2025/01/17/bp-2025-editique-premiere-parite-bg-weCs.pdf",
        "description": "BP 2025 - Éditique BG Partie 1",
    },
    2026: {
        "url": "https://cdn.paris.fr/paris/2026/01/21/bp-2026-editique-premiere-partie-bg-bxlu.pdf",
        "description": "BP 2026 - Éditique BG Partie 1",
    },
}

# Regex patterns
# Sub-codes can be 2-4 digits: "90-10", "90-020", "93-0341"
FUNC_CODE_RE = re.compile(r'(\d{2,3})-(\d{2,4})')
NATURE_LINE_RE = re.compile(r'^\d{3}\s', re.MULTILINE)
AMOUNT_RE = re.compile(r'(?<!\d)((?:\d{1,3}(?:\s\d{3})*),\d{2})(?!\d)')


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class BudgetVoteLine:
    """One extracted budget vote line (nature × fonction × chapitre)."""
    annee: int
    section: str                # "Investissement" or "Fonctionnement"
    sens_flux: str              # "Dépense" or "Recette"
    chapitre_code: str          # e.g. "900", "930"
    chapitre_libelle: str       # e.g. "Services généraux"
    nature_code: str            # e.g. "203", "604"
    nature_libelle: str         # e.g. "Frais d'études..."
    fonction_code: str          # e.g. "020", "021"
    montant: float              # Crédits votés (€)
    source_page: int            # PDF page number (1-indexed)
    source_pdf: str             # Source PDF filename


# =============================================================================
# PDF Download
# =============================================================================

def download_pdf(url: str) -> Path:
    """Download a PDF to the cache directory. Returns the local path."""
    import requests
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    filename = url.split("/")[-1]
    cache_path = CACHE_DIR / filename

    if cache_path.exists():
        print(f"  [cache] PDF en cache: {filename}")
        return cache_path

    print(f"  [download] {url}")
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    cache_path.write_bytes(response.content)
    print(f"  [ok] Telecharge: {len(response.content) / 1e6:.1f} Mo")
    return cache_path


# =============================================================================
# Page Scanning (fitz - fast)
# =============================================================================

@dataclass
class PageInfo:
    """Metadata for a page in the présentation croisée section."""
    page_idx: int
    is_continuation: bool
    section: str                 # "Investissement" or "Fonctionnement"
    chapitre_ref: str            # e.g. "A1.900", "A2.930" (empty for continuation)
    chapitre_code: str           # e.g. "900", "930"
    chapitre_libelle: str        # e.g. "Services généraux"


def find_all_croisee_pages(pdf_path: Path) -> list[PageInfo]:
    """
    Find ALL pages in the "Présentation croisée" section, including
    continuation pages that don't have the section header.

    Returns sorted list of PageInfo with context populated for continuations.
    """
    import fitz
    doc = fitz.open(str(pdf_path))

    # Phase 1: Find labeled (header) pages
    labeled_pages = {}
    for i in range(len(doc)):
        text = doc[i].get_text()[:600]
        upper = text.upper()

        if "PRESENTATION CROISEE" not in upper:
            continue
        if "PRESENTATION DETAILLEE" not in upper and "PRÉSENTATION DÉTAILLÉE" not in upper:
            continue

        # Determine section
        if "INVESTISSEMENT" in upper:
            section = "Investissement"
        elif "FONCTIONNEMENT" in upper:
            section = "Fonctionnement"
        else:
            continue

        # Extract chapitre reference (e.g. "A1.900", "A2.930-5")
        ref_match = re.search(r'(A[12]\.\d{3}(?:-\d)?)', text)
        if not ref_match:
            continue

        chapitre_ref = ref_match.group(1)
        chapitre_code = chapitre_ref.split(".")[1]

        # Extract chapitre libelle from FONCTION or CHAPITRE header
        # Strip "(suite N)" suffixes from continuation-style headers
        libelle = ""
        for line in text.split("\n"):
            fonc_match = re.search(
                r'FONCTION\s+\S+\s*[–\-]\s*(.+)', line, re.IGNORECASE
            )
            chap_match = re.search(
                r'CHAPITRE\s+\d+\s*[–\-]\s*(.+)', line, re.IGNORECASE
            )
            if fonc_match:
                libelle = fonc_match.group(1).strip()
                break
            if chap_match:
                libelle = chap_match.group(1).strip()
                break

        # Clean up "(suite N)" suffixes for consistency
        libelle = re.sub(r'\s*\(suite\s*\d*\)\s*$', '', libelle, flags=re.IGNORECASE)

        labeled_pages[i] = PageInfo(
            page_idx=i,
            is_continuation=False,
            section=section,
            chapitre_ref=chapitre_ref,
            chapitre_code=chapitre_code,
            chapitre_libelle=libelle,
        )

    if not labeled_pages:
        doc.close()
        return []

    # Phase 2: Find continuation pages in the range
    first_page = min(labeled_pages.keys())
    last_page = max(labeled_pages.keys())
    all_pages = dict(labeled_pages)

    for i in range(first_page, last_page + 1):
        if i in all_pages:
            continue

        text = doc[i].get_text()
        has_funcs = bool(FUNC_CODE_RE.search(text[:500]))
        has_natures = bool(NATURE_LINE_RE.search(text))

        if has_funcs and has_natures:
            # Inherit context from closest preceding labeled page
            ctx = None
            for j in range(i - 1, first_page - 1, -1):
                if j in labeled_pages:
                    ctx = labeled_pages[j]
                    break

            if ctx:
                all_pages[i] = PageInfo(
                    page_idx=i,
                    is_continuation=True,
                    section=ctx.section,
                    chapitre_ref=ctx.chapitre_ref,
                    chapitre_code=ctx.chapitre_code,
                    chapitre_libelle=ctx.chapitre_libelle,
                )

    doc.close()
    return sorted(all_pages.values(), key=lambda p: p.page_idx)


# =============================================================================
# Non-Ventilated Operations Scanning (chapters 92x, 94x)
# =============================================================================

@dataclass
class NonVentPageInfo:
    """Metadata for a non-ventilated operations page."""
    page_idx: int
    section: str                 # "Investissement" or "Fonctionnement"
    chapitre_code: str           # e.g. "940", "923"
    chapitre_libelle: str        # e.g. "Impositions directes"


def find_non_ventilated_pages(pdf_path: Path) -> list[NonVentPageInfo]:
    """
    Find all pages in the "OPERATIONS NON VENTILEES" sections of "VOTE DU BUDGET".

    These pages contain chapters 92x (Investissement) and 94x (Fonctionnement)
    which include fiscalité, dotations, emprunts — the bulk of Paris's recettes.

    Each page typically covers one chapter with DEPENSES and RECETTES detail.
    """
    import fitz
    doc = fitz.open(str(pdf_path))

    pages = []
    for i in range(len(doc)):
        text = doc[i].get_text()[:800]
        upper = text.upper()

        # Must be in the "VOTE DU BUDGET" section with "NON VENTILEES" header
        if "NON VENTIL" not in upper:
            continue
        if "VOTE DU BUDGET" not in upper:
            continue

        # Extract chapter code from "CHAPITRE {code} – {libellé}"
        chap_match = re.search(r'CHAPITRE\s+(\d{3})\s*[–\-]\s*(.+)', text)
        if not chap_match:
            continue

        chapitre_code = chap_match.group(1)
        chapitre_libelle = chap_match.group(2).strip()

        # Determine section from chapter prefix
        # 92x = Investissement non ventilé, 94x = Fonctionnement non ventilé
        if chapitre_code.startswith("92"):
            section = "Investissement"
        elif chapitre_code.startswith("94"):
            section = "Fonctionnement"
        else:
            continue

        pages.append(NonVentPageInfo(
            page_idx=i,
            section=section,
            chapitre_code=chapitre_code,
            chapitre_libelle=chapitre_libelle,
        ))

    doc.close()
    return pages


def parse_non_ventilated_page(
    page_text: str,
    page_info: NonVentPageInfo,
    annee: int,
    pdf_name: str,
) -> list[BudgetVoteLine]:
    """
    Parse one non-ventilated operations page.

    Format is simpler than Présentation croisée: no function columns.
    Each nature line has ~5 amount columns, we take the LAST one (= TOTAL).

    Columns: Pour mémoire | RAR N-1 | Propositions nouvelles | Vote assemblée | TOTAL
    """
    if not page_text:
        return []

    results = []
    sens = None

    for line in page_text.split("\n"):
        stripped = line.strip()

        # Detect DEPENSES / RECETTES markers
        # Some pages have "DEPENSES (3)" or "DEPENSES DE L'EXERCICE (3)"
        if re.match(r'^D[EÉ]PENSES', stripped):
            sens = "Dépense"
            continue
        if re.match(r'^RECETTES', stripped):
            sens = "Recette"
            continue

        if not sens:
            continue

        # Match nature lines: codes can be 3-7 digits (e.g. "739", "7391118", "66111")
        nat_match = re.match(r'^(\d{3,7})\s', stripped)
        if not nat_match:
            continue

        nature_code = nat_match.group(1)

        # Extract amounts from this line
        amounts = AMOUNT_RE.findall(stripped)
        if not amounts:
            continue

        # Take the LAST amount (= TOTAL = RAR N-1 + Vote)
        val = parse_french_amount(amounts[-1])
        if val is None or val <= 0:
            continue

        # Extract nature label (text between nature code and first amount)
        rest = stripped[len(nature_code):].strip()
        amount_match = AMOUNT_RE.search(rest)
        nature_libelle = rest[:amount_match.start()].strip() if amount_match else rest

        results.append(BudgetVoteLine(
            annee=annee,
            section=page_info.section,
            sens_flux=sens,
            chapitre_code=page_info.chapitre_code,
            chapitre_libelle=page_info.chapitre_libelle,
            nature_code=nature_code,
            nature_libelle=nature_libelle,
            fonction_code="",  # Non-ventilated: no functional breakdown
            montant=val,
            source_page=page_info.page_idx + 1,
            source_pdf=pdf_name,
        ))

    return results


# =============================================================================
# Text-Based Data Extraction (Présentation croisée - ventilated)
# =============================================================================

def parse_french_amount(s: str) -> Optional[float]:
    """Parse "8 898 000,00" → 8898000.0"""
    if not s or not s.strip():
        return None
    s = s.strip().replace(" ", "").replace("\xa0", "").replace(",", ".")
    try:
        return abs(float(s))
    except ValueError:
        return None


def extract_func_codes_from_text(text: str) -> tuple[list[str], bool]:
    """
    Extract function sub-codes (leaf-level) from the header area of a page.

    Header text contains patterns like "93-020", "93-021", "90-10" etc.
    We extract just the sub-code part: "020", "021", "10".

    IMPORTANT: Some pages have GROUP codes (e.g. "90-02") alongside their
    sub-codes ("90-020", "90-021"). Group codes are NOT data columns — they're
    just header labels. We filter them out by removing any code that is a prefix
    of another code. Only leaf-level codes (no children) are data columns.

    Returns:
        Tuple of (unique leaf codes in order of first appearance,
                  has_total_column flag)
    """
    lines = text.split("\n")[:20]  # Header is in first ~20 lines

    # Detect "TOTAL DU CHAPITRE" column — the phrase is often split across
    # multiple PDF lines (e.g. "TOTAL DU" on line 7, "CHAPITRE" on line 9,
    # or even just "T" at end of a line). We use multiple strategies:
    header_joined = " ".join(l.strip() for l in lines).upper()
    has_total = (
        "TOTAL DU CHAPITRE" in header_joined
        or "TOTAL DU" in header_joined
        # Catch fragmented "T\n...\nCHAPITRE": look for isolated T at end of line
        or any(
            re.search(r'\bT$', l.strip()) and
            any("CHAPITRE" in l2.upper() for l2 in lines[i+1:i+4])
            for i, l in enumerate(lines[:18])
        )
    )

    seen = []
    for line in lines:
        for m in FUNC_CODE_RE.finditer(line):
            sub = m.group(2)
            if sub not in seen:
                seen.append(sub)

    # Filter out group codes: remove codes that are a prefix of another code.
    # E.g. if both "02" and "020" exist, "02" is a group → remove it.
    # This prevents phantom columns and keeps only leaf-level data columns.
    leaf_codes = [
        code for code in seen
        if not any(
            other.startswith(code) and other != code
            for other in seen
        )
    ]

    return leaf_codes, has_total


def extract_nature_libelle(line: str, nature_code: str) -> str:
    """
    Extract the nature label from a data line.

    Line format: "604 Achats d'études, prestations de services 0,00 0,00 ..."
    Returns: "Achats d'études, prestations de services"
    """
    # Remove the nature code prefix
    rest = line[len(nature_code):].strip()

    # Find where the amounts start (first amount pattern)
    amount_match = AMOUNT_RE.search(rest)
    if amount_match:
        label = rest[:amount_match.start()].strip()
    else:
        label = rest.strip()

    return label


def parse_page_data(
    page_text: str,
    page_info: PageInfo,
    annee: int,
    pdf_name: str,
    prev_sens: Optional[str] = None,
) -> tuple[list[BudgetVoteLine], Optional[str]]:
    """
    Parse one page's text to extract budget vote lines.

    Args:
        page_text: Full text of the page (from pdfplumber extract_text())
        page_info: Metadata about this page
        annee: Budget year
        pdf_name: Source PDF filename
        prev_sens: Sens from previous page (for continuation pages)

    Returns:
        Tuple of (extracted lines, last sens_flux for next page)
    """
    if not page_text:
        return [], prev_sens

    # Get function columns from header
    func_codes, has_total_col = extract_func_codes_from_text(page_text)
    n_funcs = len(func_codes)

    if n_funcs == 0:
        return [], prev_sens

    # Data-driven fallback: scan DEPENSES line to confirm TOTAL column.
    # If the first DEPENSES/RECETTES or nature line has exactly n_funcs + 1
    # amounts, it confirms there's a TOTAL column even if text detection missed it.
    if not has_total_col:
        for probe_line in page_text.split("\n"):
            probe_stripped = probe_line.strip()
            if (probe_stripped.startswith("DEPENSES") or
                    probe_stripped.startswith("DÉPENSES") or
                    probe_stripped.startswith("RECETTES") or
                    re.match(r'^\d{3}\s', probe_stripped)):
                probe_amounts = AMOUNT_RE.findall(probe_stripped)
                if len(probe_amounts) == n_funcs + 1:
                    has_total_col = True
                break  # Only check the first data line

    # Total expected amounts per line: n_funcs + 1 if TOTAL column present
    n_expected = n_funcs + 1 if has_total_col else n_funcs

    lines = page_text.split("\n")
    results = []

    # Start with previous page's sens for continuation
    sens = prev_sens if page_info.is_continuation else None

    for line in lines:
        stripped = line.strip()

        # Detect DEPENSES/RECETTES markers (always at start of line)
        if stripped.startswith("DEPENSES") or stripped.startswith("DÉPENSES"):
            sens = "Dépense"
            continue
        if stripped.startswith("RECETTES"):
            sens = "Recette"
            continue

        # Skip non-data lines
        nat_match = re.match(r'^(\d{3})\s', stripped)
        if not nat_match or not sens:
            continue

        nature_code = nat_match.group(1)
        nature_libelle = extract_nature_libelle(stripped, nature_code)

        # Extract ALL amounts from this line
        amounts = AMOUNT_RE.findall(stripped)

        # Determine which amounts correspond to function columns.
        # Strategy:
        # - Amounts in text are left-to-right matching function columns.
        # - If TOTAL column: amounts = [func1, ..., funcN, TOTAL] → take first N
        # - If no TOTAL but extra amounts (e.g. from label text): take LAST N
        #   because the extra amounts are in the label, before the data columns.
        if has_total_col and len(amounts) >= n_expected:
            # Drop the TOTAL column (last amount)
            col_amounts = amounts[:n_funcs]
        elif has_total_col and len(amounts) == n_funcs:
            # TOTAL column but not enough amounts: the line might not have all cols
            col_amounts = amounts[:n_funcs]
        elif len(amounts) > n_funcs:
            # Extra amounts (likely from label text) → right-align
            col_amounts = amounts[-n_funcs:]
        elif len(amounts) == n_funcs:
            col_amounts = amounts
        else:
            # Fewer amounts than expected - best-effort right-alignment
            col_amounts = amounts
            offset = n_funcs - len(col_amounts)
            for i, amt_str in enumerate(col_amounts):
                val = parse_french_amount(amt_str)
                if val is not None and val > 0:
                    func_idx = offset + i
                    if func_idx < len(func_codes):
                        results.append(BudgetVoteLine(
                            annee=annee,
                            section=page_info.section,
                            sens_flux=sens,
                            chapitre_code=page_info.chapitre_code,
                            chapitre_libelle=page_info.chapitre_libelle,
                            nature_code=nature_code,
                            nature_libelle=nature_libelle,
                            fonction_code=func_codes[func_idx],
                            montant=val,
                            source_page=page_info.page_idx + 1,
                            source_pdf=pdf_name,
                        ))
            continue  # Already processed

        # Normal case: assign amounts to function columns
        for i, amt_str in enumerate(col_amounts):
            if i >= len(func_codes):
                break
            val = parse_french_amount(amt_str)
            if val is not None and val > 0:
                results.append(BudgetVoteLine(
                    annee=annee,
                    section=page_info.section,
                    sens_flux=sens,
                    chapitre_code=page_info.chapitre_code,
                    chapitre_libelle=page_info.chapitre_libelle,
                    nature_code=nature_code,
                    nature_libelle=nature_libelle,
                    fonction_code=func_codes[i],
                    montant=val,
                    source_page=page_info.page_idx + 1,
                    source_pdf=pdf_name,
                ))

    return results, sens


# =============================================================================
# Main Extraction
# =============================================================================

def extract_year(year: int, pdf_path: Optional[Path] = None, dry_run: bool = False) -> list[BudgetVoteLine]:
    """
    Extract all budget vote data for a given year.

    Args:
        year: Budget year (must be in PDF_SOURCES)
        pdf_path: Optional override path (skip download)
        dry_run: If True, print stats but don't save CSV
    """
    if pdf_path is None:
        if year not in PDF_SOURCES:
            print(f"  [error] Pas de PDF configure pour {year}")
            return []
        config = PDF_SOURCES[year]
        pdf_path = download_pdf(config["url"])
    
    pdf_name = pdf_path.name

    print(f"\n{'='*60}")
    print(f"  BP {year}: {pdf_name}")
    print(f"{'='*60}")

    # Phase 1: Find ventilated pages (Présentation croisée)
    print(f"  [scan] Recherche pages ventilees (presentation croisee)...")
    croisee_pages = find_all_croisee_pages(pdf_path)
    labeled = sum(1 for p in croisee_pages if not p.is_continuation)
    contin = sum(1 for p in croisee_pages if p.is_continuation)
    print(f"  [ok] {len(croisee_pages)} pages ventilees: {labeled} etiquetees + {contin} continuations")

    # Phase 2: Find non-ventilated pages (chapters 92x, 94x)
    print(f"  [scan] Recherche pages non-ventilees (92x, 94x)...")
    nv_pages = find_non_ventilated_pages(pdf_path)
    nv_chapitres = set(f"{p.section[:3]}/{p.chapitre_code}" for p in nv_pages)
    print(f"  [ok] {len(nv_pages)} pages non-ventilees: {', '.join(sorted(nv_chapitres))}")

    if not croisee_pages and not nv_pages:
        print(f"  [warn] Aucune page trouvee!")
        return []

    # Show ventilated chapitres found
    vent_chapitres = set()
    for p in croisee_pages:
        vent_chapitres.add(f"{p.section[:3]}/{p.chapitre_code}")
    print(f"  [info] Chapitres ventiles: {', '.join(sorted(vent_chapitres))}")

    # Phase 3: Extract data from all pages
    import pdfplumber
    pdf = pdfplumber.open(str(pdf_path))
    all_lines = []

    # 3a: Extract ventilated operations (Présentation croisée)
    print(f"  [extract] Ventiles (presentation croisee)...")
    prev_sens = None  # Carry sens_flux across continuation pages

    for pi, page_info in enumerate(croisee_pages):
        idx = page_info.page_idx
        try:
            page_text = pdf.pages[idx].extract_text()
            page_lines, prev_sens = parse_page_data(
                page_text, page_info, year, pdf_name, prev_sens
            )
            all_lines.extend(page_lines)
        except Exception as e:
            print(f"  [warn] Erreur page {idx + 1}: {e}")

        # Reset sens when starting a new labeled page (new chapitre group)
        if pi + 1 < len(croisee_pages) and not croisee_pages[pi + 1].is_continuation:
            prev_sens = None

    vent_count = len(all_lines)
    vent_total = sum(l.montant for l in all_lines)
    print(f"  [ok] {vent_count:,} lignes ventilees ({vent_total / 1e9:.2f} Md EUR)")

    # 3b: Extract non-ventilated operations (chapters 92x, 94x)
    print(f"  [extract] Non-ventiles (92x/94x)...")

    for page_info in nv_pages:
        try:
            page_text = pdf.pages[page_info.page_idx].extract_text()
            page_lines = parse_non_ventilated_page(
                page_text, page_info, year, pdf_name
            )
            all_lines.extend(page_lines)
        except Exception as e:
            print(f"  [warn] Erreur page NV {page_info.page_idx + 1} "
                  f"(ch.{page_info.chapitre_code}): {e}")

    nv_count = len(all_lines) - vent_count
    nv_total = sum(l.montant for l in all_lines[vent_count:])
    print(f"  [ok] {nv_count:,} lignes non-ventilees ({nv_total / 1e9:.2f} Md EUR)")

    pdf.close()

    # Stats
    total_montant = sum(l.montant for l in all_lines)
    depenses = sum(l.montant for l in all_lines if l.sens_flux == "Dépense")
    recettes = sum(l.montant for l in all_lines if l.sens_flux == "Recette")
    nb_chapitres = len(set(l.chapitre_code for l in all_lines))
    nb_natures = len(set(l.nature_code for l in all_lines))
    nb_inv = sum(1 for l in all_lines if l.section == "Investissement")
    nb_fonc = sum(1 for l in all_lines if l.section == "Fonctionnement")

    print(f"\n  === Resultat BP {year} ===")
    print(f"  Lignes: {len(all_lines):,} ({nb_inv:,} INV + {nb_fonc:,} FONC)")
    print(f"    dont {vent_count:,} ventilees + {nv_count:,} non-ventilees")
    print(f"  Chapitres: {nb_chapitres}, Natures: {nb_natures}")
    print(f"  Total:     {total_montant / 1e9:.3f} Md EUR")
    print(f"  Depenses:  {depenses / 1e9:.3f} Md EUR")
    print(f"  Recettes:  {recettes / 1e9:.3f} Md EUR")

    # Save CSV
    if not dry_run and all_lines:
        save_csv(all_lines, year)

    return all_lines


def save_csv(lines: list[BudgetVoteLine], year: int):
    """Save extracted data as a seed CSV."""
    SEEDS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = SEEDS_DIR / f"seed_pdf_budget_vote_{year}.csv"

    fieldnames = [
        "annee", "section", "sens_flux",
        "chapitre_code", "chapitre_libelle",
        "nature_code", "nature_libelle",
        "fonction_code", "montant",
        "source_page", "source_pdf",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for line in lines:
            writer.writerow({
                "annee": line.annee,
                "section": line.section,
                "sens_flux": line.sens_flux,
                "chapitre_code": line.chapitre_code,
                "chapitre_libelle": line.chapitre_libelle,
                "nature_code": line.nature_code,
                "nature_libelle": line.nature_libelle,
                "fonction_code": line.fonction_code,
                "montant": line.montant,
                "source_page": line.source_page,
                "source_pdf": line.source_pdf,
            })

    print(f"  [save] {output_path.name}")
    print(f"         {len(lines):,} lignes, {output_path.stat().st_size / 1024:.0f} Ko")


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Extract Budget Vote from BP editique BG PDFs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--year", type=int, choices=list(PDF_SOURCES.keys()),
        help="Annee specifique a extraire",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Extraire toutes les annees disponibles",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Afficher les stats sans sauvegarder",
    )
    parser.add_argument(
        "--pdf", type=str,
        help="Chemin local vers un PDF (skip download)",
    )

    args = parser.parse_args()

    if not args.year and not args.all:
        print("[error] Specifiez --year YYYY ou --all")
        parser.print_help()
        return

    print(f"\n{'='*60}")
    print(f"  EXTRACTION BUDGET VOTE (BP) - PDFs Editique BG")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Methode: pdfplumber text + regex (robust)")
    print(f"{'='*60}")

    years = [args.year] if args.year else sorted(PDF_SOURCES.keys())
    all_results = {}

    for year in years:
        pdf_override = Path(args.pdf) if args.pdf else None
        lines = extract_year(year, pdf_path=pdf_override, dry_run=args.dry_run)
        all_results[year] = lines

    # Summary
    print(f"\n{'='*60}")
    print(f"  RESUME")
    print(f"{'='*60}")
    total_lines = 0
    for year, lines in sorted(all_results.items()):
        total = sum(l.montant for l in lines) / 1e9 if lines else 0
        dep = sum(l.montant for l in lines if l.sens_flux == "Dépense") / 1e9 if lines else 0
        rec = sum(l.montant for l in lines if l.sens_flux == "Recette") / 1e9 if lines else 0
        status = "ok" if lines else "FAIL"
        print(f"  [{status}] BP {year}: {len(lines):>5,} lignes | "
              f"Dep {dep:.2f} + Rec {rec:.2f} = {total:.2f} Md EUR")
        total_lines += len(lines)

    print(f"\n  TOTAL: {total_lines:,} lignes")

    if not args.dry_run:
        print(f"\n  Prochaines etapes:")
        print(f"    1. dbt seed         # Charger les CSVs")
        print(f"    2. dbt run          # Rebuild les modeles")
    else:
        print(f"\n  [dry-run] Aucun fichier sauvegarde")


if __name__ == "__main__":
    main()
