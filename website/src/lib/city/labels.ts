/**
 * labels.ts — streets, named places and hoods sharing one ink budget.
 *
 * Block P3. Ported from `gen/part3.html` §STREETS AND NAMES (`SPINE`,
 * `LB_ORDER`, `placeNames`, `drawGeoLabels`, `drawPlaceNames`, `trackedText`),
 * with `marks/BLOCK-N.md` and `lod/BLOCK-L.md` §7.
 *
 * ── THE ONE RULE, WRITTEN THREE TIMES ───────────────────────────────────
 * `minLen` gated a street label on the street being 1100 / 420 / 150 m long,
 * by zoom band. At the three preset cameras those are **75 px, 82 px and
 * 74 px** of projected street, and a street name at these sizes measures
 * **70–90 px**. They were one rule written three times:
 *
 * > **A name is only written where the thing it names is at least as long as
 * > the name.**
 *
 * Stated that way it is continuous in zoom instead of stepping at a band
 * boundary, and it scales with the length of the name rather than treating
 * GEARY BLVD and JUNIPERO SERRA BLVD alike. Applied to a compact object instead
 * of a linear one it is the named-place gate as well.
 */

import { type Frame, nameFitsFrame, sx, sy } from "./terrain";

// ── the ink budget ──────────────────────────────────────────────────────────

/**
 * THE BUDGET IS ONE MEASURED NUMBER, NOT A COUNT.
 *
 * `HOOD_INK = 0.0304` of the frame is what a name layer was **measured** to
 * cost, by hooking `fillText` over all ten film shots. The place names take the
 * same figure, **split evenly between the two published classes**, because
 * nothing in either register says one deserves more of the frame than the
 * other. Measured, the place-name layer spends 0.0273–0.0295 of the frame.
 *
 * **It is the same NUMBER as the neighbourhood layer's and not the same POOL**:
 * the two layers share this pass's collision grid, so neither can be written
 * over the other, and the frame carries both. The consequence is on the record
 * rather than hidden — the two together are about 0.06 of the wide frame.
 * Making it one genuinely shared pool means putting a budget on the hood pass,
 * which the explorer has never had. **Left alone deliberately.**
 *
 * THE BUDGET IS *EXACT*, AND THAT IS WHY. A name is admitted only if its own
 * box fits in what is left, **so the layer cannot overshoot by one label the
 * way a check-then-add cap does.** The first version of the assertion was
 * written against a check-then-add cap and failed; the code is exact now, not
 * the test.
 */
export const HOOD_INK = 0.0304;
/** per published class: DESIGNATED and NAMED */
export const PLACE_INK_PER_CLASS = HOOD_INK / 2;

/**
 * An ink budget that admits a box only if it fits in what is left.
 *
 * `spend()` returns false and changes nothing where the box would overshoot,
 * which is the difference between this and a cap that is checked after the
 * fact.
 */
export class InkBudget {
  private used = 0;
  constructor(
    readonly limit: number,
    readonly frameArea: number,
  ) {}

  get spent(): number {
    return this.frameArea > 0 ? this.used / this.frameArea : 0;
  }

  get remaining(): number {
    return Math.max(0, this.limit * this.frameArea - this.used);
  }

  /** true if the box was admitted; false leaves the budget untouched */
  spend(w: number, h: number): boolean {
    const a = w * h;
    if (this.used + a > this.limit * this.frameArea) return false;
    this.used += a;
    return true;
  }
}

// ── the pass order ──────────────────────────────────────────────────────────

/**
 * THE ORDER, AND BOTH INSERTIONS WERE FORCED BY A SCREENSHOT.
 *
 * ```
 * 1  DESIGNATED LANDMARKS        (<= 0.0152 of the frame)
 * 2  the spine arterials
 * 3  the neighbourhoods
 * 4  the remaining ARTERIALS
 * 5  NAMED PLACES                (<= 0.0152 of the frame)
 * 6  the collectors and the local streets
 * ```
 *
 * **Landmarks first.** With the designated lane placed after the streets and
 * hoods, SAN FRANCISCO CITY HALL, PALACE OF FINE ARTS and the FERRY BUILDING
 * all lost their slot — City Hall to the rotated MARKET ST box that runs
 * straight through Civic Center — and the budget they would have spent went to
 * SUNSHINE SCHOOL, RICHARDSON HALL and EL REY THEATER, which are on the same
 * register, are small, and stand where nothing else competes. **Collision
 * placement favours the periphery, so the order has to carry the priority.**
 * The priority is specificity: a landmark name names one building, a street
 * name names a five-kilometre line, a neighbourhood name names a district —
 * and a reader can find Market Street by looking at the picture and cannot find
 * City Hall.
 *
 * **Named places at their own street rank.** Placed ahead of *all* the streets,
 * the pier names took THE EMBARCADERO off its own waterfront. An arterial's
 * name is how a reader navigates and a pier's name is a detail, which is the
 * judgement the street classes are already ordered by, so the lane sits between
 * the arterials and the collectors.
 *
 * And the spine/hood order below it was itself arrived at by looking: hoods
 * first alone left the wide shot with nine street labels and no Market Street;
 * spine first alone let the arterials trample the hood names.
 */
export const LABEL_PASSES = [
  "designated",
  "spine",
  "hoods",
  "arterials",
  "named",
  "local",
] as const;
export type LabelPass = (typeof LABEL_PASSES)[number];

/**
 * `LB_ORDER` WAS COMPUTED AT LOAD AND READ BY NOTHING.
 *
 * It sorts every street label by the City's published class and then by
 * measured length, and the LOD write-up says the budget is spent in that order.
 * **It was not.** The loop ran in file order and `LB_ORDER` had exactly one
 * occurrence in the whole tree — its own definition — checked across every
 * file. The class *gates* were doing all of the work; the *order* half of that
 * fix had never been wired.
 *
 * The symptom was on the downtown block frame: ANNIE ST, STEVENSON ST, NATOMA
 * ST and MINNA ST — service alleys — lettered at the same size, weight and
 * colour as MONTGOMERY ST, THE EMBARCADERO and COLUMBUS AVE, with about thirty
 * names competing and none winning. **The budget was spent in file order: an
 * alley reached the collision grid before the arterial it runs behind, took the
 * space and took the slot.**
 *
 * It is wired here, because the pass is split at the arterials and **the split
 * has to be in class order to mean anything.**
 */
export function labelOrder(
  cls: Uint8Array,
  lengthM: Float32Array,
): Int32Array {
  const a: number[] = [];
  for (let i = 0; i < cls.length; i++) a.push(i);
  a.sort((p, q) => cls[p] - cls[q] || lengthM[q] - lengthM[p]);
  return Int32Array.from(a);
}

// ── the three ranks ─────────────────────────────────────────────────────────

/**
 * EVERY LABEL WAS SET IDENTICALLY, which is the other half of the same defect.
 *
 * Three ranks, about **30 % apart in size and better than 40 % in value**,
 * which ART-SPEC §7.3 puts well above the threshold at which two treatments
 * read as one.
 */
export const LB_SIZE: readonly number[] = [1.16, 1.0, 0.86];
export const LB_WT: readonly number[] = [700, 600, 500];
export const LB_INK: readonly string[] = [
  "rgba(38,30,16,.90)",
  "rgba(38,30,16,.74)",
  "rgba(38,30,16,.54)",
];

/** the local classes may take at most 45 % of the budget */
export const LOCAL_SHARE_MAX = 0.45;

/** the highest street class drawn as a label, per zoom band — it OPENS as you
 *  zoom, never the reverse */
export const ST_LABEL_CLS_MAX: readonly number[] = [2, 3, 4];

// ── the two published gates ─────────────────────────────────────────────────

/**
 * A NAME IS ONLY WRITTEN WHERE THE THING IT NAMES IS AT LEAST AS LONG AS THE
 * NAME.
 *
 * One rule, continuous in zoom, scaling with the name.
 */
export function nameFitsItsStreet(
  streetLenM: number,
  textPx: number,
  camScale: number,
): boolean {
  return streetLenM * 1.2247 * camScale >= textPx;
}

/**
 * The same rule for a compact object, and the number is the type's own line
 * height at these sizes.
 *
 * Measured at whole city, it admits **59 of 904** un-designated places and
 * turns away the rest — a gate that admits some and turns away most, which is
 * what the assertion requires of it.
 */
export const PLACE_MIN_PX = 10;

export function placeIsBigEnough(spanM: number, camScale: number): boolean {
  return spanM * 1.2247 * camScale >= PLACE_MIN_PX;
}

/**
 * ONE GATE ON THE ARTICLE 10 RING, AND IT IS `PREC_MAX` RESTATED.
 *
 * That register's own metadata says its areas *"represent parcel boundaries
 * **or streets** listed in Article 10"* — the polygon is the *listing*, not the
 * object. So **a ring wider than one San Francisco block (275 x 125 m) has
 * located a landmark and has not sized it.** 233,162 m2 is City College's
 * campus, not the mural on its wall; 190,238 m2 is the length of Market Street,
 * not a light standard.
 *
 * Recreation and Parks rings are **not** gated — there the polygon is the park,
 * which is the thing being named.
 */
export const BLOCK_M: readonly [number, number] = [275, 125];

export function ringSizesIt(widthM: number, heightM: number): boolean {
  return widthM <= BLOCK_M[0] && heightM <= BLOCK_M[1];
}

/**
 * THE SPAN LADDER — what "how big is it" means, per kind of thing.
 *
 * ```
 *   a building footprint    max(sqrt(footprint area), its drawn height)
 *   a park or property ring sqrt(the published plan area)
 *   the Golden Gate deck    the deck ring's own length, 1,753 m
 *   nothing                 nothing — and the place is not shipped
 * ```
 *
 * **Height belongs inside that `max`** because at this projection a metre of
 * height is within 8 % of a metre of width on screen (1.1314 px/m against
 * 1.2247 at unit scale), so a tower and a shed of the same plan are correctly
 * not the same size.
 */
export function spanOfFootprint(areaM2: number, drawnHeightM: number): number {
  return Math.max(Math.sqrt(areaM2), drawnHeightM);
}

export function spanOfRing(planAreaM2: number): number {
  return Math.sqrt(planAreaM2);
}

// ── tracking is geometry, and it lives one file down ────────────────────────

/**
 * `NAME_TRACK`, `trackedWidth`, `trackedText`, `nameFitsFrame` and `NAME_BOT`
 * moved into `terrain.ts` and are re-exported here, so §9's surface is
 * unchanged and there is still exactly one copy of each number.
 *
 * **They moved because the surround's own names are painted with the GROUND**,
 * not with the city: `part3.html` calls `drawPlaceNames` from inside
 * `drawTerrain`, right after the surround and before the paper. A module may
 * only import from stages before it in the paint order, so the primitives had
 * to sit at or below the stage that uses them first — and that stage is the
 * ground. The whole of the finding they carry travelled with them.
 */
export {
  NAME_TRACK,
  NAME_BOT,
  setNameBot,
  trackedWidth,
  trackedText,
  nameFitsFrame,
  type SurroundName,
  surroundNames,
  SURROUND_SIZE,
  SURROUND_SIZE_SM,
  SURROUND_INK_LAND,
  SURROUND_INK_WATER,
  SURROUND_HALO,
} from "./terrain";

// ── the collision grid ──────────────────────────────────────────────────────

/**
 * One grid, shared by every lane, so **neither layer can be written over the
 * other** even though they carry separate budgets.
 */
export class LabelGrid {
  private readonly cells: Map<number, { x0: number; y0: number; x1: number; y1: number }[]>;
  constructor(
    readonly W: number,
    readonly H: number,
    readonly cell = 32,
  ) {
    this.cells = new Map();
  }
  private key(i: number, j: number): number {
    return j * 4096 + i;
  }
  fits(x0: number, y0: number, x1: number, y1: number): boolean {
    const i0 = Math.floor(x0 / this.cell),
      i1 = Math.floor(x1 / this.cell);
    const j0 = Math.floor(y0 / this.cell),
      j1 = Math.floor(y1 / this.cell);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const b = this.cells.get(this.key(i, j));
        if (!b) continue;
        for (const r of b)
          if (!(x1 < r.x0 || x0 > r.x1 || y1 < r.y0 || y0 > r.y1)) return false;
      }
    return true;
  }
  add(x0: number, y0: number, x1: number, y1: number): void {
    const i0 = Math.floor(x0 / this.cell),
      i1 = Math.floor(x1 / this.cell);
    const j0 = Math.floor(y0 / this.cell),
      j1 = Math.floor(y1 / this.cell);
    const r = { x0, y0, x1, y1 };
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = this.key(i, j);
        const b = this.cells.get(k);
        if (b) b.push(r);
        else this.cells.set(k, [r]);
      }
  }
}

// ── the place mark ──────────────────────────────────────────────────────────

/**
 * A DESIGNATED PLACE CARRIES A MARK; A NAMED PLACE DOES NOT.
 *
 * The mark is a pip in the map's own label ink, with a paper halo, **the same
 * size at every zoom**. That is what lets a nine-pixel building be named: *a
 * map prints COIT TOWER beside a symbol, not at the size of the tower.* Where a
 * designated place also resolves to a footprint and the camera is past
 * whole-city, its own ring is stroked in the landmark ink, so the reader can
 * see WHICH SOLID the name belongs to.
 *
 * A NAMED place (a park, a facility) gets a name and no mark, and is written
 * only where the thing itself is at least as big on screen as one line of the
 * type that names it.
 */
export const MK_MARK_PX = 4.2;

/** css px from the mark to the first letter of the name beside it */
export const MK_LEAD = 7;

/** the diamond's own fill */
export const MK_INK = "rgba(30,24,12,.86)";

/**
 * THE PLACE NAMES ARE A THIRD TREATMENT, DISTINCT FROM BOTH LAYERS THEY SHARE
 * THE FRAME WITH.
 *
 * The streets are rotated sans in capitals, the neighbourhoods tracked serif in
 * capitals, and **a place keeps the capitalisation the register published**,
 * because these are proper names and the file chose it.
 *
 * The face is the page's own UI sans and not `JetBrains Mono`. That is not a
 * preference: this port set every name — landmark, park and pier alike — in one
 * monospace at one size behind one heavy halo, and parity §4 records what that
 * reads as, which is *a debug overlay laid on a drawing*. It is also why the
 * count was stuck at 11-14 in every frame: a monospace advances at 0.6 em on
 * every glyph, so `San Francisco Zoo` measures about 130 px where a
 * proportional sans measures about 85, and the ink budget is spent on a third
 * fewer names for the same picture.
 */
export const PLACE_FACE = "ui-sans-serif,system-ui,sans-serif";

/** type size by zoom band — the ladder the mock sets, whole / district / block */
export const PLACE_FS: readonly number[] = [10, 10.5, 11];

/** the paper halo the place lane is set behind */
export const PLACE_HALO = "rgba(250,246,238,.94)";

/**
 * The band a camera is in, from its own absolute scale.
 *
 * `placeNames` is handed a `Frame`, and a `Frame`'s camera may or may not carry
 * a `step` — the film drives one that does and a gesture drives one that does
 * not. `z = scale / base` is defined for both and it is the same ladder
 * `camera.ts` steps through, so the type size is a function of the camera
 * rather than of who set it.
 */
function bandOfScale(cam: Frame["cam"]): number {
  const c = cam as { step?: number; scale: number; base?: number };
  if (typeof c.step === "number") return Math.max(0, Math.min(2, c.step));
  const base = typeof c.base === "number" && c.base > 0 ? c.base : 0.05565;
  const z = c.scale / base;
  return z < 2.35 ? 0 : z < 4.57 ? 1 : 2;
}

export type PlaceClass = "designated" | "named";

export interface PlaceLabel {
  readonly name: string;
  readonly wx: number;
  readonly wy: number;
  /** how big the thing is, world metres — see `spanOfFootprint`/`spanOfRing` */
  readonly spanM: number;
  readonly cls: PlaceClass;
  /** the year it can first be named, or undefined for every year */
  readonly year?: number;
}

export interface PlaceResult {
  readonly placed: number;
  readonly byClass: readonly [number, number];
  /** the fraction of the frame this layer spent */
  readonly ink: number;
  /** the median span of the places named, world metres */
  readonly medianSpanM: number;
}

/**
 * THE LADDER DESCENDS, AND THE COUNT IS NOT THE TEST.
 *
 * The count is roughly flat across the three cameras **because the budget binds
 * at all three**; what changes is WHICH places are named. At whole city the
 * budget is spent on the largest things in San Francisco, at block zoom on
 * whatever is in front of the reader. Measured: the median span of the places
 * named at whole city is **180 m** and at block zoom **94 m**, and **12 of the
 * 13** names on the block frame were never written on the wide one.
 *
 * The first version of that assertion asserted the count *rises* with zoom,
 * which is false; it was replaced by what is true and means more.
 */
export function placeNames(
  f: Frame,
  places: readonly PlaceLabel[],
  grid: LabelGrid,
  elev: (x: number, y: number) => number,
): PlaceResult {
  const { ctx, W, H, cam } = f;
  const area = W * H;
  const budgets = {
    designated: new InkBudget(PLACE_INK_PER_CLASS, area),
    named: new InkBudget(PLACE_INK_PER_CLASS, area),
  };
  const byClass: [number, number] = [0, 0];
  const spans: number[] = [];
  let placed = 0;
  const step = bandOfScale(cam);
  const fs = PLACE_FS[step];
  ctx.save();
  ctx.textBaseline = "middle";
  /*
   * WHICH LANE GOES FIRST, AND WHY IT IS THE LANDMARKS.
   *
   * Two passes, not one interleaved walk in file order. Measured in the mock
   * before the split existed: SAN FRANCISCO CITY HALL, PALACE OF FINE ARTS and
   * the FERRY BUILDING all lost their slot — City Hall to the rotated MARKET ST
   * box — and the budget went to SUNSHINE SCHOOL, RICHARDSON HALL and EL REY
   * THEATER, which are on the same register, are small, and stand where nothing
   * else competes. **Collision placement favours the periphery, so the order
   * has to carry the priority**, and the priority is specificity: a reader can
   * find Market Street by looking at the picture and cannot find City Hall.
   */
  for (const lane of ["designated", "named"] as const) {
    const des = lane === "designated";
    for (const p of places) {
      if (p.cls !== lane) continue;
      if (p.year !== undefined && f.year !== undefined && f.year < p.year) continue;
      /* THE SIZE RULE IS THE UN-DESIGNATED LANE'S ALONE. A designated landmark
         is drawn with a mark of its own, and a mark does not shrink — which is
         what lets a nine-pixel building be named. */
      if (!des && !placeIsBigEnough(p.spanM, cam.scale)) continue;
      ctx.font = `${des ? 600 : 500} ${des ? fs : fs * 0.94}px ${PLACE_FACE}`;
      const tw = ctx.measureText(p.name).width;
      const bw = tw + (des ? 16 : 10),
        bh = fs + 5;
      const pr = f.proj.proj(p.wx, p.wy, elev(p.wx, p.wy));
      const X = sx(f, pr),
        Y = sy(f, pr);
      /* the margin is the LABEL's own half-width, and for a designated place
         the label is not centred on the mark — it sits beside it */
      const ax = des ? X + MK_LEAD + tw / 2 : X;
      if (!nameFitsFrame(ax, Y, bw, W, H)) continue;
      const x0 = ax - bw / 2,
        x1 = ax + bw / 2,
        y0 = Y - bh / 2,
        y1 = Y + bh / 2;
      if (!grid.fits(x0, y0, x1, y1)) continue;
      // the budget is EXACT: admit only if the box fits in what is left
      if (!budgets[lane].spend(bw, bh)) continue;
      grid.add(x0, y0, x1, y1);
      ctx.lineJoin = "round";
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = PLACE_HALO;
      if (des) {
        /*
         * THE MARK IS A DIAMOND, NOT A DISC.
         *
         * On this map a coloured disc means *a decision happened here* and none
         * of these are decisions. A pip in the ink the map's own labels are set
         * in, with a paper halo so it reads on the fabric, and **the same size
         * at every zoom** — because that is what makes a nine-pixel building
         * findable. A map prints COIT TOWER beside a symbol, not at the size of
         * the tower.
         */
        ctx.beginPath();
        ctx.moveTo(X, Y - MK_MARK_PX);
        ctx.lineTo(X + MK_MARK_PX, Y);
        ctx.lineTo(X, Y + MK_MARK_PX);
        ctx.lineTo(X - MK_MARK_PX, Y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = MK_INK;
        ctx.fill();
        ctx.textAlign = "left";
        ctx.strokeText(p.name, X + MK_LEAD, Y);
        ctx.fillStyle = LB_INK[0];
        ctx.fillText(p.name, X + MK_LEAD, Y);
      } else {
        ctx.textAlign = "center";
        ctx.strokeText(p.name, X, Y);
        ctx.fillStyle = LB_INK[1];
        ctx.fillText(p.name, X, Y);
      }
      placed++;
      byClass[des ? 0 : 1]++;
      spans.push(p.spanM);
    }
  }
  ctx.textAlign = "center";
  ctx.restore();
  spans.sort((a, b) => a - b);
  return {
    placed,
    byClass,
    ink: budgets.designated.spent + budgets.named.spent,
    medianSpanM: spans.length ? spans[spans.length >> 1] : 0,
  };
}

/**
 * THE LABEL PASS RUNS ONCE PER CITY-LAYER RASTERISATION, NOT ONCE PER FRAME.
 *
 * It is the last thing the city draw paints into the cached layer, so it is
 * paid when the year ticks, the camera settles or the tier moves — **never on
 * a blit.** Measured: +0.2 to +0.4 ms for +18 to +22 labels.
 */
export const LABELS_ARE_IN_THE_CACHED_LAYER = true;

/**
 * A LABEL LIES ON ITS STREET, NOT ACROSS IT.
 *
 * The orientation is pushed through the projection rather than taken from the
 * world bearing, because the dimetric squash does not preserve an angle.
 */
export function streetLabelAngle(
  f: Frame,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const a = f.proj.proj(ax, ay, 0),
    b = f.proj.proj(bx, by, 0);
  let th = Math.atan2(sy(f, b) - sy(f, a), sx(f, b) - sx(f, a));
  // never upside down
  if (th > Math.PI / 2) th -= Math.PI;
  if (th < -Math.PI / 2) th += Math.PI;
  return th;
}

/**
 * THE SPINE IS DATA-DERIVED — the longest rank-0 stretches, **not a
 * whitelist.**
 *
 * Market Street is on the wide shot because it is the one line the two grids
 * meet on and because it is the longest rank-0 stretch, not because it is
 * named in a list. There is no list of important streets here and there must
 * never be one — the same rule that keeps ITALIAN AMERICAN BANK and HIGH SCHOOL
 * OF COMMERCE in the designated lane: **they are the largest measured
 * designated landmarks in the city and the order is the file's.**
 */
export function spineOf(
  cls: Uint8Array,
  lengthM: Float32Array,
  take: number,
): Int32Array {
  const idx: number[] = [];
  for (let i = 0; i < cls.length; i++) if (cls[i] === 0) idx.push(i);
  idx.sort((a, b) => lengthM[b] - lengthM[a]);
  return Int32Array.from(idx.slice(0, take));
}

/**
 * NOTHING DATES A PARK, and the layer says so rather than guessing.
 *
 * 122 places take their first year from the made-land rule and 111 from the
 * first dated building standing on their own ring — **a statement about the
 * map, not about the place.** Golden Gate Park is therefore named from 1906,
 * which is the map's own first year, so no claim is made about 1870 either way.
 */
export const PLACE_YEARS_ARE_ABOUT_THE_MAP = true;

// ── the neighbourhood capitals ──────────────────────────────────────────────

/**
 * THE DISTRICT CAPITALS. `blocks.hood` HAS BEEN ON THE WIRE ALL ALONG.
 *
 * §9 recorded this as *"a data path and not a treatment"* and left it. The
 * data path is already there: `base/blocks` ships a `hood` byte per assessor
 * block and 41 `hoodNames` in the manifest, `decodeBlocks` decodes both into
 * `BlockTable`, and `blocks.cx`/`cy`/`area` are the block's own centroid and
 * its own published area. **Nothing about a neighbourhood name has to be
 * invented; it has to be summed.**
 *
 * What is NOT here and cannot be, and the note it replaces was wrong about it:
 * **the arterials.** The reference sets GEARY BLVD and SLOAT BLVD along their
 * own centrelines out of `G.labels`, a table of street NAMES with a position,
 * a direction, a length and a class. `manifest.kinds.strt` ships
 * `fid kind cls cnn w fw yr imp krb rw* rd*` and **no name field**; the only
 * street text on the wire anywhere is `strt-misc.stairNames`. So the arterial
 * layer is a PIPELINE gap, not a renderer one, and `labelOrder`, `spineOf`,
 * `nameFitsItsStreet`, `LB_SIZE`, `LB_WT`, `LB_INK` and `ST_LABEL_CLS_MAX` sit
 * here waiting for a table that does not exist yet. That is worth saying
 * plainly rather than leaving them looking merely unwired.
 */
export interface HoodAnchor {
  readonly name: string;
  readonly wx: number;
  readonly wy: number;
  /** the published area the anchor is the centroid of, m2 */
  readonly areaM2: number;
}

/**
 * THE ANCHOR IS THE AREA-WEIGHTED CENTROID OF THE BLOCKS THAT CARRY THE NAME.
 *
 * Not a typed-in coordinate and not the mean of the block centroids either: a
 * neighbourhood is a piece of GROUND, so the blocks are weighted by the area
 * the assessor publishes for each of them. Twenty-two small downtown blocks do
 * not out-vote four large ones.
 *
 * Deterministic, and it is a pure function of the shipped chunk — the same
 * anchor every run, the same rule for every neighbourhood, and nothing here
 * knows which neighbourhoods exist.
 */
export function buildHoodAnchors(b: {
  readonly hood: Uint8Array;
  readonly hoodNames: readonly string[];
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly area: Float32Array;
}): HoodAnchor[] {
  const n = b.hoodNames.length;
  const sx0 = new Float64Array(n),
    sy0 = new Float64Array(n),
    sa = new Float64Array(n);
  const m = Math.min(b.hood.length, b.cx.length, b.cy.length, b.area.length);
  for (let i = 0; i < m; i++) {
    const h = b.hood[i];
    if (h >= n) continue;
    const a = b.area[i] > 0 ? b.area[i] : 0;
    if (!(a > 0)) continue;
    sx0[h] += b.cx[i] * a;
    sy0[h] += b.cy[i] * a;
    sa[h] += a;
  }
  const out: HoodAnchor[] = [];
  for (let h = 0; h < n; h++) {
    if (!(sa[h] > 0)) continue;
    out.push({
      name: b.hoodNames[h],
      wx: sx0[h] / sa[h],
      wy: sy0[h] / sa[h],
      areaM2: sa[h],
    });
  }
  /* LARGEST FIRST, for the same reason the street pass runs in the City's own
     class order: the collision grid is first-come, and a name that describes
     more ground has more claim on the frame than one that describes less.
     Data-derived, like the spine — there is no list. */
  out.sort((p, q) => q.areaM2 - p.areaM2 || p.name.localeCompare(q.name));
  return out;
}

/** the neighbourhood face — tracked serif capitals, `part3.html` L7140-7142 */
export const HOOD_FACE = "ui-serif,Georgia,serif";
export const HOOD_TRACK_PX = 1.5;
export const HOOD_FS: readonly number[] = [11, 12.5, 12.5];
export const HOOD_HALO = "rgba(248,244,235,.9)";
export const HOOD_INK_FILL = "rgba(54,40,16,.80)";
/** world metres the anchor is lifted before it is projected — L7137 */
export const HOOD_LIFT_M = 30;
/** the CSS width at and above which the ledger is an opaque panel over the map */
export const LEDGER_W = 288;
export const LEDGER_MIN_W = 820;

/**
 * The neighbourhood capitals, on the collision grid the place names share.
 *
 * Ported from `part3.html` `hoods()`, L7131-7165, and every clause of it is
 * one of that function's:
 *
 * - **not past the district band.** `if (cam.step >= 2) return` — at block
 *   zoom a district name names something the reader cannot see the edge of.
 * - **the anchor is lifted 30 m before it is projected**, so the name sits on
 *   the hill rather than at its foot.
 * - **the box is `measureText + 16` by 20**, and the tracking is real
 *   `letterSpacing`, not a spacing character. §9's U+2009 finding is about the
 *   SURROUND names, which are drawn glyph by glyph because they are tracked
 *   out by half an em; 1.5 px of `letterSpacing` on a 12.5 px serif is a
 *   property the platform applies to the string it measures, so measure and
 *   draw cannot disagree.
 * - **THE MARGIN IS THE LABEL'S OWN HALF-WIDTH**, which is the whole of Block
 *   R's finding: a constant 46 px is about right for one name on one viewport
 *   and wrong everywhere else, because a name does not scale with the frame.
 *   BAYVIEW HUNTERS POINT measures 210 px at any viewport, so at 390 px its
 *   anchor could sit inside a 46 px margin and the word still run 59 px past
 *   the edge — measured, on `film/shots/r-p390c-07-hetch-hetchy.png`, with
 *   BAYVIEW HUNTERS POIN and OUTER RICHMOND both cut. **A name that does not
 *   fit is not written.**
 * - **the halo is drawn for the whole string and the ink second**, lineWidth 4.
 *
 * One clause is this port's and is declared: the frame the margin is measured
 * against is the VISIBLE STRIP, not the canvas. At 820 CSS px and above the
 * 288 px ledger is an opaque panel over the canvas's right edge, so a name
 * written under it is not a name the reader has. The reference reads the same
 * quantity off `cv.clientWidth`; a `Frame` carries no DOM node, so it is
 * derived from `f.W` on the ledger's own two published numbers instead.
 *
 * **There is no ink budget on this pass and that is deliberate**, exactly as
 * §9 records: `HOOD_INK` is the number the place lanes are measured in, the
 * two layers share this collision grid so neither can be written over the
 * other, and putting a budget on the hood pass is a change to what the
 * explorer has always drawn rather than a port of it.
 */
export function drawHoodNames(
  f: Frame,
  hoods: readonly HoodAnchor[],
  grid: LabelGrid,
  elev: (x: number, y: number) => number,
): number {
  const { ctx, W, H, cam } = f;
  const step = bandOfScale(cam);
  if (step >= 2) return 0;
  /* ── THE STRIP IS NOT CENTRED ON THE CANVAS, AND THIS TESTED AS IF IT WERE ──
     `camera.strip()` states the geometry in one line — *"the strip centre sits
     left of canvas centre"* — because `.fx-city-ledger` is `right: 0`. This
     pass took the strip's WIDTH (`vw = W - 288`) and tested it against the
     CANVAS's centre (`W/2`), which is a 144 px margin on the wrong axis of
     symmetry. The admitted band came out `[144 + bw/2, 1056 - bw/2]`, so the
     pass simultaneously
       - **threw away the leftmost 144 px of visible map**, where nothing is
         covering anything, and
       - **wrote names between 912 and 1056** — under the opaque ledger, where
         no reader has them, and each one took a box out of the shared
         collision grid that a visible name could have had.
     The reference has no such clause at all: `part3.html` L7012 is
     `HX = Math.min(W, VW)/2` off `cv.clientWidth`, and in the mock the canvas
     IS the visible strip. The clause is this port's, it is real — production's
     ledger genuinely sits on the canvas — and it belongs on the strip's own
     centre. The strip is `[0, vw]`, so the test is simply "the whole box is
     inside it". */
  const vw = W < LEDGER_MIN_W ? W : W - LEDGER_W;
  const HX = vw / 2,
    HY = H / 2;
  let placed = 0;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.letterSpacing = `${HOOD_TRACK_PX}px`;
  ctx.font = `600 ${HOOD_FS[step]}px ${HOOD_FACE}`;
  ctx.lineJoin = "round";
  for (const h of hoods) {
    const p = f.proj.proj(h.wx, h.wy, elev(h.wx, h.wy) + HOOD_LIFT_M);
    const X = sx(f, p),
      Y = sy(f, p);
    const t = h.name.toUpperCase();
    const bw = ctx.measureText(t).width + 16;
    if (Math.abs(X - HX) > HX - bw / 2 || Math.abs(Y - HY) > HY - 30) continue;
    const x0 = X - bw / 2,
      x1 = X + bw / 2,
      y0 = Y - 10,
      y1 = Y + 10;
    if (!grid.fits(x0, y0, x1, y1)) continue;
    grid.add(x0, y0, x1, y1);
    ctx.lineWidth = 4;
    ctx.strokeStyle = HOOD_HALO;
    ctx.strokeText(t, X, Y);
    ctx.fillStyle = HOOD_INK_FILL;
    ctx.fillText(t, X, Y);
    placed++;
  }
  ctx.letterSpacing = "0px";
  ctx.restore();
  return placed;
}
