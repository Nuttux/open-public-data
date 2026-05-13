import type { Metadata } from "next";
import { Suspense } from "react";
import "@/app/fusion.css";

// La page utilise useSearchParams côté client + metadata dynamique à partir
// des query params → force le rendu à chaque requête pour éviter les 404
// RSC prefetch et assurer que generateMetadata reçoit bien les searchParams.
export const dynamic = "force-dynamic";

import { Navbar, Footer } from "@/components/fusion";
import StressTest from "@/components/fusion/StressTest";
import { loadPatrimoineData, loadPatrimoineStructure } from "@/lib/fusion-data";

type Search = Promise<{ t?: string; r?: string; i?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const sp = await searchParams;
  const og = new URLSearchParams();
  if (sp.t) og.set("t", sp.t);
  if (sp.r) og.set("r", sp.r);
  if (sp.i) og.set("i", sp.i);
  const ogQuery = og.toString();
  const ogImage = ogQuery ? `/api/og/stress?${ogQuery}` : "/api/og/stress";

  const canonical = ogQuery
    ? `/ville/paris/dette/stress-test?${ogQuery}`
    : "/ville/paris/dette/stress-test";

  return {
    title: "Paris peut-elle faire faillite ? — Stress-test · France Open Data",
    description:
      "Simulez vous-même les scénarios qui menaceraient la dette de Paris : taux d'intérêt, baisse des recettes, sur-investissement. Méthodologie Moody's/Fitch, données open data.",
    alternates: { canonical },
    openGraph: {
      title: "Paris peut-elle faire faillite ?",
      description:
        "Un simulateur pour tester vous-même la résilience budgétaire de la Ville, avec les données publiques et la méthode des agences de notation.",
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630, alt: "Stress-test dette Paris" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Paris peut-elle faire faillite ?",
      description:
        "Stress-test interactif — bougez les curseurs, voyez quand la dette bascule.",
      images: [ogImage],
    },
  };
}

export default async function StressTestPage() {
  const d = loadPatrimoineData();
  const structure = loadPatrimoineStructure(d.year);
  const tauxBaseline = structure?.structure_dette.taux.taux_fixe_moyen_pondere_pct ?? 2.4;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">Stress-test · soutenabilité de la dette</div>
          <h1 className="fx-page-title">
            Paris peut-elle <em>faire faillite</em> ?
          </h1>
          <p className="fx-page-lede">
            Techniquement non : une commune française ne peut pas être mise en liquidation.
            Mais elle peut se retrouver sous tutelle préfectorale si sa <b>capacité de
            désendettement</b> dépasse <b>12 ans</b>. Paris est à <b>{d.capaciteDesendettement.toFixed(1).replace(".", ",")} ans</b>.
            Bougez les curseurs ci-dessous pour voir ce qu'il faudrait pour que ça bascule.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <Suspense fallback={null}>
            <StressTest
              dette={d.detteFinanciere}
              capaciteBaseline={d.capaciteDesendettement}
              tauxBaseline={tauxBaseline}
              year={d.year}
              urlSync
            />
          </Suspense>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
