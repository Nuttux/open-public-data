import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, FournisseurFiche } from "@/components/fusion";
import { loadFournisseur, loadSirene } from "@/lib/fusion-data";

type Params = { siren: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { siren } = await params;
  const f = loadFournisseur(siren);
  if (!f) return { title: "Fournisseur introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${f.nom} — Fournisseur · France Open Data`,
    description: `${f.nom} : ${f.contratCount} contrats, cumul ${f.totalAmount.toLocaleString("fr-FR")} € avec la Ville de Paris.`,
    alternates: { canonical: `/marches-publics/fournisseur/${f.siret || f.siren}` },
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
          <div className="fx-page-kicker">
            <Link href="/marches-publics" style={{ color: "var(--ocre)" }}>
              ← Marchés publics
            </Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 52px)" }}>
            {fournisseur.nom}
          </h1>
          <p className="fx-page-lede">
            <b>{fournisseur.contratCount} contrats</b> notifiés par la Ville de Paris
            {fournisseur.yearsActive.length > 0 &&
              ` entre ${fournisseur.yearsActive[0]} et ${fournisseur.yearsActive[fournisseur.yearsActive.length - 1]}`}
            · cumul <b>
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(fournisseur.totalAmount / 1_000_000)} M €
            </b>.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <FournisseurFiche fournisseur={fournisseur} sirene={sirene} />
      </div>
      <Footer />
    </div>
  );
}
