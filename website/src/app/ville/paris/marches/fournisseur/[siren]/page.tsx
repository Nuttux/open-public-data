import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer, FournisseurFiche } from "@/components/fusion";
import { MarchesBackKicker, FournisseurLede } from "@/components/fusion/EntityPageHeaders";
import { loadFournisseur, loadSirene } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";

type Params = { siren: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { siren } = await params;
  const locale = await readLocale();
  const f = loadFournisseur(siren);
  if (!f) {
    return {
      title: locale === "en" ? "Supplier not found — France Open Data" : "Fournisseur introuvable — France Open Data",
      robots: { index: false },
    };
  }
  // Canonical URL = SIREN (9 chars) — la fiche agrège tous les SIRETs du
  // même SIREN, donc l'URL stable est le SIREN, pas le SIRET du premier
  // établissement rencontré.
  const canonical = `/ville/paris/marches/fournisseur/${f.siren || f.siret}`;
  const amountFmt = f.totalAmount.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const title = locale === "en"
    ? `${f.nom} — Supplier · France Open Data`
    : `${f.nom} — Fournisseur · France Open Data`;
  const description = locale === "en"
    ? `${f.nom}: ${f.contratCount} contracts, total €${amountFmt} with the Ville de Paris.`
    : `${f.nom} : ${f.contratCount} contrats, cumul ${amountFmt} € avec la Ville de Paris.`;
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

export default async function FournisseurPage({ params }: { params: Promise<Params> }) {
  const { siren } = await params;
  const fournisseur = loadFournisseur(siren);
  if (!fournisseur) return notFound();

  const sirene = loadSirene(fournisseur.siren);

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <MarchesBackKicker />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 52px)" }}>
            {fournisseur.nom}
          </h1>
          <FournisseurLede
            contratCount={fournisseur.contratCount}
            yearsActive={fournisseur.yearsActive}
            totalAmount={fournisseur.totalAmount}
          />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <FournisseurFiche fournisseur={fournisseur} sirene={sirene} />
      </div>
      <Footer />
    </div>
  );
}
