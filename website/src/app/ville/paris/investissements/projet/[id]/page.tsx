import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import ProjetFiche from "@/components/fusion/ProjetFiche";
import { InvestBackKicker, ProjetLede } from "@/components/fusion/EntityPageHeaders";
import { loadProjet, resolveProjetPhoto } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";
import { trLabel } from "@/lib/label-translate";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await readLocale();
  const p = loadProjet(id);
  if (!p) {
    return {
      title: locale === "en" ? "Project not found — France Open Data" : "Projet introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const canonical = `/ville/paris/investissements/projet/${encodeURIComponent(p.id)}`;
  const projectName = locale === "en" && (p as { name_en?: string }).name_en
    ? (p as { name_en?: string }).name_en!
    : p.name;
  const title = locale === "en"
    ? `${projectName.slice(0, 60)} — Project · France Open Data`
    : `${projectName.slice(0, 60)} — Projet · France Open Data`;
  const amountFmt = p.montant.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const chapitreLabel = trLabel(p.chapitre, locale);
  const description = locale === "en"
    ? `Investment project ${p.year} · €${amountFmt} · ${chapitreLabel}.`
    : `Projet d'investissement ${p.year} · ${amountFmt} € · ${chapitreLabel}.`;
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

export default async function ProjetPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const projet = loadProjet(id);
  if (!projet) return notFound();
  const photo = resolveProjetPhoto(projet.id, projet.name);
  const locale = await readLocale();
  const displayName = locale === "en" && projet.name_en ? projet.name_en : projet.name;

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <InvestBackKicker />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {displayName}
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
