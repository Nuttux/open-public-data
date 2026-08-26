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

import type { PlaceKind } from "./place-kinds.generated";
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
 * THE FILM WRITES FEWER STREET NAMES, AND THIS IS THE THIRD THING TRIED.
 *
 * The 1936 frame carried **29 names, 26 of them neighbourhoods** over the two
 * bridges it is about (`.parity/m1lab.py`, probed — not counted off a
 * screenshot). Three attempts, each measured, and the first two were wrong in
 * ways worth keeping:
 *
 * 1. **Cap the hood lane at ten.** The frame came back with the same number of
 *    labels on it: GEARY BLVD, DIVISADERO, GOUGH, FRANKLIN, STANYAN, GUERRERO,
 *    18TH AVE, ALEMANY, SILVER, GENEVA. The lanes share a collision grid and
 *    each spends to its own limit, so shortening one lane hands the frame to
 *    the next one. **The source is not what fills the frame.**
 * 2. **Order that cap by published area, then by distance from frame centre.**
 *    Area keeps BAYVIEW HUNTERS POINT, LAKESHORE, EXCELSIOR, SUNSET/PARKSIDE —
 *    *the largest neighbourhoods in San Francisco are its emptiest*. Distance
 *    from centre keeps GLEN PARK, NOE VALLEY, TWIN PEAKS, because shot 4's
 *    camera is the whole-city fit and its centre is the middle of the
 *    peninsula. Both drop MARINA, PACIFIC HEIGHTS, MISSION and FINANCIAL
 *    DISTRICT off a shot about downtown. **The collision grid's own ordering
 *    beat every cap I could justify**, so the hood lane is left alone.
 * 3. **This.** The lane that is genuinely noise on a wide historical frame is
 *    the STREET lane — SILVER AVE, GENEVA AVE, ALEMANY BLVD, 18TH AVE — and it
 *    already has a published priority: `spineOf` then `labelOrder`, rank and
 *    length. So the film only SHORTENS that list; which names survive is the
 *    street table's own order and not a judgement made here.
 *
 * `null` is the explorer, where a reader is looking things up and wants every
 * name the frame can hold. The film is watched rather than read, and its text
 * is the plate.
 */
export const STREET_NAME_CAP: { film: number | null } = { film: null };

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

/**
 * **THE REFERENCE DELETED THIS AND THE REASON IS WORTH KEEPING.**
 *
 * `LOCAL_SHARE` protected the REMAINDER of a *count* from the alleys once the
 * arterials had refused it. `part3.html` L7050 removes it in the same edit that
 * makes the budget ink rather than a count: *"the pass runs in the city's own
 * published class order, so the arterials have first refusal by construction
 * and there is no remainder to protect."* `StreetNamePass` does not read it;
 * it is exported because it is the number that used to be here and a reader
 * who greps for it should find the argument rather than nothing.
 */
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

// ── §KINDMARK: the mark says WHAT KIND OF THING the place is ────────────────

/**
 * A CHURCH SHOULD READ AS A CHURCH, A PIER AS A PIER, A PARK AS A PARK — AND
 * THE RECORD PAYS FOR ABOUT THREE FIFTHS OF THAT.
 *
 * Daniel: *"make sure every landmark or place that's named on the map has its
 * unique render."* Measured before it was built (DRAW.md §40.1, and re-checked
 * against the publishers' own column lists rather than inherited):
 *
 * > **684 of 2,199 named places — 31.1 % — come from Article 10 and Article
 * > 11, which publish a name and a status and NO KIND.** Article 10's columns
 * > are `name, apn, address, landmarkno, yeardesignated, designationdocument,
 * > photo, pimlink`; Article 11's only category is a rating, A/B/C/D. Nothing
 * > in either says what the place is.
 *
 * Where a kind does exist it is three heterogeneous fields — an owner
 * (`nc68-ngbr department_name`), a facility type (`ib5c-xgwu`), a property type
 * (`gtr9-ntp6`) — plus an occupancy, an entity type and a POPOS type. Joined
 * and mapped by `pipeline/scripts/us_sf_places/place_kinds.py`, **1,342 of
 * 2,199 places carry a family**; the rest keep the plain treatment.
 *
 * **AND CHURCHES ARE NOT AMONG THEM, WHICH IS THE HONEST HALF OF THE ANSWER.**
 * The City publishes *property* and it does not own churches, so Grace
 * Cathedral, Sts Peter and Paul, Old St Mary's and Mission Dolores reach this
 * map only through Article 10. USGS GNIS was the obvious escape — its feature
 * classes used to include `Church` — and the file in this pipeline's own cache
 * was decoded to check: **222 rows in San Francisco County and not one
 * man-made structure class left in the vocabulary.** A church keeps the plain
 * designated mark until a source outside the City's property registers is
 * added, and no glyph is guessed from a name.
 *
 * WHAT THE TWO MARKS MEAN, KEPT APART. The **diamond** is Article 10: the City
 * has DESIGNATED this a landmark. That is a status, it is what that register
 * publishes, and it does not change. The **family glyph** is a kind of thing,
 * it runs in the un-designated lane, and it is drawn only where a register
 * published one. A place that is both would be saying two things; no place is,
 * because the register that designates is the register with no kind.
 *
 * THE VOCABULARY IS SHORT BECAUSE THE BOX IS 8.4 px. Two silhouettes that
 * differ by less than a pixel are one silhouette, so `Basketball Court`,
 * `Tennis Court`, `Handball/Racquetball Court`, `Disc Golf` and `Archery
 * Field` are five published values and one glyph. The families are listed in
 * `place-kinds.generated.ts`, in the order the chunk's `kind` column indexes
 * them.
 */
export const GLYPH_R = MK_MARK_PX;

/** the paper the glyph is set on — the same halo the names carry */
export const GLYPH_HALO_W = 2.4;

/** css px between the glyph and the first letter of the name after it */
export const GLYPH_LEAD = 3.6;

/**
 * One family glyph, centred on `X, Y`, drawn `2 * r` across.
 *
 * TWO PASSES, SILHOUETTE THEN CUT, and that is what makes it read at 8 px. A
 * halo stroked around a shape with internal detail closes the detail up; so
 * the dark shape is a single closed silhouette carrying the halo, and anything
 * inside it — a window band, a spine, a paving joint — is CUT back out in the
 * halo colour on top. The result is a black pictograph with light detail
 * rather than a blob.
 */
export function placeGlyph(
  ctx: CanvasRenderingContext2D,
  kind: PlaceKind,
  X: number,
  Y: number,
  r: number,
): void {
  const gx = (u: number) => X + u * r;
  const gy = (u: number) => Y + u * r;
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.moveTo(gx(x0), gy(y0));
    ctx.lineTo(gx(x1), gy(y0));
    ctx.lineTo(gx(x1), gy(y1));
    ctx.lineTo(gx(x0), gy(y1));
    ctx.closePath();
  };
  const disc = (cx: number, cy: number, rr: number) => {
    ctx.moveTo(gx(cx + rr), gy(cy));
    ctx.arc(gx(cx), gy(cy), rr * r, 0, Math.PI * 2);
    ctx.closePath();
  };
  const poly = (pts: readonly (readonly [number, number])[]) => {
    ctx.moveTo(gx(pts[0][0]), gy(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(gx(pts[i][0]), gy(pts[i][1]));
    ctx.closePath();
  };

  ctx.beginPath();
  switch (kind) {
    case "park":                                   // a tree
      disc(0, -0.3, 0.72);
      box(-0.17, 0.1, 0.17, 1.0);
      break;
    case "garden":                                 // shoots in a bed
      box(-1, 0.58, 1, 1.0);
      box(-0.72, -0.62, -0.44, 0.58);
      box(-0.14, -0.88, 0.14, 0.58);
      box(0.44, -0.62, 0.72, 0.58);
      break;
    case "plaza":                                  // a paved square
      box(-0.88, -0.88, 0.88, 0.88);
      break;
    case "water":
      /* A BODY WITH A SCALLOPED TOP, NOT TWO FREE WAVES. Two 1 px ribbons with
         a 0.7 px gap between them is one grey smudge at this size; a solid
         shape whose only detail is its top edge keeps a silhouette. It also
         keeps every control point inside the box, which `place-kinds.test.ts`
         asserts for every glyph — a Bezier hull that leaves the box is a glyph
         whose label width is a lie. */
      ctx.moveTo(gx(-0.95), gy(0.05));
      ctx.quadraticCurveTo(gx(-0.6), gy(-0.45), gx(-0.25), gy(0.05));
      ctx.quadraticCurveTo(gx(0.1), gy(0.55), gx(0.45), gy(0.05));
      ctx.quadraticCurveTo(gx(0.7), gy(-0.32), gx(0.95), gy(0.05));
      ctx.lineTo(gx(0.95), gy(0.92));
      ctx.lineTo(gx(-0.95), gy(0.92));
      ctx.closePath();
      break;
    case "sport":                                  // a ball
      disc(0, 0, 0.86);
      break;
    case "library":                                // an open book
      poly([[-0.95, -0.45], [0, -0.75], [0.95, -0.45], [0.95, 0.6], [0, 0.9], [-0.95, 0.6]]);
      break;
    case "school":                                 // a pennant
      box(-0.78, -1.0, -0.52, 1.0);
      poly([[-0.52, -0.92], [0.88, -0.44], [-0.52, 0.04]]);
      break;
    case "fire":                                   // a flame
      ctx.moveTo(gx(0), gy(-1.0));
      ctx.bezierCurveTo(gx(0.72), gy(-0.3), gx(0.66), gy(0.28), gx(0.4), gy(0.62));
      ctx.bezierCurveTo(gx(0.2), gy(0.9), gx(-0.2), gy(0.9), gx(-0.4), gy(0.62));
      ctx.bezierCurveTo(gx(-0.66), gy(0.28), gx(-0.5), gy(-0.2), gx(0), gy(-1.0));
      ctx.closePath();
      break;
    case "police": {                               // a star
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? 1.0 : 0.44;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      poly(pts);
      break;
    }
    case "transit":                                // a tram, head-on
      poly([[-0.72, 0.78], [-0.72, -0.62], [-0.5, -0.88], [0.5, -0.88], [0.72, -0.62], [0.72, 0.78]]);
      box(-0.6, 0.78, -0.28, 1.0);
      box(0.28, 0.78, 0.6, 1.0);
      break;
    case "port":                                   // an anchor
      box(-0.14, -0.9, 0.14, 0.72);
      box(-0.72, -0.5, 0.72, -0.24);
      ctx.moveTo(gx(-0.92), gy(0.14));
      ctx.quadraticCurveTo(gx(-0.82), gy(0.98), gx(0), gy(0.98));
      ctx.quadraticCurveTo(gx(0.82), gy(0.98), gx(0.92), gy(0.14));
      ctx.lineTo(gx(0.62), gy(0.14));
      ctx.quadraticCurveTo(gx(0.55), gy(0.66), gx(0), gy(0.66));
      ctx.quadraticCurveTo(gx(-0.55), gy(0.66), gx(-0.62), gy(0.14));
      ctx.closePath();
      break;
    case "health":                                 // a cross
      box(-0.3, -0.95, 0.3, 0.95);
      box(-0.95, -0.3, 0.95, 0.3);
      break;
    case "arts":                                   // a figure on a plinth
      box(-0.92, 0.64, 0.92, 1.0);
      box(-0.34, 0.1, 0.34, 0.64);
      poly([[-0.34, 0.1], [-0.18, -0.36], [0.18, -0.36], [0.34, 0.1]]);
      disc(0, -0.62, 0.3);
      break;
    case "civic":                                  // a pediment on columns
      poly([[-1.0, -0.16], [0, -0.96], [1.0, -0.16]]);
      box(-1.0, -0.16, 1.0, 0.04);
      box(-0.7, 0.04, -0.42, 0.74);
      box(-0.14, 0.04, 0.14, 0.74);
      box(0.42, 0.04, 0.7, 0.74);
      box(-1.0, 0.74, 1.0, 1.0);
      break;
    case "works":                                  // a cog
      disc(0, 0, 0.66);
      box(-0.18, -1.0, 0.18, 1.0);
      box(-1.0, -0.18, 1.0, 0.18);
      break;
    case "home":                                   // a house
      poly([[-0.98, -0.1], [0, -0.96], [0.98, -0.1]]);
      box(-0.74, -0.1, 0.74, 0.96);
      break;
    case "hotel":                                  // a bed
      box(-0.96, -0.6, -0.68, 0.86);
      box(-0.96, 0.2, 0.96, 0.62);
      poly([[-0.62, 0.2], [-0.62, -0.06], [-0.14, -0.06], [-0.14, 0.2]]);
      break;
    case "office":                                 // a tower
      box(-0.64, -0.96, 0.64, 0.96);
      break;
  }
  ctx.lineJoin = "round";
  ctx.lineWidth = GLYPH_HALO_W;
  ctx.strokeStyle = PLACE_HALO;
  ctx.stroke();
  ctx.fillStyle = MK_INK;
  ctx.fill();

  // ── the cut: what is taken back OUT of the silhouette, in the paper ──
  ctx.beginPath();
  let cut = true;
  switch (kind) {
    case "plaza":                                  // the paving joints
      box(-0.1, -0.88, 0.1, 0.88);
      box(-0.88, -0.1, 0.88, 0.1);
      break;
    case "sport":                                  // the seams
      box(-0.1, -0.86, 0.1, 0.86);
      box(-0.86, -0.1, 0.86, 0.1);
      break;
    case "library":                                // the spine
      box(-0.09, -0.75, 0.09, 0.9);
      break;
    case "transit":                                // the window band
      box(-0.46, -0.62, 0.46, -0.14);
      box(-0.46, 0.16, 0.46, 0.34);
      break;
    case "works":                                  // the bore
      disc(0, 0, 0.22);
      break;
    case "home":                                   // the door
      box(-0.2, 0.3, 0.2, 0.96);
      break;
    case "office":                                 // the window rows
      for (const y0 of [-0.66, -0.16, 0.34]) {
        box(-0.4, y0, -0.08, y0 + 0.26);
        box(0.08, y0, 0.4, y0 + 0.26);
      }
      break;
    default:
      cut = false;
  }
  if (cut) {
    ctx.fillStyle = PLACE_HALO;
    ctx.fill();
  }
}

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
  /**
   * The year it can first be named, or undefined for every year.
   *
   * ── §NOYEAR: 65535 IS NOT A YEAR, AND THAT IS THE POINT ─────────────────
   *
   * `base/marks.json` ships `yr = 65535` for a label **no published field
   * dates**, and this gate then does the right thing with it unchanged: on a
   * dated frame `f.year < 65535` is always true so the name is held, and on the
   * un-clocked map — which is where the page lands, `renderer.year` stays
   * `undefined` until the rail is touched or the film runs — the gate does not
   * apply and the name is written.
   *
   * WHY, and it is the largest single correction this layer has taken. **934 of
   * 2,199 labels used to assert they existed in 1906 or earlier**: 399 carried
   * year 0, which this pass reads as *every year*, and 326 carried exactly
   * 1906, which is `SCRUB_MIN` — the map's own floor and `build_bldg.py`'s
   * `FLAG_NOYEAR` fallback — not a date any publisher wrote. So the frame said
   * *Palace Of Fine Arts* (built for the 1915 Exposition), *San Francisco Zoo*
   * (1929), *Opera House* (1932) and *Sigmund Stern Recreation Grove* (the land
   * was given in 1931) over 1906 dune, and one of the film's own shots is about
   * the Palace of Fine Arts surviving 1915.
   *
   * **A shape may be undated on this map and a NAME may not.** The undated
   * street trees, the canopy and the 2,916 undated footprints are all declared,
   * counted and drawn in every year (`time.ts`) — because a shape asserts
   * nothing a reader can check. A name over a dated frame is a sentence with a
   * date in it, so the treatment splits them: `parks.qc`'s polygon still draws
   * at 1906 and the name waits.
   *
   * It is narrower than "hold everything before 1907", which would delete true
   * things — the Ferry Building really is 1898 and The Old U.S. Mint 1869, both
   * off `97yj-54sx`'s own `yearbuilt`, and both still draw. What is held is a
   * year that was BORROWED from the ground under the place or DEFAULTED to the
   * floor, and `base/marks.json`'s `yb` column says which of the six bases each
   * row's year rests on. `pipeline/scripts/us_sf_places/emit_places.py` §HELD
   * and §YBASIS carry the derivation; DRAW.md §33.8b carries the evidence that
   * no published City dataset can date a park.
   */
  readonly year?: number;
  /**
   * THE FIRST YEAR THIS NAME IS NO LONGER DRAWN, or undefined where it never
   * stops. A name that carries one is drawn ONLY while the clock is inside
   * its span — on the idle map, which has no year and means today, it is not
   * drawn at all — which is every row but the handful standing on a building this
   * repository names under more than one name in turn. A building outlives its
   * occupants and this map has a clock, so the two names are two rows on one
   * footprint and this is where the earlier one ends. Set from
   * `base/marks.json`'s `yt` by `CityMap.tsx::decodeMarks`.
   */
  readonly until?: number;
  /**
   * WHAT KIND OF THING THE REGISTER SAYS IT IS — see §KINDMARK.
   *
   * Optional because **857 of the 2,199 places carry no published kind** —
   * `base/places.qc` `kind === 0`, and 2,199 − 1,342 with a family is the same
   * number from the other side. Set from `base/marks.json`'s `k` + `KIND` by
   * `CityMap.tsx::decodeMarks`, joined from six registers' own category fields
   * by `pipeline/scripts/us_sf_places/place_kinds.py`. A name is NEVER used to
   * guess a kind.
   *
   * ── AND 684 IS NOT THAT NUMBER, WHICH HID A POPULATION ───────────────────
   * This read 684 "genuinely carry no published kind, because the registers
   * that DESIGNATE a place are the registers with no category". 684 is the
   * Article 10 + Article 11 row count — 339 + 345 in `manifest.places.bySource`
   * — and §KINDMARK above uses it correctly for exactly that. Used here it is a
   * count of one thing standing in for a count of another, and the difference
   * is not rounding: **173 kindless rows come from registers that DO publish a
   * category**, which the sentence's own reasoning cannot explain and which
   * nobody was therefore looking at.
   *
   *     nc68-ngbr  95 · nps-nrhp 37 · ib5c-xgwu 33 · gtr9-ntp6 3
   *     65ik-7wqd   2 · places_extra 2 · heroes 1        = 173
   *
   * A blank category field in a register that HAS one is a gap in the source or
   * a miss in the join, and it is worth chasing; a register with no category
   * column is neither. Collapsing the two under one number made 173 rows
   * unlookable-at.
   */
  readonly kind?: PlaceKind;
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
      if (p.year !== undefined && f.year !== undefined && f.year < p.year) {
        lprobe(lane, p.name, "year", 0, 0, 0, 0);
        continue;
      }
      /* …and the closing bracket. The successor's first year IS the
         predecessor's `until`, written once in the seed, so the two names on
         one footprint hand over on the same frame and never overlap.

         NO CLOCK MEANS NOW, AND THAT IS NOT THE SAME RULE AS `year`'s. An
         idle map has `f.year === undefined`, and for the OPENING year that
         correctly draws everything — a place built in 2020 exists today. For
         the CLOSING year the same reading is backwards: a name the building
         no longer carries is exactly what today must not show. Read as
         `f.year !== undefined && …`, both names on one footprint were
         eligible on the idle map and one won the collision grid arbitrarily.
         So a name with an end is refused whenever the clock is not on a year
         inside its own span. */
      if (p.until !== undefined && (f.year === undefined || f.year >= p.until)) {
        lprobe(lane, p.name, "until", 0, 0, 0, 0);
        continue;
      }
      /* THE SIZE RULE IS THE UN-DESIGNATED LANE'S ALONE. A designated landmark
         is drawn with a mark of its own, and a mark does not shrink — which is
         what lets a nine-pixel building be named. */
      if (!des && !placeIsBigEnough(p.spanM, cam.scale)) {
        lprobe(lane, p.name, "size", 0, 0, p.spanM, 0);
        continue;
      }
      ctx.font = `${des ? 600 : 500} ${des ? fs : fs * 0.94}px ${PLACE_FACE}`;
      const tw = ctx.measureText(p.name).width;
      /* §KINDMARK. The glyph runs in the UN-DESIGNATED lane only: the diamond
         already says "the City designated this", and the register that
         designates is the register that publishes no kind, so no place is ever
         asked to say both. `p.kind` wins over the generated table so that
         the record's own column, read by `decodeMarks`. */
      const kind = des ? undefined : p.kind;
      const gw = kind ? 2 * GLYPH_R + GLYPH_LEAD : 0;
      const bw = tw + gw + (des ? 16 : 10),
        bh = fs + 5;
      const pr = f.proj.proj(p.wx, p.wy, elev(p.wx, p.wy));
      const X = sx(f, pr),
        Y = sy(f, pr);
      /* the margin is the LABEL's own half-width, and for a designated place
         the label is not centred on the mark — it sits beside it */
      const ax = des ? X + MK_LEAD + tw / 2 : X;
      if (!nameFitsFrame(ax, Y, bw, W, H)) {
        lprobe(lane, p.name, "frame", ax, Y, bw, bh);
        continue;
      }
      const x0 = ax - bw / 2,
        x1 = ax + bw / 2,
        y0 = Y - bh / 2,
        y1 = Y + bh / 2;
      if (!grid.fits(x0, y0, x1, y1)) {
        lprobe(lane, p.name, "grid", ax, Y, bw, bh);
        continue;
      }
      // the budget is EXACT: admit only if the box fits in what is left
      if (!budgets[lane].spend(bw, bh)) {
        lprobe(lane, p.name, "ink", ax, Y, bw, bh);
        continue;
      }
      lprobe(lane, p.name, "-", ax, Y, bw, bh);
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
      } else if (kind) {
        /* THE GROUP IS CENTRED ON THE PLACE, NOT THE NAME. The un-designated
           name is written across the thing it names — that is the whole point
           of the size gate — so the glyph and the name are centred together
           and the anchor stays where it was. */
        const half = (gw + tw) / 2;
        placeGlyph(ctx, kind, X - half + GLYPH_R, Y, GLYPH_R);
        ctx.textAlign = "left";
        ctx.font = `500 ${fs * 0.94}px ${PLACE_FACE}`;
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = PLACE_HALO;
        ctx.strokeText(p.name, X - half + gw, Y);
        ctx.fillStyle = LB_INK[1];
        ctx.fillText(p.name, X - half + gw, Y);
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
  nameOf?: (i: number) => string,
): Int32Array {
  const idx: number[] = [];
  for (let i = 0; i < cls.length; i++) if (cls[i] === 0) idx.push(i);
  idx.sort((a, b) => lengthM[b] - lengthM[a]);
  /* ONE STRETCH PER NAME, which is the half of `SPINE` this port did not have.
     `part3.html` L6679-6690 keeps a `seen` set of NAMES: Geary is 214 published
     centreline segments and 15 label stretches, and without the dedup the seven
     slots are spent on seven pieces of the same two streets. Measured on the
     shipped table: the seven that come out are GEARY BLVD, 3RD ST, MARKET ST,
     ALEMANY BLVD, MISSION ST, GREAT HWY and SAN JOSE AVE — which is the right
     answer, and it is read off the data rather than typed in. */
  if (!nameOf) return Int32Array.from(idx.slice(0, take));
  const seen = new Set<string>();
  const out: number[] = [];
  for (const i of idx) {
    const t = nameOf(i);
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(i);
    if (out.length >= take) break;
  }
  return Int32Array.from(out);
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

// ── the street names ────────────────────────────────────────────────────────

/**
 * HOW MUCH OF THE FRAME MAY BE STREET NAME — `part3.html` L6722.
 *
 * It was `streetCap` 20 / 26 / 30 by band, plus `LOCAL_SHARE` 0.45 of that for
 * every local street. Band 2 runs from z = 4.57 to the ceiling, so across the
 * whole close half of the ladder those were two constants — and they were what
 * a reader hit when they zoomed in to find out what street they were on.
 * MEASURED on the reference against the published stretches that are on screen
 * and pass the length rule:
 *
 * ```
 *   z      on screen   nameable   placed
 *   4.57         388        183       30   <- streetCap
 *   7.20         178        115       30   <- streetCap
 *   12            70         66       25   <- LOCAL_SHARE, 14 of 14
 *   20            21         20       15
 *   36             7          7        7
 * ```
 *
 * **A budget stated as a COUNT cannot scale with the frame, and it is not what
 * a frame runs out of.** What a frame runs out of is room, so the budget is the
 * label boxes' AREA as a share of the visible strip — the same unit `HOOD_INK`
 * is in. The reference measured the street ink its old code drew at 0.021 whole
 * city, 0.040-0.044 district and 0.049-0.057 block, and set 0.075 above all of
 * them.
 */
export const STREET_INK = 0.075;

/** the base type size by band, before `LB_SIZE[rank]` — `part3.html` L7091 */
export const ST_LB_FS: readonly number[] = [10.5, 11, 12];

/**
 * ONE LABEL PER NAME AT THE WIDE SHOT, two at district, three at block.
 *
 * Geary is 214 published centreline segments and 15 label stretches. Without
 * the cap the whole-city frame prints GREAT HWY twice and spends its budget on
 * one street.
 */
export const ST_LB_NAME_CAP: readonly number[] = [1, 2, 3];

/**
 * …AND THE SECOND ONE HAS TO BE SOMEWHERE ELSE.
 *
 * The Financial District came back with STOCKTON ST printed twice within 300 px
 * and FRONT ST twice within 400: two real stretches of one street, correctly
 * labelled, reading as a bug.
 */
export const NAME_APART = 260;

/** how much longer than its own label a street has to be before it is named */
export const LBL_LEN_K = 1.0;

/** the street label's paper halo — `part3.html` L7127 */
export const ST_LB_HALO = "rgba(248,244,235,.92)";

/**
 * The published street-name stretches, structurally.
 *
 * This is `CityData.streetLabels()`'s table, declared here so `labels.ts` does
 * not import the data layer: `rank` and `lengthM` are the two arguments
 * `labelOrder` and `spineOf` already take, and `dx`/`dy` are a DIRECTION, not a
 * place — they are pushed through the projection as a point and the angle taken
 * from the difference with `proj(0, 0)`, which is exact because `proj` is
 * linear in (x, y).
 */
export interface StreetNameTable {
  readonly n: number;
  readonly nm: Uint16Array;
  readonly rank: Uint8Array;
  /** the year the name is first written; 0 = written in every year */
  readonly yr: Uint16Array;
  readonly lengthM: Float32Array;
  readonly wx: Float32Array;
  readonly wy: Float32Array;
  readonly dx: Float32Array;
  readonly dy: Float32Array;
  name(i: number): string;
}

/**
 * THE SOURCE ZERO-PADS: `02ND ST`, `19TH AVE`, `03RD ST`.
 *
 * `part3.html` L7095. One leading zero, once, at a word boundary — so 3RD ST
 * comes out of the file's own `03RD ST` and nothing else in the table moves.
 */
export function streetLabelText(published: string): string {
  return published.replace(/\b0(\d)/, "$1");
}

/**
 * `UNNAMED 064` IS NOT A NAME, IT IS THE REGISTER SAYING THERE ISN'T ONE.
 *
 * **84 of the 2,473 published street names in `base/street-labels` match
 * this** — DataSF's centreline file gives an unnamed stretch a placeholder of
 * the form `UNNAMED nnn` so that every row has a key. Written on the map it
 * reads as the street's name, and `out-m1d/at-t35952.png` is UNNAMED 64 set in
 * the same face as GEARY BLVD across the Presidio, on the film's most
 * beautiful frame.
 *
 * This is not a film rule; the explorer was writing them too.
 */
const UNNAMED = /^UNNAMED\b/i;

export function isPlaceholderStreetName(published: string): boolean {
  return UNNAMED.test(published);
}

/**
 * THE STREET NAMES, WHICH 2,786 PUBLISHED STRETCHES WERE WAITING FOR.
 *
 * `part3.html`'s `street()` (L7069-7130), whole, as one object because **the
 * pass is split in three and the three share state.** The reference's order is
 *
 * ```
 *   placeNames(designated) → SPINE → hoods() → the arterials
 *                          → placeNames(named) → the collectors and locals
 * ```
 *
 * and the ink, the per-name cap and the 260 px separation are one running
 * account across all three of those calls. A function taking a `pass` argument
 * would have to be handed that account back every time; an object holds it, and
 * the call site stays three lines.
 *
 * Every clause below is the reference's:
 *
 * - **the rank gate is the band's.** `rankMax` is 0 at whole city, 1 at
 *   district, 2 at block — the same ladder `base/street-labels` (ranks 0-1) and
 *   `strt/street-labels-2` are split on, which is why the base tier can draw
 *   the whole-city frame's names before the `strt` tier lands.
 * - **the treatment is the class**, three of them, ~30 % apart in size and
 *   better than 40 % apart in value: an arterial is set larger, heavier and
 *   darker than a local street, *"so a reader who is looking for somewhere to
 *   rest their eye has somewhere to rest it."* Ranks 3-5 (private courts,
 *   freeways, ramps) share the local treatment and are almost always gated out
 *   by `rankMax` before they reach it.
 * - **a name is not written before the street is there.** `yr` is the earliest
 *   year any centreline in this label's own stretch can be put there; 0 is
 *   written in every year.
 * - **the orientation is pushed through the projection**, not taken from the
 *   world bearing, so the label lies ON its street rather than across it.
 * - **A NAME IS ONLY WRITTEN WHERE THE STREET IS AT LEAST AS LONG AS THE
 *   NAME** — `nameFitsItsStreet`, the one rule that replaced `minLen`'s three
 *   magic numbers.
 * - **the collision box is the rotated envelope and the INK IS THE LABEL'S OWN
 *   BOX.** San Francisco's grid runs at 45° to the screen at ROT 315, so nearly
 *   every street name is set on a diagonal and its axis-aligned envelope is
 *   ~3.9x its own area. Spending the envelope emptied the budget after
 *   seventeen arterials and the frame came back with no collector and no local
 *   on it at all — measured on the reference's first build of this patch.
 *
 * TWO CLAUSES ARE THIS PORT'S AND BOTH ARE DECLARED:
 *
 * 1. **The frame is the VISIBLE STRIP and it is centred on itself.** The
 *    reference reads `cv.clientWidth` and in the mock the canvas IS the strip,
 *    so it tests against `W / 2`. Production paints a 288 px opaque ledger over
 *    the canvas's right edge at and above 820 CSS px, so a name written under it
 *    is not a name the reader has — and §16.4 already found what happens when a
 *    pass takes the strip's WIDTH and tests it against the CANVAS's centre. The
 *    strip is `[0, vw]`; the test is that the whole box is inside it.
 * 2. **`LB_INK` is applied, and the reference does not apply it.** `part3.html`
 *    L6723 defines `LB_INK = [.90, .74, .54]` beside `LB_SIZE` and `LB_WT` and
 *    then fills every rank at `rgba(38,30,16,.84)` — grep it: two occurrences in
 *    the whole file, its definition and this note. Size and weight carry the
 *    hierarchy there and value does not. Applying it is a deviation of at most
 *    0.06 alpha on the wide shot (rank 0 only, .90 against .84) and up to 0.30
 *    on the block frame, where a local street name is the thing that should be
 *    quietest. It is kept because it is the treatment this port's own §9 states,
 *    and it is written here rather than left to be discovered.
 */
export class StreetNamePass {
  readonly budget: InkBudget;
  private readonly order: Int32Array;
  private readonly spine: Set<number>;
  private readonly step: number;
  private readonly rankMax: number;
  private readonly nameCap: number;
  private readonly hx: number;
  private readonly hy: number;
  private readonly used = new Map<string, number>();
  private readonly at = new Map<string, [number, number][]>();
  private readonly rank3: [number, number, number] = [0, 0, 0];
  private nPlaced = 0;
  private full = false;

  constructor(
    private readonly f: Frame,
    private readonly table: StreetNameTable,
    private readonly grid: LabelGrid,
    private readonly elev: (x: number, y: number) => number,
  ) {
    const { W, H, cam } = f;
    this.step = bandOfScale(cam);
    this.rankMax = this.step;
    this.nameCap = ST_LB_NAME_CAP[this.step];
    const vw = W < LEDGER_MIN_W ? W : W - LEDGER_W;
    this.hx = vw / 2;
    this.hy = H / 2;
    this.budget = new InkBudget(STREET_INK, Math.max(1, vw) * H);
    this.order = labelOrder(table.rank, table.lengthM);
    /* SEVEN, ONE PER NAME, LONGEST FIRST — and it is read off the data. There
       is no list of important streets here and there must never be one. */
    this.spine = new Set(
      Array.from(spineOf(table.rank, table.lengthM, 7, (i) => table.name(i))),
    );
  }

  get placed(): number {
    return this.nPlaced;
  }

  /** placed this frame by class, so the hierarchy is a number and not an impression */
  get byRank(): readonly [number, number, number] {
    return this.rank3;
  }

  /** the fraction of the visible strip this layer spent */
  get ink(): number {
    return this.budget.spent;
  }

  /**
   * One of the three sub-passes, in the reference's own order.
   *
   * `spine` — the seven longest rank-0 stretches, one per name, before the
   * neighbourhood capitals. `arterials` — the rest of rank 0, in class-and-
   * length order. `local` — everything above rank 0, after the named places.
   */
  draw(pass: "spine" | "arterials" | "local"): number {
    const before = this.nPlaced;
    const { ctx } = this.f;
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.letterSpacing = "0px";
    ctx.lineJoin = "round";
    if (pass === "spine") {
      for (const li of this.spine) if (!this.one(li)) break;
    } else {
      const wantLocal = pass === "local";
      for (let o = 0; o < this.order.length; o++) {
        const li = this.order[o];
        if (this.spine.has(li)) continue;
        if (this.table.rank[li] > 0 !== wantLocal) continue;
        if (!this.one(li)) break;
      }
    }
    ctx.restore();
    return this.nPlaced - before;
  }

  /** false once the budget has refused a label — the reference's own `return` */
  private one(li: number): boolean {
    /* ── §LPROBE, AND THIS PASS WAS INVISIBLE TO IT ────────────────────
       `lprobe` was called from the place lane and the hood lane and from
       NOWHERE IN HERE, so every count ever taken off the instrument was the
       two named-place lanes only and undercounted the frame by the whole
       street lane. FILM.md §21.3 drew two conclusions from such a count and
       had to correct both of them in the same section. The reasons below are
       this pass's own gates, in the order it applies them; `frame`, `grid`
       and `ink` keep the shared vocabulary so the three lanes' rows can be
       counted together. */
    const nm = (why: string, x = 0, y = 0, bw = 0, bh = 0): void => {
      lprobe("street", this.table.name(li) || `#${li}`, why, x, y, bw, bh);
    };
    if (this.full) { nm("full"); return false; }
    /* §STREET_NAME_CAP — the film's shortening, applied where the pass already
       gives up, so it behaves exactly like the budget refusing a label. */
    const cap = STREET_NAME_CAP.film;
    if (cap !== null && this.nPlaced >= cap) { nm("cap"); return false; }
    const { f, table } = this;
    const { ctx, cam } = f;
    if (table.rank[li] > this.rankMax) { nm("rank"); return true; }
    const y0 = table.yr[li];
    if (y0 && f.year !== undefined && y0 > Math.floor(f.year)) { nm("year"); return true; }
    const t0 = table.name(li);
    if (!t0) { nm("noname"); return true; }
    /* §isPlaceholderStreetName — 84 of 2,473 */
    if (isPlaceholderStreetName(t0)) { nm("placeholder"); return true; }
    if ((this.used.get(t0) ?? 0) >= this.nameCap) { nm("dupe"); return true; }
    /* 0 arterial, 1 collector, 2 everything local */
    const rk = table.rank[li] <= 0 ? 0 : table.rank[li] === 1 ? 1 : 2;
    const wx = table.wx[li],
      wy = table.wy[li];
    const p = f.proj.proj(wx, wy, this.elev(wx, wy));
    const X = sx(f, p),
      Y = sy(f, p);
    if (Math.abs(X - this.hx) > this.hx - 24) { nm("frame", X, Y); return true; }
    if (Math.abs(Y - this.hy) > this.hy - 26) { nm("frame", X, Y); return true; }
    const fs = ST_LB_FS[this.step] * LB_SIZE[rk];
    /* the SAME face the place lane is set in — `part3.html` writes the string
       out twice and this file holds one copy of it, which is why the constant
       reads PLACE_FACE here */
    ctx.font = `${LB_WT[rk]} ${fs}px ${PLACE_FACE}`;
    const t = streetLabelText(t0);
    const w = ctx.measureText(t).width + 6,
      h = fs + 4;
    if (!nameFitsItsStreet(table.lengthM[li], w * LBL_LEN_K, cam.scale)) {
      nm("short", X, Y, w, h);
      return true;
    }
    const ang = streetLabelAngle(f, 0, 0, table.dx[li], table.dy[li]);
    const ca = Math.abs(Math.cos(ang)),
      sa = Math.abs(Math.sin(ang));
    const ww = w * ca + h * sa,
      hh = w * sa + h * ca;
    const prev = this.at.get(t0);
    if (prev) {
      for (const q of prev)
        if (Math.abs(q[0] - X) < NAME_APART && Math.abs(q[1] - Y) < NAME_APART) {
          nm("apart", X, Y, ww, hh);
          return true;
        }
    }
    const x0 = X - ww / 2,
      x1 = X + ww / 2,
      yy0 = Y - hh / 2,
      yy1 = Y + hh / 2;
    if (!this.grid.fits(x0, yy0, x1, yy1)) { nm("grid", X, Y, ww, hh); return true; }
    /* THE BUDGET IS EXACT and it spends THE LABEL'S OWN BOX, not the envelope
       the collision grid uses. A refusal stops the pass, which is the
       reference's `if (inkUsed >= inkCap) return` said one label earlier. */
    if (!this.budget.spend(w, h)) {
      nm("ink", X, Y, ww, hh);
      this.full = true;
      return false;
    }
    this.grid.add(x0, yy0, x1, yy1);
    this.used.set(t0, (this.used.get(t0) ?? 0) + 1);
    if (prev) prev.push([X, Y]);
    else this.at.set(t0, [[X, Y]]);
    this.nPlaced++;
    this.rank3[rk]++;
    nm("-", X, Y, ww, hh);
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(ang);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = ST_LB_HALO;
    ctx.strokeText(t, 0, 0);
    ctx.fillStyle = LB_INK[rk];
    ctx.fillText(t, 0, 0);
    ctx.restore();
    return true;
  }
}

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
    if (Math.abs(X - HX) > HX - bw / 2 || Math.abs(Y - HY) > HY - 30) {
      lprobe("hood", t, "frame", X, Y, bw, 20);
      continue;
    }
    const x0 = X - bw / 2,
      x1 = X + bw / 2,
      y0 = Y - 10,
      y1 = Y + 10;
    if (!grid.fits(x0, y0, x1, y1)) {
      lprobe("hood", t, "grid", X, Y, bw, 20);
      continue;
    }
    lprobe("hood", t, "-", X, Y, bw, 20);
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

// ── §LPROBE: one row per name considered, and the reason it was not written ──

/**
 * WHY A NAME IS NOT ON THE FRAME IS A COUNT, NOT AN ARGUMENT.
 *
 * `terrain.ts` §GPROBE's pattern, and for its reason: three lanes share one
 * collision grid and two of them share an exact ink budget, so *"GOLDEN GATE
 * PARK loses to GEARY BLVD"* is a claim about a sequence of `grid.fits` calls
 * inside one frame and cannot be settled by reading either function. This
 * records, per lane, every name the pass looked at and the first gate that
 * turned it away.
 *
 * The reasons, in the order the passes apply them:
 *
 * | `why`   | the gate |
 * |---|---|
 * | `year`  | `f.year` is before the year the register lets it be written |
 * | `size`  | `placeIsBigEnough` — the un-designated lane's alone |
 * | `frame` | the box does not fit inside the visible strip |
 * | `grid`  | something already on the shared grid overlaps the box |
 * | `ink`   | the box does not fit in what is left of this lane's budget |
 * | `-`     | written |
 *
 * The STREET lane has six gates of its own before it reaches those, and it was
 * **calling none of this** until FILM.md §23.6 — so every count ever taken off
 * this instrument was the place and hood lanes only, and undercounted the
 * frame by the largest lane on it:
 *
 * | `why`   | the gate, street lane |
 * |---|---|
 * | `full` / `cap` | the pass has already stopped, or `STREET_NAME_CAP` has |
 * | `rank`  | the segment's class is above what this zoom writes |
 * | `noname` / `placeholder` | no name, or `UNNAMED nn` — 84 of 2,473 |
 * | `dupe`  | this name is already written `nameCap` times |
 * | `short` | `nameFitsItsStreet` — the street is shorter than its own name |
 * | `apart` | the same name is already written within `NAME_APART` |
 *
 * Off by default, dev only, parked on `globalThis.__cityLPROBE` so a harness
 * switches it on through the renderer hook and reads it back with no source
 * edit. Capped, like GPROBE, so a film cannot grow it without bound.
 */
export const LPROBE: {
  on: boolean;
  log: { lane: string; name: string; why: string; x: number; y: number;
         bw: number; bh: number }[];
} = { on: false, log: [] };

function lprobe(
  lane: string, name: string, why: string,
  x: number, y: number, bw: number, bh: number,
): void {
  if (!LPROBE.on) return;
  if (LPROBE.log.length > 20000) return;
  LPROBE.log.push({ lane, name, why, x: Math.round(x), y: Math.round(y),
                    bw: Math.round(bw), bh: Math.round(bh) });
}

if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  (globalThis as { __cityLPROBE?: typeof LPROBE }).__cityLPROBE = LPROBE;
}
