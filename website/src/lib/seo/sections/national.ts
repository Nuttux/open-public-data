import "server-only";
/**
 * The answer of the France national pages (/fr/national/{budget,dette,etat,
 * fiscalite,daily-bread}): a title that answers the question a searcher or an
 * AI engine asks, one sentence with the figures, the year, the source and the
 * date of the data — in French AND English, since the host decides the
 * language — plus BreadcrumbList + Dataset JSON-LD.
 *
 * Every figure is read from the export the page itself displays, through the
 * loader the page uses, with the page's own rounding (the hero's formatter).
 * When the export is missing, the answer falls back to a figure-free title
 * rather than inventing one.
 *
 * Also hosts the small JSON-LD renderer shared with ./marseille.ts.
 */
import { createElement, Fragment, type ReactElement } from "react";
import { breadcrumbJsonLd, datasetJsonLd } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site-locale";
import {
  loadDailyBread,
  loadEtatLFI,
  loadEtatLFIHistory,
  loadEurostatDette,
  loadEurostatFiscalite,
} from "@/lib/national-data";

export type Lang = "fr" | "en";
export type Answer = { title: string; description: string };

/** A section page: its answer in both languages, its crumbs, its dataset facts. */
export type FrHub = {
  path: string;
  fr: Answer;
  en: Answer;
  /** Trail between "Qipu" and the page itself, e.g. [{Marseille}] for a Marseille section. */
  parents: { fr: string; en: string; path: string }[];
  /** Short crumb of the page itself. */
  crumb: { fr: string; en: string };
  /** null for pages whose answer is not a figure from a dataset. */
  dataset: {
    creator: string;
    /** The source's licence URL; omitted when the page mixes sources. */
    license?: string;
    spatialCoverage: string;
    temporalCoverage?: string;
    dateModified?: string;
    keywords: string[];
  } | null;
};

// ─── Formatting (same rules as the pages' hero formatters) ──────────────────

const tag = (l: Lang) => (l === "en" ? "en-GB" : "fr-FR");
export const num = (v: number, l: Lang, digits = 0) =>
  v.toLocaleString(tag(l), { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** "446,9 Md€" / "€446.9 bn". */
export const bnEur = (eur: number, l: Lang, digits = 1) =>
  l === "en" ? `€${num(eur / 1e9, l, digits)} bn` : `${num(eur / 1e9, l, digits)} Md€`;
/** "72,8 M€" / "€72.8 m". */
export const mEur = (eur: number, l: Lang, digits = 1) =>
  l === "en" ? `€${num(eur / 1e6, l, digits)} m` : `${num(eur / 1e6, l, digits)} M€`;
/** "43,4 %" / "43.4%". */
export const pct = (v: number, l: Lang, digits = 1) =>
  l === "en" ? `${num(v, l, digits)}%` : `${num(v, l, digits)} %`;
/** "3 mai 2026" / "3 May 2026" from an ISO stamp. */
export const longDate = (iso: string | null | undefined, l: Lang): string | null => {
  // Calendar day as written in the export (some stamps carry no timezone).
  const m = iso?.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const out = new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  return l === "fr" ? out.replace(/^1 /, "1er ") : out;
};
export const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);

// ─── /fr/national/dette ─────────────────────────────────────────────────────

export function nationalDetteHub(): FrHub {
  const path = "/france/dette";
  const d = loadEurostatDette();
  const s13 = d?.fr_series.find((s) => s.code === "S13");
  // Hero = the last point of the S13 series (DetteClient).
  const lastPct = s13?.pc_gdp.at(-1)?.v ?? null;
  const lastEur = s13?.mio_eur.at(-1)?.v ?? null; // millions €
  const q = d?.latest_quarter?.match(/^(\d{4})-Q(\d)$/);
  const quarter = (l: Lang) => (q ? `${l === "en" ? "Q" : "T"}${q[2]} ${q[1]}` : "");
  const fetched = (l: Lang) => longDate(d?.fetched_at, l);
  const base = {
    path,
    parents: [],
    crumb: { fr: "Dette publique", en: "Public debt" },
  };
  if (!d || lastPct == null || !q) {
    return {
      ...base,
      fr: { title: "Dette publique de la France", description: "Dette des administrations publiques françaises au sens de Maastricht, par sous-secteur. Source : Eurostat." },
      en: { title: "French public debt", description: "Maastricht debt of French general government, by sub-sector. Source: Eurostat." },
      dataset: null,
    };
  }
  const bn = (l: Lang) => (lastEur != null ? (l === "en" ? `€${num(lastEur / 1000, l)} bn` : `${num(lastEur / 1000, l)} Md€`) : null);
  const first = s13?.pc_gdp[0]?.t;
  return {
    ...base,
    fr: {
      title: `Dette publique de la France : ${pct(lastPct, "fr")} du PIB (${quarter("fr")})`,
      description:
        `Au ${quarter("fr")}, la dette des administrations publiques françaises au sens de Maastricht atteint ${pct(lastPct, "fr")} du PIB` +
        `${bn("fr") ? `, soit ${bn("fr")}` : ""}, ventilée entre État, collectivités locales et Sécurité sociale. ` +
        `Source : ${d.source}${fetched("fr") ? `, données récupérées le ${fetched("fr")}` : ""}.`,
    },
    en: {
      title: `French public debt: ${pct(lastPct, "en")} of GDP (${quarter("en")})`,
      description:
        `In ${quarter("en")}, the Maastricht debt of French general government stood at ${pct(lastPct, "en")} of GDP` +
        `${bn("en") ? `, or ${bn("en")}` : ""}, split between central government, local authorities and social security. ` +
        `Source: ${d.source}${fetched("en") ? `, data retrieved on ${fetched("en")}` : ""}.`,
    },
    dataset: {
      creator: "Eurostat",
      // Eurostat : CC BY 4.0 (avis de copyright, vérifié le 13/09/2026).
      license: "https://creativecommons.org/licenses/by/4.0/",
      spatialCoverage: "France",
      temporalCoverage: first ? `${first.slice(0, 4)}/${d.latest_quarter.slice(0, 4)}` : undefined,
      dateModified: day(d.fetched_at),
      keywords: ["dette publique", "Maastricht", "France", "Eurostat", "public debt"],
    },
  };
}

// ─── /fr/national/etat ──────────────────────────────────────────────────────

const REMB_LABEL = "Remboursements et dégrèvements"; // same filter as EtatClient

export function nationalEtatHub(): FrHub {
  const path = "/france/etat";
  const e = loadEtatLFI();
  const base = { path, parents: [], crumb: { fr: "Budget de l’État", en: "State budget" } };
  if (!e) {
    return {
      ...base,
      fr: { title: "Budget de l’État", description: "Le budget général de l’État par mission et par programme. Source : data.economie.gouv.fr." },
      en: { title: "French State budget", description: "The French State general budget by mission and programme. Source: data.economie.gouv.fr." },
      dataset: null,
    };
  }
  const history = loadEtatLFIHistory();
  const nMissions = e.missions.filter((m) => m.label !== REMB_LABEL).length;
  const t = e.totals;
  const fetched = (l: Lang) => longDate(e.fetched_at, l);
  const years = history.map((h) => h.exercice);
  return {
    ...base,
    fr: {
      title: `Budget de l’État ${e.exercice} : ${bnEur(t.bg_net_cp, "fr")} (${e.loi})`,
      description:
        `Le ${e.loi} ${e.exercice} prévoit ${bnEur(t.bg_net_cp, "fr")} de dépenses nettes pour le budget général de l’État ` +
        `(${bnEur(t.bg_brut_cp, "fr")} brut, dont ${bnEur(t.remboursements_degrev_cp, "fr")} de remboursements et dégrèvements), réparties en ${nMissions} missions. ` +
        `Source : ${e.source}${fetched("fr") ? `, données récupérées le ${fetched("fr")}` : ""}.`,
    },
    en: {
      title: `French State budget ${e.exercice}: ${bnEur(t.bg_net_cp, "en")} (${e.loi})`,
      description:
        `The ${e.exercice} budget bill (${e.loi}) plans ${bnEur(t.bg_net_cp, "en")} of net spending for the State general budget ` +
        `(${bnEur(t.bg_brut_cp, "en")} gross, including ${bnEur(t.remboursements_degrev_cp, "en")} of tax refunds and rebates), across ${nMissions} missions. ` +
        `Source: ${e.source}${fetched("en") ? `, data retrieved on ${fetched("en")}` : ""}.`,
    },
    dataset: {
      creator: "Ministère de l’Économie et des Finances",
      license: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      spatialCoverage: "France",
      temporalCoverage: years.length ? `${Math.min(...years)}/${Math.max(...years)}` : String(e.exercice),
      dateModified: day(e.fetched_at),
      keywords: ["budget de l'État", "PLF", "missions", "LOLF", "France", "State budget"],
    },
  };
}

// ─── /fr/national/fiscalite ─────────────────────────────────────────────────

/** "Cotisations sociales" → "cotisations sociales"; "TVA" stays "TVA". */
const lcFirst = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function nationalFiscaliteHub(): FrHub {
  const path = "/france/fiscalite";
  const f = loadEurostatFiscalite();
  const base = { path, parents: [], crumb: { fr: "Fiscalité", en: "Taxation" } };
  const totalPct = f?.fr_total_po.pc_gdp ?? null;
  if (!f || totalPct == null) {
    return {
      ...base,
      fr: { title: "Prélèvements obligatoires en France", description: "Structure des prélèvements obligatoires en France. Source : Eurostat." },
      en: { title: "Compulsory levies in France", description: "Structure of compulsory levies in France. Source: Eurostat." },
      dataset: null,
    };
  }
  const totalMio = f.fr_total_po.mio_eur;
  const bn = (l: Lang) => (totalMio != null ? (l === "en" ? `€${num(totalMio / 1000, l)} bn` : `${num(totalMio / 1000, l)} Md€`) : null);
  const row = (code: string) => f.fr_breakdown.find((r) => r.code === code && r.pc_gdp != null);
  const parts = ["D61", "D211"].map(row).filter((r): r is NonNullable<typeof r> => !!r);
  const partsText = (l: Lang) =>
    parts.map((r) => `${l === "en" ? lcFirst(r.label_en) : lcFirst(r.label_fr)} ${pct(r.pc_gdp as number, l)}`).join(", ");
  const fetched = (l: Lang) => longDate(f.fetched_at, l);
  const y = f.latest_year;
  const firstYear = f.evolution_years[0];
  return {
    ...base,
    fr: {
      title: `Prélèvements obligatoires ${y} : ${pct(totalPct, "fr")} du PIB`,
      description:
        `En ${y}, les prélèvements obligatoires des administrations publiques représentent ${pct(totalPct, "fr")} du PIB` +
        `${bn("fr") ? `, soit environ ${bn("fr")}` : ""}${parts.length ? ` (dont ${partsText("fr")} du PIB)` : ""}. ` +
        `Source : ${f.source}${fetched("fr") ? `, données récupérées le ${fetched("fr")}` : ""}.`,
    },
    en: {
      title: `Taxes and levies in France ${y}: ${pct(totalPct, "en")} of GDP`,
      description:
        `In ${y}, compulsory levies collected by French general government amounted to ${pct(totalPct, "en")} of GDP` +
        `${bn("en") ? `, about ${bn("en")}` : ""}${parts.length ? ` (of which ${partsText("en")} of GDP)` : ""}. ` +
        `Source: ${f.source}${fetched("en") ? `, data retrieved on ${fetched("en")}` : ""}.`,
    },
    dataset: {
      creator: "Eurostat",
      // Eurostat : CC BY 4.0 (avis de copyright, vérifié le 13/09/2026).
      license: "https://creativecommons.org/licenses/by/4.0/",
      spatialCoverage: "France",
      temporalCoverage: firstYear ? `${firstYear}/${y}` : String(y),
      dateModified: day(f.fetched_at),
      keywords: ["prélèvements obligatoires", "fiscalité", "TVA", "cotisations sociales", "France", "Eurostat"],
    },
  };
}

// ─── /fr/national/budget ────────────────────────────────────────────────────

export function nationalBudgetHub(): FrHub {
  const path = "/france/budget";
  const db = loadDailyBread();
  const a = db?.apu_subsectors;
  const inst = a?.institutions;
  // Same total as the page hero: S1311 + S1313 + S1314 (unconsolidated).
  const secu = inst?.S1314?.annual_eur ?? 0;
  const etat = inst?.S1311?.annual_eur ?? 0;
  const local = inst?.S1313?.annual_eur ?? 0;
  const total = secu + etat + local;
  const base = { path, parents: [], crumb: { fr: "Budget de la France", en: "French budget" } };
  if (!a || total <= 0) {
    return {
      ...base,
      fr: { title: "Le budget de la France", description: "Les dépenses publiques françaises : Sécurité sociale, État central, collectivités locales. Sources : Eurostat, PLF, OFGL." },
      en: { title: "The French budget", description: "French public expenditure: social security, central government, local authorities. Sources: Eurostat, PLF, OFGL." },
      dataset: null,
    };
  }
  // Page hero (BnEurCountUp rawMd): whole Md€ at ≥ 100.
  const md = (eur: number, l: Lang) => (l === "en" ? `€${num(Math.round(eur / 1e9), l)} bn` : `${num(Math.round(eur / 1e9), l)} Md€`);
  const y = a.year;
  // fetched_at is in the export but not in the loader's type.
  const fetchedAt = (a as { fetched_at?: string }).fetched_at ?? db?.generated_at;
  const fetched = (l: Lang) => longDate(fetchedAt, l);
  return {
    ...base,
    fr: {
      title: `Budget de la France ${y} : ${md(total, "fr")} de dépenses`,
      description:
        `En ${y}, la Sécurité sociale (${md(secu, "fr")}), l’État central et ses opérateurs (${md(etat, "fr")}) et les collectivités locales (${md(local, "fr")}) ` +
        `dépensent ${md(total, "fr")}, avant transferts entre administrations. ` +
        `Source : ${a.source}, détail par PLF et OFGL${fetched("fr") ? ` ; données récupérées le ${fetched("fr")}` : ""}.`,
    },
    en: {
      title: `French public spending ${y}: ${md(total, "en")}`,
      description:
        `In ${y}, social security (${md(secu, "en")}), central government and its agencies (${md(etat, "en")}) and local authorities (${md(local, "en")}) ` +
        `spent ${md(total, "en")}, before transfers between public bodies. ` +
        `Source: ${a.source}, detail from the budget bill (PLF) and OFGL${fetched("en") ? `; data retrieved on ${fetched("en")}` : ""}.`,
    },
    dataset: {
      creator: "Eurostat",
      // Eurostat : CC BY 4.0 (avis de copyright, vérifié le 13/09/2026).
      license: "https://creativecommons.org/licenses/by/4.0/",
      spatialCoverage: "France",
      temporalCoverage: String(y),
      dateModified: day(fetchedAt),
      keywords: ["dépenses publiques", "budget de la France", "Sécurité sociale", "collectivités locales", "Eurostat", "PLF", "OFGL"],
    },
  };
}

// ─── /fr/national/daily-bread ───────────────────────────────────────────────

/** A simulator: no single honest figure, so a descriptive answer. The Dataset
 *  is the table of schedules and shares it computes from (daily_bread.json). */
export function nationalDailyBreadHub(): FrHub {
  const db = loadDailyBread();
  const irYear = db?.fiscal_constants?.ir?.date_reference?.slice(0, 4);
  return {
    path: "/france/simulateur-prelevements",
    parents: [],
    crumb: { fr: "Daily Bread", en: "Daily Bread" },
    fr: {
      title: "Où vont les prélèvements sur un salaire : simulateur",
      description:
        "À partir d’un salaire net, du nombre de parts et de la commune, le simulateur estime les prélèvements obligatoires mensuels " +
        "(cotisations, CSG, impôt sur le revenu, TVA) et leur répartition entre Sécurité sociale, État et collectivités locales. " +
        `Sources : barèmes CGI et URSSAF${irYear ? ` ${irYear}` : ""}, Eurostat, PLF, OFGL.`,
    },
    en: {
      title: "Where the taxes on a salary go: simulator",
      description:
        "From a net salary, household size and municipality, the simulator estimates monthly compulsory levies " +
        "(social contributions, CSG, income tax, VAT) and how they split between social security, central government and local authorities. " +
        `Sources: CGI and URSSAF schedules${irYear ? ` ${irYear}` : ""}, Eurostat, PLF, OFGL.`,
    },
    dataset: db
      ? {
          creator: "Qipu",
          spatialCoverage: "France",
          temporalCoverage: irYear,
          dateModified: day(db.generated_at),
          keywords: ["prélèvements obligatoires", "simulateur", "salaire", "Sécurité sociale", "France"],
        }
      : null,
  };
}

// ─── Metadata + JSON-LD ─────────────────────────────────────────────────────

/** Input for buildLocaleAwareMetadata: FR strings, EN twin, real path. */
export function hubMetadataInput(h: FrHub) {
  return { title: h.fr.title, description: h.fr.description, en: h.en, path: h.path, keywords: h.dataset?.keywords };
}

const ld = (obj: unknown, key: string) =>
  createElement("script", { key, type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(obj) } });

/** BreadcrumbList (+ Dataset when the answer is a figure), on the host that speaks `locale`. Nothing visible. */
export function FrHubJsonLd({ hub, locale }: { hub: FrHub; locale: Lang }): ReactElement {
  const a = hub[locale];
  const crumbs = [
    { name: "Qipu", path: "/" },
    ...hub.parents.map((p) => ({ name: p[locale], path: p.path })),
    { name: hub.crumb[locale], path: hub.path },
  ];
  const bc = breadcrumbJsonLd(crumbs, locale);
  const scripts = [ld(bc, "bc")];
  if (hub.dataset) {
    scripts.push(
      ld(
        {
          ...datasetJsonLd({
            name: a.title,
            description: a.description,
            path: hub.path,
            keywords: hub.dataset.keywords,
            dateModified: hub.dataset.dateModified,
            temporalCoverage: hub.dataset.temporalCoverage,
            spatialCoverage: hub.dataset.spatialCoverage,
            creator: hub.dataset.creator,
            license: hub.dataset.license,
          }),
          url: absoluteUrl(hub.path, locale),
          inLanguage: locale === "fr" ? "fr-FR" : "en",
        },
        "ds",
      ),
    );
  }
  return createElement(Fragment, null, ...scripts);
}
