#!/usr/bin/env python3
"""
City-level sync orchestrator.

Reads `pipeline/configs/cities/{city_slug}.yaml` and dispatches each source
to the right sync script based on its `type`:
  - datagouv_dataset → sync_datagouv_dataset.py
  - ods_dataset       → (TODO, not in POC)
  - pdf_municipal     → (TODO, not in POC)

Usage:
    python sync_city.py marseille                           # all sources
    python sync_city.py marseille --source marseille_budget_primitif
    python sync_city.py marseille --type datagouv_dataset   # only this type
    python sync_city.py marseille --dry-run                 # plan only
    python sync_city.py --list                              # list configured cities
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import yaml

PIPELINE_ROOT = Path(__file__).parent.parent.parent
CONFIGS_DIR = PIPELINE_ROOT / "configs" / "cities"
SCRIPTS_DIR = PIPELINE_ROOT / "scripts" / "sync"

DISPATCH = {
    "datagouv_dataset": SCRIPTS_DIR / "sync_datagouv_dataset.py",
    # "ods_dataset":     SCRIPTS_DIR / "sync_ods_dataset.py",     # TODO
    # "pdf_municipal":   SCRIPTS_DIR / "sync_pdf_municipal.py",  # TODO
}


def list_cities() -> list[str]:
    if not CONFIGS_DIR.exists():
        return []
    return sorted(p.stem for p in CONFIGS_DIR.glob("*.yaml"))


def load_config(city_slug: str) -> dict:
    cfg_path = CONFIGS_DIR / f"{city_slug}.yaml"
    if not cfg_path.exists():
        raise FileNotFoundError(f"city config not found: {cfg_path}")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def filter_sources(config: dict, source_id: str | None, type_filter: str | None) -> list[dict]:
    sources = config.get("sources", [])
    if source_id:
        sources = [s for s in sources if s.get("id") == source_id]
    if type_filter:
        sources = [s for s in sources if s.get("type") == type_filter]
    return sources


def dispatch_source(city_slug: str, source: dict, dry_run: bool) -> int:
    """Run the right sync script for this source. Returns the script's exit code."""
    src_type = source.get("type")
    script = DISPATCH.get(src_type)
    if not script:
        print(f"  ⚠ no dispatcher for type '{src_type}' (source={source.get('id')}) — skipping")
        return 0
    if not script.exists():
        print(f"  ⚠ dispatcher script not found: {script} — skipping")
        return 0
    cmd = [sys.executable, str(script), "--city", city_slug, "--source", source["id"]]
    if dry_run:
        cmd.append("--dry-run")
    print(f"\n→ {' '.join(cmd)}")
    result = subprocess.run(cmd, check=False)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("city", nargs="?", help="City slug (e.g. marseille)")
    parser.add_argument("--source", help="Only sync this specific source id")
    parser.add_argument("--type", dest="type_filter", help="Only sync sources of this type (e.g. datagouv_dataset)")
    parser.add_argument("--dry-run", action="store_true", help="Plan only, don't load to BigQuery")
    parser.add_argument("--list", action="store_true", help="List configured cities and exit")
    args = parser.parse_args()

    if args.list:
        cities = list_cities()
        if not cities:
            print("(no cities configured in pipeline/configs/cities/)")
            return 0
        print("Configured cities:")
        for c in cities:
            print(f"  - {c}")
        return 0

    if not args.city:
        parser.error("city slug required (or use --list)")
        return 2

    config = load_config(args.city)
    print(f"=== City sync: {config.get('city_name', args.city)} ({args.city}) ===")
    print(f"SIREN: {config.get('siren_collectivite')}")
    print(f"Code INSEE: {config.get('code_insee')}")
    print(f"BQ raw dataset: {config.get('bq_raw_dataset', 'raw')}")

    sources = filter_sources(config, args.source, args.type_filter)
    if not sources:
        print(f"\nNo sources matched (source={args.source}, type={args.type_filter})")
        return 1

    print(f"\n{len(sources)} source(s) to process:")
    for s in sources:
        print(f"  - [{s.get('type')}] {s.get('id')}")

    failures = 0
    for s in sources:
        rc = dispatch_source(args.city, s, args.dry_run)
        if rc != 0:
            failures += 1

    print(f"\n=== Done: {len(sources) - failures} ok, {failures} failed ===")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
