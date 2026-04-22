import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import { ArrondissementLogementFiche } from "@/components/fusion";
import { loadArrondissementLogement, PARIS_CENTRE_SLUG } from "@/lib/fusion-data";
import "../../../fusion.css";

type Params = { arr: string };

const isValidSlug = (s: string) => {
  if (s === PARIS_CENTRE_SLUG) return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 20;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { arr } = await params;
  if (!isValidSlug(arr)) return {};
  const data = loadArrondissementLogement(arr);
  if (!data) return {};
  return {
    title: `${data.label} · logement social — France Open Data`,
    description: `Opérations de logement social financées · ${data.label} · Paris.`,
    alternates: { canonical: `/logement-social/arrondissement/${data.slug}` },
  };
}

export default async function ArrondissementLogementPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { arr } = await params;
  if (!isValidSlug(arr)) return notFound();

  const data = loadArrondissementLogement(arr);
  if (!data) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">Logement social · {data.year}</div>
          <h1 className="fx-page-title">{data.label}</h1>
          <p className="fx-page-lede">
            <Link href="/logement-social">← Revenir à la vue d'ensemble</Link>
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <ArrondissementLogementFiche data={data} topN={data.projects.length} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
