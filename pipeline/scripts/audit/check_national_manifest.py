#!/usr/bin/env python3
"""
Contrôle d'un manifeste national avant l'envoi au bucket (marchés, budget,
évolution, investissements, chantiers, fonctions, taux, maires).

Compare le manifeste que l'export vient d'écrire (website/src/data/…) à la
version commitée dans le dépôt (git HEAD). Un export qui a perdu des communes ou
dont le montant total s'effondre vient d'une source en panne ou d'un modèle
cassé, pas de la réalité : on refuse d'envoyer, et la tâche échoue en disant
pourquoi.

  - communes : pas plus de MAX_LOST_SHARE de communes perdues ;
  - montant  : le total ne baisse pas de plus de MAX_TOTAL_DROP (la DECP ajoute
               des marchés, elle n'en retire presque jamais).

Usage :
    python scripts/audit/check_national_manifest.py website/src/data/communes-marches-manifest.json
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
MAX_LOST_SHARE = 0.02
MAX_TOTAL_DROP = 0.10


# Le champ qui porte l'argent, selon le manifeste : marchés et chantiers
# (montant), investissements (depenses), fonctions (total). Budget, évolution,
# taux et maires n'ont pas de somme : seul le nombre de communes est contrôlé.
MONEY_FIELDS = ("montant", "depenses", "total")


def total(manifest: dict) -> float | None:
    values = [c for c in manifest.get("communes", {}).values() if isinstance(c, dict)]
    for field in MONEY_FIELDS:
        if any(field in c for c in values):
            return sum(float(c.get(field) or 0) for c in values)
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    rel = sys.argv[1]
    new = json.loads((REPO / rel).read_text(encoding="utf-8"))
    try:
        old = json.loads(subprocess.run(["git", "-C", str(REPO), "show", f"HEAD:{rel}"], check=True, capture_output=True, text=True).stdout)
    except subprocess.CalledProcessError:
        print(f"  (pas de version commitée de {rel} : premier export, rien à comparer)")
        return 0

    n_old, n_new = len(old.get("communes", {})), len(new.get("communes", {}))
    lost = sorted(set(old.get("communes", {})) - set(new.get("communes", {})))
    t_old, t_new = total(old), total(new)
    print(f"  communes : {n_old} → {n_new} ({len(lost)} perdues, {n_new - n_old + len(lost)} nouvelles)")
    print(f"  montant  : {t_old / 1e9:.2f} → {t_new / 1e9:.2f} Md€ ({(t_new - t_old) / t_old:+.1%})" if t_old and t_new is not None else "  montant  : — (pas de somme dans ce manifeste)")

    failures = []
    if n_old and len(lost) / n_old > MAX_LOST_SHARE:
        failures.append(f"{len(lost)} communes perdues sur {n_old} (> {MAX_LOST_SHARE:.0%}), dont {', '.join(lost[:8])}")
    if t_old and t_new is not None and (t_old - t_new) / t_old > MAX_TOTAL_DROP:
        failures.append(f"montant total en baisse de {(t_old - t_new) / t_old:.0%} (> {MAX_TOTAL_DROP:.0%})")
    if failures:
        print("✗ envoi refusé :\n  " + "\n  ".join(failures))
        return 1
    print("  ✓ cohérent avec la version commitée")
    return 0


if __name__ == "__main__":
    sys.exit(main())
