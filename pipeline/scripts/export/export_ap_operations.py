#!/usr/bin/env python3
"""AP/CP : du brut au mart « opération × exercice » (dépense réelle mandatée).

Couches, dans l'ordre du fichier (mêmes règles que le warehouse — raw ne se
transforme pas, stg type et filtre, le mart seul agrège ; à migrer en modèles
dbt avec le reste de la chaîne lieux, cf. Block C) :

  RAW   pipeline/cache/ap_cp/ap_cp_raw.jsonl        (sync_ap_cp.py, verbatim)
  STG   typage des montants, année d'exercice, filtre Dépenses × Réel ×
        Investissement — aucune agrégation
  MART  rollup (autorisation_de_programme_cle × exercice) : mandaté annuel,
        libellés, directions — le grain que consomme le gather des lieux

Sortie : website/public/data/ca/ap_operations.json
  { generated_at, source: {name, url}, periode: [min, max],
    operations: [{ap_cle, ap_texte, mission_texte, direction,
                  mandate_par_annee: {"2009": 123.0, ...}, total_mandate}] }

Chaque opération est citable : URL ODS avec refine sur la clé d'AP.
NB période : ce dataset s'arrête à 2017 (fin M14 au niveau opération). La
suite de la série « dépense réelle » (2019-2024) vient de l'extraction des
annexes CA par projet, déjà en place — le trou 2018 est assumé et affiché.

Usage : python pipeline/scripts/export/export_ap_operations.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "pipeline" / "cache" / "ap_cp" / "ap_cp_raw.jsonl"
OUT = ROOT / "website" / "public" / "data" / "ca" / "ap_operations.json"
DATASET = "comptes-administratifs-autorisations-de-programmes-ap-ville-departement"


def stg_rows() -> list[dict]:
    """STG : lignes typées et filtrées, grain inchangé (1 ligne raw = 1 ligne stg)."""
    rows = []
    for line in RAW.open():
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
        })
        o["mandate_par_annee"][r["exercice"]] += r["mandate"]
        # le libellé le plus long observé est le plus informatif (troncatures)
        if len(r["ap_texte"]) > len(o["ap_texte"]):
            o["ap_texte"] = r["ap_texte"]
    out = []
    for o in ops.values():
        par_annee = {a: round(v, 2) for a, v in sorted(o["mandate_par_annee"].items()) if v}
        if not par_annee:
            continue
        out.append({
            "ap_cle": o["ap_cle"], "ap_texte": o["ap_texte"],
            "mission_texte": o["mission_texte"], "direction": o["direction"],
            "mandate_par_annee": par_annee,
            "total_mandate": round(sum(par_annee.values()), 2),
        })
    out.sort(key=lambda o: -o["total_mandate"])
    return out


def main() -> int:
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
        "periode": [annees[0], annees[-1]] if annees else None,
        "note": "Dépenses réelles mandatées (investissement), par opération et par exercice. "
                "Niveau opération publié jusqu'en 2017 ; la série se poursuit via les "
                "annexes du CA par projet (2019-2024).",
        "operations": ops,
    }, ensure_ascii=False))
    total = sum(o["total_mandate"] for o in ops)
    print(f"stg: {len(rows)} lignes · mart: {len(ops)} opérations · {annees[0]}→{annees[-1]} · {total/1e9:.1f} Md€ mandatés")
    print(f"→ {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
