#!/usr/bin/env node
/**
 * Génère src/lib/chat/dataContext.generated.ts à partir des exports JSON de
 * public/data. L'inventaire des datasets exposé au chat (années couvertes,
 * totaux annuels, thématiques) ne doit jamais être maintenu à la main :
 * il dérive sinon des données réelles (cf. règle "zéro chiffre hardcodé").
 *
 * Usage : npm run gen:chat-context
 * Sortie volontairement sans timestamp pour des diffs stables.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, "public", "data");
const OUT = path.join(ROOT, "src", "lib", "chat", "dataContext.generated.ts");

function read(rel) {
  const p = path.join(DATA, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function yearsFromGlob(prefix) {
  return fs
    .readdirSync(DATA)
    .map((f) => f.match(new RegExp(`^${prefix}_(\\d{4})\\.json$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

const round0 = (v) => (typeof v === "number" ? Math.round(v) : v);

// ---- subventions ----
const subvIdx = read("subventions/index.json");
const subventions = subvIdx && {
  years: [...subvIdx.availableYears].sort((a, b) => a - b),
  totalsByYear: Object.fromEntries(
    Object.entries(subvIdx.totalsByYear ?? {}).map(([y, t]) => [
      y,
      { montant_total: round0(t.montant_total), nb_subventions: t.nb_subventions },
    ]),
  ),
  thematiques: subvIdx.filters?.thematiques ?? [],
};

// ---- marchés publics ----
const marchesIdx = read("marches-publics/index.json");
const marches = marchesIdx && {
  years: [...marchesIdx.availableYears].sort((a, b) => a - b),
  note: marchesIdx.note ?? null,
  totalsByYear: Object.fromEntries(
    Object.entries(marchesIdx.totalsByYear ?? {}).map(([y, t]) => [
      y,
      { enveloppe_max_totale: round0(t.enveloppe_max_totale), nb_marches: t.nb_marches },
    ]),
  ),
};

// ---- budget (sankey + index) ----
const budgetIdx = read("budget_index.json");
const budget = budgetIdx && {
  years: [...(budgetIdx.availableYears ?? [])].sort((a, b) => a - b),
  year_types: budgetIdx.year_types ?? {},
  completeYears: budgetIdx.completeYears ?? [],
};

// ---- budget par nature ----
const budgetNatureYears = yearsFromGlob("budget_nature");

// ---- évolution budget ----
const evo = read("evolution_budget.json");
const evolution = evo && {
  years: (evo.years ?? []).map((y) => y.year).sort((a, b) => a - b),
  year_types: evo.year_types ?? {},
};

// ---- voté vs exécuté ----
const vve = read("vote_vs_execute.json");
const voteExecute = vve && {
  comparison_years: vve.coverage?.comparison_years ?? [],
  forecast_years: vve.coverage?.forecast_years ?? [],
  note_perimeter: vve.coverage?.note_perimeter ?? null,
};

// ---- investissements ----
const inv = read("investissement_tendances.json");
const investissements = inv && {
  years: (inv.years ?? []).map((y) => y.year).sort((a, b) => a - b),
  chapitres: (inv.years?.[0]?.par_chapitre ?? []).map((c) => c.label),
  note_perimetre: inv.note_perimetre ?? null,
};

// ---- dette / bilan / hors-bilan ----
const detteYears = yearsFromGlob("patrimoine_structure");
const bilanYears = yearsFromGlob("bilan_sankey");
const horsBilanYears = yearsFromGlob("hors_bilan");

// ---- logement social (attente) ----
const logement = read("logement_attente_paris.json");
const logementSocial = logement && {
  year: logement.year,
  source: logement.source ?? null,
};

// ---- constantes sourcées (methodology.json) ----
const metho = read("methodology.json");
const pick = (obj) =>
  obj && { value: obj.value, unit: obj.unit ?? null, source: obj.source ?? null };
const constants = metho?.city && {
  paris_population: pick(metho.city.paris_population),
  paris_superficie_km2: pick(metho.city.paris_superficie_km2),
  paris_nb_arrondissements: pick(metho.city.paris_nb_arrondissements),
};

const inventory = {
  subventions,
  marches,
  budget,
  budget_nature: { years: budgetNatureYears },
  evolution,
  vote_execute: voteExecute,
  investissements,
  dette: { years: detteYears },
  bilan: { years: bilanYears },
  hors_bilan: { years: horsBilanYears },
  logement_social: logementSocial,
  constants,
};

const banner = `// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
// Source : exports JSON de public/data (pipeline → marts → exports).
// Régénérer : npm run gen:chat-context
`;

fs.writeFileSync(
  OUT,
  `${banner}export const GENERATED_DATA_INVENTORY = ${JSON.stringify(inventory, null, 2)} as const;\n`,
);
console.log(`✓ ${path.relative(ROOT, OUT)} régénéré`);
for (const [k, v] of Object.entries(inventory)) {
  if (!v) console.warn(`  ⚠ dataset absent: ${k}`);
}
