#!/usr/bin/env python3
"""Curation BMO : snippets par fascicule via Gallica ContentSearch.

Pour chaque fascicule du raw {slug}_bmo.jsonl, interroge ContentSearch
et ne garde que les correspondances EXACTES du terme (le moteur Gallica
racinise « Amiraux » → « Amiral », ce qui pollue le rappel — vérifié
2026-07-17 sur bpt6k6433684p : hit « Amiral-Roussin »). Sortie :
{slug}_bmo_snippets.jsonl — fascicule × page × extrait, cité.

Usage : python pipeline/scripts/enrich/curate_bmo_snippets.py --slug piscine-des-amiraux --term Amiraux
"""
from __future__ import annotations
import argparse, html, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
UA = {"User-Agent": "qipu/0.1 (recherche civique; qipu.org)"}

def content_search(ark: str, query: str) -> list[dict]:
    u = "https://gallica.bnf.fr/services/ContentSearch?" + urllib.parse.urlencode({"ark": ark, "query": query})
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
        x = r.read().decode("utf-8", "ignore")
    out = []
    for pid, content in re.findall(r"<p_id>PAG_(\d+)</p_id>.*?<content>(.*?)</content>", x, re.S):
        txt = html.unescape(html.unescape(content))
        txt = re.sub(r"<[^>]+>", "", txt)
        txt = re.sub(r"\s+", " ", txt).strip()
        out.append({"page": int(pid), "snippet": txt[:400]})
    return out

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--term", required=True, help="terme exact requis dans le snippet")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    src = ROOT / "pipeline" / "cache" / "lieux" / f"{args.slug}_bmo.jsonl"
    rows = [json.loads(l) for l in src.open()]
    if args.limit:
        rows = rows[: args.limit]
    out_path = ROOT / "pipeline" / "cache" / "lieux" / f"{args.slug}_bmo_snippets.jsonl"
    synced = datetime.now(timezone.utc).isoformat()
    kept = checked = 0
    with out_path.open("w") as out:
        for r in rows:
            ark = "ark:/" + r["gallica_url"].split("ark:/")[1]
            checked += 1
            try:
                snips = content_search(ark, args.term)
            except Exception as exc:
                print(f"ERR {ark}: {type(exc).__name__}", file=sys.stderr)
                time.sleep(2)
                continue
            exact = [s for s in snips if args.term in s["snippet"]]
            for s in exact:
                out.write(json.dumps({
                    "lieu_slug": args.slug, "term": args.term,
                    "issue_date": r["issue_date"], "ark": ark,
                    "page": s["page"], "snippet": s["snippet"],
                    "page_url": f"https://gallica.bnf.fr/{ark}/f{s['page']}.item",
                    "source": r["source"], "_synced_at": synced,
                }, ensure_ascii=False) + "\n")
            kept += 1 if exact else 0
            if checked % 50 == 0:
                print(f"  {checked}/{len(rows)} fascicules, {kept} avec match exact")
            time.sleep(0.7)
    print(f"{args.slug}: {kept}/{checked} fascicules avec « {args.term} » exact -> {out_path.relative_to(ROOT)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
