#!/usr/bin/env python3
"""Audit gate enforcing the data-platform layering convention.

See docs/data-platform/04-layering-convention.md for the rules.

Checks:
  E1. Every dbt `core_*` model refs only `stg_*`, `core_*`, or whitelisted seeds.
  E2. Every dbt `int_*` model refs `core_*` (+ Category C seeds).
  E3. Every dbt `mart_*` model refs `core_*` or `int_*` (+ allowed mapping seeds).
  E4. Every `pipeline/scripts/export/*.py` reads only from `mart_*` (or `int_*`
      if explicitly whitelisted) — no `FROM core_…` or `FROM stg_…`.
  E5. No `pipeline/scripts/sync/*.py`, `pipeline/scripts/tools/*.py` or
      `pipeline/scripts/enrich/*.py` writes JSON under `website/public/data/`,
      except per the whitelist.

Usage:
    python pipeline/scripts/audit/check_layering.py [--strict]

Exit codes:
    0 — clean
    1 — at least one violation
    2 — invalid invocation / config error
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import yaml
except ImportError:
    print("error: PyYAML required (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

# Issue #8 — détection AST des writes vers public/data (remplace regex).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _ast_writes_detector import detect as ast_detect_writes  # noqa: E402


ROOT = Path(__file__).resolve().parents[3]
WHITELIST_PATH = Path(__file__).resolve().parent / "layering_whitelist.yml"

EXPORT_DIR = ROOT / "pipeline" / "scripts" / "export"
SYNC_DIR = ROOT / "pipeline" / "scripts" / "sync"
TOOLS_DIR = ROOT / "pipeline" / "scripts" / "tools"
ENRICH_DIR = ROOT / "pipeline" / "scripts" / "enrich"
MODELS_DIR = ROOT / "pipeline" / "models"

DBT_REF_RE = re.compile(r"\{\{\s*ref\s*\(\s*['\"]([\w]+)['\"]\s*\)\s*\}\}")
FROM_RE = re.compile(r"FROM\s+`[^`]*\.([\w]+)`", re.IGNORECASE)

# Variable assignment that builds a path under public/data (any subdir).
# Captures the variable name (snake_case OR UPPER_CASE — local or module-level).
PATH_ASSIGN_RE = re.compile(
    r"^\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*[^\n]*?"
    r"(?:['\"]public['\"]\s*/\s*['\"]data['\"]"
    r"|['\"]website['\"]\s*/\s*['\"]public['\"]"
    r"|['\"]website/public/data[^'\"]*['\"])",
    re.MULTILINE,
)
# A target path is "enrichment-only" if its construction explicitly includes
# the "enrichment" segment.
ENRICHMENT_HINT_RE = re.compile(r"['\"]enrichment['\"]")


def detect_layer(name: str) -> str:
    name = name.lower()
    for prefix, layer in [
        ("stg_", "stg"),
        ("core_", "core"),
        ("int_", "int"),
        ("mart_", "mart"),
        ("seed_", "seed"),
    ]:
        if name.startswith(prefix):
            return layer
    return "unknown"


class Auditor:
    def __init__(self, whitelist: dict, strict: bool = False):
        self.whitelist = whitelist
        self.strict = strict
        self.violations: list[dict] = []
        self.warnings: list[dict] = []

        self.allowed_mapping_seeds = set(whitelist.get("mapping_seeds_allowed_outside_stg", []))
        self.allowed_cache_seeds = set(whitelist.get("llm_cache_seeds_allowed_in_int", []))
        self.wip_scripts = {Path(p).as_posix() for p in whitelist.get("wip_not_yet_consumed", [])}

        # Build {script_relpath: justification} maps for E and D.
        self.cat_e: dict[str, dict] = {}
        for entry in whitelist.get("enrich_writes_to_enrichment", []):
            self.cat_e[entry["script"]] = entry
        self.cat_d: dict[str, dict] = {}
        for entry in whitelist.get("ingest_writes_to_data", []):
            self.cat_d[entry["script"]] = entry

    def fail(self, **kwargs) -> None:
        self.violations.append(kwargs)

    def warn(self, **kwargs) -> None:
        self.warnings.append(kwargs)

    # ─── E1-E3: dbt model ref discipline ──────────────────────────────────────

    def check_dbt_models(self) -> None:
        for path in MODELS_DIR.rglob("*.sql"):
            rel = path.relative_to(ROOT).as_posix()
            if "/national/" in rel:
                # National sub-project disabled; audit it separately when re-enabled.
                continue
            text = path.read_text(encoding="utf-8")
            refs = DBT_REF_RE.findall(text)
            model_layer = detect_layer(path.stem)

            for ref in refs:
                ref_layer = detect_layer(ref)
                if model_layer == "core":
                    if ref_layer == "seed" and ref not in self.allowed_mapping_seeds:
                        self.fail(
                            rule="E1",
                            file=rel,
                            detail=f"core model refs data-source seed `{ref}` (must wrap in stg)",
                        )
                    elif ref_layer not in {"stg", "core", "int", "seed"}:
                        # core ← int allowed: project convention where int_* does
                        # cross-cutting enrichment (joins seeds + LLM caches) and
                        # core_* is the canonical OBT exposing that enrichment.
                        self.fail(
                            rule="E1",
                            file=rel,
                            detail=f"core model refs `{ref}` ({ref_layer}) — only stg/core/int/seed-mapping allowed",
                        )
                elif model_layer == "int":
                    if ref_layer == "seed" and ref not in self.allowed_mapping_seeds and ref not in self.allowed_cache_seeds:
                        self.fail(
                            rule="E2",
                            file=rel,
                            detail=f"int model refs un-whitelisted seed `{ref}`",
                        )
                    elif ref_layer not in {"stg", "core", "int", "seed"}:
                        self.fail(
                            rule="E2",
                            file=rel,
                            detail=f"int model refs `{ref}` ({ref_layer})",
                        )
                elif model_layer == "mart":
                    if ref_layer == "seed" and ref not in self.allowed_mapping_seeds:
                        self.fail(
                            rule="E3",
                            file=rel,
                            detail=f"mart model refs un-whitelisted seed `{ref}`",
                        )
                    elif ref_layer not in {"core", "int", "mart", "seed"}:
                        self.fail(
                            rule="E3",
                            file=rel,
                            detail=f"mart model refs `{ref}` ({ref_layer}) — only core/int/mart allowed",
                        )

    # ─── E4: export scripts must read mart ────────────────────────────────────

    def check_exports(self) -> None:
        if not EXPORT_DIR.exists():
            return
        for path in sorted(EXPORT_DIR.glob("*.py")):
            rel = path.relative_to(ROOT).as_posix()
            text = path.read_text(encoding="utf-8")
            tables = sorted(set(FROM_RE.findall(text)))
            for tbl in tables:
                layer = detect_layer(tbl)
                if layer in {"core", "stg", "raw"}:
                    self.fail(
                        rule="E4",
                        file=rel,
                        detail=f"export reads `{tbl}` ({layer}) — must go through mart",
                    )
                elif layer == "int":
                    # int reads from export are allowed only on case-by-case
                    # basis; warn so a reviewer can audit. Today we have none.
                    self.warn(
                        rule="E4-int",
                        file=rel,
                        detail=f"export reads `{tbl}` (int) — consider promoting to mart",
                    )

    # ─── E5: no ingest/enrich/tools writes to public/data outside whitelist ───

    def _writes_to_public_data(self, text: str) -> dict:
        """Determine if a script writes JSON to public/data.

        Returns dict with keys: writes_metric, writes_enrichment, suspicious.

        Issue #8 : remplacé par AST detection (cf. _ast_writes_detector.py).
        Le regex précédent ne suivait pas l'indirection de variables (ex. lambda
        capturant un path). L'AST suit la closure transitif des variables et
        signale les écritures via .write_text(), open(...,"w") + json.dump,
        ou save_json(...).
        """
        result = ast_detect_writes(text)
        return {
            "writes_metric": result.writes_metric,
            "writes_enrichment": result.writes_enrichment,
            "suspicious": result.suspicious_indirection,
        }

    def check_writes_public_data(self) -> None:
        for d in (SYNC_DIR, TOOLS_DIR, ENRICH_DIR):
            if not d.exists():
                continue
            for path in sorted(d.glob("*.py")):
                rel = path.relative_to(ROOT).as_posix()
                if path.name == "run_pipeline.py" or path.name == "run_enrichment.py":
                    continue
                if path.name.startswith("_"):
                    continue
                text = path.read_text(encoding="utf-8")
                w = self._writes_to_public_data(text)
                if not (w["writes_metric"] or w["writes_enrichment"]):
                    if w.get("suspicious"):
                        self.warn(rule="E5-suspicious", file=rel,
                                  detail="indirection inanalysable par AST — review manuelle requise")
                    continue

                if rel in self.wip_scripts:
                    self.warn(rule="E5-wip", file=rel,
                              detail="WIP script (Category W) — must comply before being wired into UI")
                    continue
                if rel in self.cat_e:
                    if w["writes_metric"]:
                        self.fail(rule="E5-cat-E-misuse", file=rel,
                                  detail="Category E script writes to public/data/ outside enrichment/")
                    continue
                if rel in self.cat_d:
                    self.warn(rule="E5-cat-D", file=rel,
                              detail=f"Documented bypass — TODO: {self.cat_d[rel].get('todo','none')}")
                    continue
                if w["writes_metric"]:
                    self.fail(rule="E5", file=rel,
                              detail="writes JSON to website/public/data/ — add to whitelist with justification or refactor through mart")
                elif w["writes_enrichment"]:
                    self.fail(rule="E5", file=rel,
                              detail="writes JSON to public/data/enrichment/ — add to Category E whitelist")

    # ─── Reporting ────────────────────────────────────────────────────────────

    def report(self) -> int:
        if self.violations:
            print(f"❌ {len(self.violations)} layering violation(s)")
            by_rule = defaultdict(list)
            for v in self.violations:
                by_rule[v["rule"]].append(v)
            for rule in sorted(by_rule):
                print(f"\n  Rule {rule}:")
                for v in by_rule[rule]:
                    print(f"    - {v['file']}: {v['detail']}")
        if self.warnings:
            print(f"\n⚠️  {len(self.warnings)} warning(s)")
            by_rule = defaultdict(list)
            for v in self.warnings:
                by_rule[v["rule"]].append(v)
            for rule in sorted(by_rule):
                print(f"\n  {rule}:")
                for v in by_rule[rule][:8]:
                    print(f"    - {v['file']}: {v['detail']}")
                if len(by_rule[rule]) > 8:
                    print(f"    ... and {len(by_rule[rule]) - 8} more")
        if not self.violations and not self.warnings:
            print("✅ layering audit clean")
        elif not self.violations:
            print("\n✅ layering audit clean (warnings only)")
        if self.strict and self.warnings:
            return 1
        return 1 if self.violations else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    args = parser.parse_args()

    if not WHITELIST_PATH.exists():
        print(f"error: whitelist not found at {WHITELIST_PATH}", file=sys.stderr)
        return 2

    whitelist = yaml.safe_load(WHITELIST_PATH.read_text(encoding="utf-8")) or {}
    auditor = Auditor(whitelist, strict=args.strict)
    auditor.check_dbt_models()
    auditor.check_exports()
    auditor.check_writes_public_data()
    return auditor.report()


if __name__ == "__main__":
    sys.exit(main())
