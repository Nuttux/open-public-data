/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/layers/theme-marks.ts — WHERE A SUBJECT HAPPENED, ON THE GPU.

   One mark is one record: a Board decision at the block it names, a document
   at the place it is about. The pipeline decides which subjects each record
   carries and ships the answer as a bitmask; nothing here reads any text.
   `pipeline/scripts/us_sf_city/blocks/themes.py` says why that is not a
   detail — the same patterns run against the line the page prints find 22 %
   of the Fire record and 41 % overall.

   ── WHY THIS IS NOT ON THE 2D OVERLAY ────────────────────────────────────
   `overlay.ts` states the doctrine — "the GPU draws the world, a 2D canvas
   over it draws the writing" — and refuses 4,895 street features on the CPU
   path because they cost too much per frame. All eight subjects at once is
   16,468 marks, 3.4x that. So they are instanced geometry: eight draw calls,
   one per subject, and the per-frame cost is independent of how many are lit.

   ── DOTS OR DENSITY, AND THE DATA DECIDES ────────────────────────────────
   Measured over the published marks, a subject lights between 257 and 2,171
   blocks. Those two want opposite things:

     Homelessness       455 marks,   257 blocks  — you can aim at one dot
     Schools          5,664 marks, 2,171 blocks  — 63 % of every block that
                                                   holds a mark at all

   At city zoom the second is a carpet: no dot is a target and the shape is
   lost in the overlap. So above `CARPET_BLOCKS` the layer stops drawing one
   mark per record and draws one per BLOCK, sized by how many it holds — the
   same data, aggregated, which is what a reader can actually read at that
   scale. Zoom in far enough that fewer blocks are on screen and it is dots
   again, because then they are aimable.

   THE THRESHOLD IS AUTHORED, NOT MEASURED. It is a judgement about when
   overlap defeats a reader, it wants a visual pass at several zooms, and
   `?carpet=N` moves it so that pass does not need a rebuild.

   ── THE TIME WINDOW IS A DECADE, AND THAT IS NOT A PREFERENCE ────────────
   Marks per subject in a median single YEAR, over the published file:

     Homelessness 0 · Landmarks 2 · Libraries 3 · Fire 4 · Housing 9 ·
     Schools 10 · What's being built 24

   Half the subjects show an EMPTY CITY on a single year. The same subjects
   over a median decade: 20 · 67 · 39 · 39 · 281 · 136 · 234. So the scrub
   names a year and the layer lights the window around it; `WINDOW_YEARS` is
   that width and it is why the map has anything on it at all.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { ST_KPROJ } from "@/lib/city/streets";

import type { CityLayer } from "../engine";

/** The published `theme-marks.json`, as parallel arrays. */
export interface ThemeMarksFile {
  readonly meta?: { readonly n_marks?: number; readonly years?: readonly number[] };
  readonly sources: readonly {
    readonly i: number;
    readonly id: string;
    readonly label: string;
    readonly open: string;
    readonly n: number;
    readonly keys?: readonly string[];
  }[];
  /** source index */
  readonly s: readonly number[];
  /** assessor block index, -1 where the source has none */
  readonly b: readonly number[];
  /** the record, addressed the way its source addresses records */
  readonly r: readonly number[];
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly yr: readonly number[];
  /** subject bitmask */
  readonly m: readonly number[];
}

export interface ThemeMarksOptions {
  /** ground height at a plane point, in metres */
  elevAt(wx: number, wy: number): number;
  /** the vertical exaggeration in force */
  zex: number;
  /** one colour per subject bit, as CSS strings */
  colours: readonly string[];
  /** how many subject bits exist */
  bits: number;
  /** override the carpet threshold — `?carpet=N` */
  carpetBlocks?: number;
  /** override the window width — `?win=N` */
  windowYears?: number;
  /** override the dot shape — `?mark=tack|bead|disc|ring|bar|cone` */
  shape?: MarkShape;
}

/* ── THE INK, AND WHY ONLY ONE SUBJECT IS EVER LIT ────────────────────────
   Eight hues off the reference categorical ramps, stepped DARK because the
   ground they sit on is the city's own cream (#f0e8cc at the terrain's light
   end) and the published mid-tones do not hold against it: orange, aqua,
   yellow and pink all came in under 3:1.

   Validated with the data-viz palette validator against that surface —
   lightness band, chroma floor, adjacent-pair CVD separation, normal-vision
   floor and contrast all PASS: worst adjacent CVD ΔE 8.8 (deutan), worst
   adjacent normal-vision ΔE 16.5, all eight ≥ 3:1 on the ground.

   THE ORDER IS NOT DECORATIVE. It is the one ordering out of the 5,761
   searched that clears every adjacent pair; the hues themselves fail in most
   arrangements. Reordering these to match a new subject order silently breaks
   the legend's separation, so re-run the validator if the seed's order changes.

   AND ONLY ONE SUBJECT IS DRAWN AT A TIME. Marks of different subjects land on
   top of each other all over the city, so the honest test is all-pairs rather
   than adjacent — and under all-pairs no ordering of eight can pass: the worst
   pair falls to ΔE 3.2 (deutan) and 7.1 for normal vision. A reader asked to
   tell eight scattered colours apart would be asked something the colours
   cannot do. So the filter is single-select, the one lit subject is named by
   the control that lit it, and colour never has to carry a comparison.
   Showing several at once needs shape as well as hue, and is not shipped. */
export const THEME_INK = [
  "#b8431c", // orange
  "#0f7a53", // aqua
  "#1d5fae", // blue
  "#8a6000", // yellow
  "#b04a72", // magenta
  "#0a7a25", // green
  "#4b3ca8", // violet
  "#b32f2f", // red
] as const;

/* ── the two constants a reader can see the effect of ──────────────────── */

/** above this many lit blocks a subject is drawn as density, not as dots */
export const CARPET_BLOCKS = 600;

/** the scrub names a year; the layer lights this many years around it */
export const WINDOW_YEARS = 10;

/**
 * How big a mark is ON SCREEN, in pixels, at every camera.
 *
 * A record has no size in the world — it is not a building — so the only
 * honest size for it is the one that keeps it legible. 14 px is a mark you
 * can see across the whole city and aim at from a street.
 */
const MARK_PX = 14;

/**
 * How far above the ground the mark's base sits, in the same screen pixels.
 *
 * SMALL, BECAUSE THE MARK IS PLANTED AND NOT HOVERING. This was 22 and it was
 * being multiplied by a value that was already metres-per-14-pixels, so the
 * real lift was 308 px — a sheet of marks hanging a third of a screen over the
 * city, which at a tilted camera reads as a swarm out over the bay. Now the
 * unit is honest, 3 px is the shadow gap that keeps a mark off the texture it
 * stands on, and the stem is what gives it height.
 */
const LIFT_PX = 3;

/* the unit geometries: one mark one metre tall, one puck of radius one, both
   scaled per instance to whatever `MARK_PX` works out to at this camera */
const PIN_M = 1;
const PUCK_R = 0.7;

/* ── THE SHAPE, AND WHY IT IS NOT A CONE ──────────────────────────────────
   The dot was a six-sided cone standing on the ground. On this map that is a
   TREE: the city draws 195,310 of them as green cones, and a subject rendered
   in the palette's green landed 1,441 more among them, indistinguishable. A
   mark has to read as something a person put there.

   All six were rendered over Haight Ashbury at district zoom and looked at.
   THE HOLE IN THE MIDDLE IS WHAT DECIDES IT. Every solid shape in the palette's
   green — cone, bead, tack head, disc — reads as another tree, because the eye
   is matching a filled blob of foliage colour against a ground already full of
   them. A ring is not a shape the city has any of, so it reads as a symbol
   somebody placed. It also survives crowding better than anything solid: two
   overlapping rings are still two, where two overlapping discs are one bigger
   blob. And a bar is worse than any of them — a green column at building scale
   reads as a building.

     ring   a hollow circle lying flat                     (default)
     tack   stem + round head — a pin pushed in
     bead   the head alone, sitting on the ground
     disc   a coin lying flat
     bar    a column
     cone   what it used to be, for comparison

   Kept switchable with `?mark=` because this is a judgement at a particular
   zoom over a particular ground, and the next ground may decide differently.
*/
export type MarkShape = "ring" | "tack" | "bead" | "disc" | "bar" | "cone";
export const MARK_SHAPES: readonly MarkShape[] =
  ["ring", "tack", "bead", "disc", "bar", "cone"] as const;
export const DEFAULT_SHAPE: MarkShape = "ring";

/* a density puck starts at half a dot and grows by at most this much, so the
   busiest block is 2.4x the quietest rather than 10x — see the density branch */
const DENSITY_BASE = 0.5;
const DENSITY_MAX = 2.4;
/* translucent, so overlapping pucks read as accumulation */
const DENSITY_ALPHA = 0.55;

const M4 = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();

/**
 * The unit geometry for one shape: one metre tall, standing on y = 0, so a
 * single scale puts it at `MARK_PX` on screen wherever the camera is.
 *
 * Every one of these is built once per layer and shared by all eight subject
 * meshes — the instance matrix carries position and size, the material carries
 * colour, and the geometry is the same object in all of them.
 */
function markGeometry(shape: MarkShape): BufferGeometry {
  switch (shape) {
    case "tack": {
      /* stem from the ground to 0.62, head centred at 0.72. The head is a
         SPHERE and not a disc because the camera tilts: a disc facing up
         vanishes to a line at a low angle, which is exactly the camera a
         reader uses to look along a street. */
      const stem = new CylinderGeometry(0.055, 0.055, 0.62, 6);
      stem.translate(0, 0.31, 0);
      const head = new SphereGeometry(0.3, 10, 7);
      head.translate(0, 0.72, 0);
      return mergeGeometries([stem, head], false) ?? stem;
    }
    case "bead": {
      const g = new SphereGeometry(0.36, 12, 8);
      g.translate(0, 0.36, 0);
      return g;
    }
    case "disc": {
      const g = new CylinderGeometry(PUCK_R, PUCK_R, 0.12, 14);
      g.translate(0, 0.06, 0);
      return g;
    }
    case "ring": {
      /* lying flat: a torus is born in the xy plane and the ground is xz */
      const g = new TorusGeometry(0.52, 0.15, 6, 16);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.15, 0);
      return g;
    }
    case "bar": {
      const g = new BoxGeometry(0.34, PIN_M, 0.34);
      g.translate(0, PIN_M / 2, 0);
      return g;
    }
    case "cone":
    default: {
      const g = new ConeGeometry(PIN_M * 0.32, PIN_M, 6);
      g.translate(0, PIN_M / 2, 0);
      return g;
    }
  }
}

/**
 * Which marks a filter admits.
 *
 * `bits` is a mask of the subjects that are ON — 0 means "no subject
 * selected", which is the DEFAULT VIEW and draws nothing. That is deliberate
 * and it is the coverage rule in `themes.json` made visual: the subjects cover
 * a fifth of the record, so a map that opened with them on would be showing a
 * fifth of the city and implying it was all of it. All decisions is the
 * default; these light up on top of it.
 */
export interface MarkFilter {
  bits: number;
  /** the centre of the window; undefined is every year */
  year?: number;
  /** window width, defaults to `WINDOW_YEARS` */
  window?: number;
}

export interface ThemeMarksLayer extends CityLayer {
  readonly meshes: readonly InstancedMesh[];
  /** apply a filter; returns how many marks are lit */
  setFilter(f: MarkFilter): number;
  /** per subject bit: how many marks and blocks are lit, and the mode used */
  readonly state: readonly {
    bit: number;
    marks: number;
    blocks: number;
    mode: "dots" | "density";
  }[];
}

export function themeMarksLayer(
  file: ThemeMarksFile | null,
  o: ThemeMarksOptions,
): ThemeMarksLayer | null {
  if (!file || !file.m || file.m.length === 0) return null;
  /* bound once so the closures below are not each re-proving it is non-null */
  const f = file;
  const n = f.m.length;
  const carpet = o.carpetBlocks ?? CARPET_BLOCKS;

  /* ── one mesh per subject ──────────────────────────────────────────────
     Not one mesh for everything with a colour attribute: a subject has to be
     switchable in a single assignment (`visible`, `count`) and has to be
     drawable in two different shapes. Eight draw calls is not a cost worth
     optimising away — the whole point of the layer is that the count of
     MARKS, not of subjects, is what used to be expensive. */
  const pin = markGeometry(o.shape ?? DEFAULT_SHAPE);
  const puck = new CylinderGeometry(PUCK_R, PUCK_R, PUCK_R * 0.25, 12);

  /* per-subject index lists, built once. Filtering never walks all n again. */
  const byBit: number[][] = [];
  for (let bit = 0; bit < o.bits; bit++) byBit.push([]);
  for (let i = 0; i < n; i++) {
    const m = f.m[i];
    for (let bit = 0; bit < o.bits; bit++) {
      /* `m` runs past 32 bits at the fiche's grain and JavaScript's bitwise
         operators coerce to int32, so this divides rather than shifts. */
      if (Math.floor(m / 2 ** bit) % 2 === 1) byBit[bit].push(i);
    }
  }

  const meshes: InstancedMesh[] = [];
  const mats: MeshLambertMaterial[] = [];
  for (let bit = 0; bit < o.bits; bit++) {
    const col = new Color(o.colours[bit] ?? "#c8483c");
    const mat = new MeshLambertMaterial({ color: col });
    /* the cap is the subject's own total: a filter can never light more */
    const mesh = new InstancedMesh(pin, mat, Math.max(1, byBit[bit].length));
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.name = `theme-mark-${bit}`;
    mats.push(mat);
    meshes.push(mesh);
  }

  const state = meshes.map((_, bit) => ({
    bit,
    marks: 0,
    blocks: 0,
    mode: "dots" as "dots" | "density",
  }));

  let cur: MarkFilter = { bits: 0 };
  /* METRES PER SCREEN PIXEL at the current camera. Starts at the whole-city
     camera so the first paint is not invisible if no frame has arrived yet.

     THIS USED TO BE `MARK_PX / (ST_KPROJ * scale)` — metres per FOURTEEN
     pixels — and both the size and the lift were multiplied by it. The size
     was right by luck, because a unit-tall pin times "metres per 14 px" is 14
     px. The lift was not: `LIFT_PX * k_m` asked for 22 × 14 = 308 pixels of
     air, so every mark floated a third of the screen above the city, in a
     flat sheet that reads at a tilted camera as a swarm hanging over the bay.
     The marks were never mislocated — all 16,468 sit exactly on their own
     block's point — they were lofted. One value, one unit, both derived. */
  let mPerPx = 1 / (ST_KPROJ * 0.1);
  /* the placed marks per subject, kept so a camera move can re-size them
     without re-running the filter */
  const drawn: { x: number; y: number; s: number }[][] =
    meshes.map(() => []);

  const place = (mesh: InstancedMesh, k: number, wx: number, wy: number,
                 rel: number): void => {
    /* A MARK IS A CONSTANT SIZE ON SCREEN, NOT IN THE WORLD, and the first
       version of this was not — 26 m pins in a city 12 km across, which is
       under three pixels at the whole-city camera. The filter worked, the
       counts were right, and the map looked empty. A record is not a building:
       it has no size of its own, so the only size it can honestly have is the
       one that makes it legible. */
    const s = rel * MARK_PX * mPerPx;
    /* THE PIN FLOATS ABOVE THE ROOFS. On the ground it is drawn behind
       whatever stands on the block, which matters at a close camera where a
       building is tall on screen.

       WHAT THIS DID NOT FIX, recorded because the measurement was made and the
       hypothesis was wrong. Three subjects at the whole-city camera changed
       358, 157 and 29 pixels per mark (Homelessness, Libraries, Fire), and
       occlusion looked like the reason Fire was thin. Lifting the pins moved it
       to 30.2 — nothing. The real cause is that Fire lights 893 blocks, over
       CARPET_BLOCKS, so it draws as DENSITY: half-size translucent pucks, by
       design. Homelessness lights 257 and draws as full pins. The layer was
       behaving correctly and the number was measuring the mode, not a defect.

       The lift stays because it is right at a close camera, not because it
       rescued that number. */
    P.set(wx, o.elevAt(wx, wy) * o.zex + LIFT_PX * mPerPx, wy);
    S.set(s, s, s);
    M4.compose(P, Q, S);
    mesh.setMatrixAt(k, M4);
  };

  /** re-place what is already chosen, at the current camera */
  function resize(): void {
    for (let bit = 0; bit < o.bits; bit++) {
      const list = drawn[bit];
      const mesh = meshes[bit];
      if (!mesh.visible || list.length === 0) continue;
      for (let k = 0; k < list.length; k++) {
        place(mesh, k, list[k].x, list[k].y, list[k].s);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function rebuild(bit: number): void {
    const mesh = meshes[bit];
    const on = (cur.bits && Math.floor(cur.bits / 2 ** bit) % 2 === 1) || false;
    const st = state[bit];
    drawn[bit].length = 0;
    if (!on) {
      mesh.visible = false;
      mesh.count = 0;
      st.marks = 0;
      st.blocks = 0;
      return;
    }
    const half = (cur.window ?? o.windowYears ?? WINDOW_YEARS) / 2;
    const lo = cur.year === undefined ? -Infinity : cur.year - half;
    const hi = cur.year === undefined ? Infinity : cur.year + half;

    /* pass one: which marks are in the window, and how many blocks they touch */
    const hit: number[] = [];
    const perBlock = new Map<number, number>();
    for (const i of byBit[bit]) {
      const yr = f.yr[i];
      if (yr < lo || yr > hi) continue;
      hit.push(i);
      /* a source with no assessor block keys on its coordinate instead, so a
         place still aggregates with itself and never with a block */
      const key = f.b[i] >= 0 ? f.b[i] : -1 - f.r[i];
      perBlock.set(key, (perBlock.get(key) ?? 0) + 1);
    }
    st.marks = hit.length;
    st.blocks = perBlock.size;
    st.mode = perBlock.size > carpet ? "density" : "dots";

    if (hit.length === 0) {
      mesh.visible = false;
      mesh.count = 0;
      return;
    }

    if (st.mode === "dots") {
      if (mesh.geometry !== pin) mesh.geometry = pin;
      mats[bit].transparent = false;
      mats[bit].opacity = 1;
      mats[bit].depthWrite = true;
      let k = 0;
      for (const i of hit) {
        drawn[bit].push({ x: f.x[i], y: f.y[i], s: 1 });
        place(mesh, k++, f.x[i], f.y[i], 1);
      }
      mesh.count = k;
    } else {
      /* DENSITY. One puck a block, its radius growing with the square root of
         the count — area, not radius, is what a reader compares, so a block
         with four times as many records reads as four times the ink rather
         than sixteen. */
      if (mesh.geometry !== puck) mesh.geometry = puck;
      /* and it is translucent in this mode only: two pucks over one another
         have to read as two, which an opaque fill cannot do */
      mats[bit].transparent = true;
      mats[bit].opacity = DENSITY_ALPHA;
      mats[bit].depthWrite = false;
      const at = new Map<number, { x: number; y: number; n: number }>();
      for (const i of hit) {
        const key = f.b[i] >= 0 ? f.b[i] : -1 - f.r[i];
        const e = at.get(key);
        if (e) e.n++;
        else at.set(key, { x: f.x[i], y: f.y[i], n: 1 });
      }
      /* THE PUCK IS SMALLER THAN A DOT, AND ITS GROWTH IS CAPPED. Written
         first as `sqrt(n)` off the same base size as a pin, 2,171 lit blocks
         came out as one solid magenta mass over half the peninsula — pucks of
         70 to 140 px, touching everywhere. Density has to read as MORE HERE
         THAN THERE, and it cannot do that once neighbours merge into a field.
         So: half the base size, and the range from the quietest block to the
         busiest spans a factor of 2.4 rather than the raw square root. */
      let k = 0;
      for (const e of at.values()) {
        if (k >= mesh.instanceMatrix.count) break;
        const rel = DENSITY_BASE * Math.min(DENSITY_MAX, Math.sqrt(e.n));
        drawn[bit].push({ x: e.x, y: e.y, s: rel });
        place(mesh, k++, e.x, e.y, rel);
      }
      mesh.count = k;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = true;
  }

  function apply(f: MarkFilter): number {
    cur = f;
    let total = 0;
    for (let bit = 0; bit < o.bits; bit++) {
      rebuild(bit);
      total += state[bit].marks;
    }
    return total;
  }

  return {
    name: "theme-marks",
    meshes,
    state,
    setFilter: apply,
    onYear(year: number | undefined) {
      if (cur.bits) apply({ ...cur, year });
    },
    onFrame(cam: { scale: number }) {
      /* RE-SIZED ON A CAMERA MOVE, BUT NOT EVERY FRAME. A pan is thousands of
         frames at one scale and re-writing 16,000 matrices through each of
         them would put the layer back on the CPU budget it exists to avoid.
         5 % is under a pixel of drift on a 14 px mark, so nothing visibly
         lags behind the zoom. */
      const want = 1 / (ST_KPROJ * Math.max(cam.scale, 1e-6));
      if (Math.abs(want - mPerPx) < mPerPx * 0.05) return;
      mPerPx = want;
      resize();
    },
    dispose() {
      for (const m of meshes) m.dispose();
      for (const m of mats) m.dispose();
      pin.dispose();
      puck.dispose();
    },
  };
}
