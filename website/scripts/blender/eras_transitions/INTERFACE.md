# What a key year must provide to the transitions (for the agent adding 1913, 1906-07, the 1880s)

The transitions (`prep.py` -> `render.py`, `run_chain.sh`, `kstar_pilot.py`) work on STEPS between two key years A -> B (B later).
Any year can be a key if it provides the items below over the same canvas. Adding a key year = adding it to `stage.YEARS` and to the
chain order in `run_chain.sh` / `kstar_pilot.py` (e.g. 1906.5 -> 1913 -> 1938 -> ...); nothing else in the code is per-year.

## 1. The canvas and the camera (fixed)
- The pyramid's orthographic camera (hq_city.py, `MODE=pyramid`, true proportions, 29.0 deg), level 8 (18 cm/px), frames of
  5120 x 3072 px named `<prefix>_z8_<fi>_<fj>` (L8 frame index = global L8 px / frame size). The pilot = L7 frames 4-6 x 2-3 =
  L8 frames 8-13 x 4-7. `stage.w2c()` / `c2w()` convert world metres <-> canvas px.
- The same sun for every year (LOOK B: az 215, el 24, unless the whole pyramid changes); a different light between years makes every
  pixel "change".

## 2. Blender passes of the year (from ONE render run of the year's scene: `ERA=<year>`)
In `eras2/pilot/out8/` (or give `stage._pass_path` / `_beauty_path` another directory):
- beauty `b8_<Y>_*_z8_<fi>_<fj>.png` (the render the year's AI starts from; also the reference for "what changed");
- class pass `l8_<Y>_*_z8_<fi>_<fj>.class.png` (passes_patch colours: roof, facade, landmark, street, ground, tree, water, other;
  cars in their orange);
- building-ID pass `l8_<Y>_*_z8_<fi>_<fj>.gid.png` (24-bit record gid per pixel; landmark models and structures are 0: they are found
  by their prisms instead).
Render the passes with the per-mesh material fix (6b6fca860): a beauty from a run that also wrote ID passes must not show ID colours.

## 3. The year's AI key (the photographic layer)
- A mosaic per L7 frame, `ek2/<Y>/m_<i7>_<j7>.png` (10240 x 6144, L8), made by `ai/ek_prep.py` + `ai/ek_run.py` (pod) +
  `ai/ek_blend.py`: the year's OWN generation from its own beauty (FIX recipe: the render tile only, no reference image, the reworded
  dry / wet clauses, CPU noise, world-grid 1024 tiles at stride 512, POW4 blend). Do not compose it with the next year's pixels:
  the transitions take the later key wherever nothing changed (`prep.py`), and keep the year's pixels only where the year differs.
- Tiles needed: every world tile meeting the pixels where the year differs from the NEXT key year's scene (dilated ~200 px). The first
  time, derive them from the renders (beauty / class / gid differences); `ek_prep.py` reads them from the order maps of a K* pass.
- Water: tiles > 95 % water are skipped (the transitions keep the later key's water wherever both years have water).

## 4. Records (what stands, with dates)
Read through `objects.standing(era, box)` = hq_city's own selection for an era render:
- DataSF records placed by `era.place_record` (year built, the completion moment `yc = year + 0.1 + 0.8 u`, `era.rise_years(h)`,
  `RECORD_YEAR_FIX`), stand-ins (`era.infill`), Sanborn lost buildings (`era.sanborn_all`: ring, height, `y0`, `gone_by`),
  landmark sites (`era.LANDMARK_SITES`: build windows SOURCED), lost structures (`era_lost.LOST`, `era.STRUCTURES`: `dem` windows).
- A new source of buildings for the older years (e.g. the 1880s maps) must come in as records with: `gid` (unique; the pass's id),
  `ring` (world metres, clockwise or not), `h` (m), `year` (first year standing, or a window `y0`), and when it goes: `gone_by`
  (or a demolition window). Put them in `era.py` so the Blender render and the transitions read the same list.
- A dated event that is not a record (the 1906 fire, a clearance, a freeway) needs its window: `dem=(start, end)` for removals,
  `build=(start, end)` for constructions, SOURCED or flagged CONVENTION; the transitions time every object from these.

## 5. What the transitions do with it (so a new year needs no new code)
- Born = in B's scene, not in A's (or rising in A: it continues); died = in A's, not in B's. Each is drawn with the grammar
  (GRAMMAR.md §1-§3) inside its window; ground and shadows switch with their owner; everything else is B's pixels.
- Steps can be any length; the film's pace follows the objects' windows (`render.py`), so a 7-year step (1906 -> 1913) and a
  25-year step (1913 -> 1938) both work.
- Special cases the older years will need: the 1906 fire (a death of MANY objects inside one sourced window, by burned district:
  give them a `dem` window per block and, if wanted, a fire-front order; rubble stays ~1 year) and the rebuild (births from the
  records' years). Nothing else has to change.
