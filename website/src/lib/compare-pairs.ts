import "server-only";
import { listAllCommunesMeta } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { communeHasBudgetNatureLayer } from "@/lib/commune-capabilities";

/**
 * Which comparison a commune page proposes, and which comparisons go to the
 * sitemap.
 *
 * The commune page loader (app/fr/city/[slug]/page-ville-data.ts) picks its
 * default comparison here, so the sitemap pilot below lists the very pairs
 * those pages link to — not a second guess at them.
 *
 * Reads the communes' meta file only (slug, name, département, population):
 * robots.txt and the sitemap segments call this and must not parse the 33 MB
 * national index to lay out their ids.
 */

type Meta = ReturnType<typeof listAllCommunesMeta>[number];
export type CompareOption = { slug: string; nom: string; pop: number };

let _bySlug: Map<string, Meta> | null = null;
let _byDep: Map<string, Meta[]> | null = null;

function indexes(): { bySlug: Map<string, Meta>; byDep: Map<string, Meta[]> } {
  if (_bySlug && _byDep) return { bySlug: _bySlug, byDep: _byDep };
  const bySlug = new Map<string, Meta>();
  const byDep = new Map<string, Meta[]>();
  // Meta order is kept inside each département: the sorts below are stable,
  // so ties in population fall exactly as they did over the full list.
  for (const c of listAllCommunesMeta()) {
    bySlug.set(c.slug, c);
    const dep = byDep.get(c.dep_name);
    if (dep) dep.push(c);
    else byDep.set(c.dep_name, [c]);
  }
  // An unhydrated first call must not pin empty indexes for the instance.
  if (bySlug.size) {
    _bySlug = bySlug;
    _byDep = byDep;
  }
  return { bySlug, byDep };
}

function meta(slug: string): Meta | null {
  return indexes().bySlug.get(slug) ?? null;
}

const byGap = (pop: number) => (a: { pop: number }, b: { pop: number }) => Math.abs(a.pop - pop) - Math.abs(b.pop - pop);

/**
 * Les communes qu'on propose face à celle-ci : le même département, classées
 * par proximité de population, avec un budget publié. La voisine par défaut
 * est la plus proche en taille.
 */
export function compareOptions(slug: string, limit = 60): CompareOption[] {
  const me = meta(slug);
  if (!me) return [];
  return (indexes().byDep.get(me.dep_name) ?? [])
    .filter((c) => c.slug !== slug && !hasDedicatedRoutes(c.slug))
    .filter((c) => communeHasBudgetNatureLayer(c.slug))
    .sort(byGap(me.pop))
    .slice(0, limit)
    .map((c) => ({ slug: c.slug, nom: c.nom, pop: c.pop }))
    .sort((a, b) => b.pop - a.pop);
}

/** The default among a commune page's options: the closest in population. */
export function defaultOption<T extends { pop: number }>(options: T[], pop: number): T | null {
  return options.length ? options.slice().sort(byGap(pop))[0] : null;
}

// ── Sitemap pilot ─────────────────────────────────────────────────────────────

/**
 * Compare pages declared to search engines, as a bounded pilot (2026-09-13):
 * none of the 158 000 sitemap URLs was a comparison, yet the sessions that went
 * through one read six pages instead of one. Communes of this size or more,
 * one pair each.
 */
export const COMPARE_PILOT_MIN_POP = 10000;

/**
 * The one comparison a pilot commune contributes: the one its commune page
 * proposes by default; for a commune whose page proposes none, the commune of
 * its département closest in population. A page proposes none when the commune
 * has no budget by nature (the slim page) or has its own routes — /fr/city/paris
 * redirects to the home page, /fr/city/marseille is Marseille's own page.
 */
const _partners = new Map<string, string | null>();
function pilotPartner(slug: string): string | null {
  if (_partners.has(slug)) return _partners.get(slug) ?? null;
  const me = meta(slug);
  if (!me) return null;
  let partner: string | null = null;
  if (me.pop >= COMPARE_PILOT_MIN_POP) {
    const options =
      !hasDedicatedRoutes(slug) && communeHasBudgetNatureLayer(slug)
        ? compareOptions(slug)
        : (indexes().byDep.get(me.dep_name) ?? []).filter((c) => c.slug !== slug);
    partner = defaultOption(options, me.pop)?.slug ?? null;
  }
  _partners.set(slug, partner);
  return partner;
}

/** Larger town first; a tie goes to the slug's alphabetical order. */
function firstOfPair(a: Meta, b: Meta): boolean {
  return a.pop !== b.pop ? a.pop > b.pop : a.slug < b.slug;
}

/**
 * The canonical ordering of the pilot pair made of `a` and `b`, or null when
 * the two are not a pilot pair. The ordering is the one the proposing commune
 * page links to (`/fr/compare/<commune>/<proposed>`); when each page proposes
 * the other, the larger town comes first.
 */
export function pilotPair(a: string, b: string): [string, string] | null {
  const A = meta(a);
  const B = meta(b);
  if (!A || !B || a === b) return null;
  const aProposes = pilotPartner(a) === b;
  const bProposes = pilotPartner(b) === a;
  if (aProposes && bProposes) return firstOfPair(A, B) ? [a, b] : [b, a];
  if (aProposes) return [a, b];
  if (bProposes) return [b, a];
  return null;
}

let _pilotPaths: string[] | null = null;

/** Every pilot pair once, in its canonical ordering, as a path. */
export function comparePilotPaths(): string[] {
  if (_pilotPaths) return _pilotPaths;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of listAllCommunesMeta()) {
    const partner = pilotPartner(c.slug);
    if (!partner) continue;
    const pair = pilotPair(c.slug, partner);
    if (!pair) continue;
    const path = `/fr/compare/${pair[0]}/${pair[1]}`;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  if (out.length) _pilotPaths = out;
  return out;
}
