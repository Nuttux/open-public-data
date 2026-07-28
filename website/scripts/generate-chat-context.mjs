#!/usr/bin/env node
/**
 * Génère l'inventaire de données de chaque scope de chat à partir des exports
 * JSON de public/data :
 *   - src/lib/chat/paris/dataContext.generated.ts
 *   - src/lib/chat/sf/dataContext.generated.ts
 *
 * L'inventaire exposé au chat (années couvertes, totaux annuels, thématiques)
 * ne doit jamais être maintenu à la main : il dérive sinon des données réelles
 * (cf. règle "zéro chiffre hardcodé").
 *
 * Usage : npm run gen:chat-context
 * Sortie volontairement sans timestamp pour des diffs stables.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, "public", "data");
const CHAT = path.join(ROOT, "src", "lib", "chat");
const OUT = path.join(CHAT, "paris", "dataContext.generated.ts");
const OUT_SF = path.join(CHAT, "sf", "dataContext.generated.ts");
// Racine des exports par scope (Paris est à la racine, rétro-compat).
const SF_DIR = path.join(DATA, "us", "sf");

function read(rel) {
  const p = path.join(DATA, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function yearsFromGlob(prefix, dir = DATA) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => f.match(new RegExp(`^${prefix}_(\\d{4})\\.json$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

const banner = `// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
// Source : exports JSON de public/data (pipeline → marts → exports).
// Régénérer : npm run gen:chat-context
`;

function emit(outPath, name, inventory) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${banner}export const ${name} = ${JSON.stringify(inventory, null, 2)} as const;\n`);
  console.log(`✓ ${path.relative(ROOT, outPath)} régénéré`);
  for (const [k, v] of Object.entries(inventory)) {
    if (!v) console.warn(`  ⚠ dataset absent: ${k}`);
  }
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
// Vit dans src/data (import build-time), PAS dans public/data : la lecture
// pointait sur public/data et renvoyait null en silence, ce qui vidait la
// population de l'inventaire — et donc les ratios par habitant du chat.
const methoPath = path.join(ROOT, "src", "data", "methodology.json");
const metho = fs.existsSync(methoPath) ? JSON.parse(fs.readFileSync(methoPath, "utf-8")) : null;
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

emit(OUT, "GENERATED_DATA_INVENTORY", inventory);

// ---------------------------------------------------------------------------
// Scope « sf » — exports us/sf/. Mêmes règles : rien à la main.
// ---------------------------------------------------------------------------

const sfRead = (rel) => read(path.join("us", "sf", rel));
const sfYears = (prefix) => yearsFromGlob(prefix, SF_DIR);

const sfBudget = sfRead("budget_by_year.json");
const sfSpending = sfBudget?.sides?.spending?.points ?? [];
const sfVsActual = sfRead("budget_vs_actual.json");
const sfPayroll = sfRead("payroll_by_year.json");
const sfPayees = sfRead("top_payees.json");
const sfContracts = sfRead("contracts_overview.json");

const sfInventory = {
  budget: {
    years: sfSpending.map((p) => p.fiscal_year),
    // Le budget adopté est la référence citée partout : totaux + par habitant.
    totalsByYear: Object.fromEntries(
      sfSpending.map((p) => [
        p.fiscal_year,
        {
          spending_usd: round0(p.total_usd),
          per_resident_usd: round0(p.per_resident_usd),
          execution_status: p.execution_status ?? null,
        },
      ]),
    ),
    population: sfBudget?.population
      ? { value: sfBudget.population.value, year: sfBudget.population.year, source: sfBudget.population.source ?? null }
      : null,
  },
  breakdown: { years: sfYears("budget_breakdown") },
  deptDetail: { years: sfYears("budget_dept_detail") },
  vsActual: {
    years: (sfVsActual?.sides?.spending?.points ?? [])
      .filter((p) => p.budget_net_usd != null && p.actual_all_usd != null)
      .map((p) => p.fiscal_year),
  },
  payees: {
    years: Object.keys(sfPayees?.years ?? {})
      .map(Number)
      .sort((a, b) => a - b),
  },
  payroll: {
    years: (sfPayroll?.points ?? []).map((p) => p.fiscal_year),
    latest: (() => {
      const last = (sfPayroll?.points ?? []).at(-1);
      return last
        ? {
            fiscal_year: last.fiscal_year,
            total_compensation_usd: round0(last.total_compensation_usd),
            n_employees: last.n_employees,
            median_total_comp_usd: round0(last.median_total_comp_usd),
          }
        : null;
    })(),
  },
  contracts: sfContracts?.hero
    ? {
        register: {
          n_contracts: sfContracts.hero.register?.n_contracts ?? null,
          agreed_usd: round0(sfContracts.hero.register?.agreed_usd),
          paid_usd: round0(sfContracts.hero.register?.paid_usd),
        },
        active: {
          n_contracts: sfContracts.hero.active?.n_contracts ?? null,
          agreed_usd: round0(sfContracts.hero.active?.agreed_usd),
        },
      }
    : null,
};

emit(OUT_SF, "GENERATED_SF_INVENTORY", sfInventory);
