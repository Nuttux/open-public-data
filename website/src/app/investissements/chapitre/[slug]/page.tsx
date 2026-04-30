import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, ChapitreFiche } from "@/components/fusion";
import { InvestBackKicker, ChapitreInvestLede } from "@/components/fusion/EntityPageHeaders";
import { loadChapitre } from "@/lib/fusion-data";

type Params = { slug: string };

// NOTE: server-side metadata is FR-canonical (no locale detection at request time).
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const c = loadChapitre(slug);
  if (!c) return { title: "Chapitre introuvable — France Open Data", robots: { index: false } };
  const canonical = `/investissements/chapitre/${c.slug}`;
  const title = `${c.label} — Investissements ${c.year} · France Open Data`;
  const description = `Investissements de la Ville de Paris dans le chapitre ${c.label}, exercice ${c.year}. ${c.nbProjets} projets, ${c.total.toLocaleString("fr-FR")} € au total.`;
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
      locale: "fr_FR",
      alternateLocale: ["en_US"],
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
      <Footer />
    </div>
  );
}
