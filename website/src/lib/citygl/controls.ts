/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/controls.ts — DRAG, ZOOM, KEYS.

   The Canvas renderer's controls carry a whole apparatus this one does not
   need: an inertia coast with its own decay constant, a low-resolution slot
   for the duration of a gesture, a lead-centre so the blit covers where the
   camera is going, and a band freeze so a projection change cannot land
   mid-drag. Every one of those exists because a repaint costs a second.

   Here a frame costs a fraction of a millisecond, so a drag is just: move the
   camera, draw. What is left is the part that is actually about the reader —
   zooming about the POINTER rather than the centre, so the thing under the
   cursor stays under it, and a keyboard that can do everything the mouse can.
   ═══════════════════════════════════════════════════════════════════════ */

import { screenToPlane, type ViewCamera } from "@/lib/city/projection";

export interface ControlsHost {
  getCamera(): { cx: number; cy: number; scale: number };
  setCamera(c: { cx: number; cy: number; scale: number }): void;
  setStep(step: number): void;
  getStep(): number;
  readonly viewport: { W: number; H: number; dpr: number };
}

export interface ControlsOptions {
  /** the scale at which the whole city fits — z is measured against it */
  base: number;
  /** clamp: how far in and out a reader may go, as multiples of `base` */
  zMin?: number;
  zMax?: number;
  /** called whenever the camera moved, so a caller can redraw its own chrome */
  onChange?: () => void;
}

/**
 * WHICH BAND A ZOOM IS IN.
 *
 * The Canvas ladder's own thresholds, read off `ZEX_BY_STEP`'s three entries:
 * the whole city, a district, and everything closer. It is a step function on
 * purpose — the vertical exaggeration is a DECLARED treatment and a
 * continuously varying one would make two frames of the same city
 * incomparable.
 */
export function stepForZ(z: number): number {
  return z < 1.6 ? 0 : z < 3.2 ? 1 : 2;
}

export function attachControls(
  el: HTMLElement,
  host: ControlsHost,
  o: ControlsOptions,
): () => void {
  const zMin = o.zMin ?? 0.85;
  const zMax = o.zMax ?? 26;

  const changed = (): void => o.onChange?.();

  const setScale = (scale: number): number => {
    const z = scale / o.base;
    const clamped = Math.max(zMin, Math.min(zMax, z));
    return clamped * o.base;
  };

  const syncStep = (scale: number): void => {
    const want = stepForZ(scale / o.base);
    if (want !== host.getStep()) host.setStep(want);
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pid = -1;

  /* ── THE COAST, AND WHY THIS FILE NOW HAS ONE ───────────────────────────
     The header above argues that this renderer does not need the Canvas
     page's inertia apparatus, because that existed to hide a repaint that
     cost a second. That is true and it is the wrong conclusion. Inertia is
     not a way of hiding cost — it is what makes a map feel like a thing with
     weight rather than a picture that teleports. On a renderer where a frame
     is free it is affordable, so it is worth having for its own sake.

     The decay is per SECOND and applied as `k ** dt`, not per frame, so the
     coast is the same length on a 60 Hz laptop and a 120 Hz phone. 0.0045 is
     `0.02 ** 1` — a flick keeps 0.45 % of its speed after a second.

     ── AND THE FLOOR IS IN PIXELS, WHICH IS THE HALF THIS GOT WRONG ────────
     It used to be "a quarter of a plane unit per second, below which the last
     frame is invisible". A plane unit is not a pixel: at the street camera it
     is several, so that floor let the coast run down to about 0.65 px/s and
     tick on for well over a second after the hand let go.

     Nothing about that is invisible. The camera is snapped to the device grid
     (`camera.ts` §THE CAMERA THE FRAME IS DRAWN FROM), so a creep of a
     fraction of a pixel per frame does not creep — it JUMPS a whole pixel,
     every few frames, at irregular intervals, and a whole-pixel jump changes
     every edge in the city at once. Screen-recorded through Chrome's own
     compositor, a single drag went on producing those jumps until 2.4 seconds,
     more than a second after the drag ended: 0.00 %, 5.6 %, 0.00 %, 9.6 % of
     the frame, on and off. That is what was being reported as *"the shimmer
     happens when i move and after i settle but then it stops after a point"* —
     it stops when the coast finally gives up.

     So the floor is a SCREEN speed, and the number is the published page's,
     which was tuned by measurement in both directions: `lib/city/camera.ts`
     §Inertia — *"below ~38 px/s the map is not moving, it is creeping, and
     creep reads as a bug."* The launch and the decay are untouched; this only
     changes when the coast admits it is over. */
  const COAST_DECAY = 0.0045;
  /** px/s on the glass — `lib/city/camera.ts` §Inertia, `INERT_STOP` */
  const COAST_STOP_PX = 38;
  /** how much of a wheel step is taken per second while easing */
  const ZOOM_EASE = 0.00002;

  let vx = 0;
  let vy = 0;
  let lastT = 0;
  let zTarget = 0;
  let raf = 0;
  let lastStep = -1;

  const stopAnim = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    vx = 0;
    vy = 0;
    zTarget = 0;
  };

  /* one loop for both the coast and the zoom ease, so a flick during a zoom
     does not race a second rAF against the first */
  const tick = (t: number): void => {
    raf = 0;
    const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;
    const cam = host.getCamera();
    let cx = cam.cx;
    let cy = cam.cy;
    let scale = cam.scale;
    let live = false;

    if (vx || vy) {
      cx += vx * dt;
      cy += vy * dt;
      const k = Math.pow(COAST_DECAY, dt);
      vx *= k;
      vy *= k;
      /* in pixels on the glass, not in plane units — see §THE COAST */
      if (Math.hypot(vx, vy) * scale < COAST_STOP_PX) {
        vx = 0;
        vy = 0;
      } else live = true;
    }

    if (zTarget) {
      /* geometric, because zoom is: a step of the same RATIO must feel the
         same at every scale, which a linear approach does not */
      const k = 1 - Math.pow(ZOOM_EASE, dt);
      const next = setScale(scale * Math.pow(zTarget / scale, k));
      /* the pointer anchor is re-solved every frame, so the point under the
         cursor stays under it for the whole ease and not just its first
         frame */
      const p = screenToPlane(anchorSX, anchorSY, host.viewport.W, host.viewport.H, {
        cx,
        cy,
        scale,
      } as ViewCamera);
      cx = p[0] - (anchorSX - host.viewport.W / 2) / next;
      cy = p[1] + (anchorSY - host.viewport.H / 2) / next;
      scale = next;
      if (Math.abs(Math.log(zTarget / scale)) < 0.001) {
        scale = zTarget;
        zTarget = 0;
      } else live = true;
      syncStep(scale);
    }

    host.setCamera({ cx, cy, scale });
    /* ── AND THE CHROME IS NOT TOLD EVERY FRAME ─────────────────────────
       `changed()` is a React state bump. Calling it on every frame of a coast
       re-renders the whole map component — the transport row, the stops, the
       record panel — sixty times a second for the second or two the coast
       lasts, and the main thread it runs on is the same one the renderer's own
       animation frame is queued on. The engine gets starved, the compositor
       keeps showing the last frame it has, and a camera that is still moving
       under a stale frame is exactly what Daniel saw: *"when i move on the map
       everything is fuzzy/blurry for a few seconds before it goes back to a
       static state."*

       Nothing in the chrome is a function of the camera's position — only of
       its STEP, which is what lights the right zoom stop. So it is told when
       the step changes and when the gesture ends, and not otherwise. The map
       itself is not React and was never waiting on this. */
    const stepNow = host.getStep();
    if (stepNow !== lastStep) {
      lastStep = stepNow;
      changed();
    }
    if (live) raf = requestAnimationFrame(tick);
    else {
      lastT = 0;
      changed();
    }
  };

  const start = (): void => {
    if (!raf) {
      lastT = 0;
      raf = requestAnimationFrame(tick);
    }
  };

  let anchorSX = 0;
  let anchorSY = 0;

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    /* a finger on the map stops whatever the map was doing — a coast that
       fights the hand holding it is the single worst thing a map can do */
    stopAnim();
    dragging = true;
    pid = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(pid);
    el.style.cursor = "grabbing";
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== pid) return;
    const cam = host.getCamera();
    /* screen pixels to PLANE units is one division, because `SX`/`SY` are a
       similarity: `scale` px per plane unit, and the y axis is flipped. */
    const dx = (e.clientX - lastX) / cam.scale;
    const dy = (e.clientY - lastY) / cam.scale;
    const now = performance.now();
    const dt = lastT ? Math.max(0.004, (now - lastT) / 1000) : 0.016;
    lastT = now;
    /* velocity in PLANE units per second, smoothed over about three samples
       so one jittery frame at the end of a drag cannot set the coast */
    vx = vx * 0.6 + (-dx / dt) * 0.4;
    vy = vy * 0.6 + (dy / dt) * 0.4;
    lastX = e.clientX;
    lastY = e.clientY;
    host.setCamera({ cx: cam.cx - dx, cy: cam.cy + dy, scale: cam.scale });
    changed();
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    dragging = false;
    pid = -1;
    el.style.cursor = "grab";
    lastT = 0;
    if (Math.hypot(vx, vy) * host.getCamera().scale >= COAST_STOP_PX) start();
    else {
      vx = 0;
      vy = 0;
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const cam = host.getCamera();
    const { W, H } = host.viewport;
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;

    /* ── ZOOM ABOUT THE POINTER ─────────────────────────────────────────
       The plane point under the cursor before the zoom must be under it
       after. Solve `SX(p) = sx` for the new centre at the new scale and the
       algebra is two lines — no iteration, no easing, exact at every step. */
    void W;
    void H;
    /* ── THE WHEEL SETS A TARGET, THE LOOP WALKS TO IT ──────────────────
       A wheel that applies its whole step on the event lands the camera in
       one jump per notch, and a trackpad delivers thirty notches a second.
       Accumulating into a target and easing toward it turns the same input
       into one continuous movement, and it is the difference between a map
       that jerks and a map that glides. The pointer anchor is stored rather
       than solved here, because the anchor has to be re-solved at every step
       of the ease — see `tick`. */
    anchorSX = sx;
    anchorSY = sy;
    const from = zTarget || cam.scale;
    zTarget = setScale(from * Math.exp(-e.deltaY * 0.0016));
    start();
  };

  const onKey = (e: KeyboardEvent): void => {
    const cam = host.getCamera();
    const pan = 90 / cam.scale;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        host.setCamera({ ...cam, cx: cam.cx - pan });
        break;
      case "ArrowRight":
        host.setCamera({ ...cam, cx: cam.cx + pan });
        break;
      case "ArrowUp":
        host.setCamera({ ...cam, cy: cam.cy + pan });
        break;
      case "ArrowDown":
        host.setCamera({ ...cam, cy: cam.cy - pan });
        break;
      case "+":
      case "=": {
        const s = setScale(cam.scale * 1.35);
        host.setCamera({ ...cam, scale: s });
        syncStep(s);
        break;
      }
      case "-":
      case "_": {
        const s = setScale(cam.scale / 1.35);
        host.setCamera({ ...cam, scale: s });
        syncStep(s);
        break;
      }
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      changed();
    }
  };

  el.style.cursor = "grab";
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("keydown", onKey);

  return () => {
    stopAnim();
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("keydown", onKey);
  };
}
