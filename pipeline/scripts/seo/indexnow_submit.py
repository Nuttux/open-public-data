"""Signale les URL du site à IndexNow (Bing, et par lui ChatGPT search et Copilot ;
Yandex, Seznam, Naver). Google n'y participe pas : pour lui, c'est
submit_sitemaps.py.

Les URL viennent des sitemaps que la prod déclare dans son robots.txt, hôte par
hôte — donc exactement ce qu'un robot voit, rien d'inventé. Un POST par lot de
10 000 URL (la limite du protocole). Avant tout envoi, le script vérifie que
l'hôte sert bien la clé (website/public/<clé>.txt) : sans elle, les moteurs
rejettent tout.

Sans --submit, rien ne part : le script compte ce qu'il enverrait.

IndexNow demande de signaler ce qui est nouveau ou modifié, pas de renvoyer le
site entier à chaque passage. --all est pour le premier envoi ; ensuite
--since (les URL dont le lastmod est postérieur) ou --prefix (une famille qu'on
vient de publier).

    python3 pipeline/scripts/seo/indexnow_submit.py --all                      # compte, n'envoie rien
    python3 pipeline/scripts/seo/indexnow_submit.py --all --submit             # premier envoi
    python3 pipeline/scripts/seo/indexnow_submit.py --since 2026-09-09 --submit
    python3 pipeline/scripts/seo/indexnow_submit.py --prefix /fr/france/paris/lieu --submit
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
# One host since 2026-09-13 (website/src/lib/urls.ts): fr. and pt. redirect to www.
HOSTS = ["www.qipu.org"]
ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH = 10_000
UA = "Mozilla/5.0 (compatible; QipuIndexNow/1.0; +https://www.qipu.org)"


def key() -> str:
    """La clé est la source unique de website/src/lib/seo/indexnow.ts."""
    src = (ROOT / "website/src/lib/seo/indexnow.ts").read_text()
    m = re.search(r"INDEXNOW_KEY = '([0-9a-f]{32})'", src)
    if not m:
        sys.exit("clé IndexNow introuvable dans website/src/lib/seo/indexnow.ts")
    return m.group(1)


def fetch(url: str, timeout: int = 300) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:  # noqa: BLE001
        return 0, ""


def sitemap_entries(host: str, workers: int) -> list[tuple[str, str | None]]:
    """(loc, lastmod) de chaque URL déclarée par les sitemaps de robots.txt."""
    _, robots = fetch(f"https://{host}/robots.txt", timeout=60)
    segs = re.findall(r"^Sitemap:\s*(\S+)", robots, re.M)

    def one(url: str) -> list[tuple[str, str | None]]:
        code, body = fetch(url)
        if code != 200:
            print(f"  {url} → HTTP {code}", file=sys.stderr)
        out = []
        for block in re.findall(r"<url>(.*?)</url>", body, re.S):
            loc = re.search(r"<loc>([^<]+)</loc>", block)
            mod = re.search(r"<lastmod>([^<]+)</lastmod>", block)
            if loc:
                out.append((loc.group(1).strip(), mod.group(1)[:10] if mod else None))
        return out

    entries: list[tuple[str, str | None]] = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for part in ex.map(one, segs):
            entries.extend(part)
    return entries


def post(host: str, k: str, urls: list[str]) -> int:
    body = json.dumps({"host": host, "key": k, "keyLocation": f"https://{host}/{k}.txt", "urlList": urls}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("hosts", nargs="*", default=HOSTS)
    pick = ap.add_mutually_exclusive_group(required=True)
    pick.add_argument("--all", action="store_true", help="toutes les URL des sitemaps")
    pick.add_argument("--since", help="AAAA-MM-JJ : les URL dont le lastmod est à cette date ou après")
    pick.add_argument("--prefix", help="les URL dont le chemin commence par ce préfixe")
    ap.add_argument("--submit", action="store_true", help="envoyer pour de vrai")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    k = key()

    failed = 0
    for host in a.hosts:
        entries = sitemap_entries(host, a.workers)
        if a.since:
            urls = [u for u, mod in entries if mod and mod >= a.since]
        elif a.prefix:
            urls = [u for u, _ in entries if u.startswith(f"https://{host}{a.prefix}")]
        else:
            urls = [u for u, _ in entries]
        urls = list(dict.fromkeys(urls))
        batches = [urls[i:i + BATCH] for i in range(0, len(urls), BATCH)]
        print(f"{host:14s} déclarées={len(entries)} retenues={len(urls)} lots={len(batches)}")
        if not a.submit or not urls:
            continue

        code, served = fetch(f"https://{host}/{k}.txt", timeout=30)
        if code != 200 or served.strip() != k:
            print(f"  clé non servie sur {host} (HTTP {code}) — déployer website/public/{k}.txt d'abord", file=sys.stderr)
            failed += 1
            continue
        for i, batch in enumerate(batches, 1):
            st = post(host, k, batch)
            # 200 = reçu, 202 = reçu, clé en cours de vérification.
            ok = st in (200, 202)
            failed += not ok
            print(f"  lot {i}/{len(batches)} ({len(batch)} URL) → HTTP {st}{'' if ok else '  ← échec'}")
            if st == 429:
                print("  429 : trop de requêtes, arrêt pour cet hôte", file=sys.stderr)
                break
            time.sleep(2)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
