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
