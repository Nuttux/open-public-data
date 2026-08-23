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
