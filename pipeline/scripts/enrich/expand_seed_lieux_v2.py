#!/usr/bin/env python3
"""Deuxième élargissement du seed des lieux (2026-07-21) : au-delà des
équipements municipaux (v1), on ouvre aux points d'eau, cimetières, places et
monuments, marchés et quelques mairies d'arrondissement — la barre reste
« lieu identifiable, matière à délibération réelle », mais n'exige plus un
bâtiment municipal. Toujours pas d'équipements de quartier interchangeables
(petites piscines/bibliothèques déjà écartées le 2026-07-18), et rien qui
n'appartient pas au domaine de la Ville (ponts sur Seine = VNF/État, grandes
salles privées, monuments nationaux type Panthéon/Grand Palais → exclus).

Réutilise le géocodage/slugify/invest_pat de expand_seed_lieux.py.

Usage : python pipeline/scripts/enrich/expand_seed_lieux_v2.py
"""
from __future__ import annotations
import csv, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from expand_seed_lieux import slugify, wiki_coords, ban_coords, invest_pat  # noqa: E402

# (wiki_title, name, kind_fr, arr, famille) — famille reste dans la palette
# validée à 5 familles (sport/vert/culture/urbain/services) : eau et
# cimetières → vert ou services selon le précédent déjà posé par
# canal-saint-martin (services/Infrastructure) et père-lachaise (vert/Cimetière).
LIEUX: list[tuple[str, str, str, int, str]] = [
    # ── eau : bassins et plans d'eau gérés par la Ville ──
    ("Bassin de la Villette", "Bassin de la Villette", "Infrastructure", 19, "services"),
    ("Port de l'Arsenal", "Port de l'Arsenal", "Infrastructure", 12, "services"),
    ("Lac Daumesnil", "Lac Daumesnil", "Infrastructure", 12, "vert"),
    # ── cimetières parisiens (hors Père-Lachaise, déjà couvert) ──
    ("Cimetière du Montparnasse", "Cimetière du Montparnasse", "Cimetière", 14, "vert"),
    ("Cimetière de Montmartre", "Cimetière de Montmartre", "Cimetière", 18, "vert"),
    ("Cimetière de Passy", "Cimetière de Passy", "Cimetière", 16, "vert"),
    ("Cimetière des Batignolles", "Cimetière des Batignolles", "Cimetière", 17, "vert"),
    # ── monuments et fontaines (domaine public de la Ville) ──
    ("Fontaine Stravinsky", "Fontaine Stravinsky", "Monument", 4, "urbain"),
    ("Fontaine de Mars", "Fontaine de Mars", "Monument", 7, "urbain"),
    ("Mur pour la paix", "Le Mur pour la Paix", "Monument", 7, "urbain"),
    ("Île aux Cygnes", "Île aux Cygnes", "Promenade", 15, "vert"),
    # ── grandes places et squares emblématiques non couverts ──
    ("Place de la Concorde", "Place de la Concorde", "Place", 8, "urbain"),
    ("Place Vendôme", "Place Vendôme", "Place", 1, "urbain"),
    ("Place Charles-de-Gaulle (Paris)", "Place Charles-de-Gaulle (Étoile)", "Place", 8, "urbain"),
    ("Place du Trocadéro-et-du-11-Novembre", "Place du Trocadéro", "Place", 16, "urbain"),
    ("Place du Panthéon", "Place du Panthéon", "Place", 5, "urbain"),
    ("Place Pigalle", "Place Pigalle", "Place", 18, "urbain"),
    ("Place de Clichy", "Place de Clichy", "Place", 17, "urbain"),
    ("Place Saint-Sulpice", "Place Saint-Sulpice", "Place", 6, "urbain"),
    ("Place des Ternes", "Place des Ternes", "Place", 17, "urbain"),
    ("Place Gambetta (Paris)", "Place Gambetta", "Place", 20, "urbain"),
    ("Place Léon-Blum", "Place Léon-Blum", "Place", 11, "urbain"),
    ("Place des Fêtes", "Place des Fêtes", "Place", 19, "urbain"),
    ("Square Louise-Michel (Paris)", "Square Louise-Michel", "Square", 18, "urbain"),
    ("Square René-Viviani", "Square René-Viviani", "Square", 5, "urbain"),
    ("Square du Temple - Elie Wiesel", "Square du Temple", "Square", 3, "urbain"),
    ("Square des Batignolles", "Square des Batignolles", "Square", 17, "urbain"),
    # ── marchés couverts et de plein air ──
    ("Marché Bastille", "Marché Bastille", "Marché", 11, "services"),
    ("Marché de Belleville", "Marché Belleville", "Marché", 20, "services"),
    ("Marché Saint-Germain", "Marché Saint-Germain", "Marché couvert", 6, "services"),
    ("Marché couvert Saint-Martin", "Marché Saint-Martin", "Marché couvert", 10, "services"),
    ("Marché Secrétan", "Marché Secrétan", "Marché couvert", 19, "services"),
    ("Marché Convention", "Marché Convention", "Marché couvert", 15, "services"),
    # ── mairies d'arrondissement emblématiques ──
    ("Mairie du 5e arrondissement de Paris", "Mairie du 5e", "Mairie", 5, "services"),
    ("Mairie du 11e arrondissement de Paris", "Mairie du 11e", "Mairie", 11, "services"),
    ("Mairie du 20e arrondissement de Paris", "Mairie du 20e", "Mairie", 20, "services"),
    # ── culture : institutions municipales non couvertes ──
    ("Musée de la Libération de Paris", "Musée de la Libération de Paris", "Musée", 14, "culture"),
    ("Maison européenne de la photographie", "Maison Européenne de la Photographie", "Équipement culturel", 4, "culture"),
    ("Bibliothèque Marguerite-Durand", "Bibliothèque Marguerite Durand", "Bibliothèque", 13, "culture"),
    ("Médiathèque Marguerite-Yourcenar", "Médiathèque Marguerite Yourcenar", "Médiathèque", 15, "culture"),
    ("Théâtre Dunois", "Théâtre Dunois", "Théâtre", 13, "culture"),
    ("Théâtre du Soleil", "Théâtre du Soleil", "Théâtre", 12, "culture"),
    ("La Villette (Paris)", "Grande Halle de la Villette", "Équipement culturel", 19, "culture"),
    ("Jardin atlantique", "Jardin Atlantique", "Jardin", 15, "vert"),
    ("Jardin Anne-Frank (Paris)", "Jardin Anne-Frank", "Jardin", 3, "vert"),
    ("Jardin Nelson-Mandela", "Jardin Nelson Mandela", "Jardin", 1, "vert"),
    # ── sport : équipements à rayonnement citywide ──
    ("Piscine Suzanne-Berlioux", "Piscine Suzanne-Berlioux", "Piscine", 1, "sport"),
    ("Cipale", "Vélodrome Jacques-Anquetil", "Vélodrome", 12, "sport"),
    ("Stade Pierre-de-Coubertin", "Stade Pierre-de-Coubertin", "Stade", 16, "sport"),
    ("Halle Georges-Carpentier", "Halle Georges-Carpentier", "Salle sportive", 13, "sport"),
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
        time.sleep(1.2)
        if not coords:
            print(f"SKIP (no geocode): {name}", file=sys.stderr)
            continue
        lat, lon = coords
        # bornes Paris intra-muros — un repli BAN matche parfois une homonyme
        # d'une autre commune (leçon déjà tirée sur l'élargissement v1).
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
        print(f"OK  {slug:<45} {arr:>2} {famille:<9} {lat},{lon}")

    if new_rows:
        with SEED.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(header))
            for r in new_rows:
                w.writerow(r)
    print(f"\n+{added} lieux ajoutés au seed (total {len(rows) + added}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
