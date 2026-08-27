/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/export.ts — THE VIEW YOU ARE LOOKING AT, AT PRINT SIZE.

   A city drawn from a public record is worth showing to people who will
   never open the page, and the way a picture travels is that somebody saves
   it and posts it. At the window's own pixel count it is a screenshot; at
   four times it is something you can print at A3 and read the street names
   on.

   ── WHY THIS IS NOT A SCREENSHOT ─────────────────────────────────────────
   The obvious implementation — `canvas.toDataURL()` — gives the drawing
   buffer at the size the window happens to be, and the type sits on a SECOND
   canvas above the first, so it would not be in the file at all. This renders
   the scene again at a higher pixel count, re-lays the type at that count so
   the labels are resolved rather than resampled, and composites the two.

   ── AND WHY IT IS NOT A BIGGER CAMERA ────────────────────────────────────
   The camera does not change. Same centre, same scale, same year, same
   everything the reader chose — only the sampling gets finer. A picture that
   framed itself differently from the screen it was saved from would be a
   different picture, and the reader would be right to feel cheated.

   ── THE ONE THING THAT DOES CHANGE, AND IT IS STATED ─────────────────────
   Line weights that are specified in PIXELS — the type, the coastline ink,
   the kerbs — are laid at the export's own device pixel ratio, so they keep
   their PHYSICAL weight rather than growing four times thicker. That is the
   behaviour a reader wants (a hairline stays a hairline) and it is the
   opposite of what upscaling a screenshot does.
   ═══════════════════════════════════════════════════════════════════════ */

import type { CityEngine } from "./engine";

export interface ExportOptions {
  /** how many times the window's own pixel count, 1..8 */
  scale?: number;
  /** the 2D canvas the type is drawn on, if the page has one */
  overlay?: HTMLCanvasElement | null;
  /** re-lay the type at the export's pixel ratio, then put it back */
  resizeOverlay?: (w: number, h: number, dpr: number) => void;
  /** what the file is called */
  filename?: string;
}

/**
 * ── THE CEILING IS A REAL LIMIT, NOT A ROUND NUMBER ──────────────────────
 * WebGL's `MAX_TEXTURE_SIZE` and `MAX_RENDERBUFFER_SIZE` are commonly 16,384
 * and the post chain allocates several targets of the frame's size. A 1440 x
 * 900 window at 4x with a device pixel ratio of 2 is already 11,520 x 7,200,
 * which is inside that but not by much, so the scale is clamped against the
 * context's own answer rather than against a guess.
 */
function maxScaleFor(canvas: HTMLCanvasElement, w: number, h: number): number {
  const gl =
    (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
    (canvas.getContext("webgl") as WebGLRenderingContext | null);
  const cap = gl ? (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number) : 8192;
  return Math.max(1, Math.floor(cap / Math.max(w, h)));
}

/**
 * Render the current view at `scale` times the window's pixel count and hand
 * back a PNG blob URL. The caller owns the URL and must revoke it.
 *
 * Restores the viewport before returning, including when the render throws —
 * a failed export that leaves the map at 11,520 px wide is worse than no
 * export.
 */
export async function exportView(
  engine: CityEngine,
  o: ExportOptions = {},
): Promise<{ url: string; width: number; height: number } | null> {
  const canvas = engine.canvas;
  if (!canvas) return null;

  const vp = engine.viewport;
  const W = vp.W;
  const H = vp.H;
  const dpr0 = vp.dpr;
  const want = Math.max(1, Math.min(8, o.scale ?? 4));
  const dpr = Math.min(want * dpr0, maxScaleFor(canvas, W, H));
  const outW = Math.round(W * dpr);
  const outH = Math.round(H * dpr);

  try {
    engine.resize(W, H, dpr);
    o.resizeOverlay?.(W, H, dpr);
    /* SYNCHRONOUS, AND READ IN THE SAME TASK. Without `preserveDrawingBuffer`
       the drawing buffer is cleared as soon as the browser composites, so a
       read one frame later comes back blank — this cost ten blank PNGs once
       already and is why `renderNow` exists. */
    engine.renderNow();

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const g = out.getContext("2d");
    if (!g) return null;
    g.drawImage(canvas, 0, 0, outW, outH);

    /* ── AND NOTHING IS DONE ABOUT COLOUR HERE, WHICH WAS CHECKED ─────────
       The WebGPU backend draws into an `rgba16float` buffer, so reading its
       canvas with `toDataURL` hands back LINEAR light and a file saved from
       that comes out dark — 74 of 255 against the other backend's 165.8 for
       the same frame. That measurement is real and it is about `toDataURL`.

       It is not about THIS path. `drawImage` into a 2D context does the
       conversion on the way in, so the export was never affected: pressing
       Save image on both backends over the same camera lands 150.3/143.9/
       129.2 and 149.4/143.0/128.4 — the same picture, within a level.

       An sRGB encode was added here on the strength of the `toDataURL`
       number and made the file 49 levels too bright, which is what measuring
       one path and fixing another looks like. */
    if (o.overlay) g.drawImage(o.overlay, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
    if (!blob) return null;
    return { url: URL.createObjectURL(blob), width: outW, height: outH };
  } finally {
    engine.resize(W, H, dpr0);
    o.resizeOverlay?.(W, H, dpr0);
    engine.renderNow();
  }
}

/** Save the current view. Returns the pixel size written, or null. */
export async function saveView(
  engine: CityEngine,
  o: ExportOptions = {},
): Promise<{ width: number; height: number } | null> {
  const shot = await exportView(engine, o);
  if (!shot) return null;
  const a = document.createElement("a");
  a.href = shot.url;
  a.download = o.filename ?? "city.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* the blob is held by the download until the click is processed; a task
     later is enough and leaking it would hold the whole bitmap */
  setTimeout(() => URL.revokeObjectURL(shot.url), 30_000);
  return { width: shot.width, height: shot.height };
}
