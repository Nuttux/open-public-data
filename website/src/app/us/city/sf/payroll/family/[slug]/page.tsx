import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayrollFamilyFiche from "@/components/us/SfPayrollFamilyFiche";
import { loadSfPayrollFamily, sfPayrollFamilySlugs } from "@/lib/us/sf-payroll-family";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Full-page fallback for a job-family fiche. In-app clicks are intercepted
 * by the root-level drawer at
 * app/@drawer/(...)us/city/sf/payroll/family/[slug].
 */

export function generateStaticParams(): Params[] {
  return sfPayrollFamilySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfPayrollFamily(slug);
  if (!d) return { title: { absolute: "Job family not found" }, robots: { index: false } };
  return {
    title: `${d.family} — San Francisco city payroll`,
    description: `${d.family}: ${d.latest.n_employees.toLocaleString("en-US")} San Francisco city employees paid ${fmtUsdCompact(d.latest.total_compensation_usd)} in FY${d.fiscalYear}, the departments they work in and the job codes behind the family.`,
    alternates: { canonical: `/us/city/sf/payroll/family/${slug}` },
  };
}

export default async function SfPayrollFamilyPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollFamily(slug);
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
          <h1 className="fx-page-title">{d.family}</h1>
          <p className="fx-page-lede">A family of city jobs</p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayrollFamilyFiche d={d} />
      </div>
    </main>
  );
}
