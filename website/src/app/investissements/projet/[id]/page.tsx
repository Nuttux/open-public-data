import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import ProjetFiche from "@/components/fusion/ProjetFiche";
import { InvestBackKicker, ProjetLede } from "@/components/fusion/EntityPageHeaders";
import { loadProjet, resolveProjetPhoto } from "@/lib/fusion-data";

type Params = { id: string };

// NOTE: server-side metadata is FR-canonical because locale lives in
// localStorage (client-only). EN users see French meta until a
// query-string locale mechanism is added.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const p = loadProjet(id);
  if (!p) return { title: "Projet introuvable — France Open Data", robots: { index: false } };
  const canonical = `/investissements/projet/${encodeURIComponent(p.id)}`;
  const title = `${p.name.slice(0, 60)} — Projet · France Open Data`;
  const description = `Projet d'investissement ${p.year} · ${p.montant.toLocaleString("fr-FR")} € · ${p.chapitre}.`;
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

export default async function ProjetPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const projet = loadProjet(id);
  if (!projet) return notFound();
  const photo = resolveProjetPhoto(projet.id, projet.name);

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <InvestBackKicker />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {projet.name}
          </h1>
          <ProjetLede year={projet.year} chapitre={projet.chapitre} montant={projet.montant} />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ProjetFiche projet={projet} photo={photo} />
      </div>
      <Footer />
    </div>
  );
}
