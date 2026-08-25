# The record after the scans — `qvu5-m3a2`

Built by `build_block_landuse.py`. Landed 2026-08-25 on `refactor/paris-parity`.

The block record (`block-records.ts`) ends in 1999 because the scanned *Journal of
Proceedings* ends in 1999. This closes the gap on the map with a **different subject**,
and the whole discipline of the file is that the difference is never blurred.

## 1. What it is, and what it is not

**It is** the San Francisco Planning Department's own record of what was **proposed** on a
block, what the department decided about it, and how many homes the application proposed
to add or remove.

**It is not the Board of Supervisors deciding anything.** Nothing here may render under a
heading that says the Board decided. `subject: "planning"` and `authority: "San Francisco
Planning Department"` ship inside the payload precisely so a renderer cannot lose it.

## 2. The numbers, measured by the build

```
source rows                        54,478      qvu5-m3a2, 1974-05-21 .. 2026-08-24
  before 2000                      13,873      not shipped, see §5
  post-1999                        40,605
    no block at all                 4,506      NOT placed
    block the map does not publish     41      NOT placed, see §6
    PLACED                         36,058      88.8% of post-1999
blocks carrying at least one        4,492      83.1% of the 5,404 the map publishes
```

For scale: the Journal's own record answers 4,679 blocks. This answers **4,492**, over a
period the Journal does not cover at all, and it runs to the day it was fetched.

```
decade   projects   covers                 partial
2000     11,677     2000-01-03..2009-12-31   no
2010     16,457     2010-01-05..2019-12-31   no
2020      7,924     2020-01-02..2026-08-24   YES
```

## 3. The files, and the tiers are the ones the record already established

```
website/public/data/us/sf/city/blocks/block-landuse.json          136 KB  (35 KB gz)
    T0. Columnar, one entry per block that carries anything, plus `coverage`,
    `decades`, `sources`, `not_measured`.

website/public/data/us/sf/city/blocks/landuse/landuse-NN.json     256 shards
    T1. 28.7 KB median, 38.9 KB max — the record's own shards are 90 KB, so this
    is cheaper per click. 27,820 projects, capped at TOP=12 per block.
```

**The shard rule is character-for-character the record's**: `shard = blockIndex % meta.shards`,
`blockIndex` being the position of the block in this payload's own `b` array, `meta.shards`
being 256. The panel's existing loader arithmetic works unchanged.

Build is **deterministic** — two runs produce byte-identical shards and a byte-identical T0
once `generated_at` is removed. Verified, not assumed.

```
python3 pipeline/scripts/us_sf_city/build_block_landuse.py --fetch
python3 pipeline/scripts/us_sf_city/build_block_landuse.py --build
```

## 4. PANEL WIRING — handoff spec, not implemented here

`CityBlockPanel.tsx`, `block-records.ts` and `CityMap.tsx` are owned by another agent and
were **not touched**. This is the whole of what the wiring needs.

**a. Loading.** Same two-tier shape as the record. T0 once at first paint; a shard on click:

```ts
const shard = blockIndex % meta.shards;          // meta.shards = 256
`/data/us/sf/city/blocks/landuse/landuse-${String(shard).padStart(2,"0")}.json`
```

T0 arrays are parallel and index-aligned: `b`, `n`, `y0`, `y1`, `un`, `d`.
`d[i]` is per-decade counts aligned to `decade_start` (`[2000, 2010, 2020]`).

**b. The heading must name the department, never the Board.** Read `authority` from the
payload. A section that says "The Board decided" over these rows is the one thing this
file must never be made to say.

**c. The rail's post-1999 treatment.** Today every decade past `SERIES_LAST_YEAR` draws as
`afterSeries` ("unrecorded"). That is correct **only for the Board's record**. For this
layer, a decade becomes real **only if `decades[d].n > 0`** — and a decade with
`partial: true` must not draw as a full decade. The 2020s carry 7,924 projects through
2026-08-24 and are **partial by the calendar, not by the record**. `through` gives the last
date actually covered; `partial` says whether it reaches the decade's end. Both ship in the
data so the panel never recomputes them.

**d. Truncation must be stated.** The shard carries at most `TOP` (12) projects; `n` in T0
is the true total. Block 3722 has 73 projects and ships 12. The panel says "12 of 73",
never just twelve rows.

**e. Coverage must be stated.** `coverage.pct_post1999_placed` (88.8) and
`coverage.pct_blocks_with_any` (83.1). A block with nothing says the department's record
places nothing on it — **not** that nothing happened there.

**f. `un` is applied-for, not built.** `number_of_units_net` summed. It goes negative
(block 3722 reads −1) and that is real. It is not a count of homes built, and
`units.un` says so verbatim.

**g. Citation.** Each shard row carries `id` (e.g. `2026-002324PRJ`). The department's own
resolver is `https://sfplanninggis.org/pim?search=<id>`. Dataset landing:
`https://data.sfgov.org/d/qvu5-m3a2`.

Row shape: `{y, dt, id, a, t, st, dc, u}` — year, ISO date, record id, address, the
department's own description (snipped at 240 on a word boundary, cut marked with `…`),
record status, decision, net units. Rows are **date order, newest first, and nothing else**.
There is no ranking, because a "top project" is an editorial judgement this file has no
standing to make.

## 5. Why post-1999 only — a real artefact, and where it lives

`open_date` carries a placeholder. **2,335 rows fall on 01-01 against ~190 for any other
calendar day**, a 12× spike. Every one of them is in **1981–1990**, and it is also what
explains that decade's apparent explosion (56 rows in 1979, 540 in 1981): the department
backfilled its pre-computer records with a January-1 date. Before 1981 the series runs
38–56 rows a year, which is a records-system boundary rather than a quiet city.

**Post-1999 the placeholder is ONE row in 40,605.** The shipped range is the clean one, and
it is also the range the scanned Journal does not already answer. `FROM_YEAR = 2000`.

## 6. The 41 dropped rows, and why they are not rescued

21 block ids that the map does not publish. Measured:

```
resolve to a UNIQUE published child   11 rows    "4327" where the map has only "4327A"
ambiguous between two children         2 rows    "7126" -> 7126A, 7126B
no such block at all                  28 rows    "0000", "024", "002", "039" — malformed
```

A parent → unique-child rule is defensible and is **not** applied: it buys 11 rows out of
36,058 (0.03%) and costs the rule that a row without a block the map publishes is not
placed. The breakdown ships in `coverage.block_not_on_map_because` so the choice is
inspectable and nobody "repairs" it by guessing a neighbour.

## 7. Legistar — costed, and deliberately NOT the headline

The Board's modern legislation lives in Legistar. It is cached already at
`pipeline/minutes/cache/legistar/`, **30,428 matters for 2000–2018**, carrying
`MatterTitle`, `MatterIntroDate`, `MatterTypeName` — and **no location field of any kind**.

**The Journal's address-extraction pass works on it unchanged.** This was estimated at six
weeks and the estimate is wrong. `pipeline/minutes/extract.py::locations_from()` and
`scratchpad/sf-city-anim/blocks/build_index.py::locate()` accept Legistar titles built into
the `items.jsonl` shape with no modification. Measured on 500 matters, seed 7:

```
94 / 500  (18.8%)  carry a street the gazetteer resolves
84 / 500  (16.8%)  PLACE
58 / 500  (11.6%)  at block precision (tier >= 1)
   stated 7 · addr 49 · segment 1 · corner 1 · street 26
```

49 of the 58 are `addr` — a real house number inside a real parcel range. Extrapolated:
**~3,500 matters at block precision. A day of work, not six weeks.**

It is not the headline for two reasons, both fatal on their own:

1. **One item in six places.** 16.8%.
2. **The public API ends at matter `181177`, 2018-12-11.** Verified with an unfiltered
   `$orderby=MatterIntroDate desc` — the only two rows after it are placeholders
   (`TMP-014`, `T19-021`). **This is the ceiling of the route, not a stale cache.**
   A rail lit for the 2000s and 2010s and dark for the 2020s reproduces exactly the
   "the city stopped deciding" reading that the rail's own caption was written to prevent.

Also measured: `/matters/{id}/indexes` is empty, `/texts` rejects GET, and every
`MatterText*`/`MatterEXText*` slot is null. **`/matters/{id}/attachments` works** and
returns the drafted ordinance as a `.DOC` on `legistar1.com` — see §8.

**A trap, recorded.** `pipeline/minutes/legistar.py::year()` caches per year and skips any
cached file over 40 bytes. Probing 2019–2026 wrote eight authoritative-looking empty
caches. They were deleted. A fetcher treating those as real on its next run would have
silently capped the corpus at 2018 months from now.

## 8. Sources deliberately not used

- **`cz9b-x8ed` "Legislation" on DataSF is not a dataset.** It is an `href` view whose only
  access point is `https://sfgov.legistar.com/Legislation.aspx`. Legistar genuinely is the
  only Board-legislation route.
- **`record_type` in `qvu5-m3a2` discriminates nothing** — all 54,478 rows read `PRJ`. It
  is not fetched.
