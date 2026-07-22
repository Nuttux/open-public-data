#!/usr/bin/env python3
"""Fetch cleanly-licensed lead photos for SF places from Wikimedia Commons.

Block C's publication gate is strict: a place ships only with a photo whose
licence is Wikimedia Commons CC or verified public domain, credit + licence
recorded per photo. This resolves each seed place's Wikipedia lead image,
reads the file's licence metadata, ACCEPTS only CC/PD, downloads it to
website/public/img/us/sf/places/<slug>.jpg, and writes a photo-credit record.

Places with no Wikipedia page, no lead image, or a non-free licence get no
photo — they fall to the Block C in-progress queue (that is the gate working,
not a failure). Never invents a credit; if the licence can't be confirmed
free, the photo is rejected.

Output: website/public/img/us/sf/places/<slug>.jpg
        website/public/data/us/sf/places/_photo_credits.json

Usage: python pipeline/scripts/enrich/fetch_sf_place_photos.py [--only slug]
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
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
IMG_DIR = ROOT / "website" / "public" / "img" / "us" / "sf" / "places"
OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "places"

WP_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "sf-open-data/0.1 (civic research; contact qipu.org)"}

# Accept only genuinely free licences.
FREE_RE = re.compile(r"\b(CC[- ]?(BY|BY-SA|BY-SA-\d|0)|public domain|PD|no restrictions)\b", re.I)
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
        except Exception as e:  # noqa: BLE001
            time.sleep(2 * (attempt + 1))
    return {}


def strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def lead_image_file(title: str) -> str | None:
    # Prefer the free-licensed lead image; fall back to the unfiltered lead
    # image (the licence is verified downstream, so a non-free one is rejected
    # there anyway). Two attempts absorb the odd throttled empty response.
    for params in (
        {"prop": "pageimages", "piprop": "name", "pilicense": "free"},
        {"prop": "pageimages", "piprop": "name"},
    ):
        for _ in range(2):
            d = api(WP_API, {"action": "query", "titles": title, **params})
            pages = (d.get("query") or {}).get("pages") or {}
            for p in pages.values():
                if p.get("pageimage"):
                    return p["pageimage"]
            if pages:
                break  # got a valid (imageless) response — try next param set
            time.sleep(1.5)
    return None


def image_meta(filename: str) -> dict | None:
    # Try Commons, then the local en.wikipedia file store (some lead images
    # live locally, not on Commons) — a throttled empty gets one retry.
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
    """Return (license_short, license_url) only if genuinely free."""
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
        if len(data) < 3000:  # too small to be a real photo
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

    # Incremental: keep photos already accepted, retry only the rest (throttle
    # scattered failures across image-rich pages on the first pass).
    credits = {} if args.force else (load(OUT / "_photo_credits.json") or {})
    accepted, rejected = list(credits.keys()), []
    for pl in seed["places"]:
        slug = pl["slug"]
        if args.only and slug != args.only:
            continue
        if slug in credits and not args.force:
            continue
        wiki = pl.get("wiki")
        if not wiki:
            rejected.append((slug, "no wiki title"))
            continue
        fn = lead_image_file(wiki)
        time.sleep(1.0)
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
        artist = strip_html((ext.get("Artist") or {}).get("value", "")) or "Unknown"
        credits[slug] = {
            "photo": f"/img/us/sf/places/{slug}.jpg",
            "source": "Wikimedia Commons",
            "file": f"File:{fn}",
            "file_url": ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{fn}",
            "license": lic[0],
            "license_url": lic[1],
            "author": artist,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        accepted.append(slug)
        print(f"✓ {slug:38} {lic[0][:24]:24} {artist[:32]}")

    (OUT / "_photo_credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))
    print(f"\n{len(accepted)} photos accepted, {len(rejected)} rejected.")
    for slug, why in rejected:
        print(f"  ✗ {slug:38} {why}")
    print(f"\nCredits → {OUT / '_photo_credits.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
