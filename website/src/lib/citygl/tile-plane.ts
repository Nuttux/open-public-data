/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/tile-plane.ts — THE TILE PYRAMID'S OWN COORDINATES.

   `scripts/render-city-tiles.mjs` drives the live engine and cuts what it
   draws into 512 px tiles, one level per doubling of the camera, and writes
   `index.json` beside them: the reference camera it framed level 3 on and,
   per level, the canvas it cut. This module is the arithmetic that turns
   that file back into a map — where a plane point sits on the pyramid and
   what camera a tile view stands for — so the label overlay, which only
   knows a `ViewCamera`, can be drawn over tiles it has never heard of.

   ── ONE FRAME, STATED ONCE ──────────────────────────────────────────────
   The pyramid's frame is LEVEL-0 CSS PIXELS, y down, origin at the top-left
   of level 0. A tile is `tile` device pixels on disk and is shown at
   `TILE_CSS` CSS pixels, so a level-z pixel is a level-0 pixel times 2^z and
   tile (x, y) at level z covers pixels [x·256, (x+1)·256) — which is exactly
   how the renderer numbered them (it cut at 512 device px = 256 CSS px).

   Plane → frame: the renderer put `ref` at the centre of every level, with
   `ref.scale` CSS px per plane unit AT LEVEL 3 in ITS OWN CSS px (dpr 2). A
   tile shown at TILE_CSS/tile of its device size is shown at
   `dpr · TILE_CSS / tile` of the renderer's CSS px — 1 when dpr is 2 and the
   tile is 512 — so the frame's scale at level 0 is

       s0 = ref.scale · 2^(0-3) · dpr · TILE_CSS / tile

   and X = (px − ref.cx)·s0 + w0/2, Y = h0/2 − (py − ref.cy)·s0, with y
   flipped because the plane's y runs up and the frame's runs down.

   Leaflet's `CRS.Simple` is (lat, lng) = (−Y, X) on this frame, which the
   map component applies; nothing here knows Leaflet.
   ═══════════════════════════════════════════════════════════════════════ */

import type { ViewCamera } from "@/lib/city/projection";

/** a tile as shown, CSS px — half its device size, so it is crisp at dpr 2 */
export const TILE_CSS = 256;

export interface TileLevel {
  band: number;
  scale: number;
  tiles: [number, number];
  px: [number, number];
}

export interface TileIndex {
  tile: number;
  dpr: number;
  ref: { cx: number; cy: number; scale: number };
  levels: Record<string, TileLevel>;
}

export interface TilePlane {
  /** the deepest level the pyramid holds */
  zmax: number;
  /** shown CSS px per plane unit at level 0 */
  s0: number;
  /** level 0's own extent, shown CSS px */
  w0: number;
  h0: number;
  /** plane → frame */
  toFrame(px: number, py: number): [number, number];
  /** frame → plane */
  toPlane(X: number, Y: number): [number, number];
  /** shown CSS px per plane unit at a (fractional) zoom */
  scaleAt(zoom: number): number;
  /** the zoom at which one plane unit is `scale` shown CSS px */
  zoomFor(scale: number): number;
  /** the camera a view stands for — frame centre and zoom in, `ViewCamera` out */
  cameraOf(X: number, Y: number, zoom: number): ViewCamera;
}

export function tilePlane(index: TileIndex): TilePlane {
  const zs = Object.keys(index.levels).map(Number).filter(Number.isFinite);
  if (!zs.length || !index.levels["0"]) throw new Error("tiles: index has no level 0");
  const zmax = Math.max(...zs);
  const k = (index.dpr * TILE_CSS) / index.tile;
  const s0 = (index.ref.scale * k) / 2 ** 3;
  const w0 = (index.levels["0"].px[0] * TILE_CSS) / index.tile;
  const h0 = (index.levels["0"].px[1] * TILE_CSS) / index.tile;
  const { cx, cy } = index.ref;
  const toFrame = (px: number, py: number): [number, number] => [
    (px - cx) * s0 + w0 / 2,
    h0 / 2 - (py - cy) * s0,
  ];
  const toPlane = (X: number, Y: number): [number, number] => [
    cx + (X - w0 / 2) / s0,
    cy + (h0 / 2 - Y) / s0,
  ];
  const scaleAt = (zoom: number): number => s0 * 2 ** zoom;
  const zoomFor = (scale: number): number => Math.log2(scale / s0);
  return {
    zmax, s0, w0, h0, toFrame, toPlane, scaleAt, zoomFor,
    cameraOf(X, Y, zoom) {
      const [px, py] = toPlane(X, Y);
      return { cx: px, cy: py, scale: scaleAt(zoom) };
    },
  };
}

/**
 * Which renderer a page should mount.
 *
 * `?tiles=1` and `?tiles=0` are the A/B and win outright. Otherwise the tile
 * map is for a phone: a coarse pointer AND a narrow window — the width the
 * stylesheet stacks the ledger under the map at is 819, and a tablet in
 * landscape keeps the live model. A page whose city ships no pyramid never
 * gets tiles whatever the device says.
 */
export function wantsTiles(
  search: string,
  env: { coarse: boolean; width: number },
  hasTiles: boolean,
): boolean {
  if (!hasTiles) return false;
  const m = /(?:\?|&)tiles=([01])/.exec(search);
  if (m) return m[1] === "1";
  return env.coarse && env.width < 900;
}
