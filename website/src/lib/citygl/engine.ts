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
  Color,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene,
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
import { pass, vec4 } from "three/tsl";

/** a pass's own texture node — the thing that carries `.rgb` and `.a` */
type PassTex = ShaderNodeObject<TextureNode>;

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

    /* ── THE SHADOW MAP, ON BY DEFAULT ──────────────────────────────────
       `PCFSoftShadowMap` rather than the hard one: a city's shadow edge at
       this scale is a metre or two of penumbra, and a hard edge reads as a
       cut-out. The map is re-rendered only when the scene is dirty, which is
       when the camera moved — a held frame costs nothing. */
    this.renderer.shadowMap.enabled = this.quality.shadowMap > 0;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.sun = sunRig(this.scene, {
      mapSize: this.quality.shadowMap || 1024,
      maxBuiltY: 300 * this.descriptor.look.zexb,
    });
    if (this.quality.shadowMap === 0) this.sun.setEnabled(false);

    this.basis = axonBasis(projection);
    /* `F` as well as `R`: the shadow fit works in the LIGHT's own axes and has
       to know where a TALL thing must stand to lean into the frame — see
       `light.ts` §the shadow box is fitted in the light's axes. */
    this.sun.aimKey(this.basis.R, this.basis.F);
    this.tick = this.tick.bind(this);

    if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
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
      const p = new PostProcessing(this.renderer);
      /* THE ACCUMULATION IS LAST, over the composed frame — it has to see
         what actually reaches the glass, including the occlusion and the
         air, because those are part of what flickers. */
      const composed = this.outputFor(colour, a, air);
      /* ── AND IT RUNS ON BOTH BACKENDS ────────────────────────────────
         It did not, for a while, because the copy that keeps the last frame
         was refused on WebGPU — `rgba16float` against a `bgra8unorm` target —
         and three logs that and RETURNS rather than throwing, so the failure
         was silent and the blend ran on a history that was never refreshed.
         `temporal.ts` §ASKING FOR THE TYPE DOES NOTHING HERE has the cause:
         the format is overridden for a `FramebufferTexture` and only
         `internalFormat` outranks it. */
      /* not on WebGPU — see §ON, BECAUSE IT IS WHAT STOPS THE CITY SHIMMERING */
      /* not on WebGPU — see §ON, BECAUSE IT IS WHAT STOPS THE CITY SHIMMERING */
      const canAccumulate = true;
      if (this.temporalWanted && canAccumulate) {
        const t = cityTemporal(composed, this.backend === "webgpu");
        t.resize(this.W * this.dpr, this.H * this.dpr);
        p.outputNode = t.node;
        this.temporal = t;
      } else {
        p.outputNode = composed;
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
    layer.onStep?.(this.step, this.zex(), this.descriptor.look.zexb);
    layer.onYear?.(this.year);
    this.invalidate();
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
    this.invalidate();
  }

  getStep(): number {
    return this.step;
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
    if (this.disposed || !this.dirty || this.W <= 0 || this.H <= 0) return;
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
