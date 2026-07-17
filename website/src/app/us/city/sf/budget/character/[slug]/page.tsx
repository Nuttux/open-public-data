import type { Metadata } from "next";
import Link from "next/link";
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
  return {
    title: { absolute: `${c.label} — San Francisco budget FY${year}` },
    description: `${c.label}: ${c.side} category of the San Francisco adopted budget, fiscal year ${year}, with its department breakdown.`,
    alternates: { canonical: `/us/city/sf/budget/character/${slug}` },
  };
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
              href={`/us/city/sf/budget?year=${year}`}
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
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfCharacterFiche c={c} />
      </div>
    </main>
  );
}
