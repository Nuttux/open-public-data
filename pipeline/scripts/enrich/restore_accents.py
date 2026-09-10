#!/usr/bin/env python3
"""Rend leurs accents aux textes français des fiches de lieu (moments : fait,
pourquoi ; synthèse) écrits sans diacritiques par une passe d'enrichissement.

Constat du 2026-09-10 : 93 champs de moments sur 1 006 (29 lieux sur 182) et
7 synthèses n'ont aucun caractère accentué — « Le mecenat prive conteste en
seance » sur la fiche du Châtelet.

Deux modes, sans appel de modèle ici : la restitution des accents se fait
en session (Claude Code) ou par un modèle externe, et ce script ne fait que
lister et appliquer, avec une garantie : un texte n'est remplacé que si, une
fois ses accents retirés, il est IDENTIQUE à l'original. Rien d'autre qu'un
accent ne peut donc changer.

    --list  [--slug a,b]  → JSON {"<slug>|moments[i].fait": "texte", …}
    --apply mapping.json  → écrit dans pipeline/cache/lieux/<slug>_enrich.json
"""
from __future__ import annotations
import argparse, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "lieux"
ACC = re.compile(r"[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]")
FIELDS = ("fait", "pourquoi", "titre")
MIN_LEN = 25


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def needs(s) -> bool:
    return isinstance(s, str) and len(s) >= MIN_LEN and not ACC.search(s)


def walk(slug: str, d: dict):
    """(clé, texte) pour chaque champ français sans accent."""
    for i, m in enumerate(d.get("moments") or []):
        for k in FIELDS:
            if needs(m.get(k)):
                yield f"{slug}|moments[{i}].{k}", m[k]
    for k in ("synthese", "synthese_fr"):
        if needs(d.get(k)):
            yield f"{slug}|{k}", d[k]


def set_path(d: dict, path: str, value: str) -> None:
    m = re.fullmatch(r"moments\[(\d+)\]\.(\w+)", path)
    if m:
        d["moments"][int(m.group(1))][m.group(2)] = value
    else:
        d[path] = value


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(CACHE))
    ap.add_argument("--slug", help="slugs séparés par des virgules (défaut : tous)")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--apply", metavar="MAPPING_JSON")
    a = ap.parse_args()
    cache = Path(a.cache)
    slugs = a.slug.split(",") if a.slug else sorted(p.name[: -len("_enrich.json")] for p in cache.glob("*_enrich.json"))

    if a.list:
        out = {}
        for slug in slugs:
            p = cache / f"{slug}_enrich.json"
            if p.exists():
                out.update(dict(walk(slug, json.load(open(p)))))
        json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
        print(file=sys.stderr)
        print(f"{len(out)} champs sans accent, {len({k.split('|')[0] for k in out})} lieux", file=sys.stderr)
        return 0

    if a.apply:
        mapping = json.load(open(a.apply))
        by_slug: dict[str, dict[str, str]] = {}
        for key, txt in mapping.items():
            slug, path = key.split("|", 1)
            by_slug.setdefault(slug, {})[path] = txt
        applied = refused = 0
        for slug, paths in by_slug.items():
            p = cache / f"{slug}_enrich.json"
            d = json.load(open(p))
            current = dict(walk(slug, d))
            for path, new in paths.items():
                old = current.get(f"{slug}|{path}")
                if old is None:
                    print(f"  ignoré  {slug} {path} : plus sans accent, ou inconnu", file=sys.stderr); continue
                if strip_accents(new) != old:
                    refused += 1
                    print(f"  REFUSÉ  {slug} {path} : le texte accentué ne redonne pas l'original une fois les accents retirés", file=sys.stderr)
                    continue
                set_path(d, path, new); applied += 1
            json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
        print(f"{applied} champs réécrits, {refused} refusés", file=sys.stderr)
        return 1 if refused else 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
