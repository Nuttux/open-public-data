# Block F2 — what the LIDAR says about roof form, and what it does not

2026-08-22. Owner of `roofs/`. Delivered as a patch. `gen/` untouched —
verified: `grep -c ROOFD gen/part3.html gen/build.py gen/functional.py`
returns 0, 0, 0.

```
bash   roofs/fetch_1st.sh                          -> roofs/cache/rt-*.json
python3 roofs/join.py                              -> roofs/cache/joined.pkl
python3 roofs/build_roofs.py                       -> roofs/roof-data.js
python3 roofs/patches/building_surface.py --check   report, change nothing
python3 roofs/patches/building_surface.py           apply to gen/
python3 roofs/proto.py                             -> roofs/mock-roofs.html
python3 roofs/functional_roofs.py                   the suite, on the prototype
python3 roofs/studies.py <subject>   fps.py   shot.py   street.py   tonelab.py
python3 roofs/imagery.py / blindsheet.py            the ground-truth harness
```

`--check` reports **11 WOULD, 0 NO MATCH** against `gen/` as it stands.
Proven **idempotent** on a throwaway copy of `gen/`: apply → 11 APPLIED, apply
again → 11 ALREADY, `--check` → 11 ALREADY, and a second clean copy patched
once is **byte-identical** to the twice-patched one. Every edit names a
**mark** — a string that exists only after that edit has landed, checked before
the anchor — because four of the eleven replacements contain their own anchor,
which is the bug `blocks/patches/drawer_reads_the_line.py` shipped.

Suite on the prototype: **315 ok / 0 fail / 0 err** — `gen/` as it stands is
310, plus this block's five.

---

# 1 · The brief's premise is wrong, and I can show it three ways

> "San Francisco's residential fabric is pitched roofs. The Sunset and the
> Richmond are tens of thousands of gabled and hipped houses … and every one is
> currently drawn as a flat-topped cube. The roof shape is derivable from
> published data."

It is not derivable, and the roofs are not pitched. **No ridge, gable, hip,
parapet, cornice or bay window is drawn by this block.** Asserted at run time
(F2.4): `drawCity` contains no such geometry and there is no `window.RIDGE`.

## 1.1 `hgt_*` is the wrong grid, and that alone would have sunk it

`ynuv-fyni` publishes nine zonal statistics over each of **three** LIDAR grids.
Block C downloaded the nine over the **height** grid. The height grid is
*height above ground*, so in San Francisco of all cities a **flat** roof over
sloping ground has a large `hgt_std` — the roof is level and the datum under it
falls away. Reading pitch off it would have measured the hill.

The **first-return** grid is absolute elevation and is the instrument that
answers the question. `roofs/fetch_1st.sh` downloads its nine columns plus the
ground grid's, on all 177,023 rows. The three grids agree exactly:

    median( median_1st  −  gnd_median  −  hgt_median )  =  1 cm     (n = 166,166)
                                            p10 −12 cm, p90 +14 cm

so this is a real distinction between two instruments, not two names for one
number. Ground relief under a footprint is `gnd_std` p50 **27.7 cm**, p90
**93.1 cm** — small for the median building and comparable to the whole roof
signal for the steep tenth.

## 1.2 Even on the right grid, the spread is not roof form — the tower control

    class                n      stdcm_1st  p10 / p50 / p90        std / height  p50
    h >= 40 m (towers)   301        301     1108     3040             0.148
    25 – 40 m            548        153      387     1202             0.130
    12 – 18 m          9,933         60      123      282             0.093
    6 – 9 m           67,873         36       80      167             0.111
    3 – 6 m           50,743         29       55      121             0.102

**`std / height` is 0.10 – 0.15 in every height class, including the 301
buildings over 40 m** — which in San Francisco are flat-roofed towers without
exception. The median tower's first-return standard deviation is **11.1 m**.
Nothing on top of a San Francisco tower is 11 m of roof shape.

What the spread measures is the building's own edge and its own multiplicity:
the 50 cm cells that straddle a wall, and the footprints that hold more than
one mass. The shape of the distribution says so —

    median(1st) − min(1st)   p10 1.7   p50 3.6   p90 7.3 m     ← a long tail DOWN
    max(1st) − median(1st)   p10 0.4   p50 1.1   p90 3.5 m     ← almost none UP

A gable on a 25 ft lot at a 5:12 pitch is about 0.46 m of standard deviation.
That is an order of magnitude under the contamination, and it cannot be
separated from it with aggregates that carry no location.

## 1.3 There *is* one dominant roof plane, and it sits at the median

    | majority_1st − median_1st |        p25    p50    p90
      all 166,166                          2      6     87   cm
      single-family, 6 – 9 m               2      7    101   cm
      h >= 40 m towers                    11     74  2,109   cm

The **modal one-centimetre bin is 6 cm from the median** for the median
building in the city. A gable with a 2 m rise spreads its cells evenly over
about 200 one-centimetre bins, so its modal bin is a near-random draw among 200
near-equal ones and would sit of the order of **50 cm** from the median. It
sits at 6. That is not a gable. It is one plane with noise on it.

## 1.4 And the pictures agree — the Sunset is flat

Checked against published aerial imagery (Esri World Imagery, public REST tile
endpoint, cut at each footprint's own centroid by `roofs/imagery.py`; used only
as ground truth, no imagery reaches the renderer).

- `shots/f2-val-sunset.png` — 32 Sunset houses, 8 from each quartile of
  measured relief. Rows 1–3 are **white and grey membrane roofs with parapets
  and roof plant**. The visible pitched tile roofs — there are three or four —
  are all in the fourth row, the top quartile.
- `shots/f2-blind-city.png` and `f2-blind-ab.png` — 48 random citywide, and 48
  more split 24/24 between the top and bottom deciles of relief, shuffled, with
  **no statistic printed on the sheet** so the roofs are scored before the
  number is seen. The modal roof is flat in both.
- `shots/f2-calib.png` — twenty named buildings with the number beside the
  picture. This is the sheet that kills the spread statistic on its own: the
  **James Flood Building**, twelve storeys and unambiguously flat, carries
  `stdcm_1st` **175 cm**; **Hotaling Stables**, a simple flat block, carries
  **94 cm**; the steeply gabled **Haas-Lilienthal House** carries 276 cm. There
  is no cut that separates them.

**San Francisco's row houses are overwhelmingly flat-roofed behind a parapet or
a false front.** For most of this city the flat-topped prism is the correct
form, and a city of invented gables would be worse than a city of honest boxes.

## 1.5 The two-plane model is also exhausted, and I checked

Block C fires the second solid on 488 footprints at `T − L >= 6 m` (one San
Francisco storey) and `A2 >= 58.06 m²` (25 ft squared). I ran the same model
down to twice the height quantum the shipped file carries:

    T − L band     footprints    fire    declined: mean <= median    A2 under gate
    >= 6 m              6,619     488                     1,453             4,678
    4 – 6 m             7,527     214                     2,685             4,628
    3 – 4 m            10,883     129                     4,858             5,896
    2 – 3 m            26,182      67                    15,590            10,525
    1.5 – 2 m          23,489      25                    17,226             6,238

**435 more buildings, 0.26 % of the city**, for four times the gate range —
because on 40,359 of the 68,081 footprints in those bands the published mean
sits at or **below** the published median (the edge cells drag it down) and the
model correctly declines. Two published moments support two planes and no more.

## 1.6 What was fetched, inspected and found not to help

- **`p2010_zminn88ft` / `p2010_zmaxn88ft`** — the 2010 Pictometry building
  mass's min and max vertex elevation, on 81.9 %. A genuinely independent
  instrument (stereo photogrammetry), and it does not carry roof form:
  `(zmax − zmin)` exceeds even `hgt_max` by a median of **1.71 m**, because
  `zmin` is a base vertex on the downhill side. It measures the mass, not the
  cap.
- **A published roof-type or solar-tilt dataset.** There is none. The DataSF
  catalogue was searched for *solar*, *roof*, *lidar*, *building height* and
  *3d building*: `sfnk-6tdn Green_Roofs` (a small green-roof register),
  `5kya-mfst Tall Building Inventory`, and nothing that publishes a roof
  geometry per footprint.
- **The footprint's own aspect ratio as a ridge direction.** Which way a ridge
  runs on a row-house lot is architecture, not a published field, and 1.4 says
  most of them have no ridge at all.
- **Bay windows.** The signature of the San Francisco house, and there is no
  published field for one. Not drawn.

---

# 2 · What is drawn instead

Four treatments, each from a published column, each behind a flag on
`window.ROOFS`, all judged in side-by-side studies on the same frame
(`roofs/studies.py`). Changed pixels against the same frame with all four off:

    subject   hres    storey    ink     tone     all      max delta (all)
    sunset    6.7 %    0.0 %   5.5 %   16.1 %   21.1 %         126 / 255
    fidi      2.1 %    3.2 %   2.5 %   16.5 %   21.0 %         161 / 255

## 2.1 `hres` — the sub-metre height the shipped file rounds away

`gen/bldg-data.js` stores `hgt_mediancm` as **one byte of whole metres**.
Neighbouring buildings on the same assessor block differ in published height by
a median of **0.90 m** — and after that rounding:

    identical drawn height, neighbouring buildings on the same block
      published data              0.7 %
      as shipped (whole metres)  36.0 %      ← this is "the Sunset is one bar"
      with the residual restored 14.5 %
                                              (160,934 neighbour pairs)

Restored at a **0.25 m grid**, four levels per whole metre, packed two to a
byte. The quantum is deliberately coarse: Block Z measured this same file's
**horizontal** geometry at 1.01 m p50 (p95 1.65, max 2.37) against the
published rings, and a roof level finer than the outline under it is precision
the record does not have. `UH` itself is untouched, so every assertion and hit
test that reads the published byte still reads it (F2.2: 166,166 heights move,
worst 0.375 m).

## 2.2 `storey` — the storeys the roll publishes, on the wall

`wv5m-vpq2` `number_of_stories`, on **141,646 of 166,166 (85.2 %)**:
1 → 67,004, 2 → 52,763, 3 → 17,598, 4 → 2,516, then a thin tail. The wall
facing the reader carries `st − 1` division lines. The 14.8 % the roll does not
count get **none**, not a guess.

The gate is a **cut-off, not a size floor** (F2.3): a band under
`STOREY_MIN_PX = 4.0` is not drawn at all, never squeezed to a minimum — the
distinction Block E measured on `gszV`, where a size floor made a landmark stop
shrinking with the city and lurch through a zoom.

**Where it does and does not help, stated:** it is the dominant treatment
downtown, where a wall is 130 px at the ceiling and you can count the floors
(`shots/f2-zoom-street-fidi.png`), and it does **nothing in the Sunset**, 0.0 %
of pixels — because the roll's median Sunset house is **1 storey**. The roll is
not counting floors as a resident would: the median metres-per-storey is 4.87
citywide, and the height by storey count goes 6.0 / 8.4 / 10.9 / 12.1 m, so the
*first* storey costs 6 m and each one after it 2.4 m. The uncounted garage
level is the difference. I did not fit that relation and do not draw it.

## 2.3 `ink` — the outline becomes a line

`VISUAL-SPEC.md` §1.3's register is "ink line + flat gouache wash … confident
single-weight outline", and the outline was **0.7 px at every size**. It now
opens with the **building's own projected width** — not with the camera, which
is the distinction the four-point silhouette above it already turns on: keyed
on the zoom, every building in the frame changes on one frame; keyed on the
building, the change is staggered across the fabric and there is nothing to
pop. 0.7 px below 20 px of building, 1.5 px above 72 px, and two darker values
of **its own roof** (Block M's finding, kept — a flat black outline on a pale
gouache wash is the poster contrast Block M removed).

Below 20 px of building this is a no-op, which is why the whole-city frame is
**0.4 % changed** and the district frame is unchanged to the eye.

## 2.4 `tone` — the roof's value inside Block M's own band

Block M banded the roof tone from `hgt_mediancm` at 9 / 15 / 25 m. That is
right for the city, and it means **121,419 of 166,166 footprints — every house
in the Sunset and the Richmond — fall in band 0 and take one single roof
colour**. A whole district painted one flat tone is a large part of what reads
as flat shading, and it is the single biggest treatment here: 16.1 % of the
Sunset frame.

The roof now carries where its published height stands **inside** that band, by
the band's own quartiles (`ROOFD.hq`, twelve numbers derived from the same
column; the value itself is `UH`, already on the page, so nothing per-building
ships for this). Band 0's quartiles are 5.69 / 6.11 / 7.25 m — which is exactly
the range a Sunset blockface occupies.

The amplitude was chosen by looking: `roofs/tonelab.py` renders the same Sunset
frame flat / ±8 % / ±14 % / ±20 % (`shots/f2-tonelab-sunset.png`). At 8 % it is
inside the "a few per cent of value between neighbours is invisible" that
`colourLUT`'s own note (ART-SPEC §7.3) gives as the reason the three roof tones
already run ~30 % apart — measured max delta 12/255. At 20 % the fabric starts
to read as noise. **±14 %** is where a row of houses separates and stays a row.
It is monotone in the published height, so the direction is information; which
end is lighter is an art choice and is stated as one.

Near path only: a near building already computes its own `fillStyle`, so the
batched Path2D buckets of the fabric tier are untouched and the tier below
costs nothing. That is also the LOD tier — `BLD_NEAR` is 121 of 165,978 at
whole city and 4,635 at block zoom — so the detail is already spent only where
a building is big on screen, which is the cost rule the brief sets.

---

# 3 · Before and after

Same camera in every pair (`roofs/shot.py`, `roofs/street.py`, `roofs/wide.py`),
1440×940, the film exited and the clock paused.

| frame | pair | changed |
|---|---|---|
| **Sunset, STREET (z 36)** | `shots/f2-zoom-street-sunset.png` | 26.3 % |
| **Sunset, block** | `f2-before-sunset.png` / `f2-after-sunset.png` | 12.6 % |
| **Fisherman's Wharf, close** | `shots/f2-zoom-wharf.png` | 13.8 % |
| **Civic Center, 1919** | `shots/f2-zoom-civic.png` | 12.9 % |
| Victorian blockface, Steiner St | `shots/f2-zoom-street-alamo.png` | 36.9 % |
| Financial District, STREET | `shots/f2-zoom-street-fidi.png` | 26.3 % |
| Richmond, block | `f2-*-richmond.png` | 14.9 % |
| **district** | `shots/f2-zoom-district.png` | 9.0 %, invisible |
| **whole city** | `f2-*-whole.png` | **0.4 %** |

Read as pictures: the Sunset stops being one continuous bar per blockface and
becomes a row of houses at their own heights and own values; downtown you can
count a tower's floors; the Victorian block goes from soft-edged blobs to drawn
objects. The wide frames are untouched, which is the point — every treatment is
gated on the building's own size on screen.

---

# 4 · Cost

`roofs/fps.py`, rAF **counted on the live page**, 1440×940 DPR 2, two runs each.
Never by timing `drawCity` into a detached canvas: Canvas 2D is deferred, that
harness reports JS time only, and it once sold an 8× "win" that was a
291 → 373 ms regression (PLAN-NIGHT2, Block L).

```
              pan whole  pan district  pan block  pan STREET  play 1907 dist  play 1907 whole
  before   1      7           5            7          24           66              77
  after    1      7           3            7          22           63              75
  before   2      7           4            7          23           63              73
  after    2      7           4            7          22           66              78
```

**Unmeasurable at this resolution**, with a possible ~4 % on a STREET pan —
which is the pessimistic bound, a full raster every frame with no motion tier,
not a gesture. Why it is nearly free: `storey` is one `Path2D` and one
`stroke()` per qualifying building on the near path only; `ink` is a
`lineWidth` and a table index; `tone` is a table index; `hres` is a
`Float32Array` read instead of a `Uint8Array` read.

    roofs/roof-data.js     216.6 KB raw     89.4 KB gzip
                           (storeys 38.5, the height residual 39.8, quartiles ~0)

That is the largest data add of any block tonight and it is the one number here
I would put in front of Daniel rather than decide alone. A plain-string
encoding was measured as an alternative and is barely better (83 KB); the
residual is a rounding remainder and is close to incompressible at 2 bits a
building. **If it has to go, `hres` is the half to drop** — it is 39.8 KB for
6.7 % of the Sunset frame, against `tone`'s 16.1 % for nothing.

---

# 5 · Assertions

Five new, in `gen/functional.py` beside the rest (315 ok / 0 fail / 0 err on
the prototype, against 310 for `gen/` as it stands):

1. **F2.1** the storey count is the roll's own and 85.2 % of the city has one.
2. **F2.2** the drawn height is the published median, not the whole-metre byte,
   and it never moves it by more than the byte rounded away (166,166 moved,
   worst 0.375 m).
3. **F2.3** no storey line is held at a size floor — a band under the cut-off is
   not drawn at all.
4. **F2.4** nothing claims a pitched roof: no ridge, gable, hip or parapet
   geometry exists anywhere in `drawCity`.
5. **F2.5** the roof's value inside its band is the published height against the
   band's own quartiles, checked element by element, not a hash.

**F2.1 failed first and the failure was mine, not the page's.** It tested
`window.RST`; `RST` is a page-scope binding, not a window property, so the
assertion returned false against a page that was correct — while the *detail*
expression beside it, which used the bare name, printed the right answer. The
fix is in the assertion.

---

# 6 · Three things that did not work, so nobody re-walks them

- **Deriving pitch from `hgt_std`.** §1.1: it measures the hill. The
  first-return grid had to be downloaded before the question could even be
  asked properly, and the nine columns were not in the project.
- **Deriving pitch from first-return spread.** §1.2: the tower control kills
  it. 301 flat-roofed towers at `std/height` 0.148, the same ratio as a house.
- **A study harness that measured a treatment as doing nothing.** `tone` first
  measured **0.0 % changed, max delta 0** — and the treatment was fine. The
  fine roof table is built inside `colourLUT()`, which returns early on an
  unchanged haze key, so flipping the flag never rebuilt the table and the pane
  compared the previous flag's picture with itself. Cleared in `ROOFSapply()`
  rather than remembered. It is the same species as the trap Block M recorded:
  a clean `--check`, a clean suite and two identical frames.

---

# 7 · Open, and honestly

- **The roofs still get no geometry, and that is the finding, not a shortfall.**
  If a pitched Sunset is wanted anyway, it has to come from a source that
  publishes roof planes — a LOD2 city model or a photogrammetric mesh — and it
  would be a new dataset, not a derivation from this one.
- **89.4 KB gzip** is a real page cost for a project whose whole page is about
  7 MB raw. §4 says which half to drop first.
- **The ground is still a pale checkerboard** at district and block zoom, which
  is now the loudest non-building thing in the Civic Center frame. Block M left
  it on the table ("the lot checkerboard … it competes with the fabric it is
  supposed to sit under") and it is still there. It is not mine and it is worth
  somebody's block.
- **The `st` band lines are drawn on every viewer-facing wall.** On a steeply
  foreshortened downtown wall that reads as close hatching rather than as
  floors. `STOREY_MIN_PX` 4.0 is the only dial and I did not sweep it against
  a wall-angle test.
