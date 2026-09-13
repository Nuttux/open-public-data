import aliases from "@/data/commune-aliases.json";

/**
 * Adresse naturelle d'une commune homonyme (« /fr/city/montreuil »), qui
 * n'existe pas : toutes les communes d'un nom partagé portent leur code INSEE
 * dans le slug. Table générée par scripts/build-commune-aliases.mjs.
 *
 * Sans dépendance (pas de fs) : proxy.ts l'importe à chaque requête.
 */
export type CommuneAlias =
  | { kind: "redirect"; to: string }
  | { kind: "choose"; slugs: string[] };

const REDIRECT = aliases.redirect as Record<string, string>;
const CHOOSE = aliases.choose as Record<string, string[]>;

export function communeAlias(base: string): CommuneAlias | null {
  const to = REDIRECT[base];
  if (to) return { kind: "redirect", to };
  const slugs = CHOOSE[base];
  return slugs ? { kind: "choose", slugs } : null;
}
