import type { Metadata } from "next";
import "../fusion.css";
import { listCities } from "@/lib/cities";
import { loadCommune } from "@/lib/commune-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CompareClient from "./CompareClient";

// Rendered per request: the language and the canonical follow the host (www = en, fr = fr);
// a build-time prerender served the English page with a www canonical on fr.qipu.org
// (and fails on the client's useSearchParams). The edge cache in next.config keeps it cheap.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Comparer les villes",
    description:
      "Compare jusqu'à 5 communes françaises côte à côte sur leurs finances : budget, dette, fiscalité. Cherche n'importe quelle commune parmi les 35 000.",
    en: {
      title: "Compare cities",
      description:
        "Compare up to 5 French cities side by side on their finances: budget, debt, taxation. Search any commune among 35,000.",
    },
    path: "/comparer",
  });
}

export default async function ComparerPage() {
  // Pre-load OFGL rich data for the top 10 (always shown as suggestions
  // and available without an API roundtrip).
  const topCities = listCities();
  const topData = topCities
    .map((c) => loadCommune(c.slug))
    .filter((d): d is NonNullable<typeof d> => d !== null);

  return <CompareClient topCities={topCities} topData={topData} />;
}
