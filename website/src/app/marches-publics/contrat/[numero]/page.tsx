import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, ContratFiche } from "@/components/fusion";
import { MarchesBackKicker, ContratLede, ContratTitleFallback } from "@/components/fusion/EntityPageHeaders";
import { loadContrat, loadContratRanking, loadMarcheVulgarization, loadSirene } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";

type Params = { numero: string };

// NOTE: server-side metadata is FR-canonical because locale lives in
// localStorage (client-only, no cookie/header). EN users see French meta
// until a query-string locale mechanism is added.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { numero } = await params;
  const c = loadContrat(numero);
  if (!c) return { title: "Contrat introuvable — France Open Data", robots: { index: false } };
  const canonical = `/marches-publics/contrat/${c.numero}`;
  const title = `${c.objet.slice(0, 60)} — Marché ${c.numero} · France Open Data`;
  const description = `Contrat ${c.numero} notifié en ${c.year} à ${c.fournisseur}. Enveloppe max ${c.montantMax.toLocaleString("fr-FR")} €.`;
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
      <Footer />
    </div>
  );
}
