import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import PosteFiche from "@/components/fusion/PosteFiche";
import { loadBudgetPoste } from "@/lib/fusion-data";

type Params = { slug: string };
type SP = { year?: string };

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
  return {
    title: `${p.label} — Budget ${p.year} · France Open Data`,
    description: `${p.label} — ${p.kind === "depense" ? "dépense" : "recette"} du budget de Paris pour l'exercice ${p.year}. ${p.subPostes.length} sous-postes détaillés.`,
    alternates: { canonical: `/budget/poste/${p.slug}` },
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

  const kindLabel = poste.kind === "depense" ? "Dépense" : "Recette";

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href={year ? `/budget?year=${year}` : "/budget"} style={{ color: "var(--ocre)" }}>
              ← Budget
            </Link>
          </div>
          <h1 className="fx-page-title">{poste.label}</h1>
          <p className="fx-page-lede">
            {kindLabel} · Exercice {poste.year} · {poste.subPostes.length} sous-postes recensés.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <PosteFiche poste={poste} />
      </div>
      <Footer />
    </div>
  );
}
