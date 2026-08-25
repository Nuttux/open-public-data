"""THE PAGE ITSELF, CROPPED TO THE LINE THAT IS CITED, FOR THREE OF THE ELEVEN.

Daniel, on the shipped cut:

    "some shots i litterally want the page to be there in the film with the
     relevant sentence or paragraph highlighted"

So this is not a citation and not an impression of a document. It is the scanned
leaf, cropped to the text column, at a scale a reader can READ, with the cited
run of words marked on it.

── WHAT IS THE RECORD HERE AND WHAT IS A DRAWING DECISION ────────────────────

THE RECORD    the page image, `archive.org/download/<item>/page/n<leaf>.jpg`,
              and the word boxes in `<item>_djvu.xml`. Both are the Internet
              Archive's own derivatives of the Board's own printed volume, and
              the JPEG comes back at exactly the DjVu page's pixel dimensions,
              so a word box needs no scaling at all.
THE DRAWING   which run of words is marked, how much of the page is cropped
              around it, and the JPEG quality. Nothing here rewrites, retypes or
              re-flows a single word of the page.

── THE LEAF IS FOUND AND THEN PROVED, BECAUSE THE OBVIOUS RULE IS WRONG ──────

The DjVu page suffix is NOT the BookReader leaf, and the offset between them is
not the same from one item to the next. Measured, by fetching the images and
reading them:

    excerptsfromsanf1908sanf   djvu 0009  ->  n6     offset 3
    journalofproceed37sanfrich djvu 0716  ->  n713   offset 3
    journalofproceed54sanfrich djvu 0058  ->  n55    offset 3   (proved below)

Three items agree on 3 today, and `_scandata.xml`'s own `leafNum` minus its
`Delete` leaves agrees with two of the three and is one out on the first. So no
arithmetic here is trusted. The leaf is SEARCHED for in the volume's OCR, an
offset is guessed, and then **the fetched image is proved against the OCR's own
line positions** before anything is cropped: the rows of dark pixels in the JPEG
have to land where the word boxes say the lines are. A wrong leaf scores near
zero and the script exits. `match_rows` is the whole of that argument.

`build_film_twelve.py` cites the leaf its `entries/` beat starts on, which for a
multi-page item of business can be the leaf the session opens on rather than the
leaf the resolution is printed on — shot 7's beat starts at n48, the debate, and
the adoption is printed nine leaves later. That is a property of the corpus, not
an error in the citation, which is why the scan carries its own leaf and its own
link and never overwrites the shot's.

    python3 pipeline/scripts/us_sf_city/build_film_scans.py

Writes `website/public/data/us/sf/city/film/scans/*.jpg` and `scans.json`.
"""

from __future__ import annotations

import html
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CACHE = os.path.join(ROOT, "pipeline", "cache", "ia_pages")
OUT = os.path.join(ROOT, "website", "public", "data", "us", "sf", "city", "film", "scans")

# ── the three shots, and why each of them and not the others ────────────────
#
# NIGHT3 asked for this on three or four shots and NEVER on all eleven, "where
# it becomes furniture". The three are the shots where the DOCUMENT is the
# moment rather than evidence for it:
#
#   1  the fire  — opening on a scan says in the film's first seconds that all
#                  of this comes out of the city's own records, instead of
#                  asserting it in a sentence.
#   5  Japantown — nothing anyone could write is as damning as the page. The
#                  Board's own committee, three weeks after the removal, naming
#                  the emptied district by its four streets.
#   7  freeways  — one page that decided what the city looks like.
#
# The bridges and the Pyramid get none: the map is the evidence there.
#
# `find` is the run of words that must be on the page — the same string
# `build_film_twelve.py` already gates the shot on, where there is one, so the
# two files cannot drift apart silently. `marks` are the runs drawn on the
# crop. `alt` DESCRIBES the picture; it is never the quotation, because the
# narration is our one sentence and no archival quotation is ever text a reader
# is asked to read (NIGHT3 §"THE NARRATION IS OUR SENTENCE").
SCANS: list[dict] = [
    dict(
        n=1,
        item="excerptsfromsanf1908sanf",
        find="The fire burned continuously during Wednesday and Thursday",
        marks=[
            "The fire burned continuously during Wednesday and Thursday "
            "(when its main progress was checked), and to a small extent on "
            "Friday and Saturday, April 18-21, 1906.",
        ],
        vol="San Francisco Municipal Reports, 1906-07",
        page="703",
        when="General History",
        alt="The city's own account of the fire, printed in the Municipal "
            "Reports, with the sentence that gives its length marked.",
    ),
    dict(
        n=5,
        item="journalofproceed37sanfrich",
        find="Urged to Effectuate Slum Clearance in Japanese Quarter",
        marks=[
            "National Housing Agency and Home Owners Loan Corporation "
            "Urged to Effectuate Slum Clearance in Japanese Quarter.",
            "ELLIS, CALIFORNIA, GOUGH AND FILLMORE STREETS",
        ],
        vol="Journal of Proceedings, vol. 37",
        page="676",
        when="20 April 1942",
        alt="The Board's own printed page for 20 April 1942, with the "
            "committee's heading and the four streets it names marked.",
    ),
    dict(
        n=7,
        item="journalofproceed54sanfrich",
        find="Adopted, as amended, by the following vote",
        find_near="Declaring Opposition to the Construction of All Freeways",
        marks=[
            "Declaring Opposition to the Construction of All Freeways Contained "
            "in the Master Plan, Including the Western Freeway, the Junipero "
            "Serra Freeway, the Park-Presidio Freeway, the Golden Gate Free- "
            "way, the Crosstown Freeway, the Central Freeway From Turk Street "
            "to Its Connection With the Golden Gate Freeway, and the Mission "
            "Freeway From Thirteenth Street to Its Connection With the Southern "
            "Freeway, and Excepting the Hunter's Point Freeway, the Southern "
            "Freeway (Orizaba Avenue to the County Line), and the Embarcadero "
            "Freeway.",
            "Adopted, as amended, by the following vote:",
        ],
        vol="Journal of Proceedings, vol. 54",
        page="44",
        when="26 January 1959",
        alt="The page on which the Board struck seven freeways out of the "
            "master plan, with the resolution's heading and its adoption marked.",
    ),
]

# how much of the page is kept around the marks, as a fraction of the marked
# span's own height. Enough that the marked lines sit in a page and not in a
# vacuum; not so much that the type stops being readable in a 460 px panel.
PAD_TOP = 0.10
PAD_BOTTOM = 0.14
# the crop never gets narrower than this fraction of the page width, so a
# one-line mark still reads as a page rather than as a ransom note
MIN_W_FRAC = 0.86
# and never shorter than this fraction of the page height: a four-line mark
# cropped to four lines is a pull-quote, and a pull-quote is not a page
MIN_H_FRAC = 0.42
JPEG_Q = 82


def norm(s: str) -> str:
    """The comparison space. OCR breaks words across lines with a hyphen and
    prints its own dashes and quotes; nothing here changes a letter."""
    s = html.unescape(s)
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = re.sub(r"[‐-―]", "-", s)
    s = re.sub(r"-\s+", "", s)          # a word split across a line break
    s = re.sub(r"[^A-Za-z0-9'\"$.,;:()/&-]+", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


class Page:
    """One leaf's words, each with the box the OCR gives it."""

    def __init__(self, suffix: str, w: int, h: int, words: list[tuple[str, tuple[int, int, int, int]]]):
        self.suffix = suffix
        self.w = w
        self.h = h
        self.words = words
        self.text = norm(" ".join(t for t, _ in words))
        self.leaf = -1          # filled in by `resolve_leaf`, never assumed

    def rows(self) -> list[tuple[int, int]]:
        """The page's own text lines as [top, bottom) bands, merged out of the
        word boxes. This is what a candidate image is proved against."""
        bands: list[list[int]] = []
        for _, c in sorted(self.words, key=lambda w: min(w[1][1], w[1][3])):
            T, B = min(c[1], c[3]), max(c[1], c[3])
            if bands and T <= bands[-1][1]:
                bands[-1][1] = max(bands[-1][1], B)
            else:
                bands.append([T, B])
        return [(a, b) for a, b in bands if b > a]


def pages(item: str):
    """Stream the volume's DjVuXML page by page. The 1942 volume is 61 MB and
    there is no reason to hold it all."""
    path = os.path.join(CACHE, f"{item}.djvu.xml")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        url = f"https://archive.org/download/{item}/{item}_djvu.xml"
        print(f"  fetching {url}", flush=True)
        urllib.request.urlretrieve(url, path)
    blob = open(path, encoding="utf-8", errors="replace").read()
    for m in re.finditer(
        r'<OBJECT[^>]*usemap="[^"]*_(\d+)\.djvu"[^>]*width="(\d+)" height="(\d+)"[^>]*>(.*?)</OBJECT>',
        blob, re.S,
    ):
        words = [
            (html.unescape(t), tuple(int(v) for v in c.split(",")))
            for c, t in re.findall(r'<WORD coords="([\d,]+)"[^>]*>(.*?)</WORD>', m.group(4), re.S)
        ]
        yield Page(m.group(1), int(m.group(2)), int(m.group(3)), words)


def find_run(pg: Page, phrase: str) -> tuple[int, int] | None:
    """The [i, j) span of words whose joined text contains `phrase`. Walks
    forward from each start rather than matching a regex over the page, because
    the box of the FIRST and LAST word is what the mark is drawn from."""
    want = norm(phrase)
    if want not in pg.text:
        return None
    n = len(pg.words)
    for i in range(n):
        acc = ""
        for j in range(i, min(n, i + 220)):
            acc = norm(acc + " " + pg.words[j][0])
            if acc == want or acc.startswith(want):
                return (i, j + 1)
            if len(acc) > len(want) + 4:
                break
    return None


def boxes(pg: Page, i: int, j: int) -> list[tuple[int, int, int, int]]:
    """One box per LINE of the run — the OCR gives left/bottom/right/top per
    word, so a run that wraps needs one rectangle a line or the mark becomes a
    single block over the whole paragraph including its margins."""
    out: list[list[int]] = []
    for _, (x1, y1, x2, y2) in pg.words[i:j]:
        L, R, T, B = min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)
        if out and T < out[-1][3] - (B - T) * 0.35:
            out[-1][0] = min(out[-1][0], L)
            out[-1][1] = min(out[-1][1], T)
            out[-1][2] = max(out[-1][2], R)
            out[-1][3] = max(out[-1][3], B)
        else:
            out.append([L, T, R, B])
    return [tuple(b) for b in out]


def snap(pg: Page, y: int, way: str) -> int:
    """Move `y` to the nearest white space between two of the page's own text
    lines. Nothing is invented: the bands come from the word boxes."""
    bands = pg.rows()
    for T, B in bands:
        if T < y < B:
            return max(0, T - 6) if way == "up" else min(pg.h, B + 6)
    return y


def image(item: str, leaf: int) -> Image.Image:
    path = os.path.join(CACHE, f"{item}-n{leaf}.jpg")
    if not os.path.exists(path):
        url = f"https://archive.org/download/{item}/page/n{leaf}.jpg"
        print(f"  fetching {url}", flush=True)
        with urllib.request.urlopen(url, timeout=180) as r:
            open(path, "wb").write(r.read())
    return Image.open(path).convert("RGB")


def match_rows(im: Image.Image, pg: Page) -> float:
    """How well an image's INK lines up with where the OCR says this page's text
    lines are. 1.0 is perfect agreement, 0 is none.

    This exists because no arithmetic maps a DjVu page suffix to a BookReader
    leaf reliably — see the header. It is deliberately crude and therefore hard
    to fool: it asks only whether the dark rows of the JPEG fall inside the word
    boxes' own row bands. A neighbouring leaf of the same book, set in the same
    type at the same measure, still scores far below the right one, because the
    LINES of two different pages do not coincide."""
    if im.size != (pg.w, pg.h):
        return 0.0
    g = im.convert("L").resize((64, pg.h))          # collapse each row to 64 px
    px = g.load()
    dark = [sum(1 for x in range(64) if px[x, y] < 150) for y in range(pg.h)]
    total = sum(dark)
    if total == 0:
        return 0.0
    inside = 0
    for T, B in pg.rows():
        inside += sum(dark[max(0, T):min(pg.h, B)])
    return inside / total


def resolve_leaf(item: str, pg: Page, guess: int) -> int:
    """The BookReader leaf this DjVu page is, proved rather than computed."""
    scores: list[tuple[float, int]] = []
    for n in sorted(range(guess - 4, guess + 5), key=lambda k: abs(k - guess)):
        if n < 0:
            continue
        try:
            s = match_rows(image(item, n), pg)
        except Exception as e:                       # a leaf that does not exist
            print(f"    n{n}: {str(e)[:40]}", flush=True)
            continue
        scores.append((s, n))
        print(f"    n{n}: rows {s:.3f}", flush=True)
        if s > 0.97:
            break
    if not scores:
        sys.exit(f"  no leaf image near n{guess}")
    scores.sort(reverse=True)
    best, second = scores[0], (scores[1] if len(scores) > 1 else (0.0, -1))
    if best[0] < 0.90 or best[0] - second[0] < 0.10:
        sys.exit(f"  leaf not proved: best n{best[1]} {best[0]:.3f}, "
                 f"next n{second[1]} {second[0]:.3f}")
    return best[1]


def build(spec: dict) -> dict:
    item = spec["item"]
    print(f"shot {spec['n']} · {item}", flush=True)
    hits = []
    for pg in pages(item):
        if norm(spec["find"]) in pg.text:
            if "find_near" in spec and norm(spec["find_near"]) not in pg.text:
                continue
            hits.append(pg)
    if len(hits) != 1:
        sys.exit(f"  shot {spec['n']}: {len(hits)} leaves carry {spec['find']!r} "
                 f"({[p.leaf for p in hits]}). Refusing to guess.")
    pg = hits[0]
    # the guess, and the only place the offset appears at all. It is proved
    # immediately below and the script exits if it cannot be.
    pg.leaf = resolve_leaf(item, pg, int(pg.suffix) - 3)
    print(f"  djvu {pg.suffix} -> leaf n{pg.leaf} · page {pg.w}x{pg.h}", flush=True)

    marks: list[tuple[int, int, int, int]] = []
    for phrase in spec["marks"]:
        run = find_run(pg, phrase)
        if run is None:
            sys.exit(f"  shot {spec['n']}: leaf {pg.leaf} does not carry {phrase[:60]!r}")
        marks += boxes(pg, *run)

    L = min(b[0] for b in marks)
    R = max(b[2] for b in marks)
    T = min(b[1] for b in marks)
    B = max(b[3] for b in marks)
    span = B - T
    # the crop's own column: the marks' own extent, widened to the page's text
    # column so the surrounding paragraphs are whole lines and not stubs
    colL = min([min(c[0], c[2]) for _, c in pg.words] + [L])
    colR = max([max(c[0], c[2]) for _, c in pg.words] + [R])
    want_w = max((colR - colL), int(pg.w * MIN_W_FRAC))
    cx = (L + R) / 2
    x0 = int(max(0, min(pg.w - want_w, cx - want_w / 2)))
    x1 = int(min(pg.w, x0 + want_w))
    y0 = int(max(0, T - span * PAD_TOP))
    y1 = int(min(pg.h, B + span * PAD_BOTTOM))
    if y1 - y0 < pg.h * MIN_H_FRAC:
        grow = (pg.h * MIN_H_FRAC - (y1 - y0)) / 2
        y0, y1 = int(max(0, y0 - grow)), int(min(pg.h, y1 + grow))
    # snap both edges into the GAP between two printed lines, so the crop never
    # opens or closes on a row of half-letters
    y0, y1 = snap(pg, y0, "up"), snap(pg, y1, "down")

    im = image(item, pg.leaf)
    crop = im.crop((x0, y0, x1, y1))
    os.makedirs(OUT, exist_ok=True)
    name = f"shot-{spec['n']:02d}.jpg"
    crop.save(os.path.join(OUT, name), quality=JPEG_Q, optimize=True, progressive=True)
    kb = os.path.getsize(os.path.join(OUT, name)) / 1024
    print(f"  crop {crop.size} -> {name} {kb:.0f} kB", flush=True)

    cw, ch = crop.size
    return dict(
        n=spec["n"],
        src=f"/data/us/sf/city/film/scans/{name}",
        w=cw, h=ch,
        item=item, leaf=pg.leaf,
        url=f"https://archive.org/details/{item}/page/n{pg.leaf}/mode/1up",
        vol=spec["vol"], page=spec["page"], when=spec["when"], alt=spec["alt"],
        # fractions of the CROP, so the film draws the marks without knowing
        # anything about the page they came off
        hl=[dict(x=(b[0] - x0) / cw, y=(b[1] - y0) / ch,
                 w=(b[2] - b[0]) / cw, h=(b[3] - b[1]) / ch) for b in marks],
    )


def main() -> None:
    out = [build(s) for s in SCANS]
    path = os.path.join(OUT, "..", "scans.json")
    with open(os.path.normpath(path), "w") as f:
        json.dump({"meta": {"source": "Internet Archive page images and OCR word "
                                      "boxes; leaf found by searching the volume"},
                   "scans": out}, f, indent=1)
        f.write("\n")
    print(f"wrote {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
