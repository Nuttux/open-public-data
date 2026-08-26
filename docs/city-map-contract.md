# The city map's contract — what a city supplies, as slots

**Status** : derived from the shipped San Francisco pipeline, 2026-08-26.
**Companion to** : ADR-0012 (the assessment). This is not a second assessment and
it proposes no port. It is the list of holes the SF build turned out to have, once
the code was in the repository and could be read as a whole.

**The one question asked of every line of the pipeline**: *is this true of a city,
or is this true of San Francisco?* An assessor block is San Francisco. A unit of
land that a decision can name is a city. A secured-roll `year_property_built` is
San Francisco. A footprint carrying a construction year is a city.

**No second city appears in this document, deliberately.** Naming one would invite
filling the slots with its vocabulary, and the slots are worth more empty: a slot
is only correctly named once it is stated without any city in it. Where a slot
cannot be stated that way, that is recorded as a finding rather than smoothed over.

---

## 0. How to read the "assumption lifted" column

Three kinds of thing show up there, and they are not equally bad.

| kind | what it looks like | cost to a second city |
|---|---|---|
| **a name** | a string with a city in it — a dataset id, a URL prefix, a street | cheap; a grep finds it |
| **a number that is really a name** | `-8192`, `1849`, `2.9` — no city token, but a measurement of one city | expensive; **no grep finds it**, and it degrades silently rather than failing |
| **a form** | the printed shape of a clerk's sentence, an OCR pathology, a hand-modelled landmark | does not port at all; forked by design |

ADR-0012 §2.2 is about the middle row and it is the reason this document exists.
`lib/citygl`'s city-free test finds them by forbidding names; the pipeline has no
such test, so they are enumerated here by hand.

---

## 1. FABRIC — the ground and what stands on it

One line per slot. "SF file" is what fills it today; "assumption lifted" is the
San-Francisco-shaped thing that had to be named for the slot to be a slot.

| # | slot (generic) | SF file / source | assumption that had to be lifted out |
|---|---|---|---|
| F1 | projection anchor | `manifest.proj.{lon0,lat0,cosl}` | none — already data |
| F2 | **world tiling** | `citymap/grid.py` + `us_sf_city/_grid.py` | **`ORIGIN=-8192, NX=NY=16` — a 16.4 km box drawn round one city, and `cells_of()` *raises* rather than clamps outside it. Lifted to `EXTENT_M` + `for_extent()`; `CELL=1024` stays, it is derived from a measurement rather than from a location** |
| F3 | bearing | `manifest.proj.marketRot`, `ROT_DEG=315` | 315° is north-up and generic; **the accepted COST is not** — one city's two street grids traded against each other, and `1.2247` (= √2·cos30° at that bearing) hardcoded at ~20 sites the manifest already publishes as `pxAcross` |
| F4 | terrain | `sources.dem` → DataSF `6d73-6c4f` + USGS 3DEP | a dataset id; and `cityBBoxByBand` is arithmetically inert **because this city's relief is 280 m** |
| F5 | shoreline | `sources.coast` → `txuc-3kzm` | a dataset id — **but the `coast` chunk kind carries `burnLen`/`burnXY`, one city's 1906 fire boundary, as a first-class field of the shoreline record type** |
| F6 | bathymetry | `sources.bathymetry` → NOAA NCEI | a national programme; degrades to a flat water plane |
| F7 | **footprints with height** | `sources.bldg_geom`/`bldg_h` → `ynuv-fyni` | nine **zonal LIDAR statistics per building** (`L=median, T=max, f=(mean−L)/(T−L)`). The slot is "a footprint with a height"; the richness is one city's |
| F8 | **construction year per footprint** | `sources.bldg_yr` → `wv5m-vpq2` | the *secured assessor roll* is the form; **"a year per footprint" is the slot.** Without it there is no time axis and the map is a 3-D basemap |
| F9 | **survivorship** | `FABRIC_IS_SURVIVORSHIP = true` | **generic, and the most important honest statement in the system**: a current cadastre describes what is still standing, so drawing year Y draws *the year-Y buildings that survived to today* |
| F10 | use class + storeys | `sources.bldg_use`, `roof_st` → `wv5m-vpq2` | **seven classes**, and `manifest.buildings.useNames` is joined **positionally** to two material matrices; `bldg.u` is 3 bits |
| F11 | street centrelines | `sources.street_centreline` → `3psu-pn9h` | a dataset id; `strt.cls` is that publisher's `classcode` 0–4 |
| F12 | street right-of-way + kerbs | `sources.street_row`/`street_kerb` → `h8n7-e4ns`, `emxt-b6yg` | rare in this form; already degraded by design — widths are taken as a fraction of *the city's own published medians*, not in metres |
| F13 | trees with planting dates | `sources.tree` → `tkzw-k3nq` | a dataset id; degrades to canopy off |
| F14 | roof colour | `sources.paint` → Esri World Imagery | global; degrades to palette-from-use-class |
| F15 | named places | `sources.place_*` — **eleven separate dataset ids** | the slot is "a register of named places with an extent"; **eleven ids and a `places.kind` byte over them is one city's civic data catalogue** |
| F16 | administrative divisions | `blocks.hood` (`u8`) + `hoodNames` | **positional join, 255-division ceiling**, filled by one city's 41 Analysis Neighborhoods |
| F17 | hero landmarks | `manifest.landmarks`, 14 buildings / 145 parts | **a form, not a name. Does not port. Forked per city, forever** |

## 2. THE UNIT — what a record attaches to

**The slot is: an identifier for a piece of land that the city's own decisions
put in writing.** Not a geometry, not a point — an *identifier*, and it is chosen
for one reason, stated in ADR-0012 §4.2 and true generically:

> The join key is not chosen for geometry, it is chosen because **it is the string
> the decision itself contains.**

| # | slot (generic) | SF file | assumption that had to be lifted out |
|---|---|---|---|
| U1 | the unit's geometry | `sources.blocks` → `acdm-wktn`, 5,404 rings | a dataset id |
| U2 | **the unit's printed identifier** | `build_index.py` `STATED` / `STATED_HEAD` | **`Assessor's Block 0572` and `Assessor's Parcel Block No. 3568, Lot No. 003` — two printed forms of one clerk's office, and the second needed a curly apostrophe, an interposed word and a trailing lot number to be matched at all** |
| U3 | **the unit's address ranges** | `sources` → parcel address ranges (`street_index()`) | the ranked-first prerequisite. Without it a house number in a sentence resolves to nothing, and there is **no degraded mode** |
| U4 | the unit's key syntax | the APN regex `^(\d{4}[A-Z]?)(\d{3}[A-Z]?)$` | one assessor's numbering; 14 of 35 scripts key on it materially |
| U5 | the unit as the renderer sees it | `blocks` chunk: ring, centroid, area, region byte | **already generic and worth saying so: `lib/city` contains no APN, no block number, no `mblr` in any runtime expression. The unit reaches the draw path as an opaque polygon index** |

**What the SF pipeline proves about this slot, and it is the finding**: the
identifier is city-shaped *only at the two bottom layers*. The renderer configures;
the panel and the pipeline fork. That split is the contract.

**And the coverage a demo hides.** Of 5,404 units, **70 carry a place name and 33
carry a figure**. The panel prints that ratio itself. A second city inherits the
shape of that number, not a better one.

## 3. THE RECORD STREAM — dated items carrying location phrases

| # | slot (generic) | SF file | assumption that had to be lifted out |
|---|---|---|---|
| R1 | the corpus | `blocks/extract_texts.py` → `items.jsonl` | 142 bound volumes 1906–1999 + 390 clerk PDFs 2016– |
| R2 | item shape | `{v, n, i, dt, y, t, r, k, m}` — document, page, index, date, year, text, resolved streets, kind, money | **generic, and it is the cleanest thing in the pipeline.** Nine fields, none of them a city |
| R3 | **the citation discriminator** | `build_index.page_url()` → `(u, exact, kind)` | **generic in shape and already proven so**: `u` is `"<document>/<page>"`, and a **one-character `kind`** selects the resolver. `None` = a scan, `"b"` = the clerk's own PDF. **A third system is a third character and a third branch** |
| R4 | citation reconstructibility | `sfbos_gate()` | **the GATE is generic — "prove every row's link can be rebuilt, or refuse to publish."** The URL prefix and suffix inside it are one city's CMS |
| R5 | page-number mapping | `fetch_leafmap.py`, `calibrate_leaf.py`, `verify_leaf.py` | **a per-corpus artefact**: a scan's leaf is not its page, and the offset is per volume, sometimes 0-based and sometimes 1-based. A born-digital record has no such layer at all |
| R6 | corpus dating rule | `year = 1905 + volume number` | **one corpus's rule, discovered by hand, because the archive's own `year` metadata is wrong across the entire series** |
| R7 | **item segmentation** | `extract.py` `ITEM` split; `strip.py`; `prefaces.py`; `headings.py` | **the form of a printed page**: an item's *title* is printed above the word the splitter cuts on, so the heading of item N is the tail of item N−1. That is a typographic fact, not a civic one |
| R8 | OCR repair | `strip.py`, `gloss.py`, and ~480 lines of the frontend panel | **exists only because the record is a scan.** A born-digital record deletes this slot rather than porting it |
| R9 | the record's own verbs | `PHASE_CUES` (7 phases), `SUBJECT_CUES` | **the phase vocabulary is generic — opened / building / decided / funded / contested / stalled / proposed. The regexes that detect them are one legislature's English** |
| R10 | gaps in the series | `YEARS_WITH_NO_VOLUME` | one city's missing volume |
| R11 | the floor of the time rail | `SCRUB_MIN = 1906` | **one city's fire**, and correctly so — the record resumes five days after it |

## 4. THE JOIN — placing a record on a unit

**The precision-tier ladder is the most portable idea in the whole system and it
is worth stating with no city in it at all:**

> A reader must be able to tell *"this happened at this address"* from *"this
> happened somewhere on this street"*, and the tier travels with every row so the
> UI can keep that promise. An item that resolves to nothing is written out with
> its reason — **never guessed onto a unit.**

| tier | generic statement | SF form | assumption lifted |
|---|---|---|---|
| 4 `stated` | the record names the unit in its own words | `Assessor's Block NNNN` | **the printed form (U2). The TIER is generic; nothing else in the ladder outranks the record answering for itself** |
| 3 `addr` | a street number in the text falls inside a unit's address range | parcel ranges | needs U3 |
| 2 `segment` | a run of one street between two others | `between` / `from…to` | **English function words** |
| 1 `corner` | two streets, the units fronting both | — | generic; also absorbs `bounded by` |
| 0 `street` | a bare street name — every unit fronting it | — | generic, and deliberately weak: capped, ranked last, and stored **once per street** rather than once per unit |

| # | slot (generic) | SF file | assumption that had to be lifted out |
|---|---|---|---|
| J1 | name → geometry resolution | `pipeline/minutes/gazetteer.py` | **generic in shape; needs that city's centrelines and a *sourced* rename table. `RENAMES` is deliberately EMPTY rather than guessed** |
| J2 | the fuzzy cutoff | `0.88` | **measured: relaxing to 0.80 gains 2.5 pt of coverage of which HALF THE NEW MATCHES ARE WRONG.** The number is a measurement of one gazetteer |
| J3 | **the failure mode** | — | **generic, and the worst in the system: a historical rename fails as a MIS-PLACEMENT, not an error. The map confidently draws a decision in the wrong street** |
| J4 | geometry cross-check | `blocks/verify_geo.py` | **generic method**: check the address-table join against centreline distance, an independent source. The 40 m tolerance is a roadway half-width |
| J5 | omnibus / smear guards | `OMNIBUS_STREETS=6`, `MAX_STREET_BLOCKS=60` | thresholds measured on one corpus |
| J6 | near-duplicate collapse | `citymap/nearcollapse.py`; 4-word shingles at 0.55, char 4-grams at 0.86 — and the measure is an OVERLAP coefficient, not Jaccard: it divides by the smaller side, so thresholds do not carry to a Jaccard implementation | **generic mechanism, and it has a known cost measured at 40.9 % of unit-links discarded** — including 479 `stated`-tier links, the one tier that outranks inference |
| J7 | ranking | precision + money + phase − specificity − boilerplate | **generic shape; the weights are one corpus's** |
| J8 | diversity | ≤ 4 of the top 12 from one decade | generic |
| J9 | **order independence** | `citymap/orderindep.py` + an 11-line SF wrapper | **fully generic, and it is the property that makes the index a function of the corpus rather than of its arrival order** |
| J10 | regression gate | `citymap/blocklayer.py` + `verify_block_regression.py` | generic — and the `cut` year has NO default in the shared half, because an era boundary is one series' fact |
| J11 | accuracy scoring | `blocks/measure_accuracy.py` | **generic method, and the good one**: where the record states the unit, run the inference again *as if it had not*, and score it. Requires tier 4 to exist |

## 5. TRANSPORT — the container and the tiering

| # | slot (generic) | SF file | assumption that had to be lifted out |
|---|---|---|---|
| T1 | chunk container `QCT1` | `citymap/chunk.py` | **none. Zero city tokens, and no `f64` — deliberately, because no source in the record carries that precision** |
| T2 | geometry delta codec | `citymap/deltachain.py` | none material — and it is out of `_bldgsrc.py` now: the codec is shared, the *reader* that knows the payload is `window.BLDG` stayed San Francisco's |
| T3 | world tiling | `_grid.py` | see F2 |
| T4 | **LOD tiering** | `manifest.camera.{LOD_Z0,LOD_Z1,MINZ,MAXZ}`, `tiers[*].minZ` | **the LADDER is generic; every rung on it is a measurement of one city.** See §6 |
| T5 | per-field provenance | `manifest.sources` — 60+ entries | **the healthiest seam in the subsystem, and already generic**: publisher + dataset id per column of every chunk kind |
| T6 | **the year encoding** | `bldg.yr`, `u8` | **`1849` — a 256-year window based at one city's founding, hardcoded on both sides of the wire, in a format that already publishes `year0` per chunk. It has no derivation anywhere (§6)** |
| T7 | published index tiering | `blocks/INTEGRATION.md` — T0 36 KB / T1 per click / T2 lazy | **generic and well-shaped**: one file at first paint, one per click, lazy thereafter |

## 6. THE CONSTANTS — measurements, not defaults

**This is the slot the whole contract turns on, and it has no column for a file
because the point is that most of these have no file.**

`pipeline/scripts/us_sf_city/derive/` now holds the recovered instruments and the
full table. In summary:

**Has a real measurement, recovered:** `LOD_Z0` (the zoom at which the *median*
building reaches 1.6 px), `DETAIL_PXM` (a Sobel edge-length sweep), `SA_DEFAULT`
and `SA_FRAMING_FLOOR` (a framing sweep, with the bound *exported so a test can
read it* — the pattern worth copying), `ROT_DEG` (a bearing contact sheet), the
roof-band quartiles. **None of them runs today**: all are Playwright harnesses
driving a prototype page that no longer exists.

**Has NO derivation anywhere, and must not be promoted:** `bldg.yr`'s base
`1849`; `PITCH_RUN_MULT`; `HEIGHT_BANDS`' cut points; `ZSTEPS = [1, 2.9, 7.2]`
and everything keyed off it; `MINZ`/`MAXZ`; `_grid.py`'s box (now lifted);
`SNAP_PX`, `MARCH_SLACK_M`, `FOOT_CELL_M`.

`pipeline/scripts/us_sf_city/derive/wiring.py` is the table that CHECKS the two
halves against each other: every instrument named is a file that exists, and
every consumer named still holds the value it was measured at. Run it before
quoting any of these numbers. And `citymap/measured.py` lets a constant carry its
own derivation in the code that uses it — `Measured` for one with an instrument,
`Declared` for one without, both `float`/`int` subclasses so annotating a number
cannot change a published byte.

**And the pattern that dissolves the slot instead of filling it** —
`citygl/pick.ts`: a snap radius that was *half one city's street standard* became
a fixed fraction of **the median unit's own √area**, computed at load from the
shipped rings, landing at 10.2 m against a hand-set 10.5 without being tuned to
it. A march ceiling that was one city's 280 m relief became `max(sampled ground
range) + slack`.

> **A constant re-expressed as a derivation from the city's own published data
> ports for free. A constant re-measured per city ports for the cost of a harness.
> A constant copied does not port at all — it just stops being true quietly.**

---

## 7. What this contract does NOT cover, stated so nobody assumes it does

- **The hero landmarks and shaped caps.** Hand form work. There is no engine for
  "make this building look like itself" and this document does not propose one.
- **The copy.** Every string. Forked.
- **The corpus.** No amount of contract produces a digitised record for a city
  that does not have one, and that is the binding constraint on the whole idea.
- **The sidecars.** `encode_city_chunks.py` does not produce the published state
  and is not meant to. `us_sf_places/{emit_places,emit_heroes,emit_bay_bridge}.py`
  run after it, share its `_chunk.ChunkWriter`, and read-modify-write the manifest.
  That layering is generic and healthy — *the encoder owns one payload and its
  re-runs stay byte-identical; anything from another source is a sidecar* — and
  this document does not restate their slots.

---

## 8. Where the city-free half actually lives — added 2026-08-26

The slots above were written before any code moved. `pipeline/scripts/citymap/`
now exists and holds the modules that fill T1, T2 and the arithmetic half of F2.

**The rule the directory is under, and it is a test rather than an intention:**
`citymap/check_city_free.py` fails if a module in that package names a city, a
publisher, a dataset id, a URL or a path into one city's tree. It is a port of
`website/src/lib/citygl/engine-is-city-free.test.ts`, which is the only part of
this subsystem that has stayed clean without anybody policing it.

**And what that test cannot see is §0's middle row**, which is the expensive one.
A grep for names finds `-8192` never. The instrument beside the number —
`us_sf_city/derive/` — is the only defence against that, and it is a per-city
cost by construction, not a thing a shared package can hold.
