#!/usr/bin/env python3
"""
Fetch the Wikipedia lead extract (FR + EN) for each Marseille civic place, so the
fiche can lead with a real encyclopaedic paragraph — the same "wiki" block the
Paris lieux carry. Deliberations/BMO are Paris-specific archives and stay out of
Marseille v1; this is the transferable, universal richness lift.

Source: fr.wikipedia.org page named in the seed (`wiki` field); the EN extract is
followed through `langlinks` to en.wikipedia.org when an EN article exists.

Input:  pipeline/seeds/marseille_place_candidates.json  (slug + `wiki` FR title)
Output: website/public/data/fr/marseille/places/_wiki.json
          { slug: { extract, extract_en, title, title_en, url, url_en } }

Only the intro (exintro), plain text (explaintext) — one factual paragraph, the
CC-BY-SA text credited to Wikipedia in the fiche + sources.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "marseille_place_candidates.json"
OUT = ROOT / "website" / "public" / "data" / "fr" / "marseille" / "places" / "_wiki.json"

FR_API = "https://fr.wikipedia.org/w/api.php"
EN_API = "https://en.wikipedia.org/w/api.php"
UA = "QipuOpenData/1.0 (civic open-data; contact via github.com/Nuttux/open-public-data)"

# A couple of pages whose EN article title differs enough that langlinks is the
# only reliable bridge — handled generically via langlinks, no per-place map.


def api(url: str, params: dict) -> dict:
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    req = urllib.request.Request(f"{url}?{q}", headers={"User-Agent": UA})
    last = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503):
                wait = 2 ** attempt
                print(f"    {e.code} — backoff {wait}s")
                time.sleep(wait)
                continue
            raise
        except urllib.error.URLError as e:
            last = e
            time.sleep(2 ** attempt)
    raise last if last else RuntimeError("api failed")


def clean(txt: str | None) -> str:
    if not txt:
        return ""
    # Collapse whitespace; drop a trailing "(...)" pronunciation clutter is rare
    # enough to leave. exintro already gives a tidy lead.
    return " ".join(txt.split()).strip()


def fetch_fr(title: str) -> dict:
    """FR extract + the page's canonical URL + EN langlink title (if any)."""
    d = api(FR_API, {
        "action": "query",
        "prop": "extracts|langlinks|info",
        "exintro": "1",
        "explaintext": "1",
        "lllang": "en",
        "inprop": "url",
        "redirects": "1",
        "titles": title,
    })
    pages = d.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return {}
    p = pages[0]
    en_title = None
    for ll in p.get("langlinks", []):
        if ll.get("lang") == "en":
            en_title = ll.get("title")
    return {
        "extract": clean(p.get("extract")),
        "title": p.get("title"),
        "url": p.get("fullurl") or f"https://fr.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
        "en_title": en_title,
    }


def fetch_en(title: str) -> dict:
    d = api(EN_API, {
        "action": "query",
        "prop": "extracts|info",
        "exintro": "1",
        "explaintext": "1",
        "inprop": "url",
        "redirects": "1",
        "titles": title,
    })
    pages = d.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return {}
    p = pages[0]
    return {"extract_en": clean(p.get("extract")), "title_en": p.get("title"), "url_en": p.get("fullurl")}


def save(out: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False))


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    seed = json.loads(SEED.read_text())["places"]
    # Always merge into any existing file and checkpoint after each place, so a
    # mid-run 429 (Wikimedia throttles shared IPs) never loses earlier work.
    out: dict[str, dict] = json.loads(OUT.read_text()) if OUT.exists() else {}

    for pl in seed:
        slug = pl["slug"]
        if only and slug != only:
            continue
        title = pl.get("wiki")
        if not title:
            print(f"  {slug}: no wiki title in seed — skip")
            continue
        fr = fetch_fr(title)
        if not fr.get("extract"):
            print(f"  {slug}: FR extract MISSING for «{title}»")
            continue
        rec = {"extract": fr["extract"], "title": fr["title"], "url": fr["url"], "extract_en": "", "url_en": None}
        if fr.get("en_title"):
            time.sleep(0.3)
            en = fetch_en(fr["en_title"])
            rec["extract_en"] = en.get("extract_en", "")
            rec["url_en"] = en.get("url_en")
        out[slug] = rec
        save(out)  # checkpoint
        flag = "fr+en" if rec["extract_en"] else "fr only"
        print(f"  {slug}: {flag} · {len(rec['extract'])}c")
        time.sleep(0.3)

    save(out)
    print(f"wrote {len(out)} wiki extracts → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
