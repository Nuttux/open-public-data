#!/usr/bin/env python3
"""
Parser pour les annexes 'Investissements Localisés' du Compte Administratif
Ville de Paris (PDFs 2019, 2020, 2021).

Le format texte (extrait via pdftotext -layout) est tabulaire :

    MAIRIE DE SECTEUR CENTRE  /  Xème ARRONDISSEMENT
        Présentation par type d'autorisation de programme et par chapitre fonctionnel
        [Tableau récap]                                ← skipped
                          Principales opérations
        ACTIVITE                LIBELLE                MONTANT
    AP de Plan
    [activité]                  [libellé multi-lignes possible]   [montant]
    [activité]                  [libellé]                          [montant]
                                TOTAL [chapitre]                  [total]
    ...
    AP de Projet
    ...
    AP de Budget Participatif (ou "Budget participatif")
    ...

Output : list[dict] dans le format investissements_localises_{y}.json
    {id, annee, arrondissement, chapitre_libelle, nom_projet, montant, type_ap,
     confidence, source_page, source_pdf, date_extraction}

Usage:
    python pipeline/scripts/tools/parse_il_pdf_text.py PATH/TO/il_2021.txt --year 2021 \\
        --pdf-url https://cdn.paris.fr/... --out OUT.json
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

# ─── Regex ────────────────────────────────────────────────────────────────

# "Xème ARRONDISSEMENT" / "MAIRIE DE SECTEUR CENTRE" / "MAIRIE D'ARRONDISSEMENT"
RE_ARR_NUM = re.compile(r"^\s*(\d{1,2})\s*ème\s+ARRONDISSEMENT\s*$", re.IGNORECASE)
RE_ARR_CENTRE = re.compile(r"^\s*MAIRIE\s+DE\s+SECTEUR\s+CENTRE\s*$", re.IGNORECASE)
RE_ARR_OTHER = re.compile(r"^\s*1\s*er\s+ARRONDISSEMENT\s*$", re.IGNORECASE)

# Marqueurs de section type d'AP
RE_AP_PLAN = re.compile(r"^\s*AP\s+de\s+Plan\s*$", re.IGNORECASE)
RE_AP_PROJET = re.compile(r"^\s*AP\s+de\s+Projet\s*$", re.IGNORECASE)
RE_AP_BP = re.compile(
    r"^\s*(AP\s+de\s+)?Budget\s+[Pp]articipatif\s*$", re.IGNORECASE
)

# Tabular header — to skip
RE_HEADER = re.compile(
    r"^\s*(MISSION/?ACTIVITE|ACTIVITE)\s+LIBELLE\s+MONTANT\s*$",
    re.IGNORECASE,
)

# "Principales opérations" — start of project list
RE_PRINCIPALES = re.compile(r"Principales\s+op[ée]rations", re.IGNORECASE)

# "TOTAL XXX" lines — end of a chapter sub-section
RE_TOTAL = re.compile(
    r"^\s*TOTAL\s+[A-ZÉÈÀÂÊÎÔÛÇ' ,/-]+\s+[\d\s]+\s*$"
)

# Tableau de récap par chapitre (au début de chaque arr) — à skipper
RE_RECAP_LINE = re.compile(
    r"^\s*(Type d'AP|AP de Plan|AP de Projet|Budget participatif|Total\s|TOTAL\b|"
    r"ACTION\s|AMÉNAGEMENT\b|CULTURE,\s|ENSEIGNEMENT,\s|ENVIRONNEMENT\b|"
    r"SANTÉ\s|SÉCURITÉ\b|SERVICES\s|TRANSPORTS\b)"
)

# Montant en fin de ligne : "1 234 567" ou "1 234" ou "584 901"
RE_AMOUNT_END = re.compile(r"(\d{1,3}(?:\s\d{3})+|\d{1,6})\s*$")

# Chapitres M57 attendus en CAPS
M57_CHAPITRES = {
    "ACTION ÉCONOMIQUE",
    "AMÉNAGEMENT DES TERRITOIRES",
    "CULTURE, VIE SOCIALE",
    "ENSEIGNEMENT, FORMATIONS",
    "ENVIRONNEMENT",
    "SANTÉ ET ACTION SOCIALE",
    "SÉCURITÉ",
    "SERVICES GÉNÉRAUX",
    "TRANSPORTS",
}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def parse_arrondissement(line: str) -> int | None:
    """Detecte le numéro d'arrondissement courant."""
    line_clean = line.strip()
    m = RE_ARR_NUM.match(line_clean)
    if m:
        return int(m.group(1))
    if RE_ARR_CENTRE.match(line_clean):
        return 1  # Paris Centre = secteur 1-2-3-4 → on rattache au 1
    # 1er ARRONDISSEMENT → 1
    if re.match(r"^1\s*er\s+ARRONDISSEMENT", line_clean, re.IGNORECASE):
        return 1
    return None


def parse_amount(s: str) -> float | None:
    """Parse '1 234 567' or '1234567' to int. Returns None if not a valid amount."""
    if not s:
        return None
    s = s.strip().replace("\xa0", " ").replace(" ", "")
    try:
        v = int(s)
        return float(v)
    except ValueError:
        return None


def split_amount_at_end(line: str) -> tuple[str, float | None]:
    """Si la ligne se termine par un montant, retourne (texte_sans_montant, montant)."""
    line = line.rstrip()
    m = RE_AMOUNT_END.search(line)
    if not m:
        return line, None
    amount_str = m.group(1)
    amount = parse_amount(amount_str)
    if amount is None:
        return line, None
    text = line[: m.start()].rstrip()
    return text, amount


def parse_pdf_text(text: str) -> list[dict]:
    """Parse le texte extrait pdftotext -layout d'un PDF IL et retourne
    la liste des projets {arr, type_ap, chapitre_libelle, nom_projet, montant}."""
    lines = text.splitlines()
    projets: list[dict] = []

    cur_arr: int | None = None
    cur_type_ap: str | None = None  # "plan" | "projet" | "budget_participatif"
    cur_chapitre: str | None = None  # libellé M57 courant
    cur_activite: str | None = None  # ligne d'activité gauche (peu utilisée)
    in_principales = False  # vrai après "Principales opérations"
    pending_libelle: list[str] = []  # buffer pour les libellés multi-lignes

    def flush_pending():
        """Si un libellé pending est resté sans montant, on l'abandonne."""
        nonlocal pending_libelle
        pending_libelle = []

    for raw in lines:
        line = raw.rstrip()
        line_strip = line.strip()
        if not line_strip:
            continue

        # 1. Bornes d'arrondissement — reset complet
        arr_num = parse_arrondissement(line)
        if arr_num is not None:
            cur_arr = arr_num
            cur_type_ap = None
            cur_chapitre = None
            in_principales = False
            flush_pending()
            continue

        # 2. "Principales opérations" — début de la zone projet
        if RE_PRINCIPALES.search(line):
            in_principales = True
            flush_pending()
            continue

        if not in_principales or cur_arr is None:
            continue

        # 3. En-tête tableau — skip
        if RE_HEADER.match(line_strip):
            continue

        # 4. Type d'AP
        if RE_AP_PLAN.match(line_strip):
            cur_type_ap = "plan"
            cur_chapitre = None
            flush_pending()
            continue
        if RE_AP_PROJET.match(line_strip):
            cur_type_ap = "projet"
            cur_chapitre = None
            flush_pending()
            continue
        if RE_AP_BP.match(line_strip):
            cur_type_ap = "budget_participatif"
            cur_chapitre = None
            flush_pending()
            continue

        # 5. TOTAL XXX — fin de sous-section
        if RE_TOTAL.match(line_strip):
            cur_chapitre = None
            flush_pending()
            continue

        # 6. Ligne potentiellement projet : essayons d'extraire un montant en fin
        text_part, amount = split_amount_at_end(line_strip)
        if amount is not None and text_part and len(text_part) >= 5:
            # Ligne avec libellé + montant : projet potentiel
            full_libelle = " ".join(pending_libelle + [text_part]).strip()
            full_libelle = re.sub(r"\s+", " ", full_libelle)
            # Heuristique : skip si c'est une "TOTAL ..." caché
            if full_libelle.upper().startswith("TOTAL "):
                flush_pending()
                continue
            projets.append({
                "arrondissement": cur_arr or 0,
                "type_ap": cur_type_ap or "autre",
                "chapitre_libelle": cur_chapitre or "",
                "nom_projet": full_libelle,
                "montant": amount,
            })
            flush_pending()
            continue

        # 7. Ligne sans montant — soit une suite de libellé, soit du metadata
        # Heuristique : on bufferise comme suite de libellé pending si on a déjà
        # un type_ap et que la ligne fait moins de 200 chars (libellé typique).
        if cur_type_ap and len(line_strip) < 200:
            # Skipper les en-têtes de chapitre (CAPS pures) qui sont dans le récap
            stripped_caps = re.sub(r"[^A-ZÀÉÈÂÎÔÇ ]", "", line_strip)
            if stripped_caps == line_strip.upper() and len(line_strip) > 5:
                # Peut-être un chapitre dans une autre forme — on ignore
                continue
            pending_libelle.append(line_strip)

    return projets


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=str, help="Chemin vers .txt extrait via pdftotext -layout")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--pdf-url", type=str, required=True)
    ap.add_argument("--out", type=str, required=True)
    args = ap.parse_args()

    text = Path(args.input).read_text(encoding="utf-8")
    raw = parse_pdf_text(text)

    # Convertir en format investissements_localises_{y}.json
    today = date.today().isoformat()
    pdf_url = args.pdf_url
    out_data = []
    # Numérotation séquentielle par arrondissement
    arr_counters: dict[int, int] = {}
    for p in raw:
        arr = p["arrondissement"]
        idx = arr_counters.get(arr, 0)
        arr_counters[arr] = idx + 1
        out_data.append({
            "id": f"{args.year}_{arr:02d}_il_{idx:03d}",
            "annee": args.year,
            "arrondissement": arr,
            "chapitre_code": "",
            "chapitre_libelle": p["chapitre_libelle"],
            "nom_projet": p["nom_projet"],
            "montant": p["montant"],
            "type_ap": p["type_ap"],
            "confidence": 0.7,
            "source_page": None,
            "source_pdf": pdf_url,
            "date_extraction": today,
        })

    out_obj = {
        "year": args.year,
        "source": "Compte Administratif Annexe Investissements Localisés (PDF parsed in-session)",
        "extraction_date": today,
        "stats": {
            "n_projets": len(out_data),
            "total_montant": sum(p["montant"] for p in out_data),
            "n_arrondissements": len(arr_counters),
        },
        "data": out_data,
    }

    Path(args.out).write_text(
        json.dumps(out_obj, ensure_ascii=False, indent=None),
        encoding="utf-8",
    )
    print(f"→ {args.out}: {len(out_data)} projets, total {sum(p['montant'] for p in out_data)/1e6:.1f} M€")
    print(f"  Par arr: {dict(sorted(arr_counters.items()))}")


if __name__ == "__main__":
    main()
