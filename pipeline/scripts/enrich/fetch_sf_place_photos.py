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
# Category E side-channel cache (per-record photo credits, no metric) — lives
# under public/data/enrichment/ per docs/data-platform/04 §4.2.
OUT = ROOT / "website" / "public" / "data" / "enrichment" / "us_sf_places"

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


# ── Commons search fallback ──────────────────────────────────────────────────
# The lead-image path needs a Wikipedia article, which the flagship places have
# and the ordinary civic estate does not: a branch library, a fire station or a
# rec centre is almost never its own article, so the places promoted from the
# facility registry could never clear the photo gate at all. Commons itself does
# hold photographs of them, catalogued by name. Searching Commons directly
# reaches those files while keeping the SAME licence gate — nothing is accepted
# here that would not have been accepted from a lead image.
#
# Two guards, because a wrong photograph on a civic fiche is a serious error:
#   - the FILE NAME must carry the place's own name (as a phrase, or all of its
#     significant words) — ranking high in the search is not evidence;
#   - the file's own metadata (name, categories, description) must say San
#     Francisco, so a "Fire Station 13" cannot arrive from another city.
SF_MENTION = re.compile(r"san\s*francisco", re.I)
_PHOTO_EXT = re.compile(r"\.(jpe?g|png)$", re.I)
_NAME_STOP = {"the", "of", "and", "a", "san", "francisco", "sf"}


def _norm_name(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def _name_tokens(s: str) -> list[str]:
    return [t for t in _norm_name(s).split() if t not in _NAME_STOP and len(t) > 2]


# Words that say what KIND of place it is. Commons files abbreviate the type
# ("Anza Branch (…).jpg" for the Anza Branch Library), so requiring every word
# of the name rejected real photographs; requiring the DISTINCTIVE words plus
# any one type word keeps "Anza Branch" and still refuses "Anza Street".
_TYPE_WORDS = {
    "branch", "library", "station", "center", "centre", "park", "pool", "hall",
    "museum", "theater", "theatre", "hospital", "clinic", "plaza", "square",
    "garden", "gardens", "recreation", "rec", "playground", "clubhouse",
    "firehouse", "fire", "police", "garage", "pier", "plant", "mint", "jail",
    "courthouse", "court", "gymnasium", "stadium", "conservatory", "complex",
}


def filename_names_place(filename: str, place_name: str) -> bool:
    fn_words = set(_norm_name(filename.rsplit(".", 1)[0]).split())
    nm = _norm_name(place_name)
    if nm and nm in " ".join(sorted(fn_words)):
        return True
    words = _name_tokens(place_name)
    distinctive = [t for t in words if t not in _TYPE_WORDS]
    types = [t for t in words if t in _TYPE_WORDS]
    if not distinctive:
        return False
    if not all(t in fn_words for t in distinctive):
        return False
    # A type word anchors the subject: without one, "Anza Street" would pass for
    # the Anza Branch Library on the strength of "anza" alone.
    return not types or bool(fn_words & set(types))


def commons_candidates(query: str, limit: int = 10) -> list[str]:
    # Plain name, NOT name + "San Francisco": the quoted city phrase drove real
    # matches to zero (Commons files are titled "Anza Branch (…)" with the city
    # only in the categories). Geography is enforced afterwards, on the file's
    # own metadata, where it is evidence rather than a search term.
    d = api(COMMONS_API, {
        "action": "query", "list": "search",
        "srsearch": query, "srnamespace": "6", "srlimit": str(limit),
    })
    out = []
    for hit in ((d.get("query") or {}).get("search") or []):
        title = hit.get("title") or ""
        if title.startswith("File:") and _PHOTO_EXT.search(title):
            out.append(title.split(":", 1)[1])
    # An exterior shot is the lead photo a reader expects of a civic building.
    out.sort(key=lambda t: (0 if "exterior" in t.lower() else
                            2 if "interior" in t.lower() else 1))
    return out


def commons_file_is_sf(filename: str, ii: dict) -> bool:
    """The file's own catalogue entry must name San Francisco."""
    ext = ii.get("extmetadata") or {}
    blob = " ".join([
        filename,
        strip_html((ext.get("ImageDescription") or {}).get("value", "")),
        strip_html((ext.get("Categories") or {}).get("value", "")),
        strip_html((ext.get("ObjectName") or {}).get("value", "")),
    ])
    return bool(SF_MENTION.search(blob))


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
    ap.add_argument("--commons-fallback", action="store_true",
                    help="when a place has no Wikipedia lead image, search Commons by name "
                         "(same licence gate, plus filename + San-Francisco metadata guards)")
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
        fn = ii = lic = None
        via = "wikipedia lead image"
        if wiki:
            fn = lead_image_file(wiki)
            time.sleep(1.0)
            if fn:
                ii = image_meta(fn)
                time.sleep(1.0)
                if ii:
                    lic = classify_license(ii.get("extmetadata") or {})
                    if not lic:
                        fn = ii = None      # non-free lead image — try Commons

        if not (fn and ii and lic) and args.commons_fallback:
            via = "commons search"
            queries = [pl["name"], *(pl.get("aliases") or [])[:2]]
            found = False
            for q in queries:
                for cand in commons_candidates(q):
                    if not filename_names_place(cand, pl["name"]):
                        continue
                    meta = image_meta(cand)
                    time.sleep(0.8)
                    if not meta or not commons_file_is_sf(cand, meta):
                        continue
                    cl = classify_license(meta.get("extmetadata") or {})
                    if not cl:
                        continue
                    fn, ii, lic, found = cand, meta, cl, True
                    break
                time.sleep(0.8)
                if found:
                    break

        if not fn:
            rejected.append((slug, "no wiki title / no candidate file"))
            continue
        if not ii:
            rejected.append((slug, "no imageinfo"))
            continue
        ext = ii.get("extmetadata") or {}
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
            "resolved_via": via,
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
