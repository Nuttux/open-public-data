import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import LieuFiche from "@/components/fusion/LieuFiche";
import LieuxVoisins from "@/components/fusion/LieuxVoisins";
import Link from "next/link";
import { loadLieu, loadLieuxIndex } from "@/lib/lieux-data";
import { readLocale } from "@/lib/seo";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return loadLieuxIndex().map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const lieu = loadLieu(slug);
  if (!lieu) {
    return {
      title: locale === "en" ? "Place not found — France Open Data" : "Lieu introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const title = `${lieu.name} — ${locale === "en" ? lieu.kind_en : lieu.kind_fr} · France Open Data`;
  const description = locale === "en"
    ? `${lieu.name}: ${lieu.stats.n_lieu ?? 0} Conseil de Paris deliberations, municipal bulletin extracts back to 1882, city investments — every fact linked to its source.`
    : `${lieu.name} : ${lieu.stats.n_lieu ?? 0} délibérations du Conseil de Paris, extraits du Bulletin municipal depuis 1882, investissements de la Ville — chaque fait relié à sa source.`;
  const canonical = `/fr/city/paris/lieu/${slug}`;
  return {
    title,
    description,
    alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
    openGraph: { title, description, type: "article", locale: locale === "en" ? "en_US" : "fr_FR" },
  };
}

export default async function LieuPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const lieu = loadLieu(slug);
  if (!lieu) return notFound();
  const locale = await readLocale();
  const kind = locale === "en" ? lieu.kind_en : lieu.kind_fr;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-fiche-wrap">
          <nav className="fx-fiche-back">
            <Link href="/fr/city/paris/lieux" className="fx-row-link">← {locale === "en" ? "All places" : "Tous les lieux"}</Link>
          </nav>
          <div className="fx-page-kicker">
            {kind}
            {lieu.arrondissement > 0 ? ` · ${lieu.arrondissement}${lieu.arrondissement === 1 ? "er" : "e"}` : ""}
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(26px, 3.4vw, 40px)", margin: "4px 0 24px" }}>
            {lieu.name}
          </h1>
          <LieuFiche lieu={lieu} />
          <LieuxVoisins slug={lieu.slug} famille={lieu.famille} arrondissement={lieu.arrondissement} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
