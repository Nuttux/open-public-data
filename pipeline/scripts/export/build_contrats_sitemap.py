#!/usr/bin/env python3
"""
Les adresses des fiches contrat des communes, en paquets pour le sitemap.

Le site déclare ses pages aux moteurs par segments de 5 000 adresses
(website/src/app/sitemap.ts). Les ~500 000 fiches contrat vivent dans les
contrats.json du bucket, une commune par fichier : les ouvrir tous à chaque
requête de sitemap est exclu. Ce script lit une fois les fichiers exportés et
écrit les segments prêts à servir :

  website/public/data/communes-marches/_sitemap/contrats-000.txt  (→ bucket)
      une adresse par ligne : /fr/city/<commune>/marche/<objet>-<id>
  website/public/data/communes-marches/_sitemap/index.json        (→ bucket)
  website/src/data/communes-marches-manifest.json                 (commité)
      clé « contrats_sitemap » : {segments, urls} — le site sait combien de
      segments annoncer sans toucher au bucket au build.

Seules les fiches solides sont déclarées : les CINQ plus gros contrats de chaque
commune dont l'objet est lisible — ceux-là mêmes que la page de la commune met
en avant et lie. Soumettre les ~480 000 fiches d'un coup, dont 111 000 sous
40 000 € ou à l'objet illisible (« Pantin- - | 2019088 | 1-Lot 8 »), ferait de
ces pages maigres la majorité des adresses du site aux yeux de Google. Les
autres fiches restent en ligne et atteignables par les liens ; les plus faibles
portent noindex (règle jumelle : website/src/lib/contrat-indexable.ts).

Ordre stable (communes puis contrats par adresse) : deux passages sur les
mêmes données donnent les mêmes fichiers, donc les mêmes numéros de segment.

Usage :
    python scripts/export/build_contrats_sitemap.py
Appelé par export_marches_national.py --all.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = PIPELINE_ROOT.parent / "website" / "public" / "data" / "communes-marches"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-marches-manifest.json"
SEGMENT_SIZE = 5000
PAR_COMMUNE = 5          # les N plus gros contrats lisibles d'une commune
MONTANT_MIN = 40_000     # sous ce montant, la fiche est noindex (règle jumelle TS)
LETTRES_MIN = 15         # un objet de moins de 15 lettres est illisible


def objet_lisible(objet: str | None) -> bool:
    """Même règle que objetLisible() dans website/src/lib/contrat-indexable.ts."""
    o = objet or ""
    if len(re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿŒœ]", "", o)) < LETTRES_MIN:
        return False
    return not re.search(r"\|\s*\d{5,}\s*\|", o)


def indexable(c: dict) -> bool:
    return float(c.get("montant") or 0) >= MONTANT_MIN and objet_lisible(c.get("objet"))


def collect_paths(root: Path = OUT_ROOT) -> list[str]:
    out: list[str] = []
    for commune_dir in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("_")):
        f = commune_dir / "contrats.json"
        if not f.exists():
            continue
        contrats = json.load(open(f, encoding="utf-8")).get("contrats", {})
        solides = sorted(
            (c for c in contrats.values() if c.get("slug") and indexable(c)),
            key=lambda c: (-float(c.get("montant") or 0), c["slug"]),
        )[:PAR_COMMUNE]
        out.extend(f"/fr/city/{commune_dir.name}/marche/{c['slug']}" for c in sorted(solides, key=lambda c: c["slug"]))
    return out


def write_segments(paths: list[str], root: Path = OUT_ROOT, manifest_file: Path = MANIFEST_FILE) -> int:
    seg_dir = root / "_sitemap"
    seg_dir.mkdir(parents=True, exist_ok=True)
    for old in seg_dir.glob("contrats-*.txt"):
        old.unlink()
    n_seg = (len(paths) + SEGMENT_SIZE - 1) // SEGMENT_SIZE
    for k in range(n_seg):
        (seg_dir / f"contrats-{k:03d}.txt").write_text("\n".join(paths[k * SEGMENT_SIZE:(k + 1) * SEGMENT_SIZE]) + "\n", encoding="utf-8")
    summary = {"segments": n_seg, "urls": len(paths), "segment_size": SEGMENT_SIZE,
               "regle": f"{PAR_COMMUNE} plus gros contrats par commune, objet lisible, >= {MONTANT_MIN} EUR",
               "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    json.dump(summary, open(seg_dir / "index.json", "w", encoding="utf-8"))
    if manifest_file.exists():
        manifest = json.load(open(manifest_file, encoding="utf-8"))
        manifest["contrats_sitemap"] = {"segments": n_seg, "urls": len(paths)}
        json.dump(manifest, open(manifest_file, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return n_seg


def main() -> int:
    if not OUT_ROOT.exists():
        print(f"✗ {OUT_ROOT} absent : lancer export_marches_national.py --all d'abord")
        return 1
    paths = collect_paths()
    n_seg = write_segments(paths)
    print(f"  ✓ sitemap des contrats : {len(paths)} adresses en {n_seg} segments → {OUT_ROOT / '_sitemap'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
