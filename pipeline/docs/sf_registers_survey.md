# Which San Francisco registers can live on a map with a year slider

**Survey + measurement, 2026-08-25. Branch `refactor/paris-parity`.**
**Nothing was built and nothing was ingested. Every figure below was measured live
against the publisher's own API on 2026-08-25** and names the dataset, the column
and the count that produced it. Where a number is quoted from another document in
this repository it is marked as such.

The question, from Daniel:

> which of San Francisco's published registers can ever live on a map with a year
> slider, and which cannot — and is there anything published *as a series over time*?

Read-only probes that reproduce every table here live in
`scratchpad/registers-survey/` (`probe.py`, `hist.py`, `catalog.py`, `sweep2.py`,
`editions.py`, `roll_delta.py`, `ia_probe.py`). They write nothing outside that
directory.

---

## 0. The test that sorts them

**A · DATED PER ROW.** Each row carries a date for when *the thing happened*.
An event stream wearing a register's clothes. It can sit on the rail directly.

**B · SNAPSHOT ONLY.** The present state. The year slider does nothing to it.
This is why a 1906 city is drawn today from a 2016 footprint compilation.

**C · SERIALLY PUBLISHED.** Each edition is a snapshot; the *series* is the time
axis. This is the only route to **"what stood here in 1950"** rather than
**"what stands here now, built in 1950"**, and it is where the money is.

A register can be class A on one column and class B on the rest — `abvp-arbf`
looks like class A and behaves like class B, and §4 is about exactly that.

---

## 1. THE HEADLINE, before the tables

Four findings decide most of what follows.

1. **The DPW street-acceptance register exists, it is dated, and its date is a
   legal codification and not a construction date.** `abvp-arbf` carries
   `dateaccepted` on 13,012 of 13,012 rows — and **12,534 of them (96.3 %) carry
   the same date, 1998-05-01, under the same ordinance 138-98, the same Board
   file 9-97-3 and the same DPW order 170,718.** There are **25 distinct
   ordinances and 24 distinct dates in the whole file**. Putting it on the rail
   would arrive 96 % of San Francisco's streets in one frame in 1998. It closes
   the post-1947 hole with **465 real events**, not 13,012. §4.

2. **The DPW annual reports are not where the street acceptances went.**
   `DATA-TRUTH.md` §3.4 named them as the successor record. Measured over eight
   volumes 1951–1976 on the Internet Archive: **`"streets accepted"` appears once
   in all eight, `"street acceptance"` zero times**, and every one of the fourteen
   `accept*` contexts read in the 1955 volume is contract acceptance, an asphalt
   plant, or the *definition* of an unaccepted street. §4.3. **This retires the
   leading hypothesis and saves the fetch.**

3. **There is an eleven-edition parcel-level snapshot series for San Francisco
   going back to 1998, and it is filed on DataSF under a name that hides it.**
   Twelve datasets called "Historic Zoning Districts — 1998 … 2008" are not zoning
   districts: they are the Planning Department's **parcel-level land-use database,
   one edition a year, ~153,000 parcels each, with per-parcel geometry, `yrbuilt`,
   `stories`, `bldgsqft`, `resunits`, `landuse`, `zoning`, `heightlimi` and owner
   name.** Each edition's `yrbuilt` genuinely advances. Joined to the three Land
   Use editions (2020, 2023, current) that is **eleven parcel-grain snapshots,
   1998 → 2026** — nine years deeper than the assessor's roll series. §6.2.

4. **The 1886–1950 Sanborn atlases for San Francisco are at the Library of
   Congress, in the public domain, and I counted the sheets: 45 volumes,
   3,416 sheets** — the 1950 edition alone is 12 volumes and 1,009 sheets covering
   the whole city. LoC's own rights statement: *"The content of the Library of
   Congress online Sanborn Maps Collection is in the public domain and is free to
   use and reuse."* This is the clean-licence route `sf_building_character.md` §4
   correctly guessed at; the volume and sheet counts are now measured. §6.5.

---

## 2. CLASS A — dated per row

Sorted by what they would unlock. **"Real span"** is the span over which the
series is *dense*, not the min and max — a register's first and last rows are
almost never its horizon.

| register | publisher | rows | date field, and what it MEANS | min → max | **real span** | licence |
|---|---|---:|---|---|---|---|
| **`i98e-djp9` Building Permits** | DBI | **1,294,329** | `filed_date` = application filed. `issued_date` = permit issued. `completed_date` = **DBI signed the work off** — the closest thing SF publishes to a building's birthday | filed 1901-03-10 → 2026-08-24 | **1982 → 2026.** 1979: 108 filings · 1980: 259 · 1981: 2,891 · **1982: 10,319** · 1990s: 265,904. Everything before 1980 is 314 rows in eighty years | PDDL 1.0 |
| **`b6tj-gt35` Street-Use Permits** | SF Public Works | **1,227,085** | `approved_date` = permit approved. **Carries `cnn`**, so it joins the centreline network directly | 1993-10-18 → 2026-08-24 | 1994 → 2026 | PDDL 1.0 |
| **`g8m3-pdis` Registered Business Locations** | CCSF | **365,807** | `location_start_date` = business registered at this address. `location_end_date` = registration closed | start 1849-01-01 → 2028-02-26 | **start: 1985 → 2026** (1985: 392 · 1990: 642 · 1995: 1,360 · 2000: 2,698 · 2003: 3,625; **everything before 1960 is 214 rows in 111 years**). **end: 2010 → 2026 only** — see §5.5 | PDDL 1.0 |
| **`tkzw-k3nq` Street Tree List** | SF Public Works | **198,436** | `plantdate` = **planting permit date**, on 72,146 rows (36.4 %) | 1955-09-19 → 2026-08-18 | **1972 → 2026** (1970s 4,000 · 1990s 18,743 · 2000s 24,261) | PDDL 1.0 |
| **`qvu5-m3a2` Planning Records – Projects** | Planning | **54,478** | `open_date` = **the planning application opened**, not when anything was built. 100 % coverage | 1974-05-21 → 2026-08-24 | **1981 → 2026.** 1978: 43 · 1979: 56 · 1980: 47 · **1981: 540** and 500–850 a year thereafter | PD US Govt |
| **`nqyt-nfmd` Parcel Change Log** | DT + SF Public Works | **181,134** | `recordeddate` = **the map recording that changed this parcel's geometry**, on 146,308 (80.8 %). Carries the polygon *and* `oldblklot` — it is a lineage record | 1977-03-11 → 2026-07-14 | 1977 → 2026 | **(none stated)** |
| **`abvp-arbf` Street Acceptance Data** | SF Public Works | **13,012** | `dateaccepted` = **the date of the ORDINANCE that accepted this segment** — not when it was built, laid out, or opened | 1925-11-23 → 2025-08-05 | **see §4. 96.3 % of it is a single day** | PDDL 1.0 |
| **`xdht-4php` Housing Production** | Planning | 6,113 | `first_completion_date` = first unit completed, 100 % | 2005-01-03 → 2026-08-14 | 2005 → 2026 | PD US Govt |
| **`qrwx-q4gg` Street Tree Removal Notifications** | SF Public Works | 5,680 | `posteddate` = the removal notice was posted | 2017-07-05 → 2026-08-24 | 2017 → 2026 | Public Domain |
| **`ygmz-vaxd` MTA Bike Network** | SFMTA | 5,457 | `install_yr` on 5,217 — but **904 of them are `0`** | 1996 → 2025 in earnest (1971/1974/1984/1986 are 84 strays) | 1996 → 2025 | PDDL 1.0 |
| `63x5-g3m4` Historic Districts | Planning | 204 | `dateadop` = **district adopted**, on 68 of 204 (33 %) | 1962-06-13 → 2026-07-16 | 1962 → 2026 | PD US Govt |
| `97yj-54sx` Article 10 Landmarks | Planning | 370 | `yeardesignated` = **the designation**, not the building. Min is `0` | 0 → 2026 | 1968 → 2026 | PD US Govt |

### 2.1 Inside `i98e-djp9`, because the whole register is not one thing

```
permit_type                                          rows
 1  new construction                                 2,496
 2  new construction wood frame                     13,122
 3  additions alterations or repairs               271,386
 4  sign - erect                                    21,142
 5  grade or quarry or fill or excavate                834
 6  demolitions                                      7,310
 7  wall or painted sign                             4,133
 8  otc alterations permit                         973,272
 9  (null)                                             634
```

**New construction (types 1 + 2) — 15,618 permits, 15,188 with a point (97.2 %),
9,882 with a `completed_date`.** By decade of completion: 1980s 2,778 · 1990s
2,727 · 2000s 2,423 · 2010s 1,376 · 2020s 558 (plus 20 strays 1900–1979).

**Demolitions (type 6) — 7,310 permits**, 4,539 with a `completed_date`, 6,908
with a point (94.5 %), 7,310 with block + lot (100 %). `DATA-TRUTH.md` §4.1 gave
the span as 1980–2026; **on `completed_date` the series actually begins in 1983**
(216 in 1983, 188 in 1984), with one 1900 stray. On `filed_date` it begins 1980.
The distinction matters because it is the completion, not the filing, that is the
frame in which a building disappears.

---

## 3. CLASS B — snapshots. The year slider does nothing.

| register | publisher | rows | why it is class B | licence |
|---|---|---:|---|---|
| **`3psu-pn9h` Streets – Active and Retired** | CCSF | 17,170 | **`accepted` is a boolean**, 13,190 `true` / 3,980 `false`. §4 establishes where that bit comes from | PDDL 1.0 |
| **`ynuv-fyni` Building Footprints** | CCSF | 177,023 | **no date column of any kind.** See §5.1 — three dates present themselves on the portal and none of them is the compilation date | PDDL 1.0 |
| `3tsw-4idn` Historic Resource Status by Parcel | Planning | 163,272 | `yearbuilt` on 148,101 (1808–2026) dates the *building*; the register is a present-state CEQA status | PDDL 1.0 |
| `nc68-ngbr` City Facilities | CCSF | 1,734 | present tenancy only. No opened, built or acquired date | PDDL 1.0 |
| `gtnh-hgvs` City Lands | CCSF | 1,035 | present ownership only | PDDL 1.0 |
| `6m3x-8fu4` Article 11 Ratings | Planning | 786 | C-3 downtown ratings, no date at all | PD US Govt |
| **`x5tj-txci` DPW Maintained Roadway Structures** | SF Public Works | **468** | **61 vehicular bridges, 29 pedestrian bridges, 3 tunnels, 3 movable bridges, 1 overcrossing, 98 stairs, 174 retaining walls.** No date **and no height** — see §5.4 | PDDL 1.0 |
| `5kya-mfst` Tall Building Inventory | CCSF | 180 | `date` (completion, 1889–2019) and `collected_on` (2017-10 → 2018-09) are *attributes of a one-off survey*. 180 buildings | PDDL 1.0 |
| `h8n7-e4ns` right-of-way polygons · `emxt-b6yg` curbs · `aw7j-9354` public stairs | SF Public Works | 22,191 · — · 268 | present-state geometry. *(counts quoted from `DATA-TRUTH.md` §15.1, not re-measured here)* | PDDL 1.0 |

---

## 4. THE STREET-ACCEPTANCE QUESTION, answered

> *Is there a DPW street-acceptance or right-of-way register carrying a date?*

**Yes. `abvp-arbf` "Street Acceptance Data", San Francisco Public Works, PDDL 1.0,
13,012 rows, and every single one carries a `dateaccepted`.** It publishes `cnn`,
`streetname`, `limits`, `ordinancenumber`, `bosfilenumber`, `dpwordernumber`,
`length_ft`, `jurisdiction`, a maintenance-agreement link, and a point.

**And it does not close the hole, because the date is a legislative date.**

### 4.1 The number, before the cause

```
dateaccepted by year, all 13,012 rows

1925   2      1990    1      2006    1      2016    5
1931   1      1998   12534   2009    4      2022    2
1982   9      2000    1      2010  371      2024   43
              2001    1      2011    2      2025    6
              2004    6      2012   11
                            2013   12
```

**One date holds 12,534 rows — 1998-05-01.** All 12,534 carry
`ordinancenumber = 138-98`, `bosfilenumber = 9-97-3`, `dpwordernumber = 170,718`.
The next largest is 2010-03-12, ordinance 47-10, 365 rows. The whole file contains
**25 distinct ordinance numbers and 24 distinct dates.**

Twelve and a half thousand street segments spread over every neighbourhood in the
city were not physically accepted on one Friday in May 1998. Whatever ordinance
138-98 did, it did to the pre-existing network at once. **`dateaccepted` is the
date of the legal instrument, not of the street.**

### 4.2 It IS the provenance of the boolean the map already has

Joined `abvp-arbf`'s `cnn` against the 17,170 centrelines in this pipeline's own
`geo/cache/streets.json`:

```
centrelines carrying an acceptance row     12,994 of 17,170   (75.7 %)
  of the 13,190 with accepted = true       12,988             (98.5 %)
  of the  3,980 with accepted = false           6             ( 0.2 %)
```

**`3psu-pn9h.accepted` is `abvp-arbf` reduced to one bit.** That is worth knowing
on its own: the boolean `DATA-TRUTH.md` §0 flagged as "a BOOLEAN, not a year" now
has a named source, an ordinance number per segment, and a clickable BOS file
number — all of which are publishable provenance even though the year is not.

### 4.3 What it gives the map, honestly

**465 shipped centrelines get a real acceptance event** — the 478 rows outside the
1998 blanket resolve to 465 distinct `cnn`, and all 465 are in this pipeline's
centreline set. By era:

```
1925  2   Geneva Ave, ordinance 6856          2004   6      2013  10
1931  1   Villa Ter, ordinance 8956           2006   1      2016   5
1982  9   Executive Park Blvd, ord 7-82       2009   4      2022   2
1990  1                                       2010 360      2024  43
2000  1                                       2011   2      2025   6
2001  1                                       2012  11
```

So against the hole the brief names — *"the map cannot say when any street after
1948 was accepted"* — this register supplies **453 post-1948 acceptance events, and
not one of them falls between 1948 and 1981.** The remaining ~12,500 get a
codification date. It is a real addition to the rail and it is not the answer
to 1948.

**`jurisdiction` is the sleeper column.** It names the authority per segment —
DPW 12,637 · RECPARK/DPW 141 · CALTRANS/DPW 73 · PORT 55 · CALTRANS 38 ·
GGNRA 11+11 · YERBABUENA 7 · **HUNTERSPOINT/DPW 4** · TREASUREISLAND 3 · Presidio 1.
`DATA-TRUTH.md` §2.1 established the federal-jurisdiction gap by inference from
the `layer` column; **this register states the jurisdiction outright, per segment,
from the department that maintains the street.**

### 4.4 And the DPW annual reports are not the successor record

`DATA-TRUTH.md` §3.4 wrote: *"The reports themselves are a separate Internet
Archive series and are where street acceptances went."* That was a hypothesis.
Measured.

The series is real and large: **85 Internet Archive items, 68 distinct volume
years** taken from the identifiers rather than the catalogue dates (1854, 1880–1912
near-continuously, then 1924, 1930, 1932, 1934, 1939, 1942, 1944, 1946, 1948, 1951,
1955, 1959, 1962–1982 heavily, 1989–2013). The catalogue `year` field is unusable —
`annualreportofd1951sanf_0` is tagged with no year at all and other volumes are off
by decades.

The content is not a register. Full OCR of eight volumes:

```
volume                       chars   "streets accepted"  "street acceptance"  "accepted for maintenance"
annualreportofd1951sanf_0   645,782          1                   0                      1
annualreportofd1955sanf_0   993,828          0                   0                      4
annualreportofd1959sanf_0   797,387          0                   0                      2
annualreportofd1962sanf_0   895,427          0                   0                      5
annualreportofd1966sanf_0   163,909          0                   0                      1
annualreportofd1969sanf_0   288,659          0                   0                      1
annualreportofd1972sanf_0   276,999          0                   0                      1
annualreportofd1976sanf_0   236,580          0                   0                      1
```

For scale, the Board's *Journal* carried **136–266 roadway-acceptance items in a
single year** through the 1910s and 1920s (`DATA-TRUTH.md` §3.1). Reading all
fourteen `accept*` contexts in the 1955 volume: a bonded-guarantee clause, the
Municipal Asphalt Plant accepted 13 May 1955, private contract improvements
"accepted by the City for maintenance", and twice the *definition* —
*"Unaccepted streets are those streets that have not been properly improved and
officially accepted for maintenance and repair by the City."* A department that
prints the definition of an unaccepted street and never lists one is describing
its own remit, not keeping a register.

**Recommendation: do not fetch this series for street dates.** It remains the
right corpus for narrative and for city-owned buildings, which is what
`us_sf_places/` already uses it for.

---

## 5. THE THREE WARNINGS, applied — every trap this pass turned up

Each of these is a field whose name is not what it holds, found by opening it.

### 5.1 `ynuv-fyni` publishes three dates today and none is its own

| what the portal says | value | what it actually dates |
|---|---|---|
| `rowsUpdatedAt` | **2026-08-25** (today) | the Socrata row refresh |
| `data_as_of` on all 177,023 rows | **2023-09-11T12:00** | a republication |
| the attached methodology PDF | `SF_BldgFoot_2017-05_description.pdf` | a 2017 document |
| the description's own words | *"collapsed from an earlier 3D building model provided by **Pictometry of 2010**"* | the LiDAR flight |
| the compilation the PDF names | `sf13m_BldgFoot_withZ_**20161005**i` | **October 2016** — the outlines |

Five dates, six years apart at the extremes, and **the one a reader would take —
`data_as_of` — is wrong by seven years for the outline and thirteen for the
height.** *(The 2010 flight and the October 2016 compilation are established in
`DATA-TRUTH.md` §13.1 from the publisher's PDF; what is new here is that the live
portal now offers 2023-09-11 and 2026-08-25 on top of them.)*

### 5.2 `piqy-pimd.totalbldgs` is floor area

The 1998 parcel edition publishes a column called `totalbldgs`. Measured over its
142,931 non-zero rows: **median 1,700, maximum 4,701,470, and it is equal to
`bldg_sqft` on 130,469 of them (91.3 %).** It is square feet. Anyone reading
"how many buildings stood on this parcel in 1998" out of that column would be
reading floor area and would not notice.

### 5.3 `acdm-wktn.date_map_add` dates the digitisation, not the parcel

```
date_map_add   234,987 of 236,542 rows (99.3 %)   min 1984-07-31
date_rec_add    79,625 of 236,542 rows (33.7 %)   min 1900-01-01
```

The near-complete column starts in **July 1984** — San Francisco's parcels did not
begin in 1984; the digital basemap did. The column that might mean something,
`date_rec_add`, is on a third of rows and its floor is the same `1900-01-01` dump
value the assessor's roll carries. **The complete-looking column is the useless one.**

### 5.4 USGS `date_on_map` is a printing date

From the USGS Historical Topographic Map inventory (186,060 sheets; 58 named
"San Francisco"):

* **Six SF North/South sheets all say `date_on_map` 1956.** Their
  `aerial_photo_year` values are 1956, 1956, 1968, 1973, 1973, 1979 and their
  `photo_revision_year` values 1968, 1973, 1973, 1980. One printed date, four
  different cities underneath it.
* **All eight 1:62,500 sheets dated 1899 and all six dated 1915 carry
  `survey_year 1894`.** Twenty years of reprints of one survey.

A naive read of `date_on_map` gives 1899 eight times and 1956 six times. The
honest content vintages are in §6.6.

### 5.5 `g8m3-pdis.location_end_date` dates the field, not the closure

```
location_end_date by decade   1990s   205
                              2000s 1,784
                              2010s 136,176
                              2020s 101,028
```

Businesses did not stop closing in the 1990s. The column entered the system.
**Business *openings* are usable from 1995; business *closings* are usable from
about 2010 and not before.** Half of a two-ended event stream is missing and its
absence looks exactly like data.

### 5.6 Three registers publish dates in the twenty-third century

`i98e-djp9.last_permit_activity_date` max **2209-06-07**;
`b6tj-gt35.permit_start_date` max **2209-09-27**;
`g8m3-pdis.location_end_date` max **2205-12-30**;
`g8m3-pdis.location_start_date` max **2028-02-26**;
`qvu5-m3a2.project_decision_date` max **2027-03-22**.
Any max() taken off these columns without a bound is a fabricated horizon.

### 5.7 Where a register looks fragile — the schema-drift list

* **The parcel-edition series breaks grain in 2009.** 1998–2008 editions hold
  ~153,000 **parcel** rows with 35–128 columns. From 2009 the same dataset name
  holds **9,880–10,617 zoning-district polygons with 7 columns**
  (`districtna`, `zoning_sim`, `url`, two shape measures). A loop over "all the
  Historic Zoning Districts editions" silently changes what a row *is* halfway
  through. §6.2.
* **The key column and the year column both move inside the parcel series.**
  1998 keys on `blklot` and has no year-built column at all; 2001–2002 use
  `yr_built`; 2003 onward use `yrbuilt`; 2001 onward key on `mapblklot`.
* **The 2004 and Mar-2005/2005 editions are not one row per parcel.** 191,062 rows
  for 153,593 distinct `mapblklot` (1.24×), and 196,344 for 192,031. Any per-parcel
  count taken off `count(1)` in those two editions is 24 % high.
* **`qvu5-m3a2` encodes one checkbox three ways.** `demolition` takes
  `CHECKED` (1,041), `Yes` (237), `No` (5,203), `UNCHECKED` (96) and **null
  (47,901, 87.9 %)**. `new_construction` uses only `CHECKED`/`UNCHECKED`. A filter
  on `= 'CHECKED'` silently drops 237 real demolitions.
* **`qvu5-m3a2.environmental_document_date` is a `text` column** whose min is
  `"01/02/2025"` and whose max is the literal string `"undefined"`.
* **`abvp-arbf.cnn` arrives as a float** in the JSON API (`6664000` comes back as
  a number). Any join must normalise before comparing.
* **`ybh5-27n2.startyear` ranges 0 → 9999** and
  **`bp3t-bd4t.install_yr` ranges 0 → 24** (two-digit years). Neither is usable
  without a bound.
* **`ygmz-vaxd.install_yr` is `0` on 904 of 5,457 rows** (16.6 %).

---

## 6. CLASS C — the series, and this is the one that changes what the map can draw

Ordered by what each can put on screen that nothing else can.

### 6.1 The assessor's historical secured rolls — `wv5m-vpq2` — already in use

**19 editions, closed roll years 2007 → 2025, 3,934,467 rows in total**, PDDL 1.0.

```
2007 197,778   2011 193,758   2015 208,927   2019 213,531   2023 212,206
2008 200,182   2012 204,113   2016 210,729   2020 209,695   2024 212,653
2009 200,901   2013 205,509   2017 208,041   2021 210,698   2025 211,547
2010 203,053   2014 206,816   2018 212,779   2022 211,551
```

**What the SERIES carries that the 2025 edition does not** — measured, 2007 against
2025 on `parcel_number`, which is a floor because it uses two of the nineteen:

```
parcels in both editions                                   187,860
in 2007, gone by 2025                                        9,918
new since 2007                                              23,687
year_property_built INCREASED between the two                  600
  ... by 10 years or more — a rebuild, so something came down    492
undated in 2007, dated by 2025                               2,978
dated in 2007, left undated by 2025                            404
```

**492 dated rebuilds and ~3,000 parcels the series dates and the latest edition
does not, from two editions out of nineteen.** `DATA-TRUTH.md` §4.4 called this
"a cheap partial check… adds nothing before 2007" and did not print the number;
this is the number. For context the 2025 edition leaves **10,683 of its 211,547
rows with a null `year_property_built`** (5.0 %).

### 6.2 The Planning parcel land-use editions — **1998 → 2026, and mislabelled**

This is the find. Twelve DataSF datasets named *"Historic Zoning Districts – YYYY"*
are the Planning Department's **parcel-level land-use database**, published one
edition per year, each with the parcel polygon.

| dataset | edition | rows | distinct parcels | key | year col | cols | licence |
|---|---|---:|---:|---|---|---:|---|
| `piqy-pimd` | **1998** | 152,569 | 152,535 | `blklot` | *(none)* | 35 | (none stated) |
| `itx2-wzp5` | 2000 | 153,292 | — | `mapblklot` | `yr_built` | 32 | (none stated) |
| `cfhj-8c6b` | Apr 2000 | 153,292 | — | — | — | 13 | PDDL 1.0 |
| `8m6w-8yuk` | 2001 | 153,669 | 153,593 | `mapblklot` | `yr_built` | 40 | PDDL 1.0 |
| `3yi7-eyfd` | 2002 | 153,663 | 153,578 | `mapblklot` | `yrbuilt` | 40 | PDDL 1.0 |
| `6ru7-zq4y` | 2003 | 153,716 | 153,516 | `mapblklot` | `yrbuilt` | 41 | (none stated) |
| `s3eh-jdwb` | 2004 | **191,062** | 153,593 | `mapblklot` | `yrbuilt` | 48 | (none stated) |
| `5uzm-v8n8` | Mar 2005 | 196,344 | — | `blklot` | — | 18 | (none stated) |
| `b52k-gy2v` | 2005 | 196,344 | 192,031 | `blklot` | — | 26 | (none stated) |
| `afkh-hfhr` | 2006 | 23,132 | — | — | — | 6 | PDDL 1.0 |
| `pe87-v8tx` | **2007** | 153,822 | 153,753 | `mapblklot` | `yrbuilt` | 59 | (none stated) |
| `tsdh-z53a` | **2008** | 153,355 | 153,241 | `mapblklot` | `yrbuilt` | **128** | PDDL 1.0 |
| `ygi5-84iq` | 2020 *(archived)* | 155,395 | 155,395 | `mapblklot` | `yrbuilt` | 27 | (none stated) |
| `fdfd-xptc` | 2023 *(archived)* | 154,476 | — | `mapblklot` | — | 17 | PD US Govt |
| `c5ge-t6pj` | current | 153,765 | — | `mapblklot` | — | 23 | CC0 1.0 |
| — | *2009 onward* | *9,880–23,355* | — | — | — | *7* | **different grain — see §5.7** |

The 1998 edition alone carries, per parcel: `blklot`, `landuse`, `landuse2`,
`zoning`, `zonsimpl`, `height_lim`, `allowfar`, `existfar`, `stories`, `bldg_sqft`,
`resunits`, `units`, `use_type`, `ownr_name`, address, and the geometry.

**They are genuinely successive vintages, not copies.** Newest `yrbuilt` per
edition, bounded to 1994–2029:

```
2001 edition  tops out at 2001   (2001:3   2000:50   1999:116)
2003 edition  tops out at 2002   (2002:32  2001:113  2000:176)
2004 edition  tops out at 2004   (2004:359 2003:1545 2002:2000)
2007 edition  tops out at 2010   (2007:104 2006:117  2005:113)
2008 edition  tops out at 2010   (2008:196 2007:209  2006:210)
2020 edition  tops out at 2018   (2016:93  2015:52   2014:84)
```

**What the series lets the map say, measured 1998 against 2020 on the parcel key:**

```
parcels in both editions                                   144,601
in the 1998 edition, gone by 2020                            7,934
created after 1998                                          10,794

with floor area in 1998                                    142,962
with floor area in 2020                                    136,148
SAME parcel: floor area in 1998, none in 2020                9,223
SAME parcel: none in 1998, floor area in 2020                1,242
floor area more than DOUBLED 1998 -> 2020                    3,063
floor area more than HALVED                                    124
```

**And now the honesty pass, because the headline number is mostly missing data.**
Of those 9,223, **7,162 carry `landuse = "MISSING DATA"` in the 2020 edition** —
the 2020 edition has 10,142 such rows overall. The parcel did not lose its
building; the edition lost the parcel's attributes.

> **The honest count of parcels that carried floor area in 1998 and where the 2020
> edition says something specific and it is not a building is 2,061, not 9,223.**

That is still 2,061 parcel-shaped, dated-to-a-two-year-window disappearances that
no other source in this project can produce, and it is the first number in this
repository that is not survivorship. It is also a warning: this series will
produce a spectacular and wrong number for anyone who does not check the
`MISSING DATA` bucket.

**Two caveats that are not optional.** (a) The grain is the **parcel**, not the
footprint: it gives an outline and a floor area, never a building shape.
(b) **Seven of the fifteen editions state no licence at all.** They sit on
data.sfgov.org beside PDDL and CC0 siblings and are almost certainly meant to be
open, but "almost certainly" is not a licence, and this project's own rule is that
every figure traces to something you can click. Planning should be asked.

### 6.3 Zoning height-and-bulk editions — `a4wu-zqx3` … `h9wh-cg3m`

**Seven editions**: 2009 (6,703 polygons) · 2010 (7,130) · 2011 (7,145) ·
2012 (7,195) · 2013 (7,314) · 2014 (7,317) · current `h9wh-cg3m` (5,292).
Mixed licences (PDDL on 2010 and 2012, PD US Govt on the current, none stated on
the rest). Small, geometric, and it is *the rule that shaped the city* rather than
the city — a legibility layer, not a fabric layer.

### 6.4 The zoning-district editions proper — 2009 → 2026

The post-2009 half of the "Historic Zoning Districts" series, 9,880–10,617 district
polygons per edition, seven columns. Seven editions plus current. Same caveat on
licence.

### 6.5 **Sanborn fire-insurance atlases — Library of Congress — 1886 → 1950, public domain**

Measured against the LoC JSON API, 2026-08-25: **45 San Francisco volumes,
3,416 sheets.**

```
year   vols  sheets      year   vols  sheets
1886      2     136      1913      5     555
1887      3      85      1914      3     314
1889      1      69      1915      3     194
1893      1      85      1925      1       0*
1897      1       2      1928      2       0*
1899      4     465      1948      1     122
1900      2     251      1949      1     117
1904      1       2      1950     12   1,009
1910      1      10      (one volume has a malformed date)
                                  ----  -----
                          TOTAL     45  3,416
```
*\*two volumes report no page count in the API; they are catalogued but the sheet
count could not be read from the search response.*

**The licence, quoted from the LoC item record verbatim:**
> *"The content of the Library of Congress online Sanborn Maps Collection is in the
> public domain and is free to use and reuse."*

**This is the source that answers Daniel's question as asked.** It is the only
thing in this entire survey that can draw a *building outline* for a building that
is gone. The 1950 edition is 12 volumes and 1,009 sheets and covers the whole city
— **"what stood here in 1950" is literally drawn on those sheets**, with
construction material by colour wash, storey counts as numerals, and bay and porch
outlines.

`sf_building_character.md` §4 reached the same source through the David Rumsey
scans and correctly flagged their **CC BY-NC-SA 3.0** licence as the wrong shape
for this project, and correctly guessed that the Library of Congress collection
would be public domain. **It is, and here is the inventory.** Nothing has to be
re-scanned.

**Cost, stated honestly and not shrunk:** these are page scans. Getting footprints
out of them is georeference-per-sheet plus a vision pass per sheet. Even scoped to
the 1950 edition alone that is **1,009 sheets**. The published state of the art is
a 2023 method paper (Kim et al., PLOS One, F1 ≈ 0.9 for footprint and construction
material) applied to other cities — a workflow, not an SF dataset. **This is
several weeks, and it is the only several weeks in this document that buys a
different map rather than a better one.** It should be scoped as a project with its
own brief, and it should start with one neighbourhood on one edition, not the city.

### 6.6 USGS historical topographic maps — public domain, **already georeferenced**

From the USGS Historical Topographic Map Collection inventory
(`topomaps_all.zip` → `historicaltopo.csv`, 186,060 sheets). San Francisco:

| quadrangle | scale | sheets | GeoTIFF |
|---|---|---:|---|
| San Francisco North | 1:24,000 | 10 | yes, all |
| San Francisco South | 1:24,000 | 10 | yes, all |
| San Francisco | 1:62,500 | 14 | yes, all |
| San Francisco | 1:100,000 | 2 | yes |
| San Francisco | 1:250,000 | 13 | yes |

**Every sheet carries a `geotiff_url` on public S3** (e.g.
`https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/GeoTIFF/CA/CA_San%20Francisco_298892_1899_62500_geo.tif`),
public domain, **already georeferenced**. The two city quadrangles are
**20 files totalling 355,273,566 bytes — 355 MB — 13.6 to 23.2 MB a sheet**, one
`curl` loop. *(An earlier draft of this document said "~11 MB each, roughly
220 MB". That was the size of the one 1:62,500 sheet I had sampled, generalised to
sheets I had not measured. The figure above is the sum of the inventory's own
`product_filesize` over all twenty. The estimate was low by 61 %.)*

**But read §5.4 before using the dates.** The honest distinct content vintages,
taken from `aerial_photo_year` / `photo_revision_year` / `survey_year` rather than
`date_on_map`:

```
1:24,000 city coverage   1946 · 1956 · 1968 · 1973 · 1979 · 1980 · 1993 · 1995
                         (eight vintages over the twenty sheets, taken from
                          aerial_photo_year and photo_revision_year together)
1:62,500                 one survey, 1894, reprinted through 1947
1:250,000                aerials of 1945, 1952, 1978
```

At 1:24,000 you can read the street network, the shoreline, the parks and the
large structures — **not individual houses.** So this is a **street, coastline and
made-land time series**, not a building one. That is exactly the gap
`DATA-TRUTH.md` §1.8 left open: *"the four made-land buckets are the whole of what
this pipeline knows about made land"*, and the peninsula at Hunters Point is drawn
as dry land in every year. **A 1946 and a 1956 sheet would settle that from a
published, public-domain, pre-georeferenced source for the price of an afternoon.**

### 6.7 Aerial photography — 1938 and 1948, whole city, wrong licence

Measured on the Internet Archive, 2026-08-25:

| survey | frames | flown | publisher | licence |
|---|---:|---|---|---|
| *"Aerial Negative. City and County of San Francisco"* | **162** | **27 August 1938** | Harrison Ryker, Oakland | **CC BY-NC-SA 3.0** |
| *"San Francisco Aerial Views, August 1938"* | **165** | August 1938 | Harrison Ryker, Oakland | **CC BY-NC-SA 3.0** |
| *"San Francisco Aerial Photo Survey July and August 1948"*, 9″×9″ | **190** | July–August 1948 | — | **CC BY-NC-SA 3.0** |

Rights statement carried on the IA items: *"Images may be downloaded and used
following Creative Commons CC BY-NC-SA 3.0 license. Image credit should be given
to 'David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries.'"*

Two whole-city vertical surveys, ten years apart, straddling 1950 — and both are
**non-commercial share-alike**, which would make derived vectors the only
NC-encumbered thing in this project. The public-domain alternatives (USGS
EarthExplorer single-frame aerials; UCSB FrameFinder, whose on-demand scanning
ended 2024-06-14) are not scanned, not georeferenced, and not free of effort.

And the ceiling is low regardless: a ~1 m black-and-white vertical shows **that a
building is there** and roughly how big. It does not show a bay window or a gable.
That is `sf_building_character.md` §5's conclusion and this survey does not
disturb it — **aerials give presence, not form.**

### 6.8 City directories — real, annual, and the wrong shape for a map

611 Internet Archive hits for San Francisco directories, running from the 1850s to
the 2000s (Langley's, Crocker-Langley, Polk's). The catalogue `year` field is
unreliable — Polk's 1948-49 directory is tagged 1930 — which is the same trap the
brief already paid for on the Archive volumes.

A city directory is an **occupancy** series keyed on a street address, not a
geometry series. It could say who was at 1234 Market Street in 1938. It cannot say
what the building looked like or whether it is still there. **Right for a fiche,
wrong for the fabric**, and the OCR-to-address extraction is its own project.

---

## 7. Which class-A registers should we be using and are not

Ranked by what they unlock, not by row count.

### 1st — `i98e-djp9` new construction and demolition, as the map's second opinion on dates

**What it unlocks.** Today every building year on the map comes from one column of
one register: `wv5m-vpq2.year_property_built`. `DATA-TRUTH.md` established that
**23,487 of 166,166 footprints (14.1 %) are drawn on a year that is not their
own**, and that no join key can fix it because the roll simply does not date them.
DBI is a **different department keeping a different record for a different reason**,
and it publishes **9,882 building completions carrying a `completed_date`** (of
15,618 new-construction permits, 15,188 of which carry a point) and **4,539
demolitions carrying a `completed_date`** (of 7,310, 6,908 of which carry a point;
all 7,310 carry block and lot). It is the only independent check on the fabric's
time axis that exists.

**What it does not do, said plainly.** It will not rescue the 6,061 orphans. Those
are federal, Port and airport land — the assessor does not tax them and DBI does
not permit them either. I did not measure that join and nobody should claim it
until someone does.

**Cost.** One fetch script and one block+lot join, comparable to `bldg/fetch_roll.sh`.
`DATA-TRUTH.md` §4.1 already costed the demolition half.

### 2nd — `tkzw-k3nq.plantdate`, because the tree layer is on the rail with no year

The brief's own item 5 records the gap: *"the canopy has **no year gate** (a data
gap: `kinds.canopy` ships cellKey/pos/area and no year)."* **The register the
canopy is built from publishes a `plantdate` on 72,146 of its 198,436 rows.** The
column is there, it is dense from 1972, and it is being dropped between the source
and the chunk.

This is the highest ratio of visible change to work in the whole survey: 36 % of
the city's trees would arrive on the year they were planted, and the other 64 %
fall into the rule the project already has — `time.ts`'s *"drawn in every year,
declared as undated, counted, and put behind a flag"*, which is exactly how the
125,234 undated trees are handled today.

### 3rd — `abvp-arbf`, for its provenance and its jurisdiction column, not its date

465 real acceptance events, an **ordinance number and a Board file number per
segment** (clickable provenance for a layer that currently has a boolean), and a
`jurisdiction` column that names the maintaining authority — including the four
Hunters Point and three Treasure Island segments that `DATA-TRUTH.md` §2.1 had to
infer were federal from the `layer` column. **Ship it as provenance and as 465
marks; never as a year for 12,534 streets.**

### 4th — `g8m3-pdis`, for Daniel's "modern info on each block"

365,807 businesses, geolocated, opening dates usable from the mid-1980s and dense
from the mid-1990s, closing dates usable only from about 2010. This is the direct answer to *"connect to each block more
information that may be relevant, especially modern info… economics?"* — and it is
an event stream, so it moves with the rail instead of sitting still. Half of it
(the closures) starts in 2010 and the page has to say so.

### 5th — `nqyt-nfmd`, parcel lineage with geometry

146,308 dated parcel-geometry changes 1977–2026, each carrying **both** the new
`blklot` and the `oldblklot`, **and the polygon**. It is the only register that
shows the *ground* being re-cut rather than the buildings on it. Its licence is
unstated, which has to be resolved first.

**Not recommended, and here is why, so nobody re-proposes it:** `qvu5-m3a2`'s
demolition flag. 1,278 projects are flagged (1,041 `CHECKED` + 237 `Yes`), and
**every one of them opened in 2000 or later** — 49 in the 2000s, 794 in the 2010s,
435 in the 2020s. It does not extend the demolition record behind DBI's 1983. It
adds a planning-application date to demolitions we already have.

---

## 8. Three recommendations, in order, with cost

**These three, and not a fourth.**

### 1. Wire `plantdate` into the canopy layer — *hours*

72,146 of 198,436 street trees carry a planting date, dense from 1972, PDDL,
already fetched by this pipeline. The canopy currently ships with no year at all
and is drawn in every frame. This is a column that exists in a file this project
already reads, and turning it on gives the rail a living layer at the two zooms
where the fabric barely changes. The other 63.6 % go behind the existing undated
flag, which needs no new decision because `time.ts` already states the rule.

*Owned by: `us_sf_city` tree/canopy build + `time.ts`. Not this agent's files.*

### 2. Pull the twenty USGS 1:24,000 GeoTIFFs and settle the made land — *one day*

Twenty sheets, **355 MB measured**, public domain, **already georeferenced**, one
`curl` loop against a public S3 bucket. Content vintages **1946, 1956, 1968, 1973,
1979, 1980, 1993, 1995**, read off `aerial_photo_year`/`photo_revision_year` and
not off `date_on_map` — §5.4 is the whole reason this is a day and not a week.

It buys the thing `DATA-TRUTH.md` §1.8 left open and flagged as needing a decision:
**the coastline and the made land, per vintage, from a published source.** Hunters
Point is drawn today as dry land in 1906 because the four `made_land.json` buckets
are all this pipeline knows and none of them is in Bayview. A 1946 sheet and a 1956
sheet answer that from a public-domain raster, and they answer the same question
for Mission Bay, the Marina and Islais Creek at the same time. Streets, parks and
the shoreline come with it.

**It does not give buildings.** At 1:24,000 individual houses are not on the sheet.
Say so on the page.

### 3. Scope — do not yet build — the 1950 Sanborn edition, one neighbourhood — *one week to a decision, several to a layer*

The Library of Congress holds **45 SF volumes and 3,416 sheets, 1886–1950, in the
public domain and free to reuse in the Library's own words**, and the 1950 edition
is 12 volumes and 1,009 sheets covering the whole city. It is the only source in
this survey that can draw the *outline of a building that is gone*.

**Scope it as one neighbourhood on one edition and stop there** until the result
is on screen. The published method (Kim et al. 2023, F1 ≈ 0.9 for footprint and
construction material) is a workflow for other cities, not an SF dataset — the
first honest deliverable is a measured extraction rate on ten sheets, not a city.
If ten sheets come back at F1 ≈ 0.9 the project is worth the several weeks; if they
come back at 0.5, that is a cheap no and it is the answer to a question this
project has now asked three times in three documents.

---

## 9. Costed and rejected, so it is not proposed again

| candidate | why not | evidence |
|---|---|---|
| **DPW annual reports as a street-acceptance register** | It is not one. `"streets accepted"` appears **once in eight volumes**, `"street acceptance"` **zero times**, against 136–266 acceptance items per year in the Board's Journal | §4.4 |
| **`abvp-arbf.dateaccepted` as a street year** | **96.3 % of the file is one ordinance on one day**, 1998-05-01 | §4.1 |
| **`qvu5-m3a2.demolition` to extend the demolition record** | All 1,278 flagged projects opened in **2000 or later**. It does not reach behind DBI's 1983 | §7 |
| **1938 / 1948 aerials** | **CC BY-NC-SA 3.0** on the only scanned, accessible copies — the sole NC dependency this project would have — and ~1 m B&W vertical gives presence, not form | §6.7 |
| **City directories** | Occupancy by address, not geometry. Right for a fiche, wrong for the fabric | §6.8 |
| **`x5tj-txci` for the freeway decks** | It names **61 vehicular bridges, 3 tunnels, 3 movable bridges** and publishes **no height and no date**. It identifies the structures `DATA-TRUTH.md` §19 wanted and measures none of them | §3 |
| **`acdm-wktn.date_map_add` as a parcel age** | Dates the 1984 digitisation, not the parcel | §5.3 |

---

## 10. Method, and what this survey did NOT check

* Everything was measured against `data.sfgov.org`, `www.loc.gov`,
  `archive.org` and `prd-tnm.s3.amazonaws.com` on **2026-08-25**. Row counts and
  min/max were taken with SoQL aggregates against the live API, not from the
  catalogue metadata, because the catalogue metadata is stale on several datasets.
* **The class-A sweep is a floor, not a census.** A systematic pass over all **663**
  datasets on data.sfgov.org, filtering for a locator column plus a
  non-housekeeping date or year column, returned **58**. That pass **misses**
  `i98e-djp9`, `tkzw-k3nq`, `abvp-arbf`, `g8m3-pdis`, `qvu5-m3a2` and `nqyt-nfmd`
  — all six of which are in this document — because Socrata's catalogue index does
  not carry column types for every dataset. The registers here were found by
  targeted search *and* by that sweep; there may be more.
* **The 1998→2020 parcel delta uses two of the fifteen editions.** So does the
  2007→2025 roll delta, out of nineteen. Both are lower bounds by construction.
* **The DPW annual reports were sampled at eight volumes out of 68 years.** The
  keyword counts are decisive for those eight and the contexts were read for one
  (1955). Someone claiming a register hides in the other sixty should sample more
  before spending a fetch on it.
* **Nothing here was joined to the shipped chunks except `abvp-arbf`**, which was
  joined on `cnn` to this pipeline's own `geo/cache/streets.json` (17,170 rows) to
  establish the provenance of `3psu-pn9h.accepted`.
* **No licence was inferred.** Where a dataset states none, this document says
  **"(none stated)"** — seven of the fifteen parcel editions and `nqyt-nfmd` among
  them — and treats that as a question for Planning rather than as permission.
