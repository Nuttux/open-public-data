import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import CategorieMarcheFiche from "@/components/fusion/CategorieMarcheFiche";
import { loadMarcheCategorie } from "@/lib/fusion-data";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const f = loadMarcheCategorie(slug);
  if (!f) return { title: "Catégorie introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${f.category} — Marchés publics Paris ${f.year} · France Open Data`,
    description: `${f.nbContrats} contrats pour un total de ${Math.round(f.total / 1e6)} M € dans la catégorie ${f.category}.`,
    alternates: { canonical: `/marches-publics/categorie/${f.slug}` },
  };
}

export default async function CategoriePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadMarcheCategorie(slug);
  if (!fiche) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/marches-publics" style={{ color: "var(--ocre)" }}>← Marchés publics</Link>
          </div>
          <h1 className="fx-page-title">{fiche.category}</h1>
          <p className="fx-page-lede">
            {fiche.nbContrats} contrats · {fiche.nbTitulaires} titulaires distincts · exercice {fiche.year}.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <CategorieMarcheFiche fiche={fiche} />
      </div>
      <Footer />
    </div>
  );
}
