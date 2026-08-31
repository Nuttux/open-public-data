/**
 * THE BLOCK RECORD — what the city decided, block by block.
 *
 * Built by `scratchpad/sf-city-anim/blocks/build_index.py` from **142 of 142
 * volumes published under the title `Journal of proceedings`, 1906–1999, plus
 * 44 Bureau of Engineering, Board of Public Works, DPW and Park Commission
 * annual reports.**
 *
 * **AND SINCE `91de7fa0`, THE THREE TITLES THAT FOLLOW IT.** The Board's
 * minutes continue under `Meeting minutes`, `Minutes` and `Meeting minutes.
 * Draft` through 2016; the index now holds them. **6,579 decisions from
 * 1999–2016 land on 2,091 blocks**, and 1,941 of the 1,989 blocks carrying
 * anything from 2000 on — **97.6%** — already had a pre-1999 record, so the
 * modern rungs extend lines that were already on the rail rather than opening
 * a separate modern layer. See `SERIES_LAST_YEAR`, `DecadeGroup.partialTo` and
 * `pipeline/scripts/us_sf_city/MINUTES.md` §18–19. 5,089 of the city's 5,404
 * assessor blocks answer the question *what did the city decide here*, with a
 * page link per decision.
 *
 * Three tiers, and the loading follows the same rule as the map's own chunks:
 * nothing is fetched before the reader can see it.
 *
 *   T0  `block-index.json`   36 KB gz   once, at first paint
 *   T1  `block-NN.json`      ~21 KB gz  one shard per click
 *   T2  `street/<KEY>.json`  ~1.5 KB gz ≤6, and only if the reader opens
 *                                       "on this street"
 *
 * ── THE PRECISION TIER IS THE PROMISE ────────────────────────────────────
 * `p` on every row, and the UI is where the promise is kept: a reader has to
 * be able to tell *this happened at this address* from *this happened
 * somewhere on this street*. `TIER_WORDING` is the only place that sentence is
 * written, and nothing may flatten it.
 */

export interface BlockDecision {
  /** year */
  readonly y: number;
  /** MM-DD, or "" where the volume gives no date */
  readonly d: string;
  /** R resolution · O ordinance · M motion · W a departmental work */
  readonly k: string;
  /** precision tier, 0 street … 4 stated */
  readonly p: number;
  /** phase, index into PHASE_ORDER */
  readonly f: number;
  /** the largest SINGLE printed figure on the row, 0 where none */
  readonly a: number;
  /** "<volume>/<leaf>" */
  readonly u: string;
  /** the sentence, as printed */
  readonly t: string;
  /** the page link may be a page or two off */
  readonly approx?: number;
  /**
   * where `t` came from: `h` the Board's own printed heading, `p` that heading
   * composed with the sentence beneath it, `s` the sentence the matched
   * address sits in. Never shown to a reader; it decides which line heads a
   * decade on the rail.
   */
  readonly g?: string;
  /**
   * WHICH RECORD SYSTEM RESOLVES `u`. Absent means the Internet Archive's
   * scan of a bound volume — every row published before 2026-08 — so adding
   * this changed no byte that was already on disk.
   *
   * `b` is a PDF the Clerk posted at sfbos.org. MEASURED at the seam: the
   * Archive's volumes end 2016-06-07 and the Clerk's files begin 2016-07-12,
   * seventeen meeting dates each side and **none in common**. The City
   * stopped printing books over the 2016 summer recess, so this is not a
   * format flag — it is the join between two ways of keeping a record.
   */
  readonly c?: string;
  /**
   * WHAT THIS DECISION IS ABOUT — a bitmask over the themes in
   * `blocks/themes.json`, absent where nothing matched (about two rows in
   * three).
   *
   * It is computed in the pipeline and NOT here, and that is the whole point
   * of the field. `t` is one line, a median of 136 characters; the item it was
   * cut from has a median of 520. The same regex run against `t` in the
   * browser finds 34% of the landmark record and 17% of the homelessness
   * record — not a coarser answer to the same question, a different and much
   * smaller dataset. So never re-derive a theme from `t`.
   */
  readonly m?: number;
  /**
   * THE SAME IDEA AT THE FICHE'S GRAIN — a bitmask over the forty-one subjects
   * in `threads.json`, `bit` per subject, absent where none matched.
   *
   * The eight in `m` are coarse enough to filter a whole city by; these are
   * fine enough to say what one block keeps coming back to. Both are computed
   * in the same pass over the same text, which is the point: they were two
   * different answers for a while, because this one was matched in the browser
   * against `t` and reached 35% of records where the record reaches 51%.
   *
   * Past 32 subjects, so read it with division rather than `>>` — JavaScript's
   * bitwise operators coerce to int32 and would drop bits 32-40 in silence.
   */
  readonly sm?: number;
  /**
   * WHAT THIS RECORD IS, and WHAT THE BOARD DID — indices into
   * `blocks/classify.json`'s `sub` and `act`.
   *
   * Read in the pipeline from `sf_bos_classification.csv`, against the item's
   * FULL text, and joined on here. `t` above is a fragment of that item — a
   * median of 154 characters — so it frequently cannot say what the record is
   * even when shown whole; these two can.
   *
   * NOT the same idea as `sm`, and the difference is the point. `sm` is a set
   * of PATTERNS that matched somewhere in the item, so printing one above a
   * fragment shows a reader a label with no basis in the words underneath —
   * measured at 61% of the labels that were shown that way. These are a
   * STATEMENT about the record, which is what a heading has to be.
   *
   * `ca` is absent where the action is `other`; it renders as "Something
   * else", which is a non-answer, and a row with no clear verb is better
   * publishing its subject alone.
   */
  readonly cs?: number;
  readonly ca?: number;

  /**
   * THE RECORD IN ENGLISH — the one field on this row a stranger can read.
   *
   * `t` is the sentence an address was found in, and the Board did not write
   * for readers: *"Accepted the said land being described as follows, to wit:
   * Commencing at a point formed by the i"*. The record behind that says an
   * offer was received from Delia Williams to convey her land to the City.
   * `pl` is that, written out: **"Delia Williams offers her land to the city."**
   *
   * IT IS OURS, NOT THE BOARD'S, and the interface has to say so. `t` remains
   * on the row and the scan is one click away, because a civic record whose
   * words have been replaced by ours without a reader being able to tell is not
   * a civic record any more.
   *
   * Only lines that passed both checks are published: nothing invented, and no
   * proposal written as a fact. A line resting on a damaged scan DOES publish —
   * the reading is sound and the scanner is what is broken.
   */
  readonly pl?: string;
}

/** `blocks/classify.json` — the two vocabularies `cs` and `ca` index. */
export interface ClassifyFile {
  readonly sub: readonly string[];
  readonly act: readonly string[];
}

let classifyPromise: Promise<ClassifyFile | null> | null = null;
export function loadClassify(): Promise<ClassifyFile | null> {
  if (!classifyPromise) classifyPromise = loadSoft<ClassifyFile>(`${BASE}/classify.json`);
  return classifyPromise;
}

export interface BlockShardEntry {
  readonly d: readonly BlockDecision[];
  readonly s?: readonly string[];
}

export interface BlockIndex {
  readonly meta: {
    readonly n_blocks: number;
    readonly n_decisions_placed: number;
    readonly n_items_located: number;
    readonly n_unplaced: number;
    readonly shards: number;
    readonly tier_names: readonly string[];
    readonly precision_counts: Record<string, number>;
    readonly leaf_mapped_volumes: readonly string[];
  };
  readonly b: readonly string[];
  readonly n: readonly number[];
  readonly ns: readonly number[];
  readonly y0: readonly number[];
  readonly y1: readonly number[];
}

export interface BlockRecord {
  readonly blockId: string;
  readonly decisions: readonly BlockDecision[];
  readonly streets: readonly string[];
}

/** `f` indexes this — the same controlled vocabulary `phases.py` collapses to */
export const PHASE_ORDER = [
  "opened", "building", "decided", "funded", "contested", "stalled", "proposed",
] as const;

/**
 * `k`, in words.
 *
 * **`W` is a departmental work, not a Board vote** — 3,593 rows come out of the
 * annual reports rather than the Journal, and calling one a "resolution" would
 * be attributing a decision to a body that never took it.
 *
 * ── `H` AND `F` WERE MISSING AND RENDERED AS "Item" ──────────────────────
 * `ccec8bd7` gave the `k` byte two more values and this table was not told, so
 * every one of those rows reached the panel through the three `?? "Item"` call
 * sites below. Counted over the shipped shards on 2026-08-26:
 *
 *     R 60,448 · O 32,365 · M 5,155 · W 3,593 · H 100 · F 1     block layer
 *                                              H  15 · F 4      street layer
 *
 * 120 rows — contested land-use appeals, charter amendments, closed sessions —
 * on a panel where every other row is named for the thing the Board did.
 *
 * **Both words are the Clerk's own, not a reading of the row.** MINUTES.md
 * §23.4: a header-delimited item is emitted where the `Resolution|Ordinance|
 * Motion` splitter can see nothing at all, and its kind comes from the first
 * word of the Clerk's bracketed title and from nothing else — `H` where that
 * title begins "Hearing" (896 of the 1,102 emitted), `F` for every other form
 * the Clerk files that way (Charter Amendment, Formal Policy Discussions,
 * Closed Session, Committee of the Whole, appointments).
 *
 * So `F` is "Legislative file" and deliberately not a guess at which of those
 * it is: naming it any further would be this table making a judgement the
 * record does not support, which is the failure the `W` note above exists to
 * prevent.
 */
export const KIND_WORDING: Record<string, string> = {
  R: "Resolution",
  O: "Ordinance",
  M: "Motion",
  W: "Departmental work",
  H: "Hearing",
  F: "Legislative file",
};

/**
 * The precision tiers, in the words INTEGRATION.md §2 sets. These are not
 * decoration: a `street`-tier row is not a claim about this block, it is a
 * claim about a street this block fronts, and the wording has to say so.
 */
export const TIER_WORDING: readonly string[] = [
  "somewhere on this street",
  "at a corner of this block",
  "on this stretch of street",
  "at an address on this block",
  "the record names this block",
];

/**
 * `addr` — index 3 above, and the only tier that is a claim about a DOOR. The
 * pipeline has already checked the house number falls inside this block's own
 * parcel range, so `blockAddresses` reads this tier and no other: a number
 * lifted out of a street-tier sentence names a building somewhere along the
 * street, which is a different claim and a weaker one.
 */
export const ADDR_TIER = 3;

const BASE = "/data/us/sf/city/blocks";

let indexPromise: Promise<BlockIndex> | null = null;
const shardCache = new Map<number, Record<string, BlockShardEntry>>();
const streetCache = new Map<string, BlockDecision[]>();

/** T0 — 36 KB gzipped, fetched once. */
export function loadBlockIndex(): Promise<BlockIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}/block-index.json`).then(async (r) => {
      if (!r.ok) throw new Error(`block-index: HTTP ${r.status}`);
      return (await r.json()) as BlockIndex;
    });
  }
  return indexPromise;
}

/**
 * T1 — one shard per click.
 *
 * `NN = (index of the block in b[]) % 256`. The block's position in `b[]` is
 * also its position in the `base/blocks` chunk — the two id arrays are
 * byte-identical — and `assertJoin` below is what proves that at runtime
 * rather than trusting it, because a silent off-by-one here would attribute
 * one block's decisions to another and nothing would error.
 */
export async function loadBlockRecord(
  index: BlockIndex,
  blockIndex: number,
): Promise<BlockRecord | null> {
  const id = index.b[blockIndex];
  if (id === undefined) return null;
  const shard = blockIndex % index.meta.shards;
  let data = shardCache.get(shard);
  if (!data) {
    const nn = String(shard).padStart(2, "0");
    const r = await fetch(`${BASE}/block-${nn}.json`);
    if (!r.ok) throw new Error(`block-${nn}: HTTP ${r.status}`);
    data = (await r.json()) as Record<string, BlockShardEntry>;
    shardCache.set(shard, data);
  }
  const e = data[id];
  if (!e) return { blockId: id, decisions: [], streets: [] };
  return { blockId: id, decisions: e.d ?? [], streets: e.s ?? [] };
}

/** T2 — only when the reader opens "on this street". Capped at 120 a street. */
export async function loadStreetRecord(key: string): Promise<BlockDecision[]> {
  const hit = streetCache.get(key);
  if (hit) return hit;
  const file = key.replace(/[^A-Za-z0-9]+/g, "_");
  const r = await fetch(`${BASE}/street/${file}.json`);
  if (!r.ok) return [];
  const rows = (await r.json()) as BlockDecision[];
  streetCache.set(key, rows);
  return rows;
}

/**
 * The archive link, built the one way INTEGRATION.md specifies.
 * `u` is `<volume>/<leaf>`; the leaf is the scan's own page index.
 */
export function archiveHref(u: string): string {
  const [vol, leaf] = u.split("/");
  return `https://archive.org/details/${vol}/page/n${leaf}/mode/1up`;
}

/**
 * THE SOURCE LINK, AND THERE ARE TWO OF THEM.
 *
 * Take the decision, never `d.u` alone: the string is the same shape in both
 * systems and only `c` says which one resolves it. A row sent to the wrong
 * resolver does not fail loudly — it builds a plausible archive.org URL for a
 * volume that does not exist, and the reader gets a 404 that looks like the
 * Archive's fault rather than ours.
 *
 * The Clerk's form is reconstructed rather than stored per row because the
 * pipeline gate proves it can be: every one of the 6,786 sfbos rows satisfies
 * `url === PREFIX + stem + SUFFIX`, and all 372 files were checked live to
 * return `application/pdf` served inline, so `#page=` lands.
 */
export function sourceHref(d: Pick<BlockDecision, "u" | "c">): string {
  const [doc, page] = d.u.split("/");
  return d.c === "b"
    ? `https://sfbos.org/sites/default/files/${doc}_minutes.pdf#page=${page}`
    : `https://archive.org/details/${doc}/page/n${page}/mode/1up`;
}

/**
 * `PINE|ST` → `Pine St`.
 *
 * `*` IS THE SHARD'S MARKER FOR A STREET WITH NO TYPE, not part of the name.
 * Broadway is Broadway and The Embarcadero is The Embarcadero — neither takes
 * St or Ave — and joining the marker in printed **"Broadway *"** and **"The
 * Embarcadero *"** as the heading of the streets section on every block they
 * front. MEASURED over the shipped shards: 96 street keys carry it, against
 * 10,295 `ST` and 4,989 `AVE`.
 */
export function streetLabel(key: string): string {
  return key
    .split("|")
    .filter((part) => part && part !== "*")
    .join(" ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * The join is asserted, not assumed.
 *
 * `block-index.json`'s `b[]` and `base/blocks-id.json`'s `id[]` are two
 * separately-built arrays that have to agree element for element or every
 * decision on this map is attached to the wrong block — and neither would
 * throw. This checks a sample and returns what it found so the page can say
 * so rather than drawing a wrong claim.
 */
export function assertJoin(
  index: BlockIndex,
  ids: readonly string[],
): { ok: boolean; n: number; firstMismatch: number } {
  if (ids.length !== index.b.length)
    return { ok: false, n: Math.min(ids.length, index.b.length), firstMismatch: -1 };
  for (let i = 0; i < ids.length; i++)
    if (ids[i] !== index.b[i]) return { ok: false, n: ids.length, firstMismatch: i };
  return { ok: true, n: ids.length, firstMismatch: -1 };
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SHAPE OF A BLOCK'S RECORD
 *
 * `d[]` arrives ranked by interest, which is right for "what is worth reading"
 * and useless for "what happened here over time". These two functions are the
 * second reading of the same rows: when the city started deciding things here,
 * what it kept coming back to, and when it stopped. Nothing here classifies,
 * summarises or infers — every value below is a count, a year or a figure the
 * volume printed.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The rail is drawn across the whole corpus, not across the block's own span,
 * and that is the point: an empty decade is information. A Sunset block whose
 * first decision is 1927 should show the 1900s and 1910s as empty track,
 * because the Sunset was sand; a Barbary Coast block that goes silent after
 * 1935 should show the silence.
 *
 * 1900 because the Journal series opens in 1906, and the rail stretches further
 * back if a block holds something earlier.
 *
 * ── AND THE RIGHT-HAND END IS NO LONGER A CONSTANT ───────────────────────
 * There was a `RAIL_TO` here. It read **1990** under a comment arguing for
 * **2010** — "because the corpus is NOT Journal-only, the DPW annual reports
 * run to 2010" — so the constant and the paragraph justifying it disagreed by
 * two decades, and BOTH were dead: `decadeGroups` takes
 * `Math.max(RAIL_TO, current decade, the block's own last decade)`, and the
 * current decade has been 2020 since 2020. Whichever number was written there
 * could never be the maximum again.
 *
 * A guard that cannot bind is worse than no guard, because it reads as one. The
 * right edge is now the current decade or the block's own last decision,
 * whichever is later, and there is nothing to keep in step with the corpus.
 */
export const RAIL_FROM = 1900;

/**
 * THE LAST YEAR THE BOARD'S SCANNED SERIES CARRIES — 2016, NOT 1999.
 *
 * ── THE ERROR THIS CONSTANT USED TO CAUSE ────────────────────────────────
 * It read 1999, and the caption above the rail said in so many words that
 * *"the record stops there, not because the city stopped deciding"*. **The
 * record did not stop.** The series was RENAMED, three times — `Journal of
 * proceedings` → `Meeting minutes` → `Minutes` → `Meeting minutes. Draft` —
 * and a pipeline that searched by title found ninety-three years and missed
 * seventeen that were on the Internet Archive the whole time.
 *
 * MEASURED and seeded (`93096a2a`,
 * `pipeline/seeds/countries/us/seed_us_sf_bos_minutes.tsv`): **378 Board-level
 * items, coverage resolved for 367, spanning 1908–2016, every year 1995–2016
 * covered**, with the volume numbering unbroken across all three titles.
 *
 * That is the worst class of error this project can ship: a gap that was OURS,
 * printed as a fact about the record.
 *
 * ── WHAT IS ACTUALLY TRUE AFTER 2016, AND IT IS NARROW ───────────────────
 * The Clerk publishes every meeting, the minutes are born digital and free,
 * and the Wayback Machine has crawled `sfbos.org` since 2009 and does capture
 * them. What stops in 2016 is the **curated, paginated, OCR'd, citable
 * document series** — the thing that makes 1906–2016 readable and quotable
 * here. A search of the library collection for 2017–2026 returns zero.
 * **The record continues; the shelf stops.** Nothing on the panel may say
 * more than that.
 */
export const SERIES_LAST_YEAR = 2016;

/**
 * THE LAST YEAR THE SHIPPED SHARDS ACTUALLY PLACE ANYTHING.
 *
 * Not the same number as `SERIES_LAST_YEAR` and it must not be assumed to be:
 * the shelf reaching 2016 is a fact about the Internet Archive, while what
 * this map can draw is a fact about `block-*.json` on disk at this moment.
 * They converge when the ingest is re-run and they diverge in the window
 * between the correction landing and that run — which is exactly the window
 * this function exists for.
 *
 * **The rail's own treatment follows the DATA, and only the caption follows
 * the shelf.** Drawing the 2000s as an ordinary in-series silence while the
 * shards hold nothing there would trade one false claim for another: it would
 * say this block was quiet for sixteen years when the truth is that this index
 * has not read those years yet. Read off `y1`, the T0 index the map already
 * fetches, so it costs nothing and cannot go stale.
 *
 * **THEY HAVE CONVERGED.** Since `91de7fa0` the published shards reach 2016
 * and so does the shelf, so both branches of the caption under the rail now
 * say the same year. The function stays, and it stays read off `y1` rather
 * than hardcoded, because the next volume the Archive scans separates them
 * again and nothing here should have to be remembered on that day.
 */
export function indexedLastYear(ix: BlockIndex | null): number {
  if (!ix) return SERIES_LAST_YEAR;
  let m = 0;
  for (const y of ix.y1) if (y > m) m = y;
  return m > 0 ? m : SERIES_LAST_YEAR;
}

/**
 * "Went quiet" is measured against WHAT THE INDEX REACHES, not against the rail
 * and not against the shelf.
 *
 * Using the rail's end made a block whose last decision is the last year the
 * index carries report *"nothing lands here after 1999"*, which reads as a
 * block falling silent and is really the corpus running out. Using the SHELF's
 * end (2016) would be the same mistake one notch further on, and it was worse
 * still while the shards stopped at 1999: it fired on almost every block in
 * the city. So the anchor is the last decade the index actually places
 * something in, and a block has to fall two whole decades short of it before
 * anything is said.
 *
 * **The sentence has become a finding rather than a hedge.** The index now
 * reaches 2016, so "nothing lands on this block after 1999" is a measured
 * silence over seventeen years the map HAS read — which is what it always
 * claimed to be and, until the modern minutes landed, could not be.
 */
const QUIET_DECADES = 2;

export interface DecadeGroup {
  /** 1920 for the 1920s */
  readonly decade: number;
  readonly label: string;
  /** this decade's rows, still in the order they were ranked in */
  readonly rows: readonly BlockDecision[];
  /**
   * The one line this decade shows unexpanded.
   *
   * Two rules, in order. It has to CARRY a line at all — 0.72% of rows have
   * none, because the builder prints nothing rather than invent a sentence,
   * and one of those must never head a decade. And among the top few ranked
   * rows it prefers one whose line is the Board's OWN PRINTED HEADING (`g` is
   * `h` or `p`) over one lifted out of the body, because the Journal's heading
   * is a whole sentence written to say what the item is, while a body sentence
   * can start mid-clause: "Elser, for repaving Mission street between…". Both
   * are the record's own words; the heading is the one the record wrote as a
   * summary. It looks no further than the top few so a much better-ranked row
   * is never demoted for the sake of a tidier line.
   */
  readonly headline: BlockDecision | null;
  /**
   * This decade is past the end of the Board's scanned series. It is not empty
   * because nothing happened; it is empty because the record stops. Drawn
   * differently, and explained in words rather than left to be inferred.
   */
  readonly afterSeries: boolean;
  /**
   * THE DECADE THE INDEX STOPS INSIDE — the last year it reaches, or null.
   *
   * The ingest of the Board's modern minutes (`MINUTES.md` §18–19) carried the
   * index to **2016**, so the rail's last rung is the 2010s and it holds
   * **2010–2016 — seven years, not ten.** Nothing on the rung said so, and a
   * reader comparing its count against the 1920s was comparing seven years
   * with ten without being told.
   *
   * MEASURED off the published shards: the 2000s carry 3,799 decisions over
   * ten years and the 2010s 2,234 over seven — 380 and 319 a year. The last
   * rung looks shorter than the one before it for two reasons and only one of
   * them is about the city.
   *
   * Set on the decade holding `indexedLast`, and only when that year is not
   * the decade's own last — an index reaching 2019 truncates nothing. Null on
   * every other rung, so exactly one rung on a rail can ever carry it.
   */
  readonly partialTo: number | null;
}

/**
 * How far down the ranking a printed heading may be promoted.
 *
 * It was a flat 3, and on a decade holding 76 rows that is the top 4 % — so a
 * busy block's decade was headed by whatever body sentence happened to rank
 * first, while a printed heading sat at rank 5. The reach is now a quarter of
 * the decade, held between 3 and 8, which changed 41 of 3,645 decade headlines
 * over 40 shards and moved every one of them onto a heading the Board wrote:
 * block 3704's 1930s went from *"From Fifth Street at Mint avenue, via
 * Brannan, Potrero, Bayshore, Alemany boul…"* to *"Regulating Hours of Work in
 * Reconstruction or Repairs to Street Railway Tracks."*
 */
const HEADLINE_REACH_MIN = 3;
const HEADLINE_REACH_MAX = 8;

/**
 * Under this many characters a line is a fragment rather than a sentence —
 * *"Fortysixth Avenue and Irving Street."* is the whole of one row on block
 * 1705, and as the face of a decade it says nothing at all. It is still shown
 * inside the decade; it is only passed over for the headline while a longer
 * line is within reach.
 */
const FRAGMENT_CHARS = 40;

/**
 * THE FACE OF A DECADE IS GATED THE SAME WAY THE LEAD IS.
 *
 * > "Block 3551, the 1900s decade entry reads *«Xew Series), entitled, "(Jranting
 * > ]»ernnssion, during the pleasure of the Board of Supervisors, to Long Syru])…»*
 * > That is unreadable scanning damage shown to a reader."
 *
 * The gate was ported for the lead and the rail was left ungated, so the one
 * defect §18e is entirely about came straight back one section down. It is the
 * most damaging thing the panel can do: a reader who meets `l*avinjr` on the
 * face of a decade concludes the whole record is unreliable, and in a room of
 * archivists that is the only conclusion that matters.
 *
 * So `isPrintableLine` runs FIRST and the precedence runs over what survives.
 * **The rows themselves are untouched** — every one of them is still inside the
 * decade, still openable, still linked to its scan. What is gated is only what
 * may stand as the decade's FACE, unopened, with nothing around it to say the
 * page beneath is damaged.
 *
 * When nothing in a decade passes, this returns null and the rail prints the
 * count with no quotation. A count is true; garbage is not.
 */
/**
 * A PERSON AND WHERE THEY LIVE — the shape a speaker list is made of.
 *
 * `Mrs. Nancy Knickerbocker, 2437 Pacific Avenue`. The honorific is optional
 * because the clerk drops it as often as not (`Jeff Shaw, 1770 Broadway`), and
 * the address is a number against a capitalised word rather than a gazetteer
 * of street types — the Journal writes `street`, `Street`, `avenue`, `Ave.`,
 * `38th Avenue` and `2645-47`, and a list of suffixes would miss the next one.
 */
const SPEAKER_PAIR =
  /(?:(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+)?[A-Z][a-zA-Z'-]+(?:\s+(?:[A-Z]\.|[A-Z][a-zA-Z'-]+)){0,3}\s*[,.]?\s+\d[\d\s-]{0,6}\s*(?:[A-Z][a-zA-Z]+|\d+(?:st|nd|rd|th))/g;

/** the clerk closing a hearing — always the tail of a list of speakers */
const CLERK_CLOSE = /there\s+being\s+no\s+(?:one|further|other)/i;

/**
 * THE BOARD'S OWN ITEM STYLE, AND IT IS WHAT SEPARATES THE TWO.
 *
 * An item the Board decided opens with the action it took — *Ordering*,
 * *Authorizing*, *Designating*, *Denying* — optionally after the heading the
 * volume printed above it. A list of people who came to the microphone opens
 * with a person, or with the column header of a table (`Claimant Location
 * Amount`). That is the whole discriminator, and it is why an item that
 * happens to carry two addresses survives: *"Amending the Planning Code to
 * designate the Sacred Heart Parish Complex, located at 546-548 Fillmore
 * Street, 554 Fillmore Street…"* is an ordinance, not a queue.
 */
const ITEM_ACTION =
  /^\s*(?:[^—]{3,60}—\s*)?(?:Amend|Authoriz|Designat|Order|Approv|Grant|Accept|Adopt|Establish|Request|Urg|Direct|Declar|Appropriat|Confirm|Extend|Sett|Calling|Creat|Impos|Prohibit|Rescind|Repeal|Waiv|Provid|Levy|Fix|Chang|Renam|Dedicat|Vacat|Clos|Widen|Improv|Construct|Deny|Refus|Revok|Transferr|Permission|Resolution|Ordinance|Motion|Recommend|Support|Oppos|Condemn|Commend|Initiat)/i;

/**
 * A LIST OF PEOPLE WHO CAME TO A MEETING IS NOT THE FACE OF A BLOCK.
 *
 * Block 5525's 1970s rung read *"Mr. Dennis Kent, 3206 Harrison Street Ms.
 * Nancy McKay, 133 Shipley Street Mr. Jamie Jamerson There being no one else
 * present to object…"* — three private people and two home addresses, standing
 * as what a century did to that block. It is the record's own sentence and not
 * a data defect; it is simply the wrong line to promote, and it is the one a
 * stranger screenshots.
 *
 * MEASURED over all 256 published shards, by recomputing every decade face:
 *
 * ```
 *                                            faces demoted   of 9,914
 *   >= 1 name-and-address pair                        302      3.05 %  <- NO
 *   >= 2 pairs                                        149      1.51 %
 *   >= 2 pairs AND no opening action verb             138      1.39 %  <- ships
 * ```
 *
 * **The one-pair rule was measured and refused.** One person with an address
 * is very often the record at its best — *"Oil and Boiler Permits — Alvara
 * Ramazzotti, 1452 Vallejo street, 1500 gallons capacity."*, *"Laundry Permits
 * — Mrs. A. Termello, 41 Franklin street."* — and it would have traded 302
 * faces to fix 138, deleting exactly the texture that makes the rail worth
 * reading. A queue is TWO OR MORE people juxtaposed; an item is one person
 * inside a sentence about a decision.
 *
 * WHAT THE 138 COST, counted the same way:
 *
 * ```
 *   the rung shows a different, better line          48
 *   the rung goes blank (nothing else passes)        90      0.91 %
 * ```
 *
 * The 90 are almost entirely claim tables and parking schedules — *"Claimant
 * Location Amount Maribelle Leavitt 557 Belvedere Street $66.93…"* — so a
 * blank rung carrying its own count is the better of the two things a reader
 * can be shown there.
 *
 * WHERE THE CATCHES SIT IN TIME, and it is the reason this is worth doing:
 * 1970s 51, 1980s 32, and eight or fewer in every other decade. The lists name
 * people who may be alive at addresses they may still live at; the lines this
 * rule protects name people dead a century.
 *
 * **THE ROW IS DEMOTED, NEVER REMOVED.** It stays in its decade, openable, and
 * still linked to the page of the scan — the same contract `isPrintableLine`
 * keeps. Whether the modern ones should additionally be held back from display
 * is an editorial question and not this function's to answer.
 */
export function isSpeakerList(raw: string): boolean {
  const line = raw.trim();
  if (CLERK_CLOSE.test(line)) return true;
  return (line.match(SPEAKER_PAIR)?.length ?? 0) >= 2 && !ITEM_ACTION.test(line);
}

/**
 * THE CLERK'S VOTE TALLY, WHICH IS ALSO A LIST OF PEOPLE.
 *
 * Found by looking at the rail after `isSpeakerList` landed: block 3752's
 * 1960s rung read *"Supei'visors Casey, Dobbs, Ertola, Ferdon, Halley,
 * McMahon, Sullivan, Tamaras, Tinney, Zirpoli — 10."* Ten surnames and a
 * count. `isSpeakerList` cannot see it — these names carry no address — and it
 * is the same defect wearing different clothes: a roster standing where a
 * decision should be. These are elected officials rather than private people,
 * so nothing here is about privacy; it is only about what a decade should say.
 *
 * **ANCHORED, AND THAT IS THE WHOLE RULE.** The line has to *be* the tally,
 * not end with one. MEASURED over all 256 shards, both ways:
 *
 * ```
 *   a tally anywhere in the line          55, and it takes real lines with it:
 *                                         "…FINALLY PASSED 070177 [Appropriating
 *                                         $1,344,490 for Geneva Avenue Car Barn
 *                                         Repairs…" is an appropriation whose
 *                                         tail happens to be a roll call.
 *   a tally at the head of the line       55, and every one of them is a tally
 *                                         and nothing else.                <- ships
 * ```
 *
 * Both catch 55; they are not the same 55. The anchored form is the one that
 * costs nothing, which is why the unanchored form is not here.
 *
 * The `Sup[a-z']{0,3}[ei]'?[rv]{1,2}[ei]?sors?` shape is OCR tolerance, not
 * cleverness: the scans give `Supervisors`, `Supei'visors` and `Supei-visors`
 * on the same rung of the same rail.
 */
const VOTE_TALLY =
  /^\s*(?:[^—]{3,60}—\s*)?(?:Ayes?|Noes?|Absent|Excused|Sup[a-z']{0,3}[ei]'?[rv]{1,2}[ei]?sors?)\b[\s:—-]*(?:Sup[a-z']{0,3}[ei]'?[rv]{1,2}[ei]?sors?\b[\s:—-]*)?(?:[A-Z][a-zA-Z'’-]{2,}\s*,\s*){2,}/i;

export function isVoteTally(raw: string): boolean {
  return VOTE_TALLY.test(raw.trim());
}

/**
 * WHAT THE TWO GATES COST TOGETHER, measured over all 256 shards:
 *
 * ```
 *   decade faces before          9,914
 *   decade faces after           9,785
 *   a different, better line          64
 *   the rung goes blank              129     1.30 %
 * ```
 */
function pickHeadline(rows: readonly BlockDecision[]): BlockDecision | null {
  const withLine = rows.filter(
    (r) => isPrintableLine(r.t) && !isSpeakerList(r.t) && !isVoteTally(r.t),
  );
  if (withLine.length === 0) return null;
  const reach = withLine.slice(
    0,
    Math.min(HEADLINE_REACH_MAX, Math.max(HEADLINE_REACH_MIN, Math.ceil(withLine.length / 4))),
  );
  // `h` before `p`: `h` is the Board's printed heading on its own, `p` is that
  // heading composed with the sentence under it, and the composition can join
  // two things the page kept apart — "Standardization of Salaries — Read and
  // ordered filed. Paving of Mission Street." A whole printed heading is
  // always the better line when the decade has one.
  return (
    reach.find((r) => r.g === "h") ??
    reach.find((r) => r.g === "p") ??
    // The old third fallback tested `>= FRAGMENT_CHARS`; every survivor of the
    // gate already clears it, so it could never fail and is gone.
    withLine[0]
  );
}

/**
 * Every decade of the rail in order, empty ones included, so the gaps are
 * visible. Rank order is preserved inside each decade.
 */
export function decadeGroups(
  decisions: readonly BlockDecision[],
  /** the last year the shipped index reaches — see `indexedLastYear` */
  indexedLast: number = SERIES_LAST_YEAR,
): DecadeGroup[] {
  const bucket = new Map<number, BlockDecision[]>();
  for (const d of decisions) {
    if (!d.y) continue;
    const dec = Math.floor(d.y / 10) * 10;
    const list = bucket.get(dec);
    if (list) list.push(d);
    else bucket.set(dec, [d]);
  }
  const years = decisions.map((d) => d.y).filter((y) => y > 0);
  const decs = years.map((y) => Math.floor(y / 10) * 10);
  const from = Math.min(RAIL_FROM, ...(decs.length ? [Math.min(...decs)] : []));
  /* To the CURRENT decade, not to the end of the record. A rail that stops
     where the scanning stopped tells the reader the city stopped. */
  const now = Math.floor(new Date().getFullYear() / 10) * 10;
  const to = Math.max(now, ...(decs.length ? [Math.max(...decs)] : []));
  const lastDec = Math.floor(indexedLast / 10) * 10;
  /* The index stops INSIDE its last decade unless it happens to stop on that
     decade's ninth year. One rung on the rail can carry this and no other. */
  const cutShort = indexedLast > 0 && indexedLast - lastDec !== 9;
  const out: DecadeGroup[] = [];
  for (let dec = from; dec <= to; dec += 10) {
    const rows = bucket.get(dec) ?? [];
    out.push({
      decade: dec,
      label: `${dec}s`,
      rows,
      headline: pickHeadline(rows),
      afterSeries: dec > lastDec,
      partialTo: cutShort && dec === lastDec ? indexedLast : null,
    });
  }
  return out;
}

/**
 * A RUN OF EMPTY DECADES IS ONE ROW, NOT SIX.
 *
 * The silence is information and it is not deleted — the panel's own caption
 * under the rail says why the decades after 1999 are blank, so a rail that
 * simply dropped them would contradict copy that ships. But six identical
 * blank tracks in a column are six rows of furniture saying one thing, and on
 * a quiet block they were most of the rail's height.
 *
 * So consecutive empty decades fold into a single track labelled with the two
 * ends of the run — `1940s–1970s` — and a run of ONE is left exactly as it
 * was, because a range with the same decade at both ends is worse than the
 * decade on its own.
 *
 * **A run never crosses `afterSeries`.** An empty decade inside the Board's
 * scanned series is a silence the record observed; one past its end is a
 * decade the record never reached. They are drawn differently on purpose
 * (§14g) and folding them together would say the two are the same thing.
 */
export interface DecadeRun {
  /** the first and last decade the run covers, e.g. 2000 and 2020 */
  readonly from: number;
  readonly to: number;
  /** how many decades it folds — always 2 or more; a run of one is not a run */
  readonly n: number;
  /** `2000s–2020s`, composed from the two ends and nothing else */
  readonly label: string;
  readonly afterSeries: boolean;
}

export type RailItem =
  | { readonly kind: "decade"; readonly group: DecadeGroup }
  | { readonly kind: "gap"; readonly run: DecadeRun };

/** the rail's rows: every decade that holds something, and every silence once */
export function railItems(groups: readonly DecadeGroup[]): RailItem[] {
  const out: RailItem[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.rows.length > 0) {
      out.push({ kind: "decade", group: g });
      continue;
    }
    let j = i;
    while (
      j + 1 < groups.length &&
      groups[j + 1].rows.length === 0 &&
      groups[j + 1].afterSeries === g.afterSeries
    ) {
      j++;
    }
    if (j === i) {
      out.push({ kind: "decade", group: g });
    } else {
      out.push({
        kind: "gap",
        run: {
          from: g.decade,
          to: groups[j].decade,
          n: j - i + 1,
          label: `${g.label}–${groups[j].label}`,
          afterSeries: g.afterSeries,
        },
      });
      i = j;
    }
  }
  return out;
}

export interface BlockShape {
  readonly n: number;
  readonly firstYear: number;
  readonly lastYear: number;
  /** the decade holding the most, and how many — null when nothing stands out */
  readonly busiest: { readonly decade: number; readonly n: number } | null;
  /** the last year anything lands, when the series runs on well past it */
  readonly quietAfter: number | null;
}

export function blockShape(
  decisions: readonly BlockDecision[],
  /** the last year the shipped index reaches — see `indexedLastYear` */
  indexedLast: number = SERIES_LAST_YEAR,
): BlockShape | null {
  const years = decisions.map((d) => d.y).filter((y) => y > 0);
  if (years.length === 0) return null;
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);

  const per = new Map<number, number>();
  for (const y of years) {
    const dec = Math.floor(y / 10) * 10;
    per.set(dec, (per.get(dec) ?? 0) + 1);
  }
  let busiest: { decade: number; n: number } | null = null;
  for (const [decade, n] of per) if (!busiest || n > busiest.n) busiest = { decade, n };
  // A decade only gets named when it actually holds more than the next one.
  // "Busiest in the 1920s" over a 6/6/5 spread would be a coin toss dressed up
  // as a finding.
  if (busiest) {
    const rest = [...per.entries()].filter(([d]) => d !== busiest?.decade).map(([, n]) => n);
    const second = rest.length ? Math.max(...rest) : 0;
    if (busiest.n <= second) busiest = null;
  }

  const lastDecade = Math.floor(lastYear / 10) * 10;
  const quietAfter =
    (Math.floor(indexedLast / 10) * 10 - lastDecade) / 10 >= QUIET_DECADES
      ? lastYear
      : null;

  return { n: decisions.length, firstYear, lastYear, busiest, quietAfter };
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE LEAD — the record's own line, and why it is now the first thing on the
 * fiche.
 *
 * > "Lead with the record's own line. The most distinctive thing the Board
 * > decided on that block, near the top, in the volume's own words, with its
 * > year and a visible way to open the scanned page. That is the demo moment."
 *
 * The panel opened on demographics and put the Board's own printed sentence
 * fourth. Every open-data portal in the world has the demographics; **nobody
 * else has that sentence**, and it is the one thing on this map that a reader
 * can click through to a scan of. So the record leads.
 *
 * ── THE RANKING IS NOT RE-TUNED HERE, AND NO NEW SCORER IS ADDED ─────────
 * `pickHeadline` is the settled per-block pick — its reach window is FICHE.md
 * §12's and the four scoring passes behind the neighbourhood's own ranking are
 * §18's. This is that SAME function run over the whole block instead of over
 * one decade of it, on rows that arrive from the shard already in rank order.
 * Nothing here reorders anything.
 *
 * What is added is a READABILITY gate, ported field-for-field from
 * `build_hood_facts.classify()`'s tier 9 — the Journal's own machinery, its
 * cross-references, fragments under 40 characters, and lines a reader cannot
 * read through. It can only ever REMOVE a line from consideration; it can
 * never move one up. Without it the first sentence of the demo could be
 * *"1,588.11 December (I, 11)07 — To the Barber Asphalt l\*avinjr Company"*,
 * which is exactly what §18e was written about.
 * ──────────────────────────────────────────────────────────────────────────── */

/** the Journal's own machinery. Anchored, so a line that MENTIONS a committee
    is not demoted — only one that IS the committee's procedural note. */
const PROCEDURAL_HEAD =
  /^\s*(?:on\s+recommendation\s+of|read\s+and\s+ordered|ordered\s+filed|referred\s+to\s+(?:the\s+)?committee|passed\s+for\s+second\s+reading|finally\s+passed|action\s+deferred|adopted\s+by\s+the\s+following\s+vote|suspension\s+of\s+rules|the\s+following\s+(?:resolution|ordinance)\s+was)\b/i;
/** a pointer at the Journal's own neighbouring item. A reader cannot know what
    the preceding item was, so it can never be the face of a block. */
const SELF_REFERENTIAL = /\b(?:companion\s+measure|preceding\s+item)\b/i;
/** a digit against a letter, or a character no word carries */
const BROKEN_TOKEN = /[A-Za-z][0-9]|[0-9][A-Za-z]|[^\sA-Za-z0-9'\-/&.,;:()$%"]/;
const HAS_LETTER = /[A-Za-z]/;
const VOWEL = /[aeiouyAEIOUY]/;
const EDGE_PUNCT = /^[.,;:()[\]"']+|[.,;:()[\]"']+$/g;
const JUNK_MAX = 0.1;

/**
 * The share of a line's word tokens a reader cannot read through.
 *
 * On CHARACTERS, not on a dictionary — a spell check would throw away every
 * surname and every street the city ever named. `Sciiool` and `IVIay` are read
 * straight past; `l*avinjr` is not.
 */
function brokenFlags(line: string): boolean[] {
  return line
    .split(/\s+/)
    .filter((w) => HAS_LETTER.test(w))
    .map((w) => {
      const core = w.replace(EDGE_PUNCT, "");
      return BROKEN_TOKEN.test(core) || (core.length >= 4 && !VOWEL.test(core));
    });
}

export function junkShare(line: string): number {
  const flags = brokenFlags(line);
  if (flags.length === 0) return 1;
  return flags.filter(Boolean).length / flags.length;
}

/**
 * HOW MANY OF THE OPENING WORDS MAY BE BROKEN: none.
 *
 * MEASURED, because the 10 % share alone did not catch the line that was on
 * screen. Block 3551's 1900s face — *"Xew Series), entitled, "(Jranting
 * ]»ernnssion, during the pleasure of the Board of Supervisors, to Long
 * Syru])"* — carries exactly ONE token the character rule can see (`»ernnssion`)
 * in fourteen, which is **7.1 %** and passes a 10 % gate comfortably. It still
 * reads as a broken page, because a line is read left to right and the damage
 * is in its second word.
 *
 * Four rules were measured over 1,184 blocks and 5,509 decades that hold rows,
 * counting how many decade faces each one costs:
 *
 * ```
 *   share <= 10 %                      419  (7.6 %)   <- misses block 3551
 *   share <=  5 %                      818 (14.8 %)
 *   share <= 10 % and first 5 clean    437  (7.9 %)   <- ships
 *   share <= 10 % and first 8 clean    450  (8.2 %)
 * ```
 *
 * Zero broken tokens anywhere was measured too and costs **1,730 faces, 31.4 %
 * of the rail** — a third of the decades quotation-less to catch a defect that
 * a five-word head rule catches for three tenths of a point.
 */
const HEAD_WORDS = 5;

/**
 * THE ELLIPSIS IS OURS, NOT THE PAGE'S.
 *
 * `build_index.rec()` cuts a long sentence and marks the cut with `…`.
 * MEASURED over all 256 published shards: **15,992 rows carry the character
 * and 15,992 of them carry exactly one, at the end of the line. Not one row
 * has it anywhere else.** It is a marker this project writes, never ink the
 * Board set, and `stripTruncation` is the only place that is relied on.
 *
 * It is NOT stripped before `isPrintableLine` — see `railSilence` for why
 * that was measured and refused.
 */
const TRUNCATION_MARK = /…\s*$/;

export function stripTruncation(line: string): string {
  return line.trim().replace(TRUNCATION_MARK, "").trim();
}

/**
 * THE FILE NUMBER THE MODERN CLERK PRINTS FIRST.
 *
 * From 1999 the Board's minutes open an item with its legislative file number
 * — `160119 [Multifamily Housing Revenue Bonds - Columbia Park Apartments…]`.
 * The pre-1999 Journal never did this, so the pattern arrives with the modern
 * series and nowhere else.
 *
 * MEASURED over the 256 published shards: **439 of the 6,579 rows from 1999 on
 * (6.7%) open with six digits, and 419 of those are followed by the bracketed
 * subject — `160119 [Multifamily Housing…`. Every one of those 419 is modern.**
 * Six digits because that is the Clerk's own format: two for the year, four for
 * the sequence, so `040976` is the 976th file of 2004.
 *
 * THE BRACKET IS PART OF THE TEST, NOT DECORATION. Thirty rows before 1999 also
 * open with six digits and they are a different animal — `114210 (Second
 * Series), a copy of which has been filed…` is an ordinance number the sentence
 * needs, and `061132, Ordering the Improvement of the Crossing of…` reads as
 * prose. Matching on the digits alone would cut the subject out of those. The
 * twenty modern rows whose bracket the scanner read as `(` or `I` keep their
 * number; a visible number is cheaper than a wrong cut.
 *
 * It is stripped FROM DISPLAY ONLY. It is a real handle on a real record and
 * `d.t` keeps it; what it is not is the first thing a reader should have to
 * read, and on a narrow panel it costs the whole first line.
 */
const LEADING_FILE_NO = /^\s*\d{6}\s+(?=\[)/;

export function stripFileNumber(line: string): string {
  return line.replace(LEADING_FILE_NO, "").trim();
}

/** whether a printed line can stand on its own as the face of a block */
export function isPrintableLine(raw: string): boolean {
  const line = raw.trim();
  if (line.length < FRAGMENT_CHARS) return false;
  if (PROCEDURAL_HEAD.test(line)) return false;
  if (SELF_REFERENTIAL.test(line)) return false;
  const flags = brokenFlags(line);
  if (flags.length === 0) return false;
  if (flags.slice(0, HEAD_WORDS).some(Boolean)) return false;
  return flags.filter(Boolean).length / flags.length <= JUNK_MAX;
}

/**
 * WHY A DECADE SHOWS NO QUOTATION — THREE ANSWERS, AND THEY ARE NOT THE SAME.
 *
 * A rung whose rows all fail `isPrintableLine` printed *"The scan of this
 * decade's entries is too damaged to quote"*. On the Board's 2013 minutes that
 * sentence is **false**, and it is false in the one direction this project
 * cannot be wrong in: it blames the record for something that is ours.
 *
 * MEASURED across the 256 published shards, over every rung that has no face:
 *
 * ```
 *                     pre-1999   1999–2016
 *   no line at all          94          10
 *   cut short by US      1,410         164
 *   the scan really is
 *     damaged              495         149
 * ```
 *
 * **1,574 rungs were telling a reader the page was damaged when the whole of
 * the damage was our own `…`.** The modern era is where it was noticed — its
 * lines are longer (median 175 characters against 131) so 88.3% of modern rows
 * are truncated against 49.7% pre-1999 — but two thirds of the false sentences
 * are on the Journal, and they have been on screen the whole time.
 *
 * ── WHAT WAS MEASURED AND REFUSED ────────────────────────────────────────
 * The obvious repair is to strip `…` before the gate, so a line held back only
 * by our own marker can head its decade. **It was measured over all 5,089
 * blocks and it is much worse.** It changes 1,101 pre-1999 faces and 133
 * modern ones, and the trades run the wrong way — block 0572's 1950s goes from
 * *"Ayes: Supervisors Christopher. Fazackerley."* to a fragment, block 1424's
 * 1910s from the printed heading *"Ordering Street Work — Ninth avenue,
 * between Geary and Clement streets"* to *"Miss S. Whitmore, for four horses"*,
 * and block 0836's 1950s to *"Absent: Supervisors Casey, Rolph — 2."*
 *
 * The reason is worth writing down: **a line ending in `…` is by construction
 * a fragment, and the ellipsis gate has been an accidental truncation gate all
 * along.** Preferring a whole sentence over a cut one is the right rule for
 * the face of a decade. So the gate is left exactly as it is and not one face
 * on the rail moves; what changes is only the sentence shown where there is no
 * face, and it can only ever stop being false.
 *
 * The middle answer is claimed CONSERVATIVELY — every row has to pass once the
 * marker is removed. One genuinely broken row on the rung and the reader is
 * told the scan is damaged, which it is.
 */
/**
 * ── AND A FOURTH, WHICH `isSpeakerList` AND `isVoteTally` CREATED ────────
 *
 * Those two gates hold back rows that are perfectly legible. A rung whose only
 * readable line is a queue of speakers or a roll call now has no face, and the
 * three answers above would all describe it wrongly — `truncated` and
 * `damaged` both blame the page. Block 3752's 1960s rung caught this the hour
 * the tally gate landed: one row, unbroken, uncut, and the panel said *"Every
 * line this decade prints is cut short here."*
 *
 * `roster` is the honest fourth: the record is fine, we chose not to put THAT
 * line at the head of a decade, and the reader is told so and pointed at it.
 * It is claimed only when at least one row is readable — a rung that is also
 * damaged keeps the damaged answer, because that is the older and larger fact.
 */
export type RailSilence = "no_line" | "truncated" | "damaged" | "roster";

export function railSilence(rows: readonly BlockDecision[]): RailSilence {
  let sawLine = false;
  let sawDamage = false;
  let sawRoster = false;
  let sawOther = false;
  for (const r of rows) {
    if (!r.t.trim()) continue;
    sawLine = true;
    if (!isPrintableLine(stripTruncation(r.t))) sawDamage = true;
    /* `isPrintableLine` is the gate `pickHeadline` runs FIRST, so a row that
       fails it is not a candidate and cannot be the reason there is no face.
       Among the ones that do pass, the question is only whether a gate of
       OURS held every one of them back. Note a row cut by our own `…` can
       still pass this — one broken token in thirteen is inside the junk share
       — which is exactly why `sawOther` is counted rather than assumed. */
    if (!isPrintableLine(r.t)) continue;
    if (isSpeakerList(r.t) || isVoteTally(r.t)) sawRoster = true;
    else sawOther = true;
  }
  if (!sawLine) return "no_line";
  if (sawDamage) return "damaged";
  if (sawRoster && !sawOther) return "roster";
  return "truncated";
}

/**
 * The one line the fiche opens on, or null where the block holds nothing that
 * can stand alone — in which case the panel simply does not draw the section,
 * exactly as it does not draw a money section for a block with no money.
 */
export function blockLead(
  decisions: readonly BlockDecision[],
): BlockDecision | null {
  /* `pickHeadline` gates its own input now, so the filter that used to be here
     would run twice over the same rows and mean the same thing. */
  return pickHeadline(decisions);
}

/* ────────────────────────────────────────────────────────────────────────────
 * WHAT THE CITY KEPT DECIDING HERE — counted, never classified.
 *
 * There is no subject on a row. `f` is a phase, not a topic, and any model
 * asked what a block is "about" would be guessing in the record's voice. But
 * the Board printed its own subject above a great many of these items, in the
 * form `Street Lights — Install 400 M. R. Lombard street between Taylor and
 * Jones streets.`, and those printed subjects REPEAT: block 3752 carries
 * `Oil and Boiler Permits` seven times between 1913 and 1928 and
 * `Stable Permits` six times in 1915 alone.
 *
 * So the fiche counts them. The label is the Board's own words, cut at the
 * dash the Board itself set, and a subject is shown only when the volume
 * printed it here more than once — which is the only claim being made:
 * *the record heads this many items on this block this way.*
 *
 * MEASURED over all 256 shards, by replaying `printedHeading` + `foldHeading`
 * over every shipped row (2026-08-26): **992 of the 4,771 blocks that carry
 * anything** have at least one repeated printed heading — 30 % of blocks
 * holding 15 to 49 decisions and 60 % of those holding 50 or more, which are
 * the blocks a reader lingers on. Nothing is shown on the rest, and nothing is
 * invented to fill the gap.
 *
 * (It read 978 of 4,679, 34 % and 73 %, measured before the three rebuilds of
 * 2026-08-26. The RATE fell as the corpus grew, which is the direction that
 * matters here: the Clerk's modern items carry a bracketed title rather than a
 * dashed printed heading, so they add rows without adding subjects. Re-measure
 * these four together or not at all — a rate and its denominator drifting
 * apart is how a number stops meaning what its sentence says.)
 * ──────────────────────────────────────────────────────────────────────────── */

/** the dash the Board sets between a printed heading and the item under it */
const HEADING_DASH = /\s+[—–-]\s+/;
const LABEL_MIN = 3;
const LABEL_MAX = 60;

/**
 * The printed heading a row carries, or null.
 *
 * Only `h` and `p` rows are read: those are the two cases where the line
 * BEGINS with the heading the volume printed. A body sentence (`s`) can
 * contain a dash of its own and the text before it is not a heading, it is
 * half a sentence.
 */
export function printedHeading(d: BlockDecision): string | null {
  if (d.g !== "h" && d.g !== "p") return null;
  const parts = d.t.trim().split(HEADING_DASH);
  if (parts.length < 2) return null;
  const label = parts[0].trim().replace(/[.,;:]+$/, "").trim();
  if (label.length < LABEL_MIN || label.length > LABEL_MAX) return null;
  if (!/[A-Za-z]{3}/.test(label)) return null;
  return label;
}

/**
 * Two printings of the same subject fold together only on case, spacing,
 * trailing punctuation and a plural `s`. Nothing else: folding `Oil Permits`
 * into `Oil and Boiler Permits` would be a judgement about what those two
 * permits have in common, and the counts would stop being counts.
 */
function foldHeading(label: string): string {
  const s = label.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
  const w = s.split(" ");
  const last = w[w.length - 1];
  if (last && last.length > 3 && last.endsWith("s")) w[w.length - 1] = last.slice(0, -1);
  return w.join(" ");
}

export interface BlockSubject {
  /** the folded form — a key, never shown */
  readonly key: string;
  /** the heading in the form the volume prints most often here */
  readonly label: string;
  /** the rows the Board headed this way, still in rank order */
  readonly rows: readonly BlockDecision[];
  readonly firstYear: number;
  readonly lastYear: number;
}

/** a subject has to be printed here more than once to be a subject */
const SUBJECT_MIN = 2;

export function blockSubjects(
  decisions: readonly BlockDecision[],
  cap = 4,
): BlockSubject[] {
  const rows = new Map<string, BlockDecision[]>();
  const forms = new Map<string, Map<string, number>>();
  for (const d of decisions) {
    const label = printedHeading(d);
    if (!label) continue;
    const key = foldHeading(label);
    const list = rows.get(key);
    if (list) list.push(d);
    else rows.set(key, [d]);
    const form = forms.get(key) ?? new Map<string, number>();
    form.set(label, (form.get(label) ?? 0) + 1);
    forms.set(key, form);
  }
  const out: BlockSubject[] = [];
  for (const [key, list] of rows) {
    if (list.length < SUBJECT_MIN) continue;
    let label = "";
    let best = 0;
    for (const [form, n] of forms.get(key) ?? []) {
      if (n > best) {
        best = n;
        label = form;
      }
    }
    const years = list.map((d) => d.y).filter((y) => y > 0);
    out.push({
      key,
      label,
      rows: list,
      firstYear: years.length ? Math.min(...years) : 0,
      lastYear: years.length ? Math.max(...years) : 0,
    });
  }
  // most-printed first, and the older subject first where two are level, so
  // the order is stable and does not depend on which shard read them.
  out.sort((a, b) => b.rows.length - a.rows.length || a.firstYear - b.firstYear);
  return out.slice(0, cap);
}

/* ────────────────────────────────────────────────────────────────────────────
 * WHAT THE BLOCK IS NOW — the two files `build_block_facts.py` emits.
 *
 * The rail above answers *what did the city decide here*. It says nothing
 * about what stands on the ground today, and a reader who has just clicked a
 * shape on a map wants that first: how many people live here, what the ground
 * is used for, what it is worth — and, where the city holds a place on it,
 * what that place takes in public money.
 *
 * Both files are keyed on the SAME assessor block id `base/blocks-id.json`
 * publishes, both are fetched once and cached for the session, and both FAIL
 * SOFT: a missing file leaves the panel exactly as it was before this landed
 * rather than throwing inside a click handler.
 *
 * ── WHAT IS A JOIN HERE AND WHAT IS NOT ──────────────────────────────────
 * The roll is not a join: `wv5m-vpq2` publishes `block` as its own column.
 * The Census IS a join and it is stated on the file — see `pop` below.
 * The place is the City Facilities APN, and the two guards that keep it
 * honest live in the build script, not here. FICHE.md §9 carries the numbers.
 * ──────────────────────────────────────────────────────────────────────── */

/** the columnar file, as `build_block_facts.py --build` writes it */
export interface BlockFactsFile {
  readonly roll_year: number;
  readonly census_year: number;
  readonly useNames: readonly string[];
  readonly coverage: {
    readonly blocks_total: number;
    readonly blocks_on_the_roll: number;
    readonly blocks_with_population: number;
    /** how many blocks the roll carries no value on — 480 of 5,401 */
    readonly blocks_with_no_assessed_value: number;
    readonly census_rings: number;
    readonly census_rings_placed: number;
    readonly residents_carried: number;
    readonly residents_counted: number;
    readonly plurality_ge_90pct: number | null;
  };
  readonly b: readonly string[];
  /** parcels on the closed roll */
  readonly np: readonly number[];
  /**
   * `number_of_units` summed over the block's parcel rows. **NOT a count of
   * homes and never shown as one** — see `BlockNow.homes`. Carried because the
   * file carries its own evidence.
   */
  readonly u: readonly number[];
  /** assessed value, THOUSANDS of USD — land + improvements + fixtures */
  readonly v: readonly number[];
  /** built floor area, HUNDREDS of square feet */
  readonly ar: readonly number[];
  /** index into `useNames`; -1 where the roll gives this block no parcel */
  readonly us: readonly number[];
  /** 2020 Census residents; **-1 means NOT KNOWN, and is never shown as 0** */
  readonly pop: readonly number[];
  /** 2020 Census housing units; -1 where no census ring resolved here */
  readonly hu: readonly number[];
  /**
   * What came down. **Keyed by block id, and a block that is ABSENT is a block
   * the record does not reach — not a block where nothing was demolished.**
   * Each row is one count per decade in `demolition.decades`, then the dwelling
   * units in those buildings, then the first and last year.
   */
  readonly dem: Readonly<Record<string, readonly number[]>>;
  readonly demolition: {
    readonly dataset: string;
    readonly url: string;
    /** the decade the series opens on — 1980, and what the panel prints */
    readonly from_decade: number;
    /** the earliest COMPLETED demolition in the file — 1983, held not printed */
    readonly from_year: number;
    readonly to_year: number;
    readonly decades: readonly number[];
    readonly blocks_with_any: number;
    readonly units_demolished: number;
  };
}

/** one block's row, decoded into the units a sentence is written in */
export interface BlockNow {
  readonly parcels: number;
  /**
   * **NOT the roll's `number_of_units`.** That field reads 0 on every
   * CONDOMINIUM parcel, because there the parcel IS the home: 155,111 Single
   * Family Residential rows carry 121,707 units between them city-wide, and
   * block 0311 — a downtown tower of 76 condominium parcels — reads **11**.
   * `homes` is the 2020 Census's own HU100 for the ring that resolved here,
   * which reads 76 on that block and 406,628 city-wide, the published county
   * total. It comes from the same ring and the same rule as `residents`, so
   * the two are present or absent together and never disagree about which
   * ground they describe.
   */
  readonly homes: number | null;
  /** assessed value in whole USD */
  readonly valueUsd: number;
  /** built floor area in square feet */
  readonly builtSqFt: number;
  /**
   * The use the most parcels here are on the roll under, **in the roll's own
   * words** — one of nine: Single Family Residential, Multi-Family
   * Residential, Miscellaneous/Mixed-Use, Commercial Misc, Commercial Retail,
   * Industrial, Commercial Office, Commercial Hotel, Government. An earlier
   * cut folded these onto the seven classes the map colours buildings by and
   * turned `Government` into "hotel / institutional"; nothing is folded now.
   */
  readonly use: string | null;
  /**
   * the residents the 2020 Census counted, or **null where no census ring
   * resolved onto this block**. Null is not zero and must never be drawn as
   * one: 810 of the 5,404 blocks are in that state and a "0 residents" on a
   * block the Census simply did not reach here would be a claim nobody made.
   */
  readonly residents: number | null;
  readonly rollYear: number;
  readonly censusYear: number;
}

/**
 * WHAT CAME DOWN ON THIS BLOCK, and the seventy-year hole underneath it.
 *
 * The building layer of this map is **survivorship only**: every footprint in
 * `ynuv-fyni` is a building standing today, drawn in every year. This is the
 * one published file that puts a dated, located removal back, and it starts in
 * **1980**. DATA-TRUTH.md §4 measured what is on the other side of that line:
 *
 *   1906        36 CITY buildings out of the fire schedule. Not private stock.
 *   1907–1979   **nothing per building.** The Board's Journal names the
 *               Redevelopment Agency 227 times in 1960–75 and enumerates an
 *               individual demolition 49 times — it approved the clearance
 *               without recording what came down.
 *
 * So `total === 0` here means **the record does not reach this block**, and the
 * panel says the 1980 floor whether or not the block has anything. The Western
 * Addition is why: it was cleared before this series begins, and a silent zero
 * there would be the most misleading sentence on the site.
 */
export interface BlockDemolitions {
  /** completed demolition permits on this block, 0 where the record has none */
  readonly total: number;
  /** one `{decade, n}` per decade of the series, EMPTY ONES INCLUDED */
  readonly byDecade: readonly { readonly decade: number; readonly n: number }[];
  /** dwelling units the roll recorded in those buildings, 0 where none */
  readonly units: number;
  /** first and last year something came down here, null when nothing did */
  readonly firstYear: number | null;
  readonly lastYear: number | null;
  /**
   * The decade the series opens on — **1980, and it goes on the face of the
   * section.** Not `from_year`: DBI's permit file opens in 1980 (one permit of
   * 7,310 was filed before it) but the earliest COMPLETED demolition is March
   * 1983, and "since 1983" would understate how far back a reader may look
   * while "since 1980" is what the rail actually draws.
   */
  readonly recordFrom: number;
  readonly recordTo: number;
}

export function blockDemolitions(
  file: BlockFactsFile,
  blockId: string,
): BlockDemolitions {
  const d = file.demolition;
  const row = file.dem?.[blockId];
  const decs = d?.decades ?? [];
  if (!row || row.length < decs.length + 3) {
    return {
      total: 0, byDecade: [], units: 0, firstYear: null, lastYear: null,
      recordFrom: d?.from_decade ?? 1980, recordTo: d?.to_year ?? 0,
    };
  }
  const counts = row.slice(0, decs.length);
  return {
    total: counts.reduce((a, b) => a + b, 0),
    byDecade: decs.map((decade, i) => ({ decade, n: counts[i] ?? 0 })),
    units: row[decs.length] ?? 0,
    firstYear: row[decs.length + 1] ?? null,
    lastYear: row[decs.length + 2] ?? null,
    recordFrom: d.from_decade,
    recordTo: d.to_year,
  };
}

/** one published place standing on this block, and what it takes */
export interface BlockPlace {
  readonly slug: string;
  readonly name: string;
  readonly kind: string | null;
  readonly dept: string | null;
  /** the place's own buildings whose published APN names THIS block */
  readonly here: readonly { readonly name: string | null; readonly sqft: number }[];
  readonly here_sqft: number;
  readonly place_sqft: number;
  /** how many blocks the place stands on — the figures below are all of it */
  readonly n_blocks: number;
  readonly n_contracts: number;
  readonly agreed_usd: number;
  readonly paid_usd: number;
  readonly n_payees: number;
  readonly payees_paid_usd: number;
  readonly n_documents: number;
}

export interface BlockMoneyFile {
  readonly coverage: {
    readonly blocks_total: number;
    readonly blocks_with_a_place: number;
    readonly blocks_with_a_money_figure: number;
    readonly places_published: number;
    readonly places_resolved_to_a_block: number;
    readonly places_unresolved: number;
  };
  /** `/us/city/sf/places/place/{slug}` */
  readonly href: string;
  readonly b: Readonly<Record<string, readonly BlockPlace[]>>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE NEIGHBOURHOOD — the same four answers, one level up.
 *
 * "I'd rather something more about a neighbourhood than hyper localized
 * blocks." The block is not thrown away: it becomes a DETAIL INSIDE the
 * neighbourhood. Everything below aggregates the two block files above, over
 * the membership `base/blocks.qc` already ships as `hood` — DataSF's 41
 * Analysis Neighborhoods (`ajp5-b2md`), the same index `CityMap` has been
 * reading all along to print the panel's subtitle.
 *
 * ── WHY THIS IS A LARGE WIN AND NOT A LATERAL MOVE ───────────────────────
 *                                blocks              neighbourhoods
 *   a money figure          30 of 5,404 (0.6 %)      20 of 41 (49 %)
 *   a published place       66 of 5,404 (1.2 %)      27 of 41 (66 %)
 *   a Census count       4,594 of 5,404 (85 %)       41 of 41 (100 %)
 *   the Board's record   4,679 of 5,404 (87 %)       40 of 41 (98 %)
 *
 * ── AGGREGATION MUST NOT LAUNDER A GAP ───────────────────────────────────
 * A rolled-up figure that does not say what it is rolled up from implies a
 * coverage it has not got. South of Market reads $776.3 M agreed and that is
 * ONE place of the four standing there. So `places` and `places_with_a_figure`
 * are on every record, the largest figure is NAMED in `top`, and the panel
 * says both — never a district total nobody measured. The same for residents:
 * only 2 of the 41 hoods have a Census ring on every block, so
 * `residents_blocks` ships beside `blocks`.
 * ──────────────────────────────────────────────────────────────────────── */

/** one curated line of the Board's own, and where it was printed */
export interface HoodHighlight {
  /** the sentence, as the volume prints it */
  readonly t: string;
  readonly y: number;
  /** "<volume>/<leaf>" — the scan leaf, so every highlight is clickable */
  readonly u: string;
  /** the block this printing sits on */
  readonly b: string;
  readonly k: string;
  readonly p: number;
  /** 1 heading · 2 heading+item · 3 addressed · 4 placed. 9 is never emitted. */
  readonly tier: number;
  readonly type: string;
  /** how many printings folded into this one */
  readonly n: number;
  /**
   * **How many of the neighbourhood's own blocks this same printed subject
   * lands on.** A count, not a judgement, and the one signal a block cannot
   * carry: it is the difference between a decision that touched one corner and
   * one that reorganised a district.
   */
  readonly nb: number;
  /**
   * How DISTINCTIVE the line's words are to this neighbourhood — the mean
   * inverse hood-frequency of its three most unusual words. 0 for a line made
   * of the boilerplate every neighbourhood's record carries.
   */
  readonly d: number;
  /**
   * `d * nb`, and the sort inside a tier. Ranking on `nb` alone surfaced the
   * most administratively SPREAD item, which is reliably the least interesting
   * one — routine paving touches many blocks — so Lone Mountain/USF led with a
   * hearing on an appeal against a sidewalk assessment. Both halves ship so a
   * reader of the file can see why a line is at the top and not only that it
   * is. `build_hood_facts.py` carries the two scores that were tried and
   * rejected before this one.
   */
  readonly score: number;
  readonly y0: number;
  readonly y1: number;
  /** the largest single figure printed on any of the folded rows, 0 where none */
  readonly a: number;
}

export interface HoodRecord {
  readonly i: number;
  readonly name: string;
  readonly blocks: number;
  /** 2020 Census, summed over the blocks the ring join reaches */
  readonly residents: number;
  readonly homes: number;
  /** how many of `blocks` a Census ring resolved onto — the denominator */
  readonly residents_blocks: number;
  /** the roll's own dominant use across the hood's blocks, verbatim */
  readonly use: string | null;
  readonly use_blocks: number;
  readonly record: {
    readonly n: number;
    readonly blocks: number;
    readonly y0: number;
    readonly y1: number;
    /** [decade, count], ascending */
    readonly dec: readonly (readonly number[])[];
  };
  readonly money: {
    readonly places: number;
    readonly places_with_a_figure: number;
    readonly n_contracts: number;
    readonly agreed_usd: number;
    readonly paid_usd: number;
    readonly n_payees: number;
    readonly payees_paid_usd: number;
    /** the largest figure in the hood, named — so a total can never imply coverage */
    readonly top: {
      readonly slug: string;
      readonly name: string;
      readonly agreed_usd: number;
      readonly paid_usd: number;
      readonly n_blocks: number;
    } | null;
    readonly names: readonly string[];
  };
  readonly highlights: readonly HoodHighlight[];
  readonly highlights_hidden: number;
}

export interface HoodFactsFile {
  readonly roll_year: number;
  readonly census_year: number;
  readonly source: { readonly dataset: string; readonly url: string };
  readonly curation: { readonly cap: number };
  readonly coverage: {
    readonly hoods: number;
    readonly blocks: number;
    readonly hoods_with_residents: number;
    readonly hoods_with_a_record: number;
    readonly hoods_with_a_place: number;
    readonly hoods_with_a_money_figure: number;
    readonly hoods_where_every_block_has_a_census_ring: number;
    readonly residents_carried: number;
    readonly residents_counted: number;
    readonly blocks_with_a_money_figure: number;
    readonly places_straddling_two_hoods: readonly string[];
  };
  readonly hoods: readonly HoodRecord[];
}

let factsPromise: Promise<BlockFactsFile | null> | null = null;
let moneyPromise: Promise<BlockMoneyFile | null> | null = null;
let hoodPromise: Promise<HoodFactsFile | null> | null = null;
let factsRow: Map<string, number> | null = null;

/** fetch once, and never let a missing file take the panel down with it */
function loadSoft<T>(url: string): Promise<T | null> {
  return fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
}


/**
 * THE JUDGED LEADS — a small, honest, PARTIAL seed.
 *
 * > "why you using rarity — you're an LLM, you have intelligence, you can
 * > decide what's most relevant to humans and stands out."
 *
 * Correct, and a rarity score was tried and stopped for exactly this. Ranking
 * by how unusual a line's words are is a proxy for judgement invented because
 * judgement was not available; what it surfaces is surnames and scanning
 * damage. **Selecting which real line to show is not writing prose** — the
 * shown text is the volume's own, verbatim, always — so the choice is made by
 * reading, once, and cached.
 *
 * THE RUBRIC IS IN `block-leads.json` ITSELF, beside the count of how many
 * blocks it was actually applied to. **It is a handful, not 4,679**, and the
 * file says so in a field named to be impossible to skim past. Every other
 * block falls back to `blockLead()`, which is a readability gate over the
 * pipeline's existing rank order and is NOT a judgement about significance.
 * Nothing on the panel claims otherwise.
 *
 * The seed stores `u` and the first 56 characters, never the line: the shown
 * text is always the shard's own, so a stale seed can only fail to match and
 * fall back — it can never put words on the page the record does not hold.
 */
export interface BlockLeadPicks {
  readonly meta: Record<string, unknown>;
  readonly pick: Record<string, { readonly u: string; readonly y: number; readonly t0: string }>;
}

export function loadBlockLeadPicks(): Promise<BlockLeadPicks | null> {
  return loadSoft<BlockLeadPicks>(`${BASE}/block-leads.json`);
}

/** the judged line for this block, or null — never a line the shard lacks */
export function judgedLead(
  picks: BlockLeadPicks | null,
  blockId: string,
  decisions: readonly BlockDecision[],
): BlockDecision | null {
  const p = picks?.pick?.[blockId];
  if (!p) return null;
  return decisions.find((d) => d.u === p.u && d.t.trim().startsWith(p.t0)) ?? null;
}

export function loadBlockFacts(): Promise<BlockFactsFile | null> {
  if (!factsPromise) factsPromise = loadSoft<BlockFactsFile>(`${BASE}/block-facts.json`);
  return factsPromise;
}

export function loadBlockMoney(): Promise<BlockMoneyFile | null> {
  if (!moneyPromise) moneyPromise = loadSoft<BlockMoneyFile>(`${BASE}/block-money.json`);
  return moneyPromise;
}

/** 81 KB, one fetch for the session, and it fails soft like the other two */
export function loadHoodFacts(): Promise<HoodFactsFile | null> {
  if (!hoodPromise) hoodPromise = loadSoft<HoodFactsFile>(`${BASE}/hood-facts.json`);
  return hoodPromise;
}

/**
 * The neighbourhood the map's own `hood` index names.
 *
 * Looked up by INDEX, not by name. `build_hood_facts.py` reads the same u8
 * field `CityMap` reads, so the two are the same array position and a name
 * comparison would be a second membership waiting to disagree with the first.
 */
export function hoodAt(file: HoodFactsFile, i: number): HoodRecord | null {
  if (i < 0) return null;
  const h = file.hoods[i];
  return h && h.i === i ? h : (file.hoods.find((x) => x.i === i) ?? null);
}

/**
 * The busiest decade of a neighbourhood's record, or null when nothing leads.
 *
 * Same rule as `blockShape.busiest` and for the same reason: naming a decade
 * over a 6/6/5 spread is a coin toss dressed as a finding. One level up the
 * spreads are much larger, so this almost always answers — which is the point.
 */
export function hoodBusiest(h: HoodRecord): { decade: number; n: number } | null {
  let best: { decade: number; n: number } | null = null;
  let second = 0;
  for (const row of h.record.dec) {
    const [decade, n] = [row[0] ?? 0, row[1] ?? 0];
    if (!best || n > best.n) {
      second = best ? best.n : second;
      best = { decade, n };
    } else if (n > second) second = n;
  }
  return best && best.n > second ? best : null;
}

/**
 * The block's row, decoded.
 *
 * `b[]` here is the file's OWN id array and is not assumed to be in the same
 * order as `block-index.json`'s — the two are built by different scripts and
 * one of them ships only the blocks that carry something, so they are joined
 * by id and the index is built once.
 */
export function blockNow(file: BlockFactsFile, blockId: string): BlockNow | null {
  if (!factsRow || factsRow.size !== file.b.length) {
    factsRow = new Map(file.b.map((id, i) => [id, i]));
  }
  const i = factsRow.get(blockId);
  if (i === undefined) return null;
  const useIdx = file.us[i] ?? -1;
  const pop = file.pop[i] ?? -1;
  const hu = file.hu[i] ?? -1;
  return {
    parcels: file.np[i] ?? 0,
    homes: hu >= 0 ? hu : null,
    valueUsd: (file.v[i] ?? 0) * 1000,
    builtSqFt: (file.ar[i] ?? 0) * 100,
    use: useIdx >= 0 ? (file.useNames[useIdx] ?? null) : null,
    residents: pop >= 0 ? pop : null,
    rollYear: file.roll_year,
    censusYear: file.census_year,
  };
}

/** every published place whose own facility APN names this block */
export function blockPlaces(
  file: BlockMoneyFile,
  blockId: string,
): readonly BlockPlace[] {
  return file.b[blockId] ?? [];
}

/**
 * A place carries a money figure only when a city ledger names it. 33 of the
 * 5,404 blocks are in that state and the panel says so rather than letting a
 * silent absence read as "this place costs nothing".
 */
export function hasMoney(p: BlockPlace): boolean {
  return p.n_contracts > 0 || p.n_payees > 0;
}

export function placeHref(file: BlockMoneyFile, slug: string): string {
  return file.href.replace("{slug}", slug);
}

/**
 * `$776,309,499` is unreadable in a 252 px margin and `$776.3M` is what the
 * figure is worth to a reader placing it. Rounded DOWN in magnitude, never up,
 * so the short form never overstates the published number.
 *
 * **Under a million the figure is printed in full.** City Hall's one contract
 * is $5,617 agreed and $3,175 paid; abbreviating those to `$5k` and `$3k`
 * throws away most of what was published to save four characters, and a
 * four-figure sum is not a sum a reader needs help placing.
 */
export function usdShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(Math.trunc(n / 1e8) / 10).toFixed(1)}bn`;
  if (a >= 1e6) return `$${(Math.trunc(n / 1e5) / 10).toFixed(1)}M`;
  return `$${new Intl.NumberFormat("en-US").format(Math.trunc(n))}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE UNITS A PERSON ACTUALLY THINKS IN
 *
 * Nobody thinks "block 4087". They think *my street*, *my building*, *my
 * neighbourhood*. The block is what the map can draw and click; it is not what
 * a reader came for, and it should hand them onward rather than pretend to be
 * a destination.
 *
 * The addresses on a block ARE a subset of that block's own records, so this
 * needs no new file — `CityBlockPanel` already holds everything it reads.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The Journal spells its street numbers out — `2707 Twenty-first street` —
 * and the modern Clerk does not — `1234 Great Highway`. Both are the same door
 * and both have to fold onto one key or an address fiche splits in two.
 */
const ORDINAL_WORD: Record<string, string> = {
  first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th",
  sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th",
  eleventh: "11th", twelfth: "12th", thirteenth: "13th", fourteenth: "14th",
  fifteenth: "15th", sixteenth: "16th", seventeenth: "17th",
  eighteenth: "18th", nineteenth: "19th", twentieth: "20th",
  "twenty-first": "21st", twentyfirst: "21st", "twenty-second": "22nd",
  twentysecond: "22nd", "twenty-third": "23rd", twentythird: "23rd",
  "twenty-fourth": "24th", twentyfourth: "24th", "twenty-fifth": "25th",
  twentyfifth: "25th", "twenty-sixth": "26th", twentysixth: "26th",
  "twenty-seventh": "27th", "twenty-eighth": "28th", "twenty-ninth": "29th",
  thirtieth: "30th",
};

const SUFFIX: Record<string, string> = {
  street: "St", st: "St", avenue: "Ave", ave: "Ave", boulevard: "Blvd",
  blvd: "Blvd", road: "Rd", rd: "Rd", drive: "Dr", dr: "Dr", way: "Way",
  place: "Pl", pl: "Pl", court: "Ct", ct: "Ct", terrace: "Terrace",
  alley: "Alley", lane: "Lane", highway: "Highway",
};

/**
 * A house number, then one to three name words, then a street type.
 *
 * The name word may itself be a NUMBER — `3801 Third Street` and `3801 3rd St`
 * are the same door, and half of San Francisco's grid is numbered. A first cut
 * required the name to open with a letter and silently matched neither `21st`
 * nor `3rd`, which would have dropped every modern record on a numbered street
 * while keeping the Journal's spelled-out `Twenty-first`.
 */
const ADDRESS = new RegExp(
  String.raw`\b(\d{1,5})(?:\s?[-–]\s?\d{1,5})?\s+` +
  String.raw`((?:(?:\d{1,3}(?:st|nd|rd|th)|[A-Za-z][A-Za-z'.-]*)\s+){1,3}?)` +
  String.raw`(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|way|place|pl|court|ct|terrace|alley|lane|highway)\b`,
  "gi",
);

/** words that are never part of a street's name, however the OCR ran them in */
const NOT_A_NAME = new Set([
  "the", "of", "and", "at", "on", "in", "to", "from", "said", "a", "an",
  "portion", "portions", "side", "sides", "corner", "corners", "line",
  "lines", "between", "including", "crossing", "intersection", "north",
  "south", "east", "west", "northerly", "southerly", "easterly", "westerly",
]);

export interface BlockAddress {
  /** the folded key — `2707 21st st`, lowercase, one per door */
  readonly key: string;
  /** what to print — `2707 Twenty-first Street`, as the volume set it */
  readonly label: string;
  readonly n: number;
  readonly y0: number;
  readonly y1: number;
  readonly rows: readonly BlockDecision[];
}

function foldAddress(num: string, name: string, suf: string): {
  key: string; label: string;
} | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return null;
  if (words.some((w) => NOT_A_NAME.has(w.toLowerCase()))) return null;
  const keyName = words
    .map((w) => ORDINAL_WORD[w.toLowerCase().replace(/[.,]/g, "")] ?? w.toLowerCase())
    .join(" ");
  const sufKey = SUFFIX[suf.toLowerCase()] ?? suf;
  return {
    key: `${num} ${keyName} ${sufKey}`.toLowerCase(),
    label: `${num} ${words.join(" ")} ${sufKey}`,
  };
}

/**
 * Every address the record NAMES on this block, most-recorded first.
 *
 * Read from `addr`-precision rows only. That tier is a house number the
 * pipeline already checked falls inside this block's own parcel range, so the
 * claim "the record places this at 2707 Twenty-first Street" is the pipeline's
 * and not a guess made in the browser. A number lifted out of a street-tier
 * sentence would be neither.
 */
export function blockAddresses(
  decisions: readonly BlockDecision[],
): BlockAddress[] {
  const by = new Map<string, { label: string; rows: BlockDecision[] }>();
  for (const d of decisions) {
    if (d.p !== ADDR_TIER) continue;
    const t = d.t ?? "";
    ADDRESS.lastIndex = 0;
    let m: RegExpExecArray | null;
    const found = new Map<string, string>();
    while ((m = ADDRESS.exec(t)) !== null) {
      const f = foldAddress(m[1], m[2], m[3]);
      if (f && !found.has(f.key)) found.set(f.key, f.label);
    }
    /* ── A LIST IS NOT A CLAIM ABOUT A DOOR ────────────────────────────────
       The tier says SOME number in this line falls inside this block's parcel
       range. Where the line names one, that is the door. Where it names five
       it is a table covering the city — a 1986 assessment row on a Mission
       block reads *"1721 Cabrillo Street … 2270-2272 Bryant Street … 107
       Maywood Drive"* — and we cannot tell which one the pipeline matched, so
       naming any of them puts a Richmond address on a Mission fiche. It did,
       and that is how this was found.

       MEASURED over the 14,823 distinct `addr`-tier records: 10,253 name
       exactly one address (69.2 %), 913 name two, 488 name three or more.
       Dropping everything but the single-address rows costs 12 % of the doors
       and removes every wrong one. */
    if (found.size !== 1) continue;
    const [key, label] = [...found][0];
    const e = by.get(key);
    if (e) e.rows.push(d);
    else by.set(key, { label, rows: [d] });
  }
  const out: BlockAddress[] = [];
  for (const [key, v] of by) {
    const ys = v.rows.map((r) => r.y);
    out.push({
      key,
      label: v.label,
      n: v.rows.length,
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      rows: v.rows,
    });
  }
  // most-recorded first, and the most recent of a tie first — a reader
  // recognises a door by what happened at it lately, not alphabetically.
  out.sort((a, b) => b.n - a.n || b.y1 - a.y1 || a.label.localeCompare(b.label));
  return out;
}

/* ── the threads ─────────────────────────────────────────────────────────── */

export interface ThreadRecord {
  readonly s: string;
  readonly l: string;
  /**
   * THE PATTERN THE BUILD RAN — and the browser no longer runs it.
   *
   * It used to. The reasoning was that the browser holds the records of
   * whatever the reader is looking at, so it can only say *"this subject is
   * here, N times"* if it repeats the build's match. That was true and the
   * consequence was not noticed: the browser holds `t`, ONE LINE of a median
   * 136 characters, while the record behind it has a median of 520. The same
   * forty-one patterns reach 35% of records against the line and 51% against
   * the record. The gap was being read as *"the subjects are not
   * exhaustive"* when it was only ever *"the browser cannot see the text"*.
   *
   * So the match now happens in the pipeline and arrives as `sm` on each row.
   * `p` still ships — it is what `bit` MEANS, and a reader auditing a subject
   * should be able to see the rule — but nothing matches with it while
   * `ThreadsFile.tagged_in_pipeline` is true.
   */
  readonly p: string;
  /** which bit of a row's `sm` this subject occupies */
  readonly bit?: number;
  readonly era: string;
  readonly note: string;
  readonly n: number;
  readonly y0: number;
  readonly y1: number;
  readonly dec: readonly (readonly [number, number])[];
  readonly b: readonly string[];
  readonly map: boolean;
  readonly ex: readonly { y: number; t: string; u: string; b: string }[];
}

export interface ThreadsFile {
  readonly n_records: number;
  readonly n_tagged: number;
  /**
   * The tree carries `sm` on every row, so match by bit and never by pattern.
   * Absent on a tree published before 2026-08-29, where the pattern is all
   * there is — hence the fallback in `subjectHits` rather than an assumption.
   */
  readonly tagged_in_pipeline?: boolean;
  readonly threads: readonly ThreadRecord[];
}

let threadsPromise: Promise<ThreadsFile | null> | null = null;

export function loadThreads(): Promise<ThreadsFile | null> {
  if (!threadsPromise) threadsPromise = loadSoft<ThreadsFile>(`${BASE}/threads.json`);
  return threadsPromise;
}

/** membership is a set built once per file, not a scan of 41 arrays per block */
const threadIndex = new WeakMap<ThreadsFile, Map<string, ThreadRecord[]>>();

export function threadsAt(
  file: ThreadsFile | null,
  blockId: string,
): ThreadRecord[] {
  if (!file) return [];
  let idx = threadIndex.get(file);
  if (!idx) {
    idx = new Map();
    for (const th of file.threads) {
      for (const b of th.b) {
        const cur = idx.get(b);
        if (cur) cur.push(th);
        else idx.set(b, [th]);
      }
    }
    threadIndex.set(file, idx);
  }
  // rarest first: a block that is on `Paving and grading` like 2,072 others
  // learns nothing from saying so, and `Libraries` on 49 blocks is the whole
  // reason the chip exists.
  return (idx.get(blockId) ?? []).slice().sort((a, b) => a.n - b.n);
}

/**
 * WHAT KEEPS COMING UP WHERE THE READER IS STANDING.
 *
 * `threadsAt` answers membership — *is this block on this subject at all* —
 * off the thread's own block list. This answers the question a reader
 * actually has, which is **how much of what I am reading is about this**, and
 * it can only be answered by matching the records in hand.
 *
 * THE COUNT IS OF THESE RECORDS AND NOTHING ELSE. That is why the unit
 * matters: a block, a street and a door each hold their whole record here, so
 * the number under a chip is exact for the thing on screen. A NEIGHBOURHOOD
 * DOES NOT — `hood/<i>.json` ships twelve rows a decade out of hundreds, by
 * design — so the caller must not run this over a neighbourhood's rows and
 * print the answer as the neighbourhood's. It would be a count of the
 * selection wearing the neighbourhood's name.
 *
 * TWO RULES CARRIED OVER, both from things this page has already got wrong:
 *
 * 1. **A subject has to land more than once.** The removed `blockSubjects`
 *    chips had this rule and it is the whole reason they were quiet on thin
 *    ground. One paving record on a block is not what the block is about.
 * 2. **Identity is the page plus the line**, `(u, t[:120])` — the same key
 *    `build_threads.py` dedupes on. A record printed at a corner is stored on
 *    every block that corner touches, and within one unit the same line can
 *    arrive twice from two shards.
 *
 * Rarest-first, like `threadsAt`, and for the same reason: `Paving and
 * grading` on 2,073 blocks tells a reader nothing they could not have
 * guessed, and the rare one is the point.
 */
/**
 * `blocks/subjects.json` — WHAT A ROW'S `sm` BIT MEANS.
 *
 * `build_index.py` already tags every placed decision with these same forty-one
 * subjects, and it does it against **the item's own source text** rather than
 * the shortened line it publishes on the row. Its own note says why: the
 * published line is a median of 136 characters and the item behind it 520.
 *
 * The answer has been riding on every row as `sm`, a bitmask, and the browser
 * could not read it because this table was never published. So the fiche went
 * on running the patterns itself over the short line. MEASURED across the
 * shipped shards: the mask knows a subject for **56,975 rows**; re-running the
 * patterns here finds **32,142**.
 *
 * A bit is a POSITION in that authored list, and the masks in the published
 * shards are positional, so this is matched by `slug` to the thread carrying
 * the city-wide shape — never by index into two files that can drift.
 */
export interface SubjectsFile {
  readonly n: number;
  readonly s: readonly {
    readonly bit: number;
    readonly slug: string;
    readonly l: string;
    readonly note: string;
  }[];
}

let subjectsPromise: Promise<SubjectsFile | null> | null = null;

export function loadSubjects(): Promise<SubjectsFile | null> {
  if (!subjectsPromise) {
    subjectsPromise = loadSoft<SubjectsFile>(`${BASE}/subjects.json`);
  }
  return subjectsPromise;
}

export interface ThreadHere {
  readonly thread: ThreadRecord;
  /** the records of the unit on screen that this pattern matched */
  readonly rows: readonly BlockDecision[];
  readonly y0: number;
  readonly y1: number;
}

const rxCache = new Map<string, RegExp | null>();

function threadRx(p: string): RegExp | null {
  const hit = rxCache.get(p);
  if (hit !== undefined) return hit;
  let rx: RegExp | null = null;
  try {
    rx = new RegExp(p, "i");
  } catch {
    /* one engine rejected it — that costs this subject and nothing else */
  }
  rxCache.set(p, rx);
  return rx;
}

/**
 * The rows of a subject, out of whatever rows you hand it.
 *
 * `threadsIn` picks the subjects AND counts them, which is right where the
 * caller holds a complete record. The neighbourhood does not: its subjects are
 * counted in the pipeline over every row and shipped, while the browser holds
 * twelve rows a decade. So it needs the second half on its own — give it the
 * subject and the rows it has, and it gets back the ones that match, with the
 * count left to whoever knows the true one.
 */
/**
 * Does this row belong to this subject — asked in ONE place, so the two
 * callers below cannot answer it differently.
 *
 * By bit when the tree is tagged, which is the pipeline's answer read off the
 * record. By pattern only against a tree published before the tag existed,
 * where the line is all there is; that path is the OLD, 35% answer and is kept
 * solely so an older tree still renders rather than going blank.
 */
function subjectHit(
  file: ThreadsFile | null,
  thread: ThreadRecord,
  row: BlockDecision,
): boolean {
  if (file?.tagged_in_pipeline && thread.bit !== undefined) {
    const sm = row.sm;
    if (sm === undefined) return false;
    /* `sm` runs past 32 bits — 41 subjects — and JavaScript's `>>` and `&`
       coerce to int32, which would silently drop every subject from 32 up.
       Divide and floor instead: the value is an exact integer well inside
       Number.MAX_SAFE_INTEGER. */
    return Math.floor(sm / 2 ** thread.bit) % 2 === 1;
  }
  const rx = threadRx(thread.p);
  return rx ? rx.test(row.t ?? "") : false;
}

export function threadRows(
  thread: ThreadRecord,
  rows: readonly BlockDecision[],
  file: ThreadsFile | null = null,
): BlockDecision[] {
  return rows
    .filter((r) => subjectHit(file, thread, r))
    .slice()
    .sort((a, b) => b.y - a.y || (b.d ?? "").localeCompare(a.d ?? ""));
}

/**
 * Is subject `bit` set on this row's mask?
 *
 * DIVISION AND MODULO, NOT `&` AND `<<`. JavaScript's bitwise operators coerce
 * to int32 and there are 41 subjects, so `sm & (1 << 34)` silently reads bit 2
 * instead of bit 34. Four subjects sit past bit 32 — `Liquor licences` among
 * them, one of the busiest in the record — and they would have gone missing
 * without a single error anywhere.
 */
function subjectSet(sm: number, bit: number): boolean {
  return Math.floor(sm / Math.pow(2, bit)) % 2 === 1;
}

export function threadsIn(
  file: ThreadsFile | null,
  subjects: SubjectsFile | null,
  rows: readonly BlockDecision[],
  minHits = 2,
): ThreadHere[] {
  if (!file || !subjects || rows.length === 0) return [];
  const seen = new Set<string>();
  const uniq: BlockDecision[] = [];
  for (const r of rows) {
    const t = (r.t ?? "").trim();
    if (!t) continue;
    const key = `${r.u ?? ""} ${t.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }

  /* ── READ, NOT RE-MATCHED ──────────────────────────────────────────────
     This compiled the shipped patterns and ran them here, over `t`. `t` is the
     SHORTENED line — a median of 136 characters against the 520 of the item
     behind it — so a subject word past the cut was invisible and the count
     under a chip was of a fragment rather than of the record.

     `build_index.py` already tags every placed decision against the item's own
     source text and carries the answer on the row as `sm`. MEASURED over the
     shipped shards: the mask knows a subject for 56,975 rows where re-matching
     here found 32,142. Same forty-one subjects, same patterns, same author —
     read at full length instead of at 136 characters.

     Joined by SLUG: `subjects.json` is ordered by bit and `threads.json` by
     size, so joining them on position would relabel every subject. */
  const bySlug = new Map(file.threads.map((t) => [t.s, t]));
  const buckets = new Map<string, BlockDecision[]>();
  for (const r of uniq) {
    const sm = r.sm;
    if (!sm) continue;
    for (const sub of subjects.s) {
      if (!subjectSet(sm, sub.bit)) continue;
      const cur = buckets.get(sub.slug);
      if (cur) cur.push(r);
      else buckets.set(sub.slug, [r]);
    }
  }

  const out: ThreadHere[] = [];
  for (const [slug, hits] of buckets) {
    const thread = bySlug.get(slug);
    if (!thread || hits.length < minHits) continue;
    /* ── WHAT THE READER CAN SEE FIRST ─────────────────────────────────
       The mask is matched against the item's FULL text and the row publishes a
       FRAGMENT of it. MEASURED over the shipped shards: of 78,837 subject
       marks, **only 41 % are visible in the line printed on the row**. So a
       reader who presses `Liquor licences · 28` and reads down the list meets
       rows that never mention liquor — the mark is right about the decision
       and the line is too short to show it.

       The count stays the mask's, because the mask is the true one. The ORDER
       does not: the rows whose own line carries the subject come first, so the
       evidence is what a reader meets and the rest follows. Nothing is hidden
       and nothing is claimed that the reader cannot check at the top of the
       list.

       Within each half, newest first — the Board printed most items twice, a
       first reading and a final passage weeks apart, and file order put them
       out of sequence so they read as a duplicate. */
    const rx = threadRx(thread.p);
    const shows = (r: BlockDecision) => (rx && rx.test(r.t ?? "") ? 0 : 1);
    const sorted = hits
      .slice()
      .sort(
        (a, b) =>
          shows(a) - shows(b) ||
          b.y - a.y ||
          (b.d ?? "").localeCompare(a.d ?? ""),
      );
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const h of sorted) {
      if (h.y < y0) y0 = h.y;
      if (h.y > y1) y1 = h.y;
    }
    out.push({ thread, rows: sorted, y0, y1 });
  }

  /* ── RANKED BY LIFT, DAMPED ────────────────────────────────────────────
     This sorted RAREST CITY-WIDE first, on the reasoning that a block on
     `Paving and grading` like 2,072 others learns nothing from saying so. Right
     about the problem, and the fix over-corrected: it dropped local strength
     from the ranking altogether, and on block 3752 — 33 horse permits and 27
     liquor licences — it led with `Streets closed for good (2)`.

     Lift is the share here over the share across the map, damped by
     `n / (n + 3)` because lift is loud at small n: two hits on a rare subject
     was outranking thirty on a real one. Measured at k = 0, 3 and 6 — at 6 the
     ranking flattens back into a plain count. Ties break on the local count. */
  const total = file.n_records || 1;
  const DAMP = 3;
  const score = (h: ThreadHere) => {
    const lift =
      (h.rows.length / uniq.length) / Math.max(h.thread.n / total, 1e-9);
    return lift * (h.rows.length / (h.rows.length + DAMP));
  };
  out.sort((a, b) => score(b) - score(a) || b.rows.length - a.rows.length);
  return out;
}

/**
 * WHAT TO CALL THE GROUND SOMEBODY JUST CLICKED.
 *
 * > "i dont want block nulber to show anywhere its not relevant to me"
 *
 * `4087` is the assessor's filing number. It is how the roll, the Census join
 * and every shard in this pipeline address a piece of ground, and it is not
 * how one single person has ever described where they are. Nobody says "I live
 * on block 4087"; they say the streets.
 *
 * The shard already ships them — `s[]`, the streets the block fronts, the same
 * field the street section reads. MEASURED over 1,191 blocks: 48 % front
 * exactly four streets, 22 % three, 9 % two, 11 % one, and **7 blocks in 1,191
 * (0.6 %) front none**, which is the only case that has to fall back.
 *
 * The streets are joined and nothing is inferred from their order. A four-sided
 * block is really *"Cortland between Andover and Wool"*, but which pair is the
 * long side is geometry this file does not have, and a wrong "between" is worse
 * than a plain list.
 */
export function blockPlaceName(streets: readonly string[]): string | null {
  const names = streets.map((s) => streetLabel(s).trim()).filter(Boolean);
  if (names.length === 0) return null;
  if (names.length <= 4) return names.join(" · ");
  return `${names.slice(0, 3).join(" · ")} · +${names.length - 3}`;
}

/* ── A NEIGHBOURHOOD YOU CAN OPEN ─────────────────────────────────────────── */

export interface HoodDecade {
  readonly decade: number;
  /** what the decade really holds */
  readonly n: number;
  /** what this file ships — the most recent readable ones */
  readonly rows: readonly BlockDecision[];
}

export interface HoodSource {
  /** the clause of the paragraph this record stands under */
  readonly for: string;
  readonly u: string;
  readonly y: number;
  readonly t: string;
}

export interface HoodRecords {
  readonly i: number;
  readonly name: string;
  readonly n: number;
  readonly n_shipped: number;
  readonly per_decade: number;
  readonly decades: readonly HoodDecade[];
  /**
   * A paragraph WE wrote, from the records below. Absent for most
   * neighbourhoods, and absent is the correct state — a page with no paragraph
   * opens on the record, which is honest. A padded one would not be.
   */
  /**
   * What this neighbourhood keeps being about, COUNTED IN THE PIPELINE.
   *
   * Every other level runs the published patterns in the browser over the
   * rows it holds, which is exact because a block, a street and an address
   * each hold their whole record. This file ships twelve rows a decade out of
   * hundreds, so the same trick here would count a selection and print it as
   * the neighbourhood's. `build_hood_records.py` counts it over all of them.
   */
  readonly subjects?: readonly {
    readonly l: string;
    readonly n: number;
    readonly note: string;
  }[];
  readonly summary?: string;
  readonly summary_sources?: readonly HoodSource[];
  readonly summary_read?: {
    readonly full?: string;
    readonly sampled?: string;
    readonly records_read?: number;
    readonly records_total?: number;
  };
}

const hoodRecCache = new Map<number, Promise<HoodRecords | null>>();

/**
 * One neighbourhood's records — a selection, and the file says so.
 *
 * The Mission holds 2,277 readable records. This ships the most recent twelve
 * of each decade with the TRUE count of the decade beside them, so the page
 * can say "12 of 459" instead of implying it has them all. About 30 KB, one
 * fetch, and only when a reader actually opens a neighbourhood.
 */
export function loadHoodRecords(i: number): Promise<HoodRecords | null> {
  let p = hoodRecCache.get(i);
  if (!p) {
    p = loadSoft<HoodRecords>(`${BASE}/hood/${i}.json`);
    hoodRecCache.set(i, p);
  }
  return p;
}

/* ── WHICH STREETS ACTUALLY LEAD SOMEWHERE ───────────────────────────────── */

export interface StreetIndex {
  readonly n_referenced_by_blocks: number;
  readonly n_referenced_with_records: number;
  /** file name → how many records that street holds */
  readonly n: Readonly<Record<string, number>>;
}

let streetIndexPromise: Promise<StreetIndex | null> | null = null;

export function loadStreetIndex(): Promise<StreetIndex | null> {
  if (!streetIndexPromise) {
    streetIndexPromise = loadSoft<StreetIndex>(`${BASE}/street-index.json`);
  }
  return streetIndexPromise;
}

/** the same mapping `loadStreetRecord` uses to find the file */
export function streetFileName(key: string): string {
  return key.replace(/[^A-Za-z0-9]+/g, "_");
}

/**
 * How many records a street holds, or 0 where it holds none.
 *
 * MEASURED: blocks name 1,772 streets and only 1,440 of them have a file. The
 * other **332 (19 %)** were being offered as links that fetched a 404, got an
 * empty list back, and drew a street with nothing on it and no explanation.
 * Nothing clickable may be a dead end, so a street with no records is printed
 * rather than offered.
 */
export function streetRecordCount(
  index: StreetIndex | null,
  key: string,
): number {
  if (!index) return 0;
  return index.n[streetFileName(key)] ?? 0;
}

/* ── THE FINDING, NOT THE RECORD ──────────────────────────────────────────── */

/**
 * ONE SENTENCE SAYING WHAT HAPPENED HERE.
 *
 * The fiche showed the record and never stated the finding. A reader clicking
 * a block met `"Garage, Finance and Oil Permits — Roman Catholic Archbishop of
 * San Francisco, at…"` — a truncated fragment of 1918 municipal prose — and
 * had to synthesise a century out of raw minutes themselves. Only the
 * neighbourhood carried a written paragraph, and there is no writing 5,404 of
 * those by hand.
 *
 * There is no need to. Every clause here is a COUNT of things already
 * computed, and nothing is generated:
 *
 *   · how many and over what span — `blockShape`, exact;
 *   · which decade holds the most — `blockShape.busiest`, exact;
 *   · what they were about — `threadsIn`, which is the published patterns run
 *     over these very rows.
 *
 * ── THE THRESHOLDS ARE THE HONESTY ────────────────────────────────────────
 * Each clause is dropped rather than hedged when it would overstate:
 *
 *   · **"Busiest in the 1910s"** needs that decade to hold a QUARTER of
 *     everything and the place to hold at least eight. On a block with four
 *     decisions spread over four decades there is no busiest decade, there is
 *     a coincidence.
 *   · **"Most often about X"** needs the subject to land at least twice AND to
 *     cover a tenth of the place. `Paving and grading · 1` on a 40-record
 *     block is not what the block is about.
 *
 * Where nothing clears the bar the sentence is just the count and the span,
 * which is always true.
 */
export interface FicheOpener {
  readonly lead: string;
  readonly busiest: string | null;
  readonly about: string | null;
  /** [decade, n] over the whole rail, for the sparkline */
  readonly dec: readonly (readonly [number, number])[];
}

const BUSIEST_SHARE = 0.25;
const BUSIEST_FLOOR = 8;
/**
 * TWO WORDINGS, BECAUSE THEY ARE TWO DIFFERENT CLAIMS.
 *
 * `Most often about street lights` was the only wording, and it needed a tenth
 * of the place before it would print. On the Haight Ashbury block the busiest
 * subject is street lights at 4 of 41 — 9.8 %, just under — so the clause
 * almost never fired and the sentence lost its most useful half.
 *
 * The threshold was right and the wording was wrong. `Mostly about X` is a
 * claim about DOMINANCE and keeps a high bar. `Among them: X, Y and Z` claims
 * nothing except that they are in there, so it can print wherever a subject
 * lands more than once — which is what a reader actually wants to know.
 */
const MOSTLY_SHARE = 0.25;
const ABOUT_HITS = 2;
/**
 * "Most often about X" needs a place to have enough records for "most often"
 * to mean anything. 259 Frederick St holds two decisions — both stages of one
 * conditional use application — and read *"Most often about permission to
 * open something"*, which is a summary of two things as though it were a
 * pattern. Under this floor the records are simply listed and speak for
 * themselves; there is nothing to summarise that the reader cannot see.
 */
const ABOUT_FLOOR = 6;

export function ficheOpener(
  shape: BlockShape | null,
  groups: readonly DecadeGroup[],
  subjects: readonly ThreadHere[],
  words: {
    /** `{n} decisions here, {y0} to {y1}.` */
    many: string;
    /** `{n} decisions here, all in {y0}.` */
    oneYear: string;
    /** `One decision here, in {y0}.` */
    one: string;
    /** `Busiest in the {decade}s.` */
    busiest: string;
    /** `Mostly about {list}.` — only where one subject really dominates */
    mostly: string;
    /** `Among them: {list}.` — claims nothing about how much */
    among: string;
    and: string;
  },
): FicheOpener | null {
  if (!shape || shape.n === 0) return null;
  const { n, firstYear, lastYear } = shape;

  const lead =
    n === 1
      ? words.one.replace("{y0}", String(firstYear))
      : firstYear === lastYear
        ? words.oneYear.replace("{n}", String(n)).replace("{y0}", String(firstYear))
        : words.many
            .replace("{n}", String(n))
            .replace("{y0}", String(firstYear))
            .replace("{y1}", String(lastYear));

  let busiest: string | null = null;
  if (
    shape.busiest &&
    n >= BUSIEST_FLOOR &&
    shape.busiest.n / n >= BUSIEST_SHARE
  ) {
    busiest = words.busiest.replace("{decade}", String(shape.busiest.decade));
  }

  /* `threadsIn` hands them back RAREST first, which is right for a chip — the
     rare one is the interesting one — and wrong for a sentence, where the
     reader wants what the place is mostly about. */
  const top = (n < ABOUT_FLOOR ? [] : subjects)
    .filter((h) => h.rows.length >= ABOUT_HITS)
    .slice()
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 3)
    .map((h) => h.thread.l.toLowerCase());

  const dominant =
    top.length > 0 &&
    (subjects.find((h) => h.thread.l.toLowerCase() === top[0])?.rows.length ?? 0) / n >=
      MOSTLY_SHARE;
  const about =
    top.length === 0
      ? null
      : (dominant ? words.mostly : words.among).replace(
          "{list}",
          /* ── THE LIST IS NOT ALWAYS JOINED WITH "and" ─────────────────
             Several subjects have an `and` inside their own name — `Railroads
             and spur tracks`, `Paving and grading` — and joining those with a
             final `and` produced *"street lights, railroads and spur tracks
             and paving and grading"*, which parses as five things and reads
             as none. Where any name carries its own `and`, the list is
             commas only; where none does, the last join reads normally. */
          top.length === 1
            ? top[0]
            : top.some((x) => x.includes(" and "))
              ? top.join(", ")
              : `${top.slice(0, -1).join(", ")} ${words.and} ${top[top.length - 1]}`,
        );

  return {
    lead,
    busiest,
    about,
    dec: groups.map((g) => [g.decade, g.rows.length] as const),
  };
}

/* ── A FICHE IS A LINK ────────────────────────────────────────────────────── */

/**
 * WHAT A READER CAN SEND SOMEBODY.
 *
 * Nothing on this map had a URL. A reader who found the two 1991 motions on
 * their own street could not send them to a neighbour, a reporter could not
 * cite them, and closing the tab lost the place. Every share is also how
 * somebody else arrives, so this is the difference between a thing people look
 * at once and a thing that circulates.
 *
 * ── THE PARAMS ARE READABLE ON PURPOSE ────────────────────────────────────
 *     ?block=1254
 *     ?block=1254&street=FREDERICK_ST
 *     ?block=1254&address=259+Frederick+St
 *     ?block=1254&hood=1
 *
 * The street rides as its FILE name, via the `streetFileName` already here, so the link reads as a street rather than as
 * `FREDERICK%7CST`. It is resolved back by matching that fold against the
 * block's own street keys — never by parsing it, which would have to guess
 * where the `|` went.
 *
 * The address rides as its LABEL for the same reason `UnitRequest` does: the
 * doors of a block are derived in the browser and a key shipped in a URL would
 * have to stay identical to that fold forever.
 *
 * `block` is always present, even for the neighbourhood, because the ladder
 * needs somewhere to send "this block" and because a link should reopen the
 * map where the reader was standing.
 */
export interface FicheLink {
  readonly block: string;
  readonly street?: string;
  readonly address?: string;
  readonly hood?: boolean;
}

export function ficheParams(link: FicheLink): URLSearchParams {
  const q = new URLSearchParams();
  q.set("block", link.block);
  if (link.hood) q.set("hood", "1");
  else if (link.street) q.set("street", streetFileName(link.street));
  else if (link.address) q.set("address", link.address);
  return q;
}

/** what a URL asks for, read back — `null` where it asks for nothing */
export function readFicheParams(search: string): FicheLink | null {
  const q = new URLSearchParams(search);
  const block = q.get("block");
  if (!block) return null;
  const hood = q.get("hood") === "1";
  const street = q.get("street") ?? undefined;
  const address = q.get("address") ?? undefined;
  return {
    block,
    ...(hood ? { hood: true } : {}),
    ...(!hood && street ? { street } : {}),
    ...(!hood && !street && address ? { address } : {}),
  };
}

/**
 * The street key a URL's file-name form points at, out of the keys this block
 * actually fronts. Null where the block does not front it — a link edited by
 * hand, or a street since renamed — and the caller opens the block instead,
 * which is the honest fallback rather than an empty street.
 */
export function streetKeyFromFile(
  file: string,
  keys: readonly string[],
): string | null {
  const want = file.toLowerCase();
  return keys.find((k) => streetFileName(k).toLowerCase() === want) ?? null;
}
