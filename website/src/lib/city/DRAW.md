# The draw modules

**Block P3.** Written as the work happened, not after it.

Nine modules under `website/src/lib/city/`, sitting on `projection.ts`,
`camera.ts` and `data.ts` (P1 and P2, landed). They own everything that puts a
pixel on the canvas and nothing that decides where the camera is, what the data
says, or what React does with either.

    terrain.ts    the DEM, the hillshade, the aerial fade  — and the Frame
    water.ts      the bay, the shoal band, the NOAA depth plate
    streets.ts    right-of-way surface, carriageway, kerb, footway
    trees.ts      195,310 street trees and the canopy
    buildings.ts  massing, footprints, the LOD ladder and its dissolve
    facades.ts    openings, storey rhythm, entrances, cornices, shopfronts
    roofs.ts      the coping, the dropped deck, the second step
    landmarks.ts  the authored heroes, the shaped caps, the bridge
    labels.ts     streets, named places and hoods sharing one ink budget

Source: `scratchpad/sf-city-anim/gen/part3.html`, 9,341 lines of vanilla JS,
plus the twelve per-block write-ups it was assembled from. **The comments in
that file are the project's institutional memory** and the single biggest risk
in this rewrite was losing them. They are carried across as doc comments on the
functions they belong to, so the next person reads them standing where the bug
was.

---

## 0. The one shared type, and why it lives in `terrain.ts`

`Frame` is what one paint of one canvas is: a context, its CSS size, the
camera, the projection, the device pixel ratio, and **whether the camera is
moving**. Every draw entry point takes one.

It is declared in `terrain.ts` rather than in a tenth file because the ground is
the first surface painted and the largest consumer of the colour arithmetic that
travels with it (`shade`, `skylit`, `skylitN`, `lerpHex`, `rgbHex`, `tiltOf`,
`qTilt`). Putting it anywhere else would make some module import *down* the
paint order. Nothing imports upward: `terrain → water → streets → trees →
buildings → {facades, roofs} → landmarks → labels`, and each stage imports only
from stages before it.

`moving` is not cosmetic. Every quality dial has a settled value and a moving
value, and the one surviving performance clause — **no visible hitch during a
camera move** — is met structurally rather than by tuning: a move is served from
a blit of a pre-painted buffer (`camera.ts` `decideRaster`), so the city is not
re-rasterised while the camera is moving. Block FACADE measured this directly
and found its whole pass added nothing to any of the film's eight moves.

---

## 1. `terrain.ts`

### The module

| | |
|---|---|
| frame | `Frame` `sx` `sy` `zOf` |
| dials | `LOOK` `QF` `WA` `RS` `resTune` |
| light | `SUN` `LAM0` `SUNC` `SKYC` `QWARM` `tiltOf` `qTilt` `luminance` |
| colour | `lerpHex` `shade` `skylit` `skylitN` `rgbHex` `HAZE` |
| ramp | `WTQ` `WCQ` `terrainColor` `terrainRGB` |
| field | `class TerrainField` — `elevAt` `maskAt` `elevM` `lam` `tsh` `lamSh` `node` `hazeAt` |
| paint | `paintCell` `drawTerrain` `terrainOrder` |
| surround | `SurroundGrid` `buildSurroundLam` `XBASE_K` `drawSurround` |
| walls | `wallGrad` |

### The hillshade units bug, twice

**The gradient must divide by the cell's own width.** It read
`(elev(i+1) − elev(i−1)) / 2 * ZEX`: metres of rise per *cell*, used as a
slope. One DEM quantum is 300/255 = 1.176 m, so a single step of quantisation
noise was read as a slope of 1.176 × 3.3 = 3.88 : 1 — a 76° face — on ground
whose real slope is 1.25°.

Measured over the 10,763 land cells whose true local slope is under 2 %, the
light difference between vertically adjacent cells ran median 0.000, p95 0.548,
max 0.931 and exceeded 0.05 on **32.4 %** of them. A third of the flat city was
lit differently from the cell next to it. And it had destroyed the hills it
exists for: LAM ran p01 0.000, p05 0.000, **median 0.321**; corrected it runs
0.113 / 0.453 / **0.730** / 0.905.

Then **the same expression lit the surround**, dividing by 1.8 against a cell of
110.01 × 139.15 m — the slope over-read by 61× across and 77× down. Median
Lambert over Marin **0.081** where flat returns 0.730, worse than the city's
pre-fix 0.321 because the cell is twice as wide. And the fallback inverted it:
`XLAM[k] || 0.62` fired on 48.4 % of land cells and drew the darkest half of the
surround *brighter* than a genuinely lit slope.

Both are ported fixed, with the measurement tables in the doc comments.
`buildSurroundLam` covers the whole grid with clamped neighbours — so the border
ring gets a real Lambert and the fallback has nothing left to fire on — and
divides by the distance actually walked, not the nominal two cells.

`XBASE_K = 0.9932` holds the surround's painted value at the shipped number, and
its comment carries the thing worth recording: **the target was measured wrong
the first time.** A probe that dropped the fallback from its own model of the
shipped path made this look like a 5 % correction; with the fallback in it is
0.7 %, because the fallback had been accidentally compensating for the bug.
*The assertion is what caught it.*

### A pixel floor is a step in the derivative

`paintCell` chooses its subdivision **by the colour step, not by the pixel**: a
fixed pixel target subdivides a square mile of Sunset whose four corner colours
are the same number as hard as it subdivides a Twin Peaks hillside, and measured
that way the ground plate cost 160–175 ms at *every* camera. A cell with no
gradient in it gets one fill and is not approximated at all.

Sub-quads **overlap by a third of their own pitch** rather than abutting.
Canvas 2D antialiases every edge it fills, so two quads sharing an edge exactly
composite to `1 − (1−a)² < 1` along it and the seam comes back as a pale
hairline — the artefact the whole pass exists to remove, at a twelfth of the
pitch.

The flat fast path is a real fact about this projection and not an
optimisation: at ROT 315° a cell whose four corners sit at one elevation is an
**exact screen rectangle**, so `fillRect` draws it with no path and no
antialiased edge to seam against.

### Cache keys

`terrainOrder` is cached against the projection's bearing, tilt and ZEX and
**not** against `cam.scale` — the far-to-near order is a function of the
projection alone. *Anything continuous in `cam.scale` inside a cache key
invalidates the buffer mid-gesture.*

`wallGrad`'s cache hangs off the **context**, not the module, because the suite
times a draw into a canvas of its own and a gradient belongs to the context that
made it. `createLinearGradient` per face at block zoom put the city draw from
60.3 ms to 74.0.

### Ported with a deliberate difference

- `terrainColor()` (quantised, string-returning) and `terrainRGB()`
  (continuous, float) both ship. The first is kept **byte-for-byte** because
  `gen/functional.py` Q3 measures that function; the second is what the plate
  actually paints through. Likewise `skylit()` is untouched and `skylitN()` is
  the same model without the cache's tilt-to-a-twelfth quantisation.
- The mock's `LOOK`/`QF`/`WA`/`RS` were `window` globals with `Object.assign`
  overrides and an `apply()` that reached into six caches by name. Here they are
  plain exported objects; the cache-drop is `TerrainField.invalidateNodes()` and
  the module-local key bumps. The **values** are unchanged.

### What could not be ported

**The surround grid is not in the P1 catalogue.** `manifest.json` ships thirteen
chunk kinds and none of them is `gen_context.py`'s output (US Census TIGERweb
hydrography and county coverage, USGS 3DEP elevation — both federal works, both
public domain). So `drawSurround` takes a `SurroundGrid` interface and, given
none, **paints nothing and returns 0**. Nothing here fabricates a backdrop. The
same gap propagates into `water.ts`: the shoal band and both plates are laid on
that grid.

---

## 2. `water.ts`

### The module

| | |
|---|---|
| palette | `BAY_OPEN` `BAY_SHOAL` `SHOAL_REACH` `SHOAL_A0` |
| shoreline | `Ring` `decodeCoast` `inPoly` `coastRings` `coastBand` `wedgeCovered` `drawShoreUnderfill` `drawShoreline` |
| shoal | `buildShoal` `buildShoalHoles` `shoalCellAlpha` `shoalNodeAlpha` `resampleC1` `shoalSamples` |
| bay | `bayPlate` `BAY_SS` |
| depth | `WaterMeta` `depthM` `assertRefinement` `depthRamp` `depthColour` |
| blit | `blitGridPlate` `drawWater` |

### Three surfaces, three different guarantees

They are kept apart on purpose, because two of them look like the third:

- **the depth plate is PUBLISHED** — NOAA bathymetry, 846,819 water nodes,
  deepest 114.05 m (the Golden Gate scour hole), on a 4× refinement of the
  surround grid. `assertRefinement` **refuses at load** if
  `nw !== XW*mul + 1`, which is the reason level 0 can be called lossless with
  respect to the published coarse grid: every `mul`-th node *is* one of its
  nodes.
- **the shoal band is a DECLARED TREATMENT** — a BFS distance from the surround
  raster's own land bit. Block W never claimed it was depth, and `detail/`
  measured exactly how far from one it is:
  `corr(distance-from-shore, log depth) = 0.303`, **r² = 0.092**. Distance from
  the shore explains nine per cent of the bay's depth.
- **the shoreline is PUBLISHED** — DataSF txuc-3kzm, simplified to 45 m.

The depth ramp's *stops* are the published distribution's own quantiles
(0 / 9.93 / 27.47 / 114.05 m); its spread and its deep tail are declared. **The
level is not a choice at all**: the ramp is re-centred so the area-weighted mean
colour of the water is the value Block W set for the open bay — the variation
changes, not the level.

### The shoreline was stroked over the wrong fill

`C.coast` was already drawn as ink over the DEM's staircase; what was missing is
that **the fill never agreed with the line**. So the fill is made to agree,
inside a corridor: the land side is laid in before the cells (covering where the
raster falls short) and the water side is repainted after them (cutting where it
runs past). Bounded on purpose — a global clip to the coast rings was measured
to exclude **17.6 %** of the DEM's own land cells, where the ring is a boundary
and not a beach.

The corridor is asymmetric — `SHORE_IN = 130`, `SHORE_OUT = 1100` m — because
the land side only has to cover one 77 m cell and the water side has to cover
the whole pier field.

And the under-fill was itself painting into open water: the published ring wraps
the pier field, where the raster has no land at all, so two large fills were
fighting over the same pixels. Clipping it to the land side of the same corridor
took the painted area at the waterfront camera from **719,037 to 80,860 px,
−88.8 %** (Q5).

### Every convex vertex leaves an uncovered wedge

The corridor is one quad per segment, offset along **that segment's own
normal**. Where the coast turns, two quads sharing a vertex are offset in two
different directions and splay apart on the outside of the turn, leaving a pie
wedge of radius `SHORE_OUT` that no quad covers. The even-odd repaint is clipped
to that path, so the cream staircase the treatment exists to remove *survives
inside the wedge*.

Measured with `coastBand`'s own `wet` test: **425 segments, 392 with a wet side,
368 shared vertices, 164 of them open a gap.** Median turn 69.9°, p90 166.9°. At
`SHORE_OUT = 1100 m` the median wedge is 738,065 m² — 860 m on a side.

**The fix is a cap, not a corner fan.** Each quad is extended by `outM` **along
its own direction** at each end, so consecutive quads overlap and the overlap
covers the whole wedge for any turn up to 180°: a point in the wedge at angle A
sits at `−t·sin(A)` along the segment, inside `[−outM, 0]` for every `t ≤ outM`.
No extra vertices, no arcs, **no change to the number of subpaths**, and the
added area runs along the coast rather than away from it. The cap is applied
only toward a neighbour that is also in the corridor — otherwise a 1,100 m
overrun past the last wet segment draws a blue seam along the San Mateo county
line the `wet` test exists to prevent.

`wedgeCovered()` isolates that arithmetic so it can be asserted without a
canvas, and the suite keeps Q4's sentence.

### The bay plate's cache key is continuous in `cam.scale`, and that is correct

Stated because it looks exactly like the bug it is not. `bayPlate` is **not a
layer cache** — its content is a function of the camera, so a quantised key
would hand back a plate drawn for a different camera. What the finding forbids
is a continuous scale in the key of a buffer whose *contents do not depend on
it*. The comment says so where the key is built.

The plate is a single radial gradient, and that is a fact about the projection:
`proj` is `D · Rot(ROT)` with `D = [[cA,−cA],[sA,sA]]`, and `Rot` is an
isometry, so a world circle becomes an ellipse whose axes are screen x and
screen y. One transform, one gradient, one fill. Its two radii are `hazeAt`'s
own numbers, so **the water and the land recede on one rule**.

### One `drawImage` instead of 13,409 fills

The shallows were one quad per surround cell at a per-cell `globalAlpha` — a
67 × 49 px tile of slightly different blue over a third of the frame. Every one
of those quads is projected at z = 0, `proj` is linear, so grid → screen is a
plain affine map and the field goes down as one plate. It is *cheaper* than what
it replaces (161.5 → 111.9 ms at whole city) and the alpha is the published
field unchanged.

`resampleC1` is why the plate does not band: the browser's bilinear filter is
C0, so its gradient jumps across every texel boundary — a Mach band every 135 px
through the one part of the frame that is a single smooth surface. Warping the
bilinear parameters through `S(t) = t²(3−2t)` is **exact at every node**, so
nothing the plate says about the published field changes, and it is C1 across
every boundary.

`blitGridPlate` culls to the frame, which cost 40–80 ms to find: an unculled
plate is **51.0 ms at a camera with no water in it** against 11.0. And it asks
for `"low"` smoothing deliberately — `"high"` is a multi-pass resample and this
is a pure upscale; it is the difference between 51 ms and 16 ms at street zoom.

### What could not be ported

The shoal band, the depth plate and the bay's own grid all sit on the surround
raster, which P1 does not ship (§1). `buildShoal`, `buildShoalHoles`,
`shoalCellAlpha`, `shoalNodeAlpha` and `resampleC1` are therefore **pure
functions over a supplied grid** rather than load-time IIFEs, which is how they
are unit-tested here; `drawWater` no-ops each layer whose input is missing, so a
first paint holding only `base/coast` draws a coastline and no bay.

---

## 3. `streets.ts`

### The module

| | |
|---|---|
| projection | `ST_KPROJ` = 0.9306 |
| tiers | `ST_EXT_PX` `ST_SRF_PX` `centrelineFade` `extentW` `surfaceW` `smoothstep` |
| palette | `ST_C_ROAD` `ST_C_RAW` `ST_C_FOOT` `ST_C_KERB` `ST_ALPHA` `ST_W` `ST_CLS_MAX` |
| stairs | `ST_STAIR_BAND_M` `ST_STAIR_TICK_M` |
| data | `StreetCell` `isKerbEdge` `periodOf` `makeSkip` |
| draw | `drawCentrelines` `drawStreetSurface` |

### San Francisco publishes the positive space

The brief for this layer guessed the assessor block rings would be the strongest
lever — the negative space of the network. They are not: `h8n7-e4ns` Right of
Way Polygons is 22,777 polygons of published street area, 22,191 placed,
29.09 km². The set operation is published on both sides and nothing is offset,
buffered or widened:

    roadway = right of way MINUS every closed kerb ring that meets it
    footway = the rest of the right of way

Measured: roadway 21.44 km², footway 7.66 km², 1,961.6 km of drawn kerb. **The
independent check**: the published Sidewalk Widths file (a 2014 AECOM study)
gives a width for 13,811 of 16,174 centrelines; length × width × sides over
those is 8.98 km². Two files, 14 % apart, neither used to build the other. And
ROW 29.09 + assessor blocks 93.04 = 122.1 km² against the City's published land
area of 121.4.

1,806 kerb lines that do not close into a ring are **not used**: an open
polyline cannot cut a polygon without a rule for how to close it, and any such
rule is invented.

### Both tier gates were wrong, and both were found by measuring

- **The extent tier opened at 1 px of published width.** The city's median right
  of way is 1.32 px at whole-city zoom, so 11,917 of them promoted there — the
  exact thing the brief forbids — for **126 ms** of frame. At 2 px the whole
  city draws zero rights of way and costs 2.5 ms, which is the cull loop and
  noise. 2 px is also where the centreline's own fade begins, so the line and
  the area are complementary.
- **The surface tier opened at half a pixel of footway band.** At district zoom
  it built a roadway path and a kerb path for most of the city and laid them
  down at 8 % alpha. At 1 px the district frame went from **+211 ms to +56 ms**.

Both gates are per FEATURE, so promotion is staggered across the frame by the
city's own widths and no frame is a different picture from the one before it.

### The defect the suite caught

The first patched run came back with

    FAIL 26c 1906 is not the 2018 street map — (0, 0)

because every class of centreline had been replaced by its surface at that
zoom. Pulling on it found a worse thing no test was asking about: **534
centrelines have no published right of way** — the park roads, the Great
Highway, Sloat, the freeways, which is exactly what the line exists for. Under a
blanket fade they would have had **neither a line nor a surface**.

So the rule is stated properly: *a centreline loses its line only where a
published right of way has arrived to replace it.* The coverage bitmask is one
point-in-polygon per centreline, its own midpoint against the ROW polygons —
two published files, nothing interpolated. The failing assertions were **not
loosened**; they now count both layers, which makes the year assertion strictly
harder because it is measured over 22,191 rights of way instead of 4,895
centrelines.

### The year is three years

`periodOf` keeps the earliest year of *each* kind of claim, not the earliest
claim of any kind, **because a street the Board ordered graded in 1908, paved in
1917 and curbed in 1921 is three different surfaces and the record dates all
three.** 4,099 centrelines carry at least one dated claim; 1,944 rights of way
are drawn unpaved before the Board orders them paved, and 1,974 without a kerb.

### Declared, not measured

The stairs: a 2.2 m band and a tick every 0.9 m, **an honest global treatment
declared as one** — `aw7j-9354` publishes the RUN of 268 stairs and no width.

Not drawn, and the counts are on the page: **crossings** (`g9zy-srvv`, 9,678
rows — every row is a Point, not the geometry, and 7,082 carry `yr_install` 0);
**traffic circles** and **calming devices** (Points, no published radius);
**lane markings of any kind**.

---

## 4. `trees.ts`

### The module

| | |
|---|---|
| ladder | `VZ_C0` `VZ_C1` `VZ_T0` `VZ_T1` `bandW` `vrnd` |
| crown | `CROWN_LIFT` `BLOB_K` `blobRadius` `BLOB_MIN_M2` `CROWN_M` |
| grid | `TREE_GRID_W` `TREE_CELL_M` `TREE_X0` `TREE_Y0` `TREE_Q` `cellOf` `treeWorld` |
| year | `TREE_YEAR0` `WFLG` |
| sprites | `buildSpriteSheet` `TREE_GREENS` `VSPR_*` |
| draw | `drawVeg` `drawParkRings` `drawWaterBodies` `decodeParks` |

### Zero draw calls is a tier

At `cam.base` a six-metre crown is **0.4 px**, and 195,310 draw calls for 0.4 px
each is the definition of the wrong answer. Below `VZ_C0` the ground is simply
**tinted by the measured canopy fraction over the DEM's own cell** — an argument
to the terrain ramp, which already ran once per cell. The blobs dissolve in over
1.55 → 2.90 and the street trees over 2.90 → 6.00.

`vrnd` is computed from the index rather than shipped, because 195,310 bytes of
noise is not worth the wire, and it is the same xorshift the building dither
uses, so the two dissolves are the same machinery and neither is a shuffle.

### Two constants that are geometry

`CROWN_LIFT = 2.613` — a crown of radius R sits 2R metres up and a metre of
height is `ZEXB = 1.6` against a metre of width `1.2247`, so placing a tree is
one multiply. `BLOB_K = 2/√π = 1.128` — a blob bigger than the equal-area disc,
so a cell whose canopy fills it reads solid and a fringe still reads as a fringe.

### The gate that drops 21,124 cells

**A cell holding a street tree is dropped from the blob layer, because the tree
drawn there *is* the tree that is there.** 923 acres. And a cell under 58.06 m²
(25 ft squared, the same gate again) is dropped because the tint already carries
it.

### Rejected, and it is the rule this whole port runs on

**Sub-cell placement inside a canopy cell** — N lobes on a lattice scaled to the
cell. It would have looked better at the deepest zoom and **every one of those
positions would have been invented.**

### The defect that is carried, not fixed

`TREE_GRID_W = 400` columns of 24 m is 9,600 m; from the vegetation grid's own
origin the city is 14,272 m wide, so 595 columns are needed. **`gi` reaches 594,
the key aliases, and a tree at column 450 is written to `(gj+1, column 50)`.**

Not an inference: column 0 is open Pacific about 800 m west of Ocean Beach and
it holds 192 tree cells; `gi` saturates at exactly 399 in both arrays; the
cells-per-column histogram is flat at ~180 across all 400 columns with no taper
at either edge, which a real city does not do. **No tree is drawn east of
x = 2,376 m**, roughly Van Ness.

The true column is **not recoverable** — the modulo destroyed it. So the trees
are placed where the mock's own draw code places them, so the render is
unchanged and the defect is not made worse here, and the manifest's `defect`
notes say all of it so nothing downstream can present these positions as fact.
**The fix is one constant in the encoder and a regenerated source file; it
belongs there, not here, because inventing a position here would be inventing
data.**

### The parks

Five hand-typed quads — *"MODELLED: parks / open space, hand-entered from
well-known extents"*, of which **Golden Gate Park was a four-vertex quad** — are
gone, replaced by 247 published Recreation and Parks rings, 328 polygons, 3,214
vertices, 3,504.2 acres.

**The Presidio is not a Recreation and Parks property. It is federal.** It had a
hand-typed quad and now has none. It is green because the canopy layer
*measures* its forest, which is what it actually is — a strictly better claim
than the rectangle it replaces, and worth stating plainly rather than quietly
restoring the quad.

---

## 5. `buildings.ts`

### The module

| | |
|---|---|
| ladder | `LOD_Z0` `LOD_Z1` `tierW` `buildURND` `drawnAsBuilding` |
| coverage | `COVQ` `COV_GAMMA` `COVA` `coverageAlpha` `MASS_GAIN` `COVER_GAIN` |
| gates | `RECT_SCALE` `QUAD_SCALE` `QUAD_PX` `NEAR_PX` `EDGE_SHADE` `STROKE_MIN_PX_A/B` `SHADOW_MIN_PX` `WALL_MIN_PX` |
| ink | `INK` `LOTINK` `LOT_SHADE` `LOT_MIN_BLOCK_PX` `LOT_MIN_GAP_PX` `INK_LO` `INK_HI` `inkFor` |
| colour | `HZL` `FRESH` `FRESH_YEARS` `ARRQ` `NF1` `colourLUT` `massLUT` |
| order | `buildBldOrder` `bucketFloor` |
| massing | `Massing` `massingOf` `isSolo` `massAt` `drawMassing` |
| geometry | `BlockGeometry` `blockRing` `BLOCK_INSET_M` |

### The blob, as a measurement

At the whole-city camera the renderer draws at 0.0682 px per world metre across
and 0.0394 down. **The median building is 1.02 px wide**, and its outline, its
three-tone roof, its wall ramp and its 0.7 px ink stroke are all decided per
building and all land inside one pixel, 166,166 times. The frame is carrying
information at a frequency it cannot hold, and the eye integrates it into grain.
**That is the blob, and it is not fixable by drawing the same thing better.**

The median assessor block is 8.3 × 7.5 px at the same camera. **The block is the
smallest object on this map that a whole-city pixel can resolve.**

### The thresholds are measured, not picked

1.55 and 2.35 are where the median building reaches **1.6 px** and **2.4 px** —
under two pixels an outline and its stroke are one smudge; 2.4 px is the first
width at which a house is separable from the one it shares a party wall with.
Both are `median projected width / cam.base`, and both sit **between** presets,
never on one: *a representation change belongs between two stops, not at one a
reader sits on.*

### The dissolve is a dither

The massing fades on alpha; the buildings arrive by a **per-building stochastic
threshold**, `URND[i] < w`. Three things follow. **Nothing pops** — each
building appears on its own at 1.6–2.4 px, below the size at which an appearance
is an event. **The same buildings are the same buildings** from one
rasterisation to the next, so a blit of an old raster and a fresh one at a
higher `w` differ by *more grain*, not by a different picture. **It is cheaper
than either end** — cost is proportional to `w`.

*The dissolve is sampled, not animated.* A wheel sweep gets three to five values
of `w`, not sixty. The dither makes each step look like more grain rather than a
different picture, which is why that is acceptable — forcing a raster on `w`
would reintroduce exactly the mid-gesture invalidation that made zoom jumpy
before, so it is deliberately not done.

### Coverage is the alpha

A block is painted at an alpha equal to its measured built coverage, because at
8 px a block every pixel is **already** a coverage-weighted average of roof and
of the ground between the roofs, and `cov·roof + (1−cov)·ground` is exactly what
a fill at alpha `cov` over the terrain computes. **The Sunset comes out pale
because it is 46 % built, Chinatown solid because it is 88 %, and the Presidio
disappears into its own hillside because it is 3 % — and nobody made any of
those three decisions.**

The first cut lerped toward an opaque ground tone instead, and the screenshot is
why it is not that: Golden Gate Park, the Presidio and Treasure Island came out
as flat tan slabs laid over the hillshade, because a 3 %-built block still
painted 100 % of its own area.

Two free numbers, both solved against a stated target rather than chosen:
`COV_GAMMA = 0.72` and `MASS_GAIN = 0.85`, each the value at which the mean
luminance of the stage matches the build being replaced over the same 800 × 450
crop — 177.8 → 178.4 and 177.8 → 178.2, with the standard deviation down from
39.4. **The mean is held and what left is the noise, which is the whole claim
this tier makes.** A coverage exponent was rejected for the same reason: it
works on the mean *and* lifts a 3 %-built block to 12 %. On the tone it leaves
an empty block empty.

`COVQ = 10` because **one `fill()` carries one alpha, so the alpha has to be a
batch key.**

### One fill of a thousand subpaths

`NEAR_PX` stays at 9, and the reason inverts an instinct. Under a broken
measurement — the city draw timed into a detached canvas — raising it to 26
looked like an 8× win at block zoom; counting real rAF frames said the frame
rate had gone **down**, and forcing a flush reproduced it: 291.5 ms → 373.2.

> **Moving a building off the near path does not remove its geometry, it moves
> it into a shared `Path2D`, and one `fill()` of a path holding a thousand
> overlapping subpaths costs the rasteriser more than a thousand fills of one
> quad each.**

The JS got cheaper and the frame got slower. And `NEAR_PX = 22` measures 174.4 ms
against 20.1 at 26 and 101.7 at 9 — reproducible to 1 ms, 8× its neighbour over
328 buildings, which is not a cost this code can produce. It looks like a Chrome
canvas fallback. **Unexplained, and the reason the value sits at 9 rather than
anywhere near it.**

### The mark's flush depth

The city draw flushes a landmark when it meets the first building nearer than
the mark's depth, and **inside a bucket the buildings are in Hilbert order, not
depth order.** A mark keyed to its own building's exact depth flushes at
whichever bucket-mate comes first, which may be several buildings *before* the
one it is marking. Measured: City Hall's mark fired at building 6,179 and
something filled `#6f6b61` over it at 6,182 — **139 of its 2,360 pixels
survived.** Keyed to the bucket floor it keeps 54 %, the rest honest occlusion.

Which landmark witnesses it is not typed and used to be: at 315° City Hall's own
building sorts before its mark's flush point (28,424 against 28,449) and
survives either way, proving nothing; Moscone does not (21,562 against 21,557,
0 % against 93 %).

### The arrival cannot be painted twice

**A massing solid is drawn at an alpha equal to its coverage, so painting the
whole city's massing twice composites `cov` twice and lands at `1−(1−cov)²`
instead of `cov`.** The screenshot of that mistake is the 1948 frame with the
entire peninsula gone warm and heavy. Only `massCohort` — the blocks that gained
something *this* year — is repainted, and on those the doubling reads as the
arrival landing a little heavier, which is what an arrival should do.

### Ported with a deliberate difference

- **`CL_ARR` is not ported.** It has exactly two occurrences in the mock — its
  declaration and its allocation — and nothing reads or writes an element. At
  21 × 21 it threw away a 2 MB backing store on every haze-key change; with the
  sixteen materials appended it would have been 6 MB. The record of the decision
  is in the doc comment on `colourLUT`.
- `inkFor` makes the ink gap a **step clamped into [32, 52]** rather than a
  fraction. Over the eight original roof entries a fixed multiply gave 35–49
  luminance steps; over the measured 32-entry aerial palette the same multiply
  gives **19 on the darkest roof and 96 on the lightest**. The assertion *"…and
  they read on a dark roof as well as a pale one, which fixed ink did not"*
  failed correctly, and is why it exists.

---

## 6. `facades.ts`

### The module

| | |
|---|---|
| vocabulary | `FA_TYPES` `FA_ERA_YR` `faEra` `FA_GATES` |
| metres | `FA_HMAX_F` `FA_DOOR_*` `FA_VEH_*` `FA_CORN_*` `FA_SHOP_*` |
| ramps | `FA_RAMP` `faRamp` `FA_MIN_DH_PX` |
| roles | `ROLE_*` `faceTakesOpenings` `faBayOK` |
| decision | `faceWeights` `openingInBand` `storeysOf` |
| batching | `FaceGroups` `newFaceGroups` `faceGroupPath` `faceGroupAlpha` `flushFaces` |
| wall | `drawWallGrade` |

### The one thing that is not published and is drawn anyway

**The roll does not record where a window is.** It counts storeys, rooms, units
and floor area. What is inside a wall here is *a typical facade consistent with
the published storey count, class, era and measured wall — not a survey of that
building* — and the page says so in those words. Every module, opening
proportion and glazed fraction is a convention declared once per (type, era) and
never per building; what is per building is *which* convention it gets, and that
is four published columns.

### The ramp is an alpha, not a gate

The first working version computed the weights and then used them only as on/off
tests — **which is a threshold, a step in the *value*, worse than the pixel
floor the project banned.** Each group is composited at `S(t) = t²(3−2t)`, so a
tier at the bottom of its ramp is a faint tone on the wall and the geometry is
never clamped.

Every ramp is keyed on **the feature's own projected size**, never the camera, so
the change is staggered across the fabric and there is nothing to pop.

### The early-out is exact, not tuned

`dh < 2.0 px`: the opening is capped at 0.80 of its band and `band ≤ dh`, so at
`dh = 2.0` the opening is at most 1.6 px, where the opening ramp is already
zero. **It removes nothing that would have been drawn.**

### No uncounted storey is invented

Height by published storey runs **6.0 / 8.4 / 10.9 / 12.1 m**, increments of
2.4 m, **which is not a floor**, and the relation was measured twice and fitted
neither time. The second published measurement settles it: a 1-storey house
really does hold one floor of floor area and only **10.4 %** hold as much as
1.6. So the six metres a "1-storey" Sunset house measures is not a second
finished floor; it is a level the Assessor does not count as floor area, which
in this city is the garage.

**Putting a garage door on that base would make the Sunset look right and would
be an inference layered on a claim over 66,075 buildings. The base is left as
wall.**

The correction this port keeps from the same argument: **the sill is a fraction
of the band, not a metre offset.** A fixed 0.95 m sill puts a window in the
bottom third of a 6 m band with three metres of blank wall over it — an artefact
of the disagreement, drawn as if it were a fact. The metre *cap* survives; the
metre *offset* does not.

### The join bug a screenshot caught and a green suite did not

The brief asked for a Marina apartment block. **The first after-shot of one was
identical to the before-shot** — not one face on any wall — while the Mission
and the Sunset were full of them.

`mblr[2:9]`, a fixed seven-character slice, **truncates every parcel on an
assessor block with a letter suffix**, and those blocks are the later-platted
parts of the city, the Marina above all. The whole key resolves 96.1 % against
the slice's 89.9 %. The supplement ships as `st2` and the renderer reads `st`
first, so it fills holes and never contests a value the primary stream ships;
the two derivations agree on **9,984 of 9,984**, which is the evidence the fix
recovered published data rather than inventing it.

### No strokes at all

Every feature is a filled path in world metres, so it scales exactly with the
camera and with the backing store and **no DPR or buffer-resolution decision can
change its weight.** That is structural rather than lucky, and it is why the
resolution tier never has to revisit this module.

### The one honest approximation, stated

The weight is held per (group, lambert index) rather than per wall, because at
this bearing a building shows one wall down-screen and at most one more, and two
walls facing different ways take different lambert indices by construction. Where
two do share an index the larger weight wins, **which never draws a feature at
less than the size it earned.**

---

## 7. `roofs.ts`

### The module

| | |
|---|---|
| residual | `RHQ` `RH_LEVELS` `roofHeight` |
| value | `RSHADE` `HEIGHT_BANDS` `bandOfHeight` `roofStep` `roofFineLUT` |
| storeys | `STOREY_MIN_PX` `STOREY_W_PX` `storeyBandPx` `drawsStoreyLines` |
| tray | `DE` `trayW` `insetRing` `drawTray` |
| step | `STEP_GATE_DH_M` `STEP_GATE_A2_M2` `stepFraction` `stepFires` `FSTEP_*` |

### San Francisco's roofs are flat behind parapets

Shown three ways, and the port must not reintroduce a gable.

**The wrong grid.** The nine statistics were taken over the HEIGHT grid, and
height is *height above ground*, so a flat roof over sloping ground has a large
`hgt_std` — reading pitch off it would have measured the hill.

**The tower control.** `std / height` is 0.10–0.15 in every height class,
including the 301 buildings over 40 m, which in San Francisco are flat-roofed
towers without exception. The median tower's first-return standard deviation is
**11.1 m**. Nothing on top of a San Francisco tower is 11 m of roof shape. A
gable on a 25 ft lot at a 5:12 pitch is about **0.46 m** — an order of magnitude
under the contamination.

**The modal bin.** The modal one-centimetre bin is **6 cm** from the median for
the median building. A gable with a 2 m rise would sit of the order of **50 cm**
away. It sits at 6. That is one plane with noise on it.

**And the pictures agree.** The James Flood Building, twelve storeys and
unambiguously flat, carries `stdcm_1st` **175 cm**; Hotaling Stables, a simple
flat block, **94 cm**; the steeply gabled Haas-Lilienthal House, 276 cm. **There
is no cut that separates them.**

*A city of invented gables would be worse than a city of honest boxes.*

### A parapet is not a pitch, and the assertion got stronger

The clause that enforced "no pitched roof" did it with a word list that included
`parapet`. The aerial sheets are what establish the parapet as the **correct**
San Francisco form, so the word comes out and a strictly stronger clause goes
in: **the coping sits AT the published height and the deck sits BELOW it, so no
vertex of any roof stands above the measured top.** Ridge, gable, hip and pitch
stay forbidden.

### Two different guarantees, asserted separately

**The roof is measured from imagery per building; the wall is a function of four
published columns.** That is one assertion split into two on purpose:

- the WALL is a function of (use × year band × storey band) and nothing else —
  no hash, no position, **0 collisions**, 16 distinct walls;
- **the ROOF is the measured aerial pixel, not a derivation — so it varies
  inside a key, which a derived roof could never do**: 157,042 / 157,042, with
  277 of 314 keys carrying a roof that varies within the key.

The second is *stricter* than the assertion it replaces. The old one could only
have been satisfied by a derivation; the new pair can only be satisfied by a
measurement plus an intact wall contract. And the block that made the change
**removed** a hash and a position guess; it added neither.

### The tray replaces a threshold and a pixel floor

The previous edge band switched on in ONE STEP at 26 css px of building width
and then held its width at `Math.max(1.0, …)` — a step in the value and a floor
on the width, **the two patterns behind every float and lurch this project has
had.** `trayW` is `S(t)` on the building's own projected width and **nothing is
clamped: at the bottom of the ramp the inset and the drop go to zero and the
roof is exactly the flat fill it was.**

The parapet's **inner face is drawn on exactly the edges whose outer face is not
visible** — at any bearing the inside of the far parapet faces the camera and
the inside of the near one does not. **That is geometry, not a rule.** The inset
is computed in world metres and projected through the two linear forms, because
**the dimetric squash does not preserve a normal's direction and the rotation
does.**

### The residual, and the byte that is untouched

The shipped stream stores the median as one byte of whole metres, and
neighbouring buildings on a block differ by a median of 0.90 m — so **36.0 % of
neighbour pairs drew at exactly the same height against 0.7 % in the published
data.** The residual ships beside the byte at a 0.25 m quantum, deliberately
coarser than the 1 m the horizontal geometry carries, because **a roof level
finer than the outline under it is precision the record does not have.** The
published byte is untouched, so every assertion and hit test that reads it still
reads it.

### Nothing is placed on a roof

The up-signal is real — `max − median` runs p50 1.12 m and a pure ranging-noise
order statistic would give 0.35 m — and a gate demanding two published moments
agree fires on 6.7 % of the city. **And it does not survive the pictures.** The
declined sheet is full of stairheads and plant enclosures; the fired sheet is
full of bare white membrane and of trees. The moment doing the discriminating is
dominated by the same edge and vegetation contamination — the first-return grid
records a branch over a footprint as a return on that footprint.

So no rooftop object is drawn. Also measured and declined: `variety / cells` (no
separation at all), courtyards (**0.3 % of the city is not a renderer path**),
and a published roof-type or solar dataset, **of which there is none**.

---

## 8. `landmarks.ts`

### The module

| | |
|---|---|
| vocabulary | `PartKind` `HeroProfile` `HeroPart` `Hero` |
| gate | `HERO_MIN_SHRINK` `volumeScale` `ngonScale` |
| emphasis | `WO_T` `WO_EMAX` `WO_R` `emphasis` `emphasisElasticity` `crownFactor` `planScale` `ZR_RING_FRAC` `rooflineOf` |
| detail | `WO_DETAIL` `partVisible` `WO_RIBMAX` |
| accent | `chroma` `accentOf` `accentBlend` |
| family | `HELD_PULL_*` `heldMaterial` |
| geometry | `emitBand` `bandLambert` |
| LOD | `lmLOD` |
| bridge | `GGB` `GGB_TOWER_TOL_M` `drawBridge` |
| material | `heroMaterial` `heroInk` `LM_INK` |

### Nothing here is a sprite, and it is structural

A hero **replaces the prism inside the city draw's own near path**, at that
building's own place in painter's order, under the contact shadow the fabric has
already thrown. So it inherits the year gate, the depth bucket, the aerial fade,
the subject fade, the arrival ramp and the rise animation, **because those are
properties of the call site and not of the drawing.**

The thirteen deleted sprites were judged again and the verdict carried: the
sprite is the better *drawing* — a warm cream body, a big gilt dome, an ink
outline — and it still cannot ship. It is on the wrong projection *permanently*
(authored at 210°; the map is north-up at 315°). It cannot turn. It sits on the
city rather than in it. It carries no year gate and no measured record. **So the
authored geometry wins, and the sprites' art direction wins — the right answer
was never one or the other.** The ink, the accent and the band-per-lambert
shading are that art direction, taken.

### The gate

> **Every generated vertex of every part falls inside the MEASURED footprint,
> and nothing stands above the MEASURED top.**

A part that reaches past the footprint is **shrunk about its own centroid until
it does not — never grown** — and a shrink below 0.80 is an authoring error, not
a correction, and fails the build. **Sutro Tower is the one relaxed gate** and
the reason travels with the building: its ring traces three open steel legs
about 2 m wide, the largest circle that fits inside it anywhere is 8.7 m across
against a 64 m extent, so a vertex test against the ring is a test about a slab
and this is not a slab. Its reference is the ring's own convex hull, derived
from the published geometry and not chosen.

Two conservation rules make the shaped caps honest: volume is conserved with
`1/√(∫s² du)` over the **whole concatenated profile**, and an n-gon's
circumradius is grown by `√(π/((n/2)sin(2π/n)))` — **without which the Ferry
Building's square tower under-reads its own published area by 36 %.**

### A pixel floor is a step in the derivative

The emphasis law is the project's clearest statement of it:

    x = log2( T·H / (top · ZEXB · cam.scale) )
    R = 1.5 · log2(WO_EMAX)
    E = WO_EMAX ^ S(x/R)

`S'` peaks at exactly 1.5, so `R = 1.5·log2(WO_EMAX)` makes
`d log h / d log k = 1 − (log2 WO_EMAX / R)·S'(x/R)` peak at exactly 1 and **the
elasticity lives in [0, 1] and is never negative.** At both ends it is 1 (the
hero scales with the city); at its flattest it is 0 (it holds its size for an
instant); **nowhere is it below 0 — the drawing never grows as the camera pulls
back.**

That is the whole difference from the floor that killed the thirteen sprites and
from the `gszV` floor: **46 m drawn as 89.8 m, releasing at `cam.scale` 0.1087 —
a scale that sits strictly between the whole-city and district presets so a
wheel zoom passes straight through it.** A floor is flat, then abruptly
proportional. `S'` is continuous and zero at both ends, **so there is no release
point to pass through.**

The crown factor is the other half. City Hall's cap is 4 % of its footprint, so
scaling the whole building makes the dome five times bigger *and the block five
times bigger*: a larger white box with the same invisible bump. **Civ VI does
not scale a wonder, it caricatures one.** `F` redistributes rather than adds —
the plan scale is solved so the drawn top is exactly the `E` the law asked for —
and if it simply multiplied the crown the elasticity would pick up a factor
greater than 1 and **the drawing would grow as the camera pulls back, which is
float.** The first cut grew the crown `F` taller and only `√F` wider and turned
the dome into a gold stick.

`rooflineOf` is one mechanical test — **the highest `z1` among the parts whose
ring is at least 0.35 of the largest ring. Nothing is named.** It says the right
thing about the cases that would embarrass it: the Old Mint and the two
windmills come out `zr = top`, i.e. no crown, because a windmill's cap is nearly
as wide as its tower.

### The sign bug that arithmetic could not catch

`WO_DETAIL` was written as `sz /= WO_DETAIL`, **which makes the gate open
later**, so for most of the block's life the dial was *suppressing* ornament
while the arithmetic looked fine. What caught it was a magnified crop in which
City Hall's dome was a featureless olive blob at block zoom.

### Two render bugs only a picture catches

**The gilt birdcage**: Canvas fills a `Path2D` with the nonzero rule, so two
overlapping subpaths of opposite winding cancel and leave a hole — and a solid
of revolution's far faces are wound opposite to its near ones. Emitting the far
face in reverse order fixes it and one fill is still one fill.

**The open terracotta box**: back-face culling is right for a prism and wrong
for a cone — a face that leans back is tilted *up*. And once the far faces were
drawn they came out at four *wall* values, the far ones bright. A band whose
radius shrinks faster than it rises takes the **top two steps** of its own ramp
whichever way it faces.

### The LOD may not read `cam.scale`

The old sprite ladder asked *"is this drawing big enough to be named?"* — a
continuous function of `cam.scale` — and its answer went into the navigation
buffer's content key. **Every floor a sprite crossed while the reader was
zooming threw away a rasterisation of 166,166 buildings: measured at three
forced re-rasterisations of 46–130 ms in 1.8 s of zooming.** `lmLOD` reads the
zoom *step*, which is frozen during a gesture.

### The bridge

Not in the street centreline file (US-101 stops at the toll plaza, northernmost
vertex 37.8113 N); not in DPW's StreetStructures. It is Article 10 landmark
no. 222, a five-vertex ring 1,753 m long, and **a second, independent, federal
file agrees** — 9 of TIGERweb's 11 vertices fall inside the City's ring, and
both files stop at 37.8254 N, the county line, mid-channel, **because that is
where San Francisco stops.** It is drawn **flat**, because no deck height is
published and a plausible-looking one would be the single invented number in the
frame.

**The year is 1937, and the change is deliberate.** The register publishes 1933,
and the two were never in conflict: 1933 is when construction began and 1937 is
when the bridge was completed and opened. *A map that shows where a bridge IS
wants the year it existed.* The block write-up still says 1933; the assertion was
changed and the code is what is current.

And the deck is **not** a position for the corpus's own `golden-gate-bridge`
decision, which carries `g:"none"`: no family colour, no place mark, no subject
ring, no hit target, no drawer, no money.

### The family colour is on the ring, not on the roof

The defect poured the family colour over the whole roof at 40 %, and **the file's
own comment already recorded why that was wrong at 60 %**: *"against 166,166
earth and slate roofs a 60 % #1e45e4 read as a selection swatch rather than as a
roof."* 0.40 is the same mistake at a lower opacity. The roof is a MATERIAL; a
held beat pulls it 0.26 and the walls 0.20, which is a lens on a building rather
than a swatch over one.

### Two honesty rules, and the difference is deliberate

Block LR's: *a drawn shape may be carved out of a measured one and may not be
added on top of it* — on which it declined the clock faces and the lantern.
Block HERO's: *the drawn building must be contained in the measured envelope,
and the measured cap volume is conserved inside it* — under which they are
allowed, because they are inside. **What neither allows, and what nothing here
does, is a drawn shape that makes a landmark taller, wider or somewhere else
than the published files put it.**

---

## 9. `labels.ts`

### The module

| | |
|---|---|
| budget | `HOOD_INK` `PLACE_INK_PER_CLASS` `InkBudget` |
| order | `LABEL_PASSES` `labelOrder` `spineOf` |
| ranks | `LB_SIZE` `LB_WT` `LB_INK` `LOCAL_SHARE_MAX` `ST_LABEL_CLS_MAX` |
| gates | `nameFitsItsStreet` `placeIsBigEnough` `PLACE_MIN_PX` `ringSizesIt` `BLOCK_M` |
| span | `spanOfFootprint` `spanOfRing` |
| type | `NAME_TRACK` `NAME_BOT` `trackedWidth` `trackedText` `nameFitsFrame` |
| collision | `LabelGrid` |
| draw | `placeNames` `streetLabelAngle` `MK_MARK_PX` |

### One rule, written three times

`minLen` gated a street label on 1100 / 420 / 150 m by zoom band. At the three
presets those are **75, 82 and 74 px** of projected street, and a street name at
these sizes measures **70–90 px**. They were one rule:

> **A name is only written where the thing it names is at least as long as the
> name.**

Continuous in zoom instead of stepping at a band boundary, and scaling with the
length of the name rather than treating GEARY BLVD and JUNIPERO SERRA BLVD
alike. Applied to a compact object it is the named-place gate as well.

### The budget is measured, shared, and exact

`HOOD_INK = 0.0304` of the frame is what a name layer was **measured** to cost,
by hooking `fillText` over all ten film shots. The place names take the same
figure split evenly between the two published classes, because nothing in either
register says one deserves more of the frame than the other.

**It is the same NUMBER as the neighbourhood layer's and not the same POOL** —
the layers share one collision grid, so neither can be written over the other,
and the frame carries both. The consequence is on the record rather than hidden:
the two together are about 0.06 of the wide frame, and making it one genuinely
shared pool means putting a budget on the hood pass, which the explorer has
never had. **Left alone deliberately.**

**The budget is exact.** A name is admitted only if its own box fits in what is
left, so the layer cannot overshoot by one label the way a check-then-add cap
does. The first version of the assertion was written against a check-then-add
cap and failed; **the code is exact now, not the test.**

### The pass order was forced twice by a screenshot

**Landmarks first.** With the designated lane after the streets and hoods, SAN
FRANCISCO CITY HALL, PALACE OF FINE ARTS and the FERRY BUILDING all lost their
slot — City Hall to the rotated MARKET ST box — and the budget went to SUNSHINE
SCHOOL, RICHARDSON HALL and EL REY THEATER, which are on the same register, are
small, and stand where nothing else competes. **Collision placement favours the
periphery, so the order has to carry the priority.** The priority is
specificity: a reader can find Market Street by looking at the picture and
cannot find City Hall.

**Named places at their own street rank.** Placed ahead of all the streets, the
pier names took THE EMBARCADERO off its own waterfront.

### `LB_ORDER` was computed at load and read by nothing

It sorts every street label by class and then by measured length, and the LOD
write-up says the budget is spent in that order. **It was not.** The loop ran in
file order, and `LB_ORDER` had one occurrence in the whole tree — its own
definition. The symptom was the downtown block frame: ANNIE ST, STEVENSON ST,
NATOMA ST and MINNA ST lettered identically to MONTGOMERY ST and THE
EMBARCADERO, with about thirty names competing and none winning. **An alley
reached the collision grid before the arterial it runs behind, took the space
and took the slot.**

The other half of the same defect: **every label was set identically.** Three
ranks now, about 30 % apart in size and better than 40 % in value.

### Tracking is geometry, not a character

The surround names were tracked out by joining letters with U+2009 THIN SPACE,
**which made the width of every label a property of whichever font happened to
be resolved when the layer was painted.** Measured: U+2009 advances 2.0 px in
JetBrains Mono and 6.0 px in the fallback — "MARIN COUNTY" comes out 116 px in
one and 204 px in the other, **76 % wider**. The two ground buffers are baked
independently, so they could hold different metrics and the cross-fade turned
them into a doubled, illegible label. That is what ALCATRAZ, ANGEL ISLAND and
MARIN COUNTY were doing in the whole-city shot.

The letters are advanced by a fraction of the type size and **no spacing
character is involved**. Halos are drawn for the whole string first and the ink
second, because **one letter's halo laid over the previous letter's ink is
exactly what makes tracked-out type look chewed**.

And the frame margin is **the name's own half-width**: `trackedText` centres on
x, so a 40 px constant is a margin for a name 80 px wide, and SAN MATEO COUNTY
tracks out to 151 px.

### The ladder descends, and the count is not the test

The count is roughly flat across the three cameras **because the budget binds at
all three**; what changes is *which* places are named. Median span 180 m at
whole city and 94 m at block zoom, with **12 of the 13** block-frame names never
written on the wide one. The first version asserted the count *rises* with zoom,
which is false, and was replaced by what is true and means more.

### One published gate on the ring

That register's own metadata says its areas *"represent parcel boundaries **or
streets** listed in Article 10"* — **the polygon is the listing, not the
object.** A ring wider than one San Francisco block has located a landmark and
has not sized it: 233,162 m² is City College's campus, not the mural on its
wall. Recreation and Parks rings are not gated, because there the polygon *is*
the park.

### And a data-derived spine, deliberately

Market Street is on the wide shot because it is the longest rank-0 stretch, not
because it is named in a list. **There is no list of important streets here and
there must never be one** — the same rule that keeps ITALIAN AMERICAN BANK and
HIGH SCHOOL OF COMMERCE in the designated lane: they are the largest measured
designated landmarks in the city and the order is the file's.

---

## 10. The suite

    npx vitest run src/lib/city/draw.test.ts     80 specs

Everything that can be decided without a canvas is decided here: the tier
arithmetic, the coverage alpha, the ink budget, the ramp continuity, the corner
cap, the hillshade units, the emphasis law, the counting sort's bucket floor.

Where `gen/functional.py` states a property **its sentence is kept word for
word**, so a failure still reads like the note someone wrote when they found the
bug. The `it(...)` titles are that text.

### The nine that failed first, and all nine were the test's fault

Which is the pattern this project keeps recording — *the instrument is the first
suspect when a number surprises you.* Written down because the corrections are
each a small finding:

| what failed | why, and what replaced it |
|---|---|
| *a flat cell returns exactly SUN[2]* | the field is a `Float32Array`, as it is in the mock, so "exactly" is exactly at the storage's own precision. Now `toBe(Math.fround(0.73))`. |
| *the ground ramp is continuous* | one hand-picked elevation step landed inside a locally flat stretch of the ramp's red channel. Now the property: over the whole range, count the sub-quantum steps the quantised ramp cannot see and the continuous one can. |
| *the shallows are one interpolated plate* | asserted that the smoothed field has no step of 1 — false of a genuine slope-1 ramp. The claim is that the alpha is continuous where the *distance* is not, so it now asserts the field is non-integer, differs from the BFS, and never moves a cell past its neighbours' range. |
| *the bay's floor is on the page's own lattice* | the arguments given (416 × 280) are exactly the refinement, so it did not throw. Now it asserts both directions: 416 × 280 passes, 417 × 280 is refused. |
| *the line and the area are complementary* | they are sequential, not summing to 1: the line fades over 1→2 px and the area arrives over 2→4 px, meeting at a single point where both are 0. The load-bearing half is *never both*, so it asserts `line × area === 0` at every scale and names the measure-zero coincidence. |
| *a blob circumscribes its cell* | 2/√π gives 15.28 m on a 24 m cell and circumscribing needs 16.97. It asserts what is true — bigger than the equal-area disc, monotone in the published area — rather than the doc's rounder phrasing. |
| *no release point* | a *linear* sweep over a 40× range packs its samples at the wide end and measures its own spacing. Replaced with the definitive test: **a jump does not shrink when the sampling is refined and a continuous derivative's worst step does** — 4× the samples, more than 3× smaller. |
| *the n-gon correction* | 72-gon needs 1.000635, which is not "close to 1" at 3 decimals. Now an explicit bound. |
| *the un-designated lane turns away most* | the "59 of 904" is a property of the published register, which a unit suite does not load. It now asserts the gate's shape — monotone in the published span, threshold where the type is — and says so. |

### What is not asserted here

**No pixel is asserted.** vitest runs in Node, there is no canvas, and the rule
is no new dependencies — so `paintCell`'s output is checked through a recording
stub (does a flat cell take the `fillRect` path and issue exactly one fill?)
rather than by reading back a colour. Everything that needs a real rasteriser —
the silhouette differencing, the seam measurement, the ink measured by hooking
`fillText`, the emphasis measured in pixels off the frame — is **P6's job in
Playwright**, and those are the assertions that count. The comments name them
where they belong.

---

## 11. What could not be ported faithfully, and why

**The surround raster is not in the P1 catalogue.** `manifest.json` ships
thirteen chunk kinds and none is `gen_context.py`'s output. Everything that
stands on that grid — the surround's own painted relief, the shoal band, the
placement affine both plates are laid under — is written against a
`SurroundGrid` interface and **paints nothing when none is supplied.** This is
the largest gap in P3 and it is a data-layer gap, not a renderer one.

**The bathymetry's own colour build is a model, not a transcription.** The
published quantiles and the direction are carried exactly and the level is
pinned to the value the open bay was already at; the ramp's spread and its deep
tail are *declared*, as they are in the source, and `depthRamp`'s two
intermediate colours are this port's reading of "one whole step per quantile
interval". The stops, the quantiser and the refinement guard are exact.

**The eleven authored heroes are a schema, not a shipped table.**
`hero-data.js` is 42 KB of authored parts that P1 did not encode, so
`landmarks.ts` ports the *law* — the gate, the two conservation rules, the
emphasis arithmetic, the roofline test, the accent derivation, the two winding
fixes — and types the record the parts must carry (`an`, `ys`, `ms`, `dr`, the
convex-hull flag). Nothing here fabricates a hero.

**The film's own hooks are stubs by design.** `makeSkip` and the street-surface
skip ship empty, exactly as they do in the mock: *nothing here decides
anything.* Dating the Bay Bridge's alignment out of the 2025 right-of-way file
is the film's call and P5 owns it.

**`drawMassing` batches on the roof index and the coverage step only.** The
mock's wall buckets are wired to a per-block wall index this port does not yet
have a source for at the massing tier; the parameter is accepted and unused, and
the roof solid — which is what carries the coverage alpha, and therefore the
whole claim of the tier — is complete.

**Two numbers in the source record disagree and both are carried where they
belong.** City Hall's footprint is 11,177 m² in one write-up and 11,251 m² in
two others; the Golden Gate's year is 1933 in the block write-up and 1937 in the
assertion. For the year **the code is current and the doc is stale**, and that
is stated at the constant. The footprint disagreement is not load-bearing in any
module here and is flagged rather than resolved.

**One dead allocation is deliberately not ported**, with its record: `CL_ARR`.
See §5.

---

## 12. Files

    website/src/lib/city/terrain.ts     the DEM, the hillshade, the aerial fade, the Frame
    website/src/lib/city/water.ts       the bay, the shoal band, the depth plate, the shore
    website/src/lib/city/streets.ts     right-of-way surface, carriageway, kerb, footway
    website/src/lib/city/trees.ts       195,310 street trees, the canopy, the parks
    website/src/lib/city/buildings.ts   massing, footprints, the LOD ladder and its dissolve
    website/src/lib/city/facades.ts     openings, storey rhythm, entrances, cornices, shopfronts
    website/src/lib/city/roofs.ts       the coping, the dropped deck, the second step
    website/src/lib/city/landmarks.ts   the heroes, the shaped caps, the emphasis law, the bridge
    website/src/lib/city/labels.ts      streets, named places and hoods sharing one ink budget
    website/src/lib/city/draw.test.ts   80 specs
