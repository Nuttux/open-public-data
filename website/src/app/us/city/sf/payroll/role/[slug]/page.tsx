import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayrollRoleFiche from "@/components/us/SfPayrollRoleFiche";
import { loadSfPayrollRole, sfPayrollRoleSlugs } from "@/lib/us/sf-payroll-entities";
import { answerMetadata } from "@/lib/seo/page-answer";
import { payrollRoleAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfPayrollRoleRelated } from "@/lib/us/sf-related";

type Params = { slug: string };

/**
 * Full-page fallback for a job-code fiche — the rung below a display family.
 * In-app clicks are intercepted by the root-level drawer at
 * app/@drawer/(...)us/city/sf/payroll/role/[slug].
 */

export function generateStaticParams(): Params[] {
  return sfPayrollRoleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfPayrollRole(slug);
  if (!d) return { title: { absolute: "Job code not found" }, robots: { index: false } };
  return answerMetadata(payrollRoleAnswer(d), `/us/city/sf/payroll/role/${slug}`, "en");
}

export default async function SfPayrollRolePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollRole(slug);
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
          <h1 className="fx-page-title">{d.label}</h1>
          <p className="fx-page-lede">A job code, grouped under {d.family}</p>
          <p className="fx-page-lede fx-answer">{payrollRoleAnswer(d).answer}</p>
          <PageJsonLd title={payrollRoleAnswer(d).title} description={payrollRoleAnswer(d).answer} path={`/us/city/sf/payroll/role/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayrollRoleFiche d={d} />
        <RelatedLinks block={sfPayrollRoleRelated(d)} />
      </div>
    </main>
  );
}
