/**
 * THE BLOCK RECORD — what the city decided, block by block.
 *
 * Built by `scratchpad/sf-city-anim/blocks/build_index.py` from **142 of 142
 * Board of Supervisors Journal volumes, 1906–1999 — the complete series — plus
 * 44 Bureau of Engineering, Board of Public Works, DPW and Park Commission
 * annual reports.** 4,679 of the city's 5,404 assessor blocks answer the
 * question *what did the city decide here*, with a page link per decision.
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
 * **`W` is a departmental work, not a Board vote** — 3,588 rows come out of the
 * annual reports rather than the Journal, and calling one a "resolution" would
 * be attributing a decision to a body that never took it.
 */
export const KIND_WORDING: Record<string, string> = {
  R: "Resolution",
  O: "Ordinance",
  M: "Motion",
  W: "Departmental work",
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

/** "PINE|ST" → "Pine St" */
export function streetLabel(key: string): string {
  return key
    .split("|")
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
 * 1900 because the Journal series opens in 1906. 2010 because the corpus is
 * NOT Journal-only — the DPW annual reports run to 2010, and a rail hardcoded
 * to end at 1999 would have dropped those rows off the end without saying so.
 * Both ends stretch if a block holds something outside them.
 */
export const RAIL_FROM = 1900;
export const RAIL_TO = 1990;

/**
 * "Went quiet" is measured against the SERIES, not against the rail.
 *
 * The Journal runs 1906–1999 and the rail is allowed to run past it, because
 * 32 rows in 60 shards come out of the 2002 and 2010 DPW annual reports. Using
 * the rail's end as the anchor made a block whose last decision is 1999 — the
 * last year the Board's own series covers — report that "nothing lands here
 * after 1999", which reads as a block falling silent and is really the series
 * running out. The anchor is the last decade of the Journal, and a block has
 * to fall two whole decades short of it before anything is said.
 */
const SERIES_END_DECADE = 1990;
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

function pickHeadline(rows: readonly BlockDecision[]): BlockDecision | null {
  const withLine = rows.filter((r) => r.t.trim().length > 0);
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
    reach.find((r) => r.t.trim().length >= FRAGMENT_CHARS) ??
    withLine[0]
  );
}

/**
 * Every decade of the rail in order, empty ones included, so the gaps are
 * visible. Rank order is preserved inside each decade.
 */
export function decadeGroups(decisions: readonly BlockDecision[]): DecadeGroup[] {
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
  const to = Math.max(RAIL_TO, ...(decs.length ? [Math.max(...decs)] : []));
  const out: DecadeGroup[] = [];
  for (let dec = from; dec <= to; dec += 10) {
    const rows = bucket.get(dec) ?? [];
    out.push({
      decade: dec,
      label: `${dec}s`,
      rows,
      headline: pickHeadline(rows),
    });
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

export function blockShape(decisions: readonly BlockDecision[]): BlockShape | null {
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
    (SERIES_END_DECADE - lastDecade) / 10 >= QUIET_DECADES ? lastYear : null;

  return { n: decisions.length, firstYear, lastYear, busiest, quietAfter };
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
 * MEASURED over all 256 shards: 978 of the 4,679 blocks that carry anything
 * have at least one repeated printed heading — 34 % of blocks holding 15 to
 * 49 decisions and 73 % of those holding 50 or more, which are the blocks a
 * reader lingers on. Nothing is shown on the rest, and nothing is invented to
 * fill the gap.
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
