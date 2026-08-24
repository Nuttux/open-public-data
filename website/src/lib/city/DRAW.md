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

---

## 17. Block B7 — the hit test, and the data ceiling under it

`components/us/city/scene.ts` · `lib/city/{buildings,facades,roofs,landmarks,palette}.ts`

### 17.1 `pick()` marched the terrain, and the city is not the terrain

BUGS.md §1, and the worst defect in the piece: **three clicks in four on a
built-up frame returned nothing.**

`CityScene.pick()` marched z downward from 320 m and stopped at the first
crossing of the **DEM**. Buildings were not in the march. A reader who clicks a
roof is clicking a surface `h · ZEXB` up the screen from the ground under it, so
the resolved world point was the ground *behind* the building. The arithmetic,
at band 2: the pixel's line runs `ZEX / (sA · √2)` = **3.37 world metres per
unit of z**, and a metre of built height is `ZEXB/ZEX` = 0.8 of a unit — so a
15 m storefront threw the answer **40 m up-street**, against a ~100 m block with
a ~21 m street beside it.

Measured over every 8th pixel of the stage, 14,432 samples per camera, film
asserted off at the shutter (`.parity/b7pick.py`):

| stop | before | after |
|---|---|---|
| street | 38.0 % | **56.3 %** |
| block | 45.9 % | **68.8 %** |
| district | 59.3 % | **86.1 %** |

Three things landed, in the order they were measured, and the middle one is the
one that mattered least:

1. **The block prism.** March the massing tier's own solid — the published ring
   extruded to `massRow.hgt[b]` over `elevM` at its centroid, which is exactly
   what `drawMassing` paints. 38.0 → 47.4 / 45.9 → 57.8 / 59.3 → 73.7. The
   blocks went behind a uniform grid (`blockHashOf`, 160 m cells, CSR buckets)
   because the old linear sweep — 5,404 centroid rejections and a
   `[number, number][]` allocated per candidate — is not affordable once per
   march step. **The whole sweep got 5× faster while doing more work**: 165 ms
   → 32 ms for 14,432 picks.
2. **The footprints.** The block plate is not enough and the reason is a
   published fact worth writing down: **`th` is an area-weighted mean over a
   block's NON-solo members, and everything 20 m or over at its derived top is
   a solo, so the largest `th` in the whole city is 19 m and the mean is 7.4**
   (measured, all 5,404 blocks, 2025). Marching the plate corrects a 15 m
   storefront by 7 m. So `footSolid` builds the same tables `paintFootprints`
   draws from — `base/solo` plus the `bldg` chunks the view yields — and files
   every footprint under its bbox with its roof in the march's units and the
   block whose ring contains its **centroid**. No vertex is copied. Worth
   +1.2 to +2.1 points, no more, and the reason is §17.2.
3. **The right-of-way snap**, BUGS §1's own second candidate, and the largest
   single win: +8.9 at the street stop, +11.3 at block, +10.3 at district.

### 17.2 The ceiling is in `base/blocks`, and it is half the city

**`base/blocks` does not tile San Francisco.** 5,404 rings, 93.0 km² of ring
polygon (checked against the published `area` column: ratio 1.008, so the
geometry is faithful — the rings are not shrunk), against the city's 121.5 km²
of land. Drawn over the street frame — `.parity/out-b7/b7-rings-street.png`,
every ring in magenta over the real page — **entire blocks in Russian Hill have
no ring at all**, alternating with blocks that do.

That is what the dead red islands in `b7-pm4-street.png` are, and it is not a
hit-test bug. It also explains `base/solo`: 15,261 footprints, of which
**13,813 (92 %) fall inside no ring at all**, brute-forced against all 5,404
rings, median 49.8 m from the nearest one. `drawMassing`'s own doc calls these
"buildings that stand on land the assessor does not divide into blocks"; the
measurement says the land in question includes ordinary residential blocks in
the middle of the city.

**Hand-off to whoever owns the chunk encoder:** a `base/blocks` that covered the
city would move the street stop from 56 % to something near 90 % on its own, and
nothing in the client can substitute for it.

### 17.3 What the snap is bounded by, and why two bounds

A footprint the assessor puts on no block **occludes** — the pick returns −1
rather than the block behind it. Measured both ways: letting the ray pass
through such a footprint buys 1.8 points at the street stop and buys them by
answering with a block up to a kilometre up-street (the march traverses ~1.1 km
of world distance end to end), which is BUGS §1's *second* complaint — the pin
and the record disagreeing — re-introduced to flatter the first.

The snap that replaces it is bounded in **world metres** at 10.5 — half of San
Francisco's standard 68.6 ft right of way, so it reaches a street's centre line
and no further — and in **screen pixels** at 18, which is a guard rather than a
dial: 10.5 m is 18.2 px at the street stop and 0.6 px at the whole-city stop, so
the world bound governs at all four of the page's stops and the pixel bound only
exists to stop a deeper zoom turning a fixed world distance into a snap the
reader could see happen. Outside the bound the pick still returns −1, so open
water still answers nothing.

### 17.4 `sg.z(i, j) > 0` is off the shallows predicate (§16.3, closed)

One deletion in `scene.ensurePlates`. `isLandOf` alone is the reference's whole
land test. Every made-land parcel in the city reads 0 m on the 110 m surround
grid — Treasure Island, the Marina fill, Mission Bay, the Embarcadero seawall —
so the BFS called them water and laid the shallows plate opaque across them.

## 18. Block B8 — the street names, and three chunks with no reader

The brief is `.parity/FOCUS.md`. **The single most visible gap on the reference
sheet was that the mock writes street names and this build wrote none**, on a
layer that has been fully encoded since B6 and read by nobody since.

### 18.1 What was on screen before, and what is on screen now — measured

`.parity/b8shot.py`, five cameras under a `b8-` prefix, `MOCK_BASE` gated on the
value (trap 6; `capture.mock_open` still gates on stability alone). The mock's
own street names are identified **by the fonts its street lane sets** —
`${LB_WT[rk]} ${(10.5|11|12) * LB_SIZE[rk]}px ui-sans-serif`, three strings no
other lane on the page uses.

    camera                     mock   prod before   prod after
    b8-1-city-2018   z 1.0      10         0            9
    b8-2-dist-dtown  z 2.9      30         0           26
    b8-3-blk-dtown   z 7.2      37         0           38
    b8-4-str-dtown   2.0 px/m    6         0            1
    b8-5-bld-civic   6.0 px/m    0         0            0

**"Before" is 0 at every camera and it is 0 by construction**, not by accident:
`grep -rn 'streetLabels' src/components` returns nothing, and it returned
nothing on the day the chunk shipped.

On the whole-city frame the mock writes GEARY BLVD, 3RD ST, ALEMANY BLVD, CESAR
CHAVEZ ST, SAN JOSE AVE, 19TH AVE, LOMBARD ST, GREAT HWY, SKYLINE BLVD and
SLOAT BLVD. This build now writes seven of those ten, and MONTEREY BLVD and
PAGE ST instead of LOMBARD ST, SAN JOSE AVE and SKYLINE BLVD. The block frame
(`out-b8/b8-sheet.png`, middle and right panels) goes from a texture with no
word on it to COLUMBUS AVE, GEARY ST, O'FARRELL ST, HOWARD ST, MARKET ST, THE
EMBARCADERO, HARRISON ST, 6TH ST and 10TH ST — which is the difference between
a picture of a city and a map of one.

**The harness draws the layer with the real module and the real data and does
not touch `scene.ts`**, which another agent owns tonight: `labels.ts` is
bundled with esbuild into `.parity/b8/b8.js` and run against
`RR().data.streetLabels()`, `RR().cam`, `RR().scene.proj`, `RR().scene.places`
and `RR().scene.blocks`, into the visible canvas after the blit, with the buffer
asserted 1:1 with the viewport first. Same module, same chunk, same camera.

**And the order is the finding, twice over.** The first run put the street pass
into the collision grid the finished frame left behind — i.e. after every
landmark and every neighbourhood — and the wide shot came back with **4** names,
without GEARY BLVD or 3RD ST. Run in the reference's own order
(`placeNames(designated) → spine → hoods → arterials → placeNames(named) →
locals`) into a fresh grid, the same camera gives **9**. §9 said the order
carries the priority; this is that sentence with a number on it.

### 18.2 The street camera's gap is the LEDGER, and it is measured name by name

`.parity/b8why.py` lists every label whose rank passes the band gate and whose
anchor is within 200 px of the frame, on both builds, at the street camera.
**Fourteen candidates on each side, the same fourteen names, agreeing on X and
Y to within one pixel** — which is the strongest check yet that
`base/street-labels`'s `wx`/`wy` are the reference's own `G.labels.x/y`.

Of the five the mock writes and this build does not:

- **JESSIE ST (X 947), JESSIE EAST ST (1114) and STEVENSON ST (1146) are under
  the 288 px ledger.** `part3.html` L7010 measures its margin off
  `cv.clientWidth` and in the mock the canvas IS the visible strip; production
  paints an opaque panel over the canvas's right edge, so those three are not
  names the reader has. That is §16.4's clause applied to the pass it came
  from, it is deliberate, and it costs about a quarter of the frame's
  candidates at close zooms.
- **STOCKTON ST and CYRIL MAGNIN ST are inside the strip and lose their box to
  the designated place lane**, which runs first. Production's place register
  carries **2,192** places against the reference's 995, so at street zoom the
  first lane spends more of the frame than the reference's does. That is the
  places layer's number, not this one's.

### 18.3 `minLen`'s three magic numbers, and the two the reference left dead

The gate is `nameFitsItsStreet` — *a name is only written where the thing it
names is at least as long as the name* — and it is `part3.html`'s own
replacement for `minLen` 1100 / 420 / 150 m, which at the three presets are
75 / 82 / 74 px against a name that measures 70-90 px.

Two things in the reference are **defined and never read**, and both are worth
recording because the port had inherited one of them as if it were live:

- **`LB_INK`.** `part3.html` L6723 defines `["rgba(38,30,16,.90)", ".74",
  ".54"]` beside `LB_SIZE` and `LB_WT` and then fills every rank at
  `rgba(38,30,16,.84)`. Two occurrences in the file: its definition and
  nothing. **This port applies it**, which is a deviation of 0.06 alpha on the
  wide shot (rank 0 only) and up to 0.30 on the block frame, where a local
  street name is the thing that should be quietest. It is kept because it is
  the three-treatment hierarchy §9 states and because the block frame carries
  38 names, but it is a deviation and it is declared.
- **`LOCAL_SHARE`.** Deleted in the reference in the same edit that made the
  budget ink rather than a count, with the reason: *the pass runs in the city's
  own published class order, so the arterials have first refusal by
  construction and there is no remainder to protect.* `LOCAL_SHARE_MAX` stays
  exported with that argument attached to it; nothing reads it.

And **`spineOf` was missing its second half**: `part3.html` L6683 keeps a `seen`
set of NAMES, because Geary is 214 published centreline segments and 15 label
stretches and without the dedup the seven spine slots go to seven pieces of two
streets. `spineOf` now takes an optional `nameOf`; the seven that come out of
the shipped table are read off the data and there is no list.

### 18.4 The three ink budgets, measured, and NOT merged

FOCUS.md asks whether the street, place and neighbourhood names should share one
pool. **The reference holds three separate pools and this port now matches it**,
so here is what each is worth rather than an argument:

    lane                    cap        measured, this build
    street names          0.0750       0.0199 city · 0.0503 district · 0.0741 block
    place names (x2)      0.0152 ea    0.0273-0.0295 total (§9)
    neighbourhood names   none         0.0304 is the number they were MEASURED at

- **The street cap binds only at the block frame** (0.0741 of 0.0750). At the
  whole-city camera the layer spends 0.0199 and is stopped by the collision
  grid and the length rule, not by the budget — so lowering the cap would do
  nothing to the frame Daniel judges by and raising it would do nothing either.
- **The district frame carries more name-ink than the whole-city frame**:
  0.0503 + ~0.028 + hoods against 0.0199 + ~0.028 + hoods. That is real, it is
  the reference's own behaviour (its cap is one number for all three bands),
  and it is the thing a single shared pool would change.
- **Merging them is a change to what the explorer draws, not a port of it**, and
  it would need a budget on the hood pass, which has never had one. Left alone,
  deliberately, and now with the three numbers written down.

### 18.5 `base/street-misc` — 1,120 islands and 268 stairs, decoded, drawn

`drawStreetMisc` in `streets.ts` is `part3.html` L6608-6672. Two clauses:

- **the islands are drawn as FOOTWAY, because that is what a refuge is**, and
  they publish no width of their own to tier on — so the gate is the frame's
  median footway band. The reference's `3.16` at L6612 **is
  `manifest.streets.stats.fw_p50`**, the city's own median published footway,
  and it is passed in rather than written into the module: that is FOCUS.md's
  "seven constants" pattern, found once more.
- **the stairs are an honest global treatment and are declared as one.**
  `aw7j-9354` publishes the run and neither a width nor a tread count, so every
  stair is 2.2 m wide with a tick every 0.9 m and **neither number is a
  measurement of that stair.** Drawn only where a tread is more than two pixels
  from the next.

`streetMisc()` is null until the `strt` tier lands at z = 1.75, which is below
both gates, so the wide shot cannot change.

### 18.6 The depth plate is 417 x 281 against 1665 x 1121, and the blocker is named

`base/water0` is 117,177 of the 846,819 published NOAA nodes. `water1` carries
the other 729,138 in 26 tiles, on the wire since P2, and
`grep -rn 'water1' src/` returned the manifest reader and nothing else.
`buildDepthPlate` in `water.ts` assembles them — one canvas at `meta.nw x
meta.nh`, each tile `putImageData`'d at its own published `gx`/`gy`, a missing
tile left transparent because a missing tile is all land and the encoder drops
it for that reason, and a tile whose byte count disagrees with its own `w * h`
throws naming the tile.

**`blitGridPlate` needed no change**: it already takes `texelsPerCell`, and
`mul` is 4. 1665 = 416x4 + 1 and 1121 = 280x4 + 1, so every fourth texel of the
refined plate IS a node of the coarse one — which is what `assertRefinement`
already refuses to proceed without.

**Two things block it and neither is in these files.** `water1`'s tier `minZ` is
**3.0**, so the tier is never fetched at the whole-city or district cameras and
those two frames cannot be helped without a MANIFEST change — and that change
costs 236,561 gzipped bytes against the base tier's 689,379, so it is a decision
about the first paint. And the plate is assembled in `scene.ensurePlates`. The
call site is six lines and it is in §18.8.

### 18.7 The +16 of 255, ablated

§16.0 measured production brighter than the reference at every camera and the
ground-only column said it is not the ground. The street surface is the next
largest area in the frame and it is in these files, so `.parity/b8bright.py`
ablates it on both builds at once — `?layers=-streets` against `STSF.on = 0` —
at the same year, preset and absolute scale.

    camera            layer off      mock mean R      prod mean R    d
    b8b-city z 1.0    as shipped        181.8            187.9      +6.1
                      -streets          181.8            187.9      +6.1
    b8b-dist z 2.9    as shipped        150.5            162.9     +12.4
                      -streets          150.9            163.7     +12.8
    b8b-blk  z 7.2    as shipped        152.1            159.0      +6.9
                      -streets          152.5            161.2      +8.7

**IT IS NOT THE STREET SURFACE.** Take the layer off both builds at once and
the gap does not close — it OPENS, by 0.4 at district and 1.8 at block. The
published right of way is slightly DARKER than the fabric it covers, so the
street layer is pulling production TOWARDS the reference and removing it makes
things worse. At the whole-city camera the two rows are identical to the tenth
of a unit, because neither build draws a street surface there at all
(`streetsResolve` and `STSF`'s own gate agree, which is itself worth having
measured).

**The built layer is where the frame's value is decided**, and this is the
number to hand on:

    camera            prod as shipped   prod -buildings   the built layer is worth
    b8b-city                187.9            193.4              -5.5
    b8b-dist                162.9            186.2             -23.3
    b8b-blk                 159.0            199.7             -40.7

That is **not** a paired ablation — the mock publishes no equivalent switch for
its buildings, so the right-hand column is production against a reference that
still has its city on, and the `d` of +35.7 / +47.6 in `b8-bright.json` means
nothing on its own. What it does establish is the size of the term: at the
district camera the built layer moves the frame 23.3 units and the whole
disagreement is 12.4, so **a built layer 2 % too light accounts for all of it**,
and neither the ground (§16.1's ground-only column) nor the streets (above) can.

**Hand-off, and it is not these files:** the residual is in `buildings.ts` /
`roofs.ts` / `facades.ts` / `palette.ts`. The instrument is
`.parity/b8bright.py` — one prod page, `scene.layers` set at RUNTIME rather than
through `?layers=` on the URL, because re-opening the page per ablation lost the
canvas under `prod_shoot`'s poll loop three runs out of three.


### 18.8 The call sites, which are all in `scene.ts` and none of them here

`scene.ts` is another agent's tonight. Four one-place changes, in the order
`scene.paint` would take them:

```ts
// paintStreets, after drawStreetSurface
const misc = this.data.streetMisc();
if (misc) drawStreetMisc(f, misc, t, { fwMedianM: stats.stats.fw_p50 });

// ensurePlates, beside the base/water0 branch
const tiles = this.data.manifest.chunks
  .filter((c) => c.kind === "water" && c.tier === "water1")
  .map((c) => ({ e: c, f: this.data.get(c.k) }))
  .filter((t) => !!t.f);
const fine = tiles.length ? buildDepthPlate(meta, tiles, makeCanvas) : null;
if (fine) { this.depthPlate = fine; this.depthTexels = meta.mul; }
// ...and `depthTexels: this.depthTexels ?? 1` at the drawWater call

// step 8, THE NAMES — the street lane is three lines inside the existing pass
const tbl = this.data.streetLabels();
const sn = tbl
  ? new StreetNamePass(f, tbl, this.labelGrid, (x, y) => t.elevM(x, y))
  : null;
//   placeNames(designated)  ← already there
sn?.draw("spine");
//   drawHoodNames           ← already there
sn?.draw("arterials");
//   placeNames(rest)        ← already there
sn?.draw("local");
st.labels += sn?.placed ?? 0;
```

and §15.7's centreline wiring, still open, still one call site.

**The order is not cosmetic.** Measured on the whole-city camera: the street
lane run last, after every landmark and every neighbourhood, places 4 names and
loses GEARY BLVD and 3RD ST; run in the three places above it places 9.

## 19. Block C1 — what the night before it had already landed, and the cap plate

`components/us/city/{scene,renderer,palette}.ts` · `lib/city/{buildings,facades,roofs,landmarks}.ts`

### 19.0 Three of the four handed-over items were already in the tree

The brief for this block named four things to land. Commit `027f8a2b` — the
snapshot the session restart left behind — already carries three of them, and
the first thing this block did was measure rather than re-fix:

| handed over | state found | proof |
|---|---|---|
| `pick()` marches the terrain only | **landed** (§17) | re-measured, below |
| `scene.ts` `buildShoal(… sg.z > 0 …)` | **landed** (§17.4) | `scene.ts:2076` reads `isLandOf` alone |
| street names called by nobody | **landed** (§18.8) | `StreetNamePass` at `scene.ts:1933`, in the reference's order |
| `renderer.ts` `moving = film ? false` | **not changed**, and see §19.3 | — |

`pick()`, re-measured from scratch on the shipped page with `.parity/b7pick.py`
— every 8th pixel of the stage, 14,432 samples a camera, film asserted off at
the shutter:

    stop        B7's before   this block measured
    street         38.0 %          56.3 %
    block          45.9 %          68.8 %
    district       59.3 %          86.1 %

Identical to §17.1's after column to the tenth of a point, on a fresh browser
and a fresh sweep. The fix is in and it holds. **The remaining 44 % at the
street stop is §17.2's data ceiling and not a client bug** — `base/blocks` is
93.0 km² of ring against 121.5 km² of land — so no work in these files can move
it further.

### 19.1 The cap's top plate was never a roof deck, and the tray proves it

BUGS §4 and §19: a pure-white polygon on a roof in the Mission, "unshaded, on an
otherwise shaded roof". §19 groups it with the pier sheds as *one defect at two
sizes*.

Two separate faults are stacked on that one polygon and only the first had been
found. `roofFineLUT`'s note (this file, §7) records the first: `RSHADE[3]` = 1.14
against a measured palette whose four brightest entries are `#eeeee7 · #f3f4ee ·
#f8f9f5 · #fcfdfb`, so the top step clipped every channel and the roof came out
neutral (255, 255, 255). `gamutHeadroom` closed that.

**It was still the brightest plane on the frame afterwards, and that is a
different bug.** Proved by tinting: `drawStep`'s top-plate fill was temporarily
set to magenta and the shape in BUGS' picture turned magenta —
`out-c1/c1-armory-mag.png`, with the other caps across the Mission lighting up
with it. So the shape is the second solid's cap, not a material fallback and
not a footprint.

Then sampled off the shipped page, State Armory & Arsenal, block camera,
`out-c1/c1-armory-blk.png`:

    the cap's top plate      (252, 253, 251)
    the roof deck around it  (228, 229, 227)
    228 / 252              = 0.905

`DE.deckv` is **0.905**. The disagreement is not approximately the tray, it IS
the tray: `drawTray` fills every roof deck in the city at `shade(roofColour,
DE.deckv)` and the parapet's inner face at `DE.innerv` = 0.82, so the raw
palette value survives only on the 0.4 m of coping around a roof's edge — and
`drawStep` filled its plate with that raw value, under a comment that read *"a
cap is a roof"*. On this building `ri` = 55, which is `PAINT_C0` + 31, the
brightest measured entry there is, so the missing 9.5 % is the difference
between a pale roof and a hole in the map.

The fix is one fill, and it is **ramped on the cap's own drawn width through
`trayW`** rather than applied flat. DE6's own rule for the tray is that nothing
is clamped to a minimum — under `DE.tr0` = 7 px a roof is exactly the flat fill
it was. A cap 3 px wide at the whole-city camera stands among roofs 3 px wide;
darkening it alone there would trade the block camera's bug for a new one at the
wide shot. Reading `trayW` on the plate makes a cap and a roof of the same
drawn size the same value **by construction**, so the two cannot drift apart
again.

### 19.2 BUGS §3 is not a missing cap, and the ring says so — refuted, so nobody re-runs it

BUGS §3 reads *"the pier sheds on the Embarcadero are drawn as open boxes over
the bay … a rectangular ring of walls with no cap — the bay is visible through
the middle of the roof"*, and §19 groups it with the armory as one defect. The
armory half was real (§19.1). **The pier half is the renderer drawing the truth.**

`base/solo` row 13790, gid 142246, the footprint nearest the *Pier 19 1/2 —
Bulkhead/Shed* label: **21 vertices, signed area +21,772 m², zero
self-intersections, winding 0 or 1 everywhere** (sampled on a 60 x 60 grid over
its bbox — `.parity/c1probe.py`). A flattened donut would show winding 2 or a
crossing; this shows neither. Plotted vertex by vertex in
`out-c1/c1-pier-ring.png` it is an unmistakable **C**: the bulkhead building
across the shore end, two shed wings running 250 m out over the water, and the
open pier apron between them. That is what Pier 19½ is. **There is no cap
missing. There is no roof over the apron because there is no roof over the
apron.**

Measured on the same building at the street camera (`.parity/c1shadow.py`), in
case the next reader suspects the geometry around it:

    hM (roofHeight from h=10, hf=2)   10.13 m
    wall height on screen             32.4 px
    contact shadow offset             6.9 px left, 4.0 px down   (the clamps)
    walls drawn / ring edges          12 / 21
    wpx                               707.9  → near

12 of 21 edges take a wall, which is the front-facing set of a C at this
bearing, and the shadow is at its clamped offsets and not spilling. What BUGS
saw as "a very large translucent grey quad on the water" is the shed's own
footprint-shaped shadow lying on the bay at 36 px below its roof, drawn at
`SHADOW_FILL` = `rgba(72,60,42,0.16)`; tinted magenta at 0.85 it is
`out-c1/c1-piers-shadowmag-crop.png`, and it is the right shape in the right
place. **What is left of §3 is an editorial question — whether a building's
shadow should be drawn on open water at all — and not a drawing bug.** It is
not fixed here and it is not a fallback past `UMAT_ROOF`.

---

## 19. Block C2 — a ground plate a camera move can use

`FILM.md` §6b measured that two thirds of every frozen frame in a camera move is
the ground being repainted, and named the fix here. §1's `GROUND_PLATE` note
rejects a scale-tolerant plate. **The note's premise is wrong, and it is wrong
about a number that had never been counted.**

### 19.1 The count the rejection rests on: 132 ground builds, not "two to five"

The note compares "about seven plates" against "the buffer's two to five
rasterisations". Nobody had counted the ground passes themselves. `terrain.ts`
§GPROBE now records one row per ground pass — the camera it was handed, the
frame size, whether the plate hit, and the plate key — and `.parity/c2move.py`
plays **one camera move per page load**, which is what it takes to measure a
move at all:

* `CityFilm.tsx` latches the SPARE version after 20 s of playback under 0.6, and
  once it has, the remaining travels are *cuts*. A single-page sweep measures
  move 3 and then seven still frames. `spare` is asserted on every row here.
* the film STRETCHES on a slow frame, so `b3fps.py`'s wall-clock wait of
  `(t1 − t0)` ms covered about **58 %** of each move. The FILM.md §6b move table
  is the first half of each move, not the move.

Measured, 1440 x 940, DPR 2, headless Chromium, dev server — ground passes and
ground *builds* per move:

| move | z | terrain passes | builds | worst frame |
|---|---|---:|---:|---:|
| into 3 civic-bonds | 2.05 → 3.20 | 37 | **22** | 917 ms |
| into 4 city-hall | 3.20 → 28.0 | 32 | **17** | 933 ms |
| into 5 tunnel | 27.98 → 2.60 | 23 | **19** | 1,208 ms |
| into 6 west-fills | 2.60 → 1.90 | 29 | **15** | 1,108 ms |
| into 7 hetch-hetchy | 1.90 → 1.10 | 4 | **4** | 724 ms |
| into 8 treasure-island | 1.10 → 2.55 | 20 | **19** | 696 ms |
| into 9 yerba-buena | 2.55 → 3.60 | 39 | **21** | 804 ms |
| into 10 to-now | 3.60 → 1.10 | 29 | **15** | 954 ms |
| | | **213** | **132** | |

**132 full ground rasterisations across the eight travels**, and the surround
misses on exactly the same 132 frames because it carries the same `camKey`.

### 19.2 Why they miss, which is not the reason the note assumes

The note imagines the ground being rebuilt because the camera has *travelled*.
Read the sequence and most of them have barely moved. The move into 3 rebuilds
the ground at

    s = 0.12727  cx = 3125.5      s = 0.13498  cx = 3071.5
    s = 0.13992  cx = 3019.6      s = 0.14333  cx = 2978.3

— consecutive builds **1.04× apart in scale and a few screen pixels apart in
pan**. The move into 9 rebuilds it four times over a 4 % zoom. The rasterisation
is forced by the film's own year quantum and by tiers landing (`renderer.ts`
§contentKey, `YEAR_Q = 16`); the plate key already omits year, tier and data, so
it *would* have survived — except that it carries the exact camera, and the
camera has drifted by five pixels. **The ground plate misses on a move not
because the camera changed a lot, but because it changed at all.**

### 19.3 A lazily built tolerant plate cannot build more plates than there are rasterisations

That is the flaw in the "seven plates against two to five" argument. Seven is the
size of a plate LADDER built to cover a zoom range in advance. A cache that
builds a plate only when a rasterisation asks for one and the plates it holds
cannot serve it has an upper bound of **one build per rasterisation** — so
tolerance can only ever remove builds, never add them.

`.parity/c2sim.py` replays the captured sequences through candidate policies.
A policy is a magnification ceiling (how far a plate may be blown up) and a
margin (how much wider than the frame a plate is painted). Builds across the
eight moves:

| policy | into 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shipped | 22 | 17 | 19 | 15 | 4 | 19 | 21 | 15 | **132** |
| 1.15× / no margin | 6 | 8 | 19 | 16 | 4 | 19 | 3 | 15 | 90 |
| 1.15× / 1.06 | 5 | 8 | 17 | 6 | 4 | 3 | 3 | 10 | 56 |
| 1.15× / 1.12 | 4 | 7 | 13 | 4 | 4 | 2 | 3 | 6 | 43 |
| **1.30× / 1.12** | 3 | 6 | 13 | 4 | 4 | 2 | 2 | 6 | **40** |
| 1.70× / 1.25 | 2 | 4 | 9 | 3 | 3 | 2 | 1 | 5 | 29 |
| perfectly tolerant | 2 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 14 |

A margin M costs M² pixels **on a build**, so 1.30 / 1.12 is 40 builds at 1.25×
against 132 at 1×: **0.38 of the ground work**, and it needs a ceiling the film's
own frame buffer already exceeds (`EXT_K_MAX` 1.70). 1.70 / 1.25 buys 11 more
builds for a magnification the eye can find on a still; that trade is refused
below.

### 19.3 The Golden Gate Bridge — `part3.html` ships 150 lines of it and the port kept two

BUGS §7, ranked seventh and on **the first frame every visitor sees**: *"a single
tapered reddish line running from inside the Marin raster blob down to the
Presidio bluff. There is no deck, no tower, no span … at the whole-city stop it
reads as a scratch on the canvas."* `out-c1/c1-ggb-before-city-zoom.png` is that
sentence as a picture.

**The reference was never consulted.** `part3.html` §8296–8443 is `lrBridge`: the
deck as a swept ribbon with its own ink, the shadow it throws on the water, the
approach piers, the roadway centre line, two main cables as parabolas, the
suspenders, and two towers built out of boxes with cross-braces — each with a
comment saying what is published and what is a drawing convention. What this port
shipped was `ctx.fill()` of the ring plus two `ctx.stroke()`s one pixel wide.

Ported whole. Three things it settles that are worth carrying:

**1. One structure was on two vertical exaggerations.** The deck was placed with
`proj(x, y, GGB.deckZ)` — through `zex` — and the tower tops with `projb(x, y, 0,
towerM)` — through `zexb`. `zexb/zex` = 0.8, so the towers stood 185 m-equivalent
over a deck at 67.1 and the 164.5 m they really rise came out **118**. The
reference states the rule outright: *"EVERY HEIGHT HERE IS ABOVE SEA LEVEL, so
the whole structure is drawn on ZEX — the TERRAIN dial — and not on ZEXB. A
bridge deck at 67.1 m stands beside headlands at 60 m, and if the two used
different exaggerations the picture would be a lie about which is higher."*
Everything is now `proj`. **The first cut of this fix put the deck on `zexb`
instead — the wrong half of the same bug — and the reference caught it.**

**2. Two more published constants had no reader.** `GGB.suspenderM` (30.0) and
`GGB.legM` (7.0) are decoded, documented and asserted in `draw.test.ts`, and
`grep -rn 'suspenderM\|legM' src` returned the declaration and the tests **and no
call site.** That is the fourth pass tonight found written, tested and called by
nobody (§16.1, §17.1, §18.8). Both are honestly labelled conventions in the
reference — the suspender spacing is *"a regular division of the span"* and the
leg's plan size is *"neither number is published and both are stated"* — and that
labelling is carried into the port rather than dropped.

**3. Why a leg is a box and not a quad**, which is the whole of why a first
attempt looks wrong. At ROT 315 the projection is axis-aligned and the Golden
Gate runs within 9° of north, so **a metre along the bridge and a metre of height
go the same way on screen**. A leg drawn in the (axis, height) plane is a
degenerate sliver and the cables converge on nothing. Its width has to be ACROSS
the bridge, and the cross-braces read as horizontal for the same reason.

Every tier is the file's usual cut-off: the pass is skipped below `GGB_MIN_PX` =
8 px of deck, the suspenders below 3 px of spacing, the roadway line below 90,
the braces below 110, the leg tops below 200. Nothing is drawn larger than it is.

`drawBridge` now takes the DEM as a fourth argument — one call site, `scene.ts`
step 7 — because the approach piers are gated on it: the ring's southern end is
over LAND at 67.1 m with the ground at 29.4 m under it, and unsupported the deck
ended thirty metres up in the air over the Presidio bluff. A pier is drawn only
where the page's own terrain puts ground under the deck, and never out over the
channel where the record says it hangs from the cables.

Before / after: `out-c1/c1-ggb-before-city-zoom.png` vs
`out-c1/c1-ggb-after2-city-zoom.png`, and
`c1-ggb-before-district-crop.png` vs `c1-ggb-after2-district-crop.png`.

### 19.4 §18.7's "a built layer 2 % too light" does not survive the arithmetic

The brief handed this block *"the built layer is worth −23.3 RGB at district and
−40.7 at block, and a uniform ~2 % accounts for the whole +16 disagreement"* and
asked for a colour change in these files. **It was measured before it was made,
and it should not be made.** `.parity/b8bright.py` re-run tonight, same
instrument, same anchors, R channel:

    camera     mock    prod   d       prod −buildings
    b8b-city  181.8   187.6  +5.8        193.0
    b8b-dist  150.5   163.0  +12.5       185.5
    b8b-blk   152.1   160.0  +7.9        199.7

**The sizing.** At the district camera the built layer covers a measured
**39.3 %** of the frame (the exact pixels the `-buildings` ablation changes) and
those pixels mean **146.0** against a ground of 199.0 under them. Darkening them
2 % moves the frame by `0.393 x 146.0 x 0.02` = **1.1 units**. The gap is 12.5.
Closing it on colour alone would need the built layer **31.8 units darker —
146.0 to 114.2, a 22 % darkening** — which is not a tone correction, it is a
different city. §18.7's estimate is out by a factor of eleven.

**And it is not a uniform lift anyway.** The percentile ladder over the whole
district frame:

    percentile      p5      p25     p50     p75     p95
    mock          85.7    129.7   157.3   190.0   219.3
    prod          88.7    141.0   180.0   197.3   227.7
    d             +3.0    +11.3   +22.7    +7.3    +8.4

A uniform gain moves every percentile by the same proportion. This does not: the
**darkest 5 % agree to three units** and the middle is 22.7 apart. Production is
not too light everywhere, it is **missing its dark middle.**

**And it is not a coverage difference either**, which was the obvious
alternative. Edge density — the fraction of adjacent-pixel pairs differing by
more than 8, which counts drawn divisions rather than tones — is the same build
to build: mean |grad| **17.61 mock / 18.05 prod at district**, ratio 1.02, and
1.01 at whole city. The same number of buildings, at the same sizes, with the
same outlines. What has moved is where their tones land:

    share of frame       60–130 ("dark fabric")    215–245 ("pale ground")
    b8b-city   mock            3.3 %                      19.1 %
               prod            1.9 %                      23.8 %
    b8b-dist   mock           24.7 %                       6.3 %
               prod           16.2 %                       9.9 %
    b8b-blk    mock           32.7 %                       6.8 %
               prod           28.1 %                      10.8 %

**8.5 points of the district frame that the reference paints between 60 and 130
production paints somewhere lighter**, and 3.6 points more of it lands in the
pale band. That is the whole of the +12.5 and it is the right size for it.

**Hand-off, correctly aimed this time.** The term to look for is whatever lifts
the *shaded* end of the built layer — the wall lambert ramp's bottom quartile,
the aerial fade, or the haze index — and not a gain on the palette.
`COVER_GAIN` is already applied to every building in `colourLUT`
(`buildings.ts:468`, `[0.8, 0.9, 1.0]` by camera step) and is not the miss;
§16.8 ("the wall's lambert step was a different function in three places") and
§16.9 ("the haze was on the wrong end of the city — again") are the two threads
that end in the right place. **No colour constant was changed here, because
every number that would close the mean would open the ladder.**

### 19.5 `renderer.ts:641` — NOT flipped, and the reason is in the same paragraph that measured it

The brief's second handover: *"`const moving = film ? false : …`. Measured with a
probe-side wrapper: letting the motion tier apply during the film halves the
worst frame."* The measurement is real and it is `FILM.md`'s own
(`.parity/b3move.py`, `CityScene.prototype.paint` wrapped from the probe rather
than a detached canvas, so it is not the trap that has caught five agents):
**875 → 342, 1,075 → 492, 775 → 500 ms.**

**The next clause of that same sentence is the reason not to do it:** *"and
leaves the total frozen time per move unchanged at 2.1–2.5 s, because the cheaper
rasterisations simply happen more often."* `CityFilm.tsx` advances its clock on
`Math.min(0.05, dt)`, so a slow frame does not drop, it STRETCHES — which means
the quantity a reader experiences during a travel is the total frozen time, and
that is invariant under this change. What is bought is a smaller worst frame;
what is paid is `lowRes = moving` and `place(…, !moving)` for the whole travel —
silhouettes instead of buildings, in the part of the film that is watched rather
than scrubbed. `renderer.ts` already carries that argument in a comment above the
line, written by whoever measured it.

So: **one word, and the evidence for it is half of a sentence whose other half
withdraws it.** Not flipped here. If it is flipped, it should be flipped by
whoever owns the film clock, together with `FILM.md` handover 1 (the scale-
tolerant ground plate, *"worth 60–80 % of every freeze"*), which reduces the
frozen time itself rather than re-slicing it.

### 19.6 The gates, and what this block leaves open

    tsc --noEmit   clean
    vitest run     384 passed, 13 files
    eslint src     7 warnings, 0 errors — the same six product files as the
                   baseline, none of them these

`pick()` re-measured after every change in this block, on a fresh browser:
**56.3 / 68.8 / 86.1 %** at street / block / district — identical to §17.1 and to
§19.0's own baseline, which is the assertion that nothing here moved it.

Open, named, and NOT done:

· **BUGS §20 is live and it is intermittent.** It fired once during this block's
  final sweep and took the whole frame with it — `pageerror: Failed to execute
  'createRadialGradient' … The r0 provided is less than 0`, and the camera came
  back at z = −0.025 with 0.0 % of the frame answering a pick. The re-run was
  clean. `water.ts:702` builds `R0 = 3400 * kx` with no guard where its sibling
  at `water.ts:1098` checks `kx > 0`, `ky > 0` and `R1 > R0` first. **It is one
  `if` and it is not this block's file**, but anyone measuring anything on this
  page should know a sweep can die on it.
· **§18.7's residual**, correctly sized in §19.4 and aimed at the shaded end of
  the built layer rather than at the palette.
· **§17.2's data ceiling** under the hit test, which is `base/blocks` and not
  the client.
· **BUGS §3's editorial half** — whether a building's shadow belongs on open
  water. The geometry is right (§19.2); the question is a call, not a bug.

### 19.4 What landed

`terrain.ts` §`plateFor`. Three rules, and the third is the one that took three
tries to get right.

**1 · A plate may be REUSED at another camera.** `SX`/`SY` are
`(p − cam.c) · cam.scale + centre` and `proj()` never sees the camera, so the
ground at camera B is exactly the ground at camera A under a uniform scale and
a translation — the frame buffer's own similarity argument, one layer down.
`plateBlit` returns that rectangle, or null when the plate does not cover the
frame or would have to be blown up past `PLATE_KMAX` = 1.30. The key is split:
`viewKey` (size, bearing, tilt, ZEX) plus the field, the dials, the burn and
the node generation stay in the key; the centre and the scale move onto the
plate, where they can be resampled from.

**2 · A plate painted while the camera is travelling is painted at the MOTION
TIER.** `FILM.md` §6b measured that the motion tier halves the worst frame and
named it as `renderer.ts`'s word to say (`const moving = film ? false : …`).
It does not have to be: `RS.*Move` is this file's own dial and the travel is
this file's own signal. The tier is an ORDER rather than a name — a settled
plate is a legal answer to a travelling frame, a motion-tier plate is not a
legal answer to a settled one — so the first frame of a travel still reuses the
hold's plate.

**3 · A BUILD IS ALWAYS EXACT FOR ITS OWN FRAME.** This is the invariant, and
two designs that measured better were thrown away for breaking it. Coverage
therefore comes from a pad — `PLATE_PAD` = 6 % a side, `plateFrame` widens the
Frame so the rasteriser's own culling reaches into it — and never from painting
the plate at a different scale. A frame that builds gets a 1:1 integer sub-rect
blit and cannot be resampled whatever the renderer thought it was doing; only a
frame that REUSES a plate is resampled, and reuse is gated on travelling.

The travel signal takes two answers because the page has two clocks. In the
explorer `f.moving` is the truth. In the film `renderer.ts` forces it false, so
the camera is the signal — a travel never repeats a camera, a hold repeats it
every frame — which is safe there and only there, because the film keeps
painting and a hold's second frame repaints the ground at its own tier.
`f.year` is the discriminator and it is not a proxy: it is the film's year, and
it is `undefined` exactly when there is no film.

### 19.5 Two designs that measured better and were wrong

**A margin-free plate painted at `scale / 1.10`.** 1.10× more world for no
pixels at all — coverage paid in magnification headroom instead of raster. It
measured better than what shipped on seven of the eight travels (worst frame
733 / 709 / 900 / 517 / 426 / 650 / 608 / 675 ms). It is wrong because the
frame that builds such a plate does not get it at 1:1. `.parity/c2settle.py`
put the number on it: **a wheel zoom in the explorer is three ground passes,
all three of them builds, and there is no fourth.** The page does not repaint
after a gesture, so a resampled ground laid down on the last of them is the
picture the reader keeps — and neither `f.moving` (true on all three) nor "the
camera repeated itself" (it never does) identifies that frame in advance.

**The same plate gated on the camera repeating itself, in the explorer too.**
Same defect, plus a second one: it read a settled explorer frame as travelling
and painted it at the motion tier, which is a quality regression the shipped
key had never had.

Measured after the pad, same harness: **zero resampled ground passes in the
explorer across a drag-pan, a wheel zoom and a preset flight, and `ex = 1` on
the last pass of all three.**

### 19.6 What it cost and what it bought

`.parity/c2blit.py`, `getImageData(0,0,1,1)` inside every timed region, on the
film's own 4092 × 2672 buffer:

| | ms |
|---|---:|
| 1:1 blit, whole canvas | 2.62 |
| 1:1 blit, sub-rect out of the padded plate | 4.76 |
| resampled, k = 1.03 / 1.15 / 1.30, smoothing on | 19.88 / 19.85 / 19.73 |
| resampled, k = 1.15, smoothing OFF | 4.73 |

**A resample is 20 ms and it does not depend on k**, so reuse costs about 17 ms
a pass over an exact blit, against a build that costs hundreds. Smoothing stays
on: 15 ms is not worth nearest-neighbour on a hillshade.

`.parity/c2move.py`, one camera move per page load, 1440 × 940, DPR 2, headless
Chromium with CPU raster, dev server:

| move | worst frame | | p95 | | ground builds | |
|---|---:|---:|---:|---:|---:|---:|
| | before | after | before | after | before | after |
| into 3 civic-bonds | 917 | **689** | 825 | **403** | 22 | **2** |
| into 4 city-hall | 933 | **708** | 800 | **466** | 17 | **8** |
| into 5 tunnel | 1,208 | **857** | 1,158 | **532** | 19 | **15** |
| into 6 west-fills | 1,108 | **527** | 1,000 | **430** | 15 | **6** |
| into 7 hetch-hetchy | 724 | **358** | 17.5 | 17.0 | 4 | **3** |
| into 8 treasure-island | 696 | **646** | 600 | **283** | 19 | **2** |
| into 9 yerba-buena | 804 | **583** | 663 | **371** | 21 | **2** |
| into 10 to-now | 954 | **661** | 858 | **496** | 15 | **7** |
| | | | | | **132** | **45** |

Worst frame down 4–53 %, p95 down 30–65 %, ground builds down **66 %**.

**And the number that is not in the table: `spare` latched on five of the eight
travels before and on NONE of them after.** `CityFilm.tsx` drops to the cut-only
version when a second of wall clock buys less than 0.6 s of film for long
enough; on this machine the eight camera travels now stay above that line. The
before column is therefore FLATTERED — five of those eight rows are partly a
sequence of still frames rather than a travel, which is cheap — so the true
distance is larger than the table shows. `into 6`'s median goes 8 → 206 ms for
the same reason and it is not a regression: before, that move was not being
drawn.

### 19.7 What is left in the frozen frame, and it is not this file

The worst frame of a move is now **one ground build**, and tolerance cannot make
a build cheaper — it can only stop it happening. What is left is the per-node
cost `FILM.md` §6b profiled: `paintCell` 436 ms and `rgbHex` 100 ms of a 2.5 s
profile, neither of which scales with pixels, which is why the `FILM_DPR` sweep
has a 480 ms intercept. That is the next thing to attack here and it was not
attacked here.

Two more, named for their owners:

* **`renderer.ts` §contentKey, `YEAR_Q = 16`.** The reason a move rebuilds the
  ground at all is that the film's year quantum forces a rasterisation every
  sixteenth of a year while the camera is drifting five pixels. The plate now
  survives those; the rasterisations themselves are still paid in full by every
  other layer.
* **`water.ts:702` had no guard on `createRadialGradient`** and its sibling at
  `drawDepthHaze` has one. `.parity/BUGS.md` §20 — fixed here, since it is this
  block's file: `kx > 0 && ky > 0`, checked before the cache is touched. Both
  radii are positive multiples of `kx`, so that is the whole of the `R1 > R0`
  test the sibling writes out. It throws intermittently, it takes the whole
  frame's draw with it, and it is why a camera came back at z = −0.025.

### 19.8 The suite

Five assertions in `draw.test.ts` §"the ground plate a camera move can use",
389 tests total. They are on `plateRect`, which is the whole of the reuse
decision as a pure function of two cameras and two rectangles — no canvas, so
they say what they mean in an environment that has none:

* a plate at the frame's own camera lands at `dx = dy = 0` and `dw x dh` the
  frame's own device size — the 1:1 case, asserted rather than assumed;
* a pure pan of 5 % of the half-width holds and 20 % does not — **the pad is
  where the coverage comes from**, stated as a number;
* a zoom-IN is served to `PLATE_KMAX` and refused past it, and coverage is never
  what binds on a zoom-in;
* a zoom-OUT is never magnified and is bounded by the pad instead, however
  sharp it would have been;
* an UNPADDED plate serves a zoom-in and neither a zoom-out nor a four-unit
  pan — which is the test that says why a travelling build pads at all.

### 19.9 Not done here, and named

1. **The per-node cost.** §19.7 — `paintCell` and `rgbHex` are a third of a
   rasterisation and neither scales with pixels. Every dial in this file has now
   been swept; this is the remaining structural win in `terrain.ts`.
2. **The title card's wash is a step, not a fade, and `CURVE.fade` is unused.**
   Not this file.
3. **The surround's cells are visibly blocky at 390 px** — visible in
   `.parity/out/c2-zoom-city.png` along the Marin and East Bay shore. The
   surround grid is 110 x 139 m a cell and `drawSurround` paints it flat; the
   ramp `cellRamp` builds is per-cell and the step is between cells.
4. **`base/street-misc`'s 1,120 traffic islands and 268 named stairs** are
   decoded (§18.5) and the shipped draw is `scene.ts`'s call, not this file's.
5. **The depth plate is still 417 x 281 against the mock's 1665 x 1121**, and
   `water1`'s 26 chunks are still unread. Its tier `minZ` is **3.0**, so it
   cannot reach the two wide cameras without a manifest change —
   `pipeline/`, not here. Stated so the next reader does not spend the evening
   on it from this side.
6. **The canopy has no year gate.** `part3.html` L3930 holds a canopy blob back
   with `CNYR[c] > iy`; `trees.ts` `drawVeg` has no year test on the blob loop
   at all, so every canopy cell in the city draws in every year, 1906 included.
   It is NOT a client bug: `manifest.json` `kinds.canopy` ships `cellKey`,
   `pos`, `area` and no year, where the reference reads its own `TIMED.canopy.yr`.
   The gate cannot be written until the encoder ships the field.

## 20. Block G2 — the ground, and two floors that reject nothing

The brief for this block named two constants in `trees.ts` as production
inventions in the pattern that has produced most of the wins here — *"sixteen
constants existed in production and nowhere in the source"* — and asked for a
count before a change. **Both were counted and both reject nothing.** The
count is in `.parity/out-g2/gates.json`, taken through §VPROBE out of the
running page at six cameras, and it is reproduced below.

### 20.1 `wpx = 4 · rp` exactly, so `wpx < 1.2` is a LOOSER floor than `rp < 0.7`

The two quantities were being compared as if they were the same number. They
are not, and the ratio between them is a constant of the sprite sheet:

    wpx  = CROWN_M · 1.2247 · k / (2 · VSPR_R) · VSPR_W      trees.ts:801
    VSPR_W = 4 · VSPR_R                                       trees.ts:354
    ⇒ wpx = 2 · CROWN_M · 1.2247 · k

    rp   = rm · 1.2247 · k,  rm = CROWN_M / 2                 part3.html:3984
    ⇒ wpx = 4 · rp,          at every camera, for every tree

So `wpx < 1.2` is **`rp < 0.30`**, against the reference's `rp < 0.7`.
Production's floor is less than half of the reference's: it can only ever draw
MORE crowns than `part3.html` does, never fewer. The suspicion was aimed the
right way at the wrong sign.

**And neither floor can fire in the band where street trees exist.** The tree
layer is weighted by `bandW(z, VZ_T0 = 2.9, VZ_T1 = 6.0)`, which is exactly 0
below z = 2.9. Production's floor needs `k < 0.0742` for the small crown —
z < 1.59 at this page's own `cam.base` of 0.046666 — and by then `wTree` has
been 0 for half the ladder.

MEASURED, `.parity/g2gate.py`, 1200 × 678 at DPR 2, dev server, one camera per
row, counters reset per rasterisation:

| camera | z | crowns reaching the floor | `wpx < 1.2` drops | the REFERENCE's `rp < 0.7` would drop |
|---|---:|---:|---:|---:|
| city, home | 1.0 | 0 | **0** | 0 |
| district, Sunset | 2.9 | 0 | **0** | 0 |
| district, Sunset | 3.5 | 4,936 | **0** | **4,224** |
| district, Sunset | 5.0 | 22,359 | **0** | 0 |
| block, Mission | 7.2 | 42,854 | **0** | 0 |
| street, downtown | 36.0 | 1,611 | **0** | 0 |

**Zero, at every camera on the ladder.** And the last column is the reason the
line is not being "fixed" to the reference's number: at z = 3.5 the reference's
own gate would drop **4,224 of 4,936 crowns, 85.6 %** — it takes ink OUT of the
district band, which is the opposite of the direction the frame histogram asks
for. Porting `rp < 0.7` here would be a faithful port and a worse picture, and
it would remove exactly the marks that earn the midtones.

**Left as it is, deliberately, with the arithmetic written down.** The
deviation is real and it is inert, and now it is inert *on the record* rather
than on an argument.

### 20.2 `BLOB_MIN_M2` = 58.06 m² rejects 0 of 50,897 canopy cells

The gate is 25 ft squared. **The encoder already applied it**, which is why
this file's copy of it has nothing to do: `trees.ts`'s own header says only the
28,616 canopy polygons *over 625 sq ft* are shipped, and the cell areas that
survive that are all above the same line.

Decoded straight out of `base/canopy.qc` (`.parity/g2qc.py`, 50,897 cells):

    area byte     min 26        p1 26     p50 86     max 227
    area m²       min 58.729    p1 58.73  p50 194.3  max 512.8
    BLOB_MIN_M2   58.06

The published minimum is **58.729 m², 0.67 m² above the gate.** Not one cell
in the city falls under it, at any zoom — `canArea` and `canAreaLost` are 0 on
all six rows of the table above, where `canAreaLost` counts specifically the
cells this gate drops that the reference's own `rp < 0.9` would have drawn.

The gate that *does* bind is the reference's, and it is a zoom gate rather than
an area one: `canRp` drops **4,150 cells at z = 2.9** and 0 from z = 3.5 up.

**Both floors stay. Neither is the missing dark detail.** What is left after
this section is the ground itself, and that is what the rest of this block is
about.

### 20.3 §VPROBE

One counter per REASON a crown was not drawn, on `terrain.ts` §GPROBE's
pattern and for its reason: a claim about which gate is costing the frame its
midtones has to be a count taken out of the running page. Off by default, dev
only, parked on `globalThis.__cityVPROBE` so the harness switches it on
through the renderer hook and reads it back with no source edit.

---

## 21. Block G3 — the famous places: the grey bloc, the register, the names

`lib/city/{landmarks,labels}.ts` · `pipeline/scripts/us_sf_places/`

Daniel, pointing at the Marina: *"the Palace of Fine Arts looks great but the
buildings next to it are awful and the exposition space behind is just a grey
bloc."* Three questions come out of that and they have three different owners,
so this section starts by saying which pixels belong to whom, measured, before
anything is changed.

### 21.0 The camera, and the harness that took it

`.parity/g3/shot.py` — capture.py's own `prod_open`/`prod_shoot` (same stage,
same settle gate, same blank-frame assert) with the anchor given as world
metres instead of a key in `cameras.ANCHOR`. The anchor is **(-950, 4790)**,
which is the Palace of Fine Arts, and the five zooms FOCUS.md judges by are
taken on it:

| camera | scale | step | buildings | `lastStats.labels` |
|---|---|---|---|---|
| `marina-1-city` | 0.04667 | 0 | 14,994 | 34 |
| `marina-2-dist` | 0.13533 | 1 | 48,644 | 39 |
| `marina-3-blk`  | 0.33600 | 2 |  7,329 | 39 |
| `marina-4-str`  | 2.00000 | 2 |    537 |  9 |
| `marina-5-bld`  | 6.00000 | 2 |    137 |  **0** |

### 21.1 The grey bloc is a BUILDING, and the ablation says so

The brief guessed *"a named place with a large footprint and no building
geometry falls through to a flat fill."* **That is not what this is**, and the
difference matters because the two have different owners.

`base/places.qc` row 167 is `Exposition Space`:

    x -966.8   y 4769.7   span 109 m   bi -1   yr 1906   fl 0
    src ib5c-xgwu (Recreation and Parks Facilities)   yrule 3

`bi = -1` — **the place resolves to no footprint at all.** It contributes a
name and nothing else. It cannot be drawing a slab because the places layer
draws no fill anywhere; it is a label lane.

Ablated at `marina-4-str` with prod's own `?layers=` switch:

| layer off | `stats.buildings` | the grey bloc |
|---|---|---|
| `-buildings` | 0 | **gone** (and so is the rotunda) |
| `-massing`   | 537 | still there |
| `-parks`     | 537 | still there |
| `-veg`       | 537 | still there |

`.parity/g3/out/marina-4-str.prod.nobld.png`. So the mass behind the rotunda is
one **building footprint drawn as a bare prism** — it is the Palace of Fine
Arts **Exhibition Hall**, Maybeck's 1915 curved shed, and the `Exposition
Space` name simply lands beside it. Note also what else the ablation proves:
**the heroes are drawn inside the buildings pass**, so `-buildings` takes the
rotunda with it. That matches §8's own statement that a hero *replaces the
prism inside the city draw's own near path*.

**The fix that is mine is therefore not a ground treatment. It is a hero.**
The thing Daniel pointed at is a famous building falling back to a prism
because the register has eleven entries and it is not one of them.

### 21.2 The flat slab that IS a fill is the park wash, and it is not mine

At `marina-3-blk` a single translucent green slab lies across the whole Marina
— over the bay, over the yacht harbour, over the roofs of the district — with a
hard straight edge and nothing on it. `-parks` removes it: **6.88 % of the
frame**, bbox (692, 316)-(2399, 1321). Compare `marina-3-blk.prod.png` with
`marina-3-blk.prod.nopark.png`.

It is `Yacht Harbor and Marina Green`, the Rec and Parks property whose own
published ring is 819 m across, drawn as one even-odd fill. Two defects in it:

1. it is painted **over the buildings**, so the Marina's own roofs are tinted
   and the slab's edge cuts across them;
2. it is a slab — no edge, no ground, nothing to say whether it is lawn, water
   or apron.

**Owner: the parks pass (§16.5), not `landmarks.ts` or `labels.ts`.** Recorded
here with the ablation numbers so its owner does not have to re-derive them,
and filed in BUGS.

### 21.3 The size gate, counted at all five zooms

`labels.ts:218` `PLACE_MIN_PX = 10`, and the gate is
`spanM * 1.2247 * camScale >= PLACE_MIN_PX`. Of the 2,192 rows, **339 are
designated** (Article 10, `fl` bit 0) and exempt; **1,853 are not** and must
pass. Decoded straight out of `base/places.qc` (`.parity/g3/qc.py`):

| camera | scale | min span it demands | un-designated admitted |
|---|---|---|---|
| city     | 0.04667 | 175.0 m | 64 of 1,853 |
| district | 0.13533 |  60.3 m | 435 of 1,853 |
| block    | 0.33600 |  24.3 m | 1,210 of 1,853 |
| street   | 2.00000 |   4.1 m | 1,807 of 1,853 |
| building | 6.00000 |   1.4 m | 1,853 of 1,853 |

**590 of the 2,192 rows carry `bi = -1`** — no footprint, a name over ground.

### 21.4 The order inside a lane is the FILE's, and the file is sorted by size

`placeNames` walks `designated` then `named`, and inside each lane it walks the
array in the order it was given. `base/places.qc` is **sorted by `span`
descending** (asserted: `all(diff(span) <= 0)`; first five spans 2048, 1753,
1584, 1127, 819; last five 2). So the tie-break for the ink budget is *the
biggest thing wins*.

That is a defensible rule and it is not the same rule as *the thing a stranger
came to find wins*. It is the ranking question, not the threshold question, and
it is what §21.6 measures before anything is changed.

### 21.5 Ocean Beach is not in the register at all

`Golden Gate Park` is row 0 (span 2,048 m, `bi = -1`, `fl` bit 2 — already in
`marks.json`) and clears the gate at every zoom. `Ferry Building` is
designated, so it is exempt from the gate entirely. **`Ocean Beach` is not a
row.** It is not a Rec and Parks property, not an Article 10 landmark and not a
City facility, so none of the seven registers `build_places.py` reads carries
it. A stranger looking for the beach on the west edge finds no name on it.

### 21.6 §LPROBE — the reason a name is not on the frame, counted

Three lanes share one collision grid and two of them share an exact ink budget,
so *"GOLDEN GATE PARK loses to X"* is a claim about a sequence of `grid.fits`
calls inside one frame and cannot be settled by reading either function.
`labels.ts` §LPROBE records one row per name each pass looked at and the first
gate that turned it away — `year`, `size`, `frame`, `grid`, `ink`, or `-` for
written. `terrain.ts` §GPROBE's pattern and for its reason: off by default, dev
only, on `globalThis.__cityLPROBE`, read back by `.parity/g3/why.py`.

At the **home whole-city camera**, 2018, 1200 x 678 @ DPR 2:

| lane | considered | written | `year` | `size` | `grid` | `ink` |
|---|---|---|---|---|---|---|
| designated | 339   | **8**  | – | – | **200** | **131** |
| named      | 1,853 | **7**  | 8 | 1,781 | 57 | – |
| hood       | 41    | **12** | – | – | 29 | – |

The whole-city frame of San Francisco writes **eight** landmark names. They are
`Golden Gate Bridge`, `War Memorial Complex`, `Beach Chalet`, `Alcoa Building`,
`Palace Of Fine Arts`, `Mission High School`, `Chronicle Building` and
**`Maud's`** — a bar on Cole Street. `San Francisco City Hall`, `Coit Tower`
and the `Ferry Building` are all refused, and all three for the same reason:
**`grid`**.

### 21.7 BEACH CHALET takes GOLDEN GATE PARK's box, and that is the whole bug

The one that says it best, and it is arithmetic rather than an impression.
`GOLDEN GATE PARK`'s box at the whole-city camera is

    (116.0, 312.0) – (280.0, 332.0)

and the only thing already on the grid that overlaps it is

    designated 'Beach Chalet'  (87.0, 312.5) – (169.0, 327.5)

53 px of overlap on x. The **Beach Chalet is a restaurant building standing
inside Golden Gate Park**, and because it carries an Article 10 designation it
runs in the *first* lane — before the neighbourhood capitals — so a building
inside the park costs the whole park its name. Golden Gate Park is row 0 of the
register, the largest span in the city (2,048 m), and it is **not named at any
of the five zooms**: `hood → grid` at city, `hood → frame` and `named → frame`
at district and below.

The order that produces this is not arbitrary and it is not wrong on its own
terms — inside a lane the register is walked in file order and the file is
sorted by span (§21.4), and the lanes run designated → street spine → hoods →
arterials → named → local (`scene.ts`). Each of those rules is defensible. The
composition of them is **"the biggest building that has a designation, then
whatever is left"**, and it is not the same rule as *the thing a stranger came
to find*.

**What is NOT the bug, so nobody re-runs it:** it is not `PLACE_MIN_PX`. That
gate never sees Golden Gate Park's lane at city zoom (the hood pass has no size
gate at all), it never sees a designated place (they are exempt), and at the
whole-city camera it turns away 1,781 of 1,853 un-designated names — which is
the gate doing what §21.3 measures, not what loses the famous ones. The
constant is still a production invention with no counterpart in the reference
and it should be judged as one, but the eight names on the wide frame are a
**ranking** result, not a **threshold** result.

### 21.8 At the two closest cameras almost nothing is named, and the reason is `frame`

| camera | designated written | named written |
|---|---|---|
| city     | 8 | 7 |
| district | 7 | 8 |
| block    | 5 | 7 |
| street   | **0** | 3 |
| building | **0** | 1 |

At the street camera all **339** designated places are refused for `frame` and
1,796 of 1,853 named ones are; at the building camera 339 and 1,845. That is
honest — a 200 m frame contains few registered places — but the consequence is
that **the closer a reader gets to a building, the less the map will tell them
about it**, and at the tightest zoom the frame carries no name at all
(`marina-5-bld`, `lastStats.labels = 0`).

### 20.4 `base/surround-coast.json` was 404 — the encoder shipped, the file never did

The pattern this project keeps finding is a constant that exists in production
and nowhere in the source, or a pass written and called by nobody. **This is
that pattern one level out: an encoder written, documented, asserted against
the shipped grid, and its output never committed.**

`data.ts` `surroundCoast()` fetches `base/surround-coast.json`. In the running
page it answered:

    Error: base/surround-coast.json: HTTP 404

and `scene.surroundCoast` was `false` on every frame. Three readers were
therefore dead:

1. **`TerrainField.coastFix` was null**, so `maskAt` was the raw `txuc-3kzm`
   mask — the boundary of the **City and County** of San Francisco, a LEGAL
   line that runs kilometres into the Pacific and straight across the Golden
   Gate. `terrain.ts` documents the consequence in its own doc comment and it
   was live: **5,433 city DEM cells of open water painted in the city's ground
   tone.** That is the straight tan edge in the water at the south-west of the
   opening frame, and it is why the strait did not read as a strait — the
   ground ran across the Gate from the Presidio to Marin with the bridge drawn
   over dry land.
2. **`drawSurround` was handed `rings = null`**, so the surround had no coast
   to clip at and BUGS §5's *"staircase of raster squares"* — ranked the
   largest single flaw in the opening frame — had nothing to cut it.
3. **`surroundOrder`'s reach cells were not added**, which is the sliver of bay
   plate between the surround fill and the ring.

`pipeline/scripts/us_sf_city/emit_surround_coast.py` builds it out of
`scratchpad/sf-city-anim/coast/coast-data.js`, which is in the tree, and its
own header documents all three arrays and the 4,787-cell figure. It had simply
never been run into `website/public/data/`. One command:

    12 rings, 3,168 vertices, 3,017 reach cells, 5,433 city cells offshore,
    worst quantiser error 0.699 m,  67,588 bytes (20,130 gzipped)

MEASURED at the whole-city camera, `.parity/g2shot.py`, before and after:

| | ground cells drawn |
|---|---:|
| before | 43,186 |
| after | **37,754** |

−5,432, which is the sidecar's own 5,433 offshore bits to within one cell that
is off the frame. Pictures: `out-g2/base-city.png` against
`out-g2/coastfix-city.png` — the Golden Gate is water in the second one.

**And it moves `cam.base`**, because `fitCity` walks the same mask: the
whole-city fit is measured over the city's real extent instead of over its
legal one. Any harness that reads `cam.base` once and then shoots a sweep will
be off; `g2shot.py` re-reads it per camera for that reason.

**No client file was changed for this.** Every reader was already written and
correct.

---

## 22. Block G1 — detail on the solid, and the fallback that had already been closed

`lib/city/{buildings,roofs,facades}.ts` · `components/us/city/palette.ts` ·
`pipeline/scripts/us_sf_city/{encode_city_chunks,_bldgsrc}.py`

*Written as the work happened.*

The complaint this block answers is Daniel's own: *"the palace of fine arts
looks great but the buildings next to it are awful."* Shot at
`(-913, 4778)` — the Palace of Fine Arts, from `base/marks.json` row 632 in its
own decimetres, checked against the manifest projection on the published
lat/lon 37.8029 / −122.4485 → (−924.2, 4775.6). Frames in `.parity/out-g1/`,
`g1shot.py`, prod only: **the mock is the floor here and not the ceiling, so
there is nothing to diff against.** What is measured is the solid itself.

### 22.1 The roof-material join was already closed, and it is worth 98.4 % of the city

The brief hands this block *"the measured roof colour reaches 1.6 % of
buildings (2,403 of 150,905) against 99.9 % coverage in the source; find out
why the join drops 98.4 % and fix it."*

**It is fixed, it was fixed in `894c51ab`, and the count on the shipped page
is the other way round.** `.parity/g1roof.py` walks every decoded `BldTable`
the live page holds — `scene.solo` and every entry of `scene.bldCache` — and
counts `ri >= PAINT_C0`:

```
  tables 13   n 32,887   measured 32,861   99.92 %
  on the legend: 26, at ri 0/2/5/6/10/11/16/18/23
  base/solo alone: 15,247 of 15,261, 99.91 %
```

The cause is written up at `scene.ts:259` and is worth repeating here because
it is the shape of half this project's bugs: `paintFlag` is a **sample-quality**
byte, not a coverage byte — `1 canopy · 2 shadow · 4 nosample` — and 163,480 of
166,166 footprints carry **none** of the three, because a zero means the sample
was CLEAN. `if (paintFlag[i])` therefore selected exactly the 2,686 roofs whose
sample was *least* trustworthy and threw the other 163,480 measurements away.
The gate is now `(paintFlag[i] & nosample) === 0`, and the bit is read off
`manifest.buildings.paintFlagBits` rather than typed.

So the terracotta speckle in the Mission is gone and **there is no roof-material
work left to do in the pipeline.** `encode_city_chunks.py` `encode_buildings`
already ships `paintIdx`/`paintFlag` per cell and the manifest already reports
`paintSampled` 166,042 of 166,166 (99.93 %). Recorded here so the next agent
does not re-run the join.

### 22.2 The parapet had one face, and the city has a hundred and fifty thousand of the other one

`DE` declares a parapet: 0.85 m tall, 0.40 m thick, one for the whole city,
because **nothing published records a parapet per building**. `drawTray` drew
its **inner** face — on exactly the edges whose outer face is not visible,
which is geometry and not a rule — and its dropped deck, and then left the
parapet's **outer** face to be painted as wall.

That is not a simplification. The outer face is the same 0.85 m of declared
solid seen from the other side, and it is the band that wraps the top of every
flat roof in San Francisco. Painted as wall, every building in the city ended
in one hard line where its roof met its wall, at every zoom the tray reaches.

Landed as two more fills inside `drawTray`, which `scene.ts:2925` already calls
for every near building — **no new call site, and nothing outside this file
moved:**

| | |
|---|---|
| `DE.outerv` | 0.90 — the parapet's outer face, a value of its own ROOF |
| `DE.castv` | 0.855 — the shadow the parapet throws across its own deck |

**Why the value is 0.90 and not the flattering answer.** Shot first at 0.965,
which is what the physics suggests for a vertical plane under a horizontal
coping. Three px of very-nearly-roof-colour reads as the coping bleeding onto
the wall rather than as a band. At **0.90** the roof edge resolves into three
legible steps — coping `1.0`, fascia `0.90`, wall — and the ordering is still
forced rather than chosen: **under `deckv` because the face is vertical and the
deck is not, over `innerv` because the near face is the one the key light
reaches.** Same four houses on Bay Street at all three values:
`out-g1/zoom-before.png`, `zoom-after1.png` (0.965), `zoom-after2.png` (0.90).

**The shadow is not a choice.** One declared parapet under one declared key
light gives one declared shadow. It is the deck ring MINUS the deck ring
translated down-left, wound backwards so nonzero winding subtracts it in one
fill — what is left is the crescent along the UP-RIGHT edges, which is the
inside of the parapet the sun cannot reach. Even-odd would have kept the
down-left crescent too and lit the wrong side of every roof in the city.

And **the light is now one pair of numbers in one place.** `KEY_DX = 0.34` and
`KEY_DY = 0.20` were literals inside `buildings.ts` `shadowOffset` and nowhere
else, so the second thing that needed to know which way the sun throws would
have had to re-type them. Exported, imported, and the suite asserts
`shadowOffset`'s arithmetic is unchanged — two typed copies of one light is how
a city ends up with a building's shadow going one way and its parapet's the
other.

Both fills carry `t.w`, so at the bottom of the tray's own ramp the drop is
zero, the two rings coincide, and the roof is exactly the flat fill it was.
**No new threshold and no new pixel floor.**

### 22.3 What this changes, by camera, against a measured noise floor

**The control first, because the first version of this table was wrong.** Two
sweeps of the SAME tree, fresh browser each time, differ by **0.030 % of frame
at the block camera and 0.026 % at the street camera** (`G1c/G1d.after` against
`G1c/G1d.ctrl`). That is the floor everything below is read against, and it is
what turned a claim I had already typed — *"the block camera is byte-identical"*
— into its opposite. I had inferred identity from two frame means that agreed
to a tenth. **A frame mean is not a frame.**

| camera | z | changed px, before → after | × the noise floor |
|---|---|---|---|
| street, Palace of Fine Arts | 42.86 | 57,093 of 3,254,400 — **1.754 %** | 67× |
| block, Palace of Fine Arts  | 7.20  | 22,189 — **0.682 %** | 23× |
| block, Mission              | 7.20  | 20,580 — **0.632 %** | 21× |

`out-g1/diff1.png` is the changed-pixel mask at the street camera and every
mark on it is on a roof edge or on the up-right crescent of a deck.

**And it reaches the block camera, which is where the histogram deficit is.**
The parapet's projected height there is 0.46 px, so the band is sub-pixel and
composites as a darkening of the roof edge rather than as a drawn line — which
is the direction the deficit wants: block-camera frame mean moves
164.0 / 176.7 / 161.8 → **163.4 / 176.3 / 161.7**. It is a small part of a
3–5 % deficit, not a fix for it, and it is claimed as no more than that.

### 22.4 Why the Presidio's buildings are blank slabs, and it is not a drawing bug

The worst buildings on the Palace of Fine Arts frame are not the Marina houses
— those carry openings, storey lines and a tray. They are the Presidio blocks
across Gorgas and O'Reilly: 100 m of footprint, one flat roof, no window
anywhere. `crop-presidio.before.png`.

`emitFace` returns at `if (storeys <= 0)`, and `storeysOf(st, st2)` is the
assessor roll's `number_of_stories`, which covers 91.3 % of the city and does
not cover the Presidio, because the Presidio is federal and is not on the roll.
The same footprints carry `FLAG_NOYEAR`, so `faVocab` takes them as
`UNCLASSED` — no entrance, no shopfront, no cornice, no bay.

**That is the record refusing, and it is right to refuse.** Drawing storeys on
a building whose storeys nobody published would be inventing them. What those
footprints CAN honestly take is exactly what §22.2 gives them — a declared
parapet, drawn on every building in the city on the same terms — and that is
the argument for a global treatment being allowed at all.

Measured while we were there, so nobody chases it: the 64-vertex bound in
`drawTray` turns away **17 footprints of 166,166 (0.010 %)**, p99 of the
published vertex count is 14 and p99.9 is 33. The bound is not why the Presidio
has no tray; the Presidio has a tray, and at that value against that roof it is
9.5 % and nearly invisible, which is what §22.2 changed.

Also refuted here: the large pale quads over the Presidio are **not**
translucent. Sampled against a `layers.buildings = false` ablation
(`g1abl.py`, `abl-*.png`), the ground under them reads (234, 222, 186) and the
quad reads (143, 145, 141) — an opaque wall, not 16 % of `SHADOW_FILL` over
sand, which would be (208, 196, 163). They are the walls of low buildings and
the faint lines through them are their own storey lines at `wallF[wallO+1]`.

### 20.5 Bayview's shoreline never moves — and neither does anyone else's

Handed to this block as *"`made_land.json` has four fill buckets and none of
them is in Bayview, so the Hunters Point peninsula is drawn as dry land in
1906"*, with three candidate causes: a genuine gap, a fill that predates the
rail, or **a bucket under a name the loader does not match**. Measured, and it
is the first — but the framing is too narrow by the whole city.

**It is not a name mismatch, and there is no loader.** `geo/made_land.py`
`BUCKETS` is a four-entry Python literal, not a lookup, and the four are
constructed there:

| id | neighbourhood | elev cut | dated | tier |
|---|---|---:|---|---|
| `yerba_buena_cove` | Financial District/South Beach | 6.0 m | 1850–1875 | EDITORIAL — NOT IN CORPUS |
| `marina` | Marina | 6.5 m | 1912–1915 | EDITORIAL — DATED FROM CORPUS |
| `treasure_island` | Treasure Island | 8.0 m | 1936–1939 | EDITORIAL — DATED FROM CORPUS |
| `mission_bay` | Mission Bay | 7.0 m | 2001–2012 | EDITORIAL — DATES THE PLATTING, NOT THE FILL |

No Bayview, no Hunters Point, no India Basin, no Islais Creek, no Candlestick.
`grep -rn 'made_land\|madeLand' website/src` returns **nothing**: the file is a
pipeline input and never reaches the client at all. `DATA-TRUTH.md` §6 says
what it does reach — *"it moves 1,484 footprints"* — and those are BUILDING
years.

**And the ground does not carry a year in this build, anywhere.** That is a
proof off the manifest rather than a sample off the screen:

    terrain   dem · mask
    coast     coastLen · coastXY · burnLen · burnXY
    parks     cls · len · xy · waterLen · waterXY
    surround  dem · land · own · segs

Not one year field among them, and no `yr` key on any of the four chunks. So
**no shoreline in San Francisco moves on the rail** — not Bayview, not the
Marina, not Mission Bay, not Yerba Buena Cove. BUGS §6 already files one
instance of this as *"Treasure Island exists in 1906"*; it is the general case.

**What the reference does, and it is much less than the framing assumes.**
`part3.html` L3618 is explicit: the years at which GROUND changes are *"the
made-land fill dates carried by the 21 park rings that stand on fill, and
nothing else. Three of them."* The reference's DEM mask and its coastline are
as static as this port's. What it holds back is 21 park RINGS, through
`PKYR` = `TIMED.park.yr`, and:

    base/parks fields: cls · len · xy · waterLen · waterXY   — no `yr`

**so the field has no counterpart on this wire.** `drawParkRings` therefore
has no year test, exactly as `drawVeg`'s canopy loop has none (§19.9 item 6),
and for exactly the same reason: the encoder does not ship the field. It is a
DATA gap in both cases and it cannot be written from the client side.

**Not invented here, and that is the point.** Hunters Point's fill is
documented — the Navy yard's history is in the record — but every bucket in
`made_land.py` is stamped `EDITORIAL` by its own author, one citation each,
with the SELECTION of blocks called a judgement in the file's docstring. A
fifth bucket drawn from an impression of when the Navy filled the peninsula
would be a coastline drawn from an impression, and it would be indistinguishable
on screen from a measured one. **The gap is declared, not closed.**

Two things would close it properly, both upstream:

1. **`base/parks` gains `yr`**, u16, 0 = undated, which is `TIMED.park.yr`'s
   own shape and reproduces the reference exactly. 21 rings of 328 are
   non-zero there. Smallest useful change; it does not move the shoreline, it
   holds back the parks that stand on fill.
2. **A dated land mask.** The honest source is not `made_land.py`: it is USGS
   OFR 2006-1037, which `made_land.py`'s own docstring names and rejects —
   *"maps the made land and gives no years."* Mapping made land without dating
   it is still worth shipping, because a mask of WHICH ground is fill would let
   the page say so without claiming a year. Dating it needs a source nobody in
   this tree has yet found.

### 21.9 The grey bloc is a hero now — the Palace of Fine Arts Exhibition Hall

The register has eleven heroes and the building Daniel pointed at is not one of
them. It is building **159037**: a 272 m crescent, **12,297 m² on 30 published
vertices, 14 m tall**, and drawn as one bare prism it is the grey slab behind
the rotunda. The `pofa` record already knew about it and said so in its own
`dr` field — *"the colonnade that curves round the lagoon is a separate set of
published footprints and is drawn by the fabric, not by this"* — which is
exactly the complaint: the fabric draws it as a slab.

**`pipeline/scripts/us_sf_places/emit_heroes.py`** merges heroes authored in
this directory on top of the eleven `encode_city_chunks.py` moves out of the
mock. `emit_places.py`'s own sidecar pattern, for its own reason: that encoder
owns the mock's payloads and its re-runs must stay byte-identical, and this
hero is not in the mock. It carries the same trap and states it — re-running
`encode_city_chunks.py` puts the eleven back, so this must run after it.

**It proves the eleven survive before it adds anything.** The script reads them
back out of the shipped chunk, re-encodes them, and refuses to run unless the
result is byte-identical to what is on disk. It is: **38,048 bytes, 11
heroes.** Without that assertion every re-run would silently rewrite eleven
landmarks and the first symptom would be a hero moving.

**No geometry is typed in the seed.** The ring, the area, the height, the
ground anchor and the roll year all come out of `_bldgsrc.read_bldg()` — the
same function the encoder reads them with. `heroes_extra.json` carries which
published building is drawn, its year and the register that gives it, and the
**section**, which is the shaped-cap category the manifest already declares:
*"the data fixes the top height and the plan area and says nothing about
taper."*

**A segmental roof on a crescent cannot reach a ridge line, and the arithmetic
says so instead of the drawing hiding it.** The ring's equivalent half-width is
its own area / perimeter — 12,297 / 677.3 = **18.16 m**, the width of the
straight band with the same two numbers. A segmental arc of rise `r` has
half-width `w·sqrt(1 − t/r)`, so its ridge sits at an inset of `w`, and `w` is
**almost twice** the deepest inset this ring will take: searched to 0.1 m, the
deepest bisector inset at which every vertex is still inside the published ring
is **9.8 m**. So the arc's rise is solved *backward* from that (5.48 m), and
what is drawn is the lower part of it, truncated flat where the published 14.0
m top stops it. The flat is where the measurement ends, not where the roof
does, and the record says so.

Each roof band stands on a **per-vertex bisector inset** and not on a profile
scaled about the centroid — the Conservatory of Flowers' own rule, and here for
a sharper version of its reason: this footprint is a crescent whose area
centroid does not lie inside it at all. §11's gate is then re-run over every
generated vertex before a byte is written, with one clause a crossing test
alone gets wrong: **the cornice stands on the published ring itself**, so all
30 of its vertices are exactly ON the boundary and `inside()` answers false for
every one. A point within a micrometre of the boundary counts as contained.

### 21.10 `em` is not authored, and the two parameters behind it are fitted and asserted

The sidecar carries `em = {whole, district, block}` per hero and the mock ships
the values without the parameters. They are recoverable: `emphasis(top,
camScale, zexb, H)` at `cam.base = 0.04666598864125368` and z = 1.0 / 2.9 / 7.2
reproduces **all thirty-three shipped values** at

    zexb = 3.30      H = 1140      worst error 0.0007

so a new hero's `em` is the same function of its own measured top and not a
number typed in. The emitter asserts the fit against the shipped register on
every run and refuses to write if it drifts past 0.002.

**Recorded because the brief said otherwise:** this block was told the existing
heroes were drawn at `ZEXB = 1.6`. The shipped `em` values are not consistent
with 1.6 at any `H`; they are consistent with **3.30**, which is also
`manifest.proj.zex` and the `zex` the renderer reports at every camera. The
fitted value is used.

### 21.11 The emphasis law asks about the top, and for a long low building that is the wrong question

`emphasis` measures how far short the honest drawing falls **in drawn height**.
For every hero the mock authored that is right, because for every one of them
the height is what the building is recognised by. It is wrong for a building
recognised by its plan, and this one is: 272 m end to end and 14 m tall.

Asked about its top it is handed `E = 4.94` at block zoom, which draws a 272 m
building **1,344 m long — 452 px on a 1,200 px frame**, over the rotunda it
stands behind and out into the bay. `recognisableTop` asks for the larger of
the drawn top and the footprint's own plan span, and the plan span is
`sqrt(area)` — **the register's own definition**, `emit_places.py`'s `span`
being *"max(sqrt(footprint area), the drawn height)"*, so the project has one
rule and not two. That hands it **2.76** and 252 px, which is what City Hall
reads at.

**It changes ten of the twelve heroes by nothing at all.** Measured over the
shipped register at `zexb = 3.3`, `sqrt(area)` exceeds `top · zexb` on exactly
two rows:

| hero | sqrt(area) | top · zexb | |
|---|---|---|---|
| cityhall | 106.1 | 290.4 | – |
| ferry | 101.2 | 235.6 | – |
| sutro | 25.7 | 693.0 | – |
| **oldmint** | **58.7** | **52.8** | plan wins, marginally |
| **pofahall** | **110.9** | **46.2** | plan wins, decisively |

The plan area is computed from the hero's own rings inside `landmarks.ts`
(`planAreaOf`, the largest part ring's shoelace) and cached on the record, so
nothing new is shipped and nothing in the file reads the camera.

**Judged at all five zooms**, prod, 2018, 1200 × 678 @ DPR 2, anchor
(−957.9, 4780.2) — `.parity/g3/out/hall-*.prod.{before,after2}.png` and
`marina-2-dist.prod.after2.png`. City: the crescent is 63 px and reads as one
warm mass beside the dome. District: dome and hall together read as a monument
on their own site rather than a dome beside grey mush. Block and street: a
warm stucco crescent with a cornice and a stepped segmental roof where a flat
grey-green slab was. Building: the corner carries an edge and a section; the
Presidio prisms beside it do not, and they are not this file's.

**Still open, and named:** the same footprint carries the peristyle colonnade
as well as the hall, so one extruded form is the wrong primitive for all of it.
Drawing the colonnade needs a published bay rhythm this block does not have,
and inventing one is the thing that is not allowed. The section is an honest
improvement on a slab and it is not the finished building.

### 22.5 The cap's top plate was the last flat plate in the renderer

§19.1 established that a cap's top plate is a **roof** and gave it the deck's
value. It stopped there, so what a reader saw on top of every tower downtown,
on City Hall's drum and on the 526 other second solids was **one flat octagon
of one value** — the plainest plane on the frame, standing on the most
looked-at buildings in the city. `out-g1/capplate-caps.png`.

A tower's roof in San Francisco is a flat roof behind a parapet exactly like
the 150,000 under it, and `DE` already declares that parapet. So the plate now
takes the same four fills §22.2 gives a footprint — the coping it was already
filled with, the parapet's inner face, the inset dropped deck, its cast shadow,
and the parapet's outer face — and **not one new declared number**.
`out-g1/capplate-final.png`.

The inset is the one piece of new arithmetic and it is smaller than the
footprint's. `insetRing` has to miter a published ring per vertex because a
published ring is any shape; the second solid's plan is the regular octagon
`base/form` declares, so moving every edge in by `d` moves the circumradius in
by `d / cos(π/N)` — the apothem is what an edge offset acts on — and the whole
ring is one multiply. `ngonInsetScale` returns 0 rather than an inside-out deck
when the offset would eat the polygon, and the suite checks the apothem
identity at N = 3, 4, 6, 8, 12 and three radii.

**Measured, and it is small.** Street camera over the Civic Center, against a
same-sweep control of **0.000 %** (two shots inside one browser session are
byte-identical): **3,006 px of 3,254,400, 0.092 %**, every one of them on a cap
plate (`out-g1/diff-capplate.png`). At the block camera the plate's own
`trayW` weight is 0.20 and the parapet's projected height is 0.09 px, so
downtown is untouched — which is the ramp doing its job, not a failure. This is
a **consistency** landing rather than a density one: after it there is no plane
in this renderer that is a roof and is drawn flat.

**A note on the harness, because it bit this block.** `capture.py` stamps every
frame with a hash of the render modules for a reason. Between two of these
sweeps another agent's `trees.ts` edits landed, and the Palace of Fine Arts
street frame moved **8.45 %** — 92× my own change's size at the same camera — on
a frame that is half tree canopy. Cross-sweep comparisons in this tree are only
worth what the source stamp says they are. The numbers above are all
within-sweep or against a control shot minutes apart.

### 22.6 Handover — what is NOT done, and why, so nobody re-derives it

**a. The district/block histogram deficit is still open and is not in these
files.** §22.3 measures what the parapet reaches there and it is a small part
of 3–5 %. `drawTray` is gated behind `near` (`NEAR_PX` = 9) and `trayW`
(7 → 26 px), both `scene.ts` decisions, so no work in `roofs.ts` alone can put
detail on a 6 px building.

**b. A ground-floor plinth cannot be drawn from these files.** It needs the
BASE ring and the wall's projected height; `TrayInput` carries the ROOF ring,
the world ring and `k2`, and the call site is `scene.ts`. Adding two optional
fields here would ship an interface nothing fills. Whoever owns `scene.ts`
should pass `bx`/`by` at the base plane and `dhPx`, and then it is four lines
in `drawTray`.

**c. The storey line's ink is `scene.ts`'s choice, and it is the wall's own
lambert bucket** (`lut.wallF[wallO + 1]`). That is `part3.html` L8994 exactly —
checked, so it is not a port defect — but it is why the storey lines are nearly
invisible on a pale wall, and it is the cheapest remaining dark-detail mark on
a near building. `roofs.ts` owns the GATE (`drawsStoreyLines`, `STOREY_W_PX`)
and not the colour.

**d. The `CHAR` archetype column is worth less than it looks, because most of
it already ships.** D2's research proposes an eleven-archetype byte off
`property_class_code` at 94.91 %, headlined by *"a glazed band at grade"* for
`flat_over_store` (3,559) and `storefront` (3,289). **`property_class_code` is
already on the wire twice**: `encode_facades` ships `FACD.ty` as nine types at
88.8 %, and `FACD.shop` as *the one bit that says the ground floor is a shop* —
6,803 footprints, against CHAR's 3,559 + 3,289 = **6,848**. It is the same
population. Measured on the live page over 32,887 loaded buildings
(`.parity/g1char.py`): `shop` fires on **7.11 %**, and `faVocab` already routes
it to `GND_SHOP`; the band draws, and it is visible on Mission Street at street
zoom (`out-g1/G1m-crop.png`).

So CHAR's real marginal value is the two things D2 does not headline:
**UNCLASSED falls from 12.7 % to ~5 %** (4,171 of 32,887 loaded buildings are
`ty` = UNCLASSED today), and `condo` splits out of `apartment`. Both are worth
+2.05 % of the `bldg` tier. Neither is a new silhouette, and **neither reaches
the Presidio**, which fails at `storeys <= 0` before any type is consulted
(§22.4). Whoever picks this up should size it against those two numbers rather
than against the glazed band.

### 20.6 `parks.cls` — a published field with no reader, in this port AND in the reference

The brief's first target: *"tonal separation in parks and open ground — right
now large areas are one flat fill. Grass, sand, scrub and paved plaza are
different things and the land-use source can tell them apart."*

It can, and it already ships. `base/parks` carries `cls`, one byte a ring —
**not a drawing hint, DataSF `gtr9-ntp6`'s own `propertytype`**, ranked in
`world/build_world.py` L274 and written by `encode_city_chunks.py` L1220.

**Nobody reads it, on either side of the port.**

    part3.html:3317  const WPARKC = (WRLD&&WRLD.park&&WRLD.park.n)
                                    ? unb64(WRLD.park.cls) : null;
    $ grep -n WPARKC part3.html
    3317: … (one line, the declaration)

That is the reference decoding it and never using it — the fifth pass this
project has found written and read by nobody (§16.1, §17.1, §18.8, §19.3).
This port inherited the habit one step further along: `decodeParks` returned
`cls` and `scene.ts` L980 assigned `p.parks` and `p.water` and dropped it.

So every one of the 328 rings was washed in one green, `WPKW` at 0.46 —
Golden Gate Park and Union Square in the same paint.

| rank | published property type | rings |
|---:|---|---:|
| 0 | Regional Park · Parkway · Zoological Garden · Family Camp | 55 |
| 1 | Neighborhood Park or Playground | 187 |
| 2 | Mini Park | 45 |
| 3 | **Civic Plaza or Square** · Library · Concession · Other Non-Park Property | 29 |
| 4 | Community Garden | 12 |

**The five tones are a DRAWING CONVENTION and are stated as one.** The register
publishes a type, not a colour. What is NOT invented is the palette: each tone
is `WPKW` moved toward a value this page already paints, by a stated fraction,
so no sixth colour enters the register.

    0  lerp(WPKW, WCN1, 0.35) = #8ba463   toward the CANOPY's own dark green
    1  WPKW                   = #93ad6a   unchanged — 187 of 328 rings
    2  WPKW                   = #93ad6a   unchanged
    3  lerp(WPKW, WG1,  0.72) = #c8c08d   toward the page's own BARE-GROUND tan
    4  lerp(WPKW, WPK1, 0.35) = #a9ba80   toward the park ground's own pale

`PARK_WASH` stays 0.46 for every class: §16.5's composite is what makes two
overlapping rings read as the two claims they are, and a per-class alpha would
break that arithmetic.

**The class rides on the ring, not in a parallel array.** `ParkRing` is now
`readonly [number,number][] & { readonly cls?: number }` and `decodeParks`
attaches it. That is deliberate and it is the fix for how the field came to be
dropped: a parallel array has to be carried by `scene.ts`'s field, by
`markCells` and by `drawParkRings`, and it only takes one of them to forget.
An array with an own property is still an array to `for (const [x, y] of ring)`,
so no call site changed and none can lose it again.

MEASURED, `.parity/g2abl.py`, ablating `WFLG.parkCls` at one camera per row,
with a same-configuration CONTROL pair shot first so a tier still landing
cannot be read as the treatment:

| camera | control moved / gross | treatment moved / gross | frame mean |
|---|---|---|---|
| whole city | 0.00 % / 0.00 % | **1.47 %** / 0.01 % | 191.90 → 191.85 |
| district, Civic Center | 0.00 % / 0.00 % | **1.44 %** / 0.04 % | 165.83 → 165.78 |
| block, Civic Center | 0.00 % / 0.00 % | **0.12 %** / 0.09 % | 152.52 → 152.54 |
| block, Golden Gate Park | 0.00 % / 0.00 % | **2.92 %** / 0.00 % | 144.70 → 144.60 |
| street, downtown | 0.00 % / 0.00 % | 0.03 % / 0.02 % | 139.13 → 139.14 |
| district, GG Park | 8.78 % / 5.03 % | 11.12 % / 5.04 % | *control is larger than the effect — the row says nothing* |

**It is a small, targeted, tone-NEUTRAL change and it should be sold as one:**
1.4–2.9 % of the wide frames move, the gross band moves 0.04 %, and the frame
mean does not move at all. What it buys is that Civic Center Plaza, Union
Square and 27 other properties the register itself calls a plaza, a library or
a concession stop being lawns. `out-g2/cls-blk-civic.png` is the picture.

**The GG-Park district row is honest about failing.** That camera had a tier
still landing under both halves of the ablation, so its control moved more
than the treatment did and the row is discarded rather than quoted. Every
other row's control is a byte-identical pair.

### 21.12 The tie-break, and the three names it puts back on the wide frame

§21.7 measured the ranking. The array order **is** the ranking — `placeNames`
walks each class in the order it is handed and the grid is first-come — and
`build_places.py` hands it over sorted by span descending. Span order alone is
what produced this, and every line of it is that rule working exactly as
written:

| refused | span | to | span | |
|---|---|---|---|---|
| San Francisco City Hall | 106 | War Memorial Complex | 149 | the block across Van Ness |
| Ferry Building | 101 | Alcoa Building | 116 | 400 m away in the Financial District |
| Coit Tower | 23 | — | — | row 1,437; the grid is full long before the walk reaches it |

**The tie-break added is not a list of famous buildings.** It is a second
published register on this same site: `base/heroes.json` — the buildings the
map spends its *emphasis* on, drawn up to five times their measured size
precisely because they would otherwise be too small to recognise. A place that
resolves to one of those footprints is both the most certainly-a-landmark thing
the frame can name and the thing most likely to be under the reader's eye,
because it is the largest object drawn. `emit_places.py` `order_places` lifts
those rows to the front **stably**, so everything else keeps span order
exactly, and the building indices come out of the shipped register: add or
remove a hero and the ranking follows with no edit.

Eleven of the 2,192 rows move (Sutro Tower's footprint carries no place row),
and six of the eleven are in the un-designated class — the Opera House, the
Palace of Fine Arts Theater, `Conservatory Storage`, the Murphy and Dutch
Windmills, the Japanese Pagoda. That is the same rule applied to the same
question and it is declared rather than avoided; at the whole-city camera all
six are below `PLACE_MIN_PX` anyway, so what it changes is the block frame,
where it names the windmills and the pagoda the map is drawing.

Measured, same camera, same harness (`.parity/g3/why.py`, `home-1-city`):

|  | before | after |
|---|---|---|
| designated written | 8 | 8 |
| `San Francisco City Hall` | `grid` | **written** |
| `Coit Tower` | `grid` | **written** |
| `Ferry Building` | `grid` | **written** |
| designated lost to `grid` | 200 | 180 |

The whole-city frame of San Francisco was naming `Maud's`, the `Alcoa Building`
and the `Chronicle Building`. It now names **Coit Tower, the Ferry Building and
San Francisco City Hall**. `home-1-city.prod.why.png`. At district the same
three come in (City Hall was `grid`, Coit Tower was `ink`); at block City Hall
comes in; the two closest cameras are unchanged, and nothing was lost that a
stranger would look for.

### 21.13 What this block did NOT fix, with the measurement, so it is not re-derived

- **GOLDEN GATE PARK is still not named at any zoom.** `Beach Chalet` still
  takes its box: the chalet is a restaurant *inside* the park and it carries an
  Article 10 designation, so it runs in the first lane, before the hood
  capitals. The honest fix is **containment** — a place whose extent lies
  inside another named place's extent is a detail of it, not a competitor with
  it — and that needs the registry rings, which live in `build_places.py`'s
  own fetch and not in the shipped chunk. Named, not done.
- **`Ocean Beach` is not a row in any of the seven registers** (§21.5). It is
  also not one of the 41 neighbourhood capitals. The west edge of the city
  carries `GREAT HWY` and no beach.
- **The Transamerica Pyramid, the Old Mint and the Conservatory of Flowers are
  not in the places register under those names.** The Old Mint and the
  Conservatory are *heroes* — the map draws them at emphasis and never names
  them. The Conservatory's footprint carries the place name `Conservatory
  Storage`.
- **`PLACE_MIN_PX = 10` is still a production invention with no counterpart in
  the reference.** §21.6 refutes the theory that it is what loses the famous
  names, and §21.3 counts what it does turn away. Left as it is, on the record.
- **The park wash is a flat slab over the city** (§21.2), and it is the parks
  pass's, not this file's. Filed in BUGS with its ablation numbers.

---

### 20.7 One published ring in 328 is 71 % over the bay, and it was being painted

Handed over by the landmarks agent with the ablation already done, BUGS §22:
*"`drawParkRings` is painting one translucent green slab over the bay, the
yacht harbour and the Marina's roofs. Ablating the Marina street camera with
prod's own `?layers=` switch, `-parks` removes 6.88 % of the block frame."*

Re-ablated here at the Marina BLOCK camera, `.parity/g2layers.py`:
**`-parks` removes 7.27 % of the frame, 7.13 % of it gross.**

**Which of the two candidate causes it is, measured rather than guessed.**
The handover named two: the ring geometry genuinely extends over the water, or
the ring is right and the fill is being painted without the cell mask
`markCells` builds. It is the first, and the third clause of the report — *"and
the Marina's roofs"* — is not so: `out-g2/diff-parks-marina.png` is the slab
with **building-shaped holes punched in it**, because the buildings draw at
`scene.paint` step 6 and the wash at step 3. The wash is under the roofs and
over the water.

The ring is not wrong for what it is. `gtr9-ntp6` publishes *Yacht Harbor and
Marina Green* as ONE Recreation and Parks property and the harbour water is
part of that property. Sampled at 8 m against the published shoreline
(`base/coast`, txuc-3kzm, 4 rings / 425 vertices):

```
  park ring area inside the published coast   1,379.0 ha
  park ring area OUTSIDE it                      48.3 ha    3.4 %

  rings with ANY area outside:  9 of 328
    ring  35  cls 0  70.5 % outside = 47.245 ha  ← Yacht Harbor / Marina Green
    ring 321  cls 0   5.3 % outside =  0.262 ha
    ring 322  cls 0   2.8 % outside =  0.218 ha
    ring 203  cls 1   7.4 % outside =  0.192 ha
    ring 285  cls 1  12.2 % outside =  0.147 ha
    ring 204  cls 1   6.3 % outside =  0.141 ha
    ring 177  cls 1  16.4 % outside =  0.122 ha
    ring 314  cls 1   0.9 % outside =  0.013 ha
    ring 156  cls 3   1.4 % outside =  0.006 ha
    the other 319                     0.000 ha
```

**One ring is 47.2 of the 48.3 hectares.** So the treatment can be exact: it
costs the rest of the city 1.1 ha of sliver where eight waterfront parks
overhang their own beach by a few metres, which is the right answer there too.

**AND THE TEST CANNOT BE THE DEM MASK, WHICH IS WHY IT LOOKED UNFIXABLE.**
Measured both ways: against `maskAt` with `coastFix` applied, ring 35 is only
**6 % wet.** The mask is `txuc-3kzm` rasterised at 53.8 m and `coastFix` only
removes cells more than 300 m outside the TIGERweb land polygon — a harbour
inside its own breakwater is land to both of them. The DEM paints ground under
that slab, and the published shoreline is the only line on the wire that knows
better. A `t.cellPark` clip would have been worse still: the ring exists
precisely to give the park a published edge instead of a 53.8 m staircase.

**This is the reference's own rule, arrived at from the other side.**
`part3.html` L3739-45 keeps `drawParkRings` inside `drawTerrain` and says why:

> A park ring is GROUND. It is a 0.46 wash under everything, and drawTerrain
> paints the water-side shore band and the surround names OVER it. Moved into
> drawCity it is painted over those instead, and MEASURED on the Marina frame
> that is 9.9 % of the stage: Yacht Harbor and Marina Green stopped being a
> strip along the shore and became a dark green slab lying across the harbour.

**That is this port's paint order.** `scene.paint` runs `drawShoreline` at
step 3 and the parks at step 3b, so the wash goes over the water-side repaint
instead of under it. The bug was written down, with its own measurement of
9.9 % against the 7.27 % measured here, by the author of the thing being
ported — eight months before anyone reported it.

**Clipping to the published line rather than asking `scene.ts` to reorder.**
One `ctx.clip(coastRings, "nonzero")` for the whole pass. It gets the same
picture without a call-site change, and it is STRICTER than the reorder: the
reference's fix only reaches within `SHORE_OUT` = 1,100 m of a coast segment
that has a wet side, and a clip reaches everywhere.

The coast is borrowed the way `lastWater` is borrowed, with the same one-line
deletion written above it in `water.ts`: `drawShoreline` runs one statement
earlier in the same `paint()`, at the same camera, in the same band, and
records the rings it was handed. `drawParkRings`'s fourth argument is already
optional and already preferred, so `drawParkRings(f, t, this.parks, this.coast)`
in `scene.paint` §3 lands the same picture and deletes the module state.

MEASURED, `.parity/g2abl.py`, ablating `WFLG.parkShore`, control pair first:

| camera | control moved / gross | treatment moved / gross | frame mean |
|---|---|---|---|
| **block, Marina** | 0.00 % / 0.00 % | **3.88 % / 3.72 %** | 165.56 → 166.68 |
| district, Marina | 0.00 % / 0.00 % | 0.63 % / 0.57 % | 160.79 → 160.95 |
| district, Civic Center | 0.00 % / 0.00 % | 0.64 % / 0.57 % | 165.84 → 166.00 |
| district, GG Park | 0.41 % / 0.25 % | 0.69 % / 0.51 % | *control is a third of the effect — weak* |
| whole city | 91.89 % / 58.77 % | — | *the chunk pipeline regenerated mid-shot (`base/solo-face` 404); discarded* |

Before / after at the same camera and the same layer list:
`out-g2/mar-all.png` against `out-g2/mar-clip.png` — **4.10 % of the frame,
and on the pixels that move the mean goes 168.4 → 197.3**, which is a green
slab coming off open water. Crops: `out-g2/crop-marina-before.png` and
`out-g2/crop-marina-clip.png`, against the reference's own
`out-g2/crop-marina-mock.png`.

**What is left after it, named rather than hidden.** The Marina Green now
reads as a strip along the shore, and where the yacht harbour's docks are, the
wash keeps a run of thin green teeth. **They are the published shoreline's own
geometry:** `base/coast` ring 0 serpentines through the harbour — vertices
347-367 oscillate between y = 5075 and y = 5400 while x steps 190 → 520 — so
the docks are INSIDE the published land polygon and the clip is right to keep
them. The reference does not show them because it covers the whole basin with
its park-FACILITY layer, `TYP.fac`, which draws the harbour as water with the
docks combed across it (`out-g2/crop-marina-mock.png`). **That layer is not on
this wire** — DRAW.md §16.8 already lists it as missing — so the teeth stay
until it ships. Nothing is invented to hide them.

### 20.8 The canopy had two greens and the field under it has 227 values

The brief's second target: *"canopy depth — a shadow beneath the crown, MORE
THAN ONE GREEN, crowns that overlap rather than tile"*, and Golden Gate Park
at the block camera reading as one flat green mat with a dot texture.

`base/canopy` ships `area`, one byte a cell: the measured canopy area inside
that cell over the cell's own 576 m². **It is a continuous published coverage
fraction and both builds asked it one yes/no question** —
`area > 0.55 · amax ? dense : broadleaf`, at the 72nd percentile of a field
whose quartiles are 49 / 86 / 149 of 255.

**TWO PUBLISHED LEVERS, AND NEITHER INVENTS A COLOUR.**

**1 · Coverage.** Four bins at the field's OWN quartiles — 49, 86, 149 — which
split the 50,897 cells 24.5 / 25.4 / 25.0 / 25.2 %. Bin 0's tone is
`TREE_FAM[0]`, the broadleaf row, and bin 3's is `CANOPY_FAM`: **the
reference's own two endpoints**, with bins 1 and 2 a third and two thirds
between them. It generalises the binary choice rather than replacing it, and a
sixth green never enters the register.

**2 · The light on the ground the crown stands on.** A crown was drawn with
the same three values whether it stood on the sunlit side of Mount Sutro or in
the shade behind it, while the ground under it was not. Each tone now goes
through `skylit(tone, 0.86 + 0.20·lam, tiltOf(lam))` — **`terrainRGB`'s own
expression, character for character** — read at the DEM node under the cell
through `lamSh`, so a crown inside a hill's own shadow goes cool through
`SKYC` exactly as the ground does. Nothing here is a new light model; it is
the page's light model reaching a layer that had been left out of it.

`lam` is quantised to five levels over **[0.40, 1.00]** and not over [0, 1]:
the measured field runs p01 0.113, p05 0.453, median 0.730, p95 0.905, so
uniform bins over the whole range would spend three fifths of the sheet on
values the city does not have. 4 × 5 = **20 canopy sprites against the
reference's 2**, in a sheet that is built once and is a function of the
palette alone.

**This is a DECLARED STEP UP, not a parity fix**, and `WFLG.canopyTone`
collapses it back to the reference's two sprites for an ablation.

MEASURED, `.parity/g2abl.py`, control pair first, and the sprite sheet is
dropped on every toggle (`scene.sprite = null`) — without that the "off" frame
indexes the 20-sprite sheet with the reference's two indices and the row is
meaningless:

| camera | control moved / gross | treatment moved / gross | frame mean |
|---|---|---|---|
| **block, Golden Gate Park** | 0.00 % / 0.00 % | **20.69 % / 2.11 %** | 144.59 → **143.81** |
| district, GG Park (z 3.6) | 0.00 % / 0.00 % | **14.64 % / 1.36 %** | 154.10 → **153.49** |
| street, GG Park (z 18) | 0.00 % / 0.00 % | **29.30 % / 2.58 %** | 136.71 → **136.07** |
| district, Sunset | 95.42 % / 82.88 % | — | *the chunk pipeline regenerated mid-shot; discarded* |
| whole city | 91.82 % / 58.89 % | — | *same; discarded* |

**It touches 15-29 % of a vegetated frame and it moves the frame DARKER by
0.6-0.8 levels** — the direction §18.7/§19.4 says the district and block
frames need, arrived at by giving a published field back its resolution rather
than by a gain. Pictures: `out-g2/can-ggp-before.png` against
`out-g2/can-ggp-after.png`, crops `crop-can-before.png` / `crop-can-after.png`
— the grove around Stow Lake and the Arboretum darkens and the fringes toward
the meadows lighten, so the mass has an inside.

**What is NOT fixed, and cannot be from here.** *"Crowns that overlap rather
than tile"*: a blob's radius is `sqrt(area/π)·1.128` and 1.128 is `2/√π`, so a
cell whose canopy fills it draws a disc that exactly circumscribes its own
24 m cell — adjacent full cells touch and do not overlap, which is the lattice
still visible in Golden Gate Park. Widening `BLOB_K` would draw more canopy
than the file measures, and sub-cell placement was rejected in §4 for the
reason that governs this whole port: **every one of those positions would be
invented.** The lattice is the grid the source publishes.

### 20.9 The canopy tint is smoothed at load, and this port was painting it raw

Handed here as the queue's first item — *"terrain: the largest single area in
the frame and, at district zoom, currently the flattest"*, with the buildings
agent's bound under it: **at the district camera buildings cover only 32.2 %
of the stage**, so two thirds of the frame is these files.

`part3.html` L3277 builds `WCAN` by running **two passes of a separable 1-2-1
kernel** over `base/canopy-tint` before anything reads it:

> The canopy fraction is measured on the DEM's own 53.8 m grid, and painted
> raw it is a chequerboard: one cell of the Presidio's forest against its
> neighbour of open sand is a hard 53.8 m square, which is the exact artefact
> Block M spent a night removing from the shoreline. Two passes of a separable
> 1-2-1 kernel — the field is a coverage fraction, so **smoothing it is
> smoothing a measurement rather than inventing one, and no cell is moved.**
> Costs 4 x 67,600 adds, once, at load.

**The encoder says the same sentence on the wire.**
`manifest.kinds['canopy-tint'].note` repeats it verbatim: the field is shipped
raw ON PURPOSE, and the client is the half that was missing.
`scene.ts:1092` assigned `tint.fields.demFrac` straight across, and
`grep -rn canopyFrac src` found the assignment, one read in the node average,
and no kernel anywhere.

MEASURED over the 67,600 cells of the shipped chunk:

```
                non-zero    mean    p50   p90   max
  raw            39.33 %   18.90      0    63   255
  smoothed       61.04 %   19.19      6    56   220

  cells changed 60.18 %,  mean |d| 10.57 of 255,  p95 46,  max 198
  over terrainColor's own 0.06 tint gate:   31.67 %  ->  42.17 %
```

**A third more of the city's ground gets a canopy tint**, the hardest forest
cell softens from 255 to 220, and **the mean does not move** — 18.90 to
19.19 — which is the check that this spreads a measurement rather than adding
one.

MEASURED ON THE GROUND ALONE, `?layers=surround,terrain,water,shore,parks`,
`.parity/g2ground.py`, two full sweeps with the constant flipped between them
(the smoothing happens when `canopyFrac` is assigned, so a runtime dial would
not re-smooth and would read backwards — the trap that cost the buildings
agent an A/B):

| camera | moved > 2 | gross > 12 | frame mean | on the moved pixels |
|---|---:|---:|---|---|
| whole city | 8.85 % | 0.34 % | 197.06 → 196.92 | 195.57 → 193.98 |
| district, Twin Peaks | **47.34 %** | 3.35 % | 194.72 → **193.94** | 192.03 → 190.37 |
| district, Nob Hill | 23.01 % | 1.12 % | 197.17 → 196.83 | 205.88 → 204.39 |
| district, Golden Gate Park | **46.13 %** | 3.80 % | 191.03 → **190.27** | 189.83 → 188.18 |
| **block, Twin Peaks** | **57.54 %** | **5.56 %** | 172.28 → **171.32** | 172.01 → 170.40 |

**Half of the ground at district zoom and 57.5 % of it at block zoom**, and
every camera moves DARKER — 0.8 to 1.0 of a level on the frame, 1.5 to 1.6 on
the pixels it touches. That is the direction §19.4's percentile ladder asks
for, and it is reached by running a pass the source documents rather than by
a gain on the palette.

Pictures: `out-g2/crop-tintraw.png` against `out-g2/crop-tintsm.png`, the
block camera over Twin Peaks and Mount Sutro. The raw frame is blotched with
cell-scale patches of green against pale sand; the smoothed one is a modelled
surface with the forest's own gradient on it.

**The raw array is a view on the chunk's own buffer and is never written to.**
The reference is careful about that (`dst = (t === a) ? new Uint8Array(N2) :
t`) and so is this. `canopyFrac` became a getter/setter pair so the call site
did not change, re-assigning the same array is a no-op, and `QF.tintsm` = 0
keeps the raw field for an ablation.

### 20.10 Ocean Beach is not gated out — it is not on the wire, and the beach it names is a bathroom

Handed over as *"Ocean Beach cannot be named and `terrain.ts` already contains
the solution: your `surroundNames` already sizes seven names that have a
position and no extent"*, with the mechanism given as **the place-label gate
sizing a name from an extent that GNIS cannot supply.**

**The rule is right and the mechanism is one layer further out.** Measured
against the shipped chunk:

```
  base/places      2,193 rows
  span == 0        0 of 2,193          ← there is no extent-less row to gate
  SRC              5kya-mfst · 65ik-7wqd · 6adp-a5yv · 7e7j-59qk · 97yj-54sx
                   base/heroes.json · ejht-vp5d · gtr9-ntp6 · ib5c-xgwu
                   nc68-ngbr · nps-nrhp
```

**No GNIS among the eleven sources, and not one row with a null extent.** The
222 GNIS rows never reach the client at all: `build_places.py` needs an extent
to build a row, so a register that publishes none cannot enter the chunk, and
the client's gate never gets a chance to reject anything. `places.json`'s own
`meta.real` names what does get in — *"DataSF 97yj-54sx (Article 10
landmarks), gtr9-ntp6 (Recreation and Parks properties), nc68-ngbr (City
Facilities)"* — **three property registers.**

**And the register makes the handover's point better than the handover did.**
Searching the 2,193 shipped names:

```
  "Ocean Beach"   1 hit:  LA PLAYA/CABRILLO OCEAN BEACH SFMTA Operator Bathroom
  "Lands End"     0
  "Baker Beach"   0
  "China Beach"   0
  "Alcatraz"      0     (it is named — off base/surround, not off base/places)
  "Fort Mason"    1 hit:  Salt Water Pumping Station #2 (Fort Mason)
```

The only Ocean Beach this map's register knows is **a transit operator's
bathroom at La Playa and Cabrillo**, and the only Fort Mason is a salt-water
pump. That is the pattern stated exactly: *the City publishes extents because
it publishes property*, and on federal or state ground it owns the fittings
and not the land.

**What `surroundNames` already is, and what it needs.** It is not
surround-specific and never was:

```ts
surroundNames(f, labels: readonly {n, x, y, w?, sm?}[], elev): number
```

— a list of NAMES WITH POSITIONS AND NO EXTENT, each drawn at a declared fixed
size (`SURROUND_SIZE` 10, `SURROUND_SIZE_SM` 8.5 for the register's own `sm`
bit), projected at the ground under it or at sea level if the register calls
it water, halo'd, and rejected only by `nameFitsFrame`. **There is no extent
anywhere in it.** The one thing coupling it to the surround is a single line —
`if (step > 0 || !labels.length) return 0`, the reference's own whole-city
gate — and the one thing missing is rows to hand it.

**So the change is two, and neither is in this file:**

1. **`build_places.py` admits a row with no extent**, with its own `src` rank
   for GNIS and a flag saying the extent is absent, so nothing downstream can
   read a missing extent as a small one.
2. **`labels.ts` calls `surroundNames` with those rows** — or `scene.ts` does,
   beside its existing `drawSurround` call — with the fixed-size rule instead
   of the extent ladder, and with a zoom gate of its own, because a beach that
   is 3 km long is worth naming at district zoom where the surround's counties
   are not.

**Nothing speculative is added here for it.** This port already carries five
passes that were written, tested and called by nobody (§16.1, §17.1, §18.8,
§19.3, §20.6); writing a sixth against rows that do not exist would be the
same mistake with better intentions. The function is general, the rule is
written down, and the encoder change is one row-level predicate.

### 20.11 The coarse depth plate is NOT why the water is flat

§16.8 names *"the depth plate is still 417 x 281 against the reference's
1665 x 1121"* as an open item, and the water was on this block's queue as
*"a big area and mostly one value"*. Measured, and the obvious suspect is
eliminated.

At the whole-city fit the water's own tonal spread, over the pixels each build
paints blue:

```
                p5     p25    p50    p75    p95    IQR    sd
  production  151.0  179.0  194.7  201.7  210.7   22.7   17.9
  reference   145.7  173.3  193.7  203.3  211.3   30.0   21.6
```

Same median to a level, **and a quarter less interquartile spread.** So the
water IS measurably flatter here.

**It is not the plate's resolution.** `water1`'s 26 tiles were decoded
straight out of the chunks and the coarse field rebuilt from them by taking
every 4th node — which is what `base/water0` is, and `assertRefinement`
guarantees it — then bilinearly resampled back to 1665 x 1121 and compared to
the fine field over all **846,819 published water nodes**:

```
  depth byte   mean |d| 0.72 of 255   p50 0.2   p90 1.2   p99 10.1   max 61
  in metres    mean 0.17 m            p90 0.32 m                     max 16.9 m
```

**The coarse plate is the fine plate to within a fifth of a metre for nine
tenths of the bay.** Its p99 is ten bytes and its worst cell is a scour edge
in the Gate. Raising `water1`'s `minZ` from 3.0 so the wide cameras fetch it
would cost 26 chunks on the first paint and buy 0.7 of 255. **That item can be
closed.**

What is left to explain the missing quarter of the spread, named and NOT
measured here: the reference bakes a Lambert hillshade of the bay floor inside
its depth plate (`DE.bed`, `bedex` 18, `bedamp` 0.70, `bedatt` 12, attenuating
as `exp(-d/12)` so it shows only on the shelf) and this build has none. §16.8
ablated it on the reference at one district camera and got at most 2 of 255 —
but that was a MEAN over sampled pixels, and a relief term is exactly the kind
of mark that moves a spread while leaving a mean alone. It is the remaining
candidate and it is the one to measure next.

### 20.12 The unported `sunCast` is a real contributor and it is one ninth of the gap

BUGS §23 re-diagnosed the district deficit as entirely LOW-FREQUENCY and
dark-end weighted — B1 **+23.5** in the mock's darkest decile against **+2.7**
in the ninth — and asked this file for a terrain cast term or an ambient
occlusion the port has none of. Neither exists:

* **`LOOK.ao` has no reader in EITHER build.** `grep -rn 'LOOK.ao' src` and
  `grep -n 'LOOK\.ao' part3.html` both return nothing. `RS.aoss` / `aossMove`
  are plumbed through `resTune` here and through `RS_AOSS` there, and neither
  side reads the result: prod's only consumer of a `ResTune` field is
  `water.ts:664` reading `bayss`. **There is no AO pass to port.**
* **There is no separate terrain CAST term.** A hill shadowing the ground
  beyond it is `TSH`, which this file has and which §20.3 corrected; the
  reference's `sunCast` is for OBJECTS.

### 20.12.1 What `sunCast` is, and that production ported the branch that never runs

`part3.html` 8933 and 9079, the near path and the banded fabric path, are the
same shape:

```js
if (SN.on && SN.bld) { sunCast(BSX, BSY, nv, dh, …); }   // THE CITY CASTS
else if (h > 2)      { ctx.fillStyle = "rgba(72,60,42,0.16)"; … }
```

`SN.on` and `SN.bld` both ship at **1**, so **the shipped reference always
takes `sunCast` and the `rgba(72,60,42,0.16)` fill is the `else` that never
runs.** Production ported the `else`. `buildings.ts` §"THE CONTACT SHADOW, AND
THE ONE THING IT IS NOT" and `SHELL.md` §8b.2 both say so in as many words —
they describe `sunCast` as *"a different, larger object"* and what is drawn as
*"`drawCity`'s OWN fallback"*, which it is, and which the reference does not
reach.

The two are different in kind, not degree:

```
  reference   a mask canvas at rgbHex(32·SUNC) = (33.7, 32.0, 28.6),
              blitted globalCompositeOperation = "difference", alpha 1
              → |D − 31.4|, a CONSTANT −31.4 wherever a shadow falls

  production  rgba(72,60,42,0.16), source-over
              → D + 0.16(58 − D), which is −22.7 at D = 200
                and only −9.9 at D = 120, and vanishes as D → 58
```

**A `source-over` fill toward a fixed dark colour stops darkening as the
destination darkens; a `difference` blit subtracts a constant.** So the
per-pixel gap is `40.7 − 0.16·D` — monotone falling with brightness, +21.5 at
D = 120, +5.5 at D = 220. That is BUGS §23's exact shape, and it is why this
looked like the whole answer.

### 20.12.2 IT IS NOT THE WHOLE ANSWER, AND THE ARITHMETIC ABOVE IS OUT BY EIGHT

**Measured before believing it**, against a terminal constant in the reference
itself rather than through the arithmetic under test: `.parity/g2sn.py` sets
`SN.bld = 0` and `SN.mass = 0` in the mock — which makes the REFERENCE take
production's own branch — and re-shoots B1 and B4 at the same pinned camera.
One boolean, one variable, both frames from one page load.

```
  == B1 · the reference with sunCast ON against its own fallback ==
     LOW mean  164.05 -> 165.38     delta +1.33
     decile     0     1     2     3     4     5     6     7     8     9
     lo(ON)   118.6 131.5 140.0 148.4 157.5 167.8 178.3 189.2 196.7 209.7
     gap       +2.7  +3.1  +3.1  +2.3  +1.3  +0.6  +0.2  +0.1  +0.0  +0.0

  == B4 ==
     LOW mean  153.67 -> 155.81     delta +2.14
     decile     0     1     2     3     4     5     6     7     8     9
     lo(ON)   115.5 128.3 135.4 141.4 147.0 152.9 159.7 168.1 182.0 205.4
     gap       +2.5  +3.9  +3.7  +3.4  +2.9  +2.2  +1.5  +0.8  +0.4  +0.1
```

**The shape is right and the size is not.** The ablation falls monotonically
with brightness and dies at the bright end, exactly as §23 measures — and it
is **+1.33 of B1's +11.7 gap (11.4 %) and +2.14 of B4's +13.7 (15.6 %).**
In the darkest decile it is +2.7 where the gap is +23.5: **one ninth.**

**And my own prediction was +21.5 in that decile.** The blend arithmetic gives
the delta INSIDE a shadow; the low-frequency gap is that delta times the
shadow's AREA FRACTION inside the blur kernel, and that fraction is 8-16 %,
not 1. Writing the per-pixel arithmetic and reading it as a frame number is
the same class of error as reading a frame mean and calling it a picture.

### 20.12.3 The bound this leaves for whoever finds the rest

The A/B is now a CALIBRATED instrument: a mark that covers ~10 % of the frame
with a −30 per-pixel delta buys **1.3-2.1 levels** of low frequency. The gap is
**11.7-13.7**.

So the remaining cause is almost certainly **not a mark at all**. Ten levels of
low frequency, weighted to the dark end, needs either a large-area tone —
something covering most of the frame at −10 to −15 — or a mark with an area
fraction near 1. Candidates of that size at district zoom, in descending area:
the built ground under the blocks, the street surface, and the wall/roof value
ramps. **`sunCast` is worth porting on its own merits (it is the branch the
reference actually runs, and it is 1.3-2.1 levels), and nobody should spend a
night on it expecting twelve.**

Not this file's: `sunCast` is `buildings.ts` + `scene.ts`, and the constants it
needs — `SN.step` 32, `SN.cool` 1, `SN.minpx` 0.7, `SN.punchpx` 14,
`SN.quads` 1, `SN.masscov` 128 — are named here rather than added to this
file's `SN`, because a constant with no reader is the defect this port keeps
finding.

### 20.13 Every treatment in the reference, ranked by low frequency — and none of them is the gap

BUGS §23's method note is the whole of this section: *a frame mean and a
changed-pixel count are both blind to a low-frequency difference.* So the
instrument is `GaussianBlur(6)` of the frame, and the question asked of every
switch in the reference is **how many levels of blurred image does this dial
own, and where in the tone range.**

`.parity/g2dials.py`, B1 (district Civic Center 1925) and B4 (district Mission
1960), one mock page load, each dial flipped alone and put back, binned by the
reference's OWN low-frequency deciles.

**The gap, reproduced independently on this sweep** (`.parity/g2canlo.py` for
production's side, same cameras, same pinned scale):

```
              reference LOW   production LOW    gap
  B1             164.05           175.08       +11.03
  B4             153.67           166.90       +13.23
```

which is BUGS §23's +11.7 / +13.7 to within the sweep, so the object is real
and stable across sessions.

#### The ranking

```
  == B1 ==                              == B4 ==
  dial OFF        dLOW  d(dark) d(brt)  dLOW  d(dark) d(brt)
  WFLG.canopy    +5.98  +14.58  +1.43  +6.93  +16.93  +1.71
  LOOK.shore     -7.00   -0.01  -2.05  -1.01   +0.01  -8.49
  WFLG.tint      +2.75   +3.25  +0.83  +2.60   +2.74  +0.49
  SN.bld+mass    +1.33   +2.71  +0.02  +2.14   +2.59  +0.06
  LOOK.edge      -1.61   -1.07  -0.04  -2.69   -0.98  -0.13
  WA.smooth      +0.83   +0.61  +0.53  +0.86   +0.49  +0.39
  LOOK.grain     +0.52   +0.09  +1.18  +0.38   +0.07  +1.14
  LOOK.aerial    -0.26   -0.46  -0.01  -0.22   -0.34  -0.00
  DE.deck        -0.25   -0.28  +0.01  -0.06   -0.15  +0.03
  DE.tray        +0.16   +0.48  +0.02  +0.27   +0.49  +0.05
  LOOK.depthfix  -0.17   -0.12  -0.00  +0.34   +0.07  +0.01
  WFLG.parks     +0.10   +0.13  +0.04  +0.11   +0.13  +0.04
  DE.bed         +0.05   +0.15  -0.00  +0.02   +0.00  +0.01
  QF.warm        -0.05   -0.07  -0.00  -0.08   -0.05  -0.06
  SN.terr        +0.01   +0.02  +0.00  +0.01   +0.01  +0.00
```

**The canopy is the largest by a factor of three, and its shape IS the gap's
shape** — +14.6 / +16.9 in the darkest decile against +1.4 / +1.7 in the
ninth. For an hour it looked like the answer.

#### It is not the canopy: production's is STRONGER

Production's own `WFLG.blobs`, same cameras, same blur, same binning
(`.parity/g2canlo.py`):

```
                  reference        production
  B1  dLOW          +5.98            +6.86
      d(dark)      +14.58           +20.44
  B4  dLOW          +6.93            +8.30
      d(dark)      +16.93           +22.34
```

**Production darkens its dark decile 5.9 and 5.4 levels MORE than the
reference does with the same layer.** The canopy is not a deficit here, it is
a surplus — so it does not explain a gap in which production is too LIGHT, and
part of it is §20.8's own tone change pulling the right way. Grid, count and
gate all match: `amax` 576, `cell` 24, `gw` 600, `q` 16, `x0/y0` −7200/−6600
on both sides, and VPROBE reads `canSeen` = 50,897, which is the reference's
own `n`.

#### Four rows of that table were invalid, and +0.00 is what a trap looks like

`LOOK.attr`, `LOOK.palette`, `WA.warm` and `WFLG.trees` all came back at
**exactly +0.00**. That is not a measurement. `assignBldTones()` runs ONCE at
load and reads `LOOK.attr` and `WA.warm`; dropping the raster keys
re-rasterises with the tones already assigned. It is the same trap as
`WFLG.canopyTone` needing `scene.sprite = null` (§20.8) and `QF.tintsm`
happening at assignment (§20.9) — **a dial read at build time cannot be
ablated at draw time, and it reports zero rather than failing.**

Re-tested the only way they can be, with an init script that presets
`window.LOOK` / `window.WA` BEFORE the page loads so the reference's own
`Object.assign({…}, window.LOOK || {})` picks it up (`.parity/g2load.py`, six
fresh mock loads, `cam.base` identical on all six):

```
                    == B1 ==                  == B4 ==
  preset at LOAD    dLOW  d(dark) d(brt)     dLOW  d(dark) d(brt)
  LOOK.attr=0      +0.16   +0.99  +0.01     -0.94   +0.43  -0.00
  WA.warm=0        +0.04   +0.88  +0.01     -1.07   +0.32  -0.01
  LOOK.palette=0   -0.02   -0.04  -0.00     -0.02   -0.03  -0.00
  WORLDF.pal=0     +2.10   +0.90  +3.90     +2.01   +0.67  +2.61
  WA.faces=0       +0.01   +0.03  +0.00     +0.01   +0.01  +0.00
```

**The whole building-tone apparatus is worth about one level in the dark
decile.** `WA.warm` selects the measured `UMAT_WALL` / `UMAT_ROOF` material
tables against the eight-tone fallback and it is worth **+0.88 / +0.32** — so
the roof-and-wall material question, which looked like the obvious large-area
suspect, is not this. `WORLDF.pal` is the only one over two levels and it is
the GROUND palette, which production ships identically (`WPAL.pal = 1`).

#### What that leaves, stated as a bound rather than a guess

```
  the gap                                B1 +11.03   B4 +13.23
  sunCast, missing here (§20.12)            +1.33      +2.14
  canopy, STRONGER here                     -5.88      -5.41
  every other dial measured, largest        <1.1       <1.1
```

**No switchable treatment in the reference accounts for it, and the largest
one runs the wrong way.** Whatever it is, it is always-on in both builds and
differs in value or in content — which is precisely the class of difference
that no ablation can find, because ablating it removes the same thing from
both.

The remaining hypothesis, and the one this block ran out of night on: **the two
builds may not be drawing the same content at these cameras.** Both of §23's
frames are HISTORICAL years — B1 is 1925 and B4 is 1960 — and a year gate that
differs by a few thousand footprints changes how much pale ground shows
between the blocks, which is a large-area, dark-end-weighted, low-frequency
difference that every dial in the table above is blind to.
`.parity/g2count.py` puts `BLD_DRAWN` / `VEG_CAN` / `ST_DRAWN` from the
reference beside `lastStats` from production at B1, B4 and a 2018 control.

**Measured, and it refutes the hypothesis:**

```
  camera            mock BLD_DRAWN   prod buildings   ratio
  B1  1925              41,440          38,289        0.924
  B4  1960              79,957          76,702        0.959
  B2018  control        68,562          60,319        0.880
```

**The 2018 control is the WORST agreement, not the best.** A year gate would
show as the two historical frames disagreeing and 2018 matching; the shortfall
is present at every year and largest where there is no history in it at all.
And it is the wrong size anyway: 12 % fewer marks over a built layer covering
32.2 % of the stage, at the ~50 levels a building sits below the ground it
stands on, is `0.12 × 0.322 × 50` ≈ **1.9 levels** against a gap of 11-13.

One number worth carrying out of that table, unrelated to the gap: **the
canopy blob COUNT is 15,991 here against the reference's 27,420** — 58 % —
while §20.13 measures this build's canopy as the STRONGER of the two in low
frequency. Both are true: `canOff` culls 30,756 cells as off-frame where the
reference's `mgn = 200` test on the cell centre keeps them, so the reference is
drawing blobs it cannot show. The visible blobs agree; the reference's extra
11,429 are work, not picture.

So the year gate is out, the mark count is out, and every dial is out.

**Nothing in this section changed a pixel.** It is four instruments and a
ranking, and its value is the eliminations: the canopy, the building tone
tables, the ground palette, the seabed, the aerial fade, the grain, the roof
deck and tray, and the terrain self-shadow are each measured and each too
small, on the one metric that can see the thing being looked for.

### 20.14 The ground's colour is bit-identical in both builds, over its whole domain

§20.13 ended on a bound: **the gap is always-on in both builds and differs in
value — the one class of difference an ablation cannot find, because ablating
it removes the same thing from both.** The method that finds one is to stop
ablating and READ THE VALUE OUT OF BOTH BUILDS AT THE SAME INPUT.

The ground's colour is a pure function of five numbers on both sides —
`terrainRGB(z, lam, parkF, burnT, can)` — and both are reachable from their
own page: the reference's as a top-level function declaration, this build's
through **§GROUND**, a dev-only handle that exports the FUNCTIONS the renderer
runs rather than copies of them, so a sample cannot drift from the draw.

`.parity/g2fn.py`, 4,800 samples over
`z ∈ {0…300} × lam ∈ {0…1} × park ∈ {0, ½, 1} × burn ∈ {0, 0.45} ×
can ∈ {0…255}`, the same numbers into both:

```
  prod − mock, luminance    mean +0.000   p5 +0.00   p50 +0.00   p95 +0.00
  max |d| over all channels                    0.00
  identical samples                    4,800 of 4,800   (100.0 %)

  WTBL                       1,152 entries each, 0 differing
  WTQ 64 · WCQ 9 · LAM0 0.73 · QWARM 0.6
  SUNC [1.054, 0.9998, 0.8949] · SKYC [0.9427, 0.9924, 1.1355]
  WG0 #f8f0d8 · WG1 #dcc79a · WPK0 #eef0d8 · WPK1 #d3d3a8
  WCN0 #c9d79c · WCN1 #7c9455 · HAZE #ece7dc · hazecap 0.62
                                    — every one identical
```

**Not "close" and not "within the noise": the same number, everywhere, to the
float.** The ramp, the 1,152-entry table it is built from, the two
illuminants, the warmth, the tilt, the burn lerp and the canopy gate all
agree.

**No camera, no frame, no threshold, no blur kernel** — and, unlike every
measurement above it in this section, nothing that a term being on in both
builds can defeat. It is the proof that closed the back-wall bug (capture the
polygons out of both builds and compare) applied to colour instead of
geometry.

**What it buys is an exact elimination of the largest layer in the frame.**
The ground covers more of a district frame than anything else and it is now
excluded — not statistically, not to within a decile, but identically. So the
+11.03 / +13.23 is in what is composited OVER the ground, and §20.13 has
already excluded the canopy (production's is *stronger*), the building tone
tables (~1 level in the dark decile), the ground palette, the seabed, the
aerial fade, the grain, the roof deck and tray, and the terrain self-shadow.

**The recipe, for whoever takes the next layer.** It is four lines and it
works on any pass whose output is a function of its inputs:

1. export the function itself from a dev-only global on the production side —
   `terrain.ts` §GROUND is the pattern, and it must export the function
   object, not a re-implementation;
2. reach the reference's counterpart, which is a top-level declaration in
   `part3.html` and therefore already global;
3. sample the input domain on a grid and dump both output tables;
4. subtract. A constant that differs is a systematic offset over part of the
   domain, and **the shape of *where* in the domain it differs names the
   term.**

The layers still to run it on, in descending share of a district frame:
the building wall and roof tone (`colourLUT`, `buildings.ts`), the street
surface (`streets.ts`), and the facade material (`facades.ts`). The building
one is the one to do first — §20.13 already caught the two builds disagreeing
by +0.88 / +0.32 on an always-on table there (`WA.warm`'s `UMAT_WALL` /
`UMAT_ROOF` against the eight-tone fallback), and **where there is one such
disagreement there are likely to be more.**

### 20.15 The street surface lives in the bright end, so it is not the dark-end gap either

The largest always-on layer over the ground that is not the buildings, run the
same way in BOTH builds — the reference's `drawStreetSurface` and `drawStreets`
replaced whole with no-ops (a terminal override of a function declaration, not
an arithmetic nudge), production's own `?layers=` list without `streets`:

```
  == B1 ==  streets OFF, each relative to its own frame
     reference   LOW 164.05  dark 118.9  ->  dLOW +1.81  d(dark) +0.20  d(bright) +2.13
     production  LOW 175.02  dark 126.9  ->  dLOW +0.99  d(dark) +0.26  d(bright) +1.70

  == B4 ==
     reference   LOW 153.67  dark 115.7  ->  dLOW +2.02  d(dark) -0.13  d(bright) +2.73
     production  LOW 167.15  dark 122.4  ->  dLOW +1.01  d(dark) -0.07  d(bright) -0.22
```

**Production's street layer is worth about half the reference's** — 1.0
against 1.8-2.0 of low-frequency mean — which is a real difference and a real
finding for `streets.ts`. But **both builds put it almost entirely in the
BRIGHT end**: in the darkest decile the layer is worth +0.20 / +0.26 and
−0.13 / −0.07, which is nothing on either side. **Streets are not the dark-end
gap.**

*The B4 production row is flagged rather than quoted: that page load hit
`manifest.json` ENOENT and a `base/canopy` 404 while the chunk pipeline was
regenerating, and its −0.22 bright figure does not agree with B1's +1.70. The
dark-decile figure, which is the one this section turns on, agrees on all four
rows.*

### 20.16 Where the dark-end gap has to be now

Everything measured in §20.12-§20.15, against a gap of **+11.03 (B1) /
+13.23 (B4)** whose darkest decile is **+23.5 / +14.2**:

| term | how measured | dark-decile weight |
|---|---|---|
| the ground's colour | **function sampled in both builds, 4,800 inputs** | **0.00 — identical** |
| the canopy | layer ablated in both | production **stronger** by 5.9 / 5.4 |
| the street surface | layer ablated in both | +0.2 / −0.1 in both |
| `sunCast` | reference switched to production's branch | **+2.7 / +2.5** ← the only real one |
| building tone tables (`WA.warm`) | preset before load | +0.88 / +0.32 |
| `LOOK.attr` | preset before load | +0.99 / +0.43 |
| ground palette (`WORLDF.pal`) | preset before load | +0.90 / +0.67 |
| terrain self-shadow, seabed, aerial fade, grain, roof deck/tray, faces, parks, edge, smooth | ablated | each < 1.1 |
| the mark COUNT | `BLD_DRAWN` vs `lastStats`, 3 years | ≈ 1.9, and the 2018 control is the worst |

**The ground is exonerated exactly and the two next-largest layers over it are
exonerated by measurement. What is left is the buildings' own values** — and
that is where §19.4 pointed a night ago, in its own words: *"the term to look
for is whatever lifts the SHADED end of the built layer — the wall's lambert
ramp's bottom quartile, the aerial fade, or the haze index — and not a gain on
the palette."* §20.13 then caught the two builds already disagreeing on an
always-on table there. It is the same finger, from three directions.

**And it is now cheap to settle.** `colourLUT` in `buildings.ts` is a pure
function of (class, face, lambert, haze band) exactly as `terrainRGB` is a
pure function of five numbers. §GROUND is the pattern: export the function
object from a dev-only global, reach the reference's counterpart — already a
top-level declaration — sample the domain, subtract. **It took one page load
and 4,800 samples to exonerate the ground to the float; the same instrument
on `CL_WALLF` / `CL_ROOF` will either name the constant or exonerate the
buildings the same way**, and there is nowhere left for it to hide after that.

## 23. Block G1(a) — the pixel floors are not the district deficit, and here is the count

`scene.ts` came to this block with one instruction: **measure what the gate
rejects before moving a threshold.** It was the right instruction and the
measurement closes the question in the other direction.

### 23.1 The gate rejects most of the ink, not just most of the buildings

District camera, Palace of Fine Arts, 2018, scale 0.135331, canonical
1200 × 678 stage. `.parity/g1gate.py` replays `paintFootprints`'s own frame
reject and its own `wpx` — `x1 − x0` over the projected roof ring — over every
table the page holds, and buckets by count **and by projected roof area**,
because *a gate that turns away 94 % of the buildings and 12 % of the ink is a
different fact from one that turns away 94 % of both.*

| floor | buildings under it | **building AREA under it** |
|---|---|---|
| `NEAR_PX` 9 — tray, storey lines, facades, ramped outline | 98.67 % | **84.16 %** |
| `DE.tr0` 7 — the tray at all | 97.29 % | 77.83 % |
| `STROKE_MIN_PX_B` 5 — **any outline at all** | 92.46 % | **66.63 %** |
| `SHADOW_MIN_PX` 5 — the contact shadow | 92.46 % | 66.63 % |
| `STOREY_W_PX` 14 | 99.64 % | 92.54 % |

Two thirds of the district frame's building area is drawn as a flat fill with
**no separating mark of any kind**, and five sixths of it gets none of the near
path. That is a real and large ceiling on how much detail this layer can carry
at this zoom, and it is worth having the number.

### 23.2 But it is NOT the parity gap: both builds compute the same `px`

The constants were checked by hand and are identical to the reference. That
does not prove the **gates fire** identically, because each compares against a
`px` its own build computes. So both builds were instrumented at the same
camera and the same pinned scale (`.parity/g1both.py`) — the mock's own
quantity off its own `UPBB` (`part3.html` L8862, `k2 = cam.scale` L8636)
against production's `x1 − x0`:

```
                              mock                    prod
  scale                   0.135331                0.135331
  in frame                  47,755                  44,238
  px p10                     1.492                   1.492
  px p50                     2.818                   2.818
  px p90                     4.641                   4.807
  px p99                     9.613                   9.945

  below NEAR_PX          98.79 % n / 85.05 % area   98.67 % / 84.16 %
  below STROKE_MIN_PX_B  92.99 % n / 68.19 % area   92.46 % / 66.63 %
  below DE.tr0           97.53 % n / 79.02 % area   97.29 % / 77.83 %
  below STOREY_W_PX      99.67 % n / 93.01 % area   99.64 % / 92.54 %
```

**`p10` and `p50` agree to three decimal places.** The p90/p99 spread and every
one of the sub-point differences in the table are the 3,517 buildings — 7.4 % —
whose `bldg` chunks prod had not fetched when the shutter fell; they are the
big ones at the edge of the frame, which is where a missing chunk moves a tail
and not a median.

**So the pixel floors are not the 3–5 % midtone deficit, and lowering one would
be a parity regression rather than a fix.** Recorded here so the next agent
does not spend a night on `NEAR_PX`. What the numbers in §23.1 *are* is a
ceiling on a step-up, and it is bounded further: at this camera the buildings
cover **32.2 %** of the stage, so two thirds of the frame the histogram
measures is terrain, water, streets and canopy, and none of it is in these
files.

### 23.3 And the reference already says what a mark under 5 px does

`buildings.ts` carries the mock's own sentence about the outline: *"below 5 px
an outline is not a division between two houses, it is an anti-aliased smear
that greys the whole fabric."* At district zoom the median building is
**2.818 px** wide, so a 0.7 px line inside it is a third of its width. The
cheap-mark-for-the-small-case idea does not survive that: there is no room
between the two neighbours to put a mark, because at 2.8 px the mark and the
gap are the same pixel.

**What IS available at 2.8 px is the value of the fill itself**, which is
already carrying the published height quartile (`RSHADE`, four steps, ±14 %)
and the measured aerial colour (32 entries, §22.1) — and it reaches the fabric
tier, not only the near path. That is the layer's whole vocabulary at this
zoom and it is already fully wired.

### 21.14 Which of the famous set are drawn, and which fall back to a prism

The register the brief asked for, taken out of the shipped files
(`base/heroes.json`, `base/caps.qc`, `base/places.qc`) rather than from memory:
**12 heroes**, **68 shaped caps** (32 `dome`, 21 `crown`, 12 `campanile`, 2
`spire`, 1 `arcade`), **5 buildings carry both**, and one bridge deck.

| famous thing | in the places register | drawn as |
|---|---|---|
| Coit Tower | yes | HERO `coit` |
| Ferry Building | yes | HERO `ferry` |
| San Francisco City Hall | yes | HERO `cityhall` |
| Palace Of Fine Arts | yes | HERO `pofahall` (§21.9) + `pofa` rotunda |
| War Memorial Opera House | as `Opera House` | HERO `opera` |
| The Old U.S. Mint | yes | HERO `oldmint` |
| Conservatory of Flowers | as **`Conservatory Storage`** | HERO `conservatory` |
| Peace Pagoda | as `Japanese Pagoda` | HERO `pagoda` |
| Dutch / Murphy Windmill | yes | HERO |
| Sutro Tower | **no row** | HERO `sutro`, never named |
| Golden Gate Bridge | yes, no footprint | `drawBridge` |
| James Flood Building | yes | cap `crown` |
| Beach Chalet | yes | cap `dome` |
| **Grace Cathedral** | yes, designated | **bare prism** |
| **Fairmont Hotel** | yes | **bare prism** |
| **Hyde Street Pier** | yes | **bare prism** |
| Transamerica Pyramid | as `Transamerica Pyramid [Transamerica Center]` | cap |
| Legion of Honor · Kezar Stadium · Salesforce Tower · SF Zoo | yes, **`bi` = −1** | no footprint at all |
| de Young · Sts Peter and Paul · St Mary's Cathedral · Alcatraz · Cliff House · Oracle Park · Castro Theatre · Palace Hotel · Mission Dolores · Bay Bridge | **no row under any of those names** | never named |

Two things in that table are findings in their own right. **`Sutro Tower` is a
hero and is not in the places register**, so the map draws the most visible
object in San Francisco at emphasis and never writes its name. And the
**Conservatory of Flowers' footprint carries the name `Conservatory
Storage`** — the register's row for the glasshouse is the maintenance building
next to it.

### 21.15 Grace Cathedral: authored, screenshotted, and taken out again

Recorded so it is not re-attempted the same way. It was drawn with §21.9's
machinery — a wall, a cornice on the published ring, and a three-band
**pitched** roof — shipped, and looked at (`.parity/g3/out/grace-crop.png`).
**It is not an improvement and it was removed.**

The reason generalises. §21.9's section is a *roof*, and a roof only reads on a
building you look **down** on. The Exhibition Hall is 14 m tall on a 272 m
plan, so its roof is most of what the reader sees. Grace Cathedral is 30 m tall
on a 102 × 72 m plan and its published 37-vertex ring has narrow arms, so the
deepest inset the containment gate allows is **3.6 m on an 8.42 m
half-width** — at the street camera, a chamfer a few pixels deep along the top
edge of a 30 m wall. What the frame showed was a pale flat-topped slab that
read no better than the prism it replaced, and slightly worse, because `stone`
is lighter than the fabric around it.

What Grace Cathedral needs is its **silhouette** — two west towers and a
central tower over a nave — and per-element heights are in no field this
pipeline reads. **30.0 m is the LIDAR top of the whole building**, so splitting
it into a nave and towers would be inventing where the height went. It does not
get drawn specially until there is a published plan or elevation behind it, and
the rejection is kept in `heroes_extra.json` under `rejected` with that reason.

Two things survive it and are kept:

- **`roofKind`**, so the section can be a straight-slope `pitched` roof as well
  as a truncated `segmental` arc. It is the right primitive for a nave and it
  will be right for the next low building that needs one.
- **the emitter can now REMOVE a hero it added.** A merge that only ever adds
  is not idempotent with respect to its own seed: taking a row out of
  `heroes_extra.json` would leave it shipped forever and the only way back
  would be re-running the whole city encoder. The manifest records which keys
  this file wrote, so a key that *was* ours and is no longer claimed is
  dropped — **after** the byte-for-byte round trip has been proved, never
  before, and rows that came out of the mock are never touched.

### 21.16 The ranking had no notion of one place being inside another — 498 of 2,192

§21.13 left GOLDEN GATE PARK unnamed at all five zooms with the cause named:
`Beach Chalet`, a restaurant standing *inside* the park, carries an Article 10
designation and therefore runs in the **first** lane, before the neighbourhood
capitals, and takes the park's box. That is not one bad row. Measured against
`base/parks.qc` — the published park polygons the map already draws, decoded in
`emit_places.py` `_park_rings`:

> **498 of the 2,192 places stand inside a park ring at least four times their
> own extent. Twelve of them are designated.**

The twelve, by span: `Beach Chalet` (129 m, inside an 856,308 m² ring),
`Palace Of Fine Arts`, `Mother's Building` (61 m, inside the Zoo),
`Marina Branch Library`, `Parkside Branch Library`, `Richmond Branch Carnegie
Library`, `Coit Tower`, `Stow Lake Boathouse` (16 m, inside 982,912 m² of
Golden Gate Park), `Trocadero Clubhouse` (Stern Grove), `City Cemetery`
(Lincoln Park), `Shipwright's Cottage`, `Sunnyside Conservatory`. Every one is
a candidate to spend a ground's own name on the wide frame.

**The ratio is a statement, not a knob.** A ring is a container only where its
area is at least **four times** the place's own extent area (`span²`, which is
how `span` is defined). At 1× a park contains itself: Golden Gate Park's own
point sits inside Golden Gate Park.

**And demotion is not a re-lane.** It cannot put `Golden Gate Park` ahead of
`Beach Chalet` — one is designated and one is not, and `scene.ts` walks the
classes in a fixed order that this file cannot reach. What it does is make the
designated class spend its **exact** ink budget on the rows that are not
standing on somebody else's name first, and at the whole-city camera that
budget binds after eight names, so the ground gets its box back. Two sort keys
and the precedence between them is the whole argument:

1. a **hero's** footprint goes first;
2. a place standing inside a materially larger published ground goes **last**.

**A hero beats containment and it has to.** Coit Tower stands inside Pioneer
Park and the Palace of Fine Arts inside its own lagoon ring — both are flagged,
both are the *reason* a reader is looking at that ground, and the map already
spends its emphasis on them. Demoting them would undo §21.12.

Measured, `.parity/g3/why.py`, home whole-city camera:

| | before §21.12 | after §21.12 | after this |
|---|---|---|---|
| `GOLDEN GATE PARK` (hood) | `grid` | `grid` | **written** |
| `San Francisco City Hall` | `grid` | written | written |
| `Coit Tower` | `grid` | written | written |
| `Ferry Building` | `grid` | written | written |
| hood names placed | 12 | 12 | **13** |
| designated written | 8 | 8 | 7 |

The frame gains `GOLDEN GATE PARK` and `HAIGHT ASHBURY` and loses `Beach
Chalet` and `Mother's Building`.

**And it costs nothing when the reader is looking at the thing.** Acceptance
test, camera anchored on Beach Chalet itself (−6354, 1035): `Beach Chalet` is
written at city, district **and** block, and at district it is written
*alongside* `Golden Gate Park`. The demotion only stops a contained place from
spending a distant ground's name on a frame that is not about it.

The bit is shipped and inspectable — `fl` bit 3 in `base/places.qc` and `d` bit
3 in `base/marks.json` — so the claim can be checked without re-running the
build. `decodeMarks` in `CityMap.tsx` reads `d & 1` and is unaffected.

### 21.17 Two harness traps this cost an hour to, both worth the sentence

- **`emit_places.py … | head -3` truncates the build.** `head` closes the pipe,
  the writer takes SIGPIPE, and the script dies *after* `base/places.qc` and
  *before* `write_marks`. The chunk and the sidecar then disagree with
  `base/marks.json` — which is the file `CityMap` actually fetches — and the
  frame does not change while every number you check says it should have.
  Measured: `places.qc` had Beach Chalet at row 1,722 and `marks.json` had it
  at 131. **Never pipe an emitter into `head`.**
- **Re-running `encode_city_chunks.py` reverts both sidecar registers.** It
  rebuilt `base/heroes.*` and `base/marks.json` from the mock mid-session and
  put the eleven heroes and the span-ordered marks back. This is the trap
  `emit_places.py` and `emit_heroes.py` both state in their own docstrings, and
  it is real: **after any run of the city encoder, re-run
  `emit_heroes.py` and then `emit_places.py --marks`, in that order** — the
  place ranking reads `base/heroes.json`, so the hero register has to be right
  before the places are ordered against it.

---

## 24. Block G1(b,c) — two marks on the wall, and an ablation that measured the opposite of what it claimed

`facades.ts` · `roofs.ts` · `scene.ts`

§23 closed (a): the pixel floors are not the deficit and lowering one would be
a parity regression. What it left is (b) and (c), both of which needed
`scene.ts`, which this block was given.

### 24.1 The wall's own foot, and two wrong versions of it

`buildings.ts` `SHADOW_FILL` lays a contact shadow **on the ground** and stops
at the wall. The wall's own foot got nothing, so every building in this city
met the pavement at a hard edge carrying the same value as three storeys up.

That is not a missing architectural element — this project has no right to
invent a plinth and `part3.html` has none. **It is the other half of a shadow
the renderer already declares.** A surface a pavement's width from a pavement
takes less of the sky than the same surface nine metres up, and the ground
beside it is already drawn on exactly that basis.

**Version one, `shade(col, 0.90)` flat over the bottom 0.9 m.** A rectangle of
one darker value with a hard top edge reads as a plinth, which is the claim we
are not entitled to, and at 2.9 px it read as neither.

**Version two, a gradient in the wall's own colour — and it came out LIGHTER
than the wall it was drawn on.** `terrain.ts` `WA.wbot` is **0.855**, so a wall
tall enough to carry `wallGrad` is already at 0.855 of its colour where it
meets the street; an opaque 0.82 band computed off the FLAT colour overwrote
that with something paler. Caught by sampling a column rather than by looking:
one Bay Street wall at x = 1860, y 826-830 went **(161,152,136) → (174,165,148)**.
The mark was *removing* contact. `out-g1/one-{z5,foot2}.png`.

**Version three, and it is the right one: an occlusion has no colour.** It
darkens whatever is under it, and what is under it here is `wallGrad`, a
shopfront's glazing, a garage door or a flat fill. So the foot is the SAME INK
`SHADOW_FILL` lays on the ground — `rgb(72, 60, 42)` — at an alpha running from
zero at the top of the band to `FA_FOOT_A` = 0.2 at the contact line. It
composites over anything, **it cannot invert**, and it makes the claim it
should: one shadow, drawn on the ground and on the wall it belongs to. The same
column now reads −3, −12, −16, −23, −25, −31 over six device px and 0 above.

`footWeight` is a cut-off and a ramp on the band's own drawn height, not a
floor: at the block camera the band is 0.9 × 1.6 × 0.336 = **0.484 px** and it
returns 0, so nothing is smeared across a fabric that cannot resolve it.

### 24.2 The storey line is one step under the wall it is ON

`scene.ts` stroked every storey line in `lut.wallF[wallO + 1]`, which is
`part3.html` L8994 exactly (`W4[WO+1]`) — **not a port defect.** But bucket 1
is fixed and the wall under it is not: `colourLUT` builds the four buckets at
`0.66 + 0.1q`, monotone, so one mark comes out darker than a bucket-3 wall,
**invisible** on a bucket-1 wall and **lighter** than a bucket-0 wall.

Measured (`.parity/g1storey.py`) at the street camera, over every visible wall
of every building past the storey gate, weighted by the wall's own drawn area —
and it refuted the assumption that sent me looking. **The walls that lose the
mark are the DARK ones, not the pale ones:**

```
  camera        bucket 0     1       2       3
  Marina         27.3 %    6.9 %   4.4 %   61.4 %
  Mission        23.3 %    1.4 %   0.6 %   74.7 %
  downtown        2.8 %    7.3 %  45.1 %   44.8 %
```

`STOREY_INK_V` = **0.88** is not "darker looks better". A floor line is the
shadow under a slab, so it belongs one step under **whatever plane it is drawn
on**, and 0.88 is the table's OWN adjacent-bucket ratio — `0.66/0.76 = 0.868`,
`0.76/0.86 = 0.884`, `0.86/0.96 = 0.896`. It reproduces "one bucket darker" to
within 1.6 % on all three real steps and, unlike an index, still exists below
bucket 0 — which is a quarter of the drawn wall area and exactly the case an
index cannot serve. Batched by the wall's own bucket into at most four paths,
so a tower is four strokes and not four hundred.

### 24.3 The ablation measured the opposite of what it claimed, and the numbers after it

The first A/B disabled the foot by setting `FA_FOOT_PX0` to `1e9`. **That
turned it fully ON.** `footWeight` is
`t = (bandPx − PX0) / (PX1 − PX0)`, and with `PX0 = 1e9` both numerator and
denominator are large and negative: `t = (0.484 − 1e9)/(4 − 1e9) ≈ 1`. The
"off" run had the foot at full weight at **every** camera including block zoom,
so the table came out **+5.5 per channel and 2.3 % darker** — my own change
apparently making the city lighter. Ablating by a threshold is ablating through
the arithmetic under test; the second ablation sets `FA_FOOT_A = 0` and
`STOREY_INK_V = 1`, which are terminal.

Corrected, two sweeps minutes apart with those two constants the only
difference:

| camera | changed px | of frame | on changed px | darker |
|---|---|---|---|---|
| street, Palace of Fine Arts | 64,710 | **1.988 %** | −7.3 / channel | **100.0 %** |
| street, Mission | 89,833 | **2.760 %** | −7.8 | **100.0 %** |
| block, downtown | 31,236 | 0.960 % | −10.5 | **100.0 %** |
| block, Palace of Fine Arts | 75 | 0.002 % | −7.0 | 100.0 % |

**Not one changed pixel anywhere got lighter**, which is what an occlusion and
a slab shadow have to be and is now proved rather than asserted. Same-sweep
control 0.000 %. The block cameras separate cleanly for the right reason: the
foot is under its cut-off at both, and downtown's 0.96 % is storey lines on
towers wide enough to pass `STOREY_W_PX`, which is dark detail at the zoom §23
says nothing else can reach.

### 24.4 What it costs, timed with the queue forced inside the measurement

BRIEF trap 6 — Canvas 2D is deferred and timing a detached canvas measures JS
only. `.parity/g1cost.py` ends each timed region with `getImageData(0,0,1,1)`
on the live canvas, so the flush is inside the clock. Twelve rasterisations a
camera, three cold ones dropped, median:

```
                    without      with     delta
  street  Marina    97.70 ms   104.80 ms   +7.1  (+7.3 %)
  street  Mission  126.50 ms   136.00 ms   +9.5  (+7.5 %)
  block   downtown 320.10 ms   319.05 ms   -1.05 (the foot is under its cut-off)
```

One gradient fill per visible wall of every NEAR building, the gradient
quantised and cached on the ctx exactly as `wallGrad` is. **It cannot reach the
one surviving performance clause**: a camera move is served from a blit of a
pre-painted buffer (`camera.ts` `decideRaster`), so a move does not
re-rasterise. 7 % of a rasterisation that already runs 320 ms at its worst
camera is the honest price and it is stated rather than buried.

### 21.18 Ocean Beach: the register that carries it, and why it is still not drawn

Checked rather than assumed, and the answer is not the one the brief guessed.

**Ocean Beach IS in a published register the pipeline already fetches.** USGS
GNIS Domestic Names, California — `cache/gnis_ca.zip`, 222 rows in San
Francisco County — carries `Ocean Beach`, feature id **229920**, class `Beach`,
37.7593749 / −122.5108057, which is world **(−6407.5, −69.6)**. It carries
`Baker Beach`, `China Beach` and `Seal Rocks Beach` too, and `Lands End`,
`Twin Peaks`, `Mount Davidson`, `Alcatraz Island` and `Fort Point`.

**What stops it is the extent rule, not federalness.** `build_places.py` rule 2
is *"A PUBLISHED EXTENT. No extent, not drawn"*, and PLACES.md §4 already
measured GNIS against it: **0 of 222 rows carry an extent**, because GNIS
publishes one point per name and nothing about how big the thing is. There is
no column in the file that could: no area, no length, no polygon. A row shipped
with `span = 0` would be a name that can never appear — `placeIsBigEnough(0,
scale)` is false at every zoom and Ocean Beach is not designated, so it is not
exempt. **Shipping it would be shipping a name the map cannot draw.**

**And the seed's rule is a different rule for a different artefact, and it
stays.** `pipeline/seeds/sf_place_candidates.json` says *"only places city
money reaches … NO state/federal facilities (Presidio, Alcatraz, Ocean
Beach/GGNRA)"*. That seed feeds `/us/city/sf/places`, which is about money. **A
named ground is not a place city money reaches**, and widening that rule to let
a beach in would break what the rule is for. Ocean Beach does not belong in
that seed. It belongs in a register of named ground, and GNIS is that register.

What is actually open, precisely: **how to size a name that has a published
position and no published extent.** PLACES.md §401 already names it — *"a mark
for a place with a position and no extent"* — and the map has a lane that does
exactly that and does not need a span: `terrain.ts` `surroundNames` draws
`MARIN COUNTY`, `THE EAST BAY`, `ALCATRAZ`, `ANGEL ISLAND`, `SAN MATEO COUNTY`,
`PACIFIC OCEAN`, `SAN FRANCISCO BAY` in tracked capitals from seven positions
on the `base/surround` chunk entry, whole-city only, sized by nothing. That
lane and its seven names belong to `terrain.ts` and to `gen_context.py`, not to
this file, so the option is named here and handed over rather than taken.

### 21.19 Federal ground is invisible to gates written for city ground, and it is a pattern now

The one-line version is in the register itself. On the ground that is Ocean
Beach, the City's own registers name:

    Beach Chalet
    Beach Chalet Parking
    Beach Chalet Picnic Area
    Beach Chalet Soccer Fields Maintenance Building
    LA PLAYA/CABRILLO OCEAN BEACH SFMTA Operator Bathroom

**and not the beach.** That is not an oversight in any of those registers. The
City publishes extents because it publishes *property*; it owns the buildings
on the edge of the federal ground and not the ground, so the attribute every
gate in this pipeline depends on — a polygon — exists exactly where the City
owns land and nowhere else.

The data agent's finding this session is the same shape: **381 street
centrelines in Hunters Point, Treasure Island, Yerba Buena and Fort Mason reach
zero drawn surfaces because their classification code is null.** Federal
ground, a City attribute left empty, a gate that reads the empty attribute as
absence. Two independent gates, two federal areas, one cause — the pipeline
asks published City fields about ground the City does not publish. Worth
knowing before the next gate is written against a City attribute.

Also in this family, and already recorded: the **Presidio** answers as one
6.1 km² block with nothing on it (BUGS §17), and **Sutro Tower** — which is
private, not federal — was in none of the ten City registers, none of the
1,243 shipped marks, and not in GNIS either (§21.20).

### 21.20 Sutro Tower has a row, and the register that carries it is the map's own

A hero drawn at emphasis and never named. Checked one register at a time:
Article 10 (97yj-54sx) and rzic-39gi, Article 11 (ejht-vp5d), Recreation and
Parks Properties (gtr9-ntp6) and Facilities (ib5c-xgwu), City Facilities
(nc68-ngbr), the Tall Building Inventory (5kya-mfst — no, and it could not be:
that register's own scope is **buildings** over 240 ft and this is a tower),
Schools_College (6adp-a5yv), Schools (7e7j-59qk), POPOS (65ik-7wqd), the US NPS
National Register, the 1,243 places already in `base/marks.json`, and USGS
GNIS, which carries `Mount Sutro` (Summit, 253951) and `Sutro Reservoir`
(Reservoir, 235840) and **not the tower**.

The one published source that carries it is **the map's own hero register**,
and that register is not a guess: `base/heroes.json` names, per hero, the
register that anchors it to its footprint, the register its year comes from,
and its measured footprint area and top. Every field of the row is read off
that record; the ground anchor is `base/heroes.qc`'s own `ax`/`ay`, which is
where `part3.html` takes a hero's anchor from; and `span` is this file's own
ladder unchanged — `max(sqrt(662.0), 210.0) = 210 m`.

The rule is general and adds one row today: **a hero with no place row gets
one.** Measured: 210 m clears the 175 m the whole-city camera demands, and at
the home camera it is then refused for `grid`, losing by **six pixels of
vertical overlap** to the hood capital `TWIN PEAKS`, which names the ground it
stands on. Two true names competing for one box is not a defect in the row, and
it is not forced.

### 21.21 The emitter is deterministic; what was not stable was its INPUT

Raised as *"`emit_places.py` reorders on every run and is not stable across two
consecutive runs"*. **Tested rather than accepted, and that is not what it
does.** `emit_places.py --check` runs the whole build twice and compares:

    places.qc    identical, 42,053 bytes
    places.json  identical, 59,433 bytes
    marks.json   identical, 110,272 bytes

`order_places` is a `sorted()` with a total key over a stable input, `srcs` is
a `sorted(set)`, and nothing here reads the clock or a dict order. The
observed `base/places: expected 42032 to be 42053` is not drift: **42,032 is
the register without Sutro Tower and 42,053 is the register with it** (§21.20,
one row, 21 bytes), and the two halves were committed a commit apart by a
sweep.

**But the concern under it is real and is now closed.** This file's output is a
function of a file it does not own: `order_places` lifts hero footprints to the
front and `hero_rows` gives a hero with no place row one, so `base/places.*`
depends on `base/heroes.json`. Re-running `encode_city_chunks.py` rebuilds that
register from the mock and drops every hero `emit_heroes.py` merged in — and
this file would then write a **different, still perfectly deterministic**
`places.qc`. Two agents on one commit would hold different bytes and every
byte-count assertion in the suite would be reading one of them. That happened
three times in one night.

So the input is asserted. `_hero_bi()` compares `heroes_extra.json`'s claimed
keys against the shipped register and **refuses to write** if any is missing:

    base/heroes.json is missing pofahall, which heroes_extra.json claims.
    The city encoder has rebuilt it from the mock. Run:
        python3 pipeline/scripts/us_sf_places/emit_heroes.py
    then re-run this. The place ranking is a function of that register and
    must not be built against a stale one.

Exit 1, nothing written. An ordering built against half a register can no
longer reach disk quietly, and the message carries its own recovery.

---

## 25. Block G1 — the whole-city tier, measured; the massing solid gets its side, and it is small for a good reason

`buildings.ts` `drawMassing` · `scene.ts` `paintMassing`

The city tier had had no night's work and is the first frame anyone sees. Three
questions were set before drawing anything, and the measurements are below.

### 25.1 What the plate encodes, and the four things on the wire with no reader

`base/massing` ships per block per year: **coverage `tc`, area-weighted mean
height `th`, and the year `ty`.** `drawMassing` projected the block's ring at
`th` and filled it at `COVA[cov] * alpha`. That is the whole tier. Four things
were built every frame and read by nothing:

| built by | what | read by |
|---|---|---|
| `massLUT` | `mwall` — 24 × 16 × 7 × 4 wall entries | **nothing** |
| `paintMassing` | `wallIdx`, allocated per call | `drawMassing`: `void wallIdx;` |
| `massAt` | `cov0`, `hgt0` — the state BEFORE this year's row | **nothing** |
| `massAt` | `cohort` — the blocks that gained this year | **nothing** |

plus two hardcodes in the bucket key: `fresh = 0` and haze bucket `0`.
`part3.html` `drawMass` (L8717) reads all six. **Pattern 8 again, and this time
it is the frame the piece is most often looked at in.**

### 25.2 The tier CAN carry a silhouette, and the gate is the reference's own

Measured on the shipped payload at the whole-city camera (`.parity/g1city.py`,
`kh` = **0.0747** px per metre of height), over the 4,908 blocks with any
coverage in 2018:

```
  projected wall dh   p10 0.448  p50 0.523  p90 0.821  p99 1.195  max 1.419 px
  over 0.9 px         253 blocks — 5.15 % of blocks, 3.90 % of block area
  block ring area     16.18 % of the stage
  mean coverage       0.316
```

`MASS_WALL_PX` = **0.9**, and the reference's reason is exactly what the
numbers say: *"the median block's mean height is 7 m, which projects 0.4 px of
wall at the whole-city camera, and adding that to five thousand blocks is a
vertical comb, not a city. Downtown, where the mean is 40 m and up, keeps its
rise."* The gate keeps the 5 % that is downtown. It is a CUT-OFF — a block
under it draws exactly the plate it drew before — and the whole pass exists
only between the whole-city stop and the district one, because `paintMassing`
returns at `alpha = 1 − tierW(z) ≤ 0.004`, which is `z ≥ 2.35`.

`wallIdx` is now the mock's own `WI`: `legendTones` — the same function
`decodeBld` uses for the 3.8 % of footprints that join no roll row, whose four
candidate arrays are `part3.html` L5716-5721 element for element — read on the
block's centre, over `buildURND`, which is byte-for-byte the mock's `RND` (same
xorshift, same 19060418 seed). **It is a legend and it is declared as one**, and
unlike `RI[b]` it was never overwritten by a measurement because nothing
published measures the side of a block.

### 25.3 And it is worth 0.183 % of the frame, because the silhouette was already there

A/B against a terminal disable (the guard, not the threshold — §24.3):

| camera | changed | direction |
|---|---|---|
| whole city | 5,969 px, **0.183 %** | −11.2/channel, 99.6 % darker |
| district | 1 px | `massed` is 0 there; the tier is off |

**That is the honest answer to "can the massing tier carry a silhouette", and
it is mostly no** — not because the tier cannot, but because *the silhouette is
already carried by a rule further up*. `build_lod.py` makes a **SOLO** of every
building at least 20 m at its derived top — 1,753 of them — and a solo is drawn
as itself at every zoom, excluded from its block's coverage and mean. So
downtown's towers were already standing at whole-city zoom as themselves, and
what the block wall adds underneath them is the 253 blocks' worth of mass
between the towers. Before and after are `out-g1/sky-{before,after}.png` and
they are very nearly the same picture.

Landed anyway: it costs nothing under the gate, it removes two dead passes, and
the mass between the towers is the part of downtown that was flat. **But it is
not the whole-city fix**, and this section says so rather than banking 0.183 %
as a win.

### 25.4 The rebuild wave is on the wire, dated, guarded — and not drawn

`massAt` already computes `cov0`/`hgt0`/`cohort`; `part3.html` reads them for
two things production does not do: a block **grows into** its new mass over the
arrival phase (`cov = cov0 + (cov − cov0)·MPH`) instead of stepping into it,
and a block that genuinely grew takes the six-year ochre.

The guard is the interesting part, and it is measured (`g1city.py`). The roll
dates 12,594 parcels to exactly 1906 as its "not known", so an `age`-only tint
puts the Presidio in ochre in the 1906 frame. `part3.html` gates on the share of
the block's coverage that is NEW — `grew = (cov − cov0) ≥ 0.15·max(1, cov)`:

```
  year   blocks with cover   dated this year   and grew >= 15 %
  1906         1,889              1,359            1,228   90.4 %
  1907         2,191              1,258            1,086   86.3 %
  1908         2,387              1,419            1,097   77.3 %
  1909         2,440                823              486   59.1 %
  1912         2,665                973              518   53.2 %
  1960         4,612                428              101   23.6 %
```

**More than half the city's blocks change in 1906-1908 and nothing on screen
says so.** The guard is doing real work — it removes 10 % of the 1906 cohort and
23 % of the 1908 one — and the decay from 90 % to 24 % is the rebuild ending.

NOT built here, deliberately: the arrival phase belongs to the film's clock
(`risePh`, and `paintMassing` does not currently take it), and a treatment the
film cannot drive is worse than none. **The contract the film needs is: pass the
year's phase into `paintMassing`, and repaint only `row.cohort`** — because a
massing solid is drawn at an alpha equal to its coverage, so repainting the
whole city's massing twice composites `cov` twice and lands at `1−(1−cov)²`.
`massAt`'s doc comment already carries the screenshot of that mistake.

---

## 26. Block G1 — the street centrelines had never been drawn, anywhere, in any year

`scene.ts` `paintStreets`

The data agent found it and did not land it. `drawCentrelines` returns on its
first line when handed no `lines`, and this call site passed none — and reached
it only after an early `if (!cells.length) return 0` on the SURFACE cells,
which do not exist below z = 1.75. **4,895 published centrelines, decoded by
`data.streetLines()` — which had no caller outside its own tests — over a map
already writing PRESIDIO BLVD and MASON ST as labels with no line under
either.** Pattern 8 for the seventh time tonight.

### 26.1 The line layer was gated on the SURFACE layer's constant

Two changes, and the second is the one that matters. The first is the eight
lines of wiring `DATA.md` §15.7 wrote out. The second is that
`scene.render` dispatched the whole method behind `streetsResolve(cam.scale)`,
which is the **right of way's** own published rule — the layer is worth
dispatching when the city's `w_p90` clears `ST_EXT_PX` = 2 px. At the
whole-city camera that is `25.7 × ST_KPROJ × 0.0467` = **1.47 px against a 2 px
gate**, so the surface correctly declines and the lines were declining with it.

A centreline is a stroke of fixed pixel width and is legible at every zoom this
map has. `paintStreets` now draws the lines first and applies `streetsResolve`
to the surface only — and the cull loop stays behind the gate, which is what
the gate is for. This method's own doc comment already named the fault two
paragraphs above the line that committed it: *"a layer that asks another
layer's constant whether it should draw is not gated, it is coincident."*

### 26.2 Measured before it was turned on, then after

Ink as a share of the stage, from the payload (`.parity/g1lines.py`), at
`ST_LINE_INK` alpha 0.20:

```
  camera      band 0    band 1    band 2
  whole city  1.194 %   1.194 %   1.194 %      (class 0-2 is all there is up here)
  district    1.035 %   2.093 %   3.365 %
  block       0.552 %   0.623 %   1.308 %
```

And the A/B on the shipped page, only the `drawCentrelines` call differing:

| camera | changed | | |
|---|---|---|---|
| whole city 2018 | 32,568 px | **1.001 %** | −20.6/ch, **100 % darker** |
| district, Palace of Fine Arts | 20,630 px | 0.634 % | −16.7/ch, 100 % |
| district, Presidio | 20,014 px | 0.615 % | −16.6/ch, 100 % |
| block | 25,480 px | 0.783 % | −15.5/ch, 100 % |
| street | 10,584 px | 0.325 % | −20.7/ch, 99.8 % |
| whole city **1906** | 14,690 px | 0.451 % | −24.1/ch, 100 % |

Not one changed pixel got lighter. The predicted 1.194 % of stage at the city
camera lands as 1.001 % measured, which is the fade doing its job on the
classes whose right of way has become a surface.

**Where it lands is the point.** The diff mask (`out-g1/dl-G1p-dist-pres.png`)
is the Presidio and Golden Gate Park and the unbuilt edges, and almost nothing
in the built grid — because pass 0 fades exactly as the right of way becomes a
surface. `out-g1/pres-{ln0,ln2}.png`: MASON ST and PRESIDIO BLVD now have a
road under their labels, and the Presidio has a road network instead of trees.

1906 was checked, because 311 of the drawn features carry no year and the
encoder's contract draws an undated line in every year. The 1906 whole-city
frame is `out-g1/G1n-city-1906.ln1half.png` and it is a mostly empty peninsula
with a faint line network, not a modern road grid over a burned city.

### 26.3 The band gate IS a step, and here is its size — NOT resolved

`ST_CLS_MAX` is `[2, 3, 4]` and `bandOf` is a hard step, so crossing a boundary
admits a whole street class in one frame. Held-camera, at the district camera,
band 0 → band 1 adds class 3: **1.057 % of the stage of new dark ink, in one
frame.** That is a step in the derivative and it will be visible.

It is `part3.html`'s own design, so it is parity rather than a regression
introduced here — but it is named with its number rather than waved past. **The
held-scale frame sequence the brief asks for was attempted twice and did not
complete**: the page was destroyed mid-run by concurrent dev-server recompiles
both times (`g1band2.py`). The first attempt (`g1band.py`) shot four zoom
levels either side of each boundary and diffed neighbours, and **that test is
worthless and is recorded so nobody repeats it**: every pair changed 89–98 %
because the zoom itself moved, and the crossing pair (96.9 %) sat inside the
spread of the non-crossing ones (89.3 / 94.4). *A test whose control moves as
much as its treatment measures nothing.*

### 26.4 And it will not move the histogram

`BUGS.md` §23 has the low/high-frequency split: the district gap is entirely in
the LOW-frequency image, +11.7 to +13.7 mean, +23.5 in the darkest decile.
1.0 % of frame at 20 % alpha cannot be that, and this section says so rather
than banking a real bug fix as a fix for a different problem. See §27.

### 21.22 The Transamerica Pyramid was 68 m tall, and the cause is a median

The famous set, worked through the way §21.14 audited it. Two of the three the
brief flagged turned out not to be broken, and saying so is the finding:

- **City Hall's dome is drawn and it reads.** `fam-cityhall-blk.prod.fam.png` —
  a gilt-capped drum with its finial, unmistakable at block zoom. 33 parts.
- **The Ferry Building's tower is drawn and it reads.** `fam-ferry-str.prod.
  fam.png` — clock faces, arcaded belfry, terracotta pyramidal roof, and the
  arcaded hall under it. 13 parts. Nothing to do to either.
- **Sutro Tower now carries its name** (§21.20) and draws as a needle rather
  than a trident. Its published ring traces the three legs and the hero uses
  them; the cross-arms are not in any field here, so they are not drawn.

**The one that was broken is the Transamerica Pyramid, and it is a measurement
error rather than a taste one.** The fabric's drawn height is
`ynuv-fyni hgt_mediancm` — *the MEDIAN LIDAR return over each footprint*, the
mock's own `MEASURED.height`, verbatim. The median is exactly the right
statistic for a flat-roofed box and **exactly the wrong one for a spire**:
most of a tapering tower's footprint lies under its wide base, so the median
sits near the bottom.

> **An 853 ft tower was drawn 68 m tall**, and its shaped `campanile` cap was
> then carved *inside* that 68 m solid. `pyr-blk.prod.before.png`: the most
> recognisable tower in San Francisco is not findable in its own skyline.

Nothing about the replacement is authored. Every number is off DataSF
**5kya-mfst**, the Tall Building Inventory — a register `build_places.py`
already reads for names, whose scope is every building over 240 ft:

| field | value | used for |
|---|---|---|
| `height_ft` | 853 | the top, 259.99 m |
| `description` | "50 story WSMF with 11 story architectural cap" | the shaft/cap join |
| `date`, `completion_date` | 1972 | the year |
| `facade_material` | "concrete panel and sheet metal" | the two materials |
| `base_plan_size` | 165x165 | **not used** — see below |

**The taper has no free parameter.** A pyramid is the surface between its base
and a point at its top, so the plan scale at height `z` is `1 − z/top`. The
description's own two numbers put the join at `50/(50+11)` of the height —
**213.11 m**, where the plan is `11/61 = 0.1803` of the base. A check on that
split rather than an assumption: 853 ft over 61 storey-equivalents is **13.98
ft a storey**, and the register's own `typ_story_height` on comparable rows
reads 14'9". The two halves differ in material, not in shape.

### 21.23 The base took three attempts and the two failures are the useful part

**`base_plan_size 165x165` is not used, and the disagreement is worth stating.**
That is a 50.3 m square, 2,529 m². The measured footprint is 2,982 m² and its
main quadrilateral is about **45.7 × 53.6 m** — a 50.3 m square does not fit
inside a 45.7 m width. The published plan is a design figure; the footprint is
a measurement of the thing standing there, and every other hero stands on its
own footprint.

The footprint is not convex — a 9 × 7 m tab on one corner, the lift and stair
projection — and a profile scales about the **area centroid**, which is
inside-preserving only on a convex ring. Two obvious repairs, both measured,
both rejected:

| repair | measured | why not |
|---|---|---|
| the convex **hull** | 3,127 m², **4.9 % MORE ground than the published footprint** | it draws outside the record — and it **slips a vertex-only gate**, because a hull's vertices are always ring vertices, so §11's gate as written passes it at a shrink of 1.0 while 146 m² of solid sits over the notch |
| hull, then §11's shrink | scale **0.806** | sits on §11's own 0.80 authoring-error floor and throws away a third of the base |

**What is used is the largest convex figure the published footprint contains,
on the footprint's own vertices: 2,945.0 m² of 2,982.0 — 98.8 %, six of its
eight vertices, no shrink, no relaxation.** What it drops is the tab, which is
not the tower's plan.

**And the convex-hull REFERENCE was not taken.** `data.test.ts` asserts *"Sutro
Tower alone is granted the convex-hull reference, with its reason"*, and taking
it here turned that test red — which is the test doing its job. That invariant
is deliberate: Sutro's ring traces three open steel legs and is not a slab; a
parcel outline with a lift tab on it is not the same case. The test is
unchanged.

Measured after: `em` 2.569 / 1.063 / 1.0, so it is drawn at true size from
district zoom in and emphasised only on the wide frame. `pyr-blk.prod.
after.png` — the tallest thing in the Financial District, and named.

**A note for whoever owns the building heights**: this hero routes *one*
building around `hgt_mediancm`. The statistic is wrong for every tapering
tower, not just this one, and a hero is not the general fix.

### 21.24 What was checked and rejected, so the list is not re-walked

- **Cliff House and Sutro Baths: zero shipped footprints within 420 m.** Both
  stand on GGNRA land at Point Lobos, outside the drawn city — no ring, no
  anchor, no measured top, and a hero needs all three. Same family as §21.19.
- **The 297 designated places drawn as bare prisms, rejected as a class.**
  Ranked by span: the Alcoa Building (116 m, 4 vertices), the Italian American
  Bank, Mission High School, the High School of Commerce, the Chronicle
  Building, the Palace Hotel garden courtyard, the Mills Building, the Fairmont
  Hotel, the Phelan Building, the Cable Car Barn. **Almost every one of them
  IS a prism** — a downtown block with a flat roof — and the ones that are not
  (Grace Cathedral's towers, Mission High's tower, the Fairmont's mansard) need
  per-element heights no field here carries, which is the test Grace Cathedral
  failed. A shaped cap on any of them would be a guess about taper.
- All three are in `heroes_extra.json` under `rejected`, with the numbers.

### 21.25 The Pyramid was one of a class, and the class splits three ways

The Pyramid's fix routes one building around `hgt_mediancm`. Before handing
that statistic to whoever owns it, the size of the problem, measured: the Tall
Building Inventory publishes `height_ft` on every row, **99 of its rows reach a
drawn footprint**, and comparing the two gives

> **79 of 99 are drawn short. Median shortfall 21.8 m, worst 231.1 m. 34 are
> under 60 % of their published height.**

That is not one defect. Sorted by cause it is three, and two of them are not
the median at all.

**A — the row joined the wrong footprint. 8 rows, and this one is mine.**
`resolve()`'s rule is `max(area)`: the biggest ring on the parcel wins. That is
right for a register that publishes only a point, and wrong for a tower
standing on a podium. Spear Tower took a 28 m ring with a 172 m one beside it;
Four Embarcadero Center an 11 m ring with a 151 m one; the PG&E Building a 12 m
ring with a 145 m one. **It is the same rule as the label lane's "the biggest
place wins" (§21.12), failing the same way.**

Fixed where the row carries a published height: the tie is broken on **height
agreement** instead of area. Every other register is untouched — none of them
publishes one, `hft` is absent, and the rule falls straight back to
`max(area)`. Measured churn over a full rebuild: **123 of 897 joins broke the
tie on height, 6 rows changed footprint, 4 rows gained one, none lost one.**

| | before | after |
|---|---|---|
| Spear Tower | span 76 | **172** |
| One Embarcadero Center | 54 | **157** |
| Four Embarcadero Center | 56 | **151** |
| Hilton San Francisco | 72 | **148** |
| Grand Hyatt San Francisco | 45 | **129** |

**B — the LIDAR is older than the building. Not mine, and it is a clean
gradient rather than a guess.** Median drawn/published by completion year:

| completed | n | median drawn / published | under 60 % |
|---|---|---|---|
| before 1990 | 72 | **0.92** | 20 |
| 1990–2010 | 17 | 0.63 | 8 |
| 2011 or later | 10 | **0.46** | 6 |

Park Tower, completed 2018, is drawn **5 m** against a published 173.1; Folsom
Bay Tower, 2017, **7 m** against 121.9; Oceanwide Center I, 2017, **28 m**
against 259.1. Those are excavations and podiums — the survey flew before the
tower existed. `TODAYS_SHAPE` says the map draws a building at its *present*
height, and for these it does not.

**C — the median is the wrong statistic for a taper.** What is left once A and
B are removed, and the Pyramid is its worst case. The pre-1990 median of 0.92
is the useful number here: `hgt_mediancm` is fine for the flat-roofed box it
was chosen for and fails on the shapes that make a skyline.

**A is fixed. B and C are handed over with these numbers** — and the fix for
neither is a hero.

---

## 27. Block G1 — the buildings' colour tables are exonerated, the way the ground was

`buildings.ts` §READ THE VALUE OUT OF BOTH BUILDS · `palette.ts` · `.parity/g1clut.py`

BUGS.md §23 put the district gap entirely in the LOW-frequency image — +11.7 to
+13.7 mean, +23.5 in the darkest decile — and three independent lines pointed
here, at *"whatever lifts the SHADED end of the built layer — the wall's
lambert ramp's bottom quartile, the aerial fade, or the haze index."*

**It is not the tables.** `colourLUT`'s source was first read line for line
against `part3.html` L6018-6100 and matches, including the placement of `gain`
— which is the trap: the reference shades the BASE by `gain` and skylits with a
bare lambert on the index-0 path, and multiplies `gain` INTO the lambert on the
fresh path, and production does both the same way. So the instrument, following
§GROUND: export the function OBJECTS the renderer runs, reach the reference's
declarations, sample the whole input domain, subtract.

### 27.1 The index shift again, and it has to be read before it is believed

Raw, the roof tables look catastrophic: 1,552 of 2,688 entries differ, dL mean
+28. They are the same colours at shifted indices, which is §15.5 restated:

```
  roof palette   mock 69   prod 56        PAINT_C0  mock 37   prod 24
  wall palette   mock 37   prod 24
  prod[i] == mock[ i < 24 ? i : i + 13 ]   — verified, for BOTH palettes
  in mock and not in prod: 13   ·   in prod and not in mock: 0
```

The 13 are the class wash `LRD.cls` §15.5 already named as the last material
difference — 1,052 footprints, 0.6 % of the city, still the natural next chunk
and still not a frame-wide shading term.

### 27.2 Aligned, they are the same table

Over **3 fades × 3 camSteps × 4 tables**, with production's palette index
mapped onto the reference's:

```
  wall     IDENTICAL, every entry, every fade, every camStep
  wallF    IDENTICAL — 18,432 of 18,432
  roof  }  476 of 300,672 entries differ in total
  roofF }  worst |dL| anywhere  2.11
```

**476 of 300,672, worst 2.11 luminance steps**, and those are hex-rounding in
`shade`/`lerpHex` at a channel boundary, not a term. Against a gap of +11.7 to
+23.5 this exonerates the building colour tables the way `g2fn.py` exonerated
the ground — and it exonerates the coordinator's prime suspect specifically:
**`wallF` is bit-identical, so the wall's lambert ramp and its bottom quartile
are not it.**

### 27.3 The sun pass IS missing, and it is worth a tenth of the gap

`part3.html` ships an entire shadow block production does not have. `SN`
(L2124): `on/bld/mass/terr` all 1, **`step: 32`** luminance steps subtracted
inside a shadow, `cool: 1` (in the SUN's own colour), `minpx: 0.7`,
`punchpx: 14`, `masscov: 128`. `sunCast` builds a full-resolution mask in depth
order — footprint UNION its offset copy plus the sweep quads — punches every
drawn body back out, and blits under `globalCompositeOperation = "difference"`,
which is a **constant subtraction** rather than a proportional multiply.

Production ships `drawCity`'s FALLBACK branch instead (`SHADOW_FILL`), and both
`buildings.ts` and `SHELL.md` §8 already say so — as a deliberate cost
decision whose visual cost had never been priced.

Priced (`.parity/g1sun.py`, the mask rasterised exactly as `sunCast`/`sunFlush`
build it, not estimated):

```
  camera             casters  punched   swept %   net mask %   x32     BUGS 23
  A4  city             5,834        3      0.71         0.27   0.09        4.9
  B1  district        48,107       29     15.54         3.40   1.09       11.7
  B4  district        89,626      169     29.35         6.56   2.10       13.7
  D1  street             262      257     24.89         0.47   0.15        0.2
```

**It accounts for 9-15 % of the district gap and it is not the answer** —
agreeing with the coordinator's independent +2.7 / +2.5 in the darkest decile.
Two things in that table are worth keeping. The ORDER is right (district ≫ city,
street ≈ 0), and the street camera explains itself: **257 of 262 casters clear
`punchpx`**, so at street zoom the mask punches itself away, which is exactly
where BUGS §23 measures no gap at all.

The first version of this measurement marked BOUNDING BOXES and reported a net
mask of 0.28 %. That is worthless and is recorded so nobody repeats it: the
mask is the DIFFERENCE of two nearly coincident regions, and a bbox punch
swallows the swept crescent entirely.

### 27.4 What this leaves, stated precisely

The table a pixel reads is identical. What a pixel gets is the table **plus the
index chosen for it** — `roofNF[((ri·HZL + hz)·NF1 + fi) << 2 | rsh]`. So the
remaining search space is not a value, it is a **selector**: `ri` (which palette
entry), `hz` (the haze band), `fi` (the freshness/arrival), `rsh` (the published
height quartile). Those are four small integer distributions, each comparable
between the builds by the same instrument that settled the tables — dump the
histogram of each on both sides at one district camera and subtract. That is a
much smaller search than the one this block started with, and §27.2 is what
made it small.
