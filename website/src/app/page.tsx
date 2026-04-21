import type { Metadata } from "next";
import "./fusion.css";

import { loadLandingStats } from "@/lib/fusion-data";
import LandingClient from "./LandingClient";

const SITE_URL = "https://franceopendata.fr";
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
    images: [
      {
        url: "/og/landing.png",
        width: 1200,
        height: 630,
        alt: "France Open Data — où va l'argent public",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: ["/og/landing.png"],
  },
};

export default function LandingPage() {
  const stats = loadLandingStats();
  return <LandingClient stats={stats} />;
}
