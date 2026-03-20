/**
 * Root Layout Component for Paris Budget Dashboard
 * 
 * Provides:
 * - HTML document structure with dark theme
 * - Google Inter font loaded via Next.js font optimization
 * - Global CSS styles
 * - Metadata for SEO
 * - Navigation globale
 * - Glossary provider & drawer (contextual budget term definitions)
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import GlossaryShell from "@/components/GlossaryShell";
import AnalyticsProvider from "@/components/AnalyticsProvider";

/**
 * Inter font configuration
 * Variable font for optimal loading and flexibility
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Page metadata for SEO and social sharing
 */
export const metadata: Metadata = {
  title: "Données Lumières — Open data Paris en clair",
  description:
    "Budget, subventions, marchés publics, logements sociaux, investissements : explorez les données ouvertes de la Ville de Paris en visualisations interactives.",
  keywords: [
    "Paris",
    "open data",
    "budget",
    "finances publiques",
    "subventions",
    "marchés publics",
    "logements sociaux",
    "investissements",
    "visualisation",
    "données ouvertes",
  ],
  authors: [{ name: "Données Lumières" }],
  openGraph: {
    title: "Données Lumières — Open data Paris en clair",
    description:
      "Budget, subventions, marchés publics, logements sociaux, investissements : explorez les données ouvertes de la Ville de Paris en visualisations interactives.",
    type: "website",
    locale: "fr_FR",
  },
};

/**
 * Viewport configuration for responsive design
 * viewportFit: 'cover' enables env(safe-area-inset-*) for iPhone X+ notch/home bar
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

/**
 * Root layout wrapper
 * Applies font class, dark theme, navigation, and glossary provider
 * to the entire application
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-slate-950 text-slate-100`}>
        <AnalyticsProvider>
          <GlossaryShell>
            <Navbar />
            {/*
              pb-24 sur mobile compense la barre de navigation fixe en bas (~56px + safe area).
              md:pb-0 retire ce padding sur desktop où la nav est en haut.
            */}
            <div className="pb-24 md:pb-0">
              {children}
            </div>
          </GlossaryShell>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
