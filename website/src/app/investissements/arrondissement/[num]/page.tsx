import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../../../fusion.css";

import { Navbar, Footer, ArrondissementFiche } from "@/components/fusion";
import { loadArrondissement } from "@/lib/fusion-data";

type Params = { num: string };

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { num } = await params;
  const arrNum = parseInt(num, 10);
  const a = loadArrondissement(arrNum);
  if (!a) return { title: "Arrondissement introuvable — France Open Data", robots: { index: false } };
  return {
    title: `${a.arr}${suf(a.arr)} arrondissement — Investissements ${a.year} · France Open Data`,
    description: `Projets d'investissement dans le ${a.arr}${suf(a.arr)} arrondissement de Paris, exercice ${a.year}. ${a.nbProjets} projets, ${a.total.toLocaleString("fr-FR")} € au total.`,
    alternates: { canonical: `/investissements/arrondissement/${a.arr}` },
  };
}

export default async function ArrondissementPage({ params }: { params: Promise<Params> }) {
  const { num } = await params;
  const arrNum = parseInt(num, 10);
  const arr = loadArrondissement(arrNum);
  if (!arr) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/investissements" style={{ color: "var(--ocre)" }}>← Investissements</Link>
          </div>
          <h1 className="fx-page-title">
            {arr.arr}{suf(arr.arr)} <em>arrondissement</em>
          </h1>
          <p className="fx-page-lede">
            Investissements municipaux · Exercice {arr.year} · {arr.nbProjets} projets recensés.
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <ArrondissementFiche arr={arr} />
      </div>
      <Footer />
    </div>
  );
}
