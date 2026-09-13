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

Ordre stable (communes puis contrats par adresse) : deux passages sur les
mêmes données donnent les mêmes fichiers, donc les mêmes numéros de segment.

Usage :
    python scripts/export/build_contrats_sitemap.py
Appelé par export_marches_national.py --all.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = PIPELINE_ROOT.parent / "website" / "public" / "data" / "communes-marches"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-marches-manifest.json"
SEGMENT_SIZE = 5000


def collect_paths(root: Path = OUT_ROOT) -> list[str]:
    out: list[str] = []
    for commune_dir in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("_")):
        f = commune_dir / "contrats.json"
        if not f.exists():
            continue
        contrats = json.load(open(f, encoding="utf-8")).get("contrats", {})
        out.extend(f"/fr/city/{commune_dir.name}/marche/{c['slug']}" for c in sorted(contrats.values(), key=lambda c: c["slug"]) if c.get("slug"))
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
