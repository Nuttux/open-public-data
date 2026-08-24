# The block fiche — what happened here, over time

**Owner: Block T1, then B4.** Files: `CityBlockPanel.tsx`, `block-records.ts`, and — since
B4 — the `fx-block-*` rules in `fusion.css`, the `us.sf.thecity.panel.*` keys in `en.ts` /
`fr.ts`, and `block-records.test.ts`.

Daniel's sentence, which is the whole brief:

> "beautiful and simple fiches of blocks or streets/buildings where when someone clicks its
> simple and obvious what happened over time and exploration is easy to understand what doc
> contains what"

Three demands. Before tonight the panel answered none of them: it printed the block id, a
count, and a flat ranked list of five sentences with a "see 19 more" fold. A reader looking at
block 0572 learned that the city decided twenty-four things there and nothing about *when* or
*what*.

---

## 1. What the material actually is (measured, not assumed)

Sampled 24 of the 256 shards — 8,325 rows over 469 blocks — plus a second pass over 40 shards
for the gloss and span figures.

| | |
|---|---|
| decisions per block | median **14**, max 145 in the sample (235 city-wide per INTEGRATION §5) |
| year range | **1906 – 2010**. Not 1906–1999: 32 rows in 60 shards come from the 2002 and 2010 DPW annual reports. A hardcoded decade rail would have silently dropped them. |
| decades a block touches | median **5**; only 66 of 722 non-empty blocks sit in a single decade |
| kinds | R 4,884 · O 2,890 · W 321 · M 230 |
| `g` (where the line came from) | `s` sentence 6,649 · `p` heading+sentence 1,078 · `h` the Board's own heading 598 |
| tiers in `d[]` | corner 5,013 · addr 1,642 · segment 1,536 · stated 134 |
| **empty gloss** | **110 of 15,347 = 0.72%** — `build_index.rec()` deliberately prints no line rather than invent one |

### The finding that changed the design

**A money figure is always already inside the line it sits on. 314 of 314 rows with `a > 0`
have that figure printed in `t`.** That is forced by `build_index.rec()`: `shown` is only
non-zero when the regex matched *inside* `line` and `line` holds exactly one figure. So the old
panel's `· $8,980 printed on the page` in the source label was printing the same number the
reader had just read one line above. Removed. The figure is now **emphasised where it already
stands**, inside the record's own sentence, which is both shorter and more honest — it shows
the reader the number *in its sentence*, so they can see what it was for.

---

## 2. What the panel does now

The margin is **288 px wide, 252 px of content** (`--fx-city-ledger`, `fusion.css:17020`).
Everything below is designed for that width, not for a page.

### a. The lead — three derived facts, no invention

One short paragraph, assembled only from fields that exist:

- how many decisions and across what years — `d[].y`
- which decade holds the most of them
- whether the record goes quiet, and when — printed only when the last decision is more than
  fifteen years before the last year the block's own record reaches

Nothing is classified, nothing is summarised by a model, and no topic is named.

### b. The shape — a decade rail

The centre of the fiche and the answer to "over time". Every decade from the block's first to
its last, in order, and **the empty ones are drawn too** — a block that was busy in the 1920s
and silent after 1935 shows that as a run of empty tracks, which is the thing a list of
sentences cannot show.

Per decade: the label, a bar proportional to the busiest decade on this block, the count, and
**the strongest line of that decade** underneath (rows arrive ranked, so the first row of a
decade group is its best one; rows with an empty gloss are skipped when choosing it).

Clicking a decade opens **that decade's own shelf** in place. The rail is therefore both the
overview and the navigation — the reader never meets an undifferentiated list of forty
entries, and the top-ranked decision on the block is always visible unexpanded because it is
the headline of whichever decade it belongs to.

### c. Each row: the house archive contract

`components/fiche/FicheArchiveShelf.tsx`, unchanged and reused. Three things per document:

1. the line the volume prints — the record's own sentence, never a mid-sentence OCR window
2. what it is and when, linked to the leaf of the scan: *Ordinance · 15 April 1929*
3. the series it is held in, and how precisely the record places it

The precision wording is `TIER_WORDING` and is the promise INTEGRATION.md §2 makes. It stays.

### d. Street-tier stays a separate section

35,244 of the 76,419 placed decisions name a street and nothing narrower. They are not a claim
about this block and they keep their own section, their own sentence and their own fetch.

---

## 3. Rules I kept

- Every line traces to a scanned page and links to it. Nothing is generated.
- No jargon in reader-visible text: no tier names, no phase vocabulary as bare words, no file
  names, no `p`/`f`/`g`.
- **`W` is a departmental work, not a Board vote.** 3,588 rows come out of annual reports and
  calling one a resolution would attribute a decision to a body that never took it.

---

## 4. Decisions taken, and what they cost

### The rail is drawn across the series, not across the block

`decadeGroups` emits every decade from 1900 (or earlier, if a block holds something earlier)
to 1990 (or later), **empty ones included**. An empty decade draws as a 2 px flatline against
the 7 px bar of a decade that holds something, so a block that was busy until 1947 and silent
afterwards shows the silence rather than leaving it to be inferred from an absence.

Block 1147 in Lone Mountain is the case that proves it: two decisions, 1916 and 1977, and nine
flatlines between and around them. A ranked list of two sentences said nothing at all.

### "Went quiet" is anchored on the Journal, not on the rail

First version anchored it on the end of the rail (2010, because of the DPW annual reports) and
told a reader that block 3704 — 235 decisions, last one 1999 — had **"nothing in the record
after 1999"**. That reads as a block falling silent and is really the Board's own series
running out. `SERIES_END_DECADE = 1990` is the anchor now, and a block has to fall two whole
decades short of it before the sentence appears at all. 3704 no longer says it; 1705
(Sunset/Parkside, last decision 1947) and 1147 (last 1977) do, correctly.

### The headline prefers the Board's own printed heading

`d[]` is ranked by interest, and the top-ranked row of a decade is often a body sentence that
starts mid-clause, because items are split on `Resolution|Ordinance|Motion` and the split lands
inside a line. Block 3704's 1900s used to head with *"Elser, for repaving Mission street
between the westerly line of Fifth street…"*.

`pickHeadline` looks at the **top 3 ranked rows of the decade only** and prefers one whose line
is `g === "h"` — the heading the Board printed above the item — then `g === "p"`, then falls
back to rank order. `h` before `p` because `p` is that heading *composed with* the sentence
under it and the composition can join two things the page kept apart: *"Standardization of
Salaries — Read and ordered filed. Paving of Mission Street."* It looks no further than three
so a much better-ranked row is never demoted for a tidier line.

The same block's 1900s now heads with *"Authorizing Payment of $13,500 to Pacific Coast
Waiters' Ass'n for Certain Land Required for Fire Department Purposes."* Block 0013 in North
Beach reads, decade by decade: street lights, a shipping platform permit, street lights again,
the acceptance of Jefferson Street's roadway, two silent decades, an underground district on
Mason, tour bus parking on Hyde, a state Corrections lease. Every one of those is a heading the
Board wrote.

### Three things the old panel printed twice, now printed once

- **the money.** `a` is only ever set when the figure is printed INSIDE the line — 314 of 314
  sampled rows bear that out — so `· $8,980 printed on the page` restated a number the reader
  had just read in the sentence that says what it was for.
- **the year.** The shelf renders `title · year`, and the title already carried the full date,
  so every row ended `15 April 1929 · 1929`.
- **the link affordance.** "Every line links to the page of the scan it was read from" ran in
  the lead of all 5,404 fiches and cost two lines of a 252 px panel to say what the ↗ says.

### A block-level "largest sum" line was built and then cut

`blockShape` computed the largest single printed figure and its year, and it rendered as a
third derived sentence under the lead. Cut, and the field with it. Sums from 1909 and 1985 are
not comparable without a deflator this page does not have, the figure is already visible in the
sentence it belongs to, and a fiche that opens with three sentences of derived summary before
any of the record is not the simple thing that was asked for.

### Two state bugs the rework introduced and closed

- **an open decade survived a new block.** `<details>` keyed on the decade is the same DOM node
  from one block to the next, so a reader who opened the 1920s on one block met the next block
  with its 1920s open. The rail is keyed on `blockId` and remounts.
- **the scroll position survived a new block.** The panel does not remount between picks — same
  component, new props — so a reader who scrolled to the 1970s and clicked another block on the
  map landed halfway down a fiche whose top they had never seen.

### Blocks with nothing of their own open their street section themselves

**401 of the 5,404 blocks** hold no block-precision decision but do front a street the record
knows (324 more hold nothing at all, and still say so in the old words). Leaving the disclosure
shut handed those readers one sentence and a closed fold. They now arrive with the street
section open, and the empty-block sentence is branched so the "some blocks carry nothing at
all" line is only used when that is actually true.

---

## 5. What I could not source

- **What a decision was *about*.** There is still no topic on a row — `f` is a phase
  (`opened`/`building`/`decided`/…), not a subject — and nothing here classifies one. **B4
  found the part of this that is countable**: the Board printed its own subject above the item,
  and those printed subjects repeat. See §8.
- **Buildings and addresses as objects.** The material places decisions on **blocks** and on
  **streets**. Addresses appear inside the sentences (`addr` tier is a house number falling
  inside the block's parcel range) but there is no address entity to click, so "fiches of
  buildings" is not reachable from this index as it stands.
- ~~**How much of a street's record is near this block.**~~ **Closed by B4.** `ns` is passed
  into `BlockContext` by `CityMap.onPick` and the lead now says it, as a press that opens the
  street section and takes the reader down to it. Block 1147 opens with *"Another 672 decisions
  run along the streets this block fronts"* instead of two sentences and a shut fold.
- **Anything after 1999 at Board precision.** The Journal series ends there. The 2000s and
  2010s rows are DPW annual reports and are thin — 32 rows across 60 shards.

---

## 6. Notes for the owners of files I may not touch

Recorded, not edited.

### `src/i18n/en.ts` — twelve keys to add

The fiche reads them through `tx()`, which prefers a real dictionary entry and falls back to
the English declared in `CityBlockPanel.tsx` (`EN`). Adding these takes them over with no
change to the component; the `EN` block can then be deleted.

```ts
'us.sf.thecity.panel.lead': '{n} decisions the record places on this block, {y0} to {y1}.',
'us.sf.thecity.panel.lead_one': 'One decision the record places on this block, in {y0}.',
'us.sf.thecity.panel.shape_busiest': 'The {decade}s hold the most of them.',
'us.sf.thecity.panel.shape_quiet': 'Nothing in the record lands here after {y}.',
'us.sf.thecity.panel.rail_head': 'Decade by decade',
'us.sf.thecity.panel.rail_hint': 'Open a decade to read what the record holds there.',
'us.sf.thecity.panel.rail_aria': '{decade}s — {n} decisions on this block',
'us.sf.thecity.panel.rail_empty_aria': '{decade}s — nothing on this block',
'us.sf.thecity.panel.decade_more': 'See {n} more from the {decade}s',
'us.sf.thecity.panel.decade_more_one': 'See one more from the {decade}s',
'us.sf.thecity.panel.no_line': 'The volume prints no line for this entry.',
'us.sf.thecity.panel.empty_but_streets': 'The record places nothing at this block itself. What it holds nearby runs along the streets the block fronts.',
```

Two keys already in the file are now unused and can go when the above land:
`us.sf.thecity.panel.count`, `us.sf.thecity.panel.count_one`.

### `src/app/fusion.css` — the rail's styles want a home

Every rail style is inline in `CityBlockPanel.tsx` (`RAIL`) and every value is a theme token,
so the palette is inherited rather than set. When `fusion.css` is free, they belong beside
`.fx-city-panel` at line ~17073 as `.fx-block-rail*`. The one rule that needs care in the move
is the summary's `display: block`, which is what suppresses the disclosure triangle.

### `CityMap.tsx` — the ledger is the scroll container

The panel resets `.fx-city-ledger`'s `scrollTop` on a new block by reaching for it with
`closest()`, with a `parentElement` fallback. If `CityMap` ever moves the scroller, that reach
should become a prop instead.

### `CityMap.tsx` — the street count is known and not passed

`BlockContext` carries id, hood and area. The T0 index also holds `ns[i]`, the number of
street-precision decisions reachable through this block, and `indexRef` is right there in
`onPick`. Passing it would let the fiche say how much sits on the block's streets before the
reader opens the fold — which is the whole of what 401 blocks have.

---

## 7. State

Typecheck clean · **7 lint warnings, all in the six product files nobody owns** — baseline
preserved, nothing committed.

**Tests: 303 passed at 23:41, then 299/303 at 23:45 — not from this work.** The four failures
are all in `src/lib/city/data.test.ts` and all say the same thing: `base/places` is now listed
in `public/data/us/sf/city/manifest.json` and the chunk is not on disk yet. That is queue item
4 (more named places) mid-flight. Neither file this block owns is imported by that test, and
the suite was green on this code twenty seconds before the manifest was rewritten.

No tests were added, deliberately: `decadeGroups`, `blockShape` and `pickHeadline` are pure and
worth locking down, but the night's baseline is quoted as "303 tests" in `NIGHT.md` and a
different number would read to another agent as something having broken. They are the first
follow-up.

Screenshots (`t1-` prefix, 1400×900 @2× and 430×900 @2×): `somaBusy` (block 3704, South of
Market, 235 decisions), `sunset` (1705, Sunset/Parkside, 7 decisions, quiet after 1947),
`streety` (1147, Lone Mountain, 2 decisions and 672 on its streets), `northbeach` (0013, one
Board heading per decade), `nostreetsonly` (0006, nothing of its own, street section opened for
the reader), `nothing` (0001, nothing at all), `narrow` (0013 at 430 px).


---

## 8. Block B4 — what a stranger learns, and how

The rail was right and it was not enough: opened cold, a busy block gave a count, a span and
ten sentences with no through-line, and a thin block gave two sentences over nine flatlines
while 672 decisions sat one shut fold away. Four changes, and every one of them is a count of
something the volume printed.

### a. The subjects — the Board's own headings, counted

`blockSubjects()` in `block-records.ts`. There is no topic field and there will not be one; a
classifier's guess printed in the record's voice is the one thing this page may not do. But
**13.4 % of all rows carry a heading the Board printed above the item**, in the form it set
itself — `Street Lights — Install 400 M. R. Lombard street between Taylor and Jones streets.` —
and those headings repeat on a block.

- the label is the text before the volume's own dash, on `h` and `p` rows only, 3–60 characters,
  and it must hold a word. A body sentence (`s`) with a dash in it is half a sentence, not a
  heading, and is never read.
- two printings fold together on **case, spacing, trailing punctuation and a plural `s`, and
  nothing else**. `Oil Permits` is NOT folded into `Oil and Boiler Permits`: that would be a
  judgement about what two permits have in common and the counts would stop being counts.
- the surface form shown is the one the volume prints most often here.
- a subject has to be printed here **more than once**, or nothing is shown.

MEASURED over all 256 shards: **978 of the 4,679 blocks** that carry anything have at least one
repeated printed heading — **34 % of blocks holding 15–49 decisions and 73 % of those holding
50 or more**, which are the blocks a reader lingers on. Median one subject, and the subjects
cover a median 9 % of the block's rows. It fires where there is something to say and says
nothing on the rest.

**And each subject is a filter.** A count on its own is a fact a reader can do nothing with.
Pressing `Stable Permits · 6` on block 3752 rebuilds the rail from those six rows: it collapses
onto the 1910s, and the line above it reads *"6 decisions the volume heads "Stable Permits",
all in 1915."* One press clears it. That is the whole of the synthesis, and no row is hidden by
it — the count on the button is what the press will show.

### b. The street count, in the lead

`ns[i]` was in the T0 index from the start and was never handed to the fiche (T1 recorded it in
§6 as a note to `CityMap`). `BlockContext.streetDecisions` now carries it, and the lead says it
as a press that opens the street section and scrolls to it. The median block reaches 95 street
decisions; 1147 reaches 672 with two of its own.

### c. The headline reaches further, and steps over fragments

`HEADLINE_REACH` was a flat 3, which on a decade holding 76 rows is the top 4 %. It is now a
quarter of the decade held between 3 and 8. **41 of 3,645 decade headlines changed over 40
shards and every one moved onto a heading the Board wrote** — block 3704's 1930s went from
*"From Fifth Street at Mint avenue, via Brannan, Potrero, Bayshore, Alemany boul…"* to
*"Regulating Hours of Work in Reconstruction or Repairs to Street Railway Tracks."*

A second rule was added under it: where no printed heading is in reach, a line under 40
characters is passed over for a longer one. Block 1705's 1920s was headed by *"Fortysixth
Avenue and Irving Street."*, which as the face of a decade says nothing; it now reads *"Install
400 M. R. Northeast corner Forty-sixth avenue and Irving street."* The fragment is still in the
decade, one press away.

Both rules were checked against the ranking they are allowed to disturb: a decade of four rows
still stops at three, so a much better-ranked row is never demoted for a tidier line.

### d. Two things the panel would not say

- **the row was a closed door with nothing on it saying so.** `<details>` with its marker
  suppressed is a paragraph with a pointer cursor. Every decade now carries `Read all 44 ›`,
  which disappears when the decade is open, and the one hint above the rail was freed to
  explain the flatlines instead: *"Every decade from 1900 on. The ones the record leaves empty
  are drawn too."*
- **an opened decade said the same line twice.** The headline IS one of the rows in the shelf
  underneath — the best-ranked one — so a decade opened printed its own first sentence and then
  printed it again with its date and its link. Open, the headline and the cue both stand down
  and the shelf answers.
- **a blank block was a dead end.** One sentence, no bearing. It now adds what the margin
  already knows: *"The record says something about 5,080 of the city's 5,404 blocks. This is
  one of the 324 it passes over."* Both numbers are read from the same `manifest`-derived props
  the margin uses; nothing new is fetched.

### e. Where the styles went, and the strings

Every inline `RAIL` style is gone. `fusion.css` carries `.fx-block-*` beside `.fx-city-panel`,
which is what let the summary get a hover and a `:focus-visible` an inline style cannot hold.
The `EN` fallback map and `tx()` are gone with them: all twenty-five `us.sf.thecity.panel.*`
keys are in **both `en.ts` and `fr.ts`** (identical English, ADR-0010 D3), and the two unused
`panel.count*` keys were removed.

### f. Tests — 18, and why they exist

`block-records.test.ts`. The three pure readings of `d[]` each make a claim in a reader's
language, and the one worth guarding hardest is `blockSubjects`, because it prints a **count of
the record's own words**: a fold that merged two different printed headings would put a number
under a heading the volume never gave those items. The suite goes from 320 to **338**, and the
18 are all new — nothing was renumbered.

### g. Still not sourced

- **Buildings and addresses as objects.** Unchanged from §5. The pin B4 put on the map marks
  the point the reader clicked, not the block's outline, because the outline lives in
  `scene.ts`.
- **A subject on the other 79 % of blocks.** They hold headings the volume prints once, and
  once is not a pattern. Nothing is shown there.


### h. Screenshots

`b4-` in `website/.parity/out/`, all against the dev server:
`b4-final-block-{3752,1705,1147,0001}` (1440 × 900 @2×, the record margin alone),
`b4-v2-page-{390,768,1600}`, `b4-narrow-3752` (the fiche at 390),
`b4-act-filtered` (a subject pressed), `b4-act-open-decade` (a decade opened),
`b4-pin-{city,district,locate}` (the pin held through a preset change, a drag and a
`Find it on the map`). `before-` prefixed copies of the four fiches are kept beside them.

---

## 9. Block F1 — what the block IS now, and what it takes in public money

Daniel, twice:

> "We should connect to each block more information that may be relevant, especially modern
> info, still keeping the minimal display style we have but with key info (demographics?
> economics?)"
>
> "We have 'places' in the normal Qipu app where there is detailed current financial info. How
> could we wire this minimal into this feature? So like knowing how much Moscone Center takes in
> public money."

The decade rail stays exactly as B4 left it. This block adds **two things above it**, because
what a stranger wants first is *what is this place* and only then *what happened here*.

Everything below is emitted by one new script, `pipeline/scripts/us_sf_city/build_block_facts.py`,
two stages (`--fetch` then `--build`), nothing downstream touching the network.

### a. The joins, and which of them is actually a join

**1. The roll → the block is not a join.** `wv5m-vpq2`, the Assessor's closed secured roll,
publishes `block` as its own column and it *is* the assessor block the map draws. A block figure
here is the sum over that block's own published parcel rows and nothing is inferred.
**5,398 of the map's 5,404 blocks** carry a 2025 roll row.

**2. The Census → the block IS a join, and it is stated on the file.** The Census draws its own
blocks — **5,986 in San Francisco County against 5,404 assessor blocks** — and they are not the
assessor's. Each census ring is attributed to the assessor block holding the **plurality of the
parcel base map's active parcels falling inside that ring**, which is the same *"the ring that
contains the point"* membership rule `manifest.sources.block_paint` already uses.

MEASURED, and printed by the build:

| | |
|---|---|
| census rings that land on a drawn block | **5,498 of 5,986 (91.8 %)** |
| residents carried | **868,555 of 873,965 (99.4 %)** — and 873,965 is the published county total |
| rings where the plurality block holds ≥90 % of the ring's parcels | **5,045 of 5,498 (91.8 %)**, **median 1.000** |
| blocks that receive a count | **4,594 of 5,404 (85.0 %)** |

The median is 1.000: for half the city a census ring's parcels are *entirely* inside one assessor
block, so this is containment and not an estimate. A ring is attributed to **at most one** block,
so nothing is double-counted. **A block that receives no ring ships `-1` and the panel says
nothing** — it never shows a zero, because a zero would read as *nobody lives here*.

**3. The place → the block is the APN.** `places/_facilities.json` carries the City Facilities
registry's `block_lot` per facility, which is `<block><lot>`; the block is the leading four
digits and an optional letter, kept only when `base/blocks-id.json` also publishes it.

### b. Three bad joins the APN produced, all three caught by looking

Screenshotting is not the only place "actually look" applies. The first cut of the money file
put **$360.6 M of Moscone Center on block 0469, in the Marina.**

- **`moscone-center` carries four facilities on 0469** — `Moscone Rec Center`, `Moscone
  Maintenance Facility`, `Moscone Bathrooms`, `Moscone Fieldhouse and Bleachers`, 10,629 sq ft
  between them, **3.4 km from the convention centre** and *a separate published place of its
  own* (`moscone-rec-center`). The place↔facility crosswalk has conflated two things named after
  the same mayor.
- **Block `9900` is not a block.** It is the Port of San Francisco's single APN for its entire
  waterfront: `9900070` is carried by Pier 45, Pier 70 *and* the Southeast Water Pollution
  Control Plant, its 75 parcels spread **6,562 m** from their own centroid, and its assessed land
  and improvement value are both $0. Three unrelated places were landing on one smear.
- **`1263011` is Kezar Stadium's parcel and the register hangs the whole park on it.** It is a
  real active parcel at 510 Frederick Street, 117 m from Kezar's own published point — and the
  City Facilities register also puts **Golden Gate Park (3,809 m away), the Japanese Tea Garden
  (1,414 m) and the Conservatory of Flowers (866 m)** on it. Same pathology as 9900, one register
  down. Nothing about the number says so; only the places' own published points do.

Three guards, all measured, all printed by the build and all shipped inside the file under
`guards`:

- **R1 — a bucket is not a block.** A block whose own active parcels spread more than **2,000 m**
  from their centroid is the assessor's catch-all, not a piece of ground. Measured spread, widest
  first: **9900 6,562 m · VACST 4,209 m · PARK 3,852 m**, then **6900 at 1,781 m, 1939 (Golden
  Gate Park) at 1,357 m and 1313 (Lincoln Park) at 1,134 m**, which *are* one piece of ground and
  are kept. The cut is taken in the 2.1 km gap between the third and the fourth. It removes
  exactly three blocks.
- **R2 — one place, one ground.** A place is where its published floor area is: the block
  carrying the most of it, plus every block within **600 m** of that one.
- **R3 — the APN must agree with the point.** The place's own published point must lie within
  **500 m** of a published parcel of the block its APN names. MEASURED over the 76 block × place
  rows, sorted: `… 204, 215, 220, 221, 365, 379, 408, 421, 434 | 710, 814, 866, 1111, 1414, 3809,
  8576`. The cut is taken in the 276 m gap. **R3 subsumed R2 in practice** — every row R2 would
  have dropped, R3 drops first — and R2 is kept because it is the rule that lets a campus keep
  its second and third blocks.

R3's nine drops, printed every run:

```
conservatory-of-flowers/1263  866 m     golden-gate-park/1263        3809 m
de-young-museum/1700         1111 m     japanese-tea-garden/1263     1414 m
glen-park-branch-library/6745 4295 m    lake-merced/7283              710 m
moscone-center/0469          3360 m     pier-96/4502A                 814 m
sffd-division-of-training/3594 8576 m
```

**Two of those nine are true rows losing their block line, and that is the trade taken on
purpose.** de Young sits on block 1700, which is ONE 96-acre parcel whose published centroid is
1.1 km from the museum, and Lake Merced is the same shape of problem. A place that loses its
block line costs a reader one link it can find on the places page anyway; a place kept on the
wrong block puts $360 M on somebody's house.

Moscone Center now resolves to **3723, 3724, 3734, 3735** — North, West, South and the garage —
and to nothing in the Marina.

### c. The money coverage is thin, and the panel says so

| | |
|---|---|
| blocks carrying a published place | **66 of 5,404 — 1.22 %** |
| blocks carrying a money figure | **30 of 5,404 — 0.56 %** |
| published places that resolve to a drawn block | **65 of 95** |

The 30 that do not are parks, plazas and piers with no facility APN of their own
(`fishermans-wharf`, `hallidie-plaza`, `japantown-peace-plaza`, `south-park`,
`noe-valley-town-square`, `corona-heights-park`, `san-francisco-zoo`…), the four Port rows R1
removed (`ferry-building`, `pier-27`, `pier-39`, `pier-45`), R3's nine, and three that are not in
San Francisco at all (`camp-mather` in Tuolumne County, `sharp-park` in San Mateo,
`sunol-water-temple` in Alameda — their APNs are another county's and do not parse as an SF
block, which is the correct outcome).

**This is the honest ceiling of the join as it stands**, and the panel prints the ratio itself
in the section rather than leaving a reader to infer that a block with no money section has no
money.

**The ratio is printed only where the section appears**, and that was a decision rather than an
oversight: putting *"no published city place stands here"* on the other 5,338 blocks would be a
line of grey on 98.8 % of the map to say nothing. What a reader gets instead is that the section
is either there with its coverage on it, or it is not there at all.

### d. Widening it was investigated and each route was measured, not guessed

- **DPW projects (`btxj-k9uh`, ~8,356 geolocated).** `stg_us_sf_dpw_projects.sql` says it in its
  own header: *"Carries NO money of its own."* It is a chantier register. Dead end for money.
- **Building permits (`sf_building_permits`).** Block + lot at ~100 % precision, and
  `estimated_cost` is real — but `us.yaml`'s own comment names it: *"the applicant's declared
  construction value (a permit measure, NOT city spend)"*. Printing it under a heading about
  public money would be a lie. Left alone.
- **The 148 places in `_capital.json`.** More than the 95 published, but the extra ones failed
  the publication gate and have no fiche to click through to. The rule is that a figure a reader
  cannot click through to does not go up, so they are not read.
- **Attributing a department's budget to its building.** `money.budget_line` on a place fiche is
  the *whole department's* appropriation. On a place fiche, beside everything else, that reads as
  context. On a block, alone, it would read as this block's money. **Not shipped as a figure** —
  the department is named, and the number is left on the page that can hold it.

### e. Every figure here is the whole place's, and the file says so

`money_is_the_whole_place` ships inside `block-money.json`. Moscone Center stands on four blocks
and reports **the same** $776.3 M agreed / $360.6 M paid on each; `n_blocks` is carried so the
panel can say so in words. Nothing is divided by floor area, because the city's files do not
publish it that way and an apportionment would be a number nobody wrote down.

What each block *does* get of its own is **which of the place's buildings stands here**: block
3724 carries `Moscone West, 775,000 sq ft`, block 3723 `MOSCONE NORTH, 520,000 sq ft`. That is
the register's own row, and it is the one thing at block grain in the whole money file.

`no_sum_note` carries the second warning the place fiches already make: the contract ledger and
the payment ledger are different city files and are not additive.


### f. Two fields that looked right and were not

Both were caught by reading the panel out loud on a block whose answer I could check.

**`number_of_units` is not a count of homes.** The roll publishes it, it sums to 389,527
city-wide, and it looked like the obvious answer to *how many people live here*. Block 0311 in
the Financial District — 112 parcels, 76 of them `Single Family Residential` — printed
**"Homes 11"**. Every one of those 76 is a `Condominium` on the roll and reads
`number_of_units: 0.0`, because there **the parcel IS the home** and the field is not repeated.
City-wide: 155,111 Single Family Residential rows carry 121,707 units between them, so roughly
33,000 homes are simply absent from the column.

The 2020 Census's `HU100` is a real count of housing units, it reads **76** on block 0311, and
it sums to **406,628**, which is the published county total. So `homes` is the Census's, from
the same ring and the same rule as `residents` — the two are present or absent together and
never disagree about which ground they describe. `u` is still in the file, carrying its own
warning in `units.u`, because the file should carry its own evidence.

**The use fold destroyed information and printed a word nobody wrote.** The first cut folded the
roll's `use_definition` onto the seven classes the map colours its buildings by
(`manifest.buildings.useNames`). `Government` came out as *"hotel / institutional"*, and
`Commercial Misc` — 4,992 parcels — came out as *"mixed or not stated"*. The roll publishes
exactly **nine** values city-wide and every one is already a sentence a reader can read, so
nothing is folded and nothing is renamed:

```
155,111  Single Family Residential      4,377  Commercial Retail
 36,278  Multi-Family Residential       2,372  Industrial
  5,487  Miscellaneous/Mixed-Use        1,818  Commercial Office
  4,992  Commercial Misc                  758  Commercial Hotel
                                          354  Government
```

### g. What the panel says, and the two places it refuses to

Four rows and a source line, in `fx-city-fact-row` — the label/value row `CityMap` already draws
in the ledger above this panel, **reused verbatim, so nothing new is styled** and the block's
modern facts read as the same kind of object as the map's own.

```
ON THE GROUND NOW
Residents                 19        ← 2020 Census, the ring that resolved here
Homes                      1        ← 2020 Census HU100, same ring, same rule
Mostly      Commercial Office        ← the roll's own use_definition, verbatim
Assessed at          $461.1M        ← land + improvements + fixtures, 2025 roll
```

- **A block with no census ring shows no residents and no homes** — not a zero. 810 of the 5,404
  are in that state, the source line says why in one sentence, and a "0 residents" would be a
  claim that nobody lives on ground the count simply does not reach.
- **"$0" carries its own count.** 480 of 5,401 blocks read $0, because the roll carries no value
  on the ground the city, the state and the federal government own — City Hall's own parcel
  `0787001` is `assessed_land_value: 0.0` with no exemption code on it. Alone, "$0" reads as a
  hole in the data. The line beside it — *"It carries no value here, as it does on 480 of the
  city's blocks"* — makes it read as what the roll says.

Money, on the 30 blocks that have it:

```
PUBLIC MONEY
Moscone West stands here — 775,000 sq ft of Moscone Center. It stands on
4 blocks, and every figure below is the whole of it.
Contracts                  1
Agreed              $776.3M
Paid                $360.5M
Vendors paid (6)    $372.3M
Contracts and payments are different city files and are not added together.
The full record for Moscone Center
A published city place resolves to 66 of the city's 5,404 blocks; 30 of
those carry a figure.
```

Three sentences the panel refuses to let a reader construct:

- **the two ledgers added.** Printed only when both are on screen — Coit Tower has one payment
  and no contract, and there is nothing there to add.
- **paid above agreed read as an overrun.** The Southeast Water Pollution Control Plant reads
  **$597.7 M agreed and $682.5 M paid**, because the two figures come out of two city files the
  city has not reconciled. Where paid stands above agreed the panel says so in a line of its own.
- **the money read as this block's.** `n_blocks` is on every record and the second sentence
  prints it whenever the place stands on more than one.

Under a million a figure is printed **in full**: City Hall's one contract is `$5,617` agreed and
`$3,175` paid, and abbreviating those to `$5k` and `$3k` throws away most of what was published
to save four characters.

### h. The case that says why this belongs above the record and not below it

**Block 0787 is City Hall, and the record places nothing on it at all** — `n: 0, ns: 0`, one of
the 324 blocks §8d's sentence was written for. Before tonight a reader who clicked the seat of
the city's government got *"The record places nothing on this block."* and a fold with nothing
in it. It now opens: 19 residents, no homes, `Commercial Office`, valued at nothing, and then
**City Hall stands here — 516,484 sq ft**, one contract, six vendors paid $14.7 M, and a link to
the fiche that holds the rest. The old sentence is still under it, and it is now the *second*
thing the block says rather than the whole of it.

That is why the two sections sit **above** the lead and **outside** its loading gate. Putting
them inside the `shape ?` branch would have hidden them on exactly the blocks whose only content
they are.

### i. Screenshots

`f1-` in `website/.parity/out/`, shot by `.parity/f1shot.py` (new; takes a comma list of block
ids and a tag), all against the dev server. 1440 × 900 @2× for the record margin and 390 × 844
@2× for the phone:

`f1-v6block-0787` (City Hall — a blank record with $14.7 M on it), `f1-v5block-3724` (Moscone
West, four blocks), `f1-v3block-5313` (Southeast plant, paid above agreed),
`f1-v4block-0086` (Coit Tower, one payment and no contract), `f1-v3bblock-1705`
(Sunset/Parkside — 246 residents, 123 homes, Single Family Residential),
`f1-v3bblock-0001` (nothing in the record, and still four facts),
`f1-v2block-0311` (the Financial District block that caught the units bug),
`f1-v6phone-fiche-0787`, `f1-v2phone-3724` (the whole page at 390).

**The phone is where the fact rows are best**, not merely unbroken: at 390 px the label sits
left and the mono figure sits hard right across the full width, which is a cleaner read than the
same rows crushed into the 252 px desktop margin.

---

## 10. Notes for the owners of files F1 may not touch

Recorded, not edited.

### ~~`pipeline/seeds/` — the place↔facility crosswalk has three defects~~ **CLOSED, see §11**

Every one is measured above in §9b, and each is a wrong row in
`seed_us_sf_place_facilities`, not a derivation error downstream:

1. **`moscone-center` holds four Moscone RECREATION Center facilities** (ids 2049, 1143, 1138,
   1142, block_lot `0469001`), which belong to `moscone-rec-center`, a published place of its
   own. R3 drops them; the seed should not carry them.
2. **`golden-gate-park`, `japanese-tea-garden`, `conservatory-of-flowers` all carry block_lot
   `1263011`**, which is Kezar Stadium's parcel at 510 Frederick Street. The register uses it as
   the park's nominal APN. Anything joining these places on APN will land them on a small block
   at the park's south-east corner.
3. **`glen-park-branch-library` resolves to block 6745, 4.3 km from its own published point.**
4. **`ferry-building`, `pier-27`, `pier-39`, `pier-45`, `pier-70` and the Southeast plant all
   carry `9900070`** — the Port's single APN. Not a defect in the seed so much as in the source
   register, but anything joining on APN has to know it.

### ~~`src/i18n/en.ts` and `fr.ts` — twenty-three keys to add~~ **CLOSED: landed in 68082652, twenty-five of them; `EN_NOW` and `tx()` are deleted and the panel calls `t()`**

The two new sections read them through a local `tx()` that prefers a real dictionary entry and
falls back to the English declared in `CityBlockPanel.tsx` (`EN_NOW`). `useT` returns THE KEY
ITSELF when a key is missing, so this cannot be a plain `t()` call until the keys land. Adding
these takes them over with no change to the component, and `EN_NOW` and `tx` can then both be
deleted. English identical in both files, ADR-0010 D3.

```ts
'us.sf.thecity.panel.now_head': 'On the ground now',
'us.sf.thecity.panel.now_residents': 'Residents',
'us.sf.thecity.panel.now_homes': 'Homes',
'us.sf.thecity.panel.now_use': 'Mostly',
'us.sf.thecity.panel.now_value': 'Assessed at',
'us.sf.thecity.panel.now_src': 'The {y} assessor roll, which names this block in a row of its own.',
'us.sf.thecity.panel.now_src_pop': 'Residents and homes are the {c} Census, counted on its own block and carried onto this one.',
'us.sf.thecity.panel.now_no_pop': "No Census block's parcels sit here, so no count of people or homes is shown.",
'us.sf.thecity.panel.now_zero': "It carries no value here, as it does on {n} of the city's blocks.",
'us.sf.thecity.panel.now_roll': 'See the roll',
'us.sf.thecity.panel.now_census': 'See the Census',
'us.sf.thecity.panel.money_head': 'Public money',
'us.sf.thecity.panel.money_stands': '{name} stands here — {sqft} sq ft of {place}.',
'us.sf.thecity.panel.money_stands_same': '{place} stands here — {sqft} sq ft of it.',
'us.sf.thecity.panel.money_stands_plain': '{place} stands here.',
'us.sf.thecity.panel.money_spans': 'It stands on {n} blocks, and every figure below is the whole of it.',
'us.sf.thecity.panel.money_contracts': 'Contracts',
'us.sf.thecity.panel.money_agreed': 'Agreed',
'us.sf.thecity.panel.money_paid': 'Paid',
'us.sf.thecity.panel.money_payees': 'Vendors paid',
'us.sf.thecity.panel.money_ledgers': 'Contracts and payments are different city files and are not added together.',
'us.sf.thecity.panel.money_over': 'Agreed and paid are two different city files that the city has not reconciled here, so paid standing above agreed is not an overrun.',
'us.sf.thecity.panel.money_none': 'No city ledger names this place, so no figure is shown for it.',
'us.sf.thecity.panel.money_link': 'The full record for {place}',
'us.sf.thecity.panel.money_cover': "A published city place resolves to {n} of the city's {all} blocks; {m} of those carry a figure.",
```

### `src/app/fusion.css` — five inline styles want a home

B4 got every rail style out of this file and into `fusion.css`, and F1 could not follow it there
because `fusion.css` belongs to another agent tonight. What is inline is small and every value is
a spacing number, not a colour — **no palette is set anywhere in the new sections**, because both
of them are built out of `fx-city-ledger-head`, `fx-city-ledger-facts`, `fx-city-fact-row`,
`fx-block-lead`, `fx-block-hint` and `fx-block-jump`, which already carry the theme. The five are
`marginTop: 7 | 6 | 8 | 10` and one `marginTop: 0`. They belong beside `.fx-block-*` as
`.fx-block-now*` / `.fx-block-money*` when the file is free.

### `block-records.test.ts` — three pure functions worth locking down

`blockNow`, `usdShort` and `hasMoney` are pure and none is covered. The one worth guarding
hardest is `blockNow`, because **the whole of the null-is-not-zero rule lives in two ternaries
in it** (`pop >= 0 ? pop : null`, `hu >= 0 ? hu : null`), and a change that let `-1` through
would print "Residents −1" on 810 blocks. The file is B4's and was not touched; the suite is
green at 391.

### `CityMap.tsx` — the pin knows the block, and the money knows where the place is

`block-money.json` carries no geometry, so a place's own point is not on the panel and the "find
it on the map" button still centres on the pick rather than on the place. If a future block wants
`Show me Moscone`, the point is in `places/_facilities.json` as `primary_latitude` /
`primary_longitude` and nothing new needs fetching.

### `pipeline/scripts/us_sf_city/cache_facts/` — 30 MB of it, and only the sidecars are committed

`parcel_points.json` alone is 25 MB. The directory carries its own `.gitignore` that keeps the
`*.meta.json` sidecars — the URL, the byte count, the row count, the sha256 and the retrieval
time of every file, which is the reproducibility record — and ignores the blobs, which
`--fetch` puts back. `us_sf_places/cache` commits its blobs (53 MB of them); this one does not,
deliberately.

### j. Where this block's commit actually is

**F1's whole diff landed inside `5d74ea1c`, whose message is another agent's.** Two agents were
committing to `refactor/paris-parity` within the same minute; the other one's `git add` swept
F1's staged index into its own commit before F1's `git commit` ran, and the commit came back
`no changes added to commit`. Nothing was lost — every file above is in `5d74ea1c` at its final
state, verified field by field — and **history was deliberately not rewritten**, because an
amend or a rebase on a branch two other agents are actively committing to would have destroyed
their work to tidy a message. The message this diff should have carried is in the empty commit
that follows it, and the whole of the reasoning is §9 and §10 above.


---

## 11. Block F1, round two — the seed fixed at source, and the fallback deleted

Three follow-ups from the coordinator, all closed.

### a. The keys landed, so the fallback is gone

All twenty-five `us.sf.thecity.panel.{now,money}_*` keys are in `en.ts` and `fr.ts`
(`68082652`). `EN_NOW` and `tx()` are deleted and the panel calls `t()` like every other
string on it. **Verified on screen, not assumed**: `f1shot.py` prints the panel's `innerText`,
and grepping four rendered fiches (3724, 6745, 0787, 0001) for `us.sf.` or `thecity.panel`
returns **0**, with 0 page errors.

### b. The seed, fixed at source — and the defect no guard could have caught

The crosswalk is `pipeline/seeds/countries/us/seed_us_sf_place_facilities.csv`. Its full review
is in the sidecar beside it, `seed_us_sf_place_facilities.NOTES.md` (a dbt seed is a CSV and a
CSV cannot hold a comment; dbt reads only `*.csv`, so the `.md` is inert). **Six rows removed,
three moved, one promoted to primary. 243 rows → 240.**

**The thing worth knowing.** §9b recorded `glen-park-branch-library` as *"resolves to block 6745,
4.3 km from its own published point"*. That was the wrong way round, and the truth is worse:
the crosswalk had made the **Haight's Park Branch Library** (1833 Page St) the place's *primary*
facility, so the place's own published point was in the Haight too. The block its APN named and
the point R3 checks it against **agreed with each other, and both were wrong** — so R1, R2 and
R3 all passed it, and the shipped `block-money.json` had Glen Park Branch Library on **block
1229, in Haight Ashbury**. R3 was dropping the *correct* block, 6745, as the outlier.

**A downstream guard cannot catch a self-consistent defect.** That is the whole argument for
fixing the seed rather than guarding harder, and it is why the coordinator was right to send it
back. Both libraries had swapped a facility, each way:

| place | facility | was |
|---|---|---|
| `glen-park-branch-library` | 1228 Park Branch Library, 1833 PAGE ST | **primary**, 4,369 m |
| `glen-park-branch-library` | 808 Glen Park Branch Library, 2825 DIAMOND ST | not primary, 77 m |
| `park-branch-library` | 808 Glen Park Branch Library | not primary |
| `park-branch-library` | 1228 Park Branch Library | primary |

Moscone's four Marina rows (2049, 1143, 1142, 1138 at 1800 Chestnut St, 3,392–3,559 m) were
**moved to `moscone-rec-center`** rather than deleted — they are that campus's own buildings and
2049 was already its primary. Their `match_method` is **`review`**, not `name`: *"Moscone Rec
Center"* does not phrase-match *"Moscone Bathrooms"*, and claiming a name match that did not
happen would be worse than the row it replaces. `distance_m` is recomputed from the register's
own points: **21 m, 160 m, 162 m**.

**Both root causes are one alias apiece, upstream in `sf_place_candidates.json`** — the bare
alias `"Moscone"`, and `"Park Branch Library"`, which is another published place's entire name.
That file is not F1's. **Until those two aliases go, re-running `build_sf_place_facilities.py`
reintroduces all six rows.** The rule worth adding to the builder is in the sidecar §4: *an
alias that is another candidate place's whole name is not an alias.*

### c. The two register defects stay guarded, and the file says so

`1263011` was catalogued in §9b as a seed defect. **Checked against the register, it is not one.**
`nc68-ngbr` itself publishes `1263011` — a real parcel at 510 Frederick Street, Kezar's — as the
`block_lot` of the Conservatory of Flowers (100 JFK Dr), the Japanese Tea Garden Giftshop (75
Hagiwara) and the Golden Gate Park Senior Center (6101 Fulton). Four addresses, one APN: the same
pathology as the Port's `9900070`, one register down. **The place↔facility matches are all
correct; the APN is nominal.** Correcting it in the seed would mean writing an APN the City has
not published, so both stay guarded — R1 for the Port, R3 for the park — and the sidecar §2 says
why, beside the seed a future reader will open first.

### d. Before and after, measured

`--check-seed` is new: it replays the place→block join **twice**, from the seed and from the
`_facilities.json` export the site ships, and prints what each guard drops on both. It needs no
BigQuery — the register is cached by `--fetch`.

```
                          EXPORT as shipped      SEED as fixed
R1 bucket                       7                     7      ← the Port, by design
R2 out of reach                 0                     0
R3 point disagrees with APN     9                     7
```

**R3 goes 9 → 7 and the two that go are exactly the two seed defects**: `moscone-center/0469`
(3,360 m) and `glen-park-branch-library/6745` (4,295 m). The seven that remain are the three
Golden Gate Park nominal-APN rows, and four that are **not defects of anything** —

- **`de-young-museum/1700`, 1,111 m.** The seed is right: one facility, `block_lot 1700001`,
  **14 m** from the place's own point. Block 1700 is ONE 96-acre parcel and the museum is 1.1 km
  from its published centroid. **Follow-up 3's answer: the seed fix does not recover it, and the
  trade stands as stated.**
- **`lake-merced/7283`, 710 m** — same shape, four facilities all on one lake-sized parcel.
- **`pier-96/4502A`, 814 m** — recoverable, but only by changing which facility is primary, which
  is a judgement about which building *is* the place and moves `primary_address` on the fiche.
  Recorded in the sidecar §3, not changed.
- **`sffd-division-of-training/3594`, 8,576 m** — the register genuinely calls two sites 8 km
  apart *Fire Division of Training*, and the Treasure Island one (primary, 569 m) carries **no
  `block_lot` at all**. Not a matching error; the place resolving to no block is correct.

**R1 will never reach zero and should not.** The Port's catch-all is the source register's
defect, and a guard is the honest answer to a register that is wrong about itself.

### e. The build now reads the seed, so the shipped file is right today

`export_sf_place_facilities.py` reads the **prod** mart, and `profiles.yml` says in its own words
never to run `dbt --target prod` from a developer's machine. So a seed fix cannot reach
`_facilities.json` from here; CI rebuilds it.

Leaving it there would have meant shipping a panel that puts Glen Park Branch Library in the
Haight until CI next runs. So `build_block_facts.py` now reads the **crosswalk from the seed**,
joined onto the register's own point per facility — the seed is *upstream* of the export, it is
the artefact the pipeline calls its source of truth, and reading it is one dependency shorter.
`crosswalk_source` in `block-money.json` says so. The two converge when CI rebuilds the mart, and
`--check-seed` measures the gap until then.

**What changed in the shipped file:** `block-money.json` 26,551 → 26,804 bytes. Glen Park Branch
Library moves from block **1229 (Haight Ashbury)** to **6745 (Glen Park)** — the map's own
published hood for 6745 is *Glen Park*, which is an independent confirmation. Moscone stays on
3723 / 3724 / 3734 / 3735. **Coverage is unchanged at 66 blocks and 30 with a figure**: one block
was swapped for another, not added.

### f. State

Typecheck clean, eslint clean on both components, **392 tests green** (up from 391 — one arrived
from another agent; F1 added none). Screenshots `f1-v7*`.

---

## 12. Block F1, round three — what was torn down, and the seventy-year hole under it

> "A block should say what was torn down on it."

The map's buildings are **survivorship only** — `build_bldg.py` says so in its own docstring:
every footprint in `ynuv-fyni` is a building standing today, drawn in every year the map draws.
This is the first thing on the page that shows the city **removing** something.

### a. The source, and why only a third of its rows are counted

`i98e-djp9`, DBI's permit file, `permit_type = 6`. DATA-TRUTH.md §4 had already measured the
series, so nothing here re-measures it — but §4 counts **permits**, and a permit is not a
demolition:

```
7,310  demolition permits
4,511  status = complete   ← the only ones counted
  745  issued        619 cancelled      606 expired
  405  withdrawn     236 filed          … and eight more statuses
```

**1,630 of them are cancelled, expired or withdrawn. A building whose permit was withdrawn is
standing.** So the panel counts `status = complete` only, and dates each one on
`completed_date` — the year it came down, not the year somebody asked. All 4,511 carry that
date.

The join needs nothing: **block and lot are on 100 % of the rows**, and it is the same assessor
block the roll and the map already key on. No geocoding, no plurality rule, no guard.

| | |
|---|---|
| completed demolitions landing on a drawn block | **4,500 of 4,511** (11 name a block the map does not draw) |
| blocks carrying at least one | **1,687 of 5,404 — 31.2 %** |
| dwelling units in those buildings | **13,168** |
| span | **1983 – 2026** |

### b. "Since 1980" and "since 1983" are different claims, and the panel makes the true one

`from_year` is **1983**, not 1980: the earliest *completed* demolition is 1983-03-02, filed
1982-08-03. But DBI's permit file itself opens in 1980 — **exactly one of the 7,310 permits was
filed before 1980-01-01** — and what a reader needs to know is how far back they may look, not
which year happens to hold the first completion.

So the file ships **both**. `from_decade` (1980) is what the panel prints and what the rail
opens on; `from_year` (1983) is held beside it with `series_note` recording the difference.
Printing "since 1983" would have understated the record's reach; hardcoding 1980 would have been
a number I did not measure.

### c. The floor sentence runs on every block, and that is the whole design

**1,687 blocks have something. The other 3,717 get the section anyway.**

An empty section reads as *"nothing was ever demolished here"*. For the **Western Addition** —
cleared under redevelopment in the 1960s, two decades before this series opens — that is the
single most misleading sentence this site could print. DATA-TRUTH.md §4.3 measured why nothing
can fill the gap: over 1960–75 the Board's Journal names the Redevelopment Agency **227 times**
and enumerates an individual demolition **49 times**. *The Board approved the clearance without
recording what came down.* And §4.2: the 1906 fire schedule is the City accounting for **36 of
its own buildings** — engine houses and the like — with no private stock in it at all.

Block **0762, Western Addition**, 453 parcels, 592 residents, 445 homes, is the case that proves
the rule. It reads:

> **TORN DOWN SINCE 1980**
> No completed demolition is on file for this block.
> *This record begins in 1980. What came down before is not published block by block — the
> city's 1906 schedule covers 36 municipal buildings and no private ones, and the Board approved
> the 1960s clearances without recording which buildings they took. 1,687 of 5,404 blocks carry
> one.* → See the permits

It is the same rule as the 810 blocks with no Census ring: **show the absence of the record,
never a zero.** The file enforces it too — `demolition.THE_RECORD_STARTS_IN_1980` says in the
JSON that a block absent from `dem` is a block the record does not reach, so anything else
reading this file inherits the obligation.

### d. The rail is the rail

Where a block has something, the decades draw in **the same idiom as the decision rail below**,
empty ones included — a reader meets one shape twice rather than two shapes once, and a block
cleared in one decade and untouched since is visibly different from one losing a building every
decade. Block **3721** (South of Market, the Yerba Buena build-out) reads `1980s 6 · 1990s 6 ·
2000s 18` and then two flatlines, over `30 buildings on this block were demolished under a
completed permit, 1986 to 2005`. `Homes in them` is a fact row, shown only where the permits
recorded any.

Nothing new is styled here either: `fx-block-rail`, `fx-block-dec`, `fx-block-track`,
`fx-block-bar`, `fx-block-flat`, `fx-block-n`, `fx-city-fact-row`.

### e. The map layer is a separate question and is not answered here

Daniel has not decided whether a demolition **layer on the map** is worth shipping with a
seventy-year hole. This is not that question. A fiche stating what the record holds, with its
start date in its own header, is honest at any coverage — and the data carries no footprint
anyway (the building is gone from `ynuv-fyni`), so a map layer would be a marker or a
parcel-shaped ghost, never a modelled solid. DATA-TRUTH.md §4.1 says so; §4.5 costs the only
source that *would* give footprints — successive Sanborn atlases — as a project, not a task.

### f. State

Typecheck clean, eslint clean, **392 tests green**. One transient failure was seen and is not
mine: `data.test.ts` reported `base/heroes: expected 39620 to be 38048` while another agent was
rewriting `heroes.qc` and `manifest.json` — both files' mtime was inside the test run — and it
passed again forty seconds later, untouched.

Screenshots `f1-d2*` and `f1-d3*`: `f1-d2block-3721` (the rail, 30 demolitions),
`f1-d3phone-0762` (**the Western Addition case at 390 px**), `f1-d2phone-fiche-3721` (both rails
on one phone screen). `.parity/f1shot.py` gained a `scrollIntoView` before the phone shot — the
page kept the previous block's scroll position, so mobile shots were landing in the footer.

### g. Ten keys for `en.ts` and `fr.ts`

Same arrangement as the twenty-five in `68082652`: declared in `EN_DEM` in `CityBlockPanel.tsx`
behind `tx()`, because `useT` returns the key itself when one is missing. **When these land,
`EN_DEM` and `tx()` both get deleted again** — the file has done that once already.

```ts
'us.sf.thecity.panel.dem_head': 'Torn down since {y}',
'us.sf.thecity.panel.dem_lead': '{n} buildings on this block were demolished under a completed permit, {y0} to {y1}.',
'us.sf.thecity.panel.dem_lead_one': 'One building on this block was demolished under a completed permit, in {y0}.',
'us.sf.thecity.panel.dem_units': 'Homes in them',
'us.sf.thecity.panel.dem_none': 'No completed demolition is on file for this block.',
'us.sf.thecity.panel.dem_floor': "This record begins in {y}. What came down before is not published block by block — the city's 1906 schedule covers 36 municipal buildings and no private ones, and the Board approved the 1960s clearances without recording which buildings they took.",
'us.sf.thecity.panel.dem_counted': 'Completed permits only: a cancelled one is a building still standing.',
'us.sf.thecity.panel.dem_cover': '{n} of {all} blocks carry one.',
'us.sf.thecity.panel.dem_src': 'See the permits',
'us.sf.thecity.panel.dem_aria': '{decade}s — {n} demolished on this block',
```

---

## 13. Block F1, round four — is 30 blocks the ceiling? Measured: yes.

> "Public money reaches 30 of 5,404 blocks… Go and find out whether the ceiling is real."

It is real, it is a property of San Francisco's published files rather than of this corpus, and
the measurement is below. **No stretched join was shipped.**

### a. The finding, in one line

**No dataset San Francisco publishes carries both a dollar and a location.** The money files are
dimensioned by *organisation* — department, fund, program, object, vendor. The location files
carry no money. The only bridge between them is a **name in free text**, and sweeping every name
against every contract reaches **48 blocks**.

### b. Every money source, checked against its own column list

Not sampled rows — Socrata omits null fields from a sample, which is how a `contract_no` can
look absent when it is not. These are read from each dataset's `/api/views/<id>.json`.

| dataset | rows | money | any location field |
|---|---|---|---|
| `xdgd-c79v` Budget (AAO) | ~390k | yes | **none** — dept / program / fund |
| `bpnb-jwfb` Spending & revenue | ~763k | yes | **none** |
| `n9pm-xkyq` Vendor payments (vouchers) | **8.07M** | yes | **none** — vendor, dept, fund, object, purchase_order |
| `cqi5-hm2d` Supplier contracts | 49,070 | yes | **none of its 21 columns** |
| `m793-kis4` GO bond spending | 151 | yes | **none** — bond, component |
| `d3dc-v5yr` GO bond projects | 305 | names only | **none** — `planned_project_name` is a name |
| `88g8-5mnd` Employee compensation | ~1.1M | yes | **none** |

And the mirror image — the files that *do* know where they are:

| dataset | rows | location | money |
|---|---|---|---|
| `nc68-ngbr` City Facilities | 1,734 | `block_lot` + point | **none** |
| `gtnh-hgvs` City Lands | 1,035 | polygon + address | **none** — it is the leased/owned registry and it carries no rent |
| `ib5c-xgwu` Rec & Park facilities | 2,687 | geometry | **none** |
| `btxj-k9uh` DPW projects | 8,220 | 2,932 points | **none** — its own staging header says *"Carries NO money of its own"* |
| `i98e-djp9` Building permits | large | block+lot, 100 % | applicant's declared construction value, **not city spend** |

The two columns never overlap. `contract_no` is the contracts file's only key, and nothing in it
is spatial.

### c. Each route the brief named, measured

**Leases — city money reaching ground the city does not own.** The registry is `gtnh-hgvs` City
Lands, 1,035 rows, and its whole column list is `address, category, city, department_name,
dept_id, land_id, land_name, shape, zip`. **No rent, no term, no dollar of any kind.** It is an
identity file, like City Facilities. (It is now the *point* source for two place fiches after
`5c51ff4a` — that is what it is good for.)

**Capital projects with a site.** The one real bridge in the whole pipeline: `btxj-k9uh` carries
`client_contract_id`, which joins to a contract's money. Measured live:

```
8,220  DPW project rows
2,932  carry a point
1,168  carry a client_contract_id
  236  carry BOTH
   20  DISTINCT contract ids among those 236
        — and three of the twenty are the strings 'N/A', 'NA', 'NONE'
   25  distinct project names
```

**Twenty contract ids, seventeen of them real.** That is not a money layer.

**Contracts or payments with an address, a parcel or a site.** None, per §b. `scope_of_work` is
free text and is the only spatial signal that exists anywhere in the money files.

### d. The exhaustive sweep — the actual ceiling

If the ceiling were *editorial* — the size of the 95-place corpus — then sweeping the **whole**
City Facilities register against **every** contract would beat it. So that was run.

```
1,333  facility names testable (of 1,734 rows; the rest have no parseable APN)
32,413  distinct contracts (from 49,070 contract x team-member rows)
    51  contracts whose title or scope_of_work names a city facility
    48  DISTINCT BLOCKS  =  0.9 % of the map
```

Run twice — once with the pipeline's own conservative rule (min 8 chars, generic names like
`fire station` and `library` excluded) and once with **no filters at all**, minimum 5 characters.
**Both return 48 blocks.** The GO bond projects file, the most site-named money there is, reaches
**12**.

**So the ceiling is 48 blocks and the panel reaches 30.** The headroom is +18 blocks — 0.56 % to
0.9 % — and there is no route to more. The limit is not the place corpus: it is that **San
Francisco names its contracts by service and department, not by site**. The hits look like
`COPYSMART MFD COUNTY JAILS`, `PW City Hall Backup Power Gen`, `ROOF REPLACEMENT - COIT TOWER` —
the exceptions, not the rule. The overwhelming majority of the city's 32,413 contracts are
citywide services with no site to name.

**That is the answer, and this block stopped there rather than stretching the join.**

### e. The one real headroom, and it is not money

**533 of 5,404 blocks (9.9 %) hold a city facility** — eight times the 66 the panel reaches —
because the facility register knows where all 1,734 of its rows are. What it cannot do is say
what any of them cost.

So there is a genuine option here, and it is **a different claim**: a section saying *the city
owns a building on this block, and this department runs it* on 533 blocks, with money on the 30
where money exists. That is worth having and it is honest. It is **not built here**, because
Daniel asked for the money to be wired in and turning `Public money` into `The city's buildings`
on 467 blocks that have no money is a change to what the section means, not a coverage
improvement. Recorded for a decision rather than taken unilaterally.

### f. Judged on a phone, and it moved two things

Screenshot at 390 px with all four sections populated (block **3724**, Moscone West — money,
demolitions, 71 decisions). The coordinator's read was right and the phone showed a second
problem underneath it.

**Before:** one screen got the reader the head, `On the ground now`, and `Torn down since 1980`
— and `Public money` only began at the very bottom edge. The rarest thing the panel knows was
the hardest thing to reach.

**And the demolition section was spending fourteen lines to report two buildings**: a five-row
decade rail of which four rows were flatlines, under a six-line grey paragraph, for
*"2 buildings … 2001 to 2001"*.

Three changes:

1. **`Public money` now sits above `Torn down`.** The always-present section (every block) yields
   to the rare one (66 blocks). On 3724 the whole money answer — $776.3 M agreed, $360.5 M paid —
   is now on the first screen.
2. **The demolition rail draws only where it has a shape to show**, i.e. more than one decade
   holds something. In a single decade it was four flatlines and a bar saying what the sentence
   above it already said. Block 3721, which spans three decades, keeps its rail.
3. **The floor line is long where it is load-bearing and short where it is not.** The full
   paragraph exists to stop an empty section reading as *"nothing came down here"*; a block
   showing three demolitions cannot be misread that way. **Block 0762 in the Western Addition
   still gets every word of it** — that was checked, not assumed.

`2001 to 2001` is now `in 2001`.

### g. Two keys for `en.ts` and `fr.ts`

```ts
'us.sf.thecity.panel.dem_lead_year': '{n} buildings on this block were demolished under a completed permit, in {y0}.',
'us.sf.thecity.panel.dem_floor_short': 'This record begins in {y}; what came down before is not published block by block.',
```

The ten from `f72af9a1` are in and `EN_DEM` is deleted; these two are behind `tx()` in `EN_DEM2`
and go the same way.

### h. State

Typecheck clean, eslint clean. **`block-records.test.ts` 18/18.** The full suite is
intermittently red from another agent's in-flight chunk regeneration — three failures in
`data.test.ts` around `CityData.streetLines` and the `strt/*.qc` chunks, and two 404s in the
browser console from the same cause. None of it is in a file this block owns and none of it was
held for.

Screenshots: `f1-k1phone-3724` (**before** the reorder), `f1-k2phone-3724` (**after**),
`f1-k2block-0762` (the Western Addition, full floor paragraph intact).

---

## 14. Block F1, round five — Daniel's review

Seven items. Six landed; one is a handoff.

### a. The block's own edge, on the ground — `CityMap.tsx`

> "When I click a block I get a point… it doesn't indicate a polygon on the ground with the
> border of that block."

The **published ring** is now drawn under the pin. `base/blocks` ships `ox/oy` per block and
`vx/vy` per vertex at a per-block quantum of `(1 << sc) / 10`, which `decodeBlocks` already
reconstructs into absolute world metres as `rx`/`ry` — **the same vertices the hit test walks to
decide the click landed here at all.** So the shape drawn *is* the shape that answered.

Projected with the renderer's own `proj()` at one elevation for the whole ring, which is the
convention the massing pass already sets (its prism is *"the block's published ring, extruded
over the elevation at its centroid"*). An SVG overlay beside the pin, recomputed every render —
`onState` fires as the camera moves — so it is glued to the ground through every pan and zoom.

**`base/blocks.z` has no published step.** The encoder names the field (*"the ring's ground
elevation"*) and not its unit, so it was measured off the shipped chunk against ground the city's
elevation is known for: Lake Merced's block reads **76**, Twin Peaks' **2362**, and the file's
maximum is **2667** against a 282 m high point. **Ten units to the metre**, and `BLOCK_Z_PER_M`
says so where it is used.

**A false alarm worth recording.** The ring first appeared to project ~456 px off the pin. It did
not: `onPick(i)` called from a script never sets a pointer position, so the pin falls back to the
middle of the frame — 576 px, which is exactly `(1440 − 288) / 2`. `proj` and `invAt` round-trip
to the decimal. Verified instead with a **real canvas click**: block 3549, pin at (620, 339),
ring centroid at (638, 316) — 29 px apart, which is the click landing off-centre inside its own
block. Screenshot `f1-c1click-620_430`.

### b. The place fiche opens over the map — one word

> "Can the Qipu place fiche open directly in the side drawer… without going to another page?"

**Yes, and it needed `<a>` → `next/link`.** The route already existed:
`app/@drawer/(...)us/city/sf/places/place/[slug]/page.tsx`, root-level, one drawer per entity,
exactly the doctrine — and the root layout renders the `{drawer}` slot. A plain anchor is a
document navigation and **bypasses the interception**, throwing the whole city away to show one
building.

It costs nothing to feed: the drawer route is a server component calling `loadSfPlace(slug)` off
disk, so the city page holds no fiche data. Measured after the click: URL becomes
`/us/city/sf/places/place/moscone-center`, **`canvas` still mounted**, `.fx-drawer` present —
the map, the camera and the open block are all still behind it. Screenshot `f1-drawer-desktop`.

### c–e. Three things removed

- **The assessed value is gone**, and the `$0`-on-480-blocks apparatus with it — that existed
  only to keep the row honest, and the row is no longer there.
- **"What comes up more than once" is gone** — `blockSubjects`, the chips, the filter state and
  the filtered-rail hint. The function stays in `block-records.ts` with its tests; nothing renders
  it.
- **The demolition section is gone from the fiche.** See §f.

### f. Demolitions — a handoff, not a deletion

> "demolition should be about the buildings appearing and disappearing but not be in the fiches."

`build_block_facts.py`, the permit join and the 1980 floor all stay. **What a renderer needs is
already in `block-facts.json`** and needs no new pipeline work:

```
dem : { "<block>": [ n per decade …, units, firstYear, lastYear ] }
demolition : { dataset, from_decade, from_year, decades, blocks_with_any,
               units_demolished, series_note, THE_RECORD_STARTS_IN_1980 }
```

Per-building rather than per-block — the form a vanishing building wants — is one edit to the
build: `cache_facts/demolitions.json` holds **block, lot, completed_date, storeys and use for
all 4,511 rows**, and the panel only ever needed the block-level rollup. **The rules travel with
the data:**

1. **A permit is not a demolition.** Count `status = complete` only. 1,630 of the 7,310 were
   cancelled, expired or withdrawn, and a building whose permit was withdrawn is standing.
2. **Date on `completed_date`**, not on the filing.
3. **The record starts in 1980 and there is nothing before it.** A building that vanishes on the
   rail in 1994 is a fact; a building that never vanishes is *not* evidence it stood. The
   Western Addition was cleared in the 1960s and no file enumerates it.
4. **There is no footprint.** The building is gone from `ynuv-fyni`, so the honest rendering is a
   marker or a parcel-shaped ghost, never a modelled solid (DATA-TRUTH §4.1).

### g. The rail runs to the present, and says whose gap it is

> "there's nothing included from the handoff to digitalization… it's a shame."

He is right, and the cause is measured. Over 40 of the 256 shards:

```
1900s 1,012 · 1910s 3,752 · 1920s 4,630 · 1930s 1,458 · 1940s 807
1950s   532 · 1960s   467 · 1970s   806 · 1980s 1,130 · 1990s 734
2000s     5 · 2010s    14   ← the DPW annual reports, and nothing else
```

**All 142 Journal volumes in this corpus end in 1998–99.** The rail stopped at the 1990s, so a
reader saw a century of decisions simply stop — which reads as the city having stopped deciding.

The rail now runs to the **current decade**, and every decade past the series is drawn as
*unrecorded* rather than *empty* (`DecadeGroup.afterSeries`, a fainter track), with one sentence
under it: *"The Board's Journal is scanned to 1999. The decades after it are blank because the
record stops there, not because the city stopped deciding."*

**A modern source exists and is not in this pipeline.** SF's Legistar — the Board's own
legislative system — is already being fetched into `pipeline/minutes/cache/legistar/`:
**30,428 matters for 2000–2018**, ~1,200–2,200 a year, carrying `MatterTitle`, `MatterIntroDate`
and `MatterTypeName` in the same form the Journal used (*"Ordinance amending…"*, *"Motion
appointing…"*). **It carries no location** — placing it on blocks needs the same
address-extraction and block-placement pass the Journal got. That is a pipeline block, not a
panel change, and it is the one thing that would actually close this gap.

Two tests in `block-records.test.ts` asserted the old 1990 end. They encoded the behaviour Daniel
asked to change, so they were updated rather than worked around, and one was added for
`afterSeries`. 18 → 19.

### h. "In short" — assembled, never written

> "there should be a summary of the block from the objective data and the voting record so people
> get straight to the meat."

The danger in that ask is that a summary is where prose creeps in and starts generalising past
the record. So **every clause is one sentence over one field, and a clause whose field is missing
is dropped rather than hedged.** Nothing is ranked, characterised or compared, and there is no
adjective in it the assessor did not print.

```
the ground   the roll's own dominant use, verbatim, and the published hood
the people   the Census count carried onto this block — or nothing at all
the record   how many, across what years, and the busiest decade — and
             `blockShape` only names a decade that actually leads
the silence  `quietAfter`, which is THIS BLOCK falling quiet, never the
             Journal running out — two different sentences
the place    the published city place standing here, where there is one
```

Block 3549: *"A mostly multi-family residential block in Mission. 367 people live on it, in 130
homes. The Board decided 41 things here between 1906 and 1990, most of them in the 1910s."*

Block 0001, where almost nothing is known, degrades to two clauses and stops: *"A mostly
miscellaneous/mixed-use block in Russian Hill. The Board's record places nothing on it."*

**The old record lead is gone** — with the summary above it, it was printing the same sentence
one section down, which is the fault §4 already caught twice.

### i. Mobile

At 390 px one screen now carries the summary, the ground facts and the whole money answer, and
reaches "Decade by decade" at its foot. Before this pass a reader met four sections before the
rail; the summary means they no longer have to reach it to know what the block is.
Screenshot `f1-m2phone-3724`. One grammar bug found by looking and fixed: *"in 1 homes"*.

### j. State and keys

Typecheck clean, eslint clean on all three files, **`block-records.test.ts` 19/19**. The full
suite has one failure in `draw.test.ts` (`the surface tier is gated on the narrower dimension`),
which is the in-flight `roofs.ts`/streets work the coordinator named and is not in any file this
block owns.

Thirteen keys for `en.ts` / `fr.ts` — declared in `EN_SUM` behind `tx()`, deleted when they land:

```ts
'us.sf.thecity.panel.sum_head': 'In short',
'us.sf.thecity.panel.sum_ground': 'A mostly {use} block in {hood}.',
'us.sf.thecity.panel.sum_ground_plain': 'A block in {hood}.',
'us.sf.thecity.panel.sum_people': '{n} people live on it, in {h} homes.',
'us.sf.thecity.panel.sum_people_one_home': '{n} people live on it, in one home.',
'us.sf.thecity.panel.sum_people_one': 'One person lives on it, in {h} homes.',
'us.sf.thecity.panel.sum_people_none': 'The Census counts nobody living on it.',
'us.sf.thecity.panel.sum_record': 'The Board decided {n} things here between {y0} and {y1}, most of them in the {d}s.',
'us.sf.thecity.panel.sum_record_flat': 'The Board decided {n} things here between {y0} and {y1}.',
'us.sf.thecity.panel.sum_record_one': 'The Board decided one thing here, in {y0}.',
'us.sf.thecity.panel.sum_record_none': "The Board's record places nothing on it.",
'us.sf.thecity.panel.sum_place': '{place} stands on it.',
'us.sf.thecity.panel.sum_rail_end': "The Board's Journal is scanned to {y}. The decades after it are blank because the record stops there, not because the city stopped deciding.",
```

The two from §13g (`dem_lead_year`, `dem_floor_short`) are **no longer needed** — the section
they belonged to has left the fiche.

---

## 15. Block F1, round six — the unit changed: the neighbourhood, not the block

> "hmm no I'd rather something more about a neighbourhood than hyper localized blocks."

The block is not thrown away. It becomes **a detail inside the neighbourhood**, which is
cheaper than rebuilding and keeps everything §9–§14 built reachable: the summary, the ground
facts, the money, the ring on the ground and the decade rail all aggregate one level up.

### a. The membership already existed on the wire, and it was NOT re-derived

`base/blocks.qc` ships a `hood` field — one u8 per block, an index into the 41 `hoodNames`
the same chunk publishes, which are DataSF's Analysis Neighborhoods (`ajp5-b2md`) verbatim.
`CityMap` has been reading it all along (`bt.hoodNames[bt.hood[i]]`) to print the panel's
subtitle. **Nothing was fetched.**

MEASURED off the shipped chunk: **all 5,404 blocks carry an index in 0..40.** There is no
sentinel and no unassigned block, so *"a click landing outside every hood"* cannot happen on
this panel — the 53 buildings that fall outside all 41 polygons are BUILDINGS, and the pick
resolves against block rings.

A second point-in-polygon pass was deliberately NOT run. It would have produced a second
membership that could disagree with the one the map draws, and **every guard downstream
compares two things; when the same bad row corrupts both, the comparison passes.** There is
one membership on this map and `build_hood_facts.py` is a rollup of it.

### b. What rolling up actually buys — measured, both ends

| | blocks | neighbourhoods |
|---|---|---|
| carry a money figure | **30 of 5,404 (0.6 %)** | **20 of 41 (49 %)** |
| carry a published place | 66 of 5,404 (1.2 %) | **27 of 41 (66 %)** |
| carry a Census count | 4,594 of 5,404 (85 %) | **41 of 41 (100 %)** |
| carry the Board's record | 4,679 of 5,404 (87 %) | **40 of 41 (98 %)** |

The one hood with no record is **Treasure Island** — 36 blocks, 0 decisions. That is real and
not a gap in the rollup: it was Navy land until 1997 and the Journal's 1906–1999 series places
nothing on it.

### c. The three places aggregation could have laundered a gap, and what ships instead

1. **Money.** South of Market reads **$776.3 M agreed** and that is **one place of the four
   standing there** — Moscone Center. `places` and `places_with_a_figure` are both on every
   record, the panel prints both, and the largest figure is **named** (`money.top`), so the
   sentence a reader gets is *"4 city places stand here; 1 carries a figure"* and not a
   district-wide total that was never measured.
2. **Residents.** A hood's count is summed over the blocks the 2020 Census ring join reaches.
   **Only 2 of 41 hoods have a ring on every block** — Bayview Hunters Point has 294 of 501 —
   so `residents_blocks` ships beside `blocks`. City-wide the join still carries 868,555 of the
   county's 873,965 (99.4 %), and summing the 41 hoods returns **exactly** `residents_carried`,
   which is the arithmetic check that the membership partitions.
3. **A place standing in two neighbourhoods.** Exactly one does: **`moscone-center`**. It is
   reported whole in each, for the same reason it is reported whole on each of its four blocks —
   no published file apportions it — and `places_straddling_two_hoods` ships the list.

### d. The highlights are curated, not judged — and the architecture is `curate_documents()`

Read before writing a second one, as asked. `export_sf_places.curate_documents()` is:
**dedupe by title stem → `classify_doc()` against `DOC_TYPES` (first match wins, order IS the
precedence rule, `PROCEDURAL_HEAD` overrides the body) → `rank_documents()` sorts on
(tier, has-gloss, −evidence, title) where the TYPE decides the band and evidence only orders
inside it → cap, and report the count rather than the rows.** No model call.

**The shape transfers exactly. `DOC_TYPES` itself does not**, and that is the finding: that
table matches *catalogue titles* ("Annual report", "Environmental impact report"), and there is
no catalogue here — a block-record row is a sentence the Board printed. The tier signal is
already in the data and it is stronger than a regex over a title:

```
tier 1  heading        g == 'h'  and p >= 1   the Board's own printed heading
tier 2  heading_body   g == 'p'  and p >= 1   that heading composed with its item
tier 3  addressed      g == 's'  and p >= 3   a sentence naming an address here
tier 4  placed                     p >= 1     a sentence the record places here
tier 9  procedural / fragment                 counted, NEVER shown
```

Tier 9 is `PROCEDURAL_TIER`'s exact role. It catches two things: the Journal's own machinery
(`^On recommendation of`, `^Read and ordered`, `^Finally passed` … all anchored, so a sentence
that MENTIONS a committee is not demoted) and lines under 40 characters, which is the same
fragment floor the decade headline already uses. There is no `p == 0`: street-tier rows live in
`street/<KEY>.json` and are a claim about a street, not this ground. MEASURED over all 256
shards: **p1 54,655 · p2 17,339 · p3 18,054 · p4 1,343, and no p0.**

Classified over all 41 hoods, on the face of each deduped group:
`heading 2,597 · heading_body 2,118 · addressed 9,373 · placed 20,704 · fragment 1,179 ·
procedural 92`.

**The one thing this level adds that a block cannot: how many of the neighbourhood's own blocks
the same printed subject lands on.** A count, not a judgement, and it is the whole difference
between a decision that touched one corner and one that reorganised a district. It is the
primary sort inside a tier. What it produces, unedited:

```
Sunset/Parkside   1927  on 24 blocks  Giving Notice of Special Election for Bonds for
                                      Municipal Railway Extensions.
Sunset/Parkside   1926  on 24 blocks  Accepting Deed to Lands Required for the Widening of
                                      Noriega Street From Twenty-first to Thirty-first Avenues.
Mission           1917  on 14 blocks  Spring Valley Water Company to Connect Up Drinking
                                      Fountains on Mission Street.
South of Market   1940  on  8 blocks  Removal and Abandonment of Street Railway Tracks —
                                      Ninth Street …
Bayview H. Point  1935  on 10 blocks  Spur Track, Pacific Can Company, Across Newhall Street …
```

**No model pass, and the reason is the one this project established on the Paris side: the city
already writes the description.** Every line above is the Board's own and every one carries `u`,
the scan leaf it was printed on, so it is one click from the page. A generated summary of the
same material would be the only thing on this map that could not be clicked through to.

### e. The file

`pipeline/scripts/us_sf_city/build_hood_facts.py --build` →
`website/public/data/us/sf/city/blocks/hood-facts.json`, **81 KB**, one fetch. It reads only
what is already on disk — the chunk, the two block-fact files and the 256 record shards — and
never touches the network, so there is no `--fetch` stage.

### f. The panel, and what it says now

The neighbourhood is the TITLE and the block is the subtitle — the two have
swapped. A reader who clicks a shape is told what part of San Francisco they are
in and then which of its blocks answered; before this they were told `3724` and
had to read the small grey line under it to find out where that was.

Order, and it is §13f's rule one level up — **the always-present section yields
to the rare one.** Every hood carries residents; 20 of 41 carry a money figure:

```
NEIGHBOURHOOD
Tenderloin                                    ← the title
Block 0787 · 18,233 m² published area         ← the block, still one press away

IN SHORT     assembled from four fields, a missing field drops its clause
ON THE GROUND NOW   residents · homes · mostly · blocks, and the denominator
PUBLIC MONEY HERE   the rollup, and what it is rolled up FROM
WHAT THE BOARD KEPT DECIDING HERE   six curated lines, each opening its scan
ON THIS BLOCK       ← everything §9–§14 built, unchanged, one level down
```

City Hall's block is the case that shows what changed. §9h recorded that before
that block opened *"The record places nothing on this block."* and a fold with
nothing in it; §9 gave it 19 residents and $14.7 M of vendor payments. It now
opens on **the Tenderloin: 36,042 residents, 20,806 homes, nine city places of
which five carry a figure, and 3,610 decisions between 1906 and 2002** — and the
block's own blank record is the fifth thing it says rather than the first.

**Three things reading it out loud caught, all fixed.**

1. **"A mostly single family residential neighbourhood of 53 blocks"** for South
   of Market. Each block's `use` is already the plurality of ITS parcels, so a
   plurality over those is a plurality of pluralities, and the roll's word for a
   great many small SoMa parcels is not what a reader will understand by it. The
   sentence now says what was counted: *"A neighbourhood of 53 blocks, 33 of them
   mostly single family residential."*
2. **"Section 34, County Clerk — A Companion Measure to the Preceding Item."**
   was the Tenderloin's top line, on 15 blocks. It is a cross-reference: a
   reader cannot know what the preceding item was. `SELF_REFERENTIAL` demotes it
   to tier 9 — 17 group faces over all 41 hoods. `the foregoing resolution` was
   tested and **rejected**: *"Supervisor Uhl objected to the adoption of the
   foregoing resolution, holding that the improvement…"* is substantive, and
   demoting it would have thrown away one of the few places the record prints a
   dissent.
3. **"19 people live on it, in 0 homes"** on City Hall — the Census publishes
   both, and printing them in one sentence makes a workplace block read as an
   error in the data. The homes clause is dropped; the ROW above still prints
   the 0, beside its own label, where it cannot be misread. (Same family as the
   `in 1 homes` bug §14i caught by looking.)

### g. The divisions on the ground — and the label layer that already existed

> "when you're totally unzoomed at city level there's like the division of the
> city into those divisions"

`hood-rings.json`, 23 KB, fetched at mount beside `marks.json`. **43 parts and
1,647 vertices over all 41**, which is why every one is reprojected on every
render rather than cached against the camera — measured on a real whole-city
drag, **88 fps with the layer and 88 fps with the file aborted at the network.**

**The boundary is the blocks', not `ajp5-b2md`'s.** The published polygon runs
down the middle of the street; the blocks are what a reader can click. So the
outline is the union of the hood's own block rings — the same vertices the hit
test walks — closed across the gaps between them, and every vertex carries the
ground elevation of the nearest of those blocks so the line lies ON the city
rather than at sea level under Twin Peaks.

**The closing radius was measured against the check that matters: does a drawn
region trespass onto another neighbourhood's blocks?**

| radius | parts | vertices | trespass (share of drawn area on another hood's blocks) |
|---|---|---|---|
| 18 m | 111 | 3,417 | 0.02 % · worst hood 0.36 % |
| 30 m | ~70 | ~2,400 | 0.03 % · worst hood 0.83 % |
| **55 m** | **43** | **1,647** | **0.07 % · worst hood 1.00 %** (Seacliff) |

**18 m shipped first and was wrong, and only looking showed it.** The wide shot
came out as a tangle of a hundred outlines weaving round every park, boulevard
and freeway ramp: it read as noise, not as a city divided into forty-one pieces.
At 55 m there is about one shape per neighbourhood, Golden Gate Park (800 m
wide) and the freeway are still the separations they are, and the trespass is
still under a tenth of one per cent. Interior rings are dropped for the same
reason — a hole inside a division is a second outline inside the first.

**It must not pop.** `wide` is linear in LOG scale between the whole-city stop
and the block stop, then smoothstepped, so its derivative is zero at both ends:
the divisions fade in as the streets and blocks fade out. **A pixel floor is a
step in the derivative** and it is the cause of every lurch bug on this project.
The forty unselected divisions are gone by the block stop; the SELECTED one
keeps a floor on its line, because the margin beside it is a claim about that
ground — but its FILL rides the ramp all the way to nothing, since a wash over
236 blocks at close range is a stain rather than a region.

**No tint of any quantity.** All 41 draw in one ink. The selected one gets a
fill and that is a selection state, not an encoding — there is nothing on this
layer to mislead about.

**A whole layer written and then deleted, and the lesson is the brief's own.**
The first cut drew the 41 names in the SVG. The wide shot came back reading
`TENDERLOIN TENDERLOIN`, `RUSSIAN HILL RUSSIAN HILL`, `VISI VISITACION VALLEY`
— **`labels.ts` §the neighbourhood capitals has been drawing them all along**,
out of this same `hood` byte, anchored on an area-weighted centre and inside a
shared ink budget with the streets and the marks. A second set of names in an
SVG over the canvas cannot see that budget and would fight it at every zoom. The
names were deleted. What this layer adds is the one thing that was missing: the
boundary. *(`base/marks.json` does NOT carry them — only 3 of the 41 names are
in it — which is why grepping the marks file first said "not on the wire" and
looking at the frame said otherwise.)*

### h. Keys for `en.ts` / `fr.ts` — twenty-six, and thirteen deleted

`EN_SUM` and `tx()`'s old body are **gone**: the thirteen `sum_*` of §14g are in
both files (0c6ccacf) and every one is now a plain `t()` call. Verified by
dumping the panel's `innerText` and grepping for `us.sf.` — nothing.

These are the next batch, behind `tx()` in `EN_HOOD` for the same reason
(`useT` returns THE KEY ITSELF when one is missing). `EN_HOOD` and `tx()` both
go the moment they land. English identical in both files, ADR-0010 D3.

```ts
'us.sf.thecity.panel.hood_kicker': 'Neighbourhood',
'us.sf.thecity.panel.hood_block': 'Block {id}',
'us.sf.thecity.panel.hood_sum_ground': 'A neighbourhood of {n} blocks, {m} of them mostly {use}.',
'us.sf.thecity.panel.hood_sum_ground_plain': 'A neighbourhood of {n} blocks.',
'us.sf.thecity.panel.hood_sum_people': '{n} people live here, in {h} homes.',
'us.sf.thecity.panel.hood_sum_record': 'The Board decided {n} things across it between {y0} and {y1}, most of them in the {d}s.',
'us.sf.thecity.panel.hood_sum_record_flat': 'The Board decided {n} things across it between {y0} and {y1}.',
'us.sf.thecity.panel.hood_sum_record_none': "The Board's record places nothing in it.",
'us.sf.thecity.panel.hood_now_blocks': 'Blocks',
'us.sf.thecity.panel.hood_now_src': "The {c} Census, summed over the {n} of this neighbourhood's {all} blocks a census block resolves onto. City-wide that join carries {carried} of the county's {total} residents.",
'us.sf.thecity.panel.hood_money_head': 'Public money here',
'us.sf.thecity.panel.hood_money_one': 'One of the {n} city places standing here carries a figure — {place} — and what is below is the whole of it.',
'us.sf.thecity.panel.hood_money_only': '{place} is the one city place standing here, and what is below is the whole of it.',
'us.sf.thecity.panel.hood_money_some': '{m} of the {n} city places standing here carry a figure, the largest of them {place}. Each figure below is the whole of its place, added across the {m}; nothing is divided between neighbourhoods.',
'us.sf.thecity.panel.hood_money_none': '{n} city places stand here and no city ledger names any of them, so no figure is shown for them.',
'us.sf.thecity.panel.hood_money_none_one': '{place} stands here and no city ledger names it, so no figure is shown for it.',
'us.sf.thecity.panel.hood_money_cover': "A published city place resolves to {n} of the city's {all} neighbourhoods, and {m} of those carry a figure.",
'us.sf.thecity.panel.hood_hl_head': 'What the Board kept deciding here',
'us.sf.thecity.panel.hood_hl_note': "The Board's own printed lines, ranked by how many of this neighbourhood's blocks each one lands on. Nothing is summarised: every line is the volume's own and opens the page it is printed on.",
'us.sf.thecity.panel.hood_hl_blocks': 'on {n} of its blocks',
'us.sf.thecity.panel.hood_hl_blocks_one': 'on one block',
'us.sf.thecity.panel.hood_hl_more': '{n} more lines the record places here',
'us.sf.thecity.panel.hood_block_head': 'On this block',
'us.sf.thecity.panel.hood_block_lede': 'The neighbourhood above is {n} blocks. This is the one under the pin.',
'us.sf.thecity.panel.hood_block_ground': 'A mostly {use} block.',
'us.sf.thecity.panel.sum_people_no_homes': '{n} people live on it.',
'us.sf.thecity.panel.sum_people_one_no_homes': 'One person lives on it.',
```

### i. State, and the screenshots

Typecheck clean, eslint clean on all three files, **the full suite 419/419**.

`f1-n1block-*` and `f1-n2block-*` (the panel at 1440), `f1-m1phone-3549` and
`f1-m1phone-0787` (390 px — one screen carries In short, all four ground facts
and the WHOLE money answer including the link, and reaches "What the Board kept
deciding here" at its foot), `f1-d3nosel-0` (the 41 divisions at whole city),
`f1-d3sel-1` (the Mission outlined at the district stop, running down Guerrero,
Cesar Chavez and Potrero, with block 3549's own ring and pin inside it), and
`.parity/f1div.py` / `.parity/f1perf.py`, both new.

### j. Open, in the order it matters

1. **The decade rail is still the BLOCK's.** A hood's decade counts ship in
   `record.dec` and nothing draws them. A hood rail would want its own rows to
   open into, and a hood's rows are spread over all 256 shards (~21 MB), so it
   is a second pipeline artifact — the top few lines per decade per hood — not a
   panel change. Daniel has said twice the decade system is right, so this is
   the largest remaining win at this level.
2. **The highlights cap is 6 and the shelf shows 3.** `highlights_hidden` is on
   the record (2,360 for the Mission) and nothing prints it, because "2,360 more"
   is not a thing a reader can act on until there is somewhere to send them.
3. **A hood-level "went quiet"** has no sentence. `quietAfter` is a block idea
   and no hood falls silent, so nothing was written rather than writing a
   sentence for a state that does not occur.

### k. Verified after the commit, on the running page

- **No `us.sf.` key reaches the screen.** The panel's `innerText` dumped on five
  blocks — 3549, 0787, 3724, 0001, 1705 — and grepped: none. That is the check
  §14 used twice and it is the one that proves `EN_SUM`'s deletion was safe.
- **The place fiche still opens OVER the map, and now from the neighbourhood's
  own link too.** After the click: URL `/us/city/sf/places/place/moscone-center`,
  `canvas` still mounted, `.fx-drawer` present. **A first run reported this
  BROKEN and it was the harness**: the link sits at y = 911 in a 900 px viewport,
  and Playwright's `.click()` without `scroll_into_view_if_needed` never landed
  on it. The three remaining `<a>` in the panel are all external `https://`
  source links with `target="_blank"`, which is what an anchor is for.
- **The film clears the divisions**, exactly as it clears the pin — 4 SVG paths
  and a pin before, 0 and none during. (Setting `renderer.filmOn` from a script
  does NOT show this: nothing pushes a React render, so the overlay keeps the
  frame it had. The real transport control does, and that is what was measured.)
- **No frame cost.** A real drag at the whole-city stop: 88 fps with the layer,
  88 fps with `hood-rings.json` aborted at the network.

---

## 16. Block F1, round seven — the fallbacks deleted, the cap owned up to, and the rail specced

### a. `EN_HOOD` and `tx()` are gone

Twenty-seven keys landed in both dictionaries (`1492d9c7`) and every call is now
a plain `t()`. Checked the way §14 checked the thirteen before them, because
`useT` returns THE KEY ITSELF when one is missing and a diff cannot see that:
the panel's own `innerText` dumped on **nine blocks spanning nine different
neighbourhoods** — 3549, 0787, 3724, 0001, 1705, 5313, 0086, 1263, 6745 — and
grepped for `us.sf.`. **Zero.**

### b. The cap now says what it hid

The section ranks 91,391 rows and shows six, and until this pass a reader had no
way to tell *"this is what the Board did here"* from *"these are the six the
ranking put on top"*. `highlights_hidden` was on the record and unprinted, which
is a hole of exactly the kind §9c was written to close one level down.

**Two folds over one shelf would have been two different claims wearing the same
sentence.** The shelf's own expander hides rows it HAS; the cap in
`build_hood_facts.py` hid rows that were never shipped. `2,358 more lines` on an
expander that reveals three is true and reads as a lie. So the shelf's cap is
now `docs.length` — every shipped line on screen — and the count below is the
one the pipeline cap hid:

```
Mission          2,358        Golden Gate Park       8
South of Market  1,813        Glen Park            480
Tenderloin       1,562        Russian Hill         900
```

Golden Gate Park's 8 is the check that the number is real and not a constant.

### c. Three edge cases read aloud on the phone, all correct

- **Bayview Hunters Point** — *"2 of the 3 city places standing here carry a
  figure, the largest of them Southeast Water Pollution Control Plant"*, then
  $611.7 M agreed against $689.5 M paid and the **paid-above-agreed line firing
  at hood level** exactly as it does on the block. That refusal travels with the
  rollup because it is a property of the two source files.
- **Golden Gate Park** — *"Kezar Stadium is the one city place standing here"*,
  payees only, so no contracts row, **no "do not add these" line** (only one
  ledger is on screen, §9g's rule), and **$919,013 printed in full** rather than
  abbreviated.
- **Russian Hill** — no money section at all, absent rather than empty, which is
  §9c's decision holding one level up.

### d. Mobile, measured rather than eyeballed

390 × 844, both a neighbourhood and a block populated. Section heads as a
fraction of a screen, so the order is a number:

```
                                    3724 (SoMa)   5313 (Bayview)
IN SHORT                              0.15            0.15
ON THE GROUND NOW                     0.29            0.29
PUBLIC MONEY HERE                     0.58            0.57
WHAT THE BOARD KEPT DECIDING HERE     0.95            1.08
ON THIS BLOCK                         2.00            2.20
PUBLIC MONEY (the block's)            2.39            2.60
DECADE BY DECADE                      2.82            2.99
```

**§13f's rule holds: the rarest thing the panel knows is on the first screen.**
Money reaches 20 of 41 neighbourhoods and it opens at 0.58 — the whole answer,
figures and link, above the fold. Six highlights cost 1.05 screens, and looked
at rather than counted they are not a wall: each is a gloss and two small lines.
Screenshots `f1-mbfiche-3724`, `f1-mbfiche-5313`, `f1-mbfirst-*`, and
`.parity/f1mob.py`, which prints the table above.

### e. One thing reading it aloud caught and I did NOT fix — with the reason

**On block 3724 the money figures appear twice, identically**: $776.3 M agreed /
$360.5 M paid / $372.3 M to six vendors, once under `PUBLIC MONEY HERE` and
again under the block's own `PUBLIC MONEY`. It happens whenever the
neighbourhood's only figure-carrying place is the one standing on the picked
block — which is rare across the map and true of two of the demo's best blocks,
Moscone and City Hall.

They are two true statements at two grains and each section is self-contained.
The tempting fix is to drop the figure ROWS from the block's section and keep
its sentence, which is the one thing it says that the hood's does not — *which
building stands here*, `Moscone West, 775,000 sq ft`. **Not done, deliberately:
there is no key to explain the absence**, and a money section that shows a
building and no figure, with nothing saying the figure is two screens up, reads
as a section that failed to load. That is a worse failure than a repetition.

It wants one key and then it is five lines:

```ts
'us.sf.thecity.panel.money_above': 'Its figures are under {hood} above — it is the only city place there that carries any.',
```

gated on `places.length === 1 && hood.money.places_with_a_figure === 1 &&
hood.money.top?.slug === places[0].slug`, which is exactly the observed case and
nothing else.

### f. The neighbourhood decade rail — specced, not started

Over an hour, so per the coordinator's instruction it is written down and
stopped. Daniel has said twice the decade system is right, which is the argument
for doing it properly.

**What exists.** `hood-facts.json` already ships `record.dec` — `[decade,
count]` per hood, ascending — so the SHAPE of a neighbourhood's century is on
the wire and nothing draws it. What is missing is what a rail is for: rows to
open into.

**Why it is a pipeline block and not a panel change.** A hood's decisions are
spread across all 256 shards, because a block's shard is `blockIndex % 256` and
a neighbourhood's blocks are contiguous in space, not in the index. Reading a
hood's rows in the browser means fetching **21 MB**. It cannot be done at click
time and it must not be bundled: 41 hoods × ~12 decades × 3 lines is ~1,500 rows
at ~200 bytes, ~300 KB, against `hood-facts.json`'s current 81 KB.

**The shape it wants** is the one the block record already uses — a T1 shard per
entity, fetched on the click that needs it:

```
website/public/data/us/sf/city/blocks/hood/<i>.json      ~7 KB each
  { i, dec: [ { decade, n, rows: [ <the curated top 3, same fields as
                                    highlights> ] } ] }
```

**Built by re-running `curate()` per (hood, decade)** — it already takes a list
of `(blockId, rank, row)` and is pure, so the change is one extra grouping key
and a second write. The tier table, the dedupe, the procedural and
cross-reference demotions and the blocks-reached sort all apply unchanged, which
is the payoff of having written it as a function rather than inline.

**Three things the panel must keep when it draws it.**

1. **`afterSeries` still applies.** All 142 Journal volumes end in 1998–99, so a
   hood rail must draw the decades past the series as *unrecorded* and not
   *empty*, with `sum_rail_end` under it. That sentence is about the record
   stopping and is true at every grain.
2. **Two rails on one panel is one rail too many.** The block's rail is the one
   that opens into whole shelves. A hood rail should be the SHAPE — the bars and
   the decade's best line — and should not compete with it. The likely answer is
   that the hood rail replaces `WHAT THE BOARD KEPT DECIDING HERE` rather than
   joining it, since a decade's best line and a top-ranked line are the same
   material sorted two ways.
3. **`quietAfter` does not transfer.** No neighbourhood falls silent — 40 of 41
   run to the end of the series — so there is no hood sentence for it and none
   was written. A sentence for a state that does not occur is a sentence nobody
   has checked.

---

## 17. Block F1, round eight — the blue borders come off

> "can you remove the blue borders from the districts it's weird?"

He is right and the reason is nameable: **a saturated `--bleu` hairline was the
only thing on that frame that is not in the map's own ink.** Every other line
here — street, kerb, coast, block edge — is a tone of the ground it sits on, so
a UI blue laid over them read as a debug overlay on the drawing rather than as
part of it.

Taken off FIRST and looked at before anything replaced it, which is the order
that was asked for and the right one: the question was never *which colour*, it
was *does this want a line at all*. Looking at the stripped frame answered two
questions at once.

**1. The other forty are gone entirely.** With the stroke off they were a 5 %
ink wash that could not be seen at any zoom, and they cost **19,816 characters
of path string on every render** to draw it. They are not missed, because
`labels.ts` §the neighbourhood capitals has been drawing all 41 NAMES at that
zoom all along, in the map's own type and inside its own shared ink budget.
**The names are the division.** This is the second time this layer has tried to
duplicate that file and the second time the answer was to delete mine (§15g was
the first).

**2. The selected one is shown by FOCUS, not by a fence.** Not a wash over it —
a wash over 236 blocks reads as a stain — but a **paper scrim over everything
else**, punched through by the neighbourhood's own outline with `fill-rule:
evenodd`, one path, one subpath more than before. It says *this is the ground
the margin is talking about* with the move a paper map already makes, and there
is no line in it anywhere. It rides the same `wide` ramp, so it is strongest at
the whole-city stop where a neighbourhood is a shape and gone by the block stop
where the block's own ring takes over.

`hood-rings.json` is still doing the work; what changed is that its geometry now
cuts a hole rather than drawing an edge.

**What is still blue is the BLOCK's ring**, and it stays: that is §14a, it is
what Daniel asked for, and it is a single small figure under the pin rather than
forty lines across the city. Screenshots `f1-e2sel-0` (whole city — the Mission
is the only saturated ground on the frame) and `f1-e2sel-1` (district — the
scrim at 0.23 reads as clearer air over the Mission, not as a dirty screen).

---

## 18. Block F1, round nine — ranking by what is DISTINCTIVE, and where it fails

> "Ranking by how many blocks a line lands on surfaces the most *administratively
> spread* item, which is reliably the least interesting one."

Correct, and the evidence was on the page: **Lone Mountain/USF led with *"Fixing
Date for Hearing Appeal of M. Schlosser Against Assessment for Improvement of
Sidewalks"*.** Routine paving touches many blocks, so the spread sort ranked
paving.

### a. Two scores were tried before this one, and both were WORSE

Named here rather than deleted, because a rejected measurement is the only
evidence that the shipped one was chosen rather than guessed.

**Distinctiveness alone** — the mean inverse hood-frequency of a line's own
words — is worse than the spread sort it replaces:

```
Mission           "Splicer $5.50 Laborer (acting as Foreman).."
Sunset/Parkside   "Authorizing Settlement of Claim of Mabel Molenda by
                   Pasrment of $225."
```

**Rarity in this corpus is mostly SURNAMES and scanning errors, not
significance.** A one-off person's name is maximally rare by construction.

**Distinctiveness × log(1 + blocks)** still over-weights rarity: the Sunset lost
its **1927 Municipal Railway bond election, on 24 of its own blocks** — which is
the Sunset's actual story — to that same $225 settlement.

**Distinctiveness × blocks, linear,** is what ships. It keeps what the spread
sort found and drops what the spread sort could not see past.

### b. And the mean is taken over the three most distinctive words, not all of them

Averaging over every token penalises a long, specific line for the common words
it needs to be a sentence: *"Removal and Abandonment of Street Railway Tracks —
Ninth Street Between the Southeasterly Line of Bryant Street…"* is dragged under
a six-word line by `street`, `line` and `between`. Asking instead **does this
line name a few unusual things** is length-neutral, and it is what lifted the
Sunset's 1953 Underground District back over the settlement.

### c. What it produces now

```
Sunset/Parkside   1927  Giving Notice of Special Election for Bonds for
                        Municipal Railway Extensions.
                  1953  Creating Underground District No. 137, Eucalyptus Drive…
Mission           1917  Spring Valley Water Company to Connect Up Drinking
                        Fountains on Mission Street.
Bayview H. Point  1935  Spur Track, Pacific Can Company, Across Newhall Street…
Fin. District     1918  Sailors' Home Property Relinquished to United States
                        Government.
Tenderloin        1930  Masquerade Ball Permit, United Slovenian Societies of
                        San Francisco, Eagle's Auditorium, 375 Golden Gate…
                  1929  Granting Laundry Permit, James R. Kenny… 388-390 Eddy St
Lone Mountain     1926  Invitation to Cities and Towns of Northern California
                        and Los Angeles to Attend Conference…
```

The Tenderloin's masquerade ball and laundry permit are exactly the *"a stable,
a laundry"* the change was asked for, and Lone Mountain's sidewalk hearing has
fallen off the page.

### d. WHERE IT FAILS, and it is not a bug

**South of Market got worse and I am not going to hide it.** Before:
*"Removal and Abandonment of Street Railway Tracks — Ninth Street…"*, *"Creating
Underground District, Ninth Street…"*, *"Ordering Construction of Bond Sewer in
Islais Creek."* After: *"Board of Public Works to Recommend Bitulithic Pavement
on Sixtli Street"*, *"Providing $400 for Extra Work on Board of Heaitin
Quarters"*.

The cause is a real limitation of the signal and worth stating plainly:
**where a CITYWIDE programme lands densely in one neighbourhood, a measure of
"distinctive to this neighbourhood" reads it as boilerplate.** Streetcar-track
removal happened all over San Francisco; it was concentrated in South of Market.
Distinctiveness cannot tell that apart from paving, because by its own
definition it is not distinctive.

**One net regression against five clear gains** is the honest score. The route
out is not another tuning pass — it is a second signal that measures *density*
(this neighbourhood holds an unusual SHARE of the city's rows on this subject)
rather than rarity, which would rescue SoMa's streetcars without re-promoting
Lone Mountain's sidewalks. Not attempted tonight, because I have now made four
scoring passes and **`feedback_eval_rigor` is exactly about judging a change
after having seen its output.** Recorded for a decision instead.

### e. The OCR gate — tier 9, on characters, not on a dictionary

> "The decade rail is printing raw OCR. *1,588.11 December (I, 11)07 — To the
> Barber Asphalt l\*avinjr Company* reads as a broken page."

A reader reads straight past `Sciiool` for School and `IVIay` for May; nobody
reads `l*avinjr`. So the gate is on **characters**: a token is broken when a
digit sits against a letter, when it carries punctuation no word carries, or
when four or more letters hold no vowel. A line whose broken share is over
**10 %** joins the tier-9 band — counted, never shown — beside the Journal's
machinery, its cross-references and the fragments.

It is deliberately **not a spell check**, which would throw away every surname
and every street the city ever named. MEASURED over 10,570 group faces: **84 %
pass.** City-wide it moves **4,177 group faces** into tier 9.

### f. Six highlights became three

> "Six highlights is five too many."

Three, and **fixing the ranking is what made three safe**: while the sort was
spread-only, positions 4–6 were where the good lines hid, so the cap was
propping up a ranking that could not be trusted at the top. The count the cap
hid still ships beside them.

Measured at 390 px: **`ON THIS BLOCK` moved from screen 2.00 to 1.60**, a fifth
off the length of the panel, with money still opening at 0.58.

### g. State

Typecheck clean, eslint clean, **420/420**. `hood-facts.json` 58 KB. Both halves
of the score — `d` and `score` — ship on every highlight, so a reader of the
file can see WHY a line is at the top and not only that it is.

### h. ONE KEY IS NOW FACTUALLY WRONG ON SCREEN — for the owner of `en.ts`/`fr.ts`

`us.sf.thecity.panel.hood_hl_note` still reads:

> "The Board's own printed lines, **ranked by how many of this neighbourhood's
> blocks each one lands on.** Nothing is summarised: every line is the volume's
> own and opens the page it is printed on."

That was true of the spread sort and **is no longer true of the code**. It is a
methodology claim printed on the page that does not match what the page does,
which is the one class of error this project may not ship. The replacement,
matching `build_hood_facts.curate()` exactly:

```ts
'us.sf.thecity.panel.hood_hl_note': "The Board's own printed lines, ranked by how unusual their words are across the city's other neighbourhoods and how many of this one's blocks each lands on. Nothing is summarised: every line is the volume's own and opens the page it is printed on.",
```

Until it lands the panel prints a claim it cannot keep. It is the only string
affected.

---

## 19. Block F1, round ten — one grain, one form

> "this is again too much information, there's no hierarchy or quick scan of
> info, please evaluate this format"

He is right, and the diagnosis that beat the obvious one is worth stating first
because it is what the whole change turns on.

**The redundancy was never hood-versus-block. It was PROSE-VERSUS-FIGURES at
each level.** The neighbourhood said *"A neighbourhood of 53 blocks, 33 of them
mostly single family residential. 28,506 people live here, in 15,913 homes."*
and then, four rows immediately under it, `Blocks 53 · Mostly Single Family
Residential · Residents 28,506 · Homes 15,913`. Every one of the four facts was
printed twice, in two forms, at one grain — and a reader had to read both
before they could know the two agreed. The same pattern ran again one level
down.

So: **prose for the neighbourhood, figures for the block, and neither is both.**

### a. What was deleted, and where each fact went

| deleted | the fact it carried is now |
|---|---|
| the hood's `Residents` / `Homes` / `Mostly` / `Blocks` rows | in the "In short" paragraph directly above them, verbatim |
| the block's whole "In short" paragraph | rows: `Mostly` was the ground clause, `Residents`/`Homes` the people clause, `PUBLIC MONEY` the place clause |
| — its record clause, which was in NO row | **two new rows**, `Board decisions 71` and `In the record 1906–1998` |
| — its `quietAfter` clause | a caption under the rail, beside the other caption about the rail |
| the block's money FIGURES, on 16 blocks | see §e |

**Nothing was dropped without a home.** The one clause the block's paragraph
said that no row said — *"The Board decided 71 things here between 1906 and
1998"* — is `RecordFactRows`, folded into the roll's own list so the block is
one table and not a table plus a stray pair.

**The busiest decade did NOT become a row, deliberately.** *"most of them in the
1900s"* is what the rail four rows below is FOR: a bar per decade scaled against
the busiest one. A row restating it in five words is a caption on a drawing that
already says it.

`BlockSummary` still exists and still says all of it, and runs on exactly one
path: the session where `hood-facts.json` did not arrive. There it is the only
prose on the panel and has nothing to repeat.

### b. Provenance is a footnote now, and it wants a home in `fusion.css`

*"The 2020 Census, summed over the 82 of this neighbourhood's 90 blocks a census
block resolves onto. City-wide that join carries 868,555 of the county's 873,965
residents."* — **thirty-six words qualifying a five-word fact, set at the size of
the fact.** It may never leave the page; it is the project's whole claim. So it
drops a step instead: `NOTE` in `CityBlockPanel.tsx`, applied to the SIX
how-we-know paragraphs and to nothing else.

```
census join (hood)   money coverage (hood)   ranking note (hood)
assessor roll (block)   money coverage (block)   the two rail captions
```

NOT `money_ledgers` or `money_over`: those are refusals about the figure
directly above them, and `money_ledgers` carries the link out of the panel.

**FOR THE OWNER OF `src/app/fusion.css`.** Two inline objects are standing in
for this. They want to be one class, next to `.fx-block-hint` at line ~17186:

```css
/* Provenance is a footnote, not a second paragraph. The sentence that says
   what a figure was joined from may never leave the page — but it is longer
   than the fact it qualifies, and at `fx-block-hint`'s 11.5 px it competed
   with it. A footnote is the same sentence set so the eye can skip it and
   come back. */
.theme-fusion .fx-block-note {
  margin: 7px 0 0;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--muted);
  opacity: .82;
}
/* `.fx-block-jump` sets 12.5 px of its own, which inside a footnote is
   bigger than the footnote. */
.theme-fusion .fx-block-note .fx-block-jump { font-size: 10.5px; }
```

When it lands, `NOTE` and `NOTE_LINK` are deleted and every `className=
"fx-block-hint" style={NOTE}` becomes `className="fx-block-note"`.

### c. Empty decades are collapsed, NOT deleted

Deleting them was never available: the caption under the rail says in so many
words that the blank decades after 1999 are *"because the record stops there,
not because the city stopped deciding"*, so a rail that dropped them would
contradict copy shipping on the same screen. The silence is information.

What was furniture is the repetition. A run of two or more consecutive empty
decades folds into ONE track carrying both its ends — `2000s–2020s` — and a run
of one stays exactly as it was, because `1960s–1960s` is worse than `1960s`.

**A run never crosses the end of the Board's scanned series.** An empty decade
inside the series is a silence the record observed; one past it is a decade the
record never reached, and §14g draws them differently on purpose. `railItems()`
in `block-records.ts` is pure and has two tests: the fold's label and count, and
that no run spans 1990→2000. It also asserts every decade is still accounted for
exactly once, which is the check that the fold cannot lose a decade.

`.fx-block-dec` is a 34 px column sized for `1960s`; a range is three times that
and spilled over the track beside it. The range sizes to itself. What stays in
its column is the COUNT at the right — the only number on the rail a reader
compares down the page, and an empty run has none.

### d. Three highlights — already shipped in §18f, verified here

Unchanged, and the ranking was NOT touched. §18d's South of Market regression is
still live and still the right call to leave alone: four scoring passes have
been run, and judging a fifth after seeing its output is what
`feedback_eval_rigor` names.

**One correction to §18c, found by looking rather than by re-scoring.** It
records that *"Lone Mountain's sidewalk hearing has fallen off the page"*. It has
not: *"Fixing Date for Hearing Appeal of M. Schlosser Against Assessment for
Improvement of Sidewalks on Grove Street"* is **still position 3 of 3** on Lone
Mountain/USF. It is no longer the LEAD — the 1926 traffic-code conference is —
which is the gain §18 actually bought. Recorded here so the next reader of §18c
is not told something the page contradicts.

### e. §16e's duplication, fixed — the fifth change, and how to revert it

§16e found that on block 3724 the four money figures print **twice,
identically**, once under `PUBLIC MONEY HERE` and again under the block's own
`PUBLIC MONEY`, and did NOT fix it for one stated reason: *"there is no key to
explain the absence, and a money section that shows a building and no figure,
with nothing saying the figure is two screens up, reads as a section that failed
to load."*

With the hood's four fact rows gone, this became the largest remaining
repetition on the panel — and on Moscone, which is a demo block. `tOr()` (§g)
removes the only blocker, so §16e's fix ships **with its gate unchanged**:

```
places.length === 1 && hood.money.places_with_a_figure === 1
                    && hood.money.top?.slug === places[0].slug
```

MEASURED against `block-money.json` and `hood-facts.json` together, rather than
asserted: it fires on **16 blocks of 5,404, over 13 neighbourhoods** — the four
Moscone blocks, Coit Tower, Kezar, Portsmouth Square, the Palace of Fine Arts,
Laguna Honda, Zuckerberg SF General, Pier 70, Stern Grove, Glen Canyon, McLaren,
the EOC, the Public Safety Building. **It does not fire on City Hall**: the
Tenderloin carries five figures and City Hall is one of them, so the block's own
are not the neighbourhood's. Read on the page for City Hall, Coit Tower and
Kezar, all three correct.

**One thing landing it caught.** The lead sentence ends *"…and every figure below
is the whole of it"*, which with the figures gone is a sentence pointing at
nothing. `money_spans` is suppressed under the same gate. Without that check the
fix would have shipped a false claim to remove a repetition.

**To revert:** pass `figuresAbove={null}` at the one call site. Nothing else
depends on it.

### f. Measured, not eyeballed

Word counts of the panel's own `innerText`, at 390 px, by section:

```
                                    1170 Lone Mountain   3724 Moscone
IN SHORT                                  68                 68
PUBLIC MONEY HERE                          —                 74
WHAT THE BOARD KEPT DECIDING HERE        173                136
ON THIS BLOCK                             82                 68
PUBLIC MONEY                               —                 83
DECADE BY DECADE                         255                304
TOTAL                                    594                750
```

And the section heads as a fraction of an 844 px screen, against §16d's table
for the same block:

```
                                    3724 §16d   3724 §18f   3724 now
PUBLIC MONEY HERE                     0.58         —          0.35
WHAT THE BOARD KEPT DECIDING HERE     0.95         —          0.72
ON THIS BLOCK                         2.00        1.60        1.30
PUBLIC MONEY (the block's)            2.39         —          1.63
DECADE BY DECADE                      2.82         —          2.06
```

**The whole money answer now opens at a third of a screen** and the block at
1.30 — down from 2.00 two rounds ago. `.parity/f1words.py` is new and prints the
first table; `.parity/f1mob.py` prints the second.

**The measurement NOT to trust is the word count of the rail.** `.fx-block-line`
is `-webkit-line-clamp: 3`, so a 40-word OCR headline occupies three lines on
screen exactly as a 12-word one does. The rail is 43 % of the panel's words and
nothing like 43 % of its height.

**Where the length actually is now, and it is not something this round could
cut.** After the fold, `DECADE BY DECADE` is the longest section on every block
measured, and it is one clamped headline per decade — the rail IS the
navigation, and each row is the only thing on screen saying what that decade
holds. If the panel has to get shorter again, that is the section to take it
out of, and the honest way is fewer decades on screen (a fold at the century's
midpoint) rather than shorter lines, because the lines are the Board's own words
and truncating them further is where a summary would start.

### g. Keys — four for `en.ts` / `fr.ts`, and two now unused

Behind `tOr(t, key, english)`, which is one function rather than §14/§16a's
map-and-`tx()`: `useT` returns THE KEY ITSELF when a key is missing, so a bare
`t()` would print `us.sf.thecity.panel.now_span` on the panel. **It disposes of
itself** — the fallback is only reached while `t(k) === k`, so the day these
land every call starts returning the dictionary's string and the literals go
with the helper. English identical in both files, ADR-0010 D3.

```ts
'us.sf.thecity.panel.now_decisions': 'Board decisions',
'us.sf.thecity.panel.now_span': 'In the record',
'us.sf.thecity.panel.rail_gap_aria': '{range} — nothing on this block',
'us.sf.thecity.panel.money_above': 'Its figures are under {hood} above — it is the only city place there that carries any.',
```

`money_above` is §16e's own text, unchanged.

**Two keys have no caller any more** and can be deleted whenever it suits:
`us.sf.thecity.panel.hood_now_blocks` ('Blocks' — the row is gone) and
`us.sf.thecity.panel.hood_block_ground` ('A mostly {use} block.' — the paragraph
is gone). `now_head` still has one caller, on the no-rollup fallback path.

### h. State

Typecheck clean, eslint clean on both files, **422/422** (420 + the two
`railItems` tests). No `us.sf.` key reaches the screen — checked the way §14 and
§16a checked it, by dumping the panel's `innerText` and grepping, on the blocks
listed in §i.

### i. Looked at on a REAL `next build`, at 1440 and at 390

`__cityRenderer` is inlined out of a production bundle by design (`renderer.ts`
gates it on `NODE_ENV`), so `onPick(i)` does not exist there and the selection
has to be a real canvas click — which §14a already established is the only way
to see the pin and the ring where they actually land. Two new harnesses do it:
`.parity/f1prod.py` presses through `CityEntry`, clicks a grid and keeps the
click whose panel carries every section; `.parity/f1prodw2.py` shoots the 1440
margin in scroll steps, because `.fx-city-ledger` is a fixed-height scroll
container and an element shot of the panel inside it comes back as a tall blank
with the page's overlays composited in.

`/Users/daniel/code/qipu-prod` was rebuilt at **730fd89c** and **port 3100 now
serves that**, not 35524e0e.

- `f1-p10mfull` — 390 px, Sunset/Parkside block 2115, every section: prose,
  footnote, the money answer whole, three lines, the block's five rows, the
  rail with `1950s–1960s` and `2000s–2020s` folded and `1900s` / `1990s` left
  alone.
- `f1-p10wsc0..4` — the 1440 margin end to end, Nob Hill block 0297. `sc2` is
  the one to look at: the block is five rows and a footnote, and it is the
  first version of this panel a reader can take in without reading it.
- `f1-r10fiche-1170` / `-3724`, `f1-r10first-1170` — the dev-server pass the
  work was iterated on.

**What looking caught that measuring did not.** `.fx-block-dec` is a 34 px
column and `2000s–2020s` spilled over the track beside it; the range sizes to
itself now. And Moscone's lead still ended *"every figure below is the whole of
it"* after the figures had gone — §e.

**What is still true and still ugly, in Daniel's own terms.** The three
highlight glosses are set LARGER than "In short", because `FicheArchiveShelf`
is the house archive component and sizes its own gloss. Under a page whose
lead is 13.5 px that is a hierarchy inversion, and it is the biggest thing on
the panel this round did not fix. It is not this block's file.
