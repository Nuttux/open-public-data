#!/usr/bin/env python3
"""
SEO / AI-GEO hygiene check — the rules every page of the site must keep
(memory: feedback_seo_aigeo_by_default), verified the way a crawler sees them.

Samples URLs from the live sitemaps of each host (one or more per entity
family), fetches them without cookies, and asserts:

  h1          exactly one <h1>
  answer      the answer sentence under the h1 (.fx-answer), with a digit in it
  title       a <title> that carries a number (the "answer" form) and one brand suffix
  canonical   <link rel=canonical> on the host that served the page
  hreflang    the twins declared, each answering 200 on its own host
  jsonld      BreadcrumbList + Dataset (entity pages) that parse; breadcrumb links 200
  related     a "see also" block with at least one row (entity pages)
  weight      HTML under 300 KB
  speed       time to first byte under 1.5 s
  cache       Vercel edge cache HIT on a second request (informational)
  soft404     an unknown slug in the family returns 404, not 200

Writes a CSV of every check and prints a scorecard per host and family. Exit 1
when a hard rule fails (everything except cache and speed, which are reported).

Usage:
  python3 pipeline/scripts/seo/hygiene_check.py [--per-family 2] [--hosts www,fr,pt] [--out scratchpad/seo]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

UA = "Mozilla/5.0 (compatible; QipuHygiene/1.0; +https://www.qipu.org)"
HOSTS = {"www": "https://www.qipu.org", "fr": "https://fr.qipu.org", "pt": "https://pt.qipu.org"}
ROOT = Path(__file__).resolve().parents[3]

# A family = the path shape up to the slug, e.g. /fr/city/paris/subventions/association.
ENTITY_TAILS = ("association", "fournisseur", "contrat", "projet", "lieu", "bailleur", "poste", "theme", "categorie",
                "chapitre", "instrument", "masse", "arrondissement", "payee", "dept", "place", "role", "family", "area",
                "service", "character", "type", "authority", "category", "contract", "orgao", "tema", "modalidade",
                "contratos", "lugares", "quem-recebe", "funcao")


def get(url: str, timeout: int = 60) -> tuple[int, bytes, dict[str, str], float]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, body, {k.lower(): v for k, v in r.headers.items()}, time.time() - t
    except urllib.error.HTTPError as e:
        return e.code, e.read() if e.fp else b"", {k.lower(): v for k, v in e.headers.items()}, time.time() - t
    except Exception:  # noqa: BLE001
        return 0, b"", {}, time.time() - t


def sitemap_urls(base: str) -> list[str]:
    st, body, _, _ = get(f"{base}/robots.txt")
    segs = re.findall(r"^Sitemap:\s*(\S+)", body.decode("utf8", "ignore"), re.M)
    urls: list[str] = []
    for s in segs:
        st, b, _, _ = get(s, timeout=300)
        urls.extend(re.findall(r"<loc>([^<]+)</loc>", b.decode("utf8", "ignore")))
    return urls


def family_of(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    seg = path.strip("/").split("/")
    if len(seg) >= 2 and seg[-2] in ENTITY_TAILS:
        return "/" + "/".join(seg[:-1])
    if len(seg) >= 3 and seg[-3] in ENTITY_TAILS:  # dept/[slug]/character/[slug]
        return "/" + "/".join(seg[:-1])
    return "/" + "/".join(seg[:4]) if len(seg) > 4 else path  # sections, browse, communes


def is_entity(family: str) -> bool:
    return family.rstrip("/").split("/")[-1] in ENTITY_TAILS


def check(url: str, expect_entity: bool) -> dict[str, object]:
    st, body, headers, ttfb = get(url)
    html = body.decode("utf8", "ignore")
    r: dict[str, object] = {"url": url, "status": st, "ttfb_s": round(ttfb, 2), "kb": len(body) // 1024}
    r["h1"] = len(re.findall(r"<h1[\s>]", html)) == 1
    ans = re.search(r'class="fx-page-lede fx-answer">(.*?)</p>', html, re.S)
    r["answer"] = bool(ans and re.search(r"\d", ans.group(1)))
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    t = title.group(1) if title else ""
    r["title"] = bool(title) and t.count("· Qipu") == 1 and (not expect_entity or bool(re.search(r"\d", t)))
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    host = urllib.parse.urlparse(url).netloc
    r["canonical"] = bool(canon) and urllib.parse.urlparse(canon.group(1)).netloc == host
    twins = re.findall(r'<link rel="alternate" hrefLang="[^"]+" href="([^"]+)"', html, re.I)
    ok_twins = True
    for tw in twins:
        if tw == url or tw.rstrip("/") == url.rstrip("/"):
            continue
        s2, _, _, _ = get(tw)
        ok_twins = ok_twins and s2 == 200
    r["hreflang"] = bool(twins) and ok_twins
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    types: list[str] = []
    crumbs_ok = True
    for j in blocks:
        try:
            d = json.loads(j)
        except json.JSONDecodeError:
            crumbs_ok = False
            continue
        types.append(str(d.get("@type")))
        if d.get("@type") == "BreadcrumbList":
            for item in d.get("itemListElement", [])[:-1]:
                s3, _, _, _ = get(item["item"])
                crumbs_ok = crumbs_ok and s3 == 200
    r["jsonld"] = ("BreadcrumbList" in types) and (not expect_entity or "Dataset" in types) and crumbs_ok
    r["related"] = (not expect_entity) or bool(re.search(r'fx-related">.*?fx-v3-row fx-row-link', html, re.S))
    r["weight"] = len(body) < 300 * 1024
    r["speed"] = ttfb < 1.5
    _, _, h2, _ = get(url)
    r["cache"] = h2.get("x-vercel-cache", "-") == "HIT"
    return r


def soft404(family_url: str) -> bool:
    st, _, _, _ = get(f"{family_url}/zz-not-a-real-slug-{random.randint(1000, 9999)}")
    return st == 404


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-family", type=int, default=2)
    ap.add_argument("--hosts", default="www,fr,pt")
    ap.add_argument("--out", default=str(ROOT / "scratchpad" / "seo"))
    ap.add_argument("--seed", type=int, default=None)
    a = ap.parse_args()
    random.seed(a.seed)
    out = Path(a.out) / dt.date.today().strftime("%Y-%m-%d")
    out.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    hard = ["h1", "answer", "title", "canonical", "hreflang", "jsonld", "related", "weight"]
    failed = 0
    for h in a.hosts.split(","):
        base = HOSTS[h]
        urls = sitemap_urls(base)
        fam: dict[str, list[str]] = defaultdict(list)
        for u in urls:
            fam[family_of(u)].append(u)
        print(f"== {h}: {len(urls)} URLs in {len(fam)} families")
        for f, us in sorted(fam.items()):
            entity = is_entity(f)
            sample = random.sample(us, min(a.per_family, len(us)))
            for u in sample:
                r = check(u, entity)
                r.update({"host": h, "family": f, "entity": entity})
                bad = [k for k in hard if r.get(k) is False]
                if r["status"] != 200:
                    bad.insert(0, f"status {r['status']}")
                failed += bool(bad)
                rows.append(r)
                flag = "OK " if not bad else "FAIL"
                print(f"  {flag} {r['ttfb_s']:>5}s {r['kb']:>4}KB {'HIT' if r['cache'] else 'miss'} {u}{'  ← ' + ', '.join(bad) if bad else ''}")
            if entity:
                ok = soft404(f"{base}{f}")
                rows.append({"host": h, "family": f, "url": f"{base}{f}/<unknown>", "status": 404 if ok else 200, "soft404": ok})
                failed += not ok
                if not ok:
                    print(f"  FAIL soft 404 on {base}{f}/<unknown>")
    keys = sorted({k for r in rows for k in r})
    with (out / "hygiene.csv").open("w", newline="", encoding="utf-8") as fp:
        w = csv.DictWriter(fp, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    checked = [r for r in rows if "soft404" not in r]
    print(f"\n{len(checked)} pages checked, {failed} failures → {out / 'hygiene.csv'}")
    for k in hard + ["speed", "cache"]:
        n = sum(1 for r in checked if r.get(k) is True)
        print(f"  {k:10s} {n}/{len(checked)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
