import type { ReactNode } from "react";
import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { CommuneNavProvider, type CommuneNav } from "@/components/CommuneNavContext";
import { datasetJsonLd, breadcrumbJsonLd } from "@/lib/seo";

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
  // Dans l'ordre des écrans de la page ville (bloc 2).
  if (caps.budget.nature) s.push("budget");
  if (caps.investissements) s.push("investissements");
  if (caps.evolution) s.push("evolution");
  if (caps.marches) s.push("marches");
  if (caps.comparaison) s.push("comparaison");
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

  // Dataset + Breadcrumb schema for every commune page. The site publishes
  // Dataset markup on a handful of Paris and Marseille hubs but on none of the
  // ~35k commune pages, which are the bulk of the corpus and the pages a
  // search or an AI engine is most likely to surface for "budget commune X".
  const commune = findCommuneByAny(slug);
  const rich = getCityOrNull(slug);
  const label = nom ?? slug;
  const where = commune
    ? `${commune.nom}, ${commune.dep_name}, France`
    : rich
      ? `${rich.nom}, France`
      : "France";
  const schemas = nom
    ? [
        datasetJsonLd({
          name: `${label} — finances locales`,
          description: `Budget, dette et fiscalité de la commune de ${label}, à partir des comptes publiés par la DGFiP et harmonisés par l'OFGL.`,
          path: `/fr/city/${slug}`,
          keywords: ["budget communal", "finances locales", "dette", "fiscalité", label],
          spatialCoverage: where,
          creator: "DGFiP / OFGL",
          license: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
        }),
        breadcrumbJsonLd([
          { name: "Qipu", path: "/" },
          { name: "Communes", path: "/comparer" },
          { name: label, path: `/fr/city/${slug}` },
        ]),
      ]
    : [];

  return (
    <CommuneNavProvider value={value}>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      {children}
    </CommuneNavProvider>
  );
}
