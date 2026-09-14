/**
 * Adresses naturelles des communes homonymes.
 *
 * Quand plusieurs communes portent le même nom, sync_ofgl_all_communes.py leur
 * donne à TOUTES un slug suffixé par le code INSEE (« montreuil-93048 ») :
 * l'adresse que tout le monde écrit, /fr/city/montreuil, n'existe pas et
 * répond 404 — sur 1 491 noms et 3 796 communes, dont Montreuil, La Rochelle,
 * Saint-Nazaire, Valence ou Mérignac.
 *
 * Ce script lit l'index des communes et écrit src/data/commune-aliases.json :
 *   redirect : le nom → la commune au moins DIX FOIS plus peuplée que la
 *              suivante (aucune hésitation possible : 308 dans proxy.ts) ;
 *   choose   : le nom → ses communes, de la plus peuplée à la moins peuplée
 *              (la page commune affiche un choix, en noindex).
 * Le fichier est petit et sans dépendance pour que proxy.ts puisse l'importer.
 * src/lib/commune-aliases.test.ts recalcule tout depuis l'index et échoue si
 * les deux divergent : relancer ce script après chaque synchronisation OFGL.
 *
 *   node scripts/build-commune-aliases.mjs
 */
import fs from "node:fs";
import path from "node:path";

export const SUFFIX = /-(\d[\dab]\d{3})$/i;
export const DOMINANCE = 10;

export function computeAliases(index) {
  const groups = new Map();
  for (const c of Object.values(index.communes)) {
    const m = SUFFIX.exec(c.slug);
    if (!m) continue;
    const base = c.slug.slice(0, m.index);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ slug: c.slug, pop: c.pop || 0 });
  }
  const redirect = {};
  const choose = {};
  for (const base of [...groups.keys()].sort()) {
    if (index.slug_to_insee[base]) continue; // un vrai slug l'emporte toujours
    const list = groups.get(base).sort((a, b) => b.pop - a.pop || a.slug.localeCompare(b.slug));
    const [first, second] = list;
    if (first.pop > 0 && (!second || first.pop >= DOMINANCE * Math.max(second.pop, 1))) redirect[base] = first.slug;
    else choose[base] = list.map((c) => c.slug);
  }
  return { redirect, choose };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const index = JSON.parse(fs.readFileSync(path.join(root, "public/data/communes-all/index.json"), "utf8"));
  const { redirect, choose } = computeAliases(index);
  const out = {
    _: "Généré par scripts/build-commune-aliases.mjs depuis public/data/communes-all/index.json — ne pas éditer à la main.",
    index_generated_at: index.generated_at,
    dominance: DOMINANCE,
    redirect,
    choose,
  };
  fs.writeFileSync(path.join(root, "src/data/commune-aliases.json"), JSON.stringify(out) + "\n");
  console.log(`redirect=${Object.keys(redirect).length} choose=${Object.keys(choose).length} bytes=${JSON.stringify(out).length}`);
}
