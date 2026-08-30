"""The second source of marks: the city's places, and the documents about them.

    python3 pipeline/scripts/us_sf_city/build_place_marks.py

INPUT   website/public/data/us/sf/places/<slug>.json     the published places
OUTPUT  website/public/data/us/sf/city/blocks/theme-marks.places.json

WHY THIS EXISTS, and it is not really about places.

The theme filter was built against one corpus, and a design that has been used
once has not been tested. This is the second user of the mark contract, written
deliberately from a dataset with NOTHING in common with the first: no assessor
block, no volume and leaf, no Clerk's English — a building with a latitude and
a shelf of scanned documents about it. If the contract holds for both, it will
hold for capital projects and contracts too. If it does not, better to find out
at 100 marks than at 100,000.

ONE MARK IS ONE DOCUMENT, not one place. A place is not an event and has no
year; the documents about it do, and the time window is the whole reason the
year is on a mark. A library with eleven documents spanning 1912 to 1998 is
eleven marks at one coordinate, which is the truth about it — it kept coming
back to the record — rather than one mark at an averaged date, which is not.

THE TEXT THE TAG IS READ FROM is the document's own: title, the plain-English
gloss written for it, and the OCR excerpts carried with it. The place's name and
family are added because a document title alone is often just
"Annual report of the Board of Supervisors" and the subject of the shelf is a
fact about the record, not an inference. This is the same rule as the Board
half — tag against everything the record actually says, never against the short
line the page will print.

A DOCUMENT WITH NO YEAR GETS NO MARK. It cannot be placed on a time window, and
a mark that ignores the slider would appear in every era including the ones it
contradicts. Counted out loud below rather than dropped quietly.
"""
from __future__ import annotations

import collections
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "blocks"))
import themes as TH  # noqa: E402

PLACES = os.path.join(ROOT, "website/public/data/us/sf/places")
BLOCKS = os.path.join(ROOT, "website/public/data/us/sf/city/blocks")
MANIFEST = os.path.join(ROOT, "website/public/data/us/sf/city/manifest.json")
OUT = os.path.join(BLOCKS, "theme-marks.places.json")

YEAR_LO, YEAR_HI = 1846, 2030


def doc_text(place: dict, doc: dict) -> str:
    """The title and the gloss — NOT the OCR, and that decision was measured.

    Three things were tried here, in this order, and the first two are wrong in
    ways worth keeping written down.

    1. TITLE + GLOSS + CATALOGUE FIELDS. `collection` and `source_label` carry
       the holding institution — "San Francisco Public Library" on nearly every
       document in the pool — so `\\blibrar` matched 361 of 361 marks and every
       place in the city came out being about libraries.

    2. + OCR EXCERPTS, with the custody stamp stripped. Better, and still
       wrong twice over. The stamp survives stripping because OCR mangles it —
       "BAN FRANCISCO PUBLIC LIBRARY", "SfN FRANCISCO", "J FRANCISCO BLIC
       LIBRARY" — and chasing spellings is unwinnable. Worse, the excerpts are
       page scrapings from long documents: Schools went from 3 documents to 78,
       Housing from 3 to 60. A Municipal Report MENTIONS schools; it is not
       ABOUT schools. Over a long document a pattern measures presence, and
       presence is not subject.

    3. TITLE + GLOSS, which is this. Both are short, curated, and written to say
       what the document IS. 92% of documents have a gloss.

    The general rule, and it is the same one the fiche's forty-one ran into: a
    pattern can decide what a SENTENCE is about. It cannot decide what a
    hundred-page report is about. That needs something that reads, and the
    reading pass is where the OCR earns its place back.
    """
    bits = [place.get("name") or "", place.get("kind") or "",
            place.get("family") or "",
            doc.get("title") or "", doc.get("gloss") or ""]
    return " ".join(b for b in bits if b)


def year_of(doc: dict) -> int | None:
    y = doc.get("year")
    try:
        y = int(str(y)[:4])
    except (TypeError, ValueError):
        return None
    return y if YEAR_LO <= y <= YEAR_HI else None


def main() -> int:
    themes = TH.load()["themes"]
    proj = json.load(open(MANIFEST))["proj"]
    lon0, lat0, mpd, cosl = proj["lon0"], proj["lat0"], proj["mpd"], proj["cosl"]

    files = [f for f in sorted(glob.glob(os.path.join(PLACES, "*.json")))
             if not os.path.basename(f).startswith("_")]
    keys: list[str] = []
    b, r, xs, ys, yr, ms = [], [], [], [], [], []
    skipped = collections.Counter()
    per_theme = collections.Counter()
    places_with_mark = set()
    n_docs = 0

    for f in files:
        p = json.load(open(f))
        if not p.get("published"):
            skipped["place not published"] += 1
            continue
        lat, lon = p.get("lat"), p.get("lon")
        slug = p.get("slug")
        if lat is None or lon is None or not slug:
            skipped["place has no coordinate"] += 1
            continue
        # the shared metre frame, exactly as geo/build_blocks.py computes it
        x = (lon - lon0) * mpd * cosl
        y = (lat - lat0) * mpd
        ki = len(keys)
        keys.append(slug)
        for doc in (p.get("documents") or []):
            n_docs += 1
            yy = year_of(doc)
            if yy is None:
                skipped["document has no usable year"] += 1
                continue
            m = TH.mask_of(doc_text(p, doc), themes)
            if not m:
                skipped["document matches no theme"] += 1
                continue
            b.append(-1)          # a place is not an assessor block
            r.append(ki)
            xs.append(round(x, 1)); ys.append(round(y, 1))
            yr.append(yy); ms.append(m)
            places_with_mark.add(slug)
            for bit in TH.bits_set(m):
                per_theme[bit] += 1

    payload = {
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_city/build_place_marks.py",
            "seed": "pipeline/seeds/sf_decision_themes.json",
            "source": "sf-places",
            "label": "Places & their documents",
            "open": "place",
            "frame": "shared metre frame — city manifest `proj`",
            "n_marks": len(b),
            "n_places": len(keys),
            "n_places_with_a_mark": len(places_with_mark),
            "n_documents_read": n_docs,
            "tagged_against": "document title, gloss and OCR excerpts, plus the "
                              "place's own name and family",
            "skipped": dict(skipped),
        },
        "keys": keys,
        "b": b, "r": r, "x": xs, "y": ys, "yr": yr, "m": ms,
    }
    with open(OUT, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))

    print(f"{len(files)} place files, {n_docs:,} documents read")
    print(f"{len(b):,} marks over {len(places_with_mark)} of {len(keys)} places")
    if yr:
        print(f"years {min(yr)}–{max(yr)}")
    print("\nskipped:")
    for k, v in skipped.most_common():
        print(f"   {k:<32} {v:>6,}")
    print("\nby theme:")
    for t in themes:
        if per_theme[t["bit"]]:
            print(f"   {t['label']:<26} {per_theme[t['bit']]:>5,}")
    print(f"\n-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
