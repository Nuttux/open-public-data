import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayeeFiche from "@/components/us/SfPayeeFiche";
import { loadSfPayee, loadSfPayeesIndex } from "@/lib/us/sf-payees-data";
import { loadSfCategorySlugMap, loadSfDeptHrefs } from "@/lib/us/sf-category-links";
import { answerMetadata } from "@/lib/seo/page-answer";
import { payeeAnswer } from "@/lib/us/sf-answers";

type Params = { slug: string };

/** Full-page fallback for the SF payee fiche (hard loads / no-JS —
 *  the root-level drawer intercepts soft navigations). */

export function generateStaticParams(): Params[] {
  return loadSfPayeesIndex().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const payee = loadSfPayee(slug);
  if (!payee) return { title: { absolute: "Payee not found" }, robots: { index: false } };
  return answerMetadata(payeeAnswer(payee), `/us/city/sf/who-gets-paid/payee/${slug}`, "en");
}

export default async function SfPayeePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const payee = loadSfPayee(slug);
  if (!payee) return notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/who-gets-paid" style={{ textDecoration: "none", color: "inherit" }}>
              ← San Francisco · Payees
            </Link>
          </div>
          {/* No lede: the fiche's stat hero carries the total and the year
              span immediately below. Repeating them here printed the same two
              facts twice within one screen (Paris fiche rule — breadcrumb +
              title, then the KPI band carries the numbers ONCE). */}
          <h1 className="fx-page-title">{payee.name}</h1>
          <p className="fx-page-lede fx-answer">{payeeAnswer(payee).answer}</p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayeeFiche
          payee={payee}
          categorySlugs={loadSfCategorySlugMap()}
          deptHrefs={loadSfDeptHrefs()}
        />
      </div>
    </main>
  );
}
