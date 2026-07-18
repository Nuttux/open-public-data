#!/usr/bin/env python3
"""Corrige les dates des fascicules BMO via OAIRecord (source autoritaire).

Recon 2026-07-17 : le parsing regex du SRU appariait identifiants et dates
à travers les frontières d'enregistrements → dates fausses dans le raw.
OAIRecord avec le paramètre COMPLET `ark=ark:/12148/...` renvoie la vraie
date du fascicule (un param tronqué `ark=12148/...` renvoie silencieusement
un AUTRE document — piège vérifié).
"""
from __future__ import annotations
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
UA = {"User-Agent": "france-open-data/0.1 (recherche civique)"}

def oai_date(ark: str) -> str | None:
    u = "https://gallica.bnf.fr/services/OAIRecord?" + urllib.parse.urlencode({"ark": ark})
    x = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=45).read().decode("utf-8", "ignore")
    t = re.search(r"<dc:title>([^<]+)", x)
    d = re.search(r"<dc:date>([^<]+)", x)
    if not (t and "Bulletin municipal officiel" in t.group(1)):
        return None  # garde-fou : on ne date que ce qui est prouvé BMO
    return d.group(1).strip() if d else None

def main() -> int:
    slug = sys.argv[1] if len(sys.argv) > 1 else "piscine-des-amiraux"
    snip_path = ROOT / "pipeline" / "cache" / "lieux" / f"{slug}_bmo_snippets.jsonl"
    rows = [json.loads(l) for l in snip_path.open()]
    arks = sorted({r["ark"] for r in rows})
    print(f"{len(rows)} snippets, {len(arks)} fascicules à dater")
    dates: dict[str, str | None] = {}
    for i, ark in enumerate(arks):
        try:
            dates[ark] = oai_date(ark)
        except Exception as exc:
            print(f"ERR {ark}: {type(exc).__name__}", file=sys.stderr)
            dates[ark] = None
        if (i + 1) % 40 == 0:
            print(f"  {i+1}/{len(arks)}")
        time.sleep(0.6)
    ok = sum(1 for v in dates.values() if v)
    with snip_path.open("w") as f:
        for r in rows:
            r["issue_date"] = dates.get(r["ark"])
            r["date_source"] = "gallica OAIRecord"
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"dates corrigées: {ok}/{len(arks)} fascicules confirmés BMO -> {snip_path.name}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
