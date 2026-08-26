# ADR-0012 — The city map as a modular system: where the line falls, and what a second city actually costs

**Status** : Proposed (2026-08-26)
**Décideur** : daniel
**Assessment scope** : `website/src/lib/city/*`, `website/src/lib/citygl/*`, `website/src/components/us/city/*`, `pipeline/scripts/us_sf_city/*`, `pipeline/minutes/*`, the `qc/1` chunk format, and `/us/city/sf/the-city{,-gl}`.
**Question asked** : *"what would it take to make the city map a modular system that can be brought to any city — and where exactly is the line between generic code and city- or format-specific code?"*

This ADR is an assessment. Nothing was built or refactored to produce it.

---

## 0. The finding that reorders the question

**The modularisation is already underway, it is called `lib/citygl/`, and it is enforced by a test rather than intended.**

`website/src/lib/citygl/` was started 2026-08-26 as a GPU rendering port. Its second stated rule (`PLAN.md` §0.2) is *"the engine has no city in it"*, and `engine-is-city-free.test.ts` greps the directory on every run and fails the build if a city's name, a city's data path, or a one-city landmark appears in compiled code. Everything the engine is allowed to know arrives through `CityDescriptor` — 58 lines — and through the target city's own `manifest.json`.

Measured against the same probe used everywhere else in this document, `lib/citygl/` scores **0 SF tokens across 1,767 lines of code**. Every other area of the subsystem scores non-zero.

That changes the shape of the answer. The question is not *"how would we make this modular"*. It is *"the line is being drawn right now by a rendering port; is it in the right place, and what does it still not cover?"* This ADR answers that, and its recommendation is deliberately narrow as a result.

The most important thing the city-free test has already produced is not compliance. It is discovery. `PLAN.md` Block 8a:

> Two constants in the Canvas version turned out to be facts about one city and were re-derived from the block table itself: the snap radius (half a named city's street standard → a tenth of the median block's root-area, which lands at 10.2 m against the hand-set 10.5 without being tuned to), and the march ceiling (a fixed 320 m → the pick grid's own sampled ground range). **That is what the city-free test is FOR: it does not just forbid a name, it surfaces the places where a number was really a name.**

Hold onto that sentence. It is the whole methodology, and §2 explains why no static measurement can substitute for it.

---

## 1. What the existing convergence architecture already solves — and why none of it reaches the map

This must be said plainly before anything is proposed, because the repo runs four places and it would be wrong to treat this as greenfield.

**Already solved, and genuinely:**

| contract | where | what it buys |
|---|---|---|
| Place registry | `website/src/data/places.json` | nav, sitemap, routing read one manifest; deleting a row makes a place vanish cleanly (ADR-0010 D2) |
| Schema families | `fr-commune`, `fr-national`, `us-federal`, `us-municipal`, `br-municipal` | page clients + dbt models belong to a family, not a city; Marseille reuses Paris `*Client`s parameterised by `city` |
| Export data contract | every JSON under `public/data/` | `generated_at`, `source_pipeline`, per-value `source`/`source_url`, `as_of` |
| Protocol adapters | `sync_socrata.py`, `sync_ckan_dataset.py`, `sync_fiscaldata.py` + `pipeline/configs/countries/*.yaml` | DataSF is a Socrata config entry; Recife is a CKAN config entry; no per-city ingestion scripts |
| Shared presentation | `components/landing/`, `components/places/`, `components/fusion/` | Paris and SF render the same `<Landing>`; Paris *lieux* and SF *places* run one explorer over thin adapters |
| Budget convergence | ADR-0011 macros | shared logic without a false shared table |

**And none of it applies to the map.** Not partially — structurally:

- **The map is not registered.** The `sf` row in `places.json` carries `"modules": []`. `/us/city/sf/the-city` is hand-wired in the route tree. The map bypasses contract #1 entirely.
- **The map does not flow through raw → stg → core → mart.** ADR-0001 layering governs money. The map's inputs are geometry, elevation rasters and OCR'd text. There is no `dbt_us_*` model behind a single pixel of it. `encode_city_chunks.py` reads its inputs from disk and writes binary chunks — the pipeline's central rule does not reach here, and it is not obvious that it should.
- **ADR-0010's unit of reuse does not fit.** A schema family is an *accounting* vocabulary — M57 chapitres, fund/character/object, empenho/liquidação. The map consumes none of these. Two cities in the same schema family (SF and a hypothetical Ventura) could have completely different map feasibility, and two cities in different families (SF and Paris) could have similar. **Schema family does not predict map portability.** That is not a flaw in ADR-0010; it is evidence that the map is a fourth thing the three contracts were never written for.
- **The export contract is the one that does carry over**, and the map already honours it: `manifest.json` carries a per-field `provenance` map naming the publisher and dataset id for every column of every chunk kind. This is the healthiest seam in the subsystem and §3 builds on it.

**Conclusion for §1:** the convergence architecture solves *money at many scales*. The map is *ground and record*. Reusing the former's contracts for the latter would be cargo cult. The map needs its own contract, and it is `CityDescriptor` + `manifest.json`, not `places.json` + schema family.

---

## 2. The measured split — and why the honest headline is a range, not a percentage

### 2.1 First, the number that raw `wc -l` gets wrong

This subsystem is unusually prose-heavy. Counting raw lines overstates the code by roughly 40 %.

| area | total lines | **code** | comment/docstring | blank |
|---|---:|---:|---:|---:|
| `lib/city/*.ts` (non-test) | 21,260 | **11,094** | 9,103 | 1,063 |
| `components/us/city/*` (non-test) | 13,658 | **8,018** | 4,964 | 757 |
| `pipeline/scripts/us_sf_city/*.py` | 14,511 | **9,540** | 3,550 | 1,421 |
| `lib/citygl/*.ts` (non-test) | 3,800 | **1,767** | 1,155 | — |
| `pipeline/minutes/*.py` | 434 | **291** | 85 | — |
| route (`the-city{,-gl}`) | 781 | ~600 | — | — |
| **subsystem code total** | | **≈ 31,300** | | |

Alongside it: **25,995 lines of design documentation** (`DRAW.md` alone is 10,273), **5,351 lines of tests**, and **14,489 lines of hand-curated TSV** (`moves_*.tsv` — block gains and losses read out of the minutes, one row per stated move).

### 2.2 The lexical measurement, and why it is a floor and not the answer

`scratchpad/port/measure_split.py` strips comments and counts code lines carrying an SF proper noun, an SF neighbourhood, or one of the ten DataSF dataset ids.

| area | code | SF-token hits | % |
|---|---:|---:|---:|
| `lib/city` (renderer core) | 11,094 | 153 | 1.4 % |
| `lib/citygl` (city-free engine) | 1,767 | **0** | **0.0 %** |
| `components/us/city` (page + scene) | 8,018 | 15 | 0.2 % |
| `pipeline/scripts/us_sf_city` (build) | 9,540 | 183 | 1.9 % |
| `pipeline/minutes` (record adapters) | 291 | 5 | 1.7 % |

And 123 of `lib/city`'s 153 hits are in **one generated file** — `place-kinds.generated.ts`, a stopgap data table whose own header states its deletion condition.

**Do not quote the 1 % figure as the answer. It is wrong in the direction that flatters.** A lexical grep cannot see:

- a snap radius of 10.5 m that is half San Francisco's street standard (found by hand, Block 8a);
- a march ceiling of 320 m that is a fact about SF's terrain range (same);
- `VZ_T0 = 2.9`, the tree-promotion threshold, which the street layer was gating on **because it happens to equal `ZSTEPS[1]` at this city's numbers** (`SHELL.md` §13.3 — *"a layer that asks another layer's constant whether it should draw is not gated, it is coincident"*);
- `cityBBoxByBand`, three byte-identical bounding boxes, where `SHELL.md` §13.2 states the code path is *"arithmetically inert at San Francisco's numbers"* and that *"a different tilt, a taller DEM or another city makes it bite."*

None of those four contains a single SF token. Three of the four were found only by a human reading the code with the question in mind, and the fourth by a test that forced the question.

### 2.3 The split, measured per area

Two independent classification passes went file-by-file, assigning code lines (not raw lines) by reading each file's constants and asking *"if I swap SF for city N, does this change nowhere / only in a constants block / everywhere?"*

**Frontend — `components/us/city/` (page, scene, renderer, panel):**

| file | code | (a) generic | (b) SF constants | (c) irreducibly SF |
|---|---:|---:|---:|---:|
| `renderer.ts` | 765 | **765** | 0 | 0 |
| `scene.ts` | 2,550 | ≈2,495 | ≈45 | ≈10 |
| `CityBlockPanel.tsx` | 1,183 | ≈605 | **≈420** | ≈158 |
| `CityFilm.tsx` | 808 | ≈762 | ≈16 | ≈30 |
| `film-draw.ts` | 725 | ≈486 | ≈11 | **≈228** |
| `block-records.ts` | 665 | ≈125 | ≈60 | **≈480** |
| `CityMap.tsx` | 634 | ≈594 | ≈40 | 0 |
| `CityScrub.tsx` | 472 | ≈429 | ≈18 | ≈25 |
| `palette.ts` | 130 | ≈45 | ≈85 | 0 |
| `CityEntry.tsx` | 77 | **77** | 0 | 0 |
| **total** | **8,009** | **≈6,383 (80 %)** | **≈695 (9 %)** | **≈931 (12 %)** |

`renderer.ts` — the entire pointer/wheel/key/touch state machine, rAF loop, canvas slots, band cross-fade and blit — contains **no hex, no year, no place name and no URL** in its code lines. `onPick(blockIndex)` is a bare integer. It is the single most portable file in the subsystem and it is 765 lines.

**Build side — `pipeline/scripts/us_sf_city/` (raw lines, 14,511):**

| bucket | lines | share | what |
|---|---:|---:|---|
| (a) generic ETL | **421** | 2.9 % | `_chunk.py` (the `.qc` container), `_bldgsrc.py` (delta codec), `verify_order_independence.py` |
| (b) generic-in-shape | 10,620 | 73.2 % | the encoder, the verifier, the block/hood facts, the whole minutes cluster |
| (c) irreducibly SF | 3,470 | 23.9 % | the film (1,358 + 704 + 239), the fire losses, the nine `diag_*` investigations |

**Read that 73 % sceptically — it is the softest label in the document, and the classifying pass said so itself.** `encode_city_chunks.py` is "generic" only in the sense that tiling arrays into chunks is generic. It has **20 `encode_*` functions**, each bound to one SF payload with one field layout, and `verify_city_chunks.py` mirrors it function-for-function. A defensible stricter reading moves both to (c) and gives **(a) 3 % / (b) 48 % / (c) 49 %**.

**Take the stricter reading.** The optimistic one measures the shape of the code; the stricter one measures what a port would actually have to rewrite.

### 2.4 The honest headline

| area | code | genuinely generic | generic-with-SF-constants | irreducibly SF |
|---|---:|---:|---:|---:|
| `lib/citygl` | 1,767 | **100 %** (test-enforced) | 0 | 0 |
| `components/us/city` | 8,009 | 80 % | 9 % | 12 % |
| `lib/city` (renderer core) | 11,095 | **84.4 %** | 14.2 % | **1.4 %** |
| `pipeline/scripts/us_sf_city` | 9,540 | 3 % | 48 % | 49 % |

*Method for `lib/city`: 844 declaration spans extracted with their attached doc comments (98 % coverage), each adjudicated as delete / re-value / reuse. Only the embedding line is charged when a generic function contains a magic number. **And 1,332 of the 1,576 (b) code lines are one generated file** — `place-kinds.generated.ts`, the stopgap with a stated deletion condition. **Excluding it, (b) is 244 code lines across 13 files.** Extremes: `data.ts` is 1,625 of 1,627 generic (grid and extents come from the manifest; the only SF is `DEFAULT_BASE`); `camera.ts` is 932 of 999 (`CityExtent` is injected — zero geography); `terrain.ts` 2,909 of 3,015. Against that, `time.ts` is 368 of 434 irreducible.*

*Corroboration rather than a fourth opinion: the GL port reuses `data.ts`, `projection.ts`, `labels.ts`, `film.ts` and `time.ts` **unchanged** inside a directory a test proves is city-free (`PLAN.md` §1). A classification pass says these files are portable; a passing test says it.*

**Across all three passes, roughly 400 code lines out of `lib/city`'s 21,260 file lines are actually San Francisco.** The pattern is consistent and it is the actionable finding: **the front of the pipe is portable and the back of it is not.** Rendering, camera, LOD, chunk transport and label placement are ~80–100 % generic. Ingestion, encoding and verification are ~50 % city-bound at best. **The map's portability problem is a data problem wearing a rendering problem's clothes.**

The (a)/(b) boundary is deliberately fuzzy **because it is not a static property of the code — it is a function of how much re-derivation work has been done**. Block 8a moved two constants from (b) to (a) in an afternoon. That is the point: (b) is not a wall, it is a backlog, and the city-free test is the tool that enumerates it.

### 2.5 What is irreducibly San Francisco

This bucket is small, and it is small in a way that matters.

| thing | where | lines (code) |
|---|---|---:|
| the 1906 burn line as a first-class chunk field (`burnLen`, `burnXY`, dataset `ff3a-iqhv`) | `manifest.kinds.coast`, `encode_city_chunks.py` | ~40 |
| `SCRUB_MIN = 1906` — **the year rail's floor is the fire** (*"the record resumes five days after the fire, so April 1906 is the earliest moment anything in this record can speak to"*) | `lib/city/time.ts:70` | ~30 |
| `YEARS_WITH_NO_VOLUME` — the 1911 Journal gap | `lib/city/time.ts:409` | ~10 |
| the fire-loss schedule (36 city structures, 33 geocoded, checksum $380,000) | `build_fire_losses.py` | 83 |
| the Board of Supervisors' *Journal of Proceedings* sweep, its header/placement rules and its four `moves_*.tsv` correction tables | `sweep_sfbos_all.py`, `sweep_modern_minutes.py`, `_sfbos_sweep.py`, `measure_stated_blocks.py` | ~1,700 code + 14,489 TSV |
| the 14 hero landmarks and 59 shaped caps (City Hall, Ferry Building, Coit Tower…) | `landmarks.ts`, `manifest.landmarks` | ~900 (form, not name) |
| `marketRot = -2.3509 rad` — Market Street's bearing, which splits SF's two street grids | `manifest.proj` | 1 |

**≈ 2,800 lines of code, plus 14,489 lines of curation.** Call it 9–11 % of the code. The curation is the larger cost and it does not appear in any code metric.

---

## 3. What a second city must supply — the contract

Read off `manifest.json` and `DATA-TRUTH.md` §0, which already states the lineage of every year the renderer draws. Every slot names the SF file that fills it and what happens when a city has none.

| # | slot | SF source | availability elsewhere | if absent |
|---|---|---|---|---|
| 1 | projection anchor (`lon0`, `lat0`, `cosl`) | `manifest.proj` | trivial anywhere | — |
| 2 | chunk grid (`cell`, `origin`, `nx`, `ny`) | `manifest.grid` | derived from bbox | — |
| 3 | terrain DEM | DataSF `6d73-6c4f` + USGS 3DEP | US: 3DEP national. EU: Copernicus DEM; FR: IGN RGE ALTI | flat ground; the hills are half the drama, but it degrades gracefully |
| 4 | coastline / hydrography | DataSF `txuc-3kzm`, Census TIGER | OSM everywhere | inland city: not needed |
| 5 | bathymetry | NOAA NCEI | US only; EMODnet in EU | flat water plane |
| 6 | **building footprints with height** | DataSF `ynuv-fyni`, **nine zonal LIDAR statistics** (`L=median, T=max, f=(mean−L)/(T−L)`) | **rare in this richness.** Footprints are global (OSM, Microsoft, Google); *per-building LIDAR height distributions* are not | flat-extruded boxes; the Ferry Building loses its clock tower — this exact failure is recorded in `project_sf_city_animation` |
| 7 | **building construction year** | DataSF `wv5m-vpq2` **Secured Roll 2025**, `year_property_built` | **a Californian artefact.** Many US counties publish an equivalent (NYC PLUTO `YearBuilt`, King County, Cook County). France: BDNB carries a construction period. **Not verified live for any of these — this is the first thing to check for any candidate, and the ADR does not assert it** | **the map has no time axis.** This is the load-bearing slot. Without it there is no century rail, and what remains is a 3D basemap |
| 8 | **parcel / block cadastre** | DataSF `acdm-wktn`, 5,404 blocks | US: universal (assessor parcels). EU: France `cadastre.data.gouv.fr` parcelles + IRIS; most EU states have a cadastre | the unit a decision attaches to disappears — see §4.2 |
| 9 | street centrelines | DataSF `3psu-pn9h`, 17,170 segments | universal (OSM at minimum) | — |
| 10 | **street right-of-way polygons + kerbs** | DataSF `h8n7-e4ns`, `emxt-b6yg` | **rare.** Most cities publish centrelines only | streets become lines with an assumed width; `PLAN.md` Block 6c already takes widths as a fraction of *the city's own published medians* rather than as metres, so this degrades by design |
| 11 | street trees with planting dates | DataSF `tkzw-k3nq`, 195,310 crowns | large US cities yes; elsewhere sparse | canopy layer off |
| 12 | roof colour | Esri World Imagery public tiles | **global** | palette from use class alone |
| 13 | use class + storey count | `wv5m-vpq2` again | with slot 7 | facades become blank walls |
| 14 | **the decision record, historical** | Board of Supervisors *Journal of Proceedings*, 157 vols, 1906–1999, 158,322 pages, IA-scanned | **see §4.1. This is the one that does not generalise.** | the map is a building-age map |
| 15 | **the decision record, modern** | the Clerk's own PDFs, `sfbos.org/sites/default/files/bag<MMDDYY>_minutes.pdf`, 390 files 2016-07→today, born-digital with a text layer | shape is generic (a URL template on a clerk's CMS, which most US clerks have had since ~2010); the template is per-city | ~10-15 years of record, no century |
| 15b | **Legistar** — the tempting shortcut | `pipeline/minutes/legistar.py`, `webapi.legistar.com/v1/sfgov`, 30,428 matters 2000-2018 | **the API is generic — Granicus serves many US cities and the client token is one string in a 77-line file — but it was EVALUATED AND REJECTED HERE, and the reason travels.** Measured, n=500: the extractor places **16.8 % of matters at all, 11.6 % at block precision**. Reading the full enacted body instead of the title does not improve it (16 %/12 %, n=51). **16.8 % is not a ceiling of the method — it is the share of Board legislation that concerns a specific place at all**; the rest is budget, code, contracts, settlements, appointments | a rail lit 2000-2018 and dark afterwards, which reproduces exactly the *"the city stopped deciding"* misreading the captions exist to prevent |
| 16 | street→place resolution | `pipeline/minutes/gazetteer.py`, 0.88 fuzzy cutoff against `3psu-pn9h` | generic in shape; needs that city's centrelines + a **sourced historical rename table** | silent mis-placement, not an error — the worst failure mode in the whole system |
| 17 | hero landmarks | 14 hand-modelled, 145 parts | hand work, per city | every building is a prism; Daniel's own verdict on that state: *"all buildings look kind of the same"* |

### 3.1 The screening order, and it is not the order you would guess

Measured against what actually breaks (`pipeline_contract.md` §4), the prerequisites rank:

1. **Parcel/block cadastre WITH ADDRESS RANGES (slot 8) — hard stop, and it outranks the year.** It supplies six things at once: the block rings the map draws and picks against; the id 14 of 35 build scripts key on; the address ranges that let *"2426 Pine Street"* resolve to a block at all; the plurality target for the census join; the APN that connects a published facility to a block; and the key that the permits and planning registers already carry. Without it there is **no degraded mode** — no panel, no rollup, no minutes placement, no money join. Screen for this first.
2. **Footprints with heights (slot 6)** — hard stop for a 3-D city.
3. **Construction years (slot 7)** — hard stop for the time axis.
4. **A digitised minute series (slot 14)** — hard stop for the editorial claim; partial substitutes exist and are weak (15/15b).
5. **Elevation (slot 3)** — solved nationally by USGS 3DEP, already wired in for the surround. **Ignore it in screening.**

**And the year is already 14.1 % wrong at SF, which is the calibration that matters.** `DATA-TRUTH.md` §1: 23,487 of 166,166 footprints are drawn on a year that is not their own — 20,662 on a block-p25 fallback whose key `pn[:4]` pools 185 prefixes covering more than one real assessor block, 2,825 on the 1906 constant, 1,484 on a made-land raise, 6,061 orphans with no roll row at all. A 1940s Navy hall is drawn arriving in **2015**, dated by condominiums on the next block. **A city with worse year coverage than SF does not produce a vaguer animation. It produces a more confidently wrong one.**

---

## 4. Load-bearing assumptions that would break

The brief named three. Two of them are true, one is a misreading worth correcting, and there are five more.

### 4.1 The historical record is the binding constraint, and it has been measured

Already established in `project_sf_minutes_corpus`, from live measurement, not inference:

> **LA / Oakland / Sacramento / Berkeley / 20 other CA cities — no digitized council-minutes series on IA.** SF's Journal is the only complete scanned California municipal minutes series on IA.

And for Canada (`scratchpad/ca-fellowship/CITIES.md`, 16 volumes read):

> The City of Toronto never deposited its records with IAC. … **No other big Canadian city has a municipal record here.** … **KINGSTON — 119 volumes · 66,148 pages · 1899–1983 · 80 distinct years · 2 missing. 28 % of decisions carry a named place.**

So the corpus that makes this project *not* a building-age map exists, in surveyed form, for exactly **two cities on two continents**: San Francisco and Kingston, Ontario. That is not an architecture problem and no amount of modularity fixes it.

This matters more than it first appears, because the project already rejected the alternative spine: *"Rejected: assessor `year_property_built` as the spine (**it is the commodity dataset every existing building-age map already uses**)"*. **A port to a city without a legislative record produces precisely the artefact Daniel already decided was not worth making.**

### 4.2 The assessor block as the unit a decision attaches to

`block` appears 1,123 times in non-test frontend map code. The blocks chunk carries per-block ring geometry, elevation, published area, neighbourhood index and roof-colour index; `CityBlockPanel` opens on it; the `moves_*.tsv` tables are keyed *block × year × direction*; `measure_stated_blocks.py` exists to establish that the Board's minutes state a block number at all.

**Why a block and not a parcel:** the Board's own record says *"Assessor's Block 0572"*. The join key is not chosen for geometry, it is chosen because **it is the string the decision itself contains**.

**And the coverage it actually achieves should be stated, because it is the number a demo hides:** of 5,404 blocks, **70 carry a place and 33 carry a figure.** The panel prints that ratio itself rather than hiding it, which is the right call — but a second city inherits the same shape, not a better one.

**And the coupling is not where it looks. The renderer does not know what a block is.** Verified across `lib/city/`: **no APN, no `mblr`, no block-number appears in any runtime expression** — every such mention is a comment. The block reaches the draw path as an *opaque polygon index* with four columns (ring, centroid, published area, region byte), consumed by the massing tier (`buildings.ts:962`), the lot pattern, `buildHoodAnchors` (`labels.ts:1420` — which says of itself *"nothing here knows which neighbourhoods exist"*) and the unimplied street class.

So the block-keying splits cleanly across the stack, and this is the most useful structural fact in §4:

| layer | what it knows about a block | verdict |
|---|---|---|
| `lib/city` (draw) | an opaque polygon + 4 columns | **configure** |
| `components/us/city/scene.ts` | the `BlockTable` decoder | configure |
| `block-records.ts` + `CityBlockPanel` | the block-number **string**, shard = `index % 256`, APN join to facilities | **fork** |
| `pipeline/scripts/us_sf_city` | the APN regex `^(\d{4}[A-Z]?)(\d{3}[A-Z]?)$`; 14 of 35 scripts key on it materially | **fork** |

That is the generalisable form, and it is more portable than "assessor block" sounds: *the unit is whatever identifier the city's own decisions cite*. Paris délibérations cite an **adresse** and an **arrondissement**. Recife cites an **órgão** and rarely a place. Kingston 1905 cites *"Mack Street"* — a street name, not a block. So the substitution for a European city is not "find the block equivalent" but **"parse what the record cites, and make that the unit"** — and the work is confined to the bottom two rows of that table.

### 4.3 The secured assessor roll is Californian — but the deeper problem is survivorship

`FABRIC_IS_SURVIVORSHIP = true` in `time.ts` is the honest statement. The 2025 roll describes **buildings that are still standing**. Drawing 1906 from it draws *the 1906 buildings that survived to 2025*, not the 1906 city. `project_sf_minutes_corpus` states the ceiling explicitly for the pre-fire era: *"those buildings burned and are absent from the 2025 standing-structure file … **Never promise a rendered 1859.**"*

This is **generic, not Californian**. Every city's current cadastre has it. Any port inherits it and must state it as loudly.

### 4.4 The 315° rotation — the brief's premise needs correcting

The brief says the projection is *"rotated 315° so that SF's grid is axis-aligned"*. Reading `projection.ts` §THE BEARING, that is not what the constant is for, and the correction changes the portability verdict favourably.

- **315° is north-up.** *"At 315° north is exactly straight up and east is exactly screen-right."* It was chosen over 210° for **recognition**, not for SF's grid: at 210° *"the peninsula everybody has seen ten thousand times on a north-up map arrives rotated 105° and reads as a beige blob."*
- **Axis-alignment is a property of 315° in this projection's convention, for any city.** `screen-x = √2·cA·x`, `screen-y = √2·sA·y + z·ZEX`, `depth = √2·y`. No SF number appears.
- **What *is* SF-specific is the cost that was accepted.** SF has two street grids; 315° trades one against the other. Measured over all 166,166 footprints: downtown (−134.7°) renders walls at 0.703/0.711 of full width; the cardinal grid (−1.5°) at 1.000/**0.026** — the Sunset, Richmond, Mission and Bayview read as flat elevations rather than boxes. Daniel accepted that because *"downtown, which is where the record is, gets better."*

**And here the assessment found something worse than the doc admits. `rotDeg` is configurable in form and hardcoded in fact.** `ROT_DEG` is a const, `Projection` takes `opts.rotDeg`, `setRotation()` emits a typed rebuild event, `isAxisAligned()` is the check. But **`1.2247` — which is `√2·cos 30°`, the across-screen factor *at 315° specifically* — appears as a bare numeric literal in six runtime expressions**: `facades.ts:711`, `labels.ts:241`, `labels.ts:255`, `trees.ts:106`, `trees.ts:946`, `trees.ts:1020–1021`, plus `streets.ts:42`'s `ST_KPROJ`. And depth ordering is assumed to be world y at `buildings.ts:661`, `trees.ts:941`, `terrain.ts:2231` and `terrain.ts:2479`.

**Changing the bearing does not throw. It silently degrades.** `isAxisAligned()` would catch the projection going non-axis-aligned; nothing catches a hardcoded 1.2247 quietly becoming the wrong constant. `projection.ts` says as much in terms (*"Anything that sorts, buckets or marches along the view direction is marching along world y. Do not re-derive this by hand at some other bearing"*). The honest statement is: **north-up is portable and free; any other bearing is a rewrite of the sort order in every layer.** A city with a different grid keeps 315° and accepts a different sliver trade-off. A city with no grid at all (a medieval European core) gets *every* wall at some intermediate foreshortening, which is arguably better than SF's bimodal outcome.

### 4.5 Four more, found by reading

1. **Coincidental constant equality.** `SHELL.md` §13.3: the street layer was gated on `VZ_T0` (the *tree* module's threshold) because it equals `ZSTEPS[1]` at this city's numbers. A second city breaks the coincidence and the bug appears as a rendering fault with no obvious cause. **This is a class, not an instance** — there is no way to know how many more exist without running a second city.
2. **Arithmetically inert code paths.** `SHELL.md` §13.2: `cityBBoxByBand` returns three byte-identical boxes because *"the plane-y extrema of the DEM walk land at sea level"* — true at SF's 280 m relief, false for a city with a taller DEM. The code is correct and untested, which is the dangerous combination.
3. **`year = 1905 + volume number`.** IA's `year` metadata is wrong across the entire Journal corpus (vol 59 is stamped 1906, is actually 1964). A per-corpus derivation rule, discovered by hand, that no second corpus will share.
4. **The gazetteer's failure mode is silence.** 0.88 fuzzy cutoff; a sweep to 0.80 gains 2.5 pt of coverage of which *half the new matches are wrong* (Army→Armory, Bernal→Bengal). Historical renames (East St→Embarcadero, Dupont→Grant, Army→Cesar Chavez) fail as **mis-placements, not errors** — the map confidently draws a decision in the wrong street. Every city needs its own sourced rename table; `RENAMES` is deliberately empty rather than guessed.

### 4.6 The `qc/1` chunk format — portable container, city-bound schemas

The container is genuinely generic and should be said so: magic `QCT1`, `u32` header length, `u32` payload length, `u32` CRC-32 over the payload, header JSON with keys emitted in fixed order for byte stability, payload 8-byte aligned so every field decodes as a **zero-copy typed-array view**. Dtypes `u8 i8 u16 i16 u32 i32 f32` — no `f64`, deliberately, because *no source in the record carries that precision*. Every decode failure throws; nothing returns a plausible array. **No city in any of it.**

The decoder already reads `manifest.grid.{cell,originX,originY,nx,ny}` — the client bakes nothing. The *encoder* does: `_grid.py` has `CELL = 1024.0`, `ORIGIN_X = ORIGIN_Y = -8192.0`, `NX = NY = 16` as module constants with no config path, and `cells_of()` **raises rather than clamps** outside them. **A city more than 16.4 km across fails at encode time.** That is ~5 lines to parameterise and it is the cheapest fix in this document.

But four things are city-bound *in the schema*, not in the constants:

1. **`bldg.yr` is one byte based at 1849** — a 256-year window, 1849–2104. **Paris overflows it at the low end and it is not close.** Worse, the encoder emits `year0` per chunk and the client **hardcodes `1849` at eight hot-loop sites in `scene.ts`** (2639, 3087, 3235, 3333, 3547, 3700, 3734, 3896) plus `?? 1849` at 997 and a literal at 1004/1231. The manifest field exists and is ignored. *This is the single clearest example of the whole document's thesis: a number that is really a name — 1849 is the Gold Rush — sitting in a field the format already made configurable.*
2. **`coast` carries `burnLen`/`burnXY`.** The 1906 burned-district polygon is a first-class field of the *shoreline* record type. Another city ships empty rings or the kind is redefined.
3. **`blocks.hood` is `u8`** — a hard cap of 255 divisions, joined **positionally** to a `hoodNames` array. It is SF's 41 Analysis Neighborhoods. Paris's 80 quartiers fit; a city with finer official divisions does not.
4. **`bldg.u` is a 3-bit use class** over `manifest.buildings.useNames`, which is the SF assessor roll's seven classes — and `palette.ts`'s two material matrices are indexed on exactly those seven rows. Same for `face.ty` (nine facade types), `strt.cls` (DataSF `3psu-pn9h` classcode 0–4), and `places.kind` (built from eleven named DataSF dataset ids).

And one that is neither: **`manifest.proj` carries three named SF anchors — `ferry`, `castro`, `downtown` — and `scene.ts:948–950` reads them *by those names*.** The values are data; the field names are not.

**Verdict: the container ports as-is. The grid ports with ~5 lines. The kind schemas are a per-city vocabulary and should be treated as one — which is exactly ADR-0010's schema-family idea, arriving in the map by a different door.**

### 4.7 The reproducibility gap, which is not an assumption but a fact

§4.6 is a design choice that can be undone. This one cannot be argued with.

**19 of the 35 tracked scripts in `pipeline/scripts/us_sf_city/` read their inputs from `scratchpad/sf-city-anim/`, which is not in git.** `_srcload.py` exists solely to parse `window.X = {...}` payloads out of that tree. `encode_city_chunks.py` — the 1,796-line encoder — cites generators at `scratchpad/sf-city-anim/gen/gen_geo2.py`, `time/build_time.py`, `street/build_surface.py`. `manifest.surround.meta.generated_by` names `gen/gen_context.py`.

That tree is **11 GB, 3,341 `.py` files, 704 distinct file contents, ≈107,000 lines** excluding the `proto`/`snap`/`rollback` duplicate trees (the naive count is 754,404 lines and it is inflated by snapshots — do not quote it). One file of it is tracked.

**And it is worse than the scratchpad tree alone.** `git ls-files pipeline/minutes` returns **zero**: the entire record-adapter directory — `extract.py`, `gazetteer.py`, `legistar.py`, `decisions.jsonl` — is untracked. Those are exactly the files D3 recommends generalising, and they are not in version control. Verified 2026-08-26 on `refactor/layering-us-br`; committing them is a five-minute job that should not wait for a port.

**Consequence: the SF map cannot currently be rebuilt from the repository.** Not "is hard to port" — cannot be rebuilt for SF itself. Any port cost estimate that ignores this is fiction, and any grant or funder reproducibility claim about this page is currently unsupportable. This is the highest-value, lowest-glamour item in the document.

---

## 5. The honest cost

Baseline for calibration: the tracked map subsystem is **161 commits and 114,050 insertions over 4 calendar days** (2026-08-23 → 2026-08-26), on top of roughly three weeks of prior corpus research (Kingston survey 2026-08-07; minutes measurement 2026-08-19/23) and the untracked mock. Solo, agent-assisted, at an intensity that is not a sustainable baseline.

### 5.0 The cost nobody budgets: the constants are measurements, not taste

This is the finding that should most change the estimate, and it is easy to miss because it looks like a small number of small numbers.

**Most of bucket (b) is not a magic number somebody picked. It is the output of a measurement harness.** `SA_DEFAULT` comes from a framing measurement (*"San Francisco fills 0.72 of the frame"*, a pixel measurement off a rendered page). `DETAIL_PXM` comes from a Sobel edge-length sweep. `HEIGHT_BANDS` comes from a height histogram of 166,166 footprints. `PITCH_RUN_MULT` comes from an inradius fit. `LOD_Z0 = 1.55` is the zoom at which *the median SF building* reaches 1.6 px. The pick snap radius is a tenth of the median block's root-area.

**Copying those values to a second city is free and wrong. Re-deriving them honestly is expensive, and no harness in the repo does it** — the harnesses that produced them live in the untracked tree of §4.7.

That is the real content of the 2–3 week reproducibility item in the tables below: it is not "commit some scripts". It is *"rebuild the measuring instruments, because the constants they produced are only valid for the city they were measured on."*

The compensating good news, and it is real: Block 8a shows the pattern for fixing this — a constant re-derived *from the published data itself* (median block root-area) landed at 10.2 m against a hand-set 10.5 **without being tuned to it**. The measurements can be turned into derivations. That work is the actual "make it modular" project, and it is smaller than a rewrite and larger than a config file.

### 5.1 A second US city (Legistar-served, e.g. Oakland, Seattle, Portland)

| work | estimate | confidence |
|---|---|---|
| descriptor + manifest for the new city | 1–2 days | high — the contract exists |
| finish `lib/citygl` to parity (its own audit: drawing ~65 %, features ~40 %) | 3–5 weeks | medium — Daniel's own estimate is implicitly in `PLAN.md` §6 |
| commit the generator chain out of scratchpad, make it re-runnable | **2–3 weeks** | medium — §4.6, unavoidable and it is one-time for all cities |
| data slots 1–13 for the new city | 2–4 weeks | medium — hinges entirely on slot 7 |
| modern record via Legistar (slot 15) | **2–4 days** | high — one string |
| historical record (slot 14) | **not available** | high — measured, §4.1 |
| hero landmarks | 1–2 weeks per city, forever | high |

**≈ 2–3 months, of which ~5 weeks is one-time engine work that every subsequent city inherits.** What you get: a fast, beautiful 3-D city with building ages and a 25-year decision record. What you do not get: the century.

### 5.2 A European city (Paris is the strongest candidate, and not for sentimental reasons)

Slots 8, 3, 9 are strong in France (cadastre, RGE ALTI, BD TOPO). Slot 7 plausibly exists via BDNB — **unverified, verify first**. Slots 6 and 10 are weak: no per-building LIDAR statistics, no right-of-way polygons.

The decisive difference is slot 14. **Paris already has a place-keyed decision corpus in this repo** — `project_lieux_feature` is built on délibérations + BMO + money, 64 lieux published, with `export_lieux.py` and a seed→saillance→juge pipeline already written. The record layer does not need inventing; it needs re-keying from *lieu* to *geometry*.

Against it, and specifically: the corpus is decades deep, not a century; §4.2's unit is an address, not a block; every string in the subsystem is EN-only against a standing FR-parity rule; and **`bldg.yr`'s 1849 base overflows on the first Marais building** (§4.6), which is a format change plus nine call sites rather than a config value.

**And the counterintuitive finding that most strengthens this option: a French port makes the hardest code *disappear rather than port*.** Roughly **480 of `block-records.ts`'s 665 code lines are OCR repair** — `PROCEDURAL_HEAD`, `junkShare`, `brokenFlags`, `isPrintableLine`, `stripTruncation`, `stripFileNumber`, `railSilence` — heuristics measured against the *Journal of Proceedings*' scan quality specifically. A `délibération du Conseil municipal` is **born digital**, with a `numero`, a `date_seance`, an `objet` and a PDF. None of that repair layer is needed. The rail, the decade grouping, the "went quiet" test and the disclosure UI all survive. **The single most irreducible file in the frontend is irreducible only because SF's record is a scan.**

Paris also has the one thing no US city has: `cadastre.data.gouv.fr` is a *national* open parcel fabric, so slot 8 — the hard stop — is solved for every French commune at once rather than county by county. If the map is ever going to be a product feature rather than a one-off, that is the property that makes it one.

**≈ 3–4 months** on top of the engine work in §5.1, and it is the only one of the three where the resulting artefact is *not* a commodity building-age map.

### 5.3 A city whose minutes exist only on paper

**Do not attempt. This is a recommendation to not do something, and the reason is not effort — it is that it is the wrong organisation's job.**

SF's corpus is 158,322 pages, scanned by SFPL at IA's Richmond centre, `publicdate 2008-10-23`. Digitising a century of council minutes is a library programme with a budget and a scanning facility. A solo founder who starts it will spend a year and produce a worse OCR corpus than IA would. If a target city's records are on paper, the correct move is to **ask a library to scan them** (`project_sf_minutes_corpus` already frames this as *"the ask is 'add the collection', which costs IA an afternoon"*) and to build something else in the meantime.

---

## 6. Decision

**D1. The map's contract is `CityDescriptor` + that city's `manifest.json`. It is not `places.json` and not the schema family.** Record this explicitly so a future reader does not try to force the map through ADR-0010's three contracts. The map is a fourth contract, narrower in scope and unrelated in vocabulary. Do add the map as a `modules` entry in `places.json` so nav and sitemap can see it — that part of contract #1 does apply.

**D2. Continue the modularisation through the GL port. Do not open a parallel "make the map modular" workstream.** `lib/citygl` is already city-free by test, at 88 % of its own plan, and its city-free rule is *finding* the buried constants that no audit would. A second effort would duplicate it and compete for the same solo attention. **The generic engine is a by-product of a rewrite Daniel already wants for performance reasons — that is the cheapest possible way to get it.**

**D3. Generalise these, because they are cheap and already nearly done:**
- `lib/citygl/*` — keep the grep test, and extend `FORBIDDEN` as new cities appear.
- `lib/city/data.ts` — already `baseUrl`-parameterised; retire the `DEFAULT_BASE = "/data/us/sf/city"` fallback so a missing descriptor fails loudly instead of silently loading SF.
- the `qc/1` manifest — it already externalises projection, grid, tiers, palettes and per-field provenance. It is the best-designed thing in the subsystem. **Treat `manifest.json` as the map's export contract** and version it.
- `_grid.py`'s `CELL`/`ORIGIN`/`NX`/`NY` — ~5 lines to take from config. Cheapest item in this document; do it opportunistically.
- **`scene.ts`'s eleven hardcoded `1849` sites** (eight hot loops at 2639/3087/3235/3333/3547/3700/3734/3896, literals at 1004/1231, and `?? 1849` at 997) — the manifest already publishes `year0`. Reading it is a small change that removes a format-level blocker for every pre-1849 city, i.e. most of Europe.
- `pipeline/minutes/gazetteer.py` — already generic in shape; make the centreline source and the rename table per-city inputs.
- the minutes *method* cluster (`_sfbos_sweep`, `sweep_*`, `fetch_sfbos_minutes`, `build_minutes_manifest`, `measure_*`, ~3,150 lines) — genuinely generic in method. What is not generic is its input.
- `pipeline/minutes/legistar.py` — parameterise the client token **as a screening tool, not as a record source.** It is the cheapest way to measure a candidate city's place-bearing share before committing; do not ship a rail off it (see slot 15b).

**D3b. The file-level verdict from the classification pass, as a working list:**

| verdict | files | file lines |
|---|---|---:|
| **reuse untouched** | `data.ts`, `camera.ts`, `terrain.ts`, `landmarks.ts` (its bridge pass is already generalised to N spans reading geometry/year/height per bridge), `renderer.ts`, `CityEntry.tsx` | 8,857 |
| **configure** (one refactor each; most are one step from where `camera.ts` and `data.ts` already are) | `projection.ts`, `buildings.ts`, `streets.ts`, `roofs.ts`, `labels.ts`, `water.ts`, `trees.ts`, `scene.ts`, `CityMap.tsx` | 14,380 |
| **fork** | `time.ts` (its contents *are* the city), `facades.ts` (`FA_TYPES`×`FA_ERA_YR`×`FA_VOCAB`×`FA_GROUND` is one joint table that cannot be varied independently), `place-kinds.generated.ts` (**regenerate — and check its stated deletion condition first; it may not need to exist for either city**), `block-records.ts`, `CityBlockPanel.tsx` | 6,068 |
| **split before deciding** | `film.ts` — **1,527 lines are a genuinely payload-driven timeline engine worth extracting verbatim; only 211 are the SF fork** | 1,738 |

**D4. Fork per city, do not generalise, for these — they are cheaper duplicated:**
- hero landmarks and shaped caps (hand form work; there is no engine for "make this building look like itself");
- the minutes sweep's era rules, header logic and `moves_*.tsv` (every corpus's OCR pathologies are its own — SF's `year = 1905 + volume` rule is worth nothing to Kingston);
- the copy. Every string. Do not build an i18n abstraction for a page that exists once.

**D5. Do the reproducibility work before any port, because it is owed regardless.** Commit the generator chain out of `scratchpad/sf-city-anim/` into `pipeline/`. §4.7. This is not port work — the SF map cannot be rebuilt from the repo today, and that is a standing liability for a project whose entire pitch is provenance.

**D6. Do not port to a second city before the record question is answered for it.** Concretely, the gate is: *does slot 14 or slot 15 exist for this city, sourced and measured, before any code is written?* Step 1 of `ADDING-A-PLACE.md` — *"Audit your sources. Write no code."* — applies here more sharply than anywhere else in the repo, because the failure mode is not a broken page. It is shipping the commodity building-age map that this project explicitly rejected.

**D7. If a second city is chosen, the ranking this assessment supports is:** (1) **Kingston, Ontario** — the only other surveyed century-deep corpus, already downloaded and measured at 28 % place-bearing decisions, and a fellowship application already written against it; (2) **Paris** — the record exists in this repo already, and it is the only candidate whose result is not a commodity; (3) a Legistar US city — cheapest engineering, weakest artefact. Kingston's own risk is the mirror of SF's: a small city with a great record and, almost certainly, **no LIDAR building heights and no published construction years** — verify slot 7 before anything.

---

## Alternatives rejected

**A. Build a generic "city map engine" as a first-class product surface, config-driven for any city.**
❌ It is architecture-astronaut work for a solo founder: the engine is ~30 % of the cost and the data audit plus hand form work is the other 70 %, and the latter does not generalise at all.
❌ It would compete with the GL port for the same attention and produce the same artefact more slowly.
❌ The binding constraint is corpus availability (§4.1), which no engine fixes. Generalising the cheap half while the expensive half stays per-city is the definition of the wrong optimisation.

**B. Retrofit the existing Canvas renderer (`lib/city` + `components/us/city`) into a city-free engine.**
❌ 19,112 lines of code with a decade's worth of hand-tuned form in it, and the port to GL is already re-deriving the constants that matter.
❌ Two engines diverging is the exact per-place-fork failure ADR-0010 D1 rejected.
✅ Keep it as the parity reference until `lib/citygl` reaches feature parity — `PLAN.md` §0.1 already says the old page does not move.

**C. Force the map through the `places.json` + schema-family contracts.**
❌ Schema family is an accounting vocabulary and does not predict map feasibility (§1).
❌ It would make a `us-municipal` place look map-capable when its real constraint is whether a library scanned its minutes.

**D. Port to a second US city first because it is technically cheapest.**
❌ Cheapest engineering, and it produces the artefact the project already rejected on the record (`project_sf_city_animation`: assessor year-built as spine = *"the commodity dataset every existing building-age map already uses"*).
❌ It would spend two months to prove the engine is modular — which `engine-is-city-free.test.ts` already proves for free, on every test run.

---

## Conséquences

**Positive**
- The modularity question has a cheap answer that is already 88 % delivered, and it cost nothing extra because it rode on a performance rewrite.
- `manifest.json` is promoted from an implementation detail to the map's export contract, which fits the repo's existing per-value provenance rule without inventing anything.
- The reproducibility gap (§4.6) is now written down. It was invisible and it is the largest single liability in the subsystem.
- The brief's premise about the 315° rotation is corrected in the direction of *more* portability, not less.

**Negative, and accepted**
- The map stays a two-city capability at best for the foreseeable future, and the second city is constrained by nineteenth-century library deposit decisions rather than by anything in this repo.
- `lib/citygl` reaching parity means re-deriving an unknown number of buried constants (§4.5 class 1). That backlog cannot be sized in advance — only enumerated as the test surfaces it.
- Committing the generator chain is 2–3 weeks of work with no visible output, and it will be tempting to skip. It should not be skipped.
- Hero landmarks are per-city hand work forever. There is no plan to fix this and this ADR does not propose one.

---

## Enforcement

1. `website/src/lib/citygl/engine-is-city-free.test.ts` runs in CI and fails the build on a city name, a city data path or a one-city landmark in engine code. **Extend `FORBIDDEN` whenever a city is added** — it currently guards `san francisco|sf|marseille|recife|paris` and the SF landmark set.
2. `lib/city/data.ts`'s `DEFAULT_BASE` fallback should become a required descriptor field (D3) so that "which city am I loading" can never be answered by accident.
3. Any PR adding a second city's map must cite this ADR and answer D6's gate — the record source, sourced and measured — in its description, before code.
4. `manifest.json` gains a `format` version bump discipline: `qc/1` is the current contract; a breaking change to chunk layout is `qc/2` and an ADR.

---

## Open questions this assessment did not settle

- **Slot 7 for any non-Californian city is unverified.** NYC PLUTO, King County, Cook County and BDNB are named as leads, not confirmations — per the project's own rule that citations are leads until the page is opened. Verify live before any port decision.
- Whether Kingston has building heights or construction years at all. Its corpus is surveyed; its geometry is not.
- Whether the `moves_*.tsv` curation (14,489 rows) has a cheaper form for a second corpus, or whether it is irreducibly per-city hand work. Current evidence says the latter.
