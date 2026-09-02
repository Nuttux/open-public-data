/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/tile-marks.ts — THE SUBJECT MARKS, IN INK, OVER THE TILES.

   `layers/theme-marks.ts` draws the marks on the GPU page as instanced
   meshes standing in the city. The tile page has no GPU city to stand in,
   so the same marks are drawn in ink on a 2D canvas over the pictures — the
   doctrine `overlay.ts` states: the picture is the world, the writing goes
   over it, and a subject mark is writing.

   SAME FILE, SAME FILTER, SAME TWO MODES. `blocks/theme-marks.json` is read
   as the GPU layer reads it; a subject lights the marks whose year falls in
   the same `WINDOW_YEARS` window around the rail's year; a subject that
   lights more than `CARPET_BLOCKS` blocks draws as density — one translucent
   glow per block, area following the count — and fewer as dots. The dot is
   the GPU layer's face: a rim in the subject's colour darkened, a disc in the
   colour. The numbers a reader sees in the chip row (`state`) are computed
   by the same rule, so the two pages report the same counts for the same
   subject and year.

   THE HIT TEST IS THE DRAWING'S. `markAt` projects a mark through the very
   camera `draw` projected it with and asks in screen pixels, which is the
   lesson the GPU layer paid 83 px to learn — two implementations of one
   projection are one too many.
   ═══════════════════════════════════════════════════════════════════════ */

import { projection, type ViewCamera } from "@/lib/city/projection";

import { CARPET_BLOCKS, MARK_PX, WINDOW_YEARS } from "./theme-ink";

/** `blocks/theme-marks.json`, the columns this module reads */
export interface TileMarksFile {
  readonly s: readonly number[];
  readonly b: readonly number[];
  readonly r: readonly number[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly yr: readonly number[];
  readonly m: readonly number[];
}

export interface TileMarkHit {
  readonly bit: number;
  readonly mark: number;
  readonly block: number;
  readonly record: number;
  readonly source: number;
  /** how many marks the glow stands for — 1 for a dot */
  readonly of: number;
}

export interface TileMarkFilter {
  bits: number;
  year?: number;
  window?: number;
}

export interface TileMarksState {
  bit: number;
  marks: number;
  blocks: number;
  mode: "dots" | "density";
}

export interface TileMarks {
  setFilter(f: TileMarkFilter): number;
  draw(ctx: CanvasRenderingContext2D, cam: ViewCamera, W: number, H: number): void;
  markAt(sx: number, sy: number, cam: ViewCamera, W: number, H: number): TileMarkHit | null;
  readonly state: readonly TileMarksState[];
}

/* the GPU layer's own numbers — `theme-marks.ts` §place, §rebuild */
const LIFT_PX = 3;
const DENSITY_BASE = 0.5;
const DENSITY_MAX = 2.4;
const GLOW_ALPHA = 0.3;
/* the dot face: a rim at 0.94 R in the colour darkened to 0x59/0xff, a disc
   at 0.72 R in the colour — `theme-marks.ts` §markFace */
const RIM_R = 0.94;
const DISC_R = 0.72;
const RIM_K = 0x59 / 0xff;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

interface Drawn {
  x: number;
  y: number;
  /** size relative to a dot */
  s: number;
  /** the mark it stands for — the first, for a glow */
  i: number;
  n: number;
}

export function tileMarks(
  file: TileMarksFile | null,
  o: {
    elevAt(wx: number, wy: number): number;
    colours: readonly string[];
    bits: number;
    carpetBlocks?: number;
  },
): TileMarks | null {
  if (!file || !file.m || file.m.length === 0) return null;
  const f = file;
  const n = f.m.length;
  const carpet = o.carpetBlocks ?? CARPET_BLOCKS;

  const byBit: number[][] = [];
  for (let bit = 0; bit < o.bits; bit++) byBit.push([]);
  for (let i = 0; i < n; i++) {
    const m = f.m[i];
    for (let bit = 0; bit < o.bits; bit++) {
      /* the bit operators coerce to int32, so this divides rather than shifts */
      if (Math.floor(m / 2 ** bit) % 2 === 1) byBit[bit].push(i);
    }
  }

  const state: TileMarksState[] = [];
  for (let bit = 0; bit < o.bits; bit++) state.push({ bit, marks: 0, blocks: 0, mode: "dots" });
  const drawn: Drawn[][] = state.map(() => []);
  let cur: TileMarkFilter = { bits: 0 };

  function rebuild(bit: number): void {
    const on = (cur.bits && Math.floor(cur.bits / 2 ** bit) % 2 === 1) || false;
    const st = state[bit];
    drawn[bit].length = 0;
    if (!on) {
      st.marks = 0;
      st.blocks = 0;
      return;
    }
    const half = (cur.window ?? WINDOW_YEARS) / 2;
    const lo = cur.year === undefined ? -Infinity : cur.year - half;
    const hi = cur.year === undefined ? Infinity : cur.year + half;
    const hit: number[] = [];
    const perBlock = new Map<number, number>();
    for (const i of byBit[bit]) {
      const yr = f.yr[i];
      if (yr < lo || yr > hi) continue;
      hit.push(i);
      /* a mark on no block aggregates with its own record, never with a block */
      const key = f.b[i] >= 0 ? f.b[i] : -1 - f.r[i];
      perBlock.set(key, (perBlock.get(key) ?? 0) + 1);
    }
    st.marks = hit.length;
    st.blocks = perBlock.size;
    st.mode = perBlock.size > carpet ? "density" : "dots";
    if (hit.length === 0) return;
    if (st.mode === "dots") {
      for (const i of hit) drawn[bit].push({ x: f.x[i], y: f.y[i], s: 1, i, n: 1 });
      return;
    }
    const at = new Map<number, Drawn>();
    for (const i of hit) {
      const key = f.b[i] >= 0 ? f.b[i] : -1 - f.r[i];
      const e = at.get(key);
      if (e) e.n++;
      else at.set(key, { x: f.x[i], y: f.y[i], s: 1, i, n: 1 });
    }
    for (const e of at.values()) {
      e.s = DENSITY_BASE * Math.min(DENSITY_MAX, Math.sqrt(e.n));
      drawn[bit].push(e);
    }
  }

  /* where a mark sits on this frame: through the page's projection, on the
     ground under it, lifted the GPU layer's three pixels */
  const screen = (d: Drawn, cam: ViewCamera, W: number, H: number): [number, number] => {
    const pl = projection.proj(d.x, d.y, o.elevAt(d.x, d.y));
    return [
      (pl[0] - cam.cx) * cam.scale + W / 2,
      H / 2 - (pl[1] - cam.cy) * cam.scale - LIFT_PX,
    ];
  };

  return {
    state,
    setFilter(next) {
      cur = next;
      let total = 0;
      for (let bit = 0; bit < o.bits; bit++) {
        rebuild(bit);
        total += state[bit].marks;
      }
      return total;
    },
    draw(ctx, cam, W, H) {
      for (let bit = 0; bit < o.bits; bit++) {
        const list = drawn[bit];
        if (!list.length) continue;
        const colour = o.colours[bit] ?? "#c8483c";
        if (state[bit].mode === "dots") {
          const rim = shade(colour, RIM_K);
          const R = MARK_PX / 2;
          for (const d of list) {
            const [X, Y] = screen(d, cam, W, H);
            if (X < -R || Y < -R || X > W + R || Y > H + R) continue;
            ctx.beginPath();
            ctx.arc(X, Y, R * RIM_R, 0, Math.PI * 2);
            ctx.fillStyle = rim;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(X, Y, R * DISC_R, 0, Math.PI * 2);
            ctx.fillStyle = colour;
            ctx.fill();
          }
        } else {
          for (const d of list) {
            const [X, Y] = screen(d, cam, W, H);
            const R = (d.s * MARK_PX) / 2;
            if (X < -R || Y < -R || X > W + R || Y > H + R) continue;
            const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
            g.addColorStop(0, rgba(colour, GLOW_ALPHA));
            g.addColorStop(1, rgba(colour, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(X, Y, R, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    },
    markAt(sx, sy, cam, W, H) {
      let best: TileMarkHit | null = null;
      let bestD = Infinity;
      for (let bit = 0; bit < o.bits; bit++) {
        for (const d of drawn[bit]) {
          const [mx, my] = screen(d, cam, W, H);
          /* a finger is wider than a pixel — the GPU layer's own tolerance */
          const rad = d.s * MARK_PX * 0.75;
          const dist = Math.hypot(sx - mx, sy - my);
          if (dist > rad || dist >= bestD) continue;
          bestD = dist;
          best = { bit, mark: d.i, block: f.b[d.i], record: f.r[d.i], source: f.s[d.i], of: d.n };
        }
      }
      return best;
    },
  };
}
