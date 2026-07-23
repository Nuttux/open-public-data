import type { Metadata } from "next";
import "./fusion.css";

import { loadLandingStats } from "@/lib/fusion-data";
import { getAllPosts, type BlogPostMeta } from "@/lib/blog";
import { SITE_URL, readLocale } from "@/lib/seo";
import LandingClient from "./LandingClient";

// Curation éditoriale — 3 articles mis en avant sur la landing.
// Ordre = ordre d'affichage. Mix hook + scoop + data cred.
const LANDING_FEATURED_SLUGS = [
  "top-10-associations-subventionnees-paris",
  "regle-or-communes-article-l-1612-4",
  "jo-2024-anatomie-pic-livraison",
] as const;

// Brand-level, not city-specific: qipu.org is the front door to a platform that
// spans cities and countries, so the root metadata leads with the tagline rather
// than any one city. (Per-city pages set their own Paris/SF/etc. metadata.)
const OG_FR = {
  title: "L'argent public, rendu lisible.",
  description:
    "Suivez l'argent public, de sa source à sa destination — budget, marchés, subventions, dette, sourcés et vérifiables, en licence ouverte.",
};
const OG_EN = {
  title: "Public money, made legible.",
  description:
    "Follow public money from where it comes from to where it goes — budgets, contracts, grants and debt, all sourced, verifiable and open.",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const og = locale === "en" ? OG_EN : OG_FR;
  return {
    metadataBase: new URL(SITE_URL),
    title: og.title,
    description: og.description,
    alternates: {
      canonical: "/",
      languages: { "fr-FR": "/", "en-US": "/" },
    },
    openGraph: {
      type: "website",
      siteName: "Qipu",
      title: og.title,
      description: og.description,
      url: SITE_URL,
      locale: locale === "en" ? "en_US" : "fr_FR",
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title: og.title,
      description: og.description,
    },
  };
}

export default function LandingPage() {
  const stats = loadLandingStats();
  const all = getAllPosts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const posts: BlogPostMeta[] = LANDING_FEATURED_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((p): p is BlogPostMeta => !!p);
  return <LandingClient stats={stats} posts={posts} />;
}
