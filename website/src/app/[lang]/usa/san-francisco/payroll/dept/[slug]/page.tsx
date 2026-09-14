import type { Metadata } from "next";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayrollDeptFiche from "@/components/us/SfPayrollDeptFiche";
import { loadSfPayrollDept, sfPayrollDeptSlugs } from "@/lib/us/sf-payroll-entities";
import { answerMetadata } from "@/lib/seo/page-answer";
import { payrollDeptAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfPayrollDeptRelated } from "@/lib/us/sf-related";

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
  return answerMetadata(payrollDeptAnswer(d), `/usa/san-francisco/payroll/dept/${slug}`, "en");
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
            <Link href="/usa/san-francisco/payroll" style={{ color: "inherit" }}>
              ← San Francisco · Payroll
            </Link>
          </div>
          <h1 className="fx-page-title">{d.name}</h1>
          <p className="fx-page-lede">
            A city department, on the payroll — {d.organizationGroup}
          </p>
          <p className="fx-page-lede fx-answer">{payrollDeptAnswer(d).answer}</p>
          <PageJsonLd title={payrollDeptAnswer(d).title} description={payrollDeptAnswer(d).answer} path={`/usa/san-francisco/payroll/dept/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayrollDeptFiche d={d} />
        <RelatedLinks block={sfPayrollDeptRelated(d)} />
      </div>
    </main>
  );
}
