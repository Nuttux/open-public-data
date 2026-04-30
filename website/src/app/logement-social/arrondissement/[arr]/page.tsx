import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import { ArrondissementLogementFiche } from "@/components/fusion";
import { LogementArrKicker, LogementArrBackLink } from "@/components/fusion/EntityPageHeaders";
import { loadArrondissementLogement, PARIS_CENTRE_SLUG } from "@/lib/fusion-data";
import "../../../fusion.css";

type Params = { arr: string };

const isValidSlug = (s: string) => {
  if (s === PARIS_CENTRE_SLUG) return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 20;
};

// NOTE: server-side metadata is FR-canonical (no locale detection at request time).
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { arr } = await params;
  if (!isValidSlug(arr)) return {};
  const data = loadArrondissementLogement(arr);
  if (!data) return {};
  const canonical = `/logement-social/arrondissement/${data.slug}`;
  const title = `${data.label} · logement social — France Open Data`;
  const description = `Opérations de logement social financées · ${data.label} · Paris.`;
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
          <div className="fx-page-kicker">
            <LogementArrKicker year={data.year} />
          </div>
          <h1 className="fx-page-title">{data.label}</h1>
          <LogementArrBackLink />
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
