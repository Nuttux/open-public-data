import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPlaceFiche from "@/components/us/SfPlaceFiche";
import { loadSfPlace, loadSfPlacesIndex } from "@/lib/us/sf-places-data";

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
  return {
    title: `${place.name} — San Francisco`,
    description:
      place.summary_en ??
      `${place.name}: the city money that reaches it and the documents held at the Internet Archive.`,
    alternates: { canonical: `/us/city/sf/places/place/${slug}` },
    openGraph: { title: `${place.name} — San Francisco`, type: "article", locale: "en_US" },
  };
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
          <p className="fx-page-lede">
            {place.kind} · operated by the {place.owning_dept.name}
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPlaceFiche place={place} />
      </div>
    </main>
  );
}
