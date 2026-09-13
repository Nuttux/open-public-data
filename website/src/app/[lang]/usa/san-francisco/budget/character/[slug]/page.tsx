import type { Metadata } from "next";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfCharacterFiche from "@/components/us/SfCharacterFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfCharacterFiche,
  type SfSide,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";
import { answerMetadata } from "@/lib/seo/page-answer";
import { budgetCharacterAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfCharacterRelated } from "@/lib/us/sf-related";

type Params = { slug: string };
type SP = { year?: string; side?: string };

/** Full-page fallback for the SF character fiche (hard loads / no-JS). */

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
  const c = loadSfCharacterFiche(slug, year, parseSide(sp.side));
  if (!c) {
    return { title: { absolute: "Budget category not found" }, robots: { index: false } };
  }
  return answerMetadata(budgetCharacterAnswer(c, year), `/usa/san-francisco/budget/character/${slug}`, "en");
}

export default async function SfCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const c = loadSfCharacterFiche(slug, year, parseSide(sp.side));
  if (!c) return notFound();

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
          <h1 className="fx-page-title">{c.label}</h1>
          <p className="fx-page-lede">
            {c.side === "spending" ? "Spending" : "Revenue"} type ·{" "}
            {fmtUsdCompact(c.total_usd)} adopted (FY{year})
          </p>
          <p className="fx-page-lede fx-answer">{budgetCharacterAnswer(c, year).answer}</p>
          <PageJsonLd title={budgetCharacterAnswer(c, year).title} description={budgetCharacterAnswer(c, year).answer} path={`/usa/san-francisco/budget/character/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfCharacterFiche c={c} />
        <RelatedLinks block={sfCharacterRelated(c)} />
      </div>
    </main>
  );
}
