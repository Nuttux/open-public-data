# PLAN_CITY: the whole-city run with the final look (29/09, planner agent; nothing launched, $0 spent)

Launch the day block_b8 passes. Scripts: `city/run/` (committed on exp/combo under `website/scripts/blender/city_run/`).
Everything is written to the SSD `/Volumes/QIPU-SSD/qipu-city` (`CITY_ROOT`). Nothing big goes to the Mac's `/`.

## 0. Before launch (gates and decisions)
| # | what | who | why |
|---|---|---|---|
| **U1 URGENT** | Pull `l8_*.jpg` from card **b8a** before it is destroyed: `ssh b8a ls /root/lr/out/*/l8_*`. Note the canvas origin: sl8v MX-512, MY-512. | b8 agent / coordinator | `run_b8.sh pull` excludes `l8*`. Without it, b8's edges with C3R1, C4R2 and C4R0 cannot share b8's L8, and those edges get fix5b-level seams. |
| U2 | Post b8 with `city/run/quilt_stream.py` + `post_sb.py`, not with `tp_quilt_c.py` / `post_b7.py`. | b8 agent | For a b8-size block, `tp_quilt_c` keeps every row strip plus the float32 canvas: about 26 GB of RAM. `post_b7`'s whole-image arrays need about 20 GB more. `quilt_stream` gives byte-identical output in about 1 GB. |
| G1 | Freeze: snapshot `city1` from exp/combo HEAD (mksnap ROOFS=1 CANOPY=1 FRESH=1). Copy `data/faithful/*` and the one-off models (`combo/block52/oneoffs/models` → `snap/city1/data/oneoffs_models`) into the snapshot. Put the pack on the network volume (`/vol/packs/city1.tar.zst`, NETVOL=1). | coordinator | `render_env_all` in `areas.json` points at these paths. |
| G1b | Choose the city faithful table: `CITY_FA_FILE` (the faithful agent's city table, due 30/09 evening) or b8's `fa_table_v3` (NB box only). Also `CITY_RN_CROP`: `rn_sf8.png` covers only 48 % of the city. | Daniel / faithful agent | Outside those boxes, buildings get the table defaults and NAIP roofs are missing. The first probe on a non-NE area shows the effect. |
| G2 | The L8 registry prefill (`sl8v_city.py`) passes probe P-SEAM-a. | this plan | New code. It is mock-tested on CPU: the neighbour's L8 is kept, overlapped anchors are skipped, and a restart resumes. It is not yet tested on a card. |
| G3 | Add `SE_DRAPE=1` (the slope/apron fix, commit 07758cf7c) only if the street_edge before/after check passed. Add `WATER_V5=1` only if water v5 is adopted. Pass either via `CITY_GATED`. | street_edge and water2 agents | I found no validation record for either. |
| D1 | **Budget.** The global `HARD_STOP` is $250 and $175.02 is already spent, so only $75 is left. That is less than the expected city cost plus other agents' spend. Raise it to ≥ $350. The Vast credit is **$18.21**: top it up to ≥ $50 (AI ≈ $26–40). | Daniel | |
| D2 | Card counts: `N_RENDER=5` RunPod A5000/A40 pods and `N_AI=5` Vast 5090 cards. `MAX_VAST` stays 6. | Daniel | |
| D3 | Terrain outside SF (Marin, Angel Island, Daly City / Brisbane south of 37.708): render only (default, `TERRAIN_AI=0`) or AI (+5,332 tiles, about +$9). | Daniel | With AI, the empty hills get invented houses. With render only, there is a visible step in look at the county line. Probes P-EDGE show it. |
| D4 | Ocean Beach has no surf model (water v4/v5 is bay chop). Accept for v1 or add a later fix (not in this run). | Daniel | |

## 1. Coverage
- **City extent:** 163,840 × 98,304 L9 px = 32 × 32 L9 crops of 5120 × 3072 (1,024 crops). Water is 44.6 % of the pixels.
- **Method:** `run/coverage.py` measures water on the L7 city render (the throughput agent's colour lookup). `sb.py` inverts the viewer projection with the DEM to mark cells outside SF.
- **Crops:** 527 city (SF land ≥ 0.5 %), 153 terrain (land outside SF only), 344 sea. Of the sea crops, 186 touch land and 158 are open sea.
  - Every crop is rendered once, into the crop registry `ROOT/crops/`.
  - Sea crops get the beauty job only; their passes are synthesised as all water.
  - b8's 48 full crops are imported, so **976 new crops** are left to render.
- **AI tiles:** stride 640, 1024 px, a tile is skipped when water + outside-SF ≥ 95 %.
  - 17,515 city tiles in total. With terrain it would be 22,847, which matches the throughput agent's 22,845, so the coverage cross-checks.
  - b8 owns 1,383, so **16,132 new tiles**. Each world tile is generated once: the first window claims it (`ROOT/tiles/claims.json`).
- **z9 tiles:** 61,440 webp for the full rectangle, plus about 20k for the pyramid (`pyr_down.py`).

**Super-blocks (SB):**
- 6 column groups (0-4 | 5-9 | 10-14 | 15-19 | **20-25** | 26-31) × 4 row groups (0-7 | **8-15** | 16-23 | 24-31) = 24 SBs of at most 6 × 8 crops. b8 is exactly SB C4R1.
- Each SB has 2 AI windows (upper and lower half, one shared L8 each; a window mosaic is about 450–480 MP).

**Run order** (demo areas → Mission/Haight → west side and hills → south → east and islands → Marin/sea):

| # | SB | area | new crops (city) | AI tiles | render pod-h | AI card-h |
|---|---|---|---|---|---|---|
| 0 | C4R1 | **b8** FiDi / North Beach / SoMa / piers: imported, not re-run | 0 | 0 | 0 | 0 |
| 1 | C3R1 | Russian / Nob Hill, Lombard, Marina, Fort Mason, Tenderloin, Civic Center, Alamo Sq | 62 (56) | 1,434 | 5.1 | 3.6 |
| 2 | C4R2 | Mission Bay, Chase, Potrero Hill, Dogpatch, Pier 70, Islais Creek | 71 (69) | 1,885 | 6.2 | 4.7 |
| 3 | C3R2 | Mission, Dolores, Castro, Noe, Bernal, Glen Park | 40 (40) | 1,560 | 3.6 | 3.9 |
| 4 | C2R1 | Haight, Panhandle, Presidio east, Crissy, Palace of Fine Arts, Cal Academy | 50 (41) | 1,349 | 3.8 | 3.4 |
| 5 | C2R2 | Twin Peaks, Sutro Tower, Cole Valley, Inner Sunset, Mt Davidson | 40 (40) | 1,560 | 3.6 | 3.9 |
| 6–9 | C1R1, C1R2, C0R1, C0R2 | Richmond, Presidio west, GG Bridge S, GG Park, Sunset, Lands End, Ocean Beach | 162 (106) | 3,936 | 10.6 | 9.8 |
| 10–13 | C3R3, C2R3, C1R3, C4R3 | Excelsior, McLaren, Balboa, Lake Merced, SFSU, Visitacion, Candlestick | 161 (69) | 2,814 | 10.8 | 7.0 |
| 14–16 | C5R2, C5R3, C0R3 | Hunters Point, Piers 80-96, Fort Funston | 113 (30) | 1,048 | 4.3 | 2.6 |
| 17–23 | C5R1, C5R0, C3R0, C2R0, C1R0, C0R0, C4R0 | Bay Bridge water, Treasure Island, Alcatraz, strait, Marin, north-bay water | 277 (33) | 546 | 10.2 | 1.4 |
| | **total** | | **976** | **16,132** | **46 / 58 / 81** | **36 / 40 / 54** |

The exact per-SB numbers come from `python3 city/run/city.py plan --plan-only`, which also writes `ROOT/plan/sbs.json`.

**SB edges without seams:**
- **Tiles.** x edges are multiples of 5120 (a multiple of 640), so they never fall inside a quilt band. The y edges at 24576 and 73728 do fall inside one. For those, an SB's quilt takes every tile whose pixels can reach it (`sb.tile_range`). Stacked SBs then share the same tiles, the same columns and the same inputs, so the DP gives the same seam.
- **L8.** A window's shared L8 canvas is pre-filled from its neighbours' finished L8 (`ROOT/l8/`, `sl8v_city.py`). An anchor already covered is not regenerated. The fixed area keeps the neighbour's L8, with a 32 px ramp inside it.

## 2. Risks per area and their probes
A probe is 3–6 AI tiles (a 2–3 × 2 window) around a point. It gets the partial render crops (tiles ± 1536 px), its own shared L8, the full post, and a native sheet.
- Every SB waits for the probes of its risk tags (`city.py gate <probe> ok`).
- All 21 probes run as one batch first: one render pod and one AI card, about 3–4 h wall and about $3–4. Daniel reviews one sheet per probe.
- Definitions, coordinates and switches are in `city/run/areas.json`.
- Render recipe everywhere: `Z=9 SE_APRON TREE_EDGE FOOT_SPLIT LM_CLEAR_KEEP ROOF_CALM WATER_V4 WAKE_NOAO=1 LM_SF_CROWN=1 LM_MODELS_OVERRIDE` + FAITHFUL / ROOF_NAIP / BTEX, as b8. The passes are a separate job.
- AI recipe everywhere: FIX-v6 `{"nf9":1,"nfkey":"nfC"}` shared L8, FP8=3, runner `lr_run9_b8.py`.

| risk | SBs | what bites | AI key / prompt | switches | probe(s) |
|---|---|---|---|---|---|
| **rails** | C3R1 C4R2 C3R2 C2R1 C1R2 C0R2 C2R2 C2R3 C4R3 | Cable cars, Market/F, N-Judah, L-Taraval, K/M, J, T-Third, the Caltrain yard. With `v5_dry_rail2`, the AI painted rails and wires on every street of a rail tile and turned wide railed roads into ballast. | `v8_rail4` (RAIL4 + VEHG: rails only where the render has them, keep vehicles, add none) on tiles with ≥ 30 m of surface rail (OSM, `rails_b8.rail_len`); `v5_dry` elsewhere. C3R1 has 140 of 1,470 tiles on `v8_rail4`. | `road_fix` stays unwired | P-RAIL-a Hyde St at Lombard; P-RAIL-b N-Judah at 30th Ave; P-RAIL-c Caltrain 4th & King + T-Third |
| **slopes** | C3R1 C4R2 C3R2 C2R2 C3R3 C4R3 | Twin Peaks, Bernal, Potrero, Russian/Nob Hill, Mt Davidson: aprons and stoops float or step on steep streets; steep steps read as walls; bare hill grass reads as dirt lots. | `v5_dry` | `SE_DRAPE=1` if G3 passes; FOOT_SPLIT | P-SLOPE-a Twin Peaks, **A/B SE_DRAPE 0 vs 1**; P-SLOPE-b Bernal, A/B; P-SLOPE-c Potrero 20th St |
| **narrow piers** | C3R1 C3R0 C4R2 C5R2 C5R3 C5R0 C2R1 C1R1 | Aquatic Park Municipal Pier (curved, about 6 m wide), Marina floats, Fort Mason, Piers 70/80/96, Hunters Point docks, Treasure Island marina: the AI invents rubble or houses on narrow decks (Pier 7 in block52_v7). | `v5_dry` | post `piers` (render deck when r90 ≤ 30 px); compose docks = render | P-PIER-a Municipal Pier + Hyde St Pier; P-PIER-b Marina floats |
| **parks** | C2R1 C1R1 C1R2 C0R2 C0R1 C2R2 C3R3 C1R3 | GG Park (Stow Lake, Polo Field, bison, windmills), the Presidio forest, Lands End, McLaren, Lake Merced: invented paths or roofs in canopy; lawns turned to dirt; small inland lakes; many `veg_shore` flags (b7). | `v5_dry` | TREE_EDGE; compose near-water plants = render | P-PARK-a Stow Lake; P-PARK-b Presidio Main Post + forest edge |
| **Ocean Beach surf** | C0R1 C0R2 C0R3 | Water v4 is bay chop, with no breaking surf. Sand, dunes and the Great Highway sit next to class water. Water pixels are the render, so the AI can neither fix nor break them. | `v5_dry` | WATER_V4 (V5 if adopted); D4 | P-SURF-a Ocean Beach at Judah; P-SURF-b Cliff House / Sutro Baths / Seal Rocks |
| **industrial east** | C4R2 C4R3 C5R2 C5R3 | Pier 80 cranes, container yards, the Hunters Point shipyard, Bayview warehouses, rail yards: roof camo and dark membranes, lot↔roof confusion, invented containers and trucks. | `v5_dry` (`v8_rail4` on the yards) | ROOF_CALM; post `roof_fix`; detectors roof→lot, roof_color | P-IND-a Pier 80 cranes; P-IND-b shipyard drydocks |
| **southern edge** (no airport: SFO is south of row 31) | C0R3 … C5R3 | Daly City and Brisbane are not modelled (empty terrain). With AI they would get invented houses. Render only leaves a look step at the county line and buildings cut at the edge. | city tiles `v5_dry`; terrain = render | `TERRAIN_AI=0` (D3) | P-EDGE-a Geneva Ave / Crocker-Amazon; P-EDGE-b Candlestick / Brisbane |
| **landmarks** | C1R1 C1R0 C2R1 C3R1 C2R2 C0R1 C4R2 C3R0 C5R0 C5R1 | GG Bridge + Fort Point, Palace of Fine Arts, City Hall dome, St Mary's (C9 flat facade known), Painted Ladies, Sutro Tower (thin lattice: the AI may erase or thicken it), Legion of Honor, Conservatory, de Young, Cal Academy roof, Mission Dolores, Chase, Alcatraz, Treasure Island hangars, Bay Bridge / YBI | `v5_dry` | LM_CLEAR_KEEP, LM_SF_CROWN, LM_MODELS_OVERRIDE (one-offs c_sspp, t_555cal) city-wide | P-LM-a GG Bridge S tower + Fort Point; P-LM-b Sutro Tower; P-LM-c Palace of Fine Arts; P-LM-d City Hall |
| **SB seams** (new mechanism) | all | Tiles on each side of an SB edge come from different windows. | – | `sl8v_city` L8 prefill (G2) | P-SEAM-a b8's west edge at Broadway: 3 × 2 C3R1 tiles next to b8's, L8 pre-filled from b8's `l8_b8.jpg` (needs U1) |

## 3. Orchestration (`city/run/`)
| file | role |
|---|---|
| `coverage.py` | Water, outside-SF and land per 64 px cell from the L7 city render → `ROOT/cov/` (done: 96 s, 2.7 GB). |
| `sb.py` | Geometry, the 24 SBs, run order, crop kinds, tile kinds, tile ranges, counts. |
| `areas.json` | Risk classes, the render env, key rules, the 21 probes. |
| `prep_sb.py` | `jobs` (own + ring crops the registry lacks), `import` (pod outputs → crop registry; size and Traceback check), `windows` (tile claims, window mosaic from the registry, pretone CAMO=0 ROOFN=1, P.txt with rail keys and pilot seeds, SL8.json, `sl8v_city`, L8 prefill), `probe` / `probe_import` / `probe_window`, and `--plan-only`. |
| `mk_sl8v_city.py` | Builds `sl8v_city.py` from look_v6 `sl8v.py` with 4 asserted text patches: L8 prefill, L8 resume, tile resume, and the `l8_<w>.json` origin. The recipe is otherwise unchanged. |
| `render_sb.sh` | `render_b8.sh`, plus a skip for jobs already done on the pod. |
| `run_win.sh` | `run_b8.sh`: up (plus the dead card's L8 for the resume), wait (STALL detection), pull (tiles → registry, L8 → `ROOT/l8`). |
| `mos.py` | Reads any L9 box from the crop registry (edge-replicate outside the city; raises on a hole). No whole-SB mosaic is ever built. |
| `quilt_stream.py` | `tp_quilt_c` streamed by tile row: **byte-identical** (test on a block52 sub-region: `python3 quilt_stream.py test` → IDENTICAL), about 1 GB of RAM. |
| `post_sb.py` | Banded Mac post: 3072-row bands with a 1536 px halo → compose → roof_fix → colour2 → piers → final band + z9 webp + detectors; then the sheet. |
| `import_b8.py` | b8's crops, tiles, claims, L8 and z9 → the registries. |
| `city.py` | `plan --plan-only` / `run` / `status` / `gate` / `stop` / `qa`. |

**colour2 fixes a bug in `post_b7` step_colour:**
- `post_b7` corrects a building only in the 3072-row band that holds its top row, and writes only that band. The lower part of a facade that crosses y = 3072k stays uncorrected, which leaves a step at the band line.
- colour2 computes each building's delta once and applies it in every band. The deltas are stored in `ROOT/colour/deltas.jsonl`, and SB neighbours reuse the same delta for buildings that cross their edge.

**Queue.**
- `ROOT/state/queue.json` holds one task per SB per stage (render, import, windows, ai:w0, ai:w1, post, qa) with dependencies.
- Done work lives in the registries (crops, tiles, L8, bands `f_<y>.done`), so a restart of `city.py run` or of a card resumes where it stopped. It never regenerates an existing tile or re-renders an existing crop.

**Lanes:**
- R: `N_RENDER` RunPod pods (lmk_pod.sh, A5000 secure $0.27/h, else A40 $0.49/h), PAR=2, max_hours 3 each (on-pod watchdog), kept alive between SBs.
- A: `N_AI` Vast RTX 5090 cards (gpu.py, FP8=3, START=0, max_hours 3 = self-destroy), one window at a time.
- mac: `MAC_PAR=2`: two band jobs of about 7.5 GB each. A Mac task starts only with ≥ 12 GB free RAM, swap < 90 % and `/` ≥ 6 GB.

**Retry.**
- A dead card is one whose runner stopped, that made no new tile for 15 min (25 min for the first: L8 + compile), or that became unreachable.
- The loop then pulls what is done, takes the card down (COSTS.md), blacklists the host (hosts.py, 24 h), and requeues the task. The new card gets the dead card's L8, so the window stays consistent.
- After 3 deaths the task fails; the lane goes on with other SBs. A Blender Traceback on the same crop twice also fails the task (a bug, not a flake).

**$ cap.**
- `CITY_CAP` defaults to **$95**, over the city ledger: COSTS.md rows `cty-*` plus live city cards × $/h.
- At ≥ 85 % no new card starts. At ≥ 100 % the loop writes a STOP file and takes every city card down.
- It also stops $2 before the global `HARD_STOP`. Every card has its own max_hours, so a dead Mac cannot leave a card billing.

**Disk (SSD, 1.6 TB free):**

| stage | size |
|---|---|
| crops | 13–15 GB |
| window mosaics | ~9 GB (delete after the AI) |
| AI tiles | 7.8 GB |
| L8 | ~2 GB |
| quilt bands | ~24 GB (delete after finish) |
| final bands | ~22 GB |
| z9 + pyramid | ~20 GB |
| **peak if nothing is deleted** | **~100 GB** |

The Mac's `/` gets nothing.

**Mac RAM and time (measured, §6):**
- The quilt uses about 1 GB.
- A finish band (FIN_BH 1536 + HALO 1024) peaks at 5.2 GB at block52 width, so about 7.5 GB at b8 width.
- Speed is 3.1 s per MP (quilt + finish + detectors). The whole city is 16.1 GP: about 14 h serial, or about 7 h with `MAC_PAR=2`, which keeps pace with the AI lane.

## 4. Cost and time
| item | low | expected | high |
|---|---|---|---|
| render: 976 crops, beauty + passes, 46 / 58 / 81 pod-h × $0.27–0.49 | $12 | $20 | $40 |
| AI: 16,132 tiles × 8 / 9 / 12 s (5090, incl. L8) × $0.60–0.74 | $22 | $26 | $40 |
| card set-ups (≈18 render + 14 AI sessions, weights $0.09–0.35 per Vast start) | $2 | $4 | $8 |
| probes (21 × about 6 tiles + partial crops) | $3 | $4 | $5 |
| retries / dead cards (+10 %) | $0 | $5 | $10 |
| **GPU total** | **$39** | **$59** | **$103** |
| bucket egress: pack per render session, window mosaics, results → Mac (~21 GB crops + tiles) at $0.12/GB; less with NETVOL | $4 | $7 | $10 |
| **all-in** | **~$45** | **~$66** | **~$113** (the cap stops at $95: decide D1) |

Optional: TERRAIN_AI adds about $9. Rendering passes inside the beauty job would save about 35 % of render, but needs the GID_PASS fix first.

**Wall time** with `N_RENDER=5`, `N_AI=5`, `MAC_PAR=2`, pipelined per SB:
- Render: 58 / 5 = ~12 h. This is the long pole. It makes 5 render pods worth more than more AI cards.
- AI: 40 / 5 = 8 h, running behind render.
- Mac post: 14 h serial, ~7 h with MAC_PAR=2, running behind the AI.
- Plus probes and review: ~3–4 h. Plus the tail: last SB + pyramid, ~2 h.

**Expected ~16–18 h**; low ~11 h (8 + 8 cards); high ~30 h (card scarcity as on 28/09, or MAC_PAR 1 with slow bands).

## 5. QA per SB (stop rule)
`post_sb.py` runs the detectors of `detect_b7` on every 1024 px cell of every final band: roof→road, water on streets/roofs, invented water, plants on structures and docks, roof colour lost, teal streets, lawn, roof→lot, land-blue px, water changed. Then `city.py qa <SB>` decides.

**An SB fails when any of these holds:**
- an AI tile is missing, or FALLBACK render was used;
- a Blender Traceback or a mosaic hole;
- flagged cells > 2 × b8's rate (`CITY_B8_FLAG_RATE`, set from b8's detect json);
- land-blue > 0.2 % of land;
- (by eye, on the sheet) a visible SB-edge seam.

**What a failure does:**
- The SB is not published.
- SBs that share its risk tags pause.
- Two failed SBs in a row → STOP.

**Sheet:** 8 native 1600 × 1000 crops per SB in `~/Downloads/qipu-renders/live_ai/city/<SB>.jpg`: probe points in the SB, the 3 worst detector cells, the SB-edge crossings, 2 seeded random. Daniel looks at the first SB of each risk class before the next SB of that class publishes.

## 6. Dry run and tests (no GPU)
- **Dry run.** `python3 city/run/city.py plan C3R1 --plan-only` → `city/run/dryrun_C3R1.txt`:
  - 7 tasks and their dependencies;
  - 134 render jobs (40 own + 30 ring crops; 6 are sea, beauty only);
  - 2 AI windows: w0 has 650 tiles (69 on `v8_rail4`) with a 445 MP mosaic, w1 has 820 tiles (71 on `v8_rail4`) with a 483 MP mosaic;
  - 8 post bands and 2,400 z9 tiles;
  - the exact commands.
  - This dry run was made before `import_b8`, so the 36 tiles and 8 ring crops b8 owns are still counted.
- **`quilt_stream` vs `tp_quilt_c`:** byte-identical on a block52 sub-region.
- **`sl8v_city` mock (CPU, fake pipe):** 2 of 6 anchors skipped under the neighbour's L8, the canvas equals it deep inside the prefill, and the re-run makes 0 new anchors and 0 new tiles.
- **`post_sb` on block52_v7's real crops and tiles** (a TEST SB = block52's Q minus its top 2560 rows, 199 MP; `/Volumes/QIPU-SSD/qipu-city-test`):
  - It runs end to end: quilt in 78 s; finish in 536 s over 7 bands, peak 5.2 GB.
  - The output equals block52_v7's final except for 1.4 % of pixels (> 2 levels). Those are the facades below the post_b7 band lines, which the colour2 fix changes on purpose.
  - Finish bands of 1536 + 1024 halo and of 3072 + 1536 halo give the same image: 0 pixels differ by more than 2 levels.
  - Facade correction 200 rows above / below the band line y = 33792: post_b7 gives +4.13 / +0.72 L, colour2 gives +4.12 / +3.58.
  - Picture: `~/Downloads/qipu-renders/live_ai/city/colour_bandline_fix.jpg`. In post_b7, facades below the band line stay greyer.
