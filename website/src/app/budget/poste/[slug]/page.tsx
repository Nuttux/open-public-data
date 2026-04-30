import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import PosteFiche from "@/components/fusion/PosteFiche";
import { BudgetBackKicker, PosteLede } from "@/components/fusion/EntityPageHeaders";
import { loadBudgetPoste } from "@/lib/fusion-data";

type Params = { slug: string };
type SP = { year?: string };

// NOTE: server-side metadata is FR-canonical (no locale detection at request time).
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : undefined;
  const p = loadBudgetPoste(slug, year);
  if (!p) return { title: "Poste introuvable — France Open Data", robots: { index: false } };
  const canonical = `/budget/poste/${p.slug}`;
  const title = `${p.label} — Budget ${p.year} · France Open Data`;
  const description = `${p.label} — ${p.kind === "depense" ? "dépense" : "recette"} du budget de Paris pour l'exercice ${p.year}. ${p.subPostes.length} sous-postes détaillés.`;
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
      locale: "fr_FR",
      alternateLocale: ["en_US"],
    },
  };
}

export default async function PostePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : undefined;
  const poste = loadBudgetPoste(slug, year);
  if (!poste) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <BudgetBackKicker href={year ? `/budget?year=${year}` : "/budget"} />
          <h1 className="fx-page-title">{poste.label}</h1>
          <PosteLede
            kind={poste.kind}
            year={poste.year}
            nbSousPostes={poste.subPostes.length}
          />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <PosteFiche poste={poste} />
      </div>
      <Footer />
    </div>
  );
}
