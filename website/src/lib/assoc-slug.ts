import { slugifyLabel } from "@/lib/projet-utils";

/**
 * Clean, stable URL for a grant recipient: `/association/paris-musees`
 * instead of `/association/PARIS%20MUSEES` (2026-09-09). The slug is the
 * accent-folded, lower-cased name — the same rule as every other slug on the
 * site — so a name and its spelling variants across years ("COMITE REGIONAL
 * DE BOXE" / "COMITÉ RÉGIONAL DE BOXE") land on ONE page. The loader matches
 * rows by slug, so the old encoded-name URLs still resolve and 308 to this.
 * Client-safe: no server imports.
 */
export function assocSlug(name: string): string {
  return slugifyLabel(name);
}

export function assocHref(city: string, name: string): string {
  return `/fr/city/${city}/subventions/association/${assocSlug(name)}`;
}
