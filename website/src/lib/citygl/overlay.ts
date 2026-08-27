/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/overlay.ts — THE WRITING, AND WHY IT IS NOT ON THE GPU.

   Everything a reader READS — the neighbourhood capitals, the street names,
   the designated landmarks — plus the one-pixel ink that bounds the coast.

   ── TYPE IS THE ONE THING A GPU IS WORSE AT ──────────────────────────────
   A GPU draws text from an atlas: a picture of a glyph, sampled. At the sizes
   this map uses that is a soft, slightly wrong letterform, and it fights the
   hinting the rest of the page's type gets for free. A 2D canvas draws the
   SAME text the browser draws everywhere else, at the device's own pixel
   grid, with the platform's hinting and its subpixel positioning.

   So the division is: the GPU draws the world, a 2D canvas over it draws the
   writing. Two elements, one stacking context, no compositing tricks.

   ── AND IT IS THE CANVAS RENDERER'S OWN LABEL PASS, UNCHANGED ────────────
   `lib/city/labels.ts` — `LabelGrid`, `placeNames`, `StreetNamePass` — is
   handed a `Frame` and does not care who drew the ground. Given the same
   camera it makes the same decisions: the same ink budget, the same
   collision grid, the same order (designated landmarks, then the spine
   streets, then the rest). A name is in the same place on both pages, which
   is what makes a parity pair readable.

   ── THE COST ─────────────────────────────────────────────────────────────
   Text is cheap and there is not much of it: a few dozen strings a frame.
   What is NOT here, deliberately, is the street SURFACE and the centrelines
   — 4,895 published features that would cost several milliseconds of CPU per
   frame and undo the whole point. Those are geometry and belong on the GPU.
   ═══════════════════════════════════════════════════════════════════════ */

import { LEDGER_W, NARROW_W, ZSTEPS, bandOf } from "@/lib/city/camera";
import { snapCameraToPixels, type PlaneCamera } from "./camera";
import type { CityData } from "@/lib/city/data";
import { projection, type ViewCamera } from "@/lib/city/projection";
import {
  LabelGrid,
  StreetNamePass,
  buildHoodAnchors,
  drawHoodNames,
  placeNames,
  type PlaceLabel,
} from "@/lib/city/labels";
import { paintGrain, type Frame, type TerrainField } from "@/lib/city/terrain";
import { decodeCoast, drawShoreline, type Ring } from "@/lib/city/water";

export interface OverlayOptions {
  data: CityData;
  /** the ground, for the elevation every label is lifted onto */
  field: TerrainField;
  /** where this city's sidecar files live */
  dataBaseUrl: string;
}

interface MarksFile {
  n: number;
  t: string[];
  x: string;
  y: string;
  s: string;
  yr: string;
  yt?: string;
  d: string;
  k?: string;
  KIND?: string[];
}

/**
 * `base/<city>/hood-rings.json` — THE DIVISIONS, AS THEIR OWN BLOCKS DRAW THEM.
 *
 * Per division, the union of its own assessor blocks' published rings, closed
 * across the street right of way and simplified. Not the published division
 * outline: that runs down the middle of the street, and the blocks are what a
 * reader can click — so the union is the region that would actually answer
 * with this division.
 *
 * MEASURED on the shipped file: **41 divisions, 43 parts, 1,647 vertices**,
 * which is why the selected one can be reprojected on every frame rather than
 * cached against the camera. (`CityMap.tsx` still says 111 parts and 3,417
 * vertices — that was true of an earlier build of the file and is not true of
 * the one on disk.)
 *
 * The third number on every vertex is not padding: it is the ground elevation
 * of the nearest of those blocks, so the ring lies ON the city rather than at
 * sea level under a hill.
 */
interface HoodRingsFile {
  names: string[];
  /** per division, per part, flat [x, y, z, ...] in world metres */
  parts: number[][][];
  labels: number[][];
}

/**
 * WHAT THE PIN USED TO SAY, AND WHY IT NO LONGER SAYS IT.
 *
 * It wrote `base/blocks-id.json` — the assessor's own filing number for the
 * block, `3538` — in a mono badge beside the ring, and that is the one thing
 * on this map nobody has ever used to say where they are.
 *
 * > "i dont want block nulber to show anywhere its not relevant to me"
 *
 * The number is how this pipeline addresses a piece of ground and it stays
 * exactly where it belongs: in the index, in the shard filenames, in the join
 * that `block-records.ts` §assertJoin still checks element for element. It is
 * off the screen. What goes on the badge instead is handed in from outside as
 * `pickLabel`, because the only place that knows how to name a piece of ground
 * in words is the place that has already fetched its record.
 *
 * The sidecar fetch went with it. It had exactly one reader.
 */

function b64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * `marks.json` → the label list.
 *
 * The same decode `CityMap.tsx` does, written out here rather than imported
 * so the GL page does not pull the Canvas renderer in behind one function.
 * The FILE is the contract between them, and it is published.
 */
function decodeMarks(m: MarksFile): PlaceLabel[] {
  const x = new Int32Array(b64(m.x));
  const y = new Int32Array(b64(m.y));
  const s = new Uint16Array(b64(m.s));
  const yr = new Uint16Array(b64(m.yr));
  const yt = m.yt ? new Uint16Array(b64(m.yt)) : null;
  const d = new Uint8Array(b64(m.d));
  const kind = m.k ? new Uint8Array(b64(m.k)) : null;
  const KIND = m.KIND ?? [];
  const out: PlaceLabel[] = [];
  for (let k = 0; k < m.n; k++) {
    out.push({
      name: m.t[k],
      wx: x[k] * 0.1,
      wy: y[k] * 0.1,
      spanM: s[k],
      cls: (d[k] & 1) !== 0 ? "designated" : "named",
      ...(yr[k] ? { year: yr[k] } : {}),
      ...(yt && yt[k] ? { until: yt[k] } : {}),
      ...(kind && kind[k] ? { kind: KIND[kind[k] - 1] } : {}),
    } as PlaceLabel);
  }
  return out;
}

/**
 * THE NEIGHBOURHOOD CAPITALS' ANCHORS.
 *
 * `base/blocks` carries a hood byte per assessor block and the manifest
 * carries the names; the anchor for a name is the AREA-WEIGHTED CENTROID of
 * the blocks that carry it, so twenty-two small downtown blocks do not
 * out-vote four large ones. `buildHoodAnchors` does that arithmetic — this
 * only has to hand it four columns, and the block ring's own quantiser is the
 * one thing here that is easy to get wrong: `sc` is a power-of-two EXPONENT
 * and the deltas are tenths of that unit, so a vertex is
 * `ox + vx * 2^sc / 10`. Read as `1 / (1 << sc)` the rings come out hundreds
 * of times too large. (`scene.ts` §decodeBlocks paid for that one already.)
 */
function hoodColumns(data: CityData): {
  hood: Uint8Array;
  hoodNames: readonly string[];
  cx: Float32Array;
  cy: Float32Array;
  area: Float32Array;
} | null {
  const chunk = data.get("base/blocks");
  const entry = data.manifest.chunks.find((c) => c.k === "base/blocks") as
    | { hoodNames?: string[] }
    | undefined;
  if (!chunk || !entry?.hoodNames?.length) return null;
  const f = chunk.fields;
  const cnt = f.cnt as Uint16Array;
  const sc = f.sc as Uint8Array;
  const ox = f.ox as Float32Array;
  const oy = f.oy as Float32Array;
  const dvx = f.vx as Int16Array;
  const dvy = f.vy as Int16Array;
  const n = cnt.length;
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const m = cnt[i];
    const q = (1 << sc[i]) / 10;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < m; k++) {
      sx += ox[i] + dvx[o + k] * q;
      sy += oy[i] + dvy[o + k] * q;
    }
    cx[i] = m ? sx / m : ox[i];
    cy[i] = m ? sy / m : oy[i];
    o += m;
  }
  return {
    hood: f.hood as Uint8Array,
    hoodNames: entry.hoodNames,
    cx,
    cy,
    area: f.a as Float32Array,
  };
}

export class CityOverlay {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private places: PlaceLabel[] = [];
  private hoods: ReturnType<typeof buildHoodAnchors> | null = null;
  private coast: Ring[] | null = null;
  /** the published coast of the land that is NOT the subject — see §SURRINK */
  private surroundRings: readonly (readonly (readonly [number, number])[])[] | null = null;
  /** the ring of the block a reader has picked, world metres */
  highlight: readonly (readonly [number, number])[] | null = null;
  /**
   * THE INDEX of that block in the `base/blocks` chunk, or null.
   *
   * `highlight` is a shape and answers "where"; this answers "which", and two
   * of the published page's chrome passes need the second question answered:
   * the pin writes the block's own id, and the scrim needs the DIVISION the
   * block belongs to. Both of those are columns joined by array position, so a
   * ring cannot stand in for an index.
   */
  pick: number | null = null;
  /**
   * THE YEAR THE FRAME IS SET TO, or undefined for the settled city.
   *
   * `labels.ts` gates on this in two places and neither can fire without it:
   * `placeNames` holds a name whose register dates it after `f.year` and drops
   * one whose `until` has passed (§NOYEAR), and `StreetNamePass` holds a
   * stretch the Board had not accepted yet. The Canvas renderer puts the same
   * number on its own `Frame` — `renderer.ts` §render — so a reader dragging
   * that page's rail to 1906 stops being told about a 1970 landmark.
   *
   * This page has the same rail and the writing on it was never clocked: every
   * name at every year. `undefined` is the settled city and is what both pages
   * sit at until a reader touches the rail, which is why the two agree at rest
   * and only diverge while it is being dragged.
   */
  year: number | undefined = undefined;
  /** the published divisions, once the sidecar lands — see §SCRIM */
  private hoodRings: HoodRingsFile | null = null;
  /**
   * WHAT TO WRITE BESIDE THE RING, in words a person uses.
   *
   * Set by whoever owns the pick — `CityGLMap` writes the neighbourhood the
   * moment the click lands, because that is known synchronously off the block
   * columns, and upgrades it to the streets the block fronts once the record
   * arrives. Null draws the ring alone, which is still a true answer to
   * "which one answered" and is what a block fronting no street gets.
   */
  pickLabel: string | null = null;
  /** `base/blocks`' own columns, decoded once — see `hoodColumns` */
  private cols: ReturnType<typeof hoodColumns> = null;
  private colsRead = false;
  private W = 0;
  private H = 0;
  private dpr = 1;
  /* the type's own sheet — see §THE TYPE IS PLACED ON A SHEET, NOT ON THE
     FRAME. Null until the first frame that needs it, and dropped on resize. */
  private lblCv: HTMLCanvasElement | null = null;
  private lblKey = "";
  /** resolved CSS custom properties — see `cssVar` */
  private readonly tokens = new Map<string, string>();

  constructor(private readonly o: OverlayOptions) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "fx-city-overlay-2d";
    /* POINTER EVENTS PASS STRAIGHT THROUGH. The GPU canvas underneath owns
       every gesture; this element must be invisible to the pointer or a
       reader would be dragging a sheet of glass with words on it. */
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    this.ctx = this.canvas.getContext("2d");
    /* DEV-ONLY, the `__cityGL*` idiom the mount already uses for the parity
       harness. The chrome this layer draws is a function of a SELECTION, and a
       selection is made with a pointer — so a harness comparing the two pages'
       chrome has to be able to say "the reader picked block N" without
       simulating a click on a city it cannot see. This is the only handle that
       makes that possible, and it is the same trade `CityGLMap` states for
       `__cityGLProj`. */
    if (process.env.NODE_ENV !== "production") {
      (globalThis as { __cityGLOverlay?: CityOverlay }).__cityGLOverlay = this;
    }
  }

  /** the designated + named places this city publishes, once they land */
  async load(): Promise<void> {
    try {
      const r = await fetch(`${this.o.dataBaseUrl}/base/marks.json`);
      if (r.ok) this.places = decodeMarks((await r.json()) as MarksFile);
    } catch {
      /* a city with no marks file has no landmark names, which is a fact
         about that city and not a failure of the page */
    }
    /* THE SURROUND'S OWN COAST — a sidecar, so it is fetched and not decoded
       from a chunk. Measured on the published file: 12 rings, 3,168 vertices,
       which is why it can be walked in full every frame rather than indexed.
       Its own try/catch, and after the marks rather than inside their guard:
       one missing sidecar must not take the other pass down with it. */
    try {
      const sc = await this.o.data.surroundCoast();
      this.surroundRings = sc ? sc.rings : [];
    } catch {
      /* no sidecar means no published edge to draw over the raster's own
         staircase — the picture is poorer and nothing here is wrong */
      this.surroundRings = [];
    }

    /* ── THE SIDECAR THE PICK CHROME READS ─────────────────────────────
       Fetched here for the same reason `marks.json` is: it is a published
       file under the city's own base URL, it is the contract between the two
       renderers, and it is not a chunk. Its own try/catch — a missing file
       must take down one pass and nothing else, and a city that publishes no
       divisions is a fact about that city.

       There were two. `blocks-id.json` went when the pin stopped writing the
       assessor's number, and it is 38 KB the reader no longer fetches. */
    try {
      const r = await fetch(`${this.o.dataBaseUrl}/base/hood-rings.json`);
      if (r.ok) this.hoodRings = (await r.json()) as HoodRingsFile;
    } catch {
      /* no divisions published — the scrim has nothing to punch through */
    }
  }

  resize(W: number, H: number, dpr: number): void {
    if (this.W === W && this.H === H && this.dpr === dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(W * dpr));
    this.canvas.height = Math.max(1, Math.round(H * dpr));
    /* the sheet is cut to the frame, so a new frame needs a new sheet */
    this.lblCv = null;
    this.lblKey = "";
  }

  /**
   * One frame of writing and chrome.
   *
   * `_step` is the ENGINE's LOD band and this layer does not read it. It stays
   * in the signature because the mount has it and hands it over, and because
   * naming it here is the only place a reader learns that it is deliberately
   * unread: it is `controls.ts`'s ladder, which is not the one the type or the
   * ink are cut on — see §BAND, which measures the gap and derives its own.
   */
  draw(cam: ViewCamera, _step: number): void {
    const ctx = this.ctx;
    if (!ctx || this.W <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    /* ── §BAND: THE WRITING'S LADDER IS NOT THE GEOMETRY'S ──────────────
       Every label pass in `lib/city/labels.ts` reads its band off `cam.step`
       and this file was handing it the ENGINE's LOD step. The two are not the
       same ladder and the difference is a whole camera wide:

         `controls.ts` stepForZ   z < 1.6  ? 0 : z < 3.2  ? 1 : 2
         `camera.ts`   bandOf     z < 1.703? 0 : z < 4.569? 1 : 2

       MEASURED at this city's four published stops, z being how many times
       closer than "the whole ground fits the frame" — 0.94 x 13,938 m of DEM
       divided by the stop's own span:

         | stop      | span m | z      | stepForZ | bandOf |
         | whole city| 14,000 |  0.936 | 0        | 0      |
         | district  |  4,200 |  3.120 | **2**    | **1**  |
         | block     |  1,400 |  9.359 | 2        | 2      |
         | street    |    420 | 31.195 | 2        | 2      |

       So at the district camera this page was running EVERY label pass in its
       closest-in configuration, and `drawHoodNames` opens `if (step >= 2)
       return 0` — which is why the port's district frame had no division
       capitals at all while the published one is carried by them. The street
       pass was equally wrong the other way: `ST_LB_NAME_CAP[2]` writes each
       name three times and `ST_LABEL_CLS_MAX[2]` admits the local streets, so
       the frame read as a street atlas rather than as a district.

       The band is therefore computed here, from the camera, on the Canvas
       renderer's own ladder, and the engine's own step is not read at all —
       §SURRINK below was the last pass leaning on it and it now spells its
       gate the way `scene.ts` spells it.

       `base` goes on the camera for the same reason: `terrain.ts` §zOf falls
       back to the constant 0.05565 when a `Frame` carries none, which is one
       viewport's fit of one city, and `drawShoreline` gates its shore corridor
       on `zOf(f.cam) >= 3.0`. A real fit makes that gate true instead of
       lucky. */
    const base = this.baseScale();
    const z = base > 0 ? cam.scale / base : 1;
    const band = bandOf(z);

    const f = {
      ctx,
      W: this.W,
      H: this.H,
      cam: { ...cam, step: band, base },
      year: this.year,
      proj: projection,
      dpr: this.dpr,
      moving: false,
    } as unknown as Frame;

    /* ── THE PAPER, OVER THE WHOLE PICTURE ─────────────────────────────
       `LOOK.grain` is the tooth of the sheet the Canvas renderer draws its
       ground on. It belongs over EVERYTHING here and not just the ground: a
       gouache city is painted on one sheet, and grain that stops where the
       buildings start reads as two materials rather than one picture.

       THE PAPER DOES NOT PAN. The tile is anchored to the FRAME's origin, so
       the tooth stays put while the city moves under it — which is what a
       sheet does, and what `paintGrain`'s own `ox`/`oy` argument exists for. */
    const t = this.o.field;

    /* ── THE COASTLINE IS A STROKE, AND THAT IS WHY IT IS HERE ───────────
       The city's ground is a 53.8 m raster and its edge is a staircase of
       that amplitude — at the whole-city camera, three or four pixels of
       cream steps running out into the bay, and the first thing a reader
       sees. The published shoreline cuts it, but only if it is drawn at a
       width that COVERS the step, and a step is a fixed number of PIXELS
       while a world-space ribbon is a fixed number of metres: `street-detail`
       measured its own kerb at 1.8 px there against the 4.0 the reference
       strokes. Geometry cannot win that.

       A stroke can. `drawShoreline` is the Canvas renderer's own pass, it
       takes a `Frame`, and it draws the same line at the same width at every
       zoom — which is exactly what a coastline is on a drawn map. So the ink
       goes on the glass with the type, and the GPU keeps the surfaces. */
    /* ── §SURRINK: AND THE SAME ARGUMENT FOR THE LAND THAT IS NOT THE CITY ──
       `scene.ts` draws TWO coast passes and this file had one. The second is
       `paintSurroundInk`, gated on `LOOK.surrink` and on `z < 3.2` — the whole
       city and the district cameras, because closer in the surround is off
       screen. Its subject is the OTHER raster: the surround's cells are
       110.01 x 139.15 m against the city DEM's 53.815, so its edge steps by
       twice as much, and at the whole-city camera that is the saw-tooth the
       county across the water, the headlands and the islands are drawn with.
       The published rings cut it for the same reason and by the same means
       the city's shoreline does, and it is a STROKE for the same reason: a
       step is a fixed number of PIXELS and a world-space ribbon is a fixed
       number of metres.

       AND THE GATE IS NOW THE SOURCE'S OWN SPELLING. This read `step < 2` and
       argued that `stepForZ`'s `z < 3.2` made the two identical. It did not,
       by a factor nobody had measured: the mount fits its base at `0.92 * W`,
       so the engine's `z` is `1.087x` this file's, and `step < 2` therefore
       turned the ink off at **z 2.944** where `scene.ts` §render turns it off
       at `z < 3.2`. Eight per cent of the ladder, and it took the ink off the
       district camera entirely — the one camera where a reader can still see
       the county across the water AND the staircase it is drawn with.
       §BAND above computes a `z` in the ladder's own unit, so the gate is now
       the same seven characters the published renderer writes. */
    if (z < 3.2 && this.surroundRings?.length) this.inkSurroundCoast(f, t);

    if (!this.coast) {
      const chunk = this.o.data.get("base/coast");
      this.coast = chunk ? decodeCoast(chunk).coast : [];
    }
    if (this.coast.length) drawShoreline(f, t, this.coast);

    paintGrain(ctx, this.W, this.H);

    const elev = (x: number, y: number): number => t.elevM(x, y);

    /* ══ THE TYPE IS PLACED ON A SHEET, NOT ON THE FRAME ══════════════════
       Reported, and it is a real defect: *"i get zooming can show more street
       names appearing, buildijg names etc, but here im getting that just from
       pannning around without zooming thats really abnormal and disturbing"*.

       ── WHY IT HAPPENED ────────────────────────────────────────────────────
       Every pass below spends from ONE ink budget (`labels.ts` §the ink
       budget: a box is admitted only if it fits in what is left) against ONE
       collision grid, and both were cut to the VIEWPORT and rebuilt every
       frame. So the set of names competing for the ink changed with every
       pixel of pan, and so did the winners. Measured before this was written:
       at the Sunset camera, a 60-pixel pan left 11.0% of the type not where it
       had been — whole names appearing and vanishing, not edges moving.

       The published Canvas renderer has the same passes and does not show
       this, and the reason is not that it places better: it rasterises the
       city into a slot and BLITS while you drag, so its type is re-decided
       only when you stop. This renderer redraws every frame, so it had to be
       given the same property honestly.

       ── WHAT THIS DOES ─────────────────────────────────────────────────────
       The type is placed against a camera SNAPPED to a coarse grid, on a
       sheet inflated past every edge, and that sheet is blitted at a whole
       number of device pixels. Two consequences, both wanted:

         · Panning inside a cell changes NOTHING. The sheet is not re-placed,
           it is moved, so the names translate with the city exactly as the
           buildings under them do.
         · A name entering the frame was already placed, out in the margin, so
           it slides in rather than appearing.

       The re-place at a cell boundary is the one discrete change left, and it
       is small because the sheet it is re-placed on is mostly the same sheet.

       ── AND THE OFFSET HAS TO BE WHOLE DEVICE PIXELS ───────────────────────
       Blitting type at a fractional offset resamples it, which is how you
       turn a fix for popping into a fix that also makes every label blurry.
       It lands exactly because `cam` arrives already snapped to the device
       grid (`engine.ts` §rasterCam) and the cell is a whole number of device
       pixels, so `(lcx - cx) * q` is an integer before it is rounded.

       PAD is 160 CSS px of margin and CELL is 128 of pan between re-places,
       which leaves 96 px of already-placed type outside the frame at the
       worst offset. The sheet costs (W + 320) x (H + 320) device pixels —
       about 28 MB at this city's largest frame and a device ratio of 2 — and
       it buys back the whole label pass on every frame that does not cross a
       cell, which is nearly all of them. */
    const PAD = 160;
    const CELL = 128;

    /* built once and not per camera, but the key below has to see it */
    if (!this.hoods) {
      const cols = this.columns();
      if (cols) this.hoods = buildHoodAnchors(cols);
    }

    const q = cam.scale * this.dpr;
    const pad = Math.round(PAD * this.dpr);
    const { cx: lcx, cy: lcy } = snapCameraToPixels(
      cam as unknown as PlaneCamera,
      this.dpr,
      Math.round(CELL * this.dpr),
    );
    const PWd = Math.round(this.W * this.dpr) + pad * 2;
    const PHd = Math.round(this.H * this.dpr) + pad * 2;

    const key = [
      PWd, PHd, this.dpr, cam.scale, band, base,
      this.year ?? "", lcx, lcy, this.places.length, this.hoods ? 1 : 0,
    ].join("|");

    if (!this.lblCv || this.lblKey !== key) {
      const cv = this.lblCv ?? document.createElement("canvas");
      if (cv.width !== PWd || cv.height !== PHd) {
        cv.width = PWd;
        cv.height = PHd;
      }
      const pv = cv.getContext("2d");
      if (pv) {
        pv.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        pv.clearRect(0, 0, PWd / this.dpr, PHd / this.dpr);

        /* the same frame, on the sheet's own geometry */
        const fl = {
          ...f,
          ctx: pv,
          W: PWd / this.dpr,
          H: PHd / this.dpr,
          cam: { ...cam, cx: lcx, cy: lcy, step: band, base },
        } as unknown as Frame;

        /* ── THE ORDER IS THE PRIORITY, AND IT IS `scene.ts`'S ────────────
           Designated landmarks take first refusal on the frame's ink, then
           the spine streets, then everything else — a landmark names one
           building and a reader can find Market Street by looking at the
           picture. All three passes share ONE collision grid, so a street
           name cannot be written over a place name and neither pass has to
           know the other exists. */
        const grid = new LabelGrid(fl.W, fl.H);

        const des = this.places.filter((qq) => qq.cls === "designated");
        if (des.length) placeNames(fl, des, grid, elev);

        const tbl = this.o.data.streetLabels();
        const sn = tbl ? new StreetNamePass(fl, tbl, grid, elev) : null;
        sn?.draw("spine");

        /* THE DISTRICT CAPITALS, between the spine and the arterials — the
           largest type on the frame and the thing that makes a district
           camera read as a map rather than as a texture. */
        if (this.hoods) drawHoodNames(fl, this.hoods, grid, elev);

        sn?.draw("arterials");

        const rest = this.places.filter((qq) => qq.cls !== "designated");
        if (rest.length) placeNames(fl, rest, grid, elev);

        sn?.draw("local");

        this.lblCv = cv;
        this.lblKey = key;
      }
    }

    if (this.lblCv) {
      const dx = Math.round((lcx - cam.cx) * q) - pad;
      const dy = Math.round((cam.cy - lcy) * q) - pad;
      ctx.save();
      /* device pixels, so the blit is a copy and not a resample */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.lblCv, dx, dy);
      ctx.restore();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /* ── AND THE CHROME LAST, IN THE PUBLISHED PAGE'S OWN ORDER ──────────
       On `/the-city` these three are DOM over the map canvas, in this order
       and no other: the division scrim inside `.fx-city-outline`, the block's
       own ring after it in the same element, then `.fx-city-pin` at z-index 6
       over both. The order is the whole argument — the scrim is a wash over
       everything the margin is NOT about, so the two things it must not wash
       are the block that answered and the pin pointing at it. */
    this.scrimDivision(f, z);
    /* ── THE PICKED BLOCK, OVER THE WRITING ──────────────────────────────
       Drawn here rather than as GPU geometry for one reason: it must be
       ABOVE everything, including a tower standing on the block itself, and
       a mesh that ignores the depth buffer is a special case in the renderer
       where this is two lines in the layer that is already on top.

       AND OVER THE NAMES, WHICH IS WHERE THE PUBLISHED PAGE PUTS IT. This
       ran BEFORE the label passes and the published one cannot: there the
       names are on the map canvas and `.fx-city-outline` is an SVG element
       laid over it, so a name inside the picked block is under the ring's
       casing and not over it. Same three passes, same three colours — only
       the position in the list changed.

       ── AND IT IS DRAWN TWICE, IN THE PAGE'S OWN INK ────────────────────
       The published page's `.fx-city-outline` is two SVG polygons over one
       point list and both halves matter:

         casing   stroke `var(--bg)` at 0.55, 5 px, round joins
         the line fill `var(--bleu)` at 0.10, stroke `var(--bleu)` at 1.75 px

       The casing is not decoration. One stroke in one colour disappears over
       half the city — a block edge crosses a pale roof, a bright park and a
       dark shadow inside its own perimeter — so the soft light casing goes
       down first and the line lands on it.

       AND THE COLOUR IS THE PAGE'S, NOT A UI BLUE. This read `rgb(30,69,228)`,
       which is not a tone of anything else on the frame; `--bleu` is `#2a3680`
       and is the ink the rest of the surface already uses. The same complaint
       took a saturated hairline off the neighbourhood layer on the other page:
       a colour that is not in the map's own palette reads as a debug overlay
       laid on the drawing rather than as part of it. `--bg` and `--bleu` are
       resolved off this canvas's own computed style rather than typed in, so a
       theme change moves both pages together; the literals are the fallback
       for a canvas that is not in the document yet.

       ONE DIFFERENCE FROM THE PUBLISHED PASS, DECLARED. That one projects the
       whole ring at ONE elevation — the block's published `z` — because that
       is the convention its massing prism already sets. This lifts each vertex
       onto the ground under it, which is what the rest of this file does with
       every label anchor, and on a hill it is the ring that lies on the city
       rather than through it. */
    if (this.highlight?.length) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < this.highlight.length; i++) {
        const [wx, wy] = this.highlight[i];
        const pl = projection.proj(wx, wy, elev(wx, wy));
        const X = (pl[0] - cam.cx) * cam.scale + this.W / 2;
        const Y = this.H / 2 - (pl[1] - cam.cy) * cam.scale;
        if (i) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      }
      ctx.closePath();
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = this.cssVar("--bg", "#fafaf7");
      ctx.lineWidth = 5;
      ctx.stroke();
      const bleu = this.cssVar("--bleu", "#2a3680");
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = bleu;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = bleu;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      ctx.restore();
    }
    this.drawPin(f, elev);
  }

  /**
   * THE SCALE AT WHICH THE WHOLE GROUND FITS THE FRAME — the unit `z` is in.
   *
   * `camera.ts` states the ladder in multiples of "base", and base is defined
   * there as *whole city fits the strip*. Nothing in this file is told that
   * number, and it does not have to be: the ground it is already holding
   * carries its own extent — `N` nodes at `cellM` metres — and `proj` carries
   * the only other term, the plane-x an eastward world metre buys.
   *
   * MEASURED on this city at a 1440 px frame: 259 x 53.815 m = 13,938 m of
   * DEM, `|ax|` = 1.2247, so the fit is 0.08435 — read back off the live page
   * to the digit. `terrain.ts` §zOf falls back to **0.05565** when a `Frame`
   * carries no base — one viewport's fit of one city — which is 1.52x too
   * small, so every zoom gate reading `zOf` on this page fired 1.52x too
   * early. `drawShoreline`'s own is `>= 3.0`: the shore corridor was coming on
   * at scale 0.167 where the ladder puts it at 0.253.
   *
   * THE TWO PAGES DO NOT HOLD THE SAME NUMBER HERE and they should not. The
   * published page's base is **0.06724512486989925** at this same viewport,
   * because it fits the CITY's bbox into the strip left of the record margin
   * and this fits the DEM square into the whole canvas — which is what its own
   * mount fits when it places a stop. What both bases mean is identical, and
   * it is the only thing the ladder asks of them: **z = 1 is the page's own
   * widest stop.** Measured, that holds — the published whole-city preset sits
   * at z 1.0 and this one at z 0.936.
   *
   * DERIVED AND NOT PASSED IN, deliberately. The mount computes the same
   * quantity to place its stops; taking it as an option would be a second
   * copy able to disagree with the first, and this one cannot go stale
   * because it is recomputed from the frame that is being drawn.
   */
  private baseScale(): number {
    const t = this.o.field;
    const across = Math.abs(projection.coeffs().ax) * (t.N - 1) * t.cellM;
    return across > 0 && this.W > 0 ? this.W / across : 0;
  }

  /**
   * `base/blocks`' own columns, decoded at most once.
   *
   * Two passes want them and neither can afford to walk 5,404 rings a frame:
   * the division capitals want the area-weighted centroids, and §SCRIM wants
   * the division byte of the one block a reader picked. `colsRead` rather than
   * a null check, because a city that ships no `hoodNames` legitimately
   * decodes to null and must not be re-walked on every frame for it.
   */
  private columns(): ReturnType<typeof hoodColumns> {
    if (!this.colsRead) {
      this.colsRead = true;
      this.cols = hoodColumns(this.o.data);
    }
    return this.cols;
  }

  /**
   * §SCRIM — THE DIVISION THE MARGIN IS TALKING ABOUT, SHOWN BY FOCUS.
   *
   * `CityMap.tsx`'s neighbourhood layer, and it is worth saying what that file
   * settled before this one copied it: **there is no fence.** A saturated
   * hairline around each division was the only line on the frame that was not
   * a tone of the ground it sat on, so it read as a debug overlay laid on the
   * drawing; taken off, the other forty divisions turned out to be a 5 % wash
   * nobody could see at any zoom. What is left is one move a paper map already
   * makes — a paper scrim over everything ELSE, punched through by the picked
   * division's own outline with `evenodd`.
   *
   * Clause for clause, and each of them is that layer's:
   *
   * - **only the picked one is built.** No selection, no scrim. The other
   *   forty are not drawn and are not missed: `drawHoodNames` has been writing
   *   all 41 NAMES at this zoom all along, out of the same division byte, and
   *   the names are the division.
   * - **it gives way as the reader leans in.** `wide` is linear in LOG scale
   *   between the whole-city stop and the block stop, then smoothstepped, so
   *   its derivative is zero at both ends and the scrim fades as the streets
   *   and the blocks arrive rather than switching at a threshold. A pixel
   *   floor is a step in the derivative and is the cause of every lurch bug on
   *   this project.
   *   VERIFIED against the published page rather than assumed. Driven to two
   *   different cameras and asked for both numbers at once — the live
   *   `.fx-city-outline` path's `fill-opacity`, and this arithmetic on that
   *   page's own `cam.scale / cam.base`:
   *
   *     z 2.6297748163280814 -> published 0.21642723480064482, this 0.21642723480064482
   *     z 2.9                -> published 0.18526381014271995, this 0.18526381014271995
   *
   *   **Difference 0 at both**, which is what makes it a port rather than a
   *   resemblance. (The block stop reports no path at all: `wide` has run out
   *   there and that page stops building one, which is this pass's early
   *   return spelled the other way.)
   * - **a part entirely off the visible strip is skipped.** Not a correctness
   *   cull — the rasteriser would clip it — but the strip stops short of the
   *   record margin, which is an opaque panel over this canvas's right edge,
   *   and a part that is only under the panel is a part no reader has.
   * - **one non-finite vertex takes the whole scrim down.** A half-built
   *   punch-out is a wash over the division itself, which says the exact
   *   opposite of what this pass is for.
   */
  private scrimDivision(f: Frame, z: number): void {
    const rings = this.hoodRings;
    const cols = this.columns();
    if (!rings || !cols || this.pick === null) return;
    const hi = cols.hood[this.pick];
    if (hi === undefined || hi >= rings.parts.length) return;
    const parts = rings.parts[hi];
    if (!parts?.length) return;

    /* the ramp, in the ladder's own terms: 1 at the whole-city stop, 0 at the
       block stop. `ZSTEPS` is `camera.ts`'s, so the two pages cannot drift. */
    const raw = Math.log(ZSTEPS[2] / z) / Math.log(ZSTEPS[2] / ZSTEPS[0]);
    const w = Math.min(1, Math.max(0, raw));
    const wide = w * w * (3 - 2 * w);
    if (wide <= 0.002) return;

    const { ctx } = f;
    const W = this.W;
    const H = this.H;
    const lw = W < NARROW_W ? 0 : LEDGER_W;
    const sc = f.cam.scale;
    const ccx = f.cam.cx;
    const ccy = f.cam.cy;
    const W2 = W / 2;
    const H2 = H / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    let any = false;
    for (const flat of parts) {
      const pts: number[] = [];
      let seen = false;
      for (let k = 0; k + 2 < flat.length; k += 3) {
        /* the third number is the ground under the vertex, published with it —
           so the ring lies on the city and `elev()` is not consulted */
        const pl = projection.proj(flat[k], flat[k + 1], flat[k + 2]);
        const X = (pl[0] - ccx) * sc + W2;
        const Y = H2 - (pl[1] - ccy) * sc;
        if (!Number.isFinite(X) || !Number.isFinite(Y)) {
          ctx.restore();
          return;
        }
        if (X > -400 && Y > -400 && X < W - lw + 400 && Y < H + 400) seen = true;
        pts.push(X, Y);
      }
      if (!seen || pts.length < 6) continue;
      ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
      ctx.closePath();
      any = true;
    }
    if (any) {
      ctx.globalAlpha = 0.42 * wide;
      ctx.fillStyle = this.cssVar("--bg", "#fafaf7");
      ctx.fill("evenodd");
    }
    ctx.restore();
  }

  /**
   * §PIN — WHICH OF THE 5,404 BLOCKS ANSWERED.
   *
   * `.fx-city-pin`, which the published page puts at z-index 6 over
   * everything. Without it a reader clicks, a century of decisions fills the
   * margin, and nothing on the map says which block that century belongs to;
   * the ring alone does not answer it either, because at the district camera a
   * block is a thin outline among two hundred of them.
   *
   * THE GEOMETRY IS THE STYLESHEET'S, MEASURED OFF THE LIVE ELEMENT rather
   * than read off the rules — `.fx-city-pin-ring` is `width: 16px` with a
   * `2px` border and `fusion.css` sets no universal `box-sizing`, so what the
   * ring actually occupies is a question for the browser and the browser says
   * **16.0 x 16.0**. The rest, from the same measurement: the row is
   * 60.41 x 19.5 for a four-digit id, the badge starts at **dx 22** (16 + a
   * 6 px flex gap), the ring sits at **dy 1.75** — (19.5 - 16) / 2, i.e.
   * centred — and the badge is 10 px mono at **0.6 px** of tracking (`.06em`)
   * inside `1px 5px` of padding and a 1 px border.
   *
   * `transform: translate(-50%, -50%)` is on the ROW and not on the ring, so
   * the point a reader clicked is under the gap between the ring and the
   * badge. That is the published behaviour and it is reproduced, not tidied.
   *
   * TWO DIFFERENCES FROM THE PUBLISHED PASS, DECLARED.
   *
   * 1. **The anchor is the block's own ring, not the click.** That page pins
   *    the exact point the pointer went down on, and falls back to the
   *    published centroid for a block reached by link — its own comment calls
   *    the centroid *"the better answer for a block nobody pointed at"*. This
   *    layer is handed a ring and never a click, so it takes the centroid for
   *    every pick, which is also the steadier mark: two readers picking the
   *    same block get the same picture.
   * 2. **With no label the pin is a ring alone.** A ring with an empty box
   *    beside it would be chrome claiming to name something it cannot.
   *
   * THE BADGE IS NO LONGER A NUMBER. It wrote the assessor's filing number;
   * it now writes whatever `pickLabel` holds, which is the neighbourhood on
   * the frame the click lands in and the block's own streets a moment later.
   * A name is wider than four digits, so the badge is capped at 34 characters
   * and the row is measured from the text rather than assumed — a long
   * three-street name would otherwise run under the record margin.
   */
  private drawPin(f: Frame, elev: (x: number, y: number) => number): void {
    const ring = this.highlight;
    if (!ring?.length) return;
    let sx = 0;
    let sy = 0;
    for (const [wx, wy] of ring) {
      sx += wx;
      sy += wy;
    }
    const cx = sx / ring.length;
    const cy = sy / ring.length;
    const pl = projection.proj(cx, cy, elev(cx, cy));
    const X = (pl[0] - f.cam.cx) * f.cam.scale + this.W / 2;
    const Y = this.H / 2 - (pl[1] - f.cam.cy) * f.cam.scale;
    if (!Number.isFinite(X) || !Number.isFinite(Y)) return;
    /* the published cull, and its reason: the strip stops short of the record
       margin, so a pin past it is sitting on a part of the city under an
       opaque panel. The other three edges get 40 px of grace because half a
       pin at the edge still points at something. */
    const lw = this.W < NARROW_W ? 0 : LEDGER_W;
    if (X < -40 || Y < -40 || X > this.W - lw || Y > this.H + 40) return;

    const { ctx } = f;
    const raw = this.pick !== null ? (this.pickLabel ?? "") : "";
    const id = raw.length > 34 ? `${raw.slice(0, 33)}…` : raw;
    const ink = this.cssVar("--ink", "#0a0a0a");

    ctx.save();
    ctx.font = `10px ${this.cssVar("--f-mono", "ui-monospace,monospace")}`;
    ctx.letterSpacing = "0.6px";
    /* 2 x 5 px of padding and 2 x 1 px of border, per the measurement above */
    const badgeW = id ? ctx.measureText(id).width + 12 : 0;
    const rowW = 16 + (id ? 6 + badgeW : 0);
    const x0 = X - rowW / 2;

    /* the box-shadow first — `0 0 0 2px` is a rim OUTSIDE the 16 px box, so it
       is a 2 px stroke centred at r = 9. It is what holds the ring against a
       dark roof, which is the same argument the block edge's casing makes. */
    const rcx = x0 + 8;
    ctx.beginPath();
    ctx.arc(rcx, Y, 9, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(250,250,247,.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    /* the background runs UNDER the border in CSS, so it is filled to r = 8
       and the 2 px border is stroked inside it, centred at r = 7 */
    ctx.beginPath();
    ctx.arc(rcx, Y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250,250,247,.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rcx, Y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (id) {
      const bx = x0 + 22;
      const by = Y - 19.5 / 2;
      ctx.fillStyle = this.cssVar("--bg", "#fafaf7");
      ctx.fillRect(bx, by, badgeW, 19.5);
      /* the half-pixel is not a nicety: a 1 px stroke on an integer edge lands
         half in each of two device rows and reads as a 2 px grey line */
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, badgeW - 1, 19.5 - 1);
      ctx.fillStyle = ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(id, bx + 6, Y);
    }
    ctx.letterSpacing = "0px";
    ctx.restore();
  }

  /**
   * A CSS custom property, resolved off this canvas, with a literal fallback.
   *
   * The chrome the port is matching is written in the page's own tokens, and
   * a canvas cannot be handed a `var()`. Read once per token and cached: this
   * runs inside the frame loop, and `getComputedStyle` is a style flush.
   *
   * Not colours only — `--f-mono` comes through here too, for the pin's id
   * badge. A font stack is a token like any other, and the alternative is
   * typing this page's typeface into the engine, which is the kind of copy
   * that survives a theme change and should not.
   *
   * An empty string is not cached, because that is what an element gets
   * before it is in the document — the mount appends this canvas after it is
   * constructed, so the first read can legitimately come back with nothing.
   */
  private cssVar(token: string, fallback: string): string {
    const held = this.tokens.get(token);
    if (held !== undefined) return held;
    if (!this.canvas.isConnected) return fallback;
    const v = getComputedStyle(this.canvas).getPropertyValue(token).trim();
    if (!v) return fallback;
    this.tokens.set(token, v);
    return v;
  }

  /**
   * §SURRINK — the surround's published coast, over its own staircase.
   *
   * `scene.ts` §paintSurroundInk, clause for clause, and each of them is that
   * function's:
   *
   * - **a vertex inside the city's own DEM is skipped**, and the pen is lifted
   *   there rather than carried across, because the city's shoreline pass has
   *   already drawn that edge and a second stroke over it would read as a
   *   double line at the one place a reader is looking closest.
   * - **the ring is lifted 0.4 m, exaggerated**, so the line sits on the water
   *   surface rather than under it.
   * - **the pen is lifted off frame too.** These are 3,168 published vertices
   *   and at the district camera most of them are outside the viewport; a
   *   `moveTo` costs nothing and a subpath running four screens wide costs the
   *   rasteriser.
   * - **two strokes, pale then dark**: a 3.5 px rim of near-paper that covers
   *   the step, then 1.0 px of ink that is the edge. One stroke cannot do both
   *   — the rim's job is to hide a raster and the ink's is to be a coastline.
   *
   * The projection is spelled out rather than taken from `proj()` because
   * every vertex shares one elevation, so the two coefficients and the lift
   * are constant across the whole walk.
   */
  private inkSurroundCoast(f: Frame, t: TerrainField): void {
    const rings = this.surroundRings;
    if (!rings) return;
    const { ctx } = f;
    const W = this.W;
    const H = this.H;
    const c = projection.coeffs();
    const sc = f.cam.scale;
    const ccx = f.cam.cx;
    const ccy = f.cam.cy;
    const W2 = W / 2;
    const H2 = H / 2;
    const zl = 0.4 * projection.zex;
    const N = t.N;
    ctx.save();
    ctx.beginPath();
    let any = false;
    for (const ring of rings) {
      let pen = false;
      for (let k = 0; k < ring.length; k++) {
        const wx = ring[k][0];
        const wy = ring[k][1];
        const g = t.toGrid(wx, wy);
        if (g[0] >= 1 && g[1] >= 1 && g[0] < N - 1 && g[1] < N - 1) {
          pen = false;
          continue;
        }
        const X = (c.ax * wx + c.ay * wy - ccx) * sc + W2;
        const Y = H2 - (c.bx * wx + c.by * wy + zl - ccy) * sc;
        if (X < -200 || X > W + 200 || Y < -200 || Y > H + 200) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
        pen = true;
        any = true;
      }
    }
    if (any) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,252,242,.7)";
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.strokeStyle = "rgba(10,10,10,.34)";
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }
    ctx.restore();
  }

  dispose(): void {
    this.canvas.remove();
  }
}
