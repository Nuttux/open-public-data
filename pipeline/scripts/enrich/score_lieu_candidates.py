#!/usr/bin/env python3
"""Score les candidats lieux par signal de données réel, PAS par intuition
éditoriale (décision 2026-07-21) : magnitude € (log-échelle) en tête, largeur
de sources ensuite, présence en délib comme bonus mineur seulement.

Lit {slug}_money_candidates.json (gather non jugé — chantier AP, subventions,
investissements, marchés) + {slug}_ctx.json (profondeur de lecture délib,
bonus). N'exige PAS de délib : un lieu avec 0 signal délib mais de l'argent
réel score quand même haut.

Pondération du signal (un candidat brut n'est pas une preuve — cf. juge IA en
aval) : un rapprochement par NOM/OBJET est fiable, une simple proximité
géographique < 200 m est du bruit au centre de Paris (plusieurs lieux se
chevauchent) → poids réduit plutôt qu'exclu.

Usage : python pipeline/scripts/enrich/score_lieu_candidates.py [--top N] [--csv out.csv]
"""
from __future__ import annotations
import argparse
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"
WEB = ROOT / "website" / "public" / "data" / "lieux"

PROXIMITE_SEUL_POIDS = 0.3   # candidat projet trouvé SEULEMENT par distance
LIEU_EXECUTION_POIDS = 0.5   # marché matché par lieu_execution DECP, pas l'objet


def weighted_money(mc: dict) -> dict:
    subv = sum(s.get("montant_total") or 0 for s in mc.get("subventions_candidates", []))

    proj = 0.0
    for p in mc.get("projets_candidats", []):
        m = p.get("montant_eur") or 0
        proj += m if p.get("signal") != "proximite" else m * PROXIMITE_SEUL_POIDS

    marche = 0.0
    for m in mc.get("marches_candidats", []):
        mt = m.get("montant_max") or 0
        marche += mt if m.get("signal") == "objet" else mt * LIEU_EXECUTION_POIDS

    ap = sum(a.get("total_mandate") or 0 for a in mc.get("ap_candidats", []))

    breadth = sum(1 for v in (subv, proj, marche, ap) if v > 0)
    return {"subv": subv, "proj": proj, "marche": marche, "ap": ap,
            "total": subv + proj + marche + ap, "breadth": breadth,
            "n_subv": len(mc.get("subventions_candidates", [])),
            "n_proj": len(mc.get("projets_candidats", [])),
            "n_marche": len(mc.get("marches_candidats", [])),
            "n_ap": len(mc.get("ap_candidats", []))}


def delib_bonus(slug: str) -> tuple[float, int, int]:
    """Bonus mineur : profondeur de lecture délib disponible (n_lus, caractères
    de contexte cités). Ne bloque rien — juste un petit plus au score."""
    p = CACHE / f"{slug}_ctx.json"
    if not p.exists():
        return 0.0, 0, 0
    try:
        d = json.load(open(p))
    except Exception:
        return 0.0, 0, 0
    docs = d.get("docs", [])
    chars = sum(len(x.get("contexts") or "") if isinstance(x.get("contexts"), str)
               else sum(len(c) for c in (x.get("contexts") or [])) for x in docs)
    n_lus = d.get("n_lus", 0)
    bonus = min(0.5, math.log10(1 + chars) / 12) if chars else 0.0
    return round(bonus, 3), n_lus, chars


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=250)
    ap.add_argument("--csv", default=None)
    args = ap.parse_args()

    rows = list(csv.DictReader(SEED.open()))
    out = []
    for r in rows:
        slug = r["slug"]
        mcp = CACHE / f"{slug}_money_candidates.json"
        if not mcp.exists():
            continue
        mc = json.load(open(mcp))
        wm = weighted_money(mc)
        dbonus, n_lus, chars = delib_bonus(slug)
        already_published = (WEB / f"lieu_{slug}.json").exists()
        mag = math.log10(1 + wm["total"])
        score = mag + wm["breadth"] * 0.5 + dbonus
        out.append({
            "slug": slug, "name": r["name"], "kind_fr": r["kind_fr"], "famille": r["famille"],
            "arr": r["arr"], "score": round(score, 3), "magnitude_log10": round(mag, 3),
            "money_total_eur": round(wm["total"]), "breadth": wm["breadth"],
            "n_subv": wm["n_subv"], "n_proj": wm["n_proj"], "n_marche": wm["n_marche"], "n_ap": wm["n_ap"],
            "subv_eur": round(wm["subv"]), "proj_eur": round(wm["proj"]),
            "marche_eur": round(wm["marche"]), "ap_eur": round(wm["ap"]),
            "delib_bonus": dbonus, "n_lus_delib": n_lus, "delib_chars": chars,
            "already_published": already_published,
        })

    out.sort(key=lambda x: -x["score"])
    for i, r in enumerate(out[: args.top], 1):
        pub = "PUB" if r["already_published"] else "new"
        print(f"{i:>3} {r['score']:>6.2f}  {r['slug']:<42} {pub}  {r['famille']:<9} "
              f"€{r['money_total_eur']:>13,.0f}  breadth={r['breadth']}  "
              f"(subv={r['n_subv']} proj={r['n_proj']} marche={r['n_marche']} ap={r['n_ap']})")

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
            w.writeheader()
            w.writerows(out)
        print(f"\n-> {args.csv} ({len(out)} lieux notés)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
