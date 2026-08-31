/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/civic.ts — WHICH NAMED BUILDINGS GET A FORM OF THEIR OWN.

   `layers/heroes.ts` hand-models fourteen buildings and every one of them
   reads. That path does not scale: a hero is a seed row, an authored section,
   a pipeline run and its own mesh in the scene, and there are 1,609 named
   buildings on this map.

   This is the other half of the same idea, and it is the house form's idea
   exactly — `roof-form.ts` §A HOUSE, DRAWN AS A HOUSE: **the record decides
   WHICH buildings get a form and the FORM is authored.** The record here is
   `base/marks.json`, which the overlay already fetches for the labels and
   which carries, per named place, the building index it resolves to and the
   family the city's own registers put it in.

   MEASURED off the shipped file — 2,199 places, 1,609 of them on a footprint:

       school   217     port      51     works    41     library  17
       park     120     office    49     water    22     police   17
       civic     76     transit   47     arts     18     plaza     7
                        fire      43     hotel    17     sport     4
                        home      41     health   17     garden    2
       and 803 with no family at all

   Nothing here invents a fact about a building. The family is the register's
   own; what is authored is what a building of that family is DRAWN as, which
   is the same category of judgement as a gable on a house.

   ── AND CHURCHES ARE NOT IN ANY REGISTER ────────────────────────────────
   `place-kinds.generated.ts` says so in its own words: *"Churches are in none
   of these registers, so a church is one of them."* The eighteen families
   come from Recreation and Parks, City Facilities, the schools registers and
   the Tall Building Inventory, and a parish church is in none of them — it
   reaches this map through Article 10 and Article 11, which publish a name
   and a designation and no category.

   So a church is found by its NAME, and the rule is written to be read rather
   than to be clever. It is also written to REFUSE, because the words are
   shared: `Cathedral Apartments` and `Cathedral Hill Tower` are flats,
   `Shriners' Hospital` is a hospital, and `Masonic Temple`, `Odd Fellows
   Temple` and `San Francisco Labor Temple` are fraternal halls — monumental
   buildings, and not one of them has a steeple. Each of those is a real row
   in the shipped file and each is refused by name below.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * What a named building is DRAWN as. One entry per authored form, not one per
 * register family: several families share a form because the drawing has the
 * same thing to say about them.
 */
export type CivicForm =
  | "church"    // a steep nave and a tower — see `churchForm`
  | "firehouse" // a hose-drying tower
  | "monument"  // civic, arts, library: a deep cornice and a raised attic
  | "shed"      // a pier or a works shed: one long low gable
  | "school";   // a raised entrance bay on the frontage

/** the register's own family vocabulary, in the order `marks.json` indexes it */
export type MarkKind =
  | "park" | "garden" | "plaza" | "water" | "sport" | "library" | "school"
  | "fire" | "police" | "transit" | "port" | "health" | "arts" | "civic"
  | "works" | "home" | "hotel" | "office";

/**
 * A church, a synagogue or a chapel, by name.
 *
 * `WORD` is the claim and `NOT_A_CHURCH` is the refusal. Both are needed: the
 * words are shared with flats, hospitals and fraternal halls, and every one
 * of the exclusions below is a row that is actually in the shipped file.
 */
const WORD =
  /\b(church|cathedral|chapel|synagogue|basilica|congregational|parish|shrine|mission dolores)\b/i;
/** `temple` is a synagogue here and a fraternal hall there, so it is asked separately */
const TEMPLE = /\btemple\b/i;
const NOT_A_CHURCH =
  /\b(apartments?|tower|hotel|hospital|garage|parking|school|college|academy|store|market|masonic|odd fellows|labor|scottish rite|theat(re|er)|alcazar|commandery|foresters)\b/i;

export function isChurchName(name: string): boolean {
  if (NOT_A_CHURCH.test(name)) return false;
  return WORD.test(name) || TEMPLE.test(name);
}

/**
 * The form a named building is drawn with, or null for one the drawing has
 * nothing extra to say about.
 *
 * ── WHAT EACH FAMILY GETS, AND WHY ───────────────────────────────────────
 * `fire` is the sharpest of them. A San Francisco fire station has a hose
 * tower — a slender shaft for hanging hose to dry, taller than the building
 * under it — and it is on the great majority of the 43 the register names.
 * From overhead it is unmistakable and it is one box.
 *
 * `civic`, `arts` and `library` share the monumental treatment: these are the
 * Opera House, Davies Symphony Hall, the Asian Art Museum, the Main Library,
 * Bill Graham. What they have in common as SHAPE is a heavy cornice and an
 * attic or clerestory standing back from it, and that is what is drawn.
 *
 * `port` is 51 rows and 47 of them are literally called `Pier NN - Shed`. A
 * pier shed is a long low gable down the pier's own axis. This is the least
 * authored of the five: it is what those buildings are.
 *
 * `school` is 217 rows, which is the largest family and therefore the one
 * where a wrong form is most visible. It gets the mildest treatment — the
 * raised entrance bay a San Francisco school building almost always has on
 * its street front — and nothing on the roof.
 *
 * `works`, `transit`, `police`, `health`, `home`, `hotel` and `office` get
 * NOTHING here. A works yard, a jail, a parking garage and a hospital slab
 * have no shared silhouette to draw, and the fabric already draws a tower
 * well. A family the drawing has nothing true to say about is left alone.
 */
export function civicFormOf(name: string, kind: MarkKind | null): CivicForm | null {
  if (isChurchName(name)) return "church";
  switch (kind) {
    case "fire":    return "firehouse";
    case "civic":
    case "arts":
    case "library": return "monument";
    case "port":    return "shed";
    case "school":  return "school";
    default:        return null;
  }
}

/** `marks.json`'s own columns, as much of them as this needs */
export interface MarksInput {
  readonly t: readonly string[];
  /** base64 `<i4`, the building index, -1 where the place is not a building */
  readonly b?: string;
  /** base64 `<u1`, ONE-BASED into `KIND`; 0 is "no family" */
  readonly k?: string;
  readonly KIND?: readonly string[];
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Read the register into `building index -> form`.
 *
 * THE KIND BYTE IS ONE-BASED and that is worth stating, because reading it as
 * an index into `KIND` is silently wrong rather than loudly wrong: every row
 * comes back as the family before its own, so fire stations arrive as police
 * stations and schools as fire stations, and the census still adds up.
 */
export function civicIndex(marks: MarksInput): Map<number, CivicForm> {
  const out = new Map<number, CivicForm>();
  if (!marks.b || !marks.t) return out;
  const bi = new Int32Array(b64(marks.b).buffer);
  const kb = marks.k ? b64(marks.k) : null;
  const KIND = marks.KIND ?? [];
  const n = Math.min(marks.t.length, bi.length);
  for (let i = 0; i < n; i++) {
    const b = bi[i];
    if (b < 0) continue;
    const kv = kb ? kb[i] : 0;
    const kind = kv >= 1 && kv <= KIND.length ? (KIND[kv - 1] as MarkKind) : null;
    const form = civicFormOf(marks.t[i], kind);
    /* first row wins: two places may resolve to one footprint — a hall and
       the complex around it — and the drawing may only have one form. */
    if (form && !out.has(b)) out.set(b, form);
  }
  return out;
}
