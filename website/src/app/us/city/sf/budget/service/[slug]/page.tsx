import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfServiceFiche from "@/components/us/SfServiceFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfServiceFiche,
  type SfSide,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";
import { answerMetadata } from "@/lib/seo/page-answer";
import { budgetServiceAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfServiceRelated } from "@/lib/us/sf-related";

type Params = { slug: string };
type SP = { year?: string; side?: string };

/** Full-page fallback for the SF service-area fiche (hard loads / no-JS —
 *  the root-level drawer intercepts soft navigations). */

function parseSide(v: string | undefined): SfSide | undefined {
  return v === "revenue" ? "revenue" : v === "spending" ? "spending" : undefined;
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
  const s = loadSfServiceFiche(slug, year, parseSide(sp.side));
  if (!s) {
    return { title: { absolute: "Service area not found" }, robots: { index: false } };
  }
  return answerMetadata(budgetServiceAnswer(s, year), `/us/city/sf/budget/service/${slug}`, "en");
}

export default async function SfServicePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const s = loadSfServiceFiche(slug, year, parseSide(sp.side));
  if (!s) return notFound();

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
          <h1 className="fx-page-title">{s.label}</h1>
          <p className="fx-page-lede">
            Service area · {s.n_departments} departments · {fmtUsdCompact(s.total_usd)} adopted
            (FY{year})
          </p>
          <p className="fx-page-lede fx-answer">{budgetServiceAnswer(s, year).answer}</p>
          <PageJsonLd title={budgetServiceAnswer(s, year).title} description={budgetServiceAnswer(s, year).answer} path={`/us/city/sf/budget/service/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfServiceFiche s={s} />
        <RelatedLinks block={sfServiceRelated(s)} />
      </div>
    </main>
  );
}
