import type { Metadata } from "next";
import "@/app/fusion.css";

import LieuxClient from "@/app/[lang]/france/paris/lieux/LieuxClient";
import { loadSfLieux } from "@/lib/us/sf-lieux-section";
import { SF_LIEUX } from "@/lib/us/sf-lieux";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfPlacesHub, SfHubJsonLd } from "@/lib/seo/sections/sf";
import { defaultFiscalYear, loadSfBudgetByYear } from "@/lib/us/sf-budget-data";
import { loadSfContractsOverview } from "@/app/[lang]/usa/san-francisco/contracts/data";
import { readDataJson } from "@/lib/data/read";
import type { WgpFile } from "@/app/[lang]/usa/san-francisco/who-gets-paid/wgp-types";
import type { LieuxDoor, LieuxDoors } from "@/lib/lieux-doors";

// San Francisco's Places on the section grammar (2026-09-18) : the Paris
// client, fed by the 95 published places and their contract payments.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfPlacesHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

export default async function SfPlacesPage({ searchParams }: { searchParams: Promise<{ family?: string; department?: string }> }) {
  const sp = await searchParams;
  const { lieux, section } = loadSfLieux();
  // The doors carry the other sections' figures (See also, next section) :
  // the contracts active today, the payees of the latest closed fiscal year,
  // the budget of that year.
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const contracts = safe(() => loadSfContractsOverview());
  const payees = safe(() => {
    const file = readDataJson<WgpFile>("us/sf/top_payees.json");
    const years = Object.entries(file.years).map(([k, y]) => ({ fy: Number(k), status: y.execution_status, total: y.totals.all_usd })).sort((a, b) => a.fy - b.fy);
    return years.filter((y) => y.status === "closed").at(-1) ?? years.at(-1) ?? null;
  });
  const budget = safe(() => {
    const byYear = loadSfBudgetByYear();
    const fy = defaultFiscalYear(byYear);
    const point = byYear.sides.spending.points.find((p) => p.fiscal_year === fy);
    return point ? { fy, total: point.total_usd } : null;
  });
  const doors: LieuxDoors = {
    related: ([
      contracts ? { href: `${SF_LIEUX.hub}/contracts`, title: "fx.sec.lieux.r.contracts", sub: "fx.sec.lieux.r.contracts_sub", vars: { n: contracts.hero.active.n_contracts.toLocaleString("en-US") }, amount: contracts.hero.active.agreed_usd } : null,
      payees ? { href: `${SF_LIEUX.hub}/who-gets-paid`, title: "fx.sec.lieux.r.payees", sub: "fx.sec.lieux.r.payees_sub", vars: { year: payees.fy }, amount: payees.total } : null,
    ] as (LieuxDoor | null)[]).filter((d): d is LieuxDoor => d !== null),
    next: budget
      ? { href: `${SF_LIEUX.hub}/budget?year=${budget.fy}`, title: "fx.sec.lieux.next_budget_sf", sub: "fx.sec.lieux.next_budget_sf_sub", vars: { year: budget.fy }, amount: budget.total }
      : { href: `${SF_LIEUX.hub}/budget`, title: "fx.sec.lieux.next_budget_sf", sub: "fx.sec.lieux.next_budget_sf_sub_noyear" },
  };
  return (
    <>
      <SfHubJsonLd hub={sfPlacesHub()} />
      <LieuxClient lieux={lieux} section={section} doors={doors} city={SF_LIEUX} initial={{ famille: sp.family ?? null, area: sp.department ?? null }} />
    </>
  );
}
