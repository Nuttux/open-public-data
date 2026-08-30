"""Everything on this map you can reach by TYPING its name.

    website/public/data/us/sf/city/blocks/search-index.json

WHY THIS EXISTS. The map is the only way in. A reader who already knows what
they are looking for — their own street, the neighbourhood they live in, the
library on the corner — has to find it by eye on a picture of San Francisco,
and there are 5,404 blocks to look through. Everything the fiche can already
open is unreachable by name.

FOUR KINDS OF THING, and the difference between them is not cosmetic — it is
how much the record actually knows:

    hood    41      the map's own divisions. Exact, and 35 carry a paragraph.
    street  1,440   every street with a file of its own. Exact and dense.
    place   105     the curated civic places — a library, a firehouse, a park.
                    102 of them carry an address, which is a second thing to
                    search them under.
    addr    1,234   a door the Board named, read out of the record's own words.

NO MONEY IN THIS INDEX. Every place file carries a `money` object, so flagging
the ones that "have money" would flag all 105 — but Coit Tower's money is
Recreation & Parks' $250,373,849 budget line for FY2025, which belongs to the
department and not to the tower. `block-money.json` makes the same point about
its own figures in `money_is_the_whole_place`. A `$` on a search result would
be read as "this place cost that", and none of these files say that.

THE ADDRESSES ARE NOT A REGISTRY AND MUST NOT BE PRESENTED AS ONE. San
Francisco has on the order of two hundred thousand addresses; this index holds
the ones the Board of Supervisors printed a house number for, at a precision
tier the pipeline already checked falls inside the block's own parcel range.
Typing an address that is not here does not mean the address does not exist —
it means the Board never named it, which is a finding of its own and is what
the search is expected to say.

EVERY ENTRY CARRIES A BLOCK. A result has to be able to move the map, and the
map picks by block. A hood and a street have no single block, so each takes the
one holding the most of its records — a representative, which is what `kinds`
already says: hood and street entries are always representative, place and
address entries never are.

Run:
    python3 pipeline/scripts/us_sf_city/build_search_index.py
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CITY = os.path.join(ROOT, "website/public/data/us/sf/city")
BLOCKS = os.path.join(CITY, "blocks")
PLACES = os.path.join(ROOT, "website/public/data/us/sf/places")
OUT = os.path.join(BLOCKS, "search-index.json")

# ── THE ADDRESS READER, PORTED FROM THE BROWSER ──────────────────────────────
# `block-records.ts` §blockAddresses is what draws the doors on the fiche, and
# this index has to offer exactly the doors that fiche can open. So the pattern
# and ALL THREE of its guards are the same ones: the two word filters here, and
# the one-address-per-row rule down in the loop. If they drift, a search result
# opens a fiche that does not have the door on it — which is not hypothetical,
# it is what happened while the third guard was missing.
ADDRESS = re.compile(
    r"\b(\d{1,5})(?:\s?[-–]\s?\d{1,5})?\s+"
    r"((?:(?:\d{1,3}(?:st|nd|rd|th)|[A-Za-z][A-Za-z'.-]*)\s+){1,3}?)"
    r"(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|way|place|pl"
    r"|court|ct|terrace|alley|lane|highway)\b",
    re.I,
)
NOT_A_NAME = {
    "the", "of", "and", "at", "on", "in", "to", "from", "said", "a", "an",
    "portion", "portions", "side", "sides", "corner", "corners", "line",
    "lines", "between", "including", "crossing", "intersection", "north",
    "south", "east", "west", "northerly", "southerly", "easterly", "westerly",
}
ORDINAL_WORD = {
    "first": "1st", "second": "2nd", "third": "3rd", "fourth": "4th",
    "fifth": "5th", "sixth": "6th", "seventh": "7th", "eighth": "8th",
    "ninth": "9th", "tenth": "10th", "eleventh": "11th", "twelfth": "12th",
    "thirteenth": "13th", "fourteenth": "14th", "fifteenth": "15th",
    "sixteenth": "16th", "seventeenth": "17th", "eighteenth": "18th",
    "nineteenth": "19th", "twentieth": "20th", "twentyfirst": "21st",
    "twentysecond": "22nd", "twentythird": "23rd", "twentyfourth": "24th",
    "twentyfifth": "25th", "twentysixth": "26th", "twentyseventh": "27th",
    "twentyeighth": "28th", "twentyninth": "29th", "thirtieth": "30th",
}
SUFFIX = {
    "street": "St", "st": "St", "avenue": "Ave", "ave": "Ave",
    "boulevard": "Blvd", "blvd": "Blvd", "road": "Rd", "rd": "Rd",
    "drive": "Dr", "dr": "Dr", "way": "Way", "place": "Pl", "pl": "Pl",
    "court": "Ct", "ct": "Ct", "terrace": "Ter", "alley": "Aly",
    "lane": "Ln", "highway": "Hwy",
}
# ── THE TIER, AND IT IS 3 ─────────────────────────────────────────────────
# `block-records.ts` §TIER_WORDING, index for index:
#
#   0 somewhere on this street   1 at a corner of this block
#   2 on this stretch of street  3 at an address on this block
#   4 the record names this block
#
# **3 is the only tier that is a claim about a DOOR.** This file was written
# with 4 — read as "the top tier must be the most precise" — and 4 is the
# BLOCK-level claim, weaker for this purpose. Reading it produced 1,052
# "doors" that were mostly block-level rows carrying an address in their
# text, which is why 23 % of them disagreed with the assessor about which
# block they were on and why `400 Castro St` was offered while the fiche
# would not draw it. `blockAddresses` reads tier 3 and no other; so does this.
ADDR_TIER = 3


def fold_address(num: str, name: str, suf: str):
    words = [w for w in name.strip().split() if w]
    if not words or len(words) > 3:
        return None
    if any(w.lower() in NOT_A_NAME for w in words):
        return None
    key_name = " ".join(
        ORDINAL_WORD.get(w.lower().replace(".", "").replace(",", ""), w.lower())
        for w in words
    )
    suf_key = SUFFIX.get(suf.lower(), suf)
    return (
        f"{num} {key_name} {suf_key}".lower(),
        f"{num} {' '.join(words)} {suf_key}",
    )


def street_label(key: str) -> str:
    """`GEARY|BLVD` → `Geary Blvd`, the same shape the fiche prints."""
    parts = [p for p in re.split(r"[|_]", key) if p and p != "*"]
    out = []
    for p in parts:
        low = p.lower()
        # 16TH stays 16th; O'FARRELL becomes O'Farrell
        if re.match(r"^\d+(st|nd|rd|th)$", low):
            out.append(low)
        else:
            out.append(re.sub(r"(^|[\s'-])([a-z])",
                              lambda m: m.group(1) + m.group(2).upper(), low))
    return " ".join(out)


def norm(s: str) -> str:
    """The SAME normalisation the browser's `normSearch` applies.

    Lowercase, punctuation to spaces, runs of space collapsed. Nothing
    clever — a query either matches a token or it does not, and every hit
    stays explainable.
    """
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s.lower())).strip()


def file_name(key: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", key)


_SUF_BARE = set("st ave blvd rd dr way pl ct ter aly ln hwy".split())


def _bare(n: str) -> str:
    """drop a trailing street type, so `guerrero st` and `guerrero` compare"""
    w = n.split()
    return " ".join(w[:-1]) if len(w) > 1 and w[-1] in _SUF_BARE else n


def _assessor_block(ix: dict, label: str) -> str | None:
    """the block the assessor puts this house number on, or None"""
    if not ix:
        return None
    m = re.match(r"^(\d+)\s+(.*)$", label)
    if not m:
        return None
    num = int(m.group(1))
    sidx = ix["st"].get(_bare(norm(m.group(2))))
    if sidx is None:
        return None
    ai = ix["ai"]
    best = None
    span = None
    for j in ix["by"].get(sidx, []):
        if num < ai["lo"][j] or num > ai["hi"][j]:
            continue
        sp = ai["hi"][j] - ai["lo"][j]
        if span is None or sp < span:
            span, best = sp, ai["b"][j]
    return best


def main() -> int:
    index = json.load(open(os.path.join(BLOCKS, "block-index.json")))
    ids: list[str] = index["b"]
    n_rec: list[int] = index["n"]
    pos = {b: i for i, b in enumerate(ids)}

    # ── the hood byte, for the divisions and their representative blocks ──
    hood_of: dict[str, int] = {}
    hood_names: list[str] = []
    try:
        sys.path.insert(0, HERE)
        from _chunk import field_array, read_chunk  # type: ignore

        header, payload = read_chunk(
            open(os.path.join(CITY, "base/blocks.qc"), "rb").read()
        )
        hood = field_array(header, payload, "hood")
        blocks_entry = next(
            c for c in header["chunks"] if c["k"] == "base/blocks"
        ) if isinstance(header, dict) and "chunks" in header else None
        hood_names = (blocks_entry or {}).get("hoodNames") or []
        for i, b in enumerate(ids):
            if i < len(hood):
                hood_of[b] = int(hood[i])
    except Exception as e:  # pragma: no cover - the manifest is the fallback
        print(f"  (hood byte unread: {e}; falling back to the manifest)")

    if not hood_names:
        man = json.load(open(os.path.join(CITY, "manifest.json")))
        for c in man.get("chunks", []):
            if c.get("k") == "base/blocks" and c.get("hoodNames"):
                hood_names = c["hoodNames"]
                break

    entries: list[dict] = []

    # ── 1. THE DIVISIONS ─────────────────────────────────────────────────────
    # Counts and representative blocks come from the hood files, which are the
    # same numbers the fiche prints — a search result that says 1,559 and a
    # fiche that says something else would be two truths about one place.
    hood_rep: dict[int, tuple[str, int]] = {}
    for b, h in hood_of.items():
        cur = hood_rep.get(h)
        got = n_rec[pos[b]] if b in pos else 0
        if cur is None or got > cur[1]:
            hood_rep[h] = (b, got)
    n_hood = 0
    for i, name in enumerate(hood_names):
        path = os.path.join(BLOCKS, "hood", f"{i}.json")
        if not os.path.exists(path):
            continue
        h = json.load(open(path))
        rep = hood_rep.get(i, (None, 0))[0]
        if rep is None:
            continue
        entries.append({
            "k": "hood",
            "l": h.get("name") or name,
            "s": norm(h.get("name") or name),
            "n": int(h.get("n") or 0),
            "b": rep,
            "rep": True,
            "to": i,
            **({"sum": True} if h.get("summary") else {}),
        })
        n_hood += 1

    # ── 2. THE STREETS ───────────────────────────────────────────────────────
    # Only the ones with a file. `build_street_index.py` established the rule
    # and the reason: 332 of the 1,772 streets blocks name have no record of
    # their own, and offering one opens an empty page.
    st_index = json.load(open(os.path.join(BLOCKS, "street-index.json")))["n"]
    referenced: dict[str, set[str]] = collections.defaultdict(set)
    doors: dict[str, dict] = {}
    n_rows = 0

    for fn in sorted(glob.glob(os.path.join(BLOCKS, "block-*.json"))):
        for bid, rec in json.load(open(fn)).items():
            if not isinstance(rec, dict):
                continue
            for s in rec.get("s") or []:
                referenced[s].add(bid)
            for r in rec.get("d") or []:
                if not isinstance(r, dict):
                    continue
                n_rows += 1
                if r.get("p") != ADDR_TIER:
                    continue
                t = r.get("t") or ""
                found: dict[str, str] = {}
                for m in ADDRESS.finditer(t):
                    fa = fold_address(m.group(1), m.group(2), m.group(3))
                    if fa and fa[0] not in found:
                        found[fa[0]] = fa[1]
                # ── A LIST IS NOT A CLAIM ABOUT A DOOR ───────────────────
                # `blockAddresses` drops any row naming more than one address
                # and this MUST drop the same ones. The tier says some number
                # on the line falls inside this block's parcels; where the
                # line names five — a 1986 assessment row reads "1721
                # Cabrillo Street … 2270-2272 Bryant Street … 107 Maywood
                # Drive" — there is no telling which, and naming any of them
                # puts a Richmond address on a Mission fiche.
                #
                # Leaving it out here did exactly what it does there, one
                # remove further: the index offered doors the fiche cannot
                # draw, so the result opened a block with no such door on it.
                # Searching `400 Castro St` landed on the block.
                if len(found) != 1:
                    continue
                key, label = next(iter(found.items()))
                y = int(r.get("y") or 0)
                d = doors.get(key)
                if d is None:
                    d = doors[key] = {"l": label, "n": 0, "y0": 9999, "y1": 0,
                                      "on": collections.Counter()}
                d["n"] += 1
                # EVERY block whose rows yield this door, not the first one
                # seen. A record printed at a corner is stored on every block
                # that corner touches, so "the first shard I met it in" is
                # arbitrary — and it disagreed with the assessor about which
                # block the address is on for 24 % of doors.
                d["on"][bid] += 1
                if y:
                    d["y0"] = min(d["y0"], y)
                    d["y1"] = max(d["y1"], y)

    n_street = 0
    for key, blocks_on in sorted(referenced.items()):
        cnt = st_index.get(file_name(key))
        if not cnt:
            continue
        rep = max(blocks_on, key=lambda b: n_rec[pos[b]] if b in pos else 0)
        entries.append({
            "k": "street",
            "l": street_label(key),
            "s": norm(street_label(key)),
            "n": int(cnt),
            "b": rep,
            "rep": True,
            "to": key,
        })
        n_street += 1

    # ── 3. THE CURATED PLACES ────────────────────────────────────────────────
    # NO MONEY FLAG, and that is a decision rather than an omission. Every one
    # of the 105 place files carries a `money` object, so a naive flag would
    # mark all of them — but Coit Tower's `money` is Recreation & Parks'
    # $250,373,849 budget line for FY2025, which is the DEPARTMENT's and not
    # the tower's. `block-money.json` says the same thing about its own figures
    # in `money_is_the_whole_place`. A `$` on a search result would be read as
    # "this place cost that", which is not what any of these files say.
    #
    # What the entry carries instead is the place's own address, which is a
    # fact about the place, is what a reader recognises it by, and is a second
    # thing to search it under.
    place_block: dict[str, str] = {}
    money = json.load(open(os.path.join(BLOCKS, "block-money.json")))
    for bid, places in (money.get("b") or {}).items():
        for pl in places:
            place_block.setdefault(pl["slug"], bid)

    n_place = 0
    n_place_addr = 0
    for path in sorted(glob.glob(os.path.join(PLACES, "*.json"))):
        slug = os.path.basename(path)[:-5]
        if slug.startswith("_") or slug.startswith("places_"):
            continue
        try:
            p = json.load(open(path))
        except Exception:
            continue
        name = p.get("name") or p.get("title")
        if not name:
            continue
        docs = p.get("documents")
        addr = (p.get("address") or "").strip()
        if addr:
            n_place_addr += 1
        entries.append({
            "k": "place",
            "l": name,
            "s": norm(name),
            "n": len(docs) if isinstance(docs, list) else 0,
            **({"b": place_block[slug]} if slug in place_block else {}),
            "to": slug,
            **({"sub": addr} if addr else {}),
        })
        n_place += 1

    # ── 4. THE DOORS ─────────────────────────────────────────────────────────
    #
    # WHICH BLOCK A DOOR SENDS THE READER TO. The record alone cannot settle
    # it: a decision printed at a corner is stored on every block that corner
    # touches, so a door is derivable on two or three blocks at once and the
    # first one met is an accident of shard order. The ASSESSOR settles it —
    # `address-index.json` is its own address-to-block join — but only where
    # the door is actually derivable on the block it names, because the fiche
    # builds its doors out of that block's rows and would otherwise open a
    # block with no such door on it.
    #
    # So: the assessor's block when the record agrees it is there, and
    # otherwise the block holding the most of the door's own records.
    addr_ix = {}
    try:
        ai = json.load(open(os.path.join(BLOCKS, "address-index.json")))
        st_id = {}
        for i, lab in enumerate(ai["streets"]):
            st_id[_bare(norm(lab))] = i
        by_street: dict[int, list[int]] = {}
        for j, sidx in enumerate(ai["s"]):
            by_street.setdefault(sidx, []).append(j)
        addr_ix = {"ai": ai, "st": st_id, "by": by_street}
    except FileNotFoundError:
        print("  (no address-index.json — door blocks stay as the record has them)")

    n_addr = 0
    from_assessor = 0
    for key, d in sorted(doors.items()):
        on = d["on"]
        best = max(on.items(), key=lambda kv: (kv[1], kv[0]))[0]
        want = _assessor_block(addr_ix, d["l"])
        if want and want in on:
            best = want
            from_assessor += 1
        entries.append({
            "k": "addr",
            "l": d["l"],
            "s": norm(d["l"]),
            "n": d["n"],
            "b": best,
            "to": key,
            "y0": d["y0"] if d["y0"] != 9999 else 0,
            "y1": d["y1"],
        })
        n_addr += 1

    # ── COLUMNAR, AND THE NORMALISED FORM IS NOT SHIPPED ─────────────────────
    # As a list of objects this file was **289 KB**, which is more than
    # `threads.json` and has to arrive before a reader can type a letter. Two
    # changes take it under a third of that and neither loses anything:
    #
    #   · parallel arrays rather than 2,820 copies of the same seven keys —
    #     the same shape `block-index.json` already ships;
    #   · `s`, the normalised label, is DROPPED. It was a second copy of `l`
    #     with the punctuation taken out. The browser normalises the whole
    #     column once on load, which is 2,820 regex replacements and costs
    #     less than the bytes did.
    #
    # `rep` is dropped for the same reason it was never information: a hood
    # and a street are ALWAYS representative and a door and a place never are,
    # so the kind already said it.
    # The entries were appended kind by kind, so a kind is a contiguous RUN and
    # its two boundaries say everything a per-entry `k` column said in 22 KB.
    kinds: dict[str, list[int]] = {}
    for i, e in enumerate(entries):
        r = kinds.setdefault(e["k"], [i, i])
        r[1] = i + 1
    for r in kinds.values():
        r[1] = max(r[1], r[0])
    a0, a1 = kinds.get("addr", [0, 0])

    cols = {
        "kinds": kinds,
        "l": [e["l"] for e in entries],
        "n": [e["n"] for e in entries],
        "b": [e.get("b", "") for e in entries],
        # ── `to` IS EMPTY FOR A DOOR, ON PURPOSE ─────────────────────────
        # A hood goes to an index, a street to its key, a place to its slug.
        # A door has no id of its own: the fiche derives its doors from the
        # block's own rows, in `blockAddresses`, and a key shipped from here
        # would have to stay character-identical to that fold forever or a
        # result would open a fiche without the door on it. So the search
        # hands over the BLOCK and the LABEL, and the panel matches the label
        # against the doors it just computed. Nothing to keep in sync, and a
        # label that fails to match still opens the right block.
        "to": [str(e["to"]) if e["k"] != "addr" else "" for e in entries],
        # dense over the door run only — the other three kinds have no years
        "ay0": [entries[i]["y0"] for i in range(a0, a1)],
        "ay1": [entries[i]["y1"] for i in range(a0, a1)],
        # a second thing to search a place under — its own address. Sparse:
        # only the places have one, so it rides as a map keyed by position.
        "sub": {str(i): e["sub"] for i, e in enumerate(entries) if e.get("sub")},
        "sum": [i for i, e in enumerate(entries) if e.get("sum")],
    }

    payload = {
        "generated_by": "pipeline/scripts/us_sf_city/build_search_index.py",
        "COLUMNS_JOIN_BY_POSITION": "`l`, `n`, `b` and `to` are parallel and "
                                    "the same length. `kinds` gives each kind's "
                                    "[start, end) run over them. `ay0`/`ay1` "
                                    "are dense over the `addr` run only. `sub` "
                                    "is a sparse map of place addresses; `sum` "
                                    "is a list of positions.",
        "WHAT_A_KIND_MEANS": {
            "hood": "a division of the map. Exact.",
            "street": "a street with a record file of its own. Exact.",
            "place": "a curated civic place. The only kind that carries money.",
            "addr": "a door the Board of Supervisors printed a house number "
                    "for. NOT a register of San Francisco's addresses — an "
                    "address absent from this list is an address the record "
                    "never named.",
        },
        "REP_IS_A_REPRESENTATIVE": "`rep` marks an entry whose block is the "
                                   "one holding the most of its records, not "
                                   "the whole of it. A street and a division "
                                   "have no single block; the map has to be "
                                   "sent somewhere, and this is where.",
        "counts": {
            "hood": n_hood, "street": n_street,
            "place": n_place, "addr": n_addr, "all": len(entries),
        },
        "rows_read": n_rows,
        **cols,
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
        f.write("\n")

    kb = os.path.getsize(OUT) / 1024
    print(f"{n_hood:>6}  divisions")
    print(f"{n_street:>6}  streets")
    print(f"{n_place:>6}  places  ({n_place_addr} with an address of their own)")
    print(f"{n_addr:>6}  doors the record names "
          f"({from_assessor} placed on the assessor's own block)")
    print(f"{len(entries):>6}  searchable in all · {kb:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
