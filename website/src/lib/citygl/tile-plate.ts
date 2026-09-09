/**
 * ── THE CITY, BEFORE THE CITY: THE TILES UNDER THE MODEL ─────────────────
 *
 * The model takes 9–13 s to draw on production. The phone page already has
 * the whole city as a tile pyramid (`scripts/render-city-tiles.mjs`), drawn
 * FROM this very model at a known reference camera — so while the model is
 * still being built, those tiles can stand in for it at the engine's own
 * camera, pixel for pixel in framing, and fade out when the model arrives.
 *
 * A still picture was tried first (2026-09-09) and taken out the same day:
 * a mosaic cropped for the phone's frame sat a little off the model. This
 * draws the tiles at the engine's camera instead, so the two frames agree.
 *
 * ── THE ARITHMETIC ───────────────────────────────────────────────────────
 * `index.json` gives the reference camera `ref` (cx, cy, scale: the plane
 * point at the frame's centre and the level-3 scale in CSS px per plane
 * unit) and, per level, its scale and tile grid. The tiles are DEVICE
 * pixels — the index says `dpr: 2` — so a level's pixel frame, `tiles ×
 * TILE` wide and centred on `ref`, is at s_L = scale · dpr device px per
 * plane unit (the first cut forgot the dpr and drew the city twice too
 * close). Level pixel (px, py) is plane
 *
 *     x = ref.cx + (px − W_L / 2) / s_L,   y = ref.cy + (H_L / 2 − py) / s_L
 *
 * — rows run down the tile image and UP the plane, because the engine puts
 * plane (x, y) on the glass at
 *
 *     X = (x − cam.cx) · cam.scale + W / 2,   Y = H / 2 − (y − cam.cy) · cam.scale
 *
 * (`engine.ts` §THE TEMPORAL SHIFT: a rise in cy sends the picture down the
 * glass, so plane y grows upward; the first cut had the city on its head).
 * A tile is therefore an axis-aligned square on the glass of side
 * TILE · cam.scale / s_L, and tile row ty sits at Y0 + ty · side with Y0 the
 * glass position of the level's top edge.
 */

export interface TileIndex {
  tile: number;
  dpr: number;
  ref: { cx: number; cy: number; scale: number };
  levels: Record<string, { scale: number; tiles: [number, number]; px: [number, number] }>;
}

export interface PlateCamera { cx: number; cy: number; scale: number }

/** what a draw computed, for a harness checking the frame */
export interface PlateFrame {
  l: string; sL: number; side: number; X0: number; Y0: number; nx: number; ny: number; W: number; H: number;
}

/** a level is chosen once its tiles would be drawn at no less than this
 *  share of their own size — a little upscaling under a wash is invisible,
 *  and it halves the tiles fetched at the whole-city fit */
const MIN_SHARP = 0.75;

export interface TilePlate {
  /** resolves true once the index is in hand, false if the city has none */
  readonly ready: Promise<boolean>;
  readonly frame: PlateFrame | null;
  readonly loaded: number;
  readonly requested: number;
  draw(cam: PlateCamera, W: number, H: number, dpr: number): void;
  dispose(): void;
}

export function createTilePlate(canvas: HTMLCanvasElement, base: string, year = "now"): TilePlate {
  let index: TileIndex | null = null;
  let dead = false;
  let last: { cam: PlateCamera; W: number; H: number; dpr: number } | null = null;
  let lastFrame: PlateFrame | null = null;
  const images = new Map<string, HTMLImageElement>();

  const ready = fetch(`${base}/${year}/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<TileIndex>) : null))
    .then((idx) => {
      if (dead || !idx || !idx.levels) return false;
      index = idx;
      if (last) draw(last.cam, last.W, last.H, last.dpr);
      return true;
    })
    .catch(() => false);

  /** device px per plane unit at a level */
  const sOf = (l: string): number => index!.levels[l].scale * (index!.dpr || 1);

  const pick = (scale: number): string => {
    const levels = Object.keys(index!.levels).sort((a, b) => Number(a) - Number(b));
    for (const l of levels) if (sOf(l) >= scale * MIN_SHARP) return l;
    return levels[levels.length - 1];
  };

  const image = (l: string, tx: number, ty: number): HTMLImageElement => {
    const key = `${l}/${tx}/${ty}`;
    let im = images.get(key);
    if (!im) {
      im = new Image();
      im.decoding = "async";
      im.onload = () => { if (!dead && last) draw(last.cam, last.W, last.H, last.dpr); };
      im.src = `${base}/${year}/${key}.webp`;
      images.set(key, im);
    }
    return im;
  };

  function draw(cam: PlateCamera, W: number, H: number, dpr: number): void {
    last = { cam, W, H, dpr };
    if (!index || dead) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const l = pick(cam.scale);
    const L = index.levels[l];
    const T = index.tile;
    const [nx, ny] = L.tiles;
    /* ── THE FRAME, NOT THE GRID ────────────────────────────────────────
       A level's frame is `px` device pixels, centred on `ref`; its tile
       grid is that rounded UP to whole tiles, padded right and down. Centre
       on the grid and the picture slides by half the padding: MEASURED at
       level 2 (frame 1280 × 768, grid 1536 × 1024) as 144 px in both axes
       by cross-correlating the plate against the drawn model. */
    const [WL, HL] = L.px;
    const sL = sOf(l);
    const side = T * (cam.scale / sL); // a tile's side on the glass, CSS px
    /* the glass position of level pixel (0, 0); the level's top edge is
       its HIGHEST plane y */
    const X0 = (index.ref.cx - WL / 2 / sL - cam.cx) * cam.scale + W / 2;
    const Y0 = H / 2 - (index.ref.cy + HL / 2 / sL - cam.cy) * cam.scale;
    lastFrame = { l, sL, side, X0, Y0, nx, ny, W, H };
    for (let ty = 0; ty < ny; ty++) {
      const Y = Y0 + ty * side;
      if (Y + side < 0 || Y > H) continue;
      for (let tx = 0; tx < nx; tx++) {
        const X = X0 + tx * side;
        if (X + side < 0 || X > W) continue;
        const im = image(l, tx, ty);
        if (im.complete && im.naturalWidth > 0) {
          ctx.drawImage(im, X, Y, side + 0.5, side + 0.5);
        }
      }
    }
  }

  return {
    ready,
    draw,
    /** what the last draw computed — for a harness */
    get frame() { return lastFrame; },
    get loaded() { return [...images.values()].filter((i) => i.complete && i.naturalWidth > 0).length; },
    get requested() { return images.size; },
    dispose() {
      dead = true;
      images.clear();
    },
  };
}
