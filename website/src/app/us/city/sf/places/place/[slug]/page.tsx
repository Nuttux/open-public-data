import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPlaceFiche from "@/components/us/SfPlaceFiche";
import { loadSfPlace, loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { answerMetadata } from "@/lib/seo/page-answer";
import { placeAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfPlaceRelated } from "@/lib/us/sf-related";

type Params = { slug: string };

/** Full-page fallback for the SF place fiche (hard loads / no-JS —
 *  the root-level drawer intercepts soft navigations). */

export function generateStaticParams(): Params[] {
  return loadSfPlacesIndex().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = loadSfPlace(slug);
  if (!place) return { title: { absolute: "Place not found" }, robots: { index: false } };
  return answerMetadata(placeAnswer(place), `/us/city/sf/places/place/${slug}`, "en", { openGraph: { type: "article", locale: "en_US" } });
}

export default async function SfPlacePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const place = loadSfPlace(slug);
  if (!place) return notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/places" style={{ textDecoration: "none", color: "inherit" }}>
              ← San Francisco · Places
            </Link>
          </div>
          <h1 className="fx-page-title">{place.name}</h1>
          {/* Just the kind: the money block below says "Operated by the X"
              with the department's budget, staff count and a link to its
              fiche — the richer statement of the same fact. */}
          <p className="fx-page-lede">{place.kind}</p>
          <p className="fx-page-lede fx-answer">{placeAnswer(place).answer}</p>
          <PageJsonLd title={placeAnswer(place).title} description={placeAnswer(place).answer} path={`/us/city/sf/places/place/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPlaceFiche place={place} />
        <RelatedLinks block={sfPlaceRelated(place)} />
      </div>
    </main>
  );
}
