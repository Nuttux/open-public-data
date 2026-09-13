/**
 * THE NEIGHBOURHOOD AND STREET PAGES, READ ON THE SERVER.
 *
 * The map's fiches are built in the browser from `public/data/us/sf/city/
 * blocks/`; these pages are built from the same files at build time, so a
 * page and its fiche can never say two different things about the same
 * street. Nothing is computed here that the panel does not compute — the
 * decade faces come from `byInterest` and the written line, the subjects from
 * the row's own subject mask, the counts from the files.
 *
 * Only ever imported by server components and the sitemap.
 */
import { readFileSync } from "node:fs";
import { headers } from "next/headers";
import {
  KIND_WORDING,
  byInterest,
  countLabel,
  hoodSlug,
  sourceHref,
  streetLabelFromFile,
  streetSlug,
  type BlockDecision,
  type HoodRecords,
} from "@/components/us/city/block-records";
import { compactMoney, fileStem, statusRank, statusWord } from "@/components/us/city/record-line";
import { untracedPath } from "@/lib/untraced-path";
const URL_BASE = "/data/us/sf/city/blocks";

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(untracedPath("public/data/us/sf/city/blocks", rel), "utf8")) as T;
}

/**
 * ── EVERY FILE THIS PAGE OPENS, AND THE TWO WAYS TO GET IT ──────────────
 *
 * These pages render at request time, and a function carries only the files
 * `next.config.ts` names for its route. That config's `'/'` exclude strips
 * public/data/us/sf/city/** from EVERY route, so a missing include is a
 * 500 on the live site — which is exactly what shipped (2026-09-10), and the
 * page fell over on the first file it opened.
 *
 * The includes are there now. This is the second line: what is not on disk
 * is fetched from our own origin, where every one of these files is a
 * public static asset — the same answer the block share card gives to the
 * same problem. A page renders on either path, and the only difference is
 * one HTTP request per file per lambda.
 *
 * Cached by path for the life of the lambda: a promise, so ten concurrent
 * renders of ten streets share one read of the index rather than ten.
 */
const cache = new Map<string, Promise<unknown>>();
/**
 * The per-street records are NOT kept. There are 1,948 of them and 21 MB in
 * total, and a lambda that served a thousand streets would be holding every
 * one of them; the index, the subjects and the 41 neighbourhood records are
 * shared by every render and worth the memory.
 */
const SHARED = (rel: string): boolean => !rel.startsWith("street/");

async function readData<T>(rel: string): Promise<T | null> {
  const hit = cache.get(rel);
  if (hit) return hit as Promise<T | null>;
  const p = (async (): Promise<T | null> => {
    try {
      return readJson<T>(rel);
    } catch {
      /* not in this bundle — over HTTP, below */
    }
    try {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      if (!host) return null;
      const proto =
        h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      const r = await fetch(`${proto}://${host}${URL_BASE}/${rel}`, {
        next: { revalidate: 86400 },
      });
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  })();
  if (SHARED(rel)) cache.set(rel, p);
  return p;
}

interface StreetIndexFile {
  readonly n: Record<string, number>;
  readonly b?: Record<string, string>;
}
interface SubjectsFile {
  readonly s: readonly { bit: number; slug: string; l: string; note: string }[];
}
interface HoodFacts {
  readonly hoods: readonly {
    i: number;
    name: string;
    record: { y0: number; y1: number; n: number };
  }[];
}

/**
 * Read once, on demand: a street page has no use for the 2.2 MB of
 * neighbourhood records, and a route carries only what it opens.
 */
const streetIndex = () => readData<StreetIndexFile>("street-index.json");
const subjectsFile = () => readData<SubjectsFile>("subjects.json");
const hoodFacts = () => readData<HoodFacts>("hood-facts.json");
const streetCap = async () =>
  (await readData<{ street_cap?: number }>("shards.json"))?.street_cap ?? 0;
const streetRows = (file: string) => readData<BlockDecision[]>(`street/${file}.json`);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function whenOf(d: BlockDecision): string {
  if (!d.d) return String(d.y);
  const [mm, dd] = d.d.split("-");
  const m = MONTHS[Number(mm) - 1];
  return m ? `${Number(dd)} ${m} ${d.y}` : String(d.y);
}

export interface PageRow {
  readonly line: string;
  readonly when: string;
  readonly y: number;
  readonly kind: string;
  readonly status: string | null;
  readonly href: string;
}
export interface PageDecade {
  readonly decade: number;
  readonly n: number;
  readonly face: PageRow | null;
}
export interface PageSubject {
  readonly l: string;
  readonly n: number;
  readonly note: string;
}
export interface PageStreet {
  readonly label: string;
  readonly slug: string;
  readonly count: string;
}
export interface CityPage {
  readonly kind: "neighbourhood" | "street";
  readonly name: string;
  readonly slug: string;
  /** decisions on record; for a street at the file cap this is `120+` */
  readonly count: string;
  readonly n: number;
  readonly capped: boolean;
  readonly y0: number;
  readonly y1: number;
  readonly busiest: number | null;
  readonly decades: readonly PageDecade[];
  readonly subjects: readonly PageSubject[];
  readonly streets: readonly PageStreet[];
  readonly notable: readonly PageRow[];
  /** the map, opened on this unit — null where no block fronts the street */
  readonly mapHref: string | null;
  /** how much of the record this page holds, in words */
  readonly holds: string;
}

function toRow(d: BlockDecision): PageRow {
  const line = (d.pl && d.pl.trim()) || d.t.trim();
  const st = d.pl ? statusWord(d.pl) : null;
  return {
    line: compactMoney(line),
    when: whenOf(d),
    y: d.y,
    kind: KIND_WORDING[d.k] ?? "Item",
    status: st === "moving" ? "in progress" : st,
    href: sourceHref(d),
  };
}

function faceOf(rows: readonly BlockDecision[]): PageRow | null {
  const r = byInterest(rows).find((x) => x.pl && x.pl.trim());
  return r ? toRow(r) : null;
}

/** subjects by the row's own mask — the same bits `threadsIn` reads */
async function subjectsOf(rows: readonly BlockDecision[], top = 6): Promise<PageSubject[]> {
  const file = await subjectsFile();
  if (!file) return [];
  const out: PageSubject[] = [];
  for (const s of file.s) {
    let n = 0;
    for (const r of rows) {
      const sm = r.sm;
      if (sm && Math.floor(sm / 2 ** s.bit) % 2 === 1) n += 1;
    }
    if (n >= 2) out.push({ l: s.l, n, note: s.note });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, top);
}

const NOTABLE = 10;

/**
 * ONE ROW PER FILE. A bond election is three rows — proposed, passed on
 * first reading, finally passed — and by interest all three rank together,
 * so the notable list read the same line three times. Folded on the written
 * line's stem, keeping the furthest step (the year list does the same).
 */
function notableOf(rows: readonly BlockDecision[]): PageRow[] {
  const seen = new Map<string, BlockDecision>();
  for (const r of byInterest(rows)) {
    if (!r.pl) continue;
    const k = fileStem(r.pl);
    const had = seen.get(k);
    if (!had || statusRank(r.pl) > statusRank(had.pl ?? "")) seen.set(k, r);
  }
  return byInterest([...seen.values()]).slice(0, NOTABLE).map(toRow);
}
const BUSIEST_SHARE = 0.25;
const BUSIEST_FLOOR = 8;

function busiestOf(decades: readonly PageDecade[], n: number): number | null {
  const top = decades.reduce<PageDecade | null>((m, d) => (!m || d.n > m.n ? d : m), null);
  return top && n >= BUSIEST_FLOOR && top.n / n >= BUSIEST_SHARE ? top.decade : null;
}

/* ── NEIGHBOURHOODS ──────────────────────────────────────────────────────── */

export function listHoodPages(): { slug: string; name: string; n: number }[] {
  /* hood-facts names every neighbourhood and its count — the 41 record files
     are opened only by the page that renders one. Synchronous on purpose:
     its callers are `generateStaticParams` and the sitemap, both of which
     read from disk, and the sitemap swallows a throw into a missing family
     rather than a broken page. */
  return readJson<HoodFacts>("hood-facts.json").hoods.map((h) => ({
    slug: hoodSlug(h.name),
    name: h.name,
    n: h.record.n,
  }));
}

export async function hoodPage(slug: string): Promise<CityPage | null> {
  const facts = await hoodFacts();
  const at = facts?.hoods.find((x) => hoodSlug(x.name) === slug);
  if (!at) return null;
  const h = await readData<HoodRecords>(`hood/${at.i}.json`);
  if (!h) return null;
  /* the chips and their counts are the one part of this page that degrades:
     without the index a street cannot be offered with an honest number, so
     it is not offered */
  const streets = (await streetIndex()) ?? { n: {} as Record<string, number> };
  const cap = await streetCap();
  const rec = at.record;
  const rows = h.decades.flatMap((d) => d.rows);
  const decades: PageDecade[] = h.decades
    .filter((d) => d.n > 0)
    .map((d) => ({ decade: d.decade, n: d.n, face: faceOf(d.rows) }))
    .sort((a, b) => b.decade - a.decade);
  /* the block the map opens on: the one most of the shipped rows sit on */
  const byBlock = new Map<string, number>();
  /* hood rows carry the block they sit on as `b` — written by
     build_hood_records.py, not part of the block-shard row type */
  for (const r of rows as readonly (BlockDecision & { b?: string })[]) {
    if (r.b) byBlock.set(r.b, (byBlock.get(r.b) ?? 0) + 1);
  }
  const block = [...byBlock.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const live = h.decades.filter((d) => d.n > 0);
  return {
    kind: "neighbourhood",
    name: h.name,
    slug,
    count: h.n.toLocaleString("en-US"),
    n: h.n,
    capped: false,
    y0: rec?.y0 ?? (live[0]?.decade ?? 0),
    y1: rec?.y1 ?? (live.length ? live[live.length - 1].decade + 9 : 0),
    busiest: busiestOf(decades, h.n),
    decades,
    subjects: (h.subjects ?? [])
      .map((s) => ({ l: s.l, n: s.n, note: s.note }))
      .sort((a, b) => b.n - a.n),
    /* WHICH streets is the builder's ranking — how much of this
       neighbourhood's own record names each one. The ORDER they are printed
       in is the number printed beside them, or `Liberty St 27` sits between
       two `120+` and the line reads as a sort that failed. */
    streets: (h.streets ?? [])
      .map((s) => {
        const file = s.k.replace(/[^A-Za-z0-9]+/g, "_");
        const n = streets.n[file] ?? 0;
        return { label: streetLabelFromFile(file), slug: streetSlug(file), count: countLabel(n, cap), n };
      })
      .filter((s) => s.n > 0)
      .slice(0, 8)
      .sort((a, b) => b.n - a.n),
    notable: notableOf(rows),
    mapHref: block ? `/us/city/sf/the-city?block=${encodeURIComponent(block)}&hood=1` : "/us/city/sf/the-city",
    holds: `This page carries the ${h.per_decade} most notable decisions of each decade, ${h.n_shipped.toLocaleString("en-US")} of the ${h.n.toLocaleString("en-US")} on record; the rest are on its streets.`,
  };
}

/* ── STREETS ─────────────────────────────────────────────────────────────── */

export function listStreetPages(): { slug: string; file: string; n: number }[] {
  return Object.entries(readJson<StreetIndexFile>("street-index.json").n)
    .filter(([, n]) => n > 0)
    .map(([file, n]) => ({ slug: streetSlug(file), file, n }));
}

export async function streetPage(slug: string): Promise<CityPage | null> {
  const streets = await streetIndex();
  if (!streets) return null;
  const cap = await streetCap();
  const file = Object.keys(streets.n).find((f) => streetSlug(f) === slug);
  if (!file) return null;
  const rows = await streetRows(file);
  if (!rows || !rows.length) return null;
  const by = new Map<number, BlockDecision[]>();
  for (const r of rows) {
    const dec = Math.floor(r.y / 10) * 10;
    const l = by.get(dec);
    if (l) l.push(r);
    else by.set(dec, [r]);
  }
  const decades: PageDecade[] = [...by.entries()]
    .map(([decade, rs]) => ({ decade, n: rs.length, face: faceOf(rs) }))
    .sort((a, b) => b.decade - a.decade);
  const ys = rows.map((r) => r.y).filter((y) => y > 0);
  const capped = cap > 0 && rows.length >= cap;
  const block = streets.b?.[file] ?? null;
  return {
    kind: "street",
    name: streetLabelFromFile(file),
    slug,
    count: countLabel(rows.length, cap),
    n: rows.length,
    capped,
    y0: Math.min(...ys),
    y1: Math.max(...ys),
    busiest: busiestOf(decades, rows.length),
    decades,
    subjects: await subjectsOf(rows),
    streets: [],
    notable: notableOf(rows),
    mapHref: block
      ? `/us/city/sf/the-city?block=${encodeURIComponent(block)}&street=${encodeURIComponent(file)}`
      : null,
    holds: capped
      ? `The street holds more than ${cap} decisions; this page carries the ${cap} most notable.`
      : `Every decision the record places on this street is here.`,
  };
}

/* ── SEE ALSO ────────────────────────────────────────────────────────────── */

export interface RelatedCityPage {
  readonly slug: string;
  readonly name: string;
  readonly count: string;
  /** decisions on record, for ordering */
  readonly n?: number;
  /** a street that opens on the same block of the map as this one */
  readonly sameBlock?: boolean;
}

/**
 * The neighbourhoods next to this one in the ranking by decisions on record —
 * the hood-facts file the page itself opens, nothing more.
 */
export async function hoodNeighbourPages(slug: string, max = 5): Promise<RelatedCityPage[]> {
  const facts = await hoodFacts();
  const ranked = (facts?.hoods ?? []).slice().sort((a, b) => b.record.n - a.record.n);
  const at = ranked.findIndex((h) => hoodSlug(h.name) === slug);
  if (at < 0) return [];
  const out: RelatedCityPage[] = [];
  for (let d = 1; out.length < max && (at - d >= 0 || at + d < ranked.length); d++) {
    for (const i of [at - d, at + d]) {
      const h = ranked[i];
      if (h && out.length < max) out.push({ slug: hoodSlug(h.name), name: h.name, count: h.record.n.toLocaleString("en-US"), n: h.record.n });
    }
  }
  return out.sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
}

/**
 * The streets that open on the same block of the map as this one, then its
 * neighbours in the ranking by decisions on record — both read off the street
 * index the page opens, so no neighbourhood record is loaded for a street.
 */
export async function streetRelatedPages(slug: string, max = 4): Promise<RelatedCityPage[]> {
  const streets = await streetIndex();
  if (!streets) return [];
  const cap = await streetCap();
  const live = Object.entries(streets.n).filter(([, n]) => n > 0);
  const file = live.find(([f]) => streetSlug(f) === slug)?.[0];
  if (!file) return [];
  const page = (f: string, sameBlock = false): RelatedCityPage => ({ slug: streetSlug(f), name: streetLabelFromFile(f), count: countLabel(streets.n[f], cap), n: streets.n[f], sameBlock });
  const block = streets.b?.[file];
  const out: RelatedCityPage[] = block
    ? live.filter(([f]) => f !== file && streets.b?.[f] === block).sort((a, b) => b[1] - a[1]).slice(0, max).map(([f]) => page(f, true))
    : [];
  const ranked = live.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const at = ranked.findIndex(([f]) => f === file);
  const taken = new Set([file, ...out.map((p) => p.slug)]);
  for (let d = 1; out.length < max && (at - d >= 0 || at + d < ranked.length); d++) {
    for (const i of [at - d, at + d]) {
      const f = ranked[i]?.[0];
      if (f && out.length < max && !taken.has(f) && !taken.has(streetSlug(f))) {
        taken.add(f);
        out.push(page(f));
      }
    }
  }
  // Same-block streets first, then the ranking neighbours, each by record size.
  return out.sort((a, b) => Number(b.sameBlock) - Number(a.sameBlock) || (b.n ?? 0) - (a.n ?? 0));
}

/* ── THE ANSWER, FOR THE TITLE AND THE DESCRIPTION ───────────────────────── */

export function cityPageAnswer(p: CityPage): { title: string; answer: string } {
  const what = p.kind === "neighbourhood" ? "the neighbourhood" : "the street";
  const span = p.y0 === p.y1 ? `in ${p.y0}` : `between ${p.y0} and ${p.y1}`;
  const bits = [
    `${p.count} decisions the Board of Supervisors took about ${p.name}, ${span}, read from its own minutes and each linked to the scanned page`,
  ];
  if (p.busiest) bits.push(`most of them in the ${p.busiest}s`);
  if (p.subjects.length) {
    bits.push(`often about ${p.subjects.slice(0, 3).map((s) => s.l.toLowerCase()).join(", ")}`);
  }
  return {
    title: `${p.name}, San Francisco: what the city decided about ${what}, ${p.y0}–${p.y1}`,
    answer: `${bits.join("; ")}.`,
  };
}
