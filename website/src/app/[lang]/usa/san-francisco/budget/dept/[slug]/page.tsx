import type { Metadata } from "next";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfDeptFiche from "@/components/us/SfDeptFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfDeptFiche,
  loadSfBudgetBreakdown,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";
import { answerMetadata } from "@/lib/seo/page-answer";
import { budgetDeptAnswer } from "@/lib/us/sf-answers";
import RelatedLinks, { type RelatedBlock, type RelatedRow } from "@/components/fiche/RelatedLinks";
import { sfPayrollDeptSlugs } from "@/lib/us/sf-payroll-entities";
import { payrollDeptSlug } from "@/lib/us/sf-payroll-slugs";
import { sfContractDeptHref } from "@/app/[lang]/usa/san-francisco/contracts/data";
import { characterSlug, deptSlug } from "@/lib/us/sf-budget-slugs";
import PageJsonLd from "@/components/seo/PageJsonLd";

type Params = { slug: string };
type SP = { year?: string };

/** Full-page fallback for the SF department fiche (hard loads / no-JS —
 *  the root-level drawer intercepts soft navigations). */

/**
 * « See also » of a budget department: its payroll and contracts pages when
 * they exist, its spending types, and the other departments of its service
 * area — every href checked against the map the target route reads.
 */
function sfDeptRelated(dept: NonNullable<ReturnType<typeof loadSfDeptFiche>>, slug: string, year: number): RelatedBlock {
  const rows: RelatedRow[] = [];
  const name = dept.display_name ?? dept.label;
  const payrollSlug = payrollDeptSlug(dept.code);
  if (sfPayrollDeptSlugs().includes(payrollSlug)) {
    rows.push({ href: `/usa/san-francisco/payroll/dept/${payrollSlug}`, label: `${name} on the payroll`, sub: "Who works there and what they are paid" });
  }
  const contractsHref = sfContractDeptHref(dept.code);
  if (contractsHref) rows.push({ href: contractsHref, label: `${name}'s contracts`, sub: "What it buys, and from whom" });
  for (const c of (dept.spending?.characters ?? []).slice().sort((a, b) => b.amount_usd - a.amount_usd).slice(0, 4)) {
    rows.push({
      href: `/usa/san-francisco/budget/dept/${slug}/character/${characterSlug(c.code)}?year=${year}`,
      label: c.label,
      sub: `Line items and the vendor payments behind them, FY${year}`,
      amount: { v: fmtUsdCompact(c.amount_usd), u: "" },
    });
  }
  const bd = loadSfBudgetBreakdown(year);
  for (const d of (bd?.departments.spending ?? [])
    .filter((d) => d.org_group_code === dept.org_group_code && d.code !== dept.code)
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, 5)) {
    rows.push({
      href: `/usa/san-francisco/budget/dept/${deptSlug(d.code)}?year=${year}`,
      label: d.display_name ?? d.label,
      sub: `Same service area${dept.org_group_label ? ` (${dept.org_group_label})` : ""}, FY${year}`,
      amount: { v: fmtUsdCompact(d.total_usd), u: "" },
    });
  }
  rows.push({ href: "/usa/san-francisco/budget", label: "The San Francisco budget", sub: "Every department, service area and spending type" });
  return { title: "See also", sub: "This department elsewhere on the site, and its neighbours in the budget.", rows };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const dept = loadSfDeptFiche(slug, year);
  if (!dept) {
    return { title: { absolute: "Department not found" }, robots: { index: false } };
  }
  return answerMetadata(budgetDeptAnswer(dept, year), `/usa/san-francisco/budget/dept/${slug}`, "en");
}

export default async function SfDeptPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const dept = loadSfDeptFiche(slug, year);
  if (!dept) return notFound();

  const title = dept.display_name ?? dept.label;

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link
              href={`/usa/san-francisco/budget?year=${year}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              ← San Francisco · Budget FY{year}
            </Link>
          </div>
          <h1 className="fx-page-title">{title}</h1>
          <p className="fx-page-lede">
            Department {dept.code} · {dept.org_group_label ?? dept.org_group_code}
            {dept.spending ? <> · {fmtUsdCompact(dept.spending.total_usd)} adopted (FY{year})</> : null}
          </p>
          <p className="fx-page-lede fx-answer">{budgetDeptAnswer(dept, year).answer}</p>
          <PageJsonLd title={budgetDeptAnswer(dept, year).title} description={budgetDeptAnswer(dept, year).answer} path={`/usa/san-francisco/budget/dept/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfDeptFiche d={dept} />
        <RelatedLinks block={sfDeptRelated(dept, slug, year)} />
      </div>
    </main>
  );
}
