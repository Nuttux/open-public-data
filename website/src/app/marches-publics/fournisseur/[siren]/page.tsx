import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, FournisseurFiche } from "@/components/fusion";
import { MarchesBackKicker, FournisseurLede } from "@/components/fusion/EntityPageHeaders";
import { loadFournisseur, loadSirene } from "@/lib/fusion-data";

type Params = { siren: string };

// NOTE: server-side metadata is FR-canonical because locale lives in
// localStorage (client-only). EN users see French meta until a
// query-string locale mechanism is added.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { siren } = await params;
  const f = loadFournisseur(siren);
  if (!f) return { title: "Fournisseur introuvable — France Open Data", robots: { index: false } };
  const canonical = `/marches-publics/fournisseur/${f.siret || f.siren}`;
  const title = `${f.nom} — Fournisseur · France Open Data`;
  const description = `${f.nom} : ${f.contratCount} contrats, cumul ${f.totalAmount.toLocaleString("fr-FR")} € avec la Ville de Paris.`;
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
