import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, AssociationFiche } from "@/components/fusion";
import { AssoPageHeader } from "@/components/fusion/AssoKicker";
import { loadAssociation, loadSubventionVulgarization } from "@/lib/fusion-data";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const a = loadAssociation(slug);
  if (!a) return { title: "Association introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${a.name} — Association · France Open Data`,
    description: `${a.name} : ${a.subventionCount} subventions, cumul ${a.totalAmount.toLocaleString("fr-FR")} € de la Ville de Paris.`,
    alternates: { canonical: `/qui-recoit/association/${encodeURIComponent(a.name)}` },
  };
}

export default async function AssociationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const asso = loadAssociation(slug);
  if (!asso) return notFound();
  const vulgarization = loadSubventionVulgarization(asso.name);

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <AssoPageHeader
            theme={asso.theme}
            count={asso.subventionCount}
            firstYear={asso.yearsActive[0]}
            lastYear={asso.yearsActive[asso.yearsActive.length - 1]}
            totalM={asso.totalAmount / 1_000_000}
          />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            {asso.name}
          </h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <AssociationFiche asso={asso} vulgarization={vulgarization} />
      </div>
      <Footer />
    </div>
  );
}
