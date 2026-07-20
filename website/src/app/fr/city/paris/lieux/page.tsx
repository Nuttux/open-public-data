import type { Metadata } from "next";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import LieuxExplorer from "@/components/fusion/LieuxExplorer";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { readLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const title = locale === "en" ? "Places · France Open Data" : "Lieux · France Open Data";
  const description = locale === "en"
    ? "Pools, theatres, parks: for each place, the Conseil de Paris deliberations, municipal bulletin archives back to 1882, subsidies and investments — every fact linked to its source."
    : "Piscines, théâtres, parcs : pour chaque lieu, les délibérations du Conseil de Paris, les archives du Bulletin municipal depuis 1882, subventions et investissements — chaque fait relié à sa source.";
  return {
    title,
    description,
    alternates: { canonical: "/fr/city/paris/lieux" },
    openGraph: { title, description, type: "website" },
  };
}

export default async function LieuxPage() {
  const lieux = loadLieuxIndex();
  const locale = await readLocale();
  const argentTotal = lieux.reduce((sum, l) => sum + (l.argent_total_eur ?? 0), 0);
  const plusAncien = lieux.reduce<number | null>(
    (min, l) => (l.depuis && (min === null || l.depuis < min) ? l.depuis : min),
    null,
  );
  const fmtM = (n: number) => (n / 1e6).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 });

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <PageIntro
          title={locale === "en" ? "Places" : "Lieux"}
          lede={
            locale === "en"
              ? "Pools, theatres, parks: for each place, what the Conseil de Paris decided, what the municipal bulletin recorded, what the City pays — every fact linked to its source."
              : "Piscines, théâtres, parcs : pour chaque lieu, ce que le Conseil de Paris a décidé, ce que le Bulletin municipal a consigné, ce que la Ville paie — chaque fait relié à sa source."
          }
          stats={
            <>
              <IntroStat value={lieux.length} label={locale === "en" ? "places" : "lieux"} />
              {argentTotal > 0 && (
                <IntroStat
                  value={fmtM(argentTotal)}
                  unit="M€"
                  label={locale === "en" ? "public money identified" : "d’argent public identifié"}
                />
              )}
              {plusAncien && (
                <IntroStat
                  value={plusAncien}
                  label={locale === "en" ? "archives since" : "archives depuis"}
                />
              )}
            </>
          }
        />

        <section className="fx-section">
          <div className="fx-wrap">
            <LieuxExplorer lieux={lieux} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
