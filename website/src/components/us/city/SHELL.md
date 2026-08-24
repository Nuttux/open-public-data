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

---

## 12. Block Q2 — the drawing gaps, closed

**Block Q2.** Written as the work happened. Five gaps were named going in;
four are closed, one is closed further than it was scoped, and one turned out
to be blocked on the export and says so. Two defects that were **not** on the
list were found on the way and cost the picture more than three of the five.

Every screenshot below is `screenshots/q2-final-*.png`, taken against the dev
server through `canvas.toDataURL()` — the canvas bitmap, not a page grab, so
the route's own chrome is not in the frame and a redesign of the page mid-block
does not change what is being compared.

### 12.1 The trees, and the reason there were none

**The gate was not a gate. It was a decode bug, and it had moved every tree
and every canopy blob in the city into the Pacific.**

`world/build_world.py` bucketed the vegetation grid as `gj * GW + gi` with
`GW = 400` columns of 24 m — 9,600 m — against a city that is 14,272 m wide
from that grid's origin and needs 595. **That was fixed at source on
2026-08-23** (`encode_city_chunks.py` `TREE_FOLD`, `GW = 600`) and every `tree`
and `canopy` chunk entry in the shipped manifest has carried `gw: 600` since.
`trees.ts` went on decoding at 400.

Measured on `tree/10_10.qc`, whose own declared extent is
`[2048, 2048, 3072, 3072]`:

| | x | y |
|---|---|---|
| `gw = 400` | −7,200 … 2,376 | 6,360 … 7,896 |
| `gw = 600` | 2,040 … 3,048 | 2,040 … 3,048 |

Every one of the 129 tree chunks and the one canopy chunk agrees. That is the
check — **the width is right when a chunk's own cells land inside the extent
the encoder computed for it** — and it is why the width is now read off the
chunk entry through `assertTreeGrid` rather than written down twice.

| ledger `Trees & canopy` | before | after |
|---|---:|---:|
| street 35.9× | **0** | **1,198** |
| block 7.2× | 2,333 | **24,327** |
| district 2.9× | 10,391 | **12,028** |

The before column reproduces §11's own figures exactly, which is what says the
two states are the same camera. At block zoom the Mission goes from bare
blockfaces to a street grid with trees down both sides of every street.

Two more things in the same file were wrong in the same way and are fixed:

- **`TREE_YEAR0` was 1955 and the encoding base is 1900.** `build_world.py`
  writes `max(1, min(255, y - 1900))`, which is what makes 2026 fit in a `u8`,
  and `part3.html` gates on `1900 + yr`. Nothing on screen has been wrong yet
  because the film's clock is P5's and the gate is `year !== undefined` — but
  the first frame of the first scrub would have held **every tree in the city
  back by 55 years**, silently, because a held tree looks exactly like a tree
  that is not there. 1955 survives as `TREE_EARLIEST`, which is what it
  actually is: the earliest date in the file.
- **the lattice site is its centre, not its corner.** `part3.html` reads the
  `pos` nibbles as `(n + 0.5)·cell/q`. Reading the corner put every tree and
  every blob 0.75 m north-west of where the mock draws it — 1.8 px at the
  detail ceiling.

`drawVeg` was also brought onto the mock's own arithmetic: `proj.coeffs()`
instead of a `proj()` per tree (the allocation `buildings.ts` already paid for
once), **one DEM sample per 24 m cell** rather than one per tree, and the
mock's cell-level screen cull with its 200 px margin before any tree in the
cell is touched. It moved the frame rate by nothing measurable, which is the
tell that the cost is `drawImage` and not JS — see §12.6.

### 12.2 The ground floor, and the two bits that were the wrong way round

`facades.ts` shipped the *law* — the ramps, the party rule, the storey
supplement, the five batched groups — and P3 left out the **tables the law
reads**. Without them `emitFace` had to invent the rhythm, and it did: a column
every 4 m, an opening from 0.28 to 0.72 of it, on every building in San
Francisco. Every window in the city was the same window, and four of the five
face groups (`shop`, `lit`, `bar`, `bay`) were allocated every frame and never
written to.

`FA_VOCAB` is ported — ten types × five eras of module, glazed fraction,
opening height, its metre cap, its sill fraction and whether that (type, era)
carries a cornice — with `FA_GROUND`, the shopfront constants and `FA_SHOP_TOE`.
`emitFace` is rewritten against them and now draws what the mock draws: the
**shopfront** glazed across the frontage from the pavement to its fascia with a
mullion at each bay and its stallriser as a lit line; the **entrance**, in the
bay against the measured party wall, reaching the ground; the **vehicle
opening**; the **sill and the lit left jamb**; the **glazing bar**; the **bay
window**; and the **cornice**.

**And `faceWeights` was reading the wrong camera.** It was called with
`camScale: 1`, so every ramp in the file — each of which is defined as *the
feature's own projected size in CSS px* — was evaluated as though the camera
were at unit scale. Openings were drawn at a fixed ≈0.5 weight at every zoom
including whole city, and the ground floor never arrived at all. It now takes
`f.cam.scale`, and it takes the wall's **own projected length** rather than
`Lm · 1.2247 · camScale`: that factor is the across-screen maximum, and using
it for a wall turned into the frame opens the detail early on exactly the walls
that can least afford it.

**THE ROLE BITS WERE INVERTED, AND THAT IS THE DEFECT IN THIS SECTION THAT
COST THE MOST.** `facade/build_facade.py` L291 names its own values in the line
that writes them — `role = np.zeros(NV, np.uint8)  # 0 back, 1 front, 2 party`
— and `part3.html` reads them back that way twice. P3 landed `ROLE_PARTY = 0`
and `ROLE_BACK = 2`. So `faceTakesOpenings` refused every **back** wall in the
city and allowed all **163,536 measured party edges**: a row of Mission houses
was drawn with windows in the walls it shares with its neighbours, which is the
exact opposite of the rule the constant is named for. Nothing threw and all 303
tests stayed green, because the two tests that mention `ROLE_PARTY` assert
against the constant rather than against the stream.

Not ported, and each is a real difference rather than an omission:

- **the garage under the entry.** The gate needs `gar`, one measured bit per
  building, and the `face` kind ships `gid`, `ty`, `st2`, `shop`, `role` and
  nothing else. **→ REPORTED to P1: `face` wants `gar`.**
- **the awning.** Drawable from the shop bit alone, but it needs a sixth face
  group with its own alpha, and `FaceGroups` has five. Deliberately left for a
  block that can measure whether it earns one.

### 12.3 The surround's coastline, and the staircase that was not the surround's

The coast clip is ported — `drawSurround` now takes the rings, sets **one**
clip for the whole pass at the published shoreline, and samples each ring
vertex at the surround's own bilinear elevation so a vertex lands exactly on
the quad it is cutting.

**`base/coast` is the wrong ring set and clipping to it deletes the surround.**
It is San Francisco's own DataSF shoreline — 4 rings, 425 vertices — and the
first frame drawn through it is the peninsula alone in haze, with Marin, the
East Bay and San Mateo cut away. The mock clips at `window.COAST`, which is a
different published file: US Census TIGERweb areal hydrography, **12 rings,
3,168 vertices**, over the whole 416 × 280 grid, and it is the same file
`gen_context.py` rasterises to build the land mask the map already draws — it
reproduces the shipped mask on 116,480 of 116,480 cells. So the ring is not a
new claim; it is the ring the existing mask was cut from, at the precision the
ring has instead of at the 110.01 × 139.15 m the mask quantised it to.

It was not in the export. It is now, as a **sidecar beside the chunks** on the
`base/heroes.json` / `base/marks.json` pattern, written by
`pipeline/scripts/us_sf_city/emit_surround_coast.py` — 67,588 bytes, **20,130
gzipped**, fetched once and not on the first-paint path. It carries three
things:

| | |
|---|---|
| `x`/`y`/`start`/`count` | the rings, whole metres (worst quantiser error **0.699 m**, 0.03 px at the whole-city preset, measured on every run and carried in the file's own meta) |
| `xtra` | 3,017 **reach** cells: a water cell that touches surround land. The surround paints cells whose CENTRE is land, so without these the fill stops up to one cell short of the ring. Safe only under the clip, and `surroundOrder` says so |
| `cfix` | 5,433 **city** cells more than 300 m outside the published land |

**And `cfix` is the bigger half, because the staircase in the opening frame was
never the surround's.** `base/terrain`'s mask is DataSF `txuc-3kzm` rasterised
at 53.815 m, and `txuc-3kzm` is the boundary of the **City and County of San
Francisco** — a legal boundary that runs kilometres offshore into the Pacific
and straight across the Golden Gate. **4,787 of the city's 43,187 ground cells
— 11.1 %, 13.86 km² — are open water painted in the city's ground tone.** That
is the straight edge in the water at the south-west of `q2-final-whole.png`'s
predecessor, and it is why the strait did not read as a strait. It is applied
inside `TerrainField.maskAt` and not in the cell loop, because `maskAt` is also
what the node average, the depth order and `fitCity`'s own extent walk read: a
cell that is not land must not be land to any of them.

Together: **4.34 % of the whole-city frame changed.** The Golden Gate is a
strait, Marin has a shoreline instead of a stair, and the city stops where its
own waterfront register says it does. The 300 m pad is what keeps the
Embarcadero's finger piers, Fort Mason and the Aquatic Park breakwater, which
are real made land the county-scale hydrography does not carry.

### 12.4 The pixel floor at DPR 1

`paintCell` picks `k = min(ceil(Δ/tgt), floor(px/minpx))` and `minpx` is 2
**device** px at every DPR. At DPR 2 the surround cell is 12.02 × 7.38 device
px and the vertical subdivision runs to 7; at DPR 1 the same cell is
6.01 × 3.69 and `floor(3.69/2)` pins `ky` to **1 on every cell**, whatever the
value step. The cell is then painted as the **mean of its four nodes**, so the
bilinear surface the function exists to draw is replaced by a staircase whose
tread is the cell.

The floor is right and stays — a sub-quad finer than the pixel it lands in is
paint nobody can see. What was wrong is painting a **constant** when the floor
bites. A linear gradient down the cell is the same number of fills, needs no
sub-quad, and **along the axis it runs on it is exactly the bilinear surface**:
with `k = 1` in that axis the bilinear reduces to a linear interpolation
between the two edge means. Cached the way `wallGrad` is, keyed on a row and a
colour pair, because every cell in a row shares its two y-coordinates.

Measured at DPR 1, whole city, on a pure-terrain window of the Sunset
hillside — the dominant vertical period of the first difference down the
column:

| | dominant period | mean \|Δ²\| |
|---|---:|---:|
| flat | **2.27 px** — the DEM cell pitch | 9.73 |
| ramp | **9.83 px** — the relief | 9.30 |

33,308 pixels change and the raster wall time does not (3,033 ms against 3,150
ms, which is noise in the other direction). The stair is a **city** DEM
artefact as much as a surround one, which §8b.5 did not say: the city's 53.8 m
cell is 2.93 CSS px at the whole-city preset at DPR 1, and the floor bites
there too.

### 12.5 The second solid and the 68 caps — blocked, and precisely where

**Not drawn, and not for want of the draw.** `base/caps` ships all 68 —
`bi` (a `gid`), `prof`, and the shared six-profile table `poff`/`pu`/`ps` —
and `data.ts` decodes them into `CapData`. What is missing is **the solid the
profile shapes.**

`part3.html`'s `lrStep` takes a slot `s` and reads `FTOP[s]` (the step's top),
`FRAD[s]` (its radius), `FPX/FPY[s]` (its own area centroid), and the
pre-projected octagon `FOX/FOY/FVIS/FLAM`. All of that is Block C's second
solid, built by `form/model3.py` and shipped in the mock as `window.FORM`:
six arrays keyed `i, t, r, an, dx, dy` over ~532 slots plus the mast
supplement. **`manifest.kinds` has seventeen kinds and none of them is a form
slot**, and the two published columns it is derived from — `ynuv-fyni`'s
`hgt_maxcm` and the A2 area — are not in the `bldg` chunk either, whose ten
data fields are `h`, `yr`, `u`, `st`, `hf`, `paintIdx`, `paintFlag` and the
geometry.

So `drawStep` and the caps are the **same** missing input, and drawing either
would mean inventing the height and the plan of a mass that the file has an
exact measurement for. `roofs.ts` has shipped `stepFires`, `stepFraction`,
`FSTEP_LIFT_PX` and `FSTEP_W_PX` since P3 with nothing to feed them.

**→ REPORTED to P1: `base/form` — the 488 Block C second solids and the mast
supplement, as `i` (gid), `top`, `rad`, `ang`, `dx`, `dy`. It is under 4 KB and
it unlocks `drawStep`, the 68 shaped caps and the third solid in one chunk.**

The prompt's own example is worth correcting on the record: **City Hall's drum
and dome and the Ferry Building's clock tower are already drawn** — they are
two of the eleven `base/heroes`, wired in P4b, and `screenshots/p4b-50-hero-
city-hall-district.png` is the drum, the gilt dome, the ribs and the lantern.
What the caps would add is the shaped tops of 68 **ordinary** buildings, which
is a smaller thing than it sounded.

### 12.6 The frame rate, counted again — and what it does not say

Same protocol as §6 and §8b.6: `requestAnimationFrame` counted **in the page**
during synthetic gestures, a 30-step drag and an 18-notch wheel zoom, 1440 ×
940, DPR 2, headless Chromium. Two complete runs, reported as the range.

| | drag | wheel zoom |
|---|---:|---:|
| whole city | **99.1–99.4** | **23.4–27.5** |
| district | **92.2–94.4** | **42.4–48.3** |
| block | **86.5–88.1** | **99.4–99.8** |

**These are NOT comparable with §8b.6 and it would be dishonest to put them
beside it.** Two things moved underneath the measurement and neither is this
block's: the route was redesigned into a full-bleed hero during the session, so
the canvas went from roughly 1,152 × 680 CSS px to 1,440 × 694 — **45 % more
pixels per raster** — and P5's film layer landed in the same tree. The district
**drag** is up by half against §8b.6 and the whole-city **zoom** is down by
two-thirds, and no attribution of either to a change in this block would
survive being asked for evidence.

What *was* measured properly is the shape of the frame, because the surviving
clause is *no visible hitch during a camera move* and a mean cannot see one.
rAF **intervals**, whole-city 18-notch wheel zoom:

| | median | p95 | worst | frames > 250 ms |
|---|---:|---:|---:|---:|
| as shipped | **8.4 ms** | 216.8 | 774.9–916.6 | 4–5 |
| `?layers=-veg` | **8.4 ms** | 167.4–216.6 | 317.7–1,016.7 | 2–5 |

**The median frame is 8.4 ms in every configuration** — a gesture is a blit and
none of this runs during one. The long frames are the handful of full
re-rasterisations a zoom forces when it crosses a band, and the control run
with the vegetation switched off entirely came back at 1,016.7 ms, so **the
band crossing is the object and the trees are not.**

That control is the reason a **motion rung for the vegetation was written,
measured and taken back out.** The first paired measurement looked like a clear
indictment of the trees (917 ms against 316 with `-veg`), so the dissolve
weight was multiplied by 0.30 while the camera moves — the same `vrnd(i) >= w`
index test, so a subset and not a reshuffle. It did not move the worst frame,
and the next `-veg` control was worse than the run it was controlling for. The
run-to-run variance is larger than the effect. A change that costs the reader
trees during every move has to buy something measurable; this one did not, so
`VEG_HAS_NO_MOTION_RUNG` records the attempt instead of the code recording a
conclusion the numbers do not support.

### 12.7 Three things this block added that are not drawings

- **`CityScene.sceneVersion`, in the renderer's content key.** Dropping the
  band caches was never enough on its own: a settled camera is shown through a
  pre-painted buffer, and `contentKey` carried the step, the year, the data
  version and the dissolve weight — and nothing for *the scene rebuilt its own
  caches*. The coast clip landed, the bands were dropped, and the frame on
  screen went on being the one painted before it for as long as the reader did
  not touch anything. This is how that class of change becomes visible at all.
- **`globalThis.__cityRenderer` / `__cityWA` / `__cityQF` / `__cityFA`, dev
  only.** Every comparison has to be taken at the same **absolute scale** as
  well as the same preset, because `cam.step` selects both `cam.base` and
  `ZEX`; a preset button cannot express *this scale at this centre*. All four
  are behind `process.env.NODE_ENV !== "production"`, which the bundler inlines,
  so the branch is dead code in a production build.
- **`QF.coast` and `WA.ramp`**, on `terrain.ts`'s own `LOOK` idiom, so both of
  this block's terrain changes can be turned off in one page for a before/after
  at one camera one second apart.

### 12.8 For Block Q1

`website/.parity/out/*.prod.png` are **blank frames** — a flat `#e9e5dc` field,
which is the surround colour the shell fills before the blit. `C1-blk-dtown-
2018` reports 96.61 % of the frame differing and a prod mean RGB of
(236, 231, 220) against the mock's (152, 151, 138); that is not a difference
between two drawings, it is one drawing and one empty canvas. The ranking in
`GAPS.md` will be noise until the prod driver waits for a raster. What works
here is: wait for `globalThis.__cityRenderer`, then for every `tier === "base"`
chunk to be `data.has()`, then poll `data.stats()` until `inFlight` and
`queued` are both 0, then `invalidate()` and take `canvas.toDataURL()` rather
than a page screenshot.

---

## 13. Block R1 — the band was never put on the projection, and the streets
##     were gated on a tree

Two items off `.parity/GAPS.md`'s ranked list, §1 and §2. Both were in the
composition; neither needed a line of `streets.ts`, `terrain.ts` or the route.

### 13.1 `ZEX` never moved with the LOD band

`projection.setBand()` existed, was unit-tested, and **nothing called it**. So
`bandFor()` built each band's `TerrainField` at that band's exaggeration —
2.6 at district, 2.0 at block — out of a **second, local copy of the ladder**
(a literal `[3.3, 2.6, 2.0]` sitting next to `projection.ts`'s `ZEX_BY_STEP`)
while `proj.zex`, which places the block massing, the building prisms, the
heroes, the hit test's `invAt` march and the pan clamp's box, stayed at 3.3 for
the life of the page. **The city was drawn at an exaggeration its own ground was
not drawn at.**

Three lines closed it, and the third is the one that matters:

- `bandFor()` reads `ZEX_BY_STEP`. One ladder, not two.
- `render()` calls `projection.setBand(step)` immediately after `cam.syncStep()`
  — the top of the frame, before the cross-fade snapshot, before `decideRaster`
  reads `cur.step` and before `place()`, and outside `rasterise()` so that the
  hit test, which runs *between* frames, marches the ground the reader is
  looking at. `setBand` is idempotent, so a held frame costs one comparison.
- the renderer **subscribes to `onRebuild`** rather than doing the invalidation
  inline at the call site, so an *external* `setBand()` — the parity harness
  drives one — lands on a renderer that is still self-consistent. The typed
  reason is load-bearing: `"band"` moves ZEX only, so the per-band terrain
  caches (each built at its own ZEX), the tree sprite sheet (which bakes ZEXB,
  not ZEX) and every table pre-projected at z = 0 all survive it; `"tilt"` and
  `"bearing"` move the plane and nothing does.

**Measured, through each build's own screen transform.** `assert_camera.py`
reported max |dy| = 1 px and was right — but it pushes points at **z = 0**, and
z = 0 is exactly where a ZEX difference cannot show, because plane-y gains
`z · ZEX`. Pushing 25 points per camera at **their published DEM elevation**,
the same metres handed to both builds as literals, at the same year, band and
absolute scale (`scratchpad/dygeom.py`, same camera table as `capture.py`):

| camera | band | median |Δy| before | after |
|---|---|---|---|---|
| A1–A4 whole city | 0 | 2.0 px | 2.0 px |
| B1 district · Civic Center | 1 | 9.1 | 2.0 |
| B3 district · Sunset | 1 | 17.8 | 2.0 |
| B4 district · Mission | 1 | 12.0 | 2.0 |
| C1 block · downtown | 2 | 39.0 | 2.0 |
| C2 block · Civic Center | 2 | 51.3 | 2.0 |
| C3 block · Mission | 2 | 61.6 | 2.0 |
| D2 street · Civic Center | 2 | 295.6 (max 356.8) | 2.0 |
| D1 street · downtown | 2 | 393.5 (max 473.1) | 2.0 |

**2.0 px is the floor, not a residual**: it is the host div's 2 px border —
prod's stage is 1200×678 against the mock's 1200×680 — and the whole-city rows,
where ZEX never differed, read 2.0 in *both* columns. So the measurement's own
zero is proved on the same run that reports the gap.

Frame difference at the same cameras fell with it: D1 93.8 → 85.2 %,
C3 96.7 → 92.5 %, C2 88.7 → 87.1 %, B3 92.6 → 86.0 %.

**Do not measure this with a whole-frame residual.** 85–96 % of the pixels
differ for reasons that are not geometry, so residual-vs-`dy` is flat to within
0.1 % and its argmin is noise — it put D1's *before* shift at +312 on one metric
and −670 on another. Registering on **edges** (Sobel, binarised per frame at the
90th percentile, which removes the tone difference entirely) does localise it:
the Dice peak at C2/C3/D1/D2 goes from a flat 0.10–0.12 at a wandering `dy` to
0.17–0.24 **at dy = 2**.

### 13.2 A measured correction to `GAPS.md` §1's last paragraph

It says the stale `cam.bbox` means "the pan clamp at bands 1–2 is clamping to a
city the projection is not drawing". The mechanism is real and the renderer now
re-points the box on the band event — but for **this city the three boxes are
byte-identical**:

```
[-8293.94405109327, -3432.378228534883, 8513.157284088664, 5059.538488175877]  ×3
```

`cityBBoxByBand` does honour its scratch `zex` (`Projection`'s constructor takes
it). The boxes agree because the **plane-y extrema of the DEM walk land at sea
level** — the far-north planimetric corner beats every summit by more than the
280 m × (3.3 − 2.0) = 364 units the exaggeration could add. So that half of §1
is arithmetically inert at San Francisco's numbers. It is wired anyway: it is
one line, and a different tilt, a taller DEM or another city makes it bite.

### 13.3 The street surface was gated on a constant belonging to the trees

`scene.paint` had `if (L.streets && z >= VZ_T0)`. **`VZ_T0` is `trees.ts`'s
threshold for promoting a canopy blob to individual trees.** It is 2.9, which is
also `ZSTEPS[1]`, which is why it read as deliberate. A layer that asks another
layer's constant whether it should draw is not gated, it is coincident.

The street layer's own rule is published, and it is metric rather than banded:
`streets.ts` opens the extent tier when a right of way projects `ST_EXT_PX` =
2 px wide, and at ROT 315 a width at an unknown bearing projects at `ST_KPROJ`.
The dispatch now asks exactly that of the city's ninetieth-percentile right of
way — `w_p90` = 25.7 m, out of the encoder's own manifest, which is the same
number and the same test the mock's `drawStreetSurface` opens on. Nothing in it
is chosen; all three values are read.

### 13.4 …and under it, a rung decided in the sixteenth digit

Fixing the gate was not enough, and the reason is worth keeping.

`data.ts` selects a tier with `if (view.z < c.minZ) continue`, and `minZ` for
the 125 `strt` chunks is **2.9 — the district preset itself**. `view.z` is a
quotient, `cam.scale / cam.base`, and a quotient of two doubles need not
reproduce the rung exactly even when the camera is arithmetically on it. The
parity harness pins the **mock's** absolute scale into prod, whose own `base`
differs in the sixteenth digit:

```
0.13533136705963567 / 0.046665988641253695 = 2.899999999999999   // one ulp low
```

So `view.z < 2.9` held, the `strt` tier was never requested and never yielded,
and the street layer drew nothing at **all six district cameras** — which is
`GAPS.md` §2's whole table, and it is not a missing feature and not a slow tier.
`viewQuad` now snaps the number it hands the data layer to a rung when it is
within **eight ulp** of one, the rungs read from `manifest.tiers`. Eight ulp of
2.9 is 1.4e-14; no wheel, gesture or preset can express a zoom that close to a
rung and mean a different one.

**Only the selector is snapped.** `paint()` keeps its own `zOf(cam)` raw, and
must: every ramp the drawing hangs off is a continuous curve of the camera, and
`CAMERA.md` finding 5 is that a floor on a *drawn* quantity is a step in the
first derivative. Quantise the key, never the value. This is a key.

### 13.5 The street cell count, before and after

`scene.streets` off a forced full re-render (`cur = null; invalidate()`) behind
`capture.py`'s data gate — `RendererState`'s counters accumulate across
incremental frames and must not be read any other way:

| band | camera | before | after |
|---|---|---|---|
| 0 whole city | A4 · 2018 | 0 | **0** — correct; 25.7 m projects 1.12 px, under the 2 px gate, and the mock draws none either |
| 1 district | B3 · Sunset | 0 | **5,423** |
| 1 district | B6 · Nob Hill | 0 | **6,055** |
| 2 block | C1 · downtown | 3,046 | 3,046 — the gate is a no-op here, as it must be |
| 3 street | D1 · downtown | 138 | 138 |

Driven through the page's own preset buttons, no injection: whole city 0,
District **7,812**, Block 2,012, Street 124, `zex` 3.3 / 2.6 / 2.0 / 2.0, zero
page errors. `out/r1-B3-streets-mock-before-after.png` is the picture — the
mock's ruled cream carriageway grid, prod's undifferentiated ground, and prod
now.

### 13.6 What is left of §2, stated exactly

The mock's carriageway opens at `cam.scale > ST_EXT_PX / (25.7 · ST_KPROJ)`,
i.e. **z ≈ 1.792**. Measured on both builds at the same camera: at z = 1.75 both
draw 0; at z = 1.80 the mock draws 1,157 and prod draws 0. Prod cannot draw
there because the `strt` tier is not fetched below z = 2.9.

So the residual is one number and it is **not in this shell**: `minZ` for the
`strt` tier in `public/data/us/sf/city/manifest.json`, written by the encoder.
Lowering it to the layer's own threshold would close the octave z ∈ [1.79, 2.9),
the lower third of band 1. It is left alone here because it is published data
and a fetch policy, not composition — and because at 2.9 it costs the district
frame what `streets.ts` measured it at, +56 ms on the one settle raster.

### 13.7 The performance clause, counted

The surviving budget is *no visible hitch during a camera move*. A real drag at
the district camera, driven through pointer events, rAF deltas counted in the
page, A/B'd with the page's own `?layers=-streets` switch so both runs are the
same build and the same gesture:

| | streets drawn | median frame | p90 | worst |
|---|---|---|---|---|
| `?layers=-streets` | 0 | 8.3 ms | 9.0 ms | 333.6 ms |
| shipped | 6,073 | 8.3 ms | 8.8 ms | 349.3 ms |

The move is a blit in both — the band is frozen for the duration of a gesture,
so nothing re-projects — and the one long frame is the settle rasterisation,
which is 334 ms with the layer *removed*. The district band's new street cost
lands there and nowhere else.

### 13.8 Where the frames are

`capture.py` writes `out/<id>.prod.png`, so a sweep overwrites the last one.
This block's are kept beside it: `<id>.prod.r1-before.png` and
`<id>.prod.r1-after.png` for B3, C2, C3, D1, D2, readable by the harness's own
`diff.sheet(cid, ".r1-before")`, and Block Q1's originals preserved as
`<id>.prod.q1.png`. Note `diff.py` now **refuses** a 1360 vs 1356 size mismatch
rather than cropping to the minimum, so the whole-city rows need a re-shoot at a
matched stage before they can be differenced again.

## 14. Block V1 — the entry plate, the fourth stop, reduced motion, and the phone

Nothing here is committed. Files touched: `lib/city/camera.ts`, `CityMap.tsx`,
`app/us/city/sf/the-city/TheCityClient.tsx`, the `fx-city-*` block of
`fusion.css`, `i18n/{en,fr}.ts`. Harness added: `.parity/v1shot.py` (the real
page at a viewport, with or without `prefers-reduced-motion`),
`.parity/v1targets.py` (every interactive target and the layout boxes,
measured), `.parity/v1plate.py` (what the entry plate costs the picture),
`.parity/v1rm.py` (the film played and sampled, year on the glass and camera).
Frames are `out/v1-*.png`.

### 14.1 The entry plate was a veil over two fifths of the drawing

Measured before anything was written, at 1600 x 1000 on the district camera —
the same frame twice in one page load, once as it shipped and once with
`display:none` on `.fx-city-entry`, by eighths of the stage (`v1plate.py`):

| x range | mean luminance off → on | RMS contrast kept |
|---|---|---|
| 400–600 | 153.7 → 231.0 | **73 %** |
| 600–800 | 155.4 → 217.5 | **39 %** |
| 800–1000 | 154.9 → 192.8 | **65 %** |
| whole stage | 174.9 → 214.4 | 92.5 % |

The plate's background was `linear-gradient(100deg, .97 → .93 at 34 % → .58 at
58 % → 0 at 84 %)` over the **full height** of the stage. None of the three
columns above carries any of its text. At 390 x 844 it was worse: a
`180deg` ramp reaching .95 by 62 % of the stage, over the whole 390 px width,
so the city was a ghost behind four lines of type at every column.

**The text takes a card and the map is the map.** `.fx-city-entry-in` gets the
page's own border idiom (1 px `--ink` on `--bg`, the same object the film's
paused panel is) and the gradient is gone at every viewport. After:

| x range | mean luminance off → on | RMS contrast kept |
|---|---|---|
| 600–800 | 155.3 → 155.4 | **100.0 %** |
| 800–1000 | 154.8 → 156.2 | 101.2 % |
| 1000–1200 | 165.1 → 167.5 | 101.5 % |
| 1200–1600 | unchanged | 98.7 / 100.0 % |

Everything from x 600 out is the drawing at full strength; the card is 462 x 440
at 1600 x 1000, **19 % of the stage against 62 % of the frame veiled before**,
and what it covers it covers honestly. `out/v1-plate-before-d1600-on.png` against
`out/v1-plate-after2-d1600-on.png`, and `v1-plate-before-p390.png` against
`v1-plate-after-p390-entry.png`.

The card's `max-width` is `calc(47ch + 48px)`: the measure is the copy's, so the
card's own gutter is added back rather than taken out of the line — at 47ch flat
the headline broke to three lines.

**On a phone the lede is dropped and nothing else is.** The same sentence is
printed under the map in the note, 300 px down the same screen. What that buys
is the card's top edge: at the whole-city fit San Francisco sits across the
MIDDLE of a 390 x 844 screen, and the kicker, the running time and the lede were
each pushing the card up over it.

### 14.2 The fourth camera stop means a fixed closeness, and now says so

**Decided: STREET is the record's own limit — 2.0 px per world unit, 2.454 CSS
px per published metre — on every screen.** Measured through the real button
(`v1shot.py`, `mode=preset3`):

| viewport | `cam.base` | fourth stop | absolute scale |
|---|---|---|---|
| 1600 x 1000 | 0.067134 | z 29.79x | **2.0** |
| 768 x 1024 | 0.039298 | z 50.89x | **2.0** |
| 390 x 844 | 0.019956 | z 100.22x | **2.0** |

The z column varying is not the ceiling moving: it is one constant divided by
three different fits. The alternative — a fixed multiple of the fit, which is
what `MAXZ` was — makes the *record's* own limit a function of the browser
window: the same press draws a building 37 px wide on a desktop and 13 px on a
phone, and a link sent from one screen lands at a different closeness on the
other. The footprints ship on a one-metre lattice (`encode_city_chunks.py`,
"integer world metres, BLDG.q = 1.0"), so at this stop one quantum is 2.45 px —
resolved, and no finer. `out/v1-base-p390-street.png` and
`v1-base-d1600-street.png` are the same building size on both screens.

**The bug that came with it.** `CityMap` tested the fourth button's pressed
state as `z > 11.5` — `MAXZ` plus a rounding, from before the ceiling was
absolute. At 390 x 844 the ceiling is z 100.2, so STREET read pressed from z
11.5 up, eight times short of the stop it names. Now `Camera.pressedPreset()`
compares the ABSOLUTE scale against each stop in log space with `SNAP`, deepest
first, and returns −1 between stops — which is where a wheel leaves the camera
and is the honest answer.

### 14.3 The ladder's own seam, stated and not hidden

The three lower stops are multiples of the fit and the fourth is absolute, so
the last press is a different size on every screen: **4.1x at 1600 x 1000 and
13.9x at 390 x 844.** That is inherent — a phone starts 3.4x further out in
absolute terms and has the same number of stops to cover it with — and it is
why the reduced-motion cut below matters more on a phone than anywhere else.
`ZSTEPS` was NOT touched: it drives `BANDS`, `bandOf`, `cam.step` and therefore
the projection, and re-spacing the ladder to even the seam would move the LOD
band boundaries under five other agents.

### 14.4 The phone: the year rail was below the fold

Measured at 390 x 844 (`v1targets.py`), before:

```
  stage      y   90 … 647     the map, 66 vh
  ledger     y  647 … 884     the record margin, 237 px
  transport  y  884 … 1043    THE YEAR RAIL — below an 844 px fold
```

The rail is the one control that changes *what* is on the map rather than how
close you are to it. A reader who never scrolled past the record margin never
found out this map has a century in it. Under 820 px the frame is now
`display: contents` and the column orders map → rail → margin → help, which is
what lets the margin — inside the frame, because on a wide screen it is painted
ON the canvas — take its own place. After: `stage 90…647, transport 647…812
(rail at 713), ledger 812…1049`.

Target size at the phone breakpoint only, WCAG 2.2 SC 2.5.8 asks 24 x 24 and
Apple and Google publish 44 and 48: the four camera stops 30.3 → 46 px, the play
button 40 → 44, the three speed buttons 30.3 → 44 tall. Of the sixteen targets
on the city surface, **five remain under 24 px and all five are the source links
in `SfSourceFooter`**, which is not this block's file.

The block record is brought to the reader: stacked, a block picked at the top of
the map answered 240 px below the fold. `CityMap` now scrolls the margin into
view on a pick when the layout is stacked — `block: "nearest"`, so the map is
not thrown off screen, and instantly under `prefers-reduced-motion`.

The keyboard help line is hidden under 820 px. It is written for a keyboard.

### 14.5 Reduced motion, run for the first time

The path existed and had never executed. It does now, and it was traced rather
than eyeballed: `v1rm.py` plays the film and samples the year **off the glass**
(the `.fx-film-year` node — the probe's own `where()` recomputes the state
without `reduced` and would have reported the wrong year), together with the
camera's absolute scale, every 250 ms.

**The film, at 1600 x 1000 under `reduce`** (386 samples, shots 0–7 before
another agent's edit reloaded the page; shot 9 taken separately with
`v1rmtail.py`):

| shot | segments seen | years shown | distinct `cam.scale` |
|---|---|---|---|
| 1 | run | 1906 → 1911 | **1** |
| 3 | build, hold, move, run | 1912 → 1917 | **1** |
| 5 | move, run | **1918 → 1944, 27 distinct years** | **1** |
| 9 | hold, move, run | **1966 → 2018, 53 distinct years** | **1** |

One scale per shot, through the `move` segments as well: **the camera cuts.**
And the year runs — including in the two shots the mock found pinned at their
end value. The same shot 3 under `no-preference` reports **19 distinct scales**
in its move, which is the A/B: what `reduce` removes is the flight, and nothing
else. `out/v1-rm-d1600-shot1.png`, `out/v1-rmtail-1600-shot9-r.png`.

Note shot 6 → 7 shows 1945 and then 1935: that is the film's own ten-year
rewind between those two shots, documented in the mock's `BLOCK-R.md` under
"not touched, on purpose". It is the cut, not the reduced path.

**The explorer had no reduced path at all.** The four camera stops glided,
`easeOutCubic` over 520 ms, and `Home` glided over 620 ms — from the Street stop
on a phone that is a hundredfold zoom-out across the whole frame. Both now cut.
Traced at 390 x 844 (`v1cut.py`), `cam.scale` sampled every frame across a press
of STREET:

```
  normal   0.01996 … 1.162 … 1.313 … 1.445 … 1.555 … 1.655 … 1.737 … 1.978   (≈520 ms)
  reduce   0.01996 … 2.0 at the first frame after the press, and 2.0 after that
```

Both land on the same stop and `aria-pressed` reads STREET in both. What is NOT
subtracted, deliberately: the wheel, the drag, the inertia and the ± keys are
direct manipulation — the reader's own hand is the motion — and the year rail
still runs, because a year changing is the subject of the piece and not a
camera move. The film's own opacity cross-fades stay for the same reason
`gen/motion.js` gives.

The one long frame is cheaper too: at 390 x 844 the glide costs two frames over
50 ms (120.8 ms at the start of the move, 99.3 ms at the settle raster
afterwards) and the cut costs one (83.2 ms). Median 8.3 ms in both.

`openNote()`'s smooth scroll and the block panel's scroll-into-view are both
instant under `reduce`.

### 14.6 What is still wrong on a phone, and is not in these files

- **The site's chat launcher and the round "N" badge sit on the content.** At
  390 x 844 the launcher covers the right-hand end of the year rail's caption
  and part of the block record's first line, and the badge sits on the film's
  scan citation — the film's CSS says the launcher is z-40 and goes under the
  full-bleed canvas, and the badge is not covered by that rule.
- **Five targets under 24 px**, all of them the source links in
  `SfSourceFooter`.
- **A place name can still be written off the left edge** — `…et Playground` in
  `out/v1-base-p390-street.png`. That is `labels.ts`'s anchor-against-a-constant
  margin, the mock's own Block R defect (c), in another agent's file.

### 14.7 The frames, and how to re-take them

```
  python3 .parity/v1shot.py   W H TAG [entry|explore|film|preset0..3] [reduce] [t]
  python3 .parity/v1targets.py W H [film]        every target and every box, measured
  python3 .parity/v1plate.py  W H TAG [preset]   the plate on and off, luminance by eighths
  python3 .parity/v1cut.py    W H                a preset press, cut against glide
  python3 .parity/v1move.py   W H FROM TO [reduce]   rAF gaps across a camera move
  python3 .parity/v1rm.py     W H TAG reduce|normal [SECONDS]   the film, played and sampled
  python3 .parity/v1rmtail.py W H SHOT SECONDS [reduce]  one shot, seeked to and then played
```

| frame | what it shows |
|---|---|
| `v1-plate-before-d1600-on.png` / `v1-plate-after2-d1600-on.png` | the veil, and the card |
| `v1-plate-before-p390.png` / `v1-plate-after-p390-entry.png` | the same on a phone |
| `v1-base-p390-full.png` / `v1-after-p390-explore.png` | the year rail below the fold, and above it |
| `v1-base-p390-street.png` / `v1-base-d1600-street.png` | the fourth stop, both screens, same closeness |
| `v1-block-390.png` | a block picked on a phone, and the record it answers with |
| `v1-rm-d1600-shot1.png`, `v1-rmtail-1600-shot9-r.png` | the film under `reduce` |
| `v1-rmtail-390-shot3-n.png` | the film on a phone, full-bleed |
| `v1-final-t768-entry.png` | 768, stacked, card at the foot of the map |

**A measurement that spans an edit is worthless here.** Two full-length film
runs died mid-play — `window.__cityFilm` simply gone — because another agent
saved a file in `src/` and Fast Refresh reloaded the page. `v1rm.py` reports
`PAGE RELOADED` rather than averaging across it, and `v1rmtail.py` exists so a
late shot can be reached in one seek instead of 130 s of play.
