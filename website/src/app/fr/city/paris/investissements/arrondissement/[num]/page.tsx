import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer, ArrondissementFiche } from "@/components/fusion";
import { InvestBackKicker, ArrInvestTitleAndLede } from "@/components/fusion/EntityPageHeaders";
import LieuxLies from "@/components/fusion/LieuxLies";
import { loadArrondissement } from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { readLocale } from "@/lib/seo";

type Params = { num: string };

const sufFr = (n: number) => (n === 1 ? "er" : "ᵉ");
const sufEn = (n: number) => {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { num } = await params;
  const locale = await readLocale();
  const arrNum = parseInt(num, 10);
  const a = loadArrondissement(arrNum);
  if (!a) {
    return {
      title: locale === "en" ? "Arrondissement not found — France Open Data" : "Arrondissement introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/fr/city/paris/investissements/arrondissement/${a.arr}`;
  const arrLabel = locale === "en"
    ? `${a.arr}${sufEn(a.arr)} arrondissement`
    : `${a.arr}${sufFr(a.arr)} arrondissement`;
  const totalFmt = a.total.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const title = locale === "en"
    ? `${arrLabel} — Paris investments ${a.year} · France Open Data`
    : `${arrLabel} — Investissements ${a.year} · France Open Data`;
  const description = locale === "en"
    ? `Investment projects in Paris's ${arrLabel}, fiscal year ${a.year}. ${a.nbProjets} projects, €${totalFmt} total.`
    : `Projets d'investissement dans le ${arrLabel} de Paris, exercice ${a.year}. ${a.nbProjets} projets, ${totalFmt} € au total.`;
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

export default async function ArrondissementPage({ params }: { params: Promise<Params> }) {
  const { num } = await params;
  const arrNum = parseInt(num, 10);
  const arr = loadArrondissement(arrNum);
  if (!arr) return notFound();
  const locale = await readLocale();

  // Lieux couverts dans cet arrondissement — rattachement déterministe (pas de
  // juge) : l'arrondissement est la seule clé partagée sûre lieu↔section.
  const lieuxArr = loadLieuxIndex()
    .filter((l) => l.arrondissement === arrNum)
    .sort((a, b) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0) || (a.depuis ?? 9999) - (b.depuis ?? 9999));
  const arrLabel = `${arrNum}${arrNum === 1 ? (locale === "en" ? "st" : "er") : (locale === "en" ? "th" : "e")}`;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <InvestBackKicker />
          <ArrInvestTitleAndLede arr={arr.arr} year={arr.year} nbProjets={arr.nbProjets} />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ArrondissementFiche arr={arr} />
        <LieuxLies
          lieux={lieuxArr}
          title={locale === "en" ? `Places in the ${arrLabel}` : `Lieux du ${arrLabel}`}
          intro={locale === "en"
            ? "Places in this district with their own fiche — deliberations, archives and public money."
            : "Lieux de cet arrondissement dotés d’une fiche — délibérations, archives et argent public."}
          locale={locale}
        />
      </div>
      </main>
      <Footer />
    </div>
  );
}
