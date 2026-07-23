#!/usr/bin/env python3
"""
Build the Marseille civic-places directory JSON by merging the curated seed with
the three enrichment sidecars (each produced by its own script, raw kept intact):

Inputs:
  pipeline/seeds/marseille_place_candidates.json               (curated list + wiki title)
  website/public/data/fr/marseille/places/_photo_credits.json  (fetch_marseille_place_photos.py)
  website/public/data/fr/marseille/places/_wiki.json           (fetch_marseille_place_wiki.py)
  website/public/data/fr/marseille/places/_money.json          (build_marseille_place_money.py)

Output:
  website/public/data/fr/marseille/places.json  (single-file, Recife-style)

Each place now carries — mirroring a Paris lieu, deliberations aside — a photo,
an encyclopaedic lead (Wikipedia FR+EN), the operator grant with its annual
détail, and residents (orgs whose grant objet names the place). Sources credited
per relation in the fiche.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "marseille_place_candidates.json"
PLACES_DIR = ROOT / "website" / "public" / "data" / "fr" / "marseille" / "places"
CREDITS = PLACES_DIR / "_photo_credits.json"
WIKI = PLACES_DIR / "_wiki.json"    # fetch_marseille_place_wiki.py (FR+EN lead)
MONEY = PLACES_DIR / "_money.json"  # build_marseille_place_money.py (operator + residents)
OUT = ROOT / "website" / "public" / "data" / "fr" / "marseille" / "places.json"

# Short factual descriptions (FR + EN), civic framing.
DESC = {
    "mucem": ("Musée national des civilisations méditerranéennes, ouvert en 2013 au J4, relié au fort Saint-Jean.",
              "National museum of Mediterranean civilisations, opened in 2013 on the J4 pier, linked to Fort Saint-Jean."),
    "palais-longchamp": ("Monument du XIXᵉ siècle abritant le musée des Beaux-Arts et le muséum d'histoire naturelle, au cœur d'un parc public.",
              "19th-century monument housing the fine-arts and natural-history museums, set in a public park."),
    "notre-dame-de-la-garde": ("Basilique perchée sur la plus haute colline de la ville, belvédère emblématique de Marseille.",
              "Basilica atop the city's highest hill, an emblematic Marseille viewpoint."),
    "vieux-port": ("Port historique et principal espace public du centre-ville, aménagé en semi-piétonnier.",
              "Historic harbour and the city centre's main public space, partly pedestrianised."),
    "friche-belle-de-mai": ("Ancienne manufacture de tabac devenue fabrique culturelle (spectacle, arts visuels), soutenue par la Ville.",
              "Former tobacco factory turned cultural venue (performance, visual arts), supported by the City."),
    "stade-velodrome": ("Grand stade municipal (~67 000 places), enceinte de l'Olympique de Marseille.",
              "Large municipal stadium (~67,000 seats), home of Olympique de Marseille."),
    "cite-radieuse": ("Unité d'habitation de Le Corbusier (1952), patrimoine architectural du XXᵉ siècle classé.",
              "Le Corbusier's Unité d'habitation (1952), listed 20th-century architectural heritage."),
    "chateau-d-if": ("Forteresse insulaire du XVIᵉ siècle, monument historique et lieu de mémoire littéraire.",
              "16th-century island fortress, historic monument and literary landmark."),
    "palais-du-pharo": ("Palais du Second Empire propriété de la Ville, aujourd'hui centre de congrès et d'événements.",
              "Second-Empire palace owned by the City, now a congress and events venue."),
    "bibliotheque-alcazar": ("Bibliothèque municipale à vocation régionale, ouverte en 2004 dans l'ancien music-hall de l'Alcazar.",
              "Regional-scale municipal library, opened in 2004 in the former Alcazar music hall."),
    "la-criee": ("Théâtre national installé dans l'ancienne criée aux poissons, sur le Vieux-Port.",
              "National theatre in a converted former fish market, on the Vieux-Port."),
    "parc-borely": ("Grand parc public du sud de la ville, avec château, jardins et hippodrome.",
              "Large public park in the south of the city, with a château, gardens and racecourse."),
}


def _load(p: Path) -> dict:
    return json.loads(p.read_text()) if p.exists() else {}


def main() -> int:
    seed = json.loads(SEED.read_text())["places"]
    credits = _load(CREDITS)
    wiki = _load(WIKI)     # slug → {extract, extract_en, url, url_en, title, title_en}
    money = _load(MONEY)   # slug → {operator, residents[]}

    places = []
    for p in seed:
        slug = p["slug"]
        cr = credits.get(slug)
        w = wiki.get(slug)
        m = money.get(slug) or {}
        op = m.get("operator")
        d_fr, d_en = DESC.get(slug, ("", ""))
        places.append({
            "slug": slug,
            "name": p["name"],
            "kind_fr": p["kind_fr"],
            "kind_en": p["kind_en"],
            "famille": p["famille"],
            "arrondissement": p.get("arrondissement"),
            "lat": p["lat"],
            "lon": p["lon"],
            "desc_fr": d_fr,
            "desc_en": d_en,
            # Encyclopaedic lead (CC-BY-SA, credited to Wikipedia) — the same
            # "wiki" block the Paris lieux carry, the main richness lift.
            "wiki": ({
                "extract": w.get("extract", ""),
                "extract_en": w.get("extract_en", ""),
                "url": w.get("url"),
                "url_en": w.get("url_en"),
            } if w else None),
            # Operator grant (place IS a beneficiary) — now with the annual détail.
            "subvention": ({
                "beneficiaire": op["beneficiaire"],
                "montant_total": op["montant_total"],
                "nb_subventions": op["nb_subventions"],
                "rows": op.get("rows", []),
                "annees": op.get("annees", []),
            } if op else None),
            # Residents — other orgs whose grant objet names the place.
            "residents": m.get("residents", []),
            "photo": cr["photo"] if cr else None,
            "photo_credit": ({
                "source": cr.get("source"),
                "file_url": cr.get("file_url"),
                "license": cr.get("license"),
                "license_url": cr.get("license_url"),
                "author": cr.get("author"),
            } if cr else None),
        })

    from collections import Counter
    fam_counts = Counter(p["famille"] for p in places)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": "Qipu — sélection de lieux publics et patrimoniaux de Marseille (v1)",
            "source_url": "https://commons.wikimedia.org/",
        },
        "perimeter": "Marseille (INSEE 13055)",
        "count": len(places),
        "familles": [{"famille": k, "n": n} for k, n in fam_counts.most_common()],
        "places": places,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    with_photo = sum(1 for p in places if p["photo"])
    with_wiki = sum(1 for p in places if p["wiki"] and p["wiki"]["extract"])
    with_subv = sum(1 for p in places if p["subvention"])
    with_res = sum(1 for p in places if p["residents"])
    print(f"wrote {len(places)} places → {OUT.relative_to(ROOT)}")
    print(f"  photo={with_photo}  wiki={with_wiki}  operator-subv={with_subv}  residents={with_res}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
