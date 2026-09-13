import type { Metadata } from "next";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import MarseillePlacesExplorer from "@/components/marseille/MarseillePlacesExplorer";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { loadPlacesIndex } from "@/lib/marseille/marseille-places-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleLieuxHub } from "@/lib/seo/sections/marseille";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleLieuxHub()));
}

export default async function LieuxPage() {
  const places = loadPlacesIndex();
  const locale = await readLocale();
  const nbArr = new Set(places.map((p) => p.arrondissement).filter(Boolean)).size;

  return (
    <>
    <FrHubJsonLd hub={marseilleLieuxHub()} locale={locale} />
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <PageIntro
          title={locale === "en" ? "Places" : "Lieux"}
          lede={
            locale === "en"
              ? "Museums, libraries, parks, the stadium, monuments — a first selection of Marseille's public and heritage places, mapped. Each with a free-licence photo and a short factual note."
              : "Musées, bibliothèques, parcs, le stade, monuments — une première sélection des lieux publics et patrimoniaux de Marseille, cartographiés. Chacun avec une photo sous licence libre et une note factuelle."
          }
          stats={
            <>
              <IntroStat value={places.length} label={locale === "en" ? "places" : "lieux"} />
              {nbArr > 0 && (
                <IntroStat
                  value={nbArr}
                  label={locale === "en" ? "districts" : "arrondissements"}
                />
              )}
            </>
          }
        />

        <section className="fx-section">
          <div className="fx-wrap">
            <MarseillePlacesExplorer places={places} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
    </>
  );
}
