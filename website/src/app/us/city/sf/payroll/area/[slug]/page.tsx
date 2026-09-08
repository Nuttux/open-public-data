import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayrollAreaFiche from "@/components/us/SfPayrollAreaFiche";
import { loadSfPayrollArea, sfPayrollAreaSlugs } from "@/lib/us/sf-payroll-entities";
import { answerMetadata } from "@/lib/seo/page-answer";
import { payrollAreaAnswer } from "@/lib/us/sf-answers";

type Params = { slug: string };

/**
 * Full-page fallback for a service-area payroll fiche — the entity behind each
 * segment of the composition bar. In-app clicks are intercepted by the
 * root-level drawer at app/@drawer/(...)us/city/sf/payroll/area/[slug].
 */

export function generateStaticParams(): Params[] {
  return sfPayrollAreaSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfPayrollArea(slug);
  if (!d) return { title: { absolute: "Service area not found" }, robots: { index: false } };
  return answerMetadata(payrollAreaAnswer(d), `/us/city/sf/payroll/area/${slug}`, "en");
}

export default async function SfPayrollAreaPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfPayrollArea(slug);
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
            A service area — how the City groups its departments
          </p>
          <p className="fx-page-lede fx-answer">{payrollAreaAnswer(d).answer}</p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayrollAreaFiche d={d} />
      </div>
    </main>
  );
}
