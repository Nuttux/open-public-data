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

### `pipeline/seeds/` — the place↔facility crosswalk has three defects

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

### `src/i18n/en.ts` and `fr.ts` — twenty-three keys to add

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
