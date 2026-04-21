import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import ProjetFiche from "@/components/fusion/ProjetFiche";
import { loadProjet } from "@/lib/fusion-data";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const p = loadProjet(id);
  if (!p) return { title: "Projet introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${p.name.slice(0, 60)} — Projet · France Open Data`,
    description: `Projet d'investissement ${p.year} · ${p.montant.toLocaleString("fr-FR")} € · ${p.chapitre}.`,
    alternates: { canonical: `/investissements/projet/${encodeURIComponent(p.id)}` },
  };
}

export default async function ProjetPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const projet = loadProjet(id);
  if (!projet) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/investissements" style={{ color: "var(--ocre)" }}>← Investissements</Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {projet.name}
          </h1>
          <p className="fx-page-lede">
            Exercice {projet.year} · {projet.chapitre} · {projet.montant.toLocaleString("fr-FR")} €
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ProjetFiche projet={projet} />
      </div>
      <Footer />
    </div>
  );
}
