#!/usr/bin/env python3
"""
Calibration des confidence scores LLM.

Le problème : `ode_confiance` dans seed_cache_thematique_beneficiaires et
seed_cache_geo_ap est *auto-déclaré* par le LLM (Claude). Un score 0.8 du
LLM ne garantit pas 80% de précision réelle — c'est juste son ressenti.

La calibration consiste à :
1. Prélever un échantillon stratifié par bucket de confiance (./output/...sample.csv)
2. Faire annoter manuellement par un humain (colonne `human_verdict` = correct/wrong/uncertain)
3. Calculer la précision réelle par bucket et la publier (data_quality_calibration.json)

Le résultat est exposé sur /methode pour transparence : « le LLM s'auto-évalue
à X mais on a mesuré Y sur un échantillon de N annotations humaines ».

Usage :
    # Phase 1 — créer l'échantillon à annoter
    python pipeline/scripts/audit/calibrate_llm_confidence.py sample \
        --cache thematique --n 60

    # Phase 2 — après remplissage manuel du CSV
    python pipeline/scripts/audit/calibrate_llm_confidence.py compute \
        --cache thematique
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

CACHES = {
    "thematique": {
        "seed": REPO / "pipeline" / "seeds" / "seed_cache_thematique_beneficiaires.csv",
        "key_col": "beneficiaire_normalise",
        "pred_cols": ["ode_thematique", "ode_sous_categorie"],
        "confidence_col": "ode_confiance",
        "context_help": "Vérifier que la thématique attribuée correspond au domaine d'activité réel du bénéficiaire. Aide : nom du bénéficiaire seul peut suffire pour les associations connues ; sinon recherche web rapide. 'uncertain' OK si nom trop ambigu.",
    },
    "geo": {
        "seed": REPO / "pipeline" / "seeds" / "seed_cache_geo_ap.csv",
        "key_col": "ap_code",
        "pred_cols": ["ode_arrondissement", "ode_nom_lieu", "ode_adresse"],
        "confidence_col": "ode_confiance",
        "context_help": "Vérifier que l'arrondissement et le lieu identifiés sont cohérents avec le code AP / la description du projet. Aide : lookup BAN ou paris.fr si doute.",
    },
}

OUTPUT_DIR = REPO / "pipeline" / "scripts" / "audit" / "calibration_samples"
RESULT_PATH = REPO / "website" / "public" / "data" / "data_quality_calibration.json"


def bucket_of(confidence: float) -> str:
    if confidence is None:
        return "unknown"
    if confidence >= 0.9:
        return "high (≥0.9)"
    if confidence >= 0.7:
        return "medium (0.7-0.9)"
    if confidence >= 0.5:
        return "low (0.5-0.7)"
    return "very_low (<0.5)"


def cmd_sample(args: argparse.Namespace) -> int:
    spec = CACHES[args.cache]
    rows = list(csv.DictReader(spec["seed"].open(encoding="utf-8")))
    by_bucket: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        try:
            conf = float(r.get(spec["confidence_col"]) or 0)
        except ValueError:
            conf = 0.0
        by_bucket[bucket_of(conf)].append(r)

    # Stratified : ~n/4 par bucket, ou tout le bucket s'il en a moins.
    per_bucket = max(1, args.n // 4)
    random.seed(args.seed)
    sample: list[dict] = []
    for bucket, items in sorted(by_bucket.items()):
        picked = random.sample(items, min(per_bucket, len(items)))
        for it in picked:
            sample.append({
                "_bucket": bucket,
                "_key": it.get(spec["key_col"], ""),
                **{c: it.get(c, "") for c in spec["pred_cols"]},
                "_llm_confidence": it.get(spec["confidence_col"], ""),
                "human_verdict": "",
                "human_note": "",
            })

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / f"{args.cache}_sample.csv"
    fieldnames = ["_bucket", "_key", *spec["pred_cols"], "_llm_confidence", "human_verdict", "human_note"]
    with out.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sample)

    print(f"✓ Échantillon écrit : {out} ({len(sample)} lignes)")
    print()
    print("Annotation :")
    print(f"  - Remplir la colonne `human_verdict` avec : correct | wrong | uncertain")
    print(f"  - Aide : {spec['context_help']}")
    print(f"  - Puis : python {Path(__file__).name} compute --cache {args.cache}")
    return 0


def cmd_compute(args: argparse.Namespace) -> int:
    spec = CACHES[args.cache]
    sample_path = OUTPUT_DIR / f"{args.cache}_sample.csv"
    if not sample_path.exists():
        print(f"✗ Pas d'échantillon à {sample_path}. Lance `sample` d'abord.", file=sys.stderr)
        return 1

    rows = list(csv.DictReader(sample_path.open(encoding="utf-8")))
    annotated = [r for r in rows if r["human_verdict"].strip()]
    if not annotated:
        print(f"✗ Aucune ligne annotée dans {sample_path}.", file=sys.stderr)
        return 1

    per_bucket: dict[str, dict] = defaultdict(lambda: {"n": 0, "correct": 0, "wrong": 0, "uncertain": 0})
    overall = {"n": 0, "correct": 0, "wrong": 0, "uncertain": 0}
    for r in annotated:
        v = r["human_verdict"].strip().lower()
        if v not in ("correct", "wrong", "uncertain"):
            continue
        bucket = r["_bucket"]
        per_bucket[bucket]["n"] += 1
        per_bucket[bucket][v] += 1
        overall["n"] += 1
        overall[v] += 1

    def precision(d: dict) -> float | None:
        decided = d["correct"] + d["wrong"]
        return round(d["correct"] / decided * 100, 1) if decided else None

    buckets = []
    for b, d in sorted(per_bucket.items()):
        buckets.append({
            "bucket": b,
            "annotations_n": d["n"],
            "correct": d["correct"],
            "wrong": d["wrong"],
            "uncertain": d["uncertain"],
            "measured_precision_pct": precision(d),
        })

    existing = {}
    if RESULT_PATH.exists():
        existing = json.loads(RESULT_PATH.read_text())
    payload = existing if existing else {"schema_version": 1, "caches": {}}
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    payload["caches"][args.cache] = {
        "label": args.cache,
        "seed": str(spec["seed"].relative_to(REPO)),
        "total_rows_in_cache": sum(1 for _ in spec["seed"].open(encoding="utf-8")) - 1,
        "annotations_n": overall["n"],
        "measured_precision_pct_overall": precision(overall),
        "buckets": buckets,
        "notes": "Précision mesurée = correct / (correct + wrong). 'uncertain' exclu du dénominateur car non-tranchable.",
    }

    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    print(f"✓ Calibration écrite : {RESULT_PATH}")
    print()
    print(f"Cache {args.cache} : {overall['n']} annotations, précision globale {precision(overall)}%")
    for b in buckets:
        print(f"  {b['bucket']:<22} n={b['annotations_n']:>3}  correct={b['correct']:>3}  wrong={b['wrong']:>3}  uncertain={b['uncertain']:>3}  precision={b['measured_precision_pct']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_sample = sub.add_parser("sample", help="Créer un échantillon stratifié à annoter")
    p_sample.add_argument("--cache", choices=CACHES.keys(), required=True)
    p_sample.add_argument("--n", type=int, default=60, help="Taille de l'échantillon (réparti par bucket)")
    p_sample.add_argument("--seed", type=int, default=42, help="Random seed (pour reproductibilité)")
    p_sample.set_defaults(func=cmd_sample)

    p_compute = sub.add_parser("compute", help="Calculer la précision mesurée depuis l'échantillon annoté")
    p_compute.add_argument("--cache", choices=CACHES.keys(), required=True)
    p_compute.set_defaults(func=cmd_compute)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
