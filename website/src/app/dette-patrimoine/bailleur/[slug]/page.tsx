import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, BailleurFiche } from "@/components/fusion";
import { loadBailleur } from "@/lib/fusion-data";
import { fmtBillions, fmtMillions } from "@/lib/fmt";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const b = loadBailleur(slug);
  if (!b) return { title: "Bailleur introuvable — France Open Data", robots: { index: false } };
  const capital = b.garanties
    ? b.garanties.capital_restant >= 1e9
      ? `${fmtBillions(b.garanties.capital_restant)} Md € garantis`
      : `${fmtMillions(b.garanties.capital_restant, 0)} M € garantis`
    : "bailleur social parisien";
  return {
    title: `${b.name} — Bailleur · France Open Data`,
    description: `${b.name} : ${capital} par la Ville de Paris.`,
    alternates: { canonical: `/dette-patrimoine/bailleur/${encodeURIComponent(b.slug)}` },
  };
}

export default async function BailleurPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const bailleur = loadBailleur(slug);
  if (!bailleur) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-kicker-mono" style={{ marginBottom: 10 }}>
            {bailleur.type ? `Bailleur · ${bailleur.type}` : "Bénéficiaire · garantie d'emprunt"}
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            {bailleur.name}
          </h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <BailleurFiche bailleur={bailleur} />
      </div>
      <Footer />
    </div>
  );
}
