/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/buildings.ts — THE CITY, EXTRUDED.

   166,166 published footprints, each raised to the height the LIDAR measured
   over it. One mesh per loaded chunk, uploaded once, drawn for nothing.

   ── WHAT THIS DOES THAT PAINTER'S ORDER CANNOT ────────────────────────────
   The Canvas renderer sorts every footprint back to front on every
   rasterisation and still approximates every overlap — `scene.ts` spends a
   counting sort, 128 depth bands and a per-band batch flush on it, and a
   tower crown behind a nearer roof still comes out wrong, because painter's
   order is a per-OBJECT answer to a per-PIXEL question. Here the depth
   buffer answers it per pixel and the sort does not exist.

   ── TWO VERTICES A CORNER, AND FLAT FACES ANYWAY ─────────────────────────
   A prism drawn with flat-shaded walls normally needs four vertices per wall
   quad, because a corner shared by two walls needs two normals. That would be
   five million vertices for this city. Instead each footprint ships TWO rings
   — its own corners at ground level and the same corners at roof level, 2n
   vertices — and the face normal is recovered per FRAGMENT from the screen
   derivatives of the world position. Same crisp faces, 40 % of the memory,
   and it is the normal the geometry actually has rather than one averaged
   across a corner.

   ── THE VERTICAL EXAGGERATION IS BAKED, AND THAT IS A DECISION ───────────
   The ground and the built height are exaggerated by DIFFERENT factors
   (`zex` and `zexb`), which a single mesh scale cannot express. The first cut
   put both in a custom vertex shader as uniforms — elegant, and it made a
   camera step cost two numbers.

   It also made the geometry INVISIBLE to three.js. Every pass that overrides
   the material — the shadow map's depth pass, a normal pass for ambient
   occlusion, any post-process — re-renders with ITS material and ITS vertex
   shader, which knows nothing about `aElev` and `aH`. Shadows would have been
   cast by a city lying flat at the origin.

   So the position is baked, and a step change rewrites the Y component of the
   position buffer: one pass over the array, three times in a session, against
   a whole renderer's worth of machinery that then works for free — real
   lights, a real shadow map, flat shading, and whatever post-processing comes
   later. `elev` and `h` are kept as attributes anyway, because rewriting Y
   needs them.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Int16BufferAttribute,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from "three";

import type { Chunk, CityData } from "@/lib/city/data";
import { roofHeight } from "@/lib/city/roofs";
import { WA } from "@/lib/city/terrain";
import { decodeBldg, type BldgTable } from "../bldg";
import {
  FLAG_BLOCKYEAR,
  FLAG_HEIGHT_STALE,
  FLAG_NOYEAR,
  UMAT_WALL,
  USE_MASK,
  isPitched,
  legendTones,
} from "@/components/us/city/palette";
import {
  COVER_GAIN,
  EDGE_SHADE,
  INK_W0,
  STROKE_MIN_PX_A,
  inkFor,
} from "@/lib/city/buildings";
import {
  ROLE_FRONT,
  derivedBands,
  faBayOK,
  faEra,
  faVocab,
  faGlassy,
  storeysOf,
  storeysRead,
} from "@/lib/city/facades";
import { BAY_DEPTH_M, BAY_HEAD_M, BAY_MIN_PLAN_M, bayForm } from "../bay-form";
import {
  familyCornice,
  familyEave,
  familyHasBay,
  familyHipShare,
  familyPitchedRoof,
  familyOfEra,
  roofFamilyRGB,
  type FaFamily,
  FACADE_TILES,
  TILE_CURTAIN,
  facadeAtlas,
  facadeGroundTile,
  facadeModuleM,
  facadeTile,
  wallFamilyRGB,
  wallTint,
  type FacadeAtlas,
  type FacadeKey,
} from "../facade";
import { boxForm, gableForm, gableHalf, hipForm, hipPlan, stepForm, trayForm, type FormSink } from "../roof-form";
import { civicEaveDrop, civicForm, civicRoofs } from "../civic-form";
import type { CivicForm } from "../civic";
import {
  bldgMaterials,
  legendDraw,
  roofShadeTable,
  type LocaleLegend,
  type MaterialConfig,
} from "../materials";
import {
  BORN_UNDATED,
  FRESH_ROOF,
  FRESH_WALL,
  OFF_RANGE,
  RISE_ATTR,
  packBorn,
  riseNodes,
  risePhase,
  type RiseNodes,
} from "../rise";
import { ROOF_GRAIN_M, roofGrainNormal, roofGrainTexture } from "../roof-grain";
import { upFaceTransferRGB } from "../up-face";
import type { CityLayer } from "../engine";

export interface BuildingsLayerOptions {
  /** how tall the built height is drawn, relative to the ground's own scale */
  zexb: number;
  /** ground elevation at a world point — the terrain field's own */
  elevAt: (x: number, y: number) => number;
  /** the measured aerial roof palette, from the city's manifest */
  roofPalette: readonly string[];
  /** the wall palette, from the renderer's own material table */
  wallPalette: readonly string[];
  /**
   * §THE BORROWED YEAR MAY NOT OUTRUN THE REGISTER — `base/height-floor.json`
   * `steps`, ascending: `[height in metres, the earliest year the roll dates
   * anything at least that tall]`. Omitted, no floor is applied and every
   * borrowed year stands, which is what this layer did before.
   */
  heightFloor?: readonly (readonly [number, number])[] | null;
  /** the facade atlas, shared across every chunk */
  atlas?: FacadeAtlas | null;
  /** the published facade columns for this chunk, when it has them */
  face?: { ty: Uint8Array; st2: Uint8Array; shop: Uint8Array; role: Uint8Array } | null;
  /** what the 2023 survey measured standing on each roof, when this chunk has
   *  a `roof/<cell>` companion. Absent, every building draws as it did. */
  roof?: RoofTable | null;
  /** ── THE NAMED BUILDINGS, AND WHAT EACH IS DRAWN AS ──────────────────
     `civic.ts` has the register and the rule; `civic-form.ts` has the five
     drawings. Keyed by the building index the register resolves to, which is
     the same `gid` this table carries. Absent, every building draws as it
     did — 457 of 166,166 footprints are in it. */
  civicOf?: ReadonlyMap<number, CivicForm> | null;
  /** dev: draw every footprint in one appearance family */
  forceFamily?: FaFamily | null;
  /** footprints a hand-modelled landmark already stands on — never drawn twice */
  skipGids?: ReadonlySet<number>;
  /** what decides which entry of each a footprint gets */
  materials: MaterialConfig;
  /** THE ARRIVAL WAVE, and it is ONE OBJECT FOR THE WHOLE CITY — see
   *  `rise.ts` §ONE SET OF NODES. `buildingsLayer` builds one and hands it to
   *  every chunk; a caller may pass its own to share the wave with another
   *  layer that stands on these roofs. Absent, a single mesh gets a private
   *  one, which is right for a test and wrong for a city. */
  rise?: RiseNodes;
}


/** the Canvas renderer's own wall grade — `terrain.ts` §WA.wtop / WA.wbot */
const WTOP = WA.wtop;
const WBOT = WA.wbot;

/* ── AND WHAT A PHYSICAL LIGHT DOES TO THAT GRADE ───────────────────────────
   `WA.wtop`/`WA.wbot` are what a wall LOOKS LIKE on the published page: 1.14
   of its own colour at the head, 0.76 at the street, on BOTH visible faces,
   because that renderer paints rather than lights. Handed to a lit material
   the same two numbers land somewhere else entirely, because the light then
   multiplies them again — and for a VERTICAL surface that multiplier is small.

   Worked from `light.ts`'s own rig, in linear luminance, with the published
   sun `(0.2435, 0.73, 0.6346)` in scene axes:

     face            n·L      (ambient + hemisphere + sun) / PI
     ─────────────────────────────────────────────────────────
     up (a roof)     0.730    1.01
     wall, +y        0.635    0.90
     wall, +x        0.244    0.66
     wall, shadowed  0        0.51

   The ground is fine — its normals point straight up, so it takes the 1.01
   row, and the two wide cameras measure within 3 points of the Canvas page.
   The two WALL rows are the problem, and at the block and street cameras the
   frame is mostly wall: measured over the paired captures the port sat 11 and
   15 points of mean luminance under the page, with its p90 — the LIT
   surfaces — 24 and 38 points under. That is this table and nothing else.

   So the material carries the reciprocal of the wall rows' average, and the
   light supplies the difference BETWEEN them. A wall lands at 1.15 of its
   colour on the face turned to the sun and 0.85 on the face turned away,
   centred on the value the published page gives it, with the cast shadow
   dropping it to 0.66 — which is a shadow the Canvas renderer cannot draw at
   all. Lifting the LIGHTS instead would have moved the ground with them, and
   the ground already matches. */
const WALL_LIGHT_COMP = 1.50;

/* ── THE INK EDGE, AND HOW 166,166 OUTLINES COST ONE DRAW CALL A CHUNK ─────
   *"The outline is what separates one house from the one it shares a party
   wall with: two neighbours of the same tone and height are one shape without
   it."* `scene.ts` strokes every roof polygon it fills — a hairline at
   `EDGE_SHADE` of THAT ROOF'S OWN COLOUR — and this port drew none at all. It
   is a large part of why the published page reads as DRAWN and this one reads
   as rendered.

   ── THE GEOMETRY IS FREE, WHICH IS THE WHOLE TRICK ───────────────────────
   The roof ring is already in the vertex buffer — 885,490 corners, positions
   baked and rewritten by `setStep` — so the outline is an INDEX BUFFER over
   vertices that already exist and a colour attribute over the same 2.66 M
   fixed-ring slots. No second position array, no second `setStep` pass, and
   one `LineSegments` per chunk.

   ── THE WIDTH IS ONE DEVICE PIXEL AND CANNOT BE 0.7 ──────────────────────
   `edgeWidth` runs 0.7 px at district zoom to 1.5 px at street. Neither
   backend can draw either: WebGL2's `lineWidth` is clamped to 1 by every
   driver this ships on, and WebGPU's line primitive is 1 px by construction.
   A fat-line pass would be four vertices and two triangles per segment —
   1.77 M triangles for the hairline alone, on top of a scene that already
   draws 8.4 M.

   So the width is spent as COVERAGE instead: a 1 px line at `INK_W0` alpha
   lays down the same ink per unit length as a 0.7 px line at full alpha,
   which is the quantity the reader integrates. The 0.7 -> 1.5 px OPENING at
   street zoom is NOT ported and this is the record of it: it is keyed on the
   building's own projected width, and a static index buffer cannot carry a
   per-building function of the camera. `edgeInk`'s two darker values go with
   it. What is ported is the line the page draws at every camera up to
   `INK_PX0`, which is the fabric, the district frame and the whole-city
   frame — and that is where the outline is doing the work.

   ── AND THE GATE, WHICH IS NOT OPTIONAL ──────────────────────────────────
   `scene.ts` refuses the stroke under `STROKE_MIN_PX_A` — 3 px of projected
   width. At the whole-city stop a house is 1.2 px across, and outlining it
   would replace the house with its own outline: the fabric would go grey.
   A mesh has no projected width, so the gate is moved into WORLD metres at
   each band's own published stop scale — 10.34 m per pixel at the city stop,
   3.10 at the district, 1.03 at the block and the street — and the outline
   is built as THREE index buffers, one per band, each in the same year order
   as everything else so the century scrub still gates by prefix.

   Two ways this is coarser than the page's own gate, both stated: the scale
   is the band's NOMINAL one, so a reader zoomed between two stops gets the
   gate a little early or late; and the width is the ring's larger PLAN extent
   rather than its projected one, which the axonometric squash makes an upper
   bound — so a few more buildings carry an outline than the page would give
   one, never fewer. */
const EDGE_MPP: readonly number[] = [10.34, 3.10, 1.03];
const EDGE_MIN_M: readonly number[] = EDGE_MPP.map((m) => m * STROKE_MIN_PX_A);

/* ── AND WHAT THE RIG RETURNS FOR A SURFACE POINTING STRAIGHT UP ───────────
   A roof is drawn at the value the record publishes for it. `palette.ts` §39
   is the whole argument: the measured aerial palette is *"a surface under
   full sunlight"* and `PAINT_TO_PICTURE` moves it onto the picture's scale so
   that the number in the table IS the number the roof should paint. So the
   rig's job on a roof is to return 1.0, and `roofTone` — which lifts every
   entry because a roof is the top face, the one the sun lands on — assumes
   exactly that.

   MEASURED, roof by roof, at the block stop (`roofprobe.mjs`: the ring's own
   vertices averaged in scene space, projected with the engine's own camera,
   a 5 x 5 median at the roof's centroid, against the linear colour that ring
   was actually given):

     the occlusion pass   -1.0 of 255      turning it off recovers one level
     the shadow map       -1.3 of 255      and it two more
     the palette chain    0                `roofShadeTable` is byte for byte
                                           the Canvas path's `roofNF` at zero
                                           haze and unit gain — checked, not
                                           assumed
     what is left        -37 to -65        the light

   None of the four candidates the brief named is where the value goes. It
   goes into the diffuse transfer for an UP normal, which is under 1 and is
   `light.ts`'s to set — and `light.ts` is being rewritten in the same hour
   this was measured, so a constant typed in here would be stale by morning.

   So it is not typed in. The layer reads the rig OFF THE SCENE its own meshes
   were added to, on the first frame, and carries the reciprocal — the same
   move `WALL_LIGHT_COMP` makes for the two wall normals, with the number
   computed instead of transcribed. It rides on the material's colour rather
   than the vertex colour, so it costs one `setScalar` and no re-upload, and
   the roof forms' own declared values (`DE.deckv`, `DE.innerv`, `DE.outerv`)
   stay on the byte scale they were written for. */
const ROOF_COMP_MAX = 4;

/** `face/<cell>` mirrors `bldg/<cell>` row for row; the solo table's is named
 *  once. A WRONG face chunk reads as a plausible building and a missing one
 *  reads as fewer openings, so this returns null rather than guessing. */
/** `roof/<cell>` mirrors `bldg/<cell>` the way `face/<cell>` does, and
 *  `roof/solo` answers for `base/solo`. A tile with no roof chunk draws
 *  exactly as it did before this existed — see `roofscan/encode_roofs.py`
 *  §why a new kind and not new columns. */
export function roofKeyFor(key: string): string | null {
  if (key === "base/solo") return "roof/solo";
  if (key.startsWith("bldg/")) return "roof/" + key.slice(5);
  return null;
}

/** the decoded roof companion: a gid to its features, and the box run it owns */
export interface RoofTable {
  readonly at: Map<number, { o: number; n: number }>;
  /** the measured roof form, where the survey reached this footprint */
  readonly form: Map<number, { pitched: boolean; slopeDeg: number; ridgeDeg: number }>;
  /** the levels a stepped building rises through, tallest first */
  readonly steps: Map<number, { h: number; share: number }[]>;
  readonly bx: Int16Array;
  readonly by: Int16Array;
  readonly bw: Uint8Array;
  readonly bd: Uint8Array;
  readonly bh: Uint8Array;
}

/** decimetres, the unit `encode_roofs.py` writes every length in */
const ROOF_DM = 0.1;

/** over this a building is not a house whatever its class says, and an
 *  authored gable on a block of flats reads as a barn on a tower */
const HOUSE_MAX_H = 16;

/**
 * HOW MUCH FINER THE STIPPLE IS ON A HOUSE — a scale on `ROOF_GRAIN_M`, so
 * 4.6 puts the tile at 3.24 m instead of 14.9.
 *
 * The published tile is 150 marks on its side whatever that side measures.
 * At 14.9 m over a 7.6 x 5 m gable slope that is a dozen marks a metre and a
 * half across, which reads as measles; at 3.24 m the same marks are 0.32 m,
 * which is a shingle course, and the mip chain still averages them away as
 * the camera pulls back. The number is the tile side that puts one mark at
 * roughly the size of one composition shingle.
 */
const HOUSE_GRAIN = 4.6;

/**
 * THE HEIGHT BELOW WHICH THE SCAN'S LEVELS ARE NOT DRAWN.
 *
 * `HOUSE_MAX_H` is 16 and is the ceiling on what may be drawn as a house.
 * This is the same number for the same reason from the other side: under it
 * the extractor's "levels" are not massing, and above it they are. Set equal
 * so there is exactly one boundary in this file between a building the
 * drawing authors and a building the scan describes, and no band where both
 * have a say.
 */
const HOUSE_STEP_MIN_H = HOUSE_MAX_H;

/**
 * DEV ONLY, the `__cityWA` idiom: force every footprint to one appearance
 * family, so a single design can be looked at on a real street instead of
 * hunting for a building that happens to carry it. `?fam=victorian`.
 */
function forcedFamily(): FaFamily | null {
  if (typeof window === "undefined") return null;
  const m = /(?:\?|&)fam=([a-z]+)/.exec(window.location.search);
  const v = m ? m[1] : "";
  return ["victorian","classical","revival","moderne","modern","plain"]
    .includes(v) ? (v as FaFamily) : null;
}

export function decodeRoof(chunk: Chunk): RoofTable {
  const f = chunk.fields as unknown as Record<string, ArrayLike<number>>;
  const gid = f.gid as Uint32Array;
  const cn = f.cn as Uint8Array;
  const flags = f.flags as Uint8Array;
  const slope = f.slope as Uint8Array;
  const ridge = f.ridge as Uint8Array;
  const ln = (f.ln ?? []) as Uint8Array;
  const lh = (f.lh ?? []) as Uint16Array;
  const lf = (f.lf ?? []) as Uint8Array;
  const at = new Map<number, { o: number; n: number }>();
  const form = new Map<number, { pitched: boolean; slopeDeg: number; ridgeDeg: number }>();
  const steps = new Map<number, { h: number; share: number }[]>();
  let lo2 = 0;
  let o = 0;
  for (let i = 0; i < gid.length; i++) {
    const k = ln.length > i ? ln[i] : 0;
    if (k > 1) {
      const rows: { h: number; share: number }[] = [];
      for (let j = 0; j < k; j++) {
        rows.push({ h: lh[lo2 + j] * ROOF_DM, share: lf[lo2 + j] / 255 });
      }
      steps.set(gid[i], rows);
    }
    lo2 += k;
    at.set(gid[i], { o, n: cn[i] });
    form.set(gid[i], {
      pitched: (flags[i] & 1) !== 0,
      slopeDeg: slope[i],
      ridgeDeg: ridge[i],
    });
    o += cn[i];
  }
  return {
    at,
    form,
    steps,
    bx: f.bx as Int16Array, by: f.by as Int16Array,
    bw: f.bw as Uint8Array, bd: f.bd as Uint8Array, bh: f.bh as Uint8Array,
  };
}

function faceKeyFor(key: string): string | null {
  if (key === "base/solo") return "base/solo-face";
  if (key.startsWith("bldg/")) return "face/" + key.slice(5);
  return null;
}

/** how wide a bay is, in metres, when the record does not say */
const BAY_M = 4.6;
/** and how tall a storey is, when the roll gives no count */
const STOREY_M = 3.4;

/** the tinted materials this layer makes all carry a `color`; the outline's
 *  `LineBasicMaterial` does too, and the step gain is meant for none of them
 *  to escape. Written as a read rather than a cast so a material without one
 *  is skipped instead of throwing. */
function colourOf(m: Material): Color | null {
  const c = (m as unknown as { color?: Color }).color;
  return c && typeof c.setScalar === "function" ? c : null;
}

/** a stock material with the two node slots the renderer reads off it */
type NodeSlots = Material & { positionNode?: unknown; colorNode?: unknown };

/**
 * THE ARRIVAL WAVE, ONTO A STOCK MATERIAL — AND IT IS STILL A STOCK MATERIAL.
 *
 * `engine.ts` states the constraint this layer lives under: *"a hand-written
 * `ShaderMaterial` cannot cross this line. GLSL is not a node graph. Every
 * layer here therefore uses stock materials, and anything that wanted a shader
 * is either baked into a texture or expressed as geometry"* — and the reason
 * given is that stock materials are *"what the shadow pass and any future
 * post-processing can substitute their own program for."*
 *
 * A TSL node is not a `ShaderMaterial` and does not cross that line. Three's
 * own `NodeLibrary.fromMaterial` copies every own property of a stock material
 * onto the node material it builds, so `positionNode` and `colorNode` set here
 * arrive intact on both backends, with no import of `three/webgpu` and no
 * second material class in this file.
 *
 * ── AND THE SHADOW FOLLOWS, WHICH IS THE PART THAT WAS CHECKED ──────────
 * The header's warning about a custom vertex shader was that *"shadows would
 * have been cast by a city lying flat at the origin"*, because the shadow pass
 * substitutes its own program. Read in three r180's own renderer: the shadow
 * pass copies `material.positionNode` ONTO the override material for the
 * duration of the draw and puts it back afterwards. So a building that is
 * half up casts a half-height shadow, without this layer knowing there is a
 * shadow pass. It is `colorNode` that the override does not take — which is
 * correct, since a depth pass has no colour.
 *
 * The position is still BAKED and the node only ever SUBTRACTS from it: at
 * rest the term is multiplied by a uniform zero, so a settled frame is the
 * baked buffer to the last bit and everything the bake bought — real lights, a
 * real shadow map, the occlusion pass — is untouched.
 */
function applyRise(m: Material, rise: RiseNodes, colour: unknown): void {
  const slots = m as NodeSlots;
  slots.positionNode = rise.position;
  slots.colorNode = colour;
}

/**
 * The city's own locale legend, off its own manifest.
 *
 * `descriptor.ts` states what the engine is allowed to know about a city:
 * whatever arrives in the descriptor and, through it, that city's own
 * `manifest.json`. This reads four published quantities out of it — the point
 * distances are measured from, the largest such distance, and two points that
 * fix a dividing line — and hands them to `legendTones`, which is the
 * renderer's own material table.
 *
 * `LEGEND_KEYS` is DATA, not logic: it is the names THIS FORMAT gives those
 * three points, which are a city's names for its own places and mean nothing
 * to this file. A city whose manifest names them otherwise passes
 * `materials.legend` outright and never reaches here.
 */
const LEGEND_KEYS = { origin: "downtown", lineA: "ferry", lineB: "castro" } as const;

function legendFromManifest(data: CityData): LocaleLegend | null {
  const p = data.manifest.proj as unknown as Record<string, unknown> | undefined;
  const b = data.manifest.buildings as unknown as Record<string, unknown> | undefined;
  const pt = (k: string): [number, number] | null => {
    const v = p?.[k];
    return Array.isArray(v) && v.length >= 2 &&
      typeof v[0] === "number" && typeof v[1] === "number"
      ? [v[0], v[1]]
      : null;
  };
  const o = pt(LEGEND_KEYS.origin);
  const a = pt(LEGEND_KEYS.lineA);
  const c = pt(LEGEND_KEYS.lineB);
  const maxR = b?.maxR;
  if (!o || !a || !c || typeof maxR !== "number" || !(maxR > 0)) return null;
  let dx = c[0] - a[0];
  let dy = c[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (!(L > 0)) return null;
  dx /= L;
  dy /= L;
  return {
    originX: o[0], originY: o[1], maxR,
    lineX: a[0], lineY: a[1], lineDX: dx, lineDY: dy,
    tones: legendTones,
  };
}

const _c = new Color();
function toRGB(hex: string): [number, number, number] {
  /* the palette entries are sRGB hex; three.js wants the working (linear)
     space — see `terrain.ts` §sRGB IN, LINEAR OUT */
  _c.setStyle(hex, SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}

/**
 * One mesh for one chunk of footprints.
 *
 * Returns null when the chunk has nothing drawable, so a caller can walk every
 * chunk without a special case.
 */
export function buildingsMesh(
  tb: BldgTable,
  o: BuildingsLayerOptions,
): {
  meshes: Object3D[];
  setStep: (zex: number, zexb: number) => void;
  setBand: (step: number) => void;
  setYear: (year: number | undefined) => void;
  /** the wall materials, which carry `WALL_LIGHT_COMP` in their vertices */
  materials: Material[];
  /** the roof material alone: it takes the up-face compensation as well */
  roofMaterials: Material[];
} | null {
  const n = tb.n;
  if (!n) return null;
  const rise = o.rise ?? riseNodes();

  const nv = tb.off[n];
  /* ── THREE RINGS, NOT TWO, AND THE THIRD IS WHY WALLS READ AS WALLS ─────
     The first cut shared the roof ring between the roof fan and the tops of
     the walls, which is one ring fewer and looks like a saving. It is not:
     a wall then interpolates from its own colour at the foot to the ROOF's
     colour at the top, so every wall in the city is a gradient INTO the tar
     of its own roof and the whole frame goes grey-brown. The third ring sits
     at the same height as the roof ring and carries the WALL's colour, lifted
     — `WA.wtop` — while the foot carries it dropped — `WA.wbot`. That pair is
     the Canvas renderer's own `wallGrad`, and it is what makes a wall look
     lit from the sky rather than stained from above. */
  const V = nv * 3;
  const aXZ = new Float32Array(V * 2);
  const aElev = new Float32Array(V);
  const aH = new Float32Array(V);
  const aCol = new Float32Array(V * 3);
  /* the outline's colour, over the FIXED rings only: the line indices below
     reference the roof ring and nothing else, so this is 2.66 M slots for the
     city rather than the 6.95 M the form vertices bring. Eight bits, because
     an ink is a dark colour and a 1/255 step of a dark linear value is under
     one step of the 8-bit frame it lands in. */
  /* ── FOUR BYTES A VERTEX, NOT THREE, AND WEBGPU IS WHY ──────────────────
     The ink only ever needed three: a colour byte each for red, green and
     blue, `normalized` turning them back into the 0..1 the shader multiplies
     with. WebGL 2 takes that happily. WebGPU does not — a vertex buffer's
     `arrayStride` must be a multiple of four, and three bytes is not:

       Vertex buffer arrayStride (3) is not a multiple of 4.
        - While validating buffers[4]. … CreateRenderPipeline(
          "renderPipeline_LineBasicMaterial_382")

     And an invalid pipeline is not a local failure there. The whole command
     buffer it is encoded into is rejected, so the ENTIRE render pass goes
     with it: on the WebGPU backend the city came back as bare terrain,
     coastline and labels, with every building, street and tree missing, off
     this one attribute. That is what had the backend pinned to WebGL 2.

     So the fourth byte is padding, written opaque and never read as alpha by
     anything: `LineBasicMaterial` with `vertexColors` takes a four-component
     colour and uses the fourth as alpha, and 255 is the alpha it already had. */
  const aInk = new Uint8Array(V * 4);
  /* the facade's own coordinates: u counts BAYS along the wall, v counts
     STOREYS up it. Both are the building's, not the texture's. */
  const aUV = new Float32Array(V * 2);
  /* ── AND THE YEAR THE ROLL DATES THIS VERTEX'S BUILDING TO ─────────────
     `rise.ts` §THE YEAR AND THE JITTER IN ONE FLOAT. The draw range below
     answers *does this building exist yet*; this answers *how far through its
     own arrival is it*, which a prefix cannot say. Four bytes a vertex, which
     is the smallest legal vertex stride WebGPU has. */
  const aBorn = new Float32Array(V);
  /* ── AND WHERE ITS BUILDING'S CENTRE IS, FROM HERE ────────────────────
     `rise.ts` §THE WAVE IS PER BUILDING: the arrival wave is read at the
     footprint's centroid and not at the corner, or a building shears as it
     goes up. Signed 16-bit over `OFF_RANGE`, so it is 4 bytes and not 8, and
     a step is 6 cm of ground. */
  const aOff = new Int16Array(V * 2);

  /* ── THE FORM GEOMETRY GROWS; THE THREE RINGS DO NOT ────────────────────
     A tray and a hip add vertices this loop cannot count in advance — a deck
     ring, a ridge, a slope. They go into growable arrays that are appended
     AFTER the fixed three-ring block, so the ring indices stay exactly where
     the wall loop expects them and the form's own indices simply start at V.
     One concatenation at the end, no reallocation per building. */
  const exXZ: number[] = [];
  const exElev: number[] = [];
  const exH: number[] = [];
  const exCol: number[] = [];
  /* a hip's ridge and a parapet's fascia belong to the building that grew
     them, so they carry its year and rise with it — set once per footprint
     below and read by `pushVert`, because a roof builder has no idea which
     building it is inside */
  const exBorn: number[] = [];
  const exOff: number[] = [];
  let curBorn = BORN_UNDATED;
  let curCx = 0;
  let curCy = 0;
  /** the largest half-extent any footprint asks the offset to carry, so the
   *  dev accumulator can say whether `OFF_RANGE` is generous or lucky */
  let maxOff = 0;
  const OFF_Q = 32767 / OFF_RANGE;
  const packOff = (v: number): number => {
    const a = Math.abs(v);
    if (a > maxOff) maxOff = a;
    return Math.max(-32767, Math.min(32767, Math.round(v * OFF_Q)));
  };
  /* the form vertices carry a facade coordinate too now — a shopfront band's
     head is a WALL vertex and has to tile with the body above it. Everything
     the roof builders make still takes (0, 0), which is the tile leaving it
     alone. */
  const exUV: number[] = [];
  const pushVert = (
    x: number, y: number, elevM: number, hM2: number,
    r: number, g: number, b: number, u: number, v: number,
  ): number => {
    exXZ.push(x, y);
    exElev.push(elevM);
    exH.push(hM2);
    exCol.push(r, g, b);
    exUV.push(u, v);
    exBorn.push(curBorn);
    exOff.push(packOff(curCx - x), packOff(curCy - y));
    return V + exElev.length - 1;
  };
  const sink: FormSink & {
    grain: number;
    vertexUV: (
      x: number, y: number, elevM: number, hM2: number,
      r: number, g: number, b: number, u: number, v: number,
    ) => number;
  } = {
    /* ── A ROOF FORM'S VERTEX CARRIES THE GRAIN'S COORDINATE ─────────────
       World metres over the tile's own side, which is what makes the stipple
       a size on the GROUND rather than on the screen — `roof-grain.ts` §the
       tile is in world metres. `hM2` is folded into `v` so that a VERTICAL
       band inside a roof form — the parapet's inner face, the fascia — gets
       some travel across the tile instead of sampling one line of it
       stretched down 0.85 m. It is an offset on a horizontal surface and
       therefore changes nothing there.

       These vertices are referenced by roof triangles and by nothing else,
       which is why `uv` can be reused for them at all: the walls read the
       same attribute and take their bays and storeys off the three fixed
       rings. See `roof-grain.ts` §and no second uv set. */
    /* ── AND THE TILE IS NOT ONE SIZE, BECAUSE A ROOF IS NOT ONE ROOF ───
       `ROOF_GRAIN_M` is 14.9 and its own note says what it was measured for:
       the 48 px published tile at the street stop, over TAR AND GRAVEL. That
       is the right size on the roof it was measured on — a commercial deck
       forty metres across, where 150 marks in 14.9 m read as tooth.

       It is the wrong size on a house. A Sunset lot is 25 ft wide, so a
       gable slope is about 7.6 m by 5 m and half a tile covers the whole
       thing: the same 150 marks land as a dozen soft blobs a metre and a half
       across, which is measles rather than material. MEASURED off a blown-up
       capture of one roof before this existed — the marks resolve at roughly
       30 screen pixels each at the street stop.

       So the caller scales the tile for the surface it is about to draw, and
       `grain` is that scale: 1 leaves the measured tile exactly as it was,
       and a house sets it higher for a finer one. Nothing else changes — same
       texture, same mip chain, same multiply. */
    grain: 1,
    vertex(x, y, elevM, hM2, r, g, b) {
      const k = sink.grain / ROOF_GRAIN_M;
      return pushVert(x, y, elevM, hM2, r, g, b, x * k, (y + hM2) * k);
    },
    vertexUV: pushVert,
    tri(a, b, c2) {
      idxRoof.push(a, b, c2);
    },
  };
  /** the shopfront band's head ring for the footprint being emitted, -1 where
   *  no edge has asked for one yet. Reset at the end of each building. */
  let maxRing = 3;
  for (let i = 0; i < n; i++) maxRing = Math.max(maxRing, tb.off[i + 1] - tb.off[i]);
  const gndRing = new Int32Array(maxRing).fill(-1);
  /** the cornice band's FOOT ring — where a bayed frontage stops and the wall
   *  goes back onto the measured ring. Same lazy-build idiom as `gndRing`. */
  const capRing = new Int32Array(maxRing).fill(-1);

  // roofs are (c-2) triangles, walls are 2c — one index buffer for both
  let triCount = 0;
  for (let i = 0; i < n; i++) {
    const c = tb.off[i + 1] - tb.off[i];
    if (c >= 3) triCount += c - 2 + 2 * c;
  }
  /* ROOFS AND WALLS ARE TWO INDEX BUFFERS OVER ONE SET OF VERTICES. They
     need different materials — only a wall carries a facade — and three.js
     binds one material per geometry. Sharing the ATTRIBUTES and splitting only
     the indices costs nothing: the vertex data is uploaded once. */
  const idxRoof: number[] = [];
  /* ── ONE WALL BUFFER PER VOCABULARY ────────────────────────────────────
     Eight facades — a punched masonry wall, a glass curtain wall, a
     shopfront, an industrial shed, a parking deck, a sash wall, a plain
     unclassed wall and a blank party edge — and each is a different TEXTURE,
     which three.js binds per material and therefore per geometry. So the
     walls split into eight index buffers over the one set of vertices; the
     vertex data is still uploaded once and the split costs nothing but the
     draw call.

     Which one a building gets is `facadeTile`, and every branch of it is a
     published column: the roll's use class, its era, whether the era makes it
     glassy, whether the ground floor is a shop, and whether the wall is a
     party edge the record says takes no openings at all. */
  const idxWall: number[][] = FACADE_TILES.map(() => []);
  /* the outline, one index buffer per camera band — see `EDGE_MIN_M` */
  const idxEdge: number[][] = EDGE_MIN_M.map(() => []);
  void triCount;

  /* ── A QUAD, INTO WHICHEVER VOCABULARY THE EDGE ASKED FOR ───────────
     `bay-form.ts` builds a frontage out of quads and has no business knowing
     which of the eight facades this wall is. So the buffer is chosen here,
     once per bayed edge, and the builder is handed a function that does not
     change — one closure for the whole chunk rather than one per edge. */
  let quadInto: number[] = idxWall[0];
  const quad = (a: number, b: number, c2: number, d: number): void => {
    quadInto.push(a, b, c2, a, c2, d);
  };
  /** the same buffer, one triangle at a time — `stepForm`'s wall channel */
  const wallTri = (a: number, b: number, c2: number): void => {
    quadInto.push(a, b, c2);
  };

  /* ── THE YEAR IS A DRAW RANGE, AND THAT IS THE WHOLE TRICK ──────────────
     A century scrub has to answer, sixty times a second, *which buildings
     exist yet*. Rebuilding an index buffer per year is a pass over 166,166
     footprints; testing a year per vertex needs a custom shader, which this
     port gave up on purpose (it is what broke the shadow pass).

     Instead the buildings are EMITTED IN YEAR ORDER — undated first, because
     a footprint the roll does not date is drawn in every year, then by the
     roll's own year ascending. The set that exists in year Y is then a
     PREFIX of the index buffer, and the gate is `setDrawRange(0, n)`: one
     number, no upload, no rebuild, correct at any frame rate. */
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  /* ── §THE BORROWED YEAR MAY NOT OUTRUN THE REGISTER ───────────────────
     20,571 footprints fly `FLAG_BLOCKYEAR`: their year is the 25th-percentile
     year of the OTHER parcels on their own assessor block — a real year, and
     not theirs. Nothing gated on the bit, so they arrived indistinguishably
     from the 142,679 dated by their own parcel, and one of them is 174 m, the
     tenth tallest structure in San Francisco, on a block whose lower quartile
     is 1906. The map's first frame had a curtain-wall tower standing in it.

     The block statistic is not wrong about the block. It is wrong about the
     OUTLIER: a tower on a block of 1906 fabric is precisely the building a
     lower quartile cannot speak for.

     So a borrowed year is held to a floor, and the floor dates nothing. It is
     computed in `build_height_floor.py` out of the own-parcel cohort alone —
     for a height H, the earliest year the roll dates anything at least that
     tall — and it refuses only what the register makes impossible. MEASURED:
     7 of the 20,571 move, 4 of them 40 m or over, and the tower goes from
     1906 to 1917.

     A footprint dated by its OWN parcel is not floored: that is the assessor
     speaking about that building and this layer does not overrule it. Nor is
     an undated one, which is drawn in every year on purpose — `time.ts`, the
     undated street trees' rule — and is a different decision entirely. */
  const floorFor = (hM: number): number => {
    const steps = o.heightFloor;
    if (!steps || !steps.length) return 0;
    let f = 0;
    for (const [h0, y0] of steps) {
      if (hM < h0) break;
      f = y0;
    }
    return f;
  };
  const yearOf = (i: number): number => {
    if ((tb.u[i] & FLAG_NOYEAR) !== 0) return -1;
    const y = 1849 + tb.yr[i];
    return (tb.u[i] & FLAG_BLOCKYEAR) !== 0
      ? Math.max(y, floorFor(tb.h[i]))
      : y;
  };
  const ord = Array.from(order).sort((a, b) => yearOf(a) - yearOf(b) || a - b);
  /** for each emitted building, the year it starts existing (-1 = always) */
  const emittedYear: number[] = [];
  /** index-buffer length after each emitted building */
  const roofMark: number[] = [];
  const wallMark: number[][] = FACADE_TILES.map(() => []);
  const edgeMark: number[][] = EDGE_MIN_M.map(() => []);

  /* the roof palette with its four height shades already applied, so the
     lookup below is one index rather than a colour computation per footprint */
  const roofShadeHex = roofShadeTable(o.roofPalette);
  const roofRGB = roofShadeHex.map(toRGB);
  /* ── AND ITS OWN INK, WHICH IS NOT ONE COLOUR ────────────────────────────
     `inkFor` is a luminance STEP below the roof, clamped into [32, 52] of 255
     — not a fraction of it. `lib/city/buildings.ts` §the ink gap records why:
     over the measured 32-entry aerial palette a fixed multiply gives a gap of
     19 on the darkest roof and 96 on the lightest, so the outline disappears
     at one end and turns into a poster outline at the other. One entry per
     (palette colour, height shade), computed once for the chunk. */
  const inkRGB = roofShadeHex.map((h) => toRGB(inkFor(h, EDGE_SHADE)));
  const wallRGB = o.wallPalette.map(toRGB);
  const mat = bldgMaterials(tb, o.materials);

  /* ── DEV-ONLY, AND IT IS A MEASURING INSTRUMENT ────────────────────────
     A frame statistic cannot answer *are the roofs dark*: at the block camera
     the paired captures come out +5.0 points of mean luminance, and the roofs
     are still visibly under the published page's, because the walls are over
     it by more than the roofs are under it. So the probe is per ROOF: the
     ring's own vertex range and the colour that ring was actually given, so a
     harness can average the ring in scene space, project it with the engine's
     own camera and read the pixel the roof landed on. `__cityGLRoofProbe` is
     the `__cityWA` idiom and it is stripped from the production build. */
  /* DEV-ONLY, the `__cityWA` idiom: which palette bucket the city actually
     lands in. Written because the first cut came out near-black and the
     candidates — a colour space, a shade table, the nosample bit — could not
     be told apart by looking at the frame. */
  if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
    const g = globalThis as {
      __cityGLMat?: {
        roof: number[]; wall: number[]; noRowWall: number[];
        nosample: number; noRow: number; n: number; maxOff: number;
        /** where the no-roll-row footprints actually are, so a harness can
         *  point a camera at them rather than guess a neighbourhood */
        noRowAt: number[];
      };
    };
    const acc = (g.__cityGLMat ??= {
      roof: new Array(64).fill(0),
      wall: new Array(64).fill(0),
      /* the wall histogram of the footprints NO ROLL ROW REACHES, which is
         the population the locale legend exists for and the one that used to
         be a single white box repeated across the Presidio and the piers */
      noRowWall: new Array(64).fill(0),
      nosample: 0, noRow: 0, n: 0, maxOff: 0, noRowAt: [] as number[],
    });
    for (let i = 0; i < tb.n; i++) {
      acc.roof[Math.min(63, mat.roof[i])]++;
      acc.wall[Math.min(63, mat.wall[i])]++;
      if (!UMAT_WALL[tb.u[i] & USE_MASK]) {
        acc.noRow++;
        acc.noRowWall[Math.min(63, mat.wall[i])]++;
        acc.noRowAt.push(tb.cx[i], tb.cy[i]);
      }
      if ((tb.paintFlag[i] & o.materials.noSampleBit) !== 0) acc.nosample++;
      acc.n++;
    }
  }
  const DEV = typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production";
  /** roof-ring start, ring length, and the linear RGB that ring was given */
  const probe: { v0: number[]; vn: number[]; rc: number[]; gid: number[] } | null =
    DEV ? { v0: [], vn: [], rc: [], gid: [] } : null;
  /* ── AND A TALLY FOR THE BAYS, FOR THE SAME REASON THE ROOFS HAVE ONE ──
     `faBayOK` reaches 32,290 of the 166,166 published footprints. A harness
     that cannot count what the mesh actually built has no way to tell a rule
     that is not firing from a shape that is not visible, and this file has
     paid for that confusion once already elsewhere. `eligible` is the rule's
     own answer; `frontages` is how many edges took a bayed solid — always
     the smaller number, because the rule passes per BUILDING and the bay is
     built per measured FRONT edge that clears the plan and length gates. */
  const bayTally: { eligible: number; frontages: number } | null =
    DEV ? { eligible: 0, frontages: 0 } : null;

  for (const i of ord) {
    const s = tb.off[i];
    const c = tb.off[i + 1] - s;
    if (c < 3) continue;
    /* A HERO STANDS HERE, so the fabric does not: one building wearing two
       shapes is worse than either. See `heroesLayer`'s `skipGids`. */
    if (o.skipGids?.has(tb.gid[i])) continue;

    /* ── A STEPPED BUILDING IS DRAWN TO ITS PODIUM, NOT ITS TOP ──────────
       Every footprint here was one prism at one height because the record
       publishes one height. Where the survey found a building that steps, the
       BASE prism stops at the lowest measured level and `stepForm` stacks the
       rest above it; otherwise nothing above the podium would be visible,
       because a full-height prism contains all of it.

       The storey count follows the drawn height rather than the published one,
       so the podium's facade bands are the podium's. The upper steps carry no
       facade — the survey gives their extent and nothing about their walls. */
    const hMFull = roofHeight(tb.h[i], tb.hf[i]);
    const stepRows = o.roof?.steps.get(tb.gid[i]);
    /* ── AND A HOUSE DOES NOT STEP ──────────────────────────────────────
       The scan's levels are a real measurement of a real thing on a tower:
       a podium, a setback, a crown, each one tens of metres of building that
       genuinely stops before the top. On a two-storey house the same
       extractor is reading a porch roof, a dormer, a neighbour's parapet
       caught inside an oversized ring — and the drawing then stacked an
       inset slab THROUGH the authored gable, which at this camera is two
       nearly-coplanar surfaces fighting for the depth buffer. That is the
       grey shape that appeared to show THROUGH a roof in every close capture
       of the Sunset, and it is the same anachronism the rooftop objects were
       taken out for: undated 2023 detail sitting on a footprint dated 1930.

       A building under `HOUSE_STEP_MIN_H` keeps its measured height and its
       measured footprint and loses only the levels between. */
    const stepped =
      stepRows && stepRows.length > 1 &&
      hMFull >= HOUSE_STEP_MIN_H &&
      stepRows[stepRows.length - 1].h < hMFull - 2.0;
    if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
      const g = globalThis as { __cityGLStepSeen?: { rows: number; stepped: number } };
      g.__cityGLStepSeen ??= { rows: 0, stepped: 0 };
      if (stepRows) g.__cityGLStepSeen.rows++;
      if (stepped) g.__cityGLStepSeen.stepped++;
    }
    const hM = stepped ? stepRows![stepRows!.length - 1].h : hMFull;
    const elev = o.elevAt(tb.cx[i], tb.cy[i]);

    /* ── WHEN THIS FOOTPRINT ARRIVES, AND ITS PLACE IN THE SHUFFLE ───────
       The same gate the draw range uses, per vertex: the roll's own year
       byte, and `BORN_UNDATED` where the roll marks the parcel "not known" —
       those are drawn in every year and must never join a cohort, so they
       are never given a date here either.

       THE DRAW IS `legendDraw`, WHICH IS NOT THE CANVAS PAGE'S INDEX and the
       difference is stated rather than hidden: `scene.ts` folds the id into a
       table sized by the footprint count, this engine folds it into an
       18-bit one (`materials.ts` §the reproducible draw). Both are a
       deterministic uniform draw keyed on the PUBLISHED id, which is all a
       shuffle can be — the record dates a building to a year and says
       nothing about what order the year's cohort goes up in. Reusing the
       engine's table costs no memory and no second seed; the cost is that a
       building's locale tone and its place in the wave are drawn from the
       same number, which is invisible at 3.8 % of footprints and 200 ms. */
    curBorn =
      (tb.u[i] & FLAG_NOYEAR) !== 0
        ? BORN_UNDATED
        : packBorn(tb.yr[i], legendDraw(tb.gid[i]));
    /* the published centroid, which is where `scene.ts` reads the wave */
    curCx = tb.cx[i];
    curCy = tb.cy[i];

    /* ── WHICH ROOF THIS FOOTPRINT GETS, AND THE POPULATION IS PUBLISHED ──
       `isPitched` is the roll's own rule and is not widened here: the
       pre-1907 wood-frame DWELLING, single or multi family, 14,555
       footprints. Everything else is flat behind a parapet, which in this
       city is not a stylisation — it is what the stock is.

       A hip eats into the wall: its eave sits `halfRise` BELOW the measured
       top, because the measured top is the RIDGE. So the plan is asked for
       before the rings are written, and the wall's top ring goes to the eave.
       In 2D the hip is painted over the flat roof and the wall never has to
       know; on a mesh a full-height wall would push through the slopes. */
    const noYr = (tb.u[i] & FLAG_NOYEAR) !== 0;
    const ty = o.face ? (o.face.ty[i] ?? 0) : 0;
    const shop = o.face ? (o.face.shop[i] ?? 0) === 1 : false;
    const era = noYr ? -1 : faEra(1849 + tb.yr[i]);
    /* the surveyed family where the city has one, the era's otherwise —
       `facade.ts` §the six appearance families has the measurement */
    const fam: FaFamily = o.forceFamily ?? familyOfEra(era);
    const ring = { x: tb.vx, y: tb.vy, off: s, n: c };
    /* ── WHO IS PITCHED: THE SCAN WHERE IT LOOKED, THE RULE WHERE IT DID NOT ──
       `isPitched` is a POPULATION rule — the pre-1907 wood-frame dwelling —
       and `roofs.ts` §THE PRE-FIRE CITY IS PITCHED is careful that it is never
       a per-building claim, because the published zonal statistics carry no
       location and cannot support one.

       The 2023 survey does. It measured this roof, so where `roofscan` has a
       row for this footprint its answer is taken over the rule's, in both
       directions: a 1930s house with a real pitch gets one, and a pre-1907
       dwelling whose roof was replaced with a flat deck stops getting one it
       no longer has. The rule still owns every footprint the scan has not
       reached, which today is most of them. */
    /* ── THE SCAN'S ROOF FORM IS NOT READ, AND THAT IS DELIBERATE ───────
       `roofscan` publishes a `pitched` flag, a slope and a ridge per footprint
       and this layer drove the roof off them for a while. It was wrong twice
       over.

       WRONG AS A MEASUREMENT. The extractor calls 42,739 of 163,895 buildings
       pitched at a median 19 degrees, and the tail is noise rather than roofs:
       the cell at a footprint's edge straddles roof and pavement and
       differentiates to near-vertical, which needed a 60-degree cap to stop it
       reporting walls as roofs, and a 9-degree reading is inside the scan's own
       relief on a flat membrane. What survives the cap is not clean either.

       WRONG AS AN INPUT. Even where the number is right it is the wrong kind of
       input for this drawing: a roof here is an AUTHORED form chosen by what
       the record says a building IS, and a per-building slope pulls that back
       toward reproducing one roof badly instead of drawing the type well.

       The chunk still ships those columns and `decodeRoof` still reads them —
       they cost nothing and a later pass may want them — but nothing on the
       page is drawn from them. The CLUTTER and the LEVELS are untouched: what
       stands on a roof and where a building steps are measurements this
       renderer has no other source for. */
    /* ── A HOUSE IS A HOUSE BECAUSE IT IS ONE ───────────────────────────
       The record decides who — the family, from the survey's style or the
       roll's era — and the form is authored for all of them. */
    /* ── WHO IS A HOUSE ─────────────────────────────────────────────────
       The roll's own use class and the drawn height, NOT the family. A
       Craftsman is as much a house as a Queen Anne; the family decides what
       KIND of roof it gets, and `familyPitchedRoof` is that question. Gating
       the house form on `familyHasBay` sent the whole of 1925-50 — the Sunset
       and the Richmond, most of the houses in this city — back to flat lids. */
    /* the named form for this footprint, if the register gives it one */
    const civicHere = o.civicOf ? (o.civicOf.get(tb.gid[i]) ?? null) : null;
    const civicTakesRoof = civicHere !== null && civicRoofs(civicHere);
    const residential = (tb.u[i] & USE_MASK) === 0 || (tb.u[i] & USE_MASK) === 1;
    const houseHalf = civicTakesRoof ? 0 :
      residential && familyPitchedRoof(fam) && hM < HOUSE_MAX_H
        ? gableHalf(ring, hM, tb.gid[i]) : 0;
    const pitched = isPitched(
      tb.u[i] & USE_MASK,
      1849 + tb.yr[i],
      (tb.u[i] & FLAG_NOYEAR) !== 0,
    );
    const plan = houseHalf > 0 ? null : (pitched ? hipPlan(ring) : null);
    /* a form that carries its own roof stops the wall at ITS eave, and the
       drop comes from one call to the same plan the form draws with —
       `civic-form.ts` §HOW FAR THE WALL STOPS SHORT */
    const civicDrop = civicTakesRoof && civicHere
      ? civicEaveDrop(civicHere, ring, hM, tb.gid[i]) : 0;
    const wallH = civicDrop > 0
      ? Math.max(0, hM - civicDrop)
      : houseHalf > 0
        ? Math.max(0, hM - houseHalf)
        : plan ? Math.max(0, hM - plan.halfRiseM) : hM;

    /* THE MEASURED ROOF COLOUR, and the wall a step under it. Block 3 makes
       both of these a material under a real sun; for now the roof is what the
       aerial photograph measured over that footprint and the wall is the
       renderer's own table entry, which is what the Canvas path also does at
       `ri` / `wi`. */
    const rc0 = roofRGB[mat.roof[i] * 4 + mat.shade[i]] ?? [0.6, 0.58, 0.54];
    /* ── AND A PITCHED ROOF IS A DIFFERENT MATERIAL ──────────────────────
       Only where this layer is already drawing an authored pitched form.
       A flat roof keeps the photograph exactly — the camera that measured it
       was looking straight at it. `facade.ts` §A PITCHED ROOF IS A DIFFERENT
       MATERIAL has the measurement and the reason. */
    const rc = houseHalf > 0
      ? roofFamilyRGB(rc0 as [number, number, number], tb.gid[i], fam)
      : rc0;
    /* THE TABLE ENTRY IS THE ANCHOR, NOT THE ANSWER. One key covers every
       building on a fifth of this city's blocks — `facade.ts` §the blockface
       is one colour has the measurement — so each footprint moves from its
       material toward one of eight tints, on a draw keyed to its own gid. */
    const wc0 = wallRGB[mat.wall[i]] ?? [0.78, 0.72, 0.62];
    /* the family is chosen by what the building IS — a house palette on an
       office tower is a wrong claim about something anyone can walk past */
    const wcTy = o.face ? (o.face.ty[i] ?? 0) : 0;
    const wcEra = (tb.u[i] & FLAG_NOYEAR) !== 0 ? -1 : faEra(1849 + tb.yr[i]);
    const wc = wallFamilyRGB(
      wc0 as [number, number, number], tb.gid[i], wcTy, wcEra, hMFull,
    );
    if (probe) {
      probe.v0.push(s * 3 + c * 2);
      probe.vn.push(c);
      probe.rc.push(rc[0], rc[1], rc[2]);
      probe.gid.push(tb.gid[i]);
    }
    /* ── WHICH FACADE, AND A NUDGE SO NEIGHBOURS ARE NOT ONE GREY ────────
       `wallJitter` is bounded to +/-3.5 % — deliberately under the 8.3 %
       smallest step of `RSHADE`, the renderer's own declared difference
       between two objects of the same material. So it breaks up a block
       without ever opening a gap the material table means something by. */
    const st2 = o.face ? (o.face.st2[i] ?? 0) : 0;
    /* ── THE 14,532 THE ROLL DOES NOT COUNT ─────────────────────────────
       Where no storey column reaches a footprint, `derivedBands` reads a
       rhythm off the MEASURED height instead — the Canvas path's own
       fallback, calibrated at 70.3 % exact and 96.3 % within one band over
       151,379 footprints. Without it 8.75 % of the city keeps a flat blank
       wall in every year at every zoom, which is most of what a reader means
       by *"all buildings look kind of the same"*. `FLAG_HEIGHT_STALE` still
       gets the flat wall, because its height is not its own. */
    /* `storeysRead` reinterprets the ONE saturated value the roll's four-bit
       storey column can carry — 15 means "fifteen or more", and read as an
       exact count it stretched the facade tile up to 5.4x over the towers.
       Counts 1..14 pass through untouched. */
    const storeysPub = storeysRead(storeysOf(tb.st[i], st2), hM, STOREY_M);
    const bands =
      storeysPub > 0
        ? storeysPub
        : derivedBands(hM, (tb.u[i] & FLAG_HEIGHT_STALE) !== 0);
    const keyOf = (role: number): FacadeKey => ({
      family: fam,
      type: ty,
      era,
      storeys: bands,
      shop,
      role,
      glassy: era >= 0 && faGlassy(ty, era),
    });
    /* the roles this ring actually carries, so the tile is looked up at most
       three times a building rather than once an edge */
    const roles = o.face ? o.face.role : null;
    const tileFor: number[] = [];
    const gndFor: number[] = [];
    for (let r = 0; r < 3; r++) {
      tileFor.push(facadeTile(keyOf(r)));
      gndFor.push(facadeGroundTile(keyOf(r)));
    }
    /* DEV-ONLY: which vocabulary each building's FRONT lands in, weighted by
       the wall area it will paint. A count alone cannot answer *why does the
       frame look blank* — 28,000 sheds and one convention centre are the same
       number and nothing like the same picture. */
    if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
      const g = globalThis as { __cityGLTile?: Record<string, { n: number; m2: number }> };
      g.__cityGLTile ??= {};
      const key = FACADE_TILES[tileFor[ROLE_FRONT]] ?? "?";
      const e = (g.__cityGLTile[key] ??= { n: 0, m2: 0 });
      e.n++;
      let per = 0;
      for (let k = 0; k < ring.n; k++) {
        const j = (k + 1) % ring.n;
        per += Math.hypot(
          ring.x[ring.off + j] - ring.x[ring.off + k],
          ring.y[ring.off + j] - ring.y[ring.off + k],
        );
      }
      e.m2 += per * hMFull;
    }
    /* ── THE BAY IS THE BUILDING'S, NOT A NOMINAL 4.6 m ──────────────────
       `facadeModuleM` is `faVocab().mod` — 3.1 m for a 1900s apartment
       house, 8.0 m for a modern shed. One divisor, and a row house gets
       twice the openings of the warehouse behind it at the same wall length,
       which is the rhythm the two actually have. */
    const bayM = facadeModuleM(keyOf(ROLE_FRONT)) || BAY_M;

    /* ── AND A NUDGE SO NEIGHBOURS ARE NOT ONE GREY ─────────────────────
       `wallTint` moves a building on TWO axes — value, and a small warm/cool
       swing — bounded so the widest separation it can open between two walls
       (0.070 of their shared colour) is still narrower than 0.083, the
       smallest step of `RSHADE`, which is the renderer's own declared
       difference between two objects of the SAME material. The material table
       stays what the frame reads; this is only what separates two walls
       inside one entry of it. Unclassed footprints take half the spread,
       because a row the record does not classify should not be the most
       varied thing on the block. */
    const tint = wallTint(keyOf(ROLE_FRONT), tb.gid[i]);
    const wBot: [number, number, number] = [
      wc[0] * WBOT * WALL_LIGHT_COMP * tint.r,
      wc[1] * WBOT * WALL_LIGHT_COMP * tint.g,
      wc[2] * WBOT * WALL_LIGHT_COMP * tint.b,
    ];
    const wTop: [number, number, number] = [
      wc[0] * WTOP * WALL_LIGHT_COMP * tint.r,
      wc[1] * WTOP * WALL_LIGHT_COMP * tint.g,
      wc[2] * WTOP * WALL_LIGHT_COMP * tint.b,
    ];

    /* ── HOW MANY STOREYS, AND HOW MANY BAYS ────────────────────────────
       The roll publishes a storey count for most footprints; where it does
       not, the measured height over a nominal storey is the honest stand-in
       and is rounded to at least one. Bays are not published anywhere, so
       they come from a nominal width — which is why `BAY_M` is named and
       stated rather than folded into a magic number. */
    const storeys = Math.max(1, storeysPub > 0 ? storeysPub : Math.round(hM / STOREY_M));

    /* ── DOES THIS FOOTPRINT CARRY A BAY, AND WHICH WAY IS INSIDE ────────
       `faBayOK` is the published rule and it is not widened here: a HOUSE or
       FLATS, on a measured FRONT edge, built before 1925, more than one
       storey — 32,290 of the 166,166 footprints.

       Two gates are this file's own. The role stream must actually be
       loaded, because without it every edge defaults to ROLE_FRONT and a
       building would grow bays on all four sides. And the plan must clear
       `BAY_MIN_PLAN_M`, because setting a wall back inside a footprint
       thinner than a few times the recess is a claim about the building's
       inside that nothing here can make.

       The winding is paid for only where a bay can reach: it is the ring's
       shoelace sign, which is what tells a frontage which way is in. */
    const bayOK =
      roles !== null && faBayOK(ty, era, ROLE_FRONT, bands) && familyHasBay(fam);
    if (bayTally && bayOK) bayTally.eligible++;
    let wind = 0;
    if (bayOK) {
      let a2 = 0;
      for (let k = 0; k < c; k++) {
        const k1 = (k + 1) % c;
        a2 += tb.vx[s + k] * tb.vy[s + k1] - tb.vx[s + k1] * tb.vy[s + k];
      }
      wind = a2 >= 0 ? 1 : -1;
    }

    const foot = s * 3;
    const wallTop = s * 3 + c;
    const roof = s * 3 + c * 2;
    /** the shopfront band's head at ring vertex k, built the first time an
     *  edge asks for it and reused by the edge on the other side of it */
    const groundVert = (k: number, hGnd: number): number => {
      const had = gndRing[k];
      if (had >= 0) return had;
      const t = Math.min(1, hGnd / Math.max(1e-3, wallH));
      const made = sink.vertexUV(
        tb.vx[s + k],
        tb.vy[s + k],
        elev,
        hGnd,
        wBot[0] + (wTop[0] - wBot[0]) * t,
        wBot[1] + (wTop[1] - wBot[1]) * t,
        wBot[2] + (wTop[2] - wBot[2]) * t,
        aUV[(foot + k) * 2],
        1,
      );
      gndRing[k] = made;
      return made;
    };
    /** the cornice band's foot at ring vertex k, built the first time a bayed
     *  frontage asks for it and reused by the frontage on the other side */
    const capVert = (k: number, hCap: number): number => {
      const had = capRing[k];
      if (had >= 0) return had;
      const t = Math.min(1, hCap / Math.max(1e-3, wallH));
      const made = sink.vertexUV(
        tb.vx[s + k],
        tb.vy[s + k],
        elev,
        hCap,
        wBot[0] + (wTop[0] - wBot[0]) * t,
        wBot[1] + (wTop[1] - wBot[1]) * t,
        wBot[2] + (wTop[2] - wBot[2]) * t,
        aUV[(foot + k) * 2],
        storeys * t,
      );
      capRing[k] = made;
      return made;
    };
    const ink = inkRGB[mat.roof[i] * 4 + mat.shade[i]] ?? [0.2, 0.2, 0.2];
    let run = 0;
    /** the ring's larger plan extent — the outline's gate, see `EDGE_MIN_M` */
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < c; k++) {
      const x = tb.vx[s + k];
      const y = tb.vy[s + k];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      aInk[(roof + k) * 4] = ink[0] * 255;
      aInk[(roof + k) * 4 + 1] = ink[1] * 255;
      aInk[(roof + k) * 4 + 2] = ink[2] * 255;
      aInk[(roof + k) * 4 + 3] = 255;
      if (k > 0) {
        run += Math.hypot(x - tb.vx[s + k - 1], y - tb.vy[s + k - 1]);
      }
      const u = run / bayM;
      aUV[(foot + k) * 2] = u;
      aUV[(foot + k) * 2 + 1] = 0;
      aUV[(wallTop + k) * 2] = u;
      aUV[(wallTop + k) * 2 + 1] = storeys;
      /* the ROOF ring is a roof vertex and only a roof vertex — see the
         sink above. It takes the grain's world-metre coordinate, not the
         wall's bay count. */
      aUV[(roof + k) * 2] = x / ROOF_GRAIN_M;
      aUV[(roof + k) * 2 + 1] = (y + wallH) / ROOF_GRAIN_M;
      for (const [base, hh, col] of [
        [foot + k, 0, wBot],
        [wallTop + k, wallH, wTop],
        [roof + k, wallH, rc],
      ] as const) {
        aXZ[base * 2] = x;
        aXZ[base * 2 + 1] = y;
        aElev[base] = elev;
        aH[base] = hh;
        aBorn[base] = curBorn;
        aOff[base * 2] = packOff(curCx - x);
        aOff[base * 2 + 1] = packOff(curCy - y);
        aCol[base * 3] = col[0];
        aCol[base * 3 + 1] = col[1];
        aCol[base * 3 + 2] = col[2];
      }
    }

    /* THE ROOF, AS A FAN — and it is allowed to be a fan here in a way the
       Canvas path's fill is not. A fan over a non-convex ring lays triangles
       outside the polygon, which a 2D fill would show; on the GPU those
       triangles are coplanar with the roof, at the same height, in the same
       colour, and the depth buffer resolves them into exactly the roof. What
       a fan cannot do is put roof colour where there is no roof — a fan's
       triangles all share vertex 0 and stay inside the ring's convex hull —
       so the error is bounded by the hull, and Block 6 replaces it with a
       real triangulation when roofs get their own form. */
    /* ── THE ROOF: A HIP, A TRAY, OR THE FLAT FAN AS A FALLBACK ─────────
       Each builder decides for itself and returns false when the ring will
       not take the treatment — a plan too complicated for a hip, an inset
       that inverts, a parapet taller than the building. A refusal leaves the
       flat fan standing, which is what the page drew before either existed. */
    let roofed = false;
    /* ── A HOUSE GETS A HOUSE, NOT A HIP ─────────────────────────────────
       `hipForm` is the published ring's own straight skeleton — the right
       answer when the drawing must be derivable from the record, and a low
       pyramid when what is wanted is a HOUSE. A San Francisco row house has a
       GABLE down the long axis of a 25 ft lot and a front that stands proud
       of the wall, and neither is in any column.

       So the record chooses WHO — the survey's family, or the era's — and the
       FORM is authored. See `roof-form.ts` §a house, drawn as a house. */
    /* ── AND A NAMED BUILDING MAY HAVE A FORM OF ITS OWN ────────────────
       457 of the 166,166 footprints are named in a register that also says
       what KIND of thing they are — a church, a fire station, a pier shed, a
       library, a school. `civic.ts` has the register and the rule and
       `civic-form.ts` has the five drawings. It is decided before the house
       gate and it wins: a parish church that happens to be low enough and
       classed residential enough to pass for a house is a church. */
    if (civicHere) {
      sink.grain = HOUSE_GRAIN;
      const r = civicForm(civicHere, sink, ring, elev, hM, rc, wc, tb.gid[i]);
      sink.grain = 1;
      if (r.drew && r.roofed) roofed = true;
      /* DEV-ONLY, the `__cityWA` idiom: how many of each named form were
         asked for and how many actually built. A form refused for a plan too
         small to take it is invisible in the frame and must not be. */
      if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
        const g = globalThis as { __cityGLCivic?: Record<string, { asked: number; drew: number }> };
        g.__cityGLCivic ??= {};
        const e = (g.__cityGLCivic[civicHere] ??= { asked: 0, drew: 0 });
        e.asked++; if (r.drew) e.drew++;
        const gp = globalThis as { __cityGLCivicAt?: [string, number, number, number, number][] };
        gp.__cityGLCivicAt ??= [];
        if (r.drew) gp.__cityGLCivicAt.push([civicHere, tb.gid[i], tb.cx[i], tb.cy[i], hM]);
      }
    }
    if (!roofed && houseHalf > 0) {
      /* a house's roof is shingle or tile, not gravel — a finer tile, and
         the sink's own note has the measurement */
      sink.grain = HOUSE_GRAIN;
      /* the gable END is wall and goes on the wall — `roof-form.ts` §THE
         GABLE END IS A WALL. The vocabulary is the FRONT's, because on a
         front-gabled house that triangle IS the front. */
      quadInto = idxWall[tileFor[ROLE_FRONT]];
      roofed = gableForm(sink, ring, elev, hM, rc, wc, {
        gid: tb.gid[i],
        bay: familyHasBay(fam),
        eave: familyEave(fam),
        hip: familyHipShare(fam),
        face: {
          vertexUV: pushVert,
          tri: wallTri,
          bayM,
          vPerM: storeys / Math.max(1e-3, wallH),
        },
      });
      sink.grain = 1;
    }
    if (!roofed && plan) roofed = hipForm(sink, ring, elev, hM, rc);
    /* ── AND THE TRAY BUILDS ITS FASCIA ─────────────────────────────────
       The parapet's outer face, `DE.outerv` of this roof's own colour, over
       the top 0.85 m of the wall. `roof-form.ts` §THE PARAPET'S OUTER FACE
       has why it is built rather than graded onto the wall, and `DE.outerv`
       has the measurement: three legible steps at the roof edge — coping,
       fascia, wall — instead of a building that ends in one hard line. */
    if (!roofed) {
      /* `corniceRGB` is this footprint's WALL colour: the band that oversails
         is the top of the facade, not the roof. `roof-form.ts`
         §THE COLOUR THE CORNICE WEARS has the measurement that found it. */
      /* ── AND A CORNICE IS NOT SOMETHING EVERY BUILDING HAS ──────────
         `fascia` was `true` unconditionally, so a 1970s slab oversailed like
         an 1890s Victorian. `FA_VOCAB` already says otherwise and has all
         along: its `cn` column is `[1, 1, 1, 0, 0]` — the cornice belongs to
         the pre-1950 conventions and not to the two after them.

         This is the one structural difference between a classic house and a
         modern block that this camera can actually show. It is at the
         ROOFLINE, and everything measured on this branch says wall detail is
         spent where the picture is not: six separate attempts at windows,
         bays and facade patterns all came back under 1 % of a building. */
      roofed = trayForm(sink, ring, elev, wallH, rc, {
        fascia: faVocab(ty, era, shop).cornice && familyCornice(fam) > 0,
        corniceScale: familyCornice(fam),
        corniceRGB: wc,
      });
    }
    if (!roofed) {
      for (let k = 1; k + 1 < c; k++) {
        idxRoof.push(roof, roof + k, roof + k + 1);
      }
    }
    /* ── AND WHAT IS STANDING ON IT ─────────────────────────────────────
       Measured, per footprint, off the 2023 survey. The base sits at the
       height this renderer DREW the roof at rather than the height the scan
       found it at: the two agree to a median 0.19 m, and a box floating a
       hand's breadth over its own roof is the one error a reader would
       actually see. */
    /* ── THE STEPS, PODIUM UPWARD ───────────────────────────────────────
       Each level is the published ring inset about its own centroid until its
       area matches the share the scan measured still standing there. */
    let topH = hM;
    if (stepped) {
      const rows = stepRows!;
      for (let k = rows.length - 2; k >= 0; k--) {
        const from = rows[k + 1].h;
        const to = Math.min(hMFull, rows[k].h);
        if (!(to > from)) continue;
        /* ── AND ITS SIDES GO ON THE WALL, NOT ON THE ROOF ────────────
           `roof-form.ts` §A STEP'S SIDE IS A WALL has the measurement: every
           stepped tower downtown was drawing its setbacks as blank prisms
           while its own podium, two metres below, drew a full window grid.
           The vocabulary is the FRONT's, because a setback is above the
           street and every face of it is seen. */
        quadInto = idxWall[tileFor[ROLE_FRONT]];
        const okStep = stepForm(sink, ring, tb.cx[i], tb.cy[i], rows[k].share,
                                elev, from, to, wc, rc, {
                                  vertexUV: pushVert,
                                  tri: wallTri,
                                  bayM,
                                  vPerM: storeys / Math.max(1e-3, wallH),
                                });
        if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
          const g = globalThis as { __cityGLStep?: { tried: number; drew: number } };
          g.__cityGLStep ??= { tried: 0, drew: 0 };
          g.__cityGLStep.tried++; if (okStep) g.__cityGLStep.drew++;
        }
        if (okStep) topH = Math.max(topH, to);
      }
    }
    /* ── THE SCAN'S ROOFTOP OBJECTS ARE NOT DRAWN ──────────────────────
       `roofscan` finds 422,596 of them and this layer drew them for a while,
       as a box each. Two things were wrong and the second is the one that
       settles it.

       THEY ARE NOISE AS OFTEN AS THEY ARE PLANT. A connected run of cells
       0.45 m over a roof plane is a lift overrun on one building and a
       parapet corner, a scanning artefact or a tree limb on the next. The
       extractor cannot tell them apart — it publishes an extent and a height
       and no class, and says so — so the drawing put a box on all of them.

       AND THEY ARE 2023, ON A MAP THAT SCRUBS TO 1906. A box inherited its
       building's birth year, so a footprint dated 1920 carried its air
       conditioning from 1920 onward. Air conditioning did not exist. Nothing
       here can date a rooftop object, and an undatable object has no place on
       a timeline — the trees on this map are drawn because the register
       carries a planting date, and this carries nothing.

       The columns still ship and `decodeRoof` still reads them. Nothing draws
       them. `roofscan`'s LEVELS are still drawn: where a building steps is a
       fact about its mass, not an object sitting on it, and it does not date. */
    /* ── THE WALL, EDGE BY EDGE ─────────────────────────────────────────
       The role is published PER RING VERTEX, not per building: 163,536
       measured edges saying whether this side of this footprint is a front, a
       back or a party edge against its neighbour. Reading one role for the
       whole building — as the first cut did — gives an inner-block party wall
       the same windows as the street frontage, and takes the shopfront off
       every corner shop whose first vertex happens to sit on the side street.
       So the tile is chosen here, inside the loop, and the eight index
       buffers sort the edges out. */
    const storeyM = wallH / Math.max(1, bands);
    /* ── AND THE FRONTAGE HANDS ITS EDGE OVER ───────────────────────────
       The plan gate lives here rather than beside `bayOK` because the ring's
       extent is only known once the vertex loop above has walked it. */
    const planOK =
      bayOK && Math.min(x1 - x0, y1 - y0) > BAY_MIN_PLAN_M;
    const bayed = (k: number, k1: number, tile: number): boolean => {
      if (!planOK) return false;
      const ax = tb.vx[s + k];
      const ay = tb.vy[s + k];
      const bx = tb.vx[s + k1];
      const by = tb.vy[s + k1];
      const el = Math.hypot(bx - ax, by - ay);
      if (!(el > 0)) return false;
      /* ── AND THE BAY STOPS UNDER THE CORNICE ────────────────────────
         `BAY_HEAD_M` of wall stays on the measured ring so the parapet — or
         a hip's eave — has solid under it across the whole frontage. A wall
         with no room for both the band and a bay under it is left plain. */
      const hBay = wallH - BAY_HEAD_M;
      if (!(hBay > BAY_DEPTH_M * 2)) return false;
      const cA = capVert(k, hBay);
      const cB = capVert(k1, hBay);
      quadInto = idxWall[tile];
      const built = bayForm(sink, quad, {
        ax, ay, bx, by,
        /* the ring's own inward normal: rotate the edge a quarter turn the
           way the winding says is in */
        nx: (-(by - ay) / el) * wind,
        ny: ((bx - ax) / el) * wind,
        elevM: elev,
        wallH: hBay,
        cBot: wBot,
        cTop: wTop,
        u0: aUV[(foot + k) * 2],
        moduleM: bayM,
        vTop: (storeys * hBay) / Math.max(1e-3, wallH),
        footA: foot + k,
        footB: foot + k1,
        topA: cA,
        topB: cB,
      });
      if (!built) return false;
      /* the cornice band itself, on the ring, from the bay's head to the
         wall's — the one line that crosses the frontage unbroken */
      quad(cA, cB, wallTop + k1, wallTop + k);
      return true;
    };
    for (let k = 0; k < c; k++) {
      const k1 = (k + 1) % c;
      const role = roles ? (roles[s + k] ?? ROLE_FRONT) : ROLE_FRONT;
      const tile = tileFor[role] ?? tileFor[ROLE_FRONT];
      const gnd = gndFor[role] ?? -1;

      /* ── AND WHERE THE RECORD SAYS SHOP, THE GROUND FLOOR IS A SHOP ────
         A shopfront is not a smaller window: it is the whole frontage in
         glass, to a different height, and it is the single most legible thing
         about a street at the street camera. It gets its own band of
         geometry — two triangles an edge, on the frontages that have one —
         rather than being averaged into the tile above it.

         The band's top ring is built lazily into the form arrays, so a city
         of houses pays nothing for it. `v` runs 0 at the foot and 1 at the
         band's head, which puts exactly ONE repeat of the shopfront tile in
         the band, and the body above it then runs 1..storeys — so the two
         together tile the wall continuously with no seam to correct. */
      if (gnd >= 0 && wallH > storeyM * 1.2) {
        const a0 = groundVert(k, storeyM);
        const a1 = groundVert(k1, storeyM);
        idxWall[gnd].push(foot + k, foot + k1, a1, foot + k, a1, a0);
        idxWall[tile].push(a0, a1, wallTop + k1, a0, wallTop + k1, wallTop + k);
      } else if (bayOK && role === ROLE_FRONT && bayed(k, k1, tile)) {
        if (bayTally) bayTally.frontages++;
        /* ── THE FRONTAGE IS A BAYED SOLID AND HAS BUILT ITSELF ─────────
           `bayForm` emitted the set-back wall, both corner returns and a box
           per bay, all into `idxWall[tile]`. It refuses — and this branch
           falls through to the plain quad — on a frontage too short to carry
           one, a wall shorter than twice the recess, or a plan too thin to
           give the recess up. */
      } else {
        idxWall[tile].push(
          foot + k, foot + k1, wallTop + k1, foot + k, wallTop + k1, wallTop + k,
        );
      }
    }
    /* ── AND THE OUTLINE THE ROOF BOUNDS ────────────────────────────────
       The ring itself, as line segments over vertices already in the buffer.
       A building enters a band's buffer only where its plan is wide enough
       that the page would have stroked it at that band's scale — otherwise
       the whole-city frame is 166,166 outlines over 166,166 one-pixel
       houses, which is a grey wash and not a fabric. */
    const wm = Math.max(x1 - x0, y1 - y0);
    for (let bI = 0; bI < idxEdge.length; bI++) {
      if (wm >= EDGE_MIN_M[bI]) {
        const e = idxEdge[bI];
        for (let k = 0; k < c; k++) e.push(roof + k, roof + ((k + 1) % c));
      }
      edgeMark[bI].push(idxEdge[bI].length);
    }

    gndRing.fill(-1, 0, c);
    capRing.fill(-1, 0, c);
    emittedYear.push(yearOf(i));
    roofMark.push(idxRoof.length);
    for (let tI = 0; tI < idxWall.length; tI++) wallMark[tI].push(idxWall[tI].length);
  }

  /* the fixed rings and the form geometry, as one buffer each */
  const EX = exElev.length;
  const VT = V + EX;
  const fXZ = new Float32Array(VT * 2);
  const fElev = new Float32Array(VT);
  const fH = new Float32Array(VT);
  const fCol = new Float32Array(VT * 3);
  const fUV = new Float32Array(VT * 2);
  const fBorn = new Float32Array(VT);
  const fOff = new Int16Array(VT * 2);
  fXZ.set(aXZ);
  fElev.set(aElev);
  fH.set(aH);
  fCol.set(aCol);
  fUV.set(aUV);
  fBorn.set(aBorn);
  fOff.set(aOff);
  for (let k = 0; k < EX; k++) {
    fXZ[(V + k) * 2] = exXZ[k * 2];
    fXZ[(V + k) * 2 + 1] = exXZ[k * 2 + 1];
    fElev[V + k] = exElev[k];
    fH[V + k] = exH[k];
    fCol[(V + k) * 3] = exCol[k * 3];
    fCol[(V + k) * 3 + 1] = exCol[k * 3 + 1];
    fCol[(V + k) * 3 + 2] = exCol[k * 3 + 2];
    /* form vertices take v = 0 so the facade tile leaves them alone: a
       parapet and a roof slope are not a wall and carry no windows */
    fUV[(V + k) * 2] = exUV[k * 2];
    fUV[(V + k) * 2 + 1] = exUV[k * 2 + 1];
    fBorn[V + k] = exBorn[k];
    fOff[(V + k) * 2] = exOff[k * 2];
    fOff[(V + k) * 2 + 1] = exOff[k * 2 + 1];
  }

  const attrs = {
    aH: new BufferAttribute(fH, 1),
    color: new BufferAttribute(fCol, 3),
    uv: new BufferAttribute(fUV, 2),
    aBorn: new BufferAttribute(fBorn, 1),
    /* NORMALIZED, which is what turns the short back into the -1..1 the
       shader multiplies by `OFF_RANGE` */
    aOff: new Int16BufferAttribute(fOff, 2, true),
  };
  /* ONE FEWER SLOT THAN THE OTHERS, ON PURPOSE. The line indices reference
     the roof ring only, and the roof ring lives inside the first `V` — so the
     ink stops there rather than carrying 4.3 M form vertices that no line can
     name. `normalized` is what turns the byte back into the 0..1 the shader
     multiplies with. */
  const inkAttr = new BufferAttribute(aInk, 4, true);

  /* THE POSITION, BAKED — see the header. `setStep` rewrites Y in place when
     the camera's band moves, which is the only thing that can change it. */
  const pos = new Float32Array(VT * 3);
  for (let v = 0; v < VT; v++) {
    pos[v * 3] = fXZ[v * 2];
    pos[v * 3 + 2] = fXZ[v * 2 + 1];
  }
  const posAttr = new BufferAttribute(pos, 3);
  if (probe) {
    const g = globalThis as {
      __cityGLRoofProbe?: unknown[];
      __cityGLMat?: { maxOff?: number };
    };
    (g.__cityGLRoofProbe ??= []).push({ pos, ...probe });
    /* the largest distance any vertex sits from its own footprint's centre,
       across the city — the number `OFF_RANGE` has to clear */
    if (g.__cityGLMat) {
      g.__cityGLMat.maxOff = Math.max(g.__cityGLMat.maxOff ?? 0, maxOff);
    }
  }
  if (bayTally) {
    const g = globalThis as {
      __cityGLBayProbe?: { eligible: number; frontages: number }[];
    };
    (g.__cityGLBayProbe ??= []).push(bayTally);
  }

  const make = (indices: number[]): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute("position", posAttr);
    /* ── `aElev` IS NOT UPLOADED, AND THAT IS 34.5 MB ────────────────────
       It was here for symmetry with `aH`, which the rise shader genuinely
       reads as `RISE_ATTR.HEIGHT`. Nothing reads this one: the Y of every
       vertex is baked in JS by `setStep` out of the `fElev` array, which stays
       exactly where it is — it is a CPU array, not a vertex attribute, and it
       never needed to be both. Over 8,626,306 vertices at four bytes each that
       is 34.5 MB of GPU buffer uploaded once and sampled never.

       `layers/caps.ts` keeps its own `aElev` and its test asserts it; this is
       only the fabric's. */
    g.setAttribute("aH", attrs.aH);
    g.setAttribute("color", attrs.color);
    g.setAttribute("uv", attrs.uv);
    g.setAttribute(RISE_ATTR.BORN, attrs.aBorn);
    g.setAttribute(RISE_ATTR.OFFSET, attrs.aOff);
    g.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
    return g;
  };
  const gRoof = make(idxRoof);
  /* ── THE OUTLINE'S THREE GEOMETRIES SHARE ONE VERTEX SET ───────────────
     Same `position` object as the meshes, so `setStep` moves the outline with
     the city for free and the buffer is uploaded once. Only the index and the
     colour differ, and the three bands are three index attributes swapped in
     on a band change rather than three objects in the scene. */
  const edgeIdxAttr = idxEdge.map((ix) => new BufferAttribute(new Uint32Array(ix), 1));
  const gEdge = new BufferGeometry();
  gEdge.setAttribute("position", posAttr);
  gEdge.setAttribute("color", inkAttr);
  /* ── AND EVERYTHING THE WAVE NEEDS, AT NO COST IN MEMORY ──────────────
     The outline has to rise with the roof it bounds and to move with the
     ochre under it, so it reads the same three attribute OBJECTS the meshes
     read — the built height, the arrival year, and the roof's own colour.
     Nothing new is allocated: the line's vertices ARE roof-ring vertices, so
     `attrs.color` bound a second time under `ROOF_COLOUR` is the same buffer
     already on the GPU, and the ink keeps its own eight-bit `color`. */
  gEdge.setAttribute(RISE_ATTR.HEIGHT, attrs.aH);
  gEdge.setAttribute(RISE_ATTR.BORN, attrs.aBorn);
  gEdge.setAttribute(RISE_ATTR.OFFSET, attrs.aOff);
  gEdge.setAttribute(RISE_ATTR.ROOF_COLOUR, attrs.color);
  gEdge.setIndex(edgeIdxAttr[edgeIdxAttr.length - 1]);
  /* one wall geometry per vocabulary, and the empty ones are never built */
  const wallOf: { tile: number; g: BufferGeometry }[] = [];
  for (let t = 0; t < idxWall.length; t++) {
    if (idxWall[t].length) wallOf.push({ tile: t, g: make(idxWall[t]) });
  }

  /**
   * How much of each index buffer exists in a given year — a binary search
   * over the emitted order, which is sorted by year by construction.
   */
  const upTo = (year: number | undefined): number => {
    if (year === undefined) return emittedYear.length;
    let lo = 0;
    let hi = emittedYear.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (emittedYear[mid] <= year) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** which band's outline is bound; the year range is re-applied on a change
   *  because the two gates multiply and only one of them is a prefix */
  let band = EDGE_MIN_M.length - 1;
  let yearNow: number | undefined;

  const setYear = (year: number | undefined): void => {
    yearNow = year;
    const k = upTo(year);
    gRoof.setDrawRange(0, k ? roofMark[k - 1] : 0);
    for (const w of wallOf) w.g.setDrawRange(0, k ? wallMark[w.tile][k - 1] : 0);
    gEdge.setDrawRange(0, k ? edgeMark[band][k - 1] : 0);
  };

  const setBand = (step: number): void => {
    const b = Math.max(0, Math.min(EDGE_MIN_M.length - 1, step));
    if (b === band) return;
    band = b;
    gEdge.setIndex(edgeIdxAttr[b]);
    setYear(yearNow);
  };

  const setStep = (zex: number, zexb: number): void => {
    for (let v = 0; v < VT; v++) pos[v * 3 + 1] = fElev[v] * zex + fH[v] * zexb;
    posAttr.needsUpdate = true;
    gRoof.computeBoundingSphere();
    gEdge.computeBoundingSphere();
    for (const w of wallOf) w.g.computeBoundingSphere();
  };
  setStep(3.3, o.zexb);

  /* ── FLAT SHADING, WHICH IS WHY THREE RINGS ARE ENOUGH ──────────────────
     `flatShading` makes three.js derive the face normal in the fragment
     shader from the derivatives of the view position, so a wall quad gets ONE
     normal across its face without its own copies of the two corners it
     shares.

     LAMBERT AND NOT STANDARD: this city is painted, not photographed. A
     physically based material wants roughness and metalness maps nobody
     published, and would spend its budget on specular highlights that do not
     belong in the register. Lambert is a diffuse surface under a sun and a
     sky, which is what a gouache city is. */
  const mRoof = new MeshStandardMaterial({
    /* EXPERIMENT — see `engine.ts` §the sky, as something a surface can see.
       Standard rather than Lambert on the roof ALONE, because the roof is the
       one face turned straight at the sky and Lambert cannot read an
       environment at all. Roughness is high: this is weathered tar and gravel
       catching a dome, not a mirror. */
    roughness: 0.72,
    metalness: 0.0,
    /* ── AND WHY THE FABRIC'S OWN VERTEX COLOUR IS CONSUMED BY HAND ──────
       `rise.ts` §WHAT A MATERIAL IS ACTUALLY HANDED: the ochre is a mix
       toward a fixed colour, not a factor, so it cannot ride the multiply
       three would apply here. The node reads the same `color` attribute the
       default path would have, in the same place in the chain. */
    vertexColors: false,
    /* ── AND THE ROOF ALONE IS SMOOTH-SHADED NOW ───────────────────────
       `flatShading` derives the face normal in the fragment shader from the
       derivatives of the view position, which OVERRIDES a normal map — the
       grain relief measured 0.00 % of the frame with it on and needed
       twenty-five times its gain to move 2 %. A roof is a single flat plane,
       so smooth shading and flat shading agree on it to within nothing; the
       only thing that changes is that the map now reaches the shader. The
       walls keep `flatShading` — they have real facets and need it. */
    flatShading: false,
    side: DoubleSide,
    /* ── AND THE ROOF IS A SURFACE, NOT A SWATCH ─────────────────────────
       `roof-grain.ts` is the published stipple as a world-metre texture: the
       tooth of gravel-and-tar. The uv it samples is the roof ring's and the
       roof forms' — world metres over the tile's own side — which the walls
       never read. Null in a test runner, and the roof is then the flat fill
       it was. */
    map: roofGrainTexture(),
    /* ── AND THE SAME GRAIN AS RELIEF ──────────────────────────────────
       The multiply map only DARKENS; it leaves the roof one flat plane with
       one normal. That was fine while the closest camera was 0.41 m a pixel
       and stopped being fine when `controls.ts` opened the clamp to 0.18,
       where roofs are the largest surface in frame.

       It is also the one place a normal map earns its keep here: a
       straight-UP normal can never catch a specular highlight at this fixed
       camera and sun, which is why streets on a physical material bought
       nothing. Perturbing it is what breaks that — a stippled surface has
       facets pointing many ways and some of them find the sun. The roof
       already had a physical material and a sky to reflect; it had nothing to
       reflect it with. See `roof-grain.ts` §THE SAME STIPPLE AS RELIEF. */
    normalMap: roofGrainNormal(),
  });
  applyRise(mRoof, rise, rise.colour(FRESH_ROOF));

  const materials: Material[] = [];
  const roofMaterials: Material[] = [mRoof];
  const meshes: Object3D[] = [];
  const addMesh = (g: BufferGeometry, m: Material): void => {
    const mesh = new Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  };
  addMesh(gRoof, mRoof);

  /* ── THE OUTLINE ────────────────────────────────────────────────────────
     One draw call for the chunk's whole outline. `INK_W0` is spent as alpha
     rather than as width — see `EDGE_MPP` — and the line does not write depth
     because it sits exactly ON the edge between a roof and its wall, at their
     shared depth, and a line that writes there can occlude the surface it is
     drawn to bound. Reading depth is kept: an outline behind a tower is
     hidden by the tower, which is the whole reason this port has a depth
     buffer. */
  const mEdge = new LineBasicMaterial({
    /* the ink is consumed by the node, which needs the ROOF over it as well
       as the ink under it — see `rise.ts` §THE INK IS A STEP UNDER ITS OWN
       ROOF, where leaving it alone measured 66 of 255 out */
    vertexColors: false,
    transparent: true,
    opacity: INK_W0,
    depthWrite: false,
  });
  applyRise(mEdge, rise, rise.inkColour);
  materials.push(mEdge);
  /* ── AND THE INK HAS ITS OWN ORDER, WHICH IS THE SCINTILLATION FIX ─────
     three sorts TRANSPARENT objects by `renderOrder` first and by distance
     from the camera second. This outline is transparent (its 0.7 px width is
     spent as coverage — see §THE WIDTH IS SPENT AS COVERAGE) and there is one
     per chunk, so 139 of them were sitting at the default order 0 and letting
     the distance tie-break decide. An outline is COPLANAR with the roof it
     draws, so that tie-break has nothing real to measure and returns a
     different answer every time the camera moves — a hairline on every
     building in the city, reordering against its own roof, frame after frame.

     Measured by panning the camera an exact whole number of device pixels and
     re-aligning the frames by that shift: a stable render is then identical,
     and 0.5 % of pixels differed by 18 levels or more with the worst at 162 —
     with the post chain and the shadow pass both off, which is what ruled out
     the ambient occlusion and the shadow map in turn.

     An outline belongs over the roof it outlines, so it takes an order above
     the fabric and holds it. */
  const edge = new LineSegments(gEdge, mEdge);
  edge.renderOrder = 6;
  meshes.push(edge);
  for (const w of wallOf) {
    /* ── THE TILE COMES OFF THE ATLAS AS ITS OWN TEXTURE ──────────────────
       Not a sub-rectangle of the sheet. This layer's uv is `(run / BAY_M,
       storeys)` — metres along the wall and floors up it — so BOTH
       coordinates run well past 1 and the tile has to repeat by wrapping.
       An atlas cell cannot wrap: sampling past its edge walks into the
       neighbouring vocabulary. `facadeAtlas` therefore hands back the eight
       tiles as separate textures as well as the sheet, and this is the side
       the walls use. */
    const map = o.atlas ? (o.atlas.tiles[w.tile] ?? null) : null;
    /* ── AND THE WALL FINALLY CATCHES LIGHT ────────────────────────────
       Reported: *"you didnt give any form to facades or anything its all
       flat"*. It was — a colour texture on a flat-shaded plane, with no
       normal map. The roof has had one since `roof-grain.ts`; the wall, which
       is the surface a reader at street level actually looks at, had none.

       `flatShading` HAS TO GO WITH IT, and that is not a preference. This
       renderer has already paid for it once: `buildings.ts` §the roof grain
       records that the roof's normal map moved 0.00 % of the frame until flat
       shading was turned off, because flat shading recomputes the normal per
       face and discards whatever the map said. A normal map under
       `flatShading: true` is not a subtle effect, it is no effect.

       Turning it off is safe on this geometry for the same reason it was safe
       on the roof: a wall quad is planar and its four vertices are its own, so
       the smooth normal and the face normal are the same vector. Nothing
       rounds. */
    const base = {
      /* consumed by the tint node instead — see `applyRise` below and
         `rise.ts` §WHAT A MATERIAL IS ACTUALLY HANDED */
      vertexColors: false,
      flatShading: false,
      side: DoubleSide,
      map,
      normalMap: o.atlas ? (o.atlas.normals[w.tile] ?? null) : null,
    };
    /* ── AND A CURTAIN WALL REFLECTS THE SKY INSTEAD OF SHOWING A ROOM ───
       `scene.ts` says it in those words at `flushFaces`, and `faGlassy` is
       the published rule that decides which walls are one — post-1980 of any
       class, or an OFFICE from 1950 on. `facadeTile` already routes those to
       their own index buffer and their own material, which is what makes this
       one line rather than a shader: the glass wall is the only wall in the
       city that gets a SPECULAR term, so the faces of a tower turned toward
       the sun catch it and the faces turned away do not.

       Phong and not Lambert for exactly those walls, and nothing else moves:
       under an orthographic camera the view vector is constant, so the lobe
       is constant across a flat face — one value per face rather than a
       highlight crawling over the glass, which is what a curtain wall does
       from a mile up. `shininess` is high and `specular` is dark because a
       window is a mirror at grazing angles and nearly black head-on; a value
       nearer white gives the Financial District a set of chrome bars. */
    const m = w.tile === TILE_CURTAIN
      ? new MeshPhongMaterial({ ...base, shininess: 90, specular: 0x2b3038 })
      : new MeshLambertMaterial(base);
    /* A WALL AGES LIKE A WALL: 0.42 toward the ochre and a paler arrival than
       the roof takes, which is `freshLUT`'s own split and not a second guess
       at it. A curtain wall is on the same rule — the record puts a 1985
       tower in its own six fresh years exactly as it puts a 1907 flat there,
       and the material it wears is not a reason to date it differently. */
    applyRise(m, rise, rise.colour(FRESH_WALL));
    materials.push(m);
    addMesh(w.g, m);
  }

  return { meshes, setStep, setBand, setYear, materials, roofMaterials };
}

/**
 * Every loaded footprint chunk, as one layer.
 *
 * The tier is fetched whole rather than by view — see `CityData.loadTier`. A
 * GPU renderer's cost is in the upload, not the draw, so the city arrives once
 * and every camera after that is free.
 */
export function buildingsLayer(
  data: CityData,
  o: BuildingsLayerOptions,
): CityLayer & { meshes: Object3D[]; count: number; rise: RiseNodes } {
  const meshes: Object3D[] = [];
  const setters: ((zex: number, zexb: number) => void)[] = [];
  const bandSetters: ((step: number) => void)[] = [];
  const yearSetters: ((year: number | undefined) => void)[] = [];
  const materials: Material[] = [];
  const roofMaterials: Material[] = [];
  /* ONE ATLAS FOR THE CITY. Eight tiles, built once here and shared by every
     chunk — a per-chunk atlas would be 124 copies of the same eight images. */
  const atlas = o.atlas ?? facadeAtlas();
  /* DEV-ONLY, the `__cityWA` idiom: the sheet itself, so a harness can look
     at what the vocabulary actually drew rather than at what it meant to. */
  if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
    (globalThis as { __cityGLAtlas?: unknown }).__cityGLAtlas = atlas;
  }
  /* ── AND THE CITY'S OWN LEGEND FOR THE ROWS NO ROLL ROW REACHES ────────
     `materials.legend` is the modular path and a caller may pass one. Where
     it does not, the numbers are read off the city's OWN manifest, which is
     the other thing `descriptor.ts` says the engine is allowed to know: an
     origin, the largest distance from it, and two points of a dividing line.
     `legendTones` is the renderer's material table, the same module every
     other table in this file comes from — see `materials.ts` §this file is a
     reader for that rule. A manifest that publishes none of it yields no
     legend and the neutral pair stands. */
  const mcfg = o.materials.legend === undefined
    ? { ...o.materials, legend: legendFromManifest(data) }
    : o.materials;
  /* ── ONE WAVE FOR THE WHOLE CITY ────────────────────────────────────
     Four uniforms shared by 139 chunks and every material on them, so a year
     change writes four numbers rather than a thousand, and the materials that
     read them are never touched. */
  const rise = o.rise ?? riseNodes();
  rise.setZexb(o.zexb);
  /* DEV ONLY, the `__cityWA` idiom: a wave is a SEQUENCE and a harness has to
     be able to hold one frame of it still. The film runs it at 622 ms a year
     and no capture lands on the same phase twice; this lets a run of years be
     shot at one chosen point in each of their windows. */
  if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
    (globalThis as { __cityGLRise?: unknown }).__cityGLRise = rise;
  }
  let count = 0;

  for (const c of data.manifest.chunks) {
    if (c.kind !== "bldg") continue;
    const chunk = data.get(c.k);
    if (!chunk) continue;
    const tb = decodeBldg(chunk);
    const rk = roofKeyFor(c.k);
    const rch = rk ? data.get(rk) : undefined;
    const roofTable = rch ? decodeRoof(rch) : null;
    const fk = faceKeyFor(c.k);
    const fc = fk ? data.get(fk) : undefined;
    const face = fc
      ? {
          ty: (fc.fields.ty as Uint8Array) ?? new Uint8Array(0),
          st2: (fc.fields.st2 as Uint8Array) ?? new Uint8Array(0),
          shop: (fc.fields.shop as Uint8Array) ?? new Uint8Array(0),
          role: (fc.fields.role as Uint8Array) ?? new Uint8Array(0),
        }
      : null;
    const built = buildingsMesh(tb, { ...o, atlas, face, roof: roofTable,
      forceFamily: o.forceFamily ?? forcedFamily(), materials: mcfg, rise });
    if (!built) continue;
    meshes.push(...built.meshes);
    setters.push(built.setStep);
    bandSetters.push(built.setBand);
    yearSetters.push(built.setYear);
    materials.push(...built.materials);
    roofMaterials.push(...built.roofMaterials);
    count += tb.n;
  }

  /* ── SUB-PIXEL COVERAGE, AND WHY THE FABRIC DARKENS AT WIDE ZOOM ───────
     `COVER_GAIN` is `[0.8, 0.9, 1.0]` and it is not a colour decision — it is
     a RENDERING correction the published page states in `lib/city/buildings.ts`
     §SUB-PIXEL COVERAGE. At the whole-city camera a house is about a pixel
     across and a block is roughly 40 % roof against 60 % yard, light well and
     driveway, so every roof pixel is already a BLEND of the roof and the pale
     ground beneath it. Darkening the tables makes the coverage-weighted
     average land where the colour was chosen to land. At the block camera a
     building covers whole pixels and the gain is 1.

     The port was not applying it at all, and it shows in the measurement: over
     the paired captures the GPU frame ran +10.1 (whole city) and +9.9
     (district) points of luminance ABOVE the published page, while the two
     close cameras — where the gain is 1 and nothing should differ — sat within
     3 points. The gap was exactly the two bands that carry a gain.

     ── AND IT IS RAISED TO 2.2, WHICH IS THE WHOLE SUBTLETY ────────────────
     The published `shade(hex, k)` multiplies the sRGB BYTES. three.js works in
     linear light, so the same visual darkening is `k ** 2.2` here, not `k`:
     0.8 of a byte is 0.61 of the light behind it. Passing 0.8 straight through
     would apply about a third of the correction and leave the wide cameras
     bright. */
  const gainAt = (step: number): number => (COVER_GAIN[step] ?? 1) ** 2.2;

  /** the rig's own up-face reciprocal, PER CHANNEL, once there is a rig to
   *  ask — see `up-face.ts` §AND THE SAME THING PER CHANNEL */
  let roofComp: { r: number; g: number; b: number } | null = null;
  let lastStep = 0;
  const applyGain = (step: number): void => {
    lastStep = step;
    const g = gainAt(step);
    for (const m of materials) colourOf(m)?.setScalar(g);
    /* THE ROOF ALSO CARRIES THE UP-FACE COMPENSATION — see `ROOF_COMP_MAX`.
       On the material and not in the vertices, so the roof forms' declared
       values keep the byte scale `shadeRGB` writes them on and a change costs
       one scalar rather than a 21 MB re-upload. */
    /* ── AND THE ROOF'S IS PER CHANNEL, THOUGH TODAY THAT CHANGES NOTHING ─
       A scalar can only put the roof at the right LEVEL; if the rig had a
       colour, it would leave that colour on every up face in the city. Three
       numbers instead of one, so an up face returns 1.0 on EACH channel and
       the roof paints the value the record gives it.

       MEASURED, it is currently a no-op: the same warehouse roof reads
       204.6/200.7/190.7 with it and 204.8/200.7/190.5 without. That is the
       useful part of the result — this rig's up-face light is already
       neutral, so the warmth on that roof is NOT the light, and neither is it
       the fresh-roof tint (disabling it changes nothing) nor the grain, whose
       tile mean is 0.9929 and darkens. Against a published roof that is
       neutral at 178.5/177.2/176.3, this one is warm at 204.6/200.7/190.7 —
       and a `shadeHex` multiply of a neutral entry stays neutral, so what is
       left is that this building is being given a different palette ENTRY,
       not a different shade of the same one. That is a record-to-palette
       question and it is the next thing to trace.

       This stays because it is the correct shape of the correction and it
       costs one `setRGB` instead of one `setScalar`. */
    for (const m of roofMaterials) {
      const c = colourOf(m);
      if (!c) continue;
      if (roofComp) c.setRGB(g * roofComp.r, g * roofComp.g, g * roofComp.b);
      else c.setScalar(g);
    }
  };

  return {
    name: "buildings",
    meshes,
    count,
    /* the wave, so a layer that STANDS ON THESE ROOFS can take the same one
       and go up with them — see the follow-up note in `onYear` */
    rise,
    onStep(step: number, zex: number, zexb: number) {
      applyGain(step);
      /* the shader finds a building's GROUND by subtracting what the bake
         added for its height, so the two have to be the same number — read
         off the same argument rather than off the descriptor a second time */
      rise.setZexb(zexb);
      for (const f of bandSetters) f(step);
      for (const f of setters) f(zex, zexb);
    },
    onFrame() {
      /* ── THE RIG IS READ ONCE, OFF THE SCENE THE MESHES ARE IN ─────────
         Not in the constructor: a layer is built before it is added, so there
         is no scene to ask yet and no lights in it if there were. The first
         frame is the first moment the question has an answer, and after that
         it is a cached number and a branch. */
      if (roofComp !== null || !meshes.length) return;
      const t = upFaceTransferRGB(meshes[0]);
      if (t === null || !(t.r > 0) || !(t.g > 0) || !(t.b > 0)) return;
      const cap = (v: number) => Math.min(ROOF_COMP_MAX, 1 / v);
      roofComp = { r: cap(t.r), g: cap(t.g), b: cap(t.b) };
      applyGain(lastStep);
    },
    onYear(year: number | undefined) {
      for (const f of yearSetters) f(year);
      /* ── AND THE YEAR IS NOW TWO THINGS, NOT ONE ────────────────────
         The draw range still answers *which buildings exist yet* off the
         integer, and it is still one number and no upload. What the fraction
         adds is *how far into this year we are*, which is the only new state
         a wave needs: `film.ts` §yearOut already hands out a fractional year
         while a run is going and pins it at `iy + 0.999` when it is not, so a
         reader on the rail and a film that is not running both arrive here at
         a phase of exactly 1 and the shader term collapses to zero.

         The year reaches the shader as a BYTE OFFSET from the city's own
         published epoch — `MaterialConfig.year0` — so no date is written in
         this engine and none is derived from one.

         ── AND THE FILM'S OTHER ACTS ARE NOT THIS LAYER'S ────────────────
         `film.ts` reports `FilmState.act` and a progress through it, and its
         `build` acts are read by *"a layer that raises something"*. This is
         not that layer. A `build` act names ONE object by id and raises it on
         a locked frame with the year pinned; what it names in the published
         script is a burn hairline and a set of placemarks, neither of which
         is fabric. The fabric's own act is `run`, and a `run` is entirely
         expressed by the year it hands out — which is why nothing here has
         to be told what the film is doing, and why a reader dragging the
         rail gets exactly the same code path with the fraction at zero. */
      rise.setYear(
        year === undefined ? undefined : Math.floor(year) - mcfg.year0,
      );
      rise.setPhase(risePhase(year));
    },
    dispose() {
      /* the outline is a `LineSegments` and the fabric is a `Mesh`; both hold
         a geometry and neither is the other, so the type is asked rather than
         assumed. Every geometry in here shares one position buffer, and
         three's own dispose is idempotent over that. */
      for (const m of meshes) {
        (m as { geometry?: { dispose(): void } }).geometry?.dispose();
      }
      for (const m of materials) m.dispose();
      for (const m of roofMaterials) m.dispose();
      atlas?.dispose();
      meshes.length = 0;
      setters.length = 0;
      bandSetters.length = 0;
      yearSetters.length = 0;
      materials.length = 0;
      roofMaterials.length = 0;
    },
  };
}
