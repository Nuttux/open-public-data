/**
 * Root Layout Component for Paris Budget Dashboard
 * 
 * Provides:
 * - HTML document structure with dark theme
 * - Google Inter font loaded via Next.js font optimization
 * - Global CSS styles
 * - Metadata for SEO
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
    "Visualisation interactive des finances de la Ville de Paris. Explorez les recettes et dépenses budgétaires avec des graphiques Sankey détaillés.",
  keywords: [
    "Paris",
    "budget",
    "finances publiques",
    "open data",
    "visualisation",
    "Sankey",
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
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

/**
 * Root layout wrapper
 * Applies font class and dark theme to entire application
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
