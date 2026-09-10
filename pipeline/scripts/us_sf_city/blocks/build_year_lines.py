#!/usr/bin/env python3
"""EVERY LOCATED BOARD DECISION, SHARDED BY DECADE, SO A YEAR IS ONE FETCH.

    python3 pipeline/scripts/us_sf_city/blocks/build_year_lines.py

── WHAT THIS IS FOR ────────────────────────────────────────────────────────
The city map's right-hand panel is 280 px wide and full height and it holds
four lines of mouse instructions. It is called *The record*. The proposal it
is being built for is that it should hold one: drag the year, and the panel
lists what the Board decided in that year, being exactly the dots lit on the
map beside it.

`theme-marks.board.json` already carries the marks — a year, a position and a
theme mask per decision — but not a word of what any of them SAY. The words
are in `block-NN.json`, 256 files keyed by assessor block, and resolving a
panel's worth of them at read time would be up to ninety fetches for one drag
of the scrub. So the join is done here, once.

── WHY BY DECADE AND NOT IN ONE FILE ───────────────────────────────────────
MEASURED on the shipped corpus: 16,468 located decisions, and their text is
2.47 MB before compression. One file would be a 700 kB download to move a
slider. Thirteen decade shards are ~190 kB each, so scrubbing inside a decade
costs nothing and crossing one costs a single small fetch.

── AND THE YEARS ARE NOT EVEN, WHICH THE PANEL HAS TO SURVIVE ──────────────
The median year holds 90 decisions. 1925 holds 891 and 1954 holds 3. That is a
three-hundredfold range and it is a fact about the record — the Journal was
printed in full through the twenties and the corpus thins where the scans do —
not a defect to smooth away. Anything reading this file must render both a
year with three lines and a year with nine hundred.

── ONE ROW IS A DECISION, NOT A DOT ────────────────────────────────────────
The marks file has 16,468 rows and they are 7,816 decisions: **2.11 dots
each**, because a decision that names twenty-four addresses is placed at
twenty-four blocks. *"Ordering Improvement of Clement Street and Fulton
Avenue"* is one act of the Board and twenty-four marks on the map.

Written out flat, a panel listing a year would have printed the same lease
three times and called it three decisions. So a row here is the DECISION, and
its positions ride with it as parallel arrays — which is also what the map
wants, since it draws every one of them.

    y   the year                     u   the archive path, for the link out
    m   the theme bitmask            k   the Board's own kind letter
    t   the decision's own text,     a   dollars, 0 where the record states none
        verbatim and untrimmed
    p   its positions: [x, z, block id], one per place the decision names
    cs  subject index into classify.json `sub`, -1 where unclassified
    ca  act index into classify.json `act`, -1 where none
    g   the shard's own grade letter; `h` means the heading belongs to a
        different item on the same page and must not be printed

`cs`, `ca` and `g` are carried so a reader can build the same row the dot card
builds — `components/us/city/record-line.ts` is the ruleset, and it was scored
on 300 records before it shipped. Nothing here reimplements it.
"""
from __future__ import annotations

import collections
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import themes as TH  # noqa: E402

# The repo this file sits in, not a path typed once on one laptop: the same
# build runs from a worktree, and a hardcoded clone silently writes the year
# shards into the OTHER checkout (found 2026-09-10, mid-ingest).
ROOT = pathlib.Path(__file__).resolve().parents[4]
BLK = ROOT / "website/public/data/us/sf/city/blocks"
OUT = BLK / "year"



# The record_type values that mean the row is not a record of a decision. A
# blank is deliberately NOT here — see the note at the filter below.
NOT_A_RECORD = {
    "vote-outcome-only", "cut-in-half", "departmental-work",
    "page-furniture", "index-row", "too-damaged",
    # What a member of the public said about a file. It is a record of the
    # meeting, not an act of the Board, and the file being spoken to has its own
    # row on the same page.
    "public-comment",
}

def main() -> None:
    THEMES = TH.load()["themes"]
    idx = json.loads((BLK / "block-index.json").read_text())
    ids = idx["b"]
    marks = json.loads((BLK / "theme-marks.board.json").read_text())

    # which block file holds which block id — built once, read once
    where: dict[str, str] = {}
    for f in sorted(BLK.glob("block-*.json")):
        stem = f.name[len("block-"):-len(".json")]
        if not stem.isdigit():
            continue
        for k in json.loads(f.read_text()):
            where[k] = f.name
    cache: dict[str, dict] = {}

    def record(bi: int, ri: int):
        if not (0 <= bi < len(ids)):
            return None, None
        bid = ids[bi]
        fn = where.get(bid)
        if fn is None:
            return None, None
        if fn not in cache:
            cache[fn] = json.loads((BLK / fn).read_text())
        e = cache[fn].get(bid)
        if not e or ri >= len(e.get("d", [])):
            return None, None
        return e["d"][ri], bid

    n = len(marks["b"])
    by_key: dict[tuple, dict] = {}
    missed = 0
    for i in range(n):
        d, bid = record(marks["b"][i], marks["r"][i])
        if d is None:
            missed += 1
            continue
        # a decision is its year, its archive page and its own words. Two marks
        # agreeing on all three are one act of the Board in two places.
        key = (int(marks["yr"][i]), d.get("u") or "", d.get("t") or "")
        row = by_key.get(key)
        if row is None:
            row = by_key[key] = {
                "y": key[0], "m": 0, "k": d.get("k") or "",
                "a": int(d.get("a") or 0), "u": key[1], "t": key[2],
                "cs": int(d["cs"]) if d.get("cs") is not None else -1,
                "ca": int(d["ca"]) if d.get("ca") is not None else -1,
                "g": d.get("g") or "", "pl": d.get("pl") or "", "p": [],
                # HOW MUCH IT MATTERS, so a year can be read in an order worth
                # scanning. The shard row already carries it; -1 means unread
                # rather than unimportant, and a surface must not sort the two
                # together.
                "iv": int(d["iv"]) if d.get("iv") is not None else -1,
            }
        row["m"] |= int(marks["m"][i])
        row["p"].append([round(float(marks["x"][i]), 1),
                         round(float(marks["y"][i]), 1), bid])
    marks_in = n - missed

    # ── THE DECISIONS WITH NOWHERE TO PUT A DOT ─────────────────────────────
    # This file was built from the MARKS, so it held only decisions the join
    # could place. But 55% of the corpus names no place at all, and that half
    # is not the boring half — it is where the citywide acts live: a
    # surveillance policy, a grant accepted, a code amendment. Measured: 142
    # written decisions in 2025 and 140 in 2019 existed in the published table
    # and appeared in NO surface of the app.
    #
    # The panel is captioned "The record — 2026, 62 decisions in the Board's
    # minutes". That was only ever true of the placed ones, so the caption was
    # a quiet lie. An unplaced decision now rides in the same shard with an
    # EMPTY position list: the panel lists it, the map draws nothing for it,
    # and `p.length === 0` is the whole test a surface needs.
    #
    # Only decisions we have actually WRITTEN come in. An unplaced record with
    # no line would be a row of raw Clerk text with no dot to explain it —
    # worse than its absence.
    placed_keys = set(by_key)
    unplaced = 0

    # ── AND IT KEEPS ITS SUBJECT CHIP TOO ──────────────────────────────────
    # `cs`/`ca` are indices into `classify.json`, which is how a surface names
    # a decision's subject and what the Board did with it. build_index fills
    # them for the placed half from the frozen seed; the unplaced half was
    # written -1/-1 and so carried no subject at all — 517 of 2026's decisions
    # among them. The seed classifies BOTH halves and this table publishes the
    # result in `subtopic`/`action`, so the lookup is a label match against the
    # same two lists build_index wrote. `action_other_is_dropped` is that
    # file's own rule and is honoured here: "other" is not one of the eleven.
    _cls = json.loads((BLK / "classify.json").read_text())
    _tax = json.loads((ROOT / "pipeline/seeds/sf_bos_taxonomy.json").read_text())
    _sub_label = {s["slug"]: s["label"] for t in _tax["topics"] for s in t["subtopics"]}
    _act_label = {a["slug"]: a["label"] for a in _tax["actions"]}
    _sub_ix = {lab: i for i, lab in enumerate(_cls["sub"])}
    _act_ix = {lab: i for i, lab in enumerate(_cls["act"])}

    def _chip(rec):
        cs = _sub_ix.get(_sub_label.get((rec.get("subtopic") or "").strip(), ""), -1)
        ca = _act_ix.get(_act_label.get((rec.get("action") or "").strip(), ""), -1)
        return cs, ca

    core = ROOT / "website/public/data/us/sf/city/records/sf_bos_records.csv.gz"
    if core.exists():
        import csv as _csv, gzip as _gzip
        with _gzip.open(core, "rt") as fh:
            for rec in _csv.DictReader(fh):
                if rec.get("block"):            # it has a dot; already here
                    continue
                # ── BLANK IS "NOT CLASSIFIED", NOT "NOT A DECISION" ─────
                # This read `!= "decision"`, which is right for the six
                # values that mean the row is NOT a record — page furniture,
                # an index row, a vote with no subject, a damaged scan. It is
                # wrong for the empty string, which means the classifier has
                # never seen the row: the frozen seed covers the original
                # corpus and not the 34,896 records backfilled after it.
                #
                # Measured: that dropped 34,106 rows from the year pages,
                # 32,400 of them from 2017 on — very nearly the whole modern
                # era, including San Francisco's surveillance-technology
                # ordinances. A sample of 14 was 14 real decisions, and only
                # 269 of the 34,106 carry a subject-less line.
                #
                # So the test names what to REFUSE. When the classification is
                # re-run over the backfill these rows gain a type and nothing
                # here changes.
                if (rec.get("record_type") or "") in NOT_A_RECORD:
                    continue
                line = (rec.get("plain_line") or "").strip()
                if not line:
                    continue
                y = rec.get("year")
                if not (y or "").isdigit():
                    continue
                key = (int(y), rec.get("source_url") or "", rec.get("text") or "")
                if key in placed_keys:
                    continue
                # ── AND IT KEEPS ITS SUBJECT ───────────────────────────
                # This wrote `m: 0`, so an unplaced decision was on the year
                # page and invisible to every subject filter: 2026 has five
                # decisions about homelessness and shelter and the panel could
                # show one, because the other four have no block and so no
                # mask. The panel then read "2026 — 1 decision" beside a map
                # holding dozens, and the number was wrong in the reader's
                # favour of disbelieving it.
                #
                # The mask is computed here with the SAME call build_index
                # makes — `themes.subject_span` over the Clerk's heading and
                # the record's own text, then `mask_of`. Both inputs are
                # columns of this table. It is a second caller of one function,
                # not a second copy of the rule.
                _mask = TH.mask_of(
                    TH.subject_span(rec.get("text") or "",
                                    (rec.get("heading") or "").strip() or None),
                    THEMES)
                _cs, _ca = _chip(rec)
                by_key[key] = {
                    "y": int(y), "m": _mask, "k": rec.get("kind") or "",
                    "a": 0, "u": key[1], "t": key[2],
                    "cs": _cs, "ca": _ca, "g": "", "pl": line, "p": [],
                    "iv": int(rec["importance"]) if (rec.get("importance") or "").strip().isdigit() else -1,
                }
                unplaced += 1

    # ── ONE ACT PRINTED TWICE ON ONE PAGE IS ONE ROW ───────────────────────
    # The dedupe above keys on (year, page, the Clerk's own text), so an item
    # the sweep split into two chunks stays two rows even though we wrote the
    # SAME sentence for both. On the panel that reads as the Board doing a
    # thing twice: 2025 printed "$20.0M federal grant accepted for the Harney
    # Way busway" twice and "Citywide plan changes proposed to allow more
    # family housing" three times.
    #
    # Measured over the whole corpus: 7,854 groups share a year and a written
    # line, and 6,930 of them (88%) sit on ONE source page. Same page, same
    # year, same sentence is one act, and those collapse here.
    #
    # The other 924 span different pages and are LEFT ALONE, because that is
    # what an item printed at introduction and again at final passage looks
    # like — two real events for which rule 9 asks for the same sentence.
    # Merging those would delete a stage from the record.
    merged: dict[tuple, dict] = {}
    for r in by_key.values():
        if not r["pl"]:
            merged[id(r)] = r
            continue
        k = (r["y"], r["u"], r["pl"])
        first = merged.get(k)
        if first is None:
            merged[k] = r
            continue
        first["p"].extend(r["p"])
        first["m"] |= r["m"]
        first["iv"] = max(first.get("iv", -1), r.get("iv", -1))
        first["a"] = max(first.get("a", 0), r.get("a", 0))
    collapsed = len(by_key) - len(merged)
    by_key = merged

    # ── AND THE SAME SENTENCE TWICE IN ONE YEAR IS ONE ROW ON THIS PANEL ────
    # The block above deliberately leaves the cross-page pairs alone, and the
    # reason it gives is right about the RECORD: an ordinance printed at
    # introduction and again at final passage is two real events, and the
    # dataset and the block shards still carry both.
    #
    # It is wrong about this SURFACE. The panel is a list of what the Board did
    # in a year, and a reader looking at "Chain store rules would be loosened
    # across the city" printed twice, identically, cannot tell it is two stages
    # — there is nothing on the row that says so. It reads as the list being
    # broken. 2026 alone printed 49 sentences more than once, one of them three
    # times.
    #
    # So the panel keeps one row per sentence per year: the one with the most
    # places on the map, then the highest score. Nothing is deleted from the
    # record — this is the reading surface deduplicating itself, and the count
    # is printed separately from the same-page one so the two stay tellable
    # apart.
    seen_line: dict[tuple, dict] = {}
    for r in sorted(by_key.values(),
                    key=lambda r: (-len(r["p"]), -r.get("iv", -1))):
        if not r["pl"]:
            seen_line[id(r)] = r
            continue
        k = (r["y"], r["pl"])
        first = seen_line.get(k)
        if first is None:
            seen_line[k] = r
            continue
        first["m"] |= r["m"]
        first["a"] = max(first.get("a", 0), r.get("a", 0))
    restaged = len(by_key) - len(seen_line)
    by_key = seen_line

    # Ordered by year, then by what matters most inside it. The panel caps a
    # year, so the cap now falls on the least important rather than the
    # alphabetically last — which is the whole point of having read them.
    rows = sorted(by_key.values(),
                  key=lambda r: (r["y"], -r.get("iv", -1), -len(r["p"]), r["t"]))

    # ── THE RAW TEXT ONLY RIDES WHERE IT IS STILL NEEDED ────────────────────
    # `t` is here for ONE consumer: `record-line.ts`, which extracts a readable
    # sentence from the Clerk's words for rows we never wrote. A row that HAS a
    # written line never calls it — the panel prints `pl` and the scan is one
    # click away on the row's own link.
    #
    # Carrying it regardless took the shards from 190 kB to 2.9 MB each, which
    # would have made dragging the year slider a multi-megabyte download. This
    # is the whole reason the file is sharded by decade in the first place, so
    # the fix belongs here rather than in a loader.
    for r in rows:
        if r["pl"]:
            r["t"] = ""

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()

    by_decade: dict[int, list] = collections.defaultdict(list)
    for r in rows:
        by_decade[r["y"] // 10 * 10].append(r)

    per_year = collections.Counter(r["y"] for r in rows)
    marks_per_year = collections.Counter()
    for r in rows:
        marks_per_year[r["y"]] += len(r["p"])
    manifest = {
        "note": "located Board decisions, sharded by decade. One file per "
                "decade so moving the year costs at most one fetch. Columns "
                "are parallel arrays; `t` is the record's own text, verbatim.",
        "source": {
            "publisher": "San Francisco Board of Supervisors",
            "via": "blocks/theme-marks.board.json joined to blocks/block-NN.json",
            "script": "pipeline/scripts/us_sf_city/blocks/build_year_lines.py",
        },
        "n": len(rows),
        "nMarks": marks_in,
        "decades": sorted(by_decade),
        "perYear": {str(k): per_year[k] for k in sorted(per_year)},
        "marksPerYear": {str(k): marks_per_year[k] for k in sorted(marks_per_year)},
        "medianPerYear": sorted(per_year.values())[len(per_year) // 2],
    }
    (OUT / "index.json").write_text(json.dumps(manifest) + "\n")

    total = 0
    for dec, rs in sorted(by_decade.items()):
        # `pl` rides beside `t`: the rail is the surface a reader actually reads
        # on this page, and it was printing the Clerk's sentence raw. The written
        # line is ours, so `t` stays on the row and the rail can show both.
        cols = {k: [r[k] for r in rs]
                for k in ("y", "m", "k", "a", "u", "t", "cs", "ca", "g", "pl",
                          "iv", "p")}
        p = OUT / f"{dec}.json"
        p.write_text(json.dumps({"decade": dec, "n": len(rs), **cols}) + "\n")
        total += p.stat().st_size
        print(f"   {dec}s  {len(rs):5,} decisions   {p.stat().st_size/1024:6.0f} kB")

    print(f"   collapsed {collapsed:,} rows that repeat one act on one page")
    print(f"   collapsed {restaged:,} more that repeat one sentence in one year "
          f"— the same act at two stages; both stay in the record")
    print(f"\n{marks_in:,} marks -> {len(rows):,} distinct decisions "
          f"({marks_in/max(1,len(rows)):.2f} dots each); {missed} resolved to nothing")
    print(f"{total/1024/1024:.2f} MB over {len(by_decade)} decade files")
    ys = sorted(per_year)
    print(f"years {ys[0]}–{ys[-1]}, median {manifest['medianPerYear']} a year, "
          f"busiest {max(per_year.values())} ({max(per_year, key=per_year.get)}), "
          f"quietest {min(per_year.values())} ({min(per_year, key=per_year.get)})")


if __name__ == "__main__":
    main()
