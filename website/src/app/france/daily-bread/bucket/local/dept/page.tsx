import type { Metadata } from "next";

import { renderDrilldownPage } from "@/lib/render-drilldown-page";
import { readLocale } from "@/lib/seo";

const BASE_PATH = "/ville/paris/daily-bread";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const title =
    locale === "en"
      ? "Departmental level — Daily Bread · France Open Data"
      : "Niveau départemental — Daily Bread · France Open Data";
  const canonical = `${BASE_PATH}/bucket/local/dept`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneDeptOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params: Promise.resolve({}),
    searchParams,
    voice: "perso",
    basePath: BASE_PATH,
    isDrawer: false,
    kind: "local-scope",
    localScope: "dept",
  });
}
