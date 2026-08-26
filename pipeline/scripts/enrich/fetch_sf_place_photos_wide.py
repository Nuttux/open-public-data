#!/usr/bin/env python3
"""Fill the SF place photo gaps from a wider source ladder — DEV BUILD ONLY.

fetch_sf_place_photos.py is the licence-clean path: Wikipedia lead image or a
Commons file, free licence verified, credit recorded. It leaves most of the
ordinary civic estate without a photo, because a branch library or a fire
station is not its own Wikipedia article. This script fills those gaps so the
fiches can be looked at during development, trying three sources in order:

  1. commons      — Wikimedia Commons search, free licence VERIFIED. Same gate
                    as the clean path, looser name matching.
  2. openverse    — api.openverse.org, the CC aggregator (Flickr, museums…).
                    Licence comes from the record and is kept, so these are
                    verified too, though the licence still has to be honoured
                    (attribution) before anything ships.
  3. web-search   — DuckDuckGo image results. NO LICENCE. Marked
                    license_verified=false and provisional=true.

EVERY photo this script writes carries `resolved_via`, `license_verified` and
`provisional`, so an unlicensed dev placeholder can never be mistaken for a
cleared one:

    python pipeline/scripts/enrich/fetch_sf_place_photos_wide.py --report
    → lists exactly what must be replaced or cleared before launch.

`--purge-provisional` removes them again in one step. Nothing here overwrites a
photo that the licence-clean path already accepted.

A place's own name must appear in the candidate's title/filename, and San
Francisco must appear somewhere in its metadata, title or URL — the guards that
keep the Japan Mint off "Old Mint" and a Lotus Esprit off "Esprit Park".

Usage:
    python pipeline/scripts/enrich/fetch_sf_place_photos_wide.py            # fill gaps
    python pipeline/scripts/enrich/fetch_sf_place_photos_wide.py --only old-mint
    python pipeline/scripts/enrich/fetch_sf_place_photos_wide.py --report
    python pipeline/scripts/enrich/fetch_sf_place_photos_wide.py --purge-provisional
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_sf_place_photos import (  # noqa: E402
    COMMONS_API, api, classify_license, commons_candidates, commons_file_is_sf,
    image_meta, strip_html, _name_tokens, _norm_name, _TYPE_WORDS,
)

SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
IMG_DIR = ROOT / "website" / "public" / "img" / "us" / "sf" / "places"
# Category E side-channel cache (per-record photo credits, no metric) — lives
# under public/data/enrichment/ per docs/data-platform/04 §4.2.
OUT = ROOT / "website" / "public" / "data" / "enrichment" / "us_sf_places"
CREDITS = OUT / "_photo_credits.json"

BROWSER_UA = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
}
OPENVERSE = "https://api.openverse.org/v1/images/"

MIN_WIDTH = 600          # below this it is a thumbnail, not a lead photo
MIN_BYTES = 12_000
SLEEP = 1.0

# The city's own sites and the usual civic photo hosts. A photo of a branch
# library on sfpl.org is far more likely to be that branch than a stock-photo
# aggregator's guess, so these sort first.
PREFERRED_HOSTS = (
    "sfpl.org", "sfpublicworks.org", "sfrecpark.org", "sf.gov", "sfmta.com",
    "sfport.com", "sfdph.org", "sf-fire.org", "sfwater.org", "sfgov.org",
    "wikimedia.org", "staticflickr.com", "loc.gov", "nps.gov",
)
SF_HINT = re.compile(r"san\s*francisco|\bsf\b|sfpl|sfmta|sfgov", re.I)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        return None


def http(url: str, referer: str | None = None, timeout: int = 30) -> bytes:
    h = dict(BROWSER_UA)
    if referer:
        h["Referer"] = referer
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
        return r.read()


def place_tokens(name: str) -> list[str]:
    """Words that identify the place. Unlike the clean path's rule, NUMBERS are
    kept: "Fire Station #13" has no distinctive word at all once "fire" and
    "station" are recognised as type words, so every fire station matched
    nothing. The number is the whole identity of a fire station."""
    out = []
    for t in _norm_name(name).split():
        if t.isdigit() or (len(t) > 2 and t not in {"the", "of", "and", "san", "francisco", "sf"}):
            out.append(t)
    return out


def title_names_place(title: str, place_name: str) -> bool:
    """The candidate's own title must carry the place's distinctive words, plus
    one of its type words when it has any."""
    words = set(_norm_name(title).split())
    toks = place_tokens(place_name)
    distinctive = [t for t in toks if t not in _TYPE_WORDS]
    types = [t for t in toks if t in _TYPE_WORDS]
    if not distinctive or not all(t in words for t in distinctive):
        return False
    return not types or bool(words & set(types))


def usable_image(data: bytes) -> tuple[bool, str]:
    if len(data) < MIN_BYTES:
        return False, f"too small ({len(data)}B)"
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        im.verify()
        w, h = im.size
        if w < MIN_WIDTH:
            return False, f"too narrow ({w}px)"
        return True, f"{w}x{h}"
    except Exception as e:  # noqa: BLE001
        return False, f"unreadable ({e})"


def save_jpeg(data: bytes, dest: Path) -> bool:
    """Normalise to real JPEG bytes — the fiche path ends in .jpg and a PNG or
    WebP saved under that name is served with the wrong content type."""
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        im.save(dest, "JPEG", quality=88, optimize=True)
        return True
    except Exception:  # noqa: BLE001
        return False


# ── source 1: Wikimedia Commons (licence verified) ───────────────────────────

def try_commons(place: dict) -> dict | None:
    for q in [place["name"], *(place.get("aliases") or [])[:2]]:
        for fn in commons_candidates(q, limit=10):
            if not title_names_place(fn, place["name"]):
                continue
            ii = image_meta(fn)
            time.sleep(0.5)
            if not ii or not commons_file_is_sf(fn, ii):
                continue
            lic = classify_license(ii.get("extmetadata") or {})
            if not lic:
                continue
            url = ii.get("thumburl") or ii.get("url")
            if not url:
                continue
            ext = ii.get("extmetadata") or {}
            return {
                "url": url,
                "source": "Wikimedia Commons",
                "source_url": ii.get("descriptionurl") or
                              f"https://commons.wikimedia.org/wiki/File:{fn}",
                "license": lic[0], "license_url": lic[1],
                "license_verified": True,
                "author": strip_html((ext.get("Artist") or {}).get("value", "")) or "Unknown",
                "resolved_via": "commons",
            }
        time.sleep(SLEEP)
    return None


# ── source 2: Openverse (CC aggregator, licence from the record) ─────────────

def try_openverse(place: dict) -> dict | None:
    q = urllib.parse.quote(f"{place['name']} San Francisco")
    try:
        raw = http(f"{OPENVERSE}?q={q}&page_size=12&license_type=all")
    except Exception:  # noqa: BLE001
        return None
    try:
        results = json.loads(raw).get("results") or []
    except Exception:  # noqa: BLE001
        return None
    for r in results:
        title = r.get("title") or ""
        if not title_names_place(title, place["name"]):
            continue
        blob = f"{title} {r.get('foreign_landing_url','')} {r.get('source','')}"
        if not SF_HINT.search(blob):
            continue
        url = r.get("url")
        if not url:
            continue
        lic = (r.get("license") or "").upper()
        ver = r.get("license_version") or ""
        # NC (non-commercial) and ND (no-derivatives) are Creative Commons but
        # NOT free for this use — the licence-clean path rejects them outright.
        # Recorded, kept for the dev build, and flagged so the launch review
        # sees them next to the unlicensed ones rather than among the cleared.
        restricted = ("NC" in lic.split("-")) or ("ND" in lic.split("-"))
        return {
            "url": url,
            "source": f"Openverse ({r.get('source') or 'unknown'})",
            "source_url": r.get("foreign_landing_url") or url,
            "license": f"{lic} {ver}".strip() or "CC (unspecified)",
            "license_url": r.get("license_url") or "",
            "license_verified": bool(lic) and not restricted,
            "author": r.get("creator") or "Unknown",
            "resolved_via": "openverse",
        }
    return None


# ── source 3: web image search (NO LICENCE — provisional) ────────────────────

def ddg_images(query: str) -> list[dict]:
    try:
        html = http("https://duckduckgo.com/?q=" + urllib.parse.quote(query)
                    + "&iax=images&ia=images").decode("utf-8", "replace")
        m = re.search(r'vqd=["\']?([\d-]+)["\']?', html)
        if not m:
            return []
        time.sleep(SLEEP)
        u = (f"https://duckduckgo.com/i.js?l=us-en&o=json&q={urllib.parse.quote(query)}"
             f"&vqd={m.group(1)}&f=,,,&p=1")
        return json.loads(http(u, referer="https://duckduckgo.com/")
                          .decode("utf-8", "replace")).get("results") or []
    except Exception:  # noqa: BLE001
        return []


def try_web(place: dict) -> dict | None:
    results = ddg_images(f"{place['name']} San Francisco")
    if not results:
        return None

    def rank(r: dict) -> tuple:
        host = urllib.parse.urlparse(r.get("image") or "").netloc.lower()
        pref = next((i for i, h in enumerate(PREFERRED_HOSTS) if h in host), len(PREFERRED_HOSTS))
        return (pref, -(r.get("width") or 0))

    for r in sorted(results, key=rank):
        title = r.get("title") or ""
        img = r.get("image") or ""
        if not title_names_place(title, place["name"]) and \
                not title_names_place(urllib.parse.unquote(img), place["name"]):
            continue
        if not SF_HINT.search(f"{title} {img} {r.get('url','')}"):
            continue
        if (r.get("width") or 0) and r["width"] < MIN_WIDTH:
            continue
        return {
            "url": img,
            "source": urllib.parse.urlparse(img).netloc or "web",
            "source_url": r.get("url") or img,
            "license": "UNVERIFIED",
            "license_url": "",
            "license_verified": False,
            "author": r.get("source") or "Unknown",
            "resolved_via": "web-search",
        }
    return None


LADDER = (("commons", try_commons), ("openverse", try_openverse), ("web-search", try_web))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true",
                    help="re-resolve even places that already have a photo")
    ap.add_argument("--report", action="store_true",
                    help="list provisional / unlicensed photos and exit")
    ap.add_argument("--purge-provisional", action="store_true",
                    help="delete every provisional photo + credit and exit")
    ap.add_argument("--max-source", choices=[n for n, _ in LADDER], default="web-search",
                    help="stop the ladder at this source (e.g. 'openverse' to stay licensed)")
    args = ap.parse_args()

    credits = load(CREDITS) or {}

    if args.report:
        prov = {k: v for k, v in credits.items() if v.get("provisional")}
        clean = len(credits) - len(prov)
        print(f"{len(credits)} photos: {clean} licence-verified, {len(prov)} PROVISIONAL")
        for slug, c in sorted(prov.items()):
            print(f"  ! {slug:<44} {c.get('source','?')[:34]:<36} {c.get('source_url','')[:60]}")
        if prov:
            print("\nThese carry no verified licence and must be replaced or cleared "
                  "before the site goes live (--purge-provisional removes them).")
        return 0

    if args.purge_provisional:
        gone = 0
        for slug, c in list(credits.items()):
            if c.get("provisional"):
                (IMG_DIR / f"{slug}.jpg").unlink(missing_ok=True)
                del credits[slug]
                gone += 1
        CREDITS.write_text(json.dumps(credits, indent=1, ensure_ascii=False))
        print(f"Purged {gone} provisional photos; {len(credits)} licence-verified remain.")
        return 0

    seed = json.loads(SEED.read_text())
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    allowed = [n for n, _ in LADDER]
    allowed = allowed[: allowed.index(args.max_source) + 1]

    filled, failed = [], []
    for pl in seed["places"]:
        slug = pl["slug"]
        if args.only and slug != args.only:
            continue
        existing = credits.get(slug)
        if existing and not args.force:
            # A provisional placeholder is still a gap worth upgrading if a
            # licensed source can now answer for it.
            if not existing.get("provisional"):
                continue

        got = None
        for name, fn in LADDER:
            if name not in allowed:
                continue
            if existing and existing.get("provisional") and name == "web-search":
                break            # already have one of these; don't churn
            try:
                got = fn(pl)
            except Exception as e:  # noqa: BLE001
                print(f"  ~ {slug}: {name} failed ({e})", flush=True)
                got = None
            time.sleep(SLEEP)
            if got:
                break

        if not got:
            failed.append(slug)
            print(f"  ✗ {slug:<44} no candidate", flush=True)
            continue

        try:
            data = http(got["url"], timeout=60)
        except Exception as e:  # noqa: BLE001
            failed.append(slug)
            print(f"  ✗ {slug:<44} download failed ({e})", flush=True)
            continue
        ok, why = usable_image(data)
        if not ok:
            failed.append(slug)
            print(f"  ✗ {slug:<44} {why}", flush=True)
            continue
        if not save_jpeg(data, IMG_DIR / f"{slug}.jpg"):
            failed.append(slug)
            print(f"  ✗ {slug:<44} could not encode", flush=True)
            continue

        credits[slug] = {
            "photo": f"/img/us/sf/places/{slug}.jpg",
            "source": got["source"],
            "source_url": got["source_url"],
            "license": got["license"],
            "license_url": got.get("license_url", ""),
            "license_verified": got["license_verified"],
            "provisional": not got["license_verified"],
            "author": got["author"],
            "resolved_via": got["resolved_via"],
            "fetched_at": now_iso(),
        }
        filled.append(slug)
        flag = " " if got["license_verified"] else "!"
        print(f"  ✓{flag}{slug:<44} {got['resolved_via']:<12} {got['license'][:22]:<24} {why}",
              flush=True)
        CREDITS.write_text(json.dumps(credits, indent=1, ensure_ascii=False))

    prov = sum(1 for c in credits.values() if c.get("provisional"))
    print(f"\nFilled {len(filled)}, failed {len(failed)}. "
          f"{len(credits)} places have a photo ({len(credits) - prov} licence-verified, "
          f"{prov} PROVISIONAL).")
    if failed:
        print("no photo: " + ", ".join(failed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
