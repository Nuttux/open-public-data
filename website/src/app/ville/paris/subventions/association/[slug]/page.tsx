import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer, AssociationFiche } from "@/components/fusion";
import { AssoPageHeader } from "@/components/fusion/AssoKicker";
import { loadAssociation, loadSubventionVulgarization, loadBeneficiaireGrounded } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const a = loadAssociation(slug);
  if (!a) {
    return {
      title: locale === "en" ? "Beneficiary not found — France Open Data" : "Association introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const amountFmt = a.totalAmount.toLocaleString(locale === "en" ? "en-GB" : "fr-FR");
  const title = locale === "en"
    ? `${a.name} — Beneficiary · France Open Data`
    : `${a.name} — Association · France Open Data`;
  const description = locale === "en"
    ? `${a.name}: ${a.subventionCount} grants, total €${amountFmt} from the Ville de Paris.`
    : `${a.name} : ${a.subventionCount} subventions, cumul ${amountFmt} € de la Ville de Paris.`;
  const canonical = `/ville/paris/subventions/association/${encodeURIComponent(a.name)}`;
  return {
    title,
    description,
    alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
    openGraph: {
      title,
      description,
      type: "article",
      locale: locale === "en" ? "en_US" : "fr_FR",
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
    },
  };
}

export default async function AssociationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const asso = loadAssociation(slug);
  if (!asso) return notFound();
  const vulgarization = loadSubventionVulgarization(asso.name);
  const grounded = loadBeneficiaireGrounded(asso.name);

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
        <AssociationFiche asso={asso} vulgarization={vulgarization} grounded={grounded} />
      </div>
      <Footer />
    </div>
  );
}
