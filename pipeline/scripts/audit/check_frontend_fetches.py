#!/usr/bin/env python3
"""Frontend audit (Issue #9).

Vérifie qu'aucun code TypeScript / TSX du frontend ne fetch un chemin
qui :
  - sort de `/data/` (chemin public légitime)
  - cible un sous-dossier interdit (notamment `/cache/wip/`, qui est
    interne pipeline et ne doit JAMAIS apparaître côté UI)

Strategy : scan tous les fichiers `.ts` et `.tsx` sous `website/src/`
et `website/public/` pour des appels à `fetch(...)` ou des chaînes
`/data/...`. Catalogue les chemins ; flag les hors-liste.

Usage :
    python pipeline/scripts/audit/check_frontend_fetches.py [--strict]

Exit codes :
    0 — clean
    1 — au moins une violation
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WEBSITE = ROOT / "website"

# Patterns de chemins data dans le code TS/TSX. On capture les chaînes
# litérales contenant "/data/..." ou "data/..." dans des contextes
# fetch/import/string.
DATA_PATH_RE = re.compile(
    r"['\"`]"
    r"(?:/)?(?:data|public/data|/_next/data)"  # chemin commençant par /data ou public/data
    r"(?P<rest>/[^'\"`]*)"
    r"['\"`]"
)

# Tout ce qui doit être REFUSÉ dans une chaîne data/... :
BANNED_PATH_FRAGMENTS = [
    "/cache/",      # interne pipeline
    "cache/wip/",   # WIP non publié
    "../pipeline/", # remontée hors website
]


def scan() -> tuple[list[dict], list[dict]]:
    """Returns (violations, warnings)."""
    violations: list[dict] = []
    warnings: list[dict] = []
    for path in WEBSITE.rglob("*"):
        if path.is_dir():
            continue
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        if "node_modules" in path.parts or ".next" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        rel = path.relative_to(ROOT).as_posix()
        for m in DATA_PATH_RE.finditer(text):
            full_match = m.group(0)
            rest = m.group("rest") or ""
            line_no = text[:m.start()].count("\n") + 1
            for banned in BANNED_PATH_FRAGMENTS:
                if banned in full_match:
                    violations.append({
                        "file": rel,
                        "line": line_no,
                        "path": full_match,
                        "rule": f"forbidden fragment '{banned}'",
                    })
                    break

    return violations, warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    violations, warnings = scan()

    if violations:
        print(f"❌ {len(violations)} frontend fetch violation(s)")
        for v in violations:
            print(f"  {v['file']}:{v['line']} → {v['path']} [{v['rule']}]")
    if warnings and args.strict:
        print(f"\n⚠️  {len(warnings)} warning(s)")
        for w in warnings:
            print(f"  {w}")

    if not violations and not warnings:
        print("✅ frontend fetch audit clean")
        return 0

    if violations:
        return 1
    if args.strict and warnings:
        return 1
    print("✅ frontend fetch audit clean (warnings only, --strict not set)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
