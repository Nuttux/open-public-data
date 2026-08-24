# REACH — can the map show what the city decided outside its own boundary?

Block X1. Investigation first, implementation second. Everything below is measured against
the shipped files or the corpus in this repo; nothing is asserted from memory. Where a number
came from a coordinate I typed rather than from a published dataset, it says so.

Daniel's question:

> "level of zoom, today it seems very focused on the north, if the municipality expands or
> covers other areas these could be seen on the map or is that not a good idea?"

**Short answer: he is right that the map cannot show the city's reach, wrong about why, and
the fix is not a zoom-out.** The recommendation is at §6.

---

## 1. Two corrections to the brief, both measured

The brief handed me two premises. One is wrong and one is right for the wrong reason. Both
change the shape of the work, so they go first.

### 1.1 `CN` is not a county. `SM` is, and it is a 475-metre kerb strip.

The brief says *"~4,257 footprints in the shipped file are already outside San Francisco (the
`SM` and `CN` county prefixes)"*. The prefix counts are real and are stated in
`scratchpad/sf-city-anim/bldg/pnjoin.py`: **SF 172,698 / SM 3,207 / CN 1,118** of 177,023
footprints in `ynuv-fyni`. I re-derived them from `bldg/cache/fp-*.json` and got the same
three numbers exactly.

But the geometry says the two prefixes are nothing alike. Bounding boxes over every vertex:

| prefix | n | lon | lat | what it actually is |
|---|---|---|---|---|
| `CN` | 1,118 | −122.50964 … −122.36548 | 37.70541 … 37.81087 | **the whole of San Francisco** |
| `SM` | 3,207 | −122.48559 … −122.39737 | 37.70475 … **37.70901** | a band **~475 m tall** on the south county line |

`CN`'s bounding box *is* San Francisco's bounding box. Those 1,118 footprints are distributed
across the entire city and are not outside anything — whatever `CN` encodes in `mblr`, it is
not a county. **They should not be counted as reach.**

`SM` is genuinely San Mateo County, but it is 0.0043° of latitude deep: the houses on the far
side of the street from Daly City, Brisbane and Colma, which DataSF's footprint layer carries
as a thin buffer past the line. It is **not** the airport, **not** Sharp Park, **not** the
watershed. SFO's own footprints are not in `ynuv-fyni` at all.

So the honest number is **3,207 footprints outside the county, all of them within 475 m of it**,
not 4,257 — and none of them is a thing San Francisco decided. They are a border artefact of
the source extract. The interesting reach is not in the building file.

### 1.2 The terrain to show SFO **already ships**. The camera is what stops.

This is the finding that changes the cost.

`manifest.surround` — TIGERweb shoreline + USGS 3DEP elevation, both public domain — covers

    bbox   lon −122.62 … −122.10      lat 37.60 … 37.95
    world  x −16,017 … 29,747 m       y −17,811 … 21,151 m     (45.8 km × 39.0 km)

The chunk grid, by contrast, is `originX/Y −8192`, 16×16 cells of 1024 m — **16.4 km square**.
The surround plate is already **eight times the area of the chunk grid**, and its southern edge
at lat 37.60 sits *below SFO*.

What stops the reader is two lines in `website/src/lib/city/camera.ts` — and because reading
code is not measuring it, both were then put to the running page by
`pipeline/scripts/us_sf_reach/reach_minz_probe.py`:

- `MINZ = 1` — *"below the fit there is nothing to see but surround, and every pixel spent on
  empty bay is a pixel not spent on San Francisco."* The camera cannot zoom out past the
  whole-city fit.
- `cityBBox()` builds the pan clamp by walking ground samples **inside the city's own coastline
  mask**. The box the reader can pan inside is San Francisco's land and nothing else.

**Measured, against the live renderer:** sixty successive outward wheel events
(`cam.zoomAt(scale * 0.85, …)`, which is what a wheel handler computes) leave the camera at
**z = 1.0000**, and the reduced-motion cut `cam.cutTo(base * 0.1, …)` also returns **z = 1.0000**.
Assigning `cam.scale` directly *does* sail past it to z = 0.10 — the floor lives in the zoom
entry points, not in `clamp()` — which is how the probe in §5 got its picture, and which is not a
path any reader has.

*(Worth recording as a trap: `zoomAt`'s first argument is an ABSOLUTE scale, not a factor. My
first probe passed `0.85` as a multiplier — about 14× the fit — and the camera clamped to
`maxScale` and reported z = 11.95. That reads exactly like "the floor does not hold", and it was
simply the wrong call. Both numbers above are from the corrected probe.)*

Both are good decisions for the piece as it stands. But together they mean the peninsula is
loaded, rendered-capable and unreachable. **Daniel is not looking at a data limit. He is
looking at a deliberate camera limit, and he noticed it from the outside — which is the
strongest possible evidence that the limit reads as an omission rather than as a choice.**

---

## 2. How far the city's record actually reaches

Distances in world metres from the projection in `manifest.json`
(`lon0 −122.438, lat0 37.76, mpd 111320, cosl 0.7905827`).

**The coordinates in this table are approximate positions I typed to get an order of magnitude.
They are NOT published geometry and must not be shipped as positions.** §4 is where published
geometry is settled.

| thing | ≈ dist from City Hall | in the 16.4 km chunk grid | in the shipped 45.8 km surround |
|---|---|---|---|
| Treasure Island | 5.9 km | **yes** | yes |
| Colma cemeteries | 11.8 km | no | **yes** |
| SFO | 17.9 km | no | **yes** |
| Sharp Park, Pacifica | 18.1 km | no | **yes** |
| Crystal Springs Reservoir | 28.2 km | no | no |
| Pulgas Water Temple | 35.4 km | no | no |
| Farallon Islands | 52.0 km | no | no |
| Sunol / Irvington / Calaveras | 50–62 km | no | no |
| Moccasin powerhouse | 186.6 km | no | no |
| Camp Mather | 225.8 km | no | no |
| O'Shaughnessy Dam | 232.4 km | no | no |

The reach is not one distance. It is **three**, and that is the single most important fact in
this document:

- **Ring A — already drawn, just not reachable.** Treasure Island (in the grid), and Colma,
  SFO and Sharp Park (in the surround plate). 0–20 km.
- **Ring B — real terrain, not shipped.** The peninsula watershed, Crystal Springs, Pulgas,
  the Farallones, the Alameda watershed. 25–62 km.
- **Ring C — a different continent as far as this projection is concerned.** Moccasin, Camp
  Mather, O'Shaughnessy. 185–235 km.

One map cannot hold A and C. §5 shows what it costs to try.

---

## 3. What the corpus holds

`scratchpad/sf-city-anim/entries/` — 41 entries, **397 beats**, every beat carrying a scan
citation to a leaf on archive.org.

**66 of 397 beats (16.6 %) name a place outside the City and County of San Francisco.**
15 of the 41 entries touch outside the line at least once. Swept with word-boundary patterns
over 33 out-of-county place names, with the two obvious false-positive traps removed —
`Marin` vs `Marina`, and `O'Shaughnessy` the City Engineer vs `O'Shaughnessy Dam`.

| entry | beats naming outside / total | the places named |
|---|---|---|
| `hetch-hetchy` | **20 / 21** | Hetch Hetchy ×25, Coast Range Tunnel ×9, Moccasin ×8, San Joaquin ×3, Tuolumne ×2, O'Shaughnessy Dam ×2, Alameda ×2, Yosemite ×2, Crystal Springs ×2, Livermore, Irvington, Tesla |
| `event-san-mateo-consolidation-1931` | **8 / 8** | San Mateo County ×14, Hetch Hetchy ×2 |
| `treasure-island` | 7 / 10 | Treasure Island ×8, Yerba Buena Island ×2, Oakland |
| `treasure-island-redevelopment` | 6 / 7 | Treasure Island ×8, Yerba Buena Island |
| `mills-field-sfo` | 4 / 10 | San Mateo County ×3, San Bruno, South San Francisco |
| `water-system-improvement-program` | 4 / 12 | Hetch Hetchy ×4, Calaveras ×2, Yosemite |
| `bay-bridge` | 3 / 8 | Alameda ×3, Oakland ×2 |
| `golden-gate-bridge` | 3 / 9 | Marin County ×5, San Mateo County |
| `clean-water-program` | 3 / 13 | Farallon, San Joaquin, Yosemite |
| `sunset-tunnel` | 3 / 10 | Hetch Hetchy ×3 |
| `auxiliary-water-supply-system` | 1 / 8 | Hetch Hetchy |
| `event-1906-earthquake-response` | 1 / 7 | Oakland |
| `main-library-1917` | 1 / 7 | San Bruno |
| `mission-bay` | 1 / 15 | Treasure Island |
| `transbay-transit-center` | 1 / 10 | Oakland |

**The record is good, and in two places it is better than the map deserves.**

`hetch-hetchy` is 21 beats, 20 of which name somewhere outside the county, and its own
`geometry_source` field already does the honest work:

> "PARTLY IN RECORD. The corpus names the fixed points — O'Shaughnessy Dam, Early Intake,
> Moccasin Creek power house, the Foothill Division tunnels to the San Joaquin Valley, the
> 47-mile San Joaquin pipe line, the Tesla and Irvington portals of the 28-mile Coast Range
> Tunnel, the Alameda Creek portal, the Bay Division and Dumbarton crossing, Pulgas tunnel and
> Crystal Springs Reservoir — and calls the whole 'our 150-mile aqueduct'. **Land is described
> in section and township, not in coordinates**, so the line still has to be drawn from outside."

`mills-field-sfo` is the best single argument in the entire corpus that the map is too small,
and it makes the argument in the Board's own words. Resolution No. 26816, 14 February 1927,
`journalofproceed22sanfrich` n277:

> "Whereas, there is not a sufficiently large area of land within the confines of the City and
> County of San Francisco suitable for airport purposes…"

**The Board wrote the reason for the reach into the operative text of the resolution.** And the
consequence shows up twenty-two years later in the same entry, 1949, `journalofproceed44sanfrich`
n104 — *"whose fire engines put out fires at an airport in the next county?"*

There is one more thing the sweep found that matters for design. `sfo-capital-plan-bonds` has
**12 beats and zero out-of-county place names**: the modern Legistar matters say "the Airport",
never "San Mateo County". The 1927 record knows the airport is somewhere else; the 2018 record
has forgotten. A reach feature that reads place names out of beat text would silently miss the
entire modern half of SFO. **Reach has to be a property of the entity, not a regex over beats.**

---

## 4. What is published, and what is not

**This section is deliberately thin, and that is the finding.** A research pass on external
published geometry — SFO's boundary, the Hetch Hetchy system, the two SFPUC watersheds, Sharp
Park, Camp Mather, the Farallones, the Colma cemeteries — was still running when this was
written, and **nothing external is asserted here until it is confirmed.** No dataset id appears
in this document that I have not seen in this repo.

That is not a stall. It is the point of §6: **the recommended feature does not depend on this
section.** The reach ledger is built entirely from the city's own record and needs no geometry
at all. External geometry is required only for the optional locator inset, and if it turns out
not to be published, the honest answer is the one the corpus already gives — *not on this map,
here is the county, here is the resolution, here is the leaf* — and we stop.

Two things are settled from inside the repo:

- **The county boundary is published and is already in use**: `txuc-3kzm`, DataSF, the boundary
  of the City and County of San Francisco. `emit_surround_coast.py` documents that it is a
  **legal** boundary that "runs kilometres into the Pacific and straight across the Golden
  Gate", and that 4,787 of 43,187 city ground cells (11.1 %, 13.86 km²) are open water inside
  it. That file already reasons carefully about the difference between the legal boundary and
  the shoreline, which is exactly the distinction a reach feature turns on.
- **The 2,192 marks** in `base/marks.json` come from ten DataSF datasets (`5kya-mfst`,
  `65ik-7wqd`, `6adp-a5yv`, `7e7j-59qk`, `97yj-54sx`, `ejht-vp5d`, `gtr9-ntp6`, `ib5c-xgwu`,
  `nc68-ngbr`, `nps-nrhp`). Four are on Treasure Island. **None is outside the county** — no
  airport, no Hetch Hetchy, no Colma, no Sharp Park, no Farallones. The mark layer stops at the
  line too.

---

## 5. What a zoom-out costs

The camera is `pxAcross 1.2247`, presets `whole 1.0 / district 2.9 / block 7.2`. The manifest's
nominal `baseAt1440x940` is 0.05565, but the fit is computed against the strip the reader can
actually see rather than the raw canvas, so the live value differs: **measured on the running
page at a 1440 px stage, z = 1 shows 19.9 km across** (`reach_zsweep.py`). Everything below uses
the measured number, not the nominal one.

Holding the viewport at 1440 px, here is what San Francisco itself — about 11 km across — shrinks
to as the frame is widened to reach each ring:

| frame must span | SF renders | % of today's whole-city scale |
|---|---|---|
| 16.4 km — today's chunk grid | 966 px | 121 % |
| **26 km — the plate's own limit (z ≈ 0.76)** | **609 px** | **77 %** |
| **36 km — SFO, Colma, Sharp Park** | **440 px** | **55 %** |
| 72 km — Crystal Springs, Pulgas | 220 px | 28 % |
| 104 km — the Farallones | 152 px | 19 % |
| 124 km — Calaveras, Irvington | 128 px | 16 % |
| **466 km — Hetch Hetchy, Camp Mather** | **34 px** | **4 %** |

Two rows in that table are the whole answer.

The **26 km** row is where the world runs out — measured, not modelled. `reach_zsweep.py` pulls
the camera back in steps and samples forty points around the frame edge against the void colour
(219, 219, 215), sampled off `shot-3-peninsula.png` where the plate demonstrably ends. At z = 0.80
the world still fills the frame; by z = 0.74 eleven of forty edge samples are bare page. So the
honest pull-back budget is **z ≈ 0.76, about 26 km.**

And the span is not even the binding constraint. The plate's southern edge is at world
y = −17,811 m; the airport sits at roughly y = −15,440 m (§2's approximate position, flagged as
such). **SFO is about 2.4 km inside the edge of the world.** So it is not that the frame is too
narrow to hold the airport — it is that *any* frame containing the airport also contains the
place where the ground stops. Lifting `MINZ` tomorrow would not show SFO; it would show SFO
sitting on the rim of a rectangular slab. Extending the plate is the real prerequisite, and §7
argues against paying for it just to remove an edge.

*(A first pass at that sweep used a brightness heuristic for "page" and reported an edge at
z = 1.00, where `shot-1-today.png` plainly has none: the pale surround terrain at (228, 223, 210)
is only nine steps of red away from the void and was being counted as void. The measured-colour
test is in the script with that reason written next to it.)*

And the **466 km** row is the answer to *"or is that not a good idea?"*. To put O'Shaughnessy Dam
on the same continuous map as City Hall, San Francisco — every block, every street, all 150,905
buildings, the entire subject of the piece — becomes **34 pixels wide**. A postage stamp. The
zoom-out is a 28× linear, **811× areal** expansion, and essentially all of the new area is
Central Valley farmland in which the city decided nothing whatsoever.

---

## 6. Recommendation

**Build the reach ledger. Do not zoom the map out, and do not build a second map.**

Three measurements decide it, and none of them is a matter of taste.

1. **The record can say where a decision went and why, in the Board's own words, with a leaf
   citation — and it cannot say where anything is in coordinates.** Both of the two entries that
   matter most say so themselves, unprompted, in their own `geometry_source`: Hetch Hetchy's land
   is "described in section and township, not in coordinates", and Mills Field is "a survey-grid
   description in San Mateo County, not a mappable boundary". The corpus is rich in *reasons* and
   empty of *positions*. A feature built on reasons is a feature the record can carry; a feature
   built on positions is one it cannot.
2. **A continuous zoom-out to Hetch Hetchy renders San Francisco 34 px wide** (§5) — an 811×
   areal expansion, almost all of it ground where the city decided nothing.
3. **Even a modest pull-back is already blocked, 10 km short of the airport.** Measured with
   `reach_zsweep.py`: below **z ≈ 0.76 (~26 km across)** the surround plate's own rectangular
   edge enters the frame and the world becomes a slab floating on paper — see
   `shot-3-peninsula.png`. A frame that holds SFO needs ~36 km. So "just let the reader zoom out
   a bit" is not free either: it costs a plate extension, which is new TIGER + 3DEP raster.

So the honest feature is **not cartographic**. It is: *a decision that is not on this map gets
named, counted, placed by county, and quoted.* That is the house convention already — unplaced
things are shown as unplaced and counted, never guessed — and `NOT ON THE MAP` is already on
screen for one shot of the film. **The work is to promote that badge from an apology into the
argument.** "The city is bigger than the city" is not a caveat; it is the most interesting thing
the corpus knows, and right now it is a grey label in the corner of one shot.

### What I built

`website/public/data/us/sf/city/reach.json` — 14.7 KB, emitted by
`pipeline/scripts/us_sf_reach/build_reach.py` from `reach_seed.json`, deterministic (identical
md5 on re-run), **carrying no coordinates at all**.

| reach | n | what it means |
|---|---|---|
| `outside` | 3 | `mills-field-sfo`, `hetch-hetchy`, `water-system-improvement-program` |
| `shared` | 2 | `golden-gate-bridge` (Marin), `bay-bridge` (Alameda) — SF is one party, not the owner |
| `made_land` | 2 | `treasure-island`, `treasure-island-redevelopment` — inside the county, but ground the city *made* |
| `annexation` | 1 | `event-san-mateo-consolidation-1931` — the city proposing to move its own boundary |
| `unstated` | 1 | `sfo-capital-plan-bonds` — outside, but its own record never says so |

**5 entries are off the map, and they carry 63 of the corpus's 397 beats.** That is the headline
number for the `extent` criterion: **16 % of everything the film and the fiches can say is about
somewhere the map refuses to go.**

Every non-`in_city` row carries the fragment that proves it and the leaf it is on, and
**`build_reach.py` re-checks each fragment against the entry's own quote on every run.** I
verified the guard bites by "correcting" the OCR's `con fines` to `confines` in the Mills Field
evidence — the build failed, which is the right answer. That is the same discipline as
`verify_quotes.py`, and it is why this chunk can be trusted without a human re-reading it.

The best row is Mills Field, because the argument is made by the Board and not by us —
Resolution No. 26816, 14 February 1927, `journalofproceed22sanfrich` n277:

> "there is not a sufficiently large area of land within the con fines of the City and County of
> San Francisco suitable for airport purposes"

**The reason the map is too small is in the operative text of a resolution the city adopted.**
Put that sentence on screen and the extent question stops being a limitation and becomes the
story. The corroborating beat is 1949 — *whose fire engines put out fires at an airport in the
next county?* — twenty-two years of the same awkwardness, in the record.

And `sfo-capital-plan-bonds` is deliberately shipped as a **gap, not a guess**: 12 beats, and not
one of them says where the Airport is. The 1927 Board argued about being in another county; the
2000–2018 Board has stopped mentioning it. The chunk records what was sought, where it was
searched and that it was not found, exactly like the `not_found` blocks in the entries.

### The one geographic gesture worth making, and only if §4 allows

If — and only if — published geometry exists for the handful of things in §4, the honest second
step is a **locator inset**: a small panel at a *declared and visibly different* scale, shown
only when a reach entity is selected, never persistent. A separate register that announces
itself is honest; a continuous map that quietly changes what a centimetre means is not. It must
carry its own scale bar and its own source line, and it must show **nothing but** the published
geometry — no aqueduct line hand-drawn between named portals.

If §4 comes back empty, **the ledger stands alone and is still the right feature.** It needs no
geometry, and it already answers Daniel's question.

### Why this is the mobile answer too

Mobile is a first-class criterion now. A second map, an inset and a 28× zoom-out are all
pixel-hungry and all get worse on a phone. **A ledger of five things with a quote and a citation
each is better on a phone than on a desktop** — it is text, it scrolls, and it is the same
material at every width.

---

## 7. What I would reject, and why

**A continuous zoom-out that reaches Hetch Hetchy.** San Francisco at 34 px (§5), 811× the area,
and essentially all of the new ground is Central Valley farmland where the city decided nothing.
The reader would lose the entire subject of the piece to gain two dots. This is the direct answer
to *"or is that not a good idea?"* — **on this one it is not a good idea, and the number is 34.**

**A permanent second map or an always-on mini-map.** It would spend real estate on every screen
for something that is relevant to 5 of 41 entries, and it is worst exactly where Daniel now wants
it best — on a phone.

**Extending the surround plate just to make the pull-back look right.** Reaching SFO means
~36 km of frame against the ~26 km the plate can currently cover, so it is a new raster fetch
and a bigger base tier — real bytes on every load — bought for a strip of San Mateo County that
carries **no buildings and no decisions**, by the deliberate policy in `DATA-SCOPE.md` §8. Worth
doing later *if* something published goes on it; not worth doing to remove an edge.

**Drawing the Hetch Hetchy aqueduct as a line.** This is the one I most want to do and most
firmly reject. The corpus names O'Shaughnessy Dam, Early Intake, Moccasin, the Tesla and Irvington
portals, Alameda Creek, Dumbarton, Pulgas and Crystal Springs — nine fixed points and a phrase,
"our 150-mile aqueduct". It is *so* nearly a polyline. But the entry says it plainly: land is
"described in section and township, not in coordinates, so the line still has to be drawn from
outside." A line between named portals is a line I invented. `DATA-SCOPE.md` already flags that
six of the prototype's line entities are drawn from **hand-placed endpoints marked PLACEHOLDER**;
shipping one more would make the map's most spectacular object also its least true.

**Inferring reach with a regex over beat text.** I ran exactly that sweep in §3 and it works
well — and it would have silently missed `sfo-capital-plan-bonds` entirely, all 12 beats, because
the modern record says "the Airport" and never "San Mateo County". Reach has to be a property of
the entity, asserted with evidence, with a declared gap where the evidence is absent. That is why
the seed has a `gap` block and why `unstated` is in the vocabulary.

**Counting `CN` footprints as reach.** §1.1 — their bounding box *is* San Francisco.

**A "we also do things elsewhere" note with no citation.** The reach claim is only worth making
because it comes with Resolution No. 26816 and a leaf number. Without those it is a boast.

---

## 8. Wiring note — for whoever owns the components

I own `pipeline/scripts/us_sf_reach/` and nothing else. I have not touched `us_sf_city/`,
`us_sf_places/`, any `lib/city/*.ts`, `scene.ts`, `renderer.ts`, any component, `fusion.css` or
`i18n`, and I have not committed. Baseline at hand-off: **typecheck clean, 314 tests passing
(NIGHT.md's 307 plus seven added by other agents tonight), `verify_city_chunks.py` FAILURES:
none.**

**The artefact.** `website/public/data/us/sf/city/reach.json`, 14.7 KB, plain JSON. It sits
beside `manifest.json` rather than in `base/`, deliberately: it is not a `.qc` chunk, it has no
manifest entry, and nothing loads it yet, so it cannot perturb the base tier or the verifier.
Re-emit with `python3 pipeline/scripts/us_sf_reach/build_reach.py`.

**To wire it, three small things, all in files I do not own:**

1. **Load it.** It is not in `manifest.chunks` and does not need to be — it is one small fetch,
   not tied to the LOD ladder, and it should be lazy: nothing needs it until a reader opens a
   fiche or the film reaches the Hetch Hetchy shot. If you would rather it be a proper chunk,
   the shape is stable and I will re-emit it as `base/reach.qc` on request; it would add ~5 KB
   gzip to the base tier, which I would not spend by default.
2. **Show it on the fiche.** Any entry whose id is in `rows` gets a strip: the reach word, the
   county where the record names one, and the `evidence` block — `year`, `headline`, `fragment`,
   `item`/`leaf`/`url`. The citation link is the same shape the film's `fx-film-cite` already
   builds, so it can reuse that component wholesale.
3. **Promote the badge.** `CityFilm.tsx` renders `us.sf.thecity.film.not_on_map` as a bare
   label. The `hetch-hetchy` row now carries everything needed to make it a sentence with a
   source behind it. **This is the highest-value change in the whole piece per line of code** —
   it converts the map's most visible admission of a limit into its best argument.

**Two strings for `i18n` (I did not add them — `en.ts`/`fr.ts` are not mine):**

    us.sf.thecity.reach.off_map_count   "{n} of these decisions are not on this map"
    us.sf.thecity.reach.why             "Why it is not here"

Per the standing rule, FR must be filled in the same session as EN.

**What must NOT be wired.** `position` is `null` on every row and `position_note` says why.
Nothing downstream should fall back to a hand-placed marker when it finds `null` — an unplaced
entity is displayed as unplaced and counted. That is the whole convention.

---

## 9. Side finding, not mine to fix: the parcel join truncates

Not a reach question, but it is a live data-quality bug I fell over while counting prefixes, and
it belongs to whoever owns `pipeline/scripts/us_sf_city/`. I have not touched it.

`bldg/pnjoin.py::resolve_pn` tries `mblr[2:9]` — a fixed 7-character slice — **before** the whole
key, deliberately, so that "nothing that is on the page today can move". But `mblr` is a 2-char
prefix plus a parcel number of 7, 8 or 9 characters, so:

- `len(mblr) == 9` → parcel is 7 chars → the slice **equals** the whole key. Harmless.
- `len(mblr) == 10` → parcel is 8 chars → the slice is a **truncation**, and on a numbered block
  the truncation is *itself a valid, different parcel*.
- `len(mblr) == 11` → parcel is 9 chars → same, worse.

Measured over `cache/fp-*.json` against the 2025 secured roll (211,547 rows):

    SF, len 10, slice matched AND whole matched a DIFFERENT row     18,742
    SM, len 11, slice matched (whole did not)                           90
    CN, len 10, slice matched AND whole matched                          4

**18,836 footprints take the truncated parcel's `year_property_built` and `use_definition`
instead of their own**, because the slice is consulted first. Concrete, from the cache:

    mblr=SF1865014A   slice(1865014) -> 'Commercial Misc'/1960
                      whole(1865014A) -> 'Multi-Family Residential'/1907
    mblr=SF6072003A   slice(6072003) -> 'Single Family Residential'/1950
                      whole(6072003A) -> 'Single Family Residential'/1910

A 53-year and a 40-year error in the year that drives the time machine. And the 90 `SM` cases
are worse in kind than in number: a building in Daly City is wearing a **San Francisco** parcel's
use and year, because `SM002401100` truncates to `0024011`, which is a real SF parcel downtown.

The slice-first path is never *necessary* — where it is correct it is identical to the whole key.
The minimal fix is to try the whole key first, or to take the slice only when `len(mblr) == 9`.
Flagging, not fixing: not my file.

---
---

# BLOCK X2 — the geometry is published, so the reach gets a shape

Written as the work happened. Everything below was fetched live and measured in
this session; where a number came from a service, the query that produced it is
in `fetch_reach_geom.py` and the response is in `cache/`.

**§4 above says "this section is deliberately thin, and that is the finding".
That finding is now overturned.** A second and third recon pass came back with
first-hand geometry for almost everything §4 left open, and one thing §7 refused
outright — the aqueduct — turned out to be published federally. So this half of
the document is the correction: *what is published, what was measured, what is
still refused, and what shape the reach should take now.*

---

## 10 · What shipped

| file | bytes | what |
|---|---|---|
| `website/public/data/us/sf/reach/geom.qc` | **36,556** (18,395 gz) | 62 published shapes, 373 rings, 3,869 vertices, `QCT1` |
| `website/public/data/us/sf/reach/geom.json` | 49,767 | the index and the provenance, per feature and per source |
| `website/public/data/us/sf/reach/film-badge.json` | 1,429 | one sentence and three sources, for the film's badge |
| `website/public/data/us/sf/reach/ledger.json` | 14,696 | §6's ledger, **moved here** — see §14 |

**Total on the wire, and only when something asks for it: 20 KB gzipped.**
Nothing is in `manifest.chunks`, nothing is in the base tier, and nothing loads
at mount.

| class | n | source |
|---|---|---|
| `watershed` | 4 | CPAD 2026a — **240 holdings, 63,118 acres**, unioned per unit |
| `reservoir` | 11 | USGS NHD Waterbody (Large Scale) |
| `cemetery` | 22 | TIGER/Line 2024 AREALM `MTFCC=K2582` — **931.4 acres in Colma** |
| `cityland` | 20 | DataSF `gtnh-hgvs` — 27 parcels outside the county, grouped by name |
| `county` | 2 | DataSF `txuc-3kzm` — the city, and the Farallones |
| `aqueduct` | 1 | USGS NHD Flowline — 43 features, 190.00 km, one GNIS id |
| `airport` | 1 | Caltrans CHaviation, `OBJECTID 218` |
| `dam` | 1 | USACE NID `CA00123` — O'Shaughnessy, 312 ft, 1923, owner SFPUC |

Scripts, all new, all inside `pipeline/scripts/us_sf_reach/`:
`fetch_reach_geom.py` (eight sources, cached with their URLs),
`build_reach_geom.py` (the emitter), `_qc.py` (a second, independent
implementation of the container), `_shp.py` (a 90-line shapefile reader,
because there is no shapefile library in this environment and TIGER AREALM is a
file download), `prove_qc.py` (the guards, fired), `reach_locator_figure.py`
(the recommendation, drawn from the shipped chunk), `reach_badge_shot.py` (the
before and after).

---

## 11 · The `NOT ON THE MAP` line — before and after

`badge-before-crop.png` / `badge-after-crop.png` / `badge-after-390.png`, all
shot on the running page at the Hetch Hetchy shot, with `where().id` and
`seg !== 'move'` asserted at the shutter per NIGHT.md trap 2.

**Before** — a bare boxed label, 125 × 26 px, in the corner of one shot:

    ┌──────────────────┐
    │ NOT ON THIS MAP  │
    └──────────────────┘

**After** — the label keeps its box and its place, and now has a sentence and
three publishers under it:

    ┌──────────────────┐
    │ NOT ON THIS MAP  │
    └──────────────────┘
    It starts 223 km east of the county line, at O'Shaughnessy Dam:
    190 km of aqueduct, 63,118 acres of watershed across 4 counties,
    11 reservoirs. All of it published. None of it in this frame.
    USACE NID · USGS NHD · CPAD 2026a

**Every figure in that sentence is measured by the pipeline** out of the
geometry that ships beside it — the 223 km is `dam.bbox.x0 − county.bbox.x1`,
the 190.00 km is NHD's own `lengthkm` summed over 43 features, the 63,118 acres
is the sum of 240 CPAD holdings' own `ACRES`, the 11 is a count of rows. Nothing
is typed into the component and the sentence cannot drift from the shapes.

Three things about the implementation are deliberate:

- **Lazy, and only when the badge is on screen.** 1.4 KB wanted for eight
  seconds of a 134-second film. Loading it at mount would put a request in front
  of the ground.
- **The label renders alone if the fetch fails.** The sentence is an upgrade,
  never a dependency, so the worst case is exactly today's screen.
- **No `i18n` key was added and none was needed.** The sentence is data, and it
  sits on the same plate as `line.copy` and the scan citation, which are already
  English-only verbatim record. `en.ts`/`fr.ts` are untouched.

Measured on the phone at 390 × 844: the block reads at three lines, the source
row fits on one line — the publishers are abbreviated *because* the full names
wrapped it onto a second row and pushed the plate into the compass control —
and the plate's bottom lands at 784 px against a 814 px scrub rail.

---

## 12 · The recommendation — a locator with two stops, not a zoom

`fig-locator.png`, drawn **from the shipped chunk and nothing else**: if the
locator can be drawn from `geom.qc` alone then the chunk is complete, and if it
cannot then the chunk is wrong.

**Two fixed stops, each announcing its own scale, neither of them a camera
move.**

- **Stop 1 — the peninsula, 27 km across.** Colma, SFO, Sharp Park, the
  Peninsula watershed, Crystal Springs. San Francisco is still a *shape*: you
  can see the Panhandle in it.
- **Stop 2 — the whole system, 315 km across, 11.8× stop 1.** The Farallones at
  the west end, O'Shaughnessy Dam at the east, and the aqueduct as the spine
  between. San Francisco is the black thumbnail on the left, and **that is the
  argument rather than a defect.**

Why stops and not a continuous pull-back, in one line each, all three measured
rather than argued: §5's 34 px; §5's z ≈ 0.76 plate edge, which blocks the
pull-back 10 km short of the airport; and the fact that a locator which quietly
changes what a centimetre means is dishonest in a way that a second register
carrying its own scale bar is not. Both stops draw the city outline at their own
scale, so the reader measures the change instead of being walked through it.

**On a phone this is still the right answer.** Stop 2 is a letterbox — it wants
width and almost no height — and stop 1 degrades to a portrait strip. Neither
needs a gesture, and neither competes with the main map for the same pixels.

---

## 13 · What I refused to draw, and why

- **The Mountain Tunnel, reservoir to Moccasin.** NHD's named *Hetch Hetchy
  Aqueduct* feature **ends at Moccasin, longitude −120.2653**, not at the
  reservoir at −119.789. It is 190.00 km — about 118 miles — of a system the
  city calls its 150-mile aqueduct. Joining the line's east end to the reservoir
  would be a segment we drew, and the difference is 48 km of it. *Corollary that
  matters for copy: a label reading "150 miles" beside this line would be
  describing a different object, and the caveat is carried on the feature.*
- **The tunnels as separate objects.** OSM identifies them individually and
  richly, but its members carry `source=NHD` — they were seeded from the same
  federal line and hand-refined. Until that hand-refinement is checked against
  something, the federal line is the one that ships.
- **A legal boundary for SFO.** None is published anywhere, by anyone.
- **Caltrans `OBJECTID 208`.** Caltrans ships two SFO polygons and the larger
  one, ~2,770 acres, runs far east into the Bay. It is not the airport and it is
  not in the file.
- **The 16 City Lands rows within 527 m of the county line.** Marina Green, the
  Port lands, Seal Rocks, a water lot on Carroll Avenue: two DataSF registers
  disagreeing about where the shoreline is, not reach. Same border artefact as
  §1.1's `SM` footprints. **The cut is at 1 km and it sits in an empty band —
  furthest dropped 526.7 m, nearest kept 9,369.7 m** — and both edges are
  re-measured into `geom.json` on every run so the choice can be re-checked
  rather than believed.
- **PAD-US 4.1 for the watersheds.** It is a dissolved 2023 re-publication of
  CPAD: 15 blobs against CPAD's 255 parcel-aligned holdings.

---

## 14 · Six things that were found by measuring, not by reading

**14.1 — The SFO "13 % discrepancy" was two registers answering two questions.**
Measured on every build, in the map's own frame: **Caltrans 218 is 2,276 acres;
DataSF City Lands `land_id=635` — the city's own register of the land it owns
there — is 4,540 acres, 2.0× as large, and 91 % of the Caltrans footprint falls
inside it.** The Airport cites ~5,207 acres including submerged Bay land. So the
polygons do not disagree about the airport: one is an aviation *facility
footprint* and the other is a *land register*, and the file ships both, labelled.

**14.2 — A national register plus a name is a trap, and it bit.** The first
build's Lake Eleanor had a bounding box at longitude **−84.65**, because GNIS
names repeat across states and an unbounded NHD query for "Cherry Lake" returns
water in Ontario and Florida. Fixed at the source — every NHD query is now
bounded by an envelope — and a `SANITY_LL` box now **fails the build** on any
vertex outside California, with the error text telling the next person to bound
the query rather than filter the result.

**14.3 — The city owns oil land in Kern and Fresno counties.** The *Furman
Bequest*: **eight parcels** of City Lands, department Recreation and Parks, in
Bakersfield, Coalinga, Lost Hills and McKittrick — **246 to 427 km** from the
county's own bounding box, so **every one of them is further out than
O'Shaughnessy Dam**, which is 223 km. It ships, with its true lon/lat box, and
it is the one feature flagged `outside_locator`: at that distance the map's
frozen-`cosl` east-west scale is **9.3 km** wrong, and a locator frame that
contained it would be mostly empty desert. Dropping it would be an edit, so it
is excluded from a frame rather than from the file.

**14.4 — The published geometry now reaches further than the record does, which
is the exact inverse of §6.** §6's argument was that the corpus is rich in
*reasons* and empty of *positions*. Swept mechanically over the 41 entries'
`quote` and `headline` — the Journal's own words, never our `note` text — and
written into `geom.json` as `corpus_check`:

| shape | beats naming it |
|---|---|
| the aqueduct / Hetch Hetchy | **21** |
| SFO / Mills Field / San Mateo County | 8 |
| Moccasin | 5 |
| the Alameda watershed (Alameda Creek, Calaveras, Irvington) | 3 |
| O'Shaughnessy **Dam** | 2 |
| the Peninsula watershed (Crystal Springs, Pulgas) | 2 |
| Tesla | 1 |
| **Colma** | **0** |
| **Sharp Park** | **0** |
| **Camp Mather** | **0** |
| **Sunol** | **0** |
| **the Farallon Islands** | **0** |

So there are now two kinds of object in this layer and a component must not
present them alike: **shapes with a record behind them, and shapes that are only
the city's land.** Both are true; only the first can be cited.

Two traps are written into that sweep because they would each have changed an
answer. **"Colman" is a Supervisor and is not Colma** — he moves postponements
by name in `sunset-tunnel` and votes in `muni-buys-market-street-railway`, and a
naive `Colma` substring makes the Colma cemeteries look cited when they are not.
And **the Farallones are named in one of our own `note` fields and in no `quote`
anywhere**, which is why the sweep counts the record's words and reports notes
separately as `in_our_notes_only`.

*This does not weaken the Colma row — 22 cemeteries and 931.4 acres of San
Francisco's dead immediately across the county line is a strong published fact.
It means the sentence beside it has to be sourced to TIGER, not to the Board.*

**14.5 — The SFPUC publishes no open GIS at all.** Its ArcGIS organisation
returns `"access":"private"`. **Every authoritative source for San Francisco's
own water system in this file is a third party** — federal (NHD, NID), state
(Caltrans), or a non-profit compiling county records (CPAD/GreenInfo). That is
a fact about the record and it belongs on the page, not just in this file.

**14.6 — TIGER has a cemetery OpenStreetMap does not.** Olivet Memorial Park,
76.4 acres, is in TIGER/Line AREALM and is absent from OSM. The obvious
cartographic source is the incomplete one here, which is why Colma comes from a
5.6 MB Census file download and a hand-written shapefile reader rather than from
the convenient API. (TIGERweb's REST service does not carry AREALM — verified
negative.)

---

## 15 · The format, and the four guards, fired

`geom.qc` is the house `QCT1` container: magic, `u32` header length, `u32`
payload length, `u32` CRC-32 of the payload, header JSON, 8-byte pad, payload;
field offsets aligned to their own element size for a zero-copy typed-array
view. The writer is `us_sf_reach/_qc.py` — **a second implementation, not an
import**, so the reach layer cannot change the bytes the city chunks are made
of. `us_sf_city/` was not edited.

`prove_qc.py`, run on the shipped bytes, corrupts the file four ways and
requires each read to fail:

    FIRES  magic          -> not a qc chunk: magic b'XXXX'
    FIRES  crc            -> crc mismatch: a5b2851b != d2b5b58d
    FIRES  truncation     -> truncated: 35676 of 35740 payload bytes
    FIRES  key            -> key is 'reach/geom', asked for 'base/terrain'
    FIRES  magic (site)   ·  FIRES  crc (site)  ·  FIRES  trunc (site)

The last three are the same corruptions through **`us_sf_city/_chunk.read_chunk`,
the decoder the site already ships** — because compatibility with that decoder
is the only kind that matters. Then the round trip, element for element, against
a full rebuild from the cache: `x` 3,869 identical, `y` 3,869 identical, feature
and ring counts match the header, and both decoders return identical arrays for
`x`, `y`, `rv0`, `rvn`, `fbb`. **PROVED.**

`build_reach.py`'s quote guard is untouched and still bites: "correcting" the
OCR's `con fines` to `confines` in the Mills Field evidence fails the build with
the wanted and found strings printed side by side.

Both builds are deterministic — identical md5 on re-run, three files each.

**The reach layer moved out of `city/`.** `verify_city_chunks.py` asserts that
the manifest lists *exactly* the `.qc` files under
`website/public/data/us/sf/city/`, and that is a correct guard against a stale
orphan chunk. A reach chunk that is deliberately not in `manifest.chunks` would
break it, so the whole layer now lives at **`website/public/data/us/sf/reach/`**,
a sibling of `city/` and `places/`. §6's ledger moved with it and is now
`reach/ledger.json`. Nothing loaded either file, so nothing broke.

*(Standing note for whoever is in `us_sf_city/`: that verifier is **already**
failing on this branch, 571 in the manifest against 572 on disk, from an
in-flight chunk that is not mine. Measured by A/B — removing my file leaves the
same failure. It is not a reach regression.)*

---

## 16 · Wiring — still not mine, still one file at a time

I own `pipeline/scripts/us_sf_reach/`, what it emits, and the badge in
`CityFilm.tsx`. I did not touch `us_sf_city/`, `us_sf_places/`, any
`lib/city/*.ts`, `scene.ts`, `renderer.ts`, `CityMap.tsx`, `CityBlockPanel.tsx`,
`fusion.css` or `i18n`, and I did not commit.

**Done, in my own file:** the badge. It was named the highest-value change per
line of code and it is.

**Still to wire, by whoever owns the components:**

1. **The locator.** `fig-locator.png` is the recommendation. It needs a reader
   for `geom.qc` — the field layout is in `geom.json.chunk.fields` and it is a
   flat `fr0/frn → rv0/rvn/rhole → x/y` walk, about forty lines — and two fixed
   camera boxes, which are in the index as `bbox_world_m` per feature. It must
   carry a scale bar, and it must not animate between the stops.
2. **The fiche strip**, unchanged from §8.2.
3. **Two kinds of row.** `geom.json.corpus_check` says which shapes the record
   names. A shape with zero beats gets its source line and no quote.

**Two strings, if the locator is built, and they are the only ones needed:**

    us.sf.thecity.reach.stop_peninsula   "The peninsula"
    us.sf.thecity.reach.stop_system      "The whole system"

Everything else on the locator is a name from a published register or a number
measured by the pipeline.

**What must still NOT be wired.** Nothing may draw a segment between the
aqueduct's east end and Hetch Hetchy Reservoir. The gap is real, it is 48 km,
and it is the difference between the federal register and the city's own phrase.

---

## 17 · State at hand-off

    typecheck   clean in every file I touched. `npx tsc` reports ONE error, in
                CityMap.tsx(163), from the block-panel agent's in-flight
                BlockContext change at 01:10. Zero in CityFilm.tsx.
    tests       320 passed, 11 files (NIGHT.md's 314 plus six added tonight)
    lint        11 warnings, 0 errors. The baseline seven in six product files
                nobody owns, plus four new ones in CityBlockPanel.tsx and
                CityMap.tsx — that agent's files. ZERO in CityFilm.tsx.
    verifier    verify_city_chunks.py FAILURES: 1, pre-existing and not mine —
                571 chunks in the manifest against 572 on disk. Proved by A/B:
                removing reach/geom.qc leaves the identical failure, which is
                also why the reach layer now lives outside city/.
    builds      deterministic; identical md5 on re-run, four files
    guards      4 corruption guards fired, 3 of them through the SHIPPED
                decoder; round trip identical element for element; the ledger's
                quote guard re-proved by breaking it on purpose
    committed   nothing
