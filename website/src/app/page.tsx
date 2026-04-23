import type { Metadata } from "next";
import "./fusion.css";

import { loadLandingStats } from "@/lib/fusion-data";
import { getAllPosts, type BlogPostMeta } from "@/lib/blog";
import { SITE_URL } from "@/lib/seo";
import LandingClient from "./LandingClient";

// Curation éditoriale — 3 articles mis en avant sur la landing.
// Ordre = ordre d'affichage. Mix hook + scoop + data cred.
const LANDING_FEATURED_SLUGS = [
  "top-10-associations-subventionnees-paris",
  "regle-or-communes-article-l-1612-4",
  "jo-2024-anatomie-pic-livraison",
] as const;

const OG_TITLE = "Où va l'argent public à Paris ? — France Open Data";
const OG_DESCRIPTION =
  "Les finances publiques françaises, rendues lisibles. Budget, dépenses, subventions, dette — sourcés, vérifiables, publiés en licence ouverte.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "France Open Data",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: SITE_URL,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

export default function LandingPage() {
  const stats = loadLandingStats();
  const all = getAllPosts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const posts: BlogPostMeta[] = LANDING_FEATURED_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((p): p is BlogPostMeta => !!p);
  return <LandingClient stats={stats} posts={posts} />;
}
