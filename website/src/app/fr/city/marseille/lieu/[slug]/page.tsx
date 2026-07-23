import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import MarseilleLieuFiche from "@/components/marseille/MarseilleLieuFiche";
import { loadPlace, loadPlacesIndex } from "@/lib/marseille/marseille-places-data";
import { readLocale } from "@/lib/seo";

type Params = { slug: string };

export function generateStaticParams() {
  return loadPlacesIndex().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const place = loadPlace(slug);
  if (!place) {
    return {
      title: locale === "en" ? "Place not found" : "Lieu introuvable",
      robots: { index: false },
    };
  }
  const canonical = `/fr/city/marseille/lieu/${place.slug}`;
  const kind = locale === "en" ? place.kind_en : place.kind_fr;
  const title = locale === "en"
    ? `${place.name} — Marseille · Qipu`
    : `${place.name} — Marseille · Qipu`;
  const description = locale === "en" ? place.desc_en : place.desc_fr;
  return {
    title,
    description: description || kind,
    alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
    openGraph: {
      title,
      description: description || kind,
      type: "article",
      images: place.photo ? [{ url: place.photo }] : undefined,
      locale: locale === "en" ? "en_US" : "fr_FR",
    },
  };
}

export default async function LieuPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const locale = await readLocale();
  const place = loadPlace(slug);
  if (!place) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">
              <Link href="/fr/city/marseille/lieux" style={{ color: "var(--ocre)" }}>
                ← {locale === "en" ? "Places" : "Lieux"}
              </Link>
            </div>
            <h1 className="fx-page-title">{place.name}</h1>
          </div>
        </section>
        <div className="fx-fiche-wrap">
          <MarseilleLieuFiche place={place} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
