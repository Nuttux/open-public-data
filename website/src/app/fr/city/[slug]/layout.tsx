import type { ReactNode } from "react";
import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { CommuneNavProvider, type CommuneNav } from "@/components/CommuneNavContext";

/**
 * Provides commune-scoped navigation context to the chrome (Navbar +
 * ScopeDropdown) for every /fr/city/[slug]/* page. This is the dynamic route,
 * so it covers the ~35k national tail communes (and the rich cities served here
 * via CityClient); Paris and Marseille are separate static routes and are NOT
 * affected. The sections list is DATA-DERIVED from getCommuneCapabilities, so
 * the nav shows exactly the pages a commune has — never a Paris-shaped default
 * with links that 404.
 */

// Section order mirrors the on-page experience: budget lead, then the layers.
function sectionsForCommune(slug: string): string[] {
  const caps = getCommuneCapabilities(slug);
  const s: string[] = [];
  if (caps.budget.nature) s.push("budget");
  if (caps.comparaison) s.push("comparaison");
  if (caps.investissements) s.push("investissements");
  if (caps.marches) s.push("marches");
  if (caps.evolution) s.push("evolution");
  return s;
}

export default async function CityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sections = sectionsForCommune(slug);
  const nom = findCommuneByAny(slug)?.nom ?? getCityOrNull(slug)?.nom ?? null;
  // Only scope the chrome when the commune actually has national pages AND a
  // resolvable name; otherwise leave the default chrome untouched (value null).
  const value: CommuneNav | null =
    sections.length > 0 && nom ? { slug, nom, sections } : null;
  return <CommuneNavProvider value={value}>{children}</CommuneNavProvider>;
}
