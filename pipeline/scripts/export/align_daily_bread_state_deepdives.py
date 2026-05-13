#!/usr/bin/env python3
"""
Stage 1 fix — snapshot align des deepdives État (Daily Bread).

Recale `total_md_eur` (et per-item `montant_md_eur` + `share`) des deepdives
ancrés sur l'État pour qu'ils correspondent EXACTEMENT à
`state_breakdown.missions[].cp_eur` (source d'autorité PLF).

Why ?
    Avant ce fix, certains `total_md_eur` étaient des snapshots éditoriaux
    qui dérivaient du PLF (ex: 50,1 Md€ Défense vs PLF DA 60,0 Md€).
    Conséquence : le bucket État dans le calculateur €/mois affichait la bonne
    valeur (basée sur PLF), mais le DeepDive en dessous affichait la valeur
    snapshot — divergence visuelle 30 €/mois (top-level) vs 25 €/mois
    (DeepDive). De même, `defenseShareOfState` (calculé depuis `total_md_eur`)
    était décalé.

Périmètre :
    - `deepdive.defense`         → DA
    - `deepdive.education`       → EC + RA (matche bucket UI "education_recherche")
    - `deepdive.dette`           → EB
    - `deepdive.autres_ministeres` → 18 missions hors top 9 (cf. STATE_BUCKET_DEFS)

Les Sécu deepdives (sante/retraites/famille/chomage) sont intentionnellement
laissés tels quels : leurs `total_md_eur` proviennent de sources DIFFÉRENTES
des shares S1314 (CCSS, DREES, UNEDIC), avec un périmètre éditorial assumé
(ex: ONDAM ≠ CNAM total, DREES toutes pensions ≠ CNAV stricte). La
documentation `notes_fr` de chaque deepdive précise déjà ce choix de
périmètre.

Usage :
    python3 pipeline/scripts/export/align_daily_bread_state_deepdives.py

Sortie : modifie place `website/public/data/national/daily_bread.json`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
TARGET = ROOT / "website" / "public" / "data" / "national" / "daily_bread.json"


# Mapping deepdive → codes PLF (mêmes codes que STATE_BUCKET_DEFS dans
# website/src/lib/daily-bread.ts)
ALIGN_SPEC = {
    "defense": {
        "codes": ["DA"],
        "note_fr": (
            "Total recalé sur PLF Mission « Défense » (DA). Décomposition "
            "par titre conservée du seed seed_plf_defense_titres.csv "
            "(part T2/T3/T5/T6 stable, montants rescalés)."
        ),
    },
    "education": {
        # Bucket UI = "education_recherche" → EC + RA (cf. STATE_BUCKET_DEFS)
        "codes": ["EC", "RA"],
        "note_fr": (
            "Total recalé sur PLF Missions « Enseignement scolaire » (EC) "
            "+ « Recherche et enseignement supérieur » (RA), pour matcher "
            "le bucket éditorial UI « Éducation, recherche ». "
            "Décomposition par niveau conservée, montants rescalés."
        ),
    },
    "dette": {
        "codes": ["EB"],
        "note_fr": (
            "Total recalé sur PLF Mission « Engagements financiers de "
            "l'État » (EB). Décomposition (OAT/BTF/frais) conservée."
        ),
    },
    "autres_ministeres": {
        # Codes "autres" de STATE_BUCKET_DEFS (toutes les missions hors top 9 :
        # EC/RA, DA, SB, JA, SE, TB, TA/VA/RC, CB/MA/SF/AQ, EB)
        "codes": [
            "GA", "RB", "AV", "AD", "AB", "AC", "DB", "AA", "OA",
            "IA", "MB", "SA", "PB", "DC", "CA", "TR", "PC", "PR",
        ],
        "note_fr": (
            "Total recalé sur la somme PLF des 18 missions du bucket "
            "« Autres » (Agriculture, Outre-mer, Action extérieure, "
            "Économie, Anciens combattants, Santé mission étatique, etc.). "
            "Décomposition conservée, montants rescalés."
        ),
    },
}


def align_one(deepdive: dict, state_breakdown: dict, codes: list[str], note_fr: str) -> tuple[dict, dict]:
    """Returns (new_deepdive, stats)."""
    missions = {m["code"]: m for m in state_breakdown.get("missions", [])}
    plf_total_eur = sum(missions.get(c, {}).get("cp_eur") or 0 for c in codes)
    plf_total_md = plf_total_eur / 1e9
    seed_total_md = float(deepdive.get("total_md_eur") or 0)
    if seed_total_md <= 0 or plf_total_md <= 0:
        return deepdive, {"skipped": True, "reason": "zero total"}
    scale = plf_total_md / seed_total_md

    new_items = {}
    new_sum_md = 0.0
    for k, v in deepdive["items"].items():
        new_md = round(float(v["montant_md_eur"]) * scale, 2)
        new_items[k] = {**v, "montant_md_eur": new_md}
        new_sum_md += new_md
    new_sum_share = 0.0
    if new_sum_md > 0:
        for v in new_items.values():
            v["share"] = round(v["montant_md_eur"] / new_sum_md, 4)
            new_sum_share += v["share"]
    new_dd = {
        **deepdive,
        "items": new_items,
        "total_md_eur": round(new_sum_md, 1),
        "sum_share": round(new_sum_share, 4),
        "alignment_note_fr": note_fr,
        "alignment_source": (
            "PLF " + str(state_breakdown.get("year") or "")
            + " — state_breakdown.missions[" + ",".join(codes) + "].cp_eur"
        ),
        "alignment_source_url": state_breakdown.get("source_url"),
    }
    return new_dd, {
        "before_md": seed_total_md,
        "after_md": round(plf_total_md, 1),
        "scale": round(scale, 4),
    }


def main() -> int:
    if not TARGET.exists():
        print(f"FAIL: {TARGET} not found", file=sys.stderr)
        return 1
    with open(TARGET, encoding="utf-8") as f:
        db = json.load(f)
    state = db.get("state_breakdown") or {}
    if not state.get("missions"):
        print("FAIL: state_breakdown.missions missing", file=sys.stderr)
        return 1
    deepdive = db.get("deepdive") or {}
    if not deepdive:
        print("FAIL: deepdive missing", file=sys.stderr)
        return 1

    print("=" * 64)
    print("Snapshot align — État deepdives ← PLF state_breakdown.missions")
    print("=" * 64)
    for key, spec in ALIGN_SPEC.items():
        if key not in deepdive:
            print(f"  [skip] {key}: not in deepdive")
            continue
        new_dd, stats = align_one(deepdive[key], state, spec["codes"], spec["note_fr"])
        deepdive[key] = new_dd
        if stats.get("skipped"):
            print(f"  [skip] {key}: {stats.get('reason')}")
        else:
            print(
                f"  [ok]   {key:20s}"
                f"  before={stats['before_md']:7.1f} Md€"
                f"  after={stats['after_md']:7.1f} Md€"
                f"  scale={stats['scale']:.4f}"
                f"  codes={spec['codes']}"
            )

    db["deepdive"] = deepdive
    # Drop a marker so it's clear this JSON has been post-processed
    db["snapshot_align_applied"] = True

    with open(TARGET, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    size_kb = TARGET.stat().st_size / 1024
    print(f"\nWrote {TARGET.relative_to(ROOT)} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
