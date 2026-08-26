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

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
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
    const p = screenToPlane(sx, sy, W, H, cam as ViewCamera);
    const next = setScale(cam.scale * Math.exp(-e.deltaY * 0.0016));
    host.setCamera({
      cx: p[0] - (sx - W / 2) / next,
      cy: p[1] + (sy - H / 2) / next,
      scale: next,
    });
    syncStep(next);
    changed();
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
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("keydown", onKey);
  };
}
