# Transitions audit: the pilot film v4 and the slider (26/09 evening)

Film: `~/Downloads/qipu-renders/live_eras2/film_pilot_1938_today_v4.mp4` (1280x720, 25 fps, 759 frames, 30.4 s; keys 1938 / 1959 / 1985 / 2006 / today;
step boundaries at t = 7.55, 15.65, 22.50, 28.30 s). Code: `eras2/film2_v3.py` (the order-map "grammar" of film.py + staged overlays).

Method (no AI): `tools/vid_audit.py` aligns every frame to the previous one (ECC affine, full res), takes the residual and lists the blobs
that change by > 40 levels in ONE frame (pops) and the per-frame share of slow change (fades); `tools/ev_sheet.py` cuts native crops at
frames f-6, f-1, f, f+1, f+6 of each event; `tools/kinds_audit.py` re-runs film2_v3's order maps on the pilot keys and measures the
area of each kind; `tools/holes.py` measures what the keys can and cannot show behind a changing building. Worst frames:
`AUDIT_worst_frames_v4.jpg` (also in `live_eras2/transitions/`). Coordinates below are film px (x, y) of the 1280x720 frame.

## 1. What is wrong, by kind (worst first)

| # | Problem | Where (t s, film px) | Root cause (code) |
|---|---|---|---|
| 1 | **Cross-fade ghosts**: two cities superimposed for seconds (translucent old brick blocks over the new plaza; see-through towers with a skeleton showing through) | 9-12 s Yerba Buena (560-880, 420-600); 14.9 s (570-660, 170-240); 20.8-21.2 s (930-990, 195-240); **25.5-25.7 s Transbay (1150-1200, 245-360): 181 Fremont and its neighbours are half-transparent for ~1 s, then pop solid at 25.72 s** | `prepare()` classifies every changed component that is not clearly a rise/sink/line/shore/grow as **'fade'** (a 0.8-wide alpha ramp = a plain dissolve). Measured share of the changed area that dissolves: **27 % (1938-59), 22 % (1959-85), 39 % (1985-2006), 40 % (2006-today)** (836 / 868 / 782 / 986 components). |
| 2 | **Pops at every key year**: pixels that differ between two AI keys but not between the two Blender renders snap in one frame | 7.56 s, 15.68 s (a teal mid-rise at 894-973, 90-147 goes from ghost to solid), 22.52 s, **28.32 s: the whole bay changes colour in one frame** (light blue to dark teal, 966-1274, 6-219, 30k px) | The alpha is 0 outside the Blender change mask `d` (\|A-B\| > 10 on the Blender beauty, AND the dilated era mask); the frame then shows A until the step ends and B from the next frame. The 2006 key was composed over an older 'today' (other water); the film's 'today' is newer. |
| 3 | **Staged constructions look like placeholders**: flat single-colour slabs (brown, grey) for site mats and frames, a translucent WHITE column (the core) sticking out of the slab, a faint yellow crane line; then the finished building **pops** in one frame at completion | 7.2-7.44 s warehouse (537-699, 630-712); 11.9-12.2 s Moscone (424-621, 548-625, pop at 12.20); 12.24-12.72 s (1010-1088, 584-641: a flat grey polygon appears in one frame); 17.2-17.44 s (884-979, 612-654, pop at 17.44) | `stage_overlay()` paints the site, frame and core in flat constant colours (only a luminance map from the final facade); `done` switches the building to the final key in one frame (`m1` = 1 at `yc`), and the last overlay state never equals the finished building. |
| 4 | **Wrong occlusion (half-in-half-out)**: a rising tower's frame is drawn OVER the building in front of it | 20.8-21.2 s (931-991, 197-236): the dark frame grid covers the pale-blue tower in front | The overlay is composited on top of everything inside its padded box; it is not clipped to the pixels where the finished building is actually visible in the later key. |
| 5 | **Blur halos and smears** on rising frames: a soft light glow above the frame's top, a blurred band where the frame meets the plate | 11.84-11.92 s (947-1024, 44-131); 14.9 s | the order-map alpha is computed at box res then bilinearly upsampled (a 2 px soft edge in full-res = smear), plus the 0.6 px prefilter and 3 sub-frames on a moving top edge. |
| 6 | **Pixel wipes instead of buildings rising**: 617 of the 850 appearing buildings are not staged; they are revealed bottom-up as an image wipe of the FINISHED building (its roof and rooftop kit appear last, the facade is the final one from the first frame, no top slab, no shadow growth) | everywhere, all four steps (rise = 50-56 % of the changed area) | `prepare()` 'rise' kind: alpha threshold on the column height; nothing moves, the image is unmasked. Staging only for records >= 18 m that film_rises.json knows. |
| 7 | **Demolitions are reverse wipes**: an old block is erased top-down by the order map (no dust, no rubble, no cleared lot), or dissolves (kind 'fade') | 1938-59 and 1959-85 (Yerba Buena, Golden Gateway), 5-12 s | kind 'sink' = the rise wipe reversed; 'fade' for mixed components. |
| 8 | **Holes behind demolitions and rises are faked with the other key**: where an old building stood and a new one stands 20 years later, neither key shows the empty lot; v4 blends the two | Yerba Buena 1966-81 (should be years of cleared lots and parking); Transbay 2006-18 | measured: 3 % / 8 % / 5 % / 12 % of the born-building pixels per step have a dying building behind them in the earlier key (0.1-0.6 % of the frame). The rest of a new building's pixels (78-92 %) sit over ground or a building that stays: the earlier key IS the right plate there. |
| 9 | **All changes of a 20-year step happen at once**: the whole step's components share one clock (`OFF` spreads them over 15 % of the step only) -> a district-wide morph rather than buildings going up one after another | every step; worst 1959-85 (27 % of the frame changes in 8 s) | per-component offset `OFF = 0.15 u`; no per-building date except for the 233 staged records. |
| 10 | **Seams inside the keys** (visible in the film, the slider and stills): the 5:2 / 5:3 frame boundary is a horizontal tone step across the facades at full-res row 6144 (Transbay towers, 2006 and today); sawtooth swept-shadow mask edges across streets; hard-edged dark patches on facades; a translucent ghost building in the 2006 key west of the Transbay site; today's objects left in past years (QA_eras_pilot3_1985: 12/23 random tiles structural, 6 anachronisms, 5 ghosts, 5 hard seams) | `sf_2006_now.jpg` (audit dir); QA report worst-10 list | `compose_hard.py`: the past year's AI inside a binary object mask over the next year's final; its shadow mask = the object swept down-sun (staircase edges); a building partly in the mask keeps two AI generations; flagged render fallbacks. |
| 11 | **Camera too wide** for the events (a 20 m building = 20-40 output px); the glide never stops on an event | whole film | cw 1600-3200 box px for a 1280 px frame. |
| 12 | Shimmer on static things: fixed in v3 (antialiased full-res crops, supersampling); residual now ~2-3 levels mean between aligned frames in the holds (0-1.5 s, 28.3-30.3 s) = resampling of a moving camera, not flicker | - | - |

Nothing else pops at random: outside the four key boundaries and the staged completions, no blob > 40 levels over > 60 px was found in a
single frame, and there is no global light or colour change between years except #2 (water) and the seams of #10.

## 2. The slider (eras.html?base=pilotai)

Snaps to the key years; a switch is a **250 ms cross-fade of whole changed tiles** (512 px), i.e. a ghost for a quarter of a second over
every changed tile, including the unchanged parts of those tiles. It inherits every key defect of #10. (A per-pixel order-map switch is
the cheap fix: see GRAMMAR.md §7.)

## 3. Files
- `AUDIT_worst_frames_v4.jpg` (this folder and `live_eras2/transitions/`): 11 events, native crops, 5 frames each.
- `/Volumes/DANI-SD-DRIVE2/transitions/audit/`: `v4_frames.csv` (per-frame residual), `v4_events.json` (top 200 pop blobs), `kinds_*.png`
  (kind maps per step: red rise, blue sink, yellow line, cyan shore, green grow, MAGENTA fade), `kinds_audit.json`, `holes.log`.

## 4. Found while building the fix (key level, root causes)

- **Today's landmarks leak into past keys.** `compose_hard.py` finds the changed objects by comparing the two years' **gid**
  passes; landmark models carry **gid 0** in both years, so a landmark that is new (Salesforce Tower, 181 Fremont, Millennium
  Tower) standing in front of another landmark (gid 0 too) is invisible to the mask and today's pixels stay in the past year.
  Measured in the Transbay window: 19 % of Salesforce's pixels, 18 % of 181 Fremont's and 48 % of Millennium Tower's (g137649)
  are byte-identical in the 2006 key and today (the white lattice "tower" behind the 2006 skyline is Salesforce's crown).
- **Static buildings change rendition between keys**: inside compose_hard's masks every building of the year is the year's own
  AI generation, so a building that stands in both years (1981, 1985 towers) has two different faces; 92 of 190 static buildings
  of the Transbay window differ on > 90 % of their pixels. Any transition then has to morph them.
- **Landmark models differ by snapshot**: today's render has newer landmark models (e.g. g137647, g142974 as landmarks) than the
  era renders (generic prisms), so the same 1981/1985 tower has two shapes.
- **Past-year water is another water**: the 2006 key's bay is the Blender fallback (light blue, own-render 58 % of the 5:2 mask),
  today's is the AI water: the whole bay jumps at the key year (film 28.32 s).
- **The L7 frame boundary (5:2 / 5:3, canvas row 6144)** is a tone step of 35-40 levels on average across the towers, plus a
  2-row line in the 2006 mosaic; the 5:x | 6:x boundary is a vertical step in the water.
- **Sanborn buildings with no demolition date** all go at one conventional year (1960): a key-to-key transition either pops
  them all at once or has to invent a wave.

## 5. Grading after the fix (random, not hand-picked)

Tools: `tools/vid_audit.py` (every frame aligned to the previous one; share of pixels jumping > 40 levels in one frame),
`tools/frame_sample.py` (seeded random frames, a random native 400x225 crop each, shown with the same crop 3 frames earlier),
and the QA tool on the consistent-key layers (below).

| | v4 film (before) | new film (after) |
|---|---|---|
| frames with > 1 % of the image jumping > 40 levels in one frame (pops) | 7 blocks of frames (key years 7.5 / 15.7 / 22.5 s, the bay at 28.3 s, staged completions) | **none**, except the one deliberate scene cut (Embarcadero -> Transbay, 30.0 s) |
| cross-fade share of the changed area | 22-40 % per step | **0** (every pixel is one year or the other; no blend of two keys) |
| joins between consecutive shots (same view) | n/a (one glide) | 0.06 % and 0.5 % of pixels > 40 levels (a building completed in the earlier key) |
| random frames, seed 7 (12 crops) | 3 structural (translucent towers #8 #9, a red roof wiped in #3/#4) | 0 structural; 2 cosmetic (#3 #4: flat cleared lots with straight edges) |
| random frames, seed 11 (12 crops) | 4 structural (#5 morph, #6 ghost block, #9 fade, #10 hard seam across a tower) | 0 structural, 0 cosmetic |
