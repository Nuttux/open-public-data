import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, ContratFiche } from "@/components/fusion";
import { loadContrat, loadContratRanking, loadMarcheVulgarization, loadSirene } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";

type Params = { numero: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { numero } = await params;
  const c = loadContrat(numero);
  if (!c) return { title: "Contrat introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${c.objet.slice(0, 60)} — Marché ${c.numero} · France Open Data`,
    description: `Contrat ${c.numero} notifié en ${c.year} à ${c.fournisseur}. Enveloppe max ${c.montantMax.toLocaleString("fr-FR")} €.`,
    alternates: { canonical: `/marches-publics/contrat/${c.numero}` },
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

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/marches-publics" style={{ color: "var(--ocre)" }}>
              ← Marchés publics
            </Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {vulgarization?.objet_clair || normalizeObjet(contrat.objet) || "Marché sans objet"}
          </h1>
          <p className="fx-page-lede">
            Marché <b>{contrat.numero}</b> · notifié en {contrat.year} · {contrat.nature.toLowerCase()}
            {contrat.multiAttributaire ? " · multi-attributaire" : ` · attribué à ${contrat.fournisseur}`}
          </p>
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
