# The GL port — plan, blocks, and the self-check at each step

**Goal, in Daniel's words:** the same page, drawn by the GPU, so it is fast on a
phone and beautiful on a desktop; a second URL so both can be browsed side by
side; and an engine that another city can use by pointing it at another
manifest.

**Started** 2026-08-26, after a night of measuring the Canvas renderer's
ceiling (`components/us/city/FILM.md` §"The night of 2026-08-26").

---

## 0. The two rules this plan is held to

1. **The old page does not move.** `/us/city/sf/the-city` keeps its renderer,
   its copy, its data and its behaviour. The new one is
   `/us/city/sf/the-city-gl`. Nothing in `components/us/city/` is edited except
   to *export* something the new engine can reuse.
2. **The engine has no city in it.** `lib/citygl/` may not contain the string
   `sf`, a San Francisco coordinate, or a San Francisco constant. Everything it
   needs arrives in a `CityDescriptor` — a data base URL and what the manifest
   at that URL says. A second city is a second descriptor. There is a test that
   greps for this.

## 1. What is reused, and what is rewritten

| | |
|---|---|
| **Reused unchanged** | `lib/city/data.ts` (chunks, tiers, the view queue), `lib/city/projection.ts` (the maths), `labels.ts`, `film.ts`, `time.ts`, the film payload, `block-records.ts`, the fiche, every string, every published file |
| **Rewritten** | the painter only: `scene.ts` + `renderer.ts` + the draw modules become GPU buffers and shaders |
| **New** | `lib/citygl/` — the engine; `components/us/citygl/` — the React mount and the 2D overlay |

## 2. The blocks, in order, with the weight each carries

The percentage is *of the whole port*, and it is reported to Daniel after each.

| # | block | what lands | weight | cumulative |
|---|---|---|---|---|
| 0 | **Skeleton** | `three` in the app; `/us/city/sf/the-city-gl` renders a GL canvas inside the same page shell; `CityDescriptor` and the no-city-in-the-engine test | 5 % | 5 % |
| 1 | **The ground** | city DEM + surround as one lit mesh, the bay as a surface with the published depth; the camera reproduces `projection.ts` **exactly** (asserted in a test, not by eye) | 15 % | 20 % |
| 2 | **The city** | all 166 k footprints extruded on the GPU, the massing tier for the wide camera, the same palette tables, the same year gate | 20 % | 40 % |
| 3 | **The light** | sun + sky, a real shadow map, ambient occlusion. **First visible quality jump — A/B here.** | 15 % | 55 % |
| 4 | **The writing** | the 2D overlay: labels, street names, the coastline line, the block picker, pan/zoom/keys | 10 % | 65 % |
| 5 | **The camera** | the film drives the GL camera; the year scrub; **and the tilted cinematic camera as an option** (the second visible jump) | 10 % | 75 % |
| 6 | **The detail** | roof form from the LIDAR statistics the file already ships, facade material by era, trees with their published crowns, terrain at full DEM resolution | 10 % | 85 % |
| 7 | **The phone** | quality tiers (shadow map off, half-res post, fewer trees), device-pixel policy, measured on an emulated phone | 10 % | 95 % |
| 8 | **The gate** | parity table (every camera, old vs new), docs, dead code removed, the switch documented | 5 % | 100 % |

## 3. What "on the right road" means, checked after every block

Each block ends with the same four questions, answered with numbers or
screenshots, never with an opinion:

1. **Is it faster?** One forced redraw and a sustained-fps window at every
   camera, old vs new, same machine, same page state.
2. **Is it the same city?** The parity screenshot pair at all four cameras.
   Differences must be ones I can name and defend.
3. **Is it more beautiful?** The A/B pair, at the cameras the block touches.
4. **Is the engine still city-free?** The grep test.

If a block fails 1 or 2 it is not finished. If it fails 4 it is not merged.

## 4. Explicitly out of scope

Weather, night, seasons, particles, a game loop, a new map projection for the
record view, any change to the published data, any change to the copy, any
change to what the record says. This is a rendering port with four measured
quality additions (light, camera, form, material).

## 5. Progress log

Appended as blocks land. Each entry: what landed, the four answers, the % of
the whole port.

---

### Block 0 — skeleton · landed 2026-08-26 · **5 %**

`three@0.180`, `/us/city/sf/the-city-gl`, `CityDescriptor`, `CityEngine`,
`camera.ts`, and the two tests that hold the port up.

1. **Faster?** n/a — nothing drawn yet.
2. **The same city?** `camera.test.ts` projects a grid of world points through
   BOTH paths at two cameras and asserts the same pixel to three decimals.
   Depth is asserted too, and it failed first time: `R x U` puts the eye below
   and north, which draws the same picture and orders depth backwards. The
   projection is left-handed — `SY` flips the screen's y and absorbed it — so
   the camera negates three things that cancel. Written down in `camera.ts`.
3. **More beautiful?** n/a.
4. **City-free?** `engine-is-city-free.test.ts` passes — and caught its own
   first false positive: a doc comment stating the rule. Comments are stripped
   before the grep now.

### Block 1 — the ground · landed 2026-08-26 · **20 %**

The city's DEM, the surround and the bay, as three meshes.

1. **Faster?** The frame is 3 draw calls and 199,034 triangles, and the draw
   costs **0.09–0.14 ms** at every camera. The Canvas path re-rasterises the
   same ground at 243 ms (whole city) to 1,678 ms (district), measured the
   same night on the same machine. Nothing here is per-camera work: the mesh
   is uploaded once and the camera is a matrix.
2. **The same city?** Yes, and proved by blending the two frames at 50 % on
   the same camera: the coastline is ONE line, Lake Merced is one lake, Golden
   Gate Park and Twin Peaks sit under their Canvas labels
   (`~/Desktop/sf-city-ab/GL-overlay-city.png`). The node colours are not
   re-derived — `TerrainField.node()` is read for the city and
   `rasteriseSurround`'s own formula for the surround — so where the two
   frames differ it is the renderer and never the palette.
3. **More beautiful?** Not yet, on purpose. Block 1 is parity.
4. **City-free?** Passes.

**Two traps, both found by looking:**
- The bay was placed half a unit below sea level so land would win the depth
  test. It also won against the SURROUND, whose sea-level nodes sit lower —
  Marin and the East Bay disappeared. In an axonometric projection a Y offset
  is also a SCREEN offset (79 px at the street camera), so the fix is
  `polygonOffset`: same plane, pushed back in the depth buffer only.
- The side-by-side pair misled me twice into thinking the two frames were at
  different scales. They were not. **Blend, do not compare** — a 50 % overlay
  answers registration in one look and a pair never does.

### Block 2 — the city · landed 2026-08-26 · **40 %**

All 166,166 published footprints, extruded, one mesh per chunk.

1. **Faster?** Frame cost, averaged over 90 forced redraws at each camera:

   | camera | GL frame | draw calls | triangles | Canvas rasterisation |
   |---|---:|---:|---:|---:|
   | whole city | **0.37 ms** | 142 | 2,524,030 | 243 ms |
   | district | **0.22 ms** | 35 | 814,507 | 1,678 ms |
   | block | **0.16 ms** | 13 | 493,497 | 1,233 ms |
   | street | **0.15 ms** | 11 | 488,185 | 162 ms |

   The call and triangle counts FALL as the camera closes in: that is the
   frustum culling a per-chunk mesh gets for free, and it is why the closest
   camera is also the cheapest. The Canvas path is the other way round.
2. **The same city?** Same skyline, same footprints, same measured roof
   colours — `bldgMaterials` reads the published rule out of `decodeBld`
   rather than restating it, and a dev probe confirmed the palette buckets
   land at 27–55 (`PAINT_C0 + paintIdx`) with 124 no-sample footprints, which
   is the Canvas path's own count. Two deliberate differences, both
   improvements: **the depth buffer replaces painter's order** (no sort, no
   128 depth bands, and a tower crown behind a nearer roof is now right), and
   **there is no massing tier** — the whole-city frame draws real buildings
   because it can afford to.
3. **More beautiful?** Not yet — Block 3's job. The whole-city frame aliases
   at DPR 1 where the Canvas draws smooth massing blocks; that is the
   trade for real geometry and it is Block 7's to tune.
4. **City-free?** Passes.

**Three traps, all costly, all now written into the code:**
- **A backtick in a comment inside a template literal ends the string.** Twice.
  GLSL lives in template literals; comments in it may not quote identifiers.
- **`#extension` is a WebGL 1 line** and must precede everything; three.js
  prepends a prologue, so writing it yields `ERROR: 0:60` and a black city.
  Derivatives are core in GLSL ES 3.00.
- **A custom `ShaderMaterial` does not get three.js's output colour
  conversion.** `MeshBasicMaterial` ends with `colorspace_fragment`; a raw
  shader writes linear straight to the framebuffer and the city comes out two
  stops dark. The ground looked right the whole time — it is a basic material —
  which is exactly what made it look like a palette bug. `#include
  <colorspace_fragment>` is the whole fix.

### Block 3 — the light, and the backend · landed 2026-08-26 · **55 %**

**Daniel, mid-block: *"just do webgpu directly please i want the max
improvements."*** So the renderer is `three/webgpu`'s `WebGPURenderer`, which
compiles from a node graph, takes WebGPU where the browser has it and falls
back to WebGL 2 by itself where it does not. That is not a bet against phones:
it is the same scene taking the better backend when there is one. Confirmed
live: `backend: "webgpu"`.

**The price was paid up front and it was worth it.** A hand-written
`ShaderMaterial` cannot cross that line — GLSL is not a node graph — so the
water layer was rewritten from a fragment shader into a BAKED TEXTURE, which
turned out to be the better design anyway: every term in it (published depth,
distance from downtown) is a function of world position and of nothing else,
so it was recomputing a constant sixty times a second. Every layer now uses
stock materials, which is also what lets the shadow pass substitute its own.

**And it fixed the bug I could not find.** On the WebGL path the shadow pass
allocated its map and then drew NOTHING — 142 draw calls, four compiled
programs, no depth program, every guard checked (`castShadow`, layers,
bounding spheres, frustum, `shadowMap.enabled`). On WebGPU the same scene
reports 283 calls and 4.9 M triangles: the shadow pass renders. An hour lost
in the old backend, closed by moving to the new one.

1. **Faster?** Frame cost at the block camera: 4.0 ms with the shadow pass,
   1.3 ms without (27 draw calls against 12). The shadow map is re-rendered
   only when the scene is dirty, so a held frame still costs nothing. Against
   the Canvas path's 1,233 ms rasterisation at the same camera.
2. **The same city?** Same geometry, same camera, same palettes. The LIGHT is
   deliberately different — that is the block.
3. **More beautiful?** Yes, and it is the first block where that is the point.
   Buildings throw real shadows across the street and onto each other, hills
   shade their own far slopes, and every face carries the light it should.
   `~/Desktop/sf-city-ab/GL-block.png`, `GL-street.png`.
4. **City-free?** Passes.

**Three findings worth the paragraph each:**
- **A WebGPU canvas cannot be screenshotted through the page compositor.**
  Playwright returned a blank frame while `renderer.info` reported 283 draw
  calls. `canvas.toDataURL()` reads the canvas itself and is correct on both
  backends. The harness does that now.
- **The ground's normals point straight up on purpose.** Its vertex colours
  already carry a hand-tuned hillshade off the full-resolution DEM; giving the
  mesh its true normals put a SECOND hillshade over the first, same direction,
  compounding — the city came back olive and waxy, like a satellite render.
  Flat normals mean the sun adds no shading of its own to the ground and does
  the one thing a hillshade cannot: the cast shadow.
- **three.js's lights are physical and divide by π.** Tuned by eye the
  renderer reads as "dark" and invites turning the SUN up, which blows the lit
  faces before it lifts the shadows. The three intensities are solved instead,
  from what a lit roof, a shadowed roof and a wall turned away from the sun
  should each be worth. The arithmetic is in `light.ts`.

### Block 4 — the writing and the controls · landed 2026-08-26 · **65 %**

A 2D canvas over the GPU one for everything a reader READS, and a
pointer/keyboard controller under it.

**Type is the one thing a GPU is worse at.** A GPU draws text from an atlas —
a picture of a glyph, sampled — and at these sizes that is a soft letterform
fighting the hinting the rest of the page gets free. So: the GPU draws the
world, a 2D canvas draws the writing, two elements in one stacking context.
The 2D canvas is `pointer-events: none`; the GPU canvas owns every gesture.

**And it is `lib/city/labels.ts`, unchanged.** `LabelGrid`, `placeNames`,
`StreetNamePass`, `buildHoodAnchors`, `drawHoodNames` take a `Frame` and do
not care who drew the ground. Given the same camera they make the same
decisions — same ink budget, same collision grid, same order (designated
landmarks, spine streets, DISTRICT CAPITALS, arterials, the rest, local
streets). A name lands in the same place on both pages, which is what makes a
parity pair readable at all.

The controls drop everything the Canvas ones carry for the raster's sake — the
inertia coast, the low-resolution slot, the lead-centre, the band freeze. A
frame costs a fraction of a millisecond, so a drag is: move the camera, draw.
What is kept is the part that is about the reader: **zoom about the pointer**,
solved exactly rather than eased, and a keyboard that can do what the mouse can.

1. **Faster?** The overlay is a few dozen strings a frame. The street SURFACE
   and the 4,895 centrelines are deliberately NOT here — those are geometry
   and belong on the GPU (Block 6).
2. **The same city?** The district frame now carries RUSSIAN HILL, CHINATOWN,
   NOB HILL, TENDERLOIN, SOUTH OF MARKET and MISSION BAY exactly where the
   Canvas page puts them (`~/Desktop/sf-city-ab/GL-district.png`).
3. **More beautiful?** Same type, better city under it.
4. **City-free?** Passes.

**Still open, and named rather than forgotten:** clicking a block to open the
record. The hit test wants the depth buffer or the Canvas path's own marching
`invAt`; it is Block 8's, with the parity gate.

### Block 6a — the canopy · landed 2026-08-26 · **70 %**

195,310 published street-tree crowns, instanced: one low-polygon canopy each
at the point the register puts it, the crown diameter its size bit gives it,
and the green of its species family. A sprite becomes a solid — it has a top
and a side, so the sun lights it, and it sits in depth, so a building in front
of it is in front of it.

**Frame cost, median of 40 forced redraws at each camera, WebGPU:**

| camera | median | p95 | draw calls | triangles |
|---|---:|---:|---:|---:|
| whole city | **2.4 ms** | 3.2 | 283 | 4,935,399 |
| district | **2.6 ms** | 3.5 | 136 | 3,550,728 |
| block | **2.4 ms** | 976.8 | 48 | 1,376,141 |
| street | **2.0 ms** | 2.5 | 34 | 1,216,773 |

The block camera's p95 is one frame — the first time that geometry enters the
frustum and its pipeline is built. The median is the steady state, and it is
the number a reader feels.

**Two measurements that changed the design, both of them expensive to learn:**
- **195,310 shadow casters cost 4,358 ms a frame.** With every crown visible
  and casting, the whole-city frame took four and a third SECONDS. The Canvas
  renderer draws no street tree below z = 1.55 (`trees.ts` §VZ_C0) and that
  rule is now honoured here as a visibility gate — not as a nicety but as the
  difference between 4,358 ms and 2.4.
- **And they do not cast at all.** Gated to the closest cameras, whole city
  came back to 1.9 ms and district to 2.4 — but BLOCK sat at 991 ms, because
  that frustum catches the most tree chunks and an `InstancedMesh` has no
  per-instance culling: every crown in a chunk re-renders into the shadow map
  whether it is on screen or not. What that bought was a metre of dapple.
  Buildings still cast, which is the shadow anybody looks at.

**And a bug that cost an hour and could not be seen.** `Matrix4.compose` reads
a quaternion's PRIVATE fields (`_x`, `_y`, `_z`, `_w`), so an identity written
as `{ x: 0, y: 0, z: 0, w: 1 }` and cast to the type compiles, runs, and
writes NaN into all nine rotation-and-scale components of every instance:
195,310 trees at valid positions with no size. Nothing drawn, nothing thrown.
The probe that caught it had to print the matrix.

### Block 6b — streets, walls and facades · landed 2026-08-26 · **80 %**

Daniel: *"the story is good but there's no streets, no textures."* Right on
both counts, and both are now in.

**The streets.** 22,191 published rights of way, each with the carriageway
ring inside it, triangulated onto the terrain so a street runs up Nob Hill
with the hill. The footway is not drawn and not invented: it is the part of
the right of way the roadway does not cover, and it appears because the two
are filled in different tones one over the other. The grid is what a reader
navigates by; without it every frame read as blocks floating on a field.

**Three rings a building, not two.** The first cut shared the roof ring
between the roof fan and the tops of the walls — one ring fewer, and it looks
like a saving. It is not: a wall then interpolates from its own colour at the
foot to the ROOF's colour at the top, so every wall in the city was a gradient
INTO the tar of its own roof and the whole frame went grey-brown. The third
ring carries the wall's colour lifted (`WA.wtop`) against the foot's dropped
(`WA.wbot`) — the Canvas renderer's own `wallGrad`, as geometry.

**And the facades.** One 64 px tile — a window recessed in its bay, a sill, a
floor band — tiled by the building's OWN modules: one repeat per bay across,
one per STOREY up, from the roll's published storey count. It is a MULTIPLIER,
not a picture: it darkens where an opening is and leaves the material colour
everywhere else, so the roll's use class and era still choose the colour and
this only says where the holes are. Roofs and walls are two index buffers over
one set of vertices — they need different materials and the vertex data is
uploaded once.

**Frame cost, median of 40 forced redraws:**

| camera | median | draw calls | triangles |
|---|---:|---:|---:|
| whole city | **3.7 ms** | 809 | 5,106,310 |
| district | **2.9 ms** | 296 | 3,593,707 |
| block | **3.2 ms** | 101 | 1,391,259 |
| street | **2.4 ms** | 70 | 1,230,595 |

**Ambient occlusion was tried and is off.** `GTAONode` is wired and
switchable, and with it on the block frame differs from the frame without by a
mean of 73.9 of 255 — it crushes almost everything to black. Not a parameter:
GTAO reconstructs a view position from depth assuming a PERSPECTIVE camera,
and this camera is orthographic by construction, because that is what makes
the projection reproduce `projection.ts` exactly. Left wired behind
`setPost(true)` for the day an orthographic-aware node exists; the contact
darkening in the meantime comes from the shadow map, which is geometrically
exact and cheaper.

**And a third structurally-typed cast that compiled and failed at runtime.**
`ShapeUtils.triangulateShape` strips duplicate end points with
`points[l-1].equals(...)`, so a contour of `{ x, y }` objects throws. Same
shape as the quaternion: TypeScript is happy with a value that has the right
FIELDS and no METHODS. Three times in one session — when this port hands a
three.js function a plain object, it is a bug until proven otherwise.

### Block 5a — the century rail · landed 2026-08-26 · **85 %**

Daniel: *"there's neither controls as you said there were (like the timeline)."*
Fair — what Block 4 gave was pan, zoom and the four stops. The TIMELINE is
this.

**The year is a draw range, and that is the whole design.** A century scrub has
to answer, sixty times a second, *what exists yet*. Rebuilding an index buffer
per year is a pass over 166,166 footprints; testing a year per vertex needs a
custom shader, which this port gave up deliberately — it is what broke the
shadow pass. So every layer is EMITTED IN YEAR ORDER and the set that exists in
any year is a PREFIX:

- **buildings** — undated first (a footprint the roll cannot date is drawn in
  every year), then by the roll's own year. `setDrawRange(0, n)`.
- **streets** — by the year the Board is recorded accepting the right of way;
  `yr` 0 means the record is silent and a silent street is drawn from the
  first year the map draws.
- **trees** — by planting year, and an `InstancedMesh` gate is even simpler:
  `mesh.count = n`.

Scrubbing is then one binary search and one number per layer. No upload, no
rebuild, correct at any frame rate.

**The undated trees are the record's own cliff, drawn rather than smoothed.**
`tkzw-k3nq`'s earliest planting date is 1955, so the file has nothing to say
about a tree standing in 1919. An undated crown is therefore emitted AT 1955,
not at "always": 1954 has no street trees and 1955 has all 125,234. Same
decision the Canvas renderer made and for the same reason — spreading them
across the dated cohort's curve would look better at every year and would put
a date on 125,234 trees no file gives one to.

**Measured**, district camera: today 3,593,707 triangles → 1950 1,677,607 →
1906 680,911, at 4.5–4.9 ms a frame throughout.

### And the visibility bug that mattered more than any of it

Daniel could not see the city at all — labels on white. Not a screenshot
artefact: **on the WebGPU backend the renderer draws the frame and the canvas
never reaches the screen.** Same page, same scene, same 809 draw calls and
5,106,310 triangles on both backends; `canvas.toDataURL()` returns a perfect
frame; the page composites nothing. On WebGL 2 the same frame appears normally.

So **WebGL 2 is the default and WebGPU is behind `?gpu=1`**. Nothing is lost:
three.js's node renderer compiles the same graph to either backend, so the
scene, the materials, the lights and the shadow pass are identical, and at 3 ms
a frame the CPU overhead WebGPU saves was never the constraint. The day the
compositing works it is one boolean.

**And it explains the earlier shadow mystery.** The shadow pass drew nothing on
WebGL back in Block 3 because every material was then a hand-written
`ShaderMaterial`, which three.js cannot substitute a depth material for. Once
the port moved to stock materials, WebGL 2 renders shadows too — 809 calls on
both backends. The bug was never the backend.

### Block 6c — the street detail · landed 2026-08-26 · **88 %**

Kerbs, traffic islands, stairs and the spine centrelines, all as GEOMETRY.

**A 2D context strokes; a GPU has no such primitive.** `THREE.Line` takes a
`linewidth` and the core profile of every desktop driver ignores it, so a kerb
asked for at 1.5 px arrives at 1 px on every machine for ever. So every line in
that layer is a quad strip laid on the ground with a width in WORLD METRES —
which is not a workaround but the honest form: a kerb is a thing of a certain
width standing in a certain place, and drawn that way it thickens as a reader
zooms in, which is what a kerb does.

Published columns only: `rdKerb` (one bit per roadway vertex — is the edge
leaving it a kerb, or just the outer edge of the right of way the roadway runs
along), `streetMisc()`'s 1,120 island rings and 268 stair runs, `streetLines()`
for the spines, and the widths taken as a fraction of the city's OWN published
medians (`fw_p50`, `w_p50`) rather than written as metres — so the same code
draws a different kerb on a city with different streets.

**And it does not do the wide shot, which is stated rather than hidden.** A
0.4 m strip is a third of a pixel at district zoom, and no setting of the
constant fixes that without drawing a kerb four metres wide. World-space
geometry cannot do what a pixel-width stroke does; the wide-shot network stays
a screen-space job.

### Block 7 — the phone · landed 2026-08-26 · **93 %**

**What a phone is short of is fill rate, not triangles.** A modern phone will
push five million triangles happily; it will not shade twelve million
fragments at device pixel ratio 3 with a 2,048 shadow map sampled nine times
each. So the tier moves the things a reader cannot name — the DPR cap, the
shadow map size, when the canopy starts being drawn, antialiasing — and leaves
the CITY whole. Nothing published is removed: every building, street and tree
the record puts on the ground is still on the ground.

The tier is not chosen from a user-agent string, which is a guess about a
device. It is chosen from the two numbers that decide whether this renderer is
comfortable — the fragment budget the device is asking for and its core count
— plus `pointer: coarse`, the one honest signal that a screen is being held.
`?q=low` / `?q=high` forces it, because a tier that cannot be forced cannot be
compared.

**MEASURED on an emulated iPhone 13** (390 x 438 CSS at DPR 2, WebGL 2, low
tier): **8.50 ms median**, 934 draw calls, 5,303,191 triangles, the whole city
loaded. The Canvas page cannot draw a frame at that viewport in under a second.

### Block 8a — clicking a block · landed 2026-08-26 · **95 %**

The hit test, ported from `scene.ts` §pick and made city-free. It marches the
ray through solids in the order it meets them — tall published footprints
first, then the block prism at the massing tier's own height, then the ground —
because a click lands on a BUILDING and a ground-plane intersection answers a
median 18.9 m away from the point aimed at.

Two constants in the Canvas version turned out to be facts about one city and
were re-derived from the block table itself: the snap radius (half a named
city's street standard → a tenth of the median block's root-area, which lands
at 10.2 m against the hand-set 10.5 without being tuned to), and the march
ceiling (a fixed 320 m → the pick grid's own sampled ground range). That is
what the city-free test is FOR: it does not just forbid a name, it surfaces the
places where a number was really a name.

The picked block is drawn on the 2D overlay rather than as GPU geometry — it
has to sit above everything including a tower standing on the block itself,
which is a special case in the renderer and two lines in the layer that is
already on top.

---

## 6. The honest parity audit — 2026-08-26

Daniel: *"I'd say you're not even at 50 % … all buildings look kind of the
same … it's a lot uglier than the old one."* Correct, and the percentages
above were measuring THIS PLAN's blocks rather than parity with the published
page. Enumerated from `scene.paint()` and `TheCityClient`, not from memory:

### Drawing passes

| pass | state |
|---|---|
| terrain, surround | done |
| bay (depth + gradient + fade) | done; **shoal band missing** |
| streets — surface, kerbs, islands, stairs, spines | done |
| buildings — mass, walls, wall grade, roof colour | done |
| trees | done |
| labels — places, district capitals, street names | done |
| paper grain | done |
| shadows | done (better than the original: a real map, not a translated copy) |
| **hero landmarks (14, 145 parts)** | **missing — this is "all buildings look the same"** |
| **published caps, masts, spires (478)** | **missing — the skyline has no crowns** |
| **pitched roofs (14,555 pre-1907 dwellings)** | **missing** |
| **roof trays / parapets** | **missing** |
| **bridges** | **missing** |
| **park rings, water bodies, canopy blobs** | **missing** |
| **coastline ink + rim** | **missing** |
| real facade openings | approximated by a tiled texture |
| massing tier | absent by choice — real buildings at every camera |
| screen-space AO | replaced by the shadow map |

### Page features

| feature | state |
|---|---|
| entry plate, method note, source footer | done |
| zoom stops, drag, wheel, keys | done |
| century rail | done |
| block picking | done — the panel behind it is not |
| **the block record panel** | **missing** |
| **the film (11 shots, transport, scan panel)** | **missing** |
| help row, hood rings, pins | missing |

**Honest position: drawing ~65 %, features ~40 %.** Performance is finished
and is not the constraint; FORM is. The old renderer's value is a decade of
hand-tuned form — the tray, the hip, the cap, the hero — and that is precisely
what a port gets last, because it is the part that is not mechanical.

### The bug Daniel found — "the terrain barely shows" · 2026-08-26

He was right, and it was one line of missing gating.

**The street SURFACE was drawn at full opacity at every camera.** The Canvas
renderer gates that tier on `streetsResolve`: below about two projected pixels
of right-of-way width it is not dispatched at all, and the network is carried
by centrelines alone. That is not an optimisation, it is what the picture
needs — `ST_C_FOOT` is a pale cream, the right of way is a large share of the
ground in the Sunset, the Richmond and the Excelsior, and painted solid at the
whole-city camera it covers the terrain, the parks and the fabric with a
bleached sheet. Going back in time then removed the buildings and the streets
and left what looked like bare paper, which is what he saw. Surfaces and kerbs
now draw from the district camera in.

**And the coast was a staircase.** Two fixes, and they are different
instruments on purpose:

- **The ink is a STROKE, on the 2D overlay.** The DEM's edge steps by 53.8 m,
  which is three or four PIXELS at the whole-city camera; a world-metre ribbon
  that covers that is 132 px at the closest camera. `drawShoreline` is the
  Canvas renderer's own pass, takes a `Frame`, and draws one line at one width
  at every zoom — which is what a coastline is on a drawn map.
- **The land is CUT to the published line.** Even-odd crossing against the
  coast rings, per cell centre, at build. Nesting comes free: a cell inside a
  lake ring counts two crossings, is not land, and the water below shows
  through — which is what a lake is.

### A claim I did NOT act on

The ground-detail agent measured, three independent ways, that
`TerrainField.elevM`/`maskAt` read the city DEM transposed (`k = gx*N + gy`
where the array is `k = gy*N + gx`) — which would be a bug in the PUBLISHED
page, not just the port. I tried to confirm it and could not:

- the three anchors the manifest publishes all sit near x = y, where a
  transpose barely moves anything — a useless test;
- correlation against the independent surround raster came out 0.647 as-read
  against 0.601 transposed, too close to call over 174 land points;
- the DEM's own argmax lands at (-122.478, 37.756) as-read and (-122.444,
  37.729) transposed, and the city's highest point is (-122.454, 37.738) —
  **neither reading hits it**, so the test does not separate them either.

Against that, the hills sit under their own labels on both pages. So the claim
is UNPROVEN and nothing was changed on its account. Recorded here because it
deserves a proper measurement — reading the raw array against a known
elevation, offline, rather than through a field that already applies the
indexing under test.

### What the two frames side by side actually said · 2026-08-26

Daniel put the GPU frame next to the published one. Four faults, each specific,
each found by reading the code the comparison pointed at rather than by
adjusting something until it looked better.

1. **The parks were never green.** `terrainRGB` has TWO rows — ordinary ground
   and PARK — and which row a node reads is `cellPark`, a per-cell byte the
   field does not fill itself. `scene.ts` fills it in one line by walking the
   published park rings; this port never did. The greens were in the ramp the
   whole time and nothing ever selected them, so Jefferson Square and Golden
   Gate Park were the same bleached cream as the street beside them.
2. **The roofs were a stop too dark.** `colourLUT` maps the whole roof palette
   through `roofTone` before using it — the desaturate-and-lift that makes a
   roof read as the sunlit top face rather than as tar. `roofShadeTable` used
   the RAW palette, so every roof in the GPU city was one to two stops below
   the same roof on the published page and blocks of them read as holes.
3. **The canopy rode on the rooftops.** The crowns baked their ground height at
   `zex = 3.3` while the footprints rewrite theirs for the current band. On a
   hill at 60 m that is 198 units against the buildings' 120 — seventy-eight
   units of lift, and the trees land on the roofs.
4. **The exposure was a stop low, and the first measurement of it was wrong.**
   Comparing frame means without cropping the Canvas capture compares a WHITE
   LEDGER PANEL: it put the published page's p90 at 249 and made the gap look
   twice its size. Cropped to the map, the real numbers are in `light.ts`, and
   the fill was re-solved against them — district now matches to a tenth of a
   level, block and street sit ~12 % below, and that residual is three things
   the published page does not have at all (cast shadows, a facade multiplier,
   tray decks shaded by their own parapets).

### Block 8b — the record behind the pick · **95 %**

`CityBlockPanel`, the published page's own, unchanged. A pick loads the block
index and its shard through `block-records`, which memoises both for the
session, and the panel gets the same `record` / `context` / `city` it gets on
the other page: the assessor id, the published neighbourhood joined on its
INDEX and never on its name, the published area, the Board's own decision with
its date and a link to the scan, and the decade rail. The port has no business
rewriting the surface a reader actually reads the record on.
