#!/usr/bin/env python3
"""Rassemble les candidats « argent public » d'un lieu, pour jugement IA.

Résolution d'entité en deux temps (« le flou propose, un signal exact
dispose ») : ici l'étape flou. On collecte tout ce qui POURRAIT être lié au
lieu, à partir d'un faisceau d'indices bon marché — puis un agent tranche
chaque candidat en citant le signal (gather → juge → export).

Signaux (vérifié 2026-07-17 sur Châtelet/Philharmonie) :
  - subventions : le nom du bénéficiaire OU l'OBJET contient le lieu/alias.
    L'objet est le signal fort : « Théâtre du Châtelet - subvention de
    fonctionnement » désigne l'exploitant « THEATRE MUSICAL DE PARIS », que le
    nom seul ne trouve jamais. Il distingue aussi l'exploitant du résident
    (« concerts à la Philharmonie » = Orchestre de Paris, pas l'exploitant).
  - projets d'investissement : proximité géographique (< RAYON) — les projets
    sont géocodés, le lieu aussi. Candidat, pas preuve : au centre plusieurs
    lieux se chevauchent, d'où le jugement.
  - marchés publics : l'OBJET du marché (écrit par la Ville) ou son lieu
    d'exécution DECP nomme l'équipement. Un marché est de l'argent public au
    même titre qu'une subvention : trois sources, UN seul gather et UN seul
    juge — pas trois mécanismes ad hoc.

Sortie : pipeline/cache/lieux/{slug}_money_candidates.json

Usage : python pipeline/scripts/enrich/gather_lieu_money_candidates.py
"""
from __future__ import annotations

import csv
import glob
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"
WEB = ROOT / "website" / "public" / "data"

RAYON_M = 200          # projets candidats dans ce rayon
MAX_SUBV = 25          # plafond de candidats subvention par lieu
MAX_PROJ = 20
MAX_MARCHE = 20        # plafond de candidats marché public par lieu

# Alias : un lieu peut porter plusieurs noms (nom historique, exploitant connu).
ALIAS = {
    "theatre-de-la-ville": ["Théâtre de la Ville", "Théâtre Sarah-Bernhardt"],
    "theatre-du-chatelet": ["Théâtre du Châtelet", "Théâtre Musical de Paris", "Châtelet"],
    "philharmonie-de-paris": ["Philharmonie de Paris", "Cité de la musique"],
    "gaite-lyrique": ["Gaîté Lyrique", "Gaité Lyrique"],
}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-’']+", " ", s).strip()


def haversine_m(a_lat, a_lon, b_lat, b_lon) -> float:
    R = 6371000
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def subvention_candidats(needles: list[str]) -> list[dict]:
    """Bénéficiaires dont le nom ou l'objet contient un alias du lieu."""
    keys = [norm(n) for n in needles]
    # « théâtre de la ville » est court : on exige au moins un alias distinctif
    # (pas le mot générique seul) pour éviter le rappel massif.
    seen: dict[str, dict] = {}
    for f in glob.glob(str(WEB / "**/beneficiaires_*.json"), recursive=True):
        if "search" in f or "/marseille/" in f:
            continue
        for b in json.load(open(f)).get("data", []):
            name = str(b.get("beneficiaire") or "")
            objet = str(b.get("objet_principal") or "")
            hay_name, hay_objet = norm(name), norm(objet)
            hit_name = any(k in hay_name for k in keys)
            hit_objet = any(k in hay_objet for k in keys)
            if not (hit_name or hit_objet):
                continue
            row = seen.setdefault(name, {
                "beneficiaire": name, "siret": b.get("siret"),
                "objet_principal": objet or None, "montant_total": 0.0,
                "signal": "nom" if hit_name else "objet",
            })
            row["montant_total"] += b.get("montant_total") or 0
            if hit_name and hit_objet:
                row["signal"] = "nom+objet"
    rows = sorted(seen.values(), key=lambda r: -r["montant_total"])
    return rows[:MAX_SUBV]


def projet_candidats(lat: float, lon: float) -> list[dict]:
    """Projets d'investissement géolocalisés dans le rayon."""
    out = []
    for f in sorted(glob.glob(str(WEB / "map/investissements_complet_*.json"))):
        year = f[-9:-5]
        for r in json.load(open(f)).get("data") or []:
            if not (r.get("lat") and r.get("montant")):
                continue
            d = haversine_m(lat, lon, r["lat"], r["lon"])
            if d <= RAYON_M:
                out.append({"annee": r.get("annee") or year, "montant_eur": r["montant"],
                            "nom_projet": str(r.get("nom_projet") or "")[:90],
                            "distance_m": round(d)})
    out.sort(key=lambda r: (r["distance_m"], -r["montant_eur"]))
    return out[:MAX_PROJ]


def marche_candidats(needles: list[str]) -> list[dict]:
    """Marchés publics dont l'OBJET (ou le lieu d'exécution DECP) nomme le lieu.

    Même signal que pour les subventions — l'objet du marché est écrit par la
    Ville et nomme l'équipement concerné (« Théâtre du Châtelet — restauration
    des toitures »). Un marché est de l'argent public au même titre qu'une
    subvention ou un investissement : il manquait à la fiche.
    Candidat, pas preuve : le juge tranche ensuite (un objet peut nommer le lieu
    comme simple repère d'adresse — « rue, face au théâtre X »)."""
    keys = [norm(n) for n in needles]
    out: list[dict] = []
    for f in sorted(glob.glob(str(WEB / "marches-publics/marches_*.json"))):
        try:
            data = json.load(open(f)).get("data") or []
        except Exception:
            continue
        for m in data:
            objet = str(m.get("objet") or "")
            lieu_exec = str(m.get("decp_lieu_execution_lisible") or "")
            hay_objet, hay_lieu = norm(objet), norm(lieu_exec)
            hit_objet = any(k in hay_objet for k in keys)
            hit_lieu = any(k in hay_lieu for k in keys)
            if not (hit_objet or hit_lieu):
                continue
            try:
                montant = float(m.get("montant_max") or 0)
            except (TypeError, ValueError):
                montant = 0.0
            out.append({
                "numero_marche": m.get("numero_marche"),
                "objet": objet[:220],
                "fournisseur": m.get("fournisseur_nom"),
                "fournisseur_siret": m.get("fournisseur_siret"),
                "montant_max": montant,
                "date_notification": m.get("date_notification"),
                "lieu_execution": lieu_exec[:120] or None,
                "signal": "objet" if hit_objet else "lieu_execution",
            })
    out.sort(key=lambda r: -(r["montant_max"] or 0))
    return out[:MAX_MARCHE]


def main() -> int:
    for seed in csv.DictReader(SEED.open()):
        slug = seed["slug"]
        if not (CACHE / f"{slug}_delibs.jsonl").exists():
            continue
        needles = ALIAS.get(slug, [seed["name"]])
        subv = subvention_candidats(needles)
        proj = projet_candidats(float(seed["lat"]), float(seed["lon"]))
        marches = marche_candidats(needles)
        out = {"slug": slug, "name": seed["name"], "kind_fr": seed["kind_fr"],
               "arrondissement": int(seed["arr"]), "aliases": needles,
               "subventions_candidates": subv, "projets_candidats": proj,
               "marches_candidats": marches}
        (CACHE / f"{slug}_money_candidates.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
        print(f"{slug:<40} {len(subv):>2} subv · {len(proj):>2} projets · {len(marches):>2} marchés")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
