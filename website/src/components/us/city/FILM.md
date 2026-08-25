# The film, and the century scrub

**Block P5.** Written as the work happened, not after it.

P1–P4b gave the page a city you can browse. It directs the eye nowhere. This
block is the part that makes the piece an argument rather than a map: ten
moments out of the city's own minute books, **2 minutes 14 seconds**, the camera
on rails, one subject at a time, and the explorer as what you get when you stop.

    lib/city/film.ts                    the timeline, the rails, the state at t — pure
    lib/city/time.ts                    the one rule the century scrub runs on
    components/us/city/film-draw.ts     the film's own marks on the canvas
    components/us/city/CityFilm.tsx     the projectionist — clock, chrome, four ways out
    pipeline/scripts/us_sf_city/build_film_payload.py
    public/data/us/sf/city/film/film.json    108,593 bytes · 35,595 gzipped

It mounts through the seam `CityMap` already had — `hud`, and the entry plate's
own `primary` button — and the camera comes out of `onReady`. Nothing else on
the page was rearranged.

---

## 1. The split, and why it is where it is

`film.ts` answers one question: **what is true at film millisecond t.** It has no
DOM, no canvas, no React and no clock of its own. `CityFilm.tsx` has the clock
and paints the answer.

That is not tidiness. It is what makes **a scrub land on exactly the frame
playback would have produced** — the state at any millisecond is a lookup into a
flat segment list with absolute start times, not a simulation that has to be
replayed — and it is what makes the timeline testable without a browser.

The camera is handed to the renderer already resolved. `CityRenderer.driveFilm`
is a setter and a repaint; it animates nothing and owns nothing.

---

## 2. The ten shots that exist

An editorial pass proposed a different ten (`edit/CANDIDATES.md`). Daniel has not
chosen them, so **these are the ten that exist**, timed exactly as
`film/camera.json` and `film/film.js` time them. Measured on the page:

| | shot | z | year | seg at 78 % |
|---|---|---:|---:|---|
| 1 | burn — the line around the burned city | 2.05 | 1906 | hold |
| 2 | rebuild — it fills back in | 2.05 | 1906→1912 | run |
| 3 | civic-bonds — the money for a civic centre | 3.2 | 1912 | hold |
| 4 | city-hall | 28.0 | 1912→1917 | build |
| 5 | tunnel — and what is on the other side | 2.6 | 1917→1918 | hold |
| 6 | west-fills — the west side fills in | 1.9 | 1918→1945 | run |
| 7 | hetch-hetchy — the water, and it is not on this map | 1.1 | 1945→1935 | hold |
| 8 | treasure-island — an island that was not there | 2.55 | 1935→1939 | hold |
| 9 | yerba-buena — the vote that named the convention centre | 3.6 | 1939→1966 | hold |
| 10 | to-now — the rest of the century | 1.1 | 1966→2018 | hold |

3,000 ms of title card + 127,000 ms of shots + 4,000 ms of end card =
**134,000 ms**, and the page reports exactly that. `buildTimeline` asserts that
each shot's acts sum to its own `shot_ms`, so a re-timed shot cannot quietly
change the running time.

### Two of the ten lines changed, 2026-08-24 — Block B3

The shot list is untouched. `edit/CANDIDATES.md` proposes a different ten and
Daniel has not chosen between them, so **the ten that exist are still the ten
that exist**. What changed is two lines of copy, both replaced from **the same
entry the shot was already citing**, both verbatim beat headlines, both through
`film/build_film.py`'s own gate — which refuses to write a payload unless every
line on screen is a headline or a verbatim run of a quote that exists in
`film/entries/` at the leaf the shot cites. Seven leaves of `film.json` moved and
nothing else did.

**Shot 4, City Hall.** Was: *"Fifty-five dollars to move the heating ducts in the
Mayor's new headquarters, adopted 18 to 0."* Fifty-five dollars of ductwork was
the whole of what a reader was told while the camera spent 2.4 seconds travelling
8.75× into the one building the film raises as a building. Now:

> **The Board repeals its own promise and moves City Hall three blocks west.**
> `journalofproceed1912sanfrich` leaf 623 — Resolution No. 9520 (New Series)

That is the decision that put the building on the ground the frame is looking at,
which is what the shot actually shows: a published footprint rising on a
particular block. It also stops being the film's sixth wry reveal. Shot 4's
second line — *"…two years after the dome moved west"* — now reads as the
callback it was always written as.

The dome was considered for this line and rejected. §5 states that at shot 4 City
Hall is drawn as its footprint extruded to its measured height and **not** as the
dome, so a line about the dome would have pointed at a prism.

**Shot 5, the tunnel.** Was: *"The line opens on 3 February 1918, running from Van
Ness and Geary to Sloat and Junipero Serra."* A route description, on the one shot
whose own note in `camera.json` says *"the subject of this shot is the EMPTINESS
west of the ridge"*, about a bore nobody can see. Now:

> **The two headings meet one-eighth of an inch out, and the job finishes fifteen
> days inside the thousand allowed.**
> `annualreportbu19151920san` leaf 185 — the Bureau of Engineering's own datasheet

Two crews digging toward each other under a ridge for 985 days and meeting an
eighth of an inch apart is the same invisible tunnel, told as something people
did. Both leaves were opened and both return 200.

**Left alone, and worth saying why.** Six of the ten lines ended on the same wry
reveal, which is a formula. Two of the six are now something else. The remaining
four — shots 1, 2, 7 and 8 — are the record's own sentences and each is the best
line in its entry; replacing them to break a pattern would be writing for the
pattern rather than for the shot, and that is a decision for Daniel with
`CANDIDATES.md` open beside it, not one to take overnight.

### Whether any shot needed re-timing after the date change — checked, and no

The brief flagged that 7,025 buildings now arrive on their own parcel's
published year rather than their block's estimate, median +3 years, and that
shots composed against the old dates may need re-timing.

**Checked shot by shot against the rendered frame, and none of them moved.** The
reason is structural rather than lucky: **not one of the ten shots is composed
against a building's arrival year.** Six are composed against a camera framing
and a line of copy; three raise a precision ring or a place mark, whose year is
the decision's own year out of the corpus and not the roll's; and shot 4 raises
two footprints whose years the film sets itself (§5). The two shots that show
the fabric arriving — 2 and 6 — are composed against a *span* of years, 1906→1912
and 1918→1945, and a three-year median shift inside a 27-year run moves nothing
a reader can see. The one shot that would have been exposed is shot 4, and its
subject is hidden from the fabric for the whole shot precisely so the roll's date
for that parcel cannot reach the frame at all.

---

## 3. The century scrub

`time.ts` §THE ONE RULE, out of `time/BLOCK-T.md`:

> **A thing is drawn from the first year a published source can put it there.
> Where no source can, it is declared as undated, counted, and put behind a
> flag.**

What the map therefore claims, and nothing more: *before this year, nothing
published — no vote in the Journal, no building in the roll — puts anything on
this street.* It is a "was there by" statement, not a construction date, and the
copy says **accepted** and never **built**.

Most of that rule was already in the landed draw modules and is deliberately not
restated: `streets.ts` §periodOf gates a right of way on the year the Board is
recorded accepting, paving and kerbing it; `trees.ts` gates a tree on its
published planting year; `labels.ts` gates a place name on the year a register
gives it; `scene.ts` gates the massing on the block's own (block, year) row and
each hero on the year a published register gives it.

### What was NOT on the clock, and is now

**The footprint tier was `const iy = 2025`.** A hardcoded present. So the massing
tier un-built with the year and every one of the 87,774 footprints above the
dissolve stayed standing — at the district camera that is a block plan thinning
while the buildings on it do not, which is not a century scrub, it is two maps of
different years in one frame. `paintFootprints` now takes the year and gates on
the roll: a footprint arrives in the year the secured roll dates the building on
its parcel, and `FLAG_NOYEAR` is honoured, so the 12,594 parcels the roll dates
to its own "not known" are drawn in **every** year rather than being given one.

**The arrival wave.** `SHELL.md` §8b.1 left the per-building stagger to this
block because the film owns the clock. It is in: a building of this year's cohort
grows out of the ground and lands pale, settling into its own colour through
`tintIndex`'s five-step ramp — far edge of the frame first, which agrees with
painter's order, so a building that arrives later always paints over one that
arrived earlier and never under. `dn` is normalised on the **screen** and not on
the whole city, because a cohort seen at district zoom occupies a narrow slice of
world depth and a world-normalised stagger collapses it into a flash at exactly
the zoom where the reader is closest to it.

**The undated trees.** `tkzw-k3nq`'s earliest planting date is **1955**, so the
file has nothing whatever to say about a tree standing in 1919. Taken:
*an undated tree is not drawn before 1955* — a statement about the file, not
about a tree. Rejected, and worth recording: spreading the 125,234 undated across
the dated cohort's own measured planting curve. It would have looked better at
every year and it would have put a date on 125,234 trees no file gives one to.
The consequence is stated: **1954 has no street trees and 1955 has 125,234.**

### The streets laying themselves down

`film/out/accept-lines.json`, whole: **2,051 published centreline segments, each
lit in the year the Board voted to accept it, each carrying the exact BookReader
leaf of that vote.** They are painted *under* the fabric and *over* the ground,
and that order is the record's own — the Board accepts a street, and the assessor
dates the houses on it later.

The year's own acceptances arrive on `enter`, drawn from one end, so a year with
four segments reads as four gestures and not as an alpha step.

Honest, and visible in the picture rather than argued:

- **the corpus opens in April 1906**, so every street accepted before the fire was
  accepted before the record starts and downtown stays dark;
- **1,826 of the 2,051 land by 1930** and the last in 1947. Nothing fills the tail;
- **thirteen years in the span have no ingested volume at all**, so the curve sits
  flat through them. That is the sweep, not the city (`time.ts`
  §YEARS_WITH_NO_VOLUME).

Measured on the page: 17 drawn in 1906, 80 by 1912, 562 by 1917, 2,044 by 1943,
2,048 by 1945.

---

## 4. Pausing is the only thing that adds to the screen

During playback the chrome is a year, one line, and a link to the scan. The
record margin, the zoom presets, the loading line, the help row, the site nav,
the footer and the chat launcher are all gone for the duration
(`html[data-city-film]`), and the stage becomes the frame.

Stop, and a panel names what is on the frame: the shot's own line and its scan,
plus **how many of the 2,051 accepted streets are drawn by that year and which
volume and leaf the ones accepted *in* that year came from**, click-through. That
is the rule the whole piece runs on — the film shows you one thing, and stopping
gives you the record behind it.

### The wheel pauses, it does not exit

One wheel tick used to end the whole film, in either direction, so scrolling back
*up* the page did it too — measured in the mock at t = 9.9 s of 134 s, leaving
the camera parked at shot 1's z 2.05 for good. That is the whole of the report
*"the camera does not move from highlight to highlight, i get stuck on the
initial zoom"*: the camera was fine, the film was dead. And the first 23 seconds
are a deliberately locked camera, so a reader who scrolled early was stranded on
the frame that looks most like a bug.

A press and a key are things a reader does *to* something. A wheel is the one
input that arrives by accident. So the wheel **pauses**, which is already this
film's one gesture that adds to the screen: the reader is shown both doors
instead of having one chosen for them. A click and Escape still exit.

The listeners are bound on the **window**, in the capture phase. On the canvas
the wheel never fires — the renderer has its own capturing wheel listener and
takes it first — and that is how the original defect survived: a click and Escape
both worked, so it looked fine by hand.

`CityRenderer.onDown`/`onWheel`/`onKey` return early while the film is running,
so the gesture machine cannot start a drag underneath one of the film's four ways
out and land the reader in the explorer at a camera the film never stopped at.

---

## 5. Two places the film overrules the map, and both are stated

**The fabric must not already be holding what the film is raising.** The secured
roll dates City Hall's parcel **1906** — the parcel, not the building; the dome
was finished in 1915 and the record's own item for it is the 1915 volume. So the
fabric has been drawing that footprint since the film's first frame, and without
a hide, the 2.4 s move into shot 4 arrives on a finished City Hall, deletes it,
and rebuilds it. That reads as a fault, not as construction.

**And it is hidden for the WHOLE shot, not only while it is rising** — which is a
divergence from the mock, and it was found by looking. The mock lifts the hide
the instant the rise finishes, and that is right there: its fabric draws the same
prism the film draws, in the same place. It is not right here, because eleven of
these footprints are **heroes**. The moment the hide lifted, City Hall's drum,
dome, ribs and lantern came back *under* the flat prism the film had just
finished raising, and the frame carried two drawings of one building
(`p5-13`, before). `heroQueue` now takes the same hide set.

What that costs is stated rather than hidden: **at shot 4 City Hall is drawn as
its published footprint extruded to its measured height, and not as the dome.**
Two drawings of one building is worse than a plainer one.

**The family colour is a lens, not a swatch.** `landmarks.ts`'s own note records
the measurement — against 166,166 earth and slate roofs a 60 % `#1e45e4` "read as
a selection swatch rather than as a roof", and 0.40 is the same mistake at a
lower opacity. The rising footprint is the landmark palette's own stone pulled
through `heldMaterial` at `HELD_PULL_ROOF` = 0.26 and `HELD_PULL_WALL` = 0.20.
`p5-13` before and after is the pair.

---

## 6. The buffer, and the frame rate

### What the blit does, and it does work

`camera.ts` §decideRasterExternal: for a fixed projection two camera states
differ by a pure scale and a translation, so one `drawImage` of a buffer painted
at camera A is **exactly** the frame camera B would have painted. Nothing in that
fact cares who moved the camera.

What a film adds that a gesture cannot: a finger's next position is a guess, so
the gesture path leads the buffer off the pan velocity. **A film's next position
is known.** `planFilmBuffer` walks the actual trajectory over the next 460 ms,
takes the union of the viewports it will ask for, and paints one buffer covering
all of them; where coverage and sharpness cannot both be met the window is
*shortened* until they can, and it is cut at a band change because ZEX moves
there and no blit can cross it.

**Measured, and it works as designed: a two-second camera move costs 1 to 5
rasterisations, not one a frame.**

### And the clause it does not meet

The performance budget is withdrawn. The one survivor is **no visible hitch
during a camera move**, and it is **not met**.

rAF counted in the page during real playback, 1440 × 940, DPR 2, headless
Chromium (CPU raster), **on the dev server**, range over two runs:

| | fps | worst frame | rasters |
|---|---:|---:|---:|
| move 3→4  z 3.2→28 | 1.2–32.9 | 552–1300 ms | 2–3 |
| move 4→5  z 28→2.6 | 26.0–30.7 | 642–833 ms | 4–5 |
| move 5→6  z 2.6→1.9 | 1.7–2.0 | 1265–1485 ms | 2 |
| move 6→7  z 1.9→1.1 | 43.5–47.8 | 1013–1111 ms | 1 |
| move 7→8  z 1.1→2.55 | 39.2–43.6 | 656–725 ms | 2 |
| move 8→9  z 2.55→3.6 | 10.6–12.8 | 631–658 ms | 4 |
| move 9→10 z 3.6→1.1 | 15.9–17.0 | 1142–1236 ms | 2 |
| hold shot 1 | 4.4–79.4 | 687–704 ms | 1–3 |
| run shot 6 west fills | 18.3–23.9 | 1027–1041 ms | 2–3 |
| run shot 10 to now | 0.9 | 1078–1102 ms | 3 |

The shape is unambiguous: **between rasterisations the film is free, and every
rasterisation is a frozen frame of half a second to a second and a half.** A
0.6–1.4 s freeze inside a 2.0 s travel is not a sharper picture, it is a stopped
one.

**Where the cost is NOT, established by ablation rather than by argument:**

- **not the film's own passes.** `?filmoff=accepted,subjects` turns off the
  accepted-street underlay and the whole subject overlay. The worst frame moved
  from 552–1300 ms to 566–1408 ms — inside the run-to-run spread. It is the base
  scene rasterisation.
- **not the footprint loop.** Turning `buildings.ts`'s two motion rungs on for a
  film move — `RECT_SCALE`'s area-preserving silhouette and `QUAD_PX`'s four real
  vertices, the obvious lever — moved the worst frame 605–1443 → 551–1300 ms,
  again inside the spread. The ladder's own arithmetic says why it would not: the
  loop is "about 0.7 µs a building", 60 ms for the whole city. **The change was
  reverted**, because keeping it would trade the picture (silhouettes instead of
  buildings, in the one part of the film that is watched rather than scrubbed)
  for nothing measurable — the same trade the mock's own massing hold was retired
  for.
- **not mostly the resolution either**, and `camera.ts`'s own `FILM_DPR` table
  is the independent measurement: 3.3× fewer pixels (1.00 → 0.55) moves the worst
  mid-move frame only 1036 → 729 ms. What is left is the per-raster work that
  scales with neither — `TerrainField`'s 67,600 nodes and the surround's 56,330
  cells, rebuilt into a buffer at the motion margin on every rasterisation.

**Two caveats that are part of the measurement and not excuses.** These numbers
are off the **dev server**, not a production build, and `SHELL.md`'s own figures
were taken against the shipped build; and a second agent was compiling this same
tree throughout. What survives both caveats is `camera.ts`'s independently
measured 1036 ms at the shipped `FILM_DPR`, which is the same magnitude.

**The fix, named so it is not lost, and not attempted here:** the mid-move
rasterisation has to stop repainting the ground. Everything above the terrain
already changes between rasters; the terrain and the surround do not change at
all inside a LOD band except by translation and scale — which is the same
similarity argument the blit itself rests on, one layer down. A ground plate
rasterised once per band and blitted under the city would take the fixed half of
the cost out of every mid-move raster. That is a change to `terrain.ts`'s own
caching and belongs to whoever owns that module.

### `FILM_DPR`, and where this block disagrees with its brief

The brief states that the film buffer is painted at `FILM_DPR = EXT_K_MAX = 1.70`
because a move magnifies it by up to that, and that a buffer painted at 1× is
sampled at 0.588 device pixels per screen pixel.

**`camera.ts` ships `FILM_DPR = 1.0`, and its own comment records the measurement
that chose it** (dated 2026-08-23, before this block started): 1.70 buys a
further 1.91 of 255 of picture over 1.00 and costs 58 % more on the worst frame
of a camera move, 1036 → 1630 ms. Given that the worst frame is already the thing
that fails, this block did not change it, and does not think it should be changed
until the ground plate above is done. **Reported rather than patched.**

---

## 6b · Block B3, 2026-08-24 — the hitch, measured to the bottom

Everything in §6 above stands. What follows is the same defect taken apart with a
CPU profile and four sweeps, and what was done about it.

### `FILM_DPR = 1.0` and `EXT_K_MAX = 1.70` were never in contradiction

The brief flagged the two as claims that cannot both be right. They are both
right and they are about different instants, and the reason is one word in
`planSlots`: **`FILM_DPR` is a MULTIPLIER on the device pixel ratio, not an
absolute one.**

    ["fi", Math.max(1, DPR * FILM_DPR), mMotion]

At `FILM_DPR = 1.0` on a DPR 2 screen the buffer is painted at 1 device sample
per device pixel *at the moment it is painted*, and the blit then magnifies it by
up to `EXT_K_MAX = 1.70` before the next rasterisation, so at the WORST instant of
a buffer's life it is sampled at 1/1.70 = 0.588. Raising `FILM_DPR` to 1.70 makes
that worst instant 1:1 and every other instant oversampled, for 2.89× the pixels.
Nothing was wrong; the two sentences were being read as though they described the
same moment.

### Re-measured after the ground plate, and the plate does not reach a move

`.parity/b3fps.py`, rAF counted in the page during real playback, 1440 × 940,
DPR 2, headless Chromium, dev server. **Nothing is drawn into a detached canvas**
(NIGHT.md trap 5) and the raster count is printed on every row, because a window
with no rasterisations in it is a broken measurement rather than a fast one.

| move | z | worst frame | rasters |
|---|---|---:|---:|
| into 3 civic-bonds | 2.05 → 3.20 | 699 ms | 4 |
| into 4 city-hall | 3.20 → 28.0 | 949 ms | 3 |
| into 5 tunnel | 27.98 → 2.60 | 901 ms | 5 |
| into 6 west-fills | 2.60 → 1.90 | 1,225 ms | 2 |
| into 7 hetch-hetchy | 1.90 → 1.10 | 666 ms | 2 |
| into 8 treasure-island | 1.10 → 2.55 | 758 ms | 2 |
| into 9 yerba-buena | 2.55 → 3.60 | 683 ms | 4 |
| into 10 to-now | 3.60 → 1.10 | 1,075 ms | 2 |

The ground plate landed and **the hitch is the same size it was**. `terrain.ts`'s
own note says why, and it is not a shortfall: the plate key carries `camKey(f)`,
so it hits on a hold and a scrub and **misses on every frame of a move, by
construction.** The 404 → 90 ms that the plate bought is a fixed-camera number.

### Where the frozen frame goes, profiled rather than argued

`.parity/b3prof.py` — a real CDP CPU profile of the move into shot 6, 200 µs
sampling, self time by frame:

    782 ms  30.8 %  fill                (canvas)
    436 ms  17.2 %  paintCell           terrain.ts:1204
    262 ms  10.3 %  restore             (canvas)
    100 ms   3.9 %  rgbHex              terrain.ts:381
     93 ms   3.6 %  fillRect            (canvas)
     30 ms   1.2 %  paintFootprints     scene.ts:1284

**Two thirds of a mid-move rasterisation is the ground being repainted**, and the
city's own footprints are 1.2 % of it. That is §6's named residual, now measured
rather than inferred.

### `FILM_DPR` settled by looking, which is what the brief asked for

`.parity/b3crop.py` — the same film millisecond at four settings of the dial, a
300 × 190 CSS px crop of City Hall's own block at 3× nearest-neighbour,
`b3-dprcrop-2x2.png`. Two things the harness had to get right, and the first pass
got one of them wrong: the crop is taken **inside a move and near the end of a
buffer's life**, because a buffer is sharp the instant it is painted and softest
just before it is repainted; and it is taken at **the same film millisecond at
every dial**, because running each dial for a fixed wall time lands it at a
different `t` — the first pass compared z 28 against z 10.6 and would have
reported the cheapest dial as the sharpest one.

Looked at, at 3×: **0.55 is soft and it is obvious** — tree crowns blurred, the
kerb line smeared, the building's step edges mush. **1.00, 1.40 and 1.70 are
indistinguishable.** That is `camera.ts`'s own 1.91-of-255 measurement confirmed
by eye rather than by arithmetic, and it settles the brief's question: the whole
of the visible gain is 0.55 → 1.00, and 1.70 costs 48 % more on the worst frame
of a move for a difference this crop cannot show. **`FILM_DPR` stays at 1.0.**

### Two sweeps that say no dial in this block's files can fix it

**`FILM_DPR`** — `.parity/b3dpr.py`, the dial set on the settled page and the
resulting slot ASSERTED before every row (a resize that coalesces silently
measures the shipped constant under six labels, which is how the first sweep
lied):

| filmDPR | buffer | worst, into 4 | into 6 | into 10 |
|---:|---:|---:|---:|---:|
| 0.55 | 2.37 Mpx | 608 ms | 584 ms | 650 ms |
| 0.75 | 4.41 Mpx | 833 ms | — | — |
| **1.00** | **7.84 Mpx** | **1,008 ms** | **1,158 ms** | **1,117 ms** |
| 1.40 | 15.37 Mpx | 1,313 ms | 1,592 ms | 1,358 ms |
| 1.70 | 22.66 Mpx | 1,492 ms | 1,883 ms | 1,575 ms |

A straight line with **an intercept of about 480 ms**. Nine and a half times
fewer pixels takes the worst frame down by 40 %, because half of every
rasterisation is per-node work that does not scale with pixels at all. There is
no setting of this dial at which a camera move is smooth, and 0.55 is visible
mush, so `FILM_DPR` **stays at 1.0**.

**`EXT_WIN`** — `.parity/b3win.py`, five moves at 460 / 900 / 1,600 / 2,600 ms and
at two magnification ceilings: **the raster count does not move.** Two to five per
move at every setting. The window is not the binding constraint; `EXT_K_MAX` is,
and no single buffer can hold an 8.75× change of scale at any window length —
coverage and sharpness trade against each other as the square, so at fixed
sharpness the TOTAL frozen time inside a move is invariant. Confirmed against the
motion tier as well (`.parity/b3move.py`, `CityScene.prototype.paint` wrapped from
the probe rather than editing a file this block does not own): forcing
`f.moving = true` halves the worst frame — 875 → 342, 1,075 → 492, 775 → 500 —
and leaves the total frozen time per move unchanged at 2.1–2.5 s, because the
cheaper rasterisations simply happen more often.

`EXT_WIN` stays at 460 and both dials are now reachable from a probe
(`camera.ts` §FDIALS, `film.ts` §FWIN, dev builds only) so the next person
re-measures instead of re-deriving.

### The thing nobody had measured: the film is not 2 minutes 14

`CityFilm.tsx`'s clock advances on `Math.min(0.05, dt)`. A 900 ms frame therefore
moves the film on by 50 ms — **a slow frame does not drop, it STRETCHES** — and
nothing anywhere said so. `.parity/b3wall.py` plays the whole film and compares
its own clock with the wall clock:

    nominal 134.0 s     wall 269.1 s     ×2.01

`.parity/b3seg.py` splits that across the timeline's own segment kinds, which is
what located the second cost:

| segment | film | wall | stretch |
|---|---:|---:|---|
| title | 3.0 s | 4.6 s | ×1.53 |
| move | 17.9 s | 30.9 s | ×1.73 |
| build | 12.1 s | 11.8 s | ×0.97 |
| **run** | **56.1 s** | **172.2 s** | **×3.07** |
| hold | 40.9 s | 45.6 s | ×1.11 |
| end | 3.9 s | 4.0 s | ×1.01 |

**The runs, not the moves, are most of it.** `renderer.ts` §contentKey quantises
the film's year to `YEAR_Q = 16` steps so the fabric's arrival wave gets its
steps — which is correct, and which costs **sixteen rasterisations a year**. The
film crosses about 132 years inside its runs, so that is ~2,100 rasterisations,
and at the ~80 ms a fixed-camera rasterisation costs it is the 172 s measured.

### What landed: the spare version

Not a new fallback — **the one this film already authored.** `film.ts`'s
reduced-motion path answers exactly this question, for a different reason: the
camera cuts rather than travels, and the year lands in whole years on an
otherwise still frame, with `running` false so the arrival wave never starts.
`FilmStateOpts.spare` reaches for the same two branches when the reason is the
machine rather than the reader.

The camera cuts at the **head** of the move (`u = 1`), so the move's remaining
milliseconds are a still hold on the incoming frame: the running time and the
copy timing are exactly as authored, and the incoming frame gets its
rasterisation before any copy appears on it.

`CityFilm.tsx` §THE VERSION THE MACHINE CAN PLAY decides it on one number, which
is the film's own: **how much film time a second of wall clock buys.** The clock
clamps at 50 ms, so a 900 ms frame scores 0.055 and a 16 ms frame scores 1;
averaged over WALL time that ratio *is* the playback speed, and it needs no
separate rule for a travel and for a run because both fail the same way. Under
0.6 for long enough and the film latches to the spare version and stays there —
a laptop does not get faster between two viewings, and a film that changed its
grammar back and forth while a reader watched would be worse than either version.
One slow frame cannot do it (`KEEP_UP_W_MAX` 0.35: one 900 ms frame leaves the
average at 0.67, two consecutive take it to 0.45), and nothing is decided in the
first four seconds, where the ground is still landing.

**Measured, same harness, same machine, before and after** (`.parity/b3seg.py`,
a full 134-second playthrough each, no seeking and no pausing):

| | before | after |
|---|---:|---:|
| whole film, wall clock | 269.1 s (×2.01) | **184.8 s (×1.38)** |
| runs | ×3.07 | **×1.52** |
| moves | ×1.73 | **×1.88** |
| worst frame, into 4 city-hall | 949 ms | **258 ms** |
| worst frame, into 6 west-fills | 1,225 ms | **10 ms** |
| worst frame, into 7 hetch-hetchy | 666 ms | **142 ms** |
| worst frame, into 9 yerba-buena | 683 ms | **10 ms** |
| worst frame, into 10 to-now | 1,075 ms | **10 ms** |
| median frame through a transition | 16.6 ms | **8.3 ms** |
| rasterisations, run 6 | 27 | **6** |

Four of the eight transitions now run at 120 fps end to end with **zero**
rasterisations. The first move still pays 892 ms, and the `move` row above went
UP rather than down — both are the same thing, and it is not a regression: the
verdict is reached from frames this machine has actually drawn and nothing is
decided before 20 s of playback, so the first travel is paid in full before the
film knows. Buying that back would mean deciding from the startup, where the data
layer is still landing cells and every frame is a rasterisation — measured at
×56 on the film's first run segment, which would put a fast laptop on the spare
version for the whole film on the strength of its first half second.

**What it costs, stated rather than hidden: on a machine that cannot draw them,
the eight camera travels are gone and the arrival wave is gone.** That is a real
loss and it is the smaller one — a travel drawn at four frames a second is not a
travel, and sixteen steps of a wave that take two seconds each is not a wave. On
a machine that can draw them, `spare` never latches and not one frame of the film
changes.

### Still open, and named for whoever owns those files

1. **`terrain.ts` — a ground plate a move can use.** Two thirds of every mid-move
   rasterisation is ground that changed only by a similarity transform, which is
   the same argument the frame buffer itself rests on, one layer down. The file's
   own note rejects a scale-tolerant plate on the grounds that holding one to
   1.3× over the z 3.2 → 28 move needs about seven plates against the buffer's two
   to five — but a plate REPAINT and a full rasterisation are not the same cost,
   and the ground tolerates far more magnification than a street hairline does,
   so the two do not have to share a `k` budget. This is the fix. It is worth
   60–80 % of every freeze and it would give the travels back.
2. **`renderer.ts` — `const moving = film ? false : …`.** A film rasterisation
   taken mid-travel paints the ground at settled quality. Measured above: the
   motion tier halves the worst frame. It is one word, and it is not this block's
   word.
3. **`renderer.ts` — `YEAR_Q = 16` during a run.** Sixteen rasterisations a year
   is what a wave costs; whether it is worth 116 s of wall clock is a question for
   whoever owns the wave.
4. **Whether any of this is a headless artefact.** These numbers are headless
   Chromium with CPU raster, on the dev server, with other agents recompiling the
   tree throughout (three runs were lost to a navigation and one to
   `encode_city_chunks.py` clearing `public/data` mid-measurement). A single
   headed run measured a 1,733 ms worst frame on the move into shot 4 — worse, not
   better — but headed playback could not be driven reliably on this machine and
   **this is not settled.** If a GPU-backed browser keeps up, `spare` never
   latches and the film is exactly what it was.


## 6c · Block B3 — the rails, judged as motion design

`.parity/b3rate.py`, 24 seeked samples per move on the shipped payload. This is a
question about the rails, not about the frame rate, so nothing is drawn.

| move | s | z | octaves/s | peak/mean step | band crossings |
|---|---:|---|---:|---:|---:|
| into 3 civic-bonds | 2.0 | 2.05 → 3.20 | 0.32 | 1.72 | 0 |
| into 4 city-hall | 2.4 | 3.20 → 28.0 | **1.30** | 1.72 | 1 |
| into 5 tunnel | 2.6 | 28.0 → 2.60 | **1.32** | 1.72 | 1 |
| into 6 west-fills | 1.8 | 2.60 → 1.90 | 0.25 | 1.74 | 0 |
| into 7 hetch-hetchy | 2.4 | 1.90 → 1.10 | 0.33 | 1.73 | 1 |
| into 8 treasure-island | 2.2 | 1.10 → 2.55 | 0.55 | 1.72 | 1 |
| into 9 yerba-buena | 2.4 | 2.55 → 3.60 | **0.21** | 1.72 | 0 |
| into 10 to-now | 2.0 | 3.60 → 1.10 | 0.85 | 1.72 | 1 |

**Nothing jerks, and that is now measured rather than asserted.** `peak/mean` is
the `travel` bezier's own peak velocity against its average, and it is 1.72 on
seven of the eight and 1.74 on the other — the same curve, sampled the same way,
on every move. No move crosses more than one LOD band, and the frame sequences
show no jump at the crossing. §2's earlier note that the shot 4 lurch "was never
the speed" holds: the curve is identical on the move that read badly and the move
that read cleanly.

**What the table does say is that the film has no camera speed.** 0.21 to 1.32
octaves a second is a factor of six, and it is not a choice — it falls out of the
shot list's `z` values divided by hand-set `move_ms`. Shots 4 and 5 are express
pushes and shot 9 is a crawl, and a reader has no way to read the difference as
meaning anything. A film would either hold one speed and let the durations vary,
or vary the speed deliberately and put the fast pushes where the record is
dramatic. **This is an editorial decision on `camera.json`'s `move_ms`, it costs
nothing to make, and it is not this block's to take** — it changes the shot
timings, which `buildTimeline` asserts and which Daniel has not been asked about.

### The transitions, looked at rather than argued about

`.parity/b3seq.py`, six transitions × eight frames, wide and at 390 px, written
under `b3-seq-` and `b3-mseq-`. The harness **seeks** rather than waiting, so the
film is paused between shutters and `spare` never latches: these sheets show the
AUTHORED trajectory, which is what a motion-design review needs. The rAF harness
above shows what the machine actually draws. Both are needed and neither
substitutes for the other.

Read frame by frame on `b3-sheet-A-into-4-city-hall` (z 3.2 → 28, crossing the
band at 5.87) and `b3-sheet-B-into-5-tunnel` (z 28 → 2.6, the same crossing the
other way): the zoom is monotone in both directions, the band crossing does not
jump the camera, the accepted-street underlay stays registered to the fabric
through the blit, and no frame carries a stretched or half-painted buffer.

## 7. What needed a different shape, and what could not be ported

### Reported to the modules that own them

1. **`trees.ts`'s undated gate should take the year.** `WFLG.undated` is a `LOOK`
   ablation switch — "draw the trees whose planting date is not published" — and
   Block T's decision makes it a function of the clock. `time.ts`
   §`applyUndatedTreeGate` is the seam, and it is honest about being a mutation
   of a module-level flag. The gate belongs in `trees.ts`, next to `TREE_YEAR0`.

2. **`projection.setBand()` exists and nothing calls it.** So the buildings' own
   ground term runs at `ZEX_BY_STEP[0]` = 3.3 at every LOD band while each band's
   `TerrainField` carries its own (3.3 / 2.6 / 2.0). A film that computed its
   camera off the ladder and handed it to a renderer drawing at 3.3 would land
   every keyframe metres off the thing it points at, silently — so `filmStateAt`
   takes a `zexFor` and the shell passes `() => projection.zex`, reading the
   number the renderer is actually using. The film's band-crossing bias (§the
   elevation term, `film.ts`) is therefore currently a no-op, and it is kept
   because it is what makes the film correct the day someone wires `setBand`.

3. **`base/marks.json` still carries the pre-Block-T place-year ladder.**
   Measured on the shipped file: **244 of 1,243 places are dated 1906** and 116
   are undated. Block T re-ran the same ladder with the `FLAG_NOYEAR` rung
   refused — 2,825 footprints carry a fabricated 1906 precisely so they can be
   drawn at all — and got 9 places moving to a real later year and 217 falling
   through to no year at all, for 336 undated of 1,243. That is a pipeline pass
   on `marks/`, not a renderer change, and this block did not do it.

### Not ported, and why

- **Park rings and reservoirs are not year-gated.** Block T dates 21 of 328 park
  rings by the made land they stand on, and 5 of 11 reservoirs by the first year
  the Journal names them — Sunset Reservoir leaving the 1906, 1915 and 1930
  Sunset frames is the single largest object that block removes. The production
  `parks` chunk carries `cls` and no year, and Block T's own `time-data.js`
  carries the years as arrays **indexed by the mock's own ring order**. Porting
  them means an encoder pass with an asserted index join. Counting alone is not
  enough — the production chunk names 247 Recreation and Parks properties against
  Block T's 328 rings — and **guessing the join would put a year on the wrong
  park**, so it is reported rather than attempted.
- **Street-name years, and canopy years**, for the same reason and out of the same
  file. `time/label_years.py` dates 1,390 of 2,786 street labels; without them a
  1906 Sunset can letter MORAGA ST over dunes with no line under it, which is the
  defect Block T §3.4 found by looking. Production does not draw street names at
  the two whole-city cameras most of the film sits at, so it does not show in
  these ten shots — but it will at shot 4's zoom.
- **The burned ground.** `drawTerrain(f, t, burnT)` takes the phase and the call
  site passes a literal zero — **`scene.ts:1261`, `const tr = drawTerrain(f, t, 0)`**,
  found by B3 so the next person does not have to. The film computes the phase
  (`FilmState.burn`, and `__cityFilm.where().burn` reports it) and has nowhere to
  put it: the seam it needs is a `filmBurn` field on `CityScene` beside
  `filmHide` and `filmRunning`, set by `driveFilm`. That is one field in
  `scene.ts` and one line in `renderer.ts`, and both belong to another block. The hairline is drawn (§8) and the fabric inside it is
  visibly empty for a reason nothing had to arrange — the roll dates what is
  standing today, so nothing that burned is ever drawn — but the *ground* is not
  tinted. `TerrainField.node()`'s colour cache is dropped on a burn-phase change,
  and that is 67,600 nodes per frame for the 1.4 s the phase is moving.
- **The reduced-motion path has not been run.** The code is there and it is the
  version Block R argued for — the camera cuts rather than travels, landmarks
  arrive whole, accepted streets land whole, **and the year still runs**,
  quantised to whole years, because a year going from 1924 to 1925 is not
  vestibular and pinning it removed the subject from four of the ten shots. It
  has not been exercised on the real page.
- **No sound, no captions, and no viewport under 820 px was looked at.** The
  phone rules are in the CSS (the plate goes full width, the wash loses its mask,
  the scrub hairline grows to 30 px for WCAG 2.2 SC 2.5.8) and have not been
  screenshotted.

---

## 8. What had to be found by looking

Five things, and not one of them threw, failed the type checker or moved a test.

1. **The chrome was all still there.** The record margin, the zoom presets, the
   help row, the nav and the footer, on every frame of a film whose fourth rule
   is that the chrome is a year, a line and a scan. `p5-10`, before.
2. **The burn line was not drawn at all.** Production loads the seven published
   rings and flags the DEM cells inside them; nothing strokes the boundary,
   because `SHELL.md` correctly left the burn to this block. Shot 1's entire
   subject was missing and the shot looked like an ordinary 1906 frame.
   `drawBurnLine` paints it at viewport size, one gesture across all seven rings.
3. **The frame was a gazetteer.** Twenty-five to thirty place names on the
   whole-city frames — the same defect the mock measured as "thirty-one labels, of
   which nineteen were street names, competing with a red hairline that is the
   entire subject of the shot". `CityScene.filmPlaceCap` = 12, taken in order of
   each place's own published span. Which twelve is not a choice and the order is
   the same every run.
4. **`setPlaces` did not invalidate the shortened list**, so the cap silently did
   nothing when `marks.json` landed after the film had been played once.
5. **Two drawings of one building** at shot 4 — §5.

And one found by measuring rather than by eye: **the first frame-rate run
reported 120 fps on every row with zero rasterisations**, which is what a film
that is not running looks like. A frame rate with no rasterisations in it is a
broken measurement, and it took printing the raster count next to the fps to see
it. `window.__cityFilm.rasters` is in the probe for that reason.

---

## 9. The probe

`window.__cityFilm` — `seek`, `pause`, `resume`, `where()`, `t`, `total`,
`shots()`, `rasters`, `why`. It reads and it seeks; it cannot change a date, a
framing or a line of copy.

It is not scaffolding left behind. `film.js` shipped `window.FILM` and **every
measurement this piece has ever made went through it** — the stills, the frame
sequences through a move, the frame times, and the 24 control assertions that
found "the wheel does not break out of the film". A film is a thing you have to
be able to seek to a millisecond and look at: wall-clock screenshots cannot check
a two-second camera move, and judging motion from a single still is how every
earlier motion bug on this project survived.

`?filmoff=accepted,subjects` is the film's own ablation switch, the same idiom
`SceneLayers` uses and for the same reason.

---

## 10. Screenshots

All at 1440 × 940, DPR 2, against the dev server unless a row says otherwise.

| | |
|---|---|
| `p5-00-entry` | the entry plate, with the play control |
| `p5-01-title-card` | the title card over the 1906 city |
| `p5-10 … p5-19` | the ten moments, one per shot |
| `p5-30-seq-A-into-city-hall-00…07` | **eight frames through the move into shot 4** — z 3.21 → 28.0, crossing the LOD band at 5.87 |
| `p5-31-seq-B-out-to-whole-city-00…07` | **eight frames through the move into shot 7** — z 1.90 → 1.10, crossing the band at 1.62 |

Both sequences were read frame by frame: the zoom is monotone, the band crossing
does not jump the camera, the accepted-street layer stays registered to the
fabric through the blit, and no frame shows a stretched or half-painted buffer.
What they do not show, because a still cannot, is the freeze at each of the two
to five rasterisations — that is §6, and it is counted rather than looked at.

### Block B3, 2026-08-24

| | |
|---|---|
| `b3-seq-{A…F}-*-00…07` · `b3-sheet-{A…F}-*` | **six transitions × eight frames**, wide. A into shot 4 (z 3.2 → 28), B into shot 5 (28 → 2.6), C into shot 7, D into shot 8, E into shot 10 (the pull-out to the whole peninsula), F the title card into shot 1 |
| `b3-mseq-*` · `b3-msheet-*` | **the same transitions at 390 px**, four of the six |
| `b3-dprcrop-{0.55,1.00,1.40,1.70}` · `b3-dprcrop-2x2` | the same film millisecond mid-move at four settings of `FILM_DPR`, cropped to City Hall's block at 3× |
| `b3-play-*` · `b3-play-sheet` | **the whole film played end to end**, a frame every 1.8 s of wall clock, nothing seeked and nothing paused |

Read frame by frame, all six wide sheets and the four phone sheets: the zoom is
monotone in both directions, no move crosses more than one LOD band and no
crossing jumps the camera, the accepted-street underlay stays registered through
the blit, and no frame carries a stretched or half-painted buffer. At 390 px the
copy plate goes full width and stays readable, and the twelve place names are
legible at whole-city.

Two things the sheets show that were not being looked for:

- **The title card's wash is a step, not a fade.** Three frames of a near-white
  city, then the full-contrast 1906 frame at t = 3,000 with nothing in between at
  a 257 ms sampling interval. `CURVE.fade` exists and this is not using it.
- **The surround's cells are visible as blocks at 390 px** in the sky and the
  open water — `terrain.ts`'s own grid at whole-city on a small stage, not the
  film's buffer, which is painted at full device resolution there.

### The harness

Everything above is `.parity/b3*.py`, and each file says at the top which trap it
is avoiding. Four of them are worth keeping:

    b3fps.py    rAF counted during real playback; raster count printed beside the
                fps, because a window with no rasterisations in it is a broken
                measurement and not a fast one
    b3prof.py   a real CDP CPU profile of one move, self time by frame
    b3seg.py    the wall clock against the film clock, split by segment kind
    b3crop.py   the same FILM millisecond at four dials, magnified

Three practical notes for whoever runs them next. The dev server is shared with
the other agents: five runs were lost to a navigation mid-measurement and one to
`encode_city_chunks.py` clearing `public/data`, so every script retries.
`__cityFilm.ready` is `!!liveRef.current` — whether the film is PLAYING, not
whether it can — so wait on the entry plate's own label instead. And a stage
resize that is undone 600 ms later coalesces, `resize()`'s `changed` guard skips
`planSlots`, and the sweep then measures the shipped constant under six different
labels; assert the slot you got.

---

## 11 · Block M1, 2026-08-24 — the film has to lie linear in time

> *"In the current film sometimes it jumps ahead in time then back again — it's
> weird, the film has to lie linear in time."* · *"Film to be relevant key
> moments (it never shows when construction on Golden Gate starts, when it
> opens) and mind-blowing motion design (even if prerecorded)."*

Three things, in that order: **the year must be monotone**, **the moments must
be worth watching**, **the motion must land**. Written as the work happens.

### 11.1 The rewind, found by instrumenting the clock rather than reading the table

`.parity/m1time.py`, mode `seek`: the film paused, seeked every **50 ms** across
its whole 134,000 ms, `where()` read at each step, `(t, shot, seg, year, z)`
written down. `filmStateAt` is a pure lookup — that is §1's whole design claim —
so a dense seek is the authored year curve exactly, and it carries the shot index
beside it, which reading the payload does not.

**2,681 samples. Exactly one backward interval, and it is not where the shot
table suggests:**

    t  74200 ->  74250   shot 7 hetch-hetchy (run)  year 1945 -> 1944   d=-1
    t  74350 ->  74400   shot 7 hetch-hetchy (run)  year 1944 -> 1943   d=-1
    t  74400 ->  74450   shot 7 hetch-hetchy (run)  year 1943 -> 1941   d=-2
    t  74450 ->  74500   shot 7 hetch-hetchy (run)  year 1941 -> 1940   d=-1
    t  74500 ->  74550   shot 7 hetch-hetchy (run)  year 1940 -> 1939   d=-1
    t  74550 ->  74600   shot 7 hetch-hetchy (run)  year 1939 -> 1938   d=-1
    t  74600 ->  74650   shot 7 hetch-hetchy (run)  year 1938 -> 1937   d=-1
    t  74650 ->  74700   shot 7 hetch-hetchy (run)  year 1937 -> 1936   d=-1
    t  74750 ->  74800   shot 7 hetch-hetchy (run)  year 1936 -> 1935   d=-1
    9 backward samples, 10 years of rewind in total

and the per-shot spans it resolves to:

    shot id                    t0      t1  yFrom    yTo
       1 burn                   0   11400   1906   1906
       2 rebuild            11400   23400   1906   1911
       3 civic-bonds        23400   31900   1912   1912
       4 city-hall          31900   44900   1912   1917
       5 tunnel             44900   54000   1917   1918
       6 west-fills         54000   71800   1918   1944
       7 hetch-hetchy       71800   82200   1945   1935    <- 10 years back
       8 treasure-island    82200   95100   1935   1939
       9 yerba-buena        95100  104000   1939   1966
      10 to-now            104000  134000   1966   2018

**It is the first of the brief's two candidate bugs and not the second.** The
year does not lag the camera: `CityFilm.tsx`'s frame loop resolves ONE
`filmStateAt` and hands `driveFilm` that call's `cx/cy/scale/step` and that same
call's `year`, so the two cannot separate by construction (§11.2 measures it
anyway, on the running film, because "cannot by construction" is what the back-
wall bug also said). It is a **shot that is out of order because its subject
genuinely belongs earlier** — which is the case the brief says to fix by moving
the shot.

**What the reader actually sees.** Shot 6 runs the west side out to 1945. Shot 7
then pulls back to the whole peninsula and counts 1945 down to 1935 over 900 ms,
un-building ten cohorts on a settled frame. Then shot 8 plays 1935 → 1936 → 1939
and shot 9 plays 1939 → 1966: **1936 to 1945 is shown twice, forward, backward,
forward.** `SCRIPT`'s own comment defends the countdown as reading "as a rewind
rather than as a fault", and it is honest about the year label — but a rewind is
still the film going backwards, and Daniel watched it and called it weird.

`camera.json` shot 7 is where it comes from: `"year": {"from": 1945, "to": 1935,
"run_ms": 0, "note": "hard cut back to 1935"}`. The shot was composed as a
breath — target `null`, the whole-city fit, the longest hold in the film — and
the year was pulled back to it because the water arrived in the thirties. The
camera move is right and the year is the thing that is in the wrong place.

### 11.2 The fix: the year line is derived, and it is asserted

Two independent statements of one quantity is what let the rewind in. A shot
opened on its **payload's** `y0` and closed on its **`SCRIPT`'s** run acts, and
nothing ever compared one shot's closing year with the next one's opening year —
so `camera.json`'s `"year": {"from": 1945, "to": 1935, "note": "hard cut back to
1935"}` went through untouched and the two halves of the film's clock disagreed
in silence.

There is now one statement. `buildTimeline`:

- **a shot opens on the year the previous shot closed on**, and `SCRIPT`'s `run`
  acts are the only thing that moves it. `shots[i].y0` and `.y1` are no longer
  read for the clock at all — only `shots[0].y0`, the year the film opens on;
- **a `run` act that runs backward throws**, naming the shot and the act;
- **every segment boundary is asserted non-decreasing** before the timeline is
  returned — every boundary and not only the shot boundaries, because the rewind
  lived inside a shot.

`film.test.ts` builds the timeline against the **shipped payload** at module
load, so those assertions are already 391 tests' worth of guard: a payload that
reintroduces a rewind cannot get through the suite. No new test was needed and
none was added.

### 11.3 Where the ten years went, and the moment that was hiding in them

Shot 6 does not lose 1936–1945 to a shorter run; the film goes on drawing those
years in shots 8, 9 and 10. What shot 6 loses is the part of them it was
*watching*, and the honest count is `film.json`'s own: **1,223 of the 1,350
acceptances that shot exists for land by 1935**, and 127 after it. Same 16,000 ms
over 17 years instead of 27, so the fill is also 1.06 years a second instead of
1.69 — slower to watch than it was.

Then the ten years had to go somewhere, and looking at what is actually on the
frame in them answered Daniel's other question in the same breath.

**The Golden Gate Bridge is already on this map, it already arrives in 1937, and
the film already had it in shot.** `.parity/m1look.py` seeked shot 6's own camera
to 1933, 1936, 1937 and 1938 and diffed the Golden Gate corner of each frame:

    1933 -> 1936:  bbox (96, 0, 350, 260)   changed px    204   (the Presidio, noise)
    1936 -> 1937:  bbox (118, 0, 165, 174)  changed px  3,416   <- the bridge
    1937 -> 1938:  bbox None                changed px      0

`out/m1gg6-strip.png` is the four frames side by side and you can see it land.
The deck is `base/places.json`'s `ggb` ring — **DataSF 97yj-54sx, Article 10
landmark no. 222, corroborated by US Census TIGERweb `Golden Gate Brg`** — drawn
by `landmarks.ts` §`drawBridge` with its towers, cables and suspenders, gated at
`GGB.year = 1937`: *the year the bridge was completed (19 April) and opened
(27 May)*. The corpus says the same thing twice in the city's own voice —
`golden-gate-bridge.json` beat 4 (Mayor's message, 7 Jan 1935,
`journalofproceed30sanfrich` leaf 50, *"The Marin tower … has been completed —
height 746 feet"*, completion set for May 1937) and beat 5 (8 Jan 1936,
`journalofproceed31sanfrich` leaf 47, *"will open to traffic by May 1, 1937 … It
was begun in December, 1932"*).

So the film ran the year straight past the Golden Gate Bridge at 1.7 years a
second with the camera pointed at the Sunset, and never said a word. That is
exactly *"it never shows when construction on Golden Gate starts, when it
opens"*, and the answer was already in the frame.

**Shot 7 now carries it.** The breath keeps its first 3.6 s on 1935 with the
water line and the `NOT ON THE MAP` badge — spoken over the year the record gives
it, instead of over 1945 — and then the year runs two more years on the widest
camera in the film and the bridge arrives, held for 2.8 s. The badge comes down
at the same instant the deck goes up, because it is now driven off the entity the
**current line** cites rather than off the shot's id: shot 7 has two subjects and
one of them is emphatically on the map.

    shot id                    t0      t1  yFrom    yTo
       1 burn                   0   11400   1906   1906
       2 rebuild            11400   23400   1906   1911
       3 civic-bonds        23400   31900   1912   1912
       4 city-hall          31900   44900   1912   1917
       5 tunnel             44900   54000   1917   1918
       6 west-fills         54000   71800   1918   1934
       7 hetch-hetchy       71800   82200   1935   1937
       8 treasure-island    82200   95100   1937   1939
       9 yerba-buena        95100  104000   1939   1966
      10 to-now            104000  134000   1966   2018

    --- BACKWARD STEPS in the year, sample to sample ---
      none

Same harness, same 2,681 samples. `out/m1s7-t-76000.png` (1935, the water, its
own leaf 44) and `out/m1s7-t-81500.png` (1937, the bridge, its own leaf 11).

**The one line the payload does not carry.** Holding four seconds on a bridge
while the plate talks about a water tunnel would be worse than silence, so shot 7
gets a second line — `film.ts` §`SPOKEN`, the only line in the film that does not
come through `build_film.py`'s gate, because `camera.json` and
`build_film_payload.py` are another block's files tonight. It is not written: it
is `entries/golden-gate-bridge.json` **beat 6**'s own `headline` and its own
`source`, dated **1937-01-04**, which is the year on screen when it appears —

> **Four months before it opens, the city learns the road to the bridge is its own
> bill: a third of $1,650,000.**
> `journalofproceed32sanfrich` leaf 11

and `.parity/m1cite.py` holds it to the same standard the gate would, byte for
byte, against that file:

    film.ts §SPOKEN
      copy   Four months before it opens, the city learns the road to the bridge
             is its own bill: a third of $1,650,000.
      cite   journalofproceed32sanfrich leaf 11  entity golden-gate-bridge
    MATCHED beat  year 1937  date 1937-01-04  type funded
      item  OK   leaf  OK   url  OK
    every line in film.ts traces to the record

`pickLine` prefers the payload's `build2` line over `SPOKEN` unconditionally, so
migrating it is a payload change with **no** change in `film.ts`: add
`build2.copy` and `build2.cite` to shot 7 and delete the `SPOKEN` entry.

### 11.4 What this cost, stated rather than hidden

- **The Bay Bridge deck now strikes out at map-year 1937**, one year after the
  crossing opened, because shot 8 opens where shot 7 leaves the clock. It is a
  film `build` and not a year gate — `skipBridgeGhost` keeps the base layer's
  2025 alignment off the frame until the act finishes — and its citation is the
  Mayor's own January 1936 message, on screen and dated. The film already shows
  copy older than its map year in shots 5 and 6 (a 1914 quote over a 1935 frame),
  so this is that contract and not a new one. It is still the thing in this block
  most worth a payload pass: shot 8's first act was a `run` and is now a `hold`,
  and it wants to be a `run` to 1938 or a re-pointed shot.
- **The Golden Gate is small and near the top edge** at shot 7's `z` 1.10, which
  is `target: null` — the fitCity centre, chosen when the shot was a whole-city
  breath with no subject in it. It now has a subject and the framing has not
  caught up. That is `camera.json`'s `target` and `offset`, not `film.ts`.
- **A run never displays its own target year.** `Math.floor` of
  `yFrom + (yTo−yFrom)·u` reaches `yTo` only at `u = 1`, so shot 6's run to 1935
  shows 1934 for its last 940 ms and 1935 for 0 ms; the following move holds 1935
  for 2,400 ms, so nothing is lost on screen, but the table above reads `1918 →
  1934` for a run whose target is 1935 and that is why.

### 11.5 Found on the way and NOT this block's to fix

- **The `Golden Gate Bridge` place label is drawn from at least 1933, over open
  water, with no bridge under it.** `out/m1gg6-strip.png`, panels 1 and 2: the
  name and its diamond are on the frame at 1933 and 1936 and the deck is not.
  The deck's own year gate is `GGB.year = 1937` and `base/places.json` carries
  `ggbYr: 1937` beside the ring, so the year exists and the label is not reading
  it. That is `labels.ts` / `scene.ts` / the marks encoder, and it is the same
  class of defect as `marks.json`'s 244-places-dated-1906 (§7.3).

## 12 · Block M1 — the moments, each checked against what the map can draw

> *"Film to be relevant key moments (it never shows when construction on Golden
> Gate starts, when it opens)."*

A moment is only a shot if the map can **render its subject at its year**. That
was checked rather than assumed, two ways: what the shipped chunks can date at
all, and — for each candidate — how much of the frame actually moves across the
year in question.

**What carries a year in the shipped data, and it is the whole list**
(`manifest.json` §kinds): `bldg.yr`, `hero.yr`, `strt.yr`, `strt-line.yr`,
`strt-label.yr`, `tree.yr`, `places.yr`, plus the seven published burn rings and
the Golden Gate deck's own `ggbYr`. **`parks`, `water`, `coast`, `surround`,
`massing`, `face`, `form` and `canopy` carry no year at all.** Nothing that is
not on that list can be a shot, whatever the record says about it.

**And what the frame does across a year** — `.parity/m1year.py`, which drives
`__cityRenderer.setYear` at the explorer's own whole-city camera, waits for the
raster count to advance (a screenshot taken before it lands shows the previous
year, which cost two byte-identical stills earlier tonight) and diffs
consecutive years. Only adjacent pairs are meaningful:

| across | moved | of frame |
|---|---:|---:|
| 1914 → 1915 · the Exposition year | 15,575 px | 0.390 % |
| 1915 → 1916 | 5,253 | 0.131 % |
| 1935 → 1936 · the Bay Bridge opens | 1,599 | 0.040 % |
| **1936 → 1937 · the Golden Gate opens** | **5,007** | **0.125 %** |
| 1937 → 1938 | 1,964 | 0.049 % |
| 1971 → 1972 · BART opens | 1,474 | 0.037 % |
| 1972 → 1973 | 3,213 | 0.080 % |
| 1990 → 1991 · the Embarcadero Freeway comes down | 1,218 | 0.030 % |
| 1991 → 1992 | 5,388 | 0.135 % |

### The verdicts

| moment | the record | can the map show it | |
|---|---|---|---|
| the 1906 fire | 18 April 1906, seven published rings, DataSF `ff3a-iqhv` | **yes** — the hairline, and the fabric inside it is empty because the roll dates what is standing | shot 1 |
| the rebuild wave | 1906 → 1912 | **yes** — 63 acceptances and the roll | shot 2 |
| the civic bonds | 1912, 45,129 to 4,036 | **yes** — precision ring | shot 3 |
| City Hall, Main Library | 1912 → 1917 | **yes** — two published footprints | shot 4 |
| the Twin Peaks tunnel | 1917 → 1918 | a bore is invisible; **placemark only** | shot 5 |
| the west side fills | 1918 → 1935 | **yes** — 1,223 acceptances, ~40,000 footprints | shot 6 |
| the Hetch Hetchy water | 28 Oct 1934, the Mayor's message of 7 Jan 1935 | **no** — `NOT ON THE MAP` | shot 7a |
| **the Golden Gate Bridge** | **1937**, DataSF `97yj-54sx` landmark 222 + TIGERweb | **yes, measured** — 3,416 px in its own corner at 1936 → 1937, none at 1937 → 1938 | **shot 7b, new** |
| the Bay Bridge | 1936 | **yes** — the west span's deck is in the payload | shot 8 |
| Treasure Island | 1939 | **yes** — ring, made land, roll | shot 8 |
| Yerba Buena / Moscone | 1966 | **yes** — ring | shot 9 |
| **the Panama-Pacific Exposition, 1915** | `ppie.json`, seven beats, 1912–1916 | **NO** | rejected |
| **BART, 1972** | — | **NO** | rejected |
| **the Embarcadero Freeway coming down, 1991** | `embarcadero-freeway-demolition.json`, 1990–96 | **NO** | rejected |

### Why the three rejected ones are rejected, in their own data

- **The Exposition.** `ppie.json`'s own `geometry_source` reads *"NOT IN RECORD —
  the corpus names the district ('Harbor View', 'the Marina') and streets around
  it, never a boundary."* There is no extent to draw. And its one surviving
  structure cannot be dated either: `base/marks.json`, decoded, dates **`Palace
  Of Fine Arts` 1906 and `Exposition Space` 1906** — the `FLAG_NOYEAR` fallback
  §7.3 already flags, now at **326 of 2,192 places dated 1906 and 399 undated**.
  The 0.390 % that moves across 1914 → 1915 is downtown: the change density is a
  single cluster at two thirds of the frame's width, over Rincon and the produce
  district, and it is the roll rebuilding after the fire. The Marina does not
  move. `out/m1y-1915-pair.png`.
- **BART.** There is no BART entity among the corpus's 41, and there is no
  transit geometry with a year in any shipped chunk. **0.037 % of the frame moves
  across 1971 → 1972** — less than the 1972 → 1973 background. A shot on the year
  BART opened would be a still frame with a caption.
- **The Embarcadero Freeway.** The corpus has the entity and the dates. The map
  cannot have the subject: **the fabric is the assessor's roll, which dates what
  is standing today**, so a structure demolished in 1991 was never drawn in any
  year and taking it down changes nothing. **0.030 % across 1990 → 1991.** This
  is the same limit as *"we can never show past buildings that may have been
  destroyed"* in the brief, and it is a data question rather than a film one.

Every one of those three has a real record behind it, and none of them is a shot
until something is published that the map can put on the ground.

## 13 · Block M1 — a published figure that was the wrong unit, and the 2015 pop

### 13.1 `time.ts` published a parcel count as a footprint count

Routed by the data block (`pipeline/scripts/us_sf_city/DATA-TRUTH.md` §1.9) and
fixed here, because `time.ts` is this block's file and `CityScrub`'s caption
prints the **sum of that table straight to a reader**.

It shipped

    { key: "buildings", n: 12594, of: 166166,
      what: "footprints the assessor's roll does not date" }

and **12,594 is not a footprint count.** It is the number of PARCELS carrying the
1900 dump value, out of `ingest.py`'s own comment, sitting on a denominator of
166,166 footprints — two units in one ratio. It had propagated into nine files.

The footprint figures were already measured and already shipped, and nothing in
`src/` read them. `gen/bldg-data.js` now carries `meta.yearFlags` — bit, mask,
count, meaning and draw behaviour per flag:

| flag | bit | n | drawn as |
|---|---:|---:|---|
| `FLAG_BLOCKYEAR` | 3 | 20,571 | arrives once, on a year that is not its own |
| `FLAG_NOYEAR` | 4 | 2,916 | no year gate — drawn in every year |

**23,487 of 166,166 — 14.1 % — arrive on a year that is not their own**, and that
is what the row carries now. The 23,487 is a property of the assessor roll, so
the block-key fix moved 534 buildings between the two flags and did not move the
total.

**Two claims, not one, and the caption was making the stronger one about all of
it.** `us.sf.thecity.scrub.undated` ends *"…carry no date in any published file,
and are drawn in every year"*, which is true of the trees, the streets, the
places and the 2,916 — and **false of the 20,571**, which arrive exactly once, in
the wrong year. So `UndatedCohort` gains `everyYear`, `undatedTotal()` returns
both, and the caption is fed the one its own sentence describes:

| | before | after |
|---|---:|---:|
| the caption's number | 138,368 of 367,614 | **128,690 of 367,614** |
| what `UNDATED` carries for buildings | 12,594 parcels | **23,487 footprints (14.1 %)** |
| of which drawn in every year | — | **2,916** |

**And the numbers are derived, not transcribed.** That is the actual lesson: a
number typed into a source file is a number that will be wrong after the next
pipeline change and nobody will notice — which is this defect twice over, since
the counts above went stale the moment the block-key fix landed. `fromYearFlags`
builds the row from the `meta.yearFlags` shape and reads `everyYear` off each
flag's own `drawnAs` words rather than matching a name, so a renamed flag
changes the number instead of silently keeping the old one. `BLDG_YEAR_FLAGS`
stands in until the encoder re-run puts `yearFlags` in the shipped manifest, and
`.parity/m1flags.py` holds it to `bldg-data.js`:

    FLAG_BLOCKYEAR   OK   time.ts (3, 20571)  payload (3, 20571)
    FLAG_NOYEAR      OK   time.ts (4, 2916)   payload (4, 2916)
    denominator      OK   166166
    total on a borrowed year: 23,487 of 166,166 = 14.1 %

**Withdrawn.** An earlier revision of this section said `FLAG_NOYEAR` reaches the
browser unread. It does not — `scene.ts` honours it in four places, which is why
bit 4 means *no year gate* and those 2,916 already draw in every year, exactly as
`everyYear` claims. What is genuinely unread is `FLAG_BLOCKYEAR`; it is another
block's file and its treatment is a decision for Daniel, so nothing here is
designed around it changing.

### 13.2 Checked against the shots, and one of them is exposed

*"Do not build a shot that depends on a year in that 14 %."* None does — §11.3
established that six of the ten shots are composed against a framing and a line,
three against a decision's own year out of the corpus, and shot 4's two
footprints are hidden from the fabric for the whole shot precisely so the roll's
date cannot reach the frame. But two shots have the defect **on** them:

**Shot 1 opens on 1906, and 2,916 footprints are stamped 1906 by a constant.**
`build_bldg.py:207` — `yr = 1906; flags |= FLAG_NOYEAR`, and bit 4 means no year
gate, so those buildings are in the 1906 frame **and in every other one**. The
shot's whole subject
is a hairline round a burned district with an empty fabric inside it, and the
film's copy says the emptiness is the roll dating what is standing today. Some of
what IS drawn in that frame is there because the pipeline had nothing and wrote
1906 rather than "unknown". Nothing in this block can separate them on the
frame — they carry no date to separate them by — and **the film does not claim
those buildings are 1906 buildings, and it should not be made to.**

**Shot 10 runs 1966 → 2018 and crosses 2015.** Measured, `.parity/m1year.py` at
the whole-city camera:

| across | moved | of frame |
|---|---:|---:|
| 2012 → 2013 | 350 px | 0.009 % |
| 2013 → 2014 | 5,151 | 0.129 % |
| **2014 → 2015** | **29,616** | **0.741 %** |
| 2015 → 2016 | 1,434 | 0.036 % |
| 2016 → 2017 | 104 | 0.003 % |

**Twenty times the year on either side of it**, and the change density is a single
cell of a 16 × 10 grid, over Hunters Point. `out/m1by-2015-pair.png` is the pair:
an empty peninsula at 2014, and at 2015 about eight large industrial hulls at
once. That is Daniel's *"there's zero buildings then in 2014 so many appear all
at once"*, measured at whole-city zoom, and it is the largest single-year change
anywhere in the film's last fifty years.

Shot 10's run is 18,000 ms over 52 years — 2.9 years a second — so 2015 gets
about **345 ms**, and 0.741 % of the frame appearing in a third of a second reads
as a flicker rather than as history. The film is not composed against it and
nothing here should paper over it: the root cause is a block key that pools four
real assessor blocks and it is being fixed in the data block. **Recorded so that
whoever re-times shot 10 knows what is in it.**

**And these frames are the OLD data.** The block key is fixed in the pipeline and
the encoder re-run that puts it on screen is queued, so the 0.741 % above is what
the running page still does and not what it will do. Nothing in this block is
timed against it, and it wants re-measuring — `python3 .parity/m1year.py m1by
2013 2014 2015 2016` — once the re-run lands.

## 14 · Block M1 — the motion, and the thing that was switched off

> *"Mind-blowing motion design (even if prerecorded)."* · *"The camera moves and
> the year advances; what is missing is the sense that something is happening —
> a build wave sweeping a district rather than buildings blinking on, a hold on
> the moment that matters, a cut that lands."*

The hold and the cut are §11.3: the Golden Gate lands at 1937 and the film stops
on it for 2.8 s. This section is the wave, and the wave turned out not to be a
thing that needed designing. **It already existed and it was being switched off
on every playthrough, by a verdict taken in the first seventeen seconds.**

### 14.1 The film decided it could not play itself, from the wrong seconds

`spare` — the version a machine that cannot draw the travels plays instead — cuts
the camera and lands the years whole, which is to say **it turns the arrival wave
off and makes buildings blink on**. It latches once, one way, and B3 gated it on
`KEEP_UP_MIN_MS = 20,000` ms of wall clock, reasoning that *"the first camera
move is at 23,400, so 20,000 leaves the tail of shot 2's run as evidence and
still decides before the first travel."*

Both halves of that are the mistake. The tail of shot 2's run **is** the startup
cost — the same paragraph says so — and deciding before the first travel means
deciding without one frame of the thing being judged.

`.parity/m1keep.py`, a real playthrough, nothing seeked, nothing paused:

    wall   film  keepUp  spare  rasters  seg
    11.6   10.7   1.000  false      20   shot 1 hold      <- the locked camera
    12.4   11.4   1.000  false      21   shot 2 run       <- the first cohort
    14.6   13.1   0.748  false      27
    16.0   13.9   0.562  false      35
    16.9   14.4   0.612   TRUE      39   <- LATCHED
    17.3   14.8   0.752   true      39
    18.9   16.4   0.922   true      40

Twelve seconds at 1.000, then **1.4 seconds** of the first year cohort warming
caches — seventeen rasterisations in four — and the film threw away all eight
travels and the whole arrival wave for the remaining 117 seconds. Median `keepUp`
past 20 s on the same run: **0.907**. The machine could play the film and was not
being asked to. Note the two rows after the latch: `keepUp` climbs to 0.92 *because*
`spare` is on, so the film can never see its own mistake.

**The gate is no longer a stopwatch.** Nothing is decided until the camera has
actually tried to travel (`firstMoveT0`, the film's own first `move` segment) and
`KEEP_UP_SUSTAIN_MS` is 1,800 — the length of the shortest move in the film — so
a travel decides and a hiccup inside one does not.

### 14.2 One verdict was two, and they do not fail together

A mid-move rasterisation is the ground being repainted under a moving camera; a
run's is the fabric changing under a fixed one, hitting the ground plate every
time. `spare` named both costs and then threw away both on one number.

Judged apart — `spareCamera`, `spareWave`, each averaged only over its own
segments — this machine says plainly which is which:

    spare camera : LATCHED at film 23,886 ms, shot 3 (move)      <- the first travel
    spare wave   : LATCHED at film 47,756 ms, shot 5 (run)

A cut camera with a running year is not an invention: it is the shape
`camera.json` §reduced_motion argues for — *"a year going from 1924 to 1925 while
the camera is still is not vestibular"* — and it is the half Daniel named.

### 14.3 A year that is shorter than the stagger has no wave in it

`STAGGER_TOTAL = 520` shipped **declared and read by nothing** — the same pattern
as `roofF`/`wallF`, `GGB.suspenderM` and the four uncalled passes. This is what
it means.

The wave is `RISE_WIN` of a year long, so how much of it a reader sees depends on
how long a year lasts, and the film's runs differ by a factor of sixteen:

| shot | years / ms | yr/s | a year lasts | rise window |
|---|---|---:|---:|---:|
| 2 rebuild | 6 / 12,000 | 0.50 | 2,000 ms | 770 ms |
| 5 tunnel | 1 / 1,600 | 0.63 | 1,600 | 616 |
| 8 treasure island | 1 / 1,500 | 0.67 | 1,500 | 578 |
| **6 west-fills** | 17 / 16,000 | **1.06** | **941** | **363** |
| 7 the bridge | 2 / 1,600 | 1.25 | 800 | 308 |
| 10 to-now | 52 / 18,000 | 2.89 | 346 | 133 |
| 4 city-hall | 3 / 900 | 3.33 | 270 | 104 |
| 9 yerba-buena | 27 / 3,400 | **7.94** | **126** | **49** |

At shot 9's rate a year is 126 ms and its rise window is **49 ms — three frames**.
There is no wave there to see, and asking for one costs the same rasterisation
per `YEAR_Q` step as a wave that reads: **71 rasterisations a second.** Measured:
shot 9's run sat at `keepUp` 0.26–0.34 *with the wave already off*, so it is the
year RATE and not the wave that is unaffordable there — and condemning the wave
on those frames threw it away on shot 6, where the same trace measures 0.80–0.93.

So `waveFits`: **a year must last at least `STAGGER_TOTAL` for the depth stagger
to have room.** Above that rate the year lands whole — which is what it already
looked like — at one rasterisation a year instead of nine. And the wave's own
verdict is taken from `s.running` rather than from "this is a run", so the runs
that never had a wave in them cannot condemn the ones that do.

Measured after, same harness: **shot 9's run 0.26–0.34 → 0.974, shot 10's →
0.959.**

### 14.4 The year was being handed out long after anything read it

`renderer.ts` §contentKey quantises the film's year to `YEAR_Q` = 16 steps, so a
run costs sixteen rasterisations a year — §6b measures that at ~2,100
rasterisations and 172 s of wall clock across the film's runs, the single largest
cost in the piece.

Only the first `YEAR_LIVE` of a year is read by anything: the wave is over at
`RISE_WIN` (0.385) and the year's street acceptances are drawn in by
`ST_ENTER_WIN` (0.55). Past that the fabric is byte-identical until the next
integer, and the raw fraction was still going out — moving the content key seven
more times a year and repainting the same frame each time.

The year is now pinned to `iy + 0.999` once its own motion is finished, derived
from `Math.max(RISE_WIN, ST_ENTER_WIN)` rather than typed, so moving either
constant cannot silently start pinning while something is still animating.
**Sixteen rasterisations a year becomes nine and nothing on screen changes** —
`scene.ts`'s `risePhase` reads `iy + 0.999` as `f >= RISE_WIN`, the cohort fully
risen, which is exactly what it computed from the raw fraction at that point.

Measured on shot 2's run, same harness, same film milliseconds: **19 rasterisations
a second of film → 10**, and `keepUp` through that run climbed from a floor of
0.305 to 0.99 by the end of it.

### 14.5 The title card was a cut, and the film's first gesture

B3's frame sheet found it and named the cause: *"the title card's wash is a step,
not a fade. `CURVE.fade` exists and this is not using it."* The card is mounted by
`card ? … : null` and carried `transition: opacity 420ms`, which never runs —
**an element removed from the DOM does not transition out.**

A CSS transition could not have been right anyway: it runs on wall time, so a
scrub into the middle of the wash would land on whatever the browser happened to
be doing rather than on the frame playback produces. `FilmState.cardAlpha` is a
lookup like everything else in this file — the title washes out over its last
`CARD_WASH` = 700 ms and the end card washes in over its first, both on
`CURVE.fade`.

Measured, mean luminance of the whole frame across the wash
(`out/m1card-strip.png`):

    t = 2,000   234.3      the card, over a ghost of the city
    t = 2,500   216.2
    t = 2,800   197.3
    t = 2,980   191.9      the 1906 frame, the words gone

Kept under `reduced` and under `spare`. A cross-fade is not vestibular and it
costs no rasterisation, because it is one DOM opacity.

### 14.6 Where this leaves the film, honestly

On a machine that can draw the travels, `spareCamera` never latches and the eight
travels play as authored. On this harness — **headless Chromium, CPU raster, the
dev server, four other agents recompiling the tree throughout** — it still latches
on the first travel, because a travel here genuinely costs 0.6–1.2 s a frame.
§6b's fourth open item stands and this block did not settle it: *"whether any of
this is a headless artefact"* is still open, and a GPU-backed browser is a
different measurement.

What DID change on every machine, headless included:

- the verdict is taken on frames that are evidence about the thing being judged,
  so a fast laptop is no longer condemned by its own startup;
- the two halves are judged apart, so losing the travels no longer costs the wave;
- the wave runs where there is room for it and stops pretending everywhere else,
  which is better motion **and** 9× cheaper on shots 4, 9 and 10;
- a run costs nine rasterisations a year instead of sixteen, for no visible change;
- the film's first gesture is a wash rather than a cut.

**Still open, and named rather than attempted:** `renderer.ts`'s
`const moving = film ? false : …` (§6b item 2) — a film rasterisation taken
mid-travel paints the ground at settled quality, and B3 measured the motion tier
halving the worst frame. It is one word and it is not this block's word. With it,
`spareCamera` would very likely stop latching here too.

## 15 · Block M1 — should the film be prerecorded? Measured before building

> *"For the film it's quite laggy when you zoom in and out of parts. Isn't it
> better to have each slide and transition be recorded so it's smooth and
> perfect, and then with arrows you just switch frames, but there's zero
> computation?"*

The instinct is right about the symptom and the measurement says it is wrong
about the cause. **The film is no longer spending a travel computing the city.
It is spending it moving pixels — and a prerecorded film moves the same pixels.**

### 15.1 Where a travel's time goes, measured on a travel

Every earlier sweep of the eight moves measured **cuts, not travels**. `spare`
latches on the first move and from then on the camera cuts at the head and the
remaining milliseconds are a still hold, so a harness records a hold and prints
it under a move's name. `c2move.py` printed `spare` on every row precisely so
that would be visible, and it was: `spare=True` on seven of eight rows.

`CityFilm.tsx` §THE DIAL now overrides the verdict in dev builds — the third dial
after `camera.ts` §FDIALS and `film.ts` §FWIN, and for the same stated reason.
With `M1FORCE=live`, `spare=False` asserted on **every** row:

| move | z | median | p95 | worst | frames > 100 ms | rasters | ground rebuilt |
|---|---|---:|---:|---:|---:|---:|---|
| 3 civic-bonds | 2.05 → 3.20 | 25.1 | 482.9 | 775.0 | 32 | 32 | 2 of 40 |
| 4 city-hall | 3.20 → 28.0 | 16.6 | 17.4 | 691.7 | 4 | 4 | 5 of 12 |
| 5 tunnel | 27.98 → 2.60 | 16.7 | 550.0 | 826.1 | 26 | 26 | 14 of 29 |
| **6 west-fills** | **2.60 → 1.90** | **8.3** | **9.3** | **10.4** | **0** | **0** | 3 of 4 |
| 7 hetch-hetchy | 1.90 → 1.10 | 16.6 | 317.0 | 1000.0 | 21 | 21 | 8 of 31 |
| 8 treasure-island | 1.10 → 2.55 | 15.1 | 324.9 | 650.0 | 18 | 18 | 2 of 19 |
| 9 yerba-buena | 2.55 → 3.60 | 16.4 | 400.1 | 417.1 | 12 | 12 | 1 of 21 |
| 10 to-now | 3.60 → 1.10 | 16.6 | 491.7 | 1083.5 | 13 | 13 | 5 of 23 |

Three things fall straight out of that table.

**The count of frames over 100 ms equals the count of rasterisations, on every
row.** Not approximately — exactly, eight times out of eight. So the lag *is* the
rasterisations and there is nothing else slow in a move. Between them the film
draws at 8–25 ms.

**Move 6 costs zero rasterisations and its worst frame is 10.4 ms.** A two-second
travel, already perfectly smooth, from live data, today. That is the existence
proof: smooth is reachable without prerecording anything, and what separates move
6 from move 7 is only how many buffers the move needs.

**The pull-outs are the expensive ones and the pushes are cheap.** Move 4 zooms in
8.75× for four rasterisations; move 5 zooms out 10.8× for twenty-six. A blit can
magnify a buffer it already has, and cannot invent area outside it, so zooming out
misses on coverage and re-rasterises. That is a `margin` miss, not a slow scene.

### 15.2 And the ground is no longer the cost — the blit is

A real CDP CPU profile of the move into shot 7, `spare` forced off, 2,400 ms of
wall clock and 3,455 ms of samples:

    1,259.4 ms  36.5%  (program)          — outside JS: raster and composite
      856.4 ms  24.8%  drawImage
      185.6 ms   5.4%  fill
      184.7 ms   5.3%  drawImage
      176.2 ms   5.1%  restore
      122.2 ms   3.5%  drawImage
       18.9 ms   0.5%  paintCell          terrain.ts
       18.1 ms   0.5%  paintFootprints    scene.ts
       17.4 ms   0.5%  paint              scene.ts
      ~130 ms   ~3.8%  jsxDEV             react-jsx-dev-runtime (dev build only)

Against B3's profile of the same class of move **before** the ground plate:

    782 ms  30.8%  fill
    436 ms  17.2%  paintCell   terrain.ts
    262 ms  10.3%  restore
     30 ms   1.2%  paintFootprints

**`paintCell` went from 436 ms and 17.2 % to 32 ms and 0.9 %.** The ground plate
did exactly what it was built to do, and it is confirmed independently by the
table above: 1 of 21, 2 of 19, 2 of 40 ground rebuilds on the moves that hit.

What replaced it is **`drawImage`, about 1,175 ms across four entries — 34 % —
plus 36.5 % `(program)`**, which is raster and composite outside JS. Computing
the city is now `paintCell` + `paintFootprints` + `paint` = **68 ms of 3,455, two
per cent.**

### 15.3 The three designs, costed

**A · Prerecord to frames or video.** *Runtime cost: not zero.* This is the
finding that matters. The bottleneck measured above is not computation, it is
pushing a full-viewport image at DPR 2 — 2,880 × 1,880 — to the screen every
frame. **A decoded video frame is the same pixels through the same path.** On this
harness (headless Chromium, CPU raster, no GPU) it would buy the 2 % that is scene
computation and pay the same 70 % that is pixel throughput; on a GPU-backed
browser both are nearly free, which is where the lag Daniel is seeing mostly comes
from in the first place. And it costs: the year rail cannot drive it, a reader
cannot stop and open a block, the copy cannot be translated without a re-render,
one aspect ratio ships, and **every data fix landed tonight silently stops
applying to the film** — the 23,487 borrowed years, the Hunters Point block key —
until someone remembers to re-bake. A film that is a picture of the record as of
the day it was baked is not this project's claim.

**B · Prerender at load into offscreen canvases.** *Not viable at quality, and the
arithmetic is not close.* Eight moves at 60 fps is ~960 frames; at 2,880 × 1,880 ×
4 bytes that is **20.8 GB**. At DPR 1 and 15 fps it is 162 MB and 240 full
rasterisations to produce — at the ~0.5 s each measured above, **two minutes of
load-time hitch** before the reader sees anything. Reduced to only the frames a
move actually needs, it becomes 4–32 buffers per move, which is what the blit
already does.

**C · Keep it live and remove the cost.** *Recommended*, on the strength of move 6:
a travel that needs no rasterisation is already perfect from live data. The work is
to make more moves look like move 6, and the measurement names where:

1. **`renderer.ts` — `const moving = film ? false : …`.** A film rasterisation
   taken mid-travel paints the ground at settled quality. B3 measured the motion
   tier halving the worst frame (875 → 342, 1,075 → 492, 775 → 500). One word,
   another block's file, still unattempted. This is the largest single item.
2. **More margin when the camera is pulling out.** §15.1: the expensive moves are
   the pull-outs and they are expensive because the buffer does not cover the new
   area. The film knows its whole trajectory in advance — that is `planFilmBuffer`'s
   premise — so a pull-out can be given an asymmetric margin that a gesture could
   not, because a finger's next position is a guess and a film's is known.
3. **`setState` every frame.** `CityFilm`'s frame loop calls `setState(s)` on all
   sixty frames a second; the profile shows ~130 ms of `jsxDEV` inside a 2.4 s
   move. `CityScrub` already follows the page's own rule — *"React state is touched
   only when the INTEGER year changes"* — and the film does not follow it. The
   hairline is the only thing that genuinely changes every frame and it is one
   node's width. This one is in this block's file and is the cheapest of the three.

**The honest hybrid, and why it is not what it sounds like.** "Live map,
prerecorded transitions" is attractive and the memory arithmetic kills the full
version: even one buffer is 21.7 MB at DPR 2, so holding a move's 21 buffers is
456 MB. What *does* work is the same idea one buffer deep — **rasterise the first
buffer of the next move during the hold before it**, where the machine is idle at
120 fps. That removes the first and usually worst freeze of every move for the cost
of one slot, and it keeps every property of the live map. It belongs with item 2.

**Caveat, stated rather than buried.** All of this is headless Chromium with CPU
raster on the dev server, with four agents recompiling the tree throughout. On a
GPU-backed browser `drawImage` is close to free and so is video decode, so the
*absolute* numbers overstate the blit. The *ranking* survives and is what the
decision rests on: if computing the city is 2 % of a travel here, it is no more
than that anywhere, and the case for prerecording rests on it being most of it.

## 16 · Block M1 — the three horizons, traced and measured

> *"Why is 'years covered' to 2013, film to 2018, but timeline all the way to
> 2025? It should all be aligned, ideally to 2025."*

They disagree because **they are three different sources**, and the credibility
problem is real but it is not that 2025 is wrong. It is that the page states
three horizons without saying they are about different things. Traced, and each
one measured rather than assumed:

### 1906–2013 · "years covered" — the DECISION corpus, and it is a seven-block tail

`app/us/city/sf/the-city/page.tsx:112`, `span: \`${first}–${last}\``, the min and
max of `blocks/block-index.json`'s `y0`/`y1` — the years of the **76,419
decisions placed on a block**, nothing to do with the buildings. It feeds
`us.sf.thecity.note.record` ("read from {volumes} scanned volumes … {span}") and
the record line on the map.

Measured over that file: 4,679 of 5,404 blocks carry a decision year, and the
distribution ends like this —

    1995: 171 blocks    1998: 226
    1996: 237           1999: 354      <- the corpus's own last full year
    1997: 176           2002:  21
                        2010:  42
                        2013:   7      <- annualreportdep2013sanf_0

**Seventy of 4,679 blocks have anything after 1999, and seven reach 2013.** So
"1906–2013" is a true min–max and a misleading summary: it reads as coverage to
2013 over a corpus that effectively stops in 1999. This is the one of the three
that is actually wrong to a reader, and it is wrong in the *opposite* direction
from the one Daniel suspected — it claims more recency than the record has, not
less. **It is `page.tsx`'s line and not this block's file.**

### 1906–2018 · the film — the last year in its own entity corpus

Shot 10's `to-now` run target. 2018 is the last year in `gen/decisions-data.js`,
the film's 41 entities: `embarcadero-seawall` 2014–2018, `sfo-capital-plan-bonds`
2000–2018, `central-subway`, `mission-bay`, `earthquake-safety` and
`sewer-system-improvement` all `y1: 2018`. The film ends where the corpus it is
made of ends, which is the right rule, and the end card says so —
*"every date on it comes from the assessor's roll."*

### 1906–2025 · the rail — the assessor roll's own year, and it is honest

`time.ts` §SCRUB_MAX, *"the secured assessor roll's own year, 2025 — the file the
fabric's dates come from."* Checked against the roll rather than taken on trust:
`bldg/cache/roll-*.json`, 200,864 parcels carrying a `year_property_built` —

    2019:   407    2022:  652
    2020: 1,228    2023:  208
    2021:   693    2024:   18     2025: 36

**4,089 parcels are dated 2018 or later and the roll's own maximum is 2025.** The
rail is not running over a dead decade; buildings really do arrive across it. It
should stay at 2025 and it is the one number here that needed no change.

### What that means, and what it does not

They should NOT all be set to 2025. Two of the three are already the honest end
of the thing they describe, and the third is honest arithmetic over the wrong
summary statistic. What the page is missing is not alignment, it is **a sentence
that says which horizon belongs to which source** — the rail is the buildings,
the film is the decisions the film is made of, and the record line is the minute
books, which thin out sharply after 1999.

**Recommended, and none of it is this block's file:**

1. `page.tsx` should not publish `max(y1)` as a span. Either state the corpus's
   own last full year (**1999**) or keep 2013 and say what is after 1999 — 70
   blocks of 4,679 — the way `time.ts` §UNDATED states the undated cohorts.
2. The rail already has the seam for the second half of that: `CityScrub`'s
   caption carries one caveat per year, and *"the last acceptance in the volumes
   read so far lands in 1947"* is exactly this shape. A decisions caveat past
   1999 would be the same sentence for a different series.
3. Coordinate with the data block before changing any of it — it has measured
   the corpus (59 Journal volumes 1906–1998, 33,017 items 1948–1999) and those
   figures should be the ones that reach the page, read from a file rather than
   transcribed. §13.1 is what happens otherwise.

**One measurement I could not close, and it is flagged rather than claimed.**
`.parity/m1year.py` at the whole-city camera reports **88–96 px of change per
year across 2019 → 2024**, all of it inside a 22 × 4 px strip that is the scrub
handle — i.e. the drawn city not moving at all — which contradicts the 3,206
parcels the roll dates in those years. One of the two is wrong and I did not
settle which: the harness's own boot was disturbed by the second entry button
landing mid-session (`.last` began selecting the method link), and two rows of
that sweep are 85–92 % frame changes that are plainly layout and not history.
**Re-run it before trusting either number.**

## 17 · Block M1b, 2026-08-24 — the 1955 tree pop, and the rail past the record

Three tasks, in the order they show on screen: the pop a reader hits when they
scrub, the eight decades of rail that looked empty and were not, and the frames
over 100 ms.

### 17.1 The pop: the argument was a contradiction on one frame, not a preference

The ground block had already named this exactly and measured it, so nothing here
re-derives it (DRAW.md §33). `WFLG.undated` is a **boolean**, not a date field.
It was flipped against `TREE_EARLIEST = 1955` and applied to the 125,234
`tkzw-k3nq` rows whose `plantdate` is null, and `time.ts` stated the consequence
in the open: *"1954 has no street trees and 1955 has 125,234."*

| camera | 1954 → 1954 | 1954 → **1955** | 1955 → 1960 |
|---|---:|---:|---:|
| block, Mission | 0.000 | **6.006** | 0.794 |
| block, Sunset | 0.000 | **2.697** | 0.721 |
| street, Civic Center | 0.000 | **3.417** | 1.597 |
| building, downtown | 0.000 | **3.366** | 1.776 |
| district, Mission | 0.000 | 0.463 | 1.278 |

**RE-MEASURED AFTER THE FIX, same harness, same four cameras, same control
pair, `.parity/g2cliff.py`:**

| camera | 1954 → 1954 | 1954 → **1955** | 1955 → 1960 |
|---|---:|---:|---:|
| block, Mission | 0.000 | **0.151** (was 6.006) | 0.836 |
| block, Sunset | 0.000 | **0.374** (was 2.697) | 0.800 |
| street, Civic Center | 0.000 | **0.000** (was 3.417) | 1.594 |

The pop is gone: 1954 → 1955 is now **smaller than** 1955 → 1960 at all three,
which is the opposite of what it was, and at the street camera the two frames
are byte-identical — zero trees changed hands.

**A FALSE ROW, CAUGHT AND WITHDRAWN, and the trap is worth more than the row
was.** This table first carried a fourth line — *district, Mission, 0.463 before
and 0.463 after* — presented as the control that made the other three
trustworthy: street trees are weighted to exactly zero at z = 2.9, so a camera
that cannot draw one should report the same number either side of a tree change.
The reasoning is right and the number was not measured. **The district camera
failed all five of its retries** (`prod not ready`, then `Execution context was
destroyed` — a Fast Refresh from another agent) and `g2cliff.py` writes its PNGs
under fixed names, so the run left the PREVIOUS sweep's files on disk and my
differ read them happily. `ls -la` on the output directory is what caught it:
three cameras stamped 18:21–18:29 and one stamped 17:51, half an hour before the
change went in. "0.463 before and 0.463 after" was the same file twice.

`G2CAMS=<name>` now re-runs one camera, and the trap is written into
`g2cliff.py` beside it.

**And the control that was actually wanted is not a pixel diff at all — it is
`§VPROBE`'s own counter, which the same run printed and I did not read.** The
harness reports how many street trees the pass DREW at each year, and the fix is
visible in that column directly, with no frame arithmetic in the way:

| camera | year | gate | street trees drawn | canopy | blurred ‖Δ‖ |
|---|---:|---|---:|---:|---:|
| block, Sunset | 1954 | **true** | **7,528** | 2,414 | 0.000 control |
| block, Sunset | 1955 | true | **7,528** | 2,414 | 0.374 |
| block, Sunset | 1960 | true | 7,529 | 2,414 | 0.800 |
| street, Civic Center | 1954 | **true** | **547** | 30 | 0.000 control |
| street, Civic Center | 1955 | true | **547** | 30 | 0.000 |
| street, Civic Center | 1960 | true | 547 | 30 | 1.594 |

Read the gate column first: it says **`true` at 1954**, which is the whole change
in one word — before, it read `false` there and `true` at 1955. Then the tree
column: **the same number either side of 1955**, 7,528 and 7,528, 547 and 547,
where the old table had 0 → 7,528 and 0 → 547. The residual 0.374 at the Sunset
block is therefore not trees by construction — the tree count did not move — it
is the buildings the roll dates in 1955. At Civic Center even that is zero and the
two frames are byte-identical.

That is a stronger claim than the one I tried to make with a control camera, it
was in the run's own stdout the whole time, and it costs no second sweep.

Four of five zooms showed it. The fifth was not a counter-example: at z = 2.9 `bandW(z,
VZ_T0 = 2.9, …)` weights street trees to exactly zero, so nothing about trees
can move at the district camera in any year.

**What settled it is a single frame, not the size of the step.** At 1954 the
Mission block carries **3,254 canopy blobs and 0 street trees.** Both cohorts are
undated: the canopy because its source is one 2013 aerial and `base/canopy` ships
no year at all, the street trees because 62 % of the register has no `plantdate`.
Same ignorance, opposite treatments, decided in two different files — and
`time.ts`'s own stated rule, at the top of the file it was written in, is that a
thing no source can date is *declared, counted, and drawn in every year.*

So the caption was already right and the gate was wrong.
`us.sf.thecity.scrub.undated` has read *"…carry no date in any published file,
and are drawn in every year"* the whole time, and `undatedTotal().everyYear`
counts those 125,234 trees inside it. Under the old gate the sentence on screen
and the code drawing the frame contradicted each other.

**LANDED: an undated street tree is drawn in every year** — like the canopy, like
an undated street centreline (`streets.ts` §the year gate), like the 2,916
`FLAG_NOYEAR` footprints. Three call sites, one rule:

- `time.ts` §THE UNDATED TREES — the decision, the measurement, the cost, and the
  1957–1968 hole, in the file that took the original decision.
  `undatedTreesVisible()` returns true; `TREE_UNDATED_FROM` is **deleted**,
  because a constant named "undated from" with no gate behind it is the next
  agent's hour.
- `CityScrub.tsx` — the hand-written `WFLG.undated = year === undefined || year
  >= TREE_EARLIEST` in the year effect goes back to one
  `applyUndatedTreeGate(year)`. TIMELINE.md §7's first "found and NOT fixed" is
  closed twice over: the constant it named was corrected, and then the rule it
  was guarding was changed.
- `CityFilm.tsx` — the film drove the same gate **on every frame**, sixty
  mutations a second of a module-level flag, plus a save/restore pair around
  `play`/`exit`. All of it is gone. The film had the same 1955 pop inside shot 9
  and it goes with the rail's.

**THE COST, and it is not hidden: an undated tree now appears in 1906.** The
canopy has always done this. It is a claim about `tkzw-k3nq` — the file does not
know when this tree was planted — and not a claim that the tree was there. A
tree that **carries** a date still keeps it: the 70,076 dated rows are gated on
their own planting year in `trees.ts` and nothing here touched that.

**1955 stays in the file as `TREE_EARLIEST` because it is real.** Traced rather
than assumed: the earliest rows carry permit numbers 11, 12, 14, 15, 16 in date
order from October 1955, so it is the year the street-tree permit register opens,
not a load stamp — and median trunk diameter falls monotonically with plant
decade across 40,000 rows (1950s 11.5 in → 2000s 3.0 in).

**And the file has a twelve-year hole nothing on the page said out loud.** 1955
(10 rows), 1956 (168), then **nothing at all from 1957 to 1968**, resuming 1969
(332). It is now written into `time.ts` §THE UNDATED TREES, because it is exactly
the kind of gap that gets read as a fact about the city.

### 17.2 The rail past the record: unrecorded, not empty

TIMELINE.md §7's second finding was *"the rail is empty over its last 78 years"* —
1948 to 2025 carries no mark, because the street-acceptance sweep ends at 1947,
and only the caption said so. Sixty-five per cent of the rail read as a quiet
century.

Two changes, and both borrow from work that already exists rather than inventing
a second treatment for the same fact:

- **The stretch past `lastSwept` is hatched rather than left bare.** Faint
  diagonal hatching in the bar zone above the line — it touches neither the
  baseline, the filled track nor the handle — carrying the `past_sweep` sentence
  as its title. This is `block-records.ts` §SERIES_LAST_YEAR's own precedent:
  its decade rail draws the decades past the series faint instead of dropping
  them, *"not empty, unrecorded."* Inline styles rather than `fusion.css`,
  because the geometry is a function of `lastSwept`, which comes out of the
  payload, and the stylesheet is another block's file.
- **Past 1999 the caption says whose gap it is**, in the block panel's own
  words: `us.sf.thecity.panel.sum_rail_end`, live in both dictionaries, with
  `SERIES_LAST_YEAR` imported from `block-records.ts` rather than typed a second
  time. The rail and the panel are two views of one corpus and must not disagree
  about where it stops.

**The correction that made this the right shape.** The Board's decisions do not
end in 1999 — the *scanning* does. The record moves to **Legistar, 30,428 Board
matters for 2000–2018**, in the same form the Journal used. What Legistar lacks
is a location, so placing those on blocks needs the same address-extraction pass
the Journal got, which is a project and not a night's work. The rail says
"unrecorded", which is true, rather than "empty", which is not.

**The caveat ladder is now four cases and still one line**, in this order: no
ingested volume for this year → past the Board's scanned series (1999) → past the
street sweep (1947) → the standing undated line. The 1955 tree caveat is **gone
with the rule it described**; those trees fall into the last case, where the
caption had already been counting them. `us.sf.thecity.scrub.trees` is now unused
in both dictionaries.

**PROPOSED KEY, for whoever owns the dictionaries** — not landed, because inventing
a key here is how two wordings for one fact start. Either delete
`us.sf.thecity.scrub.trees` or replace its text with something the new rule can
carry, e.g. *"{dated} of the {of} street trees carry a planting date, the
earliest in {year}; the rest are drawn in every year, like the tree canopy."*
`{dated}` = 70,076, `{of}` = 195,310, `{year}` = 1955 — all three already in
`time.ts` §UNDATED.

### 17.3 A stale figure in a comment, found while re-reading it

`time.ts` §UNDATED's prose said `everyYear` was **128,599** and the difference
from `n` was **20,662**. Neither is the sum of the table three lines below it:
125,234 + 424 + 2,916 + 116 = **128,690**, and 149,261 − 128,690 = **20,571**,
which is exactly `FLAG_BLOCKYEAR`'s count. `undatedTotal()` computes from the
table, so the screen was right and the comment was stale by 91 — the same class
of error as §13.1, one order of magnitude smaller. Recomputed rather than
retyped, and the arithmetic is written next to the number.

### 17.4 The three horizons: what `page.tsx` should say, written out for its owner

§16 measured all three and its verdict stands: they should NOT all be 2025,
because two of the three are already the honest end of the thing they describe.
The one that is wrong to a reader is `page.tsx:112`.

    span: `${first}–${last}`     // min/max of block-index.json y0/y1

`last` is 2013 and it is a seven-block tail: **70 of 4,679 blocks carry anything
after 1999 and seven reach 2013** (`annualreportdep2013sanf_0`). It reads as
coverage to 2013 over a corpus that effectively stops in 1999 — claiming more
recency than the record has. **Recommended, and it is not this block's file:**
publish `SERIES_LAST_YEAR` (1999) as the span's end and say what is past it,
which is now the same sentence the rail and the panel both print
(`us.sf.thecity.panel.sum_rail_end`). Three surfaces, one wording, one constant.
The film's 2018 and the rail's 2025 are each their own corpus's last year and
need no change.

### 17.5 Smoothness: one lever landed, and the largest one is already dead in its own file

§15.3 costed three designs and recommended C, "keep it live and remove the
cost", with three named items. Two of the three do not survive contact.

**Item 1 — `renderer.ts`'s `const moving = film ? false : …` — was already
tried, measured and rejected, in that file's own comment.** It is directly above
the line, it names the ablation it ran, and it prints the numbers:

> *"`buildings.ts`'s two motion rungs … look like the obvious lever on a
> mid-move rasterisation, and they were tried here. **They bought nothing**:
> over the seven camera moves, rAF-counted, the worst frame moved 605–1443 ms
> to 551–1300 ms, which is inside the run-to-run spread. Ablating the film's
> own two passes as well (`?filmoff=accepted,subjects`) moved it no further."*

It then gives the reason, which is the same one §15.2's profile gives from the
other side: the cost of a film rasterisation is not the footprint loop —
`buildings.ts` puts that at ~0.7 µs a building, 60 ms for the whole city — it is
`TerrainField`'s 67,600 nodes and the surround's 56,330 cells, work that scales
with neither the rungs nor the resolution. That is also why `FILM_DPR` only
moves the worst frame 1,036 → 729 ms for a 3.3× cut in pixels.

**So §15.3 item 1 is out of date and should not be handed to the buildings agent
as a one-word fix.** The 875 → 342 halvings it cites are B3's numbers for a
*gesture*, where `moving` also changes the slot and the placement rounding; on
the film path the same switch was measured separately and bought nothing. This
was worth an hour to find and would have been worth several to land and then
discover.

**Item 2 — an asymmetric margin on pull-outs — is the wrong trade for this
demo, and it is my file so the recommendation is mine to make.**
`planFilmBuffer` already unions the EXACT viewports over the window; there is no
margin to widen. The only dial that lengthens a pull-out's window is the
sharpness bound, `cover >= smax / kCap`, where `smax` is the scale at the head of
the window. Relaxing it — taking the bound a sample or two into the window, or
raising `EXT_K_MAX` for pull-outs only — buys rasterisations by **magnifying the
buffer during the move**, i.e. by making the travelling frames softer. Daniel's
first sentence in the brief is that the graphics are not detailed enough. Trading
sharpness for frame rate in the one part of the film that is watched rather than
scrubbed is the wrong direction tonight. Recorded, not taken.

**Item 3 — `setState` on all sixty frames — LANDED, and it is in this file.**
`CityFilm`'s frame loop called `setState(s)` every frame, re-rendering
`FilmChrome` and diffing its whole tree, to move two numbers; §15.2's profile
found ~130 ms of `jsxDEV` inside one 2.4 s move. Only two values in `FilmState`
genuinely change every frame — the progress hairline's width and the title
card's wash — and each is one style on one node. Both are now written straight
onto their node through a ref, exactly as `CityScrub` has always written its
handle, and `setState` fires only when something DISCRETE changes: the line of
copy (compared by identity, because it IS the payload's own object), the card,
the badge, the shot, the segment, `running`, or the **integer** year. This is
`CityMap`'s own rule — *"React state is touched only when the INTEGER year
changes"* — which the rail followed and the film did not.

**AND THE FIRST VERSION OF THIS WAS WRONG IN A WAY WORTH WRITING DOWN.** It kept
`style={{width: state.progress*100+'%'}}` in the JSX *and* wrote the node
imperatively. That is two writers on one property and React wins: a render for
any other reason — the reader pressing pause, a new line of copy arriving —
re-applies `state.progress`, which is now whatever it was at the last DISCRETE
change, seconds earlier. **The hairline would have jumped backwards on every
pause**, which is precisely the class of motion bug this file's own notes say a
single still cannot show. The fix is one writer: the two continuous values are
not in the rendered tree at all, they live in a ref the frame loop writes, and
`FilmChrome` has a `useLayoutEffect` with **no dependency array** that re-applies
them after every render, before paint. Anyone tempted to "simplify" that back
into an inline style is re-introducing the race.

**And the honest hybrid from §15.3 cannot be built from this file.** "Rasterise
the first buffer of the next move during the hold before it" is still the right
idea and it is blocked on a fact in `renderer.ts`: there is **one** film slot.
`wantSlot = film ? "fi" : …` is taken for holds as well as moves, so pre-warming
`fi` with the move's wide buffer would make the *hold* blit from it — and a hold
is where the reader is standing still reading a line of copy. It needs a second
film slot (`fi2`) that the blit does not read from until the move starts, which
is a renderer change and not a film one. Written down here so the next person
does not discover the single slot after building the rest of it.

### 17.6 The open items from M1, each closed or handed on with a reason

**Shot 8's Bay Bridge at map-year 1937 is deliberate and is already argued in
`film.ts`.** The crossing opened November 1936; the deck strikes out at the top
of shot 8, which opens on 1937 because that is where shot 7 leaves the clock.
`film.ts` §treasure-island states the cost in the source — *"one map-year after
the crossing opened … the cost of putting the Golden Gate on camera"*. The only
fix that keeps the year line monotone is to put the Bay Bridge BEFORE the Golden
Gate, i.e. to reorder two authored shots and their cameras, which is not a change
to make the night before a demo. **Left as authored, and it is stated on screen's
own terms rather than silently.**

**The `Golden Gate Bridge` place LABEL is real, and it is now VERIFIED on a
frame rather than reported.** Two crops out of the sweep above, same camera, same
shot, two map years:

| frame | t | map year | what is at the Golden Gate |
|---|---:|---:|---|
| `out-m1/gg-022.png` | 75,439 | **1935** | **"◆ Golden Gate Bridge" over open water. No bridge.** |
| `out-m1/gg-024.png` | 82,297 | **1937** | the same label, with the towers and cables under it |

So the anchor is right and only the YEAR is wrong. `landmarks.ts` §GGB gates the
DECK at 1937 and it is honoured — the 1935 frame draws no bridge, which also
corroborates the predecessor's pixel measurement (1936 → 1937 changes 3,416 px
in that corner, 1937 → 1938 changes none).

**And it is worse than a stray label, because of WHERE it sits in the film.**
Shot 7's whole subject is the Golden Gate arriving in 1937 — three and a half
seconds of hold on the frame it lands on, over the Mayor's own 1935 and 1936
messages. The label tells the reader the bridge is there **two shots early**, so
the film's reveal is of a thing the map has already named. It is the single most
visible editorial defect I saw in the whole replay.

The label comes off `emit_places.py`'s four-rung ladder, which dates a place from
the made-land year of its ground or the first dated building inside its extent —
neither of which is a bridge's completion. **For `labels.ts` / the places
pipeline: a place whose geometry IS a landmark the renderer already dates should
take the landmark's year.** `landmarks.ts` already holds 1937 for this one and
1936 for the Bay Bridge; the ladder should read them rather than re-derive.

**The 2019–2024 "the city does not change" reading was taken at the wrong
camera, and no re-run is needed to say so.** §16 flagged it honestly rather than
claiming it. The roll dates **3,206 parcels** across those six years — 1.9 % of
166,166 footprints, scattered citywide. At the whole-city camera, where that
sweep was run, a footprint is well under a pixel and `.parity/g2cliff.py`'s own
table shows the same thing from the other side: at `city-home` even the arrival
of 125,234 trees moved 0.041. **A whole-city frame cannot resolve 1.9 % of the
fabric and its silence is not evidence.** The measurement to trust is the block
or street camera at 2018 → 2025, and the harness for it already exists
(`g2cliff.py` with `SEQ` changed and `G2CAMS=blk-mission`). Neither number was
wrong; they were about different things.

**The fabricated-year flags are untouched**, as instructed — `FLAG_BLOCKYEAR`'s
20,571 borrowed years are still drawn and still counted separately in
`time.ts` §UNDATED, and revisiting them belongs with building permits.

**`spareCamera` latching on the first travel is still unresolved and this block
did not touch the latch.** `CityFilm` §THE VERSION THE MACHINE CAN PLAY argues
the one-way latch well and its reasoning does not depend on how fast this
particular box is: once `spare` is on the film is cheap and `keepUp` climbs for
that reason alone, so re-examining it is meaningless. What is worth saying for
the demo is the consequence rather than the mechanism: **if it latches, the
camera CUTS instead of travelling for the rest of the run**, which is the
opposite of what Daniel is asking the film for. It is measured on frames the
machine has actually drawn, so on a GPU-backed browser it should not fire — but
that is the one thing to look at on the demo machine, and `window.__cityFilm
.forceSpare = false` is the override if it does.

**The Hunters Point 2014 → 2015 figure in these notes predates the encoder
re-run** and is not re-quoted anywhere in §17.

### 17.7 Watched, and what the sheets show

The rule this project keeps re-learning is that a single still cannot show a
stutter. `m1play.py` could not deliver on this tree tonight — it plays in wall
time and takes an ELEMENT screenshot, and with four agents recompiling, the
execution context is destroyed by a Fast Refresh roughly every two minutes and
Playwright's stability wait times out on a canvas that is being repainted. Three
consecutive runs died. `.parity/m1watch.py` replaces it for this purpose: it
seeks the film's own clock the way `b3seq.py` does, takes a full-page CLIP so
there is no stability wait, and **re-boots one page and carries on at the frame
it was on** instead of restarting a seven-minute sweep.

**31 frames across the first 103 s of the 134 s film** — shots 1 through 9 of 10
— `out-m1/half-sheet.png` and `out-m1/tail-sheet.png`, `forceSpare=false` so the
camera is judged as authored. (An earlier revision of this section said 23 frames
and 62 s: that was the count at the moment I built the first sheet, and the run
went on for eight more frames before the tree was recompiled under it. Corrected
against `ls` rather than memory, which is the same check that caught §17.1.)

- **the year line is monotone over all thirty-one samples** — 1906, 1906, 1910,
  1911, 1912, 1912, 1915, 1917, 1917, 1918, 1919, 1927, 1932, 1934, 1935, 1935,
  1936, 1937, 1937, 1938, 1939, 1939, 1962, 1966 — which is the thing the
  predecessor block fixed and it is still fixed. No sample goes backwards, and
  the sweep now covers the shots where it used to (7 through 9).
- **the chrome survived the `setState` change.** The title card, the copy plate,
  every citation link, the two buttons and the progress hairline are present and
  correct on every frame, including the frames where nothing discrete had changed
  for two seconds. This is what a per-frame `setState` was buying and it was
  buying nothing.
- **shot 4's City Hall block at z = 28 is where the buildings agent's brief
  lives.** Grey prisms, flat caps, one purple hero. It is the frame Daniel means
  by *"the buildings next to it are awful"* and nothing in these files can help
  it.
- **one frame in twenty-three came back nearly blank** — cream ground, correct
  copy plate, no city. It is the frame immediately after a re-boot, so the most
  likely reading is a chunk set that had not landed rather than a render defect,
  and it is recorded rather than claimed. Worth one look on a quiet tree.

The whole-city frames now carry visible green at 1906, which they did not this
morning: that is §17.1 on the frame.

**The two camera moves, eight frames each** — `out-m1/watch-into-5-tunnel-sheet
.png` (shot 4 → 5, z 28 → 2.6, a 10.8× PULL-OUT, the most expensive class of
move in §15.1's table) and `out-m1/watch-into-8-treasure-sheet.png` (shot 7 → 8,
z 1.10 → 2.55, a push-in):

- **both are monotone in scale.** No frame in either shows less of the city than
  the frame before on the pull-out, or more on the push-in. There is no lurch and
  no backtrack.
- **the band crossing does not jump the camera.** The tunnel move crosses step 2
  → step 1 between frames 2 and 3 and the ground goes on being the same ground —
  which is what `renderer.ts`'s `projection.setBand()` at the top of `render()`
  and the band cross-fade are for, and they are working.
- **the copy plate changes on its own beat, not on the camera's**, and it changes
  once inside each move rather than flickering — which is what §17.5's
  `setState` gate does on a frame sheet.
- and the shot-8 sheet is what turned up §17.8.

### 17.8 `skipBridgeGhost` is computed every frame and read by nobody

Frame-sequencing the move into shot 8 is what turned this up, which is the whole
argument for frame-sequencing: it is invisible on a still of the shot itself and
obvious on the frame before it.

`out-m1/watch-into-8-treasure-00.png`, t = 81,800 ms, map year 1937 — **two Bay
Bridges on one frame.** An ochre suspension structure with towers running from
Rincon Hill part-way across, and under and past it a flat grey line continuing
the full width of the bay, past Treasure Island, to the far shore. They do not
even share an alignment for their whole length. `out-m1/bay-00.png` is the crop.

The grey one is the street right-of-way file. `streets.ts` §makeSkip says so in
the open:

> *"The Bay Bridge's own alignment is IN the 2025 right-of-way file, so it is
> drawn across open water in 1906, and shot 8's subject — the bridge arriving in
> 1936 — is a line that firms up rather than a line that appears. Nothing here
> decides anything: the hook exists, `gen/` ships it empty and the explorer never
> sets it."*

`film.ts` answers exactly that, and its answer is wired to nothing:

    grep -rn "skipBridgeGhost" src/
      film.ts:479   the comment explaining it
      film.ts:784   the field on FilmState
      film.ts:1187  the assignment, computed every frame

**Three hits, and all three are the producer.** No consumer anywhere in `src/`.
This is BRIEF.md §8's pattern verbatim — *"four whole passes were written, tested
and called by nobody"* — and it has been paying for a boolean on every frame of
the film since it landed.

**What wiring it needs, and it is not in these files.** Two ends, and each is
owned elsewhere:

1. **the CNNs.** `makeSkip(cnns)` takes the centreline ids to suppress and `gen/`
   ships that list EMPTY. Somebody has to emit the Bay Bridge's own CNNs into it
   — a pipeline pass, `pipeline/scripts/us_sf_city/`.
2. **the call.** `scene.ts` / `streets.ts` must ask the film for the flag on the
   frames it is true, the same way `scene.filmHide` already takes the film's
   hide set. `FilmState.skipBridgeGhost` is already the right shape and already
   on the right clock — the film clock, not the year, *"because the year reaches
   1936 before the build act runs and the ghost would beat the film to its own
   subject."*

Until both land, shot 8 animates a bridge the frame is already showing, which is
the one thing that shot cannot afford. It is not a regression from tonight and it
is not urgent for the demo — but it IS the kind of thing Daniel will see, because
the bridge is the thing he is looking at.

## 18 · Block M1c, 2026-08-25 — twelve moments, checked one at a time

> *"Film is cool but a request owners clear their own lots I don't understand, why is
> there no fire animation on 1906, also 'the bonds carry etc…' so weird this means
> NOTHING has no relevance, 'the board repeals its own promises moves city hall' dude who
> gives a fuck. Like the list keeps going on in the film on inane shit."*

He is right, and §2's own table says why without meaning to: four of the ten lines are a
procedural act — a request, a repeal, a vote count, a ductwork appropriation — chosen
because the corpus holds it, not because a person would want to watch it. The gate in
`film/build_film.py` guarantees a line is TRUE. It does not make it WORTH SAYING, and the
two were being confused.

This block replaces the shot list with twelve moments and builds the fire. **Every line
below is checked against the record before it is written, and where the record does not
support the line the LINE changes.** What follows is the checking, in the order it was
done, so that whoever re-times a shot can see what is under it.

### 18.1 The record for 1942, and the line that had to change

The brief's line was *"the Board's business for those streets that spring was leases and
licences."* **It was not.** Every lease and licence item in the 1942–43 Journal that
touches a Japantown street is elsewhere in the city — a fishing concession off Beach
Street, rooms rented from the Western Women's Club at 609 Sutter for the Civilian Defense
Council, a Market Street Railway bus permit. Searched: all 767 items the sweep extracts
from `journalofproceed37sanfrich` and `…37part2sanfrich`, filtered to the ten streets that
bound the district, then to lease/permit/licence language. Nothing.

**What the Journal actually carries for those streets in those months is property, and it
is colder than the line I was given.** Five items, all 1942, all in
`journalofproceed37sanfrich`:

| date | what the Board did | vote |
|---|---|---|
| 24 Feb | renames **Japan Street** to Colin P. Kelly, Jr. Street | adopted 9–0 |
| 23 Mar | Res. 2517 — asks Congress, the Governor, the Chief of Police and the military to *"immediately suppress the dissemination of news by the means of newspapers published in the Japanese language"* | adopted 10–0 |
| 6 Apr | Res. 2542 — reports the two papers at 650 Ellis and 1618 Geary to the **Western Defense Command** | adopted 11–0 |
| **20 Apr** | **"National Housing Agency and Home Owners Loan Corporation Urged to Effectuate Slum Clearance in Japanese Quarter"** — asks Washington to *"take over the loans on the real property affected"* in the district bounded by **ELLIS, CALIFORNIA, GOUGH AND FILLMORE STREETS** | **adopted 8–3** |
| 24 Apr | directs the City Attorney to draft *"legislation providing for the suspension or removal, from the municipal pay-roll, of all Japanese aliens or persons of Japanese ancestry"* | referred to committee |
| 11 May | asks the State Board of Equalization to weigh *"the character of the applicant"* on liquor permits in that same district *"until such time as the rehabilitation of the Japanese Quarter is under way"* | — |

The 20 April resolution is the shot. It is three weeks after the exclusion, it is about
property, the Board's own agenda heading says *slum clearance*, and **its four named
streets are a boundary this map can draw**, which no other 1942 item is. The floor
argument is on the page too: Supervisor Green voted no and had his reason minuted — *"the
action proposed in taking the Japanese quarter for rehabilitation might end in boundless
confusion."*

`journalofproceed37sanfrich`, hOCR leaf 716. **Proposed line, and it is a change from an
approved one, so it is flagged rather than shipped silently:**

> *In 1942 the government removed everyone of Japanese descent from Japantown, and the
> Board's business for those streets that spring was property.*

with the Board's own heading carried as the record beneath it. "Leases and licences" is
half true — the liquor permits are licences — and "property" is what the whole of it is.

### 18.2 The Palace of Fine Arts is in the record, and it is in the record BEFORE the fair opened

`ppie.json`'s own 1916 beat names what the city kept — *"the California building, the
Marina boulevard, and other improvements"* — and does **not** name the Palace, which is
why §12 rejected the Exposition as a shot. Searching the volumes rather than the entries
finds it: `journalofproceed1915sanfrich` hOCR leaf 361, agenda heading **"Preservation of
Palace of Fine Arts at Exposition"**, Supervisor Power, in the Journal approved 8 March
1915 — a fortnight after the fair opened and nine months before it closed:

> *"Whereas, one of the grandest buildings constructed at the Panama-Pacific International
> Exposition is the Palace of Fine Arts, and Whereas, this building is located on
> government land within the boundary of the Presidio Reservation, and Whereas, if this
> building was permitted to remain permanently it would very materially add to the beauty
> of that section of our city and be a lasting monument to the architectural genius
> displayed throughout the construction of the Exposition…"*

Referred to the Public Buildings Committee. The transfer runs on for four more years —
1917 leaf 1743 and 1919 leaf 164 carry the land swap with the War Department and the
Regents. **So the shot is not "the city kept it": it is the city asking, before the fair
had closed, to be allowed to keep it.** That is better than the line and it is the same
fact.

### 18.3 The 1906 schedule is the FIRE DEPARTMENT's own houses, and the line has to say so

`coverage/fire_losses_geo.json`, 36 rows. Counted rather than quoted: **27 destroyed by
fire, 9 damaged by earthquake only**, 35 of 36 geocoded (FIRE.md says 33 — the geocoder
has advanced since it was written and the MD is stale by two), destroyed values summing to
**$355,000** against the report's own stated **$380,000**, with Engine House No. 38's
figure lost at a column break and implied at $25,000.

**And every one of the 36 is a fire-department building** — sixteen engine houses, a truck
house, three chemical houses, two corporation yards, a drill tower, three sets of stables,
an "Extra House". The schedule is titled *"Value of Houses Destroyed by Fire"* and it is
the city enumerating **its own property**, which for this department means the stations
that were supposed to fight the fire. A line that says "thirty-six of the city's own
buildings" is true of the schedule and undersells what the schedule actually is.

### 18.4 The eleven, as shipped, and the five factual corrections inside them

Daniel cut Hetch Hetchy — *"lets not show the water thing not on the map"* — so the
film is **eleven shots, 2 min 08 s**, and the whole shot list is new. `film.json` is
written by a new tracked file, `pipeline/scripts/us_sf_city/build_film_twelve.py`, which
keeps `build_film.py`'s gate verbatim in behaviour: **a line on screen is a beat's own
headline, or a verbatim run of a beat's quote, at the volume and BookReader leaf the shot
cites, or the shot carries a DATA chip and names its published register.**

| | shot | year | z | what moves | line comes from |
|---|---|---:|---:|---|---|
| 1 | burn | 1906 | 2.05 | burn line, then 27 fire losses light | DATA · USGS + the Municipal Report |
| 2 | rebuild | →1915 | 2.05 | **locked. the years run** | Journal vol 1 leaf 25 |
| 3 | palace | 1915 | 20 | placemark on the rotunda | Journal 1915 leaf 352 |
| 4 | bridges | →1937 | 1.10 | Bay Bridge deck strokes; Golden Gate arrives on its own year | Journal vol 31 leaf 46 + vol 32 leaf 11 |
| 5 | japantown | →1942 | 5.5 | four named streets stroke out | Journal vol 37 leaf 713 + leaf 543 |
| 6 | charter | →1945 | 20 | placemark on the Opera House | Journal vol 40 pt 3 leaf 726 |
| 7 | freeways | →1959 | 1.25 | **nothing** | Journal vol 54 leaf 48 |
| 8 | pyramid | →1972 | 24 | the hero rises on its published year | DATA · DataSF 5kya-mfst |
| 9 | embarcadero | →1991 | 3.4 | **nothing** | Journal vol 85 leaf 375 |
| 10 | mission-bay | →2018 | 3.6 | ring, years running | DATA · DataSF + OCII |
| 11 | face | →2019 | 1.10 | out to the whole city | DATA · Ordinance 103-19 |

**FIVE APPROVED LINES FAILED THEIR CHECK AND WERE CHANGED. Each is flagged rather than
quietly reworded** — the wording is Daniel's to settle and these are the record's answer:

| line as approved | what the source says | shipped as |
|---|---|---|
| *"…thirty-six of them the city's own"* | the schedule is the **Fire Department's** own property, and 27 burned — the other 9 the 1906 clerk recorded as shaken and not burned | *"…twenty-seven of them the Fire Department's own"* |
| *"…opened thirteen months apart"* | Bay Bridge **12 Nov 1936** (HAER CA-32), Golden Gate to traffic **28 May 1937** — **six months and sixteen days** | the record's own line carries it; the interval is not stated on screen |
| *"the ten freeways the state had planned"* | the resolution's own words are *"All Freeways Contained in the **Master Plan**"* — the city's plan, not the state's | the Board's own quote, and the shot's title |
| *"a neighbourhood of eleven thousand people"* | DataSF's own figure for the Mission Bay analysis neighborhood is **16,710** (ACS 2019–23) | *"a neighbourhood of 16,710 people"* |
| *"the first city anywhere"* | the sourceable claim is the ACLU's: *"the first city in the **United States**"* — no official source says "in the world" | the ordinance's own operative sentence, and the vote |

And two that passed with a qualifier: Hetch Hetchy's *"a hundred and sixty miles"* is
SFPUC's *"more than 160"* (its precise figure is 167) — moot now that the shot is cut —
and the Transamerica's **forty-six years** is 1972 to Salesforce Tower's **opening**, 8
January 2018; its height was passed in October 2016 and it topped out in April 2017, so
the milestone has to be named. The film says *"until Salesforce Tower opened in 2018"*.

**Verified and unchanged:** three days of fire and 28,000 buildings (USGS); the
Exposition built of *staff* and demolished, the Palace *"the only fair building to remain
in situ"* (California DPR 523 / NRHP 04000659); fifty nations, 26 June 1945, in the
Veterans War Memorial Building's Herbst Theatre, the Charter adopted unanimously the day
before **in the Opera House** — which is the building the shot points at, and the
Journal's own sentence names both; seven of ten freeways, one resolution, one sitting,
**11–0** (Journal vol 54, File 14414-4, Res. 45-59); Ordinance 103-19, File 190110,
finally passed **10–1 on 21 May 2019** (14 May was first reading — the date the world's
press reported and the one I was given).

**One caveat that belongs on the record even though the film does not say it.** Ordinance
**286-19**, effective 20 January 2020, narrowed §19B.2(d) to *"…on City-issued software
or a City-issued product or device"*. The 2019 sentence the film quotes is what was
enacted in 2019; it is not what the code says today.

### 18.5 The fire, built from the schedule and not from an effect

`pipeline/scripts/us_sf_city/build_fire_losses.py` → `film/fire.json`, 5,551 bytes, and
`film-draw.ts` §`drawFireLosses`. **35 of 36 structures placed, 27 of them burned**,
$355,000 read against the report's own stated $380,000.

Two things are read off the record and nothing else is: **where** (the geocoded survey
offset) and **how big** (the mark's radius is the square root of the value the page prints
for that structure, so $35,000 draws larger than $8,000 and the ratio between two marks is
the ratio between two figures a reader can check). The one row whose figure the OCR lost
at a column break draws at the floor radius and **hollow**, because it is the one mark
whose size is not a number off the page.

**It is a table being read and not a front moving.** There is no published ignition time
for any of these structures — `ff3a-iqhv` is one polygon with no time field, and
`coverage/FIRE.md` says so in the open: *"Not a fire that spreads. The fire can arrive; it
cannot advance."* So the rows light in the order the page prints them and the payload's
own `meta.order` says that is what the order is. The flare that peaks and decays into an
ember is an honest global treatment, declared as one: it carries no information and it is
how long the eye needs to catch a 6 px event among twenty-seven of them.

**The nine quake-only rows are in the file and not on the frame.** The shot's subject is
the fire; drawing both fates would need a legend the film has nowhere to put. They are
counted in `counts.quakeOnly` and they are the reason the validation in `meta` is worth
reading: every fire loss falls inside DataSF's burn polygon and every quake-only one falls
outside it, which is the 1906 clerk and a modern GIS agreeing on all 35.

Watched: `out-m1c/watch-fire-sheet.png`, eight frames across the act. The marks accumulate
inside the hairline and nowhere else.

### 18.6 The motion, and the three places it is a decision NOT to move

**Shot 1 and shot 2 are a match cut.** Same target, same z, same offset, and neither
carries a move — so the burned city and the rebuilding city are the same frame with the
year running under it. That is the strongest image available and it is also the cheapest
thing this renderer does: §15.1 measured a travel at four to thirty-two rasterisations and
§15.2 found the cost of one is pushing 2,880 × 1,880 pixels rather than computing the
city. **Shot 10 is the same gesture seventy years later**, which closes the loop.

A slow push in on shot 1 was asked for and is not built, and the reason is measured rather
than taste: it is exactly the class of move — a change of scale with the fabric visible —
that §15.1's table puts at 8–32 rasterisations and 300–1,000 ms worst frames, and it would
have to end on shot 2's frame, which means the match cut survives only if the push is the
thing that is cut away from. Locking it keeps the cut and costs nothing.

**Shot 5 is still once it arrives**, and shots 7 and 9 raise nothing at all. Seven of the
ten freeways have no published alignment — `freeway-revolt-1959.json` says *"NOT IN RECORD
as geometry"* — so ghosting them in would be inventing seven roads in order to show that
they were never built. The Embarcadero Freeway was never drawn in any year, because the
fabric is the assessor's roll and the roll dates what is standing. Both carry the
`NOT ON THIS MAP` badge, which now takes a SET of entities rather than one id.

**Three shots stopped covering their own subject.** The Palace rotunda, the Opera House
and the Transamerica Pyramid were authored as `footprint` builds, which hide the fabric's
drawing for the whole shot and replace it with the film's flat prism — right for City Hall
in the old cut, wrong for three hand-drawn heroes. `out-m1c/watch-charter-sheet.png` and
`watch-pyramid-sheet.png` are the frames that showed a grey box standing where the Pyramid
should be. They are `placemark` builds now: the mark and the name are the film's, the
building is the map's, on its own published year, and **at shot 8 the Pyramid rises
through the frame with its shaft and its spire as the run crosses 1972**.

**`hideFor` now hides only for a `footprint` build.** It hid for any build whose entity
carried a footprint index, which is what put the box over the hero.

**The 1942 boundary needed its own pass, found by looking.** It was drawn first with
`drawBridgeDeck`, whose ink is the settled street layer's own brown — twenty segments of
street-coloured line lying on top of streets, invisible on all eight frames of
`out-m1c/watch-jtown-sheet.png`. `drawOutline` is the film's family ink on a white halo,
which is the grammar the subject ring and dot beside it already use, stroked as one
gesture in the order the segments come.

**Watched end to end, and the year line is monotone over all twenty-four samples**:
1906, 1906, 1906, 1906, 1913, 1914, 1915, 1915, 1936, 1937, 1942, 1942, 1945, 1945, 1959,
1959, 1972, 1973, 1991, 1992, 2018, 2018, 2019, 2019 — `out-m1c/watch-sweep-sheet.png`.
Four transitions frame-sequenced at eight frames each (`palace2`, `jtown2`, `charter2`,
`pyramid2`) plus the two from the first pass into shot 3 and shot 4: **every one is
monotone in scale, no lurch and no backtrack.**

**Measured on the DEV SERVER, not on :3100.** The brief says to judge on the production
build and it is right; :3100 is a `next build` from earlier commits and carries none of
this JavaScript. The payload changes are live there because `public/` is read from disk,
which is worse than useless — an old `film.ts` against a new `film.json` is a state
nothing will ever ship. **:3100 needs rebuilding on these commits before it is judged**,
and the numbers above are correctness (does it draw, is it monotone, does it lurch) rather
than frame timing, which is the half the dev server can still answer.

### 18.7 The archival scan beside the map — designed, costed, NOT built

> *"consider … if the film would look better with like the resolution open,
> highlighted next to the thing happening to illustrate the archival dimension"*

**It is the strongest available proof that this is a record rather than a rendering, and
on eleven shots it becomes furniture.** Put it on **four**, where the DOCUMENT is the
moment rather than the map: **Japantown (5)**, **the Freeway Revolt (7)**, **the
Embarcadero vote (9)**, and **the Palace (3)** as the early one. The fire, the bridges and
Mission Bay do not need it — the map is the evidence there, and a scan beside it would be
competing with the thing it is meant to support.

**Where the images come from, and it is one URL pattern the corpus already knows.**
Every archival beat carries `item` and `leaf`, and BookReader serves the page image at

    https://archive.org/download/<item>/page/n<leaf>.jpg

which is the **same `n` as the `/details/.../page/nN/mode/1up` link already under every
line** — `leafmap.py`'s header says so and calibrated the map against exactly that
endpoint at 24 citations. So the four scans are four fetches of a URL the payload already
holds, and no new pipeline stage is needed to *find* them.

**What it costs, stated rather than guessed.**

- **Bytes.** A Journal page at BookReader's own scale is 200–600 KB of JPEG. Four is
  ~1.5 MB, which is fourteen times `film.json`. They must be fetched **per shot, one shot
  ahead**, not at load — the film's first frame already waits on chunks.
- **Frames.** An `<img>` beside the canvas costs no rasterisation: it is a sibling DOM
  node, it does not touch the content key, and it moves only when the copy plate does.
  This is the one addition in this file that is genuinely free at 60 Hz.
- **The highlight is the expensive part and it is not free.** Marking *the cited line* on
  the page needs a word box, and the hOCR sidecars the corpus already downloads carry one
  per word — but `iasearch.load` reads `_hocr_searchtext` + `_hocr_pageindex`, which give
  character spans and **no coordinates**. The boxes are in `_hocr.html.gz`, which is
  20–100 MB a volume. So a highlight means a new pipeline pass that resolves each of the
  four cited quotes to a pixel rectangle **once, at build time**, and ships four rectangles
  in the payload. That is a day, not an evening, and it is the right shape: the browser
  must never parse hOCR.
- **The honest fallback if that pass is not built:** show the scan un-highlighted, cropped
  to the leaf, with the quote in the plate beside it. A reader who wants the line has the
  link. That is 90 % of the effect for none of the cost.
- **Layout.** The plate lives bottom-left and the subject is offset right on every shot
  that has one, so the scan wants the **left third**, under the plate, portrait, at about
  30 % of frame width. On a phone it cannot coexist with the plate and should be dropped
  rather than shrunk — an illegible scan is worse than no scan.

**One risk worth naming.** Three of the four proposed shots are the ones whose record is
ugly — a slum-clearance resolution, a freeway refusal, a demolition vote. Putting the page
on screen makes the film's argument, and it also means a reader can read the surrounding
column, which on the 1942 page includes a supervisor's explanation of his own no vote.
That is a good thing and it should be a decision taken with eyes open rather than a side
effect of a layout.

### 18.8 Found and NOT fixed

- **`us.sf.thecity.film.entry_meta` says "Ten moments the city wrote down".** The film is
  eleven. `TheCityClient.tsx` no longer reads it — the entry plate now takes the payload's
  own `title.sub`, which `build_film_twelve.py` writes beside the shot list so the two
  cannot drift — but **the key is still in both dictionaries with a wrong number in it**.
  Proposed replacement for its owner: *"Moments the city wrote down, from the fire to
  now."* No count, so it cannot go stale again.
- **`us.sf.thecity.film.not_on_map` reads "Not on this map"** and is now shown for two
  different reasons — a subject with no published geometry, and a structure the roll
  cannot date because it is gone. Both are honest under that wording and neither is
  explained by it.
- **The Legistar public API for `sfgov` stops at the end of 2018.** Confirmed by probing
  it: the highest `MatterId` is 34053, file 181184, introduced 2018-12-04, and a
  `MatterIntroDate` filter for any month of 2019 returns `[]`. The two rows that come back
  for 2019–20 are placeholders (`TMP-014`, `T19-021`). So **the "30,428 matters, 2000–2018"
  figure in §17.2 is the whole of what that endpoint holds** and the modern record past
  2018 has to come from `sfbos.org` and the InSite `View.ashx` documents, which is where
  shot 11's two links point. `pipeline/minutes/cache/legistar/matters_{2019..2025}.json`
  now exist and are near-empty; **delete them before anyone treats them as coverage.**
- **The Japantown frame is the modern Western Addition.** 128,690 of the 367,614 things on
  this map carry no date in any published file and are drawn in every year, so the 1942
  frame carries buildings that post-date the redevelopment the resolution asked for. The
  caption on the rail already states that cohort; the film does not, and on this one shot
  it matters more than on the others.

## 19 · Block M1c, 2026-08-25 — the narration is ours, and the fire burns

Two corrections came back from Daniel between the first cut and this one, and both were
right about something this file had got wrong on its own.

### 19.1 The quotation is never the line, and the first cut had it backwards

> *"'The Auditor files next year's budget and notes that the valuation it rests on burned
> six weeks' — wtf is this quote, i really dont agree"* · *"the quote is so random"* ·
> *"i think youre too much on the quotes in general — like yes you can pull up in some
> cases the pdf with the text highlighted for drama, not always, but the rest is just your
> one sentence commentary, no need for a direct quote"*

The first cut put the RECORD'S OWN WORDS on screen and the approved sentence in the shot's
`title`, which nothing renders. That was a defensible reading of "let the line caption the
record" and it is not what a viewer wants: a nineteenth-century minute-book sentence,
mid-clause, is a puzzle rather than a statement, and the one he quoted back is a beat about
an assessed valuation — which is exactly the class of thing he had already thrown out
twice.

**THE RULE, and it does not bend: the narration is one plain sentence, on every shot, and
an archival quotation is never the text on screen.** Not as the line, not beside it, not
under it. `COPY2` is now empty and says why in the file. The record is still the gate on
the claim — `check_copy` still refuses to write a payload whose shot cites a leaf no beat
in `entries/` sits on — and it is still the link under the line. It is not the words a
reader reads.

A quotation may come back as a PICTURE, on three or four shots where the document is the
moment. That is §18.7 and it stays designed and not built.

### 19.2 The eleven lines, as they are on screen right now

| | line | source under it |
|---|---|---|
| 1 | The fire burned for three days and destroyed some 28,000 buildings. | the Fire Department's own schedule (leaf 8) **and** USGS |
| 2 | The city rebuilt more than it lost within nine years. | Journal vol 1 leaf 8 |
| 3 | San Francisco pulled down the Exposition's palaces when the fair closed and kept the Palace of Fine Arts. | Journal 1915 leaf 352 |
| 4 | The Bay Bridge and the Golden Gate opened six months apart. | Journal vol 31 leaf 46 |
| 5 | In 1942 the government removed everyone of Japanese descent from Japantown, and the Board's business for those streets that spring was property. | Journal vol 37 leaf 713 |
| 6 | Fifty nations signed the United Nations Charter in the city's war memorial. | Journal vol 40 pt 3 leaf 726 |
| 7 | The Board rejected seven of the ten freeways the city had planned for San Francisco. | Journal vol 54 leaf 48 |
| 8 | The Transamerica Pyramid was the tallest building in San Francisco for forty-six years. | DataSF 5kya-mfst |
| 9 | After the earthquake the Board voted to demolish the Embarcadero Freeway instead of repairing it. | Journal vol 85 leaf 374 |
| 10 | The Mission Bay rail yards became a neighbourhood of sixteen thousand people. | DataSF 4qbq-hvtt + OCII |
| 11 | San Francisco was the first city in America to tell its own police they could not use facial recognition. | Ordinance 103-19 + Board minutes |

**Shot 1 is now exactly what was asked and both its numbers are clickable.** Three days and
28,000 buildings are the USGS's own figures for 18–21 April 1906 — *"Buildings Destroyed —
28,000"*, *"The 3-day conflagration"* — fetched and read, not remembered, and the shot
carries that link beside the Municipal Report's leaf. The plate therefore shows two
sources on one shot, which is new and is what a sentence resting on two records needs.

**Four lines still differ from the approved wording and every one is a failed fact check,
never a rewrite.** 4 (thirteen → six months), 7 (the state → the city's master plan), 10
(eleven → sixteen thousand), 11 (anywhere → in America). §18.4 carries what each source
says. **Shot 2's "nine years" is the one claim in the film I have not been able to source
and it is flagged rather than assumed.**

### 19.3 The fire, rebuilt from dots into a fire

> *"You need a real fire thing going on not just red dots"*

Right, and the first pass was a schedule being read rather than a city burning. Three
things are on the frame now and each one is a different kind of thing:

- **THE GROUND** — `drawBurnFill`, the same seven published rings `drawBurnLine` strokes,
  filled. Hot where the sweep is still running and ash where it has passed, out of one
  number, so the ground cannot be burning and finished at once. It arrives along the
  ring's own vertex order, which is the order the Clerk describes the boundary in.
- **THE FIRES** — a flame at each of the 27 placed structures the record says burned: two
  tongues out of phase, a white heart, and smoke. Height is the square root of the value
  the page prints, so the ratio between two flames is the ratio between two figures.
- **WHAT IS LEFT** — one small dark ember per structure, which does not go out. It is what
  the frame KEEPS rather than what it shows, and it is deliberately much smaller than the
  first pass's, which was the "red dots" note.

**The scorch outlives its shot, and that is the match cut's payoff.** `FilmState.scorch` is
the fire's own phase through shot 1 and then follows the burn hairline's fade through shot
2, so the burned ground is still on the frame when the years start running and cools while
the fabric fills back in underneath it. Nothing else in the film crosses a shot boundary.

**Two things were measured and changed rather than guessed.** `FIRE_WIN` was 0.42 and put
two structures alight at 7.6 s of a 9 s act — a travelling band on a field of embers,
measured on `out-m1c/watch-fire2-04.png`. It is 0.74, and the decay is linear in `down`
rather than squared, so fifteen to twenty burn at once through the middle. And the flame
was sized in CANVAS pixels on a DPR-2 stage, which is half the CSS pixels it looked like in
the source: 46 became 156.

**The flicker is `Math.sin` of the act's own phase and a per-row hash, never
`Math.random`.** A random number would break the one property this whole file is built on —
that a scrub lands on exactly the frame playback would have produced.

### 19.4 Still open at this point in the night

- **"nine years" (shot 2) is unsourced.** The film says it; I could not find a primary
  count of buildings standing in 1915 against 28,000 lost. It is the only line in the film
  whose number I cannot click through to.
- **The Japantown frame is the modern Western Addition** (§18.8) and on that shot the gap
  between the year label and the fabric matters more than anywhere else.
- **Measured on the dev server.** :3100 is a `next build` from earlier commits and does not
  carry any of this JavaScript; it needs rebuilding before the film is judged on it.

## 20 · Block M1d, 2026-08-25 — the one unsourced number, sourced

§19.4 left exactly one thing open: *"'nine years' (shot 2) is unsourced. The film says
it; I could not find a primary count of buildings standing in 1915 against 28,000 lost."*
It is sourced now, out of the city's own building permits, and **the line does not change**
— *"The city rebuilt more than it lost within nine years."* Nine is conservative against
what the permits say and the approved wording stands.

### 20.1 There is no cumulative total, and this is what exists instead

No single document states how many buildings San Francisco had put back. What the record
holds is the **Chief Building Inspector's annual report**, printed in the *San Francisco
Municipal Reports* every year, which splits **permits granted** into classes of new
building against alterations and repairs. Subtract the one printed line from the other and
the year's new buildings fall out; add the class rows and the same number falls out again.

**Every row below was read off the page — the scan or the page image, not the OCR — and
every row cross-checks both ways.**

| fiscal year ended | printed total | printed alterations | new buildings | class rows sum | volume |
|---|---:|---:|---:|---:|---|
| 30 Jun 1907 | 9,539 | 2,608 | **6,931** | 42+69+892+5,928 | `sanfranciscomuni56sanfrich` |
| 30 Jun 1908 | 6,327 | 2,002 | **4,325** | 23+24+219+4,059 | `sanfranciscomuni57sanfrich` |
| 30 Jun 1909 | 6,082 | 2,255 | **3,827** | 23+14+311+3,479 | `sanfranciscomuni58sanfrich` |
| 30 Jun 1910 | 5,766 | 2,782 | **2,984** | 20+20+287+2,657 | `sanfranciscomuni59sanfrich` p. 709 |
| 30 Jun 1911 | 5,826 | 3,101 | **2,725** | 17+11+249+2,448 | `sanfranciscomuni60sanfrich` |
| 30 Jun 1912 | 6,166 | 3,371 | **2,795** | 15+15+265+2,500 | `sanfranciscomuni61sanfrich` |
| 30 Jun 1913 | 6,049 | 3,407 | **2,642** | 20+28+272+2,322 | `munisanfrancisco62sanfrich` |
| 30 Jun 1914 | 5,721 | 3,391 | **2,330** | 14+13+204+2,047+44+8 | `munisanfrancisco63sanfrich` p. 367 |
| | | | **28,559** | | |

The loss it is measured against is **USGS's own page**, which gives it as *"Wood buildings
lost = 24,671 · Brick buildings lost = 3,168 · Total buildings lost = 28,188"* — and
labels that total *"By one count"*, which is the honest way to hold it and the reason the
film's own sentence says *some* 28,000 on shot 1.

**26,229 by 30 June 1913 · 28,559 by 30 June 1914.** The crossing is inside the fiscal year
that ends 30 June 1914 — **eight years and two months after April 1906**. Nine is the safe
number and the approved line keeps it.

**Two rows were re-read off the page image rather than trusted to the OCR**, and one of
them had to be: `sanfranciscomuni59sanfrich`'s Building Inspection page is OCR'd to pieces
(*"Additions, Alterations, Repairs—General. '-'782"*), so leaf **n726** was fetched and
read — Class A 20, Class B 20, Class C 287, Frame 2,657, alterations 2,782, total 5,766.
`munisanfrancisco63sanfrich` leaf **n384** was fetched the same way, and it is how the
plate's leaf number is known to be right rather than guessed: it is printed page **367**,
headed BUILDING INSPECTOR, and it is the table above.

### 20.2 The two caveats, and where they are

They are on the plate and they are **not in the sentence**. The narration is our one plain
sentence (§19.1) and a sentence that explains its own arithmetic is an essay:

> 28,559 new-building permits by June 1914, against 28,188 lost. Permits granted are not
> buildings completed, and the eight-year total is a sum of the city's own annual tables
> that none of them states.

- **The cumulative is arithmetic no document states.** Eight printed tables, added.
- **Permits granted are not buildings completed.** Much of the frame construction is in
  the unburned western neighbourhoods rather than the burned district, and FY1914's own
  new-building rows include the **44 Panama-Pacific Exposition buildings**. The 1906–07
  volume's Frame row (5,928) carries the temporary shacks that went up before the law
  stopped them; the FY1912 inspector reports the Board *"passing resolutions containing
  lists of temporary structures within the Fire Limits and ordering their immediate
  demolition"*, so the city itself treated a good part of that first year's count as
  provisional.

**Do not use the "20,000 buildings by 1909" figure.** It is retold everywhere, it is not
primary, and it is an alterations-inclusive permit count read as buildings: the city's own
**new-building** permits total **15,083** by 30 June 1909.

### 20.3 What that needed in the code

- **`FilmLink` gained `k`** — which chip the row wears. The Chief Building Inspector's
  permit tables are a SCAN; labelling them DATA would tell a reader they came out of a
  modern register.
- **`also` became a LIST.** Shot 2's sentence is a COMPARISON and a comparison needs both
  of its sides on the plate at once. It was one optional link, for shot 1's USGS row.
- **`note` is new**, and is the caveat a derived figure carries. It has its own type on
  purpose: it is not narration, it must never be mistaken for the line, and it renders
  smaller and quieter than the copy for the same reason `.fx-film-reach-line` does.
- **The source rows now STACK.** They were `inline-flex` siblings, which is invisible
  while a shot carries one row and wraps into a paragraph the moment a shot carries three.
- The plate's first draft put the whole arithmetic in the chip — *"28,559 new-building
  permits by June 1914 — the city's own building permits, Municipal Reports, Chief
  Building Inspector, p. 367"* — and **on the frame it wrapped to two lines of uppercase
  mono and outweighed the sentence it was supporting**. `out-m1d/at-t22000.png` is that
  frame. The chip is now the shape every other shot's is and the number lives in the note.

### 20.4 The scrim was never as tall as the plate — found by looking at shot 2

Measured on the frame at 1440×900: **the copy line lands at 71.7 % of frame height, and
the old ramp was at alpha .27 there.** TWIN PEAKS and CASTRO/UPPER MARKET were legible
*through* the sentence. It had not been caught because the plate had never been screenshot
— see §20.5 — and because a shot whose copy is one short line sits lower in the frame than
shot 2's, which now carries three source rows and a caveat.

`height:34%` → `48%`, and the stops are placed off the plate's own geometry: **.93 at the
copy line**, with the whole 0 → .9 ramp spread over 52–70 % of frame height. That is
**324 px of falloff at 1800** and therefore still not an edge, which is the property §6's
own note says the horizontal mask exists to protect. Checked on all eleven shots:
`out-m1d/shots-sheet.png`.

### 20.5 Every contact sheet ever taken of this film reviewed the wrong thing

`m1watch.py`, `m1play.py`, `b3seq.py` and everything derived from them freeze the film with
`__cityFilm.pause()`. **`pause()` also raises the paused panel, and the paused panel
REPLACES the copy plate** — `{!card && !paused ? <div className="fx-film-plate"> …`. So
every frame in `out-m1`, `out-m1c` and `out-b5` shows a panel a viewer never sees while the
film is running, and **not one of them has ever shown the plate the film actually shows.**
That is why a scrim two-thirds the height of its own text survived four blocks.

`__cityFilm.still()` stops the clock and leaves the chrome alone. `.parity/m1d.py` is the
harness that uses it: `shots` (one frame per shot, 62 % through each act), `seq a b n`
(a frame sequence across a cut), `at t…` (named frames). Everything it does is read and
seek; it cannot change a date, a framing or a line of copy.

## 21 · Block M1d — the shots, looked at one at a time

NIGHT3 §4, in Daniel's words: *"I want any assets in view during those scenes to be
perfectly rendered with great polygons, vertices, colors, roofs etc — basically you have to
be wowed by the beauty of what's in the shot."*

Eleven frames, shot at `.parity/m1d.py shots` and read one at a time.
`out-m1d/shots-sheet.png`. What follows is what looking found, in the order it was fixed.

### 21.1 The Bay Bridge was painted International Orange

**It is on screen in four of the eleven shots** — 4, 9, 10, 11 — and it is the single most
recognisable colour fact about this city's two bridges. `drawSpan` was written for the
Golden Gate and then generalised to N bridges, and the generalisation carried the STEELWORK
COLOURS with it: `GGB_LEG_TOP`, `GGB_CABLE`, `GGB_BRACE`, `GGB_SUSP_INK`. The Golden Gate
is International Orange, its own published specification; **the west crossing is painted
Bay Bridge Silver**.

Which span is which is READ, not guessed: `base/bridge`'s manifest entry already gives each
one a key — `golden-gate`, `bay-west` — beside the deck height and the year that were
already being read off it. `data.ts` passes `k` through; `landmarks.ts` §BRIDGE_PAINT picks
the palette. **A span with no key keeps the orange**, which is exactly the behaviour every
one-bridge city had before this existed.

### 21.2 `UNNAMED 064` is not a name — 84 of 2,473

`out-m1d/at-t35952.png` had **UNNAMED 64** set in the same face as GEARY BLVD, across the
Presidio, on the film's most beautiful frame. It is DataSF's placeholder for a centreline
with no name, so that every row has a key, and **84 of the 2,473 published names in
`base/street-labels` match `^UNNAMED\b`**. `labels.ts` §isPlaceholderStreetName drops them.

**This was never a film bug.** The explorer has been writing them at every zoom.

### 21.3 The frame was full of names, and two ways of thinning it were wrong

`.parity/m1lab.py` arms `__cityLPROBE` and then lets the film PLAY a second, because the
label layer repaints on a year tick and not on demand. On shot 4, 1936: **29 names, 26 of
them neighbourhoods.**

**A caveat on that instrument, found afterwards and worth more than the number:
`lprobe` is not called anywhere in the street pass.** The 29 are the hood and place lanes
only; the ~14 street names on the same frame were invisible to it. Two conclusions below
were drawn before that was known and are corrected here.

1. **Cap the hood lane at ten.** The frame came back with the same number of labels on it —
   GEARY BLVD, DIVISADERO, GOUGH, FRANKLIN, STANYAN, GUERRERO, 18TH AVE, ALEMANY, SILVER,
   GENEVA. The lanes share a collision grid and each spends to its own ink limit.
2. **Order that cap by published area, then by distance from the frame centre.** Area keeps
   BAYVIEW HUNTERS POINT, LAKESHORE, EXCELSIOR, SUNSET/PARKSIDE — **the largest
   neighbourhoods in San Francisco are its emptiest.** Distance from centre keeps GLEN
   PARK, NOE VALLEY, TWIN PEAKS, because shot 4's camera is the whole-city fit and its
   centre is the middle of the peninsula. Both drop MARINA, PACIFIC HEIGHTS, MISSION and
   FINANCIAL DISTRICT off a shot about downtown.

**The collision grid's own ordering beat every cap I could justify, so the hood lane is
left alone.** What was actually noise on a wide historical frame is the STREET lane —
SILVER AVE, GENEVA AVE, ALEMANY BLVD, 18TH AVE — and that lane already carries a published
priority: `spineOf`, then `labelOrder` on rank and length. `labels.ts` §STREET_NAME_CAP
lets the film stop that lane at six. **Which six is the street table's own order**, so the
film shortens a published list and does not re-rank it. MARKET ST survives, because it is
the spine. `out-m1d/crop-1936.png`.

An ink multiplier was tried before the cap and is not kept: at 0.42 nothing changed and at
0.25 the street lane vanished entirely. The budget is not what binds — the probe's own
reason counts are `grid: 22, year: 2` and **no label on that frame was ever refused for
ink.**

### 21.4 Two cameras were framing empty ground

Neither subject rendered badly. The FRAME was bad, which NIGHT3 says is the same kind of
defect and names the same two fixes.

- **Shot 3, the Palace.** `z` 20 → **58**, `off` (0.14, −0.16) → (0.10, −0.06). At 20 the
  rotunda was a small object in the lower right and **45 % of the frame was empty sky over
  the Presidio flat**. At 58 the colonnade's curve, the lattice dome, the columns and the
  lagoon are the frame. `out-m1d/shots-s03.png`.
- **Shot 4, the two bridges.** `z` 1.10 → **1.26**, `off` (0, 0) → (0.07, 0.03). The widest
  camera in the film was leaving the city in the upper left with a third of the frame empty
  bay, and at 1937 the Golden Gate's deck ran off the top-left corner — a shot called *two
  bridges* with one of them cropped. Both are in frame now and the peninsula fills it.

### 21.5 Still open

- **Shot 5's 1942 boundary is a broken bracket.** Three partial sides in electric blue, and
  the record names four streets. It is the shot's only gesture.
- **Shot 1's fire still reads as brown discs at z = 2.05.** The flames are there and they
  are ~10 px; the flare's disc is what the eye gets.
- The Presidio barracks left of the Palace, and the piers on shot 9, are flat prisms.

### 21.6 The 1942 boundary was a broken bracket, and the cause is two street grids

`out-m1d/shots-s05.png`: three sides in the family ink and no south edge. The shot's only
gesture, and **ELLIS STREET was being clipped away entirely — all twelve of its segments
west of Gough.**

`district_outline` clipped the four named streets to an AXIS-ALIGNED BOUNDING BOX of their
own crossings. **The Western Addition sits on two grids.** Ellis runs on the Market Street
grid, so between Gough and Fillmore it falls **0.0019° of latitude — 210 metres**. The
box's south edge is Ellis's latitude *at Gough*, so every Ellis segment west of Gough lies
below it. Measured: `(-122.424295, 37.783400)` at Gough down to `(-122.441340, 37.781235)`.

The clip is now **the quadrilateral the four streets' own crossings make**, and each
street's segments are kept where both endpoints fall inside it. Three of the four corners
are published crossings. **The fourth is not, and it is the only extrapolated number in
that file:** Ellis's centreline is interrupted between longitude −122.430798 and
−122.434162, which is exactly the block where Fillmore would cross it — the redevelopment
this resolution asked Washington for is what cut it. That corner is the intersection of the
two streets' own published *alignments*, each extended as a line, so it is read off both
and invented from neither.

Two things are declared rather than silent: the ring is pushed **20 m** out from its own
centroid before the point-in-polygon test, because the streets ARE the edges and a
centreline vertex sitting on the boundary is otherwise a coin toss; and the builder now
**exits if any named street clips to nothing**. The box version passed every check this
file had while drawing three sides of four, because nothing asserted that all four were
there. It prints `ELLIS 6 · CALIFORNIA 6 · GOUGH 8 · FILLMORE 8`.

### 21.7 The fire was still red dots, and the cause was one line of blend mode

> *"You need a real fire thing going on not just red dots"*

§19.3 built flames, measured `FIRE_WIN`, sized the tongues in the right pixel space — and
the frame still reads as dots. `out-m1d/crop-fire8.png`, taken at the act's PEAK rather
than at its tail, is why:

**`g.globalCompositeOperation = "lighter"`.** Additive blending is right over a dark frame
and wrong over this one. The ground under the burned district is a pale warm tan, so adding
a yellow-orange gradient to it clips every channel and the flame comes out as a **cream
cone of light with no hue left in it** — twenty-seven pale beams standing over the city,
and a dark red disc at the foot of each. The disc was the only mark on the frame with any
colour in it, so the disc is what the eye got. **The dots were never the fire; they were
what was left after the fire had been bleached out.**

Source-over, with the alphas raised to do the work additive blending had been doing, and
three sizes measured by looking rather than reasoned:

| | was | is | why |
|---|---:|---:|---|
| `FIRE_H_MAX` / `MIN` | 156 / 46 | **96 / 34** | at 156 the cones are a quarter of the frame tall and twenty-seven of them merge into one orange wash |
| tongue width | `s × 0.25` | `s × 0.30` | 4:1 reads as a spike; a flame is nearer 2.5:1 |
| ember radius | `s × 0.075`, α .60 | `s × 0.038`, α .42 | 12 px of the most saturated colour on the frame, at the foot of every structure |

`out-m1d/crop-fire8c.png` and `out-m1d/seq-sheet.png` — eight frames from the burn line
drawing itself through the fire to the scorched ground. It is a burning city and then a
burned one, and the year line is monotone across the cut into shot 2.

## 22 · Block M1d — the year rail, read as a reader

> *"work on reworking the arrow legend timeline"* — and no more than that, so the first
> job was to look at it and say what is wrong. `.parity/m1d2rail.py` opens the EXPLORER
> (every film harness in this directory dismisses the entry plate by starting the film,
> which HIDES the whole transport row, so none of them has ever seen the rail) and shoots
> the row at six years. `out-m1d/rail-sheet.png`.

### 22.1 What is wrong, before changing anything

1. **The caption runs under the chat launcher, on every year of the rail.** Measured at
   1440×900: the launcher is a fixed pill at x 1270–1420, y 836–880; the note's box is
   x 24–1416, y 829–846. **146 px of overlap.** At 1906 the sentence ends *"…carry no date
   in any published fil"*. It is not a wrapping problem and no shorter copy fixes it.
2. **Five visual codes on the rail and no key for any of them**: ochre bars of varying
   height, grey ticks hanging below the line, coloured diamonds, a hatched band, decade
   labels. The only explanation anywhere is a `title` attribute on an **8 px** diamond —
   invisible on touch, undiscoverable on a mouse.
3. **The most useful thing on the rail is the least reachable.** The diamonds are the
   dated moments — the Palace, the Opera House, the Bay Bridge — and their names live in
   that tooltip.
4. *"Next: 1915, Palace of Fine Arts"* **names a year and then leaves the reader to find an
   8 px diamond among a hundred and nineteen years.**
5. Two different unrecorded stories share one hatch: 1947–1999 is *the sweep stopped*,
   2000–2025 is *the Journal ends and the record moves to Legistar*. The caption changes;
   the mark does not.
6. The decade labels change format at 2000 — `1990`, then `’00`.
7. Play is at the far left of the row and the speed buttons are at the far right, about
   1,200 px apart.

### 22.2 What was changed, and what was left

**1, 2, 3 and 4.** 5, 6 and 7 are left: two hatches for two reasons is a real distinction
that needs a mark this rail has no room for, and the transport layout is a different
argument.

**The key is not a legend block.** The sentences under the rail already say what two of the
three marks mean — *"…streets the Board voted to accept are drawn by 1906"* IS the ochre
bars, and *"the last street acceptance … lands in 1947"* IS the hatch. They were simply
never attached to the mark they describe. Each phrase now carries **the mark itself, at the
size the rail draws it**, in front of it. A legend a reader has to carry back to the rail
is a second thing to read; these three phrases were on screen anyway.

**`next` stops being a sentence and becomes the control it was describing.** It carries the
diamond in that moment's own family colour — the same diamond, the same colour, findable on
the rail — and pressing it puts the rail on that year. Walked end to end: 1906 → 1915
Palace of Fine Arts → 1927 Bay Bridge → 1932 War Memorial Opera House → 1942. The rail is
navigable by its own moments now, which is what the diamonds were for.

**No new i18n keys.** `us.sf.thecity.scrub.next` is the same string; the arrow is a glyph.

## 23 · Block M1e, 2026-08-25 — the two named subjects, and what the rings say

Taking over from M1d. NIGHT3 §4 is the standing instruction: *"any assets in
view during those scenes to be perfectly rendered with great polygons,
vertices, colors, roofs etc"*, and §21.5 named two subjects that were not:
**the Presidio barracks beside the Palace, and the piers in shot 9.**

Harnesses written for this block, all reading `__cityFilm` on the film's own
frame: `.parity/n3probe.py` (the building tables under a shot, anchored on a
published place), `.parity/n3hero.py` (every hero's emphasis at that camera),
`.parity/n3abl.py` (one layer off), `.parity/n3ring.py` (project named gids'
rings and PAINT them on the frame), `.parity/n3frame.py` (patch z/ox/oy in the
served payload, shoot, restore — it restores in a `finally`), and
`.parity/n3slender.py`. `n3probe`, `n3hero`, `n3ring`, `n3abl` need
`__cityRenderer`, which `renderer.ts` publishes **in dev builds only**, so
those run at `:3000`; every judgement of a PIXEL is taken at `:3100`.

### 23.1 `derivedBands` DOES reach the Presidio barracks. It is the roof that is flat

The first question NIGHT3 asks is whether the height-derived band count reaches
the federal footprints. **It does.** `out-n3/shots-s03.png` at 2880×1800 has a
row of windows on both Montgomery Street barracks. The probe says why they were
ever refused and why they are not now:

```
  gid 159068  area 8381 m2  nv 28  h 6   u 22  st 0
  gid 159036  area 6478 m2  nv 26  h 5   u 22  st 0
```

`u = 22` is `FLAG_NOYEAR | 6` — **use class 6, `mixed or not stated`, and a
year the roll does not hold** (the fabricated 1906 `build_bldg.py` writes so a
footprint can be drawn at all). `st = 0`, so `storeysOf` gives nothing and
`emitFace` used to return. `derivedBands(Hm, heightStale)` now fires: neither
carries `FLAG_HEIGHT_STALE`, both have a measured height, so both get bands.

What is left is the **roof**, and it is the larger surface: these are long
one-storey sheds seen from above, so the flat plate is three or four times the
wall's area on screen and carries a coping and nothing else. `isPitched` refuses
them, and **that refusal is right**: the population is *pre-1907 single or
multi family, dated*, and these are class 6 with no date. There is no published
roof-shape column anywhere in `pipeline/scripts/us_sf_city/` — `grep -n roof
_bldgsrc.py` returns one comment — so drawing a gable on them would be
inventing. **The fix for shot 3 is therefore the camera, which is the other
half of what NIGHT3 authorises.**

### 23.2 Two causes were named, measured, and REFUTED before being acted on

**Emphasis was not the cause.** The Exhibition Hall is the pale tan mass that
owns a third of the frame, and §"THE LAW ASKS WHETHER THE HONEST DRAWING IS TOO
SMALL" says it is handed `E = 2.76` at block zoom. At shot 3's camera it is
not: `n3hero.py` prints **E = 1.000 for all thirteen heroes** at
`cam.scale = 3.4189`. Nothing in that frame is exaggerated. The hall is 272 m
end to end and at 4.19 px per world metre that is 1,139 px of a 1,440 px frame.
It is that big.

**Slenderness was not a usable cause either.** The idea was that a footprint too
narrow to hold a room should get no derived opening rhythm, on `area/perimeter`
— the same lower bound on the inradius `drawTray` and `drawHip` already use.
Measured over 30,334 loaded footprints, split on whether the roll publishes a
storey count:

```
  a/p          st > 0            st = 0
  0.50-1.00       29  0.12%        29   0.45%
  1.00-1.25      212  0.89%       128   2.00%
  1.25-1.50      290  1.21%       174   2.72%
  1.50-1.75      562  2.35%       158   2.47%
  1.75-2.00    1,365  5.70%       259   4.05%
  2.00-2.50    8,293 34.64%     2,016  31.53%
  2.50-3.00    6,270 26.19%     1,928  30.16%
```

The two Palace colonnades are 536 m² over a ~250 m perimeter — **a/p ≈ 2.1,
the mode of the whole city.** A cut that caught them would take a third of San
Francisco with them. Dropped.

### 23.3 What the ugly thing in shot 3 actually is, with its rings drawn on it

`out-n3/ring-35952-marked.png` projects six gids and paints them on the frame,
because four rounds of inference off a crop had produced four different
answers. It settles it:

| ring | gid | what it is on screen |
|---|---|---|
| red | 159037 | the Exhibition Hall — the tan sweep. Its own hero, `bi` matches |
| blue | 159057 | the rotunda — its own hero, `bi` matches |
| cyan | 159039 | **a grey five-storey block with punched windows** |
| yellow | 159067 | **the other one** |

**The two grey apartment crescents wrapped round the Palace of Fine Arts are the
Palace's own colonnade wings.** 536 m², 40 vertices, 19-20 m tall, `u = 22`,
`st = 0` — so `derivedBands(20) = round(20/4.7) = 4`, and the frame shows four
rows of windows on each. Before the band count existed they were §21.5's flat
prisms; now they are apartment blocks. Neither is a colonnade.

**Nothing in the renderer can tell them apart from a building**, and I checked:
`heroGids` correctly skips the two footprints that DO carry a hero, so this is
not a double draw. The Palace complex is authored as **two heroes out of at
least six published footprints**, and the leftovers get the fabric treatment.
**The real fix is hero authoring** — an `arcade` part on the colonnade's own
published ring, at its own published height, which is what the record supports
and what `drawArcade` already draws for the rotunda's peristyle. That is
`emit_heroes.py` in the mock tree and it is NOT being driven at four in the
morning with a demo today. Handed to the coordinator.

### 23.4 So the camera moved, and the frame is the Palace complex whole

`z 58 -> 95`, `off (0.10, -0.06) -> (0.14, -0.10)`. Five framings were shot and
looked at (`out-n3/frame-s03-*.png`):

- **z 170 and z 240** crop the dome off the top and make the colonnades bigger.
  Worse at both.
- **z 95, off (0.06, -0.02)** resolves the peristyle and the dome lattice but
  crowds the frame.
- **z 78, off (0.10, -0.06)** keeps the whole tan sweep and is the best of the
  wide ones; the barracks are still a co-subject.
- **z 95, off (0.14, -0.10)** is the one. The rotunda's columns, arches and
  lattice dome all resolve, the colonnade sweep is the frame's strongest line,
  the lagoon is in it, and **the barracks are a thin band at the top left
  instead of a third of the frame.**

The year is unchanged, the copy is unchanged, the citation is unchanged. Only
`z`, `ox`, `oy` move, in `build_film_twelve.py`'s `SHOTS`, which is the file
that decides framing; the builder reproduces `film.json` byte for byte, checked
before the edit.

### 23.5 Shot 9 framed 68 % empty, and the piers were the least of it

The other named subject. **The piers are not the shot's problem** — at
`out-n3/shots-s09.png` they read as finger sheds along the Embarcadero, dark
flat prisms with a coping, and they carry the same `u = 22` / `st = 0` /
no-published-roof-shape record the barracks do. What is wrong with shot 9 is
the frame, and it is measurable:

```
  bay/sky   near-white haze   together
  54.1 %        14.0 %          68.1 %      shot 9, as shipped
  45.3 %        16.5 %          61.8 %      shot 11 — the whole peninsula, on purpose
  41.5 %        16.4 %          57.9 %      shot 4 — a shot ABOUT the bay
```

**A waterfront shot was carrying more open water than the two shots that are
about the bay.** The cause is the offset, not the zoom: `oy = -0.06` puts the
shore BELOW the frame centre, so the top half is bay and the far shore — Marin
and the East Bay, which the `surround` layer draws as flat translucent slabs
with hard edges — is the top third of the frame.

`z 3.4 -> 5.5`, `off (0.10, -0.06) -> (0.02, 0.22)`. Lifting the subject above
centre fills the frame with the city the vote was about: the Embarcadero curve
runs corner to corner, the piers are large enough to read as pier sheds, the
Financial District towers have presence and the Bay Bridge anchors the right
edge. **Empty 68.1 % -> 50.7 %.** Three candidates shot and compared, all in
`out-n3/frame-s09-*.png`.

### 23.6 The fire was over by 9.7 s of a 15 s shot, and the cause was a CAMERA curve

Daniel's first note on the whole film was *"you need a real fire thing going
on not just red dots"*. §21.7 fixed the blend mode and the flames are good. But
`m1d.py shots` marks each shot at 62 % and **not one contact sheet of shot 1
has ever had a flame on it**, which was read as "the fire is still too small"
and is not what it means.

`where()` could not tell the two apart, so it now returns the fire act's own
rise. Measured, act phase against the film clock:

```
  t (ms)   4516   5884   7162   8465   9725  11011  12323
  fire     0.000  0.083  0.386  0.707  0.869  0.953  0.992
```

**Three quarters of the act's phase is spent in the first 45 % of its nine
seconds**, and the last four seconds move it 0.87 to 1.00 — a frame of embers,
held. The cause: `{ k: "fire", ms: 9000, curve: "move" }`, and `move` is
`bezier(0.4, 0, 0.2, 1)`, the strongest ease-out in the table. **Every curve in
`CURVE` is a camera curve** — a move has to start and stop, so it is eased at
both ends. Thirty-five structures lighting one after another is not a camera
arriving somewhere.

`CURVE.even` — `x => x` — added, and the fire act reads it. The record
publishes no ignition time for any of the thirty-five, which is why the sweep
is in the order the page prints them (`coverage/FIRE.md`: *"The fire can
arrive; it cannot advance"*); an even sweep is the only one that adds nothing
to that. Re-measured: **0.013 / 0.164 / 0.307 / 0.449 / 0.594 / 0.735 / 0.877**
at the same seven marks.

`FIRE_HOLD = 0.66` beside it: `down` used to fall from `FIRE_PEAK = 0.26` all
the way to the end of a flame's window, so a structure stood under a third of
its height for three quarters of its own life. The plateau runs to 0.66 now.
**The window, the order and the ending are all unchanged** — a flame still ends
its window at 0.22 of its height, so the frame the fire leaves, which is the
frame shot 2 opens on, is the frame it always was.

Together: `out-n3dev/seq-q0*.png`, eight frames across 4.5-13.5 s. The city
burns from about 4.5 s to 11 s — **roughly 6.5 s of fire in a 15 s shot against
2.5 s** — and it is a field of flames through the middle of the act, not two.

### 23.7 The rail caption and the launcher: fixed, and now measured across every year

NIGHT3 asks whether §22's fix landed. **It did**, and it is `padding-right:
168px` on `.fx-city-scrub-note` in `fusion.css`. Verified at `:3100`, not
inferred: `.parity/n3railmax.py` walks the rail from 1906 to 2025 in threes and
measures the caption's own PAINTED right edge — every text node's client rects,
not the box — against the launcher's left edge.

```
  worst painted right edge   1245 px   (1972)
  launcher left edge         1270 px
  note content-box right     1248 px
```

**No year overlaps.** The box's border-box right is still 1416 and that is what
a `getBoundingClientRect` on the element reports, which is what §22.1 measured
and is why it looks unfixed; the 168 px of padding is the reserved lane and the
text wraps inside it. The clearance is real but it is 22 px, so a longer string
in `en.ts` or `fr.ts` will land back under the pill — the number above is the
one to re-run.

### 23.8 `lprobe` was blind to the largest lane, and §21.3's estimate was wrong too

NIGHT3 item 3. `lprobe` was called from the place lane and the hood lane and
**from nowhere in `StreetNames.one`**, so every count ever taken off the
instrument was two lanes of three. It is wired now, with the street pass's own
six gates named in the same table as the shared three — `full`, `cap`, `rank`,
`noname`/`placeholder`, `dupe`, `short`, `apart` — and `frame`, `grid`, `ink`
keeping the shared vocabulary so the three lanes' rows can be counted together.

Re-run on shot 4 at 1936, the same frame §21.3 measured:

```
  written 38  ·  grid 25  ·  year 5  ·  cap 2
  of the 38: 6 street, 29 hood, 3 named place
```

§21.3 said *"29 names, 26 of them neighbourhoods"* and that *"the ~14 street
names on the same frame were invisible to it"*. **The frame carries 38, and the
street lane is 6, not 14** — because `STREET_NAME_CAP.film = 6` was already
stopping it, which the `cap: 2` rows now show directly (the cap fires once in
the spine sub-pass and once in the arterials one). The instrument no longer has
to be corrected after the fact.

## 24 · Block M1f, 2026-08-25 — eleven frames, looked at again, and three cameras that were framing the wrong thing

Taking over from M1e. The queue is NIGHT3 §4 again — *"you have to be wowed by
the beauty of what's in the shot"* — plus the rail caption, an audit of the
curve table, and a verdict.

Everything below is shot at `:3100` (production) unless it says otherwise.
**One thing had to move to `:3000`, and it is worth stating because it cost a
round:** `.parity/n3frame.py` patches `z/ox/oy` in
`public/data/us/sf/city/film/film.json` and reloads. **The production server
does not serve that file from disk** — three framings patched at `:3100` came
back byte-identical (`diff vs first 0.00018`, which is antialiasing) and
`where()` still reported the old `z`. Framing is therefore SCOUTED at `:3000`
and every scouted change is re-shot at `:3100` after a rebuild.

### 24.1 The contact sheet, and what each frame is

`.parity/out-n4/shots-sheet.png`, eleven frames at 62 % of each shot.

| # | year | verdict |
|---|---|---|
| 1 | 1906 | at 62 % the fire is at phase 0.88 and reads as embers. **At 0.43 it is a field of flames** (`at-t8200.png`) and it is good. Not a defect; the contact-sheet mark is in the tail |
| 2 | 1914 | the match cut holds. Good |
| 3 | 1915 | **the two largest objects on the frame are a featureless tan blob and two grey apartment blocks.** See 24.3 |
| 4 | 1936 | ~30 labels; the frame reads as a reference map |
| 5 | 1942 | the ring is closed now, but the subject is 22 % of the frame width and half of it is in the haze |
| 6 | 1945 | **the subject is a small pale block right of centre and the left half is empty park.** See 24.4 |
| 7 | 1959 | the wide city, honest, generic |
| 8 | 1972 | **the film's shot about the tallest building crops the top of the building.** See 24.2 |
| 9 | 1991 | good. §23.5's reframe holds |
| 10 | 2017 | Mission Bay is in the bottom-right corner, in the haze |
| 11 | 2019 | the Golden Gate is two orange masts. See 24.5 |

## 25 · Block M1f — the two defects Daniel sent, and what they measured to

He watched the shipped cut and sent two:

> *"i find myself using the arrows bc the film goes too slow between shots,
> also on the fire when it runs theres this weird grey animation of the fire
> completing its totally strange"*

### 25.1 The grey thing on the fire is the smoke pass, and the numbers say it could never have worked

`film-draw.ts` §drawFireLosses drew, **before the flames**, three radial discs
per structure in `rgba(74,64,58,·)` — a neutral dark grey with no hue in it —
drifting on `Math.sin(… + phase * 5.1)`. That drift is the *animation* he saw.

Printed before naming it, from the code's own arithmetic at `FIRE_H_MAX = 96`
device px:

| | expression | at the largest flame |
|---|---|---:|
| plume centre, above the flame's foot | `s × (1.4 + 3.2 t)`, `t ≤ 0.73` | **355 px** |
| plume radius | `s × (0.5 + 1.5 t)` | **154 px** |
| plumes on the frame | 3 per structure × 27 lit | **81** |

**A plume five times the height of the flame it came from, and eighty-one of
them.** The painted area of the smoke was several times the painted area of the
fire, so the largest moving thing in shot 1 was a hueless grey wash over a pale
warm map. It is the same failure §21.7 diagnosed for the flames under
`lighter`, one pass later and in grey: a mark with no hue on a pale ground
reads as a smudge, and the eye takes the smudge for the subject.

**Removed, not re-tuned.** The section header already declared that the smoke
carries no information; the record publishes no plume, no wind and no ignition
time, so nothing leaves the record with it. `out-n4/` before and after.

Left ALONE in the same pass, deliberately, so the ablation has a control:
`FIRE_H_MAX`, `FIRE_H_MIN`, the tongue width and the ember. Daniel also called
the flames large and abstract; that is a second variable and it is judged on
the frame after the grey is gone, not in the same change.

### 25.2 The pacing: the dead time is the MOVE, and on this machine the camera is not even moving through it

Do not trim uniformly — measure. `.parity/n4spare.py` plays the film for real at
`:3100` and samples `where()` and the shell's own spare flags every 250 ms.
75 s, 300 samples:

```
  seg       n     spareCamera on   keepUp med   copy on
  title    15            0            1.00         0
  build    24           18            0.97        24
  fire     34            0            1.00        34
  hold     80           63            0.90        80
  run      97           28            1.00        97
  move     50           45            0.68         0
```

**Two things in that table decide the whole re-time.**

1. **`copy on 0` for every single `move` sample.** The plate appears when the
   move ends, so `move` milliseconds are milliseconds with no line on screen.
   At 2,400 ms × 9 travels that is **21.6 s of a 130 s film with nothing to
   read** — 17 %.
2. **`spareCamera` is on for 45 of those 50 samples**, and `keepUp` collapses
   to 0.68 there against 1.00 everywhere else. `film.ts` §spare: when the shell
   cannot draw a travel it puts the camera on the incoming frame at the HEAD of
   the move and *"the move's remaining milliseconds are a still hold on it"*.
   So for nine tenths of that 21.6 s the camera **has already arrived and is
   sitting still with no copy on it.** That is not a travel a reader is
   watching. It is a wait, and it is exactly where he reached for the arrow.

So the move is cut first and hardest — 2,400 → **1,200** ms on nine shots, and
1,800 on Japantown. It still reads as cut · beat · line.

**The second cut is the tail of each hold**, on a floor rather than a
percentage: the copy must stay on screen at least as long as the line takes to
read. Measured per line at ~22 characters a second plus 700 ms to notice it —
shot 5's is 143 characters and needs 7.2 s, shot 2's is 53 and needs 3.1.

| # | id | move | ms | → move | → ms | copy visible | line needs |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | burn | 0 | 15000 | 0 | **11200** | 11200 | 3.7 |
| 2 | rebuild | 0 | 12000 | 0 | **5600** | 5600 | 3.1 |
| 3 | palace | 2400 | 9600 | 1200 | **6800** | 5600 | 5.4 |
| 4 | bridges | 2400 | 11800 | 1200 | **8200** | 7000 | 3.4 |
| 5 | japantown | 2400 | 11400 | 1800 | **10800** | 9000 | 7.2 |
| 6 | charter | 2400 | 9600 | 1200 | **6200** | 5000 | 4.1 |
| 7 | freeways | 2400 | 11000 | 1200 | **6400** | 5200 | 4.5 |
| 8 | pyramid | 2400 | 10400 | 1200 | **6600** | 5400 | 4.6 |
| 9 | embarcadero | 2400 | 11000 | 1200 | **6600** | 5400 | 5.1 |
| 10 | mission-bay | 2400 | 12000 | 1200 | **8100** | 6900 | 4.2 |
| 11 | face | 2400 | 9600 | 1200 | **6800** | 5600 | 5.5 |

Title 3,000 → 2,400 and the end tail 4,000 → 3,000.

**2 m 10.4 s → 1 m 28.7 s. 41.7 s out, 32 %.** Every shot clears its own
reading floor with margin, and the two protected shots are protected: shot 1
still burns and still ends on 3.2 s of stillness, and **Japantown is the
longest shot in the film at 10.8 s and is still completely still.**

Two rates were checked rather than assumed. Shot 2's nine years now run at 622
ms a year, still over `STAGGER_TOTAL` (520), so the arrival wave still runs.
Shot 10's twenty-seven years run at 133 ms a year and were already under it at
200, so that re-time changed the rate and not the behaviour.

### 25.3 Two cameras were framing the wrong thing, and one of them cropped its own subject

**Shot 8 — the film's shot about the tallest building in San Francisco cropped
the top of the building.** Fully risen, at the hold. Measured rather than
eyeballed, by fitting the spire's own taper on `out-n4/at-t91500.png`: within
x ∈ [1400, 2200] the tan run widens **0.110 px a row** and is **27 px wide at
row 180**, so the apex sits at row **−65** — sixty-five device px above the top
of the frame. `oy` −0.12 → **−0.30**; `z` untouched. `out-n3/frame-s08-z24_
+0p12_-0p30.png`: the apex is in frame with about 9 % of the frame's height of
air over it, and the thing the line is about is on the screen.

**Shot 6 — the subject was a small pale block right of centre and the left half
of the frame was empty park.** NIGHT3 asks for *"push in on the War Memorial
until its label resolves"*; at `z` 20 it did not — the eye went to City Hall's
gold dome, half off the right edge, which is the wrong building for a line
about the war memorial. Six framings shot (`out-n3/frame-s06-*.png`).
`z` 20 → **44**, `off` (0.14, −0.10) → **(−0.04, −0.16)**. The Opera House
carries its own colonnade, cornice and octagonal roof at centre-left; Van Ness
runs the diagonal; **City Hall's dome is whole in the upper right** rather than
cut, so the shot has a second beautiful object in it that is true. The −0.16 is
what brings the dome down inside the top edge; at −0.02 the finial was cut.

Neither change touches the year, the copy or the citation.
