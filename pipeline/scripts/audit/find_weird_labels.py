#!/usr/bin/env python3
"""
Scan all JSON files in website/public/data/ and extract labels that look
"weird" for non-experts : abréviations (°, cpt, intervent°), all-caps codes,
acronyms technocrates, etc.

Output : a sorted list with frequency, so we know what to prioritize in the
friendly-label mapping.

Usage :
    python pipeline/scripts/audit/find_weird_labels.py [--limit N]
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"

# Patterns that indicate technocratic label
WEIRD_PATTERNS = [
    re.compile(r"°"),                             # "Subvent°"
    re.compile(r"\b(cpt|prop|interv\.|intervent\.|Const|Install|Rémunérat°|Personnel|Subvent)\b"),
    re.compile(r"\.\s+[a-z]"),                    # mid-word abreviation followed by lowercase
    re.compile(r"\b[A-Z]{4,}\b"),                  # acronymes >=4 lettres
    re.compile(r"\b(allou|prélèv\.|cumulé|particip\.|Revers\.|équipement)\b", re.IGNORECASE),
]

# Keys (in nested JSON) where labels can hide
LABEL_KEYS = {"name", "label", "libelle", "nature", "fonction", "categorie", "chapitre", "categorie_libelle", "nature_libelle"}


def is_weird(label: str) -> bool:
    """Heuristic: matches at least one weird pattern."""
    if not label or not isinstance(label, str):
        return False
    if len(label) < 4:
        return False
    return any(p.search(label) for p in WEIRD_PATTERNS)


def walk(obj, source: str, counter: Counter, sources: dict[str, set]) -> None:
    """Recursively collect candidate labels from JSON."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in LABEL_KEYS and isinstance(v, str) and is_weird(v):
                counter[v] += 1
                sources.setdefault(v, set()).add(source)
            walk(v, source, counter, sources)
    elif isinstance(obj, list):
        for item in obj:
            walk(item, source, counter, sources)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=80, help="Number of top labels to show")
    args = parser.parse_args()

    counter: Counter[str] = Counter()
    sources: dict[str, set] = {}

    json_files = sorted(DATA_DIR.glob("*.json"))
    print(f"Scanning {len(json_files)} JSON files in {DATA_DIR.relative_to(REPO_ROOT)}")
    for path in json_files:
        try:
            with path.open() as f:
                data = json.load(f)
        except json.JSONDecodeError:
            continue
        walk(data, path.name, counter, sources)

    print(f"\nFound {len(counter)} unique weird labels.")
    print(f"\nTop {args.limit} by frequency :")
    for label, n in counter.most_common(args.limit):
        srcs = sources[label]
        n_sources = len(srcs)
        src_hint = next(iter(srcs))
        print(f"  ({n:4d}× in {n_sources:2d} files, e.g. {src_hint})  {label!r}")


if __name__ == "__main__":
    main()
