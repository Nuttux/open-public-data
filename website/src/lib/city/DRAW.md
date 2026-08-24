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

### The paper, and it was never rejected

`paintGrain` is here now, and its history is worth keeping because a later
write-up got it backwards and recorded the treatment as having been turned
down. It was not. It was **measured at 11 ms per ground rasterisation and
deliberately kept**, because it suits the register.

One 96 x 96 tile of deterministic value noise, seeded 19,060,418, carrying
**both signs of its own alpha** — a warm dark tooth and a warm light one — so
one `source-over` fill does what a two-way `overlay` blend was doing. The tooth
is in SCREEN space and does not move with the camera, which is correct: *the
paper does not pan.* `GRAIN_LV` is the level table; the shipped level is 1, a
pattern scale of 2 at alpha 0.030, and the scale of 2 is there because at DPR 2
a one-device-pixel grain is not a tooth, it is mush.

It is painted at the END of the ground rasterisation and therefore inside the
plate below, which is where the reference puts it and for the reference's own
reason: there is one ground render and every caller gets the same one.

**And it does NOT show up as a parity gain, which is worth stating plainly.**
Ablated with `LOOK.grain`, one page load, two frames seconds apart:

```
              whole city (A4)              district (B3)
  grain on     83.55 %                      91.06 %
  grain off    83.43 %                      91.11 %
```

Nothing, either way, inside the noise. The reasoning that put it on the parity
list — *it touches 100 % of the frame at low magnitude, which is the faint band
that dominates every whole-city row* — is an argument about where the
difference LIVES, not a demonstration that adding paper removes it. Matched
noise added to two frames that already differ on four fifths of their pixels
does not pull a thresholded count down; it moves a few thousand pixels across
the 12/255 line in both directions. The paper earns its place on the register,
on the source's own record of keeping it, and on costing one fill inside a
cached plate — **not on this metric**, and it should not be sold on this
metric.

### The ground is 57-80 % of every rasterisation, and it does not change

`scratchpad/r2/rastercost.py` times `scene.paint` **itself**, with a
`getImageData` flush INSIDE the timed region — Canvas 2D is deferred and timing
the call alone measures JS only, which has fooled four agents on this project —
and forces a full re-render for every sample so nothing incremental is
measured. Per layer, through prod's own `?layers=` switch, 1200 x 680, DPR 2,
median of 7-19 samples:

| camera | all | `-surround` | `-terrain` | the ground | share |
|---|---:|---:|---:|---:|---:|
| A4 whole city | 404 ms | 178 ms | 308 ms | **322 ms** | **80 %** |
| B3 district | 459 ms | 447 ms | 197 ms | **261 ms** | **57 %** |

That is `FILM.md` §6's residual, measured rather than left as a residual. At
district the surround is off-frame and free and the city's own DEM is the whole
of it; at whole city it is the other way round.

So each ground pass keeps a plate, painted at the frame's own size and blitted
1:1. **The blit is exact**: `source-over` is associative, so painting the cells
into a transparent plate and compositing that over the water is pixel for pixel
what painting them straight onto the water does, antialiased edges included —
and the grain over a transparent plate pixel composites premultiplied, so
blitting it lays the tooth over the bay exactly as filling the frame at that
point in the paint order would.

Measured after, same probe, same cameras — a repeat rasterisation at one
camera, which is what a year tick, a tier landing and the settle raster all are:

```
                    before                     after
  A4 whole city     min 396  med 404  max 432   min  84  med  89  max 304   -78 %
  B3 district       min 401  med 459  max 512   min 105  med 190  max 542   -59 %
```

The `max` in each `after` row is the plate's own build and there is one of them
per camera; every sample after it is a blit.

**The key carries the camera, and that is deliberate rather than a shortfall.**
A scale-tolerant plate — paint at camera A, blit at camera B — is exact in
geometry by the same similarity argument the frame buffer itself rests on, but
it is a resample: holding it to 1.3x of its painted scale across the film's
z 3.2 -> 28 move needs about **seven** plates where the buffer currently takes
two to five rasterisations. *It would do more work, not less.* What the key
omits is the year, the tier and the arriving data — which is what forces most
re-rasterisations, and across all of them the ground is identical. A century
scrub at a fixed camera, a hold while a tier lands, and the settle raster after
a move now pay for the ground once.

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

### The level was being chosen, and it is not a choice

The ramp's stops are the published quantiles and its direction is the page's
own `BAY_SHOAL -> BAY_OPEN` step. **The level is not a choice at all**: the
ramp is re-centred so the area-weighted mean colour of the water is the value
Block W set for the open bay. The first cut of this port shipped four
hand-picked stops and did not re-centre. MEASURED over the 53,128 water nodes
of the shipped `base/water0`:

```
  painted   168.6, 195.1, 213.5
  BAY_OPEN  135.0, 166.0, 198.0
  error     +33.6, +29.1, +15.5   of 255
```

The bay was a third of a level too pale over its whole area — parity §6's *"one
pale blue-grey wash"*, low magnitude per pixel and enormous in area, which is
why it does not announce itself. `DEPTH_UM = 0.718468` is that mean in ramp
steps, a measured constant with a stated target the way `XBASE_K` is, and
`depthMeanU()` re-derives it from the shipped chunk so it can be checked rather
than believed. **The check that the arithmetic is right and not merely
self-consistent**: at this spread the second stop comes out `#85a4c5` and the
source records that stop as `#84a4c5` — one level, on a number neither side
copied from the other.

### And the two errors had been cancelling

Re-centring alone made the open Pacific too DARK, by **-53.5, -34.6, -11.5 of
255** against the mock on the district frame. The reason is that the mock hazes
**inside the depth plate**, per node, in world metres, on `hazeAt`'s own
expression — *"the water and the land recede on one rule"* — and this port
builds the plate from the ramp alone. The bay plate underneath does carry the
fade and is covered by the depth plate that does not.

So the un-recentred ramp's +33 had been standing in for a fade of +99 at the
frame's edge, and leaving the near bay pale by the whole of it. **The same
shape as `XBASE_K`'s fallback, and worth recording twice.**

MEASURED with the fade as the only variable, one page load, two frames seconds
apart (`QF.water`, which nothing else reads):

```
              whole city (A4)   gross 80+        district (B3)   clear 32-80
  fade on      83.55 %            223,461         91.06 %         1,454,205
  fade off     89.17 %            433,122         95.21 %         1,584,709
```

**5.6 points of the whole-city frame and 4.2 of the district frame, and it
halves the gross band at whole city.** It is the largest single thing in this
pass.

`drawDepthHaze` puts it back as ONE fill, and that is a fact about the
projection rather than a saving: `proj` is `D · Rot(ROT)` with `Rot` an
isometry, so a world circle is an ellipse whose axes are screen x and screen y;
`hazeAt` is linear in the world radius and flat past its cap, so the ramp is
exactly two stops — 0 at 3,400 m and `WA.hazecap` at `3400 + 15000 · hazecap`,
past which a radial gradient holds its last stop of its own accord. The anchor
is the manifest's `proj.downtown`, taken from whatever the shell last handed
`bayPlate`; **with nothing handed to it the fade is not painted**, because a
coordinate written down here would be an invented one.

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
| tiers | `ST_EXT_PX` `ST_EXT_PX1` `ST_SRF_PX` `ST_SRF_PX1` `centrelineFade` `extentW` `surfaceW` |
| palette | `ST_C_ROAD` `ST_C_RAW` `ST_C_FOOT` `ST_C_MIX` `ST_C_KERB` `ST_ALPHA` `ST_W` `ST_CLS_MAX` |
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

### Parity night, Block U1 — what the port got wrong, read off the mock

At the B3 district camera (Sunset, 2018, step 1, scale 0.13533) the ablation
put this layer at **2,276,203 px, 69.9 % of the frame** — joint-largest on the
board. Six faults, all found by reading `gen/part3.html` §THE STREET IS A
SURFACE next to this file, and every one of them is a number, not a taste:

1. **`fw` is DECIMETRES and this file divided it by 100.** The encoder ships
   `STS["fw"]` unchanged and the mock reads `fw[i]*0.1`. Measured on the
   shipped chunks: raw p50 **30**, against the manifest's own `fw_p50` of
   **3.16 m**. Ten times too narrow shut the tier at three of the four
   presets: the **widest band in the city** (31.8 m) computed 0.14 px at whole
   city, 0.40 at district and 0.99 at block, so **no right of way in the frame
   had a carriageway or a kerb at any of the three**. At the fourth preset that
   one outlier cleared 1 px at 5.92 — and because of (2), one 31.8 m band then
   painted every carriageway in the frame at full alpha. The two faults hid
   each other, which is why the layer looked plausible at street zoom.
2. **One global alpha for the whole frame.** `aExtent`/`aSurface` were the
   MAXIMUM ramp weight over every feature on screen and were then applied to
   all of them. The rule is per feature and the mock quantises it into 16
   buckets × paved × kerbed. Measured at B3: the median right of way projects
   2.63 px, so its own weight is **0.316**, and it was being painted at
   **1.0** — the layer was 3.2× too opaque across the whole frame.
3. **The extent tier was painted `ST_C_FOOT`.** The mock paints it `ST_C_MIX`,
   the area-weighted mix of the two tones it cannot yet resolve — 73.7 %
   roadway, 26.3 % footway, off this file's own km² — and blends toward the
   footway as the surface arrives. #e0d8c8 for #bdb6ab is the pale web over the
   Sunset in the before crop.
4. **Rings were indexed by feature.** `rwN`/`rdN` (rings per feature) were
   ignored and `rwLen[i]`/`rdLen[i]` read as if they were feature vertex
   counts. Measured on the shipped chunks: `rwN` is 2 on 2 features and `rdN`
   is 0 on 108, 2 on 69 and 3 on 3 — and one mismatch desynchronises **every
   feature after it in that cell**, so the roadway path of most cells was
   built from another feature's vertices.
5. **The surface was drawn at sea level.** Every vertex went through
   `proj(x, y, 0.4)` while the mock uses `elevDrawn(x,y)+0.8` at ZEX. At the
   district band ZEX is 2.6, so a 30 m Sunset street was drawn **10.5 px** off
   its own blocks and Mt Davidson's streets **98 px** off theirs.
6. **`evenodd` on an accumulated path.** Every right of way in the frame went
   into one `Path2D` filled `evenodd`; the file publishes segment areas AND
   intersection areas and they overlap at every corner, so each junction
   cancelled itself to a hole. The mock fills nonzero.

Two further differences are honest and stay: the ramps are **linear over their
own octave** (2→4 px of right of way, 1→2 px of footway band) as the mock has
them, not smoothed — the mock's line and area sum to one over that octave and a
smoothstep breaks the sum; and an **unkerbed street is one tone wall to wall**,
because there is no kerb to divide it (`eff = kerbed ? sa : 0`).

### The centreline layer has no data in production

`drawCentrelines` was stroking `rwX/rwY` — which are the right-of-way **ring**,
not a centreline. That draws the far edge of the right of way as a line, which
is a property line and which the mock never draws. The mock's line layer reads
`3psu-pn9h` classes 0-4 out of `geo-data.js`; **no chunk in
`public/data/us/sf/city` carries that geometry.** So the function keeps its
signature and its arithmetic (`centrelineFade`, `ST_W`, `ST_CLS_MAX` are still
the mock's and still tested) and strokes nothing, and the gap is recorded in
§11b rather than filled with the nearest available polygon. It was already
invisible: at every camera that dispatches this layer the fade is 0, because
`scene.streetsResolve` only dispatches once `w_p90` clears 2 px and the fade
reaches 0 at the same crossover.

### Caching, because the mock caches and the budget is a camera move

The mock pre-projects every vertex once per bearing (`buildSurfProj`) and
samples the terrain once at load (`EZ`). Here the equivalent is a `WeakMap`
from the cell's own field object to its plane coordinates, its ring offsets and
its per-feature plane box, keyed on `rotDeg | sA | zex` **and the identity of
the `TerrainField`** — both change under `setRot()` and `setBand()`, and a
plane coordinate carries `z * zex` inside it. 259,699 vertices citywide,
5.1 per right of way and 6.6 per roadway, so the whole city is about 2 MB of
cache and only the cells the camera has asked for are ever built.

### What it moved, and the trap that had to be cleared first

Every frame below was shot with `.parity/capture.py` at the canonical
1200x680 stage, DPR 2, with the **only** change between the two columns being
this file. `mock` is the same frame in both rows.

| camera | mean \|mock-prod\| | differing >= 12 | >= 32 | gross >= 80 |
|---|---|---|---|---|
| B3 district, Sunset 2018 | 35.58 -> **33.94** | 2,580,461 -> **2,554,431** | 1,546,248 -> **1,432,510** | 270,718 -> **244,751** |
| C1 block, downtown 2018 | 42.55 -> **40.80** | 2,652,359 -> **2,619,269** | 1,743,887 -> **1,635,004** | 472,308 -> **443,826** |
| D1 street, downtown 2018 | 42.38 -> **40.60** | 2,519,712 -> **2,460,637** | 1,769,984 -> **1,694,026** | 440,695 -> **420,530** |

Whole-frame `diff.py`: B3 79.29 -> 78.49 %, C1 81.50 -> 80.48 %, D1 77.42 ->
75.61 %. 7.5 % of the district frame changed, 11.0 % of the block frame and
10.5 % of the street frame. The layer's own ablation share at B3 —
`ABL_LAYERS=streets`, the pixels that move when the layer is removed,
intersected with the mock difference — went **158,030 px (4.86 % of frame) ->
93,972 px (2.89 %)**.

**4.86 %, not the 69.9 % on the board.** `ablate.py` does not assert the stage
at the shutter and `capture.py` does — so when a dev-server recompile restores
the host to the viewport, `abl-…-nostreets` comes out 3240x1436 against a
2400x1356 `full`, the attribution crops to the overlap, and a whole-frame
misalignment is filed as the layer. **This happened here on the first AFTER
run** — the layer read as "owning" 90.8 % of the frame — and the re-run with
both frames at 2400x1356 gave 2.89 %. The 23:07 run that produced the 69.9 %
headline is consistent with the same fault: its `nostreets` frame was 9.78 MB
against a 6.77 MB `full`, which is the size ratio of 3240x1436 to 2400x1356 and
not of two frames differing by a street network. **Compare the two frames'
sizes before believing anything `ablate.py` says.**

### The one surviving budget: no visible hitch during a camera move

`measure()` — the renderer's own rAF probe, not a detached-canvas timing —
driving a real pan at 1620x1080 DPR 2, forcing a full re-render every tick:

```
                     settled      panning
  before            122.5 fps      5.2 fps      district
  after             121.7 fps      2.7 fps      district
  after, ?layers=-streets          2.8 fps      district
```

The third row is the point: **with this layer removed entirely the panning
frame is the same 2.8 fps**, so the street surface is not what the pan is
paying for and the before/after gap is run-to-run variance on a dev server
three other agents are recompiling. At block zoom the after run measured 4.0
fps against 3.6 with the layer ablated, which is the same statement from the
other side of the noise.

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

### The canopy is the same kind of object as a street tree

This layer was one `Path2D` of flat ellipses filled once at `globalAlpha 0.5`
in a single green. `part3.html` §`drawVeg` draws **the sprite sheet's own two
canopy masses**, one blit a cell, far to near, with the ground shadow the sheet
already carries — and `buildSpriteSheet` has been building those two sprites
all along (`isCanopy`, indices 8 and 9) with nothing asking for them.

The difference is the whole of the district band. `VZ_T0` = 2.90 is **exactly**
the district preset, so `bandW(2.9, 2.9, 6.0)` is 0 and there are no street
trees in that frame at all: every crown a reader sees over the Sunset and
inside Golden Gate Park at 2.9x is a canopy cell. Drawn as one flat fill they
are a green mass with a dot texture; drawn as the reference draws them they are
crowns with shadows and the meadows read as meadows. Parity §7's *"counted at
band 1 but barely drawn"* is this, and the parity note is right that the gap is
at 2.9x and not at 44.9x.

The two gates are the reference's own and they are different gates: **58.06 m2
is on the PUBLISHED area** (the tint already carries a cell that small) and
**`rp < 0.9` is on the DRAWN radius**, which is what stops a blit that cannot
resolve. Far to near is *descending* `cellKey`, because `cellKey = row·gw + col`
and at ROT 315 `depth()` reduces to world y, so a descending row IS painter
order and no sort is needed.

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

### The register was wrong, and the count was a symptom of it

Parity §4: prod placed 11-14 names in every frame, at every band, in one
monospace at one size behind one heavy halo, and marked a landmark with a small
grey dot. It read as *a debug overlay laid on a drawing*.

Three things were one thing.

- **The face.** `ui-sans-serif,system-ui,sans-serif`, which is what the source
  sets. The place names are a THIRD treatment, distinct from both layers they
  share the frame with: the streets are rotated sans in capitals, the
  neighbourhoods tracked serif in capitals, and **a place keeps the
  capitalisation the register published**, because these are proper names and
  the file chose it.
- **The count, which was a consequence of the face.** A monospace advances at
  0.6 em on every glyph, so `San Francisco Zoo` measures about 130 px where a
  proportional sans at the same size measures about 85. The ink budget is
  exact, so a third more width is a third fewer names for the same picture.
  The budget did not need raising; the type needed setting.
- **The mark is a diamond, not a disc.** On this map a coloured disc means *a
  decision happened here* and none of these are decisions. A pip in the ink the
  map's own labels are set in, with a paper halo, the same size at every zoom —
  and the name sits BESIDE it, left-aligned at `MK_LEAD`, rather than centred
  above it. That is what lets a nine-pixel building be named: a map prints COIT
  TOWER beside a symbol, not at the size of the tower.

The type size is a ladder off the band, 10 / 10.5 / 11 px, and `bandOfScale`
reads it off the camera's own `z = scale / base` where no `step` is carried,
because a `Frame` may come from the film (which sets one) or from a gesture
(which does not).

### And the surround's seven names were written and never called

`base/surround` ships `MARIN COUNTY`, `THE EAST BAY`, `ALCATRAZ`,
`ANGEL ISLAND`, `SAN MATEO COUNTY`, `PACIFIC OCEAN` and
`SAN FRANCISCO BAY` with a world position each; `data.ts` decodes them into
`SurroundData.labels`; the shell hands `drawSurround` a spread of that record,
so **they were already arriving at the draw**; and `trackedText`,
`trackedWidth`, `NAME_TRACK`, `NAME_BOT` and the half-width frame margin — all
of §9's tracked-type machinery, with the whole U+2009 finding attached — exist
for exactly these seven names and had **no caller**. The same defect this file
already records against `LB_ORDER`, in the same file, found the same way.

They are drawn now, from the end of `drawSurround`, which is where the
reference draws them: `part3.html` calls `drawPlaceNames` from inside
`drawTerrain`, after the surround's own coastline and before the paper. That
is also why the tracked-type primitives moved DOWN into `terrain.ts` and are
re-exported here — a module may only import from stages before it in the paint
order, and the stage that uses them first is the ground.

**What is still not here, and it is a data path and not a treatment**: the
district capitals (PRESIDIO, OUTER RICHMOND, WEST OF TWIN PEAKS) and the
arterials set along their own streets (GEARY BLVD, SLOAT BLVD, 19TH AVE) are
two further layers, on the `blocks` chunk's `hood` column and on the street
label table. `placeNames` is handed the marks register and nothing else, so
neither can be drawn from here. They are most of the "several dozen" the
reference places and most of what still separates the two whole-city frames.

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

---

## 11b. Measured here, owned elsewhere

Four things this pass measured and did not fix, because the code that decides
them is not in these nine files. Each is a number, not an impression.

### The terracotta is one gate, and it is `scene.ts` §304

Parity §9: *"the mock's roofs are grey, white and muted; prod's are a field of
terracotta orange."* MEASURED on the block camera at Nob Hill / Tenderloin —
the crop the parity report names — counting pixels with `R - B > 40` and
`R > G + 8`:

```
                     R - B      terracotta pixels
  mock, upper left   +17.9              11.0 %
  prod, upper left   +34.5              31.7 %
  mock, whole frame  +13.9               7.2 %
  prod, whole frame  +15.4              13.4 %
```

Three times the terracotta in the crop. **The colour arithmetic is not the
cause** — `shade`, `skylit`, `skylitN` and `lerpHex` in `terrain.ts` are
character for character the source's, and were checked against it for this.

The cause is one conditional. The source assigns the measured aerial palette
**unconditionally**, and its own comment says so — *"THE ROOF IS MEASURED —
after the tone loop, so it replaces the legend for every building"*:

```js
if (PAINT_ON && PIDX) for (let i = 0; i < UN; i++) URI[i] = PAINT_C0 + PIDX[i];
```

`scene.ts` §304 gates it:

```ts
if (paintFlag[i]) ri[i] = PAINT_C0 + paintIdx[i];
```

and MEASURED on the shipped chunks, **`paintFlag` is set on 2.7 % of fabric
footprints (763 of 28,475 over 40 chunks) and 1.9 % of the 15,261 solos.** So
97-98 % of San Francisco's roofs are painted out of `UMAT_ROOF` — the sixteen
placeholder materials, four of which are terracotta (`#a8613f`, `#96543a`,
`#ad7451`, `#b47c56`) — where the reference paints 100 % of them out of the
measured 32-entry aerial palette, which is grey and green.

`PAINT_C0` is 24 on both sides, so the index base is right and the gate is the
whole divergence. **The honest repair is a judgement and not a revert**: either
the encoder's `paint` pass under-covers, which is a pipeline gap, or the
renderer wants a published fallback rather than a placeholder material — and
one is already shipped and already decoded, `blocks.bidx`, the block's own
measured roof colour into the same palette, absent on only 361 of 5,404 blocks.

### `base/surround` landed, and §5 of the parity report is closed by it

The parity sweep recorded *"the surround has no relief ... a flat pale-tan
field"*, and this file's §1 recorded the surround grid as not being in the P1
catalogue at all. **Both are now stale.** `base/surround` ships 416 x 280 with
`cellW`/`cellH` = 110.0096 / 139.15 in the manifest, `data.ts` decodes it,
`scene.ts` builds the Lambert and the order per band, and `drawSurround` paints
it: the whole-city frame carries Marin, the East Bay and San Mateo under the
corrected hillshade. It is also **226 ms of the 404 ms whole-city
rasterisation**, which is a second, independent proof that it reaches the
pixels — a layer that paints nothing does not cost that.

### The depth plate's other two halves

`drawDepthHaze` closes the aerial fade. Two things the source's plate carries
that this one still does not, both of which live in the plate BUILDER, which is
`scene.ts` §`ensurePlates`:

- **the bed's own relief** — the same Lambert the surround's land is shaded by,
  on the refined lattice, at a DECLARED exaggeration (`bedex` 18, `bedamp`
  0.70) attenuated over `bedatt` 12 m of depth, because the bay floor is not
  Marin. At the land's own exaggeration the floor's Lambert spread is 0.012 and
  invisible; at 40x the multibeam SURVEY TRACK LINES appear in the shading,
  which is its own reason not to go there;
- **the coastal fill-in** — a land node within two of a water node takes its
  neighbour's colour, because the surround's land is painted at 110 m and this
  field is at 27.5, so without it a hairline of unpainted bay opens along the
  shore. Every pixel of it is painted over by the surround or by the city's own
  cells.

And the `water1` tier — the 4x refinement, 26 chunks, `minZ` 3.0, the 846,819
NOAA nodes — **is not decoded anywhere.** `data.ts` has no reader for it and
`ensurePlates` reads `base/water0` only. Level 0 is lossless with respect to
the published coarse grid and is the right plate for bands 0-2; the refinement
is what the street band wants and it is currently unused bytes on the wire.

### The street layer's three neighbours (Block U1)

**One line in `scene.paintStreets` puts the streets back on the ground.**
`drawStreetSurface` needs the band's `TerrainField` and its caller does not
hand it one, so every right of way was drawn at sea level: at the district band
(ZEX 2.6, scale 0.135) a 30 m Sunset street lands **10.5 px** off its own
blocks and Mt Davidson's streets **98 px** off theirs. The change is

    -    const r = drawStreetSurface(f, cells, { year });
    +    const r = drawStreetSurface(f, cells, { year, terrain: t });

`t` is already the second argument of the `drawCentrelines` call above it.
Until it lands, `streets.ts` uses the field that sibling call was handed one
statement earlier (`bridged`) — same frame, same band, same object — and the
bridge and its comment are deleted the moment `opts.terrain` arrives.

**No chunk carries the street CENTRELINES.** The mock's line layer is
`3psu-pn9h` classes 0-4 out of `geo-data.js`, 4,895 of them, and the pipeline
ships only `h8n7-e4ns` as area. That is why the whole-city frame has no street
network in production at all: `scene.streetsResolve` correctly refuses the
surface below 2 px of published width, and there is nothing else to draw. A
`strt`-tier chunk of centrelines with the shipped `cov` bitmask (already in
`base/street-misc`, keyed to `GST.n`) restores the layer, and `centrelineFade`,
`ST_W` and `ST_CLS_MAX` are already here and already tested.

**`base/street-misc` is decoded by nobody.** It ships the 1,120 published
ISLANDS rings and the 268 published stair runs (`islandLen/islandXY`,
`stairLen/stairXY`, u16 at scale `q` from `(ox, oy)`), and `scene.paintStreets`
passes only the `strt` cells, so neither is drawn. Measured against the mock's
own gates — islands once `3.16 * kp >= 1.5`, stairs once `0.9 * kp > 2.0` —
**the islands are due at the fourth preset** (kp 1.861, so 5.88 >= 1.5) and the
stairs are not: 0.9 * 1.861 = 1.68, under the mock's own 2.0, so no camera this
page can reach draws a stair. Wiring the islands is a `visible("strt-misc")`
away; the stair treatment stays written down and undrawn, which is the honest
state for a 2.2 m band nobody published.

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

---

## 13. Block U2 — the ground, the water, the crowns, the names

**The largest single item on the board was six hex constants that are not in the
source.** Written as the work happened. Camera B3 (district, Sunset, 2018),
1200 x 680 @ DPR 2, `capture.py` + `diff.py`, threshold 12 of 255.

### The measurement, and what it is worth

    baseline 23:37   ocean 84.1 %   GG Park 89.9 %   Sunset 89.8 %   L. Merced 95.9 %   FRAME 90.20 %
    + §13.1/13.2     ocean 70.5     GG Park 90.2     Sunset 89.6     L. Merced 93.9     FRAME 82.11
    + §13.3          ocean 70.5     GG Park 82.6     Sunset 88.3     L. Merced 90.3     FRAME 79.29

The four boxes are fixed pixel rectangles, so the rows are comparable. **The
FRAME column is not mine alone** — `streets.ts`, `scene.ts`, `renderer.ts` and
`facades.ts` were all being edited by other agents across these three captures
and `capture.py`'s own `src=` stamp changed under them, which is exactly what
that stamp exists to say out loud. The box columns are the honest ones: the
ocean box moves only when the water or the haze moves, and the GG Park box
moves only when the ground or the canopy does.

**Two traps cost me a measurement each and both are worth writing down.** The
`out/` directory is SHARED — another agent re-shot B3 between my `diff.py` and
my `cp`, and the crop I then read was a different frame from the number I had
just printed. Capture, diff and copy now happen in ONE shell call. And one
capture in this series (86.37 %) was a frame that had not settled: the same
source hash re-shot four minutes later gave 79.29 %. A stable frame is not a
complete frame — trap 1, again.

### 13.1 The ground ramp's six constants were invented

`WG0 WG1 WPK0 WPK1 WCN0 WCN1` in `terrain.ts` did not come from the reference.
They are not a stale revision of it either: `grep -rn 'd9d3bf'` over the whole
of `scratchpad/sf-city-anim` — six `part3.html` snapshots and the served
`mock-frame.html` — returns nothing. Every snapshot has the same six values and
they are different values.

```
           reference   shipped     error, of 255
  WG0      #f8f0d8     #d9d3bf     -31 -29 -25
  WG1      #dcc79a     #c8bda1     -20 -10  +7
  WPK0     #eef0d8     #b9c79a     -53 -41 -62
  WPK1     #d3d3a8     #9fb283     -52 -33 -37
  WCN0     #c9d79c     #a9bd8c     -32 -26 -16
  WCN1     #7c9455     #7d9a63      +1  +6 +14
```

Confirmed against the RUNNING mock and not only against the file:
`terrainColor(10, 0.73, 0, 0, 0)` returns `#f7eed4` there and returned
`#d9d3be` here. Bare ground was **thirty levels dark and twenty-five cold** —
the Sunset read grey where the reference reads tan — and the park row, the
worst of the six at 41 to 62 levels, turned the reference's pale yellow-green
meadow into a mid sage.

`WFLG.pal` is the reference's own switch, it ships at 1, and it is carried
here as `WPAL` so the other pair is reachable from an ablation rather than
being deleted.

### 13.2 `WA.hazecap` was 0.42 and the reference's is 0.62

`part3.html` L1790, with its own comment — *"and it comes back out at the
shipped number. warmth/haze.py"*. Three readers have to agree on it and at 0.42
two of them did not: `TerrainField.hazeAt`, `drawDepthHaze`, and `bayPlate` —
whose far stop is written `lerpHex(BAY_OPEN, HAZE, 0.62)`, **the literal, from
the reference, sitting beside a cap of 0.42.**

MEASURED on the open Pacific at B3, the far field where the cap binds:

```
              mock         prod         lerpHex(BAY_OPEN, HAZE, k)
  far field   191,200,206  172,188,203  k=.62 -> 197.6,206.3,211.6
                                        k=.42 -> 177.4,193.3,207.2
```

The distance was under-painted by a fifth of the whole fade over everything
more than 3.4 km from downtown — land and water alike, because they recede on
one rule. **The ocean box went 84.1 % to 70.5 % and the frame's
`under_ledger_pct` went 90.1 to 55.9 on this one number.**

### 13.3 The sprite sheet was never ported, only the blit that reads it

§4 recorded that the canopy blit was rebuilt to read *"the sprite sheet's own
two canopy masses"*. It was. **The sheet those two masses come out of is not
the reference's sheet.** `part3.html` L3795-3885 draws every crown in THREE
values — a mid, a lit lobe up-right and a dark lobe down-left, because the
light is upper-right and the crowns have to agree with the walls beside them —
out of a per-family table this port had flattened to one hex:

```
             reference mid / lit / dk       shipped
  broadleaf  #6f8f4e #93ae66 #4d6a37        #5f7a45 flat
  conifer    #4d6f52 #6a8c68 #33503b        #4a6b46 flat
  palm       #7e9a4c #a2b96a #5a7135        #6f8a4e flat
  unclassed  #75904f #96ac68 #53693a        #66804a flat
  canopy 9   #5f7f45 #83a05c #415c30        #5b7742 flat, both masses
  canopy 8   the broadleaf row               #5b7742 flat, both masses
```

Every shipped green was 12 to 16 levels darker than the reference's own mid,
and with the lit lobe gone a crown had no direction at all. Three shapes were
gone with it: the broadleaf's **six overlapping lobes** (it was one ellipse, so
the silhouette was a disc where the reference's is lumpy), the conifer's
three-value cone, and the palm's eight fronds and four lit fronds. So was the
**trunk** — `#5d4a33`, `max(1.6, R*0.13)`.

Two numbers under the shapes:

- **the small crown is `0.76` of the sprite, not `0.66`** (L3819) — 87 % of the
  area the reference gives it;
- **a canopy mass sits `1.30` radii up, not `CROWN_LIFT` = 2.613** (L3868).
  2.613 is the lift of a TREE, whose crown stands two radii of real height over
  its own ground point. A canopy cell is not a tree standing on the ground, it
  is the mass itself, and the reference sits it at half that — *"the same wash,
  no trunk, sitting lower on the ground"*. Every blob in Golden Gate Park was
  floating a full crown-diameter north of the cell it is measured over.

**The Golden Gate Park box went 90.2 % to 82.6 % and Lake Merced 93.9 % to
90.3 %, with the ocean box unchanged at 70.5 % — which is what a
vegetation-only change should do to a box with no vegetation in it.**

---

## 14. Block W1 — the second solid, the third, and the 68 shaped caps

*Written as the work happened.*

### 14.0 The state this block found

`base/caps` had shipped since P4: 68 `bi`, 68 `prof`, and the six-entry profile
table — **which building gets a dome, which gets a spire, and what a dome's
silhouette is.** `data.ts` decoded all of it into `LandmarkTable.caps` and
`capProfiles`. Nothing read either. `roofs.ts` shipped `stepFraction`,
`stepFires`, `STEP_GATE_DH_M`, `STEP_GATE_A2_M2`, `FSTEP_LIFT_PX` and
`FSTEP_W_PX`, all exported, all unread.

The reason was one missing file. `lrStep` sweeps a profile around a solid whose
**top, radius, plan angle and centre come from somewhere else entirely** —
`window.FORM` — and `window.FORM` had never been encoded. So the page carried
every byte of the *shape* and nothing to put it on, and the whole of the
Ferry Building's clock tower, City Hall's drum, Grace Cathedral's spire and the
486 other second solids were absent from a build that could describe them.

**A shape with nothing to shape is not a partial feature, it is a dead one**,
and it stayed dead for four blocks because each of the two halves looked, from
inside its own file, complete.

### 14.1 `base/form` — what is in it and what is not

7,464 bytes, 5,052 gzipped, base tier, `minZ` 0. Two populations in one chunk
because they are one stream to the renderer:

| field | n | what |
|---|---|---|
| `bi` `top` `rad` `ang` `dx` `dy` | 488 | the **second solid** — Block C's step |
| `mbi` `mtop` `mrad` `mang` `mdx` `mdy` `mspire` | 40 | the **third** — `typo/mast.py` |

`top` is decimetres on the building's own datum; `rad` is the octagon's
circumradius in centimetres; `ang` is the footprint's own dominant edge
direction as `u8 × (π/2)/255`; `dx`,`dy` are decimetres from the vertex mean the
client already holds (`BldTable.cx`/`cy`) to the footprint's true **area**
centroid — the two differ, and the octagon belongs at the second.

**`FORM.k` is not shipped.** It is the inset ratio for an alternative outline
that `build_form.py` built, shot against the octagon and rejected: scaling the
footprint's own ring to the derived area draws, on the Ferry Building, *a
26 × 7 m blade at 71 m* — which asserts a **shape** for the tower that nothing
measured. The octagon asserts only the area, which is the quantity that was
actually derived. `k` has no reader anywhere in `part1–4.html`, and shipping a
field whose only use was rejected invites someone to use it.

### 14.2 The third solid, and why it is the same stream

The step model **cannot see a steeple**: a steeple is a handful of 50 cm cells
and fails `MIN_UPPER_M2` by two orders of magnitude. `typo/mast.py` reaches it
through the **published class** of the place under the roof, and the enrichment
is not marginal:

    church      18 of  25   72.0 %      <- 34x the base rate
    safety      13 of  61   21.3 %
    school      22 of 144   15.3 %
    (unclassed)  3,514 of 165,114   2.1 %   <- the base rate

with two guards, each **a different published instrument disagreeing**: the
aerial canopy flag (a LIDAR maximum over an overhanging tree *is* the tree), and
a published footprint within 12 m carrying 85 % of the same maximum (two
footprints that close cannot be told apart by a zonal statistic over either).
40 masts: Grace Cathedral, Mission Dolores, St Patrick's, ten fire stations, ten
schools. `park` and `landmark` are excluded **as classes** and the reasons are
measured — a park building is a restroom under a tree, and an Article 10
designation is a *listing* and not a building.

Its plan is **declared, not measured**: 58.06 m², the step model's own minimum,
on a footprint at least four times that, so the drawn plan is never more than a
quarter of the roof it stands on. The verifier asserts the declared figure does
not vary across the 40 — a spread of 0.0000 m² — because a *declared* number
that varied would be a measurement nobody could name.

**Nothing new draws it.** A mast is appended to the second solid's own slot
stream, so it is the same octagon, the same pre-projection, the same painter's
order, the same year gate and the same profile machinery City Hall's drum
already uses. `mspire` — 10 of the 40 — is the only thing that chooses the
spire profile.

### 14.3 The two rules the caps were built under, now asserted

`render/BLOCK-LR.md`'s caps rest on two claims that the manifest makes to a
reader and that **neither the bytes nor the old verifier could check.** Both are
now in `verify_city_chunks.py` §6d.

**Carved inside.** Every `u ≤ 1` and every `s ≤ 1`, over all six profiles, and
each profile monotone in `u` and spanning `0 → 1`. No ring of a cap is wider
than the measured radius and none is higher than the measured top.

**And the measured volume is KEPT, not merely not-exceeded.** Block C's cylinder
is not an outline, it is a **volume**: `A2 × (T − L)` is exactly the volume the
published mean measures standing above the median plane. Carving a dome out of
that cylinder throws a third of it away and the drawn landmark would *under*-read
the file. So the radius is rescaled by `1/√(∫s²du)` — computed on the **blended**
profile, so the rescale is continuous with the open-out weight and nothing jumps.
Measured, from the shipped bytes:

    prism        0 caps   ∫s²du 1.0000   radius x1.0000
    dome        32 caps   ∫s²du 0.8345   radius x1.0947
    spire        2 caps   ∫s²du 0.3891   radius x1.6031
    campanile   12 caps   ∫s²du 0.7519   radius x1.1533
    crown       21 caps   ∫s²du 0.8392   radius x1.0916
    arcade       1 caps   ∫s²du 0.8604   radius x1.0781

each recovering the cylinder to 1e-12.

**And the widening is not a licence.** Conserving the volume of a solid that
narrows upward means widening its *base* — 9 % on a dome, 60 % on a spire — so
the drawn cap is **not** inside the measured cylinder, and `part3.html` says so
in its own words. What it must still be inside is the **building**: a cap wider
than the roof it stands on would assert a plan the footprint refuses. Measured
over all 68: **worst 42.3 % of its own footprint, median 14.0 %.** That is the
check that replaced an invented ratio bound I wrote first and could not defend.

### 14.4 What re-running the encoder costs, and the trap in it

`encode_city_chunks.py` `rmtree`s `CHUNK_DIRS` and rewrites `manifest.json` from
scratch. **`base/places.qc`, `base/places.json` and the manifest's `places` key
are not its output** — `pipeline/scripts/us_sf_places/emit_places.py` writes them
as a read-modify-write. A plain re-run therefore deletes 2,220 named places and
the chunk entry that finds them, silently, and the page loses its labels with
nothing in any log. Restored here by snapshot and a manifest merge; noted so the
next person re-running the encoder knows to do the same, or to re-run
`emit_places.py` after.

### 13.4 The coastline ink was floating on open water, and climbing the hill

`part3.html` L5456-5474 gates the shoreline stroke on the DEM having land
within one cell of the vertex, and its own comment says why: *"the vector
shoreline resolves piers and slivers the raster cannot, and stroking those
draws INK FLOATING ON EMPTY WATER."* This port stroked every ring closed, with
no gate. On the district frame that is a dark line running down the open
Pacific a kilometre off Ocean Beach.

The second half is geometric. `coastRings` projects at `max(0.4, elevM(x, y))`,
which is right for the FILL — the ring must not sink under the plate it bounds
— and the reference projects the INK at a flat `0.4`. Where the ground behind
the line rises, the ink was lifted `z * ZEX` up the screen and left the shore
it names.

`drawShoreline` now walks the vertices with a pen that LIFTS on a vertex whose
3 x 3 neighbourhood holds no land, so an offshore run leaves a gap instead of a
chord; `maskAt` already folds in the `QF.coast` offshore fix, so the
reference's `maskAt(ii,jj) && !xcfix(ii,jj)` is one call here. Ink
`rgba(10,10,10,.42)`, the reference's, not `rgba(24,22,16,.46)`.

**Ocean box 70.5 % to 70.1 %, and the gross band (>= 80 of 255) over the whole
frame 270,718 px to 242,228** — which is the right shape for removing a hard
dark line from a pale field.

### 13.5 The district capitals: `blocks.hood` has been on the wire all along

§9 left this as *"a data path and not a treatment"*. Half of it is neither.

**The neighbourhoods are shipped and were never drawn.** `base/blocks` carries
a `hood` byte per assessor block and the manifest carries 41 `hoodNames`;
`decodeBlocks` already decodes both into `BlockTable` alongside `cx`, `cy` and
the published `area`. `buildHoodAnchors()` and `drawHoodNames()` are in
`labels.ts` now — the anchor is the **area-weighted centroid of the blocks that
carry the name**, so nothing is typed in and twenty-two small downtown blocks
do not out-vote four large ones; the treatment is `hoods()` at L7131-7165 clause
for clause, including the margin rule that is the label's own half-width.

**The arterials are not shipped and the earlier note was wrong to imply they
were.** The reference sets GEARY BLVD along its centreline out of `G.labels` —
street NAMES with a position, a direction, a length and a class.
`manifest.kinds.strt` ships `fid kind cls cnn w fw yr imp krb rw* rd*` and **no
name field**; the only street text anywhere on the wire is
`strt-misc.stairNames`, 268 stair runs. So `labelOrder`, `spineOf`,
`nameFitsItsStreet`, `LB_SIZE`, `LB_WT`, `LB_INK` and `ST_LABEL_CLS_MAX` are
not merely unwired — **they are waiting on a chunk that does not exist**, and
that is a pipeline item, not a renderer one.

### 13.6 Three things measured here and owned elsewhere

**(a) The hood layer needs three lines in `scene.ts` and I do not own that
file.** `paint()` §8, inside the existing `if (L.labels)` block, after the
`placeNames` call:

```ts
// with the other labels imports
import { buildHoodAnchors, drawHoodNames, type HoodAnchor } from "@/lib/city/labels";
// a field beside `labelGrid`, because the anchors are a function of the
// chunk and not of the camera
private hoodAnchors: HoodAnchor[] | null = null;
// … in paint(), after `const r = placeNames(...)`:
if (this.blocks) {
  if (!this.hoodAnchors) this.hoodAnchors = buildHoodAnchors(this.blocks);
  st.labels += drawHoodNames(f, this.hoodAnchors, this.labelGrid, (x, y) => t.elevM(x, y));
}
```

The collision grid is deliberately the same object the place names just used —
that is §9's *"the same NUMBER and not the same POOL"*, and it is what stops
the two layers writing over each other. On the B3 mock frame this is
**OUTER RICHMOND, GOLDEN GATE PARK, INNER RICHMOND, INNER SUNSET, SUNSET /
PARKSIDE, WEST OF TWIN PEAKS, LAKESHORE and OCEANVIEW / MERCED / INGLESIDE** —
eight names, the largest type in the frame, and prod currently writes none of
them.

**(b) The shoal band is blitted over the depth plate, and the call is in
`scene.ts`.** The reference's `drawTerrain` order is bay -> shoal -> depth, and
it states the reason at the call: the depth goes *"OVER the shore band — which
is untouched, and is a distance from land and says so."* That is §2's hierarchy
as a paint order — the published field ends up on top of the declared one.
`drawWater` had it inverted and is corrected, **and correcting it moved nine
sampled Pacific pixels by zero**, because `paintWaterBed` never passes
`shoal`: `paintShoal` blits it separately at step 3, *after* `drawSurround` and
`drawTerrain`. Moving that blit to sit under the depth is a `scene.ts` change.

**(c) The depth plate is built at the COARSE grid.** `ensurePlates` builds
`XNW x XNH` = 417 x 281 from `base/water0`. Read off the running mock, its own
`depthPlate()` is **1665 x 1121** — `WD_NW/WD_NH`, all 846,819 published nodes
— so prod is blitting every fourth node of a field the reference blits whole,
and `water1`'s 26 chunks are still unread. Both plates agree in the far field
after the fade (mock 190,200,208 against prod 189,200,207 at B3), so this is
not a level error; it is the shelf's own structure, which the mock resolves at
27.5 m and prod at 110.

**What still differs in the water, stated as an open question rather than a
diagnosis.** The mock's near Pacific carries a large, sharply bounded blue mass
— 151,178,204 at its darkest — where prod runs 187 to 197 across the same
ground. It is not the ramp (`um` 0.71803 on the mock against this port's
`DEPTH_UM` 0.718468), not the palette (`BAY_OPEN`/`BAY_SHOAL` are identical),
not the spread or the tail (0.75 / 2.2 on both), and not the shoal band
(reordering it moved nothing). Prod's own plate is DARKER than the mock's at
the matching node — 90,127,177 un-hazed against a mock node whose hazed value
implies about 149 — so the paleness arrives somewhere between the plate and
the frame. **I could not close it and I am not going to guess at it in a
comment.**

### 13.7 What is still open in these four files

- **`BLOB_MIN_M2 = 58.06` is not the reference's.** `drawVeg` gates only on
  `rp < 0.9` and the year hold; there is no published-area floor in it. At B3
  the gate is inert — `rp = 0.9` corresponds to 72.8 m2 at that scale, above
  the floor — so removing it changes nothing at this camera and it is left
  alone rather than changed on an untested camera.
- **The water bodies' trailing stroke.** The reference strokes the LAST body
  drawn, `rgba(28,44,60,.30)` at 0.9 px, deliberately and with its own hazard
  note; this port strokes none. Porting it faithfully means porting the
  dated/undated two-pass split with it, and that split is a call-site change.
- **The park facilities are not on the wire.** The mock's Golden Gate Park
  carries tan diamonds, the polo field and the paths out of `TYP.fac`, a
  published typology with per-facility rings. `manifest.kinds.parks` ships
  `cls len xy waterLen waterXY` and no facility table.

### 13.8 The suite

Four specs on `buildHoodAnchors`, because the anchor is DERIVED and a derived
number has to be asserted rather than looked at: that it weights by the
published area and not by the count of blocks (three blocks of 10 m2 at x = 0
against one of 970 at x = 100 gives 97, not the plain mean of 25); that it
emits one anchor per name any block carries and none for the rest; that the
order is the ground each name describes; and that a `hood` byte with no name
behind it is dropped rather than indexed past the table.

    npx vitest run              311 pass  (307 before, +4)
    npx tsc --noEmit            clean
    npx eslint .                7 warnings in the six product files nobody owns,
                                plus one that appeared in `scene.ts` under another
                                agent's hand while this was running. None in these four.

---

## 15. Block W1 — the Financial District, and four numbers that were not in the source

Daniel, on his own frame at street zoom:

> "things look really chaotic zoomed in and geometry is weird, especially here
> financial district you cant distinguish any building, it seems like the mockup
> did not have this issue."

He is right and the mock does not have it. Shot at the same camera — 2018,
step 3, absolute scale 2.0000, anchored on the Mills Building out of
`base/marks.json` — the difference is not the geometry.

### 15.1 The outline stops being an outline exactly where he was looking

**`part3.html` ramps the roof outline on the building's own projected width and
this port did not.** Above `INK_PX0 = 20` CSS px the line opens from `INK_W0 =
0.7` to `INK_W1 = 1.5` px, and the ink steps through **two darker values of the
same roof** — `EDGE_SHADE*0.82`, then `EDGE_SHADE*0.66` above `INK_PX1 = 72`.
Production drew 0.9 px at one value at every zoom.

Below `INK_PX0` the two are identical, **which is exactly why nobody caught it**:
the whole-city and district frames the harness has been ranking all night are
byte-for-byte the same either way. It only shows at the zoom where a Financial
District tower is a hundred pixels wide — and there, *"the outline is what
separates one house from the one it shares a party wall with"* had nothing left
to say, so twelve towers merged into one slab of pale grey.

**And wiring the ramp alone would have changed nothing**, because of the second
fault under it.

### 15.2 `inkFor` was two different functions from the one it claims to be

```
                                  gap in luminance below the roof
  roof      k = EDGE_SHADE   ×0.82        ×0.66
  #e2d6bb        52            52  → 67     52  → 81
  #b0bec8        52            52  → 67     52  → 81
  #a4977f        52            52  → 68     52  → 81
```

The left column of each pair is what the port returned. **It returned the same
ink for all three values of `k`** — so `inkFor(c, EDGE_SHADE*0.66)` was
`inkFor(c, EDGE_SHADE)` and the ramp would have been connected to a constant.

Two deviations, both from `_inkFor`:

- **the luminance weights.** The source is Rec.601 — `0.299 / 0.587 / 0.114`.
  The port had Rec.709 — `0.2126 / 0.7152 / 0.0722`. A different luminance is a
  different clamp is a different ink on every roof in the city. Rec.709 appears
  nowhere in the scratchpad.
- **the band scale `s = (1-k)/(1-EDGE_SHADE)`, dropped entirely.** `s` is the
  whole reason the darker bands can be darker: at `EDGE_SHADE` it is 1 and the
  clamp is the shipped `[32,52]`; at `EDGE_SHADE*0.66` it is 1.58 and the band
  opens to `[50,82]`. Without it every `k` was clamped back into `[32,52]`.

At `EDGE_SHADE` itself the corrected function returns the shipped value byte for
byte on five of six sampled roofs and one step off on the sixth, so nothing at
the two wide cameras moves.

### 15.3 The locale legend was drawing its noise from the wrong index

`assignBldTones()` reads `URND[i]`, keyed on the **global** footprint index.
`decodeBld`'s `i` is the position inside **this chunk**, so every chunk restarted
the sequence at zero, and the 3.8 % of footprints whose parcel joins no roll row
— the ones the legend exists for — were given a different material from the
reference.

Measured against the running mock, building for building, over the 15,261
footprints of `base/solo`:

    wall material differs on   3,053 of 15,261   20.01 %      before
    wall material differs on     367 of 15,261    2.40 %      after

and the 367 that remain are the **published class wash**, which is a feature
this port has not shipped at all — see §15.5.

### 15.4 `maxR` was typed in, and it is a published quantity

`assignBldTones()` normalises each footprint's distance from downtown by the
**largest such distance in the city**, and a client holding a few chunks cannot
compute that. The port had `maxR: 12000`. Measured over all 166,166 published
centroids it is **11,988.916 m** — 0.09 % out, and a number that exists nowhere
in the source. It is a property of the published footprints, so it now ships on
`manifest.buildings.maxR` and the renderer reads it.

That is the **fourth** case tonight of a constant in production with no source
behind it, after six ground-ramp colours, a haze cap and a street width.

### 15.5 What the roof index difference turned out NOT to be

`URI` differs from the mock on 15,257 of 15,261 buildings, which looks
catastrophic and is not: it is **+13 on every one of them**. The mock pushes 13
published-class colours onto both palettes before the 32 measured aerial
entries, so its `PAINT_C0` is 37 and this port's is 24. Both index the same
measured colour and both draw it. *A shifted index is not a shifted picture, and
the check that says "99.97 % differ" has to be read before it is believed.*

**What IS missing is the class wash itself** — `LRD.cls`, 1,052 footprints a
register names, taking a family colour on roof *and* wall, over the measured
roof, declared as *"a legend, not a claim about roofing material"*. Thirteen
colours and about 5 KB. It is the last material difference between the two
builds and it is the natural next chunk after `base/form`.

### 15.6 The three handovers, landed

**The district capitals.** `blocks.hood` and 41 `hoodNames` have been decoded
since P2 and read by nothing. Wired per §13.6(a) — and then a second thing was
needed. `part3.html`'s label pass is `placeNames(lane 0)` → the arterials →
`hoods()` → the rest of the streets → `placeNames(lane 1)`, and its stated
reason is specificity: *a landmark name names one building, a neighbourhood name
names a district.* Production placed **every** place before the hoods, so the
small lowercase labels standing in the same fields took the boxes and GOLDEN
GATE PARK, INNER SUNSET and WEST OF TWIN PEAKS were not written. The lanes are
split around `drawHoodNames` in `scene.ts`, by class, so each call uses only its
own lane's ink budget. On the Sunset district frame that is SUNSET/PARKSIDE and
GOLDEN GATE PARK written where the mock writes them.

**The shoal.** It was blitted at step 3, after the surround and after the DEM,
so a declared wash sat over a published measurement *and* over the land. The
reference's order is bay → shoal → depth. Note for whoever measures this next:
the previous fix moved the order **inside `drawWater`** and correctly measured
no change, because `paintWaterBed` never passed `shoal` — the blit was somewhere
else entirely. It is now passed through `drawWater`, which has always had the
slot in the right place, and `paintShoal` is gone.

**`drawStreetSurface(f, cells, { year, terrain: t })`.** `t` was in scope one
statement earlier. `streets.ts`'s documented bridge — borrowing the field the
sibling `drawCentrelines` call was handed — deletes itself.

### 15.7 Not done, and named

- **the class wash**, §15.5 — the last material difference, ~5 KB.
- **the street centrelines.** `3psu-pn9h`, 4,895 features, on no chunk. This is
  an encode job in `pipeline/scripts/us_sf_city/` and it is why the wide shot has
  no street network.
- **the depth plate at 417 × 281** against the reference's 1665 × 1121. The
  `water1` tier's 26 chunks are on the wire and unread.
- **INNER SUNSET and WEST OF TWIN PEAKS** still do not place on the district
  frame after the lane split. Two of the mock's four, not four.

## 16. Block B1 — the built city at five zooms, and six more numbers with nothing behind them

Daniel's brief for the night is `website/.parity/FOCUS.md`: **Civilization VI,
not our own mock**, judged at city · district · block · street · building, every
pass. The harness for it is `website/.parity/b1shot.py`, eight cameras under a
`b1-` prefix; it imports `capture.py` rather than re-deriving its traps, and it
sets `capture.HOME` from the mock's own fit — a driver that forgets that puts
prod on (0, 0) and the mock on its fit centre and files 3,730 m of camera drift
as a content difference. That happened on the first sweep and the whole-city row
of `b1-ledger.before.json` is the evidence.

### 16.1 Two exported, documented, unit-tested modules were called by nothing

Not "differently" — **not at all.**

```
  roofs.ts   RSHADE  roofStep  roofFineLUT      §7 "the published value reaches every roof"
  roofs.ts   drawsStoreyLines  STOREY_MIN_PX    §7 "the storey line is a cut-off"
             STOREY_W_PX  storeyBandPx
```

`grep -rn 'drawsStoreyLines\|roofStep\|RSHADE' src` returned `roofs.ts`,
`draw.test.ts` and `DRAW.md` — three files that describe the feature and one
that asserts it, and no draw call anywhere.

**What the value bands were costing.** The roof tone bands are `hgt_mediancm` at
9 / 15 / 25 m, and 121,419 of 166,166 footprints — every house in the Sunset and
the Richmond — fall in band 0. Without the quartile step they take **one flat
tone**; the mock's own measurement at the district camera is 40,119 of 42,462
roofs in frame sharing sixteen tones. `part3.html` L1127 is
`CL_ROOFN[j*4+q] = shade(CL_ROOFF[j], RSHADE[q])`, and `roofFineLUT` already had
that exact shape. It is now built beside `roofLut`, under the same key — a fade
quantised to a 64th, so a zoom is a cache hit on all but a few frames — and
`rsh` is decoded per building off `manifest.buildings.hq`.

**And it is built off the published BYTE, not off `roofHeight()`.** The residual
is ±0.375 m against band-0 quartiles that sit 0.42 m apart, so reading the
corrected height would move the step on every building near a boundary and the
two builds would disagree over a difference nobody could point at. `part3.html`
L1113 reads `UH[i]`; so does this.

**What the storey lines were costing.** On a Financial District wall 130 px tall
the floor lines are the only mark that says how many floors are behind it. Their
absence is a large part of *"you cant distinguish any building"*: twelve towers
of the same tone with nothing on them merge. They do nothing in the Sunset —
0.0 % of pixels, because the roll's median Sunset house is one storey — and the
8.7 % the roll does not count get none rather than a guess.

### 16.2 `glassy` was hardcoded `false`, on the district the complaint was about

`part3.html` L9034 passes `(era >= 4) || (type === OFFICE && era >= 3)` into
`faFlush`, and the opening is then filled at `FA.glassM = 0.735` instead of
`FA.glass = 0.575` — *a curtain wall reflects the sky instead of showing a
room.* Both halves are the published year column in Block WARMTH's own bands.

This port passed `false` at the one call site. Every post-1980 building of any
type and every office from 1950 on — which downtown is made of — was drawn with
punched dark holes 0.215 of the wall's value below where the reference puts
them. `faGlassy()` now states the rule in `facades.ts` and the flush reads it.

### 16.3 Four material values, and the one honest deviation kept

`faFlush` fills seven groups, each at a named value of the wall's own colour.
This port had four of them typed in at other numbers:

```
              mock      port as landed
   glass      0.575     0.52      an opening 10 % darker on every wall in the city
   glassM     0.735     0.74
   litv       1.115     1.12 (sill, reveal) and 1.2 (the glazing bar)
   bayv       1.045     1.04
   shadv      0.795     — the group did not exist at all
   the ground feature   0.62      the mock fills it with `gl`, the SAME value as
                                  the openings above it
```

`0.52`, `0.62` and `1.2` appear nowhere in the source. That is three more
sourceless constants, after the six ground colours, the haze cap, the street
width, the ink ramp, the luminance formula, the chunk-local index and the typed
radius — **ten, and every one has produced something visible.**

The mock has no separate value for a glazing bar: sills, reveals, bars and the
cornice band are one group at `litv`, which means the bar is covered by the
opening filled after it. This port keeps the bar in its own group so it can be
drawn OVER the opening — a deliberate departure, stated here — but at `litv`,
because 1.2 was a number nobody chose.

### 16.4 A window on a sunlit wall and a window on a shaded wall were one colour

`faFlush` reads `W4[WO + lam]` — the wall colour **of the lambert bucket it is
filling**. `flushFaces` was handed one string, `wallF[wallO + 2]`, and used it
for all four buckets. A corner building's two visible walls came out at two
values with identical openings punched in both, which flattens the corner
exactly where the corner is what says the building is a solid. The four values
were already built and already the batch key; the fix passes the table and the
offset.

### 16.5 The bay was filled OVER its own windows, and ramped on the wrong thing

Two things, both against `emitFace`'s own comment.

- `flushFaces` filled `bay` **after** `open`. The comment on the emitter says
  *"THE BAY, UNDER the openings so the openings sit IN it"*, and `faFlush`'s
  order is shadow → bay → lit → ground → opening. Corrected to shadow, bay,
  ground, opening, lit, bar.
- the bay's alpha came from `faRamp(Lm * hs, …)` — **the whole wall's** projected
  width. The bay a house carries is the run of bays the entrance does not take,
  which on a two-bay Sunset front is one of them; `part3.html` L1058 ramps on
  `(b1-b0)/m * wpx`. Ramping on the frontage opens the bay at half the size it
  earned.

And the bay now carries the two marks that make it a projection rather than a
panel — the shaded right cheek and the soffit under it — into the new shadow
group. Without them it is a slightly lighter rectangle and reads as paint.

### 16.6 `FA_CORN_T` was exported in P3 and read by nothing

0.14 m, the depth of the shadow a cornice throws under itself. The cornice was
drawn as a pale band with no shadow beneath it, so it read as a stripe rather
than as a projecting course. `part3.html` L1082.

### 16.7 Refuted here, so nobody sends an agent after it

**The garage door's ramp is NOT wrong.** `FA.ga0/ga1 = 0.55/1.8` keyed on the
door's projected HEIGHT belongs to `part3.html`'s **garage-under-the-entry**
feature, which is gated on a published bit (`FGAR`) this port's `face` chunk
does not carry and which `FA_NO_FITTED_FLOOR_HEIGHT` declines on its own terms.
The mock's `gnd === 3` vehicle opening ramps on `min(w, h)` through `gn0/gn1` —
**exactly what this port already does.** A ramp keyed on height was added here
and removed again on reading the reference properly.

---

## 16. Block B2 — the world the city stands in, at five zooms

*Written as the work happened. Camera set is `.parity/b2shot.py`, five zooms in
one sweep into a PRIVATE `out-b2/` — §13's shared-directory trap, avoided by
construction rather than by remembering. The fifth zoom, BUILDING, is not a
preset in either build: both stop at four, and both set `cam.scale` directly,
so it is reached at an absolute scale of 4.0 the way a reader reaches it.*

### 16.0 Where it started

    camera            diff%    gross 80+   mock mean RGB / prod
    Z7-dist-gg        83.83     283,315    157,164,144 / 174,176,150
    Z3-blk-mission    81.97     469,983    147,146,124 / 160,159,135
    Z2-dist-sunset    76.93     256,856    161,168,153 / 177,180,160
    Z5-bld-civic      76.61     390,218    153,153,148 / 162,161,143
    Z4-str-dtown      74.45     396,206    144,143,133 / 151,149,134
    Z8-dist-embar     67.17     275,665    146,162,172 / 142,158,171
    Z1-city-2018      34.80     138,264    182,190,192 / 188,195,195
    Z6-city-1906      30.53     114,046    187,196,196 / 192,199,198

**Production was brighter than the reference at every one of the eight.** Not
by a constant: +5 at whole city, +16 at district, +13 at block. A single wrong
colour does not do that; something that grows with the amount of *coast* in the
frame does.

### 16.1 The whole shore corridor was written, tested, and called by nobody

`coastBand`, `wedgeCovered`, `drawShoreUnderfill` and `coastRings` have shipped
in `water.ts` since Block P3, with their corner-cap proof (159/159 wedges
covered against 103/159 without), their asymmetry argument (`SHORE_IN = 130`
against `SHORE_OUT = 1100`) and their specs. **`grep -rn 'coastBand' src/`
outside `water.ts` returns `DRAW.md` and nothing else.** Neither half of the
corridor has ever been painted in production.

This is §13.6's open question, and it is not the depth plate. MEASURED by
ablating the reference's own flags at the Sunset district camera, over the six
screen columns the band crosses:

```
                  x=110  x=130  x=160  x=190  x=220  x=240   (CSS, B3)
  as shipped      147    154    159    164    169    176     (R channel)
  DE.water = 0    147    154    159    164    169    176
  DE.bed   = 0    147    154    159    164    169    176
  WA.shoal = 0    149    156    157    165    171    177
  WA.hazecap = 0  147    154    159    164    169    176
```

Nothing moves. The blue mass is none of the depth plate, the seabed relief, the
shallows or the aerial haze — **it is `part3.html` L5432-5449**, after the
city's own cells and before the coastline ink:

```js
if(LOOK.shore&&coastBand(ctx,W,H,40,SHORE_OUT)>0){
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.rect(-2,-2,W+4,H+4);
  for(const ring of C.coast){ ...proj(x,y,max(0.4,elevM(x,y)))... }
  ctx.fillStyle=BAY_OPEN; ctx.fill("evenodd");
  drawShoal(ctx,W,H,15);
  ctx.restore();
}
```

`BAY_OPEN` **opaque**, inside 1,100 m of a published shoreline, with the graded
shallows laid back over it — *"painted in the shoal tone rather than open bay,
because within a few hundred metres of the shore that is what the water already
is"*. Its second job is the one `coastBand`'s own doc-comment is entirely
about: the 53.8 m raster's cream staircase runs several hundred metres past the
published line into the bay, and this fill is what cuts it back out.

`drawShoreCorridor` is that pass, called from `drawShoreline` before the ink,
so the existing call site is unchanged. The `wet` test is the reference's — the
SURROUND raster's own land bit, not the city DEM, because *"a segment with land
on both sides is the San Mateo county line, not a beach, and it gets no
corridor"*. `SurroundGrid.isLand` was on the wire and undeclared; it is in the
interface now, so `scene.ts`'s private `isLandOf()` cast has a type to stand on.

**MEASURED, the same three rows of the Pacific that named the gap:**

```
                          before            after
  B3 row 400, x 300-580   up to  -19    -2 .. +5 of 255
  B3 row 700, x 300-660   up to  -24     0 .. +3
  B3 row1000, x 340-700   up to  -33    -2 .. +3
```

and on the frame:

    Z2-dist-sunset   76.93 % -> 60.52 %   gross 256,856 -> 252,891
    Z8-dist-embar    67.17 % -> 49.07 %   gross 275,665 -> 287,145
    Z1-city-2018     34.80 % -> 28.69 %   gross 138,264 -> 128,108

**And on the GROUND PLATE ALONE** — both builds rendered with buildings, trees,
streets and labels out, prod through its own `?layers=` switch and the mock
driven straight into `drawTerrain`, which is the only comparison in this file
that speaks for these four files and nothing else:

    G2-dist-sunset   40.54 % -> 18.85 %   gross 83,041 -> 6,016
    G3-blk-mission   12.93 % -> 12.68 %   gross 11,247 -> 1,176
    G4-str-dtown      2.04 % ->  2.04 %   gross    628 ->   184

The gross band is the honest column there: a wrong ground colour is a large
low-magnitude area, and 83,041 px at 80+ of 255 is not that. It was a missing
layer.

### 16.2 The layers the corridor needs are borrowed, and the one line that ends it

`scene.paint` hands `drawWater` the shoal plate and the surround grid at step 1
and `drawShoreline(f, t, this.coast)` at step 3 of the same frame. The corridor
is drawn at step 3 by the reference's order and needs both. `streets.ts` already
carries this pattern and names its own one-line exit; this one is

    drawShoreline(f, t, this.coast, { surround: sg, shoal: this.shoalPlate })

in `scene.paint` §3, with `sg = band.surround` already in scope. The fourth
argument is optional and is PREFERRED over the borrowed record, so that edit
lands the same picture and deletes the module state.

### 16.3 `sg.z(i, j) > 0` is not a land test, and Treasure Island proves it

The corridor landed and **painted Treasure Island the colour of the sea.**
Ablated at the Embarcadero district camera: `?layers=-shore` gives the cream
staircase the reference gives, `?layers=` (everything on) gives a pale
blue-white island. The label reads TREASURE ISLAND over open water.

The reference lays the graded band inside the corridor clip **and nothing
else**, because its shoal plate is already transparent over land — `xland(i,j)`
is the whole land test behind the band's BFS. Production's is not:

    scene.ensurePlates:
      buildShoal(XW, XH, (i, j) => sg.z(i, j) > 0 && isLandOf(sg, i, j))

**Treasure Island is made land whose 110 m surround node reads 0 m**, so
`sg.z > 0` fails, the BFS calls the whole island water, and the shallows plate
is opaque across it. Under the city's cells that never showed. Re-blitted over
them by a pass that follows the reference's order, it does.

Two things, and they are different:

- **In these four files**, the corridor's clip is intersected with the even-odd
  water side before either mark is laid, so the published shoreline bounds
  BOTH the fill and the band instead of only the fill. That cannot remove
  anything the reference draws — its plate is already zero on land — and it is
  what makes the island cream again.
- **In `scene.ts`, which I do not own**: `sg.z(i, j) > 0 &&` should come off
  that predicate. A land bit is the land test; an elevation of zero is a
  measurement of flat ground, not evidence of water. Every made-land parcel in
  the city reads 0 on the 110 m grid — Treasure Island, Mission Bay's fill, the
  Marina — and all of them are inside the shallows' BFS as water today.

### 16.4 The hood pass tested the strip's WIDTH against the CANVAS's centre

`camera.strip()` states the geometry in one line — *"the strip centre sits left
of canvas centre"* — because `.fx-city-ledger` is `right: 0`. `drawHoodNames`
took `vw = W - LEDGER_W` for its half-width and `W / 2` for its centre, which
is the right margin measured about the wrong axis. The admitted band came out
`[144 + bw/2, 1056 - bw/2]`, so the pass

- **threw away the leftmost 144 px of visible map**, where nothing covers
  anything, and
- **wrote names between 912 and 1056** — under the opaque ledger, where no
  reader has them, and every one of those took a box out of the collision grid
  the place names share, so a name nobody could see was displacing one they
  could.

The reference has no such clause: `part3.html` L7012 is
`HX = Math.min(W, VW)/2` off `cv.clientWidth`, and in the mock the canvas IS
the visible strip. The clause is this port's, it is real, and it belongs on the
strip's own centre. Fixed to `|X - HX| > HX - bw/2`, i.e. *the whole box is
inside `[0, vw]`*.

**And the anchors were not the problem, which is worth recording because §15.7
implied they were.** Measured name by name against the reference's own
`G.hoods`, all 41 present in both:

    median anchor distance   157 m
    INNER SUNSET             256 m
    WEST OF TWIN PEAKS       114 m
    worst  GOLDEN GATE PARK 1231 m,  LAKESHORE 1149 m

114 m is 19 px at the district camera. The two capitals §15.7 named were not
failing on position. (The reference's anchor is the MEDIAN of the street
vertices in the hood — *"which sits inside a concave hood where a mean centroid
would not"* — and production's is the area-weighted MEAN of the assessor
blocks. That difference is real, it is what the two 1.1 km outliers are, and
both of those are neighbourhoods that are mostly not assessor blocks at all: a
park and a lake. It is not what was keeping names off the frame.)

### 16.5 The park wash was one even-odd fill of 328 rings, and an overlap is a hole

`part3.html` L3758-3773 fills **each published park ring separately** at
`globalAlpha = 0.46`. This port built all 328 into one `Path2D` and filled it
`"evenodd"`. Two consequences, both visible over Golden Gate Park and Lake
Merced on the ground-only frame:

- **even-odd cancels an overlap.** The rings are not disjoint — a park ring and
  the recreation-area ring published on top of it are two rings over the same
  ground — and every such overlap came out as a HOLE: bare tan inside a park,
  with a hard published edge round it.
- **and the wash stopped accumulating.** Two rings over the same ground compose
  to 0.708 when filled separately and read as the two claims they are; one fill
  of a merged path composes once.

Fixed to one fill per ring with the reference's own per-ring bbox cull, and
`drawParkRings` now returns the number **drawn** rather than the number
supplied.

**And the water bodies' trailing stroke is ported**, which §13.7 left out. The
reference strokes `rgba(28,44,60,.30)` at 0.9 px OUTSIDE its loop, so it
strokes the last body drawn — deliberately, and with a hazard note: reaching
that line having drawn nothing strokes whatever path `drawParkRings` left on
the context, and a dark outline appears round a park. **That hazard is a
property of the reference's shared current path, not of the treatment.** This
port gives every body its own `Path2D`, so "the last body" is a value and a
pass that drew nothing has `null`. §13.7 said porting it faithfully meant
porting the dated/undated split with it; it does not — it meant not having a
current path.

### 16.6 `drawCentrelines` is now the reference's `drawStreets`, and the chunk it needs

It was a stub: `bridged = t; return 0`. It is the whole of `part3.html`
L6271-6330 now — the band's class gate, the two passes a class with the
coverage bit choosing between them, the per-class fade on that class's own
median published width, one `lineWidth` and one `stroke()` per class, the year
gate that draws an undated line in every year, the 0.8 m lift and the pen that
lifts off-screen instead of drawing a chord. **With no `lines` in `opts` it
returns 0 exactly as before**, so nothing changes until a chunk arrives.

Why it matters more than its 4,895 features suggest: `ST_CLS_MAX[0] = 2`, and
`centrelineFade(21.0 m, 0.0467)` clamps to **1**. The reference strokes classes
0-2 at FULL ink on the whole-city frame. That layer is the city of lines in the
mock's wide shot and this build has none of it.

**The chunk, stated so the encode is a small job and not a design one.** One
`strt-line` kind, tier `strt`, **`minZ` 0** — not the `strt` tier's 1.75, which
would keep the layer off exactly the two cameras it exists for — tiled on the
same 1024 m grid:

    fid  u32   the centreline's own id
    cls  u8    3psu-pn9h classcode rank 0-4, the ranks ST_W already indexes
    cnn  u32   so a line joins the right of way it belongs to
    yr   u16   the year the Board voted it; 0 = undated (2,051 non-zero)
    cov  1 bit per feature: does a published right of way cover this line?
    len  u16   vertices per feature
    x,y  f32   ABSOLUTE world metres — `strt`'s own choice, for `strt`'s own
               stated reason: a cell must be independently decodable

`cov` is **already on the wire and read by nobody**: `base/street-misc` carries
`covn` = 4,895, one bit per right of way, beside 1,120 published traffic
islands and 268 named stair runs. No decoder for that chunk exists anywhere in
`src/`. If the line chunk ships its own `cov` the two must be asserted equal
rather than assumed to be.

### 16.7 The harness gate that let a whole sweep through at the wrong scale

`capture.mock_open` breaks its settle loop when `cam.base` **stops moving**,
and the narrow fit — 0.06140261663322853, the one that never subtracts the
288 px ledger — is perfectly stable. One sweep tonight opened at that value
with `wrapW` 1200 and `W` 1200, every gate in `mock_open` satisfied, and every
camera in it pinned **31.6 % too large**; it only failed because the per-camera
scale check downstream refused it. NIGHT.md trap 6 says to gate on the VALUE.
`b2shot.py`/`b2ground.py` do (`MOCK_BASE`, re-open up to six times); `capture.py`
still does not, and that is worth someone's two lines.

### 16.8 What is still open in these files, named

- **the street centrelines** — §16.6. The renderer is complete; the chunk does
  not exist. This is the largest single thing missing from the wide shot.
- **the street NAMES.** `manifest.kinds.strt` has no name field and the only
  street text on the wire is `strt-misc.stairNames`. The mock writes about
  thirty of them on the block frame and this build writes none, which is most
  of what makes the mock's block zoom navigable and ours not. Pipeline.
- **`base/street-misc` is decoded by nobody** — 1,120 published traffic
  islands, 268 named stair runs, and the 4,895-bit `cov` mask the centreline
  fade wants. No decoder for that chunk exists in `src/`.
- **the park facilities** (§13.7) — `TYP.fac`, the tan diamonds and the polo
  field in the mock's Golden Gate Park. Not on the wire.
- **the depth plate is still 417 x 281** against the reference's 1665 x 1121,
  and `water1`'s 26 chunks are still unread. Two things are true about it that
  were not written down before: its `minZ` is **3.0**, so it cannot help the
  city or district cameras at all without a manifest change, and the plate is
  built in `scene.ensurePlates`, which is not one of these files.
- **the seabed relief** — the reference bakes a Lambert hillshade of the bay
  floor INSIDE the depth plate (`DE.bed`, `bedex` 18, `bedamp` 0.70,
  `bedatt` 12, attenuating as `exp(-d/12)` so it shows only on the shelf).
  Production has none. Ablated on the reference at the Sunset district camera
  it moves sampled water pixels by **at most 2 of 255**, so it is a
  block-and-street-zoom refinement, not a wide-shot one — which is why it is
  named here rather than treated as urgent.
- **the hood anchor is a MEAN and the reference's is a MEDIAN** (§16.4). It
  costs 1.2 km on GOLDEN GATE PARK and 1.1 km on LAKESHORE — the two
  neighbourhoods that are mostly not assessor blocks — and under 260 m on
  everything else.

### 16.8 The wall's lambert step was a different function in three places

`part3.html` computes this ONCE, in `rebuildProjected()` L1327, and reads the
result back three times — building walls (`UELAM`), the Transamerica taper
(`FLAMU`) and every hero part (`P.lam`):

```
  const L = hypot(ex, ey), nx = ey/L, ny = -ex/L;    // outward normal, in plan
  const t = (ax*nx + ay*ny) / LMAX;                  // LMAX = hypot(ax, ay)
  lam = clamp(0, 3, round((t*0.5 + 0.5) * 3));
```

`(ax, ay)` is `coeffs()` — the world-space gradient of SCREEN X — so `t` is the
cosine between the wall's outward normal and screen-right, over **[-1, 1]**,
mapped linearly onto the four steps. *The key light in this frame is upper
right*, written as arithmetic.

This port had **three different functions for that one quantity**:

| file | rule |
|---|---|
| `landmarks.ts` `projectPart` | the reference's, exactly |
| `scene.ts` `wallQuartile` | `round(clamp(max(0, n·SUN)/LAM0) * 3)` |
| `roofs.ts` `octQuartile` | the same, written again |

`SUN` is the TERRAIN's world-space sun vector — a three-component direction for
a surface that can tilt, applied to a wall that cannot — and `max(0, …)` throws
the negative half of the range away. **Over a uniform distribution of wall
bearings:**

```
  reference rule   26.8 / 23.2 / 23.2 / 26.8  %   of edges in steps 0..3
  SUN + LAM0       55.7 / 12.3 / 17.2 / 14.7  %
```

More than half of every wall in the city collapsed onto step 0 — the coolest
and darkest of the four — so a block of houses came out two values where the
reference gives it four, and downtown came out blue-grey. `planeQuartile` in
`buildings.ts` is now the one function and the three call sites read it.

That is the twelfth and thirteenth number in production with no source behind
it, and this pair is the largest yet by area: it touches every visible wall of
every building at every zoom.

### 16.9 The haze was on the wrong end of the city — again

`part3.html`'s Block M note records finding this in its own fabric tier and
fixing it:

> `dn = bx/BANDS` therefore put the MAXIMUM haze on the NEAREST buildings and
> none at all on the far ones — the opposite of aerial perspective, and the
> reason turning fadeAmt up made the foreground recede instead of the
> background.

This port had the same inversion, in the only place it computes the index:

```
  d  = depth(x, y)                LARGER d is FARTHER — `buildBldOrder` buckets
  t  = (d + 12000) / 24000        on (hi - d) and draws bucket 0 first, which
  hz = round((1 - t) * 15)        is the horizon
```

`colourLUT` blends toward `HAZE` in proportion to `hz`, so the haze was largest
on the nearest buildings.

And the two numbers under it were nobody's. The reference is
`((dpt - dlo)/dspan)^2.5 * (HZL-1) | 0`, normalised over the city's own depth
range on a 2.5 power — the fade concentrated at the far end, where aerial
perspective puts it. A fixed ±12,000 window is 24,000 plane units against a city
that spans about a third of that, so most of the sixteen steps were spent on
depth the city does not occupy and the fabric came out within two steps of flat.
**Fifteen and sixteen.**

Two notes on the port:

- **the range is the assessor blocks', not the buildings'.** The mock has all
  166,166 centroids in memory; this client holds only the chunks the camera
  asked for. `base/blocks` is city-wide, always loaded, and its 5,404 centroids
  are the same built extent. Stated, not hidden.
- **the aerial fade is normalised over the city and the band index over the
  frame**, and they are different quantities: `ord.range` spends all the
  painter's-order bands on what is on screen, which is right for bands; used for
  haze it would make a building's fade change as the camera moved and the whole
  fabric would breathe.

### 16.10 Four more, smaller, all named

- **`DE.tr0/tr1` were `6.0` and `22.0`**, which are `LR_FORM_PX` and
  `LR_FORM_FULL` — a different ramp in the same file. `part3.html`'s are **7.0
  and 26.0**, and 26 is the number `roofs.ts`'s own note two paragraphs down
  already quotes. The tray opened a pixel early and reached full inset four
  pixels early on every building in the city.
- **`WA.wallpx` is 11 and `scene.ts` used `6`** — and not even the mock's
  QUANTITY: `botY - topY` is the wall quad's vertical extent, which is `dhPx`
  plus however far the base falls across the wall, so a long wall turned across
  the screen passed the test on its footprint rather than on its height. The
  constant was already exported from `terrain.ts` and unread.
- **`heroInk` shaded by `0.9`.** `heroMat` shades the dark by the frame's own
  `COVER_GAIN[step]`, exactly as it shades the cap and the walls.
- **the heroes were not drawn at the frame's cover gain at all.** `colourLUT`
  applies it to all 166,166 buildings; `heroMaterial` and `capColour` did not,
  so at whole-city zoom every landmark stood 25 % brighter than the city around
  it — which is the precise complaint the thirteen deleted sprites were deleted
  for. Passed in on `HeroDrawOptions` because nothing in `landmarks.ts` may read
  the camera (`lmLOD`).
- **`bandLambert`'s lean threshold** was 1.0 against the reference's 0.55, and
  the mock's `taper` gate stands in for the port's `dHeight > 0`. Recorded as a
  divergence by an earlier block; it is now one function, `bandLeansIn`, shared
  with the caller so the two cannot drift apart again.
- **the accent's height, `WO_ACC = 0.85`, was dropped entirely** and then half
  put back in the wrong place: `accentBlend` returned `1 - op` with no `WO_ACC`,
  `capColour` used all of it and `heroMaterial` multiplied the wall by 0.55. City
  Hall's cap came out 18 % more gilt than the reference and its drum 35 % less —
  a difference between two parts of one dome, out of one number split two ways.

### 16.11 Measured, and what the measurement is worth

`b1shot.py`, eight cameras, mock against prod, `diff.py`:

```
  camera            before   round 1   final
  b1-8-ferry         86.66     45.88   46.54
  b1-3-blk           85.81     65.80   66.75
  b1-2-dist          75.53     56.78   56.68
  b1-6-miss-blk      80.63     78.82   77.79
  b1-5-bldg          78.62     76.03   77.18
  b1-4-str           85.84     83.80   80.81
  b1-7-sun-str       57.20     55.58   55.32
  b1-1-city         (invalid, HOME)    29.27
```

**AND THE LATER ROUNDS CANNOT BE READ OFF THIS TABLE.** `src_stamp` differs on
every sweep — `24d7f7fa`, `30c75f20`, `39819e28` — because terrain, water,
streets, trees, labels and camera were all being edited by other agents between
them. A ±0.6 pp movement at the wide cameras across rounds 2 and 3 is inside
that contamination and is NOT attributable to this block. What is attributable
is the size of the round-1 moves (20–41 pp, far outside it) and the arithmetic
in §16.8, which is a property of two functions and needs no frame at all.

### 16.12 Named and NOT done, with the reason

**The class wash** (§15.5, §15.7) is still not shipped, and this block did not
ship it either. The payload exists — `scratchpad/sf-city-anim/lod/lod-data.js`
carries `LRD.cls` as 1,052 u32 indices plus 1,052 class bytes, `LRD.CLS` names
the thirteen classes, and `part3.html` L5636 carries `LR_CLS_ROOF` and
`LR_CLS_WALL`. The renderer half is small: push thirteen entries onto both
palettes at `LR_C0 = 24`, which moves `PAINT_C0` from 24 to 37 exactly as the
mock has it, and override `ri`/`wi` in `decodeBld` for those gids.

**It needs the encoder, and the encoder is not this block's.** A hand-made JSON
dropped into `public/data/us/sf/city/base/` is not reproducible from
`pipeline/scripts/us_sf_city/`, and this directory has already lost 2,192 named
places once to a re-encode. The renderer half is deliberately not landed either:
with no data it would shift `PAINT_C0` and buy nothing.

Also still open from §15.7 and unchanged here: the street centrelines
(`3psu-pn9h`), the depth plate at 417 × 281, and INNER SUNSET / WEST OF TWIN
PEAKS not placing on the district frame.

### 16.13 What the four-step roof LUT costs, and the clause it had to keep

`roofFineLUT(roofF)` is 43,008 entries. **Cold cache, all 10,752 source colours
distinct — the worst case that cannot happen — it is 11.3 ms**, and it runs at
most once per rasterisation, guarded on the same key `colourLUT` is: a fade
quantised to a 64th plus the zoom step. It is `part3.html`'s own structure
(`CL_ROOFN`, rebuilt on `_clutKey`).

That it is not the hitch is measured rather than argued. Driving three real
camera moves through `goToPreset` and sampling every animation frame:

```
  456 frames   p50 8.3 ms   p90 10.3   p99 194.8   worst 399.2
  26 frames over 60 ms, all of them over 120 ms
```

Every long frame carries `queued` between 43 and 142 and a climbing
`lastStats.buildings`, and the run from +933 ms to +3047 ms holds `cells` at
16,385 with the fade and the step unchanged — **so `roofLutKey` never moves and
`roofFineLUT` never runs on any of them.** What they are is the city
re-rasterising as each `bldg` chunk lands: 15,200 → 43,534 buildings over three
seconds, at 130–400 ms a raster.

**That is a real smoothness defect and it is not this block's.** It belongs to
whoever owns the rasterisation and the chunk queue: a tier arriving should not
force a full re-raster of everything already drawn, and at the moment each one
does.

### 16.14 The massing tier: three things the mock draws and this port does not

Measured while chasing the haze, not landed, because landing it safely needs a
change to the flush structure this block did not want to make blind.

`drawMassing` in `buildings.ts` draws one flat plate per block. `part3.html`'s
`drawMass` draws:

- **the walls.** `if (dh > 0.9)` it extrudes every visible edge into `MB_WALL`,
  keyed on the wall palette, the coverage quantile, the fresh step and the
  lambert index. This port takes `wallIdx` and `colours.mwall` and does
  `void wallIdx` — **the table is built by `massLUT` on every frame and thrown
  away.** At whole-city zoom the block massing IS the fabric.
- **the ochre of new construction**, `fq`, gated on the block having actually
  grown: `(MCOV[b] - MCOV0[b]) >= 0.15 * max(1, MCOV[b])`, *"because every block
  that gained a single shed would otherwise take the full six-year ochre, and
  the roll dates 12,594 parcels to exactly 1906"*. This port passes `fresh = 0`
  unconditionally, so **the 1907–12 rebuild wave does not show on the massing
  tier at all** — which is the one thing the whole-city frame of the film exists
  to show. `MassRow` already carries `cov0` and `yr`.
- **the contact shadow**, above `SN.masscov` of coverage.

THE TRAP FOR WHOEVER TAKES IT: the mock flushes `MB_WALL` before `MB_ROOF`, and
it gets away with it because `massFlush` runs **per depth band**, interleaved
into the building stream (`while (MORD && BDPT[MORD[mo]] > dpt) drawMass(…)`).
This port draws every block in one pass and flushes once, so walls-then-roofs
would paint a far block's roof over a near block's wall. The flush has to become
per-band first.

### 16.9 The two capitals §15.7 named are under the LEDGER, and that is not a bug

§15.7 left *"INNER SUNSET and WEST OF TWIN PEAKS still do not place on the
district frame"* as an open defect, and §16.4's margin fix does not place them
either. **Both builds were asked, gate by gate, at the same camera** — every
one of the 41 anchors projected and tested against the same three clauses:

    hood                     mock X,Y,box   in?      prod X,Y,box   in?
    INNER RICHMOND             984, 52 166   IN        980, 48 166  out
    INNER SUNSET               952,205 137   IN        995,164 137  out
    OCEANVIEW/MERCED/INGL.    1040,625 290   IN       1051,623 290  out
    OUTER RICHMOND             621, 55 168   IN        544, 11 168  out
    WEST OF TWIN PEAKS        1051,430 195   IN       1070,422 195  out
    LINCOLN PARK               420, 19 138  out        364, 35 138   IN
                                        mock 8 in margin, prod 4

The positions agree to a few pixels. **The gate that differs is the frame
itself**: the mock's `HX` is `min(W, cv.clientWidth)/2` = 600, because in the
mock the ledger sits BESIDE the canvas; production's is 456, because
`.fx-city-ledger` is an opaque panel `right: 0` ON the canvas. Every one of
those names is at X > 912. **They are refused because a reader could not see
them**, and refusing them is the correct behaviour, not a defect.

It is doubly a harness artifact: the harness pushes the same `cam.cx` into both
builds, so production is framed as if it had no ledger and then clipped by one.
On the real page `camera.strip()` offsets the centre by `LEDGER_W/2`, and the
district preset at 1440 x 900 writes **eight** hood names — PACIFIC HEIGHTS,
JAPANTOWN, WESTERN ADDITION, NOB HILL, TENDERLOIN, SOUTH OF MARKET, MISSION,
BERNAL HEIGHTS — which is the reference's count.

So §16.4's fix is right and asserted, and **it changes nothing at this
particular camera**: the four names it now admits on the left were already
being admitted, and the four it now refuses on the right were already being
refused by the old band's upper edge. Its effect is at cameras where a name
falls in the leftmost 144 px or between 912 and 1056. Recording that plainly so
nobody measures it here again.

### 16.10 What the shore pass costs

The budget that survives is *no visible hitch during a camera move*. Measured on
the live canvas with a readback forcing the flush after every timed call — trap
5 — `?layers=` against `?layers=-shore`, 25 renders a camera after a warm-up:

    camera         all (p50)   -shore (p50)   delta p50 / p95
    city              80.3        72.8         +7.5 / +6.3
    dist-sunset      258.3       266.9         -8.6 / -7.1
    dist-embar       216.6       205.2        +11.4 / +6.2
    blk-mission      304.8       309.3         -4.5 / -9.9

**Two of the four deltas are negative, so the pass is not separable from
run-to-run noise on a flushed full render**; the largest measured is +11.4 ms of
a 216 ms frame. With the caches warm the whole frame is 0.2 ms either way. And
the pass carries the reference's own early-out — `coastBand(...) > 0` returns
before any fill — so a camera with no coastline in it pays the cull loop only.

### 16.11 Where the difference is now, by camera

    camera              before    after     what moved
    Z1-city-2018        34.80 %   29.26 %   the corridor
    Z6-city-1906        30.53 %   24.58 %   the corridor
    Z2-dist-sunset      76.93 %   61.11 %   the corridor
    Z7-dist-gg          83.83 %   67.22 %   the corridor
    Z8-dist-embar       67.17 %   49.09 %   the corridor + Treasure Island
    Z3-blk-mission      81.97 %   79.06 %   little coast at this camera
    Z4-str-dtown        74.45 %   74.14 %   ditto
    Z5-bld-civic        76.61 %   74.86 %   ditto

    GROUND PLATE ONLY — the only column that speaks for these four files
    G2-dist-sunset      40.54 %   18.85 %   gross 83,041 -> 6,016
    G3-blk-mission      12.93 %   12.68 %   gross 11,247 -> 1,176
    G4-str-dtown         2.04 %    2.04 %   gross    628 ->   184

**And the whole-city frame's remaining difference is no longer in the water.**
The 12 x 7 tile map puts it in the built fabric — the four interior rows of
columns 1-8 run 40-83 % while the open-water columns run 0-8 % — and the region
means say the same thing:

    Angel Island water   mock 136,159,187   prod 138,161,190   +2,+2,+3
    bay E                mock 153,175,197   prod 155,177,199   +2,+2,+3
    ocean W              mock 180,186,174   prod 193,199,187   +13,+13,+13   (city fabric in the box)
    city fabric          mock 171,169,149   prod 188,187,165   +16,+17,+16

The city fabric is uniformly **+16 of 255 too bright at every zoom**, and the
ground-only column above says it is not the ground. It is the buildings and the
street surface over it. The buildings are not these files.
