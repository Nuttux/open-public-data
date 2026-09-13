import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import CityFichePage from "@/components/us/city/CityFichePage";
import PageJsonLd from "@/components/seo/PageJsonLd";
import { sfCityPageRelated } from "@/lib/us/sf-related";
import { answerMetadata } from "@/lib/seo/page-answer";
import { cityPageAnswer, listStreetPages, streetPage } from "@/lib/us/sf-city-pages";

type Params = { slug: string };
const PREFIX = "/us/city/sf/the-city/street";

/** A street of the map, as a page of its own — see `sf-city-pages.ts`. */
export function generateStaticParams(): Params[] {
  return listStreetPages().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await streetPage(slug);
  if (!page) return { title: { absolute: "Street not found" }, robots: { index: false } };
  return answerMetadata(cityPageAnswer(page), `${PREFIX}/${slug}`, "en", {
    openGraph: { type: "article", locale: "en_US" },
  });
}

export default async function SfStreetPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const page = await streetPage(slug);
  if (!page) return notFound();
  const a = cityPageAnswer(page);
  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/the-city" style={{ textDecoration: "none", color: "inherit" }}>
              ← San Francisco · The city
            </Link>
          </div>
          <h1 className="fx-page-title">{page.name}</h1>
          <p className="fx-page-lede fx-answer">{a.answer}</p>
          <PageJsonLd
            title={a.title}
            description={a.answer}
            path={`${PREFIX}/${slug}`}
            locale="en"
            creator="City and County of San Francisco"
            spatialCoverage="San Francisco, California"
          />
        </div>
      </section>
      <CityFichePage page={page} related={await sfCityPageRelated(page)} />
    </main>
  );
}
