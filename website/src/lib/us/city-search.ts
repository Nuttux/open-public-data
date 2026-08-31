/**
 * SEARCHING THE CITY BY NAME.
 *
 * The map is the only way in. A reader who already knows what they are looking
 * for — their own street, the neighbourhood they live in, the library on the
 * corner — has to find it by eye on a picture of San Francisco with 5,404
 * blocks in it. This is the other way in, and everything it can reach is
 * something the fiche already knows how to open.
 *
 * ── FOUR KINDS, AND THE DIFFERENCE IS NOT COSMETIC ──────────────────────────
 * Measured on the shipped index:
 *
 *     hood     41     the map's own divisions. Exact; 35 carry a paragraph.
 *     street   1,440  every street with a record file of its own.
 *     place    105    curated civic places; 102 also searchable by address.
 *     addr     1,234  a door the Board printed a house number for.
 *
 * **The addresses are not a register.** San Francisco has on the order of two
 * hundred thousand addresses. These are the ones the Board of Supervisors
 * named, at a precision tier the pipeline checked against the block's own
 * parcel range. An address absent from this list is not an address that does
 * not exist — it is one the record never named, which is a finding, and the
 * search is expected to say so rather than draw a blank.
 *
 * ── NO FUZZY MATCHING, ON PURPOSE ───────────────────────────────────────────
 * Three tiers, and every hit stays explainable: the label IS the query, the
 * label STARTS WITH the query, or every word of the query begins a word of the
 * label. Nothing scores, nothing guesses, and `Guerreo` does not quietly
 * become Guerrero. The same rule `search-synonyms.ts` was written under — a
 * term matches or it does not.
 *
 * The one thing that is NOT reused from there is the synonym dictionary: it is
 * a Paris vocabulary about grants and procurement, and expanding `mission` to
 * a group of related words is exactly wrong when `mission` is a place.
 */

import { normSearch } from "@/lib/search-synonyms";

export type SearchKind = "hood" | "street" | "place" | "addr";

/** the shipped file — see `build_search_index.py` for the column contract */
export interface CitySearchFile {
  readonly kinds: Readonly<Record<string, readonly [number, number]>>;
  readonly l: readonly string[];
  readonly n: readonly number[];
  readonly b: readonly string[];
  readonly to: readonly string[];
  readonly ay0: readonly number[];
  readonly ay1: readonly number[];
  /** a place's own address, keyed by position — see §sub */
  readonly sub: Readonly<Record<string, string>>;
  readonly sum: readonly number[];
}

export interface CitySearchIndex {
  readonly file: CitySearchFile;
  /** `normSearch(l[i])`, computed once on load — see §norm below */
  readonly norm: readonly string[];
  readonly kindOf: readonly SearchKind[];
  /** `normSearch` of the place addresses, keyed by position — see §sub */
  readonly normSub: ReadonlyMap<number, string>;
  readonly sum: ReadonlySet<number>;
}

/**
 * THE RICHEST FEW, FOR A READER WITH NOTHING TO TYPE.
 *
 * A search box on a map has a discovery problem the box itself cannot fix: on
 * Google Maps a reader arrives already wanting something, and here they arrive
 * curious. Daniel: *"im just afraid too few ppl click search cause theyll
 * think of it as a map"* — and the failure is not that they cannot find the
 * box, it is that they have no question.
 *
 * So the box offers a few, and it offers NEIGHBOURHOODS. MEASURED on the
 * shipped index, which settles it:
 *
 *     hood     41 entries, the richest holds 3,074 records
 *     street 1,440 entries, capped at 120, median SEVEN, and 508 more
 *            streets carry no record at all and are not in the index
 *     place    105 entries, and the richest holds TEN
 *
 * A street is a promise the record usually cannot keep, and a curated place —
 * which sounds like the obvious thing to suggest — is the thinnest kind here,
 * because its count is records ABOUT that place rather than everything on its
 * ground. The neighbourhood is the only kind that is reliably thick.
 *
 * ── AND A SUGGESTION WITHOUT A BLOCK CANNOT BE PRESSED ────────────────────
 * The first build offered *"Lake Merced · 10"*, and pressing it did nothing:
 * that entry carries `block: ""`, so there was nowhere to send the map.
 * Measured by pressing it and reading the camera back — unmoved. Anything
 * without a block is skipped here rather than offered and found dead.
 *
 * Every suggestion is READ OUT OF THE INDEX, highest count first, never typed:
 * a chip that leads nowhere is worse than no chip, and a list written by hand
 * goes stale the first time the corpus moves.
 */
export function richestHits(
  ix: CitySearchIndex | null,
  kinds: readonly SearchKind[] = ["hood"],
  take = 3,
): SearchHit[] {
  if (!ix) return [];
  const f = ix.file;
  const rows: SearchHit[] = [];
  for (let i = 0; i < f.l.length; i++) {
    const kind = ix.kindOf[i];
    if (!kinds.includes(kind)) continue;
    /* §AND A SUGGESTION WITHOUT A BLOCK CANNOT BE PRESSED */
    if (!f.b[i]) continue;
    rows.push({ kind, label: f.l[i], n: f.n[i], block: f.b[i], to: f.to[i] });
  }
  rows.sort((a, b) => b.n - a.n);
  return rows.slice(0, take);
}

export interface SearchHit {
  readonly kind: SearchKind;
  readonly label: string;
  /** how many records it holds — the same number the fiche will print */
  readonly n: number;
  /** the block to send the map to. Representative for a hood and a street. */
  readonly block: string;
  /** hood index, street key or place slug. Empty for a door — see below. */
  readonly to: string;
  readonly y0?: number;
  readonly y1?: number;
  /** a place's own address — shown under the name, and searchable */
  readonly sub?: string;
  /** this neighbourhood has a written paragraph */
  readonly sum?: boolean;
  /** which of the two matched: the name, or the address under it */
  readonly via?: "sub";
  /**
   * This hit is an address resolved through the assessor's parcels, not a
   * door the Board named. The destination is the BLOCK it stands on, and the
   * panel must open the whole block rather than hunt for a door that is not
   * in the record.
   */
  readonly viaParcel?: true;
}

/**
 * §sub — WHY A PLACE HAS A SECOND SEARCHABLE STRING, AND WHY IT IS NOT MONEY.
 *
 * A reader looking for Coit Tower types `coit`. A reader looking for the
 * building at 1 Telegraph Hill Blvd types the address, and until the address
 * was indexed that search found nothing at all — while the fiche for it sat
 * one click away on the map.
 *
 * There was almost a `$` flag here instead. Every one of the 105 place files
 * carries a `money` object, so the flag would have been on all of them — and
 * Coit Tower's `money` is Recreation & Parks' $250,373,849 budget line for
 * FY2025, which is the department's. A marker saying this place has money
 * would have been read as this place cost that. It is not in the index at all;
 * see the builder's own note.
 */

const KIND_ORDER: readonly SearchKind[] = ["hood", "street", "place", "addr"];

/**
 * §norm — THE NORMALISED LABELS ARE COMPUTED HERE, NOT SHIPPED.
 *
 * The index used to carry a second copy of every label with the punctuation
 * taken out, which was 30 KB of a 289 KB file. It is one pass of `normSearch`
 * over 2,820 strings instead, and it removes a whole class of bug: the
 * pipeline's normalisation and the browser's cannot drift apart when only one
 * of them exists.
 */
export function prepare(file: CitySearchFile): CitySearchIndex {
  const norm = file.l.map((s) => normSearch(s));
  const normSub = new Map<number, string>();
  for (const [k, v] of Object.entries(file.sub ?? {})) {
    normSub.set(Number(k), normSearch(v));
  }
  const kindOf: SearchKind[] = new Array(file.l.length).fill("addr");
  for (const k of KIND_ORDER) {
    const r = file.kinds[k];
    if (!r) continue;
    for (let i = r[0]; i < r[1]; i += 1) kindOf[i] = k;
  }
  return {
    file,
    norm,
    kindOf,
    normSub,
    sum: new Set(file.sum),
  };
}

function hitAt(ix: CitySearchIndex, i: number): SearchHit {
  const kind = ix.kindOf[i];
  const addr = ix.file.kinds.addr;
  const j = kind === "addr" && addr ? i - addr[0] : -1;
  return {
    kind,
    label: ix.file.l[i],
    n: ix.file.n[i],
    block: ix.file.b[i],
    to: ix.file.to[i],
    ...(j >= 0 && ix.file.ay0[j] ? { y0: ix.file.ay0[j] } : {}),
    ...(j >= 0 && ix.file.ay1[j] ? { y1: ix.file.ay1[j] } : {}),
    ...(ix.file.sub?.[String(i)] ? { sub: ix.file.sub[String(i)] } : {}),
    ...(ix.sum.has(i) ? { sum: true } : {}),
  };
}

/** every query word has to begin a word of the label */
function tokensLead(label: string, tokens: readonly string[]): boolean {
  const words = label.split(" ");
  return tokens.every((q) => words.some((w) => w.startsWith(q)));
}

/**
 * Rank: exactness first, then the kind, then how much the place holds.
 *
 * KIND BEFORE SIZE, and it matters on the commonest query there is. Typing
 * `mission` matches the neighbourhood (3,074 records), the street, and a
 * shelf of doors on Mission Street. Sorting by size alone would be fine there
 * and wrong on `coit`, where Coit Tower holds a handful of documents and would
 * fall below every street in the city. The kind is the better prior: somebody
 * typing a bare name usually means the biggest thing that goes by it.
 *
 * Ties break on the label so the list never reorders between keystrokes that
 * do not change the result.
 */
export function searchCity(
  ix: CitySearchIndex | null,
  query: string,
  limit = 60,
): SearchHit[] {
  if (!ix) return [];
  const q = normSearch(query);
  if (q.length < 2) return [];
  const tokens = q.split(" ").filter(Boolean);
  const scored: { i: number; tier: number; via?: "sub" }[] = [];
  for (let i = 0; i < ix.norm.length; i += 1) {
    const s = ix.norm[i];
    let tier = 0;
    let via: "sub" | undefined;
    if (s === q) tier = 1;
    else if (s.startsWith(q)) tier = 2;
    else if (tokensLead(s, tokens)) tier = 3;
    else {
      /* the place's own address, if it has one. Tier 3 only: an address is
         how you recognise a place, not what it is called, so `1 telegraph
         hill blvd` should never outrank something actually NAMED that. */
      const sub = ix.normSub.get(i);
      if (!sub || !tokensLead(sub, tokens)) continue;
      tier = 3;
      via = "sub";
    }
    scored.push({ i, tier, via });
  }
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ka = KIND_ORDER.indexOf(ix.kindOf[a.i]);
    const kb = KIND_ORDER.indexOf(ix.kindOf[b.i]);
    if (ka !== kb) return ka - kb;
    if (ix.file.n[a.i] !== ix.file.n[b.i]) return ix.file.n[b.i] - ix.file.n[a.i];
    return ix.file.l[a.i].localeCompare(ix.file.l[b.i]);
  });
  return scored
    .slice(0, limit)
    .map((s) => (s.via ? { ...hitAt(ix, s.i), via: s.via } : hitAt(ix, s.i)));
}

/**
 * The same hits, grouped, capped per kind, in the order the sections read.
 *
 * A bare street name matches the street once and forty doors on it, and a flat
 * list would bury the street under its own addresses. Grouping is also the
 * only honest way to show the four kinds together, because they are not four
 * flavours of the same thing — one is a division, one is a curated place with
 * money behind it, and one is a house number the Board happened to print.
 */
export interface SearchGroup {
  readonly kind: SearchKind;
  readonly hits: readonly SearchHit[];
  /** how many more of this kind matched than are shown */
  readonly more: number;
}

export function groupHits(hits: readonly SearchHit[], per = 5): SearchGroup[] {
  const out: SearchGroup[] = [];
  for (const kind of KIND_ORDER) {
    const all = hits.filter((h) => h.kind === kind);
    if (!all.length) continue;
    out.push({ kind, hits: all.slice(0, per), more: Math.max(0, all.length - per) });
  }
  return out;
}

/**
 * WHAT TO SAY WHEN THE DOOR IS NOT IN THE RECORD — which is most doors.
 *
 * > "what happens when you type like an address, it will give you close by
 * > shit recent and then if nothing or you done whats happening around? in the
 * > neighborhood that concerns your adress or important shit?"
 *
 * The index holds 1,052 doors. San Francisco has on the order of two hundred
 * thousand addresses, so **the ordinary outcome of typing your own address is
 * that the Board never named it**, and until this existed that outcome was a
 * blank. A blank is the one answer this search must not give: it reads as
 * "there is nothing here", when what is true is "the record does not name
 * this door" — and the street it stands on may hold a hundred and twenty
 * decisions.
 *
 * So an address that finds no door falls back to the street it names, and the
 * fiche that opens carries the rest of the ladder on its own: the street's
 * record, the blocks along it, and the neighbourhood's written paragraph one
 * fold down. Nothing new had to be built for the outward steps — they are the
 * units the panel has always had. What was missing was the first one.
 *
 * NO GEOCODER, AND SO NO BLOCK. It would be better to land on the actual block
 * `1234 Guerrero St` sits on, and this cannot do that: there is no
 * address-to-parcel table in the shipped data, and guessing a block from a
 * house number would put a reader on the wrong piece of ground while telling
 * them it was theirs. The street is the smallest unit that is certainly right.
 */
const SUFFIX_FOLD: Readonly<Record<string, string>> = {
  street: "st", avenue: "ave", boulevard: "blvd", road: "rd", drive: "dr",
  place: "pl", court: "ct", terrace: "ter", alley: "aly", lane: "ln",
  highway: "hwy", st: "st", ave: "ave", blvd: "blvd", rd: "rd", dr: "dr",
  pl: "pl", ct: "ct", ter: "ter", aly: "aly", ln: "ln", hwy: "hwy",
  way: "way",
};

/** `1234 Guerrero Street` → `{ num: 1234, body: "guerrero" }` */
function parseAddress(q: string): { num: number; body: string } | null {
  const w = q.split(" ").filter(Boolean);
  if (w.length < 2 || !/^\d+$/.test(w[0])) return null;
  const num = Number(w[0]);
  if (!Number.isFinite(num)) return null;
  const rest = w.slice(1);
  const last = rest[rest.length - 1];
  const body = SUFFIX_FOLD[last] && rest.length > 1 ? rest.slice(0, -1) : rest;
  const joined = body.join(" ");
  return joined ? { num, body: joined } : null;
}

/** the street's own suffix dropped the same way, so the two ends compare */
function bareStreet(norm: string): string {
  const w = norm.split(" ");
  return (SUFFIX_FOLD[w[w.length - 1]] && w.length > 1 ? w.slice(0, -1) : w).join(" ");
}

/* ── THE ASSESSOR ALREADY KNOWS WHICH BLOCK AN ADDRESS IS ON ───────────────
 * This file first shipped saying a block could not be found for an arbitrary
 * address, because "there is no address-to-parcel table in the shipped data".
 * That was true of the shipped data and false of the pipeline: the parcel
 * dataset it already caches publishes `from_address_num`, `to_address_num`,
 * `street_name`, `street_type` and `block_num` side by side, and `block_num`
 * is the very id this map draws.
 *
 * So there is no geocoding here and no coordinates are involved. It is a join
 * the assessor published. MEASURED: 17,468 faces over 1,843 streets, and
 * 18,169 of 18,173 (100.0 %) land on a block this map draws.
 */
export interface AddressFace {
  readonly streets: readonly string[];
  readonly s: readonly number[];
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  readonly b: readonly string[];
}

export interface AddressIndex {
  readonly file: AddressFace;
  /** `bareStreet(normSearch(label))` per street id */
  readonly bare: readonly string[];
}

export function prepareAddresses(file: AddressFace): AddressIndex {
  return { file, bare: file.streets.map((l) => bareStreet(normSearch(l))) };
}

export interface AddressOnBlock {
  /** what the reader typed, tidied to the assessor's own street spelling */
  readonly label: string;
  readonly street: string;
  readonly block: string;
}

/**
 * The block an address stands on, or null.
 *
 * Null is a real answer and happens two ways: the street is not one the
 * assessor names, or it is but no face on it covers that house number — 12
 * Guerrero St when Guerrero starts at 100. Neither is guessed around. Landing
 * a reader on the wrong block while telling them it is theirs is worse than
 * saying the street and stopping.
 */
export function blockForAddress(
  aix: AddressIndex | null,
  query: string,
): AddressOnBlock | null {
  if (!aix) return null;
  const a = parseAddress(normSearch(query));
  if (!a) return null;

  /* ── A HALF-TYPED STREET IS NOT AN UNKNOWN STREET ─────────────────────
     `680 HAIG` used to fall past this and be told the city's property
     records could not place it — which was not true, the reader simply had
     not finished the word. An exact match wins; failing that, a prefix that
     leaves exactly ONE street standing is that street. Two candidates and
     it stops, because `680 s` must not silently pick one. */
  let sid = -1;
  for (let k = 0; k < aix.bare.length; k += 1) {
    if (aix.bare[k] === a.body) {
      sid = k;
      break;
    }
  }
  if (sid < 0) {
    for (let k = 0; k < aix.bare.length; k += 1) {
      if (!aix.bare[k].startsWith(a.body)) continue;
      if (sid >= 0) return null;
      sid = k;
    }
  }
  if (sid < 0) return null;

  let best: { i: number; span: number } | null = null;
  for (let i = 0; i < aix.file.s.length; i += 1) {
    if (aix.file.s[i] !== sid) continue;
    if (a.num < aix.file.lo[i] || a.num > aix.file.hi[i]) continue;
    /* a number can sit inside two faces where the assessor's ranges overlap
       across a corner; the tighter range is the better claim */
    const span = aix.file.hi[i] - aix.file.lo[i];
    if (!best || span < best.span) best = { i, span };
  }
  if (!best) return null;
  const street = aix.file.streets[aix.file.s[best.i]];
  return { label: `${a.num} ${street}`, street, block: aix.file.b[best.i] };
}

let addrPromise: Promise<AddressIndex | null> | null = null;

/**
 * 357 KB, and it is fetched later than everything else.
 *
 * Only a query shaped like an address can use it, and only after the doors in
 * the main index have already missed — so it is requested on the first such
 * query rather than on focus. Most sessions never ask for it at all.
 */
export function loadCityAddresses(): Promise<AddressIndex | null> {
  if (!addrPromise) {
    addrPromise = fetch("/data/us/sf/city/blocks/address-index.json")
      .then((r) => (r.ok ? (r.json() as Promise<AddressFace>) : null))
      .then((f) => (f ? prepareAddresses(f) : null))
      .catch(() => null);
  }
  return addrPromise;
}

/** `1234 Guerrero Street` → `guerrero`, dropping the number and the suffix */
function streetPartOf(q: string): string | null {
  const a = parseAddress(q);
  return a ? a.body : null;
}

/**
 * The street an address query names, when no door matched it.
 *
 * Returns nothing unless the query really looks like an address — a leading
 * house number and at least one word after it. `guerrero` on its own is a
 * street search and already works; this is only for `1234 Guerrero St`.
 */
export function streetForAddress(
  ix: CitySearchIndex | null,
  query: string,
): SearchHit[] {
  if (!ix) return [];
  const body = streetPartOf(normSearch(query));
  if (!body) return [];
  const range = ix.file.kinds.street;
  if (!range) return [];
  const toks = body.split(" ").filter(Boolean);
  const out: { i: number; tier: number }[] = [];
  for (let i = range[0]; i < range[1]; i += 1) {
    const s = ix.norm[i];
    /* the street's own suffix is dropped the same way, so `guerrero` matches
       `Guerrero St` exactly rather than merely leading it */
    const bare = bareStreet(s);
    if (bare === body) out.push({ i, tier: 1 });
    else if (tokensLead(bare, toks)) out.push({ i, tier: 2 });
  }
  out.sort((a, b) => a.tier - b.tier || ix.file.n[b.i] - ix.file.n[a.i]);
  return out.slice(0, 4).map((o) => hitAt(ix, o.i));
}

let indexPromise: Promise<CitySearchIndex | null> | null = null;

/**
 * 106 KB, and it is NOT fetched with the page.
 *
 * The map already pulls megabytes of geometry before it can draw a frame, and
 * a reader who never touches the search box should not be paying for it in
 * that queue. It is fetched the first time the box is focused, which is one
 * round trip before the first keystroke has finished being typed. Memoised for
 * the session, and a failure resolves to null rather than throwing: the box
 * then says it could not load rather than the panel disappearing.
 */
export function loadCitySearch(): Promise<CitySearchIndex | null> {
  if (!indexPromise) {
    indexPromise = fetch("/data/us/sf/city/blocks/search-index.json")
      .then((r) => (r.ok ? (r.json() as Promise<CitySearchFile>) : null))
      .then((f) => (f ? prepare(f) : null))
      .catch(() => null);
  }
  return indexPromise;
}
