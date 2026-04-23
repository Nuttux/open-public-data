#!/usr/bin/env python3
"""
Pipeline complet pour Paris Budget Dashboard.

Stages:
  1. sync    — Paris Open Data API → BigQuery raw.*  (scripts/sync/sync_opendata.py)
  2. dbt     — raw.* → staging → intermediate → core → marts
               (dbt deps + dbt seed + dbt run, cwd=pipeline/)
  3. enrich  — LLM enrichment via Gemini/Claude → seeds/seed_cache_*.csv
               (scripts/enrich/run_enrichment.py — 3 sub-steps)
  4. reseed  — reload CSV caches into BigQuery + re-run dbt models that use them
  5. export  — BigQuery → website/public/data/*.json
               (scripts/export/export_all.py — 8 child exports)

Usage:
    python scripts/tools/run_pipeline.py                      # full pipeline
    python scripts/tools/run_pipeline.py --steps sync,dbt     # subset
    python scripts/tools/run_pipeline.py --skip-enrich        # use cached CSVs only
    python scripts/tools/run_pipeline.py --enrich-limit 10    # cost-controlled micro-run

Prerequisites:
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json  (or: gcloud auth application-default login)
    export GEMINI_API_KEY=...      (optional — skipped if absent)
    export ANTHROPIC_API_KEY=...   (optional — for step 3 grounded search with Claude)
"""

import argparse
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = PIPELINE_ROOT / "scripts"
DBT_DIR = PIPELINE_ROOT  # dbt_project.yml lives at pipeline/ root

ALL_STEPS = ["sync", "dbt", "test", "enrich", "reseed", "export"]


def run(cmd: list, cwd: Path = None) -> bool:
    banner = " ".join(str(c) for c in cmd)
    print(f"\n{'='*70}\n▶ {banner}\n  cwd={cwd or PIPELINE_ROOT}\n{'='*70}")
    try:
        subprocess.run(cmd, cwd=cwd or PIPELINE_ROOT, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ exit {e.returncode}")
        return False
    except FileNotFoundError as e:
        print(f"❌ not found: {e}")
        return False


def step_sync(dry_run: bool) -> bool:
    print("\n📥 STEP 1 — sync Paris Open Data → BigQuery raw.*")
    cmd = [sys.executable, str(SCRIPTS_DIR / "sync" / "sync_opendata.py")]
    if dry_run:
        cmd.append("--dry-run")
    return run(cmd)


def step_dbt(use_caches: bool) -> bool:
    print("\n🔄 STEP 2 — dbt transform")
    if not run(["dbt", "deps"], cwd=DBT_DIR):
        print("⚠️ dbt deps failed — continuing")
    if not run(["dbt", "seed"], cwd=DBT_DIR):
        return False
    cmd = ["dbt", "run"]
    if use_caches:
        cmd += ["--vars", "{use_llm_cache_ap: true, use_llm_cache_theme: true}"]
    return run(cmd, cwd=DBT_DIR)


def step_test(strict: bool) -> bool:
    """Run dbt data tests. In non-strict mode, warnings don't block."""
    print("\n🧪 STEP 2b — dbt test (data quality)")
    ok = run(["dbt", "test"], cwd=DBT_DIR)
    if not ok and not strict:
        print("⚠️ dbt test reported failures — continuing (strict=False)")
        return True
    return ok


def step_enrich(limit: int | None, dry_run: bool) -> bool:
    print("\n🤖 STEP 3 — LLM enrichment (geo AP + thématique + grounded)")
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("⚠️ GEMINI_API_KEY/GOOGLE_API_KEY absent — skip enrichment (caches used as-is)")
        return True
    cmd = [sys.executable, str(SCRIPTS_DIR / "enrich" / "run_enrichment.py")]
    if limit is not None:
        cmd += ["--limit", str(limit)]
    if dry_run:
        cmd.append("--dry-run")
    return run(cmd)


def step_reseed() -> bool:
    print("\n🔁 STEP 4 — reload caches into BQ + re-run cache-consuming models")
    if not run(["dbt", "seed"], cwd=DBT_DIR):
        return False
    return run(
        ["dbt", "run", "--select", "int_ap_projets_enrichis+ int_subventions_enrichies+",
         "--vars", "{use_llm_cache_ap: true, use_llm_cache_theme: true}"],
        cwd=DBT_DIR,
    )


def step_export() -> bool:
    print("\n📤 STEP 5 — export JSON → website/public/data/")
    return run([sys.executable, str(SCRIPTS_DIR / "export" / "export_all.py")])


def main():
    p = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter,
                                description=__doc__)
    p.add_argument("--steps", default=",".join(ALL_STEPS),
                   help=f"comma-separated subset of {ALL_STEPS}")
    p.add_argument("--dry-run", action="store_true", help="no BQ writes / no LLM calls")
    p.add_argument("--skip-enrich", action="store_true",
                   help="skip step 3 (use existing CSV caches only — reproducible path)")
    p.add_argument("--enrich-limit", type=int, default=None,
                   help="cap LLM rows per sub-step (cost control)")
    p.add_argument("--no-cache-vars", action="store_true",
                   help="do NOT pass use_llm_cache_*=true to dbt (first run from scratch)")
    p.add_argument("--strict-tests", action="store_true",
                   help="fail the pipeline on dbt test errors (default: warn but continue)")
    args = p.parse_args()

    steps = [s.strip() for s in args.steps.split(",") if s.strip()]
    if args.skip_enrich and "enrich" in steps:
        steps.remove("enrich")

    use_caches = not args.no_cache_vars

    print(f"\n🚀 PIPELINE — {datetime.now():%Y-%m-%d %H:%M}")
    print(f"  steps: {steps}")
    print(f"  dry_run: {args.dry_run} | use_caches: {use_caches} | enrich_limit: {args.enrich_limit}")

    results = {}
    if "sync" in steps:
        results["sync"] = step_sync(args.dry_run)
    if "dbt" in steps:
        results["dbt"] = step_dbt(use_caches)
    if "test" in steps:
        results["test"] = step_test(args.strict_tests)
    if "enrich" in steps:
        results["enrich"] = step_enrich(args.enrich_limit, args.dry_run)
    if "reseed" in steps:
        results["reseed"] = step_reseed()
    if "export" in steps:
        results["export"] = step_export()

    print("\n" + "="*70 + "\n📋 SUMMARY\n" + "="*70)
    ok = True
    for s, r in results.items():
        print(f"  {'✓' if r else '✗'} {s}")
        ok = ok and r
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
