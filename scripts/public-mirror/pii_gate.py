#!/usr/bin/env python3
"""
Contrôle « personnes physiques » avant toute publication du miroir public.

Un push public ne se rattrape pas : même effacé ensuite, un blob reste
récupérable sur GitHub. Ce contrôle tourne donc AVANT le push, dans le workflow
(sync-public-pipeline.yml, sur l'arbre filtré) et dans le script manuel
(sync-public.sh, sur le dossier de destination). Il refuse la publication si :

  1. un chemin interdit est présent — des fichiers qui listent des bénéficiaires
     ou des titulaires un par un, dont des particuliers (DENY) ;
  2. un fichier de données porte des lignes étiquetées « personne physique »
     (ROW_MARKERS) — la forme qu'a prise la fuite trouvée le 2026-09-13 :
     « "nature_juridique": "Personnes physiques" » dans des extraits bruts de
     subventions, 25 000 lignes nominatives.

  Avec --history, il vérifie aussi qu'aucun chemin interdit ne subsiste dans
  l'historique git du dossier (après git filter-repo).

Les libellés comptables (« Créances/particuliers », « collectivités à statut
particulier ») ne déclenchent rien : seules les étiquettes de ligne comptent.

Usage :
    python scripts/public-mirror/pii_gate.py <dossier> [--history]
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

# Tout chemin contenant l'un de ces fragments est refusé.
DENY = (
    "pipeline/raw_extracts/",
    "pipeline/cache/",
    "seed_cache_siret_by_name",
    "seed_cache_thematique_beneficiaires",
    "seed_marseille_cache_thematique",
)

# Une étiquette de LIGNE : la valeur d'un champ, pas un mot dans un libellé.
ROW_MARKERS = re.compile(
    r"""["']?(?:nature_juridique|categorie_juridique|type_beneficiaire|categorie)["']?\s*[:,]\s*["']?personnes?\s+physiques?["']?"""
    r"""|nom\s+de\s+personnes?\s+physiques?"""
    r"""|["']personne_physique["']\s*:\s*true""",
    re.IGNORECASE,
)
DATA_SUFFIXES = (".json", ".jsonl", ".csv", ".tsv", ".ndjson")
MAX_MARKERS = 3


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    root = Path(args[0]).resolve()
    failures: list[str] = []

    for p in root.rglob("*"):
        if not p.is_file() or ".git" in p.parts:
            continue
        rel = p.relative_to(root).as_posix()
        if any(d in rel for d in DENY):
            failures.append(f"chemin interdit : {rel}")
            continue
        if p.suffix.lower() in DATA_SUFFIXES:
            n = len(ROW_MARKERS.findall(p.read_text(encoding="utf-8", errors="ignore")))
            if n > MAX_MARKERS:
                failures.append(f"{n} lignes étiquetées personne physique : {rel}")

    if "--history" in sys.argv:
        out = subprocess.run(["git", "-C", str(root), "log", "--all", "--name-only", "--format="], capture_output=True, text=True).stdout
        for path in sorted({l for l in out.splitlines() if l and any(d in l for d in DENY)}):
            failures.append(f"chemin interdit dans l'historique : {path}")

    if failures:
        print(f"✗ PUBLICATION REFUSÉE — {len(failures)} problème(s) de données personnelles :")
        for f in failures[:40]:
            print(f"  {f}")
        return 1
    print("✓ aucune donnée de personne physique repérée")
    return 0


if __name__ == "__main__":
    sys.exit(main())
