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
  title: "Budget Paris - Tableau de bord interactif",
  description:
    "Visualisation interactive des finances de la Ville de Paris. Explorez les recettes et dépenses budgétaires avec des graphiques Sankey et une carte interactive.",
  keywords: [
    "Paris",
    "budget",
    "finances publiques",
    "open data",
    "visualisation",
    "Sankey",
    "carte",
    "subventions",
    "logements sociaux",
  ],
  authors: [{ name: "Paris Budget Dashboard" }],
  openGraph: {
    title: "Budget Paris - Tableau de bord interactif",
    description: "Visualisation des finances de la Ville de Paris",
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
        <GlossaryShell>
          <Navbar />
          {/* 
            pb-20 sur mobile compense la barre de navigation fixe en bas (~56px + safe area).
            md:pb-0 retire ce padding sur desktop où la nav est en haut.
          */}
          <div className="pb-20 md:pb-0">
            {children}
          </div>
        </GlossaryShell>
      </body>
    </html>
  );
}
