import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, ChapitreFiche } from "@/components/fusion";
import { loadChapitre } from "@/lib/fusion-data";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const c = loadChapitre(slug);
  if (!c) return { title: "Chapitre introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${c.label} — Investissements ${c.year} · France Open Data`,
    description: `Investissements de la Ville de Paris dans le chapitre ${c.label}, exercice ${c.year}. ${c.nbProjets} projets, ${c.total.toLocaleString("fr-FR")} € au total.`,
    alternates: { canonical: `/investissements/chapitre/${c.slug}` },
  };
}

export default async function ChapitrePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const chap = loadChapitre(slug);
  if (!chap) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/investissements" style={{ color: "var(--ocre)" }}>← Investissements</Link>
          </div>
          <h1 className="fx-page-title">
            {chap.label}
          </h1>
          <p className="fx-page-lede">
            Investissements municipaux · Exercice {chap.year} · {chap.nbProjets} projets recensés.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ChapitreFiche chap={chap} />
      </div>
      <Footer />
    </div>
  );
}
