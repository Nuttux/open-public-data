# The projection and the camera

`projection.ts` and `camera.ts` are the pure-arithmetic core of the city map:
world metres → a plane → screen pixels, and the camera that moves over it.
Ported from `scratchpad/sf-city-anim/gen/part3.html` §projection/§CAMERA,
`nav/camera.js`, `nav/nav.js` and `nav/glue.js`.

No DOM, no data, no React. That is deliberate — the parts that are easy to get
wrong (zoom-toward-pointer, the pan clamp, where a rasterised buffer lands) are
the parts that can be asserted headlessly, and they are, in
`projection.test.ts` and `camera.test.ts` (52 tests).

---

## The one equation everything rests on

```
proj(x,y,z)  →  plane            depends on bearing, tilt, ZEX, ZEXB. Nothing else.
sx = (p0 − cam.cx)·cam.scale + W/2
sy = H/2 − (p1 − cam.cy)·cam.scale
```

Step two is a **pure similarity transform**. So for a fixed projection, any two
camera states differ by a scale and a translation — which is exactly what
`drawImage()` does for free. That is why a pan or a zoom can be a blit of an
already-painted buffer instead of a re-render, and why the LOD band (which
moves `ZEX`, which moves `proj`) is **frozen for the duration of a gesture**.

`camera.test.ts` asserts this as a property, not as a comment: a buffer painted
at camera A and blitted for camera B puts every world point within 1e-9 px of
where a direct render at B would have drawn it.

---

## Module surface

### `projection.ts`

| | |
|---|---|
| `ROT_DEG` = 315 | the bearing. North-up. |
| `CA` = cos 30° | the horizontal half of the 2:1 dimetric. Never a dial. |
| `SA_DEFAULT` = 0.42 | the tilt = the camera's elevation, asin(sA/cA) = 29.01° |
| `SA_FRAMING_FLOOR` = 0.4099 | the measured bound sA may not cross |
| `ZEX_BY_STEP` = [3.3, 2.6, 2.0] | terrain exaggeration, per LOD band |
| `ZEXB_DEFAULT` = 1.6 | built-height exaggeration = `ZEX_ART` in `art/iso.py` |
| `DEM_CELL_M` = 53.8, `HIT_STEP_M` = 9.3 | the hit test's yardstick |
| `class Projection` | `proj` `projb` `depth` `invAt` `coeffs` `isAxisAligned` `elevationDeg` `groundLineDir` `marchStepZ` `setTilt` `setRotation` `setBand` `onRebuild` |
| `projection` | the singleton the renderer reads |
| `proj` `projb` `depth` `invAt` | free functions over the singleton |
| `SX` `SY` `screenToPlane` | plane ↔ screen |

`ViewCamera` (`{cx, cy, scale}`) is declared here and implemented by `Camera`,
so `SX`/`SY` need no import from `camera.ts` and the two files do not cycle.

### `camera.ts`

| | |
|---|---|
| ladder | `ZSTEPS` `MINZ` `MAXZ` `DETAIL_PXM` `BANDS` `bandOf` `SNAP` |
| clamp | `PAD` `clampAxis` |
| extent | `CityExtent` `cityBBox` `cityBBoxByBand` `fitCity` `LEDGER_W` `FILL` |
| camera | `class Camera` — `z` `maxScale` `presetScale` `strip` `clamp` `zoomAt` `panBy` `centreOn` `home` `snapTarget` `syncStep` `freezeBand` `thawBand` `bandStale` |
| keys | `KEY_QUANTUM` `quantiseForKey` |
| blit | `slotSize` `planSlots` `place` `covers` `decideRaster` `decideRasterExternal` `leadCentre` `zoomLeadScale` |
| gesture numbers | `wheelFactor` `easeZoom` `easeOutCubic`, plus the margins, DPRs, inertia and key-pan constants |

---

## The findings that had to survive the port

Each of these cost days to find. They are in the code as block comments where
the next person will hit them; this is the index.

1. **The bearing is 315°, so the projection is axis-aligned.** screen-x depends
   only on world-x, screen-y only on world-y, and `depth()` reduces to √2·y.
   North-up was chosen from published maps over the better-composed 210°
   Currier & Ives camera, because at 210° the peninsula reads as a beige blob.
   A building shows its roof and **one** wall, facing down-screen.
   → `isAxisAligned()`, and three tests including one that shows 210° is not.

2. **`sA = 0.42` is not a taste choice.** `sin φ = sA/cA`, so the camera sits
   at 29.01°. The number is set by `functional.py` §17, which requires San
   Francisco to fill 0.72 of the frame's height at whole-city zoom; measured,
   it crosses 0.72 at sA = 0.4099. 0.42 is the *deepest camera at which the
   city still fills its own frame*, with 2.4 % of margin. `tilt/BLOCK-TILT.md`.

3. **`ZEXB = 1.6` is `ZEX_ART` in `art/iso.py`** — the vertical the thirteen
   hand-drawn landmarks were drawn at (`art/ART-SPEC.md` §1.1). Changing it
   stretches every dome in the set against the city around it. The tilt was
   taken out of `sA` precisely so this number would not have to move.

4. **Screen-x contains no `sA` at all**, so a tilt change moves the roof and
   never the wall height, the width, the position or the silhouette. This is
   *the reason `sA` is the right lever*, and it is asserted over 922,797 points
   with byte-identity, not closeness.

5. **A pixel floor is a step in the derivative** and is behind every float and
   lurch bug this project has had — the landmark sprite float, the `gszV` zoom
   lurch that drew 46 m as 89.8 m and *released* at `cam.scale` 0.1087, a scale
   sitting strictly between two presets so a wheel zoom passed straight through
   it. Use continuous curves. `wonder/BLOCK-WONDER.md` §3.1.

6. **Anything continuous in `cam.scale` inside a layer cache key invalidates
   the buffer mid-gesture** and makes zoom jumpy. Quantise the *key*, never the
   *value* — `quantiseForKey`, a 32nd, which is what the shipped tier ramp uses.

7. **The pan clamp's world box depends on `sA` and `ZEXB`**, and in the mock it
   was baked once at load in an IIFE. Left stale it did not throw and it did
   not draw wrong; it made `clamp()` pull the camera toward a city that was no
   longer there, and the only symptom was zoom-toward-the-pointer missing by
   67 px. Here the fix is **structural**: `cityBBox()` is one function, and the
   fit and the clamp both read it, so a box that is stale for one is stale for
   both and there is no silent half. `cityBBoxByBand()` is `NAV.rebuildBBOX()`.

8. **The hit test's march step is a world distance, not a height.** It was
   `const dz = 2`, justified in metres that were only true at one tilt and one
   ZEX. It is now `marchStepZ()` = `min(4, 9.3 / |d(x,y)/dz|)`. The accuracy is
   **the same** under both rules and the port does not claim otherwise — what
   changed is that a constant whose own justification was a function of two art
   dials is no longer free to drift when one of them moves.

9. **Canvas 2D is deferred.** Timing a draw into a detached canvas measures JS
   only and has fooled three agents here into shipping a regression as a win.
   Count rAF, or force a flush with `getImageData(0,0,1,1)` *inside* the timed
   region. Written into the buffer-plan comment, where the next person timing a
   raster will be standing.

---

## Assertions carried over, verbatim

Where `gen/functional.py` states a property, it is a unit test and **its
sentence is kept word for word**, so a failure still reads like the note
someone wrote when they found the bug.

| test | from |
|---|---|
| `TI1 the tilt is a stated camera elevation, and the object's own dial is untouched by it` | §32 |
| `TI2 the tilt cannot move a building sideways — screen x has no sA in it` | §32 |
| `TI3 nothing on the page keeps a projection of its own — a round trip through another tilt restores every table exactly` | §32 |
| `TI4 the pan clamp's box is the box the projection actually draws — at every LOD band, after a tilt change` | §32 |
| `TI5 zoom is still toward the pointer once the camera has been tilted` | §32 |
| `TI6 the hit test samples the ground at a fixed WORLD distance, well inside one DEM cell, at every zoom band and every tilt` | §32 |
| `zoom is toward the pointer, exactly — the thing under the cursor stays there, at every window, before the bound` | §27 |
| `...and where the bound does move it, the whole of that movement is the bound and nothing else` | §27 |
| `the city cannot be dragged off the screen` | §27 |
| `...but at whole-city zoom it can still be dragged` | §27 |
| `the camera stops at the detail ceiling, and it is absolute` | §31 |
| `...and the fourth named stop is that ceiling` | §31 |

§27's zoom clause was split in two by Block TILT and both halves strengthened:
`zoomAt` ends in `clamp()`, and the clamp is a *different rule*. The split
asserts (a) the arithmetic with the bound taken out, at three viewports, and
(b) that the whole of any residual is the bound and nothing else — which the
single number could not say, because a residual of zero cannot distinguish "the
clamp did not bind" from "the clamp moved the camera and something else moved
it back".

---

## What is not here, and why

- **The DOM half.** Pointer, wheel, key and touch listeners; canvas allocation;
  `requestAnimationFrame`; the host contract from `nav/glue.js`. It belongs to
  the React shell (P4). Every *number* those listeners feed and every *decision*
  they make is here, so the shell is wiring and not judgement: `wheelFactor`,
  `easeZoom`, `easeOutCubic`, `DRAG_THRESH`, `SETTLE_MS`, `INERT_*`, `KEY_*`,
  `planSlots`, `decideRaster`.
- **Two things the shell must carry that are not arithmetic** — documented at
  `planSlots`: `getContext("2d", {alpha:false})` is *correctness*, not an
  optimisation (10.3 % of pixels off by exactly 1 level across the bay
  otherwise), and the surround colour must be filled before the blit or a fast
  flick shows raw canvas at the frame edge.
- **The gesture state machine** (`advance`/`settle`/`wire`) and the band
  cross-fade compositing. Both need a clock and a canvas.
- **`fitCity`'s terrain sampling.** `CityExtent` is an interface;
  `data.ts` (another agent's file) supplies the DEM walk. This module never
  imports data.

### Ported with a deliberate difference

- `cityBBoxByBand()` computes each band against a **scratch `Projection`**
  sharing the live dials, rather than mutating the shared instance's `ZEX` and
  restoring it as `nav/glue.js` did. Same numbers; no window in which a
  subscriber could observe a projection that was only ever a temporary.
- `setTilt`/`setRotation`/`setBand` **raise a typed rebuild event** instead of
  calling a hardcoded list of rebuild functions by name. The mock's `setTilt()`
  had to know about `buildBldProj`, `NAV.rebuildBBOX`, the tree sprite sheet and
  the layer cache keys; here the modules that hold derived tables subscribe.
  `band` is a distinct reason from `tilt` because a band change moves `ZEX`
  only, and tables pre-projected at z = 0 survive it.
- **TI3 is adapted, and this is stated in the test.** The original walks six
  named pre-projected vertex tables on the page. There are none in this module —
  they are P3's — so what is asserted is the property those tables depend on:
  the dial is restorable *exactly*, so a sweep leaves nothing behind.
- **TI2's point cloud is generated, not the published rings.** Same count
  (922,797) and a seeded generator, so a failure is reproducible without
  shipping 3 MB of footprints into a unit test. The property — byte-identity of
  screen x across a tilt sweep — is unweakened.

### Not portable, and not faked

`functional.py` §17's framing measurement (San Francisco fills 0.72 of the
frame) is a **pixel measurement off a rendered page** and cannot be a unit test
of this module. What is asserted instead is the relationship it produced:
`SA_DEFAULT > SA_FRAMING_FLOOR`, with 2 % of margin, and the measured crossing
recorded as a named constant. The real clause comes back at P6, in Playwright,
against a rendered frame.
