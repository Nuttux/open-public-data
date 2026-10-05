# city_colour — a city's building colours from open photos (Vancouver first)

Run in `qipu-render-work/cities/<city>/look/colour/` (photos stay there, not in git):

1. `fetch_commons.py queries.json 8` and `fetch_cat.py "<Commons category>" ...` — open-licence Commons photos (CC0 / CC BY / CC BY-SA / PD), licence + author kept.
2. `sheets.py`, `pool_sheets.py`, `pick_sheets.py` — contact sheets; the boxes (`boxes_*.json`: photo, type, role, box in fractions) are picked by eye on the 10 % grid.
3. `sample.py` — box medians, white balance on near-neutral pixels, exposure p96 -> 0.70 linear (gain 0.8-1.35) -> `samples.json`; `review.py` -> review sheet.
4. `build_palettes.py` — samples + Vancouver conventions -> `palettes.json` (copy to `website/scripts/blender/colour_<city>.json`) + `sources.json`.
5. `colour_sheet.py` — swatches next to the reference photos.

The render side is `van_colour.py` (hooks H1-H3 in gen_buildings) and `van_roof_ortho.py` (per-building roofs from the ortho).
