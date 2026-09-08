import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfCategoryFiche from "@/components/us/SfCategoryFiche";
import { loadSfCategory, sfCategorySlugs } from "@/lib/us/sf-spending";
import { loadSfCategoryLinks } from "@/lib/us/sf-category-links";
import { answerMetadata } from "@/lib/seo/page-answer";
import { categoryAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";

type Params = { slug: string };

/**
 * Full-page fallback for a spending-category fiche — the SF analogue of
 * /contracts/type/[slug]. In-app clicks are intercepted by the root-level
 * drawer at app/@drawer/(...)us/city/sf/who-gets-paid/category/[slug].
 */

export function generateStaticParams(): Params[] {
  return sfCategorySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfCategory(slug);
  if (!d) return { title: { absolute: "Category not found" }, robots: { index: false } };
  return answerMetadata(categoryAnswer(d), `/us/city/sf/who-gets-paid/category/${slug}`, "en");
}

export default async function SfCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug } = await params;
  const { year } = await searchParams;
  const requestedFy = year && /^\d{4}$/.test(year) ? Number(year) : undefined;
  const d = loadSfCategory(slug, requestedFy);
  if (!d) return notFound();
  const { vendorSlugMap, deptHrefs } = loadSfCategoryLinks();

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/who-gets-paid" style={{ textDecoration: "none", color: "inherit" }}>
              ← San Francisco · Payees
            </Link>
          </div>
          <h1 className="fx-page-title">{d.label}</h1>
          <p className="fx-page-lede">A spending category in the City&rsquo;s payment ledger</p>
          <p className="fx-page-lede fx-answer">{categoryAnswer(d).answer}</p>
          <PageJsonLd title={categoryAnswer(d).title} description={categoryAnswer(d).answer} path={`/us/city/sf/who-gets-paid/category/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfCategoryFiche d={d} vendorSlugMap={vendorSlugMap} deptHrefs={deptHrefs} />
      </div>
    </main>
  );
}
