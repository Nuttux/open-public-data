/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/roof-grain.ts — A ROOF IS A MATERIAL, NOT A SWATCH.

   `lib/city/buildings.ts` §THE ROOF GRAIN states the rule and the reason:

     *"A roof at street zoom is 200 px of one flat value. `roofs.ts`
     §NOTHING_IS_PLACED_ON_A_ROOF stands: no vents, no skylights, no invented
     object. This is not an object, it is the surface — a fine stipple, the
     tooth of gravel-and-tar or the grain of a membrane, in the roof's own
     colour a step darker, at low alpha. A texture claims nothing about what
     is on the roof; it says the roof is a material and not a swatch."*

   The Canvas path draws it as a `CanvasPattern` fill at `ROOFGRAIN_ALPHA`
   over every roof wider than `ROOFGRAIN_MIN_PX`. This is the same 48 px tile,
   the same 150 marks, the same seeded sequence — as a texture.

   ── THE TILE IS IN WORLD METRES, AND THAT IS THE PORT ────────────────────
   The Canvas pattern is in SCREEN space: 48 CSS px whatever the camera. A
   mesh is built once for every camera it will ever be seen from, so the tile
   has to be a size on the GROUND. It is set to the world size the published
   tile covers AT THE CAMERA THE GRAIN IS FOR — the street stop, whose scale
   this project measures at 0.3103 m per CSS pixel (420 m of span across
   1440 x 0.94 px). 48 x 0.3103 = 14.9 m.

   And `ROOFGRAIN_MIN_PX` then needs no port at all. It is a cut-off that says
   *do not draw a stipple you cannot resolve*; a mipmapped texture does that
   by construction — as the roof shrinks, the mip chain averages the marks
   into the tile's own mean, which is 0.993, and the grain fades out instead
   of turning into noise. Same integral, computed by the sampler.

   ── IT CAN ONLY DARKEN, WHICH COSTS HALF THE PUBLISHED TILE ──────────────
   `facade.ts` §THE ONE THING A MULTIPLY MAP CANNOT DO records this from the
   other end: a `map` multiplies the material's own colour, and an 8-bit
   texture's ceiling is 1.0, so a mark BRIGHTER than the surface is not
   drawable. The published tile is 70 % black marks at alpha 0.55 and 30 %
   WHITE ones at 0.7, both composited at 0.16.

   So the marks are all drawn dark, at the value that gives the tile the same
   ROOT-MEAN-SQUARE deviation as the published one rather than the same
   per-mark alpha — which is the quantity a stipple is actually read by:

     coverage           150 marks, r 0.35..0.85 px on 48 px    0.0740 of area
     published rms      sqrt(.7*.0740*(.16*.55)^2
                             + .3*.0740*(.16*.70)^2)           0.0260
     one-sided mark     rms = sqrt(0.0740) * a  ->  a =        0.0956

   `1 - 0.0956 = 0.9044`, and the tile's mean is `1 - 0.0740*0.0956 = 0.9929`
   — seven tenths of one per cent under the roof's own value, which is under
   the quantiser of the 8-bit frame it lands in and is not compensated for
   anywhere. Stated so that nobody later reads a 0.7 % darkening as a bug.

   ── AND NO SECOND UV SET ─────────────────────────────────────────────────
   `layers/buildings.ts` shares one vertex array between the roof indices and
   the wall indices, and the walls' `uv` counts bays and storeys. But the ROOF
   RING and the roof-form vertices are referenced by roof triangles and by
   nothing else, so their `uv` is free: the layer writes world metres into it
   for those vertices only, and both maps sample channel 0. A `uv1` over
   6.95 M vertices would have been 56 MB for a stipple.
   ═══════════════════════════════════════════════════════════════════════ */

import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping } from "three";

/**
 * The tile's side in world metres — the published 48 CSS px tile at the scale
 * of the camera the grain is drawn for. See the header.
 */
export const ROOF_GRAIN_M = 14.9;

/** the published tile's own side, CSS px — `roofGrainPattern`'s `T` */
const TILE_CSS_PX = 48;

/**
 * How many texels the tile is drawn at. The published tile is 48 CSS px and
 * the marks in it are sub-pixel (r 0.35..0.85), so drawing at 48 texels would
 * quantise a 0.35 px dot to nothing. 256 is 5.33 texels per published pixel,
 * which keeps the smallest mark two texels across; the mip chain does the
 * rest and costs 256 x 256 x 4/3 bytes once.
 */
const TILE_PX = 256;

/** `roofGrainPattern`'s own count and radii, in the published tile's pixels */
const MARKS = 150;
const R_MIN = 0.35;
const R_SPAN = 0.5;

/**
 * The one-sided mark's darkening. MEASURED against the published tile's
 * root-mean-square deviation — the header has the arithmetic. NOT the
 * published per-mark alpha, because half the published marks are lifts and a
 * multiply map cannot lift.
 */
const MARK_V = 0.9044;

let tex: CanvasTexture | null = null;

/**
 * The stipple, as a repeating texture in the renderer's working space.
 *
 * Built once for the process and shared by every chunk — 139 copies of one
 * 256 px tile is 139 uploads of the same image. Returns null where there is
 * no canvas to draw on (a test runner, a server render), and the caller then
 * has a roof with no map, which is the flat fill this replaces.
 */
export function roofGrainTexture(): CanvasTexture | null {
  if (tex) return tex;
  if (typeof document === "undefined" && typeof OffscreenCanvas === "undefined") return null;
  const cv: HTMLCanvasElement | OffscreenCanvas | null =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(TILE_PX, TILE_PX)
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
  if (!cv) return null;
  cv.width = TILE_PX;
  cv.height = TILE_PX;
  const g = (cv as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D | null;
  if (!g) return null;

  /* the multiply map's identity: white leaves the roof's own colour alone */
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, TILE_PX, TILE_PX);

  /* THE SAME SEQUENCE THE PUBLISHED TILE DRAWS. `roofGrainPattern` seeds an
     LCG with 0x2545f491 and takes three draws per mark — x, y, radius — then
     a fourth that chooses between the dark mark and the light one. The fourth
     draw is still TAKEN here even though its answer is not used, so the
     sequence stays in step with the published tile's and the marks land in
     the same places. */
  let seed = 0x2545f491;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const k = TILE_PX / TILE_CSS_PX;
  const byte = Math.round(MARK_V * 255);
  g.fillStyle = `rgb(${byte},${byte},${byte})`;
  for (let i = 0; i < MARKS; i++) {
    const x = rnd() * TILE_CSS_PX;
    const y = rnd() * TILE_CSS_PX;
    const r = R_MIN + rnd() * R_SPAN;
    rnd(); // the published tile's dark/light choice — see above
    g.beginPath();
    g.arc(x * k, y * k, r * k, 0, Math.PI * 2);
    g.fill();
  }

  tex = new CanvasTexture(cv as unknown as HTMLCanvasElement);
  /* WRAPPING, NOT AN ATLAS CELL: the layer's roof `uv` is world metres over
     `ROOF_GRAIN_M` and runs to hundreds. `facade.ts` §THE TILE COMES OFF THE
     ATLAS AS ITS OWN TEXTURE is the same finding for the walls. */
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  /* NO `SRGBColorSpace`. This is not a colour; it is a multiplier on one, and
     three would otherwise decode 0.9044 as if it were an sRGB byte and hand
     the shader 0.796 — a stipple four times the depth it is written for. */
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  /* ── A ROOF IS A HORIZONTAL PLANE UNDER A SHALLOW CAMERA ────────────────
     Which is the worst case there is for texture filtering, and it is why the
     stipple was the thing shaking. This projection looks down at about 35
     degrees, so one screen pixel on a roof covers a long thin footprint in
     texture space — many texels along the view direction and few across it. A
     mip chain alone answers that by dropping to a level coarse enough for the
     LONG axis, which throws away the short one and then resolves differently
     as the footprint slides: sparkle. Anisotropic filtering is the correction,
     and 4 samples is not enough for this angle.

     16 is this GPU's own maximum, read from `MAX_TEXTURE_MAX_ANISOTROPY_EXT`
     rather than assumed, and three clamps it to whatever a weaker one reports.
     The bay took the same fix for the same reason — see `layers/water.ts`
     §THE BAY NEEDS MIPMAPS. Daniel, watching a pan: *"its mostly roofs
     shaking."* */
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/** for a test or a teardown that wants the next call to rebuild */
export function disposeRoofGrain(): void {
  tex?.dispose();
  tex = null;
}
