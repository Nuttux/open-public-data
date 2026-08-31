# `blocks/` — every block in San Francisco, clickable

**What this is.** A block → decisions index built from **142 of 142 Board of Supervisors
Journal volumes, 1906–1999 — the complete series — plus 44 Bureau of Engineering, Board of
Public Works, DPW and Park Commission annual reports.** The prototype makes ~27 curated
objects clickable. This makes **4,679 of the city's 5,404 assessor blocks** answer the
question *what did the city decide here*, with a page link per decision.

Built from three streams merged 2026-08-23; the merge, its measurements and its one-command
rollback are in `merge/BLOCK-MERGE.md`.

**What the renderer has to do:** load one 36 KB file at first paint, and one ~21 KB file
per click. Nothing else changes.

---

## 1. Files

Everything is under `blocks/out/`. Build with `python3 build_index.py` (offline apart
from the one-off `fetch_leafmap.py` scandata fetch).

> **THE PUBLISHED BUILD NEEDS BOTH CACHES, AND THE DEFAULT IS ONLY ONE.**
> `ITEMS` defaults to `blocks/cache/items.jsonl`, which is the Internet
> Archive's volumes and **stops at 2016**. The Clerk's own minutes, 2017–2026,
> are a second cache at `cache_sfbos/items.jsonl`. A build with the default
> completes, passes every gate, and silently publishes a map that ends in 2016 —
> 14,500 marks instead of 16,468. Concatenate them first:
>
> ```sh
> cat ../cache_sfbos/items.jsonl >> /tmp/items_merged.jsonl   # after the historic
> BLOCKS_ITEMS=/tmp/items_merged.jsonl python3 build_index.py
> ```
>
> Then publish `out/` into `website/public/data/us/sf/city/blocks/` and re-run
> `build_theme_marks.py` — the marks index into the shard rows by position, so
> shards published without rebuilding the marks leaves every `r` pointing at the
> wrong row. `verify_all.py` catches exactly that and did.

| tier | file | raw | gzip | when it loads |
|---|---|---|---|---|
| T0 | `block-index.json` | 123 KB | **36 KB** | **first paint, once** |
| T1 | `block-NN.json` × 256 | 22.5 MB | 5.4 MB | one shard per click (**~21 KB gz**) |
| T2 | `street/<KEY>.json` × 1,873 | 11.3 MB | 2.8 MB | ≤6 per click (**~1.5 KB gz each**) |
| — | `unplaced.json`, `shards.json` | 1 KB | — | never; provenance only |

A first paint loads **T0 only, 36 KB gzipped**, and that is enough to know which of the
5,404 blocks are clickable and how much each holds. A click loads **one** T1 shard
(~21 KB gz) and, only if the reader opens the "on this street" section, up to six ~2 KB
street files. Nothing about the 27 curated entries changes; this is additive.

### T0 `block-index.json` — first paint

Parallel arrays, **in the same order as `geo/cache/blocks.json`**, so `i` indexes both:

```jsonc
{
  "meta": { "n_blocks": 5404, "n_decisions_placed": 76419, "n_items_located": 91255,
            "n_unplaced": 14836, "shards": 256,
            "tier_names": ["street","corner","segment","addr","stated"],
            "precision_counts": {...}, "leaf_mapped_volumes": [...] },
  "b":  ["0001","0002", ...],   // assessor block id — the join key
  "n":  [12, 0, 31, ...],       // block-precision decisions (tiers 1-4)
  "ns": [140, 88, ...],         // street-precision decisions reachable via this block
  "y0": [1909, 0, ...],         // first / last year among the block-precision ones
  "y1": [1974, 0, ...]
}
```

`n[i] > 0` ⇒ the block is worth a click. `n[i] == 0 && ns[i] > 0` ⇒ clickable, but the
panel will only be able to say *on these streets*, not *here*. `n[i] == 0 && ns[i] == 0`
⇒ **324 blocks have nothing at all**; render them inert rather than clicking into an
empty panel.

### T1 `block-NN.json` — the click

`NN = (index of the block in b[]) % 256`, zero-padded to 2.

```jsonc
{ "0655": {
    "s": ["PINE|ST", "BUSH|ST"],          // street keys fronting this block -> T2
    "d": [                                 // block-precision, already ranked
      { "y": 1929, "d": "04-15", "k": "R", // year, MM-DD, R|O|M|W
        "p": 3,                            // 0 street 1 corner 2 segment 3 addr 4 stated
        "f": 1,                            // phase, index into PHASE_ORDER (below)
        "a": 8980,                         // largest SINGLE printed figure, 0 if none
        "u": "journalofproceed24sanfrich/1461",
        "t": "…payment for release of damages claimed to Lot 7, Block 2622…" }
    ] } }
```

Build the source link as:

```js
const [vol, leaf] = row.u.split("/");
const href = `https://archive.org/details/${vol}/page/n${leaf}/mode/1up`;
```

`"approx": 1` on a row means the page link may be a page or two off — see §4. Show those
rows with a softer label ("page ≈") rather than hiding them.

`k` is `R` resolution, `O` ordinance, `M` motion — and **`W`, a *work*, 3,588 rows from the
department annual reports rather than the Board**. `KINDW` has no entry for `W` yet, so
those rows currently label themselves "Item"; one dictionary entry in `gen/part4.html`
fixes it.

`f` indexes `["opened","building","decided","funded","contested","stalled","proposed"]`,
which is the same controlled vocabulary `phases.py` already collapses the hand-authored
beats onto, so an existing glyph/colour switch works unchanged.

### T2 `street/<KEY>.json` — "on this street"

`KEY` is the entry from `s[]` with every non-alphanumeric run replaced by `_`
(`"PINE|ST"` → `street/PINE_ST.json`). The payload is a plain ranked array of the same
row shape, capped at 120 per street. Street-tier decisions are stored **once per street,
not once per block** — there are 35,244 of them but 923,253 block links, a 26.2×
duplication that would have cost ~55 MB to materialise per block.

---

## 2. The precision tiers — the thing you must not flatten

`p` on every row. **A reader has to be able to tell "this happened at this address" from
"this happened somewhere on this street", and the UI is where that promise is kept.**

| `p` | tier | n | what it means | suggested wording |
|---|---|---|---|---|
| 4 | `stated` | 1,884 | the record names this assessor block in its own text | "the record names this block" |
| 3 | `addr` | 9,451 | a house number in the text falls inside this block's real parcel address range | "at 2426 Pine Street" |
| 2 | `segment` | 6,881 | "X street, between Y and Z" **or "from Y to Z"** — blocks on X between the two corners | "on this stretch of Pine" |
| 1 | `corner` | 22,959 | two streets in one item; blocks fronting both | "at Pine and Fillmore" |
| 0 | `street` | 35,244 | only a street name — **every** block fronting it | "somewhere on Pine Street" |

**One thing the `corner` tier hides.** 45 decisions in it are `bounded` placements — the
record named three or four streets that enclose ONE block ("bounded by Frederick, Willard
and Stanyan Streets"), and the index intersected them to that block. They are reported at
`corner` because a sixth tier name would render as a bare string with no wording; the
corner wording is true of them, just weaker than the record deserves. See
`merge/BLOCK-MERGE.md` §2.

Tiers 1–4 are in `d[]` and are about *this block*. Tier 0 lives in the street files and is
about *a street this block is on*. **Render them as two separate sections with different
headings.** Merging them into one list would tell the reader that a decision about the far
end of Geary happened on their block, which is the single worst thing this index can do.

---

## 3. Ranking (already applied — `d[]` and street files arrive sorted)

Score, highest first:

- **precision** `stated 3.6 / addr 3.0 / segment 2.0 / corner 1.5 / street 0.4` — a decision
  about *this* address outranks one about the street.
- **money** `+min(log10(amount) − 1.5, 2.2)` for figures ≥ $100. The **largest single
  printed figure**, never a sum: the Journal prints progress payments separately and adding
  them would invent a total that was never voted.
- **phase** `+1.0 opened · 0.8 building · 0.7 contested · 0.6 decided · 0.5 funded ·
  0.3 stalled · 0.0 proposed` — something the city finished or built reads better than a
  bill being referred to committee.
- **specificity** `−0.55·ln(streets+1)` — an item naming twenty streets is a list, not a place.
- **boilerplate** `−1.0` if the item is mostly a roll call, `−0.6` if under 140 characters.

Then two passes the reader actually feels: near-duplicate removal (the Journal reprints an
ordinance at every reading, and the OCR of the two printings differs — 4-word shingles,
Jaccard > 0.55 counts as a reprint) and **decade diversity** (at most 4 of the top 12 from
one decade, so a block does not show twelve 1928 paving orders and nothing else).

Take `d[]` in order. The first 8–12 are what a panel should show.

---

## 4. What is wrong with it, measured

Report these; do not round them away.

- **Join accuracy, against the source itself.** **906** block-precision placements land on
  items where the record *also* names its own assessor block. Those are independent
  ground truth. **84.8% land on exactly the stated block; 89.1% within 120 m (the
  adjacent block face); 93.9% within 250 m; 4.4% further than 600 m.** By tier:
  `addr` **90.4% exact** (n=722), `segment` **85.7%** (n=14), `corner` 60.6% exact / 72.9%
  within one block face (n=170) — a corner is a four-block object and behaves like one.
  Every tier improved over the 55-volume measurement, on a truth set 3.7× larger
  (was 75.4 / 83.2 / 91.8 / 5.3 at n=244). That is the accuracy of the index in each
  state, not a like-for-like test of one change; the controlled A/B is in
  `merge/BLOCK-MERGE.md` §2.
- **Geometry.** Every block–decision link was checked against the street centrelines,
  which never pass through the address table used to make the join: **0 of 1,013,301
  inferred links sit more than 200 m from a street the decision names**; 99.2% (addr) to
  100% (corner/segment) are within 120 m. The `stated` tier is exempt by construction and
  is reported separately — see `blocks/BLOCK-BLEED.md`.
- **What the reader sees.** 99.5% of published block-precision snippets name a street the
  block actually fronts.
- **Page links: 97,606 of 97,688 rows (99.92%) resolve through an exact leaf map**; 82 rows
  carry `"approx": 1`. The map now covers **186 volumes**. This was the largest defect found and it was silent. `/page/nN`
  addresses a BookReader *leaf*, and BookReader paginates only the leaves scandata flags
  `addToAccessFormats=true`, while the hOCR this pipeline counted from covers every leaf.
  The gap **grows through a volume** — 3 pages at leaf 253, 9 at leaf 1389 in the 1974
  volume — so a constant per-volume offset is wrong; that was measured against
  archive.org's search-inside first and discarded when the page images disagreed with it.
  `fetch_leafmap.py` builds the exact mapping from scandata for all 186 volumes, and the
  page counts match the hOCR page counts exactly in every one. A second trap found during
  the merge: scandata's `leafNum` is **0-based in some volumes and 1-based in others**, so
  anything that assumes a base silently mis-verifies a third of the corpus — the map is
  built by position and is unaffected (`sweep/BLOCK-SWEEP.md` §7). Confirmed by eye twice:
  1974 leaf 253 → `/page/n250`, whose scan is printed page 221 and carries the Sylvester
  House landmark ordinance (`/page/n253` is printed page 224 and does not); 1912 leaf 148
  → `/page/n148`, printed page 127, carrying the Western Athletic Club boxing permit at
  901 Golden Gate Avenue that the index attaches to block 0770.
- **Hand check, 40 random placements** (on the 55-volume corpus). ADDR 10/10 correct; SEGMENT 9/10; CORNER 10/10
  defensible (2 weak). Street tier: none *wrong* at its declared precision, but **6 of 10
  were uninformative** — the street was named somewhere in the city, not near the block.
  That is the honest character of tier 0 and the reason it is a separate section.
- **14,836 of 91,255 located items are not placed at all** and are counted, not guessed, in
  `unplaced.json`: 8,570 named streets only *after* their own roll call, 5,693 named a
  street fronting more than 60 blocks, 573 were omnibus lists of more than 6 streets.
  Unplaced grew **faster than the corpus** (+88.4% against +81.9% located): the post-1974
  volumes are typeset sparsely and lean on file numbers rather than street prose, so a
  larger share of them names no street of their own. That is the source, reported.
  The first bucket would be far larger still without the item-boundary fix: an item is
  located from its PREFACE — the title the Journal prints above it, which the splitter
  leaves on the item before — plus its body up to its own roll call. That fix now runs over
  **all 142 Journal volumes**, not just the original 55. See `blocks/BLOCK-BLEED.md` for
  the rule and `merge/BLOCK-MERGE.md` §7 for the extension.

### Known limits

- Two disconnected grids can share a name. Treasure Island has its own numbered streets;
  the type-aware key separates *Avenue* from *Street* (60 keys collided over 3,062 block
  links before that fix, which is what used to drop Mission decisions into the Sunset) but
  cannot separate two "8th Street"s.
- Items are split on `Resolution|Ordinance|Motion`, so some rows begin mid-sentence. That
  is the source, not the index. The LOCATION join no longer suffers from it (see
  `prefaces.py`); the displayed snippet still can. Spot-check #8 in
  `merge/BLOCK-MERGE.md` §6 is the live example: correctly placed on Lobos at Capitol, and
  displayed as "Southerly line of, at Capitol avenue westerly line, 321 feet", which is a
  grade-table row shorn of the "*Lobos Street.*" side-head printed above it.
- **The department reports do not read like the Board.** 113 two-column tables and 747
  rotated contract spreads in them are refused rather than guessed at, and they are the
  most costed pages in the Bureau of Engineering volumes — the largest recall win still
  available (`series/BLOCK-SERIES.md` §9).
- Street files are capped at the top 120 decisions per street.

---

## 5. Coverage — what a click actually hits

| | blocks | share |
|---|---|---|
| ≥1 decision of any precision | 5,080 | 94.0% |
| **≥1 block-precision decision** | **4,679** | **86.6%** |
| >5 block-precision | 3,740 | 69.2% |
| >25 block-precision | 1,216 | 22.5% |
| **nothing at all** | **324** | **6.0%** |

Median non-empty block: **15** block-precision decisions (p10 3, p90 40, max 235). It is not
a downtown-only index — the busiest 5% of blocks hold only **21.2%** of the links. South of
Market 72.3 avg, Tenderloin 53.9 and Chinatown 48.2 sit above Sunset/Parkside 13.5 and
Bayview 9.0, a five-fold spread, not a thousand-fold one.

**The depth grew far more than the reach**: blocks with *any* material rose 89, but blocks
holding more than 25 decisions **tripled**, 335 → 1,216. Bayview Hunters Point is still the
weakest large district and the biggest absolute winner: **30% of its 501 blocks have no
block-precision decision at all** (was 38%). Two holes are structural rather than thin:
**Treasure Island 0 of 36** (its own numbered street grid collides with the city's) and
**Lakeshore 6 of 78** (Lake Merced, the golf courses and SFSU). Per-neighbourhood
before/after is in `merge/BLOCK-MERGE.md` §5.

---

## 6. Rebuilding

```
python3 ../sweep/verify_parity.py   # ALWAYS FIRST: the two halves are one corpus
python3 extract_texts.py     # cached hOCR -> cache/items.jsonl   (~60 s, offline)
python3 headings.py          # cached hOCR -> cache/headings.json (the printed one-liner)
python3 prefaces.py          # cached hOCR -> cache/prefaces.json (the item's own title)
python3 prefaces.py --ia ../sweep/cache/ia --vols ../sweep/manifest.json \
        --out cache/prefaces_sweep.json --items ../sweep/out/items.jsonl
python3 ../merge/do_merge.py # the three streams -> cache/        (refuses on collision)
python3 fetch_leafmap.py     # archive.org scandata -> exact page mapping (network, once)

# THE CORPUS THE PUBLISHED INDEX IS BUILT FROM IS BOTH HALVES, AND THE JOIN IS
# THIS LINE. `cache/items.jsonl` ends in 2016 — the City stopped printing bound
# volumes over the 2016 summer recess — and everything after it is the Clerk's
# own PDFs, swept separately into `cache_sfbos/items.jsonl`. build_index reads
# ONE file, so the two are concatenated and named through BLOCKS_ITEMS. Order is
# historic then modern; the build is order-independent (verify_order_independence.py)
# so that is convention, not a requirement. Do NOT point BLOCKS_ITEMS at the
# merged file AND expect the sfbos half to be added again — it is already in it.
cat cache/items.jsonl \
    ../../../../pipeline/scripts/us_sf_city/cache_sfbos/items.jsonl \
    > cache/items_merged.jsonl                 # 124,284 rows

BLOCKS_ITEMS=cache/items_merged.jsonl \
python3 build_index.py       # -> out/                            (~7 min, offline)
python3 verify_themes.py --tree out   # the theme tag agrees with itself
python3 measure_accuracy.py  # the join accuracy in §4            (~1 min, offline)
python3 verify_geo.py        # the geometry check in §4           (~4 min, offline)
python3 ../gen/blocks_data.py

# ── AFTER PUBLISHING THE TREE, the things built ON it ─────────────────────
# build_index writes ONE source's marks (`theme-marks.board.json`); each other
# source writes its own and the merger concatenates them. Order matters only in
# that the merger must run last.
python3 ../build_place_marks.py    # the places -> theme-marks.places.json
python3 ../build_theme_marks.py    # every source -> theme-marks.json  (the map reads this)
python3 ../build_threads.py        # the fiche's 41, counted off the `sm` masks
python3 ../build_hood_records.py   # the neighbourhood paragraphs, off the same masks

# ── THE PUBLISHED DATASET ─────────────────────────────────────────────────
# `core` is the row-level table the shards are a projection of. It reads the
# frozen classification seed; re-running the classifier is a separate, deliberate
# act that changes a versioned file and shows up as a diff.
python3 freeze_classification.py   # hand labels -> pipeline/seeds/sf_bos_classification.csv
python3 build_core_table.py        # -> website/public/data/us/sf/city/records/

python3 verify_all.py              # EVERY gate, one command. Run before publishing.
```

## 7. The gates

`verify_all.py` is the list, and adding a gate means adding it there rather than
writing a script somebody forgets. It currently checks seven things:

| gate | what it guards |
|---|---|
| taxonomy slugs unique, subtopics belong | a duplicate slug silently merges two topics |
| every classification value is in the taxonomy | a value outside it renders blank and cannot be filtered — invisible, not wrong |
| subtopic matches its topic | a subtopic filed under the wrong topic double-counts one and empties the other |
| theme marks agree with the shards | the map drawing a mark the panel cannot open |
| `threads.json` is tagged in the pipeline | the browser re-matching a 136-character line, which finds 35% where the record yields 57% |
| core table gates | the dataset disagreeing with the taxonomy; a precisely located record with no block |
| no dot on a street-only record | the map saying HERE where the record said *somewhere on this street* |


**This recipe is proved, not asserted.** Run as above into a fresh `BLOCKS_OUT`,
the build reproduces `website/public/data/us/sf/city/blocks/` at **2,206 files,
0 differ** (258 block files + 1,948 street files), 2026-08-29. Before this line
was written the concatenation was tribal knowledge and a clone could not
reproduce the published tree at all — the second half of the corpus was simply
missing, and the index came out ending in 2016 with no error anywhere.

**Roll back to the pre-merge index at any time with `./merge/RESTORE.sh`.**

`extract_texts.py` re-walks the same cached bytes as `geo/sweep_minutes.py` and asserts it
reproduces it: **54 of 54 shared volumes come back with identical `(item_id, leaf)` sets.**
The two that differ are a cache file that has since gone corrupt (1976, in the old sweep
only) and a volume the old sweep lost (1998, recovered here).

The same discipline guards the merge. `sweep/verify_parity.py` re-runs the new extractor
against the OLD cache for volumes already in `items.jsonl` and compares every field:
**0 differing rows out of 5,623, across 4 volumes.** `prefaces.py` refuses to write if any
preface key fails to match an item the pipeline emitted (**0 of 32,962 on the new run**),
and the 1,169 keys the two walks share are **byte-identical**. `merge/do_merge.py` refuses
on any item-key collision or leafmap overlap (**0 of each**).
