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

### 1.7 The chrome line that states this is wrong

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
* **The massing timeline has no 2014 step.** Bayview's biggest coverage jumps
  are 1906 (27 blocks), 1941 (20), 1907 (12), 1997 (11), 1947 (11). It does
  show that **115 of Bayview's 501 blocks (23 %) never gain any massing in any
  year**, against 365 of 4,903 (7.4 %) elsewhere — the shipyard and the Port,
  and consistent with §1.5.
* **`Z_STREET = 1.75` is a fetch policy, not a gate**, exactly as its comment
  says. It is not why Bayview's streets are thin; §2.1 is.
* **`yrbuilt` from the archived `ygi5-84iq` Land Use 2020 snapshot** — used by
  `gen_geo2.py` for the *block* layer, not the building layer — carries 16,928
  zeroes and the same 12,594-row 1900 dump. It has no 2014 mass either.
