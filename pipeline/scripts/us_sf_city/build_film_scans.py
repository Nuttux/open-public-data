"""THE PAGE ITSELF, CROPPED TO THE LINE THAT IS CITED, FOR FOUR OF THE ELEVEN.

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

── AND A SECOND KIND OF RECORD, BECAUSE THE BOUND VOLUMES STOP IN 1998 ───────

Shot 11 is 2019 and there is no scanned volume to go to. THAT IS THE POINT of
putting a page on it: the film's closing argument is that the record does not
stop when the binding does. So this file now has two source kinds and they are
kept apart on purpose, because they are proved differently:

    `item`  an Internet Archive volume. Leaf found by search and PROVED against
            the OCR's own line positions (`resolve_leaf`).
    `pdf`   a PDF the city itself publishes. There is no leaf to find — a page
            is a page — so the proof moves to the MARK, and it is two-sided:
            the phrase has to be in an INDEPENDENT digital publication of the
            same instrument, and the marked rectangle has to read back as that
            phrase when it alone is re-read off the image. See `prove_pdf`.

Shot 11's page is the Clerk's own stamped copy of Ordinance No. 103-19, which
is a SCAN with no text layer, so its words are read with `tesseract` exactly as
the Internet Archive's are read with its own OCR. The mark is therefore placed
from an OCR box on both kinds of record, and on this one it is cross-checked
against the publisher's own machine-readable text, which the archive volumes
have no equivalent of.

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

import csv
import html
import io
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CACHE = os.path.join(ROOT, "pipeline", "cache", "ia_pages")
CACHE_PDF = os.path.join(ROOT, "pipeline", "cache", "sf_pdf")
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
#  11  the ban    — the modern bookend, and the film's closing argument made
#                   visible: the bound volumes stop in 1998 and the RECORD does
#                   not. One near the start, two through the middle, one at the
#                   close.
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
    # THE FIRE PAGE MOVED, AND WHY. It used to be p. 703, and its mark was the
    # sentence that dates the fire — the least interesting number in the line,
    # and one the narration already carries. Daniel approved moving it to the
    # FIRE DEPARTMENT'S own report in the same volume, four leaves of which
    # speak in the department's first person: "the buildings of the department
    # then consisted of 44 engine houses", "the members of this department, who
    # had been continuously on duty". One page carries both the sentence that
    # is the moment and the sentence that proves the line.
    dict(
        n=1,
        item="excerptsfromsanf1908sanf",
        find="but we were compelled to watch it burn and spread",
        marks=[
            # the department, in an official report, saying it stood and watched
            "but we were compelled to watch it burn and spread",
            # and the claim the narration makes, on the same page
            "The conflagration lasted for fully three days",
        ],
        vol="San Francisco Municipal Reports, 1906-07",
        page="721",
        when="General History",
        alt="The fire department's own account of April 1906, printed in the "
            "city's Municipal Reports, with two sentences marked.",
    ),
    dict(
        n=5,
        item="journalofproceed37sanfrich",
        find="Urged to Effectuate Slum Clearance in Japanese Quarter",
        # THE HEADING IS A FILING LABEL AND THE BODY IS THE THING. The first
        # version marked the committee's heading; Daniel read the page and said
        # so. What is marked now is the Board's own REASONING — the two clauses
        # of the "Whereas" that say what the clearance was for — plus the caps
        # line, which is kept because it is what the map draws beside it and the
        # two prove each other.
        #
        # THEY ARE TWO MARKS AND NOT ONE BAND, and that was checked rather than
        # assumed: `.parity/q2japan.py`'s sibling probe measures **59 words
        # between them**, so a single continuous band would run seven lines and
        # would also mark the sub-standard-level and military-housing passage,
        # which is a different claim.
        #
        # AND THE FIRST MARK STARTS AT THE SUBJECT. Daniel: *"you start the
        # highlight at 'the rehabilitation of the japanese quarter' otherwise
        # you say property prices raise but theres not the subject of the
        # sentence."* It began at the predicate; the marked span is now the
        # whole clause, subject and all, and it wraps two lines instead of one.
        #
        # `i'eal` and `quai'ter` are the SCAN'S OWN INK and not typos here. The
        # OCR reads "real" as "i'eal" and "quarter" as "quai'ter" on these
        # lines, `norm()` changes no letters by its own docstring, and
        # `find_run` matches the page. Corrected here they would not be found —
        # and the PICTURE shows the printed words either way, because the mark
        # is placed from the word BOX and not from the OCR's guess at letters.
        marks=[
            "the rehabilitation of the japanese quai'ter at this time "
            "would raise i'eal property values in that district",
            "and would at once remove an eyesore which has become so "
            "obnoxious as to be well nigh insupportable",
            "ELLIS, CALIFORNIA, GOUGH AND FILLMORE STREETS",
        ],
        vol="Journal of Proceedings, vol. 37",
        page="676",
        when="20 April 1942",
        alt="The Board's own printed page for 20 April 1942, with two clauses "
            "of the committee's reasoning and the four streets it names marked.",
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
        # CHECKED AGAINST THE SAME FAILURE SHOT 5 HAD, AND IT DOES NOT REPEAT.
        # The question was whether this shot is also marking a filing label
        # while the body says the real thing. It is not: **this leaf carries no
        # resolution body at all.** Its 456 words are the running head, an
        # unrelated Russian Hill item, the resolution's TITLE — which is the
        # operative text, naming seven freeways and striking them and excepting
        # three — the amendment motion, and the two votes. The "Whereas" body
        # is nine leaves earlier with the debate and the postponement (§28.4).
        # So the heading here is the fact, and the marks stand.
        vol="Journal of Proceedings, vol. 54",
        page="44",
        when="26 January 1959",
        alt="The page on which the Board struck seven freeways out of the "
            "master plan, with the resolution's heading and its adoption marked.",
    ),
    # THE ONE THAT IS NOT A BOUND VOLUME, and the reason it is on the film's
    # last shot. Every other page here is a scan of a printed Journal; the
    # Journals stop in 1998. This is the Clerk's stamped copy of the enacted
    # ordinance, published by the city as a PDF, and putting it at the close
    # says in a picture what the film would otherwise have to assert: the
    # record keeps going.
    #
    # THE MARK IS THE PROHIBITION AND NOT THE TITLE. That is the mistake shot 5
    # made and Daniel caught — *"you highlighted the title, not the part you
    # said"*. On an ordinance the operative text is the section that does the
    # thing, so what is marked is section 19B.2(d) whole, subject and all,
    # exactly as printed on p. 11 in single-underline italics because it is an
    # ADDITION to the Administrative Code. Not the bracketed subject line on
    # p. 1, and not the vote tally on the certification page.
    #
    # WHAT THE SECTION ACTUALLY SAYS, because the film must not overclaim it:
    # the ban runs to "any Department" and not to the police alone, and shot
    # 11's narration says "the city ... a ban" and names no force. The two
    # agree. The DEFINITION the prohibition turns on is on p. 5 — "an automated
    # or semi-automated process that assists in identifying or verifying an
    # individual based on an individual's face" — a different page, and this
    # panel is one page, so it is not marked.
    dict(
        n=11,
        pdf=dict(
            # the Clerk's stamped copy: p. 1 carries ORDINANCE NO. 103-19 in
            # the header and the last leaf carries her certification that it
            # was FINALLY PASSED on 5/21/2019, with the 10-1 roll the shot's
            # own plate already cites. The document proves its own citation.
            url="https://sfbos.org/sites/default/files/o0103-19.pdf",
            page=11,
            dpi=200,
            # the INDEPENDENT publication the mark is checked against: the same
            # instrument as Legistar serves it for File 190110, with a real
            # text layer. Its header leaves ORDINANCE NO. blank because it is
            # the version as amended in Board on 14 May; the words of 19B.2(d)
            # are the same, which is the only thing it is asked.
            verify="https://sfgov.legistar.com/View.ashx?M=F&ID=7226786&"
                   "GUID=78A20A6B-F1D1-4044-AA15-82AF55D98040",
        ),
        find="it shall be unlawful for any Department",
        marks=[
            "(d) Notwithstanding the provisions of this Chapter 19B, it shall "
            "be unlawful for any Department to obtain, retain, access, or use: "
            "1) any Face Recognition Technology; or 2) any information "
            "obtained from Face Recognition Technology.",
        ],
        vol="Ordinance No. 103-19, File 190110",
        page="11",
        when="finally passed 21 May 2019",
        alt="Page 11 of San Francisco's enacted surveillance ordinance, with "
            "the subsection that makes face recognition technology unlawful "
            "for any city department marked.",
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


# ── the second source kind: a PDF the city publishes itself ─────────────────
#
# The page is RENDERED and then READ, and the two steps are the same two the
# Internet Archive path takes — it just does its own rendering and its own OCR
# upstream and hands both over. Nothing below re-flows or retypes a word.

# Chosen so this crop lands at the same pixel width as the three archive crops
# (1,432 / 1,713 / 1,683 px), which is what the 530 px panel was tuned on. A
# US Letter page at 200 dpi is 1,700 px wide and MIN_W_FRAC keeps 86 % of it.
PDF_DPI = 200


def fetch(url: str, path: str) -> str:
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"  fetching {url}", flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "qipu-film-scans"})
        with urllib.request.urlopen(req, timeout=180) as r:
            open(path, "wb").write(r.read())
    return path


def ocr_words(im: Image.Image) -> list[tuple[str, tuple[int, int, int, int]]]:
    """Every word tesseract reads off this image, with the box it read it in.

    `--psm 6` — one uniform block — because a Board ordinance page IS one
    column of body type; the default segmenter splits the numbered rule column
    off as its own region and then interleaves it into the reading order."""
    if not shutil.which("tesseract"):
        sys.exit("  tesseract is not on PATH, and a scanned PDF has no text layer")
    png = os.path.join(CACHE_PDF, "_ocr.png")
    im.save(png)
    r = subprocess.run(["tesseract", png, "stdout", "--psm", "6", "tsv"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"  tesseract failed: {r.stderr[:200]}")
    rows = [x for x in csv.DictReader(io.StringIO(r.stdout), delimiter="\t",
                                      quoting=csv.QUOTE_NONE)
            if (x.get("text") or "").strip()]
    words = [(x["text"], (int(x["left"]), int(x["top"]),
                          int(x["left"]) + int(x["width"]),
                          int(x["top"]) + int(x["height"]))) for x in rows]
    # ── THE RULED MARGINS ARE FURNITURE, NOT TEXT ──────────────────────────
    # A Board ordinance is printed on numbered lines between two double vertical
    # rules, and OCR reads all of it: "14", "15", "16" down the left margin and
    # a column of "|" down each side land in the middle of the word stream, so
    # a sentence that wraps three lines is not contiguous and `find_run` cannot
    # see it. Two drops, and neither is a pixel constant:
    #
    #   1 · anything lying entirely outside the BODY COLUMN, whose two edges are
    #       derived from the page's own long alphabetic words — so it follows
    #       the page if the dpi or the margin changes.
    #   2 · anything that survives `norm()` as nothing at all. A token with no
    #       letter and no digit in it is a rule or a speck, not a word, and it
    #       cannot contribute to a match — but it CAN start a run, which is how
    #       a 2 px sliver of the right-hand rule ended up as the first
    #       rectangle of shot 11's mark the first time this ran.
    body = [w for w in words if len(w[0]) >= 4 and w[0].isalpha()]
    if not body:
        sys.exit("  no body words on this page")
    colL = min(b[1][0] for b in body)
    colR = max(b[1][2] for b in body)
    kept = [w for w in words
            if w[1][2] >= colL and w[1][0] <= colR
            and re.search(r"[A-Za-z0-9]", norm(w[0]))]
    print(f"  body column x {colL}..{colR}; dropped {len(words) - len(kept)} "
          f"of {len(words)} words as margin rules, line numbers or specks",
          flush=True)
    return kept


def pdf_text(path: str) -> str:
    """The publisher's OWN machine-readable words, for `prove_pdf`. No boxes and
    no rendering — this is only ever asked whether a phrase is in it."""
    import fitz                                    # PyMuPDF, PDF path only
    with fitz.open(path) as d:
        return norm(" ".join(d[i].get_text() for i in range(d.page_count)))


def prove_pdf(spec: dict, pg: "Page", im: Image.Image, marks: list) -> None:
    """Two proofs, and they fail in different directions on purpose.

    The archive path proves the LEAF, because the leaf is what no arithmetic
    gives reliably. A PDF page has no such ambiguity — page 11 is page 11 — so
    the thing worth proving here is that the MARK is right, and OCR is the only
    thing standing between the page and the rectangle.

    ONE  the marked phrase has to appear, word for word, in an INDEPENDENT
         digital publication of the same instrument. OCR cannot fabricate
         agreement with a text layer it never saw, so this proves the words
         being marked are the record's words and not the reader's guess at them.
    TWO  the marked rectangles are cut out of the rendered image and read AGAIN,
         on their own. If a box were in the wrong place the crop would contain
         different words. This proves the rectangle is on those pixels.
    """
    want = norm(" ".join(spec["marks"]))
    v = pdf_text(fetch(spec["pdf"]["verify"],
                       os.path.join(CACHE_PDF, f"verify-{spec['n']:02d}.pdf")))
    if want not in v:
        sys.exit(f"  shot {spec['n']}: the mark is not in the independent "
                 f"publication of this instrument. Refusing to mark it.")
    print("  proof 1/2 · the marked words are verbatim in the publisher's own "
          "machine-readable text of the same ordinance", flush=True)

    L = min(b[0] for b in marks); R = max(b[2] for b in marks)
    T = min(b[1] for b in marks); B = max(b[3] for b in marks)
    pad = int((B - T) * 0.04)
    back = norm(pytess(im.crop((max(0, L - pad), max(0, T - pad),
                                min(im.width, R + pad), min(im.height, B + pad)))))
    # the rule column is inside that rectangle for a wrapped mark, so the line
    # numbers come back with the words; the test is containment of the phrase
    # with those digits removed, and nothing else is relaxed.
    back = re.sub(r"\s\d{1,2}\s", " ", " " + back + " ")
    back = re.sub(r"\s+", " ", back).strip()
    if want not in back:
        sys.exit(f"  shot {spec['n']}: the marked rectangle does not read back "
                 f"as the phrase.\n    wanted {want[:90]!r}\n    read   {back[:90]!r}")
    print("  proof 2/2 · the marked rectangle, re-read on its own, is that "
          "phrase", flush=True)


def pytess(im: Image.Image) -> str:
    png = os.path.join(CACHE_PDF, "_back.png")
    os.makedirs(CACHE_PDF, exist_ok=True)
    im.save(png)
    return subprocess.run(["tesseract", png, "stdout", "--psm", "6"],
                          capture_output=True, text=True).stdout


def pdf_page(spec: dict) -> tuple["Page", Image.Image]:
    import fitz                                    # PyMuPDF, PDF path only
    cfg = spec["pdf"]
    path = fetch(cfg["url"], os.path.join(CACHE_PDF, f"shot-{spec['n']:02d}.pdf"))
    with fitz.open(path) as d:
        if not 1 <= cfg["page"] <= d.page_count:
            sys.exit(f"  page {cfg['page']} is not in a {d.page_count}-page PDF")
        pm = d[cfg["page"] - 1].get_pixmap(dpi=cfg.get("dpi", PDF_DPI))
        im = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
    print(f"  {os.path.basename(path)} p. {cfg['page']} rendered "
          f"{im.width}x{im.height} at {cfg.get('dpi', PDF_DPI)} dpi", flush=True)
    pg = Page(str(cfg["page"]), im.width, im.height, ocr_words(im))
    pg.leaf = cfg["page"]
    return pg, im


def build(spec: dict) -> dict:
    if "pdf" in spec:
        return build_pdf(spec)
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
    marks = mark_boxes(spec, pg)
    return compose(spec, pg, marks, image(item, pg.leaf),
                   item=item, leaf=pg.leaf,
                   url=f"https://archive.org/details/{item}/page/n{pg.leaf}/mode/1up")


def build_pdf(spec: dict) -> dict:
    """Shot 11's path. Same crop, same marks, a different record and a
    different proof — see `prove_pdf` and the header's second-kind note."""
    print(f"shot {spec['n']} · {spec['pdf']['url']}", flush=True)
    pg, im = pdf_page(spec)
    if norm(spec["find"]) not in pg.text:
        sys.exit(f"  shot {spec['n']}: p. {pg.leaf} does not carry {spec['find']!r}")
    marks = mark_boxes(spec, pg)
    prove_pdf(spec, pg, im, marks)
    return compose(spec, pg, marks, im,
                   item=os.path.basename(spec["pdf"]["url"]), leaf=spec["pdf"]["page"],
                   url=spec["pdf"]["url"])


def mark_boxes(spec: dict, pg: "Page") -> list[tuple[int, int, int, int]]:
    marks: list[tuple[int, int, int, int]] = []
    for phrase in spec["marks"]:
        run = find_run(pg, phrase)
        if run is None:
            sys.exit(f"  shot {spec['n']}: leaf {pg.leaf} does not carry {phrase[:60]!r}")
        marks += boxes(pg, *run)
    return marks


def compose(spec: dict, pg: "Page", marks: list, im: Image.Image,
            *, item: str, leaf: int, url: str) -> dict:
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
        item=item, leaf=leaf, url=url,
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
