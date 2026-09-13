#!/usr/bin/env python3
"""Redate chaque extrait du Bulletin municipal d'après SON fascicule.

Pourquoi. Jusqu'au 2026-09-13, `sync_gallica_bmo.py` lisait les réponses de
Gallica avec une expression qui franchissait la fin d'un enregistrement, et
pouvait donner à un fascicule la date de son voisin. Mesuré, pas supposé :
sur une page réelle de 10 enregistrements (date écrite avant l'identifiant),
l'ancienne expression ne produisait que 5 paires ; sur le pilote, les archives
resynchronisées gagnent 2 à 10 % de fascicules, le Théâtre du Châtelet garde
ses 18 dates d'extraits, la piscine des Amiraux voit ses 8 changer, dont 7 de
plusieurs décennies. L'ampleur varie donc d'un lieu à l'autre ; elle se mesure
lieu par lieu avec `--dry-run`. Le fascicule, la page, le texte et le lien de
chaque extrait sont justes ; seule l'étiquette de date pouvait mentir.

Ce script ne refait ni la curation ni le tri de pertinence. Une fois les
archives brutes resynchronisées avec le parseur corrigé, il reprend chaque
extrait (`{slug}_bmo_snippets.jsonl`) et chaque extrait gardé
(`{slug}_bmo_keep.json`), retrouve leur fascicule par son ark dans l'archive
brute corrigée (`{slug}_bmo.jsonl`), et remplace la date.

Un extrait dont le fascicule est absent de l'archive corrigée ne peut pas être
redaté : sa date est vidée et il est marqué `date_non_confirmee`, plutôt que de
garder une date qu'on sait fausse. L'export écarte déjà tout extrait sans date.

Les traductions anglaises des extraits (`{slug}_en.json`, `bmo_extraits_en`)
sont rangées sous la clé « date|lien de la page » : redater sans les réécrire
ferait perdre la traduction de chaque extrait redaté. Le lien de la page ne
change pas, on s'en sert pour recalculer la clé.

En fin de passe, le script liste les lieux dont un extrait GARDÉ change
d'année : leur récit d'archive cite ces années et doit être réécrit.

Usage :
    python pipeline/scripts/enrich/redate_bmo_snippets.py --dry-run
    python pipeline/scripts/enrich/redate_bmo_snippets.py [--only slug-a,slug-b]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "lieux"


def ark_de(url: str) -> str:
    """Même extraction que curate_bmo_all.py, pour que les clés se rejoignent."""
    ark = (url or "").split("gallica.bnf.fr/")[-1]
    return ark if ark.startswith("ark:") else ""


def dates_par_ark(slug: str) -> dict[str, str]:
    p = CACHE / f"{slug}_bmo.jsonl"
    if not p.exists():
        return {}
    out: dict[str, str] = {}
    for line in p.open():
        if not line.strip():
            continue
        r = json.loads(line)
        ark = ark_de(r.get("gallica_url", ""))
        if ark:
            out[ark] = r.get("issue_date") or ""
    return out


def redate(rows: list[dict], dates: dict[str, str], stats: dict) -> list[dict]:
    for r in rows:
        ark = r.get("ark") or ""
        ancienne = r.get("issue_date") or ""
        if ark in dates and dates[ark]:
            nouvelle = dates[ark]
            if nouvelle != ancienne:
                r.setdefault("issue_date_avant_redatage", ancienne)
                r["issue_date"] = nouvelle
                stats["changees"] += 1
            else:
                stats["identiques"] += 1
            r.pop("date_non_confirmee", None)
        else:
            r.setdefault("issue_date_avant_redatage", ancienne)
            r["issue_date"] = ""
            r["date_non_confirmee"] = True
            stats["non_confirmees"] += 1
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="slugs à traiter, séparés par des virgules")
    ap.add_argument("--dry-run", action="store_true", help="mesure sans rien écrire")
    args = ap.parse_args()

    slugs = sorted(p.name[: -len("_bmo_snippets.jsonl")] for p in CACHE.glob("*_bmo_snippets.jsonl"))
    if args.only:
        veut = {s.strip() for s in args.only.split(",") if s.strip()}
        slugs = [s for s in slugs if s in veut]

    total = {"changees": 0, "identiques": 0, "non_confirmees": 0}
    stats_en = {"reclees": 0, "abandonnees": 0}
    recits_a_refaire: list[str] = []
    for slug in slugs:
        dates = dates_par_ark(slug)
        if not dates:
            print(f"--  {slug}: pas d'archive brute, sauté", file=sys.stderr)
            continue
        stats = {"changees": 0, "identiques": 0, "non_confirmees": 0}

        sp = CACHE / f"{slug}_bmo_snippets.jsonl"
        snips = [json.loads(l) for l in sp.open() if l.strip()]
        snips = redate(snips, dates, stats)

        kp = CACHE / f"{slug}_bmo_keep.json"
        keep_doc = json.load(kp.open()) if kp.exists() else None
        if keep_doc and keep_doc.get("keep"):
            # Les extraits gardés portent une copie de la date : c'est elle que
            # lit l'écriture du récit. Même correction, sans compter deux fois.
            annees_avant = {(k.get("ark"), k.get("page")): (k.get("issue_date") or "")[:4] for k in keep_doc["keep"]}
            redate(keep_doc["keep"], dates, {"changees": 0, "identiques": 0, "non_confirmees": 0})
            if any((k.get("issue_date") or "")[:4] != annees_avant.get((k.get("ark"), k.get("page")))
                   for k in keep_doc["keep"]):
                recits_a_refaire.append(slug)

        # Traductions anglaises : même extrait, nouvelle date, donc nouvelle clé.
        ep = CACHE / f"{slug}_en.json"
        en_doc = json.load(ep.open()) if ep.exists() else None
        if en_doc and isinstance(en_doc.get("bmo_extraits_en"), dict):
            date_par_lien = {sn.get("page_url"): sn.get("issue_date") for sn in snips}
            rekey = {}
            for cle, texte in en_doc["bmo_extraits_en"].items():
                lien = cle.split("|", 1)[1] if "|" in cle else ""
                nouvelle = date_par_lien.get(lien)
                if nouvelle:  # sans date confirmée, l'extrait ne sera pas publié
                    rekey[f"{nouvelle}|{lien}"] = texte
                    stats_en["reclees"] += cle != f"{nouvelle}|{lien}"
                else:
                    stats_en["abandonnees"] += 1
            en_doc["bmo_extraits_en"] = rekey

        if not args.dry_run:
            sp.write_text("".join(json.dumps(s, ensure_ascii=False) + "\n" for s in snips))
            if keep_doc is not None:
                kp.write_text(json.dumps(keep_doc, ensure_ascii=False, indent=1))
            if en_doc is not None:
                ep.write_text(json.dumps(en_doc, ensure_ascii=False, indent=1))
        for k in total:
            total[k] += stats[k]
        if stats["changees"] or stats["non_confirmees"]:
            print(f"{slug:<46} changées={stats['changees']:<3} identiques={stats['identiques']:<3} "
                  f"non confirmées={stats['non_confirmees']}")

    n = sum(total.values())
    print(f"\n{'[mesure] ' if args.dry_run else ''}{n} extraits : {total['changees']} redatés, "
          f"{total['identiques']} déjà justes, {total['non_confirmees']} sans date confirmée.")
    print(f"traductions anglaises : {stats_en['reclees']} clés recalculées, "
          f"{stats_en['abandonnees']} abandonnées (extrait sans date confirmée).")
    recits = [r for r in recits_a_refaire if (CACHE / f"{r}_bmo_recit.json").exists()]
    print(f"récits à réécrire (un extrait gardé change d'année) : {len(recits)}")
    print("RECITS_A_REFAIRE=" + json.dumps(recits))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
