/* ══ WHAT THE BOARD DECIDED IN ONE YEAR ════════════════════════════════════
 *
 * The city map's right-hand panel is 280 px wide, full height, and holds four
 * lines of mouse instructions. It is called *The record*. This is the reader
 * for it holding one: drag the year, and the panel lists the decisions of that
 * year — being exactly the dots lit on the map beside it.
 *
 * ── THE SHARDS, AND WHY THERE ARE THIRTEEN ────────────────────────────────
 * `blocks/year/<decade>.json`, written by
 * `pipeline/scripts/us_sf_city/blocks/build_year_lines.py`. One file a decade,
 * 7 to 90 kB gzipped, so moving inside a decade costs nothing and crossing one
 * costs a single small fetch. The alternative was resolving each decision
 * against `block-NN.json` at read time, which is up to ninety fetches for one
 * drag of the scrub.
 *
 * ── A ROW IS A DECISION, NOT A DOT ────────────────────────────────────────
 * The marks file holds 16,468 rows and they are 7,816 decisions: **2.11 dots
 * each**, because a decision naming twenty-four addresses is placed at
 * twenty-four blocks. *"Ordering Improvement of Clement Street and Fulton
 * Avenue"* is one act of the Board and twenty-four marks on the map. So a row
 * here carries its positions rather than being one of them, and a panel
 * listing 1939 says 21 decisions rather than 43 with the same firehouse lease
 * printed three times.
 *
 * ── AND THE YEARS ARE NOT EVEN ────────────────────────────────────────────
 * Median 47 a year. 1925 holds 307 and 1954 holds 2. Anything rendering this
 * has to survive both, so `forYear` returns the whole year and says how many
 * there are; it is the caller's business how much of it to show.
 * ═══════════════════════════════════════════════════════════════════════ */

/** one act of the Board, and everywhere it touches */
export interface YearDecision {
  readonly year: number;
  /** the record's own words, verbatim and untrimmed */
  readonly text: string;
  /** theme bitmask, matching `blocks/themes.json` `bit` */
  readonly bits: number;
  /** the Board's own kind letter — R resolution, M motion, O ordinance … */
  readonly kind: string;
  /** dollars the record states, 0 where it states none */
  readonly usd: number;
  /** archive path, for the link out to the Journal page */
  readonly url: string;
  /** subject index into `classify.json` `sub`, -1 where unclassified */
  readonly cs: number;
  /** act index into `classify.json` `act`, -1 where none */
  readonly ca: number;
  /**
   * the shard's own grade letter. `h` means the heading belongs to a
   * different item on the same page — `record-line.ts` refuses to print it,
   * and so must anything else.
   */
  readonly grade: string;
  /** every place it names: world x, world z, and the assessor block id */
  readonly at: readonly (readonly [number, number, string])[];
}

interface Shard {
  y: number[]; m: number[]; k: string[]; a: number[]; u: string[];
  t: string[]; cs: number[]; ca: number[]; g: string[];
  p: [number, number, string][][];
}

/** the decade a year belongs to — the shard's own key */
export const decadeOf = (year: number): number => Math.floor(year / 10) * 10;

/**
 * A reader for the shards, holding the ones it has already fetched.
 *
 * One per map. It keeps whole decades because a reader scrubbing 1925 → 1929
 * must not pay for anything, and thirteen decades fully loaded is 2 MB, which
 * is less than one of the building chunks this page already carries.
 */
export class YearRecord {
  private readonly base: string;
  private readonly shards = new Map<number, Shard | null>();
  private readonly waiting = new Map<number, Promise<Shard | null>>();

  constructor(assetBase: string) {
    this.base = assetBase;
  }

  /** is the decade holding this year already in hand? */
  has(year: number): boolean {
    return this.shards.has(decadeOf(year));
  }

  /**
   * Fetch the decade holding `year`, if it is not already held.
   *
   * A city that ships no `blocks/year` tree resolves to null and the panel
   * draws nothing, which is not an error — this file names no city and the
   * data is one more thing a descriptor either has or has not.
   */
  async load(year: number): Promise<void> {
    const dec = decadeOf(year);
    if (this.shards.has(dec)) return;
    let p = this.waiting.get(dec);
    if (!p) {
      p = fetch(`${this.base}/blocks/year/${dec}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<Shard>) : null))
        .catch(() => null);
      this.waiting.set(dec, p);
    }
    const shard = await p;
    this.shards.set(dec, shard);
    this.waiting.delete(dec);
  }

  /**
   * Every decision of `year`, in the shard's own order — most-placed first,
   * then alphabetical, which `build_year_lines.py` sorts on the way out.
   *
   * `bits` narrows to one theme. Returns an empty array for a year the record
   * is silent on, and the caller must say so rather than showing nothing: some
   * years really are quiet and that is worth reading.
   */
  forYear(year: number, bits = 0): YearDecision[] {
    const s = this.shards.get(decadeOf(year));
    if (!s) return [];
    const out: YearDecision[] = [];
    for (let i = 0; i < s.y.length; i++) {
      if (s.y[i] !== year) continue;
      if (bits && (s.m[i] & bits) === 0) continue;
      out.push({
        year: s.y[i], text: s.t[i], bits: s.m[i], kind: s.k[i],
        usd: s.a[i], url: s.u[i], cs: s.cs[i], ca: s.ca[i],
        grade: s.g[i], at: s.p[i],
      });
    }
    return out;
  }
}
