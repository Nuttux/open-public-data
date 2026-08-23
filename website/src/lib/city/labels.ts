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

import { type Frame, sx, sy } from "./terrain";

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

// ── tracking is geometry, not a character ───────────────────────────────────

/**
 * TRACKING IS GEOMETRY, NOT A CHARACTER.
 *
 * The surround names used to be tracked out by joining the letters with U+2009
 * THIN SPACE, **and that made the width of every label a property of whichever
 * font happened to be resolved at the moment the layer was painted.**
 * MEASURED: U+2009 advances 2.0 px in JetBrains Mono and 6.0 px in the fallback
 * monospace — "MARIN COUNTY" comes out 116 px in one and 204 px in the other,
 * **76 % wider**.
 *
 * The webfont is fetched with `display=swap` and these names are baked into the
 * CACHED ground, so a layer painted before the font landed kept fallback
 * metrics; the two ground buffers are baked independently, so they could hold
 * different metrics and the cross-fade turned them into a doubled, illegible
 * label. **That is what ALCATRAZ, ANGEL ISLAND and MARIN COUNTY were doing in
 * the whole-city shot.**
 *
 * So the letters are advanced here, by a fraction of the type size, and **no
 * spacing character is involved.** The shell must additionally drop the ground
 * cache when `document.fonts.ready` settles, so nothing painted early can
 * survive to be cross-faded against something painted late — that half belongs
 * to P4 and is stated here because this is where the bug shows.
 */
export const NAME_TRACK = 0.46;

/**
 * How much of the bottom of the frame a surround name may not be written in.
 * 24 px is just the halo. The FILM raises it to clear its copy plate; nothing
 * else writes to it.
 */
export let NAME_BOT = 24;
export function setNameBot(px: number | null): void {
  NAME_BOT = px == null || !(px > 24) ? 24 : px;
}

export function trackedWidth(
  ctx: CanvasRenderingContext2D,
  s: string,
  size: number,
): number {
  const gap = size * NAME_TRACK;
  let w = -gap;
  for (let i = 0; i < s.length; i++) w += ctx.measureText(s[i]).width + gap;
  return w;
}

/**
 * Every halo first, then every letter — **one letter's halo laid over the
 * previous letter's ink is exactly what makes tracked-out type look chewed.**
 */
export function trackedText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
): void {
  const gap = size * NAME_TRACK;
  const adv: number[] = [];
  let w = -gap;
  for (let i = 0; i < s.length; i++) {
    const a = ctx.measureText(s[i]).width;
    adv.push(a);
    w += a + gap;
  }
  const x0 = x - w / 2;
  let cx = x0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== " ") ctx.strokeText(s[i], cx, y);
    cx += adv[i] + gap;
  }
  cx = x0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== " ") ctx.fillText(s[i], cx, y);
    cx += adv[i] + gap;
  }
}

/**
 * THE MARGIN IS THE NAME'S OWN HALF-WIDTH.
 *
 * `trackedText` centres on x, so a 40 px constant is a margin for a name 80 px
 * wide. SAN MATEO COUNTY tracks out to 151 px at size 10 and MARIN COUNTY to
 * 116, so on any frame narrow enough for their anchors to sit inside 40 px of
 * the edge **they were written straight off it**.
 */
export function nameFitsFrame(
  x: number,
  y: number,
  textW: number,
  W: number,
  H: number,
): boolean {
  return !(x - textW / 2 < 6 || x + textW / 2 > W - 6 || y < 24 || y > H - NAME_BOT);
}

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
export const MK_MARK_PX = 13;

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
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of places) {
    if (p.year !== undefined && f.year !== undefined && f.year < p.year) continue;
    if (p.cls === "named" && !placeIsBigEnough(p.spanM, cam.scale)) continue;
    const rank = p.cls === "designated" ? 0 : 1;
    const size = 11 * LB_SIZE[rank];
    ctx.font = `${LB_WT[rank]} ${size}px "JetBrains Mono",ui-monospace,monospace`;
    const tw = ctx.measureText(p.name).width;
    const th = size * 1.25;
    const pr = f.proj.proj(p.wx, p.wy, elev(p.wx, p.wy));
    const X = sx(f, pr),
      Y = sy(f, pr) - (p.cls === "designated" ? MK_MARK_PX : 0);
    if (!nameFitsFrame(X, Y, tw, W, H)) continue;
    const x0 = X - tw / 2 - 2,
      x1 = X + tw / 2 + 2,
      y0 = Y - th / 2,
      y1 = Y + th / 2;
    if (!grid.fits(x0, y0, x1, y1)) continue;
    // the budget is EXACT: admit only if the box fits in what is left
    if (!budgets[p.cls].spend(x1 - x0, y1 - y0)) continue;
    grid.add(x0, y0, x1, y1);
    if (p.cls === "designated") {
      ctx.fillStyle = "rgba(252,251,246,.86)";
      ctx.beginPath();
      ctx.arc(X, Y + MK_MARK_PX, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LB_INK[0];
      ctx.beginPath();
      ctx.arc(X, Y + MK_MARK_PX, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 3.2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(252,251,246,.86)";
    ctx.strokeText(p.name, X, Y);
    ctx.fillStyle = LB_INK[rank];
    ctx.fillText(p.name, X, Y);
    placed++;
    byClass[rank]++;
    spans.push(p.spanM);
  }
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
