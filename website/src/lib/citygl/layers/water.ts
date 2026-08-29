/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/water.ts — THE BAY, AS ONE BAKED SURFACE.

   ── WHY THIS IS A TEXTURE AND NOT A SHADER ───────────────────────────────
   The Canvas renderer draws the water as three stacked CPU plates — a radial
   bay gradient, a shallows wash, a bathymetry blit — plus a fourth pass for
   the distance fade, each rebuilt whenever the camera moves far enough.

   Every one of those four is a function of the WORLD POSITION and of nothing
   else: the published depth at that point, and how far that point is from
   downtown. Not of the camera, not of the year, not of the zoom. A quantity
   that depends only on where it is can be computed ONCE, into a texture, and
   sampled for ever.

   The first cut here was a fragment shader, which is the obvious thing and
   was wrong twice over: it recomputed a constant sixty times a second, and a
   hand-written `ShaderMaterial` is invisible to every renderer feature that
   substitutes its own material — a shadow pass, a normal pass — and to the
   WebGPU backend, which compiles from a node graph and not from GLSL.
   Baking removes the shader, so this layer works unchanged on both backends
   and costs one texture fetch.

   ── WHAT IS PUBLISHED AND WHAT IS DECLARED, UNCHANGED ────────────────────
   `lib/city/water.ts` §THE BAY HAS A FLOOR is the argument and it carries
   over word for word: the DEPTH at every node is published, the ramp's stops
   are that distribution's own quantiles, and the ramp's direction is the
   page's own shoal-to-open step. Declared: the spread, the deep tail and the
   fade. `depthRamp`, `depthM` and `depthColour` are read from the Canvas
   module rather than restated, so the two renderers put the same colour on
   the same square metre of bay.

   ── THE FADE IS THE SAME CIRCLE, WRITTEN THE OTHER WAY ROUND ─────────────
   `drawDepthHaze` builds a radial gradient in SCREEN pixels out of `kx`, the
   pixels-per-metre factor — so what it actually describes is a circle in the
   WORLD: transparent inside 3,400 m of downtown, `WA.hazecap` at
   3,400 + 15,000 x cap metres. As a world distance it is camera-independent
   by construction, which is a whole class of rebuild gone.

   ── AND THEN IT WAS THE LARGEST FLAT AREA IN THE FRAME ───────────────────
   The bay is roughly 40 % of the whole-city picture. Three things were wrong
   with it and each has its own section below: the depth was sampled NEAREST
   (§THE BLOCKS WERE THE DEPTH GRID), the plate quantised a slow gradient to
   eight bits with no dither (§THE BANDS), and the surface had no event on it
   at all — no glint, and no mark where it meets the land (§THE GLINT,
   §THE FOAM).

   ── AND THE PLATE DID NOT KNOW WHERE THE WATER WAS ──────────────────────
   Everything above describes the plate's COLOUR. Its SHAPE was two triangles
   over an 80 km square, drawn under everything, on the assumption that the
   ground would cover the land. That assumption is the whole of §THE PLATE IS
   CUT and it was wrong by 22.5 km2. Read that section before changing the
   geometry back.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";

import type { CityData } from "@/lib/city/data";
import { projection } from "@/lib/city/projection";
import {
  BAY_OPEN,
  BAY_SHOAL,
  DEPTH_UM,
  decodeCoast,
  depthColour,
  depthM,
  depthRamp,
  depthU,
  depthU_stops,
  type WaterMeta,
} from "@/lib/city/water";
import { HAZE, WA, lerpHex } from "@/lib/city/terrain";
import { axonBasis } from "../camera";
import { rasteriseRings, type CoastMask, type Lattice, type Ring } from "../coast-mask";
import { SUN_SCENE } from "../light";
import type { CityLayer } from "../engine";

/** the two radii `drawDepthHaze` and `bayPlate` are written in, in metres */
const FADE_R0_M = 3400;
const FADE_SPAN_M = 15000;

/**
 * How finely the baked plate is sampled.
 *
 * The plate is not the survey: it reaches `reachM` past it so nothing beyond
 * the bathymetry is a hole, which makes it about 80 km on a side. At the
 * original 1024 that is 78 m a texel — 7.4 SCREEN pixels at the whole-city
 * camera, which is coarse enough that the linear filter's own ramps read as
 * Mach bands. 1536 puts it at 52 m and 4.9 px, for 9.4 MB of texture; past
 * that the bake starts to cost a visible hitch at load for a gradient the
 * dither has already fixed.
 */
const BAKE_W = 1536;

/* ── THE FOAM ─────────────────────────────────────────────────────────────
   Where the water meets the land the published page has a pale rim under the
   shoreline ink (`water.ts` §THE RIM), drawn on the LAND side: *"a model's
   edge meets its resin"*. It has nothing on the water side, because a 2D
   context that repaints the bay inside a corridor does not need one.

   This does. With the ground now cut at the published line
   (`terrain.ts` §THE COAST) the shore is a hard geometric edge between two
   flat colours, and an edge between two flat colours is the one thing a
   drawing of water must not have. The wash is a band on the WATER side of
   that edge, at full strength on the waterline and gone `FOAM_OUT` metres
   out — see `buildFoam` for why it is a distance FIELD and not a ribbon.

   Every number here is DECLARED, not published: no register carries a surf
   width. 55 m is the smallest band that survives the whole-city camera —
   5.3 px there — and it is a plausible surf line at the district camera,
   where it is 26 px. */
const FOAM_OUT = 55;
/** the wash's alpha ON the waterline; it reaches zero at `FOAM_OUT` */
const FOAM_A = 0.34;
/** the falloff's exponent — above 1 the wash hugs the line instead of hazing out */
const FOAM_FALL = 1.6;
/** how far toward white the published shoal tone is carried */
const FOAM_WHITE = 0.38;
/* ── AND SURF DOES NOT HAPPEN ON EVERY SHORE ──────────────────────────────
   The wash above is a distance from land and nothing else, so it was drawn at
   the same strength on every metre of coastline the city has. That is wrong in
   a way that shows: the Embarcadero is piers and seawall inside a sheltered
   bay, there is no surf there at all, and a 55 m band at full strength round
   every pier head reads as a WHITE HALO. It is the same complaint the ribbon
   version earned — *"a glow rather than as surf"* — arriving by a second route
   after the first was fixed.

   What separates Ocean Beach from the Embarcadero is not depth and not the
   shape of the shore, it is FETCH: how much open water the wind and swell have
   had to work across before they arrive. Ocean Beach faces ten kilometres of
   open Pacific inside this frame's own lattice; the Embarcadero has the entire
   city to its west.

   So exposure is measured, on the land mask this function already builds, as
   the run of open water lying WEST of each cell — one sweep per row, which
   costs nothing. It is a PROXY and it is declared as one: the prevailing swell
   at this coast runs from the west-north-west, a single westward scan is a
   coarse stand-in for that, and none of this is a claim about surf anywhere.
   What it does is stop the frame drawing breakers in a harbour. */
const FETCH_FULL_M = 6000;
/** how sharply exposure climbs with fetch — over 1 keeps sheltered water calm */
const FETCH_POW = 1.35;
/** the lattice the union land mask is scanned onto, metres — see §THE FOAM */
/* ── AND 25 m WAS TOO COARSE TO BE A GRADIENT ───────────────────────────
   The wash is 55 m wide, so at a 25 m grid it crossed from full to nothing in
   about two cells — a two-step ramp, and with the node's min-of-four filter on
   top of it that reads as flat plateaus with hard sides. Rendered alone at the
   Marina at a 1,100 m camera it was a stair-stepped pale mass lying over the
   harbour, which is what Daniel saw as a hard-edged band and what a bisect over
   the scene could not find, because this mesh is a CHILD of the bay plate and
   never appears in `scene.children`.

   At 12 m the same 55 m band gets four and a half cells, which is a ramp. It
   costs about four times the cells — the shore is a curve through a grid, so
   the count goes as 1/cell, not 1/cell squared.

   MEASURED on the shipped registers, at 12 m, over the whole survey box and
   therefore over Marin and the East Bay as well as San Francisco: **115,164
   cells, 149,732 vertices, 230,328 triangles** (`foamStats()`). An earlier
   revision of this note said "about 51,000"; that figure is not reproducible
   against what ships and has been replaced by one that is. */
const FOAM_CELL = 12;

/* ── THE GLINT ────────────────────────────────────────────────────────────
   A flat plane under an ORTHOGRAPHIC camera cannot have a specular
   highlight: the view direction and the light direction are both constant, so
   `dot(n, h)` is one number over the whole bay and the plate would simply be a
   different flat colour. What makes real water glitter is that it is NOT
   flat — the facets of the swell turn toward the half-vector and away from it,
   and the eye reads the ones that turn toward it as light.

   So the field this bakes is the SWELL, and the glint is where its facets
   point at the sun. Three sinusoids, wavelengths 2,300 / 1,150 / 610 m — long
   enough that a 52 m texel resolves them (12 texels on the shortest) and short
   enough that the whole-city frame holds a dozen of them. That is a swell at
   the scale of a chart rather than of a photograph, which is the register this
   page is drawn in.

   The two directions are taken, not invented: `light.ts` §aimKey swings the
   sun's AZIMUTH round to the camera's screen-right and keeps its published
   HEIGHT, and `camera.ts` gives the view axis for the fixed bearing. Both are
   read here rather than restated, so a change to the sun moves the glint. */
const WAVES: readonly { lam: number; deg: number; amp: number; ph: number }[] = [
  { lam: 2300, deg: 24, amp: 1.0, ph: 0.0 },
  { lam: 1150, deg: -13, amp: 0.55, ph: 1.9 },
  { lam: 610, deg: 41, amp: 0.3, ph: 3.7 },
];
/** how sharply the lobe closes — 3 lights roughly an eighth of the open bay */
const GLINT_P = 3;
/** how far toward white a fully lit facet is carried */
const GLINT_GAIN = 0.17;

/* ── THE RANGE, AND WHERE EACH END OF IT COMES FROM ──────────────────────
   Daniel: the water is *"completely one-dimensional at every point"*. It is
   not, quite — the published NOAA bathymetry is in the plate and the Golden
   Gate channel, the Alcatraz shoal and the Berkeley flats are all there. But
   MEASURED over a 340 x 180 patch of open bay at the whole-city camera, the
   frame's own pixels: p5 to p95 of luminance is 41.8 of 255, standard
   deviation 12.8. That is a range the eye reads as one colour with a slow
   wash across it.

   The DEPTH is published and stays published: `depthColour(depthM(...))` is
   the same call, on the same survey, at the same quantile stops. What is
   widened is how far apart the two ENDS of that ramp sit, which is a drawing
   convention and was already declared as one — `lib/city/water.ts`
   §DE_SPREAD: *"how far apart the tones sit is this port's reading"*. These
   two tones are DECLARED here, and named so nothing mistakes them for a
   register: the deep end goes toward navy and the shoal end toward teal, by
   a fraction of how far this point's `u` is from the field's own mean `u`.

   NOT USED, and deliberately: distance from the shore. `lib/city/water.ts`
   already measured it against the published depth — corr = 0.303, r2 = 0.092
   — and calls the shoal band *"a DECLARED TREATMENT, never a depth claim"*.
   The bathymetry is on the wire; there is no reason to model what is
   published, and every reason not to. */
const BAY_DEEP = "#2c4a76";
const BAY_TEAL = "#9ecfcb";
/** how far the deepest published water is carried toward `BAY_DEEP` */
const DEEP_MIX = 0.5;
/** and the shallowest toward `BAY_TEAL` */
const SHOAL_MIX = 0.34;

/* ── THE SKY ON THE WATER ─────────────────────────────────────────────────
   A horizontal plane under an orthographic camera has ONE view angle, so a
   Fresnel term over a flat bay is a constant and would only make the water a
   different flat colour — the same argument §THE GLINT makes about specular.
   What varies is the same thing that varies there: the SWELL tips each facet,
   and a facet tipped away from the eye is seen at a grazing angle and returns
   more of the sky.

   So this is Schlick's own form, `(1 - cos)^5`, over the swell's normal
   rather than over a flat one, in the tone the far distance is already
   painted in. It is the counterpart of the glint: the glint is where the
   swell faces the SUN, this is where it faces the SKY, and they land on
   different facets because the sun is 35.26 degrees up and the sky is
   everywhere else.

   `SWELL_S` is the steepness the height field is read at — DECLARED, and the
   only free number here. No register publishes a sea state. At 0.16 the
   normal wanders about 9 degrees, which is a light chop and not a storm. */
const SWELL_S = 0.16;
/** the tone a grazing facet returns — declared; the page's own distance tone
 *  carried a third of the way to white, so it belongs to this palette */
const SKY_ON_WATER = 0.33;
/** how much of that tone a fully grazing facet takes */
const FRESNEL_GAIN = 0.5;

/* ── THE RIPPLE ───────────────────────────────────────────────────────────
   The plate is 52 m a texel, so the finest thing it can hold is about 100 m
   across: chop at the scale of a chart, which is what §THE GLINT bakes, and
   nothing at all at the street camera where a 100 m feature is 93 px wide.
   Detail that survives every zoom has to be a texture tiled in WORLD units
   rather than baked into an 80 km plate, so it is one — a seamless field of
   crest highlights, repeated every `RIPPLE_M` metres, drawn additively over
   the plate by a child mesh that shares the plate's own cut.

   ── IT DOES NOT MOVE, AND THAT IS THE DECISION ─────────────────────────
   `temporal.ts` accumulates frames and has NO neighbourhood clamp, so
   anything that moves smears through the accumulation and ghosts. Two ways
   out: add the clamp, or hold still. This holds still. The clamp is the right
   fix for the accumulator and it is worth doing, but it is a change to a pass
   every other layer depends on, and buying moving water with it would be
   spending another agent's risk on this layer's ornament. A static crest
   field also costs one draw and no per-frame work at all, which is what the
   rest of this file is built on: quantities that depend only on where they
   are get computed once. */
const RIPPLE_M = 96;
/** the tile's resolution — 96 m over 256 texels is 0.375 m a texel */
const RIPPLE_TEX = 256;
/** how bright a crest is added at full strength */
const RIPPLE_A = 0.1;
/** the largest quad the crest mesh emits, metres — see `rippleMesh` */
const RIPPLE_STEP = 400;

/* ── AND THE BAY WAS EQUALLY CHOPPY EVERYWHERE, WHICH IS WHY IT TILED ──────
   The crest field above is a good tile — directional, seamless, no DC term —
   and it was laid across forty kilometres of water at ONE amplitude. Two
   things follow from that and they are the same thing.

   The obvious one is that a 96 m tile at the district camera repeats about
   every thirty pixels, and a regular repeat at that spacing does not read as
   water, it reads as a PATTERN FILL. Reported from the page: *"water, ocean,
   river jus tlooks like someone took a crayon and drew on a paper."*

   The less obvious one is why the eye finds the repeat at all. Real water seen
   from above is not evenly textured: wind comes in patches, so there are calm
   sheets and chopped sheets next to each other, hundreds of metres across,
   and the eye reads THOSE first. Give it none and the only structure left to
   find is the tile.

   So the crest is modulated by a smooth field at roughly a kilometre and a
   half, which puts glassy water beside chopped water and leaves the tile with
   nothing regular to be seen by. It is an AUTHORED treatment on top of an
   authored ornament — the same status the crest field already has, and it is
   not a claim about the wind or the water anywhere. */
const CHOP_M = 1400;
const CHOP_MIN = 0.3;
const CHOP_MAX = 1.6;

/* ── AND THE TILE ITSELF, WHICH THE MODULATION ALONE DID NOT CURE ─────────
   With the chop patches in, the bay stopped being evenly textured and still
   read as printed cloth, because the thing the eye was finding was never the
   amplitude — it was the PERIOD. The crest tile is a sum of sinusoids on a
   96 m square, so every 96 m the identical arrangement of streaks comes back,
   and a regular diagonal hatch at that spacing is a WEAVE, not water.

   Amplitude cannot fix a period. What does is warping the coordinate the tile
   is read at: offset the crest field's own uv by a smooth field far larger
   than the tile, and the lattice bends. The streaks keep their length, their
   direction and their scale — everything that made the field read as chop in
   the first place — and the repeat stops arriving on a straight grid, so
   there is no longer a regular anything to lock onto.

   The warp is much longer than the tile on purpose. Short and it shears the
   streaks inside a single quad; this length puts well under half a tile of
   drift across the 400 m quads the mesh is emitted at. */
const WARP_M = 2600;
const WARP_TILES = 1.6;

/** smooth value noise on a metre grid, deterministic in the city's own hash */
function smoothNoise(x: number, z: number, m: number): number {
  const fx = x / m;
  const fz = z / m;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const tx = fx - i0;
  const tz = fz - j0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(i0, j0);
  const b = hash2(i0 + 1, j0);
  const c = hash2(i0, j0 + 1);
  const d = hash2(i0 + 1, j0 + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** how hard the crest field is driven at this point: calm sheet to chopped */
function chopAt(x: number, z: number): number {
  const n =
    smoothNoise(x, z, CHOP_M) * 0.65 +
    smoothNoise(x + 9137, z - 4271, CHOP_M * 0.42) * 0.35;
  return CHOP_MIN + (CHOP_MAX - CHOP_MIN) * n;
}

export interface WaterLayerOptions {
  /** the fade's centre — the city's own downtown, from its manifest */
  anchor: readonly [number, number];
  /** how far out the plane reaches, world metres, beyond the survey */
  reachM?: number;
  /** a finer sea floor, if the city ships one — see §AND THE SEA FLOOR */
  bathy?: Bathy | null;
}

/**
 * A finer sea floor than `base/water0`'s own grid.
 *
 * One byte a node over the surround's box, `0` meaning land or at/above mean
 * high water, and the same decoding rule the published chunk already uses so
 * `depthM` reads both. `world` is the grid's own rectangle in the city's
 * frame, carried on the file so the two cannot drift apart.
 */
export interface Bathy {
  readonly w: number;
  readonly h: number;
  readonly dmax: number;
  readonly world: readonly [number, number, number, number];
  readonly dep: Uint8Array;
}

/** on unless `?bathy=0` — the published chunk is always the fallback */
const BATHY_ON = ((): boolean => {
  if (typeof window === "undefined") return true;
  return !/(?:\?|&)bathy=0(?:&|$)/.test(window.location.search);
})();

/**
 * Fetch the finer sea floor, or null if this city does not ship one.
 *
 * Absence is not an error and not a fallback path to maintain: it is the old
 * behaviour, byte for byte, because the layer simply reads the chunk instead.
 */
export async function loadBathy(base: string): Promise<Bathy | null> {
  try {
    const [mr, br] = await Promise.all([
      fetch(`${base}/base/bathy.json`),
      fetch(`${base}/base/bathy.bin`),
    ]);
    if (!mr.ok || !br.ok) return null;
    const meta = (await mr.json()) as {
      w: number; h: number; dmax: number;
      world: [number, number, number, number];
    };
    const buf = await br.arrayBuffer();
    if (buf.byteLength !== meta.w * meta.h) return null;
    return {
      w: meta.w, h: meta.h, dmax: meta.dmax, world: meta.world,
      dep: new Uint8Array(buf),
    };
  } catch {
    return null;
  }
}

function rgb255(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * THE SUN THIS SURFACE ACTUALLY SEES.
 *
 * `light.ts` §aimKey: the rig keeps the published sun's HEIGHT — which is what
 * sets the length of every shadow — and takes the camera's own screen-right
 * for its AZIMUTH, so that a wall lit down one face and the shadow it throws
 * do not read as two suns. The bearing is fixed, so screen-right is a
 * constant and this is the same three lines, evaluated once.
 */
function aimedSun(): Vector3 {
  const R = axonBasis(projection).R;
  const out = Math.hypot(SUN_SCENE.x, SUN_SCENE.z);
  return new Vector3(R.x * out, SUN_SCENE.y, R.z * out).normalize();
}

/** a deterministic hash in [0,1), for the dither — see §THE BANDS */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ═══════════════════════════════════════════════════════════════════════
   §THE PLATE IS CUT — WHY THE BAY WAS LYING ACROSS THE PORTOLA.

   Daniel, looking at Silver Ave: *"weird af"* — large blue polygons across
   whole city blocks, with buildings standing up out of them. There is no
   water there. It is not a canal, a ring winding or an unhandled hole: the
   plate was two triangles over the whole world at y = 0, and it relied
   ENTIRELY on the ground being drawn on top of it. Wherever the ground is
   missing, the bay is what you see.

   And the ground is missing over a fifth of San Francisco. `base/terrain`'s
   `mask` and `base/coast`'s rings both come from DataSF `txuc-3kzm` and they
   do not agree. MEASURED against the city's own published neighbourhood
   rings (`base/hood-rings.json`), cell by cell on the 260 x 260 DEM lattice:

     Visitacion Valley       84.1 % of its cells not in the DEM mask
     Bayview Hunters Point   82.8 %
     Treasure Island         64.4 %
     Portola                 62.7 %
     Potrero Hill            31.8 %
     Lakeshore               25.2 %
     ... 35 neighbourhoods at 0.0 %

   7,768 of 41,546 cells — **18.7 %, 22.5 km2** — lie inside a published San
   Francisco neighbourhood and outside the DEM's land mask. `layers/terrain.ts`
   builds only where `maskAt` is true, so it builds nothing there, and this
   plate showed through every gap the blocks, streets and roofs left. That is
   the whole of the defect, and the DEM hole is NOT this file's to fix — it is
   recorded here because this file is where it was found.

   ── SO THE PLATE ASKS A WATER REGISTER INSTEAD OF ASSUMING ──────────────
   The cut is the same question `terrain.ts` §THE COAST asks, answered the
   other way round, on the same lattice at the same `K` so the two edges
   interlock instead of racing:

     water  =  NOT inside (the city's own ring UNION the regional hydrography)
               OR the cell is `cityOffshore`

   The second clause is not a fudge and it is not ours: `txuc-3kzm` is a LEGAL
   boundary that runs kilometres into the Pacific and straight across the
   Golden Gate, and `base/surround-coast.json` publishes one bit per city cell
   for *"more than `city_pad_m` = 300 m outside the TIGERweb land polygon"* —
   which is exactly the rule `TerrainField.maskAt` already applies to decide
   the same cells are not ground. Without it the cut would delete 21.9 km2 of
   real open water inside the county line.

   Beyond the city's own lattice the plate stays whole: the far shore is
   painted by `layers/surround.ts`, which draws OVER this (renderOrder -3
   against -4), so there is nothing there for a cut to fix.
   ═══════════════════════════════════════════════════════════════════════ */

/** the plate's rectangle, world metres: x0, y0, x1, y1 */
export type Box = readonly [number, number, number, number];

/**
 * `terrain.ts`'s own `COAST_K`. The two files cut the SAME rings on the SAME
 * lattice, so this number has to be that number: at a different K the land's
 * staircase and the water's would fall on different sub-cell lines and leave a
 * seam of background between them.
 */
const CUT_K = 6;

export interface CityCut {
  readonly lat: Lattice;
  readonly mask: CoastMask;
  /** the published bit: this cell is more than 300 m outside TIGERweb land */
  offshore(i: number, j: number): boolean;
}

/** what the cut removed, so the header above can be re-measured */
export interface PlateStats {
  /** sub-cells of the city lattice the registers call water */
  waterSub: number;
  /** and land — the ones this plate no longer paints */
  landSub: number;
  /** merged rectangles emitted for the city lattice */
  rects: number;
  triangles: number;
}

/** the city's own DEM lattice, out of the published projection block */
function cityLattice(data: CityData): Lattice | null {
  const p = data.manifest.proj;
  const num = (k: string): number | null =>
    typeof p[k] === "number" ? (p[k] as number) : null;
  const X0 = num("X0");
  const Y0 = num("Y0");
  const s = num("s");
  const N = num("N");
  if (X0 === null || Y0 === null || s === null || N === null || s <= 0 || N < 2) {
    return null;
  }
  const cell = 1 / s;
  return { x0: X0, y0: Y0, nx: N - 1, ny: N - 1, cellW: cell, cellH: cell };
}

function cityCut(
  data: CityData,
  cityRings: readonly Ring[],
  sc: { rings: readonly Ring[]; cityOffshore(i: number, j: number): boolean },
): CityCut | null {
  const lat = cityLattice(data);
  if (!lat) return null;
  const sets: (readonly Ring[])[] = [];
  if (cityRings.length) sets.push(cityRings);
  if (sc.rings.length) sets.push(sc.rings);
  /* ONE REGISTER IS NOT ENOUGH, for the same reason `terrain.ts` §maskFor
     gives: the county outline alone calls the whole Pacific inside the county
     line land, and the regional hydrography alone calls the pier field water.
     With one in hand the honest plate is the uncut one. */
  if (sets.length < 2) return null;
  return {
    lat,
    mask: rasteriseRings(sets, lat, CUT_K),
    offshore: (i, j) => sc.cityOffshore(i, j),
  };
}

/**
 * THE PLATE, AS RECTANGLES.
 *
 * With no cut this is the two triangles it always was. With one, the city's
 * own lattice is replaced by the sub-cells the registers call water, and the
 * rest of the plate is the four bands around that lattice.
 *
 * ── WHY RECTANGLES AND NOT ONE QUAD PER SUB-CELL ────────────────────────
 * The lattice is 259 x 259 cells at `CUT_K` = 6, so 1,554 x 1,554 sub-cells:
 * a quad each is 2.4 million of them for a surface that is FLAT and whose
 * only varying quantity is a texture coordinate linear in world position. Two
 * sub-cells side by side and one rectangle spanning both rasterise to the same
 * pixels. So runs are merged along a row and then down the rows — the ordinary
 * greedy two-pass merge — and the open bay collapses to a handful of quads
 * while the shoreline keeps every step.
 */
export function plateGeometry(
  box: Box,
  cut: CityCut | null,
): { geo: BufferGeometry; stats: PlateStats | null; rects: number[] } {
  const [bx0, by0, bx1, by1] = box;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const Y = 0;
  const su = 1 / (bx1 - bx0);
  const sv = 1 / (by1 - by0);
  let rects = 0;

  const box4: number[] = [];
  const rect = (rx0: number, ry0: number, rx1: number, ry1: number): void => {
    if (rx1 - rx0 <= 0 || ry1 - ry0 <= 0) return;
    box4.push(rx0, ry0, rx1, ry1);
    const b = pos.length / 3;
    pos.push(rx0, Y, ry0, rx1, Y, ry0, rx1, Y, ry1, rx0, Y, ry1);
    uv.push(
      (rx0 - bx0) * su, (ry0 - by0) * sv,
      (rx1 - bx0) * su, (ry0 - by0) * sv,
      (rx1 - bx0) * su, (ry1 - by0) * sv,
      (rx0 - bx0) * su, (ry1 - by0) * sv,
    );
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    rects++;
  };

  let stats: PlateStats | null = null;

  if (!cut) {
    rect(bx0, by0, bx1, by1);
  } else {
    const { lat, mask, offshore } = cut;
    const K = mask.K;
    const KK = K * K;
    const lx0 = Math.max(bx0, lat.x0);
    const ly0 = Math.max(by0, lat.y0);
    const lx1 = Math.min(bx1, lat.x0 + lat.nx * lat.cellW);
    const ly1 = Math.min(by1, lat.y0 + lat.ny * lat.cellH);
    // the four bands around the cut lattice — whole, because the far shore is
    // painted over this rather than cut out of it
    rect(bx0, by0, bx1, ly0);
    rect(bx0, ly1, bx1, by1);
    rect(bx0, ly0, lx0, ly1);
    rect(lx1, ly0, bx1, ly1);

    const W = lat.nx * K;
    const H = lat.ny * K;
    const wet = new Uint8Array(W * H);
    let waterSub = 0;
    for (let j = 0; j < lat.ny; j++) {
      for (let i = 0; i < lat.nx; i++) {
        const n = offshore(i, j) ? 0 : mask.countIn(i, j);
        if (n === KK) continue;
        if (n === 0) {
          for (let sj = 0; sj < K; sj++) {
            const r = (j * K + sj) * W + i * K;
            for (let si = 0; si < K; si++) wet[r + si] = 1;
          }
          waterSub += KK;
          continue;
        }
        for (let sj = 0; sj < K; sj++) {
          for (let si = 0; si < K; si++) {
            if (mask.at(i, j, si, sj)) continue;
            wet[(j * K + sj) * W + i * K + si] = 1;
            waterSub++;
          }
        }
      }
    }

    /* the greedy merge. `open` holds the rectangles still growing downward,
       keyed by their sub-column span, so a run that repeats on the next row
       extends the one above it instead of starting a second quad. */
    const sw = lat.cellW / K;
    const sh = lat.cellH / K;
    let open: { c0: number; c1: number; r0: number }[] = [];
    const closeRect = (o: { c0: number; c1: number; r0: number }, r: number): void =>
      rect(
        lat.x0 + o.c0 * sw,
        lat.y0 + o.r0 * sh,
        lat.x0 + o.c1 * sw,
        lat.y0 + r * sh,
      );
    for (let r = 0; r <= H; r++) {
      const runs: { c0: number; c1: number; r0: number }[] = [];
      if (r < H) {
        const row = r * W;
        let c = 0;
        while (c < W) {
          if (!wet[row + c]) { c++; continue; }
          const c0 = c;
          while (c < W && wet[row + c]) c++;
          runs.push({ c0, c1: c, r0: r });
        }
      }
      // both lists are sorted by c0, so this is one merge walk
      let a = 0;
      let b = 0;
      const next: { c0: number; c1: number; r0: number }[] = [];
      while (a < open.length || b < runs.length) {
        const o = open[a];
        const u = runs[b];
        if (o && u && o.c0 === u.c0 && o.c1 === u.c1) { next.push(o); a++; b++; }
        else if (o && (!u || o.c0 < u.c0)) { closeRect(o, r); a++; }
        else if (u) { next.push(u); b++; }
      }
      open = next;
    }

    stats = {
      waterSub,
      landSub: W * H - waterSub,
      rects,
      triangles: idx.length / 3,
    };
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  const n = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
  geo.setAttribute("normal", new BufferAttribute(n, 3));
  geo.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingSphere();
  return { geo, stats, rects: box4 };
}


/* ── THE CREST FIELD, GENERATED ONCE ──────────────────────────────────────
   A seamless tile: sums of sinusoids whose wave numbers are WHOLE numbers of
   cycles across the tile, which is what makes it wrap without a seam, sharpened
   so the bright part is a thin crest rather than an even swell. No DC term —
   the tile's mean is subtracted and only the positive half is kept — because
   this is added to the plate and a constant would simply lift the whole bay.

   Deterministic: the phases come from a fixed hash, so two loads of the same
   city get the same water.
*/
function bakeRipple(n: number): DataTexture {
  const px = new Uint8Array(n * n * 4);
  /* THE WAVE NUMBERS ARE CLUSTERED, NOT SCATTERED. The first cut used eight
     directions spread over the circle and it came out as scattered white
     specks — snow, not water. Chop has a DIRECTION: the crests are long lines
     across the wind and the eye reads the line, not the dot. So every
     component here runs within about 20 degrees of the same heading and the
     amplitudes fall off with wave number, which is what makes long streaks
     with short detail riding on them. */
  const COMP: readonly { cx: number; cy: number; amp: number }[] = [
    { cx: 1, cy: 5, amp: 1.0 },
    { cx: 2, cy: 7, amp: 0.75 },
    { cx: 1, cy: 8, amp: 0.6 },
    { cx: 3, cy: 11, amp: 0.42 },
    { cx: 2, cy: 13, amp: 0.3 },
    { cx: 4, cy: 17, amp: 0.22 },
    { cx: 5, cy: 23, amp: 0.15 },
    /* two long ones ACROSS the crests, so the streaks break into runs instead
       of banding the whole tile */
    { cx: 3, cy: -1, amp: 0.34 },
    { cx: 5, cy: -2, amp: 0.2 },
  ];
  const ph = COMP.map((c, i) => hash2(c.cx * 977 + i, c.cy * 389 + i) * Math.PI * 2);
  const amp = COMP.reduce((a, c) => a + c.amp, 0);
  const buf = new Float32Array(n * n);
  let mean = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (let k = 0; k < COMP.length; k++) {
        const c = COMP[k];
        v +=
          c.amp *
          Math.sin((2 * Math.PI * (c.cx * x + c.cy * y)) / n + ph[k]);
      }
      const t = v / amp;
      buf[y * n + x] = t;
      mean += t;
    }
  }
  mean /= n * n;
  for (let i = 0; i < n * n; i++) {
    /* the crest: only the top of the wave lights. The square rather than the
       fourth power — at the fourth only the very peaks survived and the field
       broke into isolated dots; the square keeps the shoulder and the streak
       stays a streak. */
    const t = Math.max(0, buf[i] - mean);
    const v = Math.round(255 * Math.min(1, Math.pow(t, 2) * 3.2));
    px[i * 4] = v;
    px[i * 4 + 1] = v;
    px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  const t = new DataTexture(px, n, n, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * THE RIPPLE MESH — the plate's own cut, tiled with the crest field.
 *
 * It shares nothing but the shape: its own positions, its own index, and a UV
 * that is world position over `RIPPLE_M` so the tile is a fixed size on the
 * GROUND rather than on the plate. Added additively under the far shore, so a
 * crest brightens the water and never darkens it, and faded out by the same
 * distance haze the plate uses — water that has gone to paper must not ripple,
 * which is the argument §THE GLINT already makes about the sparkle.
 */
function rippleMesh(
  rects: readonly number[],
  map: DataTexture,
  anchor: readonly [number, number],
  fadeR1: number,
): Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  /* `k` is 1 on clear water and 0 where the fade has taken the bay all the way
     to paper, so the crest field ends exactly where the distance haze does and
     the geometry can stop there without an edge to show for it. */
  const kAt = (x: number, z: number): number => {
    const d = Math.hypot(x - anchor[0], z - anchor[1]);
    const a = Math.max(0, Math.min(1, (d - FADE_R0_M) / Math.max(1e-6, fadeR1 - FADE_R0_M)));
    return 1 - a;
  };
  const quad = (x0: number, z0: number, x1: number, z1: number): void => {
    const k0 = kAt(x0, z0);
    const k1 = kAt(x1, z0);
    const k2 = kAt(x1, z1);
    const k3 = kAt(x0, z1);
    if (k0 <= 0 && k1 <= 0 && k2 <= 0 && k3 <= 0) return;
    const b = pos.length / 3;
    const put = (x: number, z: number, k: number): void => {
      pos.push(x, 0, z);
      /* the crest field's own coordinate, bent — see §AND THE TILE ITSELF */
      uv.push(
        x / RIPPLE_M + (smoothNoise(x, z, WARP_M) - 0.5) * 2 * WARP_TILES,
        z / RIPPLE_M +
          (smoothNoise(x - 5813, z + 7717, WARP_M) - 0.5) * 2 * WARP_TILES,
      );
      /* the fade, times how hard the wind is working here — see §EQUALLY
         CHOPPY. Both are scalars on the same additive crest, so a calm sheet
         and a hazed sheet dim it in exactly the same way. */
      const c = k * chopAt(x, z);
      col.push(c, c, c);
    };
    put(x0, z0, k0);
    put(x1, z0, k1);
    put(x1, z1, k2);
    put(x0, z1, k3);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (let r = 0; r + 3 < rects.length; r += 4) {
    const rx0 = rects[r];
    const rz0 = rects[r + 1];
    const rx1 = rects[r + 2];
    const rz1 = rects[r + 3];
    /* wholly outside the fade's own circle: nothing to draw */
    const cx = Math.max(rx0, Math.min(anchor[0], rx1));
    const cz = Math.max(rz0, Math.min(anchor[1], rz1));
    if (Math.hypot(cx - anchor[0], cz - anchor[1]) >= fadeR1) continue;
    /* THE SUBDIVISION IS THE FADE'S, NOT THE SHAPE'S. `k` is radial and the
       vertex colour interpolates LINEARLY across a quad, so a band rectangle
       40 km wide would carry one straight ramp across the whole ocean and put
       a seam wherever it met the cut lattice's own small quads. Splitting at
       `RIPPLE_STEP` makes the interpolation follow the circle instead. */
    const nx = Math.max(1, Math.ceil((rx1 - rx0) / RIPPLE_STEP));
    const nz = Math.max(1, Math.ceil((rz1 - rz0) / RIPPLE_STEP));
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        quad(
          rx0 + ((rx1 - rx0) * i) / nx,
          rz0 + ((rz1 - rz0) * j) / nz,
          rx0 + ((rx1 - rx0) * (i + 1)) / nx,
          rz0 + ((rz1 - rz0) * (j + 1)) / nz,
        );
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) nrm[v * 3 + 1] = 1;
  g.setAttribute("normal", new BufferAttribute(nrm, 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  const m = new MeshBasicMaterial({
    map,
    vertexColors: true,
    transparent: true,
    opacity: RIPPLE_A,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(g, m);
  /* between the plate (-4) and the far shore (-3): the crests belong to the
     water and the far shore is drawn over both */
  mesh.renderOrder = -3.5;
  return mesh;
}

export function waterLayer(
  data: CityData,
  opts: WaterLayerOptions,
): CityLayer & {
  mesh: Mesh;
  foamStats(): FoamStats | null;
  plateStats(): PlateStats | null;
} {
  const meta = data.manifest.water as unknown as WaterMeta & {
    world: [number, number, number, number];
  };
  const chunk = data.get("base/water0");
  if (!chunk || !meta) throw new Error("water: base/water0 has not landed");

  const chunkDep = chunk.fields.dep as Uint8Array;
  /* the coarse grid is the fine one divided by `mul`, plus one node — the
     encoder's own refinement rule, asserted in `water.ts` §assertRefinement */
  const cgw = (meta.nw - 1) / meta.mul + 1;
  const cgh = (meta.nh - 1) / meta.mul + 1;
  if (cgw * cgh !== chunkDep.length) {
    throw new Error(`water: dep is ${chunkDep.length}, the grid says ${cgw}x${cgh}`);
  }

  /* ── AND THE SEA FLOOR CAN COME FROM A FINER SURVEY THAN THIS ───────────
     `base/water0`'s own grid is 417 x 281 over 45.8 x 39.0 km, which is
     110.01 x 139.15 m a node, and §THE BLOCKS WERE THE DEPTH GRID above is
     about exactly that. What that section could not say is the comparison
     that matters: this bake is 1536 texels over an ~80 km box, so it samples
     at **52 m** — the depth field has been TWICE as coarse as the thing
     reading it, and every gradient in the bay an interpolation across 110 m.

     `base/bathy` is NOAA NCEI's San Francisco Bay Coastal DEM, an integrated
     bathymetric-topographic model at 1/3 arc-second, reduced in the pipeline
     to 40.7 x 51.5 m — finer than the texel for the first time, and 2.4x
     finer than the grid it replaces, for 850 KB (174 KB gzipped).
     `pipeline/scripts/us_sf_city/build_bathy.py` has the whole derivation and
     why it is REDUCED there rather than shipped whole: at its published pitch
     the same box is 21.2 million cells and 85 MB, to feed a bake that
     discards everything under 52 m.

     Optional, exactly like `terrain-fine`: a city without the file draws the
     published chunk and nothing is broken. `?bathy=0` does the same.

     The published RAMP does not move with it. `meta.qs` and `DEPTH_UM` are
     `lib/city/water.ts`'s and the Canvas page reads them too, so the same
     depth still gets the same colour and what changes is only how finely the
     depth is known. The new field's own tertiles are 5.55 m and 15.62 m
     against the published stops' 9.93 and 27.47 — they differ because a
     denser grid resolves far more shallow water near the shore, not because
     the bay changed, and re-deriving the ramp from it would be a second
     variable in the same step. */
  const bathy = BATHY_ON ? (opts.bathy ?? null) : null;
  const dep = bathy ? bathy.dep : chunkDep;
  const gw = bathy ? bathy.w : cgw;
  const gh = bathy ? bathy.h : cgh;
  const gdmax = bathy ? bathy.dmax : meta.dmax;
  const [gx0, gy0, gx1, gy1] = bathy ? bathy.world : meta.world;

  const [wx0, wy0, wx1, wy1] = meta.world;
  const reach = opts.reachM ?? 40_000;
  const x0 = Math.min(wx0, opts.anchor[0] - reach);
  const y0 = Math.min(wy0, opts.anchor[1] - reach);
  const x1 = Math.max(wx1, opts.anchor[0] + reach);
  const y1 = Math.max(wy1, opts.anchor[1] + reach);

  // ── the bake ─────────────────────────────────────────────────────────────
  const ramp = depthRamp(meta.qs);
  const W = BAKE_W;
  const H = Math.max(2, Math.round((BAKE_W * (y1 - y0)) / (x1 - x0)));
  const tex = new Uint8Array(W * H * 4);

  const near = rgb255(BAY_OPEN);
  const far = rgb255(lerpHex(BAY_OPEN, HAZE, 0.62));
  const haze = rgb255(HAZE);
  const cap = WA.hazecap;
  const fadeR1 = FADE_R0_M + FADE_SPAN_M * cap;

  /* ── THE GLINT'S TWO DIRECTIONS, RESOLVED ONCE ────────────────────────
     `h` is the half-vector between the light and the eye; a facet turned
     along it is the one that sends the sun into the camera. `hxz` is what a
     SLOPE has to work against, and it is what the wave field is normalised
     by below so the lobe is the same shape whatever the sun's height is. */
  const L = aimedSun();
  const V = axonBasis(projection).F; // the camera looks along -F, so F is the eye
  const h = new Vector3(L.x + V.x, L.y + V.y, L.z + V.z).normalize();
  const hxz = Math.hypot(h.x, h.z) || 1e-6;

  /* the wave field, as gradients: the slope a facet has at (x, z) is the sum
     of each component's own, and the largest the sum can be is the sum of the
     amplitudes — which is the normaliser that makes `t` land in [-1, 1] */
  const wv = WAVES.map((w) => {
    const k = (2 * Math.PI) / w.lam;
    const a = (w.deg * Math.PI) / 180;
    return { kx: k * Math.cos(a), kz: k * Math.sin(a), amp: w.amp, ph: w.ph };
  });
  const wSum = wv.reduce((s, w) => s + w.amp, 0);

  /* ── THE TWO ENDS OF THE RANGE, AND THE SKY'S TONE ────────────────────
     `uMax` is the ramp's own deepest step and `DEPTH_UM` its published mean,
     so `(u - um)` normalised by either side is *how far from the average bay
     this square metre is*, in the ramp's own units. See §THE RANGE. */
  const deep = rgb255(BAY_DEEP);
  const teal = rgb255(BAY_TEAL);
  const uMax = depthU_stops()[3];
  const sky = rgb255(lerpHex(HAZE, "#ffffff", SKY_ON_WATER));
  /* the eye, for the Fresnel: the camera looks along -F, and the flat plane's
     own normal is +Y, so `V.y` is the cosine a FLAT facet is seen at and the
     swell moves it either side of that */
  const eye = new Vector3(V.x, V.y, V.z).normalize();

  for (let py = 0; py < H; py++) {
    /* +0.5 for the texel CENTRE, and the row runs south to north because a
       texture's v = 0 is its first row and this quad's v = 0 is its southern
       edge. Backwards, this mirrors the bay about the Golden Gate — entirely
       plausible on screen, which is why it is written down rather than
       remembered. */
    const wy = y0 + ((py + 0.5) / H) * (y1 - y0);
    for (let px = 0; px < W; px++) {
      const wx = x0 + ((px + 0.5) / W) * (x1 - x0);
      const d = Math.hypot(wx - opts.anchor[0], wy - opts.anchor[1]);

      // the open-bay gradient the published depth is laid over
      const g = Math.max(0, Math.min(1, (d - FADE_R0_M) / FADE_SPAN_M));
      let r = near[0] + (far[0] - near[0]) * g;
      let gg = near[1] + (far[1] - near[1]) * g;
      let bb = near[2] + (far[2] - near[2]) * g;

      /* ── THE BLOCKS WERE THE DEPTH GRID, NOT THE GRADIENT ─────────────
         The published survey is 417 x 281 over 45.8 x 39.0 km, which is
         110 x 139 m a node — the SURROUND's own tread. Sampled with
         `Math.round` it painted the bay in 110 m blocks, and at the district
         camera one of them is 53 px: the "banding in the gradient" is
         mostly this, and it is nearest-neighbour rather than a ramp.

         Bilinear, and the weights skip a DRY node. `dep` is 0 where the
         survey has no water, so a plain bilinear would drag the shore's
         zeros out into the bay as a pale halo; weighting only the wet
         corners keeps the interpolation inside the water and leaves the
         open-bay gradient to carry the rest. */
      const gx = ((wx - gx0) / (gx1 - gx0)) * (gw - 1);
      const gy = ((wy - gy0) / (gy1 - gy0)) * (gh - 1);
      let wet = 0;
      if (gx >= 0 && gx <= gw - 1 && gy >= 0 && gy <= gh - 1) {
        const i0 = Math.min(gw - 1, Math.floor(gx));
        const j0 = Math.min(gh - 1, Math.floor(gy));
        const i1 = Math.min(gw - 1, i0 + 1);
        const j1 = Math.min(gh - 1, j0 + 1);
        const fx = gx - i0;
        const fy = gy - j0;
        let acc = 0;
        let wsum = 0;
        const add = (i: number, j: number, w: number): void => {
          const v = dep[j * gw + i];
          if (v === 0) return;
          acc += v * w;
          wsum += w;
        };
        add(i0, j0, (1 - fx) * (1 - fy));
        add(i1, j0, fx * (1 - fy));
        add(i0, j1, (1 - fx) * fy);
        add(i1, j1, fx * fy);
        /* ── AND THE SURVEY'S OWN RECTANGLE MUST NOT BE VISIBLE ──────
           `wsum` crosses smoothly wherever a NODE is dry, which is what the
           note above is about — but the grid's outer BOUNDARY is not a dry
           node, it is the end of the array, and there `wsum` steps from ~1 to
           0 across a single texel. The result is a ruler-straight edge in the
           bay wherever the survey's rectangle falls inside a frame.

           Found at the Marina: a hard-edged translucent band lay across the
           water and the far shore at a 1,100 m camera. Bisected by
           `setDrawRange(0, 0)` over the scene while sampling one pixel — it
           converged on child 7, the bay plate itself, which ruled out the
           terrain, the surround, the hem, the foam and the sky.

           So the last `FEATHER_CELLS` of the grid fade out. Six cells is
           660 m at this survey's 110 m pitch — about half a texel of the
           1,536 bake at the whole-city camera, and four texels at the
           district camera, which is enough to be a gradient rather than a
           line. The glint is scaled by `wet` too, so this feathers that with
           it and the sparkle no longer stops on a straight edge either. */
        const FEATHER_CELLS = 6;
        const edge =
          Math.min(gx, gy, gw - 1 - gx, gh - 1 - gy) / FEATHER_CELLS;
        wsum *= Math.max(0, Math.min(1, edge));
        if (wsum > 0) {
          wet = wsum;
          const dm = depthM(acc / wsum, gdmax);
          const c = depthColour(dm, ramp);
          /* ── AND THEN THE RANGE IS OPENED, §THE RANGE ──────────────
             The colour above is the published one. This carries its deep end
             toward a declared navy and its shoal end toward a declared teal,
             in proportion to how far this point's `u` is from the field's own
             published mean. At `u = um` — the average square metre of the
             bay — both terms are zero and nothing moves, which is what keeps
             the frame's mean where the published ramp put it. */
          const u = depthU(dm, meta.qs);
          if (u > DEPTH_UM) {
            const k = Math.min(1, (u - DEPTH_UM) / Math.max(1e-6, uMax - DEPTH_UM)) * DEEP_MIX;
            c[0] += (deep[0] - c[0]) * k;
            c[1] += (deep[1] - c[1]) * k;
            c[2] += (deep[2] - c[2]) * k;
          } else {
            const k = Math.min(1, (DEPTH_UM - u) / Math.max(1e-6, DEPTH_UM)) * SHOAL_MIX;
            c[0] += (teal[0] - c[0]) * k;
            c[1] += (teal[1] - c[1]) * k;
            c[2] += (teal[2] - c[2]) * k;
          }
          /* `wsum` is also HOW MUCH of this texel the survey calls water, so
             a texel on the survey's own edge crosses to the open-bay tone
             instead of stepping to it */
          r += (c[0] - r) * wsum;
          gg += (c[1] - gg) * wsum;
          bb += (c[2] - bb) * wsum;
        }
      }

      // and the distance fade over both
      const a = Math.max(0, Math.min(1, (d - FADE_R0_M) / (fadeR1 - FADE_R0_M))) * cap;
      r += (haze[0] - r) * a;
      gg += (haze[1] - gg) * a;
      bb += (haze[2] - bb) * a;

      /* ── THE GLINT ────────────────────────────────────────────────────
         `t` is how far this facet turns TOWARD the half-vector, in units of
         the steepest turn the swell can make, so it is in [-1, 1] whatever
         the amplitudes are. Raised to `GLINT_P` it becomes a sparse set of
         broad lobes rather than an even sheen.

         It is scaled by `1 - a`, the haze: water that has gone to paper is
         not water any more and must not glitter. And by `wet`, so the glint
         belongs to the surveyed bay rather than to the empty ocean past it,
         where there is nothing for it to be the surface OF. */
      let slope = 0;
      /* the same field, as a plain gradient, for the Fresnel below: `sgx` and
         `sgz` are the swell's own slope in x and z rather than its component
         along the half-vector */
      let sgx = 0;
      let sgz = 0;
      for (const w of wv) {
        const c = Math.cos(w.kx * wx + w.kz * wy + w.ph);
        slope += (w.amp * c * (w.kx * h.x + w.kz * h.z)) / (Math.hypot(w.kx, w.kz) * hxz);
        const kk = Math.hypot(w.kx, w.kz) || 1e-9;
        sgx += (w.amp * c * w.kx) / kk;
        sgz += (w.amp * c * w.kz) / kk;
      }
      const t = -slope / wSum;
      if (t > 0 && a < 1 && wet > 0) {
        const gl = Math.pow(t, GLINT_P) * GLINT_GAIN * (1 - a) * wet;
        r += (255 - r) * gl;
        gg += (255 - gg) * gl;
        bb += (250 - bb) * gl;
      }

      /* ── THE SKY, AT THE ANGLE THE SWELL PRESENTS ─────────────────────
         §THE SKY ON THE WATER. `n` is the swell's normal at this point, `cos`
         is what the eye sees it at, and Schlick's fifth power turns that into
         how much of the sky comes back. A flat facet is seen at `eye.y` and
         returns its baseline; the term here is the DIFFERENCE from that
         baseline, so the swell is what shows and not a second flat wash. */
      if (a < 1 && wet > 0) {
        const nx = -SWELL_S * sgx;
        const nz = -SWELL_S * sgz;
        const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
        const cosN = Math.max(0, (nx * eye.x + eye.y + nz * eye.z) * inv);
        const flat = Math.max(0, Math.min(1, eye.y));
        const fr = Math.pow(1 - cosN, 5) - Math.pow(1 - flat, 5);
        if (fr > 0) {
          const k = Math.min(1, fr * FRESNEL_GAIN) * (1 - a) * wet;
          r += (sky[0] - r) * k;
          gg += (sky[1] - gg) * k;
          bb += (sky[2] - bb) * k;
        }
      }

      /* ── THE BANDS ────────────────────────────────────────────────────
         What is left after the depth is fixed is a genuine eight-bit
         problem: the fade moves by one part in 255 over some 300 m of bay,
         so the plate holds long runs of one byte with a hard step between
         them, and the linear filter turns each step into a Mach band the eye
         finds instantly on a flat surface.

         A triangular-PDF dither of one least significant bit removes the
         step by turning it into noise the filter then averages away — the
         standard answer, and the reason it is triangular rather than
         rectangular is that a rectangular dither leaves the noise CORRELATED
         with the signal, which is a texture that shimmers where the gradient
         is steep. Deterministic, so two bakes of the same city are the same
         bytes. */
      const dth = hash2(px, py) + hash2(px + 9871, py + 1237) - 1;
      const o = (py * W + px) * 4;
      tex[o] = Math.max(0, Math.min(255, Math.round(r + dth)));
      tex[o + 1] = Math.max(0, Math.min(255, Math.round(gg + dth)));
      tex[o + 2] = Math.max(0, Math.min(255, Math.round(bb + dth)));
      tex[o + 3] = 255;
    }
  }

  const map = new DataTexture(tex, W, H, RGBAFormat);
  map.colorSpace = SRGBColorSpace;
  /* ── THE BAY NEEDS MIPMAPS, AND WITHOUT THEM IT SHIMMERS ────────────────
     This plate is 80 km of world across a 1,536-texel bake — 52 m a texel —
     and at the whole-city camera every screen pixel covers several of them.
     With `LinearFilter` and no mip chain the GPU takes ONE of those texels per
     pixel, and which one it takes changes the instant the camera moves. Over
     the largest single surface in the frame — the bay is about 40 % of the
     wide shot — that is a sheet of sparkle across the water on every gesture.
     Daniel: *"when i move it scintillates."*

     A mip chain averages the texels a pixel actually covers instead of picking
     one, so the answer stops depending on sub-pixel position. Anisotropy is
     what keeps that from going soft at this camera, where the plate is seen at
     a shallow angle and one screen pixel is a long thin footprint in texture
     space — 8 rather than the 4 the facade tiles take, because nothing in the
     scene is more foreshortened than a horizontal plane under an axonometric
     camera. `magFilter` stays linear: near the camera the plate is magnified
     and there is nothing to average. */
  map.generateMipmaps = true;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.anisotropy = 8;
  map.needsUpdate = true;

  /* ── SEA LEVEL EXACTLY, AND THE DEPTH IS PUSHED INSTEAD ─────────────────
     The first cut put the bay half a unit BELOW zero so land would win the
     depth test. It does — and so does the bay, over the SURROUND, whose own
     sea-level nodes sit lower; Marin and the East Bay vanished under the
     water. Moving a plane in Y also moves it on SCREEN in an axonometric
     projection — 79 px at the street camera — so the fix is `polygonOffset`:
     the plane stays at zero and is pushed back in the DEPTH BUFFER only. */
  const box: Box = [x0, y0, x1, y1];
  const plate0 = plateGeometry(box, null);
  let g = plate0.geo;
  let gRects: number[] = plate0.rects;
  const rippleTex = bakeRipple(RIPPLE_TEX);

  const m = new MeshBasicMaterial({
    map,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 6,
  });

  const mesh = new Mesh(g, m);
  /* ── THE BAY IS THE BOTTOM OF THE STACK, UNDER THE FAR SHORE ────────────
     `layers/surround.ts` had to become a depth-less BACKDROP (see its own
     note), which took it out of the depth buffer and left ORDER as the only
     thing separating it from this plane. At -1 the bay drew after it and
     painted straight over the Marin headlands, the East Bay and the San Bruno
     peninsula: the whole-city frame came back with the far shore missing and
     measured 10.3 points of luminance under the published page's, its p10 22
     under, because a pale hazed headland had become open water.

     One number below the surround, so the stack reads bay, far shore, city —
     which is the order the published page paints them in. The foam added
     below takes the rung between the far shore and the city, because it is
     the far shore's surf as much as the city's. */
  mesh.renderOrder = -4;

  let ripple = rippleMesh(gRects, rippleTex, opts.anchor, fadeR1);
  mesh.add(ripple);

  /* ── THE PLATE IS CUT, ONCE THE SECOND REGISTER LANDS ───────────────────
     `data.surroundCoast()` is a sidecar fetch, so the first frame gets the
     whole quad — which is what shipped, and is only ever seen for the
     microtask before the rings resolve. See §THE PLATE IS CUT. */
  let plate: PlateStats | null = null;
  const cityRingsSync: Ring[] = (() => {
    const c = data.get("base/coast");
    return c ? decodeCoast(c).coast : [];
  })();
  void data
    .surroundCoast()
    .catch(() => null)
    .then((sc) => {
      if (!sc || !sc.rings.length) return;
      const cut = cityCut(data, cityRingsSync, sc);
      if (!cut) return;
      const next = plateGeometry(box, cut);
      mesh.geometry = next.geo;
      g.dispose();
      g = next.geo;
      gRects = next.rects;
      plate = next.stats;
      ripple.geometry.dispose();
      ripple.removeFromParent();
      ripple = rippleMesh(gRects, rippleTex, opts.anchor, fadeR1);
      mesh.add(ripple);
    });

  const foam = buildFoam(data, mesh);

  return {
    name: "water",
    mesh,
    foamStats: () => foam.stats,
    plateStats: () => plate,
    dispose() {
      g.dispose();
      m.dispose();
      map.dispose();
      ripple.geometry.dispose();
      (ripple.material as MeshBasicMaterial).dispose();
      rippleTex.dispose();
      foam.dispose();
    },
  };
}

/** what the shore wash covered, so the comments above can be re-measured */
export interface FoamStats {
  /** water cells inside the band, on the `FOAM_CELL` lattice */
  cells: number;
  vertices: number;
  triangles: number;
}

/**
 * THE SURF, AS A DISTANCE FROM THE LAND THE FRAME ACTUALLY DRAWS.
 *
 * ── THE FIRST CUT WAS A RIBBON PER SEGMENT, AND IT GLOWED ────────────────
 * One quad per published ring segment, offset onto its water side, is the
 * obvious shape and it accumulated: the two registers trace the SAME shore a
 * few tens of metres apart, so most of the waterfront got two ribbons at
 * `FOAM_A` each and composed to 0.75; and at a pier head, where the segments
 * are short and the turns are sharp, the end caps that stop a corner wedge
 * overlapped three and four deep. MEASURED, 3,109 segments kept of 3,577, and
 * the district frame came back with a white halo round every pier that read
 * as a glow rather than as surf.
 *
 * Alpha that accumulates is a bug wherever the mark is meant to be a FIELD
 * rather than a stroke, and this one is a field: how near the land is. So it
 * is computed as one — the union of the two registers is scan-converted onto
 * a `FOAM_CELL` lattice, a chamfer transform gives every water cell its
 * distance to the nearest land cell, and the wash is a function of that
 * distance with no overlap anywhere by construction.
 *
 * It also disposes of the gate the ribbon needed. A published ring that runs
 * across dry land — the county line through the southern suburbs is one —
 * contributes nothing here, because every cell along it is land and land
 * cells are not emitted.
 *
 * Returns its own disposer and its own counts.
 */
function buildFoam(
  data: CityData,
  parent: Mesh,
): { dispose(): void; stats: FoamStats | null } {
  let mesh: Mesh | null = null;
  const out: { dispose(): void; stats: FoamStats | null } = {
    stats: null,
    dispose() {
      if (!mesh) return;
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.removeFromParent();
      mesh = null;
    },
  };
  const meta = data.manifest.water as unknown as { world: [number, number, number, number] };
  const coastChunk = data.get("base/coast");
  const cityRings: Ring[] = coastChunk ? decodeCoast(coastChunk).coast : [];

  void data
    .surroundCoast()
    .catch(() => null)
    .then((sc) => {
      const sets: (readonly Ring[])[] = [];
      if (cityRings.length) sets.push(cityRings);
      if (sc && sc.rings.length) sets.push(sc.rings as readonly Ring[]);
      /* the same union the ground is cut at — `terrain.ts` §THE COAST. With
         one register the ground is not cut either, so there is no new edge
         for a wash to soften and drawing one would put surf on a staircase. */
      if (sets.length < 2) return;

      const [bx0, by0, bx1, by1] = meta.world;
      const nx = Math.ceil((bx1 - bx0) / FOAM_CELL);
      const ny = Math.ceil((by1 - by0) / FOAM_CELL);
      const mask = rasteriseRings(
        sets,
        { x0: bx0, y0: by0, nx, ny, cellW: FOAM_CELL, cellH: FOAM_CELL },
        1,
      );

      /* ── THE DISTANCE, BY CHAMFER ─────────────────────────────────────
         Two sweeps over the lattice with the (1, sqrt2) neighbourhood. Its
         worst error against a true Euclidean distance is about 6 %, which on
         a 55 m band is 3 m — a tenth of a cell, and well under the width of
         the softest part of the falloff. An exact transform is a page of
         code for a difference nothing in this frame can hold. */
      const CAP = FOAM_OUT / FOAM_CELL + 2;
      const d = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          d[j * nx + i] = mask.at(i, j, 0, 0) ? 0 : CAP;
        }
      }
      const D1 = 1;
      const D2 = Math.SQRT2;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          let v = d[k];
          if (v === 0) continue;
          if (i > 0) v = Math.min(v, d[k - 1] + D1);
          if (j > 0) v = Math.min(v, d[k - nx] + D1);
          if (i > 0 && j > 0) v = Math.min(v, d[k - nx - 1] + D2);
          if (i < nx - 1 && j > 0) v = Math.min(v, d[k - nx + 1] + D2);
          d[k] = v;
        }
      }
      for (let j = ny - 1; j >= 0; j--) {
        for (let i = nx - 1; i >= 0; i--) {
          const k = j * nx + i;
          let v = d[k];
          if (v === 0) continue;
          if (i < nx - 1) v = Math.min(v, d[k + 1] + D1);
          if (j < ny - 1) v = Math.min(v, d[k + nx] + D1);
          if (i < nx - 1 && j < ny - 1) v = Math.min(v, d[k + nx + 1] + D2);
          if (i > 0 && j < ny - 1) v = Math.min(v, d[k + nx - 1] + D2);
          d[k] = v;
        }
      }

      /* ── THE FETCH, ONE SWEEP A ROW — see §SURF DOES NOT HAPPEN ────────
         `x` increases east, so west is decreasing `i`: the run of water cells
         already passed IS the open water lying west of this one. Land resets
         it. Cells are 12 m, so the cap is generous and the scan is O(cells). */
      const fetch = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        let run = 0;
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (mask.at(i, j, 0, 0)) {
            run = 0;
            fetch[k] = 0;
          } else {
            fetch[k] = run * FOAM_CELL;
            run++;
          }
        }
      }

      /* a NODE takes the nearest of the up-to-four cells that meet at it, so
         a node on the waterline reads zero and the wash starts at full
         strength exactly where the land stops */
      const nnx = nx + 1;
      const nodeF = (ni: number, nj: number): number => {
        let m = CAP;
        for (let a = -1; a <= 0; a++) {
          for (let b = -1; b <= 0; b++) {
            const i = ni + a;
            const j = nj + b;
            if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
            const v = d[j * nx + i];
            if (v < m) m = v;
          }
        }
        const f = 1 - (m * FOAM_CELL) / FOAM_OUT;
        return f <= 0 ? 0 : Math.pow(f, FOAM_FALL);
      };

      /** how exposed this node is: the MAX fetch of the cells that meet at it,
       *  so a waterline node takes the open water's exposure and not the
       *  land's zero */
      const nodeE = (ni: number, nj: number): number => {
        let m = 0;
        for (let a = -1; a <= 0; a++) {
          for (let b = -1; b <= 0; b++) {
            const i = ni + a;
            const j = nj + b;
            if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
            const v = fetch[j * nx + i];
            if (v > m) m = v;
          }
        }
        return Math.pow(Math.min(1, m / FETCH_FULL_M), FETCH_POW);
      };

      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const seen = new Map<number, number>();
      const c = new Color();
      c.setStyle(lerpHex(BAY_SHOAL, "#ffffff", FOAM_WHITE), SRGBColorSpace);
      let cells = 0;

      const vert = (ni: number, nj: number): number => {
        const key = nj * nnx + ni;
        const had = seen.get(key);
        if (had !== undefined) return had;
        const v = pos.length / 3;
        pos.push(bx0 + ni * FOAM_CELL, 0, by0 + nj * FOAM_CELL);
        col.push(c.r, c.g, c.b, FOAM_A * nodeF(ni, nj) * nodeE(ni, nj));
        seen.set(key, v);
        return v;
      };

      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (d[j * nx + i] === 0) continue; // land: the ground draws it
          if (d[j * nx + i] * FOAM_CELL >= FOAM_OUT) continue;
          cells++;
          const a = vert(i, j);
          const b = vert(i + 1, j);
          const cc = vert(i + 1, j + 1);
          const dd = vert(i, j + 1);
          idx.push(a, b, cc, a, cc, dd);
        }
      }
      if (!idx.length) return;

      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute("color", new BufferAttribute(new Float32Array(col), 4));
      const n = new Float32Array(pos.length);
      for (let v = 0; v < pos.length / 3; v++) n[v * 3 + 1] = 1;
      g.setAttribute("normal", new BufferAttribute(n, 3));
      g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
      g.computeBoundingSphere();

      /* LAMBERT WITH FLAT-UP NORMALS, like every other ground surface here:
         a mark that does not take the scene's light is a mark that is out of
         register with the shore rim two rungs above it. */
      const fm = new MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: 3,
      });
      mesh = new Mesh(g, fm);
      /* ── WHERE THE WASH SITS IN THE STACK ─────────────────────────────
         renderOrder -4 bay, -3 far shore, -2 HERE, 0 the city and everything
         drawn on it. After the far shore because the far shore has surf too
         and this has to reach it; before the ground because the ground must
         always win over it. It writes no depth, so nothing after it has to
         know it is there. */
      mesh.renderOrder = -2;
      mesh.receiveShadow = true;
      out.stats = { cells, vertices: pos.length / 3, triangles: idx.length / 3 };
      parent.add(mesh);
    });

  return out;
}
