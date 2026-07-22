#!/usr/bin/env python3
"""
Géocode les projets d'investissement Marseille via l'API BAN
(api-adresse.data.gouv.fr — service État, gratuit, pas de LLM).

Lit  : website/public/data/marseille/investissements/investissements_{year}.json
Écrit: même fichier mis à jour avec lat/lon par projet (+ adresse normalisée
       quand BAN trouve un match probant). Fallback : centre de l'arrondissement.

Workflow :
  1. Nettoie le nom_projet (retire suffixes du parsing prosaïque "plus de X euros")
  2. Construit une query "<nom> Marseille <arr>e arrondissement"
  3. Appelle BAN, garde le 1er résultat si score >= 0.4
  4. Sinon, fallback centre arrondissement (lat/lon prédéfinis)

⚠ Pas d'appel LLM externe (cf. mémoire feedback_enrichment_in_session).
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).parent.parent.parent.parent
DATA_DIR = ROOT / "website" / "public" / "data" / "marseille" / "investissements"

BAN_API = "https://api-adresse.data.gouv.fr/search/"
SCORE_THRESHOLD = 0.4

# Centres approximatifs des 16 arrondissements de Marseille (lat, lon).
# Source : centroïdes IGN ADMIN-EXPRESS, arrondis 4 décimales.
ARRONDISSEMENT_CENTERS: dict[int, tuple[float, float]] = {
    1: (43.2978, 5.3833),
    2: (43.3015, 5.3651),
    3: (43.3149, 5.3820),
    4: (43.3030, 5.4034),
    5: (43.2867, 5.4054),
    6: (43.2879, 5.3818),
    7: (43.2710, 5.3505),
    8: (43.2520, 5.3839),
    9: (43.2442, 5.4317),
    10: (43.2779, 5.4256),
    11: (43.2966, 5.4794),
    12: (43.3168, 5.4358),
    13: (43.3478, 5.4193),
    14: (43.3409, 5.3891),
    15: (43.3637, 5.3556),
    16: (43.3722, 5.3306),
}


def clean_project_name(raw: str) -> str:
    """Retire les suffixes de parsing prosaïque (montants, notes)."""
    name = raw
    # Retire la parenthèse arrondissement et tout ce qui suit
    name = re.sub(r"\s*\(\d+(?:er|ème|e)\s*arr.*$", "", name, flags=re.IGNORECASE)
    # Retire montants / phrases résiduelles type "plus de X euros investis"
    name = re.sub(r",?\s*(plus|près)\s+d.[^,]+", "", name, flags=re.IGNORECASE)
    name = re.sub(r",\s*\d[\d\s]*\s*(euros|€).*$", "", name, flags=re.IGNORECASE)
    return name.strip(" .,")


JUNK_PREFIXES = (
    "le ", "la ", "les ", "cet ", "cette ", "ces ",
    "c'est", "c'", "d'autre", "d'une", "d'un ",
    "pour ", "par ", "dans ", "aussi ", "enfin", "néanmoins ",
    "ce qui", "cela ", "celui", "celle",
    "il s'agit", "il convient",
    "le budget", "le compte", "le montant", "le coût",
    "à hauteur",
    "une nouvelle", "une autre",
    "un nouveau", "un autre",
    "des dépenses", "des opérations", "des frais", "des travaux",
)
JUNK_CONTAINS = (
    "représente", "s'élève", "s'établit",
    "progressent", "progresse", "augmente", "diminue",
    "en augmentation", "en diminution",
    "thématique", "agrégat",
)


def is_real_project(name: str, arrondissement: int = 0) -> bool:
    """Filtre strict pour distinguer un projet d'un fragment de phrase."""
    if not name:
        return False
    # Pas d'arrondissement identifié → presque toujours un fragment narratif
    if arrondissement == 0:
        return False
    n = name.strip()
    if len(n) < 4 or len(n) > 90:
        return False
    low = n.lower()
    if any(low.startswith(p) for p in JUNK_PREFIXES):
        return False
    if any(s in low for s in JUNK_CONTAINS):
        return False
    has_proper = any(c.isupper() for c in n[1:])
    EQUIP = ("école", "stade", "gymnase", "centre", "place", "parc",
             "médiathèque", "bibliothèque", "crèche", "piscine",
             "marché", "groupe scolaire", "élémentaire", "maternelle",
             "musée", "halle", "halles", "théâtre", "opéra")
    has_equip = any(e in low for e in EQUIP)
    return has_proper or has_equip


def build_query(clean_name: str, arr: int, thematique: str) -> str:
    """Construit une query BAN biaisée vers le bon type d'équipement."""
    # Préfixe selon thématique (école = "école X", sport = "stade/gymnase X", etc.)
    t = (thematique or "").lower()
    prefix = ""
    if "école" in t or "ecol" in t or "petite enfance" in t or "jeunes" in t:
        prefix = "école "
    elif "sport" in t or "nautisme" in t:
        prefix = ""  # nom suffit (souvent "stade X" ou "piscine X")
    elif "sécurité" in t or "bmpm" in t:
        prefix = ""
    return f"{prefix}{clean_name} Marseille {arr}e arrondissement".strip()


def geocode_one(query: str) -> dict | None:
    """Appelle BAN. Renvoie le 1er feature si score >= seuil, sinon None."""
    url = f"{BAN_API}?q={quote(query)}&limit=1&type=street"
    try:
        with urlopen(Request(url, headers={"User-Agent": "qipu-poc/1.0"}), timeout=10) as resp:
            data = json.load(resp)
    except Exception as e:
        print(f"    BAN error for {query[:60]!r}: {e}")
        return None
    feats = data.get("features", [])
    if not feats:
        return None
    f = feats[0]
    score = f.get("properties", {}).get("score", 0)
    if score < SCORE_THRESHOLD:
        return None
    coords = f.get("geometry", {}).get("coordinates", [])
    if len(coords) != 2:
        return None
    lon, lat = coords
    return {
        "lat": lat,
        "lon": lon,
        "adresse": f.get("properties", {}).get("label", ""),
        "score": round(score, 3),
    }


def fallback_center(arr: int) -> dict:
    lat, lon = ARRONDISSEMENT_CENTERS.get(arr, (43.2965, 5.3698))
    return {"lat": lat, "lon": lon, "adresse": None, "score": None}


def enrich_year(year: int) -> int:
    path = DATA_DIR / f"investissements_{year}.json"
    if not path.exists():
        print(f"  skip {year}: file missing")
        return 0
    with open(path) as f:
        d = json.load(f)
    projets = d.get("data", [])
    print(f"\n=== {year} : {len(projets)} projets ===")

    n_ban = 0
    n_fallback = 0
    n_filtered = 0
    for p in projets:
        clean = clean_project_name(p.get("nom_projet", ""))
        if not is_real_project(clean, p.get("arrondissement", 0)):
            p["is_project"] = False
            p["lat"] = None
            p["lon"] = None
            p["adresse"] = None
            p["geo_source"] = "filtered_fragment"
            n_filtered += 1
            continue
        p["is_project"] = True
        if p.get("lat") is not None:
            continue  # already geocoded
        if not clean:
            geo = fallback_center(p["arrondissement"])
            n_fallback += 1
        else:
            q = build_query(clean, p["arrondissement"], p.get("thematique", ""))
            geo = geocode_one(q)
            if geo:
                n_ban += 1
                print(f"  ✓ BAN({geo['score']}) [{p['arrondissement']:>2}e] {clean[:40]:40s} → {geo['adresse'][:60]}")
            else:
                geo = fallback_center(p["arrondissement"])
                n_fallback += 1
                print(f"  · fallback     [{p['arrondissement']:>2}e] {clean[:40]:40s} → centre arr.")
            time.sleep(0.05)  # be gentle with BAN

        p["lat"] = geo["lat"]
        p["lon"] = geo["lon"]
        p["adresse"] = geo["adresse"]
        p["geo_source"] = "ban" if geo["score"] is not None else "centre_arrondissement"
        if "nom_projet" in p:
            cleaned = clean_project_name(p["nom_projet"])
            if cleaned and cleaned != p["nom_projet"]:
                p["nom_projet_raw"] = p["nom_projet"]
                p["nom_projet"] = cleaned

    # Ré-écriture du fichier
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"  → BAN: {n_ban}  |  fallback: {n_fallback}  |  filtered: {n_filtered}  |  total: {len(projets)}")
    return n_ban


def main() -> int:
    print("=== Géocodage Marseille via API BAN (api-adresse.data.gouv.fr) ===")
    total_ban = 0
    for year in [2023, 2024]:
        total_ban += enrich_year(year)
    print(f"\nTotal BAN-geocoded projects: {total_ban}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
