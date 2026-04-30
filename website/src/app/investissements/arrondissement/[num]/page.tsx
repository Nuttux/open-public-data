import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, ArrondissementFiche } from "@/components/fusion";
import { InvestBackKicker, ArrInvestTitleAndLede } from "@/components/fusion/EntityPageHeaders";
import { loadArrondissement } from "@/lib/fusion-data";

type Params = { num: string };

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

// NOTE: server-side metadata is FR-canonical (no locale detection at request time).
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { num } = await params;
  const arrNum = parseInt(num, 10);
  const a = loadArrondissement(arrNum);
  if (!a) return { title: "Arrondissement introuvable — France Open Data", robots: { index: false } };
  const canonical = `/investissements/arrondissement/${a.arr}`;
  const title = `${a.arr}${suf(a.arr)} arrondissement — Investissements ${a.year} · France Open Data`;
  const description = `Projets d'investissement dans le ${a.arr}${suf(a.arr)} arrondissement de Paris, exercice ${a.year}. ${a.nbProjets} projets, ${a.total.toLocaleString("fr-FR")} € au total.`;
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

export default async function ArrondissementPage({ params }: { params: Promise<Params> }) {
  const { num } = await params;
  const arrNum = parseInt(num, 10);
  const arr = loadArrondissement(arrNum);
  if (!arr) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <InvestBackKicker />
          <ArrInvestTitleAndLede arr={arr.arr} year={arr.year} nbProjets={arr.nbProjets} />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ArrondissementFiche arr={arr} />
      </div>
      <Footer />
    </div>
  );
}
