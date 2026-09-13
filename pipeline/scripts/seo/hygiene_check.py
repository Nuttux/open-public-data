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

Writes a CSV of every check and prints a scorecard per host, each rule scored
over the pages it applies to. Exit 1 when a hard rule fails (everything except
cache and speed, which are reported).

A family is a URL SHAPE: the route the URL resolves to in website/src/app, its
slugs collapsed into the route's placeholders — /fr/city/[slug]/fonction/[fonction]
is one family, not one per commune. (Grouping by the path up to the slug made
~5 500 families per host once every commune had fonction and nature pages, and a
`--per-family 1` run took over 50 minutes.) A URL with no route in this checkout
falls back to its path with the last segment collapsed.

Runs in under a minute for the three hosts with `--per-family 1` against the
edge-cached production site (13 Sep 2026: 192 pages, 29 s): sitemap
segments and page checks are fetched in parallel (--workers, default 4, capped at
4 — more trips Vercel's attack mitigation), and the status of a twin or
breadcrumb link is fetched once per run. Never run it in the background from a
cloud routine — the session ends with its last message.

Usage:
  python3 pipeline/scripts/seo/hygiene_check.py [--per-family 2] [--hosts www,fr,pt] [--out scratchpad/seo] [--workers 4]
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
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from threading import Lock

UA = "Mozilla/5.0 (compatible; QipuHygiene/1.0; +https://www.qipu.org)"
HOSTS = {"www": "https://www.qipu.org", "fr": "https://fr.qipu.org", "pt": "https://pt.qipu.org"}
ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "website" / "src" / "app"
MAX_WORKERS = 4  # more trips Vercel's bot mitigation

# The static segment an entity page hangs under (/fr/city/paris/subventions/association/[slug]):
# those pages must carry the answer sentence, a Dataset and a see-also block.
ENTITY_TAILS = ("association", "fournisseur", "contrat", "projet", "lieu", "bailleur", "poste", "theme", "categorie",
                "chapitre", "instrument", "masse", "arrondissement", "payee", "dept", "place", "role", "family", "area",
                "service", "character", "type", "authority", "category", "contract", "orgao", "tema", "modalidade",
                "contratos", "lugares", "quem-recebe", "funcao", "fonction", "nature")


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


_status_cache: dict[str, int] = {}
_status_lock = Lock()


def status_of(url: str) -> int:
    """HTTP status of a linked URL (a twin, a breadcrumb), fetched once per run."""
    with _status_lock:
        if url in _status_cache:
            return _status_cache[url]
    st = get(url)[0]
    with _status_lock:
        _status_cache[url] = st
    return st


def sitemap_urls(base: str, workers: int = 4) -> list[str]:
    st, body, _, _ = get(f"{base}/robots.txt")
    segs = re.findall(r"^Sitemap:\s*(\S+)", body.decode("utf8", "ignore"), re.M)

    def one(s: str) -> list[str]:
        _, b, _, _ = get(s, timeout=300)
        return re.findall(r"<loc>([^<]+)</loc>", b.decode("utf8", "ignore"))

    urls: list[str] = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for part in ex.map(one, segs):
            urls.extend(part)
    return urls


def _is_param(name: str) -> bool:
    return name.startswith("[") and name.endswith("]")


def _is_catch_all(name: str) -> bool:
    return name.startswith("[...") or name.startswith("[[...")


@lru_cache(maxsize=None)
def _route_children(d: str) -> tuple[str, ...]:
    """Route segments directly under an app directory, with route groups flattened."""
    out: list[str] = []
    try:
        entries = sorted(Path(d).iterdir())
    except OSError:
        return ()
    for c in entries:
        n = c.name
        if not c.is_dir() or n.startswith(("@", "_", "(.")):  # parallel slots, private folders, intercepted routes
            continue
        if n.startswith("(") and n.endswith(")"):  # a route group adds no segment
            out.extend(f"{c.name}/{g}" for g in _route_children(str(c)))
            continue
        out.append(n)
    return tuple(out)


def route_shape(path: str) -> list[str] | None:
    """The app route `path` resolves to, as segments ([slug] kept), or None when none does."""
    segs = [urllib.parse.unquote(s) for s in path.strip("/").split("/") if s]

    def walk(d: Path, i: int) -> list[str] | None:
        if i == len(segs):
            return []
        kids = _route_children(str(d))
        name = lambda k: k.rsplit("/", 1)[-1]  # noqa: E731
        for k in kids:  # a static segment wins over a parameter, as in Next
            if name(k) == segs[i]:
                rest = walk(d / k, i + 1)
                if rest is not None:
                    return [name(k)] + rest
        for k in kids:
            if _is_param(name(k)) and not _is_catch_all(name(k)):
                rest = walk(d / k, i + 1)
                if rest is not None:
                    return [name(k)] + rest
        for k in kids:
            if _is_catch_all(name(k)):
                return [name(k)]
        return None

    return walk(APP, 0) if APP.is_dir() else None


def family_of(url: str) -> str:
    """The URL's shape: its route with the slugs as placeholders."""
    path = urllib.parse.urlparse(url).path
    shape = route_shape(path)
    if shape is not None:
        return "/" + "/".join(shape)
    seg = path.strip("/").split("/")
    return "/" + "/".join(seg[:-1] + ["[*]"]) if len(seg) > 1 else path


def _trailing_params(family: str) -> int:
    n = 0
    for s in reversed(family.strip("/").split("/")):
        if not _is_param(s) or _is_catch_all(s):
            break
        n += 1
    return n


def is_entity(family: str) -> bool:
    """An entity family: its last static segment, before the slug(s), is an entity tail."""
    seg = family.strip("/").split("/")
    seg = seg[: len(seg) - _trailing_params(family)]
    return bool(seg) and seg[-1] in ENTITY_TAILS


def unknown_url(sample: str, family: str) -> str:
    """The sample URL with its slug replaced by one that cannot exist."""
    p = urllib.parse.urlparse(sample)
    seg = p.path.strip("/").split("/")
    keep = seg[: len(seg) - _trailing_params(family)] if _trailing_params(family) else seg
    return f"{p.scheme}://{p.netloc}/{'/'.join(keep)}/zz-not-a-real-slug-{random.randint(1000, 9999)}"


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
        ok_twins = ok_twins and status_of(tw) == 200
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
                crumbs_ok = crumbs_ok and status_of(item["item"]) == 200
    r["jsonld"] = ("BreadcrumbList" in types) and (not expect_entity or "Dataset" in types) and crumbs_ok
    r["related"] = (not expect_entity) or bool(re.search(r'fx-related">.*?fx-v3-row fx-row-link', html, re.S))
    r["weight"] = len(body) < 300 * 1024
    r["speed"] = ttfb < 1.5
    _, _, h2, _ = get(url)
    r["cache"] = h2.get("x-vercel-cache", "-") == "HIT"
    return r


def soft404(url: str) -> bool:
    return get(url)[0] == 404


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-family", type=int, default=2)
    ap.add_argument("--hosts", default="www,fr,pt")
    ap.add_argument("--out", default=str(ROOT / "scratchpad" / "seo"))
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--workers", type=int, default=MAX_WORKERS, help=f"parallel requests, at most {MAX_WORKERS}")
    a = ap.parse_args()
    if a.workers > MAX_WORKERS:
        print(f"--workers {a.workers} → {MAX_WORKERS}: more trips Vercel's bot mitigation", file=sys.stderr)
    a.workers = max(1, min(a.workers, MAX_WORKERS))
    started = time.time()
    random.seed(a.seed)
    out = Path(a.out) / dt.date.today().strftime("%Y-%m-%d")
    out.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    hard = ["h1", "title", "canonical", "hreflang", "weight"]
    entity_hard = ["answer", "jsonld", "related"]  # hubs, landing and legal pages carry no answer sentence
    failed = 0
    for h in a.hosts.split(","):
        base = HOSTS[h]
        urls = sitemap_urls(base, a.workers)
        fam: dict[str, list[str]] = defaultdict(list)
        for u in urls:
            fam[family_of(u)].append(u)
        print(f"== {h}: {len(urls)} URLs in {len(fam)} families (URL shapes)", flush=True)
        # The sample is drawn sequentially (reproducible with --seed), the checks run in parallel.
        jobs: list[tuple[str, bool, str]] = []
        for f, us in sorted(fam.items()):
            entity = is_entity(f)
            for u in random.sample(us, min(a.per_family, len(us))):
                jobs.append((f, entity, u))

        def run(job: tuple[str, bool, str]) -> dict[str, object]:
            f, entity, u = job
            r = check(u, entity)
            r.update({"host": h, "family": f, "entity": entity})
            return r

        with ThreadPoolExecutor(max_workers=a.workers) as ex:
            results = list(ex.map(run, jobs))
        for r in results:
            entity = bool(r["entity"])
            bad = [k for k in hard + (entity_hard if entity else []) if r.get(k) is False]
            if r["status"] != 200:
                bad.insert(0, f"status {r['status']}")
            failed += bool(bad)
            rows.append(r)
            flag = "OK " if not bad else "FAIL"
            print(f"  {flag} {r['ttfb_s']:>5}s {r['kb']:>4}KB {'HIT' if r['cache'] else 'miss'} {r['url']}{'  ← ' + ', '.join(bad) if bad else ''}")
        # One unknown slug per entity family, built on the family's first sampled URL.
        probes: dict[str, str] = {}
        for f, entity, u in jobs:
            if entity and f not in probes:
                probes[f] = unknown_url(u, f)
        with ThreadPoolExecutor(max_workers=a.workers) as ex:
            oks = list(ex.map(soft404, probes.values()))
        for (f, probe), ok in zip(probes.items(), oks):
            rows.append({"host": h, "family": f, "url": probe, "status": 404 if ok else 200, "soft404": ok})
            failed += not ok
            if not ok:
                print(f"  FAIL soft 404 on {probe}")
    keys = sorted({k for r in rows for k in r})
    with (out / "hygiene.csv").open("w", newline="", encoding="utf-8") as fp:
        w = csv.DictWriter(fp, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    checked = [r for r in rows if "soft404" not in r]
    probes = [r for r in rows if "soft404" in r]
    print(f"\n{len(checked)} pages checked, {failed} failures in {(time.time() - started) / 60:.1f} min → {out / 'hygiene.csv'}")
    # A rule is scored over the pages it applies to: the entity rules over entity pages only.
    hosts = a.hosts.split(",")
    print(f"  {'rule':10s} {'all':>9s}  " + "  ".join(f"{h:>9s}" for h in hosts))
    for k in hard + entity_hard + ["speed", "cache", "soft404"]:
        pool = probes if k == "soft404" else [r for r in checked if k not in entity_hard or r.get("entity")]

        def score(rs: list[dict[str, object]]) -> str:
            return f"{sum(1 for r in rs if r.get(k) is True)}/{len(rs)}"

        print(f"  {k:10s} {score(pool):>9s}  " + "  ".join(f"{score([r for r in pool if r['host'] == h]):>9s}" for h in hosts))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
