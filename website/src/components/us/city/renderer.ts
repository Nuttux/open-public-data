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
  type NavMode,
  type Placement,
  type Rastered,
  type SlotPlan,
} from "@/lib/city/camera";
import { projection } from "@/lib/city/projection";
import { HAZE } from "@/lib/city/terrain";
import type { CityData } from "@/lib/city/data";
import { CityScene, type SceneStats } from "./scene";

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

  private get ledgerW(): number {
    return this.opts.ledgerW ?? LEDGER_W;
  }

  destroy(): void {
    this.disposed = true;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.unwire();
    this.unsub?.();
    this.unsub = null;
    this.slots.clear();
    this.fadeCv = null;
  }

  setYear(y: number | undefined): void {
    this.year = y;
    this.invalidate();
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

    const moving = this.mode !== "idle";
    const lowRes = moving;
    const wantSlot: SlotPlan["name"] =
      moving ? (this.mode === "zoom" ? "zo" : "lo") : "hi";
    const key = this.contentKey(step);
    const placement: Placement | null = this.cur
      ? place(this.cur, this.cam, this.W, this.H, this.DPR, !moving)
      : null;

    const d = decideRaster({
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
    this.paintedStep = step;
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
    return `${step}|${this.year ?? "all"}|${dv}|${quantiseForKey(w)}`;
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
    if (name === "lo") {
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
