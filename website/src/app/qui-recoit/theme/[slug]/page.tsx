import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import ThemeFiche from "@/components/fusion/ThemeFiche";
import { loadThemeSubventions } from "@/lib/fusion-data";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const f = loadThemeSubventions(slug);
  if (!f) return { title: "Thématique introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${f.theme} — Subventions Paris ${f.year} · France Open Data`,
    description: `${f.nbBeneficiaires} bénéficiaires, ${f.nbSubventions} subventions pour un total de ${Math.round(f.total / 1e6)} M € dans la thématique ${f.theme}.`,
    alternates: { canonical: `/qui-recoit/theme/${f.slug}` },
  };
}

export default async function ThemePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadThemeSubventions(slug);
  if (!fiche) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/qui-recoit" style={{ color: "var(--ocre)" }}>← Subventions</Link>
          </div>
          <h1 className="fx-page-title">{fiche.theme}</h1>
          <p className="fx-page-lede">
            {fiche.nbBeneficiaires} bénéficiaires · {fiche.nbSubventions} subventions · exercice {fiche.year}.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ThemeFiche fiche={fiche} />
      </div>
      <Footer />
    </div>
  );
}
