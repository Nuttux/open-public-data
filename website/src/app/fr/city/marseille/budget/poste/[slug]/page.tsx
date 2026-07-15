import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import PosteFiche from "@/components/fusion/PosteFiche";
import { BudgetBackKicker, PosteLede } from "@/components/fusion/EntityPageHeaders";
import { loadBudgetPoste } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";
import { trLabel } from "@/lib/label-translate";

type Params = { slug: string };
type SP = { year?: string };

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const locale = await readLocale();
  const year = sp.year ? Number(sp.year) : undefined;
  const p = loadBudgetPoste(slug, year, "marseille");
  if (!p) {
    return {
      title: locale === "en" ? "Item not found — France Open Data" : "Poste introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/fr/city/marseille/budget/poste/${p.slug}`;
  const labelEn = trLabel(p.label, locale);
  const kindLabel = locale === "en"
    ? (p.kind === "depense" ? "expense" : "revenue")
    : (p.kind === "depense" ? "dépense" : "recette");
  const title = locale === "en"
    ? `${labelEn} — Marseille budget ${p.year} · France Open Data`
    : `${p.label} — Budget Marseille ${p.year} · France Open Data`;
  const description = locale === "en"
    ? `${labelEn} — Marseille budget ${kindLabel} for fiscal year ${p.year}. ${p.subPostes.length} sub-items detailed.`
    : `${p.label} — ${kindLabel} du budget de Marseille pour l'exercice ${p.year}. ${p.subPostes.length} sous-postes détaillés.`;
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
    openGraph: {
      title,
      description,
      type: "article",
      locale: locale === "en" ? "en_US" : "fr_FR",
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
    },
  };
}

export default async function PostePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : undefined;
  const poste = loadBudgetPoste(slug, year, "marseille");
  if (!poste) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <BudgetBackKicker href={year ? `/fr/city/marseille/budget?year=${year}` : "/fr/city/marseille/budget"} />
          <h1 className="fx-page-title">{poste.label}</h1>
          <PosteLede
            kind={poste.kind}
            year={poste.year}
            nbSousPostes={poste.subPostes.length}
          />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <PosteFiche poste={poste} />
      </div>
      </main>
      <Footer />
    </div>
  );
}
