# sf_data_audit.md — what else rotted in place

Audit only. Nothing here was built, fixed or published. Written 2026-08-26 on
`refactor/layering-us-br`, against `website/public/data/us/sf/city/**` at
`176bc575` and the code that reads it.

**The question this answers.** Tonight's fixes were all one bug: *a number or a
guard that was correct when written and silently became false as the data moved
under it.* Nobody edited them. This is a sweep of the published SF city data and
its readers for the same four shapes:

1. **a guard outliving its reason** — a clamp, floor or cap still enforcing a
   fact that has stopped being true;
2. **a field whose name lies** — a count of one thing standing in for a count of
   another;
3. **two independent statements of one quantity** — allowed to drift;
4. **an instrument measuring itself** — a number produced by the thing it is
   supposed to check.

**Rules kept.** Every claim below has a measurement under it, taken from the
shipped bytes, and the probe that took it is named. What was checked and found
CLEAN is listed in §B, because a list of only hits cannot be told from a shallow
pass.

**How the shipped bytes were read.** `.qc` chunks were decoded straight out of
the `QCT1` container (magic, header JSON, per-field dtype/offset/count) with a
30-line reader; the block shards, the manifest and the rollup JSONs were read as
JSON. Nothing was taken from a pipeline script's own report.

---

# A. THE HITS

## A1 · `hood-facts.json` is a rollup over shards that were rebuilt three times under it

**Shape 1 + 4.** File: `website/public/data/us/sf/city/blocks/hood-facts.json`,
`generated_at` **2026-08-24T19:09:26Z**. Read at runtime by
`components/us/city/block-records.ts:1481` (`loadHoodFacts`) and printed by
`components/us/city/CityBlockPanel.tsx:356-368`.

The file states its own contract in its own `note`: *"A rollup, not a new
measurement. Every figure here is a sum over the block-level files already
shipped."* That was true when written. Since then the block shards have been
rebuilt by three commits — `1f56663a` (the 2026 merge), `ccec8bd7` (the header
bleed) and `176bc575` (the stated block + header gift) — and the rollup has not.

**Measured**, by re-summing the published shards over the same membership the
file joins on (`base/blocks.qc`'s `hood` byte, via `base/blocks-id.json`):

```
                              hood-facts     live shards
  total decisions on blocks       91,391         101,662     short by 10,271 (10.1 %)
  neighbourhoods disagreeing on n     —           39 of 41
  neighbourhoods whose y1 is too early —          37 of 41   median 23 years early
  neighbourhoods printing a last year before 2000  21 of 41
```

Worked examples, straight off the panel's own sentence
(`us.sf.thecity.panel.hood_sum_record`):

```
  Bayview Hunters Point   panel: "4,514 things ... between 1906 and 2002"   shards: 5,361, to 2026
  Mission                 panel: "5,850 ... 1906 and 2010"                  shards: 6,806, to 2026
  South of Market         panel: "3,830 ... 1906 and 2002"                  shards: 4,782, to 2026
  Treasure Island         panel: "The Board's record places nothing in it."  shards: 5 rows on 2 blocks, to 2023
```

**What a reader sees.** Click any block in Bayview and the neighbourhood summary
tells them the Board's record there ends in **2002**. The decade rail directly
beside it, which reads `y1` live off `block-index.json`, draws a 2020s rung. The
panel contradicts itself on one screen, and the half that is wrong is the half
that reads like a fact about San Francisco.

`coverage.hoods_with_a_record` says **40**; live it is **41** (Treasure Island
gained a record and the counter did not).

## A2 · `accuracy.json` is the site's own honesty claim and it has never been rebuilt

**Shape 1 + 4.** File:
`website/public/data/us/sf/city/blocks/accuracy.json`. Read by
`app/us/city/sf/the-city/page.tsx:69` and printed as
`us.sf.thecity.note.accuracy`:

> *"Placement was checked against **906** decisions that print their own block
> number: **84.8 %** landed on it."*

It is also offered as a public export in the page footer
(`TheCityClient.tsx:301`).

**Measured.** `git log` on the file returns exactly one commit — `69d6799c`,
2026-08-23, *"the city map, ported from the mock into modular TypeScript"*. The
shards it scores have been rebuilt three times since, all on 2026-08-26. The
published index it was computed against has moved with them:

```
  block-index.json precision_counts, published today
      stated 4,534 · addr 18,066 · segment 7,119 · corner 24,210 · street 40,498
  accuracy.json's own answer key
      addr 722 + corner 170 + segment 14 = 906
```

The answer key cannot contain a single Clerk-era decision: `accuracy.json`
predates `1f56663a`, the commit that introduced the `c` citation field, and the
published block layer now carries **549 stated-tier links citing a Board PDF**
(`c === "b"`) — decisions from 2016–2026 that print their own assessor block and
were not in existence when 906 was computed.

**And the instrument cannot report its own staleness.** `measure_accuracy.py`'s
staleness assert compares `locate()`'s tier counts against
`scratchpad/.../out/block-index.json`, and that file is stale in the same
direction, so the assert passes. MINUTES.md §24.6 measured the honest figure for
the index as published as **86.5 %** on a key of **4,704 items / 3,043 scored**,
and **88.5 %** once the Clerk's own block wording is read. The page prints 84.8 %
on 906.

**What a reader sees.** A journalist checking the method is told the placement
was validated against 906 decisions. The evidence base is more than three times
that, and the score is understated by roughly 2–4 points. The number is wrong in
the project's favour on the sentence that exists to say it is not.

## A3 · The reader is told the whole 1906–2026 record is held by the Internet Archive

**Shape 1 + 2.** `i18n/en.ts:4786`, filled from
`app/us/city/sf/the-city/page.tsx:107-129`:

> *"They are read from **{volumes}** scanned volumes of the Board of
> Supervisors' minute books and the department annual reports, **{span}**, held
> by the **Internet Archive**."*

**Measured** on the published `block-index.json`:

```
  {volumes} = meta.leaf_mapped_volumes.length            329
  entries in that list that are Clerk PDFs (bag*)          0
  {span}   = min(y0)-max(y1)                       1906-2026
  rows on the block layer citing sfbos.org (c === "b")  4,259 of 101,662
  Clerk PDFs behind them                                  390
```

The span was correctly un-clamped tonight — `page.tsx:114-129` records exactly
why. The sentence around it was not. The 329 volumes stop at 2016; the ten years
the span now advertises come from 390 PDFs the Clerk posts and no library has
accessioned, which MINUTES.md §7 states in so many words. The footer's source
line (`TheCityClient.tsx:297`) names *"DataSF · Internet Archive · USGS · US
Census"* and does not name the City Clerk either.

**What a reader sees.** A claim of provenance that is false for the most recent
decade of the record, attributing a born-digital city file to an archive that
does not hold it. This is the *opposite* direction of the 1999 error MINUTES.md
§1 calls the worst class of error this project can ship, and it is the same
mechanism: a fact about our own corpus printed as a fact about the world.

## A4 · The GL page still floors undated street trees at 1955

**Shape 1.** `lib/citygl/layers/trees.ts:146`:

```ts
const key = (j: number): number =>
  yr[j] === 0 ? TREE_EARLIEST : TREE_YEAR_BASE + yr[j];
```

with a comment at line 135 asserting *"The Canvas renderer takes that literally
(`trees.ts` §the undated trees) and so does this"*.

**The Canvas renderer stopped taking it literally on 2026-08-24.**
`lib/city/time.ts` §THE UNDATED TREES replaced the floor, `lib/city/trees.ts:1061`
now reads the per-tree street year, and the pipeline shipped a new field for it.

**Measured** over the 129 shipped `tree/*.qc` chunks:

```
  street trees drawn                          195,310
  carrying no planting date (yr == 0)         125,234
    ... gated on their own street's year (syr > 0)  59,446
    ... drawn in every year (syr == 0)             65,788
  the field `syr` is present on every tree chunk    yes
  readers of `syr`:  lib/city/trees.ts        1
                     lib/citygl/**            0
```

**What a reader sees** at `/us/city/sf/the-city-gl`: 1954 has zero street trees
and 1955 has 125,234 — the cliff BUGS.md §24 measured at 7.6× the whole of
1955→1960 — and San Francisco's oldest street trees drawn as its newest (the
undated cohort is the thick-trunked one: 8,833 of the 9,703 trees over 24 in DBH
carry no plant date). The route is live and directly addressable; it is not
linked from any nav, which is the only thing keeping this off the top of the
list.

## A5 · Two rows of the "carries no date" table are stale, and one of them is not the claim it is filed under

**Shape 1, 2 and 3.** `lib/city/time.ts:365-380`, `UNDATED`. Summed by
`undatedTotal()` and printed verbatim by `components/us/city/CityScrub.tsx:586,
659-661` as `us.sf.thecity.scrub.undated`:

> *"**128,690** of the **367,614** buildings, streets, trees and named places on
> this map carry no date in any published file, and are drawn in every year."*

**Measured** against the shipped chunks:

| row | `time.ts` says | the files say | probe |
|---|---|---|---|
| trees | 125,234 of 195,310 | **125,234 of 195,310** ✓ | `tree/*.qc` `yr` |
| **streets** | **424 of 4,895** | **1,929 of 4,895** | `base/street-lines.qc` + `strt/street-lines-2.qc`, `yr == 0` |
| buildings | 23,487 of 166,166 | **23,487 of 166,166** ✓ | `u` bits 3 and 4 |
| **places** | **116 of 1,243** | **790 of 2,199** | `base/places.qc` `yr == 65535` |

The centreline figure is out by 4.5×. `manifest.centrelines` states the same
quantity from the other side and agrees with the files (4,895 − 2,966 dated =
1,929). No predicate I could construct over the shipped fields returns 424:
undated-and-covered is 1,664, undated-and-uncovered is 265. Add the unimplied
layer and the drawn undated line count is **2,670 of 5,741**.

The places figure is out by 6.8× on `n` and 1.8× on `of` — the register grew to
2,199 and the row was not re-derived.

**And the places row is under the wrong sentence entirely.** The caption's claim
is *"drawn in every year"*. `lib/city/labels.ts:703-736` §NOYEAR does the
opposite for exactly this cohort: `yr = 65535` means the name is **held** on
every dated frame. So 790 place names are counted as things drawn in every year
by a caption printed beside a map that refuses to draw them in any dated year.

**Corrected, from the files:** things genuinely undated is **151,440 of
368,570** (125,234 trees + 1,929 centrelines + 23,487 footprints + 790 places);
things genuinely drawn in every year is smaller again — see A6.

## A6 · The same sentence says 125,234 undated trees are "drawn in every year". 59,446 of them are not.

**Shape 1 + 3, and it is in the same file as its own correction.**
`lib/city/time.ts` §"AND 'EVERY YEAR' WAS TOO MUCH: THE STREET GATE, BUILT
2026-08-26" documents the change and prints the number: *"undated trees gated on
their street's year 59,446 (47.5 %)"*. The `UNDATED` table forty lines below it
still carries no `everyYear` for the trees row, which `undatedTotal()` reads as
*the whole cohort is*.

**Measured**, `tree/*.qc`: of the 125,234 undated, **59,446** carry `syr > 0` and
are held until their right of way is drawn; **65,788** draw in every year.

So the caption's `everyYear` — 128,690 — over-counts by **59,446** on the trees
row and by **116** on the places row (the whole of that row's contribution, since
none of those names is drawn on a dated frame at all — A5), against an
under-count of **1,505** on the streets row. Net **−58,057**. The number a reader
is shown for *things drawn in every year* is **128,690**; the files say
**70,633** = 65,788 trees + 1,929 centrelines + 2,916 footprints + 0 places.

## A7 · A hearing renders as "Item"

**Shape 1.** `components/us/city/block-records.ts:116-121`, `KIND_WORDING`, has
`R O M W` and no `H` or `F`. Three call sites take `?? "Item"`
(`CityBlockPanel.tsx:267, 581, 671`).

**Measured** over the 256 published shards: the `k` byte now takes six values —

```
  R 60,448 · O 32,365 · M 5,155 · W 3,593 · H 100 · F 1
```

`H` and `F` were introduced by `ccec8bd7` (MINUTES.md §23.4: header-delimited
items the `Resolution|Ordinance|Motion` splitter could never see, 896 of them
Hearings). MINUTES.md §23.8 flagged it and it is still open.

**What a reader sees.** 101 rows — contested land-use appeals, charter
amendments, closed sessions — labelled *Item* on a panel where every other row
is labelled with the thing the Board actually did. Nothing lies; a hearing is
simply not called one.

## A8 · Two lines quoted on a neighbourhood are no longer on the block they name

**Shape 1, downstream of A1.** `hood-facts.json`'s `highlights` are the Board's
own printed lines with a block id and an archive citation, rendered by
`CityBlockPanel.tsx` (`hood_hl_*`).

**Measured**, joining every highlight's `(block, citation)` against the
published shards:

```
  highlight lines shown on the neighbourhood panel   120
  whose citation is no longer on the block they name   2
     Golden Gate Park   block 1264  journaljanaprofproceed82sanfrich/11   1987
     Sunset/Parkside    block 7213  journalofproceed48sanfrich/383        1953
```

Small — and it is reported because the *rate* is the useful number: the rollup's
quoted evidence survived three rebuilds at 118/120. Fixing A1 fixes this.

## A9 · The manifest's tier counter disagrees with the manifest's own chunk list

**Shape 3.** `website/public/data/us/sf/city/manifest.json`, offered to readers
as the catalogue (`us.sf.thecity.note.sources`, and a footer export link).

```
  manifest.tiers.base          chunks 15   bytes 1,383,092   gzipBytes 695,040
  manifest.chunks, tier "base" chunks 16   bytes 1,437,983   gz sum   721,048
```

The per-chunk `b` fields are all correct — every one of the 577 chunk entries
matches its file's size on disk, byte for byte. It is the **tier rollup** that is
frozen: it reads `{15, 1383092, 695040}` unchanged across `c08deeb8`, `d459b962`
and `04e69ae2` while `base/places.qc` grew 44,366 → 48,844 → 51,083 and
`base/heroes.qc` 39,900 → 41,640 underneath it. The cause is structural and
already named in DATA-TRUTH.md §12.3: `emit_places.py --marks` and
`emit_heroes.py` are re-applied *after* the encoder writes the tier totals.

Nothing in the draw path reads `chunks` or `bytes` — `scene.ts:1738` reads only
`minZ` — so no frame is wrong. What is wrong is a published catalogue that
contradicts itself in the same file.

## A10 · The comment-level drift cluster — eight numbers that will be used to re-judge a decision

None of these is on screen. Each is the number a future reader will use to decide
whether a rule is still right, and each is now wrong. Eight rows, one job.

| where | says | the files say | probe |
|---|---|---|---|
| `lib/city/streets.ts:582` | *"Only **2,051** of the 4,895 carry a date the Board voted"* | **2,966** carry `yr != 0` | the two `strt-line` chunks |
| | | *2,051 is `film.json` `st.n`, the accepted-street VOTE count — a different quantity, because `exist_year()` also dates a line from the earliest assessed building on its frontage (DATA-TRUTH §3.3)* | |
| `lib/city/labels.ts:753` and `components/us/city/CityMap.tsx:136` | *"**684** of 2,199 places … genuinely carry NO published kind, because the registers that DESIGNATE a place are the registers with no category"* | **857** (`base/places.qc` `kind == 0`). **684 is the Article 10 + Article 11 row count** — 339 + 345 in `manifest.places.bySource`, and `labels.ts:412` uses it correctly for exactly that. Used here it is a count of one thing standing in for a count of another, and it hides the **173** kindless rows that come from registers which DO publish a category (`nc68-ngbr` 95, `ib5c-xgwu` 33, `nps-nrhp` 37, `gtr9-ntp6` 3, `65ik-7wqd` 2, 3 seeded) — the population the sentence's own reasoning cannot explain and nobody is therefore looking at | the same comment cites 1,342 with a kind two lines away; 2,199 − 1,342 = 857 |
| `manifest.json` `kinds.bldg.note` | *"The **15,261** SOLOS"* | **15,265** (`base/solo.qc`), and `manifest.buildings.nSolo` says 15,265 | one file, two answers |
| `components/us/city/block-records.ts:1038` | *"**978** of the **4,679** blocks that carry anything"* have a repeated printed heading | **992 of 4,771**, replaying `printedHeading` + `foldHeading` over all 256 shards | |
| `components/us/city/CityBlockPanel.tsx:298` | *"**401** hold nothing of their own … the median block reaches **95** street decisions"* | **335** and **103** | `block-index.json` `n`/`ns` |
| `components/us/city/block-records.ts:276` | `RAIL_TO = 1990`, under a comment arguing *"**2010** because the corpus is NOT Journal-only"* | the constant and its own justification disagree; both are dead, because `decadeGroups` takes `max(RAIL_TO, current decade, …)` | |
| `blocks/block-leads.json` `meta.blocks_with_a_record` | **4,679** | **4,771** | shards with a non-empty `d` |
| `components/us/city/scene.ts:1753` | *"the `strt` tier (`minZ` **2.9**, **125** chunks)"* | `manifest.tiers.strt` is `minZ` **1.75**, **128** chunks | |

---

# B. CHECKED AND CLEAN

Recorded so nobody looks again.

**The buildings payload is exact.**
* 166,166 footprints across the 139 `bldg`-kind chunks = `manifest.buildings.n`.
* `base/solo.qc` = 15,265 = `manifest.buildings.nSolo`.
* `time.ts` `BLDG_YEAR_FLAGS` — FLAG_BLOCKYEAR **20,571**, FLAG_NOYEAR **2,916** —
  reproduce **exactly** from bit 3 and bit 4 of the shipped `u` byte. This is the
  one number in `time.ts` that was wired to the payload rather than typed, and it
  is the one that did not rot.
* `facades.ts:384`'s *"14,532 of 166,166, 8.75 %"* storeys-not-published:
  **exact**, `st == 0`.
* `palette.ts:620`'s pitch population — *"15,854 footprints dated before 1907 and
  14,555 of those single or multi family — 8.76 %"*: **all three exact**, and
  15,854 is correctly the pre-1907 count *excluding* the 2,916 FLAG_NOYEAR
  placeholders (raw `yr < 1907` is 18,250).
* `palette.ts:479`'s *"6,066 footprints the roll leaves as `mixed or not
  stated`"*: **exact for the population it means** — `use == 6 && !FLAG_NOYEAR`.
  (`use == 6` alone is 8,365; the phrasing is loose, the arithmetic is right.)
* The tallest shipped `h` is **260** — the u16 widening of DATA-TRUTH §17 is in
  the published chunks and no building is clipped at 255.

**The shipyard cliff is gone from the published data, not just from the mock.**
`base/massing.qc` gives block 4591A `(1950, 0), (1989, 14)`, 4591B `(1981, 31)`,
4591C `(2016, 20)` — DATA-TRUTH §12.1's figures, in the bytes the browser
fetches.

**Chunk integrity, all 577 entries.** Every `k` and `kind` in the manifest
matches the chunk header inside the file; every `b` matches the file's size on
disk; no `.qc` on disk is missing from the manifest and none in the manifest is
missing from disk. The only manifest disagreement found anywhere is A9's tier
rollup.

**Per-layer counters that DO reconcile with their chunks:**
`centrelines` (4,895 / 2,966 dated / 4,361 covered / 14,432 vertices),
`streetsUnimplied` (846 / 105 dated / 741 undated),
`streetLabels` (2,786 / 2,473 distinct — every name in the two chunk name tables
is distinct / 1,386 dated), `trees` (195,310 + 50,897 canopy),
`places` (2,199), `landmarks` (14 heroes, 145 parts, 59 caps summing correctly by
profile), `form` (478), `surround` (416 × 280 = 116,480 dem nodes),
`buildings.paintSampled` (166,042).

**The block index reconciles with itself and with the shards.**
`precision_counts` sums to `n_decisions_placed` (94,427); `unplaced.json`'s three
reasons sum to `n_unplaced` (18,432) and both agree with `block-index.json`;
`sum(n)` over the index equals the 101,662 links counted by walking all 256
shards; `shards.json`'s `street_shards: 1948` equals the file count in
`blocks/street/`.

**The year clamps that were fixed are fixed, and they are fixed by derivation
rather than by a new constant.** `indexedLastYear()` reads `max(y1)` = 2026 off
the shipped index; `afterSeries` is `dec > lastDec` and is therefore false for
every decade, so the "not scanned" hatch is off everywhere; `partialTo` puts
*"The 2020s above is not a full decade — it covers 2020–2026"* on the last rung;
`SERIES_LAST_YEAR = 2016` is a true statement about the Archive's shelf and the
caption above it (`rail_shelf_end`) is the corrected two-systems sentence.
The `span` on the page is `min(y0)`–`max(y1)`, live.

**The demolition floor is read, not remembered.** `block-facts.json` publishes
`from_decade 1980` / `from_year 1983` with the reason attached, and
`block-records.ts:1278` reads it with a matching fallback.

**The Golden Gate is no longer stated twice.** BUGS.md §31's finding — that
`drawBridge` read the module-level `GGB` const instead of the record — is closed:
`landmarks.ts:912, 942, 946` all read `deck.year ?? GGB.year` etc., and
`base/bridge.qc` now carries per-bridge `rn`/`tn` and a `bridges[]` block with
both spans. `manifest.landmarks.bridge.year` (1937), `base/places.json` `ggbYr`
(1937) and `GGB.year` (1937) agree.

**`block-landuse.json` is the model for how to do this.** It carries
`generated_at`, `data_through`, a per-decade `partial` flag on the current
decade, and a `coverage` block that reconciles 54,478 source rows down to the
36,058 placed. Nothing in it needs re-deriving to be trusted.

**Not a defect, but a hazard that was never discharged.** `streets.ts:606` says
the `cov` mask exists twice on the wire — in `base/street-misc` and in the line
chunks — and that *"the two must be asserted equal rather than assumed to be"*.
Measured: both carry **4,361** ones over 4,895 features, so the populations
agree, but they differ in **848** positions under the naive concatenation order,
so the two copies are not positionally comparable and the assertion the comment
asks for cannot be written as a positional compare. `base/street-misc`'s copy is
still read by nobody.

---

# C. THE TEN THAT MATTER

Ranked by what a reader is misled about, not by how interesting the bug is.

1. **Every neighbourhood panel understates the Board's record and says it ended
   decades ago.** `hood-facts.json` is a summary of block files that have been
   rebuilt three times since it was written: 39 of 41 neighbourhoods print a
   decision count 10 % too low, and 37 print a last year a median of 23 years too
   early — Bayview reads *"1906 and 2002"* where the map itself now reaches 2026.

2. **The map's own accuracy claim was measured once, on 2026-08-23, and never
   again.** The page says placement was checked against 906 decisions and 84.8 %
   landed — the evidence base is now more than three times that and the honest
   score is nearer 88.5 %, and the script's staleness check cannot fire because
   the file it compares against is stale in the same direction.

3. **The reader is told the whole 1906–2026 record is held by the Internet
   Archive.** It is not: the last ten years are 390 PDFs the City Clerk posts,
   4,259 rows of the map cite them, and neither the "329 scanned volumes" nor the
   footer's source line mentions the Clerk at all.

4. **The WebGL version of the page still grows every undated street tree in
   1955**, drawing San Francisco's oldest street trees as its newest — the exact
   bug that was found and fixed on the main page two days ago, still live in the
   second renderer because the fix was made in one file and not the other.

5. **The caption under the year rail says 424 street centrelines carry no date;
   the shipped file says 1,929**, and it says 116 named places carry none when
   the file says 790 — the register nearly doubled and the two numbers beside it
   did not move.

6. **The same caption says all 125,234 undated trees are "drawn in every year".
   47.5 % of them are no longer** — they were put on their own street's clock
   this morning, by a change documented forty lines above the table that still
   claims otherwise.

7. **101 hearings and charter amendments on the block panel are labelled
   "Item"**, because the word list that turns a record's type into English was
   written before those two types existed.

8. **Two of the 120 Board lines quoted on neighbourhood panels are no longer on
   the block they name** — a reader clicking through lands on a page about
   somewhere else. Fixing #1 fixes this.

9. **The public catalogue contradicts itself**: `manifest.json` says its base
   tier holds 15 files and 1,383,092 bytes, and its own file list in the same
   document holds 16 and 1,437,983, because two chunks are rewritten after the
   totals are taken.

10. **Seven comments carry counts that a future reader will use to re-judge a
    rule, and each is now wrong in the same way** — sharpest are `streets.ts`,
    which says only 2,051 of 4,895 centrelines carry a date when 2,966 do
    (2,051 is the film's count of Board *votes*, a different quantity), and
    `labels.ts`, which says 684 places carry no kind when 857 do — 684 being the
    Article 10 + Article 11 row count, which hides 173 kindless rows that come
    from registers that *do* publish a category and which nobody is looking at.

---

## What was NOT covered

* The film payload's per-shot copy and citations (`film/film.json`, 11 shots) was
  checked for span and shape only — `scans.json`'s volume→year rule (`year =
  volume + 1905`) reproduces on both scans that carry one, but the quoted
  sentences were not re-read against their archive leaves.
* Rendering thresholds with no data claim attached (`SHADOW_MIN_PX`,
  `ST_SRF_PX`, `BLOB_MIN_M2`, the `wpx < 1.2` tree floor, `ZEX_BY_STEP`) were
  read and left alone: they are picture decisions, already measured in DRAW.md,
  and a reader is not told a number about any of them.
* `blocks/street/*` (1,948 files) was counted, not read. 26 are untracked in git
  — new from the latest build — and DATA-TRUTH/MINUTES §21.6 records 17 orphans
  the current build no longer produces.
* `base/canopy` genuinely carries no year field; that is declared in `time.ts`
  and is a treatment, not a defect.
