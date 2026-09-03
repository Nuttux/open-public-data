/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/engine.ts — THE ENGINE.

   What the Canvas renderer is, minus everything it only does because a CPU
   cannot redraw a city sixty times a second. There is no raster slot, no
   blit, no LOD cross-fade, no content key, no inertia buffer and no motion
   tier: the frame is drawn, whole, every time it changes.

   ── WHAT IT OWNS ─────────────────────────────────────────────────────────
   The WebGL context, the scene, the camera, the render loop and the layers.
   It does NOT own: the data (that is `lib/city/data.ts`, unchanged), the
   projection (`lib/city/projection.ts`, unchanged), the year rules, the film
   or a single string a reader reads.

   ── THE LOOP ─────────────────────────────────────────────────────────────
   On demand. `invalidate()` marks the frame dirty and one `requestAnimation
   Frame` paints it; a gesture marks it dirty every frame and gets 60 fps
   because a frame costs milliseconds. Nothing is painted while nothing
   changes, which is what keeps a phone cool on a page that is standing still.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  ACESFilmicToneMapping,
  type BufferAttribute,
  type BufferGeometry,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  RGBAFormat,
  AgXToneMapping,
  CineonToneMapping,
  Color,
  NeutralToneMapping,
  NoToneMapping,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  VSMShadowMap,
  ReinhardToneMapping,
  Scene,
  Sphere,
  type Texture,
  type ToneMapping,
} from "three";
/* ── WEBGPU FIRST, WEBGL SECOND, AND ONE CODE PATH ───────────────────────
   `three/webgpu`'s renderer compiles from a NODE GRAPH rather than from
   GLSL, targets WebGPU where the browser has it, and falls back to WebGL 2
   by itself where it does not — which is every phone older than iOS 18 and a
   good share of Android. So this is not a bet on WebGPU being present: it is
   the same scene, the same materials and the same lights, taking the better
   backend when there is one.

   THE PRICE, AND IT IS WHY THE WATER LAYER WAS REWRITTEN: a hand-written
   `ShaderMaterial` cannot cross this line. GLSL is not a node graph. Every
   layer here therefore uses stock materials, and anything that wanted a
   shader is either baked into a texture (the bay) or expressed as geometry
   (everything else). That constraint has been worth more than it cost —
   stock materials are also what the shadow pass and any future
   post-processing can substitute their own program for. */
import type { TextureNode } from "three/webgpu";
import { PostProcessing, WebGPURenderer } from "three/webgpu";
import type { ShaderNodeObject } from "three/tsl";
import { pass, renderOutput, vec4 } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";

/** a pass's own texture node — the thing that carries `.rgb` and `.a` */
type PassTex = ShaderNodeObject<TextureNode>;

import { SKYC } from "@/lib/city/terrain";
import { projection, screenToPlane } from "@/lib/city/projection";
import { cityAir, type AirParams, type AirSwitches, type CityAir } from "./air";
import { orthoAo, type OrthoAo, type OrthoAoParams } from "./ao";
import {
  applyAxonCamera,
  axonBasis,
  snapCameraScale,
  snapCameraToPixels,
  type AxonBasis,
  type PlaneCamera,
} from "./camera";
import type { CityDescriptor } from "./descriptor";
import { sunRig, type SunRig } from "./light";
import { detectQuality, type QualitySettings } from "./quality";
import { cityTemporal, setTemporalKeep, type Temporal } from "./temporal";
import { applySystem } from "./systems";

/** what the post chain may put on the glass — see `CityEngine.outputFor` */
export type PostDebug = "scene" | "ao" | "air" | "tilt";

/** A drawable the engine owns: built once, told the camera, disposed at the end. */
export interface CityLayer {
  readonly name: string;
  /** called when the camera step changes — the vertical exaggeration moved */
  onStep?(step: number, zex: number, zexb: number): void;
  /** called when the century scrub moves; `undefined` is "every year" */
  onYear?(year: number | undefined): void;
  /** called before each frame, with the camera about to be used */
  onFrame?(cam: PlaneCamera, step: number): void;
  dispose(): void;
}

export interface EngineStats {
  /** frames painted since mount */
  frames: number;
  /** milliseconds the last frame's draw calls took to issue */
  lastFrameMs: number;
  /** what WebGL says it drew last frame */
  calls: number;
  triangles: number;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  descriptor: CityDescriptor;
  /** device pixel ratio ceiling — the phone tier lowers this */
  maxDpr?: number;
  /** take the WebGL 2 backend even where WebGPU exists — for an A/B */
  forceWebGL?: boolean;
  /** the device tier — see `quality.ts` */
  quality?: QualitySettings;
}

/**
 * How deep the scene is along the view axis, in scene units.
 *
 * Orthographic depth precision is LINEAR, so slack costs nothing — unlike a
 * perspective camera, where a far plane a hundred times too far eats the
 * near plane's precision and everything z-fights. A city is tens of
 * kilometres across at most; this is that, with room.
 */
const DEPTH_SPAN_M = 200_000;

/** `?release=0` keeps every vertex array in JS — the A/B for §THE COPY THE GPU ALREADY HAS */
const RELEASE_OFF =
  typeof location !== "undefined" && /[?&]release=0\b/.test(location.search);

/* ══ THE DEPTH LADDER HAD TO BECOME GEOMETRY, BECAUSE polygonOffset IS
   INERT ON THIS BACKEND ═══════════════════════════════════════════════════

   `layers/streets.ts` §DEPTH, NOT HEIGHT publishes a ladder of coplanar
   ground washes — right of way, carriageway, kerb, crossing — and separates
   them with `polygonOffset` rather than a height, for a reason that is still
   correct: in an axonometric projection a metre of Y is also tens of pixels
   of SCREEN, so lifting a wash off the ground slides it off the ground it is
   a wash OF.

   ── MEASURED: THE BIAS DOES NOTHING HERE ────────────────────────────────
   Every street material asks for it (`polygonOffset: true`, factor and units
   -2 and -3) and three.js does map it — `WebGPUPipelineUtils.js` sets
   `depthBias` and `depthBiasSlopeScale` from exactly those two fields. It
   still does not arrive. A probe that scaled BOTH by 400 and then to ZERO
   produced three BIT-IDENTICAL frames at the same camera:

     ?pof=1   871a4ab032219967fe975637a1c77aec
     ?pof=400 871a4ab032219967fe975637a1c77aec
     ?pof=0   871a4ab032219967fe975637a1c77aec

   An effect absent at 400x and unchanged at zero is not a small effect; it
   is not connected. The same frame on the WebGL backend (`?gl=1`) differs by
   32.29 % and HAS its roads, which is what named the backend as the
   difference. Why Dawn drops it is not established here and this does not
   guess; what is established is that the ladder cannot rest on it.

   ── SO THE LADDER IS AN OFFSET ALONG THE VIEW AXIS ──────────────────────
   The camera is ORTHOGRAPHIC and its bearing is fixed, so `basis.F` — the
   axis from the scene toward the eye — is a direction in which moving a
   vertex changes its DEPTH and NOTHING ELSE. There is no screen movement to
   trade away: a parallel projection maps the whole of that axis to one
   point. That is the property the old objection was about, and it is the one
   property this offset has.

   A wash opts in with `userData.wash`, and its rung is its own
   `renderOrder`, so the ladder is stated once and in one place. The step is
   small on purpose: it has to clear the gap between a wash sampled from the
   continuous elevation field and the terrain's own flat chord across a cell,
   which is centimetres, and it must not move the shadow a receiving surface
   looks up by anything a reader could see.

   `?washb=` and `?washs=` override the two, and `?washb=0&washs=0` restores
   the old behaviour exactly. */
function washArg(name: string, dflt: number): number {
  if (typeof window === "undefined") return dflt;
  const m = new RegExp(`(?:\\?|&)${name}=([0-9.]+)`).exec(window.location.search);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
/**
 * What every wash needs to clear the terrain's own chord across a cell.
 *
 * 2.5 m, and it is a MEASURED floor rather than a taste. A wash takes its
 * height from the elevation FIELD at each of its own vertices; the terrain
 * draws a flat chord between its grid corners. Across a cell on a slope the
 * chord and the field disagree, the chord can be the higher of the two, and
 * where it is the ground swallows the road. The error is therefore a
 * function of SLOPE, and the sweep says exactly that: at a flat downtown
 * street camera 2.5 m moves 0.59 % of the frame and p99 delta 4 — nothing —
 * while at Twin Peaks it moves 7.63 % and p99 delta 66, and what moves is a
 * loop road that had been arriving in disconnected pieces.
 */
const WASH_BASE_M = washArg("washb", 2.5);
/** and what one rung needs to clear the rung below it */
const WASH_STEP_M = washArg("washs", 0.25);

/* ══ WHAT A LOOK SWEEP NEEDS TO MOVE, AND ONE THING EACH ═══════════════════
   `quality.ts` already carries this idea and states why: a switch that moves
   nine things at once proves nothing about any one of them. These are the
   three the LOOK is made of that had no switch, because until now they were
   not open questions — the tone curve was off on a parity argument and
   `groundE` was the one number that "MAY NOT MOVE".

     ?tm=none|aces|agx|neutral|cineon|reinhard   the output curve
     ?exp=N                                     its exposure, default 1
     ?ge=N                                      irradiance on an up face

   Read once at construction. `groundE` reaches the rig rather than the
   renderer, so it needs a reload rather than a setter — which a capture
   harness does anyway. */
/* ══ THE SKY, AS SOMETHING A SURFACE CAN SEE ═══════════════════════════════
   MEASURED, and it is the reason this exists: NOTHING in this city has a
   specular term, including the curtain walls that a comment in
   `layers/buildings.ts` says do. Setting that material's `specular` to WHITE
   at shininess 90 moves **max 0** pixels; the roof material the same; and
   `MeshStandardMaterial` at roughness 0.18 moves max 1.

   The cause is geometric rather than a bug in any material. With no
   environment there is one specular source, the `DirectionalLight`, and under
   an ORTHOGRAPHIC camera the view vector is constant — so the half-vector
   between view and sun is ONE fixed direction for the whole frame, sitting at
   an intermediate elevation. This city is axis-aligned boxes: vertical walls,
   horizontal roofs. Nothing in it is oriented to catch that lobe, so the term
   is zero everywhere whatever material is asked for it.

   An environment fixes exactly that, because it is not a lobe: a roof sees the
   sky straight above it and a wall sees the sky at grazing incidence, and both
   are answered from the map rather than from an alignment that never happens.

   ── AND THE SKY IS THE CITY'S OWN, NOT A PHOTOGRAPH ─────────────────────
   Three bands, from the two colours this renderer already publishes: `SKYC`
   at the zenith, the descriptor's own haze paper at the horizon — the same
   paper `air.ts` recedes toward, so the environment and the aerial
   perspective agree about what the distance is made of — and a dim floor
   below, because a surface tilted down sees ground and not sky. It is a
   32 x 16 equirectangular texture, which is all a PMREM needs: this is a
   diffuse and low-gloss source, not a mirror, and every roughness above about
   0.2 is reading a heavily blurred mip of it anyway. */
function skyEnvTexture(paperCss: string): DataTexture {
  const W = 32;
  const H = 16;
  const data = new Float32Array(W * H * 4);
  const paper = new Color(paperCss);
  /* SKYC is a multiplier around 1, not a colour in [0,1] — see `light.ts`
     §rgbHex for the trap. Normalised by its own largest channel. */
  const m = Math.max(SKYC[0], SKYC[1], SKYC[2]) || 1;
  const zen = new Color(SKYC[0] / m, SKYC[1] / m, SKYC[2] / m);
  const floor = paper.clone().multiplyScalar(0.55);
  for (let y = 0; y < H; y++) {
    /* v runs 0 at the zenith to 1 at the nadir */
    const v = (y + 0.5) / H;
    let c: Color;
    if (v < 0.5) {
      /* zenith to horizon, eased so most of the dome keeps the sky's own hue
         rather than washing to paper halfway up */
      c = zen.clone().lerp(paper, Math.pow(v / 0.5, 1.7));
    } else {
      c = paper.clone().lerp(floor, (v - 0.5) / 0.5);
    }
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = 1;
    }
  }
  const t = new DataTexture(data, W, H, RGBAFormat, FloatType);
  t.mapping = EquirectangularReflectionMapping;
  t.needsUpdate = true;
  return t;
}

/**
 * ── THE BLOOM'S THREE NUMBERS, AND WHAT EACH ONE IS FOR ────────────────────
 *
 * THRESHOLD is the one that decides whether this is a lens or a filter. Below
 * the frame's own bright end it glows everything and the city goes soft and
 * milky, which is the failure mode that gives bloom a bad name. Held at 1.0 it
 * catches only what is genuinely over the diffuse white point — sun on water,
 * on steel and on the brightest roofs — and leaves a pale wall in shade alone.
 *
 * STRENGTH is deliberately low. The job is to say "this is brighter than white
 * can show", not to put a halo on the city.
 *
 * RADIUS is the spread. Wide enough to read as light and not as an outline.
 *
 * `?bloom=0` turns it off, which is what makes these a decision rather than a
 * default — and they are AUTHORED, not measured off anything.
 */
const BLOOM_STRENGTH = 0.35;
const BLOOM_RADIUS = 0.6;
const BLOOM_THRESHOLD = ((): number => {
  if (typeof window === "undefined") return 1.0;
  const v = Number(/(?:\?|&)bt=([0-9.]+)/.exec(window.location.search)?.[1]);
  return Number.isFinite(v) && v > 0 ? v : 1.0;
})();

const TONE_BY_NAME: Record<string, ToneMapping> = {
  none: NoToneMapping,
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  cineon: CineonToneMapping,
  reinhard: ReinhardToneMapping,
};

interface LookOverrides {
  tone?: ToneMapping;
  exposure?: number;
  groundE?: number;
  /** `?ibl=N` — the environment's intensity; 0 removes it entirely */
  ibl?: number;
}

export function lookOverrides(search: string): LookOverrides {
  const o: LookOverrides = {};
  const tm = /(?:\?|&)tm=([a-z]+)/.exec(search)?.[1];
  if (tm && tm in TONE_BY_NAME) o.tone = TONE_BY_NAME[tm];
  const exp = Number(/(?:\?|&)exp=([0-9.]+)/.exec(search)?.[1]);
  if (Number.isFinite(exp) && exp > 0) o.exposure = exp;
  const ge = Number(/(?:\?|&)ge=([0-9.]+)/.exec(search)?.[1]);
  if (Number.isFinite(ge) && ge > 0) o.groundE = ge;
  const ibl = Number(/(?:\?|&)ibl=([0-9.]+)/.exec(search)?.[1]);
  if (Number.isFinite(ibl) && ibl >= 0) o.ibl = ibl;
  return o;
}

export class CityEngine {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera();
  readonly descriptor: CityDescriptor;

  private readonly renderer: WebGPURenderer;
  private readonly layers: CityLayer[] = [];
  readonly sun: SunRig;
  readonly quality: QualitySettings;
  private post: PostProcessing | null = null;
  /** see `temporal.ts` — the frame keeps the frame before it */
  private temporal: Temporal | null = null;
  /* ── ON, BECAUSE IT IS WHAT STOPS THE CITY SHIMMERING ─────────────────
     0.41 % of a drag step not lining up without it, 0.00 % with — against
     the published page's own 0.00 %. It is off on WebGPU, where its copy of
     the drawing buffer comes back in a space this file cannot yet read: over
     ten real drags the frame settles at 81.5 of 255 instead of 155, which is
     the overcast. `CityGLMap.tsx` keeps that backend behind `?gpu=1` for the
     same reason.

     The check before this is ever called fixed is not the shimmer number,
     which is known — it is a SOAK: ten drags with the exposure sampled
     throughout. A feedback error compounds toward a fixed point, so a
     two-second capture reads it as fine. Twice now it has. */
  private temporalWanted = true;
  /** the raster camera the last frame was drawn from, for the reprojection */
  private lastRaster: { cx: number; cy: number; scale: number } | null = null;
  private aoPass: OrthoAo | null = null;
  private envMap: Texture | null = null;
  /**
   * `scene.environmentIntensity` — how much of the sky a surface sees.
   *
   * MEASURED at the close camera in the Inner Richmond, on the mean of the
   * frame's darkest 35 % (which is where the roofs live at this camera) and on
   * mean local standard deviation over 16 px blocks:
   *
   *     intensity    dark end    local SD
   *     0 (Lambert)     63.65      40.33
   *     0.3             69.06      40.96
   *     0.5             71.40      41.43
   *     0.7             73.21      41.90
   *     1.0             75.24      42.55
   *
   * Monotonic, so the number is a judgement and not a peak. 0.5 is taken by
   * eye: it lifts the roofs off near-black so they read as slate catching a
   * sky rather than as holes cut in the map, while keeping them clearly darker
   * than the walls. At 1.0 they start to wash and `roof-grain.ts`'s stipple
   * begins to read as scratches rather than as tooth.
   */
  private envWanted = 0.5;
  private airPass: CityAir | null = null;
  /** `null` follows the quality tier; `setPost` pins it for an A/B */
  private postWanted: boolean | null = null;
  /** what the post chain puts on the glass — anything but `"scene"` shows
   *  one term of it alone, which is the only way to judge one term */
  private postDebug: PostDebug = "scene";
  private basis: AxonBasis;
  /** the live `air.ts` dials, so a shader rebuild does not lose a sweep */
  private readonly airParams: Partial<AirParams> = {};

  private W = 0;
  private H = 0;
  private dpr = 1;
  private readonly maxDpr: number;

  private cam: PlaneCamera = { cx: 0, cy: 0, scale: 0.05 };
  /** see `rasterCam` — off only for measurement */
  private snapRaster = true;
  private step = 0;
  private year: number | undefined = undefined;

  private raf = 0;
  private dirty = true;
  private disposed = false;

  private stats: EngineStats = { frames: 0, lastFrameMs: 0, calls: 0, triangles: 0 };
  /** run after every painted frame — the 2D overlay redraws from here */
  onAfterFrame: ((cam: PlaneCamera, step: number) => void) | null = null;

  /* ══ §THE COPY THE GPU ALREADY HAS ═══════════════════════════════════════
     three keeps every vertex array in JS after the backend has uploaded it,
     so the city sat in memory twice. MEASURED on the dev page after boot:
     1,297 MB of JS heap, of which 747 MB was geometry arrays — the buildings
     527 MB, the streets 63 MB. Nothing reads those arrays again: the fabric's
     position is "baked once and never again" (`layers/buildings.ts`), a band
     change moves a uniform, a year moves a draw range. The WebGPU backend
     never calls `onUploadCallback` (only the WebGL fallback mentions it, in
     a comment), so the release is the engine's: every 60th frame the scene
     is walked and a geometry of a listed layer whose every attribute has a
     GPU buffer gets its arrays swapped for empty ones of the same type.
     `count` is a plain field on `BufferAttribute`, so draw ranges and index
     counts are untouched.

     Two things hold before an array goes:
       - the bounding sphere exists. three computes it lazily from the
         position array at the first frustum test, and a geometry its band
         hides has not had one — so every geometry sharing the position
         attribute (a chunk's roof, walls and outline share one) is given
         the sphere first, computed once and kept by attribute in
         `sphereOf` for a geometry that arrives later.
       - the attribute was uploaded: `backend.get(attr)` holds `.buffer`
         (WebGPU) or `.bufferGPU` (WebGL 2) once it was.
     A layer whose attributes change after upload (`needsUpdate` anywhere —
     caps, heroes, street markings, street detail, surround, terrain, the
     instanced ones) is not on the list. `?release=0` keeps every array, for
     an A/B. */
  private static readonly RELEASE_LAYERS: ReadonlySet<string> = new Set(["buildings", "streets"]);
  private readonly releasedGeoms = new WeakSet<BufferGeometry>();
  private readonly sphereOf = new WeakMap<BufferAttribute, Sphere>();
  private releasedBytes = 0;
  private releaseScanAt = 0;

  constructor(opts: EngineOptions) {
    this.descriptor = opts.descriptor;
    this.quality = opts.quality ?? detectQuality();
    this.maxDpr = opts.maxDpr ?? this.quality.maxDpr;

    this.renderer = new WebGPURenderer({
      canvas: opts.canvas,
      antialias: this.quality.antialias,
      alpha: false,
      powerPreference: "high-performance",
      forceWebGL: opts.forceWebGL ?? false,
    });
    this.renderer.setClearColor(new Color(this.descriptor.look.haze), 1);
    this.renderer.autoClear = true;

    /* ── AND A TONE CURVE, ON BY DEFAULT ────────────────────────────────
       §the tone map and its exposure carries the measurement that used to
       keep this at `NoToneMapping`, and the reversal. Short version: that
       measurement scored four curves on their distance from the published
       Canvas page, which is no longer what this renderer is for. Re-scored on
       the frame's own RANGE instead, at two cameras:

         curve / groundE      richmond p05-p95      downtown p05-p95
         none    2.398              112                   127
         AgX     2.398               88                    97
         ACES    2.398              126                   162
         ACES    3.2                131                   146

       AgX COMPRESSES — it is a shoulder-heavy curve meant for renders that
       genuinely overflow, and it takes this frame below no curve at all.
       ACES gives back fourteen to thirty-five levels of range at every
       setting and clips nothing (0.00 % of pixels at 254 or above).

       `?tm=none` still turns it off, which is what makes this a decision
       rather than a default. */
    this.renderer.toneMapping = NeutralToneMapping;

    /* ── THE SHADOW MAP, ON BY DEFAULT ──────────────────────────────────
       `PCFSoftShadowMap` rather than the hard one: a city's shadow edge at
       this scale is a metre or two of penumbra, and a hard edge reads as a
       cut-out. The map is re-rendered only when the scene is dirty, which is
       when the camera moved — a held frame costs nothing. */
    this.renderer.shadowMap.enabled = this.quality.shadowMap > 0;
    /* ── AND ON THE NODE PATH `PCFSoftShadowMap` IS NOT SOFT ────────────
       `light.ts` records that `shadow.radius` came back bit-identical at 12,
       and the cause is in three's own source: the WebGPU filter library picks
       `PCFSoftShadowFilter` by this very enum, and that function reads
       `mapSize` and a fixed one-texel kernel and NEVER READS `radius`. So the
       penumbra is one shadow-map texel wide whatever the radius says — at a
       4096 map fitted over the city that is a metre or two, which is a hard
       edge. Every building in the frame cuts rather than softens.

       `VSMShadowMap` selects `VSMShadowFilter` instead, which is a variance
       map: three blurs the depth buffer for real, `radius` and `blurSamples`
       both do something, and the penumbra can be wider than a texel. That is
       the only route to a soft edge on this backend short of writing a filter
       node by hand.

       `?shadow=vsm|pcfsoft|pcf|basic` so the two can be looked at side by
       side, because a variance map buys softness and can pay for it in light
       BLEED — a thin caster in front of a bright surface leaks — and whether
       that trade is worth taking is a judgement about the picture. */
    this.renderer.shadowMap.type =
      /(?:\?|&)shadow=vsm(?:&|$)/.test(
        typeof window === "undefined" ? "" : window.location.search,
      )
        ? VSMShadowMap
        : PCFSoftShadowMap;

    const lo = lookOverrides(
      typeof window === "undefined" ? "" : window.location.search,
    );
    this.sun = sunRig(this.scene, {
      mapSize: this.quality.shadowMap || 1024,
      maxBuiltY: 300 * this.descriptor.look.zexb,
      look: lo.groundE === undefined ? undefined : { groundE: lo.groundE },
    });
    if (lo.ibl !== undefined) this.envWanted = lo.ibl;
    if (lo.tone !== undefined || lo.exposure !== undefined) {
      this.renderer.toneMapping = lo.tone ?? this.renderer.toneMapping;
      this.renderer.toneMappingExposure = lo.exposure ?? 1;
    }
    if (this.quality.shadowMap === 0) this.sun.setEnabled(false);

    this.basis = axonBasis(projection);
    /* `F` as well as `R`: the shadow fit works in the LIGHT's own axes and has
       to know where a TALL thing must stand to lean into the frame — see
       `light.ts` §the shadow box is fitted in the light's axes. */
    this.sun.aimKey(this.basis.R, this.basis.F);
    this.tick = this.tick.bind(this);

    /* the dev handle, and on a published page too when the URL asks
       (`?probe=1`) — the boot and frame-cost probes run against production
       that way. A global that nothing else reads. */
    if (
      typeof globalThis !== "undefined" &&
      (process.env.NODE_ENV !== "production" ||
        (typeof location !== "undefined" && /[?&]probe=1\b/.test(location.search)))
    ) {
      (globalThis as { __cityGL?: CityEngine }).__cityGL = this;
    }
  }

  /**
   * Bring the backend up.
   *
   * WebGPU's device request is asynchronous — a constructor cannot wait for
   * it — so nothing may be rendered until this resolves. The mount awaits it
   * before adding a single layer, which also means the first frame is the
   * first COMPLETE frame rather than a flash of empty paper.
   */
  async init(): Promise<void> {
    await this.renderer.init();
    this.renderer.setClearColor(new Color(this.descriptor.look.haze), 1);
    this.buildEnvironment();
    this.buildPost();
    this.invalidate();
  }

  /**
   * ── AMBIENT OCCLUSION, AND WHY IT IS THE LAST BIG ONE ────────────────────
   *
   * A shadow map answers *is the sun blocked?* Ambient occlusion answers the
   * other half — *how much of the SKY can this point see?* — and that is what
   * darkens the inside corner where a wall meets a pavement, the strip under
   * an eave, the well between two towers. It is the single treatment that most
   * makes a render read as a physical model rather than as flat shapes, and it
   * is exactly what the Canvas renderer's `paintAO` was reaching for with a
   * blurred silhouette.
   *
   * The term itself is `ao.ts`, which is written for THIS camera: an
   * orthographic projection inverts in three multiply-adds and has one view
   * direction for the whole frame, neither of which a stock node assumes. The
   * stock `GTAONode` that used to be wired in here is gone — MEASURED, it
   * returns a uniformly white frame at all four cameras, because its default
   * radius of 0.25 view units is a quarter of a METRE in a scene measured in
   * metres and every horizon sample degenerates to NaN. `ao.ts` §why not the
   * stock GTAONode carries the full autopsy.
   *
   * ── WHAT THE CHAIN COSTS, AND WHAT IT DOES NOT COST ─────────────────────
   * One scene pass into a render target, one full-screen composite. MEASURED
   * at 1440 x 666 on the WebGL 2 backend, median of 25 fenced frames, chain
   * off then on: city 15.9 / 15.9 ms, district 14.4 / 14.4, block 9.5 / 8.4,
   * street 7.8 / 7.5 — the occlusion is inside the run-to-run noise. The
   * control that makes those numbers mean something is the tap count: 512
   * taps on the same frame costs 14.8 ms against 9.4 with the chain off, so
   * the clock does see the shader, and the twelve taps this ships with are
   * worth about a tenth of a millisecond.
   *
   * `PassNode` copies `renderer.samples` onto its own render target, so the
   * 4x MSAA the frame already had survives the detour. MEASURED against a
   * 16-sample supersampled reference at the block camera: RMSE over the edge
   * band is 7.54 without the chain and 7.62 with it, where turning MSAA off
   * costs 11.41. The post pass does not cost the frame its antialiasing.
   *
   * ── ONE TRAP FOR ANYONE MEASURING THIS ──────────────────────────────────
   * `PassNode.updateBeforeType` is `NodeUpdateType.FRAME`, and what advances
   * three's `frameId` is its OWN animation loop, once per browser animation
   * frame — not this engine's `render()` calls. So N calls to `tick()` inside
   * one task render the scene ONCE and the composite N times, and a harness
   * that does that will report the whole post chain as free. It is not a bug
   * here: `tick()` runs from `requestAnimationFrame`, one paint per frame.
   *
   * It is built inside a `try`. A backend that cannot give this chain must
   * lose the ambient occlusion and keep the city — never the other way round.
   */
  private buildPost(): void {
    if (!(this.postWanted ?? (this.quality.ao || this.airWanted))) return;
    try {
      const scenePass = pass(this.scene, this.camera);
      const colour = scenePass.getTextureNode("output");
      const depth = scenePass.getTextureNode("depth");
      const a = this.quality.ao
        ? orthoAo(depth, {
            samples: this.quality.aoSamples,
            radiusM: this.quality.aoRadiusM,
          })
        : null;
      /* `air.ts` reads the same depth texture the occlusion does — one scene
         pass, two readers. The paper it recedes toward is the descriptor's,
         never a constant here. */
      const air = this.airWanted
        ? cityAir(depth, {
            paper: this.descriptor.look.haze,
            on: {
              haze: this.quality.haze,
              tiltShift: this.quality.tiltShift,
              vignette: this.quality.vignette,
              grade: this.quality.grade,
            },
            ...this.airParams,
          })
        : null;
      /* ── AND A BLOOM, WHICH IS THE ONE THING THE CHAIN NEVER HAD ────────
         `air.ts` already carries the haze, the tilt-shift, the vignette and
         the grade, all measured against the published page. None of them is a
         LENS effect: they shape colour and they shape the frame's edges, and
         the top of the range was left doing nothing.

         That is what read as flat. This renderer has a real HDR frame — the
         sun's specular on steel and water, a white roof in full sun, a lit
         wall facing 315 degrees — and every one of those clipped to the same
         white as a pale surface in shade. A bright thing was only ever
         light-COLOURED. Bloom is the term that separates the two, and it is
         the single strongest cue that a frame came out of a renderer rather
         than off a sheet of paper.

         It reads the SCENE pass, not the composed one. The haze and the
         vignette are atmosphere and lens; letting them feed the glow would
         bloom the paper rather than the light, and would put a halo in the
         corners where the vignette darkens rather than where the sun is. */
      const glow = this.quality.bloom
        ? bloom(colour, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
        : null;

      const p = new PostProcessing(this.renderer);
      /* ── THE OUTPUT TRANSFORM RUNS BEFORE THE ACCUMULATION, NOT AFTER ────
         `PostProcessing` applies tone mapping and the colour-space encode to
         whatever `outputNode` produces. That put the transform AFTER the
         temporal mix, so the history — a copy of the framebuffer — came back
         tone-mapped while the frame it was mixed with was linear, and the
         feedback drifted every second the camera stood still. `temporal.ts`
         §and `encoded` is the fix has the measurement.

         So the same transform is applied here, by hand, to the composed frame,
         and `outputColorTransform` is turned off so it is not applied twice.
         `renderOutput` is the very node `PostProcessing` would have used. */
      p.outputColorTransform = false;
      /* THE ACCUMULATION IS LAST, over the composed frame — it has to see
         what actually reaches the glass, including the occlusion and the
         air, because those are part of what flickers. */
      const base = this.outputFor(colour, a, air);
      /* additive, and after the air: a glow is light arriving at the lens, so
         it is not hazed, not occluded and not vignetted */
      const composed = glow ? base.add(glow) : base;
      const graded = renderOutput(
        composed,
        this.renderer.toneMapping,
        this.renderer.outputColorSpace,
      );
      /* ── AND IT RUNS ON BOTH BACKENDS ────────────────────────────────
         It did not, for a while, because the copy that keeps the last frame
         was refused on WebGPU — `rgba16float` against a `bgra8unorm` target —
         and three logs that and RETURNS rather than throwing, so the failure
         was silent and the blend ran on a history that was never refreshed.
         `temporal.ts` §ASKING FOR THE TYPE DOES NOTHING HERE has the cause:
         the format is overridden for a `FramebufferTexture` and only
         `internalFormat` outranks it. */
      /* not on WebGPU — see §ON, BECAUSE IT IS WHAT STOPS THE CITY SHIMMERING */
      /* ── NOT ON WEBGPU, AND THE GATE IS HONOURED AGAIN ──────────────────
         This line read `const canAccumulate = true;` under a comment saying
         "not on WebGPU". The gate had been written and then hardcoded open,
         so the accumulation ran on a backend where it is known broken.

         WHAT IT DOES THERE, reported from the page: the city renders very
         dark, and *"when i zoom it turns off then back on"* — which is the
         signature rather than a detail. A camera move REJECTS the history, so
         during the motion a reader sees the correct frame; when it settles the
         feedback runs again and pulls it down. `temporal.ts` §AND ON WEBGPU
         THE SPACE IS NOT THE PROBLEM has the rest: forcing the sRGB
         conversion and forcing the raw sample give the SAME wrong number, so
         it is not a colour space — the float copy itself does not come back
         as the frame, and three attempts have not solved it.

         THE TRADE, and it is not close. The accumulation buys 0.41 % of a
         drag step not lining up against 0.00 % — the last of the shimmer.
         WebGPU buys, MEASURED over three interleaved passes with vsync off
         and a moving camera:

             camera      WebGL 2    WebGPU
             city         19.9 ms   13.8 ms
             district     18.9      11.4
             block        13.9       9.0

         and the gap survives with the post chain disabled on both, so it is
         not WebGPU skipping work. 60 fps is a 16.7 ms budget: WebGL is ALREADY
         OVER IT at the widest camera and WebGPU is comfortably under. That
         headroom is what the finer elevation model would spend.

         So on WebGPU the city keeps a little shimmer and is the right colour
         and half again as fast. This does not fix the copy — it stops shipping
         a known-broken pass, and the bug stays written down above. */
      const canAccumulate = this.backend !== "webgpu";
      if (this.temporalWanted && canAccumulate) {
        /* `RenderOutputNode` carries a `toneMapping` PROPERTY, which collides
           with the `toneMapping` METHOD on three's own `Node` interface, so
           the two types are not assignable in either direction. It is an
           upstream typing quirk and not a difference in what the node does —
           `PostProcessing` passes the very same node into the same place. */
        const t = cityTemporal(
          graded as unknown as Parameters<typeof cityTemporal>[0],
          this.backend === "webgpu",
          true,
        );
        t.resize(this.W * this.dpr, this.H * this.dpr);
        p.outputNode = t.node;
        this.temporal = t;
      } else {
        p.outputNode = graded;
      }
      this.post = p;
      this.aoPass = a;
      this.airPass = air;
    } catch (e) {
      console.warn("citygl: no post chain on this backend —", e);
      this.dropPost();
    }
  }

  /** true when any one of the four `air.ts` treatments is wanted */
  private get airWanted(): boolean {
    const q = this.quality;
    return q.haze || q.tiltShift || q.vignette || q.grade;
  }

  /**
   * WHAT GOES ON THE GLASS, AND THE FOUR DEBUG FRAMES.
   *
   * `"scene"` is the picture. The other three put ONE term on the glass on
   * its own, at full contrast, which is the only honest way to look at a
   * term whose whole job is to be barely visible — a haze that reads as
   * "about right" over the city is a haze nobody has actually measured.
   */
  private outputFor(colour: PassTex, a: OrthoAo | null, air: CityAir | null) {
    if (this.postDebug === "ao" && a) return vec4(a.node, a.node, a.node, 1);
    if (this.postDebug === "air" && air) return air.debugAir();
    if (this.postDebug === "tilt" && air) return air.debugTilt();
    if (air) return air.compose(colour, a?.node ?? null);
    /* the alpha stays 1 — multiplying it would make the canvas translucent
       and let the page's own background through the darkest corners */
    if (a) return vec4(colour.rgb.mul(a.node), colour.a);
    return vec4(colour.rgb, colour.a);
  }

  /**
   * Put the sky on `scene.environment` — see §the sky, as something a surface
   * can see. Built once, after the backend is up because `PMREMGenerator`
   * needs a live renderer, and behind `?ibl=` so it can be turned off for an
   * A/B without a rebuild.
   */
  private buildEnvironment(): void {
    const k = this.envWanted;
    if (!(k > 0)) return;
    try {
      /* ── AND NO `PMREMGenerator` HERE ──────────────────────────────
         That class takes a `WebGLRenderer` and this renderer is a
         `WebGPURenderer` — it does not typecheck and it is not the right
         call anyway. The node path prefilters an equirectangular
         `scene.environment` itself, on whichever backend it resolved to, so
         the texture is handed over as it is. */
      this.envMap = skyEnvTexture(this.descriptor.look.haze);
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = k;
    } catch (e) {
      /* a backend that cannot build a PMREM loses the sheen and keeps the
         city, which is the same rule the post chain is built under */
      console.warn("citygl: no environment on this backend —", e);
    }
  }

  /** drop the chain and everything it owns; the city is drawn without it */
  private dropPost(): void {
    this.airPass?.dispose();
    this.temporal?.dispose();
    this.temporal = null;
    this.post = null;
    this.aoPass = null;
    this.airPass = null;
  }

  /** turn the post chain off — the A/B uses this, and so does a failure */
  setPost(on: boolean): void {
    this.postWanted = on;
    if (!on) this.dropPost();
    else if (!this.post) this.buildPost();
    this.invalidate();
  }

  /**
   * Retune the chain without a reload — this is how the A/B harness sweeps
   * the occlusion's radius, the haze's cap and the grade's strength.
   * `samples`, `debug` and the four `air.ts` switches change the SHADER, so
   * they go through the quality settings and a rebuild; the rest are
   * uniforms and take effect on the next frame.
   */
  setPostParams(
    p: Partial<OrthoAoParams> &
      Partial<AirParams> & {
        samples?: number;
        debug?: PostDebug;
        terms?: Partial<AirSwitches>;
      },
  ): void {
    let rebuild = false;
    if (p.samples !== undefined && p.samples !== this.quality.aoSamples) {
      this.quality.aoSamples = p.samples;
      rebuild = true;
    }
    if (p.debug !== undefined && p.debug !== this.postDebug) {
      this.postDebug = p.debug;
      rebuild = true;
    }
    for (const k of ["haze", "tiltShift", "vignette", "grade"] as const) {
      const v = p.terms?.[k];
      if (v !== undefined && v !== this.quality[k]) {
        this.quality[k] = v;
        rebuild = true;
      }
    }
    /* the live dials are remembered, so a rebuild does not silently put the
       chain back to its defaults halfway through a sweep */
    for (const k of [
      "hazeCap", "hazeLenM", "tilt", "vignette", "gradeStrength", "gradeSat",
    ] as const) {
      if (p[k] !== undefined) this.airParams[k] = p[k];
    }
    if (rebuild && this.post) {
      this.dropPost();
      this.buildPost();
    }
    this.aoPass?.setParams(p);
    this.airPass?.setParams(p);
    this.invalidate();
  }

  get postOn(): boolean {
    return this.post !== null;
  }

  /** what the occlusion disc came out as this frame, world metres */
  get aoRadiusM(): number {
    return this.aoPass?.radiusUsedM ?? 0;
  }

  /** the `air.ts` chain, for a harness that wants to read what it did */
  get air(): CityAir | null {
    return this.airPass;
  }

  /** every layer the engine draws, in the order they were added */
  add(layer: CityLayer): void {
    this.layers.push(layer);
    this.stampLayer(layer.name);
    layer.onStep?.(this.step, this.zex(), this.descriptor.look.zexb);
    layer.onYear?.(this.year);
    this.seatWashes();
    this.invalidate();
  }

  /**
   * Seat every opted-in ground wash on its rung of the depth ladder — see
   * §THE DEPTH LADDER HAD TO BECOME GEOMETRY.
   *
   * The offset is along `basis.F` and therefore invisible: an orthographic
   * camera maps that whole axis to a point, so this moves depth and not one
   * pixel. It is re-applied whenever the basis changes, which is when the
   * band changes, because F is what the band moves.
   */
  private seatWashes(): void {
    const F = this.basis.F;
    this.scene.traverse((o) => {
      const u = o.userData as { wash?: boolean; washM?: number };
      if (!u.wash) return;
      /* A LAYER MAY STATE ITS OWN SEAT. The ladder's 0.25 m step separates
         coplanar washes FROM EACH OTHER, and that is all it was measured
         against. A layer that must also clear something the ladder does not
         describe cannot express that by inflating its `renderOrder` without
         also claiming a draw order it does not want -- `layers/rail.ts` needed
         a seat of 10 and would have had to ask for rung 30 to get it.
         Seating along the view axis is PURE DEPTH: measured, a 6-unit push
         moves a vertex 0.00 px on screen and 1.5e-5 in ndc z. So an explicit
         seat costs nothing visually and says what it means. */
      const d = u.washM ?? WASH_BASE_M + WASH_STEP_M * o.renderOrder;
      o.position.set(0, 0, 0).addScaledVector(F, d);
    });
  }

  /**
   * ── WHICH LAYER DREW THIS MESH, WHICH NOTHING COULD ANSWER ──────────────
   *
   * Every `CityLayer` has a `name` and none of it reached the scene graph, so
   * the only handles a probe had on a mesh were its vertex count and its
   * `renderOrder`. That is not a debugging inconvenience, it is a source of
   * WRONG ANSWERS: two separate isolations were run against the wrong mesh on
   * the strength of a vertex-count guess — one of them concluded the terrain
   * was flat cream when it had actually selected the ground plate.
   *
   * A layer builds its meshes in its own constructor and hands them to the
   * scene before `add` is ever called, so by the time we get here everything
   * this layer contributed is present and unclaimed. Walking the graph and
   * stamping whatever is still unstamped therefore attributes exactly this
   * layer's meshes, and the ordering of `add` calls does the rest.
   *
   * A mesh a layer creates LATER stays unstamped and reads as `?`, which is
   * the honest answer rather than a wrong one — it is not silently attributed
   * to whichever layer happened to register next.
   *
   * `name` and `userData` are inert: nothing in the render path reads either,
   * so this cannot change a pixel.
   */
  private stampLayer(name: string): void {
    this.scene.traverse((o) => {
      if (!(o as { isMesh?: boolean }).isMesh) return;
      if (o.userData.layer !== undefined) return;
      o.userData.layer = name;
      if (!o.name) o.name = name;
    });
  }

  /**
   * ── AND A MESH MADE LATER MUST CLAIM ITSELF, WHICH THE NOTE ABOVE GOT
   *    WRONG ─────────────────────────────────────────────────────────────
   *
   * The paragraph on `stampLayer` said a mesh a layer creates LATER "stays
   * unstamped and reads as `?`, which is the honest answer rather than a
   * wrong one". It does not. It stays unstamped only until the NEXT layer is
   * added, and then `stampLayer` claims it — so a late mesh is attributed to
   * whichever layer happened to register after the one that made it.
   *
   * It happened, and it produced a wrong answer that survived a whole
   * session: `water.ts` rebuilds its ripple and adds its foam in a microtask
   * after `add`, so both were stamped `heroes`. A ground-agreement sweep then
   * reported the hero buildings as 21.4 % sunk with a worst of -505 m, which
   * is impossible for a building and was in fact the bay.
   *
   * So a layer that builds anything after `add` calls this on it.
   */
  claim(mesh: Object3D, name: string): void {
    mesh.traverse((o) => {
      if (!(o as { isMesh?: boolean }).isMesh) return;
      o.userData.layer = name;
      if (!o.name) o.name = name;
    });
  }

  /**
   * A census of the scene by layer — the query the probes above could not ask.
   * Exposed on `window` in dev by `CityGLMap.tsx` alongside the other handles.
   */
  layerCensus(): Record<
    string,
    { meshes: number; vertices: number; orders: number[] }
  > {
    const out: Record<
      string,
      { meshes: number; vertices: number; orders: number[] }
    > = {};
    this.scene.traverse((o) => {
      const m = o as unknown as {
        isMesh?: boolean;
        geometry?: { attributes?: { position?: { count?: number } } };
        renderOrder: number;
      };
      if (!m.isMesh) return;
      const k = (o.userData.layer as string | undefined) ?? "?";
      const e = (out[k] ??= { meshes: 0, vertices: 0, orders: [] });
      e.meshes++;
      e.vertices += m.geometry?.attributes?.position?.count ?? 0;
      if (!e.orders.includes(m.renderOrder)) e.orders.push(m.renderOrder);
    });
    for (const e of Object.values(out)) e.orders.sort((a, b) => a - b);
    return out;
  }

  /** bytes of vertex data handed back to the collector so far — see §THE COPY THE GPU ALREADY HAS */
  get releasedCpuBytes(): number {
    return this.releasedBytes;
  }

  private releaseCpuArrays(): void {
    if (RELEASE_OFF || this.stats.frames < this.releaseScanAt) return;
    /* the page paints on demand, so this is every tenth PAINTED frame — a
       boot that settles after fifty frames still gets its scans */
    this.releaseScanAt = this.stats.frames + 10;
    const backend = (this.renderer as unknown as {
      backend?: { get(o: object): { buffer?: unknown; bufferGPU?: unknown } };
    }).backend;
    if (!backend) return;
    const uploaded = (a: BufferAttribute): boolean => {
      if (a.array.length === 0) return true;
      const d = backend.get(a);
      return !!(d.buffer || d.bufferGPU);
    };
    /* every listed geometry still holding arrays, and every geometry per
       position attribute — the sphere has to reach all of them */
    const todo: BufferGeometry[] = [];
    const byPos = new Map<BufferAttribute, BufferGeometry[]>();
    this.scene.traverse((o) => {
      const m = o as unknown as { isMesh?: boolean; geometry?: BufferGeometry };
      if (!m.isMesh || !m.geometry) return;
      if (!CityEngine.RELEASE_LAYERS.has(o.userData.layer as string)) return;
      const g = m.geometry;
      const pos = g.attributes.position as BufferAttribute | undefined;
      if (pos) {
        const l = byPos.get(pos);
        if (l) { if (!l.includes(g)) l.push(g); } else byPos.set(pos, [g]);
      }
      if (!this.releasedGeoms.has(g) && !todo.includes(g)) todo.push(g);
    });
    for (const g of todo) {
      const attrs = Object.values(g.attributes) as BufferAttribute[];
      const all = g.index ? [...attrs, g.index] : attrs;
      if (!all.every(uploaded)) continue;
      const pos = g.attributes.position as BufferAttribute | undefined;
      if (pos) {
        let s = this.sphereOf.get(pos) ?? null;
        if (!s) {
          if (pos.array.length === 0) continue; // gone, and no sphere kept: leave it
          g.computeBoundingSphere();
          s = g.boundingSphere;
          if (!s) continue;
          this.sphereOf.set(pos, s);
        }
        for (const g2 of byPos.get(pos) ?? []) {
          if (g2.boundingSphere === null) g2.boundingSphere = s.clone();
        }
      }
      for (const a of all) {
        if (a.array.length === 0) continue;
        this.releasedBytes += a.array.byteLength;
        const Ctor = a.array.constructor as unknown as new (n: number) => typeof a.array;
        a.array = new Ctor(0);
      }
      this.releasedGeoms.add(g);
    }
  }

  zex(): number {
    const t = this.descriptor.look.zexByStep;
    return t[Math.min(this.step, t.length - 1)] ?? t[0] ?? 1;
  }

  resize(W: number, H: number, dpr: number): void {
    const d = Math.min(this.maxDpr, Math.max(1, dpr));
    if (this.W === W && this.H === H && this.dpr === d) return;
    this.W = W;
    this.H = H;
    this.dpr = d;
    this.renderer.setPixelRatio(d);
    this.renderer.setSize(W, H, false);
    this.temporal?.resize(W * d, H * d);
    this.invalidate();
  }

  setCamera(cam: PlaneCamera): void {
    this.cam = { ...cam };
    this.invalidate();
  }

  getCamera(): PlaneCamera {
    return { ...this.cam };
  }

  /**
   * The camera step — the LOD band, and here it is ONLY the vertical
   * exaggeration.
   *
   * In the Canvas renderer a band change is a projection change and therefore
   * a full re-rasterisation and a cross-fade on the glass. Here it is two
   * uniforms: `projection.setBand` moves the maths the hit test and the
   * overlay read, and every layer is told the new pair so its shader can use
   * it. Nothing is rebuilt and nothing is faded, because nothing was baked.
   */
  setStep(step: number): void {
    /* ── THE READER BEATS THE WARM-UP ───────────────────────────────────
       `warmBands` walks the ladder in the background and puts the step back
       where it found it. If a reader turns the wheel while it is doing that,
       the step it puts back is the wrong one — the map would step to the band
       under the reader's hand and then step away from it again. So any call
       for a band the warm-up did not ask for ends the warm-up: this call wins,
       nothing is restored, and the remaining bands are simply not pre-warmed.
       They then cost what they always cost, which is the thing being traded
       away and it is the right way round. */
    if (this.warming && step !== this.warmStep) this.warming = false;
    if (step === this.step) return;
    this.temporal?.reset();
    this.step = step;
    projection.setBand(step);
    this.basis = axonBasis(projection);
    /* `F` as well as `R`: the shadow fit works in the LIGHT's own axes and has
       to know where a TALL thing must stand to lean into the frame — see
       `light.ts` §the shadow box is fitted in the light's axes. */
    this.sun.aimKey(this.basis.R, this.basis.F);
    const zex = this.zex();
    for (const l of this.layers) l.onStep?.(step, zex, this.descriptor.look.zexb);
    this.seatWashes();
    this.invalidate();
  }

  getStep(): number {
    return this.step;
  }

  /** true while `warmBands` is walking the ladder — see §THE BANDS ARE WARMED */
  private warming = false;
  /** the band `warmBands` last asked for, so `setStep` can tell its own calls
   *  from a reader's — see §THE READER BEATS THE WARM-UP */
  private warmStep = -1;

  /**
   * ── §THE BANDS ARE WARMED, ONCE, BEFORE ANYONE ASKS FOR THEM ────────────
   *
   * A band change is cheap — `setStep` above says so and it is true. The FIRST
   * one is not, and the cost is not in this file: it is every pipeline the GPU
   * has to create the first time a material is drawn, plus every per-band
   * table a layer builds lazily (`layers/terrain.ts` bakes its own hillshade,
   * its own normals and its own ground texture per band and caches them).
   *
   * MEASURED on a production build, the same 30-notch zoom four times over:
   *
   *     pass          main thread blocked      worst task
   *     in  (first)          1432 ms              570 ms
   *     out                   414 ms              164 ms
   *     in  (again)           382 ms              138 ms
   *     out (again)           390 ms              144 ms
   *
   * The first pass costs a full second more than the three identical ones
   * after it, and it is the pass a reader makes on arriving. So it is paid
   * here instead, while they are still reading the entry strip: every band is
   * stepped into, its layers told, and `compileAsync` asked to create the
   * pipelines for whatever that band made visible.
   *
   * Nothing is painted while this runs — `tick` returns early on `warming` —
   * so the reader does not see the city flick through two cameras. The step is
   * put back where it was found, and a warm-up that throws costs a warm-up.
   */
  async warmBands(bands: readonly number[]): Promise<void> {
    if (this.warming || this.disposed) return;
    const from = this.step;
    this.warming = true;
    try {
      for (const s of bands) {
        if (this.disposed || !this.warming) return;
        if (s === this.step) continue;
        this.warmStep = s;
        this.setStep(s);
        await this.renderer.compileAsync(this.scene, this.camera);
      }
    } catch {
      /* a band that will not pre-compile still compiles when it is reached */
    } finally {
      /* `warming` is already false if a reader took the wheel — see §THE
         READER BEATS THE WARM-UP. Their band is then the one that stands, and
         their own `setStep` has already asked for the frame. */
      const ours = this.warming;
      this.warming = false;
      this.warmStep = -1;
      if (!this.disposed && ours) {
        this.setStep(from);
        this.invalidate();
      }
    }
  }

  /**
   * The century scrub.
   *
   * `undefined` means every year — the settled present, which is what a
   * reader who has not touched the rail is looking at. A number gates every
   * layer to what the record can put on the ground by then, and because each
   * layer's geometry is emitted in YEAR ORDER the gate is a draw range rather
   * than a rebuild: scrubbing is free.
   */
  setYear(year: number | undefined): void {
    if (year === this.year) return;
    this.year = year;
    /* the city itself changed, so there is nothing to carry over */
    this.temporal?.reset();
    for (const l of this.layers) l.onYear?.(year);
    this.invalidate();
  }

  getYear(): number | undefined {
    return this.year;
  }

  /* ══ THE CLOCK — PRESS PLAY AND THE CITY IS BUILT, RATHER THAN SCRUBBED ══
     Daniel: *"theres no controls yet to press play from the start and then
     speed, with that on when i scrub rn i feel like stuff pops and it doesnt
     look like an animation of a city being built."*

     The pop is not a missing animation. `layers/buildings.ts` §AND THE YEAR
     IS NOW TWO THINGS already raises a building on a wave, and the wave is
     driven by the FRACTION of the year — `rise.setPhase`. A film run hands
     out a fractional year and the wave plays; a reader dragging the rail
     hands out whole years, the phase lands on exactly 1, and the shader term
     collapses to zero. So the fabric has always known how to be built. It was
     only ever asked in whole years.

     This is the clock that asks in fractions. It is NOT the film: a film is a
     directed sequence of acts with its own camera and script, and this is a
     transport — start, stop, speed, and nothing else. They do not compose and
     the film wins, because a film that is running is already handing out a
     year of its own.

     `yearsPerSecond` is real time, so a century at 6 is about seventeen
     seconds. Nothing here decides that number; the caller does. */
  private clock: {
    from: number;
    to: number;
    rate: number;
    at: number;
    last: number;
    loop: boolean;
  } | null = null;

  /** is the transport running? */
  get playing(): boolean {
    return this.clock !== null;
  }

  /**
   * Run the year forward from `from` to `to` at `yearsPerSecond`.
   *
   * Fractional throughout, which is the whole point: every layer that gates on
   * `Math.floor(year)` sees the same integers it always did, and every layer
   * that reads the fraction gets a wave instead of a step.
   */
  play(from: number, to: number, yearsPerSecond: number, loop = false): void {
    if (!(yearsPerSecond > 0) || !(to > from)) return;
    this.clock = {
      from,
      to,
      rate: yearsPerSecond,
      at: this.year !== undefined && this.year >= from && this.year < to
        ? this.year
        : from,
      last: performance.now(),
      loop,
    };
    this.setYear(this.clock.at);
    this.invalidate();
  }

  /** Stop, leaving the year where it stopped. */
  /**
   * Light one system -- "public transport", "streets", "buildings" -- and let
   * the rest of the city go quiet. `null` restores it.
   *
   * See `systems.ts`: this is a multiply on each material's own colour, so it
   * costs no geometry and is exactly reversible. The count comes back so a
   * caller can tell a mode that did nothing from one that is not wired.
   */
  setSystem(key: string | null): number {
    const touched = applySystem(this.scene, key);
    this.system = key;
    if (touched) this.invalidate();
    return touched;
  }

  /** which system is lit, if any */
  system: string | null = null;

  pause(): void {
    this.clock = null;
  }

  /** How far through the run, 0..1 — for a progress readout. */
  playProgress(): number {
    const c = this.clock;
    if (!c) return 0;
    return Math.max(0, Math.min(1, (c.at - c.from) / (c.to - c.from)));
  }

  /**
   * Advance the clock by real elapsed time. Called once a frame from `tick`.
   *
   * Returns true while it is running, which is what keeps the frame loop alive
   * — the engine is otherwise on-demand and would go back to sleep between
   * years.
   */
  private stepClock(now: number): boolean {
    const c = this.clock;
    if (!c) return false;
    const dt = Math.max(0, Math.min(0.25, (now - c.last) / 1000));
    c.last = now;
    c.at += dt * c.rate;
    if (c.at >= c.to) {
      if (c.loop) {
        c.at = c.from;
      } else {
        this.clock = null;
        /* the end of the rail is the PRESENT, which the year rail spells
           `undefined` — see `layers/rail.ts` §WHAT YEAR THIS LAYER CAN
           HONESTLY SPEAK FOR, which is the one layer that reads it */
        this.setYear(undefined);
        return false;
      }
    }
    this.setYear(c.at);
    return true;
  }

  invalidate(): void {
    this.dirty = true;
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.tick);
  }

  getStats(): EngineStats {
    return { ...this.stats };
  }

  /** the renderer, for a layer or a harness that needs to reach it */
  get gl(): WebGPURenderer {
    return this.renderer;
  }

  /** which backend actually came up — WebGPU where the browser has it */
  get backend(): string {
    const b = (this.renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    return b?.isWebGPUBackend ? "webgpu" : "webgl2";
  }

  /** the element the scene is drawn on — for a harness, and for the export */
  get canvas(): HTMLCanvasElement | null {
    return (this.renderer as unknown as { domElement?: HTMLCanvasElement }).domElement ?? null;
  }

  get viewport(): { W: number; H: number; dpr: number } {
    return { W: this.W, H: this.H, dpr: this.dpr };
  }

  /**
   * ── ONE FRAME, NOW, IN THE CALLER'S OWN TASK ────────────────────────────
   *
   * For a harness that wants to READ the frame it just asked for. A WebGL
   * context without `preserveDrawingBuffer` is cleared as soon as the browser
   * composites, so `canvas.toDataURL()` a rAF later returns a blank image —
   * which is exactly what started happening the moment the post chain went in,
   * and it returned ten blank PNGs before it was noticed. Rendering
   * synchronously and reading in the same task is the only reliable order.
   *
   * `invalidate()` is what the app uses; nothing in the app calls this.
   */
  renderNow(): void {
    this.dirty = true;
    this.tick();
  }

  private rasterCam(): PlaneCamera {
    if (!this.snapRaster) return this.cam;
    /* the scale first, because the pixel grid is defined BY the scale — snap
       the centre against a scale that is about to change and it lands on the
       wrong grid */
    return snapCameraToPixels(snapCameraScale(this.cam), this.dpr);
  }

  /**
   * How much of the last frame survives into this one; 0 turns the
   * accumulation off. For the A/B — `temporal.ts` carries what the number
   * costs and what it buys.
   */
  setTemporal(keep: number): void {
    setTemporalKeep(keep);
    const want = keep > 0;
    if (want !== this.temporalWanted) {
      this.temporalWanted = want;
      this.dropPost();
      this.buildPost();
    }
    this.temporal?.reset();
    this.invalidate();
  }

  /**
   * The tone map and its exposure, for the A/B.
   *
   * ── AND THE ANSWER, MEASURED, IS THAT THERE IS NOT ONE ──────────────────
   * With `rgba16float` live there is finally range above white to roll off,
   * and the obvious thing to spend it on was the highlight end: the large
   * flat roofs sit well over the published page while the mid-tones are on
   * it. So every candidate was scored against that page over the same three
   * cameras, at four percentiles each — mean absolute deviation of 255:
   *
   *     none   3.7      ACES   4.7      AgX   8.8      Neutral   9.0
   *
   * None of them helps and every one of them hurts. That is not a surprise
   * once it is written down: the reference is a painted 2D page that
   * compresses nothing, this port exists to match it, and a tone map is a
   * curve applied to a picture that was authored without one. The roofs are
   * not a curve problem either — they are +36 at one camera and -5 at
   * another, which no global transform fixes.
   *
   * So the chain stays at `NoToneMapping`, now on purpose rather than by
   * default, and this stays as the switch that says so. The HDR is better
   * spent on things that ADD — a bloom above a threshold leaves the base
   * picture where it is — than on a curve that moves all of it.
   *
   * Takes three.js's own constants so a sweep can name them.
   */
  setToneMapping(mode: ToneMapping, exposure = 1): void {
    this.renderer.toneMapping = mode;
    this.renderer.toneMappingExposure = exposure;
    /* the chain bakes the output transform, so it has to be rebuilt */
    this.dropPost();
    this.buildPost();
    this.invalidate();
  }

  /**
   * Pin the pixel snap off for an A/B, the way `setPost` pins the chain. The
   * only honest way to measure what it buys is a FRACTIONAL pan — at exactly
   * one pixel an unsnapped camera lands on the grid too, and the two are
   * indistinguishable.
   */
  setSnap(on: boolean): void {
    this.snapRaster = on;
    this.invalidate();
  }

  private tick(): void {
    this.raf = 0;
    if (this.disposed) return;
    /* NOTHING IS PAINTED MID-WARM-UP — see §THE BANDS ARE WARMED. The dirty
       flag is left standing, so the frame the reader is owed is drawn by the
       `invalidate()` that ends the warm-up. */
    if (this.warming) return;
    /* ── THE CLOCK RUNS BEFORE THE DIRTY TEST, AND THAT IS WHY IT RUNS ────
       This engine is on demand: it renders when something says it must and
       then goes back to sleep. A transport is the one thing that has to keep
       waking it, so it steps here and its `setYear` marks the frame dirty and
       schedules the next one — see §THE CLOCK. With no clock this is a
       function call and a null test, and the engine sleeps exactly as before. */
    this.stepClock(performance.now());
    if (!this.dirty || this.W <= 0 || this.H <= 0) return;
    this.dirty = false;

    const t0 = performance.now();
    /* ONE camera for the whole frame — the GL, every layer's `onFrame`, and
       the label overlay through `onAfterFrame`. If the type were laid from
       the continuous camera while the city were drawn from the snapped one,
       the labels would slide up to half a pixel against the buildings they
       name, which is the same defect in a smaller place. */
    const cam = this.rasterCam();
    /* ── WHAT THE ACCUMULATION NEEDS TO KNOW ────────────────────────────
       How far the picture moved on the glass since the frame it is about to
       be mixed with, in device pixels, and whether that movement is the only
       thing that changed. `temporal.ts` refuses anything that is not a pure
       pan, because only a pan reprojects by whole texels. */
    const prev = this.lastRaster;
    const q = cam.scale * this.dpr;
    const pureP = prev !== null && prev.scale === cam.scale;
    /* screen space, x to the right and y DOWN: the frustum's y is inverted
       (`camera.ts` §the projection is left-handed), so a rise in `cy` sends
       the picture down the glass. */
    const sx = pureP ? -(cam.cx - prev.cx) * q : 0;
    const sy = pureP ? (cam.cy - prev.cy) * q : 0;
    this.temporal?.frame(Math.round(sx), Math.round(sy), pureP);
    this.lastRaster = { cx: cam.cx, cy: cam.cy, scale: cam.scale };
    applyAxonCamera(this.camera, this.basis, cam, this.W, this.H, DEPTH_SPAN_M);
    this.sun.fit(this.groundCorners(cam));
    for (const l of this.layers) l.onFrame?.(cam, this.step);

    if (this.post) {
      try {
        /* the whole reconstruction is four numbers off this frame's frustum,
           and the frustum moved on the line above. The air's anchor is read
           off the same frustum and has the same deadline. */
        this.aoPass?.update(this.camera, this.W * this.dpr, this.H * this.dpr);
        this.airPass?.update(this.camera, this.W * this.dpr, this.H * this.dpr, this.dpr);
        this.post.render();
      } catch (e) {
        console.warn("citygl: post chain failed, falling back —", e);
        this.dropPost();
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    /* ── AND KEEP IT ────────────────────────────────────────────────────
       The frame that just reached the glass becomes the next frame's
       history. `copyFramebufferToTexture` is a GPU-side copy of the drawing
       buffer — no readback, nothing crosses to the CPU. */
    if (this.temporal) {
      try {
        this.renderer.copyFramebufferToTexture(this.temporal.history);
      } catch (e) {
        console.warn("citygl: no temporal accumulation on this backend —", e);
        this.temporal.disable();
        this.temporal = null;
      }
    }

    this.onAfterFrame?.(cam, this.step);

    /* `drawCalls` on the WebGPU backend, `calls` on WebGL — one readout so a
       harness does not have to know which came up. */
    const info = this.renderer.info.render as unknown as {
      calls?: number; drawCalls?: number; triangles?: number;
    };
    this.stats = {
      frames: this.stats.frames + 1,
      lastFrameMs: performance.now() - t0,
      calls: info.drawCalls ?? info.calls ?? 0,
      triangles: info.triangles ?? 0,
    };
    this.releaseCpuArrays();
  }

  /**
   * The four world points the viewport's corners sit over, on the ground
   * plane. `screenToPlane` undoes the camera and `invAt` undoes the
   * projection — the two halves `projection.ts` was split into, run
   * backwards. The shadow camera is fitted to this box.
   *
   * It takes the camera rather than reading `this.cam` so that the box is
   * fitted to the frame BEING DRAWN — the snapped one. Fitting the shadow to
   * a camera half a pixel away from the one the city is rasterised from would
   * put the shadow map back on a grid of its own.
   */
  private groundCorners(cam: PlaneCamera = this.cam): [number, number][] {
    const out: [number, number][] = [];
    for (const [sx, sy] of [
      [0, 0], [this.W, 0], [0, this.H], [this.W, this.H],
    ] as const) {
      const pl = screenToPlane(sx, sy, this.W, this.H, cam);
      const w = projection.invAt(pl[0], pl[1], 0);
      out.push([w[0], w[1]]);
    }
    return out;
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const l of this.layers) l.dispose();
    this.layers.length = 0;
    this.sun.dispose();
    /* the tilt-shift owns two render targets of its own, and a page that
       mounts the map twice would otherwise leak both */
    this.airPass?.dispose();
    this.renderer.dispose();
    if (typeof globalThis !== "undefined") {
      delete (globalThis as { __cityGL?: CityEngine }).__cityGL;
    }
  }
}
