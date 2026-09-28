# pipeline/ - design (pipeline agent, 28/09; BAR 28/09 19:10)

Three structural pieces, all city-agnostic (PLAYBOOK_NEW_CITY): the building table, incremental AI tiles, the automatic test suite.
Code here (branch exp/pipeline), big files on the SD (`/Volumes/DANI-SD-DRIVE2/pipeline/`), log + handoff in qipu-render-work/pipeline/.

## 1. Building table (BT_SCHEMA.md)
Built: `bt_build.py` (pilot + Mission, 19,165 buildings, 8 s), `bt_read.py` (get / attr / records / fa_table / alive / changed).
Tested: `records()` == `city_data.buildings()` today, ERA 1990, ERA 2024.5 (19,306 records, 0 differences); `fa_table()` ==
fa_table_v3.json (NB + Mission, 0 differences); `changed()` finds an edited building; tiles.py `touch` maps buildings to tiles.

### Migration plan per consumer (consumers NOT changed yet)
| consumer | today reads | step 1 (no look change, provable) | step 2 (uses the table's extra knowledge) |
|---|---|---|---|
| render (hq_city / hq_scene / gen_buildings) | city_data.buildings(): .qc cells + newb + fresh + places overrides (+ SOUTH) | DONE (b03e16e1b + c859a4a05, default off): `BT=1` -> city_data.buildings returns `BT().records(box, era, south, places, modelled_landmarks)` (SOUTH records are in the table). The table stays on the SD (never in a Mac snapshot): a pod gets it by upload or the network volume and `BT_FILE=<path>`. GATE PASSED 28/09 (render: identical scene stats, pixel diff = Cycles run-to-run noise, see qipu-render-work/pipeline/HANDOFF.md) | gen_buildings reads chosen attrs (profile 'best': storeys, roof form, colours with conf) instead of raw fields; golden + suite decide |
| faithful kit (FAITHFUL=1) | FA_FILE = fa_table_v3.json | FA_FILE=bt: gen_buildings._fa gets `BT().fa_table()` (equal today) | the faithful builder WRITES its results as BT rows (src faithful_*, per-value conf from votes / views) instead of a separate json |
| BK kit | bk_massing.json, hash rules | BK_MASS_FILE from BT geoms 'massing_part' | per-building kit flags (fire_rebuilt, side walls) as BT attrs with src 'convention' so they can be overridden |
| AI compose (per-building low-frequency colour correction, faithful agent) | - | read `attr(gid, 'facade_col' / 'roof_col')` + conf with R.gid.png; weight = conf | the correction's result per building back into BT (src 'ai_measured') -> colour pass metric v2 in the suite |
| eras (era.py, eras2, hq_city ERA) | record years + RECORD_YEAR_FIX + newb/fresh 'until' | `BT().records(era=Y)` (equal for 1990 / 2024.5); RECORD_YEAR_FIX = BT rows src era_fix | history sources (Sanborn, dated photos, era_lost LOST structures as origin 'lost') added as rows; a building's era view = its dated rows |
| stories (city-story product) | its own joins (places, photos, decisions) | address -> gid via BT (`address` from fresh; add a parcel join for all) ; beats from year_built/_src, demolished_by, landmark, photos | every beat cites the BT `sources` row |
| tiles planner | - | `BT.changed(previous build)` -> changed gids -> `tiles.py touch` -> tiles to re-render / re-run | - |

## 2. Incremental tiles (tiles.py)
Every AI job line -> `h_in` = sha1(op, gx, gy, render px of the region the op reads (C9/C8: 2048 around + the tile; RJ: the tile; G*:
+ class px), recipe hash (runner source = prompts + cascade, variant knobs, extra files), prompt key, seed, noise-field key, model,
precision). Outputs in a CAS on the SD (`tiles/cas/<h>.jpg`) + manifest.sqlite (output sha, card, s/tile, run, job line). `plan`
= reuse / run lists with the reason per miss (render / class / recipe / prompt / seed / model / precision / new tile), `--emit` reduced
job files, `--link` cached outputs. `touch` = building (BT) or world box -> job lines whose read region it touches (oblique projection
with the building's height and ground elevation).
Tested (golden fp8 set, 52 tiles): same spec -> reuse 52 / run 0; FP8 3 -> 2 -> run 52 (precision); one mosaic re-encoded -> run 4
(render); building 142291 (Coit base) + 138025 -> 7 of 127 suite tiles.
Card is not part of `h_in` (CPU noise: same image up to ~4/255 on another card); recorded, and `--card-strict` for pixel-exact A/Bs.

### City run
1. prep_block.py writes each block's job files as today; before dispatch `tiles.py plan --spec city.json --jobs <block jobs> --mosaics
   <block dir> --emit <todo>`: only misses go to the pods (first run: everything; re-runs after a crash / a partial recipe change: only
   what is missing). After each pull: `tiles.py record` (the finisher already pulls every 5 min). The world-tile registry (gx_gy -> image)
   stores h_in: the quilt reads by key, so a re-run never mixes recipes silently.
2. Recipe change -> recipe hash -> every tile misses; `plan` prints the count and $ before anything runs (e.g. 22.8 k x $1.65/1k).
3. A building change (BT diff) -> `touch` lists the frames to re-render and the tiles to re-run BEFORE rendering; after the re-render the
   pixel hashes confirm it (only tiles whose 2048 px changed miss).
### Eras
An era = another render; its tiles hash the era's pixels. Tiles whose input region is identical to the reference era reuse the
reference's output (same seed + recipe): unchanged areas are identical across eras (look v6 queue (2) 'era consistency') and free.
Caveat to solve first: path-tracing noise makes 'unchanged' render pixels differ slightly between two scene builds -> exact hashes miss.
Fix (next): store a 64 px thumbnail + a low-pass hash of each input region; `plan --tolerant dE` treats regions within dE as equal,
or render the era as a delta over the reference (only frames whose BT rows changed are re-rendered, the rest are the reference's pixels).
### Shared L8 (look v6 'sl8') and future stages
With a shared L8 layer the L9 tile depends on the L8 layer's crop, not on its own 2048 px: model it as two levels - L8 tiles are CAS
entries themselves (op 'L8', h_in from their render region), an L9 tile's h_in includes the h_in of every L8 tile it reads. Same for any
new stage (per-building colour correction: its input = the tile's h_in + the BT rev of each building in it).

## 3. Test suite (suite.py, metrics.py, sheet.py, sample.py; qa/run_suite.sh)
`qa/run_suite.sh <spec.json>` -> plan (cache) -> speed/gpu.py up/run/down (PROVIDER=auto: Vast 5090 FP8=3, RunPod fallback; FP8 pinned
from the spec: ONE precision per comparison) -> record -> golden_ai.py assemble (tag suite10) + win_asm.py -> metrics -> one sheet
(`~/Downloads/qipu-renders/live_ai/pipeline/suite_<name>_<time>.jpg`: table old | new | better / same / WORSE, 3 windows old | new,
10 golden crops old | new).
- Sets frozen on the SD (suite/inputs; the look agent's windows lived in the session scratchpad): golden10 (the fp8 A/B set: r16 r18 r05
  o01 o04 o06 o13 b03 r11 j02, 52 tiles), win (w1 park, w2 backyards, w3 FiDi, 75 tiles). Reference 'old' = `suite.json` ref
  (prod_bf16 until the base fp8 run exists, then `set-ref base_fp8mm`).
- Detectors: detectors.py flags (v5 set, TH per 1024 chunk), land on water (render-class water drawn land-like; prod r05 472 px vs
  the graded k9sd45 o09 invented land 89,178 px), sharpness (Laplacian var; reproduces look v6: w1 2156, w3 1499), colour hold per
  building (gid map; v2 = vs the BT facade colour once the per-pixel building-ID pass lands), overlap disagreement (win_asm.py).
- City sample (sample.py): stride 640, > 95 % water skipped (22,865 AI tiles; throughput agent 22,845), 6 strata (shore / downtown /
  park / open / dense / resid) with >= 8 % each; seed -> the same 2,285 tiles (~$3.8, ~5.8 h of a 5090 = ~3 cards for 2 h); nights
  overlap ~12 %. Gated: `run --sample` refuses until Daniel's go; until the city render exists only ~360 of the tiles have renders.
- Custom runners (a candidate with its own lr_run9 copy / variant json): v2 (gpu.py starts lr_run9v.py; START=0 + our runner).
- Not scheduled (no nightly cron yet, as asked).
