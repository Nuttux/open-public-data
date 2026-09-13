import "server-only";
/**
 * The answer of the Marseille hub and section pages (/fr/city/marseille and
 * its budget, dette, investissements, lieux, logement, marches, subventions
 * pages) — same contract as ./national.ts: an answer title, one sentence with
 * the figures, the year, the source and the date of the data, FR + EN, plus
 * BreadcrumbList + Dataset JSON-LD.
 *
 * Every figure is read through the loader the page itself calls, for the year
 * the page opens on (no ?year=, which is also the canonical URL). Sources are
 * the ones the pages already name; dates are the exports' `generated_at`.
 */
import {
  loadBudgetIndex,
  loadBudgetPageData,
  loadInvestissementsData,
  loadLogementSocialData,
  loadMarchesPageData,
  loadPatrimoineData,
  loadQuiRecoitData,
} from "@/lib/fusion-data";
import { readDataJsonOrNull } from "@/lib/data/read";
import { cityPopulation } from "@/lib/methodology";
import { loadPlacesIndex } from "@/lib/marseille/marseille-places-data";
import { day, longDate, mEur, num, pct, type FrHub, type Lang } from "./national";

const BASE = "/fr/city/marseille";
const CREATOR = "Ville de Marseille";
const SPATIAL = "Marseille, France";
const PARENTS = [{ fr: "Marseille", en: "Marseille", path: BASE }];

/** "1,84 Md€" / "€1.84 bn" — the pages' fmtBillions (2 decimals). */
const md2 = (eur: number, l: Lang) => (l === "en" ? `€${num(eur / 1e9, l, 2)} bn` : `${num(eur / 1e9, l, 2)} Md€`);
const span = (years: number[]) => (years.length ? `${Math.min(...years)}/${Math.max(...years)}` : undefined);
const genAt = (rel: string) => readDataJsonOrNull<{ generated_at?: string }>(rel)?.generated_at ?? null;
/** ", données au 7 mai 2026" / ", data as of 7 May 2026". */
const asOf = (iso: string | null, l: Lang) => {
  const d = longDate(iso, l);
  return d ? (l === "en" ? `, data as of ${d}` : `, données au ${d}`) : "";
};

/**
 * Une année vieille de plus de deux ans ne va pas dans un titre : « 434 contrats
 * en 2020 » annonce une page périmée avant même le clic. Le chiffre reste dans
 * la description, avec son année.
 */
function isRecent(year: number): boolean {
  return year >= new Date().getFullYear() - 2;
}

// ─── Budget figures shared by the hub and /budget ───────────────────────────

function budgetFacts() {
  const index = loadBudgetIndex("marseille");
  const d = loadBudgetPageData(undefined, "marseille");
  const pop = cityPopulation("marseille");
  const isVoted = (index.summary.find((s) => s.year === d.year)?.type_budget ?? "execute") === "vote";
  return { index, d, pop, isVoted };
}

// ─── /fr/city/marseille ─────────────────────────────────────────────────────

export function marseilleCityHub(): FrHub {
  const { index, d, pop, isVoted } = budgetFacts();
  // Landing scale: total spending ÷ population ÷ 12, rounded (marseille-landing-model).
  const perMonth = pop ? Math.round(d.depenses / pop / 12) : 0;
  const date = genAt(`marseille/budget_sankey_${d.year}.json`) ?? genAt("marseille/budget_index.json");
  return {
    path: BASE,
    parents: [],
    crumb: { fr: "Marseille", en: "Marseille" },
    fr: {
      // Pas de total dans le titre : la page d'accueil met en avant le coût par
      // habitant, et son libellé « dépenses réelles » ne correspond pas au budget voté.
      title: "Marseille : budget, subventions et marchés de la Ville",
      description:
        `La Ville de Marseille ${isVoted ? `prévoit ${md2(d.depenses, "fr")} de dépenses à son budget voté ${d.year}` : `a dépensé ${md2(d.depenses, "fr")} en ${d.year}`}` +
        `${perMonth ? ` (${num(perMonth, "fr")} € par habitant par mois, pour ${num(pop, "fr")} habitants)` : ""} ; ` +
        `subventions, marchés publics et lieux détaillés, chaque chiffre relié à sa source. ` +
        `Source : ${isVoted ? "budget primitif" : "compte administratif"} (M57) publié sur data.gouv.fr, population INSEE.`,
    },
    en: {
      title: "Marseille: city budget, grants and public contracts",
      description:
        `The Ville de Marseille ${isVoted ? `plans ${md2(d.depenses, "en")} of spending in its ${d.year} voted budget` : `spent ${md2(d.depenses, "en")} in ${d.year}`}` +
        `${perMonth ? ` (€${num(perMonth, "en")} per resident per month, for ${num(pop, "en")} residents)` : ""}; ` +
        `grants, public contracts and places in detail, every figure linked to its source. ` +
        `Source: ${isVoted ? "voted budget" : "administrative account"} (M57) published on data.gouv.fr, INSEE population.`,
    },
    dataset: {
      creator: CREATOR,
      spatialCoverage: SPATIAL,
      temporalCoverage: span(index.availableYears),
      dateModified: day(date),
      keywords: ["Marseille", "Ville de Marseille", "budget", "subventions", "marchés publics", "finances publiques"],
    },
  };
}

// ─── /budget ────────────────────────────────────────────────────────────────

export function marseilleBudgetHub(): FrHub {
  const { index, d, pop, isVoted } = budgetFacts();
  const perHab = pop ? d.depenses / pop : 0;
  const date = genAt(`marseille/budget_sankey_${d.year}.json`) ?? genAt("marseille/budget_index.json");
  return {
    path: `${BASE}/budget`,
    parents: PARENTS,
    crumb: { fr: "Budget", en: "Budget" },
    fr: {
      title: isVoted
        ? `Budget de Marseille ${d.year} : ${md2(d.depenses, "fr")} (budget voté)`
        : `Budget de Marseille ${d.year} : ${md2(d.depenses, "fr")} dépensés`,
      description:
        `${isVoted ? `Le budget voté par la Ville de Marseille pour ${d.year} prévoit` : `La Ville de Marseille a dépensé en ${d.year}`} ${md2(d.depenses, "fr")} ` +
        `${isVoted ? "de dépenses " : ""}(${perHab ? `${num(perHab, "fr")} € par habitant, ` : ""}fonctionnement et investissement), détaillés par nature de dépense. ` +
        `Source : ${isVoted ? "budget primitif" : "compte administratif"} (M57) publié sur data.gouv.fr${asOf(date, "fr")}.`,
    },
    en: {
      title: isVoted
        ? `Marseille budget ${d.year}: ${md2(d.depenses, "en")} (voted budget)`
        : `Marseille budget ${d.year}: ${md2(d.depenses, "en")} spent`,
      description:
        `${isVoted ? `The budget voted by the Ville de Marseille for ${d.year} plans` : `The Ville de Marseille spent in ${d.year}`} ${md2(d.depenses, "en")} ` +
        `${isVoted ? "of spending " : ""}(${perHab ? `€${num(perHab, "en")} per resident, ` : ""}operating and investment), broken down by type of spending. ` +
        `Source: ${isVoted ? "voted budget" : "administrative account"} (M57) published on data.gouv.fr${asOf(date, "en")}.`,
    },
    dataset: {
      creator: CREATOR,
      spatialCoverage: SPATIAL,
      temporalCoverage: span(index.availableYears),
      dateModified: day(date),
      keywords: ["budget Marseille", "Ville de Marseille", "M57", "budget primitif", "finances publiques"],
    },
  };
}

// ─── /dette ─────────────────────────────────────────────────────────────────

export function marseilleDetteHub(): FrHub {
  const d = loadPatrimoineData(undefined, "marseille");
  const pop = cityPopulation("marseille");
  const idx = readDataJsonOrNull<{ generated_at?: string; source?: string }>("marseille/bilan_index.json");
  const perHab = pop ? d.detteFinanciere / pop : 0;
  const cap = d.capaciteDesendettement;
  const date = idx?.generated_at ?? null;
  const path = `${BASE}/dette`;
  const base = { path, parents: PARENTS, crumb: { fr: "Dette", en: "Debt" } };
  if (!(d.detteFinanciere > 0)) {
    return {
      ...base,
      fr: { title: "Dette de la Ville de Marseille", description: "Encours de dette et trajectoire financière de la Ville de Marseille. Source : OFGL." },
      en: { title: "Ville de Marseille debt", description: "Debt outstanding and financial trajectory of the Ville de Marseille. Source: OFGL." },
      dataset: null,
    };
  }
  return {
    ...base,
    fr: {
      title: `Dette de la Ville de Marseille : ${md2(d.detteFinanciere, "fr")} fin ${d.year}`,
      description:
        `Fin ${d.year}, l’encours de dette de la Ville de Marseille s’élève à ${md2(d.detteFinanciere, "fr")}` +
        `${perHab ? `, soit ${num(perHab, "fr")} € par habitant` : ""}` +
        `${cap > 0 ? ` ; il faudrait ${num(cap, "fr", 1)} années d’épargne brute pour la rembourser` : ""}. ` +
        `Source : OFGL, base consolidée des communes${asOf(date, "fr")}.`,
    },
    en: {
      title: `Ville de Marseille debt: ${md2(d.detteFinanciere, "en")} at end-${d.year}`,
      description:
        `At end-${d.year}, the Ville de Marseille's outstanding debt stood at ${md2(d.detteFinanciere, "en")}` +
        `${perHab ? `, or €${num(perHab, "en")} per resident` : ""}` +
        `${cap > 0 ? `; repaying it would take ${num(cap, "en", 1)} years of gross savings` : ""}. ` +
        `Source: OFGL consolidated communes dataset${asOf(date, "en")}.`,
    },
    dataset: {
      creator: "OFGL",
      license: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      spatialCoverage: SPATIAL,
      temporalCoverage: span(d.availableYears),
      dateModified: day(date),
      keywords: ["dette Marseille", "encours de dette", "capacité de désendettement", "OFGL", "Ville de Marseille"],
    },
  };
}

// ─── /investissements ───────────────────────────────────────────────────────

export function marseilleInvestissementsHub(): FrHub {
  const d = loadInvestissementsData(undefined, "marseille");
  const date = genAt("marseille/investissements/index.json");
  const path = `${BASE}/investissements`;
  const base = { path, parents: PARENTS, crumb: { fr: "Investissements", en: "Investments" } };
  if (!(d.nbProjets > 0)) {
    return {
      ...base,
      fr: { title: "Investissements de la Ville de Marseille", description: "Projets d’investissement de la Ville de Marseille par thématique et arrondissement. Source : rapports de présentation des comptes administratifs (marseille.fr)." },
      en: { title: "Ville de Marseille investments", description: "Ville de Marseille investment projects by theme and district. Source: administrative account presentation reports (marseille.fr)." },
      dataset: null,
    };
  }
  const nFr = `${num(d.nbProjets, "fr")} projet${d.nbProjets > 1 ? "s" : ""}`;
  const nEn = `${num(d.nbProjets, "en")} project${d.nbProjets > 1 ? "s" : ""}`;
  return {
    ...base,
    fr: {
      // Le chargeur ne garde qu'une partie des projets de l'index : le compte
      // reste dans la phrase, qui dit d'où il vient, pas dans le titre.
      title: "Investissements de la Ville de Marseille",
      description:
        `Le rapport de présentation du compte administratif ${d.year} de la Ville de Marseille cite ${nFr} d’investissement chiffrés, ` +
        `pour ${mEur(d.total, "fr")}, classés par thématique et par arrondissement. ` +
        `Source : rapports de présentation des comptes administratifs (marseille.fr)${asOf(date, "fr")}.`,
    },
    en: {
      title: "Ville de Marseille investments",
      description:
        `The ${d.year} administrative account presentation report of the Ville de Marseille lists ${nEn} with an amount, ` +
        `totalling ${mEur(d.total, "en")}, by theme and district. ` +
        `Source: administrative account presentation reports (marseille.fr)${asOf(date, "en")}.`,
    },
    dataset: {
      creator: CREATOR,
      spatialCoverage: SPATIAL,
      temporalCoverage: span(d.availableYears),
      dateModified: day(date),
      keywords: ["investissements Marseille", "compte administratif", "projets municipaux", "arrondissements"],
    },
  };
}

// ─── /lieux ─────────────────────────────────────────────────────────────────

export function marseilleLieuxHub(): FrHub {
  const places = loadPlacesIndex();
  // Same counts as the page's IntroStats.
  const nbArr = new Set(places.map((p) => p.arrondissement).filter(Boolean)).size;
  const date = genAt("fr/marseille/places.json");
  const arrFr = nbArr > 0 ? ` dans ${num(nbArr, "fr")} arrondissement${nbArr > 1 ? "s" : ""}` : "";
  const arrEn = nbArr > 0 ? ` across ${num(nbArr, "en")} district${nbArr > 1 ? "s" : ""}` : "";
  return {
    path: `${BASE}/lieux`,
    parents: PARENTS,
    crumb: { fr: "Lieux", en: "Places" },
    fr: {
      title: `Lieux publics de Marseille : ${num(places.length, "fr")} lieux`,
      description:
        `${num(places.length, "fr")} lieux publics et patrimoniaux de Marseille (musées, bibliothèques, parcs, stade, monuments) cartographiés${arrFr}, ` +
        `chacun avec une photo sous licence libre et une note factuelle. Sélection Qipu, photos Wikimedia Commons${asOf(date, "fr")}.`,
    },
    en: {
      title: `Public places in Marseille: ${num(places.length, "en")} places`,
      description:
        `${num(places.length, "en")} public and heritage places in Marseille (museums, libraries, parks, the stadium, monuments) mapped${arrEn}, ` +
        `each with a free-licence photo and a short factual note. Selection by Qipu, photos from Wikimedia Commons${asOf(date, "en")}.`,
    },
    dataset: {
      creator: "Qipu",
      spatialCoverage: SPATIAL,
      dateModified: day(date),
      keywords: ["lieux Marseille", "patrimoine", "musées", "bibliothèques", "carte"],
    },
  };
}

// ─── /logement ──────────────────────────────────────────────────────────────

export function marseilleLogementHub(): FrHub {
  const d = loadLogementSocialData(undefined, "marseille");
  const date = genAt("marseille/logement/index.json");
  const path = `${BASE}/logement`;
  const base = { path, parents: PARENTS, crumb: { fr: "Logement social", en: "Social housing" } };
  if (!(d.sruRatio > 0)) {
    return {
      ...base,
      fr: { title: "Logement social à Marseille", description: "Le parc social marseillais : taux SRU, parc par arrondissement, bailleurs. Source : Métropole Aix-Marseille-Provence." },
      en: { title: "Social housing in Marseille", description: "Marseille's social-housing stock: SRU rate, stock by district, landlords. Source: Aix-Marseille-Provence Métropole." },
      dataset: null,
    };
  }
  const target = d.sruTarget > 0 ? d.sruTarget : null;
  return {
    ...base,
    fr: {
      title: `Logement social à Marseille : ${pct(d.sruRatio, "fr")} (SRU ${d.sruYear})`,
      description:
        `À l’inventaire SRU ${d.sruYear}, les logements sociaux représentent ${pct(d.sruRatio, "fr")} des résidences principales de Marseille` +
        `${target ? ` pour un objectif légal de ${pct(target, "fr", 0)}` : ""}` +
        `${d.stockTotal > 0 ? `, soit ${num(d.stockTotal, "fr")} logements décomptés` : ""} ; détail par arrondissement et par bailleur. ` +
        `Source : Métropole Aix-Marseille-Provence (taux SRU, parc locatif social)${asOf(date, "fr")}.`,
    },
    en: {
      title: `Social housing in Marseille: ${pct(d.sruRatio, "en")} (SRU ${d.sruYear})`,
      description:
        `In the ${d.sruYear} SRU inventory, social housing makes up ${pct(d.sruRatio, "en")} of Marseille's main residences` +
        `${target ? ` against a legal target of ${pct(target, "en", 0)}` : ""}` +
        `${d.stockTotal > 0 ? `, or ${num(d.stockTotal, "en")} counted homes` : ""}; broken down by district and social landlord. ` +
        `Source: Aix-Marseille-Provence Métropole (SRU rate, social rental stock)${asOf(date, "en")}.`,
    },
    dataset: {
      creator: "Métropole Aix-Marseille-Provence",
      spatialCoverage: SPATIAL,
      temporalCoverage: span(d.availableYears),
      dateModified: day(date),
      keywords: ["logement social Marseille", "taux SRU", "RPLS", "bailleurs sociaux"],
    },
  };
}

// ─── /marches ───────────────────────────────────────────────────────────────

export function marseilleMarchesHub(): FrHub {
  const d = loadMarchesPageData(undefined, "marseille");
  const date = genAt("marseille/marches-publics/index.json");
  const path = `${BASE}/marches`;
  const base = { path, parents: PARENTS, crumb: { fr: "Marchés publics", en: "Public contracts" } };
  if (!(d.nb > 0)) {
    return {
      ...base,
      fr: { title: "Marchés publics de la Ville de Marseille", description: "Contrats attribués par la Ville de Marseille : titulaires, montants, objets. Source : data.gouv.fr (SCDL)." },
      en: { title: "Ville de Marseille public contracts", description: "Contracts awarded by the Ville de Marseille: contractors, amounts, purposes. Source: data.gouv.fr (SCDL)." },
      dataset: null,
    };
  }
  return {
    ...base,
    fr: {
      title: isRecent(d.year) ? `Marchés publics de Marseille ${d.year} : ${num(d.nb, "fr")} contrats` : "Marchés publics de la Ville de Marseille",
      description:
        `En ${d.year}, la Ville de Marseille a notifié ${num(d.nb, "fr")} marchés publics à ${num(d.nbTitulaires, "fr")} titulaires, ` +
        `pour ${mEur(d.total, "fr")} au total, le montant maximum prévu par les contrats ; objets, montants et catégories d’achat. ` +
        `Source : data.gouv.fr, jeu SCDL de la Ville${asOf(date, "fr")}.`,
    },
    en: {
      title: isRecent(d.year) ? `Marseille public contracts ${d.year}: ${num(d.nb, "en")} awarded` : "Ville de Marseille public contracts",
      description:
        `In ${d.year}, the Ville de Marseille awarded ${num(d.nb, "en")} public contracts to ${num(d.nbTitulaires, "en")} contractors, ` +
        `with a combined maximum value of ${mEur(d.total, "en")}; purposes, amounts and purchase categories. ` +
        `Source: data.gouv.fr, the City's SCDL dataset${asOf(date, "en")}.`,
    },
    dataset: {
      creator: CREATOR,
      spatialCoverage: SPATIAL,
      temporalCoverage: span(d.availableYears),
      dateModified: day(date),
      keywords: ["marchés publics Marseille", "commande publique", "SCDL", "titulaires"],
    },
  };
}

// ─── /subventions ───────────────────────────────────────────────────────────

export function marseilleSubventionsHub(): FrHub {
  const d = loadQuiRecoitData(undefined, "marseille");
  const idx = readDataJsonOrNull<{ generated_at?: string; availableYears?: number[] }>("marseille/subventions/index.json");
  const date = idx?.generated_at ?? null;
  const path = `${BASE}/subventions`;
  const base = { path, parents: PARENTS, crumb: { fr: "Subventions", en: "Grants" } };
  if (!(d.total > 0)) {
    return {
      ...base,
      fr: { title: "Subventions de la Ville de Marseille", description: "Subventions versées par la Ville de Marseille : bénéficiaires, montants, évolution. Source : data.gouv.fr (SCDL)." },
      en: { title: "Ville de Marseille grants", description: "Grants paid by the Ville de Marseille: recipients, amounts, trends. Source: data.gouv.fr (SCDL)." },
      dataset: null,
    };
  }
  return {
    ...base,
    fr: {
      title: isRecent(d.year) ? `Subventions de Marseille ${d.year} : ${mEur(d.total, "fr")} versés` : "Subventions de la Ville de Marseille",
      description:
        `En ${d.year}, la Ville de Marseille a versé ${mEur(d.total, "fr")} à travers ${num(d.nbSubventions, "fr")} subventions` +
        `${d.nbBeneficiaires > 0 ? ` à ${num(d.nbBeneficiaires, "fr")} bénéficiaires` : ""} ; qui reçoit, combien, par thématique. ` +
        `Source : data.gouv.fr, jeux SCDL de la Ville${asOf(date, "fr")}.`,
    },
    en: {
      title: isRecent(d.year) ? `Marseille city grants ${d.year}: ${mEur(d.total, "en")} paid` : "Ville de Marseille grants",
      description:
        `In ${d.year}, the Ville de Marseille paid ${mEur(d.total, "en")} through ${num(d.nbSubventions, "en")} grants` +
        `${d.nbBeneficiaires > 0 ? ` to ${num(d.nbBeneficiaires, "en")} recipients` : ""}; who receives, how much, by theme. ` +
        `Source: data.gouv.fr, the City's SCDL datasets${asOf(date, "en")}.`,
    },
    dataset: {
      creator: CREATOR,
      spatialCoverage: SPATIAL,
      temporalCoverage: span(idx?.availableYears ?? []),
      dateModified: day(date),
      keywords: ["subventions Marseille", "associations", "bénéficiaires", "SCDL"],
    },
  };
}
