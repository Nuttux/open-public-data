"""Build a CSV inventory of layer violations across the pipeline.

For each export script: list (script, BQ FROM clauses, layer, JSON outputs).
For each ingest script: list (script, JSON outputs written directly).
For each dbt model: list (model, layer, refs to non-conventional sources).
For each enrich/build script: list (script, reads, writes JSON direct?).

Output: docs/data-platform/_audit_layering_<suffix>.csv

Usage: python build_layering_audit.py [--suffix before|after]
"""
from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # repo root
EXPORT_DIR = ROOT / "pipeline" / "scripts" / "export"
INGEST_DIR = ROOT / "pipeline" / "scripts" / "sync"
TOOLS_DIR = ROOT / "pipeline" / "scripts" / "tools"
ENRICH_DIR = ROOT / "pipeline" / "scripts" / "enrich"
MODELS_DIR = ROOT / "pipeline" / "models"
OUT_DIR = ROOT / "docs" / "data-platform"

# BQ SQL FROM clauses always use backticks for fully-qualified table refs.
# Match FROM `...table_name` and capture only the last segment.
FROM_RE = re.compile(r"FROM\s+`[^`]*\.([\w]+)`", re.IGNORECASE)
# A script "writes JSON to /data/" if it both:
#  (a) constructs a path that points at website/public/data via Path/`/`
#      composition (literal `"public" / "data"` segments, or a hard-coded
#      string like `"website/public/data..."`), AND
#  (b) calls json.dump or write_text(json…).
# We deliberately do NOT match docstrings or comments — they're guidance,
# not behavior.
WRITES_PUBLIC_DATA_RE = re.compile(
    r"['\"]public['\"]\s*/\s*['\"]data['\"]"  # Path("public") / "data"
    r"|['\"]website['\"]\s*/\s*['\"]public['\"]"  # Path("website") / "public"
    r"|website/public/data/[\w/{}.\[\]_]+\.json"  # f"website/public/data/foo.json"
)
JSON_DUMP_RE = re.compile(r"json\.dump\b|write_text\s*\(\s*json\.")
JSON_PATH_RE = re.compile(r"['\"]([^'\"]*\.json)['\"]")
DBT_REF_RE = re.compile(r"ref\(['\"]([\w]+)['\"]\)")


def detect_layer(table_or_model: str) -> str:
    name = table_or_model.split(".")[-1].lower()
    for prefix, layer in [
        ("stg_", "staging"),
        ("core_", "core"),
        ("int_", "intermediate"),
        ("mart_", "mart"),
        ("seed_", "seed"),
        ("raw.", "raw"),
        ("raw_", "raw"),
    ]:
        if name.startswith(prefix):
            return layer
    if "raw" in table_or_model.lower().split("."):
        return "raw"
    return "unknown"


def violation_for_export(layer: str) -> str:
    if layer == "mart":
        return ""
    if layer in ("core", "intermediate", "raw", "staging"):
        return f"export reads {layer} (should be mart)"
    return f"export reads {layer} (unknown layer)"


def scan_exports(rows: list[dict]) -> None:
    for path in sorted(EXPORT_DIR.glob("*.py")):
        text = path.read_text(encoding="utf-8")
        bq_refs = sorted(set(FROM_RE.findall(text)))
        # Detect JSON output filenames written
        out_jsons = sorted({
            m for m in JSON_PATH_RE.findall(text)
            if "/data/" in m or m.startswith("public/")
        })
        if not bq_refs:
            continue
        for ref in bq_refs:
            layer = detect_layer(ref)
            rows.append({
                "kind": "export",
                "script": path.relative_to(ROOT).as_posix(),
                "reads": ref,
                "layer_read": layer,
                "writes": ";".join(out_jsons[:3]),
                "violation": violation_for_export(layer),
            })


def scan_ingests(rows: list[dict]) -> None:
    """Ingests should not write JSON to website/public/data.

    Detection: file mentions website/public/data path AND calls json.dump
    (or write_text(json.dumps)). The two-test approach catches the common
    `with open(p, 'w') as f: json.dump(payload, f)` pattern too.
    """
    for d in (INGEST_DIR, TOOLS_DIR):
        if not d.exists():
            continue
        for path in sorted(d.glob("*.py")):
            if path.name.startswith("_") or path.name == "run_pipeline.py":
                continue
            text = path.read_text(encoding="utf-8")
            if not (WRITES_PUBLIC_DATA_RE.search(text) and JSON_DUMP_RE.search(text)):
                continue
            # Heuristic: list any unique public/data/<…>.json paths mentioned
            paths_mentioned = sorted({
                m for m in JSON_PATH_RE.findall(text)
                if "public/data" in m
            })
            rows.append({
                "kind": "ingest",
                "script": path.relative_to(ROOT).as_posix(),
                "reads": "(external source)",
                "layer_read": "ingest",
                "writes": ";".join(paths_mentioned[:3]) or "(public/data/*.json)",
                "violation": "ingest writes JSON direct (should land in raw.* then mart→export)",
            })


def scan_enrich_builds(rows: list[dict]) -> None:
    """Enrich scripts named build_* that write JSON direct = violation."""
    if not ENRICH_DIR.exists():
        return
    for path in sorted(ENRICH_DIR.glob("build_*.py")):
        text = path.read_text(encoding="utf-8")
        # Same heuristic as ingests: writes to public/data via json.dump
        writes_public = bool(WRITES_PUBLIC_DATA_RE.search(text) and JSON_DUMP_RE.search(text))
        json_writes = sorted({
            m for m in JSON_PATH_RE.findall(text)
            if "public/data" in m
        })
        rows.append({
            "kind": "enrich_build",
            "script": path.relative_to(ROOT).as_posix(),
            "reads": "(core_* + hardcoded constants)",
            "layer_read": "core+constants",
            "writes": ";".join(json_writes[:3]) if json_writes else "(none)",
            "violation": (
                "enrich build script writes JSON direct (should be mart+export)"
                if writes_public else "enrich build script (no JSON output detected)"
            ),
        })


def scan_dbt_seed_refs(rows: list[dict]) -> None:
    """Find non-stg models that ref seeds (potential layer-skip).

    NOTE: mapping seeds (e.g. seed_mapping_*) referenced from core/int are
    flagged but classified as 'mapping' and not always a violation — it's a
    convention call. We mark them so reviewers can decide.
    """
    for path in MODELS_DIR.rglob("*.sql"):
        rel = path.relative_to(ROOT).as_posix()
        if "/staging/" in rel:
            continue
        if "/national/" in rel:
            continue  # separate sub-project, audited separately
        text = path.read_text(encoding="utf-8")
        seed_refs = DBT_REF_RE.findall(text)
        seed_refs = [r for r in seed_refs if r.startswith("seed_")]
        if not seed_refs:
            continue
        layer = detect_layer(path.stem)
        for sref in sorted(set(seed_refs)):
            is_mapping = sref.startswith(("seed_mapping_", "seed_city_", "seed_legal_", "seed_editorial_", "seed_pdf_budget_vote_", "seed_lieux_connus", "seed_match_projet_marches"))
            is_cache = "_cache_" in sref
            if is_mapping:
                violation = "(soft) mapping/parameter seed ref'd from non-stg — convention call"
            elif is_cache:
                violation = "(soft) LLM cache seed ref'd from int — convention call"
            else:
                violation = f"data-source seed ref'd from {layer} (should pass through stg)"
            rows.append({
                "kind": "dbt_seed_ref",
                "script": rel,
                "reads": sref,
                "layer_read": "seed",
                "writes": f"{path.stem} ({layer})",
                "violation": violation,
            })


def scan_dbt_layer_jumps(rows: list[dict]) -> None:
    """Detect mart that refs core directly (allowed but flagged), and any
    core that refs another core in a different domain (smell)."""
    # Skip for now — current pipeline has clean stg→core→mart with no jumps.
    pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--suffix", default="before")
    args = parser.parse_args()

    rows: list[dict] = []
    scan_exports(rows)
    scan_ingests(rows)
    scan_enrich_builds(rows)
    scan_dbt_seed_refs(rows)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"_audit_layering_{args.suffix}.csv"
    fieldnames = ["kind", "script", "reads", "layer_read", "writes", "violation"]
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    # Summary
    by_kind: dict[str, int] = {}
    hard_violations = 0
    soft_violations = 0
    for r in rows:
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
        if r["violation"]:
            if r["violation"].startswith("(soft)"):
                soft_violations += 1
            else:
                hard_violations += 1

    print(f"wrote {out.relative_to(ROOT)}")
    print(f"  rows: {len(rows)}")
    for k, v in sorted(by_kind.items()):
        print(f"    {k}: {v}")
    print(f"  hard violations: {hard_violations}")
    print(f"  soft (convention) flags: {soft_violations}")


if __name__ == "__main__":
    main()
