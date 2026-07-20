import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import ThemeFiche from "@/components/fusion/ThemeFiche";
import { SubventionsBackKicker } from "@/components/fusion/EntityPageHeaders";
import { DataLabel } from "@/components/fusion/DataLabel";
import { loadThemeSubventions } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";
import { trLabel } from "@/lib/label-translate";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const f = loadThemeSubventions(slug);
  if (!f) {
    return {
      title: locale === "en" ? "Theme not found — France Open Data" : "Thématique introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/fr/city/paris/subventions/theme/${f.slug}`;
  const themeLabel = trLabel(f.theme, locale);
  const totalM = Math.round(f.total / 1e6);
  const title = locale === "en"
    ? `${themeLabel} — Paris grants ${f.year} · France Open Data`
    : `${f.theme} — Subventions Paris ${f.year} · France Open Data`;
  const description = locale === "en"
    ? `${f.nbBeneficiaires} beneficiaries, ${f.nbSubventions} grants for a total of €${totalM}M in the ${themeLabel} theme.`
    : `${f.nbBeneficiaires} bénéficiaires, ${f.nbSubventions} subventions pour un total de ${totalM} M € dans la thématique ${f.theme}.`;
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

export default async function ThemePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadThemeSubventions(slug);
  if (!fiche) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header fx-page-header--fiche">
        <div className="fx-wrap">
          <SubventionsBackKicker />
          <h1 className="fx-page-title"><DataLabel value={fiche.theme} /></h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ThemeFiche fiche={fiche} />
      </div>
      </main>
      <Footer />
    </div>
  );
}
