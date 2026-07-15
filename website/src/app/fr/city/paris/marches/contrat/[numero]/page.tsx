import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer, ContratFiche } from "@/components/fusion";
import { MarchesBackKicker, ContratLede, ContratTitleFallback } from "@/components/fusion/EntityPageHeaders";
import { loadContrat, loadContratRanking, loadMarcheVulgarization, loadSirene } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";
import { normalizeObjet } from "@/lib/objet-normalizer";

type Params = { numero: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { numero } = await params;
  const locale = await readLocale();
  const c = loadContrat(numero);
  if (!c) {
    return {
      title: locale === "en" ? "Contract not found — France Open Data" : "Contrat introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/fr/city/paris/marches/contrat/${c.numero}`;
  // Prefer EN object name when available (vulgarization_marches_en.json)
  const v = loadMarcheVulgarization(c.numero);
  const objetSnippet = locale === "en"
    ? (v?.objet_clair_en || v?.objet_clair || c.objet).slice(0, 60)
    : (v?.objet_clair || c.objet).slice(0, 60);
  const title = locale === "en"
    ? `${objetSnippet} — Contract ${c.numero} · France Open Data`
    : `${objetSnippet} — Marché ${c.numero} · France Open Data`;
  const amountFmt = c.montantMax.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const description = locale === "en"
    ? `Contract ${c.numero} notified in ${c.year} to ${c.fournisseur}. Max envelope €${amountFmt}.`
    : `Contrat ${c.numero} notifié en ${c.year} à ${c.fournisseur}. Enveloppe max ${amountFmt} €.`;
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

export default async function ContratPage({ params }: { params: Promise<Params> }) {
  const { numero } = await params;
  const contrat = loadContrat(numero);
  if (!contrat) return notFound();

  const vulgarization = loadMarcheVulgarization(contrat.numero);
  const siren = contrat.fournisseurSiret && contrat.fournisseurSiret.length >= 9
    ? contrat.fournisseurSiret.slice(0, 9)
    : null;
  const fournisseurSirene = siren ? loadSirene(siren) : null;
  const ranking = loadContratRanking(contrat.numero, contrat.year, contrat.nature, contrat.montantMax);

  // h1 keeps proper-noun data (objet_clair / normalizeObjet output) — already
  // FR but data-driven, not template text. Fallback uses a translation key.
  const titleText = vulgarization?.objet_clair || normalizeObjet(contrat.objet);

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <MarchesBackKicker />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {titleText || <ContratTitleFallback />}
          </h1>
          <ContratLede
            numero={contrat.numero}
            year={contrat.year}
            nature={contrat.nature}
            multiAttributaire={contrat.multiAttributaire}
            fournisseur={contrat.fournisseur}
          />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ContratFiche
          contrat={contrat}
          vulgarization={vulgarization}
          fournisseurSirene={fournisseurSirene}
          ranking={ranking}
        />
      </div>
      </main>
      <Footer />
    </div>
  );
}
