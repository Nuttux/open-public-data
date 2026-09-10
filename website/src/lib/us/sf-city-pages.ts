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
import path from "node:path";
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

const DIR = path.join(process.cwd(), "public/data/us/sf/city/blocks");

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(DIR, rel), "utf8")) as T;
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
 * ── ONE FILE PER QUESTION, AND NEVER A FILE THIS ROUTE DOES NOT ASK ─────
 *
 * Each of these is read at most once per lambda and cached in module scope.
 * They are separate rather than one `base()` because a route carries only
 * the files it opens (`next.config.ts` §outputFileTracingIncludes) and a
 * street page has no use for the 2.2 MB of neighbourhood records.
 */
function once<T>(read: () => T): () => T {
  let v: T | undefined;
  return () => (v === undefined ? (v = read()) : v);
}

const streetIndex = once(() => readJson<StreetIndexFile>("street-index.json"));
const subjectsFile = once(() => readJson<SubjectsFile>("subjects.json"));
const hoodFacts = once(() => readJson<HoodFacts>("hood-facts.json"));
const streetCap = once(
  () => readJson<{ street_cap?: number }>("shards.json").street_cap ?? 0,
);

/**
 * ── THE STREET'S OWN ROWS, WHICH THIS FUNCTION MAY NOT CARRY ────────────
 *
 * `public/data/us/sf/city/blocks/street/**` is excluded from every `/us/**`
 * function bundle (`next.config.ts`): 21 MB of per-street records that the
 * BROWSER fetches as it needs them, and that no server route opened until
 * this page existed. An `outputFileTracingIncludes` entry cannot bring them
 * back — excludes are applied after includes and always win.
 *
 * So the file is read from disk where it is there (dev, and the build), and
 * fetched from our own origin where it is not — the same answer the block
 * share card gives to the same problem (`lib/og/us-sf-cards.tsx`). The page
 * is edge-cached for a day, so this is one request per street per deploy.
 */
async function streetRows(file: string): Promise<BlockDecision[] | null> {
  try {
    return readJson<BlockDecision[]>(`street/${file}.json`);
  } catch {
    /* not in this bundle — over HTTP, below */
  }
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const r = await fetch(
      `${proto}://${host}/data/us/sf/city/blocks/street/${file}.json`,
      { next: { revalidate: 86400 } },
    );
    return r.ok ? ((await r.json()) as BlockDecision[]) : null;
  } catch {
    return null;
  }
}

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
function subjectsOf(rows: readonly BlockDecision[], top = 6): PageSubject[] {
  const out: PageSubject[] = [];
  for (const s of subjectsFile().s) {
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
     are opened only by the page that renders one */
  return hoodFacts().hoods.map((h) => ({
    slug: hoodSlug(h.name),
    name: h.name,
    n: h.record.n,
  }));
}

export function hoodPage(slug: string): CityPage | null {
  const facts = hoodFacts();
  const at = facts.hoods.find((x) => hoodSlug(x.name) === slug);
  if (!at) return null;
  let h: HoodRecords;
  try {
    h = readJson<HoodRecords>(`hood/${at.i}.json`);
  } catch {
    return null;
  }
  const streets = streetIndex();
  const cap = streetCap();
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
    streets: (h.streets ?? [])
      .map((s) => {
        const file = s.k.replace(/[^A-Za-z0-9]+/g, "_");
        const n = streets.n[file] ?? 0;
        return { label: streetLabelFromFile(file), slug: streetSlug(file), count: countLabel(n, cap), n };
      })
      .filter((s) => s.n > 0)
      .slice(0, 8),
    notable: notableOf(rows),
    mapHref: block ? `/us/city/sf/the-city?block=${encodeURIComponent(block)}&hood=1` : "/us/city/sf/the-city",
    holds: `This page carries the ${h.per_decade} most notable decisions of each decade, ${h.n_shipped.toLocaleString("en-US")} of the ${h.n.toLocaleString("en-US")} on record; the rest are on its streets.`,
  };
}

/* ── STREETS ─────────────────────────────────────────────────────────────── */

export function listStreetPages(): { slug: string; file: string; n: number }[] {
  return Object.entries(streetIndex().n)
    .filter(([, n]) => n > 0)
    .map(([file, n]) => ({ slug: streetSlug(file), file, n }));
}

export async function streetPage(slug: string): Promise<CityPage | null> {
  const streets = streetIndex();
  const cap = streetCap();
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
    subjects: subjectsOf(rows),
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
