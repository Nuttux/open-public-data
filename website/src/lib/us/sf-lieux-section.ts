import "server-only";
import type { LieuIndexEntry, LieuxSection } from "@/lib/lieux-data";
import { loadSfPlacesIndex, type SfPlaceIndexEntry } from "@/lib/us/sf-places-data";
import { readDataJsonOrNull } from "@/lib/data/read";
import { SF_FAMILY_KEY } from "./sf-lieux";

/**
 * San Francisco's places on the Lieux section grammar (2026-09-18) : the
 * same index rows and section totals as Paris, from the 95 published places
 * (index.json) and their contract payments (_capital.json → payees). The
 * money is what the City paid contractors for work at the place — the one
 * quantified, single-source figure per place ; bond and permit amounts are
 * never summed in (they double-count). The payments carry no year : the
 * section has no year rail, and the number stands without a year.
 */

type CapitalFile = { places?: Record<string, { payees?: { first_fiscal_year: number | null; last_fiscal_year: number | null }[] }> };
type Fiche = { owning_dept?: { name: string; code: string } };

/** The owning departments' names, as their own fiches print them. */
function deptNames(places: SfPlaceIndexEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of places) {
    if (out.has(p.owning_dept_code)) continue;
    const f = readDataJsonOrNull<Fiche>(`us/sf/places/${p.slug}.json`);
    if (f?.owning_dept?.name) out.set(p.owning_dept_code, f.owning_dept.name);
  }
  return out;
}

export type SfLieux = { lieux: LieuIndexEntry[]; section: LieuxSection };

let _cache: SfLieux | null = null;

export function loadSfLieux(): SfLieux {
  if (_cache) return _cache;
  const places = loadSfPlacesIndex();
  const names = deptNames(places);
  const capital = readDataJsonOrNull<CapitalFile>("us/sf/places/_capital.json")?.places ?? {};
  const families = new Map<string, { key: string; count: number; amount: number }>();
  const areas = new Map<string, { key: string; label: string; count: number; amount: number }>();
  let total = 0;
  let withMoney = 0;
  let first = Infinity;
  let last = -Infinity;
  const lieux: LieuIndexEntry[] = places.map((p) => {
    const v = p.funds_usd ?? 0;
    const fam = SF_FAMILY_KEY[p.family] ?? "civic";
    total += v;
    if (v > 0) withMoney += 1;
    const fr = families.get(fam) ?? { key: fam, count: 0, amount: 0 };
    fr.count += 1; fr.amount += v; families.set(fam, fr);
    const areaKey = p.owning_dept_code || undefined;
    const areaLabel = areaKey ? names.get(areaKey) ?? areaKey : undefined;
    if (areaKey && areaLabel) {
      const a = areas.get(areaKey) ?? { key: areaKey, label: areaLabel, count: 0, amount: 0 };
      a.count += 1; a.amount += v; areas.set(areaKey, a);
    }
    for (const y of capital[p.slug]?.payees ?? []) {
      if (y.first_fiscal_year) first = Math.min(first, y.first_fiscal_year);
      if (y.last_fiscal_year) last = Math.max(last, y.last_fiscal_year);
    }
    return {
      slug: p.slug,
      name: p.name,
      kind_fr: p.kind,
      famille: fam,
      arrondissement: 0,
      areaKey,
      lat: p.lat,
      lon: p.lon,
      n_lieu: null,
      n_moments: 0,
      argent_total_eur: v,
      depense_reelle_eur: v,
      photo: p.photo,
    };
  });
  const thisYear = new Date().getFullYear();
  _cache = {
    lieux,
    section: {
      count: places.length,
      withMoney,
      total,
      since: Number.isFinite(first) ? first : thisYear,
      lastYear: Number.isFinite(last) ? Math.min(last, thisYear) : thisYear,
      oldestArchive: null,
      families: [...families.values()].sort((a, b) => b.amount - a.amount),
      arrondissements: [],
      areas: [...areas.values()].sort((a, b) => a.label.localeCompare(b.label, "en-US")),
      series: [],
    },
  };
  return _cache;
}
