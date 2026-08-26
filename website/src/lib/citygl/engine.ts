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

import { Color, OrthographicCamera, PCFSoftShadowMap, Scene } from "three";
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
import { PostProcessing, WebGPURenderer } from "three/webgpu";
import { pass, vec4 } from "three/tsl";

import { projection, screenToPlane } from "@/lib/city/projection";
import { orthoAo, type OrthoAo, type OrthoAoParams } from "./ao";
import { applyAxonCamera, axonBasis, type AxonBasis, type PlaneCamera } from "./camera";
import type { CityDescriptor } from "./descriptor";
import { sunRig, type SunRig } from "./light";
import { detectQuality, type QualitySettings } from "./quality";

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
  private aoPass: OrthoAo | null = null;
  /** `null` follows the quality tier; `setPost` pins it for an A/B */
  private postWanted: boolean | null = null;
  /** what the post chain puts on the glass — `"ao"` shows the term alone */
  private postDebug: "scene" | "ao" = "scene";
  private basis: AxonBasis;

  private W = 0;
  private H = 0;
  private dpr = 1;
  private readonly maxDpr: number;

  private cam: PlaneCamera = { cx: 0, cy: 0, scale: 0.05 };
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
    this.sun.aimKey(this.basis.R);
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
   * One scene pass into a render target, one full-screen composite. `PassNode`
   * copies `renderer.samples` onto its own target, so the 4x MSAA the frame
   * already had survives the detour — VERIFIED by capture, the anti-aliasing
   * is identical with the chain on and off.
   *
   * It is built inside a `try`. A backend that cannot give this chain must
   * lose the ambient occlusion and keep the city — never the other way round.
   */
  private buildPost(): void {
    if (!(this.postWanted ?? this.quality.ao)) return;
    try {
      const scenePass = pass(this.scene, this.camera);
      const colour = scenePass.getTextureNode("output");
      const depth = scenePass.getTextureNode("depth");
      const a = orthoAo(depth, {
        samples: this.quality.aoSamples,
        radiusM: this.quality.aoRadiusM,
      });
      const p = new PostProcessing(this.renderer);
      /* the alpha stays 1 — multiplying it would make the canvas translucent
         and let the page's own background through the darkest corners */
      p.outputNode =
        this.postDebug === "ao"
          ? vec4(a.node, a.node, a.node, 1)
          : vec4(colour.rgb.mul(a.node), colour.a);
      this.post = p;
      this.aoPass = a;
    } catch (e) {
      console.warn("citygl: no ambient occlusion on this backend —", e);
      this.post = null;
      this.aoPass = null;
    }
  }

  /** turn the post chain off — the phone tier and the A/B both use this */
  setPost(on: boolean): void {
    this.postWanted = on;
    if (!on) {
      this.post = null;
      this.aoPass = null;
    } else if (!this.post) this.buildPost();
    this.invalidate();
  }

  /**
   * Retune the occlusion without a reload — this is how the A/B harness
   * sweeps radius and intensity. `samples` and `debug` change the SHADER, so
   * they go through the quality settings and a rebuild; the rest are uniforms.
   */
  setPostParams(p: Partial<OrthoAoParams> & { samples?: number; debug?: "scene" | "ao" }): void {
    let rebuild = false;
    if (p.samples !== undefined && p.samples !== this.quality.aoSamples) {
      this.quality.aoSamples = p.samples;
      rebuild = true;
    }
    if (p.debug !== undefined && p.debug !== this.postDebug) {
      this.postDebug = p.debug;
      rebuild = true;
    }
    if (rebuild && this.post) {
      this.post = null;
      this.aoPass = null;
      this.buildPost();
    }
    this.aoPass?.setParams(p);
    this.invalidate();
  }

  get postOn(): boolean {
    return this.post !== null;
  }

  /** what the occlusion disc came out as this frame, world metres */
  get aoRadiusM(): number {
    return this.aoPass?.radiusUsedM ?? 0;
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
    this.step = step;
    projection.setBand(step);
    this.basis = axonBasis(projection);
    this.sun.aimKey(this.basis.R);
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

  get viewport(): { W: number; H: number; dpr: number } {
    return { W: this.W, H: this.H, dpr: this.dpr };
  }

  private tick(): void {
    this.raf = 0;
    if (this.disposed || !this.dirty || this.W <= 0 || this.H <= 0) return;
    this.dirty = false;

    const t0 = performance.now();
    applyAxonCamera(this.camera, this.basis, this.cam, this.W, this.H, DEPTH_SPAN_M);
    this.sun.fit(this.groundCorners());
    for (const l of this.layers) l.onFrame?.(this.cam, this.step);

    if (this.post) {
      try {
        /* the whole reconstruction is four numbers off this frame's frustum,
           and the frustum moved on the line above */
        this.aoPass?.update(this.camera, this.W * this.dpr, this.H * this.dpr);
        this.post.render();
      } catch (e) {
        console.warn("citygl: post chain failed, falling back —", e);
        this.post = null;
        this.aoPass = null;
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.onAfterFrame?.(this.cam, this.step);

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
   */
  private groundCorners(): [number, number][] {
    const out: [number, number][] = [];
    for (const [sx, sy] of [
      [0, 0], [this.W, 0], [0, this.H], [this.W, this.H],
    ] as const) {
      const pl = screenToPlane(sx, sy, this.W, this.H, this.cam);
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
    this.renderer.dispose();
    if (typeof globalThis !== "undefined") {
      delete (globalThis as { __cityGL?: CityEngine }).__cityGL;
    }
  }
}
