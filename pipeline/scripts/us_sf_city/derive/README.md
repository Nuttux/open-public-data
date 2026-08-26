# The constants are measurements of San Francisco. These are the instruments.

ADR-0012 §5.0 names the trap this directory exists to close:

> Most of bucket (b) is not a magic number somebody picked. It is the output of a
> measurement harness. **Copying those values to a second city is free and wrong.**
> Re-deriving them honestly is expensive, and no harness in the repo does it — the
> harnesses that produced them live in the untracked tree.

They are in the repo now. Sixteen files, ~900 lines, recovered from
`scratchpad/sf-city-anim/{lod,tilt,zoomlabels,roofs,orient}/` plus the four
measurement write-ups that carry the tables they produced.

**READ THIS BEFORE YOU RUN ANY OF THEM. None of these scripts runs today.** Every
one is a Playwright harness that drives `http://127.0.0.1:879x/mock-*.html` and
calls globals from the single-file prototype — `setTilt`, `applyZoom`, `drawCity`,
`BEATS`, `UPBB`. That page is gone; the renderer is now `website/src/lib/city/`
and `website/src/lib/citygl/`. **What is recovered here is the METHOD, not a
working tool.** Porting one to the current renderer is a real task, and it is the
task, not a formality — a constant is only honest for a second city if the
measurement behind it was re-run there.

---

## What each constant is a measurement OF

| constant | value at SF | the measurement | harness here |
|---|---|---|---|
| `LOD_Z0` | 1.55 | the zoom at which the **median SF building** projects to 1.6 px wide. Reads `cam`/`UPBB`/`UD` off the live page and reports median projected width per zoom | `lod_probe.py`, table in `MEASURED-lod.md` |
| `LOD_Z1` | 2.35 | same sweep gives 2.4 px; *"the first width at which a SF house is separable from its party wall"* is then a **judgement over that table**, not an output of it | `lod_probe.py` (partial) |
| `DETAIL_PXM` | 2.0 | a **Sobel edge-length sweep**: render into a blank canvas over z = 2.35…112, measure edge length per 1,000 m² inside a 240 m world square, take the deepest zoom still within 5 % of peak on three frames | `zoom_citydetail.py`, `MEASURED-detail.md` |
| `SA_DEFAULT` | 0.42 | a **framing measurement**. Sweep `SAS` 0.50 → 0.34 at 1440×940, project the terrain mask's bbox, report what fraction of the frame the city fills. 0.828 at 0.50, 0.738 at 0.42, crosses 0.72 at 0.4099 | `tilt_framing.py` |
| `SA_FRAMING_FLOOR` | 0.4099 | the crossing point of the same sweep, **exported so a test can read it**. This is the pattern worth copying: the bound is a published output of the measurement, not a remembered number | `tilt_framing.py` |
| `ROT_DEG` | 315 | a **bearing contact sheet** with landmark ground truth run through the real `proj()`, plus the painted-wall cost at 210 vs 315 | `orient_truth.py`, `orient_sheet.py`, `orient_finalists.py`, `orient_faces315.py`, `orient_cost.py`, `orient_hitdiag.py`, `tilt_facadeink.py` |
| roof band **quartiles** (`hq`) | 12 numbers | genuine per-band quartiles of `hgt_mediancm` over 166,166 footprints, computed at build time | `roof_bands.py` |
| `RSHADE` amplitude | ±14 % | a contact sheet at flat / ±8 / ±14 / ±20 %. The write-up says it was **"chosen by looking"** — recorded here as a taste decision with a rendered basis, not as a measurement | `roof_tonelab.py`, `MEASURED-roof-tone.md` |

## And the good example, which is not in this directory because it does not need to be

`website/src/lib/citygl/pick.ts` is what the whole exercise is aiming at: two
constants that were facts about one city, re-expressed so that **no measurement has
to be stored at all.**

- The pick snap radius wanted *half a street's right of way* — a fact about SF's
  street standard. It became a fixed fraction of the **median block's own √area**,
  computed from the shipped block rings by the shoelace at load. Over the 5,404
  rings the hand-set bound was tuned for it lands at **10.2 m against the hand-set
  10.5**, and the comment states plainly that *nothing about the derivation was
  tuned to hit it*.
- The march ceiling was a fixed 320 m — a fact about SF's 280 m relief. It became
  `max(gMax + slack, bMax, sMax) + dz` off the pick grid's **own sampled ground
  range**.

**A constant re-expressed as a derivation from the city's own published data ports
for free. A constant re-measured per city ports for the cost of a harness. A
constant copied does not port at all — it just stops being true quietly.**

---

## THE CONSTANTS WITH NO DERIVATION ANYWHERE

Searched: `website/src/lib/city/*`, `website/src/lib/citygl/*` and their plan docs,
`pipeline/scripts/us_sf_city/*`, and the whole of `scratchpad/sf-city-anim/`
excluding the snapshot and rollback trees. **These are findings, not a backlog to
be quietly promoted.** None of them may be carried into a portable core as-is,
because there is nothing to re-run for a second city.

1. **`bldg.yr`'s base year `1849`** — the worst of them, because it is a *format*
   constant rather than a render dial: one byte, a 1849–2104 window, and Paris
   overflows it at the low end on the first Marais building. It appears as a bare
   clamp `if not (1849 <= yr <= 2026)` in `gen/gen_geo2.py` and `time/bldgio.py`,
   is re-stated at `encode_city_chunks.py:326`, and is consumed at
   `citygl/bldg.ts:42`. **No comment, no doc, no harness, in either tree.** The
   string "Gold Rush" appears nowhere. ADR-0012 §4.6 is the only place in the
   repository that says what the number is. The manifest already publishes `year0`
   per chunk and the client ignores it.
2. **`PITCH_RUN_MULT = [1.95, 1.6, 1.3, 1.0]`** — ADR-0012 §5.0 says this "comes
   from an inradius fit". **It does not.** What exists is a prose argument for why
   `area/perimeter` under-reads the inradius by `1 + W/L`, one worked 10×20 m
   example, and a convexity census (8,281 of 14,555). `1.95` is the hand-picked top
   of a descending try-ladder. `PITCH_RUN = 12/5` and `PITCH_MAX_HALFRISE_M = 1.3`
   are the same, and the latter's own comment says **"DECLARED"**.
3. **`HEIGHT_BANDS = [9, 15, 25]`** — ADR-0012 §5.0 says this "comes from a height
   histogram of 166,166 footprints". **Overstated.** The histogram is real and it
   is `roof_bands.py` — but what it produces is the *quartiles inside* the bands.
   The band **cut points** are asserted in `MEASURED-height-bands.md`, with a storey
   cross-check offered afterwards as confirmation. No sweep and no fit chooses 9,
   15 or 25.
4. **`ZSTEPS = [1, 2.9, 7.2]`** — the whole three-stop preset ladder, and with it
   `BANDS`, `VZ_T0`, `VZ_C1` and `encode_city_chunks.py`'s `Z_TREES` / `Z_LINES_2`.
   The comment says only *"the three named stops the piece shipped with"*. This is
   the one that matters most after 1849, because `VZ_T0 = 2.9` is exactly the
   coincidental-equality hazard ADR-0012 §4.5 names: the street layer was gating on
   the tree module's threshold **because it happens to equal `ZSTEPS[1]` at this
   city's numbers.**
5. **`MINZ = 1` / `MAXZ = 12`** — prose rationale only (*"past ~8× no new detail
   arrives"* is asserted, not measured — and `zoom_citydetail.py` is exactly the
   harness that could measure it).
6. **`_grid.py`'s `ORIGIN_X` / `ORIGIN_Y` / `NX` / `NY`** = −8192 / −8192 / 16 / 16
   — a ±8,192 m box around SF's own origin, and `cells_of()` **raises** rather than
   clamps outside it, so a city more than 16.4 km across fails at encode time.
   Nothing computes a city extent and picks a box from it. (`CELL = 1024` is one
   honest step better: `_grid.py`'s header derives it in prose from measured
   inputs, and those inputs are `lod_probe.py`'s.)
7. **`SNAP_PX = 18`, `MARCH_SLACK_M = 40`, `FOOT_CELL_M = 40`** — declared guards
   inside the otherwise exemplary `pick.ts`.

## One more thing that was looked for and not found

`website/.parity/` holds ~300 further Playwright probes and is **also untracked**,
including `v1shot.py`, which `camera.ts:76` cites by name. It was left where it is:
it belongs to the front end, this pass does not touch `website/**`, and it is a
regression-shot library rather than a set of derivations. It is named here so the
next person does not conclude these sixteen files were all there was.
