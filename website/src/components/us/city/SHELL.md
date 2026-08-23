# The React shell

**Block P4.** Written as the work happened, not after it.

`projection.ts`, `camera.ts`, `data.ts` and the nine draw modules are pure
logic with no DOM (P1, P1b, P2, P3, all landed and green). This block is the
half they deliberately left out — a canvas, a clock, listeners, the gesture
state machine, the band cross-fade — plus the route the city first appears on
and the drawer that answers *what did the city decide here*.

    components/us/city/palette.ts          the art palettes and the material tables
    components/us/city/scene.ts            one paint, composed out of the nine modules
    components/us/city/renderer.ts         canvas, rAF, gestures, raster-and-blit
    components/us/city/CityMap.tsx         the React shell — mount, resize, teardown, drawer
    components/us/city/CityBlockPanel.tsx  the block drawer
    components/us/city/block-records.ts    the T0/T1/T2 record loader
    app/us/city/sf/the-city/page.tsx       the route (server)
    app/us/city/sf/the-city/TheCityClient.tsx

---

## 1. The component surface

### `CityMap` — the only thing the route mounts

```tsx
<CityMap height={680} />
```

Everything else is internal. `CityMap` owns four React states and none of them
is in the render loop: `baseDone/baseTotal` (the loading line), `failed`,
`blockCtx/record` (the drawer), and one `RendererState` that feeds the readout
strip. **No frame goes through React.** The renderer is constructed once in an
effect, handed the canvas, and told to resize; `onState` is called at most once
per animation frame and only ever paints text.

### `CityRenderer` — the imperative half

| | |
|---|---|
| lifecycle | `resize(W,H,dpr)` `refit()` `destroy()` `invalidate()` |
| camera | `cam` (a `camera.ts` `Camera`) `goToPreset(i)` `home()` `setYear(y)` |
| measurement | `measure(frames)` — counts rAF, see §6 |
| out | `onState(RendererState)` `onPick(blockIndex)` |

Four persistent canvases from `planSlots`, allocated once per viewport size —
`hi` (device resolution, what a settled camera is shown through), `lo` (motion,
`MOTION_DPR`), `zo` (the thin-ring zoom buffer), `fi` (the film's, allocated
and unused until P5). Every one is `getContext("2d", {alpha:false})`.

### `CityScene` — the composition

`paint(frame)` calls the nine modules in one order and returns what it drew.
`pick(px,py,cam,W,H)` marches the pixel's line in z and returns an assessor
block index. `viewQuad(cam,W,H)` is what `data.setView` is fed. `layers` is a
set of ablation switches driven by `?layers=` on the route (§7).

---

## 2. The route

`/us/city/sf/the-city`, on the same shape as every other page in the section:
a server component that reads the export and hands a slim payload to a client
that opens with `PageIntro` + four `IntroStat`s, puts the killer view in the
first section, and closes with the shared `SfSourceFooter`. Copy is on
`us.sf.thecity.*` keys in **both `en.ts` and `fr.ts`** (ADR-0010 D3: identical
English in both, like the rest of the SF surface).

The slim payload matters more here than anywhere else on the site: the map's
own record is 12.5 MB of binary chunks and **none of it comes through the
page.** What the server reads is the manifest's catalogue — the counts, the
tier table and the provenance — so the page can say what it is about to fetch,
and where every field came from, without fetching any of it.

**The first-paint number is measured, not quoted.** `page.tsx` gzips the twelve
base chunks and the manifest at build time and prints that. `DATA.md` §13 says
681,661 bytes and that was true when it was written; the encoder has been
re-run since. A byte count nobody re-measured is exactly the class of claim
this project has been bitten by.

Four sections: the map; *Click a block, read the record* (what a click gets you
and how precisely, with the five precision tiers as a table and the hand-scored
accuracy under it); *What it costs to look* (the tier table, when each is
fetched); *Where every field came from* (the manifest's own source table).

---

## 3. The block drawer

Clicking a block opens what the record says about it, and it follows
`components/fiche/FicheArchiveShelf.tsx` — the house contract for *one line
saying what a document says, the title linked to the archive, and nothing
else.* Per row, three things and no fourth:

1. the sentence the volume actually prints → `gloss`
2. what it is and when, linked to the scan's own leaf → `title` + `href`
3. the series it is held in, and **how precisely it is placed** → `sourceLabel`,
   `variantNote`

**The precision tier is not decoration.** A `street`-tier row is not a claim
about this block — it is a claim about a street this block fronts, and 35,244
of the 76,419 placed decisions are that tier. So block-precision and
street-precision rows are in **two different sections with two different
sentences**, and the street ones are not fetched at all until the reader asks.
Flattening them into one list would present a street's record as a block's.

**Why not a routed drawer.** The site's drawer architecture is one root-level
`(...)` route per *entity*. An assessor block is not an entity here — there are
5,404 of them, none has a page, and the click is an inspection of the canvas
rather than a navigation. So it is an in-page panel with the same focus and
Escape behaviour and no URL of its own.

**The join is asserted, not assumed.** `block-index.json`'s `b[]` and
`base/blocks-id.json`'s `id[]` are two separately-built arrays that have to
agree element for element or every decision on this map hangs off the wrong
block — and neither would throw. `assertJoin` checks all 5,404 at load and, on
a mismatch, the panel is disabled and the page says so.

Loading follows the map's own rule — nothing is fetched before the reader can
see it. T0 `block-index.json` once (36 KB gz), T1 one shard per click
(~21 KB gz), T2 ≤ 6 street files only if the reader opens that section.

---

## 4. Progressive loading

The manifest lands first. The twelve base chunks stream in behind it and
**`loadBase()` is not awaited before the first paint** — each chunk repaints as
it arrives, so the ground is on screen well before the last of the twelve. The
loading line counts them and stops when they are all in; it is not a spinner
over a blank frame, because the frame under it is already drawable.

`CityScene.ready` is deliberately the lowest bar in the file — `base/terrain`
held, and nothing more. Everything else guards on null and simply does not
draw. A chunk that has not arrived reads as *less city*, never as an error.

Everything past the base tier is fetched by the camera through
`data.setView()`, which is the whole request policy: it aborts what the new
view cannot show and rebuilds the queue nearest-first.

---

## 5. What had to be found by looking

Five defects here were invisible to a green suite and to the type checker, and
every one of them was caught by a screenshot.

**1. The park flag is a FRACTION, and 255 is not 1.** `TerrainField.node()`
averages `cellPark` over the four cells meeting at a node and hands the mean to
`terrainRGB` as `parkF`, which weights two rows of the colour table. Writing
255 weights the park row 255×. Golden Gate Park, the Presidio and every
playground came out as **hard white rectangles**.

**2. The water goes down FIRST and the land is painted over it.** `DRAW.md`'s
`terrain → water → streets → …` is *import* order. `part3.html`'s
`drawTerrain()` §5312 paints bay plate, depth plate, `drawContext` (the
surround), *then* the city's DEM cells, and its own comment says why: "every
pixel of the plate that reaches the land is painted [over]". Both plates are
grids laid under one affine and **neither carries a land test**, so the only
thing keeping the bay out of the Sunset is the land being painted after it.
Read as paint order, the Pacific covered the whole peninsula.

**3. The block ring quantum is `(1 << sc) / 10`, and it MULTIPLIES.**
part3.html §84. Read as `1 / (1 << sc)` — which is what "a per-block
power-of-two quantiser" sounds like — the 5,404 rings come out hundreds of
times too large, and the frame fills with pale diagonal slabs the size of the
bay while the massing composites itself to black.

**4. A metre of built height is `zexb·scale`, not `sA·√2·scale`.** `projb` adds
`h·ZEXB` straight to the plane's second coordinate; the down-screen factor is
for horizontal distance. Using it for wall height under-reports by 2.7× and
silently suppresses every facade (`FA_MIN_DH_PX`) and every roof tray — the
geometry was right, the *gates* were reading a wrong number.

**5. `PAINT.bidx` is not in the export, and the gap is not filled by
inventing.** See §8.

---

## 6. The frame rate, counted and not timed

**Canvas 2D is deferred.** Timing a draw into a detached canvas measures the JS
only and has fooled four agents on this project. Everything below is
`requestAnimationFrame` counted in the page during real synthetic gestures —
a 30-step drag and an 18-notch wheel zoom — at 1440 × 940, DPR 2, headless
Chromium (CPU raster, so the ratios are the point).

Three consecutive runs of the same script on the shipped build, all six rows,
reported as the range across the three:

| | drag | wheel zoom |
|---|---:|---:|
| whole city | **108.5–108.9 fps** | **61.8–65.2 fps** |
| district | **54.9–57.8 fps** | **93.1–95.1 fps** |
| block | **98.2–98.3 fps** | **112.5–113.7 fps** |

**The worst case is a drag at the district camera, 55 fps**, which is the frame
where the whole city is in view *and* every one of its 87,774 footprints is
past the dissolve.

### What the four measurement rounds actually say, and what they do not

The same script, run after each change, is the only comparison here — and it is
an honest one only if the confound is stated, so: **the runs differ in what the
data layer had already cached**, and the district rows are the ones that
suffers from it. Round 2 is *slower than round 1* on two rows, and this write-up
does not claim to know how much of that is the change and how much is chunk
arrival landing inside the measured window.

| after | whole drag | whole zoom | dist drag | dist zoom | blk drag | blk zoom |
|---|---:|---:|---:|---:|---:|---:|
| 1. the correctness fixes of §5 | 109.6 | 9.8 | 30.6 | 55.4 | 95.7 | 112.6 |
| 2. + colour-batched fills, + `warmBands()` | 107.3 | **6.7** | **4.4** | 53.4 | 86.9 | 112.5 |
| 3. + `coeffs()` projection, + frozen data version | 107.1 | 38.7 | 25.7 | 77.1 | 86.1 | 112.8 |
| 4. + the `QUAD_PX` motion rung | 109.0 | 64.3 | 57.2 | 94.3 | 98.3 | 113.8 |

What is safe to say from that table is the shape of it and the mechanism behind
each change, not a per-change delta:

- **The band caches were cold** before round 2. A band cache is a
  `TerrainField` (67,600 nodes of Lambert and self-shadow), `buildSurroundLam`
  over 116,480 cells and a 56,330-element depth sort. Built lazily, the first
  frame of a zoom that crosses a band pays all of it, and a whole-city→ceiling
  zoom crosses two. `warmBands()` builds all three after the base tier lands;
  there are exactly three (`ZEX_BY_STEP` is three long), so it is bounded.
- **Every chunk that landed forced a re-raster** before round 3. A pan at
  district asks the store for dozens of cells; with the data version in the
  content key each arrival is a `decideRaster` "content", gated at one per
  `RERASTER_MIN` — eight a second, each repainting 87,774 buildings. The
  version is now **frozen for the duration of a gesture**, which is the
  dissolve's own argument applied to arrival: `buildings.ts` says a cell that
  has not landed "reads as FEWER BUILDINGS, which is what that band is supposed
  to look like anyway". The buffer catches up on the settle, the one frame that
  can afford it. **This is the most likely explanation for round 2's district
  drag collapsing to 4.4 — it is the row most exposed to chunk arrival — and it
  is an explanation, not a measurement.**
- **`projb` returns a new array.** At district the footprint loop runs over
  87,774 buildings and ~880,000 vertices, so calling it twice a vertex
  allocated 1.8 million two-element arrays per rasterisation. `proj.coeffs()`
  exists for exactly this loop ("pre-projection loops want the coefficients,
  not four trig calls per vertex"). Same arithmetic, no allocation.
- **The motion rung** is round 4 and it is the one change whose effect is
  unambiguous, because rounds 3 and 4 were run back to back on the same warm
  cache and nothing else moved: every row improved and the two district rows
  improved by more than a third. `buildings.ts`'s ladder is explicit that "the
  cost is not rasterising the pixels, it is the JS loop and the Path2D calls,
  about 0.7 µs a building", and the only currency is path calls per building.
  Under `QUAD_PX` = 7 — a San Francisco lot is 25 ft of frontage — four points
  are the whole building, so mid-gesture a building that small is drawn as its
  own projected bbox. Full resolution returns the instant the camera stops.

The batch itself follows `NEAR_PX` = 9 and the finding that set it: a building
wider than that gets its own `fill()`, because "moving a building off the near
path does not remove its geometry, it moves it into a shared `Path2D`, and one
`fill()` of a path holding a thousand overlapping subpaths costs the rasteriser
more than a thousand fills of one quad each."

### The first paint, measured

Read off `performance.getEntriesByType("resource")` on the real page:

| | bytes |
|---|---:|
| `manifest.json` | 125,039 |
| twelve base chunks | 1,300,447 |
| three base sidecars (`marks`, `heroes`, `blocks-id`) | 45,145 |
| **fetched before the map can draw the whole city** | **1,470,631 raw** |
| the same, gzipped at level 9 (what the page prints) | **~712 KB** |

The dev server does not compress `.qc`, so the *transferred* figure above is
raw; the gzipped figure is computed from the same files at build time by
`page.tsx` and is what the page states. The base tier itself is unchanged from
`DATA.md` §13's 649,052 — the growth is the manifest, which has grown with the
catalogue, and the three sidecars, which `DATA.md` counts separately.

Held at each camera, measured live: **1.2 MB** at whole city, **3.0 MB** at
district, **4.1 MB** at block and street. The working set falls as you look
closer, which is the whole claim of progressive-by-zoom.

---

## 7. Ablation switches

`?layers=terrain,surround` draws two passes and nothing else; `?layers=-water`
turns one off. Eleven names, all default on, read by nothing but `paint()`.
This is `terrain.ts`'s own `LOOK` idiom — "kept because every one of them names
a decision somebody argued for, and turning one off is how the next person
tells whether it is still earning its place" — and three of the five defects in
§5 were isolated with it in one screenshot each.

---

## 8. What was not wired, and what P4b wired

**Block P4b.** Written as the work happened. §8 below is P4's list; every item
is answered here, in the order the gaps cost the picture, and the two that are
still open say why.

### 8b.1 The footprint draw, ported

P4's loop was a stated SIMPLIFICATION with the ladder's rules and none of its
rungs. What it now carries, and what each one was worth:

**PAINTER'S ORDER, which was the real defect and was not on P4's list.** The
loop walked the visible chunks in arrival order and each chunk in its own
Hilbert order. Hilbert order is spatially coherent and it is **not depth
order**, so a near building could be drawn before a far one and the far one
then painted its roof straight over it. Nothing threw, the type checker was
happy and all 303 tests stayed green. `buildBldOrder` — the counting sort
`buildings.ts` has shipped since P3 for exactly this — is now run over the
visible set once per rasterisation. It cannot be cached per bearing the way the
mock caches it, because the visible set changes as chunks arrive; per
rasterisation is affordable because a gesture is served from a blit.

**The batches are flushed at every one of 128 depth bands** and not at the end
of the frame. A colour bucket that spans the whole city is painter's order
thrown away again.

**The `RECT_SCALE` rung**, motion-only as the constant says, and it is an
**area-preserving rectangle at the building's own centre** — `areaRect`. P4
drew the projected bounding box, which circumscribes the shape and therefore
thickens every building by ~30 % of its area and closes up the streets between
them.

**The `QUAD_PX` rung is four of the building's OWN vertices** — leftmost,
topmost, rightmost, bottommost, which is a convex cycle in screen order —
`extremeQuad`. P4 drew a bbox here too. A real vertex keeps the footprint's
orientation and its proportions; a box does not.

**The arrival tint.** `colourLUT` has shipped `roofF`/`wallF` — `NF1` = 12
entries wide, carrying the six years of construction ochre and the five-step
arrival ramp — since P3, and **nothing read them**: every building on this map
was drawn at tint index 0. They are read now, through `tintIndex`. The
per-building STAGGER those tables exist for is still P5's, because the film
owns the clock; with no clock running every building is `rise = 1`, which is
what a scrub, a deep link and the cached layer all need. `FLAG_NOYEAR` is
honoured: the roll dates 12,594 parcels to its own "not known", and treating
those as a year is what put the Presidio in ochre in the mock's 1906 frame.

**The outline is `EDGE_SHADE`.** P4 called `inkFor(roofCol, 1)`, which pins the
ink gap at `INK_LO` on every roof, and gated it at `STROKE_MIN_PX_A`. The
landed rule is a darker value of the roof it bounds at `EDGE_SHADE` = 0.62,
stopping at `STROKE_MIN_PX_B` = 5 px rather than 3, and that is what is drawn.

**Two silent joins were wrong and are fixed here**, both found by the crash the
first one finally produced:

- `base/solo` is of kind `bldg`, so `data.visible("bldg")` yields it as well —
  and the solo table was therefore decoded, sorted and drawn **twice** every
  frame. Harmless while the loop had no painter's order; not harmless with one,
  because a doubled roof is a doubled outline and a doubled wall gradient.
- **the face chunk was `base/solo-face` for every table.** `face/10_10` mirrors
  `bldg/10_10` row for row, so a Mission house's openings were the published
  storey count, type and shop flag of whichever SOLO happened to share its row
  index. It never threw because every read was `?? 0`-guarded. `faceKeyFor` is
  now a total function over the two key shapes that exist and returns null for
  anything else — a missing face chunk reads as fewer openings, which is what
  progressive loading is supposed to look like; a wrong one reads as a
  plausible building.

**The lot-grain party lines are the one item on P4's list that is not here, and
they are not here because there is nothing to port.** `LOTINK`, `LOT_SHADE`,
`LOT_MIN_BLOCK_PX` and `LOT_MIN_GAP_PX` are **dead in the mock too** — three
declarations and one comment across `part1–4.html`, with no reader anywhere.
The 48 seeded frontage patterns they belonged to were deleted on 2026-08-21 as
an invention ("*GONE: per-lot roof tone, per-lot height deviation, light wells,
corner rule, gables. Every one of those was invented.*"), and the real published
lot boundaries that were to replace them **are not in the P1 catalogue**:
`manifest.kinds` has seventeen kinds and none is a lot. Drawing a party line
here would be inventing both its position and its existence. What survived of
that layer is the roof outline — *"the outline is what separates one house from
the one it shares a party wall with"* — and that is the `EDGE_SHADE` change
above.

### 8b.2 The contact shadow

`SHADOW_MIN_PX` and `EDGE_SHADE` were exported and unused, and at street zoom
the fabric read as floating. It is the highest-yield mark on this map and it is
now drawn: `addContactShadow` / `fillContactShadow`, thrown down-left from the
fixed upper-right key light, at the mock's own offsets
(`min(9, h·k·0.34)`, `min(7, h·k·0.20)`), gated on `h > 2` and
`SHADOW_MIN_PX` of projected width.

**It is composited INTO the city layer, not blitted over it**, and that is the
whole cost argument. The mock's `sunCast` pass is a different and larger object
— a full-resolution mask canvas built in depth order with every drawn body
punched back out of it, blitted under `globalCompositeOperation = "difference"`
— and its own notes record what a full-resolution blit costs per frame. What is
drawn here is `drawCity`'s **own fallback branch**, accumulated into one
`Path2D` per depth band and filled at that band's flush: one extra `fill()` per
band, on a path that is already being built, against one full-frame
`drawImage`.

**One path per band and not one per building, and the reason is not speed.**
The fill is translucent, so two shadows filled separately where they cross
composite twice and the overlap comes out a step darker than either. In one
path the nonzero rule unions them for free — which is safe here for the reason
the mock states, that all 166,166 published footprint rings have positive
signed area.

**`destination-over` was considered and is wrong for this shell.** Every
context here is `{alpha:false}` and the layer is opaque from the terrain pass
onward, so `destination-over` composites *behind the ground* and draws nothing
at all. The band flush puts the shadow in the same place in the paint order for
the same cost.

### 8b.3 The eleven heroes

`landmarks.ts` had the law and no pass. `drawHero` composes one out of the
pieces — `emphasis`, `planScale`, `crownFactor`, `rooflineOf`, `partVisible`,
`accentOf`/`accentBlend`, `emitBand`, `bandLambert`, `heroMaterial`, `heroInk`,
`heldMaterial` — plus `part3.html`'s three primitives, `heroSolid`,
`heroArcade` and `heroRib`, ported.

**Nothing invented a form.** Every ring, profile point, material index,
cut-off, pitch, margin and tilt is read out of `base/heroes` exactly as the
encoder moved it out of the mock's payload; the conservation rules are already
applied in `build_hero.py` and are deliberately **not** re-applied here, which
would double-count them.

**The flush is at the bucket floor**, which is the thing that distinguishes a
landmark from a building in this stream: inside one of the 8,192 depth buckets
the buildings are in Hilbert order, so a landmark keyed to its own exact depth
fires at whichever bucket-mate comes first and the fabric paints over it —
Moscone kept 0 % of its pixels against 93 %. The hero's own building is then
skipped, so the prism is not drawn inside the drawing that replaced it.

Two adaptations, both forced and both stated in the code:

- **the material table.** `heroes.json` ships `[name, top, wall]`;
  `HeroMaterials` is `[fill, light, dark]`. `heroMaterials()` maps wall→fill,
  top→light and derives dark as the mock's own `lerpHex(wall,"#000000",0.38)`.
- **the accent index.** `HeroData` carries the accent as a hex and not as an
  index, and the index is what says which parts carry it. It is recovered by
  matching the hex against `mat[i][1]`, which is where it came from.

**Two places the landed rule DIVERGES from the mock**, recorded rather than
patched, because P3's module is the law here and P4b may not change its rules:

1. `bandLambert`'s `leansIn` test is `−dRadius > dHeight`; the mock's is
   `−dRadius > 0.55·dHeight`. The landed test is stricter, so slightly fewer
   bands take the sky's top two steps. Checked by looking at the Ferry
   Building's pyramidal cap, which is the case the rule exists for; the open
   terracotta box has not come back.
2. `heroMaterial` scales the accent blend by **0.55**; the mock's `WO_ACC` is
   **0.25**. The blend is at its maximum only when the accent's own parts are
   entirely closed, so it is loudest at whole-city zoom. City Hall's dome is
   `gilt` at every zoom regardless, so this is not visible on the hero it was
   written for; it is a difference on the record, not a defect anyone has
   pointed at.

Still not drawn: the **68 shaped caps** (`base/caps`, `lrStep`/`lrTaper` in the
mock) and the **subject fade**, which belongs to a held beat and therefore to
P5.

### 8b.4 `PAINT.bidx` — asked for, shipped, read

P4 keyed the massing tone on the block's mean LIDAR height and said so. **P1
has now shipped the measured column**: `bidx` is a tenth field on the `blocks`
chunk — per building the MEDIAN colour of the published aerial pixels inside
the footprint, eroded 1.5 m so the sample is roof and not wall or kerb (Esri
World Imagery at z 18, 0.472 m/px, 8,661 tiles, 166,042 of 166,166 footprints
sampled), area-weighted onto the block whose published ring **contains** the
footprint's centroid, quantised to the same 32-entry palette the buildings use.

**5,043 of 5,404 blocks carry it (93.3 %).** The 361 that do not are park,
water and right of way; they ship the `255` sentinel and keep the height band,
which is named in `blockRoofIdx` rather than hidden behind a default.

Cost: `base/blocks.qc` 245,780 → 251,232 bytes (172,037 → 175,676 gzipped),
`manifest.json` 125,039 → 126,896. The round-trip verifier was **extended, not
duplicated**: `bidx` is compared element for element against `PAINT["bidx"]` on
the existing `base/blocks` path, the magic/CRC/key guards and the tamper test
are untouched, and the run is green — 5,623 comparisons over 8,928,612
elements, no failures.

**And the re-encode deleted 39 MB it did not own.** `main()` did an
unconditional `rmtree` of the whole output directory, which includes
`blocks/` — the block-record index written by
`scratchpad/sf-city-anim/blocks/build_index.py`, which this encoder knows
nothing about. The route went down with a server-side 404 on
`blocks/block-index.json`. `main()` now clears only the six chunk directories
it writes plus `manifest.json`, and `emit()` refuses a chunk key whose prefix
is not on that list, so a new prefix cannot be added without adding it there.

### 8b.5 The surround cell seams — diagnosed, and it was not the lighting

The hatch over Marin and San Mateo is an **anti-aliased abutment at the cell
boundary**, leaking the bay plate that is painted under the surround.
`paintCell`'s one-third overlap — the very thing it exists for — is
**intra-cell only**: `u1` was `min(1, (a+1)/kx + ov)`, and that clamp lands
exactly on the boundary where the neighbour begins. Two quads sharing an edge
exactly composite to `1 − a + a² < 1` along it.

Evidence, because "it looks like seams" is not a diagnosis:

- **the period is the CELL, not the sub-quad.** Predicted surround cell at this
  camera: 12.02 × 7.38 device px. Measured dominant x-period: **11.92 px** in
  Marin, **11.85 px** in San Mateo. A sub-quad source would give `12/kx` and
  would smear across cells with different `kx`.
- **the seam is a colour the surround cannot paint.** Over all 56,330 own cells
  and every lighting, tilt and haze state the surround can reach, `R − B` runs
  min **+2.58**, median **+20.27**, and is **never negative**. The seam pixels
  measure **R − B = −17.2** against a field of **+2.7**. That is the plate
  showing through.
- **the Lambert is not the cause**, and this is the measurement that rules out
  the tempting fix. `|Δlam|` between adjacent surround land cells: median
  **0.019** / p95 **0.160** horizontally, **0.025** / **0.235** vertically —
  against the *fixed* city DEM's own **0.024** / **0.190** and **0.025** /
  **0.208**. The surround's light field is statistically indistinguishable from
  the city's. There is no step to smooth, and smoothing it would erase real
  relief to hide a compositing bug.
- **the mock has it too.** `drawContext` rendered alone out of
  `mock-frame.html` measures a dominant x-period of 16.00 px against a
  predicted cell dx of 15.99, and a seam `R − B` of −0.9 against a field of
  +21.5. `part3.html` §4318 and §4334 are the same two clauses character for
  character. **This is not a port regression and the mock is not the reference
  for it.**

The fix is the overlap the function already has, carried across the boundary:
`paintCell` takes an optional outward bleed on its `+u` and `+v` sides and the
last column and row use it instead of the clamp. In a controlled reproduction
at the same cell size over the same blue, half a device pixel took the
column-profile standard deviation from **2.243 to 0.080 — 28×** — and returned
the seam pixel to the field colour. Nothing is invented by it: `proj()` is
linear and the cells tessellate exactly, so the sliver is a bilinear
extrapolation of the same surface the neighbour interpolates there, in a colour
that differs from the neighbour's own by at most one `tgt` step. It is the
neighbour's pixel painted twice instead of neither cell's.

**Only `drawSurround` asks for it, and only toward a neighbour that is going to
be painted.** The city's own DEM does not show the artefact — it is painted
over ground of nearly its own value, not over the plate — and its edge cells
front the published shoreline, where half a pixel of outward bleed would put
land over water `txuc-3kzm` says is water. At the surround's own rim the same
test stops it growing into the bay.

**Two things this did NOT fix, both real, both reported rather than papered
over:**

- **the surround's coastline is a 110 × 139 m staircase.** The mock clips the
  surround to the coast (`part3.html` §4426, `CO.clip` / `coastPathX` / `XCS`);
  nothing named `coastPathX` or `XCS` exists anywhere in `website/src/`. That
  clip was not ported, and it is a separate change from the seam.
- **at DPR 1 the surround carries a genuine value stair on top of the seam.**
  `paintCell`'s `k === 1` fast path paints the MEAN of the four nodes rather
  than the bilinear surface. At DPR 2 the step is bounded by `WA.tgt`; at DPR 1
  the pixel floor pins `ky = 1` on every surround cell regardless of `tgt`, and
  the vertical cell-mean step then runs median **1.48**, p95 **8.86**, max
  **20.70** of 255. Measured, not fixed.

### 8b.6 The frame rate, counted again

Same script, same machine, same synthetic gestures, `requestAnimationFrame`
counted in the page — **three complete runs, reported as the range across the
three**, against P4's own three-run ranges in §6. The performance budget is
withdrawn for this block; the one clause that survives is *no visible hitch
during a camera move*, and it is met structurally, because a move is a blit of
a pre-painted buffer and none of this block's work runs during one.

| | drag P4 → P4b | wheel zoom P4 → P4b |
|---|---|---|
| whole city | 108.5–108.9 → **108.7–109.9** | 61.8–65.2 → **72.2–74.3** |
| district | 54.9–57.8 → **58.5–60.4** | 93.1–95.1 → **93.3–94.1** |
| block | 98.2–98.3 → **95.2–95.6** | 112.5–113.7 → **110.6–112.1** |

Five rows are flat or better and the worst case in the piece — a drag at the
district camera, where the whole city is in view and every one of its footprints
is past the dissolve — **improved**, which is not intuitive for a block that
added a sort, a shadow and eleven heroes. The likeliest reason is the solo table
no longer being decoded and drawn twice. The one row that went down is the block
drag, by about 3 %, and that is the counting sort and the shadow path being paid
where the frame is already comfortable.

The same caveat P4 stated still applies and is the reason nothing above is
quoted as a per-change delta: **the runs differ in what the data layer had
already cached.** A fourth partial run measured 120.3 fps on the whole-city
wheel zoom, well outside the range of the three complete ones, which is what
chunk arrival landing inside a measured window looks like.

---

## 8. What P4 left unwired (the original list, kept)

**`drawCity` was never ported, so the footprint prism loop is new code.**
`buildings.ts` ships the massing tier's own draw and every *rule* the footprint
tier needs — `tierW`, `drawnAsBuilding`, `colourLUT`, `inkFor`, the gates, the
ladder — but no `drawCity`; `DRAW.md` §5's module table does not list one, and
the mock's is 597 lines. `CityScene.drawFootprints` is written against those
rules and is a **simplification**, not a transcription. It does not carry: the
`RECT_SCALE` silhouette rung, the per-building contact shadow, the lot-grain
party lines, the arrival ramp's per-building stagger, or the landmark flush at
the bucket floor. Each is a real feature of the mock and each is a candidate
for a later block.

**No contact shadow.** `SHADOW_MIN_PX` and `EDGE_SHADE` are exported and no
module exports a shadow *draw*. Buildings therefore sit on the ground without
one, and at street zoom they read as slightly floating. Not invented here.

**The heroes are loaded and not drawn.** `data.landmarks()` returns all eleven
with their 127 parts, and `landmarks.ts` ships the emphasis law, the gate, the
conservation rules and the accent derivation — but no hero *draw* entry point
(`emitBand`, `heroMaterial`, `bandLambert` are pieces, not a pass). Only
`drawBridge` is an entry point, and the Golden Gate is on the map. Composing a
hero pass out of the pieces is a block of its own; guessing at it would put
eleven invented buildings on the most-looked-at frame in the piece.

**`PAINT.bidx` is not in the export, and the massing tone says so.**
part3.html §5732 replaced a seeded locale legend with the *area-weighted mean
of the measured roof colours of the buildings standing on the block*
(`paint/blocks.py`), and its own comment calls the legend it replaced "an
honest description of an invention, sitting in the frame this piece is most
often looked at in." `manifest.kinds.blocks` ships nine fields and none is a
roof index, and there is no block → building map in `base/massing` to
recompute it. So the massing solid is toned by a **published column of the
block itself** — its area-weighted mean LIDAR height, banded at `roofs.ts`'s
own 9 / 15 / 25 m — and the four surfaces come from the sixteen the buildings
already draw from. That is an art choice on a measured column and it is stated
as one in the code. **→ REPORTED to P1: `blocks` needs `bidx`.**

**The 1906 burn is loaded and never phased.** `drawTerrain(f, t, burnT)` takes
the phase and this shell passes 0. It is P5's — the burn is a moment in the
film, not a state of the map.

**The film, the timeline and the year scrub are P5.** `setYear()` exists, is
plumbed through the content key and the scene, and nothing calls it. The `fi`
slot is allocated and unused.

**The surround's cell seams.** At whole-city zoom the surround's land carries a
fine regular hatch that the city's own DEM does not (`p4-10-whole-city-2x.png`,
Marin and San Mateo). Both go through `paintCell`; the surround's cell is
110 × 139 m against the city's 53.8 m. It looks like hairline seams between
anti-aliased neighbouring quads. **Not touched** — `terrain.ts` is a landed
module and this block may not edit it — and reported rather than worked around,
because the plausible workarounds (a base fill under the surround) would be
painting something the data does not say.

**Two things the shell carries that are not arithmetic**, both honoured, both
documented at `planSlots`: `{alpha:false}` on every context, because
compositing a `globalAlpha` band into a transparent buffer and flattening it
rounds premultiplied alpha one more time (10.3 % of pixels off by one level
across the bay), and **the surround colour filled before the blit on every
frame**, so a fast flick cannot show raw canvas at the frame edge.

---

## 9. Accessibility

The canvas is focusable, carries a `role="img"` and an `aria-label` that is
rebuilt from the live frame — the bearing in degrees, the zoom, how many
buildings and blocks are drawn, and the key map. `SfBudgetTimeline`'s pattern
is followed for the interactive parts: the preset buttons are a labelled
`role="group"` with `aria-pressed`, and the keyboard path is the same numbers
as the pointer path, out of `camera.ts` — arrows pan `KEY_PAN` (12 % of the
viewport, 40 % with Shift), `+`/`−` zoom by `KEY_ZOOM`, `Home` returns to the
whole city, `Enter` opens the record for the block at the centre of the frame.
The drawer takes focus on its close button and closes on `Escape`. Verified in
Playwright: focus lands, `+`×4 moves 1.00× → 3.32×, `Enter` opens a panel,
`Escape` closes it, `Home` returns to 1.00×.

Under `NARROW_W` = 820 the ledger stacks below the map and `ledgerW` is passed
as 0, so the camera's visible strip *is* the canvas — which is the case
`Camera.strip()` was written for.

---

## 10. Screenshots

`screenshots/p4-*.png`, all taken against the dev server.

| | |
|---|---|
| `p4-10-whole-city-2x` | the whole city, DPR 2 |
| `p4-11-district` | district, 87,774 buildings |
| `p4-12-block` | block, with street surfaces and trees |
| `p4-13-street` | street, with facade openings |
| `p4-20-drawer-open` | the page with a block record open |
| `p4-21-drawer` | the drawer alone |
| `p4-30-mobile` | iPhone 13, ledger stacked below |
| `p4-ab-*` | the ablations of §7 |

---

## 11. P4b's screenshots

Every one against the dev server at 1440 x 940, DPR 2, and every claim in §8b
above was checked by looking at one of these before it was written.

| | |
|---|---|
| `p4b-00-before-*` | the four cameras before this block |
| `p4b-10-after-*` | after the footprint pass, the shadow, the heroes and `bidx` |
| `p4b-20-seam-*` | after the surround seam fix — **the current frame** |
| `p4b-40/41-seam-*-marin-4x` | Marin at 4x, before and after: the hatch, and no hatch |
| `p4b-50-hero-city-hall-district` | the block, the drum, the gilt dome, the ribs, the lantern |
| `p4b-51-hero-coit-tower` | the shaft and its terracotta cap, standing in the fabric |
| `p4b-90-cmp-whole-city-p4-vs-p4b` | beside `p4-10-whole-city-2x.png` |
| `p4b-91-cmp-street-p4-p4b-mock` | beside the mock's `shots/rv3-street.png` |

### Where production still is not the mock, stated

**Street zoom.** The floating is gone — the buildings sit on the ground, the
storey rhythm reads, and the fabric has depth. Three things the mock has at
that camera and production does not:

1. **no street trees at the street preset.** The ledger reads `Trees & canopy 0`
   at 44.9x where it reads 2,333 at 7.2x. The mock draws them at both. This is
   a pre-existing gate in the visible set, not something P4b changed, and it is
   not diagnosed here.
2. **the roof furniture is thinner.** `drawTray` fires, but the mock's second
   solid (`drawStep` / `FSLOT`) is not wired at all — that is the 68 shaped
   caps, and it is the next block's.
3. **the ground floor.** `facades.ts` ships entrances, shopfronts and cornices;
   the shell asks it for openings and nothing else.

**Whole city.** The surround hatch is gone and the massing is measured, so the
frame now says what the mock's `pa-final-whole.png` says: pale avenues, a dark
downtown, a colour range that came from a measurement rather than from a seeded
hash. Two differences remain, both named in §8b.5 — the surround's coastline is
a 110 x 139 m staircase because the mock's coast clip was never ported, and the
shallow-water plate still shows its own grid, which is `blitGridPlate` and a
different pass from `paintCell`.
