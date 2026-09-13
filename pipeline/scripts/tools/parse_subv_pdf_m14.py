#!/usr/bin/env python3
"""Parseur de l'annexe M14 « Liste des concours attribués à des tiers en nature
ou en subventions » (B1.6 en 2010-2011, B1.7 en 2012) des comptes
administratifs de la Ville de Paris.

Pourquoi il existe
------------------
L'open data de la Ville ne publie les subventions qu'à partir de 2013. Mais
l'article L.2313-1 du CGCT impose depuis longtemps cette liste nominative en
annexe du compte administratif, et la Ville l'a publiée pour 2010, 2011 et
2012 sur un mini-site aujourd'hui disparu (labs.paris.fr), intégralement
archivé par la Wayback Machine. Ce sont des PDF texte : `pdftotext -layout`
suffit. Retrouvées le 2026-09-11 ; 2009 n'existe nulle part en ligne.

Ce que le texte a l'air d'être
------------------------------
Une colonne nom en largeur fixe (~40 caractères, tronquée, jamais repliée),
puis la rue, la ville, le code postal, puis un à quatre montants au format
français : le numéraire, et parfois locaux mis à disposition, personnel mis à
disposition, prestations diverses. Le code postal n'est PAS toujours à cinq
chiffres : Bamako 3934, Bruxelles 1190, Québec sans code. On ne s'y fie pas ;
on coupe au premier montant. Les sous-sections (« Associations : »,
« Personnes physiques : »…) donnent la nature juridique des lignes qui
suivent. La liste s'arrête au PREMIER « TOTAL GENERAL » : les tableaux qui
suivent (bilans des organismes, DSP, intercommunalité) sont d'autres annexes
avec d'autres colonnes.

Le critère d'acceptation
------------------------
La somme des montants lus doit retrouver le total général imprimé, à 0,1 %
près. Sinon le script refuse d'écrire : une extraction qui perd des lignes
publie une somme fausse avec l'air d'une somme juste, et c'est exactement ce
qu'on a passé la journée d'hier à traquer.

Sortie : même forme que parse_subv_pdf_text.py (annexe B8.1.1, M57), pour que
sync_pdf_subventions_b811.py et la chaîne dbt reprennent sans changement.

Usage :
  python pipeline/scripts/tools/parse_subv_pdf_m14.py --input atr_2011.txt \\
      --year 2011 --pdf-url "https://web.archive.org/…/CA2011_annexe4_ville_ATR.pdf" \\
      --out pipeline/raw_extracts/subventions_b16/subv_b16_2011.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_subv_pdf_text import detect_subsection, normalize_name, parse_montant_fr  # noqa: E402

RE_START = re.compile(r"LISTE\s+DES\s+CONCOURS\s+ATTRIBU[EÉ]S\s+A\s+DES\s+TIERS\s+EN\s+NATURE", re.I)
RE_TOTAL_GENERAL = re.compile(r"^\s*TOTAL\s+GENERAL\s+(?P<montant>\d{1,3}(?:[ \xa0]\d{3})*,\d{2})", re.I)
# Un montant français : « 1 234 567,89 ». Une ou deux décimales : la ligne du
# CASVP 2010 est imprimée « 313 026 635,2 », tronquée par la largeur de sa
# colonne — 313 M€ sur 965, la ligne la plus lourde de l'annexe.
MONTANT = r"\d{1,3}(?:[ \xa0]\d{3})*,\d{1,2}"
# nom · ≥2 espaces · adresse (au moins une lettre) · ≥2 espaces · montant ·
# [autres montants, entiers bruts, ou « X » = mise à disposition sans montant]
RE_LINE = re.compile(
    r"^\s*(?P<name>\S(?:.*?\S)?)\s{2,}"
    r"(?P<adresse>(?=.*[A-Za-zÀ-ÖØ-öø-ÿ]).*?)\s{2,}"
    rf"(?P<montant>{MONTANT})"
    # « X » ou « pe » (personnel) : drapeaux de mise à disposition sans montant,
    # parfois tronqués par la largeur de colonne — un seul de ces jetons
    # cachait 3,26 M€ en 2010 (Régie de l'École d'ingénieurs).
    rf"(?P<extras>(?:\s+(?:{MONTANT}|\d+|[A-Za-z]{{1,12}}))*)\s*$"
)
# L'en-tête de colonnes, répété à chaque page : il fixe où commence la colonne
# « Mise à disposition ». Un premier montant imprimé à droite de cette borne
# n'est PAS une subvention mais un local ou du personnel mis à disposition —
# le compter en numéraire gonflait le total de 0,2 à 0,3 % en 2011 et 2012.
RE_HEADER = re.compile(r"Montant de la.*Mise à disposition", re.I)
# En 2015, « Mise à disposition » est imprimé SEUL sur la ligne au-dessus de
# l'en-tête « Nom de l'organisme … Montant de la … Prestations ». Sans cette
# forme, la borne n'était jamais posée : locaux, personnel et prestations
# diverses étaient lus comme des subventions (+4,6 M€, extraction refusée).
RE_HEADER_SEUL = re.compile(r"^\s{20,}Mise à disposition\s*$", re.I)
RE_IGNORE = re.compile(
    r"^\s*(TOTAL\b|Nom de l['’]organisme|Nom de la rue|subvention\b|Locaux\b|Personnel\b|"
    r"\(article L\.|Ville de Paris|COMPTE ADMINISTRATIF|Page \d+|B1\.[67]\b)", re.I)
TOLERANCE = 0.001


def parse_text(text: str) -> tuple[list[dict], float | None]:
    lines = text.splitlines()
    in_section = False
    cur_categorie, cur_nature = "Personnes de droit privé", None
    out: list[dict] = []
    total_imprime: float | None = None
    borne_mad: int | None = None      # position de la colonne « Mise à disposition »
    for raw in lines:
        line = raw.rstrip()
        if not in_section:
            if RE_START.search(line):
                in_section = True
            continue
        if RE_HEADER.search(line) or RE_HEADER_SEUL.match(line):
            borne_mad = line.lower().index("mise à disposition")
            continue
        m_tot = RE_TOTAL_GENERAL.match(line)
        if m_tot:
            total_imprime = parse_montant_fr(m_tot.group("montant"))
            break                                   # fin de la liste, le reste est une autre annexe
        sub = detect_subsection(line)
        if sub:
            cur_categorie = sub[0]
            if sub[1] is not None:
                cur_nature = sub[1]
            continue
        if RE_IGNORE.match(line):
            continue
        m = RE_LINE.match(line)
        if not m:
            continue
        name = m.group("name").strip()
        if len(name) < 3 or name.upper().startswith("TOTAL"):
            continue
        montant = parse_montant_fr(m.group("montant"))
        extras = [parse_montant_fr(x) for x in re.findall(MONTANT, m.group("extras") or "")]
        extras += [float(x) for x in re.findall(r"(?<![\d,])\d+(?![\d,])", m.group("extras") or "")]
        # Premier montant imprimé dans la colonne des mises à disposition : pas
        # une subvention. On garde le bénéficiaire, à zéro en numéraire.
        if borne_mad is not None and m.start("montant") >= borne_mad - 2:
            extras.insert(0, montant)
            montant = 0.0
        out.append({
            "name": name,
            "name_normalized": normalize_name(name),
            "montant_total": montant,
            "prestations_nature": round(sum(extras), 2),
            "categorie": cur_categorie,
            "nature_juridique": cur_nature,
        })
    return out, total_imprime


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--pdf-url", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    rows, total_imprime = parse_text(Path(a.input).read_text(encoding="utf-8"))
    by_key: dict[str, dict] = {}
    for r in rows:
        k = r["name_normalized"]
        if k in by_key:
            by_key[k]["montant_total"] += r["montant_total"]
            by_key[k]["prestations_nature"] += r["prestations_nature"]
            by_key[k]["nb_subventions"] += 1
        else:
            by_key[k] = {**r, "nb_subventions": 1}
    dedup = list(by_key.values())
    total_lu = sum(r["montant_total"] for r in dedup)
    if total_imprime is None:
        print(f"{a.year} : TOTAL GENERAL introuvable — extraction refusée", file=sys.stderr)
        return 1
    ecart = abs(total_lu - total_imprime) / total_imprime
    if ecart > TOLERANCE:
        print(f"{a.year} : lu {total_lu:,.2f} € contre {total_imprime:,.2f} € imprimés "
              f"({ecart*100:.2f} % d'écart) — extraction refusée, des lignes manquent", file=sys.stderr)
        return 1
    pp = sum(1 for r in dedup if r["nature_juridique"] == "Personnes physiques")
    obj = {
        "year": a.year,
        "source_pdf": a.pdf_url,
        "source_section": ("B1.7" if a.year >= 2012 else "B1.6")
                          + " - Liste des concours attribués à des tiers en nature ou en subventions (M14, art. L.2313-1 CGCT)",
        "extraction_date": date.today().isoformat(),
        "extraction_method": "pdftotext -layout + parser regex (no LLM), total général contrôlé",
        "stats": {"n_lines": len(rows), "n_beneficiaires": len(dedup),
                  "total_numeraire": round(total_lu, 2), "total_imprime": total_imprime,
                  "ecart_pct": round(ecart * 100, 4), "n_personnes_physiques": pp},
        "data": dedup,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    print(f"{a.year} : {len(rows)} lignes, {len(dedup)} bénéficiaires, {total_lu/1e6:.2f} M€ lus "
          f"= {total_imprime/1e6:.2f} M€ imprimés (écart {ecart*100:.3f} %), "
          f"{pp} personnes physiques → {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
