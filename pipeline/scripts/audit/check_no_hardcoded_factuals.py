#!/usr/bin/env python3
"""
Garde-fou : détecte les chiffres factuels hardcodés dans le frontend hors
`@/lib/methodology`. Matérialise la règle `feedback_no_hardcoded_numbers.md`.

Règle simple : toute valeur numérique "magique" (population, seuils légaux,
ratios méthodologiques) doit passer par methodology.ts. Les seules exceptions
valides sont les constantes UI pures (PAGE_SIZE, etc.).

Usage:
    python scripts/audit/check_no_hardcoded_factuals.py

Exit 1 si un chiffre interdit est trouvé (pour CI).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Fichiers de données géométriques/SVG qui contiennent des coords ressemblant
# à des chiffres factuels mais qui n'en sont pas.
SKIP_FILES = (
    "components/fusion/paris-arrondissements.ts",
    "components/fusion/france-departements.ts",
    "components/fusion/france-communes.ts",
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
WEB_SRC = REPO_ROOT / "website" / "src"

# Valeurs interdites — regex avec word boundaries pour éviter matches dans
# coords SVG, IDs, chemins, etc. Chaque entrée = (regex, raison).
FORBIDDEN_PATTERNS = [
    (re.compile(r"\b2_?133_?111\b|\b2\s133\s111\b"),
     "Population Paris INSEE — utiliser PARIS_POPULATION from @/lib/methodology"),
    (re.compile(r"\b228_?400\b"),
     "Valeur obsolète demandes SLS (228 400) — lire depuis d.tension.paris.demandesActives"),
    (re.compile(r"\b195_?828\b"),
     "Demandes SLS Paris 2024 hardcodée — lire depuis logement_attente_paris.json"),
    (re.compile(r"\bLEVERAGE_RECETTES\s*=\s*5\.0\b"),
     "Constante méthodo stress test — utiliser LEVERAGE_RECETTES_MAX from methodology"),
    (re.compile(r"\bBORROW_RATIO\s*=\s*0\.5\b"),
     "Constante méthodo stress test — utiliser BORROW_RATIO_MAX from methodology"),
    (re.compile(r"\b(THRESHOLD|CRITICAL)(_YEARS)?\s*=\s*(12|20)\b(?!.*methodology)"),
     "Seuil désendettement — utiliser CAPACITE_DESENDETTEMENT_* from methodology"),
]

# Fichiers autorisés à contenir ces valeurs (méthodologie + i18n + tests)
ALLOWLIST_PREFIXES = (
    "lib/methodology.ts",
    "data/methodology.json",  # build-time import
    "i18n/",                    # traductions peuvent contenir du texte
)


def scan_file(path: Path, rel: str) -> list[tuple[str, int, str]]:
    if any(rel.startswith(a) for a in ALLOWLIST_PREFIXES):
        return []
    if rel in SKIP_FILES:
        return []
    violations: list[tuple[str, int, str]] = []
    try:
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            # Skip lines that are clearly SVG path data
            if line.count(",") > 8 and ("L" in line or "M" in line or "Z" in line):
                continue
            for pattern, reason in FORBIDDEN_PATTERNS:
                m = pattern.search(line)
                if m:
                    violations.append(
                        (rel, i, f"{m.group()!r}: {reason}\n    {line.strip()[:100]}")
                    )
    except UnicodeDecodeError:
        pass
    return violations


def main() -> int:
    patterns = ["*.ts", "*.tsx"]
    violations: list[tuple[str, int, str]] = []
    for pat in patterns:
        for f in WEB_SRC.rglob(pat):
            rel = str(f.relative_to(WEB_SRC))
            violations.extend(scan_file(f, rel))

    if not violations:
        print("✓ Aucun chiffre factuel hardcodé détecté.")
        return 0

    print(f"❌ {len(violations)} violation(s) de la règle zéro-hardcode :\n")
    for rel, lineno, msg in violations:
        print(f"  {rel}:{lineno}")
        print(f"    {msg}\n")
    print(
        "Règle : feedback_no_hardcoded_numbers.md\n"
        "Fix : déplacer la valeur vers pipeline/seeds/seed_*.csv + "
        "regénérer methodology.json, importer depuis @/lib/methodology."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
