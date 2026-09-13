/**
 * The "answer" of the Paris section hubs (/fr/city/paris/<section>): a title
 * that answers the searcher's question with the headline figure of the page,
 * one description sentence with the figures, the year, the source and the
 * date of the data, and the Dataset + BreadcrumbList structured data.
 *
 * Every figure is read through the SAME loader the page renders
 * (lib/fusion-data.ts, lib/lieux-data.ts) with the same year selection and
 * the same rounding as the page's headline — nothing typed by hand. The date
 * is the export's `generated_at` (falling back to the weekly refresh date of
 * data_freshness.json), never "today".
 */
import type { Metadata } from "next";
import {
  breadcrumbJsonLd,
  buildLocaleAwareMetadata,
  datasetJsonLd,
} from "@/lib/seo";
import { getDataFreshness } from "@/lib/data-freshness";
import { readDataJsonOrNull } from "@/lib/data/read";
import {
  loadBudgetIndex,
  loadBudgetPageData,
  loadInvestissementsData,
  loadLogementSocialData,
  loadMarchesPageData,
  loadPatrimoineData,
  loadQuiRecoitData,
} from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { LOCALE_HOSTS } from "@/lib/site-locale";

export type ParisSection = "budget" | "subventions" | "marches" | "investissements" | "dette" | "logement" | "lieux";
type Lang = "fr" | "en";
type Text = { title: string; answer: string };

export type ParisSectionSeo = {
  path: string;
  fr: Text;
  en: Text;
  /** Short name of the dataset / breadcrumb leaf, per language. */
  label: Record<Lang, string>;
  keywords: string[];
  temporalCoverage?: string;
  /** ISO date (YYYY-MM-DD) of the data behind the headline figure. */
  dateModified?: string;
};

const NBSP = " ";
const NNBSP = " ";

// ─── Formatting — same rounding as the page headlines ──────────────────────

const nf = (lang: Lang, digits: number) =>
  new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Billions with 2 decimals, as the hubs' hero numbers (fmtBillions): "11,02 Md€" / "€11.02bn". */
function bn(n: number, lang: Lang): string {
  const v = nf(lang, 2).format(n / 1e9);
  return lang === "en" ? `€${v}bn` : `${v}${NBSP}Md€`;
}

/** Millions, no decimal (fmtMillions / fmtInt(n / 1e6)): "2 653 M€" / "€2,653M". */
function mn(n: number, lang: Lang): string {
  const v = nf(lang, 0).format(n / 1e6);
  return lang === "en" ? `€${v}M` : `${v}${NBSP}M€`;
}

/** Billions from 1 bn up, millions below — the page's `eur()` switch. */
function amount(n: number, lang: Lang): string {
  return Math.abs(n) >= 1e9 ? bn(n, lang) : mn(n, lang);
}

function int(n: number, lang: Lang): string {
  // fr-FR groups with a narrow no-break space; keep it unbreakable in titles.
  return nf(lang, 0).format(n).replace(/\s/g, lang === "fr" ? NNBSP : " ");
}

function pct(n: number, lang: Lang, digits = 1): string {
  const v = nf(lang, digits).format(n);
  return lang === "en" ? `${v}%` : `${v}${NBSP}%`;
}

function yearSpan(years: number[]): { first: number; last: number } | null {
  const ys = years.filter((y) => Number.isFinite(y));
  if (ys.length === 0) return null;
  return { first: Math.min(...ys), last: Math.max(...ys) };
}

function spanText(years: number[]): string {
  const s = yearSpan(years);
  if (!s) return "";
  return s.first === s.last ? String(s.first) : `${s.first}–${s.last}`;
}

function coverage(years: number[]): string | undefined {
  const s = yearSpan(years);
  return s ? `${s.first}/${s.last}` : undefined;
}

/** Latest `generated_at` among the given exports, else the refresh date. YYYY-MM-DD. */
function dataIso(files: string[]): string | undefined {
  const stamps = files
    .map((f) => readDataJsonOrNull<{ generated_at?: string }>(f)?.generated_at)
    .filter((s): s is string => typeof s === "string" && !Number.isNaN(new Date(s).getTime()))
    .map((s) => s.slice(0, 10))
    .sort();
  return stamps.at(-1) ?? getDataFreshness()?.updated_on_qipu_at?.slice(0, 10);
}

function longDate(iso: string | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

function sourceLine(lang: Lang, source: string, iso: string | undefined): string {
  const date = longDate(iso, lang);
  if (lang === "en") return date ? `Source: ${source}, data as of ${date}.` : `Source: ${source}.`;
  return date ? `Source${NBSP}: ${source}, données au ${date}.` : `Source${NBSP}: ${source}.`;
}

// ─── Per section ───────────────────────────────────────────────────────────

const PATH = (s: ParisSection) => `/fr/city/paris/${s}`;

function budget(year?: number): ParisSectionSeo {
  const index = loadBudgetIndex();
  const d = loadBudgetPageData(year);
  const typeOf = (y: number) => index.summary.find((s) => s.year === y)?.type_budget ?? "execute";
  const isVoted = typeOf(d.year) === "vote";
  const lastExec = index.summary
    .filter((s) => s.type_budget === "execute" && s.year < d.year)
    .sort((a, b) => b.year - a.year)[0];
  const iso = dataIso([`budget_sankey_${d.year}.json`]);
  const span = spanText(index.availableYears);
  const src = {
    fr: "comptes administratifs et budgets primitifs de la Ville de Paris (opendata.paris.fr)",
    en: "City of Paris administrative accounts and voted budgets (opendata.paris.fr)",
  };

  const fr: Text = isVoted
    ? {
        title: `Budget de Paris ${d.year} : ${bn(d.depenses, "fr")} de dépenses prévues au budget voté`,
        answer:
          `Pour ${d.year}, le budget voté par le Conseil de Paris prévoit ${bn(d.depenses, "fr")} de dépenses et ${bn(d.recettes, "fr")} de recettes` +
          (lastExec ? ` ; en ${lastExec.year}, dernière année de comptes exécutés, la Ville a dépensé ${bn(lastExec.depenses, "fr")}.` : ".") +
          ` Série ${span}. ${sourceLine("fr", src.fr, iso)}`,
      }
    : {
        title: `Budget de Paris ${d.year} : ${bn(d.depenses, "fr")} dépensés, comptes exécutés`,
        answer:
          `En ${d.year}, d'après le compte administratif, la Ville de Paris a dépensé ${bn(d.depenses, "fr")} et encaissé ${bn(d.recettes, "fr")} de recettes. ` +
          `Série ${span}. ${sourceLine("fr", src.fr, iso)}`,
      };
  const en: Text = isVoted
    ? {
        title: `Paris budget ${d.year}: ${bn(d.depenses, "en")} of spending planned in the voted budget`,
        answer:
          `For ${d.year}, the budget voted by the Conseil de Paris plans ${bn(d.depenses, "en")} of spending and ${bn(d.recettes, "en")} of revenue` +
          (lastExec ? `; in ${lastExec.year}, the latest year of executed accounts, the City spent ${bn(lastExec.depenses, "en")}.` : ".") +
          ` Series ${span}. ${sourceLine("en", src.en, iso)}`,
      }
    : {
        title: `Paris budget ${d.year}: ${bn(d.depenses, "en")} spent, executed accounts`,
        answer:
          `In ${d.year}, according to the administrative account, the City of Paris spent ${bn(d.depenses, "en")} and took in ${bn(d.recettes, "en")} of revenue. ` +
          `Series ${span}. ${sourceLine("en", src.en, iso)}`,
      };
  return {
    path: PATH("budget"),
    fr,
    en,
    label: { fr: "Budget de la Ville de Paris", en: "City of Paris budget" },
    keywords: ["budget Paris", "Ville de Paris", "compte administratif", "budget primitif", "dépenses", "recettes"],
    temporalCoverage: coverage(index.availableYears),
    dateModified: iso,
  };
}

function subventions(year?: number): ParisSectionSeo {
  const d = loadQuiRecoitData(year);
  const years = d.yearsSummary.map((y) => y.year);
  const iso = dataIso(["subventions/index.json", `subventions/beneficiaires_${d.year}.json`]);
  const span = spanText(years);
  return {
    path: PATH("subventions"),
    fr: {
      title: `Subventions de Paris en ${d.year} : ${amount(d.total, "fr")} versés à ${int(d.nbBeneficiaires, "fr")} bénéficiaires`,
      answer:
        `En ${d.year}, la Ville de Paris a versé ${amount(d.total, "fr")} à ${int(d.nbBeneficiaires, "fr")} bénéficiaires (${int(d.nbSubventions, "fr")} subventions), d'après l'annexe du compte administratif. ` +
        `Série ${span}. ${sourceLine("fr", "subventions versées, Ville de Paris (opendata.paris.fr)", iso)}`,
    },
    en: {
      title: `Paris city grants in ${d.year}: ${amount(d.total, "en")} paid to ${int(d.nbBeneficiaires, "en")} recipients`,
      answer:
        `In ${d.year}, the City of Paris paid ${amount(d.total, "en")} to ${int(d.nbBeneficiaires, "en")} recipients (${int(d.nbSubventions, "en")} grants), according to the appendix of its administrative account. ` +
        `Series ${span}. ${sourceLine("en", "grants paid, City of Paris (opendata.paris.fr)", iso)}`,
    },
    label: { fr: "Subventions versées par la Ville de Paris", en: "Grants paid by the City of Paris" },
    keywords: ["subventions Paris", "associations", "bénéficiaires", "Ville de Paris", "compte administratif"],
    temporalCoverage: coverage(years),
    dateModified: iso,
  };
}

function marches(year?: number): ParisSectionSeo {
  const d = loadMarchesPageData(year);
  const iso = dataIso([`marches-publics/marches_${d.year}.json`]);
  return {
    path: PATH("marches"),
    fr: {
      title: `Marchés publics de Paris en ${d.year} : ${int(d.nb, "fr")} contrats, ${amount(d.total, "fr")} d'enveloppes maximales`,
      answer:
        `En ${d.year}, la Ville de Paris a notifié ${int(d.nb, "fr")} marchés publics à ${int(d.nbTitulaires, "fr")} titulaires distincts, pour ${amount(d.total, "fr")} d'enveloppes maximales cumulées : des plafonds sur la durée des contrats, pas des dépenses de l'année. ` +
        sourceLine("fr", "données essentielles de la commande publique (DECP), Ville de Paris (opendata.paris.fr)", iso),
    },
    en: {
      title: `Paris public contracts in ${d.year}: ${int(d.nb, "en")} contracts, ${amount(d.total, "en")} in maximum envelopes`,
      answer:
        `In ${d.year}, the City of Paris awarded ${int(d.nb, "en")} public contracts to ${int(d.nbTitulaires, "en")} distinct holders, for ${amount(d.total, "en")} in cumulative maximum envelopes: ceilings over the life of the contracts, not spending in the year. ` +
        sourceLine("en", "essential public procurement data (DECP), City of Paris (opendata.paris.fr)", iso),
    },
    label: { fr: "Marchés publics de la Ville de Paris", en: "City of Paris public contracts" },
    keywords: ["marchés publics Paris", "commande publique", "DECP", "titulaires", "Ville de Paris"],
    temporalCoverage: coverage(d.availableYears),
    dateModified: iso,
  };
}

function investissements(year?: number): ParisSectionSeo {
  const d = loadInvestissementsData(year);
  const iso = dataIso(["investissement_tendances.json", `map/investissements_complet_${d.year}.json`]);
  const years = d.availableYears;
  return {
    path: PATH("investissements"),
    fr: {
      title: `Investissements de Paris en ${d.year} : ${amount(d.total, "fr")} dépensés, ${int(d.nbProjets, "fr")} projets recensés`,
      answer:
        `En ${d.year}, d'après le compte administratif, les dépenses d'investissement de la Ville de Paris atteignent ${amount(d.total, "fr")} ; les ${int(d.nbProjets, "fr")} projets détaillés dans ses annexes représentent ${pct(d.projetsCoveragePct, "fr", 0)} de ce total. ` +
        sourceLine("fr", "compte administratif et annexes d'investissement de la Ville de Paris (opendata.paris.fr)", iso),
    },
    en: {
      title: `Paris capital spending in ${d.year}: ${amount(d.total, "en")}, ${int(d.nbProjets, "en")} projects listed`,
      answer:
        `In ${d.year}, according to the administrative account, the City of Paris's capital spending reached ${amount(d.total, "en")}; the ${int(d.nbProjets, "en")} projects itemised in its appendices account for ${pct(d.projetsCoveragePct, "en", 0)} of that total. ` +
        sourceLine("en", "City of Paris administrative account and investment appendices (opendata.paris.fr)", iso),
    },
    label: { fr: "Investissements de la Ville de Paris", en: "City of Paris capital investment" },
    keywords: ["investissements Paris", "projets", "arrondissements", "compte administratif", "Ville de Paris"],
    temporalCoverage: coverage(years),
    dateModified: iso,
  };
}

function dette(year?: number): ParisSectionSeo {
  const d = loadPatrimoineData(year);
  const iso = dataIso([`bilan_sankey_${d.year}.json`]);
  return {
    path: PATH("dette"),
    fr: {
      title: `Dette de la Ville de Paris : ${amount(d.detteFinanciere, "fr")} de dette financière au 31 décembre ${d.year}`,
      answer:
        `Au 31 décembre ${d.year}, d'après le bilan du compte administratif, la dette financière de la Ville de Paris (emprunts auprès des banques et obligations) s'élève à ${amount(d.detteFinanciere, "fr")}, ses fonds propres à ${amount(d.fondsPropres, "fr")} et son actif à ${amount(d.actif, "fr")}. ` +
        sourceLine("fr", "compte administratif M57 de la Ville de Paris (bilan)", iso),
    },
    en: {
      title: `City of Paris debt: ${amount(d.detteFinanciere, "en")} of financial debt at 31 December ${d.year}`,
      answer:
        `At 31 December ${d.year}, according to the balance sheet of the administrative account, the City of Paris owed ${amount(d.detteFinanciere, "en")} in financial debt (bank loans and bonds); its equity stood at ${amount(d.fondsPropres, "en")} and its assets at ${amount(d.actif, "en")}. ` +
        sourceLine("en", "City of Paris M57 administrative account (balance sheet)", iso),
    },
    label: { fr: "Dette et patrimoine de la Ville de Paris", en: "City of Paris debt and balance sheet" },
    keywords: ["dette Paris", "bilan", "fonds propres", "compte administratif", "Ville de Paris"],
    temporalCoverage: coverage(d.availableYears),
    dateModified: iso,
  };
}

function logement(year?: number): ParisSectionSeo {
  const d = loadLogementSocialData(year);
  const iso = dataIso([`map/arrondissements_stats_${d.year}.json`]);
  const hasSru = typeof d.sruRatio === "number" && Number.isFinite(d.sruRatio);
  const srcFr = "inventaire SRU (DDT Paris) et logements sociaux financés, Ville de Paris (opendata.paris.fr)";
  const srcEn = "SRU inventory (DDT Paris) and funded social housing, City of Paris (opendata.paris.fr)";
  return {
    path: PATH("logement"),
    fr: {
      title: hasSru
        ? `Logement social à Paris : taux SRU de ${pct(d.sruRatio, "fr")} (${d.sruYear}), ${int(d.nouveauxParAn, "fr")} logements financés en ${d.year}`
        : `Logement social à Paris : ${int(d.nouveauxParAn, "fr")} logements financés en ${d.year}`,
      answer:
        (hasSru
          ? `D'après l'inventaire SRU ${d.sruYear}, Paris compte ${int(d.stockTotal, "fr")} logements sociaux, soit ${pct(d.sruRatio, "fr")} des résidences principales pour une cible légale de ${pct(d.sruTarget, "fr", 0)} ; `
          : "") +
        `${hasSru ? "en" : "En"} ${d.year}, ${int(d.nouveauxParAn, "fr")} logements sociaux ont été financés. ` +
        sourceLine("fr", srcFr, iso),
    },
    en: {
      title: hasSru
        ? `Social housing in Paris: ${pct(d.sruRatio, "en")} SRU rate (${d.sruYear}), ${int(d.nouveauxParAn, "en")} units funded in ${d.year}`
        : `Social housing in Paris: ${int(d.nouveauxParAn, "en")} units funded in ${d.year}`,
      answer:
        (hasSru
          ? `According to the ${d.sruYear} SRU inventory, Paris has ${int(d.stockTotal, "en")} social housing units, ${pct(d.sruRatio, "en")} of main residences against a legal target of ${pct(d.sruTarget, "en", 0)}; `
          : "") +
        `${hasSru ? "in" : "In"} ${d.year}, ${int(d.nouveauxParAn, "en")} social housing units were funded. ` +
        sourceLine("en", srcEn, iso),
    },
    label: { fr: "Logement social à Paris", en: "Social housing in Paris" },
    keywords: ["logement social Paris", "loi SRU", "logements financés", "bailleurs sociaux", "arrondissements"],
    temporalCoverage: coverage(d.availableYears),
    dateModified: iso,
  };
}

function lieux(): ParisSectionSeo {
  const all = loadLieuxIndex();
  const n = all.length;
  const argent = all.reduce((s, l) => s + (l.argent_total_eur ?? 0), 0);
  const since = all.reduce<number | null>((min, l) => (l.depuis && (min === null || l.depuis < min) ? l.depuis : min), null);
  const iso = dataIso(["lieux/index.json"]);
  const money = (lang: Lang) => (argent > 0 ? mn(argent, lang) : null);
  const frTitleBits = [
    since ? `archives depuis ${since}` : null,
    money("fr") ? `${money("fr")} d'argent public identifié` : null,
  ].filter(Boolean);
  const enTitleBits = [
    since ? `archives since ${since}` : null,
    money("en") ? `${money("en")} of public money identified` : null,
  ].filter(Boolean);
  return {
    path: PATH("lieux"),
    fr: {
      title: `${int(n, "fr")} lieux de Paris${frTitleBits.length ? ` : ${frTitleBits.join(", ")}` : ""}`,
      answer:
        `Piscines, théâtres, parcs : pour ${int(n, "fr")} lieux de Paris, les délibérations du Conseil de Paris, les archives du Bulletin municipal` +
        (since ? ` depuis ${since}` : "") +
        `, les subventions et les investissements` +
        (money("fr") ? `, soit ${money("fr")} d'argent public identifié` : "") +
        ` — chaque fait relié à sa source. ` +
        (longDate(iso, "fr") ? `Données au ${longDate(iso, "fr")}.` : ""),
    },
    en: {
      title: `${int(n, "en")} Paris places${enTitleBits.length ? `: ${enTitleBits.join(", ")}` : ""}`,
      answer:
        `Pools, theatres, parks: for ${int(n, "en")} places in Paris, the Conseil de Paris deliberations, the municipal bulletin archives` +
        (since ? ` since ${since}` : "") +
        `, grants and capital investment` +
        (money("en") ? ` — ${money("en")} of public money identified` : "") +
        `, every fact linked to its source. ` +
        (longDate(iso, "en") ? `Data as of ${longDate(iso, "en")}.` : ""),
    },
    label: { fr: "Lieux de Paris", en: "Paris places" },
    keywords: ["lieux Paris", "équipements publics", "Conseil de Paris", "Bulletin municipal", "archives"],
    temporalCoverage: since ? `${since}/..` : undefined,
    dateModified: iso,
  };
}

/** Year from `?year=` — the loaders fall back to the page's default year when absent or unknown. */
export function yearParam(v: string | undefined): number | undefined {
  const y = v ? Number(v) : NaN;
  return Number.isInteger(y) ? y : undefined;
}

export function parisSectionSeo(section: ParisSection, year?: number): ParisSectionSeo {
  switch (section) {
    case "budget": return budget(year);
    case "subventions": return subventions(year);
    case "marches": return marches(year);
    case "investissements": return investissements(year);
    case "dette": return dette(year);
    case "logement": return logement(year);
    case "lieux": return lieux();
  }
}

/** Next Metadata: answer title + description, canonical + hreflang on the host of the request's language. */
export async function parisSectionMetadata(section: ParisSection, year?: number): Promise<Metadata> {
  const s = parisSectionSeo(section, year);
  return buildLocaleAwareMetadata({
    title: s.fr.title,
    description: s.fr.answer,
    en: { title: s.en.title, description: s.en.answer },
    path: s.path,
    keywords: s.keywords,
  });
}

/**
 * Dataset + BreadcrumbList for a hub, with URLs on the host that speaks
 * `lang`. The breadcrumb is Qipu › section: /fr/city/paris itself redirects
 * to the home page (next.config.ts), so it is not listed as a crumb.
 */
export function parisSectionJsonLd(section: ParisSection, lang: Lang, year?: number): object[] {
  const s = parisSectionSeo(section, year);
  const base = LOCALE_HOSTS[lang];
  const t = s[lang];
  const bc = breadcrumbJsonLd([
    { name: "Qipu", path: "/" },
    { name: s.label[lang], path: s.path },
  ]);
  bc.itemListElement = bc.itemListElement.map((i) => ({ ...i, item: i.item.replace(/^https:\/\/www\.qipu\.org/, base) }));
  const ds = {
    ...datasetJsonLd({
      name: s.label[lang],
      description: t.answer,
      path: s.path,
      keywords: s.keywords,
      dateModified: s.dateModified,
      temporalCoverage: s.temporalCoverage,
      spatialCoverage: "Paris, France",
      creator: "Ville de Paris",
    }),
    url: `${base}${s.path}`,
    inLanguage: lang === "fr" ? "fr-FR" : "en",
  };
  return [bc, ds];
}
