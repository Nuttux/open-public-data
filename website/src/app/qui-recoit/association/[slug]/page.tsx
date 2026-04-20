import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, AssociationFiche } from "@/components/fusion";
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
          <div className="fx-page-kicker">
            <Link href="/qui-recoit" style={{ color: "var(--ocre)" }}>← Subventions</Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            {asso.name}
          </h1>
          <p className="fx-page-lede">
            {asso.theme ?? "Thématique non classée"} · <b>{asso.subventionCount}</b> subventions
            {asso.yearsActive.length > 0 &&
              ` entre ${asso.yearsActive[0]} et ${asso.yearsActive[asso.yearsActive.length - 1]}`}
            · cumul <b>
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(asso.totalAmount / 1_000_000)} M €
            </b>.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <AssociationFiche asso={asso} vulgarization={vulgarization} />
      </div>
      <Footer />
    </div>
  );
}
