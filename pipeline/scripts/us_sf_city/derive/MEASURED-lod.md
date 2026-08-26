# Block L — level of detail: what is drawn at each scale, and why

2026-08-22. Owner of `lod/`. Delivered as a patch. `gen/` and `nav/` untouched —
verified: `gen/part3.html` contains no `LODM`, and the tree is unmodified.

```
python3 lod/build_lod.py                      -> lod/lod-data.js   (105 KB gzip)
python3 lod/patches/lod_tiers.py --check       report, change nothing
python3 lod/patches/lod_tiers.py               apply to gen/
python3 lod/proto.py                          -> lod/mock-lod.html (gen/ untouched)
python3 lod/raster.py  <label> [url]           drawCity + forced flush, per zoom
python3 lod/fps.py     <label> [url]           rAF frames per second
python3 lod/labels.py  <label> [url]           labels placed, by published class
python3 lod/shot.py / pair.py / sweep.py / wave.py / lmshot.py / lbshot.py
```

`--check` reports 28 `WOULD` against `gen/` as it stands, no `NO MATCH`. It
composes with `form/patches/stepped_massing.py` (Block C) in **either order** —
see §9. `lod/proto.py` applies C first and then this, which is the build every
number below was taken on.

---

## 1. The defect, as a measurement rather than as a word

Daniel: *"it just looks like a zoomed out blob of stuff and when you zoom in the
thousands of elements make it overwhelming."*

At 1440 × 940 the camera fits the city at `cam.base = 0.05565`. At the 315°
bearing the projection is axis-aligned, so that is exactly

| | px per world metre |
|---|---|
| across the screen | `1.2247 × cam.scale` = **0.0682** at whole-city zoom |
| down the screen | `0.7071 × cam.scale` = **0.0394** |
| of building height | `0.7071 × 1.6 × cam.scale` = **0.0630** |

Measured off the live page (`lod/probe.py`), the projected width of a building:

| z | camera | buildings in frame | median building | p90 | block |
|---|---|---|---|---|---|
| 1.0 | whole city | **166,166** (all of them) | **1.02 px** | 1.64 | 8.3 × 7.5 px |
| 2.9 | district | 81,003 | 2.96 px | 5.34 | 24 × 22 px |
| 7.2 | block | 14,758 | 8.83 px | 16.2 | 60 × 54 px |
| 12 | free max | 4,541 | 16.4 px | 31.1 | 100 × 90 px |

So the whole-city frame decides an outline, a three-tone roof, a four-step wall
ramp and a 0.7 px ink stroke **166,166 times**, and every one of those decisions
lands inside a single pixel. The frame is not short of information; it is
carrying information at a frequency the frame cannot hold, and the eye
integrates it into grain. **That is the blob, and it is not fixable by drawing
the same thing better.**

The same table says what the atom should be. The median assessor block is
8.3 × 7.5 px at whole-city zoom. **A block is the smallest object on this map
that a whole-city pixel can resolve.** At that scale the block is the atom and
the building is noise.

---

## 2. The ladder

`z` is `cam.scale / cam.base`; 1 is "the whole city fits the strip".

| tier | range | what is drawn | count |
|---|---|---|---|
| **MASSING** | `z < 1.55` | one solid per published assessor block, on the block's own ring, extruded to the area-weighted mean of the LIDAR heights standing on it *that year*, painted at an alpha equal to its measured built coverage. Plus every SOLO. | 5,404 solids + 15,261 solos |
| **DISSOLVE** | `1.55 ≤ z < 2.35` | both, blended | scales with `w` |
| **BUILDINGS** | `z ≥ 2.35` | every footprint, as before | up to 81,003 |

**Where the two numbers come from.** The median building is 1.02 px wide at
`z = 1` and width is linear in `z`.

* `LOD_Z0 = 1.55` puts it at **1.6 px**. Under two pixels, a filled outline and
  its 0.7 px stroke are one smudge; there is nothing an outline can say.
* `LOD_Z1 = 2.35` puts it at **2.4 px**, the first width at which a San
  Francisco house is separable from the one it shares a party wall with.

Neither is round and neither was picked. Both are `median projected width /
cam.base`. Note where they sit: **between** the whole-city preset (1.0) and the
district preset (2.9), never on one. A representation change belongs between
two stops, not at one a reader sits on.

Inside the building tier nothing changed conceptually. The four-point
silhouette, the near path and the batched path are all still chosen **per
building** off its own projected width, which is what makes that half of the
ladder pop-free by construction: buildings promote one at a time, staggered by
their own size, so there is no boundary to cross. One thing was *wrong* there
and is fixed — see §5.

---

## 3. Aggregation, not decimation — and what is never aggregated

`lod/build_lod.py`. Every building is joined to the assessor block whose
**published ring contains its centroid**. Containment and nothing else: a
"nearest block" rule would put a pier, a Presidio barracks or a Golden Gate Park
structure inside whichever block happened to be closest and then draw it there.

```
assigned      152,352 of 166,166   91.7 %
unassigned     13,814              8.3 %, 3.14 km² of 31.77 km² of built area
```

The unassigned are not a rounding gap — measured, their **median distance to the
nearest block ring is 31.6 m**, and only 0.8 % are within 3 m. They stand on
land the assessor does not divide into blocks. They are drawn as themselves.

Per block, per one of that block's **own distinct build years**, the table
carries built coverage and the area-weighted mean height, cumulatively.
45,450 rows over 5,404 blocks, 234 KB raw / **105 KB gzip**. No era buckets, no
smoothing: a block's mass in 1911 is exactly the buildings the roll dates 1911
or earlier, so nothing appears a year early or a year late.

**A SOLO is drawn as itself at every zoom** and is excluded from its block's
coverage and mean, so nothing is counted twice:

```
outside every assessor block                   13,814
at least 20 m high AT ITS DERIVED TOP           1,753   (1,556 at the base)
                                        total  15,261
```

The tall test reads `max(base, Block C's derived top)`, not the base. The Ferry
Building publishes a 15.2 m median over a 71.4 m maximum; a test on the base
folds its clock tower into a block mean and the waterfront loses its silhouette.
Reading the top costs **+169 solos, +1.1 %**, and pulls 169 of the 488 stepped
buildings out of a mean. 334 of the 488 are solos in the shipped build (asserted
live, §9). This is Block C's measurement, reproduced here, `form/BLOCK-C.md` §7.

### Why coverage is the tone, and why it is an alpha

A block is painted at `globalAlpha = coverage`. That is not a style choice: at
8 px a block, every pixel is already a coverage-weighted average of roof and of
the ground between the roofs, and `cov·roof + (1−cov)·ground` is exactly what a
fill at alpha `cov` over the terrain computes. The Sunset comes out pale because
it is 46 % built, Chinatown solid because it is 88 %, and the Presidio
disappears into its own hillside because it is 3 % — and nobody decided any of
those three.

One free number: `MASS_GAIN = 0.85`, a gain on the tone, the same instrument
and the same argument as the existing `COVER_GAIN`. It is not chosen by eye —
it is the value at which the mean luminance of the stage **matches** the build
it replaces, over the same 800 × 450 crop of the same frame:

```
2018, whole city    before 177.7  after 177.8    sd 39.4 -> 34.1
1906, whole city    before 199.2  after 198.6    sd 31.6 -> 29.4
```

The mean is held and **what left is the standard deviation** — that is the whole
claim this tier makes, and it is why the correction is on the tone and not on
the alpha (an exponent under 1 lifts a 3 %-built block too, and Golden Gate Park
came back as a grey wash; `shots/l-after-2018-whole.png` at an earlier revision).

---

## 4. The dissolve: a dither, not a cross-fade

A tier change that snaps is worse than no tier system, but a straight alpha
cross-fade of two opaque representations is a ghosted double image and costs the
sum of both.

So: the massing fades on alpha, and the buildings arrive by a **per-building
stochastic threshold** — building *i* is drawn when `URND[i] < w`, using the
deterministic noise the file already carries. Three things follow.

1. **Nothing pops.** Each building appears on its own, at a projected width of
   1.6–2.4 px, which is below the size at which an appearance is an event.
2. **The same buildings are the same buildings** from one rasterisation to the
   next, because the threshold is on a fixed per-building number, not on a
   shuffle. A blit that magnifies an old raster and a fresh raster at a slightly
   higher `w` differ by *more grain*, not by a different picture.
3. **It is cheaper than either end.** Cost is proportional to `w`, so the
   transition band is not the sum of the two tiers.

`shots/l-after-dissolve.png` is the strip: eight cameras from z = 1.0 to 2.9 in
one 520 × 340 crop, each captioned with its own `w`. No two adjacent frames are
a different picture.

**What the tier is keyed on, and why it cannot make zoom jumpy.** `tierW()` is a
pure function of `cam.scale`, which is already in every layer key the renderer
has. It changes nothing about `proj()`, so it cannot invalidate the blit the way
the sprite ladder did — it only changes what a rasterisation paints, on frames
where a rasterisation was going to happen anyway. It is added to `part4`'s `ck`
and to `nav/glue.js`'s `contentKey` **quantised to a 32nd**, because at full
precision a wheel zoom would rasterise every frame, which is exactly the old
bug.

---

## 5. The measurement mistake that nearly shipped a regression

The first version of `lod/raster.py` timed `drawCity()` into a detached canvas
and reported the whole-city frame at 10 ms against 112. It was wrong. **Canvas 2D
in Chrome is deferred**: `drawCity()` records commands and returns, and the
rasterisation happens later, on whatever forces a flush. With no readback it may
never happen at all.

Under that broken measurement, raising `NEAR_PX` from 9 to 26 looked like an 8×
win at block zoom. `lod/fps.py`, counting real `requestAnimationFrame` frames,
said the frame rate had gone **down**. Adding `getImageData(0,0,1,1)` inside the
timed region reproduced the fps result:

```
NEAR_PX             9        26          (drawCity + flush, 2018, DPR 2)
  z = 2.9       291.5     373.2
  z = 4.57      328.0     441.0
  z = 7.2       156.0     212.6
```

Moving a building off the near path does not remove its geometry, it moves it
into a shared `Path2D`, and **one `fill()` of a path holding a thousand
overlapping subpaths costs the rasteriser more than a thousand fills of one quad
each.** The JS got cheaper and the frame got slower. `NEAR_PX` stays at 9. The
lesson is in the header of `lod/raster.py` so nobody re-walks it.

What *did* survive that test is the removal of a **zoom cliff**: the four-point
silhouette was gated on `cam.scale < 0.25`, i.e. `z < 4.49`, so the instant the
camera crossed 4.49 every building in frame went from four points to its full
outline **with a lit face per edge**, at a median width of 4.6 px. The worst
frame in the whole piece sat exactly on the wrong side of that step. The rule is
now the pixel rule alone (`px < QUAD_PX`), continuous in zoom and staggered
across buildings: 328.0 → 291.7 ms at z = 4.57, 156.0 → 142.6 at z = 7.2.

---

## 6. Frame rate, before and after

`before` is Block C applied and nothing else — C is cost-neutral (227.0 ms at
whole-city 2018 against 229.6 for bare `gen/`), so this isolates the ladder.

**`drawCity()` plus a forced flush, ms, median of 15, 1440 × 940 DPR 2**

| year | z | C only | C + L | |
|---|---|---|---|---|
| 1906 | 1.0 | 26.9 | **11.7** | 2.3× |
| 1906 | 1.703 | 46.9 | **25.9** | 1.8× |
| 1906 | 2.9 | 59.5 | 60.7 | — |
| 1906 | 7.2 | 30.9 | 29.7 | — |
| 1936 | 1.0 | 119.6 | **27.8** | 4.3× |
| 1936 | 1.703 | 196.9 | **70.0** | 2.8× |
| 1936 | 2.9 | 192.8 | 210.3 | −9 % |
| 1936 | 4.569 | 226.7 | **221.5** | — |
| 1936 | 7.2 | 106.8 | 112.1 | — |
| 2018 | 1.0 | 227.0 | **44.2** | **5.1×** |
| 2018 | 1.703 | 319.4 | **108.8** | **2.9×** |
| 2018 | 2.9 | 277.0 | 303.1 | −9 % |
| 2018 | 4.569 | 305.5 | **299.3** | — |
| 2018 | 7.2 | 142.4 | 149.7 | −5 % |

**rAF frames per second** (`lod/fps.py`) — this one cannot be fooled by deferral:

| | C only | C + L |
|---|---|---|
| pan, whole city | 6 | **13** |
| pan, district | 6 | 7 |
| pan, block | 12 | **13** |
| play 1907, whole | 73 | **81** |
| play 1925, whole | 67 | **90** |
| **play 1948, whole** | **31** | **90** |
| play 1948, district | 30 | 31 |
| held, whole / block | 120 / 120 | 120 / 120 |

**1948 at whole-city zoom — the dense-year playback case — goes 31 → 90 fps.**
Panning the whole city doubles. District and block are unchanged within run-to-
run noise; the ±5–9 % swings in the table above reproduce in both directions
across runs and are not a signal.

**What is still slow, stated plainly.** District zoom in 2018 is ~300 ms for a
full raster and the ladder does not help it, because at `z = 2.9` every one of
59,398 buildings is above `LOD_Z1` and is meant to be drawn. That cost is
**rasterisation-bound at DPR 2, not JS-bound** — the §5 experiment proves it, and
it is why batching harder makes it worse. It needs a fill-rate answer (fewer
quads per building, or a lower-resolution motion raster), not a culling one.

---

## 7. Hierarchy: the street labels

Flagged in review on the downtown block frame: ANNIE ST, STEVENSON ST, NATOMA ST
and MINNA ST — service alleys — lettered at the same size, weight and colour as
MONTGOMERY ST, THE EMBARCADERO and COLUMBUS AVE, with about thirty names
competing and none winning.

Two causes, both fixed from the city's own classification and never from a list
of important streets. `geo/build_streets.py` already maps DataSF `3psu-pn9h`
`classcode` to a rank: 2 and 3 (major arterial, arterial) → 0, 4 (collector) →
1, 5 (local residential) → 2, 0 (minor and private court) → 3, freeways and
ramps last.

1. **The budget was spent in file order.** An alley reached the collision grid
   before the arterial it runs behind, took the space and took the slot. Labels
   are now placed in published-class order, longest stretch first within a
   class, and the local classes may take at most 45 % of the budget.
2. **Every label was set identically.** Three treatments now, keyed on the same
   published class: size ×1.16 / ×1.00 / ×0.86, weight 700 / 600 / 500, ink
   .90 / .74 / .54 — about 30 % apart in size and better than 40 % in value,
   which ART-SPEC §7.3 puts well above the threshold at which two treatments
   read as one.

Measured on that frame (`lod/labels.py`), and the point is the third column:

| | C only | C + L | by class (arterial / collector / local) |
|---|---|---|---|
| whole city | 40 labels, 52.7/Mpx | 35, 46.1/Mpx | 13 / 0 / 0 |
| district | 44, 58.0/Mpx | 43, 56.6/Mpx | 23 / 3 / 0 |
| block | 30, 39.5/Mpx | 30, 39.5/Mpx | **13 / 9 / 8** |

Before, the block frame's 30 labels were one undifferentiated class. See
`shots/l-pair-labels-block.png`.

**And three magic numbers turned out to be one rule.** `minLen` gated a label on
the street being 1100 / 420 / 150 m long, by `cam.step`. At the three preset
cameras those are **75 px, 82 px and 74 px** of projected street, and a street
name at these sizes measures 70–90 px. They were one rule written three times:
*a name is only written where the thing it names is at least as long as the
name.* Stated that way it is continuous in zoom instead of stepping at a band
boundary, and it scales with the length of the name rather than treating GEARY
BLVD and JUNIPERO SERRA BLVD alike.

---

## 8. What else was tried and rejected

* **`NEAR_PX` 9 → 26.** §5. A regression, measured in both harnesses.
* **Coverage as a lerp toward an opaque ground tone**, instead of as an alpha.
  Golden Gate Park, the Presidio and Treasure Island came back as flat tan slabs
  laid over the hillshade, because a 3 %-built block still painted 100 % of its
  own area. The screenshot is what killed it.
* **A coverage exponent (`cov^0.72`) to hold the stage luminance.** It works on
  the mean and it lifts a 3 %-built block to 12 % as well. The correction moved
  onto the tone, where it leaves an empty block empty.
* **1.35 px of *extra* street inset at the massing tier.** An assessor block
  already excludes the right-of-way, so two neighbouring rings are ~21 m apart —
  1.43 px at whole-city zoom, already over the 1.35 px VISUAL-SPEC §4.5 asks a
  street to hold. Insisting on more ate 19.8 m off every edge and the Sunset came
  out as thin stripes with ground between them. It is a 1.5 m hairline now.
* **Repainting the whole city's massing in the arrival overlay.** A massing
  solid is drawn at an alpha equal to its coverage, and the overlay paints over
  an already-painted city, so painting it twice composites `cov` twice and lands
  at `1−(1−cov)²`. The 1948 frame came back with the entire peninsula gone warm
  and heavy. Only the blocks that changed this year are repainted now
  (`massCohort`), where the doubling reads as the arrival landing a little
  heavier, which is what an arrival should do.
* **A per-`(block, year)` merged union polygon**, so the massing would trace the
  footprints rather than the block ring. There are **46,137** distinct
  `(block, year)` cohorts — too many to be a whole-city tier, and quantising the
  years to make it fewer would move buildings off the year the record gives
  them. The block ring is a published polygon and the year stays exact.

---

## 9. Fitting with Block C, and the tests

`form/patches/stepped_massing.py` and this patch touch `part3.html`,
`build.py` and `functional.py`. They share four anchors, and in every one of
those Block C's *replacement* still contains this patch's anchor exactly once,
so both orders converge. The one real collision was
`  BLD_DRAWN=0; BLD_NEAR=0;` — Block C's `COUNT_OLD` — and this patch was moved
off it onto the loop header below it. There is a note saying so in the patch.

`lod/proto.py` builds C then L. Against that build:

* **`gen/functional.py`: FAILURES: none.** Two of its assertions move with the
  ladder and the patch carries both edits:
  * the growth probe read `BLD_DRAWN` at whole-city zoom, which is now the
    massing tier's counter. It draws into a canvas big enough to hold the whole
    city at `z = 2.5` — above `LOD_Z1`, so nothing is massed and nothing is
    culled — and the assertion means what it says again:
    `[18179, 89632, 143573, 159413, 165978]`.
  * the arrival-wave regex, which now carries `risePh`.
* Asserted live on the combined build: 488 stepped buildings, **334 of them
  solos**, 15,261 solos total, matching `lod/lod-data.js`'s own count.

---

## 10. Shots

All prefixed `l-`. `before` is Block C alone; `after` is C + L.

```
l-pair-{1906,2018}-{whole,mid-lo,district,mid-hi,block}.png   before over after
l-after-dissolve.png            eight cameras through the transition, w captioned
l-before-dissolve.png           the same eight on the build with no ladder
l-pair-labels-{block,district}  the downtown frame the review flagged
l-pair-lm-{whole,district,block}   City Hall held — a landmark at every tier
l-pair-wave-{1908,1948}         mid-rise, whole city — the arrival at the massing tier
l-{before,after}-{1906,2018}-*  the individual frames the pairs are built from
```

Pixels differing by more than 8 between the two builds, whole frame: 22 % at
whole-city zoom, 36 % mid-dissolve, 4.4 % at district, 5.7 % at block. The
change is where it was designed to be.

---

## 11. Open problems

1. **District zoom is still ~300 ms a raster in 2018** and this work does not
   move it. Diagnosed in §6: fill-rate at DPR 2, ~59,000 buildings that all
   deserve to be drawn. The available levers are fewer quads per building (the
   extrusion quad is drawn whenever `dh > 0.8 px`, which is most of them at
   `z = 2.9`) or a lower-resolution motion raster. Both are art calls as much as
   engineering ones and neither was made tonight.
2. **The dissolve is sampled, not animated.** `nav` rasterises at most every
   120 ms mid-gesture and once on settle, so a 1.55 → 2.35 wheel sweep gets
   three to five values of `w`, not sixty. The dither makes each step look like
   more grain rather than a different picture, which is why it is acceptable —
   but it is sampling, and on a slow machine it will be sampled more coarsely.
   Forcing a raster on `w` would reintroduce exactly the mid-gesture
   invalidation that made zoom jumpy before, so it was deliberately not done.
3. **`NEAR_PX = 22` at `z = 7.2` measures 174.4 ms against 20.1 at 26 and 101.7
   at 9.** It reproduces to within 1 ms across runs and it is 8× its neighbour
   over a difference of 328 buildings, which is not a cost this code can
   produce. It looks like a Chrome canvas fallback. Unexplained, and the reason
   the value sits at 9 rather than anywhere near it.
4. **The massing tier's arrival is faint.** Two rise phases of the 1911 cohort
   differ by 0.33 % of pixels: one year moves 765 of 2,573 built blocks, and it
   moves each of them a little. The six-year ochre carries most of the signal
   instead (1,875 of 2,367 blocks in 1908, 139 of 4,735 in 1971 — the wave is
   real and it decays through the century). If the film wants a stronger
   whole-city arrival it should come from the ochre curve, not from the mass.
5. **13,814 buildings still draw individually at whole-city zoom** because they
   stand on land the assessor does not block. That is 8.3 % of the city and it
   is the residual grain in the Presidio, the piers and Hunters Point. There is
   no published polygon to aggregate them onto; a grid would be invented.
6. **The block-ring massing is a real polygon but a coarse one**, and where a
   block is mostly empty the solid still spans the whole ring at low alpha. On
   the biggest rings — the Presidio's 388-vertex boundary — that is a very large
   very faint wash. It reads correctly at 3 % coverage; it would not at 30 %.
