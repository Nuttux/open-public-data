#!/usr/bin/env python3
"""Élargit le seed des lieux : liste curée de lieux MUNICIPAUX parisiens
reconnaissables (bibliothèques, piscines, parcs, places, marchés, mairies).

Géocodage par les coordonnées de l'article Wikipédia (précises pour un POI),
repli BAN sur « nom paris ». Colonnes de requête dérivées du nom. Les lieux sans
délibération réelle ne seront pas publiés (le filtre n_lieu de la lecture s'en
charge) — on peut donc être généreux ici.

Usage : python pipeline/scripts/enrich/expand_seed_lieux.py
"""
from __future__ import annotations
import csv, json, re, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
UA = {"User-Agent": "france-open-data/0.1 (recherche civique; franceopendata.org)"}

# (wiki_title, name, kind_fr, arr, famille). wiki_title sert au géocodage ET au
# fetch Wikipédia. famille : sport / vert / culture / urbain / services.
LIEUX: list[tuple[str, str, str, int, str]] = [
    # ── culture : bibliothèques municipales, conservatoires, scènes ──
    ("Bibliothèque Forney", "Bibliothèque Forney", "Bibliothèque", 4, "culture"),
    ("Bibliothèque Marguerite-Durand", "Bibliothèque Marguerite Durand", "Bibliothèque", 13, "culture"),
    ("Médiathèque Marguerite-Yourcenar", "Médiathèque Marguerite Yourcenar", "Médiathèque", 15, "culture"),
    ("Bibliothèque Buffon", "Bibliothèque Buffon", "Bibliothèque", 5, "culture"),
    ("Bibliothèque Vaclav-Havel", "Bibliothèque Vaclav Havel", "Bibliothèque", 18, "culture"),
    ("Bibliothèque Françoise-Sagan", "Bibliothèque Françoise Sagan", "Bibliothèque", 10, "culture"),
    ("Bibliothèque de l'Heure joyeuse", "Bibliothèque de l'Heure joyeuse", "Bibliothèque", 5, "culture"),
    ("Bibliothèque Canopée la Fontaine", "Bibliothèque Canopée la Fontaine", "Bibliothèque", 1, "culture"),
    ("Maison de la poésie (Paris)", "Maison de la Poésie", "Scène littéraire", 3, "culture"),
    ("Conservatoire à rayonnement régional de Paris", "Conservatoire de Paris (CRR)", "Conservatoire", 19, "culture"),
    ("Théâtre de la Bastille", "Théâtre de la Bastille", "Théâtre", 11, "culture"),
    ("Théâtre de la Cité internationale", "Théâtre de la Cité internationale", "Théâtre", 14, "culture"),
    ("Théâtre Dunois", "Théâtre Dunois", "Théâtre", 13, "culture"),
    ("Maison des métallos", "", "", 0, ""),  # doublon connu → ignoré (déjà dans le seed)
    # ── sport : piscines et équipements municipaux ──
    ("Piscine Château-Landon", "Piscine Château-Landon", "Piscine", 10, "sport"),
    ("Piscine Roger-Le Gall", "Piscine Roger-Le Gall", "Piscine", 12, "sport"),
    ("Piscine Keller", "Piscine Keller", "Piscine", 15, "sport"),
    ("Piscine Blomet", "Piscine Blomet", "Piscine", 15, "sport"),
    ("Piscine Champerret", "Piscine Champerret", "Piscine", 17, "sport"),
    ("Piscine Suzanne-Berlioux", "Piscine Suzanne-Berlioux", "Piscine", 1, "sport"),
    ("Piscine Molitor", "Piscine Molitor", "Piscine", 16, "sport"),
    ("Stade Émile-Anthoine", "Stade Émile-Anthoine", "Stade", 15, "sport"),
    ("Halle Georges-Carpentier", "Halle Georges-Carpentier", "Salle sportive", 13, "sport"),
    ("Stade Léo-Lagrange (Paris)", "Stade Léo-Lagrange", "Stade", 12, "sport"),
    # ── vert : parcs, jardins, bois municipaux ──
    ("Parc de Choisy", "Parc de Choisy", "Parc", 13, "vert"),
    ("Parc Kellermann", "Parc Kellermann", "Parc", 13, "vert"),
    ("Parc de la Butte-du-Chapeau-Rouge", "Parc de la Butte-du-Chapeau-Rouge", "Parc", 19, "vert"),
    ("Square des Batignolles", "Square des Batignolles", "Square", 17, "vert"),
    ("Parc Martin-Luther-King", "Parc Martin Luther King", "Parc", 17, "vert"),
    ("Parc floral de Paris", "Parc floral de Paris", "Parc", 12, "vert"),
    ("Bois de Vincennes", "Bois de Vincennes", "Bois", 12, "vert"),
    ("Bois de Boulogne", "Bois de Boulogne", "Bois", 16, "vert"),
    ("Jardin du Ranelagh", "Jardin du Ranelagh", "Jardin", 16, "vert"),
    ("Coulée verte René-Dumont", "Coulée verte René-Dumont", "Promenade", 12, "vert"),
    ("Jardin Nelson-Mandela", "Jardin Nelson-Mandela", "Jardin", 1, "vert"),
    # ── urbain : places et monuments municipaux ──
    ("Place des Vosges", "Place des Vosges", "Place", 4, "urbain"),
    ("Place d'Italie", "Place d'Italie", "Place", 13, "urbain"),
    ("Place du Tertre", "Place du Tertre", "Place", 18, "urbain"),
    ("Arènes de Lutèce", "Arènes de Lutèce", "Monument", 5, "urbain"),
    ("Place Denfert-Rochereau", "Place Denfert-Rochereau", "Place", 14, "urbain"),
    ("Fontaine des Innocents", "Fontaine des Innocents", "Monument", 1, "urbain"),
    ("Place du Châtelet", "Place du Châtelet", "Place", 1, "urbain"),
    ("Place de la Madeleine", "Place de la Madeleine", "Place", 8, "urbain"),
    # ── services : marchés, mairies, équipements ──
    ("Marché Saint-Germain", "Marché Saint-Germain", "Marché couvert", 6, "services"),
    ("Marché couvert Saint-Martin", "Marché Saint-Martin", "Marché couvert", 10, "services"),
    ("Marché Secrétan", "Marché Secrétan", "Marché couvert", 19, "services"),
    ("Bourse de commerce (Paris)", "Bourse de Commerce", "Monument", 1, "services"),
    ("Mairie du 20e arrondissement de Paris", "Mairie du 20e", "Mairie", 20, "services"),
    ("Mairie du 11e arrondissement de Paris", "Mairie du 11e", "Mairie", 11, "services"),
    ("Mairie du 12e arrondissement de Paris", "Mairie du 12e", "Mairie", 12, "services"),
]


def slugify(name: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", name.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def get(url: str, timeout: int = 25) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def wiki_coords(title: str) -> tuple[float, float] | None:
    try:
        j = json.loads(get("https://fr.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"))))
        c = j.get("coordinates")
        if c and c.get("lat") and c.get("lon"):
            return round(c["lat"], 6), round(c["lon"], 6)
    except Exception:
        return None
    return None


def ban_coords(name: str) -> tuple[float, float] | None:
    try:
        j = json.loads(get("https://api-adresse.data.gouv.fr/search/?q=" + urllib.parse.quote(name + " paris") + "&limit=1"))
        f = (j.get("features") or [None])[0]
        if f:
            lon, lat = f["geometry"]["coordinates"]
            return round(lat, 6), round(lon, 6)
    except Exception:
        return None
    return None


def invest_pat(name: str) -> str:
    """Motif de rapprochement des projets d'investissement — mots signifiants du
    nom séparés par des séparateurs souples (comme les entrées existantes)."""
    stop = {"de", "du", "des", "la", "le", "les", "l", "d", "a", "à", "the"}
    words = [w for w in re.split(r"[\s'’-]+", name) if w and w.lower() not in stop]
    return r"[\s'’-]+".join(re.escape(w) for w in words[:4])


def main() -> int:
    rows = list(csv.DictReader(SEED.open()))
    header = rows[0].keys() if rows else None
    existing_slugs = {r["slug"] for r in rows}
    existing_names = {r["name"].lower() for r in rows}

    added = 0
    new_rows = []
    for wiki_title, name, kind, arr, famille in LIEUX:
        if not name:  # ligne neutralisée
            continue
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
        new_rows.append({
            "slug": slug, "name": name, "kind_fr": kind, "arr": str(arr),
            "lat": f"{lat}", "lon": f"{lon}",
            "delib_query": name, "title_phrase": name, "bmo_query": name,
            "noms_historiques": "", "priorite": "3", "famille": famille,
            "invest_pat": invest_pat(name),
        })
        existing_slugs.add(slug)
        added += 1
        print(f"OK  {slug:<40} {arr:>2} {famille:<9} {lat},{lon}")

    if new_rows:
        with SEED.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(header))
            for r in new_rows:
                w.writerow(r)
    print(f"\n+{added} lieux ajoutés au seed (total {len(rows) + added}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
