import "server-only";
/**
 * The answer of the San Francisco section hubs (/us, /us/city/sf and its
 * budget, contracts, who-gets-paid, payroll, places and sources pages) — the
 * same contract as the SF entity fiches (lib/us/sf-answers.ts): a title that
 * answers, one sentence with the figures, the years, who paid, the source and
 * the date of the data, plus Dataset + BreadcrumbList JSON-LD.
 *
 * Every figure is read from the export the page itself displays, through the
 * loaders the page uses, for the year the page opens on (the latest CLOSED
 * fiscal year where the page has a year picker). The source named is the
 * export's own `source` block — the dataset the page links to on DataSF.
 */
import { createElement, Fragment, type ReactElement } from "react";
import { breadcrumbJsonLd, datasetJsonLd } from "@/lib/seo";
import { readDataJson } from "@/lib/data/read";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";
import { isoDate, n, sourceSentence, type PageAnswer } from "@/lib/seo/page-answer";
import { defaultFiscalYear, loadSfBudgetBreakdown, loadSfBudgetByYear } from "@/lib/us/sf-budget-data";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { loadSfContractsOverview } from "@/app/[lang]/usa/san-francisco/contracts/data";
import type { WgpFile } from "@/app/[lang]/usa/san-francisco/who-gets-paid/wgp-types";
import type { PayrollByYear } from "@/app/[lang]/usa/san-francisco/payroll/payroll-types";
import type { UsDailyBread } from "@/app/[lang]/usa/national/us-types";

const CREATOR = "City and County of San Francisco";
const SPATIAL = "San Francisco, California, United States";

export type SfHub = {
  path: string;
  /** Short label of the page's own crumb. */
  crumb: string;
  answer: PageAnswer;
  /** null for pages that are not a figure from a dataset (country hub, sources). */
  dataset: { dateModified?: string; temporalCoverage?: string; keywords: string[] } | null;
};

type SourceBlock = { name: string; attribution?: string | null };

/** `SF Controller's Office — "Budget" dataset on DataSF` — from the export. */
function sourceName(s: SourceBlock): string {
  return `${s.attribution ?? "SF Controller's Office"} — “${s.name}” dataset on DataSF`;
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);

/** SF fiscal year N runs 1 July (N−1) to 30 June N (payroll_by_year.json
 *  fiscal_year_note) — as an ISO 8601 interval for schema.org. */
const fyInterval = (first: number, last: number) => `${first - 1}-07-01/${last}-06-30`;

const bn = (usd: number) => fmtUsdCompact(usd);

// ─── /us/city/sf/budget ─────────────────────────────────────────────────────

export function sfBudgetHub(): SfHub {
  const byYear = loadSfBudgetByYear();
  const fy = defaultFiscalYear(byYear);
  const bd = loadSfBudgetBreakdown(fy)!;
  const tot = bd.totals.spending;
  const years = byYear.sides.spending.points.map((p) => p.fiscal_year);
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const nAreas = bd.org_groups.spending.length;
  const nDepts = bd.org_groups.spending.reduce((s, g) => s + g.n_departments, 0);
  const perRes = tot.per_resident_usd != null ? `, ${fmtUsd(tot.per_resident_usd)} per resident` : "";
  return {
    path: "/usa/san-francisco/budget",
    crumb: "Budget",
    answer: {
      title: `San Francisco budget FY${fy}: ${bn(tot.total_usd)} adopted`,
      answer:
        `San Francisco's adopted budget for FY${fy} is ${bn(tot.total_usd)} across all funds${perRes}, ` +
        `spread over ${n("service area", nAreas)} and ${n("department", nDepts)}, each dollar counted once net of transfers between City funds; ` +
        `adopted budgets from FY${y0} to FY${y1}. ${sourceSentence("en", sourceName(bd.source), isoDate(bd.as_of, "en"))}`,
    },
    dataset: {
      dateModified: day(bd.as_of),
      temporalCoverage: fyInterval(y0, y1),
      keywords: ["San Francisco", "city budget", "adopted budget", "appropriations", "public finance"],
    },
  };
}

// ─── /us/city/sf/who-gets-paid ──────────────────────────────────────────────

export function sfPayeesHub(): SfHub {
  const file = readDataJson<WgpFile>("us/sf/top_payees.json");
  const years = Object.entries(file.years)
    .map(([k, y]) => ({ fy: Number(k), status: y.execution_status }))
    .sort((a, b) => a.fy - b.fy);
  // Same default as the page: the latest closed fiscal year.
  const fy = years.filter((y) => y.status === "closed").at(-1)?.fy ?? years.at(-1)!.fy;
  const y = file.years[String(fy)];
  const related =
    y.totals.related_govt_units_usd > 0
      ? `, ${bn(y.totals.related_govt_units_usd)} of it via related government units`
      : "";
  return {
    path: "/usa/san-francisco/who-gets-paid",
    crumb: "Who gets paid",
    answer: {
      title: `Who San Francisco pays: ${bn(y.totals.all_usd)} in FY${fy}`,
      answer:
        `In FY${fy}, ${bn(y.totals.all_usd)} was paid through the City and County of San Francisco's financial system: ` +
        `${n("voucher", y.n_vouchers)} to ${n("payee", y.n_vendors)}${related}; fiscal years FY${years[0].fy} to FY${years.at(-1)!.fy} on file. ` +
        sourceSentence("en", sourceName(file.source), isoDate(file.as_of, "en")),
    },
    dataset: {
      dateModified: day(file.as_of),
      temporalCoverage: fyInterval(years[0].fy, years.at(-1)!.fy),
      keywords: ["San Francisco", "vendor payments", "payees", "nonprofits", "public spending"],
    },
  };
}

// ─── /us/city/sf/contracts ──────────────────────────────────────────────────

export function sfContractsHub(): SfHub {
  const o = loadSfContractsOverview();
  const { active, register } = o.hero;
  const asOfActive = isoDate(o.export_date_pacific, "en");
  return {
    path: "/usa/san-francisco/contracts",
    crumb: "Contracts",
    answer: {
      // One figure, the page's first: agreed on the contracts active today; the
      // counts stay in the sentence.
      title: `San Francisco active contracts: ${bn(active.agreed_usd)} agreed`,
      answer:
        `${n("supplier contract", register.n_contracts)} are on San Francisco's books; ` +
        `${active.n_contracts.toLocaleString("en-US")} are active${asOfActive ? ` (ending on or after ${asOfActive})` : ""}, ` +
        `with ${bn(active.agreed_usd)} agreed and ${bn(active.paid_usd)} paid to date. ` +
        sourceSentence("en", sourceName(o.source), isoDate(o.as_of, "en")),
    },
    dataset: {
      dateModified: day(o.as_of),
      keywords: ["San Francisco", "supplier contracts", "public procurement", "sole source", "contract payments"],
    },
  };
}

// ─── /us/city/sf/payroll ────────────────────────────────────────────────────

export function sfPayrollHub(): SfHub {
  const p = readDataJson<PayrollByYear>("us/sf/payroll_by_year.json");
  const pts = [...p.points].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const last = pts.at(-1)!;
  const first = pts[0];
  const fy = last.fiscal_year;
  return {
    path: "/usa/san-francisco/payroll",
    crumb: "Payroll",
    answer: {
      title: `San Francisco payroll FY${fy}: ${bn(last.total_compensation_usd)}`,
      answer:
        `In FY${fy}, the City and County of San Francisco paid ${bn(last.total_compensation_usd)} in total compensation ` +
        `(salaries, overtime, other pay and benefits) to ${n("person", last.n_employees, "en", "people")} — a headcount, not full-time equivalents — ` +
        `with a median of ${fmtUsd(last.median_total_comp_usd)} per person; fiscal years FY${first.fiscal_year} to FY${fy}, published as aggregates only. ` +
        sourceSentence("en", sourceName(p.source), isoDate(p.as_of, "en")),
    },
    dataset: {
      dateModified: day(p.as_of),
      temporalCoverage: fyInterval(first.fiscal_year, fy),
      keywords: ["San Francisco", "city payroll", "employee compensation", "overtime", "public employees"],
    },
  };
}

// ─── /us/city/sf/places ─────────────────────────────────────────────────────

export function sfPlacesHub(): SfHub {
  const places = loadSfPlacesIndex();
  // The page's own three aggregates (places/page.tsx), same arithmetic.
  const totalDocs = places.reduce((s, p) => s + p.n_documents, 0);
  const totalFunds = places.reduce((s, p) => s + (p.funds_usd ?? 0), 0);
  const nDepts = new Set(places.map((p) => p.owning_dept_code)).size;
  const idx = readDataJson<{ generated_at: string }>("us/sf/places/index.json");
  const funds = totalFunds > 0 ? `${bn(totalFunds)} in contract dollars paid for work at them` : null;
  return {
    path: "/usa/san-francisco/places",
    crumb: "Places",
    answer: {
      title: funds
        ? `San Francisco places: ${bn(totalFunds)} paid to contractors`
        : `San Francisco, place by place: ${n("place", places.length)}`,
      answer:
        `${n("San Francisco place", places.length)} — parks, libraries, hospitals, piers — run by ${n("City department", nDepts)}: ` +
        `${funds ? `${funds}, and ` : ""}${n("archive document", totalDocs)} held at the Internet Archive, every fact linked to its source. ` +
        sourceSentence("en", "SF Controller open data on DataSF and the Internet Archive", isoDate(idx.generated_at, "en")),
    },
    dataset: {
      dateModified: day(idx.generated_at),
      keywords: ["San Francisco", "parks", "libraries", "public buildings", "city archives"],
    },
  };
}

// ─── /us/city/sf ────────────────────────────────────────────────────────────

export function sfCityHub(): SfHub {
  const byYear = loadSfBudgetByYear();
  const fy = defaultFiscalYear(byYear);
  // The landing's scale act reads the same point (lib/us/sf-landing-model.tsx).
  const ref = byYear.sides.spending.points.find((p) => p.fiscal_year === fy)!;
  const perMonth = ref.per_resident_usd != null ? Math.round(ref.per_resident_usd / 12) : null;
  const pop = byYear.population;
  return {
    path: "/usa/san-francisco",
    crumb: "San Francisco",
    answer: {
      title: `San Francisco public money: ${bn(ref.total_usd)} budget (FY${fy})`,
      answer:
        `San Francisco adopted a ${bn(ref.total_usd)} budget for FY${fy}` +
        `${perMonth != null ? `, ${fmtUsd(perMonth)} per resident per month for ${pop.value.toLocaleString("en-US")} residents (U.S. Census, ${pop.year})` : ""}. ` +
        `Its budget, payments, contracts, payroll and places, each figure linked to the dataset it comes from. ` +
        sourceSentence("en", sourceName(byYear.source), isoDate(byYear.as_of, "en")),
    },
    dataset: {
      dateModified: day(byYear.as_of),
      temporalCoverage: fyInterval(Math.min(...byYear.sides.spending.points.map((p) => p.fiscal_year)), Math.max(...byYear.sides.spending.points.map((p) => p.fiscal_year))),
      keywords: ["San Francisco", "public money", "city budget", "vendor payments", "contracts", "payroll"],
    },
  };
}

// ─── /us/city/sf/sources ────────────────────────────────────────────────────

export function sfSourcesHub(): SfHub {
  return {
    path: "/usa/san-francisco/sources",
    crumb: "Sources & method",
    answer: {
      title: "San Francisco public finance data: sources and methodology",
      answer:
        "Where every figure on Qipu's San Francisco budget, payees, contracts and payroll pages comes from: the DataSF source datasets published by the SF Controller's Office, their perimeters, the privacy rules and the methodology, in one place.",
    },
    dataset: null,
  };
}

// ─── /us ────────────────────────────────────────────────────────────────────

export function usCountryHub(): SfHub {
  const db = readDataJson<UsDailyBread>("us/national/daily_bread.json");
  const byYear = loadSfBudgetByYear();
  const sfFy = defaultFiscalYear(byYear);
  const sfTotal = byYear.sides.spending.points.find((p) => p.fiscal_year === sfFy)!.total_usd;
  const outlays = db.outlays.total.current_fytd_usd;
  const through = isoDate(db.completeness.fytd_through, "en");
  const toDate = db.completeness.fiscal_year_complete ? "" : " to date";
  return {
    path: "/usa",
    crumb: "United States",
    answer: {
      title: "US public money: federal spending and San Francisco",
      answer:
        `Federal outlays reached ${bn(outlays)} in fiscal year ${db.fiscal_year}${through && toDate ? ` through ${through}` : ""}, according to the U.S. Treasury's ${db.source.name}, ` +
        `and San Francisco adopted a ${bn(sfTotal)} budget for FY${sfFy}, according to the SF Controller's Office on DataSF: ` +
        `the federal dollar, and the city's budget, payments, contracts, payroll and places, each figure linked to its source.`,
    },
    dataset: null,
  };
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

/** Breadcrumb trail of a hub: Qipu › United States › San Francisco › section. */
function hubCrumbs(h: SfHub): { name: string; path: string }[] {
  const out = [{ name: "Qipu", path: "/" }];
  if (h.path === "/usa") return [...out, { name: h.crumb, path: h.path }];
  out.push({ name: "United States", path: "/usa" });
  if (h.path === "/usa/san-francisco") return [...out, { name: h.crumb, path: h.path }];
  out.push({ name: "San Francisco", path: "/usa/san-francisco" });
  return [...out, { name: h.crumb, path: h.path }];
}

const ld = (obj: unknown, key: string) =>
  createElement("script", { key, type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(obj) } });

/** BreadcrumbList (+ Dataset when the hub's answer is a figure). Nothing visible. */
export function SfHubJsonLd({ hub }: { hub: SfHub }): ReactElement {
  const scripts = [ld(breadcrumbJsonLd(hubCrumbs(hub)), "bc")];
  if (hub.dataset) {
    scripts.push(
      ld(
        {
          ...datasetJsonLd({
            name: hub.answer.title,
            description: hub.answer.answer,
            path: hub.path,
            keywords: hub.dataset.keywords,
            dateModified: hub.dataset.dateModified,
            temporalCoverage: hub.dataset.temporalCoverage,
            spatialCoverage: SPATIAL,
            creator: CREATOR,
          }),
          inLanguage: "en",
        },
        "ds",
      ),
    );
  }
  return createElement(Fragment, null, ...scripts);
}
