Mirror of qipu-render-work/city/PLAN_CITY.md + city/run/ (the whole-city run plan and scripts, 29/09). The scripts run from
qipu-render-work/city/run (absolute paths); this copy is the versioned record. Start with PLAN_CITY.md.

## Automatic fixes from the b8 defect sweep (30/09), all behind switches, default ON

Render (hq_city.py / gen_buildings.py; they reach a render through the next snapshot of exp/combo):
- `CRANE_V2=1` is now the code default: the lattice tower crane (b8 had the old solid box crane, a yellow cross). `0` = before.
- `GREENROOF_V2=1`: a sedum roof is 2.4 m mats of one tone with a ±4 % jitter on a slow field. It replaces the 1.2 m mats in 5 contrasting colours, which read as a pixel checkerboard. `0` = before.
- `TREE_WATER=1`: no register tree, canopy mass or measured crown on the render's own water (the terrain_hq sea mask). In b8, 7 trees stood in Mission Creek. `0` = before.
- `SLIVER=1`: drops building records with a footprint under 30 m² and a height over 3× the footprint's side. In b8, gid 124187 (7 m², 35 m) stood as a brick chimney in a park. `0` = before.

AI jobs (prep_sb.py):
- `RAIL_KEY=v8_rail5` (default): the rail prompt goes to tiles with OSM rails in the street (rails_b8.rail_len ≥ the areas.json threshold). It keeps rails only where the render has them and has no vehicle wording. b8 ran `v5_dry` everywhere and erased the F-line and T-line. `RAIL_KEY=v8_rail4` = before.
- `AUTO_REROLL=1`: each window also keeps its class mosaic `C_<w>.png`, which the auto re-roll needs.

Post (post_sb.py, in finish, after compose):
- `BRIDGE_RENDER=1`: landmark components standing in water (ring ≥ 85 % water, sparse) are replaced by the render (bridge decks, towers and trusses). In b8 the AI drew a house and rooftop units on the Bay Bridge.
- `QUAY_R` is now **off by default** (Daniel rejected it on b8, 30/09 evening: the fill left smeared, 'photoshopped' patches, and the tree removal was a misreading). What Daniel meant is that the land ends abruptly against the water and looks pasted in. The proposed fix is `QUAY_LIP=1` (off until he approves the sheet `live_ai/block52/b8_quay_edge_test.jpg`): a 1.8 m seawall face with a wet line and a kerb, drawn where ground meets render water with no pier wall nearby. The proper version is a straight seawall in the render itself (terrain_hq, along the OSM coastline).
- `ROOF_PLANTS=0` (experimental, off): the same fill for green on flat roofs. On b8 it left blotches (Westfield) and smeared a glass tower's park reflection, so it is not used.

### Auto detect + re-roll stage (NEW, between `ai:<w>` and `post`)
`city_run/run/autoreroll.py auto <win dir> <tiles dir> <l8 jpg> <MX,MY of l8_<w>.json> <new label>`:
1. `scan`: per tile, the new checks plus the quiet subset of the look_regain detectors (`TH_NEW`, `TH_DET_AUTO`):
   - `quay`: plants on paving near water.
   - `bridge`: structures drawn on bridge decks.
   - `roofgrn`: a grey roof painted green.
   - `garden`: greenery invented on big flat roofs.
   - `flat`: colour disagreement with the neighbours on flat surfaces.
   - `roof_road`, `water_roof`, `street_teal`, `lawn`, `water_street`: from the look_regain detectors, at high thresholds.

   The other detector flags go to the report only. Calibration on b8's original tiles: 10 of 11 known defect tiles flagged (the 11th through its neighbour pair). 3 of 40 random tiles were flagged, and all 3 were real (an apron with trees, a lawn on a pier deck, a block of houses invented on open water).
2. `jobs`: re-roll chunks for the flagged tiles. Each round uses the same prompt and the same L8 with a NEW noise key `nfR<k>`: with nf9=1 a new generator seed alone repaints the same tile.
3. `autoreroll_card.py`: one card runs the chunk queue (`rrq.py`), pulls outputs as they land, and goes down in `finally`.
4. `pick`: per tile, the lowest-cost version among the original and each re-roll goes into the tiles registry. The original is kept in `<tiles>/orig/`.
5. Up to `MAX_TRIES=2` rounds for the tiles still flagged. Then `autoreroll.md` (the per-run report: what was flagged, re-rolled, chosen and left) goes next to P.txt.

`DRY=1` runs scan and jobs only. `AUTO_REROLL=0` skips the stage.

Measured on b8: 8 tiles × 3 keys in 7.2 min on a Vast 5090, about $0.2 with the card overhead. Expect about 0.5–1 % of tiles flagged.

**Wiring:** city.py's queue does not call this stage yet: add a task `reroll:<w>` (mac lane + one A card) with deps ai:<w>, and make `post` depend on it. Until then, run it by hand after each window's AI step.

Known limit: a defect already in the shared L8 (the green pier roof, b8 #3) survives a re-roll. b8 fixed it by de-greening that roof in the L8 copy used for the re-roll (scratch `l8fix.py`); that fix is not in the stage yet.
