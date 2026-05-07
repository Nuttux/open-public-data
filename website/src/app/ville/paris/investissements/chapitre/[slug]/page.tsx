import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer, ChapitreFiche } from "@/components/fusion";
import { InvestBackKicker, ChapitreInvestLede } from "@/components/fusion/EntityPageHeaders";
import { loadChapitre } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";
import { trLabel } from "@/lib/label-translate";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const c = loadChapitre(slug);
  if (!c) {
    return {
      title: locale === "en" ? "Chapter not found — France Open Data" : "Chapitre introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/ville/paris/investissements/chapitre/${c.slug}`;
  const labelEn = trLabel(c.label, locale);
  const totalFmt = c.total.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const title = locale === "en"
    ? `${labelEn} — Paris investments ${c.year} · France Open Data`
    : `${c.label} — Investissements ${c.year} · France Open Data`;
  const description = locale === "en"
    ? `Ville de Paris investments in the ${labelEn} chapter, fiscal year ${c.year}. ${c.nbProjets} projects, €${totalFmt} total.`
    : `Investissements de la Ville de Paris dans le chapitre ${c.label}, exercice ${c.year}. ${c.nbProjets} projets, ${totalFmt} € au total.`;
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

export default async function ChapitrePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const chap = loadChapitre(slug);
  if (!chap) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <InvestBackKicker />
          <h1 className="fx-page-title">{chap.label}</h1>
          <ChapitreInvestLede year={chap.year} nbProjets={chap.nbProjets} />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ChapitreFiche chap={chap} />
      </div>
      </main>
      <Footer />
    </div>
  );
}
