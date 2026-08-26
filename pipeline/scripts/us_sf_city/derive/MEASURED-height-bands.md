# Block M — material and light

**Owns** `look/`. **Delivers** `look/patch_material.py`: a patch against
`gen/part3.html` and `gen/part4.html`, staged and **not applied**.

```
python3 look/patch_material.py --check     25 anchors, each resolving exactly once
python3 look/patch_material.py --studio    -> look/mock-look.html, the studies build
python3 look/patch_material.py --apply     rewrite gen/, then python3 gen/build.py
```

Everything is behind a flag on `window.LOOK`. `LOOKapply({...})` sets flags and
rebuilds every table that depends on one, so a study pane is a function of its
flags and nothing else.

| tool | what it does |
|---|---|
| `look/studies.py <sheet> <state>` | the same frame under N treatments, side by side → `shots/m-study-*.png` |
| `look/shore.py` | the waterfront, shore treatment on/off, at six places → `shots/m-shore-*.png` |
| `look/shoot.py <tag> <url> <flags>` | four fixed camera states, full frame → `shots/m-*.png` |
| `look/perf.py` | frames counted, per treatment → `look/perf-final.txt` |
| `look/cost_ao.py` | milliseconds per call with the raster flushed → `look/cost-final.txt` |
| `look/coast_probe.py` | the measurement that killed the first shoreline design |
| `look/functional_look.py` | `gen/functional.py` pointed at the studies build — **FAILURES: none, ERRORS: none** |

---

## 1. The defect, in render terms

Daniel: *"i just see the city as this aggregation of blocks it looks like a
video game from the late 80s early 90s."*

Sampled off `shots/m-base-district-1936-crop.png` — the frame he has been
judging the piece on — four things are true at once, and each is independently
a 1990s software-rendering tell:

| | on the base frame |
|---|---|
| **value** | roof L 0.42 against open ground L 0.90 — a **0.48 gap** across an edge two pixels long. Not a lighting contrast; a poster contrast. |
| **contact** | the only shadow is a hard-edged offset **copy** of the footprint at 16 % — a duplicate, which is a different artefact and reads as one |
| **edge** | one fixed ink on every roof, at every value, drawn down to 3 px where an outline is a smear rather than a division |
| **variation** | the palette *family* is a real attribute; **which member of it** was `URND[i]`, a seeded hash. 166,166 meaningless differences is noise, and noise reads as confetti. |

Two more were found by looking rather than by reasoning, and both were bugs:
the aerial perspective was on the wrong end of the city (§4), and the shoreline
was the DEM's staircase rather than the city's published coastline (§7).

---

## 2. What was kept

Seven flags, all defaulting **on** except the paper.

| flag | what it is | verdict |
|---|---|---|
| `ao` | screen-space ambient contact shadow, baked into the city layer | **kept** — the single highest-yield change |
| `depthfix` | aerial perspective applied to the far city, not the near | **kept** — it was a bug |
| `shore` | the coastline is the published line, not the raster's edge | **kept** — see §7 |
| `attr` | roof and wall tone from measured height and roll year, not a hash | **kept** |
| `palette` | the gouache value range | **kept** |
| `aerial` | distance haze, further and warmer | **kept** |
| `edge` | silhouette ink as a value of its own roof, and off below 5 px | **kept — it is FASTER than what it replaces** |
| `grain` | paper tooth / gouache wash | **rejected by default**, code and levels left in — §6 |

`shots/m-study-keep-district-1936.png` is the pair. `shots/m-beforeafter-*.png`
are the full frames at all three zooms.

---

## 3. The contact shadow — `ao`

A mass that meets the ground with no darkening under it is floating, and
166,166 floating boxes is the loudest thing in the frame. Not per building: the
finished city layer's own alpha, blurred, pushed a little down-light, tinted,
and composited **behind the city inside the city's own layer** with
`destination-over`.

Three design steps, each forced by a measurement:

1. **Full resolution, blitted under the city every frame.** Panning at DPR 2:
   district 46 → 20 fps, block 78 → 24.
2. **Half resolution** (`AO_SS = 0.5`). A contact shadow has no high
   frequencies in it by construction, so a quarter of the pixels is the same
   picture. Better, not enough.
3. **`destination-over` into the city layer.** `look/cost_ao.py`, raster
   flushed: the per-frame blit alone was **6.9 ms** — 41 % of a 60 fps budget,
   every frame, for a picture that only changes when the city layer does.
   Inside the layer it is paid **once per rebuild** and the composite is the
   same single `drawImage` it always was. Per-frame cost: **zero**.

Tiered off mid-gesture next to the geometry tier `nav/nav.js` already drives
through `self.__CITY_FAST`.

Measured, once per layer rebuild: `buildAO` **6.3 ms**, `destination-over`
**9.9 ms**.

---

## 4. The haze was on the wrong end of the city — `depthfix`

`buildBldProj` buckets buildings on `(hi − UD[i])` and the stream is drawn far
to near, so `bx = 0` is the horizon and `bx = BANDS` is the reader's feet.
The fabric tier computed `dn = bx/BANDS` and hazed by `dn²·√dn` — **maximum
haze on the nearest buildings, none at all on the far ones.**

The near tier, twelve lines below, has always used `(dpt−dlo)/dspan`, which is
0 at the near clip. The two tiers disagreed, so one of them was wrong.

`shots/m-study-depth-district-1936.png` renders both at an exaggerated amount
so the direction is unarguable: on the left the foreground is washed out and
the far city is heavy; on the right the foreground has weight and the distance
recedes. This is also why turning `fadeAmt` up had never helped — it was
pushing the foreground away.

Cost: none. It is `1 - bx/BANDS`.

---

## 5. Tone from measured attributes — `attr`

The use family already came from the roll. Which member of the family a
building got was a seeded hash. Two measured fields decide it instead:

- **roof** — `ynuv-fyni` `hgt_mediancm`, the median LIDAR return over the
  footprint. Banded at 9 / 15 / 25 m, which `bldg/build_bldg.py`'s own storey
  cross-check puts at roughly 2, 4 and 7 storeys.
- **wall** — `wv5m-vpq2` `year_property_built`, banded 1907 / 1925 / 1950 /
  1980.

**Except** where the roll has no year for the parcel and none for its block
either — `FLAG_NOYEAR`, bit 4 of `BD.u`. Those footprints carry a fabricated
1906 so they can be drawn at all, and colouring by it would paint a date the
record does not hold. They take the height band for both, and `BLD_NOYR` counts
them so the number can be put on the page. The 10.4 % of footprints that join
no roll row keep the old purely-spatial rule.

`shots/m-study-attr-district-1936.png`: the hash version is a scattered sprinkle
of unrelated blues and oranges; the measured version has coherent zones — the
Mission reads as one grain, and the tall commercial buildings separate from the
houses because they *are* taller. Cost: none, it is an index.

---

## 6. What was rejected

### The paper — `grain`, default 0

Two tiles were built and both work: a **tooth** (per-pixel noise, 2 css px
cells) and a **wash** (an 8×8 field smoothed to 96×96, so one cell is ~12 css
px — the low-frequency unevenness of a hand-laid flat, which is what actually
separates a painted flat from a vector flat). Levels 1–4 are tooth, 5–7 wash.

Rejected on the ratio, not on the idea:

- At the alphas where it is not visible as noise (0.030) it is **barely
  visible at all** — `shots/m-study-grain-district-1936.png` and
  `-block-2018.png`. At 0.090 it stops reading as tooth and starts reading as
  dirt.
- It has to live inside `drawTerrain`, because `gen/functional.py` §26e asserts
  the burn cross-fade is pixel-for-pixel a direct `drawTerrain` at that phase.
  Painting it around the two call sites in `draw()` failed that assertion by
  11–12/255 against a tolerance of 8, in both directions.
- Inside `drawTerrain` it is on the gesture path, and one full-frame pattern
  fill is **7.4 ms**. Measured: a district gesture 92 → 54 fps.

Playback is unaffected (117 → 116), so if the wash is wanted it costs a gesture
and nothing else. It is one flag.

### A global clip to the coast rings

The obvious first design for §7. `look/coast_probe.py` measured it before it was
written: **17.6 % of the DEM's own land cells fall outside every published coast
ring** — the western map edge and the southern county line, where the ring is a
boundary rather than a beach. A clip would have deleted them.

### Lifting the roofs further

The gouache ramp closes the roof/ground gap from 0.48 to 0.24. Going further
was tried and abandoned: past about 0.20 the fabric stops separating from the
ground at whole-city zoom, which is the exact failure `VISUAL-SPEC.md` §5
recorded when the roofs were pale ("33 000 blocks into foam"). That decision
was made for block massing and does not fully survive real footprints, but the
direction it was protecting is real.

---

## 7. The shoreline — `shore`

Reported by the coordinator off `shots/c-inset-ferry-block.png`: the waterfront
is a blue checkerboard. It is: the land plane is a 77 m DEM raster quad-filled
cell by cell, so at block zoom one cell is ~31 css px and the coast is a flight
of pale steps reaching hundreds of metres into the bay.

The page already carries the right answer and already draws it — `C.coast`,
DataSF `txuc-3kzm`, simplified to 45 m and **stroked as ink over the top of the
staircase**. What was missing is that the FILL never agreed with the LINE.

- **Before the cells**, the coast rings are filled once with a sea-level ground
  tone. The cells cover it everywhere the raster has land, so the only place it
  shows is the sliver where the raster falls *short* of the published line.
  The rings are projected at the DEM's own elevation under each vertex, not at
  a flat 0.4 m, so the ring and the cells agree at the boundary and this pass
  needs no clip at all.
- **After the cells**, everything on the water side of the published line —
  inside a corridor and nowhere else — is repainted open bay and the graded
  shallows are laid back down. That cuts wherever the raster runs *past* it.

Three things it took to be correct, each caught in a screenshot:

1. **The corridor is asymmetric** — 130 m on the land side, 1100 m on the
   water. The land side has at most one cell to cover. The water side does not:
   the 77 m mask calls the whole pier field north of the Ferry Building land.
   A symmetric 130 m band cut the near half and left loose pale squares
   offshore.
2. **A segment is only in the corridor if the surround raster says there is
   water on one side of it.** The San Mateo county line is a land border; a blue
   seam along it would be a new defect. Verified at Visitacion Valley —
   `shots/m-shore-visitacion.png`, no seam.
3. **The sliver tone is a step DOWN in value.** At an average lit cell's
   lambert it came out *lighter* than the ground either side and drew a bright
   white rim all round Hunters Point.

`shots/m-shore-ferry.png`, `-ferry-district.png`, `-oceanbeach.png`,
`-hunterspoint.png`, `-visitacion.png`, `-whole.png` are the before/after pairs.
Ocean Beach is the largest single change: the western third of the frame was a
cream slab out to the map edge and is now the Pacific.

Cost, measured: **playback is unaffected** (116 → 116 fps), because it is
inside `drawTerrain`, which is cached per camera. A district **gesture** is
88 → 37 fps, and that is the honest number: the corridor's even-odd fill is a
full-frame rasterisation inside a clip. Two optimisations were tried and kept —
off-screen segments are dropped before they enter the path, and the whole pass
is skipped when no coastline is in the frame at all, which is most district and
block cameras — and they did not move the number at a *waterfront* camera,
which is the one measured above.

**This is the one treatment that is expensive on the gesture path and is not
tiered off.** A coastline that changes shape when you stop dragging would be a
worse artefact than the one it fixes. If that trade is wrong, one
`&& !self.__CITY_FAST` on the water pass restores the gesture and reverts the
coast to the raster during motion.

---

## 8. Cost, all of it

`look/perf-final.txt`, 1440×940 css at DPR 2, headless Chromium — **software
raster, so a GPU compositor prices every blit lower than this**. Cameras are
pinned by value: `applyZoom` is not idempotent, and the first version of this
harness silently compared each treatment at a different camera, which made every
number in the first table wrong.

```
                  PAN whole  PAN dist  PAN block  GESTURE dist  PLAY 1908  PLAY 1936
  shipped                13        47        102            88        116        115
  + ao                   10        26         38            86        108        100
  + edge                 12        50        100            85        116        115
  + attr                 12        45        100            88        116        114
  + palette              12        46        102            88        116        114
  + aerial+depth         12        48        103            88        117        114
  + grain lv1            12        34         58            54        117        114   (rejected)
  + shore                11        26         46            37        116        114
  KEPT (all six)          8        19         26            34        108        103
```

- `PAN` walks the camera and calls `draw()` every frame with **no** motion
  tier. It is the pessimistic bound, not a gesture.
- `GESTURE` is the same pan with `self.__CITY_FAST` set, which is what
  `nav/nav.js` does for a real drag or wheel.
- `edge` is free and then some: raising the outline floor from 3 px to 5 px
  takes about a third of a district frame's buildings out of the stroke batch.
- `attr`, `palette`, `aerial+depth` are inside measurement noise. They are
  table indices.
- `ao` costs **~7 % of playback** and **nothing** on the gesture path.
- `shore` costs **nothing** in playback and **more than half a gesture**. It is
  the one treatment not tiered off during motion, and §7 says why.

Per-call, raster flushed (`look/cost-final.txt`), all paid once per layer
rebuild and never per frame:

```
              buildAO   aoUnder  paintGrain
  whole          6.5      10.5        7.6
  district       6.6      10.5        7.6
  block          6.9      10.5        7.6
```

Note the absolute fps here are higher than earlier in the night at the same
cameras: `gen/` moved under this block twice while it was being measured (Block
C's stepped massing, then a continuous `fadeAmt`). Every row in the table above
is from one run against one build, so the *columns* are comparable even though
they cannot be compared to a table taken an hour earlier.

## 9. Assertions, and two harness traps

`python3 look/functional_look.py` runs the whole of `gen/functional.py` against
the studies build: **ERRORS: none, FAILURES: none.**

It does not *copy* the suite. It reads `gen/functional.py` at run time and
rewrites the two constants that name the page. A copy was tried first and went
stale inside an hour — another block added assertions, the copy did not have
them, and four failures appeared that had nothing to do with material and
everything to do with the harness. Two of them I nearly wrote up as real.

The same class of trap, twice more, both now asserted rather than remembered:

- **`--studio` refuses to build if `gen/part*.html` is newer than
  `mock-frame.html`.** `--check` validates anchors against `gen/`; `--studio`
  applies them to the *built* page. If those two have drifted, the studies and
  every assertion run against them describe a different renderer.
- **`look/blocks` is a symlink to `../blocks`**, not a `<base href="/">`. The
  page fetches its block shards relatively and the studies build is served from
  a subdirectory. A `<base>` tag fixes the fetch and re-bases the whole
  document, which is not the same page.

And one caught only by a screenshot: a late optimisation made `coastBand`
return a count so the water pass could bail when no coast is in frame, and the
`return n;` did not land. `undefined > 0` is `false`, so the treatment silently
turned itself off everywhere. `--check` was clean, the suite was clean, and the
before/after pair was two identical frames. Nothing but looking at it would have
caught that.

`gen/functional.py` §21 (SUN agrees with the faces, the cast shadows and the
terrain Lambert) is untouched: nothing here moves the light. §26e (the burn
cross-fade is the direct render) is the assertion that decided where the paper
had to live.

## 10. Left on the table, for whoever has the ground plane

Two things are still the loudest non-building elements in a district frame and
neither is material:

1. **The lot checkerboard.** The ground reads as pale graph paper. It is the
   block/lot layer, and at district zoom it competes with the fabric it is
   supposed to sit under.
2. **The surround's own raster edge.** Alcatraz, Angel Island and the Marin
   shore still step, for exactly the reason San Francisco's did. The same
   treatment would work if the surround has a published vector coastline; SF's
   own (`C.coast`) does not cover them.
