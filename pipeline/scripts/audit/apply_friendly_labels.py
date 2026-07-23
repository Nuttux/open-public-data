#!/usr/bin/env python3
"""
Applique seed_label_friendly.csv aux JSON de website/public/data/ :
remplace les libellés techno-comptables ("Charges intervent° cpt prop.")
par leur version grand-public ("Charges d'intervention").

Stratégie :
- Pour les `name` au format "Catégorie: Nature comptable" → on remplace
  uniquement la partie après le ":" (la nature). Le préfixe section est
  conservé tel quel.
- Pour les autres champs label/libelle/nature/fonction → remplacement direct.
- Le libellé technique original est conservé dans un champ `name_original`
  pour le tooltip ou export méthode.

Usage :
    python pipeline/scripts/audit/apply_friendly_labels.py
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_label_friendly.csv"

# Champs où l'on cherche/remplace
LABEL_KEYS = {"name", "label", "libelle", "nature", "fonction", "categorie", "categorie_libelle", "nature_libelle"}


def load_mapping() -> dict[str, str]:
    if not SEED_PATH.exists():
        print(f"⚠ {SEED_PATH} missing")
        return {}
    m: dict[str, str] = {}
    with SEED_PATH.open() as f:
        for row in csv.DictReader(f):
            technical = row.get("technical", "")
            friendly = row.get("friendly", "")
            # Skip comment lines (rows where "technical" starts with "#")
            if not technical or technical.startswith("#") or not friendly:
                continue
            m[technical] = friendly
    return m


def rewrite_label(value: str, mapping: dict[str, str], stats: Counter) -> tuple[str, bool]:
    """Returns (new_value, was_changed)."""
    if not isinstance(value, str):
        return value, False
    # 1. exact match
    if value in mapping:
        stats[value] += 1
        return mapping[value], True
    # 2. "Category: Nature" pattern → only rewrite the nature
    if ": " in value:
        prefix, _, suffix = value.partition(": ")
        if suffix in mapping:
            stats[suffix] += 1
            return f"{prefix}: {mapping[suffix]}", True
    return value, False


def walk(obj, mapping: dict[str, str], stats: Counter):
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if k in LABEL_KEYS and isinstance(v, str):
                new_v, changed = rewrite_label(v, mapping, stats)
                if changed:
                    obj.setdefault(f"{k}_original", v)
                    obj[k] = new_v
            walk(v, mapping, stats)
    elif isinstance(obj, list):
        for item in obj:
            walk(item, mapping, stats)


def process_file(path: Path, mapping: dict[str, str]) -> int:
    with path.open() as f:
        data = json.load(f)
    stats: Counter = Counter()
    walk(data, mapping, stats)
    total = sum(stats.values())
    if total > 0:
        with path.open("w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return total


# Drift guard. The friendly seed keys on the technical LABEL string, so when the
# Ville renames a nature (M57 wording drifts), the match silently stops firing
# and budget lines quietly revert to raw jargon. This floor turns that SILENT
# decay into a LOUD build failure. Current coverage of shown budget € is ~20%;
# the floor sits below that with margin, so a real collapse (seed fully missing
# the data) trips it but normal year-to-year wobble does not. Raise the floor
# once the labels are re-keyed on nature_code + the editorial pass lands.
FRIENDLY_COVERAGE_FLOOR = 0.12


def budget_label_coverage() -> dict[str, float]:
    """Share of shown budget-sankey € carrying a friendly (rewritten) label,
    per file. name_original is set only when a rewrite happened."""
    cov: dict[str, float] = {}
    for path in sorted(DATA_DIR.glob("budget_sankey_*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        total = 0.0
        friendly = 0.0
        for parts in (data.get("bySection") or {}).values():
            for body in parts.values():
                for it in (body.get("items") or []):
                    v = it.get("value", 0) or 0
                    total += v
                    if it.get("name_original") and it.get("name") != it.get("name_original"):
                        friendly += v
        if total > 0:
            cov[path.name] = friendly / total
    return cov


def main():
    mapping = load_mapping()
    print(f"Loaded mapping: {len(mapping)} entries")
    for path in sorted(DATA_DIR.glob("*.json")):
        try:
            n = process_file(path, mapping)
        except json.JSONDecodeError:
            continue
        if n > 0:
            print(f"  {path.name}: {n} labels rewritten")

    # Drift guard — fail loudly if the budget label mapping has decayed.
    below = {f: c for f, c in budget_label_coverage().items() if c < FRIENDLY_COVERAGE_FLOOR}
    if below:
        print(
            f"\n✗ friendly-label coverage below floor ({FRIENDLY_COVERAGE_FLOOR:.0%}) — "
            f"the label seed has likely drifted from the source wording:",
            file=sys.stderr,
        )
        for f, c in sorted(below.items()):
            print(f"    {f}: {c:.1%}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
