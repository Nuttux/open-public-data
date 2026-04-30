import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, BailleurFiche } from "@/components/fusion";
import { BailleurKickerText } from "@/components/fusion/EntityPageHeaders";
import { loadBailleur } from "@/lib/fusion-data";
import { fmtBillions, fmtMillions } from "@/lib/fmt";

type Params = { slug: string };

// NOTE: server-side metadata is FR-canonical (no locale detection at request time).
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const b = loadBailleur(slug);
  if (!b) return { title: "Bailleur introuvable — France Open Data", robots: { index: false } };
  const capital = b.garanties
    ? b.garanties.capital_restant >= 1e9
      ? `${fmtBillions(b.garanties.capital_restant)} Md € garantis`
      : `${fmtMillions(b.garanties.capital_restant, 0)} M € garantis`
    : "bailleur social parisien";
  const canonical = `/dette-patrimoine/bailleur/${encodeURIComponent(b.slug)}`;
  const title = `${b.name} — Bailleur · France Open Data`;
  const description = `${b.name} : ${capital} par la Ville de Paris.`;
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
      type: "profile",
      locale: "fr_FR",
      alternateLocale: ["en_US"],
    },
  };
}

export default async function BailleurPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const bailleur = loadBailleur(slug);
  if (!bailleur) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-kicker-mono" style={{ marginBottom: 10 }}>
            <BailleurKickerText type={bailleur.type} />
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            {bailleur.name}
          </h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <BailleurFiche bailleur={bailleur} />
      </div>
      <Footer />
    </div>
  );
}
