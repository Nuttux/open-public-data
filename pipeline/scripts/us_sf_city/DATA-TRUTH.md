# DATA-TRUTH.md — is the dataset telling the truth?

Agent **D1**, 2026-08-24, branch `refactor/paris-parity`.
Every claim below names the file, the field and the row count. Nothing here is
modelled; where a year is unknown it is written *unknown*, not defaulted.

Diagnostics beside this file, both re-runnable and both read-only:

* `diag_bldg_years.py` — replays `bldg/build_bldg.py`'s year rule over all
  166,166 drawn footprints and attributes each to an analysis neighbourhood.
* `diag_street_years.py` — measures the Board of Supervisors' Journal corpus:
  items per year, roadway-acceptance items per year, and what the Board says
  instead once it stops saying that.

---

## 0. The lineage of every year the renderer draws

| layer | chunk | payload | built by | source |
|---|---|---|---|---|
| footprint + height | `bldg/<cell>.qc`, `base/solo.qc` | `gen/bldg-data.js` | `bldg/build_bldg.py` | DataSF `ynuv-fyni` Building Footprints, 177,023 rows |
| **building year** | `yr` u8, same chunk | same | same | DataSF `wv5m-vpq2` Secured Roll **2025**, `year_property_built` |
| block massing timeline | `base/massing.qc` | `lod/build_lod.py` | — | the two above + `acdm-wktn` |
| street **surface** | `strt/<cell>.qc` | `street/street-data.js` | `street/build_surface.py` | DataSF `h8n7-e4ns` ROW polygons, `emxt-b6yg` curbs |
| **street year** | `yr` u16, same chunk | `time/out/street-years.json` + `time/out/fabric-years.json` | `time/streets_record.py`, `time/fabric_bound.py` | **Board of Supervisors' Journal of Proceedings (Internet Archive OCR)** + `wv5m-vpq2` |
| street centrelines | `base/street-lines.qc`, `strt/street-lines-2.qc` | `gen/gen_geo2.py` `G.streets` | `encode_city_chunks.py` | DataSF `3psu-pn9h`, 17,170 segments |

**`3psu-pn9h.accepted` is a BOOLEAN, not a year** — 13,190 `true` / 3,980
`false` of 17,170 in `geo/cache/streets.json`. No published street file in this
pipeline gives a street an acceptance *date*. Every street date on this map is
a claim read out of a scanned document. That fact drives §3.

**No building is missing from the browser.** 150,905 in the 138 `bldg/*.qc`
plus 15,261 in `base/solo.qc` = 166,166, exactly `gen/bldg-data.js`'s `n`.
The 15,261 are the solos, drawn at every zoom.

---

## 1. The 2014 cliff — the year is 2015, the place is the Hunters Point Shipyard, and the cause is a fallback

### 1.1 There is no 2014 default anywhere

Measured three ways.

| where | buildings carrying year 2014 |
|---|---|
| at source, replaying `build_bldg.py` (`diag_bldg_years.py`) | **129** of 166,166 (0.08 %) |
| in the shipped `gen/bldg-data.js`, Bayview only | 56 |
| in the published chunks, city-wide | 76 |

And Bayview Hunters Point is **not empty before 2014**: it holds **9,886
buildings, 5,520 of them dated before 1950**. Its largest years are 1941 (476),
1906 (343), 1907 (311), 1940 (271), 1944 (263).

So 2014 is not a record-creation date, a survey date or a refresh date. It is
not in the data at all. The two distributions, by decade, share of each
population (buildings attributed by centroid to the analysis neighbourhood
published in `acdm-wktn`):

```
decade   Bayview  share  |     rest  share
  1900       935   9.5%  |   27,628  17.9%
  1910       818   8.3%  |   19,458  12.6%
  1920     1,153  11.7%  |   32,481  21.0%
  1930       749   7.6%  |   14,320   9.3%
  1940     1,831  18.5%  |   23,152  15.0%      <- Bayview's own peak
  1950       804   8.1%  |   13,310   8.6%
  1960       583   5.9%  |    7,344   4.7%
  1970       518   5.2%  |    4,226   2.7%
  1980       964   9.8%  |    3,523   2.3%
  1990       951   9.6%  |    2,386   1.5%
  2000       272   2.8%  |    2,169   1.4%
  2010       267   2.7%  |      667   0.4%
  total    9,886         |  154,655
```

Bayview is a later city than the rest — its peak is the 1940s war build-out,
not the 1920s — and it carries four times the rest's share of 1980s and 1990s
stock. It is not empty and it has no single spike.

### 1.2 What Daniel actually saw: 2015, in one place

Taking the bounding box of DataSF's own `STREETS_HUNTERSP` centreline layer
(the Hunters Point Naval Shipyard street grid, x 5,140–7,059 m, y −4,847 to
−3,173 m in world metres) there are **706 buildings**, and their years are:

```
2015  219      1996  168      1981   95      1978   64      1976   40
```

**219 buildings arrive in one frame at 2015.** 411 of the 706 (58 %) carry
`FLAG_BLOCKYEAR` — the year is not theirs.

### 1.3 One building, traced to the row

The largest footprint on the shipyard, and the whole chain under it:

**`ynuv-fyni` `mblr = SF4591A079`** — 11,719 m² of footprint,
`hgt_mediancm = 5225`, i.e. **52.25 m**, centroid −122.3613, 37.7198.
A 52-metre industrial hall.

1. **The roll has the parcel and refuses to date it.** `4591A079` appears in
   `wv5m-vpq2` at least from roll year 2008 to 2017 with
   `use_definition = "Government"` and **no `year_property_built` in any of
   them** — the assessor does not assign a build year to government-owned
   property. By roll year 2025, the vintage `bldg/ingest.py` loads, the parcel
   has dropped out of the roll altogether. Its neighbour `4591A078` is still
   there in 2025, also `"Government"`, also with no year.
2. **The join key then truncates.** `bldg/pnjoin.py` tries `mblr[2:9]` =
   `4591A07` (7 characters, the lettered-block truncation its own docstring
   documents) — no match; then the whole key `4591A079` — no match either; and
   so returns the truncated `4591A07`, which matches nothing.
3. **The fallback key pools four assessor blocks.** `build_bldg.py:205` takes
   `pn[:4]` = `'4591'`. The roll's real blocks here are **4591A, 4591B, 4591C
   and 4591D**, with 64 / 100 / 523 / 0 dated rows — and 4591C's 523 rows are
   the **Hunters Point Shipyard Phase 1 condominiums, `year_property_built`
   2015 to 2023**.
4. The p25 of the pooled 687 rows is **2015**, and that is the year the hall
   is drawn arriving.

**A 1940s Navy shipyard hall is dated 2015 by the condominiums built on the
next block, because the assessor does not date government property and the
fallback key cannot tell one lettered block from another.** The honest year for
that building is *unknown*.

### 1.4 The size of the problem, city-wide

| default | rule | footprints | share |
|---|---|---|---|
| **block p25** | 25th-percentile year of the other parcels on the same `pn[:4]` prefix | **20,662** | 12.4 % |
| **the 1906 constant** | `build_bldg.py:207` `yr = 1906; flags \|= FLAG_NOYEAR` | **2,825** | 1.7 % |
| made-land raise | pushed forward to the END year of its fill bucket, `geo/cache/made_land.json`, 4 buckets / 219 blocks | 1,484 | 0.9 % |
| the 1900 dump | `ingest.py` nulls `year_property_built == 1900`, 12,594 parcels, *before* either rule | — | — |

**23,487 of 166,166 footprints (14.1 %) are drawn on a year that is not their
own.** Every one of them is a step in the animation at a year nothing happened.
They split two ways:

```
roll row exists but carries no year_property_built   17,173
  Single Family Residential  6,808   Multi-Family  6,730
  Miscellaneous/Mixed-Use    1,854   Retail          617   Industrial  465
no roll row for the parcel at all                     6,314
```

The first group is the 1900 dump plus genuine blanks. The second is §1.5.

The worst single steps — one assessor-block prefix stamping one year onto many
buildings:

```
block 0030   398 footprints stamped 1959   (10 dated roll rows, 1906-2009)
block 0050   337                     1907   (24 rows, 1906-1993)
block 0900   323                     1929   ( 1 row)
block 0040   315                     1935   (22 rows, 1907-1979)
block 0043   309                     1965   ( 2 rows, 1965-1995)
block 4591   219                     2015   (687 rows, 1950-2023)   <- Bayview
block 0041   203                     1980   (107 rows, 1906-2008)
block 4700   176                     1996   (40 rows, 1954-1996)    <- Bayview
block 0020   155                     1974   ( 1 row)
block 0051   137                     1995   (139 rows, 1906-1997)
```

45 block prefixes stamp 40 or more footprints each; 4,453 buildings in total.
2,000 of the 20,662 inherit a year **50 or more years after the oldest dated
building on their own block**.

### 1.5 The root cause underneath all of it: 6,061 orphan footprints

**6,061 of 166,166 drawn footprints (3.6 %) have no row in `wv5m-vpq2` and no
active parcel in `acdm-wktn`.** The assessor's roll is a *tax* record: land the
City does not tax — federal installations, the Port, the airport, park land —
is not on it. `ynuv-fyni` maps those buildings anyway, because it is a LIDAR
survey.

Of the 6,061 orphans:
* **4,941 are handed a year by the `pn[:4]` pool** — 1907 (554), 1959 (406),
  1929 (328), 1935 (317), 1965 (305), **2015 (285)**, 1980 (204)…
* **1,120 fall through to the 1906 constant.**

**Not one of the 6,061 has a source that says anything about when it was built.**
That is the honest finding, and it is the largest single thing wrong with the
dataset's time axis.

### 1.6 A second, smaller bug in the same key

`ingest.py`'s own docstring documents that a parcel number is 7, 8 or 9
characters and that assessor blocks can be **lettered**, and `bldg/pnjoin.py`
was written to fix exactly that on the parcel join (89.60 % → 95.78 %).
**The block-fallback key `pn[:4]` in `build_bldg.py` (lines 148, 205-206) was
never fixed.** It pools 185 prefixes that cover more than one real assessor
block. Measured against the true `block_num` published in `acdm-wktn`:

* 264 footprints get a different year from the pooled key than from their own block;
* 81 of them differ by 20 years or more. The largest: `4591A009` (4,180 m²)
  gets **2015** from the pool and **1989** from its own block 4591A;
  `5431A016` (2,542 m²) gets 2010 against 1941; `0215001` (3,088 m²) gets 1961
  against 1910.

Small next to §1.5, but it is the same class of defect and it is one line.

### 1.7 What it looks like on screen: 47 % of Bayview is blank until 1990

The fake year does not stay in the building layer. `lod/build_lod.py` rolls the
buildings up into the per-block massing timeline that draws at city and
district zoom, so the whole block inherits it. Reading `base/massing.qc`
against `base/blocks.qc`:

```
block 4591A   2.934 km2   ONE massing row: (year 2015, coverage 14/255)
block 4591C   0.227 km2   ONE massing row: (2015, 20)
block 4591B   0.023 km2   ONE massing row: (2015, 31)
block 4624    0.036 km2   ONE massing row: (2014, ...)
block 4700    0.040 km2   ONE massing row: (1996, 41)
```

**Block 4591A is 2.934 km² — 24.5 % of Bayview Hunters Point's entire block
area — and it is blank at every year from 1906 to 2014, then appears in 2015.**
Block 4624 appears at **2014**, which is the year Daniel named.

| by block area | Bayview | rest of the city |
|---|---:|---:|
| never gains massing in any year | 115 blocks, 2.05 km², **17.1 %** | 365 blocks, 4.79 km², 6.0 % |
| first massing 1990 or later | 20 blocks, 3.59 km², **30.0 %** | 70 blocks, 1.31 km², 1.6 % |
| **blank at every year before 1990** | **47.1 %** | **7.6 %** |

Six times the rest of the city. That is the "zero buildings then suddenly many"
Daniel described, it is measurable without opening the page, and every square
metre of it traces back to §1.5: land the assessor does not date.

### 1.8 Confirmed on screen

Shot with Playwright at the district preset (z = 2.9), camera parked on the
shipyard (plane 7470, −2382), only the year changed between frames —
`diag_shipyard_shots.py` beside this file reproduces it.

* **1940** — the Hunters Point peninsula is bare pale ground. No buildings, no
  streets, one label ("Hunters Point Springs & Albion Brewery"). The Navy bought
  the yard in 1939-40 and ran it through the war; the map shows nothing there.
* **2013 and 2014** — identical. Still bare. The residential Bayview to the
  west is dense and fully drawn.
* **2015** — **about thirty large tan industrial buildings appear across the
  whole peninsula in one frame.** Nothing else in the view changes.
* **2016** — unchanged from 2015.

That is Daniel's observation, reproduced, with the year corrected to 2015 and
the cause established in §1.3.

**One more thing those frames show, and it needs a decision.** The peninsula's
*land* is drawn from 1906 onward at its present outline. `geo/cache/made_land.json`
has four fill buckets — Yerba Buena Cove, the Marina, Treasure Island, Mission
Bay — and **none of them is in Bayview**, so any fill placed at Hunters Point is
drawn as dry land in every year the rail can reach. This is a coastline
question, not a building one, and it is stated here as a measurement of the
file rather than a claim about the history: **the four buckets are the whole of
what this pipeline knows about made land, and they cover 219 blocks.**

### 1.9 The chrome line that states this is wrong

`website/src/lib/city/time.ts` `UNDATED` publishes

```ts
{ key: "buildings", n: 12594, of: 166166,
  what: "footprints the assessor's roll does not date" }
```

**12,594 is the number of PARCELS carrying the 1900 dump value**, from
`ingest.py`'s comment. It is not a footprint count and it is not the number of
footprints the roll fails to date. The measured figure is **23,487 of 166,166
(14.1 %)** — 20,662 on a block p25 and 2,825 on the 1906 constant. Both numbers
are already computed and shipped in `bldg-data.js` `meta.counts`
(`yearFromBlock`, `yearNone`). Routing note in §5.

---

## 2. Buildings without streets — Daniel is right, and the cause is jurisdiction

Bayview is **not** thin in the published centreline file. It has **1,486
centreline segments, more than any other analysis neighbourhood** in
`3psu-pn9h`. So the gap is not coverage. It is two gates, and both of them fail
on the same kind of land.

### 2.1 The layer that is never drawn at all

`3psu-pn9h` carries a `layer` column. Measuring which of its segments reach a
drawn ROW surface (`strt/*.qc`, matched on `cnn`) and which reach a drawn
centreline:

| `layer` | segments | null classcode | drawn surfaces | drawn centrelines |
|---|---:|---:|---:|---:|
| `STREETS` (the City's own) | 14,514 | 311 | 13,577 | 3,962 |
| `STREETS_HUNTERSP` — Hunters Point Naval Shipyard | **115** | **110** | **0** | **0** |
| `STREETS_TI` — Naval Station Treasure Island | **214** | 56 | **0** | **0** |
| `STREETS_YBI` — Yerba Buena Island | **29** | 0 | **0** | **0** |
| `PARKS_NPS_PRESIDIO` | **595** | 176 | **1** | 95 |
| `PARKS_NPS_FTMASON` | **23** | 0 | **0** | **0** |
| `PAPER` / `PAPER_FWYS` / `PAPER_WATER` / `PSEUDO` (platted, never built — correctly dropped) | 494 | 32 | 0 | 0 |

For scale, on non-paper layers the city-wide surface hit rate is **12,967 of
15,257 (85.0 %)**; in Bayview it is **1,086 of 1,419 (76.5 %)**.

**The entire Hunters Point Shipyard street grid — 115 published centrelines,
all of them inside Bayview Hunters Point — is absent from the map in both
layers.** Same for Treasure Island. Both fail for the same two reasons:

1. **No classcode.** 110 of the 115 `STREETS_HUNTERSP` segments carry
   `classcode = null`. `gen/gen_geo2.py` ships only classcode 0–4 as
   `G.streets`, so a null class is dropped from the centreline network before
   the encoder ever sees it. City-wide 780 segments carry a null classcode and
   they are concentrated exactly where you would expect — Presidio 191,
   **Bayview Hunters Point 184**, Mission Bay 60, Treasure Island 56.
2. **No right of way polygon.** `h8n7-e4ns` is the *public* right of way. A
   Navy yard is not public right of way, so there is no polygon to draw and
   `build_surface.py` counts them in its `drop_nomatch`.

Every layer in that block is a **federal** jurisdiction: Hunters Point Naval
Shipyard (US Navy 1940–1974), Naval Station Treasure Island and Yerba Buena
Island (1941–1997), the Presidio and Fort Mason (US Army, to the National Park
Service in 1994). **The City's street files do not describe them because they were
not the City's streets.** That is Daniel's "some departments might have taken
over", and it is literally true — a different government took over.

So the map draws the shipyard's buildings, from a LIDAR survey that does not
care whose land it is, and none of the shipyard's streets, from files that do.

### 2.2 The other 63 % of the network, and why it looks thin at wide zoom

`3psu-pn9h` classcode 5 — ordinary local streets — is **10,924 of 17,170
segments (63.6 %)** and it is **dropped from the centreline layer entirely**
(`gen_geo2.py` ships classes 0–4 only). Those streets do get a ROW *surface*,
but the `strt` tier's fetch policy is `Z_STREET = 1.75`, so below that zoom the
only streets on screen are the 999 class 0–2 centrelines in `base/street-lines.qc`.

This is a deliberate LOD decision and it is not a data defect — but it means
"barely any streets" is the correct description of every neighbourhood at
whole-city zoom, and Bayview, being large and industrial, has proportionally
more class-5 and null-class mileage than most.

---

## 3. No streets after 1947 — **the Board stopped voting them, and the 1932 Charter is the hinge**

### 3.1 The series, named, and the year it stops

The rail's marks come from **`scratchpad/sf-city-anim/film/out/accept-lines.json`**:
2,051 roadway acceptances resolved onto centrelines from **27 volumes of the
San Francisco Board of Supervisors' *Journal of Proceedings*** on the Internet
Archive.

```
1906  17   1913  80   1920  32   1927 174   1934  10   1941  33
1909  19   1915 136   1922  78   1928 245   1935   5   1945   4
1912  44   1917 266   1923  64   1929 159   1936  23   1947   3   <- last
1918 136   1925 154   1930  31   1932  70   1938  22
1926 191   1933  10   1939  26   1940  19
```

**The last acceptance is 1947**: THRIFT ST, `journalofproceed42sanfrich`,
leaf 1487 — https://archive.org/details/journalofproceed42sanfrich/page/n1487/mode/1up

### 3.2 It is not the corpus, and it is not the parser

`diag_street_years.py` measures the whole ingested corpus,
`blocks/cache/items.jsonl`, 97,688 items:

```
era          items   accept(TRIGGER)   accept(WIDE)     DPW    PUC   subdiv map
1906-1931   52,490            1,079          2,364     124      5        5
1932-1947   12,152              632            946   3,349    646        3
1948-1970   13,916                7            571     661    163        4
1971-1999   19,101                5            263   2,882    406      863
```

* **The corpus does not stop.** All 59 Journal volumes 1906→1998 are ingested
  (`geo/cache/ia/`, 118 OCR files, one pageindex + one searchtext per volume);
  1948–1999 alone holds 33,017 items.
* **It is not a narrow regex.** `WIDE` — any form of "accept…" within 80
  characters of a street word — collapses on the same curve: 2,364 → 946 → 571
  → 263. If the Board were still accepting streets in its own words, `WIDE`
  would find it.
* **The construct genuinely leaves the Journal.** 1947 has 26 acceptance items,
  1948 has 7, and **1949 through 1999 have zero** (the five stray `TRIGGER`
  hits in 1987 and 1994 are "acceptance of the streets" in another sense).

### 3.3 What took over, and when

Two step changes, both visible in the table above and both at known dates:

1. **1932 — the new Charter.** "Department of Public Works" / "Director of
   Public Works" appears in **124 items across the 26 years 1906–1931** and
   **3,349 items across the 16 years 1932–1947** — a 27-fold rise per year, in
   the same volumes, at the year San Francisco's 1932 Charter moved
   administrative functions from the Board to appointed department heads. The
   corpus itself thins at exactly the same moment: 1931 has 2,418 items, 1932
   has 622. **The Board stopped doing the work; DPW started.**
2. **1978 onward — subdivision maps.** "final map / tentative map /
   subdivision map" is essentially absent before 1978 (5 items in 1906–1947)
   and appears in **863 items in 1971–1999**, almost all after 1978. Street
   dedication now arrives as an approved subdivision map, not as an acceptance
   resolution.

**So "no streets after 1947" is true of the *record*, not of the city, and it
has a cause with a date.** The map does still gain streets after 1947 — 615 in
the 1950s, 304 in the 1960s, 165 in the 1970s, 155 in the 1980s, 79 in the
2010s — because `exist_year()` also uses `fabric-years.json`, the earliest
assessed building within 40 m. It is the *rail's acceptance marks* that stop,
which `CityScrub.tsx`'s own docstring already says. What was missing was the
reason, and the reason is the 1932 Charter and the DPW.

### 3.4 Where the post-1947 record actually is (measured, not built)

Nothing here is proposed as work; it is what the corpus says exists.

* **DPW annual reports.** The 3,349 DPW items in 1932–1947 are the Board
  *receiving* DPW's reports. The reports themselves are a separate Internet
  Archive series and are where street acceptances went.
* **Subdivision final maps**, 1978 onward, 863 items in this corpus already.
* `3psu-pn9h.accepted` (boolean) at least tells you *whether* a street was ever
  accepted — 13,190 yes / 3,980 no. It cannot tell you when.

---

## 4. Demolished buildings — what is recoverable, measured

The building layer is **survivorship only**, and `build_bldg.py` says so in its
own docstring: every footprint in `ynuv-fyni` is a building standing today.
Nothing demolished is in the file in any year. Here is what could put it back,
measured against the live APIs today, with coverage and cost. **Nothing was
built in this pass.**

### 4.1 DBI demolition permits — DataSF `i98e-djp9` — **the one real source**

Queried live 2026-08-24:

```
permit_type = '6'  "demolitions"      7,310 permits
  status = complete                   4,511
  carrying a completed_date           4,539
  carrying block + lot                7,310  (100 %)
  carrying a point geometry           6,908  (94.5 %)
filed_date by decade
  1970s     1     1980s 1,904    1990s 1,739
  2000s 2,041     2010s 1,135    2020s   452
```

Each row also carries `description` (free text, e.g. *"demolish 1-story,
type 5, mixed use, commercial and residential"*), `number_of_existing_stories`,
`existing_use`, `existing_construction_type` and `existing_units`.

**What it gives:** ~4,500 buildings with a *dated, located removal*, 1980–2026,
joinable to the parcel fabric on block+lot.
**What it does not give:** a footprint. The building is gone from `ynuv-fyni`,
so there is no outline to draw — only a parcel, a storey count and a use.
**Cost:** one fetch script and one join, comparable to `bldg/fetch_roll.sh`.
The honest rendering is a marker or a parcel-shaped ghost, not a modelled solid.
**Coverage of the map's span: 1980–2026, 45 of 119 years.**

### 4.2 The 1906 fire loss schedule — **already parsed, and it is 36 buildings**

`scratchpad/sf-city-anim/coverage/fire_losses_geo.json`, from *San Francisco
Municipal Reports 1906*, table "Value of Houses Destroyed by Fire"
(`excerptsfromsanf1908sanf`). **36 entries, 36 located, 33 geocoded, 14 with a
footprint dimension, 35 with storeys and material.** Checksum closes: 26 of 27
destroyed values sum to $355,000 against a printed $380,000.

**These are the CITY's own buildings only** — engine houses and the like. The
schedule is titled "Value of Houses Destroyed by Fire" and it is the city
accounting for *its own* loss: 36 structures. Privately owned buildings are not
in it, in any number, and are not recoverable from it.

### 4.3 Redevelopment clearances — **not recoverable from the corpus**

Measured over `items.jsonl`:

```
era          items   demolition   redevelopment   clearance/blight
1948-1959    8,579            8              28                  5
1960-1975    7,688           49             227                  3
1976-1999   16,750          254             288                  7
```

The Journal names the *Redevelopment Agency* 227 times in 1960–75 — approving
plans, budgets and bond issues — and names an individual demolition 49 times.
**The Board's Journal approves the clearance; it does not enumerate the
buildings.** Western Addition A-1 and A-2 and Yerba Buena would need SFRA's own
project records, which are not on DataSF and are not in this corpus. That is an
archival acquisition, not a pipeline change, and it should be costed as one.

### 4.4 Successive roll vintages — a cheap partial check, same era as 4.1

`wv5m-vpq2` publishes **19 roll vintages, 2007 through 2025** (197,778 rows in
2007 to 211,547 in 2025). A parcel whose `year_property_built` *increases*
between vintages was rebuilt, and the old building came down. It confirms 4.1
and adds nothing before 2007.

### 4.5 Sanborn atlases — real, and expensive

Successive Sanborn fire-insurance atlases (1886, 1899, 1905, 1913-15, 1950
corrections) are the only source that gives a *footprint* for a demolished
building. They are page scans. Getting footprints out of them is a
georeferencing-plus-vision job per sheet, several hundred sheets for the city,
and it is a project, not a task. **Not recommended for this pass.** Flagged
here so it is not re-proposed as if it were cheap.

### 4.6 The honest summary

| era | what can be recovered | coverage |
|---|---|---|
| 1906 | 36 City buildings lost to the fire, 33 placed | already done |
| 1907–1979 | **nothing per-building.** The Journal approves clearances; no file enumerates the buildings | **0 %** |
| 1980–2026 | ~4,500 dated, located demolitions with storeys and use, no footprint | good |

**Recommendation:** ship 4.1, say on the page that the map cannot un-build
anything before 1980, and do not let a "past buildings" feature imply coverage
it does not have.

---

## 5. Findings that need a change in a file I do not own

Routed, not applied. Each is stated precisely enough to act on.

**5a. `time.ts` `UNDATED` "buildings" figure is wrong** — *(owner: renderer)*
`website/src/lib/city/time.ts` publishes `n: 12594, of: 166166` as "footprints
the assessor's roll does not date". 12,594 is the *parcel* count of the 1900
dump. The footprint figure is **23,487** — `bldg-data.js`
`meta.counts.yearFromBlock` (20,662) + `meta.counts.yearNone` (2,825). Both are
already in the shipped payload.

**5b. `FLAG_NOYEAR` and `FLAG_BLOCKYEAR` reach the browser and are not used** —
*(owner: renderer / `encode_city_chunks.py` prov note)*
The `u` byte in every `bldg` chunk carries bit 3 (`FLAG_BLOCKYEAR`, 20,662
buildings) and bit 4 (`FLAG_NOYEAR`, 2,825). The renderer can already tell a
building whose year is its own from one whose year was borrowed, and does not.
**23,487 buildings currently arrive on a fabricated year, indistinguishably
from the 142,679 that arrive on a real one.** The cheapest honest fix is not to
change the year — it is to let the page *say* which ones are guesses, the way
`time.ts` already does for trees.

**5c. `build_bldg.py` block key `pn[:4]` should be the published `block_num`** —
*(owner: `_bldgsrc.py` / mock `bldg/build_bldg.py`, lines 148 and 205-206)*
185 four-character prefixes pool more than one real assessor block. 264
footprints get a different year because of it, 81 of them by 20 years or more,
including `4591A009` (4,180 m², 2015 vs 1989). `acdm-wktn` publishes
`block_num` and `lot_num` as separate columns; `bldg/pnjoin.py` already
established the whole-key rule for the parcel join and this is the same rule
applied to the block key.

**5d. The 6,061 orphans should be declared, not dated** — *(owner: pipeline
decision, needs Daniel)*
6,061 footprints have no roll row and no active parcel. 4,941 of them are
currently handed a neighbouring block's p25 (285 of them get 2015) and 1,120
get the 1906 constant. **No source says anything about when any of them was
built.** The three options, honestly stated:
 * draw them in every year, flagged, the way `time.ts` handles the 125,234
   undated trees — consistent with the rule already written down;
 * draw them from the first year the map runs, flagged;
 * keep the fallback and say on the page that 14.1 % of the fabric is dated by
   its neighbours.
   The first is the only one that matches `time.ts`'s own stated rule: *"a thing
   is drawn from the first year a published source can put it there. Where no
   source can, it is declared as undated, counted, and put behind a flag."*

**5e. `STREETS_HUNTERSP` / `STREETS_TI` need a decision, not a fix** —
*(owner: `gen_geo2.py` class gate, upstream of `encode_city_chunks.py`)*
381 published centrelines on the four federal layers (115 Hunters Point +
214 Treasure Island + 29 Yerba Buena Island + 23 Fort Mason) reach neither the
surface layer nor the line layer. The shipyard's are dropped because
`classcode` is null (110 of 115) and the gate is `0 <= classcode <= 4`. They
have geometry and names (`DONAHUE ST`, `CRISP RD`, `BLANDY ST`, `06TH HP AVE`).
Admitting them would draw the shipyard's street grid under its buildings. They
would have **no year** from either source, which puts them in 5d's bucket.
There is no ROW polygon for them in `h8n7-e4ns` and there never will be, so
they can only ever be lines, not surfaces.

---

## 6. What was checked and found sound

Recorded so no one re-derives it.

* **Nothing is dropped between `bldg-data.js` and the browser.** 150,905 +
  15,261 solos = 166,166.
* **`made_land.json` is not the cliff.** Four buckets — Yerba Buena Cove
  1850-75, Marina 1912-15, Treasure Island 1936-39, Mission Bay 2001-12. None
  covers Bayview and none ends in 2014. It moves 1,484 footprints.
* **Counting massing steps BY BLOCK hides the cliff — count them by AREA.**
  Bayview's most common biggest-jump years are 1906 (27 blocks), 1941 (20),
  1907 (12), 1997 (11), 1947 (11), and on that count 2015 looks like nothing:
  it is three blocks. Those three blocks are 3.18 km², a quarter of the
  neighbourhood. §1.7 is the same data weighted the way the eye weights it.
  A block count is the wrong denominator for anything Bayview-shaped.
* **`Z_STREET = 1.75` is a fetch policy, not a gate**, exactly as its comment
  says. It is not why Bayview's streets are thin; §2.1 is.
* **`yrbuilt` from the archived `ygi5-84iq` Land Use 2020 snapshot** — used by
  `gen_geo2.py` for the *block* layer, not the building layer — carries 16,928
  zeroes and the same 12,594-row 1900 dump. It has no 2014 mass either.

---

## 7. FIXED — the block key (commit 1 of the fix pass)

`bldg/build_bldg.py` now keys the block fallback on the **published**
assessor block instead of `pn[:4]`. `bldg/pnjoin.py` — the file whose whole job
is to state the join key once so two files cannot drift — gains
`block_index()` and `resolve_block()` beside the parcel-join rule it already
held.

**The rule, and why it is not a guess.** `acdm-wktn` ships `block_num` and
`lot_num` as separate columns, so for any parcel in the fabric the block is
*read*. For a parcel that is in neither the fabric nor the roll the longest
published block prefix is used; block ids are only ever 4 or 5 characters
(5,012 and 401 of 5,413), so the search is two lookups. Measured against the
fabric's own `block_num` that prefix rule is right on **227,936 of 227,937**
parcels — the single miss is `4991COM` (block 4991, lot COM), read as 4991C
because 4991C is also a real block, which is why the direct lookup is tried
first and the prefix rule only where there is nothing to look up. A parcel
matching no published block now gets **no block year at all** and falls to
`FLAG_NOYEAR`, because there is no block to take one from.

Two things were wrong and both are fixed by the same key:
* the p25 pool (`4591A/B/C/D` pooled as `4591`);
* the made-land lookup — `made_land.json`'s own block lists are the published
  ids, so its 5-character entries (`0410A`, `0417A`, `0417B` …) could never be
  hit by a `pn[:4]` key at all, and its 4-character ones swept up every
  lettered block beside them.

### What moved

Rebuilt `gen/bldg-data.js` and diffed the shipped `yr` bytes against the copy
taken before the change:

```
                        before      after
year from own parcel   142,679    142,679
year from block p25     20,662     20,571
no year at all           2,825      2,916      (+91 → FLAG_NOYEAR, correctly)
raised to a fill date     1,484      1,487

buildings whose YEAR CHANGED           534  of 166,166
  moved earlier (a fake late year gone) 363
  moved later                           171
  |shift| >= 20 years                   303
  |shift| >= 50 years                    88
```

**The Hunters Point Shipyard cliff is gone.** Inside the shipyard bounding box,
708 buildings:

```
BEFORE  2015 219 · 1996 168 · 1981  95 · 1978 64 · 1976 41
AFTER   1996 168 · 1989 158 · 1981 100 · 2016 68 · 1978 64 · 1976 41
        219 buildings moved, median shift -26 years
```

The 219 split correctly: **158 take 1989, the p25 of block 4591A's own dated
parcels — the block they actually sit on** — and 68 take 2016, block 4591C's
p25, because those 68 *are* the Shipyard Phase 1 condominiums. City-wide the
year 2015 loses **220** buildings (346 → 126) and 2014 is unchanged at 129.

### The number that did NOT move, and why saying so matters

**23,487 footprints are still drawn on a year that is not their own** — 20,571
on a block p25 and 2,916 on the 1906 constant. That figure is fixed by the
*roll*, not by the key: it is the count of footprints `wv5m-vpq2` does not
date, and no change to a join key can date them. What the key controlled was
*which* fabricated year those 23,487 receive, and that is what moved: 534
buildings, 303 of them by twenty years or more, and the single largest
fabricated cliff in the city dismantled.

The honest headline is therefore **not** "23,487 → fewer". It is: the fallback
now takes its year from the block the building is on, and the city's biggest
one-frame arrival of buildings that were not built that year no longer happens.

### Where the change lives

The mock tree `scratchpad/sf-city-anim/` is 12 GB and has never been in this
repository — `_bldgsrc.py` replays its *output*, `gen/bldg-data.js`, rather than
holding its source. So the edited files themselves cannot be committed. The
unified diff is at
**`pipeline/scripts/us_sf_city/mock-patches/2026-08-24-block-key.patch`**, with
the apply command in its header, and the same directory is where any later
mock-side change from this agent will go.

### Still to land in the browser

`gen/bldg-data.js` is rebuilt; the published chunks under
`website/public/data/us/sf/city/` are not. Landing it needs `lod/build_lod.py`
(the massing rollup, which is where the 2015 block rows in §1.7 come from) and
then `encode_city_chunks.py`, neither of which this agent owns. **Until both are
re-run the browser still shows the 2015 cliff.**

---

## 8. FIXED — the streets no block implies (commit 2 of the fix pass)

§2.2 said the class gate was "a deliberate LOD decision and not a data defect".
That was half right, and the half that was wrong is the half Daniel put his
finger on.

### The gate's own reason, and where it stops being true

`gen/gen_geo2.py` ships classcode 0-4 and drops 5-6. Its header says why:

> "Classes 5-6 — 11,781 residential and private lines — are dropped: **the gap
> between two real blocks already IS the street.**"

That is a good rule and on the ordinary San Francisco grid it is true — the
space between two assessor blocks reads as a street without a line being drawn
in it. **It is false wherever there are no blocks.** The Hunters Point Naval
Shipyard is *one* assessor block, 2.934 km² of it; there is no gap between
blocks there, so nothing on the page stands for a street, and the streets are
simply not there. Buildings with no streets under them, exactly as reported.

### The second defect, on the same line

```python
cl = int(Ln["c"] or 5)          # gen_geo2.py:256, before
```

`3psu-pn9h` publishes classcode 0-6. **780 rows publish none**, and `or 5`
called every one of them "local residential" — which is the class this file
drops. A null class is not class 5. It is no class, and it now ships as **7**.
Those 780 are concentrated exactly where you would expect: Presidio 191,
Bayview Hunters Point 184, Mission Bay 60, Treasure Island 56.

*(A correction to §2.1's prose while I am here: I wrote that `STREETS_YBI` and
`PARKS_NPS_FTMASON` were dropped for a null classcode. They are not — all 29 and
all 23 carry classcode 5. The federal layers are dropped by **two** mechanisms:
null class (110 Hunters Point + 56 Treasure Island + 176 Presidio) and plain
class 5 (5 + 158 + 29 + 23 + 324). The table's own numbers were right; the
sentence over-generalised from them.)*

### The rule that replaces it

Not "class ≤ 4" and not "class ≤ 4 or null", but:

> **class ≤ 4, OR the block fabric does not imply this line.**

Measured, not assumed: a dropped centreline that no published block **edge**
comes within `IMPLY_M` = 30 m of, along at least `IMPLY_FRAC` = a quarter of its
length. 30 m is half a San Francisco right of way — `street-data.js` measures
the median at 20.9 m — plus the lots behind it. Edges are walked rather than
filled, because a street is implied by a block edge *facing* it and the interior
of a 3 km block implies nothing about its own perimeter. The test runs against
the rings `gen_geo2.py` is about to ship, so the question is asked of exactly
what the reader will see.

`diag_street_implied.py` beside this file is the standalone measurement.

```
centrelines shipped today (class 0-4)          4,895
centrelines dropped (class 5-6 and null)      11,781
  of those, implied by no block edge             846      131.6 km

  PARKS_NPS_PRESIDIO   463   55.84 km      STREETS_HUNTERSP   79   12.83 km
  PARKS                105   28.49 km      STREETS_TI         65    8.78 km
  STREETS               83   10.35 km      STREETS_YBI        15    2.90 km
  FREEWAYS              20   10.51 km      PARKS_NPS_FTMASON  10    0.95 km

  Presidio 478 · Bayview Hunters Point 113 · Treasure Island 110 ·
  Golden Gate Park 85 · Marina 11 · Lincoln Park 10
  632 on a federal layer · 846 of 846 carry a published street name
```

**It is 5.1 % of the network and it is the 5.1 % that nothing else stands for.**
Fort Mason is handled — 10 of its 23 lines qualify; the other 13 run between
blocks that do exist and the grid already implies them. Golden Gate Park's roads
come back too, which nobody asked for and which is the point: *a rule that is
wrong in one neighbourhood is usually wrong everywhere.*

### It is a separate array, and that is the load-bearing decision

`G.streetsUnimplied`, not 846 more entries in `G.streets`. Four things are keyed
one-to-one on `G.streets` and all four would have shifted silently:

* `TIME.street.yr` — one entry per shipped centreline, and the encoder raises
  if the counts disagree;
* `street-data.js`'s `cov` mask, likewise (`covn != n` raises);
* `encode_city_chunks.py::_centrelines()`, which recovers `cnn` and
  `streetname` by **replaying the filter positionally**;
* `time/out/ship-cnn.json`, the independent cross-check on that join.

Verified after the change: the `streets` object is **byte-identical**, and
`_centrelines()` still returns n = 4,895 with worstJoin 0.000195 m — the same
figure the manifest already records.

### The honest treatment, and the constant it hangs on

These lines are a **different claim** from the ones in `G.streets`, and the
array boundary is what says so:

* *this is a published street centreline, with a published name;*
* *no published class — or a class this map does not otherwise draw;*
* *no assessor block stands for it;*
* *and for 453 of the 846, **no year** — neither a vote in the Journal nor a
  dated building on the frontage.*

An undated line is `yr = 0`, and the encoder's own note already fixes what that
means: **"`yr` 0 means undated and an undated line is drawn in every year."**
That is the same rule `time.ts` applies to the 125,234 undated trees, and it
falls out of the existing contract without a new decision. Which is the point:
this is *not* "a street built in 2015". It is a street whose date nobody
published, drawn as such.

### What is applied, and what is not

**Applied and verified** — `gen/gen_geo2.py` carries the new rule, and
`gen/geo-data.js` carries `streetsUnimplied` (846 lines, 3,082 vertices, 29 KB
raw / ~12 KB gzip). The diff is committed as
`mock-patches/2026-08-24-unimplied-streets.patch`.

`geo-data.js` was **spliced, not regenerated**: the new key was inserted after
the `streets` object and every other byte left alone, and the result was proved
by parsing both files and comparing every original key for equality. The reason
is §8's postscript below.

**NOT applied — two files this agent does not own, and both are needed before a
single line appears on screen.** Written out so neither has to be rediscovered:

1. **`pipeline/scripts/us_sf_city/encode_city_chunks.py`** — emit the array as
   one chunk. It needs no new machinery: `encode_centrelines()` already writes
   `strt/street-lines-2` over the class range `(LINE_BASE_CLS_MAX + 1, 255)`,
   so classes 5, 6 and 7 are already inside its band. The work is a third
   entry that reads `GEO2["streetsUnimplied"]` instead of `_centrelines()`,
   ships `fid`/`cls`/`len`/`x`/`y`, and sets `yr` from `TIME.street.yr` by a
   **cnn join, not a positional replay** — which means `geo/build_streets.py`
   should carry `cnn` into `streetlines.json` first (purely additive;
   `gen_geo2.py` ignores keys it does not read). Tier `strt`, `minZ` = the
   band it is drawn from.
2. **`website/src/lib/city/streets.ts`** — `ST_CLS_MAX = [2, 3, 4]` gates the
   existing network by band and would exclude all of these. They should not go
   through that gate at all: they are a separate array with a separate claim.
   One constant — `UNIMPLIED_FROM_BAND` — decides from which zoom band they
   draw, and the choice of value is Daniel's, not mine. `ST_W` already clamps
   (`ST_W[Math.min(cls, ST_W.length - 1)]`), so class 7 takes 0.7 px, a
   hairline, with no change.

### Postscript: `gen/geo-data.js` is not byte-reproducible today

Found while validating the above, and it is not caused by it. Running the
**unmodified** `gen_geo2.py` over the **unchanged** caches produces a file that
differs from the one in the tree: `blocks.vx` and `blocks.vy` come back with
**2,079 of 74,042 deltas moved by exactly 1 quantum**. Everything else,
`streets` included, is identical.

It is sub-decimetre and invisible — a block-zoom pixel is 1.2 m — but the
project's own rule is that the same input bytes give the same output bytes, and
until it is fixed **nobody can regenerate `geo-data.js` in a shared tree without
handing every other agent a 2,079-vertex diff to chase.** That is why this
change was spliced. The likely cause is set or dict iteration order feeding the
Douglas-Peucker in `main()`'s ring pass; it is worth twenty minutes to someone
who owns that file.

---

## 9. FIXED — the flag contract is shipped, not remembered (commit 3 of the fix pass)

### What was actually wrong, which is not what it looked like

§5b said the renderer ignores `FLAG_NOYEAR`. **That was wrong and I withdraw
it.** `scene.ts` honours it in four places, and the important one is

```ts
if (clock && (tb.u[i] & FLAG_NOYEAR) === 0 && iy < 1849 + tb.yr[i]) continue;
```

— a building with bit 4 set is **not year-gated at all**, i.e. drawn in every
year. That is already the "draw in every year, flagged" rule `time.ts` applies
to the undated trees, already applied to the 2,916 undated buildings. Nobody
needs to choose it; it is in the tree.

What is genuinely not read is **`FLAG_BLOCKYEAR`** (bit 3, **20,571**
buildings). Those are gated on a year that is real but belongs to their block,
and nothing distinguishes them from the 142,679 gated on their own.

### The real defect: the numbers were copied, not read

While this was being measured, the renderer owner landed §5a into `time.ts` —
correctly, with the right total. But they had to **hand-copy** `20,662` and
`2,825` out of my write-up, because nothing in the payload publishes them. And
those two numbers had already moved: the block-key fix in §7 shifted 91
footprints from the block-p25 cohort into the no-year cohort. **They were stale
the moment they were typed.**

That is the same failure mode as `12,594` — a *parcel* count of the 1900 dump,
lifted out of `ingest.py`'s comment, published as a *footprint* count and
repeated in nine places across `scene.ts`, `FILM.md`, `SHELL.md`, `DRAW.md` and
`time.ts`. The bug is not any one number. **It is that the payload never said
what was in it, so every consumer copied.**

### So the payload now says

`gen/bldg-data.js` `meta.yearFlags`, measured on the run that writes the file:

```json
{ "field": "u", "useMask": 7,
  "note": "`u` is the use class in bits 0-2 and two year-provenance bits above it.",
  "flags": [
    { "name": "FLAG_BLOCKYEAR", "bit": 3, "mask": 8,  "n": 20571,
      "means":   "the year is the 25th-percentile year of the other parcels on
                  this building's own published assessor block. A real year,
                  but not this building's.",
      "drawnAs": "arrives once, on a year that is not its own" },
    { "name": "FLAG_NOYEAR",    "bit": 4, "mask": 16, "n": 2916,
      "means":   "no published source dates this building. `yr` holds 1906,
                  which is a placeholder and not a date.",
      "drawnAs": "no year gate — drawn in every year" } ],
  "datedByItsOwnParcel": 142679, "notItsOwnYear": 23487, "of": 166166 }
```

Checked against the `u` byte itself on the same run: bit 3 set on 20,571, bit 4
on 2,916, use class after masking maxes at 6 of 6. **Every payload array —
`cnt`, `vx`, `vy`, `xi`, `xn`, `h`, `yr`, `u` — is byte-identical before and
after.** This commit changes `meta` and nothing else.

The bare literal `1906` is now `UNDATED_PLACEHOLDER_YEAR`, with the comment
saying what it is. `0` was considered and rejected: it decodes to 1849 through
the `year0` offset, so it would be a different wrong year rather than none.
Changing the sentinel is a cross-file contract change and belongs to the
renderer.

### **For whoever owns `time.ts`: the two figures you landed are stale**

`20,662 → 20,571` and `2,825 → 2,916`. The total, **23,487 of 166,166 (14.1 %)**,
is unchanged and cannot move — it is the count `wv5m-vpq2` does not date.
`everyYear` should be **2,916**. Read them from `meta.yearFlags` so this cannot
happen a third time.

### The single constant, and why it is not mine to set

The choice the coordinator put to Daniel is already half-made by the tree:
`FLAG_NOYEAR` = drawn in every year, today. The open question is
`FLAG_BLOCKYEAR` — 20,571 buildings arriving once, on a year that is real but
someone else's. The two candidate treatments are

* **draw them from their block's year, marked** — what happens now, minus the
  silence;
* **draw them in every year, like the undated** — consistent, and it removes
  20,571 fabricated arrivals from the animation at the cost of 12.4 % of the
  fabric being present in 1906.

Both are one line in `scene.ts` against `FLAG_BLOCKYEAR`, both need the same
bit, and the bit is already in every chunk. **The value is Daniel's call.** What
this commit guarantees is that whichever is chosen, the number beside it on the
page comes out of the file rather than out of someone's memory.

---

## 10. The 1947 street cliff, in one paragraph a reader could be shown

Item 4 of the fix pass: not a bug, but it has to be said on the page.

> **Why the street votes stop in 1947.** Every date on a street here comes from
> a document, not a database: San Francisco publishes whether a street was ever
> accepted, but not when. So the years come from the Board of Supervisors' own
> *Journal of Proceedings*, scanned and read — 2,051 roadway acceptances across
> 27 volumes, each one a vote you can open at the page. They run from 1906 and
> the last one is in 1947. **That is the record stopping, not the city.** Two
> things move underneath it. The 1932 Charter shifted this work from the Board
> to appointed departments: across the same volumes, the Department of Public
> Works is named in 124 items in the twenty-six years to 1931 and in 3,349 in
> the sixteen years after, and the roadway-acceptance vote disappears from the
> Journal entirely after 1948. From 1978 the record changes shape again and
> streets arrive as approved subdivision maps. San Francisco kept building
> streets after 1947; the Board simply stopped being the one who wrote them
> down. The map still fills in after 1947 — those streets are dated from the
> earliest building the assessor records on their frontage — but no vote is
> marked on the rail, and the rail says so rather than going quiet.

Short caption variant, for beside the rail:

> Marks are votes in the Board's Journal, 1906–1947. The 1932 Charter moved
> street acceptance to the Department of Public Works and the vote leaves the
> Journal after 1948; from 1978 streets arrive as subdivision maps instead.
> The record stops, not the city.

Every figure in both is from `diag_street_years.py` and §3, and each is
clickable: the last acceptance is THRIFT ST,
[`journalofproceed42sanfrich` leaf 1487](https://archive.org/details/journalofproceed42sanfrich/page/n1487/mode/1up).

**One caution for whoever puts this on the page.** Do not write "the Board
stopped accepting streets" — the corpus shows the *vote* leaving the Journal,
which is a claim about the record. Whether the Board's legal role changed, and
exactly when, is a charter question this data cannot settle, and the paragraph
above is worded to claim only what was measured.

---

## 11. STANDING HAZARDS in this tree

Written down so the next person does not discover them at the worst moment.
None is caused by this agent's work; all three were found by running something
and diffing the result against a backup taken first, which is the practice
these entries are really arguing for.

### 11.1 `gen/geo-data.js` is not byte-reproducible

Run the **unmodified** `gen_geo2.py` over the **unchanged** caches and the file
comes back different: `blocks.vx` and `blocks.vy` return with **2,079 of 74,042
deltas moved by exactly one quantum**. Everything else — `streets` included —
is identical.

```
cd scratchpad/sf-city-anim
cp gen/geo-data.js /tmp/before.js
python3 gen/gen_geo2.py
cmp /tmp/before.js gen/geo-data.js     # differs at char 80977
cp /tmp/before.js gen/geo-data.js      # put it back
```

Sub-decimetre and invisible — a block-zoom pixel is 1.2 m — but the project's
own rule is that the same input bytes give the same output bytes, and until it
is fixed **nobody can regenerate `geo-data.js` in a shared tree without handing
every other agent a 2,079-vertex diff to chase.** That is why §8's change was
spliced into the file rather than regenerated. Likely cause: set or dict
iteration order feeding the Douglas-Peucker in `main()`'s ring pass.

### 11.2 `emit_places.py` reorders `base/places.*` on every run

`encode_city_chunks.py` re-applies `emit_places.py --marks` at the end of every
run, by design, because a plain rebuild used to drop 2,192 named places. But
the emitter is **not stable**: run it twice in a row and `places.json`'s name
table comes back in a different order, with the same 2,192 members.

```
python3 pipeline/scripts/us_sf_places/emit_places.py --marks   # twice
# base/places.json, base/places.qc and base/marks.json all differ
```

So `base/places.json`, `base/places.qc` and `base/marks.json` show as modified
after **any** encoder run, by anyone, forever. The set is identical and the
three stay mutually consistent, so it is churn and not corruption — but it puts
three unrelated files in every diff, and the manifest's recorded `gz` for
`base/places` goes stale by a few bytes because it is measured before the merge.
Another agent independently hit this and wrote it into a commit message the
same hour: *"data.test.ts's base/places byte count flaps while chunks are being
regenerated in this tree."* Two agents have now paid for it separately, which
is the signal that it should be fixed rather than worked around.

### 11.3 The shared git index is shared

Staging files and committing are two calls, and between them another agent's
`git commit` will sweep up **everything staged, including yours**. It happened
to this agent's streets landing: eleven files staged here were committed under
`845e04c1 "i18n: the block panel's two short-form demolition keys"`, whose
author had no idea they were carrying them. The content landed intact and the
tree is correct; the record is wrong, and a `git log` written for an auditor is
one of the things this project says it cares about.

**Stage and commit in ONE call.** `git add … && git commit …`, never two.

---

## 12. What is on screen now, and what is not

### 12.1 The buildings — LANDED AND VISIBLE

`lod/build_lod.py` and `encode_city_chunks.py` re-run, so the corrected years
reach the browser.

```
block 4591A   BEFORE  one row: (2015, cov 14)     AFTER  (1950, 0), (1989, 14)
block 4591B   BEFORE  one row: (2015, cov 31)     AFTER  (1981, 31)
block 4591C   BEFORE  one row: (2015, cov 20)     AFTER  (2016, 20)   <- the condominiums
base/massing.qc   45,450 rows -> 47,498
```

Shot at the district preset with the camera parked on the shipyard and only the
year changing. Share of map pixels differing by more than 12/255 between
consecutive frames:

```
              BEFORE    AFTER
2013 -> 2014   0.14 %   0.14 %
2014 -> 2015   1.44 %   0.03 %      the cliff, 48x smaller
2015 -> 2016      —     0.15 %
```

At 2014 the peninsula was bare ground. It now carries the Navy-era industrial
stock from 1989, and 2014 and 2015 are indistinguishable.
`diag_shipyard_shots.py` reproduces the frames.

**Re-verified at the branch tip** after four other agents' commits landed on
top, because a landing is only landed if it is still landed. `base/massing.qc`
in `HEAD` gives block 4591A `(1950, 0), (1989, 14)` — not the single
`(2015, 14)` it carried before — 4591B `(1981, 31)`, 4591C `(2016, 20)`, and
47,498 rows. Re-shot at the same camera: **2014 against 2015 is 203 of 740,370
map pixels, 0.027 %**, against 1.44 % before the fix. The commit that landed it
is `0298ebb1`.

### 12.2 The streets — ON THE WIRE, DRAWN BY NOBODY

`strt/street-unimplied.qc` ships and the browser holds it — confirmed live in
the page, `{n: 846, undated: 741}`. `streets.ts` draws it, behind two constants,
and four cases in `draw.test.ts` cover the band gate, the
undated-in-every-year rule, the two alpha groups and the guarantee that a class
0–4 line is never double-stroked by both loops.

**It does not appear on screen, and neither does any other centreline.**
`scene.paintStreets` calls `drawCentrelines` with no `lines` and a hardcoded
`band: 0`, so the function returns 0 on its first line. **The entire centreline
layer — the existing 4,895 as well as these 846 — is decoded by nobody.**
`data.ts`'s `streetLines()` has no caller outside its own tests. This is the
brief's own pattern 8: *four whole passes were written, tested and called by
nobody.*

`DATA.md` §15.7 already writes the wiring out, eight lines in `paintStreets`:

```ts
const lines = this.data.streetLines();
const band = bandOf(view.z);
if (lines.length) {
  drawCentrelines(f, cells, t, { medianW, covered: () => true, band, lines, year });
}
if (!cells.length) return 0;      // the SURFACE's gate, AFTER the lines
```

**It was not done here on purpose.** `scene.ts` was edited six minutes before
the commit that shipped the chunk, by the agent who owns it, and turning on the
whole centreline layer is that agent's deliberate change — a citywide visual
step — not a side effect of one carried by a data fix. The screenshot at the
Presidio camera is the evidence for both halves: dense canopy and buildings,
Presidio Blvd and Mason St *labelled*, and not one line drawn through the
Presidio or Golden Gate Park.

**On flicker, since the gate is now mine.** The 30 m and quarter-length rules
are thresholds, and a threshold is a step in the derivative — but they are
evaluated **once, in the pipeline**, and baked into the chunk, so they cannot
flicker with the camera or the clock. The only live step is the band gate, and
`UNIMPLIED_FROM_BAND = 1` puts it on a boundary the layer already moves at
(`Z_LINES_2` = 1.70, where classes 3–4 arrive) rather than making a new one:
131.6 km appearing where nothing else changes would read as a bug. The year
gate is per feature at that feature's own year, the same mechanism every other
dated thing uses. This could not be *observed* on screen, for the reason above,
and that is stated rather than glossed.

### 12.3 Two traps automated on the way through

Both were sprung by re-running the encoder, and both are now impossible rather
than documented.

* **The encoder ate a file it did not write.** `base/surround-coast.json` was
  deleted by the rebuild two hours after `fix(sf): the Golden Gate was dry land`
  shipped it, because the carry list was a hand-maintained list of other
  people's files. It is now a floor, not the rule: everything under the cleared
  directories is snapshotted and anything the run did not write is put back,
  with a line in the log naming it.
* **The encoder dropped an authored hero.** `encode_heroes()` rebuilds the
  mock's eleven and `emit_heroes.py` merges its seed on top; its own docstring
  says *"this must be re-run after it"* and it was still not automated, so a
  re-run for an unrelated reason silently dropped the Palace of Fine Arts
  Exhibition Hall. Now re-applied automatically, as `emit_places.py` already
  was. And `verify_city_chunks.py`, which had been red for 30 checks since the
  twelfth hero shipped, now checks the invariant that matters — the mock's
  eleven survive the merge unchanged — instead of the count.

---

## 13. The height was a measurement of 2010

Same shape as the year: a number standing in for a different number, on screen
at every zoom.

### 13.1 What `hgt_mediancm` actually is, from the document that defines it

`ynuv-fyni`'s attached methodology PDF, `SF_BldgFoot_2017-05_description.pdf`,
defines all three grids:

> **First Return Surface [1st]** — "a 50cm gridded first return model, derived
> from **2 ppsm airborne LiDAR from Pictometry of 2010**."
> **Bare Earth Surface [gnd]** — "derived from 2 ppsm airborne LiDAR from
> Pictometry of 2010."
> **Feature Height Surface [hgt]** — "a 50cm gridded difference model,
> pixelwise-subtracting [First Return Surface − Bare Earth Surface]."

So the height is **2010**, and the footprints are not: the same document says
the compilation reviewed was `sf13m_BldgFoot_withZ_20161005i` — **October
2016**. A six-year gap between the outline and the height, in one row.

**That is the flight date, established from the publisher's own document and
not inferred.** Two defects follow from it.

**B. The LiDAR is older than the building.** A building finished after 2010 is
drawn at whatever stood on its lot when the plane went over.

**C. A median is the wrong statistic for a taper.** Most of a stepped
building's footprint sits under its wide base, so the median lands there.

### 13.2 The size of the class

| | |
|---|---|
| footprints drawn | 166,166 |
| **B** — roll year after the 2010 flight, drawn | **551** (0.33 %) |
| **B** — same, but dropped by the 2 m filter | 33 |
| **C** — `hgt_max ≥ 2 × hgt_median` | **5,891** (3.5 %) |
| **C** — `hgt_max ≥ 3 × hgt_median` | 1,352 (0.8 %) |

**B is not a systematic tilt on a decade of construction, and that is worth
saying because it is what I expected to find.** 551 of 166,166. The cohort's
median drawn height is 9.1 m against 6.8 m for the whole fabric — *higher*,
because most post-2010 roll years are renovations and condo conversions of
buildings that were already standing in 2010, not new construction on bare
ground.

A fabric-wide *ratio* cannot be reported, and that is the honest answer rather
than a missing one: **no published height exists for the other 165,000
buildings.** The only register that publishes one is the Tall Building
Inventory, and it covers 180.

### 13.3 Where it is severe: `5kya-mfst`, 157 rows joined

| completion | n | median drawn / published |
|---|---|---|
| pre-1990 | 119 | **0.92** |
| 1990–2010 | 24 | **0.73** |
| 2011+ | 14 | **0.28** |

The gradient is B. The 0.92 at the top — a tower that predates the flight still
drawn 8 % short — is C.

```
Salesforce Tower           published 326.1 m   drawn   0.2      <- excavation
Oceanwide Center I                   259.1             27.7
Transamerica Pyramid                 260.0             67.8     <- the taper
Park Tower                           173.1              4.5
Pacific Gas & Electric Bldg          145.1             12.3
```

**Salesforce Tower is not on the map at all.** Its only footprint returns
0.24 m and `build_bldg.py` drops anything under 2 m as a shed or a canopy.

### 13.4 The fix, and what it refuses to do

`5kya-mfst` publishes `height_ft` for all 180 rows. Where a row joins a
footprint that is the height and the building carries **`FLAG_PUBHEIGHT`**
(bit 5). Where it does not, the LiDAR median stands, and a building the roll
dates after 2010 carries **`FLAG_HEIGHT_STALE`** (bit 6). `meta.heightFlags`
ships both counts measured on the run, as `meta.yearFlags` already does.

**Resolution is published against published.** A parcel can carry several
footprints and `max(area)` gives the height to the podium — how Spear Tower
came to be drawn at 27.8 m against 172.2. The footprint whose own LiDAR median
is *nearest* the published height takes it, provided it reaches half of it;
where nothing reaches half (the building postdates the flight, so none of it is
in the 2010 grid) the largest takes it.

**Nothing is derived from storeys.** The register publishes `typ_story_height`
and it does not agree with a published height divided by a storey count, so
neither is used to invent the other.

```
applied to 155 rows · 124 raised · 31 lowered · median change +7.1 m
134 of the 166,166 height bytes change · tallest drawn 218 m -> 255 m
```

The 31 reductions are **rooftop mechanical plant coming off**: the LiDAR
first-return surface includes it (and the document says grayscale dilation was
applied to the grid, which biases it up), the register does not count it. The
largest is 680 Folsom — 13 storeys, published 166 ft — drawn 69.6 m. The
register is right.

**Order and geometry are byte-identical.** `cnt`, `vx`, `vy`, `xi`, `xn` and
`useNames` are unchanged, so every index-keyed array still aligns. The use
class `u & 7` is unchanged. Only `h` and the two new flag bits move.

### 13.5 Three things this deliberately does not fix

**a. Salesforce Tower stays off the map.** The `MIN_H` filter still tests the
LiDAR value. A published height would rescue two footprints — Salesforce at
0.24 m and 1190 Mission at 1.01 m — but rescuing them changes the **record
count**, and the count is the index every other per-building payload is keyed
on: roofs `st`/`hf` are packed nibbles of length `(n+1)//2`, paint `idx`/`flag`
are one byte per building, `form-data` indexes the stream directly,
`lod/blockof.npy` caches an assignment per building. The encoder asserts all
four and would refuse. **San Francisco's tallest building is missing from the
map, and it stays missing until those payloads are regenerated in the same
pass.** Written down rather than fixed by breaking four other files.

**b. Three published heights exceed the `h` byte.** It is a u8 of whole metres,
so 255 m is the ceiling. Salesforce (326.1) is absent anyway; Transamerica
(260.0) and Oceanwide Center I (259.1) draw at 255. Two buildings, 5 m and
4 m short, declared in `meta.heightNote` and `manifest.buildings`. Widening the
field is a chunk-format change.

**c. Nine second solids and eight shaped caps were dropped.** `form/model3.py`
derives an upper plane `T` from the same statistics the base height came from,
gated at `T − L ≥ 6 m`. Where the register's height now exceeds `T`, the step
stands *inside* the prism — a step the building does not have. Nine of the 488
are in that state and **every one is `FLAG_PUBHEIGHT`**, which is the check that
the cause is understood. They are dropped, and the eight of the 68 caps sitting
on them go with them, because a cap is a profile swept around its slot's top
plane and a cap with no slot is a shape with nothing to put it on.

**The trade is stated rather than hidden: eight towers lose a shaped top and
gain their published height.** The Transamerica Pyramid is one of them — a flat
top at 260.0 m against a pointed one at 67.8. The right long-term answer is for
`model3.py` to derive from whatever height ships.

### 13.6 On screen

Camera parked on the Transamerica Pyramid's own plane coordinate, only the data
changing between the pairs. `diag_downtown_shots.py` reproduces them.

```
whole city    0.20 % of map pixels changed
district      1.62 %
block         9.31 %
```

At block zoom the Financial District has its height back: Transamerica,
Embarcadero Center, Spear Tower and One California all stand at their published
heights where they stood at a third of them.

### 13.7 A latent bug in this directory's own patch files

Found while verifying this one. `mock-patches/*.patch` carried a `--- 8< ---`
separator between the prose header and the diff, and `patch` reads a line
beginning `---` as a diff header — so it silently mis-parsed the first hunk.
The separator is now `=== the diff begins below this line ===` and the `+++`
paths are normalised to the mock root. **All four patches now apply in order to
pristine baselines and reproduce the live files byte for byte**, which is the
check that should have been run on the first one.
