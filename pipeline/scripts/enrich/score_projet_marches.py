#!/usr/bin/env python3
"""
Scoring projet ↔ marché candidat (jugement in-session par Claude via heuristiques).

Input : pipeline/cache/match_projet_marches/candidates.jsonl
Output : pipeline/seeds/seed_match_projet_marches.csv

Heuristiques de scoring :
  1. Tokens forts (toponyme, nom d'équipement, adresse) dans l'objet du marché.
  2. Pénalités : tokens numériques très courts (<=2 chars) sauf adresses.
  3. Bonus : présence de "LOT N" dans l'objet quand le projet est complexe.
  4. Bonus : fournisseur connu du patrimoine/chantier (peu de faux positifs).
  5. Pénalités : objet clairement pour un autre équipement (autre toponyme fort présent).

Seuils :
  >= 0.85 : label "confirmed"
  0.60 - 0.85 : label "probable"
  < 0.60 : exclu du seed

Les projets sans aucun match >= 0.60 sont écrits avec un marché NULL (pour
qu'on puisse afficher explicitement "aucun match trouvé" côté UI).
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INPUT = ROOT / "pipeline" / "cache" / "match_projet_marches" / "candidates.jsonl"
OUTPUT = ROOT / "pipeline" / "seeds" / "seed_match_projet_marches.csv"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s)


# Token significatif = au moins 4 caractères ET pas un stopword trivial.
STOPWORDS_STRONG = {
    # Toponymes ultra-génériques
    "paris", "ville", "mairie", "rue", "avenue", "boulevard", "place",
    # Types d'opération (n'identifient pas un projet spécifique)
    "travaux", "tvx", "trvx", "trx", "restauration", "renovation", "construction",
    "creation", "refection", "modernisation", "amenagement", "reamenagement",
    "remplacement", "conception", "extension", "rehabilitation", "transformation",
    "securisation", "adaptation", "mise", "remise", "aux", "norme", "normes",
    # Parties de bâtiment courantes
    "massif", "entree", "facade", "facades", "toiture", "toitures",
    "couverture", "couvertures", "menuiserie", "menuiseries",
    "fenetre", "fenetres", "porte", "portes", "sanitaires", "sanitaire",
    "chauffage", "ventilation", "electricite", "plomberie", "cvc",
    "climatisation", "climatiques", "climatique", "genie",
    # Projets génériques Ville
    "requalification", "requalif", "quartier", "quartiers", "secteur", "secteurs",
    "perenne", "perenniser", "embellir", "embellissement", "individualisees",
    "degre", "premier", "deuxieme",
    # Segmentations
    "lot", "lots", "phase", "phases", "tranche", "tranches", "eme", "emes", "er",
    # Types d'équipement ultra-génériques
    "eglise", "piscine", "musee", "jardin", "parc", "square",
    "bibliotheque", "mediatheque", "ecole", "elementaire", "maternelle",
    "gymnase", "centre", "creche", "etablissement", "complexe",
    "college", "lycee", "cantine", "scolaire", "scolaires",
    "sainte", "saint", "ste", "st",
    # Fonctions d'espaces internes
    "groupe", "classe", "classes", "salle", "salles", "cuisine", "refectoire",
    "cour", "bureau", "bureaux", "locaux", "accueil", "hall",
    # Mots techniques communs des objets marchés
    "batiment", "batiments", "immeuble", "site", "sites",
    "materiel", "materiels", "equipement", "equipements", "mobilier",
    "fourniture", "fournitures", "prestation", "prestations", "service", "services",
    "operation", "operations", "opc", "amo", "moe", "mo", "bet", "bct", "cse",
    # Infrastructure/VRD
    "eaux", "pluviales", "assainissement", "voirie", "reseau", "reseaux",
    "chaussee", "trottoir", "trottoirs", "eclairage",
    # Accord-cadre / vocabulaire DECP
    "accord", "cadre", "cadres", "marche", "marches", "subsequent", "subsequents",
    "acbc", "acms", "msac", "bons", "commande", "commandes",
    "multiattributaire", "multi", "attributaire",
    # Sections administratives (SA1, SA2…)
    "sa1", "sa2", "sa3", "sa4", "sa5",
    # Années très génériques
    "2024", "2023", "2022", "2021", "2020", "2019", "2018",
    # Catégories vagues
    "public", "publique", "publics", "publiques", "espace", "espaces",
    "autre", "autres", "divers", "diverses",
}


def strong_tokens(text: str) -> set[str]:
    """Tokens candidats à être des toponymes/noms propres (>= 4 char, pas stopword)."""
    return {t for t in norm(text).split() if len(t) >= 4 and t not in STOPWORDS_STRONG}


# Marqueurs d'équipements communs qu'on peut rattacher à un type de projet.
EQUIPEMENT_MARKERS = {
    "piscine": "piscine",
    "eglise": "eglise",
    "parc": "parc",
    "mediatheque": "mediatheque",
    "bibliotheque": "bibliotheque",
    "ecole": "ecole",
    "creche": "creche",
    "gymnase": "gymnase",
    "arena": "arena",
    "ehpad": "ehpad",
    "conservatoire": "conservatoire",
    "musee": "musee",
    "theatre": "theatre",
    "mairie": "mairie",
    "stade": "stade",
    "voirie": "voirie",
}

# Fournisseurs connus du patrimoine Ville (bonus léger, pas déterminant)
FOURNISSEURS_PATRIMOINE = {
    "LEFEVRE", "TOLLIS", "LE BRAS FRERES", "BRUNELLE", "LOUBIERE",
    "PRADEAU MORIN", "QUALICONSULT", "FREYSSINET", "ARCADIS", "TERIDEAL",
    "BOUYGUES BATIMENT", "EIFFAGE", "SMC2", "SPMG", "BOYER",
    "ENTREPRISE DE TRAVAUX PUB", "ESPACE DECO", "EHTP",
}


def project_equipement(nom: str) -> str | None:
    n = norm(nom)
    for mark, tag in EQUIPEMENT_MARKERS.items():
        if mark in n:
            return tag
    return None


def score_pair(projet: dict, cand: dict) -> tuple[float, str]:
    """Score 0.0-1.0 + raison courte."""
    proj_name = projet["nom"]
    marche_obj = cand.get("objet") or ""
    p_norm = norm(proj_name)
    m_norm = norm(marche_obj)

    # 1. Extraire les tokens forts du projet
    p_strong = strong_tokens(proj_name)
    m_strong = strong_tokens(marche_obj)
    overlap = p_strong & m_strong

    if not overlap:
        return 0.0, "aucun token fort partagé"

    # 2. Équipement cohérent ?
    proj_eq = project_equipement(proj_name)
    # Si le projet est une église et que l'objet parle de piscine → discount
    if proj_eq and proj_eq != "porte":
        other_eq = [e for e in EQUIPEMENT_MARKERS
                    if e in m_norm and e != proj_eq]
        if other_eq:
            # marché clairement pour un autre type d'équipement → discount fort
            return 0.15, f"mentionne {other_eq[0]} alors que projet est {proj_eq}"

    # 3. Score de base = fonction du nombre de tokens forts matchés
    base = min(1.0, 0.5 + 0.2 * len(overlap))

    # 4. Bonus si l'objet mentionne explicitement un toponyme rare du projet
    #    (toponymes = tokens >=5 char unique au projet)
    p_long = {t for t in overlap if len(t) >= 6}
    if p_long:
        base = min(1.0, base + 0.15)

    # 5. Bonus fournisseur patrimoine
    fournisseur = (cand.get("fournisseur_nom") or "").upper()
    if any(f in fournisseur for f in FOURNISSEURS_PATRIMOINE):
        base = min(1.0, base + 0.05)

    # 6. Fenêtre temporelle : écart année <=2 ans bonus, >=4 ans discount
    try:
        annee_diff = abs(int(cand.get("annee", 0)) - int(projet["year"]))
    except Exception:
        annee_diff = 0
    if annee_diff >= 4:
        base = max(0.0, base - 0.10)

    # 7. CCAG : si Fournitures/TIC pour un projet travaux → discount
    ccag = cand.get("ccag") or ""
    if ccag == "Fournitures courantes et services":
        # Marché de fournitures : quasi toujours inapplicable à un projet
        # bâtimentaire nommé. Discount fort surtout si overlap ≤ 1 token.
        if len(overlap) <= 1:
            base = max(0.0, base - 0.40)
        else:
            base = max(0.0, base - 0.20)
    elif ccag == "Techniques de l'information et de la communication":
        base = max(0.0, base - 0.35)  # pas lié à un chantier physique

    # 7bis. Heuristique textuelle (fallback quand CCAG absent — marchés Paris-only) :
    # objet qui commence par/contient "FOURNITURE", "LIVRAISON", "SEMENCES",
    # "DENREES", "MOBILIER", "VETEMENTS", "MATERIEL INFORMATIQUE" → fournitures.
    # Inapplicable à un projet bâtimentaire sauf preuve contraire.
    if re.search(
        r"^\s*(fourn\w*|livraison|livr\.|achat|acquisition)\b"
        r"|\b(semences|denrees|denrée|mobilier|vetements|v[êe]tements"
        r"|materiel\s+informatique|plants?\s+de|fleuries?)\b",
        marche_obj, re.I,
    ):
        if len(overlap) <= 1:
            base = max(0.0, base - 0.50)
        else:
            base = max(0.0, base - 0.25)

    # 8. Pénalité si l'objet mentionne un arrondissement clairement
    #    différent de celui du projet
    m_arr_re = re.search(r"750(\d{2})", marche_obj)
    if m_arr_re and projet.get("arr") and projet["arr"] > 0:
        m_arr = int(m_arr_re.group(1))
        if m_arr != projet["arr"]:
            base = max(0.0, base - 0.35)

    # 9. Pénalité si c'est un accord-cadre multi-attributaire général (ACMS, ACBC)
    #    sans toponyme précis du projet
    if re.search(r"\bAC(MS|BC|\b)|ACCORD.CADRE", marche_obj, re.I):
        # acceptable si overlap >= 2 tokens forts, sinon discount
        if len(overlap) < 2:
            base = max(0.0, base - 0.20)

    # 10. Pénalité pour tokens 100% numériques courts (2-3 chars) dans overlap
    num_short = {t for t in overlap if t.isdigit() and len(t) <= 3}
    if num_short and len(overlap) == len(num_short):
        # overlap = QUE des tokens numériques courts → faux positif probable
        return 0.15, "overlap uniquement sur numériques courts (bruit)"

    reason = f"overlap={sorted(overlap)[:4]}"
    return round(base, 2), reason


def load_candidates() -> list[dict]:
    return [json.loads(l) for l in open(INPUT, encoding="utf-8")]


def main() -> None:
    recs = load_candidates()
    rows = []
    for r in recs:
        p = r["projet"]
        cands = r["candidates"]
        # Score chaque candidat
        scored = []
        for c in cands:
            s, reason = score_pair(p, c)
            scored.append((s, reason, c))
        # Garde seulement >= 0.60
        scored.sort(key=lambda x: -x[0])
        kept = [x for x in scored if x[0] >= 0.60]
        # Limite à 5 max par projet (UI lisibilité)
        kept = kept[:5]

        # Nettoyage newlines pour CSV sans ambiguïté (BQ est strict)
        def _clean(s: str) -> str:
            return re.sub(r"\s+", " ", str(s or "")).strip()

        if not kept:
            # Écrire une ligne vide pour dire explicitement "pas de match"
            rows.append({
                "projet_id": p["id"],
                "projet_year": p["year"],
                "projet_nom": _clean(p["nom"]),
                "projet_montant": p["montant"],
                "projet_arr": p["arr"],
                "numero_marche": "",
                "fournisseur_nom": "",
                "fournisseur_siret": "",
                "marche_objet": "",
                "marche_annee": "",
                "marche_montant": "",
                "score": "",
                "label": "no_match",
                "reason": "aucun candidat score >= 0.60",
            })
        else:
            for s, reason, c in kept:
                label = "confirmed" if s >= 0.85 else "probable"
                rows.append({
                    "projet_id": p["id"],
                    "projet_year": p["year"],
                    "projet_nom": _clean(p["nom"]),
                    "projet_montant": p["montant"],
                    "projet_arr": p["arr"],
                    "numero_marche": c["numero_marche"],
                    "fournisseur_nom": _clean(c.get("fournisseur_nom")),
                    "fournisseur_siret": c.get("fournisseur_siret") or "",
                    "marche_objet": _clean(c.get("objet")),
                    "marche_annee": c.get("annee") or "",
                    "marche_montant": c.get("montant_max") or 0,
                    "score": s,
                    "label": label,
                    "reason": _clean(reason),
                })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for row in rows:
            w.writerow(row)

    # Print stats
    from collections import Counter
    labels = Counter(r["label"] for r in rows)
    print(f"Written {len(rows)} rows to {OUTPUT.relative_to(ROOT)}")
    print(f"  Labels: {dict(labels)}")
    print(f"  Projets avec ≥1 match: {len(set(r['projet_id'] for r in rows if r['label'] != 'no_match'))}")
    print(f"  Projets sans match: {labels['no_match']}")


if __name__ == "__main__":
    main()
