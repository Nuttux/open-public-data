#!/usr/bin/env python3
"""Troisième élargissement du seed (2026-07-21) — SOURCÉ, pas mémoire : listes
tirées de Wikipédia (piscines municipales, cimetières parisiens, espaces
verts) plutôt que d'une sélection éditoriale. Objectif : un grand POOL de
candidats qu'un système de score (score_lieu_candidates.py) triera ensuite par
signal de données réel (délibs, chantiers AP, subventions, marchés) — la barre
n'est plus « emblématique » à l'œil, mais mesurée.

Usage : python pipeline/scripts/enrich/expand_seed_lieux_v3.py
"""
from __future__ import annotations
import sys, time, csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from expand_seed_lieux import slugify, wiki_coords, ban_coords, invest_pat  # noqa: E402

# (wiki_title, name, kind_fr, arr, famille)
LIEUX: list[tuple[str, str, str, int, str]] = [
    # ── piscines municipales restantes (source : Liste des piscines de Paris, Wikipédia) ──
    ("Piscine Marie-Marvingt", "Piscine Marie-Marvingt", "Piscine", 4, "sport"),
    ("Piscine Jean Taris", "Piscine Jean-Taris", "Piscine", 5, "sport"),
    ("Piscine Saint-Germain (Paris)", "Piscine Saint-Germain", "Piscine", 6, "sport"),
    ("Piscine Jacqueline Auriol", "Piscine Jacqueline-Auriol", "Piscine", 8, "sport"),
    ("Piscine Georges Drigny", "Piscine Georges-Drigny", "Piscine", 9, "sport"),
    ("Piscine Paul Valeyre", "Piscine Paul-Valeyre", "Piscine", 9, "sport"),
    ("Piscine Château-Landon", "Piscine Château-Landon", "Piscine", 10, "sport"),
    ("Piscine Catherine-Lagatu", "Piscine Catherine-Lagatu", "Piscine", 10, "sport"),
    ("Piscine Georges Rigal", "Piscine Georges-Rigal", "Piscine", 11, "sport"),
    ("Piscine de la Cour des Lions", "Piscine de la Cour des Lions", "Piscine", 11, "sport"),
    ("Piscine Jean Boiteux", "Piscine Jean-Boiteux", "Piscine", 12, "sport"),
    ("Piscine Roger Le Gall", "Piscine Roger-Le-Gall", "Piscine", 12, "sport"),
    ("Piscine du Château des Rentiers", "Piscine du Château des Rentiers", "Piscine", 13, "sport"),
    ("Piscine Dunois", "Piscine Dunois", "Piscine", 13, "sport"),
    ("Piscine Aspirant Dunand", "Piscine Aspirant-Dunand", "Piscine", 14, "sport"),
    ("Piscine Didot", "Piscine Didot", "Piscine", 14, "sport"),
    ("Piscine Thérèse et Jeanne Brulé", "Piscine Thérèse-et-Jeanne-Brulé", "Piscine", 14, "sport"),
    ("Piscine Armand Massard", "Piscine Armand-Massard", "Piscine", 15, "sport"),
    ("Piscine Blomet", "Piscine Blomet", "Piscine", 15, "sport"),
    ("Piscine Émile Anthoine", "Piscine Émile-Anthoine", "Piscine", 15, "sport"),
    ("Piscine Keller", "Piscine Keller", "Piscine", 15, "sport"),
    ("Piscine de la Plaine", "Piscine La Plaine", "Piscine", 15, "sport"),
    ("Piscine René et André Mourlon", "Piscine René-et-André-Mourlon", "Piscine", 15, "sport"),
    ("Piscine Balard", "Piscine Balard", "Piscine", 15, "sport"),
    ("Piscine d'Auteuil", "Piscine d'Auteuil", "Piscine", 16, "sport"),
    ("Piscine Henry de Montherlant", "Piscine Henry-de-Montherlant", "Piscine", 16, "sport"),
    ("Piscine Bernard Lafay", "Piscine Bernard-Lafay", "Piscine", 17, "sport"),
    ("Piscine Marjorie Gestring", "Piscine Marjorie-Gestring", "Piscine", 17, "sport"),
    ("Piscine Bertrand Dauvin", "Piscine Bertrand-Dauvin", "Piscine", 18, "sport"),
    ("Piscine Solita Salgado", "Piscine Solita-Salgado", "Piscine", 18, "sport"),
    ("Piscine Mathis", "Piscine Mathis", "Piscine", 19, "sport"),
    ("Piscine Rouvet", "Piscine Rouvet", "Piscine", 19, "sport"),
    ("Piscine Georges Hermant", "Piscine Georges-Hermant", "Piscine", 19, "sport"),
    ("Piscine Alfred Nakache", "Piscine Alfred-Nakache", "Piscine", 20, "sport"),
    ("Piscine Yvonne Godard", "Piscine Yvonne-Godard", "Piscine", 20, "sport"),
    # ── cimetières parisiens restants (source : Liste des cimetières de Paris) ──
    ("Cimetière d'Auteuil", "Cimetière d'Auteuil", "Cimetière", 16, "vert"),
    ("Cimetière de Belleville", "Cimetière de Belleville", "Cimetière", 20, "vert"),
    ("Cimetière de Bercy", "Cimetière de Bercy", "Cimetière", 12, "vert"),
    ("Cimetière du Calvaire", "Cimetière du Calvaire", "Cimetière", 18, "vert"),
    ("Cimetière de Charonne", "Cimetière de Charonne", "Cimetière", 20, "vert"),
    ("Cimetière de Grenelle", "Cimetière de Grenelle", "Cimetière", 15, "vert"),
    ("Cimetière de la Villette", "Cimetière de la Villette", "Cimetière", 19, "vert"),
    ("Cimetière de Montrouge (Paris)", "Cimetière parisien de Montrouge", "Cimetière", 14, "vert"),
    ("Cimetière de Picpus", "Cimetière de Picpus", "Cimetière", 12, "vert"),
    ("Cimetière du Sud (Saint-Mandé)", "Cimetière Sud de Saint-Mandé", "Cimetière", 12, "vert"),
    ("Cimetière Saint-Vincent", "Cimetière Saint-Vincent", "Cimetière", 18, "vert"),
    ("Cimetière de Vaugirard", "Cimetière de Vaugirard", "Cimetière", 15, "vert"),
    ("Cimetière parisien de Bagneux", "Cimetière parisien de Bagneux", "Cimetière", 0, "vert"),
    ("Cimetière parisien d'Ivry", "Cimetière parisien d'Ivry", "Cimetière", 0, "vert"),
    ("Cimetière parisien de Pantin", "Cimetière parisien de Pantin", "Cimetière", 0, "vert"),
    ("Cimetière parisien de Saint-Ouen", "Cimetière parisien de Saint-Ouen", "Cimetière", 0, "vert"),
    ("Cimetière parisien de Thiais", "Cimetière parisien de Thiais", "Cimetière", 0, "vert"),
    # ── parcs/jardins/squares restants (source : Liste des espaces verts de Paris) ──
    ("Parc Aretha-Franklin", "Parc Aretha-Franklin", "Parc", 20, "vert"),
    ("Parc Chapelle Charbon", "Parc Chapelle-Charbon", "Parc", 18, "vert"),
    ("Parc de Choisy", "Parc de Choisy", "Parc", 13, "vert"),
    ("Parc Kellermann", "Parc Kellermann", "Parc", 13, "vert"),
    ("Parc de la Butte-du-Chapeau-Rouge", "Parc de la Butte-du-Chapeau-Rouge", "Parc", 19, "vert"),
    ("Parc Rives de Seine", "Parc Rives-de-Seine", "Promenade", 4, "vert"),
    ("Jardin du Pré Catelan", "Jardin du Pré-Catelan", "Jardin", 16, "vert"),
    ("Square du Montholon", "Square du Montholon", "Square", 9, "urbain"),
    ("Square Jean XXIII", "Square Jean-XXIII", "Square", 4, "urbain"),
    # ── marchés supplémentaires (couverts + plein air, connaissance directe) ──
    ("Marché Monge", "Marché Monge", "Marché", 5, "services"),
    ("Marché Grenelle", "Marché Grenelle", "Marché", 15, "services"),
    ("Marché des Batignolles", "Marché des Batignolles", "Marché", 17, "services"),
    ("Marché Ornano", "Marché Ornano", "Marché", 18, "services"),
    ("Marché Dejean", "Marché Dejean", "Marché", 18, "services"),
    ("Marché couvert Europe", "Marché Europe", "Marché couvert", 8, "services"),
    # ── mairies d'arrondissement restantes (les 17 non encore dans le seed) ──
    ("Mairie du 1er arrondissement de Paris", "Mairie du 1er", "Mairie", 1, "services"),
    ("Mairie du 2e arrondissement de Paris", "Mairie du 2e", "Mairie", 2, "services"),
    ("Mairie du 3e arrondissement de Paris", "Mairie du 3e", "Mairie", 3, "services"),
    ("Mairie du 4e arrondissement de Paris", "Mairie du 4e", "Mairie", 4, "services"),
    ("Mairie du 6e arrondissement de Paris", "Mairie du 6e", "Mairie", 6, "services"),
    ("Mairie du 7e arrondissement de Paris", "Mairie du 7e", "Mairie", 7, "services"),
    ("Mairie du 8e arrondissement de Paris", "Mairie du 8e", "Mairie", 8, "services"),
    ("Mairie du 9e arrondissement de Paris", "Mairie du 9e", "Mairie", 9, "services"),
    ("Mairie du 10e arrondissement de Paris", "Mairie du 10e", "Mairie", 10, "services"),
    ("Mairie du 12e arrondissement de Paris", "Mairie du 12e", "Mairie", 12, "services"),
    ("Mairie du 13e arrondissement de Paris", "Mairie du 13e", "Mairie", 13, "services"),
    ("Mairie du 14e arrondissement de Paris", "Mairie du 14e", "Mairie", 14, "services"),
    ("Mairie du 15e arrondissement de Paris", "Mairie du 15e", "Mairie", 15, "services"),
    ("Mairie du 16e arrondissement de Paris", "Mairie du 16e", "Mairie", 16, "services"),
    ("Mairie du 17e arrondissement de Paris", "Mairie du 17e", "Mairie", 17, "services"),
    ("Mairie du 19e arrondissement de Paris", "Mairie du 19e", "Mairie", 19, "services"),
]


def main() -> int:
    rows = list(csv.DictReader(SEED.open()))
    header = rows[0].keys() if rows else None
    existing_slugs = {r["slug"] for r in rows}
    existing_names = {r["name"].lower() for r in rows}

    added = 0
    new_rows = []
    for wiki_title, name, kind, arr, famille in LIEUX:
        slug = slugify(name)
        if slug in existing_slugs or name.lower() in existing_names:
            print(f"skip (dupe): {name}", file=sys.stderr)
            continue
        coords = wiki_coords(wiki_title) or ban_coords(name)
        time.sleep(1.0)
        if not coords:
            print(f"SKIP (no geocode): {name}", file=sys.stderr)
            continue
        lat, lon = coords
        if not (48.80 <= lat <= 48.91 and 2.22 <= lon <= 2.48):
            print(f"SKIP (hors Paris) : {name} -> {lat},{lon}", file=sys.stderr)
            continue
        new_rows.append({
            "slug": slug, "name": name, "kind_fr": kind, "arr": str(arr),
            "lat": f"{lat}", "lon": f"{lon}",
            "delib_query": name, "title_phrase": name, "bmo_query": name,
            "noms_historiques": "", "priorite": "3", "famille": famille,
            "invest_pat": invest_pat(name),
        })
        existing_slugs.add(slug)
        added += 1
        print(f"OK  {slug:<48} {arr:>2} {famille:<9} {lat},{lon}")

    if new_rows:
        with SEED.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(header))
            for r in new_rows:
                w.writerow(r)
    print(f"\n+{added} lieux ajoutés au seed (total {len(rows) + added}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
