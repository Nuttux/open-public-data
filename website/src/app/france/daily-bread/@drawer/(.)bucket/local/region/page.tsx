import { renderDrilldownPage } from "@/lib/render-drilldown-page";

export default async function DrawerRegionOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params: Promise.resolve({}),
    searchParams,
    voice: "perso",
    basePath: "/ville/paris/daily-bread",
    isDrawer: true,
    kind: "local-scope",
    localScope: "region",
  });
}
