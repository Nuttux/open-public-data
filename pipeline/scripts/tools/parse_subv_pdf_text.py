#!/usr/bin/env python3
"""
Parser pour la section B8.1.1 « Liste des concours attribués à des tiers en
nature ou en subventions » des Comptes Administratifs Ville de Paris.

Cette section est l'annexe officielle EXHAUSTIVE des subventions versées
par la Ville à des organismes tiers. Elle couvre toutes les nature
juridique :
  - Associations
  - Entreprises
  - Fondations
  - Personnes physiques
  - Établissements publics
  - Organismes d'État, Communes, Syndicats, etc.
  - Autres

Format texte (pdftotext -layout) :
  - Header : "B8.1.1 - LISTE DES CONCOURS ATTRIBUES A DES TIERS"
  - "TOTAL GENERAL    1 335 350 692,31"
  - Sous-sections (en gras dans le PDF) : "Personnes de droit privé" /
    "Associations" / "Entreprises" / "Personnes physiques" / "Autres" /
    "Personnes morales", etc. — chacune avec son sous-total
  - Lignes :  NOM_BENEFICIAIRE                  montant_numeraire   [prestations_nature]
    où prestations_nature peut être absent ou être un nombre brut sans
    virgule (ex : "1230,5" ou "264000")

Output : compatible avec website/public/data/subventions/beneficiaires_YYYY.json
  [
    {
      "name": "...",
      "name_normalized": "...",
      "montant_total": ...,
      "nb_subventions": 1,
      "categorie": "Personnes de droit privé",
      "nature_juridique": "Associations",
      ...
    }
  ]

Usage :
    python pipeline/scripts/tools/parse_subv_pdf_text.py \\
        --input pipeline/cache/.../ca_2020_tome3.txt \\
        --year 2020 \\
        --pdf-url "https://cdn.paris.fr/.../tome3.pdf" \\
        --out /tmp/subv_2020_pdf.json
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

# ─── Regex ────────────────────────────────────────────────────────────────

# Section header — chaîne très spécifique présente UNIQUEMENT au vrai début
# du contenu B8.1.1, pas dans la table des matières (qui liste juste
# "B8.1.1 - Concours attribués à des tiers").
RE_B811_START = re.compile(
    r"LISTE\s+DES\s+CONCOURS\s+ATTRIBU[EÉ]S\s+A\s+DES\s+TIERS\s+EN\s+NATURE",
    re.IGNORECASE,
)
RE_B812_START = re.compile(
    r"LISTE\s+DES\s+SUBVENTIONS\s+VERS[EÉ]ES\s+AUX\s+COMMUNES",
    re.IGNORECASE,
)
RE_B82_START = re.compile(r"\bB8\.2\b\s*[-–]\s*[A-Z]", re.IGNORECASE)
RE_B9 = re.compile(r"^\s*B[9-9]\b\s*[-–]\s*[A-Z]", re.IGNORECASE)
RE_B83_START = re.compile(
    r"ETAT\s+DES\s+CONTRATS\s+DE\s+PARTENARIAT\s+PUBLIC[- ]PRIV[EÉ]",
    re.IGNORECASE,
)

# Sous-sections (catégories) — détectées par leur libellé caractéristique
# Présentent typiquement un montant total à droite. On les utilise comme
# pivot pour assigner la nature juridique aux lignes suivantes.
SUBSECTIONS = {
    # libellé exact (lowercase, accents stripés) → (categorie, nature_juridique)
    "personnes de droit prive": ("Personnes de droit privé", None),
    "associations": ("Personnes de droit privé", "Associations"),
    "entreprises": ("Personnes de droit privé", "Entreprises"),
    "fondations": ("Personnes de droit privé", "Fondations"),
    "personnes physiques": ("Personnes de droit privé", "Personnes physiques"),
    "syndicats": ("Personnes de droit privé", "Syndicats"),
    "personnes de droit public": ("Personnes de droit public", None),
    "etablissements publics": ("Personnes de droit public", "Établissements publics"),
    # Variante avec parenthèses (CA Paris : "Etablissements publics (EPCI, EPA, EPIC,...)")
    "etablissements publics (epci, epa, epic, ...)": (
        "Personnes de droit public", "Établissements publics",
    ),
    "communes": ("Personnes de droit public", "Communes"),
    "departements": ("Personnes de droit public", "Départements"),
    "etat": ("Personnes de droit public", "État"),
    "regies": ("Personnes de droit public", "Régies"),
    "autres": ("Autres", "Autres"),
}

# Lignes à ignorer (en-têtes répétitifs, totaux, page numbers)
RE_IGNORE = re.compile(
    r"^(\s*)(TOTAL GENERAL|TOTAL\b|Page \d+|Ville de Paris|"
    r"Nom des bénéficiaires|Montant du fonds de concours|"
    r"subvention \(numéraire\)|Prestations en nature|"
    r"IV\s*[-–]\s*ANNEXES|B\s*[-–]\s*ANNEXES PATRIMONIALES|"
    r"REPUBLIQUE FRANÇAISE|Numéro SIRET|"
    r"Compte administratif|Voté par fonction|"
    r"COMPTE\s+ADMINISTRATIF|De\s+l['’]exercice|"
    r"DIRECTION DES FINANCES|Direction des Finances|"
    r"BUDGET\s+(GENERAL|PRINCIPAL)|TOME\s+\d+|"
    r"COMPTE SUR CHIFFRES|LE\s+COMPTE\s+ADMINISTRATIF|"
    r"BUDGET\b)",
    re.IGNORECASE,
)

# Pattern pour reconnaître une ligne projet :
# - commence par un nom (peut commencer par chiffres : "030 ENSEMBLE", "59 RIVOLI")
# - le nom contient AU MOINS une lettre (sinon c'est juste un nombre)
# - séparé du montant par >= 2 espaces (alignement colonne PDF)
# - se termine par un montant FR ("12 345,67")
# - peut être suivi d'un montant "prestations en nature" (entier ou décimal :
#   "264000" ou "1230,5")
# Ex : "  ABC PUERICULTURE                   6 944 575,10   79620"
# Ex : "  59 RIVOLI                                  0,00   349311"
# Ex : "  ASSOCIATION CHAMPIONNET            1 110 467,00"
RE_LINE = re.compile(
    r"^\s*(?P<name>(?=.*[A-Za-zÀ-ÖØ-öø-ÿ]).+?)\s{2,}"
    r"(?P<numeraire>\d{1,3}(?:[ \xa0]\d{3})*,\d{2})"
    r"(?:\s+(?P<prestations>\d+(?:,\d+)?))?\s*$"
)


# ─── Helpers ──────────────────────────────────────────────────────────────


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def normalize_name(name: str) -> str:
    """Reproduit normalize_name() de fetch_subventions_opendata.py."""
    if not name:
        return ""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_montant_fr(s: str) -> float:
    s = s.replace("\xa0", " ").replace(" ", "").replace(",", ".")
    return float(s)


def parse_prestations(s: str) -> float:
    """Prestations nature : peut être '1230,5', '264000', '1 230,50'."""
    s = s.replace("\xa0", " ").replace(" ", "").replace(",", ".")
    return float(s)


def detect_subsection(line_clean: str) -> tuple[str, str | None] | None:
    """Si la ligne est un en-tête de sous-section (Associations / Entreprises /
    etc. seul + montant), retourne (categorie, nature_juridique). Sinon None.

    Normalisation aggressive : supprime accents, ponctuation, espaces multiples
    pour matcher les variantes ("EPCI, EPA, EPIC,..." vs "EPCI, EPA, EPIC, ...")."""
    s = strip_accents(line_clean.strip().lower())
    # Enlever le montant éventuel à droite
    s_no_amount = re.sub(r"\s+\d[\d \xa0,\.]+$", "", s).strip()
    # Garder uniquement lettres et espaces, collapse spaces
    s_norm = re.sub(r"[^a-z]+", " ", s_no_amount).strip()
    s_norm = re.sub(r"\s+", " ", s_norm)
    # Lookup dans SUBSECTIONS aussi normalisé
    for key, val in SUBSECTIONS.items():
        key_norm = re.sub(r"[^a-z]+", " ", key).strip()
        key_norm = re.sub(r"\s+", " ", key_norm)
        if s_norm == key_norm:
            return val
    return None


def parse_text(text: str) -> list[dict]:
    """Parse le texte du Tome 3 et retourne la liste des subventions."""
    lines = text.splitlines()
    in_section = False
    cur_categorie = "Personnes de droit privé"  # default
    cur_nature = None
    out: list[dict] = []

    for raw in lines:
        line = raw.rstrip()
        if not in_section:
            if RE_B811_START.search(line):
                in_section = True
            continue
        # Stop à la prochaine section (B8.1.2 / B8.2 / B8.3 / B9...)
        if (
            RE_B812_START.search(line)
            or RE_B82_START.search(line)
            or RE_B83_START.search(line)
            or RE_B9.match(line)
        ):
            break

        # En-tête de sous-section ?
        sub = detect_subsection(line)
        if sub:
            cat, nature = sub
            cur_categorie = cat
            if nature is not None:
                cur_nature = nature
            continue

        if RE_IGNORE.match(line):
            continue

        m = RE_LINE.match(line)
        if not m:
            continue

        name = m.group("name").strip()
        # Skip les lignes "TOTAL XXX" qui ont la forme nom + montant
        if name.upper().startswith("TOTAL ") or name.upper() == "TOTAL":
            continue
        # Garde-fou : noms < 3 chars sont sûrement des artéfacts
        if len(name) < 3:
            continue

        try:
            numeraire = parse_montant_fr(m.group("numeraire"))
        except ValueError:
            continue

        prestations = 0.0
        if m.group("prestations"):
            try:
                prestations = parse_prestations(m.group("prestations"))
            except ValueError:
                pass

        out.append({
            "name": name,
            "name_normalized": normalize_name(name),
            "montant_total": numeraire,
            "prestations_nature": prestations,
            "categorie": cur_categorie,
            "nature_juridique": cur_nature,
        })

    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=str, required=True)
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--pdf-url", type=str, required=True)
    ap.add_argument("--out", type=str, required=True)
    args = ap.parse_args()

    text = Path(args.input).read_text(encoding="utf-8")
    rows = parse_text(text)

    # Dédup par (year, name_normalized) — somme les montants si même bénéf
    # apparaît plusieurs fois (cas rare mais possible)
    by_key: dict[str, dict] = {}
    for r in rows:
        key = r["name_normalized"]
        if key in by_key:
            by_key[key]["montant_total"] += r["montant_total"]
            by_key[key]["prestations_nature"] += r["prestations_nature"]
            by_key[key]["nb_subventions"] = by_key[key].get("nb_subventions", 1) + 1
        else:
            r["nb_subventions"] = 1
            by_key[key] = r

    rows_dedup = list(by_key.values())
    total_numeraire = sum(r["montant_total"] for r in rows_dedup)
    total_nature = sum(r["prestations_nature"] for r in rows_dedup)

    obj = {
        "year": args.year,
        "source_pdf": args.pdf_url,
        "source_section": "B8.1.1 - Liste des concours attribués à des tiers en nature ou en subventions",
        "extraction_date": date.today().isoformat(),
        "extraction_method": "pdftotext + parser regex (no LLM)",
        "stats": {
            "n_lines": len(rows),
            "n_beneficiaires": len(rows_dedup),
            "total_numeraire": total_numeraire,
            "total_nature": total_nature,
        },
        "data": rows_dedup,
    }
    Path(args.out).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    print(
        f"→ {args.out}: {len(rows_dedup)} bénéficiaires uniques, "
        f"{total_numeraire/1e6:.1f} M€ numéraire + {total_nature/1e6:.2f} M€ nature"
    )


if __name__ == "__main__":
    main()
