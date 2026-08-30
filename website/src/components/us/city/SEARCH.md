# Searching the city by name

Block S1, 2026-08-28.

> "i want to make a feature which is a search, for an adress, neighboorhood, building etc and
> then it fetches the records and finances of the place"

Until this, **the map was the only way in.** A reader who already knew what they were looking
for — their own street, the neighbourhood they live in, the library on the corner — had to find
it by eye on a picture of San Francisco with 5,404 blocks in it. Everything the fiche can open
was unreachable by name.

## 1. What is searchable, measured

| kind | count | what it is |
|---|---:|---|
| `hood` | 41 | the map's own divisions. Exact; 35 carry a written paragraph. |
| `street` | 1,440 | every street with a record file of its own. |
| `place` | 105 | curated civic places; 102 also findable by their address. |
| `addr` | 7,375 | a door the Board of Supervisors printed a house number for. |
| | **8,961** | **346 KB, fetched on first focus — see §9** |

## 2. Finances are NOT in this feature, and the measurement is why

The ask was "records **and finances**". Records the data can deliver. Finances it cannot, at
the scale a search box implies:

* **30 of 5,404 blocks carry a money figure.** 66 have a curated place at all.
* Budget, payroll and contracts are organised by **department and vendor**, not by location.
* Every one of the 105 place files carries a `money` object, so a naive "$" flag would mark all
  of them — and **Coit Tower's `money` is Recreation & Parks' $250,373,849 budget line for
  FY2025**, which belongs to the department, not the tower. `block-money.json` makes the same
  point about its own figures in `money_is_the_whole_place`.

A `$` on a search result would be read as *this place cost that*. There is no money flag in the
index at all. Widening the coverage — geolocated DPW projects, permit values — is a pipeline
block of its own and was explicitly set aside.

## 3. Architecture

```
build_search_index.py  →  blocks/search-index.json    columnar, 102 KB
lib/us/city-search.ts     pure resolver + fallback     18 tests
components/…/CitySearch   the box, top of the ledger, always reachable
CityBlockPanel            gains `request` — search pushes the unit in
CityGLMap.goToHit         moves the camera, rings the block, sets the unit
```

**Columnar, and the normalised form is not shipped.** As a list of objects the file was
**289 KB** — more than `threads.json`, and it has to arrive before a reader can type. Parallel
arrays, a kind expressed as four `[start, end)` runs rather than 2,820 copies of four words,
and the normalised label dropped entirely: the browser runs `normSearch` over the label column
once on load. That last one also removes a class of bug — the pipeline's normalisation and the
browser's cannot drift apart when only one of them exists. 289 KB → **102 KB**.

**Fetched on focus, not on load.** The map already pulls megabytes of geometry before it can
draw a frame; a reader who never touches the box should not be queued behind it.

**No fuzzy matching.** Three tiers, every hit explainable: the label IS the query, the label
STARTS WITH it, or every word of the query begins a word of the label. `Guerreo` does not
quietly become Guerrero. Ranking is exactness, then **kind, then size** — kind before size
because Coit Tower holds five documents and a size-first rule would bury it under every street
in the city.

## 4. Five bugs found by driving it, each a real one

**a. The index was offering doors the fiche cannot draw.** `blockAddresses` has a third guard
this builder did not port — *a list is not a claim about a door*: a row naming five addresses is
a table covering the city, and naming any one of them puts a Richmond address on a Mission
fiche. Without it, searching `400 Castro St` opened a block with no such door on it. Porting the
guard cost **1,234 → 1,052 doors (−15 %)**, close to the 12 % the panel's own note measured, and
every remaining door is one the fiche will actually show. *The builder's docstring had claimed
the guards were ported "character for character" while one was missing.*

**b. The first search on a fresh page silently did nothing.** `idxRef` is filled by the effect
behind a *pick*, so on a page where nobody has clicked anything it is still null — which is
exactly the page somebody uses a search box on. `goToHit` now loads the block index itself.

**c. The doors were read off the wrong precision tier.** `ADDR_TIER = 3`, and this builder
hardcoded 4 — read as "the top tier must be the most precise". `TIER_WORDING` says otherwise:
index 3 is *"at an address on this block"*, the door claim, and 4 is *"the record names this
block"*, which is block-level and weaker. Reading 4 produced **1,052 "doors" that were mostly
block-level rows with an address in their text**, which is why a quarter of them disagreed with
the assessor about which block they were on, and why `400 Castro St` was offered while the fiche
would not draw it. At the right tier: **7,375 doors**, consistent with the panel's own measured
note that 10,253 of 14,823 addr-tier records name exactly one address.

**d. A door's block was whichever shard was met first.** A decision printed at a corner is stored
on every block that corner touches, so a door is derivable on two or three blocks at once and
"first seen" is an accident of shard order. **24 % of doors disagreed with the assessor.** The
builder now collects every block whose rows yield the door and takes the assessor's block when
the record agrees it is there — otherwise the block holding most of that door's records, because
the fiche builds its doors out of that block's rows and would otherwise open a block with no such
door on it.

| | before | after |
|---|---:|---:|
| agrees with the assessor | 54.5 % | **77.0 %** |
| disagrees | 23.9 % | **1.5 %** |
| assessor cannot place it | 21.6 % | 21.6 % |

The 1.5 % that still disagree are doors the assessor places on a block where the record cannot
draw them; they keep the record's block, which is the block that can show them. The 21.6 % the
assessor cannot place are OCR street spellings (`199 Leiand Ave`) and streets since renamed.

**e. The pushed unit lost a race with the click resolver, twice.** Searching `Castro St` opened
17th St, then opened the block. Two separate causes:

* the stand-down guard read a transient `pending` flag, which a non-door request cleared before
  the record arrived. It is now keyed on **the block the request is for**, which the caller has.
* an effect keyed on `record.blockId` resets the unit to the whole block on every new pick, and
  it ran *after* the request had resolved. Every request now **waits for the record**, so both
  land in the same commit and the reset — declared earlier — runs first.

## 5. Typing an address the record never named — and the claim that was wrong

> "what happens when you type like an address … if nothing or you done whats happening around?"

**1,052 doors against a city of some two hundred thousand addresses**, so the ordinary outcome
of somebody typing where they live is a miss — and a blank is the one answer this search must
not give.

The first fix shipped was a fallback to the street, under this reasoning:

> *No geocoder, so no block. Landing on the actual block `1234 Guerrero St` sits on would be
> better and cannot be done: there is no address-to-parcel table in the shipped data.*

**That was wrong, and the reader caught it.**

> "i thought we were putting in coordinates and from that we can guess the address? like
> everything and row of data in our db has coordinates when its localised no?"

It was true of the shipped *website* data and false of the pipeline. `cache_facts/parcel_points.json`
is 227,668 rows of the assessor's active parcels from `acdm-wktn`, pulled with a `$select` that
took the centroid and **dropped the address columns beside it**. The same dataset publishes

    from_address_num · to_address_num · street_name · street_type · block_num

`block_num` is the very id this map draws. So there is no geocoding here and no coordinates are
involved at all — the assessor already published the join, and it had simply never been read.

### The ladder, three rungs and a floor

| rung | what it answers | how |
|---|---|---|
| **door** | the Board named this house number | `search-index.json`, 1,052 doors |
| **block** | the ground it stands on | `address-index.json`, the assessor's parcels |
| **street** | the street it stands on | the street entries in the search index |
| *floor* | the record is silent about it — which is not the same as it not existing | a sentence |

`build_address_index.py` folds 211,602 addressed parcels to **17,468 street-and-block faces over
1,843 streets, 357 KB**, one row per (street, block) with the house-number range on it. A range
answers the question; the individual parcels never need to be in the browser. Fetched later than
everything else — only an address-shaped query whose doors have already missed can use it, so
most sessions never ask for it.

**MEASURED: 18,169 of 18,173 faces (100.0 %) land on a block this map draws.** Four parcel
blocks are not on the map; 113 map blocks carry no addressed parcel (piers, park land), which is
what you would expect. 701 faces are dropped because the assessor's own street value is
`UNKNOWN`.

Verified live: `1234 Guerrero St` → **Mission / 24th St · 25th St · Fair Oaks St · Guerrero St**,
the actual block. `1 Telegraph Hill Blvd` → block `0086`, which is independently the block the
search index carries for Coit Tower.

**Null is still a real answer and is not guessed around**: a street the assessor does not name,
or a number off the end of one it does (`99999 Guerrero St`) falls through to the street rung.
Landing a reader on the wrong ground while telling them it is theirs is worse than stopping.

**What the block rung does NOT claim** is that the record says anything about the address. It
says which block the address is on. Whether the Board decided anything there is the fiche's
question, and the fiche then carries the rest of the ladder itself — the block's whole record,
the streets around it, and the neighbourhood's written paragraph one fold down.

## 7. Places go to their own fiche

Coit Tower is not a block. Sending a reader who typed `coit` to the ground under it — where the
fiche opens on *"Filbert St · Greenwich St · Montgomery St"* — answers a question they did not
ask. A place result routes to `/us/city/sf/places/place/<slug>`, the same route the fiche's own
money section links to, so the drawer opens over the map and the city stays behind it.

## 8. State

Typecheck clean, eslint clean, **925 tests** (+30 for the resolver, the street fallback and the parcel join).
Verified in the browser on all four kinds plus the fallback and the empty case.

## 9. Not built, and each one is real

* **Money at a place** — §2. Needs the DPW/permit geolocation work first.
* **The search index is 346 KB and 82 % of it is doors.** Without them it is 61 KB for 1,586
  entries. The doors are only reachable from a query with a number in it — the same trigger the
  357 KB parcel file already waits for — so they belong in their own lazily-fetched file and the
  main index should stay instant. Not split yet.
* **No URL state.** A search result does not change the address bar, so it cannot be linked or
  bookmarked. `CityMap` already has a `?block=` parameter; the GL page has none.
* **No analytics.** The other searches in this repo track the query shape and the zero-result
  rate (`useDebouncedTrack`, `hashQuery`, `queryShape`), which is how the synonym list is meant
  to be grown. This box tracks nothing.
* **Not tested on a phone.** The dropdown is absolutely positioned inside a margin that becomes
  full-width below the breakpoint.
* **The Canvas page has no box.** `CityMap.tsx` renders the same panel and would take the same
  two props; only the GL page is wired.
* **`199 Leiand Ave`** is in the index because that is how the scan reads. OCR is never repaired
  in this project, so a search for `leland` does not find it.
