"""One line per decision, and it has to be readable on its own.

The block drawer used to print a 260-character window cut out of the middle of an
OCR'd item, centred on whichever address matched the block. That produced rows
that opened mid-word and closed mid-word:

    …treet; 1500 gallons capacity. x\\Irs. Caroline A. Koster. at 1635 Clay street…

Four rules, in this order:

  THE BOARD'S OWN HEADING (blocks/headings.py). The Journal prints a one-line
  summary above every item and it is exactly the line this row wants. It is used
  when it is specific enough to be worth the line and when it does not name a
  street this block has nothing to do with — an omnibus permit list carries one
  heading and lands on twenty blocks, and nineteen of them are entitled to the
  clause about THEM rather than to the heading about the first one.

  OTHERWISE A WHOLE SENTENCE, from the sentence boundary before the address that
  put this decision on this block to the sentence boundary after it. Never a
  fragment, never a leading ellipsis, never opening on OCR wreckage.

  A LIST ENTRY INHERITS ITS HEADING. "Bernard Bosq, at 1680 Clay street; 1500
  gallons capacity." is not a sentence about anything until you know it sits
  under "Oil and Boiler Permits." — so where the heading is too thin to be the
  whole line but names no street this block is a stranger to, it goes in front
  of the sentence and the row reads "Oil and Boiler Permits — Bernard Bosq, at
  1680 Clay street; 1500 gallons capacity."

  BOILERPLATE LOSES. "Authorizations.", "Final Passage.", and any line that ends
  on a colon because it is introducing a list rather than saying anything, are
  not lines. They lose to the sentence beneath them, and if there is no sentence
  they lose to nothing.

A row that can produce none of these gets no line at all. The archive title and
the collection still stand, which is the shelf's contract, and a blank is honest
where invented prose would not be.
"""
import re

import headings as _H

SENT_ABBR = _H.ABBR

# 1500 gallons of "x\Irs." — the OCR of "Mrs." in the 1922 volume. A reader meeting
# a row for the first time must not meet it here. Applied only to the OPENING of a
# candidate line; garble deeper in the sentence is the page and is left alone.
ORDINAL = re.compile(r"\d+(?:st|nd|rd|th)\b", re.I)
GARBLE_HEAD = re.compile(r"^[^A-Za-z0-9$\"]|[\\|{}~^_<>]|\*|"
                         r"[A-Za-z]\d|\d[A-Za-z]|\b[A-Za-z]?\\[A-Za-z]")


def wrecked(s, n=40):
    """Is the OPENING of this line OCR wreckage? Ordinals are not — "the 13th day
    of April" is the page reading correctly. Wreckage deeper in the sentence is
    the page too, and is left alone; a reader must simply not MEET it first."""
    return bool(GARBLE_HEAD.search(ORDINAL.sub("", s[:n])))
# "Resolved, That", "as follows:", "(New Series)" and the rest of the fixed
# preamble. blocks/strip.py owns the full list; these are the ones that survive
# a sentence split and would otherwise open the line.
LEAD = [re.compile(p, re.I) for p in (
    r"^(Resolution|Ordinance|Motion)\s*(No\.?\s*[\dA-Za-z\-]*)?\s*"
    r"(\((?:New Series|Series of \d{4}|Bill No\.?[^)]*)\))?\s*[,.:]?\s*",
    r"^No\.?\s*\d[\dA-Za-z\-]*\s*(\((?:New Series|Series of \d{4})\))?\s*[,.:]?\s*",
    # "Resolution No. (New Series K Authorizing ..." — the OCR loses the closing
    # bracket often enough that the bracketed form alone leaves "New Series K" at
    # the head of the line
    r"^\(?\s*(?:New Series|Series of \d{4})\s*[)\]K,;:.]*\s*",
    r"^\d+\s*\((?:New Series|Series of \d{4})\)\s*,?\s*",
    # a run of initials the splitter left behind: "J. R. No Resolved, That ..."
    r"^(?:[A-Z]\.\s*){1,3}(?:No\.?\s*)?",
    # the tail of the PREVIOUS entry in a permit list, where the OCR dropped the
    # full stop between them: "1500 gallons capacity Bernard Bosq, at 1680 Clay"
    r"^\d[\d,.]*\s+(?:gallons?|horse ?power|feet|foot|inch(?:es)?)\s+"
    r"(?:capaci\w+|standards?)?\s*",
    r"^File\s+[\d\-]+\s*",
    # the 1980s volumes print the subject in brackets ahead of the text:
    # "File 101-82-132 [Moratorium] Draft ordinance temporarily prohibiting ..."
    r"^\[[^\]]{0,48}\]\s*",
    r"^(as follows|as amended)\s*[:.]?\s*",
    # "Resolved" loses its head to the item splitter often enough to matter:
    # "Olved, That J. B. Rogers be granted an extension of 90 days' time"
    r"^\w{0,4}olved,?\s+That,?\s+",
    r"^Ordered,?\s+That,?\s+",
    r"^Ordaining,?\s+",
    r"^(and\s+)?Whereas,?\s+",
    r"^That\s+",
    r"^\W+",
)]


def sentence_spans(t):
    """[(start, end)] over t, on the same abbreviation-guarded rule as headings."""
    out, start = [], 0
    for m in _H.SENT.finditer(t):
        j = m.start()
        w = re.split(r"[\s,(]", t[:j])[-1].lower().strip("(\"'")
        if w in SENT_ABBR or (len(w) == 1 and w.isalpha()):
            continue
        if t[start:j + 1].strip():
            out.append((start, j + 1))
        start = m.end()
    if t[start:].strip():
        out.append((start, len(t)))
    return out


def _open_clean(s):
    """Trim the fixed preamble off the front. Returns "" if it opens on wreckage.

    "Resolved, That, in the exercise of ..." loses its four fixed words and the
    "in" is raised to "In" — the only character on the row that is not the page's
    own, and the method note says so.
    """
    cut = False
    for _ in range(4):
        b = s
        for p in LEAD:
            n = p.sub("", s, count=1).lstrip()
            if n != s:
                cut = True
            s = n
        if s == b:
            break
    s = s.strip()
    if not s or wrecked(s):
        return ""
    if cut and s[:1].islower():
        s = s[0].upper() + s[1:]
    if not re.match(r"^[A-Z0-9$]", s):        # a fragment of somebody's sentence
        return ""
    return s


STOP = (".", "!", "?", "\u201d", "\"", "\u2026")


def _fit(s, cap):
    """<= cap characters, ending on a stop the reader can see. Never mid-word, and
    never trailing off on a comma — a line that had to be cut says so with an
    ellipsis, which is a claim ("there is more") rather than an accident."""
    s = s.strip()
    if len(s) > cap:
        cut = s[:cap]
        for sep in ("; ", ", ", " "):
            j = cut.rfind(sep)
            if j > cap * 0.55:
                s = cut[:j]
                break
        else:
            s = cut
    s = s.rstrip(" ,;:-\u2014")
    return s if s.endswith(STOP) else s + "\u2026"


# "...the following expenditures ... for supplies furnished and services rendered,
# as follows, to wit:" is the Board clearing its throat before a table. It ends on
# a colon because it is introducing something, and what it introduces is the part
# the reader wants.
# A CLAIMS TABLE HAS NO SENTENCES IN IT. The Journal sets a page of them as one
# unbroken run — "Oct. 25, 1909— Phillips & Van Orden Co.. for printing Indices ...
# $1,066.85 Nov. 5, 1909— H. P. Terry, for supplying chairs ... 1,380.00 Nov. 5,
# 1909— Flinn & Treacy Contracting Co., for paving etc., Polk street ..." — 455
# characters, no full stop, three different claimants. A block on Polk Street is
# entitled to the Flinn & Treacy entry and nothing else, so where the run holds
# entry markers the entry containing the address is what gets cut out.
ENTRY = re.compile(
    r"(?:^|(?<=[\s;]))(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
    r"\.?\s+\d{1,2},?\s*\d{4}|\(?\d{1,2}\)\s+(?=[A-Z])|[A-Z][a-z]+\s+\d{1,5}\s*,)")


def entry_at(s, off):
    """The list entry inside `s` that holds `off`, or None if `s` is not a list."""
    starts = [m.start() for m in ENTRY.finditer(s)]
    starts = [x for x in starts if x <= off]
    if not starts or starts[-1] == 0:
        return None
    return s[starts[-1]:]


def usable(s):
    return bool(s) and len(s) >= 30 and not s.rstrip().endswith(":")


def drop_next_heading(s, nxt):
    """Cut the NEXT item's heading off the end of this line.

    The splitter cuts each page on Resolution|Ordinance|Motion, so the heading of
    the item after this one trails into this one — that is the whole reason
    blocks/headings.py works. On a claims table with no full stops the trailing
    heading ends up inside the line: "... as detailed on bill rendered 4,040.85
    Total $6,487.70 Authorizing Payment, Heating and Ventilating System, Bryant
    Cosmopolitan School." The last sentence there belongs to the next decision,
    and blocks/headings.py already knows exactly what it says.
    """
    if not s:
        return s
    if nxt and len(nxt) >= 12:
        j = s.find(nxt[:28])
        if j >= 40:
            return s[:j].rstrip(" ,;:-\u2014")
    # (v, i+1) is the next LOCATED item, which on a busy page is several items
    # further on, so the exact match above misses more often than it hits. The
    # general test is the one blocks/headings.py already owns: if the last
    # sentence of this line reads as a heading, it is the next decision's.
    # ...and the split is not always a sentence split, because on a claims table
    # there is no full stop to split on: "$6,487.70 Authorizing Payment, Heating
    # and Ventilating System, Bryant Cosmopolitan School." So every capitalised
    # tail in the back of the line is offered to is_heading, and the longest one
    # that reads as a heading is cut. is_heading is strict — title case, ends on a
    # full stop, no finite verb, no roll call, no money fragment — so ordinary
    # prose does not pass it.
    for m in re.finditer(r"\s+(?=[A-Z])", s):
        if m.start() < 40:
            continue
        tail = s[m.end():]
        if len(tail) >= 12 and _H.is_heading(_H.tidy(tail)):
            return s[:m.start()].rstrip(" ,;:-\u2014")
    return s


def sentence_gloss(t, offset=None, cap=200, nxt=None):
    """The whole sentence the matched address sits in, cleaned at both ends.

    The Journal's permit items are LISTS — "Caroline A. Koster. at 1635 Clay
    street; 1500 gallons capacity." — and a period split cuts one entry into
    three. So the window is grown rather than taken: forward across a semicolon,
    which continues an entry, and backward whenever the opening word is
    lower-case, which is the only tell that the split was the OCR's and not the
    Board's.
    """
    spans = sentence_spans(t)
    if not spans:
        return ""
    hit = 0
    if offset is not None:
        hit = next((k for k, (a, b) in enumerate(spans) if a <= offset < b), 0)

    def txt(lo, hi):
        return t[spans[lo][0]:spans[hi][1]].strip()

    lo = hi = hit
    # forward across ";" / ":" — the entry has not finished. Never into the roll
    # call: "Adopted by the following vote:" ends on a colon and what follows is
    # eighteen surnames and a tally.
    while hi + 1 < len(spans) and txt(hi, hi).rstrip().endswith((";", ":")) \
            and len(txt(lo, hi + 1)) <= cap * 1.4 \
            and not _H.ROLLW.match(txt(hi + 1, hi + 1)):
        hi += 1
    # backward while the line opens on a lower-case word
    for _ in range(3):
        s = _open_clean(txt(lo, hi))
        if usable(s):
            return _fit(drop_next_heading(s, nxt), cap)
        if lo == 0:
            break
        if len(txt(lo - 1, hi)) > cap * 1.4:
            # the span before this one is a RUN, not a sentence. If it is a list
            # of entries, take the one holding the address; otherwise give up on
            # going backwards rather than swallow somebody else's claim.
            a0 = spans[lo - 1][0]
            e = entry_at(t[a0:spans[hi][1]], (offset or a0) - a0)
            if e:
                s = _open_clean(e)
                if usable(s):
                    return _fit(drop_next_heading(s, nxt), cap)
            break
        lo -= 1
    # the address sits in wreckage. Take the nearest sentence to it that is not
    # wreckage — still this decision, and as close to this address as the page
    # allows. Walking in from the front of the item instead put a Russian Hill
    # block's row on a printing bill for the Election Commissioners.
    for k in sorted(range(len(spans)), key=lambda k: (abs(k - hit), k > hit)):
        e = k
        while e + 1 < len(spans) and len(txt(k, e)) < 40:
            e += 1
        s = _open_clean(txt(k, e))
        if usable(s) and not (_H.ROLLW.search(s[:40]) and s.count(",") > 3):
            return _fit(drop_next_heading(s, nxt), cap)
    return ""


# ---------------------------------------------------------------- heading gate
# The Board prints these in the heading slot and they say nothing about the place:
# "Authorizations.", "Final Passage.", "Recommitted." Not a line, and not a prefix
# either — a row is better with no line than with a word that means nothing.
STOP_HEADING = re.compile(r"^(also|authorizations?|final passage|recommitted|"
                          r"appropriations?|communications?|considerations?)\b", re.I)
INNER_CAP = re.compile(r"[a-z][A-Z]")


class Vocab:
    """Words this corpus prints three or more times, plus a deletion index.

    Two signs that a heading word was read wrong, both unambiguous and neither of
    which fires on a surname:

      a common word is one edit away — "Approprintions" beside "appropriations",
      "Authorizinj" beside "authorizing". A rare word with no near neighbour is a
      name ("Sittenfeld", "Vojkovich") and is kept.

      a capital letter inside the word — "IVlaintenance", "ResQlution". The
      printer never set one; the OCR read "M" as "IVI".

      the word is printed once in the whole corpus — "supphj", "soutiiern". This
      one costs something: about a third of what it catches is a real surname the
      Journal names once, and those headings fall back to the sentence instead of
      being shown. Measured at 2.3% of headings, and the trade is deliberate.
    """

    def __init__(self, v):
        self.w = set(v["common"])
        self.h = set(v["hapax"])
        self.d = {}
        for x in self.w:
            for k in self._dels(x):
                self.d.setdefault(k, 1)

    @staticmethod
    def _dels(x):
        return {x[:i] + x[i + 1:] for i in range(len(x))} | {x}

    def near(self, x):
        return any(k in self.d for k in self._dels(x))

    def damaged(self, s, words=6):
        # the apostrophe is not part of the word: "Attorney's" is "attorneys",
        # which the corpus prints constantly, and matching it whole made every
        # possessive in a heading look like damage
        head = " ".join(s.split()[:words])
        for w in re.findall(r"[A-Za-z]{5,}", head):
            if INNER_CAP.search(w):
                return True
            x = w.lower()
            if x in self.w:
                continue
            if len(x) >= 6 and x in self.h:
                return True
            if self.near(x):
                return True
        return False


def heading_verdict(h, head_streets, ctx_streets, vocab=None):
    """What this heading is worth: the whole line, a prefix, or nothing.

      "win"     it identifies the thing — it names a place, a sum or a person, or
                it is long enough to be a description
      "prefix"  it is a CATEGORY — "Oil and Boiler Permits." — which is exactly
                what a list entry underneath it is missing
      "no"      it is boilerplate, or it was read wrong, or it is about a
                different address in the same omnibus list
    """
    if not h or STOP_HEADING.match(h):
        return "no"
    if vocab is not None and vocab.damaged(h):
        return "no"
    # an omnibus item carries ONE heading onto twenty blocks. If it names streets
    # and none of them is a street this row is about, it is somebody else's.
    if head_streets and not (head_streets & ctx_streets):
        return "no"
    w = [x for x in re.split(r"\s+", h.rstrip(".")) if x]
    if len(w) <= 6 and not head_streets and not re.search(r"\d", h):
        return "prefix"
    return "win"


def compose(prefix, line, cap):
    """A category heading in front of the entry it is a category for."""
    if not line:
        return ""
    if not prefix:
        return line
    p = prefix.rstrip(". ")
    # already said: "Garage Permit — ...to maintain and operate a public garage..."
    key = [x.lower() for x in re.findall(r"[A-Za-z]{5,}", p)]
    if key and all(k in line.lower() for k in key):
        return line
    return _fit(f"{p} \u2014 {line}", cap)
