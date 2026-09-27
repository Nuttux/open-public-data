# The transition grammar (target): how things come and go between two key years

Goal (Daniel 26/09 20:55): buildings come and go like in a 2026 city-builder time-lapse or a documentary: each one on its own date,
built or torn down with physical sense; never a morph, a cross-fade, a smudge or a pop; the ground, streets, trees and water hold
still. Everything below is implementable from what we have: the AI keys (full res L8), the Blender gid/class passes of each key year,
the building records (footprint ring, height, year), the Sanborn lost buildings (gone_by), era.py's dates and conventions.

## 0. The model: a 2.5D stage built from the keys (no new AI, no new Blender for the in-between frames)

- **Geometry is known exactly.** The pyramid camera is a true orthographic camera (hq_city.py): world (x east, y north, z up, metres)
  to L8 device px: `X = 2((KX x - REFx) SZ + PCW/4)`, `Y = 2((REFy - KY y - ZT z) SZ + PCH/4)` = **5.342 px per metre east, 2.591 px
  per metre north (up the image), 4.672 px per metre of height**. A record's footprint ring + height gives its prism in image space:
  per image column, its ground span [Y_far, Y_near], its walls, its roof, and the height z of every pixel it covers.
- **Sun** (LOOK B, az 215, el 24): a point at height z casts its shadow `z * (6.89, -4.77)` px from its foot (L8). A building's shadow
  at any partial height is the footprint swept along that vector (exact, no staircase).
- **Objects.** For each step A -> B, every difference between the two keys is owned by exactly ONE object: a building born, a building
  gone, a linear structure (freeway, ramp, pier), a ground surface, a tree, a shore. Objects come from the gid/class passes and the
  records (a gid present in one key only; a stand-in replaced by its record on the same gid; a Sanborn lost building).
- **Sprites.** A born building's pixels = the later key where its gid is visible (occlusion by anything in front is thus already right);
  a gone building's pixels = the earlier key. Where a sprite is hidden in its own key by another CHANGING object, its facade is completed
  from its own visible pixels at the same height (floors repeat), so it can be shown while the other object is absent.
- **Plate** (what is behind): the other key wherever that key shows something that stays (78-92 % of a new building's pixels, measured).
  Where both keys show changing objects (a building replaced by another on the same lot: 3-12 % of the new pixels), the plate is the
  site: graded earth / gravel in the footprint, and behind it the completion of whatever stays there.
- **Painter's order**: far to near by the footprint's near edge (largest Y_near last); every object is clipped to its own sprite mask,
  so a partial building never covers what is in front of it.
- **No residual.** A pixel that differs between the keys and belongs to no object is a key defect, fixed in the keys (§6), never blended.
  The first and last frames of a step are the keys, byte for byte: no pop at key years.

## 1. Birth (K1): lot -> foundation -> structure floor by floor -> facade -> finish

Construction share f in [0, 1] over the building's window (§4). All stages derive from the building's own final pixels, so the last
frame IS the key (no completion pop).

| f | stage | what is drawn |
|---|---|---|
| 0.00-0.06 | **site** | the visible part of the footprint turns to graded earth (a quick wipe from the lot's centre outwards); trees, cars and kiosks on it go with it |
| 0.06-0.16 | **foundation** | a concrete mat spreads over the footprint along its long axis; a 1-2 px darker rim (shoring) |
| 0.16-0.86 | **structure** | the top height `hc` climbs **floor by floor** (3.0 m houses, 3.4 m mid-rise, 3.9 m towers): each floor takes the same time, moves for 70 % of it with a smoothstep and dwells 30 %; the whole climb eases in and out. Pixels with z <= hc - lag show the **finished facade** (the key's own pixels); the band hc - lag < z <= hc is the **open frame** (the facade darkened to 35-45 % and desaturated, with lighter slab lines every floor); the **top slab** is the roof shape moved down to hc (the key's roof pixels shifted by (H - hc) x 4.672 px, desaturated toward concrete). lag = 2 floors for mid-rise, 3-5 floors for towers. Towers >= 60 m: the core stands 1-2 floors above the slab (a small lighter block). |
| 0.86-0.95 | **topping out** | the crown / rooftop kit (pixels above the roof plane) rises last; the lag closes to 0 |
| 0.95-1.00 | **finish** | the top slab resolves into the final roof (a wipe across the roof, from the lit side), the site's ground outside the walls wipes to the later key (sidewalk, plaza, trees) |

- The **shadow** is recomputed every frame from hc: pixels of the later key's shadow switch from the plate (lit) to the later key
  (shaded) when hc passes the height they need, with a 1.5 m soft band (the penumbra). Receivers are exact for the ground, approximate on
  roofs (timing only; the final frame is the key).
- Short form (< 12 m, 1-3 floors): same stages, site + foundation 0-20 %, one visible step per floor.
- Cranes: PARKED (Daniel 16:50). The grammar leaves a hook: a crane stands from f 0.10 to 0.90 at the core.

## 2. Death (K2): stripped -> taken down from the top -> rubble -> cleared lot

| f | stage | what is drawn |
|---|---|---|
| 0.00-0.10 | **stripped** | the facade darkens 15 % and loses 30 % of its saturation (windows out, fenced) |
| 0.10-0.75 | **taken down** | the top edge hc sinks from H to 0, floor by floor, with a ragged edge (a fixed per-column jitter of +/- 1 floor); the removed part shows the plate; a **dust plume** rides the working edge (soft warm-grey puffs, alpha <= 0.35, lit from the south-west, drifting with a light wind, each puff a fixed seed per building). Buildings < 15 m **collapse** instead: the top drops with gravity (ease-in) over 0.25 of the window and a bigger dust cloud rises, spreads and settles over ~1 s. |
| 0.75-0.90 | **rubble** | the footprint shows a rubble pile (the building's own colours, broken, darker) that shrinks toward the lot centre |
| 0.90-1.00 | **cleared** | graded earth; then either the later key's ground wipes in (the lot becomes a plaza, a park, a street) or the lot waits for the next building (a birth whose site stage starts from this earth) |

Replacement on the same lot = death, a held cleared lot (at least 0.3 s on screen, longer when the calendar says years, e.g. Yerba Buena
1967-81 as parking), then birth.

## 3. Linear structures (K3), ground (K5), trees (K6), shore (K4)

- **Freeways, ramps, piers**: cut into spans (~30 m along the path, the Blender class/gid mask split by the path's arc length). Removal:
  spans go one after another from the sourced end (Embarcadero 1991: from the north), each span a 0.25 s K2 (the deck drops, a dust
  puff), then the ground below wipes to the later key along the path. Building: bents first (the span's lower half), then the deck.
- **Ground surfaces** (lot -> plaza, parking -> park, street realigned): a directional wipe along the region's long axis with a 1.5 m
  soft edge, timed with the building or structure event that owns it, else at its record date. Never a dissolve.
- **Trees**: born trees grow (scale 0.25 -> 1 about the trunk base, ease-out, 0.4-1 s); removed trees are felled (shrink to the base in
  0.15 s). Their pixels come from the key that has them; what is under them from the other key.
- **Shore / landfill**: water -> wet fill -> dry land from the old shore outward (film.py's shore order), over the sourced window.

## 4. Timing, stagger, easing

- **Dates decide when** (sourced or the record + era.py conventions): completion `yc = year + 0.1 + 0.8 u(gid, 9)`, build window
  `era.rise_years(h)` (LANDMARK_SITES where sourced: Salesforce 2013.24-2017.0); a death happens in `[gone_by - d, gone_by]` (Sanborn),
  or just before the site stage of the building that replaces it; an undated death gets a fixed draw inside the step.
- **Film pace**: the calendar maps to film time by a monotone curve: ~0.5-1 year/s while something the caption names is happening,
  3-5 years/s through quiet years, holds of 0.8-1.5 s on the key years. Each object keeps its calendar order.
- **Minimum screen time** per object: a birth 0.7 s (a house) to 1.7 s (150 m and up), a death 0.6 s to 1.0 s (60 m and up); an
  object whose window is shorter in film time is stretched around its centre (a CONVENTION on the screen, never on the caption).
- **Easing**: smoothstep for moves, ease-in (gravity) for collapses, ease-out for growth and dust spreading; no linear ramps, no
  overshoot on buildings.
- **Stagger**: at most ~3 starts per 0.1 s in any 300 px neighbourhood; beyond, the starts are spread over +/- 0.3 s by a fixed per-lot
  draw (row houses on one block face go up one after another along the street).

## 5. Camera

- A time-lapse shot holds still or glides slowly (<= 2 % of the frame width per second, ease-in-out, zoom <= 10 % over a shot); it never
  moves while a hero rise is in its structure stage.
- Frame the event: the rising or falling object fills 25-60 % of the frame height; for the pilot film, cuts between 3-4 framed
  districts instead of one wide glide.
- One resampling per frame from the full-res composite (antialiased), 2x supersampling for moving shots; a still camera is exact (no
  shimmer by construction).

## 6. The keys themselves (the root of the smudges and seams)

- A past key = the next key byte for byte, except inside **object-exact** masks: the changed objects' own pixels (gid/class passes of the
  two years), their geometric shadows (footprint swept along the sun vector, not the down-sun staircase), and changed ground regions.
- **Life** (cars, boats, people) never makes a region "changed"; anachronistic life is handled apart.
- Water, where the class is water in both years, is the next key's (today's) water: no water colour jump between years.
- A frame or block boundary is invisible inside a key (the L7 frame seams at full-res row 6144 in 5:2/5:3 are a key defect to fix).

## 7. The slider

Same objects, no frames: per changed tile, an 8-bit **order map** (each pixel's switch time inside the step: per object, by height for
births (bottom first) and deaths (top first), along the path for lines) + the plate tile; the viewer switches pixels A -> B by
`order < f` (a WebGL/canvas threshold, no alpha blend). Dragging then plays the same staggered grammar; no 250 ms whole-tile fades.

## 8. As built tonight (eras2/transitions/, CPU only)

- `stage.py` the pyramid camera (world <-> canvas), keys (fin3 mosaics, L7 frames 4-6 x 2-3, seam tone fix at L7 boundaries),
  passes, records (DataSF + Sanborn + landmark sites). `objects.py` the prisms of a year exactly as hq_city picks them, and an ID
  map rasterised with a per-pixel surface depth (agrees with the real gid pass on 87 % of its pixels; the rest are landmark
  models and roof shapes).
- `prep.py <yA> <yB> <window> <out.pkl> [B.npy] [A*.npy]` one step: objects (born / died, spans of viaducts), dates (records,
  era.py conventions, SOURCED windows, clearance waves), plates, shadows (height each pixel needs), and **A\***, the consistent
  earlier key: B on everything that did not change, A on what did. Rules that remove the smudges at their root:
  - **leaks**: where the two years' renders differ (or the later render has a structure the earlier one has not) but the earlier
    key equals the later year's ORIGINAL key, the earlier key copied it (compose_hard missed gid-0 landmarks and structures
    classed as street, e.g. the 1959 freeway inside the 1938 key): the year's own render, fitted to the key's colours and
    brought to the tone around the patch, replaces it (a flatter patch, never a ghost);
  - **shadows** from geometry: a gone building's shadow = its footprint swept along the sun on the visible ground, laid with one
    shade ratio per object (luminance x a chroma factor within 6 %); a new building's shadow lifted off B with the same kind of
    ratio; a registry per chain makes the ratio used to lay a shadow (later step) the one used to lift it (earlier step);
  - leaks are **regions**: closed inside each changing object, and an object that leaked on more than a quarter of its pixels is
    replaced whole (the 1985 freeway in front of the Ferry Building: a coherent deck instead of a patchwork); a leaked building
    takes its own floors from where it did not leak before the render is used;
  - a **tree planted later** (a tree in the later render, none in the earlier) is inpainted away from the earlier key (exact copy
    or translucent ghost);
  - a **pure light change** on ground no changing object shades (compose_hard's staircase shadow masks) is dropped;
  - **water** that is water in both years, **floating life** (boats and wakes not touching land), and the water under a
    structure built later over it, are the later key's water;
  - **black pipeline holes** in a past key are inpainted at load; the tone step at every L7 frame boundary is spread over 96 px.
- `run_chain.sh <window> <dir>` the keys from today back to 1938, each step's A\* the next earlier step's B: consecutive shots
  join without a jump (no key-year pop).
- `render.py <prep.pkl> <plan.json>` the frames: plate, background switches (shadows by height, ground by date with a wipe),
  objects drawn on scratch buffers and kept by a per-pixel depth test, stages of §1-§2, dust puffs, film-time windows with
  minimum screen times, focus windows for captioned events. `film.sh` renders the shots of `film/shots.json` and cuts them.
- `kstar_pilot.py <dir> <jobs>` the consistent keys of the whole pilot, tile by tile (an L8 frame + margins, the chain today ->
  1938), and the slider's **order maps** (per pixel, the moment of the step it switches); `build_pyr_tr.py` their pyramids and
  order tiles; `viewer/eras_tr.html` the slider: at z8 and closer every pixel switches at its own moment while scrubbing (a
  building rises from its base, a gone one goes from the top, a lot with its building), no blend; zoomed out, the old fade.
- `render.py` camera: eased glides between plan keys (`cam`: [film s, centre x, centre y, width]), <= ~2 % of the width a second.
- Not built: cranes (parked), tree growth (K6: trees switch with their ground), order maps below z8 in the slider.
