import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfDeptFiche from "@/components/us/SfDeptFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfDeptFiche,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };
type SP = { year?: string };

/** Full-page fallback for the SF department fiche (hard loads / no-JS —
 *  the root-level drawer intercepts soft navigations). */

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
  const name = dept.display_name ?? dept.label;
  return {
    title: `${name} — San Francisco budget FY${year}`,
    description: `${name}: adopted budget by spending type, offsets and adopted-vs-executed — San Francisco fiscal year ${year}.`,
    alternates: { canonical: `/us/city/sf/budget/dept/${slug}` },
  };
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
              href={`/us/city/sf/budget?year=${year}`}
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
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfDeptFiche d={dept} />
      </div>
    </main>
  );
}
