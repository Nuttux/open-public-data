#!/usr/bin/env python3
"""Fetch cleanly-licensed lead photos for Marseille places from Wikimedia Commons.

Same strict publication gate as fetch_sf_place_photos.py (the template): a place
ships only with a photo whose licence is Wikimedia Commons CC or verified public
domain, credit + licence recorded per photo. Resolves each seed place's French
Wikipedia lead image, reads the file's licence metadata, ACCEPTS only CC/PD,
downloads it to website/public/img/fr/marseille/places/<slug>.jpg, writes a
photo-credit record. Never invents a credit; unconfirmed licence → rejected
(that's the gate working, not a failure).

Output: website/public/img/fr/marseille/places/<slug>.jpg
        website/public/data/fr/marseille/places/_photo_credits.json

Usage: python pipeline/scripts/enrich/fetch_marseille_place_photos.py [--only slug] [--force]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "marseille_place_candidates.json"
IMG_DIR = ROOT / "website" / "public" / "img" / "fr" / "marseille" / "places"
OUT = ROOT / "website" / "public" / "data" / "fr" / "marseille" / "places"

# French landmarks are best covered on fr.wikipedia; licences are verified on
# Commons regardless.
WP_API = "https://fr.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "qipu-marseille/0.1 (civic research; contact qipu.org)"}

FREE_RE = re.compile(r"\b(CC[- ]?(BY|BY-SA|BY-SA-\d|0)|public domain|PD|no restrictions|domaine public)\b", re.I)
NONFREE_RE = re.compile(r"\b(fair use|non-?commercial|nc\b|no derivative|all rights reserved)\b", re.I)


def load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        return None


def api(url: str, params: dict) -> dict:
    q = url + "?" + urllib.parse.urlencode({**params, "format": "json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(q, headers=UA), timeout=30) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception:  # noqa: BLE001
            time.sleep(2 * (attempt + 1))
    return {}


def strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def lead_image_file(title: str) -> str | None:
    for params in (
        {"prop": "pageimages", "piprop": "name", "pilicense": "free"},
        {"prop": "pageimages", "piprop": "name"},
    ):
        for _ in range(2):
            # redirects:1 resolves case / redirect titles (e.g. "Cité radieuse"
            # → its canonical article) so a near-miss seed title still hits.
            d = api(WP_API, {"action": "query", "titles": title, "redirects": 1, **params})
            pages = (d.get("query") or {}).get("pages") or {}
            for p in pages.values():
                if p.get("pageimage"):
                    return p["pageimage"]
            if pages:
                break
            time.sleep(1.5)
    return None


def image_meta(filename: str) -> dict | None:
    for host in (COMMONS_API, WP_API):
        for _ in range(2):
            d = api(host, {
                "action": "query", "titles": f"File:{filename}",
                "prop": "imageinfo",
                "iiprop": "url|extmetadata|mime",
                "iiurlwidth": "1600",
            })
            pages = (d.get("query") or {}).get("pages") or {}
            for p in pages.values():
                ii = (p.get("imageinfo") or [None])[0]
                if ii:
                    return ii
            if pages:
                break
            time.sleep(1.5)
    return None


def classify_license(ext: dict) -> tuple[str, str] | None:
    short = strip_html((ext.get("LicenseShortName") or {}).get("value", ""))
    terms = strip_html((ext.get("UsageTerms") or {}).get("value", ""))
    url = strip_html((ext.get("LicenseUrl") or {}).get("value", ""))
    blob = f"{short} {terms}"
    if NONFREE_RE.search(blob):
        return None
    if FREE_RE.search(blob) or "pd" in short.lower():
        return (short or terms or "Public domain", url)
    return None


def download(url: str, dest: Path) -> bool:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            data = r.read()
        if len(data) < 3000:
            return False
        dest.write_bytes(data)
        return True
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true", help="re-fetch even already-credited places")
    args = ap.parse_args()

    seed = json.loads(SEED.read_text())
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    credits = {} if args.force else (load(OUT / "_photo_credits.json") or {})
    accepted, rejected = list(credits.keys()), []
    for pl in seed["places"]:
        slug = pl["slug"]
        if args.only and slug != args.only:
            continue
        if slug in credits and not args.force:
            continue
        # Optional explicit Commons file (without the "File:" prefix): used when
        # the Wikipedia lead image is a logo, wrong building, or absent. Still
        # runs through the same licence gate below — never a free pass.
        cf = pl.get("commons_file")
        wiki = pl.get("wiki")
        if cf:
            fn = cf
        elif wiki:
            fn = lead_image_file(wiki)
            time.sleep(1.0)
        else:
            rejected.append((slug, "no wiki title / commons_file"))
            continue
        if not fn:
            rejected.append((slug, "no lead image"))
            continue
        ii = image_meta(fn)
        time.sleep(1.0)
        if not ii:
            rejected.append((slug, "no imageinfo"))
            continue
        ext = ii.get("extmetadata") or {}
        lic = classify_license(ext)
        if not lic:
            rejected.append((slug, "non-free / unconfirmed licence"))
            continue
        img_url = ii.get("thumburl") or ii.get("url")
        if not img_url or (ii.get("mime") and "image" not in ii["mime"]):
            rejected.append((slug, "no usable image url"))
            continue
        dest = IMG_DIR / f"{slug}.jpg"
        if not download(img_url, dest):
            rejected.append((slug, "download failed"))
            continue
        artist = strip_html((ext.get("Artist") or {}).get("value", "")) or "Inconnu"
        credits[slug] = {
            "photo": f"/img/fr/marseille/places/{slug}.jpg",
            "source": "Wikimedia Commons",
            "file": f"File:{fn}",
            "file_url": ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{fn}",
            "license": lic[0],
            "license_url": lic[1],
            "author": artist,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        accepted.append(slug)
        print(f"✓ {slug:24} {lic[0][:24]:24} {artist[:34]}")

    (OUT / "_photo_credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))
    print(f"\n{len(accepted)} photos accepted, {len(rejected)} rejected.")
    for slug, why in rejected:
        print(f"  ✗ {slug:24} {why}")
    print(f"\nCredits → {OUT / '_photo_credits.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
