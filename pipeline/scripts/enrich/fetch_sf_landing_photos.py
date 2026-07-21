#!/usr/bin/env python3
"""Fetch cleanly-licensed lead photos for the SF landing deck's civic subjects.

Same strict gate as fetch_sf_place_photos.py: resolve each subject's Wikipedia
lead image, ACCEPT only Wikimedia Commons CC / verified public domain, record
credit + licence per photo, never invent a credit. A subject with no free image
is simply reported as rejected (the gate working) so we can pick another.

Output: website/public/img/us/sf/landing/<slug>.jpg
        website/public/data/us/sf/landing/_photo_credits.json
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

# Reuse the vetted Commons helpers verbatim.
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_sf_place_photos import (  # noqa: E402
    lead_image_file,
    image_meta,
    classify_license,
    download,
    strip_html,
)

IMG_DIR = ROOT / "website" / "public" / "img" / "us" / "sf" / "landing"
OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "landing"

# Candidate civic subjects for the deck. We fetch all that resolve to a free
# image, then wire the winners into the adapter.
SUBJECTS = [
    {"slug": "zsfg", "wiki": "San Francisco General Hospital"},
    {"slug": "zsfg", "wiki": "Priscilla Chan and Mark Zuckerberg San Francisco General Hospital and Trauma Center"},
    {"slug": "city-hall", "wiki": "San Francisco City Hall"},
    {"slug": "sfo", "wiki": "San Francisco International Airport"},
]


def main() -> int:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    credits = {}
    if (OUT / "_photo_credits.json").exists():
        credits = json.loads((OUT / "_photo_credits.json").read_text())
    accepted, rejected = [], []
    for s in SUBJECTS:
        slug, wiki = s["slug"], s["wiki"]
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
            "photo": f"/img/us/sf/landing/{slug}.jpg",
            "source": "Wikimedia Commons",
            "file": f"File:{fn}",
            "file_url": ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{fn}",
            "license": lic[0],
            "license_url": lic[1],
            "author": artist,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        accepted.append(slug)
        print(f"✓ {slug:24} {lic[0][:24]:24} {artist[:36]}")

    (OUT / "_photo_credits.json").write_text(json.dumps(credits, indent=1, ensure_ascii=False))
    print(f"\n{len(accepted)} accepted, {len(rejected)} rejected.")
    for slug, why in rejected:
        print(f"  ✗ {slug:24} {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
