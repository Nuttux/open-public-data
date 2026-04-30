import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import ThemeFiche from "@/components/fusion/ThemeFiche";
import { SubventionsBackKicker, ThemeLede } from "@/components/fusion/EntityPageHeaders";
import { loadThemeSubventions } from "@/lib/fusion-data";

type Params = { slug: string };

// NOTE: server-side metadata is FR-canonical (no locale detection at request time).
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const f = loadThemeSubventions(slug);
  if (!f) return { title: "Thématique introuvable — France Open Data", robots: { index: false } };
  const canonical = `/qui-recoit/theme/${f.slug}`;
  const title = `${f.theme} — Subventions Paris ${f.year} · France Open Data`;
  const description = `${f.nbBeneficiaires} bénéficiaires, ${f.nbSubventions} subventions pour un total de ${Math.round(f.total / 1e6)} M € dans la thématique ${f.theme}.`;
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

export default async function ThemePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadThemeSubventions(slug);
  if (!fiche) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <SubventionsBackKicker />
          <h1 className="fx-page-title">{fiche.theme}</h1>
          <ThemeLede
            nbBeneficiaires={fiche.nbBeneficiaires}
            nbSubventions={fiche.nbSubventions}
            year={fiche.year}
          />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ThemeFiche fiche={fiche} />
      </div>
      <Footer />
    </div>
  );
}
