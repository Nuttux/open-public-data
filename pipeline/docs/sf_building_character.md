# Can a building look like itself?

**D2 — research + feasibility, 2026-08-24. Branch `refactor/paris-parity`.**

The question, in Daniel's words:

> "Right now buildings have a template for their look. Is there any satellite or archival
> images or archive software satellites from back in the day that can make the buildings look
> individually way closer to what they actually look like (still remaining in the artistic
> direction)?"

## What the renderer knows today

`website/src/components/us/city/palette.ts` is explicit about it. Every one of the **166,166**
drawn footprints gets its wall and roof colour from exactly four published columns.

(A note on the two counts. The brief says 150,905 and that is right for one of them:
`manifest.json` `buildings.n` is **166,166** and `buildings.nSolo` is **15,261**, so 150,905 is
the number that live in `bldg` cells and 15,261 are solos drawn at every zoom from `base/solo`.
Every coverage figure below is against the full **166,166**, because the attribute attaches by
`gid` and a solo is as much a building as its neighbour.)

| input | source | how it is used |
|---|---|---|
| use class (7 buckets) | roll `use_definition`, collapsed in `bldg/build_bldg.py` | row index into `UMAT_WALL` / `UMAT_ROOF` |
| `year_property_built` | roll `wv5m-vpq2` | year band (5) |
| `number_of_stories` | roll `wv5m-vpq2` | storey band (3) |
| median LIDAR height | footprints `ynuv-fyni` `hgt_mediancm` | height band (4), roof table only |

That is `[use][yearBand*3 + storeyBand]` for the wall and `[use][heightBand*2 + era]` for the
roof — **105 wall cells and 56 roof cells over the whole city**, resolving into 16 materials.
Plus the footprint outline and one height. Nothing else about a building reaches the screen.

So a Victorian on Alamo Square and a Dogpatch warehouse differ by: outline, height, and which
of 16 flat colours the table picked. That is the "template" Daniel is describing, and it is
correctly described.

**What is missing is not colour. It is silhouette.** No bay, no gable, no parapet, no pitch, no
storefront. The brief already records that the building solid is a bare prism (BRIEF §3).

---

## Source audit

*(filled in as each source is checked — coverage numbers are measured, not estimated)*

### 1. The assessor's secured roll — `wv5m-vpq2` (DataSF)

**Licence: Open Data Commons PDDL 1.0 (public domain). Already ingested. Cost to add: one
extra `$select` column.**

`bldg/fetch_roll.sh` today asks for eight columns. The dataset publishes **46**, and two of
the unfetched ones are form-bearing:

| column | what it is | measured coverage over the 166,166 drawn footprints |
|---|---|---|
| `property_class_code` | the assessor's building class (123 values in use, 145 defined) | **96.2 %** join a roll row; **94.91 %** carry a class that is a building |
| `construction_type` | insurance construction class A/B/C/D/S | 96.2 % join, but **84.6 % are `D`** (wood frame) |
| `lot_frontage`, `lot_depth` | parcel frontage in feet | present on most `D`/`F` parcels |
| `basement_area` | ft² below grade | garage-at-grade signal |

Measured with `pnjoin.resolve_pn` — the same key `build_bldg.py` uses — against the same
`parsed.pkl` and the same keep filter (`MIN_H` 2 m, `MIN_AREA` 20 m²), so the 166,166 is the
encoder's own 166,166, not a lookalike.

**`construction_type` is nearly worthless on its own**: 84.6 % `D`, 6.9 % `NA`. It separates
downtown (`A` steel-frame 547, `B` reinforced concrete 813, `C` masonry 4,546) from the rest
and nothing else. Four buckets, one of which is 85 % of the city.

**`property_class_code` is the find.** Measured distribution over the drawn footprints:

```
 97,274  58.54%  D      Dwelling                    the SF single house
 18,954  11.41%  F      Flats & Duplex              two- and three-flat, full-width bay
  7,992   4.81%  Z      Condominium                 modern, flat
  6,617   3.98%  A5     Apartment 5 to 14 Units
  4,829   2.91%  A15    Apartment 15 Units or more
  4,445   2.68%  A      Apartment 4 units or less
  2,801   1.69%  C      Commercial Stores
  2,508   1.51%  FS     Flat & Store 4 units       <- STOREFRONT AT GRADE, published
  1,991   1.20%  I      Industrial
  1,252   0.75%  O      Office
    678   0.41%  DA     Dwellings - Apt
    638   0.38%  FS5    Flat & Store 5 to 14 units <- storefront
    605   0.36%  W      Churches, Convents, Rectories
    486   0.29%  DD     2 Dwellings on 1 Parcel
    387   0.23%  H2     Hotels - Other
    323   0.19%  EG     Schools
    212   0.13%  G      Garages (Commercial)
    199   0.12%  S      Gas Station
    159   0.10%  IW     Industrial Warehouse
    144   0.09%  TH     Town House
  6,314   3.80%  <no roll row>                      the honest bucket
```

This is the only source examined that names, per parcel, that a building **has a shop on the
ground floor** (`FS`/`FS5`/`FS15`/`F2`/`AC`/`CM`, 3,146 footprints), that it is a **church**
(605), a **theatre**, a **gas station**, a **warehouse**, a **garage**. Those are silhouettes,
not colours.

### 2. OpenStreetMap — measured, and it is dead

Overpass, SF bbox `37.700,-122.520,37.835,-122.350`, ways + relations, 2026-08-24:

| tag | ways carrying it |
|---|---|
| `building=*` (yes/house/residential/apartments alone) | 166,296 |
| `height` | 142,453 |
| `roof:shape` | **317** |
| `building:material` | **419** |
| `building:colour` | **103** |
| `start_date` | 118 |
| `architect` | 38 |

SF's OSM buildings are a bulk import of the city's own footprint file, so the count matches and
the `height` column is the same LIDAR the renderer already has. The form tags are hand-drawn by
mappers and there are **three hundred of them in a city of 166,000**. 0.19 % coverage.
Licence would also be ODbL, which is share-alike and a different licence from everything else
in this project. **Rejected on coverage, not on licence.**

### 3. SF Survey / SF Cultural Heritage (Arches) — the field Daniel is asking for exists

The Planning Department's Citywide Cultural Resources Survey publishes at
`https://sfculturalheritage.org` on **Arches** (Getty Conservation Institute / World Monuments
Fund, open source). It is public, unauthenticated, and carries **154,674 "Survey Unit"
resources**, one per parcel, against ~163,272 parcels citywide.

The Survey Unit graph (`aacb7716-e11d-11ec-bb77-e37ec032dc2b`) has exactly the nodes the brief
is asking for, by name:

```
aacb77b0-…  concept-list   architectural_style_s_        Architectural Style(s)
aacb77ad-…  concept-list   roof_form_s_                  Roof Form(s)
aacb7791-…  concept-list   roof_material_s_              Roof Material(s)
aacb77a4-…  concept-list   cladding_type_s_              Cladding Type(s)
aacb779f-…  concept-list   typology                      Typology
aacb779e-…  concept-list   entrance_configuration_s_     Entrance Configuration(s)
aacb775f-…  concept-list   window_type_s_                Window Type(s)
aacb7756-…  concept-list   architectural_detail_s_       Architectural Detail(s)
aacb776e-…  concept-list   additional_structure_s_       Additional Structure(s)
aacb77a5-…  concept        number_of_stories_detail      Number of Stories Detail
aacb779d-…  string         character_defining_features   Character-Defining Features
aacb77af-…  file-list      straight_on_photographs       Straight-On Photographs
```

Access, all verified live:

* `GET /search/resources?resource-type-filter=[{"graphid":…}]&paging-filter=1` → JSON, 200/page
* `GET /resources/<uuid>?format=json` → the full report incl. APN — **200, no auth**
* `GET /search/export_results?…&format=tilecsv` → a ZIP containing one flat CSV whose columns
  are the node names above plus `APN`, `Neighborhood`, `Geometry`, `resourceid` — **200, no auth**
* a `term-filter` on a bare APN string returns exactly the one Survey Unit for that parcel

**Note the caveat that decides everything: the survey is phased.** The schema is citywide; the
*content* is not. A Mission parcel pulled at random came back with every physical-description
field empty. Coverage of the populated fields is being measured next and the number, not the
schema, is what this recommendation turns on.

`advanced-filter` with `op: not_null` is silently ignored by this instance (it returns the
unfiltered total for every node), so coverage cannot be counted server-side — it has to be
exported and counted.

**Measured, 300-parcel random sample of the shipped footprints (seed 12345), each parcel looked
up by APN and its Survey Unit report fetched — 287 usable, 11 parcels have no Survey Unit:**

| field | populated | of usable |
|---|---|---|
| Property Type | 287 | 100.00 % |
| Construction Type(s) | 272 | **94.77 %** — but this is the assessor's own wood/masonry, re-ingested |
| Architectural Style(s) | 17 | **5.92 %** |
| Typology | 17 | **5.92 %** |
| Roof Form(s) | 1 | **0.35 %** |
| Roof Material(s) | 1 | 0.35 % |
| Cladding Type(s) | 1 | 0.35 % |
| Entrance Configuration(s) | 1 | 0.35 % |
| Window Type(s) | 1 | 0.35 % |
| Architectural Detail(s) | 1 | 0.35 % |
| Number of Stories Detail | 0 | 0.00 % |

The seventeen styles that came back are real and specific — Classical Revival ×5, Mediterranean
Revival ×3, Streamline Moderne ×2, Stick-Eastlake, Queen Anne, Italian Renaissance Revival,
Midcentury Modern, Late Modern, Contractor Modern, Contemporary/Art Deco. The seventeen
typologies likewise — Mixed-Use ×6, Attached Single-Family ×4, Flat ×3, Apartment ×2.

**So: 5.9 % ± ~2.7 pp (95 % CI, n=287) for style; extrapolating, ~9,800 of 166,166 buildings.**
That is real and it is not nothing. It is not a citywide answer, and **roof form at 0.35 % is
nothing at all.**

Two further practical blocks:

* `search/export_results?format=tilecsv` returns 200 for a single parcel and **HTTP 500 for
  `total=2000`**. There is no bulk path; harvesting 154,674 units means ~309,000 HTTP requests
  (one search + one report each). That is a background harvest over days, not a day of work.
* Licence is not stated on the platform. Planning's DataSF layers are PDDL; sfculturalheritage
  .org carries no licence notice, so a citywide ingest would need to be asked for rather than
  assumed.

**Verdict: the best *field* in San Francisco, at the worst *coverage*. Correct as a phase-two
overlay that names ~6 % of buildings by their real style; wrong as the thing that makes the
city stop looking like a template.**

### 4. Sanborn fire-insurance atlases — scans, not data

The 1905 six-volume SF atlas (SFPL's copy, scanned by David Rumsey with SFPL) is online at
full resolution, and it does carry, drawn, exactly what is wanted: construction material by
colour wash, storey counts as numerals, bay/porch outlines, and the footprint itself. Editions
run 1887–1950.

There is **no machine-readable SF derivative.** The state of the art is a 2023 PLOS One method
paper (Kim et al., "Creating building-level, three-dimensional digital models of historic urban
neighborhoods from Sanborn Fire Insurance maps using machine learning") which reports F1 ≈ 0.9
for footprint + construction material — a *workflow*, applied to other cities, not a published
SF dataset. Building it for SF is a multi-week CV project across several hundred plates.

Licence is also the wrong shape: David Rumsey's scans are **CC BY-NC-SA 3.0**, with commercial
use by arrangement. Derived vectors from an NC-SA source would be the only NC-encumbered thing
in the project. (The plates themselves are long out of copyright; the *scans* are what carries
the licence, so a clean-room re-scan from SFPL or LoC would sidestep it — LoC's Sanborn
collection is public domain. That is a real option, and it is still a multi-week option.)

**Verdict: the richest historical source and the most expensive. Not a day. Keep it as the
named plan for pre-1906 character, where nothing else can reach.**

### 5. Historical aerial imagery — presence, not form

* **UCSB FrameFinder** — the world's largest aerial collection, 2.5 M frames, ~90 % California,
  1924–2010; >400,000 searchable online. The 1938 SF flight is 164 large-format B&W verticals;
  the published composite is "generally better than one metre". On-demand scanning ended
  2024-06-14 and is being replaced by free bulk digitisation.
* **USGS EarthExplorer** — public domain, but SF single-frame coverage is coarser and sparser
  than UCSB's.

One metre per pixel, from vertical, in black and white, is enough to see **that** a building is
there and roughly how big. It is not enough to say "bay window" or "gable versus parapet" —
those are 1–3 m features whose only vertical signature is a shadow line. Extracting a per-
building form attribute from a 1938 vertical is a research project with an unknown answer, for
166,166 buildings.

**What an aerial *can* do at reasonable cost is presence** — which buildings existed in 1938 and
are gone. That is a different question and another agent's. Flagged, not taken.

**And the modern-satellite half of Daniel's question is already answered inside this repo.**
`encode_city_chunks.py` publishes `paintIdx`/`paintFlag`, the **per-building median roof colour
sampled from Esri World Imagery**. `manifest.json` `buildings.paintSampled` is **166,042 of
166,166 — 99.93 %** (and 163,480, 98.4 %, carry none of the three quality flags at all). The
brief records that only **2,403 (1.6 %)** of it reaches the screen. There is a 98-point gap
between a satellite measurement this project already owns and what the renderer draws. Fixing
that plumbing is worth more, per hour, than any new source in this document — and it is not this
agent's file.

### 6. Planning's landmark and status registers — small, precise, already usable

| dataset | rows | what it gives |
|---|---|---|
| `3tsw-4idn` Historic Resource Status by Parcel | 163,272 parcels · **100 %** | CEQA status only: A 24,476 (15.0 %), B 119,333 (73.1 %), C 19,463 (11.9 %). A* (Article 10/11 listed) 2,522. **Status, not form.** |
| `97yj-54sx` Article 10 Landmarks | 370 | named landmark + designation document + photo URL |
| `6m3x-8fu4` Article 11 Ratings | 786 | C-3 downtown only: I 217, II 40, III 53, IV 175, V 301 |
| `63x5-g3m4` Historic Districts | 204 | district polygons |

All PDDL / US public domain. None of them names a roof shape or a bay. `3tsw-4idn`'s "A" is
usable as a *permission to ornament* — 15 % of parcels the city itself calls a historical
resource — but it says nothing about which ornament.

### 7. The Internet Archive municipal series — city-owned buildings only

Already mined by `pipeline/scripts/us_sf_places/`. Municipal Reports and DPW annual reports
describe city structures in prose: material, storeys, roof. The corpus is the wrong shape for
this question — it covers the few hundred buildings the city owned, one at a time, in text.
It is the right source for the ~171 places already carrying fiches and the wrong one for
166,166 footprints.

---

## The recommendation

**Ship the assessor's `property_class_code` as an eleven-archetype character byte per building.**
It is the only source in this audit that is (a) already joined, (b) public domain, (c) above
90 % coverage, and (d) form-bearing rather than merely descriptive.

Written: `pipeline/scripts/us_sf_city/build_building_character.py`. New file, no existing
pipeline or renderer file touched.

```
python3 pipeline/scripts/us_sf_city/build_building_character.py --report   # measure, write nothing
python3 pipeline/scripts/us_sf_city/build_building_character.py           # -> char/char-data.js
```

### What it measured, run 2026-08-24

```
roll rows with a parcel key: 211,547   published class codes: 145
index alignment PROVEN over all 166,166 records (0 height-byte mismatches)

   0 unknown             8,450    5.09%
   1 house              97,682   58.79%
   2 flats              21,252   12.79%
   3 flat_over_store     3,559    2.14%
   4 apartment          16,382    9.86%
   5 condo               8,293    4.99%
   6 storefront          3,289    1.98%
   7 office              1,499    0.90%
   8 industrial          3,169    1.91%
   9 hotel                 712    0.43%
  10 institution         1,879    1.13%
  NAMED                157,716   94.91%

why a building is `unknown`
  no 2025 roll row for the parcel                6,314
  roll row, blank property_class_code                0
  class is a vacant / under-water / TDR parcel   2,136
  class code not in CLASS_ARCH                       0
```

**Zero unmapped codes and zero blank codes** — the 145-entry table covers every class the roll
actually uses on a drawn footprint, so nothing falls through by accident.

### Index alignment — the thing that could have gone silently wrong

`gen/bldg-data.js` carries no parcel key; `build_bldg.py` drops `pn` before it emits. A per-
building attribute can therefore only be attached **by index**, and the index is a Hilbert sort
over a filtered set. This script does not re-implement that sort. It imports
`form/reindex.py` (Block C), which reproduces the order and carries the identity columns, and it
re-runs Block C's own proof: **re-derive the quantised height byte for all 166,166 records and
assert each equals the shipped `BLDG.h` stream element for element.** Zero mismatches. On a
single mismatch the script raises and writes nothing rather than emitting a shifted array.

The encoder already publishes that index as `gid` (`kinds.bldg.fields`, u32, provenance
`bldg_index`), so the renderer reads a building's archetype with one array lookup and no new
join.

### Payload cost

| | bytes | gzip -9 |
|---|---|---|
| `arch` u8 × 166,166 | 166,166 | **34,591** |
| `flag` u8 × 166,166 | 166,166 | 4,597 |
| both | 332,332 | **39,633** |

Against a `bldg` tier of 1,929,486 gzipped bytes that is **+2.05 %**, and it will compress
better still once the encoder splits it per cell, because Hilbert order already puts a
residential block's 40 identical `house` bytes next to each other. `flag` is optional — it
exists so the page can *count* its unknowns rather than hide them.

### Is it actually spatially structured, or is it noise?

If the archetypes were scattered uniformly the map would gain texture and lose legibility. They
are not. Over a 150 m grid, 4,799 occupied cells, share of each archetype living in its own top
20 cells (uniform would be 0.4 %):

```
  house             n= 97,682   top20 =  1.7 %     everywhere, correctly
  flats             n= 21,252   top20 =  3.9 %
  condo             n=  8,293   top20 =  6.6 %
  apartment         n= 16,382   top20 =  8.2 %
  flat_over_store   n=  3,559   top20 =  9.4 %     the commercial corridors
  institution       n=  1,879   top20 =  9.5 %
  storefront        n=  3,289   top20 = 10.1 %
  industrial        n=  3,169   top20 = 10.9 %     Dogpatch / Bayview / India Basin
  office            n=  1,499   top20 = 17.2 %     the Financial District
  hotel             n=    712   top20 = 25.8 %     Union Square / Tenderloin
```

That is the shape you want: the mass class is uniform and the rare classes are corridors and
districts. **Turning this on gives the city neighbourhood character, not confetti.**

### The output contract, for whoever wires the renderer

`scratchpad/sf-city-anim/char/char-data.js`, one `window.CHAR = {…}` assignment, the same shape
as every other mock payload, so `_srcload.load("char/char-data.js", "CHAR")` reads it with no new
machinery:

```
n          166166
archNames  ["unknown","house","flats","flat_over_store","apartment","condo",
            "storefront","office","industrial","hotel","institution"]
arch       base64 u8[n]   the archetype, indexed by gid
flag       base64 u8[n]   0 ok · 1 no roll row · 2 blank class · 4 not a building · 8 unmapped
flagBits   the names of those bits, travelling with the column
counts     per-archetype totals
meta       MEASURED / LICENCE / DECLARED / NOT_MEASURED / FALLBACK / INDEX
```

### §8 — what each archetype is *expected* to change on screen

This is the part that decides whether the byte was worth fetching. Eleven names are only worth
having if they resolve to silhouettes a viewer can tell apart at block zoom. The proposal, for
the renderer agent to accept or argue with — **none of it is implemented here, and this file
asserts none of it as data**:

| # | archetype | n | what the record supports drawing |
|---|---|---|---|
| 1 | house | 97,682 | the base case — one prism, raised entry line. Differentiate *within* it with the year and storey columns already shipped, never with a new claim. |
| 2 | flats | 21,252 | full-width projecting bay over the whole street face; flat cap with a cornice line |
| 3 | **flat_over_store** | 3,559 | **a glazed band at grade** across the street face, dwelling storeys above. The single most legible change in the list. |
| 4 | apartment | 16,382 | regular window grid, flat parapet, no bay |
| 5 | condo | 8,293 | flat, plain, no cornice — the post-1960 read |
| 6 | storefront | 3,289 | low, wide, glazed at grade, parapet sign band, no dwelling storeys |
| 7 | office | 1,499 | flat cap, plinth at grade, tall proportion |
| 8 | industrial | 3,169 | long low mass, gable or sawtooth end, no fenestration rhythm |
| 9 | hotel | 712 | tall slab, dense regular grid, ground-floor canopy line |
| 10 | institution | 1,879 | gable or portico, deeper setback, a roof that is not flat |
| 0 | unknown | 8,450 | **exactly what the city draws today.** Not a twelfth look. Not randomised. |

Six of those eleven are structurally different silhouettes rather than different colours:
`flat_over_store`, `storefront`, `industrial`, `institution`, `hotel`, `flats`. Together they are
**33,860 buildings, 20.4 % of the city**, and they sit on the corridors and in the districts a
viewer actually looks at.

---

## What was rejected, in one table

| source | field it would give | coverage over the 166,166 | licence | verdict |
|---|---|---|---|---|
| roll `property_class_code` | 145-value building class | **94.91 %** | PDDL 1.0 | **shipped** |
| roll `construction_type` | A/B/C/D/S | 96.2 % joined but 84.6 % is one value | PDDL 1.0 | separates downtown masonry from the rest and nothing else; a cheap second byte if ever wanted |
| SF Survey (Arches) `Architectural Style(s)` | the real style name | **5.9 %** (n=287) | unstated | phase two — the best field, the worst coverage, and no bulk export (HTTP 500 at 2,000 rows) |
| SF Survey `Roof Form(s)` | gable / hip / flat | **0.35 %** | unstated | no |
| OpenStreetMap `roof:shape` | roof shape | **317 ways, 0.19 %** | ODbL | no |
| Sanborn 1887–1950 | material, storeys, bay outlines, drawn | high, on paper | CC BY-NC-SA (Rumsey scans) / PD (LoC) | multi-week CV project; the only path to pre-1906 character |
| historical aerials (UCSB, USGS) | presence; ~1 m B&W vertical | good | PD / free | gives *presence*, not form. Another agent's question. |
| `3tsw-4idn` CEQA status | A/B/C historical-resource status | 100 % of parcels | PDDL 1.0 | permission to ornament, not which ornament |
| Article 10 / Article 11 registers | named landmarks, C-3 ratings | 370 / 786 | PD | already covered by the landmark path |
| IA municipal series | prose descriptions | a few hundred city buildings | PD | right for `places`, wrong for 166,166 footprints |

## The thing worth more than any of it

`encode_city_chunks.py` already publishes `paintIdx` — the **per-building median roof colour
measured from Esri World Imagery**, present on **166,042 of 166,166 buildings — 99.93 %**
(`manifest.json` `buildings.paintSampled`). The brief records that **2,403 (1.6 %)** of it
survives to the screen. Daniel asked whether satellite
imagery could make buildings look like themselves; for roofs, this project already measured it,
and 98 points of it are being dropped somewhere between the chunk and the canvas. That is not
this agent's file, and it is the largest single win in the building pass.

## Follow-up 1 was OVERTAKEN — read this before wiring anything

**2026-08-28.** Follow-up 1 below is stale and acting on it would ship a second copy of a
column that is already on the wire. Recorded here rather than deleted, because the reasoning
in the audit above is still right — it is the *conclusion* that events moved past.

`encode_city_chunks.py` already publishes the `face` tier, and `_facade_prov()` names its
source in the encoder's own words:

> `"ty": src("fac_ty", dataset="wv5m-vpq2", … what="property_class_code read as nine building
> types; 147,601 of 166,166 (88.8 %)")`

Measured against the shipped `facade-data.js`, `ty` names **94.97 %** of the drawn footprints
(only `UNCLASSED` 5.03 % falls through) — the same column, at the same coverage, as
`char-data.js`'s 94.91 %. It ships alongside `shop`, the ground-floor-retail bit, and `role`,
the per-edge front/back/party stream. So the assessor's building class **already reaches the
renderer**, and has since the facade block landed.

**What was actually missing is what this file's own headline said: `What is missing is not
colour. It is silhouette.`** `ty` was driving the facade TILE — a wall texture with a window
rhythm — and nothing about the building's shape. The solid underneath stayed a bare prism.

**Shipped instead, 2026-08-28: the bay window as geometry.** `website/src/lib/citygl/
bay-form.ts`, wired into `layers/buildings.ts`, on the rule `lib/city/facades.ts` `faBayOK`
already published — a HOUSE or FLATS, on a measured FRONT edge, built before 1925, more than
one storey. **32,562 footprints eligible, 30,186 frontages built** (the shortfall is the
length and plan gates). No pipeline change of any kind: every input was already published.

The one design decision worth carrying forward is which way the bay is built. `ynuv-fyni` is
an aerial-derived outline, and what an aerial traces on a bayed San Francisco house is the
BAY'S OWN EDGE — so the measured ring is the plane of the bay face, not of the wall behind it.
The bays therefore reach the ring and **the wall between them steps back**, which draws the
same solid the survey measured instead of adding 0.75 m the survey denies. Verified on 800
random eligible footprints: the recess lands inside the measured ring 800/800.

## Follow-ups, in order

1. ~~**Wire `char-data.js` into the encoder**~~ — **DO NOT.** Redundant with `face.ty`; see
   above. `char-data.js` remains useful only as a *different grouping* (eleven archetypes
   against nine types, splitting `flat_over_store` and `condo` out) if a treatment ever needs
   that split. It is not new information.
2. **Find where 98.4 % of `paintIdx` is lost.** Bigger win, smaller change.
   **Done** — `components/us/city/scene.ts` now reads it: `if ((paintFlag[i] & noSampleBit)
   === 0) ri[i] = PAINT_C0 + paintIdx[i]`, and the GL path inherits it through the shared
   `legendTones` table.
3. **The other five silhouettes.** `flat_over_store` and `storefront` (glazed band at grade,
   parapet sign band), `industrial` (long low mass, gable or sawtooth end), `institution`
   (gable or portico), `hotel` (ground-floor canopy line). All five read off `ty`/`shop`,
   which are already loaded — the same shape of job the bay just was, and no new data.
4. **Harvest SF Survey styles** for the ~6 % that have one, as a *named* override on top of the
   archetype — one search + one report per APN, ~309 k requests, a background job over days. Ask
   Planning for the licence and for a bulk extract before building the harvester; they may simply
   hand over the table.
5. **Sanborn, for pre-1906.** The only source that can say what the city looked like before the
   fire, and the only one that has to be built rather than fetched. Re-scan from LoC (public
   domain) rather than deriving from the Rumsey CC BY-NC-SA scans.

## Provenance of every number in this file

| number | how it was got |
|---|---|
| 166,166 drawn / 150,905 in cells / 15,261 solos | `manifest.json` `buildings.n` = 166,166 and `buildings.nSolo` = 15,261; 166,166 − 15,261 = 150,905 |
| join rate, class distribution | `wv5m-vpq2` 2025 roll re-fetched with `property_class_code`, joined by `bldg/pnjoin.resolve_pn` against `bldg/cache/parsed.pkl` under `build_bldg.py`'s own keep filter |
| class definitions | `pa56-ek2h`, 145 rows, quoted verbatim in the script |
| SF Survey fill rates | 300 parcels drawn with `random.seed(12345)` from the same kept set; APN → Survey Unit → report JSON, live |
| OSM tag counts | Overpass `out count`, bbox `37.700,-122.520,37.835,-122.350`, 2026-08-24 |
| CEQA status counts | `3tsw-4idn` SoQL group-by |
| payload sizes | `gzip.compress(bytes, 9)` on the emitted arrays |
| spatial concentration | 150 m grid over the shipped ring origins, share in each archetype's own top 20 cells |
