#!/usr/bin/env python3
"""Quatrième élargissement du seed (2026-09-11) — candidats tirés de NOS DONNÉES,
pas d'une liste éditoriale ni d'un souvenir.

Méthode (reproductible avec le petit script du même jour, cf. docstring) : on
croise trois gisements et on ne garde que ce qui n'a pas déjà de fiche —
  A. `website/public/data/ca/ap_operations.json` : opérations d'investissement
     2009→2022 dont le libellé désigne un équipement et dont la clé n'apparaît
     dans aucun `*_money_resolved.json` (donc jamais rattachée à un lieu) ;
  B. `website/public/data/map/investissements_complet_*.json` : projets
     localisés 2018→2024 hors des lieux existants ;
  C. `website/public/data/subventions/beneficiaires_*.json` : bénéficiaires
     dont le nom désigne un équipement (exploitants probables).
Chaque entrée porte en commentaire le montant repéré et le gisement — c'est la
justification de son ajout, et elle reste vérifiable après coup.

Le gisement le plus net est celui des ÉDIFICES CULTUELS : la Ville est
propriétaire de ses églises (loi de 1905) et y mandate des millions par an,
sans qu'aucune page publique ne donne le total par bâtiment.

Deux pièges rencontrés ce jour, encodés ici :
 1. La Base Adresse Nationale géocode un ÉQUIPEMENT par la RUE homonyme
    (« École Boulle » → rue Boulle, 11e, alors que l'école est 12e ; « Institut
    des cultures d'Islam » → place de l'Institut, 6e, au lieu de la rue
    Stephenson, 18e). Des coordonnées fausses empoisonnent ensuite le
    rapprochement des projets par distance : on géocode donc au BÂTIMENT via
    Nominatim, BAN en secours seulement.
 2. Un filtre « chapelle » attrape le quartier de la Chapelle (18e) et ses
    aménagements (13,5 M€ « Chapelle — réaménagement JO 2024 ») : ce ne sont pas
    des édifices cultuels. Écarté à la main ici.

Usage : python pipeline/scripts/enrich/expand_seed_lieux_v4.py [--dry-run]
"""
from __future__ import annotations

import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from expand_seed_lieux import slugify, invest_pat, ban_coords  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
UA = {"User-Agent": "qipu/0.1 (recherche civique; qipu.org)"}

# (requête Nominatim, nom publié, kind_fr, arr, famille, provenance)
LIEUX: list[tuple[str, str, str, int, str, str]] = [
    # ── enseignement municipal : la Ville possède ces écoles et les subventionne ──
    ("École Boulle, Paris", "École Boulle", "École", 12, "services",
     "AP 65,6 M€ 2009-2017 + subventions 22,5 M€ 2010-2024"),
    ("École du Breuil, Paris", "École du Breuil", "École", 12, "vert",
     "subventions 29,3 M€ 2019-2024 (régie horticole, bois de Vincennes)"),
    ("ESPCI Paris, rue Vauquelin, Paris", "ESPCI Paris", "École", 5, "services",
     "subventions 294,7 M€ 2010-2024 — le plus gros bénéficiaire non rattaché"),
    ("École des ingénieurs de la ville de Paris", "École des ingénieurs de la ville de Paris",
     "École", 19, "services", "subventions 66,3 M€ 2010-2024"),
    ("École Estienne, Paris", "École Estienne", "École", 13, "services",
     "subventions 11,4 M€ 2010-2024"),
    ("École Duperré, Paris", "École Duperré", "École", 3, "services",
     "subventions 9,6 M€ 2010-2024"),
    # ── culture : équipements avec chantier ET exploitation ──
    ("Halle Pajol, Paris", "Halle Pajol", "Équipement", 18, "urbain",
     "AP 75,3 M€ 2009-2019 (deux libellés) — plus gros chantier non rattaché"),
    ("Institut des cultures d'Islam, Paris", "Institut des cultures d'Islam",
     "Équipement culturel", 18, "culture", "AP 16,9 M€ 2009-2018 + subventions 16,9 M€"),
    ("Musée d'art et d'histoire du Judaïsme, Paris", "Musée d'art et d'histoire du Judaïsme",
     "Musée", 3, "culture", "subventions 30,3 M€ 2010-2024"),
    ("Bibliothèque Françoise Sagan, Paris", "Médiathèque Françoise-Sagan", "Bibliothèque", 10,
     "culture", "AP 18,6 M€ 2011-2020 (« bibliothèque Saint-Lazare »)"),
    ("Bibliothèque interuniversitaire de la Sorbonne, Paris", "Bibliothèque de la Sorbonne",
     "Bibliothèque", 5, "culture", "AP 26,0 M€ 2009-2017"),
    ("Cité internationale des arts, Paris", "Cité internationale des arts", "Équipement culturel",
     4, "culture", "subventions 10,1 M€ 2010-2021"),
    ("Musée en Herbe, Paris", "Musée en Herbe", "Musée", 1, "culture",
     "subventions 3,4 M€ 2010-2024"),
    # ── conservatoires municipaux : un par arrondissement, chantiers lourds ──
    ("Conservatoire Claude Debussy, Paris", "Conservatoire Claude-Debussy", "Conservatoire", 17,
     "culture", "AP 22,5 M€ 2009-2022 (« conservatoire du 17e »)"),
    ("Conservatoire Paul Dukas, Paris", "Conservatoire Paul-Dukas", "Conservatoire", 12,
     "culture", "AP 17,7 M€ 2011-2019 (« conservatoire rue du Charolais »)"),
    ("Conservatoire Maurice Ravel, Paris", "Conservatoire Maurice-Ravel", "Conservatoire", 13,
     "culture", "AP 11,9 M€ 2012-2013 + 9,3 M€ boulevard Blanqui"),
    ("Conservatoire Darius Milhaud, Paris", "Conservatoire Darius-Milhaud", "Conservatoire", 14,
     "culture", "projets localisés 13,6 M€ 2019-2020 (« conservatoire du 14e »)"),
    # ── sport ──
    ("Parc des Princes, Paris", "Parc des Princes", "Stade", 16, "sport",
     "AP 25,1 M€ 2009-2022"),
    ("Hippodrome d'Auteuil, Paris", "Hippodrome d'Auteuil", "Hippodrome", 16, "sport",
     "AP 16,8 M€ 2009-2017 + 11,0 M€ pelouse"),
    ("Centre sportif Élisabeth, Paris", "Centre sportif Élisabeth", "Centre sportif", 14, "sport",
     "AP 18,8 M€ 2015-2022 + projets 10,9 M€"),
    # ── urbain ──
    ("Parc des expositions de la porte de Versailles, Paris", "Parc des expositions de la Porte de Versailles",
     "Parc des expositions", 15, "urbain", "AP 111,0 M€ — plus gros montant non rattaché"),
    ("Cité internationale universitaire de Paris", "Cité internationale universitaire",
     "Cité", 14, "urbain", "subventions 13,2 M€ 2010-2018"),
    ("Institut Pasteur, Paris", "Institut Pasteur", "Institut", 15, "services",
     "subventions 5,0 M€ 2010-2024 (15 exercices)"),
    # ── édifices cultuels : propriété de la Ville, classés par dépense réelle ──
    ("Église de la Sainte-Trinité, Paris 9e", "Église de la Sainte-Trinité", "Église", 9, "culture",
     "projets 11,0 M€ 2022-2024 + 3,7 M€ + AP 2,9 M€ — 1er poste cultuel"),
    ("Église de la Madeleine, Paris", "Église de la Madeleine", "Église", 8, "culture",
     "projets 7,2 M€ 2021-2023 + 2,0 M€ 2020"),
    ("Église Saint-Philippe-du-Roule, Paris", "Église Saint-Philippe-du-Roule", "Église", 8,
     "culture", "AP 5,3 M€ 2016-2022 + projets 4,2 M€"),
    ("Église Saint-Eustache, Paris", "Église Saint-Eustache", "Église", 1, "culture",
     "projets 4,3 M€ 2023 + 2,9 M€ 2022"),
    ("Église Sainte-Anne de la Butte-aux-Cailles, Paris", "Église Sainte-Anne de la Butte-aux-Cailles",
     "Église", 13, "culture", "projets 4,3 M€ 2024 + 3,9 M€ 2023"),
    ("Église du Saint-Esprit, avenue Daumesnil, Paris", "Église du Saint-Esprit", "Église", 12,
     "culture", "projets 4,2 M€ 2020-2023"),
    ("Église Saint-Germain-des-Prés, Paris", "Église Saint-Germain-des-Prés", "Église", 6, "culture",
     "AP 4,2 M€ 2016-2022"),
    ("Église Notre-Dame-du-Perpétuel-Secours, Paris 11e", "Église Notre-Dame-du-Perpétuel-Secours",
     "Église", 11, "culture", "AP 3,5 M€ 2017-2022"),
    ("Église Saint-Pierre-de-Montrouge, Paris", "Église Saint-Pierre-de-Montrouge", "Église", 14,
     "culture", "projets 3,3 M€ 2020-2021"),
    ("Église Saint-Martin-des-Champs, Paris", "Église Saint-Martin-des-Champs", "Église", 10,
     "culture", "projets 2,8 M€ 2020-2021"),
    ("Église Notre-Dame-d'Auteuil, Paris", "Église Notre-Dame-d'Auteuil", "Église", 16, "culture",
     "projets 2,8 M€ 2021-2023"),
    ("Église Saint-Gervais-Saint-Protais, Paris", "Église Saint-Gervais-Saint-Protais", "Église", 4,
     "culture", "AP 2,6 M€ 2017-2022 + projets 2,9 M€ 2023"),
    ("Église Saint-Louis-en-l'Île, Paris", "Église Saint-Louis-en-l'Île", "Église", 4, "culture",
     "projets 2,6 M€ 2019-2020"),
    ("Église Saint-Joseph-des-Nations, Paris", "Église Saint-Joseph-des-Nations", "Église", 11,
     "culture", "AP 2,3 M€ 2017-2022"),
    ("Église Saint-Merri, Paris", "Église Saint-Merri", "Église", 4, "culture",
     "AP 2,1 M€ 2015-2022"),
    ("Église Notre-Dame-de-Lorette, Paris", "Église Notre-Dame-de-Lorette", "Église", 9, "culture",
     "AP 1,6 M€ 2015-2022"),
    ("Temple de l'Oratoire du Louvre, Paris", "Temple de l'Oratoire du Louvre", "Temple", 1,
     "culture", "AP 1,2 M€ 2009-2016"),
]


def nominatim(q: str) -> tuple[float, float] | None:
    """Géocodage au BÂTIMENT. La BAN renvoie la rue homonyme d'un équipement
    nommé (piège 1 du docstring) — Nominatim résout l'équipement lui-même."""
    try:
        u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1})
        j = json.loads(urllib.request.urlopen(
            urllib.request.Request(u, headers=UA), timeout=30).read())
        if not j:
            return None
        return round(float(j[0]["lat"]), 6), round(float(j[0]["lon"]), 6)
    except Exception:
        return None


def main() -> int:
    dry = "--dry-run" in sys.argv
    rows = list(csv.DictReader(SEED.open()))
    header = list(rows[0].keys())
    slugs = {r["slug"] for r in rows}
    names = {r["name"].lower() for r in rows}

    new_rows, skipped = [], 0
    for query, name, kind, arr, famille, provenance in LIEUX:
        slug = slugify(name)
        if slug in slugs or name.lower() in names:
            print(f"skip (déjà au seed) : {name}", file=sys.stderr)
            skipped += 1
            continue
        coords = nominatim(query)
        time.sleep(1.1)  # politesse Nominatim : 1 req/s
        origine = "nominatim"
        if not coords:
            coords = ban_coords(name)
            origine = "ban"
        if not coords:
            print(f"SKIP (non géocodé) : {name}", file=sys.stderr)
            continue
        lat, lon = coords
        if not (48.80 <= lat <= 48.91 and 2.22 <= lon <= 2.48):
            print(f"SKIP (hors Paris) : {name} -> {lat},{lon}", file=sys.stderr)
            continue
        new_rows.append({
            "slug": slug, "name": name, "kind_fr": kind, "arr": str(arr),
            "lat": f"{lat}", "lon": f"{lon}",
            "delib_query": name, "title_phrase": name, "bmo_query": name,
            "noms_historiques": "", "priorite": "2", "famille": famille,
            "invest_pat": invest_pat(name),
        })
        slugs.add(slug)
        print(f"OK  {slug:<46} {arr:>2} {famille:<9} {lat},{lon} [{origine}]  ← {provenance}")

    if new_rows and not dry:
        with SEED.open("a", newline="") as f:
            csv.DictWriter(f, fieldnames=header).writerows(new_rows)
    print(f"\n+{len(new_rows)} lieux ajoutés (déjà présents : {skipped}), "
          f"total {len(rows) + (0 if dry else len(new_rows))}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
