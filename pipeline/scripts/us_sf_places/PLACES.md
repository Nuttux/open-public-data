# Block T2 — more named places

Queue item 4. Owner of `pipeline/scripts/us_sf_places/` and the chunk it emits.
Written as the work happened, not afterwards.

> "tons of famous landmarks/churches/stations/parks etc rendered… full world
> lush with detail"

**Where it started.** `base/marks.json` ships **1,243** named places out of three
DataSF registers — Article 10 landmarks (370), Recreation and Parks properties
(255) and City Facilities (1,734), joined to the shipped footprints for their
extent. `scratchpad/sf-city-anim/marks/BLOCK-N.md` is the record of that build
and of seven registers fetched and rejected. Nothing here re-litigates one of
those rejections; this block went and found different files.

---

## 1. Every register this block opened, with real counts

Downloaded by `fetch_places.py` into `cache/`, each with a `.meta.json` giving
the URL, byte count, row count, sha256 and the retrieval time, and a
`.dataset.json` carrying the publisher's own column descriptions. Counts below
are **from the files**, not from the catalogue.

### Used

| dataset | publisher | rows | geometry | name | year the file publishes |
|---|---|---|---|---|---|
| `5kya-mfst` Tall Building Inventory | DataSF (Planning / DBI) | 180 | 180 polygons | 180 | `date` = *"Building's year of construction"*, **180/180**, 1889–2019 |
| `ejht-vp5d` Article 11 Rating | DataSF (Planning) | 786 | 786 polygons | **450** non-empty | none usable — `datelisted` is `1899-12-30` on every row (the GIS null sentinel) |
| NRHP points, layer 0 | US National Park Service | 185 in the query box, **170 in San Francisco County** | points | 170 | `CertDate` = the **listing** date, not an existence date |
| NRHP polygons, layer 1 | US National Park Service | 31 in the box, **27 in San Francisco County** | polygons | 27 | same |
| `6adp-a5yv` Schools_College | DataSF (from NCES, as of 2011) | 46 | 46 campus polygons | 46 | none |
| `65ik-7wqd` Privately Owned Public Open Spaces | DataSF (Planning) | 81 | points | 81 | `year`, 81/81 (one reads `Under construction`) |
| `7e7j-59qk` Schools | DataSF (from the CA Dept of Education) | 235 | 233 points | 235 | `open_date` — **not used, see §3** |
| `ib5c-xgwu` Recreation and Parks Facilities | DataSF (RPD) | 2,692 | polygons | 2,689 | none |

### Fetched, measured and NOT used — each for a property of the file

| dataset | rows | why not |
|---|---|---|
| USGS GNIS, California Domestic Names | 52,722 statewide, **222 in San Francisco County** | GNIS publishes **one point per name and nothing about how big the thing is** — 0 of 222 carry an extent. 59 of the 222 are class `Populated Place`, which is a neighbourhood, and the hood layer already names those. |
| `i28k-bkz6` Muni Stops | 3,260 | points, no extent, and **no year anywhere in the file**. A stop cannot be year-gated from this register, and the brief's rule is that a 1972 station must not stand in 1912. |
| `r7bn-7v9c` Civic Art Collection | 1,038 | points, no extent. Where one falls inside a footprint the footprint is *the building the artwork is in*, not the artwork, so the join would attach a sculpture's name to a building's size. |
| `gtnh-hgvs` City Lands | 1,035 | measured — see §4 |
| `38b7-6db3` Rec & Parks Functional Areas | 7,473 | sub-areas of the properties `ib5c-xgwu` already covers; 1,105 of 7,473 names occur once in the file, and those are the same rec centres and lodges the facilities file publishes with better geometry |
| `3nje-yn2u` RPD Parks | 222 | the same parks as `gtr9-ntp6` (255), which already ships |

---

## 2. What ships

`build_places.py` merges the eight registers with the 1,243 already on the map
and reports every cut. **The counts below are printed by the build, not typed
here** — run it and they come out again.

```
already on the map                                       1,243
candidate rows read from the new registers               1,570
        5kya-mfst 129 · ejht-vp5d 438 · nps-nrhp 167 · 6adp-a5yv  46
        65ik-7wqd  24 · 7e7j-59qk 232 · ib5c-xgwu 534
  resolved to a building footprint      897 (57.1 %)   521 by parcel, 376 by containment
  dropped, no published geometry so no published extent   232
  dropped, outside the drawn city                          83
  dropped, shares a footprint with a better-sourced row    221 new,  32 already shipped
  dropped, same name inside one San Francisco block         37 new,   5 already shipped
  dropped, a building register row with no published year   11
SHIPPED                                                  2,192
        1,206 of the 1,243 that were already there  +  986 new
        339 designated (Article 10) · 1,853 named
```

and, inside the registers themselves before any of that:

```
  1,768 rows whose name the register also puts on another of its own rows
    387 rows whose name is only their property's name and the file's own kinds
    108 rows whose name is the row's own address
     30 rows of ResType `district`
      8 rows whose name says the building is DEMOLISHED
      4 rows that are a cross-reference to another parcel
      1 row whose status is Pending
```

Where the 2,192 come from:

| register | ships |
|---|---|
| `nc68-ngbr` City Facilities | 627 |
| `ib5c-xgwu` Rec & Parks Facilities | **392** |
| `ejht-vp5d` Article 11 | **344** |
| `97yj-54sx` Article 10 (designated) | 339 |
| `gtr9-ntp6` Rec & Parks Properties | 240 |
| `5kya-mfst` Tall Buildings | **107** |
| `7e7j-59qk` Schools | **66** |
| `nps-nrhp` National Register | **37** |
| `6adp-a5yv` Colleges | **30** |
| `65ik-7wqd` POPOS | **11** |

**37 rows that were on the map are not any more, and 36 of them are duplicates
the merge found**: a new register publishes the same building with a polygon
where the old row had only a point (`Bandshell-Spreckels Temple of Music`,
`Stanford Hotel - 250 Kearny`, `Harvey Milk Recreational Arts Bldg`). The
thirty-seventh is §5's bug, and it was fixed rather than accepted.

**All 339 designated landmarks survive the merge**, counted rather than assumed.

---

## 3. Years — what was used, what was refused

`marks/BLOCK-N.md`'s four-rung ladder, unchanged, and **which rung a row used
travels with the row** as `yrule`:

```
1,206  already shipped, keeping the year it already had
  534  the roll year of the footprint it resolves to
  289  the made-land year of the ground under it
  116  the register's own published year of construction
   47  the first dated building standing inside its own extent
```

**Three published dates were refused, each for a stated reason.**

* **`7e7j-59qk` `open_date`.** 146 of the 235 rows read `1980-07-01`. That is
  where the California Department of Education's own record starts, not when
  the school opened — Mission High School carries it and its building is on the
  assessor's roll at 1927. A date that is wrong on 62 % of rows is not a date,
  so the schools take the year of the building they stand in.
* **`ejht-vp5d` `datelisted`.** `1899-12-30` on all 786 rows. That is the GIS
  null sentinel, not 1899.
* **NPS `CertDate`.** Real, and it is the day the Keeper of the National
  Register listed the property — not the year it was built. The
  Haas-Lilienthal House was built in 1886 and listed in 1973. Gating on it
  would delete eighty years of a building that is standing in the frame. It is
  carried as provenance and gates nothing.

**And one rule had to be added, because the brief's own example turned up in
the data.** BLOCK-N's third and fourth rungs — *the first dated building inside
the extent*, *the made-land year of the ground* — are statements about a piece
of **ground**. They honestly date a park or a campus, because there the ground
is the thing being named. They cannot date a **building or a structure**: the
National Register's own row for the **San Francisco–Oakland Bay Bridge**
carries no construction year and resolves to no footprint, and dating it from
the ground under it would have put a 1,829-metre label on the 1906 frame,
thirty years before the bridge was built. So:

> **A row from a building register that resolves to no dated footprint has no
> published year, and this block does not ship it.**

That drops 11 rows, and the Bay Bridge is one of them.

**398 of the 2,192 are named in every year** (`yr = 0`). Every one of them is
either a park or campus whose ground has no made-land year, or a place standing
on a footprint the assessor's roll does not date — and **the map draws an
undated footprint in every year too** (`FLAG_NOYEAR` in `scene.ts`). So the
name appears exactly when the map draws the thing it names, which is the only
claim being made.
---

## 4. The rejections, measured rather than asserted

Nothing below is set aside because it looked unpromising. Each was downloaded,
opened and counted, and the number is the reason.

**USGS GNIS, California Domestic Names — 52,722 rows, 222 in San Francisco
County.** The obvious file to reach for, and it does carry the names a reader
would want: `Twin Peaks`, `Mount Davidson`, `Lands End`, `Fort Point`,
`Alcatraz Island`, `Candlestick Point`. **It publishes `prim_lat_dec` and
`prim_long_dec` and nothing else spatial — one point per name, and not one
statement anywhere in the file about how big the thing is.** That is the rule
that dropped 725 rows from the existing build and it drops all 222 here. 59 of
them are class `Populated Place`, which is a neighbourhood, and the hood layer
already names those. It is on the record because *not being able to draw Twin
Peaks* is a real gap, and the honest place for it is a note rather than an
invented extent. (What a summit needs is the DESIGNATED lane's treatment — a
mark, which does not shrink, so a name can be written at a point. That lane is
reserved for Article 10, and opening it is a renderer decision, not a data one.
See §7.)

**`i28k-bkz6` Muni Stops — 3,260 rows.** Points, no extent, **and no year
anywhere in the file**. The brief's rule is that a station that opened in 1972
must not stand in 1912; this register cannot answer that question about a
single one of its rows, so the answer is not to ship it. The transit that *can*
be honestly dated is already here through the other registers — the Article 10
and City Facilities rows carry ferry, cable-car and rail structures with parcels
and roll years behind them.

**`r7bn-7v9c` Civic Art Collection — 1,038 rows.** Points, no extent. Where one
falls inside a footprint, that footprint is *the building the artwork hangs
in*, so the join would attach a sculpture's name to a building's size — a
category error the size ladder would then act on.

**`gtnh-hgvs` City Lands — 1,035 rows.** 996 distinct names, of which **215 are
already on the map verbatim** from the registers that ship, and **205 more read
as rights of way, remainders and utility parcels** (`SLOPE PROTECTION AT
ROOSEVELT`, `UNDEDICATED STREET (WINSTON DR)`, `CITY-OWNED PARCEL (1334038)`,
`SEWER R/W AT DIAMOND & KERN`). What is left after the duplicates is thin and
mixed, and the good half of it — `MARINA GREEN`, `FAIRMOUNT PLAZA` — arrives
anyway through Recreation and Parks. Not worth the noise; measured, not assumed.

**`38b7-6db3` Rec & Parks Functional Areas — 7,473 rows.** Sub-areas of the
properties `ib5c-xgwu` already covers, one level finer. 1,105 of the 7,473 names
occur once in the file, and those are the same rec centres and lodges the
facilities register publishes with better geometry.

**`3nje-yn2u` RPD Parks — 222 rows.** The same parks as `gtr9-ntp6`, which
already ships 255 of them.

---

## 5. Rules this block had to add, and one bug it made and caught

**A name a register puts on more than one of its own rows is a CATEGORY.**
`ib5c-xgwu` uses `facility_name` for the *kind* of thing as often as for the
name of one: `Landscaped Areas` sits on 422 rows, `Hardscaped Areas` on 354,
`Tennis Courts` on 59. A name that occurs once names one place. **1,768 of
2,689 go.**

**A name built only out of its own property's name and the file's own
vocabulary of kinds has not named anything the map does not already say.**
`Golden Gate Park Roadways` is the property `Golden Gate Park` plus the type
`Road`; `Glen Park Hardscape` is `Glen Park` plus `Hardscaped Area`;
`Lake Merced` is the property `Lake Merced Park`. The property is already on the
map from `gtr9-ntp6`, so those rows would put a second, worse name on a place
that has one. The residue is computed by stripping every word of the row's own
property name and every word that appears in any `facility_type` in the file,
on a four-character prefix match (`Roadways` against `Road`), and what is left
has to be a word — not a catalogue code like `GGP1`. **387 more go.**

*It was written because of what the first build put on the wide frame.* Before
these two rules the largest new names in San Francisco were `Golden Gate Park
Roadways` (1,547 m), `Lake Merced Natural Areas` (1,265 m) and `McLaren
Roadways` (766 m) — which is precisely "busier, not more alive". After them the
largest are `Harding Golf Course`, `San Francisco State University`,
`Strybing Arboretum`, `Polo Fields and Stadium`, `Kezar Stadium`,
`Spreckels Lake` and `Rhododendron Dell`.

**A name that is its own row's address is not a name.** 43 of the 180 tall
buildings are published as `350 Mission Street`, `33 Tehama Street` and so on —
`name == address` once case and punctuation are removed. They tell a reader
nothing the street layer does not already say. Dropped, counted, and it is a
string comparison between two columns of the same row rather than a judgement
about which names read well.

### The bug, which was this block's own

Merging the new registers **took the landmark mark off `Jack's Restaurant
Building`.** Article 10 publishes it in title case with a point; Article 11
publishes `JACK'S RESTAURANT BUILDING` over the same place *with a polygon*, and
therefore with a larger span. The one-name-per-block rule sorted by span alone,
so the row that has **not** designated it won, and a designated landmark
silently became an ordinary name.

Caught by comparing the designated count before and after — 339 to 335 — and
asking where four went. The fix is one line: that dedup now sorts designated
first, exactly as the one-name-per-footprint dedup already did, so **both rules
answer "which register outranks which" the same way**. After the fix: 339 to
339.

*The lesson is the one BLOCK-N wrote down and this block re-learned: a merge
rule that is right on one dimension can be wrong on another, and the only thing
that catches it is a count you took before you changed anything.*
---

## 6. What earns a label at each zoom, and why the frame cannot get busier

**The rule already exists and this block did not change it.** `labels.ts`
`PLACE_MIN_PX = 10`: an un-designated name is written only where the thing it
names is at least one line of type across on screen —

```
    span_m × 1.2247 × cam.scale  ≥  10 px
```

which is `lod/BLOCK-L.md` §7's street rule (*a name is only written where the
thing it names is at least as long as the name*) applied to a compact object.
Stated in metres, at `cam.base = 0.05565` (1440 × 940) and the three presets:

| camera | the thing must be | eligible BEFORE | eligible AFTER |
|---|---|---|---|
| whole city, z = 1.0 | **147 m** across | 339 designated + 59 named = **398** | 339 + 91 = **430** |
| district, z = 2.9 | **51 m** across | 339 designated + 309 named = **648** | 339 + 556 = **895** |
| block, z = 7.2 | **20 m** across | 339 designated + 694 named = **1,033** | 339 + 1,367 = **1,706** |

A designated place is exempt, and that is deliberate and pre-existing: it is
drawn with a **mark**, and a mark does not shrink — which is what lets a
nine-pixel building be named at all.

**AND THE INK CANNOT GO UP.** The budget in `labels.ts` is *exact*: a name is
admitted only if its own box fits in what is left, so the layer cannot overshoot
by one label the way a check-then-add cap does. Measured on the real page, the
same three cameras, before and after:

| camera | ink before | ink after |
|---|---|---|
| whole city | 0.0500 | 0.0565 |
| district | 0.0352 | 0.0358 |
| block | 0.0261 | 0.0261 |

**Adding 986 places did not put more ink on the frame; it put different ink on
it.** What changes is *which* places are named, and because the candidate list
is sorted by descending span and walked in that order, the largest thing in
view still wins first. That is the whole answer to "will 2,000 more names turn
every frame into a wall of text": they cannot, and the measurement says so
rather than the intention.

*(The whole-city figure moved from 0.0500 to 0.0565 — a 6.5 % rise inside a
budget another agent widened mid-night, from `HOOD_INK` to whatever it now is.
Both numbers were measured on the same source stamp, `78e0fd17`, five minutes
apart. It is not this block adding ink; it is the same exact budget being
filled by two more labels that happen to be longer names.)*

---

## 7. What the renderer needs — the wiring, precisely

**Nothing in `src/` was edited.** `CityMap.tsx`, `scene.ts`, `renderer.ts`,
`labels.ts` all belong to other agents tonight. This block emits data and the
note below.

### It already works, with no code change at all

`emit_places.py --marks` writes the merged list back into `base/marks.json` **in
that file's existing shape** — same base64 packing, same `d & 1` designation
bit, `SRC` grown from three entries to ten. The shipped `decodeMarks()` in
`CityMap.tsx` reads it unchanged, which is how the after-screenshots in §8 were
taken. That is a compatibility step, not the deliverable, and **it must be
re-run after `encode_city_chunks.py`**, which rebuilds `base/marks.json` from
the mock and would put the 1,243 back.

### The chunk, which is the deliverable

```
base/places.qc     42,032 bytes   (22,379 gzipped)   2,192 rows
base/places.json   59,363 bytes   (22,501 gzipped)   the names + meta + report
```

Manifest: `chunks` gains one entry `{k:"base/places", kind:"places",
tier:"base", minZ:0.0, b, gz, e, n}`; `kinds.places` carries the eight fields
and each one's provenance key; `sources` gains nine entries; and a top-level
`places` block carries the counts, the size-gate rule and the ink note.

**Base tier**, and it is the heroes' argument: the names are drawn at the
whole-city frame, so by the rule this layer is built to — *nothing is fetched
before the camera can show it* — they belong in the first paint.

| field | type | what it is |
|---|---|---|
| `x`, `y` | `i32` | **decimetres**; world metres = `v / 10`. Same quantum `base/marks.json` uses. Worst quantiser error 5.0 mm. |
| `span` | `u16` | world metres — what `placeIsBigEnough` is applied to |
| `bi` | `i32` | the building's index in the map's own order, `-1` where the place resolves to none |
| `yr` | `u16` | first year the name may be written; **0 = every year** |
| `fl` | `u8` | bit 0 designated (draw the mark), bit 1 the Golden Gate deck, bit 2 was already in `marks.json` |
| `src` | `u8` | index into `places.json` `SRC` |
| `yrule` | `u8` | index into `places.json` `YRULE` — which rung this row's year came off |

**The change to `CityMap.tsx` is four lines**, and it is strictly smaller than
what is there now, because the numbers stop being base64 and become a
zero-copy view:

```ts
// replace the fetch of base/marks.json with:
const [side, chunk] = await Promise.all([
  fetch("/data/us/sf/city/base/places.json").then((r) => r.json()),
  data.chunk("base/places"),            // it is in the base tier already
]);
scene.setPlaces(decodePlaces(side, chunk));
```

and `decodePlaces` is `decodeMarks` with `b64()` deleted:

```ts
function decodePlaces(s: PlacesSide, c: Chunk): PlaceLabel[] {
  const x = c.fields.x as Int32Array, y = c.fields.y as Int32Array;
  const sp = c.fields.span as Uint16Array, yr = c.fields.yr as Uint16Array;
  const fl = c.fields.fl as Uint8Array;
  const out: PlaceLabel[] = [];
  for (let k = 0; k < s.n; k++)
    out.push({
      name: s.t[k], wx: x[k] * 0.1, wy: y[k] * 0.1, spanM: sp[k],
      cls: (fl[k] & 1) !== 0 ? "designated" : "named",
      ...(yr[k] ? { year: yr[k] } : {}),
    });
  return out;
}
```

**Nothing else in the renderer has to change.** `PlaceLabel` is unchanged, the
two classes are unchanged, the size gate is unchanged, the ink budget is
unchanged, the pass order is unchanged. The rows arrive sorted by descending
span, which is the order `placeNames` already relies on.

### Two things the renderer could do that this block cannot

1. **`bi` is shipped and nothing reads it.** `labels.ts` strokes a designated
   place's own footprint ring when the camera is past whole-city; the same
   could now be done for any place that resolves to a footprint, which is 897
   of the new rows. The index is the map's own building order, so it is a
   lookup and not a search.
2. **A mark for a place with a position and no extent.** §4 measured 222 GNIS
   names in San Francisco — `Twin Peaks`, `Mount Davidson`, `Lands End`,
   `Fort Point`, `Alcatraz Island` — that publish a point and nothing about
   size, so the size ladder has nothing to rank them by and they are not
   shipped. The designated lane already solves exactly this problem with a mark
   that does not shrink. Opening a third class (`marked`, no size gate, its own
   third of the budget) would put them on the map without inventing an extent —
   but that is a renderer decision about what the mark *means*, and the mark
   currently means "the City designated this under Article 10". Not this
   block's call to make.
---

## 8. Looked at, on the real page

`shot.py before` / `shot.py after`, prod at `localhost:3000/us/city/sf/the-city`,
1200 × 680 DPR 2, year 2018, three cameras. It drives `website/.parity/`'s own
capture harness, so the film is handed the camera back before the shutter
(`filmOn` asserted false), the stage size is asserted, the tier counts have to
stop moving, and two identical frames 700 ms apart are required.

**All six frames are stamped `src = 78e0fd17`** — the same render source on
both sides. That matters: five other agents are in the render modules tonight
and three earlier attempts at this pair straddled a change, which shows up as a
building-colour difference that has nothing to do with names. Two of the traps
that cost those attempts are now assertions in `shot.py` (§9).

```
shots/t2-{before,after}-{whole,district,block}.png     the frames
shots/t2-pair-{whole,district,block}.png               before over after
shots/t2-{before,after}.json                           counts, names, ink, src stamp
```

| camera | names before | names after | what changed |
|---|---|---|---|
| whole city | 27 | **29** | `+ City College of San Francisco — Ocean`; `Twin Peaks` and `Crocker Amazon Playground` displaced |
| district (Embarcadero) | 19 | **18** | `+ University of California-San Francisco — Mission Bay`; `H. WELTON FLYNN DIV.` (a transit yard) and `Pier 17 - Shed Building` displaced |
| block (downtown) | 12 | **15** | `+ BANK OF AMERICA, THE EMPORIUM, One California, Shaklee Terraces, Millenium Tower, Jasper, Trinity Alley, Civic Center Plaza` |

### Is it more alive, or merely busier — honestly

**At block zoom it is unambiguously more alive.** Before, the Financial District
was fifty grey towers with four names on them and the rest of the frame's ink
spent on `MOSCONE CENTER (South)`, `Moscone West`, `UN Plaza` and
`1455 Market St Building`. After, the towers read: **BANK OF AMERICA**,
**One California**, **Shaklee Terraces**, **Millenium Tower**, **Jasper**, and
the domed building in the middle of the frame — which a reader can see is
somebody's landmark and could not previously identify — says **THE EMPORIUM**.
Three more labels, the same ink, and a reader who could not name one tower can
now name six.

**At district zoom it is a wash, and I am not going to claim otherwise.** One
name changed. It changed for the better — a transit division yard gave its slot
to a university campus — but the frame is essentially the frame it was.

**At whole city it is close to a wash too**, two names' worth. The reason is
arithmetic and it is in §6: at 147 m the gate admits 91 un-designated places out
of 1,853, and the 339 designated ones are exempt and go first, so the wide
frame's budget was already full before this block added anything. **Almost all
of the 986 new places are buildings, and a building is not 147 m across.**

That is the shape of the win: **the ladder descends, and this block loaded the
bottom of it.** 1,033 → 1,706 places are eligible at block zoom, 648 → 895 at
district, 398 → 430 at whole city. The reader who zooms in is the one who gets
the new city.

**One thing was noticed on the frame and fixed because of it.** The first build
put `425 Market St`, `555 Mission St` and `50 California St` on downtown
towers, from the POPOS and Tall Building registers, whose `name` column is
often the address of the building the space is in. On a block frame those read
as street labels lying on the wrong object. The fix is the rule that was already
in the file for one register applied to both, as a prefix comparison between two
columns of the same row: **108 rows dropped, and the frame in the table above is
the frame after it.**

---

## 9. Found and not fixed

* **`website/.parity/capture.py` ends in a bare `asyncio.run(main())`.** No
  `if __name__ == "__main__"` guard, so `import capture` does not give you its
  functions — it runs the whole sixteen-camera sweep against both builds,
  overwrites `out/ledger.dpr2.json` and every `*.mock.png` / `*.prod.png`, and
  only then returns. Cost here: one twenty-minute stall with somebody else's
  output in this script's log, and a ledger overwritten that another agent may
  have been reading. **Not fixed, because another agent is using that file
  tonight.** `shot.py::_load_capture()` works around it by compiling the source
  with that one line removed — one three-line function, and it names the reason.
  Whoever owns `.parity/` next should add the guard.
* **`cam.base` is stale for the first camera after `prod_open`.** A refit can
  land after the harness's 2,500 ms wait, and then the absolute scale computed
  from the base read at open is wrong while `cam.scale` itself matches what was
  asked for — so every check in `prod_shoot` passes and the frame is filed at
  the wrong zoom. Measured: a whole-city frame at `z = 1.461`, twice, looking
  perfectly settled. `shot.py` now re-reads `cam.base` before every camera and
  will not accept a shot unless the **absolute scale and the preset multiple**
  both come back right. That is NIGHT.md trap 7 with a second edge on it, and it
  is worth folding into `capture.py` itself.
* **A handful of Recreation and Parks rows still read oddly** — `26 Acres
  Hardscaped Areas`, `Tennis Courts Non-Landscaped Grnspc`, `West Marina Yacht
  Harbor WATER`. They survive both §5 rules because their residue is a real
  word the file's own vocabulary does not contain (`acres`, `grnspc`, `water`).
  There are about six of them out of 986 and their spans are small. **They are
  left in deliberately**: the alternative is a list of names that read badly,
  and there is no list of important places in this pipeline and there must never
  be one. Same reason BLOCK-N left `ITALIAN AMERICAN BANK` and `HIGH SCHOOL OF
  COMMERCE` at the top of the designated lane.
* **85 of the 170 National Register points do not fall inside any footprint** —
  a 1970s listing's geocode lands on the sidewalk — so they have no published
  extent and are not shipped. A nearest-footprint-within-N-metres rule would
  recover most of them and would be a new geometric claim this block did not
  want to make. The strict containment test is `marks/join_fp.py`'s and it was
  kept.
* **The base tier is at 675,338 gzipped bytes against a 716,800 ceiling** that
  `data.test.ts` asserts, with `base/places.qc` costing 22,379 of it. 41 KB of
  headroom for everyone else tonight. If that test goes red, this is a candidate
  for a non-base tier — the names are drawn at whole city, so it would be the
  wrong call, but it is the cheapest one available.
* **`Civic Center Plaza Landscape` and `GGP1 Kezar Stadium Landscape` ship
  alongside `Civic Center Plaza` and `Kezar Stadium`.** The residue rule cannot
  see them as duplicates because their names differ and the one-name-per-block
  rule matches on the name. Both are small and neither has won a label on any
  frame shot here.

---

## 10. Files

```
fetch_places.py     the downloads, each with url / bytes / rows / sha256 /
                    retrieved-at, plus the publisher's own column descriptions
build_places.py     eight registers + the 1,243 already shipped -> one list,
                    every cut counted -> cache/_places.json
_geom.py            the projection (read out of the shipped manifest, not typed)
                    and the ring arithmetic
emit_places.py      -> base/places.qc + base/places.json + the manifest entries
                    --marks also rewrites base/marks.json in its existing shape
verify_places.py    the round trip, element for element, and all three container
                    checks broken on purpose to prove they fire
shot.py             the before/after frames, driving website/.parity/
PLACES.md           this file
cache/              the registers as published, plus _places.json
shots/              t2-*.png and the two ledgers
```

Run order:

```
python3 pipeline/scripts/us_sf_places/fetch_places.py
python3 pipeline/scripts/us_sf_places/build_places.py
python3 pipeline/scripts/us_sf_places/emit_places.py --marks
python3 pipeline/scripts/us_sf_places/verify_places.py
```

Baseline at hand-off: **typecheck clean · 314 tests passed · 7 eslint warnings,
0 errors** — the same six product files. Nothing committed.

---

## Addendum — the two names that were missing, and what each one cost

### Sutro Tower — added, from the hero register

In none of the ten registers above, none of the 1,243 already-shipped marks,
and not in USGS GNIS either (which carries `Mount Sutro` and `Sutro Reservoir`,
not the tower). `emit_places.py` `hero_rows` gives any hero with no place row
one, read off `base/heroes.json` and `base/heroes.qc`: name, footprint index,
year, and the ground anchor `part3.html` itself uses. `span` is §-the-ladder
unchanged, `max(sqrt(662.0), 210.0) = 210 m`. One row today; general for the
next hero.

### Ocean Beach — NOT added, and the reason is rule 2

GNIS **does** carry it: feature id 229920, class `Beach`, world (−6407.5,
−69.6). What stops it is this file's own rule 2 — *a published extent, or not
drawn* — and §4's measurement of GNIS: **0 of 222 rows carry one**, and the
file has no column that could. A row with `span = 0` is a name the size gate
can never admit, so shipping it would ship a name that cannot be drawn.

The `sf_place_candidates.json` seed's federal exclusion is a **different rule
for a different artefact** — that seed is about places city money reaches, and
a named ground is not one. It stays as it is. What is open is how to size a
name with a position and no extent, which is §401's own item, and the map
already has a lane that needs no size: `terrain.ts` `surroundNames`. That lane
is not this pipeline's.

**And the pattern under both.** On Ocean Beach's ground the City's registers
name `Beach Chalet`, `Beach Chalet Parking`, `Beach Chalet Picnic Area`, the
Soccer Fields maintenance building and an SFMTA operator bathroom — and not the
beach. The City publishes extents because it publishes property; it owns the
buildings at the edge of the federal ground and not the ground. The same shape
turned up independently this session in the street data: 381 centrelines in
Hunters Point, Treasure Island, Yerba Buena and Fort Mason draw nothing because
their City classification code is null. **A gate written against a City
attribute is blind on ground the City does not publish.**

---

## Addendum 2 — §HELD: 934 of 2,199 labels said they existed in 1906, and 890 of them could not know that

Daniel, having read the shipped `base/marks.json` himself:

> "Of 2,199 map labels, **934 assert they exist in 1906 or earlier** — 399
> carry year 0 (drawn in every year) and 326 carry exactly 1906, which is the
> scrub floor, not a fact… The Palace of Fine Arts case contradicts the film."

### What the sample looked like

```
Opera House               1906     the War Memorial opera house opened 1932
Palace Of Fine Arts       1906     built for the 1915 Panama-Pacific Exposition
San Francisco Zoo         1906     opened 1929
John McLaren Park         1906     laid out in the 1920s
Murphy Windmill           1906     1908
Sigmund Stern Rec Grove   1906     the Sterns gave the land in 1931
```

One of the film's own shots is about the Palace of Fine Arts surviving the
1915 Exposition, and the map was writing its name on the 1906 frame.

### §3's last paragraph was the defect, and it was written in good faith

> *"398 of the 2,192 are named in every year (`yr = 0`) … the map draws an
> undated footprint in every year too. So the name appears exactly when the map
> draws the thing it names, which is the only claim being made."*

That argument is sound for a **shape** and false for a **name**. A polygon on
1906 dune asserts nothing a reader can check — the ground was there. A NAME on
a dated frame is a sentence with a date in it. The map's general rule (a thing
the record cannot date is declared, counted and drawn in every year — undated
street trees, the canopy, the 2,916 `FLAG_NOYEAR` footprints, `time.ts`) has
one exception and this is it.

### The two ways the floor got in, and they looked like two bugs

| shape | rows | what it is |
|---|---:|---|
| `yr = 0` | 399 | no year at all; the renderer reads it as *every year* |
| `yr = 1906` | 326 | `SCRUB_MIN`, arriving as `build_bldg.py`'s `FLAG_NOYEAR` fallback and read back out as if a publisher had said it |

`Parkside Square` and `Sunset Rec Center` came out of the same register on the
same day and got 0 and 1906 respectively. Same ignorance, written two ways,
neither of them a date.

### Half the register could not say where its year came from

`yrule` answered **`0 — already shipped in base/marks.json` for 1,206 of
2,199 rows**, because `shipped()` reads `marks-data.js` and that file was
written without the rung. That is a provenance for the ROW and not for its
YEAR, and it also silently swallowed §GGB's rung 5 — the Golden Gate Bridge is
one of the inherited rows, so the correction that moved it from 1933 to 1937
never reached the chunk's `yrule` column at all.

`_year_basis()` recovers the rung for all 1,205 from the same two published
files the ladder itself read, and **rung 0 is now empty**:

* a row that resolved to a footprint and whose year is **not** that footprint's
  year cannot have come off the footprint, and rung 1 is the only rung above
  rung 2 — so it is the register's own `yearbuilt`. Traced: Ferry Building 1898
  against a 1896 roll, The Old U.S. Mint 1869 against 1914, Coit Tower 1934
  against 1952. All three correct.
* a row that resolved to a footprint and **did** take its year is rung 2, and
  `bldg-data.js`'s `u & FLAG_NOYEAR` says whether that footprint is dated at
  all.
* a row with **no** footprint took a ground rung, unless its register publishes
  a construction year — and of the three registers in the inherited set only
  `97yj-54sx` does (DRAW.md §33.8b read every column of the other two). So the
  split is by register and it is exact.

Two files are used and each only for what it is authoritative about: the mock's
`fpidx.pkl` for *which number did this row copy* (it is the number the ladder
copied) and `bldg-data.js`'s `u` for *is that footprint dated at all*. They
disagree about the roll year on 7,559 of 166,166 footprints, which is why they
are not used interchangeably; they share one index space, verified by row count
and by 400 sampled centroids agreeing to within a metre.

### What each year rests on, all 2,199

```
  330  the register's own published year of construction        KNOWN
 1078  the assessor roll year of the footprint it stands on     KNOWN
    1  this repository's own seed, with the reason it states    KNOWN
  224  NONE — the 1906 no-year fallback of the footprint         held
  167  NONE — a statement about the GROUND, not the thing named  held
  399  NONE — no published field gives it a year at all          held
```

**1,409 known · 790 held.** And of the 326 rows sitting on exactly 1906,
**only 44 are genuinely dated 1906** — 36 off an assessor roll, 8 off a
register. The other 282 are the floor.

### The treatment: held off the clock, not deleted

A held row ships `yr = YR_NONE = 65535`, which is not a year and cannot be read
as one. `labels.ts`'s existing gate then does the right thing with no client
change at all:

```
the un-clocked map (where the page lands)   →  the name is written
any year on the rail · every frame of the film  →  the name is held
```

Which is the sentence the record supports: *this register names this place; no
published field says when.* The polygon draws at 1906 either way.

**It is narrower than "hold everything before 1907"**, which would delete true
things — the Ferry Building really is 1898 and the Old Mint 1869, and both
still draw at 1906.

### Measured on the real page, not argued

Whole-city camera, place-name lane, `labels.ts`'s own `LPROBE`:

| year | names written, before | after |
|---|---:|---:|
| 1906 | 26 | 13 |
| 1915 | 26 | 14 |
| 1932 | 26 | 15 |
| 1960 | 26 | 16 |
| 2020 | 26 | 16 |
| **un-clocked** | **26** | **26** |

The 1906 frame keeps Ferry Building, The Old U.S. Mint, Chronicle Building,
Fairmont Hotel, Ghirardelli Square, Baker & Hamilton Building, Calvary
Presbyterian Church, Oriental Warehouse, Notre Dame School and the piers, and
loses Palace Of Fine Arts, San Francisco Zoo, San Francisco State University,
Twin Peaks, Pine Lake Park and Mission Dolores Park. **It does not read as a
blank**: the neighbourhood lane and the street lane carry the orientation at
that camera and neither is touched, so PRESIDIO, GOLDEN GATE PARK, TWIN PEAKS,
NOE VALLEY, BAYVIEW HUNTERS POINT, MARKET ST, GEARY BLVD and MISSION ST are all
still on the 1906 frame.

### One of Daniel's own examples did not survive, and it should be said out loud

> "the Ferry Building (1898), the Old US Mint (1869), **the Dutch Windmill
> (1902)** are correct and must keep drawing."

The Ferry Building and the Old Mint keep drawing. **The Dutch Windmill does
not.** Its year in this pipeline is the 1906 `FLAG_NOYEAR` fallback of the
footprint it stands on — it comes from `nc68-ngbr`, which publishes no year of
construction — so **no published field this pipeline reads says 1902**, and the
honesty rule forbids typing it in. Murphy Windmill (1908) is the same. Both
draw their shapes at 1906 and are named on the un-clocked map. If those two
should carry their real years, the way to do it is `places_extra.json`'s seed
rung, which requires a `why` beside the year — a source, not a recollection.

### What is NOT here

**No park was dated.** DRAW.md §33.6 and §33.8b opened all five candidate
registers and read every column: `gtnh-hgvs`, `gtr9-ntp6` and `ib5c-xgwu` carry
only GIS load stamps — `gtr9-ntp6.created_date`'s own description is *"timestamp
from ArcGIS Online"* and its distribution is one ArcGIS write on 2025-12-18, 77
rows in a single second — and `3nje-yn2u` and `8du2-b837` have no date column at
all. `sf_place_candidates.json` has no date field either. **This addendum adds
no year to anything; it removes years that were never there.**
