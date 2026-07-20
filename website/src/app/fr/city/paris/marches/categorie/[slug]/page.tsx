import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import CategorieMarcheFiche from "@/components/fusion/CategorieMarcheFiche";
import { MarchesBackKicker } from "@/components/fusion/EntityPageHeaders";
import { DataLabel } from "@/components/fusion/DataLabel";
import { loadMarcheCategorie } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";
import { trLabel } from "@/lib/label-translate";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const f = loadMarcheCategorie(slug);
  if (!f) {
    return {
      title: locale === "en" ? "Category not found — France Open Data" : "Catégorie introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/fr/city/paris/marches/categorie/${f.slug}`;
  const categoryLabel = trLabel(f.category, locale);
  const totalM = Math.round(f.total / 1e6);
  const title = locale === "en"
    ? `${categoryLabel} — Paris public contracts ${f.year} · France Open Data`
    : `${f.category} — Marchés publics Paris ${f.year} · France Open Data`;
  const description = locale === "en"
    ? `${f.nbContrats} contracts for a total of €${totalM}M in the ${categoryLabel} category.`
    : `${f.nbContrats} contrats pour un total de ${totalM} M € dans la catégorie ${f.category}.`;
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

export default async function CategoriePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadMarcheCategorie(slug);
  if (!fiche) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header fx-page-header--fiche">
        <div className="fx-wrap">
          <MarchesBackKicker />
          <h1 className="fx-page-title"><DataLabel value={fiche.category} /></h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <CategorieMarcheFiche fiche={fiche} />
      </div>
      </main>
      <Footer />
    </div>
  );
}
