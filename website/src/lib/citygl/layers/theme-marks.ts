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
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
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

/* ── THE INK, AND THE CHECK THE FIRST SET WAS NEVER PUT THROUGH ───────────
   The first eight were validated against ONE surface — a flat cream, the
   terrain's light end — and passed every check on it. The map is not one
   surface. It is a painted city with parks, 195,310 street trees, tile roofs,
   asphalt and bare hill in it, and a mark has to be seen against all of that.

   SO THE GROUND WAS MEASURED INSTEAD OF ASSUMED. 1,161,000 pixels of the
   rendered city with no subject lit, at three cameras (whole city, district, a
   few streets), and for each ink the share of that ground lying within OKLab
   ΔE 10 of it — the distance at which a mark stops being a mark and becomes
   part of the picture:

     yellow  #8a6000   13.26 %      aqua    #0f7a53    5.04 %
     green   #0a7a25    3.38 %      orange  #b8431c    0.43 %
     red     #b32f2f    0.32 %      magenta #b04a72    0.19 %
     violet  #4b3ca8    0.09 %      blue    #1d5fae    0.05 %

   A seventh of the city was within ΔE 10 of the yellow. The two greens were
   the ones anybody could see were wrong; the yellow was worse than both and
   nobody had noticed, which is the argument for measuring rather than looking.

   The city's own colour is why: clustered in OKLab it is almost entirely
   warm-neutral — creams, olive-greys, asphalt — with hue between about 60°
   and 140°. Candidates were generated across OKLCh, and every colour in that
   band failed the collision test. What survives is red-orange, cyan-teal and
   blue-violet-magenta, and these eight are the set out of 5,317 survivors with
   the widest ALL-PAIRS separation.

   MEASURED AGAINST THE OLD SET:

     worst city collision   13.26 %  ->  0.37 %
     all-pairs min ΔE          4.6  ->  13.8   (orange and red were near-twins)
     adjacent CVD ΔE           8.8  ->  13.3

   THE ORDER IS NOT DECORATIVE. The validator checks ADJACENT pairs, so the
   order is part of what passed; reordering to match a new subject order
   silently breaks it. Re-run the validator if the seed's order changes:

     node scripts/validate_palette.js "<the eight, comma separated>" --mode light

   AND ONLY ONE SUBJECT IS DRAWN AT A TIME. That stays true and it is still the
   reason the filter is single-select — but it is no longer a confession. The
   old set could not pass all-pairs at all; this one holds ΔE 13.8 across every
   pair, so the legend is honestly readable even though the map never asks a
   reader to compare two subjects at once. */
export const THEME_INK = [
  "#a80391", // magenta
  "#e15f0a", // orange
  "#6029c6", // violet
  "#04a322", // green
  "#058dfa", // blue
  "#d60b49", // crimson
  "#006b9a", // deep cyan
  "#00a19d", // teal
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

/* ── THE SHAPE, AND WHY IT IS NOT AN OBJECT ───────────────────────────────
   Three tries, and the lesson is the same each time: ANY SOLID BODY STANDING
   ON THIS CITY IS READ AS PART OF THE CITY.

   The first was a six-sided cone. The city draws 195,310 street trees as green
   cones, so a subject in the palette's green landed 1,441 more among them and
   nobody could tell which was which. A bar is worse — a column at building
   scale reads as a building. A ring escaped both, because a hollow circle is
   not a shape the city has any of, but it escaped by being a piece of jewellery
   lying on the roofs: it announces itself as an object placed ON a picture
   rather than as a fact ABOUT the picture, and it looks it.

   So the mark stops being an object. Both shipping modes are FLAT AND ON THE
   GROUND — a textured plane lying in the terrain, soft at the edge, with the
   city's own light and buildings in front of it:

     dot    a small soft disc, hard enough in the middle to aim at   (default)
     glow   a wide soft field, one per block, its size and its
            strength carrying how many records that block holds
            — this is the density map, and it is what the layer
            switches to on its own once a subject lights more
            than CARPET_BLOCKS blocks

   The solids are kept behind `?mark=` and nothing selects them by default.
   They are how the above was arrived at, and the next city's ground may
   decide differently:

     ring   a hollow circle lying flat
     tack   stem + round head — a pin pushed in
     bead   the head alone, sitting on the ground
     disc   a hard-edged coin
     bar    a column
     cone   what it used to be
*/
export type MarkShape =
  | "dot" | "glow" | "ring" | "tack" | "bead" | "disc" | "bar" | "cone";
export const MARK_SHAPES: readonly MarkShape[] =
  ["dot", "glow", "ring", "tack", "bead", "disc", "bar", "cone"] as const;
export const DEFAULT_SHAPE: MarkShape = "dot";

/** the flat shapes: drawn lying in the ground, not standing on it */
const FLAT: ReadonlySet<MarkShape> = new Set<MarkShape>(["dot", "glow"]);

/**
 * A soft round brush, drawn once into a canvas and shared by every mesh.
 *
 * `stop` is where the solid core ends and the fade begins: 0.55 gives a disc
 * you can aim at with a soft rim, 0 gives a field with no edge at all. White,
 * because the colour rides on the material and one texture then serves all
 * eight subjects.
 *
 * Returns null off the browser — the layer is constructed in tests, where
 * there is no canvas, and it falls back to the hard-edged coin there.
 */
function brush(stop: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  if (stop > 0) grad.addColorStop(stop, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** how opaque a flat mark is: enough to read, not enough to hide the city */
const DOT_ALPHA = 0.95;
const GLOW_ALPHA = 0.28;

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
    case "dot":
    case "glow": {
      /* LYING IN THE GROUND, NOT STANDING ON IT. A plane is born in xy and
         the ground is xz, so it is laid down; the texture carries the circle
         and its fade, and the extent is generous because a soft brush spends
         most of its radius on the fade. */
      const g = new PlaneGeometry(shape === "glow" ? 2.2 : 1.25,
                                  shape === "glow" ? 2.2 : 1.25);
      g.rotateX(-Math.PI / 2);
      return g;
    }
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
  const shape = o.shape ?? DEFAULT_SHAPE;
  const pin = markGeometry(shape);
  /* THE DENSITY SHAPE FOLLOWS THE DOT SHAPE. A flat dot's crowd is a flat
     field; a solid dot's crowd stays the old translucent coin, because a
     solid body and a soft brush do not belong in the same picture. */
  const flat = FLAT.has(shape);
  const puck = flat
    ? markGeometry("glow")
    : new CylinderGeometry(PUCK_R, PUCK_R, PUCK_R * 0.25, 12);
  /* one texture per edge-hardness, shared by all eight subjects */
  const texDot = flat ? brush(shape === "glow" ? 0 : 0.72) : null;
  const texGlow = flat ? brush(0) : null;

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
  const mats: (MeshLambertMaterial | MeshBasicMaterial)[] = [];
  for (let bit = 0; bit < o.bits; bit++) {
    const col = new Color(o.colours[bit] ?? "#c8483c");
    /* A WASH IS UNLIT, A BODY IS LIT. The flat marks are a mark ON the
       drawing and take the ground's own light through the texture's alpha;
       giving them a Lambert material would hillshade a stain. The solids
       still want lighting or they read as cut-out paper. `depthWrite` is off
       on the flat ones so two of them overlap instead of z-fighting. */
    const mat = flat
      ? new MeshBasicMaterial({
          color: col,
          map: texDot,
          transparent: true,
          opacity: DOT_ALPHA,
          depthWrite: false,
          /* FORWARD, NOT AWAY. A plane lying in the terrain is coplanar with
             it, and `block-tint.ts` records the trap in its own words: a
             positive offset pushes a polygon away and the depth test throws
             every fragment out. An overlay on a coplanar surface comes toward
             the camera. The 3 px lift cannot do this job — making a lift big
             enough is how the marks ended up in the sky in the first place. */
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
          /* ── DoubleSide, AND IT IS NOT BELT AND BRACES ───────────────
             The first flat build drew NOTHING: 217 instances, visible, in the
             scene, matrices right, and no pixels. It was not depth and it was
             not the material — `depthTest:false` and a Lambert each changed
             nothing, which is what ruled them out. A plane is born facing +Z
             and is laid down with `rotateX`, and the face that ends up
             pointing at the sky is the BACK one, which `FrontSide` discards.
             Two triangles is not a budget worth defending. */
          side: DoubleSide,
        })
      : new MeshLambertMaterial({ color: col });
    /* the cap is the subject's own total: a filter can never light more */
    const mesh = new InstancedMesh(pin, mat, Math.max(1, byBit[bit].length));
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    /* over the ground wash (0.5) and the streets (1, 2): the marks are the
       last thing said about a block, so they are drawn last over it */
    if (flat) mesh.renderOrder = 6;
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
      if (flat) {
        const m = mats[bit] as MeshBasicMaterial;
        if (m.map !== texDot) { m.map = texDot; m.needsUpdate = true; }
        m.opacity = DOT_ALPHA;
      } else {
        mats[bit].transparent = false;
        mats[bit].opacity = 1;
        mats[bit].depthWrite = true;
      }
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
      if (flat) {
        /* THE FIELD, NOT A CROWD OF DISCS. The same brush with no solid core
           at all, wide and weak, so that what a reader sees where blocks
           cluster is one continuous stain that is darker in the middle —
           which is the thing density actually is. */
        const m = mats[bit] as MeshBasicMaterial;
        if (m.map !== texGlow) { m.map = texGlow; m.needsUpdate = true; }
        m.opacity = GLOW_ALPHA;
      } else {
        /* translucent in this mode only: two pucks over one another have to
           read as two, which an opaque fill cannot do */
        mats[bit].transparent = true;
        mats[bit].opacity = DENSITY_ALPHA;
        mats[bit].depthWrite = false;
      }
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
      texDot?.dispose();
      texGlow?.dispose();
    },
  };
}
