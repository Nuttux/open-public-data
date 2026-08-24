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
