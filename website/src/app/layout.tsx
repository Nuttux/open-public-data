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
import AnalyticsProvider from "@/components/AnalyticsProvider";
import { LocaleProvider } from "@/lib/localeContext";
import SearchModal from "@/components/fusion/SearchModal";
import { SITE_URL, SITE_NAME, organizationJsonLd, websiteJsonLd, readLocale } from "@/lib/seo";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Root metadata — title template + defaults inherited by every route.
 * Per-route files override title/description/path via their own export.
 */
const DEFAULT_TITLE = "France Open Data — Open data Paris en clair";
const DEFAULT_DESCRIPTION =
  "Budget, subventions, marchés publics, logements sociaux, investissements : explorez les données ouvertes de la Ville de Paris et d'une vingtaine de grandes villes françaises en visualisations interactives.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
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
    "villes françaises",
    "DGFiP",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: "/",
    languages: {
      "fr-FR": "/",
      "en-US": "/",
    },
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
    locale: "fr_FR",
    alternateLocale: ["en_US"],
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  category: "Open data",
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
export default async function RootLayout({
  children,
  drawer,
}: Readonly<{
  children: React.ReactNode;
  drawer: React.ReactNode;
}>) {
  const initialLocale = await readLocale();
  const skipLabel = initialLocale === 'en' ? 'Skip to main content' : 'Aller au contenu principal';
  return (
    <html lang={initialLocale === 'en' ? 'en' : 'fr'}>
      <head>
        {/* Plausible Analytics — alternative privacy-friendly à PostHog,
            CNIL-exempt par construction. Active uniquement si
            NEXT_PUBLIC_PLAUSIBLE_DOMAIN est set. */}
        {PLAUSIBLE_DOMAIN ? (
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.outbound-links.js"
            strategy="afterInteractive"
          />
        ) : null}
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* RGAA 12.7 — skip-to-content link, first focusable element */}
        <a href="#main-content" className="skip-to-content">{skipLabel}</a>
        {/* GEO: structured data for AI search engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
        />
        <AnalyticsProvider>
          <LocaleProvider initialLocale={initialLocale}>
            {children}
            {drawer}
            <SearchModal />
          </LocaleProvider>
        </AnalyticsProvider>
        {/* Vercel Speed Insights — Web Vitals (LCP, CLS, INP) en prod. */}
        <SpeedInsights />
        {/* Vercel Analytics — page views cookieless. */}
        <Analytics />
      </body>
    </html>
  );
}
