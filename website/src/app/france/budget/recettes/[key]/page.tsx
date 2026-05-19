import type { Metadata } from "next";

import { renderRecettePage } from "@/lib/render-recette-fiche";
import { loadRecettesApu } from "@/lib/recettes-apu";
import { readLocale } from "@/lib/seo";

type Params = { key: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const locale = await readLocale();
  const data = loadRecettesApu();
  let title = locale === "en" ? "Public revenue — France Open Data" : "Recette publique — France Open Data";
  if (data) {
    for (const code of ["S1311", "S1313", "S1314"] as const) {
      const found = data.institutions[code].items.find(
        (it) => it.key === decoded,
      );
      if (found) {
        const label = locale === "en" ? found.label_en : found.label_fr;
        title = `${label} — Recettes · Budget national · France Open Data`;
        break;
      }
    }
    if (decoded === "ue_fonds_recus") {
      title =
        locale === "en"
          ? "EU funds received — France Open Data"
          : "Fonds européens reçus — France Open Data";
    }
  }
  const canonical = `/france/budget/recettes/${encodeURIComponent(decoded)}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneRecettePage({
  params,
}: {
  params: Promise<Params>;
}) {
  return renderRecettePage({ params, isDrawer: false });
}
