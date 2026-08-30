"""The table that says what a row's `sm` bit means.

    website/public/data/us/sf/city/blocks/subjects.json

WHY THIS EXISTS. `build_index.py` already tags every placed decision with the
fiche's forty-one subjects, and it does it against **the item's own source
text** rather than the shortened line published on the row — its own note says
why: the published line is a median of 136 characters and the item behind it
520, so the same patterns re-run in the browser find a fraction of the record.
The answer rides on the row as `sm`, a bitmask.

**The browser could not read it, because the bit-to-subject table was never
published.** So the fiche went on running the patterns itself, over the short
line, and found 36 % of rows where the mask already knew 56 %.

This publishes that table and nothing else. Six kilobytes.

THE ORDER IS THE CONTRACT. A bit is a position in `build_threads.THREADS`, and
the masks already in the published shards are positional. Append new subjects
at the END of that list; reordering it silently relabels every row in the tree.
`themes.load_subjects()` is the one reader of that order and this uses it, so
the two cannot disagree.

Run:
    python3 pipeline/scripts/us_sf_city/blocks/publish_subjects.py
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
OUT = os.path.join(
    REPO, "website", "public", "data", "us", "sf", "city", "blocks", "subjects.json"
)


def main() -> int:
    sys.path.insert(0, HERE)
    import themes as TH  # noqa: E402

    subs = TH.load_subjects()
    payload = {
        "generated_by": "pipeline/scripts/us_sf_city/blocks/publish_subjects.py",
        "WHAT_A_BIT_MEANS": (
            "A row's `sm` is a bitmask over this list. Bit i is set when subject "
            "i matched the item's OWN source text in the pipeline — not the "
            "shortened line published on the row beside it."
        ),
        "ORDER_IS_LOAD_BEARING": (
            "The bit is the position in build_threads.THREADS. Append at the "
            "end; reordering relabels every mask already published."
        ),
        "n": len(subs),
        "s": [
            {"bit": s["bit"], "slug": s["slug"], "l": s["label"], "note": s["note"]}
            for s in subs
        ],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{len(subs)} subjects -> {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
