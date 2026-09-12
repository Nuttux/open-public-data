#!/usr/bin/env python3
"""AP/CP : du brut au mart « opération × exercice » (dépense réelle mandatée).

Couches, dans l'ordre du fichier (mêmes règles que le warehouse — raw ne se
transforme pas, stg type et filtre, le mart seul agrège ; à migrer en modèles
dbt avec le reste de la chaîne lieux, cf. Block C) :

  RAW   pipeline/cache/ap_cp/ap_cp_raw.jsonl       (M14, exercices 2009-2017)
        pipeline/cache/ap_cp/ap_cp_m57_raw.jsonl   (M57, exercices 2018+)
  STG   typage des montants, année d'exercice, filtre Dépenses × Réel ×
        Investissement — aucune agrégation
  MART  rollup (autorisation_de_programme_cle × exercice) : mandaté annuel,
        libellés, directions — le grain que consomme le gather des lieux

Sortie : website/public/data/ca/ap_operations.json
  { generated_at, source: {name, url}, periode: [min, max],
    operations: [{ap_cle, ap_texte, mission_texte, direction,
                  mandate_par_annee: {"2009": 123.0, ...}, total_mandate}] }

Chaque opération est citable : URL ODS avec refine sur la clé d'AP, vers le
jeu qui porte son exercice le plus récent (`source_url` par opération).

NB période : la Ville publie la même série en DEUX jeux coupés au changement
de plan comptable — M14 jusqu'en 2017, M57 à partir de 2018 — avec les mêmes
champs et les mêmes clés d'AP. On ne lisait que le premier, ce qui coupait
toute opération au 31 décembre 2017 : la rénovation du Châtelet s'arrêtait à
2,9 M€ mandatés alors que 27,8 M€ l'ont été de 2018 à 2021 (constaté
2026-09-10). Les deux jeux sont désormais empilés dans un seul mart.

Usage : python pipeline/scripts/export/export_ap_operations.py
"""
from __future__ import annotations

import json
import sys
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _export_common import data_dir

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ap_cp"
OUT = data_dir() / "ca" / "ap_operations.json"
# Les deux moitiés de la série, dans l'ordre chronologique. `raw` est le fichier
# produit par sync_ap_cp.py, `dataset` l'identifiant ODS pour citer la ligne.
PLANS = [
    {"plan": "M14", "raw": CACHE / "ap_cp_raw.jsonl",
     "dataset": "comptes-administratifs-autorisations-de-programmes-ap-ville-departement"},
    {"plan": "M57", "raw": CACHE / "ap_cp_m57_raw.jsonl",
     "dataset": "comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de"},
]
DATASET = PLANS[0]["dataset"]


def stg_rows() -> list[dict]:
    """STG : lignes typées et filtrées, grain inchangé (1 ligne raw = 1 ligne stg).

    Les deux jeux (M14, M57) partagent leurs noms de champs ET leurs clés d'AP :
    ils passent par le même filtre et se retrouvent dans le même flux, chaque
    ligne gardant son jeu d'origine pour la citation."""
    rows = []
    for plan in PLANS:
        if not plan["raw"].exists():
            print(f"  ⚠ {plan['plan']} : {plan['raw'].name} absent — "
                  f"lancer sync_ap_cp.py --plan {plan['plan'].lower()}", file=sys.stderr)
            continue
        rows.extend(stg_plan(plan))
    return rows


def stg_plan(plan: dict) -> list[dict]:
    rows = []
    for line in plan["raw"].open():
        r = json.loads(line)
        if r.get("sens_depense_recette") != "Dépenses":
            continue
        if r.get("type_d_operation_r_o_i_m") != "Réel":
            continue
        if r.get("section_budgetaire_i_f") != "Investissement":
            continue
        # Chapitres FINANCIERS exclus : les natures 16x (emprunts et dettes) sont
        # des remboursements de capital, pas des dépenses d'équipement. Les
        # compter en plus de la dépense qu'ils ont financée double le capital
        # (vérifié sur la Philharmonie : 159,7 M€ de subvention d'équipement en
        # 2014 PUIS 24,4 M€ de remboursements 16878 en 2015-2017 — mêmes euros).
        # Idem 26x/27x (immobilisations financières).
        nat = str(r.get("nature_budgetaire_cle") or "")
        if nat[:2] in ("16", "26", "27"):
            continue
        try:
            mandate = float(r.get("mandate_titre_apres_regul") or 0)
        except (TypeError, ValueError):
            continue
        if mandate == 0:
            continue
        rows.append({
            "exercice": str(r.get("exercice_comptable") or "")[:4],
            "ap_cle": r.get("autorisation_de_programme_cle"),
            "ap_texte": (r.get("autorisation_de_programme_texte") or "").strip(),
            "mission_texte": (r.get("mission_ap_texte") or "").strip(),
            "direction": (r.get("direction_gestionnaire_texte") or "").strip(),
            "mandate": mandate,
            "dataset": plan["dataset"],
        })
    return rows


def mart(rows: list[dict]) -> list[dict]:
    """MART : rollup opération × exercice. Seul endroit où l'on agrège."""
    ops: dict[str, dict] = {}
    for r in rows:
        cle = r["ap_cle"] or f"__sans_cle__{r['ap_texte']}"
        o = ops.setdefault(cle, {
            "ap_cle": r["ap_cle"], "ap_texte": r["ap_texte"],
            "mission_texte": r["mission_texte"], "direction": r["direction"],
            "mandate_par_annee": defaultdict(float),
            "dataset_par_annee": {},
        })
        o["mandate_par_annee"][r["exercice"]] += r["mandate"]
        o["dataset_par_annee"][r["exercice"]] = r["dataset"]
        # le libellé le plus long observé est le plus informatif (troncatures)
        if len(r["ap_texte"]) > len(o["ap_texte"]):
            o["ap_texte"] = r["ap_texte"]
    out = []
    for o in ops.values():
        par_annee = {a: round(v, 2) for a, v in sorted(o["mandate_par_annee"].items()) if v}
        if not par_annee:
            continue
        # On cite le jeu qui porte l'exercice le plus récent de l'opération :
        # c'est là que le lecteur trouve la suite, et le refine sur la clé d'AP
        # y ramène toutes les lignes de la période couverte par ce jeu.
        dernier = max(par_annee)
        ds = o["dataset_par_annee"].get(dernier, DATASET)
        out.append({
            "ap_cle": o["ap_cle"], "ap_texte": o["ap_texte"],
            "mission_texte": o["mission_texte"], "direction": o["direction"],
            "mandate_par_annee": par_annee,
            "total_mandate": round(sum(par_annee.values()), 2),
            "dataset": ds,
            "source_url": (f"https://opendata.paris.fr/explore/dataset/{ds}/table/"
                           "?refine.autorisation_de_programme_cle="
                           + urllib.parse.quote(str(o["ap_cle"] or ""))),
        })
    out.sort(key=lambda o: -o["total_mandate"])
    return out


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", default="paris")
    args = parser.parse_args()
    global OUT
    OUT = data_dir(args.city) / "ca" / "ap_operations.json"

    rows = stg_rows()
    ops = mart(rows)
    annees = sorted({a for o in ops for a in o["mandate_par_annee"]})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": "Comptes administratifs — autorisations de programme (Ville de Paris)",
            "url": f"https://opendata.paris.fr/explore/dataset/{DATASET}/",
        },
        "sources": [{"plan_comptable": p["plan"], "dataset": p["dataset"],
                     "url": f"https://opendata.paris.fr/explore/dataset/{p['dataset']}/"}
                    for p in PLANS if p["raw"].exists()],
        "periode": [annees[0], annees[-1]] if annees else None,
        "note": "Dépenses réelles mandatées (investissement), par opération et par exercice. "
                "La Ville publie la série en deux jeux coupés au changement de plan "
                "comptable (M14 jusqu'en 2017, M57 à partir de 2018) ; ils partagent la "
                "clé d'autorisation de programme et sont empilés ici. Après le dernier "
                "exercice publié, la série se poursuit via l'annexe des investissements "
                "localisés du compte administratif.",
        "operations": ops,
    }, ensure_ascii=False))
    total = sum(o["total_mandate"] for o in ops)
    par_plan = defaultdict(int)
    for r in rows:
        par_plan[r["dataset"]] += 1
    for ds, n in par_plan.items():
        print(f"  raw {ds[-28:]:<30} {n:6d} lignes retenues")
    print(f"stg: {len(rows)} lignes · mart: {len(ops)} opérations · {annees[0]}→{annees[-1]} · {total/1e9:.1f} Md€ mandatés")
    print(f"→ {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
