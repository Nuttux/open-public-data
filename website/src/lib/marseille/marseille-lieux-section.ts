import type { LieuIndexEntry, LieuxSection } from "@/lib/lieux-data";
import { loadPlacesIndex, type MarseillePlace } from "@/lib/marseille/marseille-places-data";

/**
 * Marseille's places on the Lieux section grammar (2026-09-17) : the same
 * index rows and section totals as Paris, computed from places.json. The
 * money is what the Ville paid the place's operator in grants (the place IS
 * the beneficiary : Friche, La Criée, MuCEM), year by year ; no works, no
 * contracts, no archive.
 */
export function marseilleLieuxIndex(places: MarseillePlace[] = loadPlacesIndex()): LieuIndexEntry[] {
  return places.map((p) => ({
    slug: p.slug,
    name: p.name,
    kind_fr: p.kind_fr,
    famille: p.famille,
    arrondissement: p.arrondissement ?? 0,
    lat: p.lat,
    lon: p.lon,
    n_lieu: null,
    n_moments: 0,
    argent_total_eur: p.subvention?.montant_total ?? 0,
    depense_reelle_eur: p.subvention?.montant_total ?? 0,
    depuis: null,
    photo: p.photo,
  }));
}

export function marseilleLieuxSection(places: MarseillePlace[] = loadPlacesIndex()): LieuxSection {
  const families = new Map<string, { key: string; count: number; amount: number }>();
  const arrs = new Map<number, { arr: number; count: number; amount: number }>();
  const years = new Map<number, number>();
  let total = 0;
  let withMoney = 0;
  for (const p of places) {
    const v = p.subvention?.montant_total ?? 0;
    total += v;
    if (v > 0) withMoney += 1;
    const f = families.get(p.famille) ?? { key: p.famille, count: 0, amount: 0 };
    f.count += 1; f.amount += v; families.set(p.famille, f);
    if (p.arrondissement) {
      const a = arrs.get(p.arrondissement) ?? { arr: p.arrondissement, count: 0, amount: 0 };
      a.count += 1; a.amount += v; arrs.set(p.arrondissement, a);
    }
    for (const r of p.subvention?.rows ?? []) years.set(r.annee, (years.get(r.annee) ?? 0) + r.montant);
  }
  const ys = [...years.keys()].sort((a, b) => a - b);
  return {
    count: places.length,
    withMoney,
    total,
    since: ys[0] ?? new Date().getFullYear(),
    lastYear: ys[ys.length - 1] ?? new Date().getFullYear(),
    oldestArchive: null,
    families: [...families.values()].sort((a, b) => b.amount - a.amount),
    arrondissements: [...arrs.values()].sort((a, b) => a.arr - b.arr),
    series: ys.map((year) => ({ year, amount: years.get(year) ?? 0 })),
  };
}
