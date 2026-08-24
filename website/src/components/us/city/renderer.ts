/**
 * THE RENDERER — the DOM half `camera.ts` deliberately left out.
 *
 * `CAMERA.md` §"What is not here, and why" names exactly what belongs in this
 * file: pointer, wheel, key and touch listeners; canvas allocation;
 * `requestAnimationFrame`; the gesture state machine; the band cross-fade.
 * **Every number those need is already in `camera.ts`**, so this file is
 * wiring: `wheelFactor`, `easeZoom`, `easeOutCubic`, `DRAG_THRESH`,
 * `SETTLE_MS`, `INERT_*`, `KEY_*`, `planSlots`, `decideRaster`.
 *
 * Two things the shell must carry that are not arithmetic, both documented at
 * `planSlots` and both honoured here:
 *
 *   · `getContext("2d", {alpha:false})` is **correctness, not optimisation.**
 *     Compositing a globalAlpha band into a transparent buffer and flattening
 *     that onto an opaque canvas rounds premultiplied alpha one more time than
 *     compositing straight onto the opaque canvas. MEASURED: 10.3 % of pixels
 *     off by exactly one level at band 0, across the whole bay.
 *   · **The surround colour is filled BEFORE the blit, on every frame.** A
 *     magnified blit leaves nothing outside itself, and this is what stops a
 *     fast flick from showing raw canvas at the frame edge.
 *
 * AND ONE RULE ABOUT MEASURING THIS FILE. **Canvas 2D is deferred.** Timing a
 * draw into a detached canvas measures the JS only and has fooled four agents
 * on this project into shipping a regression as a win. `measure()` below counts
 * rAF, which is why it reports a frame rate and not a millisecond count.
 *
 * React state is not in the loop. `CityMap.tsx` mounts this, resizes it and
 * tears it down; everything between those three calls is imperative.
 */

import {
  Camera,
  bandOf,
  decideRaster,
  decideRasterExternal,
  easeOutCubic,
  easeZoom,
  leadCentre,
  place,
  planSlots,
  quantiseForKey,
  slotSize,
  wheelFactor,
  zoomLeadScale,
  BAND_FADE,
  DRAG_THRESH,
  INERT_STOP,
  INERT_TAU,
  INERT_VMAX,
  KEY_PAN,
  KEY_PAN_BIG,
  KEY_ZOOM,
  LEDGER_W,
  MOTION_DPR,
  SETTLE_MS,
  ZSTEPS,
  cityBBoxByBand,
  fitCity,
  margin,
  type BBox,
  type NavMode,
  type Placement,
  type Rastered,
  type SlotPlan,
} from "@/lib/city/camera";
import { projection, type RebuildReason } from "@/lib/city/projection";
import type { Frame as SceneFrame } from "@/lib/city/terrain";
import { HAZE } from "@/lib/city/terrain";
import type { CityData } from "@/lib/city/data";
import { CityScene, type SceneStats } from "./scene";

/**
 * ── THE FILM'S DRIVE ─────────────────────────────────────────────────────
 *
 * `camera.ts` §decideRasterExternal: *"for a fixed projection, two camera states
 * differ by a pure scale and a translation, so one drawImage of a buffer painted
 * at camera A is EXACTLY the frame camera B would have painted — not an
 * approximation of it. Nothing in that fact cares who moved the camera."* The
 * gesture path was written for a reader's finger; the film's rails are the same
 * camera moving on somebody else's clock.
 *
 * What differs is the last clause. A finger's next position is a guess, so the
 * gesture path leads off the pan velocity. **A film's next position is known**,
 * so the caller hands the buffer plan in — `film.ts` §planFilmBuffer walks the
 * actual trajectory over the next 460 ms and takes the union of the viewports it
 * will ask for. That is why a two-second move costs a handful of rasterisations
 * instead of one a frame, and it is the whole of *no visible hitch during a
 * camera move*.
 *
 * The renderer stays dumb about the film: it is handed a camera, a year, a
 * buffer plan and two paint callbacks, and it owns none of them.
 */
export interface FilmDrive {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly step: number;
  /** fractional inside a run; the CONTENT KEY quantises it, the paint does not */
  readonly year: number;
  readonly running: boolean;
  /** where the buffer is painted, out of `planFilmBuffer` */
  readonly plan: { readonly cx: number; readonly cy: number; readonly scale: number } | null;
  /** `gid`s the fabric must not draw because the film is raising them */
  readonly hide: ReadonlySet<number> | null;
  /** painted INTO the buffer, under the fabric and over the ground — the
   *  accepted streets, whose order is the record's own: the Board accepts a
   *  street, and the assessor dates the houses on it later. It is handed the
   *  scene's own `Frame`, so it lands at the BUFFER's camera and not the
   *  viewport's, which is what makes a blit of it exact. */
  readonly underlay: ((f: SceneFrame) => void) | null;
  /** painted on the GLASS at viewport size, after the blit — the bridge deck
   *  and the subject's own name. Neither belongs in a buffer: one is a
   *  two-point line over open water that changes every frame and occludes
   *  nothing, and the other is text that would be re-rasterised with 166,166
   *  buildings every time it moved. */
  readonly overlay: ((ctx: CanvasRenderingContext2D, W: number, H: number) => void) | null;
}

export interface RendererState {
  /** whole-city 1.0 → free max 12 */
  z: number;
  mode: NavMode;
  /** rAF frames per second over the last second of actual animation */
  fps: number;
  /** rasterisations since mount, and why the last one happened */
  rasters: number;
  lastWhy: string;
  scene: SceneStats;
  /** what the data layer is doing */
  held: number;
  inFlight: number;
  queued: number;
  heldBytes: number;
}

export interface RendererOptions {
  onState?: (s: RendererState) => void;
  /** a block was clicked; -1 means "nothing there" */
  onPick?: (blockIndex: number) => void;
  /** the ledger panel's width, so the fit and the clamp use the visible strip */
  ledgerW?: number;
}

interface Slot {
  plan: SlotPlan;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Steps of the film's year that the content key resolves. See `contentKey`. */
export const YEAR_Q = 16;

export class CityRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly data: CityData;
  private readonly scene: CityScene;
  private readonly opts: RendererOptions;

  readonly cam = new Camera();

  private W = 0;
  private H = 0;
  private DPR = 1;
  private slots = new Map<SlotPlan["name"], Slot>();
  private cur: Rastered | null = null;
  private curSlot: SlotPlan["name"] = "hi";
  private lastRaster = -1e9;
  private rasters = 0;
  private lastWhy = "";

  private mode: NavMode = "idle";
  private raf = 0;
  private running = false;
  private dirty = true;
  private disposed = false;

  // pointer
  private ptrId: number | null = null;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private vx = 0;
  private vy = 0;
  private dragging = false;
  private pinchD = 0;
  private readonly touches = new Map<number, { x: number; y: number }>();

  // zoom ease
  private zTarget = 0;
  private zAnchor: [number, number] = [0, 0];
  private settleAt = 0;

  // glide (the preset buttons and Home)
  private glide: {
    t0: number; ms: number;
    s0: number; s1: number;
    cx0: number; cx1: number;
    cy0: number; cy1: number;
  } | null = null;

  // the band cross-fade
  private fadeCv: HTMLCanvasElement | null = null;
  private fadeT0 = -1e9;
  private paintedStep = -1;

  /* ── THE PAN CLAMP'S BOX, ONE PER BAND, HELD ──────────────────────────
     `cityBBoxByBand` measures each band against a SCRATCH projection carrying
     that band's ZEX, so its three boxes do not depend on the live dials and
     survive a band change. Holding them is what lets a band change re-point
     the clamp in two lines instead of re-walking the DEM. Dropped and rebuilt
     by `refit()`, which is also the only thing a tilt or a bearing change has
     to call. */
  private bandBoxes: BBox[] | null = null;
  private unsubProj: (() => void) | null = null;

  // data arrival
  private dataVersion = 0;
  private frozenDataVersion = 0;
  private unsub: (() => void) | null = null;

  // rAF counting — the only honest frame-rate measurement on a deferred API
  private fpsFrames = 0;
  private fpsSince = 0;
  private fps = 0;

  private lastStats: SceneStats = {
    cells: 0, massed: 0, buildings: 0, streets: 0, trees: 0, labels: 0, wB: 0,
  };
  private year: number | undefined = undefined;
  private film: FilmDrive | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    data: CityData,
    scene: CityScene,
    opts: RendererOptions = {},
  ) {
    this.canvas = canvas;
    this.data = data;
    this.scene = scene;
    this.opts = opts;
    /* ── A HANDLE FOR THE PARITY HARNESS, DEV ONLY ────────────────────
       Every comparison against the mock has to be taken at the SAME absolute
       scale as well as the same preset, because `cam.step` selects both
       `cam.base` and `ZEX` — an agent on this project once read a 75 %
       difference out of two frames that were only at different scales. A
       preset button cannot express "this scale at this centre", so the
       harness needs the object. `process.env.NODE_ENV` is inlined by the
       bundler, so this branch is dead code in a production build. */
    if (process.env.NODE_ENV !== "production") {
      (globalThis as { __cityRenderer?: CityRenderer }).__cityRenderer = this;
    }
    // ALPHA:FALSE IS CORRECTNESS. See the header.
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
    this.unsub = data.onChunk((key) => {
      this.dataVersion++;
      this.scene.build();
      /* The DEM-derived caches are built from chunks that arrive on their own
         schedule — the park rings and the burn polygon flag DEM cells, the
         canopy fraction tints them, the surround carries its own relief. A
         band cache built before one of those landed is a band cache missing
         it, so the arrival drops it rather than leaving a half-built ground. */
      if (
        key === "base/parks" || key === "base/coast" ||
        key === "base/canopy-tint" || key === "base/surround"
      ) {
        this.scene.invalidateBands();
        this.cur = null;
      }
      if (key === "base/terrain") this.refit();
      this.invalidate();
    });
    /* ── THE PROJECTION IS A DIAL AND THE RENDERER HOLDS DERIVED STATE ────
       `projection.ts` raises a TYPED rebuild event rather than calling a list
       of rebuild functions by name, and the reason matters here: a band change
       moves ZEX ONLY, so the scene's per-band terrain (built at that band's own
       ZEX) and every table pre-projected at z = 0 survive it, while the pan
       clamp's world box and the raster buffer do not. A tilt or a bearing
       change moves the plane itself and nothing survives.
       Subscribing rather than doing this inline at the call site is what makes
       an EXTERNAL `setBand()` — the parity harness drives one — land on a
       renderer that is still self-consistent. */
    this.unsubProj = projection.onRebuild((reason) => this.onProjRebuild(reason));
    this.wire();
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  resize(W: number, H: number, dpr: number): void {
    if (W <= 0 || H <= 0) return;
    const changed = W !== this.W || H !== this.H || dpr !== this.DPR;
    this.W = W;
    this.H = H;
    this.DPR = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;

    if (changed) {
      /* ALLOCATED ONCE IS THE FINDING. The first version sized ONE canvas on
         demand, so every motion↔settle transition reassigned canvas.width on a
         4320×1978 surface — and that reallocation, not the drawing, was the
         hitch: ~77 ms per rasterisation at EVERY zoom level, including 11×,
         where a full render of the whole frame is 5.3 ms. A cost that does not
         vary with the amount of work is not the work. */
      this.slots.clear();
      for (const plan of planSlots(W, H, dpr)) {
        const cv = document.createElement("canvas");
        cv.width = Math.round(plan.W * plan.dpr);
        cv.height = Math.round(plan.H * plan.dpr);
        const cx = cv.getContext("2d", { alpha: false });
        if (!cx) continue;
        this.slots.set(plan.name, { plan, cv, ctx: cx });
      }
      this.fadeCv = document.createElement("canvas");
      this.fadeCv.width = this.canvas.width;
      this.fadeCv.height = this.canvas.height;
      this.cur = null;
      this.refit();
    }
    this.invalidate();
  }

  /** the fit, and the pan clamp's per-band box — one function feeds both */
  refit(): void {
    const ext = this.scene.extent();
    if (!ext || this.W <= 0) return;
    const boxes = cityBBoxByBand(projection, ext);
    this.bandBoxes = boxes;
    const step = this.cam.syncStep();
    this.cam.bbox = boxes[step] ?? boxes[0];
    const fit = fitCity(boxes[0], this.W, this.H, this.ledgerW);
    const first = this.cam.base <= 0 || this.cam.base === 1;
    this.cam.base = fit.base;
    this.cam.bx = fit.bx;
    this.cam.by = fit.by;
    if (first) this.cam.home(this.W, this.H, this.ledgerW);
    else this.cam.clamp(this.W, this.H, this.ledgerW);
    this.cur = null;
  }

  private ledgerWOverride: number | null = null;

  private get ledgerW(): number {
    return this.ledgerWOverride ?? this.opts.ledgerW ?? LEDGER_W;
  }

  destroy(): void {
    this.disposed = true;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.unwire();
    this.unsub?.();
    this.unsub = null;
    this.unsubProj?.();
    this.unsubProj = null;
    this.slots.clear();
    this.fadeCv = null;
  }

  setYear(y: number | undefined): void {
    this.year = y;
    this.invalidate();
  }

  /** The film runs full-bleed, with no ledger painted over the stage, so the
   *  fit and the pan clamp have to be told the strip IS the canvas. */
  setLedgerW(px: number): void {
    if (this.ledgerWOverride === px) return;
    this.ledgerWOverride = px;
    this.refit();
    this.invalidate();
  }

  /**
   * Hand the camera to the film, or take it back.
   *
   * Called once per animation frame while the film is running. Nothing is
   * animated here — the film owns its own clock and hands in a resolved camera —
   * so this is a setter and a repaint, and the whole of the *externally driven*
   * path is `render()`'s `if (this.film)` branch.
   *
   * `null` gives the camera back to the reader at exactly where the film left
   * it, which is the film's own contract: **the frame it stopped on IS the
   * explorer.**
   */
  driveFilm(d: FilmDrive | null): void {
    const leaving = this.film !== null && d === null;
    this.film = d;
    if (d) {
      this.cam.scale = d.scale;
      this.cam.cx = d.cx;
      this.cam.cy = d.cy;
      this.cam.step = d.step;
      this.year = d.year;
      this.scene.filmHide = d.hide;
      this.scene.filmRunning = d.running;
      this.scene.filmUnderlay = d.underlay;
      this.mode = "idle";
    } else {
      this.scene.filmHide = null;
      this.scene.filmRunning = false;
      this.scene.filmUnderlay = null;
      if (leaving) {
        /* the buffer holds a camera and a content key the settled path is about
           to make stale, so it is DROPPED rather than trusted */
        this.cur = null;
        this.cam.thawBand();
        this.cam.syncStep();
      }
    }
    this.dirty = true;
    this.start();
  }

  get filmOn(): boolean {
    return this.film !== null;
  }

  /** The composed scene, for the film: the ground it puts its keyframes on and
   *  the two published footprints it raises. Read-only from outside. */
  get composition(): CityScene {
    return this.scene;
  }

  /** The fit the film's `z` is a multiple of. */
  /** rasterisations since mount, and why the last one happened. The film's
   *  measurement reads these: a move that costs a handful of rasters is a move
   *  served from the blit, and a move that costs one a frame is not. */
  get rasterCount(): number {
    return this.rasters;
  }

  get rasterWhy(): string {
    return this.lastWhy;
  }

  get fitBase(): number {
    return this.cam.base;
  }

  get viewport(): { W: number; H: number; dpr: number } {
    return { W: this.W, H: this.H, dpr: this.DPR };
  }

  /** The `fi` slot's own size in CSS px — what `planFilmBuffer` has to fit a
   *  window of trajectory inside. */
  filmSlot(): { W: number; H: number } | null {
    const s = this.slots.get("fi");
    return s ? { W: s.plan.W, H: s.plan.H } : null;
  }

  /** repaint on the next frame */
  invalidate(): void {
    this.dirty = true;
    this.start();
  }

  private start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  // ── the named stops ──────────────────────────────────────────────────────

  goToPreset(i: number): void {
    const s1 = this.cam.presetScale(i);
    this.glideTo(s1, this.cam.cx, this.cam.cy, 520);
  }

  home(): void {
    const s1 = this.cam.base * ZSTEPS[0];
    this.glideTo(s1, this.cam.bx, this.cam.by, 620);
  }

  private glideTo(s1: number, cx1: number, cy1: number, ms: number): void {
    this.cam.freezeBand();
    this.glide = {
      t0: performance.now(), ms,
      s0: this.cam.scale, s1,
      cx0: this.cam.cx, cx1,
      cy0: this.cam.cy, cy1,
    };
    this.mode = "glide";
    this.start();
  }

  // ── the loop ─────────────────────────────────────────────────────────────

  private tick(now: number): void {
    if (this.disposed) return;
    this.raf = 0;

    // rAF counting. THE ONLY HONEST FRAME RATE on a deferred API.
    if (this.fpsSince === 0) this.fpsSince = now;
    this.fpsFrames++;
    if (now - this.fpsSince >= 1000) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsSince);
      this.fpsFrames = 0;
      this.fpsSince = now;
    }

    const animating = this.advance(now);
    if (animating || this.dirty) {
      this.dirty = false;
      this.render(now);
    }

    const fading = now - this.fadeT0 < BAND_FADE;
    if (animating || fading || this.dirty || this.data.stats().inFlight > 0) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
    } else {
      this.running = false;
      this.fpsSince = 0;
      this.fpsFrames = 0;
    }
    this.emit();
  }

  /** move the camera. Returns true while something is still in flight. */
  private advance(now: number): boolean {
    const dt = Math.min(0.05, (now - this.lastT) / 1000 || 0.016);
    this.lastT = now;
    let live = false;

    if (this.glide) {
      const g = this.glide;
      const t = Math.min(1, (now - g.t0) / g.ms);
      const e = easeOutCubic(t);
      this.cam.scale = g.s0 + (g.s1 - g.s0) * e;
      this.cam.cx = g.cx0 + (g.cx1 - g.cx0) * e;
      this.cam.cy = g.cy0 + (g.cy1 - g.cy0) * e;
      this.cam.clamp(this.W, this.H, this.ledgerW);
      if (t >= 1) {
        this.glide = null;
        this.mode = "idle";
        this.cam.thawBand();
      }
      live = true;
    } else if (this.mode === "zoom") {
      const s = easeZoom(this.cam.scale, this.zTarget, dt);
      this.cam.zoomAt(s, this.zAnchor[0], this.zAnchor[1], this.W, this.H, this.ledgerW);
      if (now > this.settleAt && Math.abs(s - this.zTarget) / this.zTarget < 0.001) {
        this.mode = "idle";
        this.cam.thawBand();
      } else {
        live = true;
      }
    } else if (this.mode === "inertia") {
      /* v0·TAU is the coast distance, so the useful cap is on v0: 2400 px/s ×
         0.28 s ≈ 670 px, about 45 % of the stage, which is a flick you can aim.
         STOP is deliberately coarse — below ~38 px/s the map is not moving, it
         is creeping, and creep reads as a bug. */
      const k = Math.exp(-dt / INERT_TAU);
      this.vx *= k;
      this.vy *= k;
      this.cam.panBy(this.vx * dt, this.vy * dt, this.W, this.H, this.ledgerW);
      if (Math.hypot(this.vx, this.vy) < INERT_STOP) {
        this.mode = "idle";
        this.cam.thawBand();
      } else {
        live = true;
      }
    }

    this.cam.syncStep();
    if (this.mode === "idle") this.frozenDataVersion = this.dataVersion;
    return live;
  }

  /**
   * One visible frame: rasterise if the blit has stopped being the truth,
   * then fill the surround and blit.
   */
  private render(now: number): void {
    if (this.W <= 0 || !this.scene.ready) {
      this.paintEmpty();
      return;
    }
    const step = this.cam.syncStep();

    /* ── THE BAND IS PUT ON THE PROJECTION HERE, AND THIS IS THE ONLY PLACE ──
       `bandFor()` builds each band's `TerrainField` at that band's own ZEX;
       everything the city stands ON that ground with — the block massing, the
       building prisms, the heroes, the hit test's `invAt` march and the pan
       clamp's box — reads `proj.zex`. Left unsynced the two disagree, and the
       disagreement is a RIGID VERTICAL DISPLACEMENT of `h·(3.3 − ZEX_band)·
       cam.scale`: proportional to ground elevation and to zoom, so 2 px on flat
       ground at whole city and 280–360 px — a quarter of the frame — on the
       hills at the Street preset. Measured before this line existed:
       `.parity/GAPS.md` §1, the `Δy` column.
       It goes at the TOP of render() and not inside `rasterise()` because the
       band has to be on the projection before `decideRaster` reads `cur.step`,
       before the cross-fade snapshot, and before `place()` — and because the
       hit test, which runs between frames, must march the ground the reader is
       actually looking at.
       `setBand` is idempotent: it returns without emitting when ZEX already
       matches, so a held frame costs one comparison. */
    projection.setBand(step);

    // the band cross-fade: a band change is a projection change, so the two
    // pictures cannot be blended in the buffer — they are blended on the glass.
    if (this.paintedStep >= 0 && step !== this.paintedStep && this.fadeCv) {
      const fc = this.fadeCv.getContext("2d", { alpha: false });
      if (fc) {
        fc.setTransform(1, 0, 0, 1, 0, 0);
        fc.drawImage(this.canvas, 0, 0);
        this.fadeT0 = now;
      }
    }

    const film = this.film;
    /* ── A FILM MOVE DOES NOT TAKE THE MOTION RUNGS, AND IT WAS MEASURED ──
       `buildings.ts`'s two motion rungs — `RECT_SCALE`'s area-preserving
       silhouette and `QUAD_PX`'s four real vertices — look like the obvious
       lever on a mid-move rasterisation, and they were tried here. **They
       bought nothing**: over the seven camera moves, rAF-counted, the worst
       frame moved 605–1443 ms to 551–1300 ms, which is inside the run-to-run
       spread. Ablating the film's own two passes as well (`?filmoff=accepted,
       subjects`) moved it no further.
       So the cost of a rasterisation here is not the footprint loop, and the
       ladder's own argument says why it would not be: `buildings.ts` puts the
       loop at "about 0.7 µs a building", which is 60 ms for the whole city.
       What is left is the per-raster work that does not scale with either the
       rungs or the resolution — `TerrainField`'s 67,600 nodes and the
       surround's 56,330 cells — and that is also why `camera.ts`'s own
       `FILM_DPR` table only moves the worst frame 1036 → 729 ms for a 3.3×
       cut in pixels. See FILM.md §the frame rate.
       Turning the rungs on for a film move would therefore trade the picture —
       silhouettes instead of buildings, in the one part of the film that is
       watched rather than scrubbed — for nothing measurable, which is the same
       trade the mock's own massing hold was retired for. */
    const moving = film ? false : this.mode !== "idle";
    const lowRes = moving;
    const wantSlot: SlotPlan["name"] =
      film ? "fi" : moving ? (this.mode === "zoom" ? "zo" : "lo") : "hi";
    const key = this.contentKey(step);
    const placement: Placement | null = this.cur
      ? place(this.cur, this.cam, this.W, this.H, this.DPR, !moving)
      : null;

    /* ── THE ONE CLAUSE THE FILM CHANGES ──────────────────────────────
       A gesture is repainted on a magnification ceiling it has to GUESS at from
       velocity; the film knows its own trajectory, so `decideRasterExternal`
       drops the velocity clauses and keeps the four structural ones — no
       buffer, a band change, the buffer stopped covering, the content moved on.
       Everything else about this frame is the shipped path, byte for byte. */
    const d = film
      ? decideRasterExternal({
          cur: this.cur,
          placement,
          camStep: step,
          key,
          W: this.W,
          H: this.H,
        })
      : decideRaster({
          cur: this.cur,
          placement,
          camStep: step,
          key,
          moving,
          lowRes,
          isHiSlot: this.curSlot === "hi",
          mode: this.mode,
          now,
          lastRaster: this.lastRaster,
          W: this.W,
          H: this.H,
        });

    if (d.need) {
      this.rasterise(wantSlot, key, step, now);
      this.lastWhy = d.why;
    }

    // SURROUND FILL BEFORE THE BLIT. A magnified blit leaves nothing outside
    // itself, and this is what stops a fast flick showing raw canvas at the
    // frame edge.
    const g = this.ctx;
    g.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    g.fillStyle = HAZE;
    g.fillRect(0, 0, this.W, this.H);

    const slot = this.slots.get(this.curSlot);
    if (this.cur && slot) {
      const p = place(this.cur, this.cam, this.W, this.H, this.DPR, !moving);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "low";
      g.drawImage(slot.cv, p.dx, p.dy, p.dw, p.dh);
    }

    const fadeT = (now - this.fadeT0) / BAND_FADE;
    if (fadeT >= 0 && fadeT < 1 && this.fadeCv) {
      g.save();
      g.globalAlpha = 1 - fadeT;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.fadeCv, 0, 0);
      g.restore();
      g.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    }
    /* THE OVERLAY IS ON THE GLASS, at viewport size, after everything. The
       subject's name is culled against the frame the READER is looking at, so
       the blit and a settled render agree by construction rather than by luck —
       a label that blinks on when a rasterisation lands is exactly the artefact
       a blit is supposed not to have. */
    if (film?.overlay) film.overlay(g, this.W, this.H);
    this.paintedStep = step;
  }

  /**
   * A DIAL MOVED. What is still true, by reason.
   *
   * `"band"` — ZEX only. The scene's band caches are keyed per band and each
   * was built at its own ZEX, so they stand; the tree sprite sheet bakes ZEXB,
   * not ZEX, so it stands; every table pre-projected at z = 0 stands. Two
   * things do not. The pan clamp's world box is per band and the box the
   * camera is being held inside is now the wrong band's — `CAMERA.md` finding
   * 7, the failure mode that does not throw and does not draw wrong, it just
   * pulls the camera toward a city that is not there. And the raster buffer was
   * painted on the other plane, so it cannot be blitted across this: the blit
   * is a similarity transform and a ZEX change is not one.
   *
   * `"tilt"` / `"bearing"` — the plane itself moved. The fit, the boxes and
   * every band cache are all functions of it, so this is a full `refit()` and a
   * dropped scene. Nothing calls those setters on this page yet; the branch is
   * here because the event is typed and a reason that is silently ignored is
   * how the stale-box bug got in the first time.
   */
  private onProjRebuild(reason: RebuildReason): void {
    if (reason === "band") {
      const boxes = this.bandBoxes;
      if (boxes) {
        const step = this.cam.step;
        this.cam.bbox = boxes[step] ?? boxes[0];
        // re-hold the camera inside the box it is actually in now, rather than
        // leaving it outside one until the reader's next gesture
        this.cam.clamp(this.W, this.H, this.ledgerW);
      }
    } else {
      this.scene.invalidateBands();
      this.refit();
    }
    this.cur = null;
    this.invalidate();
  }

  private paintEmpty(): void {
    const g = this.ctx;
    g.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    g.fillStyle = HAZE;
    g.fillRect(0, 0, this.W, this.H);
  }

  /**
   * THE CONTENT KEY, and what may not be in it.
   *
   * `cam.cx`, `cam.cy` and `cam.scale` are NOT here: a pan or a zoom is a blit
   * of this same content, and putting a camera term in the key is a cache miss
   * per frame, which is the jumpy-zoom bug this renderer shipped with twice.
   * The one continuous term that belongs — the LOD ladder's dissolve weight —
   * is QUANTISED (`quantiseForKey`, a 32nd) so a whole wheel sweep crosses
   * three to five values of it rather than sixty.
   */
  private contentKey(step: number): string {
    const z = this.cam.z();
    const w = z <= 1.55 ? 0 : z >= 2.35 ? 1 : (z - 1.55) / 0.8;
    /* ── AND WHY THE DATA VERSION FREEZES DURING A GESTURE ─────────────
       A pan at the district camera asks the store for dozens of new cells and
       every one that lands is a content change. Left in the key, each arrival
       is a `decideRaster` "content" — gated at one per RERASTER_MIN, so eight
       a second, each repainting 87,774 buildings. MEASURED: a 30-step drag
       took 37.6 s and 4.4 rAF/s.
       Freezing the version for the duration of the gesture is not a fudge, it
       is the dissolve's own argument applied to arrival: `buildings.ts` says a
       cell that has not landed yet "reads as FEWER BUILDINGS, which is what
       that band is supposed to look like anyway". The buffer catches up on the
       settle, which is the one frame that can afford it. */
    const dv = this.mode === "idle" ? this.dataVersion : this.frozenDataVersion;
    /* ── AND WHY THE FILM'S YEAR IS QUANTISED IN THE KEY ────────────────
       `CAMERA.md` finding 6: **quantise the KEY, never the VALUE.** Inside a run
       the year is fractional and it drives the fabric's arrival wave, so left
       raw it is a cache miss every frame — the same jumpy-zoom bug wearing a
       different hat. `YEAR_Q` steps a year, so the wave gets its steps and a
       26-second run gets `YEAR_Q` rasterisations a year rather than 120 a
       second. Outside a run the year is pinned at `iy + 0.999` and this rounds
       to one value for the whole hold, which is why a hold is free. */
    const y = this.year;
    const yk = y === undefined ? "all" : Math.round(y * YEAR_Q);
    return `${step}|${yk}|${dv}|${this.scene.sceneVersion}|${quantiseForKey(w)}`;
  }

  private rasterise(
    name: SlotPlan["name"],
    key: string,
    step: number,
    now: number,
  ): void {
    const slot = this.slots.get(name);
    if (!slot) return;
    const moving = this.mode !== "idle";

    // where the buffer is centred, and at what scale
    const m = name === "hi" ? 1 : margin(this.W);
    const size = slotSize(this.W, this.H, name === "zo" ? 1.08 : m);
    let bcx = this.cam.cx;
    let bcy = this.cam.cy;
    let bscale = this.cam.scale;
    if (name === "fi") {
      const plan = this.film?.plan;
      if (plan) {
        bcx = plan.cx;
        bcy = plan.cy;
        bscale = plan.scale;
      }
    } else if (name === "lo") {
      const c = leadCentre(this.cam, size, this.W, this.H, this.vx, this.vy);
      bcx = c.cx;
      bcy = c.cy;
    } else if (name === "zo") {
      bscale = zoomLeadScale(this.cam.scale, this.zTarget);
    }

    const g = slot.ctx;
    g.setTransform(slot.plan.dpr, 0, 0, slot.plan.dpr, 0, 0);
    g.fillStyle = HAZE;
    g.fillRect(0, 0, slot.plan.W, slot.plan.H);

    const bufCam = {
      cx: bcx, cy: bcy, scale: bscale,
      base: this.cam.base, step,
    };
    this.lastStats = this.scene.paint(
      {
        ctx: g,
        W: slot.plan.W,
        H: slot.plan.H,
        cam: bufCam,
        proj: projection,
        dpr: slot.plan.dpr,
        moving,
        year: this.year,
      },
      { year: this.year },
    );

    this.cur = {
      W: slot.plan.W, H: slot.plan.H,
      scale: bscale, cx: bcx, cy: bcy,
      step, key,
    };
    this.curSlot = name;
    this.lastRaster = now;
    this.rasters++;

    // tell the data layer where we are looking. `setView` is the whole request
    // policy: it aborts what this view cannot show and rebuilds the queue
    // nearest-first, so the cell under the cursor lands before the frame edge.
    this.data.setView(this.scene.viewQuad(this.cam, this.W, this.H));
    this.scene.build();
  }

  private emit(): void {
    const s = this.data.stats();
    this.opts.onState?.({
      z: this.cam.z(),
      mode: this.mode,
      fps: this.fps,
      rasters: this.rasters,
      lastWhy: this.lastWhy,
      scene: this.lastStats,
      held: s.held,
      inFlight: s.inFlight,
      queued: s.queued,
      heldBytes: s.heldBytes,
    });
  }

  // ── listeners ────────────────────────────────────────────────────────────

  private onDown = (e: PointerEvent): void => {
    /* WHILE THE FILM IS RUNNING THE CAMERA IS NOT THE READER'S. A press is one
       of the film's four ways out and the film's own handler takes it; the
       gesture machine must not also start a drag underneath, or the reader
       lands in the explorer at a camera the film never stopped at. */
    if (this.film) return;
    if (this.touches.size >= 2) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      this.pinchD = this.touchSpan();
      this.cam.freezeBand();
      return;
    }
    this.ptrId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    const r = this.canvas.getBoundingClientRect();
    this.downX = this.lastX = e.clientX - r.left;
    this.downY = this.lastY = e.clientY - r.top;
    this.dragging = false;
    this.vx = 0;
    this.vy = 0;
    if (this.mode === "inertia") {
      this.mode = "idle";
      this.cam.thawBand();
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (this.touches.has(e.pointerId))
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      const d = this.touchSpan();
      if (this.pinchD > 0 && d > 0) {
        const r = this.canvas.getBoundingClientRect();
        const c = this.touchCentre();
        this.cam.zoomAt(
          this.cam.scale * (d / this.pinchD),
          c.x - r.left, c.y - r.top,
          this.W, this.H, this.ledgerW,
        );
        this.pinchD = d;
        this.mode = "drag";
        this.invalidate();
      }
      return;
    }
    if (e.pointerId !== this.ptrId) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (!this.dragging) {
      // BELOW DRAG_THRESH THE CLICK SURVIVES. That is how hit-testing survives
      // the camera being anywhere at all.
      if (Math.hypot(x - this.downX, y - this.downY) < DRAG_THRESH) return;
      this.dragging = true;
      this.mode = "drag";
      this.cam.freezeBand();
    }
    const dt = Math.max(1, performance.now() - this.lastT) / 1000;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.vx = clampAbs(dx / dt, INERT_VMAX);
    this.vy = clampAbs(dy / dt, INERT_VMAX);
    this.cam.panBy(dx, dy, this.W, this.H, this.ledgerW);
    this.cam.follow = false;
    this.lastX = x;
    this.lastY = y;
    this.invalidate();
  };

  private onUp = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchD = 0;
    if (e.pointerId !== this.ptrId) return;
    this.ptrId = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* the pointer was already released */
    }
    if (!this.dragging) {
      const r = this.canvas.getBoundingClientRect();
      this.pickAt(e.clientX - r.left, e.clientY - r.top);
      this.mode = "idle";
      this.cam.thawBand();
      this.invalidate();
      return;
    }
    this.dragging = false;
    if (Math.hypot(this.vx, this.vy) >= INERT_STOP) this.mode = "inertia";
    else {
      this.mode = "idle";
      this.cam.thawBand();
    }
    this.start();
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.film) return;
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    this.zAnchor = [e.clientX - r.left, e.clientY - r.top];
    /* THE GAIN IS CHOSEN BY THE SIZE OF THE DELTA, not by ctrlKey — a trackpad
       pinch and a Ctrl+wheel are indistinguishable by modifier and not by
       magnitude. Keying it off ctrlKey made one notch multiply the zoom by
       3.5×: two events took the camera from 1.6× to 11.5×. */
    const base = this.mode === "zoom" ? this.zTarget : this.cam.scale;
    this.zTarget = Math.max(
      this.cam.base,
      Math.min(this.cam.maxScale(), base * wheelFactor(e.deltaY)),
    );
    if (this.mode !== "zoom") this.cam.freezeBand();
    this.mode = "zoom";
    this.cam.follow = false;
    this.settleAt = performance.now() + SETTLE_MS;
    this.start();
  };

  /**
   * The keyboard. Arrow keys pan 12 % of the viewport, Shift 40 %; `+`/`-`
   * zoom by `KEY_ZOOM`; `Home` goes back to the whole city. Same numbers as
   * the pointer path, from `camera.ts`.
   */
  private onKey = (e: KeyboardEvent): void => {
    if (this.film) return;
    const big = e.shiftKey ? KEY_PAN_BIG : KEY_PAN;
    const px = this.W * big;
    const py = this.H * big;
    let used = true;
    switch (e.key) {
      case "ArrowLeft": this.cam.panBy(px, 0, this.W, this.H, this.ledgerW); break;
      case "ArrowRight": this.cam.panBy(-px, 0, this.W, this.H, this.ledgerW); break;
      case "ArrowUp": this.cam.panBy(0, py, this.W, this.H, this.ledgerW); break;
      case "ArrowDown": this.cam.panBy(0, -py, this.W, this.H, this.ledgerW); break;
      case "+": case "=":
        this.cam.zoomAt(this.cam.scale * KEY_ZOOM, this.W / 2, this.H / 2, this.W, this.H, this.ledgerW);
        break;
      case "-": case "_":
        this.cam.zoomAt(this.cam.scale / KEY_ZOOM, this.W / 2, this.H / 2, this.W, this.H, this.ledgerW);
        break;
      case "Home": this.home(); break;
      case "Enter": case " ":
        this.pickAt(this.W / 2, this.H / 2);
        break;
      default: used = false;
    }
    if (used) {
      e.preventDefault();
      this.cam.follow = false;
      this.invalidate();
    }
  };

  private pickAt(x: number, y: number): void {
    if (!this.opts.onPick) return;
    const b = this.scene.pick(x, y, this.cam, this.W, this.H);
    this.opts.onPick(b);
  }

  private touchSpan(): number {
    const t = Array.from(this.touches.values());
    return t.length === 2 ? Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) : 0;
  }

  private touchCentre(): { x: number; y: number } {
    const t = Array.from(this.touches.values());
    if (t.length !== 2) return { x: 0, y: 0 };
    return { x: (t[0].x + t[1].x) / 2, y: (t[0].y + t[1].y) / 2 };
  }

  private wire(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("keydown", this.onKey);
  }

  private unwire(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("keydown", this.onKey);
  }

  /**
   * A frame-rate measurement that cannot be fooled by a deferred canvas.
   *
   * Drives the camera through `frames` real rAF ticks and returns the rate the
   * browser actually delivered. It does NOT time a draw into a detached canvas:
   * that measures the JS only, and it has fooled four agents on this project.
   */
  measure(frames = 90): Promise<{ fps: number; rasters: number }> {
    const r0 = this.rasters;
    return new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const step = (): void => {
        this.dirty = true;
        n++;
        if (n >= frames) {
          const ms = performance.now() - t0;
          res({ fps: (frames * 1000) / ms, rasters: this.rasters - r0 });
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
}

function clampAbs(v: number, m: number): number {
  return v > m ? m : v < -m ? -m : v;
}

export { bandOf, MOTION_DPR };
