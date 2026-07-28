import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayrollDeptFiche from "@/components/us/SfPayrollDeptFiche";
import { loadSfPayrollDept, sfPayrollDeptSlugs } from "@/lib/us/sf-payroll-entities";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Full-page fallback for a department's PAYROLL fiche. In-app clicks are
 * intercepted by the root-level drawer at
 * app/@drawer/(...)us/city/sf/payroll/dept/[slug].
 */

export function generateStaticParams(): Params[] {
  return sfPayrollDeptSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfPayrollDept(slug);
  if (!d) return { title: { absolute: "Department not found" }, robots: { index: false } };
  return {
    title: `${d.name} — San Francisco payroll`,
    description: `${d.name} paid ${d.latest.n_employees.toLocaleString("en-US")} people ${fmtUsdCompact(
      d.latest.total_compensation_usd,
    )} in FY${d.fiscalYear} — a median of ${fmtUsd(
      d.latest.median_total_comp_usd,
    )} per person, and what kinds of work that buys.`,
    alternates: { canonical: `/us/city/sf/payroll/dept/${slug}` },
  };
}

export default async function SfPayrollDeptPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollDept(slug);
  if (!d) return notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/payroll" style={{ color: "inherit" }}>
              ← San Francisco · Payroll
            </Link>
          </div>
          <h1 className="fx-page-title">{d.name}</h1>
          <p className="fx-page-lede">
            A city department, on the payroll — {d.organizationGroup}
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayrollDeptFiche d={d} />
      </div>
    </main>
  );
}
