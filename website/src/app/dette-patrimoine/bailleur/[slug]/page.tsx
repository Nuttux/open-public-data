import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, BailleurFiche } from "@/components/fusion";
import { BailleurKickerText } from "@/components/fusion/EntityPageHeaders";
import { loadBailleur } from "@/lib/fusion-data";
import { fmtBillions, fmtMillions } from "@/lib/fmt";
import { readLocale } from "@/lib/seo";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const b = loadBailleur(slug);
  if (!b) {
    return {
      title: locale === "en" ? "Operator not found — France Open Data" : "Bailleur introuvable — France Open Data",
      robots: { index: false },
    };
  }
  let capital: string;
  if (b.garanties) {
    if (locale === "en") {
      capital = b.garanties.capital_restant >= 1e9
        ? `€${fmtBillions(b.garanties.capital_restant)}Bn guaranteed`
        : `€${fmtMillions(b.garanties.capital_restant, 0)}M guaranteed`;
    } else {
      capital = b.garanties.capital_restant >= 1e9
        ? `${fmtBillions(b.garanties.capital_restant)} Md € garantis`
        : `${fmtMillions(b.garanties.capital_restant, 0)} M € garantis`;
    }
  } else {
    capital = locale === "en" ? "Paris social-housing operator" : "bailleur social parisien";
  }
  const canonical = `/dette-patrimoine/bailleur/${encodeURIComponent(b.slug)}`;
  const title = locale === "en"
    ? `${b.name} — Operator · France Open Data`
    : `${b.name} — Bailleur · France Open Data`;
  const description = locale === "en"
    ? `${b.name}: ${capital} by the Ville de Paris.`
    : `${b.name} : ${capital} par la Ville de Paris.`;
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
      locale: locale === "en" ? "en_US" : "fr_FR",
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
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
