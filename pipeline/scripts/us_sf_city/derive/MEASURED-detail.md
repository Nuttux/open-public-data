# Block Z — how deep the reader may go, and how many names the frame may carry

2026-08-22. Owner of `zoomlabels/`. Delivered as a patch. `gen/` and `nav/`
untouched — verified: `grep -c DETAIL_PXM gen/part3.html nav/camera.js` returns
0, 0, and the tree is unmodified.

```
python3 zoomlabels/patches/zoom_and_labels.py --check     report, change nothing
python3 zoomlabels/patches/zoom_and_labels.py             apply to gen/ and nav/
python3 zoomlabels/proto.py            -> zoomlabels/mock-zoom.html (gen/ untouched)
python3 zoomlabels/compose.py           does it compose with Block N's patch
python3 zoomlabels/citydetail.py [url] [beat]   does more zoom add anything
python3 zoomlabels/terrdetail.py [url]          the same, on the ground alone
python3 zoomlabels/zink.py <label> [url] [beat] the frame's name ink, by layer
python3 zoomlabels/supply.py [url] [beat]       nameable streets against named ones
python3 zoomlabels/zreach.py [url]              what the controls actually reach
python3 zoomlabels/zwheel.py <label> [url]      fps through a real wheel gesture
python3 zoomlabels/zfps.py <label> [url]        pan / held / playback
python3 zoomlabels/zshot.py / zpair.py / zseq.py / zsheet.py / zphone.py
```

`--check` reports **20 WOULD, 0 NO MATCH** against `gen/` and `nav/` as they
stand. Proven **idempotent** on a throwaway copy — apply → 20 APPLIED, apply
again → 20 ALREADY, `--check` → 20 ALREADY — because **seven of the twenty
replacements contain their own anchor**, so counting the anchor cannot tell
applied from unapplied. Each edit names a **mark**, a string that exists only
after it landed, which is the guard Block N uses and the bug
`blocks/patches/drawer_reads_the_line.py` shipped. It composes with `marks/patches/named_places.py` (Block N) **in either
order**, asserted by `zoomlabels/compose.py`: both apply clean both ways and the
two orders converge on a byte-identical `part3.html`.

Suite on the prototype: **310 ok / 0 fail / 0 err** — `gen/` as it stands is
306 with Block N landed, plus this block's four. `node nav/t_camera.js` — all camera assertions pass,
with one of them changed in meaning and strengthened (§1.4).

---

## The complaint

> "i feel limited by the level of zoom and why more street names dont appear
> when i zoom in"

Two halves, and both were a constant that could not scale.

---

# 1 · The zoom ceiling

## 1.1 What it was, measured

`nav/camera.js` clamped at `MAXZ = 12`, a multiple of the fit, on the stated
reasoning that "past ~8x no new detail arrives". Driving the real controls
(`zoomlabels/zreach.py` — the buttons, the `+` key and the wheel, at three
viewports):

```
                  deepest scale the reader could reach
  1440 x 940      0.668 px per world unit   0.82 CSS px per published metre
   768 x 1024     0.457                     0.56
   390 x  844     0.239                     0.29
```

The ceiling was **relative to the fit**, so the same reader on a phone was held
to **2.8x less magnification than on a desktop** — for no reason in the data,
which does not get finer on a wider screen. At the ceiling the median building
was 12.3 px wide at 1440 and 4.4 px at 390.

The film already disagreed with the number. **Shot 4 sits at z = 28** and Block
D measured 265 px of City Hall there and called that the frame that works. The
explorer stopped the reader at 12.

## 1.2 What the data supports, measured rather than argued

`zoomlabels/citydetail.py`. `drawCity()` is called into a blank canvas — no
terrain under it — at a ladder of zooms, always on the same point, and the Sobel
edge energy inside a **fixed 240 m square of world** is counted and divided by
that square's **world** area. Reported as edge metres per 1000 m², which is
scale-free: it holds flat when the same published edges are simply drawn larger,
and it **rises only when edges that were not resolved before have appeared.**

Three frames, three unlike kinds of city (2018, 1440 x 940):

| z | 2.35 | 4.57 | 7.2 | 14 | 20 | 28 | **36** | 44 | 52 | 64 | 80 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| City Hall | 122 | 216 | 266 | 357 | 350 | 343 | **358** | 337 | 335 | 294 | 243 |
| Laguna Honda | 86 | 159 | 247 | 324 | 365 | 390 | **371** | 335 | 307 | 309 | 382 |
| Mission Bay | 108 | 174 | 196 | 211 | 217 | 223 | **230** | 233 | 220 | 215 | 202 |

Every one climbs, reaches a peak between z = 20 and z = 44, and falls after it.
Past the peak the frame is not resolving the record any more, it is magnifying
it. **z = 36 is the deepest zoom at which all three are within 5 % of their own
peak**, and that is the ceiling. (Laguna Honda's climb again at 80 and 112 is
not city: it is the wall ramps and the AO blur coming apart into bands, which is
the mush the ceiling exists to stay below.)

Stated as an **absolute** rather than a multiple of the fit, because the fit
depends on the viewport and the record does not:

```
  DETAIL_PXM = 2.0 px per world unit  =  2.454 CSS px per published metre
               (proj() is axis-aligned at 315 deg; the across-screen factor is
                cos(30 deg) x sqrt(2) = 1.2247)
```

Measured through the controls after the change: **2.45 CSS px per published
metre at 1440, at 768 and at 390** — z 35.9 / 52.5 / 100.2, the same closeness
everywhere. `zoomlabels/zreach.py`.

## 1.3 Two independent things agree with 2.45 px per metre

**The file's own quantum is one metre.** `bldg/build_bldg.py` ships footprints
Douglas-Peucker-simplified at `SIMP_TOL = 1.5` m and snapped to a `QUANT = 1.0`
m lattice, and heights quantised to 1 m from `hgt_mediancm`. At the ceiling one
quantum is 2.45 px: resolved, and no finer.

**And the encoding error was measured, not assumed.** The shipped ring was
reconstructed against the published ring for **4,000 footprints** drawn at
random from `bldg/cache/parsed.pkl`, symmetric maximum vertex deviation:

```
  p50 1.014 m   p75 1.318   p90 1.534   p95 1.652   p99 1.814   max 2.371
  49.1 % under 1 m, 88.4 % under 1.5 m, 99.9 % under 2 m
```

At the ceiling the median error is **2.5 px on a building drawn 37 px wide** —
under 7 % of its own width, and the error is at its largest in the middle of a
long straight run, which in San Francisco is a party wall.

**What breaks first if the ceiling ever goes higher** is the ground, not the
buildings. `CITY.dem` is a 260 x 260 grid over 13,993 m — **53.8 m a cell** —
and at z = 36 a cell is 132 x 76 CSS px. `zoomlabels/terrdetail.py` measures the
terrain layer alone at 59 - 74 edge m/1000 m² across the whole ladder, i.e. flat:
the ground never gains detail, it only gets softer, and by z = 36 its facets are
visible as large flat plates in the open plaza. Honest — nothing is invented —
but it is the first thing a reader would call wrong.

## 1.4 What the patch does, and what it deliberately does not touch

* `Camera.prototype.maxScale()` returns `max(base * MAXZ, DETAIL_PXM)`. MAXZ
  survives as a **floor under the ceiling** so a very narrow viewport is never
  held *above* the fit-relative depth it had before.
* The three clamps — `zoomAt`, the wheel, the `+` key — all read it.
* **A fourth named stop**, `STREET`, because a reader who does not know the map
  takes a wheel never reaches any of this. It is the ceiling itself, so it
  carries no new number, and it is the same closeness on a phone as on a
  desktop. `cam.step` is untouched: the LOD band is still `bandOf()`, still
  0|1|2, `ZEX_BY_STEP` is still three long, and `applyZoom()` now clamps its
  argument rather than trusting it, because `ZEX_BY_STEP[3]` is `undefined` and
  an undefined ZEX is a blank map.
* **Nothing continuous in `cam.scale` goes near a cache key.** This is a clamp
  and a preset. Block L's `tierW()`, quantised to a 32nd, is still the only
  scale-derived term in `part4`'s `ck` or nav's `contentKey` — read first,
  exactly as the brief said to.
* **`nav/t_camera.js`'s ceiling assertion changed meaning and got stronger.**
  It asserted `z == 12`; it now asserts the camera stops at `maxScale()` **and**
  that two cameras whose fit differs by 3x stop at the *same* px per world unit.
  That is the thing MAXZ could not say.

## 1.5 What the reader gets

| | before | after |
|---|---|---|
| deepest scale, 1440 | 0.82 CSS px/m | **2.45** |
| deepest scale, 390 | 0.29 | **2.45** |
| frame at the ceiling, 1440 | 1,409 m across | **471 m** — 3.9 assessor blocks |
| median building at the ceiling | 12.3 px | **36.7 px** |
| City Hall | a blue lozenge | its footprint, its drum, and its name |

`shots/z-sheet-range.png` is the whole ladder, before over after, eight cameras
each. **The before row runs out at z = 12 and repeats the same frame four
times.** `shots/z-ceil-0035p90.png` is the ceiling frame at 1440 and
`shots/z-ceiling-390x844.png` the same on a phone.

---

# 2 · The street names

## 2.1 Why they stopped appearing, measured

Block L's rule — *a name is written only where the street is at least as long as
the name* — is continuous in zoom and it stays. The two rules **on top of** it
were not continuous:

```
  streetCap    20 / 26 / 30   by cam.step
  LOCAL_SHARE  0.45 of that cap, for every local street and court
```

Band 2 runs from z = 4.57 to the ceiling, so across the entire close half of the
ladder those were two constants. `zoomlabels/supply.py` counts, for each camera,
how many published stretches are **in class**, how many are **on screen** (the
straight run reconstructed from the anchor, the unit direction and the run's own
length, out of `geo/cache/streetlabels.json`), how many are **nameable** (on
screen and passing the length rule), and how many were actually written:

| z | in class | on screen | nameable | written | what refused the rest |
|---|---|---|---|---|---|
| 4.57 | 2,416 | 388 | 183 | **30** | `streetCap` |
| 7.2 | 2,416 | 178 | 115 | **30** | `streetCap` |
| 12 | 2,416 | 70 | 66 | **23** | `LOCAL_SHARE`, 14 of 14 |
| 20 | 2,416 | 21 | 20 | 15 | the collision grid |
| 36 | 2,416 | 7 | 7 | 7 | nothing — this is the supply |

**At the two zooms a reader uses to find out what street they are on, five out of
six nameable streets were refused by a constant**, and at z = 12 the refusal was
specifically the local share — where a local street is the whole of what the
reader is looking at.

## 2.2 The budget is ink, and the number is 0.075

A budget stated as a **count** cannot scale with the frame, and a count is not
what a frame runs out of. What a frame runs out of is room. So the budget is now
the label boxes' **area as a share of the visible strip** — the unit Block R
established for the neighbourhood names (`HOOD_INK`) and Block N adopted for the
place names.

Measured by hooking `fillText` on the build itself (`zoomlabels/zink.py`), the
street ink the old code drew was **0.021 whole city, 0.041 district, 0.050-0.054
block**; and the frame Daniel judges the project by — whole city — carries
0.017 of street ink under 0.063 of neighbourhood ink and 0.034 of place-name
ink, **0.115 of name ink in total**, and has been read and accepted at that.

**`STREET_INK = 0.075`**: above every frame the old code drew, and it leaves the
rest of that 0.115 for the two layers that spend into the same frame. At the
block frame the total name ink comes to 0.110 — under what the accepted
whole-city frame already carries.

**`LOCAL_SHARE` is deleted rather than raised.** It protected the *remainder* of
a count from alleys once the arterials had refused it — but the pass runs in the
city's own published class order, so the arterials have first refusal **by
construction** and there is no remainder to protect. Verified rather than
assumed: `geo/build_streets.py` sorts its output by `(rank, -length)` and
`gen/gen_geo2.py` preserves it, so `LB.r` is non-decreasing across all 2,786
stretches in the shipped file.

One measurement error, caught by looking at the first build: the ink was spent
as `ww * hh`, the **axis-aligned envelope** the collision grid uses. San
Francisco's grid runs at 45 deg to the screen at ROT 315, so nearly every street
name is set on a diagonal and its envelope is ~3.9x its own area. The budget
emptied after seventeen arterials and the frame came back with **no collector
and no local on it at all**. It spends the label's own box now.

## 2.3 Label counts per class, before and after

`zoomlabels/zink.py`, the Civic Center frame, 2018, 1440 x 940, strip
1.083 Mpx. Streets **A** rterial / **C** ollector / **L** ocal; the hood and
place columns are Block R's and Block N's layers, unchanged by this patch and
shown because they share the frame.

| z | m across | street before | street after | A/C/L before | A/C/L after | street ink | hood | place | ALL INK |
|---|---|---|---|---|---|---|---|---|---|
| 1.0 | 16,903 | 11 | **11** | 11/0/0 | 11/0/0 | .017 → .017 | .063 | .034 | .115 → **.115** |
| 2.9 | 5,829 | 26 | **34** | 17/9/0 | 17/**17**/0 | .041 → .051 | .054 | .034 | .128 → **.139** |
| 4.57 | 3,699 | 30 | **46** | 24/6/0 | 24/**11**/**11** | .054 → .076 | 0 | .034 | .088 → **.109** |
| 7.2 | 2,348 | 30 | **51** | 14/9/7 | 14/9/**28** | .050 → .076 | 0 | .034 | .084 → **.110** |
| 12 | 1,409 | 23 | **37** | 5/4/14 | 5/4/**28** | .034 → .051 | 0 | .034 | .068 → **.085** |
| 20 | 845 | — | 11 | — | 0/0/11 | .014 | 0 | .035 | **.049** |
| 28 | 604 | — | 5 | — | 0/0/5 | .007 | 0 | .028 | **.035** |
| 35.9 | 471 | — | 6 | — | 1/0/5 | .011 | 0 | .024 | **.035** |

Three things to read off it.

1. **The whole-city frame is untouched** — same eleven names, same ink, to four
   decimals. The frame that was tuned and accepted does not move.
2. **The budget opens where the reader is**: at the block frame the locals go
   7 → 28, and at z = 12 14 → 28. The arterials and collectors are unchanged at
   every camera; nothing was taken from anything.
3. **Past z = 20 the frame is supply-bound, not budget-bound** — 471 m of city
   holds six street names because six is what is there. Nothing is invented to
   fill it.

`shots/z-pair-n-7.2.png` and `z-pair-n-2.9.png` are before over after at the
block and district frames. What arrives at block zoom is AUSTIN, FERN, HEMLOCK,
CEDAR, OLIVE, WILLOW, IVY, LILY, ROSE, HICKORY, MINNA, NATOMA, LANGTON,
CLEMENTINA, HARRIET, STEVENSON — the alley grid of Civic Center and South of
Market, in the light local treatment, under arterials that are still set 30 %
larger and 40 % darker. The hierarchy Block L built is doing exactly the work it
was built for; it was the cap over it that had to go.

---

# 3 · Coordination with Block N

Block N landed in `gen/` **while this block was running**, and it was caught by
a screenshot: a whole-city frame diffed 49 names against 35 and the "lost" names
turned out to be `Golden Gate Bridge`, `War Memorial Complex`, `Beach Chalet` —
Block N's, absent from a prototype copied from `gen/` an hour earlier. Every
number in §2 was re-measured on the rebuilt prototype.

Two things were changed on the strength of `marks/BLOCK-N.md` and
`marks/patches/named_places.py`:

* **This patch does not wire `LB_ORDER`.** It was written to, having found the
  same dead code Block N found; N wires it as part of splitting the same pass at
  the arterials, and N's anchor is the three-line loop this patch would have
  edited. One owner per line. It is harmless in the meantime — file order *is*
  class order today (§2.2).
* **The assertions are anchored on the last `ck()` in `functional.py`, not on
  the `print()` before it**, which is where Block N appends.

**The three name layers each hold their own pool, and the frame's total is not
governed.** Streets ≤ 0.075, places ≤ 0.0304 (Block N, split evenly between its
two published classes), neighbourhoods **unbudgeted**. That is why the district
frame, the only camera where all three are on at once, comes to 0.139 against
the accepted whole-city frame's 0.115. Block N names this as its own open
problem and declines it because a genuinely shared pool means putting a budget
on `hoods()` and `hoods()` is in this block's file; this block declines it too,
because a hood budget would *reduce* the whole-city frame Daniel judges the
project by, which is a bigger editorial change than either brief. **It is one
decision, it belongs to Daniel, and it is now written down in both places.**

---

# 4 · Cost

**Never by timing `drawCity` into a detached canvas** — Canvas 2D is deferred
and that harness reports JS time only, which already cost this project an 8x
"win" that was a regression (`lod/BLOCK-L.md` §5).

**The gesture** (`zoomlabels/zwheel.py` — ctrl+wheel events dispatched from
*inside* the page, so no test-runner round-trip is in the frame timing; rAF
counted, 1440 x 940 DPR 2, 1936):

| | before | after |
|---|---|---|
| in, fit → ceiling | 105.7 fps, z 1 → **12** | **112.5 fps, z 1 → 35.9** |
| out, ceiling → fit | 93.5 fps | 90.5 fps |
| inter-frame gap p50 / p95 | 8.3 / 8.8 ms | 8.3 / 8.8 ms |
| worst single frame | 100.0 ms | 100.0 ms |
| frames over 33 ms, in / out | 5 / 8 | 5 / 10 |

**The steady state is 120 fps in both** (8.3 ms p50) and the gesture *into* the
ceiling is slightly faster after, because it ends with fewer buildings on
screen. The 120 fps hold, the 81-118 fps camera moves and Block L's whole-city
frame are not given back.

**Pan, held and playback** (`zoomlabels/zfps.py`, same conditions):

| | before | after |
|---|---|---|
| pan z = 7.2 | 21 | 19 |
| pan z = 12 | 45 | 42 |
| pan z = 20 | 70 | 75 |
| pan z = 36 | 98 | 93 |
| held, every z | 120 | 120 |
| pan whole / district / block | 8 / 6 / 23 | 8 / 6 / 20 |
| play 1948 whole city | 80 | 80 |

Every row is within run-to-run noise, and the deep cameras are *cheaper* than
the block preset because the frame holds fewer buildings. **The new depth costs
nothing** — the ladder was already doing the work, it was the clamp that stopped
short.

The label change costs a comparison and an add per placed label, and the pass
runs once per city-layer rasterisation, not once per frame.

---

# 5 · Verified by looking

All prefixed `z-`.

```
z-sheet-range.png        the whole ladder, before over after, eight cameras each
                         — the before row runs out at z 12 and repeats
z-seq-in-final.png       sixteen frames captured DURING one continuous wheel zoom,
                         the canvas read back mid-gesture, z 1.1 -> 28.6
z-pair-n-7.2.png         the block frame, before over after
z-pair-n-2.9.png         the district frame, before over after
z-ceil-0035p90.png       the ceiling at 1440 — City Hall, its drum, its name,
                         VAN NESS AVE, REDWOOD ST, DR CARLTON B GOODLETT PL
z-ceiling-390x844.png    the same building at the same closeness on a phone
z-ceiling-1440x940.png
z-after-*.png            the after ladder as single frames
z-before-*.png           the before ladder — it stops at z 12
z-phone-390-{0..3}.png   the four stops on a phone
z-phone-zoombar.png      the film CTA over the zoom row, before beside after
```

**A single still cannot show a stutter**, so `z-seq-in-final.png` is a sixteen-
frame contact sheet taken *during* one gesture, including nav's blits: no pop,
no tier snap, every frame a plausible continuation of the one before it. This is
the check that earlier motion bugs on this project survived for want of.

---

# 6 · Open, and stated

1. **The film CTA sits on the zoom row on a phone, and this patch made it
   worse.** `.film-back` is `position:fixed; right:36px; bottom:26px`, so it
   floats over whatever is at the bottom-right of a 390 px viewport. Measured
   coverage of the zoom buttons at 390 x 844: **before** — Whole city 0 %,
   District 15 %, Block 65 %; **after** — Whole city 0 %, District 0 %, Block
   46 %, Street 62 %. One of three stops was already unreachable by tap; two of
   four are now. It is `film/film.js`'s CSS and the same class of defect Block R
   fixed for `.zoom`, `.legend` and `.navhome` and did not reach. **A phone
   reader still reaches the new depth by pinching**, which is the phone-native
   gesture and is what actually got tested (`zoomlabels/zphone.py`).
2. **The three name layers do not share a pool.** §3. Daniel's call.
3. **The ground is the first thing that would break above the ceiling.** The DEM
   is 53.8 m a cell and at z = 36 its facets are visible as large flat plates in
   open ground. Nothing is invented — the ground simply stops having anything to
   say — but it is what sets the next limit, not the buildings.
4. **The layer cache key rounds `cam.cx` to one world unit**, which was 0.8 px
   of pan at the old ceiling and is 2.4 px at the new one. Covered in practice
   because nav blits through a gesture and invalidates on settle, and no stutter
   showed in the sequence sheet — but it is a number that grew with the ceiling
   and it is worth knowing.
5. **`minLen` is still dead in `part3.html`** — Block L replaced it with the
   length rule and left the constant. Not removed here: it is one line inside
   the block Block N's patch reads, and it costs nothing.
6. **The nav harness suite** (`nav/t_behaviour.py`, `t_clip.py`, `t_pixel.py`)
   runs against `nav/harness.html`, a **frozen** copy of the mock from before
   the film existed, and could not be re-pointed at the prototype without
   rewriting its fixtures. `nav/t_camera.js` — the pure camera, which is what
   this block changed — passes, with the ceiling assertion rewritten.
